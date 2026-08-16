begin;

create table public.project_agreements (
  id bigint generated always as identity primary key,
  project_id bigint not null,
  company_id bigint not null,
  owner_user_id uuid not null,
  agreement_no text not null,
  revision_no integer not null default 0,
  issue_date date not null default current_date,
  title text not null default 'PERJANJIAN KERJA UBAH SUAI',
  status text not null default 'draft',
  work_duration_text text not null default '',
  client_supplied_items text not null default '',
  exclusions text not null default '',
  defect_terms text not null default '',
  additional_terms text not null default '',
  acceptance_method text,
  acceptance_note text,
  signed_copy_path text,
  initial_invoice_id bigint,
  issued_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint project_agreements_project_company_owner_fkey
    foreign key (project_id, company_id, owner_user_id)
    references public.projects (id, company_id, owner_user_id)
    on delete cascade,
  constraint project_agreements_invoice_fkey
    foreign key (initial_invoice_id)
    references public.invoices (id)
    on delete restrict,
  constraint project_agreements_identity_key
    unique (id, project_id, company_id, owner_user_id),
  constraint project_agreements_project_key unique (project_id),
  constraint project_agreements_number_key unique (company_id, agreement_no),
  constraint project_agreements_number_format
    check (agreement_no ~ '^AGR-[0-9]{4}-[0-9]{3,}$'),
  constraint project_agreements_revision_nonnegative check (revision_no >= 0),
  constraint project_agreements_title_not_blank check (length(btrim(title)) > 0),
  constraint project_agreements_status_valid
    check (status in ('draft', 'issued', 'accepted')),
  constraint project_agreements_acceptance_method_valid
    check (acceptance_method is null or acceptance_method in ('whatsapp', 'physical', 'uploaded')),
  constraint project_agreements_text_lengths check (
    length(title) <= 200
    and length(work_duration_text) <= 2000
    and length(client_supplied_items) <= 5000
    and length(exclusions) <= 5000
    and length(defect_terms) <= 5000
    and length(additional_terms) <= 10000
    and (acceptance_note is null or length(acceptance_note) <= 2000)
  ),
  constraint project_agreements_status_timestamps_valid check (
    (status = 'draft' and issued_at is null and accepted_at is null and acceptance_method is null)
    or (status = 'issued' and issued_at is not null and accepted_at is null and acceptance_method is null)
    or (status = 'accepted' and issued_at is not null and accepted_at is not null and acceptance_method is not null)
  )
);

create table public.project_agreement_snapshots (
  id bigint generated always as identity primary key,
  agreement_id bigint not null,
  project_id bigint not null,
  company_id bigint not null,
  owner_user_id uuid not null,
  revision_no integer not null,
  snapshot_data jsonb not null,
  created_at timestamptz not null default now(),

  constraint project_agreement_snapshots_agreement_fkey
    foreign key (agreement_id, project_id, company_id, owner_user_id)
    references public.project_agreements (id, project_id, company_id, owner_user_id)
    on delete cascade,
  constraint project_agreement_snapshots_revision_key unique (agreement_id, revision_no),
  constraint project_agreement_snapshots_data_object check (jsonb_typeof(snapshot_data) = 'object')
);

create index project_agreements_owner_status_idx
  on public.project_agreements (owner_user_id, status, project_id);
create index project_agreement_snapshots_project_owner_idx
  on public.project_agreement_snapshots (project_id, owner_user_id, revision_no desc);

alter table public.project_agreements enable row level security;
alter table public.project_agreement_snapshots enable row level security;

revoke all on table public.project_agreements from anon, authenticated;
revoke all on table public.project_agreement_snapshots from anon, authenticated;
revoke all on sequence public.project_agreements_id_seq from anon, authenticated;
revoke all on sequence public.project_agreement_snapshots_id_seq from anon, authenticated;

grant select on table public.project_agreements to authenticated;
grant select on table public.project_agreement_snapshots to authenticated;

create policy project_agreements_select_own
on public.project_agreements for select to authenticated
using ((select auth.uid()) = owner_user_id);

