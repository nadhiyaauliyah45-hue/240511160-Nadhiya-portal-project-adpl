# Website Nadhiya — Portal Tugas & Materi + Sistem Informasi Cyber Security

Nadhiya Auliyah Ramadhani · NIM 240511160 · TI24D · Teknik Informatika, Fakultas Teknik, Universitas Muhammadiyah Cirebon · 2026

Dua website yang saling terhubung, warna marun dan krem, HTML/CSS/JavaScript terpisah.

| Website | Folder | Fungsi |
|---|---|---|
| 1 | `website-tugas-materi/` | Portal Tugas & Materi untuk 8 mata kuliah |
| 2 | `website-project-sistem/` | Aplikasi Sistem Informasi Cyber Security Toko Nadhiya Photocopy |

## Struktur direktori

```
website-nadhiya-TI24D/
├── website-tugas-materi/          Website 1 (index.html, css/, js/)
├── website-project-sistem/        Website 2 (index.html, css/, js/config|core|auth|pages|app.js)
├── supabase/
│   ├── config.toml                konfigurasi function (verify_jwt = false untuk aksi login)
│   └── functions/secure-auth/     Edge Function tepercaya (gerbang login, deteksi, buat pengguna)
├── supabase-setup-v4.sql          SQL Website 1 (tugas, materi, storage, mata kuliah)
├── supabase-cyber-security.sql    SQL Website 2 (skema keamanan, RLS, fungsi deteksi)
├── docs/arsip-project-overview/   Halaman "overview" lama (diarsipkan, tidak dipakai)
├── .env.example  .gitignore  README.md
```

## Teknologi
HTML, CSS, JavaScript murni · Supabase (PostgreSQL, Auth + MFA TOTP, Storage, Realtime, Edge Functions) · Supabase JS v2 via CDN · Git/GitHub · VS Code.

---

## Website 1 — Portal Tugas & Materi

Fitur yang berfungsi (diuji, lihat bagian Pengujian):
- 8 mata kuliah sebagai folder. Tiap mata kuliah: **Materi**, **Tugas** (sub-folder **Tugas Mandiri** dan **Tugas Kelompok**), **UTS**, **UAS**. Data tiap folder tidak tercampur.
- Waktu pengumpulan **LIVE**: jam berjalan tiap detik; tanggal dan jam dicatat tepat saat tombol Kirim ditekan. Kartu tugas menampilkan "x menit lalu" yang diperbarui otomatis.
- Unggah file Word/PDF (maks. 10 MB) ke Supabase Storage dan/atau tautan Google Drive.
- Tambah materi lewat form (PDF/Word/PPT atau tautan), daftar materi per mata kuliah.
- Profil mahasiswa, status koneksi Supabase, pembaruan realtime.

Dosen pengampu baru terisi untuk ADPL (Bu Dian Novianti, M.Kom.). Untuk mata kuliah lain, isi `dosen` di array `COURSES` pada `website-tugas-materi/js/script.js`.

**Catatan keamanan Website 1:** tanpa login, siapa pun yang punya tautan dapat menambah tugas/materi dan mengunggah file (dibatasi 10 MB dan jenis dokumen). Cocok untuk tugas kuliah, bukan data rahasia.

### Menjalankan SQL Website 1
Supabase → SQL Editor → tempel `supabase-setup-v4.sql` → Run. Aman diulang. Data lama dipertahankan: tugas lama masuk ke ADPL › Tugas Mandiri, materi lama ke ADPL.

---

## Website 2 — Sistem Informasi Cyber Security

### Arsitektur dan keputusan teknis
- **Satu sumber data: Supabase.** Website membaca data keamanan dari PostgreSQL Supabase.
- **Autentikasi:** Supabase Auth (hash kata sandi oleh Supabase). **2FA TOTP** memakai fitur MFA bawaan Supabase (QR, 6 digit, rahasia disimpan Supabase). Tidak ada kriptografi buatan sendiri.
- **Lapisan tepercaya:** Edge Function `secure-auth` + fungsi SQL `SECURITY DEFINER`. Deteksi brute force, pemblokiran IP, dan log audit dijalankan di server, bukan di JavaScript browser. `service_role` key hanya ada di environment function.
- **Peran dipaksa oleh database:** RLS mensyaratkan sesi **AAL2** (sudah lolos 2FA), akun aktif, dan peran yang sesuai. Browser hanya boleh `SELECT`; semua perubahan lewat fungsi yang memeriksa peran dan menulis log audit.
- **Log audit** dan riwayat login dilindungi trigger append-only (UPDATE/DELETE ditolak, bahkan untuk superuser biasa).

### Halaman
Login · Verifikasi 2FA · Dashboard · Monitoring Login · Deteksi Ancaman · IP Diblokir · Log Audit · Pengguna & Peran · Laporan · Pengaturan Keamanan · Profil & Logout.

