/* ═══════════════════════════════════════
   trading.js
   ✅ جديد (منصة "فتح صفقة جديدة") — askTrade()/execTrade() ونافذة
      modalConfirm المرتبطة بهما حُذفتا بالكامل: كانتا تُشغَّلان حصراً
      من زرَّي شراء/بيع القديمين بشاشة الرئيسية (btnBuy/btnSell)،
      وكلاهما حُذف من index.html — استُبدل التدفّق بالكامل بشاشة
      "فتح صفقة جديدة" الجديدة (راجع js/order/*.js)، التي تبني تأكيدها
      الخاص وتستدعي hlExchange مباشرة (تدعم سوق/حدّي/إيقاف + TP/SL
      اختياريين معاً، بخلاف askTrade القديمة التي كانت سوقاً فقط).
      _multiPoll/_registerClosedCoin/askClose/execClose/askCloseAll/
      execCloseAll/_promptConnect بقيت بلا أي تغيير — ما زالت تُستدعى
      من positions.js (إغلاق صفقة من البطاقة)، وjs/order/index.js
      وjs/chart/trading.js وjs/tpsl.js (كلها تستدعي _multiPoll بعد أي
      عملية ناجحة، وtradeErr من api.js لترجمة الأخطاء).
   ✅ FIX (2026-08) — كانت "التصفية التقريبية" رقماً مجرداً بلا أي شرح
      داخل تأكيد الصفقة القديم — هذا التوضيح انتقل الآن لملف
      js/order/ui.js (نفس الفكرة، داخل تأكيد الشاشة الجديدة).
═══════════════════════════════════════ */
'use strict';

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
