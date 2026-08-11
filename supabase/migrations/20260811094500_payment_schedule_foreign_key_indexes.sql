begin;

create index payment_schedules_project_company_owner_idx
  on public.payment_schedules (project_id, company_id, owner_user_id);

create index payment_schedule_stages_schedule_project_company_owner_idx
  on public.payment_schedule_stages (
    schedule_id,
    project_id,
    company_id,
    owner_user_id
  );

commit;
