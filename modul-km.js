/* Portal Sekolah - Penilaian Kurikulum Merdeka.
   Alur mengikuti e-Rapor Sekolah Penggerak: identitas sekolah, tujuan pembelajaran per mapel, nilai formatif (per TP),
   nilai sumatif (per lingkup materi, tes dan non tes), rekap nilai akhir, sampul dan raport dengan capaian kompetensi.
   Dimuat setelah modul-v3.js dan sebelum app.js. Memakai fungsi bantu dari app.js dan modul-v3.js. */

/* ===== konteks: semester, kelas, mapel ===== */
const KM = { siap: false, ta: null, tas: [], kelas: null, mapel: null, kelasList: [], mapelAll: [], pengampu: [], bobot: { formatif: 30, materi: 40, semester: 30 }, layar: 'km', tahap: 'materi', mode: 'mapel' };
function kmSimpanPilihan() { try { sessionStorage.setItem('km', JSON.stringify({ k: KM.kelas, m: KM.mapel, t: KM.ta && KM.ta.id })); } catch { /* penyimpanan tidak tersedia */ } }
async function kmMuat(paksa) {
  if (KM.siap && KM.uid === me.id && !paksa) return;
  KM.uid = me.id;
  const [ta, kl, mp, pg, bb] = await Promise.all([
    sb.from('tahun_ajaran').select('*').order('id'),
    sb.from('kelas').select('id,nama,tingkat,wali_kelas_id').order('nama'),
    sb.from('mapel').select('*').order('urutan').order('nama'),
    me.role === 'guru' ? sb.from('pengampu').select('kelas_id,mapel_id,guru_id').eq('guru_id', me.id) : sb.from('pengampu').select('kelas_id,mapel_id,guru_id'),
    sb.from('pengaturan').select('nilai').eq('kunci', 'bobot_km'),
    muatIdentitas()
  ]);
  let simpan = {}; try { simpan = JSON.parse(sessionStorage.getItem('km') || '{}'); } catch { /* abaikan */ }
  KM.tas = ta.data;
  KM.ta = ta.data.find(x => x.id === simpan.t) || ta.data.find(x => x.aktif) || ta.data[ta.data.length - 1] || null;
  KM.mapelAll = mp.data; KM.pengampu = pg.data;
  KM.semuaKelas = kl.data;
  KM.kelasList = ['admin', 'kepsek'].includes(me.role) ? kl.data : kl.data.filter(k => pg.data.some(p => p.kelas_id === k.id) || k.wali_kelas_id === me.id);
  const b = bb.data && bb.data[0] && bb.data[0].nilai; if (b) KM.bobot = { formatif: +b.formatif || 0, materi: +b.materi || 0, semester: +b.semester || 0 };
  KM.kelas = (KM.kelasList.find(x => x.id === simpan.k) || KM.kelasList[0] || {}).id || null;
  KM.mapel = simpan.m || null;
  KM.siap = true;
}
function kmNormal() {   // pastikan mapel terpilih valid untuk kelas ini
  if (!KM.kelas) return;
  const mp = kmMapelPilihan(KM.kelas);
  if (!mp.some(m => m.id === KM.mapel)) KM.mapel = mp[0] ? mp[0].id : null;
}
async function kmSiap() { await kmMuat(); kmNormal(); }
const kmKelas = () => KM.kelasList.find(x => x.id === KM.kelas) || null;
// mapel yang boleh dipilih untuk kelas ini: guru hanya mapelnya sendiri; admin dan kepala sekolah semua mapel kelas itu
function kmMapelPilihan(kid) {
  const tulis = ['admin', 'kepsek'].includes(me.role);
  let ids = KM.pengampu.filter(p => p.kelas_id === kid && (tulis || p.guru_id === me.id)).map(p => p.mapel_id);
  let l = KM.mapelAll.filter(m => ids.includes(m.id));
  if (!l.length && me.role === 'admin') l = KM.mapelAll;
  return l;
}
const kmMapel = () => KM.mapelAll.find(x => x.id === KM.mapel) || null;
const kmBisaTulis = () => me.role === 'admin' || (me.role === 'guru' && KM.pengampu.some(p => p.kelas_id === KM.kelas && p.mapel_id === KM.mapel && p.guru_id === me.id));
const faseDari = t => t <= 2 ? 'A' : t <= 4 ? 'B' : t <= 6 ? 'C' : t <= 9 ? 'D' : t === 10 ? 'E' : 'F';
const fmtN = v => v == null || v === '' ? '' : String(+(+v).toFixed(2));
const rataArr = a => { const v = a.filter(x => x != null && !isNaN(x)); return v.length ? v.reduce((u, x) => u + +x, 0) / v.length : null; };
function angkaNilai(v) {   // '' -> null (hapus), angka 0-100 -> angka, selain itu undefined (tidak sah)
  const t = String(v ?? '').trim().replace(',', '.');
  if (t === '') return null;
  const n = +t;
  return isNaN(n) || n < 0 || n > 100 ? undefined : Math.round(n * 100) / 100;
}

function kmBar({ mapel = true, tahun = true } = {}) {
  const kl = KM.kelasList, mp = KM.kelas ? kmMapelPilihan(KM.kelas) : [];
  if (!kl.length) return `<div class="sec">${kosongHtml('Belum ada kelas untuk Anda. Admin perlu mengatur guru pengampu dan wali kelas di menu Data dan Pengaturan sekolah.')}</div>`;
  if (mapel && !mp.some(m => m.id === KM.mapel)) KM.mapel = mp[0] ? mp[0].id : null;
  return `<div class="sec kmbar"><div><label>Kelas</label><select id="kmk" onchange="kmGanti('kelas',this.value)">${kl.map(k => `<option value="${k.id}" ${k.id === KM.kelas ? 'selected' : ''}>${h(k.nama)}</option>`).join('')}</select></div>
    ${mapel ? `<div><label>Mata pelajaran</label><select id="kmm" onchange="kmGanti('mapel',this.value)">${mp.map(m => `<option value="${m.id}" ${m.id === KM.mapel ? 'selected' : ''}>${h(m.nama)}</option>`).join('') || '<option value="">Belum ada mapel</option>'}</select></div>` : ''}
    ${tahun ? `<div class="full"><label>Semester</label><select id="kmt" onchange="kmGanti('ta',this.value)">${KM.tas.map(t => `<option value="${t.id}" ${KM.ta && t.id === KM.ta.id ? 'selected' : ''}>Semester ${t.semester} - ${h(t.nama)}${t.aktif ? ' (aktif)' : ''}</option>`).join('')}</select></div>` : ''}</div>`;
}
function kmGanti(apa, v) {
  if (apa === 'kelas') { KM.kelas = +v; KM.mapel = null; }
  else if (apa === 'mapel') KM.mapel = +v;
  else KM.ta = KM.tas.find(x => x.id === +v) || KM.ta;
  kmSimpanPilihan(); go(KM.layar);
}
const kmKepala = (judul, desk) => head('Kurikulum Merdeka', judul, desk);
const kmKosongTp = () => `<div class="sec"><p style="margin:0 0 10px"><b>Tujuan pembelajaran belum diisi.</b></p><p class="hint">Nilai formatif dan sumatif mengacu pada tujuan pembelajaran dan lingkup materi, jadi isi dulu di langkah 1.</p><button class="btn" style="margin:0" onclick="go('kmtp')">Isi tujuan pembelajaran</button></div>`;

/* ===== beranda penilaian ===== */
async function vKm() {
  KM.layar = 'km';
  await kmSiap();
  const k = kmKelas(), m = kmMapel(), wali = k && (k.wali_kelas_id === me.id || ['admin', 'kepsek'].includes(me.role));
  let r = { tp: 0, lm: 0, siswa: 0, f: 0, s: 0 };
  if (k && m && KM.ta) {
    const q = t => ambil(() => sb.from(t).select('id').eq('tahun_ajaran_id', KM.ta.id).eq('kelas_id', k.id).eq('mapel_id', m.id).order('id'));
    const [tp, lm, f, s, sw] = await Promise.all([q('km_tp'), q('km_lm'), q('km_formatif'), q('km_sumatif'), ambil(() => sb.from('siswa').select('id').eq('kelas_id', k.id).eq('status', 'aktif').order('id'))]);
    r = { tp: tp.length, lm: lm.length, siswa: sw.length, f: f.length, s: s.length };
  }
  const link = (n, judul, desk, status, v) => `<button class="kmlink" onclick="go('${v}')"><span class="n">${n}</span><span style="flex:1"><b>${judul}</b><br><small>${desk}</small></span>${status}</button>`;
  const pf = r.siswa * r.tp ? r.f / (r.siswa * r.tp) * 100 : 0;
  const stat = (ok, t) => `<span class="stamp ${ok ? 'ok' : 'warn'}">${t}</span>`;
  $('#main').innerHTML = kmKepala('Penilaian', 'Tujuan pembelajaran, nilai formatif dan sumatif, sampai raport siap cetak.') + kmBar() +
    (k && m ? `<p class="hint" style="margin:0 2px 8px">Langkah 1 sampai 4 dikerjakan guru mata pelajaran. Raport dan sampul dicetak wali kelas.</p>
    ${link(1, 'Tujuan pembelajaran', `${r.tp} tujuan, ${r.lm} lingkup materi`, stat(r.tp > 0, r.tp ? 'Terisi' : 'Belum'), 'kmtp')}
    ${link(2, 'Nilai formatif', r.tp ? `${r.f} dari ${r.siswa * r.tp} nilai terisi` : 'Isi tujuan pembelajaran dulu', stat(pf >= 100, r.tp ? Math.round(pf) + '%' : '-'), 'kmformatif')}
    ${link(3, 'Nilai sumatif', r.lm ? `${r.s} nilai tercatat` : 'Isi lingkup materi dulu', stat(r.s > 0, r.s ? 'Terisi' : 'Belum'), 'kmsumatif')}
    ${link(4, 'Rekap nilai akhir', 'Nilai akhir dan capaian kompetensi tiap siswa', '', 'kmrekap')}` : '') +
    (wali ? `<h3 class="sub" style="margin-top:22px">Wali kelas</h3>${link(5, 'Raport dan sampul', 'Pratinjau dan cetak PDF, satu siswa atau satu kelas', '', 'kmrapor')}` : '') +
    (me.role === 'admin' ? `${link('⚙', 'Pengaturan penilaian', 'Identitas sekolah, bobot nilai akhir, urutan mapel di raport', '', 'kmpengaturan')}` : '');
}

