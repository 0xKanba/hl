/* ═══════════════════════════════════════
   prices.js — أسعار السوق حيّة بالكامل عبر WS
   ✅ لا polling إطلاقاً — bbo + activeAssetCtx subscriptions
   ✅ يعمل لوضع الزائر ولوضع المتصل بنفس المسار
   ✅ جديد — بطاقات شاشة "الأسواق" تُحدَّث الآن من هنا مباشرة (نفس
      لحظة تحديث تابات الرئيسية بالضبط، بلا أي مؤقّت منفصل). كان
      app.js يستطلع State.prices/prevDayPx كل ثانية بمؤقّت مستقل —
      يعني تأخير محسوس حتى ثانية كاملة عن نفس السعر بتاب الرئيسية،
      ومصدرين يكتبان لنوعي عناصر مختلفة لكن من نفس الحالة (خطر تضارب
      مستقبلي). الآن _updateMarketCardPrice/_updateMarketCardChg
      يُستدعيان من نفس نقاط التحديث الحية أدناه — لا تأخير، لا تضارب.
═══════════════════════════════════════ */
'use strict';

let _priceUnsubs = [];
let _lastQuickSave = 0;
let _lastTimerMid  = null;

function _uniqueCoins() {
  const out = {};
  Object.keys(ASSETS).forEach(sym => {
    if (sym === 'XAU') return;
    const c = ASSETS[sym].coin;
    if (!out[c]) out[c] = sym;
  });
  return out;
}

/* ════ يُستدعى مرة واحدة عند إقلاع التطبيق (زائر أو متصل) ════ */
function initPriceFeeds() {
  teardownPriceFeeds();
  const coins = _uniqueCoins();

  Object.entries(coins).forEach(([coinStr, sym]) => {
    _priceUnsubs.push(HL.subscribe({ type: 'bbo', coin: coinStr }, data => {
      const bid = parseFloat(data.bbo?.[0]?.px || 0);
      const ask = parseFloat(data.bbo?.[1]?.px || 0);
      _applyPrice(sym, bid, ask);
    }));
    _priceUnsubs.push(HL.subscribe({ type: 'activeAssetCtx', coin: coinStr }, data => {
      _applyAssetCtx(sym, data.ctx || {});
    }));
  });

  /* لقطة فورية (WS post، REST fallback تلقائي عبر hlInfo) — تملأ prevDayPx/funding/OI
     فوراً بدل انتظار أول تحديث activeAssetCtx حي */
  hlInfo({ type: 'metaAndAssetCtxs', dex: HL_DEX }).then(xyz => {
    if (!Array.isArray(xyz) || !xyz[1]) return;
    xyz[0].universe.forEach((u, i) => {
      const r   = u.name.includes(':') ? u.name.split(':')[1] : u.name;
      const sym = COIN_TO_SYM[r] || r;
      if (ASSETS[sym] && xyz[1][i]) _applyAssetCtx(sym, xyz[1][i]);
    });
  }).catch(() => {});
}

function teardownPriceFeeds() {
  _priceUnsubs.forEach(u => { try { u(); } catch {} });
  _priceUnsubs = [];
}

function _applyPrice(sym, bid, ask) {
  const mid = (bid && ask) ? (bid + ask) / 2 : 0;
  if (!mid) return;

  if (sym === 'GOLD') {
    State.prices['GOLD'] = { bid, ask, mid };
    _updateTabText('GOLD', mid, ASSETS['GOLD'].pxDp);
    _updateMarketCardPrice('GOLD', mid);
    _updateMarketCardChg('GOLD');
    State.prevMid['GOLD'] = mid;
    if (State.asset === 'GOLD') updatePriceUI();

    const gm = mid / TROY;
    State.prices['XAU'] = { bid: bid / TROY, ask: ask / TROY, mid: gm };
    _updateTabText('XAU', gm, ASSETS['XAU'].pxDp);
    _updateMarketCardPrice('XAU', gm);
    _updateMarketCardChg('XAU');
    State.prevMid['XAU'] = gm;
    if (State.asset === 'XAU') updatePriceUI();
  } else {
    State.prices[sym] = { bid, ask, mid };
    _updateTabText(sym, mid, ASSETS[sym].pxDp);
    _updateMarketCardPrice(sym, mid);
    _updateMarketCardChg(sym);
    State.prevMid[sym] = mid;
    if (sym === State.asset) updatePriceUI();
  }
  _maybeSaveQuickState();
}

