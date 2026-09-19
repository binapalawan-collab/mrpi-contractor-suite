begin;

alter table public.worker_advances
  drop constraint if exists worker_advances_application_scope_valid,
  add constraint worker_advances_application_scope_valid
    check (
      (
        advance_scope = 'worker'
        and not (
          applied_wage_payment_id is not null
          and applied_wage_batch_id is not null
        )
      )
      or (
        advance_scope = 'crew'
        and applied_wage_payment_id is null
      )
    );

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
  coalesce(attendance.unpaid_wages, 0)::numeric(14,2) as unpaid_wages,
  coalesce(advance.unapplied_advances, 0)::numeric(14,2) as unapplied_advances,
  greatest(round(coalesce(attendance.unpaid_wages, 0) - coalesce(advance.unapplied_advances, 0), 2), 0)::numeric(14,2) as estimated_balance
from public.workers as worker
left join lateral (
  select sum(greatest(record.wage_amount - record.paid_wage_amount, 0)) as unpaid_wages
  from public.worker_attendance as record
  where record.worker_id = worker.id
    and record.status in ('present','half_day')
) attendance on true
left join lateral (
  select sum(item.amount) as unapplied_advances
  from public.worker_advances as item
  where item.worker_id = worker.id
    and item.advance_scope = 'worker'
    and item.applied_wage_payment_id is null
    and item.applied_wage_batch_id is null
) advance on true;

