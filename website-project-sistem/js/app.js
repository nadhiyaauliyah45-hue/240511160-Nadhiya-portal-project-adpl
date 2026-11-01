/* =====================================================================
   APP: router halaman, menu berdasarkan peran, notifikasi (bel + realtime)
   ===================================================================== */
(function (CS) {
  'use strict';
  var el = CS.el, $ = CS.$, current = null, rt = null, bellTimer = null;

  var ORDER = ['dashboard', 'monitoring', 'ancaman', 'ip', 'audit', 'pengguna', 'laporan', 'pengaturan', 'profil'];

  function allowed(id) { var p = CS.pages[id]; return p && CS.user && p.roles.indexOf(CS.user.role) > -1; }

  function buildMenu() {
    var nav = CS.clear($('menu'));
    ORDER.filter(allowed).forEach(function (id) {
      var p = CS.pages[id];
      nav.appendChild(el('a', { href: '#' + id, 'data-page': id, class: 'mi' }, el('span', { class: 'mi-ico', 'aria-hidden': 'true', text: p.icon }), el('span', { text: p.label })));
    });
    $('userName').textContent = CS.user.username;
    $('userRole').textContent = CS.ROLE_LABEL[CS.user.role];
  }

  CS.go = function (id) {
    if (!allowed(id)) id = 'dashboard';
    if (location.hash !== '#' + id) { history.replaceState(null, '', '#' + id); }
    current = id; renderPage();
  };

  async function renderPage() {
    var id = current, p = CS.pages[id], box = CS.clear($('page'));
    document.querySelectorAll('.mi').forEach(function (a) { a.classList.toggle('active', a.getAttribute('data-page') === id); a.setAttribute('aria-current', a.getAttribute('data-page') === id ? 'page' : 'false'); });
    $('pageTitle').textContent = p.label;
    $('side').classList.remove('open');
    try { await p.render(box); } catch (e) { box.appendChild(CS.errorBox(e)); }
    window.scrollTo(0, 0);
  }

  /* ---------- Notifikasi: bel + realtime (hanya Admin / Pemilik) ---------- */
  CS.refreshBell = async function () {
    if (!CS.user || CS.user.role === 'pegawai') { $('bell').hidden = true; return; }
    $('bell').hidden = false;
    var r = await CS.client().from('security_events').select('*').eq('status', 'open').order('created_at', { ascending: false }).limit(8);
    var list = CS.clear($('bellList'));
    if (r.error) { list.appendChild(CS.errorBox(r.error)); return; }
    $('bellCount').textContent = r.data.length >= 8 ? '8+' : String(r.data.length);
    $('bellCount').hidden = r.data.length === 0;
    if (!r.data.length) list.appendChild(CS.empty('Tidak ada notifikasi baru.'));
    r.data.forEach(function (e) {
      list.appendChild(el('div', { class: 'evt' }, el('div', { class: 'evt-top' }, CS.sevBadge(e.severity), el('b', { text: CS.EVENT_LABEL[e.event_type] || e.event_type }), el('time', { text: CS.fmtDT(e.created_at) })), el('p', { text: e.description })));
    });
  };
  function startRealtime() {
    if (CS.user.role === 'pegawai') return;
    try {
      rt = CS.client().channel('security-events').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'security_events' }, function (m) {
        var e = m.new || {}; CS.toast('Notifikasi: ' + (CS.EVENT_LABEL[e.event_type] || 'peristiwa keamanan baru') + (e.ip ? ' (' + e.ip + ')' : ''), e.severity === 'high' || e.severity === 'critical' ? 'err' : '');
        CS.refreshBell();
      }).subscribe();
    } catch (x) { /* realtime opsional; tombol refresh & penyegaran berkala tetap berjalan */ }
    bellTimer = setInterval(CS.refreshBell, 60000);   // cadangan bila realtime tidak aktif
  }

  CS.onLogout = function () {
    clearInterval(bellTimer);
    try { if (rt) CS.client().removeChannel(rt); } catch (e) { /* abaikan */ }
    rt = null; CS.clear($('page')); CS.clear($('menu'));
    $('loginPw').value = ''; $('loginId').value = '';
  };

  function onReady() {
    buildMenu(); CS.refreshBell(); startRealtime();
    var id = (location.hash || '').replace('#', '') || 'dashboard';
    CS.go(id);
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('btnMenu').addEventListener('click', function () { $('side').classList.toggle('open'); });
    $('bell').addEventListener('click', function (e) { e.stopPropagation(); var d = $('bellPanel'); d.hidden = !d.hidden; $('bell').setAttribute('aria-expanded', String(!d.hidden)); });
    document.addEventListener('click', function (e) { if (!$('bellPanel').contains(e.target)) { $('bellPanel').hidden = true; $('bell').setAttribute('aria-expanded', 'false'); } });
    $('btnLogoutTop').addEventListener('click', function () { CS.logout(false); });
    window.addEventListener('hashchange', function () { if (CS.user) { var id = location.hash.replace('#', ''); if (id !== current) CS.go(id); } });
    document.querySelectorAll('[data-nav]').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); var t = a.getAttribute('href'); document.body.classList.add('leaving'); setTimeout(function () { location.href = t; }, 300); });
    });
    window.addEventListener('pageshow', function () { document.body.classList.remove('leaving'); });
    CS.bootAuth(onReady);
  });
})(window.CS);
