/* =========================================================
   KONFIGURASI PORTAL TUGAS (tidak diubah dari versi sebelumnya)
   ---------------------------------------------------------
   - Supabase URL dan Publishable (anon) key SAMA dengan sebelumnya.
   - Jangan pernah menaruh key rahasia (secret / service_role) di file ini.
   - Nama tabel, bucket, dan kode mata kuliah harus sama dengan
     supabase-setup-v4.sql.
   ========================================================= */
window.PORTAL_CONFIG = {
  SUPABASE_URL: 'https://zbhgperztnyrzvwwzqtz.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_9cilXPiX037rMHZokBFqjQ_LZwksKav',
  TABLE_NAME: 'tugas',        // tabel tugas (juga UTS & UAS lewat kolom kategori)
  MATERI_TABLE: 'materi',     // tabel materi
  BUCKET: 'file-tugas',       // bucket Storage untuk file
  MAX_FILE_MB: 10,
  ALLOWED_EXT: ['pdf', 'doc', 'docx'],
  MATERI_EXT: ['pdf', 'doc', 'docx', 'ppt', 'pptx'],
  OWNER_NAME: 'Nadhiya',

  /* 8 mata kuliah. "kode" harus sama dengan nilai di database. */
  COURSES: [
    { kode: 'adpl', nama: 'Analisis dan Desain Perangkat Lunak',       pendek: 'ADPL',  icon: '🧩', dosen: 'Bu Dian Novianti, M.Kom.', desc: 'Analisis kebutuhan, pemodelan UML, dan perancangan perangkat lunak.' },
    { kode: 'pbp',  nama: 'Pemrograman Berbasis Platform',             pendek: 'PBP',   icon: '💻', dosen: '', desc: 'Pemrograman aplikasi pada berbagai platform.' },
    { kode: 'tti',  nama: 'Tata Tulis Ilmiah (Metodologi Penelitian)', pendek: 'TTI',   icon: '✍️', dosen: '', desc: 'Penulisan ilmiah dan metodologi penelitian.' },
    { kode: 'mpti', nama: 'Manajemen Proyek Teknologi Informasi',      pendek: 'MPTI',  icon: '📊', dosen: '', desc: 'Perencanaan dan pengelolaan proyek TI.' },
    { kode: 'aik4', nama: 'AIK 4 (Islam dan Ilmu Pengetahuan)',        pendek: 'AIK 4', icon: '📖', dosen: '', desc: 'Al-Islam dan Kemuhammadiyahan, Islam dan ilmu pengetahuan.' },
    { kode: 'npt',  nama: 'Network Penetration Testing',               pendek: 'NPT',   icon: '🛡️', dosen: '', desc: 'Pengujian keamanan jaringan secara etis dan terotorisasi.' },
    { kode: 'csam', nama: 'Cyber Security Analysis & Method',          pendek: 'CSAM',  icon: '🔐', dosen: '', desc: 'Analisis dan metode keamanan siber.' },
    { kode: 'imk',  nama: 'Interaksi Manusia dan Komputer',            pendek: 'IMK',   icon: '🖱️', dosen: '', desc: 'Perancangan antarmuka dan pengalaman pengguna.' }
  ],

  /* Folder tingkat 1; "tugas" punya dua sub-folder (kategori di database) */
  FOLDERS: [
    { id: 'materi', label: 'Materi', icon: '📘' },
    { id: 'tugas',  label: 'Tugas',  icon: '📝' },
    { id: 'uts',    label: 'UTS',    icon: '🧾' },
    { id: 'uas',    label: 'UAS',    icon: '🎓' }
  ],
  SUBFOLDERS: [
    { id: 'tugas_mandiri',  label: 'Tugas Mandiri' },
    { id: 'tugas_kelompok', label: 'Tugas Kelompok' }
  ],
  DEFAULT_COURSE: 'adpl',            // data lama tanpa mata_kuliah dianggap milik ADPL
  DEFAULT_KATEGORI: 'tugas_mandiri',

  /* Nilai status yang dikenali (kolom "status" bertipe text, tanpa batasan di database) */
  STATUS_DONE: 'Terkumpul',
  STATUS_PROGRESS: 'Sedang dikerjakan',
  STATUS_TODO: 'Belum dikerjakan'
};
