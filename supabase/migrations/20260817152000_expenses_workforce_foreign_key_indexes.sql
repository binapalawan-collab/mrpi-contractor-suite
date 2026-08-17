begin;

create index expense_suppliers_company_owner_idx
  on public.expense_suppliers (company_id, owner_user_id);

create index workers_company_owner_idx
  on public.workers (company_id, owner_user_id);

create index worker_wage_payments_worker_owner_idx
  on public.worker_wage_payments (worker_id, company_id, owner_user_id);

create index worker_attendance_worker_owner_idx
  on public.worker_attendance (worker_id, company_id, owner_user_id);

create index worker_attendance_payment_owner_idx
  on public.worker_attendance (
    wage_payment_id,
    worker_id,
    project_id,
    company_id,
    owner_user_id
  )
  where wage_payment_id is not null;

create index worker_advances_worker_owner_idx
  on public.worker_advances (worker_id, company_id, owner_user_id);

create index worker_advances_project_owner_idx
  on public.worker_advances (project_id, company_id, owner_user_id);

create index worker_advances_payment_owner_idx
  on public.worker_advances (
    applied_wage_payment_id,
    worker_id,
    project_id,
    company_id,
    owner_user_id
  )
  where applied_wage_payment_id is not null;

create index project_expenses_worker_wage_owner_idx
  on public.project_expenses (
    source_worker_wage_payment_id,
    project_id,
    company_id,
    owner_user_id
  )
  where source_worker_wage_payment_id is not null;

create index project_expenses_worker_advance_owner_idx
  on public.project_expenses (
    source_worker_advance_id,
    project_id,
    company_id,
    owner_user_id
  )
  where source_worker_advance_id is not null;

commit;
