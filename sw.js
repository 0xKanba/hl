/* ═══════════════════════════════════════
   sw.js — Service Worker v2.0
   المسارات: جذر / بدل /hl/
═══════════════════════════════════════ */
const CACHE_NAME = 'hltrade-v201';

const ASSETS = [
  '/',
  '/index.html',
  '/hl.css',
  '/manifest.json',
  /* JS modules */
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
  '/js/app.js',
  '/js/chart.js',
  '/js/c.js',
  /* صور */
  '/images/oil.svg',
  '/images/gold.svg',
  '/images/silver.svg',
  '/images/100.png',
  '/images/balance.png',
  '/images/history.png',
  '/images/diposit.png',
  '/images/withdraw.png',
  '/images/calendar.png',
  '/images/btc21.png',
  '/icon-192.png',
  '/icon-512.png',
  /* CDN */
  'https://cdnjs.cloudflare.com/ajax/libs/ethers/6.13.0/ethers.umd.min.js',
  'https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js'
];

/* تثبيت — تحميل الأصول */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => Promise.allSettled(ASSETS.map(u => c.add(u))))
  );
  self.skipWaiting();
});

/* تنشيط — حذف الكاش القديم */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks =>
      Promise.all(ks.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* جلب — Cache First مع استثناء API */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  /* استثناء: API calls تذهب مباشرة للشبكة */
  if (u.hostname === 'api.hyperliquid.xyz' || u.hostname === 'arb1.arbitrum.io') return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type !== 'opaque')
          caches.open(CACHE_NAME).then(c => c.put(e.request, res.clone()));
        return res;
      }).catch(() => cached);
    })
  );
});
