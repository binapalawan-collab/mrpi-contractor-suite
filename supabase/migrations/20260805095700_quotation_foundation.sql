begin;

-- Daily counters stay outside the exposed Data API. They allocate quote numbers
-- atomically while still allowing an owner to replace the generated number.
create table private.quotation_number_counters (
  company_id bigint not null,
  quotation_date date not null,
  last_sequence integer not null,

  constraint quotation_number_counters_pkey
    primary key (company_id, quotation_date),
  constraint quotation_number_counters_company_fkey
    foreign key (company_id)
    references public.companies (id)
    on delete cascade,
  constraint quotation_number_counters_sequence_positive
    check (last_sequence > 0)
);

alter table private.quotation_number_counters enable row level security;
revoke all on table private.quotation_number_counters from public, anon, authenticated, service_role;

create table public.quotations (
  id bigint generated always as identity primary key,
  company_id bigint not null,
  owner_user_id uuid not null,
  client_id bigint not null,
  site_visit_id bigint,
  draft_key uuid not null default gen_random_uuid(),
  quotation_no text not null,
  quotation_date date not null default current_date,
  language text not null default 'ms',
  client_name text not null,
  client_phone text not null,
  client_email text,
  project_title text not null,
  address_line_1 text not null,
  address_line_2 text,
  postcode text,
  city text not null,
  state text not null default 'Johor',
  country_code text not null default 'MY',
  validity_days integer not null default 30,
  status text not null default 'draft',
  revision_no integer not null default 0,
  total_amount numeric(14, 2) not null default 0,
  notes text,
  sent_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint quotations_company_owner_fkey
    foreign key (company_id, owner_user_id)
    references public.companies (id, owner_user_id)
    on delete cascade,
  constraint quotations_client_company_owner_fkey
    foreign key (client_id, company_id, owner_user_id)
    references public.clients (id, company_id, owner_user_id)
    on delete restrict,
  constraint quotations_site_visit_company_owner_fkey
    foreign key (site_visit_id, company_id, owner_user_id)
    references public.site_visits (id, company_id, owner_user_id)
    on delete restrict,
  constraint quotations_identity_key
    unique (id, company_id, owner_user_id),
  constraint quotations_visit_identity_key
    unique (id, site_visit_id, company_id, owner_user_id),
  constraint quotations_draft_key
    unique (company_id, draft_key),
  constraint quotations_number_revision_key
    unique (company_id, quotation_no, revision_no),
  constraint quotations_number_not_blank check (length(btrim(quotation_no)) > 0),
  constraint quotations_number_trimmed check (quotation_no = btrim(quotation_no)),
  constraint quotations_client_name_not_blank check (length(btrim(client_name)) > 0),
  constraint quotations_client_phone_not_blank check (length(btrim(client_phone)) > 0),
  constraint quotations_project_title_not_blank check (length(btrim(project_title)) > 0),
  constraint quotations_address_line_1_not_blank check (length(btrim(address_line_1)) > 0),
  constraint quotations_city_not_blank check (length(btrim(city)) > 0),
  constraint quotations_state_not_blank check (length(btrim(state)) > 0),
  constraint quotations_country_code_format check (country_code ~ '^[A-Z]{2}$'),
  constraint quotations_postcode_length check (postcode is null or length(postcode) <= 12),
  constraint quotations_language_valid check (language in ('ms', 'en')),
  constraint quotations_validity_days_valid check (validity_days between 1 and 365),
  constraint quotations_status_valid check (
    status in ('draft', 'sent', 'accepted', 'rejected', 'expired', 'archived')
  ),
  constraint quotations_revision_nonnegative check (revision_no >= 0),
  constraint quotations_total_nonnegative check (total_amount >= 0)
);

create table public.quotation_sections (
  id bigint generated always as identity primary key,
  quotation_id bigint not null,
  company_id bigint not null,
  owner_user_id uuid not null,
  source_site_visit_id bigint,
  source_site_visit_area_id bigint,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint quotation_sections_quotation_company_owner_fkey
    foreign key (quotation_id, company_id, owner_user_id)
    references public.quotations (id, company_id, owner_user_id)
    on delete cascade,
  constraint quotation_sections_source_quotation_fkey
    foreign key (quotation_id, source_site_visit_id, company_id, owner_user_id)
    references public.quotations (id, site_visit_id, company_id, owner_user_id)
    on delete cascade,
  constraint quotation_sections_source_area_fkey
    foreign key (
      source_site_visit_area_id,
      source_site_visit_id,
      company_id,
      owner_user_id
    )
    references public.site_visit_areas (
      id,
      site_visit_id,
      company_id,
      owner_user_id
    )
    on delete restrict,
  constraint quotation_sections_identity_key
    unique (id, quotation_id, company_id, owner_user_id),
  constraint quotation_sections_source_pair check (
    (source_site_visit_id is null and source_site_visit_area_id is null)
    or
    (source_site_visit_id is not null and source_site_visit_area_id is not null)
  ),
  constraint quotation_sections_name_not_blank check (length(btrim(name)) > 0),
  constraint quotation_sections_sort_order_nonnegative check (sort_order >= 0)
);

