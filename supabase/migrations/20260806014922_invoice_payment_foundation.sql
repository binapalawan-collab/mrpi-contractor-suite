begin;

-- Invoice and receipt numbers are allocated per company and calendar year.
-- The counters live outside the exposed API schema and are never readable by
-- application users.
create table private.invoice_number_counters (
  company_id bigint not null,
  invoice_year integer not null,
  last_sequence integer not null,

  constraint invoice_number_counters_pkey
    primary key (company_id, invoice_year),
  constraint invoice_number_counters_company_fkey
    foreign key (company_id)
    references public.companies (id)
    on delete cascade,
  constraint invoice_number_counters_year_valid
    check (invoice_year between 2000 and 9999),
  constraint invoice_number_counters_sequence_positive
    check (last_sequence > 0)
);

create table private.receipt_number_counters (
  company_id bigint not null,
  receipt_year integer not null,
  last_sequence integer not null,

  constraint receipt_number_counters_pkey
    primary key (company_id, receipt_year),
  constraint receipt_number_counters_company_fkey
    foreign key (company_id)
    references public.companies (id)
    on delete cascade,
  constraint receipt_number_counters_year_valid
    check (receipt_year between 2000 and 9999),
  constraint receipt_number_counters_sequence_positive
    check (last_sequence > 0)
);

alter table private.invoice_number_counters enable row level security;
alter table private.receipt_number_counters enable row level security;

revoke all on table private.invoice_number_counters
  from public, anon, authenticated, service_role;
revoke all on table private.receipt_number_counters
  from public, anon, authenticated, service_role;

create policy invoice_number_counters_no_direct_access
on private.invoice_number_counters
for all to public
using (false)
with check (false);

create policy receipt_number_counters_no_direct_access
on private.receipt_number_counters
for all to public
using (false)
with check (false);

create table public.invoices (
  id bigint generated always as identity primary key,
  project_id bigint not null,
  company_id bigint not null,
  owner_user_id uuid not null,
  invoice_no text not null,
  invoice_date date not null default current_date,
  due_date date,
  title text not null default 'TUNTUTAN BAYARAN KEMAJUAN',
  notes text not null default '',
  status text not null default 'draft',
  total_amount numeric(14, 2) not null default 0,
  paid_amount numeric(14, 2) not null default 0,
  balance_amount numeric(14, 2)
    generated always as (round(total_amount - paid_amount, 2)) stored,
  contract_value_snapshot numeric(14, 2),
  previous_billed_amount_snapshot numeric(14, 2),
  contract_balance_after_snapshot numeric(14, 2),
  issued_at timestamptz,
  fully_paid_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint invoices_project_company_owner_fkey
    foreign key (project_id, company_id, owner_user_id)
    references public.projects (id, company_id, owner_user_id)
    on delete cascade,
  constraint invoices_identity_key
    unique (id, project_id, company_id, owner_user_id),
  constraint invoices_number_key
    unique (company_id, invoice_no),
  constraint invoices_number_format
    check (invoice_no ~ '^INV-[0-9]{4}-[0-9]{3,}$'),
  constraint invoices_title_not_blank
    check (length(btrim(title)) > 0),
  constraint invoices_notes_length
    check (length(notes) <= 5000),
  constraint invoices_status_valid
    check (status in ('draft', 'issued', 'partially_paid', 'paid', 'void')),
  constraint invoices_dates_valid
    check (due_date is null or due_date >= invoice_date),
  constraint invoices_amounts_valid
    check (
      total_amount >= 0
      and paid_amount >= 0
      and paid_amount <= total_amount
    ),
  constraint invoices_snapshots_nonnegative
    check (
      (contract_value_snapshot is null or contract_value_snapshot >= 0)
      and (
        previous_billed_amount_snapshot is null
        or previous_billed_amount_snapshot >= 0
      )
      and (
        contract_balance_after_snapshot is null
        or contract_balance_after_snapshot >= 0
      )
    ),
  constraint invoices_status_amounts_valid
    check (
      (status = 'draft' and paid_amount = 0)
      or (status = 'issued' and total_amount > 0 and paid_amount = 0)
      or (
        status = 'partially_paid'
        and paid_amount > 0
        and paid_amount < total_amount
      )
      or (status = 'paid' and total_amount > 0 and paid_amount = total_amount)
      or (status = 'void' and paid_amount = 0)
    ),
  constraint invoices_status_timestamps_valid
    check (
      (status = 'draft' and issued_at is null and fully_paid_at is null and voided_at is null)
      or (
        status in ('issued', 'partially_paid')
        and issued_at is not null
        and fully_paid_at is null
        and voided_at is null
      )
      or (
        status = 'paid'
        and issued_at is not null
        and fully_paid_at is not null
        and voided_at is null
      )
      or (status = 'void' and fully_paid_at is null and voided_at is not null)
    ),
  constraint invoices_issued_snapshots_present
    check (
      status in ('draft', 'void')
      or (
        contract_value_snapshot is not null
        and previous_billed_amount_snapshot is not null
        and contract_balance_after_snapshot is not null
      )
    )
);

