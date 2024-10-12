const CACHE_NAME = 'audio-mixer-cache-v2';
const urlsToCache = [
  './',
  './index.html',
  './audio/wasser.mp3',
  './audio/orchester.mp3',
  './images/icon-192x192.png',
  './images/icon-512x512.png',
  './manifest.json',
  './style.css'
];

// Install the service worker and cache the necessary resources
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Serve cached content when offline
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});

// Update cache and remove old cache versions
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});