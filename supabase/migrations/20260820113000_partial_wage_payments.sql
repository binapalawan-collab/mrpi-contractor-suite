begin;

alter table public.worker_attendance
  add column paid_wage_amount numeric(14, 2) not null default 0;

alter table public.worker_attendance
  add constraint worker_attendance_paid_wage_valid
    check (paid_wage_amount >= 0 and paid_wage_amount <= wage_amount),
  add constraint worker_attendance_project_identity_key
    unique (id, worker_id, project_id, company_id, owner_user_id);

create table public.worker_wage_payment_allocations (
  wage_payment_id bigint not null,
  attendance_id bigint not null,
  worker_id bigint not null,
  project_id bigint not null,
  company_id bigint not null,
  owner_user_id uuid not null,
  allocated_amount numeric(14, 2) not null,
  created_at timestamptz not null default now(),

  constraint worker_wage_payment_allocations_pkey
    primary key (wage_payment_id, attendance_id),
  constraint worker_wage_payment_allocations_payment_fkey
    foreign key (wage_payment_id, worker_id, project_id, company_id, owner_user_id)
    references public.worker_wage_payments (id, worker_id, project_id, company_id, owner_user_id)
    on delete cascade,
  constraint worker_wage_payment_allocations_attendance_fkey
    foreign key (attendance_id, worker_id, project_id, company_id, owner_user_id)
    references public.worker_attendance (id, worker_id, project_id, company_id, owner_user_id)
    on delete restrict,
  constraint worker_wage_payment_allocations_amount_positive
    check (allocated_amount > 0)
);

create index worker_wage_payment_allocations_attendance_idx
  on public.worker_wage_payment_allocations (attendance_id, wage_payment_id);

alter table public.worker_wage_payment_allocations enable row level security;

create policy worker_wage_payment_allocations_select_own
  on public.worker_wage_payment_allocations
  for select to authenticated
  using ((select auth.uid()) = owner_user_id);

-- Existing daily wage payments were all-or-nothing. Convert them into allocations
-- so they can be reversed safely after partial payments are introduced.
alter table public.worker_attendance disable trigger worker_attendance_prepare_trigger;

update public.worker_attendance
set paid_wage_amount = wage_amount
where wage_payment_id is not null
  and wage_amount > 0;

update public.worker_attendance
set wage_payment_id = null
where wage_payment_id is not null
  and wage_amount = 0;

insert into public.worker_wage_payment_allocations (
  wage_payment_id,
  attendance_id,
  worker_id,
  project_id,
  company_id,
  owner_user_id,
  allocated_amount
)
select
  attendance.wage_payment_id,
  attendance.id,
  attendance.worker_id,
  attendance.project_id,
  attendance.company_id,
  attendance.owner_user_id,
  attendance.wage_amount
from public.worker_attendance as attendance
where attendance.wage_payment_id is not null
  and attendance.project_id is not null
  and attendance.wage_amount > 0;

alter table public.worker_attendance enable trigger worker_attendance_prepare_trigger;

drop policy if exists worker_attendance_delete_unpaid_own on public.worker_attendance;
create policy worker_attendance_delete_unpaid_own on public.worker_attendance
  for delete to authenticated
  using ((select auth.uid()) = owner_user_id and paid_wage_amount = 0);

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
  controlled_wage_change boolean :=
    coalesce(current_setting('app.wage_allocation', true), '') = 'on'
    or coalesce(current_setting('app.wage_reversal', true), '') = 'on';
begin
  if current_user_id is null then
    raise exception 'Sesi pengguna tidak sah.';
  end if;

  if tg_op = 'UPDATE' and old.paid_wage_amount > 0 and not controlled_wage_change then
    if (to_jsonb(new) - array['notes', 'updated_at'])
      is distinct from (to_jsonb(old) - array['notes', 'updated_at']) then
      raise exception 'Kehadiran mempunyai bayaran upah dan tidak boleh diubah. Batalkan bayaran berkaitan dahulu.';
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
    new.paid_wage_amount := 0;
    new.wage_payment_id := null;
  else
    new.pay_type_snapshot := old.pay_type_snapshot;
    if not controlled_wage_change then
      new.paid_wage_amount := old.paid_wage_amount;
      new.wage_payment_id := old.wage_payment_id;
    end if;
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

