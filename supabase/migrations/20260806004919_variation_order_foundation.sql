begin;

-- Variation Orders never overwrite the accepted quotation baseline. Projects
-- keep the original contract amount and expose a separately calculated current
-- contract value after approved VO additions and deductions.
alter table public.projects
  add column approved_variation_amount numeric(14, 2) not null default 0,
  add column current_contract_amount numeric(14, 2)
    generated always as (
      round(contract_amount + approved_variation_amount, 2)
    ) stored;

alter table public.projects
  add constraint projects_current_contract_nonnegative
    check (current_contract_amount >= 0);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'project_items_identity_key'
      and conrelid = 'public.project_items'::regclass
  ) then
    alter table public.project_items
      add constraint project_items_identity_key
        unique (id, project_id, company_id, owner_user_id);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'company_catalog_items_identity_key'
      and conrelid = 'public.company_catalog_items'::regclass
  ) then
    alter table public.company_catalog_items
      add constraint company_catalog_items_identity_key
        unique (id, company_id, owner_user_id);
  end if;
end;
$$;

-- Each project owns its own VO-001, VO-002, ... sequence.
create table private.variation_order_number_counters (
  project_id bigint primary key,
  last_sequence integer not null,

  constraint variation_order_number_counters_project_fkey
    foreign key (project_id)
    references public.projects (id)
    on delete cascade,
  constraint variation_order_number_counters_sequence_positive
    check (last_sequence > 0)
);

alter table private.variation_order_number_counters enable row level security;
revoke all on table private.variation_order_number_counters
  from public, anon, authenticated, service_role;

create policy variation_order_number_counters_no_direct_access
on private.variation_order_number_counters
for all
to public
using (false)
with check (false);

create table public.variation_orders (
  id bigint generated always as identity primary key,
  project_id bigint not null,
  company_id bigint not null,
  owner_user_id uuid not null,
  vo_no text not null,
  vo_date date not null default current_date,
  title text not null default 'PERUBAHAN KERJA',
  reason text not null default '',
  status text not null default 'draft',
  revision_no integer not null default 0,
  time_impact_days integer not null default 0,
  net_amount numeric(14, 2) not null default 0,
  approval_method text,
  approval_note text,
  sent_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint variation_orders_project_company_owner_fkey
    foreign key (project_id, company_id, owner_user_id)
    references public.projects (id, company_id, owner_user_id)
    on delete cascade,
  constraint variation_orders_identity_key
    unique (id, project_id, company_id, owner_user_id),
  constraint variation_orders_number_key
    unique (project_id, vo_no),
  constraint variation_orders_number_format
    check (vo_no ~ '^VO-[0-9]{3,}$'),
  constraint variation_orders_title_not_blank
    check (length(btrim(title)) > 0),
  constraint variation_orders_reason_length
    check (length(reason) <= 4000),
  constraint variation_orders_status_valid
    check (status in ('draft', 'sent', 'approved', 'rejected', 'archived')),
  constraint variation_orders_revision_nonnegative
    check (revision_no >= 0),
  constraint variation_orders_time_impact_range
    check (time_impact_days between -3650 and 3650),
  constraint variation_orders_approval_method_valid
    check (
      approval_method is null
      or approval_method in ('whatsapp', 'verbal', 'written', 'other')
    ),
  constraint variation_orders_approval_note_length
    check (approval_note is null or length(approval_note) <= 2000),
  constraint variation_orders_status_timestamps_valid
    check (
      (status <> 'approved' or (approved_at is not null and rejected_at is null))
      and (status <> 'rejected' or (rejected_at is not null and approved_at is null))
    )
);

