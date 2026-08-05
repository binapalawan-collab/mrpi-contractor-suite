begin;

-- Platform-owned reminders shown only when the contractor asks for guidance.
create table public.system_site_visit_guides (
  guide_key text primary key,
  name_ms text not null,
  description_ms text not null,
  prompts_ms jsonb not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint system_site_visit_guides_key_not_blank check (length(btrim(guide_key)) > 0),
  constraint system_site_visit_guides_name_not_blank check (length(btrim(name_ms)) > 0),
  constraint system_site_visit_guides_description_not_blank check (length(btrim(description_ms)) > 0),
  constraint system_site_visit_guides_prompts_array check (
    jsonb_typeof(prompts_ms) = 'array' and jsonb_array_length(prompts_ms) > 0
  ),
  constraint system_site_visit_guides_sort_order_nonnegative check (sort_order >= 0)
);

create table public.clients (
  id bigint generated always as identity primary key,
  company_id bigint not null,
  owner_user_id uuid not null,
  name text not null,
  phone text not null,
  phone_normalized text not null,
  email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint clients_company_owner_fkey
    foreign key (company_id, owner_user_id)
    references public.companies (id, owner_user_id)
    on delete cascade,
  constraint clients_identity_key unique (id, company_id, owner_user_id),
  constraint clients_company_phone_key unique (company_id, phone_normalized),
  constraint clients_name_not_blank check (length(btrim(name)) > 0),
  constraint clients_phone_not_blank check (length(btrim(phone)) > 0),
  constraint clients_phone_normalized_format check (phone_normalized ~ '^[0-9]{7,15}$')
);

create table public.site_visits (
  id bigint generated always as identity primary key,
  company_id bigint not null,
  owner_user_id uuid not null,
  client_id bigint not null,
  project_title text not null default 'Cadangan Kerja Ubah Suai Rumah',
  visit_date date not null default current_date,
  address_line_1 text not null,
  address_line_2 text,
  postcode text,
  city text not null,
  state text not null default 'Johor',
  country_code text not null default 'MY',
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint site_visits_company_owner_fkey
    foreign key (company_id, owner_user_id)
    references public.companies (id, owner_user_id)
    on delete cascade,
  constraint site_visits_client_company_owner_fkey
    foreign key (client_id, company_id, owner_user_id)
    references public.clients (id, company_id, owner_user_id)
    on delete restrict,
  constraint site_visits_identity_key unique (id, company_id, owner_user_id),
  constraint site_visits_project_title_not_blank check (length(btrim(project_title)) > 0),
  constraint site_visits_address_line_1_not_blank check (length(btrim(address_line_1)) > 0),
  constraint site_visits_city_not_blank check (length(btrim(city)) > 0),
  constraint site_visits_state_not_blank check (length(btrim(state)) > 0),
  constraint site_visits_country_code_format check (country_code ~ '^[A-Z]{2}$'),
  constraint site_visits_postcode_length check (postcode is null or length(postcode) <= 12),
  constraint site_visits_status_valid check (
    status in ('draft', 'ready_for_quote', 'converted', 'archived')
  )
);

create table public.site_visit_areas (
  id bigint generated always as identity primary key,
  company_id bigint not null,
  owner_user_id uuid not null,
  site_visit_id bigint not null,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint site_visit_areas_visit_company_owner_fkey
    foreign key (site_visit_id, company_id, owner_user_id)
    references public.site_visits (id, company_id, owner_user_id)
    on delete cascade,
  constraint site_visit_areas_identity_key
    unique (id, site_visit_id, company_id, owner_user_id),
  constraint site_visit_areas_name_not_blank check (length(btrim(name)) > 0),
  constraint site_visit_areas_sort_order_nonnegative check (sort_order >= 0)
);

