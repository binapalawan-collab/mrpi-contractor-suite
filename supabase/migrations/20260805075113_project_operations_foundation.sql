begin;

-- Projects are created only from an accepted quotation. The private counter
-- allocates an owner-scoped PRJ-YYYY-### number safely under concurrency.
create table private.project_number_counters (
  company_id bigint not null,
  project_year integer not null,
  last_sequence integer not null,

  constraint project_number_counters_pkey
    primary key (company_id, project_year),
  constraint project_number_counters_company_fkey
    foreign key (company_id)
    references public.companies (id)
    on delete cascade,
  constraint project_number_counters_year_valid
    check (project_year between 2000 and 9999),
  constraint project_number_counters_sequence_positive
    check (last_sequence > 0)
);

alter table private.project_number_counters enable row level security;
revoke all on table private.project_number_counters
  from public, anon, authenticated, service_role;

create policy project_number_counters_no_direct_access
on private.project_number_counters
for all
to public
using (false)
with check (false);

create table public.projects (
  id bigint generated always as identity primary key,
  company_id bigint not null,
  owner_user_id uuid not null,
  quotation_id bigint not null,
  quotation_snapshot_id bigint not null,
  client_id bigint not null,
  site_visit_id bigint,
  project_no text not null,
  project_name text not null,
  quotation_no text not null,
  quotation_revision_no integer not null,
  client_name text not null,
  client_phone text not null,
  client_email text,
  address_line_1 text not null,
  address_line_2 text,
  postcode text,
  city text not null,
  state text not null,
  country_code text not null default 'MY',
  contract_amount numeric(14, 2) not null,
  status text not null default 'preparation',
  planned_start_date date,
  planned_end_date date,
  actual_start_date date,
  work_completed_at timestamptz,
  handed_over_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint projects_company_owner_fkey
    foreign key (company_id, owner_user_id)
    references public.companies (id, owner_user_id)
    on delete cascade,
  constraint projects_quotation_company_owner_fkey
    foreign key (quotation_id, company_id, owner_user_id)
    references public.quotations (id, company_id, owner_user_id)
    on delete restrict,
  constraint projects_snapshot_fkey
    foreign key (quotation_snapshot_id)
    references public.quotation_snapshots (id)
    on delete restrict,
  constraint projects_client_company_owner_fkey
    foreign key (client_id, company_id, owner_user_id)
    references public.clients (id, company_id, owner_user_id)
    on delete restrict,
  constraint projects_site_visit_company_owner_fkey
    foreign key (site_visit_id, company_id, owner_user_id)
    references public.site_visits (id, company_id, owner_user_id)
    on delete restrict,
  constraint projects_identity_key
    unique (id, company_id, owner_user_id),
  constraint projects_quotation_key
    unique (quotation_id),
  constraint projects_number_key
    unique (company_id, project_no),
  constraint projects_number_format
    check (project_no ~ '^PRJ-[0-9]{4}-[0-9]{3,}$'),
  constraint projects_name_not_blank
    check (length(btrim(project_name)) > 0),
  constraint projects_quotation_number_not_blank
    check (length(btrim(quotation_no)) > 0),
  constraint projects_quotation_revision_nonnegative
    check (quotation_revision_no >= 0),
  constraint projects_client_name_not_blank
    check (length(btrim(client_name)) > 0),
  constraint projects_client_phone_not_blank
    check (length(btrim(client_phone)) > 0),
  constraint projects_address_not_blank
    check (length(btrim(address_line_1)) > 0),
  constraint projects_city_not_blank
    check (length(btrim(city)) > 0),
  constraint projects_state_not_blank
    check (length(btrim(state)) > 0),
  constraint projects_country_code_format
    check (country_code ~ '^[A-Z]{2}$'),
  constraint projects_postcode_length
    check (postcode is null or length(postcode) <= 12),
  constraint projects_contract_amount_nonnegative
    check (contract_amount >= 0),
  constraint projects_status_valid
    check (status in (
      'preparation',
      'scheduled',
      'active',
      'work_completed',
      'handed_over'
    )),
  constraint projects_planned_dates_valid
    check (
      planned_start_date is null
      or planned_end_date is null
      or planned_end_date >= planned_start_date
    )
);

create table public.project_sections (
  id bigint generated always as identity primary key,
  project_id bigint not null,
  company_id bigint not null,
  owner_user_id uuid not null,
  source_quotation_section_id bigint not null,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),

  constraint project_sections_project_company_owner_fkey
    foreign key (project_id, company_id, owner_user_id)
    references public.projects (id, company_id, owner_user_id)
    on delete cascade,
  constraint project_sections_source_fkey
    foreign key (source_quotation_section_id)
    references public.quotation_sections (id)
    on delete restrict,
  constraint project_sections_identity_key
    unique (id, project_id, company_id, owner_user_id),
  constraint project_sections_source_key
    unique (project_id, source_quotation_section_id),
  constraint project_sections_name_not_blank
    check (length(btrim(name)) > 0),
  constraint project_sections_sort_order_nonnegative
    check (sort_order >= 0)
);