create table public.invoice_items (
  id bigint generated always as identity primary key,
  invoice_id bigint not null,
  project_id bigint not null,
  company_id bigint not null,
  owner_user_id uuid not null,
  variation_order_id bigint,
  source_type text not null default 'manual',
  description text not null,
  percentage numeric(7, 3),
  amount numeric(14, 2) not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint invoice_items_invoice_company_owner_fkey
    foreign key (invoice_id, project_id, company_id, owner_user_id)
    references public.invoices (id, project_id, company_id, owner_user_id)
    on delete cascade,
  constraint invoice_items_variation_company_owner_fkey
    foreign key (variation_order_id, project_id, company_id, owner_user_id)
    references public.variation_orders (id, project_id, company_id, owner_user_id)
    on delete restrict,
  constraint invoice_items_identity_key
    unique (id, invoice_id, project_id, company_id, owner_user_id),
  constraint invoice_items_source_valid
    check (source_type in ('progress', 'approved_variation', 'manual')),
  constraint invoice_items_description_not_blank
    check (length(btrim(description)) > 0),
  constraint invoice_items_description_length
    check (length(description) <= 2000),
  constraint invoice_items_percentage_valid
    check (
      (source_type = 'progress' and percentage is not null and percentage > 0 and percentage <= 100)
      or (source_type <> 'progress' and percentage is null)
    ),
  constraint invoice_items_variation_valid
    check (
      (source_type = 'approved_variation' and variation_order_id is not null)
      or (source_type <> 'approved_variation' and variation_order_id is null)
    ),
  constraint invoice_items_amount_positive
    check (amount > 0),
  constraint invoice_items_sort_nonnegative
    check (sort_order >= 0)
);

create table public.invoice_snapshots (
  id bigint generated always as identity primary key,
  invoice_id bigint not null,
  project_id bigint not null,
  company_id bigint not null,
  owner_user_id uuid not null,
  snapshot_data jsonb not null,
  created_at timestamptz not null default now(),

  constraint invoice_snapshots_invoice_company_owner_fkey
    foreign key (invoice_id, project_id, company_id, owner_user_id)
    references public.invoices (id, project_id, company_id, owner_user_id)
    on delete cascade,
  constraint invoice_snapshots_invoice_key
    unique (invoice_id),
  constraint invoice_snapshots_data_object
    check (jsonb_typeof(snapshot_data) = 'object')
);

create table public.invoice_payments (
  id bigint generated always as identity primary key,
  invoice_id bigint not null,
  project_id bigint not null,
  company_id bigint not null,
  owner_user_id uuid not null,
  receipt_no text not null,
  payment_date date not null default current_date,
  amount numeric(14, 2) not null,
  payment_method text not null,
  reference_no text,
  notes text not null default '',
  invoice_total_snapshot numeric(14, 2) not null,
  paid_before_snapshot numeric(14, 2) not null,
  paid_after_snapshot numeric(14, 2) not null,
  balance_after_snapshot numeric(14, 2) not null,
  created_at timestamptz not null default now(),

  constraint invoice_payments_invoice_company_owner_fkey
    foreign key (invoice_id, project_id, company_id, owner_user_id)
    references public.invoices (id, project_id, company_id, owner_user_id)
    on delete restrict,
  constraint invoice_payments_identity_key
    unique (id, invoice_id, project_id, company_id, owner_user_id),
  constraint invoice_payments_receipt_key
    unique (company_id, receipt_no),
  constraint invoice_payments_receipt_format
    check (receipt_no ~ '^RCP-[0-9]{4}-[0-9]{3,}$'),
  constraint invoice_payments_amount_positive
    check (amount > 0),
  constraint invoice_payments_method_valid
    check (payment_method in ('bank_transfer', 'cash', 'cheque', 'card', 'other')),
  constraint invoice_payments_reference_not_blank
    check (reference_no is null or length(btrim(reference_no)) > 0),
  constraint invoice_payments_reference_length
    check (reference_no is null or length(reference_no) <= 200),
  constraint invoice_payments_notes_length
    check (length(notes) <= 2000),
  constraint invoice_payments_snapshots_valid
    check (
      invoice_total_snapshot > 0
      and paid_before_snapshot >= 0
      and paid_after_snapshot = round(paid_before_snapshot + amount, 2)
      and paid_after_snapshot <= invoice_total_snapshot
      and balance_after_snapshot = round(invoice_total_snapshot - paid_after_snapshot, 2)
    )
);

