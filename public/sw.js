const CACHE_NAME = 'swarasaathi-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/src/main.tsx',
  '/src/App.tsx',
  '/src/index.css'
];

// Install Service Worker and cache essential static assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Allow caching to succeed even if some development assets are missing or generated on the fly
      return cache.addAll(ASSETS).catch(err => console.warn("Caching warning during install development:", err));
    }).then(() => self.skipWaiting())
  );
});

// Clean up stale or outdated caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Intercept requests and serve from cache with a network fallback strategy
self.addEventListener('fetch', (e) => {
  // Only handle GET requests, and completely exclude dynamic server-side API routes
  if (e.request.method !== 'GET' || e.request.url.includes('/api/')) {
    return;
  }
  
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(e.request).then((networkResponse) => {
        // Cache valid, basic network responses
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        // Offline recovery page or home shell return
        if (e.request.mode === 'navigate') {
          return caches.match('/');
        }
        return null;
      });
    })
  );
});
