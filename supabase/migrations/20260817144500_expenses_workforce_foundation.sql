begin;

-- Shared foundation for the standalone MRPI Project Expenses and
-- MRPI Workforce applications. Both applications reuse the existing
-- auth.users, companies and projects records from Contractor Suite.

create table public.expense_suppliers (
  id bigint generated always as identity primary key,
  company_id bigint not null,
  owner_user_id uuid not null,
  name text not null,
  phone text,
  notes text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint expense_suppliers_company_owner_fkey
    foreign key (company_id, owner_user_id)
    references public.companies (id, owner_user_id)
    on delete cascade,
  constraint expense_suppliers_identity_key
    unique (id, company_id, owner_user_id),
  constraint expense_suppliers_name_not_blank
    check (length(btrim(name)) > 0),
  constraint expense_suppliers_phone_not_blank
    check (phone is null or length(btrim(phone)) > 0),
  constraint expense_suppliers_notes_length
    check (length(notes) <= 2000)
);

create table public.workers (
  id bigint generated always as identity primary key,
  company_id bigint not null,
  owner_user_id uuid not null,
  name text not null,
  pay_type text not null,
  default_daily_rate numeric(12, 2),
  notes text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint workers_company_owner_fkey
    foreign key (company_id, owner_user_id)
    references public.companies (id, owner_user_id)
    on delete cascade,
  constraint workers_identity_key
    unique (id, company_id, owner_user_id),
  constraint workers_name_not_blank
    check (length(btrim(name)) > 0),
  constraint workers_pay_type_valid
    check (pay_type in ('daily', 'contract')),
  constraint workers_rate_matches_type
    check (
      (pay_type = 'daily' and default_daily_rate is not null and default_daily_rate >= 0)
      or (pay_type = 'contract' and default_daily_rate is null)
    ),
  constraint workers_notes_length
    check (length(notes) <= 2000)
);

create table public.worker_wage_payments (
  id bigint generated always as identity primary key,
  worker_id bigint not null,
  project_id bigint not null,
  company_id bigint not null,
  owner_user_id uuid not null,
  period_start date not null,
  period_end date not null,
  payment_date date not null default current_date,
  gross_amount numeric(14, 2) not null,
  advance_deduction numeric(14, 2) not null default 0,
  net_amount numeric(14, 2)
    generated always as (round(gross_amount - advance_deduction, 2)) stored,
  payment_method text not null,
  notes text not null default '',
  created_at timestamptz not null default now(),

  constraint worker_wage_payments_worker_company_owner_fkey
    foreign key (worker_id, company_id, owner_user_id)
    references public.workers (id, company_id, owner_user_id)
    on delete restrict,
  constraint worker_wage_payments_project_company_owner_fkey
    foreign key (project_id, company_id, owner_user_id)
    references public.projects (id, company_id, owner_user_id)
    on delete restrict,
  constraint worker_wage_payments_identity_key
    unique (id, worker_id, project_id, company_id, owner_user_id),
  constraint worker_wage_payments_project_identity_key
    unique (id, project_id, company_id, owner_user_id),
  constraint worker_wage_payments_period_valid
    check (period_end >= period_start),
  constraint worker_wage_payments_amount_valid
    check (gross_amount > 0 and advance_deduction >= 0 and advance_deduction <= gross_amount),
  constraint worker_wage_payments_method_valid
    check (payment_method in ('cash', 'bank_transfer', 'cheque', 'other')),
  constraint worker_wage_payments_notes_length
    check (length(notes) <= 2000)
);

create table public.worker_attendance (
  id bigint generated always as identity primary key,
  worker_id bigint not null,
  project_id bigint,
  company_id bigint not null,
  owner_user_id uuid not null,
  attendance_date date not null default current_date,
  status text not null,
  pay_type_snapshot text not null,
  daily_rate_snapshot numeric(12, 2) not null default 0,
  overtime_hours numeric(7, 2) not null default 0,
  overtime_rate numeric(12, 2) not null default 0,
  wage_amount numeric(14, 2) generated always as (
    round(
      case
        when pay_type_snapshot = 'contract' then 0
        when status = 'present' then daily_rate_snapshot
        when status = 'half_day' then daily_rate_snapshot / 2
        else 0
      end
      + (overtime_hours * overtime_rate),
      2
    )
  ) stored,
  wage_payment_id bigint,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint worker_attendance_worker_company_owner_fkey
    foreign key (worker_id, company_id, owner_user_id)
    references public.workers (id, company_id, owner_user_id)
    on delete restrict,
  constraint worker_attendance_project_company_owner_fkey
    foreign key (project_id, company_id, owner_user_id)
    references public.projects (id, company_id, owner_user_id)
    on delete restrict,
  constraint worker_attendance_payment_fkey
    foreign key (wage_payment_id, worker_id, project_id, company_id, owner_user_id)
    references public.worker_wage_payments (id, worker_id, project_id, company_id, owner_user_id)
    on delete restrict,
  constraint worker_attendance_identity_key
    unique (id, worker_id, company_id, owner_user_id),
  constraint worker_attendance_one_per_day_key
    unique (worker_id, attendance_date),
  constraint worker_attendance_status_valid
    check (status in ('present', 'half_day', 'absent')),
  constraint worker_attendance_type_valid
    check (pay_type_snapshot in ('daily', 'contract')),
  constraint worker_attendance_project_required
    check (status = 'absent' or project_id is not null),
  constraint worker_attendance_rates_valid
    check (
      daily_rate_snapshot >= 0
      and overtime_hours >= 0
      and overtime_hours <= 24
      and overtime_rate >= 0
      and (pay_type_snapshot = 'daily' or daily_rate_snapshot = 0)
    ),
  constraint worker_attendance_notes_length
    check (length(notes) <= 2000)
);