create or replace function public.record_worker_wage_payment_partial(
  p_worker_id bigint,
  p_project_id bigint,
  p_period_start date,
  p_period_end date,
  p_payment_date date,
  p_gross_amount numeric,
  p_cash_amount numeric,
  p_advance_ids bigint[],
  p_payment_method text,
  p_notes text
)
returns public.worker_wage_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  worker_row public.workers;
  project_row public.projects;
  payment_row public.worker_wage_payments;
  attendance_row public.worker_attendance;
  attendance_total numeric(14, 2) := 0;
  attendance_count integer := 0;
  advance_total numeric(14, 2) := 0;
  requested_advance_count integer := 0;
  valid_advance_count integer := 0;
  gross_total numeric(14, 2);
  cash_total numeric(14, 2);
  remaining_total numeric(14, 2);
  allocation_amount numeric(14, 2);
  expense_row public.project_expenses;
begin
  if current_user_id is null then raise exception 'Sesi pengguna tidak sah.'; end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception 'Tempoh bayaran tidak sah.';
  end if;
  if p_payment_method not in ('cash', 'bank_transfer', 'cheque', 'other') then
    raise exception 'Kaedah bayaran tidak sah.';
  end if;
  if p_cash_amount is not null and p_cash_amount < 0 then
    raise exception 'Tunai dibayar tidak boleh negatif.';
  end if;

  select worker.* into worker_row
  from public.workers as worker
  where worker.id = p_worker_id
    and worker.owner_user_id = current_user_id;
  if not found then raise exception 'Pekerja tidak ditemui.'; end if;

  select project.* into project_row
  from public.projects as project
  where project.id = p_project_id
    and project.company_id = worker_row.company_id
    and project.owner_user_id = current_user_id;
  if not found then raise exception 'Projek tidak ditemui.'; end if;

  perform 1
  from public.worker_attendance as attendance
  where attendance.worker_id = worker_row.id
    and attendance.project_id = project_row.id
    and attendance.owner_user_id = current_user_id
    and attendance.attendance_date between p_period_start and p_period_end
    and attendance.status in ('present', 'half_day')
    and attendance.paid_wage_amount < attendance.wage_amount
  for update;

  select
    coalesce(sum(attendance.wage_amount - attendance.paid_wage_amount), 0),
    count(*)
  into attendance_total, attendance_count
  from public.worker_attendance as attendance
  where attendance.worker_id = worker_row.id
    and attendance.project_id = project_row.id
    and attendance.owner_user_id = current_user_id
    and attendance.attendance_date between p_period_start and p_period_end
    and attendance.status in ('present', 'half_day')
    and attendance.paid_wage_amount < attendance.wage_amount;

  requested_advance_count := coalesce(cardinality(p_advance_ids), 0);
  if requested_advance_count > 0 then
    perform 1
    from public.worker_advances as advance
    where advance.id = any(p_advance_ids)
      and advance.worker_id = worker_row.id
      and advance.project_id = project_row.id
      and advance.owner_user_id = current_user_id
      and advance.applied_wage_payment_id is null
    for update;

    select coalesce(sum(advance.amount), 0), count(*)
    into advance_total, valid_advance_count
    from public.worker_advances as advance
    where advance.id = any(p_advance_ids)
      and advance.worker_id = worker_row.id
      and advance.project_id = project_row.id
      and advance.owner_user_id = current_user_id
      and advance.applied_wage_payment_id is null;

    if valid_advance_count <> requested_advance_count then
      raise exception 'Pendahuluan tidak sah atau telah digunakan.';
    end if;
  end if;

  if worker_row.pay_type = 'daily' then
    if attendance_count = 0 or attendance_total <= 0 then
      raise exception 'Tiada baki upah attendance dalam tempoh ini.';
    end if;
    if advance_total > attendance_total then
      raise exception 'Jumlah pendahuluan melebihi baki upah.';
    end if;

    cash_total := round(coalesce(p_cash_amount, attendance_total - advance_total), 2);
    gross_total := round(cash_total + advance_total, 2);
    if gross_total <= 0 then
      raise exception 'Jumlah bayaran mesti melebihi RM0.';
    end if;
    if gross_total > attendance_total then
      raise exception 'Bayaran melebihi baki upah dalam tempoh ini.';
    end if;
  else
    gross_total := round(p_gross_amount, 2);
    if gross_total is null or gross_total <= 0 then
      raise exception 'Jumlah upah kontrak untuk bayaran ini mesti melebihi RM0.';
    end if;
    if advance_total > gross_total then
      raise exception 'Jumlah pendahuluan melebihi upah kontrak untuk bayaran ini.';
    end if;

    cash_total := round(gross_total - advance_total, 2);
    if p_cash_amount is not null and round(p_cash_amount, 2) <> cash_total then
      raise exception 'Tunai dibayar mesti sama dengan upah kontrak selepas tolak pendahuluan.';
    end if;
  end if;

  insert into public.worker_wage_payments (
    worker_id,
    project_id,
    company_id,
    owner_user_id,
    period_start,
    period_end,
    payment_date,
    gross_amount,
    advance_deduction,
    payment_method,
    notes
  ) values (
    worker_row.id,
    project_row.id,
    project_row.company_id,
    current_user_id,
    p_period_start,
    p_period_end,
    coalesce(p_payment_date, current_date),
    gross_total,
    advance_total,
    p_payment_method,
    coalesce(p_notes, '')
  ) returning * into payment_row;

  if worker_row.pay_type = 'daily' then
    remaining_total := gross_total;
    perform set_config('app.wage_allocation', 'on', true);

    for attendance_row in
      select attendance.*
      from public.worker_attendance as attendance
      where attendance.worker_id = worker_row.id
        and attendance.project_id = project_row.id
        and attendance.owner_user_id = current_user_id
        and attendance.attendance_date between p_period_start and p_period_end
        and attendance.status in ('present', 'half_day')
        and attendance.paid_wage_amount < attendance.wage_amount
      order by attendance.attendance_date, attendance.id
      for update
    loop
      exit when remaining_total <= 0;
      allocation_amount := least(
        remaining_total,
        round(attendance_row.wage_amount - attendance_row.paid_wage_amount, 2)
      );

      insert into public.worker_wage_payment_allocations (
        wage_payment_id,
        attendance_id,
        worker_id,
        project_id,
        company_id,
        owner_user_id,
        allocated_amount
      ) values (
        payment_row.id,
        attendance_row.id,
        attendance_row.worker_id,
        attendance_row.project_id,
        attendance_row.company_id,
        attendance_row.owner_user_id,
        allocation_amount
      );

      update public.worker_attendance as attendance
      set
        paid_wage_amount = round(attendance.paid_wage_amount + allocation_amount, 2),
        wage_payment_id = case
          when round(attendance.paid_wage_amount + allocation_amount, 2) = attendance.wage_amount
            then payment_row.id
          else null
        end,
        updated_at = now()
      where attendance.id = attendance_row.id;

      remaining_total := round(remaining_total - allocation_amount, 2);
    end loop;

    if remaining_total <> 0 then
      raise exception 'Bayaran tidak dapat diagihkan sepenuhnya kepada attendance.';
    end if;
  end if;

  if requested_advance_count > 0 then
    update public.worker_advances as advance
    set applied_wage_payment_id = payment_row.id
    where advance.id = any(p_advance_ids)
      and advance.worker_id = worker_row.id
      and advance.project_id = project_row.id
      and advance.owner_user_id = current_user_id
      and advance.applied_wage_payment_id is null;
  end if;

  if payment_row.net_amount > 0 then
    insert into public.project_expenses (
      project_id,
      company_id,
      owner_user_id,
      expense_date,
      category,
      description,
      total_amount,
      source_type,
      source_worker_wage_payment_id,
      notes
    ) values (
      project_row.id,
      project_row.company_id,
      current_user_id,
      payment_row.payment_date,
      'labour',
      'Bayaran upah · ' || worker_row.name || ' · ' ||
        to_char(payment_row.period_start, 'DD/MM/YYYY') || '–' ||
        to_char(payment_row.period_end, 'DD/MM/YYYY'),
      payment_row.net_amount,
      'worker_wage',
      payment_row.id,
      payment_row.notes
    ) returning * into expense_row;

    insert into public.project_expense_items (
      expense_id,
      project_id,
      company_id,
      owner_user_id,
      description,
      quantity,
      unit,
      unit_price,
      sort_order
    ) values (
      expense_row.id,
      project_row.id,
      project_row.company_id,
      current_user_id,
      'Tunai upah dibayar',
      1,
      'bayaran',
      payment_row.net_amount,
      0
    );

    insert into public.project_expense_payments (
      expense_id,
      project_id,
      company_id,
      owner_user_id,
      payment_date,
      amount,
      payment_method,
      notes
    ) values (
      expense_row.id,
      project_row.id,
      project_row.company_id,
      current_user_id,
      payment_row.payment_date,
      payment_row.net_amount,
      payment_row.payment_method,
      payment_row.notes
    );
  end if;

  return payment_row;
