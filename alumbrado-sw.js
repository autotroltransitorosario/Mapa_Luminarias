// AUTOTROL · Equipamiento Alumbrado — Service Worker v4
const VERSION    = 'autotrol-alumbrado-shell-v4';   // app shell (se renueva en cada versión)
const DATA_CACHE = 'autotrol-alumbrado-data-v1';    // JSON de datos: PERSISTENTE, no se borra al activar
const SHELL_URLS = [
  './', './index.html',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  // Tolerante: si una URL falla, las demás igual se cachean
  e.waitUntil(
    caches.open(VERSION).then(c =>
      Promise.allSettled(SHELL_URLS.map(u => c.add(u)))
    )
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== VERSION && k !== DATA_CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;

  // No cachear APIs/tiles externos
  if (url.includes('nominatim') ||
      url.includes('tile.openstreetmap') ||
      url.includes('googleapis') ||
      url.includes('script.google')) return;

  // alumbrado-data.json: lo escribe la app (Cache API) tras parsear el CSV
  if (url.includes('alumbrado-data.json')) {
    e.respondWith(
      caches.open(DATA_CACHE).then(c => c.match(e.request.url.split('?')[0])).then(cached =>
        cached || new Response('[]', {status:200, headers:{'Content-Type':'application/json'}})
      )
    );
    return;
  }

  // Google Sheets CSV: red primero, respaldo en caché de datos
  if (url.includes('docs.google.com/spreadsheets')) {
    e.respondWith(
      fetch(e.request)
        .then(resp => {
          if (resp.ok) { const cl = resp.clone(); caches.open(DATA_CACHE).then(c => c.put(e.request, cl)); }
          return resp;
        })
        .catch(() => caches.match(e.request).then(r => r || Response.error()))
    );
    return;
  }

  // Navegación: red primero con respaldo al shell (permite actualizar y funcionar offline)
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(resp => {
          if (resp.ok) { const cl = resp.clone(); caches.open(VERSION).then(c => c.put('./index.html', cl)); }
          return resp;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // Resto (CDN, assets): caché primero
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(resp => {
      if (resp.ok && (resp.type === 'basic' || resp.type === 'cors')) {
        const cl = resp.clone(); caches.open(VERSION).then(c => c.put(e.request, cl));
      }
      return resp;
    }))
  );
});
