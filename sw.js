/**
 * Binality v2 Service Worker (100% Offline PWA)
 * Complete offline caching for app shell, audio synthesis engines, XML programs, and self-hosted fonts.
 */

var CACHE_VERSION = 'binality-v2.1.2';
var CACHE_NAME = 'binality-core-' + CACHE_VERSION;

var PRECACHE_URLS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'favicon.ico',
  'apple-touch-icon-precomposed.png',
  'privacypolicy.html',
  '404.html',
  'css/index.css',
  'js/index.js',
  'fonts/outfit-latin.woff2',
  'fonts/plus-jakarta-sans-latin.woff2',
  'fonts/jetbrains-mono-latin.woff2',
  'images/favicon.png',
  'images/icon.png',
  'images/binality-icon-192.png',
  'images/binality-icon-512.png',
  'images/binality-icon-1024.png',
  'programs/astralprojection.xml',
  'programs/concentration.xml',
  'programs/luciddreaming.xml',
  'programs/meditation.xml',
  'programs/oobe.xml',
  'programs/painrelief.xml',
  'programs/relaxation.xml',
  'programs/schumann.xml',
  'programs/shamanicconsciousness.xml',
  'programs/sleep.xml',
  'programs/universalhealing.xml'
];

// Install: Pre-cache all core static assets
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return Promise.all(
        PRECACHE_URLS.map(function (url) {
          return fetch(url, { cache: 'no-cache' })
            .then(function (response) {
              if (response && response.ok) {
                return cache.put(url, response);
              }
            })
            .catch(function (err) {
              console.warn('[SW] Could not pre-cache:', url, err);
            });
        })
      );
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

// Activate: Clean up old caches and claim clients immediately
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          if (key !== CACHE_NAME) {
            console.log('[SW] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// Fetch: Smart caching strategies for navigation and assets
self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url = new URL(request.url);

  // 1. Navigation requests (HTML pages)
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match(request).then(function (cached) {
        if (cached) return cached;
        return caches.match('./').then(function (rootCached) {
          if (rootCached) return rootCached;
          return caches.match('index.html').then(function (indexCached) {
            if (indexCached) return indexCached;
            return fetch(request)
              .then(function (networkResponse) {
                if (networkResponse && networkResponse.status === 200) {
                  var clone = networkResponse.clone();
                  caches.open(CACHE_NAME).then(function (cache) {
                    cache.put(request, clone);
                  });
                }
                return networkResponse;
              })
              .catch(function () {
                return caches.match('index.html').then(function (fallback) {
                  return fallback || caches.match('./');
                });
              });
          });
        });
      })
    );
    return;
  }

  // 2. Same-origin assets (CSS, JS, XML, Images)
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(function (cachedResponse) {
        if (cachedResponse) {
          // Stale-while-revalidate for JS/CSS/XML so updates are caught in background
          fetch(request)
            .then(function (networkResponse) {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(CACHE_NAME).then(function (cache) {
                  cache.put(request, networkResponse);
                });
              }
            })
            .catch(function () {
              // Ignore background fetch error when offline
            });
          return cachedResponse;
        }

        return fetch(request)
          .then(function (networkResponse) {
            if (networkResponse && networkResponse.status === 200) {
              var clone = networkResponse.clone();
              caches.open(CACHE_NAME).then(function (cache) {
                cache.put(request, clone);
              });
            }
            return networkResponse;
          })
          .catch(function () {
            return new Response('', { status: 408, statusText: 'Request timed out or offline' });
          });
      })
    );
    return;
  }

  // Default: Network with Cache fallback
  event.respondWith(
    caches.match(request).then(function (cached) {
      return (
        cached ||
        fetch(request).catch(function () {
          return new Response('', { status: 503, statusText: 'Service Unavailable' });
        })
      );
    })
  );
});

// Message listener for skipWaiting or cache refresh
self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