create table public.variation_order_sections (
  id bigint generated always as identity primary key,
  variation_order_id bigint not null,
  project_id bigint not null,
  company_id bigint not null,
  owner_user_id uuid not null,
  source_project_section_id bigint,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint variation_order_sections_order_company_owner_fkey
    foreign key (
      variation_order_id,
      project_id,
      company_id,
      owner_user_id
    )
    references public.variation_orders (
      id,
      project_id,
      company_id,
      owner_user_id
    )
    on delete cascade,
  constraint variation_order_sections_source_project_fkey
    foreign key (
      source_project_section_id,
      project_id,
      company_id,
      owner_user_id
    )
    references public.project_sections (
      id,
      project_id,
      company_id,
      owner_user_id
    )
    on delete restrict,
  constraint variation_order_sections_identity_key
    unique (
      id,
      variation_order_id,
      project_id,
      company_id,
      owner_user_id
    ),
  constraint variation_order_sections_name_not_blank
    check (length(btrim(name)) > 0),
  constraint variation_order_sections_sort_nonnegative
    check (sort_order >= 0)
);

create table public.variation_order_items (
  id bigint generated always as identity primary key,
  variation_order_id bigint not null,
  section_id bigint not null,
  project_id bigint not null,
  company_id bigint not null,
  owner_user_id uuid not null,
  catalog_item_id bigint,
  source_project_item_id bigint,
  change_type text not null default 'addition',
  direction text not null default 'add',
  item_name text not null,
  description text not null,
  measurement_text text,
  calculation_method text not null default 'qty',
  unit text not null,
  quantity numeric(14, 3) not null default 1,
  rate numeric(14, 2) not null default 0,
  line_amount numeric(14, 2)
    generated always as (round(quantity * rate, 2)) stored,
  signed_amount numeric(14, 2)
    generated always as (
      case
        when direction = 'deduct' then -round(quantity * rate, 2)
        else round(quantity * rate, 2)
      end
    ) stored,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint variation_order_items_section_order_company_owner_fkey
    foreign key (
      section_id,
      variation_order_id,
      project_id,
      company_id,
      owner_user_id
    )
    references public.variation_order_sections (
      id,
      variation_order_id,
      project_id,
      company_id,
      owner_user_id
    )
    on delete cascade,
  constraint variation_order_items_catalog_company_owner_fkey
    foreign key (catalog_item_id, company_id, owner_user_id)
    references public.company_catalog_items (id, company_id, owner_user_id)
    on delete restrict,
  constraint variation_order_items_source_project_fkey
    foreign key (
      source_project_item_id,
      project_id,
      company_id,
      owner_user_id
    )
    references public.project_items (
      id,
      project_id,
      company_id,
      owner_user_id
    )
    on delete restrict,
  constraint variation_order_items_name_not_blank
    check (length(btrim(item_name)) > 0),
  constraint variation_order_items_description_not_blank
    check (length(btrim(description)) > 0),
  constraint variation_order_items_measurement_not_blank
    check (measurement_text is null or length(btrim(measurement_text)) > 0),
  constraint variation_order_items_change_type_valid
    check (change_type in (
      'addition',
      'omission',
      'replacement',
      'specification',
      'discount'
    )),
  constraint variation_order_items_direction_valid
    check (direction in ('add', 'deduct')),
  constraint variation_order_items_method_valid
    check (calculation_method in ('area', 'length', 'qty', 'lsum')),
  constraint variation_order_items_unit_not_blank
    check (length(btrim(unit)) > 0),
  constraint variation_order_items_quantity_positive
    check (quantity > 0),
  constraint variation_order_items_rate_nonnegative
    check (rate >= 0),
  constraint variation_order_items_sort_nonnegative
    check (sort_order >= 0)
);

create table public.variation_order_snapshots (
  id bigint generated always as identity primary key,
  variation_order_id bigint not null,
  project_id bigint not null,
  company_id bigint not null,
  owner_user_id uuid not null,
  revision_no integer not null,
  snapshot_data jsonb not null,
  created_at timestamptz not null default now(),

  constraint variation_order_snapshots_order_company_owner_fkey
    foreign key (
      variation_order_id,
      project_id,
      company_id,
      owner_user_id
    )
    references public.variation_orders (
      id,
      project_id,
      company_id,
      owner_user_id
    )
    on delete cascade,
  constraint variation_order_snapshots_revision_key
    unique (variation_order_id, revision_no),
  constraint variation_order_snapshots_revision_nonnegative
    check (revision_no >= 0),
  constraint variation_order_snapshots_data_object
    check (jsonb_typeof(snapshot_data) = 'object')
);