create index invoices_project_owner_status_date_idx
  on public.invoices (
    project_id,
    company_id,
    owner_user_id,
    status,
    invoice_date desc,
    id desc
  );
create index invoices_owner_status_due_idx
  on public.invoices (owner_user_id, status, due_date, id)
  where status in ('issued', 'partially_paid');
create index invoices_company_date_idx
  on public.invoices (company_id, invoice_date desc, id desc);
create index invoice_items_invoice_owner_sort_idx
  on public.invoice_items (
    invoice_id,
    project_id,
    company_id,
    owner_user_id,
    sort_order,
    id
  );
create index invoice_items_variation_owner_idx
  on public.invoice_items (
    variation_order_id,
    project_id,
    company_id,
    owner_user_id
  )
  where variation_order_id is not null;
create index invoice_snapshots_project_owner_idx
  on public.invoice_snapshots (project_id, company_id, owner_user_id, invoice_id);
create index invoice_payments_invoice_owner_date_idx
  on public.invoice_payments (
    invoice_id,
    project_id,
    company_id,
    owner_user_id,
    payment_date,
    id
  );
create index invoice_payments_owner_date_idx
  on public.invoice_payments (owner_user_id, payment_date desc, id desc);

comment on table public.invoices is
  'Project-only progress invoices. Drafts are editable; issued invoices are immutable financial records.';
comment on table public.invoice_items is
  'Positive claim lines for progress stages, approved Variation Orders or manual project claims.';
comment on table public.invoice_snapshots is
  'Immutable company, client, project, contract and line snapshot captured when an invoice is issued.';
comment on table public.invoice_payments is
  'Immutable partial or full payments. Each payment owns one receipt number and balance snapshot.';

create or replace function private.prepare_invoice_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  project_row public.projects;
  target_invoice_year integer;
  invoice_sequence integer;
begin
  if current_user_id is null then
    raise exception 'Sesi pengguna tidak sah.';
  end if;

  select project.*
  into project_row
  from public.projects as project
  where project.id = new.project_id
    and project.owner_user_id = current_user_id;

  if not found then
    raise exception 'Projek tidak ditemui atau bukan milik pengguna ini.';
  end if;

  if coalesce(new.status, 'draft') <> 'draft' then
    raise exception 'Invois baharu mesti bermula sebagai draf.';
  end if;

  new.company_id := project_row.company_id;
  new.owner_user_id := current_user_id;
  new.invoice_date := coalesce(new.invoice_date, current_date);
  target_invoice_year := extract(year from new.invoice_date)::integer;

  insert into private.invoice_number_counters (
    company_id,
    invoice_year,
    last_sequence
  )
  values (project_row.company_id, target_invoice_year, 1)
  on conflict (company_id, invoice_year)
  do update set last_sequence = private.invoice_number_counters.last_sequence + 1
  returning last_sequence into invoice_sequence;

  new.invoice_no := format('INV-%s-%s', target_invoice_year, lpad(invoice_sequence::text, 3, '0'));
  new.title := coalesce(nullif(btrim(new.title), ''), 'TUNTUTAN BAYARAN KEMAJUAN');
  new.notes := coalesce(new.notes, '');
  new.status := 'draft';
  new.total_amount := 0;
  new.paid_amount := 0;
  new.contract_value_snapshot := null;
  new.previous_billed_amount_snapshot := null;
  new.contract_balance_after_snapshot := null;
  new.issued_at := null;
  new.fully_paid_at := null;
  new.voided_at := null;
  new.created_at := now();
  new.updated_at := now();

  return new;
end;
$$;

revoke execute on function private.prepare_invoice_insert()
  from public, anon, authenticated, service_role;

create or replace function private.guard_invoice_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  project_contract numeric(14, 2);
  previous_billed numeric(14, 2);
  payment_count bigint;
  item_count bigint;
  old_locked jsonb;
  new_locked jsonb;
  variation_claim record;
  previous_variation_claim numeric(14, 2);
  approved_variation_value numeric(14, 2);
