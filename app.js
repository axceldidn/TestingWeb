/* Portal Sekolah. Pengaturan ada di config.js */
/* Pengaturan dibaca dari config.js */
const CFG = (typeof window !== 'undefined' && window.APP_CONFIG) || {};
const SCHOOL = CFG.SEKOLAH || 'Portal Sekolah';
const SUPABASE_URL = CFG.SUPABASE_URL || '';
const SUPABASE_KEY = CFG.SUPABASE_ANON_KEY || '';
const VAPID_PUBLIC = CFG.VAPID_PUBLIC || '';
const NIS_DOMAIN = CFG.NIS_DOMAIN || 'siswa.sekolah.id';
const EDGE_AKUN = CFG.EDGE_AKUN || 'kelola-akun';
const EDGE_OTP = CFG.EDGE_OTP || 'otp-staf';
const HASH = typeof location !== 'undefined' ? location.hash.slice(1) : '';


const sb = (SUPABASE_KEY && typeof supabase !== 'undefined' ? supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } }) : null);

/* ===== helper ===== */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const h = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const opt = (a, v, t) => a.map(x => `<option value="${x[v]}">${h(x[t])}</option>`).join('');
const head = (e, t, d) => `<h1>${t}</h1><p class="lead">${d}</p>`;
const ROLES = ['siswa', 'ortu', 'guru', 'kepsek', 'tu', 'admin'];
const ROLE_LABEL = { admin: 'Admin sekolah', guru: 'Guru', siswa: 'Siswa', ortu: 'Orang tua', kepsek: 'Kepala sekolah', tu: 'Tata usaha' };
let me = null, cur = null, kanal = null, ticker = null, maxId = null, PEND = [], curTugas = null, TA = null;

function toast(m, bad) {
  const t = $('#toast');
  t.textContent = m; t.className = bad ? 'bad' : ''; t.hidden = false;
  clearTimeout(t._x); t._x = setTimeout(() => t.hidden = true, 3200);
}

/* ===== login ===== */
function idKeEmail(id) { id = String(id || '').trim().toLowerCase(); return id.includes('@') ? id : `${id}@${NIS_DOMAIN}`; }
function viewKonfigurasi() {
  $('#app').innerHTML = `<div class="login"><h1>Konfigurasi belum diisi</h1><p class="lead">Buka file <b>config.js</b>, isi <b>SUPABASE_URL</b> dan <b>SUPABASE_ANON_KEY</b>, simpan, lalu muat ulang halaman ini.</p></div>`;
}
function viewLogin() {
  me = null;
  $('#app').innerHTML = `<div class="login"><img src="logo.jpg" alt="" class="logo-login" onerror="this.remove()"><p class="mut" style="margin:0 0 4px">Portal akademik</p><h1>${h(SCHOOL)}</h1>
  <p class="lead">Siswa masuk dengan NIS. Guru dan admin masuk dengan email.</p>
  <label>NIS atau email</label><input id="em" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" onkeydown="if(event.key==='Enter')$('#pw').focus()">
  <label>Kata sandi</label><div style="position:relative"><input id="pw" type="password" autocomplete="current-password" style="padding-right:64px" onkeydown="if(event.key==='Enter')doLogin()"><button class="lnk" type="button" style="position:absolute;right:12px;top:11px;color:var(--g)" onclick="lihatSandi()">Lihat</button></div>
  <button class="btn" style="width:100%" onclick="doLogin()">Masuk</button><p id="msg" style="color:var(--bad);margin:10px 0 0"></p>
  <p class="hint" style="margin-top:18px">Lupa kata sandi? Minta admin sekolah membuatkan yang baru.</p>
  <p class="hint" style="margin-top:8px">Guru atau admin baru? <button class="lnk" type="button" style="color:var(--g)" onclick="viewAktivasi()">Aktifkan akun lewat kode email</button></p><div id="pasangLogin" style="margin-top:16px"></div></div>`;
  segarkanPasang();
}
function lihatSandi() { const i = $('#pw'); i.type = i.type === 'password' ? 'text' : 'password'; }
async function doLogin() {
  const id = $('#em').value.trim();
  if (!id || !$('#pw').value) { $('#msg').textContent = 'Isi NIS atau email, dan kata sandi.'; return; }
  $('#msg').textContent = '';
  const { error } = await sb.auth.signInWithPassword({ email: idKeEmail(id), password: $('#pw').value });
  if (error) {
    const m = String(error.message || '');
    $('#msg').textContent = /invalid login/i.test(m) ? 'NIS, email, atau kata sandi salah. Periksa lagi, lalu coba kembali.'
      : /not confirmed/i.test(m) ? 'Email akun ini belum dikonfirmasi. Di Supabase, buka Authentication > Users, lalu konfirmasi akunnya.'
      : 'Gagal masuk: ' + m;
    return;
  }
  init();
}
async function logout() { if (kanal) sb.removeChannel(kanal); kanal = null; clearInterval(ticker); await sb.auth.signOut(); viewLogin(); }

async function init() {
  if (!sb) {
    if (!SUPABASE_URL || !SUPABASE_KEY) return viewKonfigurasi();
    $('#app').innerHTML = '<div class="login"><h1>Tidak bisa terhubung</h1><p class="lead">Pustaka Supabase gagal dimuat. Periksa koneksi internet, lalu muat ulang halaman.</p></div>'; return;
  }
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return viewLogin();
  const { data, error } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  if (error || !data) {
    await sb.auth.signOut(); viewLogin();
    $('#msg').textContent = error
      ? 'Login berhasil, tetapi data profil gagal dibaca: ' + error.message
      : 'Login berhasil, tetapi akun ini belum punya baris profil di database. Minta admin menjalankan SQL perbaikan profil (database/perbaiki-profil.sql), lalu masuk lagi.';
    return;
  }
  me = data; shell();
}

/* ===== kerangka & menu ===== */
const MENU = {
  admin: [['home', 'Beranda'], ['akun', 'Akun'], ['data', 'Data'], ['siswa', 'Siswa'], ['lainnya', 'Lainnya']],
  guru: [['home', 'Beranda'], ['absen', 'Absensi'], ['nilai', 'Nilai'], ['tugas', 'Tugas'], ['lainnya', 'Lainnya']],
  siswa: [['home', 'Beranda'], ['tugasku', 'Tugas'], ['jadwal', 'Jadwal'], ['lainnya', 'Lainnya']],
  ortu: [['home', 'Beranda'], ['tugasku', 'Tugas'], ['izin', 'Izin'], ['lainnya', 'Lainnya']],
  kepsek: [['home', 'Beranda'], ['laporanguru', 'Guru'], ['kas', 'Kas'], ['lainnya', 'Lainnya']],
  tu: [['home', 'Beranda'], ['spp', 'SPP'], ['kas', 'Kas'], ['gaji', 'Gaji'], ['lainnya', 'Lainnya']]
};
const MORE = {
  admin: [['mutasi', 'Mutasi siswa', 'Pindah masuk dan keluar, tercatat di buku induk'], ['dataguru', 'Data induk guru', 'NIP, jabatan, status kepegawaian'], ['km', 'Penilaian Kurikulum Merdeka', 'Tujuan pembelajaran, nilai formatif dan sumatif, raport siap cetak'], ['datakelas', 'Data siswa per kelas', 'Tanggal lahir, alamat, asal sekolah, orang tua'], ['kepsek', 'Dasbor kepala sekolah', 'Perbandingan kelas, tren kehadiran, ketuntasan, guru belum mengisi'], ['raport', 'Raport dan cetak satu kelas', 'Catatan wali kelas, sikap, cetak raport kelas dalam satu PDF'], ['pengaturan', 'Pengaturan sekolah', 'Wali kelas, tanggal raport, pengingat otomatis, identitas'], ['laporanguru', 'Presensi dan jurnal guru', 'Laporan bulanan untuk kepala sekolah'], ['spp', 'SPP dan tagihan', 'Catat pembayaran, buat tagihan'], ['tunggakan', 'Tunggakan', 'Siswa yang belum melunasi, kirim pengingat WhatsApp'], ['kas', 'Kas masuk dan keluar', 'Buku kas sekolah'], ['gaji', 'Gaji guru dan staf', 'Daftar gaji bulanan dan slip'], ['datasiswa', 'Data siswa', 'Nama wali dan nomor HP'], ['bk', 'Catatan BK', 'Catatan bimbingan konseling dan riwayat akses'], ['jadwal', 'Jadwal pelajaran', 'Atur jadwal tiap kelas dan guru'], ['ujian', 'Jadwal dan kartu ujian', 'Buat jadwal ujian, terbitkan, cetak kartu peserta'], ['peringkat', 'Peringkat', 'Peringkat kelas dan angkatan per semester'], ['perkembangan', 'Perkembangan nilai', 'Grafik nilai siswa antar semester'], ['kenaikan', 'Kenaikan kelas dan kelulusan', 'Proses akhir tahun dan arsip siswa lulus'], ['info', 'Pengumuman dan agenda', 'Kabar dan kalender kegiatan sekolah'], ['rekap', 'Rekap absensi', 'Rekap per bulan, bisa diunduh ke Excel'], ['impor', 'Impor siswa', 'Masukkan banyak siswa dari file Excel atau CSV'], ['sistem', 'Log dan backup', 'Riwayat perubahan, backup, pulihkan data, kunci notifikasi'], ['notif', 'Notifikasi', 'Kotak masuk dan notifikasi layar kunci'], ['sandi', 'Ubah kata sandi', 'Ganti kata sandi akunmu']],
  guru: [['dataguru', 'Data induk guru', 'NIP, jabatan, status kepegawaian'], ['km', 'Penilaian Kurikulum Merdeka', 'Tujuan pembelajaran, nilai formatif dan sumatif, raport siap cetak'], ['datakelas', 'Data siswa per kelas', 'Tanggal lahir, alamat, asal sekolah, orang tua'], ['jurnal', 'Presensi dan jurnal mengajar', 'Presensi masuk dan pulang, materi yang diajarkan'], ['raport', 'Raport', 'Catatan wali kelas, sikap, ekstrakurikuler, cetak raport satu kelas (PDF)'], ['slip', 'Slip gaji', 'Slip gaji bulanan'], ['peringkat', 'Peringkat', 'Peringkat kelas dan angkatan'], ['perkembangan', 'Perkembangan nilai', 'Grafik nilai siswa antar semester'], ['jadwal', 'Jadwal mengajar', 'Jadwal mengajar Anda'], ['ujian', 'Jadwal dan kartu ujian', 'Lihat jadwal ujian, cetak kartu peserta satu kelas'], ['rekap', 'Rekap absensi', 'Rekap per bulan, bisa diunduh ke Excel'], ['izin', 'Izin dan sakit siswa', 'Pengajuan dari orang tua'], ['pesan', 'Pesan ke orang tua', 'Percakapan pribadi'], ['info', 'Pengumuman dan agenda', 'Kabar dan kalender sekolah'], ['notif', 'Notifikasi', 'Kotak masuk dan notifikasi layar kunci'], ['sandi', 'Ubah kata sandi', 'Ganti kata sandi akunmu']],
  siswa: [['raportku', 'Raport', 'Raport yang sudah diterbitkan wali kelas'], ['laporan', 'Laporan hasil belajar', 'Kehadiran, nilai, dan peringkat. Bisa diunduh PDF'], ['perkembangan', 'Perkembangan nilai', 'Grafik nilaimu dari semester ke semester'], ['ujian', 'Jadwal dan kartu ujian', 'Jadwal ujian dan kartu peserta PDF'], ['info', 'Pengumuman dan agenda', 'Kabar dan kalender sekolah'], ['notif', 'Notifikasi', 'Kotak masuk dan notifikasi layar kunci'], ['sandi', 'Ubah kata sandi', 'Ganti kata sandi akunmu']],
  ortu: [['raportku', 'Raport', 'Raport yang sudah diterbitkan wali kelas'], ['tagihan', 'Tagihan sekolah', 'SPP dan tagihan anak, status lunas'], ['laporan', 'Laporan hasil belajar', 'Kehadiran, nilai, dan peringkat. Bisa diunduh PDF'], ['perkembangan', 'Perkembangan nilai', 'Grafik nilai anak dari semester ke semester'], ['ujian', 'Jadwal dan kartu ujian', 'Jadwal ujian dan kartu peserta PDF'], ['jadwal', 'Jadwal pelajaran anak', 'Jadwal tiap hari'], ['pesan', 'Pesan ke guru', 'Percakapan pribadi dengan guru'], ['info', 'Pengumuman dan agenda', 'Kabar dan kalender sekolah'], ['notif', 'Notifikasi', 'Kotak masuk dan notifikasi layar kunci'], ['sandi', 'Ubah kata sandi', 'Ganti kata sandi akunmu']],
  kepsek: [['mutasi', 'Mutasi siswa', 'Pindah masuk dan keluar, tercatat di buku induk'], ['dataguru', 'Data induk guru', 'NIP, jabatan, status kepegawaian'], ['km', 'Penilaian Kurikulum Merdeka', 'Tujuan pembelajaran, nilai formatif dan sumatif, raport siap cetak'], ['datakelas', 'Data siswa per kelas', 'Tanggal lahir, alamat, asal sekolah, orang tua'], ['tunggakan', 'Tunggakan SPP', 'Siswa yang belum melunasi'], ['rekap', 'Rekap absensi', 'Rekap per bulan, bisa diunduh ke Excel'], ['peringkat', 'Peringkat', 'Peringkat kelas dan angkatan per semester'], ['perkembangan', 'Perkembangan nilai', 'Grafik nilai siswa antar semester'], ['jadwal', 'Jadwal pelajaran', 'Jadwal tiap kelas'], ['info', 'Pengumuman dan agenda', 'Kabar dan kalender sekolah'], ['slip', 'Slip gaji', 'Slip gaji bulanan'], ['notif', 'Notifikasi', 'Kotak masuk dan notifikasi layar kunci'], ['sandi', 'Ubah kata sandi', 'Ganti kata sandi akunmu']],
  tu: [['mutasi', 'Mutasi siswa', 'Pindah masuk dan keluar, tercatat di buku induk'], ['dataguru', 'Data induk guru', 'NIP, jabatan, status kepegawaian'], ['datakelas', 'Data siswa per kelas', 'Tanggal lahir, alamat, asal sekolah, orang tua'], ['tunggakan', 'Tunggakan', 'Siswa yang belum melunasi, kirim pengingat WhatsApp'], ['datasiswa', 'Data siswa', 'Nama wali dan nomor HP'], ['impor', 'Impor siswa dari Excel', 'NIS, nama, kelas, wali, HP'], ['slip', 'Slip gaji', 'Slip gaji bulanan'], ['info', 'Pengumuman dan agenda', 'Kabar dan kalender sekolah'], ['notif', 'Notifikasi', 'Kotak masuk dan notifikasi layar kunci'], ['sandi', 'Ubah kata sandi', 'Ganti kata sandi akunmu']]
};
const VIEWS = {
  home: () => ({ admin: hAdmin, guru: hGuru, siswa: vLihat, ortu: vLihat, kepsek: vKepsek, tu: vTuBeranda }[me.role])(),
  akun: vAkun, data: vData, siswa: vSiswa, absen: vAbsen, nilai: vNilai, tugas: vTugas, raport: vRaport, tugasku: vTugasku, notif: vNotif, laporan: vLaporan, peringkat: vPeringkat,
  lainnya: vLainnya, sandi: vSandi, ujian: vUjian, kenaikan: vKenaikan, perkembangan: vPerkembangan, jadwal: vJadwal, izin: vIzin, info: vInfo, pesan: vPesan, rekap: vRekap, impor: vImpor, sistem: vSistem,
  kepsek: vKepsek, jurnal: vJurnal, laporanguru: vLaporanGuru, spp: vSpp, tunggakan: vTunggakan, tagihan: vTagihanOrtu, kas: vKas, gaji: vGaji, slip: vSlip, bk: vBk, datasiswa: vDataSiswa, pengaturan: vPengaturan, datakelas: vDataKelas,
  dataguru: vDataGuru, km: vKm, kmp5: vKmP5, kmpilihan: vKmPilihan, mutasi: vMutasi, raportku: vRaportku, kmtp: vKmTp, kmformatif: vKmFormatif, kmsumatif: vKmSumatif, kmrekap: vKmRekap, kmrapor: vKmRapor, kmpengaturan: vKmPengaturan
};
function shell() {
  maxId = null;
  $('#app').innerHTML = `<div id="off" class="demo" hidden>Tidak ada koneksi internet. Data yang tampil mungkin belum terbaru.</div>
  <div class="top"><span class="brand"><img src="logo.jpg" alt="" class="logo-top" onerror="this.remove()">${h(SCHOOL)}</span><div style="display:flex;gap:14px;align-items:center">
  <span id="pasangTop"></span><button class="bel" onclick="go('notif')">Notifikasi<span id="bd" class="badge" hidden></span></button>
  <div class="who">${h(me.nama)}<small>${ROLE_LABEL[me.role]} - <button class="lnk" onclick="logout()">Keluar</button></small></div></div></div>
  <div id="nb" hidden></div>
  <div class="wrap" id="main"></div>
  <nav class="tab">${MENU[me.role].map(([k, t]) => `<button data-k="${k}" onclick="go('${k}')">${t}</button>`).join('')}</nav>`;
  cekOnline(); segarkanPasang(); go(HASH && VIEWS[HASH] ? HASH : 'home'); segarkanBadge(); mulaiNotif();
}
async function go(k) {
  cur = k;
  const utama = MENU[me.role].some(([x]) => x === k);
  $$('.tab button').forEach(b => b.classList.toggle('on', b.dataset.k === (utama ? k : 'lainnya')));
  window.scrollTo(0, 0);
  try { await VIEWS[k](); } catch (e) { toast(e.message || 'Terjadi kesalahan', 1); }
}
async function tambah(t, o, pesan) {
  const { error } = await sb.from(t).insert(o);
  if (error) return toast(error.message, 1);
  toast(pesan || 'Tersimpan'); go(cur);
}

/* ===== BERANDA ADMIN ===== */
async function ambil(mk) {
  const out = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await mk().range(i, i + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}
const bar = (v, c = 'var(--g)') => `<div class="bar"><i style="width:${Math.max(0, Math.min(100, v))}%;background:${c}"></i></div>`;
async function dasbor(guru) {
  const adm = !guru, hari = new Date().toLocaleDateString('sv-SE'), hariIni = new Date().getDay() || 7;
  await muatBobot();
  const ta = await periodeAktif();
  const dari = ta && ta.mulai ? ta.mulai : new Date(Date.now() - 30 * 864e5).toLocaleDateString('sv-SE');
  const kosong = Promise.resolve({ data: [] });
  const [kl, sw, tg, pg, mp, pp, jd, dr, ab, nl, iz, pr, os] = await Promise.all([
    sb.from('kelas').select('id,nama,tingkat').order('nama'),
    sb.from('siswa').select('id,nama,kelas_id,status'),
    sb.from('tugas').select('id,judul,jenis,kelas_id,deadline,created_at,kelas(nama),mapel(nama)').order('created_at', { ascending: false }),
    ambil(() => sb.from('pengumpulan_tugas').select('id,tugas_id,siswa_id,terlambat,status').order('id')),
    sb.from('mapel').select('id,nama,kkm'),
    sb.from('pengampu').select('guru_id,kelas_id'),
    sb.from('jadwal').select('hari,jam_mulai,jam_selesai,pengampu(guru_id,kelas_id,mapel(nama),kelas(nama))'),
    sb.from('v_direktori').select('id,role'),
    ambil(() => sb.from('absensi').select('id,siswa_id,tanggal,status,sumber,terverifikasi').gte('tanggal', dari).order('id')),
    ta ? ambil(() => sb.from('nilai').select('id,siswa_id,mapel_id,jenis,nilai').eq('tahun_ajaran_id', ta.id).order('id')) : Promise.resolve([]),
    sb.from('izin').select('id').eq('status', 'menunggu'),
    adm ? sb.from('profiles').select('id,role') : kosong,
    adm ? sb.from('ortu_siswa').select('siswa_id') : kosong
  ]);
  let kids = new Set(kl.data.map(x => x.id));
  if (guru) { const m = new Set(pp.data.filter(x => x.guru_id === me.id).map(x => x.kelas_id)); if (m.size) kids = m; }
  const sis = sw.data.filter(x => (x.status || 'aktif') === 'aktif' && kids.has(x.kelas_id)), sid = new Set(sis.map(x => x.id));
  const kn = Object.fromEntries(kl.data.map(x => [x.id, x.nama]));
  const abV = ab.filter(x => sid.has(x.siswa_id) && x.terverifikasi !== false);
  const pct = r => r.length ? Math.round(r.filter(x => x.status === 'hadir').length / r.length * 100) : null;
  const hr = abV.filter(x => x.tanggal === hari), pctHari = pct(hr);
  const tujuh = Array.from({ length: 7 }, (_, i) => new Date(Date.now() - (6 - i) * 864e5).toLocaleDateString('sv-SE')).map(t => ({ t, p: pct(abV.filter(x => x.tanggal === t)) }));
  const perKelas = [...kids].map(id => { const s = sis.filter(x => x.kelas_id === id), ids = new Set(s.map(x => x.id)), r = hr.filter(x => ids.has(x.siswa_id)); return { id, n: s.length, rec: r.length, p: pct(r) }; }).filter(x => x.n).sort((a, b) => String(kn[a.id]).localeCompare(String(kn[b.id])));
  const tgs = tg.data.filter(x => kids.has(x.kelas_id)).slice(0, 5).map(x => { const s = sis.filter(y => y.kelas_id === x.kelas_id), ids = new Set(s.map(y => y.id)), p = pg.filter(y => y.tugas_id === x.id && ids.has(y.siswa_id)); return { x, n: s.length, k: p.length, t: p.filter(y => y.terlambat).length }; });
  const grp = {}, kk = Object.fromEntries(mp.data.map(x => [x.id, x])), perMapel = {}, bawah = {};
  nl.filter(x => sid.has(x.siswa_id)).forEach(x => ((grp[x.siswa_id] ??= {})[x.mapel_id] ??= []).push(x));
  Object.entries(grp).forEach(([s, m]) => Object.entries(m).forEach(([mid, list]) => {
    const a = hitungAkhir(list, BOBOT).akhir;
    if (a == null || !kk[mid]) return;
    (perMapel[mid] ??= []).push(a);
    if (a < kk[mid].kkm) bawah[s] = (bawah[s] || 0) + 1;
  }));
  const mapelRows = Object.entries(perMapel).map(([mid, a]) => ({ m: kk[mid], n: a.length, avg: a.reduce((u, w) => u + w, 0) / a.length, belum: a.filter(v => v < kk[mid].kkm).length })).sort((a, b) => a.m.nama.localeCompare(b.m.nama));
  const per = {};
  abV.forEach(x => { const q = per[x.siswa_id] ??= { t: 0, h: 0, a: 0 }; q.t++; if (x.status === 'hadir') q.h++; if (x.status === 'alpa') q.a++; });
  const perhatian = sis.map(s => {
    const q = per[s.id] || { t: 0, h: 0, a: 0 }, alasan = [];
    if (q.t >= 5 && q.h / q.t < 0.8) alasan.push(`Hadir ${Math.round(q.h / q.t * 100)}%`);
    if (q.a >= 3) alasan.push(`Alpa ${q.a} kali`);
    if ((bawah[s.id] || 0) >= 2) alasan.push(`${bawah[s.id]} mapel di bawah KKM`);
    return { s, alasan };
  }).filter(x => x.alasan.length).sort((a, b) => b.alasan.length - a.alasan.length).slice(0, 8);
  const vf = ab.filter(x => sid.has(x.siswa_id) && x.sumber === 'mandiri' && x.terverifikasi === false).length;
  const jawab = pg.filter(x => x.status === 'menunggu' && sid.has(x.siswa_id)).length, izn = iz.data.length;
  const jh = guru ? jd.data.filter(x => x.pengampu?.guru_id === me.id && x.hari === hariIni).sort((a, b) => a.jam_mulai.localeCompare(b.jam_mulai)) : [];
  const call = (n, t, b, k) => `<div class="call"><span><b>${n}</b> ${t}</span><button class="btn sm" onclick="go('${k}')">${b}</button></div>`;
  const stat = (n, t) => `<div class="stat"><span class="num">${n}</span><small>${t}</small></div>`;
  let langkah = '';
  if (adm) {
    const L = [['Atur tahun ajaran dan semester', 'Isi tanggal mulai dan selesai, lalu aktifkan semester yang berjalan.', ta ? 1 : 0, 'data'], ['Buat kelas', 'Contoh: 7A, 7B.', kl.data.length, 'data'], ['Tambah mata pelajaran', 'Nama mapel dan KKM.', mp.data.length, 'data'], ['Buat akun guru', 'Guru masuk dengan email.', dr.data.filter(x => x.role === 'guru').length, 'akun'], ['Masukkan data siswa', 'Satu per satu, atau impor dari Excel.', sw.data.length, 'siswa'], ['Buat akun siswa', 'Siswa masuk dengan NIS.', pr.data.filter(x => x.role === 'siswa').length, 'akun'], ['Hubungkan orang tua dengan anak', 'Agar orang tua hanya melihat data anaknya.', os.data.length, 'siswa']];
    if (L.some(x => !x[2])) langkah = `<div class="sec"><h2>Persiapan sekolah</h2><p class="hint">${L.filter(x => x[2]).length} dari ${L.length} langkah selesai. Ikuti urutannya.</p>${L.map((x, i) => `<div class="step"><span class="n">${i + 1}</span><div class="b"><b>${x[0]}</b><small>${x[1]}</small></div>${x[2] ? '<span class="stamp ok">Selesai</span>' : `<button class="btn alt sm" onclick="go('${x[3]}')">Mulai</button>`}</div>`).join('')}</div>`;
  }
  const stats = adm ? stat(sis.length, 'Siswa aktif') + stat(dr.data.filter(x => x.role === 'guru').length, 'Guru') + stat(kl.data.length, 'Kelas') + stat(pctHari == null ? '-' : pctHari + '%', 'Hadir hari ini')
    : stat(sis.length, 'Siswa') + stat(kids.size, 'Kelas') + stat(pctHari == null ? '-' : pctHari + '%', 'Hadir hari ini');
  const tgl7 = t => new Date(t + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'short' });
  $('#main').innerHTML = head('Beranda', adm ? 'Dasbor sekolah' : 'Dasbor guru', `${new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}${ta ? ` - Semester ${ta.semester} ${h(ta.nama)}` : ''}`) +
    (guru ? `<div class="call"><span>Nilai formatif, sumatif, dan raport Kurikulum Merdeka</span><button class="btn sm" onclick="go('km')">Buka</button></div><div class="call"><span>Data diri siswa dan orang tua per kelas</span><button class="btn sm" onclick="go('datakelas')">Buka</button></div>` : '') +
    (adm && !ta ? call('Belum ada semester aktif.', 'Nilai belum bisa diinput.', 'Atur', 'data') : '') +
    (vf ? call(vf + ' absen mandiri', 'menunggu verifikasi', 'Verifikasi', 'absen') : '') +
    (izn ? call(izn + ' pengajuan izin', 'menunggu keputusan', 'Buka', 'izin') : '') +
    (jawab ? call(jawab + ' jawaban tugas', 'menunggu diperiksa', 'Periksa', 'tugas') : '') +
    langkah + `<div class="stats" style="margin-bottom:16px">${stats}</div>` +
    (guru ? `<div class="sec"><h2>Jadwal mengajar hari ini</h2>${jh.map(x => { const k = perKelas.find(y => y.id === x.pengampu?.kelas_id), sudah = k && k.rec > 0; return `<div class="row"><span><b>${h(x.pengampu?.mapel?.nama)}</b><br><small>${h(x.pengampu?.kelas?.nama)} - ${x.jam_mulai.slice(0, 5)} sampai ${x.jam_selesai.slice(0, 5)}</small></span>${sudah ? '<span class="stamp ok">Sudah diabsen</span>' : '<button class="btn alt sm" onclick="go(\'absen\')">Absen</button>'}</div>`; }).join('') || '<p class="mut" style="margin:0">Tidak ada jadwal mengajar hari ini.</p>'}</div>` : '') +
    `<div class="sec"><h2>Kehadiran 7 hari terakhir</h2><div class="grafik">${tujuh.map(x => `<div><b>${x.p == null ? '-' : x.p + '%'}</b><i style="height:${x.p == null ? 2 : Math.round(x.p * 0.7)}px${x.p != null && x.p < 80 ? ';background:var(--warn)' : ''}"></i><small>${tgl7(x.t)}</small></div>`).join('')}</div>
    <h3 class="sub">Per kelas hari ini</h3>${perKelas.map(k => `<div style="padding:6px 0"><div class="row" style="border:0;padding:0"><span>${h(kn[k.id])}</span><small>${k.rec ? `${k.p}% hadir (${k.rec} dari ${k.n})` : 'Belum diabsen'}</small></div>${bar(k.p || 0, k.p != null && k.p < 80 ? 'var(--warn)' : 'var(--g)')}</div>`).join('') || '<p class="mut" style="margin:0">Belum ada kelas.</p>'}</div>` +
    `<div class="sec"><h2>PR dan tugas terbaru</h2>${tgs.map(({ x, n, k, t }) => `<div style="padding:8px 0;border-bottom:1px solid var(--line)"><div class="row" style="border:0;padding:0"><span>${x.jenis === 'pr' ? '<span class="stamp no">PR</span> ' : ''}${h(x.judul)}<br><small>${h(x.kelas?.nama)} - ${h(x.mapel?.nama)}${x.deadline ? ' - batas ' + tgl(x.deadline) : ''}</small></span><small style="text-align:right">${k} dari ${n}${t ? `<br>${t} terlambat` : ''}</small></div>${bar(n ? k / n * 100 : 0)}</div>`).join('') || '<p class="mut" style="margin:0">Belum ada PR atau tugas.</p>'}</div>` +
    `<div class="sec"><h2>Nilai akhir per mapel</h2><p class="hint">Rata-rata nilai akhir berbobot semester ini. Garis merah artinya di bawah KKM.</p>${mapelRows.map(r => `<div style="padding:6px 0"><div class="row" style="border:0;padding:0"><span>${h(r.m.nama)}</span><small>${fmt(r.avg)}${r.belum ? ` - ${r.belum} dari ${r.n} siswa belum tuntas` : ''}</small></div>${bar(r.avg, r.avg < r.m.kkm ? 'var(--bad)' : 'var(--ok)')}</div>`).join('') || '<p class="mut" style="margin:0">Belum ada nilai pada semester ini.</p>'}</div>` +
    `<div class="sec"><h2>Siswa yang perlu perhatian</h2><p class="hint">Kehadiran di bawah 80%, alpa 3 kali atau lebih, atau dua mapel di bawah KKM.</p>${perhatian.map(x => `<div class="row"><span>${h(x.s.nama)}<br><small>${h(kn[x.s.kelas_id] || '-')}</small></span><span style="text-align:right">${x.alasan.map(a => `<span class="stamp warn">${a}</span>`).join(' ')}</span></div>`).join('') || '<p class="mut" style="margin:0">Tidak ada. Semua siswa dalam kondisi baik.</p>'}</div>`;
}
const hAdmin = () => dasbor(false);