alter table public.company_catalog_items
  add constraint company_catalog_items_identity_key
  unique (id, company_id, owner_user_id);

create table public.quotation_items (
  id bigint generated always as identity primary key,
  quotation_id bigint not null,
  section_id bigint not null,
  company_id bigint not null,
  owner_user_id uuid not null,
  catalog_item_id bigint,
  source_site_visit_id bigint,
  source_site_visit_area_id bigint,
  source_site_visit_entry_id bigint,
  item_name text not null,
  description text not null,
  measurement_text text,
  calculation_method text not null default 'qty',
  unit text not null,
  quantity numeric(14, 3) not null default 1,
  rate numeric(14, 2) not null default 0,
  amount numeric(14, 2) generated always as (round(quantity * rate, 2)) stored,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint quotation_items_section_company_owner_fkey
    foreign key (section_id, quotation_id, company_id, owner_user_id)
    references public.quotation_sections (id, quotation_id, company_id, owner_user_id)
    on delete cascade,
  constraint quotation_items_catalog_company_owner_fkey
    foreign key (catalog_item_id, company_id, owner_user_id)
    references public.company_catalog_items (id, company_id, owner_user_id)
    on delete restrict,
  constraint quotation_items_source_entry_fkey
    foreign key (
      source_site_visit_entry_id,
      source_site_visit_area_id,
      source_site_visit_id,
      company_id,
      owner_user_id
    )
    references public.site_visit_entries (
      id,
      area_id,
      site_visit_id,
      company_id,
      owner_user_id
    )
    on delete restrict,
  constraint quotation_items_source_triplet check (
    (
      source_site_visit_id is null
      and source_site_visit_area_id is null
      and source_site_visit_entry_id is null
    )
    or
    (
      source_site_visit_id is not null
      and source_site_visit_area_id is not null
      and source_site_visit_entry_id is not null
    )
  ),
  constraint quotation_items_name_not_blank check (length(btrim(item_name)) > 0),
  constraint quotation_items_description_not_blank check (length(btrim(description)) > 0),
  constraint quotation_items_measurement_not_blank check (
    measurement_text is null or length(btrim(measurement_text)) > 0
  ),
  constraint quotation_items_method_valid check (
    calculation_method in ('area', 'length', 'qty', 'lsum')
  ),
  constraint quotation_items_unit_not_blank check (length(btrim(unit)) > 0),
  constraint quotation_items_quantity_positive check (quantity > 0),
  constraint quotation_items_rate_nonnegative check (rate >= 0),
  constraint quotation_items_sort_order_nonnegative check (sort_order >= 0)
);

create table public.quotation_snapshots (
  id bigint generated always as identity primary key,
  quotation_id bigint not null,
  company_id bigint not null,
  owner_user_id uuid not null,
  revision_no integer not null,
  snapshot_data jsonb not null,
  created_at timestamptz not null default now(),

  constraint quotation_snapshots_quotation_company_owner_fkey
    foreign key (quotation_id, company_id, owner_user_id)
    references public.quotations (id, company_id, owner_user_id)
    on delete cascade,
  constraint quotation_snapshots_revision_key
    unique (quotation_id, revision_no),
  constraint quotation_snapshots_revision_nonnegative check (revision_no >= 0),
  constraint quotation_snapshots_data_object check (jsonb_typeof(snapshot_data) = 'object')
);

create unique index quotations_active_site_visit_key
  on public.quotations (company_id, site_visit_id)
  where site_visit_id is not null and status <> 'archived';

create index quotations_owner_status_date_idx
  on public.quotations (owner_user_id, status, quotation_date desc, id desc);
create index quotations_client_company_owner_idx
  on public.quotations (client_id, company_id, owner_user_id);
create index quotations_site_visit_company_owner_idx
  on public.quotations (site_visit_id, company_id, owner_user_id)
  where site_visit_id is not null;
create index quotation_sections_quote_owner_sort_idx
  on public.quotation_sections (quotation_id, company_id, owner_user_id, sort_order, id);
create index quotation_sections_source_area_idx
  on public.quotation_sections (
    source_site_visit_area_id,
    source_site_visit_id,
    company_id,
    owner_user_id
  )
  where source_site_visit_area_id is not null;