begin
  if current_user_id is null or old.owner_user_id <> current_user_id then
    raise exception 'Invois tidak ditemui atau bukan milik pengguna ini.';
  end if;

  if (new.id, new.project_id, new.company_id, new.owner_user_id, new.invoice_no)
    is distinct from
    (old.id, old.project_id, old.company_id, old.owner_user_id, old.invoice_no) then
    raise exception 'Identiti invois dan projek tidak boleh diubah.';
  end if;

  -- Total invoice changes only through line-item triggers. Paid totals and paid
  -- status change only through the nested payment trigger.
  if pg_trigger_depth() > 1 then
    old_locked := to_jsonb(old) - array[
      'total_amount',
      'balance_amount',
      'paid_amount',
      'status',
      'fully_paid_at',
      'updated_at'
    ];
    new_locked := to_jsonb(new) - array[
      'total_amount',
      'balance_amount',
      'paid_amount',
      'status',
      'fully_paid_at',
      'updated_at'
    ];
    if old_locked is distinct from new_locked then
      raise exception 'Kemas kini dalaman invois mengandungi medan yang tidak dibenarkan.';
    end if;
    new.updated_at := now();
    return new;
  end if;

  if (new.total_amount, new.paid_amount)
    is distinct from
    (old.total_amount, old.paid_amount) then
    raise exception 'Jumlah invois dan bayaran dikira oleh sistem.';
  end if;

  if old.status = 'draft' and new.status = 'draft' then
    if (
      new.contract_value_snapshot,
      new.previous_billed_amount_snapshot,
      new.contract_balance_after_snapshot,
      new.issued_at,
      new.fully_paid_at,
      new.voided_at
    ) is distinct from (
      old.contract_value_snapshot,
      old.previous_billed_amount_snapshot,
      old.contract_balance_after_snapshot,
      old.issued_at,
      old.fully_paid_at,
      old.voided_at
    ) then
      raise exception 'Snapshot dan masa invois dikawal oleh sistem.';
    end if;
    new.title := btrim(new.title);
    new.notes := coalesce(new.notes, '');
    new.updated_at := now();
    return new;
  end if;

  if old.status = 'draft' and new.status = 'issued' then
    select project.current_contract_amount
    into project_contract
    from public.projects as project
    where project.id = old.project_id
      and project.company_id = old.company_id
      and project.owner_user_id = old.owner_user_id
    for update;

    if not found then
      raise exception 'Projek invois tidak ditemui.';
    end if;

    select count(*)
    into item_count
    from public.invoice_items as item
    where item.invoice_id = old.id
      and item.company_id = old.company_id
      and item.owner_user_id = old.owner_user_id;

    if item_count = 0 or old.total_amount <= 0 then
      raise exception 'Tambah sekurang-kurangnya satu tuntutan sebelum keluarkan invois.';
    end if;

    select coalesce(sum(invoice.total_amount), 0)
    into previous_billed
    from public.invoices as invoice
    where invoice.project_id = old.project_id
      and invoice.company_id = old.company_id
      and invoice.owner_user_id = old.owner_user_id
      and invoice.id <> old.id
      and invoice.status in ('issued', 'partially_paid', 'paid');

    if round(previous_billed + old.total_amount, 2) > project_contract then
      raise exception 'Jumlah tuntutan melebihi baki kontrak semasa sebanyak RM %.',
        to_char(round(previous_billed + old.total_amount - project_contract, 2), 'FM999999999990.00');
    end if;

    for variation_claim in
      select item.variation_order_id, sum(item.amount) as amount
      from public.invoice_items as item
      where item.invoice_id = old.id
        and item.source_type = 'approved_variation'
      group by item.variation_order_id
    loop
      select variation_order.net_amount
      into approved_variation_value
      from public.variation_orders as variation_order
      where variation_order.id = variation_claim.variation_order_id
        and variation_order.project_id = old.project_id
        and variation_order.company_id = old.company_id
        and variation_order.owner_user_id = old.owner_user_id
        and variation_order.status = 'approved';

      if not found or approved_variation_value <= 0 then
        raise exception 'Item VO mesti merujuk Variation Order tambahan yang telah diluluskan.';
      end if;

      select coalesce(sum(item.amount), 0)
      into previous_variation_claim
      from public.invoice_items as item
      join public.invoices as invoice
        on invoice.id = item.invoice_id
       and invoice.project_id = item.project_id
       and invoice.company_id = item.company_id
       and invoice.owner_user_id = item.owner_user_id
      where item.variation_order_id = variation_claim.variation_order_id
        and invoice.id <> old.id
        and invoice.status in ('issued', 'partially_paid', 'paid');

      if round(previous_variation_claim + variation_claim.amount, 2) > approved_variation_value then
        raise exception 'Tuntutan untuk VO ini melebihi nilai VO yang diluluskan.';
      end if;
    end loop;

    new.title := btrim(new.title);
    new.notes := coalesce(new.notes, '');
    new.contract_value_snapshot := project_contract;
    new.previous_billed_amount_snapshot := previous_billed;
    new.contract_balance_after_snapshot := round(project_contract - previous_billed - old.total_amount, 2);
    new.issued_at := now();
    new.fully_paid_at := null;
    new.voided_at := null;
    new.updated_at := now();
    return new;
  end if;

  if old.status in ('draft', 'issued') and new.status = 'void' then
    select count(*)
    into payment_count
    from public.invoice_payments as payment
    where payment.invoice_id = old.id
      and payment.company_id = old.company_id
      and payment.owner_user_id = old.owner_user_id;

    if payment_count > 0 then
      raise exception 'Invois yang mempunyai bayaran tidak boleh dibatalkan.';
    end if;

    old_locked := to_jsonb(old) - array['status', 'voided_at', 'updated_at'];
    new_locked := to_jsonb(new) - array['status', 'voided_at', 'updated_at'];
    if old_locked is distinct from new_locked then
      raise exception 'Hanya status batal boleh diubah selepas invois dicipta.';
    end if;
    new.voided_at := now();
    new.fully_paid_at := null;
    new.updated_at := now();
    return new;
  end if;

  raise exception 'Invois yang telah dikeluarkan dikunci. Gunakan rekod bayaran untuk mengubah baki.';
