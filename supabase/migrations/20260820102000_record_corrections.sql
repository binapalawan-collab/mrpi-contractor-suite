begin;

create or replace function private.prepare_worker_attendance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  worker_row public.workers;
  project_row public.projects;
  wage_reversal_allowed boolean :=
    coalesce(current_setting('app.wage_reversal', true), '') = 'on';
begin
  if current_user_id is null then
    raise exception 'Sesi pengguna tidak sah.';
  end if;

  if tg_op = 'UPDATE' and old.wage_payment_id is not null and not wage_reversal_allowed then
    if (to_jsonb(new) - array['notes', 'updated_at'])
      is distinct from (to_jsonb(old) - array['notes', 'updated_at']) then
      raise exception 'Kehadiran yang sudah dibayar tidak boleh diubah. Batalkan bayaran upah dahulu.';
    end if;
  end if;

  select worker.* into worker_row
  from public.workers as worker
  where worker.id = new.worker_id
    and worker.owner_user_id = current_user_id;

  if not found then
    raise exception 'Pekerja tidak ditemui.';
  end if;

  if new.project_id is not null then
    select project.* into project_row
    from public.projects as project
    where project.id = new.project_id
      and project.owner_user_id = current_user_id
      and project.company_id = worker_row.company_id;
    if not found then
      raise exception 'Projek tidak ditemui atau tidak sepadan dengan syarikat.';
    end if;
  end if;

  new.company_id := worker_row.company_id;
  new.owner_user_id := current_user_id;
  if tg_op = 'INSERT' then
    new.pay_type_snapshot := worker_row.pay_type;
    new.wage_payment_id := null;
  else
    new.pay_type_snapshot := old.pay_type_snapshot;
  end if;
  if new.pay_type_snapshot = 'daily' then
    new.daily_rate_snapshot := coalesce(new.daily_rate_snapshot, worker_row.default_daily_rate, 0);
  else
    new.daily_rate_snapshot := 0;
  end if;
  new.notes := coalesce(new.notes, '');
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.guard_project_expense_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  correction_allowed boolean :=
    coalesce(current_setting('app.expense_correction', true), '') = 'on';
begin
  if (new.project_id, new.company_id, new.owner_user_id, new.source_type,
      new.source_worker_wage_payment_id, new.source_worker_advance_id)
    is distinct from
     (old.project_id, old.company_id, old.owner_user_id, old.source_type,
      old.source_worker_wage_payment_id, old.source_worker_advance_id) then
    raise exception 'Sumber dan pemilikan expenses tidak boleh diubah.';
  end if;

  if pg_trigger_depth() = 1
    and not correction_allowed
    and (new.total_amount, new.paid_amount, new.status)
      is distinct from (old.total_amount, old.paid_amount, old.status) then
    raise exception 'Amaun dan status expenses dikawal oleh transaksi sistem.';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.correct_manual_project_expense(
  p_expense_id bigint,
  p_expense_date date,
  p_category text,
  p_description text,
  p_supplier_id bigint,
  p_notes text,
  p_items jsonb
)
returns public.project_expenses
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  expense_row public.project_expenses;
  item_row jsonb;
  item_total numeric(14, 2) := 0;
  item_order integer := 0;
begin
  if current_user_id is null then raise exception 'Sesi pengguna tidak sah.'; end if;

  select expense.* into expense_row
  from public.project_expenses as expense
  where expense.id = p_expense_id and expense.owner_user_id = current_user_id
  for update;
  if not found then raise exception 'Expenses tidak ditemui.'; end if;
  if expense_row.source_type <> 'manual' then
    raise exception 'Rekod daripada Workforce mesti dibetulkan dalam aplikasi Workforce.';
  end if;

  if p_category not in (
    'materials', 'labour', 'subcontractor', 'equipment', 'transport',
    'site', 'permit', 'utilities', 'other'
  ) then raise exception 'Kategori expenses tidak sah.'; end if;
  if length(btrim(coalesce(p_description, ''))) = 0 then
    raise exception 'Keterangan expenses mesti diisi.';
  end if;
  if p_supplier_id is not null and not exists (
    select 1 from public.expense_suppliers as supplier
    where supplier.id = p_supplier_id
      and supplier.company_id = expense_row.company_id
      and supplier.owner_user_id = current_user_id
  ) then raise exception 'Pembekal tidak ditemui.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Sekurang-kurangnya satu item expenses diperlukan.';
  end if;

  for item_row in select value from jsonb_array_elements(p_items)
  loop
    if length(btrim(coalesce(item_row ->> 'description', ''))) = 0
      or coalesce((item_row ->> 'quantity')::numeric, 0) <= 0
      or coalesce((item_row ->> 'unit_price')::numeric, -1) < 0 then
      raise exception 'Butiran item expenses tidak lengkap.';
    end if;
    item_total := item_total + round(
      (item_row ->> 'quantity')::numeric * (item_row ->> 'unit_price')::numeric,
      2
    );
  end loop;

  if item_total <= 0 then raise exception 'Jumlah expenses mesti melebihi RM0.'; end if;
  if item_total < expense_row.paid_amount then
    raise exception 'Jumlah baharu tidak boleh kurang daripada bayaran yang telah direkod.';
  end if;

  delete from public.project_expense_items as item
  where item.expense_id = expense_row.id;

  for item_row in select value from jsonb_array_elements(p_items)
  loop
    insert into public.project_expense_items (
      expense_id, project_id, company_id, owner_user_id, description,
      quantity, unit, unit_price, sort_order
    ) values (
      expense_row.id, expense_row.project_id, expense_row.company_id, current_user_id,
      btrim(item_row ->> 'description'), (item_row ->> 'quantity')::numeric,
      coalesce(nullif(btrim(item_row ->> 'unit'), ''), 'unit'),
      (item_row ->> 'unit_price')::numeric, item_order
    );
    item_order := item_order + 1;
  end loop;

  perform set_config('app.expense_correction', 'on', true);
  update public.project_expenses
  set expense_date = coalesce(p_expense_date, current_date),
      category = p_category,
      description = btrim(p_description),
      supplier_id = p_supplier_id,
      notes = coalesce(p_notes, ''),
      total_amount = item_total,
      status = case
        when paid_amount = 0 then 'unpaid'
        when paid_amount = item_total then 'paid'
        else 'partially_paid'
      end,
      updated_at = now()
  where id = expense_row.id
  returning * into expense_row;

  return expense_row;