create index variation_orders_owner_status_updated_idx
  on public.variation_orders (
    owner_user_id,
    status,
    updated_at desc,
    id desc
  );
create index variation_orders_project_company_owner_idx
  on public.variation_orders (project_id, company_id, owner_user_id);
create index variation_order_sections_order_owner_sort_idx
  on public.variation_order_sections (
    variation_order_id,
    project_id,
    company_id,
    owner_user_id,
    sort_order,
    id
  );
create index variation_order_sections_source_project_idx
  on public.variation_order_sections (
    source_project_section_id,
    project_id,
    company_id,
    owner_user_id
  )
  where source_project_section_id is not null;
create index variation_order_items_section_order_owner_sort_idx
  on public.variation_order_items (
    section_id,
    variation_order_id,
    project_id,
    company_id,
    owner_user_id,
    sort_order,
    id
  );
create index variation_order_items_order_owner_sort_idx
  on public.variation_order_items (
    variation_order_id,
    company_id,
    owner_user_id,
    sort_order,
    id
  );
create index variation_order_items_catalog_owner_idx
  on public.variation_order_items (
    catalog_item_id,
    company_id,
    owner_user_id
  )
  where catalog_item_id is not null;
create index variation_order_items_source_project_idx
  on public.variation_order_items (
    source_project_item_id,
    project_id,
    company_id,
    owner_user_id
  )
  where source_project_item_id is not null;
create index variation_order_snapshots_order_owner_idx
  on public.variation_order_snapshots (
    variation_order_id,
    project_id,
    company_id,
    owner_user_id
  );

comment on column public.projects.contract_amount is
  'Immutable accepted-quotation baseline, excluding Variation Orders.';
comment on column public.projects.approved_variation_amount is
  'Net total of approved Variation Orders, maintained by protected database triggers.';
comment on column public.projects.current_contract_amount is
  'Original contract amount plus the net total of approved Variation Orders.';
comment on table public.variation_orders is
  'Project changes issued after quotation acceptance. Approved history is immutable.';
comment on table public.variation_order_sections is
  'User-controlled work areas for one Variation Order.';
comment on table public.variation_order_items is
  'VO additions and deductions. Replacements are represented by explicit old-item deductions and new-item additions.';
comment on table public.variation_order_snapshots is
  'Server-generated immutable snapshot for every sent VO revision.';

-- Only the accepted project owner can create a VO. All identity, numbering and
-- initial workflow fields are derived server-side.
create or replace function private.prepare_variation_order_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  project_row public.projects;
  allocated_sequence integer;
begin
  if current_user_id is null then
    raise exception 'Sesi pengguna tidak sah.';
  end if;

  select project.*
  into project_row
  from public.projects as project
  where project.id = new.project_id
    and project.owner_user_id = current_user_id
  for update;

  if not found then
    raise exception 'Projek tidak ditemui.';
  end if;

  insert into private.variation_order_number_counters (
    project_id,
    last_sequence
  ) values (
    project_row.id,
    1
  )
  on conflict (project_id)
  do update set
    last_sequence = private.variation_order_number_counters.last_sequence + 1
  returning last_sequence into allocated_sequence;

  new.project_id := project_row.id;
  new.company_id := project_row.company_id;
  new.owner_user_id := project_row.owner_user_id;
  new.vo_no := 'VO-' || lpad(allocated_sequence::text, 3, '0');
  new.vo_date := current_date;
  new.title := 'PERUBAHAN KERJA';
  new.reason := '';
  new.status := 'draft';
  new.revision_no := 0;
  new.time_impact_days := 0;
  new.net_amount := 0;
  new.approval_method := null;
  new.approval_note := null;
  new.sent_at := null;
  new.approved_at := null;
  new.rejected_at := null;
  new.created_at := now();
  new.updated_at := now();

  return new;
