/* Portal Sekolah - Kurikulum Merdeka, bagian lanjutan.
   Kunci nilai, mapel pilihan, P5, keputusan naik kelas, penerbitan raport (dan tampilan untuk siswa/orang tua),
   leger, serta mutasi siswa. Dimuat setelah modul-km.js dan sebelum app.js. */

const KM_LEVEL = { BB: 'Belum Berkembang', MB: 'Mulai Berkembang', BSH: 'Berkembang Sesuai Harapan', SB: 'Sangat Berkembang' };
const KM_KEPUTUSAN = { naik: 'Naik ke kelas', tinggal: 'Tinggal di kelas', lulus: 'Lulus' };
function kmTeksKeputusan(kp) {
  if (!kp) return '';
  if (kp.keputusan === 'lulus') return 'Berdasarkan hasil yang dicapai pada semester 1 dan 2, peserta didik ditetapkan: LULUS.';
  return `Berdasarkan hasil yang dicapai pada semester 1 dan 2, peserta didik ditetapkan: ${KM_KEPUTUSAN[kp.keputusan]}${kp.ke_kelas ? ' ' + kp.ke_kelas : ''}.`;
}
function kmKelasBerikut(nama) { const m = String(nama || '').match(/^(\d+)(.*)$/); return m ? (+m[1] + 1) + m[2] : ''; }
const kmBisaWali = D => me.role === 'admin' || (D.kelas && D.kelas.wali_kelas_id === me.id);

/* ===== kunci nilai ===== */
async function kmMuatKunci() {
  KM.kunci = false;
  if (!KM.kelas || !KM.mapel || !KM.ta) return;
  const { data } = await sb.from('km_kunci').select('waktu').eq('tahun_ajaran_id', KM.ta.id).eq('kelas_id', KM.kelas).eq('mapel_id', KM.mapel);
  KM.kunci = !!(data && data.length);
}
function kmKunciBaris() {
  const tulis = me.role === 'admin' || (me.role === 'guru' && KM.pengampu.some(p => p.kelas_id === KM.kelas && p.mapel_id === KM.mapel && p.guru_id === me.id));
  if (!tulis && !KM.kunci) return '';
  if (KM.kunci) return `<button class="kmlink" ${me.role === 'admin' ? 'onclick="kmBukaKunci()"' : 'disabled'}><span class="n">🔒</span><span style="flex:1"><b>Nilai sudah dikunci</b><br><small>${me.role === 'admin' ? 'Ketuk untuk membuka kunci' : 'Hanya admin yang bisa membuka kunci'}</small></span><span class="stamp ok">Final</span></button>`;
  return `<button class="kmlink" onclick="kmPasangKunci()"><span class="n">🔓</span><span style="flex:1"><b>Kunci nilai mapel ini</b><br><small>Tandai nilai sudah final. Setelah dikunci, nilai tidak bisa diubah guru.</small></span></button>`;
}
async function kmPasangKunci() {
  if (!confirm('Kunci nilai mapel ini? Setelah dikunci, tujuan pembelajaran dan nilai tidak bisa diubah. Hanya admin yang bisa membuka kunci.')) return;
  const { error } = await sb.from('km_kunci').insert({ tahun_ajaran_id: KM.ta.id, kelas_id: KM.kelas, mapel_id: KM.mapel });
  if (error) return toast(error.message, 1);
  toast('Nilai dikunci'); vKm();
}
async function kmBukaKunci() {
  if (!confirm('Buka kunci nilai mapel ini?')) return;
  const { error } = await sb.from('km_kunci').delete().eq('tahun_ajaran_id', KM.ta.id).eq('kelas_id', KM.kelas).eq('mapel_id', KM.mapel);
  if (error) return toast(error.message, 1);
  toast('Kunci dibuka'); vKm();
}

/* ===== mapel pilihan ===== */
const kmDiambil = (D, sid, mid) => { const m = D.mapel.find(x => x.id === mid); return !m || !m.kelompok_pilihan || (D.pilihan && D.pilihan.has(sid + ':' + mid)); };
async function kmFilterPilihan(sw, m) {
  if (!m || !m.kelompok_pilihan) return sw;
  const { data } = await sb.from('km_pilihan').select('siswa_id').eq('tahun_ajaran_id', KM.ta.id).eq('kelas_id', KM.kelas).eq('mapel_id', m.id);
  const ids = new Set((data || []).map(x => x.siswa_id));
  return sw.filter(s => ids.has(s.id));
}
let KMPL = null;
async function vKmPilihan() {
  KM.layar = 'kmpilihan';
  await kmSiap();
  const k = kmKelas();
  $('#main').innerHTML = kmKepala('Mapel pilihan', 'Untuk mapel yang dipilih salah satu, misalnya Seni Rupa, Seni Tari, atau Seni Musik. Raport hanya mencetak mapel yang dipilih siswa.') + kmBar({ mapel: false });
  if (!k || !KM.ta) return;
  const grup = kelompok(KM.mapelAll.filter(m => m.kelompok_pilihan), 'kelompok_pilihan');
  if (!Object.keys(grup).length) return $('#main').insertAdjacentHTML('beforeend', `<div class="sec"><p style="margin:0 0 6px"><b>Belum ada mapel pilihan.</b></p><p class="hint">Admin menandai mapel pilihan di Pengaturan penilaian, kolom Kelompok pilihan (contoh: tulis "Seni" pada Seni Rupa, Seni Tari, dan Seni Musik).</p></div>`);
  const [sw, pl] = await Promise.all([
    ambil(() => sb.from('siswa').select('id,nama').eq('kelas_id', k.id).eq('status', 'aktif').order('nama').order('id')),
    ambil(() => sb.from('km_pilihan').select('siswa_id,mapel_id').eq('tahun_ajaran_id', KM.ta.id).eq('kelas_id', k.id).order('id'))
  ]);
  KMPL = { sw, pl, grup, tulis: me.role === 'admin' || k.wali_kelas_id === me.id };
  $('#main').insertAdjacentHTML('beforeend', Object.entries(grup).map(([g, ms]) => {
    const mid = new Set(ms.map(m => m.id)), pilih = Object.fromEntries(pl.filter(x => mid.has(x.mapel_id)).map(x => [x.siswa_id, x.mapel_id]));
    const belum = sw.filter(s => !pilih[s.id]).length;
    return `<div class="sec"><h2>${h(g)}</h2><p class="hint">${ms.map(m => `${h(m.nama)}: ${sw.filter(s => pilih[s.id] === m.id).length}`).join(' - ')}${belum ? ` - <b>${belum} belum memilih</b>` : ''}</p>
      ${sw.map(s => `<div class="row"><span>${h(s.nama)}</span><select style="width:auto;max-width:55%" ${KMPL.tulis ? '' : 'disabled'} onchange="kmSimpanPilihan(${s.id},'${h(g).replace(/'/g, '&#39;')}',this.value)"><option value="">Belum memilih</option>${ms.map(m => `<option value="${m.id}" ${pilih[s.id] === m.id ? 'selected' : ''}>${h(m.nama)}</option>`).join('')}</select></div>`).join('')}</div>`;
  }).join('') + (KMPL.tulis ? '' : '<p class="hint" style="margin:0 2px">Hanya wali kelas dan admin yang bisa mengatur pilihan.</p>'));
}
async function kmSimpanPilihan(sid, grupNama, mapelId) {
  const g = KMPL.grup[Object.keys(KMPL.grup).find(x => x === grupNama)] || [], ids = g.map(m => m.id);
  const d = await sb.from('km_pilihan').delete().eq('tahun_ajaran_id', KM.ta.id).eq('siswa_id', sid).in('mapel_id', ids);
  if (d.error) return toast(d.error.message, 1);
  if (mapelId) { const r = await sb.from('km_pilihan').insert({ tahun_ajaran_id: KM.ta.id, kelas_id: KM.kelas, siswa_id: sid, mapel_id: +mapelId }); if (r.error) return toast(r.error.message, 1); }
  toast('Tersimpan');
}