end;
$$;

revoke execute on function private.guard_invoice_update()
  from public, anon, authenticated, service_role;

create or replace function private.guard_invoice_item_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_invoice_id bigint;
  invoice_row public.invoices;
  approved_variation_exists boolean;
begin
  if current_user_id is null then
    raise exception 'Sesi pengguna tidak sah.';
  end if;

  target_invoice_id := case
    when tg_op = 'DELETE' then old.invoice_id
    else new.invoice_id
  end;

  if tg_op = 'UPDATE' and new.invoice_id <> old.invoice_id then
    raise exception 'Item tidak boleh dipindahkan ke invois lain.';
  end if;

  select invoice.*
  into invoice_row
  from public.invoices as invoice
  where invoice.id = target_invoice_id
    and invoice.owner_user_id = current_user_id
  for update;

  if not found then
    raise exception 'Invois tidak ditemui atau bukan milik pengguna ini.';
  end if;
  if invoice_row.status <> 'draft' then
    raise exception 'Item invois yang telah dikeluarkan tidak boleh diubah.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  new.project_id := invoice_row.project_id;
  new.company_id := invoice_row.company_id;
  new.owner_user_id := invoice_row.owner_user_id;
  new.description := btrim(new.description);

  if new.source_type = 'approved_variation' then
    select exists (
      select 1
      from public.variation_orders as variation_order
      where variation_order.id = new.variation_order_id
        and variation_order.project_id = invoice_row.project_id
        and variation_order.company_id = invoice_row.company_id
        and variation_order.owner_user_id = invoice_row.owner_user_id
        and variation_order.status = 'approved'
        and variation_order.net_amount > 0
    ) into approved_variation_exists;

    if not approved_variation_exists then
      raise exception 'Variation Order mesti telah diluluskan dan bernilai tambahan.';
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.created_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function private.guard_invoice_item_mutation()
  from public, anon, authenticated, service_role;

create or replace function private.refresh_invoice_total()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_invoice_id bigint;
begin
  target_invoice_id := case
    when tg_op = 'DELETE' then old.invoice_id
    else new.invoice_id
  end;

  update public.invoices as invoice
  set total_amount = coalesce((
    select round(sum(item.amount), 2)
    from public.invoice_items as item
    where item.invoice_id = target_invoice_id
  ), 0)
  where invoice.id = target_invoice_id;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function private.refresh_invoice_total()
  from public, anon, authenticated, service_role;

