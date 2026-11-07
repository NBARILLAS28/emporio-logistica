/* Service worker de EMPORIO Logística — permite instalar la app y abrirla sin conexión.
   Nunca guarda respuestas de Supabase (datos privados): esas siempre van a la red. */
const VERSION = '0379cdcc11';
const CACHE = 'emporio-logistica-' + VERSION;
const SHELL = ['./', 'index.html', 'app.js', 'style.css', 'config.js', 'manifest.webmanifest',
  'vendor/chart.js', 'vendor/jspdf.js', 'vendor/autotable.js', 'vendor/xlsx.js', 'vendor/supabase.js',
  'icons/logo-app.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('emporio-logistica-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;       // Supabase y otros dominios: directo a la red
  e.respondWith(
    fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
