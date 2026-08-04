begin;

-- Keep the company and owner pair consistent in every tenant-owned catalog row.
alter table public.companies
  add constraint companies_id_owner_user_id_key unique (id, owner_user_id);

create table public.system_catalog_categories (
  id bigint generated always as identity primary key,
  code text not null unique,
  name_ms text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint system_catalog_categories_code_not_blank check (length(btrim(code)) > 0),
  constraint system_catalog_categories_name_not_blank check (length(btrim(name_ms)) > 0),
  constraint system_catalog_categories_sort_order_nonnegative check (sort_order >= 0)
);

create table public.system_catalog_items (
  id bigint generated always as identity primary key,
  category_id bigint not null references public.system_catalog_categories (id) on delete restrict,
  code text not null unique,
  name_ms text not null,
  description_ms text not null,
  unit text not null,
  default_rate numeric(12, 2) not null default 0,
  price_note_ms text,
  guide_key text,
  version integer not null default 1,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint system_catalog_items_code_not_blank check (length(btrim(code)) > 0),
  constraint system_catalog_items_name_not_blank check (length(btrim(name_ms)) > 0),
  constraint system_catalog_items_description_not_blank check (length(btrim(description_ms)) > 0),
  constraint system_catalog_items_unit_not_blank check (length(btrim(unit)) > 0),
  constraint system_catalog_items_rate_nonnegative check (default_rate >= 0),
  constraint system_catalog_items_version_positive check (version > 0),
  constraint system_catalog_items_sort_order_nonnegative check (sort_order >= 0),
  constraint system_catalog_items_guide_key_valid check (
    guide_key is null or guide_key in (
      'tabletop', 'awning', 'ceiling', 'bathroom', 'slab', 'electrical',
      'plumbing', 'door_window', 'roof', 'painting', 'porch', 'fence_gate'
    )
  )
);

create index system_catalog_items_category_sort_idx
  on public.system_catalog_items (category_id, is_active, sort_order, id);

create table public.company_catalog_categories (
  id bigint generated always as identity primary key,
  company_id bigint not null,
  owner_user_id uuid not null,
  source_category_id bigint references public.system_catalog_categories (id) on delete set null,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint company_catalog_categories_company_owner_fkey
    foreign key (company_id, owner_user_id)
    references public.companies (id, owner_user_id)
    on delete cascade,
  constraint company_catalog_categories_source_key unique (company_id, source_category_id),
  constraint company_catalog_categories_identity_key unique (id, company_id, owner_user_id),
  constraint company_catalog_categories_name_not_blank check (length(btrim(name)) > 0),
  constraint company_catalog_categories_sort_order_nonnegative check (sort_order >= 0)
);

create index company_catalog_categories_owner_active_sort_idx
  on public.company_catalog_categories (owner_user_id, is_active, sort_order, id);

create table public.company_catalog_items (
  id bigint generated always as identity primary key,
  company_id bigint not null,
  owner_user_id uuid not null,
  category_id bigint not null,
  source_item_id bigint references public.system_catalog_items (id) on delete set null,
  imported_master_version integer,
  code text,
  name text not null,
  description text not null,
  unit text not null,
  rate numeric(12, 2) not null default 0,
  price_note text,
  guide_key text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint company_catalog_items_company_owner_fkey
    foreign key (company_id, owner_user_id)
    references public.companies (id, owner_user_id)
    on delete cascade,
  constraint company_catalog_items_category_company_owner_fkey
    foreign key (category_id, company_id, owner_user_id)
    references public.company_catalog_categories (id, company_id, owner_user_id)
    on delete restrict,
  constraint company_catalog_items_source_key unique (company_id, source_item_id),
  constraint company_catalog_items_name_not_blank check (length(btrim(name)) > 0),
  constraint company_catalog_items_description_not_blank check (length(btrim(description)) > 0),
  constraint company_catalog_items_unit_not_blank check (length(btrim(unit)) > 0),
  constraint company_catalog_items_rate_nonnegative check (rate >= 0),
  constraint company_catalog_items_master_version_positive check (
    imported_master_version is null or imported_master_version > 0
  ),
  constraint company_catalog_items_sort_order_nonnegative check (sort_order >= 0),
  constraint company_catalog_items_guide_key_valid check (
    guide_key is null or guide_key in (
      'tabletop', 'awning', 'ceiling', 'bathroom', 'slab', 'electrical',
      'plumbing', 'door_window', 'roof', 'painting', 'porch', 'fence_gate'
    )
  )
);

create index company_catalog_items_owner_active_category_sort_idx
  on public.company_catalog_items (owner_user_id, is_active, category_id, sort_order, id);

create index company_catalog_items_category_company_owner_idx
  on public.company_catalog_items (category_id, company_id, owner_user_id);

comment on table public.system_catalog_categories is
  'Read-only category templates maintained by the platform. Tenant copies never change automatically.';
comment on table public.system_catalog_items is
  'Read-only master catalog. Version increases allow opt-in imports without overwriting tenant prices.';
comment on table public.company_catalog_categories is
  'Private category copies belonging to one company owner.';
comment on table public.company_catalog_items is
  'Private editable catalog items. Archiving is used instead of destructive deletion.';
comment on column public.company_catalog_items.imported_master_version is
  'Master version last accepted by the company; later master changes are opt-in.';
comment on column public.company_catalog_items.rate is
  'Company-owned suggested selling rate in Malaysian Ringgit.';

create trigger system_catalog_categories_set_updated_at
before update on public.system_catalog_categories
for each row execute function private.set_updated_at();

create trigger system_catalog_items_set_updated_at
before update on public.system_catalog_items
for each row execute function private.set_updated_at();

create trigger company_catalog_categories_set_updated_at
before update on public.company_catalog_categories
for each row execute function private.set_updated_at();

create trigger company_catalog_items_set_updated_at
before update on public.company_catalog_items
for each row execute function private.set_updated_at();

-- Explicit Data API grants are required for new Supabase projects from 2026 onward.
alter table public.system_catalog_categories enable row level security;
alter table public.system_catalog_items enable row level security;
alter table public.company_catalog_categories enable row level security;
alter table public.company_catalog_items enable row level security;

revoke all on table public.system_catalog_categories from anon, authenticated;
revoke all on table public.system_catalog_items from anon, authenticated;
revoke all on table public.company_catalog_categories from anon, authenticated;
revoke all on table public.company_catalog_items from anon, authenticated;
revoke all on sequence public.system_catalog_categories_id_seq from anon, authenticated;
revoke all on sequence public.system_catalog_items_id_seq from anon, authenticated;
revoke all on sequence public.company_catalog_categories_id_seq from anon, authenticated;
revoke all on sequence public.company_catalog_items_id_seq from anon, authenticated;