/* ===== P5: projek penguatan profil pelajar Pancasila ===== */
let KM5 = null;
async function vKmP5() {
  KM.layar = 'kmp5';
  await kmSiap();
  const k = kmKelas();
  $('#main').innerHTML = kmKepala('Projek P5', 'Projek penguatan profil pelajar Pancasila. Capaian tiap siswa tampil di raport.') + kmBar({ mapel: false });
  if (!k || !KM.ta) return;
  const [pr, sw] = await Promise.all([sb.from('km_p5').select('*').eq('tahun_ajaran_id', KM.ta.id).eq('kelas_id', k.id).order('id'), ambil(() => sb.from('siswa').select('id,nama').eq('kelas_id', k.id).eq('status', 'aktif').order('nama').order('id'))]);
  const nl = pr.data.length ? await ambil(() => sb.from('km_p5_nilai').select('p5_id,siswa_id,level,catatan').in('p5_id', pr.data.map(x => x.id)).order('id')) : [];
  KM5 = { proyek: pr.data, sw, nilai: Object.fromEntries(nl.map(x => [x.p5_id + ':' + x.siswa_id, x])), tulis: me.role === 'admin' || k.wali_kelas_id === me.id, buka: (KM5 && KM5.buka) || null };
  if (!KM5.proyek.some(p => p.id === KM5.buka)) KM5.buka = KM5.proyek[0] ? KM5.proyek[0].id : null;
  kmGambarP5();
}
function kmGambarP5() {
  const P = KM5, dis = P.tulis ? '' : 'disabled', p = P.proyek.find(x => x.id === P.buka);
  $('#main').querySelectorAll('.kmp5').forEach(e => e.remove());
  $('#main').insertAdjacentHTML('beforeend', `<div class="kmp5">
    ${P.tulis ? `<div class="sec"><h2>Tambah projek</h2><label style="margin-top:0">Judul projek</label><input id="p5j" placeholder="Contoh: Aku Cinta Bumiku"><label>Tema</label><input id="p5t" placeholder="Contoh: Gaya Hidup Berkelanjutan"><label>Deskripsi singkat kegiatan</label><textarea id="p5d" rows="2"></textarea><button class="btn" onclick="kmTambahP5()">Tambah projek</button></div>` : ''}
    ${P.proyek.length ? `<div class="sec"><label style="margin-top:0">Projek yang diisi</label><select onchange="KM5.buka=+this.value;kmGambarP5()">${P.proyek.map(x => `<option value="${x.id}" ${x.id === P.buka ? 'selected' : ''}>${h(x.judul)}</option>`).join('')}</select>
      ${p ? `<p class="hint" style="margin:8px 0 0">${h(p.tema || '')}${p.deskripsi ? ' - ' + h(p.deskripsi) : ''}</p>${P.tulis ? `<button class="kmx" style="margin-top:8px" onclick="kmHapusP5(${p.id})">Hapus projek ini</button>` : ''}` : ''}</div>
      ${p ? `<div class="sec"><h2>Capaian siswa</h2><p class="hint">BB belum berkembang, MB mulai berkembang, BSH berkembang sesuai harapan, SB sangat berkembang.</p>
      ${P.sw.map(s => { const n = P.nilai[p.id + ':' + s.id] || {}; return `<div style="padding:8px 0;border-top:1px solid var(--line)"><div class="row" style="border:0;padding:0"><b>${h(s.nama)}</b><select style="width:auto" ${dis} onchange="kmSimpanP5(${p.id},${s.id},this.value,null)" aria-label="Capaian ${h(s.nama)}"><option value="">Belum diisi</option>${Object.entries(KM_LEVEL).map(([k, t]) => `<option value="${k}" ${n.level === k ? 'selected' : ''}>${k} - ${t}</option>`).join('')}</select></div>
        <input ${dis} placeholder="Catatan proses (boleh kosong)" value="${h(n.catatan || '')}" style="margin-top:6px" onchange="kmSimpanP5(${p.id},${s.id},null,this.value)"></div>`; }).join('')}</div>` : ''}` : `<div class="sec">${kosongHtml('Belum ada projek P5 untuk kelas ini pada semester ini.')}</div>`}</div>`);
}
async function kmTambahP5() {
  const judul = ($('#p5j').value || '').trim();
  if (!judul) return toast('Tulis judul projek dulu', 1);
  const { data, error } = await sb.from('km_p5').insert({ tahun_ajaran_id: KM.ta.id, kelas_id: KM.kelas, judul, tema: ($('#p5t').value || '').trim() || null, deskripsi: ($('#p5d').value || '').trim() || null }).select('id');
  if (error) return toast(error.message, 1);
  KM5.buka = data && data[0] ? data[0].id : null; toast('Projek ditambahkan'); vKmP5();
}
async function kmHapusP5(id) {
  if (!confirm('Hapus projek ini beserta capaian siswanya?')) return;
  const { error } = await sb.from('km_p5').delete().eq('id', id);
  if (error) return toast(error.message, 1);
  KM5.buka = null; toast('Projek dihapus'); vKmP5();
}
async function kmSimpanP5(pid, sid, level, catatan) {
  const key = pid + ':' + sid, lama = KM5.nilai[key] || {};
  const lv = level !== null ? level : lama.level, ct = catatan !== null ? (catatan.trim() || null) : (lama.catatan || null);
  if (!lv) {
    if (lama.level) { const r = await sb.from('km_p5_nilai').delete().eq('p5_id', pid).eq('siswa_id', sid); if (r.error) return toast(r.error.message, 1); delete KM5.nilai[key]; }
    else if (catatan !== null) { toast('Pilih capaian dulu sebelum menulis catatan', 1); kmGambarP5(); }
    return;
  }
  const { error } = await sb.from('km_p5_nilai').upsert({ p5_id: pid, siswa_id: sid, level: lv, catatan: ct }, { onConflict: 'p5_id,siswa_id' });
  if (error) return toast(error.message, 1);
  KM5.nilai[key] = { p5_id: pid, siswa_id: sid, level: lv, catatan: ct }; toast('Tersimpan');
}

