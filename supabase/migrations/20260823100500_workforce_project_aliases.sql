create table if not exists public.workforce_project_aliases (
  project_id bigint primary key,
  company_id bigint not null,
  owner_user_id uuid not null,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint workforce_project_aliases_project_company_owner_fkey
    foreign key (project_id, company_id, owner_user_id)
    references public.projects (id, company_id, owner_user_id)
    on delete cascade,
  constraint workforce_project_aliases_display_name_not_blank
    check (length(btrim(display_name)) > 0),
  constraint workforce_project_aliases_display_name_length
    check (length(display_name) <= 120)
);

create index if not exists workforce_project_aliases_owner_name_idx
  on public.workforce_project_aliases (owner_user_id, display_name, project_id);

alter table public.workforce_project_aliases enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'workforce_project_aliases' and policyname = 'workforce_project_aliases_select_own'
  ) then
    create policy workforce_project_aliases_select_own
      on public.workforce_project_aliases for select to authenticated
      using (owner_user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'workforce_project_aliases' and policyname = 'workforce_project_aliases_insert_own'
  ) then
    create policy workforce_project_aliases_insert_own
      on public.workforce_project_aliases for insert to authenticated
      with check (owner_user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'workforce_project_aliases' and policyname = 'workforce_project_aliases_update_own'
  ) then
    create policy workforce_project_aliases_update_own
      on public.workforce_project_aliases for update to authenticated
      using (owner_user_id = auth.uid())
      with check (owner_user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'workforce_project_aliases' and policyname = 'workforce_project_aliases_delete_own'
  ) then
    create policy workforce_project_aliases_delete_own
      on public.workforce_project_aliases for delete to authenticated
      using (owner_user_id = auth.uid());
  end if;
end
$$;

revoke all on table public.workforce_project_aliases from anon;
grant select, insert, update, delete on table public.workforce_project_aliases to authenticated;
