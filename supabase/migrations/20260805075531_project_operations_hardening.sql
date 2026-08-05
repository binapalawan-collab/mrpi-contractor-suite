begin;

-- Cover the composite foreign keys used by tenant-safe project relationships.
create index if not exists projects_company_owner_idx
  on public.projects (company_id, owner_user_id);
create index if not exists projects_quotation_company_owner_idx
  on public.projects (quotation_id, company_id, owner_user_id);
create index if not exists project_items_section_company_owner_idx
  on public.project_items (section_id, project_id, company_id, owner_user_id);

-- A caller may only provide the accepted quotation id. This private trigger
-- derives every project baseline field from that quotation, so direct inserts
-- cannot forge another tenant, client, address, scope or contract value.
create or replace function private.prepare_project_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  quotation_row public.quotations;
  snapshot_id bigint;
  allocated_sequence integer;
  current_year integer := extract(year from current_date)::integer;
begin
  if current_user_id is null then
    raise exception 'Sesi pengguna tidak sah.';
  end if;

  select quotation.*
  into quotation_row
  from public.quotations as quotation
  where quotation.id = new.quotation_id
    and quotation.owner_user_id = current_user_id
  for update;

  if not found then
    raise exception 'Sebutharga tidak ditemui.';
  end if;

  -- The quotation lock serialises concurrent conversion attempts. Returning
  -- null suppresses a duplicate insert; the public function then returns the
  -- project that already exists.
  if exists (
    select 1
    from public.projects as project
    where project.quotation_id = quotation_row.id
  ) then
    return null;
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

  new.company_id := quotation_row.company_id;
  new.owner_user_id := quotation_row.owner_user_id;
  new.quotation_id := quotation_row.id;
  new.quotation_snapshot_id := snapshot_id;
  new.client_id := quotation_row.client_id;
  new.site_visit_id := quotation_row.site_visit_id;
  new.project_no := 'PRJ-'
    || current_year::text
    || '-'
    || lpad(allocated_sequence::text, 3, '0');
  new.project_name := quotation_row.project_title;
  new.quotation_no := quotation_row.quotation_no;
  new.quotation_revision_no := quotation_row.revision_no;
  new.client_name := quotation_row.client_name;
  new.client_phone := quotation_row.client_phone;
  new.client_email := quotation_row.client_email;
  new.address_line_1 := quotation_row.address_line_1;
  new.address_line_2 := quotation_row.address_line_2;
  new.postcode := quotation_row.postcode;
  new.city := quotation_row.city;
  new.state := quotation_row.state;
  new.country_code := quotation_row.country_code;
  new.contract_amount := quotation_row.total_amount;
  new.status := 'preparation';
  new.planned_start_date := null;
  new.planned_end_date := null;
  new.actual_start_date := null;
  new.work_completed_at := null;
  new.handed_over_at := null;
  new.created_at := now();
  new.updated_at := now();

  return new;
end;
$$;

revoke execute on function private.prepare_project_insert()
  from public, anon, authenticated, service_role;

-- Copy the immutable quotation baseline only after the protected project row
-- exists. Users receive read-only access to these child tables.
create or replace function private.copy_project_baseline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  section_row record;
  new_project_section_id bigint;
begin
  for section_row in
    select section.*
    from public.quotation_sections as section
    where section.quotation_id = new.quotation_id
      and section.company_id = new.company_id
      and section.owner_user_id = new.owner_user_id
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
      new.id,
      new.company_id,
      new.owner_user_id,
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
      new.id,
      new_project_section_id,
      new.company_id,
      new.owner_user_id,
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
    where item.quotation_id = new.quotation_id
      and item.section_id = section_row.id
      and item.company_id = new.company_id
      and item.owner_user_id = new.owner_user_id
    order by item.sort_order, item.id;
  end loop;

  return new;
end;
$$;

revoke execute on function private.copy_project_baseline()
  from public, anon, authenticated, service_role;

drop trigger if exists projects_prepare_insert on public.projects;
create trigger projects_prepare_insert
before insert on public.projects
for each row execute function private.prepare_project_insert();

drop trigger if exists projects_copy_baseline on public.projects;
create trigger projects_copy_baseline
after insert on public.projects
for each row execute function private.copy_project_baseline();

grant insert on table public.projects to authenticated;
grant usage, select on sequence public.projects_id_seq to authenticated;

drop policy if exists projects_insert_own on public.projects;
create policy projects_insert_own
on public.projects for insert to authenticated
with check ((select auth.uid()) = owner_user_id);

-- Keep the API-facing function security-invoker. Privileged copying is
-- isolated inside non-executable private trigger functions.
create or replace function public.create_project_from_accepted_quotation(
  p_quotation_id bigint
)
returns public.projects
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  project_row public.projects;
begin
  if current_user_id is null then
    raise exception 'Sesi pengguna tidak sah.';
  end if;

  select project.*
  into project_row
  from public.projects as project
  where project.quotation_id = p_quotation_id
    and project.owner_user_id = current_user_id;

  if found then
    return project_row;
  end if;

  insert into public.projects (quotation_id)
  values (p_quotation_id)
  returning * into project_row;

  if not found then
    select project.*
    into project_row
    from public.projects as project
    where project.quotation_id = p_quotation_id
      and project.owner_user_id = current_user_id;
  end if;

  if not found then
    raise exception 'Projek tidak dapat dicipta.';
  end if;

  return project_row;
end;
$$;

revoke execute on function public.create_project_from_accepted_quotation(bigint)
  from public, anon;
grant execute on function public.create_project_from_accepted_quotation(bigint)
  to authenticated;

commit;