/* ===== BERANDA GURU ===== */
const hGuru = () => dasbor(true);

/* ===== ADMIN: akun ===== */
const ALFABET = 'abcdefghjkmnpqrstuvwxyz23456789';
let AKUN = [], KRED = [];
function bikinSandi(n = 8) { const a = new Uint32Array(n); crypto.getRandomValues(a); return [...a].map(x => ALFABET[x % ALFABET.length]).join(''); }
const idTampil = e => String(e || '').endsWith('@' + NIS_DOMAIN) ? e.split('@')[0] : (e || '-');
async function pesanFn(error) { try { const b = await error.context.json(); return b.error || error.message; } catch { return (error && error.message) || 'Gagal menghubungi server'; } }
async function panggilAkun(body) {
  const { data, error } = await sb.functions.invoke(EDGE_AKUN, { body });
  if (error) throw new Error(await pesanFn(error));
  if (data && data.error) throw new Error(data.error);
  return data;
}
async function vAkun() {
  const [ps, sw, ud] = await Promise.all([sb.from('profiles').select('id,nama,role,email,is_bk').order('nama'), sb.from('siswa').select('id,nis,nama,kelas(nama),profile_id').order('nama'), sb.from('undangan_staf').select('*').order('created_at', { ascending: false })]);
  AKUN = ps.data;
  const tanpa = sw.data.filter(x => !x.profile_id && x.nis);
  $('#main').innerHTML = head('Admin', 'Akun pengguna', 'Siswa masuk dengan NIS, guru dan admin dengan email. Kata sandi dibuat acak dan hanya tampil sekali, jadi simpan atau cetak daftarnya.') +
    `<div id="hs"></div>
    <div class="sec noprint"><h2>Akun siswa</h2><p class="hint">${tanpa.length ? `${tanpa.length} siswa belum punya akun.` : 'Semua siswa sudah punya akun.'} Akun dibuat dari NIS di menu Siswa.</p>
    <button class="btn" onclick="buatAkunSiswa()" ${tanpa.length ? '' : 'disabled'}>Buat akun untuk ${tanpa.length} siswa</button></div>
    <div class="sec noprint"><h2>Undang guru, kepala sekolah, TU, atau admin</h2><p class="hint">Staf mengaktifkan akunnya sendiri. Kode verifikasi dikirim ke email mereka, jadi hanya pemilik email yang bisa membuat akun dan kata sandinya.</p>
    <label>Nama lengkap</label><input id="un1"><label>Email</label><input id="ue1" type="email" autocapitalize="none" spellcheck="false">
    <label>Peran</label><select id="ur1"><option value="guru">Guru</option><option value="kepsek">Kepala sekolah</option><option value="tu">Tata usaha (TU)</option><option value="admin">Admin sekolah</option></select>
    <button class="btn" onclick="undangStaf()">Buat undangan</button>
    ${ud.data.length ? `<h3 class="sub">Undangan</h3>${ud.data.map(x => `<div class="row"><span><b>${h(x.nama)}</b><br><small>${h(x.email)} - ${ROLE_LABEL[x.role]}</small></span><span style="display:flex;gap:6px;align-items:center">${x.dipakai_pada ? '<span class="stamp ok">Aktif</span>' : `<button class="btn alt sm" onclick="kirimKodeStaf('${h(x.email)}')">Kirim kode</button><button class="btn alt sm" onclick="hapusUndangan(${x.id})">Hapus</button>`}</span></div>`).join('')}` : ''}</div>
    <div class="sec noprint"><h2>Akun orang tua</h2><p class="hint">Orang tua boleh memakai email atau nama pengguna bebas, misalnya ortu2401. Kata sandi dibuat otomatis jika dikosongkan.</p>
    <label>Nama lengkap</label><input id="an"><label>Email atau nama pengguna</label><input id="ae" autocapitalize="none" spellcheck="false">
    <label>Kata sandi (minimal 6 karakter, kosongkan agar dibuat otomatis)</label><input id="ap" autocomplete="off">
    <button class="btn" onclick="buatAkun()">Buat akun orang tua</button></div>
    <div class="sec noprint"><h2>Semua akun (<span id="ja">0</span>)</h2>
    <div style="display:flex;gap:8px;margin-top:8px"><input id="cari" placeholder="Cari nama atau NIS" oninput="filterAkun()"><select id="fr" style="width:auto" onchange="filterAkun()"><option value="">Semua</option>${ROLES.map(r => `<option value="${r}">${ROLE_LABEL[r]}</option>`).join('')}</select></div><div id="la"></div></div>`;
  filterAkun();
}
function filterAkun() {
  const q = ($('#cari').value || '').toLowerCase(), r = $('#fr').value;
  const l = AKUN.filter(x => (!r || x.role === r) && (!q || (x.nama || '').toLowerCase().includes(q) || (x.email || '').toLowerCase().includes(q)));
  $('#ja').textContent = l.length;
  $('#la').innerHTML = l.slice(0, 100).map(x => `<div class="row"><span><b>${h(x.nama)}</b><br><small>Masuk dengan: ${h(idTampil(x.email))}</small></span>
  <span style="display:flex;gap:6px;align-items:center"><select style="width:auto" onchange="ubahPeran('${x.id}',this.value)">${ROLES.map(rl => `<option value="${rl}" ${rl === x.role ? 'selected' : ''}>${ROLE_LABEL[rl]}</option>`).join('')}</select><button class="btn alt sm" onclick="resetSandi('${x.id}')">Reset sandi</button></span></div>${x.role === 'guru' ? `<label style="display:flex;gap:8px;align-items:center;font-weight:500;margin:0 0 8px"><input type="checkbox" style="width:auto" ${x.is_bk ? 'checked' : ''} onchange="ubahBk('${x.id}',this.checked)"> Guru BK (boleh membuka catatan bimbingan konseling)</label>` : ''}`).join('') +
    (l.length > 100 ? `<p class="hint" style="margin-top:8px">Menampilkan 100 dari ${l.length}. Persempit pencarian.</p>` : '') + (l.length ? '' : '<p class="mut" style="margin:8px 0 0">Tidak ada akun yang cocok.</p>');
}
function tampilKredensial(baris, judul) {
  KRED = baris;
  $('#hs').innerHTML = `<div class="sec"><h2>${judul}</h2><p class="hint">Kata sandi hanya tampil sekarang. Simpan atau bagikan sebelum menutup halaman ini.</p>
  <div style="overflow-x:auto"><table class="tb"><tr><th>Nama</th><th>Masuk dengan</th><th>Kata sandi</th></tr>${baris.map(b => `<tr><td>${h(b[0])}</td><td>${h(b[1])}</td><td><b>${h(b[2])}</b></td></tr>`).join('')}</table></div>
  <div class="noprint" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" style="margin-top:10px" onclick="unduhKredensial()">Unduh CSV</button><button class="btn alt sm" style="margin-top:10px" onclick="window.print()">Cetak</button></div></div>`;
  $('#hs').scrollIntoView();
}
function unduhKredensial() {
  const isi = ['Nama;Masuk dengan;Kata sandi', ...KRED.map(b => b.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';'))].join('\r\n');
  simpanBerkas(new Blob(['\ufeff' + isi], { type: 'text/csv' }), `akun-baru-${new Date().toLocaleDateString('sv-SE')}.csv`);
}
async function buatAkun() {
  const nama = $('#an').value.trim(), id = $('#ae').value.trim(), role = 'ortu';
  let sandi = $('#ap').value;
  if (!sandi) sandi = bikinSandi();
  if (!nama || !id || sandi.length < 6) return toast('Lengkapi nama, email atau nama pengguna, dan kata sandi (minimal 6 karakter)', 1);
  try {
    const r = await panggilAkun({ aksi: 'buat', akun: [{ email: idKeEmail(id), password: sandi, nama, role }] });
    if (!r.hasil[0].ok) return toast(r.hasil[0].pesan, 1);
    await vAkun();
    tampilKredensial([[nama, idTampil(idKeEmail(id)), sandi]], 'Akun dibuat');
  } catch (e) { toast(e.message, 1); }
}
async function buatAkunSiswa() {
  const { data: sw } = await sb.from('siswa').select('id,nis,nama,kelas(nama),profile_id');
  const todo = sw.filter(x => !x.profile_id && x.nis);
  if (!todo.length) return toast('Semua siswa sudah punya akun', 1);
  if (!confirm(`Buat akun untuk ${todo.length} siswa? Kata sandi dibuat acak.`)) return;
  const hasil = [], gagal = [];
  for (let i = 0; i < todo.length; i += 15) {
    const potong = todo.slice(i, i + 15).map(x => ({ x, a: { email: idKeEmail(x.nis), password: bikinSandi(), nama: x.nama, role: 'siswa', siswa_id: x.id } }));
    toast(`Membuat akun ${Math.min(i + 15, todo.length)} dari ${todo.length}...`);
    try {
      const r = await panggilAkun({ aksi: 'buat', akun: potong.map(y => y.a) });
      r.hasil.forEach((y, j) => y.ok ? hasil.push([potong[j].x.nama + (potong[j].x.kelas?.nama ? ' (' + potong[j].x.kelas.nama + ')' : ''), potong[j].x.nis, potong[j].a.password]) : gagal.push(`${potong[j].x.nama}: ${y.pesan}`));
    } catch (e) { return toast(e.message, 1); }
  }
  await vAkun();
  tampilKredensial(hasil, `${hasil.length} akun siswa dibuat`);
  if (gagal.length) $('#hs').innerHTML += `<div class="sec"><h2>Gagal (${gagal.length})</h2>${gagal.map(g => `<div class="row">${h(g)}</div>`).join('')}</div>`;
}
async function resetSandi(id) {
  const a = AKUN.find(x => x.id === id);
  if (!a) return;
  if (!confirm(`Buat kata sandi baru untuk ${a.nama}? Kata sandi lama tidak berlaku lagi.`)) return;
  const sandi = bikinSandi();
  try { await panggilAkun({ aksi: 'reset', user_id: id, password: sandi }); tampilKredensial([[a.nama, idTampil(a.email), sandi]], 'Kata sandi baru'); }
  catch (e) { toast(e.message, 1); }
}
function vSandi() {
  $('#main').innerHTML = head('Akun', 'Ubah kata sandi', 'Pilih kata sandi yang mudah kamu ingat tapi sulit ditebak. Minimal 6 karakter.') +
    `<div class="sec"><label style="margin-top:0">Kata sandi baru</label><input id="s1" type="password" autocomplete="new-password">
    <label>Ulangi kata sandi baru</label><input id="s2" type="password" autocomplete="new-password"><button class="btn" onclick="simpanSandi()">Simpan</button></div>`;
}
async function simpanSandi() {
  const a = $('#s1').value, b = $('#s2').value;
  if (a.length < 6) return toast('Minimal 6 karakter', 1);
  if (a !== b) return toast('Kedua kata sandi tidak sama', 1);
  const { error } = await sb.auth.updateUser({ password: a });
  if (error) return toast(error.message, 1);
  toast('Kata sandi diubah'); $('#s1').value = ''; $('#s2').value = '';
}
async function ubahBk(id, v) {
  const { error } = await sb.from('profiles').update({ is_bk: v }).eq('id', id);
  const a = AKUN.find(x => x.id === id); if (a && !error) a.is_bk = v;
  toast(error ? error.message : v ? 'Ditetapkan sebagai guru BK' : 'Akses BK dicabut', !!error);
}
async function ubahPeran(id, role) {
  const { error } = await sb.from('profiles').update({ role }).eq('id', id);
  toast(error ? error.message : 'Peran diubah', !!error);
}

/* ===== ADMIN: kelas & mapel ===== */
async function vData() {
  const [k, m, ta, ek] = await Promise.all([sb.from('kelas').select('*').order('nama'), sb.from('mapel').select('*').order('nama'), sb.from('tahun_ajaran').select('*').order('id'), sb.from('ekskul').select('*').order('nama')]);
  await muatBobot();
  $('#main').innerHTML = head('Admin', 'Tahun ajaran, kelas, dan mapel', 'Data dasar yang dipakai di semua fitur. Isi dulu sebelum menambah siswa dan nilai.') +
    `<div class="sec"><h2>Tahun ajaran dan semester</h2><p class="hint">Nilai yang diinput guru otomatis masuk ke semester yang aktif. Raport dan peringkat dihitung per semester.</p>
    ${ta.data.map(x => `<div class="row"><span>Semester ${x.semester} ${h(x.nama)}<br><small>${h(x.mulai || '-')} s.d. ${h(x.selesai || '-')}</small></span>${x.aktif ? '<span class="stamp ok">Aktif</span>' : `<button class="btn alt sm" onclick="aktifkan(${x.id})">Aktifkan</button>`}</div>`).join('') || '<p class="mut">Belum ada semester. Tambahkan di bawah.</p>'}
    <label>Tahun ajaran</label><input id="pa" placeholder="Contoh: 2026/2027">
    <label>Semester</label><select id="ps"><option value="1">Semester 1 (ganjil)</option><option value="2">Semester 2 (genap)</option></select>
    <label>Tanggal mulai</label><input id="pm" type="date"><label>Tanggal selesai</label><input id="pe" type="date">
    <button class="btn" onclick="addPeriode()">Tambah semester</button></div>
    <div class="sec"><h2>Bobot nilai akhir</h2><p class="hint">Nilai akhir tiap mapel = rata-rata tiap komponen dikali bobotnya. Jumlah bobot harus 100. Komponen yang belum ada nilainya dilewati dan bobotnya dibagi ulang.</p>
    ${Object.keys(KOMP).map(k2 => `<label>${KOMP[k2]}</label><input id="bb${k2}" type="number" min="0" max="100" value="${BOBOT[k2]}">`).join('')}
    <button class="btn" onclick="simpanBobot()">Simpan bobot</button></div>
    <div class="sec"><h2>Kelas</h2><p class="hint">Awali nama dengan angka tingkat, misalnya 7A dan 7B. Kelas dengan angka yang sama dianggap paralel untuk peringkat angkatan.</p>
    <div style="display:flex;gap:8px;margin:8px 0"><input id="kn" placeholder="Contoh: 7A"><button class="btn sm" onclick="addKelas()">Tambah</button></div>
    ${k.data.map(x => `<div class="row"><span>${h(x.nama)}</span><small>Tingkat ${x.tingkat ?? '-'}</small></div>`).join('') || '<p class="mut">Belum ada kelas.</p>'}</div>
    <div class="sec"><h2>Mata pelajaran</h2><p class="hint">KKM adalah nilai minimal agar dianggap tuntas.</p>
    <div style="display:flex;gap:8px;margin:8px 0"><input id="mn" placeholder="Nama mapel"><input id="mk" type="number" value="75" style="width:84px" aria-label="KKM"><button class="btn sm" onclick="addMapel()">Tambah</button></div>
    ${m.data.map(x => `<div class="row"><span>${h(x.nama)}</span><span class="mut">KKM ${x.kkm}</span></div>`).join('') || '<p class="mut">Belum ada mapel.</p>'}</div>
    <div class="sec"><h2>Ekstrakurikuler</h2><p class="hint">Daftar kegiatan yang bisa dinilai guru di raport, misalnya Pramuka atau Futsal.</p>
    <div style="display:flex;gap:8px;margin:8px 0"><input id="en" placeholder="Nama ekstrakurikuler"><button class="btn sm" onclick="addEkskul()">Tambah</button></div>
    ${ek.data.map(x => `<div class="row">${h(x.nama)}</div>`).join('') || '<p class="mut">Belum ada ekstrakurikuler.</p>'}</div>`;
}
function addKelas() { const n = $('#kn').value.trim(); n ? tambah('kelas', { nama: n, tingkat: tingkatDari(n) }, 'Kelas ditambahkan') : toast('Isi nama kelas dulu', 1); }
function addEkskul() { const n = $('#en').value.trim(); n ? tambah('ekskul', { nama: n }, 'Ekstrakurikuler ditambahkan') : toast('Isi nama ekstrakurikuler dulu', 1); }
function addMapel() { const n = $('#mn').value.trim(); n ? tambah('mapel', { nama: n, kkm: +$('#mk').value || 75 }, 'Mapel ditambahkan') : toast('Isi nama mapel dulu', 1); }

/* ===== ADMIN: siswa & orang tua ===== */
async function vSiswa() {
  const [s, k, ps] = await Promise.all([
    sb.from('siswa').select('id,nis,nama,status,kelas(nama)').order('nama'),
    sb.from('kelas').select('*').order('nama'),
    sb.from('profiles').select('id,nama,role')
  ]);
  const akunSiswa = ps.data.filter(p => p.role === 'siswa'), ortu = ps.data.filter(p => p.role === 'ortu');
  $('#main').innerHTML = head('Admin', 'Siswa dan orang tua', 'Tambah siswa, lalu hubungkan dengan akun orang tua agar mereka bisa memantau.') +
    `<div class="sec"><h2>Tambah siswa</h2>
    <label>NIS</label><input id="sn"><label>Nama lengkap</label><input id="sm">
    <label>Kelas</label><select id="sk"><option value="">Pilih kelas</option>${opt(k.data, 'id', 'nama')}</select>
    <label>Akun login siswa (boleh dikosongkan)</label><select id="sp"><option value="">Belum ada</option>${opt(akunSiswa, 'id', 'nama')}</select>
    <button class="btn" onclick="addSiswa()">Simpan siswa</button></div>
    <div class="sec"><h2>Hubungkan orang tua dengan anak</h2><p class="hint">Buat akun orang tua dulu di menu Akun.</p>
    <label>Orang tua</label><select id="oo"><option value="">Pilih orang tua</option>${opt(ortu, 'id', 'nama')}</select>
    <label>Anak</label><select id="os"><option value="">Pilih siswa</option>${opt(s.data, 'id', 'nama')}</select>
    <button class="btn" onclick="addOrtu()">Hubungkan</button></div>
    <div class="sec"><h2>Daftar siswa (${s.data.length})</h2>${s.data.map(x => `<div class="row"><span>${h(x.nama)}<br><small>NIS ${h(x.nis)}</small></span><span class="stamp no">${h(x.kelas?.nama || (x.status && x.status !== 'aktif' ? x.status : 'Tanpa kelas'))}</span></div>`).join('') || '<p class="mut">Belum ada siswa.</p>'}</div>`;
}
function addSiswa() {
  const o = { nis: $('#sn').value.trim(), nama: $('#sm').value.trim(), kelas_id: +$('#sk').value || null, profile_id: $('#sp').value || null };
  (o.nis && o.nama) ? tambah('siswa', o, 'Siswa ditambahkan') : toast('Isi NIS dan nama dulu', 1);
}
function addOrtu() {
  const o = { ortu_id: $('#oo').value, siswa_id: +$('#os').value };
  (o.ortu_id && o.siswa_id) ? tambah('ortu_siswa', o, 'Orang tua dihubungkan') : toast('Pilih orang tua dan anak', 1);
}

