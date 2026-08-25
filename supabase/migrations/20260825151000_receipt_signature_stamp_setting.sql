alter table public.companies
  add column if not exists receipt_show_signature_stamp boolean not null default false;

comment on column public.companies.receipt_show_signature_stamp is
  'When true, official receipts may render the private company signature and stamp assets from the company profile.';
