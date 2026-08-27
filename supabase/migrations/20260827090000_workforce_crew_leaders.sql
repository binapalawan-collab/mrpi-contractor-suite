begin;

alter table public.workers
  add column if not exists is_crew_leader boolean not null default false,
  add column if not exists crew_leader_id bigint;

alter table public.workers
  drop constraint if exists workers_crew_leader_not_self,
  add constraint workers_crew_leader_not_self
    check (crew_leader_id is null or crew_leader_id <> id),
  drop constraint if exists workers_leader_cannot_have_leader,
  add constraint workers_leader_cannot_have_leader
    check (not (is_crew_leader and crew_leader_id is not null));

alter table public.workers
  drop constraint if exists workers_crew_leader_fkey,
  add constraint workers_crew_leader_fkey
    foreign key (crew_leader_id, company_id, owner_user_id)
    references public.workers (id, company_id, owner_user_id)
    on delete restrict;

create index if not exists workers_crew_leader_idx
  on public.workers (crew_leader_id, is_active, name, id)
  where crew_leader_id is not null;

create or replace function private.validate_worker_crew_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  leader_row public.workers;
begin
  if new.crew_leader_id is not null then
    select worker.* into leader_row
    from public.workers as worker
    where worker.id = new.crew_leader_id
      and worker.company_id = new.company_id
      and worker.owner_user_id = new.owner_user_id;

    if not found then
      raise exception 'Kepala tukang tidak ditemui atau tidak sepadan dengan syarikat.';
    end if;
    if not leader_row.is_crew_leader then
      raise exception 'Pekerja yang dipilih belum ditanda sebagai Kepala Tukang.';
    end if;
    if new.is_crew_leader then
      raise exception 'Kepala Tukang tidak boleh berada di bawah Kepala Tukang lain.';
    end if;
  end if;

  if tg_op = 'UPDATE' and old.is_crew_leader and not new.is_crew_leader then
    if exists (
      select 1
      from public.workers as member
      where member.crew_leader_id = old.id
        and member.owner_user_id = old.owner_user_id
    ) then
      raise exception 'Alihkan pekerja bawahannya dahulu sebelum buang status Kepala Tukang.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists workers_validate_crew_assignment_trigger on public.workers;
create trigger workers_validate_crew_assignment_trigger
before insert or update of is_crew_leader, crew_leader_id, company_id, owner_user_id
on public.workers
for each row execute function private.validate_worker_crew_assignment();

create table if not exists public.worker_wage_payment_batches (
  id bigint generated always as identity primary key,
  head_worker_id bigint not null,
  project_id bigint not null,
  company_id bigint not null,
  owner_user_id uuid not null,
  period_start date not null,
  period_end date not null,
  payment_date date not null default current_date,
  payment_method text not null,
  total_gross numeric(14, 2) not null default 0,
  total_advance_deduction numeric(14, 2) not null default 0,
  total_net_amount numeric(14, 2) generated always as (round(total_gross - total_advance_deduction, 2)) stored,
  notes text not null default '',
  created_at timestamptz not null default now(),

  constraint worker_wage_payment_batches_head_fkey
    foreign key (head_worker_id, company_id, owner_user_id)
    references public.workers (id, company_id, owner_user_id)
    on delete restrict,
  constraint worker_wage_payment_batches_project_fkey
    foreign key (project_id, company_id, owner_user_id)
    references public.projects (id, company_id, owner_user_id)
    on delete restrict,
  constraint worker_wage_payment_batches_identity_key
    unique (id, company_id, owner_user_id),
  constraint worker_wage_payment_batches_period_valid
    check (period_end >= period_start),
  constraint worker_wage_payment_batches_method_valid
    check (payment_method in ('cash', 'bank_transfer', 'cheque', 'other')),
  constraint worker_wage_payment_batches_amounts_valid
    check (total_gross >= 0 and total_advance_deduction >= 0 and total_advance_deduction <= total_gross),
  constraint worker_wage_payment_batches_notes_length
    check (length(notes) <= 2000)
);

create index if not exists worker_wage_payment_batches_owner_date_idx
  on public.worker_wage_payment_batches (owner_user_id, payment_date desc, id desc);
create index if not exists worker_wage_payment_batches_head_date_idx
  on public.worker_wage_payment_batches (head_worker_id, payment_date desc, id desc);

alter table public.worker_wage_payment_batches enable row level security;
drop policy if exists worker_wage_payment_batches_select_own on public.worker_wage_payment_batches;
create policy worker_wage_payment_batches_select_own
  on public.worker_wage_payment_batches
  for select to authenticated
  using ((select auth.uid()) = owner_user_id);

alter table public.worker_wage_payments
  add column if not exists recipient_worker_id bigint,
  add column if not exists wage_batch_id bigint;

alter table public.worker_wage_payments
  drop constraint if exists worker_wage_payments_recipient_fkey,
  add constraint worker_wage_payments_recipient_fkey
    foreign key (recipient_worker_id, company_id, owner_user_id)
    references public.workers (id, company_id, owner_user_id)
    on delete restrict,
  drop constraint if exists worker_wage_payments_batch_fkey,
  add constraint worker_wage_payments_batch_fkey
    foreign key (wage_batch_id, company_id, owner_user_id)
    references public.worker_wage_payment_batches (id, company_id, owner_user_id)
    on delete restrict;

create index if not exists worker_wage_payments_recipient_date_idx
  on public.worker_wage_payments (recipient_worker_id, payment_date desc, id desc)
  where recipient_worker_id is not null;
create index if not exists worker_wage_payments_batch_idx
  on public.worker_wage_payments (wage_batch_id, id)
  where wage_batch_id is not null;

