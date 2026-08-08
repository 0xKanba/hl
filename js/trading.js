/* ═══════════════════════════════════════
   trading.js
   ✅ FIX (2026-08) — "التصفية التقريبية" كانت رقماً مجرداً بلا أي شرح
      داخل تأكيد الصفقة — أكثر مصطلح يربك مستخدماً جديداً كلياً يفتح
      أول صفقة رافعة مالية بحياته (يبدو تحذيرياً بلا توضيح "ليش" ولا
      "شو معناه"). أُضيف سطر توضيح واحد بلغة بسيطة تحت السطر مباشرة —
      بلا حذف أو تخفيف الرقم نفسه (معلومة مخاطرة حقيقية تحمي المستخدم،
      لا شيء يستحق الإخفاء لمجرد التبسيط).
═══════════════════════════════════════ */
'use strict';

/* ════ Open trade confirm ════ */
function askTrade(isBuy) {
  if (State.isGuest) return _promptConnect();
  const qty = parseFloat($('qtyInput').value || State.qty || 0);
  if (!qty || qty <= 0) return toast('أدخل الكمية أولاً', 'err');
  const a = ASSETS[State.asset], p = State.prices[State.asset];
  if (!p?.mid) return toast('لا يوجد سعر — السوق مغلق؟', 'err');

  const isGram   = !!a.gram;
  const ozQty    = isGram ? qty / TROY : qty;
  const dispQty  = isGram ? `${qty} غرام (≈ ${ozQty.toFixed(4)} أونصة)` : `${qty} ${a.unit}`;
  const tradeMid = isGram ? p.mid * TROY : p.mid;
  const usd      = (tradeMid * ozQty).toFixed(2);
  const mgn      = (tradeMid * ozQty / a.lev).toFixed(2);
  const fr       = feeRate(State.asset);
  const feeOpen  = (tradeMid * ozQty * fr).toFixed(4);
  const feeTot   = (tradeMid * ozQty * fr * 2).toFixed(4);
  const sziLiq   = isBuy ? ozQty : -ozQty;
  /* ✅ صفقة جديدة لم تُفتح بعد → ربحها/خسارتها العائم = صفر، والوسادة
     الكاملة المتاحة لها = رصيد الحساب + ربح/خسارة كل صفقة أخرى مفتوحة
     حالياً (راجع crossEquityExcluding بـutils.js وcalcLiqPrice بـ
     positions.js لسبب هذا التغيير). */
  const liqInfo  = liqPriceDisplay(State.asset, tradeMid, sziLiq, crossEquityExcluding(0));

  setTxt('confirmTitle',    `${a.icon} ${isBuy ? 'شراء ↑' : 'بيع ↓'} — ${a.name}`);
  setTxt('confirmSubtitle', `رافعة ${a.lev}x · تنفيذ فوري`);
  $('confirmDetails').innerHTML = `
    <div class="confirm-row"><span class="confirm-key">الكمية</span><span class="confirm-val">${dispQty}</span></div>
    <div class="confirm-row"><span class="confirm-key">سعر ${isGram?'الغرام':'الوحدة'}</span><span class="confirm-val">${fmt(p.mid,a.pxDp)} $</span></div>
    <div class="confirm-row"><span class="confirm-key">القيمة الكلية</span><span class="confirm-val">≈ $${usd}</span></div>
    <div class="confirm-row"><span class="confirm-key">الهامش المطلوب</span><span class="confirm-val warn">≈ $${mgn}</span></div>
    <div class="confirm-row"><span class="confirm-key">التصفية التقريبية</span><span class="confirm-val" style="color:var(--warn)">${liqInfo.text}</span></div>
    <div class="confirm-hint">⚡ لو وصل السعر لهذا الرقم، تُغلق الصفقة تلقائياً لحماية رصيدك من خسارة أكبر</div>
    <div class="confirm-row"><span class="confirm-key">رسوم الفتح</span><span class="confirm-val fee">$${feeOpen} (${feeRatePct(State.asset)})</span></div>
    <div class="confirm-row"><span class="confirm-key">إجمالي الرسوم</span><span class="confirm-val fee">≈ $${feeTot}</span></div>`;

  const btn = $('confirmExecute');
  btn.className = `btn-modal btn-confirm ${isBuy ? 'btn-success' : 'btn-danger'}`;
  btn.innerHTML = isBuy ? '✅ تأكيد الشراء' : '✅ تأكيد البيع';
  State.pendingTrade = { isBuy, qty, sym: State.asset };
  openModal('modalConfirm');
}

