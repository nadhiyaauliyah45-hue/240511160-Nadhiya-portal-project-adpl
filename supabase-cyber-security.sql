-- =====================================================================
--  SISTEM INFORMASI CYBER SECURITY - TOKO NADHIYA PHOTOCOPY
--  Skema database Supabase (PostgreSQL)  -  v1
-- =====================================================================
--  CARA PAKAI
--   1. Supabase -> SQL Editor -> New query -> tempel seluruh file -> Run.
--   2. File ini AMAN dijalankan berulang (idempotent) dan TIDAK menyentuh
--      tabel Portal Tugas (tugas, materi). Tidak ada data yang dihapus.
--   3. Lanjut ke README bagian "Akun administrator pertama".
--
--  PRINSIP KEAMANAN
--   - Semua tabel keamanan memakai Row Level Security (RLS).
--   - Pengguna browser (role "authenticated") HANYA boleh SELECT, dan
--     hanya jika sesi sudah AAL2 (sudah lolos verifikasi TOTP 2FA)
--     dan akunnya aktif dengan peran yang berwenang.
--   - Tidak ada policy INSERT/UPDATE/DELETE untuk browser. Semua
--     perubahan lewat fungsi SECURITY DEFINER (yang memeriksa peran dan
--     menulis log audit) atau lewat Edge Function (service_role).
--   - Log audit & riwayat login dilindungi trigger anti-ubah/anti-hapus.
--   - Kata sandi di-hash oleh Supabase Auth. Rahasia TOTP disimpan oleh
--     Supabase Auth (auth.mfa_factors), tidak pernah ada di tabel kita.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TIPE & TABEL
-- ---------------------------------------------------------------------
do $$ begin
  create type public.app_role as enum ('administrator', 'pemilik', 'pegawai');
exception when duplicate_object then null; end $$;

-- 1a. Profil + peran (peran TIDAK bisa diubah oleh pengguna sendiri)
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text not null unique check (username ~ '^[a-z0-9._-]{3,32}$'),
  email         text,
  full_name     text not null default '' check (char_length(full_name) <= 100),
  role          public.app_role not null default 'pegawai',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  last_login_at timestamptz
);

-- 1b. Semua percobaan autentikasi (password & TOTP). Tidak menyimpan password/OTP.
create table if not exists public.login_attempts (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  identifier  text not null check (char_length(identifier) <= 120),
  user_id     uuid,
  ip          text not null default 'unknown',
  stage       text not null check (stage in ('password', 'totp')),
  success     boolean not null,
  reason      text check (char_length(reason) <= 80),
  user_agent  text check (char_length(user_agent) <= 200)
);
create index if not exists login_attempts_time_idx on public.login_attempts (created_at desc);
create index if not exists login_attempts_ip_idx   on public.login_attempts (ip, created_at desc);
create index if not exists login_attempts_ident_idx on public.login_attempts (lower(identifier), created_at desc);

-- 1c. Peristiwa keamanan hasil deteksi
create table if not exists public.security_events (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  event_type  text not null check (event_type in
    ('login_mencurigakan','ip_diblokir_otomatis','serangan_akun_terdistribusi',
     'ip_diblokir_manual','ip_dibuka','konfigurasi_diubah','akses_ditolak')),
  severity    text not null check (severity in ('info','low','medium','high','critical')),
  ip          text,
  identifier  text,
  description text not null check (char_length(description) <= 400),
  status      text not null default 'open' check (status in ('open','acknowledged','resolved')),
  details     jsonb not null default '{}'::jsonb
);
create index if not exists security_events_time_idx on public.security_events (created_at desc);
create index if not exists security_events_open_idx on public.security_events (status, severity);

-- 1d. IP yang diblokir (pemblokiran lapisan aplikasi, lihat README: batasan)
create table if not exists public.blocked_ips (
  id           bigint generated always as identity primary key,
  ip           text not null check (char_length(ip) <= 64),
  reason       text not null check (char_length(reason) between 3 and 200),
  source       text not null check (source in ('otomatis','manual')),
  event_id     bigint references public.security_events(id) on delete set null,
  blocked_at   timestamptz not null default now(),
  expires_at   timestamptz,                       -- NULL = permanen sampai dibuka manual
  active       boolean not null default true,
  created_by   uuid,
  unblocked_at timestamptz,
  unblocked_by uuid,
  unblock_note text check (char_length(unblock_note) <= 200)
);
create index if not exists blocked_ips_active_idx on public.blocked_ips (ip) where active;
create index if not exists blocked_ips_time_idx   on public.blocked_ips (blocked_at desc);