end;
$$;

revoke execute on function private.prepare_variation_order_insert()
  from public, anon, authenticated, service_role;

-- Header and status integrity. Net value is always recalculated from line items,
-- so a direct API update cannot forge the current contract value.
create or replace function private.guard_variation_order_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  old_content jsonb;
  new_content jsonb;
  calculated_net numeric(14, 2);
begin
  select coalesce(sum(item.signed_amount), 0)
  into calculated_net
  from public.variation_order_items as item
  where item.variation_order_id = old.id;

  new.net_amount := calculated_net;

  if old.status = 'approved' then
    raise exception 'Variation Order yang diluluskan tidak boleh diubah.';
  end if;
  if old.status = 'archived' then
    raise exception 'Variation Order yang diarkibkan tidak boleh diubah.';
  end if;

  old_content := to_jsonb(old) - array[
    'status',
    'revision_no',
    'approval_method',
    'approval_note',
    'sent_at',
    'approved_at',
    'rejected_at',
    'updated_at'
  ];
  new_content := to_jsonb(new) - array[
    'status',
    'revision_no',
    'approval_method',
    'approval_note',
    'sent_at',
    'approved_at',
    'rejected_at',
    'updated_at'
  ];

  if old.status = 'sent' then
    if old_content is distinct from new_content then
      raise exception 'Mulakan revision baharu sebelum mengubah Variation Order yang telah dihantar.';
    end if;

    if new.status = 'draft' and new.revision_no = old.revision_no + 1 then
      new.sent_at := null;
      new.approval_method := null;
      new.approval_note := null;
      new.approved_at := null;
      new.rejected_at := null;
      return new;
    end if;

    if new.status = 'approved' and new.revision_no = old.revision_no then
      if new.approval_method is null then
        raise exception 'Kaedah persetujuan mesti direkodkan.';
      end if;
      new.approved_at := now();
      new.rejected_at := null;
      return new;
    end if;

    if new.status = 'rejected' and new.revision_no = old.revision_no then
      if new.approval_method is null then
        raise exception 'Kaedah keputusan mesti direkodkan.';
      end if;
      new.rejected_at := now();
      new.approved_at := null;
      return new;
    end if;

    raise exception 'Peralihan status Variation Order tidak sah.';
  end if;

  if old.status = 'rejected' then
    if old_content is distinct from new_content
      or new.status <> 'draft'
      or new.revision_no <> old.revision_no + 1 then
      raise exception 'Mulakan revision baharu sebelum mengubah Variation Order yang ditolak.';
    end if;
    new.sent_at := null;
    new.approval_method := null;
    new.approval_note := null;
    new.approved_at := null;
    new.rejected_at := null;
    return new;
  end if;

  if old.status <> 'draft' then
    raise exception 'Status Variation Order tidak sah.';
  end if;

  if new.revision_no <> old.revision_no then
    raise exception 'Nombor revision hanya boleh bertambah melalui fungsi revision.';
  end if;

  if new.status = 'draft' then
    new.approval_method := null;
    new.approval_note := null;
    new.approved_at := null;
    new.rejected_at := null;
    return new;
  end if;

  if new.status = 'sent' then
    if length(btrim(new.reason)) = 0 then
      raise exception 'Sebab perubahan mesti diisi sebelum VO dihantar.';
    end if;
    if not exists (
      select 1
      from public.variation_order_items as item
      where item.variation_order_id = old.id
    ) and new.time_impact_days = 0 then
      raise exception 'Masukkan sekurang-kurangnya satu item atau kesan masa.';
    end if;
    new.sent_at := now();
    new.approval_method := null;
    new.approval_note := null;
    new.approved_at := null;
    new.rejected_at := null;
    return new;
  end if;

  if new.status = 'archived' then
    if old_content is distinct from new_content then
      raise exception 'Simpan perubahan sebelum mengarkibkan VO.';
    end if;
    return new;
  end if;

  raise exception 'Draf mesti dihantar sebelum keputusan direkodkan.';