create table public.site_visit_entries (
  id bigint generated always as identity primary key,
  company_id bigint not null,
  owner_user_id uuid not null,
  site_visit_id bigint not null,
  area_id bigint not null,
  note_text text not null,
  measurement_text text,
  guide_key text references public.system_site_visit_guides (guide_key) on delete restrict,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint site_visit_entries_area_visit_company_owner_fkey
    foreign key (area_id, site_visit_id, company_id, owner_user_id)
    references public.site_visit_areas (id, site_visit_id, company_id, owner_user_id)
    on delete cascade,
  constraint site_visit_entries_identity_key
    unique (id, area_id, site_visit_id, company_id, owner_user_id),
  constraint site_visit_entries_note_not_blank check (length(btrim(note_text)) > 0),
  constraint site_visit_entries_measurement_not_blank check (
    measurement_text is null or length(btrim(measurement_text)) > 0
  ),
  constraint site_visit_entries_sort_order_nonnegative check (sort_order >= 0)
);

create table public.site_visit_photos (
  id bigint generated always as identity primary key,
  company_id bigint not null,
  owner_user_id uuid not null,
  site_visit_id bigint not null,
  area_id bigint not null,
  entry_id bigint not null,
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null,
  caption text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint site_visit_photos_entry_area_visit_company_owner_fkey
    foreign key (entry_id, area_id, site_visit_id, company_id, owner_user_id)
    references public.site_visit_entries (id, area_id, site_visit_id, company_id, owner_user_id)
    on delete cascade,
  constraint site_visit_photos_storage_path_not_blank check (length(btrim(storage_path)) > 0),
  constraint site_visit_photos_filename_not_blank check (length(btrim(original_filename)) > 0),
  constraint site_visit_photos_mime_valid check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp')
  ),
  constraint site_visit_photos_size_valid check (size_bytes > 0 and size_bytes <= 10485760),
  constraint site_visit_photos_sort_order_nonnegative check (sort_order >= 0)
);

create index system_site_visit_guides_active_sort_idx
  on public.system_site_visit_guides (is_active, sort_order, guide_key);

create index clients_owner_active_name_idx
  on public.clients (owner_user_id, is_active, name, id);

create index site_visits_owner_status_date_idx
  on public.site_visits (owner_user_id, status, visit_date desc, id desc);

create index site_visits_client_company_owner_idx
  on public.site_visits (client_id, company_id, owner_user_id);

create index site_visit_areas_visit_company_owner_sort_idx
  on public.site_visit_areas (site_visit_id, company_id, owner_user_id, is_active, sort_order, id);

create index site_visit_entries_visit_area_owner_sort_idx
  on public.site_visit_entries (
    site_visit_id, area_id, company_id, owner_user_id, is_active, sort_order, id
  );

create index site_visit_photos_entry_owner_sort_idx
  on public.site_visit_photos (
    entry_id, area_id, site_visit_id, company_id, owner_user_id, sort_order, id
  );

comment on table public.system_site_visit_guides is
  'Read-only optional reminder lists for common renovation work. They never create quotation items automatically.';
comment on table public.clients is
  'Private company client directory reused by site visits, quotations and later projects.';
comment on table public.site_visits is
  'Mobile-first site visit header and project location, captured without prices.';
comment on table public.site_visit_areas is
  'User-defined work areas such as Porch, Dapur or Bilik Air 1.';
comment on table public.site_visit_entries is
  'Free-text site notes with optional measurement text and one optional reminder guide.';
comment on table public.site_visit_photos is
  'Metadata for private photos stored in the site-visit-photos bucket.';

create trigger system_site_visit_guides_set_updated_at
before update on public.system_site_visit_guides
for each row execute function private.set_updated_at();

create trigger clients_set_updated_at
before update on public.clients
for each row execute function private.set_updated_at();

create trigger site_visits_set_updated_at
before update on public.site_visits
for each row execute function private.set_updated_at();

create trigger site_visit_areas_set_updated_at
before update on public.site_visit_areas
for each row execute function private.set_updated_at();

create trigger site_visit_entries_set_updated_at
before update on public.site_visit_entries
for each row execute function private.set_updated_at();

create trigger site_visit_photos_set_updated_at
before update on public.site_visit_photos
for each row execute function private.set_updated_at();

