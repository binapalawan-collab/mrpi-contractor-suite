begin;

create table public.payment_schedules (
  id bigint generated always as identity primary key,
  project_id bigint not null,
  company_id bigint not null,
  owner_user_id uuid not null,
  title text not null default 'JADUAL BAYARAN PROJEK',
  notes text not null default '',
  basis_amount numeric(14, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint payment_schedules_project_company_owner_fkey
    foreign key (project_id, company_id, owner_user_id)
    references public.projects (id, company_id, owner_user_id)
    on delete cascade,
  constraint payment_schedules_identity_key
    unique (id, project_id, company_id, owner_user_id),
  constraint payment_schedules_project_key
    unique (project_id),
  constraint payment_schedules_title_not_blank
    check (length(btrim(title)) > 0),
  constraint payment_schedules_title_length
    check (length(title) <= 200),
  constraint payment_schedules_notes_length
    check (length(notes) <= 5000),
  constraint payment_schedules_basis_nonnegative
    check (basis_amount >= 0)
);

create table public.payment_schedule_stages (
  id bigint generated always as identity primary key,
  schedule_id bigint not null,
  project_id bigint not null,
  company_id bigint not null,
  owner_user_id uuid not null,
  stage_no integer not null,
  label text not null,
  description text not null default '',
  percentage numeric(7, 3) not null,
  amount numeric(14, 2) not null,
  created_at timestamptz not null default now(),

  constraint payment_schedule_stages_schedule_company_owner_fkey
    foreign key (schedule_id, project_id, company_id, owner_user_id)
    references public.payment_schedules (id, project_id, company_id, owner_user_id)
    on delete cascade,
  constraint payment_schedule_stages_schedule_order_key
    unique (schedule_id, stage_no),
  constraint payment_schedule_stages_stage_no_valid
    check (stage_no between 1 and 12),
  constraint payment_schedule_stages_label_not_blank
    check (length(btrim(label)) > 0),
  constraint payment_schedule_stages_label_length
    check (length(label) <= 200),
  constraint payment_schedule_stages_description_length
    check (length(description) <= 1000),
  constraint payment_schedule_stages_percentage_valid
    check (percentage > 0 and percentage <= 100),
  constraint payment_schedule_stages_amount_nonnegative
    check (amount >= 0)
);

create index payment_schedule_stages_project_owner_idx
  on public.payment_schedule_stages (project_id, owner_user_id, stage_no);

alter table public.payment_schedules enable row level security;
alter table public.payment_schedule_stages enable row level security;

revoke all on table public.payment_schedules from anon, authenticated;
revoke all on table public.payment_schedule_stages from anon, authenticated;
revoke all on sequence public.payment_schedules_id_seq from anon, authenticated;
revoke all on sequence public.payment_schedule_stages_id_seq from anon, authenticated;

grant select, insert, update on table public.payment_schedules to authenticated;
grant select, insert, update, delete on table public.payment_schedule_stages to authenticated;
grant usage, select on sequence public.payment_schedules_id_seq to authenticated;
grant usage, select on sequence public.payment_schedule_stages_id_seq to authenticated;

create policy payment_schedules_select_own
on public.payment_schedules for select to authenticated
using ((select auth.uid()) = owner_user_id);

create policy payment_schedules_insert_own
on public.payment_schedules for insert to authenticated
with check ((select auth.uid()) = owner_user_id);

create policy payment_schedules_update_own
on public.payment_schedules for update to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy payment_schedule_stages_select_own
on public.payment_schedule_stages for select to authenticated
using ((select auth.uid()) = owner_user_id);

create policy payment_schedule_stages_insert_own
on public.payment_schedule_stages for insert to authenticated
with check ((select auth.uid()) = owner_user_id);

create policy payment_schedule_stages_update_own
on public.payment_schedule_stages for update to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy payment_schedule_stages_delete_own
on public.payment_schedule_stages for delete to authenticated
using ((select auth.uid()) = owner_user_id);

create or replace function public.save_project_payment_schedule(
  p_project_id bigint,
  p_title text,
  p_notes text,
  p_stages jsonb
)
returns public.payment_schedules
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  project_row public.projects;
  schedule_row public.payment_schedules;
  stage_record record;
  stage_label text;
  stage_description text;
  stage_percentage numeric(7, 3);
  stage_amount numeric(14, 2);
  total_percentage numeric(10, 3) := 0;
  allocated_amount numeric(14, 2) := 0;
  stage_count integer;
begin
  if current_user_id is null then
    raise exception 'Sesi pengguna tidak sah.';
  end if;

  select project.*
  into project_row
  from public.projects as project
  where project.id = p_project_id
    and project.owner_user_id = current_user_id;

  if not found then
    raise exception 'Projek tidak ditemui atau bukan milik pengguna ini.';
  end if;
  if length(btrim(coalesce(p_title, ''))) = 0 or length(p_title) > 200 then
    raise exception 'Tajuk jadual pembayaran mesti diisi dan tidak melebihi 200 aksara.';
  end if;
  if length(coalesce(p_notes, '')) > 5000 then
    raise exception 'Nota jadual pembayaran terlalu panjang.';
  end if;
  if jsonb_typeof(p_stages) is distinct from 'array' then
    raise exception 'Senarai tahap pembayaran tidak sah.';
  end if;

  stage_count := jsonb_array_length(p_stages);
  if stage_count < 2 or stage_count > 12 then
    raise exception 'Jadual pembayaran mesti mempunyai 2 hingga 12 tahap.';
  end if;

  for stage_record in
    select value, ordinality
    from jsonb_array_elements(p_stages) with ordinality
  loop
    stage_label := btrim(coalesce(stage_record.value ->> 'label', ''));
    stage_description := coalesce(stage_record.value ->> 'description', '');
    begin
      stage_percentage := (stage_record.value ->> 'percentage')::numeric(7, 3);
    exception when others then
      raise exception 'Peratus tahap % tidak sah.', stage_record.ordinality;
    end;

    if stage_label = '' or length(stage_label) > 200 then
      raise exception 'Nama tahap % mesti diisi dan tidak melebihi 200 aksara.', stage_record.ordinality;
    end if;
    if length(stage_description) > 1000 then
      raise exception 'Keterangan tahap % terlalu panjang.', stage_record.ordinality;
    end if;
    if stage_percentage <= 0 or stage_percentage > 100 then
      raise exception 'Peratus tahap % mesti lebih 0 dan tidak melebihi 100.', stage_record.ordinality;
    end if;
    total_percentage := total_percentage + stage_percentage;
  end loop;

  if round(total_percentage, 3) <> 100.000 then
    raise exception 'Jumlah peratus jadual pembayaran mesti tepat 100%%. Jumlah semasa: %%%.', total_percentage;
  end if;

  insert into public.payment_schedules (
    project_id, company_id, owner_user_id, title, notes, basis_amount
  ) values (
    project_row.id,
    project_row.company_id,
    project_row.owner_user_id,
    btrim(p_title),
    coalesce(p_notes, ''),
    project_row.current_contract_amount
  )
  on conflict (project_id) do update
  set title = excluded.title,
      notes = excluded.notes,
      basis_amount = excluded.basis_amount,
      updated_at = now()
  where payment_schedules.owner_user_id = current_user_id
  returning * into schedule_row;

  if schedule_row.id is null then
    raise exception 'Jadual pembayaran tidak dapat disimpan.';
  end if;

  delete from public.payment_schedule_stages
  where schedule_id = schedule_row.id
    and owner_user_id = current_user_id;

  for stage_record in
    select value, ordinality
    from jsonb_array_elements(p_stages) with ordinality
  loop
    stage_percentage := (stage_record.value ->> 'percentage')::numeric(7, 3);
    if stage_record.ordinality = stage_count then
      stage_amount := round(schedule_row.basis_amount - allocated_amount, 2);
    else
      stage_amount := round(schedule_row.basis_amount * stage_percentage / 100, 2);
      allocated_amount := allocated_amount + stage_amount;
    end if;

    insert into public.payment_schedule_stages (
      schedule_id, project_id, company_id, owner_user_id,
      stage_no, label, description, percentage, amount
    ) values (
      schedule_row.id,
      schedule_row.project_id,
      schedule_row.company_id,
      schedule_row.owner_user_id,
      stage_record.ordinality,
      btrim(stage_record.value ->> 'label'),
      coalesce(stage_record.value ->> 'description', ''),
      stage_percentage,
      stage_amount
    );
  end loop;

  return schedule_row;
end;
$$;

revoke execute on function public.save_project_payment_schedule(bigint, text, text, jsonb)
  from public, anon;
grant execute on function public.save_project_payment_schedule(bigint, text, text, jsonb)
  to authenticated;

-- Future issued invoices keep the company's bank details in their immutable
-- snapshot. The quotation snapshot remains unchanged and contains no bank data.
do $$
declare
  function_definition text;
  old_fragment text := $fragment$      'logo_path', company.logo_path
    ),$fragment$;
  new_fragment text := $fragment$      'logo_path', company.logo_path,
      'bank_name', company.bank_name,
      'bank_account_name', company.bank_account_name,
      'bank_account_no', company.bank_account_no
    ),$fragment$;
begin
  select pg_get_functiondef('private.capture_invoice_snapshot()'::regprocedure)
  into function_definition;

  if function_definition like '%' || old_fragment || '%' then
    execute replace(function_definition, old_fragment, new_fragment);
  elsif function_definition like '%' || new_fragment || '%' then
    null;
  else
    raise exception 'Struktur snapshot invois tidak sepadan dengan migration maklumat bank.';
  end if;
end;
$$;

commit;
