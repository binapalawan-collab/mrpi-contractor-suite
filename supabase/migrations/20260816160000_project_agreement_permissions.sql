begin;

grant insert, update on table public.project_agreements to authenticated;
grant insert on table public.project_agreement_snapshots to authenticated;
grant usage, select on sequence public.project_agreements_id_seq to authenticated;
grant usage, select on sequence public.project_agreement_snapshots_id_seq to authenticated;

create policy project_agreements_insert_own
on public.project_agreements for insert to authenticated
with check (
  (select auth.uid()) = owner_user_id
  and status = 'draft'
  and revision_no = 0
  and issued_at is null
  and accepted_at is null
  and acceptance_method is null
  and initial_invoice_id is null
);

create policy project_agreements_update_own
on public.project_agreements for update to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy project_agreement_snapshots_insert_own
on public.project_agreement_snapshots for insert to authenticated
with check (
  (select auth.uid()) = owner_user_id
  and exists (
    select 1
    from public.project_agreements as agreement
    where agreement.id = agreement_id
      and agreement.project_id = project_id
      and agreement.company_id = company_id
      and agreement.owner_user_id = owner_user_id
      and agreement.owner_user_id = (select auth.uid())
  )
);

commit;