grant select on table public.system_catalog_categories to authenticated;
grant select on table public.system_catalog_items to authenticated;
grant select, insert, update on table public.company_catalog_categories to authenticated;
grant select, insert, update on table public.company_catalog_items to authenticated;
grant usage, select on sequence public.company_catalog_categories_id_seq to authenticated;
grant usage, select on sequence public.company_catalog_items_id_seq to authenticated;

create policy system_catalog_categories_read_authenticated
on public.system_catalog_categories
for select
to authenticated
using (true);

create policy system_catalog_items_read_authenticated
on public.system_catalog_items
for select
to authenticated
using (true);

create policy company_catalog_categories_select_own
on public.company_catalog_categories
for select
to authenticated
using ((select auth.uid()) = owner_user_id);

create policy company_catalog_categories_insert_own
on public.company_catalog_categories
for insert
to authenticated
with check ((select auth.uid()) = owner_user_id);

create policy company_catalog_categories_update_own
on public.company_catalog_categories
for update
to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy company_catalog_items_select_own
on public.company_catalog_items
for select
to authenticated
using ((select auth.uid()) = owner_user_id);

create policy company_catalog_items_insert_own
on public.company_catalog_items
for insert
to authenticated
with check ((select auth.uid()) = owner_user_id);

create policy company_catalog_items_update_own
on public.company_catalog_items
for update
to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

insert into public.system_catalog_categories (code, name_ms, sort_order) values
  ('site_preparation', 'Persediaan Tapak', 10),
  ('demolition', 'Perobohan & Pembuangan', 20),
  ('structure_concrete', 'Struktur & Konkrit', 30),
  ('masonry_plaster', 'Dinding & Kemasan', 40),
  ('floor_tiles', 'Lantai & Mozek', 50),
  ('ceiling', 'Siling', 60),
  ('roof_awning', 'Bumbung & Awning', 70),
  ('doors_windows', 'Pintu & Tingkap', 80),
  ('electrical', 'Elektrik', 90),
  ('plumbing_sanitary', 'Paip & Sanitari', 100),
  ('kitchen_tabletop', 'Dapur & Tabletop', 110),
  ('bathroom', 'Bilik Air', 120),
  ('painting_finishes', 'Cat & Kemasan', 130),
  ('porch_external', 'Porch & Luar Rumah', 140),
  ('fence_gate', 'Pagar & Pintu Pagar', 150)
on conflict (code) do update set
  name_ms = excluded.name_ms,
  sort_order = excluded.sort_order,
  is_active = true;

