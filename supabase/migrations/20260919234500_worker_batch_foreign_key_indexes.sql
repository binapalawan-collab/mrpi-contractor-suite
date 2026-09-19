create index if not exists worker_advances_batch_identity_idx
  on public.worker_advances (applied_wage_batch_id, company_id, owner_user_id)
  where applied_wage_batch_id is not null;

create index if not exists worker_wage_payments_batch_identity_idx
  on public.worker_wage_payments (wage_batch_id, company_id, owner_user_id)
  where wage_batch_id is not null;

create index if not exists worker_wage_payment_batches_head_identity_idx
  on public.worker_wage_payment_batches (head_worker_id, company_id, owner_user_id);

create index if not exists worker_wage_payment_batches_project_identity_idx
  on public.worker_wage_payment_batches (project_id, company_id, owner_user_id);