async function execTrade() {
  if (!State.pendingTrade) { closeModal('modalConfirm'); return; }
  const { isBuy, qty, sym } = State.pendingTrade;
  const a        = ASSETS[sym], p = State.prices[sym];
  const execQty  = a.gram ? +(qty / TROY).toFixed(4) : qty;
  const execMid  = a.gram ? p.mid * TROY : p.mid;
  const execSzDp = a.gram ? 4 : a.szDp;
  if (!p?.mid) { toast('لا يوجد سعر', 'err'); closeModal('modalConfirm'); return; }

  closeModal('modalConfirm');
  State.pendingTrade = null;
  toast(`⏳ ${a.icon} ${isBuy ? 'شراء' : 'بيع'} ${qty} ${a.unit}...`, 'info', 3000);
  cornerStatus(`⏳ جاري ${isBuy ? 'الشراء' : 'البيع'}...`);

  try {
    try { await hlExchange({ type: 'updateLeverage', asset: a.idx, isCross: a.cross, leverage: a.lev }); } catch {}

    const slip = 0.05;
    const res  = await hlExchange({
      type: 'order',
      orders: [{ a: a.idx, b: isBuy,
        p: wirePx(execMid * (isBuy ? 1 + slip : 1 - slip), execSzDp),
        s: wireSz(execQty, execSzDp),
        r: false, t: { limit: { tif: 'Ioc' } }
      }],
      grouping: 'na'
    });

    const status = res?.response?.data?.statuses?.[0];
    if (status?.error) throw new Error(status.error);

    if (status?.filled) {
      const f      = status.filled;
      const dispSz = a.gram ? (+f.totalSz * TROY).toFixed(2) : f.totalSz;
      const dispPx = (parseFloat(f.avgPx) / (a.gram ? TROY : 1)).toFixed(a.pxDp);
      toast(`✅ مُنفَّذ — ${a.icon} ${dispSz} ${a.unit} @ $${dispPx}`, 'ok', 5000);
      playFillSound();
    } else if (status?.resting) {
      toast(`⏳ أمر معلق — ${a.icon} ${qty} ${a.unit}`, 'info', 4000);
    } else {
      toast('⚠️ لم يُنفَّذ — حاول مجدداً', 'err', 4000);
    }

    hideCornerStatus();
    autoSetReferrer();
    _multiPoll();
  } catch (e) {
    hideCornerStatus();
    toast(tradeErr(e.message), 'err', 6000);
  }
}

/* ════ Background poll after trade ════ */
function _multiPoll() {
  setTimeout(async () => {
    if (!State.wallet) return;
    try {
      const chs = await hlInfo({
        type: 'clearinghouseState',
        user: State.wallet.address,
        dex: HL_DEX
      });

      const rawPos = (chs?.assetPositions || [])
        .filter(p => parseFloat(p.position?.szi || 0) !== 0);

      const inGuard =
        (Date.now() - (State._lastOptimisticClose || 0)) < 20000;

      if (!inGuard || rawPos.length || State.positions.length) {
        _applyPositions(rawPos);
      }
    } catch {}

    _refreshOpenOrders();
  }, 2500);
}

/* ════ Register a coin as optimistically closed ════
 *
 * ✅ FIX for ghost-position bug (Issue 2).
 *
 * When execClose() or execCloseAll() optimistically removes a position from
 * State.positions, it must also register the position's coin here so that
 * pollAccount() can filter it out of rawPos during the guard window.
 *
 * Without this registration, pollAccount() would see rawPos.length > 0 (API
 * hasn't settled the close yet) and re-add the position to State.positions
 * via _applyPositions(), making it reappear as a ghost.
 *
 * The coin is auto-expired from State._closedCoins after 25 seconds — just
 * beyond the 20-second guard window — so normal sync resumes cleanly.
 ════ */
