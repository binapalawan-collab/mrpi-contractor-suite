begin;

create or replace function private.guard_project_agreement_snapshot()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  project_contract numeric;
  schedule_basis numeric;
  schedule_percentage numeric;
begin
  project_contract := (new.snapshot_data #>> '{project,current_contract_amount}')::numeric;
  schedule_basis := (new.snapshot_data #>> '{payment_schedule,basis_amount}')::numeric;

  select coalesce(sum((stage.value ->> 'percentage')::numeric), 0)
  into schedule_percentage
  from jsonb_array_elements(new.snapshot_data #> '{payment_schedule,stages}') as stage(value);

  if project_contract is null or schedule_basis is null
    or round(project_contract, 2) <> round(schedule_basis, 2) then
    raise exception 'Jadual Pembayaran mesti disimpan semula berdasarkan nilai kontrak semasa sebelum perjanjian dikeluarkan.';
  end if;

  if round(schedule_percentage, 3) <> 100 then
    raise exception 'Jumlah Jadual Pembayaran mesti tepat 100%%.';
  end if;

  return new;
end;
$$;

create trigger project_agreement_snapshots_guard
before insert on public.project_agreement_snapshots
for each row execute function private.guard_project_agreement_snapshot();

revoke execute on function private.guard_project_agreement_snapshot()
  from public, anon, authenticated, service_role;

commit;