end;
$$;

revoke execute on function private.guard_variation_order_update()
  from public, anon, authenticated, service_role;

create or replace function private.guard_variation_order_child_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_order_id bigint;
  target_status text;
begin
  target_order_id := case
    when tg_op = 'DELETE' then old.variation_order_id
    else new.variation_order_id
  end;

  if tg_op = 'UPDATE' and (
    new.variation_order_id,
    new.project_id,
    new.company_id,
    new.owner_user_id
  ) is distinct from (
    old.variation_order_id,
    old.project_id,
    old.company_id,
    old.owner_user_id
  ) then
    raise exception 'Ruangan atau item tidak boleh dipindahkan ke VO lain.';
  end if;

  select variation_order.status
  into target_status
  from public.variation_orders as variation_order
  where variation_order.id = target_order_id
    and variation_order.owner_user_id = (select auth.uid());

  if target_status is distinct from 'draft' then
    raise exception 'Hanya draf Variation Order boleh diubah.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_variation_order_child_mutation()
  from public, anon, authenticated, service_role;

create or replace function private.refresh_variation_order_total()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_order_id bigint;
begin
  target_order_id := case
    when tg_op = 'DELETE' then old.variation_order_id
    else new.variation_order_id
  end;

  update public.variation_orders as variation_order
  set net_amount = coalesce((
    select sum(item.signed_amount)
    from public.variation_order_items as item
    where item.variation_order_id = target_order_id
  ), 0)
  where variation_order.id = target_order_id
    and variation_order.owner_user_id = (select auth.uid());

  return null;
end;
$$;

revoke execute on function private.refresh_variation_order_total()
  from public, anon, authenticated, service_role;

-- A server-generated snapshot preserves exactly what was sent for every VO
-- revision. The function is private and cannot be called from the Data API.
create or replace function private.capture_variation_order_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sections_data jsonb;
begin
  if old.status <> 'draft' or new.status <> 'sent' then
    return new;
  end if;
  if new.owner_user_id <> (select auth.uid()) then
    raise exception 'Pemilik Variation Order tidak sepadan.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', section.id,
        'source_project_section_id', section.source_project_section_id,
        'name', section.name,
        'sort_order', section.sort_order,
        'items', coalesce((
          select jsonb_agg(
            to_jsonb(item) - array[
              'owner_user_id',
              'company_id',
              'created_at',
              'updated_at'
            ]
            order by item.sort_order, item.id
          )
          from public.variation_order_items as item
          where item.variation_order_id = new.id
            and item.section_id = section.id
        ), '[]'::jsonb)
      )
      order by section.sort_order, section.id
    ),
    '[]'::jsonb
  )
  into sections_data
  from public.variation_order_sections as section
  where section.variation_order_id = new.id;

  insert into public.variation_order_snapshots (
    variation_order_id,
    project_id,
    company_id,
    owner_user_id,
    revision_no,
    snapshot_data
  ) values (
    new.id,
    new.project_id,
    new.company_id,
    new.owner_user_id,
    new.revision_no,
    jsonb_build_object(
      'variation_order', to_jsonb(new) - array[
        'owner_user_id',
        'company_id',
        'created_at',
        'updated_at'
      ],
      'sections', sections_data
    )
  );

  return new;
end;
$$;

revoke execute on function private.capture_variation_order_snapshot()
  from public, anon, authenticated, service_role;