create or replace function private.capture_invoice_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  snapshot jsonb;
begin
  if current_user_id is null or new.owner_user_id <> current_user_id then
    raise exception 'Invois tidak ditemui atau bukan milik pengguna ini.';
  end if;

  select jsonb_build_object(
    'version', 1,
    'invoice', jsonb_build_object(
      'invoice_no', invoice.invoice_no,
      'invoice_date', invoice.invoice_date,
      'due_date', invoice.due_date,
      'title', invoice.title,
      'notes', invoice.notes,
      'total_amount', invoice.total_amount,
      'contract_value', invoice.contract_value_snapshot,
      'previous_billed_amount', invoice.previous_billed_amount_snapshot,
      'contract_balance_after', invoice.contract_balance_after_snapshot,
      'issued_at', invoice.issued_at
    ),
    'company', jsonb_build_object(
      'legal_name', company.legal_name,
      'trading_name', company.trading_name,
      'registration_no', company.registration_no,
      'phone', company.phone,
      'address_line_1', company.address_line_1,
      'address_line_2', company.address_line_2,
      'postcode', company.postcode,
      'city', company.city,
      'state', company.state,
      'logo_path', company.logo_path
    ),
    'project', jsonb_build_object(
      'project_no', project.project_no,
      'project_name', project.project_name,
      'client_name', project.client_name,
      'client_phone', project.client_phone,
      'address_line_1', project.address_line_1,
      'address_line_2', project.address_line_2,
      'postcode', project.postcode,
      'city', project.city,
      'state', project.state
    ),
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'source_type', item.source_type,
          'variation_order_id', item.variation_order_id,
          'description', item.description,
          'percentage', item.percentage,
          'amount', item.amount
        ) order by item.sort_order, item.id
      )
      from public.invoice_items as item
      where item.invoice_id = invoice.id
    ), '[]'::jsonb)
  )
  into snapshot
  from public.invoices as invoice
  join public.projects as project
    on project.id = invoice.project_id
   and project.company_id = invoice.company_id
   and project.owner_user_id = invoice.owner_user_id
  join public.companies as company
    on company.id = invoice.company_id
   and company.owner_user_id = invoice.owner_user_id
  where invoice.id = new.id
    and invoice.owner_user_id = current_user_id;

  if snapshot is null then
    raise exception 'Snapshot invois tidak dapat dibina.';
  end if;

  insert into public.invoice_snapshots (
    invoice_id,
    project_id,
    company_id,
    owner_user_id,
    snapshot_data
  )
  values (
    new.id,
    new.project_id,
    new.company_id,
    new.owner_user_id,
    snapshot
  );

  return new;
end;
$$;

revoke execute on function private.capture_invoice_snapshot()
  from public, anon, authenticated, service_role;

create or replace function private.prepare_invoice_payment_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  invoice_row public.invoices;
  paid_before numeric(14, 2);
  target_receipt_year integer;
  receipt_sequence integer;
begin
  if current_user_id is null then
    raise exception 'Sesi pengguna tidak sah.';
  end if;

  select invoice.*
  into invoice_row
  from public.invoices as invoice
  where invoice.id = new.invoice_id
    and invoice.owner_user_id = current_user_id
  for update;

  if not found then
    raise exception 'Invois tidak ditemui atau bukan milik pengguna ini.';
  end if;
  if invoice_row.status not in ('issued', 'partially_paid') then
    raise exception 'Bayaran hanya boleh direkod pada invois yang masih berbaki.';
  end if;
  if new.amount is null or new.amount <= 0 then
    raise exception 'Jumlah bayaran mesti lebih besar daripada sifar.';
  end if;

  select coalesce(sum(payment.amount), 0)
  into paid_before
  from public.invoice_payments as payment
  where payment.invoice_id = invoice_row.id
    and payment.company_id = invoice_row.company_id
    and payment.owner_user_id = invoice_row.owner_user_id;

  if round(paid_before + new.amount, 2) > invoice_row.total_amount then
    raise exception 'Bayaran melebihi baki invois sebanyak RM %.',
      to_char(round(paid_before + new.amount - invoice_row.total_amount, 2), 'FM999999999990.00');
  end if;

  new.project_id := invoice_row.project_id;
  new.company_id := invoice_row.company_id;
  new.owner_user_id := invoice_row.owner_user_id;
  new.payment_date := coalesce(new.payment_date, current_date);
  new.reference_no := nullif(btrim(new.reference_no), '');
  new.notes := coalesce(new.notes, '');
  new.invoice_total_snapshot := invoice_row.total_amount;
  new.paid_before_snapshot := paid_before;
  new.paid_after_snapshot := round(paid_before + new.amount, 2);
  new.balance_after_snapshot := round(invoice_row.total_amount - paid_before - new.amount, 2);
  new.created_at := now();

  target_receipt_year := extract(year from new.payment_date)::integer;
  insert into private.receipt_number_counters (
    company_id,
    receipt_year,
    last_sequence
  )
  values (invoice_row.company_id, target_receipt_year, 1)
  on conflict (company_id, receipt_year)
  do update set last_sequence = private.receipt_number_counters.last_sequence + 1
  returning last_sequence into receipt_sequence;

  new.receipt_no := format('RCP-%s-%s', target_receipt_year, lpad(receipt_sequence::text, 3, '0'));
  return new;