create table public.project_items (
  id bigint generated always as identity primary key,
  project_id bigint not null,
  section_id bigint not null,
  company_id bigint not null,
  owner_user_id uuid not null,
  source_quotation_item_id bigint not null,
  item_name text not null,
  description text not null,
  measurement_text text,
  calculation_method text not null,
  unit text not null,
  quantity numeric(14, 3) not null,
  rate numeric(14, 2) not null,
  amount numeric(14, 2) not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),

  constraint project_items_section_company_owner_fkey
    foreign key (section_id, project_id, company_id, owner_user_id)
    references public.project_sections (id, project_id, company_id, owner_user_id)
    on delete cascade,
  constraint project_items_source_fkey
    foreign key (source_quotation_item_id)
    references public.quotation_items (id)
    on delete restrict,
  constraint project_items_source_key
    unique (project_id, source_quotation_item_id),
  constraint project_items_name_not_blank
    check (length(btrim(item_name)) > 0),
  constraint project_items_description_not_blank
    check (length(btrim(description)) > 0),
  constraint project_items_measurement_not_blank
    check (measurement_text is null or length(btrim(measurement_text)) > 0),
  constraint project_items_method_valid
    check (calculation_method in ('area', 'length', 'qty', 'lsum')),
  constraint project_items_unit_not_blank
    check (length(btrim(unit)) > 0),
  constraint project_items_quantity_positive
    check (quantity > 0),
  constraint project_items_rate_nonnegative
    check (rate >= 0),
  constraint project_items_amount_matches
    check (amount = round(quantity * rate, 2)),
  constraint project_items_sort_order_nonnegative
    check (sort_order >= 0)
);

create index projects_owner_status_updated_idx
  on public.projects (owner_user_id, status, updated_at desc, id desc);
create index projects_client_company_owner_idx
  on public.projects (client_id, company_id, owner_user_id);
create index projects_site_visit_company_owner_idx
  on public.projects (site_visit_id, company_id, owner_user_id)
  where site_visit_id is not null;
create index projects_snapshot_idx
  on public.projects (quotation_snapshot_id);
create index project_sections_project_owner_sort_idx
  on public.project_sections (
    project_id,
    company_id,
    owner_user_id,
    sort_order,
    id
  );
create index project_sections_source_idx
  on public.project_sections (source_quotation_section_id);
create index project_items_project_section_owner_sort_idx
  on public.project_items (
    project_id,
    section_id,
    company_id,
    owner_user_id,
    sort_order,
    id
  );
create index project_items_source_idx
  on public.project_items (source_quotation_item_id);

comment on table public.projects is
  'Operational project record created only from an accepted quotation. Baseline scope and contract value are locked.';
comment on table public.project_sections is
  'Immutable baseline work areas copied from the accepted quotation.';
comment on table public.project_items is
  'Immutable baseline scope and pricing copied from the accepted quotation. Later changes belong in variation orders.';

create or replace function private.guard_project_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  old_locked jsonb;
  new_locked jsonb;
begin
  old_locked := to_jsonb(old) - array[
    'project_name',
    'status',
    'planned_start_date',
    'planned_end_date',
    'actual_start_date',
    'work_completed_at',
    'handed_over_at',
    'updated_at'
  ];
  new_locked := to_jsonb(new) - array[
    'project_name',
    'status',
    'planned_start_date',
    'planned_end_date',
    'actual_start_date',
    'work_completed_at',
    'handed_over_at',
    'updated_at'
  ];

  if old_locked is distinct from new_locked then
    raise exception 'Skop, pelanggan, alamat dan nilai kontrak asal tidak boleh diubah.';
  end if;
  if length(btrim(new.project_name)) = 0 then
    raise exception 'Nama projek mesti diisi.';
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

revoke execute on function private.guard_project_update()
  from public, anon, authenticated, service_role;

create trigger projects_guard_update
before update on public.projects
for each row execute function private.guard_project_update();

create trigger projects_set_updated_at
before update on public.projects
for each row execute function private.set_updated_at();

alter table public.projects enable row level security;
alter table public.project_sections enable row level security;
alter table public.project_items enable row level security;

revoke all on table public.projects from anon, authenticated;
revoke all on table public.project_sections from anon, authenticated;
revoke all on table public.project_items from anon, authenticated;
revoke all on sequence public.projects_id_seq from anon, authenticated;
revoke all on sequence public.project_sections_id_seq from anon, authenticated;
revoke all on sequence public.project_items_id_seq from anon, authenticated;

grant select, update on table public.projects to authenticated;
grant select on table public.project_sections to authenticated;
grant select on table public.project_items to authenticated;

create policy projects_select_own
on public.projects for select to authenticated
using ((select auth.uid()) = owner_user_id);

create policy projects_update_own
on public.projects for update to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy project_sections_select_own
on public.project_sections for select to authenticated
using ((select auth.uid()) = owner_user_id);