-- Approved VO totals are derived from immutable approved rows. The project
-- baseline remains unchanged and a negative VO cannot reduce the current value
-- below zero because of the project constraint above.
create or replace function private.sync_project_variation_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  update public.projects as project
  set approved_variation_amount = coalesce((
    select sum(variation_order.net_amount)
    from public.variation_orders as variation_order
    where variation_order.project_id = new.project_id
      and variation_order.company_id = new.company_id
      and variation_order.owner_user_id = new.owner_user_id
      and variation_order.status = 'approved'
  ), 0)
  where project.id = new.project_id
    and project.company_id = new.company_id
    and project.owner_user_id = new.owner_user_id;

  return new;
end;
$$;

revoke execute on function private.sync_project_variation_totals()
  from public, anon, authenticated, service_role;

-- Extend the existing project guard so users can never forge a VO total. Any
-- project update recalculates that total from approved immutable VO rows.
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

create trigger variation_orders_prepare_insert
before insert on public.variation_orders
for each row execute function private.prepare_variation_order_insert();

create trigger variation_orders_guard_update
before update on public.variation_orders
for each row execute function private.guard_variation_order_update();

create trigger variation_orders_set_updated_at
before update on public.variation_orders
for each row execute function private.set_updated_at();

create trigger variation_orders_capture_snapshot
after update of status on public.variation_orders
for each row
when (old.status is distinct from new.status)
execute function private.capture_variation_order_snapshot();

create trigger variation_orders_sync_project_total
after update of status on public.variation_orders
for each row
when (old.status is distinct from new.status)
execute function private.sync_project_variation_totals();

create trigger variation_order_sections_guard_mutation
before insert or update or delete on public.variation_order_sections
for each row execute function private.guard_variation_order_child_mutation();

create trigger variation_order_sections_set_updated_at
before update on public.variation_order_sections
for each row execute function private.set_updated_at();

create trigger variation_order_items_guard_mutation
before insert or update or delete on public.variation_order_items
for each row execute function private.guard_variation_order_child_mutation();

create trigger variation_order_items_set_updated_at
before update on public.variation_order_items
for each row execute function private.set_updated_at();

create trigger variation_order_items_refresh_total
after insert or update or delete on public.variation_order_items
for each row execute function private.refresh_variation_order_total();

alter table public.variation_orders enable row level security;
alter table public.variation_order_sections enable row level security;
alter table public.variation_order_items enable row level security;
alter table public.variation_order_snapshots enable row level security;

revoke all on table public.variation_orders from anon, authenticated;
revoke all on table public.variation_order_sections from anon, authenticated;
revoke all on table public.variation_order_items from anon, authenticated;
revoke all on table public.variation_order_snapshots from anon, authenticated;
revoke all on sequence public.variation_orders_id_seq from anon, authenticated;
revoke all on sequence public.variation_order_sections_id_seq from anon, authenticated;
revoke all on sequence public.variation_order_items_id_seq from anon, authenticated;
revoke all on sequence public.variation_order_snapshots_id_seq from anon, authenticated;

grant select, insert, update on table public.variation_orders to authenticated;
grant select, insert, update, delete on table public.variation_order_sections
  to authenticated;
grant select, insert, update, delete on table public.variation_order_items
  to authenticated;
grant select on table public.variation_order_snapshots to authenticated;

grant usage, select on sequence public.variation_orders_id_seq to authenticated;
grant usage, select on sequence public.variation_order_sections_id_seq
  to authenticated;
grant usage, select on sequence public.variation_order_items_id_seq
  to authenticated;

create policy variation_orders_select_own
on public.variation_orders for select to authenticated
using ((select auth.uid()) = owner_user_id);

create policy variation_orders_insert_own
on public.variation_orders for insert to authenticated
with check ((select auth.uid()) = owner_user_id);

create policy variation_orders_update_own
on public.variation_orders for update to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy variation_order_sections_select_own
on public.variation_order_sections for select to authenticated
using ((select auth.uid()) = owner_user_id);

create policy variation_order_sections_insert_own
on public.variation_order_sections for insert to authenticated
with check ((select auth.uid()) = owner_user_id);

create policy variation_order_sections_update_own
on public.variation_order_sections for update to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy variation_order_sections_delete_own
on public.variation_order_sections for delete to authenticated
using ((select auth.uid()) = owner_user_id);