/* ===== data raport lengkap untuk satu kelas ===== */
async function kmDataRapor(kid, taId) {
  const D = await kmDataKelas(kid, taId), ids = D.siswa.map(s => s.id), T = D.ta || {};
  const rentang = q => { if (T.mulai) q = q.gte('tanggal', T.mulai); if (T.selesai) q = q.lte('tanggal', T.selesai); return q; };
  const [rp, ek, ab, p5, kp, kc, tb] = ids.length ? await Promise.all([
    ambil(() => sb.from('raport').select('siswa_id,catatan_wali').eq('tahun_ajaran_id', taId).in('siswa_id', ids).order('id')),
    ambil(() => sb.from('nilai_ekskul').select('siswa_id,predikat,keterangan,ekskul(nama)').eq('tahun_ajaran_id', taId).in('siswa_id', ids).order('id')),
    ambil(() => rentang(sb.from('absensi').select('siswa_id,status,tanggal,terverifikasi').in('siswa_id', ids)).order('id')),
    ambil(() => sb.from('km_p5').select('*').eq('tahun_ajaran_id', taId).eq('kelas_id', kid).order('id')),
    ambil(() => sb.from('km_keputusan').select('*').eq('tahun_ajaran_id', taId).eq('kelas_id', kid).order('id')),
    ambil(() => sb.from('km_kunci').select('mapel_id').eq('tahun_ajaran_id', taId).eq('kelas_id', kid)),
    ambil(() => sb.from('km_raport_terbit').select('siswa_id,terbit_pada').eq('tahun_ajaran_id', taId).in('siswa_id', ids))
  ]) : [[], [], [], [], [], [], []];
  const pn = p5.length ? await ambil(() => sb.from('km_p5_nilai').select('p5_id,siswa_id,level,catatan').in('p5_id', p5.map(x => x.id)).order('id')) : [];
  D.catatan = Object.fromEntries(rp.map(x => [x.siswa_id, x.catatan_wali || '']));
  D.ekskul = kelompok(ek, 'siswa_id');
  D.absen = {};
  ids.forEach(i => D.absen[i] = { sakit: 0, izin: 0, alpa: 0 });
  ab.filter(x => x.terverifikasi !== false && D.absen[x.siswa_id] && D.absen[x.siswa_id][x.status] != null).forEach(x => D.absen[x.siswa_id][x.status]++);
  D.p5 = { proyek: p5, nilai: Object.fromEntries(pn.map(x => [x.p5_id + ':' + x.siswa_id, x])) };
  D.keputusan = Object.fromEntries(kp.map(x => [x.siswa_id, x]));
  D.kunci = new Set(kc.map(x => x.mapel_id));
  D.terbit = Object.fromEntries(tb.map(x => [x.siswa_id, x.terbit_pada]));
  return D;
}
const kmTotal = (D, s) => D.mapel.filter(m => kmDiambil(D, s.id, m.id)).length;
const kmLengkap = (D, s) => D.mapel.filter(m => kmDiambil(D, s.id, m.id) && D.hasil[s.id][m.id].na != null).length;
function kmHasilBaris(D, s) {
  return D.mapel.filter(m => kmDiambil(D, s.id, m.id)).map((m, i) => { const x = D.hasil[s.id][m.id]; return { no: i + 1, mid: m.id, ubah: !!x.ubah, mapel: m.nama, na: x.na == null ? '-' : String(x.na), capaian: x.capaian.length ? x.capaian : [x.na == null ? 'Belum ada penilaian.' : 'Capaian kompetensi belum diisi (tujuan pembelajaran atau nilai formatif kosong).'] }; });
}

