/* ═══════════════════════════════════════════════════════════════
   chart.js — TradingView Advanced Charts · سيولة v8
   ─────────────────────────────────────────────────────────────
   ROOT CAUSES FIXED:
   #1  1970 + 2 bars  → getBars never returns ([], {noData:false})
                        Empty first fetch = noData:true so TV paginates back
                        Pagination loop fetches [from..to] correctly
   #2  XAU BBO tick   → tick price = display price (grams) not oz
   #3  Timezone       → forced Asia/Baghdad on init + onChartReady
   #4  Countdown      → countdown_timer in enabled_features
   #5  Cache poison   → purge _hlcv2_ + validate time > MIN_SEC
   #6  Fullscreen gap → fullscreenchange resize handler
   ─────────────────────────────────────────────────────────────
   DATAFEED CONTRACT (TradingView):
   • getBars first call:  pp.firstDataRequest=true, pp.from/to=0 → use RANGES
   • getBars paginate:    pp.firstDataRequest=false, pp.from/to in UNIX SECONDS
   • Empty bars + noData:false → TV thinks stream is live, stops paginating → BUG
   • Empty bars + noData:true  → TV paginates further back ✓
   • bars.length > 0 + noData:false → TV renders ✓
═══════════════════════════════════════════════════════════════ */
'use strict';

