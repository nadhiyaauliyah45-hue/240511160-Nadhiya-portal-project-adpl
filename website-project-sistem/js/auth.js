/* =====================================================================
   AUTENTIKASI: login (via Edge Function) -> verifikasi TOTP (Supabase MFA)
   -> sesi AAL2 -> logout / idle timeout.
   - Password TIDAK diverifikasi di browser; dikirim ke Edge Function (HTTPS).
   - TOTP memakai fitur MFA bawaan Supabase Auth (algoritma teruji, rahasia
     disimpan Supabase). Tidak ada kriptografi buatan sendiri.
   ===================================================================== */
(function (CS) {
  'use strict';
  var C = window.CS_CONFIG, el = CS.el, $ = CS.$;
  var sb = null, idleTimer = null, onReady = null, mfaFails = 0, countdownTimer = null;
  CS.user = null;   // { id, email, username, full_name, role }

  CS.client = function () { return sb; };

  CS.initClient = function () {
    if (!window.supabase || typeof window.supabase.createClient !== 'function') return false;
    sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
    return true;
  };

  function show(which) {
    ['viewLogin', 'viewMfa', 'app', 'boot'].forEach(function (id) { $(id).hidden = (id !== which); });
  }
  CS.showView = show;

  /* ---------- Login langkah 1 ---------- */
  function setLoginMsg(t, kind) { var m = $('loginMsg'); m.textContent = t || ''; m.className = 'alert ' + (kind || '') + (t ? '' : ' hide'); }

  async function doLogin(e) {
    e.preventDefault();
    var id = $('loginId').value.trim(), pw = $('loginPw').value;
    if (id.length < 3 || id.length > 120) return setLoginMsg('Masukkan username atau email (minimal 3 karakter).', 'err');
    if (!pw) return setLoginMsg('Kata sandi wajib diisi.', 'err');
    var btn = $('btnLogin'); btn.disabled = true; setLoginMsg('Memeriksa…', 'info');
    var r = await CS.callFn('login', { identifier: id, password: pw });
    $('loginPw').value = '';
    if (r.status === 200 && r.data.access_token) {
      var res = await sb.auth.setSession({ access_token: r.data.access_token, refresh_token: r.data.refresh_token });
      if (res.error) { btn.disabled = false; return setLoginMsg('Sesi tidak dapat dibuat. Coba lagi.', 'err'); }
      setLoginMsg('');
      btn.disabled = false;
      return startMfa();
    }
    if (r.status === 429) {
      var left = Number(r.data.retry_after) || 5;
      setLoginMsg('Terlalu banyak percobaan. Coba lagi dalam ' + left + ' detik.', 'err');
      clearInterval(countdownTimer);
      countdownTimer = setInterval(function () {
        left--; if (left <= 0) { clearInterval(countdownTimer); btn.disabled = false; setLoginMsg(''); }
        else setLoginMsg('Terlalu banyak percobaan. Coba lagi dalam ' + left + ' detik.', 'err');
      }, 1000);
      return;
    }
    btn.disabled = false;
    setLoginMsg(r.data.error || 'Login gagal.', 'err');
  }

  /* ---------- Login langkah 2: TOTP ---------- */
  async function startMfa() {
    show('viewMfa'); mfaFails = 0;
    var box = CS.clear($('mfaSetup')), info = $('mfaInfo');
    $('mfaCode').value = ''; $('mfaMsg').textContent = ''; $('mfaMsg').className = 'alert hide';
    var lf = await sb.auth.mfa.listFactors();
    var verified = lf.data && lf.data.totp ? lf.data.totp.filter(function (f) { return f.status === 'verified'; })[0] : null;
    CS.factorId = null;
    if (verified) {
      CS.factorId = verified.id;
      info.textContent = 'Masukkan 6 digit kode dari aplikasi authenticator Anda (Google Authenticator, Authy, dll.).';
      return;
    }
    // Belum punya authenticator -> pendaftaran. Bersihkan faktor setengah jadi dulu.
    var old = lf.data && lf.data.all ? lf.data.all.filter(function (f) { return f.status !== 'verified'; }) : [];
    for (var i = 0; i < old.length; i++) await sb.auth.mfa.unenroll({ factorId: old[i].id });
    var en = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator ' + Date.now().toString(36) });
    if (en.error) { info.textContent = 'Pendaftaran 2FA gagal: ' + en.error.message; return; }
    CS.factorId = en.data.id;
    info.textContent = 'Akun Anda belum memiliki 2FA. Pindai kode QR dengan aplikasi authenticator, lalu masukkan 6 digit kode yang muncul.';
    var qr = en.data.totp && en.data.totp.qr_code;
    if (qr && /^data:image\/svg\+xml/.test(qr)) box.appendChild(el('img', { src: qr, alt: 'Kode QR untuk aplikasi authenticator', class: 'qr', width: 180, height: 180 }));
    box.appendChild(el('p', { class: 'hint' }, 'Atau masukkan kunci manual: ', el('code', { text: (en.data.totp && en.data.totp.secret) || '' })));
    box.appendChild(el('p', { class: 'hint warn', text: 'Kunci ini hanya ditampilkan sekali. Jangan dibagikan ke siapa pun.' }));
  }

  async function doVerify(e) {
    e.preventDefault();
    var code = $('mfaCode').value.replace(/\s/g, '');
    var msg = $('mfaMsg');
    function say(t, kind) { msg.textContent = t; msg.className = 'alert ' + kind; }
    if (!/^\d{6}$/.test(code)) return say('Kode harus 6 digit angka.', 'err');
    var btn = $('btnVerify'); btn.disabled = true;
    var ch = await sb.auth.mfa.challenge({ factorId: CS.factorId });
    if (ch.error) { btn.disabled = false; return say('Tantangan 2FA gagal. Coba lagi.', 'err'); }
    var vr = await sb.auth.mfa.verify({ factorId: CS.factorId, challengeId: ch.data.id, code: code });
    if (vr.error) {
      mfaFails++;
      var sess = await sb.auth.getSession();
      var rep = await CS.callFn('mfa-report', { ok: false }, sess.data.session && sess.data.session.access_token);
      btn.disabled = false; $('mfaCode').value = '';
      if (rep.data && rep.data.blocked) { await sb.auth.signOut({ scope: 'local' }); show('viewLogin'); return setLoginMsg('Terlalu banyak kode salah. Akses dari alamat ini diblokir sementara.', 'err'); }
      if (mfaFails >= 5) { await sb.auth.signOut({ scope: 'local' }); show('viewLogin'); return setLoginMsg('Terlalu banyak kode salah. Silakan login ulang.', 'err'); }
      return say('Kode tidak valid atau kedaluwarsa. Sisa percobaan: ' + (5 - mfaFails) + '.', 'err');
    }
    var s2 = await sb.auth.getSession();
    var rep2 = await CS.callFn('mfa-report', { ok: true }, s2.data.session.access_token);
    btn.disabled = false;
    if (rep2.status !== 200) { await sb.auth.signOut({ scope: 'local' }); show('viewLogin'); return setLoginMsg('Verifikasi tidak dapat dikonfirmasi server. Login ulang.', 'err'); }
    enterApp();
  }

  /* ---------- Masuk ke aplikasi ---------- */
  async function enterApp() {
    var u = await sb.auth.getUser();
    if (u.error || !u.data.user) return CS.logout(true);
    var p = await sb.from('profiles').select('id,username,email,full_name,role,is_active').eq('id', u.data.user.id).maybeSingle();
    if (p.error || !p.data || !p.data.is_active) {
      await sb.auth.signOut({ scope: 'local' }); show('viewLogin');
      return setLoginMsg('Akun tidak aktif atau belum memiliki profil. Hubungi administrator.', 'err');
    }
    CS.user = p.data; CS.user.id = u.data.user.id;
    startIdleWatch();
    show('app');
    if (onReady) onReady();
  }

  /* ---------- Idle timeout ---------- */
  function resetIdle() {
    clearTimeout(idleTimer);
    if (!CS.user) return;
    idleTimer = setTimeout(function () { CS.logout(true, 'Sesi berakhir karena tidak ada aktivitas.'); }, C.IDLE_MINUTES * 60 * 1000);
  }
  function startIdleWatch() {
    ['click', 'keydown', 'mousemove', 'touchstart', 'scroll'].forEach(function (ev) { window.addEventListener(ev, resetIdle, { passive: true }); });
    resetIdle();
  }

  /* ---------- Logout ---------- */
  CS.logout = async function (silent, why) {
    clearTimeout(idleTimer);
    try {
      var s = await sb.auth.getSession();
      if (s.data.session) await CS.callFn('logout', {}, s.data.session.access_token);
    } catch (e) { /* tetap lanjut keluar */ }
    try { await sb.auth.signOut({ scope: 'local' }); } catch (e) { /* abaikan */ }
    CS.user = null;
    show('viewLogin'); setLoginMsg(why || (silent ? '' : 'Anda telah keluar.'), why ? 'info' : (silent ? '' : 'ok'));
    if (CS.onLogout) CS.onLogout();
  };

  /* ---------- Titik masuk ---------- */
  CS.bootAuth = async function (readyCb) {
    onReady = readyCb;
    $('loginForm').addEventListener('submit', doLogin);
    $('mfaForm').addEventListener('submit', doVerify);
    $('btnMfaCancel').addEventListener('click', function () { CS.logout(true); });
    $('togglePw').addEventListener('click', function () {
      var i = $('loginPw'); var show = i.type === 'password'; i.type = show ? 'text' : 'password';
      this.textContent = show ? 'Sembunyikan' : 'Tampilkan'; this.setAttribute('aria-pressed', show);
    });
    if (!CS.initClient()) {
      show('viewLogin'); return setLoginMsg('Library Supabase gagal dimuat. Periksa koneksi internet lalu muat ulang halaman.', 'err');
    }
    // Pulihkan sesi hanya jika sudah AAL2 (lolos 2FA); selain itu minta login ulang.
    var s = await sb.auth.getSession();
    if (s.data.session) {
      var aal = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal.data && aal.data.currentLevel === 'aal2') return enterApp();
      await sb.auth.signOut({ scope: 'local' });
    }
    show('viewLogin');
  };
})(window.CS);