/* ===== halaman raport (wali kelas) ===== */
async function vKmRapor() {
  KM.layar = 'kmrapor';
  await kmSiap();
  const k = kmKelas();
  $('#main').innerHTML = kmKepala('Raport dan sampul', 'Pratinjau, cetak PDF, dan terbitkan ke siswa dan orang tua.') + kmBar({ mapel: false });
  if (!k || !KM.ta) return;
  $('#main').insertAdjacentHTML('beforeend', '<div id="kmpr"><div class="sec">' + kosongHtml('Memuat data kelas...') + '</div></div>');
  KMP = await kmDataRapor(k.id, KM.ta.id);
  kmGambarRapor();
}
function kmGambarRapor() {
  const D = KMP, wali = kmBisaWali(D);
  if (!D.siswa.length) return $('#kmpr').innerHTML = `<div class="sec">${kosongHtml('Belum ada siswa aktif di kelas ini.')}</div>`;
  const siap = D.siswa.filter(s => { const t = kmTotal(D, s); return t && kmLengkap(D, s) === t; }).length, genap = D.ta.semester === 2;
  const kosongMapel = D.mapel.map(m => ({ m, n: D.siswa.filter(s => kmDiambil(D, s.id, m.id) && D.hasil[s.id][m.id].na == null).length })).filter(x => x.n);
  const belumKunci = D.mapel.filter(m => !D.kunci.has(m.id)), terbit = D.siswa.filter(s => D.terbit[s.id]).length;
  $('#kmpr').innerHTML = `
    <div class="sec"><h2>Kesiapan raport</h2>
    <p class="hint" style="margin:0 0 6px">${siap} dari ${D.siswa.length} siswa nilainya lengkap. ${terbit} sudah diterbitkan.</p>
    ${kosongMapel.length ? `<div class="kmwarn" style="margin-bottom:8px"><b>Belum ada nilai:</b> ${kosongMapel.map(x => `${h(x.m.nama)} (${x.n} siswa)`).join(', ')}.</div>` : ''}
    ${belumKunci.length ? `<div class="kmwarn" style="margin-bottom:8px"><b>Belum dikunci guru:</b> ${belumKunci.map(m => h(m.nama)).join(', ')}.</div>` : '<p class="hint" style="margin:0 0 8px">Semua nilai mapel sudah dikunci.</p>'}
    <label>Halaman yang dicetak</label>
    <div class="kmcek"><label><input type="checkbox" id="kc1" checked> Sampul</label><label><input type="checkbox" id="kc2" checked> Identitas sekolah</label><label><input type="checkbox" id="kc3" checked> Identitas peserta didik</label><label><input type="checkbox" id="kc4" checked> Hasil belajar</label></div>
    <label>Ukuran kertas</label><select id="kkr"><option value="a4">A4 (210 x 297 mm)</option><option value="f4">F4 / Folio (215 x 330 mm)</option></select>
    <button class="btn" onclick="kmUnduh(null)">Unduh PDF seluruh kelas (${D.siswa.length} siswa)</button>
    ${wali ? `<button class="btn alt" onclick="kmTerbitkan(null)">Terbitkan raport seluruh kelas</button>${genap ? '<button class="btn alt" onclick="kmKeputusanSemua()">Isi keputusan semua: naik kelas</button>' : ''}` : ''}</div>
    <div class="sec"><h2>Siswa</h2>${D.siswa.map(s => { const n = kmLengkap(D, s), t = kmTotal(D, s); return `<div class="row"><span><b>${h(s.nama)}</b><br><small>${n} dari ${t} mapel bernilai${D.catatan[s.id] ? '' : ' - catatan wali kosong'}</small></span><span style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end">${D.terbit[s.id] ? '<span class="stamp ok">Terbit</span>' : n === t && t ? '<span class="stamp no">Lengkap</span>' : '<span class="stamp warn">Belum</span>'}<button class="btn alt sm" onclick="kmPratinjau(${s.id})">Pratinjau</button><button class="btn sm" onclick="kmUnduh(${s.id})">PDF</button></span></div>`; }).join('')}</div><div id="kmpv"></div>`;
}

