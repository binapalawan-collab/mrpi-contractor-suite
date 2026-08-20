begin;

-- A manual expense may be corrected to another project in the same company.
-- Cascading the composite identity keeps its items, payments and attachments
-- attached to the same expense without a delete-and-recreate operation.
alter table public.project_expense_items
  drop constraint project_expense_items_expense_fkey,
  add constraint project_expense_items_expense_fkey
    foreign key (expense_id, project_id, company_id, owner_user_id)
    references public.project_expenses (id, project_id, company_id, owner_user_id)
    on update cascade
    on delete cascade;

alter table public.project_expense_payments
  drop constraint project_expense_payments_expense_fkey,
  add constraint project_expense_payments_expense_fkey
    foreign key (expense_id, project_id, company_id, owner_user_id)
    references public.project_expenses (id, project_id, company_id, owner_user_id)
    on update cascade
    on delete cascade;

alter table public.project_expense_attachments
  drop constraint project_expense_attachments_expense_fkey,
  add constraint project_expense_attachments_expense_fkey
    foreign key (expense_id, project_id, company_id, owner_user_id)
    references public.project_expenses (id, project_id, company_id, owner_user_id)
    on update cascade
    on delete cascade;

create or replace function private.guard_project_expense_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  correction_allowed boolean :=
    coalesce(current_setting('app.expense_correction', true), '') = 'on';
begin
  if (new.company_id, new.owner_user_id, new.source_type,
      new.source_worker_wage_payment_id, new.source_worker_advance_id)
    is distinct from
     (old.company_id, old.owner_user_id, old.source_type,
      old.source_worker_wage_payment_id, old.source_worker_advance_id) then
    raise exception 'Sumber dan pemilikan expenses tidak boleh diubah.';
  end if;

  if new.project_id is distinct from old.project_id
    and (not correction_allowed or old.source_type <> 'manual') then
    raise exception 'Projek hanya boleh dibetulkan untuk expenses manual.';
  end if;

  if pg_trigger_depth() = 1
    and not correction_allowed
    and (new.total_amount, new.paid_amount, new.status)
      is distinct from (old.total_amount, old.paid_amount, old.status) then
    raise exception 'Amaun dan status expenses dikawal oleh transaksi sistem.';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- A cascading project identity update does not change the payment amount.
-- Skip the total refresh in that case so it does not update the parent row
-- while the parent project update is still in progress.
create or replace function private.refresh_project_expense_payment_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_expense_id bigint := coalesce(new.expense_id, old.expense_id);
  payment_total numeric(14, 2);
  expense_total numeric(14, 2);
begin
  if tg_op = 'UPDATE'
    and (new.expense_id, new.amount) is not distinct from (old.expense_id, old.amount) then
    return new;
  end if;

  select expense.total_amount into expense_total
  from public.project_expenses as expense
  where expense.id = target_expense_id
  for update;

  select coalesce(sum(payment.amount), 0) into payment_total
  from public.project_expense_payments as payment
  where payment.expense_id = target_expense_id;

  if payment_total > expense_total then
    raise exception 'Jumlah bayaran melebihi jumlah expenses.';
  end if;

  update public.project_expenses
  set paid_amount = payment_total,
      status = case
        when payment_total = 0 then 'unpaid'
        when payment_total = expense_total then 'paid'
        else 'partially_paid'
      end,
      updated_at = now()
  where id = target_expense_id;

  return coalesce(new, old);
end;
$$;

-- Keep the original seven-argument RPC for the previous deployed client.
-- The new overload adds the target project and delegates all existing field,
-- item and paid-amount validation to the established correction RPC.
create or replace function public.correct_manual_project_expense(
  p_expense_id bigint,
  p_project_id bigint,
  p_expense_date date,
  p_category text,
  p_description text,
  p_supplier_id bigint,
  p_notes text,
  p_items jsonb
)
returns public.project_expenses
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  expense_row public.project_expenses;
begin
  if current_user_id is null then
    raise exception 'Sesi pengguna tidak sah.';
  end if;

  select expense.* into expense_row
  from public.project_expenses as expense
  where expense.id = p_expense_id
    and expense.owner_user_id = current_user_id
  for update;

  if not found then
    raise exception 'Expenses tidak ditemui.';
  end if;
  if expense_row.source_type <> 'manual' then
    raise exception 'Rekod daripada Workforce mesti dibetulkan dalam aplikasi Workforce.';
  end if;
  if not exists (
    select 1
    from public.projects as project
    where project.id = p_project_id
      and project.company_id = expense_row.company_id
      and project.owner_user_id = current_user_id
  ) then
    raise exception 'Projek tidak ditemui atau tidak sepadan dengan syarikat.';
  end if;

  select corrected.* into expense_row
  from public.correct_manual_project_expense(
    p_expense_id,
    p_expense_date,
    p_category,
    p_description,
    p_supplier_id,
    p_notes,
    p_items
  ) as corrected;

  perform set_config('app.expense_correction', 'on', true);
  update public.project_expenses
  set project_id = p_project_id,
      updated_at = now()
  where id = expense_row.id
    and owner_user_id = current_user_id
  returning * into expense_row;

  return expense_row;
end;
$$;

revoke execute on function public.correct_manual_project_expense(
  bigint, bigint, date, text, text, bigint, text, jsonb
) from public, anon;

grant execute on function public.correct_manual_project_expense(
  bigint, bigint, date, text, text, bigint, text, jsonb
) to authenticated;

comment on function public.correct_manual_project_expense(
  bigint, bigint, date, text, text, bigint, text, jsonb
) is 'Corrects and safely moves an owner-scoped manual expense, including its items, payments and attachments, to another project in the same company.';

commit;