with seed (
  category_code, code, name_ms, description_ms, unit, default_rate,
  price_note_ms, guide_key, sort_order
) as (
  values
    ('site_preparation', 'PREP-001', 'Lawatan tapak dan ukuran', 'Lawatan tapak, pemeriksaan keadaan sedia ada dan pengambilan ukuran asas.', 'lot', 0.00, 'Boleh dijadikan percuma atau caj mengikut jarak.', null, 10),
    ('site_preparation', 'PREP-002', 'Mobilisasi dan demobilisasi', 'Penghantaran alatan, persediaan awal dan pengeluaran alatan selepas kerja siap.', 'lot', 350.00, 'Tidak termasuk jentera berat.', null, 20),
    ('site_preparation', 'PREP-003', 'Perlindungan kawasan kerja', 'Menutup dan melindungi lantai, pintu, perabot atau laluan berhampiran kawasan kerja.', 'lot', 300.00, 'Laraskan mengikut keluasan dan tempoh.', null, 30),
    ('site_preparation', 'PREP-004', 'Pembersihan harian kawasan kerja', 'Mengemas sisa ringan dan memastikan laluan kerja selamat pada akhir hari.', 'hari', 120.00, 'Sesuai untuk kerja berperingkat.', null, 40),
    ('site_preparation', 'PREP-005', 'Pembersihan akhir projek', 'Pembersihan kasar selepas kerja siap sebelum pemeriksaan dan serahan.', 'lot', 500.00, 'Tidak termasuk cucian profesional.', null, 50),
    ('site_preparation', 'PREP-006', 'Penyeliaan kerja', 'Penyeliaan, koordinasi tukang dan pemeriksaan mutu kerja di tapak.', 'hari', 250.00, 'Gunakan jika dicaj berasingan.', null, 60),

    ('demolition', 'DEMO-001', 'Pecah dinding bata 4 inci', 'Meroboh dinding bata 4 inci termasuk pengumpulan sisa di kawasan kerja.', 'kps', 8.00, 'Pembuangan keluar tapak dicaj berasingan.', null, 10),
    ('demolition', 'DEMO-002', 'Pecah dinding bata 9 inci', 'Meroboh dinding bata 9 inci termasuk pengumpulan sisa di kawasan kerja.', 'kps', 12.00, 'Semak struktur sebelum kerja.', null, 20),
    ('demolition', 'DEMO-003', 'Pecah mozek lantai', 'Membuka mozek dan mortar lama sehingga permukaan sesuai untuk kerja baharu.', 'kps', 5.00, 'Harga berubah mengikut ketebalan mortar.', null, 30),
    ('demolition', 'DEMO-004', 'Pecah mozek dinding', 'Membuka mozek dinding dan membersihkan lebihan mortar longgar.', 'kps', 6.00, 'Pembaikan plaster dicaj berasingan.', null, 40),
    ('demolition', 'DEMO-005', 'Buka siling sedia ada', 'Menanggalkan papan siling dan rangka yang berkaitan secara terkawal.', 'kps', 3.50, 'Tidak termasuk pelupusan bahan berbahaya.', 'ceiling', 50),
    ('demolition', 'DEMO-006', 'Buka bumbung metal deck', 'Menanggalkan kepingan bumbung metal deck sedia ada tanpa kerja rangka baharu.', 'kps', 4.00, 'Kerja pada tempat tinggi dinilai semula.', 'roof', 60),
    ('demolition', 'DEMO-007', 'Buka pintu atau tingkap', 'Menanggalkan satu unit pintu atau tingkap bersama kemasan tepi asas.', 'unit', 100.00, 'Baik pulih bukaan dicaj berasingan.', 'door_window', 70),
    ('demolition', 'DEMO-008', 'Pengangkutan dan buang sisa', 'Mengangkut sisa binaan keluar dari tapak menggunakan kenderaan yang sesuai.', 'trip', 450.00, 'Harga mengikut muatan, jarak dan caj pelupusan.', null, 80),

    ('structure_concrete', 'CONC-001', 'Footing konkrit bertetulang', 'Membina footing termasuk korekan, tetulang, acuan asas dan konkrit.', 'unit', 650.00, 'Saiz dan keadaan tanah perlu disahkan.', 'slab', 10),
    ('structure_concrete', 'CONC-002', 'Ground beam konkrit', 'Membina ground beam termasuk besi tetulang, acuan dan konkrit.', 'kaki', 85.00, 'Kadar untuk saiz kediaman biasa.', 'slab', 20),
    ('structure_concrete', 'CONC-003', 'Tiang konkrit 4 x 12 inci', 'Membina tiang konkrit bertetulang 4 x 12 inci termasuk acuan.', 'kaki', 75.00, 'Kadar berdasarkan ketinggian siap.', 'slab', 30),
    ('structure_concrete', 'CONC-004', 'Tiang konkrit 12 x 12 inci', 'Membina tiang konkrit bertetulang 12 x 12 inci termasuk acuan.', 'kaki', 130.00, 'Semak reka bentuk dan tetulang.', 'slab', 40),
    ('structure_concrete', 'CONC-005', 'Roof beam konkrit', 'Membina roof beam termasuk besi tetulang, acuan dan konkrit.', 'kaki', 95.00, 'Kadar untuk saiz kediaman biasa.', 'slab', 50),
    ('structure_concrete', 'CONC-006', 'Lintel pintu atau tingkap', 'Membina lintel konkrit bertetulang di atas bukaan pintu atau tingkap.', 'kaki', 65.00, 'Saiz mengikut lebar bukaan.', 'slab', 60),
    ('structure_concrete', 'CONC-007', 'Slab lantai tanah 4 inci dengan BRC', 'Membina slab konkrit 4 inci termasuk BRC dan kemasan asas.', 'kps', 18.00, 'Tidak termasuk crusher run tebal.', 'slab', 70),
    ('structure_concrete', 'CONC-008', 'Slab tergantung rendah', 'Membina slab konkrit bertetulang tergantung rendah termasuk acuan bawah.', 'kps', 38.00, 'Contoh penutup longkang untuk laluan kereta.', 'slab', 80),
    ('structure_concrete', 'CONC-009', 'Slab tergantung tinggi', 'Membina slab konkrit bertetulang pada aras tinggi termasuk acuan dan sokongan.', 'kps', 55.00, 'Contoh alas tangki atau slab aras atas.', 'slab', 90),
    ('structure_concrete', 'CONC-010', 'Crusher run dan pemadatan', 'Membekal, meratakan dan memadat crusher run sebagai lapisan asas.', 'kps', 4.50, 'Kadar asas bagi ketebalan biasa.', 'slab', 100),
    ('structure_concrete', 'CONC-011', 'Screed lantai', 'Membuat lapisan screed simen pasir untuk aras dan persediaan kemasan lantai.', 'kps', 6.50, 'Ketebalan luar biasa dicaj tambahan.', 'slab', 110),
    ('structure_concrete', 'CONC-012', 'Apron konkrit keliling rumah', 'Membina apron konkrit termasuk persediaan asas dan cerun keluar.', 'kps', 16.00, 'Tidak termasuk longkang baharu.', 'slab', 120),

    ('masonry_plaster', 'WALL-001', 'Ikat bata 4 inci tanpa plaster', 'Membina dinding bata pasir 4 inci termasuk mortar dan susunan lurus.', 'kps', 12.00, 'Plaster dan cat tidak termasuk.', null, 10),
    ('masonry_plaster', 'WALL-002', 'Ikat bata 4 inci dan plaster sebelah', 'Membina dinding bata 4 inci serta plaster pada satu permukaan.', 'kps', 17.00, 'Kemasan skim dan cat tidak termasuk.', null, 20),
    ('masonry_plaster', 'WALL-003', 'Ikat bata 4 inci dan plaster dua belah', 'Membina dinding bata 4 inci serta plaster pada kedua-dua permukaan.', 'kps', 22.00, 'Kemasan skim dan cat tidak termasuk.', null, 30),
    ('masonry_plaster', 'WALL-004', 'Ikat bata 9 inci tanpa plaster', 'Membina dinding bata 9 inci termasuk mortar dan susunan lurus.', 'kps', 18.00, 'Semak keperluan struktur.', null, 40),
    ('masonry_plaster', 'WALL-005', 'Plaster dinding', 'Plaster simen pasir pada permukaan dinding untuk kemasan rata.', 'kps', 6.00, 'Ketebalan luar biasa dicaj tambahan.', null, 50),
    ('masonry_plaster', 'WALL-006', 'Skim coat dinding', 'Kemasan skim coat pada dinding plaster yang telah stabil.', 'kps', 3.00, 'Tidak termasuk pembaikan retak aktif.', null, 60),
    ('masonry_plaster', 'WALL-007', 'Groove line dinding', 'Membentuk garisan groove lurus pada plaster luar atau feature wall.', 'kaki', 6.00, 'Harga mengikut corak dan jumlah garisan.', null, 70),
    ('masonry_plaster', 'WALL-008', 'Pasang batu angin', 'Memasang batu angin termasuk mortar dan kemasan sambungan asas.', 'unit', 65.00, 'Batu angin dibekalkan mengikut pilihan.', null, 80),
    ('masonry_plaster', 'WALL-009', 'Tutup atau baik pulih bukaan', 'Menutup bukaan kecil menggunakan bata, plaster dan kemasan asas.', 'lot', 350.00, 'Saiz bukaan perlu dinyatakan.', null, 90),

    ('floor_tiles', 'TILE-001', 'Pasang mozek lantai sahaja', 'Memasang mozek lantai pada permukaan yang telah sesuai termasuk pelekat atau mortar.', 'kps', 8.00, 'Mozek dan hacking tidak termasuk.', null, 10),
    ('floor_tiles', 'TILE-002', 'Bekal dan pasang mozek lantai standard', 'Membekal dan memasang mozek lantai gred standard termasuk bahan pemasangan.', 'kps', 16.00, 'Elaun harga mozek perlu dinyatakan dalam sebutharga.', null, 20),
    ('floor_tiles', 'TILE-003', 'Pasang mozek atas mozek lama', 'Memasang mozek baharu di atas mozek sedia ada dengan primer dan pelekat sesuai.', 'kps', 10.00, 'Tertakluk kepada keadaan lantai lama.', null, 30),
    ('floor_tiles', 'TILE-004', 'Pasang mozek dinding', 'Memasang mozek pada dinding yang telah rata termasuk bahan pemasangan.', 'kps', 10.00, 'Mozek dan pembaikan plaster tidak termasuk.', null, 40),
    ('floor_tiles', 'TILE-005', 'Bekal dan pasang mozek dinding standard', 'Membekal dan memasang mozek dinding gred standard.', 'kps', 18.00, 'Elaun harga mozek perlu dinyatakan.', null, 50),
    ('floor_tiles', 'TILE-006', 'Skirting mozek', 'Memotong dan memasang skirting mozek pada tepi dinding.', 'kaki', 8.00, 'Ketinggian standard sehingga 4 inci.', null, 60),
    ('floor_tiles', 'TILE-007', 'Waterproofing lantai', 'Menyapu sistem kalis air pada lantai dan upturn dinding sebelum kemasan.', 'kps', 8.00, 'Ujian takungan air digalakkan.', 'bathroom', 70),
    ('floor_tiles', 'TILE-008', 'Bentuk cerun ke floor trap', 'Membentuk screed cerun supaya air mengalir ke floor trap.', 'kps', 7.00, 'Sesuai untuk bilik air dan balkoni.', 'bathroom', 80),
    ('floor_tiles', 'TILE-009', 'Kemasan lantai simen licin', 'Membuat kemasan simen licin pada lantai konkrit yang telah siap.', 'kps', 5.00, 'Tidak termasuk slab baharu.', null, 90),

    ('ceiling', 'CEIL-001', 'Siling kapur rata', 'Membekal dan memasang siling gypsum rata lengkap dengan rangka furring channel.', 'kps', 9.00, 'Cat siling dinyatakan berasingan.', 'ceiling', 10),
    ('ceiling', 'CEIL-002', 'Siling cement board luar', 'Membekal dan memasang cement board pada kaki lima atau kawasan terlindung.', 'kps', 12.00, 'Rangka dan sambungan termasuk.', 'ceiling', 20),
    ('ceiling', 'CEIL-003', 'L-box siling', 'Membina L-box gypsum lurus termasuk rangka dan kemasan sambungan.', 'kaki', 28.00, 'Lampu dan wiring tidak termasuk.', 'ceiling', 30),
    ('ceiling', 'CEIL-004', 'Box-up siling', 'Membina box-up untuk menutup beam, paip atau membentuk feature siling.', 'kaki', 22.00, 'Saiz luar biasa dinilai semula.', 'ceiling', 40),
    ('ceiling', 'CEIL-005', 'Cornice siling', 'Membekal dan memasang cornice gypsum pada pertemuan dinding dan siling.', 'kaki', 6.00, 'Corak premium dicaj tambahan.', 'ceiling', 50),
    ('ceiling', 'CEIL-006', 'Feature siling melengkung', 'Membina feature gypsum melengkung termasuk rangka dan kemasan.', 'kaki', 38.00, 'Harga mengikut radius dan reka bentuk.', 'ceiling', 60),
    ('ceiling', 'CEIL-007', 'Access panel siling', 'Membekal dan memasang panel akses untuk servis di atas siling.', 'unit', 150.00, 'Saiz standard kediaman.', 'ceiling', 70),
    ('ceiling', 'CEIL-008', 'Baik pulih siling rosak', 'Memotong bahagian rosak, mengganti papan dan membuat kemasan sambungan.', 'lot', 350.00, 'Keluasan dan punca kebocoran dinilai dahulu.', 'ceiling', 80),
    ('ceiling', 'CEIL-009', 'Cat siling putih dua lapis', 'Menyediakan permukaan dan mengecat siling putih dua lapis.', 'kps', 1.80, 'Primer tambahan jika perlu.', 'painting', 90),

    ('roof_awning', 'ROOF-001', 'Bumbung metal deck G28 dan rangka C-channel', 'Membekal dan memasang bumbung metal deck G28 lengkap dengan rangka C-channel.', 'kps', 28.00, 'Reka bentuk dan ketinggian mempengaruhi harga.', 'roof', 10),
    ('roof_awning', 'ROOF-002', 'Tukar metal deck pada rangka sedia ada', 'Menanggalkan kepingan lama dan memasang metal deck baharu pada rangka yang masih baik.', 'kps', 15.00, 'Pembaikan rangka tidak termasuk.', 'roof', 20),
    ('roof_awning', 'ROOF-003', 'Penebat aluminium foil bumbung', 'Membekal dan memasang lapisan penebat aluminium foil di bawah bumbung.', 'kps', 3.50, 'Dipasang bersama kerja bumbung.', 'roof', 30),
    ('roof_awning', 'ROOF-004', 'Rabung metal deck', 'Membekal dan memasang penutup rabung lengkap dengan skru dan sealant.', 'kaki', 20.00, 'Profil standard metal deck.', 'roof', 40),
    ('roof_awning', 'ROOF-005', 'Flashing bumbung', 'Membekal dan memasang flashing pada sambungan bumbung dengan dinding.', 'kaki', 18.00, 'Sealant dan skru termasuk.', 'roof', 50),
    ('roof_awning', 'ROOF-006', 'Gutter terbuka', 'Membekal dan memasang gutter metal atau uPVC terbuka bersama bracket.', 'kaki', 28.00, 'Downpipe dikira berasingan.', 'roof', 60),
    ('roof_awning', 'ROOF-007', 'Hidden gutter', 'Membina dan memasang hidden gutter lengkap dengan lapisan kalis air dan outlet.', 'kaki', 55.00, 'Saiz, akses dan kemasan fascia perlu disahkan.', 'roof', 70),
    ('roof_awning', 'ROOF-008', 'Downpipe air hujan', 'Membekal dan memasang paip turun air hujan lengkap dengan klip.', 'kaki', 18.00, 'Outlet dan sambungan longkang dinyatakan berasingan.', 'plumbing', 80),
    ('roof_awning', 'ROOF-009', 'Awning metal deck', 'Membekal dan memasang awning metal deck lengkap dengan rangka besi.', 'kps', 30.00, 'Tiang dan gutter dinyatakan mengikut reka bentuk.', 'awning', 90),
    ('roof_awning', 'ROOF-010', 'Awning ACP', 'Membekal dan memasang awning kemasan ACP lengkap dengan rangka besi.', 'kps', 48.00, 'Hidden gutter dan lampu tidak termasuk.', 'awning', 100),
    ('roof_awning', 'ROOF-011', 'Awning polycarbonate', 'Membekal dan memasang kepingan polycarbonate lengkap dengan rangka.', 'kps', 38.00, 'Jenis dan ketebalan kepingan perlu dipilih.', 'awning', 110),
    ('roof_awning', 'ROOF-012', 'Fascia board Shera plank', 'Membekal dan memasang fascia board Shera plank termasuk rangka sokongan asas.', 'kaki', 22.00, 'Cat akhir boleh dinyatakan berasingan.', 'roof', 120),
    ('roof_awning', 'ROOF-013', 'Baik pulih kebocoran bumbung', 'Pemeriksaan dan pembaikan setempat pada skru, flashing atau sambungan bumbung.', 'lot', 450.00, 'Harga selepas lokasi punca dikenal pasti.', 'roof', 130),

    ('doors_windows', 'OPEN-001', 'Pintu HDF lengkap', 'Membekal dan memasang pintu HDF bersama frame, engsel dan kunci standard.', 'unit', 550.00, 'Saiz pintu standard.', 'door_window', 10),
    ('doors_windows', 'OPEN-002', 'Pintu kayu solid satu daun', 'Membekal dan memasang pintu kayu solid gred B bersama frame dan aksesori asas.', 'unit', 950.00, 'Kemasan dan corak mempengaruhi harga.', 'door_window', 20),
    ('doors_windows', 'OPEN-003', 'Pintu kayu solid dua daun', 'Membekal dan memasang pintu kayu solid dua daun bersama frame dan aksesori.', 'unit', 1800.00, 'Lebar bukaan perlu disahkan.', 'door_window', 30),
    ('doors_windows', 'OPEN-004', 'Pintu bifold bilik air', 'Membekal dan memasang pintu bifold PVC atau aluminium standard.', 'unit', 450.00, 'Saiz dan warna standard.', 'door_window', 40),
    ('doors_windows', 'OPEN-005', 'Sliding door kaca dua daun', 'Membekal dan memasang pintu gelangsar aluminium berkaca dua daun.', 'unit', 1800.00, 'Kaca dan saiz bukaan mempengaruhi harga.', 'door_window', 50),
    ('doors_windows', 'OPEN-006', 'Tingkap aluminium 4 x 4 kaki', 'Membekal dan memasang tingkap aluminium berkaca saiz kira-kira 4 x 4 kaki.', 'unit', 1200.00, 'Jenis bukaan dan kaca perlu dipilih.', 'door_window', 60),
    ('doors_windows', 'OPEN-007', 'Tingkap aluminium 6 x 4 kaki', 'Membekal dan memasang tingkap aluminium berkaca saiz kira-kira 6 x 4 kaki.', 'unit', 1800.00, 'Jenis bukaan dan kaca perlu dipilih.', 'door_window', 70),
    ('doors_windows', 'OPEN-008', 'Tingkap top hung 18 inci x 2 kaki', 'Membekal dan memasang tingkap aluminium top hung berkaca.', 'unit', 350.00, 'Sesuai untuk bilik air.', 'door_window', 80),
    ('doors_windows', 'OPEN-009', 'Window coping', 'Membina coping konkrit dan plaster pada bahagian luar bawah tingkap.', 'kaki', 40.00, 'Kemasan cat tidak termasuk.', 'door_window', 90),
    ('doors_windows', 'OPEN-010', 'Grille tingkap mild steel', 'Membekal, membuat dan memasang grille mild steel dengan kemasan cat asas.', 'kps', 18.00, 'Corak dan ketebalan besi mempengaruhi harga.', 'door_window', 100),
    ('doors_windows', 'OPEN-011', 'Tukar set kunci pintu', 'Membekal dan memasang set tombol atau lever lock standard.', 'unit', 120.00, 'Kunci premium dicaj mengikut model.', 'door_window', 110),

    ('electrical', 'ELEC-001', 'Point lampu baharu', 'Pendawaian point lampu lengkap dengan suis dan sambungan ke litar sesuai.', 'point', 90.00, 'Aksesori lampu tidak termasuk.', 'electrical', 10),
    ('electrical', 'ELEC-002', 'Bekal dan pasang downlight', 'Membekal dan memasang downlight LED standard pada point sedia ada.', 'unit', 65.00, 'Saiz dan watt standard.', 'electrical', 20),
    ('electrical', 'ELEC-003', 'Point kipas baharu', 'Pendawaian point kipas lengkap dengan suis dan hook sokongan.', 'point', 120.00, 'Kipas tidak termasuk.', 'electrical', 30),
    ('electrical', 'ELEC-004', 'Plug point 13A baharu', 'Pendawaian plug point 13A baharu lengkap dengan soket dan sambungan litar.', 'point', 150.00, 'Jarak jauh atau concealed berat dinilai semula.', 'electrical', 40),
    ('electrical', 'ELEC-005', 'Tambahan plug point secara looping', 'Menambah plug point melalui looping daripada point sesuai yang berhampiran.', 'point', 120.00, 'Tertakluk kepada kapasiti litar.', 'electrical', 50),
    ('electrical', 'ELEC-006', 'Point pemanas air', 'Pendawaian khusus pemanas air lengkap dengan suis dua kutub.', 'point', 280.00, 'Aksesori pemanas air tidak termasuk.', 'electrical', 60),
    ('electrical', 'ELEC-007', 'Point penghawa dingin', 'Pendawaian khusus penghawa dingin lengkap dengan isolator.', 'point', 280.00, 'Saiz kabel mengikut kapasiti unit.', 'electrical', 70),
    ('electrical', 'ELEC-008', 'Point exhaust fan', 'Pendawaian dan suis untuk exhaust fan di lokasi yang dipersetujui.', 'point', 150.00, 'Exhaust fan tidak termasuk.', 'electrical', 80),
    ('electrical', 'ELEC-009', 'Sub distribution board', 'Membekal dan memasang sub DB asas lengkap dengan perlindungan litar yang sesuai.', 'unit', 850.00, 'Bilangan litar dan feeder perlu disahkan.', 'electrical', 90),
    ('electrical', 'ELEC-010', 'Tukar MCB', 'Membekal dan mengganti satu unit MCB mengikut rating litar.', 'unit', 80.00, 'Punca trip perlu diperiksa dahulu.', 'electrical', 100),
    ('electrical', 'ELEC-011', 'Tukar RCCB', 'Membekal dan mengganti RCCB dengan rating dan sensitiviti yang sesuai.', 'unit', 220.00, 'Ujian kebocoran litar tidak termasuk.', 'electrical', 110),
    ('electrical', 'ELEC-012', 'LED strip lengkap', 'Membekal dan memasang LED strip bersama profil atau diffuser serta driver.', 'kaki', 18.00, 'Point kuasa dan kawalan boleh dikira berasingan.', 'electrical', 120),

    ('plumbing_sanitary', 'PLMB-001', 'Point air bersih sejuk', 'Membuat point paip air bersih sejuk lengkap dengan sambungan dan ujian kebocoran.', 'point', 180.00, 'Aksesori hujung tidak termasuk.', 'plumbing', 10),
    ('plumbing_sanitary', 'PLMB-002', 'Point air panas', 'Membuat point paip air panas menggunakan paip yang sesuai.', 'point', 220.00, 'Pemanas air tidak termasuk.', 'plumbing', 20),
    ('plumbing_sanitary', 'PLMB-003', 'Point sinki dapur', 'Membuat point air dan saliran untuk sinki dapur.', 'point', 250.00, 'Sinki dan paip pili tidak termasuk.', 'plumbing', 30),
    ('plumbing_sanitary', 'PLMB-004', 'Point paip kumbahan', 'Membuat point paip kumbahan dan menyambung ke saliran utama yang sesuai.', 'point', 350.00, 'Jarak dan korekan luar biasa dinilai semula.', 'plumbing', 40),
    ('plumbing_sanitary', 'PLMB-005', 'Floor trap lengkap', 'Membekal dan memasang floor trap termasuk sambungan paip saliran.', 'unit', 180.00, 'Waterproofing dan mozek dikira berasingan.', 'plumbing', 50),
    ('plumbing_sanitary', 'PLMB-006', 'Paip air exposed', 'Membekal dan memasang paip air pada permukaan lengkap dengan klip.', 'kaki', 25.00, 'Saiz paip standard kediaman.', 'plumbing', 60),
    ('plumbing_sanitary', 'PLMB-007', 'Paip air concealed', 'Membekal dan menanam paip air dalam dinding termasuk tampalan kasar.', 'kaki', 45.00, 'Kemasan mozek atau cat dikira berasingan.', 'plumbing', 70),
    ('plumbing_sanitary', 'PLMB-008', 'Mainhole kumbahan', 'Membina mainhole kecil lengkap dengan sambungan paip dan penutup.', 'unit', 650.00, 'Saiz dan kedalaman perlu disahkan.', 'plumbing', 80),
    ('plumbing_sanitary', 'PLMB-009', 'Tangki air poly lengkap', 'Membekal dan memasang tangki air poly standard bersama sambungan asas.', 'unit', 950.00, 'Platform dan pam dikira berasingan.', 'plumbing', 90),
    ('plumbing_sanitary', 'PLMB-010', 'Pam air domestik', 'Membekal dan memasang pam air domestik bersama sambungan asas.', 'unit', 650.00, 'Model dan kapasiti mempengaruhi harga.', 'plumbing', 100),
    ('plumbing_sanitary', 'PLMB-011', 'Pasang mangkuk tandas', 'Memasang mangkuk tandas pada point sedia ada termasuk seal dan ujian.', 'unit', 250.00, 'Mangkuk tandas tidak termasuk.', 'bathroom', 110),
    ('plumbing_sanitary', 'PLMB-012', 'Pasang basin atau sinki', 'Memasang basin atau sinki pada point sedia ada termasuk sambungan asas.', 'unit', 180.00, 'Aksesori dan kabinet tidak termasuk.', 'plumbing', 120),

    ('kitchen_tabletop', 'KITCH-001', 'Tabletop konkrit kemasan mozek', 'Membina tabletop konkrit siap mozek termasuk backsplash setinggi 2 kaki.', 'kaki', 230.00, 'Harga standard pengguna; bentuk dan aksesori disahkan di tapak.', 'tabletop', 10),
    ('kitchen_tabletop', 'KITCH-002', 'Tambahan bucu mitre joint', 'Membuat kemasan bucu mozek menggunakan mitre joint pada muka tabletop.', 'kaki', 10.00, 'Tambahan kepada kadar tabletop standard.', 'tabletop', 20),
    ('kitchen_tabletop', 'KITCH-003', 'Tambahan L-profile stainless steel', 'Memasang L-profile stainless steel warna gold, bronze atau silver pada bucu tabletop.', 'kaki', 10.00, 'Tambahan kepada kadar tabletop standard.', 'tabletop', 30),
    ('kitchen_tabletop', 'KITCH-004', 'Backsplash mozek sahaja', 'Menyediakan permukaan dan memasang mozek backsplash dapur.', 'kps', 20.00, 'Mozek standard; hacking dikira berasingan.', 'tabletop', 40),
    ('kitchen_tabletop', 'KITCH-005', 'Platform konkrit bawah kabinet', 'Membina platform konkrit rendah dengan kemasan mozek untuk kabinet bawah.', 'kaki', 45.00, 'Lebar standard kabinet dapur.', 'tabletop', 50),
    ('kitchen_tabletop', 'KITCH-006', 'Lubang sinki tanam', 'Menyediakan bukaan dan kemasan untuk sinki tanam pada tabletop konkrit.', 'unit', 80.00, 'Sinki dan paip tidak termasuk.', 'tabletop', 60),
    ('kitchen_tabletop', 'KITCH-007', 'Lubang dapur gas tanam', 'Menyediakan bukaan dan kemasan untuk hob atau dapur gas tanam.', 'unit', 80.00, 'Saiz peralatan perlu diberi sebelum kerja.', 'tabletop', 70),
    ('kitchen_tabletop', 'KITCH-008', 'Pasang sinki dapur dan paip pili', 'Memasang sinki dan paip pili pada point sedia ada termasuk seal.', 'unit', 220.00, 'Sinki dan paip pili tidak termasuk.', 'tabletop', 80),
    ('kitchen_tabletop', 'KITCH-009', 'Kabinet bawah aluminium', 'Membekal dan memasang kabinet bawah aluminium mengikut susun atur dipersetujui.', 'kaki', 450.00, 'Aksesori dalaman premium tidak termasuk.', 'tabletop', 90),
    ('kitchen_tabletop', 'KITCH-010', 'Kabinet dinding aluminium', 'Membekal dan memasang kabinet dinding aluminium mengikut susun atur dipersetujui.', 'kaki', 380.00, 'Ketinggian dan aksesori mempengaruhi harga.', 'tabletop', 100),

    ('bathroom', 'BATH-001', 'Pakej ubah suai bilik air asas', 'Ubah suai asas satu bilik air termasuk hacking, waterproofing, mozek standard dan pemasangan sanitari asas.', 'unit', 8500.00, 'Skop akhir perlu dipecahkan dalam sebutharga.', 'bathroom', 10),
    ('bathroom', 'BATH-002', 'Waterproofing bilik air', 'Sistem kalis air lantai dan upturn dinding lengkap dengan ujian takungan.', 'kps', 9.00, 'Baik pulih struktur tidak termasuk.', 'bathroom', 20),
    ('bathroom', 'BATH-003', 'Mozek lantai bilik air lengkap', 'Membekal dan memasang mozek lantai anti-gelincir standard termasuk cerun.', 'kps', 20.00, 'Hacking dan waterproofing dikira berasingan.', 'bathroom', 30),
    ('bathroom', 'BATH-004', 'Mozek dinding bilik air lengkap', 'Membekal dan memasang mozek dinding standard pada permukaan yang sesuai.', 'kps', 20.00, 'Hacking dan plaster pembaikan dikira berasingan.', 'bathroom', 40),
    ('bathroom', 'BATH-005', 'Set paip dalaman bilik air', 'Membuat semula paip air dan saliran asas untuk satu bilik air.', 'lot', 1200.00, 'Bilangan point dan jarak perlu disahkan.', 'bathroom', 50),
    ('bathroom', 'BATH-006', 'Pasang set pancuran', 'Memasang shower set pada point air sedia ada termasuk ujian.', 'unit', 150.00, 'Shower set tidak termasuk.', 'bathroom', 60),
    ('bathroom', 'BATH-007', 'Pasang aksesori tandas', 'Memasang cermin, rak, towel bar dan aksesori ringan untuk satu bilik air.', 'lot', 180.00, 'Aksesori tidak termasuk.', 'bathroom', 70),
    ('bathroom', 'BATH-008', 'Shower screen kaca', 'Membekal dan memasang shower screen kaca tempered standard.', 'unit', 1200.00, 'Saiz dan jenis pintu mempengaruhi harga.', 'bathroom', 80),
    ('bathroom', 'BATH-009', 'Bina kerb kawasan mandi', 'Membina kerb rendah dan membuat kemasan mozek pada sempadan kawasan mandi.', 'kaki', 45.00, 'Waterproofing perlu disambungkan dengan betul.', 'bathroom', 90),

    ('painting_finishes', 'PAINT-001', 'Cat dinding dalaman dua lapis', 'Menyediakan permukaan ringan dan mengecat dinding dalaman dua lapis.', 'kps', 1.80, 'Pembaikan retak dan primer berat tidak termasuk.', 'painting', 10),
    ('painting_finishes', 'PAINT-002', 'Cat dinding luar dua lapis', 'Menyediakan permukaan ringan dan mengecat dinding luar dua lapis cat cuaca.', 'kps', 2.30, 'Perancah tinggi dinilai berasingan.', 'painting', 20),
    ('painting_finishes', 'PAINT-003', 'Lapisan primer atau sealer', 'Menyapu satu lapisan primer atau sealer yang sesuai sebelum cat akhir.', 'kps', 0.90, 'Jenis primer mengikut keadaan permukaan.', 'painting', 30),
    ('painting_finishes', 'PAINT-004', 'Cat tekstur feature wall', 'Membuat kemasan cat tekstur pada feature wall mengikut sampel dipersetujui.', 'kps', 6.00, 'Corak dan produk premium mempengaruhi harga.', 'painting', 40),
    ('painting_finishes', 'PAINT-005', 'Cat kalis air dinding luar', 'Menyapu sistem coating kalis air pada dinding luar yang telah disediakan.', 'kps', 4.50, 'Punca retak aktif perlu dibaiki dahulu.', 'painting', 50),
    ('painting_finishes', 'PAINT-006', 'Cat besi', 'Membersih, menyapu primer antikarat dan cat kemasan pada permukaan besi.', 'kps', 5.00, 'Karat berat atau sandblasting tidak termasuk.', 'painting', 60),
    ('painting_finishes', 'PAINT-007', 'Cat pintu atau kayu', 'Menyediakan permukaan dan mengecat atau varnish satu unit pintu kayu.', 'unit', 180.00, 'Kerosakan kayu dibaiki berasingan.', 'painting', 70),
    ('painting_finishes', 'PAINT-008', 'Baik pulih retak rambut', 'Membuka, mengisi dan mengemas retak rambut sebelum cat sentuh.', 'kaki', 8.00, 'Tidak sesuai untuk retak struktur aktif.', 'painting', 80),

    ('porch_external', 'PORCH-001', 'Mozek lantai porch lengkap', 'Membekal dan memasang mozek lantai porch standard termasuk mortar.', 'kps', 18.00, 'Slab, hacking dan cerun berat tidak termasuk.', 'porch', 10),
    ('porch_external', 'PORCH-002', 'Lantai concrete imprint', 'Membina kemasan concrete imprint termasuk warna dan corak standard.', 'kps', 20.00, 'Slab asas dinilai berasingan jika belum ada.', 'porch', 20),
    ('porch_external', 'PORCH-003', 'Slab laluan kereta 4 inci', 'Membina slab konkrit 4 inci dengan BRC dan kemasan sesuai untuk kenderaan ringan.', 'kps', 20.00, 'Crusher run dan keadaan tanah perlu disahkan.', 'slab', 30),
    ('porch_external', 'PORCH-004', 'Slab penutup longkang kereta', 'Membina slab konkrit bertetulang rendah untuk menutup longkang dan menanggung kereta.', 'kps', 38.00, 'Lebar longkang dan sokongan perlu diukur.', 'slab', 40),
    ('porch_external', 'PORCH-005', 'Tiang porch plaster', 'Membina tiang konkrit atau bata untuk porch termasuk plaster asas.', 'unit', 950.00, 'Saiz, tinggi dan footing perlu disahkan.', 'porch', 50),
    ('porch_external', 'PORCH-006', 'Longkang konkrit kecil', 'Membina longkang konkrit kecil lengkap dengan cerun aliran.', 'kaki', 55.00, 'Saiz standard kediaman.', 'porch', 60),
    ('porch_external', 'PORCH-007', 'Pasang grass block', 'Membekal dan memasang grass block pada lapisan asas yang dipadatkan.', 'kps', 18.00, 'Tanah dan rumput tidak termasuk.', 'porch', 70),
    ('porch_external', 'PORCH-008', 'Kerb konkrit luar', 'Membina kerb konkrit untuk sempadan laluan, landskap atau aras tanah.', 'kaki', 28.00, 'Saiz standard kediaman.', 'porch', 80),

    ('fence_gate', 'FENCE-001', 'Dinding pagar bata 4 inci tanpa plaster', 'Membina dinding pagar bata 4 inci termasuk mortar.', 'kps', 12.00, 'Footing, tiang dan kemasan tidak termasuk.', 'fence_gate', 10),
    ('fence_gate', 'FENCE-002', 'Dinding pagar bata plaster dua belah', 'Membina dinding pagar bata 4 inci dan plaster pada kedua-dua belah.', 'kps', 22.00, 'Footing, tiang dan cat tidak termasuk.', 'fence_gate', 20),
    ('fence_gate', 'FENCE-003', 'Tiang pagar konkrit', 'Membina tiang pagar konkrit bertetulang lengkap dengan footing asas.', 'unit', 650.00, 'Saiz dan ketinggian perlu disahkan.', 'fence_gate', 30),
    ('fence_gate', 'FENCE-004', 'Coping atas pagar', 'Membina coping konkrit dan plaster pada bahagian atas dinding pagar.', 'kaki', 45.00, 'Kemasan khas dikira berasingan.', 'fence_gate', 40),
    ('fence_gate', 'FENCE-005', 'Pintu pagar mild steel', 'Membuat dan memasang pintu pagar mild steel lengkap dengan cat asas.', 'kps', 45.00, 'Corak, ketebalan dan sistem bukaan mempengaruhi harga.', 'fence_gate', 50),
    ('fence_gate', 'FENCE-006', 'Pintu pagar aluminium', 'Membuat dan memasang pintu pagar aluminium dengan kemasan standard.', 'kps', 68.00, 'Corak dan ketebalan profil mempengaruhi harga.', 'fence_gate', 60),
    ('fence_gate', 'FENCE-007', 'Set autogate', 'Membekal dan memasang set motor autogate asas lengkap dengan alat kawalan.', 'set', 2500.00, 'Pendawaian dan model premium boleh berbeza.', 'fence_gate', 70),
    ('fence_gate', 'FENCE-008', 'Pagar BRC', 'Membekal dan memasang pagar BRC bersama tiang dan aksesori standard.', 'kaki', 30.00, 'Ketinggian dan footing mempengaruhi harga.', 'fence_gate', 80),
    ('fence_gate', 'FENCE-009', 'Buka pintu pagar lama', 'Menanggalkan pintu pagar lama secara terkawal dan mengumpulkan sisa.', 'unit', 250.00, 'Pelupusan keluar tapak dikira berasingan.', 'fence_gate', 90)
)
insert into public.system_catalog_items (
  category_id, code, name_ms, description_ms, unit, default_rate,
  price_note_ms, guide_key, sort_order
)
select
  category.id,
  seed.code,
  seed.name_ms,
  seed.description_ms,
  seed.unit,
  seed.default_rate,
  seed.price_note_ms,
  seed.guide_key,
  seed.sort_order
