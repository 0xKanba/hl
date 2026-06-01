'use strict';

const ChartModule = (function () {

  /* ─── Constants ─── */
  const HL_API = 'https://api.hyperliquid.xyz';
  const HL_WS  = 'wss://api.hyperliquid.xyz/ws';
  const TL     = 31.1035;

  /* ─── Module state ─── */
  let _widget    = null;
  let _ready     = false;
  let _visible   = false;
  let _sym       = 'CL';
  let _res       = '60';
  let _built     = false;
  let _subs      = {};
  let _rtWs      = null;
  let _rtTimer   = null;
  let _rtCoin    = null;
  let _rtIv      = null;
  let _layoutTmr = null;

  /* ─── Shortcuts ─── */
  const $$    = id => document.getElementById(id);
  const _coin = s  => (typeof ASSETS !== 'undefined' && ASSETS[s]?.coin) || ('xyz:' + s);
  const _gram = s  => !!(typeof ASSETS !== 'undefined' && ASSETS[s]?.gram);
  const _aset = s  => (typeof ASSETS !== 'undefined' && ASSETS[s]) ||
                      { pxDp:2, szDp:2, name:s, unit:'', icon:'📊', lev:10, presets:[1], idx:0, cross:true };
  const _px   = s  => (typeof State !== 'undefined' ? (State.prices[s]?.mid || 0) : 0);

  const RES = {
    '1':'1m','3':'3m','5':'5m','15':'15m','30':'30m',
    '60':'1h','120':'2h','240':'4h','D':'1d'
  };

  /* ══════════════════════════════════════════════
     CSS — injected once
  ══════════════════════════════════════════════ */
  (function injectCSS() {
    if ($$('_chart_css')) return;
    const s = document.createElement('style');
    s.id = '_chart_css';
    s.textContent = `
/* ── Screen ── */
.chart-screen {
  position: fixed; inset: 0; z-index: 50;
  display: flex; flex-direction: column;
  background: var(--bg-app, #000);
  overflow: hidden;
}
.chart-screen.hidden { display: none !important; }

/* ── Nav ── */
._cn {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 14px; min-height: 50px;
  background: var(--bg-card, #0d0d0d);
  border-bottom: 1px solid var(--border, #2a2a2a);
  flex-shrink: 0; gap: 10px; direction: rtl;
}
._cnl, ._cnr { display: flex; align-items: center; gap: 8px; }

._cbk {
  padding: 7px 18px; border-radius: 999px;
  border: 1.5px solid rgba(255,140,66,.35);
  background: rgba(255,140,66,.12);
  color: var(--hc-ac, #ff8c42);
  font-size: 13px; font-weight: 800;
  font-family: var(--font-ui, 'Cairo', sans-serif);
  cursor: pointer; transition: background .15s, transform .12s;
  -webkit-tap-highlight-color: transparent;
}
._cbk:hover  { background: rgba(255,140,66,.22); }
._cbk:active { transform: scale(.94); }

._clk {
  background: var(--bg-elev, #161616);
  border: 1.5px solid var(--border-strong, #3d3d3d);
  border-radius: 10px; color: var(--text-secondary, #a0a0a0);
  font-size: 16px; padding: 5px 9px; line-height: 1;
  cursor: pointer; transition: all .15s;
  -webkit-tap-highlight-color: transparent;
}
._clk:hover { border-color: var(--hc-ac, #ff8c42); color: var(--hc-ac, #ff8c42); }

._cai { display: flex; align-items: center; gap: 7px; }
._cic { font-size: 18px; line-height: 1; }
._cnm { font-size: 15px; font-weight: 900; color: var(--text-primary, #f5f5f5); }

/* ── Trade bar ── */
._ctb {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 12px; flex-shrink: 0; direction: rtl;
  background: var(--bg-card, #0d0d0d);
  border-bottom: 1px solid var(--border, #2a2a2a);
}

._cb {
  flex: 1; min-height: 54px; padding: 6px 4px;
  border-radius: 14px; border: none; color: #fff;
  font-family: var(--font-ui, 'Cairo', sans-serif);
  cursor: pointer; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 2px;
  -webkit-tap-highlight-color: transparent;
  transition: transform .12s, filter .12s;
}
._cb:active { transform: scale(.94); filter: brightness(.87); }

._buy { background: linear-gradient(150deg, #00e676, #007c3a); box-shadow: 0 2px 14px rgba(0,200,80,.3); }
._sel { background: linear-gradient(150deg, #ff3d3d, #a00000); box-shadow: 0 2px 14px rgba(220,50,50,.3); }

._cdir { font-size: 15px; font-weight: 900; line-height: 1; }
._cpx  { font-family: var(--font-mono, 'IBM Plex Mono', monospace); font-size: 10px; opacity: .85; font-weight: 700; }

._cmd { flex: 1.2; display: flex; flex-direction: column; align-items: center; gap: 4px; }
._cql { font-size: 9px; color: var(--text-muted, #555); font-weight: 700; letter-spacing: .5px; text-transform: uppercase; }
._cqr { display: flex; align-items: center; gap: 5px; }

._cqi {
  width: 78px;
  font-family: var(--font-mono, 'IBM Plex Mono', monospace);
  font-size: 19px; font-weight: 800; text-align: center;
  direction: ltr; background: var(--bg-input, #1e1e1e);
  border: 2px solid var(--border-strong, #3d3d3d);
  border-radius: 10px; padding: 5px 4px;
  color: var(--text-primary, #f5f5f5); outline: none;
  -webkit-tap-highlight-color: transparent;
  transition: border-color .2s, box-shadow .2s;
}
._cqi:focus { border-color: var(--hc-ac, #ff8c42); box-shadow: 0 0 0 3px rgba(255,140,66,.18); }
._cqu { font-size: 10px; color: var(--text-secondary, #a0a0a0); font-weight: 800; white-space: nowrap; }

/* ── Chart wrapper ── */
._ctw {
  flex: 1; min-height: 0; position: relative;
  overflow: hidden; background: #000; direction: ltr;
}
#_tvC {
  position: absolute; top: 0; left: 0;
  width: 100%; height: 100%; direction: ltr;
}
#_tvC iframe { border: none !important; display: block; }

/* ── Loading overlay ── */
._cload {
  position: absolute; inset: 0; z-index: 5;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg-app, #000);
  pointer-events: none;
  transition: opacity .3s;
}
._cload.hidden { opacity: 0; pointer-events: none; }
._cspin {
  width: 28px; height: 28px;
  border: 3px solid var(--border-strong, #2a2a2a);
  border-top-color: var(--hc-ac, #ff8c42);
  border-radius: 50%;
  animation: _cspinK .75s linear infinite;
  box-shadow: 0 0 12px rgba(255,140,66,.3);
}
@keyframes _cspinK { to { transform: rotate(360deg); } }

/* ── Error state ── */
._cerr {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 12px; padding: 30px;
  color: var(--text-secondary, #a0a0a0);
  font-family: var(--font-ui, 'Cairo', sans-serif);
  text-align: center; direction: rtl; z-index: 4;
}
._cerr-ico { font-size: 36px; }
._cerr-msg { font-size: 14px; font-weight: 700; line-height: 1.7; }

/* ── Confirm overlay ── */
._cfo {
  position: absolute; inset: 0; z-index: 90;
  display: flex; align-items: flex-end; justify-content: center;
  background: rgba(0,0,0,.75);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  direction: rtl;
}
._cfc {
  background: var(--bg-card, #0d0d0d);
  border-top: 2px solid var(--border-strong, #3d3d3d);
  border-radius: 24px 24px 0 0;
  width: 100%; max-width: 520px;
  padding: 14px 18px max(30px, env(safe-area-inset-bottom));
  animation: _cfUp .22s cubic-bezier(.4,0,.2,1);
}
@keyframes _cfUp { from { transform: translateY(100%); } to { transform: none; } }
._cfhndl { width: 34px; height: 4px; background: var(--border-strong, #3d3d3d); border-radius: 999px; margin: 0 auto 14px; }
._cftitle { font-size: 17px; font-weight: 900; margin-bottom: 12px; color: var(--text-primary, #f5f5f5); }
._cfrows {
  background: var(--bg-input, #1e1e1e);
  border-radius: 14px; padding: 8px 14px; margin-bottom: 14px;
  border: 1px solid var(--border, #2a2a2a);
}
._cfrow { display: flex; justify-content: space-between; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--border, #2a2a2a); }
._cfrow:last-child { border: none; }
._cfk { font-size: 13px; color: var(--text-secondary, #a0a0a0); font-weight: 700; }
._cfv { font-family: var(--font-mono, monospace); font-size: 14px; font-weight: 900; color: var(--text-primary, #f5f5f5); }
._cfv.g { color: #00e676; } ._cfv.r { color: #ff3d3d; } ._cfv.w { color: #ffd600; }
._cfbtns { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
._cfca {
  padding: 14px; border-radius: 999px;
  border: 1.5px solid var(--border-strong, #3d3d3d);
  background: var(--bg-elev, #161616);
  color: var(--text-secondary, #a0a0a0);
  font-size: 15px; font-weight: 700; cursor: pointer;
  font-family: var(--font-ui, 'Cairo', sans-serif);
  transition: all .15s;
}
._cfca:hover { border-color: var(--text-secondary); }
._cfca:active { opacity: .7; }
._cfex {
  padding: 14px; border-radius: 999px; border: none;
  color: #fff; font-size: 15px; font-weight: 900;
  cursor: pointer; font-family: var(--font-ui, 'Cairo', sans-serif);
  display: flex; align-items: center; justify-content: center; gap: 6px;
  transition: filter .15s, transform .12s;
}
._cfex:hover  { filter: brightness(1.1); }
._cfex:active { filter: brightness(.85); transform: scale(.97); }
._cfex:disabled { opacity: .5; pointer-events: none; }
._cfex.g { background: linear-gradient(135deg, #00e676, #007c3a); box-shadow: 0 2px 14px rgba(0,200,80,.3); }
._cfex.r { background: linear-gradient(135deg, #ff3d3d, #a00000); box-shadow: 0 2px 14px rgba(220,50,50,.3); }
._cfspinner {
  width: 15px; height: 15px;
  border: 2.5px solid rgba(255,255,255,.3);
  border-top-color: #fff; border-radius: 50%;
  animation: _cspinK .7s linear infinite;
}

/* ── Light theme ── */
[data-theme="light"] ._cn,
[data-theme="light"] ._ctb { background: var(--bg-card); border-color: var(--border); }
[data-theme="light"] ._ctw { background: #ffffff; }
[data-theme="light"] ._cload { background: #f0f2f5; }

/* ── Mobile ── */
@media (max-width: 420px) {
  ._cb { min-height: 48px; }
  ._cdir { font-size: 14px; }
  ._cqi  { width: 68px; font-size: 17px; }
  ._cbk  { padding: 6px 14px; font-size: 12px; }
}

/* ── Reduced motion ── */
@media (prefers-reduced-motion: reduce) {
  ._cfUp, ._cspinK { animation-duration: 0.01ms !important; }
  ._cb, ._cbk, ._cfex { transition: none !important; }
}
    `;
    document.head.appendChild(s);
  })();

  /* ══════════════════════════════════════════════
     Build screen HTML (once)
  ══════════════════════════════════════════════ */
  function _build() {
    if (_built) return;
    const sc = $$('chartScreen');
    if (!sc) return;
    _built = true;

    sc.innerHTML = `
<div class="_cn">
  <div class="_cnl">
    <button class="_cbk" id="_cBack">← رجوع</button>
    <div class="_cai">
      <span class="_cic" id="_cIco">🛢</span>
      <span class="_cnm" id="_cNam">—</span>
    </div>
  </div>
  <div class="_cnr">
    <button class="_clk" id="_cLck" title="قفل التطبيق">🔒</button>
  </div>
</div>

<div class="_ctb">
  <button class="_cb _sel" id="_cSel">
    <span class="_cdir">▼ بيع</span>
    <span class="_cpx" id="_cSpx">—</span>
  </button>
  <div class="_cmd">
    <span class="_cql">الكمية</span>
    <div class="_cqr">
      <input class="_cqi" id="_cQty" type="number"
             min="0" step="any" inputmode="decimal" value="1">
      <span class="_cqu" id="_cQun">—</span>
    </div>
  </div>
  <button class="_cb _buy" id="_cBuy">
    <span class="_cdir">▲ شراء</span>
    <span class="_cpx" id="_cBpx">—</span>
  </button>
</div>

<div class="_ctw" id="_cWrap">
  <div id="_tvC"></div>
  <div class="_cload" id="_cLoad"><div class="_cspin"></div></div>
</div>`;

    $$('_cBack').onclick = () => ChartModule.close();
    $$('_cLck').onclick  = () => typeof lockApp !== 'undefined' && lockApp(true);
    $$('_cBuy').onclick  = () => _showConfirm(true);
    $$('_cSel').onclick  = () => _showConfirm(false);

    // Track user edits on qty input
    const qi = $$('_cQty');
    if (qi) {
      qi.addEventListener('input', () => { qi._userEdited = true; });
      qi.addEventListener('blur',  () => { if (!qi.value || +qi.value <= 0) qi._userEdited = false; });
    }
  }

  /* ─── Header ─── */
  function _setHeader(sym) {
    const a  = _aset(sym);
    const ic = $$('_cIco'), nm = $$('_cNam');
    const qu = $$('_cQun'), qi = $$('_cQty');
    if (ic) ic.textContent = a.icon || '📊';
    if (nm) nm.textContent = a.name || sym;
    if (qu) qu.textContent = a.unit || '';
    if (qi && !qi._userEdited) {
      qi.value = a.presets?.[0] ?? 1;
    }
    _refreshPxBtns();
  }

  function _refreshPxBtns() {
    const mid = _px(_sym);
    if (!mid) return;
    const a = _aset(_sym);
    const b = $$('_cBpx'), s = $$('_cSpx');
    if (b) b.textContent = '$' + mid.toFixed(a.pxDp);
    if (s) s.textContent = '$' + mid.toFixed(a.pxDp);
  }

  /* ══════════════════════════════════════════════
     Datafeed
  ══════════════════════════════════════════════ */
  const Datafeed = {
    onReady(cb) {
      setTimeout(() => cb({
        supported_resolutions: ['1','3','5','15','30','60','120','240','D'],
        exchanges:    [{ value:'HL', name:'Hyperliquid', desc:'' }],
        symbols_types:[{ name:'crypto', value:'crypto' }],
        supports_marks: false,
        supports_timescale_marks: false,
      }), 0);
    },

    searchSymbols(query, exchange, type, cb) {
      if (typeof ASSETS === 'undefined') { cb([]); return; }
      const ql = (query || '').toLowerCase();
      cb(Object.keys(ASSETS).map(s => ({
        symbol: s, full_name: s, ticker: s,
        description: ASSETS[s].name || s,
        exchange: 'Hyperliquid', type: 'crypto',
      })).filter(x =>
        x.symbol.toLowerCase().includes(ql) ||
        x.description.toLowerCase().includes(ql)
      ));
    },

    resolveSymbol(name, onResolve) {
      const a = _aset(name), dp = a.pxDp || 2;
      setTimeout(() => onResolve({
        name, ticker: name,
        description: a.name || name,
        type: 'crypto', session: '24x7',
        exchange: 'Hyperliquid', listed_exchange: 'Hyperliquid',
        timezone: 'Etc/UTC', format: 'price',
        pricescale: Math.pow(10, dp), minmov: 1,
        has_intraday: true, has_daily: true, has_weekly_and_monthly: false,
        intraday_multipliers: ['1','3','5','15','30','60','120','240'],
        supported_resolutions: ['1','3','5','15','30','60','120','240','D'],
        volume_precision: 4, data_status: 'streaming',
      }), 0);
    },

    async getBars(symbolInfo, resolution, periodParams, onResult, onError) {
      try {
        const iv   = RES[resolution] || '1h';
        const sym  = symbolInfo.ticker;
        const gram = _gram(sym);
        const r    = await fetch(HL_API + '/info', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'candleSnapshot',
            req: {
              coin:      _coin(sym),
              interval:  iv,
              startTime: periodParams.from * 1000,
              endTime:   periodParams.to   * 1000,
            }
          })
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const raw = await r.json();
        if (!Array.isArray(raw) || !raw.length) { onResult([], { noData: true }); return; }
        const bars = raw.map(c => ({
          time:   Math.floor(c.t / 1000),
          open:   gram ? +c.o / TL : +c.o,
          high:   gram ? +c.h / TL : +c.h,
          low:    gram ? +c.l / TL : +c.l,
          close:  gram ? +c.c / TL : +c.c,
          volume: +c.v || 0,
        })).sort((a, b) => a.time - b.time);
        onResult(bars, { noData: false });
      } catch (e) {
        onError(e.message);
      }
    },

    subscribeBars(symbolInfo, resolution, onTick, uid) {
      _subs[uid] = { sym: symbolInfo.ticker, cb: onTick };
      _rtConn(symbolInfo.ticker, resolution);
    },

    unsubscribeBars(uid) {
      delete _subs[uid];
      if (!Object.keys(_subs).length) _rtDis();
    },
  };

  /* ══════════════════════════════════════════════
     Realtime WebSocket (candle feed)
  ══════════════════════════════════════════════ */
  function _rtConn(sym, res) {
    const coin = _coin(sym), iv = RES[res] || '1h';
    if (_rtWs && _rtWs.readyState <= 1 && _rtCoin === coin && _rtIv === iv) return;
    _rtDis();
    _rtCoin = coin; _rtIv = iv;
    try {
      _rtWs = new WebSocket(HL_WS);
      _rtWs.onopen = () => {
        if (!_rtWs) return;
        _rtWs.send(JSON.stringify({
          method: 'subscribe',
          subscription: { type: 'candle', coin, interval: iv }
        }));
      };
      _rtWs.onmessage = e => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.channel !== 'candle' || !msg.data) return;
          const c = msg.data, gram = _gram(_sym);
          const bar = {
            time:   Math.floor(c.t / 1000),
            open:   gram ? +c.o / TL : +c.o,
            high:   gram ? +c.h / TL : +c.h,
            low:    gram ? +c.l / TL : +c.l,
            close:  gram ? +c.c / TL : +c.c,
            volume: +c.v || 0,
          };
          Object.values(_subs).forEach(sub => { try { sub.cb(bar); } catch {} });
        } catch {}
      };
      _rtWs.onclose = () => {
        if (_visible && Object.keys(_subs).length)
          _rtTimer = setTimeout(() => _rtConn(_sym, _res), 5000);
      };
      _rtWs.onerror = () => {};
    } catch (e) {
      console.warn('[ChartRT]', e.message);
    }
  }

  function _rtDis() {
    clearTimeout(_rtTimer);
    if (_rtWs) { try { _rtWs.close(); } catch {} _rtWs = null; }
    _rtCoin = null; _rtIv = null;
  }

  /* ══════════════════════════════════════════════
     Widget lifecycle
  ══════════════════════════════════════════════ */
  function _destroy() {
    clearTimeout(_layoutTmr);
    _subs  = {};
    _ready = false;
    _rtDis();

    if (_widget) {
      try { _widget.remove(); } catch {}
      _widget = null;
    }

    const c = $$('_tvC');
    if (c) c.innerHTML = '';

    // Show loading overlay for next init
    const load = $$('_cLoad');
    if (load) {
      load.classList.remove('hidden');
      load.style.opacity = '1';
    }
  }

  /* Poll until _cWrap has real pixel height (handles CSS transitions) */
  function _waitForLayout(cb, tries) {
    clearTimeout(_layoutTmr);
    tries = tries || 0;
    const wrap = $$('_cWrap');
    if (wrap && wrap.getBoundingClientRect().height > 40) {
      cb();
      return;
    }
    if (tries < 50) {
      _layoutTmr = setTimeout(() => _waitForLayout(cb, tries + 1), 16);
    } else {
      cb(); // force through after ~800ms
    }
  }

  function _createWidget(sym) {
    if (typeof TradingView === 'undefined' || typeof TradingView.widget !== 'function') {
      const c    = $$('_tvC');
      const load = $$('_cLoad');
      if (load) load.classList.add('hidden');
      if (c) c.innerHTML = `
        <div class="_cerr">
          <div class="_cerr-ico">⚠️</div>
          <div class="_cerr-msg">
            تعذّر تحميل مكتبة الرسم البياني<br>
            <small style="opacity:.6;font-size:11px">
              تأكد من وجود /charting_library/charting_library.standalone.js
            </small>
          </div>
        </div>`;
      return;
    }

    const dark = document.documentElement.getAttribute('data-theme') !== 'light';
    const bg   = dark ? '#000000' : '#ffffff';

    try {
      _widget = new TradingView.widget({
        autosize:      true,
        symbol:        sym,
        interval:      _res,
        container:     '_tvC',
        datafeed:      Datafeed,
        library_path:  '/charting_library/',
        locale:        'en',
        timezone:      'Asia/Baghdad',
        theme:         dark ? 'Dark' : 'Light',
        style:         '1',
        debug:         false,
        enable_publishing:   false,
        allow_symbol_change: false,
        save_image:          false,
        loading_screen: { backgroundColor: bg, foregroundColor: '#ff8c42' },
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
        ],
        overrides: {
          'mainSeriesProperties.candleStyle.upColor':         '#00e676',
          'mainSeriesProperties.candleStyle.downColor':       '#ff3d3d',
          'mainSeriesProperties.candleStyle.borderUpColor':   '#00e676',
          'mainSeriesProperties.candleStyle.borderDownColor': '#ff3d3d',
          'mainSeriesProperties.candleStyle.wickUpColor':     '#00e676',
          'mainSeriesProperties.candleStyle.wickDownColor':   '#ff3d3d',
          'paneProperties.background':                         bg,
          'paneProperties.backgroundType':                    'solid',
          'paneProperties.vertGridProperties.color':  dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)',
          'paneProperties.horzGridProperties.color':  dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)',
          'scalesProperties.textColor':               dark ? '#a0a0a0' : '#555555',
          'scalesProperties.fontSize':                11,
          'scalesProperties.backgroundColor':         dark ? '#0a0a0a' : '#f5f5f5',
        },
      });

      _widget.onChartReady(() => {
        _ready = true;
        _res   = '60';

        // Hide loading
        const load = $$('_cLoad');
        if (load) {
          load.style.opacity = '0';
          setTimeout(() => load.classList.add('hidden'), 300);
        }

        // Track interval changes for RT subscription
        try {
          _widget.activeChart().onIntervalChanged().subscribe(null, iv => {
            _res = iv;
            _rtDis();
            _rtConn(_sym, iv);
          });
        } catch {}

        _refreshPxBtns();
      });

    } catch (e) {
      console.error('[Chart] widget error:', e);
      const load = $$('_cLoad');
      if (load) load.classList.add('hidden');
    }
  }

  function _initWidget(sym) {
    _destroy();
    _waitForLayout(() => _createWidget(sym));
  }

  /* ══════════════════════════════════════════════
     Confirm sheet
  ══════════════════════════════════════════════ */
  function _hideConfirm() {
    $$('_cfOv')?.remove();
  }

  function _showConfirm(isBuy) {
    if (typeof State === 'undefined' || !State.wallet) {
      typeof toast !== 'undefined' && toast('سجّل الدخول أولاً', 'err');
      return;
    }
    const qty = parseFloat($$('_cQty')?.value || 0);
    if (!qty || qty <= 0) {
      typeof toast !== 'undefined' && toast('أدخل الكمية', 'err');
      return;
    }

    const a    = _aset(_sym);
    const gram = _gram(_sym);
    const mid  = _px(_sym);
    if (!mid) {
      typeof toast !== 'undefined' && toast('لا يوجد سعر حالياً', 'err');
      return;
    }

    const midOz = gram ? mid * TL : mid;
    const qtyOz = gram ? qty / TL : qty;
    const usd   = (midOz * qtyOz).toFixed(2);
    const mgn   = (midOz * qtyOz / a.lev).toFixed(2);
    const liqOz = isBuy
      ? midOz * (1 - 1/a.lev + 0.5/a.lev)
      : midOz * (1 + 1/a.lev - 0.5/a.lev);
    const liqD  = gram ? (liqOz / TL).toFixed(a.pxDp) : liqOz.toFixed(a.pxDp);

    _hideConfirm();
    const wrap = $$('_cWrap');
    if (!wrap) return;

    const ov = document.createElement('div');
    ov.id        = '_cfOv';
    ov.className = '_cfo';
    ov.innerHTML = `
<div class="_cfc">
  <div class="_cfhndl"></div>
  <div class="_cftitle" style="color:${isBuy ? '#00e676' : '#ff3d3d'}">
    ${a.icon || '📊'} ${isBuy ? 'شراء ▲' : 'بيع ▼'} — ${a.name}
  </div>
  <div class="_cfrows">
    <div class="_cfrow"><span class="_cfk">الكمية</span><span class="_cfv">${qty.toFixed(gram ? 2 : a.szDp)} ${a.unit}</span></div>
    <div class="_cfrow"><span class="_cfk">السعر</span><span class="_cfv">$${mid.toFixed(a.pxDp)}</span></div>
    <div class="_cfrow"><span class="_cfk">القيمة</span><span class="_cfv">≈ $${usd}</span></div>
    <div class="_cfrow"><span class="_cfk">الهامش</span><span class="_cfv w">≈ $${mgn}</span></div>
    <div class="_cfrow"><span class="_cfk">التصفية التقريبية</span><span class="_cfv ${isBuy ? 'r' : 'g'}">≈ $${liqD}</span></div>
  </div>
  <div class="_cfbtns">
    <button class="_cfca" id="_cfC">إلغاء ✕</button>
    <button class="_cfex ${isBuy ? 'g' : 'r'}" id="_cfX">
      ${isBuy ? '✅ تأكيد الشراء' : '✅ تأكيد البيع'}
    </button>
  </div>
</div>`;

    wrap.appendChild(ov);
    ov.addEventListener('click', e => { if (e.target === ov) _hideConfirm(); });
    $$('_cfC').onclick = _hideConfirm;
    $$('_cfX').onclick = () => {
      if (typeof requirePin !== 'undefined') {
        requirePin(() => _execTrade(isBuy, qty));
      } else {
        _execTrade(isBuy, qty);
      }
    };
  }

  async function _execTrade(isBuy, qty) {
    if (typeof State === 'undefined' || !State.wallet) return;
    const btn = $$('_cfX');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="_cfspinner"></span>'; }

    const gram  = _gram(_sym);
    const aApi  = gram ? (typeof ASSETS !== 'undefined' ? ASSETS['GOLD'] : _aset(_sym)) : _aset(_sym);
    const mid   = _px(_sym);
    const midOz = gram ? mid * TL : mid;
    if (!midOz) { _hideConfirm(); return; }
    const qtyOz = gram ? qty / TL : qty;

    try {
      try {
        await hlExchange({ type:'updateLeverage', asset:aApi.idx, isCross:aApi.cross, leverage:aApi.lev });
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

      _hideConfirm();
      const da   = _aset(_sym);
      const disp = gram ? qty.toFixed(2) + ' غرام' : qty.toFixed(da.szDp) + ' ' + da.unit;
      typeof toast !== 'undefined' && toast(
        `✅ ${da.icon || ''} ${isBuy ? 'شراء' : 'بيع'} ${disp}`, 'ok', 4000
      );
      if (typeof pollAccount !== 'undefined') setTimeout(pollAccount, 2000);

    } catch (e) {
      const msg = typeof tradeErr !== 'undefined' ? tradeErr(e.message) : '❌ ' + e.message.slice(0, 100);
      typeof toast !== 'undefined' && toast(msg, 'err', 5000);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = isBuy ? '✅ تأكيد الشراء' : '✅ تأكيد البيع';
      }
    }
  }

  /* ══════════════════════════════════════════════
     Public API
  ══════════════════════════════════════════════ */
  function open(sym) {
    _sym     = sym || (typeof State !== 'undefined' ? State.asset : 'CL');
    _res     = '60';
    _visible = true;

    _build();

    const sc = $$('chartScreen');
    if (sc) sc.classList.remove('hidden');

    _setHeader(_sym);
    _initWidget(_sym);
  }

  function close() {
    _visible = false;
    _hideConfirm();
    _destroy();
    $$('chartScreen')?.classList.add('hidden');
  }

  function switchAssetChart(sym) {
    if (!_visible || sym === _sym) return;
    const prev = _sym;
    _sym = sym;
    _setHeader(sym);

    // Fast path: setSymbol without recreating widget
    if (_widget && _ready) {
      try {
        _widget.activeChart().setSymbol(sym, () => {
          _rtDis();
          _rtConn(_coin(sym), _res);
        });
        return;
      } catch (e) {
        console.warn('[Chart] setSymbol failed, recreating:', e.message);
      }
    }

    // Fallback: full recreate
    _initWidget(sym);
  }

  function switchInterval(iv) {
    if (!_widget || !_ready) return;
    try { _widget.activeChart().setResolution(iv, () => { _res = iv; }); } catch {}
  }

  function refreshLines() {} // no-op — kept for API compatibility

  return { open, close, switchInterval, switchAssetChart, refreshLines };
})();
