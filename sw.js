/* FC26 FUT Objectives Tracker — Service Worker (cache-first, offline ready) */
const CACHE_NAME = 'fc26-v1';
const ASSETS = [
  './index.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;900&display=swap'
];

/* ── Install: pre-cache core assets ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })))
        .catch(() => cache.addAll(['./index.html', './manifest.json']));
    }).then(() => self.skipWaiting())
  );
});

/* ── Activate: clear old caches ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── Fetch: cache-first strategy ── */
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  /* For Google Fonts and external resources — network first, fallback to cache */
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        fetch(event.request).then(response => {
          cache.put(event.request, response.clone());
          return response;
        }).catch(() => cache.match(event.request))
      )
    );
    return;
  }

  /* For same-origin assets — cache-first */
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => {
          /* If it's a navigation request and we have index.html cached, serve it */
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
    );
    return;
  }

  /* All other requests — network with cache fallback */
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

/* ── Background sync message handler ── */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CACHE_URLS') {
    caches.open(CACHE_NAME).then(cache => cache.addAll(event.data.urls));
  }
});
