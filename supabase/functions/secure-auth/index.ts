// =====================================================================
//  EDGE FUNCTION: secure-auth   (Supabase Edge Functions / Deno)
//  Lapisan TEPERCAYA untuk keamanan login. Berjalan di server, bukan di browser.
//
//  Aksi (POST, JSON):
//   - login        {identifier, password}  -> cek blokir/penundaan, verifikasi password,
//                                             catat percobaan, jalankan deteksi brute force
//   - mfa-report   {ok: boolean}           -> catat hasil verifikasi TOTP (header Bearer)
//   - logout       {}                      -> catat logout & cabut sesi (header Bearer)
//   - create-user  {username,email,full_name,role,password}  (hanya administrator AAL2)
//
//  Rahasia (SERVICE_ROLE_KEY) hanya dibaca dari environment function ini,
//  TIDAK pernah dikirim ke browser. Lihat README untuk pengaturan.
// =====================================================================

declare const Deno: any;

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ALLOWED_ORIGIN?: string; // contoh: https://domainanda.com  (kosong = *)
}

const ROLES = ['administrator', 'pemilik', 'pegawai'];
const GENERIC_LOGIN_ERROR = 'Username atau kata sandi salah.';

function json(body: unknown, status: number, origin: string, extra: Record<string, string> = {}): Response {
   return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Cache-Control': 'no-store',
      ...extra,
    },
  });
}

/** IP klien. Di Supabase Edge, header ini diisi oleh infrastruktur (bukan oleh pengguna). */
export function clientIp(req: Request): string {
  const cf = req.headers.get('cf-connecting-ip');
  const xff = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  const ip = (cf || xff || '').trim();
  return /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : 'unknown';
}

function jwtPayload(token: string): Record<string, unknown> {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(part + '='.repeat((4 - (part.length % 4)) % 4)));
  } catch { return {}; }
}

