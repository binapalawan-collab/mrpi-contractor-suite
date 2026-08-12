begin;

-- Corrections are operational annotations to the project's copied scope. The
-- accepted quotation and its snapshot remain immutable. Item and contract
-- amounts are deliberately excluded from the editable correction payload.
alter table public.project_items
  alter column rate type numeric(18, 6);

alter table public.project_items
  drop constraint project_items_amount_matches;

alter table public.project_items
  add constraint project_items_amount_matches
  check (amount = round(quantity * rate, 2));

create table public.project_scope_corrections (
  id bigint generated always as identity primary key,
  project_id bigint not null,
  project_item_id bigint not null,
  company_id bigint not null,
  owner_user_id uuid not null,
  reason text not null,
  before_data jsonb not null,
  after_data jsonb not null,
  created_at timestamptz not null default now(),

  constraint project_scope_corrections_item_fkey
    foreign key (project_item_id, project_id, company_id, owner_user_id)
    references public.project_items (id, project_id, company_id, owner_user_id)
    on delete restrict,
  constraint project_scope_corrections_reason_not_blank
    check (length(btrim(reason)) > 0),
  constraint project_scope_corrections_payload_objects
    check (jsonb_typeof(before_data) = 'object' and jsonb_typeof(after_data) = 'object')
);

create index project_scope_corrections_project_created_idx
  on public.project_scope_corrections (project_id, company_id, owner_user_id, created_at desc, id desc);
create index project_scope_corrections_item_idx
  on public.project_scope_corrections (project_item_id);

alter table public.project_scope_corrections enable row level security;
revoke all on table public.project_scope_corrections from anon, authenticated;
revoke all on sequence public.project_scope_corrections_id_seq from anon, authenticated;
grant select on table public.project_scope_corrections to authenticated;

create policy project_scope_corrections_select_own
on public.project_scope_corrections for select to authenticated
using ((select auth.uid()) = owner_user_id);

comment on table public.project_scope_corrections is
  'Append-only audit log for price-neutral corrections to the current operational project scope.';

create or replace function public.correct_project_scope_item(
  p_project_item_id bigint,
  p_item_name text,
  p_description text,
  p_measurement_text text,
  p_calculation_method text,
  p_unit text,
  p_quantity numeric,
  p_reason text
)
returns public.project_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  old_item public.project_items;
  updated_item public.project_items;
  effective_rate numeric(18, 6);
  before_payload jsonb;
  after_payload jsonb;
begin
  if current_user_id is null then
    raise exception 'Sesi pengguna tidak sah.';
  end if;

  select item.* into old_item
  from public.project_items as item
  where item.id = p_project_item_id
    and item.owner_user_id = current_user_id
  for update;

  if not found then
    raise exception 'Item projek tidak ditemui.';
  end if;
  if length(btrim(coalesce(p_item_name, ''))) = 0 then
    raise exception 'Nama item mesti diisi.';
  end if;
  if length(btrim(coalesce(p_description, ''))) = 0 then
    raise exception 'Keterangan mesti diisi.';
  end if;
  if p_measurement_text is not null and length(btrim(p_measurement_text)) = 0 then
    p_measurement_text := null;
  end if;
  if p_calculation_method not in ('area', 'length', 'qty', 'lsum') then
    raise exception 'Kaedah pengiraan tidak sah.';
  end if;
  if length(btrim(coalesce(p_unit, ''))) = 0 then
    raise exception 'Unit mesti diisi.';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Kuantiti mesti lebih besar daripada 0.';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Sebab pembetulan mesti diisi.';
  end if;

  effective_rate := round(old_item.amount / p_quantity, 6);
  if round(p_quantity * effective_rate, 2) <> old_item.amount then
    raise exception 'Kuantiti ini tidak dapat mengekalkan jumlah item dengan tepat. Gunakan kuantiti yang lebih sesuai atau Variation Order.';
  end if;

  before_payload := jsonb_build_object(
    'item_name', old_item.item_name,
    'description', old_item.description,
    'measurement_text', old_item.measurement_text,
    'calculation_method', old_item.calculation_method,
    'unit', old_item.unit,
    'quantity', old_item.quantity,
    'rate', old_item.rate,
    'amount', old_item.amount
  );

  update public.project_items as item set
    item_name = btrim(p_item_name),
    description = btrim(p_description),
    measurement_text = case when p_measurement_text is null then null else btrim(p_measurement_text) end,
    calculation_method = p_calculation_method,
    unit = btrim(p_unit),
    quantity = p_quantity,
    rate = effective_rate
  where item.id = old_item.id
    and item.owner_user_id = current_user_id
  returning item.* into updated_item;

  after_payload := jsonb_build_object(
    'item_name', updated_item.item_name,
    'description', updated_item.description,
    'measurement_text', updated_item.measurement_text,
    'calculation_method', updated_item.calculation_method,
    'unit', updated_item.unit,
    'quantity', updated_item.quantity,
    'rate', updated_item.rate,
    'amount', updated_item.amount
  );

  if before_payload = after_payload then
    raise exception 'Tiada perubahan butiran dikesan.';
  end if;

  insert into public.project_scope_corrections (
    project_id, project_item_id, company_id, owner_user_id,
    reason, before_data, after_data
  ) values (
    old_item.project_id, old_item.id, old_item.company_id, old_item.owner_user_id,
    btrim(p_reason), before_payload, after_payload
  );

  return updated_item;
end;
$$;

revoke execute on function public.correct_project_scope_item(bigint, text, text, text, text, text, numeric, text)
  from public, anon;
grant execute on function public.correct_project_scope_item(bigint, text, text, text, text, text, numeric, text)
  to authenticated;

commit;
