/* Portal Sekolah - modul tambahan v3.
   Dimuat SEBELUM app.js (lihat index.html). Isi: cetak raport satu kelas, dasbor kepala sekolah, presensi guru
   dan jurnal mengajar, SPP/tunggakan, kas, gaji, catatan BK, data siswa untuk TU, pengaturan sekolah.
   Memakai fungsi bantu dari app.js ($, h, toast, go, fmt, ambil, bar, head, opt, simpanBerkas, muatSkrip, dll.)
   yang baru dipanggil saat fitur dibuka, jadi urutan muat aman. */

/* ===== utilitas ===== */
const RP = v => 'Rp ' + Math.round(+v || 0).toLocaleString('id-ID');
const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const hariWIB = (d = new Date()) => d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
const bulanWIB = () => hariWIB().slice(0, 7);
const labelBulan = s => { const [y, m] = String(s).slice(0, 7).split('-').map(Number); return `${NAMA_BULAN[m - 1] || '?'} ${y}`; };
const bulanPendek = s => { const m = +String(s).slice(5, 7); return (NAMA_BULAN[m - 1] || '?').slice(0, 3); };
const tglPanjang = s => s ? new Date(String(s).slice(0, 10) + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-';
const tglRingkas = s => s ? new Date(String(s).slice(0, 10) + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '-';
const jamWIB = iso => iso ? new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).replace('.', ':') : '-';
const akhirBulan = bl => { const [y, m] = bl.split('-').map(Number); return `${bl}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`; };
const hariDalamMinggu = tgl => new Date(tgl + 'T00:00:00').getDay() || 7;   // 1 = Senin ... 7 = Minggu
const ROMAWI = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12 };
function tingkatDari(nama) {
  const n = parseInt(nama);
  if (n) return n;
  const m = String(nama || '').trim().toLowerCase().match(/^([ivx]+)/);
  return m && ROMAWI[m[1]] ? ROMAWI[m[1]] : null;
}
function nomorWa(hp) {
  const d = String(hp ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('62')) return d;
  if (d.startsWith('0')) return '62' + d.slice(1);
  if (d.startsWith('8')) return '62' + d;
  return d;
}
const hpValid = d => /^62\d{8,12}$/.test(d);
const tampilHp = hp => hp ? '0' + String(hp).slice(2) : '-';
const linkWa = (hp, teks) => `https://wa.me/${hp}?text=${encodeURIComponent(teks)}`;
const tombolLink = 'text-decoration:none;display:inline-block;margin:0';
const kosongHtml = t => `<p class="mut" style="margin:0">${t}</p>`;

let LOGO;
async function muatLogo() {   // logo sekolah (logo.jpg) sebagai data URL untuk PDF; null jika tidak ada
  if (LOGO !== undefined) return LOGO;
  try {
    const r = await fetch('logo.jpg'); if (!r.ok) throw new Error('tidak ada');
    const b = await r.blob();
    LOGO = await new Promise((ok, no) => { const f = new FileReader(); f.onload = () => ok(f.result); f.onerror = no; f.readAsDataURL(b); });
  } catch { LOGO = null; }
  return LOGO;
}
let IDENT = null;
async function muatIdentitas() {
  const { data } = await sb.from('pengaturan').select('nilai').eq('kunci', 'identitas');
  IDENT = { kepsek: '', kota: '', info_bayar: '', ...((data && data[0] && data[0].nilai) || {}) };
  return IDENT;
}

