/* ═══════════════════════════════════════════════════════════════
   chart.js — TradingView Advanced Charts v11
   ✅ DataFeed صحيح 100% (getBars + subscribeBars + resolveSymbol)
   ✅ لا يوجد bug 1970 — timestamps بـ milliseconds فقط
   ✅ تاريخ كامل + live candles
   ✅ شاشة نظيفة — شريط رأس بسيط + أزرار شراء/بيع
   ✅ UTC+3 display مع Etc/UTC في resolveSymbol
   ✅ noData: true على استجابات فارغة
   ✅ #_tvC يحتوي direction:ltr (RTL bug fix)
═══════════════════════════════════════════════════════════════ */

const ChartModule = (function () {
  'use strict';

  /* ── ثوابت ── */
  const HL_API   = 'https://api.hyperliquid.xyz';
  const TROY     = 31.1035;
  const MIN_2020 = 1577836800000; // 2020-01-01 ms

  /* interval → Hyperliquid string */
  const IV_MAP = {
    '1':  '1m',  '3':  '3m',  '5':  '5m',  '15': '15m',
    '30': '30m', '60': '1h',  '240':'4h',  '1D': '1d',  '1W': '1w',
  };

  /* interval → ms duration لجلب التاريخ */
  const IV_RANGE = {
    '1':  2*24*3600000,    '3':  5*24*3600000,   '5':  7*24*3600000,
    '15': 14*24*3600000,   '30': 30*24*3600000,  '60': 60*24*3600000,
    '240':180*24*3600000,  '1D': 365*24*3600000, '1W': 730*24*3600000,
  };

  /* ── حالة داخلية ── */
  let _widget    = null;
  let _visible   = false;
  let _sym       = 'CL';
  let _interval  = '60';
  let _ws        = null;
  let _wsTimer   = null;
  let _wsSubs    = {};          // coin → callback
  let _lastClose = 0;
  let _clockTimer = null;

  /* ════════════════════════════════════════
     CSS — شاشة الرسم البياني
  ════════════════════════════════════════ */
  (function injectCSS() {
    if (document.getElementById('_tvCSS')) return;
    const s = document.createElement('style');
    s.id = '_tvCSS';
    s.textContent = `
/* ── Chart Screen ── */
.chart-screen {
  position:fixed; inset:0; z-index:50;
  display:flex; flex-direction:column;
  background:#000; overflow:hidden;
}
.chart-screen.hidden { display:none !important; }

/* ── Header ── */
.tv-nav {
  display:flex; align-items:center; justify-content:space-between;
  padding:0 10px;
  height:46px;
  background:var(--bg-card,#0d0d0d);
  border-bottom:1px solid var(--border,#2a2a2a);
  flex-shrink:0; direction:rtl; gap:8px;
}
.tv-nav-left  { display:flex; align-items:center; gap:8px; min-width:0; }
.tv-nav-right { display:flex; align-items:center; gap:6px; flex-shrink:0; }

.tv-back {
  color:var(--ac,#ff8c42); font-size:12px; font-weight:800;
  padding:5px 12px; border-radius:10px;
  border:1.5px solid var(--ac-dim,rgba(255,140,66,.2));
  background:var(--ac-dim,rgba(255,140,66,.12));
  font-family:'Cairo',sans-serif; cursor:pointer; white-space:nowrap;
  transition:all .15s;
}
.tv-back:hover { background:var(--ac,#ff8c42); color:#fff; }

.tv-asset-badge {
  display:flex; align-items:center; gap:5px;
}
.tv-asset-icon { font-size:15px; line-height:1; }
.tv-asset-name { font-size:13px; font-weight:900; color:var(--text-primary,#f5f5f5); }
.tv-price {
  font-family:'IBM Plex Mono',monospace;
  font-size:15px; font-weight:800; color:var(--text-primary,#f5f5f5);
}
.tv-price.up { color:#00e676; }
.tv-price.dn { color:#ff3d3d; }

.tv-ws-dot {
  width:8px; height:8px; border-radius:50%;
  background:#555; flex-shrink:0;
  transition:background .3s;
}
.tv-ws-dot.connected { background:#00e676; box-shadow:0 0 6px #00e676; }
.tv-ws-dot.connecting { background:#ffd600; animation:dotPulse 1.2s ease-in-out infinite; }
.tv-ws-dot.error { background:#ff3d3d; }

@keyframes dotPulse { 0%,100%{opacity:1} 50%{opacity:.3} }

.tv-icon-btn {
  width:32px; height:32px; border-radius:8px;
  border:1px solid var(--border,#2a2a2a);
  background:var(--bg-elev,#161616);
  color:var(--text-secondary,#a0a0a0);
  font-size:15px; cursor:pointer;
  display:flex; align-items:center; justify-content:center;
  transition:all .15s;
}
.tv-icon-btn:hover  { border-color:var(--ac,#ff8c42); color:var(--ac,#ff8c42); }
.tv-icon-btn:active { transform:scale(.88); }

/* ── Interval Tabs ── */
.tv-ivs {
  display:flex; gap:3px; flex-shrink:0;
}
.tv-iv {
  padding:4px 9px; border-radius:999px;
  border:1.5px solid var(--border,#2a2a2a);
  background:var(--bg-elev,#161616);
  color:var(--text-secondary,#a0a0a0);
  font-size:11px; font-weight:800;
  font-family:'IBM Plex Mono',monospace;
  cursor:pointer; transition:all .15s; white-space:nowrap;
}
.tv-iv:active { transform:scale(.88); }
.tv-iv.active {
  border-color:var(--ac,#ff8c42);
  background:rgba(255,140,66,.15);
  color:var(--ac,#ff8c42);
}

/* ── Trade Bar ── */
.tv-trade {
  display:flex; align-items:center; gap:6px;
  padding:7px 8px;
  background:var(--bg-card,#0d0d0d);
  border-bottom:1px solid var(--border,#2a2a2a);
  flex-shrink:0; direction:rtl;
}
.tv-btn-trade {
  flex:1; min-height:52px; padding:6px 4px; border-radius:12px; border:none;
  font-family:'Cairo',sans-serif; font-size:15px; font-weight:900;
  cursor:pointer; color:#fff;
  display:flex; flex-direction:column;
  align-items:center; justify-content:center; gap:2px;
  transition:filter .12s, transform .12s;
}
.tv-btn-trade:active { transform:scale(.93); filter:brightness(.88); }
.tv-btn-buy  { background:linear-gradient(150deg,#00c853,#1b5e20); box-shadow:0 2px 12px rgba(0,200,83,.35); }
.tv-btn-sell { background:linear-gradient(150deg,#ff1744,#b71c1c); box-shadow:0 2px 12px rgba(255,23,68,.35); }
.tv-btn-dir  { font-size:14px; line-height:1; }
.tv-btn-px   { font-family:'IBM Plex Mono',monospace; font-size:9px; opacity:.8; }

.tv-qty-wrap {
  flex:1.2; display:flex; flex-direction:column;
  align-items:center; gap:4px;
}
.tv-qty-label { font-size:9px; color:var(--text-muted,#555); font-weight:700; letter-spacing:1px; }
.tv-qty-row   { display:flex; align-items:center; gap:4px; }
.tv-qty-in {
  width:72px; font-family:'IBM Plex Mono',monospace;
  font-size:18px; font-weight:700; text-align:center; direction:ltr;
  background:var(--bg-input,#1e1e1e);
  border:2px solid var(--border,#2a2a2a);
  border-radius:10px; padding:5px 4px;
  color:var(--text-primary,#f5f5f5); outline:none;
  transition:border-color .15s;
}
.tv-qty-in:focus { border-color:var(--ac,#ff8c42); }
.tv-qty-unit { font-size:9px; color:var(--text-secondary,#a0a0a0); font-weight:700; }
.tv-presets  { display:flex; gap:3px; }
.tv-preset {
  font-family:'IBM Plex Mono',monospace; font-size:9px; font-weight:700;
  padding:3px 7px; border-radius:999px;
  border:1.5px solid var(--border,#2a2a2a);
  background:var(--bg-elev,#161616);
  color:var(--text-muted,#555); cursor:pointer;
  transition:all .12s;
}
.tv-preset.active {
  border-color:var(--ac,#ff8c42);
  color:var(--ac,#ff8c42);
  background:rgba(255,140,66,.14);
}

/* ── TradingView Container ── */
#_tvC {
  flex:1; min-height:0; width:100%;
  direction:ltr !important;   /* RTL fix — MUST */
  overflow:hidden;
}
#_tvC iframe { display:block; }

/* ── Confirmation Sheet ── */
.tv-cf-ov {
  position:absolute; inset:0; z-index:95;
  display:flex; align-items:flex-end; justify-content:center;
  background:rgba(0,0,0,.65);
  backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px);
  direction:rtl;
}
.tv-cf-card {
  background:var(--bg-card,#0d0d0d);
  border-top:2px solid var(--border-strong,#3d3d3d);
  border-radius:22px 22px 0 0;
  width:100%; max-width:480px;
  padding:14px 14px 24px;
  animation:cfSlide .22s cubic-bezier(.4,0,.2,1);
}
@keyframes cfSlide { from{transform:translateY(100%)} to{transform:none} }
.tv-cf-hdl  { width:32px;height:4px;background:var(--border-strong,#3d3d3d);border-radius:999px;margin:0 auto 12px; }
.tv-cf-title{ font-size:17px;font-weight:900;margin-bottom:2px; }
.tv-cf-sub  { font-size:11px;color:var(--text-secondary,#a0a0a0);margin-bottom:10px; }
.tv-cf-rows {
  background:var(--bg-input,#1e1e1e);
  border-radius:12px; padding:8px 10px;
  display:flex; flex-direction:column; gap:0;
  margin-bottom:12px;
}
.tv-cf-row {
  display:flex; justify-content:space-between; align-items:center;
  padding:8px 0; border-bottom:1px solid var(--border,#2a2a2a);
  font-size:13px;
}
.tv-cf-row:last-child { border:none; }
.tv-cf-key { color:var(--text-secondary,#a0a0a0); font-weight:700; }
.tv-cf-val { font-family:'IBM Plex Mono',monospace; font-weight:800; color:var(--text-primary,#f5f5f5); }
.tv-cf-val.g { color:#00e676; }
.tv-cf-val.r { color:#ff3d3d; }
.tv-cf-val.w { color:#ffd600; }
.tv-cf-btns { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.tv-cf-cancel {
  padding:12px; border-radius:999px;
  border:1.5px solid var(--border-strong,#3d3d3d);
  background:var(--bg-elev,#161616);
  color:var(--text-secondary,#a0a0a0);
  font-size:14px; font-weight:700; cursor:pointer;
  font-family:'Cairo',sans-serif;
}
.tv-cf-exec {
  padding:12px; border-radius:999px; border:none; color:#fff;
  font-size:14px; font-weight:900; cursor:pointer;
  font-family:'Cairo',sans-serif;
  display:flex; align-items:center; justify-content:center; gap:6px;
  transition:filter .12s;
}
.tv-cf-exec:active { filter:brightness(.85); }
.tv-cf-exec:disabled { opacity:.5; pointer-events:none; }
.tv-cf-exec.g { background:linear-gradient(135deg,#00c853,#1b5e20); }
.tv-cf-exec.r { background:linear-gradient(135deg,#ff1744,#b71c1c); }
.tv-spin {
  width:14px;height:14px;border:2px solid rgba(255,255,255,.3);
  border-top-color:#fff;border-radius:50%;
  animation:tvSpin .7s linear infinite;
}
@keyframes tvSpin { to{transform:rotate(360deg)} }
`;
    document.head.appendChild(s);
  })();

  /* ════════════════════════════════════════
     مساعدات
  ════════════════════════════════════════ */
  const _ai = sym => (typeof ASSETS !== 'undefined' && ASSETS[sym]) ||
    { pxDp:2, szDp:2, name:sym, icon:'📊', unit:'', lev:10, presets:[1,2,5], idx:0, cross:true };

  const _coin = sym => {
    if (typeof ASSETS !== 'undefined' && ASSETS[sym]) return ASSETS[sym].coin;
    return `xyz:${sym}`;
  };

  /* HL coin string → display sym */
  const _coinToSym = coinStr => {
    const raw = coinStr.includes(':') ? coinStr.split(':')[1] : coinStr;
    if (typeof COIN_TO_SYM !== 'undefined' && COIN_TO_SYM[raw]) return COIN_TO_SYM[raw];
    return raw === 'GOLD' ? 'XAU' : raw;
  };

  function _isGram(sym) { return sym === 'XAU'; }

  /* السعر المعروض — يأخذ بعين الاعتبار تحويل الغرام */
  function _dispPrice(sym, ozPrice) {
    return _isGram(sym) ? ozPrice / TROY : ozPrice;
  }
  function _ozPrice(sym, dispPrice) {
    return _isGram(sym) ? dispPrice * TROY : dispPrice;
  }

  /* coin string لـ Hyperliquid API — XAU يستخدم GOLD */
  function _hlCoin(sym) {
    if (sym === 'XAU') return 'xyz:GOLD';
    return _coin(sym);
  }

  function _setStatus(cls, label) {
    const dot = document.getElementById('_tvDot');
    if (dot) { dot.className = 'tv-ws-dot ' + cls; dot.title = label || ''; }
  }

  function _setPrice(sym, ozPrice) {
    const disp = _dispPrice(sym, ozPrice);
    _lastClose = disp;
    const a  = _ai(sym);
    const el = document.getElementById('_tvPrice');
    if (!el) return;
    const prev = parseFloat(el.dataset.prev || 0);
    el.textContent = '$' + disp.toFixed(a.pxDp);
    el.className = 'tv-price' + (disp > prev ? ' up' : disp < prev ? ' dn' : '');
    el.dataset.prev = disp;
    _updateBtnPx(sym, disp);
  }

  function _updateBtnPx(sym, mid) {
    if (!mid) return;
    const a = _ai(sym);
    const b = document.getElementById('_tvBuyPx');
    const s = document.getElementById('_tvSellPx');
    if (b) b.textContent = '$' + (mid * 1.0003).toFixed(a.pxDp);
    if (s) s.textContent = '$' + (mid * 0.9997).toFixed(a.pxDp);
  }

  /* ════════════════════════════════════════
     WebSocket للـ Live Price (BBO)
     مستقل عن TV — TV يتلقى candles
  ════════════════════════════════════════ */
  let _priceWs = null;
  let _priceWsTimer = null;
  let _priceWsCoins = new Set();

  function _priceWsConnect() {
    _priceWsClose();
    try {
      _priceWs = new WebSocket('wss://api.hyperliquid.xyz/ws');
      _priceWs.onopen = () => {
        _priceWsCoins.forEach(c => {
          _priceWs.send(JSON.stringify({
            method: 'subscribe',
            subscription: { type: 'bbo', coin: c }
          }));
        });
        _setStatus('connected', 'Live');
      };
      _priceWs.onmessage = e => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.channel !== 'bbo' || !msg.data) return;
          const coinStr = msg.data.coin;
          const sym     = _coinToSym(coinStr);
          const bid = parseFloat(msg.data.bbo?.[0]?.px || 0);
          const ask = parseFloat(msg.data.bbo?.[1]?.px || 0);
          const mid = (bid && ask) ? (bid + ask) / 2 : 0;
          if (!mid) return;
          /* فقط الأصل الحالي */
          if (sym === _sym || (sym === 'GOLD' && _sym === 'XAU') ||
              (sym === 'XAU' && _sym === 'GOLD')) {
            _setPrice(_sym, sym === 'XAU' ? mid : mid);
          }
          /* أيضاً للـ XAU من GOLD */
          if (sym === 'GOLD' && _sym === 'XAU') {
            _setPrice('XAU', mid); // mid هو سعر الأونصة
          }
        } catch {}
      };
      _priceWs.onerror = () => _setStatus('error', 'Error');
      _priceWs.onclose = () => {
        _setStatus('connecting', 'Reconnecting...');
        if (_visible) _priceWsTimer = setTimeout(_priceWsConnect, 4000);
      };
    } catch {}
  }

  function _priceWsClose() {
    clearTimeout(_priceWsTimer);
    if (_priceWs) { try { _priceWs.close(); } catch {} _priceWs = null; }
  }

  function _priceWsSubscribe(sym) {
    const c = _hlCoin(sym);
    _priceWsCoins = new Set([c]);
    if (_priceWs?.readyState === WebSocket.OPEN) {
      _priceWs.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'bbo', coin: c } }));
    } else {
      _priceWsConnect();
    }
  }

  /* ════════════════════════════════════════
     TradingView DataFeed — القلب
  ════════════════════════════════════════ */
  function _buildDatafeed(sym) {

    const hlCoin   = _hlCoin(sym);
    const isGr     = _isGram(sym);
    const assetCfg = _ai(sym);

    /* ── Candle WebSocket للـ DataFeed ── */
    let _candleWs      = null;
    let _candleWsTimer = null;
    let _candleCallback = null;  // subscribeBars callback
    let _lastBarTime    = 0;

    function _cwConnect(iv, cb) {
      _cwClose();
      _candleCallback = cb;
      try {
        _candleWs = new WebSocket('wss://api.hyperliquid.xyz/ws');
        _candleWs.onopen = () => {
          _candleWs.send(JSON.stringify({
            method: 'subscribe',
            subscription: { type: 'candle', coin: hlCoin, interval: IV_MAP[iv] || '1h' }
          }));
        };
        _candleWs.onmessage = e => {
          try {
            const msg = JSON.parse(e.data);
            if (msg.channel !== 'candle' || !msg.data || !_candleCallback) return;
            const c = msg.data;
            /* HL candle WebSocket يعطي t بالـ milliseconds */
            const tMs = typeof c.t === 'number' && c.t > 1e12 ? c.t : c.t * 1000;
            const bar = {
              time:   tMs,
              open:   isGr ? +c.o / TROY : +c.o,
              high:   isGr ? +c.h / TROY : +c.h,
              low:    isGr ? +c.l / TROY : +c.l,
              close:  isGr ? +c.c / TROY : +c.c,
              volume: +c.v || 0,
            };
            if (bar.time > 0 && bar.close > 0) {
              _lastBarTime = bar.time;
              _candleCallback(bar);
            }
          } catch {}
        };
        _candleWs.onerror = () => {};
        _candleWs.onclose = () => {
          if (_visible && _candleCallback)
            _candleWsTimer = setTimeout(() => _cwConnect(iv, _candleCallback), 5000);
        };
      } catch {}
    }

    function _cwClose() {
      clearTimeout(_candleWsTimer);
      if (_candleWs) { try { _candleWs.close(); } catch {} _candleWs = null; }
      _candleCallback = null;
    }

    /* ── getBars — جلب التاريخ مباشرة ── */
    async function _getBars(periodParams) {
      const { from, to, countBack, firstDataRequest } = periodParams;

      /* 
        TradingView يرسل from/to بالـ seconds.
        نحوّل إلى ms للـ API.
        MIN_2020 يمنع طلبات قبل 2020.
      */
      const toMs   = Math.min(to * 1000, Date.now() + 5000);
      const fromMs = Math.max(from * 1000, MIN_2020);

      if (fromMs >= toMs) return { bars: [], meta: { noData: true } };

      try {
        const r = await fetch(HL_API + '/info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'candleSnapshot',
            req: {
              coin:      hlCoin,
              interval:  IV_MAP[_interval] || '1h',
              startTime: fromMs,
              endTime:   toMs,
            }
          })
        });

        if (!r.ok) return { bars: [], meta: { noData: true } };

        const raw = await r.json();
        if (!Array.isArray(raw) || !raw.length) {
          return { bars: [], meta: { noData: true } };
        }

        /* 
          REST candleSnapshot: c.t = milliseconds
          نحوّل إلى ms مضمون (auto-detect)
        */
        const bars = raw
          .map(c => {
            const tMs = typeof c.t === 'number' && c.t > 1e12 ? c.t : c.t * 1000;
            return {
              time:   tMs,
              open:   isGr ? +c.o / TROY : +c.o,
              high:   isGr ? +c.h / TROY : +c.h,
              low:    isGr ? +c.l / TROY : +c.l,
              close:  isGr ? +c.c / TROY : +c.c,
              volume: +c.v || 0,
            };
          })
          .filter(b => b.time >= MIN_2020 && b.time <= toMs + 86400000 && b.close > 0)
          .sort((a, b) => a.time - b.time);

        /* إزالة الـ duplicates */
        const seen  = new Set();
        const dedup = bars.filter(b => {
          if (seen.has(b.time)) return false;
          seen.add(b.time); return true;
        });

        if (!dedup.length) return { bars: [], meta: { noData: true } };

        /* آخر سعر */
        _setPrice(sym, isGr ? dedup[dedup.length-1].close * TROY : dedup[dedup.length-1].close);

        return {
          bars: dedup,
          meta: { noData: false }
        };
      } catch (err) {
        console.warn('[TV DataFeed getBars]', err.message);
        return { bars: [], meta: { noData: true } };
      }
    }

    /* ── DataFeed Object ── */
    return {
      onReady(cb) {
        setTimeout(() => cb({
          supported_resolutions:    ['1','3','5','15','30','60','240','1D','1W'],
          supports_search:          false,
          supports_group_request:   false,
          supports_marks:           false,
          supports_timescale_marks: false,
          supports_time:            false,
          exchanges:                [{ value:'HL', name:'Hyperliquid', desc:'Hyperliquid Perps' }],
          symbols_types:            [{ name:'Perpetual', value:'perpetual' }],
        }), 0);
      },

      searchSymbols() {},

      resolveSymbol(symbolName, onResolved, onError) {
        const a  = _ai(sym);
        const dp = a.pxDp || 2;

        /* pricescale = 10^dp */
        const pricescale = Math.pow(10, dp);

        setTimeout(() => onResolved({
          name:                        sym,
          ticker:                      sym,
          description:                 a.name || sym,
          type:                        'crypto',
          session:                     '24x7',
          /*
           * ✅ CRITICAL:
           * resolveSymbol timezone MUST be 'Etc/UTC'.
           * timezone هنا يخبر TV كيف تفسر timestamps من الـ DataFeed.
           * timestamps يجب أن تكون UTC milliseconds دائماً.
           * عرض UTC+3 يتم عبر widget timezone option — مستقل تماماً.
           */
          timezone:                    'Etc/UTC',
          minmov:                      1,
          pricescale:                  pricescale,
          has_intraday:                true,
          has_daily:                   true,
          has_weekly_and_monthly:      false,
          intraday_multipliers:        ['1','3','5','15','30','60','240'],
          supported_resolutions:       ['1','3','5','15','30','60','240','1D','1W'],
          volume_precision:            4,
          data_status:                 'streaming',
          exchange:                    'Hyperliquid',
          listed_exchange:             'Hyperliquid',
          format:                      'price',
        }), 0);
      },

      getBars(symbolInfo, resolution, periodParams, onHistoryCallback, onErrorCallback) {
        _interval = resolution;
        _getBars(periodParams).then(result => {
          onHistoryCallback(result.bars, result.meta);
        }).catch(err => {
          console.error('[TV getBars]', err);
          onErrorCallback(err.message);
        });
      },

      subscribeBars(symbolInfo, resolution, onRealtimeCallback, subscriberUID) {
        /* سجّل callback ثم ابدأ candle WS */
        _cwConnect(resolution, bar => {
          onRealtimeCallback(bar);
          /* حدّث سعر الواجهة */
          _setPrice(sym, isGr ? bar.close * TROY : bar.close);
        });
      },

      unsubscribeBars(subscriberUID) {
        _cwClose();
      },

      calculateHistoryDepth(resolution, resolutionBack, intervalBack) {
        return undefined;
      },
    };
  }

  /* ════════════════════════════════════════
     إنشاء TradingView Widget
  ════════════════════════════════════════ */
  function _buildWidget(sym, iv, containerId) {
    if (!window.TradingView) {
      console.error('[chart.js] TradingView library not loaded');
      return null;
    }

    const isDark = !document.documentElement.getAttribute('data-theme') ||
                   document.documentElement.getAttribute('data-theme') === 'dark';

    return new window.TradingView.widget({
      /* ── Container ── */
      container:        containerId,
      autosize:         true,

      /* ── Symbol & Interval ── */
      symbol:           sym,
      interval:         iv,

      /* ── Library ── */
      library_path:     '/charting_library/',
      locale:           'en',     // 'ar' يكسر TV rendering مع RTL
      datafeed:         _buildDatafeed(sym),

      /* ── Timezone — عرض UTC+3 ── */
      timezone:         'Asia/Baghdad',

      /* ── Theme ── */
      theme:            isDark ? 'Dark' : 'Light',
      custom_css_url:   '',

      /* ── Chart Type: Candles ── */
      studies_overrides: {},

      overrides: {
        /* شموع بألوان AMOLED */
        'mainSeriesProperties.candleStyle.upColor':         '#00e676',
        'mainSeriesProperties.candleStyle.downColor':       '#ff3d3d',
        'mainSeriesProperties.candleStyle.drawBorder':      true,
        'mainSeriesProperties.candleStyle.borderUpColor':   '#00e676',
        'mainSeriesProperties.candleStyle.borderDownColor': '#ff3d3d',
        'mainSeriesProperties.candleStyle.wickUpColor':     '#00e676',
        'mainSeriesProperties.candleStyle.wickDownColor':   '#ff3d3d',
        /* Background */
        'paneProperties.background':                        isDark ? '#000000' : '#ffffff',
        'paneProperties.backgroundType':                    'solid',
        'paneProperties.gridProperties.color':              isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
        /* Crosshair */
        'paneProperties.crossHairProperties.color':        '#888888',
        'paneProperties.crossHairProperties.style':         2,
        /* Price line */
        'mainSeriesProperties.showPriceLine':               true,
      },

      /* ── Features ── */
      disabled_features: [
        'header_widget',           // استخدم headerنا المخصص
        'left_toolbar',
        'context_menus',
        'control_bar',
        'timeframes_toolbar',
        'legend_widget',
        'volume_force_overlay',
        'create_volume_indicator_by_default',
        'display_market_status',
        'symbol_info',
        'compare_symbol',
        'border_around_the_chart',
        'header_saveload',
        'header_screenshot',
        'header_fullscreen_button',
        'header_compare',
        'header_undo_redo',
        'header_settings',
        'header_indicators',
        'header_chart_type',
        'header_resolutions',
        'header_symbol_search',
      ],
      enabled_features: [
        'use_localstorage_for_settings',
        'save_chart_properties_to_local_storage',
        'move_logo_to_main_pane',
      ],

      /* ── Loading Screen ── */
      loading_screen: { backgroundColor: isDark ? '#000000' : '#ffffff' },

      charts_storage_url:       null,
      client_id:                'suyula_trading',
      user_id:                  'trader',
      fullscreen:               false,
      debug:                    false,
    });
  }

  /* ════════════════════════════════════════
     Trade Bar
  ════════════════════════════════════════ */
  function _buildTradeBar() {
    document.getElementById('_tvTrade')?.remove();
    const a  = _ai(_sym);
    const ps = (a.presets || [1, 2, 5]).slice(0, 3);
    const bar = document.createElement('div');
    bar.id = '_tvTrade'; bar.className = 'tv-trade';
    bar.innerHTML = `
      <button class="tv-btn-trade tv-btn-sell" id="_tvSell">
        <span class="tv-btn-dir">▼ بيع</span>
        <span class="tv-btn-px" id="_tvSellPx">—</span>
      </button>
      <div class="tv-qty-wrap">
        <span class="tv-qty-label">الكمية</span>
        <div class="tv-qty-row">
          <input class="tv-qty-in" id="_tvQty" type="number"
            value="${ps[0]}" min="0" step="any" inputmode="decimal">
          <span class="tv-qty-unit">${a.unit}</span>
        </div>
        <div class="tv-presets">
          ${ps.map((v,i) => `<button class="tv-preset${i===0?' active':''}" data-v="${v}">${v}</button>`).join('')}
        </div>
      </div>
      <button class="tv-btn-trade tv-btn-buy" id="_tvBuy">
        <span class="tv-btn-dir">▲ شراء</span>
        <span class="tv-btn-px" id="_tvBuyPx">—</span>
      </button>`;

    const screen = document.getElementById('chartScreen');
    const tvC    = document.getElementById('_tvC');
    if (screen && tvC) screen.insertBefore(bar, tvC);

    bar.querySelectorAll('.tv-preset').forEach(b => {
      b.onclick = () => {
        bar.querySelectorAll('.tv-preset').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        const inp = document.getElementById('_tvQty');
        if (inp) inp.value = b.dataset.v;
      };
    });
    document.getElementById('_tvQty').oninput = () =>
      bar.querySelectorAll('.tv-preset').forEach(x => x.classList.remove('active'));

    document.getElementById('_tvBuy').onclick  = () => _showCf(true);
    document.getElementById('_tvSell').onclick = () => _showCf(false);

    /* السعر الأولي */
    if (typeof State !== 'undefined') {
      const p = State.prices?.[_sym]?.mid;
      if (p) _updateBtnPx(_sym, p);
    }
  }

  /* ════════════════════════════════════════
     Confirmation Sheet
  ════════════════════════════════════════ */
  function _showCf(isBuy) {
    if (typeof State === 'undefined' || !State.wallet)
      return (typeof toast !== 'undefined') && toast('سجّل الدخول أولاً', 'err');

    const qty = parseFloat(document.getElementById('_tvQty')?.value || 0);
    if (!qty || qty <= 0) return (typeof toast !== 'undefined') && toast('أدخل الكمية', 'err');

    const a     = _ai(_sym);
    const isGr  = _isGram(_sym);
    const mid   = _lastClose || (typeof State !== 'undefined' ? State.prices?.[_sym]?.mid : 0) || 0;
    if (!mid) return (typeof toast !== 'undefined') && toast('لا يوجد سعر', 'err');

    const midOz = _ozPrice(_sym, mid);
    const qtyOz = isGr ? qty / TROY : qty;
    const usd   = (midOz * qtyOz).toFixed(2);
    const mgn   = (midOz * qtyOz / a.lev).toFixed(2);
    const liqOz = isBuy ? midOz * (1 - 1/a.lev) : midOz * (1 + 1/a.lev);
    const liqD  = _dispPrice(_sym, liqOz).toFixed(a.pxDp);

    _hideCf();
    const screen = document.getElementById('chartScreen');
    if (!screen) return;
    const ov = document.createElement('div');
    ov.id = '_tvCf'; ov.className = 'tv-cf-ov';
    ov.innerHTML = `
      <div class="tv-cf-card">
        <div class="tv-cf-hdl"></div>
        <div class="tv-cf-title" style="color:${isBuy?'#00e676':'#ff3d3d'}">${a.icon} ${isBuy?'شراء ▲':'بيع ▼'} — ${a.name}</div>
        <div class="tv-cf-sub">رافعة ${a.lev}x · تأكيد قبل التنفيذ</div>
        <div class="tv-cf-rows">
          <div class="tv-cf-row"><span class="tv-cf-key">الكمية</span><span class="tv-cf-val">${qty.toFixed(a.szDp)} ${a.unit}</span></div>
          <div class="tv-cf-row"><span class="tv-cf-key">السعر</span><span class="tv-cf-val">$${mid.toFixed(a.pxDp)}</span></div>
          <div class="tv-cf-row"><span class="tv-cf-key">القيمة</span><span class="tv-cf-val">≈ $${usd}</span></div>
          <div class="tv-cf-row"><span class="tv-cf-key">الهامش</span><span class="tv-cf-val w">≈ $${mgn}</span></div>
          <div class="tv-cf-row"><span class="tv-cf-key">التصفية</span><span class="tv-cf-val ${isBuy?'r':'g'}">${liqD} $</span></div>
        </div>
        <div class="tv-cf-btns">
          <button class="tv-cf-cancel" id="_tvCfC">إلغاء ✕</button>
          <button class="tv-cf-exec ${isBuy?'g':'r'}" id="_tvCfX">${isBuy?'✅ تأكيد الشراء':'✅ تأكيد البيع'}</button>
        </div>
      </div>`;
    screen.appendChild(ov);
    ov.onclick = e => { if (e.target === ov) _hideCf(); };
    document.getElementById('_tvCfC').onclick = _hideCf;
    document.getElementById('_tvCfX').onclick = () =>
      typeof requirePin !== 'undefined' ? requirePin(() => _execTrade(isBuy, qty)) : _execTrade(isBuy, qty);
  }

  function _hideCf() { document.getElementById('_tvCf')?.remove(); }

  async function _execTrade(isBuy, qty) {
    if (!State?.wallet) return;
    const btn = document.getElementById('_tvCfX');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="tv-spin"></span>'; }
    const isGr  = _isGram(_sym);
    const aApi  = isGr ? (typeof ASSETS !== 'undefined' && ASSETS['GOLD']) || _ai('GOLD') : _ai(_sym);
    const mid   = _lastClose || State.prices?.[_sym]?.mid || 0;
    const midOz = _ozPrice(_sym, mid);
    if (!midOz) { _hideCf(); return; }
    const qtyOz = isGr ? qty / TROY : qty;
    try {
      try {
        await hlExchange({ type:'updateLeverage', asset:aApi.idx, isCross:aApi.cross, leverage:aApi.lev });
      } catch {}
      await hlExchange({
        type: 'order',
        orders: [{
          a: aApi.idx, b: isBuy,
          p: wirePx(midOz * (isBuy ? 1.02 : 0.98), aApi.szDp),
          s: wireSz(qtyOz, aApi.szDp),
          r: false, t: { limit: { tif: 'Ioc' } }
        }],
        grouping: 'na'
      });
      _hideCf();
      const disp = isGr ? qty.toFixed(2)+' غرام' : qty.toFixed(aApi.szDp)+' '+(aApi.unit||'');
      if (typeof toast !== 'undefined')
        toast(`✅ ${aApi.icon} ${isBuy?'شراء':'بيع'} ${disp}`, 'ok', 4000);
      if (typeof pollAccount !== 'undefined') setTimeout(pollAccount, 2000);
    } catch(e) {
      if (typeof toast !== 'undefined')
        toast((typeof tradeErr !== 'undefined' ? tradeErr(e.message) : '❌ '+e.message.slice(0,100)), 'err', 5000);
      if (btn) { btn.disabled=false; btn.innerHTML=isBuy?'✅ تأكيد الشراء':'✅ تأكيد البيع'; }
    }
  }

  /* ════════════════════════════════════════
     الشاشة (DOM)
  ════════════════════════════════════════ */
  function _ensureScreen() {
    const screen = document.getElementById('chartScreen');
    if (!screen || document.getElementById('_tvNav')) return;

    screen.innerHTML = `
      <!-- Header -->
      <nav class="tv-nav" id="_tvNav">
        <div class="tv-nav-left">
          <button class="tv-back" id="_tvBack">← رجوع</button>
          <div class="tv-asset-badge">
            <span id="_tvIcon" class="tv-asset-icon">🛢</span>
            <span id="_tvName" class="tv-asset-name">—</span>
            <span id="_tvPrice" class="tv-price" data-prev="0">—</span>
          </div>
        </div>
        <div class="tv-nav-right">
          <div class="tv-ivs">
            <button class="tv-iv" data-iv="1">1m</button>
            <button class="tv-iv" data-iv="5">5m</button>
            <button class="tv-iv" data-iv="15">15m</button>
            <button class="tv-iv" data-iv="60">1H</button>
            <button class="tv-iv" data-iv="240">4H</button>
            <button class="tv-iv" data-iv="1D">1D</button>
          </div>
          <div class="tv-ws-dot connecting" id="_tvDot" title="Connecting..."></div>
        </div>
      </nav>
      <!-- TV Container — direction:ltr بالكود والـ CSS -->
      <div id="_tvC" style="flex:1;min-height:0;direction:ltr;"></div>`;

    /* أحداث الرأس */
    document.getElementById('_tvBack').onclick = () => ChartModule.close();
    document.querySelectorAll('.tv-iv').forEach(b =>
      b.onclick = () => ChartModule.switchInterval(b.dataset.iv)
    );
  }

  function _setHeader(sym) {
    const a = _ai(sym);
    const ic = document.getElementById('_tvIcon');
    const nm = document.getElementById('_tvName');
    if (ic) ic.textContent = a.icon;
    if (nm) nm.textContent = a.name;
    /* السعر الحالي من State */
    if (typeof State !== 'undefined') {
      const p = State.prices?.[sym]?.mid;
      if (p) { _lastClose = p; _updateBtnPx(sym, p); }
    }
  }

  function _setActiveIv(iv) {
    document.querySelectorAll('.tv-iv').forEach(b =>
      b.classList.toggle('active', b.dataset.iv === iv)
    );
  }

  /* ════════════════════════════════════════
     ساعة UTC+3
  ════════════════════════════════════════ */
  function _startClock() {
    _stopClock();
    _clockTimer = setInterval(() => {
      /* لا نعرض ساعة في الـ header الجديد — فقط refresh للسعر */
      if (typeof State !== 'undefined') {
        const p = State.prices?.[_sym]?.mid;
        if (p && p !== _lastClose) _setPrice(_sym, _isGram(_sym) ? p * TROY : p);
      }
    }, 1000);
  }
  function _stopClock() { clearInterval(_clockTimer); _clockTimer = null; }

  /* ════════════════════════════════════════
     API عامة
  ════════════════════════════════════════ */
  function open(sym) {
    _sym     = sym || (typeof State !== 'undefined' ? State.asset : 'CL') || 'CL';
    _interval = '60';
    _visible  = true;

    _ensureScreen();
    const screen = document.getElementById('chartScreen');
    if (screen) screen.classList.remove('hidden');

    _setHeader(_sym);
    _setActiveIv(_interval);
    _buildTradeBar();

    /* double rAF — ضمان أن الـ container له أبعاد قبل TV */
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (_widget) {
        try { _widget.remove?.(); } catch {}
        _widget = null;
      }
      const c = document.getElementById('_tvC');
      if (!c) return;
      c.innerHTML = '';
      _widget = _buildWidget(_sym, _interval, '_tvC');
    }));

    _setStatus('connecting', 'Connecting...');
    _priceWsSubscribe(_sym);
    _startClock();
  }

  function close() {
    _visible = false;
    _stopClock();
    _priceWsClose();
    _hideCf();

    if (document.fullscreenElement) document.exitFullscreen?.();
    const screen = document.getElementById('chartScreen');
    if (screen) screen.classList.add('hidden');

    /* لا نحذف widget — TV تحتفظ بالرسومات في localStorage */
  }

  function switchInterval(iv) {
    if (iv === _interval || !_widget) return;
    _interval = iv;
    _setActiveIv(iv);

    /* TV تغيير interval من خلال API الداخلية */
    try {
      _widget.chart?.().setResolution?.(iv, () => {});
    } catch {
      /* fallback: أعد بناء Widget */
      requestAnimationFrame(() => {
        if (_widget) { try { _widget.remove?.(); } catch {} _widget = null; }
        const c = document.getElementById('_tvC');
        if (c) { c.innerHTML = ''; _widget = _buildWidget(_sym, iv, '_tvC'); }
      });
    }
  }

  function switchAssetChart(sym) {
    if (!_visible || sym === _sym) return;
    _sym = sym;
    _setHeader(sym);
    _buildTradeBar();
    _priceWsSubscribe(sym);

    requestAnimationFrame(() => {
      if (_widget) { try { _widget.remove?.(); } catch {} _widget = null; }
      const c = document.getElementById('_tvC');
      if (c) {
        c.innerHTML = '';
        _widget = _buildWidget(sym, _interval, '_tvC');
      }
    });
  }

  function refreshLines() {
    /* TV خطوط TP/SL/Entry — تحتاج TV Chart API
       هذا يمكن توسيعه لاحقاً عبر _widget.chart().createOrderLine() */
  }

  return { open, close, switchInterval, switchAssetChart, refreshLines };
})();
