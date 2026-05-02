/* ═══════════════════════════════════════
   sw.js — Service Worker v3.0
   ✅ 3 استراتيجيات تخزين واضحة
   ✅ يعمل بدون إنترنت كاملاً
   ✅ بدون الملفات الخمسة المحذوفة
═══════════════════════════════════════ */
'use strict';

const CACHE_APP    = 'hltrade-app-v302';   /* JS/CSS/HTML */
const CACHE_IMGS   = 'hltrade-img-v302';   /* صور */
const CACHE_FONTS  = 'hltrade-fnt-v302';   /* خطوط */

/* ══ الملفات الأساسية — تُحمَّل عند التثبيت ══ */
const APP_SHELL = [
  '/',
  '/index.html',
  '/hl.css',
  '/manifest.json',
  /* JS core */
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
  '/js/app.js',
  '/js/button.js',
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
  /* أيقونات */
  '/icon-192x192.png',
  '/icon-512x512.png'
];

/* ══ تثبيت — pre-cache كل الـ App Shell ══ */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_APP)
      .then(c => Promise.allSettled(APP_SHELL.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

/* ══ تنشيط — حذف كل كاش قديم ══ */
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

/* ══ جلب الموارد ══ */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  /* 1. API Hyperliquid — Network First, fallback Cache
        الأسعار يجب أن تكون حية، لكن إذا offline نُظهر آخر قيمة */
  if (url.hostname === 'api.hyperliquid.xyz' || url.hostname === 'arb1.arbitrum.io') {
    e.respondWith(networkFirst(e.request, CACHE_APP));
    return;
  }

  /* 2. خطوط Google — Cache First (لا تتغير أبداً) */
  if (url.hostname.includes('fonts.g') || url.hostname.includes('fonts.googleapis')) {
    e.respondWith(cacheFirst(e.request, CACHE_FONTS));
    return;
  }

  /* 3. CDN مكتبات (ethers, lightweight-charts) — Cache First */
  if (url.hostname === 'cdnjs.cloudflare.com' || url.hostname === 'unpkg.com') {
    e.respondWith(cacheFirst(e.request, CACHE_FONTS));
    return;
  }

  /* 4. صور — Cache First */
  if (/\.(png|jpg|jpeg|gif|svg|webp|ico)(\?.*)?$/.test(url.pathname)) {
    e.respondWith(cacheFirst(e.request, CACHE_IMGS));
    return;
  }

  /* 5. App Shell (JS/CSS/HTML) — Cache First + Background Update */
  e.respondWith(staleWhileRevalidate(e.request, CACHE_APP));
});

/* ══════════════════════════════
   استراتيجيات التخزين
══════════════════════════════ */

/* Network First: جرب الشبكة أولاً، fallback للكاش */
async function networkFirst(req, cacheName) {
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      const c = await caches.open(cacheName);
      c.put(req, res.clone()).catch(() => {});
    }
    return res;
  } catch {
    const cached = await caches.match(req);
    return cached || new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/* Cache First: الكاش أولاً، الشبكة احتياطياً */
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

/* Stale While Revalidate: أعطِ الكاش فوراً + جدّد في الخلفية */
async function staleWhileRevalidate(req, cacheName) {
  const cached = await caches.match(req);

  /* تحديث في الخلفية دائماً */
  const fetchPromise = fetch(req).then(res => {
    if (res && res.ok) {
      caches.open(cacheName).then(c => c.put(req, res.clone())).catch(() => {});
    }
    return res;
  }).catch(() => null);

  /* إذا موجود في الكاش → أعطه فوراً */
  if (cached) return cached;

  /* إذا غير موجود → انتظر الشبكة */
  const res = await fetchPromise;
  return res || caches.match('/index.html') || new Response('Offline', { status: 503 });
}
