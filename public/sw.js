const CACHE_NAME = 'achat-revente-cache-v1';
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // put a copy in cache for future
        caches.open(CACHE_NAME).then(cache => {
          try { cache.put(event.request, response.clone()); } catch (e) { /* ignore opaque */ }
        });
        return response;
      }).catch(() => caches.match('/index.html'));
    })
  );
});