-- Explicit Data API grants: new tables are not auto-exposed on current Supabase projects.
alter table public.system_site_visit_guides enable row level security;
alter table public.clients enable row level security;
alter table public.site_visits enable row level security;
alter table public.site_visit_areas enable row level security;
alter table public.site_visit_entries enable row level security;
alter table public.site_visit_photos enable row level security;

revoke all on table public.system_site_visit_guides from anon, authenticated;
revoke all on table public.clients from anon, authenticated;
revoke all on table public.site_visits from anon, authenticated;
revoke all on table public.site_visit_areas from anon, authenticated;
revoke all on table public.site_visit_entries from anon, authenticated;
revoke all on table public.site_visit_photos from anon, authenticated;

revoke all on sequence public.clients_id_seq from anon, authenticated;
revoke all on sequence public.site_visits_id_seq from anon, authenticated;
revoke all on sequence public.site_visit_areas_id_seq from anon, authenticated;
revoke all on sequence public.site_visit_entries_id_seq from anon, authenticated;
revoke all on sequence public.site_visit_photos_id_seq from anon, authenticated;

grant select on table public.system_site_visit_guides to authenticated;
grant select, insert, update on table public.clients to authenticated;
grant select, insert, update on table public.site_visits to authenticated;
grant select, insert, update on table public.site_visit_areas to authenticated;
grant select, insert, update on table public.site_visit_entries to authenticated;
grant select, insert, update, delete on table public.site_visit_photos to authenticated;

grant usage, select on sequence public.clients_id_seq to authenticated;
grant usage, select on sequence public.site_visits_id_seq to authenticated;
grant usage, select on sequence public.site_visit_areas_id_seq to authenticated;
grant usage, select on sequence public.site_visit_entries_id_seq to authenticated;
grant usage, select on sequence public.site_visit_photos_id_seq to authenticated;

create policy system_site_visit_guides_read_authenticated
on public.system_site_visit_guides
for select
to authenticated
using (true);

create policy clients_select_own
on public.clients for select to authenticated
using ((select auth.uid()) = owner_user_id);

create policy clients_insert_own
on public.clients for insert to authenticated
with check ((select auth.uid()) = owner_user_id);

create policy clients_update_own
on public.clients for update to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy site_visits_select_own
on public.site_visits for select to authenticated
using ((select auth.uid()) = owner_user_id);

create policy site_visits_insert_own
on public.site_visits for insert to authenticated
with check ((select auth.uid()) = owner_user_id);

create policy site_visits_update_own
on public.site_visits for update to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy site_visit_areas_select_own
on public.site_visit_areas for select to authenticated
using ((select auth.uid()) = owner_user_id);

create policy site_visit_areas_insert_own
on public.site_visit_areas for insert to authenticated
with check ((select auth.uid()) = owner_user_id);

create policy site_visit_areas_update_own
on public.site_visit_areas for update to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy site_visit_entries_select_own
on public.site_visit_entries for select to authenticated
using ((select auth.uid()) = owner_user_id);

create policy site_visit_entries_insert_own
on public.site_visit_entries for insert to authenticated
with check ((select auth.uid()) = owner_user_id);

create policy site_visit_entries_update_own
on public.site_visit_entries for update to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy site_visit_photos_select_own
on public.site_visit_photos for select to authenticated
using ((select auth.uid()) = owner_user_id);

create policy site_visit_photos_insert_own
on public.site_visit_photos for insert to authenticated
with check ((select auth.uid()) = owner_user_id);

create policy site_visit_photos_update_own
on public.site_visit_photos for update to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy site_visit_photos_delete_own
on public.site_visit_photos for delete to authenticated
using ((select auth.uid()) = owner_user_id);

