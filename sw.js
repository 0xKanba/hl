'use strict';

/* Version strings below are rewritten automatically on every push by
   .github/workflows/sw.yml — never edit by hand. A stale value here only
   means "the cache tag didn't change"; it never blocks a real deploy,
   because the app shell below is network-first.
   سيولتي (Siyulati) — prefix siyulati-* ; old hltrade-* caches are
   deleted automatically on activate (not in CURRENT). */

const CACHE_APP   = 'siyulati-app-202610210927-c3fa954';
const CACHE_IMGS  = 'siyulati-img-202610210927-c3fa954';
const CACHE_FONTS = 'siyulati-fnt-202610210927-c3fa954';

const APP_SHELL = [
  '/',
  '/index.html',
  '/css/base.css',
  '/css/themes.css',
  '/css/components.css',
  '/css/order.css',
  '/css/orders.css',
  '/css/agentlink.css',
  '/manifest.json',
  '/js/config.js',
  '/js/state.js',
  '/js/wallets.js',
  '/js/agentlink.js',
  '/js/utils.js',
  '/js/api.js',
  '/js/ws.js',
  '/js/prices.js',
  '/js/session.js',
  '/js/positions.js',
  '/js/account.js',
  '/js/trading.js',
  '/js/tpsl.js',
  '/js/order/state.js',
  '/js/order/book.js',
  '/js/order/logic.js',
  '/js/order/ui.js',
  '/js/order/index.js',
  '/js/order/bar.js',
  '/js/assets.js',
  '/js/pin.js',
  '/js/auth.js',
  '/js/agents.js',
  '/js/chart/state.js',
  '/js/chart/datafeed.js',
  '/js/chart/ui.js',
  '/js/chart/trading.js',
  '/js/chart/index.js',
  '/js/c.js',
  '/js/app.js',
  '/js/lastplace.js',
  '/js/orders.js',
  '/images/oil.svg',
  '/images/gold.svg',
  '/images/silver.svg',
  '/images/100.png',
  '/favicon.ico',
  '/icons/icon-180x180.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

/* Note: js/privy-bridge.js (~1.4MB gzip, email-login only) is
   deliberately NOT in APP_SHELL — it's lazy-loaded by auth.js only
   when a user picks email login. The generic same-origin handler below
   still caches it after first real use. */

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_APP)
      .then(c => Promise.allSettled(APP_SHELL.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  const CURRENT = [CACHE_APP, CACHE_IMGS, CACHE_FONTS];
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !CURRENT.includes(k)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  /* Live trading data — never serve stale; cache is a last-resort fallback only */
  if (url.hostname === 'api.hyperliquid.xyz' || url.hostname === 'arb1.arbitrum.io') {
    e.respondWith(networkFirst(e.request, CACHE_APP, 8000));
    return;
  }
  /* Fonts / CDN libs — effectively immutable, cache aggressively */
  if (url.hostname.includes('fonts.g') || url.hostname.includes('fonts.googleapis') ||
      url.hostname === 'cdnjs.cloudflare.com' || url.hostname === 'unpkg.com') {
    e.respondWith(cacheFirst(e.request, CACHE_FONTS));
    return;
  }
  /* Images/icons — rarely change, cache aggressively */
  if (/\.(png|jpg|jpeg|gif|svg|webp|ico)(\?.*)?$/.test(url.pathname)) {
    e.respondWith(cacheFirst(e.request, CACHE_IMGS));
    return;
  }
  /* Everything same-origin (navigations + html/css/js/json app shell) —
     network-first with a fast timeout so deploys show up immediately. */
  e.respondWith(networkFirstWithTimeout(e.request, CACHE_APP, 3000));
});

async function networkFirst(req, cacheName, timeoutMs) {
  try {
    const res = await withTimeout(fetch(req), timeoutMs);
    if (res && res.ok) {
      const c = await caches.open(cacheName);
      c.put(req, res.clone()).catch(() => {});
    }
    return res;
  } catch {
    const cached = await caches.match(req);
    return cached || new Response(JSON.stringify({ error: 'offline' }), {
      status: 503, headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function networkFirstWithTimeout(req, cacheName, timeoutMs) {
  const cache = await caches.open(cacheName);
  const netPromise = fetch(req).then(res => {
    if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  }).catch(() => null);

  const early = await Promise.race([
    netPromise,
    new Promise(resolve => setTimeout(() => resolve(null), timeoutMs))
  ]);
  if (early) return early;

  const cached = await cache.match(req);
  if (cached) return cached;

  const late = await netPromise;
  if (late) return late;

  return req.mode === 'navigate'
    ? (await cache.match('/index.html')) || new Response('Offline', { status: 503 })
    : new Response('Offline', { status: 503 });
}

async function cacheFirst(req, cacheName) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      const c = await caches.open(cacheName);
      c.put(req, res.clone()).catch(() => {});
    }
    return res;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
  ]);
}
