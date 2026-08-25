alter table public.companies
add column if not exists owner_position text not null default 'Pemilik';

update public.companies
set owner_position = 'Pemilik'
where btrim(coalesce(owner_position, '')) = '';

comment on column public.companies.owner_position is
  'Jawatan pemilik atau penandatangan untuk blok pengesahan dokumen.';