create policy variation_order_items_select_own
on public.variation_order_items for select to authenticated
using ((select auth.uid()) = owner_user_id);

create policy variation_order_items_insert_own
on public.variation_order_items for insert to authenticated
with check ((select auth.uid()) = owner_user_id);

create policy variation_order_items_update_own
on public.variation_order_items for update to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy variation_order_items_delete_own
on public.variation_order_items for delete to authenticated
using ((select auth.uid()) = owner_user_id);

create policy variation_order_snapshots_select_own
on public.variation_order_snapshots for select to authenticated
using ((select auth.uid()) = owner_user_id);

create or replace function public.create_variation_order(p_project_id bigint)
returns public.variation_orders
language plpgsql
security invoker
set search_path = ''
as $$
declare
  variation_order_row public.variation_orders;
begin
  if (select auth.uid()) is null then
    raise exception 'Sesi pengguna tidak sah.';
  end if;

  insert into public.variation_orders (project_id)
  values (p_project_id)
  returning * into variation_order_row;

  return variation_order_row;
end;
$$;

revoke execute on function public.create_variation_order(bigint)
  from public, anon;
grant execute on function public.create_variation_order(bigint)
  to authenticated;

create or replace function public.send_variation_order_revision(
  p_variation_order_id bigint
)
returns public.variation_orders
language plpgsql
security invoker
set search_path = ''
as $$
declare
  variation_order_row public.variation_orders;
begin
  update public.variation_orders
  set status = 'sent'
  where id = p_variation_order_id
    and owner_user_id = (select auth.uid())
  returning * into variation_order_row;

  if not found then
    raise exception 'Variation Order tidak ditemui.';
  end if;

  return variation_order_row;
end;
$$;

revoke execute on function public.send_variation_order_revision(bigint)
  from public, anon;
grant execute on function public.send_variation_order_revision(bigint)
  to authenticated;

create or replace function public.start_variation_order_revision(
  p_variation_order_id bigint
)
returns public.variation_orders
language plpgsql
security invoker
set search_path = ''
as $$
declare
  variation_order_row public.variation_orders;
begin
  update public.variation_orders
  set
    status = 'draft',
    revision_no = revision_no + 1,
    sent_at = null,
    approval_method = null,
    approval_note = null,
    approved_at = null,
    rejected_at = null
  where id = p_variation_order_id
    and owner_user_id = (select auth.uid())
  returning * into variation_order_row;

  if not found then
    raise exception 'Variation Order tidak ditemui.';
  end if;

  return variation_order_row;
end;
$$;

revoke execute on function public.start_variation_order_revision(bigint)
  from public, anon;
grant execute on function public.start_variation_order_revision(bigint)
  to authenticated;

create or replace function public.record_variation_order_decision(
  p_variation_order_id bigint,
  p_decision text,
  p_approval_method text,
  p_approval_note text default null
)
returns public.variation_orders
language plpgsql
security invoker
set search_path = ''
as $$
declare
  variation_order_row public.variation_orders;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Keputusan mestilah diluluskan atau ditolak.';
  end if;
  if p_approval_method not in ('whatsapp', 'verbal', 'written', 'other') then
    raise exception 'Kaedah keputusan tidak sah.';
  end if;

  update public.variation_orders
  set
    status = p_decision,
    approval_method = p_approval_method,
    approval_note = nullif(btrim(p_approval_note), '')
  where id = p_variation_order_id
    and owner_user_id = (select auth.uid())
  returning * into variation_order_row;

  if not found then
    raise exception 'Variation Order tidak ditemui.';
  end if;

  return variation_order_row;
end;
$$;

revoke execute on function public.record_variation_order_decision(
  bigint,
  text,
  text,
  text
) from public, anon;
grant execute on function public.record_variation_order_decision(
  bigint,
  text,
  text,
  text
) to authenticated;

commit;
