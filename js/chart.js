/* ═══════════════════════════════════════════════════════════════
   HL Trade · chart.js — TradingView Advanced Charts
   ✅ نفس منطق fetchCandles الذي يعمل 100% → getBars
   ✅ locale AR · UTC+3 · countdown · cache · position lines
   ✅ زر fullscreen · أزرار بيع/شراء أصغر
═══════════════════════════════════════════════════════════════ */

const ChartModule = (function () {

  const HL_API = 'https://api.hyperliquid.xyz';
  const HL_WS  = 'wss://api.hyperliquid.xyz/ws';
  const TL     = 31.1035;
  const UTC3   = 3 * 3600; // seconds

  /* نطاقات الجلب — نفس RANGES من الكود العامل */
  const RANGES = {
    '1m':  90    * 3600000,
    '5m':  360   * 3600000,
    '15m': 900   * 3600000,
    '1h':  3600  * 3600000,
    '4h':  14400 * 3600000,
    '1d':  43200 * 3600000,
  };

  /* Hyperliquid interval ↔ TradingView resolution */
  const IV_TO_TV = { '1m':'1','3m':'3','5m':'5','15m':'15','30m':'30','1h':'60','2h':'120','4h':'240','1d':'D' };
  const TV_TO_IV = { '1':'1m','3':'3m','5':'5m','15':'15m','30':'30m','60':'1h','120':'2h','240':'4h','D':'1d','1D':'1d' };

  /* ════ state ════ */
  let _widget     = null;   // TradingView widget instance
  let _chartReady = false;  // onChartReady fired
  let _visible    = false;
  let _sym        = 'CL';
  let _interval   = '1h';   // Hyperliquid format
  let _lastClose  = 0;
  let _candles    = [];     // for day-stats (maintained locally)
  let _subs       = {};     // TradingView subscriber callbacks
  let _chartWs    = null;   // WebSocket for candle channel
  let _wsTimer    = null;
  let _entryLines = [];
  let _tpLine     = null;
  let _slLine     = null;
  let _liqLine    = null;
  let _ro         = null;   // ResizeObserver
  let _layoutTmr  = null;
  let _readyTmr   = null;
  let _clockTimer = null;
  let _dayTimer   = null;
  let _gestInit   = false;

  /* ════ CSS ════ */
  (function injectCSS() {
    if (document.getElementById('_chartCSS')) return;
    const s = document.createElement('style'); s.id = '_chartCSS';
    s.textContent = `
.chart-screen{position:fixed;inset:0;z-index:50;display:flex;flex-direction:column;background:var(--bg-app);}
.chart-screen.hidden{display:none!important;}
.c-nav{display:flex;flex-direction:column;padding:6px 10px;background:var(--bg-card);border-bottom:1px solid var(--border);flex-shrink:0;gap:6px;direction:rtl;}
.c-nav-row{display:flex;align-items:center;justify-content:space-between;width:100%;}
.c-nav-group{display:flex;align-items:center;gap:6px;}
.c-back{color:var(--ac);font-size:12px;font-weight:800;padding:5px 12px;border-radius:10px;border:1.5px solid var(--ac-dim);background:var(--ac-dim);font-family:'Cairo',sans-serif;white-space:nowrap;}
.c-back:active{opacity:.7;}
.c-asset-info{display:flex;align-items:center;gap:5px;margin-right:8px;}
.c-asset-icon{font-size:15px;line-height:1;}
.c-asset-name{font-size:13px;font-weight:900;color:var(--text-primary);}
.c-cur-price{font-family:'IBM Plex Mono',monospace;font-size:14px;font-weight:800;color:var(--text-primary);}
.c-reset-btn{font-size:16px;line-height:1;background:var(--bg-elev);border:1px solid var(--border);border-radius:8px;padding:4px 8px;color:var(--text-secondary);cursor:pointer;transition:color .15s,border-color .15s;}
.c-reset-btn:hover{color:var(--ac);border-color:var(--ac);}
.c-reset-btn:active{transform:scale(.88);}
.c-fs-btn{background:var(--bg-elev);border:1px solid var(--border);border-radius:8px;padding:4px 8px;font-size:14px;color:var(--text-secondary);cursor:pointer;}
.c-fs-btn:active{opacity:.7;}
.c-ws{font-size:11px;flex-shrink:0;}
.c-intervals{display:flex;gap:4px;flex-shrink:0;}
.iv-btn{flex:1;min-width:0;padding:5px 3px;border-radius:999px;border:1.5px solid var(--border);background:var(--bg-elev);color:var(--text-secondary);font-size:11px;font-weight:800;font-family:'IBM Plex Mono',monospace;text-align:center;cursor:pointer;}
.iv-btn:active{transform:scale(.88);}
.iv-btn.active{border-color:var(--ac);background:var(--ac-dim);color:var(--ac);}

/* ✅ Trade Bar — أزرار أصغر */
.c-trade-bar{display:flex;align-items:center;gap:6px;padding:5px 8px;background:var(--bg-card);border-bottom:1px solid var(--border);flex-shrink:0;direction:rtl;}
.cbt-btn{flex:1;min-height:40px;padding:4px 5px;border-radius:12px;border:none;font-family:'Cairo',sans-serif;font-size:13px;font-weight:900;cursor:pointer;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;}
.cbt-btn:active{transform:scale(.93);}
.cbt-buy{background:linear-gradient(150deg,#2da44e,#1a7f37);}
.cbt-sell{background:linear-gradient(150deg,#e5534b,#a0281e);}
.cbt-dir{font-size:13px;line-height:1;}
.cbt-px{font-family:'IBM Plex Mono',monospace;font-size:9px;opacity:.75;}
.cbt-mid{display:flex;flex-direction:column;align-items:center;gap:2px;flex:1.1;}
.cbt-qty-lbl{font-size:9px;color:var(--text-muted);font-weight:700;letter-spacing:1px;}
.cbt-qty-row{display:flex;align-items:center;gap:4px;}
.cbt-qty-in{width:72px;font-family:'IBM Plex Mono',monospace;font-size:16px;font-weight:700;text-align:center;direction:ltr;background:var(--bg-input);border:2px solid var(--ac-dim);border-radius:10px;padding:4px 4px;color:var(--text-primary);outline:none;}
.cbt-qty-in:focus{border-color:var(--ac);}
.cbt-qty-unit{font-size:9px;color:var(--text-secondary);font-weight:700;white-space:nowrap;}
.cbt-presets{display:flex;gap:3px;}
.cbt-preset{font-family:'IBM Plex Mono',monospace;font-size:9px;font-weight:700;padding:2px 5px;border-radius:999px;border:1.5px solid var(--border);background:var(--bg-elev);color:var(--text-muted);cursor:pointer;}
.cbt-preset.active{border-color:var(--ac);color:var(--ac);background:var(--ac-dim);}

/* Chart wrap */
.c-wrap{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;}

/* ✅ TradingView container */
.c-tv-wrap{flex:1;min-height:0;position:relative;overflow:hidden;background:#131722;}
#_tvC{position:absolute;inset:0;}
#_tvC iframe{border:none!important;display:block;}

/* Countdown overlay */
.c-cd-overlay{position:absolute;bottom:52px;left:4px;background:rgba(0,0,0,.7);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);border-radius:6px;padding:3px 7px;font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:800;color:var(--ac);z-index:10;pointer-events:none;border:1px solid rgba(224,114,72,.35);white-space:nowrap;direction:ltr;}

/* Day Stat */
.c-day-stat{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:3px 10px;background:var(--bg-card);border-top:1px solid var(--border);flex-shrink:0;font-family:'IBM Plex Mono',monospace;min-height:22px;}

/* Confirmation */
.cf-ov{position:absolute;inset:0;z-index:95;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.65);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);direction:rtl;}
.cf-card{background:var(--bg-card);border-top:2px solid var(--border-strong);border-radius:22px 22px 0 0;width:100%;max-width:480px;padding:14px 14px 20px;animation:cfSu .22s cubic-bezier(.4,0,.2,1);}
@keyframes cfSu{from{transform:translateY(100%)}to{transform:none}}
.cf-hdl{width:32px;height:4px;background:var(--border-strong);border-radius:999px;margin:0 auto 12px;}
.cf-title{font-size:16px;font-weight:900;margin-bottom:3px;}
.cf-sub{font-size:11px;color:var(--text-secondary);margin-bottom:10px;}
.cf-rows{background:var(--bg-input);border-radius:12px;padding:8px 10px;display:flex;flex-direction:column;gap:4px;margin-bottom:10px;}
.cf-row{display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--border);}
.cf-row:last-child{border:none;}
.cf-key{font-size:11px;color:var(--text-secondary);font-weight:700;}
.cf-val{font-family:'IBM Plex Mono',monospace;font-size:13px;font-weight:800;}
.cf-val.g{color:#2da44e;}.cf-val.r{color:#e5534b;}.cf-val.w{color:var(--warn);}
.cf-btns{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.cf-cancel{padding:11px;border-radius:999px;border:1.5px solid var(--border-strong);background:var(--bg-elev);color:var(--text-secondary);font-size:13px;font-weight:700;cursor:pointer;font-family:'Cairo',sans-serif;}
.cf-exec{padding:11px;border-radius:999px;border:none;color:#fff;font-size:13px;font-weight:900;cursor:pointer;font-family:'Cairo',sans-serif;display:flex;align-items:center;justify-content:center;gap:5px;}
.cf-exec.g{background:linear-gradient(135deg,#2da44e,#1a7f37);}
.cf-exec.r{background:linear-gradient(135deg,#e5534b,#a0281e);}
.cf-exec:active{filter:brightness(.88);}
.cf-exec:disabled{opacity:.5;pointer-events:none;}
.cf-spin{width:14px;height:14px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:cfR .7s linear infinite;}
@keyframes cfR{to{transform:rotate(360deg)}}
`;
    document.head.appendChild(s);
  })();

  /* ════ مساعدات ════ */
  const coin = s => (typeof ASSETS !== 'undefined' && ASSETS[s]?.coin) || `xyz:${s}`;
  const ai   = s => (typeof ASSETS !== 'undefined' && ASSETS[s]) ||
    { pxDp:2, szDp:2, name:s, icon:'📊', unit:'', lev:10, presets:[1], idx:0, cross:true };
  const setStatus = t => { const e = document.getElementById('_cWs'); if (e) e.textContent = t; };
  const isDark    = () => document.documentElement.getAttribute('data-theme') !== 'light';
  const fp = (n, s) => (+n).toFixed(ai(s || _sym).pxDp);
  const fs = (n, s) => (+n).toFixed(ai(s || _sym).szDp);

  function setPrice(p) {
    _lastClose = +p;
    const e = document.getElementById('_cPrice');
    if (e && p) e.textContent = '$' + (+p).toFixed(ai(_sym).pxDp);
    updateBtnPx();
  }

  /* ════ UTC+3 ════ */
  const _MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const _DN = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  function _d3(tick) { return new Date((tick + UTC3) * 1000); }
  function fmtFull(tick) {
    const d = _d3(tick), h = d.getUTCHours(), m = d.getUTCMinutes();
    const ap = h >= 12 ? 'PM' : 'AM';
    return `${_DN[d.getUTCDay()]} ${d.getUTCDate()} ${_MN[d.getUTCMonth()]} ${d.getUTCFullYear()} · ${String(h%12||12).padStart(2,'0')}:${String(m).padStart(2,'0')} ${ap} +3`;
  }

  /* ════ ساعة UTC+3 + عد تنازلي ════ */
  function getIvMs(iv) {
    const n = parseInt(iv);
    if (iv.endsWith('m')) return n * 60000;
    if (iv.endsWith('h')) return n * 3600000;
    if (iv.endsWith('d')) return n * 86400000;
    return 60000;
  }

  function startClock() {
    stopClock();
    const tick = () => {
      const now = new Date(Date.now() + 3 * 3600000);
      const t = document.getElementById('_cClockT');
      if (t) t.textContent = now.toLocaleTimeString('en-US',
        { hour12:true, hour:'2-digit', minute:'2-digit', second:'2-digit', timeZone:'UTC' });
      const ivMs = getIvMs(_interval);
      const diff = Math.ceil(Date.now() / ivMs) * ivMs - Date.now();
      const hh = Math.floor(diff / 3600000);
      const mm = Math.floor((diff % 3600000) / 60000);
      const ss = Math.floor((diff % 60000) / 1000);
      const cdStr = (hh > 0 ? hh + ':' : '') + String(mm).padStart(2,'0') + ':' + String(ss).padStart(2,'0');
      const cdOv = document.getElementById('_cCdOverlay');
      if (cdOv) cdOv.textContent = '⏱ ' + cdStr;
    };
    tick();
    _clockTimer = setInterval(tick, 1000);
    _dayTimer   = setInterval(drawDayStats, 5000);
  }

  function stopClock() {
    clearInterval(_clockTimer); _clockTimer = null;
    clearInterval(_dayTimer);   _dayTimer   = null;
  }

  /* ════ Fullscreen / gestures ════ */
  function toggleFullscreen() {
    const el = document.getElementById('chartScreen');
    if (!document.fullscreenElement) el?.requestFullscreen?.() || el?.webkitRequestFullscreen?.();
    else document.exitFullscreen?.() || document.webkitExitFullscreen?.();
  }

  function blockGestures(el) {
    if (_gestInit) return; _gestInit = true;
    ['gesturestart','gesturechange','gestureend'].forEach(ev =>
      el.addEventListener(ev, e => e.preventDefault(), { passive:false })
    );
    el.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive:false });
  }

  /* ════ Reset view ════ */
  function resetView() {
    if (!_widget || !_chartReady) return;
    try { _widget.activeChart().scrollToRealTime(); } catch {}
    if (typeof toast !== 'undefined') toast('↺ عرض آخر الشموع', 'info', 900);
  }

  /* ════ Trade Bar ════ */
  function buildTradeBar(wrap) {
    document.getElementById('_cTrade')?.remove();
    const a  = ai(_sym);
    const ps = (a.presets || []).slice(0, 3);
    const bar = document.createElement('div');
    bar.id = '_cTrade'; bar.className = 'c-trade-bar';
    bar.innerHTML = `
      <button class="cbt-btn cbt-sell" id="_cSell">
        <span class="cbt-dir">▼ بيع</span>
        <span class="cbt-px" id="_cSellPx">—</span>
      </button>
      <div class="cbt-mid">
        <span class="cbt-qty-lbl">الكمية</span>
        <div class="cbt-qty-row">
          <input class="cbt-qty-in" id="_cQty" type="number"
            value="${a.presets?.[0]||1}" min="0" step="any" inputmode="decimal">
          <span class="cbt-qty-unit">${a.unit}</span>
        </div>
        <div class="cbt-presets">
          ${ps.map((v,i)=>`<button class="cbt-preset${i===0?' active':''}" data-v="${v}">${v}</button>`).join('')}
        </div>
      </div>
      <button class="cbt-btn cbt-buy" id="_cBuy">
        <span class="cbt-dir">▲ شراء</span>
        <span class="cbt-px" id="_cBuyPx">—</span>
      </button>`;
    /* insert before .c-tv-wrap */
    const tvWrap = wrap.querySelector('.c-tv-wrap');
    if (tvWrap) wrap.insertBefore(bar, tvWrap);
    else wrap.insertAdjacentElement('afterbegin', bar);
    bar.querySelectorAll('.cbt-preset').forEach(b => {
      b.onclick = () => {
        bar.querySelectorAll('.cbt-preset').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        document.getElementById('_cQty').value = b.dataset.v;
      };
    });
    document.getElementById('_cQty').oninput = () =>
      bar.querySelectorAll('.cbt-preset').forEach(x => x.classList.remove('active'));
    document.getElementById('_cBuy').onclick  = () => showCf(true);
    document.getElementById('_cSell').onclick = () => showCf(false);
    updateBtnPx();
  }

  function updateBtnPx() {
    if (!_lastClose) return;
    const a = ai(_sym);
    const bp = document.getElementById('_cBuyPx');
    const sp = document.getElementById('_cSellPx');
    if (bp) bp.textContent = '$' + (_lastClose * 1.0005).toFixed(a.pxDp);
    if (sp) sp.textContent = '$' + (_lastClose * 0.9995).toFixed(a.pxDp);
  }

  /* ════ Confirmation ════ */
  function showCf(isBuy) {
    if (typeof State === 'undefined' || !State.wallet) return toast?.('سجّل الدخول أولاً', 'err');
    const qty = parseFloat(document.getElementById('_cQty')?.value || 0);
    if (!qty || qty <= 0) return toast?.('أدخل الكمية', 'err');
    const a    = ai(_sym), isGr = _sym === 'XAU';
    const mid  = _lastClose || State.prices?.[_sym]?.mid || 0;
    if (!mid) return toast?.('لا يوجد سعر', 'err');
    const midOz = isGr ? mid * TL : mid;
    const qtyOz = isGr ? qty / TL : qty;
    const usd   = (midOz * qtyOz).toFixed(2);
    const mgn   = (midOz * qtyOz / a.lev).toFixed(2);
    const liqOz = isBuy ? midOz*(1-1/a.lev) : midOz*(1+1/a.lev);
    const liqD  = isGr ? (liqOz/TL).toFixed(a.pxDp) : liqOz.toFixed(a.pxDp);
    hideCf();
    const wrap = document.getElementById('_cWrap'); if (!wrap) return;
    const ov   = document.createElement('div'); ov.id = '_cfOv'; ov.className = 'cf-ov';
    ov.innerHTML = `<div class="cf-card">
      <div class="cf-hdl"></div>
      <div class="cf-title" style="color:${isBuy?'#2da44e':'#e5534b'}">${a.icon} ${isBuy?'شراء ▲':'بيع ▼'} — ${a.name}</div>
      <div class="cf-sub">رافعة ${a.lev}x · تأكيد قبل التنفيذ</div>
      <div class="cf-rows">
        <div class="cf-row"><span class="cf-key">الكمية</span><span class="cf-val">${fs(qty)} ${a.unit}</span></div>
        <div class="cf-row"><span class="cf-key">السعر</span><span class="cf-val">${fp(mid)} $</span></div>
        <div class="cf-row"><span class="cf-key">القيمة</span><span class="cf-val">≈ $${usd}</span></div>
        <div class="cf-row"><span class="cf-key">الهامش</span><span class="cf-val w">≈ $${mgn}</span></div>
        <div class="cf-row"><span class="cf-key">التصفية</span><span class="cf-val ${isBuy?'r':'g'}">≈ ${liqD} $</span></div>
      </div>
      <div class="cf-btns">
        <button class="cf-cancel" id="_cfC">إلغاء ✕</button>
        <button class="cf-exec ${isBuy?'g':'r'}" id="_cfX">${isBuy?'✅ تأكيد الشراء':'✅ تأكيد البيع'}</button>
      </div>
    </div>`;
    wrap.appendChild(ov);
    ov.onclick = e => { if (e.target === ov) hideCf(); };
    document.getElementById('_cfC').onclick = hideCf;
    document.getElementById('_cfX').onclick = () =>
      typeof requirePin !== 'undefined' ? requirePin(() => _execTrade(isBuy, qty)) : _execTrade(isBuy, qty);
  }

  function hideCf() { document.getElementById('_cfOv')?.remove(); }

  async function _execTrade(isBuy, qty) {
    if (!State?.wallet) return;
    const btn = document.getElementById('_cfX');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="cf-spin"></span>'; }
    const isGr = _sym === 'XAU';
    const a    = isGr ? (ASSETS?.['GOLD'] || ai(_sym)) : ai(_sym);
    const mid  = _lastClose || (isGr ? State.prices?.['XAU']?.mid : State.prices?.[_sym]?.mid) || 0;
    const midOz = isGr ? mid * TL : mid;
    if (!midOz) { hideCf(); return; }
    const qtyOz = isGr ? qty / TL : qty;
    try {
      try { await hlExchange({ type:'updateLeverage', asset:a.idx, isCross:a.cross, leverage:a.lev }); } catch {}
      await hlExchange({
        type:'order',
        orders:[{ a:a.idx, b:isBuy,
          p:wirePx(midOz*(isBuy?1.02:0.98), a.szDp),
          s:wireSz(qtyOz, a.szDp), r:false, t:{ limit:{ tif:'Ioc' } }
        }],
        grouping:'na'
      });
      hideCf();
      const disp = isGr ? qty.toFixed(2)+' غرام' : fs(qty)+' '+(a.unit||'');
      toast?.(`✅ ${a.icon} ${isBuy?'شراء':'بيع'} ${disp}`, 'ok', 4000);
      if (typeof pollAccount !== 'undefined') setTimeout(pollAccount, 2000);
    } catch(e) {
      toast?.((typeof tradeErr !== 'undefined' ? tradeErr(e.message) : '❌ '+e.message.slice(0,100)), 'err', 5000);
      if (btn) { btn.disabled=false; btn.innerHTML=isBuy?'✅ تأكيد الشراء':'✅ تأكيد البيع'; }
    }
  }

  /* ════ إحصائيات اليوم — 00:00 UTC+3 ════ */
  function getSessionStartSec() {
    const nowUTC3ms  = Date.now() + UTC3 * 1000;
    const d          = new Date(nowUTC3ms);
    const midnightUTC = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    return Math.floor(midnightUTC / 1000) - UTC3;
  }

  function computeDayStats() {
    const start = getSessionStartSec();
    const sc    = _candles.filter(c => c.time >= start);
    if (!sc.length) return null;
    const open = sc[0].open;
    const high = Math.max(...sc.map(c => c.high));
    const low  = Math.min(...sc.map(c => c.low));
    const cur  = _lastClose || sc[sc.length-1].close;
    const pct  = (cur - open) / open * 100;
    return { open, high, low, cur, pct };
  }

  function drawDayStats() {
    const st = computeDayStats();
    const el = document.getElementById('_cDayStat');
    if (!el) return;
    if (!st) { el.innerHTML = ''; return; }
    const dp = ai(_sym).pxDp, up = st.pct >= 0;
    el.innerHTML =
      `<span style="color:var(--text-muted);font-size:10px;font-weight:700;">00:00+3</span>` +
      `<span style="color:#26a69a;font-size:11px;font-weight:800;">▲ ${st.high.toFixed(dp)}</span>` +
      `<span style="color:#ef5350;font-size:11px;font-weight:800;">▼ ${st.low.toFixed(dp)}</span>` +
      `<span style="color:${up?'#26a69a':'#ef5350'};font-size:13px;font-weight:900;">${up?'+':''}${st.pct.toFixed(2)}%</span>`;
  }

  /* ════ localStorage Cache ════ */
  const _LC = {
    _ttl: { '1m':300e3,'5m':300e3,'15m':900e3,'1h':3600e3,'4h':7200e3,'1d':21600e3 },
    key(sym, iv) { return `_hlc_${sym}_${iv}`; },
    get(sym, iv) {
      try {
        const d = JSON.parse(localStorage.getItem(this.key(sym,iv))||'null');
        if (!d?.b?.length || Date.now()-d.t > (this._ttl[iv]||3600e3)) return null;
        return d.b;
      } catch { return null; }
    },
    set(sym, iv, bars) {
      try {
        localStorage.setItem(this.key(sym,iv), JSON.stringify({ b:bars.slice(-1000), t:Date.now() }));
      } catch {}
    }
  };

  /* ════════════════════════════════════════════════════════════
     DATAFEED — جميع الـ 6 methods المطلوبة من TradingView

     ✅ getBars: نفس منطق fetchCandles() الذي يعمل 100%
        → raw fetch() مباشرة، لا hlInfo()، لا throw على HTTP errors
        → RANGES للنطاق الزمني، نفس الفورمات
        → localStorage cache للتحميل التدريجي
  ════════════════════════════════════════════════════════════ */
  const Datafeed = {

    onReady(cb) {
      console.log('[Chart] datafeed.onReady');
      setTimeout(() => cb({
        supported_resolutions: ['1','3','5','15','30','60','120','240','D'],
        exchanges: [{ value:'HL', name:'Hyperliquid', desc:'Hyperliquid Perps' }],
        symbols_types: [{ name:'crypto', value:'crypto' }],
        supports_marks: false,
        supports_timescale_marks: false,
      }), 0);
    },

    searchSymbols(q, ex, t, cb) {
      if (typeof ASSETS === 'undefined') { cb([]); return; }
      const ql = (q||'').toLowerCase();
      cb(Object.keys(ASSETS).map(s => ({
        symbol:s, full_name:s, ticker:s,
        description: ASSETS[s].name||s, exchange:'Hyperliquid', type:'crypto',
      })).filter(x => x.symbol.toLowerCase().includes(ql)||x.description.toLowerCase().includes(ql)));
    },

    resolveSymbol(name, ok, err) {
      if (typeof ASSETS === 'undefined' || !ASSETS[name]) {
        (err||console.warn)('unknown_symbol:'+name); return;
      }
      const a = ai(name), dp = a.pxDp || 2;
      console.log('[Chart] resolveSymbol →', name, _coin_str(name));
      setTimeout(() => ok({
        name, ticker:name, description:a.name||name,
        type:'crypto', session:'24x7',
        exchange:'Hyperliquid', listed_exchange:'Hyperliquid',
        timezone:'Etc/UTC', format:'price',
        pricescale: Math.pow(10, dp), minmov: 1,
        has_intraday: true, has_daily: true, has_weekly_and_monthly: false,
        intraday_multipliers: ['1','3','5','15','30','60','120','240'],
        supported_resolutions: ['1','3','5','15','30','60','120','240','D'],
        volume_precision: 4, data_status: 'streaming',
      }), 0);
    },

    /* ──────────────────────────────────────────────────────
       getBars — ROOT FIX:
       يستخدم نفس fetch() من fetchCandles() الذي يعمل:
       • لا hlInfo() (كانت ترمي exception على 422/429)
       • لا throw إذا HTTP error — فقط يتحقق Array.isArray
       • RANGES لنطاق زمني كافٍ
       • localStorage cache → لا إعادة تحميل في كل فتح
    ────────────────────────────────────────────────────── */
    async getBars(si, res, pp, ok, err) {
      try {
        const iv   = TV_TO_IV[res] || '1h';
        const sym  = si.ticker;
        const isGr = sym === 'XAU';
        const now  = Date.now();
        const isFirst = pp && pp.firstDataRequest;

        /* تحقق من الـ cache للتحميل الأول */
        if (isFirst) {
          const cached = _LC.get(sym, iv);
          if (cached) {
            console.log('[Chart] cache hit', sym, iv, cached.length, 'bars');
            _candles = cached.slice();
            if (cached.length) { setPrice(cached[cached.length-1].close); setTimeout(drawDayStats, 100); }
            ok(cached, { noData: false }); return;
          }
        }

        /* حساب النطاق الزمني — نفس RANGES */
        let startMs, endMs;
        if (isFirst) {
          endMs   = now;
          startMs = now - (RANGES[iv] || RANGES['1h']);
        } else {
          endMs   = (pp && pp.to   > 0) ? pp.to   * 1000 : now;
          startMs = (pp && pp.from > 0) ? pp.from * 1000 : endMs - (RANGES[iv] || RANGES['1h']);
        }

        console.log('[Chart] getBars', sym, iv,
          new Date(startMs).toISOString().slice(0,16), '..', new Date(endMs).toISOString().slice(0,16));

        /* ✅ نفس fetch من fetchCandles() — لا throw على HTTP errors */
        const r   = await fetch(HL_API + '/info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'candleSnapshot',
            req:  { coin: coin(sym), interval: iv, startTime: startMs, endTime: endMs }
          })
        });
        const raw = await r.json();

        if (!Array.isArray(raw) || !raw.length) {
          console.log('[Chart] getBars noData', sym, iv, 'coin='+coin(sym));
          ok([], { noData: true }); return;
        }

        const bars = raw.map(c => ({
          time:   Math.floor(c.t / 1000),
          open:   isGr ? +c.o/TL : +c.o,
          high:   isGr ? +c.h/TL : +c.h,
          low:    isGr ? +c.l/TL : +c.l,
          close:  isGr ? +c.c/TL : +c.c,
          volume: +c.v || 0,
        })).sort((a,b) => a.time - b.time);

        console.log('[Chart] ✅ getBars', sym, iv, '→', bars.length, 'bars',
          '(' + new Date(bars[0].time*1000).toISOString().slice(0,10) + ' .. ' +
                new Date(bars[bars.length-1].time*1000).toISOString().slice(0,10) + ')');

        /* تحديث _candles وحفظ الـ cache */
        if (isFirst) {
          _candles = bars.slice();
          if (bars.length) { setPrice(bars[bars.length-1].close); setTimeout(drawDayStats, 100); }
          _LC.set(sym, iv, bars);
        } else {
          /* Pagination — دمج البيانات الأقدم */
          const existing = new Set(_candles.map(b => b.time));
          const older = bars.filter(b => !existing.has(b.time));
          if (older.length) _candles = [...older, ..._candles].sort((a,b) => a.time - b.time);
        }

        ok(bars, { noData: false });

      } catch(e) {
        console.error('[Chart] getBars ERROR:', si.ticker, res, e.message);
        err(e.message);
      }
    },

    subscribeBars(si, res, onTick, uid) {
      _subs[uid] = { sym: si.ticker, cb: onTick };
      const iv = TV_TO_IV[res] || '1h';
      _wsChartConn(coin(si.ticker), iv, si.ticker);
    },

    unsubscribeBars(uid) {
      delete _subs[uid];
      if (!Object.keys(_subs).length) _wsChartClose();
    },
  };

  /* helper — coin string for logging */
  function _coin_str(sym) { return coin(sym); }

  /* ════ WebSocket — candle channel ════ */
  let _wsActiveCoin = null;
  let _wsActiveIv   = null;

  function _wsChartConn(coinStr, iv, symStr) {
    /* إذا نفس الاشتراك → لا شيء */
    if (_chartWs && _chartWs.readyState <= 1 &&
        _wsActiveCoin === coinStr && _wsActiveIv === iv) return;
    _wsChartClose();
    _wsActiveCoin = coinStr; _wsActiveIv = iv;
    try {
      _chartWs = new WebSocket(HL_WS);
      _chartWs.onopen = () => {
        if (!_chartWs) return;
        console.log('[Chart] WS→', coinStr, iv);
        _chartWs.send(JSON.stringify({ method:'subscribe', subscription:{ type:'candle', coin:coinStr, interval:iv } }));
        setStatus('🟢');
      };
      _chartWs.onmessage = e => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.channel !== 'candle' || !msg.data) return;
          const c    = msg.data;
          const isGr = _sym === 'XAU';
          const bar  = {
            time:   Math.floor(c.t/1000),
            open:   isGr?+c.o/TL:+c.o,
            high:   isGr?+c.h/TL:+c.h,
            low:    isGr?+c.l/TL:+c.l,
            close:  isGr?+c.c/TL:+c.c,
            volume: +c.v||0,
          };
          /* تحديث _candles للإحصائيات */
          const last = _candles[_candles.length-1];
          if (last && last.time === bar.time) _candles[_candles.length-1] = bar;
          else if (!last || bar.time > last.time) _candles.push(bar);
          setPrice(bar.close);
          drawDayStats();
          /* إرسال للـ TradingView subscribers */
          Object.values(_subs).forEach(s => { try { s.cb(bar); } catch {} });
        } catch {}
      };
      _chartWs.onerror = () => setStatus('🔴');
      _chartWs.onclose = () => {
        setStatus('🔴');
        if (_visible && Object.keys(_subs).length)
          _wsTimer = setTimeout(() => _wsChartConn(coinStr, iv, symStr), 4000);
      };
    } catch(e) { console.warn('[Chart] WS:', e.message); }
  }

  function _wsChartClose() {
    clearTimeout(_wsTimer);
    if (_chartWs) { try { _chartWs.close(); } catch {} _chartWs = null; }
    _wsActiveCoin = null; _wsActiveIv = null;
  }

  /* ════ خطوط المراكز ════ */
  function clearLines() {
    _entryLines = []; _tpLine = null; _slLine = null; _liqLine = null;
    if (!_widget || !_chartReady) return;
    try {
      const ch = _widget.activeChart();
      _entryLines.forEach(id => { try { ch.removeEntity(id); } catch {} });
      if (_tpLine)  { try { ch.removeEntity(_tpLine);  } catch {} }
      if (_slLine)  { try { ch.removeEntity(_slLine);  } catch {} }
      if (_liqLine) { try { ch.removeEntity(_liqLine); } catch {} }
    } catch {}
    _entryLines = []; _tpLine = null; _slLine = null; _liqLine = null;
  }

  function drawLines() {
    if (!_widget || !_chartReady || typeof State === 'undefined') return;
    clearLines();
    try {
      const ch = _widget.activeChart();
      for (const p of (State.positions || [])) {
        const rawCoin = p.position.coin.includes(':') ? p.position.coin.split(':')[1] : p.position.coin;
        const posSym  = rawCoin === 'GOLD' ? 'XAU' : rawCoin;
        if (posSym !== _sym) continue;
        const pos     = p.position, sziOz = +pos.szi;
        const isGr    = _sym === 'XAU';
        const entryOz = +(pos.entryPx || 0);
        const entryD  = isGr ? entryOz/TL : entryOz;
        const curD    = _lastClose || (isGr ? State.prices?.['XAU']?.mid : State.prices?.[_sym]?.mid) || entryD;
        const curOz   = isGr ? curD*TL : curD;
        const pnl     = (curOz - entryOz) * sziOz;
        const lineOpts = { lock:true, disableSelection:true, disableUndo:true, zOrder:'top' };

        if (entryD > 0) {
          const col = pnl >= 0 ? '#2da44e' : '#e5534b';
          try {
            const id = ch.createShape({ price:entryD }, { shape:'horizontal_line', ...lineOpts,
              text:`${sziOz>0?'▲':'▼'} Entry  ${pnl>=0?'+':''}$${Math.abs(pnl).toFixed(2)}`,
              overrides:{ linecolor:col, linewidth:2, linestyle:2, showLabel:true, textcolor:col }
            });
            if (id) _entryLines.push(id);
          } catch {}
        }

        const ts = p.tpsl || {};
        if (ts.tp) {
          const tpD = isGr ? ts.tp/TL : ts.tp;
          const tpPnl = Math.abs(sziOz) * Math.abs(ts.tp - entryOz);
          try {
            _tpLine = ch.createShape({ price:tpD }, { shape:'horizontal_line', ...lineOpts,
              text:`🎯 TP +$${tpPnl.toFixed(2)}`,
              overrides:{ linecolor:'#22c58b', linewidth:2, linestyle:2, showLabel:true, textcolor:'#22c58b' }
            });
          } catch {}
        }
        if (ts.sl) {
          const slD = isGr ? ts.sl/TL : ts.sl;
          const slPnl = Math.abs(sziOz) * Math.abs(ts.sl - entryOz);
          try {
            _slLine = ch.createShape({ price:slD }, { shape:'horizontal_line', ...lineOpts,
              text:`🛡 SL -$${slPnl.toFixed(2)}`,
              overrides:{ linecolor:'#e8804a', linewidth:2, linestyle:2, showLabel:true, textcolor:'#e8804a' }
            });
          } catch {}
        }
        if (typeof calcLiqPrice !== 'undefined' && typeof ASSETS !== 'undefined') {
          const aLiq  = ASSETS[posSym] || ASSETS['GOLD'] || { lev:20, cross:false };
          const liqOz = calcLiqPrice(entryOz, sziOz, State.balance?.total||0, aLiq.cross, aLiq.lev);
          if (liqOz !== null && liqOz > 0) {
            const liqD = isGr ? liqOz/TL : liqOz;
            try {
              _liqLine = ch.createShape({ price:liqD }, { shape:'horizontal_line', ...lineOpts,
                text:`⚡ Liq $${liqD.toFixed(ai(_sym).pxDp)}`,
                overrides:{ linecolor:'#ff6b35', linewidth:2, linestyle:1, showLabel:true, textcolor:'#ff6b35' }
              });
            } catch {}
          }
        }
        break; // فقط المركز الحالي
      }
    } catch(e) { console.warn('[Chart] drawLines:', e.message); }
  }

  /* ════ Layout wait — يستنى حتى الـ container يأخذ حجمه الحقيقي ════ */
  function _waitLayout(cb, n) {
    clearTimeout(_layoutTmr); n = n || 0;
    const tvWrap = document.getElementById('_cTvWrap');
    if (tvWrap && _visible) {
      const r = tvWrap.getBoundingClientRect();
      if (r.width > 10 && r.height > 10) { cb(Math.floor(r.width), Math.floor(r.height)); return; }
    }
    if (!_visible) return;
    if (n < 100) { _layoutTmr = setTimeout(() => _waitLayout(cb, n+1), 16); }
    else {
      const sc = document.getElementById('chartScreen');
      cb(sc ? sc.clientWidth : window.innerWidth, Math.max(200, (sc ? sc.clientHeight : window.innerHeight) - 140));
    }
  }

  /* ════ ResizeObserver ════ */
  function _setupResize() {
    if (_ro) { _ro.disconnect(); _ro = null; }
    const tvWrap = document.getElementById('_cTvWrap');
    if (!tvWrap || !window.ResizeObserver) return;
    _ro = new ResizeObserver(entries => {
      if (!_widget || !_visible) return;
      const { width, height } = entries[0].contentRect;
      if (width < 10 || height < 10) return;
      const c = document.getElementById('_tvC');
      if (c) { c.style.width = Math.floor(width)+'px'; c.style.height = Math.floor(height)+'px'; }
      try { _widget.resize(Math.floor(width), Math.floor(height)); } catch {}
    });
    _ro.observe(tvWrap);
  }

  /* ════ Watchdog ════ */
  function _showWatchdog(sym) {
    const tvWrap = document.getElementById('_cTvWrap');
    if (!tvWrap || !_visible) return;
    document.getElementById('_cWatchdog')?.remove();
    const ov = document.createElement('div'); ov.id = '_cWatchdog';
    Object.assign(ov.style, { position:'absolute', inset:'0', zIndex:'80',
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      gap:'12px', padding:'20px', background:'var(--bg-app,#131722)',
      textAlign:'center', direction:'rtl', fontFamily:'Cairo,sans-serif' });
    ov.innerHTML = `
<div style="font-size:36px;">⏱</div>
<div style="font-size:15px;font-weight:900;color:var(--text-primary,#f5f5f5);">انتهت مهلة التحميل</div>
<div style="font-size:12px;color:var(--text-secondary,#a0a0a0);line-height:1.8;max-width:280px;">
  افتح DevTools → Console وابحث عن <code style="background:#1e1e1e;padding:2px 5px;border-radius:4px;">[Chart]</code>
</div>
<button id="_cWdRetry" style="padding:8px 24px;border-radius:999px;border:none;background:linear-gradient(135deg,#ff8c42,#a8502f);color:#fff;font-size:13px;font-weight:900;font-family:Cairo,sans-serif;cursor:pointer;">إعادة المحاولة</button>`;
    tvWrap.appendChild(ov);
    document.getElementById('_cWdRetry').onclick = () => { ov.remove(); _waitLayout((w,h)=>_initWidget(_sym,w,h)); };
  }

  /* ════ Destroy chart ════ */
  function _destroyChart() {
    clearTimeout(_layoutTmr); _layoutTmr = null;
    clearTimeout(_readyTmr);  _readyTmr  = null;
    if (_ro) { _ro.disconnect(); _ro = null; }
    _entryLines.forEach(id => { try { _widget?.activeChart().removeEntity(id); } catch {} });
    _entryLines = []; _tpLine = null; _slLine = null; _liqLine = null;
    if (_widget) { try { _widget.remove(); } catch {} _widget = null; }
    _chartReady = false; _subs = {};
    _wsChartClose();
    const c = document.getElementById('_tvC');
    if (c) { c.innerHTML = ''; c.style.width = ''; c.style.height = ''; }
    document.getElementById('_cWatchdog')?.remove();
  }

  /* ════ Widget Init ════ */
  function _initWidget(sym, w, h) {
    _destroyChart();
    if (typeof TradingView === 'undefined' || typeof TradingView.widget !== 'function') {
      console.error('[Chart] TradingView undefined — check /charting_library/charting_library.standalone.js');
      const tvWrap = document.getElementById('_cTvWrap');
      if (tvWrap) tvWrap.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ff8c42;font-size:14px;font-family:Cairo,sans-serif;text-align:center;padding:20px;direction:rtl;">⚠️ مكتبة TradingView غير متاحة</div>';
      return;
    }
    const cont = document.getElementById('_tvC'); if (!cont) return;
    cont.style.width = w + 'px'; cont.style.height = h + 'px';
    const dark = isDark(), bg = dark ? '#131722' : '#ffffff';
    const tvRes = IV_TO_TV[_interval] || '60';

    console.log('[Chart] creating widget', sym, w+'x'+h, tvRes, dark?'dark':'light');

    clearTimeout(_readyTmr);
    _readyTmr = setTimeout(() => { console.warn('[Chart] ⏱ timeout 9s', sym); _showWatchdog(sym); }, 9000);

    try {
      _widget = new TradingView.widget({
        width: w, height: h,
        symbol: sym,
        interval: tvRes,
        container: '_tvC',
        datafeed: Datafeed,
        library_path: '/charting_library/',
        locale: 'ar',
        timezone: 'Asia/Baghdad',
        theme: dark ? 'Dark' : 'Light',
        style: '1',
        debug: false,
        enable_publishing: false,
        allow_symbol_change: false,
        save_image: true,
        favorites: { intervals: ['1','60','1D'] },
        loading_screen: { backgroundColor: bg, foregroundColor: '#2962ff' },
        disabled_features: [
          'header_symbol_search',
          'header_compare',
          'header_saveload',
          'header_fullscreen_button',
          'symbol_info',
          'display_market_status',
          'show_logo_on_all_charts',
          'volume_force_overlay',
          'create_volume_indicator_by_default',
          'popup_hints',
        ],
        enabled_features: [
          'countdown_timer',
          'use_localstorage_for_settings',
          'move_logo_to_main_pane',
          'side_toolbar_in_fullscreen_mode',
        ],
        overrides: {
          'mainSeriesProperties.candleStyle.upColor':         '#26a69a',
          'mainSeriesProperties.candleStyle.downColor':       '#ef5350',
          'mainSeriesProperties.candleStyle.borderUpColor':   '#26a69a',
          'mainSeriesProperties.candleStyle.borderDownColor': '#ef5350',
          'mainSeriesProperties.candleStyle.wickUpColor':     '#26a69a',
          'mainSeriesProperties.candleStyle.wickDownColor':   '#ef5350',
          'paneProperties.background':     bg,
          'paneProperties.backgroundType':'solid',
          'paneProperties.vertGridProperties.color': dark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.04)',
          'paneProperties.horzGridProperties.color': dark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.04)',
          'scalesProperties.textColor':    dark?'#b2b5be':'#555',
          'scalesProperties.fontSize':     11,
          'scalesProperties.backgroundColor': dark?'#131722':'#f0f3fa',
        },
      });

      _widget.onChartReady(() => {
        console.log('[Chart] ✅ onChartReady', sym);
        clearTimeout(_readyTmr); _readyTmr = null;
        document.getElementById('_cWatchdog')?.remove();
        _chartReady = true;
        _setupResize();
        setTimeout(drawLines, 600);
        /* مزامنة interval إذا المستخدم غير من TradingView toolbar */
        try {
          _widget.activeChart().onIntervalChanged().subscribe(null, iv => {
            const hlIv = TV_TO_IV[iv] || iv;
            if (hlIv !== _interval) {
              _interval = hlIv;
              document.querySelectorAll('.iv-btn').forEach(b => b.classList.toggle('active', b.dataset.iv === hlIv));
            }
          });
        } catch {}
      });

    } catch(e) {
      console.error('[Chart] widget threw:', e);
      clearTimeout(_readyTmr); _readyTmr = null;
      const tvWrap = document.getElementById('_cTvWrap');
      if (tvWrap) tvWrap.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ef5350;font-size:13px;font-family:Cairo,sans-serif;text-align:center;padding:20px;direction:rtl;">❌ خطأ<br><small style="font-family:monospace;font-size:11px;opacity:.7;display:block;margin-top:6px;direction:ltr;">${e.message||e}</small></div>`;
    }
  }

  /* ════ بناء الشاشة ════ */
  function ensureScreen() {
    const screen = document.getElementById('chartScreen');
    if (!screen || document.getElementById('_cTvWrap')) return;
    screen.innerHTML = `
      <div class="c-nav">
        <div class="c-nav-row">
          <div class="c-nav-group">
            <button class="c-back" id="_cBack">← رجوع</button>
            <div class="c-asset-info">
              <span id="_cIcon" class="c-asset-icon">🛢</span>
              <span id="_cName" class="c-asset-name">—</span>
              <span id="_cPrice" class="c-cur-price">—</span>
            </div>
          </div>
          <div class="c-nav-group">
            <button class="c-reset-btn" id="_cReset" title="↺ عرض آخر الشموع">↺</button>
            <button class="c-fs-btn" id="_cLock">🔒</button>
            <button class="c-fs-btn" id="_cFs">⛶</button>
            <span class="c-ws" id="_cWs">⏳</span>
          </div>
        </div>
        <div class="c-nav-row">
          <div class="c-intervals" style="flex:1;">
            <button class="iv-btn" data-iv="1m">1m</button>
            <button class="iv-btn" data-iv="5m">5m</button>
            <button class="iv-btn" data-iv="15m">15m</button>
            <button class="iv-btn" data-iv="1h">1H</button>
            <button class="iv-btn" data-iv="4h">4H</button>
            <button class="iv-btn" data-iv="1d">1D</button>
          </div>
          <span id="_cClockT" style="font-family:monospace;font-size:11px;color:var(--text-secondary);padding-right:6px;">—</span>
        </div>
      </div>
      <div class="c-wrap" id="_cWrap">
        <div class="c-tv-wrap" id="_cTvWrap">
          <div id="_tvC"></div>
          <div class="c-cd-overlay" id="_cCdOverlay">⏱ —</div>
        </div>
        <div class="c-day-stat" id="_cDayStat"></div>
      </div>`;

    document.getElementById('_cBack').onclick  = () => ChartModule.close();
    document.getElementById('_cFs').onclick    = toggleFullscreen;
    document.getElementById('_cReset').onclick = resetView;
    document.getElementById('_cLock').onclick  = () => typeof lockApp === 'function' && lockApp(true);
    document.querySelectorAll('.iv-btn').forEach(b =>
      b.onclick = () => ChartModule.switchInterval(b.dataset.iv)
    );
    blockGestures(document.getElementById('_cTvWrap'));
  }

  function setHeader(sym) {
    const a = ai(sym);
    const ic = document.getElementById('_cIcon'), nm = document.getElementById('_cName');
    if (ic) ic.textContent = a.icon;
    if (nm) nm.textContent = a.name;
  }

  /* ════ API عامة ════ */
  function open(sym) {
    _sym = sym || (typeof State !== 'undefined' ? State.asset : 'CL');
    _visible = true; _gestInit = false;
    ensureScreen();
    document.getElementById('chartScreen')?.classList.remove('hidden');
    setHeader(_sym);
    document.querySelectorAll('.iv-btn').forEach(b => b.classList.toggle('active', b.dataset.iv === _interval));
    const wrap = document.getElementById('_cWrap');
    if (wrap) buildTradeBar(wrap);
    startClock();

    if (_widget && _chartReady) {
      /* Widget موجود — غير الأصل إذا تغير */
      try {
        _widget.setSymbol(_sym, IV_TO_TV[_interval]||'60', () => {
          setTimeout(() => { drawLines(); drawDayStats(); }, 600);
        });
      } catch {
        _waitLayout((w,h) => _initWidget(_sym, w, h));
      }
    } else {
      _waitLayout((w,h) => _initWidget(_sym, w, h));
    }
  }

  function close() {
    _visible = false;
    _wsChartClose(); hideCf(); stopClock();
    if (document.fullscreenElement) document.exitFullscreen?.();
    document.getElementById('chartScreen')?.classList.add('hidden');
    /* لا نحذف الـ widget — تبقى سريعة عند الفتح التالي */
  }

  function switchInterval(iv) {
    if (iv === _interval) return;
    _interval = iv;
    document.querySelectorAll('.iv-btn').forEach(b => b.classList.toggle('active', b.dataset.iv === iv));
    if (_widget && _chartReady) {
      try {
        _widget.activeChart().setResolution(IV_TO_TV[iv]||'60', () => {
          setTimeout(drawDayStats, 500);
        });
      } catch(e) { console.warn('[Chart] setResolution:', e.message); }
    }
  }

  function switchAssetChart(sym) {
    if (!_visible || sym === _sym) return;
    _sym = sym; setHeader(sym);
    const wrap = document.getElementById('_cWrap');
    if (wrap) buildTradeBar(wrap);
    if (_widget && _chartReady) {
      try {
        _widget.setSymbol(sym, IV_TO_TV[_interval]||'60', () => {
          setTimeout(() => { drawLines(); drawDayStats(); }, 600);
        });
      } catch(e) { console.warn('[Chart] setSymbol:', e.message); }
    }
  }

  function refreshLines() {
    if (_visible && _chartReady) drawLines();
  }

  return { open, close, switchInterval, switchAssetChart, refreshLines };
})();
