const cacheName = 'keiba-life-v6-registration-preview';
const core = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/hero.webp', '/horse-0.webp', '/horse-1.webp', '/horse-2.webp', '/racehorse.webp', '/grandstand.webp', '/gacha-stable.webp', '/race-woodland.webp', '/trainer.webp'];
self.addEventListener('install', event => {
 event.waitUntil((async () => {
  const cache = await caches.open(cacheName);
  const home = await fetch('/');
  if (!home.ok) throw new Error('Home unavailable');
  const html = await home.clone().text();
  await cache.put('/', home);
  const assets = [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+\.(?:js|css))"/g)].map(match => match[1]);
  await cache.addAll([...new Set([...core.slice(1), ...assets])]);
  await self.skipWaiting();
 })());
});
self.addEventListener('activate', event => {
 event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(key => key.startsWith('keiba-life-') && key !== cacheName).map(key => caches.delete(key)));
  await self.clients.claim();
 })());
});
self.addEventListener('fetch', event => {
 const url = new URL(event.request.url);
 if (url.pathname.startsWith('/video/') || url.origin !== location.origin || event.request.method !== 'GET') return;
 if (event.request.mode === 'navigate') {
  event.respondWith(fetch(event.request).catch(() => caches.match('/')));
 } else if (url.pathname.startsWith('/horses/')) {
  event.respondWith((async () => {
   const cache = await caches.open(cacheName);
   const hit = await cache.match(event.request);
   if (hit) return hit;
   const response = await fetch(event.request);
   if (response.ok) await cache.put(event.request, response.clone()).catch(() => {});
   return response;
  })());
 } else if (url.pathname.startsWith('/_next/static/') || core.includes(url.pathname)) {
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
 }
});
