/* ═══════════════════════════════════════
   trading.js — تنفيذ الصفقات وإغلاقها
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
  State.pendingTrade = { isBuy, qty, sym:State.asset };
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

/* ════ إغلاق صفقة فردية ════ */
window.askClose = function (i) {
  const p = State.positions[i]; if (!p) return;
  const pos     = p.position, sziOz = parseFloat(pos.szi);
  const sym     = shortCoinPos(pos.coin);
  const a       = ASSETS[sym] || { name:sym, unit:'', icon:'📊', pxDp:2, szDp:2 };
  const isGram  = !!a.gram;
  const pnl     = parseFloat(pos.unrealizedPnl || 0);
  const curPx   = State.prices[sym]?.mid || 0;
  const sziDisp = isGram ? sziOz * TROY : sziOz;
  const entryDisp= isGram ? parseFloat(pos.entryPx || 0) / TROY : parseFloat(pos.entryPx || 0);
  const closeFee = curPx
    ? (Math.abs(sziOz) * (isGram ? curPx * TROY : curPx) * feeRate(sym)).toFixed(4)
    : '—';

  setTxt('closeTitle', `${a.icon} إغلاق — ${a.name}`);
  $('closeDetails').innerHTML = `
    <div class="confirm-row"><span class="confirm-key">الاتجاه</span><span class="confirm-val ${sziOz > 0 ? 'buy' : 'sell'}">${sziOz > 0 ? '▲ شراء' : '▼ بيع'}</span></div>
    <div class="confirm-row"><span class="confirm-key">الكمية</span><span class="confirm-val">${Math.abs(sziDisp).toFixed(isGram ? 2 : a.szDp)} ${a.unit}</span></div>
    <div class="confirm-row"><span class="confirm-key">سعر الدخول</span><span class="confirm-val">$${fmt(entryDisp, a.pxDp)}</span></div>
    <div class="confirm-row"><span class="confirm-key">السعر الحالي</span><span class="confirm-val">${curPx ? '$' + fmt(curPx, a.pxDp) : '—'}</span></div>
    <div class="confirm-row"><span class="confirm-key">الربح / الخسارة</span><span class="confirm-val ${pnl >= 0 ? 'buy' : 'sell'}">${pnl >= 0 ? '+' : ''}$${fmt(pnl, 2)}</span></div>
    <div class="confirm-row"><span class="confirm-key">رسوم الإغلاق</span><span class="confirm-val fee">$${closeFee} (${feeRatePct(sym)})</span></div>`;

  State.pendingClose = i;
  openModal('modalClose');
};

async function execClose() {
  if (State.pendingClose === null) { closeModal('modalClose'); return; }
  const p = State.positions[State.pendingClose]; if (!p) { closeModal('modalClose'); return; }
  const pos    = p.position, sziOz = parseFloat(pos.szi);
  const sym    = shortCoinPos(pos.coin);
  const isGram = !!ASSETS[sym]?.gram;
  const aApi   = isGram ? ASSETS['GOLD'] : ASSETS[sym];
  if (!aApi) { toast('أصل غير معروف', 'err'); closeModal('modalClose'); return; }

  const gramPx = State.prices['XAU']?.mid;
  const midOz  = isGram
    ? (gramPx > 0 ? gramPx * TROY : State.prices['GOLD']?.mid)
    : State.prices[sym]?.mid;
  if (!midOz || midOz <= 0) { toast('سعر غير متاح، انتظر لحظة', 'err'); closeModal('modalClose'); return; }

  const aDisp = ASSETS[sym] || aApi;
  setBtnLoading('closeExecute', '⏳');
  showLoader(`إغلاق ${aDisp.icon || ''} ${aDisp.name || ''}...`);
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
    closeModal('modalClose');
    toast(`✅ أُغلقت — ${aDisp.icon || ''} ${aDisp.name || ''}`, 'ok', 4000);
    State.pendingClose = null;
    setTimeout(pollAccount, 2000);
  } catch (e) { toast(tradeErr(e.message), 'err', 6000); }
  finally { resetBtn('closeExecute'); hideLoader(); }
}

/* ════ إغلاق جميع الصفقات ════ */
function askCloseAll() {
  if (!State.positions.length) return toast('لا توجد صفقات', 'info');
  $('closeAllDetails').innerHTML = State.positions.map(p => {
    const pos  = p.position, pnl = parseFloat(pos.unrealizedPnl || 0);
    /* ✅ shortCoinPos موحّدة — تعالج XAU/GOLD بشكل صحيح */
    const sym  = shortCoinPos(pos.coin);
    const a    = ASSETS[sym] || { name:sym, pxDp:2, icon:'📊' };
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
