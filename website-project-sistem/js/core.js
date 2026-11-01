/* =====================================================================
   CORE: helper DOM, format, ekspor CSV, pemanggilan Edge Function
   Semua data dari database ditampilkan dengan textContent (anti-XSS).
   ===================================================================== */
window.CS = window.CS || {};
(function (CS) {
  'use strict';
  var C = window.CS_CONFIG;

  /* ---------- Pembuat elemen: el('div', {class:'x'}, 'teks', childEl) ---------- */
  CS.el = function (tag, attrs) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    });
    (function add(list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c === null || c === undefined || c === false) continue;
        if (Array.isArray(c)) add(c);
        else n.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
      }
    })(Array.prototype.slice.call(arguments, 2));
    return n;
  };
  var el = CS.el;
  CS.$ = function (id) { return document.getElementById(id); };
  CS.clear = function (n) { while (n.firstChild) n.removeChild(n.firstChild); return n; };

  /* ---------- Format ---------- */
  var pad = function (n) { return String(n).padStart(2, '0'); };
  CS.fmtDT = function (iso) {
    if (!iso) return '-';
    var d = new Date(iso); if (isNaN(d)) return '-';
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  };
  CS.toLocalInput = function (d) {   // Date -> nilai <input type=datetime-local>
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  };
  CS.num = function (n) { return Number(n || 0).toLocaleString('id-ID'); };

  CS.ROLE_LABEL = { administrator: 'Administrator', pemilik: 'Pemilik', pegawai: 'Pegawai' };
  CS.SEV_LABEL = { info: 'Info', low: 'Rendah', medium: 'Sedang', high: 'Tinggi', critical: 'Kritis' };
  CS.EVENT_LABEL = {
    login_mencurigakan: 'Login mencurigakan',
    ip_diblokir_otomatis: 'IP diblokir otomatis',
    serangan_akun_terdistribusi: 'Serangan akun terdistribusi',
    ip_diblokir_manual: 'IP diblokir manual',
    ip_dibuka: 'Blokir IP dibuka',
    konfigurasi_diubah: 'Konfigurasi diubah',
    akses_ditolak: 'Akses ditolak'
  };
  CS.STATUS_LABEL = { open: 'Terbuka', acknowledged: 'Ditinjau', resolved: 'Selesai' };

  CS.badge = function (text, kind) { return el('span', { class: 'badge b-' + (kind || 'gray'), text: text }); };
  CS.sevBadge = function (s) {
    var kind = { info: 'gray', low: 'blue', medium: 'orange', high: 'red', critical: 'crit' }[s] || 'gray';
    return CS.badge(CS.SEV_LABEL[s] || s, kind);
  };

  /* ---------- Toast ---------- */
  var toastTimer = null;
  CS.toast = function (msg, kind) {
    var t = CS.$('toast');
    t.textContent = msg; t.className = 'toast show ' + (kind || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, 4200);
  };

  /* ---------- Keadaan kosong / error / loading ---------- */
  CS.empty = function (text) { return el('div', { class: 'empty' }, el('div', { class: 'empty-ico', text: '🗂' }), el('p', { text: text })); };
  CS.errorBox = function (err) {
    var m = (err && err.message) || String(err);
    if (/permission denied|Akses ditolak|42501/i.test(m)) m = 'Anda tidak memiliki izin untuk melihat data ini.';
    return el('div', { class: 'alert err', role: 'alert' }, 'Gagal memuat data: ' + m);
  };
  CS.loading = function () { return el('div', { class: 'loading', text: 'Memuat data…' }); };

  /* ---------- Tabel responsif (di ponsel menjadi kartu lewat data-label) ---------- */
  CS.table = function (cols, rows) {
    var head = el('tr');
    cols.forEach(function (c) { head.appendChild(el('th', { text: c.label })); });
    var body = el('tbody');
    rows.forEach(function (r) {
      var tr = el('tr');
      cols.forEach(function (c) {
        var v = c.render ? c.render(r) : r[c.key];
        var td = el('td', { 'data-label': c.label });
        if (v instanceof Node) td.appendChild(v); else td.textContent = (v === null || v === undefined || v === '') ? '-' : String(v);
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    return el('div', { class: 'table-wrap' }, el('table', { class: 'tbl' }, el('thead', null, head), body));
  };

  /* ---------- Ekspor CSV (data persis seperti yang ditampilkan) ---------- */
  function csvCell(v) {
    var s = (v === null || v === undefined) ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;          // cegah formula injection di Excel
    return '"' + s.replace(/"/g, '""') + '"';
  }
  CS.csvCell = csvCell;
  CS.toCSV = function (header, rows) {
    return [header.map(csvCell).join(',')].concat(rows.map(function (r) { return r.map(csvCell).join(','); })).join('\r\n');
  };
  CS.download = function (filename, text, mime) {
    var blob = new Blob(['﻿' + text], { type: (mime || 'text/csv') + ';charset=utf-8' });
    var a = el('a', { href: URL.createObjectURL(blob), download: filename });
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  /* ---------- Edge Function tepercaya ---------- */
  CS.callFn = async function (action, body, token) {
    var headers = { 'Content-Type': 'application/json', apikey: C.SUPABASE_ANON_KEY };
    if (token) headers.Authorization = 'Bearer ' + token;
    var res, data = {};
    try {
      res = await fetch(C.FUNCTION_URL, { method: 'POST', headers: headers, body: JSON.stringify(Object.assign({ action: action }, body || {})) });
    } catch (e) { return { status: 0, data: { error: 'Tidak dapat terhubung ke server. Periksa koneksi internet.' } }; }
    try { data = await res.json(); } catch (e) { /* abaikan */ }
    return { status: res.status, data: data };
  };

  /* ---------- Rentang waktu bersama (dashboard, monitoring, audit, laporan) ---------- */
  CS.range = { from: new Date(Date.now() - 24 * 3600 * 1000), to: new Date(Date.now() + 60 * 1000) };
  CS.rangeBar = function (onChange) {
    var f = el('input', { type: 'datetime-local', id: 'rgFrom', value: CS.toLocalInput(CS.range.from), 'aria-label': 'Dari' });
    var t = el('input', { type: 'datetime-local', id: 'rgTo', value: CS.toLocalInput(CS.range.to), 'aria-label': 'Sampai' });
    function apply() {
      var a = new Date(f.value), b = new Date(t.value);
      if (isNaN(a) || isNaN(b)) { CS.toast('Tanggal tidak valid.', 'err'); return; }
      if (a >= b) { CS.toast('Waktu "Dari" harus sebelum "Sampai".', 'err'); return; }
      CS.range = { from: a, to: b }; onChange();
    }
    function preset(h) {
      return el('button', { type: 'button', class: 'chip', text: h < 48 ? h + ' jam' : (h / 24) + ' hari', onclick: function () {
        var now = new Date(); CS.range = { from: new Date(now - h * 3600e3), to: new Date(+now + 60e3) };
        f.value = CS.toLocalInput(CS.range.from); t.value = CS.toLocalInput(CS.range.to); onChange();
      } });
    }
    return el('div', { class: 'rangebar' },
      el('label', null, 'Dari', f), el('label', null, 'Sampai', t),
      el('button', { type: 'button', class: 'btn sm', text: 'Terapkan', onclick: apply }),
      el('span', { class: 'chips' }, preset(1), preset(24), preset(168), preset(720)));
  };
  CS.rangeIso = function () { return { from: CS.range.from.toISOString(), to: CS.range.to.toISOString() }; };

  /* ---------- Grafik batang berkelompok (SVG, tanpa pustaka luar) ---------- */
  CS.barChart = function (labels, a, b, nameA, nameB) {
    var W = 720, H = 240, L = 36, B = 34, T = 14, R = 8;
    var max = Math.max(1, Math.max.apply(null, a.concat(b)));
    var NS = 'http://www.w3.org/2000/svg';
    function s(tag, at) { var n = document.createElementNS(NS, tag); Object.keys(at || {}).forEach(function (k) { n.setAttribute(k, at[k]); }); return n; }
    var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart', role: 'img', 'aria-label': 'Grafik tren login ' + nameA + ' dan ' + nameB });
    var ch = H - B - T, cw = W - L - R;
    var ticks = max < 4 ? max : 4;   // sumbu Y hanya bilangan bulat
    for (var i = 0; i <= ticks; i++) {
      var y = T + ch - (ch * i / ticks), v = Math.round(max * i / ticks);
      svg.appendChild(s('line', { x1: L, x2: W - R, y1: y, y2: y, class: 'grid' }));
      var tx = s('text', { x: L - 6, y: y + 4, 'text-anchor': 'end', class: 'axis' }); tx.textContent = v; svg.appendChild(tx);
    }
    var n = Math.max(labels.length, 1), slot = cw / n, bw = Math.max(2, Math.min(18, slot * 0.38));
    labels.forEach(function (lb, k) {
      var cx = L + slot * k + slot / 2;
      [[a[k], 'bar-a', -bw], [b[k], 'bar-b', 0]].forEach(function (p) {
        var h = ch * p[0] / max;
        var r = s('rect', { x: cx + p[2], y: T + ch - h, width: bw, height: Math.max(h, p[0] ? 1 : 0), class: p[1], rx: 2 });
        var tt = s('title'); tt.textContent = lb + ': ' + p[0] + (p[1] === 'bar-a' ? ' ' + nameA : ' ' + nameB); r.appendChild(tt); svg.appendChild(r);
      });
      if (n <= 14 || k % Math.ceil(n / 12) === 0) {
        var t = s('text', { x: cx, y: H - 14, 'text-anchor': 'middle', class: 'axis' }); t.textContent = lb; svg.appendChild(t);
      }
    });
    return el('div', { class: 'chart-box' }, svg,
      el('div', { class: 'legend' }, el('span', null, el('i', { class: 'sw sw-a' }), nameA), el('span', null, el('i', { class: 'sw sw-b' }), nameB)));
  };
})(window.CS);