function _registerClosedCoin(coin) {
  if (!coin) return;
  if (!State._closedCoins) State._closedCoins = [];
  if (!State._closedCoins.includes(coin)) {
    State._closedCoins.push(coin);
  }
  /* auto-expire after guard window + safety margin */
  setTimeout(() => {
    State._closedCoins = (State._closedCoins || []).filter(c => c !== coin);
  }, 25000);
}

/* ════ Close position ════ */
window.askClose = function (i) {
  if (State.isGuest) return _promptConnect();
  const p = State.positions[i]; if (!p) return;
  const pos      = p.position;
  const sziOz    = parseFloat(pos.szi);
  const sym      = shortCoinPos(pos.coin);
  const a        = ASSETS[sym] || { name: sym, unit: '', icon: '📊', pxDp: 2, szDp: 2 };
  const isGram   = !!a.gram;
  const pnl      = parseFloat(pos.unrealizedPnl || 0);
  const curPx    = State.prices[sym]?.mid || 0;
  const sziDisp  = isGram ? Math.abs(sziOz) * TROY : Math.abs(sziOz);
  const dp       = isGram ? 2 : a.szDp;
  const entryDisp = isGram ? parseFloat(pos.entryPx || 0) / TROY : parseFloat(pos.entryPx || 0);
  const isLong   = sziOz > 0;
  const closeFee = curPx
    ? (Math.abs(sziOz) * (isGram ? curPx * TROY : curPx) * feeRate(sym)).toFixed(4)
    : '—';

  setTxt('closeTitle', `${a.icon} إغلاق — ${a.name}`);
  $('closeDetails').innerHTML = `
    <div class="confirm-row"><span class="confirm-key">الاتجاه</span><span class="confirm-val ${isLong?'buy':'sell'}">${isLong?'▲ شراء':'▼ بيع'}</span></div>
    <div class="confirm-row"><span class="confirm-key">الكمية</span><span class="confirm-val">${sziDisp.toFixed(dp)} ${a.unit}</span></div>
    <div class="confirm-row"><span class="confirm-key">سعر الدخول</span><span class="confirm-val">$${fmt(entryDisp,a.pxDp)}</span></div>
    <div class="confirm-row"><span class="confirm-key">السعر الحالي</span><span class="confirm-val">${curPx?'$'+fmt(curPx,a.pxDp):'—'}</span></div>
    <div class="confirm-row"><span class="confirm-key">الربح / الخسارة</span><span class="confirm-val ${pnl>=0?'buy':'sell'}">${pnl>=0?'+':''}$${fmt(pnl,2)}</span></div>
    <div class="confirm-row"><span class="confirm-key">رسوم الإغلاق</span><span class="confirm-val fee">$${closeFee} (${feeRatePct(sym)})</span></div>`;

  State.pendingClose = i;
  openModal('modalClose');
};

async function execClose() {
  if (State.pendingClose === null) { closeModal('modalClose'); return; }
  const idx = State.pendingClose;
  const p   = State.positions[idx];
  if (!p) { closeModal('modalClose'); return; }

  const pos    = p.position;
  const sziOz  = parseFloat(pos.szi);
  const sym    = shortCoinPos(pos.coin);
  const isGram = !!ASSETS[sym]?.gram;
  const aApi   = isGram ? ASSETS['GOLD'] : ASSETS[sym];
  if (!aApi) { toast('أصل غير معروف', 'err'); closeModal('modalClose'); return; }

  const gramPx = State.prices['XAU']?.mid;
  const midOz  = isGram
    ? (gramPx > 0 ? gramPx * TROY : State.prices['GOLD']?.mid)
    : State.prices[sym]?.mid;
  if (!midOz || midOz <= 0) { toast('سعر غير متاح، انتظر لحظة', 'err'); return; }

  /* ✅ Optimistic: remove from UI instantly */
  closeModal('modalClose');
  State._lastOptimisticClose = Date.now();
  State._emptyPosCount       = 0;

  /* ✅ FIX: register coin BEFORE splicing so pollAccount can filter it */
  _registerClosedCoin(pos.coin);

  State.positions.splice(idx, 1);
  resetPosFingerprint();
  renderPositions();
  State.pendingClose = null;

  const aDisp = ASSETS[sym] || aApi;
  toast(`⏳ إغلاق ${aDisp.icon||''} ${aDisp.name||''}...`, 'info', 2500);
  cornerStatus(`⏳ جاري إغلاق ${aDisp.icon||''} ${aDisp.name||''}...`);

  try {
    const isBuy = sziOz < 0;
    await hlExchange({
      type: 'order',
      orders: [{ a: aApi.idx, b: isBuy,
        p: wirePx(midOz * (isBuy ? 1.05 : 0.95), aApi.szDp),
        s: wire(Math.abs(sziOz), aApi.szDp),
        r: true, t: { limit: { tif: 'Ioc' } }
      }],
      grouping: 'na'
    });
    toast(`✅ أُغلقت — ${aDisp.icon||''} ${aDisp.name||''}`, 'ok', 4000);
    playFillSound();
    hideCornerStatus();
    _multiPoll();
  } catch (e) {
    hideCornerStatus();
    toast(tradeErr(e.message), 'err', 6000);
    /* API failed: re-poll so position is restored from API if still open */
    _multiPoll();
  }
}