create policy project_agreement_snapshots_select_own
on public.project_agreement_snapshots for select to authenticated
using ((select auth.uid()) = owner_user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-documents',
  'project-documents',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy project_documents_select_own
on storage.objects for select to authenticated
using (bucket_id = 'project-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy project_documents_insert_own
on storage.objects for insert to authenticated
with check (bucket_id = 'project-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy project_documents_delete_own
on storage.objects for delete to authenticated
using (bucket_id = 'project-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

create or replace function public.save_project_agreement_draft(
  p_project_id bigint,
  p_issue_date date,
  p_title text,
  p_work_duration_text text,
  p_client_supplied_items text,
  p_exclusions text,
  p_defect_terms text,
  p_additional_terms text
)
returns public.project_agreements
language plpgsql
security invoker
set search_path = ''
as $$
declare
  project_row public.projects;
  agreement_row public.project_agreements;
begin
  if (select auth.uid()) is null then raise exception 'Sesi pengguna tidak sah.'; end if;

  select project.* into project_row
  from public.projects as project
  where project.id = p_project_id and project.owner_user_id = (select auth.uid());
  if not found then raise exception 'Projek tidak ditemui.'; end if;

  insert into public.project_agreements (
    project_id, company_id, owner_user_id, agreement_no, issue_date, title,
    work_duration_text, client_supplied_items, exclusions, defect_terms, additional_terms
  ) values (
    project_row.id, project_row.company_id, project_row.owner_user_id,
    replace(project_row.project_no, 'PRJ-', 'AGR-'), coalesce(p_issue_date, current_date), p_title,
    coalesce(p_work_duration_text, ''), coalesce(p_client_supplied_items, ''),
    coalesce(p_exclusions, ''), coalesce(p_defect_terms, ''), coalesce(p_additional_terms, '')
  )
  on conflict (project_id) do update set
    issue_date = excluded.issue_date,
    title = excluded.title,
    work_duration_text = excluded.work_duration_text,
    client_supplied_items = excluded.client_supplied_items,
    exclusions = excluded.exclusions,
    defect_terms = excluded.defect_terms,
    additional_terms = excluded.additional_terms,
    updated_at = now()
  where project_agreements.owner_user_id = (select auth.uid())
    and project_agreements.status = 'draft'
  returning * into agreement_row;

  if agreement_row.id is null then
    raise exception 'Perjanjian ini telah dikeluarkan. Mulakan revisi sebelum membuat perubahan.';
  end if;
  return agreement_row;
end;
$$;

create or replace function public.issue_project_agreement(p_agreement_id bigint)
returns public.project_agreements
language plpgsql
security invoker
set search_path = ''
as $$
declare
  agreement_row public.project_agreements;
  snapshot jsonb;
begin
  select agreement.* into agreement_row
  from public.project_agreements as agreement
  where agreement.id = p_agreement_id
    and agreement.owner_user_id = (select auth.uid())
    and agreement.status = 'draft'
  for update;
  if not found then raise exception 'Draf perjanjian tidak ditemui.'; end if;

  if not exists (
    select 1 from public.payment_schedule_stages as stage
    where stage.project_id = agreement_row.project_id
      and stage.owner_user_id = agreement_row.owner_user_id
      and stage.amount > 0
  ) then
    raise exception 'Simpan Jadual Pembayaran sebelum mengeluarkan perjanjian.';
  end if;

  select jsonb_build_object(
    'agreement', jsonb_build_object(
      'agreement_no', agreement_row.agreement_no,
      'revision_no', agreement_row.revision_no,
      'issue_date', agreement_row.issue_date,
      'title', agreement_row.title,
      'work_duration_text', agreement_row.work_duration_text,
      'client_supplied_items', agreement_row.client_supplied_items,
      'exclusions', agreement_row.exclusions,
      'defect_terms', agreement_row.defect_terms,
      'additional_terms', agreement_row.additional_terms
    ),
    'company', jsonb_build_object(
      'legal_name', company.legal_name,
      'trading_name', company.trading_name,
      'registration_no', company.registration_no,
      'owner_name', company.owner_name,
      'phone', company.phone,
      'address_line_1', company.address_line_1,
      'address_line_2', company.address_line_2,
      'postcode', company.postcode,
      'city', company.city,
      'state', company.state,
      'signature_path', company.signature_path,
      'stamp_path', company.stamp_path
    ),
    'project', jsonb_build_object(
      'id', project.id,
      'project_no', project.project_no,
      'project_name', project.project_name,
      'quotation_no', project.quotation_no,
      'quotation_revision_no', project.quotation_revision_no,
      'client_name', project.client_name,
      'client_phone', project.client_phone,
      'client_email', project.client_email,
      'address_line_1', project.address_line_1,
      'address_line_2', project.address_line_2,
      'postcode', project.postcode,
      'city', project.city,
      'state', project.state,
      'contract_amount', project.contract_amount,
      'current_contract_amount', project.current_contract_amount,
      'planned_start_date', project.planned_start_date,
      'planned_end_date', project.planned_end_date
    ),
    'scope', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', section.name,
        'sort_order', section.sort_order,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'item_name', item.item_name,
            'description', item.description,
            'measurement_text', item.measurement_text,
            'unit', item.unit,
            'quantity', item.quantity,
            'amount', item.amount,
            'sort_order', item.sort_order
          ) order by item.sort_order, item.id)
          from public.project_items as item
          where item.section_id = section.id
        ), '[]'::jsonb)
      ) order by section.sort_order, section.id)
      from public.project_sections as section
      where section.project_id = project.id
    ), '[]'::jsonb),
    'payment_schedule', (
      select jsonb_build_object(
        'title', schedule.title,
        'notes', schedule.notes,
        'basis_amount', schedule.basis_amount,
        'stages', (
          select jsonb_agg(jsonb_build_object(
            'stage_no', stage.stage_no,
            'label', stage.label,
            'description', stage.description,
            'percentage', stage.percentage,
            'amount', stage.amount
          ) order by stage.stage_no)
          from public.payment_schedule_stages as stage
          where stage.schedule_id = schedule.id
        )
      )
      from public.payment_schedules as schedule
      where schedule.project_id = project.id
    )
  ) into snapshot
  from public.projects as project
  join public.companies as company on company.id = project.company_id
  where project.id = agreement_row.project_id
    and project.owner_user_id = (select auth.uid());

  insert into public.project_agreement_snapshots (
    agreement_id, project_id, company_id, owner_user_id, revision_no, snapshot_data
  ) values (
    agreement_row.id, agreement_row.project_id, agreement_row.company_id,
    agreement_row.owner_user_id, agreement_row.revision_no, snapshot
  );

  update public.project_agreements as agreement
  set status = 'issued', issued_at = now(), updated_at = now()
  where agreement.id = agreement_row.id
  returning * into agreement_row;
  return agreement_row;
