/* Bolso: sw.js
   Deixa o app abrir sem internet. Arquivos do próprio app: tenta a rede primeiro e guarda cópia.
   Biblioteca do Supabase: usa a cópia guardada. As chamadas ao banco nunca são guardadas. */
const VERSION = 'bolso-v1';
const SHELL = [
  './', './index.html', './styles.css', './config.js', './manifest.webmanifest',
  './js/domain.js', './js/charts.js', './js/store.js', './js/app-core.js', './js/views.js', './js/sheets.js', './js/boot.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
  }
  // qualquer outro endereço (Supabase, por exemplo) passa direto, sem cópia
});
