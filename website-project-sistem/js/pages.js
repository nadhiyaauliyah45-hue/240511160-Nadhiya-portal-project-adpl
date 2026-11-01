/* =====================================================================
   HALAMAN APLIKASI
   Semua pembatasan akses DIPAKSA oleh database (RLS + fungsi SECURITY
   DEFINER). Menyembunyikan menu di sini hanya untuk kenyamanan tampilan.
   ===================================================================== */
(function (CS) {
  'use strict';
  var C = window.CS_CONFIG, el = CS.el;
  var sb = function () { return CS.client(); };
  var ADM = ['administrator'], OWN = ['administrator', 'pemilik'], ALL = ['administrator', 'pemilik', 'pegawai'];
  var isAdmin = function () { return CS.user && CS.user.role === 'administrator'; };
  var clean = function (s) { return String(s || '').replace(/[^\w@.:\- ]/g, '').slice(0, 60); };

  /* ---------- Pembantu daftar berhalaman + ekspor CSV ---------- */
  function listView(box, o) {
    var rows = [], done = false, wrap = el('div'), info = el('p', { class: 'hint' }), more = el('button', { type: 'button', class: 'btn ghost sm', text: 'Muat lebih banyak' });
    var table = el('div');
    wrap.appendChild(table); wrap.appendChild(el('div', { class: 'list-foot' }, info, more));
    box.appendChild(wrap);
    async function load(reset) {
      if (reset) { rows = []; done = false; CS.clear(table).appendChild(CS.loading()); }
      var r = await o.build().range(rows.length, rows.length + C.PAGE_SIZE - 1);
      if (r.error) { CS.clear(table).appendChild(CS.errorBox(r.error)); more.hidden = true; return; }
      rows = rows.concat(r.data || []); done = (r.data || []).length < C.PAGE_SIZE;
      CS.clear(table);
      table.appendChild(rows.length ? CS.table(o.cols, rows) : CS.empty(o.emptyText || 'Belum ada data pada rentang/filter ini.'));
      info.textContent = rows.length + ' baris ditampilkan' + (done ? '.' : ' (masih ada data lain).');
      more.hidden = done;
    }
    more.addEventListener('click', function () { load(false); });
    var api = {
      reload: function () { return load(true); },
      exportCsv: function (name) {
        if (!rows.length) return CS.toast('Tidak ada data untuk diekspor.', 'err');
        var cols = o.csvCols || o.cols;
        var text = CS.toCSV(cols.map(function (c) { return c.label; }), rows.map(function (r) {
          return cols.map(function (c) { var v = c.csv ? c.csv(r) : (c.key ? r[c.key] : ''); return v; });
        }));
        CS.download(name + '-' + new Date().toISOString().slice(0, 10) + '.csv', text);
      }
    };
    api.reload();
    return api;
  }
  function pageHead(title, sub, actions) {
    return el('div', { class: 'page-head' }, el('div', null, el('h2', { text: title }), sub ? el('p', { class: 'sub', text: sub }) : null), el('div', { class: 'actions' }, actions));
  }
  function field(label, input) { return el('label', { class: 'f' }, el('span', { text: label }), input); }
  function sel(id, opts, val) {
    var s = el('select', { id: id });
    opts.forEach(function (o) { s.appendChild(el('option', { value: o[0], text: o[1] })); });
    if (val) s.value = val; return s;
  }
  async function rpc(name, args) { var r = await sb().rpc(name, args); return r; }

  var P = CS.pages = {};

  /* =================== DASHBOARD =================== */
  P.dashboard = { label: 'Dashboard', icon: '▦', roles: ALL, async render(box) {
    var rg = CS.rangeIso(), canDetail = CS.user.role !== 'pegawai';
    box.appendChild(pageHead('Dashboard Keamanan', 'Ringkasan aktivitas login dan ancaman dari data sebenarnya di database.',
      el('button', { type: 'button', class: 'btn ghost sm', text: '↻ Muat ulang', onclick: function () { CS.go('dashboard'); } })));
    box.appendChild(CS.rangeBar(function () { CS.go('dashboard'); }));

    var cards = el('div', { class: 'cards' }); box.appendChild(cards);
    var s = await rpc('dashboard_summary', { p_from: rg.from, p_to: rg.to });
    var status = el('div', { class: 'panel' }, el('h3', { text: 'Status Sistem' }));
    if (s.error) {
      cards.appendChild(CS.errorBox(s.error));
      status.appendChild(statusRow('Koneksi database', 'Gagal terhubung', 'red'));
    } else {
      var d = s.data || {};
      [['Total percobaan login', d.total_login, 'gray'], ['Login berhasil', d.login_berhasil, 'green'], ['Login gagal', d.login_gagal, 'red'],
       ['Kode 2FA salah', d['2fa_gagal'], 'orange'], ['Peristiwa mencurigakan', d.mencurigakan, 'orange'], ['IP sedang diblokir', d.ip_diblokir, 'crit']]
        .forEach(function (c) { cards.appendChild(el('div', { class: 'stat s-' + c[2] }, el('div', { class: 'n', text: CS.num(c[1]) }), el('div', { class: 'l', text: c[0] }))); });
      status.appendChild(statusRow('Koneksi database', 'Terhubung', 'green'));
      status.appendChild(statusRow('Autentikasi dua faktor', 'Sesi terverifikasi (AAL2)', 'green'));
      status.appendChild(statusRow('Peristiwa terbuka', CS.num(d.peristiwa_terbuka) + ' perlu ditinjau', d.peristiwa_terbuka > 0 ? 'orange' : 'green'));
      status.appendChild(statusRow('Data diperbarui', CS.fmtDT(d.generated_at), 'gray'));
      if (!Number(d.total_login)) box.appendChild(el('div', { class: 'alert info' }, 'Belum ada percobaan login pada rentang waktu ini. Angka di atas menunjukkan 0, bukan data contoh.'));
    }
    var grid = el('div', { class: 'grid2' }); box.appendChild(grid);

    // Tren
    var trend = el('div', { class: 'panel wide' }, el('h3', { text: 'Tren Login Berhasil dan Gagal' }));
    grid.appendChild(trend);
    if (!canDetail) trend.appendChild(CS.empty('Peran Pegawai hanya dapat melihat ringkasan angka.'));
    else {
      var span = CS.range.to - CS.range.from, bucket = span <= 3 * 864e5 ? 'hour' : 'day';
      var t = await rpc('login_trend', { p_from: rg.from, p_to: rg.to, p_bucket: bucket });
      if (t.error) trend.appendChild(CS.errorBox(t.error));
      else if (!t.data.length) trend.appendChild(CS.empty('Belum ada data login pada rentang waktu ini.'));
      else {
        var map = {}; t.data.forEach(function (r) { map[new Date(r.bucket).getTime()] = r; });
        var step = bucket === 'hour' ? 36e5 : 864e5, labels = [], a = [], b = [];
        var cur = new Date(CS.range.from); bucket === 'hour' ? cur.setMinutes(0, 0, 0) : cur.setHours(0, 0, 0, 0);
        for (var k = +cur, n = 0; k < +CS.range.to && n < 200; k += step, n++) {
          var r = map[k]; var dd = new Date(k);
          labels.push(bucket === 'hour' ? String(dd.getHours()).padStart(2, '0') + ':00' : dd.getDate() + '/' + (dd.getMonth() + 1));
          a.push(r ? Number(r.berhasil) : 0); b.push(r ? Number(r.gagal) : 0);
        }
        trend.appendChild(el('p', { class: 'hint', text: 'Setiap kelompok batang = satu ' + (bucket === 'hour' ? 'jam' : 'hari') + '. Hijau berhasil, merah gagal.' }));
        trend.appendChild(CS.barChart(labels, a, b, 'Berhasil', 'Gagal'));
      }
    }
    grid.appendChild(status);

    // Ancaman terbaru
    var thr = el('div', { class: 'panel' }, el('h3', { text: 'Ancaman Terbaru' })); grid.appendChild(thr);
    if (!canDetail) thr.appendChild(CS.empty('Detail ancaman hanya untuk Pemilik dan Administrator.'));
    else {
      var ev = await sb().from('security_events').select('*').gte('created_at', rg.from).lt('created_at', rg.to).order('created_at', { ascending: false }).limit(6);
      if (ev.error) thr.appendChild(CS.errorBox(ev.error));
      else if (!ev.data.length) thr.appendChild(CS.empty('Tidak ada ancaman terdeteksi pada rentang ini.'));
      else ev.data.forEach(function (e) { thr.appendChild(eventItem(e)); });
    }

    // Aktivitas pengguna
    var ua = el('div', { class: 'panel wide' }, el('h3', { text: 'Ringkasan Aktivitas Pengguna' })); grid.appendChild(ua);
    if (!canDetail) ua.appendChild(CS.empty('Ringkasan aktivitas pengguna hanya untuk Pemilik dan Administrator.'));
    else {
      var u = await rpc('user_activity_summary', { p_from: rg.from, p_to: rg.to });
      if (u.error) ua.appendChild(CS.errorBox(u.error));
      else ua.appendChild(u.data.length ? CS.table([
        { label: 'Username', key: 'username' }, { label: 'Nama', key: 'full_name' },
        { label: 'Peran', render: function (r) { return CS.ROLE_LABEL[r.role]; } },
        { label: 'Login selesai (2FA)', key: 'login_berhasil' }, { label: 'Percobaan gagal', key: 'login_gagal' },
        { label: 'Login terakhir', render: function (r) { return CS.fmtDT(r.last_login_at); } }], u.data) : CS.empty('Belum ada pengguna.'));
    }
  } };
  function statusRow(l, v, kind) { return el('div', { class: 'srow' }, el('span', { text: l }), CS.badge(v, kind)); }
  function eventItem(e) {
    return el('div', { class: 'evt' }, el('div', { class: 'evt-top' }, CS.sevBadge(e.severity), el('b', { text: CS.EVENT_LABEL[e.event_type] || e.event_type }), el('time', { text: CS.fmtDT(e.created_at) })),
      el('p', { text: e.description }));
  }

  /* =================== MONITORING LOGIN =================== */
  P.monitoring = { label: 'Monitoring Login', icon: '◉', roles: OWN, render: function (box) {
    var fStage = sel('fStage', [['', 'Semua tahap'], ['password', 'Kata sandi'], ['totp', 'Kode 2FA']]);
    var fRes = sel('fRes', [['', 'Semua hasil'], ['true', 'Berhasil'], ['false', 'Gagal']]);
    var fQ = el('input', { type: 'search', id: 'fQ', placeholder: 'Cari IP / username', maxlength: 60 });
    var lv;
    var cols = [
      { label: 'Waktu', render: function (r) { return CS.fmtDT(r.created_at); }, csv: function (r) { return r.created_at; } },
      { label: 'Akun', key: 'identifier' }, { label: 'IP', key: 'ip' },
      { label: 'Tahap', render: function (r) { return r.stage === 'totp' ? 'Kode 2FA' : 'Kata sandi'; } },
      { label: 'Hasil', render: function (r) { return CS.badge(r.success ? 'Berhasil' : 'Gagal', r.success ? 'green' : 'red'); }, csv: function (r) { return r.success ? 'Berhasil' : 'Gagal'; } },
      { label: 'Alasan', key: 'reason' }];
    box.appendChild(pageHead('Monitoring Login', 'Setiap percobaan autentikasi tercatat. Kata sandi dan kode OTP tidak pernah disimpan.',
      el('button', { type: 'button', class: 'btn sm', text: '⬇ Ekspor CSV', onclick: function () { lv.exportCsv('monitoring-login'); } })));
    box.appendChild(CS.rangeBar(function () { lv.reload(); }));
    box.appendChild(el('div', { class: 'filters' }, fStage, fRes, fQ, el('button', { type: 'button', class: 'btn sm', text: 'Filter', onclick: function () { lv.reload(); } })));
    var holder = el('div'); box.appendChild(holder);
    lv = listView(holder, { cols: cols, build: function () {
      var rg = CS.rangeIso(), q = sb().from('login_attempts').select('*').gte('created_at', rg.from).lt('created_at', rg.to).order('created_at', { ascending: false });
      if (fStage.value) q = q.eq('stage', fStage.value);
      if (fRes.value) q = q.eq('success', fRes.value === 'true');
      var t = clean(fQ.value); if (t) q = q.or('ip.ilike.%' + t + '%,identifier.ilike.%' + t + '%');
      return q; } });
  } };

  /* =================== DETEKSI ANCAMAN =================== */
  P.ancaman = { label: 'Deteksi Ancaman', icon: '⚠', roles: OWN, render: function (box) {
    var fSev = sel('fSev', [['', 'Semua tingkat'], ['critical', 'Kritis'], ['high', 'Tinggi'], ['medium', 'Sedang'], ['low', 'Rendah'], ['info', 'Info']]);
    var fSt = sel('fSt', [['', 'Semua status'], ['open', 'Terbuka'], ['acknowledged', 'Ditinjau'], ['resolved', 'Selesai']]);
    var lv;
    async function setSt(id, st) {
      var r = await rpc('set_event_status', { p_id: id, p_status: st });
      if (r.error) return CS.toast(r.error.message, 'err');
      CS.toast('Status diperbarui.', 'ok'); lv.reload(); CS.refreshBell();
    }
    var cols = [
      { label: 'Waktu', render: function (r) { return CS.fmtDT(r.created_at); }, csv: function (r) { return r.created_at; } },
      { label: 'Tingkat', render: function (r) { return CS.sevBadge(r.severity); }, csv: function (r) { return CS.SEV_LABEL[r.severity]; } },
      { label: 'Jenis', render: function (r) { return CS.EVENT_LABEL[r.event_type] || r.event_type; } },
      { label: 'IP', key: 'ip' }, { label: 'Akun', key: 'identifier' }, { label: 'Alasan deteksi', key: 'description' },
      { label: 'Status', render: function (r) { return CS.badge(CS.STATUS_LABEL[r.status], r.status === 'open' ? 'orange' : r.status === 'resolved' ? 'green' : 'blue'); }, csv: function (r) { return CS.STATUS_LABEL[r.status]; } },
      { label: 'Tindakan', csv: function () { return ''; }, render: function (r) {
        var w = el('div', { class: 'row-actions' });
        if (r.status === 'open') w.appendChild(el('button', { type: 'button', class: 'btn xs ghost', text: 'Tinjau', onclick: function () { setSt(r.id, 'acknowledged'); } }));
        if (r.status !== 'resolved') w.appendChild(el('button', { type: 'button', class: 'btn xs', text: 'Selesai', onclick: function () { setSt(r.id, 'resolved'); } }));
        return w; } }];
    box.appendChild(pageHead('Deteksi Ancaman', 'Peristiwa hasil aturan deteksi di server. Ubah ambang batas di menu Pengaturan Keamanan.',
      el('button', { type: 'button', class: 'btn sm', text: '⬇ Ekspor CSV', onclick: function () { lv.exportCsv('deteksi-ancaman'); } })));
    box.appendChild(CS.rangeBar(function () { lv.reload(); }));
    box.appendChild(el('div', { class: 'filters' }, fSev, fSt, el('button', { type: 'button', class: 'btn sm', text: 'Filter', onclick: function () { lv.reload(); } })));
    var holder = el('div'); box.appendChild(holder);
    lv = listView(holder, { cols: cols, emptyText: 'Tidak ada peristiwa keamanan pada rentang/filter ini.', build: function () {
      var rg = CS.rangeIso(), q = sb().from('security_events').select('*').gte('created_at', rg.from).lt('created_at', rg.to).order('created_at', { ascending: false });
      if (fSev.value) q = q.eq('severity', fSev.value); if (fSt.value) q = q.eq('status', fSt.value); return q; } });
  } };

  /* =================== MANAJEMEN IP =================== */
  P.ip = { label: 'IP Diblokir', icon: '⛔', roles: OWN, render: function (box) {
    var fSt = sel('fIpSt', [['aktif', 'Sedang aktif'], ['semua', 'Semua riwayat']]);
    var fQ = el('input', { type: 'search', placeholder: 'Cari IP / alasan', maxlength: 60 });
    var lv, hist;
    async function unblock(id) {
      var note = prompt('Catatan pembukaan blokir (opsional):', '');
      if (note === null) return;
      var r = await rpc('unblock_ip', { p_id: id, p_note: note });
      if (r.error) return CS.toast(r.error.message, 'err');
      CS.toast('Blokir dibuka dan dicatat di log audit.', 'ok'); lv.reload(); hist.reload(); CS.refreshBell();
    }
    var cols = [
      { label: 'IP', key: 'ip' }, { label: 'Waktu blokir', render: function (r) { return CS.fmtDT(r.blocked_at); }, csv: function (r) { return r.blocked_at; } },
      { label: 'Sumber', render: function (r) { return r.source === 'otomatis' ? 'Otomatis (deteksi)' : 'Manual (admin)'; } },
      { label: 'Alasan', key: 'reason' },
      { label: 'Berakhir', render: function (r) { return r.expires_at ? CS.fmtDT(r.expires_at) : 'Permanen'; }, csv: function (r) { return r.expires_at || 'Permanen'; } },
      { label: 'Status', render: function (r) { var on = r.active && (!r.expires_at || new Date(r.expires_at) > new Date()); return CS.badge(on ? 'Aktif' : 'Tidak aktif', on ? 'red' : 'gray'); },
        csv: function (r) { return r.active && (!r.expires_at || new Date(r.expires_at) > new Date()) ? 'Aktif' : 'Tidak aktif'; } },
      { label: 'Catatan buka', key: 'unblock_note' },
      { label: 'Tindakan', csv: function () { return ''; }, render: function (r) {
        var on = r.active && (!r.expires_at || new Date(r.expires_at) > new Date());
        return on ? el('button', { type: 'button', class: 'btn xs', text: 'Buka blokir', onclick: function () { unblock(r.id); } }) : '-'; } }];
    box.appendChild(pageHead('Manajemen IP yang Diblokir', 'Pemblokiran berlaku pada lapisan aplikasi (gerbang login). Lihat README untuk batasannya.',
      el('button', { type: 'button', class: 'btn sm', text: '⬇ Ekspor CSV', onclick: function () { lv.exportCsv('ip-diblokir'); } })));

    if (isAdmin()) {
      var ip = el('input', { id: 'bIp', placeholder: 'mis. 203.0.113.7', maxlength: 45, autocomplete: 'off' });
      var rs = el('input', { id: 'bReason', placeholder: 'Alasan pemblokiran', maxlength: 200 });
      var du = sel('bDur', [['60', '1 jam'], ['1440', '24 jam'], ['10080', '7 hari'], ['', 'Permanen']], '60');
      var form = el('form', { class: 'panel inline-form', novalidate: true, onsubmit: async function (e) {
        e.preventDefault();
        if (!ip.value.trim()) return CS.toast('IP wajib diisi.', 'err');
        if (rs.value.trim().length < 3) return CS.toast('Alasan minimal 3 karakter.', 'err');
        var r = await rpc('block_ip', { p_ip: ip.value.trim(), p_reason: rs.value.trim(), p_minutes: du.value === '' ? null : Number(du.value) });
        if (r.error) return CS.toast(r.error.message, 'err');
        CS.toast('IP diblokir dan dicatat di log audit.', 'ok'); ip.value = ''; rs.value = ''; lv.reload(); hist.reload(); CS.refreshBell();
      } }, el('h3', { text: 'Blokir IP Manual (Administrator)' }),
        el('div', { class: 'row3' }, field('Alamat IP', ip), field('Alasan', rs), field('Durasi', du)),
        el('button', { type: 'submit', class: 'btn', text: 'Blokir IP' }));
      box.appendChild(form);
    }
    box.appendChild(el('div', { class: 'filters' }, fSt, fQ, el('button', { type: 'button', class: 'btn sm', text: 'Filter', onclick: function () { lv.reload(); } })));
    var h1 = el('div'); box.appendChild(h1);
    lv = listView(h1, { cols: cols, emptyText: 'Tidak ada IP yang diblokir.', build: function () {
      var q = sb().from('blocked_ips').select('*').order('blocked_at', { ascending: false });
      if (fSt.value === 'aktif') q = q.eq('active', true).or('expires_at.is.null,expires_at.gt.' + new Date().toISOString());
      var t = clean(fQ.value); if (t) q = q.or('ip.ilike.%' + t + '%,reason.ilike.%' + t + '%');
      return q; } });
    box.appendChild(el('h3', { class: 'sec', text: 'Riwayat Perubahan Status Pemblokiran' }));
    var h2 = el('div'); box.appendChild(h2);
    hist = listView(h2, { emptyText: 'Belum ada perubahan status blokir.', cols: [
      { label: 'Waktu', render: function (r) { return CS.fmtDT(r.created_at); } },
      { label: 'Tindakan', render: function (r) { return ({ ip_diblokir_otomatis: 'Blokir otomatis', ip_diblokir_manual: 'Blokir manual', ip_dibuka: 'Blokir dibuka' })[r.action]; } },
      { label: 'IP', key: 'target' }, { label: 'Oleh', key: 'actor_name' }], build: function () {
      return sb().from('audit_logs').select('*').in('action', ['ip_diblokir_otomatis', 'ip_diblokir_manual', 'ip_dibuka']).order('created_at', { ascending: false }); } });
  } };

  /* =================== LOG AUDIT =================== */
  var AUDIT_ACTIONS = ['login_berhasil', 'login_gagal', '2fa_berhasil', '2fa_gagal', 'login_mencurigakan', 'serangan_akun_terdistribusi', 'ip_diblokir_otomatis', 'ip_diblokir_manual', 'ip_dibuka',
    'pengguna_ditambahkan', 'pengguna_diubah', 'pengguna_diaktifkan', 'pengguna_dinonaktifkan', 'peran_diubah', '2fa_direset', 'konfigurasi_diubah', 'peristiwa_diperbarui', 'logout', 'administrator_pertama_dibuat'];
  P.audit = { label: 'Log Audit', icon: '☰', roles: OWN, render: function (box) {
    var fAct = sel('fAct', [['', 'Semua jenis aktivitas']].concat(AUDIT_ACTIONS.map(function (a) { return [a, a.replace(/_/g, ' ')]; })));
    var fSev = sel('fASev', [['', 'Semua tingkat'], ['info', 'Info'], ['low', 'Rendah'], ['medium', 'Sedang'], ['high', 'Tinggi'], ['critical', 'Kritis']]);
    var fUser = el('input', { type: 'search', placeholder: 'Pengguna / akun', maxlength: 60 });
    var lv;
    box.appendChild(pageHead('Log Audit', 'Catatan tetap (append-only): tidak dapat diubah atau dihapus oleh pengguna mana pun.',
      el('button', { type: 'button', class: 'btn sm', text: '⬇ Ekspor CSV', onclick: function () { lv.exportCsv('log-audit'); } })));
    box.appendChild(CS.rangeBar(function () { lv.reload(); }));
    box.appendChild(el('div', { class: 'filters' }, fAct, fSev, fUser, el('button', { type: 'button', class: 'btn sm', text: 'Filter', onclick: function () { lv.reload(); } })));
    var holder = el('div'); box.appendChild(holder);
    lv = listView(holder, { cols: [
      { label: 'Waktu', render: function (r) { return CS.fmtDT(r.created_at); }, csv: function (r) { return r.created_at; } },
      { label: 'Aktivitas', render: function (r) { return r.action.replace(/_/g, ' '); }, csv: function (r) { return r.action; } },
      { label: 'Pengguna', key: 'actor_name' }, { label: 'Target', key: 'target' },
      { label: 'Hasil', render: function (r) { return CS.badge(r.result === 'success' ? 'Berhasil' : 'Gagal', r.result === 'success' ? 'green' : 'red'); }, csv: function (r) { return r.result; } },
      { label: 'Tingkat', render: function (r) { return CS.sevBadge(r.severity); }, csv: function (r) { return r.severity; } },
      { label: 'IP', key: 'ip' },
      { label: 'Keterangan', render: function (r) { var d = r.details || {}; var k = Object.keys(d); return k.length ? k.map(function (x) { return x + ': ' + d[x]; }).join('; ') : '-'; },
        csv: function (r) { return JSON.stringify(r.details || {}); } }], build: function () {
      var rg = CS.rangeIso(), q = sb().from('audit_logs').select('*').gte('created_at', rg.from).lt('created_at', rg.to).order('created_at', { ascending: false });
      if (fAct.value) q = q.eq('action', fAct.value); if (fSev.value) q = q.eq('severity', fSev.value);
      var t = clean(fUser.value); if (t) q = q.ilike('actor_name', '%' + t + '%'); return q; } });
  } };

  /* =================== PENGGUNA =================== */
  P.pengguna = { label: 'Pengguna & Peran', icon: '☺', roles: OWN, async render(box) {
    box.appendChild(pageHead('Manajemen Pengguna', isAdmin() ? 'Tambah pengguna, atur peran, aktifkan/nonaktifkan akun, dan reset 2FA.' : 'Mode lihat saja. Hanya Administrator yang dapat mengubah pengguna.'));
    if (isAdmin()) {
      var f = { u: el('input', { id: 'nuUser', maxlength: 32, autocomplete: 'off', placeholder: 'huruf kecil, angka . _ -' }), e: el('input', { id: 'nuEmail', type: 'email', maxlength: 120, autocomplete: 'off' }),
        n: el('input', { id: 'nuName', maxlength: 100 }), r: sel('nuRole', [['pegawai', 'Pegawai'], ['pemilik', 'Pemilik'], ['administrator', 'Administrator']], 'pegawai'),
        p: el('input', { id: 'nuPass', type: 'password', minlength: 12, maxlength: 100, autocomplete: 'new-password', placeholder: 'min. 12 karakter, huruf + angka' }) };
      box.appendChild(el('form', { class: 'panel inline-form', novalidate: true, onsubmit: async function (e) {
        e.preventDefault();
        if (!/^[a-z0-9._-]{3,32}$/.test(f.u.value.trim())) return CS.toast('Username 3-32 karakter (huruf kecil, angka, . _ -).', 'err');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.e.value.trim())) return CS.toast('Email tidak valid.', 'err');
        if (f.p.value.length < 12 || !/[a-zA-Z]/.test(f.p.value) || !/\d/.test(f.p.value)) return CS.toast('Kata sandi minimal 12 karakter dan mengandung huruf serta angka.', 'err');
        var s = await sb().auth.getSession();
        var r = await CS.callFn('create-user', { username: f.u.value.trim(), email: f.e.value.trim(), full_name: f.n.value.trim(), role: f.r.value, password: f.p.value }, s.data.session.access_token);
        f.p.value = '';
        if (r.status !== 200) return CS.toast(r.data.error || 'Gagal menambah pengguna.', 'err');
        CS.toast('Pengguna ditambahkan. Authenticator didaftarkan saat login pertama.', 'ok'); f.u.value = f.e.value = f.n.value = ''; CS.go('pengguna');
      } }, el('h3', { text: 'Tambah Pengguna' }),
        el('div', { class: 'row3' }, field('Username', f.u), field('Email', f.e), field('Nama lengkap', f.n)),
        el('div', { class: 'row3' }, field('Peran', f.r), field('Kata sandi awal', f.p), el('div')),
        el('button', { type: 'submit', class: 'btn', text: 'Tambah Pengguna' })));
    }
    var holder = el('div', null, CS.loading()); box.appendChild(holder);
    var rg = CS.rangeIso(), p = await sb().from('profiles').select('*').order('created_at', { ascending: true });
    var act = await rpc('user_activity_summary', { p_from: new Date(Date.now() - 30 * 864e5).toISOString(), p_to: rg.to });
    CS.clear(holder);
    if (p.error) return holder.appendChild(CS.errorBox(p.error));
    var actMap = {}; (act.data || []).forEach(function (a) { actMap[a.username] = a; });
    holder.appendChild(CS.table([
      { label: 'Username', key: 'username' }, { label: 'Email', key: 'email' },
      { label: 'Nama', render: function (r) { if (!isAdmin()) return r.full_name; var i = el('input', { value: r.full_name, maxlength: 100, 'aria-label': 'Nama ' + r.username }); r._n = i; return i; } },
      { label: 'Peran', render: function (r) { if (!isAdmin()) return CS.ROLE_LABEL[r.role]; var s = sel('r' + r.id, [['pegawai', 'Pegawai'], ['pemilik', 'Pemilik'], ['administrator', 'Administrator']], r.role); s.disabled = r.id === CS.user.id; r._r = s; return s; } },
      { label: 'Aktif', render: function (r) { if (!isAdmin()) return CS.badge(r.is_active ? 'Aktif' : 'Nonaktif', r.is_active ? 'green' : 'gray'); var c = el('input', { type: 'checkbox', 'aria-label': 'Aktif ' + r.username }); c.checked = r.is_active; c.disabled = r.id === CS.user.id; r._a = c; return c; } },
      { label: 'Login (30 hr)', render: function (r) { var a = actMap[r.username]; return a ? a.login_berhasil + ' ok / ' + a.login_gagal + ' gagal' : '-'; } },
      { label: 'Login terakhir', render: function (r) { return CS.fmtDT(r.last_login_at); } },
      { label: 'Tindakan', render: function (r) {
        if (!isAdmin()) return '-';
        var w = el('div', { class: 'row-actions' });
        w.appendChild(el('button', { type: 'button', class: 'btn xs', text: 'Simpan', onclick: async function () {
          var x = await rpc('admin_update_user', { p_id: r.id, p_role: r._r.value, p_active: r._a.checked, p_full_name: r._n.value });
          if (x.error) return CS.toast(x.error.message, 'err'); CS.toast('Perubahan disimpan dan dicatat di log audit.', 'ok'); } }));
        w.appendChild(el('button', { type: 'button', class: 'btn xs ghost', text: 'Reset 2FA', onclick: async function () {
          if (!confirm('Reset 2FA untuk ' + r.username + '? Pengguna harus mendaftarkan ulang authenticator.')) return;
          var x = await rpc('admin_reset_mfa', { p_id: r.id });
          if (x.error) return CS.toast(x.error.message, 'err'); CS.toast('2FA direset.', 'ok'); } }));
        return w; } }], p.data));
  } };

  /* =================== LAPORAN =================== */
  P.laporan = { label: 'Laporan Keamanan', icon: '▤', roles: OWN, async render(box) {
    box.appendChild(pageHead('Laporan Keamanan', 'Laporan mengikuti rentang waktu dan hak akses Anda.', null));
    box.appendChild(CS.rangeBar(function () { CS.go('laporan'); }));
    var area = el('div', { id: 'reportArea', class: 'report' }, CS.loading()); box.appendChild(area);
    var rg = CS.rangeIso(), q = sb();
    var res = await Promise.all([
      rpc('dashboard_summary', { p_from: rg.from, p_to: rg.to }),
      rpc('top_failing_ips', { p_from: rg.from, p_to: rg.to, p_limit: 10 }),
      q.from('security_events').select('*').gte('created_at', rg.from).lt('created_at', rg.to).in('severity', ['medium', 'high', 'critical']).order('created_at', { ascending: false }).limit(100),
      q.from('blocked_ips').select('*').gte('blocked_at', rg.from).lt('blocked_at', rg.to).order('blocked_at', { ascending: false }).limit(100),
      rpc('login_trend', { p_from: rg.from, p_to: rg.to, p_bucket: 'day' })]);
    CS.clear(area);
    var bad = res.filter(function (r) { return r.error; })[0];
    if (bad) return area.appendChild(CS.errorBox(bad.error));
    var s = res[0].data, tops = res[1].data, evs = res[2].data, blk = res[3].data, trend = res[4].data;
    var gen = new Date();
    area.appendChild(el('div', { class: 'report-head' }, el('h3', { text: 'Laporan Keamanan Siber — Toko Nadhiya Photocopy' }),
      el('p', { text: 'Periode: ' + CS.fmtDT(rg.from) + ' s/d ' + CS.fmtDT(rg.to) }),
      el('p', { text: 'Dibuat: ' + CS.fmtDT(gen) + ' oleh ' + CS.user.username + ' (' + CS.ROLE_LABEL[CS.user.role] + ')' })));
    var cards = el('div', { class: 'cards' });
    [['Total percobaan login', s.total_login], ['Login berhasil', s.login_berhasil], ['Login gagal', s.login_gagal], ['Kode 2FA salah', s['2fa_gagal']], ['Peristiwa mencurigakan', s.mencurigakan], ['IP sedang diblokir', s.ip_diblokir]]
      .forEach(function (c) { cards.appendChild(el('div', { class: 'stat' }, el('div', { class: 'n', text: CS.num(c[1]) }), el('div', { class: 'l', text: c[0] }))); });
    area.appendChild(cards);
    if (!Number(s.total_login) && !evs.length && !blk.length) area.appendChild(el('div', { class: 'alert info' }, 'Tidak ada aktivitas pada periode ini.'));
    area.appendChild(el('h4', { text: 'Tren login harian' }));
    area.appendChild(trend.length ? CS.table([{ label: 'Tanggal', render: function (r) { return new Date(r.bucket).toLocaleDateString('id-ID'); } }, { label: 'Berhasil', key: 'berhasil' }, { label: 'Gagal', key: 'gagal' }], trend) : CS.empty('Tidak ada data.'));
    area.appendChild(el('h4', { text: 'IP dengan kegagalan terbanyak' }));
    area.appendChild(tops.length ? CS.table([{ label: 'IP', key: 'ip' }, { label: 'Jumlah gagal', key: 'gagal' }, { label: 'Terakhir', render: function (r) { return CS.fmtDT(r.terakhir); } }], tops) : CS.empty('Tidak ada data.'));
    area.appendChild(el('h4', { text: 'Peristiwa keamanan penting (sedang ke atas)' }));
    area.appendChild(evs.length ? CS.table([{ label: 'Waktu', render: function (r) { return CS.fmtDT(r.created_at); } }, { label: 'Tingkat', render: function (r) { return CS.sevBadge(r.severity); } },
      { label: 'Jenis', render: function (r) { return CS.EVENT_LABEL[r.event_type]; } }, { label: 'Keterangan', key: 'description' }], evs) : CS.empty('Tidak ada peristiwa.'));
    area.appendChild(el('h4', { text: 'Riwayat pemblokiran IP' }));
    area.appendChild(blk.length ? CS.table([{ label: 'IP', key: 'ip' }, { label: 'Waktu', render: function (r) { return CS.fmtDT(r.blocked_at); } }, { label: 'Sumber', key: 'source' },
      { label: 'Alasan', key: 'reason' }, { label: 'Status', render: function (r) { return r.active ? 'Aktif' : 'Tidak aktif'; } }], blk) : CS.empty('Tidak ada pemblokiran.'));

    var actions = el('div', { class: 'actions report-actions' },
      el('button', { type: 'button', class: 'btn sm', text: '⬇ Ekspor CSV', onclick: function () {
        var rows = [['LAPORAN KEAMANAN SIBER - TOKO NADHIYA PHOTOCOPY'], ['Periode', rg.from, rg.to], ['Dibuat', gen.toISOString(), CS.user.username], [],
          ['RINGKASAN'], ['Total percobaan login', s.total_login], ['Login berhasil', s.login_berhasil], ['Login gagal', s.login_gagal], ['Kode 2FA salah', s['2fa_gagal']], ['Peristiwa mencurigakan', s.mencurigakan], ['IP sedang diblokir', s.ip_diblokir], [],
          ['TREN HARIAN', 'Berhasil', 'Gagal']].concat(trend.map(function (r) { return [r.bucket, r.berhasil, r.gagal]; }))
          .concat([[], ['IP GAGAL TERBANYAK', 'Jumlah', 'Terakhir']], tops.map(function (r) { return [r.ip, r.gagal, r.terakhir]; }))
          .concat([[], ['PERISTIWA PENTING', 'Tingkat', 'Jenis', 'Keterangan']], evs.map(function (r) { return [r.created_at, r.severity, r.event_type, r.description]; }))
          .concat([[], ['PEMBLOKIRAN IP', 'Waktu', 'Sumber', 'Alasan', 'Aktif']], blk.map(function (r) { return [r.ip, r.blocked_at, r.source, r.reason, r.active]; }));
        var text = rows.map(function (r) { return r.map(CS.csvCell).join(','); }).join('\r\n');
        CS.download('laporan-keamanan-' + gen.toISOString().slice(0, 10) + '.csv', text); } }),
      el('button', { type: 'button', class: 'btn sm ghost', text: '🖨 Cetak / Simpan PDF', onclick: function () { document.body.classList.add('printing'); window.print(); setTimeout(function () { document.body.classList.remove('printing'); }, 500); } }));
    box.querySelector('.page-head .actions').appendChild(actions);
    box.appendChild(el('p', { class: 'hint', text: 'PDF dibuat lewat dialog cetak peramban (pilih "Simpan sebagai PDF"). Tidak ada pustaka PDF tambahan.' }));
  } };

  /* =================== PENGATURAN KEAMANAN =================== */
  P.pengaturan = { label: 'Pengaturan Keamanan', icon: '⚙', roles: OWN, async render(box) {
    box.appendChild(pageHead('Pengaturan Keamanan', isAdmin() ? 'Ubah ambang deteksi dan durasi blokir. Setiap perubahan tercatat di log audit.' : 'Mode lihat saja. Hanya Administrator yang dapat mengubah pengaturan.'));
    var holder = el('div', null, CS.loading()); box.appendChild(holder);
    var r = await sb().from('security_settings').select('*').order('key');
    CS.clear(holder);
    if (r.error) return holder.appendChild(CS.errorBox(r.error));
    var order = ['window_minutes', 'suspicious_threshold', 'block_threshold', 'block_minutes', 'max_block_minutes', 'spray_ip_count'];
    r.data.sort(function (a, b) { return order.indexOf(a.key) - order.indexOf(b.key); });
    r.data.forEach(function (s) {
      var inp = el('input', { type: 'number', min: s.min_value, max: s.max_value, step: 1, value: s.value, disabled: !isAdmin(), 'aria-label': s.label });
      holder.appendChild(el('div', { class: 'panel setting' }, el('div', null, el('b', { text: s.label }), el('p', { class: 'hint', text: s.description }),
        el('p', { class: 'hint', text: 'Rentang ' + s.min_value + ' – ' + s.max_value + ' · diubah ' + CS.fmtDT(s.updated_at) })),
        el('div', { class: 'setting-in' }, inp, isAdmin() ? el('button', { type: 'button', class: 'btn xs', text: 'Simpan', onclick: async function () {
          var v = Number(inp.value); if (!Number.isInteger(v)) return CS.toast('Isi dengan bilangan bulat.', 'err');
          var x = await rpc('update_setting', { p_key: s.key, p_value: v });
          if (x.error) return CS.toast(x.error.message, 'err'); CS.toast('Pengaturan disimpan.', 'ok'); } }) : null)));
    });
    box.appendChild(el('div', { class: 'panel' }, el('h3', { text: 'Catatan Penegakan' }),
      el('p', { text: 'Deteksi dan pemblokiran dijalankan di server (fungsi database + Edge Function), bukan di browser. Pemblokiran bersifat lapisan aplikasi: IP yang diblokir ditolak di gerbang login. Ini bukan firewall jaringan.' })));
  } };

  /* =================== PROFIL =================== */
  P.profil = { label: 'Profil & Logout', icon: '☻', roles: ALL, async render(box) {
    box.appendChild(pageHead('Profil Saya', null));
    var u = CS.user;
    var lf = await sb().auth.mfa.listFactors();
    var n = lf.data && lf.data.totp ? lf.data.totp.filter(function (f) { return f.status === 'verified'; }).length : 0;
    box.appendChild(el('div', { class: 'panel' },
      [['Username', u.username], ['Email', u.email || '-'], ['Nama', u.full_name || '-'], ['Peran', CS.ROLE_LABEL[u.role]]].map(function (r) { return el('div', { class: 'srow' }, el('span', { text: r[0] }), el('b', { text: r[1] })); }),
      el('div', { class: 'srow' }, el('span', { text: 'Autentikasi dua faktor' }), CS.badge(n ? 'Aktif (' + n + ' authenticator)' : 'Belum terdaftar', n ? 'green' : 'orange')),
      el('div', { class: 'srow' }, el('span', { text: 'Batas tidak aktif' }), el('b', { text: C.IDLE_MINUTES + ' menit' }))));
    var perms = { administrator: 'Semua fitur: pengguna, peran, pengaturan, blokir IP, laporan.', pemilik: 'Dashboard, monitoring, ancaman, membuka blokir IP, log audit, laporan (tidak dapat mengubah pengguna/pengaturan).', pegawai: 'Hanya ringkasan angka di dashboard.' };
    box.appendChild(el('div', { class: 'panel' }, el('h3', { text: 'Hak akses peran Anda' }), el('p', { text: perms[u.role] })));
    box.appendChild(el('button', { type: 'button', class: 'btn', text: 'Keluar (Logout)', onclick: function () { CS.logout(false); } }));
  } };
})(window.CS);
