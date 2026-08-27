begin;

alter table public.worker_advances
  add column if not exists advance_scope text not null default 'worker',
  add column if not exists applied_wage_batch_id bigint;

alter table public.worker_advances
  drop constraint if exists worker_advances_scope_valid,
  add constraint worker_advances_scope_valid
    check (advance_scope in ('worker', 'crew')),
  drop constraint if exists worker_advances_application_scope_valid,
  add constraint worker_advances_application_scope_valid
    check (
      (advance_scope = 'worker' and applied_wage_batch_id is null)
      or (advance_scope = 'crew' and applied_wage_payment_id is null)
    ),
  drop constraint if exists worker_advances_batch_fkey,
  add constraint worker_advances_batch_fkey
    foreign key (applied_wage_batch_id, company_id, owner_user_id)
    references public.worker_wage_payment_batches (id, company_id, owner_user_id)
    on delete restrict;

create index if not exists worker_advances_open_scope_idx
  on public.worker_advances (worker_id, project_id, advance_scope, advance_date, id)
  where applied_wage_payment_id is null and applied_wage_batch_id is null;

alter table public.worker_wage_payments
  add column if not exists crew_advance_deduction numeric(14,2) not null default 0;

alter table public.worker_wage_payments
  drop constraint if exists worker_wage_payments_crew_advance_valid,
  add constraint worker_wage_payments_crew_advance_valid
    check (crew_advance_deduction >= 0 and crew_advance_deduction <= advance_deduction);

alter table public.worker_wage_payment_batches
  add column if not exists group_advance_deduction numeric(14,2) not null default 0;

alter table public.worker_wage_payment_batches
  drop constraint if exists worker_wage_payment_batches_group_advance_valid,
  add constraint worker_wage_payment_batches_group_advance_valid
    check (group_advance_deduction >= 0 and group_advance_deduction <= total_advance_deduction);

create or replace function private.validate_worker_advance_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  worker_row public.workers;
begin
  if new.advance_scope = 'crew' then
    select worker.* into worker_row
    from public.workers as worker
    where worker.id = new.worker_id
      and worker.company_id = new.company_id
      and worker.owner_user_id = new.owner_user_id;
    if not found or not worker_row.is_crew_leader then
      raise exception 'Pinjaman kumpulan mesti direkod atas Kepala Tukang.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists worker_advances_validate_scope_trigger on public.worker_advances;
create trigger worker_advances_validate_scope_trigger
before insert or update of worker_id, company_id, owner_user_id, advance_scope
on public.worker_advances
for each row execute function private.validate_worker_advance_scope();

create or replace function public.record_worker_advance_scoped(
  p_worker_id bigint,
  p_project_id bigint,
  p_advance_date date,
  p_amount numeric,
  p_payment_method text,
  p_notes text,
  p_advance_scope text
)
returns public.worker_advances
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  worker_row public.workers;
  project_row public.projects;
  advance_row public.worker_advances;
  expense_row public.project_expenses;
  scope_value text := coalesce(nullif(p_advance_scope, ''), 'worker');
  description_value text;