create policy project_items_select_own
on public.project_items for select to authenticated
using ((select auth.uid()) = owner_user_id);

create or replace function public.create_project_from_accepted_quotation(
  p_quotation_id bigint
)
returns public.projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  quotation_row public.quotations;
  project_row public.projects;
  snapshot_id bigint;
  allocated_sequence integer;
  current_year integer := extract(year from current_date)::integer;
  section_row record;
  new_project_section_id bigint;
begin
  if current_user_id is null then
    raise exception 'Sesi pengguna tidak sah.';
  end if;

  select quotation.*
  into quotation_row
  from public.quotations as quotation
  where quotation.id = p_quotation_id
    and quotation.owner_user_id = current_user_id
  for update;

  if not found then
    raise exception 'Sebutharga tidak ditemui.';
  end if;

  select project.*
  into project_row
  from public.projects as project
  where project.quotation_id = quotation_row.id;

  if found then
    return project_row;
  end if;

  if quotation_row.status <> 'accepted' then
    raise exception 'Hanya sebutharga yang telah diterima boleh diteruskan sebagai projek.';
  end if;

  select snapshot.id
  into snapshot_id
  from public.quotation_snapshots as snapshot
  where snapshot.quotation_id = quotation_row.id
    and snapshot.company_id = quotation_row.company_id
    and snapshot.owner_user_id = current_user_id
    and snapshot.revision_no = quotation_row.revision_no;

  if not found then
    raise exception 'Snapshot sebutharga yang diterima tidak ditemui.';
  end if;

  if not exists (
    select 1
    from public.quotation_items as item
    where item.quotation_id = quotation_row.id
      and item.company_id = quotation_row.company_id
      and item.owner_user_id = current_user_id
  ) then
    raise exception 'Sebutharga mesti mempunyai sekurang-kurangnya satu item.';
  end if;

  insert into private.project_number_counters (
    company_id,
    project_year,
    last_sequence
  ) values (
    quotation_row.company_id,
    current_year,
    1
  )
  on conflict (company_id, project_year)
  do update set
    last_sequence = private.project_number_counters.last_sequence + 1
  returning last_sequence into allocated_sequence;

  insert into public.projects (
    company_id,
    owner_user_id,
    quotation_id,
    quotation_snapshot_id,
    client_id,
    site_visit_id,
    project_no,
    project_name,
    quotation_no,
    quotation_revision_no,
    client_name,
    client_phone,
    client_email,
    address_line_1,
    address_line_2,
    postcode,
    city,
    state,
    country_code,
    contract_amount,
    status
  ) values (
    quotation_row.company_id,
    quotation_row.owner_user_id,
    quotation_row.id,
    snapshot_id,
    quotation_row.client_id,
    quotation_row.site_visit_id,
    'PRJ-'
      || current_year::text
      || '-'
      || lpad(allocated_sequence::text, 3, '0'),
    quotation_row.project_title,
    quotation_row.quotation_no,
    quotation_row.revision_no,
    quotation_row.client_name,
    quotation_row.client_phone,
    quotation_row.client_email,
    quotation_row.address_line_1,
    quotation_row.address_line_2,
    quotation_row.postcode,
    quotation_row.city,
    quotation_row.state,
    quotation_row.country_code,
    quotation_row.total_amount,
    'preparation'
  )
  returning * into project_row;

  for section_row in
    select section.*
    from public.quotation_sections as section
    where section.quotation_id = quotation_row.id
      and section.company_id = quotation_row.company_id
      and section.owner_user_id = current_user_id
    order by section.sort_order, section.id
  loop
    insert into public.project_sections (
      project_id,
      company_id,
      owner_user_id,
      source_quotation_section_id,
      name,
      sort_order
    ) values (
      project_row.id,
      project_row.company_id,
      project_row.owner_user_id,
      section_row.id,
      section_row.name,
      section_row.sort_order
    )
    returning id into new_project_section_id;

    insert into public.project_items (
      project_id,
      section_id,
      company_id,
      owner_user_id,
      source_quotation_item_id,
      item_name,
      description,
      measurement_text,
      calculation_method,
      unit,
      quantity,
      rate,
      amount,
      sort_order
    )
    select
      project_row.id,
      new_project_section_id,
      project_row.company_id,
      project_row.owner_user_id,
      item.id,
      item.item_name,
      item.description,
      item.measurement_text,
      item.calculation_method,
      item.unit,
      item.quantity,
      item.rate,
      item.amount,
      item.sort_order
    from public.quotation_items as item
    where item.quotation_id = quotation_row.id
      and item.section_id = section_row.id
      and item.company_id = quotation_row.company_id
      and item.owner_user_id = current_user_id
    order by item.sort_order, item.id;
  end loop;

  return project_row;
end;
$$;

revoke execute on function public.create_project_from_accepted_quotation(bigint)
  from public, anon;
grant execute on function public.create_project_from_accepted_quotation(bigint)
  to authenticated;

commit;
