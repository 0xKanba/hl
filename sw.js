/* ═══════════════════════════════════════
   sw.js — Service Worker v2.1 (محسّن)
   استراتيجية تخزين متقدمة
════════════════════════════════════════ */

const CACHE_NAME = 'hltrade-v204';
const API_CACHE = 'hltrade-api-v1';
const IMAGE_CACHE = 'hltrade-images-v1';

const ASSETS = [
  '/',
  '/index.html',
  '/hl.css',
  '/manifest.json',
  '/js/config.js',
  '/js/state.js',
  '/js/utils.js',
  '/js/api.js',
  '/js/ws.js',
  '/js/prices.js',
  '/js/session.js',
  '/js/positions.js',
  '/js/account.js',
  '/js/trading.js',
  '/js/tpsl.js',
  '/js/assets.js',
  '/js/pin.js',
  '/js/auth.js',
  '/js/chart.js',
  '/js/c.js',
  '/js/button.js',
  // ملفات جديدة
  '/js/gpu-accelerate.js',
  '/js/data-cache.js',
  '/js/progressive-api.js',
  '/js/price-worker.js',
  '/js/performance-monitor.js'
];

// التثبيت
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => Promise.allSettled(ASSETS.map(u => c.add(u))))
  );
  self.skipWaiting();
});

// التنشيط
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks =>
      Promise.all(
        ks.filter(k => k !== CACHE_NAME && k !== API_CACHE && k !== IMAGE_CACHE)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// جلب الموارد
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // ✅ API calls: Network First, then Cache
  if (url.hostname === 'api.hyperliquid.xyz' || url.hostname === 'arb1.arbitrum.io') {
    return e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res && res.status === 200) {
            caches.open(API_CACHE).then(c => c.put(e.request, res.clone()));
          }
          return res;
        })
        .catch(() => caches.match(e.request) || new Response('Offline', { status: 503 }))
    );
  }

  // ✅ صور: Cache First
  if (/\.(jpg|jpeg|png|gif|svg|webp)$/.test(url.pathname)) {
    return e.respondWith(
      caches.match(e.request)
        .then(cached => cached || fetch(e.request)
          .then(res => {
            if (res && res.status === 200) {
              caches.open(IMAGE_CACHE).then(c => c.put(e.request, res.clone()));
            }
            return res;
          })
        )
        .catch(() => new Response('Image not found', { status: 404 }))
    );
  }

  // ✅ Assets: Cache with Background Update
  e.respondWith(
    caches.match(e.request)
      .then(cached => {
        const fetchPromise = fetch(e.request)
          .then(res => {
            if (res && res.status === 200) {
              caches.open(CACHE_NAME).then(c => c.put(e.request, res.clone()));
            }
            return res;
          });

        return cached || fetchPromise;
      })
      .catch(() => caches.match('/index.html'))
  );
});