/* ════ PerpsAssetCtx حي: funding/openInterest/markPx/oraclePx/prevDayPx ════ */
function _applyAssetCtx(sym, ctx) {
  State.assetCtx[sym] = ctx;
  const prev = parseFloat(ctx.prevDayPx || 0);
  if (sym === 'GOLD') {
    if (prev) {
      State.prevDayPx['GOLD'] = prev;
      State.prevDayPx['XAU'] = prev / TROY;
      _updateMarketCardChg('GOLD');
      _updateMarketCardChg('XAU');
    }
  } else if (prev) {
    State.prevDayPx[sym] = prev;
    _updateMarketCardChg(sym);
  }
  if (sym === State.asset || (sym === 'GOLD' && State.asset === 'XAU')) updatePriceUI();
}

function _updateTabText(sym, mid, dp) {
  const el = $(`price${sym}`);
  if (el) el.textContent = fmt(mid, dp);
}

/* ════ بطاقات شاشة "الأسواق" — تحديث حي مباشر، بلا أي مؤقّت ════
   نفس دفعة WS التي تُحدِّث price${sym} أعلاه تكتب أيضاً لـ
   mktPrice${sym}/mktChg${sym} — لحظة واحدة، مصدر واحد، بلا تضارب. */
function _updateMarketCardPrice(sym, mid) {
  const el = $(`mktPrice${sym}`);
  if (el && mid) el.textContent = fmt(mid, ASSETS[sym].pxDp);
}
function _updateMarketCardChg(sym) {
  const el = $(`mktChg${sym}`);
  if (!el) return;
  const mid     = State.prices[sym]?.mid;
  const prevDay = State.prevDayPx[sym];
  if (!mid || !prevDay) return;
  const chg = ((mid - prevDay) / prevDay) * 100;
  el.textContent = `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`;
  el.className   = `market-card-chg ${chg > 0.005 ? 'up' : chg < -0.005 ? 'dn' : 'n'}`;
}

function _maybeSaveQuickState() {
  const now = Date.now();
  if (now - _lastQuickSave < 5000) return;
  _lastQuickSave = now;
  saveQuickState();
}

/* ════ تحديث واجهة السعر الرئيسي — بدون وميض ════ */
function updatePriceUI() {
  const a = ASSETS[State.asset];
  const p = State.prices[State.asset];
  if (!p || !p.mid) return;

  const prevVal = State.prevMid[State.asset];
  const dir     = p.mid > prevVal ? 1 : p.mid < prevVal ? -1 : 0;
  const valCls  = dir > 0 ? 'up' : dir < 0 ? 'dn' : 'n';

  const valEl = $('priceValue');
  if (valEl) {
    valEl.textContent = fmt(p.mid, a.pxDp);
    valEl.className   = `price-value ${valCls}`;
  }

  setTxt('buyPrice',  fmt(p.mid, a.pxDp));
  setTxt('sellPrice', fmt(p.mid, a.pxDp));

  const prevDay = State.prevDayPx[State.asset];
  if (prevDay > 0) {
    const chg = ((p.mid - prevDay) / prevDay) * 100;
    const deltaCls = chg > 0 ? 'up' : chg < 0 ? 'dn' : 'n';
    const deltaEl  = $('priceDelta');
    if (deltaEl) {
      deltaEl.textContent = `تغيير 24 ساعة: ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`;
      deltaEl.className   = `price-delta ${deltaCls}`;
    }
  }

  if (p.bid && p.ask)
    setTxt('priceBidAsk', `شراء ${fmt(p.bid, a.pxDp)} · بيع ${fmt(p.ask, a.pxDp)}`);

  State.prevMid[State.asset] = p.mid;
  updateSessionUI();

  /* ✅ إصلاح — عدّاد الثواني كان يُلغى ويُعاد إنشاؤه عند كل نبضة BBO
     (عدة مرات بالثانية)، أي اهتزاز مؤقّتات مستمر بلا فائدة. الآن يُعاد
     تشغيله فقط عند تغيّر السعر فعلياً. */
  if (_lastTimerMid !== p.mid) {
    _lastTimerMid = p.mid;
    let s = 1;
    clearInterval(State.priceTimer);
    setTxt('priceTimer', `↻ ${s}s`);
    State.priceTimer = setInterval(() => { s++; setTxt('priceTimer', `↻ ${s}s`); }, 1000);
  }

  if (typeof recalcTpPreview === 'function') recalcTpPreview();
  if (typeof recalcSlPreview === 'function') recalcSlPreview();
}