end;
$$;

revoke execute on function private.prepare_invoice_payment_insert()
  from public, anon, authenticated, service_role;

create or replace function private.sync_invoice_payment_total()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  new_paid numeric(14, 2);
  invoice_total numeric(14, 2);
begin
  if current_user_id is null or new.owner_user_id <> current_user_id then
    raise exception 'Bayaran tidak ditemui atau bukan milik pengguna ini.';
  end if;

  select invoice.total_amount
  into invoice_total
  from public.invoices as invoice
  where invoice.id = new.invoice_id
    and invoice.owner_user_id = current_user_id
  for update;

  select coalesce(sum(payment.amount), 0)
  into new_paid
  from public.invoice_payments as payment
  where payment.invoice_id = new.invoice_id
    and payment.company_id = new.company_id
    and payment.owner_user_id = new.owner_user_id;

  update public.invoices as invoice
  set paid_amount = new_paid,
      status = case
        when new_paid = invoice_total then 'paid'
        when new_paid > 0 then 'partially_paid'
        else 'issued'
      end,
      fully_paid_at = case
        when new_paid = invoice_total then now()
        else null
      end
  where invoice.id = new.invoice_id
    and invoice.owner_user_id = current_user_id;

  return new;
end;
$$;

revoke execute on function private.sync_invoice_payment_total()
  from public, anon, authenticated, service_role;

-- A later approved deduction must never reduce the current contract below
-- financial records that have already been issued.
create or replace function private.guard_project_contract_against_invoices()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  issued_total numeric(14, 2);
begin
  select coalesce(sum(invoice.total_amount), 0)
  into issued_total
  from public.invoices as invoice
  where invoice.project_id = old.id
    and invoice.company_id = old.company_id
    and invoice.owner_user_id = old.owner_user_id
    and invoice.status in ('issued', 'partially_paid', 'paid');

  if issued_total > round(new.contract_amount + new.approved_variation_amount, 2) then
    raise exception 'Nilai kontrak baharu lebih rendah daripada invois yang telah dikeluarkan.';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_project_contract_against_invoices()
  from public, anon, authenticated, service_role;

create trigger invoices_prepare_insert
before insert on public.invoices
for each row execute function private.prepare_invoice_insert();

create trigger invoices_guard_update
before update on public.invoices
for each row execute function private.guard_invoice_update();

create trigger invoice_items_guard_mutation
before insert or update or delete on public.invoice_items
for each row execute function private.guard_invoice_item_mutation();

create trigger invoice_items_refresh_total
after insert or update or delete on public.invoice_items
for each row execute function private.refresh_invoice_total();

create trigger invoices_capture_snapshot
after update of status on public.invoices
for each row
when (old.status = 'draft' and new.status = 'issued')
execute function private.capture_invoice_snapshot();

create trigger invoice_payments_prepare_insert
before insert on public.invoice_payments
for each row execute function private.prepare_invoice_payment_insert();

create trigger invoice_payments_sync_invoice
after insert on public.invoice_payments
for each row execute function private.sync_invoice_payment_total();

create trigger projects_validate_issued_invoice_total
before update of approved_variation_amount on public.projects
for each row execute function private.guard_project_contract_against_invoices();

alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.invoice_snapshots enable row level security;
alter table public.invoice_payments enable row level security;

revoke all on table public.invoices from anon, authenticated;
revoke all on table public.invoice_items from anon, authenticated;
revoke all on table public.invoice_snapshots from anon, authenticated;
revoke all on table public.invoice_payments from anon, authenticated;
revoke all on sequence public.invoices_id_seq from anon, authenticated;
revoke all on sequence public.invoice_items_id_seq from anon, authenticated;
revoke all on sequence public.invoice_snapshots_id_seq from anon, authenticated;
revoke all on sequence public.invoice_payments_id_seq from anon, authenticated;

grant select, insert, update on table public.invoices to authenticated;
grant select, insert, update, delete on table public.invoice_items to authenticated;
grant select on table public.invoice_snapshots to authenticated;
grant select, insert on table public.invoice_payments to authenticated;
grant usage, select on sequence public.invoices_id_seq to authenticated;
grant usage, select on sequence public.invoice_items_id_seq to authenticated;
grant usage, select on sequence public.invoice_payments_id_seq to authenticated;