| Peran | Akses |
|---|---|
| Administrator | Semua: pengguna, peran, pengaturan, blokir manual, reset 2FA, laporan |
| Pemilik | Dashboard, monitoring, ancaman, buka blokir IP, audit, laporan (lihat saja untuk pengguna/pengaturan) |
| Pegawai | Hanya angka ringkasan di dashboard |

### Aturan deteksi (nilai awal, dapat diubah Administrator di Pengaturan Keamanan)
| Pengaturan | Nilai awal | Efek |
|---|---|---|
| Jendela waktu | 10 menit | Rentang penghitungan kegagalan |
| Ambang mencurigakan | 3 kali | 3 gagal dari satu IP → peristiwa "login mencurigakan" (sedang) |
| Ambang blokir otomatis | 5 kali | 5 gagal (password atau 2FA) dari satu IP → IP diblokir (tinggi) |
| Durasi blokir awal | 30 menit | Menggandakan tiap pelanggaran ulang dalam 24 jam |
| Durasi blokir maksimum | 1440 menit | Batas atas |
| Ambang serangan terdistribusi | 3 IP | 1 akun digagalkan dari 3 IP berbeda → peristiwa (tinggi) |

**Anti penguncian akun korban:** akun tidak pernah dikunci karena kegagalan orang lain. Penundaan progresif (mulai gagal ke-3: 2, 4, 8 … maks. 300 detik) hanya berlaku untuk pasangan **IP + akun** yang sama.

### Pengaturan dari awal

1. **Jalankan SQL.** Supabase → SQL Editor → tempel `supabase-setup-v4.sql` (Website 1, jika belum) lalu `supabase-cyber-security.sql` → Run.
2. **Aktifkan MFA TOTP.** Authentication → Sign In / Providers (atau Multi-Factor) → pastikan TOTP *enabled*.
3. **Deploy Edge Function** (butuh Supabase CLI: `npm i -g supabase`):
   ```
   supabase login
   supabase link --project-ref zbhgperztnyrzvwwzqtz
   supabase functions deploy secure-auth --no-verify-jwt
   supabase secrets set ALLOWED_ORIGIN=https://domain-anda.com
   ```
   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` otomatis tersedia untuk function di Supabase hosted. **Jangan** menaruh service_role key di frontend atau GitHub.
4. **Cek `website-project-sistem/js/config.js`** (URL project dan publishable key; `FUNCTION_URL` mengikuti project Anda).
5. **Akun administrator pertama (tanpa kredensial di kode):**
   - Supabase → Authentication → Users → *Add user* → isi email dan kata sandi kuat (≥12 karakter) → centang *Auto Confirm*.
   - SQL Editor, jalankan sekali: `select public.bootstrap_admin('email@anda.com', 'namauser', 'Nama Lengkap');`
   - Fungsi hanya berhasil bila belum ada administrator dan tidak bisa dipanggil dari browser.
6. **Login pertama:** buka Website 2 → masuk → pindai QR dengan Google Authenticator/Authy → masukkan 6 digit. Pengguna lain ditambah Administrator lewat menu Pengguna & Peran.
7. **Notifikasi realtime (opsional):** SQL sudah menambahkan `security_events` dan `blocked_ips` ke publikasi realtime. Jika realtime mati, bel notifikasi tetap menyegarkan tiap 60 detik dan lewat tombol muat ulang.

### Menjalankan lokal
Buka folder di VS Code → ekstensi *Live Server* → klik kanan `website-tugas-materi/index.html` → *Open with Live Server*. Isi `ALLOWED_ORIGIN` function dengan alamat Live Server (mis. `http://127.0.0.1:5500`) atau biarkan kosong (`*`) saat uji.

### Deployment
Hosting statis (Netlify, Vercel, GitHub Pages, Cloudflare Pages) harus HTTPS. Tambahkan header berikut di hosting (tidak bisa lewat `<meta>`): `Content-Security-Policy: frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`. `index.html` sudah memuat CSP lain lewat `<meta>`.

### Clone dari GitHub
```
git clone https://github.com/<akun>/<repo>.git
cd <repo>
```
`.gitignore` sudah mengecualikan `.env`. File `.env.example` hanya contoh. Publishable key di `config.js` memang publik; rahasia sebenarnya (service_role) tidak ada di repositori.

---

## Daftar fitur dan statusnya

**Sudah berfungsi dan sudah diuji (lihat Pengujian)**
- Portal 8 mata kuliah, folder Materi/Tugas/UTS/UAS, sub-folder Mandiri/Kelompok, jam LIVE, unggah, materi.
- Login password via Edge Function, 2FA TOTP (alur dengan stub MFA), sesi, logout, idle timeout 15 menit.
- Pencatatan semua percobaan, deteksi login mencurigakan, blokir otomatis, penundaan progresif, serangan terdistribusi.
- IP diblokir: daftar, blokir manual (admin), buka blokir (admin/pemilik), riwayat, pencarian/filter.
- Log audit append-only dengan filter tanggal, jenis, pengguna, tingkat; ekspor CSV.
- Manajemen pengguna: tambah, ubah peran/status/nama, reset 2FA, cegah administrator terakhir hilang.
- Laporan ringkasan, ekspor CSV, cetak/simpan PDF lewat dialog cetak peramban.
- RLS dan pembatasan peran dari sisi database.