-- 1e. Log audit (hanya bisa ditambah lewat fungsi tepercaya)
create table if not exists public.audit_logs (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  action      text not null check (char_length(action) <= 60),
  actor_id    uuid,
  actor_name  text,
  target      text check (char_length(target) <= 200),
  result      text not null default 'success' check (result in ('success','failure')),
  severity    text not null default 'info' check (severity in ('info','low','medium','high','critical')),
  ip          text,
  details     jsonb not null default '{}'::jsonb
);
create index if not exists audit_logs_time_idx   on public.audit_logs (created_at desc);
create index if not exists audit_logs_action_idx on public.audit_logs (action, created_at desc);
create index if not exists audit_logs_actor_idx  on public.audit_logs (actor_name, created_at desc);

-- 1f. Konfigurasi keamanan (dapat diubah administrator)
create table if not exists public.security_settings (
  key         text primary key,
  value       integer not null,
  min_value   integer not null,
  max_value   integer not null,
  label       text not null,
  description text not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  check (value between min_value and max_value)
);

-- Nilai awal (tidak menimpa jika sudah pernah diubah administrator)
insert into public.security_settings (key, value, min_value, max_value, label, description) values
  ('window_minutes',       10,  1, 1440, 'Jendela waktu (menit)',
     'Kegagalan login dihitung dalam rentang waktu ini.'),
  ('suspicious_threshold',  3,  2,   50, 'Ambang mencurigakan (kali)',
     'Gagal login berulang dari satu IP dalam jendela waktu menghasilkan peristiwa "login mencurigakan".'),
  ('block_threshold',       5,  3,  100, 'Ambang blokir otomatis (kali)',
     'Gagal login (password atau kode 2FA) dari satu IP dalam jendela waktu memblokir IP tersebut.'),
  ('block_minutes',        30,  1, 10080, 'Durasi blokir awal (menit)',
     'Durasi blokir otomatis pertama. Pelanggaran berulang dalam 24 jam menggandakan durasi.'),
  ('max_block_minutes',  1440,  1, 43200, 'Durasi blokir maksimum (menit)',
     'Batas atas durasi blokir otomatis.'),
  ('spray_ip_count',        3,  2,   50, 'Ambang serangan terdistribusi (jumlah IP)',
     'Satu akun digagalkan dari sekian IP berbeda dalam jendela waktu: dicatat sebagai peristiwa, akun TIDAK dikunci (anti penguncian akun korban).')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 2. TRIGGER ANTI-UBAH untuk log (UPDATE / DELETE ditolak)
-- ---------------------------------------------------------------------
create or replace function public.tg_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'Tabel % bersifat append-only (tidak boleh diubah/dihapus).', tg_table_name
    using errcode = '42501';
end $$;

drop trigger if exists audit_logs_immutable on public.audit_logs;
create trigger audit_logs_immutable before update or delete on public.audit_logs
  for each row execute function public.tg_immutable();

drop trigger if exists login_attempts_immutable on public.login_attempts;
create trigger login_attempts_immutable before update or delete on public.login_attempts
  for each row execute function public.tg_immutable();

-- ---------------------------------------------------------------------
-- 3. FUNGSI BANTU PERAN (dipakai policy RLS)
-- ---------------------------------------------------------------------
-- Sesi sudah lolos 2FA? (claim "aal" pada JWT dari Supabase Auth)
create or replace function public.is_aal2() returns boolean
language sql stable as $$ select coalesce(auth.jwt() ->> 'aal', '') = 'aal2' $$;

-- Peran pengguna aktif saat ini (NULL jika akun nonaktif / tidak punya profil)
create or replace function public.my_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