end;
$$;

create or replace function public.delete_manual_project_expense(p_expense_id bigint)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  expense_row public.project_expenses;
  storage_paths text[];
begin
  if current_user_id is null then raise exception 'Sesi pengguna tidak sah.'; end if;

  select expense.* into expense_row
  from public.project_expenses as expense
  where expense.id = p_expense_id and expense.owner_user_id = current_user_id
  for update;
  if not found then raise exception 'Expenses tidak ditemui.'; end if;
  if expense_row.source_type <> 'manual' then
    raise exception 'Rekod daripada Workforce mesti dibetulkan dalam aplikasi Workforce.';
  end if;

  select coalesce(array_agg(attachment.storage_path), array[]::text[])
  into storage_paths
  from public.project_expense_attachments as attachment
  where attachment.expense_id = expense_row.id;

  delete from public.project_expense_payments where expense_id = expense_row.id;
  delete from public.project_expense_attachments where expense_id = expense_row.id;
  delete from public.project_expense_items where expense_id = expense_row.id;
  delete from public.project_expenses where id = expense_row.id;

  return storage_paths;
end;
$$;

create or replace function public.correct_manual_project_expense_payment(
  p_payment_id bigint,
  p_payment_date date,
  p_amount numeric,
  p_payment_method text,
  p_reference_no text,
  p_notes text
)
returns public.project_expense_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  payment_row public.project_expense_payments;
  expense_row public.project_expenses;
  other_payments numeric(14, 2);
begin
  if current_user_id is null then raise exception 'Sesi pengguna tidak sah.'; end if;

  select payment.* into payment_row
  from public.project_expense_payments as payment
  where payment.id = p_payment_id and payment.owner_user_id = current_user_id
  for update;
  if not found then raise exception 'Bayaran tidak ditemui.'; end if;

  select expense.* into expense_row
  from public.project_expenses as expense
  where expense.id = payment_row.expense_id and expense.owner_user_id = current_user_id
  for update;
  if expense_row.source_type <> 'manual' then
    raise exception 'Bayaran daripada Workforce mesti dibetulkan dalam aplikasi Workforce.';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amaun bayaran mesti melebihi RM0.'; end if;
  if p_payment_method not in ('cash', 'bank_transfer', 'cheque', 'card', 'other') then
    raise exception 'Kaedah bayaran tidak sah.';
  end if;

  select coalesce(sum(payment.amount), 0) into other_payments
  from public.project_expense_payments as payment
  where payment.expense_id = expense_row.id and payment.id <> payment_row.id;
  if other_payments + p_amount > expense_row.total_amount then
    raise exception 'Jumlah bayaran melebihi jumlah expenses.';
  end if;

  update public.project_expense_payments
  set payment_date = coalesce(p_payment_date, current_date),
      amount = p_amount,
      payment_method = p_payment_method,
      reference_no = nullif(btrim(p_reference_no), ''),
      notes = coalesce(p_notes, '')
  where id = payment_row.id
  returning * into payment_row;

  return payment_row;
end;
$$;