/* HTML kertas raport (dipakai pratinjau wali dan tampilan siswa/orang tua). edit = tampilkan tombol ubah */
function kmKertasHtml(D, s, edit) {
  const T = D.ta, k = D.kelas, ek = D.ekskul[s.id] || [], ab = D.absen[s.id], fase = faseDari(k.tingkat || tingkatDari(k.nama) || 0);
  const p5 = (D.p5 && D.p5.proyek) || [], kp = D.keputusan && D.keputusan[s.id];
  return `<div class="kertas">
    <h3 class="kjudul">LAPORAN HASIL BELAJAR<br><span>(RAPOR)</span></h3>
    <div class="kmhead"><div><span>Nama Peserta Didik</span><b>: ${h(s.nama)}</b><span>NISN / NIS</span><b>: ${h([s.nisn, s.nis].filter(Boolean).join(' / ') || '-')}</b><span>Sekolah</span><b>: ${h(SCHOOL)}</b></div><div><span>Kelas</span><b>: ${h(k.nama)}</b><span>Fase</span><b>: ${fase}</b><span>Semester</span><b>: ${T.semester} (${T.semester === 1 ? 'Ganjil' : 'Genap'})</b><span>Tahun Pelajaran</span><b>: ${h(T.nama)}</b></div></div>
    <table class="kmtab"><thead><tr><th style="width:28px">No</th><th style="width:30%">Muatan Pelajaran</th><th style="width:56px">Nilai Akhir</th><th>Capaian Kompetensi</th></tr></thead><tbody>${kmHasilBaris(D, s).map(r => `<tr><td align="center">${r.no}</td><td>${h(r.mapel)}${edit && kmBisaUbah(D, r.mid) ? `<br><button class="kmed" onclick="kmEditHasil(KMP,${s.id},${r.mid},()=>kmPratinjau(${s.id}))">Ubah${r.ubah ? ' (sudah diubah)' : ''}</button>` : ''}</td><td align="center"><b>${r.na}</b></td><td>${r.capaian.map(c => `<p>${h(c)}</p>`).join('')}</td></tr>`).join('') || '<tr><td colspan="4">Belum ada mata pelajaran.</td></tr>'}</tbody></table>
    ${p5.length ? `<table class="kmtab" style="margin-top:12px"><thead><tr><th>Projek Penguatan Profil Pelajar Pancasila</th><th style="width:96px">Capaian</th></tr></thead><tbody>${p5.map(p => { const n = D.p5.nilai[p.id + ':' + s.id]; return `<tr><td><b>${h(p.judul)}</b>${p.tema ? ' (' + h(p.tema) + ')' : ''}${p.deskripsi ? `<p>${h(p.deskripsi)}</p>` : ''}${n && n.catatan ? `<p>${h(n.catatan)}</p>` : ''}</td><td align="center">${n ? h(KM_LEVEL[n.level]) : '-'}</td></tr>`; }).join('')}</tbody></table>` : ''}
    <table class="kmtab" style="margin-top:12px"><thead><tr><th style="width:28px">No</th><th style="width:30%">Ekstrakurikuler</th><th>Keterangan</th></tr></thead><tbody>${ek.map((e, i) => `<tr><td align="center">${i + 1}</td><td>${h(e.ekskul?.nama || '-')}</td><td>${h(e.predikat)}${e.keterangan ? '. ' + h(e.keterangan) : ''}</td></tr>`).join('') || '<tr><td align="center">1</td><td>-</td><td>-</td></tr>'}</tbody></table>
    <table class="kmtab" style="margin-top:12px;width:60%;min-width:0"><thead><tr><th colspan="2">Ketidakhadiran</th></tr></thead><tbody><tr><td>Sakit</td><td>${ab.sakit} hari</td></tr><tr><td>Izin</td><td>${ab.izin} hari</td></tr><tr><td>Tanpa Keterangan</td><td>${ab.alpa} hari</td></tr></tbody></table>
    ${kp ? `<table class="kmtab" style="margin-top:12px"><thead><tr><th>Keputusan</th></tr></thead><tbody><tr><td>${h(kmTeksKeputusan(kp))}</td></tr></tbody></table>` : ''}
    ${D.catatan[s.id] ? `<table class="kmtab" style="margin-top:12px"><thead><tr><th>Catatan Wali Kelas</th></tr></thead><tbody><tr><td>${h(D.catatan[s.id])}</td></tr></tbody></table>` : ''}</div>`;
}
function kmPratinjau(sid) {
  const D = KMP, s = D.siswa.find(x => x.id === sid), tulis = kmBisaWali(D), genap = D.ta.semester === 2, kp = D.keputusan[sid] || {};
  $('#kmpv').innerHTML = `<div class="sec"><h2>Pratinjau raport</h2>${kmKertasHtml(D, s, true)}
    <h3 class="sub">Catatan wali kelas</h3><textarea id="kmcw" rows="3" ${tulis ? '' : 'disabled'} placeholder="Tulis catatan untuk ${h(s.nama.split(' ')[0])}">${h(D.catatan[sid] || '')}</textarea>
    ${tulis ? `<button class="btn alt sm" style="margin-top:8px" onclick="kmSimpanCatatan(${sid})">Simpan catatan</button>` : '<p class="hint">Catatan hanya bisa diubah wali kelas.</p>'}
    ${genap && tulis ? `<h3 class="sub">Keputusan naik kelas</h3><div style="display:flex;gap:8px"><select id="kkp" style="flex:1"><option value="">Belum diputuskan</option>${Object.entries(KM_KEPUTUSAN).map(([k, t]) => `<option value="${k}" ${kp.keputusan === k ? 'selected' : ''}>${t}</option>`).join('')}</select><input id="kkk" style="flex:1" placeholder="Kelas tujuan" value="${h(kp.ke_kelas || kmKelasBerikut(D.kelas.nama))}"></div><button class="btn alt sm" style="margin-top:8px" onclick="kmSimpanKeputusan(${sid})">Simpan keputusan</button>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"><button class="btn" style="margin:0" onclick="kmUnduh(${sid})">Unduh PDF ${h(s.nama.split(' ')[0])}</button>${tulis ? (D.terbit[sid] ? `<button class="btn alt" style="margin:0" onclick="kmTarik(${sid})">Tarik raport</button>` : `<button class="btn alt" style="margin:0" onclick="kmTerbitkan(${sid})">Terbitkan ke orang tua</button>`) : ''}</div></div>`;
  $('#kmpv').scrollIntoView();
}
async function kmSimpanKeputusan(sid) {
  const D = KMP, kp = $('#kkp').value, ke = ($('#kkk').value || '').trim() || null;
  if (!kp) {
    const r = await sb.from('km_keputusan').delete().eq('tahun_ajaran_id', D.ta.id).eq('siswa_id', sid);
    if (r.error) return toast(r.error.message, 1); delete D.keputusan[sid]; return toast('Keputusan dihapus');
  }
  const baris = { tahun_ajaran_id: D.ta.id, kelas_id: D.kid, siswa_id: sid, keputusan: kp, ke_kelas: kp === 'naik' ? ke : kp === 'tinggal' ? D.kelas.nama : null };
  const { error } = await sb.from('km_keputusan').upsert(baris, { onConflict: 'tahun_ajaran_id,siswa_id' });
  if (error) return toast(error.message, 1);
  D.keputusan[sid] = baris; toast('Keputusan tersimpan'); kmPratinjau(sid);
}
async function kmKeputusanSemua() {
  const D = KMP, ke = kmKelasBerikut(D.kelas.nama), baru = D.siswa.filter(s => !D.keputusan[s.id]);
  if (!baru.length) return toast('Semua siswa sudah punya keputusan', 1);
  if (!confirm(`Isi keputusan "naik kelas${ke ? ' ' + ke : ''}" untuk ${baru.length} siswa yang belum diputuskan? Bisa diubah satu per satu.`)) return;
  const baris = baru.map(s => ({ tahun_ajaran_id: D.ta.id, kelas_id: D.kid, siswa_id: s.id, keputusan: 'naik', ke_kelas: ke || null }));
  const { error } = await sb.from('km_keputusan').upsert(baris, { onConflict: 'tahun_ajaran_id,siswa_id' });
  if (error) return toast(error.message, 1);
  baris.forEach(b => D.keputusan[b.siswa_id] = b); toast(`${baris.length} keputusan diisi`);
}

