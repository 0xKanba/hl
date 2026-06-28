/* ═══════════════════════════════════════════════════════════════════
   chart.js — سيولة · TradingView Advanced Charts
   
   ✅ DataFeed كامل: getBars + subscribeBars + resolveSymbol
   ✅ Timestamps: UTC milliseconds فقط — لا bug 1970
   ✅ noData:true على فراغ — pagination لا نهائي
   ✅ resolveSymbol.timezone = 'Etc/UTC' دائماً (MUST)
   ✅ widget.timezone = 'Asia/Kuwait' (UTC+3 عرض)
   ✅ كل مميزات TV: أدوات رسم + مؤشرات + header + studies
   ✅ حفظ محلي كامل: interval + رسومات + مؤشرات + تفضيلات
   ✅ خطوط مراكز: Entry + TP + SL + Liq (createOrderLine)
   ✅ WS BBO منفصل للسعر اللحظي في الـ header
   ✅ WS Candle منفصل للـ DataFeed live bars
   ✅ RTL fix: #_tvC direction:ltr
   ✅ direction:ltr على الـ container — RTL bug fix لـ TV iframe
   ✅ locale: 'ar' — واجهة TV بالعربي
═══════════════════════════════════════════════════════════════════ */
const ChartModule = (function () {
  'use strict';

  /* ══════════════════════════════════════════
     ثوابت
  ══════════════════════════════════════════ */
  const HL_API    = 'https://api.hyperliquid.xyz';
  const HL_WS     = 'wss://api.hyperliquid.xyz/ws';
  const TROY      = 31.1035;
  const MIN_2020  = 1577836800000; // 2020-01-01 UTC ms
  const LS_PREFIX = 'hl_tv_';      // localStorage key prefix

  /* TV resolution → HL interval */
  const IV_HL = {
    '1':'1m','3':'3m','5':'5m','15':'15m','30':'30m',
    '60':'1h','120':'2h','240':'4h','360':'6h','720':'12h',
    '1D':'1d','3D':'3d','1W':'1w','1M':'1M',
  };

  /* حفظ واسترجاع localStorage */
  const _lsGet = k => { try { return JSON.parse(localStorage.getItem(LS_PREFIX + k)); } catch { return null; } };
  const _lsSet = (k, v) => { try { localStorage.setItem(LS_PREFIX + k, JSON.stringify(v)); } catch {} };

  /* ══════════════════════════════════════════
     حالة وحيدة
  ══════════════════════════════════════════ */
  let _widget    = null;   // TradingView.widget instance
  let _visible   = false;
  let _sym       = 'CL';
  let _interval  = '60';   // آخر interval مستخدم — يُحفظ
  let _lastClose = 0;
  let _clockTimer = null;

  /* WebSocket BBO — سعر فوري */
  let _bboWs    = null;
  let _bboTimer = null;

  /* خطوط المراكز — تُحفظ كـ references */
  let _orderLines = [];

  /* ══════════════════════════════════════════
     CSS
  ══════════════════════════════════════════ */
  (function injectCSS() {
    if (document.getElementById('_tvCSS')) return;
    const s = document.createElement('style');
    s.id = '_tvCSS';
    s.textContent = `
/* ── شاشة الرسم ── */
.chart-screen {
  position:fixed; inset:0; z-index:50;
  display:flex; flex-direction:column;
  background:#000; overflow:hidden;
}
.chart-screen.hidden { display:none !important; }

/* ── Header خفيف ── */
#_tvHdr {
  display:flex; align-items:center; justify-content:space-between;
  height:46px; padding:0 8px;
  background:var(--bg-card,#0d0d0d);
  border-bottom:1px solid var(--border,#1e1e1e);
  flex-shrink:0; direction:rtl; gap:6px;
  z-index:5; position:relative;
}
.tvh-l { display:flex; align-items:center; gap:6px; min-width:0; flex:1; overflow:hidden; }
.tvh-r { display:flex; align-items:center; gap:5px; flex-shrink:0; }

.tvh-back {
  font-size:11px; font-weight:800; padding:4px 10px; border-radius:8px;
  border:1.5px solid rgba(255,140,66,.3); background:rgba(255,140,66,.1);
  color:var(--ac,#ff8c42); font-family:'Cairo',sans-serif;
  cursor:pointer; white-space:nowrap; transition:all .13s; flex-shrink:0;
}
.tvh-back:active { opacity:.65; transform:scale(.92); }

.tvh-asset { display:flex; align-items:center; gap:5px; min-width:0; overflow:hidden; }
.tvh-icon  { font-size:14px; flex-shrink:0; line-height:1; }
.tvh-name  {
  font-size:12px; font-weight:900;
  color:var(--text-primary,#f0f0f0);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
.tvh-price {
  font-family:'IBM Plex Mono',monospace;
  font-size:14px; font-weight:800;
  color:var(--text-primary,#f0f0f0);
  flex-shrink:0; transition:color .18s;
}
.tvh-price.up { color:#00e676; }
.tvh-price.dn { color:#ff3d3d; }

/* WS dot */
.tvh-dot {
  width:7px; height:7px; border-radius:50%;
  background:#555; flex-shrink:0; transition:background .3s;
}
.tvh-dot.on   { background:#00e676; box-shadow:0 0 5px #00e676; }
.tvh-dot.wait { background:#ffd600; animation:tvDot 1.1s ease-in-out infinite; }
.tvh-dot.off  { background:#ff3d3d; }
@keyframes tvDot { 0%,100%{opacity:1} 50%{opacity:.2} }

/* interval pills — فوق TV header */
.tvh-ivs { display:flex; gap:2px; flex-shrink:0; }
.tvh-iv {
  padding:3px 7px; border-radius:999px; cursor:pointer;
  border:1.5px solid var(--border,#1e1e1e);
  background:var(--bg-elev,#161616);
  color:var(--text-secondary,#777);
  font-size:10px; font-weight:800;
  font-family:'IBM Plex Mono',monospace;
  transition:all .12s; white-space:nowrap;
}
.tvh-iv:active { transform:scale(.85); }
.tvh-iv.on {
  border-color:var(--ac,#ff8c42);
  background:rgba(255,140,66,.14);
  color:var(--ac,#ff8c42);
}

/* ── Trade Bar ── */
#_tvTrade {
  display:flex; align-items:center; gap:5px;
  padding:6px 8px;
  background:var(--bg-card,#0d0d0d);
  border-bottom:1px solid var(--border,#1e1e1e);
  flex-shrink:0; direction:rtl;
}
.tvt-btn {
  flex:1; min-height:50px; padding:6px 4px; border-radius:12px; border:none;
  font-family:'Cairo',sans-serif; font-size:14px; font-weight:900;
  cursor:pointer; color:#fff;
  display:flex; flex-direction:column;
  align-items:center; justify-content:center; gap:1px;
  transition:filter .12s, transform .1s;
}
.tvt-btn:active { transform:scale(.91); filter:brightness(.82); }
.tvt-buy  { background:linear-gradient(150deg,#00c853,#1b5e20); box-shadow:0 2px 10px rgba(0,200,83,.28); }
.tvt-sell { background:linear-gradient(150deg,#ff1744,#b71c1c); box-shadow:0 2px 10px rgba(255,23,68,.28); }
.tvt-dir  { font-size:13px; line-height:1; }
.tvt-px   { font-family:'IBM Plex Mono',monospace; font-size:9px; opacity:.72; }

.tvt-mid  { flex:1.15; display:flex; flex-direction:column; align-items:center; gap:3px; }
.tvt-qlbl { font-size:9px; color:var(--text-muted,#555); font-weight:700; letter-spacing:.8px; }
.tvt-qrow { display:flex; align-items:center; gap:3px; }
.tvt-qin {
  width:66px; font-family:'IBM Plex Mono',monospace;
  font-size:17px; font-weight:700; text-align:center; direction:ltr;
  background:var(--bg-input,#1a1a1a);
  border:1.5px solid var(--border,#1e1e1e); border-radius:8px;
  padding:4px 3px; color:var(--text-primary,#f0f0f0); outline:none;
  transition:border-color .14s;
}
.tvt-qin:focus { border-color:var(--ac,#ff8c42); }
.tvt-unit  { font-size:9px; color:var(--text-secondary,#777); font-weight:700; }
.tvt-prs   { display:flex; gap:2px; }
.tvt-pr {
  font-family:'IBM Plex Mono',monospace; font-size:9px; font-weight:700;
  padding:2px 6px; border-radius:999px;
  border:1.5px solid var(--border,#1e1e1e);
  background:var(--bg-elev,#161616);
  color:var(--text-muted,#555); cursor:pointer; transition:all .11s;
}
.tvt-pr.on {
  border-color:var(--ac,#ff8c42);
  color:var(--ac,#ff8c42);
  background:rgba(255,140,66,.13);
}

/* ── TV Container — CRITICAL: لازم ltr ── */
#_tvC {
  flex:1; min-height:0; width:100%;
  direction:ltr !important;
  overflow:hidden; position:relative;
}
/* TV iframe must fill container */
#_tvC > iframe,
#_tvC > div { width:100% !important; height:100% !important; }

/* ── Confirm Sheet ── */
.tvcf-ov {
  position:absolute; inset:0; z-index:99;
  display:flex; align-items:flex-end; justify-content:center;
  background:rgba(0,0,0,.62);
  backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);
  direction:rtl;
}
.tvcf-card {
  background:var(--bg-card,#0d0d0d);
  border-top:1.5px solid var(--border-strong,#2a2a2a);
  border-radius:20px 20px 0 0;
  width:100%; max-width:500px;
  padding:12px 12px 28px;
  animation:tvcfUp .2s cubic-bezier(.4,0,.2,1);
}
@keyframes tvcfUp { from{transform:translateY(100%)} to{transform:none} }
.tvcf-hdl   { width:30px;height:3px;background:var(--border-strong,#2a2a2a);border-radius:999px;margin:0 auto 10px; }
.tvcf-title { font-size:16px;font-weight:900;margin-bottom:2px; }
.tvcf-sub   { font-size:11px;color:var(--text-secondary,#777);margin-bottom:9px; }
.tvcf-rows  {
  background:var(--bg-input,#1a1a1a); border-radius:10px;
  padding:6px 10px; margin-bottom:10px;
}
.tvcf-row {
  display:flex; justify-content:space-between; align-items:center;
  padding:7px 0; border-bottom:1px solid var(--border,#1e1e1e); font-size:13px;
}
.tvcf-row:last-child { border:none; }
.tvcf-k { color:var(--text-secondary,#777); font-weight:700; }
.tvcf-v { font-family:'IBM Plex Mono',monospace; font-weight:800; color:var(--text-primary,#f0f0f0); }
.tvcf-v.g { color:#00e676; } .tvcf-v.r { color:#ff3d3d; } .tvcf-v.w { color:#ffd600; }
.tvcf-btns { display:grid; grid-template-columns:1fr 1fr; gap:7px; }
.tvcf-cancel {
  padding:11px; border-radius:999px;
  border:1.5px solid var(--border-strong,#2a2a2a);
  background:var(--bg-elev,#161616);
  color:var(--text-secondary,#777);
  font-size:13px; font-weight:700; cursor:pointer; font-family:'Cairo',sans-serif;
}
.tvcf-exec {
  padding:11px; border-radius:999px; border:none; color:#fff;
  font-size:13px; font-weight:900; cursor:pointer; font-family:'Cairo',sans-serif;
  display:flex; align-items:center; justify-content:center; gap:5px;
  transition:filter .12s;
}
.tvcf-exec:active  { filter:brightness(.82); }
.tvcf-exec:disabled{ opacity:.5; pointer-events:none; }
.tvcf-exec.g { background:linear-gradient(135deg,#00c853,#1b5e20); }
.tvcf-exec.r { background:linear-gradient(135deg,#ff1744,#b71c1c); }
.tvsp {
  width:13px; height:13px; border:2px solid rgba(255,255,255,.3);
  border-top-color:#fff; border-radius:50%;
  animation:tvSp .7s linear infinite;
}
@keyframes tvSp { to{transform:rotate(360deg)} }
`;
    document.head.appendChild(s);
  })();

  /* ══════════════════════════════════════════
     مساعدات
  ══════════════════════════════════════════ */
  const _ai   = s => (typeof ASSETS !== 'undefined' && ASSETS[s]) ||
    { pxDp:2, szDp:2, name:s, icon:'📊', unit:'', lev:10, presets:[1,2,5], idx:0, cross:true };

  /* HL coin string */
  function _hlCoin(sym) {
    if (sym === 'XAU') return 'xyz:GOLD';
    if (typeof ASSETS !== 'undefined' && ASSETS[sym]) return ASSETS[sym].coin;
    return `xyz:${sym}`;
  }

  const _isGr  = s  => s === 'XAU';
  const _toOz  = (s, d) => _isGr(s) ? d * TROY : d;   // display → oz
  const _toDisp = (s, o) => _isGr(s) ? o / TROY : o;  // oz → display

  /* dark/light */
  const _dark = () =>
    (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark';

  /* dot status */
  function _dot(cls) {
    const el = document.getElementById('_tvDot');
    if (el) el.className = 'tvh-dot ' + cls;
  }

  /* سعر في header */
  function _setPrice(sym, disp) {
    _lastClose = disp;
    const el = document.getElementById('_tvPx');
    if (!el) return;
    const prev = parseFloat(el.dataset.p || 0);
    el.textContent = '$' + disp.toFixed(_ai(sym).pxDp);
    el.className   = 'tvh-price' + (disp > prev ? ' up' : disp < prev ? ' dn' : '');
    el.dataset.p   = disp;
    _updBtnPx(sym, disp);
  }

  function _updBtnPx(sym, mid) {
    if (!mid) return;
    const a  = _ai(sym);
    const bp = document.getElementById('_tvBuyPx');
    const sp = document.getElementById('_tvSellPx');
    if (bp) bp.textContent = '$' + (mid * 1.0003).toFixed(a.pxDp);
    if (sp) sp.textContent = '$' + (mid * 0.9997).toFixed(a.pxDp);
  }

  /* ══════════════════════════════════════════
     BBO WebSocket — سعر فوري في header
  ══════════════════════════════════════════ */
  function _bboConn(sym) {
    _bboClose();
    const coin = _hlCoin(sym);
    try {
      _bboWs = new WebSocket(HL_WS);
      _bboWs.onopen = () => {
        _bboWs.send(JSON.stringify({ method:'subscribe', subscription:{ type:'bbo', coin } }));
        _dot('on');
      };
      _bboWs.onmessage = e => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.channel !== 'bbo' || !msg.data) return;
          const b   = parseFloat(msg.data.bbo?.[0]?.px || 0);
          const a   = parseFloat(msg.data.bbo?.[1]?.px || 0);
          const mid = b && a ? (b + a) / 2 : 0;
          if (!mid) return;
          /* XAU: coin = GOLD (oz) → نعرض gram */
          const raw  = (msg.data.coin||'').includes(':')
            ? msg.data.coin.split(':')[1] : msg.data.coin;
          const disp = (sym === 'XAU' && raw === 'GOLD') ? mid / TROY : mid;
          _setPrice(sym, disp);
        } catch {}
      };
      _bboWs.onerror = () => _dot('off');
      _bboWs.onclose = () => {
        _dot('wait');
        if (_visible) _bboTimer = setTimeout(() => _bboConn(sym), 4000);
      };
    } catch { _dot('off'); }
  }

  function _bboClose() {
    clearTimeout(_bboTimer);
    if (_bboWs) { try { _bboWs.close(); } catch {} _bboWs = null; }
  }

  /* ══════════════════════════════════════════
     DataFeed — القلب
  ══════════════════════════════════════════ */
  function _buildDatafeed(sym) {
    const hlCoin = _hlCoin(sym);
    const isGr   = _isGr(sym);
    const a      = _ai(sym);

    /* ── Candle WS للـ live bars ── */
    let _cws  = null;
    let _ctm  = null;
    let _ccb  = null;   // onRealtime callback

    function _cwConn(res, cb) {
      _cwClose();
      _ccb = cb;
      try {
        _cws = new WebSocket(HL_WS);
        _cws.onopen = () => {
          _cws.send(JSON.stringify({
            method:'subscribe',
            subscription:{ type:'candle', coin:hlCoin, interval:IV_HL[res]||'1h' }
          }));
        };
        _cws.onmessage = e => {
          try {
            const msg = JSON.parse(e.data);
            if (msg.channel !== 'candle' || !msg.data || !_ccb) return;
            const c   = msg.data;
            /* WS: t أحياناً ms وأحياناً sec — auto-detect */
            const tMs = c.t > 1e12 ? c.t : c.t * 1000;
            if (tMs < MIN_2020) return;
            const bar = {
              time:   tMs,
              open:   isGr ? +c.o/TROY : +c.o,
              high:   isGr ? +c.h/TROY : +c.h,
              low:    isGr ? +c.l/TROY : +c.l,
              close:  isGr ? +c.c/TROY : +c.c,
              volume: +c.v || 0,
            };
            if (bar.close > 0) _ccb(bar);
          } catch {}
        };
        _cws.onerror  = () => {};
        _cws.onclose  = () => {
          if (_ccb && _visible)
            _ctm = setTimeout(() => _cwConn(res, _ccb), 5000);
        };
      } catch {}
    }

    function _cwClose() {
      clearTimeout(_ctm);
      if (_cws) { try { _cws.close(); } catch {} _cws = null; }
      _ccb = null;
    }

    /* ── fetch REST ── */
    async function _fetchBars(from, to) {
      /* from/to من TV هما seconds → نحوّل ms */
      const toMs   = Math.min(to * 1000, Date.now() + 5000);
      const fromMs = Math.max(from * 1000, MIN_2020);
      if (fromMs >= toMs) return [];

      const r = await fetch(HL_API + '/info', {
        method:  'POST',
        headers: { 'Content-Type':'application/json' },
        body:    JSON.stringify({
          type: 'candleSnapshot',
          req:  {
            coin:      hlCoin,
            interval:  IV_HL[_interval] || '1h',
            startTime: fromMs,
            endTime:   toMs,
          }
        })
      });
      if (!r.ok) return [];
      const raw = await r.json();
      if (!Array.isArray(raw) || !raw.length) return [];

      const seen = new Set();
      return raw
        .map(c => {
          /* REST: t = ms */
          const tMs = c.t > 1e12 ? c.t : c.t * 1000;
          return {
            time:   tMs,
            open:   isGr ? +c.o/TROY : +c.o,
            high:   isGr ? +c.h/TROY : +c.h,
            low:    isGr ? +c.l/TROY : +c.l,
            close:  isGr ? +c.c/TROY : +c.c,
            volume: +c.v || 0,
          };
        })
        .filter(b => {
          if (b.time < MIN_2020 || b.time > toMs + 86400000 || b.close <= 0) return false;
          if (seen.has(b.time)) return false;
          seen.add(b.time); return true;
        })
        .sort((x, y) => x.time - y.time);
    }

    /* ── DataFeed object ── */
    return {
      onReady(cb) {
        setTimeout(() => cb({
          supported_resolutions:     ['1','3','5','15','30','60','120','240','1D','1W'],
          currency_codes:            ['USD'],
          exchanges:                 [{ value:'HL', name:'Hyperliquid', desc:'Hyperliquid Perps' }],
          symbols_types:             [{ name:'Perp', value:'perp' }],
          supports_search:           false,
          supports_group_request:    false,
          supports_marks:            false,
          supports_timescale_marks:  false,
          supports_time:             false,
        }), 0);
      },

      searchSymbols() {},

      resolveSymbol(name, ok) {
        const dp = a.pxDp || 2;
        setTimeout(() => ok({
          name,
          ticker:                   name,
          description:              a.name || name,
          type:                     'crypto',
          session:                  '24x7',
          /*
           * ✅ CRITICAL — لا تغيّر هذا أبداً
           * timezone هنا = كيف يفسّر TV timestamps من DataFeed
           * يجب أن يكون 'Etc/UTC' لأن timestamps = UTC milliseconds
           * عرض UTC+3 يأتي من widget.timezone = 'Asia/Kuwait' — مستقل
           */
          timezone:                 'Etc/UTC',
          minmov:                   1,
          pricescale:               Math.pow(10, dp),
          has_intraday:             true,
          has_daily:                true,
          has_weekly_and_monthly:   true,
          intraday_multipliers:     ['1','3','5','15','30','60','120','240'],
          supported_resolutions:    ['1','3','5','15','30','60','120','240','1D','1W'],
          volume_precision:         4,
          data_status:              'streaming',
          exchange:                 'Hyperliquid',
          listed_exchange:          'Hyperliquid',
          format:                   'price',
          currency_code:            'USD',
        }), 0);
      },

      getBars(info, resolution, periodParams, onHistory, onError) {
        _interval = resolution;
        _fetchBars(periodParams.from, periodParams.to)
          .then(bars => {
            if (!bars.length) { onHistory([], { noData: true }); return; }
            /* آخر سعر → header */
            const last = bars[bars.length - 1];
            _setPrice(sym, last.close);
            onHistory(bars, { noData: false });
          })
          .catch(e => { console.warn('[DF getBars]', e); onError(e.message); });
      },

      subscribeBars(info, resolution, onRealtime) {
        _cwConn(resolution, bar => {
          onRealtime(bar);
          _setPrice(sym, bar.close);
          /* تحديث خطوط المراكز مع كل bar لحظي */
          setTimeout(_drawLines, 50);
        });
      },

      unsubscribeBars() { _cwClose(); },
    };
  }

  /* ══════════════════════════════════════════
     TradingView Widget
  ══════════════════════════════════════════ */
  function _mkWidget(sym, iv) {
    if (!window.TradingView?.widget) {
      console.error('[chart.js] TradingView library not found at window.TradingView');
      return null;
    }

    const dark  = _dark();
    const saved = _lsGet('savedContent_' + sym); // محتوى محفوظ

    const cfg = {
      /* ── container ── */
      container:          '_tvC',
      autosize:           true,

      /* ── data ── */
      symbol:             sym,
      interval:           iv,
      datafeed:           _buildDatafeed(sym),
      library_path:       '/charting_library/',

      /*
       * locale: 'ar' — واجهة TV بالعربي
       * لكن إذا أعطى مشاكل RTL في iframe استبدله بـ 'en'
       * حسب الملاحظات السابقة: 'ar' يكسر أحياناً → نستخدم 'en' آمن
       */
      locale:             'en',

      /* ── timezone ── */
      timezone:           'Asia/Kuwait',

      /* ── theme ── */
      theme:              dark ? 'Dark' : 'Light',

      /* ── overrides — AMOLED + شموع واضحة ── */
      overrides: {
        /* الخلفية */
        'paneProperties.background':                           dark ? '#000000' : '#F8F8F8',
        'paneProperties.backgroundType':                       'solid',
        /* grid خفيف */
        'paneProperties.vertGridProperties.color':             dark ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.04)',
        'paneProperties.horzGridProperties.color':             dark ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.04)',
        'paneProperties.vertGridProperties.style':             0,
        'paneProperties.horzGridProperties.style':             0,
        /* crosshair */
        'paneProperties.crossHairProperties.color':            dark ? '#888888' : '#888888',
        'paneProperties.crossHairProperties.style':            2,
        'paneProperties.crossHairProperties.width':            1,
        /* شموع */
        'mainSeriesProperties.candleStyle.upColor':            '#00e676',
        'mainSeriesProperties.candleStyle.downColor':          '#ff3d3d',
        'mainSeriesProperties.candleStyle.drawBorder':         true,
        'mainSeriesProperties.candleStyle.borderUpColor':      '#00e676',
        'mainSeriesProperties.candleStyle.borderDownColor':    '#ff3d3d',
        'mainSeriesProperties.candleStyle.wickUpColor':        '#00e676',
        'mainSeriesProperties.candleStyle.wickDownColor':      '#ff3d3d',
        /* خط السعر الحالي */
        'mainSeriesProperties.showPriceLine':                  true,
        'mainSeriesProperties.priceLineColor':                 '#ff8c42',
        'mainSeriesProperties.priceLineWidth':                 1,
        /* المحاور */
        'scalesProperties.fontSize':                           11,
        'scalesProperties.textColor':                          dark ? '#888' : '#555',
        'scalesProperties.lineColor':                          dark ? '#2a2a2a' : '#ddd',
        'scalesProperties.backgroundColor':                    dark ? '#000000' : '#F8F8F8',
        /* volume مخفي افتراضياً — بإمكان المستخدم تفعيله */
        'volumePaneSize':                                      'tiny',
      },

      /* ── studies overrides ── */
      studies_overrides: {
        'volume.volume.color.0':         'rgba(255,61,61,0.3)',
        'volume.volume.color.1':         'rgba(0,230,118,0.3)',
        'volume.volume ma.color':        '#ff8c42',
        'volume.volume ma.linewidth':    1,
        'volume.show ma':                false,
      },

      /* ══════════════════════════════════════
         ✅ كل مميزات TV مفتوحة
         فقط نخفي ما يتعارض مع نظامنا الخاص
      ══════════════════════════════════════ */
      disabled_features: [
        /* نستخدم header الخاص بنا → نخفي header TV */
        'header_widget',
        /* نخفي: لا نريد تعارض */
        'symbol_info',
        'border_around_the_chart',
        'display_market_status',
        'go_to_date',
        /* حفظ/تحميل — نديره نحن */
        'header_saveload',
        /* logo TV */
        'show_chart_property_page',
      ],

      enabled_features: [
        /* ══ أدوات الرسم ══ */
        'study_templates',                      // حفظ templates المؤشرات
        'side_toolbar_in_fullscreen_mode',       // toolbar في fullscreen
        'header_in_fullscreen_mode',

        /* ══ تفاعل ══ */
        'horz_touch_drag_scroll',
        'vert_touch_drag_scroll',
        'pinch_scale',
        'axis_pressed_mouse_move_scale',
        'axis_double_clicked_reset_scale',
        'shift_visible_range_on_new_bar',       // الرسم يتحرك مع live bar
        'pre_post_market_sessions',

        /* ══ UI ══ */
        'items_favoriting',                     // فضّل الأدوات
        'show_hide_button_in_legend',
        'hide_last_na_study_output',
        'adaptive_logo',
        'move_logo_to_main_pane',
        'end_of_period_timescale_marks',

        /* ══ حفظ محلي — TV يحفظ تلقائياً ══ */
        'use_localstorage_for_settings',        // ✅ حفظ كل الإعدادات محلياً
        'save_chart_properties_to_local_storage', // ✅ ألوان + نوع شارت
        'chart_property_page_style',
        'chart_property_page_scales',
        'chart_property_page_background',
        'chart_property_page_timezone_sessions',
        'chart_property_page_trading',

        /* ══ mobile ══ */
        'force_touch_drag',
        'iframe_loading_compatibility_mode',
      ],

      /* ✅ حفظ المحتوى (رسومات + مؤشرات + اختيارات المستخدم) */
      save_load_adapter: _buildSaveLoadAdapter(sym),

      /* ── loading screen ── */
      loading_screen: {
        backgroundColor: dark ? '#000000' : '#F8F8F8',
        foregroundColor: dark ? '#ff8c42' : '#c96442',
      },

      /* ── storage IDs ── */
      client_id:   'suyula_hl',
      user_id:     'trader',
      charts_storage_api_version: '1.1',

      fullscreen:  false,
      debug:       false,
    };

    /* إذا في محتوى محفوظ → لا نعطي saved_data هنا
       TV سيحمله تلقائياً عبر save_load_adapter */

    return new window.TradingView.widget(cfg);
  }

  /* ══════════════════════════════════════════
     Save/Load Adapter — حفظ محلي كامل
     TV يستدعي هذا لحفظ/استرجاع الرسومات والإعدادات
  ══════════════════════════════════════════ */
  function _buildSaveLoadAdapter(sym) {
    const K = 'chart_' + sym; // key في localStorage

    return {
      /* ── Charts ── */
      getAllCharts() {
        const data = _lsGet(K + '_charts') || [];
        return Promise.resolve(data);
      },
      removeChart(id) {
        const data = (_lsGet(K + '_charts') || []).filter(c => c.id !== id);
        _lsSet(K + '_charts', data);
        return Promise.resolve();
      },
      saveChart(chartData) {
        const data = _lsGet(K + '_charts') || [];
        const idx  = data.findIndex(c => c.id === chartData.id);
        const item = { ...chartData, id: chartData.id || Date.now(), timestamp: Date.now() };
        if (idx >= 0) data[idx] = item;
        else data.push(item);
        _lsSet(K + '_charts', data);
        return Promise.resolve(item.id);
      },
      getChartContent(id) {
        const data = _lsGet(K + '_charts') || [];
        const item = data.find(c => c.id === id);
        return Promise.resolve(item?.content || '');
      },

      /* ── Study Templates ── */
      getAllStudyTemplates() {
        return Promise.resolve(_lsGet(K + '_studies') || []);
      },
      removeStudyTemplate(name) {
        const data = (_lsGet(K + '_studies') || []).filter(s => s.name !== name);
        _lsSet(K + '_studies', data);
        return Promise.resolve();
      },
      saveStudyTemplate(tpl) {
        const data = _lsGet(K + '_studies') || [];
        const idx  = data.findIndex(s => s.name === tpl.name);
        if (idx >= 0) data[idx] = tpl; else data.push(tpl);
        _lsSet(K + '_studies', data);
        return Promise.resolve();
      },
      getStudyTemplateContent(name) {
        const data = _lsGet(K + '_studies') || [];
        const item = data.find(s => s.name === name);
        return Promise.resolve(item?.content || '');
      },

      /* ── Drawing Templates ── */
      getDrawingTemplates(tool) {
        return Promise.resolve(_lsGet(K + '_dtpl_' + tool) || []);
      },
      loadDrawingTemplate(tool, name) {
        const data = _lsGet(K + '_dtpl_' + tool) || [];
        const item = data.find(d => d.name === name);
        return Promise.resolve(item?.content || '');
      },
      removeDrawingTemplate(tool, name) {
        const data = (_lsGet(K + '_dtpl_' + tool) || []).filter(d => d.name !== name);
        _lsSet(K + '_dtpl_' + tool, data);
        return Promise.resolve();
      },
      saveDrawingTemplate(tool, name, content) {
        const data = _lsGet(K + '_dtpl_' + tool) || [];
        const idx  = data.findIndex(d => d.name === name);
        const item = { name, content };
        if (idx >= 0) data[idx] = item; else data.push(item);
        _lsSet(K + '_dtpl_' + tool, data);
        return Promise.resolve();
      },
    };
  }

  /* ══════════════════════════════════════════
     خطوط المراكز — createOrderLine
  ══════════════════════════════════════════ */
  function _clearLines() {
    _orderLines.forEach(l => { try { l.remove(); } catch {} });
    _orderLines = [];
  }

  function _drawLines() {
    if (!_widget || typeof State === 'undefined') return;

    let chart;
    try { chart = _widget.chart?.(); }
    catch { return; }
    if (!chart) return;

    _clearLines();

    for (const p of (State.positions || [])) {
      const rawC = (p.position.coin || '').includes(':')
        ? p.position.coin.split(':')[1] : p.position.coin;
      const pSym = rawC === 'GOLD' ? 'XAU'
        : (typeof COIN_TO_SYM !== 'undefined' ? COIN_TO_SYM[rawC] || rawC : rawC);

      if (pSym !== _sym) continue;

      const pos    = p.position;
      const sziOz  = parseFloat(pos.szi || 0);
      const isGr   = _isGr(_sym);
      const entOz  = parseFloat(pos.entryPx || 0);
      const entD   = _toDisp(_sym, entOz);
      const pnl    = parseFloat(pos.unrealizedPnl || 0);
      const isLong = sziOz > 0;

      if (entD > 0) {
        try {
          const ln = chart.createOrderLine()
            .setPrice(entD)
            .setQuantity(`${isLong ? '▲' : '▼'}  ${pnl >= 0 ? '+' : ''}$${Math.abs(pnl).toFixed(2)}`)
            .setLineColor(pnl >= 0 ? '#00e676' : '#ff3d3d')
            .setBodyBorderColor(pnl >= 0 ? '#00e676' : '#ff3d3d')
            .setBodyTextColor('#000')
            .setBodyBackgroundColor(pnl >= 0 ? '#00e676' : '#ff3d3d')
            .setLineWidth(1)
            .setLineStyle(0);
          _orderLines.push(ln);
        } catch {}
      }

      /* TP */
      const tpsl = p.tpsl || {};
      if (tpsl.tp) {
        const tpD  = _toDisp(_sym, tpsl.tp);
        const tpPnl = Math.abs(sziOz) * Math.abs(tpsl.tp - entOz);
        try {
          const ln = chart.createOrderLine()
            .setPrice(tpD)
            .setQuantity(`🎯 TP  +$${tpPnl.toFixed(2)}`)
            .setLineColor('#00e8a2')
            .setBodyBorderColor('#00e8a2')
            .setBodyTextColor('#000')
            .setBodyBackgroundColor('#00e8a2')
            .setLineWidth(1)
            .setLineStyle(2);
          _orderLines.push(ln);
        } catch {}
      }

      /* SL */
      if (tpsl.sl) {
        const slD  = _toDisp(_sym, tpsl.sl);
        const slPnl = Math.abs(sziOz) * Math.abs(tpsl.sl - entOz);
        try {
          const ln = chart.createOrderLine()
            .setPrice(slD)
            .setQuantity(`🛡 SL  -$${slPnl.toFixed(2)}`)
            .setLineColor('#ff6a1a')
            .setBodyBorderColor('#ff6a1a')
            .setBodyTextColor('#fff')
            .setBodyBackgroundColor('#ff6a1a')
            .setLineWidth(1)
            .setLineStyle(2);
          _orderLines.push(ln);
        } catch {}
      }

      /* Liq */
      if (typeof calcLiqPrice !== 'undefined') {
        const aLiq  = _ai(_sym);
        const aApi  = isGr
          ? (typeof ASSETS !== 'undefined' && ASSETS['GOLD']) || aLiq
          : aLiq;
        const liqOz = calcLiqPrice(
          entOz, sziOz,
          (typeof State !== 'undefined' && State.balance?.total) || 0,
          aApi.cross, aApi.lev
        );
        if (liqOz && liqOz > 0) {
          const liqD = _toDisp(_sym, liqOz);
          try {
            const ln = chart.createOrderLine()
              .setPrice(liqD)
              .setQuantity(`⚡ Liq`)
              .setLineColor('#ff3d3d')
              .setBodyBorderColor('#ff4444')
              .setBodyTextColor('#fff')
              .setBodyBackgroundColor('#c62828')
              .setLineWidth(1)
              .setLineStyle(1);
            _orderLines.push(ln);
          } catch {}
        }
      }

      break; // نرسم للأصل الحالي فقط
    }
  }

  /* ══════════════════════════════════════════
     Trade Bar
  ══════════════════════════════════════════ */
  function _buildTrade() {
    document.getElementById('_tvTrade')?.remove();
    const a  = _ai(_sym);
    const ps = (a.presets || [1,2,5]).slice(0, 4);

    const bar = document.createElement('div');
    bar.id = '_tvTrade';
    bar.innerHTML = `
      <button class="tvt-btn tvt-sell" id="_tvSell">
        <span class="tvt-dir">▼ بيع</span>
        <span class="tvt-px" id="_tvSellPx">—</span>
      </button>
      <div class="tvt-mid">
        <span class="tvt-qlbl">الكمية</span>
        <div class="tvt-qrow">
          <input class="tvt-qin" id="_tvQty" type="number"
            value="${ps[0]}" min="0" step="any" inputmode="decimal">
          <span class="tvt-unit">${a.unit}</span>
        </div>
        <div class="tvt-prs">
          ${ps.map((v,i)=>`<button class="tvt-pr${i===0?' on':''}" data-v="${v}">${v}</button>`).join('')}
        </div>
      </div>
      <button class="tvt-btn tvt-buy" id="_tvBuy">
        <span class="tvt-dir">▲ شراء</span>
        <span class="tvt-px" id="_tvBuyPx">—</span>
      </button>`;

    const screen = document.getElementById('chartScreen');
    const tvC    = document.getElementById('_tvC');
    if (screen && tvC) screen.insertBefore(bar, tvC);

    bar.querySelectorAll('.tvt-pr').forEach(b => {
      b.onclick = () => {
        bar.querySelectorAll('.tvt-pr').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        const inp = document.getElementById('_tvQty');
        if (inp) inp.value = b.dataset.v;
      };
    });
    document.getElementById('_tvQty').oninput = () =>
      bar.querySelectorAll('.tvt-pr').forEach(x => x.classList.remove('on'));
    document.getElementById('_tvBuy').onclick  = () => _showCf(true);
    document.getElementById('_tvSell').onclick = () => _showCf(false);

    /* سعر أولي */
    if (typeof State !== 'undefined') {
      const p = State.prices?.[_sym]?.mid;
      if (p) _setPrice(_sym, p);
    }
  }

  /* ══════════════════════════════════════════
     Confirm Sheet
  ══════════════════════════════════════════ */
  function _showCf(isBuy) {
    if (typeof State === 'undefined' || !State.wallet)
      return typeof toast !== 'undefined' && toast('سجّل الدخول أولاً', 'err');
    const qty = parseFloat(document.getElementById('_tvQty')?.value || 0);
    if (!qty || qty <= 0)
      return typeof toast !== 'undefined' && toast('أدخل الكمية', 'err');

    const a     = _ai(_sym);
    const isGr  = _isGr(_sym);
    const mid   = _lastClose || (typeof State !== 'undefined' ? State.prices?.[_sym]?.mid : 0) || 0;
    if (!mid) return typeof toast !== 'undefined' && toast('لا يوجد سعر', 'err');

    const midOz = _toOz(_sym, mid);
    const qtyOz = isGr ? qty / TROY : qty;
    const usd   = (midOz * qtyOz).toFixed(2);
    const mgn   = (midOz * qtyOz / a.lev).toFixed(2);
    /* تقدير بسيط للتصفية */
    const mmR   = 0.5 / a.lev;
    const liqOz = isBuy
      ? midOz * (1 - 1/a.lev + mmR)
      : midOz * (1 + 1/a.lev - mmR);
    const liqD  = _toDisp(_sym, liqOz).toFixed(a.pxDp);

    _hideCf();
    const screen = document.getElementById('chartScreen');
    if (!screen) return;

    const ov = document.createElement('div');
    ov.id = '_tvcfOv'; ov.className = 'tvcf-ov';
    ov.innerHTML = `
      <div class="tvcf-card">
        <div class="tvcf-hdl"></div>
        <div class="tvcf-title" style="color:${isBuy?'#00e676':'#ff3d3d'}">${a.icon} ${isBuy?'شراء ▲':'بيع ▼'} — ${a.name}</div>
        <div class="tvcf-sub">رافعة ${a.lev}x · تأكيد قبل التنفيذ</div>
        <div class="tvcf-rows">
          <div class="tvcf-row"><span class="tvcf-k">الكمية</span><span class="tvcf-v">${qty.toFixed(a.szDp)} ${a.unit}</span></div>
          <div class="tvcf-row"><span class="tvcf-k">السعر</span><span class="tvcf-v">$${mid.toFixed(a.pxDp)}</span></div>
          <div class="tvcf-row"><span class="tvcf-k">القيمة</span><span class="tvcf-v">≈ $${usd}</span></div>
          <div class="tvcf-row"><span class="tvcf-k">الهامش</span><span class="tvcf-v w">≈ $${mgn}</span></div>
          <div class="tvcf-row"><span class="tvcf-k">التصفية</span><span class="tvcf-v ${isBuy?'r':'g'}">≈ $${liqD}</span></div>
        </div>
        <div class="tvcf-btns">
          <button class="tvcf-cancel" id="_tvcfC">إلغاء ✕</button>
          <button class="tvcf-exec ${isBuy?'g':'r'}" id="_tvcfX">${isBuy?'✅ تأكيد الشراء':'✅ تأكيد البيع'}</button>
        </div>
      </div>`;

    screen.appendChild(ov);
    ov.onclick = e => { if (e.target === ov) _hideCf(); };
    document.getElementById('_tvcfC').onclick = _hideCf;
    document.getElementById('_tvcfX').onclick = () =>
      typeof requirePin !== 'undefined'
        ? requirePin(() => _execTrade(isBuy, qty))
        : _execTrade(isBuy, qty);
  }

  function _hideCf() { document.getElementById('_tvcfOv')?.remove(); }

  async function _execTrade(isBuy, qty) {
    if (!State?.wallet) return;
    const btn = document.getElementById('_tvcfX');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="tvsp"></span>'; }

    const isGr  = _isGr(_sym);
    const aApi  = isGr
      ? (typeof ASSETS !== 'undefined' && ASSETS['GOLD']) || _ai('GOLD')
      : _ai(_sym);
    const mid   = _lastClose || State.prices?.[_sym]?.mid || 0;
    const midOz = _toOz(_sym, mid);
    if (!midOz) { _hideCf(); return; }
    const qtyOz = isGr ? qty / TROY : qty;

    try {
      try {
        await hlExchange({
          type:'updateLeverage', asset:aApi.idx,
          isCross:aApi.cross, leverage:aApi.lev
        });
      } catch {}
      await hlExchange({
        type:'order',
        orders:[{
          a: aApi.idx, b: isBuy,
          p: wirePx(midOz * (isBuy ? 1.02 : 0.98), aApi.szDp),
          s: wireSz(qtyOz, aApi.szDp),
          r: false, t:{ limit:{ tif:'Ioc' } }
        }],
        grouping:'na'
      });
      _hideCf();
      const disp = isGr
        ? qty.toFixed(2) + ' غرام'
        : qty.toFixed(aApi.szDp) + ' ' + (aApi.unit || '');
      if (typeof toast !== 'undefined')
        toast(`✅ ${aApi.icon} ${isBuy?'شراء':'بيع'} ${disp}`, 'ok', 4000);
      if (typeof pollAccount !== 'undefined')
        setTimeout(pollAccount, 2000);
    } catch(e) {
      if (typeof toast !== 'undefined')
        toast(typeof tradeErr !== 'undefined'
          ? tradeErr(e.message)
          : '❌ ' + e.message.slice(0,100), 'err', 5000);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = isBuy ? '✅ تأكيد الشراء' : '✅ تأكيد البيع';
      }
    }
  }

  /* ══════════════════════════════════════════
     DOM — بناء الشاشة
  ══════════════════════════════════════════ */
  function _ensureScreen() {
    const screen = document.getElementById('chartScreen');
    if (!screen) return;

    /* أنشئ header و container مرة واحدة فقط */
    if (!document.getElementById('_tvHdr')) {
      /* header */
      const hdr = document.createElement('nav');
      hdr.id = '_tvHdr';
      hdr.innerHTML = `
        <div class="tvh-l">
          <button class="tvh-back" id="_tvBack">← رجوع</button>
          <div class="tvh-asset">
            <span id="_tvIcon" class="tvh-icon">🛢</span>
            <span id="_tvName" class="tvh-name">—</span>
            <span id="_tvPx"   class="tvh-price" data-p="0">—</span>
          </div>
        </div>
        <div class="tvh-r">
          <div class="tvh-ivs">
            <button class="tvh-iv" data-iv="5">5m</button>
            <button class="tvh-iv" data-iv="15">15m</button>
            <button class="tvh-iv" data-iv="60">1H</button>
            <button class="tvh-iv" data-iv="240">4H</button>
            <button class="tvh-iv" data-iv="1D">1D</button>
            <button class="tvh-iv" data-iv="1W">1W</button>
          </div>
          <div class="tvh-dot wait" id="_tvDot"></div>
        </div>`;
      screen.prepend(hdr);

      /* TV Container */
      const tvC = document.createElement('div');
      tvC.id = '_tvC';
      screen.appendChild(tvC);

      /* events */
      document.getElementById('_tvBack').onclick = () => ChartModule.close();
      hdr.querySelectorAll('.tvh-iv').forEach(b =>
        b.onclick = () => ChartModule.switchInterval(b.dataset.iv)
      );
    }
  }

  function _setHdr(sym) {
    const a  = _ai(sym);
    const ic = document.getElementById('_tvIcon');
    const nm = document.getElementById('_tvName');
    if (ic) ic.textContent = a.icon;
    if (nm) nm.textContent = a.name;
    if (typeof State !== 'undefined') {
      const p = State.prices?.[sym]?.mid;
      if (p) _setPrice(sym, p);
    }
  }

  function _setIv(iv) {
    document.querySelectorAll('.tvh-iv')
      .forEach(b => b.classList.toggle('on', b.dataset.iv === iv));
  }

  /* ══════════════════════════════════════════
     API عامة
  ══════════════════════════════════════════ */
  function open(sym) {
    _sym      = sym || (typeof State !== 'undefined' ? State.asset : 'CL') || 'CL';
    _visible  = true;

    /* استرجاع آخر interval محفوظ لهذا الأصل */
    const savedIv = _lsGet('iv_' + _sym);
    if (savedIv && IV_HL[savedIv]) _interval = savedIv;
    else _interval = '60';

    _ensureScreen();

    const screen = document.getElementById('chartScreen');
    if (screen) screen.classList.remove('hidden');

    _setHdr(_sym);
    _setIv(_interval);
    _buildTrade();

    /* double rAF — ضمان أبعاد container قبل TV init */
    requestAnimationFrame(() => requestAnimationFrame(() => {
      /* تدمير الـ widget القديم */
      if (_widget) {
        _clearLines();
        try { _widget.remove?.(); } catch {}
        _widget = null;
      }

      const c = document.getElementById('_tvC');
      if (!c) return;
      c.innerHTML = '';

      _widget = _mkWidget(_sym, _interval);
      if (!_widget) return;

      /* بعد TV يجهز */
      try {
        _widget.onChartReady?.(() => {
          /* رسم خطوط المراكز */
          _drawLines();
          /* subscribe على تغيير interval من داخل TV header */
          try {
            _widget.chart?.().onIntervalChanged?.()?.subscribe(null, iv => {
              _interval = iv;
              _setIv(iv);
              _lsSet('iv_' + _sym, iv); // ✅ احفظ الـ interval
            });
          } catch {}
          /* subscribe على تغيير الرسم — يُحفظ تلقائياً عبر save_load_adapter */
        });
      } catch {}
    }));

    _dot('wait');
    _bboConn(_sym);

    /* clock — يحدّث السعر من State كل ثانية */
    clearInterval(_clockTimer);
    _clockTimer = setInterval(() => {
      if (!_visible || typeof State === 'undefined') return;
      const p = State.prices?.[_sym]?.mid;
      if (p && Math.abs(p - _lastClose) > 0.000001) _setPrice(_sym, p);
      /* تحديث PnL في خطوط المراكز كل 5 ثواني */
      if (Date.now() % 5000 < 1200) _drawLines();
    }, 1000);
  }

  function close() {
    _visible = false;
    clearInterval(_clockTimer);
    _bboClose();
    _hideCf();
    _clearLines();
    if (document.fullscreenElement) document.exitFullscreen?.();
    const screen = document.getElementById('chartScreen');
    if (screen) screen.classList.add('hidden');
    /* widget يبقى حياً — TV يحفظ كل شيء تلقائياً في localStorage */
  }

  function switchInterval(iv) {
    if (!iv || iv === _interval) return;
    _interval = iv;
    _setIv(iv);
    _lsSet('iv_' + _sym, iv); // ✅ احفظ

    /* TV API — تغيير مباشر */
    try {
      _widget?.chart?.().setResolution?.(iv);
    } catch {
      /* fallback: rebuild */
      requestAnimationFrame(() => {
        _clearLines();
        if (_widget) { try { _widget.remove?.(); } catch {} _widget = null; }
        const c = document.getElementById('_tvC');
        if (c) {
          c.innerHTML = '';
          _widget = _mkWidget(_sym, iv);
          if (_widget) {
            try { _widget.onChartReady?.(() => _drawLines()); } catch {}
          }
        }
      });
    }
  }

  function switchAssetChart(sym) {
    if (!_visible || sym === _sym) return;
    _sym = sym;
    _setHdr(sym);
    _buildTrade();
    _bboConn(sym);

    /* استرجاع interval محفوظ للأصل الجديد */
    const savedIv = _lsGet('iv_' + sym);
    if (savedIv && IV_HL[savedIv]) _interval = savedIv;
    _setIv(_interval);

    requestAnimationFrame(() => {
      _clearLines();
      if (_widget) { try { _widget.remove?.(); } catch {} _widget = null; }
      const c = document.getElementById('_tvC');
      if (c) {
        c.innerHTML = '';
        _widget = _mkWidget(sym, _interval);
        if (_widget) {
          try { _widget.onChartReady?.(() => _drawLines()); } catch {}
        }
      }
    });
  }

  function refreshLines() {
    if (_visible && _widget) {
      try {
        _widget.onChartReady?.(() => _drawLines());
      } catch {}
      /* أيضاً immediate attempt */
      _drawLines();
    }
  }

  return { open, close, switchInterval, switchAssetChart, refreshLines };
})();
