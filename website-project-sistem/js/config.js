/* =====================================================================
   KONFIGURASI FRONTEND  (aman untuk publik: hanya URL + publishable key)
   ---------------------------------------------------------------------
   JANGAN PERNAH menaruh service_role key / secret key di file ini.
   Nilai di bawah sama dengan project Supabase Portal Tugas Anda.
   ===================================================================== */
window.CS_CONFIG = {
  SUPABASE_URL: 'https://zbhgperztnyrzvwwzqtz.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_9cilXPiX037rMHZokBFqjQ_LZwksKav',
  // Edge Function tepercaya (lihat supabase/functions/secure-auth)
  FUNCTION_URL: 'https://zbhgperztnyrzvwwzqtz.supabase.co/functions/v1/secure-auth',
  IDLE_MINUTES: 15,          // logout otomatis jika tidak ada aktivitas
  PAGE_SIZE: 50              // jumlah baris per halaman tabel
};