end;
$$;

create or replace function public.start_project_agreement_revision(p_agreement_id bigint)
returns public.project_agreements
language plpgsql
security invoker
set search_path = ''
as $$
declare agreement_row public.project_agreements;
begin
  update public.project_agreements as agreement
  set status = 'draft', revision_no = revision_no + 1, issued_at = null, updated_at = now()
  where agreement.id = p_agreement_id
    and agreement.owner_user_id = (select auth.uid())
    and agreement.status = 'issued'
  returning * into agreement_row;
  if not found then raise exception 'Hanya perjanjian yang telah dikeluarkan boleh direvisi.'; end if;
  return agreement_row;
end;
$$;

create or replace function public.attach_project_agreement_signed_copy(
  p_agreement_id bigint,
  p_signed_copy_path text
)
returns public.project_agreements
language plpgsql
security invoker
set search_path = ''
as $$
declare agreement_row public.project_agreements;
begin
  if p_signed_copy_path is null
    or split_part(p_signed_copy_path, '/', 1) <> (select auth.uid())::text then
    raise exception 'Laluan salinan perjanjian tidak sah.';
  end if;
  update public.project_agreements as agreement
  set signed_copy_path = p_signed_copy_path, updated_at = now()
  where agreement.id = p_agreement_id
    and agreement.owner_user_id = (select auth.uid())
    and agreement.status in ('issued', 'accepted')
  returning * into agreement_row;
  if not found then raise exception 'Perjanjian mesti dikeluarkan sebelum salinan dimuat naik.'; end if;
  return agreement_row;
end;
$$;

create or replace function public.accept_project_agreement(
  p_agreement_id bigint,
  p_acceptance_method text,
  p_acceptance_note text
)
returns public.project_agreements
language plpgsql
security invoker
set search_path = ''
as $$
declare agreement_row public.project_agreements;
begin
  if p_acceptance_method not in ('whatsapp', 'physical', 'uploaded') then
    raise exception 'Kaedah penerimaan tidak sah.';
  end if;
  update public.project_agreements as agreement
  set status = 'accepted',
      acceptance_method = p_acceptance_method,
      acceptance_note = nullif(btrim(coalesce(p_acceptance_note, '')), ''),
      accepted_at = now(),
      updated_at = now()
  where agreement.id = p_agreement_id
    and agreement.owner_user_id = (select auth.uid())
    and agreement.status = 'issued'
    and (p_acceptance_method <> 'uploaded' or agreement.signed_copy_path is not null)
  returning * into agreement_row;
  if not found then
    raise exception 'Perjanjian tidak boleh diterima. Untuk kaedah muat naik, simpan salinan ditandatangani dahulu.';
  end if;
  return agreement_row;
