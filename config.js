// Pengaturan portal. Edit file ini saja, tidak perlu menyentuh kode lain.
// Semua nilai di bawah aman dilihat publik (kunci anon dilindungi aturan database).
window.APP_CONFIG = {
  // Nama sekolah yang tampil di layar masuk, bilah atas, dan laporan PDF
  SEKOLAH: 'SDIT Tahfidz Daarul Mu\'minin',

  // Supabase: Project Settings > API
  SUPABASE_URL: 'https://nwlenudmfxsehhidrjhh.supabase.co',        // contoh: https://abcdefgh.supabase.co
  SUPABASE_ANON_KEY: 'sb_publishable_yWa7WClXCsOvLFpMGvO2OQ_RvENPuBA',   // kunci "anon" atau "publishable" (BUKAN service_role)

  // Kunci publik notifikasi layar kunci (dibuat dengan alat/buat-kunci-vapid.html).
  // Kosongkan jika belum memakai notifikasi layar kunci.
  VAPID_PUBLIC: 'BFD8a2jPBRY-tZVMcI7sU2iVA5Tika8fD1S5mGx8sg230bLIURabFFtCw4vP0kOM74ukT5dJOT2820mxbQO_-MQ',

  // Siswa masuk dengan NIS. Di belakang layar NIS diubah menjadi email: NIS@domain-ini.
  // Domain ini tidak perlu benar-benar ada. Ubah SEBELUM membuat akun siswa dan jangan diganti lagi.
  NIS_DOMAIN: 'siswa.sekolah.id',

  // Nama fungsi server untuk membuat akun dan reset kata sandi (jangan diubah jika mengikuti panduan)
  EDGE_AKUN: 'kelola-akun',

  // Nama fungsi server untuk aktivasi guru/admin dengan kode OTP email
  EDGE_OTP: 'otp-staf'
};
