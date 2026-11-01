create table if not exists public.tugas (
  id                   bigint generated always as identity primary key,
  nama_tugas           text        not null,
  tanggal_pengumpulan  date        not null,
  jam_pengumpulan      time        not null,
  detail_tugas         text        default '',
  link_drive           text,
  status               text        not null default 'Terkumpul',
  created_at           timestamptz not null default now()
);

-- Kolom baru untuk file Word / PDF (data lama tetap utuh, kolom baru berisi kosong)
alter table public.tugas add column if not exists file_url  text;   -- alamat publik file
alter table public.tugas add column if not exists file_nama text;   -- nama asli file
alter table public.tugas add column if not exists file_path text;   -- lokasi file di Storage

-- Link Drive sekarang boleh kosong (karena bisa mengumpulkan lewat file saja)
alter table public.tugas alter column link_drive drop not null;

-- =========================================================
-- 2. TABEL "materi"  (diisi lewat Table Editor Supabase)
-- =========================================================
create table if not exists public.materi (
  id           bigint generated always as identity primary key,
  bab          text        not null,          -- contoh: Bab 1
  judul        text        not null,          -- contoh: Pengantar Rekayasa Perangkat Lunak
  deskripsi    text        default '',        -- keterangan singkat
  link_materi  text,                          -- link Drive / PDF materi (boleh kosong)
  urutan       int         not null default 0,-- angka kecil tampil lebih dulu
  created_at   timestamptz not null default now()
);

-- Kolom baru v3: file materi (PDF / Word / PPT) yang diunggah dari website
alter table public.materi add column if not exists file_url  text;
alter table public.materi add column if not exists file_nama text;
alter table public.materi add column if not exists file_path text;

-- =========================================================
-- 3. ROW LEVEL SECURITY (RLS) + IZIN AKSES
-- =========================================================
alter table public.tugas  enable row level security;
alter table public.materi enable row level security;

grant usage on schema public to anon;
grant select, insert on public.tugas  to anon;   -- pengunjung boleh lihat & tambah tugas
grant select, insert on public.materi to anon;   -- pengunjung boleh lihat & tambah materi

-- tugas: baca & tambah (tidak ada ubah/hapus lewat website)
drop policy if exists "tugas_select_anon" on public.tugas;
create policy "tugas_select_anon"
  on public.tugas for select to anon using (true);

drop policy if exists "tugas_insert_anon" on public.tugas;
create policy "tugas_insert_anon"
  on public.tugas for insert to anon with check (true);

-- materi: baca & tambah (tidak ada ubah/hapus lewat website;
-- mengubah atau menghapus materi dilakukan dari Table Editor Supabase)
drop policy if exists "materi_select_anon" on public.materi;
create policy "materi_select_anon"
  on public.materi for select to anon using (true);

drop policy if exists "materi_insert_anon" on public.materi;
create policy "materi_insert_anon"
  on public.materi for insert to anon with check (true);

-- =========================================================
-- 4. STORAGE: bucket "file-tugas" untuk dokumen Word / PDF
--    Maksimal 10 MB per file, hanya PDF / DOC / DOCX / PPT / PPTX.
-- =========================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'file-tugas',
  'file-tugas',
  true,
  10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Pengunjung boleh mengunggah ke bucket ini (tidak boleh hapus/ubah)
drop policy if exists "file_tugas_upload_anon" on storage.objects;
create policy "file_tugas_upload_anon"
  on storage.objects for insert to anon
  with check (bucket_id = 'file-tugas');

-- =========================================================
-- 4b. FOLDER MATA KULIAH (baru di v4)
--     Kode mata kuliah:
--       adpl  = Analisis dan Desain PL
--       pbp   = Pemrograman Berbasis Platform
--       tti   = Tata Tulis Ilmiah (Metodologi Penelitian)
--       mpti  = Manajemen Proyek Teknologi Informasi
--       aik4  = AIK 4 (Islam dan Ilmu Pengetahuan)
--       npt   = Network Penetration Testing
--       csam  = Cyber Security Analysis & Method
--       imk   = Interaksi Manusia & Komputer
-- =========================================================
alter table public.tugas  add column if not exists mata_kuliah text;
alter table public.tugas  add column if not exists kategori    text;
alter table public.materi add column if not exists mata_kuliah text;

-- Data lama masuk ke folder Analisis dan Desain PL
update public.tugas  set mata_kuliah = 'adpl'          where mata_kuliah is null;
update public.tugas  set kategori    = 'tugas_mandiri' where kategori    is null;
update public.materi set mata_kuliah = 'adpl'          where mata_kuliah is null;

-- Nilai default untuk baris baru
alter table public.tugas  alter column mata_kuliah set default 'adpl';
alter table public.tugas  alter column kategori    set default 'tugas_mandiri';
alter table public.materi alter column mata_kuliah set default 'adpl';

-- Batasi nilai yang diizinkan (aman dijalankan berulang)
do $$
begin
  begin
    alter table public.tugas add constraint tugas_mk_chk
      check (mata_kuliah in ('adpl','pbp','tti','mpti','aik4','npt','csam','imk'));
  exception when duplicate_object then null;
  end;
  begin
    alter table public.tugas add constraint tugas_kategori_chk
      check (kategori in ('tugas_mandiri','tugas_kelompok','uts','uas'));
  exception when duplicate_object then null;
  end;
  begin
    alter table public.materi add constraint materi_mk_chk
      check (mata_kuliah in ('adpl','pbp','tti','mpti','aik4','npt','csam','imk'));
  exception when duplicate_object then null;
  end;
end $$;

create index if not exists tugas_folder_idx  on public.tugas  (mata_kuliah, kategori, created_at desc);
create index if not exists materi_folder_idx on public.materi (mata_kuliah, urutan);

-- =========================================================
-- 5. REALTIME (opsional) - aman walau sudah pernah diaktifkan
-- =========================================================
do $$
begin
  begin
    alter publication supabase_realtime add table public.tugas;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.materi;
  exception when duplicate_object then null;
  end;
end $$;
