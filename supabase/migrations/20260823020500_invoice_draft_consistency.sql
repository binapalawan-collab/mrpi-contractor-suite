begin;

-- Keep one meaningful editable invoice draft per project. Historical issued,
-- paid and void invoices remain untouched. Delete draft line items first because
-- their guard trigger validates the still-existing parent invoice.
do $$
declare
  duplicate_row record;
  original_claims text := current_setting('request.jwt.claims', true);
begin
  for duplicate_row in
    select ranked.id, ranked.owner_user_id
    from (
      select
        invoice.id,
        invoice.owner_user_id,
        row_number() over (
          partition by invoice.project_id, invoice.company_id, invoice.owner_user_id
          order by
            (invoice.total_amount > 0) desc,
            invoice.updated_at desc,
            invoice.id desc
        ) as draft_rank
      from public.invoices as invoice
      where invoice.status = 'draft'
    ) as ranked
    where ranked.draft_rank > 1
  loop
    perform set_config(
      'request.jwt.claims',
      jsonb_build_object(
        'sub', duplicate_row.owner_user_id::text,
        'role', 'authenticated'
      )::text,
      true
    );

    delete from public.invoice_items as item
    where item.invoice_id = duplicate_row.id
      and item.owner_user_id = duplicate_row.owner_user_id;

    delete from public.invoices as invoice
    where invoice.id = duplicate_row.id
      and invoice.owner_user_id = duplicate_row.owner_user_id
      and invoice.status = 'draft';
  end loop;

  perform set_config(
    'request.jwt.claims',
    coalesce(nullif(original_claims, ''), '{}'),
    true
  );
end;
$$;

create unique index if not exists invoices_one_active_draft_per_project_idx
  on public.invoices (project_id, company_id, owner_user_id)
  where status = 'draft';

-- Creating a new invoice is idempotent while a project already has a draft.
-- Repeated taps or opening the action from another tab returns the same draft.
create or replace function public.create_project_invoice(p_project_id bigint)
returns public.invoices
language plpgsql
security invoker
set search_path = ''
as $$
declare
  invoice_row public.invoices;
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'Sesi pengguna tidak sah.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      current_user_id::text || ':invoice-draft:' || p_project_id::text,
      0
    )
  );

  select invoice.*
  into invoice_row
  from public.invoices as invoice
  where invoice.project_id = p_project_id
    and invoice.owner_user_id = current_user_id
    and invoice.status = 'draft'
  order by invoice.updated_at desc, invoice.id desc
  limit 1;

  if found then
    return invoice_row;
  end if;

  insert into public.invoices (project_id)
  values (p_project_id)
  returning * into invoice_row;

  return invoice_row;
end;
$$;

revoke execute on function public.create_project_invoice(bigint)
  from public, anon;
grant execute on function public.create_project_invoice(bigint)
  to authenticated;

-- Generated columns such as balance_amount are not stable in a BEFORE UPDATE
-- trigger record. Exclude balance_amount when validating a draft/issued invoice
-- transition to void, matching the existing generated-balance hardening.
do $$
declare
  function_definition text;
  old_fragment text := E'    old_locked := to_jsonb(old) - array[''status'', ''voided_at'', ''updated_at''];\n    new_locked := to_jsonb(new) - array[''status'', ''voided_at'', ''updated_at''];';
  new_fragment text := E'    old_locked := to_jsonb(old) - array[''status'', ''balance_amount'', ''voided_at'', ''updated_at''];\n    new_locked := to_jsonb(new) - array[''status'', ''balance_amount'', ''voided_at'', ''updated_at''];';
begin
  function_definition := pg_get_functiondef(
    'private.guard_invoice_update()'::regprocedure
  );

  if function_definition like '%' || new_fragment || '%' then
    null;
  elsif function_definition like '%' || old_fragment || '%' then
    execute replace(function_definition, old_fragment, new_fragment);
  else
    raise exception 'Struktur guard batal invois tidak sepadan dengan migration consistency.';
  end if;
end;
$$;

revoke execute on function private.guard_invoice_update()
  from public, anon, authenticated, service_role;

commit;
