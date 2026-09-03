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
  project_ids bigint[];
  advance_ids bigint[];
  current_project_id bigint;
  project_advance_ids bigint[];
  attendance_total numeric(14,2) := 0;
  project_outstanding numeric(14,2) := 0;
  advance_total numeric(14,2) := 0;
  project_advance_total numeric(14,2) := 0;
  cash_total numeric(14,2) := 0;
  project_cash numeric(14,2) := 0;
  remaining_cash numeric(14,2) := 0;
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

  if not found then
    raise exception 'Pekerja tidak ditemui.';
  end if;

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

  select coalesce(sum(attendance.wage_amount - attendance.paid_wage_amount), 0)
    into attendance_total
  from public.worker_attendance as attendance
  where attendance.worker_id = worker_row.id
    and attendance.project_id = any(project_ids)
    and attendance.owner_user_id = current_user_id
    and attendance.attendance_date between p_period_start and p_period_end
    and attendance.status in ('present','half_day')
    and attendance.paid_wage_amount < attendance.wage_amount;

  attendance_total := round(coalesce(attendance_total, 0), 2);
  if attendance_total <= 0 then
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
    for update;

    select coalesce(sum(advance.amount), 0), count(*)
      into advance_total, valid_advance_count
    from public.worker_advances as advance
    where advance.id = any(advance_ids)
      and advance.worker_id = worker_row.id
      and advance.project_id = any(project_ids)
      and advance.owner_user_id = current_user_id
      and advance.advance_scope = 'worker'
      and advance.applied_wage_payment_id is null;

    if valid_advance_count <> requested_advance_count then
      raise exception 'Pinjaman tidak sah, bukan pinjaman individu, atau telah digunakan.';
    end if;
  end if;

  advance_total := round(coalesce(advance_total, 0), 2);
  cash_total := round(coalesce(p_cash_amount, attendance_total - advance_total), 2);
  gross_total := round(cash_total + advance_total, 2);

  if gross_total <= 0 then
    raise exception 'Jumlah bayaran mesti melebihi RM0.';
  end if;

  if gross_total > attendance_total then
    raise exception 'Tunai dan pinjaman melebihi baki upah semua projek.';
  end if;

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
    select coalesce(sum(attendance.wage_amount - attendance.paid_wage_amount), 0)
      into project_outstanding
    from public.worker_attendance as attendance
    where attendance.worker_id = worker_row.id
      and attendance.project_id = current_project_id
      and attendance.owner_user_id = current_user_id
      and attendance.attendance_date between p_period_start and p_period_end
      and attendance.status in ('present','half_day')
      and attendance.paid_wage_amount < attendance.wage_amount;

    project_outstanding := round(coalesce(project_outstanding, 0), 2);

    select
      coalesce(array_agg(advance.id order by advance.advance_date, advance.id), '{}'::bigint[]),
      coalesce(sum(advance.amount), 0)
    into project_advance_ids, project_advance_total
    from public.worker_advances as advance
    where advance.id = any(advance_ids)
      and advance.worker_id = worker_row.id
      and advance.project_id = current_project_id
      and advance.owner_user_id = current_user_id
      and advance.advance_scope = 'worker'
      and advance.applied_wage_payment_id is null;

    project_advance_total := round(coalesce(project_advance_total, 0), 2);

    if project_advance_total > project_outstanding then
      raise exception 'Pinjaman untuk satu projek melebihi baki upah projek tersebut.';
    end if;

    project_cash := least(
      remaining_cash,
      greatest(round(project_outstanding - project_advance_total, 2), 0)
    );
    project_cash := round(greatest(coalesce(project_cash, 0), 0), 2);

    if round(project_cash + project_advance_total, 2) > 0 then
      perform public.record_worker_wage_payment_partial(
        worker_row.id,
        current_project_id,
        p_period_start,
        p_period_end,
        coalesce(p_payment_date, current_date),
        null,
        project_cash,
        project_advance_ids,
        p_payment_method,
        coalesce(p_notes, '')
      );

      processed_count := processed_count + 1;
      remaining_cash := round(remaining_cash - project_cash, 2);
    end if;
  end loop;

  if remaining_cash <> 0 then
    raise exception 'Bayaran tunai tidak dapat diagihkan sepenuhnya kepada projek.';
  end if;

  if requested_advance_count > 0 and exists (
    select 1
    from public.worker_advances as advance
    where advance.id = any(advance_ids)
      and advance.owner_user_id = current_user_id
      and advance.applied_wage_payment_id is null
  ) then
    raise exception 'Pinjaman terpilih tidak dapat diagihkan kepada baki upah projek.';
  end if;

  return processed_count;
end;
$$;

revoke all on function public.record_worker_wage_payment_all_projects_partial(bigint,bigint[],date,date,date,numeric,bigint[],text,text) from public;
grant execute on function public.record_worker_wage_payment_all_projects_partial(bigint,bigint[],date,date,date,numeric,bigint[],text,text) to authenticated;
