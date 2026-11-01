# Website Nadhiya — Portal Tugas & Materi dan Sistem Informasi Cyber Security

<p align="center">
  <strong>Proyek Analisis dan Desain Perangkat Lunak (ADPL)</strong><br>
  Program Studi S1 Teknik Informatika<br>
  Universitas Muhammadiyah Cirebon
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Project-ADPL-800000?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Frontend-HTML%20%7C%20CSS%20%7C%20JavaScript-orange?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Backend-Supabase-3ECF8E?style=for-the-badge" />
</p>

## Tentang Proyek

**Website Nadhiya** merupakan proyek pengembangan dua aplikasi berbasis web yang dikembangkan menggunakan HTML, CSS, dan JavaScript dengan Supabase sebagai backend dan database.

Proyek ini terdiri dari dua sistem yang memiliki fungsi berbeda, yaitu portal pengelolaan tugas dan materi perkuliahan serta sistem informasi keamanan siber untuk Toko Nadhiya Photocopy.

### Identitas Pengembang

| Informasi | Keterangan |
|---|---|
| Nama | Nadhiya Auliyah Ramadhani |
| NIM | 240511160 |
| Kelas | TI24D |
| Program Studi | S1 Teknik Informatika |
| Fakultas | Fakultas Teknik |
| Universitas | Universitas Muhammadiyah Cirebon |
| Tahun | 2026 |

---

## Daftar Aplikasi

| No. | Nama Aplikasi | Folder | Fungsi |
|---|---|---|---|
| 1 | Portal Tugas & Materi | `website-tugas-materi/` | Pengelolaan tugas dan materi untuk delapan mata kuliah. |
| 2 | Sistem Informasi Cyber Security | `website-project-sistem/` | Monitoring keamanan siber untuk Toko Nadhiya Photocopy. |

## Teknologi yang Digunakan

- **HTML5** — Struktur halaman website.
- **CSS3** — Desain dan tampilan antarmuka.
- **JavaScript** — Interaksi dan logika aplikasi.
- **Supabase** — Database PostgreSQL, Authentication, MFA, Storage, Realtime, dan Edge Functions.
- **Supabase JS v2** — Integrasi Supabase melalui CDN.
- **Git & GitHub** — Pengelolaan versi dan penyimpanan source code.
- **Visual Studio Code** — Lingkungan pengembangan.

---

# 1. Portal Tugas & Materi

Portal Tugas & Materi merupakan aplikasi berbasis web untuk mengelola tugas, materi pembelajaran, dan dokumen perkuliahan dalam satu tempat.

### Fitur Utama

- Pengelolaan delapan mata kuliah.
- Pengelompokan folder Materi, Tugas, UTS, dan UAS.
- Pembagian tugas menjadi Tugas Mandiri dan Tugas Kelompok.
- Pengumpulan tugas melalui unggahan dokumen atau tautan Google Drive.
- Unggah dokumen Word dan PDF dengan batas maksimal 10 MB.
- Penambahan materi berupa PDF, Word, PPT, maupun tautan.
- Pencatatan waktu pengumpulan secara langsung.
- Tampilan waktu pengumpulan yang diperbarui otomatis.
- Profil mahasiswa.
- Status koneksi Supabase.
- Pembaruan data secara realtime.

### Struktur Pengelolaan Mata Kuliah

Setiap mata kuliah memiliki kategori pengelolaan tersendiri agar data tidak tercampur.

```text
Mata Kuliah
├── Materi
├── Tugas
│   ├── Tugas Mandiri
│   └── Tugas Kelompok
├── UTS
└── UAS
```

### Konfigurasi Dosen

Data dosen pengampu dapat disesuaikan melalui array `COURSES` pada:

`website-tugas-materi/js/script.js`

Saat ini, informasi dosen yang telah diisi adalah ADPL (Bu Dian Novianti, M.Kom.).