/* ===== 1. tujuan pembelajaran dan lingkup materi ===== */
async function vKmTp() {
  KM.layar = 'kmtp';
  await kmSiap();
  const k = kmKelas(), m = kmMapel();
  $('#main').innerHTML = kmKepala('Tujuan pembelajaran', 'Deskripsi tujuan pembelajaran akan menjadi capaian kompetensi di raport.') + kmBar();
  if (!k || !m || !KM.ta) return;
  const tulis = kmBisaTulis(), dis = tulis ? '' : 'disabled';
  const [lm, tp, lain] = await Promise.all([
    sb.from('km_lm').select('*').eq('tahun_ajaran_id', KM.ta.id).eq('kelas_id', k.id).eq('mapel_id', m.id).order('nomor'),
    sb.from('km_tp').select('*').eq('tahun_ajaran_id', KM.ta.id).eq('kelas_id', k.id).eq('mapel_id', m.id).order('nomor'),
    sb.from('km_tp').select('kelas_id').eq('tahun_ajaran_id', KM.ta.id).eq('mapel_id', m.id).neq('kelas_id', k.id)
  ]);
  KM.lm = lm.data; KM.tp = tp.data;
  const kelasLain = [...new Set(lain.data.map(x => x.kelas_id))].map(id => KM.semuaKelas.find(c => c.id === id)).filter(Boolean);
  $('#main').insertAdjacentHTML('beforeend', `
    <div class="sec"><h2>Lingkup materi</h2><p class="hint">Bab atau topik utama semester ini. Dipakai sebagai kolom di nilai sumatif.</p>
    ${lm.data.map(x => `<div class="kmrow"><b class="kmno">${x.nomor}</b><input value="${h(x.nama)}" ${dis} onchange="kmSimpanLm(${x.id},this)"><button class="kmx" ${dis} onclick="kmHapusLm(${x.id})" aria-label="Hapus lingkup materi ${x.nomor}">Hapus</button></div>`).join('') || kosongHtml('Belum ada lingkup materi.')}
    ${tulis ? `<div class="kmrow" style="margin-top:8px"><b class="kmno">+</b><input id="lmb" placeholder="Nama lingkup materi, mis. Keteladanan dalam Kehidupan" onkeydown="if(event.key==='Enter')kmTambahLm()"><button class="btn sm" onclick="kmTambahLm()">Tambah</button></div>` : ''}</div>
    <div class="sec"><h2>Tujuan pembelajaran</h2><p class="hint">Tulis diawali kata kerja, mis. "Menjelaskan sejarah terbentuknya Pancasila". Kriteria tercapai: nilai di atas ${kmMapel().kkm}.</p>
    ${tp.data.map(x => `<div class="kmtp"><b class="kmno">TP${x.nomor}</b><div style="flex:1"><textarea rows="2" ${dis} onchange="kmSimpanTp(${x.id},this)">${h(x.deskripsi)}</textarea>
      ${lm.data.length ? `<select ${dis} onchange="kmTpLm(${x.id},this.value)" style="margin-top:6px"><option value="">Lingkup materi (opsional)</option>${lm.data.map(l => `<option value="${l.id}" ${l.id === x.lm_id ? 'selected' : ''}>LM${l.nomor} - ${h(l.nama)}</option>`).join('')}</select>` : ''}</div><button class="kmx" ${dis} onclick="kmHapusTp(${x.id})" aria-label="Hapus TP${x.nomor}">Hapus</button></div>`).join('') || kosongHtml('Belum ada tujuan pembelajaran.')}
    ${tulis ? `<h3 class="sub">Tambah tujuan pembelajaran</h3><textarea id="tpb" rows="2" placeholder="Menjelaskan ..."></textarea><button class="btn" style="margin-top:8px" onclick="kmTambahTp()">Tambah TP${tp.data.length + 1}</button>
    <details class="kmdet"><summary>Tempel banyak sekaligus</summary><p class="hint">Satu tujuan pembelajaran per baris. Nomor di awal baris (1. atau TP1) dibuang otomatis.</p><textarea id="tpm" rows="6" placeholder="Menjelaskan sejarah terbentuknya Pancasila&#10;Menjelaskan hubungan nilai-nilai Pancasila"></textarea><button class="btn alt sm" style="margin-top:8px" onclick="kmTempelTp()">Tambahkan semua</button></details>
    ${kelasLain.length ? `<details class="kmdet"><summary>Salin dari kelas lain</summary><p class="hint">Menyalin lingkup materi dan tujuan pembelajaran mapel ini. Nomor yang sudah terisi dilewati.</p><select id="kms">${kelasLain.map(c => `<option value="${c.id}">${h(c.nama)}</option>`).join('')}</select><button class="btn alt sm" style="margin-top:8px" onclick="kmSalinTp()">Salin</button></details>` : ''}` : ''}</div>`);
}
const kmKonteksBaru = () => ({ tahun_ajaran_id: KM.ta.id, kelas_id: KM.kelas, mapel_id: KM.mapel });
async function kmCek(r, ok) { if (r.error) { toast(r.error.message, 1); return false; } if (ok) toast(ok); return true; }
async function kmNomorUrut(tabel) {   // setelah hapus: rapikan nomor 1, 2, 3, ...
  const { data } = await sb.from(tabel).select('id,nomor').eq('tahun_ajaran_id', KM.ta.id).eq('kelas_id', KM.kelas).eq('mapel_id', KM.mapel).order('nomor');
  for (let i = 0; i < data.length; i++) if (data[i].nomor !== i + 1) await sb.from(tabel).update({ nomor: i + 1 }).eq('id', data[i].id);
}
async function kmTambahLm() {
  const nama = ($('#lmb').value || '').trim();
  if (!nama) return toast('Tulis nama lingkup materi dulu', 1);
  if (KM.lm.length >= 20) return toast('Maksimal 20 lingkup materi', 1);
  if (await kmCek(await sb.from('km_lm').insert({ ...kmKonteksBaru(), nomor: KM.lm.length + 1, nama }))) vKmTp();
}
async function kmSimpanLm(id, el) {
  const nama = el.value.trim();
  if (!nama) { toast('Nama tidak boleh kosong', 1); return vKmTp(); }
  await kmCek(await sb.from('km_lm').update({ nama }).eq('id', id), 'Tersimpan');
}
async function kmHapusLm(id) {
  if (!confirm('Hapus lingkup materi ini? Nilai sumatif pada lingkup materi ini ikut terhapus.')) return;
  if (await kmCek(await sb.from('km_lm').delete().eq('id', id))) { await kmNomorUrut('km_lm'); vKmTp(); }
}
async function kmTambahTp() {
  const d = ($('#tpb').value || '').trim();
  if (!d) return toast('Tulis tujuan pembelajaran dulu', 1);
  if (KM.tp.length >= 40) return toast('Maksimal 40 tujuan pembelajaran', 1);
  if (await kmCek(await sb.from('km_tp').insert({ ...kmKonteksBaru(), nomor: KM.tp.length + 1, deskripsi: d }))) vKmTp();
}
async function kmTempelTp() {
  const baris = ($('#tpm').value || '').split('\n').map(x => x.replace(/^\s*(tp\s*)?\d+\s*[.):-]?\s*/i, '').trim()).filter(Boolean);
  if (!baris.length) return toast('Tempel dulu daftar tujuan pembelajarannya', 1);
  if (KM.tp.length + baris.length > 40) return toast('Maksimal 40 tujuan pembelajaran', 1);
  if (await kmCek(await sb.from('km_tp').insert(baris.map((d, i) => ({ ...kmKonteksBaru(), nomor: KM.tp.length + i + 1, deskripsi: d }))), baris.length + ' tujuan pembelajaran ditambahkan')) vKmTp();
}
async function kmSimpanTp(id, el) {
  const d = el.value.trim();
  if (!d) { toast('Deskripsi tidak boleh kosong', 1); return vKmTp(); }
  await kmCek(await sb.from('km_tp').update({ deskripsi: d }).eq('id', id), 'Tersimpan');
}
async function kmTpLm(id, v) { await kmCek(await sb.from('km_tp').update({ lm_id: v ? +v : null }).eq('id', id), 'Tersimpan'); }
async function kmHapusTp(id) {
  if (!confirm('Hapus tujuan pembelajaran ini? Nilai formatifnya ikut terhapus.')) return;
  if (await kmCek(await sb.from('km_tp').delete().eq('id', id))) { await kmNomorUrut('km_tp'); vKmTp(); }
}
async function kmSalinTp() {
  const dari = +$('#kms').value;
  if (!dari) return;
  const q = t => sb.from(t).select('*').eq('tahun_ajaran_id', KM.ta.id).eq('kelas_id', dari).eq('mapel_id', KM.mapel).order('nomor');
  const [lm, tp] = await Promise.all([q('km_lm'), q('km_tp')]);
  if (lm.data.length) { const r = await sb.from('km_lm').upsert(lm.data.map(x => ({ ...kmKonteksBaru(), nomor: x.nomor, nama: x.nama })), { onConflict: 'tahun_ajaran_id,kelas_id,mapel_id,nomor', ignoreDuplicates: true }); if (!await kmCek(r)) return; }
  const baru = (await sb.from('km_lm').select('id,nomor').eq('tahun_ajaran_id', KM.ta.id).eq('kelas_id', KM.kelas).eq('mapel_id', KM.mapel)).data || [];
  const petaLm = Object.fromEntries(lm.data.map(x => [x.id, (baru.find(b => b.nomor === x.nomor) || {}).id || null]));
  if (tp.data.length) { const r = await sb.from('km_tp').upsert(tp.data.map(x => ({ ...kmKonteksBaru(), nomor: x.nomor, deskripsi: x.deskripsi, lm_id: petaLm[x.lm_id] || null })), { onConflict: 'tahun_ajaran_id,kelas_id,mapel_id,nomor', ignoreDuplicates: true }); if (!await kmCek(r)) return; }
  toast('Disalin'); vKmTp();
}

/* ===== grid nilai (dipakai formatif dan sumatif) ===== */
function kmPasang(tabel, simpanSel, simpanBanyak) {
  const urut = (r, c) => tabel.querySelector(`input[data-r="${r}"][data-c="${c}"]`);
  tabel.addEventListener('focusin', e => { if (e.target.classList.contains('kmi')) e.target.select(); });
  tabel.addEventListener('change', e => { const i = e.target; if (i.classList.contains('kmi')) simpanBanyak([[i, i.value]]); });
  tabel.addEventListener('keydown', e => {
    const i = e.target;
    if (!i.classList.contains('kmi')) return;
    const r = +i.dataset.r, c = +i.dataset.c;
    const ke = e.key === 'Enter' || e.key === 'ArrowDown' ? urut(r + 1, c) : e.key === 'ArrowUp' ? urut(r - 1, c) : null;
    if (ke) { e.preventDefault(); ke.focus(); }
  });
  tabel.addEventListener('paste', e => {
    const i = e.target;
    if (!i.classList.contains('kmi')) return;
    const teks = (e.clipboardData || window.clipboardData).getData('text');
    if (!/[\t\n]/.test(teks.trim())) return;       // tempel satu angka: biarkan perilaku biasa
    e.preventDefault();
    const baris = teks.replace(/\r/g, '').replace(/\n+$/, '').split('\n').map(l => l.split('\t'));
    const r0 = +i.dataset.r, c0 = +i.dataset.c, daftar = [];
    baris.forEach((b, x) => b.forEach((v, y) => { const el = urut(r0 + x, c0 + y); if (el && !el.disabled) daftar.push([el, v]); }));
    simpanBanyak(daftar);
  });
}
let KM_SIMPAN = 0;
function kmStatus(t, buruk) { const e = $('#kmst'); if (e) { e.textContent = t; e.className = 'kmst' + (buruk ? ' buruk' : ''); } }
async function kmJalankan(fn) {
  KM_SIMPAN++; kmStatus('Menyimpan...');
  try { await fn(); kmStatus('Tersimpan'); } catch (e) { kmStatus('Gagal menyimpan: ' + (e.message || e), 1); toast(e.message || 'Gagal menyimpan', 1); }
  KM_SIMPAN--;
}
const kmToolbar = (mid = '') => `<div class="kmtool"><span id="kmst" class="kmst">Perubahan tersimpan otomatis</span>${mid || ''}</div>`;