create or replace function public.delete_manual_project_expense_payment(p_payment_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  payment_row public.project_expense_payments;
  expense_row public.project_expenses;
begin
  if current_user_id is null then raise exception 'Sesi pengguna tidak sah.'; end if;

  select payment.* into payment_row
  from public.project_expense_payments as payment
  where payment.id = p_payment_id and payment.owner_user_id = current_user_id
  for update;
  if not found then raise exception 'Bayaran tidak ditemui.'; end if;

  select expense.* into expense_row
  from public.project_expenses as expense
  where expense.id = payment_row.expense_id and expense.owner_user_id = current_user_id
  for update;
  if expense_row.source_type <> 'manual' then
    raise exception 'Bayaran daripada Workforce mesti dibetulkan dalam aplikasi Workforce.';
  end if;

  delete from public.project_expense_payments where id = payment_row.id;
  return true;
end;
$$;

create or replace function public.delete_unpaid_worker_attendance(p_attendance_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  attendance_row public.worker_attendance;
begin
  if current_user_id is null then raise exception 'Sesi pengguna tidak sah.'; end if;

  select attendance.* into attendance_row
  from public.worker_attendance as attendance
  where attendance.id = p_attendance_id and attendance.owner_user_id = current_user_id
  for update;
  if not found then raise exception 'Rekod kehadiran tidak ditemui.'; end if;
  if attendance_row.wage_payment_id is not null then
    raise exception 'Kehadiran sudah dibayar. Batalkan bayaran upah dahulu.';
  end if;

  delete from public.worker_attendance where id = attendance_row.id;
  return true;
end;
$$;

create or replace function public.reverse_worker_wage_payment(p_wage_payment_id bigint)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  wage_row public.worker_wage_payments;
  storage_paths text[];
begin
  if current_user_id is null then raise exception 'Sesi pengguna tidak sah.'; end if;

  select wage.* into wage_row
  from public.worker_wage_payments as wage
  where wage.id = p_wage_payment_id and wage.owner_user_id = current_user_id
  for update;
  if not found then raise exception 'Bayaran upah tidak ditemui.'; end if;

  select coalesce(array_agg(attachment.storage_path), array[]::text[])
  into storage_paths
  from public.project_expense_attachments as attachment
  join public.project_expenses as expense on expense.id = attachment.expense_id
  where expense.source_worker_wage_payment_id = wage_row.id
    and expense.owner_user_id = current_user_id;

  delete from public.project_expense_payments as payment
  using public.project_expenses as expense
  where payment.expense_id = expense.id
    and expense.source_worker_wage_payment_id = wage_row.id
    and expense.owner_user_id = current_user_id;

  delete from public.project_expense_attachments as attachment
  using public.project_expenses as expense
  where attachment.expense_id = expense.id
    and expense.source_worker_wage_payment_id = wage_row.id
    and expense.owner_user_id = current_user_id;

  delete from public.project_expense_items as item
  using public.project_expenses as expense
  where item.expense_id = expense.id
    and expense.source_worker_wage_payment_id = wage_row.id
    and expense.owner_user_id = current_user_id;

  delete from public.project_expenses as expense
  where expense.source_worker_wage_payment_id = wage_row.id
    and expense.owner_user_id = current_user_id;

  perform set_config('app.wage_reversal', 'on', true);
  update public.worker_attendance
  set wage_payment_id = null, updated_at = now()
  where wage_payment_id = wage_row.id and owner_user_id = current_user_id;

  update public.worker_advances
  set applied_wage_payment_id = null
  where applied_wage_payment_id = wage_row.id and owner_user_id = current_user_id;

  delete from public.worker_wage_payments where id = wage_row.id;
  return storage_paths;
end;
$$;

revoke execute on function public.correct_manual_project_expense(bigint, date, text, text, bigint, text, jsonb)
  from public, anon;
revoke execute on function public.delete_manual_project_expense(bigint)
  from public, anon;
revoke execute on function public.correct_manual_project_expense_payment(bigint, date, numeric, text, text, text)
  from public, anon;
revoke execute on function public.delete_manual_project_expense_payment(bigint)
  from public, anon;
revoke execute on function public.delete_unpaid_worker_attendance(bigint)
  from public, anon;
revoke execute on function public.reverse_worker_wage_payment(bigint)
  from public, anon;

grant execute on function public.correct_manual_project_expense(bigint, date, text, text, bigint, text, jsonb)
  to authenticated;
grant execute on function public.delete_manual_project_expense(bigint)
  to authenticated;
grant execute on function public.correct_manual_project_expense_payment(bigint, date, numeric, text, text, text)
  to authenticated;
grant execute on function public.delete_manual_project_expense_payment(bigint)
  to authenticated;
grant execute on function public.delete_unpaid_worker_attendance(bigint)
  to authenticated;
grant execute on function public.reverse_worker_wage_payment(bigint)
  to authenticated;

comment on function public.correct_manual_project_expense(bigint, date, text, text, bigint, text, jsonb) is
  'Corrects an owner-scoped manual expense and replaces its items while preserving recorded payments.';
comment on function public.delete_manual_project_expense(bigint) is
  'Deletes an owner-scoped manual expense and returns receipt storage paths for cleanup.';
comment on function public.reverse_worker_wage_payment(bigint) is
  'Atomically removes a wage-generated expense, reopens attendance and advances, and deletes the wage payment.';

commit;
