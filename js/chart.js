/* ═══════════════════════════════════════════════════════════════
   HL Trade · chart.js v6.0 — TradingView Mobile Pro
   ✅ UTC+3 محور الأسفل (tickMarkFormatter) + AM/PM
   ✅ RANGES ×30 — تاريخ أعمق بكثير
   ✅ لا Volume — تركيز كامل على الشموع
   ✅ خط أعلى/أدنى سعر اليوم من 1 AM UTC+3
   ✅ نسبة تغيير السعر منذ افتتاح الجلسة
═══════════════════════════════════════════════════════════════ */

const ChartModule = (function () {

  const HL_API = 'https://api.hyperliquid.xyz';
  const HL_WS  = 'wss://api.hyperliquid.xyz/ws';
  const UTC3   = 3 * 3600; // ثواني — offset ثابت

  // ×30 من السابق — تاريخ عميق مع مرونة كاملة للتمرير
  const RANGES = {
    '1m':  90  * 3600000,    // 90h   = 5400 شمعة
    '5m':  360 * 3600000,    // 360h  = 4320 شمعة
    '15m': 900 * 3600000,    // 900h  = 3600 شمعة (37.5 يوم)
    '1h':  3600* 3600000,    // 3600h = 3600 شمعة (150 يوم)
    '4h':  14400*3600000,    // 600 يوم
    '1d':  43200*3600000,    // 4.9 سنة
  };

  // barSpacing مثالي لكل فترة على الموبايل
  const IV_SPACING = { '1m':4, '5m':5, '15m':6, '1h':7, '4h':9, '1d':13 };

  let _chart        = null;
  let _series       = null;
  let _entryLines   = [];
  let _tpLine       = null;
  let _slLine       = null;
  let _dayHiLine    = null;
  let _dayLoLine    = null;
  let _liqLine      = null;  // ✅ خط التصفية
  let _candles      = [];   // cache للـ day stats
  let _ws           = null;
  let _wsTimer      = null;
  let _visible      = false;
  let _sym          = 'CL';
  let _interval     = '1h';
  let _resizeObs    = null;
  let _lastClose    = 0;
  let _clockTimer   = null;

  /* ════════════
     CSS
  ════════════ */
  (function injectCSS() {
    if (document.getElementById('_chartCSS')) return;
    const s = document.createElement('style');
    s.id = '_chartCSS';
    s.textContent = `
/* ── شاشة الرسم ── */
.chart-screen {
  position:fixed; inset:0; z-index:50;
  display:flex; flex-direction:column;
  background:var(--bg-app);
}
.chart-screen.hidden { display:none !important; }

/* ── شريط العنوان ── */
.c-nav {
  display:flex; flex-direction:column;
  padding:8px 12px;
  background:var(--bg-card);
  border-bottom:1px solid var(--border);
  flex-shrink:0; gap:8px; direction:rtl;
}
.c-nav-row {
  display:flex; align-items:center; justify-content:space-between;
  width:100%;
}
.c-nav-group { display:flex; align-items:center; gap:8px; }

.c-back {
  color:var(--ac); font-size:12px; font-weight:700;
  padding:6px 14px; border-radius:12px;
  border:1.5px solid var(--ac-dim); background:var(--ac-dim);
  font-family:'Cairo',sans-serif; white-space:nowrap;
}
.c-back:active { opacity:.7; }

.c-asset-info { display:flex; align-items:center; gap:5px; margin-right: 10px; }
.c-asset-icon { font-size:16px; line-height:1; }
.c-asset-name { font-size:13px; font-weight:900; }
.c-cur-price {
  font-family:'IBM Plex Mono',monospace;
  font-size:14px; font-weight:700; color:var(--text-primary);
}

/* ساعة — على اليسار */
.c-clock {
  display:flex; flex-direction:column; align-items:flex-start;
  pointer-events:none;
  margin-left: 10px;
}
.c-clock-time {
  font-family:'IBM Plex Mono',monospace;
  font-size:13px; font-weight:700; color:var(--text-primary);
  white-space:nowrap; line-height:1.2;
}
.c-clock-date {
  font-family:'IBM Plex Mono',monospace;
  font-size:9px; color:var(--text-muted); white-space:nowrap;
  letter-spacing:.4px;
}

.c-fs-btn {
  background: var(--bg-elev); border: 1px solid var(--border);
  border-radius: 8px; padding: 4px 8px; font-size: 14px;
  color: var(--text-secondary);
}

.c-ws { font-size:12px; flex-shrink:0; margin-right: 5px; }

/* ── فترات ── */
.c-intervals {
  display:flex; gap:5px; padding:5px 10px;
  background:var(--bg-card); border-bottom:1px solid var(--border);
  flex-shrink:0;
}
.iv-btn {
  flex:1; padding:6px 4px; border-radius:999px;
  border:1.5px solid var(--border); background:var(--bg-elev);
  color:var(--text-muted); font-size:11px; font-weight:700;
  font-family:'IBM Plex Mono',monospace;
  text-align:center; transition:all .15s; cursor:pointer;
}
.iv-btn:active { transform:scale(.88); }
.iv-btn.active { border-color:var(--ac); background:var(--ac-dim); color:var(--ac); }

/* ── Trade Bar ── */
.c-trade-bar {
  display:flex; align-items:center; gap:6px;
  padding:8px 10px;
  background:var(--bg-card); border-bottom:1px solid var(--border);
  flex-shrink:0; direction:rtl;
}
.cbt-btn {
  flex:1; min-height:58px; padding:8px 6px;
  border-radius:16px; border:none;
  font-family:'Cairo',sans-serif; font-size:17px; font-weight:900;
  cursor:pointer; color:#fff;
  display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px;
  transition:filter .14s, transform .1s;
}
.cbt-btn:active { transform:scale(.93); }
.cbt-buy  { background:linear-gradient(150deg,#2da44e,#1a7f37); box-shadow:0 4px 14px rgba(45,164,78,.35); }
.cbt-sell { background:linear-gradient(150deg,#e5534b,#a0281e); box-shadow:0 4px 14px rgba(229,83,75,.35); }
.cbt-btn:hover { filter:brightness(1.1); }
.cbt-dir { font-size:18px; line-height:1; }
.cbt-px  { font-family:'IBM Plex Mono',monospace; font-size:10px; opacity:.75; }

/* حقل الكمية — في المنتصف بضبط */
.cbt-mid {
  display:flex; flex-direction:column; align-items:center; justify-content: center; gap:3px;
  flex:1.2;
}
.cbt-qty-lbl { font-size:9px; color:var(--text-muted); font-weight:700; letter-spacing:1px; text-transform:uppercase; }
.cbt-qty-row { display:flex; align-items:center; justify-content: center; gap:4px; width:100%; }
.cbt-qty-in {
  width: 80px; font-family:'IBM Plex Mono',monospace;
  font-size:20px; font-weight:700; text-align:center;
  direction:ltr; background:var(--bg-input);
  border:2px solid var(--ac-dim); border-radius:12px;
  padding:7px 6px; color:var(--text-primary); outline:none;
  transition:border-color .15s;
}
.cbt-qty-in:focus { border-color:var(--ac); }
.cbt-qty-unit { font-size:9px; color:var(--text-secondary); font-weight:700; white-space:nowrap; }
.cbt-presets { display:flex; gap:3px; justify-content:center; }
.cbt-preset {
  font-family:'IBM Plex Mono',monospace; font-size:9px; font-weight:700;
  padding:3px 7px; border-radius:999px;
  border:1.5px solid var(--border); background:var(--bg-elev);
  color:var(--text-muted); cursor:pointer; transition:all .12s;
}
.cbt-preset.active,
.cbt-preset:hover { border-color:var(--ac); color:var(--ac); background:var(--ac-dim); }

/* ── Wrap + Inner ── */
.c-wrap {
  position:relative; flex:1; min-height:0;
  display:flex; flex-direction:column;
}
.c-inner {
  flex:1; min-height:0; width:100%;
  touch-action:none;
  -webkit-user-select:none; user-select:none;
  overflow:hidden;
}

/* ── Legend OHLC ── */
.c-legend {
  padding:4px 12px; background:var(--bg-card);
  border-top:1px solid var(--border);
  font-family:'IBM Plex Mono',monospace;
  font-size:10px; color:var(--text-muted);
  display:flex; gap:10px; flex-wrap:wrap;
  flex-shrink:0; min-height:22px; align-items:center;
}

/* ── Confirmation overlay ── */
.cf-ov {
  position:absolute; inset:0; z-index:95;
  display:flex; align-items:flex-end; justify-content:center;
  background:rgba(0,0,0,.62);
  backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px);
  animation:cfFi .17s ease; direction:rtl;
}
@keyframes cfFi { from{opacity:0} to{opacity:1} }
.cf-card {
  background:var(--bg-card); border-top:2px solid var(--border-strong);
  border-radius:24px 24px 0 0; width:100%; max-width:480px;
  padding:16px 16px 22px;
  box-shadow:0 -10px 36px rgba(0,0,0,.4);
  animation:cfSu .23s cubic-bezier(.4,0,.2,1);
  overflow:hidden;
}
@keyframes cfSu { from{transform:translateY(100%)} to{transform:none} }
.cf-hdl { width:34px;height:4px;background:var(--border-strong);border-radius:999px;margin:0 auto 13px; }
.cf-title { font-size:17px;font-weight:900;margin-bottom:3px; }
.cf-sub   { font-size:11px;color:var(--text-secondary);margin-bottom:12px; }
.cf-rows  {
  background:var(--bg-input);border-radius:14px;
  padding:10px 12px;display:flex;flex-direction:column;gap:5px;margin-bottom:12px;
}
.cf-row { display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--border); }
.cf-row:last-child { border:none; }
.cf-key { font-size:11px;color:var(--text-secondary);font-weight:600; }
.cf-val { font-family:'IBM Plex Mono',monospace;font-size:13px;font-weight:700; }
.cf-val.g { color:#2da44e; }
.cf-val.r { color:#e5534b; }
.cf-val.w { color:var(--warn); }
.cf-btns { display:grid;grid-template-columns:1fr 1fr;gap:8px; }
.cf-cancel {
  padding:12px; border-radius:999px;
  border:1.5px solid var(--border-strong); background:var(--bg-elev);
  color:var(--text-secondary); font-size:13px; font-weight:700;
  cursor:pointer; font-family:'Cairo',sans-serif;
}
.cf-cancel:active { transform:scale(.96); }
.cf-exec {
  padding:12px; border-radius:999px; border:none; color:#fff;
  font-size:13px; font-weight:900; cursor:pointer;
  font-family:'Cairo',sans-serif;
  display:flex; align-items:center; justify-content:center; gap:6px;
  transition:filter .14s;
}
.cf-exec.g { background:linear-gradient(135deg,#2da44e,#1a7f37); box-shadow:0 3px 12px rgba(45,164,78,.3); }
.cf-exec.r { background:linear-gradient(135deg,#e5534b,#a0281e); box-shadow:0 3px 12px rgba(229,83,75,.3); }
.cf-exec:active { filter:brightness(.88); }
.cf-exec:disabled { opacity:.5; pointer-events:none; }
.cf-spin { width:15px;height:15px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:cfR .7s linear infinite; }
@keyframes cfR { to{transform:rotate(360deg)} }
`;
    document.head.appendChild(s);
  })();

  /* ════════════
     مساعدات
  ════════════ */
  const coin = s => {
    if(typeof ASSETS!=='undefined'&&ASSETS[s]?.coin) return ASSETS[s].coin;
    return `xyz:${s}`;
  };
  const ai   = s => (typeof ASSETS!=='undefined'&&ASSETS[s])||{pxDp:2,szDp:2,name:s,icon:'📊',unit:'',lev:10,presets:[1],idx:0,cross:true};
  const setStatus = t => { const e=document.getElementById('_cWs'); if(e) e.textContent=t; };
  const isDark = () => window.matchMedia('(prefers-color-scheme:dark)').matches;
  const fp = (n,s) => (+n).toFixed(ai(s||_sym).pxDp);
  const fs = (n,s) => (+n).toFixed(ai(s||_sym).szDp);

  function setPrice(p) {
    _lastClose = +p;
    const e = document.getElementById('_cPrice');
    if (e && p) e.textContent = '$' + (+p).toFixed(ai(_sym).pxDp);
    updateBtnPx();
  }

  /* ════════════
     ساعة UTC+3
  ════════════ */
  function getIvMs(iv) {
    const n = parseInt(iv);
    if (iv.endsWith('m')) return n * 60 * 1000;
    if (iv.endsWith('h')) return n * 60 * 60 * 1000;
    if (iv.endsWith('d')) return n * 24 * 60 * 60 * 1000;
    return 60 * 1000;
  }

  let _dayTimer = null; // تحديث H/L/% كل 5 ثوانٍ

  function startClock() {
    stopClock();
    const tick = () => {
      // UTC + 3 hours
      const now = new Date(Date.now() + 3 * 3600 * 1000);
      const timeStr = now.toLocaleTimeString('en-US', {
        hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC'
      });
      const t = document.getElementById('_cClockT');
      if (t) t.textContent = timeStr;

      // Countdown
      const ivMs = getIvMs(_interval);
      const nowMs = Date.now();
      const diff = Math.ceil(nowMs / ivMs) * ivMs - nowMs;
      const cdH = Math.floor(diff / 3600000);
      const cdM = Math.floor((diff % 3600000) / 60000);
      const cdS = Math.floor((diff % 60000) / 1000);
      let cdStr = cdH > 0 ? `${cdH}:` : '';
      cdStr += `${String(cdM).padStart(2,'0')}:${String(cdS).padStart(2,'0')}`;
      const cdEl = document.getElementById('_cCountdown');
      if (cdEl) cdEl.textContent = cdStr;
    };
    tick();
    _clockTimer = setInterval(tick, 1000);

    // تحديث H/L/% كل 5 ثوانٍ تلقائياً
    if (_dayTimer) clearInterval(_dayTimer);
    _dayTimer = setInterval(() => { drawDayStats(); }, 5000);
  }

  function stopClock() {
    clearInterval(_clockTimer); _clockTimer = null;
    clearInterval(_dayTimer);   _dayTimer   = null;
  }

  function blockGestures(el) {
    if (_gestInit) return; _gestInit = true;
    ['gesturestart','gesturechange','gestureend'].forEach(ev =>
      el.addEventListener(ev, e => e.preventDefault(), {passive:false})
    );
    el.addEventListener('wheel', e => { if(e.ctrlKey) e.preventDefault(); }, {passive:false});
  }
  let _gestInit = false;

  function toggleFullscreen() {
    const el = document.getElementById('chartScreen');
    if (!document.fullscreenElement) {
      el.requestFullscreen?.() || el.webkitRequestFullscreen?.() || el.mozRequestFullScreen?.();
    } else {
      document.exitFullscreen?.() || document.webkitExitFullscreen?.() || document.mozCancelFullScreen?.();
    }
  }

  /* ════════════
     Trade Bar
  ════════════ */
  function buildTradeBar(wrap) {
    document.getElementById('_cTrade')?.remove();
    const a  = ai(_sym);
    const ps = (a.presets||[]).slice(0,3);
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
        bar.querySelectorAll('.cbt-preset').forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
        document.getElementById('_cQty').value = b.dataset.v;
      };
    });
    document.getElementById('_cQty').oninput = () =>
      bar.querySelectorAll('.cbt-preset').forEach(x=>x.classList.remove('active'));
    document.getElementById('_cBuy').onclick  = () => showCf(true);
    document.getElementById('_cSell').onclick = () => showCf(false);
    updateBtnPx();
  }

  function updateBtnPx() {
    if (!_lastClose) return;
    const a = ai(_sym);
    const bp=document.getElementById('_cBuyPx'), sp=document.getElementById('_cSellPx');
    if (bp) bp.textContent = '$'+(_lastClose*1.0005).toFixed(a.pxDp);
    if (sp) sp.textContent = '$'+(_lastClose*0.9995).toFixed(a.pxDp);
  }

  /* ════════════
     Confirmation
  ════════════ */
  function showCf(isBuy) {
    if (typeof State==='undefined'||!State.wallet)
      return typeof toast!=='undefined'?toast('سجّل الدخول أولاً','err'):null;
    const qty = parseFloat(document.getElementById('_cQty')?.value||0);
    if (!qty||qty<=0) return typeof toast!=='undefined'?toast('أدخل الكمية','err'):null;
    const a   = ai(_sym);
    const TROY_LOCAL = 31.1035;
    const isGram = _sym === 'XAU';
    // midDisp = سعر العرض (غرام أو أونصة)
    const midDisp = _lastClose||(typeof State!=='undefined'?State.prices[_sym]?.mid:0);
    if (!midDisp) return typeof toast!=='undefined'?toast('لا يوجد سعر','err'):null;
    // midOz = سعر الأونصة للحسابات الصحيحة
    const midOz = isGram ? midDisp * TROY_LOCAL : midDisp;
    // qtyOz = كمية الأونصات للحسابات
    const qtyOz = isGram ? qty / TROY_LOCAL : qty;
    const usd = (midOz * qtyOz).toFixed(2);
    const mgn = (midOz * qtyOz / a.lev).toFixed(2);
    // سعر التصفية بوحدة العرض (غرام أو أونصة)
    const liqOz = isBuy ? midOz*(1-1/a.lev) : midOz*(1+1/a.lev);
    const liqDisp = isGram ? (liqOz/TROY_LOCAL).toFixed(a.pxDp) : liqOz.toFixed(a.pxDp);
    const mid = midDisp; // للاستخدام في fp()
    hideCf();
    const wrap=document.getElementById('_cWrap');
    if (!wrap) return;
    const ov=document.createElement('div');
    ov.id='_cfOv'; ov.className='cf-ov';
    ov.innerHTML=`
      <div class="cf-card">
        <div class="cf-hdl"></div>
        <div class="cf-title" style="color:${isBuy?'#2da44e':'#e5534b'}">${a.icon} ${isBuy?'شراء ▲':'بيع ▼'} — ${a.name}</div>
        <div class="cf-sub">رافعة ${a.lev}x · تأكيد قبل التنفيذ</div>
        <div class="cf-rows">
          <div class="cf-row"><span class="cf-key">الكمية</span><span class="cf-val">${fs(qty)} ${a.unit}</span></div>
          <div class="cf-row"><span class="cf-key">السعر</span><span class="cf-val">${fp(mid)} $</span></div>
          <div class="cf-row"><span class="cf-key">القيمة</span><span class="cf-val">≈ $${usd}</span></div>
          <div class="cf-row"><span class="cf-key">الهامش</span><span class="cf-val w">≈ $${mgn}</span></div>
          <div class="cf-row"><span class="cf-key">التصفية</span><span class="cf-val ${isBuy?'r':'g'}">≈ ${liqDisp} $</span></div>
        </div>
        <div class="cf-btns">
          <button class="cf-cancel" id="_cfC">إلغاء ✕</button>
          <button class="cf-exec ${isBuy?'g':'r'}" id="_cfX">${isBuy?'✅ تأكيد الشراء':'✅ تأكيد البيع'}</button>
        </div>
      </div>`;
    wrap.appendChild(ov);
    ov.onclick = e => { if(e.target===ov) hideCf(); };
    document.getElementById('_cfC').onclick = hideCf;
    document.getElementById('_cfX').onclick = () => {
      if (typeof requirePin !== 'undefined') {
        requirePin(() => execTrade(isBuy, qty));
      } else {
        execTrade(isBuy, qty);
      }
    };
  }

  function hideCf() { document.getElementById('_cfOv')?.remove(); }

  async function execTrade(isBuy, qty) {
    if (typeof State==='undefined'||!State.wallet) return;
    const btn=document.getElementById('_cfX');
    if (btn) { btn.disabled=true; btn.innerHTML='<span class="cf-spin"></span>'; }
    const TROY_LOCAL = 31.1035;
    const isGram = _sym === 'XAU';
    // a: للـ API نستخدم GOLD (أونصة) لأن idx و szDp صحيحان
    const a = isGram ? (typeof ASSETS!=='undefined'?ASSETS['GOLD']:ai(_sym)) : ai(_sym);
    // mid: سعر الغرام (_lastClose) → نضرب × TROY للحصول على سعر الأونصة للـ API
    const midGram = _lastClose||(typeof State!=='undefined'?State.prices['XAU']?.mid:0);
    const midOz   = isGram ? midGram*TROY_LOCAL : (_lastClose||(typeof State!=='undefined'?State.prices[_sym]?.mid:0));
    if (!midOz) { hideCf(); return; }
    // qty: المستخدم يدخل غرامات → نحول لأونصات للـ API
    const qtyOz = isGram ? qty/TROY_LOCAL : qty;
    try {
      try { await hlExchange({type:'updateLeverage',asset:a.idx,isCross:a.cross,leverage:a.lev}); } catch{}
      await hlExchange({
        type:'order',
        orders:[{a:a.idx,b:isBuy,p:wirePx(midOz*(isBuy?1.02:0.98),a.szDp),s:wireSz(qtyOz,a.szDp),r:false,t:{limit:{tif:'Ioc'}}}],
        grouping:'na'
      });
      hideCf();
      const dispSz = isGram ? qty.toFixed(2)+' غرام' : fs(qty)+' '+(a.unit||'');
      if(typeof toast!=='undefined') toast(`✅ ${a.icon} ${isBuy?'شراء':'بيع'} ${dispSz}`,'ok',4000);
      if(typeof pollAccount!=='undefined') setTimeout(pollAccount,2000);
    } catch(e) {
      if(typeof toast!=='undefined') toast((typeof tradeErr!=='undefined'?tradeErr(e.message):'❌ '+e.message.slice(0,100)),'err',5000);
      if(btn){ btn.disabled=false; btn.innerHTML=isBuy?'✅ تأكيد الشراء':'✅ تأكيد البيع'; }
    }
  }

  /* ════════════
     يوم السوق — افتتاح 1 AM UTC+3 يومياً
  ════════════ */
  function getSessionStartSec() {
    // 1 AM UTC+3 = 22:00 UTC اليوم السابق في التقويم الميلادي
    const nowUTC3ms = Date.now() + UTC3 * 1000;
    const d = new Date(nowUTC3ms);
    // منتصف الليل UTC+3 اليوم + 1 ساعة = 1 AM UTC+3
    const midnightUTC3 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    return Math.floor((midnightUTC3 + 3600_000) / 1000) - UTC3; // نحوّل لـ UTC ثانية
  }

  function computeDayStats() {
    const start = getSessionStartSec();
    const sc = _candles.filter(c => c.time >= start);
    if (!sc.length) return null;
    const open = sc[0].open;
    const high = Math.max(...sc.map(c => c.high));
    const low  = Math.min(...sc.map(c => c.low));
    const cur  = _lastClose || sc[sc.length - 1].close;
    const pct  = ((cur - open) / open * 100);
    return { open, high, low, cur, pct };
  }

  function drawDayStats() {
    if (!_series) return;
    // مسح الخطوط القديمة
    if (_dayHiLine) { try { _series.removePriceLine(_dayHiLine); } catch {} _dayHiLine = null; }
    if (_dayLoLine) { try { _series.removePriceLine(_dayLoLine); } catch {} _dayLoLine = null; }

    const st = computeDayStats();
    const el = document.getElementById('_cDayStat');
    if (!st) { if (el) el.textContent = ''; return; }

    const dp  = ai(_sym).pxDp;
    const pct = st.pct.toFixed(2);
    const up  = st.pct >= 0;

    // لا خطوط على الرسم — فقط علامات نصية في الشريط السفلي
    if (el) {
      el.innerHTML =
        `<span style="color:var(--text-muted);font-size:9px;font-family:monospace;">12AM+3</span>` +
        `<span style="color:#26a69a;font-size:11px;font-weight:700;font-family:monospace;">▲ ${st.high.toFixed(dp)}</span>` +
        `<span style="color:#ef5350;font-size:11px;font-weight:700;font-family:monospace;">▼ ${st.low.toFixed(dp)}</span>` +
        `<span style="color:${up?'#26a69a':'#ef5350'};font-size:13px;font-weight:900;font-family:monospace;">${up?'+':''}${pct}%</span>`;
    }
  }

  /* ════════════
     بناء الرسم
  ════════════ */
  function buildChart(container) {
    if (_chart) { try{_chart.remove();}catch{} _chart=null; _series=null; }
    if (_resizeObs) { try{_resizeObs.disconnect();}catch{} }
    const dark = isDark();

    const BG   = dark ? '#131722' : '#ffffff';
    const TXT  = dark ? '#b2b5be' : '#131722';
    const GRID = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)';
    const BDR  = dark ? '#2a2e39' : '#e0e3eb';

    // مساعد UTC+3 للمحور
    const fmt3 = (tick, showDate) => {
      const d = new Date((tick + UTC3) * 1000);
      if (showDate) {
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return `${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
      }
      const hh = d.getUTCHours(), mm = d.getUTCMinutes();
      const ap = hh >= 12 ? 'PM' : 'AM';
      const h12 = hh % 12 || 12;
      return `${String(h12).padStart(2,'0')}:${String(mm).padStart(2,'0')} ${ap}`;
    };

    _chart = LightweightCharts.createChart(container, {
      width:  container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: 'solid', color: BG },
        textColor: TXT, fontSize: 11,
        fontFamily: "'IBM Plex Mono',monospace",
      },
      grid: {
        vertLines: { color: GRID, style: LightweightCharts.LineStyle.Solid },
        horzLines: { color: GRID, style: LightweightCharts.LineStyle.Solid },
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: {
          width: 1,
          color: dark ? 'rgba(197,200,207,0.5)' : 'rgba(19,23,34,0.4)',
          style: LightweightCharts.LineStyle.Dashed,
          labelBackgroundColor: dark ? '#363a45' : '#9598a1',
        },
        horzLine: {
          width: 1,
          color: dark ? 'rgba(197,200,207,0.5)' : 'rgba(19,23,34,0.4)',
          style: LightweightCharts.LineStyle.Dashed,
          labelBackgroundColor: dark ? '#363a45' : '#9598a1',
        },
      },
      rightPriceScale: {
        borderColor: BDR,
        scaleMargins: { top: 0.06, bottom: 0.06 }, // بلا حجم — شموع تملأ الشاشة
        minimumWidth: 80,
        borderVisible: true,
      },
      timeScale: {
        borderColor: BDR,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 8,
        barSpacing: IV_SPACING[_interval] || 7,
        minBarSpacing: 2,
        lockVisibleTimeRangeOnResize: false,
        fixLeftEdge: true,
        borderVisible: true,
        // ✅ هذا هو الإصلاح الحقيقي لمحور الأسفل — tickMarkFormatter
        tickMarkFormatter: (tick, type) => {
          // type: 0=Year 1=Month 2=Day 3=Time 4=TimeWithSeconds
          if (type >= 3) return fmt3(tick, false);          // وقت AM/PM UTC+3
          if (type === 2) return fmt3(tick, true);           // يوم+شهر
          if (type === 1) {
            const d = new Date((tick + UTC3) * 1000);
            return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()];
          }
          return new Date((tick + UTC3) * 1000).getUTCFullYear().toString();
        },
      },
      handleScroll: {
        mouseWheel: true, pressedMouseMove: true,
        horzTouchDrag: true, vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: true, pinch: true,
        axisPressedMouseMove: { time: true, price: false },
      },
      localization: {
        locale: 'en-US',
        priceFormatter: p => p.toLocaleString('en-US', {
          minimumFractionDigits: ai(_sym).pxDp,
          maximumFractionDigits: ai(_sym).pxDp,
        }),
        // crosshair label UTC+3
        timeFormatter: (tick) => fmt3(tick, false),
      },
      attributionLogo: false,
    });

    // Candlestick — TradingView classic
    _series = _chart.addCandlestickSeries({
      upColor:         '#26a69a',
      downColor:       '#ef5350',
      borderUpColor:   '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor:     '#26a69a',
      wickDownColor:   '#ef5350',
      borderVisible:   true,
      wickVisible:     true,
    });

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
      el.innerHTML =
        `<span style="color:var(--text-muted);font-size:9px;">${fmt3(param.time,false)} +3</span>` +
        `<span style="color:${cl};font-weight:900">O&nbsp;${bar.open.toFixed(dp)}</span>` +
        `<span style="color:${cl}">H&nbsp;${bar.high.toFixed(dp)}</span>` +
        `<span style="color:${cl}">L&nbsp;${bar.low.toFixed(dp)}</span>` +
        `<span style="color:${cl}">C&nbsp;${bar.close.toFixed(dp)}</span>` +
        `<span style="color:${cl}">${chg > 0 ? '+' : ''}${chg}%</span>`;
    });

    _resizeObs = new ResizeObserver(() => {
      if (_chart && container)
        _chart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
    });
    _resizeObs.observe(container);
  }

  async function fetchCandles(sym, iv) {
    const now=Date.now(), start=now-(RANGES[iv]||RANGES['1h']);
    // ✅ XAU (غرام ذهب): نقسم أسعار الشموع على TROY لعرض سعر الغرام
    const TROY_LOCAL = 31.1035;
    const isGram = sym === 'XAU';
    try {
      const r=await fetch(HL_API+'/info',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({type:'candleSnapshot',req:{coin:coin(sym),interval:iv,startTime:start,endTime:now}})});
      const raw=await r.json();
      if(!Array.isArray(raw)||!raw.length) return [];
      return raw.map(c=>({
        time: Math.floor(c.t/1000),
        open: isGram ? +c.o/TROY_LOCAL : +c.o,
        high: isGram ? +c.h/TROY_LOCAL : +c.h,
        low:  isGram ? +c.l/TROY_LOCAL : +c.l,
        close:isGram ? +c.c/TROY_LOCAL : +c.c,
      })).sort((a,b)=>a.time-b.time);
    } catch(e){console.warn('[Chart]',e.message);return [];}
  }

  function clearLines(){
    _entryLines.forEach(l=>{try{_series.removePriceLine(l);}catch{}}); _entryLines=[];
    if(_tpLine) {try{_series.removePriceLine(_tpLine);}catch{} _tpLine=null;}
    if(_slLine) {try{_series.removePriceLine(_slLine);}catch{} _slLine=null;}
    if(_liqLine){try{_series.removePriceLine(_liqLine);}catch{} _liqLine=null;}
  }
  function drawLines(){
    if(!_series||typeof State==='undefined') return;
    clearLines();
    const TROY_LOCAL = 31.1035;
    for(const p of (State.positions||[])){
      const rawCoin = p.position.coin.includes(':') ? p.position.coin.split(':')[1] : p.position.coin;
      // ✅ إصلاح: GOLD في الـ API = XAU في الـ UI — يجب مطابقتهما
      const posSym = rawCoin === 'GOLD' ? 'XAU' : rawCoin;
      if(posSym !== _sym) continue;

      const pos = p.position;
      const sziOz = +pos.szi;
      const isGram = _sym === 'XAU';
      // entryPx من API بالأونصة دائماً → للرسم نقسم على TROY إذا غرام
      const entryOz = +(pos.entryPx||0);
      const entryDisp = isGram ? entryOz/TROY_LOCAL : entryOz;
      // curPx: _lastClose هو بالغرام (لأن chart يعرض غرام) — للحساب بالأونصة نضرب
      const curDisp = _lastClose || (isGram ? (typeof State!=='undefined'?State.prices['XAU']?.mid:0) : (typeof State!=='undefined'?State.prices[_sym]?.mid:0)) || entryDisp;
      const curOz = isGram ? curDisp * TROY_LOCAL : curDisp;
      const pnl = (curOz - entryOz) * sziOz;

      if(entryDisp > 0){
        const sign = pnl >= 0 ? '+' : '';
        _entryLines.push(_series.createPriceLine({
          price: entryDisp, lineWidth:2, lineStyle:2,
          color: pnl>=0 ? '#2da44e' : '#e5534b', axisLabelVisible:true,
          title: `${sziOz>0?'▲':'▼'} Entry  ${sign}$${Math.abs(pnl).toFixed(2)}`,
        }));
      }
      const ts = p.tpsl||{};
      if(ts.tp){
        const tpDisp = isGram ? ts.tp/TROY_LOCAL : ts.tp;
        const tpPnl  = Math.abs(sziOz) * Math.abs(ts.tp - entryOz);
        _tpLine = _series.createPriceLine({
          price:tpDisp, lineWidth:2, lineStyle:2, color:'#22c58b', axisLabelVisible:true,
          title:`🎯 TP (+$${tpPnl.toFixed(2)})`
        });
      }
      if(ts.sl){
        const slDisp = isGram ? ts.sl/TROY_LOCAL : ts.sl;
        const slPnl  = Math.abs(sziOz) * Math.abs(ts.sl - entryOz);
        _slLine = _series.createPriceLine({
          price:slDisp, lineWidth:2, lineStyle:2, color:'#e8804a', axisLabelVisible:true,
          title:`🛡 SL (-$${slPnl.toFixed(2)})`
        });
      }
      // ✅ خط التصفية — بصيغة Hyperliquid الرسمية
      if(typeof calcLiqPrice !== 'undefined' && typeof ASSETS !== 'undefined'){
        const symForLiq = posSym; // 'XAU', 'CL', etc
        const aLiq = ASSETS[symForLiq]||ASSETS['GOLD']||{lev:20,cross:false};
        const bal  = (typeof State!=='undefined'&&State.balance?.total)||0;
        const liqOz = calcLiqPrice(entryOz, sziOz, bal, aLiq.cross, aLiq.lev);
        if(liqOz!==null && liqOz > 0){
          const liqDisp = isGram ? liqOz/TROY_LOCAL : liqOz;
          _liqLine = _series.createPriceLine({
            price:       liqDisp,
            lineWidth:   2,
            lineStyle:   LightweightCharts.LineStyle.Dotted,
            color:       '#ff6b35',
            axisLabelVisible: true,
            title:       `⚡ Liq ~$${liqDisp.toFixed(2)}`,
          });
        }
      }
      break;
    }
  }

  function wsConnect(){
    wsClose(); clearTimeout(_wsTimer);
    const TROY_LOCAL = 31.1035;
    try{
      _ws=new WebSocket(HL_WS);
      _ws.onopen=()=>{ _ws.send(JSON.stringify({method:'subscribe',subscription:{type:'candle',coin:coin(_sym),interval:_interval}})); setStatus('🟢'); };
      _ws.onmessage=e=>{
        try{
          const msg=JSON.parse(e.data);
          if(msg.channel!=='candle'||!msg.data||!_series) return;
          const c=msg.data;
          const isGram=_sym==='XAU';
          // ✅ XAU: قسمة على TROY لعرض سعر الغرام في الرسم البياني
          const bar={
            time:Math.floor(c.t/1000),
            open: isGram?+c.o/TROY_LOCAL:+c.o,
            high: isGram?+c.h/TROY_LOCAL:+c.h,
            low:  isGram?+c.l/TROY_LOCAL:+c.l,
            close:isGram?+c.c/TROY_LOCAL:+c.c,
          };
          _series.update(bar);
          if (_candles.length && _candles[_candles.length-1].time === bar.time) {
            _candles[_candles.length-1] = bar;
          } else if (_candles.length && bar.time > _candles[_candles.length-1].time) {
            _candles.push(bar);
          }
          setPrice(bar.close); // سعر الغرام مباشرة
          drawLines();
          drawDayStats();
        }catch{}
      };
      _ws.onerror=()=>setStatus('🔴');
      _ws.onclose=()=>{ setStatus('🔴'); if(_visible) _wsTimer=setTimeout(wsConnect,4000); };
    }catch(e){console.warn('[WS]',e.message);}
  }
  function wsClose(){ if(_ws){try{_ws.close();}catch{} _ws=null;} clearTimeout(_wsTimer); }

  async function load(sym, iv){
    if(!_chart||!_series) return;
    setStatus('⏳');
    const px=document.getElementById('_cPrice'); if(px) px.textContent='—';
    const candles=await fetchCandles(sym,iv);
    if(!candles.length){setStatus('❌');return;}

    _candles = candles; // cache للـ day stats
    _series.setData(candles);

    // barSpacing ديناميكي + scroll للنهاية
    _chart.timeScale().applyOptions({ barSpacing: IV_SPACING[iv] || 7 });
    _chart.timeScale().scrollToRealTime();

    _lastClose=candles[candles.length-1].close;
    setPrice(_lastClose);
    drawLines();
    drawDayStats();
    setStatus('🟡');
    wsConnect();
  }

  function ensureScreen(){
    const screen=document.getElementById('chartScreen');
    if(!screen||document.getElementById('_cWrap')) return;
    screen.innerHTML=`
      <div class="c-nav">
        <div class="c-nav-row">
          <div class="c-nav-group">
            <button class="c-back" id="_cBack">← رجوع</button>
            <div class="c-asset-info">
              <span id="_cIcon" class="c-asset-icon">🛢</span>
              <span id="_cName" class="c-asset-name">نفط خام</span>
              <span id="_cPrice" class="c-cur-price">—</span>
            </div>
          </div>
          <div class="c-nav-group">
            <button class="c-fs-btn" id="_cLock" style="border:none; background:none; font-size:16px;">🔒</button>
            <button class="c-fs-btn" id="_cFs">⛶</button>
            <span class="c-ws" id="_cWs">⏳</span>
          </div>
        </div>
        
        <div class="c-nav-row">
          <div class="c-intervals" style="margin:0; flex:1; justify-content:flex-start;">
            <button class="iv-btn" data-iv="1m">1m</button>
            <button class="iv-btn" data-iv="5m">5m</button>
            <button class="iv-btn" data-iv="15m">15m</button>
            <button class="iv-btn" data-iv="1h">1H</button>
            <button class="iv-btn" data-iv="4h">4H</button>
            <button class="iv-btn" data-iv="1d">1D</button>
          </div>
          <div class="c-clock" style="margin:0; display:flex; align-items:center; gap:8px;">
            <span id="_cCountdown" style="color:var(--ac); font-weight:700; font-size:12px; font-family:monospace; min-width:45px; text-align:left;">—</span>
            <span class="c-clock-time" id="_cClockT" style="font-size:12px; opacity:.8;">—</span>
          </div>
        </div>
      </div>
      <div class="c-wrap" id="_cWrap">
        <div class="c-inner" id="_cInner"></div>
        <div id="_cDayStat" style="
          display:flex; align-items:center; gap:8px; flex-wrap:wrap;
          padding:3px 10px; background:var(--bg-card);
          border-top:1px solid var(--border); flex-shrink:0;
          font-family:'IBM Plex Mono',monospace;
        "></div>
        <div class="c-legend" id="_cLegend"></div>
      </div>`;
    document.getElementById('_cBack').onclick=()=>ChartModule.close();
    document.getElementById('_cFs').onclick=toggleFullscreen;
    document.getElementById('_cLock').onclick=()=>{
      if(typeof lockApp === 'function') {
        lockApp();
      } else {
        if(typeof State!=='undefined') State.lastPinTime = 0;
        if(typeof toast!=='undefined') toast('تم قفل التطبيق يدوياً 🔒', 'info');
      }
    };
    document.querySelectorAll('.iv-btn').forEach(b=>b.onclick=()=>ChartModule.switchInterval(b.dataset.iv));
  }

  function setHeader(sym){
    const a=ai(sym);
    const ic=document.getElementById('_cIcon'), nm=document.getElementById('_cName');
    if(ic) ic.textContent=a.icon;
    if(nm) nm.textContent=a.name;
  }

  function open(sym){
    _sym=sym||(typeof State!=='undefined'?State.asset:'CL');
    _visible=true;
    ensureScreen();
    const screen=document.getElementById('chartScreen');
    screen?.classList.remove('hidden');
    setHeader(_sym);
    document.querySelectorAll('.iv-btn').forEach(b=>b.classList.toggle('active',b.dataset.iv===_interval));
    const wrap=document.getElementById('_cWrap');
    if(wrap) buildTradeBar(wrap);
    const inner=document.getElementById('_cInner');
    if(inner){ blockGestures(inner); buildChart(inner); load(_sym,_interval); }
    startClock();
  }

  function close(){
    _visible=false;
    wsClose(); hideCf(); stopClock();
    if (document.fullscreenElement) document.exitFullscreen?.();
    document.getElementById('chartScreen')?.classList.add('hidden');
    const lg=document.getElementById('_cLegend'); if(lg) lg.innerHTML='';
    const ds=document.getElementById('_cDayStat'); if(ds) ds.innerHTML='';
    _dayHiLine=null; _dayLoLine=null; _liqLine=null; _candles=[];
  }

  function switchInterval(iv){
    if(iv===_interval) return;
    _interval=iv; wsClose();
    document.querySelectorAll('.iv-btn').forEach(b=>b.classList.toggle('active',b.dataset.iv===iv));
    load(_sym,_interval);
  }

  function switchAssetChart(sym){
    if(!_visible) return;
    if(sym===_sym) return;
    _sym=sym; setHeader(sym); wsClose();
    const wrap=document.getElementById('_cWrap');
    if(wrap) buildTradeBar(wrap);
    const inner=document.getElementById('_cInner');
    if(inner){ buildChart(inner); load(_sym,_interval); }
  }

  function refreshLines(){
    if(_visible&&_series) drawLines();
  }

  return {open,close,switchInterval,switchAssetChart,refreshLines};
})();