/* ===== 2. nilai formatif ===== */
let KMF = null;
async function vKmFormatif() {
  KM.layar = 'kmformatif';
  await kmSiap();
  const k = kmKelas(), m = kmMapel();
  $('#main').innerHTML = kmKepala('Nilai formatif', 'Satu kolom untuk setiap tujuan pembelajaran. Nilai 0 sampai 100, tersimpan otomatis.') + kmBar();
  if (!k || !m || !KM.ta) return;
  const [sw, tp] = await Promise.all([
    ambil(() => sb.from('siswa').select('id,nama').eq('kelas_id', k.id).eq('status', 'aktif').order('nama').order('id')),
    sb.from('km_tp').select('*').eq('tahun_ajaran_id', KM.ta.id).eq('kelas_id', k.id).eq('mapel_id', m.id).order('nomor')
  ]);
  if (!tp.data.length) return $('#main').insertAdjacentHTML('beforeend', kmKosongTp());
  if (!sw.length) return $('#main').insertAdjacentHTML('beforeend', `<div class="sec">${kosongHtml('Belum ada siswa aktif di kelas ini.')}</div>`);
  const nl = await ambil(() => sb.from('km_formatif').select('tp_id,siswa_id,nilai').eq('tahun_ajaran_id', KM.ta.id).eq('kelas_id', k.id).eq('mapel_id', m.id).order('id'));
  KMF = { sw, tp: tp.data, nilai: {}, kkm: m.kkm, tulis: kmBisaTulis() };
  nl.forEach(x => KMF.nilai[x.tp_id + ':' + x.siswa_id] = +x.nilai);
  const dis = KMF.tulis ? '' : 'disabled';
  $('#main').insertAdjacentHTML('beforeend', `<div class="sec" style="padding:12px 0 0">${kmToolbar(KMF.tulis ? '<button class="btn alt sm" style="margin:0" onclick="kmPanelTugas(\'f\')">Isi dari nilai tugas</button>' : '')}
    <details class="kmdet" style="margin:0 16px 10px"><summary>Lihat deskripsi tujuan pembelajaran</summary>${tp.data.map(t => `<p class="kmtpl"><b>TP${t.nomor}</b> ${h(t.deskripsi)}</p>`).join('')}</details>
    <div class="kmwrap"><table class="kmgrid" id="kmg"><thead><tr><th class="kmn">Nama siswa</th>${tp.data.map(t => `<th title="${h(t.deskripsi)}">TP${t.nomor}</th>`).join('')}<th>Rata</th></tr></thead>
    <tbody>${sw.map((s, r) => `<tr data-s="${s.id}"><th class="kmn" scope="row">${h(s.nama)}</th>${tp.data.map((t, c) => { const v = KMF.nilai[t.id + ':' + s.id]; return `<td><input class="kmi${v != null && v < KMF.kkm ? ' rendah' : ''}" inputmode="decimal" autocomplete="off" aria-label="${h(s.nama)} TP${t.nomor}" data-r="${r}" data-c="${c}" data-t="${t.id}" data-s="${s.id}" value="${fmtN(v)}" ${dis}></td>`; }).join('')}<td class="kmrata" id="fr${s.id}"></td></tr>`).join('')}</tbody>
    <tfoot><tr><th class="kmn">Rata-rata kelas</th>${tp.data.map(t => `<td class="kmrata" id="fc${t.id}"></td>`).join('')}<td class="kmrata" id="fa"></td></tr></tfoot></table></div>
    <p class="hint" style="padding:10px 16px 12px;margin:0">${KMF.tulis ? 'Enter pindah ke siswa berikutnya. Bisa tempel dari Excel: salin sel-selnya, lalu tempel di kolom pertama yang mau diisi. ' : 'Hanya guru pengampu yang bisa mengisi. '}Angka merah di bawah ${KMF.kkm} (belum tercapai).</p></div>`);
  kmHitungF();
  if (KMF.tulis) kmPasang($('#kmg'), null, kmSimpanF);
}
function kmHitungF() {
  const F = KMF, teks = v => v == null ? '' : fmtN(Math.round(v * 10) / 10);
  F.sw.forEach(s => { const e = $('#fr' + s.id); if (e) e.textContent = teks(rataArr(F.tp.map(t => F.nilai[t.id + ':' + s.id]))); });
  F.tp.forEach(t => { const e = $('#fc' + t.id); if (e) e.textContent = teks(rataArr(F.sw.map(s => F.nilai[t.id + ':' + s.id]))); });
  const e = $('#fa'); if (e) e.textContent = teks(rataArr(F.sw.map(s => rataArr(F.tp.map(t => F.nilai[t.id + ':' + s.id])))));
}
function kmSimpanF(daftar) {
  const ubah = [], hapus = {};
  daftar.forEach(([el, mentah]) => {
    const v = angkaNilai(mentah), key = el.dataset.t + ':' + el.dataset.s, lama = KMF.nilai[key];
    if (v === undefined) { el.value = fmtN(lama); toast('Nilai harus angka 0 sampai 100', 1); return; }
    el.value = fmtN(v); el.classList.toggle('rendah', v != null && v < KMF.kkm);
    if (v === (lama ?? null)) return;
    if (v == null) { delete KMF.nilai[key]; (hapus[el.dataset.t] ??= []).push(+el.dataset.s); }
    else { KMF.nilai[key] = v; ubah.push({ tp_id: +el.dataset.t, siswa_id: +el.dataset.s, nilai: v }); }
  });
  kmHitungF();
  if (!ubah.length && !Object.keys(hapus).length) return;
  return kmJalankan(async () => {
    if (ubah.length) { const r = await sb.from('km_formatif').upsert(ubah, { onConflict: 'tp_id,siswa_id' }); if (r.error) throw r.error; }
    for (const [tp, ids] of Object.entries(hapus)) { const r = await sb.from('km_formatif').delete().eq('tp_id', +tp).in('siswa_id', ids); if (r.error) throw r.error; }
  });
}

/* ===== 3. nilai sumatif ===== */
let KMS = null;
async function vKmSumatif() {
  KM.layar = 'kmsumatif';
  await kmSiap();
  const k = kmKelas(), m = kmMapel();
  $('#main').innerHTML = kmKepala('Nilai sumatif', 'Isi sesuai lingkup materi yang sudah diajarkan. Kolom yang tidak dipakai boleh dikosongkan.') + kmBar();
  if (!k || !m || !KM.ta) return;
  const [sw, lm] = await Promise.all([
    ambil(() => sb.from('siswa').select('id,nama').eq('kelas_id', k.id).eq('status', 'aktif').order('nama').order('id')),
    sb.from('km_lm').select('*').eq('tahun_ajaran_id', KM.ta.id).eq('kelas_id', k.id).eq('mapel_id', m.id).order('nomor')
  ]);
  if (!lm.data.length) return $('#main').insertAdjacentHTML('beforeend', `<div class="sec"><p style="margin:0 0 10px"><b>Lingkup materi belum diisi.</b></p><p class="hint">Kolom nilai sumatif mengikuti lingkup materi. Isi dulu di langkah 1.</p><button class="btn" style="margin:0" onclick="go('kmtp')">Isi lingkup materi</button></div>`);
  if (!sw.length) return $('#main').insertAdjacentHTML('beforeend', `<div class="sec">${kosongHtml('Belum ada siswa aktif di kelas ini.')}</div>`);
  const nl = await ambil(() => sb.from('km_sumatif').select('lm_id,siswa_id,tahap,tes,non_tes').eq('tahun_ajaran_id', KM.ta.id).eq('kelas_id', k.id).eq('mapel_id', m.id).order('id'));
  KMS = { sw, lm: lm.data, nilai: {}, kkm: m.kkm, tulis: kmBisaTulis() };
  nl.forEach(x => KMS.nilai[`${x.tahap}:${x.lm_id}:${x.siswa_id}`] = { tes: x.tes == null ? null : +x.tes, non_tes: x.non_tes == null ? null : +x.non_tes });
  $('#main').insertAdjacentHTML('beforeend', '<div class="sec" id="kmsb" style="padding:12px 0 0"></div>');
  kmGambarS();
}
function kmGambarS() {
  const S = KMS, tahap = KM.tahap, dis = S.tulis ? '' : 'disabled';
  const nilai = (lm, sid, f) => (S.nilai[`${tahap}:${lm}:${sid}`] || {})[f];
  const isi = tahap === 'materi' ? 'akhir lingkup materi' : 'akhir semester';
  $('#kmsb').innerHTML = `<div style="padding:0 16px"><div class="seg" role="tablist"><button role="tab" class="${tahap === 'materi' ? 'on' : ''}" onclick="KM.tahap='materi';kmGambarS()">Akhir materi</button><button role="tab" class="${tahap === 'semester' ? 'on' : ''}" onclick="KM.tahap='semester';kmGambarS()">Akhir semester</button></div>
    <p class="hint" style="margin:8px 0 0">${tahap === 'materi' ? 'Asesmen sumatif setelah satu lingkup materi selesai.' : 'Asesmen sumatif akhir semester. Boleh dikosongkan jika tidak ada.'} Tiap lingkup materi punya kolom Tes dan Non tes; cukup isi yang dipakai.</p></div>${kmToolbar(S.tulis ? '<button class="btn alt sm" style="margin:0" onclick="kmPanelTugas(\'s\')">Isi dari nilai tugas</button>' : '')}
    <details class="kmdet" style="margin:0 16px 10px"><summary>Lihat nama lingkup materi</summary>${S.lm.map(l => `<p class="kmtpl"><b>LM${l.nomor}</b> ${h(l.nama)}</p>`).join('')}</details>
    <div class="kmwrap"><table class="kmgrid" id="kmg"><thead><tr><th class="kmn">Nama siswa</th>${S.lm.map(l => `<th title="${h(l.nama)}">LM${l.nomor}<br><small class="kmsub">Tes</small></th><th title="${h(l.nama)}">LM${l.nomor}<br><small class="kmsub">Non tes</small></th>`).join('')}<th>Rata</th></tr></thead>
    <tbody>${S.sw.map((s, r) => `<tr><th class="kmn" scope="row">${h(s.nama)}</th>${S.lm.map((l, c) => ['tes', 'non_tes'].map((f, j) => { const v = nilai(l.id, s.id, f); return `<td><input class="kmi${v != null && v < S.kkm ? ' rendah' : ''}" inputmode="decimal" autocomplete="off" aria-label="${h(s.nama)} LM${l.nomor} ${f === 'tes' ? 'tes' : 'non tes'}" data-r="${r}" data-c="${c * 2 + j}" data-l="${l.id}" data-s="${s.id}" data-f="${f}" value="${fmtN(v)}" ${dis}></td>`; }).join('')).join('')}<td class="kmrata" id="sr${s.id}"></td></tr>`).join('')}</tbody></table></div>
    <p class="hint" style="padding:10px 16px 12px;margin:0">${S.tulis ? 'Enter pindah ke siswa berikutnya. Bisa tempel dari Excel. ' : 'Hanya guru pengampu yang bisa mengisi. '}Rata = rata-rata nilai ${isi} semua lingkup materi.</p>`;
  kmHitungS();
  if (S.tulis) kmPasang($('#kmg'), null, kmSimpanS);
}
const kmRataLm = (n, tahap, lm, sid) => { const v = n[`${tahap}:${lm}:${sid}`]; return v ? rataArr([v.tes, v.non_tes]) : null; };
function kmHitungS() {
  const S = KMS;
  S.sw.forEach(s => { const e = $('#sr' + s.id); if (e) { const v = rataArr(S.lm.map(l => kmRataLm(S.nilai, KM.tahap, l.id, s.id))); e.textContent = v == null ? '' : fmtN(Math.round(v * 10) / 10); } });
}
function kmSimpanS(daftar) {
  const tahap = KM.tahap, ubah = {}, S = KMS;
  daftar.forEach(([el, mentah]) => {
    const v = angkaNilai(mentah), key = `${tahap}:${el.dataset.l}:${el.dataset.s}`, f = el.dataset.f;
    const lama = (S.nilai[key] || {})[f] ?? null;
    if (v === undefined) { el.value = fmtN(lama); toast('Nilai harus angka 0 sampai 100', 1); return; }
    el.value = fmtN(v); el.classList.toggle('rendah', v != null && v < S.kkm);
    if (v === lama) return;
    const pasang = S.nilai[key] = { tes: null, non_tes: null, ...(S.nilai[key] || {}) };
    pasang[f] = v;
    ubah[key] = { lm_id: +el.dataset.l, siswa_id: +el.dataset.s, tahap };
  });
  kmHitungS();
  const kunci = Object.keys(ubah);
  if (!kunci.length) return;
  const simpan = [], hapus = [];
  kunci.forEach(key => { const p = S.nilai[key]; if (p.tes == null && p.non_tes == null) { delete S.nilai[key]; hapus.push(ubah[key]); } else simpan.push({ ...ubah[key], tes: p.tes, non_tes: p.non_tes }); });
  return kmJalankan(async () => {
    if (simpan.length) { const r = await sb.from('km_sumatif').upsert(simpan, { onConflict: 'lm_id,siswa_id,tahap' }); if (r.error) throw r.error; }
    for (const x of hapus) { const r = await sb.from('km_sumatif').delete().eq('lm_id', x.lm_id).eq('siswa_id', x.siswa_id).eq('tahap', x.tahap); if (r.error) throw r.error; }
  });
}