create table public.worker_advances (
  id bigint generated always as identity primary key,
  worker_id bigint not null,
  project_id bigint not null,
  company_id bigint not null,
  owner_user_id uuid not null,
  advance_date date not null default current_date,
  amount numeric(14, 2) not null,
  payment_method text not null,
  notes text not null default '',
  applied_wage_payment_id bigint,
  created_at timestamptz not null default now(),

  constraint worker_advances_worker_company_owner_fkey
    foreign key (worker_id, company_id, owner_user_id)
    references public.workers (id, company_id, owner_user_id)
    on delete restrict,
  constraint worker_advances_project_company_owner_fkey
    foreign key (project_id, company_id, owner_user_id)
    references public.projects (id, company_id, owner_user_id)
    on delete restrict,
  constraint worker_advances_payment_fkey
    foreign key (applied_wage_payment_id, worker_id, project_id, company_id, owner_user_id)
    references public.worker_wage_payments (id, worker_id, project_id, company_id, owner_user_id)
    on delete restrict,
  constraint worker_advances_identity_key
    unique (id, worker_id, project_id, company_id, owner_user_id),
  constraint worker_advances_project_identity_key
    unique (id, project_id, company_id, owner_user_id),
  constraint worker_advances_amount_positive
    check (amount > 0),
  constraint worker_advances_method_valid
    check (payment_method in ('cash', 'bank_transfer', 'cheque', 'other')),
  constraint worker_advances_notes_length
    check (length(notes) <= 2000)
);

create table public.project_expenses (
  id bigint generated always as identity primary key,
  project_id bigint not null,
  company_id bigint not null,
  owner_user_id uuid not null,
  supplier_id bigint,
  expense_date date not null default current_date,
  category text not null,
  description text not null,
  total_amount numeric(14, 2) not null,
  paid_amount numeric(14, 2) not null default 0,
  balance_amount numeric(14, 2)
    generated always as (round(total_amount - paid_amount, 2)) stored,
  status text not null default 'unpaid',
  source_type text not null default 'manual',
  source_worker_wage_payment_id bigint,
  source_worker_advance_id bigint,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint project_expenses_project_company_owner_fkey
    foreign key (project_id, company_id, owner_user_id)
    references public.projects (id, company_id, owner_user_id)
    on delete restrict,
  constraint project_expenses_supplier_company_owner_fkey
    foreign key (supplier_id, company_id, owner_user_id)
    references public.expense_suppliers (id, company_id, owner_user_id)
    on delete restrict,
  constraint project_expenses_worker_wage_fkey
    foreign key (source_worker_wage_payment_id, project_id, company_id, owner_user_id)
    references public.worker_wage_payments (id, project_id, company_id, owner_user_id)
    on delete restrict,
  constraint project_expenses_worker_advance_fkey
    foreign key (source_worker_advance_id, project_id, company_id, owner_user_id)
    references public.worker_advances (id, project_id, company_id, owner_user_id)
    on delete restrict,
  constraint project_expenses_identity_key
    unique (id, project_id, company_id, owner_user_id),
  constraint project_expenses_description_not_blank
    check (length(btrim(description)) > 0),
  constraint project_expenses_category_valid
    check (category in (
      'materials', 'labour', 'subcontractor', 'equipment', 'transport',
      'site', 'permit', 'utilities', 'other'
    )),
  constraint project_expenses_amounts_valid
    check (total_amount > 0 and paid_amount >= 0 and paid_amount <= total_amount),
  constraint project_expenses_status_valid
    check (status in ('unpaid', 'partially_paid', 'paid')),
  constraint project_expenses_status_amounts_valid
    check (
      (status = 'unpaid' and paid_amount = 0)
      or (status = 'partially_paid' and paid_amount > 0 and paid_amount < total_amount)
      or (status = 'paid' and paid_amount = total_amount)
    ),
  constraint project_expenses_source_valid
    check (
      (source_type = 'manual'
        and source_worker_wage_payment_id is null
        and source_worker_advance_id is null)
      or (source_type = 'worker_wage'
        and source_worker_wage_payment_id is not null
        and source_worker_advance_id is null)
      or (source_type = 'worker_advance'
        and source_worker_wage_payment_id is null
        and source_worker_advance_id is not null)
    ),
  constraint project_expenses_notes_length
    check (length(notes) <= 4000)
);

create unique index project_expenses_worker_wage_source_key
  on public.project_expenses (source_worker_wage_payment_id)
  where source_worker_wage_payment_id is not null;
