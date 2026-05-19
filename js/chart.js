/* ═══════════════════════════════════════
   chart.js v8 — TradingView Advanced Chart
   ✅ Local /charting_library/ — no CDN
   ✅ Custom Hyperliquid datafeed
   ✅ Buy/Sell bar preserved
   ✅ No memory leaks — widget.remove() on close
═══════════════════════════════════════ */

const ChartModule = (function () {
  'use strict';

  const HL_API = 'https://api.hyperliquid.xyz';
  const HL_WS  = 'wss://api.hyperliquid.xyz/ws';
  const TL     = 31.1035;

  let _widget      = null;
  let _visible     = false;
  let _sym         = 'CL';
  let _currentRes  = '60';
  let _subscribers = {};
  let _rtWs        = null;
  let _rtTimer     = null;
  let _rtCoin      = null;
  let _rtIv        = null;

  /* ──────────────────────────────────────
     Resolution mapping
  ────────────────────────────────────── */
  const RES_TO_HL = {
    '1':  '1m',
    '5':  '5m',
    '15': '15m',
    '60': '1h',
    '240':'4h',
    '1D': '1d'
  };

  /* ──────────────────────────────────────
     Asset helpers
  ────────────────────────────────────── */
  function _coin(sym) {
    return (typeof ASSETS !== 'undefined' && ASSETS[sym]?.coin) || `xyz:${sym}`;
  }
  function _isGram(sym) {
    return !!(typeof ASSETS !== 'undefined' && ASSETS[sym]?.gram);
  }
  function _a(sym) {
    return (typeof ASSETS !== 'undefined' && ASSETS[sym]) ||
      { pxDp:2, szDp:2, name:sym, unit:'', icon:'📊', lev:10, presets:[1], idx:0, cross:true };
  }

  /* ──────────────────────────────────────
     Custom Datafeed
  ────────────────────────────────────── */
  const _datafeed = {

    onReady(cb) {
      setTimeout(() => cb({
        supported_resolutions: ['1','5','15','60','240','1D'],
        exchanges: [{ value:'Hyperliquid', name:'Hyperliquid DEX', desc:'Hyperliquid' }],
        symbols_types: [{ name:'commodity', value:'commodity' }],
      }), 0);
    },

    searchSymbols(query, exchange, type, cb) {
      if (typeof ASSETS === 'undefined') { cb([]); return; }
      const q = query.toLowerCase();
      cb(Object.keys(ASSETS).map(sym => ({
        symbol:      sym,
        full_name:   sym,
        ticker:      sym,
        description: ASSETS[sym].name || sym,
        exchange:    'Hyperliquid',
        type:        'commodity',
      })).filter(s =>
        s.symbol.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
      ));
    },

    resolveSymbol(symbolName, onResolved, onError) {
      const a  = _a(symbolName);
      const dp = a.pxDp || 2;
      setTimeout(() => onResolved({
        name:                   symbolName,
        ticker:                 symbolName,
        description:            a.name || symbolName,
        type:                   'commodity',
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
        intraday_multipliers:   ['1','5','15','60','240'],
        supported_resolutions:  ['1','5','15','60','240','1D'],
        volume_precision:       2,
        data_status:            'streaming',
      }), 0);
    },

    async getBars(symInfo, resolution, periodParams, onHistory, onError) {
      const hlIv = RES_TO_HL[resolution] || '1h';
      const sym  = symInfo.ticker;
      const gram = _isGram(sym);
      const { from, to } = periodParams;

      try {
        const res = await fetch(HL_API + '/info', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'candleSnapshot',
            req:  {
              coin:      _coin(sym),
              interval:  hlIv,
              startTime: from * 1000,
              endTime:   to   * 1000
            }
          })
        });
        const raw = await res.json();
        if (!Array.isArray(raw) || !raw.length) {
          onHistory([], { noData: true });
          return;
        }
        const bars = raw.map(c => ({
          time:   Math.floor(c.t / 1000),
          open:   gram ? +c.o / TL : +c.o,
          high:   gram ? +c.h / TL : +c.h,
          low:    gram ? +c.l / TL : +c.l,
          close:  gram ? +c.c / TL : +c.c,
          volume: +c.v || 0,
        })).sort((a, b) => a.time - b.time);
        onHistory(bars, { noData: bars.length === 0 });
      } catch (e) {
        onError(e.message);
      }
    },

    subscribeBars(symInfo, resolution, onRealtime, uid) {
      _subscribers[uid] = { sym: symInfo.ticker, cb: onRealtime };
      _connectRt(symInfo.ticker, resolution);
    },

    unsubscribeBars(uid) {
      delete _subscribers[uid];
      if (!Object.keys(_subscribers).length) _disconnectRt();
    },
  };

  /* ──────────────────────────────────────
     Realtime WebSocket
  ────────────────────────────────────── */
  function _connectRt(sym, resolution) {
    const coin = _coin(sym);
    const hlIv = RES_TO_HL[resolution] || '1h';
    if (_rtWs && _rtWs.readyState === WebSocket.OPEN && _rtCoin === coin && _rtIv === hlIv) return;
    _disconnectRt();
    _rtCoin = coin;
    _rtIv   = hlIv;
    try {
      _rtWs = new WebSocket(HL_WS);
      _rtWs.onopen = () => {
        _rtWs?.send(JSON.stringify({
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
          Object.values(_subscribers).forEach(s => s.cb(bar));
        } catch {}
      };
      _rtWs.onclose = () => {
        if (_visible && Object.keys(_subscribers).length)
          _rtTimer = setTimeout(() => _connectRt(_sym, _currentRes), 4000);
      };
      _rtWs.onerror = () => {};
    } catch {}
  }

  function _disconnectRt() {
    clearTimeout(_rtTimer);
    if (_rtWs) { try { _rtWs.close(); } catch {} _rtWs = null; }
    _rtCoin = null;
    _rtIv   = null;
  }

  /* ──────────────────────────────────────
     CSS injection
  ────────────────────────────────────── */
  (function _css() {
    if (document.getElementById('_tvCSS')) return;
    const s = document.createElement('style');
    s.id = '_tvCSS';
    s.textContent = `
.chart-screen {
  position: fixed; inset: 0; z-index: 50;
  display: flex; flex-direction: column;
  background: var(--bg-app, #1a1c1e);
}
.chart-screen.hidden { display: none !important; }

.c-nav {
  display: flex; flex-direction: column; gap: 0;
  background: var(--bg-card, #242628);
  border-bottom: 1px solid var(--border, #44484c);
  flex-shrink: 0; padding: 6px 10px; direction: rtl;
}
.c-nav-row {
  display: flex; align-items: center;
  justify-content: space-between; width: 100%; min-height: 36px;
}
.c-nav-group { display: flex; align-items: center; gap: 8px; }
.c-back {
  color: var(--hc-ac, #ff8c42); font-size: 12px; font-weight: 800;
  padding: 5px 12px; border-radius: 10px;
  border: 1.5px solid rgba(255,140,66,.25);
  background: rgba(255,140,66,.12);
  font-family: 'Cairo', sans-serif; white-space: nowrap; cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.c-back:active { opacity: .7; }
.c-asset-info { display: flex; align-items: center; gap: 5px; }
.c-asset-icon { font-size: 16px; line-height: 1; }
.c-asset-name { font-size: 13px; font-weight: 900; color: var(--text-primary); white-space: nowrap; }
.c-lock-btn {
  background: none; border: none; font-size: 16px; cursor: pointer;
  color: var(--text-secondary); padding: 4px; line-height: 1;
  -webkit-tap-highlight-color: transparent;
}
.c-lock-btn:active { opacity: .6; }

/* Trade bar */
.c-trade-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px;
  background: var(--bg-card, #242628);
  border-bottom: 1px solid var(--border, #44484c);
  flex-shrink: 0; direction: rtl;
}
.cbt-btn {
  flex: 1; min-height: 48px; padding: 6px 4px;
  border-radius: 12px; border: none;
  font-family: 'Cairo', sans-serif;
  cursor: pointer; color: #fff;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 2px;
  transition: transform .12s;
  -webkit-tap-highlight-color: transparent;
}
.cbt-btn:active { transform: scale(.93); }
.cbt-buy  { background: linear-gradient(150deg, #2da44e, #1a7f37); box-shadow: 0 2px 10px rgba(0,180,70,.25); }
.cbt-sell { background: linear-gradient(150deg, #e5534b, #a0281e); box-shadow: 0 2px 10px rgba(220,60,60,.25); }
.cbt-dir  { font-size: 14px; font-weight: 900; line-height: 1; }
.cbt-px   { font-family: 'IBM Plex Mono', monospace; font-size: 10px; opacity: .82; font-weight: 700; }
.cbt-mid  { flex: 1.2; display: flex; flex-direction: column; align-items: center; gap: 3px; }
.cbt-qty-lbl { font-size: 9px; color: var(--text-muted, #676869); font-weight: 700; letter-spacing: .5px; text-transform: uppercase; }
.cbt-qty-row { display: flex; align-items: center; gap: 4px; }
.cbt-qty-in {
  width: 76px; font-family: 'IBM Plex Mono', monospace;
  font-size: 18px; font-weight: 700; text-align: center; direction: ltr;
  background: var(--bg-input, #323537); border: 2px solid var(--border-strong, #5a5f64);
  border-radius: 10px; padding: 5px 4px; color: var(--text-primary); outline: none;
  -webkit-tap-highlight-color: transparent;
}
.cbt-qty-in:focus { border-color: var(--hc-ac, #ff8c42); box-shadow: 0 0 0 2px rgba(255,140,66,.2); }
.cbt-qty-unit { font-size: 9px; color: var(--text-secondary); font-weight: 800; white-space: nowrap; }

/* TradingView container */
.c-tv-wrap { flex: 1; min-height: 0; position: relative; overflow: hidden; background: #131722; }
#_tvContainer { width: 100%; height: 100%; }
#_tvContainer iframe { border: none !important; }

/* Confirmation overlay */
.cf-ov {
  position: absolute; inset: 0; z-index: 95;
  display: flex; align-items: flex-end; justify-content: center;
  background: rgba(0,0,0,.65);
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); direction: rtl;
}
.cf-card {
  background: var(--bg-card, #242628);
  border-top: 2px solid var(--border-strong, #5a5f64);
  border-radius: 22px 22px 0 0; width: 100%; max-width: 480px;
  padding: 14px 14px 28px;
  animation: cfSlideUp .22s cubic-bezier(.4,0,.2,1);
}
@keyframes cfSlideUp { from{transform:translateY(100%)} to{transform:none} }
.cf-hdl { width:32px;height:4px;background:var(--border-strong);border-radius:999px;margin:0 auto 12px; }
.cf-title { font-size:16px;font-weight:900;margin-bottom:10px;color:var(--text-primary); }
.cf-rows {
  background: var(--bg-input, #323537); border-radius:12px;
  padding:8px 10px; margin-bottom:12px; display:flex; flex-direction:column;
}
.cf-row {
  display:flex;justify-content:space-between;align-items:center;
  padding:6px 0;border-bottom:1px solid var(--border,#44484c);
}
.cf-row:last-child { border:none; }
.cf-key { font-size:12px;color:var(--text-secondary);font-weight:700; }
.cf-val { font-family:'IBM Plex Mono',monospace;font-size:13px;font-weight:800;color:var(--text-primary); }
.cf-val.g { color:#2da44e; }
.cf-val.r { color:#e5534b; }
.cf-val.w { color:var(--hc-warn,#ffd600); }
.cf-btns { display:grid;grid-template-columns:1fr 1fr;gap:8px; }
.cf-cancel {
  padding:12px;border-radius:999px;border:1.5px solid var(--border-strong);
  background:var(--bg-elev);color:var(--text-secondary);
  font-size:13px;font-weight:700;cursor:pointer;font-family:'Cairo',sans-serif;
}
.cf-exec {
  padding:12px;border-radius:999px;border:none;color:#fff;
  font-size:13px;font-weight:900;cursor:pointer;font-family:'Cairo',sans-serif;
  display:flex;align-items:center;justify-content:center;gap:5px;
}
.cf-exec.g { background:linear-gradient(135deg,#2da44e,#1a7f37); }
.cf-exec.r { background:linear-gradient(135deg,#e5534b,#a0281e); }
.cf-exec:active { filter:brightness(.88); }
.cf-exec:disabled { opacity:.5;pointer-events:none; }
.cf-spin {
  width:14px;height:14px;border:2px solid rgba(255,255,255,.3);
  border-top-color:#fff;border-radius:50%;
  animation:cfSpin .7s linear infinite;
}
@keyframes cfSpin { to{transform:rotate(360deg)} }
`;
    document.head.appendChild(s);
  })();

  /* ──────────────────────────────────────
     Screen HTML (built once)
  ────────────────────────────────────── */
  function _ensureScreen() {
    const screen = document.getElementById('chartScreen');
    if (!screen || screen.dataset.tvBuilt === '1') return;
    screen.dataset.tvBuilt = '1';
    screen.innerHTML = `
      <div class="c-nav">
        <div class="c-nav-row">
          <div class="c-nav-group">
            <button class="c-back" id="_cBack">← رجوع</button>
            <div class="c-asset-info">
              <span class="c-asset-icon" id="_cIcon">🛢</span>
              <span class="c-asset-name" id="_cName">—</span>
            </div>
          </div>
          <button class="c-lock-btn" id="_cLock" title="قفل التطبيق">🔒</button>
        </div>
      </div>
      <div class="c-trade-bar">
        <button class="cbt-btn cbt-sell" id="_cSell">
          <span class="cbt-dir">▼ بيع</span>
          <span class="cbt-px" id="_cSellPx">—</span>
        </button>
        <div class="cbt-mid">
          <span class="cbt-qty-lbl">الكمية</span>
          <div class="cbt-qty-row">
            <input class="cbt-qty-in" id="_cQty" type="number" value="1" min="0" step="any" inputmode="decimal">
            <span class="cbt-qty-unit" id="_cQtyUnit">—</span>
          </div>
        </div>
        <button class="cbt-btn cbt-buy" id="_cBuy">
          <span class="cbt-dir">▲ شراء</span>
          <span class="cbt-px" id="_cBuyPx">—</span>
        </button>
      </div>
      <div class="c-tv-wrap">
        <div id="_tvContainer"></div>
      </div>`;

    document.getElementById('_cBack').onclick  = () => ChartModule.close();
    document.getElementById('_cLock').onclick  = () => typeof lockApp === 'function' && lockApp();
    document.getElementById('_cBuy').onclick   = () => _showCf(true);
    document.getElementById('_cSell').onclick  = () => _showCf(false);
  }

  /* ──────────────────────────────────────
     Update trade bar header per asset
  ────────────────────────────────────── */
  function _updateHeader(sym) {
    const a  = _a(sym);
    const ic = document.getElementById('_cIcon');
    const nm = document.getElementById('_cName');
    const qu = document.getElementById('_cQtyUnit');
    const qi = document.getElementById('_cQty');
    if (ic) ic.textContent = a.icon || '📊';
    if (nm) nm.textContent = a.name || sym;
    if (qu) qu.textContent = a.unit || '';
    if (qi) qi.value = a.presets?.[0] ?? 1;
    _updateBtnPx();
  }

  function _updateBtnPx() {
    const p  = typeof State !== 'undefined' ? (State.prices[_sym]?.mid || 0) : 0;
    const a  = _a(_sym);
    const bp = document.getElementById('_cBuyPx');
    const sp = document.getElementById('_cSellPx');
    if (!p) return;
    if (bp) bp.textContent = '$' + (p * 1.0005).toFixed(a.pxDp);
    if (sp) sp.textContent = '$' + (p * 0.9995).toFixed(a.pxDp);
  }

  /* ──────────────────────────────────────
     Build / destroy TradingView widget
  ────────────────────────────────────── */
  function _buildWidget(sym) {
    if (_widget) {
      try { _widget.remove(); } catch {}
      _widget = null;
    }
    _subscribers = {};
    _disconnectRt();

    /* Clear container so TV has a clean mount */
    const container = document.getElementById('_tvContainer');
    if (container) container.innerHTML = '';

    if (typeof TradingView === 'undefined') {
      console.error('[ChartModule] TradingView not loaded — ensure /charting_library/charting_library.standalone.js is included');
      return;
    }

    _currentRes = '60';

    _widget = new TradingView.widget({
      autosize:            true,
      symbol:              sym,
      interval:            _currentRes,
      container:           '_tvContainer',
      datafeed:            _datafeed,
      library_path:        '/charting_library/',
      locale:              'ar',
      timezone:            'Asia/Baghdad',
      theme:               'Dark',
      style:               '1',
      debug:               false,
      enable_publishing:   false,
      allow_symbol_change: false,
      save_image:          false,
      loading_screen:      { backgroundColor: '#131722', foregroundColor: '#ff8c42' },

      disabled_features: [
        'header_symbol_search',
        'header_compare',
        'header_screenshot',
        'header_fullscreen_button',
        'use_localstorage_for_settings',
        'header_saveload',
        'border_around_the_chart',
        'popup_hints',
        'header_undo_redo',
        'symbol_info',
        'go_to_date',
        'display_market_status',
        'timeframes_toolbar',
        'legend_context_menu',
        'show_interval_dialog_on_key_press',
        'volume_force_overlay',
      ],

      enabled_features: [
        'hide_left_toolbar_by_default',
        'move_logo_to_main_pane',
      ],

      overrides: {
        'mainSeriesProperties.candleStyle.upColor':         '#26a69a',
        'mainSeriesProperties.candleStyle.downColor':       '#ef5350',
        'mainSeriesProperties.candleStyle.borderUpColor':   '#26a69a',
        'mainSeriesProperties.candleStyle.borderDownColor': '#ef5350',
        'mainSeriesProperties.candleStyle.wickUpColor':     '#26a69a',
        'mainSeriesProperties.candleStyle.wickDownColor':   '#ef5350',
        'paneProperties.background':                        '#131722',
        'paneProperties.backgroundType':                    'solid',
        'paneProperties.vertGridProperties.color':          'rgba(255,255,255,0.04)',
        'paneProperties.horzGridProperties.color':          'rgba(255,255,255,0.04)',
        'scalesProperties.textColor':                       '#9da0a3',
        'scalesProperties.fontSize':                        11,
        'scalesProperties.backgroundColor':                 '#1e2128',
      },
    });

    _widget.onChartReady(() => {
      _updateBtnPx();
      try {
        _widget.activeChart().onIntervalChanged().subscribe(null, iv => {
          _currentRes = iv;
        });
      } catch {}
    });
  }

  /* ──────────────────────────────────────
     Confirmation + Trade Execution
  ────────────────────────────────────── */
  function _showCf(isBuy) {
    if (typeof State === 'undefined' || !State.wallet)
      return typeof toast !== 'undefined' && toast('سجّل الدخول أولاً', 'err');

    const qty = parseFloat(document.getElementById('_cQty')?.value || 0);
    if (!qty || qty <= 0)
      return typeof toast !== 'undefined' && toast('أدخل الكمية', 'err');

    const a    = _a(_sym);
    const gram = _isGram(_sym);
    const mid  = (typeof State !== 'undefined' ? State.prices[_sym]?.mid : 0) || 0;
    if (!mid)
      return typeof toast !== 'undefined' && toast('لا يوجد سعر', 'err');

    const midOz = gram ? mid * TL : mid;
    const qtyOz = gram ? qty / TL : qty;
    const usd   = (midOz * qtyOz).toFixed(2);
    const mgn   = (midOz * qtyOz / a.lev).toFixed(2);
    const liqOz = isBuy ? midOz * (1 - 1 / a.lev) : midOz * (1 + 1 / a.lev);
    const liqD  = gram ? (liqOz / TL).toFixed(a.pxDp) : liqOz.toFixed(a.pxDp);

    _hideCf();
    const wrap = document.querySelector('.c-tv-wrap');
    if (!wrap) return;

    const ov = document.createElement('div');
    ov.id = '_cfOv';
    ov.className = 'cf-ov';
    ov.innerHTML = `
      <div class="cf-card">
        <div class="cf-hdl"></div>
        <div class="cf-title" style="color:${isBuy ? '#2da44e' : '#e5534b'}">
          ${a.icon || '📊'} ${isBuy ? 'شراء ▲' : 'بيع ▼'} — ${a.name}
        </div>
        <div class="cf-rows">
          <div class="cf-row">
            <span class="cf-key">الكمية</span>
            <span class="cf-val">${qty.toFixed(gram ? 2 : a.szDp)} ${a.unit}</span>
          </div>
          <div class="cf-row">
            <span class="cf-key">السعر</span>
            <span class="cf-val">$${mid.toFixed(a.pxDp)}</span>
          </div>
          <div class="cf-row">
            <span class="cf-key">القيمة</span>
            <span class="cf-val">≈ $${usd}</span>
          </div>
          <div class="cf-row">
            <span class="cf-key">الهامش</span>
            <span class="cf-val w">≈ $${mgn}</span>
          </div>
          <div class="cf-row">
            <span class="cf-key">التصفية التقريبية</span>
            <span class="cf-val ${isBuy ? 'r' : 'g'}">≈ $${liqD}</span>
          </div>
        </div>
        <div class="cf-btns">
          <button class="cf-cancel" id="_cfC">إلغاء ✕</button>
          <button class="cf-exec ${isBuy ? 'g' : 'r'}" id="_cfX">
            ${isBuy ? '✅ تأكيد الشراء' : '✅ تأكيد البيع'}
          </button>
        </div>
      </div>`;

    wrap.appendChild(ov);
    ov.addEventListener('click', e => { if (e.target === ov) _hideCf(); });
    document.getElementById('_cfC').onclick = _hideCf;
    document.getElementById('_cfX').onclick = () =>
      typeof requirePin !== 'undefined'
        ? requirePin(() => _execTrade(isBuy, qty))
        : _execTrade(isBuy, qty);
  }

  function _hideCf() {
    document.getElementById('_cfOv')?.remove();
  }

  async function _execTrade(isBuy, qty) {
    if (!State?.wallet) return;
    const btn = document.getElementById('_cfX');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="cf-spin"></span>'; }

    const gram  = _isGram(_sym);
    const aApi  = gram
      ? (typeof ASSETS !== 'undefined' ? ASSETS['GOLD'] : _a(_sym))
      : _a(_sym);
    const mid   = (typeof State !== 'undefined' ? State.prices[_sym]?.mid : 0) || 0;
    const midOz = gram ? mid * TL : mid;
    if (!midOz) { _hideCf(); return; }
    const qtyOz = gram ? qty / TL : qty;

    try {
      try {
        await hlExchange({
          type: 'updateLeverage',
          asset: aApi.idx, isCross: aApi.cross, leverage: aApi.lev
        });
      } catch {}

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
      const disp  = gram
        ? qty.toFixed(2) + ' غرام'
        : qty.toFixed(dispA.szDp) + ' ' + dispA.unit;
      typeof toast !== 'undefined' &&
        toast(`✅ ${dispA.icon || ''} ${isBuy ? 'شراء' : 'بيع'} ${disp}`, 'ok', 4000);
      if (typeof pollAccount !== 'undefined') setTimeout(pollAccount, 2000);

    } catch (e) {
      typeof toast !== 'undefined' && toast(
        typeof tradeErr !== 'undefined'
          ? tradeErr(e.message)
          : '❌ ' + e.message.slice(0, 100),
        'err', 5000
      );
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = isBuy ? '✅ تأكيد الشراء' : '✅ تأكيد البيع';
      }
    }
  }

  /* ──────────────────────────────────────
     Public API
  ────────────────────────────────────── */
  function open(sym) {
    _sym     = sym || (typeof State !== 'undefined' ? State.asset : 'CL');
    _visible = true;
    _ensureScreen();
    document.getElementById('chartScreen')?.classList.remove('hidden');
    _updateHeader(_sym);
    _buildWidget(_sym);
  }

  function close() {
    _visible = false;
    _hideCf();
    if (_widget) {
      try { _widget.remove(); } catch {}
      _widget = null;
    }
    _subscribers = {};
    _disconnectRt();
    const container = document.getElementById('_tvContainer');
    if (container) container.innerHTML = '';
    document.getElementById('chartScreen')?.classList.add('hidden');
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
    /* Reserved for future position line integration */
  }

  return { open, close, switchInterval, switchAssetChart, refreshLines };
})();
