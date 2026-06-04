'use strict';

/* ═══════════════════════════════════════════════════════════════
   chart.js — TradingView Advanced Charts + Hyperliquid API
   Library : /charting_library/charting_library.standalone.js
   Data    : api.hyperliquid.xyz  (candleSnapshot + WS candle)
   Assets  : CL · GOLD · XAU · SILVER · NQ
═══════════════════════════════════════════════════════════════ */

const ChartModule = (function () {

  /* ─── API endpoints ─── */
  const HL_API = 'https://api.hyperliquid.xyz';
  const HL_WS  = 'wss://api.hyperliquid.xyz/ws';
  const TROY   = 31.1035;

  /* ─── TradingView resolution → Hyperliquid interval ─── */
  const TV2HL = {
    '1':'1m','3':'3m','5':'5m','15':'15m','30':'30m',
    '60':'1h','120':'2h','240':'4h',
    'D':'1d','1D':'1d'
  };

  /* ─── Module state ─── */
  let _widget    = null;   // TradingView widget instance
  let _visible   = false;  // chart screen is open
  let _sym       = 'CL';   // current asset symbol
  let _res       = '60';   // current resolution (TV format)
  let _built     = false;  // HTML built flag
  let _subs      = {};     // { listenerGuid: { sym, cb } }
  let _rtWs      = null;   // realtime candle WS
  let _rtTimer   = null;   // reconnect timer
  let _rtCoin    = null;   // coin currently subscribed
  let _rtIv      = null;   // interval currently subscribed
  let _layoutTmr = null;   // layout-wait timer
  let _ro        = null;   // ResizeObserver
  let _shapeIds  = [];     // position-line shape IDs on chart
  let _lastBar   = null;   // most recent bar from datafeed or RT

  /* ─── Shortcuts into app globals ─── */
  const $$    = id => document.getElementById(id);
  const _coin = s  => (typeof ASSETS !== 'undefined' && ASSETS[s]?.coin) || ('xyz:' + s);
  const _gram = s  => !!(typeof ASSETS !== 'undefined' && ASSETS[s]?.gram);
  const _aset = s  => (typeof ASSETS !== 'undefined' && ASSETS[s]) ||
                      { pxDp:2, szDp:2, name:s, unit:'', icon:'📊',
                        lev:10, presets:[1], idx:0, cross:true, gram:false };
  const _spx  = s  => (typeof State !== 'undefined' ? State.prices?.[s]?.mid : 0) || 0;
  const dark  = () => document.documentElement.getAttribute('data-theme') !== 'light';

  /* ═══════════════════════════════════════════════════════════
     CSS  (injected once)
  ═══════════════════════════════════════════════════════════ */
  (function injectCSS() {
    if ($$('_tvChartCSS')) return;
    const el = document.createElement('style');
    el.id = '_tvChartCSS';
    el.textContent = `
/* ── Screen ── */
.chart-screen{position:fixed;inset:0;z-index:50;display:flex;flex-direction:column;
  background:var(--bg-app);overflow:hidden;}
.chart-screen.hidden{display:none!important;}

/* ── Top nav ── */
.cn{display:flex;align-items:center;justify-content:space-between;
  padding:7px 11px;background:var(--bg-card);
  border-bottom:1px solid var(--border);flex-shrink:0;
  gap:8px;direction:rtl;min-height:46px;}
.cn-l,.cn-r{display:flex;align-items:center;gap:7px;}
.cn-back{padding:6px 14px;border-radius:999px;
  border:1.5px solid rgba(255,140,66,.3);
  background:rgba(255,140,66,.1);color:var(--hc-ac,#ff8c42);
  font-size:12px;font-weight:800;font-family:'Cairo',sans-serif;
  cursor:pointer;-webkit-tap-highlight-color:transparent;}
.cn-back:active{opacity:.7;}
.cn-asset{display:flex;align-items:center;gap:5px;}
.cn-ico{font-size:16px;line-height:1;}
.cn-name{font-size:13px;font-weight:900;color:var(--text-primary);}
.cn-price{font-family:'IBM Plex Mono',monospace;font-size:13px;
  font-weight:800;color:var(--text-primary);min-width:60px;}
.cn-lock{background:none;border:none;font-size:15px;cursor:pointer;
  color:var(--text-secondary);padding:3px;}
.cn-ws{font-size:12px;flex-shrink:0;}

/* ── Trade bar ── */
.ctb{display:flex;align-items:center;gap:6px;
  padding:6px 8px;background:var(--bg-card);
  border-bottom:1px solid var(--border);flex-shrink:0;
  direction:rtl;}
.ctb-btn{flex:1;min-height:50px;padding:5px 3px;border-radius:13px;
  border:none;font-family:'Cairo',sans-serif;cursor:pointer;color:#fff;
  display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:2px;
  -webkit-tap-highlight-color:transparent;
  transition:transform .12s,filter .12s;}
.ctb-btn:active{transform:scale(.93);filter:brightness(.87);}
.ctb-buy {background:linear-gradient(150deg,#00e676,#007c3a);
           box-shadow:0 2px 10px rgba(0,200,80,.3);}
.ctb-sell{background:linear-gradient(150deg,#ff3d3d,#a00000);
           box-shadow:0 2px 10px rgba(220,50,50,.3);}
.ctb-dir{font-size:14px;font-weight:900;line-height:1;}
.ctb-px {font-family:'IBM Plex Mono',monospace;font-size:10px;
          opacity:.82;font-weight:700;}
.ctb-mid{flex:1.1;display:flex;flex-direction:column;
         align-items:center;gap:3px;}
.ctb-lbl{font-size:9px;color:var(--text-muted);
          font-weight:700;letter-spacing:.5px;text-transform:uppercase;}
.ctb-row{display:flex;align-items:center;gap:4px;}
.ctb-in{width:76px;font-family:'IBM Plex Mono',monospace;
  font-size:18px;font-weight:700;text-align:center;direction:ltr;
  background:var(--bg-input);border:2px solid var(--border-strong);
  border-radius:10px;padding:5px 3px;color:var(--text-primary);
  outline:none;-webkit-tap-highlight-color:transparent;
  font-size:max(16px,1em);}
.ctb-in:focus{border-color:var(--hc-ac,#ff8c42);}
.ctb-unit{font-size:9px;color:var(--text-secondary);
           font-weight:700;white-space:nowrap;}

/* ── Chart wrapper ── */
.cw{flex:1;min-height:0;position:relative;overflow:hidden;
    background:var(--bg-app);}
#_tvC{position:absolute;top:0;left:0;overflow:hidden;}
#_tvC iframe{border:none!important;display:block;}

/* ── Error overlay ── */
.c-err{position:absolute;inset:0;z-index:5;
  display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:12px;padding:24px;
  background:var(--bg-app);
  font-family:'Cairo',sans-serif;text-align:center;direction:rtl;}
.c-err-ico{font-size:36px;}
.c-err-msg{font-size:14px;font-weight:800;color:var(--text-primary);line-height:1.6;}
.c-err-sub{font-size:11px;color:var(--text-secondary);
           font-family:monospace;line-height:1.9;
           background:var(--bg-elev);padding:10px 14px;
           border-radius:8px;text-align:left;direction:ltr;
           max-width:360px;word-break:break-all;}

/* ── Confirm overlay ── */
.cfo{position:absolute;inset:0;z-index:90;
  display:flex;align-items:flex-end;justify-content:center;
  background:rgba(0,0,0,.68);backdrop-filter:blur(12px);
  -webkit-backdrop-filter:blur(12px);direction:rtl;}
.cfc{background:var(--bg-card);
  border-top:2px solid var(--border-strong);
  border-radius:22px 22px 0 0;width:100%;max-width:500px;
  padding:14px 15px max(28px,env(safe-area-inset-bottom));
  animation:cfSU .22s cubic-bezier(.4,0,.2,1);}
@keyframes cfSU{from{transform:translateY(100%)}to{transform:none}}
.cfh{width:32px;height:4px;background:var(--border-strong);
     border-radius:999px;margin:0 auto 12px;}
.cft{font-size:16px;font-weight:900;margin-bottom:3px;
     color:var(--text-primary);}
.cfs{font-size:11px;color:var(--text-secondary);margin-bottom:10px;}
.cfr{background:var(--bg-input);border-radius:12px;
     padding:8px 12px;margin-bottom:12px;
     border:1px solid var(--border);}
.cfrow{display:flex;justify-content:space-between;align-items:center;
       padding:6px 0;border-bottom:1px solid var(--border);}
.cfrow:last-child{border:none;}
.cfk{font-size:12px;color:var(--text-secondary);font-weight:700;}
.cfv{font-family:'IBM Plex Mono',monospace;
     font-size:13px;font-weight:900;color:var(--text-primary);}
.cfv.g{color:var(--hc-up,#00e676);}
.cfv.r{color:var(--hc-dn,#ff3d3d);}
.cfv.w{color:var(--hc-warn,#ffd600);}
.cfbtns{display:grid;grid-template-columns:1fr 1fr;gap:9px;}
.cfca{padding:13px;border-radius:999px;
  border:1.5px solid var(--border-strong);
  background:var(--bg-elev);color:var(--text-secondary);
  font-size:13px;font-weight:700;cursor:pointer;
  font-family:'Cairo',sans-serif;}
.cfex{padding:13px;border-radius:999px;border:none;color:#fff;
  font-size:13px;font-weight:900;cursor:pointer;
  font-family:'Cairo',sans-serif;
  display:flex;align-items:center;justify-content:center;gap:5px;
  transition:filter .15s;}
.cfex.g{background:linear-gradient(135deg,var(--hc-up,#00e676),#007c3a);
         box-shadow:0 2px 10px rgba(0,200,80,.3);}
.cfex.r{background:linear-gradient(135deg,var(--hc-dn,#ff3d3d),#a00000);
         box-shadow:0 2px 10px rgba(220,50,50,.3);}
.cfex:hover{filter:brightness(1.1);}
.cfex:active{filter:brightness(.85);}
.cfex:disabled{opacity:.5;pointer-events:none;}
.cfsp{width:14px;height:14px;
  border:2.5px solid rgba(255,255,255,.3);
  border-top-color:#fff;border-radius:50%;
  animation:cfSP .7s linear infinite;}
@keyframes cfSP{to{transform:rotate(360deg)}}
`;
    document.head.appendChild(el);
  })();

  /* ═══════════════════════════════════════════════════════════
     DATAFEED  — custom Hyperliquid implementation
     Implements the TradingView Charting Library IBasicDataFeed
     interface: onReady · searchSymbols · resolveSymbol ·
     getBars · subscribeBars · unsubscribeBars
  ═══════════════════════════════════════════════════════════ */
  const Datafeed = {

    /* Called once when the widget initialises.
       Must call cb asynchronously (setTimeout 0). */
    onReady(cb) {
      console.log('[TV:datafeed] onReady');
      setTimeout(() => {
        cb({
          supported_resolutions: ['1','5','15','30','60','240','D'],
          exchanges: [{ value:'HL', name:'Hyperliquid', desc:'Hyperliquid Perps' }],
          symbols_types: [{ name:'crypto', value:'crypto' }],
          supports_marks: false,
          supports_timescale_marks: false,
        });
      }, 0);
    },

    /* Symbol search — filter project assets by query string. */
    searchSymbols(query, exchange, type, cb) {
      if (typeof ASSETS === 'undefined') { cb([]); return; }
      const q = (query || '').toLowerCase();
      cb(
        Object.keys(ASSETS)
          .filter(s => s !== 'XAU')           // XAU is display-only alias
          .map(s => ({
            symbol:      s,
            full_name:   s,
            ticker:      s,
            description: ASSETS[s].name || s,
            exchange:    'Hyperliquid',
            type:        'crypto',
          }))
          .filter(x =>
            x.symbol.toLowerCase().includes(q) ||
            x.description.toLowerCase().includes(q)
          )
      );
    },

    /* Resolve a symbol name into a LibrarySymbolInfo object.
       Must call onResolve asynchronously. */
    resolveSymbol(name, onResolve, onError) {
      console.log('[TV:datafeed] resolveSymbol:', name);
      const a  = _aset(name);
      const dp = a.pxDp || 2;
      setTimeout(() => {
        onResolve({
          name:             name,
          ticker:           name,
          description:      a.name || name,
          type:             'crypto',
          session:          '24x7',
          exchange:         'Hyperliquid',
          listed_exchange:  'Hyperliquid',
          timezone:         'Etc/UTC',
          format:           'price',
          pricescale:       Math.pow(10, dp),
          minmov:           1,
          has_intraday:     true,
          has_daily:        true,
          has_weekly_and_monthly: false,
          intraday_multipliers: ['1','5','15','30','60','120','240'],
          supported_resolutions: ['1','5','15','30','60','240','D'],
          volume_precision: 4,
          data_status:      'streaming',
        });
      }, 0);
    },

    /* Fetch historical bars from Hyperliquid candleSnapshot API.
       periodParams: { from, to, firstDataRequest, countBack }
       from/to are Unix seconds. */
    async getBars(symbolInfo, resolution, periodParams, onResult, onError) {
      const sym  = symbolInfo.ticker;
      const iv   = TV2HL[resolution] || '1h';
      const gram = _gram(sym);
      const from = periodParams.from;   // seconds
      const to   = periodParams.to;     // seconds

      console.log(
        `[TV:datafeed] getBars ${sym} ${resolution}→${iv}` +
        ` ${new Date(from*1000).toISOString().slice(0,16)}` +
        ` → ${new Date(to*1000).toISOString().slice(0,16)}` +
        ` first=${periodParams.firstDataRequest}`
      );

      try {
        const resp = await fetch(HL_API + '/info', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'candleSnapshot',
            req: {
              coin:      _coin(sym),
              interval:  iv,
              startTime: from * 1000,   // → milliseconds
              endTime:   to   * 1000,
            }
          })
        });

        if (!resp.ok) throw new Error('HTTP ' + resp.status);

        const raw = await resp.json();

        /* Hyperliquid returns [] when no data in range — tell TradingView */
        if (!Array.isArray(raw) || raw.length === 0) {
          console.log('[TV:datafeed] getBars noData for', sym, iv);
          onResult([], { noData: true });
          return;
        }

        const bars = raw
          .map(c => ({
            time:   Math.floor(c.t / 1000),   // ms → seconds
            open:   gram ? +c.o / TROY : +c.o,
            high:   gram ? +c.h / TROY : +c.h,
            low:    gram ? +c.l / TROY : +c.l,
            close:  gram ? +c.c / TROY : +c.c,
            volume: +c.v || 0,
          }))
          .sort((a, b) => a.time - b.time);

        console.log(`[TV:datafeed] getBars → ${bars.length} bars`);

        /* Cache last bar for price display */
        if (bars.length > 0) {
          _lastBar = bars[bars.length - 1];
          _syncPriceDisplay();
        }

        onResult(bars, { noData: false });

      } catch (e) {
        console.error('[TV:datafeed] getBars error:', e.message);
        onError(e.message);
      }
    },

    /* Called when TradingView needs live updates for the current symbol.
       We open a WebSocket to Hyperliquid's candle channel. */
    subscribeBars(symbolInfo, resolution, onTick, listenerGuid) {
      console.log('[TV:datafeed] subscribeBars', symbolInfo.ticker, resolution, listenerGuid);
      _subs[listenerGuid] = { sym: symbolInfo.ticker, cb: onTick };
      _rtConnect(symbolInfo.ticker, resolution);
    },

    /* Called when TradingView no longer needs live updates. */
    unsubscribeBars(listenerGuid) {
      console.log('[TV:datafeed] unsubscribeBars', listenerGuid);
      delete _subs[listenerGuid];
      if (Object.keys(_subs).length === 0) _rtClose();
    },
  };

  /* ═══════════════════════════════════════════════════════════
     REALTIME WEBSOCKET  — Hyperliquid candle channel
  ═══════════════════════════════════════════════════════════ */
  function _rtConnect(sym, res) {
    const coin = _coin(sym);
    const iv   = TV2HL[res] || '1h';

    /* Already connected to the same channel — nothing to do */
    if (_rtWs && _rtWs.readyState <= 1 && _rtCoin === coin && _rtIv === iv) return;

    _rtClose();
    _rtCoin = coin;
    _rtIv   = iv;

    console.log('[TV:ws] connecting', coin, iv);

    try {
      _rtWs = new WebSocket(HL_WS);

      _rtWs.onopen = () => {
        console.log('[TV:ws] open — subscribing candle', coin, iv);
        _rtWs.send(JSON.stringify({
          method: 'subscribe',
          subscription: { type: 'candle', coin, interval: iv }
        }));
        /* Update WS dot to green */
        const dot = $$('_cWsDot');
        if (dot) dot.textContent = '🟢';
      };

      _rtWs.onmessage = e => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.channel !== 'candle' || !msg.data) return;

          const c    = msg.data;
          const gram = _gram(_sym);
          const bar  = {
            time:   Math.floor(c.t / 1000),
            open:   gram ? +c.o / TROY : +c.o,
            high:   gram ? +c.h / TROY : +c.h,
            low:    gram ? +c.l / TROY : +c.l,
            close:  gram ? +c.c / TROY : +c.c,
            volume: +c.v || 0,
          };

          /* Push to all TradingView subscribers */
          Object.values(_subs).forEach(s => {
            try { s.cb(bar); } catch {}
          });

          /* Update local cache + UI */
          _lastBar = bar;
          _syncPriceDisplay();
        } catch {}
      };

      _rtWs.onclose = () => {
        console.log('[TV:ws] closed');
        const dot = $$('_cWsDot');
        if (dot) dot.textContent = '🔴';
        /* Auto-reconnect if chart is still open and has subscribers */
        if (_visible && Object.keys(_subs).length > 0) {
          _rtTimer = setTimeout(() => _rtConnect(_sym, _res), 4000);
        }
      };

      _rtWs.onerror = () => {
        console.warn('[TV:ws] error');
      };

    } catch (e) {
      console.error('[TV:ws] connect error:', e.message);
    }
  }

  function _rtClose() {
    clearTimeout(_rtTimer);
    if (_rtWs) { try { _rtWs.close(); } catch {} _rtWs = null; }
    _rtCoin = null;
    _rtIv   = null;
  }

  /* ═══════════════════════════════════════════════════════════
     PRICE DISPLAY HELPERS
  ═══════════════════════════════════════════════════════════ */
  function _syncPriceDisplay() {
    if (!_lastBar) return;
    const a   = _aset(_sym);
    const px  = _lastBar.close;
    const el  = $$('_cNavPrice');
    if (el) el.textContent = '$' + px.toFixed(a.pxDp);
    _updateTradeBarPrices(px);
  }

  function _updateTradeBarPrices(px) {
    if (!px) return;
    const a  = _aset(_sym);
    const bp = $$('_cBuyPx'), sp = $$('_cSellPx');
    if (bp) bp.textContent = '$' + px.toFixed(a.pxDp);
    if (sp) sp.textContent = '$' + px.toFixed(a.pxDp);
  }

  /* ═══════════════════════════════════════════════════════════
     SCREEN HTML  (built once, kept for the session)
  ═══════════════════════════════════════════════════════════ */
  function _build() {
    if (_built) return;
    const sc = $$('chartScreen');
    if (!sc) return;
    _built = true;

    sc.innerHTML = `
<!-- ── nav ── -->
<div class="cn">
  <div class="cn-l">
    <button class="cn-back" id="_cBack">← رجوع</button>
    <div class="cn-asset">
      <span class="cn-ico"  id="_cNavIco">🛢</span>
      <span class="cn-name" id="_cNavName">—</span>
      <span class="cn-price" id="_cNavPrice">—</span>
    </div>
  </div>
  <div class="cn-r">
    <button class="cn-lock" id="_cLock" title="قفل">🔒</button>
    <span   class="cn-ws"   id="_cWsDot">⏳</span>
  </div>
</div>

<!-- ── trade bar ── -->
<div class="ctb" id="_cTradeBar">
  <button class="ctb-btn ctb-sell" id="_cSell">
    <span class="ctb-dir">▼ بيع</span>
    <span class="ctb-px"  id="_cSellPx">—</span>
  </button>
  <div class="ctb-mid">
    <span class="ctb-lbl">الكمية</span>
    <div class="ctb-row">
      <input class="ctb-in" id="_cQtyIn"
             type="number" value="1" min="0"
             step="any" inputmode="decimal">
      <span class="ctb-unit" id="_cQtyUnit"></span>
    </div>
  </div>
  <button class="ctb-btn ctb-buy" id="_cBuy">
    <span class="ctb-dir">▲ شراء</span>
    <span class="ctb-px"  id="_cBuyPx">—</span>
  </button>
</div>

<!-- ── chart container ── -->
<div class="cw" id="_cWrap">
  <div id="_tvC"></div>
</div>`;

    /* Wire up static buttons */
    $$('_cBack').onclick = () => ChartModule.close();
    $$('_cLock').onclick = () => typeof lockApp === 'function' && lockApp(true);
    $$('_cBuy').onclick  = () => _showConfirm(true);
    $$('_cSell').onclick = () => _showConfirm(false);
  }

  function _updateHeader(sym) {
    const a = _aset(sym);
    const ico  = $$('_cNavIco'),  nm = $$('_cNavName');
    const unit = $$('_cQtyUnit'), qi = $$('_cQtyIn');
    if (ico)  ico.textContent  = a.icon || '📊';
    if (nm)   nm.textContent   = a.name || sym;
    if (unit) unit.textContent = a.unit || '';
    if (qi)   qi.value         = a.presets?.[0] ?? 1;

    /* Seed price display from app State if available */
    const spx = _spx(sym);
    if (spx > 0) {
      const el = $$('_cNavPrice');
      if (el) el.textContent = '$' + spx.toFixed(a.pxDp);
      _updateTradeBarPrices(spx);
      _lastBar = null;  // will update from datafeed
    }
  }

  /* ═══════════════════════════════════════════════════════════
     CONFIRM OVERLAY  (buy / sell)
  ═══════════════════════════════════════════════════════════ */
  function _showConfirm(isBuy) {
    if (typeof State === 'undefined' || !State.wallet) {
      typeof toast !== 'undefined' && toast('سجّل الدخول أولاً', 'err');
      return;
    }
    const qty = parseFloat($$('_cQtyIn')?.value || 0);
    if (!qty || qty <= 0) {
      typeof toast !== 'undefined' && toast('أدخل الكمية', 'err');
      return;
    }
    const a    = _aset(_sym);
    const gram = _gram(_sym);
    const mid  = (_lastBar?.close) || _spx(_sym);
    if (!mid) {
      typeof toast !== 'undefined' && toast('لا يوجد سعر', 'err');
      return;
    }

    const midOz = gram ? mid * TROY : mid;
    const qtyOz = gram ? qty / TROY : qty;
    const usd   = (midOz * qtyOz).toFixed(2);
    const mgn   = (midOz * qtyOz / a.lev).toFixed(2);
    const liqOz = isBuy
      ? midOz * (1 - 1/a.lev + 0.5/a.lev)
      : midOz * (1 + 1/a.lev - 0.5/a.lev);
    const liqD  = gram ? (liqOz / TROY).toFixed(a.pxDp) : liqOz.toFixed(a.pxDp);

    _hideConfirm();

    const wrap = $$('_cWrap');
    if (!wrap) return;

    const ov = document.createElement('div');
    ov.id        = '_cfOv';
    ov.className = 'cfo';
    ov.innerHTML = `
<div class="cfc">
  <div class="cfh"></div>
  <div class="cft" style="color:${isBuy?'var(--hc-up)':'var(--hc-dn)'}">
    ${a.icon||'📊'} ${isBuy?'شراء ▲':'بيع ▼'} — ${a.name}
  </div>
  <div class="cfs">رافعة ${a.lev}x · تأكيد قبل التنفيذ</div>
  <div class="cfr">
    <div class="cfrow">
      <span class="cfk">الكمية</span>
      <span class="cfv">${qty.toFixed(gram?2:a.szDp)} ${a.unit}</span>
    </div>
    <div class="cfrow">
      <span class="cfk">السعر</span>
      <span class="cfv">$${mid.toFixed(a.pxDp)}</span>
    </div>
    <div class="cfrow">
      <span class="cfk">القيمة</span>
      <span class="cfv">≈ $${usd}</span>
    </div>
    <div class="cfrow">
      <span class="cfk">الهامش المطلوب</span>
      <span class="cfv w">≈ $${mgn}</span>
    </div>
    <div class="cfrow">
      <span class="cfk">التصفية التقريبية</span>
      <span class="cfv ${isBuy?'r':'g'}">≈ $${liqD}</span>
    </div>
  </div>
  <div class="cfbtns">
    <button class="cfca" id="_cfCancel">إلغاء ✕</button>
    <button class="cfex ${isBuy?'g':'r'}" id="_cfExec">
      ${isBuy?'✅ تأكيد الشراء':'✅ تأكيد البيع'}
    </button>
  </div>
</div>`;

    wrap.appendChild(ov);
    ov.addEventListener('click', e => { if (e.target === ov) _hideConfirm(); });
    $$('_cfCancel').onclick = _hideConfirm;
    $$('_cfExec').onclick   = () =>
      typeof requirePin !== 'undefined'
        ? requirePin(() => _execTrade(isBuy, qty))
        : _execTrade(isBuy, qty);
  }

  function _hideConfirm() { $$('_cfOv')?.remove(); }

  async function _execTrade(isBuy, qty) {
    if (typeof State === 'undefined' || !State.wallet) return;
    const btn = $$('_cfExec');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="cfsp"></span>'; }

    const gram  = _gram(_sym);
    const aApi  = gram
      ? (typeof ASSETS !== 'undefined' ? ASSETS['GOLD'] : _aset(_sym))
      : _aset(_sym);
    const mid   = (_lastBar?.close) || _spx(_sym);
    const midOz = gram ? mid * TROY : mid;
    if (!midOz) { _hideConfirm(); return; }
    const qtyOz = gram ? qty / TROY : qty;

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
          a: aApi.idx, b: isBuy,
          p: wirePx(midOz * (isBuy ? 1.05 : 0.95), aApi.szDp),
          s: wireSz(qtyOz, aApi.szDp),
          r: false, t: { limit: { tif: 'Ioc' } }
        }],
        grouping: 'na'
      });

      _hideConfirm();
      const da = _aset(_sym);
      typeof toast !== 'undefined' && toast(
        `✅ ${da.icon||''} ${isBuy?'شراء':'بيع'} ${qty.toFixed(gram?2:da.szDp)} ${da.unit}`,
        'ok', 4000
      );
      if (typeof pollAccount !== 'undefined') setTimeout(pollAccount, 2000);

    } catch (e) {
      typeof toast !== 'undefined' && toast(
        typeof tradeErr !== 'undefined' ? tradeErr(e.message) : '❌ ' + e.message.slice(0,100),
        'err', 5000
      );
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = isBuy ? '✅ تأكيد الشراء' : '✅ تأكيد البيع';
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════
     POSITION LINES  — drawn as locked horizontal shapes
  ═══════════════════════════════════════════════════════════ */
  function _drawLines() {
    if (!_widget || !_visible) return;

    try {
      _widget.onChartReady(() => {
        const chart = _widget.activeChart();

        /* Remove old shapes */
        _shapeIds.forEach(id => { try { chart.removeShape(id); } catch {} });
        _shapeIds = [];

        if (typeof State === 'undefined') return;

        for (const p of (State.positions || [])) {
          const raw   = p.position.coin.includes(':')
            ? p.position.coin.split(':')[1]
            : p.position.coin;
          const pSym  = raw === 'GOLD' ? 'XAU' : raw;
          if (pSym !== _sym) continue;

          const pos     = p.position;
          const sziOz   = +pos.szi;
          const isGram  = _sym === 'XAU';
          const entryOz = +(pos.entryPx || 0);
          const entryD  = isGram ? entryOz / TROY : entryOz;
          const curD    = _lastBar?.close || _spx(_sym);
          const pnl     = isGram
            ? (curD - entryD) * sziOz * TROY
            : (curD - entryD) * sziOz;
          const isUp    = pnl >= 0;
          const a       = _aset(_sym);
          const tpsl    = p.tpsl || {};

          const _shape = (price, color, label) => {
            if (!price || price <= 0) return;
            try {
              const id = chart.createShape(
                { price },
                {
                  shape:       'horizontal_line',
                  lock:        true,
                  disableUndo: true,
                  zOrder:      'top',
                  overrides: {
                    linecolor:  color,
                    linewidth:  2,
                    linestyle:  1,
                    showLabel:  true,
                    text:       label,
                    fontsize:   11,
                    textcolor:  color,
                  },
                }
              );
              if (id) _shapeIds.push(id);
            } catch {}
          };

          /* Entry line */
          if (entryD > 0) {
            _shape(
              entryD,
              isUp ? '#00e676' : '#ff3d3d',
              `${sziOz > 0 ? '▲ دخول' : '▼ دخول'}  ${isUp ? '+' : ''}$${pnl.toFixed(2)}`
            );
          }

          /* TP line */
          if (tpsl.tp) {
            const tpD = isGram ? tpsl.tp / TROY : tpsl.tp;
            _shape(tpD, '#00e8a2', `🎯 TP $${tpD.toFixed(a.pxDp)}`);
          }

          /* SL line */
          if (tpsl.sl) {
            const slD = isGram ? tpsl.sl / TROY : tpsl.sl;
            _shape(slD, '#ff6a1a', `🛡 SL $${slD.toFixed(a.pxDp)}`);
          }
        }
      });
    } catch (e) {
      console.warn('[TV] drawLines:', e.message);
    }
  }

  /* ═══════════════════════════════════════════════════════════
     LAYOUT WAIT  — poll until container has real pixel size.
     Two requestAnimationFrame calls are NOT reliable after
     display:none → display:flex; use a 16ms retry loop.
  ═══════════════════════════════════════════════════════════ */
  function _waitLayout(callback, attempt) {
    clearTimeout(_layoutTmr);
    attempt = attempt || 0;

    const wrap = $$('_cWrap');
    if (wrap && _visible) {
      const r = wrap.getBoundingClientRect();
      if (r.width > 10 && r.height > 10) {
        const w = Math.floor(r.width);
        const h = Math.floor(r.height);
        console.log(`[TV] container ready ${w}×${h} (attempt ${attempt})`);
        callback(w, h);
        return;
      }
    }

    if (!_visible) return;   /* closed while waiting */

    if (attempt < 120) {
      /* ~2 seconds max at 16ms per attempt */
      _layoutTmr = setTimeout(() => _waitLayout(callback, attempt + 1), 16);
    } else {
      /* Hard fallback — always give TradingView something non-zero */
      const sc = $$('chartScreen');
      const sw = sc ? sc.clientWidth  : window.innerWidth;
      const sh = sc ? sc.clientHeight : window.innerHeight;
      const h  = Math.max(200, sh - 180);  /* subtract nav + trade bar */
      console.warn(`[TV] layout timeout, fallback ${sw}×${h}`);
      callback(sw, h);
    }
  }

  /* ═══════════════════════════════════════════════════════════
     RESIZE OBSERVER  — keeps widget in sync with wrapper size
  ═══════════════════════════════════════════════════════════ */
  function _setupResize() {
    if (_ro) { _ro.disconnect(); _ro = null; }
    const wrap = $$('_cWrap');
    if (!wrap || !window.ResizeObserver) return;

    _ro = new ResizeObserver(entries => {
      if (!_widget || !_visible) return;
      const rect = entries[0].contentRect;
      const w = Math.floor(rect.width);
      const h = Math.floor(rect.height);
      if (w < 10 || h < 10) return;

      /* Update container element */
      const cont = $$('_tvC');
      if (cont) { cont.style.width = w + 'px'; cont.style.height = h + 'px'; }

      /* Notify TradingView */
      try { _widget.resize(w, h); } catch {}
    });

    _ro.observe(wrap);
  }

  /* ═══════════════════════════════════════════════════════════
     ERROR DISPLAY  — visible in chart area
  ═══════════════════════════════════════════════════════════ */
  function _showError(msg, detail) {
    const wrap = $$('_cWrap');
    if (!wrap) return;
    wrap.querySelector('.c-err')?.remove();
    const div       = document.createElement('div');
    div.className   = 'c-err';
    div.innerHTML   = `
<div class="c-err-ico">⚠️</div>
<div class="c-err-msg">${msg}</div>
${detail ? `<div class="c-err-sub">${detail}</div>` : ''}`;
    wrap.appendChild(div);
  }

  /* ═══════════════════════════════════════════════════════════
     DESTROY  — full cleanup before re-init
  ═══════════════════════════════════════════════════════════ */
  function _destroy() {
    clearTimeout(_layoutTmr);
    _layoutTmr = null;

    if (_ro) { _ro.disconnect(); _ro = null; }

    _shapeIds = [];
    _subs     = {};

    if (_widget) {
      try { _widget.remove(); } catch {}
      _widget = null;
    }

    _rtClose();

    const c = $$('_tvC');
    if (c) { c.innerHTML = ''; c.style.width = ''; c.style.height = ''; }
  }

  /* ═══════════════════════════════════════════════════════════
     WIDGET CREATION  — called once container size is known
  ═══════════════════════════════════════════════════════════ */
  function _createWidget(sym, w, h) {
    if (!_visible) return;

    /* ── Safety: verify TradingView library is loaded ── */
    if (typeof TradingView === 'undefined' || typeof TradingView.widget !== 'function') {
      console.error('[TV] TradingView.widget is not defined.');
      console.error('[TV] Check that /charting_library/charting_library.standalone.js');
      console.error('[TV] is loaded BEFORE /js/chart.js in index.html.');
      _showError(
        'مكتبة TradingView غير محملة',
        'TradingView.widget is not defined.\n' +
        'تأكد من وجود هذا السطر في index.html قبل chart.js:\n' +
        '<script src="/charting_library/charting_library.standalone.js"></script>'
      );
      return;
    }

    const cont = $$('_tvC');
    if (!cont) {
      console.error('[TV] #_tvC element not found — _build() may not have run');
      return;
    }

    /* ── Set EXPLICIT pixel dimensions on the container ── */
    cont.style.position = 'absolute';
    cont.style.top      = '0';
    cont.style.left     = '0';
    cont.style.width    = w + 'px';
    cont.style.height   = h + 'px';
    cont.style.overflow = 'hidden';

    const isDarkMode = dark();
    const bg = isDarkMode ? '#131722' : '#ffffff';

    console.log(`[TV] creating widget ${w}×${h} sym=${sym} dark=${isDarkMode}`);

    try {
      _widget = new TradingView.widget({

        /* ── Dimensions (explicit, NOT autosize) ──
           autosize reads container at creation time and gets 0px if
           flex layout hasn't settled yet.  We provide exact pixels and
           handle future resizes through ResizeObserver + widget.resize(). */
        width:  w,
        height: h,

        symbol:   sym,
        interval: '60',   /* default 1H */

        container:    '_tvC',
        datafeed:     Datafeed,
        library_path: '/charting_library/',

        locale:   'en',
        timezone: 'Asia/Baghdad',

        theme:  isDarkMode ? 'Dark' : 'Light',
        style:  '1',     /* 1 = Candlestick */
        debug:  false,

        enable_publishing:   false,
        allow_symbol_change: false,
        save_image:          false,

        loading_screen: {
          backgroundColor: bg,
          foregroundColor: '#ff8c42',
        },

        disabled_features: [
          'header_symbol_search',
          'header_saveload',
          'left_toolbar',
          'border_around_the_chart',
          'popup_hints',
          'use_localstorage_for_settings',
          'create_volume_indicator_by_default',
          'volume_force_overlay',
          'display_market_status',
          'go_to_date',
          'show_logo_on_all_charts',
          'countdown_timer',
        ],

        enabled_features: [
          'move_logo_to_main_pane',
          'hide_left_toolbar_by_default',
          'header_in_fullscreen_mode',
        ],

        overrides: {
          'mainSeriesProperties.candleStyle.upColor':         '#26a69a',
          'mainSeriesProperties.candleStyle.downColor':       '#ef5350',
          'mainSeriesProperties.candleStyle.borderUpColor':   '#26a69a',
          'mainSeriesProperties.candleStyle.borderDownColor': '#ef5350',
          'mainSeriesProperties.candleStyle.wickUpColor':     '#26a69a',
          'mainSeriesProperties.candleStyle.wickDownColor':   '#ef5350',
          'paneProperties.background':          bg,
          'paneProperties.backgroundType':      'solid',
          'paneProperties.vertGridProperties.color':
            isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)',
          'paneProperties.horzGridProperties.color':
            isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)',
          'scalesProperties.textColor':         isDarkMode ? '#9ab' : '#555',
          'scalesProperties.fontSize':          11,
          'scalesProperties.backgroundColor':   isDarkMode ? '#131722' : '#f5f5f5',
        },
      });

      /* ── onChartReady ─────────────────────────────────── */
      _widget.onChartReady(() => {
        console.log('[TV] ✅ onChartReady — chart is rendering');

        /* Attach resize handler now that widget is stable */
        _setupResize();

        /* Draw open-position lines */
        _drawLines();

        /* Track interval changes */
        try {
          _widget.activeChart().onIntervalChanged().subscribe(null, iv => {
            console.log('[TV] interval →', iv);
            _res = iv;
          });
        } catch {}

        /* Update WS dot */
        const dot = $$('_cWsDot');
        if (dot && dot.textContent === '⏳') dot.textContent = '⚪';
      });

    } catch (e) {
      console.error('[TV] widget constructor threw:', e);
      _showError('فشل إنشاء الرسم البياني', e.message);
    }
  }

  /* ═══════════════════════════════════════════════════════════
     PUBLIC API
  ═══════════════════════════════════════════════════════════ */

  /** Open the chart screen for a given asset symbol. */
  function open(sym) {
    _sym     = sym || (typeof State !== 'undefined' ? State.asset : 'CL');
    _visible = true;

    _build();

    const sc = $$('chartScreen');
    if (sc) sc.classList.remove('hidden');

    _updateHeader(_sym);
    _destroy();

    /* Wait for the flex container to get real pixel dimensions,
       then create the TradingView widget. */
    _waitLayout((w, h) => _createWidget(_sym, w, h));
  }

  /** Close the chart screen. */
  function close() {
    _visible = false;
    _hideConfirm();
    _destroy();
    $$('chartScreen')?.classList.add('hidden');
  }

  /** Switch the displayed asset without closing the screen. */
  function switchAssetChart(sym) {
    if (!_visible || sym === _sym) return;
    _sym     = sym;
    _lastBar = null;
    _updateHeader(sym);
    _destroy();
    _waitLayout((w, h) => _createWidget(sym, w, h));
  }

  /** Change the chart timeframe programmatically. */
  function switchInterval(iv) {
    if (!_widget) return;
    try {
      _widget.onChartReady(() => {
        _widget.activeChart().setResolution(iv, () => { _res = iv; });
      });
    } catch {}
  }

  /** Redraw open-position lines (called from positions.js). */
  function refreshLines() {
    if (_visible) _drawLines();
  }

  return { open, close, switchInterval, switchAssetChart, refreshLines };
})();