create or replace function public.record_worker_wage_payment_all_projects_partial(
  p_worker_id bigint,
  p_project_ids bigint[],
  p_period_start date,
  p_period_end date,
  p_payment_date date,
  p_cash_amount numeric,
  p_advance_ids bigint[],
  p_payment_method text,
  p_notes text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  worker_row public.workers;
  attendance_row public.worker_attendance;
  payment_row public.worker_wage_payments;
  batch_row public.worker_wage_payment_batches;
  expense_row public.project_expenses;
  project_ids bigint[];
  advance_ids bigint[];
  current_project_id bigint;
  anchor_project_id bigint;
  attendance_total numeric(14,2) := 0;
  project_outstanding numeric(14,2) := 0;
  advance_total numeric(14,2) := 0;
  advance_share numeric(14,2) := 0;
  cash_total numeric(14,2) := 0;
  project_cash numeric(14,2) := 0;
  project_gross numeric(14,2) := 0;
  remaining_advance numeric(14,2) := 0;
  remaining_cash numeric(14,2) := 0;
  remaining_project_gross numeric(14,2) := 0;
  allocation_amount numeric(14,2) := 0;
  gross_total numeric(14,2) := 0;
  requested_advance_count integer := 0;
  valid_advance_count integer := 0;
  valid_project_count integer := 0;
  processed_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'Sesi pengguna tidak sah.';
  end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception 'Tempoh bayaran tidak sah.';
  end if;
  if p_payment_method not in ('cash','bank_transfer','cheque','other') then
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
  if worker_row.pay_type <> 'daily' then
    raise exception 'Bayaran semua projek hanya untuk pekerja gaji hari.';
  end if;

  select coalesce(array_agg(distinct project_id order by project_id), '{}'::bigint[])
    into project_ids
  from unnest(coalesce(p_project_ids, '{}'::bigint[])) as project_id
  where project_id is not null;
  if coalesce(array_length(project_ids, 1), 0) = 0 then
    raise exception 'Tiada projek tertunggak dalam tempoh dipilih.';
  end if;

  select count(*) into valid_project_count
  from public.projects as project
  where project.id = any(project_ids)
    and project.company_id = worker_row.company_id
    and project.owner_user_id = current_user_id;
  if valid_project_count <> cardinality(project_ids) then
    raise exception 'Senarai projek tidak sah atau tidak sepadan dengan syarikat.';
  end if;

  perform 1
  from public.worker_attendance as attendance
  where attendance.worker_id = worker_row.id
    and attendance.project_id = any(project_ids)
    and attendance.owner_user_id = current_user_id
    and attendance.attendance_date between p_period_start and p_period_end
    and attendance.status in ('present','half_day')
    and attendance.paid_wage_amount < attendance.wage_amount
  for update;

  select
    round(coalesce(sum(attendance.wage_amount - attendance.paid_wage_amount), 0), 2),
    (array_agg(attendance.project_id order by attendance.attendance_date, attendance.id))[1]
  into attendance_total, anchor_project_id
  from public.worker_attendance as attendance
  where attendance.worker_id = worker_row.id
    and attendance.project_id = any(project_ids)
    and attendance.owner_user_id = current_user_id
    and attendance.attendance_date between p_period_start and p_period_end
    and attendance.status in ('present','half_day')
    and attendance.paid_wage_amount < attendance.wage_amount;
  if attendance_total <= 0 or anchor_project_id is null then
    raise exception 'Tiada baki upah attendance dalam tempoh ini.';
  end if;

  select coalesce(array_agg(distinct advance_id order by advance_id), '{}'::bigint[])
    into advance_ids
  from unnest(coalesce(p_advance_ids, '{}'::bigint[])) as advance_id
  where advance_id is not null;
  requested_advance_count := cardinality(advance_ids);

  if requested_advance_count > 0 then
    perform 1
    from public.worker_advances as advance
    where advance.id = any(advance_ids)
      and advance.worker_id = worker_row.id
      and advance.project_id = any(project_ids)
      and advance.owner_user_id = current_user_id
      and advance.advance_scope = 'worker'
      and advance.applied_wage_payment_id is null
      and advance.applied_wage_batch_id is null
    for update;

    select round(coalesce(sum(advance.amount), 0), 2), count(*)
      into advance_total, valid_advance_count
    from public.worker_advances as advance
    where advance.id = any(advance_ids)
      and advance.worker_id = worker_row.id
      and advance.project_id = any(project_ids)
      and advance.owner_user_id = current_user_id
      and advance.advance_scope = 'worker'
      and advance.applied_wage_payment_id is null
      and advance.applied_wage_batch_id is null;
    if valid_advance_count <> requested_advance_count then
      raise exception 'Pinjaman tidak sah, bukan pinjaman individu, atau telah digunakan.';
    end if;
  end if;

  cash_total := round(coalesce(p_cash_amount, attendance_total - advance_total), 2);
  gross_total := round(cash_total + advance_total, 2);
  if gross_total <= 0 then raise exception 'Jumlah bayaran mesti melebihi RM0.'; end if;
  if gross_total > attendance_total then
    raise exception 'Tunai dan pinjaman melebihi baki upah semua projek.';
  end if;

  insert into public.worker_wage_payment_batches (
    head_worker_id, project_id, company_id, owner_user_id,
    period_start, period_end, payment_date, payment_method, notes,
    total_gross, total_advance_deduction, group_advance_deduction
  ) values (
    worker_row.id, anchor_project_id, worker_row.company_id, current_user_id,
    p_period_start, p_period_end, coalesce(p_payment_date, current_date),
    p_payment_method, coalesce(p_notes, ''), gross_total, advance_total, 0
  ) returning * into batch_row;

  remaining_advance := advance_total;
  remaining_cash := cash_total;

  for current_project_id in
    select attendance.project_id
    from public.worker_attendance as attendance
    where attendance.worker_id = worker_row.id
      and attendance.project_id = any(project_ids)
      and attendance.owner_user_id = current_user_id
      and attendance.attendance_date between p_period_start and p_period_end
      and attendance.status in ('present','half_day')
      and attendance.paid_wage_amount < attendance.wage_amount
    group by attendance.project_id
    order by min(attendance.attendance_date), attendance.project_id
  loop
    exit when remaining_advance <= 0 and remaining_cash <= 0;

    select round(coalesce(sum(attendance.wage_amount - attendance.paid_wage_amount), 0), 2)
      into project_outstanding
    from public.worker_attendance as attendance
    where attendance.worker_id = worker_row.id
      and attendance.project_id = current_project_id
      and attendance.owner_user_id = current_user_id
      and attendance.attendance_date between p_period_start and p_period_end
      and attendance.status in ('present','half_day')
      and attendance.paid_wage_amount < attendance.wage_amount;

    advance_share := least(remaining_advance, project_outstanding);
    project_cash := least(remaining_cash, greatest(round(project_outstanding - advance_share, 2), 0));
    project_gross := round(advance_share + project_cash, 2);
    if project_gross <= 0 then continue; end if;

    insert into public.worker_wage_payments (
      worker_id, project_id, company_id, owner_user_id,
      period_start, period_end, payment_date,
      gross_amount, advance_deduction, crew_advance_deduction,
      payment_method, notes, recipient_worker_id, wage_batch_id
    ) values (
      worker_row.id, current_project_id, worker_row.company_id, current_user_id,
      p_period_start, p_period_end, coalesce(p_payment_date, current_date),
      project_gross, advance_share, 0,
      p_payment_method, coalesce(p_notes, ''), worker_row.id, batch_row.id
    ) returning * into payment_row;

    remaining_project_gross := project_gross;
    perform set_config('app.wage_allocation', 'on', true);
    for attendance_row in
      select attendance.*
      from public.worker_attendance as attendance
      where attendance.worker_id = worker_row.id
        and attendance.project_id = current_project_id
        and attendance.owner_user_id = current_user_id
        and attendance.attendance_date between p_period_start and p_period_end
        and attendance.status in ('present','half_day')
        and attendance.paid_wage_amount < attendance.wage_amount
      order by attendance.attendance_date, attendance.id
      for update
    loop
      exit when remaining_project_gross <= 0;
      allocation_amount := least(
        remaining_project_gross,
        round(attendance_row.wage_amount - attendance_row.paid_wage_amount, 2)
      );
      insert into public.worker_wage_payment_allocations (
        wage_payment_id, attendance_id, worker_id, project_id,
        company_id, owner_user_id, allocated_amount
      ) values (
        payment_row.id, attendance_row.id, attendance_row.worker_id,
        attendance_row.project_id, attendance_row.company_id,
        attendance_row.owner_user_id, allocation_amount
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
      remaining_project_gross := round(remaining_project_gross - allocation_amount, 2);
    end loop;
    if remaining_project_gross <> 0 then
      raise exception 'Bayaran tidak dapat diagihkan sepenuhnya kepada attendance projek.';
    end if;

    if payment_row.net_amount > 0 then
      insert into public.project_expenses (
        project_id, company_id, owner_user_id, expense_date, category,
        description, total_amount, source_type,
        source_worker_wage_payment_id, notes
      ) values (
        current_project_id, worker_row.company_id, current_user_id,
        payment_row.payment_date, 'labour',
        'Bayaran upah · ' || worker_row.name || ' · ' ||
          to_char(payment_row.period_start, 'DD/MM/YYYY') || '–' ||
          to_char(payment_row.period_end, 'DD/MM/YYYY'),
        payment_row.net_amount, 'worker_wage', payment_row.id, payment_row.notes
      ) returning * into expense_row;
      insert into public.project_expense_items (
        expense_id, project_id, company_id, owner_user_id,
        description, quantity, unit, unit_price, sort_order
      ) values (
        expense_row.id, current_project_id, worker_row.company_id, current_user_id,
        'Tunai upah dibayar', 1, 'bayaran', payment_row.net_amount, 0
      );
      insert into public.project_expense_payments (
        expense_id, project_id, company_id, owner_user_id,
        payment_date, amount, payment_method, notes
      ) values (
        expense_row.id, current_project_id, worker_row.company_id, current_user_id,
        payment_row.payment_date, payment_row.net_amount,
        payment_row.payment_method, payment_row.notes
      );
    end if;

    processed_count := processed_count + 1;
    remaining_advance := round(remaining_advance - advance_share, 2);
    remaining_cash := round(remaining_cash - project_cash, 2);
  end loop;

  if remaining_advance <> 0 or remaining_cash <> 0 then
    raise exception 'Bayaran tidak dapat diagihkan sepenuhnya kepada semua projek.';
  end if;

  if requested_advance_count > 0 then
    update public.worker_advances as advance
    set applied_wage_batch_id = batch_row.id
    where advance.id = any(advance_ids)
      and advance.worker_id = worker_row.id
      and advance.owner_user_id = current_user_id
      and advance.advance_scope = 'worker'
      and advance.applied_wage_payment_id is null
      and advance.applied_wage_batch_id is null;
    if not found then
      raise exception 'Pinjaman terpilih tidak dapat ditanda sebagai telah digunakan.';
    end if;
  end if;

  return processed_count;
end;
$$;

revoke all on function public.record_worker_wage_payment_all_projects_partial(bigint,bigint[],date,date,date,numeric,bigint[],text,text) from public;
grant execute on function public.record_worker_wage_payment_all_projects_partial(bigint,bigint[],date,date,date,numeric,bigint[],text,text) to authenticated;

create or replace function public.reverse_worker_wage_payment_batch(p_wage_batch_id bigint)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  batch_row public.worker_wage_payment_batches;
  storage_paths text[];
begin
  if current_user_id is null then raise exception 'Sesi pengguna tidak sah.'; end if;

  select batch.* into batch_row
  from public.worker_wage_payment_batches as batch
  where batch.id = p_wage_batch_id
    and batch.owner_user_id = current_user_id
  for update;
  if not found then raise exception 'Batch bayaran upah tidak ditemui.'; end if;

  perform 1
  from public.worker_wage_payments as wage
  where wage.wage_batch_id = batch_row.id
    and wage.owner_user_id = current_user_id
  for update;

  perform 1
  from public.worker_wage_payment_allocations as allocation
  join public.worker_wage_payments as wage on wage.id = allocation.wage_payment_id
  where wage.wage_batch_id = batch_row.id
    and allocation.owner_user_id = current_user_id
  for update of allocation;

  select coalesce(array_agg(attachment.storage_path), array[]::text[])
  into storage_paths
  from public.project_expense_attachments as attachment
  join public.project_expenses as expense on expense.id = attachment.expense_id
  join public.worker_wage_payments as wage on wage.id = expense.source_worker_wage_payment_id
  where wage.wage_batch_id = batch_row.id
    and expense.owner_user_id = current_user_id;

  delete from public.project_expense_payments as payment
  using public.project_expenses as expense, public.worker_wage_payments as wage
  where payment.expense_id = expense.id
    and expense.source_worker_wage_payment_id = wage.id
    and wage.wage_batch_id = batch_row.id
    and expense.owner_user_id = current_user_id;

  delete from public.project_expense_attachments as attachment
  using public.project_expenses as expense, public.worker_wage_payments as wage
  where attachment.expense_id = expense.id
    and expense.source_worker_wage_payment_id = wage.id
    and wage.wage_batch_id = batch_row.id
    and expense.owner_user_id = current_user_id;

  delete from public.project_expense_items as item
  using public.project_expenses as expense, public.worker_wage_payments as wage
  where item.expense_id = expense.id
    and expense.source_worker_wage_payment_id = wage.id
    and wage.wage_batch_id = batch_row.id
    and expense.owner_user_id = current_user_id;

  delete from public.project_expenses as expense
  using public.worker_wage_payments as wage
  where expense.source_worker_wage_payment_id = wage.id
    and wage.wage_batch_id = batch_row.id
    and expense.owner_user_id = current_user_id;

  perform set_config('app.wage_reversal', 'on', true);
  update public.worker_attendance as attendance
  set
    paid_wage_amount = greatest(round(attendance.paid_wage_amount - allocation.allocated_amount, 2), 0),
    wage_payment_id = null,
    updated_at = now()
  from public.worker_wage_payment_allocations as allocation
  join public.worker_wage_payments as wage on wage.id = allocation.wage_payment_id
  where wage.wage_batch_id = batch_row.id
    and allocation.attendance_id = attendance.id
    and allocation.owner_user_id = current_user_id
    and attendance.owner_user_id = current_user_id;

  update public.worker_advances
  set applied_wage_payment_id = null
  where applied_wage_payment_id in (
    select wage.id from public.worker_wage_payments as wage
    where wage.wage_batch_id = batch_row.id
      and wage.owner_user_id = current_user_id
  )
    and owner_user_id = current_user_id;

  update public.worker_advances
  set applied_wage_batch_id = null
  where applied_wage_batch_id = batch_row.id
    and owner_user_id = current_user_id;

  delete from public.worker_wage_payment_allocations as allocation
  using public.worker_wage_payments as wage
  where allocation.wage_payment_id = wage.id
    and wage.wage_batch_id = batch_row.id
    and allocation.owner_user_id = current_user_id;

  delete from public.worker_wage_payments
  where wage_batch_id = batch_row.id
    and owner_user_id = current_user_id;

  delete from public.worker_wage_payment_batches
  where id = batch_row.id
    and owner_user_id = current_user_id;

  return storage_paths;
end;
$$;

revoke all on function public.reverse_worker_wage_payment_batch(bigint) from public;
grant execute on function public.reverse_worker_wage_payment_batch(bigint) to authenticated;

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

  if wage_row.wage_batch_id is not null then
    return public.reverse_worker_wage_payment_batch(wage_row.wage_batch_id);
  end if;

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
    paid_wage_amount = greatest(round(attendance.paid_wage_amount - allocation.allocated_amount, 2), 0),
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

revoke all on function public.reverse_worker_wage_payment(bigint) from public;
grant execute on function public.reverse_worker_wage_payment(bigint) to authenticated;

commit;
