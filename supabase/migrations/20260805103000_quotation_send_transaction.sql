begin;

create or replace function public.send_quotation_revision(
  p_quotation_id bigint,
  p_revision_no integer,
  p_snapshot_data jsonb
)
returns public.quotations
language plpgsql
security invoker
set search_path = ''
as $$
declare
  quotation_row public.quotations;
begin
  if jsonb_typeof(p_snapshot_data) is distinct from 'object' then
    raise exception 'Snapshot sebutharga mesti berbentuk objek.';
  end if;

  select quotation.*
  into quotation_row
  from public.quotations as quotation
  where quotation.id = p_quotation_id
    and quotation.owner_user_id = (select auth.uid())
  for update;

  if not found then
    raise exception 'Sebutharga tidak ditemui.';
  end if;
  if quotation_row.status <> 'draft' then
    raise exception 'Hanya draf boleh ditandakan sebagai dihantar.';
  end if;
  if quotation_row.revision_no <> p_revision_no then
    raise exception 'Nombor revision tidak sepadan.';
  end if;

  insert into public.quotation_snapshots (
    quotation_id,
    company_id,
    owner_user_id,
    revision_no,
    snapshot_data
  ) values (
    quotation_row.id,
    quotation_row.company_id,
    quotation_row.owner_user_id,
    quotation_row.revision_no,
    p_snapshot_data
  );

  update public.quotations
  set status = 'sent', sent_at = now()
  where id = quotation_row.id
  returning * into quotation_row;

  return quotation_row;
end;
$$;

revoke execute on function public.send_quotation_revision(bigint, integer, jsonb)
  from public, anon;
grant execute on function public.send_quotation_revision(bigint, integer, jsonb)
  to authenticated;

commit;
