/* =========================================================
   NADHIYA'S ACADEMIC SPACE - PORTAL TUGAS & MATERI
   Redesign tampilan. Logika backend Supabase (SELECT, INSERT,
   UPDATE, DELETE, Storage, Realtime) sama dengan versi sebelumnya.
   Konfigurasi ada di js/config.js. Kode dibungkus IIFE.
   ========================================================= */
(function () {
  'use strict';

  var CFG = window.PORTAL_CONFIG;
  var SUPABASE_URL = CFG.SUPABASE_URL;
  var SUPABASE_ANON_KEY = CFG.SUPABASE_ANON_KEY;
  var TABLE_NAME = CFG.TABLE_NAME;
  var MATERI_TABLE = CFG.MATERI_TABLE;
  var BUCKET = CFG.BUCKET;
  var MAX_FILE_MB = CFG.MAX_FILE_MB;
  var ALLOWED_EXT = CFG.ALLOWED_EXT;
  var MATERI_EXT = CFG.MATERI_EXT;
  var COURSES = CFG.COURSES;
  var FOLDERS = CFG.FOLDERS;
  var SUBFOLDERS = CFG.SUBFOLDERS;
  var DEFAULT_COURSE = CFG.DEFAULT_COURSE;
  var DEFAULT_KATEGORI = CFG.DEFAULT_KATEGORI;
  var ST_DONE = CFG.STATUS_DONE, ST_PROG = CFG.STATUS_PROGRESS, ST_TODO = CFG.STATUS_TODO;

  var MIME_BY_EXT = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  };

  var state = { course: 'adpl', folder: 'tugas', sub: 'tugas_mandiri' };
  var filters = { q: '', course: 'adpl', status: 'all' };
  var allTugas = [];     // seluruh tugas dari database
  var allMateri = [];    // seluruh materi dari database
  var loadedTugas = false, loadedMateri = false;
  var supabase = null;
  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* =======================================================
     1. SUPABASE CLIENT
     ======================================================= */
  function isConfigured() {
    return /^https?:\/\//.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20 && SUPABASE_ANON_KEY.indexOf('ISI_') !== 0;
  }
  function initSupabase() {
    if (!isConfigured()) return false;
    if (!window.supabase || typeof window.supabase.createClient !== 'function') return false;
    // Portal berjalan sebagai pengunjung (anon); sesi login Website Cyber Security tidak dipakai.
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    return true;
  }

  /* =======================================================
     2. HELPER UMUM
     ======================================================= */
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  function showMsg(text, type) { var e = $('formMsg'); e.textContent = text; e.className = 'msg ' + (type || ''); }
  function showMateriMsg(text, type) { var e = $('materiMsg'); e.textContent = text; e.className = 'msg ' + (type || ''); }
  function dlgMsg(text, type) { var e = $('dlgMsg'); e.textContent = text; e.className = 'msg ' + (type || ''); }

  /* Toast (umpan balik berhasil / gagal) */
  function toast(text, type) {
    var box = $('toasts');
    var t = el('div', 'toast ' + (type || 'ok'), text);
    box.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 350);
    }, 3800);
  }

  function setConn(st, text) { var e = $('connStatus'); e.className = 'conn ' + st; e.textContent = text; }

  /* Tombol dengan status loading */
  function setLoadingBtn(btn, on, textOn) {
    var t = btn.querySelector('.btn-t');
    if (on) {
      btn.disabled = true; btn.classList.add('loading');
      if (t) { t.setAttribute('data-orig', t.textContent); t.textContent = textOn || 'Memproses...'; }
    } else {
      btn.disabled = false; btn.classList.remove('loading');
      if (t && t.hasAttribute('data-orig')) { t.textContent = t.getAttribute('data-orig'); t.removeAttribute('data-orig'); }
    }
  }

  /* Validasi inline: tandai input + pesan di bawahnya */
  function fieldErr(id, text) {
    var inp = $(id), msg = $('err_' + id);
    if (msg) msg.textContent = text || '';
    if (inp) { if (text) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid'); }
  }
  function clearFieldErrs() { ['namaTugas', 'fileTugas', 'driveLink'].forEach(function (i) { fieldErr(i, ''); }); }

  function isValidDriveLink(value) {
    try {
      var u = new URL(value);
      return (u.protocol === 'https:' || u.protocol === 'http:') && (u.hostname === 'drive.google.com' || u.hostname === 'docs.google.com');
    } catch (e) { return false; }
  }
  function isSafeUrl(value) {
    try { var u = new URL(value); return u.protocol === 'https:' || u.protocol === 'http:'; } catch (e) { return false; }
  }

  function formatTanggal(str) {
    if (!str) return '-';
    var p = String(str).split('-');
    if (p.length !== 3) return str;
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function formatJam(str) { return str ? String(str).slice(0, 5) : '-'; }

  function pad2(n) { return String(n).padStart(2, '0'); }
  function nowParts() {
    var d = new Date();
    return {
      tanggal: d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()),
      jam: pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()),
      date: d
    };
  }

  /* Jam LIVE pada form: tanggal & jam dibaca ulang tepat saat tombol Kirim ditekan */
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
    setInterval(function () { refreshRelative(); renderGreeting(); }, 30000);
  }

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
    document.querySelectorAll('[data-ts]').forEach(function (e) { e.textContent = relTime(e.getAttribute('data-ts')); });
  }

  function courseByKode(k) {
    for (var i = 0; i < COURSES.length; i++) if (COURSES[i].kode === k) return COURSES[i];
    return COURSES[0];
  }
  function activeKategori() { return state.folder === 'tugas' ? state.sub : state.folder; }
  function kategoriLabel(k) {
    if (k === 'tugas_mandiri') return 'Tugas Mandiri';
    if (k === 'tugas_kelompok') return 'Tugas Kelompok';
    return String(k).toUpperCase();
  }
  function getExt(name) { var d = String(name).lastIndexOf('.'); return d > -1 ? String(name).slice(d + 1).toLowerCase() : ''; }
  function safeFileName(name) {
    var full = String(name), i = full.lastIndexOf('.');
    var base = i > -1 ? full.slice(0, i) : full;
    base = base.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'file';
    return base + '.' + getExt(full);
  }

  /* Kelas badge dari nilai status di database */
  function statusKind(s) {
    var v = String(s || ST_DONE).toLowerCase();
    if (v === 'terkumpul' || v === 'selesai') return 'done';
    if (v.indexOf('sedang') === 0) return 'prog';
    return 'todo';
  }
  function badge(s) { return el('span', 'badge ' + statusKind(s), s || ST_DONE); }

  /* Tautan unduh langsung (parameter ?download= didukung Supabase Storage) */
  function downloadUrl(url, name) {
    return url + (url.indexOf('?') > -1 ? '&' : '?') + 'download=' + encodeURIComponent(name || '');
  }

  /* Angka naik halus pada kartu statistik */
  function animateNumber(node, to) {
    var from = parseInt(node.getAttribute('data-v') || '0', 10);
    if (isNaN(from)) from = 0;
    node.setAttribute('data-v', String(to));
    if (reducedMotion || from === to) { node.textContent = String(to); return; }
    var start = null, dur = 650;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / dur);
      node.textContent = String(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* =======================================================
     3. DATA TURUNAN (disaring di browser)
     ======================================================= */
  function isTugasKategori(t) {
    var k = t.kategori || DEFAULT_KATEGORI;
    return k === 'tugas_mandiri' || k === 'tugas_kelompok';
  }
  function tugasOf(course, kategori) {
    return allTugas.filter(function (t) {
      return (course === 'all' || (t.mata_kuliah || DEFAULT_COURSE) === course) && (t.kategori || DEFAULT_KATEGORI) === kategori;
    });
  }
  function materiOf(course) {
    return allMateri.filter(function (m) { return (m.mata_kuliah || DEFAULT_COURSE) === course; });
  }
  function countFor(course) {
    return materiOf(course).length + allTugas.filter(function (t) { return (t.mata_kuliah || DEFAULT_COURSE) === course; }).length;
  }
  /* Daftar yang ditampilkan = folder aktif + pencarian + filter mata kuliah + filter status */
  function filteredTugas() {
    var q = filters.q.trim().toLowerCase();
    return tugasOf(filters.course, activeKategori()).filter(function (t) {
      if (filters.status !== 'all' && (t.status || ST_DONE) !== filters.status) return false;
      if (!q) return true;
      return ((t.nama_tugas || '') + ' ' + (t.detail_tugas || '') + ' ' + (t.file_nama || '')).toLowerCase().indexOf(q) > -1;
    });
  }

  /* =======================================================
     4. TAMPILAN: header, dashboard
     ======================================================= */
  function renderGreeting() {
    var d = new Date(), h = d.getHours();
    var g = h < 12 ? 'Good Morning' : (h < 18 ? 'Good Afternoon' : 'Good Evening');
    $('greeting').textContent = g + ', ' + CFG.OWNER_NAME;
    $('todayDate').textContent = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  function renderDashboard() {
    $('stCourses').textContent = String(COURSES.length);

    var tugasOnly = allTugas.filter(isTugasKategori);
    var done = tugasOnly.filter(function (t) { return statusKind(t.status) === 'done'; }).length;
    var prog = tugasOnly.filter(function (t) { return statusKind(t.status) === 'prog'; }).length;
    var todo = tugasOnly.length - done - prog;

    if (!loadedTugas) {
      ['stTotal', 'stDone', 'stPending'].forEach(function (i) { $(i).textContent = '–'; $(i).removeAttribute('data-v'); });
      $('statNote').textContent = 'Memuat data dari database…';
    } else {
      animateNumber($('stTotal'), tugasOnly.length);
      animateNumber($('stDone'), done);
      animateNumber($('stPending'), prog + todo);
      var ujian = allTugas.length - tugasOnly.length;
      $('statNote').textContent = 'Dihitung dari tugas mandiri dan kelompok di database. Berkas UTS/UAS (' + ujian + ') dan materi (' + allMateri.length + ') tidak dihitung sebagai tugas.';
    }

    // Donut progres
    var pct = tugasOnly.length ? Math.round(done / tugasOnly.length * 100) : 0;
    $('donutPct').textContent = pct + '%';
    $('donutFg').setAttribute('stroke-dasharray', (pct / 100 * 314.16).toFixed(1) + ' 314.16');
    $('lgDone').textContent = String(done);
    $('lgProg').textContent = String(prog);
    $('lgTodo').textContent = String(todo);
    $('donut').setAttribute('aria-label', pct + ' persen tugas selesai');

    renderActivity();
    renderCourseCards();
  }

  /* Aktivitas terbaru: 6 baris teratas dari database (sudah urut created_at desc) */
  function renderActivity() {
    var box = $('activityList');
    box.innerHTML = '';
    if (!loadedTugas) {
      for (var i = 0; i < 3; i++) box.appendChild(el('li', 'skeleton-row'));
      return;
    }
    if (!allTugas.length) { box.appendChild(el('li', 'empty', 'Belum ada aktivitas. Kumpulkan tugas pertama di My Tasks.')); return; }
    allTugas.slice(0, 6).forEach(function (t) {
      var li = el('li', 'act-item');
      var btn = el('button', 'act-btn');
      btn.type = 'button';
      btn.addEventListener('click', function () { openDetail('tugas', t); });

      var dot = el('span', 'act-dot ' + statusKind(t.status));
      var main = el('div', 'act-main');
      main.appendChild(el('b', '', t.nama_tugas || '(Tanpa nama)'));
      var c = courseByKode(t.mata_kuliah || DEFAULT_COURSE);
      main.appendChild(el('small', '', c.pendek + ' · ' + kategoriLabel(t.kategori || DEFAULT_KATEGORI) + ' · ' + formatTanggal(t.tanggal_pengumpulan)));
      btn.appendChild(dot); btn.appendChild(main); btn.appendChild(badge(t.status));
      li.appendChild(btn);
      box.appendChild(li);
    });
  }

  /* 8 kartu mata kuliah (data tetap dari config, jumlah isi dari database) */
  function renderCourseCards() {
    var grid = $('courseGrid');
    grid.innerHTML = '';
    COURSES.forEach(function (c, i) {
      var card = el('article', 'course-card');
      var top = el('div', 'cc-top');
      top.appendChild(el('span', 'cc-ico', c.icon));
      top.appendChild(el('span', 'cc-num', String(i + 1).padStart(2, '0')));
      card.appendChild(top);
      card.appendChild(el('h3', '', c.nama));
      card.appendChild(el('p', 'cc-desc', c.desc || ''));
      var n = countFor(c.kode);
      card.appendChild(el('p', 'cc-count', (loadedTugas || loadedMateri) ? n + ' isi tersimpan' : 'Memuat…'));
      var btn = el('button', 'btn btn-ghost btn-sm', 'Lihat Detail');
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Lihat detail ' + c.nama);
      btn.addEventListener('click', function () { openCourse(c.kode); });
      card.appendChild(btn);
      grid.appendChild(card);
    });
  }

  function openCourse(kode) {
    state.course = kode; filters.course = kode; state.folder = 'tugas'; state.sub = 'tugas_mandiri';
    applyView();
    $('tasks').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  }

  /* =======================================================
     5. TAMPILAN: navigasi folder (My Tasks)
     ======================================================= */
  function fillCourseSelect(sel, value, withAll) {
    sel.innerHTML = '';
    if (withAll) { var a = el('option', '', 'Semua mata kuliah'); a.value = 'all'; sel.appendChild(a); }
    COURSES.forEach(function (c) { var o = el('option', '', c.pendek + ' - ' + c.nama); o.value = c.kode; sel.appendChild(o); });
    sel.value = value;
  }
  function makeTab(text, selected, onClick) {
    var b = el('button', 'tab' + (selected ? ' active' : ''), text);
    b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', selected ? 'true' : 'false');
    b.addEventListener('click', onClick);
    return b;
  }

  function renderNav() {
    fillCourseSelect($('courseSelect'), state.course, false);
    fillCourseSelect($('formCourse'), state.course, false);
    fillCourseSelect($('filterCourse'), filters.course, true);

    var tabs = $('folderTabs');
    tabs.innerHTML = '';
    FOLDERS.forEach(function (f) {
      tabs.appendChild(makeTab(f.icon + ' ' + f.label, f.id === state.folder, function () { state.folder = f.id; applyView(); }));
    });

    var sub = $('subTabs');
    sub.innerHTML = '';
    if (state.folder === 'tugas') {
      sub.removeAttribute('hidden');
      SUBFOLDERS.forEach(function (f) {
        sub.appendChild(makeTab(f.label + ' (' + tugasOf(state.course, f.id).length + ')', f.id === state.sub, function () { state.sub = f.id; applyView(); }));
      });
    } else { sub.setAttribute('hidden', ''); }

    var c = courseByKode(state.course);
    var path = [c.nama, FOLDERS.filter(function (f) { return f.id === state.folder; })[0].label];
    if (state.folder === 'tugas') path.push(kategoriLabel(state.sub));
    $('crumb').textContent = '📂 ' + path.join('  ›  ');
  }

  /* Satu fungsi untuk menyusun ulang seluruh tampilan sesuai folder aktif */
  function applyView() {
    var c = courseByKode(state.course);
    var isMateri = state.folder === 'materi';

    $('profDosen').textContent = c.dosen || 'Belum diisi';
    $('materi').hidden = !isMateri;
    $('taskArea').hidden = isMateri;

    if (isMateri) {
      $('materiSub').textContent = c.nama;
      if (loadedMateri) renderMateri(materiOf(state.course));
    } else {
      var kat = activeKategori(), nm = kategoriLabel(kat);
      var isUjian = kat === 'uts' || kat === 'uas';
      $('formTitle').textContent = isUjian ? 'Unggah Berkas ' + nm : 'Kumpulkan ' + nm;
      $('formTarget').textContent = '📂 Disimpan ke: ' + c.pendek + ' › ' + (state.folder === 'tugas' ? 'Tugas › ' : '') + nm;
      $('listTitle').textContent = 'Daftar ' + nm;
      $('listSub').textContent = filters.course === 'all' ? 'Semua mata kuliah' : courseByKode(filters.course).nama;
      if (loadedTugas) renderTugas(filteredTugas());
    }
    renderNav();
    renderDashboard();
  }

  /* =======================================================
     6. TAMPILAN: daftar tugas
     ======================================================= */
  function renderNotice(text, isError) {
    var box = $('tugasList');
    box.innerHTML = '';
    box.appendChild(el('p', 'empty' + (isError ? ' error' : ''), text));
  }
  function showSkeleton(box) {
    box.innerHTML = '';
    box.appendChild(el('div', 'skeleton-card')); box.appendChild(el('div', 'skeleton-card'));
  }

  function actionLink(cls, text, href, download) {
    var a = el('a', 'btn btn-sm ' + cls, text);
    a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
    if (download) a.setAttribute('download', '');
    return a;
  }

  function renderTugas(list) {
    var box = $('tugasList');
    box.innerHTML = '';

    if (!list || list.length === 0) {
      var filtered = filters.q || filters.status !== 'all';
      renderNotice(filtered
        ? 'Tidak ada tugas yang cocok dengan pencarian atau filter.'
        : 'Folder ' + kategoriLabel(activeKategori()) + (filters.course === 'all' ? '' : ' untuk ' + courseByKode(filters.course).pendek) + ' masih kosong. Isi form untuk menambahkan yang pertama.', false);
      return;
    }

    list.forEach(function (t) {
      var card = el('article', 'tugas-card');

      var head = el('div', 'tugas-head');
      head.appendChild(el('h4', '', t.nama_tugas || '(Tanpa nama)'));
      head.appendChild(badge(t.status));
      card.appendChild(head);

      var c = courseByKode(t.mata_kuliah || DEFAULT_COURSE);
      card.appendChild(el('div', 't-course', c.pendek + ' · ' + c.nama));

      var meta = el('div', 't-meta', '📅 ' + formatTanggal(t.tanggal_pengumpulan) + '  ·  🕒 ' + formatJam(t.jam_pengumpulan));
      if (t.created_at) {
        var rel = el('span', 'rel', relTime(t.created_at));
        rel.setAttribute('data-ts', t.created_at);
        meta.appendChild(document.createTextNode('  ·  ')); meta.appendChild(rel);
      }
      card.appendChild(meta);
      card.appendChild(el('p', 't-detail', t.detail_tugas ? t.detail_tugas : 'Tidak ada detail tugas.'));
      if (t.file_url && t.file_nama) card.appendChild(el('div', 't-file', '📎 ' + t.file_nama));

      var actions = el('div', 'tugas-actions');
      var det = el('button', 'btn btn-sm btn-ghost', 'Lihat Detail');
      det.type = 'button';
      det.addEventListener('click', function () { openDetail('tugas', t); });
      actions.appendChild(det);
      if (t.file_url && isSafeUrl(t.file_url)) actions.appendChild(actionLink('btn-primary', 'Buka File ↗', t.file_url));
      if (t.link_drive && isSafeUrl(t.link_drive)) actions.appendChild(actionLink(t.file_url ? 'btn-ghost' : 'btn-primary', 'Buka Link ↗', t.link_drive));
      card.appendChild(actions);
      card.appendChild(crudButtons('tugas', t));
      box.appendChild(card);
    });
  }

  /* =======================================================
     7. TAMPILAN: materi
     ======================================================= */
  function renderMateriNotice(text, isError) {
    var box = $('materiList');
    box.innerHTML = '';
    box.appendChild(el('p', 'empty' + (isError ? ' error' : ''), text));
  }

  function renderMateri(list) {
    var box = $('materiList');
    box.innerHTML = '';
    if (!list || list.length === 0) {
      renderMateriNotice('Folder Materi ' + courseByKode(state.course).pendek + ' masih kosong. Tambahkan lewat tombol "Tambah Materi" atau langsung dari database.', false);
      return;
    }
    var c = courseByKode(state.course);
    list.forEach(function (m) {
      var item = el('article', 'chap');
      var top = el('div', 'chap-top');
      top.appendChild(el('span', 'bab', String(m.bab || '').toUpperCase()));
      top.appendChild(el('span', 'chap-course', c.pendek));
      item.appendChild(top);
      item.appendChild(el('h4', '', m.judul || '(Tanpa judul)'));
      if (m.deskripsi) item.appendChild(el('p', 'chap-desc', m.deskripsi));
      if (m.file_nama) item.appendChild(el('div', 't-file', '📎 ' + m.file_nama));

      var acts = el('div', 'tugas-actions');
      if (m.file_url && isSafeUrl(m.file_url)) {
        acts.appendChild(actionLink('btn-primary', 'Buka ↗', m.file_url));
        acts.appendChild(actionLink('btn-ghost', 'Unduh ⬇', downloadUrl(m.file_url, m.file_nama), true));
      }
      if (m.link_materi && isSafeUrl(m.link_materi)) acts.appendChild(actionLink(m.file_url ? 'btn-ghost' : 'btn-primary', 'Buka Link ↗', m.link_materi));
      if (acts.children.length) item.appendChild(acts);
      item.appendChild(crudButtons('materi', m));
      box.appendChild(item);
    });
  }

  /* =======================================================
     8. DIALOG DETAIL
     ======================================================= */
  function openDetail(type, row) {
    var body = $('detBody');
    body.innerHTML = '';
    var isT = type === 'tugas';
    $('detTitle').textContent = isT ? (row.nama_tugas || '(Tanpa nama)') : (row.judul || '(Tanpa judul)');
    var c = courseByKode(row.mata_kuliah || DEFAULT_COURSE);
    var rows = [['Mata kuliah', c.nama]];
    if (isT) {
      rows.push(['Folder', kategoriLabel(row.kategori || DEFAULT_KATEGORI)]);
      rows.push(['Status', null]);
      rows.push(['Tanggal & jam', formatTanggal(row.tanggal_pengumpulan) + ', ' + formatJam(row.jam_pengumpulan)]);
      rows.push(['Deskripsi', row.detail_tugas || 'Tidak ada detail tugas.']);
      rows.push(['File', row.file_nama || '-']);
    } else {
      rows.push(['Bab', row.bab || '-']);
      rows.push(['Deskripsi', row.deskripsi || '-']);
      rows.push(['File', row.file_nama || '-']);
    }
    var dl = el('dl', 'det-list');
    rows.forEach(function (r) {
      var wrap = el('div');
      wrap.appendChild(el('dt', '', r[0]));
      var dd = el('dd');
      if (r[1] === null) dd.appendChild(badge(row.status)); else dd.textContent = r[1];
      wrap.appendChild(dd); dl.appendChild(wrap);
    });
    body.appendChild(dl);

    var acts = el('div', 'tugas-actions');
    var link = isT ? row.link_drive : row.link_materi;
    if (row.file_url && isSafeUrl(row.file_url)) {
      acts.appendChild(actionLink('btn-primary', 'Buka File ↗', row.file_url));
      acts.appendChild(actionLink('btn-ghost', 'Unduh ⬇', downloadUrl(row.file_url, row.file_nama), true));
    }
    if (link && isSafeUrl(link)) acts.appendChild(actionLink('btn-ghost', 'Buka Link ↗', link));
    if (acts.children.length) body.appendChild(acts);
    $('dlgDetail').showModal();
  }

  /* =======================================================
     9. SUPABASE: ambil data (SELECT)
     ======================================================= */
  async function loadTugas() {
    if (!supabase) {
      renderNotice(isConfigured()
        ? 'Library Supabase gagal dimuat. Periksa koneksi internet lalu muat ulang halaman.'
        : 'Supabase belum dikonfigurasi. Buka js/config.js lalu isi SUPABASE_URL dan SUPABASE_ANON_KEY.', true);
      applyView();
      return;
    }
    try {
      var result = await supabase.from(TABLE_NAME).select('*').order('created_at', { ascending: false });
      if (result.error) throw result.error;
      allTugas = result.data || [];
      loadedTugas = true;
      applyView();
      setConn('ok', '● Terhubung ke Supabase');
    } catch (err) {
      renderNotice('Gagal mengambil data: ' + (err.message || err) + '. Pastikan supabase-setup-v4.sql sudah dijalankan.', true);
      setConn('bad', '● Gagal terhubung');
      $('statNote').textContent = 'Data tidak dapat dimuat.';
    }
  }

  async function loadMateri() {
    if (!supabase) { renderMateriNotice('Materi belum bisa dimuat karena Supabase belum terhubung.', true); return; }
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
     10. SUPABASE: upload file ke Storage
     ======================================================= */
  async function uploadFile(file, folder) {
    var ext = getExt(file.name);
    var path = (folder ? folder + '/' : '') + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '-' + safeFileName(file.name);
    var up = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: '3600', upsert: false, contentType: MIME_BY_EXT[ext] || file.type
    });
    if (up.error) throw up.error;
    var pub = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { url: pub.data.publicUrl, path: path, nama: file.name };
  }

  function validateFile(file, allowed) {
    if (!file) return '';
    allowed = allowed || ALLOWED_EXT;
    if (allowed.indexOf(getExt(file.name)) === -1) return 'Format file tidak didukung. Gunakan ' + allowed.join(', ').toUpperCase() + '.';
    if (file.size > MAX_FILE_MB * 1024 * 1024) return 'Ukuran file terlalu besar. Maksimal ' + MAX_FILE_MB + ' MB.';
    if (file.size === 0) return 'File kosong, pilih file lain.';
    return '';
  }

  /* =======================================================
     11. SUPABASE: simpan tugas (INSERT)
     ======================================================= */
  async function handleSubmit(event) {
    event.preventDefault();
    clearFieldErrs();

    var nama = $('namaTugas').value.trim();
    tickClock();
    var tanggal = $('tanggalTugas').value, jam = $('jamTugas').value;
    var detail = $('detailTugas').value.trim();
    var link = $('driveLink').value.trim();
    var file = $('fileTugas').files[0] || null;
    var status = $('statusTugas').value || ST_DONE;

    if (!nama) { fieldErr('namaTugas', 'Nama tugas tidak boleh kosong.'); showMsg('Periksa isian yang bertanda merah.', 'err'); $('namaTugas').focus(); return; }
    if (status === ST_DONE && !file && !link) {
      fieldErr('fileTugas', 'Unggah file Word/PDF atau isi link Drive.');
      fieldErr('driveLink', 'Atau isi link Google Drive (minimal salah satu).');
      showMsg('Status Terkumpul memerlukan file atau link.', 'err'); return;
    }
    var fileError = validateFile(file);
    if (fileError) { fieldErr('fileTugas', fileError); showMsg(fileError, 'err'); return; }
    if (link && !isValidDriveLink(link)) {
      fieldErr('driveLink', 'Gunakan link dari drive.google.com atau docs.google.com.');
      showMsg('Link tidak valid.', 'err'); $('driveLink').focus(); return;
    }
    if (!supabase) { showMsg('Supabase belum terhubung. Periksa js/config.js.', 'err'); toast('Supabase belum terhubung.', 'err'); return; }

    var btn = $('btnSubmit');
    setLoadingBtn(btn, true, 'Mengirim...');
    try {
      var uploaded = null;
      if (file) { showMsg('Mengunggah file...', ''); uploaded = await uploadFile(file, state.course + '/' + activeKategori()); }

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
        status: status
      }]);
      if (result.error) throw result.error;

      $('submitForm').reset();
      $('formCourse').value = state.course;
      tickClock();
      var okText = 'Berhasil! "' + nama + '" tersimpan di ' + courseByKode(state.course).pendek + ' › ' + kategoriLabel(activeKategori()) + ' pada ' + formatJam(jam) + ' ' + formatTanggal(tanggal) + '.';
      showMsg(okText, 'ok'); toast('Tersimpan: ' + nama, 'ok');
      await loadTugas();
    } catch (err) {
      showMsg('Gagal menyimpan: ' + (err.message || err), 'err');
      toast('Gagal menyimpan tugas.', 'err');
    } finally {
      setLoadingBtn(btn, false);
    }
  }

  /* =======================================================
     12. SUPABASE: tambah materi (INSERT)
     ======================================================= */
  async function handleMateriSubmit(event) {
    event.preventDefault();
    var bab = $('materiBab').value.trim(), judul = $('materiJudul').value.trim();
    var deskripsi = $('materiDeskripsi').value.trim(), urutanRaw = $('materiUrutan').value.trim();
    var link = $('materiLink').value.trim(), file = $('materiFile').files[0] || null;

    if (!bab) { showMateriMsg('Bab / pertemuan wajib diisi.', 'err'); return; }
    if (!judul) { showMateriMsg('Judul materi wajib diisi.', 'err'); return; }
    if (urutanRaw !== '' && !/^\d{1,3}$/.test(urutanRaw)) { showMateriMsg('Urutan harus berupa angka 0-999.', 'err'); return; }
    if (link && !isSafeUrl(link)) { showMateriMsg('Link materi harus diawali http:// atau https://', 'err'); return; }
    var fileError = validateFile(file, MATERI_EXT);
    if (fileError) { showMateriMsg(fileError, 'err'); return; }
    if (!supabase) { showMateriMsg('Supabase belum terhubung. Periksa js/config.js.', 'err'); return; }

    var btn = $('btnMateri');
    setLoadingBtn(btn, true, 'Menyimpan...');
    try {
      var uploaded = null;
      if (file) { showMateriMsg('Mengunggah file...', ''); uploaded = await uploadFile(file, state.course + '/materi'); }
      showMateriMsg('Menyimpan materi...', '');
      var result = await supabase.from(MATERI_TABLE).insert([{
        mata_kuliah: state.course,
        bab: bab, judul: judul, deskripsi: deskripsi,
        link_materi: link || null,
        urutan: urutanRaw === '' ? 0 : parseInt(urutanRaw, 10),
        file_url: uploaded ? uploaded.url : null,
        file_nama: uploaded ? uploaded.nama : null,
        file_path: uploaded ? uploaded.path : null
      }]);
      if (result.error) throw result.error;
      $('formMateri').reset();
      showMateriMsg('Berhasil! Materi "' + judul + '" tersimpan.', 'ok'); toast('Materi tersimpan: ' + judul, 'ok');
      await loadMateri();
    } catch (err) {
      showMateriMsg('Gagal menyimpan materi: ' + (err.message || err), 'err');
      toast('Gagal menyimpan materi.', 'err');
    } finally {
      setLoadingBtn(btn, false);
    }
  }

  /* =======================================================
     13. EDIT & HAPUS (UPDATE + DELETE) - butuh supabase-crud-v1.sql
     ======================================================= */
  var editing = null;

  function crudButtons(type, row) {
    var wrap = el('div', 'tugas-actions crud');
    var edit = el('button', 'btn btn-sm btn-ghost', '✎ Edit');
    edit.type = 'button';
    edit.addEventListener('click', function () { openEdit(type, row); });
    var del = el('button', 'btn btn-sm btn-danger', '🗑 Hapus');
    del.type = 'button';
    del.addEventListener('click', function () { deleteItem(type, row); });
    wrap.appendChild(edit); wrap.appendChild(del);
    return wrap;
  }

  var EDIT_FIELDS = {
    tugas: [
      { key: 'nama_tugas', label: 'Nama Tugas', type: 'text', max: 120 },
      { key: 'status', label: 'Status', type: 'select', options: [ST_DONE, ST_PROG, ST_TODO] },
      { key: 'detail_tugas', label: 'Detail / Deskripsi', type: 'textarea', max: 500 },
      { key: 'link_drive', label: 'Link Google Drive', type: 'url' }
    ],
    materi: [
      { key: 'bab', label: 'Bab / Pertemuan', type: 'text', max: 30 },
      { key: 'judul', label: 'Judul Materi', type: 'text', max: 150 },
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
      var wrap = el('div', 'field');
      var lab = el('label', '', f.label); lab.setAttribute('for', 'ed_' + f.key);
      var inp;
      if (f.type === 'textarea') { inp = el('textarea'); inp.rows = 3; }
      else if (f.type === 'select') {
        inp = el('select');
        f.options.forEach(function (o) { var op = el('option', '', o); op.value = o; inp.appendChild(op); });
      } else { inp = el('input'); inp.type = f.type; }
      inp.id = 'ed_' + f.key;
      if (f.max) inp.maxLength = f.max;
      var val = row[f.key] === null || row[f.key] === undefined ? '' : row[f.key];
      if (f.type === 'select' && f.options.indexOf(val) === -1) val = ST_DONE;
      inp.value = val;
      wrap.appendChild(lab); wrap.appendChild(inp); box.appendChild(wrap);
    });
    dlgMsg('', '');
    $('dlgEdit').showModal();
  }

  async function handleEditSave(event) {
    event.preventDefault();
    if (!editing || !supabase) return;
    var type = editing.type, row = editing.row, v = {};
    EDIT_FIELDS[type].forEach(function (f) { v[f.key] = $('ed_' + f.key).value.trim(); });

    var payload;
    if (type === 'tugas') {
      if (!v.nama_tugas) return dlgMsg('Nama tugas tidak boleh kosong.', 'err');
      if (v.link_drive && !isValidDriveLink(v.link_drive)) return dlgMsg('Link harus dari drive.google.com atau docs.google.com.', 'err');
      if (v.status === ST_DONE && !v.link_drive && !row.file_url) return dlgMsg('Status Terkumpul memerlukan file atau link Drive.', 'err');
      payload = { nama_tugas: v.nama_tugas, status: v.status, detail_tugas: v.detail_tugas, link_drive: v.link_drive || null };
    } else {
      if (!v.bab) return dlgMsg('Bab / pertemuan wajib diisi.', 'err');
      if (!v.judul) return dlgMsg('Judul materi wajib diisi.', 'err');
      if (v.urutan !== '' && !/^\d{1,3}$/.test(v.urutan)) return dlgMsg('Urutan harus angka 0-999.', 'err');
      if (v.link_materi && !isSafeUrl(v.link_materi)) return dlgMsg('Link harus diawali http:// atau https://', 'err');
      payload = { bab: v.bab, judul: v.judul, deskripsi: v.deskripsi, link_materi: v.link_materi || null, urutan: v.urutan === '' ? 0 : parseInt(v.urutan, 10) };
    }

    var btn = $('dlgSave'); btn.disabled = true; dlgMsg('Menyimpan...', '');
    try {
      var table = type === 'tugas' ? TABLE_NAME : MATERI_TABLE;
      var res = await supabase.from(table).update(payload).eq('id', row.id).select();
      if (res.error) throw res.error;
      if (!res.data || res.data.length === 0) throw new Error('Tidak ada data yang berubah. Jalankan supabase-crud-v1.sql di Supabase.');
      $('dlgEdit').close();
      toast('Perubahan tersimpan.', 'ok');
      await (type === 'tugas' ? loadTugas() : loadMateri());
    } catch (err) {
      dlgMsg('Gagal menyimpan: ' + (err.message || err), 'err');
    } finally { btn.disabled = false; }
  }

  async function deleteItem(type, row) {
    if (!supabase) { toast('Supabase belum terhubung.', 'err'); return; }
    var nama = type === 'tugas' ? row.nama_tugas : row.judul;
    if (!window.confirm('Hapus "' + (nama || 'data ini') + '"?\nTindakan ini tidak dapat dibatalkan.')) return;
    try {
      var table = type === 'tugas' ? TABLE_NAME : MATERI_TABLE;
      var res = await supabase.from(table).delete().eq('id', row.id).select();
      if (res.error) throw res.error;
      if (!res.data || res.data.length === 0) throw new Error('Data tidak terhapus. Jalankan supabase-crud-v1.sql di Supabase.');
      if (row.file_path) { try { await supabase.storage.from(BUCKET).remove([row.file_path]); } catch (e) { /* abaikan */ } }
      toast('Data dihapus.', 'ok');
      await (type === 'tugas' ? loadTugas() : loadMateri());
    } catch (err) {
      toast('Gagal menghapus: ' + (err.message || err), 'err');
    }
  }

  function toggleMateriPanel() {
    var panel = $('panelMateri'), btn = $('btnToggleMateri');
    var willOpen = panel.hasAttribute('hidden');
    if (willOpen) panel.removeAttribute('hidden'); else panel.setAttribute('hidden', '');
    btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    btn.textContent = willOpen ? '✕ Tutup Form' : '＋ Tambah Materi';
  }

  /* =======================================================
     14. REALTIME
     ======================================================= */
  function subscribeRealtime() {
    if (!supabase) return;
    try {
      supabase.channel('portal-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: TABLE_NAME }, function () { loadTugas(); })
        .on('postgres_changes', { event: '*', schema: 'public', table: MATERI_TABLE }, function () { loadMateri(); })
        .subscribe();
    } catch (e) { /* realtime opsional */ }
  }

  /* =======================================================
     15. UI: navbar, animasi, transisi
     ======================================================= */
  function initNav() {
    var nav = $('nav'), burger = $('burger'), links = $('navLinks');
    function onScroll() { nav.classList.toggle('scrolled', window.scrollY > 12); }
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

    burger.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      burger.setAttribute('aria-label', open ? 'Tutup menu' : 'Buka menu');
      burger.classList.toggle('open', open);
    });
    links.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        links.classList.remove('open'); burger.classList.remove('open');
        burger.setAttribute('aria-expanded', 'false'); burger.setAttribute('aria-label', 'Buka menu');
      });
    });

    // Tandai menu aktif sesuai bagian yang sedang terlihat
    if ('IntersectionObserver' in window) {
      var map = {};
      links.querySelectorAll('a[data-sec]').forEach(function (a) { map[a.getAttribute('data-sec')] = a; });
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting && map[e.target.id]) {
            Object.keys(map).forEach(function (k) { map[k].classList.remove('active'); });
            map[e.target.id].classList.add('active');
          }
        });
      }, { rootMargin: '-45% 0px -50% 0px' });
      Object.keys(map).forEach(function (id) { var s = $(id); if (s) io.observe(s); });
    }
  }

  function initReveal() {
    var items = document.querySelectorAll('.reveal');
    if (reducedMotion || !('IntersectionObserver' in window)) { items.forEach(function (e) { e.classList.add('visible'); }); return; }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); } });
    }, { threshold: 0.08 });
    items.forEach(function (e) { observer.observe(e); });
  }

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

  function bindFilters() {
    $('courseSelect').addEventListener('change', function () { state.course = this.value; filters.course = this.value; applyView(); });
    $('formCourse').addEventListener('change', function () { state.course = this.value; if (filters.course !== 'all') filters.course = this.value; applyView(); });
    $('filterCourse').addEventListener('change', function () {
      filters.course = this.value;
      if (this.value !== 'all') state.course = this.value;
      applyView();
    });
    $('filterStatus').addEventListener('change', function () { filters.status = this.value; if (loadedTugas) renderTugas(filteredTugas()); });
    var timer = null;
    $('searchTugas').addEventListener('input', function () {
      var v = this.value;
      clearTimeout(timer);
      timer = setTimeout(function () { filters.q = v; if (loadedTugas) renderTugas(filteredTugas()); }, 150);
    });
  }

  /* =======================================================
     16. INISIALISASI
     ======================================================= */
  document.addEventListener('DOMContentLoaded', function () {
    var ready = initSupabase();
    setConn(ready ? 'wait' : 'bad', ready ? '● Menghubungkan...' : '● Supabase belum dikonfigurasi');

    renderGreeting();
    startClock();
    initNav();
    bindFilters();
    renderNav();
    applyView();

    $('submitForm').addEventListener('submit', handleSubmit);
    $('formMateri').addEventListener('submit', handleMateriSubmit);
    $('btnToggleMateri').addEventListener('click', toggleMateriPanel);
    $('formEdit').addEventListener('submit', handleEditSave);
    $('dlgCancel').addEventListener('click', function () { $('dlgEdit').close(); });
    $('detClose').addEventListener('click', function () { $('dlgDetail').close(); });
    $('dlgDetail').addEventListener('click', function (e) { if (e.target === this) this.close(); });
    $('btnRefresh').addEventListener('click', async function () {
      var b = this; b.disabled = true; b.textContent = '↻ Memuat...';
      showSkeleton($('tugasList'));
      await Promise.all([loadTugas(), loadMateri()]);
      b.disabled = false; b.textContent = '↻ Muat Ulang';
    });

    loadTugas();
    loadMateri();
    subscribeRealtime();
    initReveal();
    initPageTransition();
  });
})();