from seed
join public.system_catalog_categories as category
  on category.code = seed.category_code
on conflict (code) do update set
  category_id = excluded.category_id,
  name_ms = excluded.name_ms,
  description_ms = excluded.description_ms,
  unit = excluded.unit,
  default_rate = excluded.default_rate,
  price_note_ms = excluded.price_note_ms,
  guide_key = excluded.guide_key,
  sort_order = excluded.sort_order,
  is_active = true;

create or replace function private.seed_company_catalog()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.company_catalog_categories (
    company_id, owner_user_id, source_category_id, name, sort_order
  )
  select
    new.id, new.owner_user_id, category.id, category.name_ms, category.sort_order
  from public.system_catalog_categories as category
  where category.is_active
  on conflict (company_id, source_category_id) do nothing;

  insert into public.company_catalog_items (
    company_id, owner_user_id, category_id, source_item_id,
    imported_master_version, code, name, description, unit, rate,
    price_note, guide_key, sort_order
  )
  select
    new.id,
    new.owner_user_id,
    company_category.id,
    master_item.id,
    master_item.version,
    master_item.code,
    master_item.name_ms,
    master_item.description_ms,
    master_item.unit,
    master_item.default_rate,
    master_item.price_note_ms,
    master_item.guide_key,
    master_item.sort_order
  from public.system_catalog_items as master_item
  join public.company_catalog_categories as company_category
    on company_category.company_id = new.id
   and company_category.owner_user_id = new.owner_user_id
   and company_category.source_category_id = master_item.category_id
  where master_item.is_active
  on conflict (company_id, source_item_id) do nothing;

  return new;