create unique index project_expenses_worker_advance_source_key
  on public.project_expenses (source_worker_advance_id)
  where source_worker_advance_id is not null;

create table public.project_expense_items (
  id bigint generated always as identity primary key,
  expense_id bigint not null,
  project_id bigint not null,
  company_id bigint not null,
  owner_user_id uuid not null,
  description text not null,
  quantity numeric(14, 3) not null,
  unit text not null,
  unit_price numeric(14, 2) not null,
  amount numeric(14, 2) generated always as (round(quantity * unit_price, 2)) stored,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),

  constraint project_expense_items_expense_fkey
    foreign key (expense_id, project_id, company_id, owner_user_id)
    references public.project_expenses (id, project_id, company_id, owner_user_id)
    on delete cascade,
  constraint project_expense_items_description_not_blank
    check (length(btrim(description)) > 0),
  constraint project_expense_items_quantity_positive
    check (quantity > 0),
  constraint project_expense_items_unit_not_blank
    check (length(btrim(unit)) > 0),
  constraint project_expense_items_price_nonnegative
    check (unit_price >= 0),
  constraint project_expense_items_sort_nonnegative
    check (sort_order >= 0)
);

create table public.project_expense_payments (
  id bigint generated always as identity primary key,
  expense_id bigint not null,
  project_id bigint not null,
  company_id bigint not null,
  owner_user_id uuid not null,
  payment_date date not null default current_date,
  amount numeric(14, 2) not null,
  payment_method text not null,
  reference_no text,
  notes text not null default '',
  created_at timestamptz not null default now(),

  constraint project_expense_payments_expense_fkey
    foreign key (expense_id, project_id, company_id, owner_user_id)
    references public.project_expenses (id, project_id, company_id, owner_user_id)
    on delete cascade,
  constraint project_expense_payments_amount_positive
    check (amount > 0),
  constraint project_expense_payments_method_valid
    check (payment_method in ('cash', 'bank_transfer', 'cheque', 'card', 'other')),
  constraint project_expense_payments_reference_not_blank
    check (reference_no is null or length(btrim(reference_no)) > 0),
  constraint project_expense_payments_reference_length
    check (reference_no is null or length(reference_no) <= 200),
  constraint project_expense_payments_notes_length
    check (length(notes) <= 2000)
);

create table public.project_expense_attachments (
  id bigint generated always as identity primary key,
  expense_id bigint not null,
  project_id bigint not null,
  company_id bigint not null,
  owner_user_id uuid not null,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null,
  created_at timestamptz not null default now(),

  constraint project_expense_attachments_expense_fkey
    foreign key (expense_id, project_id, company_id, owner_user_id)
    references public.project_expenses (id, project_id, company_id, owner_user_id)
    on delete cascade,
  constraint project_expense_attachments_path_key
    unique (storage_path),
  constraint project_expense_attachments_path_not_blank
    check (length(btrim(storage_path)) > 0),
  constraint project_expense_attachments_name_not_blank
    check (length(btrim(file_name)) > 0),
  constraint project_expense_attachments_mime_valid
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  constraint project_expense_attachments_size_valid
    check (file_size > 0 and file_size <= 10485760)
);

create index expense_suppliers_owner_active_name_idx
  on public.expense_suppliers (owner_user_id, is_active, name, id);
create index workers_owner_active_name_idx
  on public.workers (owner_user_id, is_active, name, id);
create index worker_attendance_owner_date_idx
  on public.worker_attendance (owner_user_id, attendance_date desc, id desc);
create index worker_attendance_project_date_idx
  on public.worker_attendance (project_id, company_id, owner_user_id, attendance_date desc)
  where project_id is not null;
create index worker_attendance_unpaid_idx
  on public.worker_attendance (worker_id, project_id, attendance_date)
  where wage_payment_id is null and status in ('present', 'half_day');
create index worker_advances_unapplied_idx
  on public.worker_advances (worker_id, project_id, advance_date, id)
  where applied_wage_payment_id is null;
create index worker_wage_payments_owner_date_idx
  on public.worker_wage_payments (owner_user_id, payment_date desc, id desc);
create index worker_wage_payments_project_period_idx
  on public.worker_wage_payments (project_id, company_id, owner_user_id, period_end desc, id desc);
create index project_expenses_project_date_idx
  on public.project_expenses (project_id, company_id, owner_user_id, expense_date desc, id desc);
create index project_expenses_owner_status_date_idx
  on public.project_expenses (owner_user_id, status, expense_date desc, id desc);
create index project_expenses_supplier_idx
  on public.project_expenses (supplier_id, company_id, owner_user_id)
  where supplier_id is not null;
create index project_expense_items_expense_sort_idx
  on public.project_expense_items (expense_id, project_id, company_id, owner_user_id, sort_order, id);
create index project_expense_payments_expense_date_idx
  on public.project_expense_payments (expense_id, project_id, company_id, owner_user_id, payment_date, id);
create index project_expense_attachments_expense_idx
  on public.project_expense_attachments (expense_id, project_id, company_id, owner_user_id, id);

