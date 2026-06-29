/* ═══════════════════════════════════════════════════════════════════
   chart.js — سيولة · TradingView Advanced Charts · v14

   ✅ 1. رسم نظيف — volume مُحذف بـ create_volume_indicator_by_default
   ✅ 2. auto-save ذكي — debounce 3s، يحفظ layout + drawings + indicators
   ✅ 3. خطوط مراكز مضمونة — نظام _linesReady + _pendingLines
   ✅ 4. timestamp bug — طرح intervalMs من tMs (open time لا close time)
   ✅ 5. nav أصول عربي — NQ/GOLD/XAU/SILVER/CL بالعربي RTL
   ✅ 6. زر fullscreen — native browser fullscreen

   DataFeed:
   ✅ resolveSymbol.timezone = 'Etc/UTC' (MUST — لا bug 1970)
   ✅ widget.timezone = 'Asia/Kuwait' (عرض UTC+3)
   ✅ noData:true على فراغ
   ✅ timestamps: UTC ms
═══════════════════════════════════════════════════════════════════ */
const ChartModule = (function () {
  'use strict';

  /* ═══ ثوابت ═══ */
  const HL_API   = 'https://api.hyperliquid.xyz';
  const HL_WS    = 'wss://api.hyperliquid.xyz/ws';
  const TROY     = 31.1035;
  const MIN_2020 = 1577836800000;
  const LS       = 'hl_tv_';
  const LAYOUT_KEY = 'layout_v1'; // مفتاح واحد، دائماً يُكتب فوقه

  /* TV resolution → HL interval string */
  const IV_HL = {
    '1':'1m','3':'3m','5':'5m','15':'15m','30':'30m',
    '60':'1h','120':'2h','240':'4h','360':'6h','720':'12h',
    '1D':'1d','1W':'1w',
  };

  /* TV resolution → milliseconds per bar (لإصلاح timestamp) */
  const IV_MS = {
    '1':60000,'3':180000,'5':300000,'15':900000,'30':1800000,
    '60':3600000,'120':7200000,'240':14400000,'360':21600000,'720':43200000,
    '1D':0,'1W':0, // daily+ لا تحتاج تصحيح
  };

  /* أصول التداول — عربي */
  const NAV_ASSETS = [
    { sym:'CL',     ar:'النفط',      icon:'🛢'  },
    { sym:'GOLD',   ar:'الذهب',      icon:'🟡' },
    { sym:'XAU',    ar:'غرام ذهب',   icon:'⚖️'  },
    { sym:'SILVER', ar:'الفضة',      icon:'⚪' },
    { sym:'NQ',     ar:'ناسداك',     icon:'📊' },
  ];

  const _lsGet = k => { try { return JSON.parse(localStorage.getItem(LS+k)); } catch { return null; } };
  const _lsSet = (k,v) => { try { localStorage.setItem(LS+k, JSON.stringify(v)); } catch {} };
  const _lsDel = k => { try { localStorage.removeItem(LS+k); } catch {} };

  /* ═══ حالة ═══ */
  let _widget       = null;
  let _visible      = false;
  let _sym          = 'CL';
  let _interval     = '60';
  let _lastClose    = 0;
  let _clockTimer   = null;
  let _saveTimer    = null;   // debounce للـ auto-save

  /* BBO WS */
  let _bboWs = null, _bboTimer = null;

  /* خطوط مراكز */
  let _lines        = [];
  let _linesReady   = false;
  let _linesPending = false;

  /* fullscreen */
  let _isFullscreen = false;

  /* ═══════════════════════════════════════════
     CSS
  ═══════════════════════════════════════════ */
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
  height:44px; padding:0 8px;
  background:var(--bg-card,#0d0d0d);
  border-bottom:1px solid var(--border,#1e1e1e);
  flex-shrink:0; direction:rtl; gap:6px; z-index:5;
}
.tvh-l { display:flex; align-items:center; gap:6px; min-width:0; flex:1; overflow:hidden; }
.tvh-r { display:flex; align-items:center; gap:5px; flex-shrink:0; }

.tvh-back {
  font-size:11px; font-weight:800; padding:4px 10px; border-radius:8px;
  border:1.5px solid rgba(255,140,66,.3); background:rgba(255,140,66,.1);
  color:var(--ac,#ff8c42); font-family:'Cairo',sans-serif;
  cursor:pointer; white-space:nowrap; flex-shrink:0; transition:opacity .13s;
}
.tvh-back:active { opacity:.55; transform:scale(.9); }

.tvh-info { display:flex; align-items:center; gap:5px; min-width:0; overflow:hidden; }
.tvh-icon { font-size:15px; flex-shrink:0; line-height:1; }
.tvh-name {
  font-size:12px; font-weight:900; color:var(--text-primary,#f0f0f0);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
.tvh-price {
  font-family:'IBM Plex Mono',monospace;
  font-size:14px; font-weight:800; color:var(--text-primary,#f0f0f0);
  flex-shrink:0; transition:color .18s;
}
.tvh-price.up { color:#00e676; }
.tvh-price.dn { color:#ff3d3d; }

.tvh-dot {
  width:7px; height:7px; border-radius:50%;
  background:#444; flex-shrink:0; transition:background .3s;
}
.tvh-dot.on   { background:#00e676; box-shadow:0 0 6px #00e676; }
.tvh-dot.wait { background:#ffd600; animation:_tvDt 1.1s ease-in-out infinite; }
.tvh-dot.off  { background:#ff3d3d; }
@keyframes _tvDt { 0%,100%{opacity:1} 50%{opacity:.15} }

/* fullscreen button */
.tvh-fs {
  width:28px; height:28px; border-radius:7px;
  border:1.5px solid var(--border,#1e1e1e);
  background:var(--bg-elev,#161616);
  color:var(--text-secondary,#777);
  font-size:13px; cursor:pointer;
  display:flex; align-items:center; justify-content:center;
  transition:all .13s; flex-shrink:0;
}
.tvh-fs:hover  { border-color:var(--ac,#ff8c42); color:var(--ac,#ff8c42); }
.tvh-fs:active { transform:scale(.86); }

/* ── Asset Nav ── */
#_tvNav {
  display:flex; align-items:center; gap:4px;
  padding:5px 8px;
  background:var(--bg-card,#0d0d0d);
  border-bottom:1px solid var(--border,#1e1e1e);
  flex-shrink:0; direction:rtl;
  overflow-x:auto; -webkit-overflow-scrolling:touch;
  scrollbar-width:none;
}
#_tvNav::-webkit-scrollbar { display:none; }

.tvn-btn {
  display:flex; align-items:center; gap:4px;
  padding:4px 10px; border-radius:999px; cursor:pointer;
  border:1.5px solid var(--border,#1e1e1e);
  background:var(--bg-elev,#161616);
  white-space:nowrap; flex-shrink:0;
  transition:all .13s;
}
.tvn-btn:active { transform:scale(.9); }
.tvn-icon { font-size:12px; line-height:1; }
.tvn-label {
  font-family:'Cairo',sans-serif;
  font-size:11px; font-weight:700;
  color:var(--text-secondary,#777);
}
.tvn-btn.on {
  border-color:var(--ac,#ff8c42);
  background:rgba(255,140,66,.14);
}
.tvn-btn.on .tvn-label { color:var(--ac,#ff8c42); font-weight:900; }

/* ── Trade Bar ── */
#_tvTrade {
  display:flex; align-items:center; gap:6px;
  padding:7px 8px;
  background:var(--bg-card,#0d0d0d);
  border-bottom:1px solid var(--border,#1e1e1e);
  flex-shrink:0; direction:rtl;
}
.tvt-btn {
  flex:1; min-height:50px; padding:6px 4px; border-radius:12px; border:none;
  font-family:'Cairo',sans-serif; font-size:14px; font-weight:900;
  cursor:pointer; color:#fff;
  display:flex; flex-direction:column;
  align-items:center; justify-content:center; gap:2px;
  transition:filter .12s, transform .1s;
}
.tvt-btn:active { transform:scale(.91); filter:brightness(.82); }
.tvt-buy  { background:linear-gradient(150deg,#00c853,#1b5e20); box-shadow:0 2px 10px rgba(0,200,83,.28); }
.tvt-sell { background:linear-gradient(150deg,#ff1744,#b71c1c); box-shadow:0 2px 10px rgba(255,23,68,.28); }
.tvt-dir  { font-size:13px; line-height:1; }
.tvt-px   { font-family:'IBM Plex Mono',monospace; font-size:9px; opacity:.7; }

.tvt-mid { flex:1.4; display:flex; flex-direction:column; align-items:center; gap:2px; }
.tvt-qlbl {
  font-size:9px; color:var(--text-muted,#444);
  font-weight:700; letter-spacing:.8px;
}
.tvt-qrow { display:flex; align-items:center; gap:5px; width:100%; justify-content:center; }
.tvt-qin {
  width:80px; font-family:'IBM Plex Mono',monospace;
  font-size:19px; font-weight:700; text-align:center; direction:ltr;
  background:var(--bg-input,#181818);
  border:1.5px solid var(--border,#1e1e1e); border-radius:10px;
  padding:5px 6px; color:var(--text-primary,#f0f0f0); outline:none;
  transition:border-color .14s;
  font-size:max(16px, 19px);
}
.tvt-qin:focus { border-color:var(--ac,#ff8c42); }
.tvt-unit {
  font-size:11px; font-weight:800;
  color:var(--text-secondary,#666); white-space:nowrap; flex-shrink:0;
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
  padding:14px 14px 30px;
  animation:_tvcfUp .22s cubic-bezier(.4,0,.2,1);
}
@keyframes _tvcfUp { from{transform:translateY(100%)} to{transform:none} }
.tvcf-hdl   { width:30px;height:3px;background:var(--border-strong,#2a2a2a);border-radius:999px;margin:0 auto 10px; }
.tvcf-title { font-size:16px;font-weight:900;margin-bottom:2px; }
.tvcf-sub   { font-size:11px;color:var(--text-secondary,#666);margin-bottom:9px; }
.tvcf-rows  { background:var(--bg-input,#181818);border-radius:10px;padding:5px 10px;margin-bottom:10px; }
.tvcf-row   { display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border,#1e1e1e);font-size:13px; }
.tvcf-row:last-child { border:none; }
.tvcf-k { color:var(--text-secondary,#666);font-weight:700; }
.tvcf-v { font-family:'IBM Plex Mono',monospace;font-weight:800;color:var(--text-primary,#f0f0f0); }
.tvcf-v.g { color:#00e676; } .tvcf-v.r { color:#ff3d3d; } .tvcf-v.w { color:#ffd600; }
.tvcf-btns { display:grid;grid-template-columns:1fr 1fr;gap:7px; }
.tvcf-cancel {
  padding:12px;border-radius:999px;
  border:1.5px solid var(--border-strong,#2a2a2a);
  background:var(--bg-elev,#161616);
  color:var(--text-secondary,#777);
  font-size:13px;font-weight:700;cursor:pointer;font-family:'Cairo',sans-serif;
}
.tvcf-exec {
  padding:12px;border-radius:999px;border:none;color:#fff;
  font-size:13px;font-weight:900;cursor:pointer;font-family:'Cairo',sans-serif;
  display:flex;align-items:center;justify-content:center;gap:5px;
  transition:filter .12s;
}
.tvcf-exec:active   { filter:brightness(.82); }
.tvcf-exec:disabled { opacity:.5;pointer-events:none; }
.tvcf-exec.g { background:linear-gradient(135deg,#00c853,#1b5e20); }
.tvcf-exec.r { background:linear-gradient(135deg,#ff1744,#b71c1c); }
.tvsp { width:13px;height:13px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:_tvSp .7s linear infinite; }
@keyframes _tvSp { to{transform:rotate(360deg)} }
`;
    document.head.appendChild(s);
  })();

  /* ═══ helpers ═══ */
  const _ai = s =>
    (typeof ASSETS !== 'undefined' && ASSETS[s]) ||
    { pxDp:2, szDp:2, name:s, icon:'📊', unit:'', lev:10, idx:0, cross:true };

  function _hlCoin(sym) {
    if (sym === 'XAU') return 'xyz:GOLD';
    if (typeof ASSETS !== 'undefined' && ASSETS[sym]) return ASSETS[sym].coin;
    return `xyz:${sym}`;
  }

  const _isGr    = s => s === 'XAU';
  const _toOz    = (s,d) => _isGr(s) ? d*TROY : d;
  const _toDisp  = (s,o) => _isGr(s) ? o/TROY : o;
  const _dark    = () => (document.documentElement.getAttribute('data-theme')||'dark') === 'dark';

  function _dot(cls) {
    const el = document.getElementById('_tvDot');
    if (el) el.className = 'tvh-dot '+cls;
  }

  function _setPrice(sym, disp) {
    _lastClose = disp;
    const el = document.getElementById('_tvPx');
    if (!el) return;
    const prev = parseFloat(el.dataset.p || 0);
    el.textContent = '$'+disp.toFixed(_ai(sym).pxDp);
    el.className   = 'tvh-price'+(disp>prev?' up':disp<prev?' dn':'');
    el.dataset.p   = disp;
    _updBtnPx(sym, disp);
  }

  function _updBtnPx(sym, mid) {
    if (!mid) return;
    const a  = _ai(sym);
    const bp = document.getElementById('_tvBuyPx');
    const sp = document.getElementById('_tvSellPx');
    if (bp) bp.textContent = '$'+(mid*1.0003).toFixed(a.pxDp);
    if (sp) sp.textContent = '$'+(mid*0.9997).toFixed(a.pxDp);
  }

  /* ═══ BBO WS ═══ */
  function _bboConn(sym) {
    _bboClose();
    try {
      _bboWs = new WebSocket(HL_WS);
      _bboWs.onopen = () => {
        _bboWs.send(JSON.stringify({ method:'subscribe', subscription:{ type:'bbo', coin:_hlCoin(sym) } }));
        _dot('on');
      };
      _bboWs.onmessage = e => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.channel !== 'bbo' || !msg.data) return;
          const b = parseFloat(msg.data.bbo?.[0]?.px||0);
          const a = parseFloat(msg.data.bbo?.[1]?.px||0);
          const mid = b&&a ? (b+a)/2 : 0;
          if (!mid) return;
          const raw  = (msg.data.coin||'').includes(':') ? msg.data.coin.split(':')[1] : msg.data.coin;
          const disp = (sym==='XAU' && raw==='GOLD') ? mid/TROY : mid;
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

  /* ═══════════════════════════════════════════
     Auto-Save Layout
     debounce 3s — يكتب على مفتاح ثابت LAYOUT_KEY
     لا يخلق layouts متعددة، دائماً يكتب فوق السابق
  ═══════════════════════════════════════════ */
  function _scheduleAutoSave() {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(_doAutoSave, 3000);
  }

  function _doAutoSave() {
    if (!_widget || !_linesReady) return;
    try {
      _widget.save(content => {
        _lsSet(LAYOUT_KEY, {
          sym:      _sym,
          interval: _interval,
          content,  // JSON string من TV يتضمن drawings + indicators + zoom + visible range
          ts:       Date.now(),
        });
      });
    } catch {}
  }

  function _loadSavedLayout() {
    return _lsGet(LAYOUT_KEY); // { sym, interval, content, ts }
  }

  /* ═══════════════════════════════════════════
     DataFeed
  ═══════════════════════════════════════════ */
  function _buildDatafeed(sym) {
    const hlCoin = _hlCoin(sym);
    const isGr   = _isGr(sym);
    const a      = _ai(sym);

    /* Candle WS */
    let _cws=null, _ctm=null, _ccb=null;

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
            if (msg.channel!=='candle' || !msg.data || !_ccb) return;
            const c = msg.data;
            /* WS t = ms of candle OPEN — verify */
            let tMs = c.t > 1e12 ? c.t : c.t*1000;
            /* ✅ Fix #4: WS candle t هي open time بالفعل — لا تصحيح هنا */
            if (tMs < MIN_2020) return;
            const bar = {
              time:   tMs,
              open:   isGr ? +c.o/TROY : +c.o,
              high:   isGr ? +c.h/TROY : +c.h,
              low:    isGr ? +c.l/TROY : +c.l,
              close:  isGr ? +c.c/TROY : +c.c,
              volume: +c.v||0,
            };
            if (bar.close>0) _ccb(bar);
          } catch {}
        };
        _cws.onerror  = ()=>{};
        _cws.onclose  = ()=>{
          if (_ccb && _visible) _ctm = setTimeout(()=>_cwConn(res,_ccb), 5000);
        };
      } catch {}
    }

    function _cwClose() {
      clearTimeout(_ctm);
      if (_cws) { try { _cws.close(); } catch {} _cws=null; }
      _ccb = null;
    }

    /* REST fetch */
    async function _fetchBars(from, to) {
      const toMs   = Math.min(to*1000, Date.now()+5000);
      const fromMs = Math.max(from*1000, MIN_2020);
      if (fromMs >= toMs) return [];

      const r = await fetch(HL_API+'/info', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          type:'candleSnapshot',
          req:{ coin:hlCoin, interval:IV_HL[_interval]||'1h', startTime:fromMs, endTime:toMs }
        })
      });
      if (!r.ok) return [];
      const raw = await r.json();
      if (!Array.isArray(raw)||!raw.length) return [];

      const ivMs = IV_MS[_interval] || 0; // milliseconds per interval

      const seen = new Set();
      return raw.map(c => {
        /*
         * ✅ Fix #4: Timestamp Bug
         * Hyperliquid REST candleSnapshot يعيد c.t = وقت الإغلاق (close time).
         * TradingView يتوقع وقت الفتح (open time).
         * الفرق = ivMs (مدة الشمعة).
         * Daily/Weekly: ivMs=0 لأن HL يعيد open time بالفعل لهم.
         */
        let tMs = c.t > 1e12 ? c.t : c.t*1000;
        if (ivMs > 0) tMs = tMs - ivMs; // تحويل close→open
        return {
          time:   tMs,
          open:   isGr ? +c.o/TROY : +c.o,
          high:   isGr ? +c.h/TROY : +c.h,
          low:    isGr ? +c.l/TROY : +c.l,
          close:  isGr ? +c.c/TROY : +c.c,
          volume: +c.v||0,
        };
      })
      .filter(b => {
        if (b.time < MIN_2020 || b.time > toMs+86400000 || b.close<=0) return false;
        if (seen.has(b.time)) return false;
        seen.add(b.time); return true;
      })
      .sort((x,y) => x.time - y.time);
    }

    return {
      onReady(cb) {
        setTimeout(()=>cb({
          supported_resolutions:    ['1','3','5','15','30','60','120','240','1D','1W'],
          currency_codes:           ['USD'],
          exchanges:                [{value:'HL',name:'Hyperliquid',desc:'Hyperliquid Perps'}],
          symbols_types:            [{name:'Perp',value:'perp'}],
          supports_search:          false,
          supports_group_request:   false,
          supports_marks:           false,
          supports_timescale_marks: false,
          supports_time:            false,
        }),0);
      },

      searchSymbols(){},

      resolveSymbol(name, ok) {
        const dp = a.pxDp||2;
        setTimeout(()=>ok({
          name, ticker:name, description:a.name||name,
          type:'crypto', session:'24x7',
          /* ✅ MUST = Etc/UTC */
          timezone:'Etc/UTC',
          minmov:1, pricescale:Math.pow(10,dp),
          has_intraday:true, has_daily:true, has_weekly_and_monthly:true,
          intraday_multipliers:['1','3','5','15','30','60','120','240'],
          supported_resolutions:['1','3','5','15','30','60','120','240','1D','1W'],
          volume_precision:4, data_status:'streaming',
          exchange:'Hyperliquid', listed_exchange:'Hyperliquid',
          format:'price', currency_code:'USD',
        }),0);
      },

      getBars(info, resolution, periodParams, onHistory, onError) {
        _interval = resolution;
        _fetchBars(periodParams.from, periodParams.to)
          .then(bars => {
            if (!bars.length) { onHistory([], {noData:true}); return; }
            _setPrice(sym, bars[bars.length-1].close);
            onHistory(bars, {noData:false});
          })
          .catch(e => { console.warn('[DF getBars]',e); onError(e.message); });
      },

      subscribeBars(info, resolution, onRealtime) {
        _cwConn(resolution, bar => {
          onRealtime(bar);
          _setPrice(sym, bar.close);
          _scheduleLines();
        });
      },

      unsubscribeBars() { _cwClose(); },
    };
  }

  /* ═══════════════════════════════════════════
     خطوط المراكز
     _linesReady = true فقط داخل onChartReady
     _scheduleLines آمن في أي وقت
  ═══════════════════════════════════════════ */
  function _clearLines() {
    _lines.forEach(l=>{ try{l.remove();}catch{} });
    _lines = [];
  }

  function _scheduleLines() {
    if (_linesReady) _execLines();
    else _linesPending = true;
  }

  function _execLines() {
    if (!_linesReady||!_widget) return;
    if (typeof State === 'undefined') return;

    let chart;
    try { chart = _widget.chart?.(); } catch { return; }
    if (!chart) return;

    _clearLines();

    for (const p of (State.positions||[])) {
      const rawC = (p.position.coin||'').includes(':')
        ? p.position.coin.split(':')[1] : p.position.coin;
      const pSym = rawC==='GOLD' ? 'XAU'
        : (typeof COIN_TO_SYM!=='undefined' ? COIN_TO_SYM[rawC]||rawC : rawC);
      if (pSym !== _sym) continue;

      const pos    = p.position;
      const sziOz  = parseFloat(pos.szi||0);
      if (!sziOz) continue;

      const isGr   = _isGr(_sym);
      const entOz  = parseFloat(pos.entryPx||0);
      const entD   = _toDisp(_sym, entOz);
      const pnl    = parseFloat(pos.unrealizedPnl||0);
      const isLong = sziOz > 0;
      const tpsl   = p.tpsl || {};
      const pnlSign= pnl>=0?'+':'';
      const pnlCol = pnl>=0?'#00e676':'#ff3d3d';

      /* ── Entry ── */
      if (entD > 0) {
        try {
          const ln = chart.createOrderLine()
            .setPrice(entD)
            .setQuantity(`${isLong?'▲':'▼'}  ${pnlSign}$${Math.abs(pnl).toFixed(2)}`)
            .setLineColor(pnlCol)
            .setBodyBorderColor(pnlCol)
            .setBodyBackgroundColor(pnlCol)
            .setBodyTextColor(pnl>=0?'#000':'#fff')
            .setLineWidth(1)
            .setLineStyle(0);
          _lines.push(ln);
        } catch(e) { console.warn('[lines] entry',e); }
      }

      /* ── TP ── */
      if (tpsl.tp) {
        const tpD   = _toDisp(_sym, tpsl.tp);
        const tpPnl = (Math.abs(sziOz)*Math.abs(tpsl.tp-entOz)).toFixed(2);
        try {
          const ln = chart.createOrderLine()
            .setPrice(tpD)
            .setQuantity(`🎯 TP  +$${tpPnl}`)
            .setLineColor('#00e8a2')
            .setBodyBorderColor('#00e8a2')
            .setBodyBackgroundColor('#00e8a2')
            .setBodyTextColor('#000')
            .setLineWidth(1)
            .setLineStyle(2);
          _lines.push(ln);
        } catch(e) { console.warn('[lines] tp',e); }
      }

      /* ── SL ── */
      if (tpsl.sl) {
        const slD   = _toDisp(_sym, tpsl.sl);
        const slPnl = (Math.abs(sziOz)*Math.abs(tpsl.sl-entOz)).toFixed(2);
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
        } catch(e) { console.warn('[lines] sl',e); }
      }

      /* ── Liq ── */
      try {
        const aForLiq = isGr
          ? (typeof ASSETS!=='undefined'&&ASSETS['GOLD'])||_ai('GOLD')
          : _ai(_sym);
        const balance = (typeof State!=='undefined'&&State.balance?.total)||0;
        let liqOz = null;

        if (typeof calcLiqPrice === 'function') {
          liqOz = calcLiqPrice(entOz, sziOz, balance, aForLiq.cross, aForLiq.lev);
        } else {
          const mmFrac  = 0.5/aForLiq.lev;
          const absSize = Math.abs(sziOz);
          const notional = absSize*entOz;
          if (aForLiq.cross) {
            const bal  = balance>0 ? balance : notional/aForLiq.lev;
            const free = bal - notional*mmFrac;
            liqOz = free>0
              ? entOz - (isLong?1:-1)*free/absSize
              : entOz*(isLong?0.99:1.01);
          } else {
            liqOz = isLong
              ? entOz*(1-1/aForLiq.lev+mmFrac)
              : entOz*(1+1/aForLiq.lev-mmFrac);
          }
        }

        if (liqOz&&liqOz>0) {
          const liqD = _toDisp(_sym, liqOz);
          const ln   = chart.createOrderLine()
            .setPrice(liqD)
            .setQuantity('⚡ تصفية')
            .setLineColor('#ff3d3d')
            .setBodyBorderColor('#c62828')
            .setBodyBackgroundColor('#c62828')
            .setBodyTextColor('#fff')
            .setLineWidth(1)
            .setLineStyle(1);
          _lines.push(ln);
        }
      } catch(e) { console.warn('[lines] liq',e); }

      break;
    }
  }

  /* ═══════════════════════════════════════════
     Save/Load Adapter — رسومات + مؤشرات + templates
  ═══════════════════════════════════════════ */
  function _buildSLA(sym) {
    const K = 'sla_'+sym;
    return {
      getAllCharts()           { return Promise.resolve(_lsGet(K+'_charts')||[]); },
      removeChart(id)         { _lsSet(K+'_charts',(_lsGet(K+'_charts')||[]).filter(c=>c.id!==id)); return Promise.resolve(); },
      saveChart(d) {
        /* ✅ دائماً يكتب فوق نفس الـ chart — لا duplicates */
        const item = {...d, id:'auto', timestamp:Date.now()};
        _lsSet(K+'_charts', [item]);
        return Promise.resolve('auto');
      },
      getChartContent(id)     { const i=(_lsGet(K+'_charts')||[]).find(c=>c.id===id); return Promise.resolve(i?.content||''); },
      getAllStudyTemplates()   { return Promise.resolve(_lsGet(K+'_stpl')||[]); },
      removeStudyTemplate(n)  { _lsSet(K+'_stpl',(_lsGet(K+'_stpl')||[]).filter(s=>s.name!==n)); return Promise.resolve(); },
      saveStudyTemplate(tpl)  {
        const data=_lsGet(K+'_stpl')||[], idx=data.findIndex(s=>s.name===tpl.name);
        if (idx>=0) data[idx]=tpl; else data.push(tpl);
        _lsSet(K+'_stpl',data); return Promise.resolve();
      },
      getStudyTemplateContent(n) { const i=(_lsGet(K+'_stpl')||[]).find(s=>s.name===n); return Promise.resolve(i?.content||''); },
      getDrawingTemplates(t)     { return Promise.resolve(_lsGet(K+'_dt_'+t)||[]); },
      loadDrawingTemplate(t,n)   { const i=(_lsGet(K+'_dt_'+t)||[]).find(d=>d.name===n); return Promise.resolve(i?.content||''); },
      removeDrawingTemplate(t,n) { _lsSet(K+'_dt_'+t,(_lsGet(K+'_dt_'+t)||[]).filter(d=>d.name!==n)); return Promise.resolve(); },
      saveDrawingTemplate(t,n,c) {
        const data=_lsGet(K+'_dt_'+t)||[], idx=data.findIndex(d=>d.name===n);
        const item={name:n,content:c};
        if (idx>=0) data[idx]=item; else data.push(item);
        _lsSet(K+'_dt_'+t,data); return Promise.resolve();
      },
    };
  }

  /* ═══════════════════════════════════════════
     Widget
  ═══════════════════════════════════════════ */
  function _mkWidget(sym, iv, savedContent) {
    if (!window.TradingView?.widget) {
      console.error('[chart.js] TradingView not loaded');
      return null;
    }
    const dark = _dark();

    const cfg = {
      container:    '_tvC',
      autosize:     true,
      symbol:       sym,
      interval:     iv,
      datafeed:     _buildDatafeed(sym),
      library_path: '/charting_library/',
      locale:       'en',
      timezone:     'Asia/Kuwait',
      theme:        dark ? 'Dark' : 'Light',

      overrides: {
        'paneProperties.background':                        dark?'#000000':'#F9F9F9',
        'paneProperties.backgroundType':                    'solid',
        'paneProperties.vertGridProperties.color':          dark?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.04)',
        'paneProperties.horzGridProperties.color':          dark?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.04)',
        'paneProperties.vertGridProperties.style':          0,
        'paneProperties.horzGridProperties.style':          0,
        'paneProperties.crossHairProperties.color':         '#888',
        'paneProperties.crossHairProperties.style':         2,
        'paneProperties.crossHairProperties.width':         1,
        'mainSeriesProperties.candleStyle.upColor':         '#00e676',
        'mainSeriesProperties.candleStyle.downColor':       '#ff3d3d',
        'mainSeriesProperties.candleStyle.drawBorder':      true,
        'mainSeriesProperties.candleStyle.borderUpColor':   '#00e676',
        'mainSeriesProperties.candleStyle.borderDownColor': '#ff3d3d',
        'mainSeriesProperties.candleStyle.wickUpColor':     '#00e676',
        'mainSeriesProperties.candleStyle.wickDownColor':   '#ff3d3d',
        'mainSeriesProperties.showPriceLine':               true,
        'mainSeriesProperties.priceLineColor':              '#ff8c42',
        'mainSeriesProperties.priceLineWidth':              1,
        'scalesProperties.fontSize':                        11,
        'scalesProperties.textColor':                       dark?'#777':'#555',
        'scalesProperties.lineColor':                       dark?'#222':'#ddd',
        'scalesProperties.backgroundColor':                 dark?'#000':'#F9F9F9',
      },

      /* ✅ #1: volume محذوف بالكامل */
      studies_overrides: {},

      disabled_features: [
        'header_symbol_search',
        'symbol_search_hot_key',
        'header_compare',
        'symbol_info',
        'border_around_the_chart',
        'display_market_status',
        'go_to_date',
        /* ✅ #1: هذا هو المفتاح — يمنع إضافة Volume تلقائياً */
        'create_volume_indicator_by_default',
        'volume_force_overlay',
      ],

      enabled_features: [
        'study_templates',
        'side_toolbar_in_fullscreen_mode',
        'header_in_fullscreen_mode',
        'horz_touch_drag_scroll',
        'vert_touch_drag_scroll',
        'pinch_scale',
        'axis_pressed_mouse_move_scale',
        'axis_double_clicked_reset_scale',
        'shift_visible_range_on_new_bar',
        'pre_post_market_sessions',
        'items_favoriting',
        'show_hide_button_in_legend',
        'hide_last_na_study_output',
        'adaptive_logo',
        'move_logo_to_main_pane',
        'end_of_period_timescale_marks',
        /* ✅ #2: حفظ محلي تلقائي من TV */
        'use_localstorage_for_settings',
        'save_chart_properties_to_local_storage',
        'chart_property_page_style',
        'chart_property_page_scales',
        'chart_property_page_background',
        'chart_property_page_timezone_sessions',
        'chart_property_page_trading',
        'force_touch_drag',
        'iframe_loading_compatibility_mode',
      ],

      /* ✅ #2: Save/Load Adapter للـ auto-save */
      save_load_adapter: _buildSLA(sym),

      loading_screen: {
        backgroundColor: dark?'#000000':'#F9F9F9',
        foregroundColor: dark?'#ff8c42':'#c96442',
      },

      client_id:   'suyula_hl',
      user_id:     'trader',
      charts_storage_api_version: '1.1',
      fullscreen:  false,
      debug:       false,
    };

    /* ✅ #2: استعادة layout محفوظ */
    if (savedContent) {
      cfg.saved_data = savedContent;
    }

    return new window.TradingView.widget(cfg);
  }

  /* ═══════════════════════════════════════════
     Asset Nav — عربي RTL
  ═══════════════════════════════════════════ */
  function _buildNav() {
    document.getElementById('_tvNav')?.remove();
    const nav = document.createElement('div');
    nav.id = '_tvNav';
    nav.innerHTML = NAV_ASSETS.map(a =>
      `<button class="tvn-btn${a.sym===_sym?' on':''}" data-sym="${a.sym}">
         <span class="tvn-icon">${a.icon}</span>
         <span class="tvn-label">${a.ar}</span>
       </button>`
    ).join('');

    const screen = document.getElementById('chartScreen');
    const trade  = document.getElementById('_tvTrade');
    const tvC    = document.getElementById('_tvC');

    if (screen && trade) screen.insertBefore(nav, trade);
    else if (screen && tvC) screen.insertBefore(nav, tvC);

    nav.querySelectorAll('.tvn-btn').forEach(b => {
      b.onclick = () => {
        const sym = b.dataset.sym;
        if (!sym || sym === _sym) return;
        ChartModule.switchAssetChart(sym);
        /* تحديث الأصل في State الرئيسي */
        if (typeof switchAsset === 'function') switchAsset(sym);
      };
    });
  }

  function _setNavActive(sym) {
    document.querySelectorAll('.tvn-btn').forEach(b =>
      b.classList.toggle('on', b.dataset.sym === sym)
    );
  }

  /* ═══════════════════════════════════════════
     Trade Bar
  ═══════════════════════════════════════════ */
  function _buildTrade() {
    document.getElementById('_tvTrade')?.remove();
    const a    = _ai(_sym);
    const defQ = _lsGet('qty_'+_sym) || a.presets?.[0] || 1;

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
            value="${defQ}" min="0" step="any" inputmode="decimal">
          <span class="tvt-unit">${a.unit||''}</span>
        </div>
      </div>
      <button class="tvt-btn tvt-buy" id="_tvBuy">
        <span class="tvt-dir">▲ شراء</span>
        <span class="tvt-px" id="_tvBuyPx">—</span>
      </button>`;

    const screen = document.getElementById('chartScreen');
    const tvC    = document.getElementById('_tvC');
    if (screen && tvC) screen.insertBefore(bar, tvC);

    document.getElementById('_tvQty').addEventListener('change', function() {
      const v = parseFloat(this.value);
      if (v>0) _lsSet('qty_'+_sym, v);
    });
    document.getElementById('_tvBuy').onclick  = () => _showCf(true);
    document.getElementById('_tvSell').onclick = () => _showCf(false);

    if (typeof State !== 'undefined') {
      const p = State.prices?.[_sym]?.mid;
      if (p) _setPrice(_sym, p);
    }
  }

  /* ═══════════════════════════════════════════
     Confirm Sheet
  ═══════════════════════════════════════════ */
  function _showCf(isBuy) {
    if (typeof State === 'undefined' || !State.wallet)
      return typeof toast !== 'undefined' && toast('سجّل الدخول أولاً', 'err');
    const qty = parseFloat(document.getElementById('_tvQty')?.value||0);
    if (!qty||qty<=0) return typeof toast !== 'undefined' && toast('أدخل الكمية', 'err');
    const a    = _ai(_sym);
    const isGr = _isGr(_sym);
    const mid  = _lastClose || (typeof State!=='undefined'?State.prices?.[_sym]?.mid:0)||0;
    if (!mid) return typeof toast !== 'undefined' && toast('لا يوجد سعر', 'err');
    const midOz = _toOz(_sym, mid);
    const qtyOz = isGr ? qty/TROY : qty;
    const usd   = (midOz*qtyOz).toFixed(2);
    const mgn   = (midOz*qtyOz/a.lev).toFixed(2);
    const mmR   = 0.5/a.lev;
    const liqOz = isBuy ? midOz*(1-1/a.lev+mmR) : midOz*(1+1/a.lev-mmR);
    const liqD  = _toDisp(_sym, liqOz).toFixed(a.pxDp);

    _hideCf();
    const screen = document.getElementById('chartScreen');
    if (!screen) return;

    const ov = document.createElement('div');
    ov.id='_tvcfOv'; ov.className='tvcf-ov';
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
    ov.onclick = e => { if (e.target===ov) _hideCf(); };
    document.getElementById('_tvcfC').onclick = _hideCf;
    document.getElementById('_tvcfX').onclick = () =>
      typeof requirePin !== 'undefined'
        ? requirePin(()=>_execTrade(isBuy,qty))
        : _execTrade(isBuy, qty);
  }

  function _hideCf() { document.getElementById('_tvcfOv')?.remove(); }

  async function _execTrade(isBuy, qty) {
    if (!State?.wallet) return;
    const btn = document.getElementById('_tvcfX');
    if (btn) { btn.disabled=true; btn.innerHTML='<span class="tvsp"></span>'; }
    const isGr  = _isGr(_sym);
    const aApi  = isGr
      ? (typeof ASSETS!=='undefined'&&ASSETS['GOLD'])||_ai('GOLD')
      : _ai(_sym);
    const mid   = _lastClose||State.prices?.[_sym]?.mid||0;
    const midOz = _toOz(_sym, mid);
    if (!midOz) { _hideCf(); return; }
    const qtyOz = isGr ? qty/TROY : qty;
    try {
      try { await hlExchange({type:'updateLeverage',asset:aApi.idx,isCross:aApi.cross,leverage:aApi.lev}); } catch {}
      await hlExchange({
        type:'order',
        orders:[{a:aApi.idx,b:isBuy,
          p:wirePx(midOz*(isBuy?1.02:0.98),aApi.szDp),
          s:wireSz(qtyOz,aApi.szDp),
          r:false,t:{limit:{tif:'Ioc'}}
        }],
        grouping:'na'
      });
      _hideCf();
      const disp = isGr ? qty.toFixed(2)+' غرام' : qty.toFixed(aApi.szDp)+' '+(aApi.unit||'');
      if (typeof toast!=='undefined') toast(`✅ ${aApi.icon} ${isBuy?'شراء':'بيع'} ${disp}`,'ok',4000);
      if (typeof pollAccount!=='undefined') setTimeout(pollAccount,2000);
    } catch(e) {
      if (typeof toast!=='undefined')
        toast(typeof tradeErr!=='undefined' ? tradeErr(e.message) : '❌ '+e.message.slice(0,100),'err',5000);
      if (btn) { btn.disabled=false; btn.innerHTML=isBuy?'✅ تأكيد الشراء':'✅ تأكيد البيع'; }
    }
  }

  /* ═══════════════════════════════════════════
     DOM
  ═══════════════════════════════════════════ */
  function _ensureScreen() {
    const screen = document.getElementById('chartScreen');
    if (!screen || document.getElementById('_tvHdr')) return;

    /* ✅ #6: fullscreen handler */
    document.addEventListener('fullscreenchange', () => {
      _isFullscreen = !!document.fullscreenElement;
      const btn = document.getElementById('_tvFsBtn');
      if (btn) btn.textContent = _isFullscreen ? '⛶' : '⛶';
      if (btn) btn.title = _isFullscreen ? 'خروج ملء الشاشة' : 'ملء الشاشة';
    });

    const hdr = document.createElement('nav');
    hdr.id = '_tvHdr';
    hdr.innerHTML = `
      <div class="tvh-l">
        <button class="tvh-back" id="_tvBack">← رجوع</button>
        <div class="tvh-info">
          <span id="_tvIcon" class="tvh-icon">🛢</span>
          <span id="_tvName" class="tvh-name">—</span>
          <span id="_tvPx"   class="tvh-price" data-p="0">—</span>
        </div>
      </div>
      <div class="tvh-r">
        <button class="tvh-fs" id="_tvFsBtn" title="ملء الشاشة">⛶</button>
        <div class="tvh-dot wait" id="_tvDot"></div>
      </div>`;
    screen.prepend(hdr);

    const tvC = document.createElement('div');
    tvC.id = '_tvC';
    screen.appendChild(tvC);

    document.getElementById('_tvBack').onclick = () => ChartModule.close();

    /* ✅ #6: fullscreen toggle */
    document.getElementById('_tvFsBtn').onclick = () => {
      const el = document.getElementById('chartScreen');
      if (!el) return;
      if (!document.fullscreenElement) {
        el.requestFullscreen?.().catch(()=>{});
      } else {
        document.exitFullscreen?.();
      }
    };
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

  /* ═══════════════════════════════════════════
     _initChart — بناء widget مع onChartReady
  ═══════════════════════════════════════════ */
  function _initChart(sym, iv, savedContent) {
    const c = document.getElementById('_tvC');
    if (!c) return;
    c.innerHTML = '';

    _linesReady   = false;
    _linesPending = false;
    _lines        = [];

    _widget = _mkWidget(sym, iv, savedContent);
    if (!_widget) return;

    _widget.onChartReady(() => {
      _linesReady = true;

      /* ✅ #3: رسم الخطوط فور الجاهزية */
      _execLines();
      if (_linesPending) { _linesPending=false; _execLines(); }

      /* تتبّع تغيير interval */
      try {
        _widget.chart().onIntervalChanged().subscribe(null, iv => {
          _interval = iv;
          _lsSet('iv_'+_sym, iv);
          _scheduleAutoSave();
          setTimeout(_execLines, 300);
        });
      } catch {}

      /* ✅ #2: ربط auto-save على تغييرات الرسم والمؤشرات */
      try {
        /* TV triggers: onAutoSaveNeeded, onMarkClick, onDataLoaded etc */
        _widget.subscribe('onAutoSaveNeeded', _scheduleAutoSave);
      } catch {}

      /* Save initial layout بعد 5s */
      setTimeout(_doAutoSave, 5000);
    });
  }

  /* ═══════════════════════════════════════════
     open
  ═══════════════════════════════════════════ */
  function open(sym) {
    _sym     = sym || (typeof State!=='undefined' ? State.asset : 'CL') || 'CL';
    _visible = true;

    /* ✅ #2: استرجاع layout محفوظ */
    const saved   = _loadSavedLayout();
    const useSaved = saved && saved.sym === _sym && saved.content;

    /* interval: من الـ layout المحفوظ أو من LS الأصل أو افتراضي */
    if (useSaved && saved.interval) {
      _interval = saved.interval;
    } else {
      const savedIv = _lsGet('iv_'+_sym);
      _interval = (savedIv && IV_HL[savedIv]) ? savedIv : '60';
    }

    _ensureScreen();
    const screen = document.getElementById('chartScreen');
    if (screen) screen.classList.remove('hidden');

    _setHdr(_sym);
    _buildTrade();
    _buildNav();

    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (_widget) {
        _clearLines();
        try { _widget.remove?.(); } catch {}
        _widget = null;
      }
      _initChart(_sym, _interval, useSaved ? saved.content : null);
    }));

    _dot('wait');
    _bboConn(_sym);

    clearInterval(_clockTimer);
    _clockTimer = setInterval(() => {
      if (!_visible || typeof State==='undefined') return;
      const p = State.prices?.[_sym]?.mid;
      if (p && Math.abs(p-_lastClose)>0.000001) _setPrice(_sym, p);
      /* تحديث PnL كل 4 ثواني */
      if (Date.now()%4000 < 1100) _scheduleLines();
    }, 1000);
  }

  /* ═══════════════════════════════════════════
     close
  ═══════════════════════════════════════════ */
  function close() {
    _visible    = false;
    _linesReady = false;
    clearInterval(_clockTimer);
    clearTimeout(_saveTimer);
    /* save قبل الإغلاق */
    _doAutoSave();
    _bboClose();
    _hideCf();
    _clearLines();
    if (document.fullscreenElement) document.exitFullscreen?.();
    const screen = document.getElementById('chartScreen');
    if (screen) screen.classList.add('hidden');
  }

  /* ═══════════════════════════════════════════
     switchInterval (من خارج — للاستخدام العام)
  ═══════════════════════════════════════════ */
  function switchInterval(iv) {
    if (!iv||iv===_interval) return;
    _interval = iv;
    _lsSet('iv_'+_sym, iv);
    try {
      _widget?.chart?.().setResolution?.(iv);
    } catch {
      requestAnimationFrame(() => {
        _clearLines();
        if (_widget) { try { _widget.remove?.(); } catch {} _widget=null; }
        _initChart(_sym, iv, null);
      });
    }
  }

  /* ═══════════════════════════════════════════
     switchAssetChart
  ═══════════════════════════════════════════ */
  function switchAssetChart(sym) {
    if (!_visible || sym===_sym) return;

    /* حفظ الـ layout الحالي قبل التبديل */
    _doAutoSave();

    _sym = sym;
    _setHdr(sym);
    _setNavActive(sym);
    _buildTrade();
    _bboConn(sym);

    /* layout للأصل الجديد */
    const saved    = _loadSavedLayout();
    const useSaved = saved && saved.sym===sym && saved.content;
    const savedIv  = _lsGet('iv_'+sym);
    _interval = useSaved && saved.interval ? saved.interval
      : (savedIv && IV_HL[savedIv] ? savedIv : '60');

    requestAnimationFrame(() => {
      _clearLines();
      if (_widget) { try { _widget.remove?.(); } catch {} _widget=null; }
      _initChart(sym, _interval, useSaved ? saved.content : null);
    });
  }

  /* ═══════════════════════════════════════════
     refreshLines — يُستدعى من positions.js
  ═══════════════════════════════════════════ */
  function refreshLines() {
    if (_visible) _scheduleLines();
  }

  return { open, close, switchInterval, switchAssetChart, refreshLines };
})();