/* ===== perhitungan nilai akhir dan capaian kompetensi ===== */
function kmNilaiAkhir(F, M, S) {
  const B = KM.bobot, p = [[F, B.formatif], [M, B.materi], [S, B.semester]].filter(x => x[0] != null && x[1] > 0);
  if (!p.length) return null;
  return Math.round(p.reduce((u, x) => u + x[0] * x[1], 0) / p.reduce((u, x) => u + x[1], 0));
}
const kmKecil = d => d.charAt(0).toLowerCase() + d.slice(1).replace(/[.\s]+$/, '');
function kmCapaian(nama, tps, nilai, kkm) {
  const it = tps.map((t, i) => ({ d: t.deskripsi, n: nilai[i] })).filter(x => x.n != null);
  if (!it.length) return [];
  const terbaik = it.reduce((a, x) => x.n > a.n ? x : a), terendah = it.reduce((a, x) => x.n < a.n ? x : a), out = [];
  if (terbaik.n >= kkm) out.push(`Ananda ${nama} menunjukkan penguasaan dalam ${kmKecil(terbaik.d)}.`);
  if (terendah.n < kkm) out.push(`Ananda ${nama} perlu bantuan dalam ${kmKecil(terendah.d)}.`);
  return out;
}
async function kmDataKelas(kid, taId) {
  const per = t => ambil(() => sb.from(t).select(t === 'km_formatif' ? 'tp_id,siswa_id,mapel_id,nilai' : t === 'km_sumatif' ? 'lm_id,siswa_id,mapel_id,tahap,tes,non_tes' : '*').eq('tahun_ajaran_id', taId).eq('kelas_id', kid).order('id'));
  const kls0 = (KM.semuaKelas || []).find(x => x.id === kid) || {};
  const [ub, nipWali] = await Promise.all([
    ambil(() => sb.from('km_ubah').select('*').eq('tahun_ajaran_id', taId).eq('kelas_id', kid).order('id')),
    kls0.wali_kelas_id ? sb.from('guru_data').select('nip').eq('guru_id', kls0.wali_kelas_id) : Promise.resolve({ data: [] })
  ]);
  const [sw, tp, lm, fm, sm, pg, dir] = await Promise.all([
    ambil(() => sb.from('siswa').select('*').eq('kelas_id', kid).eq('status', 'aktif').order('nama').order('id')),
    per('km_tp'), per('km_lm'), per('km_formatif'), per('km_sumatif'),
    sb.from('pengampu').select('mapel_id').eq('kelas_id', kid), sb.from('v_direktori').select('id,nama')
  ]);
  const ids = new Set([...pg.data.map(x => x.mapel_id), ...tp.map(x => x.mapel_id)]);
  const mapel = KM.mapelAll.filter(m => ids.has(m.id));
  const fmMap = {}; fm.forEach(x => fmMap[x.tp_id + ':' + x.siswa_id] = +x.nilai);
  const smMap = {}; sm.forEach(x => smMap[`${x.tahap}:${x.lm_id}:${x.siswa_id}`] = { tes: x.tes == null ? null : +x.tes, non_tes: x.non_tes == null ? null : +x.non_tes });
  const tpM = kelompok(tp.slice().sort((a, b) => a.nomor - b.nomor), 'mapel_id'), lmM = kelompok(lm.slice().sort((a, b) => a.nomor - b.nomor), 'mapel_id');
  const hasil = {};
  sw.forEach(s => {
    hasil[s.id] = {};
    mapel.forEach(m => {
      const tps = tpM[m.id] || [], lms = lmM[m.id] || [], f = tps.map(t => fmMap[t.id + ':' + s.id] ?? null);
      const F = rataArr(f), M = rataArr(lms.map(l => kmRataLm(smMap, 'materi', l.id, s.id))), S = rataArr(lms.map(l => kmRataLm(smMap, 'semester', l.id, s.id)));
      const na = kmNilaiAkhir(F, M, S);
      const cp = kmCapaian(s.nama, tps, f, m.kkm);
      hasil[s.id][m.id] = { F, M, S, na, naOto: na, capaian: cp, capaianOto: cp, ubah: null };
    });
  });
  ub.forEach(u => { const x = hasil[u.siswa_id] && hasil[u.siswa_id][u.mapel_id]; if (x) kmPasangUbah(x, u); });
  const kelas = (KM.semuaKelas || []).find(x => x.id === kid) || {};
  const wali = ((dir.data || []).find(x => x.id === kelas.wali_kelas_id) || {}).nama || '';
  return { kid, kelas, ta: KM.tas.find(x => x.id === taId), siswa: sw, mapel, hasil, wali, waliNip: (nipWali.data[0] || {}).nip || '', tpM };
}