insert into public.system_site_visit_guides (
  guide_key, name_ms, description_ms, prompts_ms, sort_order
) values
  (
    'tabletop',
    'Tabletop',
    'Semak ukuran, kemasan, sinki dan titik perkhidmatan sebelum meninggalkan tapak.',
    jsonb_build_array(
      'Panjang, bentuk lurus atau bentuk L/U',
      'Ketinggian tabletop yang telah siap',
      'Jenis permukaan dan warna pilihan',
      'Kemasan bucu: biasa, mitre atau L-profile',
      'Jenis, saiz dan kedudukan sinki',
      'Kedudukan hob, hood dan potongan yang diperlukan',
      'Bahan serta ketinggian backsplash',
      'Point soket, paip air dan saluran buangan'
    ),
    10
  ),
  (
    'awning',
    'Awning',
    'Semak liputan, rangka dan laluan air hujan.',
    jsonb_build_array(
      'Panjang, lebar dan kawasan yang perlu dilindungi',
      'Jenis bahan bumbung seperti ACP, metal deck atau polycarbonate',
      'Bahan dan saiz rangka',
      'Arah cerun dan ketinggian awning',
      'Gutter biasa atau hidden gutter',
      'Kedudukan downpipe dan tempat air dilepaskan',
      'Keperluan tiang atau ikatan pada dinding',
      'Lampu atau point elektrik di bawah awning'
    ),
    20
  ),
  (
    'ceiling',
    'Siling',
    'Semak jenis siling, aras siap dan bukaan perkhidmatan.',
    jsonb_build_array(
      'Jenis siling: rata, L-box, drop, plaster atau PVC',
      'Siling lama perlu dibuka atau dikekalkan',
      'Ketinggian siling yang telah siap',
      'Lokasi access panel',
      'Lokasi lampu, kipas, penghawa dingin dan diffuser',
      'Cornice, shadow line atau kemasan tepi',
      'Skop cat siling'
    ),
    30
  ),
  (
    'bathroom',
    'Bilik Air',
    'Panduan ini panjang sedikit kerana kesilapan tersembunyi mudah memberi kesan kepada kos.',
    jsonb_build_array(
      'Saiz lantai, tinggi dinding dan keadaan sedia ada',
      'Mozek lama perlu dipecah atau dipasang di atas yang lama',
      'Kawasan waterproofing dan keperluan ujian takungan air',
      'Saiz, arah corak dan tinggi pemasangan mozek',
      'Kedudukan floor trap serta arah cerun lantai',
      'Tandas, basin, shower dan aksesori: guna semula atau baharu',
      'Paip air dan saluran buangan yang perlu dialih',
      'Shower screen, niche, kerb dan pintu bilik air',
      'Siling, kipas ekzos, lampu dan water heater'
    ),
    40
  ),
  (
    'slab',
    'Slab & Konkrit',
    'Bezakan slab atas tanah, slab rendah dan slab tergantung sebelum mengira.',
    jsonb_build_array(
      'Tujuan slab dan beban yang akan ditanggung',
      'Panjang, lebar, tebal dan ketinggian siap',
      'Slab atas tanah atau slab tergantung',
      'Jika untuk kereta atau tangki air, anggaran beban',
      'Saiz besi tetulang dan jarak tetulang',
      'Keperluan beam, column atau sokongan sedia ada',
      'Cerun, longkang dan waterproofing',
      'Akses untuk bancuhan, pam konkrit atau lori'
    ),
    50
  ),
  (
    'electrical',
    'Elektrik',
    'Catat bilangan point dan kedudukan supaya tidak tertinggal ketika menyediakan harga.',
    jsonb_build_array(
      'Jenis dan bilangan point',
      'Kedudukan serta ketinggian setiap point',
      'Pendawaian concealed atau surface',
      'Keadaan DB sedia ada dan kapasiti tambahan',
      'Litar baharu, isolator atau suis khas',
      'Lampu, kipas dan aksesori dibekalkan oleh siapa',
      'Kerja menebuk dan membaiki dinding atau siling',
      'Keperluan ujian dan pelabelan'
    ),
    60
  ),
  (
    'plumbing',
    'Paip & Sanitari',
    'Semak sumber, laluan dan titik akhir bagi air bersih serta air buangan.',
    jsonb_build_array(
      'Point air sejuk, air panas dan saluran buangan',
      'Kedudukan setiap sanitary fitting',
      'Sumber air dan laluan paip',
      'Jenis serta saiz paip',
      'Paip concealed atau exposed',
      'Tangki, pam dan tekanan air sedia ada',
      'Floor trap, manhole dan sambungan sewer',
      'Ujian kebocoran dan kerja membaiki kemasan'
    ),
    70
  ),
  (
    'door_window',
    'Pintu & Tingkap',
    'Semak bukaan, arah penggunaan dan semua aksesori.',
    jsonb_build_array(
      'Saiz bukaan dan bilangan unit',
      'Jenis serta bahan pintu atau tingkap',
      'Frame lama digunakan semula atau diganti',
      'Arah bukaan, hinge dan hand pintu',
      'Jenis dan ketebalan kaca',
      'Lockset, handle, stopper dan aksesori',
      'Grill, mosquito net atau tinted film',
      'Kerja hacking, lintel, plaster dan cat semula'
    ),
    80
  ),
  (
    'roof',
    'Bumbung',
    'Semak punca masalah dan komponen lengkap. Pilihan metal deck tidak memerlukan pilihan profil.',
    jsonb_build_array(
      'Lokasi bocor dan keadaan bumbung sedia ada',
      'Keluasan, panjang cerun dan ketinggian',
      'Bahan bumbung termasuk metal deck jika dipilih',
      'Rangka lama digunakan semula atau rangka baharu',
      'Insulation atau foil yang diperlukan',
      'Flashing, ridge, verge dan sambungan dinding',
      'Gutter, hidden gutter dan downpipe',
      'Akses kerja, scaffolding dan keselamatan'
    ),
    90
  ),
  (
    'painting',
    'Cat',
    'Semak keadaan permukaan kerana persediaan memberi kesan besar kepada harga.',
    jsonb_build_array(
      'Ruang dalaman, luaran atau kedua-duanya',
      'Keluasan, bilangan bilik dan bilangan tingkat',
      'Cat mengelupas, retak, kulat atau kesan air',
      'Skop cuci, kikis, skim coat dan sealer',
      'Jenis, jenama, warna dan kemasan cat',
      'Bilangan lapisan',
      'Siling, pintu, frame, grill dan pagar termasuk atau tidak',
      'Perlindungan perabot serta keperluan scaffolding'
    ),
    100
  ),
  (
    'porch',
    'Porch',
    'Semak lantai, saliran dan beban kenderaan sebagai satu kawasan kerja.',
    jsonb_build_array(
      'Panjang, lebar dan aras porch',
      'Permukaan lama perlu dipecah atau dikekalkan',
      'Kemasan baharu: mozek, concrete imprint atau kemasan lain',
      'Cerun lantai dan kedudukan longkang',
      'Slab atau penutup longkang perlu menanggung kereta',
      'Awning, tiang dan hidden gutter',
      'Lampu, soket dan point pagar automatik',
      'Hubungan dengan pagar, gate dan sempadan rumah'
    ),
    110
  ),
  (
    'fence_gate',
    'Pagar & Pintu Pagar',
    'Semak bukaan, asas dan keperluan automasi.',
    jsonb_build_array(
      'Panjang pagar, tinggi dan lebar bukaan gate',
      'Pagar atau gate lama perlu dibuka',
      'Footing, ground beam dan column',
      'Bahan, corak dan kemasan cat',
      'Gate swing, folding atau sliding',
      'Arah bukaan dan ruang pergerakan',
      'Manual atau auto gate serta lokasi motor',
      'Bekalan elektrik, saliran dan laluan kabel'
    ),
    120
  )
on conflict (guide_key) do update set
  name_ms = excluded.name_ms,
  description_ms = excluded.description_ms,
  prompts_ms = excluded.prompts_ms,
  sort_order = excluded.sort_order,
  is_active = true;

-- Photos stay private. The first path segment must be the authenticated user id.
insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'site-visit-photos',
  'site-visit-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy site_visit_storage_select_own
on storage.objects for select to authenticated
using (
  bucket_id = 'site-visit-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy site_visit_storage_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'site-visit-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy site_visit_storage_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'site-visit-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

commit;
