begin;

create or replace function public.delete_unapplied_worker_advance(p_advance_id bigint)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  advance_row public.worker_advances;
  storage_paths text[] := array[]::text[];
begin
  if current_user_id is null then
    raise exception 'Sesi pengguna tidak sah.';
  end if;

  select advance.* into advance_row
  from public.worker_advances as advance
  where advance.id = p_advance_id
    and advance.owner_user_id = current_user_id
  for update;

  if not found then
    raise exception 'Rekod pinjaman tidak ditemui.';
  end if;

  if advance_row.applied_wage_payment_id is not null then
    raise exception 'Pinjaman ini sudah ditolak daripada bayaran upah. Batalkan bayaran upah berkaitan dahulu.';
  end if;

  select coalesce(array_agg(attachment.storage_path) filter (where attachment.storage_path is not null), array[]::text[])
  into storage_paths
  from public.project_expense_attachments as attachment
  join public.project_expenses as expense on expense.id = attachment.expense_id
  where expense.source_worker_advance_id = advance_row.id
    and expense.owner_user_id = current_user_id;

  delete from public.project_expenses as expense
  where expense.source_worker_advance_id = advance_row.id
    and expense.owner_user_id = current_user_id;

  delete from public.worker_advances as advance
  where advance.id = advance_row.id
    and advance.owner_user_id = current_user_id;

  return storage_paths;
end;
$$;

revoke all on function public.delete_unapplied_worker_advance(bigint) from public;
grant execute on function public.delete_unapplied_worker_advance(bigint) to authenticated;

commit;