### Konfigurasi Database

Jalankan file berikut melalui Supabase SQL Editor:

`supabase-setup-v4.sql`

Langkah:
1. Buka dashboard Supabase.
2. Pilih project yang digunakan.
3. Masuk ke SQL Editor.
4. Tempel isi file SQL.
5. Klik Run.

**Catatan keamanan:** Portal ini belum menggunakan autentikasi pengguna. Pengguna yang memiliki akses ke website dapat menambahkan tugas, materi, dan mengunggah file sesuai kebijakan Storage yang diterapkan.

---

# 2. Sistem Informasi Cyber Security

Sistem Informasi Cyber Security merupakan aplikasi monitoring keamanan siber yang dirancang untuk membantu pengelolaan aktivitas login, deteksi ancaman, pemblokiran IP, dan pencatatan aktivitas keamanan pada Toko Nadhiya Photocopy.

### Fitur Utama

| Modul | Keterangan |
|---|---|
| Login | Autentikasi pengguna menggunakan Supabase Auth. |
| Verifikasi 2FA | Verifikasi tambahan menggunakan TOTP. |
| Dashboard | Ringkasan kondisi keamanan sistem. |
| Monitoring Login | Pemantauan aktivitas login pengguna. |
| Deteksi Ancaman | Identifikasi aktivitas login mencurigakan. |
| IP Diblokir | Pengelolaan alamat IP yang diblokir. |
| Log Audit | Pencatatan aktivitas sistem. |
| Pengguna & Peran | Pengelolaan akun dan hak akses. |
| Laporan | Ringkasan dan ekspor laporan keamanan. |
| Pengaturan Keamanan | Pengaturan ambang deteksi keamanan. |
| Profil | Informasi pengguna dan logout. |

### Hak Akses Pengguna

| Peran | Hak Akses |
|---|---|
| Administrator | Mengelola pengguna, peran, pengaturan, pemblokiran manual, reset 2FA, dan laporan. |
| Pemilik | Melihat dashboard, monitoring, ancaman, audit, dan laporan serta membuka blokir IP. |
| Pegawai | Melihat angka ringkasan pada dashboard. |

### Arsitektur Keamanan

Sistem menggunakan Supabase sebagai sumber data utama dengan beberapa lapisan keamanan:

1. **Supabase Authentication** untuk autentikasi dan pengelolaan kata sandi.
2. **Multi-Factor Authentication (MFA)** menggunakan TOTP.
3. **Row Level Security (RLS)** untuk membatasi akses berdasarkan peran dan status autentikasi.
4. **Edge Function** sebagai lapisan backend tepercaya untuk proses autentikasi dan deteksi keamanan.
5. **SQL SECURITY DEFINER** untuk menjalankan fungsi database dengan pemeriksaan hak akses.
6. **Audit Log** untuk mencatat aktivitas penting dan mencegah perubahan atau penghapusan catatan melalui aplikasi.

Kunci `service_role` hanya digunakan pada lingkungan server dan tidak boleh ditempatkan di JavaScript frontend maupun repositori GitHub.

### Parameter Deteksi Keamanan

Nilai awal konfigurasi deteksi keamanan:

| Parameter | Nilai Awal |
|---|---:|
| Jendela waktu | 10 menit |
| Ambang login mencurigakan | 3 kali |
| Ambang blokir otomatis | 5 kali |
| Durasi blokir awal | 30 menit |
| Durasi blokir maksimum | 1.440 menit |
| Ambang serangan terdistribusi | 3 IP |

Durasi pemblokiran dapat meningkat ketika terjadi pelanggaran berulang dalam periode 24 jam.

Sistem juga menerapkan penundaan progresif berdasarkan kombinasi alamat IP dan akun untuk mengurangi risiko penyalahgunaan autentikasi.

---

## 3. Struktur Direktori

