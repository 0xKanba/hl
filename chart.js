/* ═══════════════════════════════════════
   chart.js v9 — TradingView Advanced Chart
   ✅ Local /charting_library/
   ✅ Custom Hyperliquid Datafeed
   ✅ Proper async widget initialization
   ✅ No memory leaks
   ✅ Back + Lock + Buy + Sell only
═══════════════════════════════════════ */

const ChartModule = (function () {
  'use strict';

  const HL_API = 'https://api.hyperliquid.xyz';
  const HL_WS  = 'wss://api.hyperliquid.xyz/ws';
  const TL     = 31.1035; /* Troy oz → gram */

  let _widget      = null;
  let _visible     = false;
  let _sym         = 'CL';
  let _currentRes  = '60';
  let _subscribers = {};
  let _rtWs        = null;
  let _rtTimer     = null;
  let _rtCoin      = null;
  let _rtIv        = null;
  let _screenBuilt = false;

  /* ── Resolution map ── */
  const RES_TO_HL = {
    '1':'1m', '3':'3m', '5':'5m', '15':'15m',
    '30':'30m', '60':'1h', '120':'2h',
    '240':'4h', '720':'12h', 'D':'1d', '1D':'1d'
  };

  /* ── Asset helpers ── */
  function _coin(sym) {
    if (typeof ASSETS !== 'undefined' && ASSETS[sym]?.coin) return ASSETS[sym].coin;
    return 'xyz:' + sym;
  }
  function _isGram(sym) {
    return !!(typeof ASSETS !== 'undefined' && ASSETS[sym]?.gram);
  }
  function _a(sym) {
    if (typeof ASSETS !== 'undefined' && ASSETS[sym]) return ASSETS[sym];
    return { pxDp:2, szDp:2, name:sym, unit:'', icon:'📊', lev:10, presets:[1], idx:0, cross:true };
  }

  /* ════════════════════════════════
     CSS — injected once
  ════════════════════════════════ */
  (function _injectCSS() {
    if (document.getElementById('_tvCSS2')) return;
    const s = document.createElement('style');
    s.id = '_tvCSS2';
    s.textContent = `
/* Chart screen layout */
.chart-screen {
  position: fixed; inset: 0; z-index: 50;
  display: flex; flex-direction: column;
  background: var(--bg-app, #000);
}
.chart-screen.hidden { display: none !important; }

/* Top nav bar */
._c-nav {
  display: flex; align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--bg-card, #0d0d0d);
  border-bottom: 1px solid var(--border, #2a2a2a);
  flex-shrink: 0; gap: 8px; direction: rtl;
  min-height: 48px;
}
._c-nav-left  { display: flex; align-items: center; gap: 8px; }
._c-nav-right { display: flex; align-items: center; gap: 8px; }

._c-back {
  padding: 6px 14px; border-radius: 999px;
  border: 1.5px solid rgba(255,140,66,.35);
  background: rgba(255,140,66,.12);
  color: var(--hc-ac, #ff8c42);
  font-size: 13px; font-weight: 800;
  font-family: 'Cairo', sans-serif;
  cursor: pointer; white-space: nowrap;
  -webkit-tap-highlight-color: transparent;
  transition: background .15s;
}
._c-back:active { opacity: .7; transform: scale(.95); }

._c-lock {
  background: var(--bg-elev, #161616);
  border: 1.5px solid var(--border-strong, #3d3d3d);
  border-radius: var(--r-sm, 12px);
  color: var(--text-secondary, #a0a0a0);
  font-size: 16px; padding: 5px 8px; line-height: 1;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
._c-lock:active { opacity: .6; }

._c-asset {
  display: flex; align-items: center; gap: 6px;
}
._c-icon { font-size: 18px; line-height: 1; }
._c-name { font-size: 14px; font-weight: 900; color: var(--text-primary, #f5f5f5); }

/* Trade bar */
._c-trade {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 12px;
  background: var(--bg-card, #0d0d0d);
  border-bottom: 1px solid var(--border, #2a2a2a);
  flex-shrink: 0; direction: rtl;
}
._cbt {
  flex: 1; min-height: 52px; padding: 6px 8px;
  border-radius: 14px; border: none;
  font-family: 'Cairo', sans-serif;
  cursor: pointer; color: #fff;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 2px;
  -webkit-tap-highlight-color: transparent;
  transition: transform .12s, filter .12s;
}
._cbt:active { transform: scale(.93); filter: brightness(.88); }
._cbt-buy  { background: linear-gradient(150deg, #00e676, #007c3a); box-shadow: 0 2px 12px rgba(0,200,80,.30); }
._cbt-sell { background: linear-gradient(150deg, #ff3d3d, #a00000); box-shadow: 0 2px 12px rgba(220,50,50,.30); }
._cbt-dir  { font-size: 15px; font-weight: 900; line-height: 1; }
._cbt-px   { font-family: 'IBM Plex Mono', monospace; font-size: 10px; opacity: .85; font-weight: 700; }

._cbt-mid {
  flex: 1.1; display: flex; flex-direction: column;
  align-items: center; gap: 4px;
}
._cbt-qlbl { font-size: 9px; color: var(--text-muted, #555); font-weight: 700; letter-spacing: .5px; text-transform: uppercase; }
._cbt-qrow { display: flex; align-items: center; gap: 5px; }
._cbt-qin {
  width: 80px; font-family: 'IBM Plex Mono', monospace;
  font-size: 19px; font-weight: 800;
  text-align: center; direction: ltr;
  background: var(--bg-input, #1e1e1e);
  border: 2px solid var(--border-strong, #3d3d3d);
  border-radius: 10px; padding: 5px 4px;
  color: var(--text-primary, #f5f5f5); outline: none;
}
._cbt-qin:focus {
  border-color: var(--hc-ac, #ff8c42);
  box-shadow: 0 0 0 3px rgba(255,140,66,.18);
}
._cbt-qunit { font-size: 10px; color: var(--text-secondary, #a0a0a0); font-weight: 800; white-space: nowrap; }

/* TradingView container */
._c-tv-wrap {
  flex: 1; min-height: 0;
  position: relative; overflow: hidden;
}
#_tvCont {
  width: 100% !important;
  height: 100% !important;
  position: absolute; inset: 0;
}
#_tvCont iframe {
  border: none !important;
  width: 100% !important;
  height: 100% !important;
}

/* Confirmation sheet */
._cf-ov {
  position: absolute; inset: 0; z-index: 95;
  display: flex; align-items: flex-end; justify-content: center;
  background: rgba(0,0,0,.70);
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  direction: rtl;
}
._cf-card {
  background: var(--bg-card, #0d0d0d);
  border-top: 2px solid var(--border-strong, #3d3d3d);
  border-radius: 22px 22px 0 0;
  width: 100%; max-width: 480px;
  padding: 14px 16px 30px;
  animation: _cfUp .22s cubic-bezier(.4,0,.2,1);
}
@keyframes _cfUp { from{transform:translateY(100%)} to{transform:none} }
._cf-hdl { width:32px;height:4px;background:var(--border-strong,#3d3d3d);border-radius:999px;margin:0 auto 12px; }
._cf-title { font-size:17px;font-weight:900;margin-bottom:10px;color:var(--text-primary,#f5f5f5); }
._cf-rows {
  background:var(--bg-input,#1e1e1e);border-radius:12px;
  padding:8px 12px;margin-bottom:14px;display:flex;flex-direction:column;
}
._cf-row {
  display:flex;justify-content:space-between;align-items:center;
  padding:7px 0;border-bottom:1px solid var(--border,#2a2a2a);
}
._cf-row:last-child{border:none;}
._cf-key{font-size:13px;color:var(--text-secondary,#a0a0a0);font-weight:700;}
._cf-val{font-family:'IBM Plex Mono',monospace;font-size:14px;font-weight:900;color:var(--text-primary,#f5f5f5);}
._cf-val.g{color:#00e676;} ._cf-val.r{color:#ff3d3d;} ._cf-val.w{color:#ffd600;}
._cf-btns{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
._cf-cancel{
  padding:13px;border-radius:999px;border:1.5px solid var(--border-strong,#3d3d3d);
  background:var(--bg-elev,#161616);color:var(--text-secondary,#a0a0a0);
  font-size:14px;font-weight:700;cursor:pointer;font-family:'Cairo',sans-serif;
}
._cf-exec{
  padding:13px;border-radius:999px;border:none;color:#fff;
  font-size:14px;font-weight:900;cursor:pointer;font-family:'Cairo',sans-serif;
  display:flex;align-items:center;justify-content:center;gap:6px;
}
._cf-exec.g{background:linear-gradient(135deg,#00e676,#007c3a);}
._cf-exec.r{background:linear-gradient(135deg,#ff3d3d,#a00000);}
._cf-exec:active{filter:brightness(.85);}
._cf-exec:disabled{opacity:.5;pointer-events:none;}
._cf-spin{
  width:14px;height:14px;border:2.5px solid rgba(255,255,255,.3);
  border-top-color:#fff;border-radius:50%;
  animation:_cfSpin .7s linear infinite;
}
@keyframes _cfSpin{to{transform:rotate(360deg)}}
`;
    document.head.appendChild(s);
  })();

  /* ════════════════════════════════
     Build screen DOM (once)
  ════════════════════════════════ */
  function _ensureScreen() {
    if (_screenBuilt) return;
    const screen = document.getElementById('chartScreen');
    if (!screen) return;
    _screenBuilt = true;

    screen.innerHTML = `
      <div class="_c-nav">
        <div class="_c-nav-left">
          <button class="_c-back" id="_cBack">← رجوع</button>
          <div class="_c-asset">
            <span class="_c-icon" id="_cIcon">🛢</span>
            <span class="_c-name" id="_cName">—</span>
          </div>
        </div>
        <div class="_c-nav-right">
          <button class="_c-lock" id="_cLock">🔒</button>
        </div>
      </div>
      <div class="_c-trade" id="_cTrade">
        <button class="_cbt _cbt-sell" id="_cSell">
          <span class="_cbt-dir">▼ بيع</span>
          <span class="_cbt-px" id="_cSellPx">—</span>
        </button>
        <div class="_cbt-mid">
          <span class="_cbt-qlbl">الكمية</span>
          <div class="_cbt-qrow">
            <input class="_cbt-qin" id="_cQty" type="number" value="1" min="0" step="any" inputmode="decimal">
            <span class="_cbt-qunit" id="_cQtyUnit">—</span>
          </div>
        </div>
        <button class="_cbt _cbt-buy" id="_cBuy">
          <span class="_cbt-dir">▲ شراء</span>
          <span class="_cbt-px" id="_cBuyPx">—</span>
        </button>
      </div>
      <div class="_c-tv-wrap" id="_cWrap">
        <div id="_tvCont"></div>
      </div>`;

    document.getElementById('_cBack').onclick = () => ChartModule.close();
    document.getElementById('_cLock').onclick = () => typeof lockApp === 'function' && lockApp();
    document.getElementById('_cBuy').onclick  = () => _showCf(true);
    document.getElementById('_cSell').onclick = () => _showCf(false);
  }

  /* ── Update header & trade bar for asset ── */
  function _updateHeader(sym) {
    const a = _a(sym);
    const ic = document.getElementById('_cIcon');
    const nm = document.getElementById('_cName');
    const qu = document.getElementById('_cQtyUnit');
    const qi = document.getElementById('_cQty');
    if (ic) ic.textContent = a.icon  || '📊';
    if (nm) nm.textContent = a.name  || sym;
    if (qu) qu.textContent = a.unit  || '';
    if (qi) qi.value       = a.presets?.[0] ?? 1;
    _refreshBtnPrices();
  }

  function _refreshBtnPrices() {
    const p  = typeof State !== 'undefined' ? (State.prices[_sym]?.mid || 0) : 0;
    const a  = _a(_sym);
    const bp = document.getElementById('_cBuyPx');
    const sp = document.getElementById('_cSellPx');
    if (!p) return;
    if (bp) bp.textContent = '$' + (p * 1.0005).toFixed(a.pxDp);
    if (sp) sp.textContent = '$' + (p * 0.9995).toFixed(a.pxDp);
  }

  /* ════════════════════════════════
     Datafeed — Hyperliquid
  ════════════════════════════════ */
  const Datafeed = {

    onReady(cb) {
      setTimeout(() => cb({
        supported_resolutions: ['1','3','5','15','30','60','120','240','720','1D'],
        exchanges: [{ value:'HL', name:'Hyperliquid', desc:'' }],
        symbols_types: [{ name:'crypto', value:'crypto' }],
        supports_marks: false,
        supports_timescale_marks: false,
      }), 0);
    },

    searchSymbols(query, exchange, type, onResult) {
      if (typeof ASSETS === 'undefined') { onResult([]); return; }
      const q   = (query || '').toLowerCase();
      const res = Object.keys(ASSETS).map(sym => ({
        symbol:      sym,
        full_name:   sym,
        ticker:      sym,
        description: ASSETS[sym].name || sym,
        exchange:    'Hyperliquid',
        type:        'crypto',
      })).filter(s =>
        s.symbol.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
      );
      onResult(res);
    },

    resolveSymbol(symbolName, onResolved, onError) {
      const a  = _a(symbolName);
      const dp = a.pxDp || 2;
      setTimeout(() => onResolved({
        name:                   symbolName,
        ticker:                 symbolName,
        description:            a.name || symbolName,
        type:                   'crypto',
        session:                '24x7',
        exchange:               'Hyperliquid',
        listed_exchange:        'Hyperliquid',
        timezone:               'Etc/UTC',
        format:                 'price',
        pricescale:             Math.pow(10, dp),
        minmov:                 1,
        has_intraday:           true,
        has_daily:              true,
        has_weekly_and_monthly: false,
        intraday_multipliers:   ['1','3','5','15','30','60','120','240','720'],
        supported_resolutions:  ['1','3','5','15','30','60','120','240','720','1D'],
        volume_precision:       4,
        data_status:            'streaming',
      }), 0);
    },

    async getBars(symInfo, resolution, periodParams, onResult, onError) {
      try {
        const hlIv    = RES_TO_HL[resolution] || '1h';
        const sym     = symInfo.ticker;
        const gram    = _isGram(sym);
        const startMs = periodParams.from * 1000;
        const endMs   = periodParams.to   * 1000;

        const r = await fetch(HL_API + '/info', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'candleSnapshot',
            req:  { coin: _coin(sym), interval: hlIv, startTime: startMs, endTime: endMs }
          })
        });

        if (!r.ok) throw new Error('HTTP ' + r.status);
        const raw = await r.json();

        if (!Array.isArray(raw) || raw.length === 0) {
          onResult([], { noData: true });
          return;
        }

        const bars = raw
          .map(c => ({
            time:   Math.floor(c.t / 1000),
            open:   gram ? +c.o / TL : +c.o,
            high:   gram ? +c.h / TL : +c.h,
            low:    gram ? +c.l / TL : +c.l,
            close:  gram ? +c.c / TL : +c.c,
            volume: +c.v || 0,
          }))
          .sort((a, b) => a.time - b.time);

        onResult(bars, { noData: false });
      } catch (e) {
        console.error('[Chart] getBars error:', e.message);
        onError(e.message);
      }
    },

    subscribeBars(symInfo, resolution, onTick, uid) {
      _subscribers[uid] = { sym: symInfo.ticker, res: resolution, cb: onTick };
      _rtConnect(symInfo.ticker, resolution);
    },

    unsubscribeBars(uid) {
      delete _subscribers[uid];
      if (Object.keys(_subscribers).length === 0) _rtDisconnect();
    },
  };

  /* ════════════════════════════════
     Realtime WS
  ════════════════════════════════ */
  function _rtConnect(sym, resolution) {
    const coin = _coin(sym);
    const hlIv = RES_TO_HL[resolution] || '1h';
    if (_rtWs && _rtWs.readyState <= 1 && _rtCoin === coin && _rtIv === hlIv) return;
    _rtDisconnect();
    _rtCoin = coin;
    _rtIv   = hlIv;
    try {
      _rtWs = new WebSocket(HL_WS);
      _rtWs.onopen = () => {
        _rtWs.send(JSON.stringify({
          method: 'subscribe',
          subscription: { type: 'candle', coin, interval: hlIv }
        }));
      };
      _rtWs.onmessage = e => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.channel !== 'candle' || !msg.data) return;
          const c    = msg.data;
          const gram = _isGram(_sym);
          const bar  = {
            time:   Math.floor(c.t / 1000),
            open:   gram ? +c.o / TL : +c.o,
            high:   gram ? +c.h / TL : +c.h,
            low:    gram ? +c.l / TL : +c.l,
            close:  gram ? +c.c / TL : +c.c,
            volume: +c.v || 0,
          };
          Object.values(_subscribers).forEach(s => {
            try { s.cb(bar); } catch {}
          });
        } catch {}
      };
      _rtWs.onclose = () => {
        if (_visible && Object.keys(_subscribers).length > 0)
          _rtTimer = setTimeout(() => _rtConnect(_sym, _currentRes), 4000);
      };
      _rtWs.onerror = () => {};
    } catch (e) {
      console.warn('[Chart] RT WS error:', e.message);
    }
  }

  function _rtDisconnect() {
    clearTimeout(_rtTimer);
    if (_rtWs) {
      try { _rtWs.close(); } catch {}
      _rtWs = null;
    }
    _rtCoin = null;
    _rtIv   = null;
  }

  /* ════════════════════════════════
     Widget init
  ════════════════════════════════ */
  function _destroyWidget() {
    if (_widget) {
      try { _widget.remove(); } catch {}
      _widget = null;
    }
    _subscribers = {};
    _rtDisconnect();
    /* clear DOM container */
    const cont = document.getElementById('_tvCont');
    if (cont) cont.innerHTML = '';
  }

  function _buildWidget(sym) {
    _destroyWidget();

    /* Guard: library must be loaded */
    if (typeof TradingView === 'undefined' || typeof TradingView.widget === 'undefined') {
      console.error('[Chart] TradingView library not loaded. Check /charting_library/charting_library.standalone.js');
      const wrap = document.getElementById('_cWrap');
      if (wrap) wrap.innerHTML = '<div style="color:#ff8c42;font-family:Cairo,sans-serif;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center;height:100%;text-align:center;padding:20px;">⚠️ مكتبة TradingView غير محملة</div>';
      return;
    }

    /* Guard: container must exist */
    const cont = document.getElementById('_tvCont');
    if (!cont) { console.error('[Chart] container #_tvCont not found'); return; }

    _currentRes = '60';

    /* Detect current theme */
    const theme = document.documentElement.getAttribute('data-theme') === 'light' ? 'Light' : 'Dark';
    const darkBg = '#040404';
    const lightBg = '#ffffff';
    const bg = theme === 'Light' ? lightBg : darkBg;

    try {
      _widget = new TradingView.widget({
        /* Core */
        autosize:             true,
        symbol:               sym,
        interval:             _currentRes,
        container:            '_tvCont',
        datafeed:             Datafeed,
        library_path:         '/charting_library/',

        /* Locale & style */
        locale:               'ar',
        timezone:             'Asia/Baghdad',
        theme:                theme,
        style:                '1', /* Candlestick */
        debug:                false,

        /* Behavior */
        enable_publishing:    false,
        allow_symbol_change:  false,
        save_image:           false,
        autosize:             true,

        /* Loading screen */
        loading_screen: {
          backgroundColor: bg,
          foregroundColor: '#ff8c42',
        },

        /* Disabled features */
        disabled_features: [
          'header_symbol_search',
          'header_resolutions',
          'header_chart_type',
          'header_settings',
          'header_indicators',
          'header_compare',
          'header_undo_redo',
          'header_screenshot',
          'header_fullscreen_button',
          'header_saveload',
          'left_toolbar',
          'border_around_the_chart',
          'popup_hints',
          'symbol_info',
          'go_to_date',
          'display_market_status',
          'timeframes_toolbar',
          'legend_context_menu',
          'show_interval_dialog_on_key_press',
          'volume_force_overlay',
          'create_volume_indicator_by_default',
          'use_localstorage_for_settings',
          'countdown_timer',
          'show_logo_on_all_charts',
        ],

        enabled_features: [
          'move_logo_to_main_pane',
          'hide_left_toolbar_by_default',
          'two_character_bar_marks_labels',
        ],

        /* Visual overrides */
        overrides: {
          /* Candle colors */
          'mainSeriesProperties.candleStyle.upColor':         '#00e676',
          'mainSeriesProperties.candleStyle.downColor':       '#ff3d3d',
          'mainSeriesProperties.candleStyle.borderUpColor':   '#00e676',
          'mainSeriesProperties.candleStyle.borderDownColor': '#ff3d3d',
          'mainSeriesProperties.candleStyle.wickUpColor':     '#00e676',
          'mainSeriesProperties.candleStyle.wickDownColor':   '#ff3d3d',

          /* Background */
          'paneProperties.background':              bg,
          'paneProperties.backgroundType':          'solid',
          'paneProperties.vertGridProperties.color': theme === 'Light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)',
          'paneProperties.horzGridProperties.color': theme === 'Light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)',

          /* Scales */
          'scalesProperties.textColor':        theme === 'Light' ? '#333333' : '#a0a0a0',
          'scalesProperties.fontSize':         11,
          'scalesProperties.backgroundColor':  theme === 'Light' ? '#f5f5f5' : '#0a0a0a',

          /* Crosshair */
          'paneProperties.crossHairProperties.color': theme === 'Light' ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.35)',
        },
      });

      /* On ready */
      _widget.onChartReady(() => {
        _refreshBtnPrices();
        /* Track interval changes from built-in UI */
        try {
          _widget.activeChart().onIntervalChanged().subscribe(null, iv => {
            _currentRes = iv;
          });
        } catch {}
      });

    } catch (e) {
      console.error('[Chart] widget init error:', e.message, e);
    }
  }

  /* ════════════════════════════════
     Confirmation + Execution
  ════════════════════════════════ */
  function _hideCf() {
    document.getElementById('_cfOv')?.remove();
  }

  function _showCf(isBuy) {
    if (typeof State === 'undefined' || !State.wallet) {
      typeof toast !== 'undefined' && toast('سجّل الدخول أولاً', 'err');
      return;
    }
    const qty = parseFloat(document.getElementById('_cQty')?.value || 0);
    if (!qty || qty <= 0) {
      typeof toast !== 'undefined' && toast('أدخل الكمية', 'err');
      return;
    }

    const a    = _a(_sym);
    const gram = _isGram(_sym);
    const mid  = (typeof State !== 'undefined' ? State.prices[_sym]?.mid : 0) || 0;
    if (!mid) {
      typeof toast !== 'undefined' && toast('لا يوجد سعر', 'err');
      return;
    }

    const midOz = gram ? mid * TL : mid;
    const qtyOz = gram ? qty / TL : qty;
    const usd   = (midOz * qtyOz).toFixed(2);
    const mgn   = (midOz * qtyOz / a.lev).toFixed(2);
    const liqOz = isBuy ? midOz * (1 - 1 / a.lev) : midOz * (1 + 1 / a.lev);
    const liqD  = gram ? (liqOz / TL).toFixed(a.pxDp) : liqOz.toFixed(a.pxDp);

    _hideCf();
    const wrap = document.getElementById('_cWrap');
    if (!wrap) return;

    const ov = document.createElement('div');
    ov.id = '_cfOv';
    ov.className = '_cf-ov';
    ov.innerHTML = `
      <div class="_cf-card">
        <div class="_cf-hdl"></div>
        <div class="_cf-title" style="color:${isBuy ? '#00e676' : '#ff3d3d'}">
          ${a.icon || '📊'} ${isBuy ? 'شراء ▲' : 'بيع ▼'} — ${a.name}
        </div>
        <div class="_cf-rows">
          <div class="_cf-row">
            <span class="_cf-key">الكمية</span>
            <span class="_cf-val">${qty.toFixed(gram ? 2 : a.szDp)} ${a.unit}</span>
          </div>
          <div class="_cf-row">
            <span class="_cf-key">السعر</span>
            <span class="_cf-val">$${mid.toFixed(a.pxDp)}</span>
          </div>
          <div class="_cf-row">
            <span class="_cf-key">القيمة</span>
            <span class="_cf-val">≈ $${usd}</span>
          </div>
          <div class="_cf-row">
            <span class="_cf-key">الهامش</span>
            <span class="_cf-val w">≈ $${mgn}</span>
          </div>
          <div class="_cf-row">
            <span class="_cf-key">التصفية</span>
            <span class="_cf-val ${isBuy ? 'r' : 'g'}">≈ $${liqD}</span>
          </div>
        </div>
        <div class="_cf-btns">
          <button class="_cf-cancel" id="_cfC">إلغاء ✕</button>
          <button class="_cf-exec ${isBuy ? 'g' : 'r'}" id="_cfX">
            ${isBuy ? '✅ تأكيد الشراء' : '✅ تأكيد البيع'}
          </button>
        </div>
      </div>`;

    wrap.appendChild(ov);
    ov.addEventListener('click', e => { if (e.target === ov) _hideCf(); });
    document.getElementById('_cfC').onclick = _hideCf;
    document.getElementById('_cfX').onclick = () => {
      typeof requirePin !== 'undefined'
        ? requirePin(() => _execTrade(isBuy, qty))
        : _execTrade(isBuy, qty);
    };
  }

  async function _execTrade(isBuy, qty) {
    if (typeof State === 'undefined' || !State?.wallet) return;

    const btn = document.getElementById('_cfX');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="_cf-spin"></span>'; }

    const gram  = _isGram(_sym);
    const aApi  = gram
      ? (typeof ASSETS !== 'undefined' ? ASSETS['GOLD'] : _a(_sym))
      : _a(_sym);
    const mid   = (typeof State !== 'undefined' ? State.prices[_sym]?.mid : 0) || 0;
    const midOz = gram ? mid * TL : mid;
    if (!midOz) { _hideCf(); return; }
    const qtyOz = gram ? qty / TL : qty;

    try {
      /* Set leverage */
      try {
        await hlExchange({
          type: 'updateLeverage',
          asset: aApi.idx, isCross: aApi.cross, leverage: aApi.lev
        });
      } catch {}

      /* Place order */
      await hlExchange({
        type: 'order',
        orders: [{
          a: aApi.idx,
          b: isBuy,
          p: wirePx(midOz * (isBuy ? 1.05 : 0.95), aApi.szDp),
          s: wireSz(qtyOz, aApi.szDp),
          r: false,
          t: { limit: { tif: 'Ioc' } }
        }],
        grouping: 'na'
      });

      _hideCf();
      const dispA = _a(_sym);
      const label = gram
        ? qty.toFixed(2) + ' غرام'
        : qty.toFixed(dispA.szDp) + ' ' + dispA.unit;
      typeof toast !== 'undefined' &&
        toast(`✅ ${dispA.icon || ''} ${isBuy ? 'شراء' : 'بيع'} ${label}`, 'ok', 4000);
      if (typeof pollAccount !== 'undefined') setTimeout(pollAccount, 2000);

    } catch (e) {
      typeof toast !== 'undefined' && toast(
        typeof tradeErr !== 'undefined' ? tradeErr(e.message) : '❌ ' + e.message.slice(0, 100),
        'err', 5000
      );
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = isBuy ? '✅ تأكيد الشراء' : '✅ تأكيد البيع';
      }
    }
  }

  /* ════════════════════════════════
     Public API
  ════════════════════════════════ */
  function open(sym) {
    _sym     = sym || (typeof State !== 'undefined' ? State.asset : 'CL');
    _visible = true;

    _ensureScreen();

    const screen = document.getElementById('chartScreen');
    if (screen) screen.classList.remove('hidden');

    _updateHeader(_sym);
    _buildWidget(_sym);
  }

  function close() {
    _visible = false;
    _hideCf();
    _destroyWidget();
    const screen = document.getElementById('chartScreen');
    if (screen) screen.classList.add('hidden');
  }

  function switchInterval(iv) {
    if (!_widget) return;
    try {
      _widget.onChartReady(() => {
        _widget.activeChart().setResolution(iv, () => { _currentRes = iv; });
      });
    } catch {}
  }

  function switchAssetChart(sym) {
    if (!_visible || sym === _sym) return;
    _sym = sym;
    _updateHeader(sym);
    _buildWidget(sym);
  }

  function refreshLines() {
    /* Stub — position lines can be added here via createPositionLine() */
  }

  return { open, close, switchInterval, switchAssetChart, refreshLines };

})();