alter table public.expense_suppliers enable row level security;
alter table public.workers enable row level security;
alter table public.worker_wage_payments enable row level security;
alter table public.worker_attendance enable row level security;
alter table public.worker_advances enable row level security;
alter table public.project_expenses enable row level security;
alter table public.project_expense_items enable row level security;
alter table public.project_expense_payments enable row level security;
alter table public.project_expense_attachments enable row level security;

create policy expense_suppliers_select_own on public.expense_suppliers
  for select to authenticated using ((select auth.uid()) = owner_user_id);
create policy expense_suppliers_insert_own on public.expense_suppliers
  for insert to authenticated with check ((select auth.uid()) = owner_user_id);
create policy expense_suppliers_update_own on public.expense_suppliers
  for update to authenticated using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);
create policy expense_suppliers_delete_own on public.expense_suppliers
  for delete to authenticated using ((select auth.uid()) = owner_user_id);

create policy workers_select_own on public.workers
  for select to authenticated using ((select auth.uid()) = owner_user_id);
create policy workers_insert_own on public.workers
  for insert to authenticated with check ((select auth.uid()) = owner_user_id);
create policy workers_update_own on public.workers
  for update to authenticated using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);

create policy worker_wage_payments_select_own on public.worker_wage_payments
  for select to authenticated using ((select auth.uid()) = owner_user_id);

create policy worker_attendance_select_own on public.worker_attendance
  for select to authenticated using ((select auth.uid()) = owner_user_id);
create policy worker_attendance_insert_own on public.worker_attendance
  for insert to authenticated with check ((select auth.uid()) = owner_user_id);
create policy worker_attendance_update_own on public.worker_attendance
  for update to authenticated using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);
create policy worker_attendance_delete_unpaid_own on public.worker_attendance
  for delete to authenticated
  using ((select auth.uid()) = owner_user_id and wage_payment_id is null);

create policy worker_advances_select_own on public.worker_advances
  for select to authenticated using ((select auth.uid()) = owner_user_id);

create policy project_expenses_select_own on public.project_expenses
  for select to authenticated using ((select auth.uid()) = owner_user_id);
create policy project_expenses_update_own on public.project_expenses
  for update to authenticated using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);

create policy project_expense_items_select_own on public.project_expense_items
  for select to authenticated using ((select auth.uid()) = owner_user_id);
create policy project_expense_payments_select_own on public.project_expense_payments
  for select to authenticated using ((select auth.uid()) = owner_user_id);

create policy project_expense_attachments_select_own on public.project_expense_attachments
  for select to authenticated using ((select auth.uid()) = owner_user_id);
create policy project_expense_attachments_insert_own on public.project_expense_attachments
  for insert to authenticated with check ((select auth.uid()) = owner_user_id);
create policy project_expense_attachments_delete_own on public.project_expense_attachments
  for delete to authenticated using ((select auth.uid()) = owner_user_id);

create or replace function private.prepare_worker_attendance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  worker_row public.workers;
  project_row public.projects;
begin
  if current_user_id is null then
    raise exception 'Sesi pengguna tidak sah.';
  end if;

  if tg_op = 'UPDATE' and old.wage_payment_id is not null then
    if (to_jsonb(new) - array['notes', 'updated_at'])
      is distinct from (to_jsonb(old) - array['notes', 'updated_at']) then
      raise exception 'Kehadiran yang sudah dibayar tidak boleh diubah.';
    end if;
  end if;

  select worker.* into worker_row
  from public.workers as worker
  where worker.id = new.worker_id
    and worker.owner_user_id = current_user_id;

  if not found then
    raise exception 'Pekerja tidak ditemui.';
  end if;

  if new.project_id is not null then
    select project.* into project_row
    from public.projects as project
    where project.id = new.project_id
      and project.owner_user_id = current_user_id
      and project.company_id = worker_row.company_id;
    if not found then
      raise exception 'Projek tidak ditemui atau tidak sepadan dengan syarikat.';
    end if;
  end if;

  new.company_id := worker_row.company_id;
  new.owner_user_id := current_user_id;
  if tg_op = 'INSERT' then
    new.pay_type_snapshot := worker_row.pay_type;
    new.wage_payment_id := null;
  else
    new.pay_type_snapshot := old.pay_type_snapshot;
  end if;
  if new.pay_type_snapshot = 'daily' then
    new.daily_rate_snapshot := coalesce(new.daily_rate_snapshot, worker_row.default_daily_rate, 0);
  else
    new.daily_rate_snapshot := 0;
  end if;
  new.notes := coalesce(new.notes, '');
  new.updated_at := now();
  return new;
end;
$$;

create trigger worker_attendance_prepare_trigger
before insert or update on public.worker_attendance
for each row execute function private.prepare_worker_attendance();

create or replace function private.guard_project_expense_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (new.project_id, new.company_id, new.owner_user_id, new.source_type,
      new.source_worker_wage_payment_id, new.source_worker_advance_id)
    is distinct from
     (old.project_id, old.company_id, old.owner_user_id, old.source_type,
      old.source_worker_wage_payment_id, old.source_worker_advance_id) then
    raise exception 'Sumber dan pemilikan expenses tidak boleh diubah.';
  end if;

  if pg_trigger_depth() = 1
    and (new.total_amount, new.paid_amount, new.status)
      is distinct from (old.total_amount, old.paid_amount, old.status) then
    raise exception 'Amaun dan status expenses dikawal oleh transaksi sistem.';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger project_expenses_guard_update_trigger