create policy invoices_select_own
on public.invoices for select to authenticated
using ((select auth.uid()) = owner_user_id);

create policy invoices_insert_own
on public.invoices for insert to authenticated
with check ((select auth.uid()) = owner_user_id);

create policy invoices_update_own
on public.invoices for update to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy invoice_items_select_own
on public.invoice_items for select to authenticated
using ((select auth.uid()) = owner_user_id);

create policy invoice_items_insert_own
on public.invoice_items for insert to authenticated
with check ((select auth.uid()) = owner_user_id);

create policy invoice_items_update_own
on public.invoice_items for update to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy invoice_items_delete_own
on public.invoice_items for delete to authenticated
using ((select auth.uid()) = owner_user_id);

create policy invoice_snapshots_select_own
on public.invoice_snapshots for select to authenticated
using ((select auth.uid()) = owner_user_id);

create policy invoice_payments_select_own
on public.invoice_payments for select to authenticated
using ((select auth.uid()) = owner_user_id);

create policy invoice_payments_insert_own
on public.invoice_payments for insert to authenticated
with check ((select auth.uid()) = owner_user_id);

create or replace function public.create_project_invoice(p_project_id bigint)
returns public.invoices
language plpgsql
security invoker
set search_path = ''
as $$
declare
  invoice_row public.invoices;
begin
  if (select auth.uid()) is null then
    raise exception 'Sesi pengguna tidak sah.';
  end if;

  insert into public.invoices (project_id)
  values (p_project_id)
  returning * into invoice_row;

  return invoice_row;
end;
$$;

revoke execute on function public.create_project_invoice(bigint)
  from public, anon;
grant execute on function public.create_project_invoice(bigint)
  to authenticated;

create or replace function public.issue_project_invoice(p_invoice_id bigint)
returns public.invoices
language plpgsql
security invoker
set search_path = ''
as $$
declare
  invoice_row public.invoices;
begin
  if (select auth.uid()) is null then
    raise exception 'Sesi pengguna tidak sah.';
  end if;

  update public.invoices as invoice
  set status = 'issued'
  where invoice.id = p_invoice_id
    and invoice.owner_user_id = (select auth.uid())
    and invoice.status = 'draft'
  returning invoice.* into invoice_row;

  if not found then
    raise exception 'Draf invois tidak ditemui atau telah dikeluarkan.';
  end if;
  return invoice_row;
end;
$$;

revoke execute on function public.issue_project_invoice(bigint)
  from public, anon;
grant execute on function public.issue_project_invoice(bigint)
  to authenticated;

create or replace function public.void_project_invoice(p_invoice_id bigint)
returns public.invoices
language plpgsql
security invoker
set search_path = ''
as $$
declare
  invoice_row public.invoices;
begin
  if (select auth.uid()) is null then
    raise exception 'Sesi pengguna tidak sah.';
  end if;

  update public.invoices as invoice
  set status = 'void'
  where invoice.id = p_invoice_id
    and invoice.owner_user_id = (select auth.uid())
    and invoice.status in ('draft', 'issued')
  returning invoice.* into invoice_row;

  if not found then
    raise exception 'Invois tidak boleh dibatalkan.';
  end if;
  return invoice_row;
end;
$$;

revoke execute on function public.void_project_invoice(bigint)
  from public, anon;
grant execute on function public.void_project_invoice(bigint)
  to authenticated;

create or replace function public.record_invoice_payment(
  p_invoice_id bigint,
  p_payment_date date,
  p_amount numeric,
  p_payment_method text,
  p_reference_no text default null,
  p_notes text default ''
)
returns public.invoice_payments
language plpgsql
security invoker
set search_path = ''
as $$
declare
  payment_row public.invoice_payments;
begin
  if (select auth.uid()) is null then
    raise exception 'Sesi pengguna tidak sah.';
  end if;

  insert into public.invoice_payments (
    invoice_id,
    payment_date,
    amount,
    payment_method,
    reference_no,
    notes
  )
  values (
    p_invoice_id,
    coalesce(p_payment_date, current_date),
    p_amount,
    p_payment_method,
    p_reference_no,
    coalesce(p_notes, '')
  )
  returning * into payment_row;

  return payment_row;
end;
$$;

revoke execute on function public.record_invoice_payment(
  bigint,
  date,
  numeric,
  text,
  text,
  text
) from public, anon;
grant execute on function public.record_invoice_payment(
  bigint,
  date,
  numeric,
  text,
  text,
  text
) to authenticated;

commit;