begin
  if current_user_id is null then raise exception 'Sesi pengguna tidak sah.'; end if;
  if p_amount <= 0 then raise exception 'Amaun pendahuluan mesti melebihi RM0.'; end if;
  if scope_value not in ('worker', 'crew') then raise exception 'Jenis pinjaman tidak sah.'; end if;
  if p_payment_method not in ('cash', 'bank_transfer', 'cheque', 'other') then raise exception 'Kaedah bayaran tidak sah.'; end if;

  select worker.* into worker_row
  from public.workers as worker
  where worker.id = p_worker_id and worker.owner_user_id = current_user_id;
  if not found then raise exception 'Pekerja tidak ditemui.'; end if;
  if scope_value = 'crew' and not worker_row.is_crew_leader then
    raise exception 'Pinjaman kumpulan mesti direkod atas Kepala Tukang.';
  end if;

  select project.* into project_row
  from public.projects as project
  where project.id = p_project_id
    and project.company_id = worker_row.company_id
    and project.owner_user_id = current_user_id;
  if not found then raise exception 'Projek tidak ditemui.'; end if;

  insert into public.worker_advances (
    worker_id, project_id, company_id, owner_user_id, advance_date,
    amount, payment_method, notes, advance_scope
  ) values (
    worker_row.id, project_row.id, project_row.company_id, current_user_id,
    coalesce(p_advance_date, current_date), p_amount, p_payment_method,
    coalesce(p_notes, ''), scope_value
  ) returning * into advance_row;

  description_value := case when scope_value = 'crew'
    then 'Pendahuluan kumpulan · ' || worker_row.name
    else 'Pendahuluan upah · ' || worker_row.name end;

  insert into public.project_expenses (
    project_id, company_id, owner_user_id, expense_date, category, description,
    total_amount, source_type, source_worker_advance_id, notes
  ) values (
    project_row.id, project_row.company_id, current_user_id,
    advance_row.advance_date, 'labour', description_value,
    advance_row.amount, 'worker_advance', advance_row.id, advance_row.notes
  ) returning * into expense_row;

  insert into public.project_expense_items (
    expense_id, project_id, company_id, owner_user_id, description,
    quantity, unit, unit_price, sort_order
  ) values (
    expense_row.id, project_row.id, project_row.company_id, current_user_id,
    description_value, 1, 'bayaran', advance_row.amount, 0
  );

  insert into public.project_expense_payments (
    expense_id, project_id, company_id, owner_user_id, payment_date,
    amount, payment_method, notes
  ) values (
    expense_row.id, project_row.id, project_row.company_id, current_user_id,
    advance_row.advance_date, advance_row.amount, advance_row.payment_method,
    advance_row.notes
  );

  return advance_row;
end;
$$;

revoke all on function public.record_worker_advance_scoped(bigint,bigint,date,numeric,text,text,text) from public;
grant execute on function public.record_worker_advance_scoped(bigint,bigint,date,numeric,text,text,text) to authenticated;

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
) advance on true;

create or replace function public.record_worker_crew_wage_payment(
  p_head_worker_id bigint,
  p_project_id bigint,
  p_period_start date,
  p_period_end date,
  p_payment_date date,
  p_payment_method text,
  p_notes text
)
returns public.worker_wage_payment_batches
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  head_row public.workers;
  project_row public.projects;
  member_row public.workers;
  attendance_row public.worker_attendance;
  payment_row public.worker_wage_payments;
  batch_row public.worker_wage_payment_batches;
  expense_row public.project_expenses;
  outstanding_total numeric(14,2);
  personal_advance_total numeric(14,2);
  personal_advance_ids bigint[];
  group_advance_total numeric(14,2) := 0;
  group_advance_ids bigint[] := '{}'::bigint[];
  group_remaining numeric(14,2) := 0;
  group_share numeric(14,2) := 0;
  cash_total numeric(14,2) := 0;
  remaining_total numeric(14,2);
  allocation_amount numeric(14,2);
  pre_gross numeric(14,2) := 0;
  pre_personal_advance numeric(14,2) := 0;
  gross_sum numeric(14,2) := 0;
  advance_sum numeric(14,2) := 0;
  payment_count integer := 0;
  group_note text;
