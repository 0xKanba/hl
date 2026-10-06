/* ═══════════════════════════════════════
   trading.js
   ✅ askTrade()/execTrade() ونافذة modalConfirm حُذفتا: كانتا تُشغَّلان
      حصراً من زرَّي شراء/بيع القديمين بالرئيسية — استُبدل التدفّق بشاشة
      "فتح صفقة جديدة" (js/order/*.js) التي تبني تأكيدها وتستدعي hlExchange.
   _multiPoll/_registerClosedCoin/askClose/execClose/askCloseAll/
   execCloseAll/_promptConnect بلا تغيير — تُستدعى من positions.js
   وjs/order/index.js وjs/chart/trading.js وjs/tpsl.js.
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
   يمنع ظهور الصفقة المغلقة تفاؤلياً مجدداً (ghost position) خلال نافذة
   الحماية 20 ثانية؛ تنتهي صلاحية التسجيل تلقائياً بعد 25 ثانية. */
function _registerClosedCoin(coin) {
  if (!coin) return;
  if (!State._closedCoins) State._closedCoins = [];
  if (!State._closedCoins.includes(coin)) {
    State._closedCoins.push(coin);
  }
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

  /* Optimistic: إزالة فورية من الواجهة */
  closeModal('modalClose');
  State._lastOptimisticClose = Date.now();
  State._emptyPosCount       = 0;

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
    _multiPoll(); /* فشل الإرسال: أعد الجلب لاستعادة الصفقة إن بقيت مفتوحة */
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

  closeModal('modalCloseAll');
  State._lastOptimisticClose = Date.now();
  State._emptyPosCount       = 0;

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
