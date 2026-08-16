begin;

create index project_agreements_project_company_owner_idx
  on public.project_agreements (project_id, company_id, owner_user_id);

create index project_agreements_initial_invoice_idx
  on public.project_agreements (initial_invoice_id)
  where initial_invoice_id is not null;

create index project_agreement_snapshots_agreement_identity_idx
  on public.project_agreement_snapshots (
    agreement_id,
    project_id,
    company_id,
    owner_user_id
  );

commit;
