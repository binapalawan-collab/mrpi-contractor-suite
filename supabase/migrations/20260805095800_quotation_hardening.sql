begin;

create policy quotation_number_counters_no_direct_access
on private.quotation_number_counters
for all
to public
using (false)
with check (false);

create index quotations_company_owner_idx
  on public.quotations (company_id, owner_user_id);

create index quotation_sections_source_quotation_idx
  on public.quotation_sections (
    quotation_id,
    source_site_visit_id,
    company_id,
    owner_user_id
  )
  where source_site_visit_id is not null;

create index quotation_items_section_company_owner_idx
  on public.quotation_items (
    section_id,
    quotation_id,
    company_id,
    owner_user_id
  );

commit;