end;
$$;

revoke all on function private.seed_company_catalog() from public, anon, authenticated;

-- Backfill the two test/owner companies that already completed their profile.
insert into public.company_catalog_categories (
  company_id, owner_user_id, source_category_id, name, sort_order
)
select
  company.id,
  company.owner_user_id,
  category.id,
  category.name_ms,
  category.sort_order
from public.companies as company
cross join public.system_catalog_categories as category
where category.is_active
on conflict (company_id, source_category_id) do nothing;

insert into public.company_catalog_items (
  company_id, owner_user_id, category_id, source_item_id,
  imported_master_version, code, name, description, unit, rate,
  price_note, guide_key, sort_order
)
select
  company.id,
  company.owner_user_id,
  company_category.id,
  master_item.id,
  master_item.version,
  master_item.code,
  master_item.name_ms,
  master_item.description_ms,
  master_item.unit,
  master_item.default_rate,
  master_item.price_note_ms,
  master_item.guide_key,
  master_item.sort_order
from public.companies as company
join public.company_catalog_categories as company_category
  on company_category.company_id = company.id
 and company_category.owner_user_id = company.owner_user_id
join public.system_catalog_items as master_item
  on master_item.category_id = company_category.source_category_id
where master_item.is_active
on conflict (company_id, source_item_id) do nothing;

create trigger companies_seed_catalog_after_insert
after insert on public.companies
for each row execute function private.seed_company_catalog();

commit;
