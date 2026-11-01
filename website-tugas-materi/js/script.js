/* =========================================================
   WEBSITE 1 - PORTAL TUGAS & MATERI (Integrasi Supabase)
   Fitur: simpan tugas + upload file Word/PDF (Storage),
          tampilkan daftar tugas, tambah & tampilkan materi dari tabel "materi".
   Seluruh kode dibungkus IIFE agar variabel tidak bentrok
   dengan library Supabase dari CDN.
   ========================================================= */
(function () {
  'use strict';

  /* =======================================================
     1. KONFIGURASI SUPABASE
     -------------------------------------------------------
     Project URL dan Publishable key diambil dari:
     Supabase -> Project Settings -> Data API / API Keys.
     Jalankan supabase-setup-v4.sql di SQL Editor agar tabel
     "tugas", tabel "materi", dan bucket "file-tugas" tersedia.
     Jangan pernah menaruh key rahasia (secret / service_role) di sini.
     ======================================================= */
  var SUPABASE_URL = 'https://zbhgperztnyrzvwwzqtz.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_9cilXPiX037rMHZokBFqjQ_LZwksKav';
  var TABLE_NAME = 'tugas';        // tabel tugas
  var MATERI_TABLE = 'materi';     // tabel materi
  var BUCKET = 'file-tugas';       // bucket Storage untuk file Word/PDF

  var MAX_FILE_MB = 10;                              // batas ukuran file
  var ALLOWED_EXT = ['pdf', 'doc', 'docx'];          // format yang boleh diunggah
  var MIME_BY_EXT = {                                // tipe file untuk upload
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  };
  var MATERI_EXT = ['pdf', 'doc', 'docx', 'ppt', 'pptx'];   // format file untuk materi

  /* -------------------------------------------------------
     STRUKTUR FOLDER
     8 mata kuliah. Tiap mata kuliah punya folder:
       Materi | Tugas (Tugas Mandiri, Tugas Kelompok) | UTS | UAS
     Kode "kode" harus sama dengan nilai di supabase-setup-v4.sql
     ------------------------------------------------------- */
  var COURSES = [
    { kode: 'adpl', nama: 'Analisis dan Desain Perangkat Lunak', pendek: 'ADPL',  dosen: 'Bu Dian Novianti, M.Kom.' },
    { kode: 'pbp',  nama: 'Pemrograman Berbasis Platform',       pendek: 'PBP',   dosen: '' },
    { kode: 'tti',  nama: 'Tata Tulis Ilmiah (Metodologi Penelitian)', pendek: 'TTI', dosen: '' },
    { kode: 'mpti', nama: 'Manajemen Proyek Teknologi Informasi', pendek: 'MPTI', dosen: '' },
    { kode: 'aik4', nama: 'AIK 4 (Islam dan Ilmu Pengetahuan)',  pendek: 'AIK 4', dosen: '' },
    { kode: 'npt',  nama: 'Network Penetration Testing',         pendek: 'NPT',   dosen: '' },
    { kode: 'csam', nama: 'Cyber Security Analysis & Method',    pendek: 'CSAM',  dosen: '' },
    { kode: 'imk',  nama: 'Interaksi Manusia dan Komputer',      pendek: 'IMK',   dosen: '' }
  ];
  /* Folder tingkat 1. "tugas" punya dua sub-folder (kategori di database) */
  var FOLDERS = [
    { id: 'materi', label: 'Materi', icon: '📘' },
    { id: 'tugas',  label: 'Tugas',  icon: '📝' },
    { id: 'uts',    label: 'UTS',    icon: '🧾' },
    { id: 'uas',    label: 'UAS',    icon: '🎓' }
  ];
  var SUBFOLDERS = [
    { id: 'tugas_mandiri',  label: 'Tugas Mandiri' },
    { id: 'tugas_kelompok', label: 'Tugas Kelompok' }
  ];
  var DEFAULT_COURSE = 'adpl';        // data lama tanpa mata_kuliah dianggap milik ADPL
  var DEFAULT_KATEGORI = 'tugas_mandiri';

  var state = { course: 'adpl', folder: 'tugas', sub: 'tugas_mandiri' };
  var allTugas = [];     // seluruh tugas dari database (disaring di browser per folder)
  var allMateri = [];    // seluruh materi dari database
  var loadedTugas = false, loadedMateri = false;

  var supabase = null;   // client Supabase (dibuat di initSupabase)

  /* Cek apakah URL dan key sudah diisi dengan benar */
  function isConfigured() {
    return /^https?:\/\//.test(SUPABASE_URL) &&
           SUPABASE_ANON_KEY.length > 20 &&
           SUPABASE_ANON_KEY.indexOf('ISI_') !== 0;
  }

  /* Membuat client Supabase dari library CDN. Mengembalikan true jika berhasil */
  function initSupabase() {
    if (!isConfigured()) return false;
    if (!window.supabase || typeof window.supabase.createClient !== 'function') return false;
    // Portal selalu berjalan sebagai pengunjung (anon). Sesi login website Cyber Security
    // (tersimpan di browser yang sama) sengaja TIDAK dipakai di sini.
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    return true;
  }

  /* =======================================================
     2. HELPER UMUM
     ======================================================= */
  function $(id) { return document.getElementById(id); }

  /* Menampilkan pesan di bawah form (type: 'ok' | 'err' | '') */
  function showMsg(text, type) {
    var el = $('formMsg');
    el.textContent = text;
    el.className = 'msg ' + (type || '');
  }

  /* Menampilkan status koneksi pada kartu statistik */
  function setConn(state, text) {
    var el = $('connStatus');
    el.className = 'conn ' + state;
    el.textContent = text;
  }

  /* Link hanya valid jika berasal dari Google Drive / Google Docs */
  function isValidDriveLink(value) {
    try {
      var u = new URL(value);
      var okProtocol = u.protocol === 'https:' || u.protocol === 'http:';
      var okHost = u.hostname === 'drive.google.com' || u.hostname === 'docs.google.com';
      return okProtocol && okHost;
    } catch (e) { return false; }
  }

  /* Link aman untuk dipasang di tombol (hanya http/https) */
  function isSafeUrl(value) {
    try {
      var u = new URL(value);
      return u.protocol === 'https:' || u.protocol === 'http:';
    } catch (e) { return false; }
  }

  /* Format tanggal "2026-10-24" -> "24 Okt 2026" (tanpa pergeseran zona waktu) */
  function formatTanggal(str) {
    if (!str) return '-';
    var p = String(str).split('-');
    if (p.length !== 3) return str;
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  /* Format jam "16:30:00" -> "16:30" */
  function formatJam(str) {
    return str ? String(str).slice(0, 5) : '-';
  }

  /* -------------------------------------------------------
     WAKTU LIVE
     Jam di form berjalan tiap detik. Nilai tanggal & jam diambil
     ulang tepat saat tombol "Kirim" ditekan (lihat handleSubmit).
     ------------------------------------------------------- */
  function pad2(n) { return String(n).padStart(2, '0'); }
  function nowParts() {
    var d = new Date();
    return {
      tanggal: d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()),
      jam: pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()),
      date: d
    };
  }
  function tickClock() {
    var n = nowParts();
    $('tanggalTugas').value = n.tanggal;
    $('jamTugas').value = n.jam;
    $('liveTime').textContent = n.jam;
    $('liveDate').textContent = n.date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  function startClock() {
    var tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { /* abaikan */ }
    $('liveTz').textContent = 'Zona waktu perangkat' + (tz ? ': ' + tz : '') + '. Dicatat otomatis saat tombol Kirim ditekan.';
    tickClock();
    setInterval(tickClock, 1000);
    setInterval(refreshRelative, 30000);   // "x menit lalu" ikut diperbarui
  }

  /* "2026-10-25T14:03:11Z" -> "baru saja" / "5 menit lalu" / "3 jam lalu" / "2 hari lalu" */
  function relTime(iso) {
    var t = Date.parse(iso);
    if (isNaN(t)) return '';
    var sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (sec < 45) return 'baru saja';
    if (sec < 3600) return Math.round(sec / 60) + ' menit lalu';
    if (sec < 86400) return Math.floor(sec / 3600) + ' jam lalu';
    return Math.floor(sec / 86400) + ' hari lalu';
  }
  function refreshRelative() {
    document.querySelectorAll('[data-ts]').forEach(function (el) {
      el.textContent = relTime(el.getAttribute('data-ts'));
    });
  }

  function courseByKode(k) {
    for (var i = 0; i < COURSES.length; i++) if (COURSES[i].kode === k) return COURSES[i];
    return COURSES[0];
  }
  /* Kategori database untuk folder yang sedang dibuka: tugas_mandiri | tugas_kelompok | uts | uas */
  function activeKategori() {
    return state.folder === 'tugas' ? state.sub : state.folder;
  }
  function kategoriLabel(k) {
    if (k === 'tugas_mandiri') return 'Tugas Mandiri';
    if (k === 'tugas_kelompok') return 'Tugas Kelompok';
    return String(k).toUpperCase();
  }

  /* Mengambil ekstensi file dalam huruf kecil ("Laporan.DOCX" -> "docx") */
  function getExt(name) {
    var dot = String(name).lastIndexOf('.');
    return dot > -1 ? String(name).slice(dot + 1).toLowerCase() : '';
  }

  /* Membersihkan nama file agar aman dipakai sebagai path di Storage */
  function safeFileName(name) {
    var full = String(name);
    var i = full.lastIndexOf('.');
    var base = i > -1 ? full.slice(0, i) : full;   // nama tanpa ekstensi
    base = base.normalize('NFD').replace(/[̀-ͯ]/g, '')
               .replace(/[^a-zA-Z0-9_-]+/g, '-')
               .replace(/^-+|-+$/g, '')
               .slice(0, 60) || 'file';
    return base + '.' + getExt(full);
  }

  /* =======================================================
     3. TAMPILAN: kartu daftar tugas & statistik
     ======================================================= */
  /* Menampilkan satu pesan di area daftar tugas (kosong / error / petunjuk) */
  function renderNotice(text, isError) {
    var box = $('tugasList');
    box.innerHTML = '';
    var p = document.createElement('p');
    p.className = 'empty' + (isError ? ' error' : '');
    p.textContent = text;
    box.appendChild(p);
  }

  /* Membuat kartu untuk setiap tugas dari Supabase */
  function renderTugas(list) {
    var box = $('tugasList');
    box.innerHTML = '';

    if (!list || list.length === 0) {
      renderNotice('Folder ' + kategoriLabel(activeKategori()) + ' untuk ' + courseByKode(state.course).pendek + ' masih kosong. Isi form untuk menambahkan yang pertama.', false);
      return;
    }

    list.forEach(function (t) {
      var card = document.createElement('article');
      card.className = 'tugas-card';

      // Baris atas: nama tugas + status
      var head = document.createElement('div');
      head.className = 'tugas-head';
      var h = document.createElement('h4');
      h.textContent = t.nama_tugas || '(Tanpa nama)';
      var badge = document.createElement('span');
      badge.className = 'badge done';
      badge.textContent = t.status || 'Terkumpul';
      head.appendChild(h);
      head.appendChild(badge);

      // Tanggal & jam pengumpulan
      var meta = document.createElement('div');
      meta.className = 't-meta';
      meta.textContent = '📅 ' + formatTanggal(t.tanggal_pengumpulan) + '  ·  🕒 ' + formatJam(t.jam_pengumpulan);
      if (t.created_at) {
        var rel = document.createElement('span');
        rel.className = 'rel';
        rel.setAttribute('data-ts', t.created_at);
        rel.textContent = relTime(t.created_at);
        meta.appendChild(document.createTextNode('  ·  '));
        meta.appendChild(rel);
      }

      // Detail tugas
      var detail = document.createElement('p');
      detail.className = 't-detail';
      detail.textContent = t.detail_tugas ? t.detail_tugas : 'Tidak ada detail tugas.';

      card.appendChild(head);
      card.appendChild(meta);
      card.appendChild(detail);

      // Nama file yang diunggah (jika ada)
      if (t.file_url && t.file_nama) {
        var fname = document.createElement('div');
        fname.className = 't-file';
        fname.textContent = '📎 ' + t.file_nama;
        card.appendChild(fname);
      }

      // Tombol aksi: Buka File (Word/PDF) dan/atau Buka Link Drive
      var actions = document.createElement('div');
      actions.className = 'tugas-actions';

      if (t.file_url && isSafeUrl(t.file_url)) {
        var fileBtn = document.createElement('a');
        fileBtn.className = 'btn small';
        fileBtn.textContent = 'Buka File ↗';
        fileBtn.href = t.file_url;
        fileBtn.target = '_blank';
        fileBtn.rel = 'noopener noreferrer';
        actions.appendChild(fileBtn);
      }
      if (t.link_drive && isSafeUrl(t.link_drive)) {
        var open = document.createElement('a');
        open.className = 'btn small' + (t.file_url ? ' ghost' : '');
        open.textContent = 'Buka Link Drive ↗';
        open.href = t.link_drive;
        open.target = '_blank';
        open.rel = 'noopener noreferrer';
        actions.appendChild(open);
      }
      if (actions.children.length) card.appendChild(actions);
      card.appendChild(crudButtons('tugas', t));      // tombol Edit & Hapus

      box.appendChild(card);
    });
  }

  /* Memperbarui angka di kartu statistik (folder aktif + total semua mata kuliah) */
  function updateStats() {
    var c = courseByKode(state.course);
    var inFolder = state.folder === 'materi' ? materiOf(state.course).length : tugasOf(state.course, activeKategori()).length;
    var label = state.folder === 'materi' ? 'Materi' : kategoriLabel(activeKategori());
    $('statPercent').textContent = inFolder;
    $('statSub').textContent = label + ' · ' + c.pendek;
    $('statText').textContent = (allTugas.length === 0 && allMateri.length === 0)
      ? 'Belum ada data di database.'
      : 'Total semua mata kuliah: ' + allTugas.length + ' tugas/ujian, ' + allMateri.length + ' materi.';
  }

  /* =======================================================
     4. TAMPILAN: daftar materi (dari tabel "materi")
     ======================================================= */
  /* Menampilkan pesan di area materi (kosong / error) */
  function renderMateriNotice(text, isError) {
    var box = $('materiList');
    box.innerHTML = '';
    var p = document.createElement('p');
    p.className = 'empty' + (isError ? ' error' : '');
    p.textContent = text;
    box.appendChild(p);
  }

  /* Membuat kartu untuk setiap materi */
  function renderMateri(list) {
    var box = $('materiList');
    box.innerHTML = '';

    if (!list || list.length === 0) {
      renderMateriNotice('Folder Materi ' + courseByKode(state.course).pendek + ' masih kosong. Tambahkan lewat tombol "Tambah Materi" atau langsung dari database.', false);
      return;
    }

    list.forEach(function (m) {
      var item = document.createElement('div');
      item.className = 'chap';

      var ico = document.createElement('span');
      ico.className = 'ico';
      ico.textContent = '📘';

      var body = document.createElement('div');

      var bab = document.createElement('span');
      bab.className = 'bab';
      bab.textContent = String(m.bab || '').toUpperCase();

      var title = document.createElement('b');
      title.textContent = m.judul || '(Tanpa judul)';

      body.appendChild(bab);
      body.appendChild(title);

      if (m.deskripsi) {
        var desc = document.createElement('small');
        desc.textContent = m.deskripsi;
        body.appendChild(desc);
      }

      // Tombol: Buka File (hasil upload) dan/atau Buka Link
      var acts = document.createElement('div');
      acts.className = 'tugas-actions';
      if (m.file_url && isSafeUrl(m.file_url)) {
        var fileBtn = document.createElement('a');
        fileBtn.className = 'btn small';
        fileBtn.textContent = 'Buka File ↗';
        fileBtn.href = m.file_url;
        fileBtn.target = '_blank';
        fileBtn.rel = 'noopener noreferrer';
        acts.appendChild(fileBtn);
      }
      if (m.link_materi && isSafeUrl(m.link_materi)) {
        var open = document.createElement('a');
        open.className = 'btn small' + (m.file_url ? ' ghost' : '');
        open.textContent = 'Buka Link ↗';
        open.href = m.link_materi;
        open.target = '_blank';
        open.rel = 'noopener noreferrer';
        acts.appendChild(open);
      }
      if (acts.children.length) body.appendChild(acts);
      body.appendChild(crudButtons('materi', m));     // tombol Edit & Hapus

      item.appendChild(ico);
      item.appendChild(body);
      box.appendChild(item);
    });
  }

  /* =======================================================
     5. SUPABASE: ambil data (SELECT)
     ======================================================= */
  /* Saring data per folder (data lama tanpa kolom baru dianggap ADPL / Tugas Mandiri) */
  function tugasOf(course, kategori) {
    return allTugas.filter(function (t) {
      return (t.mata_kuliah || DEFAULT_COURSE) === course && (t.kategori || DEFAULT_KATEGORI) === kategori;
    });
  }
  function materiOf(course) {
    return allMateri.filter(function (m) { return (m.mata_kuliah || DEFAULT_COURSE) === course; });
  }
  function countFor(course) {
    return materiOf(course).length + allTugas.filter(function (t) { return (t.mata_kuliah || DEFAULT_COURSE) === course; }).length;
  }

  /* =======================================================
     4b. NAVIGASI FOLDER: kartu mata kuliah + tab folder
     ======================================================= */
  function makeBtn(cls, text, selected, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = cls + (selected ? ' active' : '');
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', selected ? 'true' : 'false');
    b.addEventListener('click', onClick);
    if (text) b.appendChild(text);
    return b;
  }

  function renderNav() {
    // Kartu 8 mata kuliah
    var grid = $('courseGrid');
    grid.innerHTML = '';
    COURSES.forEach(function (c, i) {
      var inner = document.createDocumentFragment();
      var num = document.createElement('span'); num.className = 'cnum'; num.textContent = String(i + 1);
      var nm = document.createElement('b'); nm.textContent = c.nama;
      var cnt = document.createElement('small');
      var n = countFor(c.kode);
      cnt.textContent = (loadedTugas || loadedMateri) ? n + ' isi' : '';
      inner.appendChild(num); inner.appendChild(nm); inner.appendChild(cnt);
      var btn = makeBtn('course', null, c.kode === state.course, function () {
        state.course = c.kode; applyView();
      });
      btn.appendChild(inner);
      btn.title = 'Buka folder ' + c.nama;
      grid.appendChild(btn);
    });

    // Tab folder: Materi / Tugas / UTS / UAS
    var tabs = $('folderTabs');
    tabs.innerHTML = '';
    FOLDERS.forEach(function (f) {
      var t = document.createTextNode(f.icon + ' ' + f.label);
      tabs.appendChild(makeBtn('tab', t, f.id === state.folder, function () {
        state.folder = f.id; applyView();
      }));
    });

    // Sub-folder di dalam Tugas
    var sub = $('subTabs');
    sub.innerHTML = '';
    if (state.folder === 'tugas') {
      sub.removeAttribute('hidden');
      SUBFOLDERS.forEach(function (f) {
        var t = document.createTextNode(f.label + ' (' + tugasOf(state.course, f.id).length + ')');
        sub.appendChild(makeBtn('tab', t, f.id === state.sub, function () {
          state.sub = f.id; applyView();
        }));
      });
    } else {
      sub.setAttribute('hidden', '');
    }

    // Jejak folder (breadcrumb)
    var c = courseByKode(state.course);
    var path = [c.nama, FOLDERS.filter(function (f) { return f.id === state.folder; })[0].label];
    if (state.folder === 'tugas') path.push(kategoriLabel(state.sub));
    $('crumb').textContent = '📂 ' + path.join('  ›  ');
  }

  /* Satu fungsi untuk menyusun ulang seluruh tampilan sesuai folder aktif */
  function applyView() {
    var c = courseByKode(state.course);
    var isMateri = state.folder === 'materi';

    $('profMk').textContent = c.nama;
    $('profDosen').textContent = c.dosen || 'Belum diisi';

    // Bagian Materi ATAU bagian Tugas/UTS/UAS yang tampil
    $('materi').hidden = !isMateri;
    $('kumpul').hidden = isMateri;
    $('tugas').hidden = isMateri;

    if (isMateri) {
      $('materiSub').textContent = c.nama;
      if (loadedMateri) renderMateri(materiOf(state.course));
    } else {
      var kat = activeKategori();
      var nm = kategoriLabel(kat);
      var isUjian = kat === 'uts' || kat === 'uas';
      $('formTitle').textContent = isUjian ? 'Unggah Berkas ' + nm : 'Kumpulkan ' + nm;
      $('formTarget').textContent = '📂 Disimpan ke: ' + c.pendek + ' › ' + (state.folder === 'tugas' ? 'Tugas › ' : '') + nm;
      $('listTitle').textContent = 'Daftar ' + nm;
      $('listSub').textContent = c.nama;
      if (loadedTugas) renderTugas(tugasOf(state.course, kat));
    }
    renderNav();
    updateStats();
  }

  /* Ambil semua tugas */
  async function loadTugas() {
    if (!supabase) {
      renderNotice(
        isConfigured()
          ? 'Library Supabase gagal dimuat. Periksa koneksi internet lalu muat ulang halaman.'
          : 'Supabase belum dikonfigurasi. Buka js/script.js lalu isi SUPABASE_URL dan SUPABASE_ANON_KEY.',
        true
      );
      applyView();
      return;
    }

    try {
      // Ambil semua data tugas, yang terbaru di atas
      var result = await supabase.from(TABLE_NAME).select('*').order('created_at', { ascending: false });
      if (result.error) throw result.error;
      allTugas = result.data || [];
      loadedTugas = true;
      applyView();
      setConn('ok', '● Terhubung ke Supabase');
    } catch (err) {
      renderNotice('Gagal mengambil data: ' + (err.message || err) + '. Pastikan supabase-setup-v4.sql sudah dijalankan.', true);
      setConn('bad', '● Gagal terhubung');
    }
  }

  /* Ambil semua materi (urut berdasarkan kolom "urutan", lalu waktu dibuat) */
  async function loadMateri() {
    if (!supabase) {
      renderMateriNotice('Materi belum bisa dimuat karena Supabase belum terhubung.', true);
      return;
    }
    try {
      var result = await supabase.from(MATERI_TABLE).select('*')
        .order('urutan', { ascending: true })
        .order('created_at', { ascending: true });
      if (result.error) throw result.error;
      allMateri = result.data || [];
      loadedMateri = true;
      applyView();
    } catch (err) {
      renderMateriNotice('Gagal memuat materi: ' + (err.message || err) + '. Pastikan supabase-setup-v4.sql sudah dijalankan.', true);
    }
  }

  /* =======================================================
     6. SUPABASE: upload file Word/PDF ke Storage
     Mengembalikan { url, path, nama } atau melempar error
     ======================================================= */
  async function uploadFile(file, folder) {
    var ext = getExt(file.name);
    var path = (folder ? folder + '/' : '') + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '-' + safeFileName(file.name);

    var up = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: MIME_BY_EXT[ext] || file.type
    });
    if (up.error) throw up.error;

    var pub = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { url: pub.data.publicUrl, path: path, nama: file.name };
  }

  /* Memeriksa file yang dipilih. Mengembalikan teks error atau '' jika valid */
  function validateFile(file, allowed) {
    if (!file) return '';
    allowed = allowed || ALLOWED_EXT;
    if (allowed.indexOf(getExt(file.name)) === -1) {
      return 'Format file tidak didukung. Gunakan ' + allowed.join(', ').toUpperCase() + '.';
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      return 'Ukuran file terlalu besar. Maksimal ' + MAX_FILE_MB + ' MB.';
    }
    if (file.size === 0) return 'File kosong, pilih file lain.';
    return '';
  }

  /* =======================================================
     7. SUPABASE: simpan data (INSERT) dari form
     ======================================================= */
  async function handleSubmit(event) {
    event.preventDefault();

    var nama = $('namaTugas').value.trim();
    tickClock();                         // ambil waktu LIVE tepat saat tombol ditekan
    var tanggal = $('tanggalTugas').value;
    var jam = $('jamTugas').value;
    var detail = $('detailTugas').value.trim();
    var link = $('driveLink').value.trim();
    var file = $('fileTugas').files[0] || null;

    // Validasi input
    if (!nama) { showMsg('Nama tugas tidak boleh kosong.', 'err'); return; }
    if (!tanggal) { showMsg('Tanggal pengumpulan wajib diisi.', 'err'); return; }
    if (!jam) { showMsg('Jam pengumpulan wajib diisi.', 'err'); return; }
    if (!file && !link) { showMsg('Unggah file Word/PDF atau isi link Google Drive (minimal salah satu).', 'err'); return; }

    var fileError = validateFile(file);
    if (fileError) { showMsg(fileError, 'err'); return; }

    if (link && !isValidDriveLink(link)) { showMsg('Link tidak valid. Gunakan link dari drive.google.com atau docs.google.com.', 'err'); return; }
    if (!supabase) { showMsg('Supabase belum terhubung. Periksa js/script.js.', 'err'); return; }

    var btn = $('btnSubmit');
    btn.disabled = true;

    try {
      // Langkah 1: unggah file (jika ada) ke Storage
      var uploaded = null;
      if (file) {
        showMsg('Mengunggah file...', '');
        uploaded = await uploadFile(file, state.course + '/' + activeKategori());
      }

      // Langkah 2: simpan satu baris baru ke tabel "tugas"
      showMsg('Menyimpan ke Supabase...', '');
      var result = await supabase.from(TABLE_NAME).insert([{
        mata_kuliah: state.course,
        kategori: activeKategori(),
        nama_tugas: nama,
        tanggal_pengumpulan: tanggal,
        jam_pengumpulan: jam,
        detail_tugas: detail,
        link_drive: link || null,
        file_url: uploaded ? uploaded.url : null,
        file_nama: uploaded ? uploaded.nama : null,
        file_path: uploaded ? uploaded.path : null,
        status: 'Terkumpul'
      }]);
      if (result.error) throw result.error;

      $('submitForm').reset();
      tickClock();
      showMsg('Berhasil! "' + nama + '" tersimpan di ' + courseByKode(state.course).pendek + ' › ' + kategoriLabel(activeKategori()) + ' pada ' + formatJam(jam) + ' ' + formatTanggal(tanggal) + '.', 'ok');
      await loadTugas();   // segarkan daftar
    } catch (err) {
      showMsg('Gagal menyimpan: ' + (err.message || err), 'err');
    } finally {
      btn.disabled = false;
    }
  }

  /* =======================================================
     7b. SUPABASE: tambah MATERI dari form (INSERT ke tabel "materi")
     ======================================================= */
  function showMateriMsg(text, type) {
    var el = $('materiMsg');
    el.textContent = text;
    el.className = 'msg ' + (type || '');
  }

  async function handleMateriSubmit(event) {
    event.preventDefault();

    var bab = $('materiBab').value.trim();
    var judul = $('materiJudul').value.trim();
    var deskripsi = $('materiDeskripsi').value.trim();
    var urutanRaw = $('materiUrutan').value.trim();
    var link = $('materiLink').value.trim();
    var file = $('materiFile').files[0] || null;

    // Validasi input
    if (!bab) { showMateriMsg('Bab / pertemuan wajib diisi.', 'err'); return; }
    if (!judul) { showMateriMsg('Judul materi wajib diisi.', 'err'); return; }
    if (urutanRaw !== '' && !/^\d{1,3}$/.test(urutanRaw)) { showMateriMsg('Urutan harus berupa angka 0-999.', 'err'); return; }
    if (link && !isSafeUrl(link)) { showMateriMsg('Link materi harus diawali http:// atau https://', 'err'); return; }
    var fileError = validateFile(file, MATERI_EXT);
    if (fileError) { showMateriMsg(fileError, 'err'); return; }
    if (!supabase) { showMateriMsg('Supabase belum terhubung. Periksa js/script.js.', 'err'); return; }

    var btn = $('btnMateri');
    btn.disabled = true;

    try {
      // Langkah 1: unggah file materi (jika ada)
      var uploaded = null;
      if (file) {
        showMateriMsg('Mengunggah file...', '');
        uploaded = await uploadFile(file, state.course + '/materi');
      }

      // Langkah 2: simpan ke tabel "materi"
      showMateriMsg('Menyimpan materi...', '');
      var result = await supabase.from(MATERI_TABLE).insert([{
        mata_kuliah: state.course,
        bab: bab,
        judul: judul,
        deskripsi: deskripsi,
        link_materi: link || null,
        urutan: urutanRaw === '' ? 0 : parseInt(urutanRaw, 10),
        file_url: uploaded ? uploaded.url : null,
        file_nama: uploaded ? uploaded.nama : null,
        file_path: uploaded ? uploaded.path : null
      }]);
      if (result.error) throw result.error;

      $('formMateri').reset();
      showMateriMsg('Berhasil! Materi "' + judul + '" tersimpan.', 'ok');
      await loadMateri();
    } catch (err) {
      showMateriMsg('Gagal menyimpan materi: ' + (err.message || err), 'err');
    } finally {
      btn.disabled = false;
    }
  }


  /* =======================================================
     7c. EDIT & HAPUS (Update + Delete)
     Butuh izin dari supabase-crud-v1.sql
     ======================================================= */
  var editing = null;   // { type: 'tugas'|'materi', row: {...} }

  /* Dua tombol kecil di setiap kartu */
  function crudButtons(type, row) {
    var wrap = document.createElement('div');
    wrap.className = 'tugas-actions crud';
    var edit = document.createElement('button');
    edit.type = 'button'; edit.className = 'btn small ghost'; edit.textContent = '✎ Edit';
    edit.addEventListener('click', function () { openEdit(type, row); });
    var del = document.createElement('button');
    del.type = 'button'; del.className = 'btn small danger'; del.textContent = '🗑 Hapus';
    del.addEventListener('click', function () { deleteItem(type, row); });
    wrap.appendChild(edit); wrap.appendChild(del);
    return wrap;
  }

  /* Kolom yang boleh diedit untuk tiap jenis data */
  var EDIT_FIELDS = {
    tugas: [
      { key: 'nama_tugas', label: 'Nama Tugas', type: 'text', max: 120, required: true },
      { key: 'detail_tugas', label: 'Detail / Deskripsi', type: 'textarea', max: 500 },
      { key: 'link_drive', label: 'Link Google Drive', type: 'url' }
    ],
    materi: [
      { key: 'bab', label: 'Bab / Pertemuan', type: 'text', max: 30, required: true },
      { key: 'judul', label: 'Judul Materi', type: 'text', max: 150, required: true },
      { key: 'deskripsi', label: 'Deskripsi', type: 'textarea', max: 300 },
      { key: 'link_materi', label: 'Link Materi', type: 'url' },
      { key: 'urutan', label: 'Urutan tampil (0-999)', type: 'number' }
    ]
  };

  function openEdit(type, row) {
    editing = { type: type, row: row };
    $('dlgTitle').textContent = type === 'tugas' ? 'Edit Tugas' : 'Edit Materi';
    var box = $('dlgFields');
    box.innerHTML = '';
    EDIT_FIELDS[type].forEach(function (f) {
      var lab = document.createElement('label');
      lab.setAttribute('for', 'ed_' + f.key);
      lab.textContent = f.label;
      var inp = document.createElement(f.type === 'textarea' ? 'textarea' : 'input');
      inp.id = 'ed_' + f.key;
      if (f.type !== 'textarea') inp.type = f.type;
      if (f.type === 'textarea') inp.rows = 3;
      if (f.max) inp.maxLength = f.max;
      inp.value = row[f.key] === null || row[f.key] === undefined ? '' : row[f.key];
      box.appendChild(lab); box.appendChild(inp);
    });
    $('dlgMsg').textContent = ''; $('dlgMsg').className = 'msg';
    $('dlgEdit').showModal();
  }

  function dlgMsg(text, type) { var el = $('dlgMsg'); el.textContent = text; el.className = 'msg ' + (type || ''); }

  async function handleEditSave(event) {
    event.preventDefault();
    if (!editing || !supabase) return;
    var type = editing.type, row = editing.row, v = {};
    EDIT_FIELDS[type].forEach(function (f) { v[f.key] = $('ed_' + f.key).value.trim(); });

    var payload;
    if (type === 'tugas') {
      if (!v.nama_tugas) return dlgMsg('Nama tugas tidak boleh kosong.', 'err');
      if (v.link_drive && !isValidDriveLink(v.link_drive)) return dlgMsg('Link harus dari drive.google.com atau docs.google.com.', 'err');
      if (!v.link_drive && !row.file_url) return dlgMsg('Tugas ini tidak punya file, jadi link Drive wajib diisi.', 'err');
      payload = { nama_tugas: v.nama_tugas, detail_tugas: v.detail_tugas, link_drive: v.link_drive || null };
    } else {
      if (!v.bab) return dlgMsg('Bab / pertemuan wajib diisi.', 'err');
      if (!v.judul) return dlgMsg('Judul materi wajib diisi.', 'err');
      if (v.urutan !== '' && !/^\d{1,3}$/.test(v.urutan)) return dlgMsg('Urutan harus angka 0-999.', 'err');
      if (v.link_materi && !isSafeUrl(v.link_materi)) return dlgMsg('Link harus diawali http:// atau https://', 'err');
      payload = { bab: v.bab, judul: v.judul, deskripsi: v.deskripsi, link_materi: v.link_materi || null,
                  urutan: v.urutan === '' ? 0 : parseInt(v.urutan, 10) };
    }

    var btn = $('dlgSave'); btn.disabled = true; dlgMsg('Menyimpan...', '');
    try {
      var table = type === 'tugas' ? TABLE_NAME : MATERI_TABLE;
      var res = await supabase.from(table).update(payload).eq('id', row.id).select();
      if (res.error) throw res.error;
      if (!res.data || res.data.length === 0) throw new Error('Tidak ada data yang berubah. Jalankan supabase-crud-v1.sql di Supabase.');
      $('dlgEdit').close();
      await (type === 'tugas' ? loadTugas() : loadMateri());
    } catch (err) {
      dlgMsg('Gagal menyimpan: ' + (err.message || err), 'err');
    } finally {
      btn.disabled = false;
    }
  }

  async function deleteItem(type, row) {
    if (!supabase) { alert('Supabase belum terhubung.'); return; }
    var nama = type === 'tugas' ? row.nama_tugas : row.judul;
    if (!window.confirm('Hapus "' + (nama || 'data ini') + '"?\nTindakan ini tidak dapat dibatalkan.')) return;
    try {
      var table = type === 'tugas' ? TABLE_NAME : MATERI_TABLE;
      var res = await supabase.from(table).delete().eq('id', row.id).select();
      if (res.error) throw res.error;
      if (!res.data || res.data.length === 0) throw new Error('Data tidak terhapus. Jalankan supabase-crud-v1.sql di Supabase.');
      // Hapus juga file di Storage (jika ada). Kegagalan di sini tidak menggagalkan penghapusan data.
      if (row.file_path) { try { await supabase.storage.from(BUCKET).remove([row.file_path]); } catch (e) { /* abaikan */ } }
      await (type === 'tugas' ? loadTugas() : loadMateri());
    } catch (err) {
      alert('Gagal menghapus: ' + (err.message || err));
    }
  }

  /* Buka / tutup panel form tambah materi */
  function toggleMateriPanel() {
    var panel = $('panelMateri');
    var btn = $('btnToggleMateri');
    var willOpen = panel.hasAttribute('hidden');
    if (willOpen) panel.removeAttribute('hidden'); else panel.setAttribute('hidden', '');
    btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    btn.textContent = willOpen ? '✕ Tutup Form' : '＋ Tambah Materi';
  }

  /* =======================================================
     8. SUPABASE: update real-time
     Daftar tugas & materi dimuat ulang otomatis saat ada
     perubahan (butuh Realtime aktif, lihat supabase-setup-v4.sql)
     ======================================================= */
  function subscribeRealtime() {
    if (!supabase) return;
    try {
      supabase
        .channel('portal-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: TABLE_NAME }, function () { loadTugas(); })
        .on('postgres_changes', { event: '*', schema: 'public', table: MATERI_TABLE }, function () { loadMateri(); })
        .subscribe();
    } catch (e) { /* realtime opsional, abaikan jika gagal */ }
  }

  /* =======================================================
     9. ANIMASI: fade-in saat elemen masuk layar
     ======================================================= */
  function initReveal() {
    var items = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('visible'); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
      });
    }, { threshold: 0.12 });
    items.forEach(function (el, i) {
      el.style.transitionDelay = (i * 70) + 'ms';
      observer.observe(el);
    });
  }

  /* =======================================================
     10. TRANSISI: efek halus saat pindah ke Website 2
     ======================================================= */
  function initPageTransition() {
    document.querySelectorAll('[data-nav]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var target = a.getAttribute('href');
        document.body.classList.add('leaving');
        setTimeout(function () { window.location.href = target; }, 340);
      });
    });
    window.addEventListener('pageshow', function () { document.body.classList.remove('leaving'); });
  }

  /* =======================================================
     11. INISIALISASI
     ======================================================= */
  document.addEventListener('DOMContentLoaded', function () {
    var ready = initSupabase();
    setConn(ready ? 'wait' : 'bad', ready ? '● Menghubungkan...' : '● Supabase belum dikonfigurasi');

    startClock();
    renderNav();
    applyView();
    $('submitForm').addEventListener('submit', handleSubmit);
    $('formMateri').addEventListener('submit', handleMateriSubmit);
    $('btnToggleMateri').addEventListener('click', toggleMateriPanel);
    $('formEdit').addEventListener('submit', handleEditSave);
    $('dlgCancel').addEventListener('click', function () { $('dlgEdit').close(); });
    $('btnRefresh').addEventListener('click', function () { loadTugas(); loadMateri(); });

    loadTugas();          // ambil riwayat tugas saat halaman dimuat
    loadMateri();         // ambil daftar materi dari database
    subscribeRealtime();  // dengarkan perubahan data secara real-time
    initReveal();
    initPageTransition();
  });
})();