begin
  if current_user_id is null then raise exception 'Sesi pengguna tidak sah.'; end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception 'Tempoh bayaran kumpulan tidak sah.';
  end if;
  if p_payment_method not in ('cash','bank_transfer','cheque','other') then
    raise exception 'Kaedah bayaran tidak sah.';
  end if;

  select worker.* into head_row
  from public.workers as worker
  where worker.id = p_head_worker_id and worker.owner_user_id = current_user_id;
  if not found then raise exception 'Kepala tukang tidak ditemui.'; end if;
  if not head_row.is_crew_leader then raise exception 'Pekerja ini belum ditanda sebagai Kepala Tukang.'; end if;

  select project.* into project_row
  from public.projects as project
  where project.id = p_project_id
    and project.company_id = head_row.company_id
    and project.owner_user_id = current_user_id;
  if not found then raise exception 'Projek tidak ditemui.'; end if;

  for member_row in
    select worker.* from public.workers as worker
    where worker.owner_user_id = current_user_id
      and worker.company_id = head_row.company_id
      and worker.pay_type = 'daily'
      and (worker.id = head_row.id or worker.crew_leader_id = head_row.id)
    order by case when worker.id = head_row.id then 0 else 1 end, worker.name, worker.id
  loop
    select coalesce(sum(attendance.wage_amount - attendance.paid_wage_amount),0)
      into outstanding_total
    from public.worker_attendance as attendance
    where attendance.worker_id = member_row.id
      and attendance.project_id = project_row.id
      and attendance.owner_user_id = current_user_id
      and attendance.attendance_date between p_period_start and p_period_end
      and attendance.status in ('present','half_day')
      and attendance.paid_wage_amount < attendance.wage_amount;
    outstanding_total := round(coalesce(outstanding_total,0),2);
    if outstanding_total <= 0 then continue; end if;

    select coalesce(sum(candidate.amount) filter (where candidate.running_total <= outstanding_total),0)
      into personal_advance_total
    from (
      select advance.amount,
        sum(advance.amount) over (order by advance.advance_date,advance.id rows between unbounded preceding and current row) as running_total
      from public.worker_advances as advance
      where advance.worker_id = member_row.id
        and advance.project_id = project_row.id
        and advance.owner_user_id = current_user_id
        and advance.advance_scope = 'worker'
        and advance.applied_wage_payment_id is null
    ) candidate;
    personal_advance_total := round(coalesce(personal_advance_total,0),2);
    pre_gross := round(pre_gross + outstanding_total,2);
    pre_personal_advance := round(pre_personal_advance + personal_advance_total,2);
  end loop;

  if pre_gross <= 0 then
    raise exception 'Tiada baki upah harian untuk kumpulan ini dalam projek dan tempoh dipilih.';
  end if;

  select
    coalesce(array_agg(candidate.id order by candidate.advance_date,candidate.id)
      filter (where candidate.running_total <= round(pre_gross - pre_personal_advance,2)), '{}'::bigint[]),
    coalesce(sum(candidate.amount)
      filter (where candidate.running_total <= round(pre_gross - pre_personal_advance,2)),0)
  into group_advance_ids, group_advance_total
  from (
    select advance.id,advance.advance_date,advance.amount,
      sum(advance.amount) over (order by advance.advance_date,advance.id rows between unbounded preceding and current row) as running_total
    from public.worker_advances as advance
    where advance.worker_id = head_row.id
      and advance.project_id = project_row.id
      and advance.owner_user_id = current_user_id
      and advance.advance_scope = 'crew'
      and advance.applied_wage_batch_id is null
  ) candidate;
  group_advance_total := round(coalesce(group_advance_total,0),2);
  group_remaining := group_advance_total;

  insert into public.worker_wage_payment_batches (
    head_worker_id,project_id,company_id,owner_user_id,period_start,period_end,
    payment_date,payment_method,notes,total_gross,total_advance_deduction,group_advance_deduction
  ) values (
    head_row.id,project_row.id,project_row.company_id,current_user_id,p_period_start,p_period_end,
    coalesce(p_payment_date,current_date),p_payment_method,coalesce(p_notes,''),0,0,0
  ) returning * into batch_row;

  for member_row in
    select worker.* from public.workers as worker
    where worker.owner_user_id = current_user_id
      and worker.company_id = head_row.company_id
      and worker.pay_type = 'daily'
      and (worker.id = head_row.id or worker.crew_leader_id = head_row.id)
    order by case when worker.id = head_row.id then 0 else 1 end, worker.name, worker.id
  loop
    perform 1 from public.worker_attendance as attendance
    where attendance.worker_id = member_row.id
      and attendance.project_id = project_row.id
      and attendance.owner_user_id = current_user_id
      and attendance.attendance_date between p_period_start and p_period_end
      and attendance.status in ('present','half_day')
      and attendance.paid_wage_amount < attendance.wage_amount
    for update;

    select coalesce(sum(attendance.wage_amount - attendance.paid_wage_amount),0)
      into outstanding_total
    from public.worker_attendance as attendance
    where attendance.worker_id = member_row.id
      and attendance.project_id = project_row.id
      and attendance.owner_user_id = current_user_id
      and attendance.attendance_date between p_period_start and p_period_end
      and attendance.status in ('present','half_day')
      and attendance.paid_wage_amount < attendance.wage_amount;
    outstanding_total := round(coalesce(outstanding_total,0),2);
    if outstanding_total <= 0 then continue; end if;

    select
      coalesce(array_agg(candidate.id order by candidate.advance_date,candidate.id)
        filter (where candidate.running_total <= outstanding_total), '{}'::bigint[]),
      coalesce(sum(candidate.amount)
        filter (where candidate.running_total <= outstanding_total),0)
    into personal_advance_ids, personal_advance_total
    from (
      select advance.id,advance.advance_date,advance.amount,
        sum(advance.amount) over (order by advance.advance_date,advance.id rows between unbounded preceding and current row) as running_total
      from public.worker_advances as advance
      where advance.worker_id = member_row.id
        and advance.project_id = project_row.id
        and advance.owner_user_id = current_user_id
        and advance.advance_scope = 'worker'
        and advance.applied_wage_payment_id is null
    ) candidate;
    personal_advance_total := round(coalesce(personal_advance_total,0),2);
    group_share := least(group_remaining, round(outstanding_total - personal_advance_total,2));
    group_share := greatest(round(coalesce(group_share,0),2),0);
    cash_total := round(outstanding_total - personal_advance_total - group_share,2);
    group_note := concat_ws(E'\n', nullif(coalesce(p_notes,''),''),
      'Bayaran kumpulan diterima melalui Kepala Tukang: ' || head_row.name,
      case when group_share > 0 then 'Tolakan pinjaman kumpulan: RM ' || to_char(group_share,'FM999999990.00') else null end);

    insert into public.worker_wage_payments (
      worker_id,project_id,company_id,owner_user_id,period_start,period_end,payment_date,
      gross_amount,advance_deduction,crew_advance_deduction,payment_method,notes,
      recipient_worker_id,wage_batch_id
    ) values (
      member_row.id,project_row.id,project_row.company_id,current_user_id,p_period_start,p_period_end,
      coalesce(p_payment_date,current_date),outstanding_total,
      round(personal_advance_total + group_share,2),group_share,p_payment_method,group_note,
      head_row.id,batch_row.id
    ) returning * into payment_row;

    remaining_total := outstanding_total;
    perform set_config('app.wage_allocation','on',true);
    for attendance_row in
      select attendance.* from public.worker_attendance as attendance
      where attendance.worker_id = member_row.id
        and attendance.project_id = project_row.id
        and attendance.owner_user_id = current_user_id
        and attendance.attendance_date between p_period_start and p_period_end
        and attendance.status in ('present','half_day')
        and attendance.paid_wage_amount < attendance.wage_amount
      order by attendance.attendance_date,attendance.id
      for update
    loop
      exit when remaining_total <= 0;
      allocation_amount := least(remaining_total, round(attendance_row.wage_amount - attendance_row.paid_wage_amount,2));
      insert into public.worker_wage_payment_allocations (
        wage_payment_id,attendance_id,worker_id,project_id,company_id,owner_user_id,allocated_amount
      ) values (
        payment_row.id,attendance_row.id,attendance_row.worker_id,attendance_row.project_id,
        attendance_row.company_id,attendance_row.owner_user_id,allocation_amount
      );
      update public.worker_attendance as attendance
      set paid_wage_amount = round(attendance.paid_wage_amount + allocation_amount,2),
          wage_payment_id = case when round(attendance.paid_wage_amount + allocation_amount,2) = attendance.wage_amount then payment_row.id else null end,
          updated_at = now()
      where attendance.id = attendance_row.id;
      remaining_total := round(remaining_total - allocation_amount,2);
    end loop;
    if remaining_total <> 0 then raise exception 'Bayaran kumpulan tidak dapat diagihkan sepenuhnya.'; end if;

    if cardinality(personal_advance_ids) > 0 then
      update public.worker_advances as advance
      set applied_wage_payment_id = payment_row.id
      where advance.id = any(personal_advance_ids)
        and advance.advance_scope = 'worker'
        and advance.applied_wage_payment_id is null;
    end if;

    if payment_row.net_amount > 0 then
      insert into public.project_expenses (
        project_id,company_id,owner_user_id,expense_date,category,description,total_amount,
        source_type,source_worker_wage_payment_id,notes
      ) values (
        project_row.id,project_row.company_id,current_user_id,payment_row.payment_date,'labour',
        'Bayaran upah · ' || member_row.name || ' · ' || to_char(payment_row.period_start,'DD/MM/YYYY') || '–' || to_char(payment_row.period_end,'DD/MM/YYYY'),
        payment_row.net_amount,'worker_wage',payment_row.id,payment_row.notes
      ) returning * into expense_row;
      insert into public.project_expense_items (
        expense_id,project_id,company_id,owner_user_id,description,quantity,unit,unit_price,sort_order
      ) values (
        expense_row.id,project_row.id,project_row.company_id,current_user_id,'Tunai upah dibayar',1,'bayaran',payment_row.net_amount,0
      );
      insert into public.project_expense_payments (
        expense_id,project_id,company_id,owner_user_id,payment_date,amount,payment_method,notes
      ) values (
        expense_row.id,project_row.id,project_row.company_id,current_user_id,payment_row.payment_date,
        payment_row.net_amount,payment_row.payment_method,payment_row.notes
      );
    end if;

    payment_count := payment_count + 1;
    gross_sum := round(gross_sum + outstanding_total,2);
    advance_sum := round(advance_sum + personal_advance_total + group_share,2);
    group_remaining := round(group_remaining - group_share,2);
  end loop;

  if payment_count = 0 then
    delete from public.worker_wage_payment_batches where id = batch_row.id;
    raise exception 'Tiada baki upah harian untuk kumpulan ini dalam projek dan tempoh dipilih.';
  end if;
  if group_remaining <> 0 then raise exception 'Pinjaman kumpulan tidak dapat diagihkan sepenuhnya.'; end if;

  if cardinality(group_advance_ids) > 0 then
    update public.worker_advances as advance
    set applied_wage_batch_id = batch_row.id
    where advance.id = any(group_advance_ids)
      and advance.advance_scope = 'crew'
      and advance.applied_wage_batch_id is null;
  end if;

  update public.worker_wage_payment_batches
  set total_gross = gross_sum,
      total_advance_deduction = advance_sum,
      group_advance_deduction = group_advance_total
  where id = batch_row.id
  returning * into batch_row;

  return batch_row;
end;
$$;

revoke all on function public.record_worker_crew_wage_payment(bigint,bigint,date,date,date,text,text) from public;
grant execute on function public.record_worker_crew_wage_payment(bigint,bigint,date,date,date,text,text) to authenticated;

grant select on public.worker_advances to authenticated;
grant select on public.worker_wage_payment_batches to authenticated;

commit;