/* ════ Close All ════ */
function askCloseAll() {
  if (State.isGuest) return _promptConnect();
  if (!State.positions.length) return toast('لا توجد صفقات', 'info');
  $('closeAllDetails').innerHTML = State.positions.map(p => {
    const pos = p.position, pnl = parseFloat(pos.unrealizedPnl || 0);
    const sym = shortCoinPos(pos.coin);
    const a   = ASSETS[sym] || { name: sym, pxDp: 2, icon: '📊' };
    return `<div class="confirm-row">
      <span class="confirm-key">${a.icon} ${a.name}</span>
      <span class="confirm-val ${pnl>=0?'buy':'sell'}">${pnl>=0?'+':''}$${fmt(pnl,2)}</span>
    </div>`;
  }).join('');
  openModal('modalCloseAll');
}

async function execCloseAll() {
  const positions = [...State.positions];
  if (!positions.length) { closeModal('modalCloseAll'); return; }

  /* Optimistic: clear all immediately */
  closeModal('modalCloseAll');
  State._lastOptimisticClose = Date.now();
  State._emptyPosCount       = 0;

  /* ✅ FIX: register ALL coins before clearing */
  positions.forEach(p => _registerClosedCoin(p.position.coin));

  State.positions = [];
  resetPosFingerprint();
  renderPositions();
  toast('⏳ إغلاق جميع الصفقات...', 'info', 3000);
  cornerStatus('⏳ جاري إغلاق جميع الصفقات...');

  let ok = 0, fail = 0;
  try {
    for (const p of positions) {
      const pos    = p.position, sziOz = parseFloat(pos.szi);
      const sym    = shortCoinPos(pos.coin);
      const isGram = !!ASSETS[sym]?.gram;
      const aApi   = isGram ? ASSETS['GOLD'] : ASSETS[sym];
      const gramPx = State.prices['XAU']?.mid;
      const midOz  = isGram ? (gramPx > 0 ? gramPx * TROY : State.prices['GOLD']?.mid) : State.prices[sym]?.mid;
      if (!aApi || !midOz) { fail++; continue; }
      try {
        const isBuy = sziOz < 0;
        await hlExchange({
          type: 'order',
          orders: [{ a: aApi.idx, b: isBuy,
            p: wirePx(midOz * (isBuy ? 1.05 : 0.95), aApi.szDp),
            s: wire(Math.abs(sziOz), aApi.szDp),
            r: true, t: { limit: { tif: 'Ioc' } }
          }],
          grouping: 'na'
        });
        ok++;
      } catch (e) { fail++; console.warn('[closeAll]', sym, e.message); }
    }
    hideCornerStatus();
    if (ok) playFillSound();
    toast(`✅ أُغلق ${ok} مركز${fail ? ` · فشل ${fail}` : ''}`, 'ok', 5000);
    _multiPoll();
  } catch { hideCornerStatus(); _multiPoll(); }
}

/* ════ Prompt connect for guests ════ */
function _promptConnect() {
  toast('اربط محفظتك أولاً — انقر على زر الاتصال', 'info', 4000);
  const btn = $('btnConnect');
  if (btn) {
    btn.style.transform = 'scale(1.25)';
    setTimeout(() => { btn.style.transform = ''; }, 600);
  }
}