/* ===== GURU: absensi ===== */
async function vAbsen() {
  const k = await sb.from('kelas').select('*').order('nama');
  $('#main').innerHTML = head('Guru', 'Absensi', 'Pilih kelas dan tanggal. Ketuk huruf pada tiap siswa, lalu simpan.') +
    `<div class="sec"><label style="margin-top:0">Kelas</label><select id="ak" onchange="muatAbsen()">${opt(k.data, 'id', 'nama')}</select>
    <label>Tanggal</label><input id="at" type="date" value="${new Date().toLocaleDateString('sv-SE')}" onchange="muatAbsen()"></div>
    <div class="sec"><h2>Absen mandiri</h2><p class="hint">Siswa mengisi sendiri dari HP memakai kode. Tampilkan kode di papan tulis, jangan kirim ke grup chat.</p>
    <div style="display:flex;gap:8px"><select id="am" style="width:auto"><option value="5">5 menit</option><option value="10" selected>10 menit</option><option value="15">15 menit</option></select><button class="btn sm" onclick="bukaAbsen()">Buka absen mandiri</button></div><div id="kb"></div></div>
    <div id="vf"></div>
    <div class="sec" id="al"></div>`;
  muatAbsen();
}
async function muatAbsen() {
  const kid = +$('#ak').value, t = $('#at').value;
  if (!kid) { $('#al').innerHTML = '<p class="mut">Belum ada kelas. Minta admin menambahkannya.</p>'; $('#vf').innerHTML = ''; return; }
  const [s, a, ss] = await Promise.all([
    sb.from('siswa').select('id,nama').eq('kelas_id', kid).order('nama'),
    sb.from('absensi').select('siswa_id,status,sumber,terverifikasi,dicatat_at').eq('tanggal', t),
    sb.from('sesi_absen').select('id').eq('kelas_id', kid).eq('tanggal', t)
  ]);
  const ada = new Set(s.data.map(x => x.id)), rec = a.data.filter(x => ada.has(x.siswa_id));
  const pend = rec.filter(x => x.terverifikasi === false), pset = new Set(pend.map(x => x.siswa_id));
  const c = Object.fromEntries(rec.map(x => [x.siswa_id, x.status]));
  const src = Object.fromEntries(rec.map(x => [x.siswa_id, x.sumber])), def = ss.data.length ? 'alpa' : 'hadir';
  const nama = Object.fromEntries(s.data.map(x => [x.id, x.nama]));
  PEND = pend.map(x => x.siswa_id);
  $('#vf').innerHTML = pend.length ? `<div class="sec"><h2>Verifikasi absen mandiri (${pend.length})</h2>
  <p class="hint">Cocokkan dengan siswa yang benar-benar ada di kelas. Jam masuk membantu mengenali absen titipan.</p>
  ${pend.map(x => `<div class="row"><span>${h(nama[x.siswa_id])}<br><small>masuk ${x.dicatat_at ? new Date(x.dicatat_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}</small></span>
  <span style="display:flex;gap:6px"><button class="btn sm" onclick="verifikasi(${x.siswa_id},true)">Hadir</button><button class="btn alt sm" onclick="verifikasi(${x.siswa_id},false)">Tidak hadir</button></span></div>`).join('')}
  <button class="btn alt sm" style="margin-top:10px" onclick="setujuiSemua()">Setujui semua</button></div>` : '';
  $('#al').innerHTML = s.data.length
    ? `<p class="hint">H hadir - I izin - S sakit - A alpa${ss.data.length ? '. Siswa yang tidak mengisi kode ditandai alpa, ubah jika izin atau sakit.' : ''}</p>` +
      s.data.map(x => `<div class="row"><span>${h(x.nama)}${src[x.id] === 'mandiri' && !pset.has(x.id) ? ' <span class="stamp ok">Mandiri</span>' : ''}</span>` +
        (pset.has(x.id) ? '<span class="stamp warn">Menunggu verifikasi</span>'
          : `<div class="chips" data-sid="${x.id}">${[['hadir', 'H'], ['izin', 'I'], ['sakit', 'S'], ['alpa', 'A']].map(([v, l]) => `<button data-v="${v}" class="${v === (c[x.id] || def) ? 'on' : ''}" onclick="pilih(this)" aria-label="${v}">${l}</button>`).join('')}</div>`) + '</div>').join('') +
      `<div style="display:flex;gap:8px;margin-top:14px"><button class="btn" style="margin:0" onclick="simpanAbsen()">Simpan absensi</button><button class="btn alt" style="margin:0" onclick="semuaHadir()">Semua hadir</button></div>`
    : '<p class="mut">Belum ada siswa di kelas ini.</p>';
}
function pilih(b) { [...b.parentElement.querySelectorAll('button')].forEach(x => x.classList.toggle('on', x === b)); }
function semuaHadir() { $$('.chips').forEach(c => pilih(c.querySelector('[data-v=hadir]'))); }
async function simpanAbsen() {
  const t = $('#at').value;
  const rows = $$('.chips').map(c => ({ siswa_id: +c.dataset.sid, tanggal: t, status: c.querySelector('.on')?.dataset.v || 'hadir', dicatat_oleh: me.id, terverifikasi: true }));
  const { error } = await sb.from('absensi').upsert(rows, { onConflict: 'siswa_id,tanggal' });
  toast(error ? error.message : 'Absensi tersimpan', !!error);
}
async function verifikasi(sid, ok) {
  const { error } = await sb.from('absensi').update({ terverifikasi: true, status: ok ? 'hadir' : 'alpa' }).eq('siswa_id', sid).eq('tanggal', $('#at').value);
  if (error) return toast(error.message, 1);
  toast(ok ? 'Dikonfirmasi hadir' : 'Ditandai tidak hadir'); muatAbsen();
}
async function setujuiSemua() {
  if (!PEND.length) return;
  const { error } = await sb.from('absensi').update({ terverifikasi: true }).in('siswa_id', PEND).eq('tanggal', $('#at').value);
  if (error) return toast(error.message, 1);
  toast('Semua absen mandiri disetujui'); muatAbsen();
}

/* ===== GURU: nilai ===== */
async function vNilai() {
  const [k, m, ta] = await Promise.all([sb.from('kelas').select('*').order('nama'), sb.from('mapel').select('*').order('nama'), periodeAktif(), muatBobot()]);
  TA = ta;
  $('#main').innerHTML = head('Guru', 'Input nilai', 'Pilih kelas, mapel, dan komponen nilai. Kosongkan kolom siswa yang belum punya nilai.') +
    (TA ? `<div class="call"><span>Nilai masuk ke <b>Semester ${TA.semester} ${h(TA.nama)}</b><br><small>Nilai akhir = ${teksBobot()}</small></span></div>` : '<div class="call"><span><b>Belum ada semester aktif.</b> Minta admin mengaktifkannya di menu Data.</span></div>') +
    `<div class="sec"><label style="margin-top:0">Kelas</label><select id="nk" onchange="muatNilai()">${opt(k.data, 'id', 'nama')}</select>
    <label>Mata pelajaran</label><select id="nm">${opt(m.data, 'id', 'nama')}</select>
    <label>Komponen nilai</label><select id="nj">${Object.entries(KOMP).map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></div>
    <div class="sec" id="nl"></div>
    <div class="sec"><h2>Unggah dari Excel atau CSV</h2><p class="hint">Memakai kelas, mapel, dan komponen yang dipilih di atas. Kolom: NIS dan Nilai. Nilai ditambahkan, tidak menimpa nilai yang sudah ada.</p>
    <button class="btn alt sm" onclick="unduhFormatNilai()">Unduh format kelas ini</button>
    <label>File Excel atau CSV</label><input id="nxf" type="file" accept=".xlsx,.xls,.csv,text/csv" onchange="pilihFileNilai()"><div id="nxh"></div></div>`;
  muatNilai();
}
async function muatNilai() {
  const kid = +$('#nk').value;
  if (!kid) { $('#nl').innerHTML = '<p class="mut">Belum ada kelas. Minta admin menambahkannya.</p>'; return; }
  const s = await sb.from('siswa').select('id,nama').eq('kelas_id', kid).order('nama');
  $('#nl').innerHTML = s.data.length
    ? s.data.map(x => `<div class="row"><span>${h(x.nama)}</span><input class="nv" data-sid="${x.id}" type="number" min="0" max="100" inputmode="decimal" placeholder="0-100" style="width:90px"></div>`).join('') + '<button class="btn" onclick="simpanNilai()">Simpan nilai</button>'
    : '<p class="mut">Belum ada siswa di kelas ini.</p>';
}
async function simpanNilai() {
  const mid = +$('#nm').value;
  if (!TA) return toast('Belum ada semester aktif. Minta admin mengaktifkannya.', 1);
  const rows = $$('.nv').filter(e => e.value !== '').map(e => ({ siswa_id: +e.dataset.sid, mapel_id: mid, jenis: $('#nj').value, nilai: +e.value, tahun_ajaran_id: TA.id }));
  if (!mid || !rows.length) return toast('Pilih mapel dan isi minimal satu nilai', 1);
  const { error } = await sb.from('nilai').insert(rows);
  if (error) return toast(error.message, 1);
  toast(rows.length + ' nilai tersimpan'); $$('.nv').forEach(e => e.value = '');
}

/* ===== GURU: tugas ===== */
async function vTugas() {
  const [k, m, t, pg, sw] = await Promise.all([
    sb.from('kelas').select('*').order('nama'), sb.from('mapel').select('*').order('nama'),
    sb.from('tugas').select('id,judul,jenis,deadline,kelas_id,kelas(nama),mapel(nama)').order('created_at', { ascending: false }),
    sb.from('pengumpulan_tugas').select('tugas_id,status,terlambat'),
    sb.from('siswa').select('id,kelas_id')
  ]);
  const tunggu = {}, kumpul = {}, telat = {}, total = {};
  sw.data.forEach(x => total[x.kelas_id] = (total[x.kelas_id] || 0) + 1);
  pg.data.forEach(x => {
    kumpul[x.tugas_id] = (kumpul[x.tugas_id] || 0) + 1;
    if (x.status === 'menunggu') tunggu[x.tugas_id] = (tunggu[x.tugas_id] || 0) + 1;
    if (x.terlambat) telat[x.tugas_id] = (telat[x.tugas_id] || 0) + 1;
  });
  $('#main').innerHTML = head('Guru', 'PR dan tugas', 'Kirim soal (teks atau foto) ke satu kelas. Siswa langsung mendapat notifikasi, dan Anda diberi tahu saat jawaban masuk.') +
    `<div class="sec"><h2>Daftar</h2>${t.data.map(x => `<div class="row"><span>${x.jenis === 'pr' ? '<span class="stamp no">PR</span> ' : ''}${h(x.judul)}<br><small>${h(x.kelas?.nama)} - ${h(x.mapel?.nama)}${x.deadline ? ' - batas ' + tgl(x.deadline) : ''}</small><br><small>${kumpul[x.id] || 0} dari ${total[x.kelas_id] || 0} sudah mengumpulkan${telat[x.id] ? `, ${telat[x.id]} terlambat` : ''}</small></span>
    <span style="text-align:right">${tunggu[x.id] ? `<span class="stamp warn">${tunggu[x.id]} menunggu</span><br>` : ''}<button class="btn alt sm" style="margin-top:4px" onclick="bukaTugas(${x.id})">Lihat jawaban</button></span></div>`).join('') || '<p class="mut">Belum ada PR atau tugas. Kirim yang pertama di bawah.</p>'}</div>
    <div id="tn"></div>
    <div class="sec"><h2>Kirim baru</h2>
    <label>Jenis</label><select id="tjn"><option value="pr">PR (dikerjakan di rumah)</option><option value="tugas">Tugas</option></select>
    <label>Kelas</label><select id="tk">${opt(k.data, 'id', 'nama')}</select>
    <label>Mata pelajaran</label><select id="tm">${opt(m.data, 'id', 'nama')}</select>
    <label>Judul</label><input id="tj">
    <label>Soal atau petunjuk</label><textarea id="td" rows="3" placeholder="Tulis soal, atau cukup lampirkan foto soal"></textarea>
    <label>Foto soal (boleh kosong)</label><input id="tf" type="file" accept="image/*">
    <label>Batas waktu pengumpulan (boleh kosong)</label><input id="tl" type="datetime-local"><p class="hint" style="margin:4px 0 0">Siswa yang belum mengumpulkan diingatkan otomatis 24 jam sebelum batas.</p>
    <label style="display:flex;gap:8px;align-items:center;font-weight:500"><input type="checkbox" id="tt" checked style="width:auto"> Tetap terima jawaban setelah batas waktu (ditandai terlambat)</label>
    <button class="btn" onclick="addTugas()">Kirim ke siswa</button></div>`;
}
async function addTugas() {
  const l = $('#tl').value, ada = $('#tf').files?.[0];
  const o = { jenis: $('#tjn').value || 'pr', kelas_id: +$('#tk').value, mapel_id: +$('#tm').value, judul: $('#tj').value.trim(), deskripsi: $('#td').value.trim(), deadline: l ? new Date(l).toISOString() : null, terima_terlambat: !!$('#tt').checked };
  if (!(o.kelas_id && o.mapel_id && o.judul)) return toast('Pilih kelas, mapel, dan isi judul', 1);
  if (!o.deskripsi && !ada) return toast('Tulis soal atau lampirkan foto soal', 1);
  try { if (ada) { toast('Mengunggah foto...'); o.foto_path = await unggahFoto('#tf', 'soal'); } }
  catch (e) { return toast(e.message || 'Foto gagal diunggah', 1); }
  tambah('tugas', o, 'Terkirim. Siswa sudah diberi tahu.');
}
async function bukaTugas(id) {
  curTugas = id;
  const [r, tg] = await Promise.all([
    sb.from('pengumpulan_tugas').select('id,siswa_id,jawaban,foto_path,status,nilai,feedback,dikumpulkan_at,terlambat,siswa(nama)').eq('tugas_id', id),
    sb.from('tugas').select('kelas_id,deadline').eq('id', id).single()
  ]);
  const sw = await sb.from('siswa').select('id,nama').eq('kelas_id', tg.data.kelas_id).order('nama');
  const data = r.data, sudah = new Set(data.map(x => x.siswa_id)), belum = sw.data.filter(x => !sudah.has(x.id));
  const ST = { menunggu: '<span class="stamp warn">Perlu diperiksa</span>', benar: '<span class="stamp ok">Benar</span>', perlu_perbaikan: '<span class="stamp no">Diminta perbaiki</span>' };
  $('#tn').innerHTML = `<div class="sec"><h2>Jawaban siswa (${data.length})</h2>
  <p class="hint">${belum.length ? `Belum mengumpulkan (${belum.length}): ${belum.map(x => h(x.nama)).join(', ')}` : 'Semua siswa sudah mengumpulkan.'}</p>
  <p class="hint">Periksa jawaban, isi nilai dan catatan, lalu pilih Benar atau Minta perbaiki. Siswa langsung diberi tahu.</p>
  ${data.map(p => `<div style="padding:12px 0;border-bottom:1px solid var(--line)"><b>${h(p.siswa?.nama)}</b> ${ST[p.status] || ''}<br>
  <small>Dikumpulkan ${p.dikumpulkan_at ? tgl(p.dikumpulkan_at) : '-'}</small> ${p.terlambat ? '<span class="stamp bad">Terlambat</span>' : '<span class="stamp ok">Tepat waktu</span>'}
  ${p.jawaban ? `<p style="margin:6px 0 0">${h(p.jawaban)}</p>` : ''}${p.foto_path ? `<img class="foto" data-p="${h(p.foto_path)}" alt="Foto jawaban" onclick="window.open(this.src)">` : ''}
  <div style="display:flex;gap:6px;margin-top:8px"><input id="pn${p.id}" type="number" min="0" max="100" placeholder="Nilai" value="${p.nilai ?? ''}" style="width:80px"><input id="pf${p.id}" placeholder="Catatan untuk siswa" value="${h(p.feedback || '')}"></div>
  <div style="display:flex;gap:8px;margin-top:8px"><button class="btn sm" onclick="periksa(${p.id},'benar')">Benar</button><button class="btn alt sm" onclick="periksa(${p.id},'perlu_perbaikan')">Minta perbaiki</button></div></div>`).join('') || '<p class="mut">Belum ada yang mengumpulkan.</p>'}</div>`;
  muatFoto(); $('#tn').scrollIntoView();
}
async function periksa(id, status) {
  const v = $('#pn' + id).value;
  const { error } = await sb.from('pengumpulan_tugas').update({ status, nilai: v === '' ? null : +v, feedback: $('#pf' + id).value.trim() || null }).eq('id', id);
  if (error) return toast(error.message, 1);
  toast(status === 'benar' ? 'Ditandai benar. Siswa diberi tahu.' : 'Siswa diminta memperbaiki.'); bukaTugas(curTugas);
}

/* ===== GURU: raport ===== */
async function vRaport() {
  const [k, ta] = await Promise.all([sb.from('kelas').select('*').order('nama'), sb.from('tahun_ajaran').select('*').order('id')]);
  const aktif = ta.data.find(x => x.aktif) || ta.data[0];
  $('#main').innerHTML = head('Guru', 'Raport', 'Pilih kelas dan semester, isi catatan wali kelas, lalu hasilkan raport. Raport semester 1 dan 2 dibuat terpisah.') +
    `<div class="sec"><label style="margin-top:0">Kelas</label><select id="rk">${opt(k.data, 'id', 'nama')}</select>
    <label>Semester</label><select id="rp">${ta.data.map(x => `<option value="${x.id}" ${aktif && x.id === aktif.id ? 'selected' : ''}>Semester ${x.semester} ${h(x.nama)}</option>`).join('')}</select>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" onclick="muatRaport()">Tampilkan siswa</button><button class="btn alt" onclick="go('peringkat')">Lihat peringkat angkatan</button></div>
    <div style="border-top:1px solid var(--line);margin-top:14px;padding-top:2px"><p class="hint" style="margin:10px 0 0">Untuk hari pembagian raport: semua siswa kelas ini dalam satu file PDF, satu siswa per halaman.</p><button class="btn" onclick="unduhRaportKelas()">Cetak raport satu kelas (PDF)</button></div></div><div id="rl"></div><div id="sk"></div><div id="lp"></div>`;
}
async function muatRaport() {
  const kid = +$('#rk').value, ta = +$('#rp').value;
  if (!kid || !ta) return toast('Pilih kelas dan semester dulu', 1);
  const [s, r] = await Promise.all([
    sb.from('siswa').select('id,nama').eq('kelas_id', kid).order('nama'),
    sb.from('raport').select('siswa_id,catatan_wali,terbit,peringkat_kelas,dari_kelas').eq('tahun_ajaran_id', ta)
  ]);
  const rm = Object.fromEntries(r.data.map(x => [x.siswa_id, x]));
  $('#rl').innerHTML = s.data.length
    ? `<div class="sec"><h2>Catatan wali kelas</h2><p class="hint">Nilai akhir dihitung otomatis dari rata-rata semua nilai pada semester ini. Peringkat dihitung di menu Peringkat.</p>` +
      s.data.map(x => { const q = rm[x.id]; return `<div style="padding:8px 0;border-bottom:1px solid var(--line)"><div class="row" style="border:0;padding:0 0 4px"><b>${h(x.nama)}</b><span>${q && q.peringkat_kelas != null ? `<span class="stamp no">Peringkat ${q.peringkat_kelas}/${q.dari_kelas}</span> ` : ''}<button class="btn alt sm" onclick="bukaSikap(${x.id})">Sikap</button> <button class="btn alt sm" onclick="laporanGuru(${x.id})">Laporan</button></span></div><input class="rc" data-sid="${x.id}" placeholder="Catatan singkat" value="${h(q?.catatan_wali || '')}"></div>`; }).join('') +
      `<label style="display:flex;gap:8px;align-items:center;margin-top:16px;font-weight:500"><input type="checkbox" id="rt" style="width:auto" ${r.data.length && s.data.every(x => rm[x.id]?.terbit) ? 'checked' : ''}> Terbitkan agar siswa dan orang tua bisa melihat</label>
      <button class="btn" onclick="simpanRaport()">Hasilkan raport kelas</button></div>`
    : '<div class="sec"><p class="mut" style="margin:0">Belum ada siswa di kelas ini.</p></div>';
}
async function laporanGuru(sid) {
  const ta = +$('#rp').value;
  $('#lp').innerHTML = `<div class="noprint" style="display:flex;gap:8px"><button class="btn sm" onclick="unduhPdf(${sid},${ta})">Unduh PDF</button><button class="btn alt sm" onclick="window.print()">Cetak</button></div>` + await laporanHtml(sid, ta);
  $('#lp').scrollIntoView();
}
async function simpanRaport() {
  const ta = +$('#rp').value, terbit = !!$('#rt').checked;
  const { data: T } = await sb.from('tahun_ajaran').select('*').eq('id', ta).single();
  if (!T) return toast('Pilih semester dulu', 1);
  await muatBobot();
  const periode = `Semester ${T.semester} ${T.nama}`;
  const rows = $$('.rc').map(e => ({ siswa_id: +e.dataset.sid, tahun_ajaran_id: ta, periode, catatan_wali: e.value.trim() || null, terbit }));
  const { data: rp, error } = await sb.from('raport').upsert(rows, { onConflict: 'siswa_id,tahun_ajaran_id' }).select('id,siswa_id');
  if (error) return toast(error.message, 1);
  const [n, m] = await Promise.all([
    sb.from('nilai').select('siswa_id,mapel_id,jenis,nilai').in('siswa_id', rp.map(x => x.siswa_id)).eq('tahun_ajaran_id', ta),
    sb.from('mapel').select('id,kkm')
  ]);
  const kkm = Object.fromEntries(m.data.map(x => [x.id, x.kkm])), g = {};
  n.data.forEach(r => ((g[r.siswa_id] ??= {})[r.mapel_id] ??= []).push({ jenis: r.jenis, nilai: r.nilai }));
  const det = [];
  rp.forEach(r => Object.entries(g[r.siswa_id] || {}).forEach(([mid, v]) => {
    const a = hitungAkhir(v, BOBOT).akhir;
    if (a == null) return;
    det.push({ raport_id: r.id, mapel_id: +mid, nilai_akhir: Math.round(a * 10) / 10, deskripsi_capaian: a >= kkm[mid] ? 'Mencapai ketuntasan belajar' : 'Perlu bimbingan lebih lanjut' });
  }));
  await sb.from('raport_detail').delete().in('raport_id', rp.map(r => r.id));
  if (det.length) { const { error: e2 } = await sb.from('raport_detail').insert(det); if (e2) return toast(e2.message, 1); }
  toast(terbit ? 'Raport tersimpan dan diterbitkan' : 'Raport tersimpan, belum diterbitkan');
}

/* ===== SISWA & ORANG TUA ===== */
function raportHtml(rs) {
  if (!rs || !rs.length) return '<h3 class="sub">Raport</h3><p class="mut" style="margin:0">Raport belum diterbitkan oleh wali kelas.</p>';
  return '<h3 class="sub">Raport</h3>' + rs.map(r => `<div class="lembar"><div class="row"><b>${h(r.periode)}</b><small>${h(SCHOOL)}</small></div>
  ${(r.raport_detail || []).map(d => `<div class="row"><span>${h(d.mapel?.nama)}<br><small>${h(d.deskripsi_capaian)}</small></span><span class="num2">${(+d.nilai_akhir).toFixed(1)}</span></div>`).join('')}
  ${r.peringkat_kelas != null ? `<div class="row"><span>Peringkat di kelas<br><small>Rata-rata ${r.rata_rata}</small></span><span class="num2">${r.peringkat_kelas} dari ${r.dari_kelas}</span></div><div class="row"><span>Peringkat di angkatan</span><span class="num2">${r.peringkat_angkatan} dari ${r.dari_angkatan}</span></div>` : ''}
  <p style="margin:12px 0 0"><b>Catatan wali kelas</b><br>${h(r.catatan_wali || '-')}</p></div>`).join('<div style="height:10px"></div>') +
  '<button class="btn alt sm" style="margin-top:10px" onclick="go(\'laporan\')">Buka laporan lengkap (PDF)</button>';
}
async function vLihat() {
  const s = await sb.from('siswa').select('id,nama,nis,kelas_id,kelas(nama)');
  const ortu = me.role === 'ortu';
  if (!s.data.length) { $('#main').innerHTML = head('Beranda', 'Belum ada data anak', 'Akun ini belum dihubungkan ke data siswa. Hubungi admin sekolah agar akun dihubungkan.'); return; }
  let out = head('Beranda', ortu ? 'Perkembangan anak' : 'Ringkasan belajarmu', ortu ? 'Kehadiran, nilai, tugas, dan raport anak Anda.' : 'Kehadiran, nilai, tugas, dan raport kamu.');
  out += await bagianKabar();
  out += await bagianInfo();
  if (ortu) out += await bagianTagihan();
  if (!ortu) out += await bagianAbsen(s.data[0].id);
  for (const x of s.data) {
    const [a, n, r, t, p] = await Promise.all([
      sb.from('absensi').select('status,terverifikasi').eq('siswa_id', x.id),
      sb.from('nilai').select('nilai,mapel(nama)').eq('siswa_id', x.id),
      sb.from('raport').select('periode,catatan_wali,rata_rata,peringkat_kelas,dari_kelas,peringkat_angkatan,dari_angkatan,raport_detail(nilai_akhir,deskripsi_capaian,mapel(nama))').eq('siswa_id', x.id).order('periode'),
      sb.from('tugas').select('id,judul,deadline,jenis').eq('kelas_id', x.kelas_id),
      sb.from('pengumpulan_tugas').select('tugas_id,status').eq('siswa_id', x.id)
    ]);
    const c = { hadir: 0, izin: 0, sakit: 0, alpa: 0 };
    const av = a.data.filter(v => v.terverifikasi !== false), pend = a.data.length - av.length;
    av.forEach(v => c[v.status]++);
    const pct = av.length ? Math.round(c.hadir / av.length * 100) : null;
    const all = n.data.map(v => +v.nilai), avg = all.length ? (all.reduce((u, w) => u + w, 0) / all.length).toFixed(1) : null;
    const sudah = new Set(p.data.filter(v => v.status !== 'perlu_perbaikan').map(v => v.tugas_id)), tunggu = t.data.filter(v => !sudah.has(v.id)).length;
    const segera = t.data.filter(v => !sudah.has(v.id) && v.deadline && new Date(v.deadline) > Date.now() && new Date(v.deadline) - Date.now() < 1728e5);
    const g = {};
    n.data.forEach(v => (g[v.mapel?.nama || '-'] ??= []).push(+v.nilai));
    out += `<div class="sec"><h2>${h(x.nama)}</h2><p class="hint">Kelas ${h(x.kelas?.nama || '-')} - NIS ${h(x.nis)}</p>
    <div class="stats"><div class="stat"><span class="num">${pct === null ? '-' : pct + '%'}</span><small>Kehadiran</small></div>
    <div class="stat"><span class="num">${avg ?? '-'}</span><small>Rata-rata nilai</small></div>
    <div class="stat"><span class="num">${tunggu}</span><small>Tugas menunggu</small></div></div>
    ${segera.map(v => `<div class="call" style="margin:10px 0 0"><span><b>${v.jenis === 'pr' ? 'PR' : 'Tugas'}: ${h(v.judul)}</b><br><small>${sisaWaktu(v.deadline).teks}</small></span><button class="btn sm" onclick="go('tugasku')">Lihat</button></div>`).join('')}
    ${a.data.length ? `<p class="hint" style="margin-top:8px">Hadir ${c.hadir}, izin ${c.izin}, sakit ${c.sakit}, alpa ${c.alpa}${pend ? ` (${pend} menunggu verifikasi guru)` : ''}</p>` : ''}
    ${tunggu && !ortu ? '<button class="btn sm" style="margin-top:8px" onclick="go(\'tugasku\')">Kerjakan tugas</button>' : ''}
    <h3 class="sub">Nilai per mata pelajaran</h3>
    ${Object.entries(g).map(([m, v]) => `<div class="row"><span>${h(m)}</span><span class="num2">${(v.reduce((u, w) => u + w, 0) / v.length).toFixed(1)}</span></div>`).join('') || '<p class="mut" style="margin:0">Belum ada nilai.</p>'}
    ${raportHtml(r.data)}</div>`;
  }
  $('#main').innerHTML = out;
}
async function vTugasku() {
  const s = await sb.from('siswa').select('id,nama,kelas_id');
  const siswa = me.role === 'siswa';
  let out = head('Tugas', siswa ? 'PR dan tugas' : 'PR dan tugas anak', siswa ? 'Baca soal, tulis jawaban atau foto jawabanmu, lalu kirim sebelum batas waktu. Guru akan memeriksa dan kamu diberi tahu hasilnya.' : 'Daftar PR dan tugas anak beserta statusnya.');
  if (!s.data.length) out += '<div class="sec"><p class="mut" style="margin:0">Belum ada data siswa yang terhubung dengan akun ini.</p></div>';
  for (const x of s.data) {
    const [t, p] = await Promise.all([
      sb.from('tugas').select('id,judul,jenis,deskripsi,deadline,foto_path,terima_terlambat,mapel(nama)').eq('kelas_id', x.kelas_id).order('deadline'),
      sb.from('pengumpulan_tugas').select('id,tugas_id,nilai,feedback,status,dikumpulkan_at,terlambat').eq('siswa_id', x.id)
    ]);
    const pm = Object.fromEntries(p.data.map(r => [r.tugas_id, r]));
    out += `<div class="sec">${s.data.length > 1 ? `<h2>${h(x.nama)}</h2>` : ''}${t.data.map(g => {
      const r = pm[g.id], sw = g.deadline ? sisaWaktu(g.deadline) : null;
      const tutup = !!(g.deadline && g.terima_terlambat === false && new Date(g.deadline) < new Date());
      const boleh = siswa && !tutup && (!r || r.status === 'perlu_perbaikan');
      const st = !r ? (tutup ? '<span class="stamp bad">Ditutup</span>' : '<span class="stamp warn">Belum dikumpulkan</span>')
        : r.status === 'benar' ? `<span class="stamp ok">Benar${r.nilai != null ? ' - nilai ' + r.nilai : ''}</span>`
        : r.status === 'perlu_perbaikan' ? '<span class="stamp warn">Perlu diperbaiki</span>' : '<span class="stamp no">Menunggu diperiksa</span>';
      return `<div style="padding:12px 0;border-bottom:1px solid var(--line)"><div class="row" style="border:0;padding:0"><b>${g.jenis === 'pr' ? 'PR: ' : ''}${h(g.judul)}</b>${st}</div>
      <small>${h(g.mapel?.nama)}${g.deadline ? ' - batas ' + tgl(g.deadline) : ''}</small>
      ${sw && !r ? `<br><span class="stamp ${sw.c}" style="margin-top:4px">${sw.teks}</span>` : ''}
      ${r && r.dikumpulkan_at ? `<br><small>Dikumpulkan ${tgl(r.dikumpulkan_at)}${r.terlambat ? ' (terlambat)' : ' (tepat waktu)'}</small>` : ''}
      ${g.deskripsi ? `<p style="margin:6px 0 0">${h(g.deskripsi)}</p>` : ''}${g.foto_path ? `<img class="foto" data-p="${h(g.foto_path)}" alt="Foto soal" onclick="window.open(this.src)">` : ''}` +
        (r && r.feedback ? `<div class="call" style="margin:10px 0 0"><span><b>Catatan guru:</b> ${h(r.feedback)}</span></div>` : '') +
        (boleh ? `<textarea id="j${g.id}" rows="3" style="margin-top:10px" placeholder="Tulis jawaban (boleh kosong kalau pakai foto)"></textarea>
        <label>Foto jawaban (boleh kosong)</label><input id="f${g.id}" type="file" accept="image/*">
        <button class="btn sm" style="margin-top:10px" onclick="kumpul(${g.id},${x.id},${r ? r.id : 0})">${r ? 'Kirim ulang' : 'Kumpulkan'}</button>` : '') + '</div>';
    }).join('') || '<p class="mut" style="margin:0">Belum ada PR atau tugas dari guru.</p>'}</div>`;
  }
  $('#main').innerHTML = out; muatFoto();
}
async function kumpul(tid, sid, pid) {
  const j = $('#j' + tid).value.trim(), ada = $('#f' + tid)?.files?.[0];
  if (!j && !ada) return toast('Tulis jawaban atau lampirkan foto dulu', 1);
  try {
    toast('Mengirim jawabanmu...');
    const foto = await unggahFoto('#f' + tid, 'jawaban');
    if (pid) {
      const r = await sb.rpc('kirim_ulang_tugas', { p_id: pid, p_jawaban: j || null, p_foto: foto });
      if (r.error) throw r.error;
      if (!r.data.ok) return toast(r.data.pesan, 1);
    } else {
      const { error } = await sb.from('pengumpulan_tugas').insert({ tugas_id: tid, siswa_id: sid, jawaban: j || null, foto_path: foto });
      if (error) throw error;
    }
    toast('Terkirim! Guru akan segera memeriksa.'); go(cur);
  } catch (e) { toast(/row-level security/.test(e.message || '') ? 'Pengumpulan sudah ditutup karena lewat batas waktu.' : (e.message || 'Gagal mengirim, coba lagi'), 1); }
}

/* ===== foto ===== */
function kecilkan(file) {
  return new Promise(res => {
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 1280 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => { URL.revokeObjectURL(u); res(b || file); }, 'image/jpeg', 0.75);
    };
    img.onerror = () => res(file);
    img.src = u;
  });
}
async function unggahFoto(sel, folder) {
  const f = $(sel)?.files?.[0];
  if (!f) return null;
  const blob = await kecilkan(f), path = `${folder}/${crypto.randomUUID()}.jpg`;
  const { error } = await sb.storage.from('tugas').upload(path, blob, { contentType: 'image/jpeg' });
  if (error) throw error;
  return path;
}
function muatFoto() {
  $$('img[data-p]').forEach(async i => {
    const p = i.dataset.p; i.removeAttribute('data-p');
    const { data } = await sb.storage.from('tugas').createSignedUrl(p, 3600);
    if (data) i.src = data.signedUrl;
  });
}

