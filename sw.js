/* Service worker: deja usar la app sin internet (reloj, coach y tu historial local).
   Estrategia: red primero (siempre la versión más nueva) y, si no hay red, lo guardado.
   Si cambiás archivos y querés forzar la actualización, subí el número de CACHE. */
const CACHE = 'coach-boxeo-v3';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/styles.css',
  'js/config.js', 'js/storage.js', 'js/firebase-config.js', 'js/combos.js', 'js/stats.js', 'js/audio.js',
  'js/voice.js', 'js/timer.js', 'js/coach.js', 'js/ranking.js', 'js/ui.js', 'js/main.js',
  'Sonidos/campana.mp3', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('index.html')))
  );
});