-- Boleh jika sesi AAL2 dan peran termasuk daftar
create or replace function public.has_role(variadic r public.app_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_aal2() and coalesce(public.my_role() = any (r), false)
$$;

-- ---------------------------------------------------------------------
-- 4. FUNGSI INTERNAL: tulis log audit (tidak bisa dipanggil dari browser)
-- ---------------------------------------------------------------------
create or replace function public._audit(
  p_action text, p_actor uuid, p_actor_name text, p_target text,
  p_result text default 'success', p_severity text default 'info',
  p_ip text default null, p_details jsonb default '{}'::jsonb
) returns void
language sql security definer set search_path = public as $$
  insert into public.audit_logs (action, actor_id, actor_name, target, result, severity, ip, details)
  values (p_action, p_actor, p_actor_name, p_target, p_result, p_severity, p_ip, coalesce(p_details, '{}'::jsonb));
$$;

create or replace function public._setting(p_key text) returns integer
language sql stable security definer set search_path = public as $$
  select value from public.security_settings where key = p_key
$$;

-- ---------------------------------------------------------------------
-- 5. DETEKSI & PEMBLOKIRAN (dipanggil Edge Function dengan service_role)
-- ---------------------------------------------------------------------
-- 5a. Pemeriksaan SEBELUM memproses password
--     - IP sedang diblokir?  - penundaan progresif untuk pasangan (IP + akun)
--     Penundaan hanya berlaku untuk IP yang sama sehingga penyerang tidak bisa
--     mengunci akun korban dari IP lain.
create or replace function public.gate_precheck(p_ip text, p_identifier text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_block   public.blocked_ips%rowtype;
  v_n       integer;
  v_last    timestamptz;
  v_delay   integer;
  v_retry   integer;
begin
  -- tutup blokir yang sudah kedaluwarsa
  update public.blocked_ips set active = false, unblocked_at = now(), unblock_note = 'kedaluwarsa'
   where active and expires_at is not null and expires_at <= now();

  if p_ip is not null and p_ip <> 'unknown' then
    select * into v_block from public.blocked_ips where active and ip = p_ip order by blocked_at desc limit 1;
    if found then
      return jsonb_build_object('allowed', false, 'reason', 'ip_diblokir', 'expires_at', v_block.expires_at);
    end if;
  end if;

  -- penundaan progresif: 3 gagal=2 dtk, 4=4 dtk, 5=8 dtk ... maks 300 dtk
  select count(*), max(created_at) into v_n, v_last
    from public.login_attempts
   where ip = p_ip and lower(identifier) = lower(p_identifier)
     and success = false and stage = 'password'
     and coalesce(reason, '') <> 'ip_diblokir'
     and created_at > now() - interval '10 minutes';
  if v_n >= 3 then
    v_delay := least(300, power(2, v_n - 2)::integer);
    v_retry := ceil(extract(epoch from (v_last + make_interval(secs => v_delay) - now())))::integer;
    if v_retry > 0 then
      return jsonb_build_object('allowed', false, 'reason', 'terlalu_cepat', 'retry_after', v_retry);
    end if;
  end if;
  return jsonb_build_object('allowed', true);
end $$;

-- 5b. Catat percobaan + jalankan aturan deteksi (SEMUA logika ada di server)
create or replace function public.record_login_attempt(
  p_identifier text, p_ip text, p_stage text, p_success boolean,
  p_reason text, p_user_id uuid, p_user_agent text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ident     text := lower(left(coalesce(p_identifier, ''), 120));
  v_ip        text := coalesce(nullif(left(p_ip, 64), ''), 'unknown');
  v_window    interval := make_interval(mins => public._setting('window_minutes'));
  v_f_ip      integer;
  v_dist_ip   integer;
  v_blocked   boolean := false;
  v_event_id  bigint;
  v_prior     integer;
  v_minutes   integer;
  v_action    text;
  v_sev       text;
begin
  insert into public.login_attempts (identifier, user_id, ip, stage, success, reason, user_agent)
  values (v_ident, p_user_id, v_ip, p_stage, p_success, left(p_reason, 80), left(p_user_agent, 200));

  v_action := case when p_stage = 'password' and p_success then 'login_berhasil'
                   when p_stage = 'password' then 'login_gagal'
                   when p_success then '2fa_berhasil' else '2fa_gagal' end;
  v_sev := case when p_success then 'info' else 'low' end;
  perform public._audit(v_action, p_user_id, v_ident, null,
                        case when p_success then 'success' else 'failure' end, v_sev, v_ip,
                        jsonb_build_object('tahap', p_stage, 'alasan', left(p_reason, 80)));

  if p_success then
    if p_stage = 'totp' and p_user_id is not null then
      update public.profiles set last_login_at = now() where id = p_user_id;
    end if;
    return jsonb_build_object('blocked', false);
  end if;
  if coalesce(p_reason, '') = 'ip_diblokir' then
    return jsonb_build_object('blocked', true);
  end if;

  -- kegagalan dari IP ini dalam jendela waktu (password + TOTP)
  select count(*) into v_f_ip from public.login_attempts
   where ip = v_ip and success = false and coalesce(reason, '') <> 'ip_diblokir'
     and created_at > now() - v_window;

  -- IP tidak diketahui tidak bisa diblokir secara andal -> hanya dicatat
  if v_ip <> 'unknown' then
    if v_f_ip >= public._setting('block_threshold')
       and not exists (select 1 from public.blocked_ips where active and ip = v_ip) then

      select count(*) into v_prior from public.blocked_ips
       where ip = v_ip and source = 'otomatis' and blocked_at > now() - interval '24 hours';
      v_minutes := least(public._setting('max_block_minutes'),
                         public._setting('block_minutes') * power(2, least(v_prior, 10))::integer);

      insert into public.security_events (event_type, severity, ip, identifier, description, details)
      values ('ip_diblokir_otomatis', 'high', v_ip, v_ident,
              format('IP %s diblokir %s menit: %s kegagalan login dalam %s menit.',
                     v_ip, v_minutes, v_f_ip, public._setting('window_minutes')),
              jsonb_build_object('kegagalan', v_f_ip, 'menit_blokir', v_minutes))
      returning id into v_event_id;

      insert into public.blocked_ips (ip, reason, source, event_id, expires_at)
      values (v_ip, format('Brute force: %s kegagalan login dalam %s menit', v_f_ip, public._setting('window_minutes')),
              'otomatis', v_event_id, now() + make_interval(mins => v_minutes));

      perform public._audit('ip_diblokir_otomatis', null, 'sistem', v_ip, 'success', 'high', v_ip,
                            jsonb_build_object('menit', v_minutes, 'kegagalan', v_f_ip));
      v_blocked := true;

    elsif v_f_ip >= public._setting('suspicious_threshold')
          and not exists (select 1 from public.security_events
                           where event_type = 'login_mencurigakan' and ip = v_ip
                             and created_at > now() - v_window) then
      insert into public.security_events (event_type, severity, ip, identifier, description, details)
      values ('login_mencurigakan', 'medium', v_ip, v_ident,
              format('%s kegagalan login berulang dari IP %s dalam %s menit.', v_f_ip, v_ip, public._setting('window_minutes')),
              jsonb_build_object('kegagalan', v_f_ip));
      perform public._audit('login_mencurigakan', null, 'sistem', v_ip, 'success', 'medium', v_ip,
                            jsonb_build_object('kegagalan', v_f_ip));
    end if;
  end if;

  -- serangan terdistribusi pada satu akun (hanya dicatat, akun tidak dikunci)
  if v_ident <> '' then
    select count(distinct ip) into v_dist_ip from public.login_attempts
     where lower(identifier) = v_ident and success = false and stage = 'password'
       and coalesce(reason, '') <> 'ip_diblokir' and created_at > now() - v_window;
    if v_dist_ip >= public._setting('spray_ip_count')
       and not exists (select 1 from public.security_events
                        where event_type = 'serangan_akun_terdistribusi' and identifier = v_ident
                          and created_at > now() - v_window) then
      insert into public.security_events (event_type, severity, ip, identifier, description, details)
      values ('serangan_akun_terdistribusi', 'high', null, v_ident,
              format('Akun "%s" digagalkan dari %s IP berbeda dalam %s menit.', v_ident, v_dist_ip, public._setting('window_minutes')),
              jsonb_build_object('jumlah_ip', v_dist_ip));
      perform public._audit('serangan_akun_terdistribusi', null, 'sistem', v_ident, 'success', 'high', null,
                            jsonb_build_object('jumlah_ip', v_dist_ip));
    end if;
  end if;

  return jsonb_build_object('blocked', v_blocked, 'failures_ip', v_f_ip);
end $$;

-- Catat logout (dipanggil Edge Function setelah token tervalidasi)
create or replace function public.record_logout(p_user_id uuid, p_ip text) returns void
language sql security definer set search_path = public as $$
  select public._audit('logout', p_user_id,
    coalesce((select username from public.profiles where id = p_user_id), 'tidak diketahui'),
    null, 'success', 'info', p_ip, '{}'::jsonb);
$$;

-- Hanya service_role (Edge Function) yang boleh memanggil fungsi di atas
revoke all on function public.gate_precheck(text, text) from public, anon, authenticated;
revoke all on function public.record_login_attempt(text, text, text, boolean, text, uuid, text) from public, anon, authenticated;
revoke all on function public.record_logout(uuid, text) from public, anon, authenticated;
revoke all on function public._audit(text, uuid, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public._setting(text) from public, anon, authenticated;
grant execute on function public.gate_precheck(text, text) to service_role;
grant execute on function public.record_login_attempt(text, text, text, boolean, text, uuid, text) to service_role;
grant execute on function public.record_logout(uuid, text) to service_role;
grant execute on function public._audit(text, uuid, text, text, text, text, text, jsonb) to service_role;

-- ---------------------------------------------------------------------
-- 6. FUNGSI UNTUK DASHBOARD (dipanggil browser, peran diperiksa di server)
-- ---------------------------------------------------------------------
-- Ringkasan angka (boleh untuk semua peran aktif: pegawai hanya melihat angka)
create or replace function public.dashboard_summary(p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role('administrator', 'pemilik', 'pegawai') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'total_login',   count(*) filter (where stage = 'password'),
      'login_berhasil', count(*) filter (where stage = 'password' and success),
      'login_gagal',   count(*) filter (where stage = 'password' and not success),
      '2fa_gagal',     count(*) filter (where stage = 'totp' and not success),
      'mencurigakan',  (select count(*) from public.security_events e
                         where e.created_at >= p_from and e.created_at < p_to
                           and e.event_type in ('login_mencurigakan','serangan_akun_terdistribusi','ip_diblokir_otomatis')),
      'ip_diblokir',   (select count(*) from public.blocked_ips b
                         where b.active and (b.expires_at is null or b.expires_at > now())),
      'peristiwa_terbuka', (select count(*) from public.security_events e where e.status = 'open'),
      'generated_at',  now()
    )
    from public.login_attempts a where a.created_at >= p_from and a.created_at < p_to
  );
end $$;

-- Tren login per jam/hari
create or replace function public.login_trend(p_from timestamptz, p_to timestamptz, p_bucket text default 'hour')
returns table (bucket timestamptz, berhasil bigint, gagal bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role('administrator', 'pemilik') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  if p_bucket not in ('hour', 'day') then p_bucket := 'hour'; end if;
  return query
    select date_trunc(p_bucket, a.created_at) as bucket,
           count(*) filter (where a.success) as berhasil,
           count(*) filter (where not a.success) as gagal
      from public.login_attempts a
     where a.stage = 'password' and a.created_at >= p_from and a.created_at < p_to
     group by 1 order by 1;
end $$;

-- Ringkasan aktivitas per pengguna
create or replace function public.user_activity_summary(p_from timestamptz, p_to timestamptz)
returns table (username text, full_name text, role public.app_role, is_active boolean,
               login_berhasil bigint, login_gagal bigint, last_login_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role('administrator', 'pemilik') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  return query
    select p.username, p.full_name, p.role, p.is_active,
           count(a.id) filter (where a.success and a.stage = 'totp'),
           count(a.id) filter (where not a.success),
           p.last_login_at
      from public.profiles p
      left join public.login_attempts a
             on lower(a.identifier) in (p.username, lower(coalesce(p.email, '')))
            and a.created_at >= p_from and a.created_at < p_to
     group by p.id order by p.username;
end $$;

-- IP dengan kegagalan terbanyak (untuk laporan)
create or replace function public.top_failing_ips(p_from timestamptz, p_to timestamptz, p_limit int default 10)
returns table (ip text, gagal bigint, terakhir timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role('administrator', 'pemilik') then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  return query
    select a.ip, count(*), max(a.created_at)
      from public.login_attempts a
     where not a.success and a.created_at >= p_from and a.created_at < p_to
     group by a.ip order by 2 desc limit least(greatest(p_limit, 1), 50);
end $$;

-- ---------------------------------------------------------------------
-- 7. TINDAKAN ADMINISTRATIF (semuanya tercatat di log audit)
-- ---------------------------------------------------------------------
-- 7a. Blokir IP manual - hanya administrator
create or replace function public.block_ip(p_ip text, p_reason text, p_minutes integer default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_inet inet; v_ip text; v_id bigint; v_ev bigint; v_name text;
begin
  if not public.has_role('administrator') then raise exception 'Akses ditolak' using errcode = '42501'; end if;
  begin v_inet := trim(p_ip)::inet; exception when others then
    raise exception 'Format alamat IP tidak valid'; end;
  v_ip := host(v_inet);
  if char_length(trim(coalesce(p_reason, ''))) not between 3 and 200 then
    raise exception 'Alasan wajib diisi (3-200 karakter)'; end if;
  if p_minutes is not null and p_minutes not between 1 and 525600 then
    raise exception 'Durasi harus 1 - 525600 menit, atau kosong untuk permanen'; end if;
  if exists (select 1 from public.blocked_ips where active and ip = v_ip) then
    raise exception 'IP sudah diblokir'; end if;
  select username into v_name from public.profiles where id = auth.uid();

  insert into public.security_events (event_type, severity, ip, description, details)
  values ('ip_diblokir_manual', 'medium', v_ip,
          format('IP %s diblokir manual oleh %s.', v_ip, v_name), jsonb_build_object('alasan', trim(p_reason)))
  returning id into v_ev;
  insert into public.blocked_ips (ip, reason, source, event_id, expires_at, created_by)
  values (v_ip, trim(p_reason), 'manual', v_ev,
          case when p_minutes is null then null else now() + make_interval(mins => p_minutes) end, auth.uid())
  returning id into v_id;
  perform public._audit('ip_diblokir_manual', auth.uid(), v_name, v_ip, 'success', 'medium', null,
                        jsonb_build_object('alasan', trim(p_reason), 'menit', p_minutes));
  return v_id;
end $$;

-- 7b. Buka blokir - administrator atau pemilik
create or replace function public.unblock_ip(p_id bigint, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_row public.blocked_ips%rowtype; v_name text;
begin
  if not public.has_role('administrator', 'pemilik') then raise exception 'Akses ditolak' using errcode = '42501'; end if;
  select * into v_row from public.blocked_ips where id = p_id and active for update;
  if not found then raise exception 'Blokir tidak ditemukan atau sudah tidak aktif'; end if;
  select username into v_name from public.profiles where id = auth.uid();
  update public.blocked_ips set active = false, unblocked_at = now(), unblocked_by = auth.uid(),
         unblock_note = left(coalesce(nullif(trim(p_note), ''), 'dibuka manual'), 200)
   where id = p_id;
  insert into public.security_events (event_type, severity, ip, description, status)
  values ('ip_dibuka', 'info', v_row.ip, format('Blokir IP %s dibuka oleh %s.', v_row.ip, v_name), 'resolved');
  perform public._audit('ip_dibuka', auth.uid(), v_name, v_row.ip, 'success', 'info', null,
                        jsonb_build_object('catatan', left(coalesce(p_note, ''), 200)));
end $$;

-- 7c. Ubah status peristiwa (tinjau / selesai)
create or replace function public.set_event_status(p_id bigint, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if not public.has_role('administrator', 'pemilik') then raise exception 'Akses ditolak' using errcode = '42501'; end if;
  if p_status not in ('open', 'acknowledged', 'resolved') then raise exception 'Status tidak valid'; end if;
  update public.security_events set status = p_status where id = p_id;
  if not found then raise exception 'Peristiwa tidak ditemukan'; end if;
  select username into v_name from public.profiles where id = auth.uid();
  perform public._audit('peristiwa_diperbarui', auth.uid(), v_name, '#' || p_id, 'success', 'info', null,
                        jsonb_build_object('status', p_status));
end $$;

-- 7d. Ubah konfigurasi keamanan - hanya administrator
create or replace function public.update_setting(p_key text, p_value integer) returns void
language plpgsql security definer set search_path = public as $$
declare v_row public.security_settings%rowtype; v_name text;
begin
  if not public.has_role('administrator') then raise exception 'Akses ditolak' using errcode = '42501'; end if;
  select * into v_row from public.security_settings where key = p_key;
  if not found then raise exception 'Pengaturan tidak dikenal'; end if;
  if p_value is null or p_value not between v_row.min_value and v_row.max_value then
    raise exception 'Nilai harus antara % dan %', v_row.min_value, v_row.max_value; end if;
  select username into v_name from public.profiles where id = auth.uid();
  update public.security_settings set value = p_value, updated_at = now(), updated_by = auth.uid() where key = p_key;
  insert into public.security_events (event_type, severity, description, details, status)
  values ('konfigurasi_diubah', 'low', format('%s mengubah "%s" dari %s menjadi %s.', v_name, v_row.label, v_row.value, p_value),
          jsonb_build_object('key', p_key, 'lama', v_row.value, 'baru', p_value), 'resolved');
  perform public._audit('konfigurasi_diubah', auth.uid(), v_name, p_key, 'success', 'low', null,
                        jsonb_build_object('lama', v_row.value, 'baru', p_value));
end $$;

-- 7e. Kelola pengguna (peran, status aktif, nama) - hanya administrator
create or replace function public.admin_update_user(p_id uuid, p_role public.app_role, p_active boolean, p_full_name text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_old public.profiles%rowtype; v_name text; v_admins integer;
begin
  if not public.has_role('administrator') then raise exception 'Akses ditolak' using errcode = '42501'; end if;
  select * into v_old from public.profiles where id = p_id for update;
  if not found then raise exception 'Pengguna tidak ditemukan'; end if;
  if char_length(coalesce(p_full_name, '')) > 100 then raise exception 'Nama terlalu panjang'; end if;
  -- cegah kehilangan administrator terakhir / mengunci diri sendiri
  if v_old.role = 'administrator' and v_old.is_active and (p_role <> 'administrator' or not p_active) then
    select count(*) into v_admins from public.profiles where role = 'administrator' and is_active;
    if v_admins <= 1 then raise exception 'Tidak boleh menonaktifkan / menurunkan administrator terakhir'; end if;
  end if;
  if p_id = auth.uid() and (p_role <> v_old.role or not p_active) then
    raise exception 'Anda tidak dapat mengubah peran atau status akun Anda sendiri'; end if;

  update public.profiles set role = p_role, is_active = p_active, full_name = trim(coalesce(p_full_name, full_name)) where id = p_id;
  select username into v_name from public.profiles where id = auth.uid();
  if p_role <> v_old.role then
    perform public._audit('peran_diubah', auth.uid(), v_name, v_old.username, 'success', 'medium', null,
                          jsonb_build_object('lama', v_old.role, 'baru', p_role));
  end if;
  if p_active <> v_old.is_active then
    perform public._audit(case when p_active then 'pengguna_diaktifkan' else 'pengguna_dinonaktifkan' end,
                          auth.uid(), v_name, v_old.username, 'success', 'medium', null, '{}'::jsonb);
  end if;
  if coalesce(p_full_name, v_old.full_name) <> v_old.full_name then
    perform public._audit('pengguna_diubah', auth.uid(), v_name, v_old.username, 'success', 'info', null, '{}'::jsonb);
  end if;
end $$;

-- 7f. Reset 2FA pengguna (pengguna wajib mendaftar ulang authenticator saat login berikutnya)
create or replace function public.admin_reset_mfa(p_id uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
declare v_name text; v_target text;
begin
  if not public.has_role('administrator') then raise exception 'Akses ditolak' using errcode = '42501'; end if;
  select username into v_target from public.profiles where id = p_id;
  if v_target is null then raise exception 'Pengguna tidak ditemukan'; end if;
  delete from auth.mfa_factors where user_id = p_id;
  select username into v_name from public.profiles where id = auth.uid();
  perform public._audit('2fa_direset', auth.uid(), v_name, v_target, 'success', 'medium', null, '{}'::jsonb);
end $$;

-- Pegawai/administrator/pemilik yang sudah AAL2 boleh memanggil; peran dicek di dalam fungsi.
revoke all on function public.dashboard_summary(timestamptz, timestamptz) from public, anon;
revoke all on function public.login_trend(timestamptz, timestamptz, text) from public, anon;
revoke all on function public.user_activity_summary(timestamptz, timestamptz) from public, anon;
revoke all on function public.top_failing_ips(timestamptz, timestamptz, int) from public, anon;
revoke all on function public.block_ip(text, text, integer) from public, anon;
revoke all on function public.unblock_ip(bigint, text) from public, anon;
revoke all on function public.set_event_status(bigint, text) from public, anon;
revoke all on function public.update_setting(text, integer) from public, anon;
revoke all on function public.admin_update_user(uuid, public.app_role, boolean, text) from public, anon;
revoke all on function public.admin_reset_mfa(uuid) from public, anon;
grant execute on function public.dashboard_summary(timestamptz, timestamptz) to authenticated;
grant execute on function public.login_trend(timestamptz, timestamptz, text) to authenticated;
grant execute on function public.user_activity_summary(timestamptz, timestamptz) to authenticated;
grant execute on function public.top_failing_ips(timestamptz, timestamptz, int) to authenticated;
grant execute on function public.block_ip(text, text, integer) to authenticated;
grant execute on function public.unblock_ip(bigint, text) to authenticated;
grant execute on function public.set_event_status(bigint, text) to authenticated;
grant execute on function public.update_setting(text, integer) to authenticated;
grant execute on function public.admin_update_user(uuid, public.app_role, boolean, text) to authenticated;
grant execute on function public.admin_reset_mfa(uuid) to authenticated;
-- has_role / my_role / is_aal2 dipakai oleh policy dan boleh dipanggil pengguna login
grant execute on function public.is_aal2() to authenticated;
grant execute on function public.my_role() to authenticated;
grant execute on function public.has_role(public.app_role[]) to authenticated;

-- ---------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.login_attempts    enable row level security;
alter table public.security_events   enable row level security;
alter table public.blocked_ips       enable row level security;
alter table public.audit_logs        enable row level security;
alter table public.security_settings enable row level security;

-- Cabut semua hak bawaan, lalu beri SELECT saja untuk pengguna login
revoke all on public.profiles, public.login_attempts, public.security_events,
              public.blocked_ips, public.audit_logs, public.security_settings from anon, authenticated;
grant select on public.profiles, public.login_attempts, public.security_events,
                public.blocked_ips, public.audit_logs, public.security_settings to authenticated;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (public.is_aal2() and (id = auth.uid() and public.my_role() is not null
                               or public.has_role('administrator', 'pemilik')));

drop policy if exists login_attempts_select on public.login_attempts;
create policy login_attempts_select on public.login_attempts for select to authenticated
  using (public.has_role('administrator', 'pemilik'));

drop policy if exists security_events_select on public.security_events;
create policy security_events_select on public.security_events for select to authenticated
  using (public.has_role('administrator', 'pemilik'));

drop policy if exists blocked_ips_select on public.blocked_ips;
create policy blocked_ips_select on public.blocked_ips for select to authenticated
  using (public.has_role('administrator', 'pemilik'));

drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (public.has_role('administrator', 'pemilik'));

drop policy if exists security_settings_select on public.security_settings;
create policy security_settings_select on public.security_settings for select to authenticated
  using (public.has_role('administrator', 'pemilik'));

-- ---------------------------------------------------------------------
-- 9. AKUN ADMINISTRATOR PERTAMA (dijalankan SEKALI oleh pemilik proyek)
-- ---------------------------------------------------------------------
-- Langkah: buat pengguna di Supabase -> Authentication -> Users -> Add user
-- (centang Auto Confirm), lalu jalankan di SQL Editor:
--     select public.bootstrap_admin('email@anda.com', 'namauser', 'Nama Lengkap');
-- Fungsi ini hanya berhasil jika BELUM ada administrator, dan tidak bisa
-- dipanggil dari browser/API (hanya dari SQL Editor).
create or replace function public.bootstrap_admin(p_email text, p_username text, p_full_name text) returns text
language plpgsql security definer set search_path = public, auth as $$
declare v_id uuid;
begin
  if exists (select 1 from public.profiles where role = 'administrator') then
    raise exception 'Administrator sudah ada. Gunakan halaman Pengguna untuk menambah akun.'; end if;
  select id into v_id from auth.users where lower(email) = lower(trim(p_email));
  if v_id is null then raise exception 'Pengguna dengan email itu belum dibuat di Authentication -> Users'; end if;
  insert into public.profiles (id, username, email, full_name, role, is_active)
  values (v_id, lower(trim(p_username)), lower(trim(p_email)), trim(coalesce(p_full_name, '')), 'administrator', true);
  perform public._audit('administrator_pertama_dibuat', v_id, lower(trim(p_username)), null, 'success', 'high', null, '{}'::jsonb);
  return 'OK: administrator pertama dibuat';
end $$;
revoke all on function public.bootstrap_admin(text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 10. REALTIME (notifikasi) - hanya peristiwa & blokir
--     Realtime tunduk pada RLS: hanya admin/pemilik AAL2 yang menerima data.
-- ---------------------------------------------------------------------
do $$ begin
  begin alter publication supabase_realtime add table public.security_events;
  exception when duplicate_object then null; when undefined_object then null; end;
  begin alter publication supabase_realtime add table public.blocked_ips;
  exception when duplicate_object then null; when undefined_object then null; end;
end $$;