/* ===== penerbitan raport (salinan tetap untuk siswa dan orang tua) ===== */
function kmSnapshot(D, s) {
  const f = ['id', 'nama', 'nis', 'nisn', 'jenis_kelamin', 'tempat_lahir', 'tanggal_lahir', 'agama', 'anak_ke', 'alamat', 'kelurahan', 'kecamatan', 'tgl_masuk', 'pendidikan_sebelumnya', 'nama_ayah', 'pekerjaan_ayah', 'nama_ibu', 'pekerjaan_ibu', 'alamat_ortu', 'kelurahan_ortu', 'kecamatan_ortu', 'nama_wali', 'pekerjaan_wali'];
  return { v: 1, siswa: Object.fromEntries(f.map(k => [k, s[k] ?? null])), kelas: { id: D.kelas.id, nama: D.kelas.nama, tingkat: D.kelas.tingkat || null },
    ta: { id: D.ta.id, nama: D.ta.nama, semester: D.ta.semester, tgl_raport: D.ta.tgl_raport || null }, wali: D.wali, waliNip: D.waliNip,
    mapel: D.mapel.filter(m => kmDiambil(D, s.id, m.id)).map(m => { const x = D.hasil[s.id][m.id]; return { id: m.id, nama: m.nama, kkm: m.kkm, na: x.na, capaian: x.capaian }; }),
    ekskul: (D.ekskul[s.id] || []).map(e => ({ nama: e.ekskul ? e.ekskul.nama : '-', predikat: e.predikat, keterangan: e.keterangan })), absen: D.absen[s.id], catatan: D.catatan[s.id] || '',
    p5: D.p5.proyek.map(p => { const n = D.p5.nilai[p.id + ':' + s.id] || {}; return { judul: p.judul, tema: p.tema, deskripsi: p.deskripsi, level: n.level || null, catatan: n.catatan || null }; }),
    keputusan: D.keputusan[s.id] ? { keputusan: D.keputusan[s.id].keputusan, ke_kelas: D.keputusan[s.id].ke_kelas } : null };
}
function kmDariSnapshot(sn) {
  const s = sn.siswa, hasil = { [s.id]: {} }, nilai = {};
  sn.mapel.forEach(m => { hasil[s.id][m.id] = { na: m.na, naOto: m.na, capaian: m.capaian || [], capaianOto: m.capaian || [], ubah: null }; });
  const proyek = sn.p5.map((p, i) => ({ id: i + 1, judul: p.judul, tema: p.tema, deskripsi: p.deskripsi }));
  sn.p5.forEach((p, i) => { if (p.level) nilai[(i + 1) + ':' + s.id] = { level: p.level, catatan: p.catatan }; });
  return { kid: sn.kelas.id, kelas: { ...sn.kelas, wali_kelas_id: null }, ta: sn.ta, siswa: [s], mapel: sn.mapel.map(m => ({ id: m.id, nama: m.nama, kkm: m.kkm })), hasil, wali: sn.wali, waliNip: sn.waliNip,
    ekskul: { [s.id]: sn.ekskul.map(e => ({ ekskul: { nama: e.nama }, predikat: e.predikat, keterangan: e.keterangan })) }, absen: { [s.id]: sn.absen }, catatan: { [s.id]: sn.catatan },
    p5: { proyek, nilai }, keputusan: sn.keputusan ? { [s.id]: sn.keputusan } : {}, pilihan: new Set() };
}
async function kmTerbitkan(sid) {
  const D = KMP, daftar = sid ? D.siswa.filter(s => s.id === sid) : D.siswa;
  const belumKunci = D.mapel.filter(m => !D.kunci.has(m.id)).length, kurang = daftar.filter(s => kmLengkap(D, s) < kmTotal(D, s)).length;
  const peringatan = [belumKunci ? `${belumKunci} mapel belum dikunci guru` : '', kurang ? `${kurang} siswa nilainya belum lengkap` : ''].filter(Boolean).join(', ');
  if (!confirm(`Terbitkan raport ${sid ? daftar[0].nama : daftar.length + ' siswa'}? Siswa dan orang tua mendapat notifikasi dan bisa melihat raport di portal.${peringatan ? '\n\nPerhatian: ' + peringatan + '.' : ''}`)) return;
  const baris = daftar.map(s => ({ siswa_id: s.id, tahun_ajaran_id: D.ta.id, kelas_id: D.kid, data: kmSnapshot(D, s), terbit_pada: new Date().toISOString() }));
  for (let i = 0; i < baris.length; i += 25) { const { error } = await sb.from('km_raport_terbit').upsert(baris.slice(i, i + 25), { onConflict: 'siswa_id,tahun_ajaran_id' }); if (error) return toast(error.message, 1); }
  baris.forEach(b => D.terbit[b.siswa_id] = b.terbit_pada);
  toast(`${baris.length} raport diterbitkan`); kmGambarRapor(); if (sid) kmPratinjau(sid);
}
async function kmTarik(sid) {
  if (!confirm('Tarik raport ini? Siswa dan orang tua tidak bisa melihatnya lagi sampai diterbitkan ulang.')) return;
  const { error } = await sb.from('km_raport_terbit').delete().eq('tahun_ajaran_id', KMP.ta.id).eq('siswa_id', sid);
  if (error) return toast(error.message, 1);
  delete KMP.terbit[sid]; toast('Raport ditarik'); kmGambarRapor(); kmPratinjau(sid);
}