**Memerlukan konfigurasi dari Anda**
- Menjalankan SQL, mengaktifkan TOTP, deploy Edge Function, membuat administrator pertama, mengisi `ALLOWED_ORIGIN`, header keamanan hosting.
- Mengisi nama dosen untuk mata kuliah selain ADPL.

**Belum ada / batasan**
- **Pemblokiran adalah lapisan aplikasi** (gerbang login). Bukan firewall jaringan; hosting statis tidak memberi akses firewall. Perubahan status di database tidak memblokir trafik jaringan.
- **Brute force kode 2FA** pada endpoint MFA Supabase langsung tidak bisa dicegat oleh function kita. Perlindungannya: rate limit bawaan Supabase, kegagalan yang dilaporkan klien dihitung ke blokir, dan RLS tetap menolak data tanpa AAL2. Pelaporan kegagalan 2FA bergantung pada klien yang jujur.
- Alamat IP berasal dari header `cf-connecting-ip`/`x-forwarded-for` yang diisi infrastruktur Supabase. Bila tidak tersedia, IP `unknown` dicatat tetapi tidak diblokir.
- Pengguna yang dinonaktifkan kehilangan akses data seketika (RLS), tetapi token Auth-nya baru benar-benar kedaluwarsa sesuai pengaturan Supabase.
- Notifikasi hanya di dalam dashboard. **Tidak ada** pengiriman WhatsApp/email.
- PDF memakai dialog cetak peramban, bukan pustaka PDF.
- **Integrasi aplikasi desktop:** proposal menyebut aplikasi desktop berbasis MySQL. **Belum ada sinkronisasi MySQL → Supabase.** Website membaca Supabase saja. Pilihan aman bila ingin terintegrasi: aplikasi desktop mengirim peristiwa ke backend tepercaya (Edge Function) atau Supabase dijadikan sumber data tunggal. Browser tidak boleh mengakses MySQL langsung.
- Data kosong ditampilkan sebagai kosong; tidak ada data contoh.

---

## Pengujian yang benar-benar dilakukan

Lingkungan uji: PostgreSQL 16 lokal dengan stub skema `auth`, browser Chromium (Playwright), Edge Function dijalankan nyata dengan GoTrue/PostgREST disimulasikan, klien Supabase digantikan jembatan yang menjalankan query ke PostgreSQL sebagai role `authenticated` dengan klaim JWT (jadi RLS ikut teruji).

- **SQL (PostgreSQL 16):** dijalankan dua kali tanpa error (idempotent); skenario brute force (mencurigakan → penundaan → blokir otomatis → IP lain tidak terdampak), serangan terdistribusi tanpa mengunci akun, buka blokir, validasi rentang pengaturan, mencegah administrator terakhir hilang, trigger anti-ubah audit, fungsi internal tidak dapat dipanggil dari `authenticated`.
- **Edge Function:** pesan galat generik (user tidak ada = salah sandi), penundaan 429, blokir 403 meski sandi benar, pelaporan MFA, penolakan `create-user` tanpa AAL2, JSON rusak, metode non-POST.
- **UI Website 2 (64 pemeriksaan, 64 lulus):** alur login → 2FA → aplikasi untuk 3 peran; pendaftaran authenticator; semua halaman dimuat tanpa error; blokir/buka blokir IP; pengaturan; tambah pengguna; ekspor CSV; logout tercatat; RLS dari sisi browser (pegawai tidak bisa membaca audit/pengaturan atau memblokir IP; pemilik tidak bisa ubah pengaturan/peran); brute force lewat UI; tanpa overflow horizontal di lebar 390 px.
- **UI Website 1:** 8 mata kuliah, navigasi folder, data tidak tercampur, jam LIVE berdetak, simpan ke folder aktif, jalur unggah `mk/kategori/…`, tanpa overflow di 390 px.

**Belum diuji:** koneksi ke project Supabase asli (sandbox tanpa internet), layanan Auth/MFA Supabase sungguhan, deploy Edge Function di Deno, header IP asli Supabase, Realtime, pemuatan Google Fonts. Setelah deploy, lakukan satu kali uji manual: login salah 5 kali dari perangkat uji sendiri, lalu buka blokir dari akun administrator. Jangan menguji terhadap sistem pihak lain.

## Pemulihan dan cadangan
Aktifkan backup harian di Supabase (Project Settings → Database → Backups; plan berbayar untuk point-in-time). Log audit tidak bisa dihapus lewat aplikasi; arsipkan berkala lewat ekspor CSV.
#   2 4 0 5 1 1 1 6 0 - N a d h i y a - p o r t a l - p r o j e c t - a d p l  
 