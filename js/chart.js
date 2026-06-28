/* ═══════════════════════════════════════════════════════════════════
   chart.js — سيولة · TradingView Advanced Charts · Final
   
   DataFeed:
   ✅ resolveSymbol.timezone = 'Etc/UTC' — لا bug 1970 أبداً
   ✅ widget.timezone = 'Asia/Kuwait' — عرض UTC+3
   ✅ timestamps: auto-detect ms/sec
   ✅ noData:true على فراغ — pagination لا نهائي
   ✅ WS Candle منفصل للـ live bars

   خطوط المراكز (الحل النهائي):
   ✅ _linesReady flag — لا رسم إلا بعد onChartReady()
   ✅ _pendingLines queue — طلبات الرسم تُنفَّذ بعد الجاهزية
   ✅ createOrderLine: Entry + TP + SL + Liq
   ✅ تحديث PnL لحظي مع كل WS bar
   ✅ إعادة رسم عند تغيير interval / أصل

   حفظ محلي:
   ✅ save_load_adapter: رسومات + مؤشرات + templates
   ✅ interval محفوظ لكل أصل
   ✅ TV يحفظ settings تلقائياً عبر localStorage

   UI:
   ✅ header خفيف: رجوع + اسم أصل + سعر + WS dot
   ✅ لا interval pills — TV header الأصلي كافٍ
   ✅ trade bar: بيع | qty بسيط | شراء
   ✅ qty أعرض، بدون presets، افتراضي = 1
   ✅ RTL fix: #_tvC direction:ltr !important
   ✅ رسم نظيف — بدون مؤشرات افتراضية
═══════════════════════════════════════════════════════════════════ */
const ChartModule = (function () {
  'use strict';

  /* ═══════════ ثوابت ═══════════ */
  const HL_API    = 'https://api.hyperliquid.xyz';
  const HL_WS     = 'wss://api.hyperliquid.xyz/ws';
  const TROY      = 31.1035;
  const MIN_2020  = 1577836800000;
  const LS        = 'hl_tv_';

  const IV_HL = {
    '1':'1m','3':'3m','5':'5m','15':'15m','30':'30m',
    '60':'1h','120':'2h','240':'4h','360':'6h','720':'12h',
    '1D':'1d','1W':'1w',
  };

  const _lsGet = k => { try { return JSON.parse(localStorage.getItem(LS+k)); } catch { return null; } };
  const _lsSet = (k,v) => { try { localStorage.setItem(LS+k, JSON.stringify(v)); } catch {} };

  /* ═══════════ حالة ═══════════ */
  let _widget      = null;
  let _visible     = false;
  let _sym         = 'CL';
  let _interval    = '60';
  let _lastClose   = 0;
  let _clockTimer  = null;

  /* BBO WS */
  let _bboWs    = null;
  let _bboTimer = null;

  /* خطوط المراكز */
  let _lines       = [];       // references لـ TV order lines
  let _linesReady  = false;    // true فقط بعد onChartReady
  let _linesPending = false;   // طلب رسم معلّق

  /* ═══════════ CSS ═══════════ */
  (function injectCSS() {
    if (document.getElementById('_tvCSS')) return;
    const s = document.createElement('style');
    s.id = '_tvCSS';
    s.textContent = `
.chart-screen {
  position:fixed; inset:0; z-index:50;
  display:flex; flex-direction:column;
  background:#000; overflow:hidden;
}
.chart-screen.hidden { display:none !important; }

/* ── Header ── */
#_tvHdr {
  display:flex; align-items:center; justify-content:space-between;
  height:44px; padding:0 10px;
  background:var(--bg-card,#0d0d0d);
  border-bottom:1px solid var(--border,#1e1e1e);
  flex-shrink:0; direction:rtl; gap:8px; z-index:5;
}
.tvh-l { display:flex; align-items:center; gap:7px; min-width:0; flex:1; overflow:hidden; }
.tvh-r { display:flex; align-items:center; gap:6px; flex-shrink:0; }

.tvh-back {
  font-size:11px; font-weight:800; padding:4px 11px; border-radius:8px;
  border:1.5px solid rgba(255,140,66,.3); background:rgba(255,140,66,.1);
  color:var(--ac,#ff8c42); font-family:'Cairo',sans-serif;
  cursor:pointer; white-space:nowrap; flex-shrink:0;
  transition:background .13s, color .13s;
}
.tvh-back:active { opacity:.6; transform:scale(.91); }

.tvh-asset { display:flex; align-items:center; gap:5px; min-width:0; overflow:hidden; }
.tvh-icon  { font-size:15px; flex-shrink:0; line-height:1; }
.tvh-name  {
  font-size:12px; font-weight:900; color:var(--text-primary,#f0f0f0);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
.tvh-price {
  font-family:'IBM Plex Mono',monospace;
  font-size:14px; font-weight:800; color:var(--text-primary,#f0f0f0);
  flex-shrink:0; transition:color .2s;
}
.tvh-price.up { color:#00e676; }
.tvh-price.dn { color:#ff3d3d; }

.tvh-dot {
  width:7px; height:7px; border-radius:50%;
  background:#444; flex-shrink:0; transition:background .3s;
}
.tvh-dot.on   { background:#00e676; box-shadow:0 0 6px #00e676; }
.tvh-dot.wait { background:#ffd600; animation:_tvDot 1.1s ease-in-out infinite; }
.tvh-dot.off  { background:#ff3d3d; }
@keyframes _tvDot { 0%,100%{opacity:1} 50%{opacity:.18} }

/* ── Trade Bar ── */
#_tvTrade {
  display:flex; align-items:center; gap:6px;
  padding:7px 10px;
  background:var(--bg-card,#0d0d0d);
  border-bottom:1px solid var(--border,#1e1e1e);
  flex-shrink:0; direction:rtl;
}
.tvt-btn {
  flex:1; min-height:52px; padding:7px 6px; border-radius:12px; border:none;
  font-family:'Cairo',sans-serif; font-size:15px; font-weight:900;
  cursor:pointer; color:#fff;
  display:flex; flex-direction:column;
  align-items:center; justify-content:center; gap:2px;
  transition:filter .12s, transform .1s;
}
.tvt-btn:active { transform:scale(.91); filter:brightness(.82); }
.tvt-buy  { background:linear-gradient(150deg,#00c853,#1b5e20); box-shadow:0 2px 12px rgba(0,200,83,.3); }
.tvt-sell { background:linear-gradient(150deg,#ff1744,#b71c1c); box-shadow:0 2px 12px rgba(255,23,68,.3); }
.tvt-dir  { font-size:14px; line-height:1; }
.tvt-px   { font-family:'IBM Plex Mono',monospace; font-size:9px; opacity:.7; }

/* qty — بسيط وعريض */
.tvt-qty-wrap {
  flex:1.4; display:flex; flex-direction:column;
  align-items:center; gap:2px;
}
.tvt-qty-lbl {
  font-size:9px; color:var(--text-muted,#444);
  font-weight:700; letter-spacing:.8px; text-transform:uppercase;
}
.tvt-qty-row { display:flex; align-items:center; gap:6px; }
.tvt-qty-in {
  flex:1; min-width:0;
  font-family:'IBM Plex Mono',monospace;
  font-size:20px; font-weight:700; text-align:center; direction:ltr;
  background:var(--bg-input,#181818);
  border:1.5px solid var(--border,#1e1e1e); border-radius:10px;
  padding:6px 8px; color:var(--text-primary,#f0f0f0); outline:none;
  transition:border-color .14s;
  /* prevent iOS zoom */
  font-size:max(16px, 20px);
}
.tvt-qty-in:focus { border-color:var(--ac,#ff8c42); }
.tvt-qty-unit {
  font-size:11px; font-weight:800;
  color:var(--text-secondary,#666);
  white-space:nowrap; flex-shrink:0;
}

/* ── TV Container ── */
#_tvC {
  flex:1; min-height:0; width:100%;
  direction:ltr !important;
  overflow:hidden; position:relative;
}
#_tvC > iframe,
#_tvC > div { width:100% !important; height:100% !important; }

/* ── Confirm Sheet ── */
.tvcf-ov {
  position:absolute; inset:0; z-index:99;
  display:flex; align-items:flex-end; justify-content:center;
  background:rgba(0,0,0,.65);
  backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px);
  direction:rtl;
}
.tvcf-card {
  background:var(--bg-card,#0d0d0d);
  border-top:1.5px solid var(--border-strong,#2a2a2a);
  border-radius:22px 22px 0 0;
  width:100%; max-width:520px;
  padding:14px 14px 32px;
  animation:_tvcfUp .22s cubic-bezier(.4,0,.2,1);
}
@keyframes _tvcfUp { from{transform:translateY(100%)} to{transform:none} }
.tvcf-hdl   { width:32px;height:3px;background:var(--border-strong,#2a2a2a);border-radius:999px;margin:0 auto 12px; }
.tvcf-title { font-size:17px;font-weight:900;margin-bottom:3px; }
.tvcf-sub   { font-size:11px;color:var(--text-secondary,#666);margin-bottom:10px; }
.tvcf-rows  { background:var(--bg-input,#181818);border-radius:12px;padding:6px 12px;margin-bottom:12px; }
.tvcf-row   { display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border,#1e1e1e);font-size:13px; }
.tvcf-row:last-child { border:none; }
.tvcf-k { color:var(--text-secondary,#666); font-weight:700; }
.tvcf-v { font-family:'IBM Plex Mono',monospace;font-weight:800;color:var(--text-primary,#f0f0f0); }
.tvcf-v.g { color:#00e676; } .tvcf-v.r { color:#ff3d3d; } .tvcf-v.w { color:#ffd600; }
.tvcf-btns { display:grid;grid-template-columns:1fr 1fr;gap:8px; }
.tvcf-cancel {
  padding:13px;border-radius:999px;
  border:1.5px solid var(--border-strong,#2a2a2a);
  background:var(--bg-elev,#161616);
  color:var(--text-secondary,#777);
  font-size:14px;font-weight:700;cursor:pointer;font-family:'Cairo',sans-serif;
}
.tvcf-exec {
  padding:13px;border-radius:999px;border:none;color:#fff;
  font-size:14px;font-weight:900;cursor:pointer;font-family:'Cairo',sans-serif;
  display:flex;align-items:center;justify-content:center;gap:6px;
  transition:filter .12s;
}
.tvcf-exec:active   { filter:brightness(.82); }
.tvcf-exec:disabled { opacity:.5;pointer-events:none; }
.tvcf-exec.g { background:linear-gradient(135deg,#00c853,#1b5e20); }
.tvcf-exec.r { background:linear-gradient(135deg,#ff1744,#b71c1c); }
.tvsp { width:14px;height:14px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:_tvSp .7s linear infinite; }
@keyframes _tvSp { to{transform:rotate(360deg)} }
`;
    document.head.appendChild(s);
  })();

  /* ═══════════ مساعدات ═══════════ */
  const _ai = s =>
    (typeof ASSETS !== 'undefined' && ASSETS[s]) ||
    { pxDp:2, szDp:2, name:s, icon:'📊', unit:'', lev:10, presets:[1], idx:0, cross:true };

  function _hlCoin(sym) {
    if (sym === 'XAU') return 'xyz:GOLD';
    if (typeof ASSETS !== 'undefined' && ASSETS[sym]) return ASSETS[sym].coin;
    return `xyz:${sym}`;
  }

  const _isGr   = s => s === 'XAU';
  const _toOz   = (s,d) => _isGr(s) ? d*TROY : d;
  const _toDisp = (s,o) => _isGr(s) ? o/TROY : o;
  const _dark   = () => (document.documentElement.getAttribute('data-theme')||'dark') === 'dark';

  function _dot(cls) {
    const el = document.getElementById('_tvDot');
    if (el) el.className = 'tvh-dot ' + cls;
  }

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
    if (bp) bp.textContent = '$' + (mid*1.0003).toFixed(a.pxDp);
    if (sp) sp.textContent = '$' + (mid*0.9997).toFixed(a.pxDp);
  }

  /* ═══════════ BBO WS ═══════════ */
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
          const mid = b && a ? (b+a)/2 : 0;
          if (!mid) return;
          const raw  = (msg.data.coin||'').includes(':') ? msg.data.coin.split(':')[1] : msg.data.coin;
          const disp = (sym === 'XAU' && raw === 'GOLD') ? mid/TROY : mid;
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

  /* ═══════════ DataFeed ═══════════ */
  function _buildDatafeed(sym) {
    const hlCoin = _hlCoin(sym);
    const isGr   = _isGr(sym);
    const a      = _ai(sym);

    /* Candle WS */
    let _cws = null, _ctm = null, _ccb = null;

    function _cwConn(res, cb) {
      _cwClose(); _ccb = cb;
      try {
        _cws = new WebSocket(HL_WS);
        _cws.onopen = () => _cws.send(JSON.stringify({
          method:'subscribe',
          subscription:{ type:'candle', coin:hlCoin, interval:IV_HL[res]||'1h' }
        }));
        _cws.onmessage = e => {
          try {
            const msg = JSON.parse(e.data);
            if (msg.channel !== 'candle' || !msg.data || !_ccb) return;
            const c   = msg.data;
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
        _cws.onerror = () => {};
        _cws.onclose = () => {
          if (_ccb && _visible) _ctm = setTimeout(() => _cwConn(res, _ccb), 5000);
        };
      } catch {}
    }

    function _cwClose() {
      clearTimeout(_ctm);
      if (_cws) { try { _cws.close(); } catch {} _cws = null; }
      _ccb = null;
    }

    /* fetch REST */
    async function _fetchBars(from, to) {
      const toMs   = Math.min(to * 1000, Date.now() + 5000);
      const fromMs = Math.max(from * 1000, MIN_2020);
      if (fromMs >= toMs) return [];

      const r = await fetch(HL_API + '/info', {
        method:  'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({
          type: 'candleSnapshot',
          req:  { coin:hlCoin, interval:IV_HL[_interval]||'1h', startTime:fromMs, endTime:toMs }
        })
      });
      if (!r.ok) return [];
      const raw = await r.json();
      if (!Array.isArray(raw) || !raw.length) return [];

      const seen = new Set();
      return raw
        .map(c => {
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
        .sort((x,y) => x.time - y.time);
    }

    return {
      onReady(cb) {
        setTimeout(() => cb({
          supported_resolutions:    ['1','3','5','15','30','60','120','240','1D','1W'],
          currency_codes:           ['USD'],
          exchanges:                [{ value:'HL', name:'Hyperliquid', desc:'Hyperliquid Perps' }],
          symbols_types:            [{ name:'Perp', value:'perp' }],
          supports_search:          false,
          supports_group_request:   false,
          supports_marks:           false,
          supports_timescale_marks: false,
          supports_time:            false,
        }), 0);
      },

      searchSymbols() {},

      resolveSymbol(name, ok) {
        const dp = a.pxDp || 2;
        setTimeout(() => ok({
          name, ticker:name, description:a.name||name,
          type:'crypto', session:'24x7',
          /* ✅ MUST = Etc/UTC — timestamps من DataFeed هي UTC ms */
          timezone:'Etc/UTC',
          minmov:1, pricescale:Math.pow(10,dp),
          has_intraday:true, has_daily:true, has_weekly_and_monthly:true,
          intraday_multipliers:['1','3','5','15','30','60','120','240'],
          supported_resolutions:['1','3','5','15','30','60','120','240','1D','1W'],
          volume_precision:4, data_status:'streaming',
          exchange:'Hyperliquid', listed_exchange:'Hyperliquid',
          format:'price', currency_code:'USD',
        }), 0);
      },

      getBars(info, resolution, periodParams, onHistory, onError) {
        _interval = resolution;
        _fetchBars(periodParams.from, periodParams.to)
          .then(bars => {
            if (!bars.length) { onHistory([], { noData:true }); return; }
            const last = bars[bars.length-1];
            _setPrice(sym, last.close);
            onHistory(bars, { noData:false });
          })
          .catch(e => { console.warn('[DF getBars]', e); onError(e.message); });
      },

      subscribeBars(info, resolution, onRealtime) {
        _cwConn(resolution, bar => {
          onRealtime(bar);
          _setPrice(sym, bar.close);
          /* تحديث PnL في الخطوط مع كل bar لحظي */
          _scheduleLines();
        });
      },

      unsubscribeBars() { _cwClose(); },
    };
  }

  /* ═══════════ خطوط المراكز ═══════════
     
     المشكلة السابقة: _drawLines() تُستدعى قبل أن يكون الـ chart
     جاهزاً → createOrderLine يفشل صامتاً.
     
     الحل:
     1. _linesReady = false دائماً حتى onChartReady() تُطلق
     2. _scheduleLines() تحفظ الطلب كـ pending إذا لم يكن جاهزاً
     3. onChartReady() تضع _linesReady=true وتستدعي _execLines()
     4. _execLines() هي التي تنفّذ createOrderLine فعلياً
  ═══════════════════════════════════════ */

  function _clearLines() {
    _lines.forEach(l => { try { l.remove(); } catch {} });
    _lines = [];
  }

  /* طلب رسم — آمن في أي وقت */
  function _scheduleLines() {
    if (_linesReady) {
      _execLines();
    } else {
      _linesPending = true;
    }
  }

  /* التنفيذ الفعلي — فقط عندما _linesReady = true */
  function _execLines() {
    if (!_linesReady || !_widget || typeof State === 'undefined') return;

    let chart;
    try { chart = _widget.chart?.(); } catch { return; }
    if (!chart) return;

    _clearLines();

    for (const p of (State.positions || [])) {
      /* تطابق الأصل الحالي */
      const rawC = (p.position.coin||'').includes(':')
        ? p.position.coin.split(':')[1] : p.position.coin;
      const pSym = rawC === 'GOLD' ? 'XAU'
        : (typeof COIN_TO_SYM !== 'undefined' ? COIN_TO_SYM[rawC]||rawC : rawC);
      if (pSym !== _sym) continue;

      const pos    = p.position;
      const sziOz  = parseFloat(pos.szi || 0);
      if (!sziOz) continue;

      const isGr   = _isGr(_sym);
      const entOz  = parseFloat(pos.entryPx || 0);
      const entD   = _toDisp(_sym, entOz);
      const pnl    = parseFloat(pos.unrealizedPnl || 0);
      const isLong = sziOz > 0;
      const tpsl   = p.tpsl || {};

      /* ── Entry line ── */
      if (entD > 0) {
        try {
          const sign = pnl >= 0 ? '+' : '';
          const col  = pnl >= 0 ? '#00e676' : '#ff3d3d';
          const ln   = chart.createOrderLine()
            .setPrice(entD)
            .setQuantity(`${isLong ? '▲' : '▼'}  ${sign}$${Math.abs(pnl).toFixed(2)}`)
            .setLineColor(col)
            .setBodyBorderColor(col)
            .setBodyBackgroundColor(col)
            .setBodyTextColor('#000')
            .setQuantityFont('bold 11px Cairo, sans-serif')
            .setLineWidth(1)
            .setLineStyle(0);       /* solid */
          _lines.push(ln);
        } catch(e) { console.warn('[lines] entry', e.message); }
      }

      /* ── TP line ── */
      if (tpsl.tp) {
        const tpD   = _toDisp(_sym, tpsl.tp);
        const tpPnl = (Math.abs(sziOz) * Math.abs(tpsl.tp - entOz)).toFixed(2);
        try {
          const ln = chart.createOrderLine()
            .setPrice(tpD)
            .setQuantity(`🎯 TP  +$${tpPnl}`)
            .setLineColor('#00e8a2')
            .setBodyBorderColor('#00e8a2')
            .setBodyBackgroundColor('#00e8a2')
            .setBodyTextColor('#000')
            .setLineWidth(1)
            .setLineStyle(2);       /* dashed */
          _lines.push(ln);
        } catch(e) { console.warn('[lines] tp', e.message); }
      }

      /* ── SL line ── */
      if (tpsl.sl) {
        const slD   = _toDisp(_sym, tpsl.sl);
        const slPnl = (Math.abs(sziOz) * Math.abs(tpsl.sl - entOz)).toFixed(2);
        try {
          const ln = chart.createOrderLine()
            .setPrice(slD)
            .setQuantity(`🛡 SL  -$${slPnl}`)
            .setLineColor('#ff6a1a')
            .setBodyBorderColor('#ff6a1a')
            .setBodyBackgroundColor('#ff6a1a')
            .setBodyTextColor('#fff')
            .setLineWidth(1)
            .setLineStyle(2);
          _lines.push(ln);
        } catch(e) { console.warn('[lines] sl', e.message); }
      }

      /* ── Liq line ── */
      try {
        const aForLiq = isGr
          ? (typeof ASSETS !== 'undefined' && ASSETS['GOLD']) || _ai('GOLD')
          : _ai(_sym);
        const balance = (typeof State !== 'undefined' && State.balance?.total) || 0;

        let liqOz = null;

        /* استخدم calcLiqPrice من positions.js إن كان متاحاً */
        if (typeof calcLiqPrice === 'function') {
          liqOz = calcLiqPrice(entOz, sziOz, balance, aForLiq.cross, aForLiq.lev);
        } else {
          /* حساب محلي بسيط */
          const mmFrac  = 0.5 / aForLiq.lev;
          const absSize = Math.abs(sziOz);
          const notional = absSize * entOz;
          if (aForLiq.cross) {
            const bal = balance > 0 ? balance : notional / aForLiq.lev;
            const free = bal - notional * mmFrac;
            liqOz = free > 0
              ? entOz - (isLong ? 1 : -1) * free / absSize
              : entOz * (isLong ? 0.99 : 1.01);
          } else {
            liqOz = isLong
              ? entOz * (1 - 1/aForLiq.lev + mmFrac)
              : entOz * (1 + 1/aForLiq.lev - mmFrac);
          }
        }

        if (liqOz && liqOz > 0) {
          const liqD = _toDisp(_sym, liqOz);
          const ln   = chart.createOrderLine()
            .setPrice(liqD)
            .setQuantity('⚡ Liq')
            .setLineColor('#ff3d3d')
            .setBodyBorderColor('#c62828')
            .setBodyBackgroundColor('#c62828')
            .setBodyTextColor('#fff')
            .setLineWidth(1)
            .setLineStyle(1);       /* dotted */
          _lines.push(ln);
        }
      } catch(e) { console.warn('[lines] liq', e.message); }

      break; /* أصل واحد فقط */
    }
  }

  /* ═══════════ Save/Load Adapter ═══════════ */
  function _buildSLA(sym) {
    const K = 'chart_' + sym;
    return {
      getAllCharts() {
        return Promise.resolve(_lsGet(K+'_charts') || []);
      },
      removeChart(id) {
        _lsSet(K+'_charts', (_lsGet(K+'_charts')||[]).filter(c => c.id !== id));
        return Promise.resolve();
      },
      saveChart(d) {
        const data = _lsGet(K+'_charts') || [];
        const item = { ...d, id:d.id||Date.now(), timestamp:Date.now() };
        const idx  = data.findIndex(c => c.id === item.id);
        if (idx>=0) data[idx]=item; else data.push(item);
        _lsSet(K+'_charts', data);
        return Promise.resolve(item.id);
      },
      getChartContent(id) {
        const item = (_lsGet(K+'_charts')||[]).find(c => c.id === id);
        return Promise.resolve(item?.content || '');
      },
      getAllStudyTemplates() {
        return Promise.resolve(_lsGet(K+'_stpl') || []);
      },
      removeStudyTemplate(name) {
        _lsSet(K+'_stpl', (_lsGet(K+'_stpl')||[]).filter(s => s.name !== name));
        return Promise.resolve();
      },
      saveStudyTemplate(tpl) {
        const data = _lsGet(K+'_stpl') || [];
        const idx  = data.findIndex(s => s.name === tpl.name);
        if (idx>=0) data[idx]=tpl; else data.push(tpl);
        _lsSet(K+'_stpl', data);
        return Promise.resolve();
      },
      getStudyTemplateContent(name) {
        const item = (_lsGet(K+'_stpl')||[]).find(s => s.name === name);
        return Promise.resolve(item?.content || '');
      },
      getDrawingTemplates(tool) {
        return Promise.resolve(_lsGet(K+'_dt_'+tool) || []);
      },
      loadDrawingTemplate(tool, name) {
        const item = (_lsGet(K+'_dt_'+tool)||[]).find(d => d.name === name);
        return Promise.resolve(item?.content || '');
      },
      removeDrawingTemplate(tool, name) {
        _lsSet(K+'_dt_'+tool, (_lsGet(K+'_dt_'+tool)||[]).filter(d => d.name !== name));
        return Promise.resolve();
      },
      saveDrawingTemplate(tool, name, content) {
        const data = _lsGet(K+'_dt_'+tool) || [];
        const idx  = data.findIndex(d => d.name === name);
        const item = { name, content };
        if (idx>=0) data[idx]=item; else data.push(item);
        _lsSet(K+'_dt_'+tool, data);
        return Promise.resolve();
      },
    };
  }

  /* ═══════════ Widget ═══════════ */
  function _mkWidget(sym, iv) {
    if (!window.TradingView?.widget) {
      console.error('[chart.js] TradingView not loaded');
      return null;
    }

    const dark = _dark();

    return new window.TradingView.widget({
      /* ── Container ── */
      container:   '_tvC',
      autosize:    true,

      /* ── Data ── */
      symbol:      sym,
      interval:    iv,
      datafeed:    _buildDatafeed(sym),
      library_path:'/charting_library/',
      locale:      'en',

      /* ── Timezone: الكويت UTC+3 ── */
      timezone:    'Asia/Kuwait',

      /* ── Theme ── */
      theme:       dark ? 'Dark' : 'Light',

      /* ── Overrides: رسم نظيف تماماً ── */
      overrides: {
        /* خلفية */
        'paneProperties.background':                          dark ? '#000000' : '#F9F9F9',
        'paneProperties.backgroundType':                      'solid',
        /* grid خفيف جداً */
        'paneProperties.vertGridProperties.color':            dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)',
        'paneProperties.horzGridProperties.color':            dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)',
        'paneProperties.vertGridProperties.style':            0,
        'paneProperties.horzGridProperties.style':            0,
        /* crosshair */
        'paneProperties.crossHairProperties.color':           '#888',
        'paneProperties.crossHairProperties.style':           2,
        'paneProperties.crossHairProperties.width':           1,
        /* شموع AMOLED */
        'mainSeriesProperties.candleStyle.upColor':           '#00e676',
        'mainSeriesProperties.candleStyle.downColor':         '#ff3d3d',
        'mainSeriesProperties.candleStyle.drawBorder':        true,
        'mainSeriesProperties.candleStyle.borderUpColor':     '#00e676',
        'mainSeriesProperties.candleStyle.borderDownColor':   '#ff3d3d',
        'mainSeriesProperties.candleStyle.wickUpColor':       '#00e676',
        'mainSeriesProperties.candleStyle.wickDownColor':     '#ff3d3d',
        /* خط السعر الحالي */
        'mainSeriesProperties.showPriceLine':                 true,
        'mainSeriesProperties.priceLineColor':                '#ff8c42',
        'mainSeriesProperties.priceLineWidth':                1,
        /* محاور */
        'scalesProperties.fontSize':                          11,
        'scalesProperties.textColor':                         dark ? '#777' : '#555',
        'scalesProperties.lineColor':                         dark ? '#222' : '#ddd',
        'scalesProperties.backgroundColor':                   dark ? '#000' : '#F9F9F9',
        /* ✅ بدون volume افتراضي */
        'volumePaneSize':                                     'tiny',
      },

      /* ✅ بدون studies افتراضية — رسم نظيف */
      studies_overrides: {},

      /* ── Disabled ── */
      disabled_features: [
        /* نخفي symbol search من header لأن أصولنا محددة */
        'header_symbol_search',
        'symbol_search_hot_key',
        /* نخفي compare */
        'header_compare',
        /* UI غير ضروري */
        'symbol_info',
        'border_around_the_chart',
        'display_market_status',
        'go_to_date',
      ],

      /* ── Enabled: كل مميزات TV ── */
      enabled_features: [
        /* أدوات الرسم كاملة */
        'study_templates',
        'side_toolbar_in_fullscreen_mode',
        'header_in_fullscreen_mode',
        /* تفاعل */
        'horz_touch_drag_scroll',
        'vert_touch_drag_scroll',
        'pinch_scale',
        'axis_pressed_mouse_move_scale',
        'axis_double_clicked_reset_scale',
        'shift_visible_range_on_new_bar',
        'pre_post_market_sessions',
        /* UI */
        'items_favoriting',
        'show_hide_button_in_legend',
        'hide_last_na_study_output',
        'adaptive_logo',
        'move_logo_to_main_pane',
        'end_of_period_timescale_marks',
        /* ✅ حفظ محلي تلقائي */
        'use_localstorage_for_settings',
        'save_chart_properties_to_local_storage',
        'chart_property_page_style',
        'chart_property_page_scales',
        'chart_property_page_background',
        'chart_property_page_timezone_sessions',
        'chart_property_page_trading',
        /* mobile */
        'force_touch_drag',
        'iframe_loading_compatibility_mode',
      ],

      /* ✅ Save/Load Adapter — رسومات + مؤشرات + templates */
      save_load_adapter: _buildSLA(sym),

      loading_screen: {
        backgroundColor: dark ? '#000000' : '#F9F9F9',
        foregroundColor: dark ? '#ff8c42' : '#c96442',
      },

      client_id:   'suyula_hl',
      user_id:     'trader',
      charts_storage_api_version: '1.1',
      fullscreen:  false,
      debug:       false,
    });
  }

  /* ═══════════ Trade Bar ═══════════ */
  function _buildTrade() {
    document.getElementById('_tvTrade')?.remove();
    const a    = _ai(_sym);
    /* الكمية المحفوظة أو 1 افتراضي */
    const defQ = _lsGet('qty_' + _sym) || a.presets?.[0] || 1;

    const bar  = document.createElement('div');
    bar.id = '_tvTrade';
    bar.innerHTML = `
      <button class="tvt-btn tvt-sell" id="_tvSell">
        <span class="tvt-dir">▼ بيع</span>
        <span class="tvt-px" id="_tvSellPx">—</span>
      </button>
      <div class="tvt-qty-wrap">
        <span class="tvt-qty-lbl">الكمية</span>
        <div class="tvt-qty-row">
          <input class="tvt-qty-in" id="_tvQty" type="number"
            value="${defQ}" min="0" step="any" inputmode="decimal">
          <span class="tvt-qty-unit">${a.unit || ''}</span>
        </div>
      </div>
      <button class="tvt-btn tvt-buy" id="_tvBuy">
        <span class="tvt-dir">▲ شراء</span>
        <span class="tvt-px" id="_tvBuyPx">—</span>
      </button>`;

    const screen = document.getElementById('chartScreen');
    const tvC    = document.getElementById('_tvC');
    if (screen && tvC) screen.insertBefore(bar, tvC);

    /* حفظ الكمية عند تغييرها */
    document.getElementById('_tvQty').addEventListener('change', function() {
      const v = parseFloat(this.value);
      if (v > 0) _lsSet('qty_' + _sym, v);
    });

    document.getElementById('_tvBuy').onclick  = () => _showCf(true);
    document.getElementById('_tvSell').onclick = () => _showCf(false);

    /* سعر أولي */
    if (typeof State !== 'undefined') {
      const p = State.prices?.[_sym]?.mid;
      if (p) _setPrice(_sym, p);
    }
  }

  /* ═══════════ Confirm Sheet ═══════════ */
  function _showCf(isBuy) {
    if (typeof State === 'undefined' || !State.wallet)
      return typeof toast !== 'undefined' && toast('سجّل الدخول أولاً', 'err');

    const qty = parseFloat(document.getElementById('_tvQty')?.value || 0);
    if (!qty || qty <= 0)
      return typeof toast !== 'undefined' && toast('أدخل الكمية', 'err');

    const a    = _ai(_sym);
    const isGr = _isGr(_sym);
    const mid  = _lastClose || (typeof State !== 'undefined' ? State.prices?.[_sym]?.mid : 0) || 0;
    if (!mid) return typeof toast !== 'undefined' && toast('لا يوجد سعر', 'err');

    const midOz = _toOz(_sym, mid);
    const qtyOz = isGr ? qty/TROY : qty;
    const usd   = (midOz * qtyOz).toFixed(2);
    const mgn   = (midOz * qtyOz / a.lev).toFixed(2);
    /* تقدير لسعر التصفية */
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
    const qtyOz = isGr ? qty/TROY : qty;

    try {
      try {
        await hlExchange({ type:'updateLeverage', asset:aApi.idx, isCross:aApi.cross, leverage:aApi.lev });
      } catch {}
      await hlExchange({
        type:'order',
        orders:[{
          a:aApi.idx, b:isBuy,
          p:wirePx(midOz*(isBuy?1.02:0.98), aApi.szDp),
          s:wireSz(qtyOz, aApi.szDp),
          r:false, t:{ limit:{ tif:'Ioc' } }
        }],
        grouping:'na'
      });
      _hideCf();
      const disp = isGr
        ? qty.toFixed(2)+' غرام'
        : qty.toFixed(aApi.szDp)+' '+(aApi.unit||'');
      if (typeof toast !== 'undefined')
        toast(`✅ ${aApi.icon} ${isBuy?'شراء':'بيع'} ${disp}`, 'ok', 4000);
      if (typeof pollAccount !== 'undefined')
        setTimeout(pollAccount, 2000);
    } catch(e) {
      if (typeof toast !== 'undefined')
        toast(typeof tradeErr !== 'undefined' ? tradeErr(e.message) : '❌ '+e.message.slice(0,100), 'err', 5000);
      if (btn) { btn.disabled=false; btn.innerHTML=isBuy?'✅ تأكيد الشراء':'✅ تأكيد البيع'; }
    }
  }

  /* ═══════════ DOM ═══════════ */
  function _ensureScreen() {
    const screen = document.getElementById('chartScreen');
    if (!screen || document.getElementById('_tvHdr')) return;

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
        <div class="tvh-dot wait" id="_tvDot"></div>
      </div>`;
    screen.prepend(hdr);

    /* TV container */
    const tvC = document.createElement('div');
    tvC.id = '_tvC';
    screen.appendChild(tvC);

    document.getElementById('_tvBack').onclick = () => ChartModule.close();
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

  /* ═══════════ open ═══════════ */
  function open(sym) {
    _sym      = sym || (typeof State !== 'undefined' ? State.asset : 'CL') || 'CL';
    _visible  = true;
    _linesReady  = false;
    _linesPending = false;
    _lines       = [];

    /* استرجاع interval محفوظ */
    const savedIv = _lsGet('iv_' + _sym);
    _interval = (savedIv && IV_HL[savedIv]) ? savedIv : '60';

    _ensureScreen();
    const screen = document.getElementById('chartScreen');
    if (screen) screen.classList.remove('hidden');

    _setHdr(_sym);
    _buildTrade();

    /* double rAF — ضمان أبعاد container */
    requestAnimationFrame(() => requestAnimationFrame(() => {
      /* دمّر القديم */
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

      /* ═══════════════════════════════════════════════
         onChartReady — البوابة الوحيدة للرسم
         لا يُسمح بـ createOrderLine قبل هذه النقطة
      ═══════════════════════════════════════════════ */
      _widget.onChartReady(() => {
        _linesReady = true;

        /* رسم فوري */
        _execLines();

        /* إذا كان هناك طلب معلّق أثناء التحميل */
        if (_linesPending) {
          _linesPending = false;
          _execLines();
        }

        /* تتبّع تغيير interval من داخل TV */
        try {
          _widget.chart().onIntervalChanged().subscribe(null, iv => {
            _interval = iv;
            _lsSet('iv_' + _sym, iv);
            /* أعد رسم الخطوط بعد تغيير الإطار الزمني */
            setTimeout(_execLines, 300);
          });
        } catch {}
      });
    }));

    _dot('wait');
    _bboConn(_sym);

    /* clock — يحدّث السعر وPnL من State */
    clearInterval(_clockTimer);
    _clockTimer = setInterval(() => {
      if (!_visible || typeof State === 'undefined') return;
      /* سعر */
      const p = State.prices?.[_sym]?.mid;
      if (p && Math.abs(p - _lastClose) > 0.000001) _setPrice(_sym, p);
      /* PnL في الخطوط كل 4 ثواني */
      if (Date.now() % 4000 < 1100) _scheduleLines();
    }, 1000);
  }

  /* ═══════════ close ═══════════ */
  function close() {
    _visible    = false;
    _linesReady = false;
    clearInterval(_clockTimer);
    _bboClose();
    _hideCf();
    _clearLines();
    if (document.fullscreenElement) document.exitFullscreen?.();
    const screen = document.getElementById('chartScreen');
    if (screen) screen.classList.add('hidden');
    /* widget يبقى — TV يحتفظ بإعدادات المستخدم */
  }

  /* ═══════════ switchInterval ═══════════ */
  function switchInterval(iv) {
    if (!iv || iv === _interval) return;
    _interval = iv;
    _lsSet('iv_' + _sym, iv);
    try {
      _widget?.chart?.().setResolution?.(iv);
    } catch {
      requestAnimationFrame(() => {
        _linesReady = false;
        _clearLines();
        if (_widget) { try { _widget.remove?.(); } catch {} _widget = null; }
        const c = document.getElementById('_tvC');
        if (c) {
          c.innerHTML = '';
          _widget = _mkWidget(_sym, iv);
          if (_widget) {
            _widget.onChartReady(() => {
              _linesReady = true;
              _execLines();
            });
          }
        }
      });
    }
  }

  /* ═══════════ switchAssetChart ═══════════ */
  function switchAssetChart(sym) {
    if (!_visible || sym === _sym) return;
    _sym = sym;
    _setHdr(sym);
    _buildTrade();
    _bboConn(sym);

    const savedIv = _lsGet('iv_' + sym);
    if (savedIv && IV_HL[savedIv]) _interval = savedIv;

    requestAnimationFrame(() => {
      _linesReady = false;
      _clearLines();
      if (_widget) { try { _widget.remove?.(); } catch {} _widget = null; }
      const c = document.getElementById('_tvC');
      if (c) {
        c.innerHTML = '';
        _widget = _mkWidget(sym, _interval);
        if (_widget) {
          _widget.onChartReady(() => {
            _linesReady = true;
            _execLines();
            try {
              _widget.chart().onIntervalChanged().subscribe(null, iv => {
                _interval = iv;
                _lsSet('iv_' + _sym, iv);
                setTimeout(_execLines, 300);
              });
            } catch {}
          });
        }
      }
    });
  }

  /* ═══════════ refreshLines ═══════════
     يُستدعى من positions.js عند تغيير المراكز
  ═══════════════════════════════════════ */
  function refreshLines() {
    if (!_visible) return;
    _scheduleLines();
  }

  return { open, close, switchInterval, switchAssetChart, refreshLines };
})();