create index quotation_items_quote_section_owner_sort_idx
  on public.quotation_items (
    quotation_id,
    section_id,
    company_id,
    owner_user_id,
    sort_order,
    id
  );
create index quotation_items_catalog_company_owner_idx
  on public.quotation_items (catalog_item_id, company_id, owner_user_id)
  where catalog_item_id is not null;
create index quotation_items_source_entry_idx
  on public.quotation_items (
    source_site_visit_entry_id,
    source_site_visit_area_id,
    source_site_visit_id,
    company_id,
    owner_user_id
  )
  where source_site_visit_entry_id is not null;
create index quotation_snapshots_quote_owner_revision_idx
  on public.quotation_snapshots (quotation_id, company_id, owner_user_id, revision_no desc);

comment on table public.quotations is
  'Current quotation working copy. Accepted quotations are immutable and sent copies are revision controlled.';
comment on column public.quotations.quotation_no is
  'Defaults to SHDDMMYY-XX and remains manually editable while the quotation is a draft.';
comment on column public.quotations.language is
  'Document language: Bahasa Melayu (ms) or English (en).';
comment on table public.quotation_sections is
  'User-controlled quotation work areas. Site visit areas may be copied without creating priced items.';
comment on table public.quotation_items is
  'Priced catalog or manual items selected explicitly by the owner.';
comment on table public.quotation_snapshots is
  'Immutable JSON snapshots created when each quotation revision is sent.';

create or replace function private.assign_quotation_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  allocated_sequence integer;
begin
  if (select auth.uid()) is null or (select auth.uid()) <> new.owner_user_id then
    raise exception 'Quotation owner does not match the authenticated user.';
  end if;

  new.quotation_no := nullif(btrim(new.quotation_no), '');
  if new.quotation_no is not null then
    return new;
  end if;

  insert into private.quotation_number_counters (
    company_id,
    quotation_date,
    last_sequence
  ) values (
    new.company_id,
    new.quotation_date,
    1
  )
  on conflict (company_id, quotation_date)
  do update set last_sequence = private.quotation_number_counters.last_sequence + 1
  returning last_sequence into allocated_sequence;

  new.quotation_no := 'SH'
    || to_char(new.quotation_date, 'DDMMYY')
    || '-'
    || lpad(allocated_sequence::text, 2, '0');

  return new;
end;
$$;

revoke execute on function private.assign_quotation_number() from public, anon, authenticated, service_role;

create or replace function private.guard_quotation_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  old_content jsonb;
  new_content jsonb;
begin
  if old.status = 'accepted' then
    raise exception 'Sebutharga yang telah diterima tidak boleh diubah.';
  end if;

  old_content := to_jsonb(old) - array[
    'status', 'revision_no', 'sent_at', 'accepted_at', 'updated_at'
  ];
  new_content := to_jsonb(new) - array[
    'status', 'revision_no', 'sent_at', 'accepted_at', 'updated_at'
  ];

  if old.status = 'sent' then
    if old_content is distinct from new_content then
      raise exception 'Mulakan revision baharu sebelum mengubah sebutharga yang telah dihantar.';
    end if;

    if new.status = 'draft' and new.revision_no = old.revision_no + 1 then
      return new;
    end if;

    if new.status in ('accepted', 'rejected', 'expired', 'archived')
      and new.revision_no = old.revision_no then
      return new;
    end if;

    raise exception 'Peralihan status sebutharga tidak sah.';
  end if;

  if old.status in ('rejected', 'expired', 'archived') then
    if old_content is distinct from new_content
      or new.status <> 'draft'
      or new.revision_no <> old.revision_no + 1 then
      raise exception 'Mulakan revision baharu sebelum mengubah sebutharga ini.';
    end if;
    return new;
  end if;

  if old.status = 'draft' and new.status = 'accepted' then
    raise exception 'Sebutharga mesti ditandakan dihantar sebelum diterima.';
  end if;

  if new.revision_no <> old.revision_no then
    raise exception 'Nombor revision hanya boleh bertambah apabila memulakan pindaan.';
  end if;

  return new;
end;
$$;

revoke execute on function private.guard_quotation_mutation() from public, anon, authenticated, service_role;

create or replace function private.guard_quotation_child_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_quotation_id bigint;
  target_status text;
begin
  target_quotation_id := case when tg_op = 'DELETE' then old.quotation_id else new.quotation_id end;

  if tg_op = 'UPDATE' and (
    new.quotation_id,
    new.company_id,
    new.owner_user_id
  ) is distinct from (
    old.quotation_id,
    old.company_id,
    old.owner_user_id
  ) then
    raise exception 'Item atau ruangan tidak boleh dipindahkan ke sebutharga lain.';
  end if;

  select quotation.status
  into target_status
  from public.quotations as quotation
  where quotation.id = target_quotation_id
    and quotation.owner_user_id = (select auth.uid());

  if target_status is distinct from 'draft' then
    raise exception 'Hanya draf sebutharga boleh diubah.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_quotation_child_mutation() from public, anon, authenticated, service_role;