/* ===== ubah manual nilai akhir dan capaian (menggantikan hasil otomatis) ===== */
function kmPasangUbah(x, u) {   // u null = kembali ke otomatis
  x.ubah = u || null;
  x.na = u && u.nilai_akhir != null ? Math.round(+u.nilai_akhir) : x.naOto;
  x.capaian = u && u.capaian ? u.capaian.split(/\n+/).map(t => t.trim()).filter(Boolean) : x.capaianOto;
}
const kmBisaUbah = (D, mid) => me.role === 'admin' || D.kelas.wali_kelas_id === me.id || (me.role === 'guru' && KM.pengampu.some(p => p.kelas_id === D.kid && p.mapel_id === mid && p.guru_id === me.id));
function kmSheet(html) {
  kmTutupSheet();
  document.body.insertAdjacentHTML('beforeend', `<div id="kmsheet"><div class="kmsheet-bg" onclick="kmTutupSheet()"></div><div class="kmsheet-box" role="dialog" aria-modal="true">${html}</div></div>`);
  const f = document.querySelector('#kmsheet input, #kmsheet textarea'); if (f) f.focus();
}
function kmTutupSheet() { const e = $('#kmsheet'); if (e) e.remove(); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') kmTutupSheet(); });
let KMU = null;
function kmEditHasil(D, sid, mid, sesudah) {
  const s = D.siswa.find(x => x.id === sid), m = D.mapel.find(x => x.id === mid), x = D.hasil[sid][mid];
  KMU = { D, sid, mid, sesudah };
  kmSheet(`<h3 style="margin:0 0 2px">${h(s.nama)}</h3><p class="hint" style="margin:0 0 6px">${h(m.nama)}</p>
    <label>Nilai akhir <small class="mut">(otomatis: ${x.naOto ?? '-'})</small></label><input id="kue-na" type="number" min="0" max="100" inputmode="numeric" value="${x.ubah && x.ubah.nilai_akhir != null ? Math.round(x.ubah.nilai_akhir) : ''}" placeholder="Kosongkan untuk nilai otomatis">
    <label>Capaian kompetensi</label><textarea id="kue-cp" rows="7">${h(x.capaian.join('\n'))}</textarea>
    <p class="hint" style="margin:4px 0 0">Satu kalimat per baris. Biarkan seperti hasil otomatis kalau tidak ingin mengubah. Hapus semua isinya untuk kembali ke otomatis.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"><button class="btn" style="margin:0" onclick="kmSimpanUbah()">Simpan</button>${x.ubah ? '<button class="btn alt" style="margin:0" onclick="kmKembalikanOto()">Kembalikan otomatis</button>' : ''}<button class="btn alt" style="margin:0" onclick="kmTutupSheet()">Batal</button></div>`);
}
async function kmSimpanUbah() {
  const { D, sid, mid, sesudah } = KMU, x = D.hasil[sid][mid];
  const mentah = ($('#kue-na').value || '').trim(), cp = ($('#kue-cp').value || '').trim();
  let na = mentah === '' ? null : Math.round(+mentah);
  if (na != null && (isNaN(na) || na < 0 || na > 100)) return toast('Nilai akhir harus 0 sampai 100', 1);
  if (na === x.naOto) na = null;
  const cpBaru = cp === x.capaianOto.join('\n').trim() ? null : (cp || null);
  const baris = { tahun_ajaran_id: D.ta.id, kelas_id: D.kid, siswa_id: sid, mapel_id: mid, nilai_akhir: na, capaian: cpBaru };
  if (na == null && cpBaru == null) return kmKembalikanOto();
  const { error } = await sb.from('km_ubah').upsert(baris, { onConflict: 'tahun_ajaran_id,siswa_id,mapel_id' });
  if (error) return toast(error.message, 1);
  kmPasangUbah(x, baris); kmTutupSheet(); toast('Hasil raport diubah'); if (sesudah) sesudah();
}
async function kmKembalikanOto() {
  const { D, sid, mid, sesudah } = KMU, x = D.hasil[sid][mid];
  const { error } = await sb.from('km_ubah').delete().eq('tahun_ajaran_id', D.ta.id).eq('siswa_id', sid).eq('mapel_id', mid);
  if (error) return toast(error.message, 1);
  kmPasangUbah(x, null); kmTutupSheet(); toast('Dikembalikan ke hasil otomatis'); if (sesudah) sesudah();
}

/* ===== 4. rekap nilai akhir ===== */
let KMR = null;
async function vKmRekap() {
  KM.layar = 'kmrekap';
  await kmSiap();
  const k = kmKelas();
  $('#main').innerHTML = kmKepala('Rekap nilai akhir', `Nilai akhir = ${kmBobotTeks()}. Komponen yang belum ada tidak dihitung.`) + kmBar({ mapel: false });
  if (!k || !KM.ta) return;
  KMR = await kmDataKelas(k.id, KM.ta.id);
  if (!KMR.mapel.some(m => m.id === KM.mapel)) KM.mapel = (KMR.mapel[0] || {}).id || null;
  $('#main').insertAdjacentHTML('beforeend', `<div class="sec"><div class="seg"><button id="kmm1" onclick="KM.mode='mapel';kmGambarRekap()">Satu mata pelajaran</button><button id="kmm2" onclick="KM.mode='kelas';kmGambarRekap()">Semua mapel</button></div><div id="kmrh" style="margin-top:12px"></div></div>`);
  kmGambarRekap();
}
function kmBobotTeks() {
  const B = KM.bobot, j = B.formatif + B.materi + B.semester || 1;
  return `${Math.round(B.formatif / j * 100)}% formatif + ${Math.round(B.materi / j * 100)}% sumatif akhir materi + ${Math.round(B.semester / j * 100)}% sumatif akhir semester`;
}
const kmSingkat = n => { const k = n.split(/\s+/).filter(x => !['dan', 'dengan', 'dari', 'untuk', 'di', 'ke', 'yang'].includes(x.toLowerCase())); return n.length <= 12 ? n : k.length > 1 ? k.map(x => x[0].toUpperCase()).join('') : n.slice(0, 11) + '…'; };
function kmGambarRekap() {
  const D = KMR;
  $('#kmm1').classList.toggle('on', KM.mode === 'mapel'); $('#kmm2').classList.toggle('on', KM.mode === 'kelas');
  if (!D.siswa.length) return $('#kmrh').innerHTML = kosongHtml('Belum ada siswa aktif di kelas ini.');
  if (!D.mapel.length) return $('#kmrh').innerHTML = kosongHtml('Belum ada mata pelajaran yang diampu atau dinilai di kelas ini.');
  if (KM.mode === 'kelas') {
    $('#kmrh').innerHTML = `<div class="kmwrap"><table class="kmgrid"><thead><tr><th class="kmn">Nama siswa</th>${D.mapel.map(m => `<th title="${h(m.nama)}" style="padding:6px 8px">${h(kmSingkat(m.nama))}</th>`).join('')}<th>Rata</th></tr></thead><tbody>${D.siswa.map(s => { const na = D.mapel.map(m => D.hasil[s.id][m.id].na); return `<tr><th class="kmn" scope="row">${h(s.nama)}</th>${D.mapel.map((m, i) => `<td class="kmrata${na[i] != null && na[i] < m.kkm ? ' rendah' : ''}">${na[i] ?? ''}</td>`).join('')}<td class="kmrata"><b>${rataArr(na) == null ? '' : fmtN(Math.round(rataArr(na) * 10) / 10)}</b></td></tr>`; }).join('')}</tbody></table></div>
      <p class="hint" style="margin:8px 0 0">Kosong berarti belum ada nilai atau Anda tidak punya akses ke mapel itu. Merah = di bawah KKTP. Arahkan atau tahan nama kolom untuk nama lengkap mapel.</p>`;
    return;
  }
  const mp = D.mapel.find(m => m.id === KM.mapel) || D.mapel[0];
  KM.mapel = mp.id;
  const rata = rataArr(D.siswa.map(s => D.hasil[s.id][mp.id].na)), tuntas = D.siswa.filter(s => (D.hasil[s.id][mp.id].na ?? -1) >= mp.kkm).length, terisi = D.siswa.filter(s => D.hasil[s.id][mp.id].na != null).length;
  $('#kmrh').innerHTML = `<label style="margin-top:0">Mata pelajaran</label><select onchange="KM.mapel=+this.value;kmGambarRekap()">${D.mapel.map(m => `<option value="${m.id}" ${m.id === mp.id ? 'selected' : ''}>${h(m.nama)}</option>`).join('')}</select>
    <div class="stats" style="margin:12px 0"><div class="stat"><span class="num2">${terisi}/${D.siswa.length}</span><small>Sudah bernilai</small></div><div class="stat"><span class="num2">${rata == null ? '-' : fmtN(Math.round(rata * 10) / 10)}</span><small>Rata-rata</small></div><div class="stat"><span class="num2">${tuntas}</span><small>Mencapai KKTP ${mp.kkm}</small></div></div>
    <div class="kmwrap"><table class="kmgrid"><thead><tr><th class="kmn">Nama siswa</th><th>Formatif</th><th>Sumatif materi</th><th>Sumatif semester</th><th>Nilai akhir</th></tr></thead><tbody>${D.siswa.map(s => { const x = D.hasil[s.id][mp.id], t = v => v == null ? '<span class="mut">-</span>' : fmtN(Math.round(v * 10) / 10); return `<tr onclick="kmBukaCapaian(${s.id})" style="cursor:pointer"><th class="kmn" scope="row">${h(s.nama)}</th><td class="kmrata">${t(x.F)}</td><td class="kmrata">${t(x.M)}</td><td class="kmrata">${t(x.S)}</td><td class="kmrata${x.na != null && x.na < mp.kkm ? ' rendah' : ''}"><b>${x.na ?? '-'}</b>${x.ubah ? ' <span title="Diubah manual" class="kmpen">✎</span>' : ''}</td></tr>`; }).join('')}</tbody></table></div><div id="kmcp"></div>
    <p class="hint" style="margin:8px 0 0">Ketuk satu siswa untuk melihat capaian kompetensi yang akan tercetak di raport. Tanda ✎ berarti sudah diubah manual.</p>`;
}
function kmBukaCapaian(sid) {
  const D = KMR, s = D.siswa.find(x => x.id === sid), mp = D.mapel.find(m => m.id === KM.mapel), x = D.hasil[sid][mp.id];
  $('#kmcp').innerHTML = `<div class="kmcap"><b>${h(s.nama)}</b> - ${h(mp.nama)}${x.ubah ? ' <span class="stamp warn">Diubah manual</span>' : ''}<br>${x.capaian.length ? x.capaian.map(c => `<p>${h(c)}</p>`).join('') : '<p class="mut">Belum ada nilai formatif, jadi capaian kompetensi belum bisa disusun.</p>'}
    ${kmBisaUbah(D, mp.id) ? `<button class="btn alt sm" style="margin-top:10px" onclick="kmEditHasil(KMR,${sid},${mp.id},()=>{kmGambarRekap();kmBukaCapaian(${sid})})">Ubah nilai akhir atau capaian</button>` : ''}</div>`;
  $('#kmcp').scrollIntoView({ block: 'nearest' });
}

/* ===== 5. raport dan sampul ===== */
let KMP = null;
async function kmDataRapor(kid, taId) {
  const D = await kmDataKelas(kid, taId), ids = D.siswa.map(s => s.id), T = D.ta || {};
  const rentang = q => { if (T.mulai) q = q.gte('tanggal', T.mulai); if (T.selesai) q = q.lte('tanggal', T.selesai); return q; };
  const [rp, ek, ab] = ids.length ? await Promise.all([
    ambil(() => sb.from('raport').select('siswa_id,catatan_wali').eq('tahun_ajaran_id', taId).in('siswa_id', ids).order('id')),
    ambil(() => sb.from('nilai_ekskul').select('siswa_id,predikat,keterangan,ekskul(nama)').eq('tahun_ajaran_id', taId).in('siswa_id', ids).order('id')),
    ambil(() => rentang(sb.from('absensi').select('siswa_id,status,tanggal,terverifikasi').in('siswa_id', ids)).order('id'))
  ]) : [[], [], []];
  D.catatan = Object.fromEntries(rp.map(x => [x.siswa_id, x.catatan_wali || '']));
  D.ekskul = kelompok(ek, 'siswa_id');
  D.absen = {};
  ids.forEach(i => D.absen[i] = { sakit: 0, izin: 0, alpa: 0 });
  ab.filter(x => x.terverifikasi !== false && D.absen[x.siswa_id] && D.absen[x.siswa_id][x.status] != null).forEach(x => D.absen[x.siswa_id][x.status]++);
  return D;
}
const kmLengkap = (D, s) => D.mapel.filter(m => D.hasil[s.id][m.id].na != null).length;
async function vKmRapor() {
  KM.layar = 'kmrapor';
  await kmSiap();
  const k = kmKelas();
  $('#main').innerHTML = kmKepala('Raport dan sampul', 'Pratinjau dan cetak PDF yang siap dibagikan ke siswa dan orang tua.') + kmBar({ mapel: false });
  if (!k || !KM.ta) return;
  $('#main').insertAdjacentHTML('beforeend', '<div id="kmpr"><div class="sec">' + kosongHtml('Memuat data kelas...') + '</div></div>');
  KMP = await kmDataRapor(k.id, KM.ta.id);
  const D = KMP, total = D.mapel.length, siap = D.siswa.filter(s => kmLengkap(D, s) === total && total).length;
  const kosongMapel = D.mapel.map(m => ({ m, n: D.siswa.filter(s => D.hasil[s.id][m.id].na == null).length })).filter(x => x.n);
  if (!D.siswa.length) return $('#kmpr').innerHTML = `<div class="sec">${kosongHtml('Belum ada siswa aktif di kelas ini.')}</div>`;
  $('#kmpr').innerHTML = `
    <div class="sec"><h2>Cetak PDF</h2><p class="hint">${siap} dari ${D.siswa.length} siswa nilainya sudah lengkap untuk ${total} mata pelajaran.</p>
    ${kosongMapel.length ? `<div class="kmwarn"><b>Belum ada nilai:</b> ${kosongMapel.map(x => `${h(x.m.nama)} (${x.n} siswa)`).join(', ')}. Mapel tanpa nilai tercetak dengan tanda "-".</div>` : ''}
    <label style="margin-top:12px">Halaman yang dicetak</label>
    <div class="kmcek"><label><input type="checkbox" id="kc1" checked> Sampul</label><label><input type="checkbox" id="kc2" checked> Identitas sekolah</label><label><input type="checkbox" id="kc3" checked> Identitas peserta didik</label><label><input type="checkbox" id="kc4" checked> Hasil belajar</label></div>
    <label>Ukuran kertas</label><select id="kkr"><option value="a4">A4 (210 x 297 mm)</option><option value="f4">F4 / Folio (215 x 330 mm)</option></select>
    <button class="btn" onclick="kmUnduh(null)">Unduh PDF seluruh kelas (${D.siswa.length} siswa)</button></div>
    <div class="sec"><h2>Siswa</h2>${D.siswa.map(s => { const n = kmLengkap(D, s); return `<div class="row"><span><b>${h(s.nama)}</b><br><small>${n} dari ${total} mapel bernilai${D.catatan[s.id] ? '' : ' - catatan wali kosong'}</small></span><span style="display:flex;gap:6px;align-items:center">${n === total && total ? '<span class="stamp ok">Lengkap</span>' : '<span class="stamp warn">Belum</span>'}<button class="btn alt sm" onclick="kmPratinjau(${s.id})">Pratinjau</button><button class="btn sm" onclick="kmUnduh(${s.id})">PDF</button></span></div>`; }).join('')}</div><div id="kmpv"></div>`;
}
function kmHasilBaris(D, s) {
  return D.mapel.map((m, i) => { const x = D.hasil[s.id][m.id]; return { no: i + 1, mid: m.id, ubah: !!x.ubah, mapel: m.nama, na: x.na == null ? '-' : String(x.na), capaian: x.capaian.length ? x.capaian : [x.na == null ? 'Belum ada penilaian.' : 'Capaian kompetensi belum diisi (tujuan pembelajaran atau nilai formatif kosong).'] }; });
}
function kmPratinjau(sid) {
  const D = KMP, s = D.siswa.find(x => x.id === sid), T = D.ta, k = D.kelas, ek = D.ekskul[sid] || [], ab = D.absen[sid], fase = faseDari(k.tingkat || tingkatDari(k.nama) || 0);
  const tulis = ['admin'].includes(me.role) || D.kelas.wali_kelas_id === me.id;
  $('#kmpv').innerHTML = `<div class="sec"><h2>Pratinjau raport</h2><div class="kertas">
    <h3 class="kjudul">LAPORAN HASIL BELAJAR<br><span>(RAPOR)</span></h3>
    <div class="kmhead"><div><span>Nama Peserta Didik</span><b>: ${h(s.nama)}</b><span>NISN / NIS</span><b>: ${h([s.nisn, s.nis].filter(Boolean).join(' / ') || '-')}</b><span>Sekolah</span><b>: ${h(SCHOOL)}</b></div><div><span>Kelas</span><b>: ${h(k.nama)}</b><span>Fase</span><b>: ${fase}</b><span>Semester</span><b>: ${T.semester} (${T.semester === 1 ? 'Ganjil' : 'Genap'})</b><span>Tahun Pelajaran</span><b>: ${h(T.nama)}</b></div></div>
    <table class="kmtab"><thead><tr><th style="width:28px">No</th><th style="width:30%">Muatan Pelajaran</th><th style="width:56px">Nilai Akhir</th><th>Capaian Kompetensi</th></tr></thead><tbody>${kmHasilBaris(D, s).map(r => `<tr><td align="center">${r.no}</td><td>${h(r.mapel)}${kmBisaUbah(D, r.mid) ? `<br><button class="kmed" onclick="kmEditHasil(KMP,${s.id},${r.mid},()=>kmPratinjau(${s.id}))">Ubah${r.ubah ? ' (sudah diubah)' : ''}</button>` : ''}</td><td align="center"><b>${r.na}</b></td><td>${r.capaian.map(c => `<p>${h(c)}</p>`).join('')}</td></tr>`).join('') || '<tr><td colspan="4">Belum ada mata pelajaran.</td></tr>'}</tbody></table>
    <table class="kmtab" style="margin-top:12px"><thead><tr><th style="width:28px">No</th><th style="width:30%">Ekstrakurikuler</th><th>Keterangan</th></tr></thead><tbody>${ek.map((e, i) => `<tr><td align="center">${i + 1}</td><td>${h(e.ekskul?.nama || '-')}</td><td>${h(e.predikat)}${e.keterangan ? '. ' + h(e.keterangan) : ''}</td></tr>`).join('') || '<tr><td align="center">1</td><td>-</td><td>-</td></tr>'}</tbody></table>
    <table class="kmtab" style="margin-top:12px;width:60%"><thead><tr><th colspan="2">Ketidakhadiran</th></tr></thead><tbody><tr><td>Sakit</td><td>${ab.sakit} hari</td></tr><tr><td>Izin</td><td>${ab.izin} hari</td></tr><tr><td>Tanpa Keterangan</td><td>${ab.alpa} hari</td></tr></tbody></table></div>
    <h3 class="sub">Catatan wali kelas</h3><textarea id="kmcw" rows="3" ${tulis ? '' : 'disabled'} placeholder="Tulis catatan untuk ${h(s.nama.split(' ')[0])}">${h(D.catatan[sid] || '')}</textarea>
    ${tulis ? `<button class="btn alt sm" style="margin-top:8px" onclick="kmSimpanCatatan(${sid})">Simpan catatan</button>` : '<p class="hint">Catatan hanya bisa diubah wali kelas.</p>'}
    <button class="btn" style="margin-top:12px" onclick="kmUnduh(${sid})">Unduh PDF ${h(s.nama.split(' ')[0])}</button></div>`;
  $('#kmpv').scrollIntoView();
}
async function kmSimpanCatatan(sid) {
  const c = ($('#kmcw').value || '').trim() || null;
  const { error } = await sb.from('raport').upsert({ siswa_id: sid, tahun_ajaran_id: KM.ta.id, catatan_wali: c }, { onConflict: 'siswa_id,tahun_ajaran_id' });
  if (error) return toast(error.message, 1);
  KMP.catatan[sid] = c || ''; toast('Catatan tersimpan');
}

/* ===== PDF: sampul, identitas, laporan hasil belajar ===== */
const KM_JENJANG = { SD: 'SEKOLAH DASAR (SD)', MI: 'MADRASAH IBTIDAIYAH (MI)', SMP: 'SEKOLAH MENENGAH PERTAMA (SMP)', MTS: 'MADRASAH TSANAWIYAH (MTs)', SMA: 'SEKOLAH MENENGAH ATAS (SMA)', SMK: 'SEKOLAH MENENGAH KEJURUAN (SMK)' };
async function kmUnduh(sid) {
  const o = { sampul: $('#kc1').checked, sekolah: $('#kc2').checked, siswa: $('#kc3').checked, hasil: $('#kc4').checked, kertas: $('#kkr').value };
  if (!o.sampul && !o.sekolah && !o.siswa && !o.hasil) return toast('Pilih minimal satu halaman untuk dicetak', 1);
  try {
    toast('Menyiapkan PDF...');
    await Promise.all([muatSkrip(JSPDF), muatIdentitas()]); await muatSkrip(AUTOTABLE);
    const D = KMP, daftar = sid ? D.siswa.filter(s => s.id === sid) : D.siswa;
    const doc = kmBuatPdf(D, daftar, o);
    doc.save(`Raport-${D.kelas.nama}-${sid ? daftar[0].nama.replace(/\s+/g, '-') : 'seluruh-kelas'}-Semester${D.ta.semester}-${D.ta.nama.replace('/', '-')}.pdf`);
    toast(`PDF ${daftar.length} raport diunduh`);
  } catch (e) { toast(e.message || 'PDF gagal dibuat', 1); }
}
function kmBuatPdf(D, daftar, o) {
  const I = IDENT || {}, doc = new window.jspdf.jsPDF({ unit: 'mm', format: o.kertas === 'f4' ? [215, 330] : 'a4' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 20, T = D.ta, k = D.kelas, fase = faseDari(k.tingkat || tingkatDari(k.nama) || 0);
  const tgl = T.tgl_raport || hariWIB(), tempat = I.kota ? I.kota + ', ' : '';
  let pertama = true, y = 0, siswaIni = null;
  const baru = () => { if (!pertama) doc.addPage(); pertama = false; y = 22; };
  const tengah = (t, yy, uk, tebal = true) => { doc.setFont('helvetica', tebal ? 'bold' : 'normal'); doc.setFontSize(uk); doc.text(t, W / 2, yy, { align: 'center', maxWidth: W - 2 * M }); };
  const pastikan = tinggi => { if (y + tinggi > H - 18) { doc.addPage(); y = 22; } };
  const kaki = () => { doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(90); doc.text(`${siswaIni.nama} - Kelas ${k.nama} - Semester ${T.semester} ${T.nama}`, M, H - 10); doc.setTextColor(0); };
  const polos = (body, lebar, ukuran = 10.5) => { doc.autoTable({ startY: y, body, theme: 'plain', styles: { fontSize: ukuran, cellPadding: { top: 2, bottom: 2, left: 1, right: 1 }, textColor: 20, valign: 'top' }, columnStyles: lebar, margin: { left: M, right: M } }); y = doc.lastAutoTable.finalY + 6; };
  const grid = (kepala, body, kolom, opsi = {}) => { doc.autoTable({ startY: y, head: kepala, body, theme: 'grid', styles: { fontSize: 9, cellPadding: 2, lineColor: [110, 110, 110], lineWidth: 0.2, textColor: 20, valign: 'top' }, headStyles: { fillColor: [232, 232, 232], textColor: 0, fontStyle: 'bold', halign: 'center' }, columnStyles: kolom, margin: { left: M, right: M, bottom: 18 }, didDrawPage: kaki, ...opsi }); y = doc.lastAutoTable.finalY + 6; };
  const ttd = (kiri, kanan, tengahTeks, tengahNama, nip) => {
    pastikan(tengahTeks ? 92 : 50);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setDrawColor(0); doc.setLineWidth(0.3);
    doc.text(`${tempat}${tglPanjang(tgl)}`, W - M, y, { align: 'right' }); y += 7;
    [[M + 24, kiri, '', ''], [W - M - 24, kanan, D.wali, D.waliNip]].forEach(([x, t, n, nip]) => { doc.text(t, x, y, { align: 'center' }); doc.line(x - 26, y + 24, x + 26, y + 24); if (n) doc.text(n, x, y + 29, { align: 'center' }); if (nip) doc.text('NIP ' + nip, x, y + 34, { align: 'center' }); });
    if (tengahTeks) { y += 40; doc.text(tengahTeks, W / 2, y, { align: 'center' }); doc.line(W / 2 - 30, y + 24, W / 2 + 30, y + 24); doc.setFont('helvetica', 'bold'); if (tengahNama) doc.text(tengahNama, W / 2, y + 29, { align: 'center' }); doc.setFont('helvetica', 'normal'); if (nip) doc.text('NIP ' + nip, W / 2, y + 34, { align: 'center' }); y += 38; }
  };
  const alamat = (a, kel, kec) => alamatGabung(a, kel, kec) || '-';
  const isi = v => adaIsi(v) ? String(v) : '-';

  daftar.forEach(s => {
    siswaIni = s;
    if (o.sampul) {
      baru();
      doc.setDrawColor(40); doc.setLineWidth(0.9); doc.rect(10, 10, W - 20, H - 20); doc.setLineWidth(0.25); doc.rect(12.5, 12.5, W - 25, H - 25);
      tengah('RAPOR', 62, 34); tengah('PESERTA DIDIK', 74, 15); tengah(KM_JENJANG[(I.jenjang || 'SD').toUpperCase()] || KM_JENJANG.SD, 83, 12.5, false);
      doc.setLineWidth(0.5); doc.line(W / 2 - 22, 92, W / 2 + 22, 92);
      const by = H * 0.45;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.text('Nama Peserta Didik', W / 2, by, { align: 'center' });
      doc.setLineWidth(0.4); doc.rect(W / 2 - 62, by + 3, 124, 14); tengah(s.nama.toUpperCase(), by + 12.2, s.nama.length > 28 ? 12 : 15);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.text('NISN / NIS', W / 2, by + 28, { align: 'center' });
      doc.rect(W / 2 - 40, by + 31, 80, 12); tengah([s.nisn, s.nis].filter(Boolean).join(' / ') || '-', by + 39, 13);
      tengah(`Semester ${T.semester} (${T.semester === 1 ? 'Ganjil' : 'Genap'}) - Tahun Pelajaran ${T.nama}`, by + 56, 10, false);
      tengah(SCHOOL.toUpperCase(), H - 62, 15);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
      const bawah = [I.npsn ? 'NPSN ' + I.npsn : '', alamatGabung(I.alamat_sekolah, I.kelurahan_sekolah, I.kecamatan_sekolah), [I.kabupaten, I.provinsi].filter(Boolean).join(', ')].filter(Boolean);
      doc.text(doc.splitTextToSize(bawah.join('\n'), W - 60), W / 2, H - 53, { align: 'center' });
    }
    if (o.sekolah) {
      baru(); tengah('IDENTITAS SEKOLAH', 30, 14); y = 42;
      polos([['Nama Sekolah', ':', SCHOOL], ['NPSN', ':', isi(I.npsn)], ['Alamat Sekolah', ':', isi(I.alamat_sekolah)], ['Kode Pos', ':', isi(I.kodepos)], ['Kelurahan / Desa', ':', isi(I.kelurahan_sekolah)], ['Kecamatan', ':', isi(I.kecamatan_sekolah)], ['Kabupaten / Kota', ':', isi(I.kabupaten)], ['Provinsi', ':', isi(I.provinsi)], ['Telepon', ':', isi(I.telepon)], ['Email', ':', isi(I.email_sekolah)]], { 0: { cellWidth: 52 }, 1: { cellWidth: 5 } });
    }
    if (o.siswa) {
      baru(); tengah('IDENTITAS PESERTA DIDIK', 30, 14); y = 42;
      const lahir = [s.tempat_lahir, s.tanggal_lahir ? tglPanjang(s.tanggal_lahir) : ''].filter(Boolean).join(', ');
      const baris = [['Nama Peserta Didik', s.nama], ['NISN / NIS', [s.nisn, s.nis].filter(Boolean).join(' / ')], ['Tempat, Tanggal Lahir', lahir], ['Jenis Kelamin', s.jenis_kelamin === 'L' ? 'Laki-laki' : s.jenis_kelamin === 'P' ? 'Perempuan' : ''], ['Agama', s.agama], ['Anak ke', s.anak_ke], ['Alamat Peserta Didik', alamat(s.alamat, s.kelurahan, s.kecamatan)], ['Diterima di sekolah ini pada tanggal', s.tgl_masuk ? tglPanjang(s.tgl_masuk) : ''], ['Sekolah asal / pendidikan sebelumnya', s.pendidikan_sebelumnya], ['Nama Ayah', s.nama_ayah], ['Nama Ibu', s.nama_ibu], ['Pekerjaan Ayah', s.pekerjaan_ayah], ['Pekerjaan Ibu', s.pekerjaan_ibu], ['Alamat Orang Tua', alamat(s.alamat_ortu, s.kelurahan_ortu, s.kecamatan_ortu)], ['Nama Wali', s.nama_wali], ['Pekerjaan Wali', s.pekerjaan_wali]];
      polos(baris.map((b, i) => [String(i + 1) + '.', b[0], ':', isi(b[1])]), { 0: { cellWidth: 9 }, 1: { cellWidth: 58 }, 2: { cellWidth: 5 } }, 10);
      pastikan(60);
      doc.setLineWidth(0.3); doc.rect(M + 4, y + 4, 30, 40); doc.setFontSize(8.5); doc.text('Foto 3 x 4', M + 19, y + 25, { align: 'center' });
      doc.setFontSize(10); doc.text(`${tempat}${tglPanjang(tgl)}`, W - M - 4, y + 6, { align: 'right' }); doc.text('Kepala Sekolah,', W - M - 34, y + 13, { align: 'center' });
      doc.setFont('helvetica', 'bold'); doc.text(I.kepsek || '', W - M - 34, y + 43, { align: 'center' }); doc.setFont('helvetica', 'normal'); if (I.nip_kepsek) doc.text('NIP ' + I.nip_kepsek, W - M - 34, y + 48, { align: 'center' });
    }
    if (o.hasil) {
      baru(); tengah('LAPORAN HASIL BELAJAR', y, 14); tengah('(RAPOR)', y + 6, 11); y += 14;
      polos([['Nama Peserta Didik', ': ' + s.nama, 'Kelas', ': ' + k.nama], ['NISN / NIS', ': ' + ([s.nisn, s.nis].filter(Boolean).join(' / ') || '-'), 'Fase', ': ' + fase], ['Sekolah', ': ' + SCHOOL, 'Semester', `: ${T.semester} (${T.semester === 1 ? 'Ganjil' : 'Genap'})`], ['Alamat', ': ' + alamat(I.alamat_sekolah, I.kelurahan_sekolah, I.kecamatan_sekolah), 'Tahun Pelajaran', ': ' + T.nama]], { 0: { cellWidth: 35 }, 1: { cellWidth: W - 2 * M - 35 - 30 - 33 }, 2: { cellWidth: 30 }, 3: { cellWidth: 33 } }, 9.5);
      grid([['No', 'Muatan Pelajaran', 'Nilai Akhir', 'Capaian Kompetensi']], kmHasilBaris(D, s).map(r => [r.no, r.mapel, r.na, r.capaian.join('\n')]), { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 38 }, 2: { cellWidth: 17, halign: 'center', fontStyle: 'bold' } });
      const ek = D.ekskul[s.id] || [];
      pastikan(40);
      grid([['No', 'Ekstrakurikuler', 'Keterangan']], (ek.length ? ek : [{}]).map((e, i) => [i + 1, e.ekskul ? e.ekskul.nama : '-', e.predikat ? e.predikat + (e.keterangan ? '. ' + e.keterangan : '') : '-']), { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 50 } });
      pastikan(34);
      const ab = D.absen[s.id];
      grid([['Ketidakhadiran', '']], [['Sakit', ab.sakit + ' hari'], ['Izin', ab.izin + ' hari'], ['Tanpa Keterangan', ab.alpa + ' hari']], { 0: { cellWidth: 50 } }, { tableWidth: 90, margin: { left: M, right: M, bottom: 18 } });
      pastikan(34);
      grid([['Catatan Wali Kelas']], [[D.catatan[s.id] || '-']], {}, { bodyStyles: { minCellHeight: 16 } });
      pastikan(32);
      grid([['Tanggapan Orang Tua / Wali Murid']], [['']], {}, { bodyStyles: { minCellHeight: 18 } });
      ttd('Orang Tua / Wali', 'Wali Kelas', 'Mengetahui, Kepala Sekolah', I.kepsek || '', I.nip_kepsek);
    }
  });
  return doc;
}

/* ===== pengaturan penilaian (admin): identitas sekolah, bobot, urutan mapel ===== */
const F_IDENT = [['npsn', 'NPSN'], ['alamat_sekolah', 'Alamat sekolah (jalan, RT/RW)'], ['kodepos', 'Kode pos'], ['kelurahan_sekolah', 'Kelurahan / Desa'], ['kecamatan_sekolah', 'Kecamatan'], ['kabupaten', 'Kabupaten / Kota'], ['provinsi', 'Provinsi'], ['telepon', 'Telepon'], ['email_sekolah', 'Email sekolah'], ['kepsek', 'Nama kepala sekolah'], ['nip_kepsek', 'NIP kepala sekolah'], ['kota', 'Kota (untuk tanggal tanda tangan)']];
async function vKmPengaturan() {
  KM.layar = 'kmpengaturan';
  await kmMuat(true);
  const I = await muatIdentitas();
  $('#main').innerHTML = kmKepala('Pengaturan penilaian', 'Dipakai di sampul, identitas sekolah, dan perhitungan nilai akhir.') +
    `<div class="sec"><h2>Identitas sekolah</h2><p class="hint">Tampil di sampul dan halaman identitas raport. Nama sekolah diambil dari config.js.</p>
    <label style="margin-top:0">Jenjang</label><select id="ki-jenjang">${Object.keys(KM_JENJANG).map(j => `<option ${j === (I.jenjang || 'SD') ? 'selected' : ''}>${j}</option>`).join('')}</select>
    ${F_IDENT.map(([k, t]) => `<label>${t}</label><input id="ki-${k}" value="${h(I[k] || '')}">`).join('')}<button class="btn" onclick="kmSimpanIdentitas()">Simpan identitas</button></div>
    <div class="sec"><h2>Bobot nilai akhir</h2><p class="hint">Angka relatif, tidak harus berjumlah 100. Komponen yang belum diisi tidak ikut dihitung.</p>
    <div style="display:flex;gap:8px"><div style="flex:1"><label style="margin-top:0">Formatif</label><input id="kb-f" type="number" min="0" inputmode="numeric" value="${KM.bobot.formatif}" oninput="kmBobotLihat()"></div><div style="flex:1"><label style="margin-top:0">Sumatif materi</label><input id="kb-m" type="number" min="0" inputmode="numeric" value="${KM.bobot.materi}" oninput="kmBobotLihat()"></div><div style="flex:1"><label style="margin-top:0">Sumatif semester</label><input id="kb-s" type="number" min="0" inputmode="numeric" value="${KM.bobot.semester}" oninput="kmBobotLihat()"></div></div>
    <p class="hint" id="kb-t" style="margin:8px 0 0"></p><button class="btn" onclick="kmSimpanBobot()">Simpan bobot</button></div>
    <div class="sec"><h2>Mata pelajaran di raport</h2><p class="hint">Angka urutan kecil tampil lebih atas. KKTP adalah batas tujuan pembelajaran dianggap tercapai.</p>
    <div class="kmrow" style="font-size:12px;color:var(--mut)"><span style="flex:1">Mata pelajaran</span><span style="width:64px;text-align:center">Urutan</span><span style="width:64px;text-align:center">KKTP</span></div>
    ${KM.mapelAll.map(m => `<div class="kmrow"><span style="flex:1">${h(m.nama)}</span><input type="number" min="1" max="999" style="width:64px;text-align:center" value="${m.urutan}" onchange="kmSimpanMapel(${m.id},'urutan',this.value)" aria-label="Urutan ${h(m.nama)}"><input type="number" min="0" max="100" style="width:64px;text-align:center" value="${m.kkm}" onchange="kmSimpanMapel(${m.id},'kkm',this.value)" aria-label="KKTP ${h(m.nama)}"></div>`).join('') || kosongHtml('Belum ada mata pelajaran.')}</div>`;
  kmBobotLihat();
}
function kmBobotLihat() {
  const f = +$('#kb-f').value || 0, m = +$('#kb-m').value || 0, s = +$('#kb-s').value || 0, j = f + m + s;
  $('#kb-t').textContent = j ? `Nilai akhir = ${Math.round(f / j * 100)}% formatif + ${Math.round(m / j * 100)}% sumatif akhir materi + ${Math.round(s / j * 100)}% sumatif akhir semester.` : 'Isi minimal satu bobot lebih dari nol.';
}
async function kmSimpanIdentitas() {
  const I = { ...(await muatIdentitas()), jenjang: $('#ki-jenjang').value };
  F_IDENT.forEach(([k]) => { I[k] = ($('#ki-' + k).value || '').trim(); });
  const { error } = await sb.from('pengaturan').upsert({ kunci: 'identitas', nilai: I }, { onConflict: 'kunci' });
  if (error) return toast(error.message, 1);
  IDENT = null; toast('Identitas disimpan');
}
async function kmSimpanBobot() {
  const b = { formatif: Math.max(0, +$('#kb-f').value || 0), materi: Math.max(0, +$('#kb-m').value || 0), semester: Math.max(0, +$('#kb-s').value || 0) };
  if (!(b.formatif + b.materi + b.semester)) return toast('Isi minimal satu bobot lebih dari nol', 1);
  const { error } = await sb.from('pengaturan').upsert({ kunci: 'bobot_km', nilai: b }, { onConflict: 'kunci' });
  if (error) return toast(error.message, 1);
  KM.bobot = b; toast('Bobot disimpan');
}
async function kmSimpanMapel(id, kolom, v) {
  const n = Math.round(+v);
  if (isNaN(n) || n < (kolom === 'kkm' ? 0 : 1)) return toast('Angka tidak sah', 1);
  const { error } = await sb.from('mapel').update({ [kolom]: kolom === 'kkm' ? Math.min(100, n) : n }).eq('id', id);
  if (error) return toast(error.message, 1);
  const m = KM.mapelAll.find(x => x.id === id); if (m) m[kolom] = n;
  toast('Tersimpan');
}


/* ===== isi nilai formatif/sumatif dari nilai tugas (tetap bisa diubah manual) ===== */
let KMT = null;
async function kmPanelTugas(mode) {
  const T = KM.ta;
  const { data: tg } = await sb.from('tugas').select('id,judul,jenis,created_at').eq('kelas_id', KM.kelas).eq('mapel_id', KM.mapel).order('created_at', { ascending: false });
  const list = (tg || []).filter(x => { const d = String(x.created_at).slice(0, 10); return (!T.mulai || d >= T.mulai) && (!T.selesai || d <= T.selesai); });
  const pg = list.length ? await ambil(() => sb.from('pengumpulan_tugas').select('tugas_id,siswa_id,nilai').in('tugas_id', list.map(x => x.id)).order('id')) : [];
  KMT = { mode, pg };
  const dinilai = id => pg.filter(x => x.tugas_id === id && x.nilai != null).length;
  const kolom = mode === 'f' ? KMF.tp.map(t => `<option value="${t.id}">TP${t.nomor} - ${h(t.deskripsi.length > 38 ? t.deskripsi.slice(0, 37) + '…' : t.deskripsi)}</option>`).join('')
    : KMS.lm.flatMap(l => ['tes', 'non_tes'].map(f => `<option value="${l.id}:${f}">LM${l.nomor} ${f === 'tes' ? 'Tes' : 'Non tes'} (${KM.tahap === 'materi' ? 'akhir materi' : 'akhir semester'}) - ${h(l.nama)}</option>`)).join('');
  kmSheet(`<h3 style="margin:0 0 4px">Isi dari nilai tugas</h3><p class="hint" style="margin:0 0 4px">Nilai PR dan tugas yang sudah Anda beri di menu Tugas dirata-rata, lalu disalin ke kolom pilihan. Setelah masuk, angkanya tetap bisa diubah seperti biasa.</p>
    <label>Kolom yang diisi</label><select id="ktkol">${kolom}</select>
    <label>Tugas yang dipakai</label>${list.length ? list.map(x => `<label class="kmtg${dinilai(x.id) ? '' : ' mati'}"><input type="checkbox" class="ktg" value="${x.id}" ${dinilai(x.id) ? 'checked' : 'disabled'}><span><b>${h(x.judul)}</b><br><small>${x.jenis === 'pr' ? 'PR' : 'Tugas'} - ${tglRingkas(String(x.created_at).slice(0, 10))} - ${dinilai(x.id)} siswa sudah dinilai</small></span></label>`).join('') : kosongHtml('Belum ada tugas untuk mapel dan kelas ini pada semester ini.')}
    <label style="display:flex;gap:8px;align-items:center;font-weight:500;margin-top:12px"><input id="ktimpa" type="checkbox" style="width:auto"> Timpa nilai yang sudah ada di kolom itu</label>
    <div style="display:flex;gap:8px;margin-top:12px"><button class="btn" style="margin:0" onclick="kmIsiDariTugas()" ${list.length ? '' : 'disabled'}>Isi kolom</button><button class="btn alt" style="margin:0" onclick="kmTutupSheet()">Batal</button></div>`);
}
function kmIsiDariTugas() {
  const ids = [...document.querySelectorAll('#kmsheet .ktg:checked')].map(i => +i.value), mode = KMT.mode;
  if (!ids.length) return toast('Pilih minimal satu tugas', 1);
  const timpa = $('#ktimpa').checked, kol = $('#ktkol').value, per = {};
  KMT.pg.filter(x => ids.includes(x.tugas_id) && x.nilai != null).forEach(x => (per[x.siswa_id] ??= []).push(+x.nilai));
  const sel = mode === 'f' ? `#kmg input.kmi[data-t="${kol}"]` : `#kmg input.kmi[data-l="${kol.split(':')[0]}"][data-f="${kol.split(':')[1]}"]`, daftar = [];
  document.querySelectorAll(sel).forEach(el => { const v = per[el.dataset.s]; if (!v || el.disabled) return; if (el.value.trim() !== '' && !timpa) return; daftar.push([el, String(Math.round(rataArr(v) * 100) / 100)]); });
  if (!daftar.length) return toast('Tidak ada sel yang bisa diisi. Semua sudah terisi, atau tugasnya belum dinilai.', 1);
  kmTutupSheet(); (mode === 'f' ? kmSimpanF : kmSimpanS)(daftar); toast(`${daftar.length} nilai diisi dari tugas`);
}

/* ===== buku induk siswa (PDF) ===== */
const kmBarisIdentitas = s => {
  const isi = v => adaIsi(v) ? String(v) : '-', alamat = (a, k, c) => alamatGabung(a, k, c) || '-';
  return [['Nama Lengkap', s.nama], ['NISN / NIS', [s.nisn, s.nis].filter(Boolean).join(' / ')], ['Tempat, Tanggal Lahir', [s.tempat_lahir, s.tanggal_lahir ? tglPanjang(s.tanggal_lahir) : ''].filter(Boolean).join(', ')], ['Jenis Kelamin', s.jenis_kelamin === 'L' ? 'Laki-laki' : s.jenis_kelamin === 'P' ? 'Perempuan' : ''], ['Agama', s.agama], ['Anak ke', s.anak_ke], ['Alamat', alamat(s.alamat, s.kelurahan, s.kecamatan)], ['Diterima di sekolah ini', s.tgl_masuk ? tglPanjang(s.tgl_masuk) : ''], ['Pendidikan sebelumnya', s.pendidikan_sebelumnya]].map(b => [b[0], isi(b[1])]);
};
async function kmBukuInduk(sid) {
  try {
    const daftar = sid ? DK.siswa.filter(x => x.id === sid) : DK.siswa;
    if (!daftar.length) return toast('Tidak ada siswa untuk dicetak', 1);
    toast('Menyiapkan PDF...');
    await Promise.all([muatSkrip(JSPDF), muatIdentitas(), kmMuat()]); await muatSkrip(AUTOTABLE);
    const rw = await ambil(() => sb.from('riwayat_kelas').select('siswa_id,tahun,hasil,kelas(nama)').in('siswa_id', daftar.map(x => x.id)).order('id'));
    const kelasNama = (DK.kelas.find(k => k.id === +$('#dkk').value) || {}).nama || '';
    const doc = kmBukuIndukPdf(daftar, kelompok(rw, 'siswa_id'), kelasNama);
    doc.save(`Buku-induk-${sid ? daftar[0].nama.replace(/\s+/g, '-') : 'kelas-' + kelasNama}.pdf`);
    toast(`Buku induk ${daftar.length} siswa diunduh`);
  } catch (e) { toast(e.message || 'PDF gagal dibuat', 1); }
}
function kmBukuIndukPdf(daftar, riwayat, kelasNama) {
  const I = IDENT || {}, doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' }), W = 210, H = 297, M = 20, isi = v => adaIsi(v) ? String(v) : '-';
  const ta = (KM.tas || []).find(t => t.aktif) || KM.ta || {};
  daftar.forEach((s, i) => {
    if (i) doc.addPage();
    let y = 22;
    const tengah = (t, yy, uk) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(uk); doc.text(t, W / 2, yy, { align: 'center', maxWidth: W - 2 * M }); };
    const bagian = t => { if (y > H - 50) { doc.addPage(); y = 22; } doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.text(t, M, y); y += 2; };
    const polos = (body, lebar) => { doc.autoTable({ startY: y, body, theme: 'plain', styles: { fontSize: 10, cellPadding: { top: 1.6, bottom: 1.6, left: 1, right: 1 }, textColor: 20, valign: 'top' }, columnStyles: lebar, margin: { left: M, right: M, bottom: 16 } }); y = doc.lastAutoTable.finalY + 5; };
    tengah(SCHOOL.toUpperCase(), y, 12); tengah('BUKU INDUK PESERTA DIDIK', y + 7, 15);
    doc.setLineWidth(0.5); doc.line(M, y + 11, W - M, y + 11); y += 18;
    bagian('A. Identitas Peserta Didik');
    polos(kmBarisIdentitas(s).map((b, n) => [String(n + 1) + '.', b[0], ':', b[1]]), { 0: { cellWidth: 8 }, 1: { cellWidth: 52 }, 2: { cellWidth: 5 } });
    bagian('B. Orang Tua dan Wali');
    polos([['Nama Ayah', s.nama_ayah], ['Pekerjaan Ayah', s.pekerjaan_ayah], ['Nama Ibu', s.nama_ibu], ['Pekerjaan Ibu', s.pekerjaan_ibu], ['Alamat Orang Tua', alamatGabung(s.alamat_ortu, s.kelurahan_ortu, s.kecamatan_ortu)], ['Nama Wali', s.nama_wali], ['Pekerjaan Wali', s.pekerjaan_wali], ['Nomor HP', s.hp_wali ? tampilHp(s.hp_wali) : '']].map(b => [b[0], ':', isi(b[1])]), { 0: { cellWidth: 60 }, 1: { cellWidth: 5 } });
    bagian('C. Riwayat di Sekolah Ini');
    const baris = (riwayat[s.id] || []).map(r => [r.tahun, r.kelas ? r.kelas.nama : '-', { naik: 'Naik kelas', tinggal: 'Tinggal kelas', lulus: 'Lulus', mutasi: 'Mutasi' }[r.hasil] || r.hasil]);
    baris.push([ta.nama || '-', kelasNama || '-', 'Tahun berjalan']);
    doc.autoTable({ startY: y, head: [['No', 'Tahun Pelajaran', 'Kelas', 'Keterangan']], body: baris.map((b, n) => [n + 1, ...b]), theme: 'grid', styles: { fontSize: 9.5, cellPadding: 2, lineColor: [110, 110, 110], lineWidth: 0.2, textColor: 20 }, headStyles: { fillColor: [232, 232, 232], textColor: 0, fontStyle: 'bold', halign: 'center' }, columnStyles: { 0: { cellWidth: 12, halign: 'center' } }, margin: { left: M, right: M, bottom: 16 } });
    y = doc.lastAutoTable.finalY + 6;
    bagian('D. Catatan');
    doc.autoTable({ startY: y, body: [['']], theme: 'grid', styles: { lineColor: [110, 110, 110], lineWidth: 0.2 }, bodyStyles: { minCellHeight: 26 }, margin: { left: M, right: M, bottom: 16 } });
    y = doc.lastAutoTable.finalY + 8;
    if (y > H - 48) { doc.addPage(); y = 22; }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setDrawColor(0); doc.setLineWidth(0.3);
    doc.text(`${I.kota ? I.kota + ', ' : ''}${tglPanjang(hariWIB())}`, W - M, y, { align: 'right' }); doc.text('Kepala Sekolah,', W - M - 32, y + 7, { align: 'center' });
    doc.line(W - M - 62, y + 31, W - M - 2, y + 31); doc.setFont('helvetica', 'bold'); doc.text(I.kepsek || '', W - M - 32, y + 36, { align: 'center' });
    doc.setFont('helvetica', 'normal'); if (I.nip_kepsek) doc.text('NIP ' + I.nip_kepsek, W - M - 32, y + 41, { align: 'center' });
  });
  return doc;
}

