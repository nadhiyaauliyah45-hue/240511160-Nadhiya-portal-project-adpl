/* =====================================================================
   MODUL KEUANGAN TOKO + LAPORAN KE PEMILIK
   Browser hanya MEMBACA (SELECT, dibatasi RLS). Semua tulis lewat fungsi
   SECURITY DEFINER di database yang memeriksa peran, memvalidasi isi,
   dan mencatat audit. Transaksi tidak pernah diubah/dihapus: koreksi
   dilakukan dengan "batalkan" + alasan (jejak tetap ada).
   ===================================================================== */
(function (CS) {
  'use strict';
  var el = CS.el, P = CS.pages, sb = function () { return CS.client(); };
  var ADM = ['administrator'], OWN = ['administrator', 'pemilik'], ALL = ['administrator', 'pemilik', 'pegawai'];
  var rp = function (n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); };
  var wib = function (offDays) { return new Date(Date.now() + 7 * 3600e3 + (offDays || 0) * 86400e3).toISOString().slice(0, 10); };
  var canVoid = function () { return CS.user.role !== 'pegawai'; };
  var METODE = { tunai: 'Tunai', transfer: 'Transfer', qris: 'QRIS' };
  function head(title, sub, actions) {
    return el('div', { class: 'page-head' }, el('div', null, el('h2', { text: title }), sub ? el('p', { class: 'sub', text: sub }) : null), el('div', { class: 'actions' }, actions));
  }
  function field(label, input) { return el('label', { class: 'f' }, el('span', { text: label }), input); }
  function stat(n, l) { return el('div', { class: 'stat' }, el('div', { class: 'n', text: n }), el('div', { class: 'l', text: l })); }
  function msgErr(e) { var m = (e && e.message) || String(e); return m.replace(/^.*?(ERROR:)?\s*/, ''); }

  /* rentang tanggal sederhana (per tanggal, WIB) */
  var FR = { from: wib(-6), to: wib(0) };
  function dateBar(onChange) {
    var f = el('input', { type: 'date', value: FR.from, 'aria-label': 'Dari tanggal' }), t = el('input', { type: 'date', value: FR.to, 'aria-label': 'Sampai tanggal' });
    function set(a, b) { FR = { from: a, to: b }; f.value = a; t.value = b; onChange(); }
    return el('div', { class: 'rangebar' }, el('label', null, 'Dari', f), el('label', null, 'Sampai', t),
      el('button', { type: 'button', class: 'btn sm', text: 'Terapkan', onclick: function () {
        if (!f.value || !t.value || f.value > t.value) return CS.toast('Rentang tanggal tidak valid.', 'err'); set(f.value, t.value); } }),
      el('span', { class: 'chips' },
        el('button', { type: 'button', class: 'chip', text: 'Hari ini', onclick: function () { set(wib(0), wib(0)); } }),
        el('button', { type: 'button', class: 'chip', text: '7 hari', onclick: function () { set(wib(-6), wib(0)); } }),
        el('button', { type: 'button', class: 'chip', text: '30 hari', onclick: function () { set(wib(-29), wib(0)); } }),
        el('button', { type: 'button', class: 'chip', text: 'Bulan ini', onclick: function () { set(wib(0).slice(0, 8) + '01', wib(0)); } })));
  }

  async function summaryCards(box) {
    var r = await sb().rpc('finance_summary', { p_from: FR.from, p_to: FR.to });
    if (r.error) { box.appendChild(CS.errorBox(r.error)); return null; }
    var s = r.data, cards = el('div', { class: 'cards' });
    cards.appendChild(stat(rp(s.pemasukan), 'Pemasukan'));
    cards.appendChild(stat(rp(s.pengeluaran), 'Pengeluaran'));
    cards.appendChild(stat(rp(Number(s.pemasukan) - Number(s.pengeluaran)), 'Selisih (laba kas)'));
    cards.appendChild(stat(CS.num(s.jumlah), 'Transaksi aktif'));
    if (Number(s.batal)) cards.appendChild(stat(CS.num(s.batal), 'Dibatalkan'));
    box.appendChild(cards); return s;
  }

  /* =================== BERANDA KEUANGAN =================== */
  P.beranda = { label: 'Beranda Keuangan', icon: '▦', roles: ALL, group: 'KEUANGAN', async render(box) {
    var own = CS.user.role === 'pegawai';
    box.appendChild(head('Beranda Keuangan', own ? 'Ringkasan catatan Anda sendiri.' : 'Ringkasan keuangan seluruh toko.',
      el('a', { href: '#transaksi', class: 'btn sm', text: '+ Catat transaksi' })));
    box.appendChild(dateBar(function () { CS.go('beranda'); }));
    var area = el('div'); box.appendChild(area);
    await summaryCards(area);
    var res = await Promise.all([sb().rpc('finance_daily', { p_from: FR.from, p_to: FR.to }), sb().rpc('finance_by_category', { p_from: FR.from, p_to: FR.to })]);
    var bad = res.filter(function (x) { return x.error; })[0]; if (bad) return area.appendChild(CS.errorBox(bad.error));
    var daily = res[0].data || [], cat = res[1].data || [];
    area.appendChild(el('h4', { text: 'Per hari' }));
    area.appendChild(daily.length ? el('div', { class: 'panel' }, CS.barChart(daily.map(function (d) { return d.tanggal.slice(5); }), daily.map(function (d) { return Number(d.pemasukan); }), daily.map(function (d) { return Number(d.pengeluaran); }), 'Pemasukan', 'Pengeluaran')) : CS.empty('Belum ada transaksi pada rentang ini.'));
    if (daily.length) area.appendChild(CS.table([{ label: 'Tanggal', key: 'tanggal' }, { label: 'Pemasukan', render: function (r) { return rp(r.pemasukan); } }, { label: 'Pengeluaran', render: function (r) { return rp(r.pengeluaran); } }], daily));
    area.appendChild(el('h4', { text: 'Per kategori' }));
    area.appendChild(cat.length ? CS.table([{ label: 'Jenis', render: function (r) { return CS.badge(r.jenis === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran', r.jenis === 'pemasukan' ? 'green' : 'orange'); } }, { label: 'Kategori', key: 'kategori' }, { label: 'Jumlah transaksi', key: 'jumlah' }, { label: 'Total', render: function (r) { return rp(r.total); } }], cat) : CS.empty('Tidak ada data.'));
  } };

  /* =================== CATAT & DAFTAR TRANSAKSI =================== */
  P.transaksi = { label: 'Catat Transaksi', icon: '＋', roles: ALL, group: 'KEUANGAN', async render(box) {
    var role = CS.user.role;
    box.appendChild(head('Catat & Daftar Transaksi', role === 'pegawai' ? 'Anda hanya melihat catatan Anda sendiri dan hanya dapat mencatat 7 hari terakhir.' : 'Seluruh transaksi toko. Transaksi tidak dapat dihapus; yang salah dibatalkan dengan alasan.', null));
    var cr = await sb().from('finance_categories').select('*').eq('aktif', true).order('jenis').order('nama');
    if (cr.error) return box.appendChild(CS.errorBox(cr.error));
    var cats = cr.data || [];
    var jenis = el('select', { id: 'trJenis' }, el('option', { value: 'pemasukan', text: 'Pemasukan' }), el('option', { value: 'pengeluaran', text: 'Pengeluaran' }));
    var kat = el('select', { id: 'trKat' });
    function fillKat() { CS.clear(kat); cats.filter(function (c) { return c.jenis === jenis.value; }).forEach(function (c) { kat.appendChild(el('option', { value: c.id, text: c.nama })); }); }
    jenis.addEventListener('change', fillKat); fillKat();
    var tgl = el('input', { type: 'date', id: 'trTgl', value: wib(0), max: wib(0), min: role === 'pegawai' ? wib(-7) : '' });
    var nom = el('input', { type: 'number', id: 'trNom', min: 1, max: 1000000000, step: 1, inputmode: 'numeric', placeholder: 'contoh: 25000' });
    var met = el('select', { id: 'trMet' }); Object.keys(METODE).forEach(function (k) { met.appendChild(el('option', { value: k, text: METODE[k] })); });
    var ket = el('input', { type: 'text', id: 'trKet', maxlength: 200, placeholder: 'opsional, mis. fotokopi 100 lembar' });
    var btn = el('button', { type: 'submit', class: 'btn', text: 'Simpan transaksi' });
    var form = el('form', { class: 'panel formgrid', novalidate: 'novalidate' }, el('h3', { text: 'Transaksi baru' }),
      field('Jenis', jenis), field('Kategori', kat), field('Tanggal', tgl), field('Nominal (Rp)', nom), field('Metode', met), field('Keterangan', ket), btn);
    box.appendChild(form);
    var listBox = el('div'); box.appendChild(listBox);
    var from = el('input', { type: 'date', value: wib(-29) }), to = el('input', { type: 'date', value: wib(0) });
    var fj = el('select', null, el('option', { value: '', text: 'Semua jenis' }), el('option', { value: 'pemasukan', text: 'Pemasukan' }), el('option', { value: 'pengeluaran', text: 'Pengeluaran' }));
    var fs = el('select', null, el('option', { value: '', text: 'Semua status' }), el('option', { value: 'aktif', text: 'Aktif' }), el('option', { value: 'batal', text: 'Dibatalkan' }));
    var rows = [];
    async function load() {
      CS.clear(listBox).appendChild(CS.loading());
      var q = sb().from('finance_transactions').select('*, finance_categories(nama)').gte('tanggal', from.value).lte('tanggal', to.value).order('tanggal', { ascending: false }).order('id', { ascending: false }).limit(500);
      if (fj.value) q = q.eq('jenis', fj.value); if (fs.value) q = q.eq('status', fs.value);
      var r = await q; CS.clear(listBox);
      if (r.error) return listBox.appendChild(CS.errorBox(r.error));
      rows = r.data || [];
      var cols = [{ label: 'Tanggal', key: 'tanggal' },
        { label: 'Jenis', render: function (x) { return CS.badge(x.jenis === 'pemasukan' ? 'Masuk' : 'Keluar', x.jenis === 'pemasukan' ? 'green' : 'orange'); } },
        { label: 'Kategori', render: function (x) { return x.finance_categories ? x.finance_categories.nama : '-'; } },
        { label: 'Nominal', render: function (x) { return rp(x.nominal); } },
        { label: 'Metode', render: function (x) { return METODE[x.metode] || x.metode; } },
        { label: 'Keterangan', render: function (x) { return x.keterangan || '-'; } },
        { label: 'Dicatat oleh', key: 'created_by_name' },
        { label: 'Status', render: function (x) { return x.status === 'batal' ? el('span', null, CS.badge('Batal', 'red'), ' ', el('small', { text: (x.void_reason || '') + ' (' + (x.voided_by_name || '') + ')' })) : CS.badge('Aktif', 'green'); } }];
      if (canVoid()) cols.push({ label: 'Aksi', render: function (x) {
        if (x.status === 'batal') return '';
        return el('button', { type: 'button', class: 'btn sm ghost', text: 'Batalkan', onclick: function () { doVoid(x); } }); } });
      listBox.appendChild(rows.length ? CS.table(cols, rows) : CS.empty('Belum ada transaksi pada filter ini.'));
      listBox.appendChild(el('p', { class: 'hint', text: rows.length + ' transaksi ditampilkan (maks. 500).' }));
    }
    async function doVoid(x) {
      var why = window.prompt('Alasan pembatalan (5–200 karakter):\n' + x.tanggal + ' · ' + rp(x.nominal) + ' · ' + (x.keterangan || ''));
      if (why === null) return;
      why = why.trim(); if (why.length < 5) return CS.toast('Alasan minimal 5 karakter.', 'err');
      var r = await sb().rpc('void_transaction', { p_id: x.id, p_reason: why });
      if (r.error) return CS.toast(msgErr(r.error), 'err');
      CS.toast('Transaksi dibatalkan.'); load();
    }
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var n = Math.floor(Number(nom.value));
      if (!n || n < 1 || n > 1e9) return CS.toast('Nominal harus 1 – 1.000.000.000.', 'err');
      if (!tgl.value) return CS.toast('Tanggal wajib diisi.', 'err');
      btn.disabled = true;
      var r = await sb().rpc('add_transaction', { p_tanggal: tgl.value, p_category_id: Number(kat.value), p_nominal: n, p_metode: met.value, p_keterangan: ket.value.trim() || null });
      btn.disabled = false;
      if (r.error) return CS.toast(msgErr(r.error), 'err');
      CS.toast('Tersimpan: ' + rp(n)); nom.value = ''; ket.value = ''; load();
    });
    box.appendChild(el('div', { class: 'rangebar' }, el('label', null, 'Dari', from), el('label', null, 'Sampai', to), el('label', null, 'Jenis', fj), el('label', null, 'Status', fs),
      el('button', { type: 'button', class: 'btn sm', text: 'Terapkan', onclick: load }),
      canVoid() ? el('button', { type: 'button', class: 'btn sm ghost', text: '⬇ Ekspor CSV', onclick: function () {
        if (!rows.length) return CS.toast('Tidak ada data.', 'err');
        CS.download('transaksi-' + wib(0) + '.csv', CS.toCSV(['Tanggal', 'Jenis', 'Kategori', 'Nominal', 'Metode', 'Keterangan', 'Dicatat oleh', 'Status', 'Alasan batal'],
          rows.map(function (x) { return [x.tanggal, x.jenis, x.finance_categories ? x.finance_categories.nama : '', x.nominal, x.metode, x.keterangan, x.created_by_name, x.status, x.void_reason]; }))); } }) : null));
    box.insertBefore(box.lastChild, listBox);
    load();
  } };

  /* =================== KATEGORI (ADMIN) =================== */
  P.kategori = { label: 'Kategori Keuangan', icon: '☷', roles: ADM, group: 'KEUANGAN', async render(box) {
    box.appendChild(head('Kategori Keuangan', 'Kategori yang dinonaktifkan tidak muncul di formulir, tetapi transaksi lama tetap utuh.', null));
    var nama = el('input', { type: 'text', maxlength: 60, placeholder: 'Nama kategori' });
    var jn = el('select', null, el('option', { value: 'pemasukan', text: 'Pemasukan' }), el('option', { value: 'pengeluaran', text: 'Pengeluaran' }));
    var list = el('div');
    box.appendChild(el('form', { class: 'panel formgrid', novalidate: 'novalidate', onsubmit: async function (e) {
      e.preventDefault(); var r = await sb().rpc('add_category', { p_nama: nama.value.trim(), p_jenis: jn.value });
      if (r.error) return CS.toast(msgErr(r.error), 'err'); nama.value = ''; CS.toast('Kategori ditambahkan.'); load(); } },
      el('h3', { text: 'Tambah kategori' }), field('Nama', nama), field('Jenis', jn), el('button', { type: 'submit', class: 'btn', text: 'Tambah' })));
    box.appendChild(list);
    async function load() {
      CS.clear(list).appendChild(CS.loading());
      var r = await sb().from('finance_categories').select('*').order('jenis').order('nama'); CS.clear(list);
      if (r.error) return list.appendChild(CS.errorBox(r.error));
      list.appendChild(CS.table([{ label: 'Nama', key: 'nama' }, { label: 'Jenis', key: 'jenis' }, { label: 'Status', render: function (x) { return CS.badge(x.aktif ? 'Aktif' : 'Nonaktif', x.aktif ? 'green' : 'gray'); } },
        { label: 'Aksi', render: function (x) { return el('button', { type: 'button', class: 'btn sm ghost', text: x.aktif ? 'Nonaktifkan' : 'Aktifkan', onclick: async function () {
          var q = await sb().rpc('set_category_active', { p_id: x.id, p_aktif: !x.aktif }); if (q.error) return CS.toast(msgErr(q.error), 'err'); load(); } }); } }], r.data || []));
    }
    load();
  } };

  /* =================== LAPORAN KEUANGAN =================== */
  P.lapkeu = { label: 'Laporan Keuangan', icon: '▤', roles: OWN, group: 'KEUANGAN', async render(box) {
    var gen = new Date();
    var act = el('div', { class: 'actions report-actions' });
    box.appendChild(head('Laporan Keuangan', 'Dihitung langsung dari transaksi aktif.', act));
    box.appendChild(dateBar(function () { CS.go('lapkeu'); }));
    var area = el('div', { class: 'report' }); box.appendChild(area);
    area.appendChild(el('div', { class: 'report-head' }, el('h3', { text: 'Laporan Keuangan — Toko Nadhiya Photocopy' }), el('p', { text: 'Periode: ' + FR.from + ' s/d ' + FR.to }),
      el('p', { text: 'Dibuat: ' + CS.fmtDT(gen) + ' oleh ' + CS.user.username + ' (' + CS.ROLE_LABEL[CS.user.role] + ')' })));
    var s = await summaryCards(area);
    var res = await Promise.all([sb().rpc('finance_daily', { p_from: FR.from, p_to: FR.to }), sb().rpc('finance_by_category', { p_from: FR.from, p_to: FR.to })]);
    var bad = res.filter(function (x) { return x.error; })[0]; if (bad) return area.appendChild(CS.errorBox(bad.error));
    var daily = res[0].data || [], cat = res[1].data || [];
    area.appendChild(el('h4', { text: 'Rekap harian' }));
    area.appendChild(daily.length ? CS.table([{ label: 'Tanggal', key: 'tanggal' }, { label: 'Pemasukan', render: function (r) { return rp(r.pemasukan); } }, { label: 'Pengeluaran', render: function (r) { return rp(r.pengeluaran); } }], daily) : CS.empty('Tidak ada data.'));
    area.appendChild(el('h4', { text: 'Rekap per kategori' }));
    area.appendChild(cat.length ? CS.table([{ label: 'Jenis', key: 'jenis' }, { label: 'Kategori', key: 'kategori' }, { label: 'Jumlah', key: 'jumlah' }, { label: 'Total', render: function (r) { return rp(r.total); } }], cat) : CS.empty('Tidak ada data.'));
    act.appendChild(el('button', { type: 'button', class: 'btn sm', text: '⬇ Ekspor CSV', onclick: function () {
      var rows = [['LAPORAN KEUANGAN - TOKO NADHIYA PHOTOCOPY'], ['Periode', FR.from, FR.to], ['Dibuat', gen.toISOString(), CS.user.username], [], ['RINGKASAN'], ['Pemasukan', s ? s.pemasukan : ''], ['Pengeluaran', s ? s.pengeluaran : ''], [], ['HARIAN', 'Pemasukan', 'Pengeluaran']]
        .concat(daily.map(function (r) { return [r.tanggal, r.pemasukan, r.pengeluaran]; })).concat([[], ['KATEGORI', 'Jenis', 'Jumlah', 'Total']], cat.map(function (r) { return [r.kategori, r.jenis, r.jumlah, r.total]; }));
      CS.download('laporan-keuangan-' + wib(0) + '.csv', rows.map(function (r) { return r.map(CS.csvCell).join(','); }).join('\r\n')); } }));
    act.appendChild(el('button', { type: 'button', class: 'btn sm ghost', text: '🖨 Cetak / Simpan PDF', onclick: function () { document.body.classList.add('printing'); window.print(); setTimeout(function () { document.body.classList.remove('printing'); }, 500); } }));
  } };

  /* =================== LAPORAN KEAMANAN → PEMILIK =================== */
  function renderSnapshot(r) {
    var s = r.summary || {}, d = el('div', { class: 'report' });
    d.appendChild(el('div', { class: 'report-head' }, el('h3', { text: r.title }),
      el('p', { text: 'Periode: ' + CS.fmtDT(r.period_from) + ' s/d ' + CS.fmtDT(r.period_to) }),
      el('p', { text: 'Dikirim: ' + CS.fmtDT(r.created_at) + ' oleh ' + (r.created_by_name || '-') }),
      r.notes ? el('p', { text: 'Catatan admin: ' + r.notes }) : null));
    var cards = el('div', { class: 'cards' });
    [['Total percobaan login', s.total_login], ['Login berhasil', s.login_berhasil], ['Login gagal', s.login_gagal], ['Kode 2FA salah', s['2fa_gagal']], ['IP diblokir (periode)', s.ip_diblokir_periode], ['IP diblokir (aktif)', s.ip_diblokir_aktif], ['Transaksi dicatat', s.transaksi_dicatat], ['Transaksi dibatalkan', s.transaksi_dibatalkan]]
      .forEach(function (c) { cards.appendChild(stat(CS.num(c[1]), c[0])); });
    d.appendChild(cards);
    var ev = s.peristiwa || [], ip = s.ip_gagal_teratas || [], us = s.login_per_pengguna || [];
    d.appendChild(el('h4', { text: 'Peristiwa keamanan' }));
    d.appendChild(ev.length ? CS.table([{ label: 'Jenis', render: function (x) { return CS.EVENT_LABEL[x.jenis] || x.jenis || '-'; } }, { label: 'Tingkat', render: function (x) { return CS.sevBadge(x.tingkat); } }, { label: 'Jumlah', key: 'jumlah' }], ev) : CS.empty('Tidak ada peristiwa pada periode ini.'));
    d.appendChild(el('h4', { text: 'Siapa yang masuk ke web keuangan' }));
    d.appendChild(us.length ? CS.table([{ label: 'Pengguna', render: function (x) { return x.pengguna || '-'; } }, { label: 'Berhasil', key: 'masuk' }, { label: 'Gagal', key: 'gagal' }], us) : CS.empty('Tidak ada data.'));
    d.appendChild(el('h4', { text: 'IP dengan kegagalan terbanyak' }));
    d.appendChild(ip.length ? CS.table([{ label: 'IP', key: 'ip' }, { label: 'Gagal', key: 'gagal' }], ip) : CS.empty('Tidak ada data.'));
    return d;
  }
  var baseLaporan = P.laporan.render;
  P.laporan.render = async function (box) {
    await baseLaporan(box);
    var title = el('input', { type: 'text', maxlength: 120, value: 'Laporan Keamanan ' + wib(0) });
    var notes = el('textarea', { maxlength: 1000, rows: 3, placeholder: 'Catatan untuk pemilik (opsional)' });
    var btn = el('button', { type: 'submit', class: 'btn', text: '📨 Kirim ke Pemilik' });
    var hist = el('div');
    box.appendChild(el('form', { class: 'panel', novalidate: 'novalidate', onsubmit: async function (e) {
      e.preventDefault(); var rg = CS.rangeIso();
      if (!window.confirm('Kirim ringkasan periode di atas ke pemilik? Laporan yang terkirim tidak dapat diubah.')) return;
      btn.disabled = true;
      var r = await sb().rpc('send_security_report', { p_from: rg.from, p_to: rg.to, p_title: title.value.trim(), p_notes: notes.value.trim() || null });
      btn.disabled = false; if (r.error) return CS.toast(msgErr(r.error), 'err');
      CS.toast('Laporan terkirim ke pemilik.'); notes.value = ''; loadHist(); } },
      el('h3', { text: 'Kirim laporan ke pemilik' }), el('p', { class: 'hint', text: 'Ringkasan dihitung server dari periode yang dipilih di atas, lalu disimpan sebagai salinan tetap yang dapat dibaca pemilik.' }),
      field('Judul', title), field('Catatan', notes), btn), hist);
    async function loadHist() {
      CS.clear(hist).appendChild(CS.loading());
      var r = await sb().from('security_reports').select('*').order('created_at', { ascending: false }).limit(20); CS.clear(hist);
      if (r.error) return hist.appendChild(CS.errorBox(r.error));
      hist.appendChild(el('h4', { text: 'Riwayat laporan terkirim' }));
      hist.appendChild(r.data.length ? CS.table([{ label: 'Dikirim', render: function (x) { return CS.fmtDT(x.created_at); } }, { label: 'Judul', key: 'title' }, { label: 'Periode', render: function (x) { return CS.fmtDT(x.period_from) + ' – ' + CS.fmtDT(x.period_to); } }], r.data) : CS.empty('Belum ada laporan terkirim.'));
    }
    loadHist();
  };

  P.laporanmasuk = { label: 'Laporan Keamanan', icon: '✉', roles: ['pemilik'], group: 'KEAMANAN', async render(box) {
    box.appendChild(head('Laporan Keamanan dari Admin', 'Salinan hanya-baca. Pemilik tidak membuka dashboard keamanan langsung.', null));
    var r = await sb().from('security_reports').select('*').order('created_at', { ascending: false }).limit(50);
    if (r.error) return box.appendChild(CS.errorBox(r.error));
    if (!r.data.length) return box.appendChild(CS.empty('Belum ada laporan dari admin.'));
    var view = el('div');
    box.appendChild(CS.table([{ label: 'Dikirim', render: function (x) { return CS.fmtDT(x.created_at); } }, { label: 'Judul', key: 'title' }, { label: 'Oleh', key: 'created_by_name' },
      { label: 'Aksi', render: function (x) { return el('button', { type: 'button', class: 'btn sm', text: 'Buka', onclick: function () { CS.clear(view).appendChild(renderSnapshot(x)); view.scrollIntoView(); } }); } }], r.data));
    box.appendChild(view);
    CS.clear(view).appendChild(renderSnapshot(r.data[0]));
  } };
})(window.CS);
