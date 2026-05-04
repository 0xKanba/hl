/* ═══════════════════════════════════════════════════════════════
   HL Trade · chart.js v7.2
   ✅ اليوم يبدأ 00:00 UTC+3 (منتصف الليل فعلياً)
   ✅ Crosshair legend: سعر + تاريخ + وقت كامل
   ✅ لا خط سعر أفقي — فقط label على المحور
   ✅ العد التنازلي بجانب label السعر (أسفل يمين الرسم)
   ✅ زر ↺ إعادة ضبط بدون bug
   ✅ خطوط Entry / TP / SL / Liq
═══════════════════════════════════════════════════════════════ */

const ChartModule = (function () {

  const HL_API = 'https://api.hyperliquid.xyz';
  const HL_WS  = 'wss://api.hyperliquid.xyz/ws';
  const UTC3   = 3 * 3600; // ثواني

  const RANGES = {
    '1m':  90   * 3600000,
    '5m':  360  * 3600000,
    '15m': 900  * 3600000,
    '1h':  3600 * 3600000,
    '4h':  14400* 3600000,
    '1d':  43200* 3600000,
  };
  const IV_SPACING = { '1m':4, '5m':5, '15m':6, '1h':7, '4h':9, '1d':13 };

  let _chart      = null;
  let _series     = null;
  let _entryLines = [];
  let _tpLine     = null;
  let _slLine     = null;
  let _liqLine    = null;
  let _candles    = [];
  let _ws         = null;
  let _wsTimer    = null;
  let _visible    = false;
  let _sym        = 'CL';
  let _interval   = '1h';
  let _resizeObs  = null;
  let _lastClose  = 0;
  let _clockTimer = null;
  let _dayTimer   = null;
  let _cdTimer    = null;   // countdown overlay timer
  let _gestInit   = false;

  /* ════ CSS ════ */
  (function injectCSS() {
    if (document.getElementById('_chartCSS')) return;
    const s = document.createElement('style');
    s.id = '_chartCSS';
    s.textContent = `
.chart-screen {
  position:fixed; inset:0; z-index:50;
  display:flex; flex-direction:column; background:var(--bg-app);
}
.chart-screen.hidden { display:none !important; }

.c-nav {
  display:flex; flex-direction:column; padding:6px 10px;
  background:var(--bg-card); border-bottom:1px solid var(--border);
  flex-shrink:0; gap:6px; direction:rtl;
}
.c-nav-row {
  display:flex; align-items:center; justify-content:space-between; width:100%;
}
.c-nav-group { display:flex; align-items:center; gap:6px; }

.c-back {
  color:var(--ac); font-size:12px; font-weight:800;
  padding:5px 12px; border-radius:10px;
  border:1.5px solid var(--ac-dim); background:var(--ac-dim);
  font-family:'Cairo',sans-serif; white-space:nowrap;
}
.c-back:active { opacity:.7; }
.c-asset-info { display:flex; align-items:center; gap:5px; margin-right:8px; }
.c-asset-icon { font-size:15px; line-height:1; }
.c-asset-name { font-size:13px; font-weight:900; color:var(--text-primary); }
.c-cur-price  { font-family:'IBM Plex Mono',monospace; font-size:14px; font-weight:800; color:var(--text-primary); }

.c-reset-btn {
  font-size:16px; line-height:1;
  background:var(--bg-elev); border:1px solid var(--border);
  border-radius:8px; padding:4px 8px; color:var(--text-secondary);
  cursor:pointer; transition:color .15s, border-color .15s;
}
.c-reset-btn:hover { color:var(--ac); border-color:var(--ac); }
.c-reset-btn:active { transform:scale(.88); }

.c-fs-btn {
  background:var(--bg-elev); border:1px solid var(--border);
  border-radius:8px; padding:4px 8px; font-size:14px;
  color:var(--text-secondary); cursor:pointer;
}
.c-ws { font-size:11px; flex-shrink:0; }

.c-intervals { display:flex; gap:4px; flex-shrink:0; }
.iv-btn {
  flex:1; min-width:0; padding:5px 3px; border-radius:999px;
  border:1.5px solid var(--border); background:var(--bg-elev);
  color:var(--text-secondary); font-size:11px; font-weight:800;
  font-family:'IBM Plex Mono',monospace; text-align:center; cursor:pointer;
}
.iv-btn:active { transform:scale(.88); }
.iv-btn.active { border-color:var(--ac); background:var(--ac-dim); color:var(--ac); }

/* Trade Bar */
.c-trade-bar {
  display:flex; align-items:center; gap:6px;
  padding:7px 8px; background:var(--bg-card);
  border-bottom:1px solid var(--border); flex-shrink:0; direction:rtl;
}
.cbt-btn {
  flex:1; min-height:54px; padding:7px 5px; border-radius:14px; border:none;
  font-family:'Cairo',sans-serif; font-size:16px; font-weight:900;
  cursor:pointer; color:#fff;
  display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px;
}
.cbt-btn:active { transform:scale(.93); }
.cbt-buy  { background:linear-gradient(150deg,#2da44e,#1a7f37); }
.cbt-sell { background:linear-gradient(150deg,#e5534b,#a0281e); }
.cbt-dir  { font-size:15px; line-height:1; }
.cbt-px   { font-family:'IBM Plex Mono',monospace; font-size:10px; opacity:.75; }
.cbt-mid  { display:flex; flex-direction:column; align-items:center; gap:3px; flex:1.1; }
.cbt-qty-lbl  { font-size:9px; color:var(--text-muted); font-weight:700; letter-spacing:1px; }
.cbt-qty-row  { display:flex; align-items:center; gap:4px; }
.cbt-qty-in {
  width:76px; font-family:'IBM Plex Mono',monospace; font-size:18px; font-weight:700;
  text-align:center; direction:ltr; background:var(--bg-input);
  border:2px solid var(--ac-dim); border-radius:10px; padding:6px 4px;
  color:var(--text-primary); outline:none;
}
.cbt-qty-in:focus { border-color:var(--ac); }
.cbt-qty-unit { font-size:9px; color:var(--text-secondary); font-weight:700; white-space:nowrap; }
.cbt-presets  { display:flex; gap:3px; }
.cbt-preset {
  font-family:'IBM Plex Mono',monospace; font-size:9px; font-weight:700;
  padding:3px 6px; border-radius:999px;
  border:1.5px solid var(--border); background:var(--bg-elev); color:var(--text-muted); cursor:pointer;
}
.cbt-preset.active { border-color:var(--ac); color:var(--ac); background:var(--ac-dim); }

/* Wrap */
.c-wrap  { position:relative; flex:1; min-height:0; display:flex; flex-direction:column; }
.c-inner { flex:1; min-height:0; width:100%; touch-action:none; user-select:none; overflow:hidden; }

/* ✅ Countdown overlay — بجانب label السعر (أسفل يمين) */
.c-cd-overlay {
  position:absolute; bottom:52px; left:4px;
  background:rgba(0,0,0,.7);
  backdrop-filter:blur(4px); -webkit-backdrop-filter:blur(4px);
  border-radius:6px; padding:3px 7px;
  font-family:'IBM Plex Mono',monospace; font-size:11px; font-weight:800;
  color:var(--ac); z-index:10; pointer-events:none;
  border:1px solid rgba(224,114,72,.35);
  white-space:nowrap;
  direction:ltr;
}

/* Day Stat bar */
.c-day-stat {
  display:flex; align-items:center; gap:10px; flex-wrap:wrap;
  padding:3px 10px; background:var(--bg-card);
  border-top:1px solid var(--border); flex-shrink:0;
  font-family:'IBM Plex Mono',monospace; min-height:22px;
}

/* OHLC Legend */
.c-legend {
  padding:4px 10px; background:var(--bg-card);
  border-top:1px solid var(--border);
  font-family:'IBM Plex Mono',monospace;
  font-size:11px; font-weight:700; color:var(--text-secondary);
  display:flex; gap:8px; flex-wrap:wrap;
  flex-shrink:0; min-height:24px; align-items:center; overflow:hidden;
}

/* Confirmation */
.cf-ov {
  position:absolute; inset:0; z-index:95;
  display:flex; align-items:flex-end; justify-content:center;
  background:rgba(0,0,0,.65);
  backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); direction:rtl;
}
.cf-card {
  background:var(--bg-card); border-top:2px solid var(--border-strong);
  border-radius:22px 22px 0 0; width:100%; max-width:480px;
  padding:14px 14px 20px; animation:cfSu .22s cubic-bezier(.4,0,.2,1);
}
@keyframes cfSu { from{transform:translateY(100%)} to{transform:none} }
.cf-hdl { width:32px;height:4px;background:var(--border-strong);border-radius:999px;margin:0 auto 12px; }
.cf-title { font-size:16px;font-weight:900;margin-bottom:3px; }
.cf-sub   { font-size:11px;color:var(--text-secondary);margin-bottom:10px; }
.cf-rows  { background:var(--bg-input);border-radius:12px;padding:8px 10px;display:flex;flex-direction:column;gap:4px;margin-bottom:10px; }
.cf-row   { display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--border); }
.cf-row:last-child { border:none; }
.cf-key { font-size:11px;color:var(--text-secondary);font-weight:700; }
.cf-val { font-family:'IBM Plex Mono',monospace;font-size:13px;font-weight:800; }
.cf-val.g{color:#2da44e;} .cf-val.r{color:#e5534b;} .cf-val.w{color:var(--warn);}
.cf-btns { display:grid;grid-template-columns:1fr 1fr;gap:8px; }
.cf-cancel { padding:11px;border-radius:999px;border:1.5px solid var(--border-strong);background:var(--bg-elev);color:var(--text-secondary);font-size:13px;font-weight:700;cursor:pointer;font-family:'Cairo',sans-serif; }
.cf-exec   { padding:11px;border-radius:999px;border:none;color:#fff;font-size:13px;font-weight:900;cursor:pointer;font-family:'Cairo',sans-serif;display:flex;align-items:center;justify-content:center;gap:5px; }
.cf-exec.g { background:linear-gradient(135deg,#2da44e,#1a7f37); }
.cf-exec.r { background:linear-gradient(135deg,#e5534b,#a0281e); }
.cf-exec:active { filter:brightness(.88); }
.cf-exec:disabled { opacity:.5;pointer-events:none; }
.cf-spin { width:14px;height:14px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:cfR .7s linear infinite; }
@keyframes cfR { to{transform:rotate(360deg)} }
`;
    document.head.appendChild(s);
  })();

  /* ════ مساعدات ════ */
  const coin = s => (typeof ASSETS !== 'undefined' && ASSETS[s]?.coin) || `xyz:${s}`;
  const ai   = s => (typeof ASSETS !== 'undefined' && ASSETS[s]) ||
    { pxDp:2, szDp:2, name:s, icon:'📊', unit:'', lev:10, presets:[1], idx:0, cross:true };
  const setStatus = t => { const e = document.getElementById('_cWs'); if (e) e.textContent = t; };
  const isDark    = () => window.matchMedia('(prefers-color-scheme:dark)').matches;
  const fp = (n, s) => (+n).toFixed(ai(s || _sym).pxDp);
  const fs = (n, s) => (+n).toFixed(ai(s || _sym).szDp);

  function setPrice(p) {
    _lastClose = +p;
    const e = document.getElementById('_cPrice');
    if (e && p) e.textContent = '$' + (+p).toFixed(ai(_sym).pxDp);
    updateBtnPx();
  }

  /* ════ UTC+3 تنسيق الوقت ════ */
  const _MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const _DN = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  function _d3(tick) { return new Date((tick + UTC3) * 1000); }

  /* المحور الأسفل — وقت فقط */
  function fmtTimeAxis(tick) {
    const d = _d3(tick);
    const h = d.getUTCHours(), m = d.getUTCMinutes();
    const ap = h >= 12 ? 'PM' : 'AM';
    return `${String(h%12||12).padStart(2,'0')}:${String(m).padStart(2,'0')} ${ap}`;
  }
  /* المحور الأسفل — تاريخ */
  function fmtDateAxis(tick) {
    const d = _d3(tick);
    return `${_MN[d.getUTCMonth()]} ${d.getUTCDate()}`;
  }
  /* Crosshair Legend — تاريخ + وقت كامل */
  function fmtFull(tick) {
    const d  = _d3(tick);
    const h  = d.getUTCHours(), m = d.getUTCMinutes();
    const ap = h >= 12 ? 'PM' : 'AM';
    return `${_DN[d.getUTCDay()]} ${d.getUTCDate()} ${_MN[d.getUTCMonth()]} ${d.getUTCFullYear()} · ${String(h%12||12).padStart(2,'0')}:${String(m).padStart(2,'0')} ${ap} +3`;
  }

  /* ════ ساعة UTC+3 ════ */
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
      /* ساعة UTC+3 */
      const now = new Date(Date.now() + 3 * 3600000);
      const t   = document.getElementById('_cClockT');
      if (t) t.textContent = now.toLocaleTimeString('en-US',
        { hour12:true, hour:'2-digit', minute:'2-digit', second:'2-digit', timeZone:'UTC' });

      /* ✅ العد التنازلي في الـ overlay بجانب السعر */
      const ivMs = getIvMs(_interval);
      const diff = Math.ceil(Date.now() / ivMs) * ivMs - Date.now();
      const hh   = Math.floor(diff / 3600000);
      const mm   = Math.floor((diff % 3600000) / 60000);
      const ss   = Math.floor((diff % 60000) / 1000);
      const cdStr = (hh > 0 ? hh + ':' : '') + String(mm).padStart(2,'0') + ':' + String(ss).padStart(2,'0');
      const cdOv  = document.getElementById('_cCdOverlay');
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

  function blockGestures(el) {
    if (_gestInit) return; _gestInit = true;
    ['gesturestart','gesturechange','gestureend'].forEach(ev =>
      el.addEventListener(ev, e => e.preventDefault(), { passive:false })
    );
    el.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive:false });
  }

  function toggleFullscreen() {
    const el = document.getElementById('chartScreen');
    if (!document.fullscreenElement) el.requestFullscreen?.() || el.webkitRequestFullscreen?.();
    else document.exitFullscreen?.() || document.webkitExitFullscreen?.();
  }

  /* ════ ↺ إعادة الضبط — scrollToRealTime فقط، لا إعادة بناء ════ */
  function resetView() {
    if (!_chart) return;
    _chart.timeScale().scrollToRealTime();
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
    wrap.insertAdjacentElement('afterbegin', bar);
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
    if (typeof State === 'undefined' || !State.wallet)
      return toast?.('سجّل الدخول أولاً', 'err');
    const qty = parseFloat(document.getElementById('_cQty')?.value || 0);
    if (!qty || qty <= 0) return toast?.('أدخل الكمية', 'err');
    const a   = ai(_sym);
    const TL  = 31.1035;
    const isGr = _sym === 'XAU';
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
    const ov   = document.createElement('div');
    ov.id = '_cfOv'; ov.className = 'cf-ov';
    ov.innerHTML = `
      <div class="cf-card">
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
    const TL   = 31.1035;
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

  /* ════ إحصائيات اليوم — ✅ يبدأ 00:00 UTC+3 ════ */
  function getSessionStartSec() {
    /*
      نريد: منتصف الليل UTC+3 = 00:00 UTC+3
      = 21:00 UTC من اليوم السابق

      الخطوات:
      1. احسب التاريخ الحالي بتوقيت UTC+3
      2. خذ منتصف الليل لذلك التاريخ بتوقيت UTC (أي 00:00 UTC)
      3. اطرح 3 ساعات للحصول على 00:00 UTC+3 بتوقيت UTC
    */
    const nowUTC3ms  = Date.now() + UTC3 * 1000;         // ms كأن UTC هو UTC+3
    const d          = new Date(nowUTC3ms);                // التاريخ بصيغة UTC+3
    const midnightUTC = Date.UTC(                          // منتصف ليل UTC لهذا اليوم
      d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()
    );
    /* ✅ منتصف الليل UTC+3 = منتصف UTC - 3 ساعات */
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
    if (!_series) return;
    const st = computeDayStats();
    const el = document.getElementById('_cDayStat');
    if (!st) { if (el) el.innerHTML = ''; return; }
    const dp  = ai(_sym).pxDp;
    const up  = st.pct >= 0;
    if (el) {
      el.innerHTML =
        `<span style="color:var(--text-muted);font-size:10px;font-weight:700;">00:00+3</span>` +
        `<span style="color:#26a69a;font-size:11px;font-weight:800;">▲ ${st.high.toFixed(dp)}</span>` +
        `<span style="color:#ef5350;font-size:11px;font-weight:800;">▼ ${st.low.toFixed(dp)}</span>` +
        `<span style="color:${up?'#26a69a':'#ef5350'};font-size:13px;font-weight:900;">${up?'+':''}${st.pct.toFixed(2)}%</span>`;
    }
  }

  /* ════ بناء الرسم ════ */
  function buildChart(container) {
    if (_chart) { try { _chart.remove(); } catch {} _chart=null; _series=null; }
    if (_resizeObs) { try { _resizeObs.disconnect(); } catch {} }

    const dark = isDark();
    const BG   = dark ? '#131722' : '#ffffff';
    const TXT  = dark ? '#d1d4dc' : '#131722';
    const GRID = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    const BDR  = dark ? '#2a2e39' : '#e0e3eb';
    const CH   = dark ? 'rgba(197,200,207,0.6)' : 'rgba(19,23,34,0.45)';
    const LBG  = dark ? '#1565c0' : '#1e88e5';

    _chart = LightweightCharts.createChart(container, {
      width:  container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type:'solid', color:BG },
        textColor:  TXT, fontSize:12,
        fontFamily: "'IBM Plex Mono',monospace",
      },
      grid: {
        vertLines: { color:GRID },
        horzLines: { color:GRID },
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: {
          width:1, color:CH,
          style:LightweightCharts.LineStyle.Dashed,
          labelBackgroundColor:LBG, labelVisible:true,
        },
        horzLine: {
          width:1, color:CH,
          style:LightweightCharts.LineStyle.Dashed,
          labelBackgroundColor:LBG, labelVisible:true,
        },
      },
      rightPriceScale: {
        borderColor:BDR, scaleMargins:{top:0.06,bottom:0.06},
        minimumWidth:80, borderVisible:true, autoScale:true,
      },
      timeScale: {
        borderColor:BDR, timeVisible:true, secondsVisible:false,
        rightOffset:8, barSpacing:IV_SPACING[_interval]||7,
        minBarSpacing:2, fixLeftEdge:true, borderVisible:true,
        /* ✅ UTC+3 AM/PM على محور الأسفل */
        tickMarkFormatter: (tick, type) => {
          if (type >= 3) return fmtTimeAxis(tick);
          if (type === 2) return fmtDateAxis(tick);
          if (type === 1) return _MN[_d3(tick).getUTCMonth()];
          return _d3(tick).getUTCFullYear().toString();
        },
      },
      handleScroll: {
        mouseWheel:true, pressedMouseMove:true,
        horzTouchDrag:true, vertTouchDrag:true,
      },
      handleScale: {
        mouseWheel:true, pinch:true,
        axisPressedMouseMove:{time:true, price:true},
      },
      localization: {
        locale:'en-US',
        priceFormatter: p => p.toLocaleString('en-US', {
          minimumFractionDigits:ai(_sym).pxDp,
          maximumFractionDigits:ai(_sym).pxDp,
        }),
        /* ✅ label المحور السفلي عند Crosshair = تاريخ + وقت كامل */
        timeFormatter: tick => fmtFull(tick),
      },
      attributionLogo:false,
    });

    /* ✅ الشموع — بدون خط السعر الأفقي الزائد */
    _series = _chart.addCandlestickSeries({
      upColor:         '#26a69a',
      downColor:       '#ef5350',
      borderUpColor:   '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor:     '#26a69a',
      wickDownColor:   '#ef5350',
      borderVisible:   true,
      wickVisible:     true,
      priceLineVisible: false,   // ✅ إزالة الخط الأفقي — label يبقى
      lastValueVisible: true,    // ✅ label السعر على المحور يبقى
    });

    /* ✅ Crosshair Legend — سعر + تاريخ + وقت كامل */
    _chart.subscribeCrosshairMove(param => {
      const el = document.getElementById('_cLegend');
      if (!el) return;
      if (!param.time || !param.seriesData?.size) { el.innerHTML = ''; return; }
      const bar = param.seriesData.get(_series);
      if (!bar) return;
      const dp  = ai(_sym).pxDp;
      const up  = bar.close >= bar.open;
      const cl  = up ? '#26a69a' : '#ef5350';
      const chg = (((bar.close - bar.open) / bar.open) * 100).toFixed(2);

      /* ✅ السعر يظهر أولاً ثم التاريخ والوقت */
      el.innerHTML =
        `<span style="color:${cl};font-weight:900;font-size:13px;">$${bar.close.toFixed(dp)}</span>` +
        `<span style="color:var(--text-secondary);font-size:10px;font-weight:700;white-space:nowrap;">${fmtFull(param.time)}</span>` +
        `<span style="color:${cl};font-weight:800;">O ${bar.open.toFixed(dp)}</span>` +
        `<span style="color:${cl};">H ${bar.high.toFixed(dp)}</span>` +
        `<span style="color:${cl};">L ${bar.low.toFixed(dp)}</span>` +
        `<span style="color:${cl};font-weight:900;">${chg>0?'+':''}${chg}%</span>`;
    });

    _resizeObs = new ResizeObserver(() => {
      if (_chart && container)
        _chart.applyOptions({ width:container.clientWidth, height:container.clientHeight });
    });
    _resizeObs.observe(container);
  }

  /* ════ جلب الشموع ════ */
  async function fetchCandles(sym, iv) {
    const now  = Date.now();
    const start = now - (RANGES[iv] || RANGES['1h']);
    const TL   = 31.1035;
    const isGr = sym === 'XAU';
    try {
      const r   = await fetch(HL_API+'/info', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ type:'candleSnapshot', req:{ coin:coin(sym), interval:iv, startTime:start, endTime:now } })
      });
      const raw = await r.json();
      if (!Array.isArray(raw) || !raw.length) return [];
      return raw.map(c => ({
        time:  Math.floor(c.t / 1000),
        open:  isGr ? +c.o/TL : +c.o,
        high:  isGr ? +c.h/TL : +c.h,
        low:   isGr ? +c.l/TL : +c.l,
        close: isGr ? +c.c/TL : +c.c,
      })).sort((a, b) => a.time - b.time);
    } catch (e) { console.warn('[Chart]', e.message); return []; }
  }

  /* ════ خطوط المراكز ════ */
  function clearLines() {
    _entryLines.forEach(l => { try { _series.removePriceLine(l); } catch {} }); _entryLines = [];
    if (_tpLine)  { try { _series.removePriceLine(_tpLine);  } catch {} _tpLine  = null; }
    if (_slLine)  { try { _series.removePriceLine(_slLine);  } catch {} _slLine  = null; }
    if (_liqLine) { try { _series.removePriceLine(_liqLine); } catch {} _liqLine = null; }
  }

  function drawLines() {
    if (!_series || typeof State === 'undefined') return;
    clearLines();
    const TL = 31.1035;
    for (const p of (State.positions || [])) {
      const rawCoin = p.position.coin.includes(':') ? p.position.coin.split(':')[1] : p.position.coin;
      const posSym  = rawCoin === 'GOLD' ? 'XAU' : rawCoin;
      if (posSym !== _sym) continue;
      const pos     = p.position;
      const sziOz   = +pos.szi;
      const isGr    = _sym === 'XAU';
      const entryOz = +(pos.entryPx || 0);
      const entryD  = isGr ? entryOz/TL : entryOz;
      const curD    = _lastClose || (isGr ? State.prices?.['XAU']?.mid : State.prices?.[_sym]?.mid) || entryD;
      const curOz   = isGr ? curD*TL : curD;
      const pnl     = (curOz - entryOz) * sziOz;

      if (entryD > 0) {
        _entryLines.push(_series.createPriceLine({
          price:entryD, lineWidth:2, lineStyle:2,
          color:pnl>=0?'#2da44e':'#e5534b', axisLabelVisible:true,
          title:`${sziOz>0?'▲':'▼'} Entry  ${pnl>=0?'+':''}$${Math.abs(pnl).toFixed(2)}`,
        }));
      }
      const ts = p.tpsl || {};
      if (ts.tp) {
        const tpD   = isGr ? ts.tp/TL : ts.tp;
        const tpPnl = Math.abs(sziOz) * Math.abs(ts.tp - entryOz);
        _tpLine = _series.createPriceLine({
          price:tpD, lineWidth:2, lineStyle:2, color:'#22c58b', axisLabelVisible:true,
          title:`🎯 TP +$${tpPnl.toFixed(2)}`
        });
      }
      if (ts.sl) {
        const slD   = isGr ? ts.sl/TL : ts.sl;
        const slPnl = Math.abs(sziOz) * Math.abs(ts.sl - entryOz);
        _slLine = _series.createPriceLine({
          price:slD, lineWidth:2, lineStyle:2, color:'#e8804a', axisLabelVisible:true,
          title:`🛡 SL -$${slPnl.toFixed(2)}`
        });
      }
      if (typeof calcLiqPrice !== 'undefined' && typeof ASSETS !== 'undefined') {
        const aLiq  = ASSETS[posSym] || ASSETS['GOLD'] || { lev:20, cross:false };
        const liqOz = calcLiqPrice(entryOz, sziOz, State.balance?.total||0, aLiq.cross, aLiq.lev);
        if (liqOz !== null && liqOz > 0) {
          const liqD = isGr ? liqOz/TL : liqOz;
          _liqLine = _series.createPriceLine({
            price:liqD, lineWidth:2,
            lineStyle:LightweightCharts.LineStyle.Dotted,
            color:'#ff6b35', axisLabelVisible:true,
            title:`⚡ Liq $${liqD.toFixed(ai(_sym).pxDp)}`,
          });
        }
      }
      break;
    }
  }

  /* ════ WebSocket ════ */
  function wsConnect() {
    wsClose(); clearTimeout(_wsTimer);
    const TL = 31.1035;
    try {
      _ws = new WebSocket(HL_WS);
      _ws.onopen = () => {
        _ws.send(JSON.stringify({ method:'subscribe', subscription:{ type:'candle', coin:coin(_sym), interval:_interval } }));
        setStatus('🟢');
      };
      _ws.onmessage = e => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.channel !== 'candle' || !msg.data || !_series) return;
          const c    = msg.data;
          const isGr = _sym === 'XAU';
          const bar  = {
            time:  Math.floor(c.t/1000),
            open:  isGr?+c.o/TL:+c.o,
            high:  isGr?+c.h/TL:+c.h,
            low:   isGr?+c.l/TL:+c.l,
            close: isGr?+c.c/TL:+c.c,
          };
          _series.update(bar);
          const last = _candles[_candles.length-1];
          if (last && last.time === bar.time) _candles[_candles.length-1] = bar;
          else if (last && bar.time > last.time) _candles.push(bar);
          setPrice(bar.close);
          drawLines();
          drawDayStats();
        } catch {}
      };
      _ws.onerror = () => setStatus('🔴');
      _ws.onclose = () => { setStatus('🔴'); if (_visible) _wsTimer = setTimeout(wsConnect, 4000); };
    } catch (e) { console.warn('[WS]', e.message); }
  }
  function wsClose() {
    if (_ws) { try { _ws.close(); } catch {} _ws = null; }
    clearTimeout(_wsTimer);
  }

  /* ════ تحميل ════ */
  async function load(sym, iv) {
    if (!_chart || !_series) return;
    setStatus('⏳');
    const px = document.getElementById('_cPrice'); if (px) px.textContent = '—';
    const candles = await fetchCandles(sym, iv);
    if (!candles.length) { setStatus('❌'); return; }
    _candles = candles;
    _series.setData(candles);
    _chart.timeScale().applyOptions({ barSpacing:IV_SPACING[iv]||7 });
    _chart.timeScale().scrollToRealTime();
    _lastClose = candles[candles.length-1].close;
    setPrice(_lastClose);
    drawLines();
    drawDayStats();
    setStatus('🟡');
    wsConnect();
  }

  /* ════ بناء الشاشة ════ */
  function ensureScreen() {
    const screen = document.getElementById('chartScreen');
    if (!screen || document.getElementById('_cWrap')) return;
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
            <button class="c-fs-btn" id="_cLock" style="border:none;background:none;font-size:15px;">🔒</button>
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
        <div class="c-inner" id="_cInner"></div>
        <!-- ✅ العد التنازلي overlay بجانب label السعر -->
        <div class="c-cd-overlay" id="_cCdOverlay">⏱ —</div>
        <div class="c-day-stat" id="_cDayStat"></div>
        <div class="c-legend"   id="_cLegend"></div>
      </div>`;

    document.getElementById('_cBack').onclick  = () => ChartModule.close();
    document.getElementById('_cFs').onclick    = toggleFullscreen;
    document.getElementById('_cReset').onclick = resetView;
    document.getElementById('_cLock').onclick  = () => typeof lockApp === 'function' && lockApp();
    document.querySelectorAll('.iv-btn').forEach(b =>
      b.onclick = () => ChartModule.switchInterval(b.dataset.iv)
    );
  }

  function setHeader(sym) {
    const a  = ai(sym);
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
    const inner = document.getElementById('_cInner');
    if (inner) { blockGestures(inner); buildChart(inner); load(_sym, _interval); }
    startClock();
  }

  function close() {
    _visible = false;
    wsClose(); hideCf(); stopClock();
    if (document.fullscreenElement) document.exitFullscreen?.();
    document.getElementById('chartScreen')?.classList.add('hidden');
    const lg = document.getElementById('_cLegend');  if (lg) lg.innerHTML = '';
    const ds = document.getElementById('_cDayStat'); if (ds) ds.innerHTML = '';
    _liqLine = null; _candles = [];
  }

  function switchInterval(iv) {
    if (iv === _interval) return;
    _interval = iv; wsClose();
    document.querySelectorAll('.iv-btn').forEach(b => b.classList.toggle('active', b.dataset.iv === iv));
    load(_sym, _interval);
  }

  function switchAssetChart(sym) {
    if (!_visible || sym === _sym) return;
    _sym = sym; setHeader(sym); wsClose();
    const wrap = document.getElementById('_cWrap');
    if (wrap) buildTradeBar(wrap);
    const inner = document.getElementById('_cInner');
    if (inner) { buildChart(inner); load(_sym, _interval); }
  }

  function refreshLines() {
    if (_visible && _series) drawLines();
  }

  return { open, close, switchInterval, switchAssetChart, refreshLines };
})();
