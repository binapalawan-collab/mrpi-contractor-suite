begin;

create or replace function private.prepare_invoice_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  project_row public.projects;
  target_invoice_year integer;
  invoice_sequence integer;
begin
  if current_user_id is null then
    raise exception 'Sesi pengguna tidak sah.';
  end if;

  select project.*
  into project_row
  from public.projects as project
  where project.id = new.project_id
    and project.owner_user_id = current_user_id;

  if not found then
    raise exception 'Projek tidak ditemui atau bukan milik pengguna ini.';
  end if;

  if coalesce(new.status, 'draft') <> 'draft' then
    raise exception 'Invois baharu mesti bermula sebagai draf.';
  end if;

  new.company_id := project_row.company_id;
  new.owner_user_id := current_user_id;
  new.invoice_date := coalesce(new.invoice_date, current_date);
  target_invoice_year := extract(year from new.invoice_date)::integer;

  insert into private.invoice_number_counters (
    company_id,
    invoice_year,
    last_sequence
  )
  values (project_row.company_id, target_invoice_year, 1)
  on conflict (company_id, invoice_year)
  do update set last_sequence = private.invoice_number_counters.last_sequence + 1
  returning last_sequence into invoice_sequence;

  new.invoice_no := format(
    'INV-%s-%s',
    target_invoice_year,
    lpad(invoice_sequence::text, 3, '0')
  );
  new.title := coalesce(
    nullif(btrim(new.title), ''),
    'TUNTUTAN BAYARAN KEMAJUAN'
  );
  new.notes := coalesce(new.notes, '');
  new.status := 'draft';
  new.total_amount := 0;
  new.paid_amount := 0;
  new.contract_value_snapshot := null;
  new.previous_billed_amount_snapshot := null;
  new.contract_balance_after_snapshot := null;
  new.issued_at := null;
  new.fully_paid_at := null;
  new.voided_at := null;
  new.created_at := now();
  new.updated_at := now();

  return new;
end;
$$;

revoke execute on function private.prepare_invoice_insert()
  from public, anon, authenticated, service_role;

create or replace function private.prepare_invoice_payment_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  invoice_row public.invoices;
  paid_before numeric(14, 2);
  target_receipt_year integer;
  receipt_sequence integer;
begin
  if current_user_id is null then
    raise exception 'Sesi pengguna tidak sah.';
  end if;

  select invoice.*
  into invoice_row
  from public.invoices as invoice
  where invoice.id = new.invoice_id
    and invoice.owner_user_id = current_user_id
  for update;

  if not found then
    raise exception 'Invois tidak ditemui atau bukan milik pengguna ini.';
  end if;
  if invoice_row.status not in ('issued', 'partially_paid') then
    raise exception 'Bayaran hanya boleh direkod pada invois yang masih berbaki.';
  end if;
  if new.amount is null or new.amount <= 0 then
    raise exception 'Jumlah bayaran mesti lebih besar daripada sifar.';
  end if;

  select coalesce(sum(payment.amount), 0)
  into paid_before
  from public.invoice_payments as payment
  where payment.invoice_id = invoice_row.id
    and payment.company_id = invoice_row.company_id
    and payment.owner_user_id = invoice_row.owner_user_id;

  if round(paid_before + new.amount, 2) > invoice_row.total_amount then
    raise exception 'Bayaran melebihi baki invois sebanyak RM %.',
      to_char(
        round(paid_before + new.amount - invoice_row.total_amount, 2),
        'FM999999999990.00'
      );
  end if;

  new.project_id := invoice_row.project_id;
  new.company_id := invoice_row.company_id;
  new.owner_user_id := invoice_row.owner_user_id;
  new.payment_date := coalesce(new.payment_date, current_date);
  new.reference_no := nullif(btrim(new.reference_no), '');
  new.notes := coalesce(new.notes, '');
  new.invoice_total_snapshot := invoice_row.total_amount;
  new.paid_before_snapshot := paid_before;
  new.paid_after_snapshot := round(paid_before + new.amount, 2);
  new.balance_after_snapshot := round(
    invoice_row.total_amount - paid_before - new.amount,
    2
  );
  new.created_at := now();

  target_receipt_year := extract(year from new.payment_date)::integer;
  insert into private.receipt_number_counters (
    company_id,
    receipt_year,
    last_sequence
  )
  values (invoice_row.company_id, target_receipt_year, 1)
  on conflict (company_id, receipt_year)
  do update set last_sequence = private.receipt_number_counters.last_sequence + 1
  returning last_sequence into receipt_sequence;

  new.receipt_no := format(
    'RCP-%s-%s',
    target_receipt_year,
    lpad(receipt_sequence::text, 3, '0')
  );
  return new;
end;
$$;

revoke execute on function private.prepare_invoice_payment_insert()
  from public, anon, authenticated, service_role;

commit;