create or replace function public.record_worker_crew_wage_payment(
  p_head_worker_id bigint,
  p_project_id bigint,
  p_period_start date,
  p_period_end date,
  p_payment_date date,
  p_payment_method text,
  p_notes text
)
returns public.worker_wage_payment_batches
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  head_row public.workers;
  project_row public.projects;
  member_row public.workers;
  payment_row public.worker_wage_payments;
  batch_row public.worker_wage_payment_batches;
  outstanding_total numeric(14, 2);
  selected_advance_total numeric(14, 2);
  cash_total numeric(14, 2);
  selected_advance_ids bigint[];
  payment_count integer := 0;
  gross_sum numeric(14, 2) := 0;
  advance_sum numeric(14, 2) := 0;
  group_note text;
begin
  if current_user_id is null then raise exception 'Sesi pengguna tidak sah.'; end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception 'Tempoh bayaran kumpulan tidak sah.';
  end if;
  if p_payment_method not in ('cash', 'bank_transfer', 'cheque', 'other') then
    raise exception 'Kaedah bayaran tidak sah.';
  end if;

  select worker.* into head_row
  from public.workers as worker
  where worker.id = p_head_worker_id
    and worker.owner_user_id = current_user_id;
  if not found then raise exception 'Kepala tukang tidak ditemui.'; end if;
  if not head_row.is_crew_leader then raise exception 'Pekerja ini belum ditanda sebagai Kepala Tukang.'; end if;

  select project.* into project_row
  from public.projects as project
  where project.id = p_project_id
    and project.company_id = head_row.company_id
    and project.owner_user_id = current_user_id;
  if not found then raise exception 'Projek tidak ditemui.'; end if;

  insert into public.worker_wage_payment_batches (
    head_worker_id,
    project_id,
    company_id,
    owner_user_id,
    period_start,
    period_end,
    payment_date,
    payment_method,
    notes
  ) values (
    head_row.id,
    project_row.id,
    project_row.company_id,
    current_user_id,
    p_period_start,
    p_period_end,
    coalesce(p_payment_date, current_date),
    p_payment_method,
    coalesce(p_notes, '')
  ) returning * into batch_row;

  for member_row in
    select worker.*
    from public.workers as worker
    where worker.owner_user_id = current_user_id
      and worker.company_id = head_row.company_id
      and worker.pay_type = 'daily'
      and (worker.id = head_row.id or worker.crew_leader_id = head_row.id)
    order by case when worker.id = head_row.id then 0 else 1 end, worker.name, worker.id
  loop
    select coalesce(sum(attendance.wage_amount - attendance.paid_wage_amount), 0)
    into outstanding_total
    from public.worker_attendance as attendance
    where attendance.worker_id = member_row.id
      and attendance.project_id = project_row.id
      and attendance.owner_user_id = current_user_id
      and attendance.attendance_date between p_period_start and p_period_end
      and attendance.status in ('present', 'half_day')
      and attendance.paid_wage_amount < attendance.wage_amount;

    outstanding_total := round(coalesce(outstanding_total, 0), 2);
    if outstanding_total <= 0 then
      continue;
    end if;

    select
      coalesce(array_agg(candidate.id order by candidate.advance_date, candidate.id)
        filter (where candidate.running_total <= outstanding_total), '{}'::bigint[]),
      coalesce(sum(candidate.amount)
        filter (where candidate.running_total <= outstanding_total), 0)
    into selected_advance_ids, selected_advance_total
    from (
      select
        advance.id,
        advance.advance_date,
        advance.amount,
        sum(advance.amount) over (
          order by advance.advance_date, advance.id
          rows between unbounded preceding and current row
        ) as running_total
      from public.worker_advances as advance
      where advance.worker_id = member_row.id
        and advance.project_id = project_row.id
        and advance.owner_user_id = current_user_id
        and advance.applied_wage_payment_id is null
    ) as candidate;

    selected_advance_total := round(coalesce(selected_advance_total, 0), 2);
    cash_total := round(outstanding_total - selected_advance_total, 2);
    group_note := concat_ws(E'\n',
      nullif(coalesce(p_notes, ''), ''),
      'Bayaran kumpulan diterima melalui Kepala Tukang: ' || head_row.name
    );

    select * into payment_row
    from public.record_worker_wage_payment_partial(
      member_row.id,
      project_row.id,
      p_period_start,
      p_period_end,
      coalesce(p_payment_date, current_date),
      null,
      cash_total,
      selected_advance_ids,
      p_payment_method,
      group_note
    );

    update public.worker_wage_payments
    set
      recipient_worker_id = head_row.id,
      wage_batch_id = batch_row.id
    where id = payment_row.id;

    payment_count := payment_count + 1;
    gross_sum := round(gross_sum + payment_row.gross_amount, 2);
    advance_sum := round(advance_sum + payment_row.advance_deduction, 2);
  end loop;

  if payment_count = 0 then
    delete from public.worker_wage_payment_batches where id = batch_row.id;
    raise exception 'Tiada baki upah harian untuk kumpulan ini dalam projek dan tempoh dipilih.';
  end if;

  update public.worker_wage_payment_batches
  set
    total_gross = gross_sum,
    total_advance_deduction = advance_sum
  where id = batch_row.id
  returning * into batch_row;

  return batch_row;
end;
$$;

revoke all on function public.record_worker_crew_wage_payment(bigint, bigint, date, date, date, text, text) from public;
grant execute on function public.record_worker_crew_wage_payment(bigint, bigint, date, date, date, text, text) to authenticated;

grant select on public.worker_wage_payment_batches to authenticated;

commit;