/* ===== notifikasi ===== */
async function segarkanBadge() {
  if (!me) return;
  const { data } = await sb.from('notifikasi').select('id,judul,isi,tautan').eq('user_id', me.id).eq('dibaca', false);
  const b = $('#bd');
  if (b) { b.textContent = data.length > 9 ? '9+' : data.length; b.hidden = !data.length; }
  const top = data.reduce((m, x) => Math.max(m, x.id), 0);
  if (maxId !== null && top > maxId) banner(data.find(x => x.id === top));
  maxId = Math.max(maxId ?? 0, top);
}
function mulaiNotif() {
  if (kanal) sb.removeChannel(kanal);
  clearInterval(ticker); ticker = setInterval(segarkanBadge, 45000);
  kanal = sb.channel('notif-' + me.id)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifikasi', filter: 'user_id=eq.' + me.id }, () => { segarkanBadge(); if (cur === 'notif') go('notif'); })
    .subscribe();
}
function banner(n) {
  const b = $('#nb');
  if (!b || !n) return;
  b.innerHTML = `<b>${h(n.judul)}</b><span>${h(n.isi || '')}</span>`;
  b.onclick = () => { b.hidden = true; bukaNotif(n.id, n.tautan || 'home'); };
  b.hidden = false; clearTimeout(b._x); b._x = setTimeout(() => b.hidden = true, 7000);
}
function waktu(iso) {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return 'baru saja';
  if (m < 60) return m + ' menit lalu';
  if (m < 1440) return Math.round(m / 60) + ' jam lalu';
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}
async function vNotif() {
  const { data } = await sb.from('notifikasi').select('*').eq('user_id', me.id).order('created_at', { ascending: false });
  const baru = data.filter(n => !n.dibaca).length;
  $('#main').innerHTML = head('Kotak masuk', 'Notifikasi', baru ? `${baru} belum dibaca. Ketuk untuk membuka.` : 'Semua sudah dibaca.') + pushHtml() +
    (data.length ? `<div class="sec">${data.map(n => `<div class="notif ${n.dibaca ? '' : 'baru'}" onclick="bukaNotif(${n.id},'${h(n.tautan || 'home')}')"><b>${h(n.judul)}</b><p>${h(n.isi || '')}</p><small>${waktu(n.created_at)}</small></div>`).join('')}</div>
    ${baru ? '<button class="btn alt sm" onclick="bacaSemua()">Tandai semua dibaca</button>' : ''}` : '<div class="sec"><p class="mut" style="margin:0">Belum ada notifikasi.</p></div>');
}
async function bukaNotif(id, tautan) {
  await sb.from('notifikasi').update({ dibaca: true }).eq('id', id);
  segarkanBadge(); go(VIEWS[tautan] ? tautan : 'home');
}
async function bacaSemua() {
  await sb.from('notifikasi').update({ dibaca: true }).eq('user_id', me.id).eq('dibaca', false);
  segarkanBadge(); go('notif');
}
async function bagianKabar() {
  const { data } = await sb.from('notifikasi').select('*').eq('user_id', me.id).eq('dibaca', false).order('created_at', { ascending: false });
  if (!data.length) return '';
  return `<div class="sec"><h2>Terbaru untukmu</h2>${data.slice(0, 3).map(n => `<div class="notif baru" onclick="bukaNotif(${n.id},'${h(n.tautan || 'home')}')"><b>${h(n.judul)}</b><p>${h(n.isi || '')}</p></div>`).join('')}
  ${data.length > 3 ? `<button class="btn alt sm" style="margin-top:8px" onclick="go('notif')">Lihat semua (${data.length})</button>` : ''}</div>`;
}

/* ===== periode, waktu ===== */
async function periodeAktif() {
  const { data } = await sb.from('tahun_ajaran').select('*').eq('aktif', true);
  return data[0] || null;
}
async function addPeriode() {
  const o = { nama: $('#pa').value.trim(), semester: +$('#ps').value, mulai: $('#pm').value || null, selesai: $('#pe').value || null, aktif: false };
  if (!o.nama || !o.mulai || !o.selesai) return toast('Isi tahun ajaran, tanggal mulai, dan tanggal selesai', 1);
  tambah('tahun_ajaran', o, 'Semester ditambahkan');
}
async function aktifkan(id) {
  await sb.from('tahun_ajaran').update({ aktif: false }).eq('aktif', true);
  const { error } = await sb.from('tahun_ajaran').update({ aktif: true }).eq('id', id);
  if (error) return toast(error.message, 1);
  toast('Semester diaktifkan'); go(cur);
}
function tgl(iso) { return new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
function sisaWaktu(iso) {
  const ms = new Date(iso) - Date.now(), a = Math.abs(ms), mnt = Math.floor(a / 60000), jam = Math.floor(mnt / 60), hr = Math.floor(jam / 24);
  const t = hr >= 1 ? `${hr} hari ${jam % 24} jam` : jam >= 1 ? `${jam} jam ${mnt % 60} menit` : `${mnt} menit`;
  return ms < 0 ? { teks: 'Lewat batas ' + t + ' lalu', c: 'bad' } : { teks: 'Sisa waktu ' + t, c: ms < 864e5 ? 'warn' : 'no' };
}

/* ===== laporan PDF per siswa ===== */
async function vLaporan() {
  const [s, ta] = await Promise.all([sb.from('siswa').select('id,nama').order('nama'), sb.from('tahun_ajaran').select('*').order('id')]);
  if (!s.data.length) { $('#main').innerHTML = head('Laporan', 'Laporan hasil belajar', 'Belum ada data siswa yang terhubung dengan akun ini. Hubungi admin sekolah.'); return; }
  const aktif = ta.data.find(x => x.aktif) || ta.data[0];
  $('#main').innerHTML = head('Laporan', 'Laporan hasil belajar', 'Kehadiran, nilai, tugas, dan peringkat per semester. Unduh sebagai PDF untuk arsip.') +
    `<div class="sec noprint"><label style="margin-top:0">Siswa</label><select id="ls" onchange="tampilLaporan()">${opt(s.data, 'id', 'nama')}</select>
    <label>Semester</label><select id="lt" onchange="tampilLaporan()">${ta.data.map(x => `<option value="${x.id}" ${aktif && x.id === aktif.id ? 'selected' : ''}>Semester ${x.semester} ${h(x.nama)}</option>`).join('')}</select>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" onclick="unduhPdf(+$('#ls').value,+$('#lt').value)">Unduh PDF</button><button class="btn alt" onclick="window.print()">Cetak</button></div></div><div id="lp"></div>`;
  tampilLaporan();
}
async function tampilLaporan() { $('#lp').innerHTML = await laporanHtml(+$('#ls').value, +$('#lt').value); }
async function laporanData(sid, taId) {
  await muatBobot();
  const [sw, ta] = await Promise.all([
    sb.from('siswa').select('id,nama,nis,kelas_id,kelas(nama)').eq('id', sid).single(),
    sb.from('tahun_ajaran').select('*').eq('id', taId).single()
  ]);
  if (!sw.data || !ta.data) return null;
  const S = sw.data, T = ta.data;
  const rw = (await sb.from('riwayat_kelas').select('kelas_id,hasil,kelas(nama)').eq('siswa_id', sid).eq('tahun', T.nama)).data[0];
  const kelasId = rw ? rw.kelas_id : S.kelas_id, kelasNama = rw ? rw.kelas?.nama : S.kelas?.nama;
  const [ab, nl, rp, tg, pg, sk, ek] = await Promise.all([
    sb.from('absensi').select('tanggal,status,terverifikasi').eq('siswa_id', sid).order('tanggal'),
    sb.from('nilai').select('nilai,jenis,mapel(nama,kkm)').eq('siswa_id', sid).eq('tahun_ajaran_id', taId),
    sb.from('raport').select('catatan_wali,rata_rata,peringkat_kelas,dari_kelas,peringkat_angkatan,dari_angkatan').eq('siswa_id', sid).eq('tahun_ajaran_id', taId),
    kelasId ? sb.from('tugas').select('id,created_at').eq('kelas_id', kelasId) : Promise.resolve({ data: [] }),
    sb.from('pengumpulan_tugas').select('tugas_id,terlambat').eq('siswa_id', sid),
    sb.from('nilai_sikap').select('aspek,predikat,deskripsi').eq('siswa_id', sid).eq('tahun_ajaran_id', taId),
    sb.from('nilai_ekskul').select('predikat,keterangan,ekskul(nama)').eq('siswa_id', sid).eq('tahun_ajaran_id', taId)
  ]);
  return susunLaporan(S, T, rw, kelasNama, { ab: ab.data, nl: nl.data, rp: rp.data, tg: tg.data, pg: pg.data, sk: sk.data, ek: ek.data });
}
function susunLaporan(S, T, rw, kelasNama, raw) {
  const dalam = d => (!T.mulai || d >= T.mulai) && (!T.selesai || d <= T.selesai);
  const hd = raw.ab.filter(x => x.terverifikasi !== false && dalam(x.tanggal));
  const c = { hadir: 0, izin: 0, sakit: 0, alpa: 0 };
  hd.forEach(x => c[x.status]++);
  const g = {};
  raw.nl.forEach(x => { const n = x.mapel?.nama || '-'; (g[n] ??= { kkm: x.mapel?.kkm || 75, list: [] }).list.push(x); });
  const baris = Object.entries(g).map(([m, d]) => {
    const r = hitungAkhir(d.list, BOBOT);
    return [m, r.kom.sumatif, r.kom.nts, r.kom.performa, r.kom.akhir, r.akhir, r.akhir == null ? '-' : r.akhir >= d.kkm ? 'Tuntas' : 'Belum tuntas'];
  });
  const tgSem = raw.tg.filter(x => dalam(String(x.created_at).slice(0, 10))), id = new Set(tgSem.map(x => x.id));
  const kumpul = raw.pg.filter(x => id.has(x.tugas_id));
  return { S, T, c, pct: hd.length ? Math.round(c.hadir / hd.length * 100) : null, absen: hd.filter(x => x.status !== 'hadir'), baris, jumlahTugas: tgSem.length, dikumpul: kumpul.length, telat: kumpul.filter(x => x.terlambat).length, R: raw.rp[0], bobot: teksBobot(), kelasNama, hasil: rw && rw.hasil, sikap: raw.sk, ekskul: raw.ek };
}
async function laporanHtml(sid, taId) {
  const d = await laporanData(sid, taId);
  if (!d) return '<div class="sec"><p class="mut" style="margin:0">Pilih siswa dan semester yang tersedia.</p></div>';
  const { S, T, c, R } = d;
  return `<div class="kertas"><div style="text-align:center;margin-bottom:12px"><b style="font-size:18px">${h(SCHOOL)}</b><br>Laporan hasil belajar dan kehadiran<br><small>Semester ${T.semester} tahun ajaran ${h(T.nama)}</small></div>
  <table class="tb"><tr><th style="width:30%">Nama</th><td>${h(S.nama)}</td></tr><tr><th>NIS</th><td>${h(S.nis)}</td></tr><tr><th>Kelas</th><td>${h(d.kelasNama || '-')}</td></tr></table>
  <h3>Kehadiran</h3>
  <table class="tb"><tr><th>Hadir</th><th>Izin</th><th>Sakit</th><th>Alpa</th><th>Persentase hadir</th></tr><tr><td>${c.hadir}</td><td>${c.izin}</td><td>${c.sakit}</td><td>${c.alpa}</td><td>${d.pct == null ? '-' : d.pct + '%'}</td></tr></table>
  ${d.absen.length ? `<p style="margin:6px 0 0"><small>Tidak hadir pada: ${d.absen.map(x => `${new Date(x.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} (${x.status})`).join(', ')}</small></p>` : ''}
  <h3>Hasil belajar</h3>
  ${d.baris.length ? `<table class="tb"><tr><th>Mata pelajaran</th><th>NS</th><th>NTS</th><th>NP</th><th>NA</th><th>Akhir</th><th>Ket.</th></tr>${d.baris.map(b => `<tr><td>${h(b[0])}</td><td>${fmt(b[1])}</td><td>${fmt(b[2])}</td><td>${fmt(b[3])}</td><td>${fmt(b[4])}</td><td><b>${fmt(b[5])}</b></td><td>${b[6]}</td></tr>`).join('')}</table>
  <p style="margin:6px 0 0"><small>NS sumatif harian, NTS tengah semester, NP asesmen performa, NA akhir semester. Nilai akhir = ${d.bobot}.</small></p>` : '<p class="mut" style="margin:0">Belum ada nilai pada semester ini.</p>'}
  <h3>PR dan tugas</h3><p style="margin:0">${d.jumlahTugas} diberikan, ${d.dikumpul} dikumpulkan${d.telat ? `, ${d.telat} terlambat` : ''}.</p>
  ${R && R.peringkat_kelas != null ? `<h3>Peringkat</h3><table class="tb"><tr><th>Rata-rata</th><th>Peringkat di kelas</th><th>Peringkat di angkatan</th></tr><tr><td>${R.rata_rata == null ? '-' : fmt(+R.rata_rata)}</td><td>${R.peringkat_kelas} dari ${R.dari_kelas}</td><td>${R.peringkat_angkatan} dari ${R.dari_angkatan}</td></tr></table>` : ''}
  ${d.sikap.length ? `<h3>Sikap</h3><table class="tb"><tr><th>Aspek</th><th>Predikat</th><th>Keterangan</th></tr>${d.sikap.map(x => `<tr><td>${h(x.aspek)}</td><td>${h(x.predikat)}</td><td>${h(x.deskripsi || '-')}</td></tr>`).join('')}</table>` : ''}
  ${d.ekskul.length ? `<h3>Ekstrakurikuler</h3><table class="tb"><tr><th>Kegiatan</th><th>Predikat</th><th>Keterangan</th></tr>${d.ekskul.map(x => `<tr><td>${h(x.ekskul?.nama)}</td><td>${h(x.predikat)}</td><td>${h(x.keterangan || '-')}</td></tr>`).join('')}</table>` : ''}
  <h3>Catatan wali kelas</h3><p style="margin:0">${h(R?.catatan_wali || '-')}</p>
  <div class="ttd"><div><i></i>Wali kelas</div><div><i></i>Orang tua atau wali</div></div>
  <p style="text-align:right;margin:14px 0 0"><small>Dicetak ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</small></p></div>`;
}
async function unduhPdf(sid, taId) {
  try {
    toast('Menyiapkan PDF...');
    const [d, ident, logo] = await Promise.all([laporanData(sid, taId), muatIdentitas(), muatLogo(), muatSkrip(JSPDF)]);
    if (!d) return toast('Pilih siswa dan semester dulu', 1);
    await muatSkrip(AUTOTABLE);
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    gambarLaporanPdf(doc, d, { kota: ident.kota, kepsek: ident.kepsek, tanggal: d.T.tgl_raport || undefined, logo });
    doc.save(`Laporan-${d.S.nama.replace(/\s+/g, '-')}-Semester${d.T.semester}.pdf`);
    toast('PDF diunduh');
  } catch (e) { toast(e.message || 'PDF gagal dibuat', 1); }
}

/* ===== peringkat ===== */
async function vPeringkat() {
  const [ta, k] = await Promise.all([sb.from('tahun_ajaran').select('*').order('id'), sb.from('kelas').select('*').order('nama')]);
  const tingkat = [...new Set(k.data.map(x => x.tingkat).filter(x => x != null))].sort();
  const aktif = ta.data.find(x => x.aktif) || ta.data[0];
  $('#main').innerHTML = head('Peringkat', 'Peringkat siswa', 'Dihitung dari rata-rata semua nilai pada satu semester. Kelas dengan tingkat yang sama dibandingkan sebagai satu angkatan.') +
    `<div class="sec"><label style="margin-top:0">Semester</label><select id="pt" onchange="muatPeringkat()">${ta.data.map(x => `<option value="${x.id}" ${aktif && x.id === aktif.id ? 'selected' : ''}>Semester ${x.semester} ${h(x.nama)}</option>`).join('')}</select>
    <label>Tingkat</label><select id="pk" onchange="muatPeringkat()">${tingkat.map(x => `<option value="${x}">Kelas ${x}</option>`).join('')}</select>
    <button class="btn" onclick="hitungPeringkat()">Hitung ulang peringkat</button>
    <p class="hint" style="margin:8px 0 0">Jalankan setelah ujian semester selesai dan nilai semua kelas paralel sudah masuk.</p></div><div id="pr"></div>`;
  if (tingkat.length) muatPeringkat(); else $('#pr').innerHTML = '<div class="sec"><p class="mut" style="margin:0">Belum ada kelas bertingkat. Beri nama kelas dengan angka di depan, misalnya 7A.</p></div>';
}
async function muatPeringkat() {
  const ta = +$('#pt').value, ting = +$('#pk').value;
  const [r, k] = await Promise.all([
    sb.from('raport').select('siswa_id,rata_rata,peringkat_kelas,dari_kelas,peringkat_angkatan,dari_angkatan,siswa(nama,kelas_id)').eq('tahun_ajaran_id', ta),
    sb.from('kelas').select('id,nama,tingkat')
  ]);
  const kn = Object.fromEntries(k.data.filter(x => x.tingkat == ting).map(x => [x.id, x.nama]));
  const rows = r.data.filter(x => x.peringkat_angkatan != null && kn[x.siswa?.kelas_id]).sort((a, b) => a.peringkat_angkatan - b.peringkat_angkatan);
  $('#pr').innerHTML = rows.length
    ? `<div class="sec"><h2>Kelas ${ting}: ${Object.keys(kn).length} kelas paralel, ${rows.length} siswa</h2>
    <div style="overflow-x:auto"><table class="tb"><tr><th>#</th><th>Nama</th><th>Kelas</th><th>Rata-rata</th><th>Di kelas</th></tr>${rows.map(x => `<tr><td><b>${x.peringkat_angkatan}</b></td><td>${h(x.siswa?.nama)}</td><td>${h(kn[x.siswa?.kelas_id])}</td><td>${x.rata_rata}</td><td>${x.peringkat_kelas}/${x.dari_kelas}</td></tr>`).join('')}</table></div></div>`
    : '<div class="sec"><p class="mut" style="margin:0">Belum ada peringkat untuk pilihan ini. Tekan Hitung ulang peringkat setelah nilai masuk.</p></div>';
}
async function hitungPeringkat() {
  const ta = +$('#pt').value, ting = +$('#pk').value;
  if (!ta || !ting) return toast('Pilih semester dan tingkat dulu', 1);
  const { data, error } = await sb.rpc('hitung_peringkat', { p_ta: ta, p_tingkat: ting });
  if (error) return toast(error.message, 1);
  toast(data.pesan, !data.ok); muatPeringkat();
}

/* ===== utilitas ===== */
const JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const AUTOTABLE = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
const SHEETJS = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
function muatSkrip(src) {
  return new Promise((ok, no) => {
    if ($$('script').some(x => x.src === src)) return ok();
    const t = document.createElement('script');
    t.src = src; t.onload = ok; t.onerror = () => no(new Error('Pustaka gagal dimuat. Periksa koneksi internet.'));
    document.head.appendChild(t);
  });
}
function simpanBerkas(blob, nama) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nama; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const fmt = v => v == null ? '-' : (+v).toLocaleString('id-ID', { maximumFractionDigits: 1 });
function b64u(buf) { let t = ''; new Uint8Array(buf).forEach(b => t += String.fromCharCode(b)); return btoa(t).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function dariB64u(t) { t = t.replace(/-/g, '+').replace(/_/g, '/'); t += '='.repeat((4 - t.length % 4) % 4); return Uint8Array.from(atob(t), c => c.charCodeAt(0)); }
const rentang = x => { const f = d => new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' }); return x.tanggal_selesai && x.tanggal_selesai !== x.tanggal ? `${f(x.tanggal)} - ${f(x.tanggal_selesai)}` : f(x.tanggal); };

/* ===== bobot nilai akhir ===== */
const KOMP = { sumatif: 'Sumatif harian (NS)', nts: 'Tengah semester (NTS)', performa: 'Asesmen performa (NP)', akhir: 'Akhir semester (NA)' };
const SINGKAT = { sumatif: 'NS', nts: 'NTS', performa: 'NP', akhir: 'NA' };
const PETA = { sumatif: 'sumatif', tugas: 'sumatif', harian: 'sumatif', nts: 'nts', performa: 'performa', praktik: 'performa', akhir: 'akhir', ujian: 'akhir' };
let BOBOT = { sumatif: 40, nts: 20, performa: 20, akhir: 20 };
async function muatBobot() {
  const { data } = await sb.from('pengaturan').select('*').eq('kunci', 'bobot');
  if (data[0] && data[0].nilai) BOBOT = data[0].nilai;
  return BOBOT;
}
function teksBobot() { return Object.keys(KOMP).map(k => `${BOBOT[k]}% ${SINGKAT[k]}`).join(' + '); }
function hitungAkhir(list, bobot) {
  const g = {}, kom = {};
  list.forEach(x => { const k = PETA[x.jenis]; if (k) (g[k] ??= []).push(+x.nilai); });
  let a = 0, b = 0;
  for (const k of Object.keys(KOMP)) if (g[k]) { const r = g[k].reduce((u, w) => u + w, 0) / g[k].length; kom[k] = r; a += r * (+bobot[k] || 0); b += +bobot[k] || 0; }
  return { kom, akhir: b ? a / b : null };
}
async function simpanBobot() {
  const b = {};
  for (const k of Object.keys(KOMP)) b[k] = +$('#bb' + k).value || 0;
  const tot = Object.values(b).reduce((u, w) => u + w, 0);
  if (tot !== 100) return toast(`Jumlah bobot harus 100 (sekarang ${tot})`, 1);
  const { error } = await sb.from('pengaturan').upsert({ kunci: 'bobot', nilai: b }, { onConflict: 'kunci' });
  if (error) return toast(error.message, 1);
  BOBOT = b; toast('Bobot nilai disimpan'); go(cur);
}

/* ===== menu lainnya ===== */
let tundaPasang = null;
function sudahTerpasang() {
  return typeof window !== 'undefined' && ((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || (typeof navigator !== 'undefined' && navigator.standalone === true));
}
function segarkanPasang() {
  const mau = !sudahTerpasang(), l = $('#pasangLogin'), t = $('#pasangTop');
  if (l) l.innerHTML = mau ? '<p class="hint" style="margin:0 0 6px">Pasang di HP agar bisa dibuka dari layar utama seperti aplikasi.</p><button class="btn alt" type="button" style="width:100%;margin:0" onclick="pasangApp()">Pasang aplikasi</button>' : '';
  if (t) t.innerHTML = mau ? '<button class="bel" type="button" onclick="pasangApp()">Pasang</button>' : '';
}
function bantuanPasang() {
  const ios = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent || '');
  const b = $('#bantu');
  if (!b) return;
  b.innerHTML = `<b>Pasang aplikasi</b><ol style="margin:8px 0 12px;padding-left:20px">${ios
    ? '<li>Buka halaman ini di <b>Safari</b>.</li><li>Tekan tombol <b>Bagikan</b> (kotak dengan panah ke atas).</li><li>Pilih <b>Tambah ke Layar Utama</b>.</li>'
    : '<li>Buka menu browser (titik tiga di pojok).</li><li>Pilih <b>Pasang aplikasi</b> atau <b>Tambahkan ke layar utama</b>.</li>'}</ol><button class="btn sm" type="button" style="margin:0" onclick="$('#bantu').hidden=true">Mengerti</button>`;
  b.hidden = false;
}
async function pasangApp() {
  if (tundaPasang) { tundaPasang.prompt(); try { await tundaPasang.userChoice; } catch {} tundaPasang = null; segarkanPasang(); return; }
  bantuanPasang();
}
function pasangHtml() {
  if (sudahTerpasang()) return '';
  return '<div class="sec"><h2>Pasang sebagai aplikasi</h2><p class="hint">Buka langsung dari layar utama, tanpa mengetik alamat lagi.</p><button class="btn" type="button" onclick="pasangApp()">Pasang aplikasi</button></div>';
}
function cekOnline() { const o = $('#off'); if (o) o.hidden = typeof navigator === 'undefined' || navigator.onLine !== false; }
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); tundaPasang = e; segarkanPasang(); });
  window.addEventListener('appinstalled', () => { tundaPasang = null; segarkanPasang(); });
  window.addEventListener('online', cekOnline); window.addEventListener('offline', cekOnline);
}
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof location !== 'undefined' && /^https?:/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
function vLainnya() {
  $('#main').innerHTML = head('Lainnya', 'Semua fitur', 'Pilih fitur yang ingin dibuka.') +
    `<div class="sec">${[...MORE[me.role], ...(me.role === 'guru' && me.is_bk ? [['bk', 'Catatan BK', 'Catatan bimbingan konseling (rahasia)']] : [])].map(([k, t, d]) => `<div class="row" style="cursor:pointer" onclick="go('${k}')"><span><b>${t}</b><br><small>${d}</small></span><span class="mut" aria-hidden="true">Buka</span></div>`).join('')}</div>` + pasangHtml();
}

