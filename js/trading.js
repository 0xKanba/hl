/* ═══════════════════════════════════════
   trading.js — تنفيذ الصفقات وإغلاقها
   ✅ إغلاق جزئي ديناميكي: slider ↔ qty ↔ presets
   ✅ shortCoinPos موحّدة في كل مكان
═══════════════════════════════════════ */
'use strict';

/* ════ فتح صفقة ════ */
function askTrade(isBuy) {
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

  const sziForLiq = isBuy ? ozQty : -ozQty;
  const liqInfo   = liqPriceDisplay(State.asset, tradeMid, sziForLiq, State.balance?.total || 0);
  const liqCls    = liqInfo.text === 'آمن ✅' ? 'up' : 'sell';

  setTxt('confirmTitle',    `${a.icon} ${isBuy ? 'شراء ↑' : 'بيع ↓'} — ${a.name}`);
  setTxt('confirmSubtitle', `رافعة ${a.lev}x · تنفيذ فوري`);
  $('confirmDetails').innerHTML = `
    <div class="confirm-row"><span class="confirm-key">الكمية</span><span class="confirm-val">${dispQty}</span></div>
    <div class="confirm-row"><span class="confirm-key">سعر ${isGram ? 'الغرام' : 'الوحدة'}</span><span class="confirm-val">${fmt(p.mid, a.pxDp)} $</span></div>
    <div class="confirm-row"><span class="confirm-key">القيمة الكلية</span><span class="confirm-val">≈ $${usd}</span></div>
    <div class="confirm-row"><span class="confirm-key">الهامش المطلوب</span><span class="confirm-val warn">≈ $${mgn}</span></div>
    <div class="confirm-row"><span class="confirm-key">التصفية التقريبية</span><span class="confirm-val ${liqCls}">${liqInfo.text}</span></div>
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
  let { isBuy, qty, sym } = State.pendingTrade;
  const a       = ASSETS[sym], p = State.prices[sym];
  const execQty = a.gram ? +(qty / TROY).toFixed(4) : qty;
  const execMid = a.gram ? p.mid * TROY : p.mid;
  const execSzDp= a.gram ? 4 : a.szDp;
  if (!p?.mid) { toast('لا يوجد سعر', 'err'); closeModal('modalConfirm'); return; }

  setBtnLoading('confirmExecute', '⏳');
  showLoader(`${a.icon} ${isBuy ? 'شراء' : 'بيع'} ${qty} ${a.unit}...`);
  try {
    try { await hlExchange({ type:'updateLeverage', asset:a.idx, isCross:a.cross, leverage:a.lev }); } catch (e) { console.warn('[lev]', e.message); }
    const slip = sym === 'NQ' ? 0.03 : 0.02;
    const res  = await hlExchange({
      type: 'order',
      orders: [{ a:a.idx, b:isBuy,
        p: wirePx(execMid * (isBuy ? 1 + slip : 1 - slip), execSzDp),
        s: wireSz(execQty, execSzDp),
        r: false, t:{ limit:{ tif:'Ioc' } }
      }],
      grouping: 'na'
    });
    const status = res?.response?.data?.statuses?.[0];
    if (status?.error) throw new Error(status.error);
    if (status?.filled) {
      const f = status.filled;
      closeModal('modalConfirm');
      const dispSz = a.gram ? (+f.totalSz * TROY).toFixed(2) : f.totalSz;
      toast(`✅ مُنفَّذ — ${a.icon} ${dispSz} ${a.unit} @ ${fmt(parseFloat(f.avgPx) / (a.gram ? TROY : 1), a.pxDp)}`, 'ok', 5000);
    } else if (status?.resting) {
      closeModal('modalConfirm');
      toast(`⏳ أمر معلق — ${a.icon} ${qty} ${a.unit}`, 'info', 4000);
    } else {
      closeModal('modalConfirm');
      toast('⚠️ لم يُنفَّذ — السوق بعيد', 'err', 5000);
    }
    autoSetReferrer();
    State.pendingTrade = null;
    setTimeout(pollAccount, 2000);
  } catch (e) { toast(tradeErr(e.message), 'err', 6000); }
  finally { resetBtn('confirmExecute'); hideLoader(); }
}

/* ═══════════════════════════════════════════════════
   إغلاق صفقة — جزئي أو كامل (الجزء الرئيسي الجديد)
═══════════════════════════════════════════════════ */

window.askClose = function (i) {
  const p = State.positions[i]; if (!p) return;
  const pos      = p.position;
  const sziOz    = parseFloat(pos.szi);
  const sym      = shortCoinPos(pos.coin);
  const a        = ASSETS[sym] || { name:sym, unit:'', icon:'📊', pxDp:2, szDp:2 };
  const isGram   = !!a.gram;
  const pnlTotal = parseFloat(pos.unrealizedPnl || 0);
  const curPx    = State.prices[sym]?.mid || 0;
  const totalOz  = Math.abs(sziOz);
  const totalDisp= isGram ? totalOz * TROY : totalOz;
  const dp       = isGram ? 2 : a.szDp;
  const entryDisp= isGram ? parseFloat(pos.entryPx || 0) / TROY : parseFloat(pos.entryPx || 0);
  const isLong   = sziOz > 0;

  setTxt('closeTitle', `${a.icon} إغلاق — ${a.name}`);
  setTxt('closeSubtitle', `${isLong ? '▲ شراء' : '▼ بيع'} · دخول $${fmt(entryDisp, a.pxDp)}`);

  /* معلومات المركز */
  $('closeDetails').innerHTML = `
    <div class="confirm-row">
      <span class="confirm-key">حجم المركز</span>
      <span class="confirm-val">${totalDisp.toFixed(dp)} ${a.unit}</span>
    </div>
    <div class="confirm-row">
      <span class="confirm-key">السعر الحالي</span>
      <span class="confirm-val">${curPx ? '$' + fmt(curPx, a.pxDp) : '—'}</span>
    </div>
    <div class="confirm-row">
      <span class="confirm-key">الربح / الخسارة</span>
      <span class="confirm-val ${pnlTotal >= 0 ? 'buy' : 'sell'}">${pnlTotal >= 0 ? '+' : ''}$${fmt(pnlTotal, 2)}</span>
    </div>`;

  /* حفظ الحالة */
  State.pendingClose = { index:i, coin:pos.coin, sym, isGram, a, totalOz, totalDisp, dp, pnlTotal };

  /* تهيئة أدوات الإغلاق الجزئي */
  _initCloseControls(totalDisp, a, isGram, pnlTotal);
  openModal('modalClose');
};

/* ── تهيئة عناصر التحكم الجزئي ── */
function _initCloseControls(totalDisp, a, isGram, pnlTotal) {
  const qtyIn  = $('closeQtyInput');
  const slider = $('closePctSlider');
  if (!qtyIn || !slider) return;

  const dp = isGram ? 2 : a.szDp;
  qtyIn.value  = totalDisp.toFixed(dp);
  qtyIn.max    = totalDisp;
  qtyIn.step   = Math.pow(10, -dp);
  slider.value = 100;

  setTxt('closeQtyUnit',  a.unit);
  setTxt('closePctLabel', '100%');
  _updateSliderTrack(100);
  _updateClosePresets(100);
  _updateCloseRemain(totalDisp, totalDisp, a, isGram, pnlTotal);
  _updateCloseBtn(totalDisp, totalDisp, a, isGram, true);
}

/* ── slider → qty (يُستدعى من app.js و presets) ── */
function _syncCloseFromPct(pct) {
  const pc = State.pendingClose; if (!pc) return;
  const { totalDisp, a, isGram, pnlTotal } = pc;
  const dp         = isGram ? 2 : a.szDp;
  const closeDisp  = parseFloat((totalDisp * pct / 100).toFixed(dp));
  const qtyIn      = $('closeQtyInput');
  const slider     = $('closePctSlider');
  if (qtyIn)  qtyIn.value  = closeDisp;
  if (slider) slider.value = pct;
  setTxt('closePctLabel', Math.round(pct) + '%');
  _updateSliderTrack(pct);
  _updateClosePresets(Math.round(pct));
  _updateCloseRemain(closeDisp, totalDisp, a, isGram, pnlTotal);
  _updateCloseBtn(closeDisp, totalDisp, a, isGram, Math.round(pct) === 100);
}

/* ── qty input → slider (يُستدعى من app.js) ── */
function _syncCloseFromQty(closeDisp) {
  const pc = State.pendingClose; if (!pc) return;
  const { totalDisp, a, isGram, pnlTotal } = pc;
  const clamped = Math.min(Math.max(0, closeDisp), totalDisp);
  const pct     = totalDisp > 0 ? (clamped / totalDisp) * 100 : 0;
  const slider  = $('closePctSlider');
  if (slider) slider.value = pct;
  setTxt('closePctLabel', Math.round(pct) + '%');
  _updateSliderTrack(pct);
  _updateClosePresets(Math.round(pct));
  _updateCloseRemain(clamped, totalDisp, a, isGram, pnlTotal);
  _updateCloseBtn(clamped, totalDisp, a, isGram, Math.round(pct) === 100);
}

/* ── تحديث لون شريط التمرير ── */
function _updateSliderTrack(pct) {
  const slider = $('closePctSlider');
  if (!slider) return;
  slider.style.background =
    `linear-gradient(to right, var(--dn) ${pct}%, var(--border-strong) ${pct}%)`;
}

/* ── تحديث حالة presets ── */
function _updateClosePresets(roundedPct) {
  document.querySelectorAll('.pc-preset').forEach(b => {
    b.classList.toggle('active', +b.dataset.pct === roundedPct);
  });
}

/* ── تحديث معلومات المتبقي والتقدير ── */
function _updateCloseRemain(closeDisp, totalDisp, a, isGram, pnlTotal) {
  const el = $('closeRemain'); if (!el) return;
  const pc  = State.pendingClose; if (!pc) return;
  const dp  = isGram ? 2 : a.szDp;
  const remainDisp = Math.max(0, totalDisp - closeDisp);
  const pct        = totalDisp > 0 ? closeDisp / totalDisp : 0;
  const closePnl   = pnlTotal * pct;

  /* تقدير الرسوم */
  const curPx  = State.prices[pc.sym]?.mid || 0;
  const closeOz= isGram ? closeDisp / TROY : closeDisp;
  const curOz  = isGram ? curPx * TROY : curPx;
  const fee    = curOz > 0 ? closeOz * curOz * feeRate(pc.sym) : 0;
  const netPnl = closePnl - fee;
  const pCls   = netPnl >= 0 ? 'up' : 'dn';

  el.innerHTML = `
    <div class="pc-remain-row">
      <span class="pc-remain-lbl">يتبقى</span>
      <span class="pc-remain-val">${remainDisp.toFixed(dp)} ${a.unit}</span>
    </div>
    <div class="pc-remain-row">
      <span class="pc-remain-lbl">صافي هذه الصفقة</span>
      <span class="pc-remain-val pc-pnl-est ${pCls}">${netPnl >= 0 ? '+' : ''}$${Math.abs(netPnl).toFixed(2)}</span>
    </div>`;
}

/* ── نص زر الإغلاق ── */
function _updateCloseBtn(closeDisp, totalDisp, a, isGram, isAll) {
  const btn = $('closeExecute'); if (!btn) return;
  const dp  = isGram ? 2 : a.szDp;
  btn.innerHTML = isAll
    ? `إغلاق الكل ✕`
    : `إغلاق ${(+closeDisp).toFixed(dp)} ${a.unit} ✕`;
}

/* ── تنفيذ الإغلاق ── */
async function execClose() {
  const pc = State.pendingClose;
  if (!pc) { closeModal('modalClose'); return; }

  const closeDispRaw = parseFloat($('closeQtyInput')?.value || 0);
  if (!closeDispRaw || closeDispRaw <= 0) { toast('أدخل كمية الإغلاق', 'err'); return; }

  const p = State.positions[pc.index];
  if (!p) { closeModal('modalClose'); return; }

  const pos      = p.position;
  const sziOz    = parseFloat(pos.szi);
  const { sym, isGram } = pc;
  const aApi     = isGram ? ASSETS['GOLD'] : ASSETS[sym];
  if (!aApi) { toast('أصل غير معروف', 'err'); closeModal('modalClose'); return; }

  /* تحويل للأونصة */
  const closeOz  = isGram ? closeDispRaw / TROY : closeDispRaw;
  const maxOz    = Math.abs(sziOz);
  const finalOz  = Math.min(closeOz, maxOz); /* لا يتجاوز الحجم الكلي */
  const isAll    = finalOz >= maxOz * 0.9999;

  const gramPx   = State.prices['XAU']?.mid;
  const midOz    = isGram
    ? (gramPx > 0 ? gramPx * TROY : State.prices['GOLD']?.mid)
    : State.prices[sym]?.mid;
  if (!midOz || midOz <= 0) { toast('سعر غير متاح، انتظر لحظة', 'err'); return; }

  const aDisp    = ASSETS[sym] || aApi;
  const dp       = isGram ? 2 : aApi.szDp;
  const dispLabel= closeDispRaw.toFixed(dp);

  setBtnLoading('closeExecute', '⏳');
  showLoader(`${aDisp.icon || ''} إغلاق ${dispLabel} ${aDisp.unit || ''}...`);
  try {
    const isBuy = sziOz < 0;
    await hlExchange({
      type: 'order',
      orders: [{ a:aApi.idx, b:isBuy,
        p: wirePx(midOz * (isBuy ? 1.02 : 0.98), aApi.szDp),
        s: wire(finalOz, aApi.szDp),
        r: true, t:{ limit:{ tif:'Ioc' } }
      }],
      grouping: 'na'
    });
    closeModal('modalClose');
    toast(isAll
      ? `✅ أُغلق كاملاً — ${aDisp.icon || ''} ${aDisp.name || ''}`
      : `✅ أُغلق جزئياً — ${dispLabel} ${aDisp.unit || ''}`,
      'ok', 4000);
    State.pendingClose = null;
    setTimeout(pollAccount, 2000);
  } catch (e) { toast(tradeErr(e.message), 'err', 6000); }
  finally { resetBtn('closeExecute'); hideLoader(); }
}

/* ════ إغلاق جميع الصفقات ════ */
function askCloseAll() {
  if (!State.positions.length) return toast('لا توجد صفقات', 'info');
  $('closeAllDetails').innerHTML = State.positions.map(p => {
    const pos = p.position, pnl = parseFloat(pos.unrealizedPnl || 0);
    const sym = shortCoinPos(pos.coin);
    const a   = ASSETS[sym] || { name:sym, pxDp:2, icon:'📊' };
    return `<div class="confirm-row">
      <span class="confirm-key">${a.icon} ${a.name}</span>
      <span class="confirm-val ${pnl >= 0 ? 'buy' : 'sell'}">${pnl >= 0 ? '+' : ''}$${fmt(pnl, 2)}</span>
    </div>`;
  }).join('');
  openModal('modalCloseAll');
}

async function execCloseAll() {
  const positions = [...State.positions];
  if (!positions.length) { closeModal('modalCloseAll'); return; }
  setBtnLoading('closeAllExecute', '⏳');
  showLoader('إغلاق جميع الصفقات...');
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
          orders: [{ a:aApi.idx, b:isBuy,
            p: wirePx(midOz * (isBuy ? 1.02 : 0.98), aApi.szDp),
            s: wire(Math.abs(sziOz), aApi.szDp),
            r: true, t:{ limit:{ tif:'Ioc' } }
          }],
          grouping: 'na'
        });
        ok++;
      } catch (e) { fail++; console.warn('[closeAll]', sym, e.message); }
    }
    closeModal('modalCloseAll');
    toast(`✅ أُغلق ${ok} مركز${fail ? ` · فشل ${fail}` : ''}`, 'ok', 5000);
    setTimeout(pollAccount, 2000);
  } finally { resetBtn('closeAllExecute'); hideLoader(); }
}