end;
$$;

create or replace function public.record_worker_wage_payment(
  p_worker_id bigint,
  p_project_id bigint,
  p_period_start date,
  p_period_end date,
  p_payment_date date,
  p_gross_amount numeric,
  p_advance_ids bigint[],
  p_payment_method text,
  p_notes text
)
returns public.worker_wage_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row public.worker_wage_payments;
begin
  select payment.* into payment_row
  from public.record_worker_wage_payment_partial(
    p_worker_id,
    p_project_id,
    p_period_start,
    p_period_end,
    p_payment_date,
    p_gross_amount,
    null,
    p_advance_ids,
    p_payment_method,
    p_notes
  ) as payment;
  return payment_row;
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
  where attendance.id = p_attendance_id
    and attendance.owner_user_id = current_user_id
  for update;
  if not found then raise exception 'Rekod kehadiran tidak ditemui.'; end if;
  if attendance_row.paid_wage_amount > 0 then
    raise exception 'Kehadiran mempunyai bayaran upah. Batalkan bayaran berkaitan dahulu.';
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
  where wage.id = p_wage_payment_id
    and wage.owner_user_id = current_user_id
  for update;
  if not found then raise exception 'Bayaran upah tidak ditemui.'; end if;

  perform 1
  from public.worker_wage_payment_allocations as allocation
  where allocation.wage_payment_id = wage_row.id
    and allocation.owner_user_id = current_user_id
  for update;

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
  update public.worker_attendance as attendance
  set
    paid_wage_amount = greatest(
      round(attendance.paid_wage_amount - allocation.allocated_amount, 2),
      0
    ),
    wage_payment_id = null,
    updated_at = now()
  from public.worker_wage_payment_allocations as allocation
  where allocation.wage_payment_id = wage_row.id
    and allocation.attendance_id = attendance.id
    and allocation.owner_user_id = current_user_id
    and attendance.owner_user_id = current_user_id;

  update public.worker_attendance
  set wage_payment_id = null, updated_at = now()
  where wage_payment_id = wage_row.id
    and owner_user_id = current_user_id;

  delete from public.worker_wage_payment_allocations
  where wage_payment_id = wage_row.id
    and owner_user_id = current_user_id;

  update public.worker_advances
  set applied_wage_payment_id = null
  where applied_wage_payment_id = wage_row.id
    and owner_user_id = current_user_id;

  delete from public.worker_wage_payments where id = wage_row.id;
  return storage_paths;