before update on public.project_expenses
for each row execute function private.guard_project_expense_update();

create or replace function private.refresh_project_expense_payment_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_expense_id bigint := coalesce(new.expense_id, old.expense_id);
  payment_total numeric(14, 2);
  expense_total numeric(14, 2);
begin
  select expense.total_amount into expense_total
  from public.project_expenses as expense
  where expense.id = target_expense_id
  for update;

  select coalesce(sum(payment.amount), 0) into payment_total
  from public.project_expense_payments as payment
  where payment.expense_id = target_expense_id;

  if payment_total > expense_total then
    raise exception 'Jumlah bayaran melebihi jumlah expenses.';
  end if;

  update public.project_expenses
  set paid_amount = payment_total,
      status = case
        when payment_total = 0 then 'unpaid'
        when payment_total = expense_total then 'paid'
        else 'partially_paid'
      end,
      updated_at = now()
  where id = target_expense_id;

  return coalesce(new, old);
end;
$$;

create trigger project_expense_payments_refresh_trigger
after insert or update or delete on public.project_expense_payments
for each row execute function private.refresh_project_expense_payment_state();

create or replace function public.create_project_expense(
  p_project_id bigint,
  p_expense_date date,
  p_category text,
  p_description text,
  p_supplier_id bigint,
  p_notes text,
  p_items jsonb,
  p_initial_payment numeric,
  p_payment_method text,
  p_reference_no text
)
returns public.project_expenses
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  project_row public.projects;
  expense_row public.project_expenses;
  item_row jsonb;
  item_total numeric(14, 2) := 0;
  item_count integer := 0;
  item_order integer := 0;
begin
  if current_user_id is null then raise exception 'Sesi pengguna tidak sah.'; end if;

  select project.* into project_row
  from public.projects as project
  where project.id = p_project_id and project.owner_user_id = current_user_id;
  if not found then raise exception 'Projek tidak ditemui.'; end if;

  if p_supplier_id is not null and not exists (
    select 1 from public.expense_suppliers as supplier
    where supplier.id = p_supplier_id
      and supplier.company_id = project_row.company_id
      and supplier.owner_user_id = current_user_id
  ) then raise exception 'Pembekal tidak ditemui.'; end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Sekurang-kurangnya satu item expenses diperlukan.';
  end if;

  for item_row in select value from jsonb_array_elements(p_items)
  loop
    if length(btrim(coalesce(item_row ->> 'description', ''))) = 0
      or coalesce((item_row ->> 'quantity')::numeric, 0) <= 0
      or coalesce((item_row ->> 'unit_price')::numeric, -1) < 0 then
      raise exception 'Butiran item expenses tidak lengkap.';
    end if;
    item_total := item_total + round(
      (item_row ->> 'quantity')::numeric * (item_row ->> 'unit_price')::numeric,
      2
    );
    item_count := item_count + 1;
  end loop;

  if item_count = 0 or item_total <= 0 then
    raise exception 'Jumlah expenses mesti melebihi RM0.';
  end if;
  if coalesce(p_initial_payment, 0) < 0 or coalesce(p_initial_payment, 0) > item_total then
    raise exception 'Bayaran awal tidak sah.';
  end if;
  if coalesce(p_initial_payment, 0) > 0
    and p_payment_method not in ('cash', 'bank_transfer', 'cheque', 'card', 'other') then
    raise exception 'Kaedah bayaran tidak sah.';
  end if;

  insert into public.project_expenses (
    project_id, company_id, owner_user_id, supplier_id, expense_date,
    category, description, total_amount, notes
  ) values (
    project_row.id, project_row.company_id, current_user_id, p_supplier_id,
    coalesce(p_expense_date, current_date), p_category, btrim(p_description),
    item_total, coalesce(p_notes, '')
  ) returning * into expense_row;

  for item_row in select value from jsonb_array_elements(p_items)
  loop
    insert into public.project_expense_items (
      expense_id, project_id, company_id, owner_user_id, description,
      quantity, unit, unit_price, sort_order
    ) values (
      expense_row.id, project_row.id, project_row.company_id, current_user_id,
      btrim(item_row ->> 'description'), (item_row ->> 'quantity')::numeric,
      coalesce(nullif(btrim(item_row ->> 'unit'), ''), 'unit'),
      (item_row ->> 'unit_price')::numeric, item_order
    );
    item_order := item_order + 1;
  end loop;

  if coalesce(p_initial_payment, 0) > 0 then
    insert into public.project_expense_payments (
      expense_id, project_id, company_id, owner_user_id, payment_date,
      amount, payment_method, reference_no
    ) values (
      expense_row.id, project_row.id, project_row.company_id, current_user_id,
      coalesce(p_expense_date, current_date), p_initial_payment,
      p_payment_method, nullif(btrim(p_reference_no), '')
    );
  end if;

  select * into expense_row from public.project_expenses where id = expense_row.id;
  return expense_row;
end;
$$;

