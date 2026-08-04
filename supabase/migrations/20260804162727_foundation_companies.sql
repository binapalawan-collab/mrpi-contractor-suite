begin;

-- Internal helpers are kept outside the Data API exposed schema.
create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

-- One owner account represents one company in V1.
create table public.companies (
  id bigint generated always as identity primary key,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  legal_name text not null,
  trading_name text,
  registration_no text,
  owner_name text not null,
  phone text not null,
  email text,
  website text,
  address_line_1 text,
  address_line_2 text,
  postcode text,
  city text,
  state text not null default 'Johor',
  country_code text not null default 'MY',
  business_description text,
  cidb_registration_no text,
  cidb_grade text,
  cidb_expiry_date date,
  mof_registration_no text,
  other_license_notes text,
  bank_name text,
  bank_account_name text,
  bank_account_no text,
  logo_path text,
  stamp_path text,
  signature_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint companies_owner_user_id_key unique (owner_user_id),
  constraint companies_legal_name_not_blank check (length(btrim(legal_name)) > 0),
  constraint companies_owner_name_not_blank check (length(btrim(owner_name)) > 0),
  constraint companies_phone_not_blank check (length(btrim(phone)) > 0),
  constraint companies_country_code_format check (country_code ~ '^[A-Z]{2}$'),
  constraint companies_postcode_length check (postcode is null or length(postcode) <= 12)
);

comment on table public.companies is 'Tenant company profile. V1 enforces one company for each authenticated owner.';
comment on column public.companies.owner_user_id is 'Supabase Auth user who owns this company and all tenant data.';
comment on column public.companies.logo_path is 'Private Storage object path; never a public bucket URL.';
comment on column public.companies.stamp_path is 'Private Storage object path for the company stamp.';
comment on column public.companies.signature_path is 'Private Storage object path for the owner signature.';

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = statement_timestamp();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;

create trigger companies_set_updated_at
before update on public.companies
for each row execute function private.set_updated_at();

-- Data API access and row ownership are separate layers. Grant only what V1 uses.
alter table public.companies enable row level security;

revoke all on table public.companies from anon, authenticated;
revoke all on sequence public.companies_id_seq from anon, authenticated;

grant usage on schema public to authenticated;
grant select, insert, update on table public.companies to authenticated;
grant usage, select on sequence public.companies_id_seq to authenticated;

create policy companies_select_own
on public.companies
for select
to authenticated
using ((select auth.uid()) = owner_user_id);

create policy companies_insert_own
on public.companies
for insert
to authenticated
with check ((select auth.uid()) = owner_user_id);

create policy companies_update_own
on public.companies
for update
to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

commit;