end;
$$;

create or replace function public.create_agreement_initial_invoice(p_agreement_id bigint)
returns public.invoices
language plpgsql
security invoker
set search_path = ''
as $$
declare
  agreement_row public.project_agreements;
  first_stage jsonb;
  invoice_row public.invoices;
begin
  select agreement.* into agreement_row
  from public.project_agreements as agreement
  where agreement.id = p_agreement_id
    and agreement.owner_user_id = (select auth.uid())
    and agreement.status = 'accepted'
  for update;
  if not found then raise exception 'Perjanjian mesti diterima dahulu.'; end if;

  if agreement_row.initial_invoice_id is not null then
    select * into invoice_row from public.invoices where id = agreement_row.initial_invoice_id;
    return invoice_row;
  end if;

  select snapshot.snapshot_data #> '{payment_schedule,stages,0}' into first_stage
  from public.project_agreement_snapshots as snapshot
  where snapshot.agreement_id = agreement_row.id
    and snapshot.revision_no = agreement_row.revision_no;
  if first_stage is null or coalesce((first_stage ->> 'amount')::numeric, 0) <= 0 then
    raise exception 'Tahap bayaran pertama tidak sah.';
  end if;

  insert into public.invoices (project_id, title, notes)
  values (
    agreement_row.project_id,
    'INVOIS BAYARAN PERTAMA',
    'Dijana daripada ' || agreement_row.agreement_no || ' Rev ' || agreement_row.revision_no || '.'
  ) returning * into invoice_row;

  insert into public.invoice_items (
    invoice_id, source_type, description, percentage, amount, sort_order
  ) values (
    invoice_row.id,
    'progress',
    coalesce(first_stage ->> 'label', 'Bayaran pertama'),
    (first_stage ->> 'percentage')::numeric,
    (first_stage ->> 'amount')::numeric,
    0
  );

  select * into invoice_row from public.invoices where id = invoice_row.id;
  update public.project_agreements set initial_invoice_id = invoice_row.id, updated_at = now()
  where id = agreement_row.id;
  return invoice_row;
end;
$$;

create or replace function private.require_accepted_agreement_before_project_schedule()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = 'preparation' and new.status = 'scheduled'
    and not exists (
      select 1 from public.project_agreements as agreement
      where agreement.project_id = old.id
        and agreement.owner_user_id = old.owner_user_id
        and agreement.status = 'accepted'
    ) then
    raise exception 'Perjanjian projek mesti diterima sebelum projek dijadualkan.';
  end if;
  return new;
end;
$$;

create trigger projects_require_accepted_agreement
before update of status on public.projects
for each row execute function private.require_accepted_agreement_before_project_schedule();

revoke execute on function public.save_project_agreement_draft(bigint, date, text, text, text, text, text, text) from public, anon;
revoke execute on function public.issue_project_agreement(bigint) from public, anon;
revoke execute on function public.start_project_agreement_revision(bigint) from public, anon;
revoke execute on function public.attach_project_agreement_signed_copy(bigint, text) from public, anon;
revoke execute on function public.accept_project_agreement(bigint, text, text) from public, anon;
revoke execute on function public.create_agreement_initial_invoice(bigint) from public, anon;
revoke execute on function private.require_accepted_agreement_before_project_schedule() from public, anon, authenticated, service_role;

grant execute on function public.save_project_agreement_draft(bigint, date, text, text, text, text, text, text) to authenticated;
grant execute on function public.issue_project_agreement(bigint) to authenticated;
grant execute on function public.start_project_agreement_revision(bigint) to authenticated;
grant execute on function public.attach_project_agreement_signed_copy(bigint, text) to authenticated;
grant execute on function public.accept_project_agreement(bigint, text, text) to authenticated;
grant execute on function public.create_agreement_initial_invoice(bigint) to authenticated;

comment on table public.project_agreements is 'One project agreement with explicit revisions, acceptance evidence and optional signed copy.';
comment on table public.project_agreement_snapshots is 'Immutable project, scope and payment schedule captured each time an agreement is issued.';

commit;
