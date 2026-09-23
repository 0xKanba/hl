'use strict';

/* Version strings below are rewritten automatically on every push by
   .github/workflows/sw.yml — never edit by hand, never needs to be
   remembered. A stale value here only ever means "the cache tag didn't
   change"; it never blocks a real deploy, because the app shell below
   is network-first, not stale-while-revalidate.
   ✅ رُفعت يدوياً هذه المرة (إعادة هيكلة صفحة واحدة: css/order.css
   وjs/order/bar.js جديدان، وindex.html صار مُحمِّلاً فقط) — الـAction سيرفعها
   تلقائياً مجدداً بأول push فعلي، هذا فقط ضمان لأول تحميل مباشر بعد
   نسخ هذي الملفات. */

const CACHE_APP   = 'hltrade-app-202609221542-f40761a';
const CACHE_IMGS  = 'hltrade-img-202609221542-f4076e1';
const CACHE_FONTS = 'hltrade-fnt-202609221542-f4076e1';

const APP_SHELL = [
  '/',
  '/index.html',
  '/css/base.css',
  '/css/themes.css',
  '/css/components.css',
  '/css/order.css',
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
  '/images/oil.svg',
  '/images/gold.svg',
  '/images/silver.svg',
  '/images/100.png',
  '/images/btc21.png',
  '/images/icon-192x192.png',
  '/images/icon-512x512.png'
];

/* Note: js/privy-bridge.js (~1.4MB gzip, email-login only) is
   deliberately NOT in APP_SHELL — it's lazy-loaded by auth.js only
   when a user picks email login, so guests and external-wallet users
   never pay for it. The generic same-origin handler below still
   caches it after first real use, so offline works fine after that. */

/* App-shell file types — always network-first so a fresh deploy is
   visible on the very next load while online. Cache is the offline
   fallback, never the first stop. */
const SHELL_EXT = /\.(html|css|js|json)$/;

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
  /* Images — rarely change, cache aggressively */
  if (/\.(png|jpg|jpeg|gif|svg|webp|ico)(\?.*)?$/.test(url.pathname)) {
    e.respondWith(cacheFirst(e.request, CACHE_IMGS));
    return;
  }
  /* Everything same-origin (navigations + the html/css/js/json app shell,
     including js/privy-bridge.js the one time it's actually fetched)
     — network-first with a fast timeout. Online, you always get the
     live file; offline or slow, you fall back to whatever was last
     cached. This is what makes deploys show up immediately instead of
     needing a second reload. */
  e.respondWith(networkFirstWithTimeout(e.request, CACHE_APP, 3000));
});

/* ── Straight network-first (with a generous timeout) — used for
   trading API calls, where a slow-but-real response beats a stale
   cached one every time. ── */
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

/* ── Network-first, raced against a short timeout, for the app shell.
   Falls back fast on slow connections, but the network response still
   lands in cache in the background for next time even if we already
   answered from cache. ── */
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