/* ===== data induk guru dan staf ===== */
const F_GURU = [['nip', 'NIP', 't'], ['nuptk', 'NUPTK', 't'], ['jenis_kelamin', 'Jenis kelamin', 'jk'], ['tempat_lahir', 'Tempat lahir', 't'], ['tanggal_lahir', 'Tanggal lahir', 'd'], ['agama', 'Agama', 'ag'], ['pendidikan_terakhir', 'Pendidikan terakhir', 't'], ['jabatan', 'Jabatan (mis. Guru Kelas V)', 't'], ['status_kepegawaian', 'Status kepegawaian', 'st'], ['tmt', 'Mulai bertugas di sekolah ini', 'd'], ['alamat', 'Alamat', 'a']];
const STATUS_PEG = ['PNS', 'PPPK', 'GTY (guru tetap yayasan)', 'GTT', 'Honorer', 'Lainnya'];
let DG = { staf: [], gd: {} };
const kekuranganGuru = g => [!g.nip && 'NIP', !g.tanggal_lahir && 'tanggal lahir', !g.jabatan && 'jabatan', !g.status_kepegawaian && 'status'].filter(Boolean);
async function vDataGuru() {
  const sendiri = me.role === 'guru';
  const [st, gd] = await Promise.all([sendiri ? Promise.resolve({ data: [{ id: me.id, nama: me.nama, role: 'guru' }] }) : sb.from('v_staf').select('id,nama,role').order('nama'), sb.from('guru_data').select('*')]);
  DG = { staf: st.data, gd: Object.fromEntries(gd.data.map(x => [x.guru_id, x])), edit: ['admin', 'tu'].includes(me.role) };
  $('#main').innerHTML = head('Data induk', 'Data induk guru dan staf', DG.edit ? 'NIP, jabatan, status kepegawaian, dan data pribadi. NIP wali kelas tampil di raport.' : 'Data induk Anda. Hubungi admin atau TU untuk perubahan.') +
    (DG.edit ? '<div class="sec"><button class="btn alt" style="margin:0" onclick="unduhDataGuru()">Unduh Excel</button></div>' : '') +
    `<div class="sec"><h2>${DG.staf.length} orang</h2>${DG.staf.map(x => { const g = DG.gd[x.id] || {}, kr = kekuranganGuru(g); return `<div class="row" style="cursor:pointer" onclick="bukaGuru('${x.id}')"><span><b>${h(x.nama)}</b> <small>${h(ROLE_STAF[x.role] || '')}</small><br><small>${g.nip ? 'NIP ' + h(g.nip) : 'NIP belum diisi'}${g.jabatan ? ' - ' + h(g.jabatan) : ''}</small></span>${kr.length ? '<span class="stamp warn">Belum lengkap</span>' : '<span class="stamp ok">Lengkap</span>'}</div>`; }).join('') || kosongHtml('Belum ada data.')}</div><div id="dgd"></div>`;
  if (sendiri) bukaGuru(me.id);
}
function bukaGuru(id) {
  const x = DG.staf.find(y => y.id === id), g = DG.gd[id] || {}, dis = DG.edit ? '' : 'disabled';
  const kontrol = ([k, t, j]) => j === 'st' ? `<label>${t}</label><select id="f-${k}" ${dis}><option value="">Pilih</option>${STATUS_PEG.map(a => `<option ${a === g[k] ? 'selected' : ''}>${a}</option>`).join('')}</select>` : isianDs([k, t, j], g).replace(/<(input|select|textarea)/, `<$1 ${dis}`);
  $('#dgd').innerHTML = `<div class="sec" id="dgf"><h2>${h(x.nama)}</h2>${F_GURU.map(kontrol).join('')}<label>Nomor HP</label><input id="f-hp" inputmode="tel" ${dis} value="${h(g.hp ? tampilHp(g.hp) : '')}">${DG.edit ? `<button class="btn" onclick="simpanGuru('${id}')">Simpan</button>` : ''}</div>`;
  $('#dgf').scrollIntoView();
}
async function simpanGuru(id) {
  const hp = nomorWa($('#f-hp').value);
  if (hp && !hpValid(hp)) return toast('Nomor HP tidak valid', 1);
  const o = { guru_id: id, hp: hp || null, updated_at: new Date().toISOString() };
  F_GURU.forEach(([k]) => { o[k] = ($('#f-' + k).value || '').trim() || null; });
  const { error } = await sb.from('guru_data').upsert(o, { onConflict: 'guru_id' });
  if (error) return toast(error.message, 1);
  toast('Data induk disimpan'); await vDataGuru(); bukaGuru(id);
}
function unduhDataGuru() {
  if (!DG.staf.length) return toast('Tidak ada data', 1);
  unduhBuku('Data-induk-guru', [['Data induk', [['No', 'Nama', 'Jabatan sistem', 'NIP', 'NUPTK', 'L/P', 'Tempat lahir', 'Tanggal lahir', 'Agama', 'Pendidikan terakhir', 'Jabatan', 'Status kepegawaian', 'Mulai bertugas', 'HP', 'Alamat'], ...DG.staf.map((x, i) => { const g = DG.gd[x.id] || {}; return [i + 1, x.nama, ROLE_STAF[x.role] || '', g.nip || '', g.nuptk || '', g.jenis_kelamin || '', g.tempat_lahir || '', g.tanggal_lahir || '', g.agama || '', g.pendidikan_terakhir || '', g.jabatan || '', g.status_kepegawaian || '', g.tmt || '', g.hp ? tampilHp(g.hp) : '', g.alamat || '']; })]]]);
}
