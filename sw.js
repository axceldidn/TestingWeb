// Service worker: aplikasi bisa dipasang (PWA), tetap terbuka saat sinyal buruk,
// dan menampilkan notifikasi layar kunci.
const VERSI = 'portal-v8';
const INTI = ['./', 'index.html', 'app.js', 'modul-v3.js', 'modul-km.js', 'modul-km2.js', 'logo.jpg', 'style.css', 'config.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/favicon.png'];
const CDN = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => { e.waitUntil(caches.open(VERSI).then(c => c.addAll(INTI)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== VERSI).map(x => caches.delete(x)))).then(() => self.clients.claim()));
});

// File milik portal: ambil yang terbaru dari jaringan, cadangkan ke cache. Offline: pakai cache.
// Pustaka dan font dari CDN: pakai cache dulu supaya cepat, perbarui di belakang layar.
// Data Supabase tidak pernah disimpan di cache.
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET') return;
  if (u.origin === self.location.origin) {
    e.respondWith(fetch(r).then(res => { const salin = res.clone(); caches.open(VERSI).then(c => c.put(r, salin)); return res; })
      .catch(() => caches.match(r).then(m => m || (r.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
  } else if (CDN.includes(u.hostname)) {
    e.respondWith(caches.match(r).then(m => {
      const jaringan = fetch(r).then(res => { const salin = res.clone(); caches.open(VERSI).then(c => c.put(r, salin)); return res; }).catch(() => m);
      return m || jaringan;
    }));
  }
});

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'Portal sekolah', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Portal sekolah', {
    body: d.body || '', icon: 'icons/icon-192.png', badge: 'icons/favicon.png',
    tag: String(d.id || 'portal'), data: { url: d.url || 'home' }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || 'home';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(l => {
    if (l.length) { l[0].focus(); l[0].postMessage({ buka: url }); return; }
    return self.clients.openWindow('./#' + url);
  }));
});
