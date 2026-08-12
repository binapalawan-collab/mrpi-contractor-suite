begin;

create index project_scope_corrections_item_identity_idx
  on public.project_scope_corrections (project_item_id, project_id, company_id, owner_user_id);

grant update (item_name, description, measurement_text, calculation_method, unit, quantity, rate)
  on table public.project_items to authenticated;

create policy project_items_correct_own
on public.project_items for update to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create or replace function private.audit_project_scope_correction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  correction_reason text := current_setting('app.project_scope_correction_reason', true);
  before_payload jsonb;
  after_payload jsonb;
begin
  if current_user_id is null or old.owner_user_id <> current_user_id then
    raise exception 'Item projek tidak ditemui.';
  end if;
  if length(btrim(coalesce(correction_reason, ''))) = 0 then
    raise exception 'Butiran projek hanya boleh diubah melalui fungsi pembetulan harga kekal.';
  end if;
  if (new.id, new.project_id, new.section_id, new.company_id, new.owner_user_id,
      new.source_quotation_item_id, new.amount, new.sort_order, new.created_at)
    is distinct from
     (old.id, old.project_id, old.section_id, old.company_id, old.owner_user_id,
      old.source_quotation_item_id, old.amount, old.sort_order, old.created_at) then
    raise exception 'Identiti item dan jumlah harga tidak boleh diubah.';
  end if;

  before_payload := jsonb_build_object(
    'item_name', old.item_name, 'description', old.description,
    'measurement_text', old.measurement_text, 'calculation_method', old.calculation_method,
    'unit', old.unit, 'quantity', old.quantity, 'rate', old.rate, 'amount', old.amount
  );
  after_payload := jsonb_build_object(
    'item_name', new.item_name, 'description', new.description,
    'measurement_text', new.measurement_text, 'calculation_method', new.calculation_method,
    'unit', new.unit, 'quantity', new.quantity, 'rate', new.rate, 'amount', new.amount
  );
  if before_payload = after_payload then
    raise exception 'Tiada perubahan butiran dikesan.';
  end if;

  insert into public.project_scope_corrections (
    project_id, project_item_id, company_id, owner_user_id, reason, before_data, after_data
  ) values (
    old.project_id, old.id, old.company_id, old.owner_user_id,
    btrim(correction_reason), before_payload, after_payload
  );
  return new;
end;
$$;

revoke execute on function private.audit_project_scope_correction()
  from public, anon, authenticated, service_role;

drop trigger if exists project_items_audit_scope_correction on public.project_items;
create trigger project_items_audit_scope_correction
before update on public.project_items
for each row execute function private.audit_project_scope_correction();

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
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  old_item public.project_items;
  updated_item public.project_items;
  effective_rate numeric(18, 6);
begin
  if current_user_id is null then raise exception 'Sesi pengguna tidak sah.'; end if;

  select item.* into old_item
  from public.project_items as item
  where item.id = p_project_item_id and item.owner_user_id = current_user_id
  for update;
  if not found then raise exception 'Item projek tidak ditemui.'; end if;

  if length(btrim(coalesce(p_item_name, ''))) = 0 then raise exception 'Nama item mesti diisi.'; end if;
  if length(btrim(coalesce(p_description, ''))) = 0 then raise exception 'Keterangan mesti diisi.'; end if;
  if p_measurement_text is not null and length(btrim(p_measurement_text)) = 0 then p_measurement_text := null; end if;
  if p_calculation_method not in ('area', 'length', 'qty', 'lsum') then raise exception 'Kaedah pengiraan tidak sah.'; end if;
  if length(btrim(coalesce(p_unit, ''))) = 0 then raise exception 'Unit mesti diisi.'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Kuantiti mesti lebih besar daripada 0.'; end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'Sebab pembetulan mesti diisi.'; end if;

  effective_rate := round(old_item.amount / p_quantity, 6);
  if round(p_quantity * effective_rate, 2) <> old_item.amount then
    raise exception 'Kuantiti ini tidak dapat mengekalkan jumlah item dengan tepat. Gunakan kuantiti yang lebih sesuai atau Variation Order.';
  end if;

  perform set_config('app.project_scope_correction_reason', btrim(p_reason), true);
  update public.project_items as item set
    item_name = btrim(p_item_name),
    description = btrim(p_description),
    measurement_text = case when p_measurement_text is null then null else btrim(p_measurement_text) end,
    calculation_method = p_calculation_method,
    unit = btrim(p_unit),
    quantity = p_quantity,
    rate = effective_rate
  where item.id = old_item.id and item.owner_user_id = current_user_id
  returning item.* into updated_item;

  return updated_item;
end;
$$;

commit;
