begin;

alter table public.projects
  add column if not exists project_alias text;

alter table public.projects
  drop constraint if exists projects_project_alias_length_check;

alter table public.projects
  add constraint projects_project_alias_length_check
  check (project_alias is null or char_length(btrim(project_alias)) between 1 and 120);

create or replace function private.guard_project_update()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  old_locked jsonb;
  new_locked jsonb;
begin
  new.approved_variation_amount := coalesce((
    select sum(variation_order.net_amount)
    from public.variation_orders as variation_order
    where variation_order.project_id = old.id
      and variation_order.company_id = old.company_id
      and variation_order.owner_user_id = old.owner_user_id
      and variation_order.status = 'approved'
  ), 0);

  old_locked := to_jsonb(old) - array[
    'project_name',
    'project_alias',
    'status',
    'planned_start_date',
    'planned_end_date',
    'actual_start_date',
    'work_completed_at',
    'handed_over_at',
    'approved_variation_amount',
    'current_contract_amount',
    'updated_at'
  ];
  new_locked := to_jsonb(new) - array[
    'project_name',
    'project_alias',
    'status',
    'planned_start_date',
    'planned_end_date',
    'actual_start_date',
    'work_completed_at',
    'handed_over_at',
    'approved_variation_amount',
    'current_contract_amount',
    'updated_at'
  ];

  if old_locked is distinct from new_locked then
    raise exception 'Skop, pelanggan, alamat dan nilai kontrak asal tidak boleh diubah.';
  end if;
  if length(btrim(new.project_name)) = 0 then
    raise exception 'Nama projek mesti diisi.';
  end if;
  if new.project_alias is not null and length(btrim(new.project_alias)) = 0 then
    raise exception 'Project Alias tidak boleh kosong.';
  end if;
  if new.planned_start_date is not null
    and new.planned_end_date is not null
    and new.planned_end_date < new.planned_start_date then
    raise exception 'Tarikh siap sasaran tidak boleh lebih awal daripada tarikh mula.';
  end if;

  if new.status = old.status then
    if (new.actual_start_date, new.work_completed_at, new.handed_over_at)
      is distinct from
      (old.actual_start_date, old.work_completed_at, old.handed_over_at) then
      raise exception 'Tarikh status projek dikawal oleh aliran projek.';
    end if;
    return new;
  end if;

  if (new.actual_start_date, new.work_completed_at, new.handed_over_at)
    is distinct from
    (old.actual_start_date, old.work_completed_at, old.handed_over_at) then
    raise exception 'Tarikh status projek dikawal oleh aliran projek.';
  end if;

  if old.status = 'preparation' and new.status = 'scheduled' then
    null;
  elsif old.status = 'scheduled' and new.status = 'active' then
    new.actual_start_date := coalesce(old.actual_start_date, current_date);
  elsif old.status = 'active' and new.status = 'work_completed' then
    new.work_completed_at := coalesce(old.work_completed_at, now());
  elsif old.status = 'work_completed' and new.status = 'handed_over' then
    new.handed_over_at := coalesce(old.handed_over_at, now());
  else
    raise exception 'Peralihan status projek mesti mengikut urutan Persediaan, Dijadualkan, Aktif, Siap Kerja dan Diserahkan.';
  end if;

  return new;
end;
$$;

update public.projects as p
set project_alias = nullif(btrim(a.display_name), '')
from public.workforce_project_aliases as a
where a.project_id = p.id
  and p.project_alias is null
  and nullif(btrim(a.display_name), '') is not null;

comment on column public.projects.project_alias is
  'Shared short project display name managed in MRPI Contractor Suite and used by Workforce and Project Expenses UI.';

commit;
