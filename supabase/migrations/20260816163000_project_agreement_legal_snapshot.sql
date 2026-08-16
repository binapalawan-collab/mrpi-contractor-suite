begin;

create or replace function private.guard_project_agreement_snapshot()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  company_row public.companies;
  project_contract numeric;
  schedule_basis numeric;
  schedule_percentage numeric;
  schedule_amount numeric;
  scope_item_count integer;
begin
  select company.* into company_row
  from public.companies as company
  where company.id = new.company_id
    and company.owner_user_id = new.owner_user_id;

  if not found then
    raise exception 'Profil syarikat untuk snapshot perjanjian tidak ditemui.';
  end if;

  new.snapshot_data := new.snapshot_data || jsonb_build_object(
    'document', jsonb_build_object(
      'template_version', 'MRPI-RSP-2026.1',
      'governing_law', 'Malaysia'
    )
  );

  new.snapshot_data := jsonb_set(
    new.snapshot_data,
    '{company}',
    (new.snapshot_data -> 'company') || jsonb_build_object(
      'email', company_row.email,
      'cidb_registration_no', company_row.cidb_registration_no,
      'cidb_grade', company_row.cidb_grade,
      'cidb_expiry_date', company_row.cidb_expiry_date
    ),
    false
  );

  project_contract := (new.snapshot_data #>> '{project,current_contract_amount}')::numeric;
  schedule_basis := (new.snapshot_data #>> '{payment_schedule,basis_amount}')::numeric;

  select
    coalesce(sum((stage.value ->> 'percentage')::numeric), 0),
    coalesce(sum((stage.value ->> 'amount')::numeric), 0)
  into schedule_percentage, schedule_amount
  from jsonb_array_elements(new.snapshot_data #> '{payment_schedule,stages}') as stage(value);

  select count(*)
  into scope_item_count
  from jsonb_array_elements(new.snapshot_data -> 'scope') as section(value)
  cross join lateral jsonb_array_elements(section.value -> 'items') as item(value);

  if project_contract is null or schedule_basis is null
    or round(project_contract, 2) <> round(schedule_basis, 2) then
    raise exception 'Jadual Pembayaran mesti disimpan semula berdasarkan nilai kontrak semasa sebelum perjanjian dikeluarkan.';
  end if;

  if round(schedule_percentage, 3) <> 100 then
    raise exception 'Jumlah Jadual Pembayaran mesti tepat 100%%.';
  end if;

  if round(schedule_amount, 2) <> round(schedule_basis, 2) then
    raise exception 'Jumlah amaun setiap tahap mesti sama dengan Harga Kontrak.';
  end if;

  if scope_item_count = 0 then
    raise exception 'Sekurang-kurangnya satu item skop kerja diperlukan sebelum perjanjian dikeluarkan.';
  end if;

  if length(btrim(coalesce(new.snapshot_data #>> '{agreement,work_duration_text}', ''))) = 0 then
    raise exception 'Tempoh kerja atau sasaran mesti dinyatakan sebelum perjanjian dikeluarkan.';
  end if;

  if length(btrim(coalesce(new.snapshot_data #>> '{agreement,defect_terms}', ''))) = 0 then
    raise exception 'Tempoh dan syarat kecacatan atau waranti mesti dinyatakan sebelum perjanjian dikeluarkan.';
  end if;

  if new.snapshot_data #>> '{document,template_version}' <> 'MRPI-RSP-2026.1' then
    raise exception 'Versi templat perjanjian tidak sah.';
  end if;

  return new;
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
  set status = 'draft',
      revision_no = revision_no + 1,
      issued_at = null,
      signed_copy_path = null,
      updated_at = now()
  where agreement.id = p_agreement_id
    and agreement.owner_user_id = (select auth.uid())
    and agreement.status = 'issued'
  returning * into agreement_row;

  if not found then
    raise exception 'Hanya perjanjian yang telah dikeluarkan boleh direvisi.';
  end if;

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

  if length(btrim(coalesce(p_acceptance_note, ''))) = 0 then
    raise exception 'Catatan bukti mesti menyatakan nama, tarikh dan rujukan penerimaan.';
  end if;

  update public.project_agreements as agreement
  set status = 'accepted',
      acceptance_method = p_acceptance_method,
      acceptance_note = btrim(p_acceptance_note),
      accepted_at = now(),
      updated_at = now()
  where agreement.id = p_agreement_id
    and agreement.owner_user_id = (select auth.uid())
    and agreement.status = 'issued'
    and (
      p_acceptance_method = 'physical'
      or agreement.signed_copy_path is not null
    )
  returning * into agreement_row;

  if not found then
    raise exception 'Perjanjian tidak boleh diterima. Untuk WhatsApp atau salinan dimuat naik, lampirkan bukti bagi revisi semasa terlebih dahulu.';
  end if;

  return agreement_row;
end;
$$;

revoke execute on function private.guard_project_agreement_snapshot()
  from public, anon, authenticated, service_role;

revoke execute on function public.start_project_agreement_revision(bigint) from public, anon;
revoke execute on function public.accept_project_agreement(bigint, text, text) from public, anon;
grant execute on function public.start_project_agreement_revision(bigint) to authenticated;
grant execute on function public.accept_project_agreement(bigint, text, text) to authenticated;

comment on function private.guard_project_agreement_snapshot()
is 'Validates legal agreement particulars and freezes the template version plus contractor compliance details into each new snapshot.';

commit;