/* ===== raport untuk siswa dan orang tua ===== */
let KMR_SW = {};
async function vRaportku() {
  const [tb, sw] = await Promise.all([sb.from('km_raport_terbit').select('siswa_id,tahun_ajaran_id,data,terbit_pada').order('terbit_pada', { ascending: false }), sb.from('siswa').select('id,nama').order('nama')]);
  KMR_SW = Object.fromEntries(tb.data.map(x => [x.siswa_id + ':' + x.tahun_ajaran_id, x]));
  const nama = Object.fromEntries(sw.data.map(x => [x.id, x.nama]));
  $('#main').innerHTML = head('Raport', 'Raport', 'Raport yang sudah diterbitkan wali kelas.') +
    `<div class="sec">${tb.data.map(x => `<div class="row"><span><b>${h(nama[x.siswa_id] || x.data.siswa.nama)}</b><br><small>Semester ${x.data.ta.semester} ${h(x.data.ta.nama)} - kelas ${h(x.data.kelas.nama)} - terbit ${tglPanjang(String(x.terbit_pada).slice(0, 10))}</small></span><span style="display:flex;gap:6px"><button class="btn alt sm" onclick="kmLihatRaportku(${x.siswa_id},${x.tahun_ajaran_id})">Lihat</button><button class="btn sm" onclick="kmUnduhRaportku(${x.siswa_id},${x.tahun_ajaran_id})">PDF</button></span></div>`).join('') || kosongHtml('Belum ada raport yang diterbitkan.')}</div><div id="rkv"></div>`;
}
function kmLihatRaportku(sid, ta) {
  const x = KMR_SW[sid + ':' + ta], D = kmDariSnapshot(x.data);
  $('#rkv').innerHTML = `<div class="sec"><h2>Raport ${h(x.data.siswa.nama)}</h2>${kmKertasHtml(D, D.siswa[0], false)}</div>`;
  $('#rkv').scrollIntoView();
}
async function kmUnduhRaportku(sid, ta) {
  try {
    toast('Menyiapkan PDF...');
    const x = KMR_SW[sid + ':' + ta], D = kmDariSnapshot(x.data);
    await Promise.all([muatSkrip(JSPDF), muatIdentitas(), muatLogo()]); await muatSkrip(AUTOTABLE);
    kmBuatPdf(D, D.siswa, { sampul: true, sekolah: true, siswa: true, hasil: true, kertas: 'a4' }).save(`Raport-${x.data.siswa.nama.replace(/\s+/g, '-')}-Semester${x.data.ta.semester}-${x.data.ta.nama.replace('/', '-')}.pdf`);
    toast('PDF diunduh');
  } catch (e) { toast(e.message || 'PDF gagal dibuat', 1); }
}

