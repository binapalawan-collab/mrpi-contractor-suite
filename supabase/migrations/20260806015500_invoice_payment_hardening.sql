begin;

-- Cover every column of the composite snapshot foreign key. This keeps parent
-- invoice updates/deletes from requiring a full scan as financial history grows.
create index invoice_snapshots_invoice_owner_fkey_idx
  on public.invoice_snapshots (
    invoice_id,
    project_id,
    company_id,
    owner_user_id
  );

commit;
