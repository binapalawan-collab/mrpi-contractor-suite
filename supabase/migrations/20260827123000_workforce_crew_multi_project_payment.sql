create or replace function public.record_worker_crew_wage_payment_all_projects(
  p_head_worker_id bigint,
  p_project_ids bigint[],
  p_period_start date,
  p_period_end date,
  p_payment_date date,
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
  current_project_id bigint;
  project_ids bigint[];
  processed_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'Sesi pengguna tidak sah.';
  end if;

  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception 'Tempoh bayaran kumpulan tidak sah.';
  end if;

  if p_payment_method not in ('cash','bank_transfer','cheque','other') then
    raise exception 'Kaedah bayaran tidak sah.';
  end if;

  select coalesce(array_agg(distinct project_id order by project_id), '{}'::bigint[])
    into project_ids
  from unnest(coalesce(p_project_ids, '{}'::bigint[])) as project_id
  where project_id is not null;

  if coalesce(array_length(project_ids, 1), 0) = 0 then
    raise exception 'Tiada projek tertunggak dipilih untuk bayaran kumpulan.';
  end if;

  foreach current_project_id in array project_ids
  loop
    perform public.record_worker_crew_wage_payment(
      p_head_worker_id,
      current_project_id,
      p_period_start,
      p_period_end,
      coalesce(p_payment_date, current_date),
      p_payment_method,
      coalesce(p_notes, '')
    );
    processed_count := processed_count + 1;
  end loop;

  return processed_count;
end;
$$;

revoke all on function public.record_worker_crew_wage_payment_all_projects(bigint,bigint[],date,date,date,text,text) from public;
grant execute on function public.record_worker_crew_wage_payment_all_projects(bigint,bigint[],date,date,date,text,text) to authenticated;