async function unduhBuku(nama, lembar) {
  try {
    await muatSkrip(SHEETJS);
    const wb = XLSX.utils.book_new();
    lembar.forEach(([n, aoa]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), n.slice(0, 30)));
    simpanBerkas(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/octet-stream' }), nama + '.xlsx');
    toast('File Excel diunduh');
  } catch {
    const aoa = lembar[0][1];
    simpanBerkas(new Blob(['\ufeff' + aoa.map(x => x.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n')], { type: 'text/csv' }), nama + '.csv');
    toast('Pustaka Excel tidak bisa dimuat, file CSV diunduh. Excel bisa membukanya.');
  }
}
const kelompok = (arr, kunci) => { const m = {}; arr.forEach(x => (m[x[kunci]] ??= []).push(x)); return m; };

/* ===== CETAK RAPORT SATU KELAS DALAM SATU PDF ===== */
async function laporanKelasData(kid, taId) {
  await muatBobot();
  const [kl, ta, dir] = await Promise.all([
    sb.from('kelas').select('id,nama,wali_kelas_id').eq('id', kid).single(),
    sb.from('tahun_ajaran').select('*').eq('id', taId).single(),
    sb.from('v_direktori').select('id,nama,role')
  ]);
  if (!kl.data || !ta.data) return null;
  const K = kl.data, T = ta.data;
  // Siswa yang pada tahun ajaran itu berada di kelas ini (riwayat kelas dipakai jika siswa sudah naik kelas)
  const [riw, kini] = await Promise.all([
    ambil(() => sb.from('riwayat_kelas').select('siswa_id,kelas_id,hasil').eq('tahun', T.nama).order('id')),
    ambil(() => sb.from('siswa').select('id').eq('kelas_id', kid).eq('status', 'aktif').order('id'))
  ]);
  const peta = Object.fromEntries(riw.map(x => [x.siswa_id, x]));
  const ids = [...new Set([...riw.filter(x => x.kelas_id === kid).map(x => x.siswa_id), ...kini.filter(x => !peta[x.id]).map(x => x.id)])];
  const wali = ((dir.data || []).find(x => x.id === K.wali_kelas_id) || {}).nama || '';
  if (!ids.length) return { K, T, wali, daftar: [] };
  const rentang = q => { if (T.mulai) q = q.gte('tanggal', T.mulai); if (T.selesai) q = q.lte('tanggal', T.selesai); return q; };
  const [sw, ab, nl, rp, tg, pg, sk, ek] = await Promise.all([
    ambil(() => sb.from('siswa').select('id,nama,nis,kelas_id').in('id', ids).order('nama').order('id')),
    ambil(() => rentang(sb.from('absensi').select('siswa_id,tanggal,status,terverifikasi').in('siswa_id', ids)).order('id')),
    ambil(() => sb.from('nilai').select('siswa_id,nilai,jenis,mapel(nama,kkm)').in('siswa_id', ids).eq('tahun_ajaran_id', taId).order('id')),
    ambil(() => sb.from('raport').select('siswa_id,catatan_wali,rata_rata,peringkat_kelas,dari_kelas,peringkat_angkatan,dari_angkatan').in('siswa_id', ids).eq('tahun_ajaran_id', taId).order('id')),
    ambil(() => sb.from('tugas').select('id,created_at').eq('kelas_id', kid).order('id')),
    ambil(() => sb.from('pengumpulan_tugas').select('siswa_id,tugas_id,terlambat').in('siswa_id', ids).order('id')),
    ambil(() => sb.from('nilai_sikap').select('siswa_id,aspek,predikat,deskripsi').in('siswa_id', ids).eq('tahun_ajaran_id', taId).order('id')),
    ambil(() => sb.from('nilai_ekskul').select('siswa_id,predikat,keterangan,ekskul(nama)').in('siswa_id', ids).eq('tahun_ajaran_id', taId).order('id'))
  ]);
  const A = kelompok(ab, 'siswa_id'), N = kelompok(nl, 'siswa_id'), R = kelompok(rp, 'siswa_id'), P = kelompok(pg, 'siswa_id'), SK = kelompok(sk, 'siswa_id'), EK = kelompok(ek, 'siswa_id');
  const daftar = sw.map(S => {
    const rw = peta[S.id] && peta[S.id].kelas_id === kid ? peta[S.id] : null;
    return susunLaporan({ ...S, kelas: { nama: K.nama } }, T, rw, K.nama, { ab: A[S.id] || [], nl: N[S.id] || [], rp: R[S.id] || [], tg, pg: P[S.id] || [], sk: SK[S.id] || [], ek: EK[S.id] || [] });
  });
  return { K, T, wali, daftar };
}

/* Menggambar satu laporan siswa ke dokumen jsPDF, mulai dari halaman yang sedang aktif. */
function gambarLaporanPdf(doc, d, ctx = {}) {
  const { S, T, c, R } = d, W = 210;
  let y = 18;
  const tabel = (head, body, opsi = {}) => { doc.autoTable({ startY: y, head: [head], body, theme: 'grid', styles: { fontSize: 9, cellPadding: 1.6 }, headStyles: { fillColor: [27, 58, 107] }, margin: { left: 15, right: 15 }, ...opsi }); y = doc.lastAutoTable.finalY + 6; };
  const judul = t => { if (y > 265) { doc.addPage(); y = 18; } doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(t, 15, y); y += 3; };
  if (ctx.logo) doc.addImage(ctx.logo, 'JPEG', 15, 9, 17, 17);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(SCHOOL, W / 2, y, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); y += 6; doc.text('Laporan hasil belajar dan kehadiran', W / 2, y, { align: 'center' });
  y += 5; doc.text(`Semester ${T.semester} tahun ajaran ${T.nama}`, W / 2, y, { align: 'center' }); y += 6;
  tabel(['Nama', 'NIS', 'Kelas'], [[S.nama, S.nis, d.kelasNama || '-']]);
  judul('Kehadiran');
  tabel(['Hadir', 'Izin', 'Sakit', 'Alpa', 'Persentase hadir'], [[c.hadir, c.izin, c.sakit, c.alpa, d.pct == null ? '-' : d.pct + '%']]);
  judul('Hasil belajar');
  if (d.baris.length) tabel(['Mata pelajaran', 'NS', 'NTS', 'NP', 'NA', 'Akhir', 'Ket.'], d.baris.map(b => [b[0], fmt(b[1]), fmt(b[2]), fmt(b[3]), fmt(b[4]), fmt(b[5]), b[6]]));
  else { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text('Belum ada nilai pada semester ini.', 15, y + 3); y += 10; }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(`Nilai akhir = ${d.bobot}`, 15, y - 3, { maxWidth: 180 }); y += 3;
  judul('PR dan tugas');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(`${d.jumlahTugas} diberikan, ${d.dikumpul} dikumpulkan${d.telat ? ', ' + d.telat + ' terlambat' : ''}.`, 15, y + 3); y += 10;
  if (R && R.peringkat_kelas != null) { judul('Peringkat'); tabel(['Rata-rata', 'Peringkat di kelas', 'Peringkat di angkatan'], [[R.rata_rata == null ? '-' : fmt(+R.rata_rata), `${R.peringkat_kelas} dari ${R.dari_kelas}`, `${R.peringkat_angkatan} dari ${R.dari_angkatan}`]]); }
  if (d.sikap.length) { judul('Sikap'); tabel(['Aspek', 'Predikat', 'Keterangan'], d.sikap.map(x => [x.aspek, x.predikat, x.deskripsi || '-'])); }
  if (d.ekskul.length) { judul('Ekstrakurikuler'); tabel(['Kegiatan', 'Predikat', 'Keterangan'], d.ekskul.map(x => [x.ekskul?.nama || '-', x.predikat, x.keterangan || '-'])); }
  judul('Catatan wali kelas');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  const cat = doc.splitTextToSize(R?.catatan_wali || '-', 180); doc.text(cat, 15, y + 3); y += cat.length * 4.5 + 10;
  if (y > 232) { doc.addPage(); y = 30; }
  const tgl = ctx.tanggal || hariWIB();
  doc.text(`${ctx.kota ? ctx.kota + ', ' : ''}${tglPanjang(tgl)}`, 195, y, { align: 'right' }); y += 6;
  const kol = ctx.kepsek ? [[40, 'Wali kelas', ctx.wali], [105, 'Kepala sekolah', ctx.kepsek], [170, 'Orang tua atau wali', '']] : [[50, 'Wali kelas', ctx.wali], [160, 'Orang tua atau wali', '']];
  kol.forEach(([x, t, n]) => { doc.text(t, x, y, { align: 'center' }); doc.line(x - 28, y + 24, x + 28, y + 24); if (n) doc.text(n, x, y + 29, { align: 'center' }); });
}

async function unduhRaportKelas() {
  const kid = +$('#rk').value, ta = +$('#rp').value;
  if (!kid || !ta) return toast('Pilih kelas dan semester dulu', 1);
  try {
    toast('Mengumpulkan data kelas...');
    const [r, ident, logo] = await Promise.all([laporanKelasData(kid, ta), muatIdentitas(), muatLogo(), muatSkrip(JSPDF)]);
    if (!r) return toast('Kelas atau semester tidak ditemukan', 1);
    if (!r.daftar.length) return toast('Belum ada siswa di kelas ini', 1);
    const tanpaNilai = r.daftar.filter(x => !x.baris.length);
    if (tanpaNilai.length && !confirm(`${tanpaNilai.length} dari ${r.daftar.length} siswa belum punya nilai semester ini (${tanpaNilai.slice(0, 3).map(x => x.S.nama).join(', ')}${tanpaNilai.length > 3 ? ', ...' : ''}). Tetap cetak semuanya?`)) return;
    await muatSkrip(AUTOTABLE);
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    const ctx = { wali: r.wali, kepsek: ident.kepsek, kota: ident.kota, tanggal: r.T.tgl_raport || hariWIB(), logo };
    r.daftar.forEach((d, i) => { if (i) doc.addPage(); gambarLaporanPdf(doc, d, ctx); });
    doc.save(`Raport-kelas-${r.K.nama}-Semester${r.T.semester}-${r.T.nama.replace('/', '-')}.pdf`);
    toast(`PDF ${r.daftar.length} raport diunduh`);
  } catch (e) { toast(e.message || 'PDF gagal dibuat', 1); }
}

/* ===== DASBOR KEPALA SEKOLAH ===== */
let KP = null, KPM = 'hadir';
const METRIK_KP = { hadir: ['Kehadiran', v => fmt(v) + '%'], rata: ['Nilai rata-rata', v => fmt(v)], tuntas: ['Ketuntasan', v => fmt(v) + '%'] };
async function vKepsek() {
  const { data, error } = await sb.rpc('dasbor_kepsek', { p_ta: null });
  if (error) throw error;
  KP = data;
  if (!KP || !KP.ada_semester) {
    $('#main').innerHTML = head('Dasbor', 'Dasbor kepala sekolah', 'Belum ada semester aktif. Minta admin mengaktifkan semester di menu Data.');
    return;
  }
  const r = KP.ringkas, S = KP.semester;
  const call = (n, t, b, k) => `<div class="call"><span><b>${n}</b> ${t}</span><button class="btn sm" onclick="go('${k}')">${b}</button></div>`;
  const stat = (n, t) => `<div class="stat"><span class="num">${n}</span><small>${t}</small></div>`;
  const absen = KP.absen_belum || [], nilai = KP.nilai_belum || [];
  $('#main').innerHTML = head('Dasbor', 'Dasbor kepala sekolah', `${new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Jakarta' })} - Semester ${S.semester} ${h(S.nama)}`) +
    (absen.length ? call(absen.length + ' kelas', 'belum diabsen hari ini', 'Lihat', 'kepsek-guru') : '') +
    `<div class="stats" style="margin-bottom:16px">${stat(r.siswa, 'Siswa aktif')}${stat(r.guru, 'Guru')}${stat(r.kelas, 'Kelas')}${stat(r.hadir_hari == null ? '-' : fmt(r.hadir_hari) + '%', 'Hadir hari ini')}</div>
    <div class="sec"><h2>Perbandingan antar kelas</h2><p class="hint">Batang kuning berarti di bawah rata-rata semua kelas. Kehadiran dihitung sejak awal semester.</p>
    <div id="kpc" class="chips" style="gap:6px;flex-wrap:wrap;margin:8px 0"></div><div id="kpk"></div></div>
    <div class="sec"><h2>Tren kehadiran per bulan</h2><p class="hint">Persentase hadir seluruh siswa aktif, enam bulan terakhir.</p>${KP.bulan.length ? `<div class="grafik">${KP.bulan.map(x => `<div><b>${fmt(x.hadir)}%</b><i style="height:${Math.round(x.hadir * 0.7)}px${x.hadir < 80 ? ';background:var(--warn)' : ''}"></i><small>${bulanPendek(x.bulan + '-01')}</small></div>`).join('')}</div>` : kosongHtml('Belum ada data absensi.')}</div>
    <div class="sec"><h2>Ketuntasan per mata pelajaran</h2><p class="hint">Persentase siswa yang nilai akhirnya mencapai KKM semester ini.</p>${KP.mapel.length ? KP.mapel.map(m => { const p = m.n ? m.tuntas / m.n * 100 : 0; return `<div style="padding:6px 0"><div class="row" style="border:0;padding:0"><span>${h(m.nama)}</span><small>${fmt(p)}% tuntas (${m.tuntas} dari ${m.n}), rata-rata ${fmt(m.rata)}, KKM ${m.kkm}</small></div>${bar(p, p < 75 ? 'var(--warn)' : 'var(--ok)')}</div>`; }).join('') : kosongHtml('Belum ada nilai pada semester ini.')}</div>
    <div class="sec" id="kepsek-guru"><h2>Guru yang belum mengisi</h2>
    <h3 class="sub">Absensi hari ini${KP.libur ? ' (hari libur)' : ''}</h3>${KP.libur ? kosongHtml('Hari ini ditandai libur di agenda.') : !KP.ada_jadwal ? kosongHtml('Jadwal pelajaran belum diisi, jadi kelas yang wajib diabsen belum bisa ditentukan.') : absen.length ? absen.map(x => `<div class="row"><span><b>Kelas ${h(x.kelas)}</b><br><small>Wali: ${h(x.wali || 'belum diatur')}${x.guru ? ' - Guru hari ini: ' + h(x.guru) : ''}</small></span><span class="stamp warn">Belum diabsen</span></div>`).join('') : kosongHtml('Semua kelas yang punya jadwal hari ini sudah diabsen.')}
    <h3 class="sub">Nilai semester ini</h3>${nilai.length ? nilai.map(x => `<div class="row"><span><b>${h(x.guru)}</b><br><small>${h(x.mapel)} - kelas ${h(x.kelas)}</small></span><span style="text-align:right"><span class="stamp warn">${x.ada} dari ${x.total} bernilai</span><br><small>Ujian akhir: ${x.ada_akhir} dari ${x.total}</small></span></div>`).join('') : kosongHtml('Semua guru sudah mengisi nilai untuk seluruh siswanya.')}
    ${S.tgl_raport ? `<p class="hint" style="margin-top:10px">Raport dibagikan ${tglPanjang(S.tgl_raport)}.</p>` : '<p class="hint" style="margin-top:10px">Tanggal pembagian raport belum diisi. Pengingat nilai untuk guru baru aktif setelah tanggal itu diisi (menu Pengaturan sekolah).</p>'}</div>
    <div class="sec"><h2>Laporan lain</h2><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn alt sm" onclick="go('laporanguru')">Presensi dan jurnal guru</button><button class="btn alt sm" onclick="go('rekap')">Rekap absensi</button><button class="btn alt sm" onclick="go('peringkat')">Peringkat</button><button class="btn alt sm" onclick="go('tunggakan')">Tunggakan SPP</button></div></div>`;
  $('#kpc').innerHTML = Object.entries(METRIK_KP).map(([k, [t]]) => `<button class="btn ${k === KPM ? '' : 'alt'} sm" onclick="KPM='${k}';gambarKelasKp()">${t}</button>`).join('');
  gambarKelasKp();
}
function gambarKelasKp() {
  const m = KPM, f = METRIK_KP[m][1], rows = KP.kelas.filter(x => x[m] != null).sort((a, b) => b[m] - a[m]);
  const rata = rows.length ? rows.reduce((u, x) => u + +x[m], 0) / rows.length : 0;
  $$('#kpc button').forEach((b, i) => b.classList.toggle('alt', Object.keys(METRIK_KP)[i] !== m));
  $('#kpk').innerHTML = rows.length
    ? rows.map(x => `<div style="padding:6px 0"><div class="row" style="border:0;padding:0"><span>Kelas ${h(x.nama)} <small>(${x.siswa} siswa)</small></span><b>${f(x[m])}</b></div>${bar(+x[m], +x[m] < rata ? 'var(--warn)' : 'var(--g)')}</div>`).join('') + `<p class="hint" style="margin:6px 0 0">Rata-rata antar kelas: ${f(rata)}</p>`
    : kosongHtml('Belum ada data untuk pembanding ini.');
}

/* ===== PRESENSI GURU DAN JURNAL MENGAJAR (guru) ===== */
async function vJurnal() {
  const hari = hariWIB(), dow = hariDalamMinggu(hari), dari = hariWIB(new Date(Date.now() - 14 * 864e5));
  const [pr, jd, jr, k, m, ps] = await Promise.all([
    sb.from('presensi_guru').select('*').eq('guru_id', me.id).eq('tanggal', hari),
    sb.from('jadwal').select('id,jam_mulai,jam_selesai,pengampu(id,guru_id,kelas_id,mapel_id,mapel(nama),kelas(nama))').eq('hari', dow).order('jam_mulai'),
    sb.from('jurnal_mengajar').select('*,kelas(nama),mapel(nama)').eq('guru_id', me.id).gte('tanggal', dari).order('tanggal', { ascending: false }).order('id', { ascending: false }),
    sb.from('kelas').select('id,nama').order('nama'),
    sb.from('mapel').select('id,nama').order('nama'),
    sb.from('pengaturan').select('nilai').eq('kunci', 'presensi_guru')
  ]);
  const p = pr.data[0], batas = (ps.data[0]?.nilai?.jam_masuk) || '07:15';
  const mine = jd.data.filter(x => x.pengampu?.guru_id === me.id);
  const sudah = Object.fromEntries(jr.data.filter(x => x.jadwal_id && x.tanggal === hari).map(x => [x.jadwal_id, x]));
  const ST = { hadir: 'Hadir', izin: 'Izin', sakit: 'Sakit', dinas: 'Dinas luar' };
  const kartuPresensi = !p
    ? `<p class="hint">Belum ada presensi hari ini. Batas masuk pukul ${h(batas)}. Waktu dicatat oleh server.</p><button class="btn" onclick="presensiMasuk('hadir')">Presensi masuk</button>
       <h3 class="sub">Tidak masuk hari ini?</h3><div style="display:flex;gap:8px"><select id="pgs" style="width:auto"><option value="izin">Izin</option><option value="sakit">Sakit</option><option value="dinas">Dinas luar</option></select><input id="pgk" placeholder="Keterangan (wajib)"></div><button class="btn alt" onclick="presensiMasuk($('#pgs').value)">Catat</button>`
    : `<div class="row" style="border:0"><span><span class="stamp ${p.status === 'hadir' ? 'ok' : 'warn'}">${ST[p.status]}</span>${p.terlambat ? ' <span class="stamp bad">Terlambat</span>' : ''}<br><small>${p.status === 'hadir' ? `Masuk ${jamWIB(p.masuk)}${p.pulang ? ', pulang ' + jamWIB(p.pulang) : ''}` : h(p.keterangan || '')}</small></span>
       ${p.status === 'hadir' && !p.pulang ? '<button class="btn alt sm" onclick="presensiPulang()">Presensi pulang</button>' : ''}</div>`;
  $('#main').innerHTML = head('Guru', 'Presensi dan jurnal mengajar', 'Catat kehadiranmu dan materi yang diajarkan. Kepala sekolah memakai catatan ini untuk laporan.') +
    `<div class="sec"><h2>Presensi hari ini</h2>${kartuPresensi}</div>
    <div class="sec"><h2>Jurnal hari ini</h2><p class="hint">Sesuai jadwal mengajarmu hari ${HARI[dow] || 'Minggu'}. Tulis materi singkat setelah mengajar.</p>
    ${mine.map(x => { const pe = x.pengampu, j = sudah[x.id]; return `<div style="padding:10px 0;border-bottom:1px solid var(--line)"><div class="row" style="border:0;padding:0"><span><b>${h(pe.mapel?.nama)}</b> - ${h(pe.kelas?.nama)}<br><small>${x.jam_mulai.slice(0, 5)}-${x.jam_selesai.slice(0, 5)}</small></span>${j ? '<span class="stamp ok">Terisi</span>' : '<span class="stamp warn">Belum</span>'}</div>
      ${j ? `<p style="margin:6px 0 0">${h(j.materi)}</p>` : `<textarea id="jm-${x.id}" rows="2" placeholder="Materi yang diajarkan" style="margin-top:6px"></textarea><button class="btn sm" style="margin-top:6px" onclick="simpanJurnal(${x.id},${pe.kelas_id},${pe.mapel_id},'${x.jam_mulai}','${x.jam_selesai}')">Simpan jurnal</button>`}</div>`; }).join('') || kosongHtml('Tidak ada jadwal mengajar hari ini. Jika tetap mengajar, isi jurnal tambahan di bawah.')}</div>
    <div class="sec"><h2>Jurnal tambahan</h2><p class="hint">Untuk jam pengganti atau kelas di luar jadwal.</p>
    <label style="margin-top:0">Kelas</label><select id="jtk">${opt(k.data, 'id', 'nama')}</select><label>Mata pelajaran</label><select id="jtm">${opt(m.data, 'id', 'nama')}</select>
    <label>Materi</label><textarea id="jtt" rows="2"></textarea><button class="btn" onclick="jurnalTambahan()">Simpan jurnal</button></div>
    <div class="sec"><h2>Riwayat 14 hari</h2>${jr.data.map(x => `<div class="row"><span><b>${h(x.mapel?.nama)}</b> - ${h(x.kelas?.nama)}<br><small>${tglRingkas(x.tanggal)}: ${h(x.materi)}</small></span><span style="display:flex;gap:6px"><button class="btn alt sm" onclick="ubahJurnal(${x.id})">Ubah</button><button class="btn alt sm" onclick="hapusJurnal(${x.id})">Hapus</button></span></div>`).join('') || kosongHtml('Belum ada jurnal.')}</div>`;
  window.JURNAL_RIWAYAT = Object.fromEntries(jr.data.map(x => [x.id, x.materi]));
}
async function presensiMasuk(status) {
  const ket = status === 'hadir' ? null : ($('#pgk').value || '').trim();
  const { data, error } = await sb.rpc('presensi_guru_masuk', { p_status: status, p_ket: ket });
  if (error) return toast(error.message, 1);
  toast(data.pesan, !data.ok); vJurnal();
}
async function presensiPulang() {
  const { data, error } = await sb.rpc('presensi_guru_pulang');
  if (error) return toast(error.message, 1);
  toast(data.pesan, !data.ok); vJurnal();
}
async function simpanJurnal(jid, kid, mid, a, b) {
  const materi = ($('#jm-' + jid).value || '').trim();
  if (!materi) return toast('Tulis materi yang diajarkan dulu', 1);
  const { error } = await sb.from('jurnal_mengajar').insert({ guru_id: me.id, tanggal: hariWIB(), kelas_id: kid, mapel_id: mid, jadwal_id: jid, jam_mulai: a, jam_selesai: b, materi });
  if (error) return toast(String(error.message).includes('duplicate') ? 'Jurnal jam ini sudah diisi' : error.message, 1);
  toast('Jurnal tersimpan'); vJurnal();
}
async function jurnalTambahan() {
  const materi = ($('#jtt').value || '').trim();
  if (!materi) return toast('Tulis materi yang diajarkan dulu', 1);
  const { error } = await sb.from('jurnal_mengajar').insert({ guru_id: me.id, tanggal: hariWIB(), kelas_id: +$('#jtk').value, mapel_id: +$('#jtm').value, materi });
  if (error) return toast(error.message, 1);
  toast('Jurnal tersimpan'); vJurnal();
}
async function ubahJurnal(id) {
  const baru = prompt('Ubah materi', (window.JURNAL_RIWAYAT || {})[id] || '');
  if (baru == null || !baru.trim()) return;
  const { error } = await sb.from('jurnal_mengajar').update({ materi: baru.trim() }).eq('id', id);
  if (error) return toast(error.message, 1);
  toast('Jurnal diubah'); vJurnal();
}
async function hapusJurnal(id) {
  if (!confirm('Hapus jurnal ini?')) return;
  const { error } = await sb.from('jurnal_mengajar').delete().eq('id', id);
  if (error) return toast(error.message, 1);
  toast('Jurnal dihapus'); vJurnal();
}

/* ===== LAPORAN PRESENSI DAN JURNAL GURU (kepala sekolah, admin) ===== */
let LG = null;
async function vLaporanGuru() {
  $('#main').innerHTML = head('Laporan', 'Presensi dan jurnal guru', 'Ringkasan per bulan. Ketuk nama guru untuk melihat jurnalnya. Jurnal diharapkan terisi untuk setiap jam di jadwal mengajar.') +
    `<div class="sec"><label style="margin-top:0">Bulan</label><input id="lgb" type="month" value="${bulanWIB()}" onchange="muatLaporanGuru()"><button class="btn" onclick="unduhLaporanGuru()">Unduh Excel</button></div><div id="lgh"></div>`;
  muatLaporanGuru();
}
async function dataLaporanGuru() {
  const bl = $('#lgb').value;
  if (!bl) return null;
  const dari = bl + '-01', sampai = akhirBulan(bl), hari = hariWIB();
  const [st, pr, jr, jd] = await Promise.all([
    sb.from('v_staf').select('id,nama,role').eq('role', 'guru').order('nama'),
    ambil(() => sb.from('presensi_guru').select('guru_id,tanggal,status,terlambat').gte('tanggal', dari).lte('tanggal', sampai).order('id')),
    ambil(() => sb.from('jurnal_mengajar').select('id,guru_id,tanggal,jadwal_id,materi,kelas(nama),mapel(nama)').gte('tanggal', dari).lte('tanggal', sampai).order('id')),
    sb.from('jadwal').select('hari,pengampu(guru_id)')
  ]);
  // jumlah jam yang seharusnya dijurnal sampai hari ini (hari libur belum diperhitungkan)
  const mingguan = {};
  jd.data.forEach(x => { const g = x.pengampu?.guru_id; if (g) ((mingguan[g] ??= {})[x.hari] = (mingguan[g][x.hari] || 0) + 1); });
  const batas = sampai < hari ? sampai : hari, tanggal = [];
  for (let d = new Date(dari + 'T00:00:00'); hariWIB(d) <= batas; d.setDate(d.getDate() + 1)) tanggal.push(hariWIB(d));
  const baris = st.data.map(g => {
    const p = pr.filter(x => x.guru_id === g.id), j = jr.filter(x => x.guru_id === g.id);
    const harusnya = tanggal.reduce((u, t) => u + ((mingguan[g.id] || {})[hariDalamMinggu(t)] || 0), 0);
    return { g, hadir: p.filter(x => x.status === 'hadir').length, telat: p.filter(x => x.terlambat).length, izin: p.filter(x => x.status === 'izin').length, sakit: p.filter(x => x.status === 'sakit').length, dinas: p.filter(x => x.status === 'dinas').length, jurnal: j.filter(x => x.jadwal_id).length, tambahan: j.filter(x => !x.jadwal_id).length, harusnya, daftar: j };
  });
  return { bl, baris };
}
async function muatLaporanGuru() {
  LG = await dataLaporanGuru();
  if (!LG) return;
  $('#lgh').innerHTML = LG.baris.length
    ? `<div class="sec"><h2>${labelBulan(LG.bl)}</h2><div style="overflow-x:auto"><table class="tb"><tr><th>Guru</th><th>Hadir</th><th>Telat</th><th>I/S/D</th><th>Jurnal</th></tr>
      ${LG.baris.map((x, i) => `<tr onclick="bukaJurnalGuru(${i})" style="cursor:pointer"><td style="white-space:nowrap"><span class="lnk" style="color:var(--g)">${h(x.g.nama)}</span></td><td>${x.hadir}</td><td>${x.telat || '-'}</td><td>${x.izin}/${x.sakit}/${x.dinas}</td><td>${x.jurnal}${x.harusnya ? ` dari ${x.harusnya}` : ''}${x.harusnya && x.jurnal < x.harusnya * 0.8 ? ' <span class="stamp warn">Kurang</span>' : ''}</td></tr>`).join('')}</table></div>
      <p class="hint" style="margin:8px 0 0">I/S/D = izin, sakit, dinas luar. Jurnal dibandingkan dengan jadwal mengajar sampai hari ini; hari libur belum dikurangkan.</p></div><div id="lgd"></div>`
    : `<div class="sec">${kosongHtml('Belum ada akun guru.')}</div>`;
}
function bukaJurnalGuru(i) {
  const x = LG.baris[i];
  $('#lgd').innerHTML = `<div class="sec"><h2>Jurnal ${h(x.g.nama)}</h2>${x.daftar.slice().sort((a, b) => b.tanggal.localeCompare(a.tanggal)).map(j => `<div class="row"><span><b>${h(j.mapel?.nama)}</b> - ${h(j.kelas?.nama)}<br><small>${h(j.materi)}</small></span><small>${tglRingkas(j.tanggal)}</small></div>`).join('') || kosongHtml('Belum ada jurnal bulan ini.')}</div>`;
  $('#lgd').scrollIntoView();
}
async function unduhLaporanGuru() {
  const r = LG || await dataLaporanGuru();
  if (!r || !r.baris.length) return toast('Tidak ada data untuk diunduh', 1);
  const ring = [[`Presensi dan jurnal guru - ${labelBulan(r.bl)}`], [], ['No', 'Guru', 'Hadir', 'Terlambat', 'Izin', 'Sakit', 'Dinas luar', 'Jurnal terisi', 'Jam seharusnya', 'Jurnal tambahan'],
    ...r.baris.map((x, i) => [i + 1, x.g.nama, x.hadir, x.telat, x.izin, x.sakit, x.dinas, x.jurnal, x.harusnya, x.tambahan])];
  const det = [['Guru', 'Tanggal', 'Kelas', 'Mapel', 'Materi'], ...r.baris.flatMap(x => x.daftar.slice().sort((a, b) => a.tanggal.localeCompare(b.tanggal)).map(j => [x.g.nama, j.tanggal, j.kelas?.nama || '', j.mapel?.nama || '', j.materi]))];
  unduhBuku(`Presensi-jurnal-guru-${r.bl}`, [['Ringkasan', ring], ['Jurnal', det]]);
}

/* ===== SPP: catat pembayaran dan buat tagihan (TU, admin) ===== */
const stTagihan = t => +t.sisa <= 0 ? '<span class="stamp ok">Lunas</span>' : t.jatuh_tempo < hariWIB() ? '<span class="stamp bad">Terlambat</span>' : +t.dibayar > 0 ? '<span class="stamp warn">Sebagian</span>' : '<span class="stamp no">Belum bayar</span>';
const namaTagihan = t => `${h(t.jenis)} ${labelBulan(t.periode)}`;
async function vSpp() {
  const k = await sb.from('kelas').select('id,nama').order('nama');
  $('#main').innerHTML = head('SPP', 'SPP dan tagihan', 'Catat pembayaran siswa, atau buat tagihan untuk satu kelas sekaligus.') +
    `<div class="sec"><h2>Catat pembayaran</h2><label style="margin-top:0">Kelas</label><select id="sk1" onchange="muatSiswaSpp()">${opt(k.data, 'id', 'nama')}</select>
    <label>Siswa</label><select id="ss1" onchange="muatTagihanSiswa()"></select><div id="tg1" style="margin-top:8px"></div></div>
    <div class="sec"><h2>Buat tagihan</h2><p class="hint">Tagihan dibuat untuk semua siswa aktif di kelas yang dipilih. Siswa yang sudah punya tagihan sama pada bulan itu dilewati. Orang tua mendapat notifikasi.</p>
    <label style="margin-top:0">Untuk</label><select id="bk1"><option value="">Semua kelas</option>${opt(k.data, 'id', 'nama')}</select>
    <label>Jenis</label><input id="bj1" list="jenisTagihan" value="SPP"><datalist id="jenisTagihan"><option>SPP</option><option>Uang gedung</option><option>Seragam</option><option>Buku</option><option>Kegiatan</option></datalist>
    <label>Bulan tagihan</label><input id="bb1" type="month" value="${bulanWIB()}"><label>Jumlah per siswa (Rp)</label><input id="bn1" type="number" min="1" inputmode="numeric">
    <label>Jatuh tempo</label><input id="bt1" type="date"><label>Keterangan (boleh kosong)</label><input id="bq1"><button class="btn" onclick="buatTagihan()">Buat tagihan</button></div>`;
  muatSiswaSpp();
}
async function muatSiswaSpp() {
  const kid = +$('#sk1').value;
  if (!kid) { $('#ss1').innerHTML = ''; $('#tg1').innerHTML = ''; return; }
  const { data } = await sb.from('siswa').select('id,nama,nis').eq('kelas_id', kid).eq('status', 'aktif').order('nama');
  $('#ss1').innerHTML = data.map(x => `<option value="${x.id}">${h(x.nama)} (${h(x.nis)})</option>`).join('') || '<option value="">Belum ada siswa</option>';
  muatTagihanSiswa();
}
async function muatTagihanSiswa() {
  const sid = +$('#ss1').value;
  if (!sid) { $('#tg1').innerHTML = kosongHtml('Pilih siswa.'); return; }
  const { data: t } = await sb.from('v_tagihan').select('*').eq('siswa_id', sid).order('periode', { ascending: false });
  const { data: p } = t.length ? await sb.from('pembayaran').select('*').in('tagihan_id', t.map(x => x.id)).order('id') : { data: [] };
  const per = kelompok(p, 'tagihan_id'), sisa = t.reduce((u, x) => u + +x.sisa, 0);
  $('#tg1').innerHTML = (t.length ? `<p class="hint">Total belum dibayar: <b>${RP(sisa)}</b></p>` : '') + (t.map(x => `<div style="padding:10px 0;border-top:1px solid var(--line)"><div class="row" style="border:0;padding:0"><span><b>${namaTagihan(x)}</b><br><small>${RP(x.jumlah)} - jatuh tempo ${tglRingkas(x.jatuh_tempo)}</small></span><span style="text-align:right">${stTagihan(x)}${+x.sisa > 0 ? `<br><small>sisa ${RP(x.sisa)}</small>` : ''}</span></div>
    ${(per[x.id] || []).map(y => `<div class="row" style="border:0;padding:4px 0"><small>Bayar ${RP(y.jumlah)} (${y.metode}) ${tglRingkas(y.tanggal)}${y.catatan ? ' - ' + h(y.catatan) : ''}</small><button class="lnk" onclick="hapusPembayaran(${y.id})">Batalkan</button></div>`).join('')}
    <div style="display:flex;gap:6px;margin-top:6px">${+x.sisa > 0 ? `<button class="btn sm" onclick="$('#pf-${x.id}').hidden=!$('#pf-${x.id}').hidden">Bayar</button>` : ''}${+x.dibayar === 0 ? `<button class="btn alt sm" onclick="hapusTagihan(${x.id})">Hapus tagihan</button>` : ''}</div>
    <div id="pf-${x.id}" hidden><label>Jumlah (Rp)</label><input id="pj-${x.id}" type="number" inputmode="numeric" value="${Math.round(x.sisa)}"><label>Tanggal</label><input id="pd-${x.id}" type="date" value="${hariWIB()}">
    <label>Cara bayar</label><select id="pm-${x.id}"><option value="tunai">Tunai</option><option value="transfer">Transfer</option></select><label>Catatan</label><input id="pc-${x.id}"><button class="btn" onclick="simpanBayar(${x.id})">Simpan pembayaran</button></div></div>`).join('') || kosongHtml('Siswa ini belum punya tagihan.'));
}
async function simpanBayar(tid) {
  const jumlah = Math.round(+$('#pj-' + tid).value);
  if (!(jumlah > 0)) return toast('Isi jumlah pembayaran', 1);
  const { error } = await sb.from('pembayaran').insert({ tagihan_id: tid, jumlah, tanggal: $('#pd-' + tid).value || hariWIB(), metode: $('#pm-' + tid).value, catatan: $('#pc-' + tid).value.trim() || null });
  if (error) return toast(error.message, 1);
  toast('Pembayaran tercatat dan masuk kas'); muatTagihanSiswa();
}
async function hapusPembayaran(id) {
  if (!confirm('Batalkan pembayaran ini? Catatan kas yang terkait ikut dihapus.')) return;
  const { error } = await sb.from('pembayaran').delete().eq('id', id);
  if (error) return toast(error.message, 1);
  toast('Pembayaran dibatalkan'); muatTagihanSiswa();
}
async function hapusTagihan(id) {
  if (!confirm('Hapus tagihan ini?')) return;
  const { error } = await sb.from('tagihan').delete().eq('id', id);
  if (error) return toast(error.message, 1);
  toast('Tagihan dihapus'); muatTagihanSiswa();
}
async function buatTagihan() {
  const jenis = $('#bj1').value.trim(), bl = $('#bb1').value, jumlah = +$('#bn1').value, tempo = $('#bt1').value, kid = +$('#bk1').value || null;
  if (!jenis || !bl || !(jumlah > 0) || !tempo) return toast('Lengkapi jenis, bulan, jumlah, dan jatuh tempo', 1);
  const kn = kid ? 'kelas ' + $('#bk1').selectedOptions[0].textContent : 'semua kelas';
  if (!confirm(`Buat tagihan ${jenis} ${labelBulan(bl)} sebesar ${RP(jumlah)} untuk siswa aktif ${kn}?`)) return;
  const { data, error } = await sb.rpc('buat_tagihan_massal', { p_kelas: kid, p_jenis: jenis, p_periode: bl + '-01', p_jumlah: jumlah, p_tempo: tempo, p_ket: $('#bq1').value.trim() || null });
  if (error) return toast(error.message, 1);
  toast(data.pesan, !data.ok); if (data.ok) muatTagihanSiswa();
}

/* ===== TUNGGAKAN ===== */
async function vTunggakan() {
  const k = await sb.from('kelas').select('id,nama').order('nama');
  $('#main').innerHTML = head('SPP', 'Tunggakan', 'Siswa dengan tagihan yang belum lunas. Tombol WhatsApp membuka pesan pengingat untuk wali murid.') +
    `<div class="sec noprint"><label style="margin-top:0">Kelas</label><select id="tk1" onchange="muatTunggakan()"><option value="">Semua kelas</option>${opt(k.data, 'id', 'nama')}</select>
    <label style="display:flex;gap:8px;align-items:center;font-weight:500"><input id="tl1" type="checkbox" checked style="width:auto" onchange="muatTunggakan()"> Hanya yang sudah lewat jatuh tempo</label>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" onclick="unduhTunggakan()">Unduh Excel</button><button class="btn alt" onclick="window.print()">Cetak</button></div></div><div id="tr1"></div>`;
  muatTunggakan();
}
let TUNG = [];
async function dataTunggakan() {
  const kid = +$('#tk1').value || null, telat = $('#tl1').checked, hari = hariWIB();
  const [tv, sw] = await Promise.all([
    ambil(() => sb.from('v_tagihan').select('*').gt('sisa', 0).order('id')),
    ambil(() => { let q = sb.from('siswa').select('id,nama,nis,kelas_id,nama_wali,hp_wali,kelas(nama)').eq('status', 'aktif'); if (kid) q = q.eq('kelas_id', kid); return q.order('id'); })
  ]);
  const smap = Object.fromEntries(sw.map(x => [x.id, x])), per = {};
  tv.filter(t => smap[t.siswa_id] && (!telat || t.jatuh_tempo < hari)).forEach(t => (per[t.siswa_id] ??= []).push(t));
  return Object.entries(per).map(([id, items]) => {
    const s = smap[id], total = items.reduce((u, t) => u + +t.sisa, 0), tertua = items.reduce((m, t) => t.jatuh_tempo < m ? t.jatuh_tempo : m, '9999-12-31');
    const hariTelat = Math.max(0, Math.round((new Date(hari) - new Date(tertua)) / 864e5));
    return { s, items: items.sort((a, b) => a.periode.localeCompare(b.periode)), total, hariTelat };
  }).sort((a, b) => b.total - a.total);
}
async function muatTunggakan() {
  TUNG = await dataTunggakan();
  const total = TUNG.reduce((u, x) => u + x.total, 0);
  $('#tr1').innerHTML = TUNG.length
    ? `<div class="sec"><h2>${TUNG.length} siswa, total ${RP(total)}</h2>${TUNG.slice(0, 200).map((x, i) => { const hp = nomorWa(x.s.hp_wali), ok = hpValid(hp); return `<div class="row"><span><b>${h(x.s.nama)}</b> <small>${h(x.s.kelas?.nama || '')}</small><br><small>${x.items.map(t => namaTagihan(t)).join(', ')}</small></span><span style="text-align:right"><b>${RP(x.total)}</b><br>${x.hariTelat ? `<span class="stamp bad">${x.hariTelat} hari</span> ` : ''}${ok ? `<a class="btn alt sm noprint" style="${tombolLink}" target="_blank" rel="noopener" href="${linkWa(hp, pesanTunggakan(x))}">WhatsApp</a>` : '<small>HP belum ada</small>'}</span></div>`; }).join('')}${TUNG.length > 200 ? `<p class="hint">Menampilkan 200 dari ${TUNG.length}. Unduh Excel untuk semuanya.</p>` : ''}</div>`
    : `<div class="sec">${kosongHtml('Tidak ada tunggakan.')}</div>`;
}
function pesanTunggakan(x) {
  return `Yth. Bapak/Ibu ${x.s.nama_wali || 'wali murid'}, kami dari ${SCHOOL} menginformasikan tagihan atas nama ${x.s.nama} yang belum lunas: ${x.items.map(t => `${t.jenis} ${labelBulan(t.periode)} ${RP(t.sisa)}`).join('; ')}. Total ${RP(x.total)}. Mohon dapat dibayarkan. Terima kasih.`;
}
async function unduhTunggakan() {
  if (!TUNG.length) return toast('Tidak ada data untuk diunduh', 1);
  unduhBuku(`Tunggakan-${hariWIB()}`, [['Tunggakan', [['Nama', 'NIS', 'Kelas', 'Wali', 'HP', 'Jumlah tagihan', 'Total tunggakan', 'Rincian'], ...TUNG.map(x => [x.s.nama, x.s.nis, x.s.kelas?.nama || '', x.s.nama_wali || '', tampilHp(x.s.hp_wali), x.items.length, x.total, x.items.map(t => `${t.jenis} ${labelBulan(t.periode)} ${RP(t.sisa)}`).join('; ')])]]]);
}

/* ===== TAGIHAN (orang tua) ===== */
async function bagianTagihan() {
  const { data } = await sb.from('v_tagihan').select('sisa,jatuh_tempo').gt('sisa', 0);
  if (!data || !data.length) return '';
  const total = data.reduce((u, x) => u + +x.sisa, 0), telat = data.filter(x => x.jatuh_tempo < hariWIB()).length;
  return `<div class="call"><span><b>${data.length} tagihan</b> belum lunas, ${RP(total)}${telat ? ` (${telat} terlambat)` : ''}</span><button class="btn sm" onclick="go('tagihan')">Lihat</button></div>`;
}
async function vTagihanOrtu() {
  const [s, t, ident] = await Promise.all([sb.from('siswa').select('id,nama,kelas(nama)').order('nama'), sb.from('v_tagihan').select('*').order('periode', { ascending: false }), muatIdentitas()]);
  const ids = t.data.map(x => x.id), { data: p } = ids.length ? await sb.from('pembayaran').select('*').in('tagihan_id', ids).order('id') : { data: [] };
  const per = kelompok(p, 'tagihan_id'), perAnak = kelompok(t.data, 'siswa_id');
  $('#main').innerHTML = head('Tagihan', 'Tagihan sekolah', 'SPP dan tagihan lain untuk anak Anda. Anda mendapat pengingat sebelum jatuh tempo.') +
    (ident.info_bayar ? `<div class="sec"><h2>Cara pembayaran</h2><p style="margin:0;white-space:pre-line">${h(ident.info_bayar)}</p></div>` : '') +
    (s.data.map(a => { const l = perAnak[a.id] || [], sisa = l.reduce((u, x) => u + +x.sisa, 0); return `<div class="sec"><h2>${h(a.nama)}</h2><p class="hint">${h(a.kelas?.nama || '')}${l.length ? ` - belum dibayar ${RP(sisa)}` : ''}</p>${l.map(x => `<div style="padding:8px 0;border-top:1px solid var(--line)"><div class="row" style="border:0;padding:0"><span><b>${namaTagihan(x)}</b><br><small>${RP(x.jumlah)} - jatuh tempo ${tglPanjang(x.jatuh_tempo)}</small></span><span style="text-align:right">${stTagihan(x)}${+x.sisa > 0 && +x.dibayar > 0 ? `<br><small>sisa ${RP(x.sisa)}</small>` : ''}</span></div>${(per[x.id] || []).map(y => `<small style="display:block">Dibayar ${RP(y.jumlah)} pada ${tglPanjang(y.tanggal)}</small>`).join('')}</div>`).join('') || kosongHtml('Belum ada tagihan.')}</div>`; }).join('') || `<div class="sec">${kosongHtml('Belum ada data anak.')}</div>`);
}

/* ===== KAS MASUK DAN KELUAR ===== */
let KAS = null;
async function vKas() {
  const tulis = ['admin', 'tu'].includes(me.role);
  $('#main').innerHTML = head('Kas', 'Kas masuk dan keluar', 'Pembayaran SPP dan gaji yang dibayar masuk otomatis. Pemasukan atau pengeluaran lain dicatat manual.') +
    `<div class="sec"><label style="margin-top:0">Bulan</label><input id="kb1" type="month" value="${bulanWIB()}" onchange="muatKas()"><button class="btn" onclick="unduhKas()">Unduh Excel</button></div><div id="kh1"></div>` +
    (tulis ? `<div class="sec"><h2>Catat kas manual</h2><label style="margin-top:0">Jenis</label><select id="km1"><option value="masuk">Masuk</option><option value="keluar">Keluar</option></select>
    <label>Tanggal</label><input id="kt1" type="date" value="${hariWIB()}"><label>Kategori</label><input id="kc1" list="kategoriKas" placeholder="Contoh: Operasional"><datalist id="kategoriKas"><option>Dana BOS</option><option>Donasi</option><option>Operasional</option><option>ATK</option><option>Listrik dan air</option><option>Perawatan</option><option>Kegiatan</option><option>Lain-lain</option></datalist>
    <label>Uraian</label><input id="ku1"><label>Jumlah (Rp)</label><input id="kj1" type="number" min="1" inputmode="numeric"><button class="btn" onclick="simpanKas()">Simpan</button></div>
    <div class="sec"><h2>Saldo awal kas</h2><p class="hint">Saldo sebelum pencatatan di portal dimulai. Isi sekali.</p><input id="ks1" type="number" inputmode="numeric"><button class="btn alt" onclick="simpanSaldoAwal()">Simpan saldo awal</button></div>` : '');
  muatKas();
}
async function muatKas() {
  const bl = $('#kb1').value;
  if (!bl) return;
  const dari = bl + '-01', sampai = akhirBulan(bl), tulis = ['admin', 'tu'].includes(me.role);
  const [rk, rows] = await Promise.all([sb.rpc('ringkas_kas', { p_dari: dari, p_sampai: sampai }), ambil(() => sb.from('kas').select('*').gte('tanggal', dari).lte('tanggal', sampai).order('tanggal', { ascending: false }).order('id', { ascending: false }))]);
  if (rk.error) return toast(rk.error.message, 1);
  const R = rk.data, awal = +R.saldo_awal + +R.masuk_sebelum - +R.keluar_sebelum, akhir = awal + +R.masuk - +R.keluar;
  KAS = { bl, rows, R, awal, akhir };
  const kat = j => { const m = {}; rows.filter(x => x.jenis === j).forEach(x => m[x.kategori] = (m[x.kategori] || 0) + +x.jumlah); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  const bagi = (j, t) => kat(j).length ? `<h3 class="sub">${t} per kategori</h3>${kat(j).map(([n, v]) => `<div class="row"><span>${h(n)}</span><b>${RP(v)}</b></div>`).join('')}` : '';
  if ($('#ks1') && !$('#ks1').value) $('#ks1').value = Math.round(R.saldo_awal);
  $('#kh1').innerHTML = `<div class="sec"><h2>${labelBulan(bl)}</h2><div class="stats" style="margin-top:8px"><div class="stat"><small>Saldo awal</small><span class="num2">${RP(awal)}</span></div><div class="stat"><small>Masuk</small><span class="num2" style="color:var(--ok)">${RP(R.masuk)}</span></div></div>
    <div class="stats" style="margin-top:8px"><div class="stat"><small>Keluar</small><span class="num2" style="color:var(--bad)">${RP(R.keluar)}</span></div><div class="stat"><small>Saldo akhir</small><span class="num2">${RP(akhir)}</span></div></div>${bagi('masuk', 'Masuk')}${bagi('keluar', 'Keluar')}</div>
    <div class="sec"><h2>Catatan (${rows.length})</h2>${rows.slice(0, 150).map(x => `<div class="row"><span>${h(x.uraian)}<br><small>${tglRingkas(x.tanggal)} - ${h(x.kategori)}${x.sumber !== 'manual' ? ' - otomatis' : ''}</small></span><span style="text-align:right"><b style="color:${x.jenis === 'masuk' ? 'var(--ok)' : 'var(--bad)'}">${x.jenis === 'masuk' ? '+' : '-'}${RP(x.jumlah)}</b>${tulis && x.sumber === 'manual' ? `<br><button class="lnk" onclick="hapusKas(${x.id})">Hapus</button>` : ''}</span></div>`).join('') || kosongHtml('Belum ada catatan bulan ini.')}${rows.length > 150 ? `<p class="hint">Menampilkan 150 dari ${rows.length}. Unduh Excel untuk semuanya.</p>` : ''}</div>`;
}
async function simpanKas() {
  const o = { jenis: $('#km1').value, tanggal: $('#kt1').value || hariWIB(), kategori: $('#kc1').value.trim(), uraian: $('#ku1').value.trim(), jumlah: Math.round(+$('#kj1').value), sumber: 'manual' };
  if (!o.kategori || !o.uraian || !(o.jumlah > 0)) return toast('Lengkapi kategori, uraian, dan jumlah', 1);
  const { error } = await sb.from('kas').insert(o);
  if (error) return toast(error.message, 1);
  toast('Kas tercatat'); $('#ku1').value = ''; $('#kj1').value = ''; muatKas();
}
async function hapusKas(id) {
  if (!confirm('Hapus catatan kas ini?')) return;
  const { error } = await sb.from('kas').delete().eq('id', id);
  if (error) return toast(error.message, 1);
  toast('Dihapus'); muatKas();
}
async function simpanSaldoAwal() {
  const { error } = await sb.from('kas_saldo_awal').update({ jumlah: Math.round(+$('#ks1').value || 0) }).eq('id', 1);
  if (error) return toast(error.message, 1);
  toast('Saldo awal disimpan'); muatKas();
}
function unduhKas() {
  if (!KAS) return;
  const { bl, rows, R, awal, akhir } = KAS;
  unduhBuku(`Kas-${bl}`, [['Kas', [[`Kas ${labelBulan(bl)}`], ['Saldo awal', awal], ['Masuk', +R.masuk], ['Keluar', +R.keluar], ['Saldo akhir', akhir], [], ['Tanggal', 'Jenis', 'Kategori', 'Uraian', 'Masuk', 'Keluar'],
    ...rows.slice().reverse().map(x => [x.tanggal, x.jenis, x.kategori, x.uraian, x.jenis === 'masuk' ? +x.jumlah : '', x.jenis === 'keluar' ? +x.jumlah : ''])]]]);
}

/* ===== GAJI GURU DAN STAF ===== */
let GJ = [];
const ROLE_STAF = { guru: 'Guru', tu: 'TU', kepsek: 'Kepala sekolah' };
async function vGaji() {
  $('#main').innerHTML = head('Gaji', 'Gaji guru dan staf', 'Siapkan daftar gaji sebulan (nominal disalin dari bulan lalu), sesuaikan, lalu tandai dibayar. Gaji yang dibayar masuk kas keluar otomatis.') +
    `<div class="sec"><label style="margin-top:0">Bulan</label><input id="gb1" type="month" value="${bulanWIB()}" onchange="muatGaji()"><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" onclick="siapkanGaji()">Siapkan gaji bulan ini</button><button class="btn alt" onclick="unduhGaji()">Unduh Excel</button></div></div><div id="gh1"></div>`;
  muatGaji();
}
async function muatGaji() {
  const bl = $('#gb1').value;
  if (!bl) return;
  const [g, st] = await Promise.all([sb.from('gaji').select('*').eq('periode', bl + '-01'), sb.from('v_staf').select('id,nama,role')]);
  const nm = Object.fromEntries(st.data.map(x => [x.id, x]));
  GJ = g.data.map(x => ({ ...x, nama: nm[x.guru_id]?.nama || '-', peran: ROLE_STAF[nm[x.guru_id]?.role] || '' })).sort((a, b) => a.nama.localeCompare(b.nama));
  const tot = GJ.reduce((u, x) => u + +x.bersih, 0), dibayar = GJ.filter(x => x.status === 'dibayar').reduce((u, x) => u + +x.bersih, 0);
  $('#gh1').innerHTML = GJ.length
    ? `<div class="sec"><h2>${labelBulan(bl)}</h2><div class="stats" style="margin-top:8px"><div class="stat"><small>Total gaji bersih</small><span class="num2">${RP(tot)}</span></div><div class="stat"><small>Sudah dibayar</small><span class="num2">${RP(dibayar)}</span></div></div></div>` +
      GJ.map(x => x.status === 'draft'
        ? `<div class="sec"><div class="row" style="border:0;padding:0"><span><b>${h(x.nama)}</b><br><small>${x.peran}</small></span><span class="stamp warn">Draft</span></div>
          <div style="display:flex;gap:6px"><div style="flex:1"><label>Pokok</label><input id="gp-${x.id}" type="number" inputmode="numeric" value="${Math.round(x.pokok)}"></div><div style="flex:1"><label>Tunjangan</label><input id="gt-${x.id}" type="number" inputmode="numeric" value="${Math.round(x.tunjangan)}"></div><div style="flex:1"><label>Potongan</label><input id="gx-${x.id}" type="number" inputmode="numeric" value="${Math.round(x.potongan)}"></div></div>
          <p class="hint" style="margin:6px 0 0">Bersih saat ini: ${RP(x.bersih)}</p><div style="display:flex;gap:8px"><button class="btn alt sm" style="margin-top:8px" onclick="simpanGaji(${x.id})">Simpan</button><button class="btn sm" style="margin-top:8px" onclick="bayarGaji(${x.id})">Simpan dan bayar</button></div></div>`
        : `<div class="sec"><div class="row" style="border:0;padding:0"><span><b>${h(x.nama)}</b><br><small>${x.peran} - dibayar ${tglPanjang(x.tgl_bayar)}</small></span><span style="text-align:right"><b>${RP(x.bersih)}</b><br><span class="stamp ok">Dibayar</span></span></div>
          <div style="display:flex;gap:8px"><button class="btn alt sm" style="margin-top:8px" onclick="slipPdf(${x.id})">Slip PDF</button><button class="btn alt sm" style="margin-top:8px" onclick="batalBayarGaji(${x.id})">Batalkan pembayaran</button></div></div>`).join('')
    : `<div class="sec">${kosongHtml('Belum ada daftar gaji bulan ini. Tekan Siapkan gaji bulan ini.')}</div>`;
}
async function siapkanGaji() {
  const { data, error } = await sb.rpc('buat_gaji_bulan', { p_periode: $('#gb1').value + '-01' });
  if (error) return toast(error.message, 1);
  toast(data.pesan); muatGaji();
}
async function simpanGaji(id, diam) {
  const o = { pokok: Math.round(+$('#gp-' + id).value || 0), tunjangan: Math.round(+$('#gt-' + id).value || 0), potongan: Math.round(+$('#gx-' + id).value || 0) };
  const { error } = await sb.from('gaji').update(o).eq('id', id);
  if (error) { toast(error.message, 1); return false; }
  if (!diam) { toast('Tersimpan'); muatGaji(); }
  return true;
}
async function bayarGaji(id) {
  const g = GJ.find(x => x.id === id);
  if (!confirm(`Bayar gaji ${g?.nama || ''}? Akan tercatat di kas keluar dan guru mendapat notifikasi.`)) return;
  if (!await simpanGaji(id, true)) return;
  const { data, error } = await sb.rpc('bayar_gaji', { p_id: id, p_tanggal: null });
  if (error) return toast(error.message, 1);
  toast(data.pesan, !data.ok); muatGaji();
}
async function batalBayarGaji(id) {
  if (!confirm('Batalkan pembayaran gaji ini? Catatan kas keluarnya ikut dihapus.')) return;
  const { data, error } = await sb.rpc('batal_bayar_gaji', { p_id: id });
  if (error) return toast(error.message, 1);
  toast(data.pesan, !data.ok); muatGaji();
}
function unduhGaji() {
  if (!GJ.length) return toast('Tidak ada data untuk diunduh', 1);
  unduhBuku(`Gaji-${$('#gb1').value}`, [['Gaji', [['Nama', 'Jabatan', 'Pokok', 'Tunjangan', 'Potongan', 'Bersih', 'Status', 'Tanggal bayar'], ...GJ.map(x => [x.nama, x.peran, +x.pokok, +x.tunjangan, +x.potongan, +x.bersih, x.status, x.tgl_bayar || ''])]]]);
}
async function slipPdf(id) {
  try {
    const [{ data: g }, ident] = await Promise.all([sb.from('gaji').select('*').eq('id', id).single(), muatIdentitas(), muatSkrip(JSPDF)]);
    if (!g) return toast('Slip tidak ditemukan', 1);
    const { data: st } = await sb.from('v_staf').select('nama,role').eq('id', g.guru_id);
    const nama = st[0]?.nama || me.nama, peran = ROLE_STAF[st[0]?.role] || '';
    await muatSkrip(AUTOTABLE);
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a5', orientation: 'landscape' }), W = 210;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text(SCHOOL, W / 2, 14, { align: 'center' });
    doc.setFontSize(11); doc.text('SLIP GAJI', W / 2, 20, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text(`Periode ${labelBulan(g.periode)}`, W / 2, 26, { align: 'center' });
    doc.text(`Nama: ${nama}${peran ? ' (' + peran + ')' : ''}`, 15, 36);
    doc.autoTable({ startY: 40, head: [['Komponen', 'Jumlah']], body: [['Gaji pokok', RP(g.pokok)], ['Tunjangan', RP(g.tunjangan)], ['Potongan', '- ' + RP(g.potongan)], [{ content: 'Gaji bersih', styles: { fontStyle: 'bold' } }, { content: RP(g.bersih), styles: { fontStyle: 'bold' } }]], theme: 'grid', styles: { fontSize: 10 }, headStyles: { fillColor: [27, 58, 107] }, margin: { left: 15, right: 15 }, columnStyles: { 1: { halign: 'right' } } });
    const y = doc.lastAutoTable.finalY + 8;
    doc.text(`${ident.kota ? ident.kota + ', ' : ''}${tglPanjang(g.tgl_bayar)}`, 195, y, { align: 'right' });
    doc.text('Penerima', 45, y + 6, { align: 'center' }); doc.text('Bendahara / TU', 160, y + 6, { align: 'center' });
    doc.line(20, y + 28, 70, y + 28); doc.line(135, y + 28, 185, y + 28);
    doc.save(`Slip-gaji-${nama.replace(/\s+/g, '-')}-${g.periode.slice(0, 7)}.pdf`);
    toast('Slip diunduh');
  } catch (e) { toast(e.message || 'Slip gagal dibuat', 1); }
}
async function vSlip() {
  const { data } = await sb.from('gaji').select('*').eq('guru_id', me.id).eq('status', 'dibayar').order('periode', { ascending: false });
  $('#main').innerHTML = head('Gaji', 'Slip gaji', 'Slip muncul setelah gaji bulan itu dibayarkan.') +
    `<div class="sec">${data.map(x => `<div class="row"><span><b>${labelBulan(x.periode)}</b><br><small>Dibayar ${tglPanjang(x.tgl_bayar)}</small></span><span style="text-align:right"><b>${RP(x.bersih)}</b><br><button class="btn alt sm" onclick="slipPdf(${x.id})">Slip PDF</button></span></div>`).join('') || kosongHtml('Belum ada slip gaji.')}</div>`;
}

/* ===== CATATAN BK (guru BK dan admin saja; semua lewat fungsi database yang mencatat akses) ===== */
const KAT_BK = { umum: 'Umum', akademik: 'Akademik', perilaku: 'Perilaku', pribadi: 'Pribadi', keluarga: 'Keluarga', karier: 'Karier dan studi lanjut' };
const TING_BK = { biasa: 'Biasa', perlu_perhatian: 'Perlu perhatian', mendesak: 'Mendesak' };
const STAMP_BK = { biasa: 'no', perlu_perhatian: 'warn', mendesak: 'bad' };
let BKR = {}, BKS = [], BKID = null;
function bolehBk() { return me && (me.role === 'admin' || (me.role === 'guru' && me.is_bk)); }
async function vBk() {
  if (!bolehBk()) { $('#main').innerHTML = head('BK', 'Catatan BK', 'Halaman ini hanya untuk guru BK dan admin.'); return; }
  const [s, k, r] = await Promise.all([sb.from('siswa').select('id,nama,nis,kelas(nama)').eq('status', 'aktif').order('nama'), sb.from('kelas').select('id,nama').order('nama'), sb.rpc('bk_ringkas')]);
  if (r.error) throw r.error;
  BKS = s.data; BKR = Object.fromEntries((r.data || []).map(x => [x.siswa_id, x])); BKID = null;
  $('#main').innerHTML = head('BK', 'Catatan bimbingan konseling', 'Data sensitif. Hanya guru BK dan admin yang bisa membuka. Setiap pembukaan catatan siswa tercatat.') +
    `<div class="sec"><input id="bkc" placeholder="Cari nama atau NIS" oninput="saringBk()"><label style="display:flex;gap:8px;align-items:center;font-weight:500"><input id="bkt" type="checkbox" style="width:auto" onchange="saringBk()"> Hanya yang sudah punya catatan</label></div><div id="bkl"></div><div id="bkd"></div>` +
    (me.role === 'admin' ? `<div class="sec"><h2>Riwayat akses</h2><p class="hint">Siapa membuka atau mengubah catatan siswa mana.</p><button class="btn alt" onclick="bukaLogBk()">Tampilkan riwayat</button><div id="bkg"></div></div>` : '');
  saringBk();
}
function saringBk() {
  const q = ($('#bkc').value || '').toLowerCase(), hanya = $('#bkt').checked;
  const l = BKS.filter(x => (!q || x.nama.toLowerCase().includes(q) || String(x.nis).includes(q)) && (!hanya || BKR[x.id]));
  $('#bkl').innerHTML = `<div class="sec">${l.slice(0, 60).map(x => { const r = BKR[x.id]; return `<div class="row" style="cursor:pointer" onclick="bukaBk(${x.id})"><span><b>${h(x.nama)}</b><br><small>${h(x.kelas?.nama || '-')} - NIS ${h(x.nis)}</small></span><span>${r ? `<span class="stamp ${r.tingkat >= 3 ? 'bad' : r.tingkat === 2 ? 'warn' : 'no'}">${r.jumlah} catatan</span>` : '<small>Belum ada</small>'}</span></div>`; }).join('') || kosongHtml('Tidak ada siswa yang cocok.')}${l.length > 60 ? `<p class="hint">Menampilkan 60 dari ${l.length}. Persempit pencarian.</p>` : ''}</div>`;
}
async function bukaBk(sid) {
  const { data, error } = await sb.rpc('bk_daftar', { p_siswa: sid });
  if (error) return toast(error.message, 1);
  BKID = sid; window.BKDATA = Object.fromEntries(data.map(x => [x.id, x]));
  const s = BKS.find(x => x.id === sid) || {};
  $('#bkd').innerHTML = `<div class="sec"><h2>${h(s.nama)}</h2><p class="hint">${h(s.kelas?.nama || '')} - catatan ini bersifat rahasia, jangan dibagikan atau difoto.</p>
    ${data.map(x => `<div style="padding:10px 0;border-top:1px solid var(--line)"><div class="row" style="border:0;padding:0"><span><b>${tglPanjang(x.tanggal)}</b> <small>${KAT_BK[x.kategori]} - ${h(x.penulis || '-')}</small></span><span class="stamp ${STAMP_BK[x.tingkat]}">${TING_BK[x.tingkat]}</span></div>
      <p style="margin:6px 0;white-space:pre-line">${h(x.catatan)}</p>${x.tindak_lanjut ? `<p class="hint" style="white-space:pre-line"><b>Tindak lanjut:</b> ${h(x.tindak_lanjut)}</p>` : ''}
      <div style="display:flex;gap:6px">${x.milik_saya ? `<button class="btn alt sm" onclick="isiFormBk(${x.id})">Ubah</button>` : ''}${x.milik_saya || me.role === 'admin' ? `<button class="btn alt sm" onclick="hapusBk(${x.id})">Hapus</button>` : ''}</div></div>`).join('') || kosongHtml('Belum ada catatan untuk siswa ini.')}
    <h3 class="sub" id="bkj">Tambah catatan</h3><input type="hidden" id="bki" value=""><label style="margin-top:0">Tanggal</label><input id="bkp" type="date" value="${hariWIB()}">
    <label>Kategori</label><select id="bkk">${Object.entries(KAT_BK).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select>
    <label>Tingkat</label><select id="bkv">${Object.entries(TING_BK).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select>
    <label>Catatan</label><textarea id="bkn" rows="4"></textarea><label>Tindak lanjut (boleh kosong)</label><textarea id="bku" rows="2"></textarea>
    <button class="btn" onclick="simpanBk()">Simpan catatan</button></div>`;
  $('#bkd').scrollIntoView();
}
function isiFormBk(id) {
  const x = window.BKDATA[id];
  $('#bki').value = id; $('#bkp').value = x.tanggal; $('#bkk').value = x.kategori; $('#bkv').value = x.tingkat; $('#bkn').value = x.catatan; $('#bku').value = x.tindak_lanjut || '';
  $('#bkj').textContent = 'Ubah catatan'; $('#bkj').scrollIntoView();
}
async function simpanBk() {
  const id = $('#bki').value ? +$('#bki').value : null;
  const { data, error } = await sb.rpc('bk_simpan', { p_id: id, p_siswa: BKID, p_tanggal: $('#bkp').value || null, p_kategori: $('#bkk').value, p_tingkat: $('#bkv').value, p_catatan: $('#bkn').value, p_tindak: $('#bku').value });
  if (error) return toast(error.message, 1);
  toast(data.pesan, !data.ok);
  if (data.ok) { const r = await sb.rpc('bk_ringkas'); BKR = Object.fromEntries((r.data || []).map(x => [x.siswa_id, x])); saringBk(); bukaBk(BKID); }
}
async function hapusBk(id) {
  if (!confirm('Hapus catatan ini? Tindakan ini tidak bisa dibatalkan.')) return;
  const { data, error } = await sb.rpc('bk_hapus', { p_id: id });
  if (error) return toast(error.message, 1);
  toast(data.pesan, !data.ok);
  if (data.ok) { const r = await sb.rpc('bk_ringkas'); BKR = Object.fromEntries((r.data || []).map(x => [x.siswa_id, x])); saringBk(); bukaBk(BKID); }
}
async function bukaLogBk() {
  const { data, error } = await sb.rpc('bk_log_baca', { p_batas: 100 });
  if (error) return toast(error.message, 1);
  const A = { BACA: 'Membuka', TULIS: 'Menulis', UBAH: 'Mengubah', HAPUS: 'Menghapus' };
  $('#bkg').innerHTML = data.map(x => `<div class="row"><span>${h(x.pengguna || '-')} - ${A[x.aksi] || x.aksi}<br><small>${h(x.siswa || '-')}</small></span><small>${new Date(x.created_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></div>`).join('') || kosongHtml('Belum ada riwayat.');
}

/* ===== DATA DIRI SISWA DAN ORANG TUA (susunan kolom mengikuti lembar "Data Siswa" e-Rapor) ===== */
const AGAMA = ['Islam', 'Kristen', 'Katolik', 'Hindu', 'Buddha', 'Konghucu', 'Lainnya'];
// [kolom database, label, jenis isian: t teks, d tanggal, n angka, jk L/P, ag agama, a alamat]
const F_SISWA = [['nisn', 'NISN', 't'], ['jenis_kelamin', 'Jenis kelamin', 'jk'], ['tempat_lahir', 'Tempat lahir', 't'], ['tanggal_lahir', 'Tanggal lahir', 'd'], ['agama', 'Agama', 'ag'], ['anak_ke', 'Anak ke-', 'n'], ['pendidikan_sebelumnya', 'Pendidikan sebelumnya (TK/PAUD/SD)', 't'], ['tgl_masuk', 'Diterima di sekolah ini (tanggal)', 'd'], ['alamat', 'Alamat (jalan, RT/RW)', 'a'], ['kelurahan', 'Kelurahan/Desa', 't'], ['kecamatan', 'Kecamatan', 't']];
const F_ORTU = [['nama_ayah', 'Nama ayah', 't'], ['pekerjaan_ayah', 'Pekerjaan ayah', 't'], ['nama_ibu', 'Nama ibu', 't'], ['pekerjaan_ibu', 'Pekerjaan ibu', 't'], ['alamat_ortu', 'Alamat orang tua (jalan, RT/RW)', 'a'], ['kelurahan_ortu', 'Kelurahan/Desa', 't'], ['kecamatan_ortu', 'Kecamatan', 't'], ['nama_wali', 'Nama wali (jika bukan orang tua)', 't'], ['pekerjaan_wali', 'Pekerjaan wali', 't']];
const KOLOM_EXTRA = [...F_SISWA, ...F_ORTU].map(x => x[0]);
const KOLOM_JENIS = Object.fromEntries([...F_SISWA, ...F_ORTU].map(x => [x[0], x[2]]));

function tglIso(v) {
  if (v instanceof Date && !isNaN(v)) { const d = new Date(v.getTime() + 12 * 36e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  const t = String(v ?? '').trim();
  if (!t) return '';
  let d, m, y, r;
  if ((r = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) [y, m, d] = [r[1], r[2], r[3]];
  else if ((r = t.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2,4})$/))) { [d, m, y] = [r[1], r[2], r[3]]; if (y.length === 2) y = (+y > (new Date().getFullYear() % 100) ? '19' : '20') + y; }
  else if ((r = t.match(/^(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})$/))) { const i = NAMA_BULAN.findIndex(n => n.toLowerCase().startsWith(r[2].toLowerCase().slice(0, 3))); if (i < 0) return null; [d, m, y] = [r[1], i + 1, r[3]]; }
  else return null;
  d = +d; m = +m; y = +y;
  const k = new Date(y, m - 1, d);
  if (y < 1990 || y > 2100 || k.getMonth() !== m - 1 || k.getDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function normJk(v) { const t = String(v ?? '').trim().toLowerCase(); if (!t) return ''; if (['l', 'lk', 'laki', 'laki-laki', 'laki laki', 'pria'].includes(t)) return 'L'; if (['p', 'pr', 'perempuan', 'wanita'].includes(t)) return 'P'; return null; }
function umurDari(tgl) {
  if (!tgl) return null;
  const l = new Date(String(tgl).slice(0, 10) + 'T00:00:00'), n = new Date();
  let u = n.getFullYear() - l.getFullYear();
  if (n.getMonth() < l.getMonth() || (n.getMonth() === l.getMonth() && n.getDate() < l.getDate())) u--;
  return u;
}
const kekurangan = x => [!x.jenis_kelamin && 'L/P', !x.tempat_lahir && 'tempat lahir', !x.tanggal_lahir && 'tanggal lahir', !x.alamat && 'alamat', !(x.nama_ayah || x.nama_ibu || x.nama_wali) && 'orang tua/wali'].filter(Boolean);
const adaIsi = v => v != null && String(v).trim() !== '';
const alamatGabung = (a, k, c) => [a, k && 'Kel/Desa ' + k, c && 'Kec. ' + c].filter(adaIsi).join(', ');

/* ----- dasbor data siswa per kelas (guru, admin, kepala sekolah, TU) ----- */
let DK = { kelas: [], siswa: [] };
async function vDataKelas() {
  const k = await sb.from('kelas').select('id,nama,wali_kelas_id').order('nama');
  DK.kelas = k.data;
  const awal = k.data.find(x => x.wali_kelas_id === me.id) || k.data[0];
  $('#main').innerHTML = head('Siswa', 'Data siswa per kelas', 'Data diri siswa dan orang tua. Ketuk nama siswa untuk melihat lengkapnya.') +
    `<div class="sec"><label style="margin-top:0">Kelas</label><select id="dkk" onchange="muatDataKelas()">${opt(k.data, 'id', 'nama')}</select><input id="dkc" placeholder="Cari nama atau NIS" oninput="saringDataKelas()" style="margin-top:8px"></div>
    <div id="dkr"></div><div id="dkl"></div><div id="dkd"></div>`;
  if (awal) $('#dkk').value = awal.id;
  await muatDataKelas();
}
async function muatDataKelas() {
  const kid = +$('#dkk').value;
  if (!kid) { $('#dkr').innerHTML = ''; $('#dkl').innerHTML = `<div class="sec">${kosongHtml('Belum ada kelas.')}</div>`; return; }
  DK.siswa = await ambil(() => sb.from('siswa').select('*').eq('kelas_id', kid).eq('status', 'aktif').order('nama').order('id'));
  $('#dkd').innerHTML = '';
  const S = DK.siswa, L = S.filter(x => x.jenis_kelamin === 'L').length, P = S.filter(x => x.jenis_kelamin === 'P').length, kurang = S.filter(x => kekurangan(x).length).length;
  const bln = bulanWIB().slice(5, 7), ultah = S.filter(x => x.tanggal_lahir && String(x.tanggal_lahir).slice(5, 7) === bln).sort((a, b) => String(a.tanggal_lahir).slice(8, 10).localeCompare(String(b.tanggal_lahir).slice(8, 10)));
  const stat = (n, t) => `<div class="stat"><span class="num">${n}</span><small>${t}</small></div>`;
  const kls = DK.kelas.find(x => x.id === kid);
  $('#dkr').innerHTML = `<div class="stats" style="margin-bottom:12px">${stat(S.length, 'Siswa')}${stat(L, 'Laki-laki')}${stat(P, 'Perempuan')}${stat(kurang, 'Data belum lengkap')}</div>
    ${ultah.length ? `<div class="sec"><h2>Ulang tahun bulan ini</h2>${ultah.map(x => `<div class="row"><span>${h(x.nama)}</span><small>${+String(x.tanggal_lahir).slice(8, 10)} ${NAMA_BULAN[+bln - 1]} (${umurDari(x.tanggal_lahir) + 0} tahun)</small></div>`).join('')}</div>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px"><button class="btn alt sm" onclick="unduhDataKelas()">Unduh Excel kelas ${h(kls?.nama || '')}</button><button class="btn alt sm" onclick="kmBukuInduk(null)">Buku induk kelas (PDF)</button>${['admin', 'tu'].includes(me.role) ? '<button class="btn alt sm" onclick="go(\'datasiswa\')">Ubah data siswa</button>' : ''}</div>`;
  saringDataKelas();
}
function saringDataKelas() {
  const q = ($('#dkc').value || '').toLowerCase();
  const l = DK.siswa.filter(x => !q || x.nama.toLowerCase().includes(q) || String(x.nis).includes(q));
  $('#dkl').innerHTML = `<div class="sec"><h2>${l.length} siswa</h2>${l.map((x, i) => { const kr = kekurangan(x); return `<div class="row" style="cursor:pointer" onclick="bukaSiswaKelas(${x.id})"><span><b>${h(x.nama)}</b><br><small>${x.jenis_kelamin === 'L' ? 'Laki-laki' : x.jenis_kelamin === 'P' ? 'Perempuan' : 'L/P ?'} - ${x.tanggal_lahir ? h(x.tempat_lahir || '') + (x.tempat_lahir ? ', ' : '') + tglPanjang(x.tanggal_lahir) : 'Tanggal lahir belum diisi'}</small></span><span>${kr.length ? '<span class="stamp warn">Belum lengkap</span>' : '<span class="stamp ok">Lengkap</span>'}</span></div>`; }).join('') || kosongHtml('Tidak ada siswa yang cocok.')}</div>`;
}
function bukaSiswaKelas(id) {
  const x = DK.siswa.find(y => y.id === id);
  if (!x) return;
  const r = (t, v) => `<div class="row" style="align-items:flex-start"><small style="min-width:42%">${t}</small><span style="text-align:right">${adaIsi(v) ? h(v) : '<span class="mut">-</span>'}</span></div>`;
  const hp = nomorWa(x.hp_wali), kr = kekurangan(x), umur = umurDari(x.tanggal_lahir);
  $('#dkd').innerHTML = `<div class="sec"><h2>${h(x.nama)}</h2>${kr.length ? `<p class="hint"><span class="stamp warn">Belum lengkap</span> Belum diisi: ${kr.join(', ')}</p>` : ''}
    <h3 class="sub">Data peserta didik</h3>${r('NIS', x.nis)}${r('NISN', x.nisn)}${r('Jenis kelamin', x.jenis_kelamin === 'L' ? 'Laki-laki' : x.jenis_kelamin === 'P' ? 'Perempuan' : '')}${r('Tempat lahir', x.tempat_lahir)}${r('Tanggal lahir', x.tanggal_lahir ? tglPanjang(x.tanggal_lahir) + (umur != null ? ` (${umur} tahun)` : '') : '')}${r('Agama', x.agama)}${r('Anak ke-', x.anak_ke)}${r('Pendidikan sebelumnya', x.pendidikan_sebelumnya)}${r('Diterima di sekolah ini', x.tgl_masuk ? tglPanjang(x.tgl_masuk) : '')}${r('Alamat', alamatGabung(x.alamat, x.kelurahan, x.kecamatan))}
    <h3 class="sub">Orang tua</h3>${r('Nama ayah', x.nama_ayah)}${r('Pekerjaan ayah', x.pekerjaan_ayah)}${r('Nama ibu', x.nama_ibu)}${r('Pekerjaan ibu', x.pekerjaan_ibu)}${r('Alamat orang tua', alamatGabung(x.alamat_ortu, x.kelurahan_ortu, x.kecamatan_ortu))}
    <h3 class="sub">Wali dan kontak</h3>${r('Nama wali', x.nama_wali)}${r('Pekerjaan wali', x.pekerjaan_wali)}${r('Nomor HP', x.hp_wali ? tampilHp(x.hp_wali) : '')}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn alt sm" style="margin:0" onclick="kmBukuInduk(${x.id})">Buku induk (PDF)</button>${['admin', 'tu'].includes(me.role) ? `<button class="btn sm" style="margin:0" onclick="window.DS_BUKA=${x.id};go('datasiswa')">Ubah data siswa ini</button>` : ''}</div>
    ${hpValid(hp) ? `<div style="display:flex;gap:8px;margin-top:10px"><a class="btn alt sm" style="${tombolLink}" href="tel:+${hp}">Telepon</a><a class="btn alt sm" style="${tombolLink}" target="_blank" rel="noopener" href="${linkWa(hp, 'Yth. Bapak/Ibu wali dari ' + x.nama + ', ')}">WhatsApp</a></div>` : ''}</div>`;
  $('#dkd').scrollIntoView();
}
function unduhDataKelas() {
  const kid = +$('#dkk').value, kls = DK.kelas.find(x => x.id === kid), S = DK.siswa;
  if (!S.length) return toast('Tidak ada data untuk diunduh', 1);
  const kepala = ['No', 'Nama peserta didik', 'NIS', 'NISN', 'L/P', 'Tempat lahir', 'Tanggal lahir', 'Agama', 'Anak ke', 'Pendidikan sebelumnya', 'Diterima di sekolah ini', 'Alamat', 'Kelurahan/Desa', 'Kecamatan', 'Nama ayah', 'Nama ibu', 'Pekerjaan ayah', 'Pekerjaan ibu', 'Alamat orang tua', 'Kelurahan/Desa (ortu)', 'Kecamatan (ortu)', 'Nama wali', 'Pekerjaan wali', 'HP wali'];
  unduhBuku(`Data-siswa-${kls?.nama || 'kelas'}`, [['Data siswa', [kepala, ...S.map((x, i) => [i + 1, x.nama, x.nis, x.nisn || '', x.jenis_kelamin || '', x.tempat_lahir || '', x.tanggal_lahir || '', x.agama || '', x.anak_ke || '', x.pendidikan_sebelumnya || '', x.tgl_masuk || '', x.alamat || '', x.kelurahan || '', x.kecamatan || '', x.nama_ayah || '', x.nama_ibu || '', x.pekerjaan_ayah || '', x.pekerjaan_ibu || '', x.alamat_ortu || '', x.kelurahan_ortu || '', x.kecamatan_ortu || '', x.nama_wali || '', x.pekerjaan_wali || '', tampilHp(x.hp_wali) === '-' ? '' : tampilHp(x.hp_wali)])]]]);
}

/* ----- ubah data siswa (TU dan admin) ----- */
let DSW = [], DSK = [];
async function vDataSiswa() {
  const [s, k] = await Promise.all([ambil(() => sb.from('siswa').select('*,kelas(nama)').order('nama').order('id')), sb.from('kelas').select('id,nama').order('nama')]);
  DSW = s; DSK = k.data;
  $('#main').innerHTML = head('Data', 'Data siswa', 'Ubah data diri siswa dan orang tua. Untuk memasukkan banyak siswa sekaligus, pakai Impor dari Excel.') +
    `<div class="sec"><div style="display:flex;gap:8px"><input id="dsc" placeholder="Cari nama atau NIS" oninput="saringDs()"><select id="dsk" style="width:auto" onchange="saringDs()"><option value="">Semua</option>${opt(k.data, 'id', 'nama')}</select></div><button class="btn alt" onclick="go('impor')">Impor dari Excel</button></div>
    <div id="dsl"></div><div id="dse"></div>
    <div class="sec"><h2>Tambah siswa</h2><label style="margin-top:0">NIS</label><input id="dn1"><label>Nama lengkap</label><input id="dn2"><label>Kelas</label><select id="dn3"><option value="">Pilih kelas</option>${opt(k.data, 'id', 'nama')}</select>
    <label>Nomor HP wali</label><input id="dn5" inputmode="tel" placeholder="08123456789"><p class="hint">Data lainnya (tanggal lahir, alamat, orang tua) diisi lewat Ubah setelah siswa tersimpan.</p><button class="btn" onclick="tambahSiswaDs()">Simpan siswa</button></div>`;
  saringDs();
  if (window.DS_BUKA) { const id = window.DS_BUKA; window.DS_BUKA = null; ubahDs(id); }
}
function saringDs() {
  const q = ($('#dsc').value || '').toLowerCase(), kid = +$('#dsk').value || null;
  const l = DSW.filter(x => (x.status || 'aktif') === 'aktif' && (!kid || x.kelas_id === kid) && (!q || x.nama.toLowerCase().includes(q) || String(x.nis).includes(q)));
  $('#dsl').innerHTML = `<div class="sec"><h2>${l.length} siswa aktif</h2>${l.slice(0, 80).map(x => `<div class="row" style="cursor:pointer" onclick="ubahDs(${x.id})"><span><b>${h(x.nama)}</b> <small>${h(x.kelas?.nama || 'Tanpa kelas')}</small><br><small>NIS ${h(x.nis)} - Ayah: ${h(x.nama_ayah || '-')} - Ibu: ${h(x.nama_ibu || '-')}</small></span><span>${kekurangan(x).length ? '<span class="stamp warn">Belum lengkap</span>' : '<span class="stamp ok">Lengkap</span>'}</span></div>`).join('') || kosongHtml('Tidak ada siswa.')}${l.length > 80 ? `<p class="hint">Menampilkan 80 dari ${l.length}. Persempit pencarian.</p>` : ''}</div>`;
}
function isianDs(f, x) {
  const [k, t, j] = f, v = x[k] ?? '';
  const id = 'f-' + k;
  const kontrol = j === 'jk' ? `<select id="${id}"><option value="">Pilih</option><option value="L" ${v === 'L' ? 'selected' : ''}>Laki-laki</option><option value="P" ${v === 'P' ? 'selected' : ''}>Perempuan</option></select>`
    : j === 'ag' ? `<select id="${id}"><option value="">Pilih</option>${AGAMA.map(a => `<option ${a === v ? 'selected' : ''}>${a}</option>`).join('')}</select>`
    : j === 'd' ? `<input id="${id}" type="date" value="${h(String(v).slice(0, 10))}">`
    : j === 'n' ? `<input id="${id}" type="number" min="1" inputmode="numeric" value="${h(v)}">`
    : j === 'a' ? `<textarea id="${id}" rows="2">${h(v)}</textarea>`
    : `<input id="${id}" value="${h(v)}">`;
  return `<label>${t}</label>${kontrol}`;
}
function ubahDs(id) {
  const x = DSW.find(y => y.id === id);
  if (!x) return;
  $('#dse').innerHTML = `<div class="sec" id="dsf"><h2>Ubah ${h(x.nama)}</h2><label style="margin-top:0">Nama lengkap</label><input id="de1" value="${h(x.nama)}"><label>Kelas</label><select id="de2">${DSK.map(k => `<option value="${k.id}" ${k.id === x.kelas_id ? 'selected' : ''}>${h(k.nama)}</option>`).join('')}</select>
    <h3 class="sub">Data peserta didik</h3>${F_SISWA.map(f => isianDs(f, x)).join('')}
    <h3 class="sub">Orang tua dan wali</h3>${F_ORTU.map(f => isianDs(f, x)).join('')}
    <button class="btn alt sm" style="margin-top:8px" onclick="salinAlamatKeOrtu()">Samakan alamat orang tua dengan alamat siswa</button>
    <label>Nomor HP wali / orang tua</label><input id="de4" inputmode="tel" value="${h(x.hp_wali ? tampilHp(x.hp_wali) : '')}"><button class="btn" onclick="simpanDs(${id})">Simpan</button></div>`;
  $('#dsf').scrollIntoView();
}
function salinAlamatKeOrtu() { $('#f-alamat_ortu').value = $('#f-alamat').value; $('#f-kelurahan_ortu').value = $('#f-kelurahan').value; $('#f-kecamatan_ortu').value = $('#f-kecamatan').value; }
async function simpanDs(id) {
  const hp = nomorWa($('#de4').value);
  if (hp && !hpValid(hp)) return toast('Nomor HP tidak valid', 1);
  const o = { nama: $('#de1').value.trim(), kelas_id: +$('#de2').value || null, hp_wali: hp || null };
  if (!o.nama) return toast('Nama tidak boleh kosong', 1);
  KOLOM_EXTRA.forEach(k => { const v = ($('#f-' + k).value || '').trim(); o[k] = !v ? null : KOLOM_JENIS[k] === 'n' ? Math.max(1, Math.round(+v)) : v; });
  const { error } = await sb.from('siswa').update(o).eq('id', id);
  if (error) return toast(error.message, 1);
  toast('Data siswa disimpan'); await vDataSiswa();
}
async function tambahSiswaDs() {
  const hp = nomorWa($('#dn5').value), o = { nis: $('#dn1').value.trim(), nama: $('#dn2').value.trim(), kelas_id: +$('#dn3').value || null, hp_wali: hp || null };
  if (!o.nis || !o.nama) return toast('Isi NIS dan nama dulu', 1);
  if (hp && !hpValid(hp)) return toast('Nomor HP tidak valid', 1);
  const { error } = await sb.from('siswa').insert(o);
  if (error) return toast(String(error.message).includes('duplicate') ? 'NIS ini sudah ada' : error.message, 1);
  toast('Siswa ditambahkan'); await vDataSiswa();
}

/* ===== BERANDA TU ===== */
async function vTuBeranda() {
  const bl = bulanWIB(), [sp, kas, gj, sw] = await Promise.all([
    sb.rpc('ringkas_spp'), sb.rpc('ringkas_kas', { p_dari: bl + '-01', p_sampai: akhirBulan(bl) }),
    sb.from('gaji').select('id,status').eq('periode', bl + '-01'),
    sb.from('siswa').select('id', { count: 'exact', head: true }).eq('status', 'aktif')
  ]);
  if (sp.error) throw sp.error;
  const S = sp.data, K = kas.data || {}, G = gj.data || [];
  const call = (n, t, b, k) => `<div class="call"><span><b>${n}</b> ${t}</span><button class="btn sm" onclick="go('${k}')">${b}</button></div>`;
  const stat = (n, t) => `<div class="stat"><span class="num2">${n}</span><small>${t}</small></div>`;
  $('#main').innerHTML = head('Beranda', 'Tata usaha', new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Jakarta' })) +
    (+S.siswa_telat ? call(S.siswa_telat + ' siswa', `lewat jatuh tempo, ${RP(S.total_telat)}`, 'Tunggakan', 'tunggakan') : '') +
    (!G.length ? call('Gaji ' + labelBulan(bl), 'belum disiapkan', 'Siapkan', 'gaji') : G.some(x => x.status === 'draft') ? call(G.filter(x => x.status === 'draft').length + ' gaji', 'belum dibayar bulan ini', 'Buka', 'gaji') : '') +
    `<div class="stats" style="margin-bottom:16px">${stat(sw.count ?? '-', 'Siswa aktif')}${stat(RP(S.total_sisa), 'Belum dibayar')}</div>
    <div class="stats" style="margin-bottom:16px">${stat(RP(K.masuk), 'Kas masuk bulan ini')}${stat(RP(K.keluar), 'Kas keluar bulan ini')}</div>
    <div class="sec"><h2>Pekerjaan cepat</h2><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" onclick="go('spp')">Catat pembayaran SPP</button><button class="btn alt sm" onclick="go('impor')">Impor siswa dari Excel</button><button class="btn alt sm" onclick="go('datasiswa')">Data siswa</button><button class="btn alt sm" onclick="go('kas')">Kas</button></div></div>`;
}

/* ===== PENGATURAN SEKOLAH (admin) ===== */
async function vPengaturan() {
  const [k, g, ta, ps] = await Promise.all([sb.from('kelas').select('id,nama,wali_kelas_id').order('nama'), sb.from('v_direktori').select('id,nama,role').eq('role', 'guru'), sb.from('tahun_ajaran').select('*').order('id'), sb.from('pengaturan').select('*')]);
  const P = Object.fromEntries(ps.data.map(x => [x.kunci, x.nilai])), pg = P.pengingat || {}, pr = P.presensi_guru || {}, id = await muatIdentitas();
  const cek = (i, v, t) => `<label style="display:flex;gap:8px;align-items:center;font-weight:500"><input id="${i}" type="checkbox" style="width:auto" ${v !== false ? 'checked' : ''}> ${t}</label>`;
  $('#main').innerHTML = head('Pengaturan', 'Pengaturan sekolah', 'Wali kelas, tanggal pembagian raport, pengingat otomatis, dan identitas yang tampil di dokumen.') +
    `<div class="sec"><h2>Wali kelas</h2><p class="hint">Wali kelas menerima pengingat absensi dan tampil di raport.</p>${k.data.map(x => `<div class="row"><span>${h(x.nama)}</span><select style="width:auto;max-width:60%" onchange="simpanWali(${x.id},this.value)"><option value="">Belum diatur</option>${g.data.map(y => `<option value="${y.id}" ${y.id === x.wali_kelas_id ? 'selected' : ''}>${h(y.nama)}</option>`).join('')}</select></div>`).join('') || kosongHtml('Belum ada kelas.')}</div>
    <div class="sec"><h2>Tanggal pembagian raport</h2><p class="hint">Guru yang nilai ujian akhirnya belum lengkap diingatkan mulai seminggu sebelum tanggal ini.</p>${ta.data.map(x => `<div class="row"><span>Semester ${x.semester} ${h(x.nama)}${x.aktif ? ' <span class="stamp ok">Aktif</span>' : ''}</span><input type="date" style="width:auto" value="${h(x.tgl_raport || '')}" onchange="simpanTglRaport(${x.id},this.value)"></div>`).join('') || kosongHtml('Belum ada semester.')}</div>
    <div class="sec"><h2>Pengingat otomatis</h2>${cek('pg1', pg.absen_aktif, 'Ingatkan guru jika absensi kelas belum diisi')}<label>Batas jam absensi (WIB)</label><input id="pg2" type="time" value="${h(pg.absen_jam || '09:00')}">
    ${cek('pg3', pg.nilai_aktif, 'Ingatkan guru jika nilai ujian akhir belum lengkap menjelang raport')}<label>Mulai berapa hari sebelum raport</label><input id="pg4" type="number" min="1" max="30" value="${pg.nilai_hari || 7}">
    ${cek('pg5', pg.spp_aktif, 'Ingatkan orang tua tentang tagihan SPP')}<label>Mulai berapa hari sebelum jatuh tempo</label><input id="pg6" type="number" min="1" max="14" value="${pg.spp_hari || 3}">
    <p class="hint" style="margin-top:10px">Agenda yang judulnya diawali "Libur" dianggap hari libur dan tidak memicu pengingat absensi. Pengingat berjalan otomatis lewat pg_cron (lihat panduan).</p><button class="btn" onclick="simpanPengingat()">Simpan pengingat</button></div>
    <div class="sec"><h2>Presensi guru</h2><label style="margin-top:0">Batas jam masuk (WIB)</label><input id="pj1" type="time" value="${h(pr.jam_masuk || '07:15')}"><p class="hint">Presensi setelah jam ini ditandai terlambat.</p><button class="btn" onclick="simpanPresensiGuru()">Simpan</button></div>
    <div class="sec"><h2>Identitas dokumen</h2><label style="margin-top:0">Nama kepala sekolah</label><input id="pi1" value="${h(id.kepsek)}"><label>Kota (untuk tanggal di raport dan slip)</label><input id="pi2" value="${h(id.kota)}">
    <label>Cara pembayaran (tampil untuk orang tua)</label><textarea id="pi3" rows="3" placeholder="Contoh: Bayar di TU jam 07.30-13.00 atau transfer ke Bank X no. 123 a.n. Sekolah">${h(id.info_bayar)}</textarea><button class="btn" onclick="simpanIdentitas()">Simpan</button></div>`;
}
async function simpanWali(kid, gid) {
  const { error } = await sb.from('kelas').update({ wali_kelas_id: gid || null }).eq('id', kid);
  toast(error ? error.message : 'Wali kelas disimpan', !!error);
}
async function simpanTglRaport(id, v) {
  const { error } = await sb.from('tahun_ajaran').update({ tgl_raport: v || null }).eq('id', id);
  toast(error ? error.message : 'Tanggal disimpan', !!error);
}
async function simpanPengaturan(kunci, nilai, pesan) {
  const { error } = await sb.from('pengaturan').upsert({ kunci, nilai }, { onConflict: 'kunci' });
  toast(error ? error.message : pesan, !!error);
}
function simpanPengingat() {
  simpanPengaturan('pengingat', { absen_aktif: $('#pg1').checked, absen_jam: $('#pg2').value || '09:00', nilai_aktif: $('#pg3').checked, nilai_hari: Math.max(1, +$('#pg4').value || 7), spp_aktif: $('#pg5').checked, spp_hari: Math.max(1, +$('#pg6').value || 3) }, 'Pengingat disimpan');
}
function simpanPresensiGuru() { simpanPengaturan('presensi_guru', { jam_masuk: $('#pj1').value || '07:15' }, 'Pengaturan disimpan'); }
function simpanIdentitas() { const lama = IDENT || {}; IDENT = null; simpanPengaturan('identitas', { ...lama, kepsek: $('#pi1').value.trim(), kota: $('#pi2').value.trim(), info_bayar: $('#pi3').value.trim() }, 'Identitas disimpan'); }