/* ===== leger: daftar nilai satu kelas ===== */
function kmLegerData() {
  const D = KMR, baris = D.siswa.map(s => { const na = D.mapel.map(m => kmDiambil(D, s.id, m.id) ? D.hasil[s.id][m.id].na : null), ada = na.filter(x => x != null); return { s, na, jumlah: ada.reduce((u, x) => u + x, 0), rata: ada.length ? ada.reduce((u, x) => u + x, 0) / ada.length : null }; });
  const urut = baris.filter(b => b.rata != null).sort((a, b) => b.rata - a.rata);
  baris.forEach(b => { b.rank = b.rata == null ? null : urut.findIndex(x => x.rata === b.rata) + 1; });
  return baris;
}
function kmLegerExcel() {
  const D = KMR, b = kmLegerData();
  unduhBuku(`Leger-${D.kelas.nama || 'kelas'}-Semester${D.ta.semester}`, [['Leger', [[`Daftar nilai kelas ${D.kelas.nama} - Semester ${D.ta.semester} ${D.ta.nama}`], [], ['No', 'Nama', ...D.mapel.map(m => m.nama), 'Jumlah', 'Rata-rata', 'Peringkat'], ...b.map((x, i) => [i + 1, x.s.nama, ...x.na.map(v => v ?? ''), x.jumlah, x.rata == null ? '' : Math.round(x.rata * 10) / 10, x.rank ?? ''])]]]);
}
async function kmLegerPdf() {
  try {
    toast('Menyiapkan PDF...');
    await Promise.all([muatSkrip(JSPDF), muatIdentitas(), muatLogo()]); await muatSkrip(AUTOTABLE);
    const D = KMR, I = IDENT || {}, b = kmLegerData(), doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 12;
    if (LOGO) doc.addImage(LOGO, 'JPEG', M, 8, 15, 15);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text('DAFTAR NILAI (LEGER)', W / 2, 14, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text(`${SCHOOL} - Kelas ${D.kelas.nama} - Semester ${D.ta.semester} Tahun Pelajaran ${D.ta.nama}`, W / 2, 20, { align: 'center' });
    doc.autoTable({ startY: 27, head: [['No', 'Nama', ...D.mapel.map(m => m.nama), 'Jumlah', 'Rata-rata', 'Rank']], body: b.map((x, i) => [i + 1, x.s.nama, ...x.na.map(v => v ?? '-'), x.jumlah, x.rata == null ? '-' : String(Math.round(x.rata * 10) / 10), x.rank ?? '-']), theme: 'grid',
      styles: { fontSize: 8, cellPadding: 1.6, lineColor: [110, 110, 110], lineWidth: 0.2, textColor: 20, halign: 'center' }, headStyles: { fillColor: [232, 232, 232], textColor: 0, fontStyle: 'bold', fontSize: 7.5 }, columnStyles: { 1: { halign: 'left', cellWidth: 46 }, 0: { cellWidth: 8 } }, margin: { left: M, right: M, bottom: 14 } });
    let y = doc.lastAutoTable.finalY + 8;
    if (y > H - 40) { doc.addPage(); y = 20; }
    doc.setFontSize(10); doc.setDrawColor(0); doc.setLineWidth(0.3);
    doc.text(`${I.kota ? I.kota + ', ' : ''}${tglPanjang(hariWIB())}`, W - M, y, { align: 'right' });
    [[M + 40, 'Wali Kelas', D.wali, D.waliNip], [W - M - 45, 'Kepala Sekolah', I.kepsek, I.nip_kepsek]].forEach(([x, t, n, nip]) => { doc.text(t, x, y + 7, { align: 'center' }); doc.line(x - 28, y + 28, x + 28, y + 28); if (n) doc.text(n, x, y + 33, { align: 'center' }); if (nip) doc.text('NIP ' + nip, x, y + 38, { align: 'center' }); });
    doc.save(`Leger-${D.kelas.nama}-Semester${D.ta.semester}-${D.ta.nama.replace('/', '-')}.pdf`);
    toast('PDF leger diunduh');
  } catch (e) { toast(e.message || 'PDF gagal dibuat', 1); }
}

/* ===== mutasi siswa (TU, admin) ===== */
let MUT = { jenis: 'keluar', siswa: [], riwayat: [] };
async function vMutasi() {
  const tulis = ['admin', 'tu'].includes(me.role);
  const [sw, rw] = await Promise.all([ambil(() => sb.from('siswa').select('id,nama,nis,status,kelas(nama)').order('nama').order('id')), sb.from('mutasi_siswa').select('*').order('tanggal', { ascending: false }).order('id', { ascending: false })]);
  MUT.siswa = sw; MUT.riwayat = rw.data;
  $('#main').innerHTML = head('Mutasi', 'Mutasi siswa', 'Siswa pindah keluar atau masuk dari sekolah lain. Tercatat di buku induk.') +
    (tulis ? `<div class="sec"><div class="seg"><button id="mj1" onclick="MUT.jenis='keluar';kmGambarMutasi()">Pindah keluar</button><button id="mj2" onclick="MUT.jenis='masuk';kmGambarMutasi()">Pindah masuk</button></div>
    <div id="mf"></div></div>` : '') + `<div class="sec"><h2>Riwayat mutasi</h2><button class="btn alt sm" style="margin:0 0 8px" onclick="kmMutasiExcel()">Unduh Excel</button>${rw.data.slice(0, 100).map(x => { const s = sw.find(y => y.id === x.siswa_id) || {}; return `<div class="row"><span><b>${h(s.nama || '-')}</b><br><small>${x.jenis === 'keluar' ? 'Pindah ke ' : 'Pindah dari '}${h(x.sekolah || '-')}${x.no_surat ? ' - surat ' + h(x.no_surat) : ''}${x.alasan ? '<br>' + h(x.alasan) : ''}</small></span><span style="text-align:right"><span class="stamp ${x.jenis === 'keluar' ? 'warn' : 'ok'}">${x.jenis === 'keluar' ? 'Keluar' : 'Masuk'}</span><br><small>${tglRingkas(x.tanggal)}</small></span></div>`; }).join('') || kosongHtml('Belum ada mutasi.')}</div>`;
  if (tulis) kmGambarMutasi();
}
function kmGambarMutasi() {
  $('#mj1').classList.toggle('on', MUT.jenis === 'keluar'); $('#mj2').classList.toggle('on', MUT.jenis === 'masuk');
  const keluar = MUT.jenis === 'keluar', q = ($('#mq') ? $('#mq').value : '').toLowerCase();
  const calon = MUT.siswa.filter(s => (keluar ? s.status === 'aktif' : true) && (!q || s.nama.toLowerCase().includes(q) || String(s.nis).includes(q))).slice(0, 60);
  $('#mf').innerHTML = `<label>Cari siswa</label><input id="mq" placeholder="Nama atau NIS" value="${h(q)}" oninput="kmGambarMutasi();$('#mq').focus()">
    <label>Siswa</label><select id="ms">${calon.map(s => `<option value="${s.id}">${h(s.nama)} (${h(s.kelas?.nama || 'tanpa kelas')}${s.status !== 'aktif' ? ', ' + h(s.status) : ''})</option>`).join('') || '<option value="">Tidak ada yang cocok</option>'}</select>
    ${keluar ? '' : '<p class="hint" style="margin:6px 0 0">Siswa baru didaftarkan dulu lewat Data siswa atau Impor Excel, lalu dipilih di sini.</p>'}
    <label>Tanggal</label><input id="mt" type="date" value="${hariWIB()}"><label>${keluar ? 'Sekolah tujuan' : 'Sekolah asal'}</label><input id="mh"><label>Alasan (boleh kosong)</label><input id="ma"><label>Nomor surat (boleh kosong)</label><input id="mn">
    <button class="btn" onclick="kmSimpanMutasi()">Catat mutasi ${keluar ? 'keluar' : 'masuk'}</button>`;
}
async function kmSimpanMutasi() {
  const sid = +$('#ms').value;
  if (!sid) return toast('Pilih siswa dulu', 1);
  const s = MUT.siswa.find(x => x.id === sid);
  if (!confirm(`Catat mutasi ${MUT.jenis} untuk ${s.nama}?${MUT.jenis === 'keluar' ? ' Status siswa menjadi "mutasi" dan ia tidak muncul lagi di daftar kelas aktif.' : ''}`)) return;
  const { data, error } = await sb.rpc('catat_mutasi', { p_siswa: sid, p_jenis: MUT.jenis, p_tanggal: $('#mt').value, p_sekolah: $('#mh').value, p_alasan: $('#ma').value, p_surat: $('#mn').value });
  if (error) return toast(error.message, 1);
  toast(data.pesan, !data.ok); if (data.ok) vMutasi();
}
function kmMutasiExcel() {
  if (!MUT.riwayat.length) return toast('Belum ada data', 1);
  unduhBuku('Mutasi-siswa', [['Mutasi', [['Tanggal', 'Jenis', 'Nama', 'NIS', 'Sekolah', 'Alasan', 'No surat'], ...MUT.riwayat.map(x => { const s = MUT.siswa.find(y => y.id === x.siswa_id) || {}; return [x.tanggal, x.jenis, s.nama || '', s.nis || '', x.sekolah || '', x.alasan || '', x.no_surat || '']; })]]]);
}