end;
$$;

create or replace view public.worker_balance_overview
with (security_invoker = true)
as
select
  worker.id as worker_id,
  worker.company_id,
  worker.owner_user_id,
  worker.name,
  worker.pay_type,
  worker.default_daily_rate,
  worker.is_active,
  coalesce(attendance.unpaid_wages, 0)::numeric(14, 2) as unpaid_wages,
  coalesce(advance.unapplied_advances, 0)::numeric(14, 2) as unapplied_advances,
  greatest(
    round(coalesce(attendance.unpaid_wages, 0) - coalesce(advance.unapplied_advances, 0), 2),
    0
  )::numeric(14, 2) as estimated_balance
from public.workers as worker
left join lateral (
  select sum(greatest(record.wage_amount - record.paid_wage_amount, 0)) as unpaid_wages
  from public.worker_attendance as record
  where record.worker_id = worker.id
    and record.status in ('present', 'half_day')
) as attendance on true
left join lateral (
  select sum(item.amount) as unapplied_advances
  from public.worker_advances as item
  where item.worker_id = worker.id
    and item.applied_wage_payment_id is null
) as advance on true;

revoke all on table public.worker_wage_payment_allocations from public, anon;
grant select on table public.worker_wage_payment_allocations to authenticated;

revoke execute on function public.record_worker_wage_payment_partial(bigint, bigint, date, date, date, numeric, numeric, bigint[], text, text)
  from public, anon;
revoke execute on function public.record_worker_wage_payment(bigint, bigint, date, date, date, numeric, bigint[], text, text)
  from public, anon;
revoke execute on function public.delete_unpaid_worker_attendance(bigint)
  from public, anon;
revoke execute on function public.reverse_worker_wage_payment(bigint)
  from public, anon;

grant execute on function public.record_worker_wage_payment_partial(bigint, bigint, date, date, date, numeric, numeric, bigint[], text, text)
  to authenticated;
grant execute on function public.record_worker_wage_payment(bigint, bigint, date, date, date, numeric, bigint[], text, text)
  to authenticated;
grant execute on function public.delete_unpaid_worker_attendance(bigint)
  to authenticated;
grant execute on function public.reverse_worker_wage_payment(bigint)
  to authenticated;

comment on table public.worker_wage_payment_allocations is
  'FIFO allocations from each wage payment to daily attendance, enabling partial payments and independent reversals.';
comment on column public.worker_attendance.paid_wage_amount is
  'Total wage already settled across all payment allocations for this attendance record.';
comment on function public.record_worker_wage_payment_partial(bigint, bigint, date, date, date, numeric, numeric, bigint[], text, text) is
  'Records a full or partial wage settlement and posts only cash actually paid to project expenses.';
comment on function public.reverse_worker_wage_payment(bigint) is
  'Reverses one wage transaction, its expense and allocations while preserving other partial wage payments.';

commit;