```text
website-nadhiya-TI24D/
│
├── website-tugas-materi/
│   ├── index.html
│   ├── css/
│   └── js/
│
├── website-project-sistem/
│   ├── index.html
│   ├── css/
│   └── js/
│       ├── config.js
│       ├── core/
│       ├── auth/
│       ├── pages/
│       └── app.js
│
├── supabase/
│   ├── config.toml
│   └── functions/
│       └── secure-auth/
│
├── docs/
│   └── arsip-project-overview/
│
├── supabase-setup-v4.sql
├── supabase-cyber-security.sql
├── .env.example
├── .gitignore
└── README.md
```

---

## 4. Instalasi dan Konfigurasi

### Persyaratan

Sebelum menjalankan aplikasi, pastikan perangkat telah memiliki:

- Visual Studio Code.
- Browser modern.
- Ekstensi Live Server.
- Akun Supabase.
- Node.js dan Supabase CLI untuk deployment Edge Function.

### Langkah 1 — Clone Repository

```bash
git clone https://github.com/nadhiyaauliyah45-hue/240511160-Nadhiya-portal-project-adpl.git

cd 240511160-Nadhiya-portal-project-adpl
```

### Langkah 2 — Konfigurasi Supabase

Jalankan kedua file SQL melalui Supabase SQL Editor:

1. `supabase-setup-v4.sql`
2. `supabase-cyber-security.sql`

Pastikan keduanya berhasil dijalankan sebelum menggunakan fitur masing-masing aplikasi.

### Langkah 3 — Aktifkan MFA TOTP

Pada dashboard Supabase, buka pengaturan Authentication dan pastikan provider TOTP/MFA telah diaktifkan.

### Langkah 4 — Deploy Edge Function

Instal Supabase CLI:

```bash
npm install -g supabase
```

Login dan hubungkan project:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

Deploy function:

```bash
supabase functions deploy secure-auth --no-verify-jwt
```

Atur origin yang diizinkan:

```bash
supabase secrets set ALLOWED_ORIGIN=https://domain-anda.com
```

Variabel lingkungan `SUPABASE_URL`, `SUPABASE_ANON_KEY`, dan `SUPABASE_SERVICE_ROLE_KEY` disediakan pada lingkungan Supabase hosted.

**Jangan pernah memasukkan `service_role` key ke dalam frontend atau repository publik.**

### Langkah 5 — Konfigurasi Frontend

Periksa konfigurasi Supabase pada:

`website-project-sistem/js/config.js`

Sesuaikan URL project, publishable key, dan URL Edge Function dengan project Supabase yang digunakan.

### Langkah 6 — Membuat Administrator Pertama

1. Buka Supabase Authentication → Users.
2. Pilih Add User.
3. Masukkan email dan kata sandi yang kuat.
4. Aktifkan Auto Confirm jika diperlukan.
5. Buka SQL Editor dan jalankan:

```sql
SELECT public.bootstrap_admin(
  'email@anda.com',
  'namauser',
  'Nama Lengkap'
);
```

Fungsi ini hanya dapat digunakan untuk inisialisasi administrator pertama sesuai aturan database.

### Langkah 7 — Menjalankan Website Secara Lokal

1. Buka folder project menggunakan VS Code.
2. Instal ekstensi Live Server.
3. Klik kanan `website-tugas-materi/index.html`.
4. Pilih Open with Live Server.

Untuk Website 2, buka `website-project-sistem/index.html` menggunakan Live Server.

Sesuaikan `ALLOWED_ORIGIN` dengan alamat lokal yang digunakan.

---

## 5. Pengujian Sistem

Pengujian dilakukan menggunakan PostgreSQL 16 lokal, Chromium, Playwright, serta simulasi layanan autentikasi dan API Supabase.

### Hasil Pengujian Website 1