create or replace function private.refresh_quotation_total()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_quotation_id bigint;
begin
  target_quotation_id := case when tg_op = 'DELETE' then old.quotation_id else new.quotation_id end;

  update public.quotations as quotation
  set total_amount = coalesce((
    select sum(item.amount)
    from public.quotation_items as item
    where item.quotation_id = target_quotation_id
  ), 0)
  where quotation.id = target_quotation_id
    and quotation.owner_user_id = (select auth.uid());

  return null;
end;
$$;

revoke execute on function private.refresh_quotation_total() from public, anon, authenticated, service_role;

create trigger quotations_assign_number
before insert on public.quotations
for each row execute function private.assign_quotation_number();

create trigger quotations_guard_mutation
before update on public.quotations
for each row execute function private.guard_quotation_mutation();

create trigger quotations_set_updated_at
before update on public.quotations
for each row execute function private.set_updated_at();

create trigger quotation_sections_guard_mutation
before insert or update or delete on public.quotation_sections
for each row execute function private.guard_quotation_child_mutation();

create trigger quotation_sections_set_updated_at
before update on public.quotation_sections
for each row execute function private.set_updated_at();

create trigger quotation_items_guard_mutation
before insert or update or delete on public.quotation_items
for each row execute function private.guard_quotation_child_mutation();

create trigger quotation_items_set_updated_at
before update on public.quotation_items
for each row execute function private.set_updated_at();

create trigger quotation_items_refresh_total
after insert or update or delete on public.quotation_items
for each row execute function private.refresh_quotation_total();

alter table public.quotations enable row level security;
alter table public.quotation_sections enable row level security;
alter table public.quotation_items enable row level security;
alter table public.quotation_snapshots enable row level security;

revoke all on table public.quotations from anon, authenticated;
revoke all on table public.quotation_sections from anon, authenticated;
revoke all on table public.quotation_items from anon, authenticated;
revoke all on table public.quotation_snapshots from anon, authenticated;

revoke all on sequence public.quotations_id_seq from anon, authenticated;
revoke all on sequence public.quotation_sections_id_seq from anon, authenticated;
revoke all on sequence public.quotation_items_id_seq from anon, authenticated;
revoke all on sequence public.quotation_snapshots_id_seq from anon, authenticated;

grant select, insert, update on table public.quotations to authenticated;
grant select, insert, update, delete on table public.quotation_sections to authenticated;
grant select, insert, update, delete on table public.quotation_items to authenticated;
grant select, insert on table public.quotation_snapshots to authenticated;

grant usage, select on sequence public.quotations_id_seq to authenticated;
grant usage, select on sequence public.quotation_sections_id_seq to authenticated;
grant usage, select on sequence public.quotation_items_id_seq to authenticated;
grant usage, select on sequence public.quotation_snapshots_id_seq to authenticated;

create policy quotations_select_own
on public.quotations for select to authenticated
using ((select auth.uid()) = owner_user_id);

create policy quotations_insert_own
on public.quotations for insert to authenticated
with check ((select auth.uid()) = owner_user_id);

create policy quotations_update_own
on public.quotations for update to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy quotation_sections_select_own
on public.quotation_sections for select to authenticated
using ((select auth.uid()) = owner_user_id);

create policy quotation_sections_insert_own
on public.quotation_sections for insert to authenticated
with check ((select auth.uid()) = owner_user_id);

create policy quotation_sections_update_own
on public.quotation_sections for update to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy quotation_sections_delete_own
on public.quotation_sections for delete to authenticated
using ((select auth.uid()) = owner_user_id);

create policy quotation_items_select_own
on public.quotation_items for select to authenticated
using ((select auth.uid()) = owner_user_id);

create policy quotation_items_insert_own
on public.quotation_items for insert to authenticated
with check ((select auth.uid()) = owner_user_id);

create policy quotation_items_update_own
on public.quotation_items for update to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy quotation_items_delete_own
on public.quotation_items for delete to authenticated
using ((select auth.uid()) = owner_user_id);

create policy quotation_snapshots_select_own
on public.quotation_snapshots for select to authenticated
using ((select auth.uid()) = owner_user_id);

create policy quotation_snapshots_insert_own
on public.quotation_snapshots for insert to authenticated
with check ((select auth.uid()) = owner_user_id);

commit;