/* ===== jadwal pelajaran ===== */
const HARI = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
let JK = null;
async function vJadwal() {
  const adm = me.role === 'admin';
  const [j, d, k, m, sw] = await Promise.all([
    sb.from('jadwal').select('id,hari,jam_mulai,jam_selesai,ruang,pengampu(id,guru_id,kelas_id,mapel(nama),kelas(nama))').order('jam_mulai'),
    sb.from('v_direktori').select('id,nama,role'),
    sb.from('kelas').select('*').order('nama'),
    sb.from('mapel').select('*').order('nama'),
    sb.from('siswa').select('id,nama,kelas_id')
  ]);
  const gn = Object.fromEntries(d.data.map(x => [x.id, x.nama])), hariIni = new Date().getDay() || 7;
  const baris = x => `<div class="row"><span><b>${h(x.pengampu?.mapel?.nama)}</b><br><small>${h(x.pengampu?.kelas?.nama)}${x.ruang ? ' - ' + h(x.ruang) : ''} - ${h(gn[x.pengampu?.guru_id] || '-')}</small></span><span style="text-align:right">${x.jam_mulai.slice(0, 5)}-${x.jam_selesai.slice(0, 5)}${adm ? `<br><button class="btn alt sm" style="margin-top:4px" onclick="hapusJadwal(${x.id})">Hapus</button>` : ''}</span></div>`;
  const tampil = (list, judul) => `<div class="sec"><h2>${judul}</h2>` + [1, 2, 3, 4, 5, 6].map(hr => { const l = list.filter(x => x.hari === hr); return l.length ? `<h3 class="sub">${HARI[hr]}${hr === hariIni ? ' (hari ini)' : ''}</h3>${l.map(baris).join('')}` : ''; }).join('') + (list.length ? '' : '<p class="mut" style="margin:0">Belum ada jadwal.</p>') + '</div>';
  let out = head('Jadwal', me.role === 'guru' ? 'Jadwal mengajar' : 'Jadwal pelajaran', adm ? 'Pilih kelas, lihat jadwalnya, lalu tambah jam pelajaran. Jadwal yang bentrok akan ditolak.' : 'Jadwal tiap hari. Hari ini diberi tanda.');
  if (me.role === 'guru') out += tampil(j.data.filter(x => x.pengampu?.guru_id === me.id), 'Jadwal mengajar saya');
  else if (adm) {
    const sel = +($('#jk') && $('#jk').value) || JK || (k.data[0] && k.data[0].id); JK = sel;
    out += `<div class="sec"><label style="margin-top:0">Kelas</label><select id="jk" onchange="vJadwal()">${k.data.map(x => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${h(x.nama)}</option>`).join('')}</select></div>` +
      tampil(j.data.filter(x => x.pengampu?.kelas_id === sel), 'Jadwal kelas ini') +
      `<div class="sec"><h2>Tambah jam pelajaran</h2>
      <label>Hari</label><select id="jh">${[1, 2, 3, 4, 5, 6].map(i => `<option value="${i}">${HARI[i]}</option>`).join('')}</select>
      <label>Jam mulai</label><input id="ja" type="time"><label>Jam selesai</label><input id="jb" type="time">
      <label>Mata pelajaran</label><select id="jm">${opt(m.data, 'id', 'nama')}</select>
      <label>Guru</label><select id="jg">${opt(d.data.filter(x => x.role === 'guru'), 'id', 'nama')}</select>
      <label>Ruang (boleh kosong)</label><input id="jr"><button class="btn" onclick="tambahJadwal()">Tambah ke jadwal</button></div>`;
  } else {
    const ids = [...new Set(sw.data.map(x => x.kelas_id))].filter(Boolean);
    if (!ids.length) out += '<div class="sec"><p class="mut" style="margin:0">Belum ada data kelas yang terhubung dengan akun ini.</p></div>';
    ids.forEach(kid => { const kn = (k.data.find(x => x.id === kid) || {}).nama; out += tampil(j.data.filter(x => x.pengampu?.kelas_id === kid), 'Kelas ' + h(kn || '-')); });
  }
  $('#main').innerHTML = out;
}
async function tambahJadwal() {
  const kid = +$('#jk').value, mid = +$('#jm').value, gid = $('#jg').value, hari = +$('#jh').value, a = $('#ja').value, b = $('#jb').value;
  if (!kid || !mid || !gid || !a || !b) return toast('Lengkapi mapel, guru, dan jam', 1);
  if (b <= a) return toast('Jam selesai harus setelah jam mulai', 1);
  const { data: j } = await sb.from('jadwal').select('id,jam_mulai,jam_selesai,pengampu(kelas_id,guru_id)').eq('hari', hari);
  if (j.find(x => x.jam_mulai.slice(0, 5) < b && a < x.jam_selesai.slice(0, 5) && (x.pengampu?.kelas_id === kid || x.pengampu?.guru_id === gid)))
    return toast('Bentrok dengan jadwal lain (kelas atau guru yang sama pada jam itu)', 1);
  const { data: pg } = await sb.from('pengampu').select('id').eq('kelas_id', kid).eq('mapel_id', mid).eq('guru_id', gid);
  let pid = pg[0]?.id;
  if (!pid) { const r = await sb.from('pengampu').insert({ kelas_id: kid, mapel_id: mid, guru_id: gid }).select('id'); if (r.error) return toast(r.error.message, 1); pid = r.data[0].id; }
  tambah('jadwal', { pengampu_id: pid, hari, jam_mulai: a, jam_selesai: b, ruang: $('#jr').value.trim() || null }, 'Jam pelajaran ditambahkan');
}
async function hapusJadwal(id) {
  if (!confirm('Hapus jam pelajaran ini?')) return;
  const { error } = await sb.from('jadwal').delete().eq('id', id);
  if (error) return toast(error.message, 1);
  toast('Dihapus'); go('jadwal');
}

/* ===== izin / sakit ===== */
function vIzin() { return me.role === 'ortu' ? vIzinOrtu() : vIzinGuru(); }
const STIZ = { menunggu: '<span class="stamp warn">Menunggu</span>', disetujui: '<span class="stamp ok">Disetujui</span>', ditolak: '<span class="stamp bad">Ditolak</span>' };
async function vIzinOrtu() {
  const [s, iz] = await Promise.all([sb.from('siswa').select('id,nama'), sb.from('izin').select('*,siswa(nama)').order('created_at', { ascending: false })]);
  const hari = new Date().toLocaleDateString('sv-SE');
  $('#main').innerHTML = head('Izin', 'Izin atau sakit', 'Ajukan izin atau sakit untuk anak Anda. Guru akan menyetujui, dan absensi anak otomatis diperbarui.') +
    (s.data.length ? `<div class="sec"><h2>Ajukan baru</h2>
    <label>Anak</label><select id="zs">${opt(s.data, 'id', 'nama')}</select>
    <label>Jenis</label><select id="zj"><option value="sakit">Sakit</option><option value="izin">Izin</option></select>
    <label>Tanggal mulai</label><input id="zm" type="date" value="${hari}"><label>Tanggal selesai (kosongkan jika satu hari)</label><input id="ze" type="date">
    <label>Alasan</label><textarea id="za" rows="3" placeholder="Contoh: demam dan dokter menyarankan istirahat"></textarea>
    <label>Foto surat (boleh kosong)</label><input id="zf" type="file" accept="image/*"><button class="btn" onclick="ajukanIzin()">Kirim pengajuan</button></div>` : '<div class="sec"><p class="mut" style="margin:0">Akun ini belum dihubungkan dengan data anak. Hubungi admin sekolah.</p></div>') +
    `<div class="sec"><h2>Riwayat pengajuan</h2>${iz.data.map(x => `<div class="row"><span><b>${h(x.siswa?.nama)}</b> - ${x.jenis}<br><small>${rentang({ tanggal: x.tanggal_mulai, tanggal_selesai: x.tanggal_selesai })}</small>${x.catatan_guru ? `<br><small>Catatan guru: ${h(x.catatan_guru)}</small>` : ''}</span>${STIZ[x.status] || ''}</div>`).join('') || '<p class="mut" style="margin:0">Belum ada pengajuan.</p>'}</div>`;
}
async function ajukanIzin() {
  const o = { siswa_id: +$('#zs').value, jenis: $('#zj').value, tanggal_mulai: $('#zm').value, tanggal_selesai: $('#ze').value || $('#zm').value, alasan: $('#za').value.trim() }, ada = $('#zf').files?.[0];
  if (!o.siswa_id || !o.tanggal_mulai || !o.alasan) return toast('Isi anak, tanggal, dan alasan', 1);
  if (o.tanggal_selesai < o.tanggal_mulai) return toast('Tanggal selesai tidak boleh sebelum tanggal mulai', 1);
  try { if (ada) { toast('Mengunggah foto...'); o.foto_path = await unggahFoto('#zf', 'izin'); } } catch (e) { return toast(e.message || 'Foto gagal diunggah', 1); }
  tambah('izin', o, 'Pengajuan terkirim. Guru akan memberi tahu hasilnya.');
}
async function vIzinGuru() {
  const iz = await sb.from('izin').select('*,siswa(nama,kelas_id)').order('created_at', { ascending: false });
  const tunggu = iz.data.filter(x => x.status === 'menunggu'), lain = iz.data.filter(x => x.status !== 'menunggu').slice(0, 15);
  $('#main').innerHTML = head('Izin', 'Izin dan sakit siswa', 'Periksa pengajuan dari orang tua. Jika disetujui, absensi siswa pada tanggal itu otomatis menjadi izin atau sakit.') +
    `<div class="sec"><h2>Menunggu keputusan (${tunggu.length})</h2>${tunggu.map(x => `<div style="padding:12px 0;border-bottom:1px solid var(--line)"><b>${h(x.siswa?.nama)}</b> <span class="stamp no">${x.jenis}</span><br><small>${rentang({ tanggal: x.tanggal_mulai, tanggal_selesai: x.tanggal_selesai })}</small>
    <p style="margin:6px 0 0">${h(x.alasan)}</p>${x.foto_path ? `<img class="foto" data-p="${h(x.foto_path)}" alt="Foto surat" onclick="window.open(this.src)">` : ''}
    <input id="zc${x.id}" placeholder="Catatan untuk orang tua (boleh kosong)" style="margin-top:8px">
    <div style="display:flex;gap:8px;margin-top:8px"><button class="btn sm" onclick="putuskanIzin(${x.id},true)">Setujui</button><button class="btn alt sm" onclick="putuskanIzin(${x.id},false)">Tolak</button></div></div>`).join('') || '<p class="mut" style="margin:0">Tidak ada pengajuan yang menunggu.</p>'}</div>
    <div class="sec"><h2>Keputusan terbaru</h2>${lain.map(x => `<div class="row"><span>${h(x.siswa?.nama)} - ${x.jenis}<br><small>${rentang({ tanggal: x.tanggal_mulai, tanggal_selesai: x.tanggal_selesai })}</small></span>${STIZ[x.status] || ''}</div>`).join('') || '<p class="mut" style="margin:0">Belum ada.</p>'}</div>`;
  muatFoto();
}
function tanggalRentang(a, b) {
  const out = [], d = new Date(a + 'T00:00:00'), e = new Date(b + 'T00:00:00');
  for (; d <= e && out.length < 31; d.setDate(d.getDate() + 1)) if (d.getDay() !== 0) out.push(d.toLocaleDateString('sv-SE'));
  return out;
}
async function putuskanIzin(id, ok) {
  const { data: z } = await sb.from('izin').select('*').eq('id', id).single();
  const { error } = await sb.from('izin').update({ status: ok ? 'disetujui' : 'ditolak', catatan_guru: $('#zc' + id).value.trim() || null, diputuskan_oleh: me.id }).eq('id', id);
  if (error) return toast(error.message, 1);
  if (ok) {
    const rows = tanggalRentang(z.tanggal_mulai, z.tanggal_selesai).map(t => ({ siswa_id: z.siswa_id, tanggal: t, status: z.jenis, sumber: 'izin', terverifikasi: true, dicatat_oleh: me.id }));
    if (rows.length) await sb.from('absensi').upsert(rows, { onConflict: 'siswa_id,tanggal' });
  }
  toast(ok ? 'Disetujui. Absensi diperbarui.' : 'Ditolak. Orang tua diberi tahu.'); vIzinGuru();
}

/* ===== pengumuman dan agenda ===== */
async function vInfo() {
  const adm = me.role === 'admin', hari = new Date().toLocaleDateString('sv-SE');
  const [p, k] = await Promise.all([sb.from('pengumuman').select('*').order('created_at', { ascending: false }), sb.from('kegiatan').select('*').order('tanggal')]);
  const depan = k.data.filter(x => (x.tanggal_selesai || x.tanggal) >= hari);
  const hps = (t, id) => adm ? `<button class="btn alt sm" style="margin-top:4px" onclick="hapusInfo('${t}',${id})">Hapus</button>` : '';
  $('#main').innerHTML = head('Info', 'Pengumuman dan agenda', adm ? 'Pengumuman dan agenda baru langsung diberitahukan ke semua pengguna.' : 'Kabar dan kalender kegiatan sekolah.') +
    `<div class="sec"><h2>Agenda mendatang</h2>${depan.map(x => `<div class="row"><span><b>${h(x.judul)}</b><br><small>${rentang(x)}${x.keterangan ? ' - ' + h(x.keterangan) : ''}</small></span>${hps('kegiatan', x.id)}</div>`).join('') || '<p class="mut" style="margin:0">Belum ada agenda.</p>'}</div>
    <div class="sec"><h2>Pengumuman</h2>${p.data.map(x => `<div style="padding:10px 0;border-bottom:1px solid var(--line)"><b>${h(x.judul)}</b> ${x.penting ? '<span class="stamp warn">Penting</span>' : ''}<br><small>${tgl(x.created_at)}</small><p style="margin:4px 0 0">${h(x.isi || '')}</p>${hps('pengumuman', x.id)}</div>`).join('') || '<p class="mut" style="margin:0">Belum ada pengumuman.</p>'}</div>` +
    (adm ? `<div class="sec"><h2>Buat pengumuman</h2><label>Judul</label><input id="uj"><label>Isi</label><textarea id="ui" rows="3"></textarea>
    <label style="display:flex;gap:8px;align-items:center;font-weight:500"><input type="checkbox" id="up" style="width:auto"> Tandai penting</label><button class="btn" onclick="addPengumuman()">Kirim ke semua</button></div>
    <div class="sec"><h2>Tambah agenda</h2><label>Nama kegiatan</label><input id="gj"><label>Tanggal mulai</label><input id="gm" type="date"><label>Tanggal selesai (boleh kosong)</label><input id="gs" type="date">
    <label>Keterangan (boleh kosong)</label><input id="gk"><button class="btn" onclick="addKegiatan()">Tambah agenda</button></div>` : '');
}
function addPengumuman() {
  const o = { judul: $('#uj').value.trim(), isi: $('#ui').value.trim(), penting: !!$('#up').checked };
  o.judul ? tambah('pengumuman', o, 'Pengumuman terkirim ke semua pengguna.') : toast('Isi judul pengumuman', 1);
}
function addKegiatan() {
  const o = { judul: $('#gj').value.trim(), tanggal: $('#gm').value, tanggal_selesai: $('#gs').value || null, keterangan: $('#gk').value.trim() || null };
  if (!o.judul || !o.tanggal) return toast('Isi nama kegiatan dan tanggal mulai', 1);
  if (o.tanggal_selesai && o.tanggal_selesai < o.tanggal) return toast('Tanggal selesai tidak boleh sebelum tanggal mulai', 1);
  tambah('kegiatan', o, 'Agenda ditambahkan');
}
async function hapusInfo(t, id) {
  if (!confirm('Hapus item ini?')) return;
  const { error } = await sb.from(t).delete().eq('id', id);
  if (error) return toast(error.message, 1);
  toast('Dihapus'); go('info');
}
async function bagianInfo() {
  const hari = new Date().toLocaleDateString('sv-SE');
  const [p, k] = await Promise.all([sb.from('pengumuman').select('*').order('created_at', { ascending: false }).limit(1), sb.from('kegiatan').select('*').order('tanggal')]);
  const depan = k.data.filter(x => (x.tanggal_selesai || x.tanggal) >= hari).slice(0, 2);
  if (!p.data.length && !depan.length) return '';
  return `<div class="sec"><h2>Info sekolah</h2>${p.data.map(x => `<div class="row"><span><b>${h(x.judul)}</b><br><small>${h((x.isi || '').slice(0, 90))}</small></span></div>`).join('')}${depan.map(x => `<div class="row"><span>${h(x.judul)}<br><small>${rentang(x)}</small></span></div>`).join('')}
  <button class="btn alt sm" style="margin-top:8px" onclick="go('info')">Lihat semua</button></div>`;
}

/* ===== pesan guru dan orang tua ===== */
async function vPesan() {
  const [m, d] = await Promise.all([sb.from('pesan').select('*').order('created_at', { ascending: false }), sb.from('v_direktori').select('id,nama,role')]);
  const nama = Object.fromEntries(d.data.map(x => [x.id, x.nama])), t = {};
  m.data.forEach(x => { const l = x.dari === me.id ? x.kepada : x.dari; t[l] ??= { id: l, terakhir: x, baru: 0 }; if (x.kepada === me.id && !x.dibaca) t[l].baru++; });
  let pil;
  if (me.role === 'ortu') pil = d.data.filter(x => x.role === 'guru').map(x => `<option value="${x.id}">${h(x.nama)}</option>`).join('');
  else { const os = await sb.from('ortu_siswa').select('ortu_id,siswa(nama)'); pil = os.data.filter(x => nama[x.ortu_id]).map(x => `<option value="${x.ortu_id}">${h(nama[x.ortu_id])} - orang tua ${h(x.siswa?.nama)}</option>`).join(''); }
  $('#main').innerHTML = head('Pesan', me.role === 'ortu' ? 'Pesan ke guru' : 'Pesan ke orang tua', 'Percakapan pribadi antara guru dan orang tua. Penerima mendapat notifikasi.') +
    `<div class="sec"><h2>Percakapan</h2>${Object.values(t).map(c => `<div class="row" style="cursor:pointer" onclick="bukaPesan('${c.id}')"><span><b>${h(nama[c.id] || 'Pengguna')}</b>${c.baru ? ` <span class="stamp warn">${c.baru} baru</span>` : ''}<br><small>${h(String(c.terakhir.isi).slice(0, 70))}</small></span><small>${waktu(c.terakhir.created_at)}</small></div>`).join('') || '<p class="mut" style="margin:0">Belum ada percakapan.</p>'}</div>
    <div id="pc"></div>
    <div class="sec"><h2>Pesan baru</h2><label style="margin-top:0">Kepada</label><select id="pu">${pil}</select><button class="btn" onclick="bukaPesan($('#pu').value)">Tulis pesan</button></div>`;
}
async function bukaPesan(uid) {
  if (!uid) return toast('Pilih penerima dulu', 1);
  const [m, d] = await Promise.all([sb.from('pesan').select('*').order('created_at'), sb.from('v_direktori').select('id,nama')]);
  const lawan = d.data.find(x => x.id === uid), isi = m.data.filter(x => x.dari === uid || x.kepada === uid);
  await sb.from('pesan').update({ dibaca: true }).eq('kepada', me.id).eq('dari', uid).eq('dibaca', false);
  segarkanBadge();
  $('#pc').innerHTML = `<div class="sec"><h2>${h(lawan?.nama || 'Percakapan')}</h2>
  ${isi.map(x => { const sy = x.dari === me.id; return `<div style="display:flex;justify-content:${sy ? 'flex-end' : 'flex-start'};margin:6px 0"><div style="max-width:80%;padding:8px 12px;border-radius:12px;${sy ? 'background:var(--g);color:#fff' : 'background:#eef1f6'}">${h(x.isi)}<br><small style="color:inherit;opacity:.7">${waktu(x.created_at)}</small></div></div>`; }).join('') || '<p class="mut">Belum ada pesan. Tulis yang pertama.</p>'}
  <textarea id="pi" rows="2" placeholder="Tulis pesan"></textarea><button class="btn" onclick="kirimPesan('${uid}')">Kirim</button></div>`;
  $('#pc').scrollIntoView();
}
async function kirimPesan(uid) {
  const t = $('#pi').value.trim();
  if (!t) return toast('Tulis pesan dulu', 1);
  const { error } = await sb.from('pesan').insert({ kepada: uid, isi: t });
  if (error) return toast(error.message, 1);
  bukaPesan(uid);
}

/* ===== impor siswa ===== */
let IMPOR = null, IMPOR_HASIL = [];
function parseCsv(t) {
  t = String(t || '').replace(/^\ufeff/, '').trim();
  if (!t) return [];
  const f = t.split(/\r?\n/)[0], sep = f.includes(';') ? ';' : f.includes('\t') ? '\t' : ',';
  const out = []; let row = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); out.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  row.push(cell); out.push(row);
  return out.filter(r => r.some(x => String(x).trim()));
}
async function vImpor() {
  IMPOR = null; IMPOR_HASIL = [];
  const { data: kl } = await sb.from('kelas').select('nama').order('nama');
  $('#main').innerHTML = head('Impor', 'Impor siswa dari Excel', 'Unggah file Excel (.xlsx) atau CSV, termasuk lembar Data Siswa dari e-Rapor. Judul kolom dicari otomatis. Data diperiksa dulu sebelum disimpan. NIS yang sudah ada akan diperbarui.') +
    `<div class="sec"><label style="margin-top:0">File Excel atau CSV</label><input id="if" type="file" accept=".xlsx,.xls,.csv,text/csv" onchange="pilihFileImpor()">
    <label>Atau tempel data di sini</label><textarea id="it" rows="5" oninput="IMPOR=null" placeholder="NIS;Nama;Jenjang/Kelas;Wali;HP"></textarea>
    <label>Kelas untuk semua siswa di file (isi jika file tidak punya kolom kelas)</label><input id="ik" list="dlKelasImpor" placeholder="Contoh: 5A"><datalist id="dlKelasImpor">${(kl || []).map(x => `<option value="${h(x.nama)}">`).join('')}</datalist>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn" style="margin:0" onclick="periksaImpor()">Periksa data</button><button class="btn alt" style="margin:0" onclick="contohImpor()">Unduh format Excel</button></div>
    <p class="hint" style="margin:10px 0 0">Wajib: NIS (atau NISN) dan Nama. Kolom lain boleh dilewati: Jenjang/Kelas, NISN, L/P, Tempat Lahir, Tanggal Lahir, Agama, Pendidikan Sebelumnya, Alamat, Nama Ayah, Nama Ibu, Pekerjaan Ayah, Pekerjaan Ibu, Wali, HP. Isian kosong di file tidak menghapus data lama.</p></div><div id="ip"></div>`;
}
async function contohImpor() {
  const kepala = ['NIS', 'NISN', 'Nama', 'L/P', 'Jenjang/Kelas', 'Tempat Lahir', 'Tanggal Lahir', 'Agama', 'Pendidikan Sebelumnya', 'Alamat', 'Kelurahan/Desa', 'Kecamatan', 'Nama Ayah', 'Nama Ibu', 'Pekerjaan Ayah', 'Pekerjaan Ibu', 'Wali', 'HP'];
  try {
    await muatSkrip(SHEETJS);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([kepala]), 'Siswa');
    simpanBerkas(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/octet-stream' }), 'format-impor-siswa.xlsx');
  } catch { simpanBerkas(new Blob(['\ufeff' + kepala.join(';') + '\r\n'], { type: 'text/csv' }), 'format-impor-siswa.csv'); }
}
async function pilihFileImpor() {
  const f = $('#if').files?.[0];
  if (!f) return;
  try {
    if (/\.xlsx?$/i.test(f.name)) { await muatSkrip(SHEETJS); const wb = XLSX.read(await f.arrayBuffer(), { cellDates: true }); IMPOR = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, dateNF: 'yyyy-mm-dd', defval: '' }); }
    else IMPOR = parseCsv(await f.text());
    periksaImpor();
  } catch (e) { toast(e.message || 'File tidak bisa dibaca', 1); }
}
const ALIAS_IMPOR = {
  nis: ['nis', 'nomor induk', 'no induk'],
  nama: ['nama', 'nama siswa', 'nama lengkap', 'nama peserta didik'],
  kelas: ['jenjang/kelas', 'jenjang / kelas', 'kelas', 'jenjang', 'rombel', 'kelas/jenjang'],
  wali: ['wali', 'nama wali', 'wali murid', 'nama wali murid'],
  hp: ['hp', 'no hp', 'no. hp', 'nomor hp', 'no telp', 'telepon', 'no wa', 'wa', 'whatsapp', 'hp wali', 'hp orang tua']
};
const ALIAS_EXTRA = {
  nisn: ['nisn'], jenis_kelamin: ['l/p', 'jk', 'jenis kelamin', 'lp', 'kelamin'], tempat_lahir: ['tempat lahir', 'tempat'], tanggal_lahir: ['tanggal lahir', 'tgl lahir'],
  agama: ['agama'], anak_ke: ['anak ke', 'anak ke-', 'anak ke -'], pendidikan_sebelumnya: ['pendidikan sebelumnya', 'asal sekolah', 'sekolah asal', 'tk/paud', 'pendidikan sebelumnya (tk/paud/sd)'],
  tgl_masuk: ['tanggal masuk', 'diterima di sekolah ini', 'tgl masuk'], alamat: ['alamat', 'alamat peserta didik', 'alamat siswa'], kelurahan: ['kelurahan', 'desa', 'kelurahan/desa', 'desa/kelurahan'], kecamatan: ['kecamatan'],
  nama_ayah: ['nama ayah', 'ayah'], pekerjaan_ayah: ['pekerjaan ayah'], nama_ibu: ['nama ibu', 'ibu'], pekerjaan_ibu: ['pekerjaan ibu'],
  alamat_ortu: ['alamat orang tua', 'alamat ortu'], kelurahan_ortu: ['kelurahan orang tua', 'kelurahan/desa (ortu)', 'kelurahan ortu'], kecamatan_ortu: ['kecamatan orang tua', 'kecamatan (ortu)', 'kecamatan ortu'], pekerjaan_wali: ['pekerjaan wali']
};
const LABEL_EXTRA = { tanggal_lahir: 'tanggal lahir', tgl_masuk: 'tanggal masuk', jenis_kelamin: 'L/P', anak_ke: 'anak ke' };
function bacaExtra(r, ixe) {
  const ex = {}, salah = [];
  Object.entries(ixe).forEach(([k, i]) => {
    if (i < 0) return;
    const mentah = r[i], j = KOLOM_JENIS[k] || 't';
    if (!String(mentah instanceof Date ? 'x' : mentah ?? '').trim()) return;
    let v;
    if (j === 'd') v = tglIso(mentah);
    else if (j === 'jk') v = normJk(mentah);
    else if (j === 'n') { const n = parseInt(mentah); v = n > 0 ? n : null; }
    else v = String(mentah).trim();
    if (v === null) salah.push(LABEL_EXTRA[k] || k); else if (v !== '') ex[k] = v;
  });
  return { ex, salah };
}
async function periksaImpor() {
  const semua = IMPOR || parseCsv($('#it').value);
  const norm = x => String(x ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  // judul kolom dicari di 8 baris pertama (lembar e-Rapor punya baris judul bertingkat)
  let hi = semua.findIndex((r, i) => i < 8 && r.some(x => ALIAS_IMPOR.nama.includes(norm(x))) && r.some(x => ALIAS_IMPOR.nis.includes(norm(x)) || ALIAS_EXTRA.nisn.includes(norm(x))));
  if (hi < 0) hi = 0;
  const rows = semua.slice(hi);
  if (rows.length < 2) return toast('Belum ada data. Unggah file atau tempel data dulu. Harus ada baris judul kolom.', 1);
  const hd = rows[0].map(norm);
  let ix = {};
  Object.entries(ALIAS_IMPOR).forEach(([k, al]) => { ix[k] = hd.findIndex(x => al.includes(x)); });
  const ixe = Object.fromEntries(Object.entries(ALIAS_EXTRA).map(([k, al]) => [k, hd.findIndex(x => al.includes(x))]));
  if (ix.nis < 0 && ixe.nisn >= 0) ix.nis = ixe.nisn;                       // hanya ada NISN: dipakai sebagai nomor induk
  const jalan = hd.indexOf('jalan');
  if (jalan >= 0 && ixe.alamat_ortu < 0) { ixe.alamat_ortu = jalan; ixe.kelurahan_ortu = ixe.kelurahan; ixe.kecamatan_ortu = ixe.kecamatan; ixe.kelurahan = -1; ixe.kecamatan = -1; }   // blok "Orang Tua" di e-Rapor
  const kelasSemua = ($('#ik').value || '').trim().replace(/^kelas\s+/i, '').replace(/\s+/g, '');
  if (ix.nis < 0 && ix.nama < 0 && ix.kelas < 0) ix = { nis: 0, nama: 1, kelas: 2, wali: hd.length > 3 ? 3 : -1, hp: hd.length > 4 ? 4 : -1 };   // judul tidak dikenali: urutan standar
  if (ix.nis < 0 || ix.nama < 0) return toast('Judul kolom harus memuat NIS (atau NISN) dan Nama', 1);
  if (ix.kelas < 0 && !kelasSemua) return toast('File ini tidak punya kolom kelas. Isi kolom "Kelas untuk semua siswa di file" di atas.', 1);
  const [k, s] = await Promise.all([sb.from('kelas').select('id,nama'), ambil(() => sb.from('siswa').select('nis,nama_wali,hp_wali,' + KOLOM_EXTRA.join(',')).order('id'))]);
  const kk = Object.fromEntries(k.data.map(x => [x.nama.toLowerCase(), x.id])), ada = Object.fromEntries(s.map(x => [String(x.nis), x])), lihat = new Set();
  const sel = (r, i) => i < 0 ? '' : String(r[i] ?? '').trim();
  IMPOR_HASIL = rows.slice(1).map((r, i) => {
    const nis = sel(r, ix.nis), nama = sel(r, ix.nama), kelas = (ix.kelas < 0 ? kelasSemua : sel(r, ix.kelas).replace(/^kelas\s+/i, '').replace(/\s+/g, '')), wali = sel(r, ix.wali), hpMentah = sel(r, ix.hp), hp = nomorWa(hpMentah);
    const masalah = (!nis && !nama) || /^\d{1,3}$/.test(nama) ? 'kosong' : !nis || !nama ? 'NIS atau nama kosong' : !kelas ? 'Kelas kosong' : lihat.has(nis) ? 'NIS ganda di file' : null;
    if (nis) lihat.add(nis);
    const { ex, salah } = bacaExtra(r, ixe);
    return { baris: hi + i + 2, nis, nama, kelas, wali, hp: hp && hpValid(hp) ? hp : '', hpSalah: !!hpMentah && !hpValid(hp), ex, salah, masalah, baru: !ada[nis], lama: ada[nis], kelasBaru: !!kelas && !kk[kelas.toLowerCase()] };
  }).filter(x => x.masalah !== 'kosong');
  const ok = IMPOR_HASIL.filter(x => !x.masalah), salah = IMPOR_HASIL.filter(x => x.masalah), kb = [...new Set(ok.filter(x => x.kelasBaru).map(x => x.kelas))], hpSalah = ok.filter(x => x.hpSalah), extraSalah = ok.filter(x => x.salah.length);
  const nExtra = Object.values(ixe).filter(i => i >= 0).length;
  $('#ip').innerHTML = `<div class="sec"><h2>Hasil pemeriksaan</h2>
  <div class="stats"><div class="stat"><span class="num">${ok.filter(x => x.baru).length}</span><small>Siswa baru</small></div><div class="stat"><span class="num">${ok.filter(x => !x.baru).length}</span><small>Diperbarui</small></div><div class="stat"><span class="num">${salah.length}</span><small>Bermasalah</small></div></div>
  ${nExtra ? `<p class="hint" style="margin-top:8px">${nExtra} kolom data diri tambahan ikut dibaca (tanggal lahir, alamat, orang tua, dan lainnya).</p>` : ''}
  ${kb.length ? `<p class="hint" style="margin-top:8px">Kelas baru akan dibuat: ${kb.map(h).join(', ')}</p>` : ''}
  ${hpSalah.length ? `<p class="hint" style="margin-top:8px">${hpSalah.length} nomor HP tidak valid dan tidak akan disimpan (baris ${hpSalah.slice(0, 8).map(x => x.baris).join(', ')}${hpSalah.length > 8 ? ', ...' : ''}).</p>` : ''}
  ${extraSalah.length ? `<p class="hint" style="margin-top:8px">${extraSalah.length} baris punya isian yang tidak dikenali dan dilewati: ${extraSalah.slice(0, 5).map(x => `baris ${x.baris} (${[...new Set(x.salah)].join(', ')})`).join('; ')}${extraSalah.length > 5 ? ', ...' : ''}. Tanggal sebaiknya ditulis 15/08/2015 atau 2015-08-15.</p>` : ''}
  ${salah.length ? `<h3 class="sub">Baris bermasalah (dilewati)</h3>${salah.slice(0, 20).map(x => `<div class="row"><span>Baris ${x.baris}: ${h(x.nama || '-')}</span><span class="stamp bad">${x.masalah}</span></div>`).join('')}` : ''}
  ${ok.length ? `<h3 class="sub">Contoh data yang akan disimpan</h3>${ok.slice(0, 8).map(x => `<div class="row"><span>${h(x.nama)}<br><small>NIS ${h(x.nis)}${x.ex.tanggal_lahir ? ' - lahir ' + tglPanjang(x.ex.tanggal_lahir) : ''}${x.ex.nama_ayah || x.ex.nama_ibu ? ' - ortu: ' + h([x.ex.nama_ayah, x.ex.nama_ibu].filter(Boolean).join(' & ')) : ''}<br>Wali: ${h(x.wali || x.lama?.nama_wali || '-')} - ${h(tampilHp(x.hp || x.lama?.hp_wali))}</small></span><span class="stamp no">${h(x.kelas)}</span></div>`).join('')}<button class="btn" onclick="jalankanImpor()">Impor ${ok.length} siswa</button>` : ''}</div>`;
}
async function jalankanImpor() {
  const ok = IMPOR_HASIL.filter(x => !x.masalah);
  if (!ok.length) return toast('Tidak ada baris yang valid', 1);
  const kb = [...new Set(ok.filter(x => x.kelasBaru).map(x => x.kelas))];
  if (kb.length) { const { error } = await sb.from('kelas').insert(kb.map(n => ({ nama: n, tingkat: tingkatDari(n) }))); if (error) return toast(error.message, 1); }
  const { data: k } = await sb.from('kelas').select('id,nama');
  const kk = Object.fromEntries(k.map(x => [x.nama.toLowerCase(), x.id]));
  const rows = ok.map(x => {
    const o = { nis: x.nis, nama: x.nama, kelas_id: kk[x.kelas.toLowerCase()], hp_wali: x.hp || x.lama?.hp_wali || null };
    KOLOM_EXTRA.forEach(f => { o[f] = (f === 'nama_wali' ? x.wali : x.ex[f]) || x.lama?.[f] || null; });   // isian kosong di file tidak menghapus data lama
    return o;
  });
  for (let i = 0; i < rows.length; i += 200) { const { error } = await sb.from('siswa').upsert(rows.slice(i, i + 200), { onConflict: 'nis' }); if (error) return toast(error.message, 1); }
  toast(`${rows.length} siswa diimpor`); vImpor();
}

/* ===== rekap absensi bulanan ===== */
async function vRekap() {
  const k = await sb.from('kelas').select('*').order('nama');
  $('#main').innerHTML = head('Rekap', 'Rekap absensi bulanan', 'Pilih kelas dan bulan. Hasilnya bisa diunduh ke Excel.') +
    `<div class="sec"><label style="margin-top:0">Kelas</label><select id="rkk" onchange="muatRekap()">${opt(k.data, 'id', 'nama')}</select>
    <label>Bulan</label><input id="rkb" type="month" value="${new Date().toLocaleDateString('sv-SE').slice(0, 7)}" onchange="muatRekap()">
    <button class="btn" onclick="unduhRekap()">Unduh Excel</button></div><div id="rkh"></div>`;
  muatRekap();
}
async function dataRekap() {
  const kid = +$('#rkk').value, bl = $('#rkb').value;
  if (!kid || !bl) return null;
  const [y, m] = bl.split('-').map(Number), n = new Date(y, m, 0).getDate(), a = `${bl}-01`, b = `${bl}-${String(n).padStart(2, '0')}`;
  const [s, ab, kl] = await Promise.all([
    sb.from('siswa').select('id,nis,nama').eq('kelas_id', kid).order('nama'),
    sb.from('absensi').select('siswa_id,tanggal,status,terverifikasi').gte('tanggal', a).lte('tanggal', b),
    sb.from('kelas').select('nama').eq('id', kid).single()
  ]);
  const idm = {};
  ab.data.filter(x => x.terverifikasi !== false).forEach(x => (idm[x.siswa_id] ??= {})[+x.tanggal.slice(8, 10)] = x.status);
  const baris = s.data.map(x => { const d = idm[x.id] || {}, c = { hadir: 0, izin: 0, sakit: 0, alpa: 0 }; Object.values(d).forEach(v => c[v]++); const tot = c.hadir + c.izin + c.sakit + c.alpa; return { s: x, d, c, pct: tot ? Math.round(c.hadir / tot * 100) : null }; });
  return { kelas: kl.data?.nama, bl, n, baris, pt: { hadir: 'H', izin: 'I', sakit: 'S', alpa: 'A' }, nama: new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }) };
}
async function muatRekap() {
  const r = await dataRekap();
  if (!r) return;
  $('#rkh').innerHTML = r.baris.length
    ? `<div class="sec"><h2>Kelas ${h(r.kelas)} - ${r.nama}</h2><p class="hint">H hadir, I izin, S sakit, A alpa. Hanya absensi yang sudah terverifikasi yang dihitung.</p><div style="overflow-x:auto"><table class="tb"><tr><th>Nama</th>${Array.from({ length: r.n }, (_, i) => `<th>${i + 1}</th>`).join('')}<th>H</th><th>I</th><th>S</th><th>A</th><th>%</th></tr>
    ${r.baris.map(x => `<tr><td style="white-space:nowrap">${h(x.s.nama)}</td>${Array.from({ length: r.n }, (_, j) => `<td>${r.pt[x.d[j + 1]] || ''}</td>`).join('')}<td>${x.c.hadir}</td><td>${x.c.izin}</td><td>${x.c.sakit}</td><td>${x.c.alpa}</td><td>${x.pct ?? '-'}</td></tr>`).join('')}</table></div></div>`
    : '<div class="sec"><p class="mut" style="margin:0">Belum ada siswa di kelas ini.</p></div>';
}
async function unduhRekap() {
  const r = await dataRekap();
  if (!r || !r.baris.length) return toast('Tidak ada data untuk diunduh', 1);
  const kepala = ['No', 'NIS', 'Nama', ...Array.from({ length: r.n }, (_, i) => i + 1), 'H', 'I', 'S', 'A', '% hadir'];
  const aoa = [[`Rekap absensi kelas ${r.kelas} - ${r.nama}`], [], kepala, ...r.baris.map((x, i) => [i + 1, x.s.nis, x.s.nama, ...Array.from({ length: r.n }, (_, j) => r.pt[x.d[j + 1]] || ''), x.c.hadir, x.c.izin, x.c.sakit, x.c.alpa, x.pct ?? ''])];
  const nama = `Rekap-absensi-${r.kelas}-${r.bl}`;
  try {
    await muatSkrip(SHEETJS);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Rekap');
    simpanBerkas(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/octet-stream' }), nama + '.xlsx'); toast('File Excel diunduh');
  } catch {
    simpanBerkas(new Blob(['\ufeff' + aoa.map(x => x.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n')], { type: 'text/csv' }), nama + '.csv');
    toast('Pustaka Excel tidak bisa dimuat, file CSV diunduh. Excel bisa membukanya.');
  }
}

/* ===== log, backup, kunci push ===== */
const LABEL_TABEL = { siswa: 'siswa', profiles: 'akun', kelas: 'kelas', mapel: 'mapel', tahun_ajaran: 'semester', nilai: 'nilai', absensi: 'absensi', raport: 'raport', tugas: 'tugas', pengumuman: 'pengumuman', kegiatan: 'agenda', izin: 'izin', jadwal: 'jadwal' };
const AKSI = { INSERT: 'Menambah', UPDATE: 'Mengubah', DELETE: 'Menghapus' };
function vSistem() {
  $('#main').innerHTML = head('Admin', 'Log dan backup', 'Riwayat perubahan data, cadangan data, dan alat untuk notifikasi layar kunci.') +
    `<div class="sec"><h2>Cadangan data</h2><p class="hint">Mengunduh semua data penting ke satu file. Foto di penyimpanan tidak ikut. Simpan file ini di tempat aman karena berisi data siswa.</p><button class="btn" onclick="unduhBackup()">Unduh backup (JSON)</button></div>
    <div class="sec"><h2>Pulihkan dari backup</h2><p class="hint">Pilih file backup (.json). Data dengan nomor yang sama akan ditimpa, data lain dibiarkan. Akun pengguna tidak ikut dipulihkan, jadi buat ulang akun jika memakai project baru. Lakukan di luar jam sekolah.</p>
    <input id="pf" type="file" accept=".json,application/json" onchange="bacaBackup()"><div id="pfh"></div></div>
    <div class="sec"><h2>Riwayat aktivitas</h2><label style="margin-top:0">Tampilkan</label><select id="lg" onchange="muatLog()"><option value="">Semua data</option>${Object.entries(LABEL_TABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select><div id="lgh"></div></div>
    <div class="sec"><h2>Kunci notifikasi layar kunci</h2><p class="hint">Dibuat sekali saat pemasangan. Kunci publik dipasang di file portal, kunci rahasia disimpan di Supabase. Jangan bagikan kunci rahasia.</p><button class="btn alt" onclick="buatKunciPush()">Buat kunci</button><div id="kp"></div></div>`;
  muatLog();
}
function ringkas(d) { d = d || {}; const t = d.nama ?? d.judul ?? (d.nilai != null && typeof d.nilai !== 'object' ? 'nilai ' + d.nilai : null) ?? d.status; return String(t ?? '#' + (d.id ?? '')).slice(0, 60); }
async function muatLog() {
  const t = $('#lg').value;
  let q = sb.from('log_aktivitas').select('*');
  if (t) q = q.eq('tabel', t);
  const [l, p] = await Promise.all([q.order('created_at', { ascending: false }).limit(60), sb.from('profiles').select('id,nama')]);
  const nm = Object.fromEntries(p.data.map(x => [x.id, x.nama]));
  $('#lgh').innerHTML = l.data.length ? l.data.map(x => `<div class="row"><span>${AKSI[x.aksi] || x.aksi} ${h(LABEL_TABEL[x.tabel] || x.tabel)}<br><small>${h(nm[x.user_id] || 'Sistem')} - ${h(ringkas(x.detail))}</small></span><small>${tgl(x.created_at)}</small></div>`).join('') : '<p class="mut" style="margin:8px 0 0">Belum ada aktivitas.</p>';
}
async function semua(t) {
  const out = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await sb.from(t).select('*').range(i, i + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}
async function unduhBackup() {
  try {
    toast('Mengumpulkan data...');
    const T = ['profiles', 'kelas', 'mapel', 'tahun_ajaran', 'pengaturan', 'siswa', 'ortu_siswa', 'pengampu', 'jadwal', 'absensi', 'nilai', 'tugas', 'pengumpulan_tugas', 'raport', 'raport_detail', 'izin', 'pengumuman', 'kegiatan', 'ekskul', 'nilai_ekskul', 'nilai_sikap', 'ujian', 'jadwal_ujian', 'riwayat_kelas', 'tagihan', 'pembayaran', 'kas', 'kas_saldo_awal', 'gaji', 'jurnal_mengajar', 'presensi_guru', 'log_aktivitas'];
    const dump = { dibuat: new Date().toISOString(), sekolah: SCHOOL, tabel: {} };
    for (const t of T) dump.tabel[t] = await semua(t);
    simpanBerkas(new Blob([JSON.stringify(dump)], { type: 'application/json' }), `backup-${SCHOOL.replace(/\s+/g, '-')}-${new Date().toLocaleDateString('sv-SE')}.json`);
    toast('Backup diunduh');
  } catch (e) { toast(e.message || 'Backup gagal', 1); }
}
async function buatKunciPush() {
  const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const j = await crypto.subtle.exportKey('jwk', k.privateKey);
  const pub = new Uint8Array([4, ...dariB64u(j.x), ...dariB64u(j.y)]);
  $('#kp').innerHTML = `<label>Kunci publik (VAPID_PUBLIC, tempel di file portal)</label><textarea rows="3" readonly onclick="this.select()">${b64u(pub)}</textarea>
  <label>Kunci rahasia (VAPID_PRIVATE, simpan di Supabase)</label><textarea rows="2" readonly onclick="this.select()">${j.d}</textarea>`;
}

/* ===== notifikasi layar kunci ===== */
function pushHtml() {
  const siap = typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof PushManager !== 'undefined';
  const isi = !VAPID_PUBLIC ? '<p class="hint" style="margin:0">Belum diaktifkan oleh admin sekolah.</p>'
    : !siap ? '<p class="hint" style="margin:0">Peramban ini belum mendukung. Di iPhone, tambahkan portal ke Layar Utama lewat tombol Bagikan, lalu buka dari sana.</p>'
    : '<p class="hint">Dapatkan pemberitahuan tugas, pesan, dan pengumuman di layar kunci HP, walau portal tidak dibuka.</p><button class="btn" onclick="aktifkanPush()">Aktifkan di HP ini</button>';
  return `<div class="sec"><h2>Notifikasi di layar kunci</h2>${isi}</div>`;
}
async function aktifkanPush() {
  try {
    if (await Notification.requestPermission() !== 'granted') return toast('Izin notifikasi ditolak. Ubah lewat pengaturan peramban.', 1);
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: dariB64u(VAPID_PUBLIC) });
    const j = sub.toJSON();
    const { error } = await sb.from('langganan_push').upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_id: me.id }, { onConflict: 'endpoint' });
    if (error) throw error;
    toast('Notifikasi layar kunci aktif');
  } catch (e) { toast(e.message || 'Gagal mengaktifkan', 1); }
}
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.buka && me && VIEWS[e.data.buka]) go(e.data.buka); });

/* ===== sikap dan ekstrakurikuler ===== */
const ASPEK = ['Spiritual', 'Sosial', 'Kedisiplinan'];
const PREDIKAT = ['Sangat baik', 'Baik', 'Cukup', 'Perlu ditingkatkan'];
async function bukaSikap(sid) {
  const ta = +$('#rp').value;
  const [sk, ek, mk, sw] = await Promise.all([
    sb.from('nilai_sikap').select('aspek,predikat,deskripsi').eq('siswa_id', sid).eq('tahun_ajaran_id', ta),
    sb.from('nilai_ekskul').select('ekskul_id,predikat,keterangan').eq('siswa_id', sid).eq('tahun_ajaran_id', ta),
    sb.from('ekskul').select('*').order('nama'),
    sb.from('siswa').select('nama').eq('id', sid).single()
  ]);
  const po = v => '<option value="">-</option>' + PREDIKAT.map(p => `<option ${p === v ? 'selected' : ''}>${p}</option>`).join('');
  const sm = Object.fromEntries(sk.data.map(x => [x.aspek, x]));
  $('#sk').innerHTML = `<div class="sec"><h2>Sikap dan ekstrakurikuler: ${h(sw.data?.nama)}</h2><p class="hint">Tampil di laporan dan PDF setelah raport diterbitkan. Kosongkan predikat jika tidak dinilai.</p>
  <h3 class="sub">Sikap</h3>${ASPEK.map(a => `<label>${a}</label><div style="display:flex;gap:6px"><select class="sa" data-a="${a}" style="width:auto">${po(sm[a]?.predikat)}</select><input class="sd" data-a="${a}" placeholder="Keterangan singkat (boleh kosong)" value="${h(sm[a]?.deskripsi || '')}"></div>`).join('')}
  <h3 class="sub">Ekstrakurikuler</h3>${[0, 1, 2].map(i => { const e = ek.data[i]; return `<div style="display:flex;gap:6px;margin-top:6px"><select class="ee" style="width:auto"><option value="">-</option>${mk.data.map(m => `<option value="${m.id}" ${e && e.ekskul_id === m.id ? 'selected' : ''}>${h(m.nama)}</option>`).join('')}</select><select class="ep" style="width:auto">${po(e?.predikat)}</select><input class="ek" placeholder="Keterangan" value="${h(e?.keterangan || '')}"></div>`; }).join('')}
  ${mk.data.length ? '' : '<p class="hint" style="margin-top:8px">Belum ada ekstrakurikuler. Admin menambahkannya di menu Data.</p>'}
  <button class="btn" onclick="simpanSikap(${sid})">Simpan</button></div>`;
  $('#sk').scrollIntoView();
}
async function simpanSikap(sid) {
  const ta = +$('#rp').value, sd = $$('.sd');
  const sikap = $$('.sa').map(e => ({ siswa_id: sid, tahun_ajaran_id: ta, aspek: e.dataset.a, predikat: e.value, deskripsi: ((sd.find(x => x.dataset.a === e.dataset.a) || {}).value || '').trim() || null })).filter(x => x.predikat);
  const ee = $$('.ee'), ep = $$('.ep'), ek = $$('.ek');
  const uniq = new Map(ee.map((e, i) => ({ siswa_id: sid, tahun_ajaran_id: ta, ekskul_id: +e.value, predikat: ep[i].value, keterangan: (ek[i].value || '').trim() || null })).filter(x => x.ekskul_id && x.predikat).map(x => [x.ekskul_id, x]));
  await sb.from('nilai_sikap').delete().eq('siswa_id', sid).eq('tahun_ajaran_id', ta);
  await sb.from('nilai_ekskul').delete().eq('siswa_id', sid).eq('tahun_ajaran_id', ta);
  if (sikap.length) { const { error } = await sb.from('nilai_sikap').insert(sikap); if (error) return toast(error.message, 1); }
  if (uniq.size) { const { error } = await sb.from('nilai_ekskul').insert([...uniq.values()]); if (error) return toast(error.message, 1); }
  toast('Sikap dan ekstrakurikuler tersimpan');
}

/* ===== perkembangan nilai antar semester ===== */
let GRAF = null;
async function vPerkembangan() {
  const staf = me.role === 'admin' || me.role === 'guru';
  if (staf) {
    const k = await sb.from('kelas').select('*').order('nama');
    $('#main').innerHTML = head('Perkembangan', 'Perkembangan nilai siswa', 'Bandingkan nilai akhir tiap semester untuk melihat prestasi yang naik atau turun.') +
      `<div class="sec noprint"><label style="margin-top:0">Kelas</label><select id="pkk" onchange="muatSiswaPerk()">${opt(k.data, 'id', 'nama')}</select><label>Siswa</label><select id="pks" onchange="gambarPerk()"></select></div><div id="pkh"></div>`;
    return muatSiswaPerk();
  }
  const s = await sb.from('siswa').select('id,nama').order('nama');
  if (!s.data.length) { $('#main').innerHTML = head('Perkembangan', 'Perkembangan nilai', 'Belum ada data siswa yang terhubung dengan akun ini. Hubungi admin sekolah.'); return; }
  $('#main').innerHTML = head('Perkembangan', 'Perkembangan nilai', 'Nilai akhir dari semester ke semester, dihitung dengan bobot yang sama seperti raport.') +
    `<div class="sec noprint"><label style="margin-top:0">Siswa</label><select id="pks" onchange="gambarPerk()">${opt(s.data, 'id', 'nama')}</select></div><div id="pkh"></div>`;
  gambarPerk();
}
async function muatSiswaPerk() {
  const s = await sb.from('siswa').select('id,nama').eq('kelas_id', +$('#pkk').value).eq('status', 'aktif').order('nama');
  $('#pks').innerHTML = opt(s.data, 'id', 'nama');
  gambarPerk();
}
async function dataPerk(sid) {
  await muatBobot();
  const [ta, nl, mp] = await Promise.all([sb.from('tahun_ajaran').select('*').order('id'), sb.from('nilai').select('mapel_id,jenis,nilai,tahun_ajaran_id').eq('siswa_id', sid), sb.from('mapel').select('id,nama,kkm')]);
  const g = {};
  nl.data.forEach(x => ((g[x.tahun_ajaran_id] ??= {})[x.mapel_id] ??= []).push(x));
  const semester = ta.data.filter(t => g[t.id]).map(t => {
    const per = {};
    Object.entries(g[t.id]).forEach(([mid, l]) => { const a = hitungAkhir(l, BOBOT).akhir; if (a != null) per[mid] = a; });
    const v = Object.values(per);
    return { t, per, rata: v.length ? v.reduce((u, w) => u + w, 0) / v.length : null };
  }).filter(x => x.rata != null);
  return { semester, mp: mp.data };
}
const labSmt = t => `Smt ${t.semester} ${String(t.nama).replace(/\d{2}(\d{2})\/\d{2}(\d{2})/, '$1/$2')}`;
function svgGaris(titik, kkm) {
  const W = 340, H = 190, L = 34, R = 14, T = 16, B = 36;
  const nilai = titik.map(p => p.y).concat(kkm ? [kkm] : []);
  const lo = Math.max(0, Math.floor((Math.min(...nilai) - 10) / 10) * 10), hi = 100;
  const px = i => titik.length === 1 ? (L + W - R) / 2 : Math.round((L + i * (W - L - R) / (titik.length - 1)) * 10) / 10;
  const py = v => Math.round((T + (hi - v) / (hi - lo) * (H - T - B)) * 10) / 10;
  const grid = []; for (let v = lo; v <= hi; v += 10) grid.push(v);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafik perkembangan nilai" style="width:100%;height:auto">
  ${grid.map(v => `<line x1="${L}" x2="${W - R}" y1="${py(v)}" y2="${py(v)}" stroke="#dde2ea"/><text x="${L - 6}" y="${py(v) + 4}" font-size="10" text-anchor="end" fill="#5b6578">${v}</text>`).join('')}
  ${kkm ? `<line x1="${L}" x2="${W - R}" y1="${py(kkm)}" y2="${py(kkm)}" stroke="#b42318" stroke-dasharray="4 3"/><text x="${W - R}" y="${py(kkm) - 4}" font-size="10" text-anchor="end" fill="#b42318">KKM ${kkm}</text>` : ''}
  <polyline fill="none" stroke="#1b3a6b" stroke-width="2.5" points="${titik.map((p, i) => `${px(i)},${py(p.y)}`).join(' ')}"/>
  ${titik.map((p, i) => `<circle cx="${px(i)}" cy="${py(p.y)}" r="4.5" fill="#1b3a6b"/><text x="${px(i)}" y="${py(p.y) - 9}" font-size="11" font-weight="700" text-anchor="middle" fill="#101b33">${fmt(p.y)}</text><text x="${px(i)}" y="${H - 14}" font-size="10" text-anchor="middle" fill="#5b6578">${h(p.x)}</text>`).join('')}</svg>`;
}
async function gambarPerk() {
  const sid = +$('#pks').value;
  if (!sid) { $('#pkh').innerHTML = '<div class="sec"><p class="mut" style="margin:0">Pilih siswa.</p></div>'; return; }
  GRAF = await dataPerk(sid);
  if (!GRAF.semester.length) { $('#pkh').innerHTML = '<div class="sec"><p class="mut" style="margin:0">Belum ada nilai yang bisa dibandingkan.</p></div>'; return; }
  const pakai = [...new Set(GRAF.semester.flatMap(x => Object.keys(x.per)))].map(id => GRAF.mp.find(m => m.id == id)).filter(Boolean).sort((a, b) => a.nama.localeCompare(b.nama));
  $('#pkh').innerHTML = `<div class="sec"><label style="margin-top:0">Tampilkan</label><select id="pkm" onchange="renderPerk()"><option value="">Rata-rata semua mapel</option>${pakai.map(m => `<option value="${m.id}">${h(m.nama)}</option>`).join('')}</select><div id="pkg" style="margin-top:10px"></div></div><div class="sec" id="pkt"></div>`;
  renderPerk();
}
function renderPerk() {
  const mid = $('#pkm').value, d = GRAF;
  const titik = d.semester.filter(s => !mid || s.per[mid] != null).map(s => ({ x: labSmt(s.t), y: mid ? s.per[mid] : s.rata }));
  const kkm = mid ? (d.mp.find(m => m.id == mid) || {}).kkm : null;
  let tren = '';
  if (titik.length >= 2) { const dl = titik[titik.length - 1].y - titik[titik.length - 2].y; tren = `<p style="margin:8px 0 0"><span class="stamp ${dl >= 0 ? 'ok' : 'warn'}">${dl >= 0 ? 'Naik' : 'Turun'} ${fmt(Math.abs(dl))} poin</span> <small>dibanding ${h(titik[titik.length - 2].x)}</small></p>`; }
  else tren = '<p class="hint" style="margin:8px 0 0">Grafik akan membandingkan setelah ada nilai di semester berikutnya.</p>';
  $('#pkg').innerHTML = svgGaris(titik, kkm) + tren;
  const mp = [...new Set(d.semester.flatMap(x => Object.keys(x.per)))].map(id => d.mp.find(m => m.id == id)).filter(Boolean).sort((a, b) => a.nama.localeCompare(b.nama));
  $('#pkt').innerHTML = `<h2>Nilai akhir per semester</h2><div style="overflow-x:auto"><table class="tb"><tr><th>Mapel</th>${d.semester.map(s => `<th>${h(labSmt(s.t))}</th>`).join('')}</tr>
  ${mp.map(m => `<tr><td>${h(m.nama)}</td>${d.semester.map((s, i) => { const v = s.per[m.id], b = i ? d.semester[i - 1].per[m.id] : null; return `<td>${v == null ? '-' : fmt(v)}${v != null && b != null ? (v > b ? ' <span style="color:var(--ok)">naik</span>' : v < b ? ' <span style="color:var(--bad)">turun</span>' : '') : ''}</td>`; }).join('')}</tr>`).join('')}
  <tr><th>Rata-rata</th>${d.semester.map(s => `<th>${fmt(s.rata)}</th>`).join('')}</tr></table></div>`;
}

/* ===== unggah nilai dari Excel ===== */
let NX_HASIL = [];
async function unduhFormatNilai() {
  const kid = +$('#nk').value;
  if (!kid) return toast('Pilih kelas dulu', 1);
  const s = await sb.from('siswa').select('nis,nama').eq('kelas_id', kid).eq('status', 'aktif').order('nama');
  simpanBerkas(new Blob(['\ufeff' + ['NIS;Nama;Nilai', ...s.data.map(x => `${x.nis};"${String(x.nama).replace(/"/g, '""')}";`)].join('\r\n')], { type: 'text/csv' }), 'format-nilai.csv');
}
async function pilihFileNilai() {
  const f = $('#nxf').files?.[0];
  if (!f) return;
  try {
    let rows;
    if (/\.xlsx?$/i.test(f.name)) { await muatSkrip(SHEETJS); const wb = XLSX.read(await f.arrayBuffer()); rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' }); }
    else rows = parseCsv(await f.text());
    await periksaNilaiX(rows);
  } catch (e) { toast(e.message || 'File tidak bisa dibaca', 1); }
}
async function periksaNilaiX(rows) {
  if (!rows || !rows.length) return toast('File kosong', 1);
  const kid = +$('#nk').value;
  const hd = rows[0].map(x => String(x).trim().toLowerCase()), ada = hd.includes('nis');
  const ix = ada ? { nis: hd.indexOf('nis'), nilai: hd.indexOf('nilai') } : { nis: 0, nilai: 2 };
  if (ix.nilai < 0) return toast('Judul kolom harus memuat NIS dan Nilai', 1);
  const s = await sb.from('siswa').select('id,nis,nama').eq('kelas_id', kid).eq('status', 'aktif');
  const m = Object.fromEntries(s.data.map(x => [String(x.nis), x])), lihat = new Set();
  NX_HASIL = (ada ? rows.slice(1) : rows).map((r, i) => {
    const nis = String(r[ix.nis] ?? '').trim(), mentah = String(r[ix.nilai] ?? '').trim().replace(',', '.'), v = parseFloat(mentah), sw = m[nis];
    const kosong = mentah === '';
    const masalah = kosong ? null : !sw ? 'NIS tidak ada di kelas ini' : lihat.has(nis) ? 'NIS ganda di file' : (isNaN(v) || v < 0 || v > 100) ? 'Nilai harus 0 sampai 100' : null;
    if (nis && !kosong) lihat.add(nis);
    return { baris: i + (ada ? 2 : 1), nis, nama: sw?.nama || '-', siswa_id: sw?.id, v, kosong, masalah };
  });
  const ok = NX_HASIL.filter(x => !x.kosong && !x.masalah), salah = NX_HASIL.filter(x => x.masalah), kosong = NX_HASIL.filter(x => x.kosong).length;
  $('#nxh').innerHTML = `<h3 class="sub">Hasil pemeriksaan</h3><div class="stats"><div class="stat"><span class="num">${ok.length}</span><small>Siap disimpan</small></div><div class="stat"><span class="num">${kosong}</span><small>Kosong, dilewati</small></div><div class="stat"><span class="num">${salah.length}</span><small>Bermasalah</small></div></div>
  ${salah.length ? salah.slice(0, 15).map(x => `<div class="row"><span>Baris ${x.baris}: NIS ${h(x.nis)}</span><span class="stamp bad">${x.masalah}</span></div>`).join('') : ''}
  ${ok.length ? `<button class="btn" onclick="simpanNilaiX()">Simpan ${ok.length} nilai</button>` : ''}`;
}
async function simpanNilaiX() {
  const mid = +$('#nm').value;
  if (!TA) return toast('Belum ada semester aktif. Minta admin mengaktifkannya.', 1);
  const rows = NX_HASIL.filter(x => !x.kosong && !x.masalah).map(x => ({ siswa_id: x.siswa_id, mapel_id: mid, jenis: $('#nj').value, nilai: x.v, tahun_ajaran_id: TA.id }));
  if (!mid || !rows.length) return toast('Pilih mapel dan pastikan ada nilai yang valid', 1);
  const { error } = await sb.from('nilai').insert(rows);
  if (error) return toast(error.message, 1);
  toast(rows.length + ' nilai tersimpan'); NX_HASIL = []; $('#nxh').innerHTML = '';
}

/* ===== jadwal dan kartu ujian ===== */
const TATA_TERTIB = ['Peserta hadir 15 menit sebelum ujian dimulai.', 'Membawa kartu ujian dan alat tulis sendiri.', 'Berpakaian seragam sesuai ketentuan sekolah.', 'Tidak membawa alat komunikasi ke ruang ujian.', 'Menjaga ketertiban dan kejujuran selama ujian.'];
let KL = [], US = {};
const hariTgl = t => new Date(t + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
async function vUjian() {
  const adm = me.role === 'admin', staf = adm || me.role === 'guru';
  const [uj, k, m, sw] = await Promise.all([
    sb.from('ujian').select('*').order('mulai', { ascending: false }),
    sb.from('kelas').select('*').order('nama'), sb.from('mapel').select('*').order('nama'),
    staf ? Promise.resolve({ data: [] }) : sb.from('siswa').select('id,nama,nis,kelas_id,kelas(nama)').order('nama')
  ]);
  KL = k.data; US = Object.fromEntries(sw.data.map(x => [x.id, x]));
  const tingkat = [...new Set(k.data.map(x => x.tingkat).filter(x => x != null))].sort();
  $('#main').innerHTML = head('Ujian', 'Jadwal dan kartu ujian', adm ? 'Buat ujian, isi jadwal per kelas, lalu terbitkan agar siswa dan orang tua bisa melihat dan mengunduh kartu peserta.' : 'Lihat jadwal ujian dan unduh kartu peserta.') +
    `<div class="sec"><label style="margin-top:0">Ujian</label><select id="uu" onchange="muatUjian()">${uj.data.map(x => `<option value="${x.id}">${h(x.nama)}${staf && !x.diterbitkan ? ' (belum terbit)' : ''}</option>`).join('')}</select>
    ${staf ? `<label>Kelas</label><select id="uk" onchange="muatUjian()">${opt(k.data, 'id', 'nama')}</select>` : (sw.data.length > 1 ? `<label>Siswa</label><select id="us" onchange="muatUjian()">${opt(sw.data, 'id', 'nama')}</select>` : `<input id="us" type="hidden" value="${sw.data[0]?.id ?? ''}">`)}</div>
    <div id="uj"></div>` +
    (adm ? `<div class="sec"><h2>Buat ujian</h2><label>Nama ujian</label><input id="un" placeholder="Contoh: Ujian Tengah Semester"><label>Tanggal mulai</label><input id="um" type="date"><label>Tanggal selesai</label><input id="ue" type="date"><button class="btn" onclick="addUjian()">Buat ujian</button></div>
    <div class="sec"><h2>Tambah jadwal</h2><p class="hint">Pilih satu kelas atau semua kelas satu tingkat sekaligus. Jadwal yang bentrok di kelas yang sama dilewati.</p>
    <label>Untuk</label><select id="jt">${tingkat.map(t => `<option value="t:${t}">Semua kelas tingkat ${t}</option>`).join('')}${k.data.map(x => `<option value="k:${x.id}">Hanya kelas ${h(x.nama)}</option>`).join('')}</select>
    <label>Mata pelajaran</label><select id="jmu">${opt(m.data, 'id', 'nama')}</select><label>Tanggal</label><input id="jtg" type="date">
    <label>Jam mulai</label><input id="jma" type="time"><label>Jam selesai</label><input id="jse" type="time"><label>Ruang (boleh kosong)</label><input id="jru"><button class="btn" onclick="tambahJadwalUjian()">Tambah ke jadwal</button></div>` : '');
  muatUjian();
}
async function muatUjian() {
  const uid = +$('#uu').value, adm = me.role === 'admin', staf = adm || me.role === 'guru';
  if (!uid) { $('#uj').innerHTML = '<div class="sec"><p class="mut" style="margin:0">Belum ada ujian yang diterbitkan.</p></div>'; return; }
  const kid = staf ? +$('#uk').value : (US[+$('#us').value] || {}).kelas_id;
  const [u, j] = await Promise.all([
    sb.from('ujian').select('*').eq('id', uid).single(),
    kid ? sb.from('jadwal_ujian').select('id,tanggal,jam_mulai,jam_selesai,ruang,mapel(nama)').eq('ujian_id', uid).eq('kelas_id', kid) : Promise.resolve({ data: [] })
  ]);
  const baris = j.data.slice().sort((a, b) => (a.tanggal + a.jam_mulai).localeCompare(b.tanggal + b.jam_mulai));
  $('#uj').innerHTML = `<div class="sec"><h2>${h(u.data?.nama)}</h2><p class="hint">${u.data?.mulai ? rentang({ tanggal: u.data.mulai, tanggal_selesai: u.data.selesai }) : ''} ${adm ? (u.data?.diterbitkan ? '<span class="stamp ok">Terbit</span>' : '<span class="stamp no">Belum terbit</span>') : ''}</p>
  ${baris.map(x => `<div class="row"><span><b>${h(x.mapel?.nama)}</b><br><small>${hariTgl(x.tanggal)}${x.ruang ? ' - ' + h(x.ruang) : ''}</small></span><span style="text-align:right">${x.jam_mulai.slice(0, 5)}-${x.jam_selesai.slice(0, 5)}${adm ? `<br><button class="btn alt sm" style="margin-top:4px" onclick="hapusJadwalUjian(${x.id})">Hapus</button>` : ''}</span></div>`).join('') || '<p class="mut" style="margin:0">Jadwal untuk kelas ini belum diisi.</p>'}
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">${staf ? '<button class="btn sm" style="margin:0" onclick="unduhKartu(\'kelas\')">Kartu ujian satu kelas (PDF)</button>' : '<button class="btn" style="margin:0" onclick="unduhKartu(\'siswa\')">Unduh kartu ujian (PDF)</button>'}
  ${adm ? (u.data?.diterbitkan ? `<button class="btn alt sm" style="margin:0" onclick="terbitkanUjian(${uid},false)">Tarik dari siswa</button>` : `<button class="btn alt sm" style="margin:0" onclick="terbitkanUjian(${uid},true)">Terbitkan ke siswa</button>`) : ''}</div></div>`;
}
async function addUjian() {
  const ta = await periodeAktif();
  const o = { nama: $('#un').value.trim(), mulai: $('#um').value, selesai: $('#ue').value, tahun_ajaran_id: ta ? ta.id : null, diterbitkan: false };
  if (!o.nama || !o.mulai || !o.selesai) return toast('Isi nama ujian, tanggal mulai, dan tanggal selesai', 1);
  if (o.selesai < o.mulai) return toast('Tanggal selesai tidak boleh sebelum tanggal mulai', 1);
  tambah('ujian', o, 'Ujian dibuat. Isi jadwalnya, lalu terbitkan.');
}
async function terbitkanUjian(id, ya) {
  const { error } = await sb.from('ujian').update({ diterbitkan: ya }).eq('id', id);
  if (error) return toast(error.message, 1);
  toast(ya ? 'Diterbitkan. Semua pengguna diberi tahu.' : 'Jadwal ditarik dari siswa'); vUjian();
}
async function tambahJadwalUjian() {
  const uid = +$('#uu').value, sasaran = $('#jt').value, mid = +$('#jmu').value, tg = $('#jtg').value, a = $('#jma').value, b = $('#jse').value;
  if (!uid || !mid || !tg || !a || !b) return toast('Pilih ujian lalu lengkapi mapel, tanggal, dan jam', 1);
  if (b <= a) return toast('Jam selesai harus setelah jam mulai', 1);
  const [tipe, v] = sasaran.split(':');
  const kelas = tipe === 't' ? KL.filter(x => x.tingkat === +v) : KL.filter(x => x.id === +v);
  if (!kelas.length) return toast('Kelas tidak ditemukan', 1);
  const { data: ada } = await sb.from('jadwal_ujian').select('kelas_id,jam_mulai,jam_selesai').eq('ujian_id', uid).eq('tanggal', tg);
  const baru = [], lewat = [];
  kelas.forEach(k => { const bentrok = ada.some(x => x.kelas_id === k.id && x.jam_mulai.slice(0, 5) < b && a < x.jam_selesai.slice(0, 5)); (bentrok ? lewat : baru).push(k); });
  if (baru.length) { const { error } = await sb.from('jadwal_ujian').insert(baru.map(k => ({ ujian_id: uid, kelas_id: k.id, mapel_id: mid, tanggal: tg, jam_mulai: a, jam_selesai: b, ruang: $('#jru').value.trim() || null }))); if (error) return toast(error.message, 1); }
  toast(`${baru.length} kelas ditambahkan${lewat.length ? `, ${lewat.length} dilewati karena bentrok (${lewat.map(k => k.nama).join(', ')})` : ''}`, !baru.length); vUjian();
}
async function hapusJadwalUjian(id) {
  if (!confirm('Hapus jadwal ini?')) return;
  const { error } = await sb.from('jadwal_ujian').delete().eq('id', id);
  if (error) return toast(error.message, 1);
  toast('Dihapus'); muatUjian();
}
async function unduhKartu(modus) {
  try {
    toast('Menyiapkan kartu ujian...');
    const uid = +$('#uu').value;
    let list;
    if (modus === 'kelas') {
      const kid = +$('#uk').value, s = await sb.from('siswa').select('id,nama,nis,kelas_id').eq('kelas_id', kid).eq('status', 'aktif').order('nama'), kn = (KL.find(x => x.id === kid) || {}).nama;
      list = s.data.map(x => ({ ...x, kelasNama: kn }));
    } else { const x = US[+$('#us').value]; list = x ? [{ ...x, kelasNama: x.kelas?.nama }] : []; }
    if (!list.length) return toast('Tidak ada siswa', 1);
    const [u, j] = await Promise.all([sb.from('ujian').select('*').eq('id', uid).single(), sb.from('jadwal_ujian').select('kelas_id,tanggal,jam_mulai,jam_selesai,ruang,mapel(nama)').eq('ujian_id', uid)]);
    const kartu = list.map(s => ({ s, baris: j.data.filter(x => x.kelas_id === s.kelas_id).sort((a, b) => (a.tanggal + a.jam_mulai).localeCompare(b.tanggal + b.jam_mulai)) })).filter(k => k.baris.length);
    if (!kartu.length) return toast('Jadwal ujian untuk kelas ini belum diisi', 1);
    await muatSkrip(JSPDF); await muatSkrip(AUTOTABLE);
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    kartu.forEach((k, i) => {
      const dua = k.baris.length <= 7;
      if (i > 0 && (!dua || i % 2 === 0)) doc.addPage();
      const y0 = dua ? 10 + (i % 2) * 145 : 10, tinggi = dua ? 135 : 200;
      doc.setDrawColor(27, 58, 107); doc.setLineWidth(0.5); doc.rect(10, y0, 190, tinggi);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(SCHOOL, 105, y0 + 9, { align: 'center' });
      doc.setFontSize(10); doc.text(`KARTU PESERTA ${String(u.data.nama).toUpperCase()}`, 105, y0 + 15, { align: 'center' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.text(rentang({ tanggal: u.data.mulai, tanggal_selesai: u.data.selesai }), 105, y0 + 20, { align: 'center' });
      doc.autoTable({ startY: y0 + 23, theme: 'plain', styles: { fontSize: 9, cellPadding: 0.8 }, margin: { left: 14, right: 14 }, columnStyles: { 0: { cellWidth: 32, fontStyle: 'bold' } },
        body: [['Nama', ': ' + k.s.nama], ['NIS', ': ' + k.s.nis], ['Kelas', ': ' + (k.s.kelasNama || '-')], ['Nomor peserta', `: U${u.data.id}-${k.s.nis}`]] });
      doc.autoTable({ startY: doc.lastAutoTable.finalY + 2, head: [['Hari dan tanggal', 'Jam', 'Mata pelajaran', 'Ruang']], theme: 'grid', styles: { fontSize: 8.5, cellPadding: 1.4 }, headStyles: { fillColor: [27, 58, 107] }, margin: { left: 14, right: 14 },
        body: k.baris.map(x => [hariTgl(x.tanggal), `${x.jam_mulai.slice(0, 5)}-${x.jam_selesai.slice(0, 5)}`, x.mapel?.nama || '-', x.ruang || '-']) });
      let y = doc.lastAutoTable.finalY + 5;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.text('Tata tertib', 14, y); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      TATA_TERTIB.forEach((t, n) => { y += 3.8; doc.text(`${n + 1}. ${t}`, 14, y); });
      doc.setFontSize(8.5); doc.text('Panitia ujian', 165, y0 + tinggi - 16, { align: 'center' }); doc.line(145, y0 + tinggi - 4, 185, y0 + tinggi - 4);
    });
    doc.save(`Kartu-ujian-${String(u.data.nama).replace(/\s+/g, '-')}.pdf`);
    toast(`${kartu.length} kartu ujian diunduh`);
  } catch (e) { toast(e.message || 'Kartu gagal dibuat', 1); }
}

/* ===== kenaikan kelas dan kelulusan ===== */
async function vKenaikan() {
  const [k, ta, sw] = await Promise.all([sb.from('kelas').select('*').order('nama'), periodeAktif(), sb.from('siswa').select('id,nis,nama,status').order('nama')]);
  const arsip = sw.data.filter(x => x.status && x.status !== 'aktif');
  $('#main').innerHTML = head('Admin', 'Kenaikan kelas dan kelulusan', 'Proses akhir tahun ajaran. Nilai, absensi, dan raport tahun ini tetap tersimpan sebagai arsip dan bisa dibuka kapan saja.') +
    `<div class="call"><span>${ta ? `Tahun ajaran yang ditutup: <b>${h(ta.nama)}</b> (semester ${ta.semester} aktif).` : '<b>Belum ada semester aktif.</b>'} Lakukan setelah semester 2 selesai dan raport diterbitkan.</span></div>
    <div class="sec"><label style="margin-top:0">Kelas asal</label><select id="nk1" onchange="muatKenaikan()">${opt(k.data, 'id', 'nama')}</select><div id="knh"></div></div>
    <div class="sec"><h2>Siswa lulus dan keluar (${arsip.length})</h2>${arsip.map(x => `<div class="row"><span>${h(x.nama)}<br><small>NIS ${h(x.nis)}</small></span><span style="display:flex;gap:6px;align-items:center"><span class="stamp no">${h(x.status)}</span><button class="btn alt sm" onclick="bukaArsip(${x.id})">Laporan</button></span></div>`).join('') || '<p class="mut" style="margin:0">Belum ada.</p>'}<div id="arp"></div></div>`;
  muatKenaikan();
}
async function muatKenaikan() {
  const kid = +$('#nk1').value;
  if (!kid) { $('#knh').innerHTML = '<p class="mut">Belum ada kelas.</p>'; return; }
  const [s, k] = await Promise.all([sb.from('siswa').select('id,nis,nama').eq('kelas_id', kid).eq('status', 'aktif').order('nama'), sb.from('kelas').select('*').order('nama')]);
  const asal = k.data.find(x => x.id === kid), maxT = Math.max(0, ...k.data.map(x => x.tingkat || 0));
  const tujuan = k.data.filter(x => x.id !== kid && x.tingkat && asal.tingkat && x.tingkat > asal.tingkat).sort((a, b) => a.tingkat - b.tingkat || String(a.nama).localeCompare(String(b.nama)));
  const huruf = String(asal.nama).replace(/^\d+/, ''), sebelah = tujuan.filter(x => x.tingkat === asal.tingkat + 1), bawaan = sebelah.find(x => String(x.nama).replace(/^\d+/, '') === huruf) || sebelah[0];
  const awal = asal.tingkat && asal.tingkat === maxT ? 'lulus' : bawaan ? 'naik:' + bawaan.id : 'tinggal';
  const opsi = tujuan.map(x => `<option value="naik:${x.id}">Naik ke ${h(x.nama)}</option>`).join('') + '<option value="tinggal">Tinggal kelas</option><option value="lulus">Lulus</option><option value="mutasi">Mutasi (pindah sekolah)</option>';
  $('#knh').innerHTML = s.data.length
    ? `<p class="hint" style="margin-top:10px">Pilihan awal: ${awal === 'lulus' ? 'semua lulus (tingkat tertinggi)' : bawaan ? 'naik ke ' + h(bawaan.nama) : 'tinggal kelas (belum ada kelas tujuan)'}. Ubah per siswa jika perlu.</p>` +
      s.data.map(x => `<div class="row"><span>${h(x.nama)}<br><small>NIS ${h(x.nis)}</small></span><select class="kn" data-sid="${x.id}" style="width:auto;max-width:55%">${opsi.replace(`value="${awal}"`, `value="${awal}" selected`)}</select></div>`).join('') + '<button class="btn" onclick="prosesKenaikan()">Proses kelas ini</button>'
    : '<p class="mut" style="margin:10px 0 0">Tidak ada siswa aktif di kelas ini.</p>';
}
async function prosesKenaikan() {
  const ta = await periodeAktif();
  if (!ta) return toast('Belum ada semester aktif', 1);
  const baris = $$('.kn').map(e => ({ sid: +e.dataset.sid, v: e.value })), kid = +$('#nk1').value;
  if (!baris.length) return toast('Tidak ada siswa untuk diproses', 1);
  const n = k => baris.filter(x => x.v.startsWith(k)).length;
  if (!confirm(`Tahun ajaran ${ta.nama}: ${n('naik')} naik, ${n('tinggal')} tinggal kelas, ${n('lulus')} lulus, ${n('mutasi')} mutasi. Lanjutkan?`)) return;
  const { error: e1 } = await sb.from('riwayat_kelas').upsert(baris.map(x => ({ siswa_id: x.sid, kelas_id: kid, tahun: ta.nama, hasil: x.v.startsWith('naik') ? 'naik' : x.v })), { onConflict: 'siswa_id,tahun' });
  if (e1) return toast(e1.message, 1);
  const grup = {};
  baris.forEach(x => (grup[x.v] ??= []).push(x.sid));
  for (const [v, ids] of Object.entries(grup)) {
    if (v === 'tinggal') continue;
    const patch = v.startsWith('naik:') ? { kelas_id: +v.split(':')[1] } : { kelas_id: null, status: v };
    const { error } = await sb.from('siswa').update(patch).in('id', ids);
    if (error) return toast(error.message, 1);
  }
  toast('Kenaikan kelas diproses'); vKenaikan();
}
async function bukaArsip(sid) {
  const ta = await sb.from('tahun_ajaran').select('*').order('id');
  $('#arp').innerHTML = `<div class="noprint" style="margin-top:12px"><label>Semester</label><select id="art" onchange="tampilArsip(${sid})">${ta.data.map(x => `<option value="${x.id}">Semester ${x.semester} ${h(x.nama)}</option>`).join('')}</select><div style="display:flex;gap:8px;margin-top:8px"><button class="btn sm" style="margin:0" onclick="unduhPdf(${sid},+$('#art').value)">Unduh PDF</button></div></div><div id="arl"></div>`;
  await tampilArsip(sid);
}
async function tampilArsip(sid) { $('#arl').innerHTML = await laporanHtml(sid, +$('#art').value); }

/* ===== pulihkan dari backup ===== */
const URUT_PULIH = ['kelas', 'mapel', 'tahun_ajaran', 'pengaturan', 'ekskul', 'siswa', 'ortu_siswa', 'pengampu', 'jadwal', 'absensi', 'nilai', 'tugas', 'pengumpulan_tugas', 'raport', 'raport_detail', 'izin', 'pengumuman', 'kegiatan', 'nilai_sikap', 'nilai_ekskul', 'ujian', 'jadwal_ujian', 'riwayat_kelas'];
let BACKUP = null;
async function bacaBackup() {
  const f = $('#pf').files?.[0];
  if (!f) return;
  try { BACKUP = JSON.parse(await f.text()); if (!BACKUP || !BACKUP.tabel) throw new Error('Bukan file backup portal ini'); }
  catch (e) { BACKUP = null; $('#pfh').innerHTML = ''; return toast(String(e.message).includes('backup') ? e.message : 'File tidak bisa dibaca', 1); }
  const ada = URUT_PULIH.filter(t => (BACKUP.tabel[t] || []).length);
  $('#pfh').innerHTML = `<p class="hint" style="margin-top:10px">Backup dibuat ${BACKUP.dibuat ? tgl(BACKUP.dibuat) : '-'} dari ${h(BACKUP.sekolah || '-')}.</p><div style="overflow-x:auto"><table class="tb"><tr><th>Tabel</th><th>Baris</th></tr>${ada.map(t => `<tr><td>${t}</td><td>${BACKUP.tabel[t].length}</td></tr>`).join('')}</table></div>${ada.length ? `<button class="btn" onclick="pulihkanBackup()">Pulihkan ${ada.length} tabel</button>` : '<p class="mut">File ini tidak berisi data yang bisa dipulihkan.</p>'}`;
}
async function pulihkanBackup() {
  if (!BACKUP || !confirm('Pulihkan data dari backup? Data dengan nomor yang sama akan ditimpa.')) return;
  try {
    const prof = new Set((await sb.from('profiles').select('id')).data.map(x => x.id));
    const FKP = { siswa: ['profile_id'], kelas: ['wali_kelas_id'], tugas: ['dibuat_oleh'], absensi: ['dicatat_oleh'], pengumuman: ['dibuat_oleh'], kegiatan: ['dibuat_oleh'], izin: ['diajukan_oleh', 'diputuskan_oleh'] };
    const WAJIB = { ortu_siswa: 'ortu_id', pengampu: 'guru_id' };
    let lewat = 0, total = 0;
    for (const t of URUT_PULIH) {
      const asli = BACKUP.tabel[t] || [];
      if (!asli.length) continue;
      const rows = asli.filter(r => !WAJIB[t] || prof.has(r[WAJIB[t]])).map(r => { const c = { ...r }; (FKP[t] || []).forEach(k => { if (c[k] && !prof.has(c[k])) c[k] = null; }); return c; });
      lewat += asli.length - rows.length;
      for (let i = 0; i < rows.length; i += 300) {
        toast(`Memulihkan ${t} (${Math.min(i + 300, rows.length)} dari ${rows.length})...`);
        const { error } = await sb.rpc('pulihkan_data', { p_tabel: t, p_baris: rows.slice(i, i + 300) });
        if (error) throw new Error(`${t}: ${error.message}`);
      }
      total += rows.length;
    }
    toast(`Selesai: ${total} baris dipulihkan${lewat ? `, ${lewat} dilewati karena akunnya tidak ada` : ''}`); BACKUP = null; vSistem();
  } catch (e) { toast(e.message || 'Pemulihan gagal', 1); }
}

/* ===== aktivasi akun guru dan admin lewat kode OTP email ===== */
let kunciKirim = 0;
async function panggilOtp(body) {
  const { data, error } = await sb.functions.invoke(EDGE_OTP, { body: { ...body, sekolah: SCHOOL } });
  if (error) throw new Error(await pesanFn(error));
  if (data && data.error) throw new Error(data.error);
  return data;
}
function viewAktivasi(email = '') {
  me = null;
  $('#app').innerHTML = `<div class="login"><p class="mut" style="margin:0 0 4px">${h(SCHOOL)}</p><h1>Aktifkan akun</h1>
  <p class="lead">Untuk guru dan admin yang sudah diundang. Kode verifikasi dikirim ke email kamu, jadi hanya pemilik email yang bisa mengaktifkan akun.</p>
  <label>Email yang diundang</label><input id="ae1" type="email" autocapitalize="none" spellcheck="false" value="${h(email)}">
  <button class="btn alt" type="button" onclick="kirimKode()">Kirim kode ke email</button>
  <label>Kode 6 angka dari email</label><input id="ak1" inputmode="numeric" maxlength="6" autocomplete="one-time-code">
  <label>Kata sandi baru (minimal 8 karakter)</label><input id="as1" type="password" autocomplete="new-password">
  <label>Ulangi kata sandi</label><input id="as2" type="password" autocomplete="new-password">
  <button class="btn" style="width:100%" onclick="aktifkanAkun()">Aktifkan akun</button><p id="msg2" style="margin:10px 0 0"></p>
  <p class="hint" style="margin-top:16px"><button class="lnk" type="button" style="color:var(--g)" onclick="viewLogin()">Kembali ke halaman masuk</button></p></div>`;
}
function pesanAktivasi(t, galat) { const e = $('#msg2'); e.textContent = t; e.style.color = galat ? 'var(--bad)' : 'var(--ok)'; }
async function kirimKode() {
  const email = ($('#ae1').value || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return pesanAktivasi('Isi email yang benar dulu.', true);
  if (Date.now() < kunciKirim) return pesanAktivasi('Tunggu sebentar sebelum meminta kode lagi.', true);
  kunciKirim = Date.now() + 30000;
  try { const r = await panggilOtp({ aksi: 'kirim', email }); pesanAktivasi(r.pesan || 'Kode dikirim.', false); }
  catch (e) { kunciKirim = 0; pesanAktivasi(e.message, true); }
}
async function aktifkanAkun() {
  const email = ($('#ae1').value || '').trim().toLowerCase(), kode = ($('#ak1').value || '').trim(), a = $('#as1').value, b = $('#as2').value;
  if (!email || !/^\d{6}$/.test(kode)) return pesanAktivasi('Isi email dan kode 6 angka dari email.', true);
  if (a.length < 8) return pesanAktivasi('Kata sandi minimal 8 karakter.', true);
  if (a !== b) return pesanAktivasi('Kedua kata sandi tidak sama.', true);
  try { await panggilOtp({ aksi: 'aktifkan', email, kode, password: a }); viewLogin(); $('#em').value = email; $('#msg').style.color = 'var(--ok)'; $('#msg').textContent = 'Akun aktif. Silakan masuk dengan email dan kata sandi barumu.'; }
  catch (e) { pesanAktivasi(e.message, true); }
}
async function undangStaf() {
  const nama = $('#un1').value.trim(), email = $('#ue1').value.trim().toLowerCase(), role = $('#ur1').value;
  if (!nama || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast('Isi nama dan email yang benar', 1);
  const { error } = await sb.from('undangan_staf').insert({ nama, email, role });
  if (error) return toast(String(error.message).includes('duplicate') ? 'Email ini sudah diundang' : error.message, 1);
  toast('Undangan dibuat. Tekan Kirim kode, atau minta yang diundang membuka Aktifkan akun.'); vAkun();
}
async function kirimKodeStaf(email) {
  try { const r = await panggilOtp({ aksi: 'kirim', email }); toast(r.pesan || 'Kode dikirim'); } catch (e) { toast(e.message, 1); }
}
async function hapusUndangan(id) {
  if (!confirm('Hapus undangan ini?')) return;
  const { error } = await sb.from('undangan_staf').delete().eq('id', id);
  if (error) return toast(error.message, 1);
  toast('Undangan dihapus'); vAkun();
}

/* ===== absen mandiri (guru) ===== */
async function bukaAbsen() {
  const kid = +$('#ak').value;
  if (!kid) return toast('Pilih kelas dulu', 1);
  const { data, error } = await sb.rpc('buka_absen', { p_kelas: kid, p_menit: +$('#am').value });
  if (error) return toast(error.message, 1);
  const j = new Date(data.berlaku_sampai).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  $('#kb').innerHTML = `<p class="hint" style="margin:12px 0 0">Kode untuk kelas ini, berlaku sampai ${j}</p><div class="num" style="font-size:44px;letter-spacing:.2em">${h(data.kode)}</div>`;
  muatAbsen();
}
async function bagianAbsen(siswaId) {
  const hari = new Date().toLocaleDateString('sv-SE');
  const { data } = await sb.from('absensi').select('status,sumber,terverifikasi').eq('siswa_id', siswaId).eq('tanggal', hari);
  const a = data[0];
  return `<div class="sec"><h2>Absen hari ini</h2>` + (a
    ? (a.terverifikasi === false
      ? `<p style="margin:6px 0 0"><span class="stamp warn">Menunggu guru</span> Absenmu sudah masuk. Guru akan memeriksanya.</p>`
      : `<p style="margin:6px 0 0"><span class="stamp ok">${h(a.status)}</span> Kehadiranmu hari ini sudah tercatat.</p>`)
    : `<p class="hint">Minta kode dari guru di kelas, lalu masukkan di sini. Kode hanya berlaku beberapa menit.</p>
    <div style="display:flex;gap:8px"><input id="kd" inputmode="numeric" maxlength="6" placeholder="6 angka" autocomplete="off"><button class="btn sm" onclick="absenMandiri()">Absen</button></div>`) + `</div>`;
}
async function absenMandiri() {
  const k = $('#kd').value.trim();
  if (!/^\d{6}$/.test(k)) return toast('Masukkan 6 angka kode dari guru', 1);
  const { data, error } = await sb.rpc('absen_mandiri', { p_kode: k });
  if (error) return toast(error.message, 1);
  toast(data.pesan, !data.ok);
  if (data.ok) go('home');
}

init();
