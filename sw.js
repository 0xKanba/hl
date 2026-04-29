const CACHE_NAME = 'hltrade-v99';
const ASSETS = [
  '/','/index.html','/hl/hl.css','/hl/hl.js','/hl/chart.js','/hl/manifest.json',
  '/hl/images/oil.svg','/hl/images/gold.svg','/hl/images/silver.svg','/hl/images/100.png',
  '/hl/images/balance.png','/hl/images/history.png','/hl/images/diposit.png',
  '/hl/images/withdraw.png','/hl/images/calendar.png',
  'https://cdnjs.cloudflare.com/ajax/libs/ethers/6.13.0/ethers.umd.min.js',
  'https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c=>Promise.allSettled(ASSETS.map(u=>c.add(u)))));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if(e.request.method!=='GET') return;
  const u=new URL(e.request.url);
  if(u.hostname==='api.hyperliquid.xyz'||u.hostname==='arb1.arbitrum.io') return;
  e.respondWith(caches.match(e.request).then(cached=>{
    if(cached) return cached;
    return fetch(e.request).then(res=>{
      if(res&&res.status===200&&res.type!=='opaque')
        caches.open(CACHE_NAME).then(c=>c.put(e.request,res.clone()));
      return res;
    }).catch(()=>cached);
  }));
});