- Pengelolaan delapan mata kuliah.
- Navigasi folder materi dan tugas.
- Pemisahan data berdasarkan mata kuliah dan kategori.
- Pencatatan waktu pengumpulan secara langsung.
- Pengunggahan dokumen sesuai jalur folder.
- Tampilan responsif pada lebar layar 390 piksel.

### Hasil Pengujian Website 2

| Pengujian | Hasil |
|---|---|
| Pemeriksaan UI | 64 dari 64 pemeriksaan lulus |
| Login dan 2FA | Lulus pada skenario pengujian |
| Manajemen pengguna | Lulus |
| Blokir dan buka blokir IP | Lulus |
| Deteksi brute force | Lulus |
| Log audit | Lulus |
| Pembatasan RLS | Lulus |
| Ekspor CSV | Lulus |
| Responsivitas 390 px | Lulus |

### Batasan Pengujian

Pengujian di atas dilakukan pada lingkungan lokal dan simulasi. Koneksi ke project Supabase asli, layanan Auth/MFA sebenarnya, deployment Edge Function pada Deno, header IP dari infrastruktur Supabase, dan Realtime belum diuji langsung.

Karena itu, hasil pengujian lokal tidak dapat dianggap sebagai bukti bahwa seluruh layanan produksi telah berjalan sempurna.

---

## 6. Batasan dan Pengembangan Selanjutnya

Beberapa batasan sistem yang perlu diperhatikan:

1. Pemblokiran IP merupakan mekanisme pada lapisan aplikasi, bukan firewall jaringan.
2. Percobaan kode 2FA pada endpoint MFA Supabase secara langsung tidak sepenuhnya dapat dicegat oleh Edge Function.
3. Pencatatan alamat IP bergantung pada header yang tersedia dari infrastruktur.
4. Token autentikasi pengguna yang dinonaktifkan mengikuti pengaturan kedaluwarsa sesi Supabase.
5. Notifikasi keamanan tersedia di dashboard dan belum terintegrasi dengan WhatsApp atau email.
6. Laporan PDF menggunakan fitur cetak bawaan browser.
7. Belum tersedia sinkronisasi antara aplikasi desktop berbasis MySQL dengan Supabase.
8. Sistem belum menyediakan data contoh secara otomatis.

---

## 7. Keamanan Repository

Beberapa hal yang perlu diperhatikan ketika mengembangkan atau mengunggah project:

- File `.env` tidak boleh diunggah ke GitHub.
- File `.env.example` hanya berisi contoh variabel dan placeholder.
- Jangan menyimpan kata sandi pengguna di source code.
- Jangan menempatkan `service_role` key atau secret key di frontend.
- Publishable key dapat digunakan pada frontend dengan konfigurasi RLS dan kebijakan akses yang benar.
- Pastikan kebijakan RLS dan Storage telah diperiksa sebelum aplikasi digunakan secara publik.

---

## 8. Backup dan Pemulihan Data

Untuk menjaga keamanan data:

- Aktifkan backup database melalui pengaturan Supabase.
- Lakukan pemeriksaan berkala terhadap database.
- Ekspor log audit secara berkala sebagai arsip.
- Simpan salinan source code dan konfigurasi penting secara aman.

Ketersediaan backup otomatis dan point-in-time recovery bergantung pada paket layanan Supabase yang digunakan.

---

## 9. Lisensi dan Informasi

Proyek ini dikembangkan sebagai bagian dari kegiatan akademik mata kuliah **Analisis dan Desain Perangkat Lunak (ADPL)**.

**Pengembang:** Nadhiya Auliyah Ramadhani  
**NIM:** 240511160  
**Kelas:** TI24D  
**Universitas:** Universitas Muhammadiyah Cirebon  
**Tahun Pengembangan:** 2026

---

<p align="center">
  <strong>Website Nadhiya — Portal Tugas & Materi dan Sistem Informasi Cyber Security</strong><br>
  <sub>Universitas Muhammadiyah Cirebon · Teknik Informatika · 2026</sub>
</p>