export async function handle(req: Request, env: Env, f: typeof fetch = fetch): Promise<Response> {
  const origin = env.ALLOWED_ORIGIN || '*';
  if (req.method === 'OPTIONS') return json({}, 204, origin);
  if (req.method !== 'POST') return json({ error: 'Metode tidak diizinkan' }, 405, origin);
  if (Number(req.headers.get('content-length') || 0) > 4096) return json({ error: 'Permintaan terlalu besar' }, 413, origin);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Format permintaan tidak valid' }, 400, origin); }
  if (typeof body !== 'object' || body === null) return json({ error: 'Format permintaan tidak valid' }, 400, origin);

  const ip = clientIp(req);
  const ua = (req.headers.get('user-agent') || '').slice(0, 200);
  const svc = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };

  const rpc = async (name: string, args: Record<string, unknown>) => {
    const r = await f(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: svc, body: JSON.stringify(args) });
    if (!r.ok) throw new Error(`rpc ${name} gagal (${r.status})`);
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  };
  const record = (identifier: string, stage: string, success: boolean, reason: string | null, userId: string | null) =>
    rpc('record_login_attempt', { p_identifier: identifier, p_ip: ip, p_stage: stage, p_success: success, p_reason: reason, p_user_id: userId, p_user_agent: ua });

  /** Validasi token pengguna ke Supabase Auth; kembalikan {id, aal} atau null */
  const whoAmI = async () => {
    const auth = req.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) return null;
    const r = await f(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const u = await r.json();
    return { id: String(u.id), email: String(u.email || ''), aal: String(jwtPayload(token).aal || ''), token };
  };
  const profileOf = async (id: string) => {
    const r = await f(`${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&select=id,username,role,is_active`, { headers: svc });
    const rows = r.ok ? await r.json() : [];
    return rows[0] || null;
  };
  const revoke = (token: string) => f(`${env.SUPABASE_URL}/auth/v1/logout?scope=global`, { method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } }).catch(() => null);

  try {
    // ------------------------------------------------------------ LOGIN
    if (body.action === 'login') {
      const identifier = typeof body.identifier === 'string' ? body.identifier.trim().toLowerCase() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      if (identifier.length < 3 || identifier.length > 120 || password.length < 1 || password.length > 200) {
        return json({ error: GENERIC_LOGIN_ERROR }, 400, origin);
      }

      const pre = await rpc('gate_precheck', { p_ip: ip, p_identifier: identifier });
      if (!pre.allowed) {
        if (pre.reason === 'ip_diblokir') {
          await record(identifier, 'password', false, 'ip_diblokir', null);
          return json({ error: 'Akses dari alamat ini sementara ditolak. Hubungi administrator.', blocked: true }, 403, origin);
        }
        return json({ error: 'Terlalu banyak percobaan. Coba lagi sebentar lagi.', retry_after: pre.retry_after }, 429, origin,
          { 'Retry-After': String(pre.retry_after || 5) });
      }

      // username -> email (jika berupa username)
      let email = identifier;
      if (!identifier.includes('@')) {
        const r = await f(`${env.SUPABASE_URL}/rest/v1/profiles?username=eq.${encodeURIComponent(identifier)}&select=email`, { headers: svc });
        const rows = r.ok ? await r.json() : [];
        email = rows[0]?.email || 'tidak-ada@invalid.local'; // tetap memanggil Auth agar waktu respons seragam
      }

      const tk = await f(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!tk.ok) {
        await record(identifier, 'password', false, 'kredensial_salah', null);
        return json({ error: GENERIC_LOGIN_ERROR }, 401, origin);
      }
      const session = await tk.json();
      const prof = await profileOf(session.user?.id);
      if (!prof || !prof.is_active) {
        await revoke(session.access_token);
        await record(identifier, 'password', false, prof ? 'akun_nonaktif' : 'tanpa_profil', session.user?.id || null);
        return json({ error: GENERIC_LOGIN_ERROR }, 401, origin);
      }
      await record(identifier, 'password', true, null, prof.id);
      return json({ access_token: session.access_token, refresh_token: session.refresh_token, expires_in: session.expires_in }, 200, origin);
    }

    // ------------------------------------------------------- MFA REPORT
    if (body.action === 'mfa-report') {
      const me = await whoAmI();
      if (!me) return json({ error: 'Sesi tidak valid' }, 401, origin);
      const prof = await profileOf(me.id);
      const name = prof?.username || me.email;
      if (body.ok === true) {
        if (me.aal !== 'aal2') return json({ error: 'Verifikasi 2FA belum selesai' }, 400, origin);
        await record(name, 'totp', true, null, me.id);
        return json({ ok: true, role: prof?.role || null }, 200, origin);
      }
      const res = await record(name, 'totp', false, 'kode_salah', me.id);
      if (res?.blocked) { await revoke(me.token); }
      return json({ ok: false, blocked: !!res?.blocked }, 200, origin);
    }

    // ----------------------------------------------------------- LOGOUT
    if (body.action === 'logout') {
      const me = await whoAmI();
      if (!me) return json({ ok: true }, 200, origin); // sudah tidak valid, anggap selesai
      await rpc('record_logout', { p_user_id: me.id, p_ip: ip });
      await revoke(me.token);
      return json({ ok: true }, 200, origin);
    }

    // ------------------------------------------------------ CREATE USER
    if (body.action === 'create-user') {
      const me = await whoAmI();
      const prof = me ? await profileOf(me.id) : null;
      if (!me || me.aal !== 'aal2' || !prof || !prof.is_active || prof.role !== 'administrator') {
        return json({ error: 'Akses ditolak' }, 403, origin);
      }
      const username = String(body.username || '').trim().toLowerCase();
      const email = String(body.email || '').trim().toLowerCase();
      const fullName = String(body.full_name || '').trim().slice(0, 100);
      const role = String(body.role || '');
      const password = String(body.password || '');
      if (!/^[a-z0-9._-]{3,32}$/.test(username)) return json({ error: 'Username 3-32 karakter: huruf kecil, angka, titik, strip, garis bawah' }, 400, origin);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) return json({ error: 'Email tidak valid' }, 400, origin);
      if (!ROLES.includes(role)) return json({ error: 'Peran tidak valid' }, 400, origin);
      if (password.length < 12 || password.length > 100 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
        return json({ error: 'Kata sandi minimal 12 karakter dan mengandung huruf serta angka' }, 400, origin);
      }

      const cr = await f(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST', headers: svc, body: JSON.stringify({ email, password, email_confirm: true }),
      });
      if (!cr.ok) return json({ error: 'Gagal membuat akun (email mungkin sudah terdaftar)' }, 400, origin);
      const created = await cr.json();
      const ins = await f(`${env.SUPABASE_URL}/rest/v1/profiles`, {
        method: 'POST', headers: { ...svc, Prefer: 'return=minimal' },
        body: JSON.stringify({ id: created.id, username, email, full_name: fullName, role, is_active: true }),
      });
      if (!ins.ok) { // batalkan agar tidak ada akun tanpa profil
        await f(`${env.SUPABASE_URL}/auth/v1/admin/users/${created.id}`, { method: 'DELETE', headers: svc });
        return json({ error: 'Gagal menyimpan profil (username mungkin sudah dipakai)' }, 400, origin);
      }
      await rpc('_audit', { p_action: 'pengguna_ditambahkan', p_actor: me.id, p_actor_name: prof.username, p_target: username,
        p_result: 'success', p_severity: 'medium', p_ip: ip, p_details: { peran: role } });
      return json({ ok: true, id: created.id }, 200, origin);
    }

    return json({ error: 'Aksi tidak dikenal' }, 400, origin);
  } catch (_e) {
    // Detail error internal TIDAK dikirim ke klien
    return json({ error: 'Terjadi kesalahan pada server. Coba lagi nanti.' }, 500, origin);
  }
}

if (typeof Deno !== 'undefined' && Deno.serve) {
  Deno.serve((req: Request) => handle(req, {
    SUPABASE_URL: Deno.env.get('SUPABASE_URL')!,
    SUPABASE_ANON_KEY: Deno.env.get('SUPABASE_ANON_KEY')!,
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    ALLOWED_ORIGIN: Deno.env.get('ALLOWED_ORIGIN') || undefined,
  }));
}
