begin;

-- The dashboard-created event trigger can continue using this function by OID,
-- but browser roles must never be able to call a SECURITY DEFINER function directly.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- Cover foreign keys used by company deletion, joins and tenant ownership checks.
create index clients_company_owner_idx
  on public.clients (company_id, owner_user_id);

create index site_visits_company_owner_idx
  on public.site_visits (company_id, owner_user_id);

create index site_visit_entries_area_visit_company_owner_idx
  on public.site_visit_entries (area_id, site_visit_id, company_id, owner_user_id);

create index site_visit_entries_guide_key_idx
  on public.site_visit_entries (guide_key);

-- Close index gaps detected in the previously approved catalog foundation.
create index company_catalog_categories_company_owner_idx
  on public.company_catalog_categories (company_id, owner_user_id);

create index company_catalog_categories_source_category_idx
  on public.company_catalog_categories (source_category_id);

create index company_catalog_items_company_owner_idx
  on public.company_catalog_items (company_id, owner_user_id);

create index company_catalog_items_source_item_idx
  on public.company_catalog_items (source_item_id);

commit;
