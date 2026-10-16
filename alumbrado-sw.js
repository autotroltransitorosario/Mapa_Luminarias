// AUTOTROL · Equipamiento Alumbrado — Service Worker v3
const CACHE = 'autotrol-alumbrado-v3';
const APP_URLS = ['./alumbrado.html', './', './alumbrado-data.json'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(APP_URLS).catch(() => {}))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;

  // No cachear APIs externas
  if (url.includes('nominatim') ||
      url.includes('tile.openstreetmap') ||
      url.includes('googleapis') ||
      url.includes('script.google')) return;

  // alumbrado-data.json: cache-first (escrito por la app tras parsear el CSV)
  if (url.includes('alumbrado-data.json')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(resp => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return resp;
        }).catch(() => new Response('[]', {status:200,headers:{'Content-Type':'application/json'}}));
      })
    );
    return;
  }

  // Google Sheets CSV: network-first, caché como respaldo offline
  if (url.includes('docs.google.com/spreadsheets')) {
    e.respondWith(
      fetch(e.request)
        .then(resp => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return resp;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first para todo lo demás (app shell, CDN)
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        if (resp.ok && (resp.type === 'basic' || resp.type === 'cors')) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return resp;
      });
    })
  );
});
