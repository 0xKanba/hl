/* ═══════════════════════════════════════════════════════════════════
   chart.js — سيولة · TradingView Advanced Charts · Final (corrected)

   ✅ خطوط مراكز: Entry + TP + SL + Liq (createOrderLine)
   ✅ PnL badge في header لأصل فيه صفقة
   ✅ Countdown to bar close مُصلَح (override صحيح)
   ✅ Timestamp: c.t يُستخدم مباشرة بلا أي طرح/تعديل.
      تم التحقق من توثيق Hyperliquid الرسمي (WS Candle type):
        interface Candle { t: number; // open millis
                            T: number; // close millis  ... }
      كل الإصدارات السابقة كانت تطرح ivMs من c.t ظنّاً أنه close time —
      هذا كان خاطئاً ويُزيح كل شمعة للخلف بمقدار interval كامل.
      هذا الإصدار يزيل الطرح نهائياً لكلا المصدرين (REST + WS).
   ✅ أسبوعي (1W): يُبنى يدوياً من شموع يومية '1d' مجمَّعة إلى أسابيع
      تبدأ الاثنين حسب توقيت الكويت — بدلاً من الاعتماد على '1w' الجاهزة
      من Hyperliquid والتي لا تضمن حدود أسبوع محددة. يشمل تحديث حي.
   ✅ خط محاور السعر/الزمن أكبر قليلاً (12–13px متجاوب) لسهولة القراءة
   ✅ No white flash: overlay على مستوى chartScreen
   ✅ Timezone: Kuwait افتراضياً، TV يحفظ تغيير المستخدم محلياً تلقائياً
   ✅ Responsive: موبايل + ديسكتوب
   ✅ Auto-save: layout + drawings + indicators (debounce 3s)
   ✅ Price isolation: كل أصل له state مستقل
═══════════════════════════════════════════════════════════════════ */
const ChartModule = (function () {
  'use strict';

  /* ══════════ ثوابت ══════════ */
  const HL_API     = 'https://api.hyperliquid.xyz';
  const HL_WS      = 'wss://api.hyperliquid.xyz/ws';
  const TROY       = 31.1035;
  const MIN_2020   = 1577836800000;
  const LS         = 'hl_tv_';
  const LAYOUT_KEY = 'layout_v1';

  /* TV resolution → HL interval */
  const IV_HL = {
    '1':'1m','3':'3m','5':'5m','15':'15m','30':'30m',
    '60':'1h','120':'2h','240':'4h','360':'6h','720':'12h',
    '1D':'1d','1W':'1w',
  };

  /*
   * الأسبوع يبدأ الاثنين — Hyperliquid's own '1w' candles لا تُستخدم
   * (حدودها غير مضمونة). بدلاً من ذلك نجلب شموع يومية '1d' ونجمّعها
   * يدوياً إلى أسابيع تبدأ الاثنين حسب توقيت الكويت (UTC+3 ثابت، بلا DST).
   */
  const KW_OFF = 3 * 3600000;

  function _weekStartMs(utcMs) {
    const local = utcMs + KW_OFF;
    const d = new Date(local);
    const dow  = d.getUTCDay();                 // 0=أحد..6=سبت (بإطار محلي مُزاح)
    const back = dow === 0 ? 6 : dow - 1;        // أيام منذ آخر اثنين
    const mon  = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - back*86400000;
    return mon - KW_OFF;                         // رجوع لـ UTC حقيقي
  }
  function _dayKeyMs(utcMs) {
    const local = utcMs + KW_OFF;
    const d = new Date(local);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  function _aggregateWeekly(dailyBars) {
    const map = new Map();
    for (const d of dailyBars) {
      const ws = _weekStartMs(d.time);
      const w  = map.get(ws);
      if (!w) map.set(ws, { time:ws, open:d.open, high:d.high, low:d.low, close:d.close, volume:d.volume });
      else {
        w.high  = Math.max(w.high, d.high);
        w.low   = Math.min(w.low,  d.low);
        w.close = d.close;      // dailyBars مرتّبة تصاعدياً — الأخير يفوز
        w.volume += d.volume;
      }
    }
    return Array.from(map.values()).sort((a,b)=>a.time-b.time);
  }

  const NAV_ASSETS = [
    { sym:'CL',     ar:'النفط',     icon:'🛢'  },
    { sym:'GOLD',   ar:'الذهب',     icon:'🟡'  },
    { sym:'XAU',    ar:'غرام ذهب',  icon:'⚖️'  },
    { sym:'SILVER', ar:'الفضة',     icon:'⚪'  },
    { sym:'NQ',     ar:'ناسداك',    icon:'📊'  },
  ];

  /* helpers localStorage */
  const _lsGet = k => { try { return JSON.parse(localStorage.getItem(LS+k)); } catch { return null; } };
  const _lsSet = (k,v) => { try { localStorage.setItem(LS+k, JSON.stringify(v)); } catch {} };

  /* ══════════ حالة ══════════ */
  let _widget      = null;
  let _visible     = false;
  let _sym         = 'CL';
  let _interval    = '60';
  let _clockTimer  = null;
  let _saveTimer   = null;
  const _prices    = {};        // سعر لكل أصل
  let _bboWs = null, _bboTimer = null, _bboSym = '';
  let _lines = [], _linesReady = false, _linesPending = false;

  /* ══════════════════════════════════════════
     CSS — موبايل + ديسكتوب responsive
  ══════════════════════════════════════════ */
  (function injectCSS() {
    if (document.getElementById('_tvCSS')) return;
    const s = document.createElement('style');
    s.id = '_tvCSS';
    s.textContent = `
/* ─ Chart Screen ─ */
.chart-screen {
  position:fixed; inset:0; z-index:50;
  display:flex; flex-direction:column;
  background:var(--bg-app,#000); overflow:hidden;
}
.chart-screen.hidden { display:none !important; }

/* ─ Header ─ */
#_tvHdr {
  display:flex; align-items:center; justify-content:space-between;
  padding:0 8px; height:46px;
  background:var(--bg-card,#0d0d0d);
  border-bottom:1px solid var(--border,#1e1e1e);
  flex-shrink:0; direction:rtl; gap:6px; z-index:5;
  min-width:0;
}
.tvh-l { display:flex; align-items:center; gap:5px; min-width:0; flex:1; overflow:hidden; }
.tvh-r { display:flex; align-items:center; gap:5px; flex-shrink:0; }

.tvh-back {
  font-size:11px; font-weight:800; padding:4px 9px; border-radius:8px;
  border:1.5px solid rgba(255,140,66,.3); background:rgba(255,140,66,.1);
  color:var(--ac,#ff8c42); font-family:'Cairo',sans-serif;
  cursor:pointer; white-space:nowrap; flex-shrink:0; transition:opacity .12s;
}
.tvh-back:active { opacity:.5; transform:scale(.9); }

.tvh-info { display:flex; align-items:center; gap:4px; min-width:0; overflow:hidden; flex:1; }
.tvh-icon { font-size:14px; flex-shrink:0; line-height:1; }
.tvh-name {
  font-size:11px; font-weight:900;
  color:var(--text-primary,#f0f0f0);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  display:none; /* hidden on very small screens */
}
.tvh-price {
  font-family:'IBM Plex Mono',monospace;
  font-size:13px; font-weight:800;
  color:var(--text-primary,#f0f0f0);
  flex-shrink:0; transition:color .18s; white-space:nowrap;
}
.tvh-price.up { color:#00e676; }
.tvh-price.dn { color:#ff3d3d; }

/* PnL chip — يظهر بجانب السعر إذا كان هناك صفقة */
.tvh-pnl {
  font-family:'IBM Plex Mono',monospace;
  font-size:10px; font-weight:800;
  padding:2px 6px; border-radius:6px;
  white-space:nowrap; flex-shrink:0;
  display:none; /* hidden by default, shown when position exists */
}
.tvh-pnl.pos { background:rgba(0,230,118,.15); color:#00e676; border:1px solid rgba(0,230,118,.3); }
.tvh-pnl.neg { background:rgba(255,61,61,.15);  color:#ff3d3d; border:1px solid rgba(255,61,61,.3);  }
.tvh-pnl.show { display:inline-block; }

.tvh-dot {
  width:7px; height:7px; border-radius:50%;
  background:#444; flex-shrink:0; transition:background .3s;
}
.tvh-dot.on   { background:#00e676; box-shadow:0 0 6px #00e676; }
.tvh-dot.wait { background:#ffd600; animation:_tvDt 1.1s ease-in-out infinite; }
.tvh-dot.off  { background:#ff3d3d; }
@keyframes _tvDt { 0%,100%{opacity:1} 50%{opacity:.15} }

.tvh-fs {
  width:27px; height:27px; border-radius:7px;
  border:1.5px solid var(--border,#1e1e1e);
  background:var(--bg-elev,#161616);
  color:var(--text-secondary,#777);
  font-size:12px; cursor:pointer;
  display:flex; align-items:center; justify-content:center;
  transition:all .12s; flex-shrink:0;
}
.tvh-fs:hover  { border-color:var(--ac,#ff8c42); color:var(--ac,#ff8c42); }
.tvh-fs:active { transform:scale(.86); }

/* ─ Asset Nav ─ */
#_tvNav {
  display:flex; align-items:center; gap:3px; padding:4px 8px;
  background:var(--bg-card,#0d0d0d);
  border-bottom:1px solid var(--border,#1e1e1e);
  flex-shrink:0; direction:rtl;
  overflow-x:auto; -webkit-overflow-scrolling:touch;
  scrollbar-width:none;
}
#_tvNav::-webkit-scrollbar { display:none; }
.tvn-btn {
  display:flex; align-items:center; gap:3px; padding:3px 9px;
  border-radius:999px; cursor:pointer;
  border:1.5px solid var(--border,#1e1e1e);
  background:var(--bg-elev,#161616);
  white-space:nowrap; flex-shrink:0; transition:all .12s;
}
.tvn-btn:active { transform:scale(.88); }
.tvn-icon  { font-size:11px; line-height:1; }
.tvn-label { font-family:'Cairo',sans-serif; font-size:10px; font-weight:700; color:var(--text-secondary,#777); }
.tvn-btn.on { border-color:var(--ac,#ff8c42); background:rgba(255,140,66,.13); }
.tvn-btn.on .tvn-label { color:var(--ac,#ff8c42); font-weight:900; }

/* ─ Trade Bar ─ */
#_tvTrade {
  display:flex; align-items:center; gap:5px; padding:6px 8px;
  background:var(--bg-card,#0d0d0d);
  border-bottom:1px solid var(--border,#1e1e1e);
  flex-shrink:0; direction:rtl;
}
.tvt-btn {
  flex:1; min-height:48px; padding:5px 3px; border-radius:11px; border:none;
  font-family:'Cairo',sans-serif; font-size:13px; font-weight:900;
  cursor:pointer; color:#fff;
  display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1px;
  transition:filter .12s, transform .1s; flex-shrink:0;
}
.tvt-btn:active { transform:scale(.91); filter:brightness(.82); }
.tvt-buy  { background:linear-gradient(150deg,#00c853,#1b5e20); box-shadow:0 2px 8px rgba(0,200,83,.25); }
.tvt-sell { background:linear-gradient(150deg,#ff1744,#b71c1c); box-shadow:0 2px 8px rgba(255,23,68,.25); }
.tvt-dir { font-size:13px; line-height:1; }
.tvt-px  { font-family:'IBM Plex Mono',monospace; font-size:9px; opacity:.7; }

.tvt-mid { flex:1; display:flex; flex-direction:column; align-items:center; gap:1px; min-width:0; }
.tvt-qlbl { font-size:8px; color:var(--text-muted,#444); font-weight:700; letter-spacing:.6px; }
.tvt-qrow { display:flex; align-items:center; gap:4px; }
.tvt-qin {
  width:72px; font-family:'IBM Plex Mono',monospace;
  font-size:max(16px,18px); font-weight:700; text-align:center; direction:ltr;
  background:var(--bg-input,#181818);
  border:1.5px solid var(--border,#1e1e1e); border-radius:9px;
  padding:4px 5px; color:var(--text-primary,#f0f0f0); outline:none;
  transition:border-color .13s;
}
.tvt-qin:focus { border-color:var(--ac,#ff8c42); }
.tvt-unit { font-size:10px; font-weight:800; color:var(--text-secondary,#666); white-space:nowrap; }

/* ─ TV Container ─ */
#_tvC {
  flex:1; min-height:0; width:100%;
  direction:ltr !important;
  overflow:hidden; position:relative;
  background:#000;
}
/* TV injects divs/iframes — fill container */
#_tvC > div   { width:100% !important; height:100% !important; }
#_tvC > iframe{ width:100% !important; height:100% !important; display:block; }

/* ─ Loading Overlay (مستوى chartScreen — لا white flash) ─ */
#_tvOvr {
  position:absolute; inset:0; z-index:200;
  background:var(--bg-app,#000);
  display:flex; flex-direction:column;
  align-items:center; justify-content:center; gap:18px;
  transition:opacity .4s ease;
  pointer-events:all;
}
#_tvOvr.fading { opacity:0; pointer-events:none; }
#_tvOvr.gone   { display:none; }
.tvovr-icon {
  font-size:38px; line-height:1;
  animation:_tvOvrP 2s ease-in-out infinite;
}
@keyframes _tvOvrP { 0%,100%{opacity:.45;transform:scale(1)} 50%{opacity:1;transform:scale(1.1)} }
.tvovr-name {
  font-family:'Cairo',sans-serif; font-size:15px; font-weight:900;
  color:var(--text-primary,#f0f0f0);
}
.tvovr-bar  { width:100px; height:2px; background:rgba(255,255,255,.06); border-radius:999px; overflow:hidden; }
.tvovr-prog {
  height:100%; width:35%;
  background:linear-gradient(90deg,transparent,var(--ac,#ff8c42),transparent);
  animation:_tvOvrS 1.4s ease-in-out infinite; border-radius:999px;
}
@keyframes _tvOvrS { 0%{transform:translateX(-120%)} 100%{transform:translateX(400%)} }
.tvovr-txt { font-family:'Cairo',sans-serif; font-size:11px; color:var(--text-muted,#444); font-weight:700; }

/* ─ Confirm Sheet ─ */
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
  border-radius:22px 22px 0 0; width:100%; max-width:520px;
  padding:14px 14px 30px; animation:_tvcfUp .22s cubic-bezier(.4,0,.2,1);
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
.tvcf-v.g{color:#00e676;} .tvcf-v.r{color:#ff3d3d;} .tvcf-v.w{color:#ffd600;}
.tvcf-btns { display:grid;grid-template-columns:1fr 1fr;gap:7px; }
.tvcf-cancel {
  padding:12px;border-radius:999px;border:1.5px solid var(--border-strong,#2a2a2a);
  background:var(--bg-elev,#161616);color:var(--text-secondary,#777);
  font-size:13px;font-weight:700;cursor:pointer;font-family:'Cairo',sans-serif;
}
.tvcf-exec {
  padding:12px;border-radius:999px;border:none;color:#fff;
  font-size:13px;font-weight:900;cursor:pointer;font-family:'Cairo',sans-serif;
  display:flex;align-items:center;justify-content:center;gap:5px;transition:filter .12s;
}
.tvcf-exec:active   { filter:brightness(.82); }
.tvcf-exec:disabled { opacity:.5;pointer-events:none; }
.tvcf-exec.g { background:linear-gradient(135deg,#00c853,#1b5e20); }
.tvcf-exec.r { background:linear-gradient(135deg,#ff1744,#b71c1c); }
.tvsp { width:13px;height:13px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:_tvSp .7s linear infinite; }
@keyframes _tvSp { to{transform:rotate(360deg)} }

/* ─ Responsive breakpoints ─ */
@media (min-width:400px) {
  .tvh-name { display:block; }
  .tvt-qin  { width:78px; }
}
@media (min-width:600px) {
  #_tvHdr   { height:48px; padding:0 12px; }
  .tvh-price{ font-size:15px; }
  .tvh-name { font-size:12px; }
  .tvh-back { font-size:12px; padding:5px 12px; }
  .tvt-btn  { min-height:52px; font-size:14px; }
  .tvt-qin  { width:90px; font-size:max(16px,20px); }
  .tvn-label{ font-size:11px; }
}
@media (min-width:900px) {
  #_tvHdr    { height:50px; padding:0 16px; }
  #_tvNav    { padding:5px 12px; gap:5px; }
  .tvn-btn   { padding:4px 12px; }
  #_tvTrade  { padding:7px 12px; gap:8px; }
  .tvcf-card { border-radius:22px; margin-bottom:20px; }
}
`;
    document.head.appendChild(s);
  })();

  /* ══════════ helpers ══════════ */
  const _ai = s =>
    (typeof ASSETS !== 'undefined' && ASSETS[s]) ||
    { pxDp:2, szDp:2, name:s, icon:'📊', unit:'', lev:10, idx:0, cross:true };

  function _hlCoin(s) {
    if (s==='XAU') return 'xyz:GOLD';
    if (typeof ASSETS!=='undefined'&&ASSETS[s]) return ASSETS[s].coin;
    return `xyz:${s}`;
  }
  const _isGr   = s => s==='XAU';
  const _toOz   = (s,d) => _isGr(s)?d*TROY:d;
  const _toDisp = (s,o) => _isGr(s)?o/TROY:o;
  const _dark   = () => (document.documentElement.getAttribute('data-theme')||'dark')==='dark';
  const _dot    = cls => { const e=document.getElementById('_tvDot'); if(e) e.className='tvh-dot '+cls; };

  /* ══════════ Price state — معزول لكل أصل ══════════ */
  function _setPrice(sym, disp) {
    _prices[sym] = disp;
    if (sym!==_sym) return;
    const el = document.getElementById('_tvPx');
    if (!el) return;
    const prev = parseFloat(el.dataset.p||0);
    el.textContent = '$'+disp.toFixed(_ai(sym).pxDp);
    el.className   = 'tvh-price'+(disp>prev?' up':disp<prev?' dn':'');
    el.dataset.p   = disp;
    _updBtnPx(sym,disp);
  }
  function _updBtnPx(sym,mid) {
    if (!mid||sym!==_sym) return;
    const a  = _ai(sym);
    const bp = document.getElementById('_tvBuyPx');
    const sp = document.getElementById('_tvSellPx');
    if(bp) bp.textContent='$'+(mid*1.0003).toFixed(a.pxDp);
    if(sp) sp.textContent='$'+(mid*0.9997).toFixed(a.pxDp);
  }
  function _curPx() {
    return _prices[_sym]||(typeof State!=='undefined'?State.prices?.[_sym]?.mid:0)||0;
  }

  /* ══════════ PnL badge في header ══════════ */
  function _updatePnlBadge() {
    const el = document.getElementById('_tvPnl');
    if (!el||typeof State==='undefined') return;
    let pnl = null;
    for (const p of (State.positions||[])) {
      const rawC = (p.position.coin||'').includes(':')
        ? p.position.coin.split(':')[1] : p.position.coin;
      const pSym = rawC==='GOLD'?'XAU'
        :(typeof COIN_TO_SYM!=='undefined'?COIN_TO_SYM[rawC]||rawC:rawC);
      if (pSym===_sym) { pnl=parseFloat(p.position.unrealizedPnl||0); break; }
    }
    if (pnl===null) {
      el.classList.remove('show','pos','neg');
      el.textContent='';
    } else {
      const cls = pnl>=0?'pos':'neg';
      el.className = `tvh-pnl show ${cls}`;
      el.textContent = (pnl>=0?'+':'')+'$'+Math.abs(pnl).toFixed(2);
    }
  }

  /* ══════════ Overlay (loading state) ══════════ */
  function _ovrShow(sym) {
    const scr = document.getElementById('chartScreen');
    if (!scr) return;
    let el = document.getElementById('_tvOvr');
    if (!el) {
      el = document.createElement('div');
      el.id = '_tvOvr';
      scr.appendChild(el);
    }
    const a = _ai(sym);
    el.innerHTML = `
      <span class="tvovr-icon">${a.icon}</span>
      <span class="tvovr-name">${a.name}</span>
      <div class="tvovr-bar"><div class="tvovr-prog"></div></div>
      <span class="tvovr-txt">جاري التحميل...</span>`;
    el.classList.remove('fading','gone');
    el.style.opacity='1';
  }
  function _ovrHide() {
    const el = document.getElementById('_tvOvr');
    if (!el||el.classList.contains('gone')) return;
    el.classList.add('fading');
    setTimeout(()=>{ el.classList.add('gone'); el.classList.remove('fading'); }, 440);
  }

  /* ══════════ BBO WebSocket ══════════ */
  function _bboConn(sym) {
    if (_bboSym===sym&&_bboWs?.readyState===WebSocket.OPEN) return;
    _bboClose(); _bboSym=sym;
    try {
      _bboWs = new WebSocket(HL_WS);
      _bboWs.onopen = () => {
        _bboWs.send(JSON.stringify({method:'subscribe',subscription:{type:'bbo',coin:_hlCoin(sym)}}));
        _dot('on');
      };
      _bboWs.onmessage = e => {
        try {
          const msg=JSON.parse(e.data);
          if(msg.channel!=='bbo'||!msg.data) return;
          const b=parseFloat(msg.data.bbo?.[0]?.px||0);
          const a=parseFloat(msg.data.bbo?.[1]?.px||0);
          const mid=b&&a?(b+a)/2:0; if(!mid) return;
          const raw=(msg.data.coin||'').includes(':')?msg.data.coin.split(':')[1]:msg.data.coin;
          _setPrice(_bboSym,_bboSym==='XAU'&&raw==='GOLD'?mid/TROY:mid);
        } catch {}
      };
      _bboWs.onerror=()=>_dot('off');
      _bboWs.onclose=()=>{
        _dot('wait');
        if(_visible&&_bboSym===sym) _bboTimer=setTimeout(()=>_bboConn(sym),4000);
      };
    } catch { _dot('off'); }
  }
  function _bboClose() {
    clearTimeout(_bboTimer);
    if(_bboWs){try{_bboWs.close();}catch{}_bboWs=null;}
    _bboSym='';
  }

  /* ══════════════════════════════════════════
     DataFeed
  ══════════════════════════════════════════ */
  function _buildDatafeed(sym) {
    const _dfSym = sym;   // snapshot — closure معزولة
    const hlCoin = _hlCoin(sym);
    const isGr   = _isGr(sym);
    const a      = _ai(sym);
    let _cws=null, _ctm=null, _ccb=null;
    /* أيام الأسبوع الجاري تجميعها لحظياً — لتحديث الشمعة الأسبوعية الحيّة */
    let _curWeek = new Map();   // dayKeyMs → daily bar

    /* ── جلب REST خام بأي interval فعلي من Hyperliquid ── */
    async function _fetchRaw(fromMs, toMs, hlIv) {
      const r = await fetch(HL_API+'/info', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({type:'candleSnapshot',req:{
          coin:hlCoin, interval:hlIv, startTime:fromMs, endTime:toMs
        }})
      });
      if (!r.ok) return [];
      const raw = await r.json();
      if (!Array.isArray(raw)||!raw.length) return [];
      /* ✅ c.t = open time بالفعل (مؤكَّد من توثيق Hyperliquid الرسمي) */
      const seen=new Set();
      return raw.map(c=>{
        const tMs=c.t>1e12?c.t:c.t*1000;
        return {
          time:tMs,
          open:isGr?+c.o/TROY:+c.o, high:isGr?+c.h/TROY:+c.h,
          low:isGr?+c.l/TROY:+c.l,  close:isGr?+c.c/TROY:+c.c,
          volume:+c.v||0,
        };
      }).filter(b=>{
        if(b.time<MIN_2020||b.time>toMs+86400000||b.close<=0) return false;
        if(seen.has(b.time)) return false;
        seen.add(b.time); return true;
      }).sort((x,y)=>x.time-y.time);
    }

    /* ── موزّع: '1W' يُبنى من شموع يومية مجمَّعة، الباقي مباشر ── */
    async function _fetchBars(from, to, res) {
      const toMs   = Math.min(to*1000, Date.now()+5000);
      const fromMs = Math.max(from*1000, MIN_2020);
      if (fromMs>=toMs) return [];

      if (res === '1W') {
        const daily = await _fetchRaw(fromMs, toMs, '1d');
        if (!daily.length) return [];
        /* ابذر تتبّع الأسبوع الجاري من آخر أيام مجلوبة — للتحديث الحي لاحقاً */
        const lastWs = _weekStartMs(daily[daily.length-1].time);
        _curWeek.clear();
        daily.forEach(d => { if (_weekStartMs(d.time)===lastWs) _curWeek.set(_dayKeyMs(d.time), d); });
        return _aggregateWeekly(daily);
      }
      return _fetchRaw(fromMs, toMs, IV_HL[res]||'1h');
    }

    /* ── WS حيّ ── */
    function _cwConn(res, cb) {
      _cwClose(); _ccb=cb;
      const wsIv = res==='1W' ? '1d' : (IV_HL[res]||'1h');
      try {
        _cws = new WebSocket(HL_WS);
        _cws.onopen = () => _cws.send(JSON.stringify({
          method:'subscribe',
          subscription:{type:'candle',coin:hlCoin,interval:wsIv}
        }));
        _cws.onmessage = e => {
          try {
            const msg=JSON.parse(e.data);
            if(msg.channel!=='candle'||!msg.data||!_ccb) return;
            const c=msg.data;
            /* ✅ c.t = open time بالفعل — لا طرح، لا تعديل */
            const tMs = c.t>1e12?c.t:c.t*1000;
            if (tMs<MIN_2020) return;
            const bar={
              time:tMs,
              open:isGr?+c.o/TROY:+c.o, high:isGr?+c.h/TROY:+c.h,
              low:isGr?+c.l/TROY:+c.l,  close:isGr?+c.c/TROY:+c.c,
              volume:+c.v||0,
            };
            if (bar.close<=0) return;

            if (res==='1W') {
              /* دمج التِك اليومي في الشمعة الأسبوعية الجارية (اثنين→الآن) */
              const ws=_weekStartMs(bar.time);
              for (const [k,v] of _curWeek) if (_weekStartMs(v.time)!==ws) _curWeek.delete(k);
              _curWeek.set(_dayKeyMs(bar.time), bar);
              const merged  = _aggregateWeekly(Array.from(_curWeek.values()));
              const weekBar = merged.find(w=>w.time===ws);
              if (!weekBar) return;
              _ccb(weekBar);
              _setPrice(_dfSym, weekBar.close);
            } else {
              _ccb(bar);
              _setPrice(_dfSym, bar.close);
            }
            _scheduleLines();
          } catch {}
        };
        _cws.onerror=()=>{};
        _cws.onclose=()=>{
          if(_ccb&&_visible&&_dfSym===_sym)
            _ctm=setTimeout(()=>_cwConn(res,_ccb),5000);
        };
      } catch {}
    }
    function _cwClose() {
      clearTimeout(_ctm);
      if(_cws){try{_cws.close();}catch{}_cws=null;}
      _ccb=null;
    }

    return {
      onReady(cb){
        setTimeout(()=>cb({
          supported_resolutions:['1','3','5','15','30','60','120','240','1D','1W'],
          currency_codes:['USD'],
          exchanges:[{value:'HL',name:'Hyperliquid',desc:'Hyperliquid Perps'}],
          symbols_types:[{name:'Perp',value:'perp'}],
          supports_search:false,supports_group_request:false,
          supports_marks:false,supports_timescale_marks:false,supports_time:false,
        }),0);
      },
      searchSymbols(){},
      resolveSymbol(name,ok){
        const dp=a.pxDp||2;
        setTimeout(()=>ok({
          name,ticker:name,description:a.name||name,type:'crypto',session:'24x7',
          /* MUST = Etc/UTC — لا تغيّر: timestamps = UTC ms من HL */
          timezone:'Etc/UTC',
          minmov:1,pricescale:Math.pow(10,dp),
          has_intraday:true,has_daily:true,has_weekly_and_monthly:true,
          intraday_multipliers:['1','3','5','15','30','60','120','240'],
          supported_resolutions:['1','3','5','15','30','60','120','240','1D','1W'],
          volume_precision:4,data_status:'streaming',
          exchange:'Hyperliquid',listed_exchange:'Hyperliquid',
          format:'price',currency_code:'USD',
        }),0);
      },
      getBars(info,res,pp,onH,onE){
        if(_dfSym===_sym) _interval=res;
        _fetchBars(pp.from,pp.to,res)
          .then(bars=>{
            if(!bars.length){onH([],{noData:true});return;}
            _setPrice(_dfSym,bars[bars.length-1].close);
            onH(bars,{noData:false});
          })
          .catch(e=>{console.warn('[DF]',_dfSym,e);onE(e.message);});
      },
      subscribeBars(info,res,onRT){_cwConn(res,onRT);},
      unsubscribeBars(){_cwClose();},
    };
  }

  /* ══════════ Auto-Save ══════════ */
  function _scheduleAutoSave(){clearTimeout(_saveTimer);_saveTimer=setTimeout(_doAutoSave,3000);}
  function _doAutoSave(){
    if(!_widget||!_linesReady) return;
    try{_widget.save(c=>_lsSet(LAYOUT_KEY,{sym:_sym,interval:_interval,content:c,ts:Date.now()}));}catch{}
  }
  function _loadLayout(){return _lsGet(LAYOUT_KEY);}

  /* ══════════════════════════════════════════
     خطوط المراكز
     Gate: _linesReady = true فقط داخل onChartReady
  ══════════════════════════════════════════ */
  function _clearLines(){_lines.forEach(l=>{try{l.remove();}catch{}});_lines=[];}
  function _scheduleLines(){if(_linesReady)_execLines();else _linesPending=true;}

  function _execLines(){
    if(!_linesReady||!_widget||typeof State==='undefined') return;
    let chart; try{chart=_widget.chart?.();}catch{return;} if(!chart) return;
    _clearLines();

    /* ── Positions ── */
    for (const p of (State.positions||[])){
      const rawC=(p.position.coin||'').includes(':')?p.position.coin.split(':')[1]:p.position.coin;
      const pSym=rawC==='GOLD'?'XAU':(typeof COIN_TO_SYM!=='undefined'?COIN_TO_SYM[rawC]||rawC:rawC);
      if(pSym!==_sym) continue;
      const pos=p.position,sziOz=parseFloat(pos.szi||0); if(!sziOz) continue;
      const isGr=_isGr(_sym),entOz=parseFloat(pos.entryPx||0),entD=_toDisp(_sym,entOz);
      const pnl=parseFloat(pos.unrealizedPnl||0),isLong=sziOz>0,tpsl=p.tpsl||{};
      const pnlCol=pnl>=0?'#00e676':'#ff3d3d';

      /* Entry */
      if(entD>0){
        try{_lines.push(chart.createOrderLine()
          .setPrice(entD)
          .setQuantity(`${isLong?'▲':'▼'}  ${pnl>=0?'+':''}$${Math.abs(pnl).toFixed(2)}`)
          .setLineColor(pnlCol).setBodyBorderColor(pnlCol).setBodyBackgroundColor(pnlCol)
          .setBodyTextColor(pnl>=0?'#000':'#fff').setLineWidth(1).setLineStyle(0));}
        catch(e){console.warn('[L]entry',e);}
      }
      /* TP */
      if(tpsl.tp){
        const tpD=_toDisp(_sym,tpsl.tp),tpPnl=(Math.abs(sziOz)*Math.abs(tpsl.tp-entOz)).toFixed(2);
        try{_lines.push(chart.createOrderLine()
          .setPrice(tpD).setQuantity(`🎯 TP  +$${tpPnl}`)
          .setLineColor('#00e8a2').setBodyBorderColor('#00e8a2').setBodyBackgroundColor('#00e8a2')
          .setBodyTextColor('#000').setLineWidth(1).setLineStyle(2));}
        catch(e){console.warn('[L]tp',e);}
      }
      /* SL */
      if(tpsl.sl){
        const slD=_toDisp(_sym,tpsl.sl),slPnl=(Math.abs(sziOz)*Math.abs(tpsl.sl-entOz)).toFixed(2);
        try{_lines.push(chart.createOrderLine()
          .setPrice(slD).setQuantity(`🛡 SL  -$${slPnl}`)
          .setLineColor('#ff6a1a').setBodyBorderColor('#ff6a1a').setBodyBackgroundColor('#ff6a1a')
          .setBodyTextColor('#fff').setLineWidth(1).setLineStyle(2));}
        catch(e){console.warn('[L]sl',e);}
      }
      /* Liq */
      try{
        const aL=isGr?(typeof ASSETS!=='undefined'&&ASSETS['GOLD'])||_ai('GOLD'):_ai(_sym);
        const bal=(State.balance?.total)||0;
        let liqOz=null;
        if(typeof calcLiqPrice==='function'){
          liqOz=calcLiqPrice(entOz,sziOz,bal,aL.cross,aL.lev);
        } else {
          const mm=0.5/aL.lev,abs=Math.abs(sziOz),ntl=abs*entOz;
          if(aL.cross){
            const b2=bal>0?bal:ntl/aL.lev,fr=b2-ntl*mm;
            liqOz=fr>0?entOz-(isLong?1:-1)*fr/abs:entOz*(isLong?.99:1.01);
          } else {
            liqOz=isLong?entOz*(1-1/aL.lev+mm):entOz*(1+1/aL.lev-mm);
          }
        }
        if(liqOz&&liqOz>0){
          _lines.push(chart.createOrderLine()
            .setPrice(_toDisp(_sym,liqOz)).setQuantity('⚡ تصفية')
            .setLineColor('#ff3d3d').setBodyBorderColor('#c62828').setBodyBackgroundColor('#c62828')
            .setBodyTextColor('#fff').setLineWidth(1).setLineStyle(1));
        }
      }catch(e){console.warn('[L]liq',e);}
      break; /* أصل واحد */
    }

    /* ── Open Orders ── */
    for (const o of (State.openOrders||[])){
      const rawC=(o.coin||'').includes(':')?o.coin.split(':')[1]:o.coin;
      const oSym=rawC==='GOLD'?'XAU':(typeof COIN_TO_SYM!=='undefined'?COIN_TO_SYM[rawC]||rawC:rawC);
      if(oSym!==_sym) continue;
      const px=parseFloat(o.limitPx||o.triggerPx||0); if(!px) continue;
      const dispPx=_toDisp(_sym,px),isBuy=o.side==='B',isTrig=!!o.isTrigger;
      const ot=(o.orderType||'').toLowerCase();
      let label,color,bg;
      if(isTrig){
        if(ot.includes('take profit')||ot.includes('tp')){label=`🎯 TP ${isBuy?'▲':'▼'}`;color='#00e8a2';bg='#00e8a2';}
        else if(ot.includes('stop')){label=`🛡 SL ${isBuy?'▲':'▼'}`;color='#ff6a1a';bg='#ff6a1a';}
        else{label=`⏹ ${isBuy?'▲':'▼'}`;color='#ffd600';bg='#9a8000';}
      } else if(isBuy){label='📋 شراء';color='#00e676';bg='#00e676';}
      else{label='📋 بيع';color='#ff3d3d';bg='#ff3d3d';}
      try{_lines.push(chart.createOrderLine()
        .setPrice(dispPx).setQuantity(label)
        .setLineColor(color).setBodyBorderColor(color).setBodyBackgroundColor(bg)
        .setBodyTextColor(bg==='#00e8a2'?'#000':'#fff')
        .setLineWidth(1).setLineStyle(isTrig?2:0));}
      catch(e){console.warn('[L]ord',e);}
    }

    /* حدّث PnL badge */
    _updatePnlBadge();
  }

  /* ══════════ Save/Load Adapter ══════════ */
  function _buildSLA(sym){
    const K='sla_'+sym;
    const g=k=>_lsGet(K+k)||[];
    const sv=(k,v)=>_lsSet(K+k,v);
    return {
      getAllCharts(){return Promise.resolve(g('_c'));},
      removeChart(id){sv('_c',g('_c').filter(x=>x.id!==id));return Promise.resolve();},
      /* دائماً يكتب فوق id='auto' — لا duplicates */
      saveChart(d){sv('_c',[{...d,id:'auto',timestamp:Date.now()}]);return Promise.resolve('auto');},
      getChartContent(id){const i=g('_c').find(x=>x.id===id);return Promise.resolve(i?.content||'');},
      getAllStudyTemplates(){return Promise.resolve(g('_st'));},
      removeStudyTemplate(n){sv('_st',g('_st').filter(x=>x.name!==n));return Promise.resolve();},
      saveStudyTemplate(t){const d=g('_st'),i=d.findIndex(x=>x.name===t.name);if(i>=0)d[i]=t;else d.push(t);sv('_st',d);return Promise.resolve();},
      getStudyTemplateContent(n){const i=g('_st').find(x=>x.name===n);return Promise.resolve(i?.content||'');},
      getDrawingTemplates(t){return Promise.resolve(g('_dt'+t));},
      loadDrawingTemplate(t,n){const i=g('_dt'+t).find(x=>x.name===n);return Promise.resolve(i?.content||'');},
      removeDrawingTemplate(t,n){sv('_dt'+t,g('_dt'+t).filter(x=>x.name!==n));return Promise.resolve();},
      saveDrawingTemplate(t,n,c){const d=g('_dt'+t),i=d.findIndex(x=>x.name===n);const it={name:n,content:c};if(i>=0)d[i]=it;else d.push(it);sv('_dt'+t,d);return Promise.resolve();},
    };
  }

  /* ══════════════════════════════════════════
     Widget — كل مميزات TV مفعّلة
  ══════════════════════════════════════════ */
  function _mkWidget(sym,iv,saved){
    if(!window.TradingView?.widget){console.error('[chart.js] TV not loaded');return null;}
    const dark=_dark();
    /* حجم خط المحاور (سعر + زمن) — أكبر قليلاً، متجاوب مع حجم الشاشة */
    const scaleFont = window.innerWidth>=600 ? 13 : 12;
    const cfg={
      container:'_tvC', autosize:true,
      symbol:sym, interval:iv,
      datafeed:_buildDatafeed(sym),
      library_path:'/charting_library/',
      locale:'en',
      /* UTC+3 افتراضياً — TV يحفظ تغيير المستخدم تلقائياً */
      timezone:'Asia/Kuwait',
      theme:dark?'Dark':'Light',

      overrides:{
        'paneProperties.background':              dark?'#000000':'#F9F9F9',
        'paneProperties.backgroundType':          'solid',
        'paneProperties.vertGridProperties.color':dark?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.04)',
        'paneProperties.horzGridProperties.color':dark?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.04)',
        'paneProperties.vertGridProperties.style':0,
        'paneProperties.horzGridProperties.style':0,
        'paneProperties.crossHairProperties.color':'#888',
        'paneProperties.crossHairProperties.style':2,
        'paneProperties.crossHairProperties.width':1,
        /* شموع */
        'mainSeriesProperties.candleStyle.upColor':         '#00e676',
        'mainSeriesProperties.candleStyle.downColor':       '#ff3d3d',
        'mainSeriesProperties.candleStyle.drawBorder':      true,
        'mainSeriesProperties.candleStyle.borderUpColor':   '#00e676',
        'mainSeriesProperties.candleStyle.borderDownColor': '#ff3d3d',
        'mainSeriesProperties.candleStyle.wickUpColor':     '#00e676',
        'mainSeriesProperties.candleStyle.wickDownColor':   '#ff3d3d',
        /* Price line */
        'mainSeriesProperties.showPriceLine':               true,
        'mainSeriesProperties.priceLineColor':              '#ff8c42',
        'mainSeriesProperties.priceLineWidth':              1,
        /*
         * ✅ Countdown to bar close
         * Override مباشر — لا يتعارض مع أي شيء آخر
         */
        'mainSeriesProperties.showCountdown':               true,
        /* المحاور — خط أكبر لسهولة القراءة (سعر + زمن) */
        'scalesProperties.fontSize':                        scaleFont,
        'scalesProperties.textColor':                       dark?'#999':'#444',
        'scalesProperties.lineColor':                       dark?'#222':'#ddd',
        'scalesProperties.backgroundColor':                 dark?'#000':'#F9F9F9',
      },

      /* بدون volume افتراضي */
      studies_overrides:{},

      disabled_features:[
        'header_symbol_search','symbol_search_hot_key',
        'header_compare','symbol_info',
        'border_around_the_chart','display_market_status','go_to_date',
        /* ✅ حذف volume الافتراضي */
        'create_volume_indicator_by_default','volume_force_overlay',
      ],

      enabled_features:[
        /* أدوات الرسم والمؤشرات */
        'study_templates',
        'side_toolbar_in_fullscreen_mode',
        'header_in_fullscreen_mode',
        /* تفاعل */
        'horz_touch_drag_scroll','vert_touch_drag_scroll','pinch_scale',
        'axis_pressed_mouse_move_scale','axis_double_clicked_reset_scale',
        'shift_visible_range_on_new_bar','pre_post_market_sessions',
        /* UI */
        'items_favoriting','show_hide_button_in_legend','hide_last_na_study_output',
        'adaptive_logo','move_logo_to_main_pane','end_of_period_timescale_marks',
        /* ✅ حفظ محلي — TV يستعيد timezone وكل إعدادات المستخدم */
        'use_localstorage_for_settings','save_chart_properties_to_local_storage',
        'chart_property_page_style','chart_property_page_scales',
        'chart_property_page_background','chart_property_page_timezone_sessions',
        'chart_property_page_trading',
        /* mobile */
        'force_touch_drag','iframe_loading_compatibility_mode',
      ],

      save_load_adapter:_buildSLA(sym),

      loading_screen:{
        backgroundColor:dark?'#000000':'#F9F9F9',
        foregroundColor:dark?'#ff8c42':'#c96442',
      },

      client_id:'suyula_hl',user_id:'trader',
      charts_storage_api_version:'1.1',
      fullscreen:false,debug:false,
    };

    if(saved) cfg.saved_data=saved;
    return new window.TradingView.widget(cfg);
  }

  /* ══════════════════════════════════════════
     _initChart — بدون white flash
     overlay يغطي chartScreen كله
     TV يُبنى خلفه → onChartReady → fade out
  ══════════════════════════════════════════ */
  function _initChart(sym,iv,saved){
    _ovrShow(sym);
    _linesReady=false; _linesPending=false;

    /* دمّر القديم */
    if(_widget){_clearLines();try{_widget.remove?.();}catch{}_widget=null;}
    const c=document.getElementById('_tvC');
    if(c) c.innerHTML='';

    _widget=_mkWidget(sym,iv,saved);
    if(!_widget){_ovrHide();return;}

    _widget.onChartReady(()=>{
      _linesReady=true;
      /* 200ms تأكيد من أن canvas مرسوم */
      setTimeout(_ovrHide,200);

      /* خطوط */
      _execLines();
      if(_linesPending){_linesPending=false;_execLines();}

      /* تتبّع interval من TV */
      try{
        _widget.chart().onIntervalChanged().subscribe(null,newIv=>{
          _interval=newIv;
          _lsSet('iv_'+_sym,newIv);
          _scheduleAutoSave();
          setTimeout(_execLines,300);
        });
      }catch{}

      /* auto-save */
      try{_widget.subscribe('onAutoSaveNeeded',_scheduleAutoSave);}catch{}
      setTimeout(_doAutoSave,5000);
    });
  }

  /* ══════════ Asset Nav ══════════ */
  function _buildNav(){
    document.getElementById('_tvNav')?.remove();
    const nav=document.createElement('div'); nav.id='_tvNav';
    nav.innerHTML=NAV_ASSETS.map(a=>
      `<button class="tvn-btn${a.sym===_sym?' on':''}" data-sym="${a.sym}">
         <span class="tvn-icon">${a.icon}</span>
         <span class="tvn-label">${a.ar}</span>
       </button>`
    ).join('');
    const scr=document.getElementById('chartScreen');
    const trd=document.getElementById('_tvTrade');
    const tvC=document.getElementById('_tvC');
    if(scr&&trd) scr.insertBefore(nav,trd);
    else if(scr&&tvC) scr.insertBefore(nav,tvC);
    nav.querySelectorAll('.tvn-btn').forEach(b=>b.onclick=()=>{
      const s=b.dataset.sym; if(!s||s===_sym) return;
      ChartModule.switchAssetChart(s);
      if(typeof switchAsset==='function') switchAsset(s);
    });
  }
  function _setNavOn(sym){
    document.querySelectorAll('.tvn-btn').forEach(b=>b.classList.toggle('on',b.dataset.sym===sym));
  }

  /* ══════════ Trade Bar ══════════ */
  function _buildTrade(){
    document.getElementById('_tvTrade')?.remove();
    const a=_ai(_sym), defQ=_lsGet('qty_'+_sym)||a.presets?.[0]||1;
    const bar=document.createElement('div'); bar.id='_tvTrade';
    bar.innerHTML=`
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
    const scr=document.getElementById('chartScreen');
    const tvC=document.getElementById('_tvC');
    if(scr&&tvC) scr.insertBefore(bar,tvC);
    document.getElementById('_tvQty').addEventListener('change',function(){
      const v=parseFloat(this.value); if(v>0) _lsSet('qty_'+_sym,v);
    });
    document.getElementById('_tvBuy').onclick=()=>_showCf(true);
    document.getElementById('_tvSell').onclick=()=>_showCf(false);
    const p=_curPx(); if(p) _setPrice(_sym,p);
  }

  /* ══════════ Confirm Sheet ══════════ */
  function _showCf(isBuy){
    if(typeof State==='undefined'||!State.wallet)
      return typeof toast!=='undefined'&&toast('سجّل الدخول أولاً','err');
    const qty=parseFloat(document.getElementById('_tvQty')?.value||0);
    if(!qty||qty<=0) return typeof toast!=='undefined'&&toast('أدخل الكمية','err');
    const a=_ai(_sym),isGr=_isGr(_sym),mid=_curPx();
    if(!mid) return typeof toast!=='undefined'&&toast('لا يوجد سعر','err');
    const midOz=_toOz(_sym,mid),qtyOz=isGr?qty/TROY:qty;
    const usd=(midOz*qtyOz).toFixed(2),mgn=(midOz*qtyOz/a.lev).toFixed(2);
    const mm=0.5/a.lev;
    const liqOz=isBuy?midOz*(1-1/a.lev+mm):midOz*(1+1/a.lev-mm);
    const liqD=_toDisp(_sym,liqOz).toFixed(a.pxDp);
    _hideCf();
    const scr=document.getElementById('chartScreen'); if(!scr) return;
    const ov=document.createElement('div'); ov.id='_tvcfOv'; ov.className='tvcf-ov';
    ov.innerHTML=`
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
    scr.appendChild(ov);
    ov.onclick=e=>{if(e.target===ov)_hideCf();};
    document.getElementById('_tvcfC').onclick=_hideCf;
    document.getElementById('_tvcfX').onclick=()=>
      typeof requirePin!=='undefined'?requirePin(()=>_execTrade(isBuy,qty)):_execTrade(isBuy,qty);
  }
  function _hideCf(){document.getElementById('_tvcfOv')?.remove();}

  async function _execTrade(isBuy,qty){
    if(!State?.wallet) return;
    const btn=document.getElementById('_tvcfX');
    if(btn){btn.disabled=true;btn.innerHTML='<span class="tvsp"></span>';}
    const isGr=_isGr(_sym);
    const aApi=isGr?(typeof ASSETS!=='undefined'&&ASSETS['GOLD'])||_ai('GOLD'):_ai(_sym);
    const mid=_curPx(),midOz=_toOz(_sym,mid);
    if(!midOz){_hideCf();return;}
    const qtyOz=isGr?qty/TROY:qty;
    try{
      try{await hlExchange({type:'updateLeverage',asset:aApi.idx,isCross:aApi.cross,leverage:aApi.lev});}catch{}
      await hlExchange({type:'order',orders:[{a:aApi.idx,b:isBuy,
        p:wirePx(midOz*(isBuy?1.02:0.98),aApi.szDp),
        s:wireSz(qtyOz,aApi.szDp),r:false,t:{limit:{tif:'Ioc'}}}],grouping:'na'});
      _hideCf();
      const disp=isGr?qty.toFixed(2)+' غرام':qty.toFixed(aApi.szDp)+' '+(aApi.unit||'');
      if(typeof toast!=='undefined') toast(`✅ ${aApi.icon} ${isBuy?'شراء':'بيع'} ${disp}`,'ok',4000);
      if(typeof pollAccount!=='undefined') setTimeout(pollAccount,2000);
    }catch(e){
      if(typeof toast!=='undefined')
        toast(typeof tradeErr!=='undefined'?tradeErr(e.message):'❌ '+e.message.slice(0,100),'err',5000);
      if(btn){btn.disabled=false;btn.innerHTML=isBuy?'✅ تأكيد الشراء':'✅ تأكيد البيع';}
    }
  }

  /* ══════════ DOM ══════════ */
  function _ensureScreen(){
    const scr=document.getElementById('chartScreen');
    if(!scr||document.getElementById('_tvHdr')) return;

    document.addEventListener('fullscreenchange',()=>{
      const btn=document.getElementById('_tvFsBtn');
      if(btn) btn.title=document.fullscreenElement?'خروج ملء الشاشة':'ملء الشاشة';
    });

    const hdr=document.createElement('nav'); hdr.id='_tvHdr';
    hdr.innerHTML=`
      <div class="tvh-l">
        <button class="tvh-back" id="_tvBack">← رجوع</button>
        <div class="tvh-info">
          <span id="_tvIcon"  class="tvh-icon">🛢</span>
          <span id="_tvName"  class="tvh-name">—</span>
          <span id="_tvPx"    class="tvh-price" data-p="0">—</span>
          <span id="_tvPnl"   class="tvh-pnl"></span>
        </div>
      </div>
      <div class="tvh-r">
        <button class="tvh-fs" id="_tvFsBtn" title="ملء الشاشة">⛶</button>
        <div class="tvh-dot wait" id="_tvDot"></div>
      </div>`;
    scr.prepend(hdr);

    const tvC=document.createElement('div'); tvC.id='_tvC';
    scr.appendChild(tvC);

    document.getElementById('_tvBack').onclick=()=>ChartModule.close();
    document.getElementById('_tvFsBtn').onclick=()=>{
      const el=document.getElementById('chartScreen'); if(!el) return;
      document.fullscreenElement
        ?document.exitFullscreen?.()
        :el.requestFullscreen?.().catch(()=>{});
    };
  }

  function _setHdr(sym){
    const a=_ai(sym);
    const ic=document.getElementById('_tvIcon');
    const nm=document.getElementById('_tvName');
    if(ic) ic.textContent=a.icon;
    if(nm) nm.textContent=a.name;
    const p=_prices[sym]||(typeof State!=='undefined'?State.prices?.[sym]?.mid:0)||0;
    const el=document.getElementById('_tvPx');
    if(el){
      if(p){el.textContent='$'+p.toFixed(a.pxDp);el.dataset.p=p;el.className='tvh-price';_updBtnPx(sym,p);}
      else{el.textContent='—';el.dataset.p='0';el.className='tvh-price';}
    }
    _updatePnlBadge();
  }

  /* ══════════ Public API ══════════ */
  function open(sym){
    _sym=sym||(typeof State!=='undefined'?State.asset:'CL')||'CL';
    _visible=true;
    const saved=_loadLayout();
    const useSaved=saved&&saved.sym===_sym&&saved.content;
    const savedIv=_lsGet('iv_'+_sym);
    _interval=useSaved&&saved.interval?saved.interval:(savedIv&&IV_HL[savedIv]?savedIv:'60');

    _ensureScreen();
    document.getElementById('chartScreen')?.classList.remove('hidden');
    _setHdr(_sym); _buildTrade(); _buildNav();

    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      _initChart(_sym,_interval,useSaved?saved.content:null);
    }));

    _dot('wait'); _bboConn(_sym);

    clearInterval(_clockTimer);
    _clockTimer=setInterval(()=>{
      if(!_visible||typeof State==='undefined') return;
      const p=State.prices?.[_sym]?.mid;
      if(p) _setPrice(_sym,p);
      /* PnL + lines كل 3 ثواني */
      if(Date.now()%3000<1100){_updatePnlBadge();_scheduleLines();}
    },1000);
  }

  function close(){
    _visible=false; _linesReady=false;
    clearInterval(_clockTimer); clearTimeout(_saveTimer);
    _doAutoSave(); _bboClose(); _hideCf(); _clearLines();
    if(document.fullscreenElement) document.exitFullscreen?.();
    document.getElementById('chartScreen')?.classList.add('hidden');
    const ov=document.getElementById('_tvOvr');
    if(ov&&!ov.classList.contains('gone')) ov.classList.add('gone');
  }

  function switchInterval(iv){
    if(!iv||iv===_interval) return;
    _interval=iv; _lsSet('iv_'+_sym,iv);
    try{_widget?.chart?.().setResolution?.(iv);}
    catch{
      requestAnimationFrame(()=>{
        _clearLines();
        if(_widget){try{_widget.remove?.();}catch{}_widget=null;}
        _initChart(_sym,iv,null);
      });
    }
  }

  function switchAssetChart(sym){
    if(!_visible||sym===_sym) return;
    _doAutoSave();
    _sym=sym;
    _setHdr(sym); _setNavOn(sym); _buildTrade(); _bboConn(sym);
    const saved=_loadLayout();
    const useSaved=saved&&saved.sym===sym&&saved.content;
    const savedIv=_lsGet('iv_'+sym);
    _interval=useSaved&&saved.interval?saved.interval:(savedIv&&IV_HL[savedIv]?savedIv:'60');
    requestAnimationFrame(()=>{_initChart(sym,_interval,useSaved?saved.content:null);});
  }

  function refreshLines(){if(_visible)_scheduleLines();}

  return {open,close,switchInterval,switchAssetChart,refreshLines};
})();