const ChartModule = (function () {

  /* ── Constants ── */
  const HL_API  = 'https://api.hyperliquid.xyz';
  const HL_WS   = 'wss://api.hyperliquid.xyz/ws';
  const TL      = 31.1035;
  const MIN_SEC = 1577836800;   // 2020-01-01 00:00:00 UTC
  const MIN_MS  = MIN_SEC * 1000;

  /* Look-back in ms for first getBars fetch */
  const RANGES = {
    '1m' :   6 * 3600e3,
    '3m' :  12 * 3600e3,
    '5m' :  24 * 3600e3,
    '15m':   5 * 86400e3,
    '30m':  10 * 86400e3,
    '1h' :  60 * 86400e3,
    '2h' :  90 * 86400e3,
    '4h' : 180 * 86400e3,
    '1d' : 365 * 86400e3,
  };

  /* TV resolution string ↔ HL interval string */
  const IV_TO_TV = {
    '1m':'1','3m':'3','5m':'5','15m':'15','30m':'30',
    '1h':'60','2h':'120','4h':'240','1d':'D',
  };
  const TV_TO_IV = {
    '1':'1m','3':'3m','5':'5m','15':'15m','30':'30m',
    '60':'1h','120':'2h','240':'4h','D':'1d','1D':'1d',
  };

  /* Seconds per interval (for candle-open calculation) */
  const IV_DUR = {
    '1m':60,'3m':180,'5m':300,'15m':900,'30m':1800,
    '1h':3600,'2h':7200,'4h':14400,'1d':86400,
  };

  /* ── Module state ── */
  let _widget       = null;
  let _chartReady   = false;
  let _visible      = false;
  let _sym          = 'CL';
  let _interval     = '1h';
  let _lastClose    = 0;    // last known display-price (grams for XAU, raw otherwise)
  let _lastBarTime  = 0;    // UNIX seconds of last delivered bar
  let _subs         = {};
  let _chartWs      = null;
  let _wsTimer      = null;
  let _wsActiveCoin = null;
  let _wsActiveIv   = null;
  let _entryLines   = [];
  let _tpLine       = null;
  let _slLine       = null;
  let _liqLine      = null;
  let _ro           = null;
  let _layoutTmr    = null;
  let _readyTmr     = null;
  let _bboTimer     = null;
  let _gestInit     = false;

  /* ── Tiny helpers ── */
  const coinStr = s => (typeof ASSETS !== 'undefined' && ASSETS[s]?.coin) || `xyz:${s}`;
  const assetOf = s => (typeof ASSETS !== 'undefined' && ASSETS[s]) ||
    { pxDp:2, szDp:2, name:s, icon:'📊', unit:'', lev:10, presets:[1], idx:0, cross:true };
  const isDark  = () => document.documentElement.getAttribute('data-theme') !== 'light';
  const $el     = id => document.getElementById(id);
  const toast_  = (m, t, d) => typeof toast === 'function' && toast(m, t, d);
  const isXAU   = () => _sym === 'XAU';

  /* Persistent preferences */
  const PREF = {
    get : k     => { try { return localStorage.getItem('_cp_' + k); } catch { return null; } },
    set : (k,v) => { try { localStorage.setItem('_cp_' + k, v); } catch {} },
  };

  /* ─────────────────────────────────────────────────────────────
     toSec — normalise any HL timestamp to UNIX seconds
     HL REST returns seconds (≈1.75e9). If it's > 1e12 it's ms.
  ───────────────────────────────────────────────────────────── */
  function toSec(t) {
    const n = Math.floor(+t || 0);
    return n > 1e12 ? Math.floor(n / 1000) : n;
  }

  /* Current candle open time (UNIX sec) for a given UNIX second */
  function candleOpenSec(nowSec, iv) {
    const dur = IV_DUR[iv] || 3600;
    return Math.floor(nowSec / dur) * dur;
  }

  /* ─────────────────────────────────────────────────────────────
     Price helpers — _lastClose is always in DISPLAY units
     (grams for XAU, raw for everything else)
  ───────────────────────────────────────────────────────────── */
  function setPrice(displayPrice) {
    if (!displayPrice || +displayPrice <= 0) return;
    _lastClose = +displayPrice;
    const el = $el('_cPrice');
    if (el) el.textContent = '$' + (+displayPrice).toFixed(assetOf(_sym).pxDp);
    _refreshBtnPx();
  }

  function _refreshBtnPx() {
    if (!_lastClose) return;
    const dp = assetOf(_sym).pxDp;
    const b = $el('_cBuyPx'), s = $el('_cSellPx');
    if (b) b.textContent = '$' + (_lastClose * 1.0005).toFixed(dp);
    if (s) s.textContent = '$' + (_lastClose * 0.9995).toFixed(dp);
  }

  /* ════════════════════════════════════════════════════════════
     CSS — one-time injection
  ════════════════════════════════════════════════════════════ */
  (function injectCSS() {
    if ($el('_chartCSS')) return;
    const s = document.createElement('style');
    s.id = '_chartCSS';
    s.textContent = `
.chart-screen{
  position:fixed;inset:0;z-index:50;display:flex;flex-direction:column;
  background:var(--bg-app,#000);overflow:hidden;
}
.chart-screen.hidden{display:none!important;}
:fullscreen .chart-screen,:-webkit-full-screen .chart-screen{
  position:fixed;inset:0;width:100vw;height:100dvh;
}
:fullscreen #_cTvWrap,:-webkit-full-screen #_cTvWrap{
  height:100%!important;flex:1!important;
}
.c-nav{
  display:flex;align-items:center;justify-content:space-between;
  padding:0 10px;height:48px;min-height:48px;flex-shrink:0;
  background:var(--bg-card,#0d0d0d);
  border-bottom:1px solid var(--border,#1f1f1f);
  gap:8px;direction:rtl;
}
.c-back{
  display:flex;align-items:center;gap:4px;padding:5px 11px;
  border-radius:999px;border:1.5px solid rgba(255,140,66,.22);
  background:rgba(255,140,66,.07);color:var(--hc-ac,#ff8c42);
  font-size:12px;font-weight:800;font-family:'Cairo',sans-serif;
  white-space:nowrap;cursor:pointer;transition:background .15s;
}
.c-back:hover{background:rgba(255,140,66,.14);}
.c-back:active{opacity:.7;}
.c-asset{display:flex;align-items:center;gap:6px;flex:1;min-width:0;overflow:hidden;}
.c-asset-icon{font-size:17px;line-height:1;flex-shrink:0;}
.c-asset-name{
  font-size:13px;font-weight:900;color:var(--text-primary,#f5f5f5);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
.c-asset-price{
  font-family:'IBM Plex Mono',monospace;font-size:13px;font-weight:800;
  color:var(--hc-ac,#ff8c42);white-space:nowrap;flex-shrink:0;
}
.c-controls{display:flex;align-items:center;gap:4px;flex-shrink:0;}
.c-ctrl{
  width:32px;height:32px;display:flex;align-items:center;justify-content:center;
  background:var(--bg-elev,#161616);border:1px solid var(--border,#1f1f1f);
  border-radius:8px;font-size:14px;color:var(--text-secondary,#a0a0a0);
  cursor:pointer;transition:border-color .15s,color .15s;
}
.c-ctrl:hover{border-color:var(--hc-ac,#ff8c42);color:var(--hc-ac,#ff8c42);}
.c-ctrl:active{transform:scale(.86);}
.c-trade-bar{
  display:flex;align-items:center;gap:8px;padding:5px 10px;
  height:50px;min-height:50px;flex-shrink:0;
  background:var(--bg-card,#0d0d0d);
  border-bottom:1px solid var(--border,#1f1f1f);direction:rtl;
}
.cbt{
  flex:1;height:38px;border-radius:10px;border:none;
  font-family:'Cairo',sans-serif;font-weight:900;cursor:pointer;color:#fff;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:1px;transition:filter .12s,transform .1s;
}
.cbt:active{transform:scale(.93);filter:brightness(.85);}
.cbt.buy{background:linear-gradient(150deg,#26a69a,#00796b);box-shadow:0 2px 12px rgba(38,166,154,.32);}
.cbt.sell{background:linear-gradient(150deg,#ef5350,#c62828);box-shadow:0 2px 12px rgba(239,83,80,.32);}
.cbt-lbl{font-size:12px;font-weight:900;line-height:1;}
.cbt-px{font-family:'IBM Plex Mono',monospace;font-size:9px;opacity:.75;line-height:1;}
.cbt-mid{display:flex;flex-direction:column;align-items:center;gap:2px;flex:1.2;min-width:0;}
.cbt-lbl-sm{font-size:8px;color:var(--text-muted,#555);font-weight:700;letter-spacing:.5px;}
.cbt-row{display:flex;align-items:center;gap:4px;}
.cbt-in{
  width:70px;font-family:'IBM Plex Mono',monospace;font-size:max(15px,1em);
  font-weight:800;text-align:center;direction:ltr;
  background:var(--bg-input,#1a1a1a);border:1.5px solid var(--border-strong,#333);
  border-radius:8px;padding:4px 3px;color:var(--text-primary,#f5f5f5);outline:none;
}
.cbt-in:focus{border-color:var(--hc-ac,#ff8c42);}
.cbt-unit{font-size:9px;color:var(--text-secondary,#a0a0a0);font-weight:800;white-space:nowrap;}
#_cWrap{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;}
.c-tv-wrap{
  flex:1;min-height:0;position:relative;overflow:hidden;
  background:#131722;direction:ltr;
}
#_tvC{position:absolute;inset:0;direction:ltr;width:100%!important;height:100%!important;}
#_tvC iframe{border:none!important;display:block;width:100%!important;height:100%!important;}
.c-wd{
  position:absolute;inset:0;z-index:80;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:14px;padding:24px;background:var(--bg-app,#131722);
  text-align:center;direction:rtl;font-family:'Cairo',sans-serif;
}
.c-wd-ico{font-size:40px;}
.c-wd-title{font-size:15px;font-weight:900;color:var(--text-primary,#f5f5f5);}
.c-wd-msg{font-size:12px;color:var(--text-secondary,#a0a0a0);line-height:1.8;max-width:280px;}
.c-wd-msg code{
  font-family:'IBM Plex Mono',monospace;font-size:10px;
  background:var(--bg-elev,#1a1a1a);padding:2px 5px;border-radius:4px;
  direction:ltr;display:inline-block;
}
.c-wd-btn{
  padding:9px 26px;border-radius:999px;border:none;
  background:linear-gradient(135deg,#ff8c42,#a8502f);
  color:#fff;font-size:13px;font-weight:900;
  font-family:'Cairo',sans-serif;cursor:pointer;
}
.c-wd-btn:active{opacity:.8;}
.cf-ov{
  position:absolute;inset:0;z-index:95;
  display:flex;align-items:flex-end;justify-content:center;
  background:rgba(0,0,0,.75);
  backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);direction:rtl;
}
.cf-card{
  background:var(--bg-card,#0d0d0d);border-top:2px solid var(--border-strong,#333);
  border-radius:22px 22px 0 0;width:100%;max-width:480px;
  padding:14px 14px 28px;animation:cfUp .22s cubic-bezier(.4,0,.2,1);
}
@keyframes cfUp{from{transform:translateY(100%)}to{transform:none}}
.cf-hdl{width:32px;height:4px;background:var(--border-strong,#333);border-radius:999px;margin:0 auto 12px;}
.cf-title{font-size:16px;font-weight:900;margin-bottom:3px;}
.cf-sub{font-size:11px;color:var(--text-secondary,#a0a0a0);margin-bottom:10px;}
.cf-rows{background:var(--bg-input,#1a1a1a);border-radius:12px;padding:8px 10px;margin-bottom:12px;}
.cf-row{display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--border,#1f1f1f);}
.cf-row:last-child{border:none;}
.cf-k{font-size:11px;color:var(--text-secondary,#a0a0a0);font-weight:700;}
.cf-v{font-family:'IBM Plex Mono',monospace;font-size:13px;font-weight:800;color:var(--text-primary,#f5f5f5);}
.cf-v.g{color:#26a69a;}.cf-v.r{color:#ef5350;}.cf-v.w{color:var(--warn,#ffd600);}
.cf-btns{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.cf-can{padding:12px;border-radius:999px;border:1.5px solid var(--border-strong,#333);
  background:var(--bg-elev,#161616);color:var(--text-secondary,#a0a0a0);
  font-size:13px;font-weight:700;cursor:pointer;font-family:'Cairo',sans-serif;}
.cf-exec{padding:12px;border-radius:999px;border:none;color:#fff;font-size:13px;
  font-weight:900;cursor:pointer;font-family:'Cairo',sans-serif;
  display:flex;align-items:center;justify-content:center;gap:5px;}
.cf-exec.g{background:linear-gradient(135deg,#26a69a,#00695c);}
.cf-exec.r{background:linear-gradient(135deg,#ef5350,#b71c1c);}
.cf-exec:active{filter:brightness(.88);}
.cf-exec:disabled{opacity:.5;pointer-events:none;}
.cf-spin{width:14px;height:14px;border:2px solid rgba(255,255,255,.3);
  border-top-color:#fff;border-radius:50%;animation:cfSp .7s linear infinite;}
@keyframes cfSp{to{transform:rotate(360deg)}}
`;
    document.head.appendChild(s);
  })();

  /* ════════════════════════════════════════════════════════════
     Cache — v4 (strict validation, legacy purge)
  ════════════════════════════════════════════════════════════ */
  const CACHE = {
    TTL: {
      '1m':120e3,'3m':240e3,'5m':480e3,'15m':1500e3,'30m':3000e3,
      '1h':6000e3,'2h':6000e3,'4h':12000e3,'1d':36000e3,
    },
    key: (sym, iv) => `_hlcv4_${sym}_${iv}`,

    get(sym, iv) {
      try {
        const raw = localStorage.getItem(this.key(sym, iv));
        if (!raw) return null;
        const d = JSON.parse(raw);
        if (!d?.b?.length) return null;
        if (Date.now() - d.t > (this.TTL[iv] || 6000e3)) { this.del(sym, iv); return null; }
        const clean = d.b.filter(b => b.time > MIN_SEC && b.close > 0);
        if (clean.length < 2) { this.del(sym, iv); return null; }
        return clean;
      } catch { return null; }
    },

    set(sym, iv, bars) {
      try {
        const clean = bars.filter(b => b.time > MIN_SEC && b.close > 0).slice(-2000);
        if (clean.length < 2) return;
        localStorage.setItem(this.key(sym, iv), JSON.stringify({ b: clean, t: Date.now() }));
      } catch {}
    },

    del(sym, iv) {
      try { localStorage.removeItem(this.key(sym, iv)); } catch {}
    },

    purgeLegacy() {
      try {
        const kill = ['_hlcv2_', '_hlcv3_', '_hlcv_'];
        Object.keys(localStorage)
          .filter(k => kill.some(p => k.startsWith(p)))
          .forEach(k => localStorage.removeItem(k));
      } catch {}
    },
  };

  CACHE.purgeLegacy();

  /* ════════════════════════════════════════════════════════════
     REST candle fetcher
  ════════════════════════════════════════════════════════════ */
  async function fetchCandles(sym, iv, isGr, startMs, endMs) {
    const sMs = Math.max(Math.floor(startMs), MIN_MS);
    const eMs = Math.min(Math.ceil(endMs), Date.now() + 5000);
    if (sMs >= eMs) return [];

    let resp;
    try {
      resp = await fetch(HL_API + '/info', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          type: 'candleSnapshot',
          req : { coin: coinStr(sym), interval: iv, startTime: sMs, endTime: eMs }
        })
      });
    } catch { return []; }

    if (!resp.ok) return [];
    let raw;
    try { raw = await resp.json(); } catch { return []; }
    if (!Array.isArray(raw) || !raw.length) return [];

    const bars = raw
      .map(c => ({
        time  : toSec(c.t),
        open  : isGr ? +c.o / TL : +c.o,
        high  : isGr ? +c.h / TL : +c.h,
        low   : isGr ? +c.l / TL : +c.l,
        close : isGr ? +c.c / TL : +c.c,
        volume: +c.v || 0,
      }))
      .filter(b => b.time > MIN_SEC && b.close > 0)
      .sort((a, b) => a.time - b.time);

    return bars;
  }

  /* ════════════════════════════════════════════════════════════
     DATAFEED — production-grade TradingView interface

     KEY CONTRACT:
     • ok(bars, {noData:false})  → TV: got data, may request more
     • ok([],  {noData:true})    → TV: no more data going back
     • ok([],  {noData:false})   → TV: thinks stream alive, STOPS paginating = BUG

     So: empty bars on pagination → noData:true
         non-empty bars            → noData:false
         first request, no bars   → try a longer range, or noData:true
  ════════════════════════════════════════════════════════════ */
  const Datafeed = {

    onReady(cb) {
      setTimeout(() => cb({
        supported_resolutions: ['1','3','5','15','30','60','120','240','D'],
        exchanges: [{ value:'HL', name:'Hyperliquid', desc:'Hyperliquid Perps' }],
        symbols_types: [{ name:'crypto', value:'crypto' }],
        supports_marks: false,
        supports_timescale_marks: false,
      }), 0);
    },

    searchSymbols(q, ex, type, cb) {
      if (typeof ASSETS === 'undefined') { cb([]); return; }
      const ql = (q || '').toLowerCase();
      cb(Object.keys(ASSETS).map(s => ({
        symbol: s, full_name: s, ticker: s,
        description: ASSETS[s].name || s,
        exchange: 'Hyperliquid', type: 'crypto',
      })).filter(x =>
        x.symbol.toLowerCase().includes(ql) ||
        x.description.toLowerCase().includes(ql)
      ));
    },

    resolveSymbol(sym, onResolved, onError) {
      if (typeof ASSETS === 'undefined' || !ASSETS[sym]) {
        (onError || console.warn)('unknown: ' + sym); return;
      }
      const a = assetOf(sym);
      setTimeout(() => onResolved({
        name: sym, ticker: sym, description: a.name || sym,
        type: 'crypto', session: '24x7',
        exchange: 'Hyperliquid', listed_exchange: 'Hyperliquid',
        timezone: 'Asia/Baghdad',
        format: 'price',
        pricescale: Math.pow(10, a.pxDp || 2), minmov: 1,
        has_intraday: true, has_daily: true,
        has_weekly_and_monthly: false,
        intraday_multipliers: ['1','3','5','15','30','60','120','240'],
        supported_resolutions: ['1','3','5','15','30','60','120','240','D'],
        volume_precision: 4,
        data_status: 'streaming',
      }), 0);
    },

    async getBars(si, res, pp, onResult, onError) {
      try {
        const iv     = TV_TO_IV[res] || '1h';
        const sym    = si.ticker;
        const isGr   = sym === 'XAU';
        const isFirst = !!(pp && pp.firstDataRequest);
        const now    = Date.now();
        const range  = RANGES[iv] || RANGES['1h'];

        let startMs, endMs;

        if (isFirst) {
          /* First request: fetch most recent RANGE of data */
          endMs   = now;
          startMs = now - range;
        } else {
          /*
           * Pagination: pp.from and pp.to are UNIX SECONDS
           * TradingView uses the earliest bar time from the previous
           * response as pp.to for the next call. We fetch older data.
           */
          const toSec_   = pp.to   > 0 ? pp.to   : Math.floor(now / 1000);
          const fromSec_ = pp.from > 0 ? pp.from : toSec_ - Math.floor(range / 1000);
          endMs   = toSec_   * 1000;
          startMs = fromSec_ * 1000;
        }

        /* Hard floor */
        startMs = Math.max(startMs, MIN_MS);
        if (startMs >= endMs) {
          onResult([], { noData: true }); return;
        }

        /* Serve cache on first request */
        if (isFirst) {
          const cached = CACHE.get(sym, iv);
          if (cached?.length >= 5) {
            const last = cached[cached.length - 1];
            /* Cache fresh enough? (last bar within 2× interval) */
            const staleSec = Math.floor(now / 1000) - last.time;
            if (staleSec < (IV_DUR[iv] || 3600) * 3) {
              setPrice(last.close);
              _lastBarTime = last.time;
              onResult(cached, { noData: false });
              /* Background refresh newer bars */
              _bgRefresh(sym, iv, isGr, last.time).catch(() => {});
              return;
            } else {
              CACHE.del(sym, iv);
            }
          }
        }

        /* Fetch from API */
        const bars = await fetchCandles(sym, iv, isGr, startMs, endMs);

        if (!bars.length) {
          /*
           * CRITICAL: empty → noData:true (not false!)
           * noData:false with [] tells TV stream is live → stops paginating
           */
          onResult([], { noData: true });
          return;
        }

        if (isFirst) {
          const last = bars[bars.length - 1];
          setPrice(last.close);
          _lastBarTime = last.time;
          CACHE.set(sym, iv, bars);
        }

        onResult(bars, { noData: false });

      } catch (e) {
        console.error('[Chart] getBars', si?.ticker, res, e.message);
        onError && onError(e.message);
      }
    },

    subscribeBars(si, res, onTick, uid) {
      _subs[uid] = { sym: si.ticker, cb: onTick };
      _wsConn(coinStr(si.ticker), TV_TO_IV[res] || '1h');
    },

    unsubscribeBars(uid) {
      delete _subs[uid];
      if (!Object.keys(_subs).length) _wsClose();
    },
  };

  /* ── Background refresh ── */
  async function _bgRefresh(sym, iv, isGr, lastTimeSec) {
    if (!_visible) return;
    const nowMs   = Date.now();
    const gapMs   = nowMs - lastTimeSec * 1000;
    if (gapMs < 10000) return;
    try {
      const fresh = await fetchCandles(sym, iv, isGr, lastTimeSec * 1000 - 5000, nowMs);
      if (!fresh.length) return;
      const cached = CACHE.get(sym, iv) || [];
      /* Merge: replace existing time-slots, append new ones */
      const map = new Map(cached.map(b => [b.time, b]));
      fresh.forEach(b => map.set(b.time, b));
      const merged = [...map.values()].sort((a, b) => a.time - b.time);
      CACHE.set(sym, iv, merged);
      /* Push only bars newer than last delivered */
      const newer = fresh.filter(b => b.time > lastTimeSec);
      if (!newer.length) return;
      const last = newer[newer.length - 1];
      setPrice(last.close);
      _lastBarTime = last.time;
      newer.forEach(b => {
        Object.values(_subs).forEach(s => { try { s.cb(b); } catch {} });
      });
    } catch {}
  }

  /* ════════════════════════════════════════════════════════════
     WebSocket — live candle subscription
  ════════════════════════════════════════════════════════════ */
  function _wsConn(c, iv) {
    if (_chartWs && _chartWs.readyState <= 1 &&
        _wsActiveCoin === c && _wsActiveIv === iv) return;
    _wsClose();
    _wsActiveCoin = c; _wsActiveIv = iv;
    try {
      _chartWs = new WebSocket(HL_WS);
      _chartWs.onopen = () => {
        if (!_chartWs) return;
        _chartWs.send(JSON.stringify({
          method: 'subscribe',
          subscription: { type: 'candle', coin: c, interval: iv }
        }));
      };
      _chartWs.onmessage = e => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.channel !== 'candle' || !msg.data) return;
          const cd = msg.data;
          const t  = toSec(cd.t);
          if (t < MIN_SEC) return;
          const gr = isXAU();
          const bar = {
            time  : t,
            open  : gr ? +cd.o / TL : +cd.o,
            high  : gr ? +cd.h / TL : +cd.h,
            low   : gr ? +cd.l / TL : +cd.l,
            close : gr ? +cd.c / TL : +cd.c,
            volume: +cd.v || 0,
          };
          _lastBarTime = bar.time;
          setPrice(bar.close);
          Object.values(_subs).forEach(s => { try { s.cb(bar); } catch {} });
        } catch {}
      };
      _chartWs.onerror  = () => {};
      _chartWs.onclose  = () => {
        if (_visible && Object.keys(_subs).length)
          _wsTimer = setTimeout(() => _wsConn(c, iv), 4000);
      };
    } catch (e) { console.warn('[Chart] WS', e.message); }
  }

  function _wsClose() {
    clearTimeout(_wsTimer);
    if (_chartWs) { try { _chartWs.close(); } catch {} _chartWs = null; }
    _wsActiveCoin = null; _wsActiveIv = null;
  }

  /* ════════════════════════════════════════════════════════════
     BBO poller — 1-second sub-candle price animation

     FIX: tick price must be in DISPLAY units (grams for XAU)
     FIX: bar.time = current candle open (not Date.now())
          TV rejects ticks whose time doesn't match an open candle
  ════════════════════════════════════════════════════════════ */
  function _startBBO() {
    clearInterval(_bboTimer);
    _bboTimer = setInterval(() => {
      if (!_visible || typeof State === 'undefined') return;

      /* Get display-unit price from State */
      const displayPx = isXAU()
        ? State.prices?.['XAU']?.mid
        : State.prices?.[_sym]?.mid;
      if (!displayPx || +displayPx <= 0) return;

      setPrice(displayPx);

      if (!Object.keys(_subs).length) return;

      /*
       * Candle open time for the current second
       * Must match what TV expects for the current bar
       */
      const nowSec  = Math.floor(Date.now() / 1000);
      const barTime = Math.max(_lastBarTime, candleOpenSec(nowSec, _interval));

      /*
       * Bar price in chart units:
       * XAU chart: grams (displayPx is already grams) ✓
       * Others:    raw price (displayPx is raw) ✓
       */
      const p = +displayPx;

      const tick = {
        time  : barTime,
        open  : p,
        high  : p,
        low   : p,
        close : p,
        volume: 0,
      };

      Object.values(_subs).forEach(s => { try { s.cb(tick); } catch {} });
    }, 1000);
  }

  function _stopBBO() { clearInterval(_bboTimer); _bboTimer = null; }

  /* ════════════════════════════════════════════════════════════
     Position lines
  ════════════════════════════════════════════════════════════ */
  function clearLines() {
    if (_widget && _chartReady) {
      try {
        const ch = _widget.activeChart();
        _entryLines.forEach(id => { try { ch.removeEntity(id); } catch {} });
        [_tpLine, _slLine, _liqLine].forEach(id => {
          if (id) try { ch.removeEntity(id); } catch {}
        });
      } catch {}
    }
    _entryLines = []; _tpLine = null; _slLine = null; _liqLine = null;
  }

  function drawLines() {
    if (!_widget || !_chartReady || typeof State === 'undefined') return;
    clearLines();
    try {
      const ch = _widget.activeChart();
      const O  = { lock:true, disableSelection:true, disableUndo:true, zOrder:'top' };
      for (const p of (State.positions || [])) {
        const rawC = p.position.coin.includes(':') ? p.position.coin.split(':')[1] : p.position.coin;
        const pSym = rawC === 'GOLD' ? 'XAU' : rawC;
        if (pSym !== _sym) continue;
        const pos  = p.position;
        const szi  = +pos.szi;
        const gr   = isXAU();
        const eOz  = +(pos.entryPx || 0);
        const eD   = gr ? eOz / TL : eOz;
        const curD = _lastClose || (gr ? State.prices?.['XAU']?.mid : State.prices?.[_sym]?.mid) || eD;
        const pnl  = ((gr ? curD * TL : curD) - eOz) * szi;
        const col  = pnl >= 0 ? '#26a69a' : '#ef5350';
        if (eD > 0) try {
          const id = ch.createShape({ price: eD }, {
            shape:'horizontal_line', ...O,
            text:`${szi > 0 ? '▲' : '▼'} Entry  ${pnl >= 0 ? '+' : ''}$${Math.abs(pnl).toFixed(2)}`,
            overrides:{ linecolor:col, linewidth:2, linestyle:2, showLabel:true, textcolor:col }
          });
          if (id) _entryLines.push(id);
        } catch {}
        const ts = p.tpsl || {};
        if (ts.tp) {
          const tpD = gr ? ts.tp / TL : ts.tp;
          const tpP = Math.abs(szi) * Math.abs(ts.tp - eOz);
          try {
            _tpLine = ch.createShape({ price: tpD }, {
              shape:'horizontal_line', ...O,
              text:`🎯 TP +$${tpP.toFixed(2)}`,
              overrides:{ linecolor:'#22c58b', linewidth:2, linestyle:2, showLabel:true, textcolor:'#22c58b' }
            });
          } catch {}
        }
        if (ts.sl) {
          const slD = gr ? ts.sl / TL : ts.sl;
          const slP = Math.abs(szi) * Math.abs(ts.sl - eOz);
          try {
            _slLine = ch.createShape({ price: slD }, {
              shape:'horizontal_line', ...O,
              text:`🛡 SL -$${slP.toFixed(2)}`,
              overrides:{ linecolor:'#e8804a', linewidth:2, linestyle:2, showLabel:true, textcolor:'#e8804a' }
            });
          } catch {}
        }
        if (typeof calcLiqPrice !== 'undefined' && typeof ASSETS !== 'undefined') {
          const aL = ASSETS[pSym] || ASSETS['GOLD'] || { lev:20, cross:false };
          const lOz = calcLiqPrice(eOz, szi, State.balance?.total || 0, aL.cross, aL.lev);
          if (lOz !== null && lOz > 0) {
            const lD = gr ? lOz / TL : lOz;
            try {
              _liqLine = ch.createShape({ price: lD }, {
                shape:'horizontal_line', ...O,
                text:`⚡ Liq $${lD.toFixed(assetOf(_sym).pxDp)}`,
                overrides:{ linecolor:'#ff6b35', linewidth:2, linestyle:1, showLabel:true, textcolor:'#ff6b35' }
              });
            } catch {}
          }
        }
        break;
      }
    } catch (e) { console.warn('[Chart] drawLines:', e.message); }
  }

  /* ════════════════════════════════════════════════════════════
     Trade bar + confirm sheet
  ════════════════════════════════════════════════════════════ */
  function buildTradeBar(wrap) {
    $el('_cTrade')?.remove();
    const a = assetOf(_sym);
    const bar = document.createElement('div');
    bar.id = '_cTrade'; bar.className = 'c-trade-bar';
    bar.innerHTML = `
<button class="cbt sell" id="_cSell">
  <span class="cbt-lbl">▼ بيع</span>
  <span class="cbt-px" id="_cSellPx">—</span>
</button>
<div class="cbt-mid">
  <span class="cbt-lbl-sm">الكمية · ${a.unit}</span>
  <div class="cbt-row">
    <input class="cbt-in" id="_cQty" type="number"
      value="${a.presets?.[0] || 1}" min="0" step="any" inputmode="decimal">
    <span class="cbt-unit">${a.unit}</span>
  </div>
</div>
<button class="cbt buy" id="_cBuy">
  <span class="cbt-lbl">▲ شراء</span>
  <span class="cbt-px" id="_cBuyPx">—</span>
</button>`;
    const tvWrap = wrap.querySelector('.c-tv-wrap') || wrap.firstChild;
    if (tvWrap) wrap.insertBefore(bar, tvWrap); else wrap.appendChild(bar);
    $el('_cBuy').onclick  = () => _showConfirm(true);
    $el('_cSell').onclick = () => _showConfirm(false);
    _refreshBtnPx();
  }

  function _showConfirm(isBuy) {
    if (typeof State === 'undefined' || !State.wallet)
      return toast_('سجّل الدخول أولاً', 'err');
    const qty = parseFloat($el('_cQty')?.value || 0);
    if (!qty || qty <= 0) return toast_('أدخل الكمية', 'err');
    const a    = assetOf(_sym);
    const gr   = isXAU();
    const mid  = _lastClose || (gr ? State.prices?.['XAU']?.mid : State.prices?.[_sym]?.mid) || 0;
    if (!mid) return toast_('لا يوجد سعر', 'err');
    const midOz = gr ? mid * TL : mid;
    const qtyOz = gr ? qty / TL : qty;
    const usd   = (midOz * qtyOz).toFixed(2);
    const mgn   = (midOz * qtyOz / a.lev).toFixed(2);
    const liqOz = isBuy ? midOz*(1-1/a.lev+.5/a.lev) : midOz*(1+1/a.lev-.5/a.lev);
    const liqD  = (gr ? liqOz / TL : liqOz).toFixed(a.pxDp);
    _hideConfirm();
    const tw = $el('_cTvWrap'); if (!tw) return;
    const ov = document.createElement('div'); ov.id = '_cfOv'; ov.className = 'cf-ov';
    ov.innerHTML = `<div class="cf-card">
<div class="cf-hdl"></div>
<div class="cf-title" style="color:${isBuy?'#26a69a':'#ef5350'}">
  ${a.icon} ${isBuy?'شراء ▲':'بيع ▼'} — ${a.name}</div>
<div class="cf-sub">رافعة ${a.lev}x · تنفيذ فوري بسعر السوق</div>
<div class="cf-rows">
<div class="cf-row"><span class="cf-k">الكمية</span>
  <span class="cf-v">${qty.toFixed(gr?2:a.szDp)} ${a.unit}</span></div>
<div class="cf-row"><span class="cf-k">السعر</span>
  <span class="cf-v">${mid.toFixed(a.pxDp)} $</span></div>
<div class="cf-row"><span class="cf-k">القيمة</span>
  <span class="cf-v">≈ $${usd}</span></div>
<div class="cf-row"><span class="cf-k">الهامش</span>
  <span class="cf-v w">≈ $${mgn}</span></div>
<div class="cf-row"><span class="cf-k">التصفية</span>
  <span class="cf-v ${isBuy?'r':'g'}">≈ $${liqD}</span></div>
</div>
<div class="cf-btns">
<button class="cf-can" id="_cfC">إلغاء ✕</button>
<button class="cf-exec ${isBuy?'g':'r'}" id="_cfX">
  ${isBuy?'✅ تأكيد الشراء':'✅ تأكيد البيع'}</button>
</div></div>`;
    tw.appendChild(ov);
    ov.onclick = e => { if (e.target === ov) _hideConfirm(); };
    $el('_cfC').onclick = _hideConfirm;
    $el('_cfX').onclick = () =>
      typeof requirePin !== 'undefined'
        ? requirePin(() => _execTrade(isBuy, qty))
        : _execTrade(isBuy, qty);
  }

  function _hideConfirm() { $el('_cfOv')?.remove(); }

  async function _execTrade(isBuy, qty) {
    if (!State?.wallet) return;
    const btn = $el('_cfX');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="cf-spin"></span>'; }
    const gr    = isXAU();
    const a     = gr ? (typeof ASSETS !== 'undefined' ? ASSETS['GOLD'] : assetOf(_sym)) : assetOf(_sym);
    const mid   = _lastClose || (gr ? State.prices?.['XAU']?.mid : State.prices?.[_sym]?.mid) || 0;
    const midOz = gr ? mid * TL : mid;
    if (!midOz) { _hideConfirm(); return; }
    const qtyOz = gr ? qty / TL : qty;
    try {
      try { await hlExchange({ type:'updateLeverage', asset:a.idx, isCross:a.cross, leverage:a.lev }); } catch {}
      await hlExchange({
        type  : 'order',
        orders: [{ a:a.idx, b:isBuy,
          p: wirePx(midOz * (isBuy ? 1.05 : 0.95), a.szDp),
          s: wireSz(qtyOz, a.szDp),
          r: false, t:{ limit:{ tif:'Ioc' } }
        }],
        grouping: 'na'
      });
      _hideConfirm();
      const disp = gr ? qty.toFixed(2)+' غرام' : qty.toFixed(a.szDp)+' '+a.unit;
      toast_(`✅ ${a.icon} ${isBuy?'شراء':'بيع'} ${disp}`, 'ok', 4000);
      if (typeof pollAccount !== 'undefined') setTimeout(pollAccount, 2000);
    } catch (e) {
      toast_(
        typeof tradeErr !== 'undefined' ? tradeErr(e.message) : '❌ ' + e.message.slice(0,100),
        'err', 5000
      );
      if (btn) { btn.disabled=false; btn.innerHTML=isBuy?'✅ تأكيد الشراء':'✅ تأكيد البيع'; }
    }
  }

  /* ── Fullscreen ── */
  function _toggleFs() {
    const el = $el('chartScreen');
    if (!document.fullscreenElement) {
      (el?.requestFullscreen?.() || el?.webkitRequestFullscreen?.())?.catch?.(() => {});
    } else {
      (document.exitFullscreen?.() || document.webkitExitFullscreen?.())?.catch?.(() => {});
    }
  }

  function _onFsChange() {
    if (!_widget || !_chartReady) return;
    setTimeout(() => {
      const tw = $el('_cTvWrap'); if (!tw) return;
      const r  = tw.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) return;
      const w = Math.floor(r.width), h = Math.floor(r.height);
      const tc = $el('_tvC');
      if (tc) { tc.style.width = w+'px'; tc.style.height = h+'px'; }
      try { _widget.resize(w, h); } catch {}
    }, 150);
  }

  /* ── Layout wait ── */
  function _waitLayout(cb, n) {
    clearTimeout(_layoutTmr); n = n || 0;
    const w = $el('_cTvWrap');
    if (w && _visible) {
      const r = w.getBoundingClientRect();
      if (r.width > 10 && r.height > 10) { cb(Math.floor(r.width), Math.floor(r.height)); return; }
    }
    if (!_visible) return;
    if (n < 150) { _layoutTmr = setTimeout(() => _waitLayout(cb, n+1), 16); }
    else {
      const sc = $el('chartScreen');
      cb(sc ? sc.clientWidth : window.innerWidth,
         Math.max(300, (sc ? sc.clientHeight : window.innerHeight) - 100));
    }
  }

  /* ── ResizeObserver ── */
  function _setupResize() {
    if (_ro) { _ro.disconnect(); _ro = null; }
    const w = $el('_cTvWrap');
    if (!w || !window.ResizeObserver) return;
    _ro = new ResizeObserver(entries => {
      if (!_widget || !_visible) return;
      const { width, height } = entries[0].contentRect;
      if (width < 10 || height < 10) return;
      const tc = $el('_tvC');
      if (tc) { tc.style.width = Math.floor(width)+'px'; tc.style.height = Math.floor(height)+'px'; }
      try { _widget.resize(Math.floor(width), Math.floor(height)); } catch {}
    });
    _ro.observe(w);
  }

  /* ── Watchdog ── */
  function _showWatchdog() {
    const w = $el('_cTvWrap'); if (!w || !_visible) return;
    $el('_cWd')?.remove();
    const ov = document.createElement('div'); ov.id = '_cWd'; ov.className = 'c-wd';
    ov.innerHTML = `<div class="c-wd-ico">⏱</div>
<div class="c-wd-title">انتهت مهلة التحميل (10 ثوانٍ)</div>
<div class="c-wd-msg">تحقق من <b>DevTools → Console</b> → ابحث <code>[Chart]</code></div>
<button class="c-wd-btn" id="_cWdBtn">إعادة المحاولة</button>`;
    w.appendChild(ov);
    $el('_cWdBtn').onclick = () => { ov.remove(); _waitLayout((pw,ph) => _doInit(_sym, pw, ph)); };
  }

  /* ── Destroy widget ── */
  function _destroyWidget() {
    clearTimeout(_layoutTmr); _layoutTmr = null;
    clearTimeout(_readyTmr);  _readyTmr  = null;
    if (_ro) { _ro.disconnect(); _ro = null; }
    clearLines();
    if (_widget) { try { _widget.remove(); } catch {} _widget = null; }
    _chartReady = false; _subs = {};
    _wsClose();
    const c = $el('_tvC');
    if (c) { c.innerHTML = ''; c.style.width = ''; c.style.height = ''; }
    $el('_cWd')?.remove();
  }

  /* ════════════════════════════════════════════════════════════
     Widget init
  ════════════════════════════════════════════════════════════ */
  function _doInit(sym, w, h) {
    if (!_visible) return;
    _destroyWidget();

    if (typeof TradingView === 'undefined' || typeof TradingView.widget !== 'function') {
      const tw = $el('_cTvWrap');
      if (tw) tw.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;
        height:100%;color:#ff8c42;font-size:14px;font-family:Cairo,sans-serif;
        text-align:center;padding:20px;direction:rtl;">
        ⚠️ مكتبة TradingView غير متاحة<br>
        <small style="font-size:11px;opacity:.6;margin-top:6px;display:block;">
          تحقق من /charting_library/charting_library.standalone.js</small></div>`;
      return;
    }

    const cont = $el('_tvC'); if (!cont) return;
    cont.style.width  = w + 'px';
    cont.style.height = h + 'px';

    const dark  = isDark();
    const bg    = dark ? '#131722' : '#ffffff';
    const tvRes = PREF.get('iv') || IV_TO_TV[_interval] || '60';

    console.log(`[Chart] init ${sym} ${w}×${h} res=${tvRes} ${dark?'dark':'light'}`);

    clearTimeout(_readyTmr);
    _readyTmr = setTimeout(() => {
      console.warn('[Chart] ⏱ 10s timeout', sym);
      _showWatchdog();
    }, 10000);

    try {
      _widget = new TradingView.widget({
        width : w,
        height: h,
        symbol   : sym,
        interval : tvRes,
        container: '_tvC',
        datafeed : Datafeed,
        library_path: '/charting_library/',

        /* UTC+3 = Asia/Baghdad */
        timezone: 'Asia/Baghdad',
        locale  : 'ar',

        theme : dark ? 'Dark' : 'Light',
        style : '1',
        debug : false,
        autosize: false,

        enable_publishing  : false,
        allow_symbol_change: false,
        save_image: true,

        favorites: {
          intervals : ['1','5','15','60','240','D'],
          chartTypes: ['Bars','Candles','Line'],
        },
        loading_screen: { backgroundColor: bg, foregroundColor: '#2962ff' },

        disabled_features: [
          'header_symbol_search',
          'header_compare',
          'header_saveload',
          'header_fullscreen_button',
          'symbol_info',
          'display_market_status',
          'show_logo_on_all_charts',
          'popup_hints',
          'create_volume_indicator_by_default',
          'volume_force_overlay',
        ],

        enabled_features: [
          'countdown_timer',                          /* ← العد التنازلي */
          'use_localstorage_for_settings',
          'save_chart_properties_to_local_storage',
          'move_logo_to_main_pane',
          'side_toolbar_in_fullscreen_mode',
          'header_in_fullscreen_mode',
          'same_data_requery',                        /* re-request data on symbol change */
        ],

        overrides: {
          'mainSeriesProperties.candleStyle.upColor'        : '#26a69a',
          'mainSeriesProperties.candleStyle.downColor'      : '#ef5350',
          'mainSeriesProperties.candleStyle.borderUpColor'  : '#26a69a',
          'mainSeriesProperties.candleStyle.borderDownColor': '#ef5350',
          'mainSeriesProperties.candleStyle.wickUpColor'    : '#26a69a',
          'mainSeriesProperties.candleStyle.wickDownColor'  : '#ef5350',
          'paneProperties.background'    : bg,
          'paneProperties.backgroundType': 'solid',
          'paneProperties.vertGridProperties.color': dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
          'paneProperties.horzGridProperties.color': dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
          'scalesProperties.textColor'      : dark ? '#b2b5be' : '#555',
          'scalesProperties.fontSize'       : 11,
          'scalesProperties.backgroundColor': dark ? '#131722' : '#f0f3fa',
          /* Countdown timer color */
          'countdown_timer.color': '#ff8c42',
        },
      });

      _widget.onChartReady(() => {
        console.log('[Chart] ✅ ready', sym);
        clearTimeout(_readyTmr); _readyTmr = null;
        $el('_cWd')?.remove();
        _chartReady = true;
        _setupResize();

        /* Force timezone AFTER ready (some TV versions need this) */
        try { _widget.activeChart().setTimezone('Asia/Baghdad'); } catch {}

        /* Anchor viewport to last 7 days */
        setTimeout(() => {
          try {
            const nowSec = Math.floor(Date.now() / 1000);
            _widget.activeChart().setVisibleRange(
              { from: nowSec - 7 * 86400, to: nowSec + 3600 },
              { percentRightMargin: 5 }
            );
          } catch {}
          drawLines();
        }, 600);

        /* Track interval changes */
        try {
          _widget.activeChart().onIntervalChanged().subscribe(null, newRes => {
            PREF.set('iv', newRes);
            _interval    = TV_TO_IV[newRes] || _interval;
            _lastBarTime = 0; // reset so BBO re-snaps to new candle boundary
          });
        } catch {}
      });

    } catch (e) {
      console.error('[Chart] widget threw:', e);
      clearTimeout(_readyTmr); _readyTmr = null;
      const tw = $el('_cTvWrap');
      if (tw) tw.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;
        height:100%;color:#ef5350;font-size:13px;font-family:Cairo,sans-serif;
        text-align:center;padding:20px;direction:rtl;">❌ خطأ في تهيئة الرسم<br>
        <small style="font-family:monospace;font-size:11px;opacity:.7;margin-top:8px;
        display:block;direction:ltr;">${e.message || e}</small></div>`;
    }
  }

  /* ── Build screen HTML (once) ── */
  function _ensureScreen() {
    const sc = $el('chartScreen');
    if (!sc || $el('_cTvWrap')) return;

    sc.innerHTML = `
<div class="c-nav">
  <button class="c-back" id="_cBack">← رجوع</button>
  <div class="c-asset">
    <span id="_cIcon" class="c-asset-icon">🛢</span>
    <span id="_cName" class="c-asset-name">—</span>
    <span id="_cPrice" class="c-asset-price">—</span>
  </div>
  <div class="c-controls">
    <button class="c-ctrl" id="_cReset" title="آخر الشموع">↺</button>
    <button class="c-ctrl" id="_cLock"  title="قفل">🔒</button>
    <button class="c-ctrl" id="_cFs"    title="ملء الشاشة">⛶</button>
  </div>
</div>
<div id="_cWrap">
  <div class="c-tv-wrap" id="_cTvWrap"><div id="_tvC"></div></div>
</div>`;

    $el('_cBack').onclick  = () => ChartModule.close();
    $el('_cReset').onclick = () => {
      if (!_widget || !_chartReady) return;
      try { _widget.activeChart().scrollToRealTime(); } catch {}
      try {
        const nowSec = Math.floor(Date.now() / 1000);
        _widget.activeChart().setVisibleRange({ from: nowSec - 7*86400, to: nowSec + 3600 });
      } catch {}
    };
    $el('_cLock').onclick = () => typeof lockApp === 'function' && lockApp(true);
    $el('_cFs').onclick   = _toggleFs;

    document.addEventListener('fullscreenchange',       _onFsChange);
    document.addEventListener('webkitfullscreenchange', _onFsChange);

    if (!_gestInit) {
      _gestInit = true;
      const tw = $el('_cTvWrap');
      if (tw) {
        ['gesturestart','gesturechange','gestureend'].forEach(ev =>
          tw.addEventListener(ev, e => e.preventDefault(), { passive: false }));
        tw.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
      }
    }
  }

  function _setHeader(sym) {
    const a = assetOf(sym);
    const ic = $el('_cIcon'), nm = $el('_cName');
    if (ic) ic.textContent = a.icon;
    if (nm) nm.textContent = a.name;
  }

  /* ════════════════════════════════════════════════════════════
     Public API
  ════════════════════════════════════════════════════════════ */
  function open(sym) {
    const savedTv = PREF.get('iv');
    if (savedTv) _interval = TV_TO_IV[savedTv] || _interval;

    _sym     = sym || (typeof State !== 'undefined' ? State.asset : 'CL');
    _visible = true;
    _ensureScreen();
    $el('chartScreen')?.classList.remove('hidden');
    _setHeader(_sym);

    const wrap = $el('_cWrap');
    if (wrap) buildTradeBar(wrap);
    _startBBO();

    /* Immediate price */
    if (typeof State !== 'undefined') {
      const p = isXAU() ? State.prices?.['XAU']?.mid : State.prices?.[_sym]?.mid;
      if (p) setPrice(p);
    }

    if (_widget && _chartReady) {
      try {
        _widget.setSymbol(_sym, IV_TO_TV[_interval] || '60', () => {
          _lastBarTime = 0;
          setTimeout(() => {
            drawLines();
            try {
              const nowSec = Math.floor(Date.now() / 1000);
              _widget.activeChart().setVisibleRange(
                { from: nowSec - 7*86400, to: nowSec + 3600 },
                { percentRightMargin: 5 }
              );
            } catch {}
          }, 600);
        });
      } catch { _waitLayout((w, h) => _doInit(_sym, w, h)); }
    } else if (!_widget) {
      _waitLayout((w, h) => _doInit(_sym, w, h));
    }
  }

  function close() {
    _visible = false;
    _hideConfirm();
    _stopBBO();
    _wsClose();
    if (document.fullscreenElement) {
      (document.exitFullscreen?.() || document.webkitExitFullscreen?.())?.catch?.(() => {});
    }
    $el('chartScreen')?.classList.add('hidden');
  }

  function switchInterval(iv) {
    if (iv === _interval) return;
    _interval    = iv;
    _lastBarTime = 0;
    const tvRes  = IV_TO_TV[iv] || '60';
    PREF.set('iv', tvRes);
    if (_widget && _chartReady) {
      try {
        _widget.activeChart().setResolution(tvRes, () => {
          try {
            const nowSec = Math.floor(Date.now() / 1000);
            _widget.activeChart().setVisibleRange({ from: nowSec - 7*86400, to: nowSec + 3600 });
          } catch {}
        });
      } catch (e) { console.warn('[Chart] setResolution:', e.message); }
    }
  }

  function switchAssetChart(sym) {
    if (!_visible || sym === _sym) return;
    _sym         = sym;
    _lastBarTime = 0;
    _lastClose   = 0;
    _setHeader(sym);
    const wrap = $el('_cWrap');
    if (wrap) buildTradeBar(wrap);
    if (typeof State !== 'undefined') {
      const p = sym === 'XAU' ? State.prices?.['XAU']?.mid : State.prices?.[sym]?.mid;
      if (p) setPrice(p);
    }
    if (_widget && _chartReady) {
      try {
        _widget.setSymbol(sym, IV_TO_TV[_interval] || '60', () => {
          _lastBarTime = 0;
          setTimeout(() => {
            drawLines();
            try {
              const nowSec = Math.floor(Date.now() / 1000);
              _widget.activeChart().setVisibleRange(
                { from: nowSec - 7*86400, to: nowSec + 3600 },
                { percentRightMargin: 5 }
              );
            } catch {}
          }, 600);
        });
      } catch (e) { console.warn('[Chart] setSymbol:', e.message); }
    }
  }

  function refreshLines() {
    if (_visible && _chartReady) drawLines();
  }

  return { open, close, switchInterval, switchAssetChart, refreshLines };
})();
