begin;

drop index if exists public.worker_wage_payment_allocations_attendance_idx;

create index worker_wage_payment_allocations_attendance_identity_idx
  on public.worker_wage_payment_allocations (
    attendance_id,
    worker_id,
    project_id,
    company_id,
    owner_user_id
  );

create index worker_wage_payment_allocations_payment_identity_idx
  on public.worker_wage_payment_allocations (
    wage_payment_id,
    worker_id,
    project_id,
    company_id,
    owner_user_id
  );

commit;