create or replace function public.record_project_expense_payment(
  p_expense_id bigint,
  p_payment_date date,
  p_amount numeric,
  p_payment_method text,
  p_reference_no text,
  p_notes text
)
returns public.project_expense_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  expense_row public.project_expenses;
  payment_row public.project_expense_payments;
begin
  if current_user_id is null then raise exception 'Sesi pengguna tidak sah.'; end if;

  select expense.* into expense_row
  from public.project_expenses as expense
  where expense.id = p_expense_id and expense.owner_user_id = current_user_id
  for update;
  if not found then raise exception 'Expenses tidak ditemui.'; end if;
  if p_amount <= 0 or p_amount > expense_row.balance_amount then
    raise exception 'Amaun bayaran melebihi baki expenses.';
  end if;

  insert into public.project_expense_payments (
    expense_id, project_id, company_id, owner_user_id, payment_date,
    amount, payment_method, reference_no, notes
  ) values (
    expense_row.id, expense_row.project_id, expense_row.company_id, current_user_id,
    coalesce(p_payment_date, current_date), p_amount, p_payment_method,
    nullif(btrim(p_reference_no), ''), coalesce(p_notes, '')
  ) returning * into payment_row;
  return payment_row;
end;
$$;

create or replace function public.record_worker_advance(
  p_worker_id bigint,
  p_project_id bigint,
  p_advance_date date,
  p_amount numeric,
  p_payment_method text,
  p_notes text
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
begin
  if current_user_id is null then raise exception 'Sesi pengguna tidak sah.'; end if;
  if p_amount <= 0 then raise exception 'Amaun pendahuluan mesti melebihi RM0.'; end if;

  select worker.* into worker_row from public.workers as worker
  where worker.id = p_worker_id and worker.owner_user_id = current_user_id;
  if not found then raise exception 'Pekerja tidak ditemui.'; end if;

  select project.* into project_row from public.projects as project
  where project.id = p_project_id
    and project.company_id = worker_row.company_id
    and project.owner_user_id = current_user_id;
  if not found then raise exception 'Projek tidak ditemui.'; end if;

  insert into public.worker_advances (
    worker_id, project_id, company_id, owner_user_id, advance_date,
    amount, payment_method, notes
  ) values (
    worker_row.id, project_row.id, project_row.company_id, current_user_id,
    coalesce(p_advance_date, current_date), p_amount, p_payment_method,
    coalesce(p_notes, '')
  ) returning * into advance_row;

  insert into public.project_expenses (
    project_id, company_id, owner_user_id, expense_date, category, description,
    total_amount, source_type, source_worker_advance_id, notes
  ) values (
    project_row.id, project_row.company_id, current_user_id,
    advance_row.advance_date, 'labour', 'Pendahuluan upah · ' || worker_row.name,
    advance_row.amount, 'worker_advance', advance_row.id, advance_row.notes
  ) returning * into expense_row;

  insert into public.project_expense_items (
    expense_id, project_id, company_id, owner_user_id, description,
    quantity, unit, unit_price, sort_order
  ) values (
    expense_row.id, project_row.id, project_row.company_id, current_user_id,
    'Pendahuluan upah · ' || worker_row.name, 1, 'bayaran', advance_row.amount, 0
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

create or replace function public.record_worker_wage_payment(
  p_worker_id bigint,
  p_project_id bigint,
  p_period_start date,
  p_period_end date,
  p_payment_date date,
  p_gross_amount numeric,
  p_advance_ids bigint[],
  p_payment_method text,
  p_notes text
)
returns public.worker_wage_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  worker_row public.workers;
  project_row public.projects;
  payment_row public.worker_wage_payments;
  attendance_total numeric(14, 2);
  attendance_count integer;
  advance_total numeric(14, 2) := 0;
  requested_advance_count integer := 0;
  valid_advance_count integer := 0;
  gross_total numeric(14, 2);
  expense_row public.project_expenses;
begin
  if current_user_id is null then raise exception 'Sesi pengguna tidak sah.'; end if;
  if p_period_end < p_period_start then raise exception 'Tempoh bayaran tidak sah.'; end if;

  select worker.* into worker_row from public.workers as worker
  where worker.id = p_worker_id and worker.owner_user_id = current_user_id;
  if not found then raise exception 'Pekerja tidak ditemui.'; end if;

  select project.* into project_row from public.projects as project
  where project.id = p_project_id
    and project.company_id = worker_row.company_id
    and project.owner_user_id = current_user_id;
  if not found then raise exception 'Projek tidak ditemui.'; end if;

  perform 1
  from public.worker_attendance as attendance
  where attendance.worker_id = worker_row.id
    and attendance.project_id = project_row.id
    and attendance.owner_user_id = current_user_id
    and attendance.attendance_date between p_period_start and p_period_end
    and attendance.status in ('present', 'half_day')
    and attendance.wage_payment_id is null
  for update;

  select coalesce(sum(attendance.wage_amount), 0), count(*)
  into attendance_total, attendance_count
  from public.worker_attendance as attendance
  where attendance.worker_id = worker_row.id
    and attendance.project_id = project_row.id
    and attendance.owner_user_id = current_user_id
    and attendance.attendance_date between p_period_start and p_period_end
    and attendance.status in ('present', 'half_day')
    and attendance.wage_payment_id is null;

  if worker_row.pay_type = 'daily' then
    if attendance_count = 0 then raise exception 'Tiada kehadiran belum dibayar dalam tempoh ini.'; end if;
    gross_total := attendance_total;
  else
    gross_total := p_gross_amount;
  end if;

  if gross_total is null or gross_total <= 0 then
    raise exception 'Jumlah upah mesti melebihi RM0.';
  end if;

  requested_advance_count := coalesce(cardinality(p_advance_ids), 0);
  if requested_advance_count > 0 then
    perform 1 from public.worker_advances as advance
    where advance.id = any(p_advance_ids)
      and advance.worker_id = worker_row.id
      and advance.project_id = project_row.id
      and advance.owner_user_id = current_user_id
      and advance.applied_wage_payment_id is null
    for update;

    select coalesce(sum(advance.amount), 0), count(*)
    into advance_total, valid_advance_count
    from public.worker_advances as advance
    where advance.id = any(p_advance_ids)
      and advance.worker_id = worker_row.id
      and advance.project_id = project_row.id
      and advance.owner_user_id = current_user_id
      and advance.applied_wage_payment_id is null;

    if valid_advance_count <> requested_advance_count then
      raise exception 'Pendahuluan tidak sah atau telah digunakan.';
    end if;
  end if;

  if advance_total > gross_total then
    raise exception 'Jumlah pendahuluan melebihi upah kasar.';
  end if;

  insert into public.worker_wage_payments (
    worker_id, project_id, company_id, owner_user_id, period_start, period_end,
    payment_date, gross_amount, advance_deduction, payment_method, notes
  ) values (
    worker_row.id, project_row.id, project_row.company_id, current_user_id,
    p_period_start, p_period_end, coalesce(p_payment_date, current_date),
    gross_total, advance_total, p_payment_method, coalesce(p_notes, '')
  ) returning * into payment_row;

  update public.worker_attendance as attendance
  set wage_payment_id = payment_row.id, updated_at = now()
  where attendance.worker_id = worker_row.id
    and attendance.project_id = project_row.id
    and attendance.owner_user_id = current_user_id
    and attendance.attendance_date between p_period_start and p_period_end
    and attendance.status in ('present', 'half_day')
    and attendance.wage_payment_id is null;

  if requested_advance_count > 0 then
    update public.worker_advances as advance
    set applied_wage_payment_id = payment_row.id
    where advance.id = any(p_advance_ids)
      and advance.worker_id = worker_row.id
      and advance.project_id = project_row.id
      and advance.owner_user_id = current_user_id
      and advance.applied_wage_payment_id is null;
  end if;

  if payment_row.net_amount > 0 then
    insert into public.project_expenses (
      project_id, company_id, owner_user_id, expense_date, category, description,
      total_amount, source_type, source_worker_wage_payment_id, notes
    ) values (
      project_row.id, project_row.company_id, current_user_id,
      payment_row.payment_date, 'labour',
      'Bayaran upah · ' || worker_row.name || ' · ' ||
        to_char(payment_row.period_start, 'DD/MM/YYYY') || '–' ||
        to_char(payment_row.period_end, 'DD/MM/YYYY'),
      payment_row.net_amount, 'worker_wage', payment_row.id, payment_row.notes
    ) returning * into expense_row;

    insert into public.project_expense_items (
      expense_id, project_id, company_id, owner_user_id, description,
      quantity, unit, unit_price, sort_order
    ) values (
      expense_row.id, project_row.id, project_row.company_id, current_user_id,
      'Baki upah dibayar selepas pendahuluan', 1, 'bayaran', payment_row.net_amount, 0
    );

    insert into public.project_expense_payments (
      expense_id, project_id, company_id, owner_user_id, payment_date,
      amount, payment_method, notes
    ) values (
      expense_row.id, project_row.id, project_row.company_id, current_user_id,
      payment_row.payment_date, payment_row.net_amount,
      payment_row.payment_method, payment_row.notes
    );
  end if;

  return payment_row;
end;
$$;

create or replace view public.project_cost_overview
with (security_invoker = true)
as
select
  project.id as project_id,
  project.company_id,
  project.owner_user_id,
  project.project_no,
  project.project_name,
  project.client_name,
  project.status as project_status,
  project.current_contract_amount,
  coalesce(expense.committed_expenses, 0)::numeric(14, 2) as committed_expenses,
  coalesce(expense.paid_expenses, 0)::numeric(14, 2) as paid_expenses,
  coalesce(expense.outstanding_expenses, 0)::numeric(14, 2) as outstanding_expenses,
  coalesce(receipt.customer_received, 0)::numeric(14, 2) as customer_received,
  round(project.current_contract_amount - coalesce(expense.committed_expenses, 0), 2)
    as estimated_gross_profit,
  round(coalesce(receipt.customer_received, 0) - coalesce(expense.paid_expenses, 0), 2)
    as cash_position
from public.projects as project
left join lateral (
  select
    sum(item.total_amount) as committed_expenses,
    sum(item.paid_amount) as paid_expenses,
    sum(item.balance_amount) as outstanding_expenses
  from public.project_expenses as item
  where item.project_id = project.id
) as expense on true
left join lateral (
  select sum(payment.amount) as customer_received
  from public.invoice_payments as payment
  where payment.project_id = project.id
) as receipt on true;

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
  coalesce(attendance.unpaid_wages, 0)::numeric(14, 2) as unpaid_wages,
  coalesce(advance.unapplied_advances, 0)::numeric(14, 2) as unapplied_advances,
  greatest(
    round(coalesce(attendance.unpaid_wages, 0) - coalesce(advance.unapplied_advances, 0), 2),
    0
  )::numeric(14, 2) as estimated_balance
from public.workers as worker
left join lateral (
  select sum(record.wage_amount) as unpaid_wages
  from public.worker_attendance as record
  where record.worker_id = worker.id
    and record.wage_payment_id is null
    and record.status in ('present', 'half_day')
) as attendance on true
left join lateral (
  select sum(item.amount) as unapplied_advances
  from public.worker_advances as item
  where item.worker_id = worker.id
    and item.applied_wage_payment_id is null
) as advance on true;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'expense-receipts',
  'expense-receipts',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy expense_receipts_select_own
on storage.objects for select to authenticated
using (
  bucket_id = 'expense-receipts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy expense_receipts_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'expense-receipts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy expense_receipts_update_own
on storage.objects for update to authenticated
using (
  bucket_id = 'expense-receipts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'expense-receipts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy expense_receipts_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'expense-receipts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

revoke all on table public.expense_suppliers from anon, authenticated;
revoke all on table public.workers from anon, authenticated;
revoke all on table public.worker_wage_payments from anon, authenticated;
revoke all on table public.worker_attendance from anon, authenticated;
revoke all on table public.worker_advances from anon, authenticated;
revoke all on table public.project_expenses from anon, authenticated;
revoke all on table public.project_expense_items from anon, authenticated;
revoke all on table public.project_expense_payments from anon, authenticated;
revoke all on table public.project_expense_attachments from anon, authenticated;

grant select, insert, delete on table public.expense_suppliers to authenticated;
grant update (name, phone, notes, is_active) on table public.expense_suppliers to authenticated;
grant select, insert on table public.workers to authenticated;
grant update (name, pay_type, default_daily_rate, notes, is_active) on table public.workers to authenticated;
grant select on table public.worker_wage_payments to authenticated;
grant select, insert, delete on table public.worker_attendance to authenticated;
grant update (
  project_id, attendance_date, status, daily_rate_snapshot,
  overtime_hours, overtime_rate, notes
) on table public.worker_attendance to authenticated;
grant select on table public.worker_advances to authenticated;
grant select on table public.project_expenses to authenticated;
grant update (supplier_id, category, description, notes) on table public.project_expenses to authenticated;
grant select on table public.project_expense_items to authenticated;
grant select on table public.project_expense_payments to authenticated;
grant select, insert, delete on table public.project_expense_attachments to authenticated;
grant select on table public.project_cost_overview to authenticated;
grant select on table public.worker_balance_overview to authenticated;

grant usage, select on sequence public.expense_suppliers_id_seq to authenticated;
grant usage, select on sequence public.workers_id_seq to authenticated;
grant usage, select on sequence public.worker_attendance_id_seq to authenticated;
grant usage, select on sequence public.project_expense_attachments_id_seq to authenticated;

revoke execute on function private.prepare_worker_attendance() from public, anon, authenticated, service_role;
revoke execute on function private.guard_project_expense_update() from public, anon, authenticated, service_role;
revoke execute on function private.refresh_project_expense_payment_state() from public, anon, authenticated, service_role;
revoke execute on function public.create_project_expense(bigint, date, text, text, bigint, text, jsonb, numeric, text, text)
  from public, anon;
revoke execute on function public.record_project_expense_payment(bigint, date, numeric, text, text, text)
  from public, anon;
revoke execute on function public.record_worker_advance(bigint, bigint, date, numeric, text, text)
  from public, anon;
revoke execute on function public.record_worker_wage_payment(bigint, bigint, date, date, date, numeric, bigint[], text, text)
  from public, anon;
grant execute on function public.create_project_expense(bigint, date, text, text, bigint, text, jsonb, numeric, text, text)
  to authenticated;
grant execute on function public.record_project_expense_payment(bigint, date, numeric, text, text, text)
  to authenticated;
grant execute on function public.record_worker_advance(bigint, bigint, date, numeric, text, text)
  to authenticated;
grant execute on function public.record_worker_wage_payment(bigint, bigint, date, date, date, numeric, bigint[], text, text)
  to authenticated;

comment on table public.project_expenses is
  'Project costs shared by the standalone Expenses and Workforce apps.';
comment on table public.worker_attendance is
  'Admin-recorded daily attendance; workers do not require auth accounts or personal identity data.';
comment on function public.record_worker_wage_payment(bigint, bigint, date, date, date, numeric, bigint[], text, text) is
  'Records one worker payment for one project, applies selected advances and posts only the remaining cash payment to project expenses.';

commit;
