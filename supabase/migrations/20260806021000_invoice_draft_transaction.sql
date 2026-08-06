begin;

-- Save the complete editable invoice in one transaction. A phone may suspend
-- the browser during an app switch, so the server must never retain a header
-- from one save and line items from another.
create or replace function public.save_project_invoice_draft(
  p_invoice_id bigint,
  p_invoice_date date,
  p_due_date date,
  p_title text,
  p_notes text,
  p_items jsonb
)
returns public.invoices
language plpgsql
security invoker
set search_path = ''
as $$
declare
  invoice_row public.invoices;
begin
  if (select auth.uid()) is null then
    raise exception 'Sesi pengguna tidak sah.';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'Senarai tuntutan invois tidak sah.';
  end if;

  update public.invoices as invoice
  set invoice_date = p_invoice_date,
      due_date = p_due_date,
      title = p_title,
      notes = coalesce(p_notes, '')
  where invoice.id = p_invoice_id
    and invoice.owner_user_id = (select auth.uid())
    and invoice.status = 'draft'
  returning invoice.* into invoice_row;

  if not found then
    raise exception 'Draf invois tidak ditemui atau telah dikeluarkan.';
  end if;

  delete from public.invoice_items as item
  where item.invoice_id = invoice_row.id
    and item.owner_user_id = (select auth.uid());

  insert into public.invoice_items (
    invoice_id,
    variation_order_id,
    source_type,
    description,
    percentage,
    amount,
    sort_order
  )
  select
    invoice_row.id,
    item.variation_order_id,
    item.source_type,
    item.description,
    item.percentage,
    item.amount,
    item.sort_order
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as item(
    variation_order_id bigint,
    source_type text,
    description text,
    percentage numeric,
    amount numeric,
    sort_order integer
  );

  select invoice.*
  into invoice_row
  from public.invoices as invoice
  where invoice.id = p_invoice_id
    and invoice.owner_user_id = (select auth.uid());

  return invoice_row;
end;
$$;

revoke execute on function public.save_project_invoice_draft(
  bigint,
  date,
  date,
  text,
  text,
  jsonb
) from public, anon;
grant execute on function public.save_project_invoice_draft(
  bigint,
  date,
  date,
  text,
  text,
  jsonb
) to authenticated;

commit;
