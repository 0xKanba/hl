/* ═══════════════════════════════════════
   tpsl.js — جني الربح ووقف الخسارة
═══════════════════════════════════════ */
'use strict';

/* ════ تحويل الأسعار (أونصة ↔ غرام) ════ */
function ozToDisp(sym, ouncePx)  { return ASSETS[sym]?.gram ? ouncePx / TROY : ouncePx; }
function dispToOz(sym, dispPx)   { return ASSETS[sym]?.gram ? dispPx  * TROY : dispPx;  }
function szToDisp(sym, ounceSz)  { return ASSETS[sym]?.gram ? ounceSz * TROY : ounceSz; }

/* ══════════════════════════════════════
   TP — جني الربح
══════════════════════════════════════ */
window.openTP = async function (i) {
  const p = State.positions[i]; if (!p) return;
  const pos    = p.position;
  const coin   = shortCoinPos(pos.coin);
  const a      = ASSETS[coin] || { name:coin, pxDp:2, icon:'📊' };
  const isLong = parseFloat(pos.szi) > 0;
  const entryDisp = ozToDisp(coin, parseFloat(pos.entryPx || 0));

  setTxt('tpTitle',    `🎯 جني الربح — ${a.icon} ${a.name}`);
  setTxt('tpSubtitle', `${isLong ? '▲ شراء' : '▼ بيع'} · دخول: $${fmt(entryDisp, a.pxDp)}`);

  showLoader('جلب الأوامر...');
  let ft = { tp:null, sl:null, tpOid:null, slOid:null };
  try {
    const ords = await hlInfo({ type:'frontendOpenOrders', user:State.wallet.address, dex:'xyz' });
    ft = parseTpslFromOrders(Array.isArray(ords) ? ords : [], pos.coin);
    if (State.positions[i]) State.positions[i].tpsl = ft;
  } catch {}
  hideLoader();

  $('tpCurrentDetails').innerHTML = _buildTpDetails(ft.tp, pos.entryPx, pos.szi, a, coin);
  $('tpDeleteRow').classList.toggle('hidden', !ft.tpOid);
  $('tpAmount').value = '';
  setTxt('tpPreview', 'سعر التفعيل: —');

  State.pendingTP = { index:i, coin:pos.coin, szi:pos.szi, entryPx:pos.entryPx, sym:coin, tpsl:ft };
  openModal('modalTP');
};

function _buildTpDetails(tpPxOz, ep, szi, a, coin) {
  if (!tpPxOz) return `<div class="confirm-row"><span class="confirm-key">الهدف</span><span class="confirm-val muted">لم يُعيَّن بعد</span></div>`;
  const tpDisp = ozToDisp(coin, tpPxOz);
  const sz     = Math.abs(parseFloat(szi));
  const gross  = (tpPxOz - parseFloat(ep)) * parseFloat(szi);
  const fee    = tpPxOz * sz * feeRate(coin);
  const net    = gross - fee;
  return `<div class="confirm-row"><span class="confirm-key">🎯 سعر التفعيل</span><span class="confirm-val tp">$${fmt(tpDisp, a.pxDp)}</span></div>
    <div class="tpsl-breakdown">
      <div class="tb-row"><span>💰 ربح متوقع</span><span class="tb-mono pos">${gross >= 0 ? '+' : ''}$${Math.abs(gross).toFixed(2)}</span></div>
      <div class="tb-row"><span>💸 رسوم (${feeRatePct(coin)})</span><span class="tb-mono warn">−$${fee.toFixed(4)}</span></div>
      <div class="tb-row tb-net"><span>🏁 صافي</span><span class="tb-mono ${net >= 0 ? 'pos' : 'neg'}">${net >= 0 ? '+' : ''}$${Math.abs(net).toFixed(2)}</span></div>
    </div>`;
}

function recalcTpPreview() {
  const tp  = State.pendingTP; if (!tp) return;
  const val = parseFloat($('tpAmount')?.value || 0);
  const el  = $('tpPreview'); if (!el) return;
  if (!val || val <= 0) { el.innerHTML = '<span style="color:var(--text-secondary)">سعر التفعيل: —</span>'; return; }

  const a    = ASSETS[tp.sym] || { pxDp:2 };
  const pxOz = calcTpPrice(tp.entryPx, tp.szi, val);
  const pxDisp = ozToDisp(tp.sym, pxOz);
  const sz   = Math.abs(parseFloat(tp.szi));
  const fee  = pxOz * sz * feeRate(tp.sym);
  const net  = val - fee;

  el.innerHTML = `<div class="tpsl-breakdown">
    <div class="tb-row"><span>✅ سعر التفعيل</span><span class="tb-mono">$${fmt(pxDisp, a.pxDp)}</span></div>
    <div class="tb-row"><span>💰 ربح متوقع</span><span class="tb-mono pos">+$${val.toFixed(2)}</span></div>
    <div class="tb-row"><span>💸 رسوم (${feeRatePct(tp.sym)})</span><span class="tb-mono warn">−$${fee.toFixed(4)}</span></div>
    <div class="tb-row tb-net"><span>🏁 صافي</span><span class="tb-mono ${net >= 0 ? 'pos' : 'neg'}">${net >= 0 ? '+' : ''}$${net.toFixed(2)}</span></div>
  </div>`;
}

async function execTP() {
  const tp = State.pendingTP; if (!tp) return closeModal('modalTP');
  const val = parseFloat($('tpAmount').value || 0);
  if (!val || val <= 0) return toast('أدخل مبلغ الربح المستهدف', 'err');
  const a      = ASSETS[tp.sym]; if (!a) return;
  const tpPxOz = calcTpPrice(tp.entryPx, tp.szi, val);
  const tpDisp = ozToDisp(tp.sym, tpPxOz);
  const isLong = parseFloat(tp.szi) > 0;
  if (isLong  && tpPxOz <= parseFloat(tp.entryPx)) return toast('⚠️ TP يجب أن يكون فوق سعر الدخول', 'err');
  if (!isLong && tpPxOz >= parseFloat(tp.entryPx)) return toast('⚠️ TP يجب أن يكون تحت سعر الدخول', 'err');

  setBtnLoading('tpExecute', '⏳'); showLoader(`${a.icon} تعيين هدف الربح...`);
  try {
    await placeNativeTpsl(tp.sym, tp.szi, 'tp', tpPxOz);
    closeModal('modalTP');
    toast(`✅ هدف الربح = $${fmt(tpDisp, a.pxDp)}`, 'ok', 4000);
    State.pendingTP = null; setTimeout(pollAccount, 2000);
  } catch (e) { toast(tradeErr(e.message), 'err', 5000); }
  finally { resetBtn('tpExecute'); hideLoader(); }
}

async function deleteTP() {
  const tp = State.pendingTP; if (!tp) return;
  const a  = ASSETS[tp.sym]; if (!a) return;
  let oid  = tp.tpsl?.tpOid;
  if (!oid) {
    showLoader('جلب الأمر...');
    try { const ords = await hlInfo({ type:'frontendOpenOrders', user:State.wallet.address, dex:'xyz' }); oid = parseTpslFromOrders(Array.isArray(ords) ? ords : [], tp.coin).tpOid; } catch {}
    hideLoader();
  }
  if (!oid) { toast('لا يوجد هدف ربح نشط', 'info'); return; }
  showLoader(`${a.icon} إلغاء هدف الربح...`);
  try {
    await hlExchange({ type:'cancel', cancels:[{ a:a.idx, o:BigInt(oid) }] });
    closeModal('modalTP'); toast('✅ تم إلغاء هدف الربح', 'ok', 3000);
    State.pendingTP = null; setTimeout(pollAccount, 1500);
  } catch (e) { toast(tradeErr(e.message), 'err', 4000); }
  finally { hideLoader(); }
}

/* ══════════════════════════════════════
   SL — وقف الخسارة
══════════════════════════════════════ */
window.openSL = async function (i) {
  const p = State.positions[i]; if (!p) return;
  const pos    = p.position;
  const coin   = shortCoinPos(pos.coin);
  const a      = ASSETS[coin] || { name:coin, pxDp:2, icon:'📊' };
  const isLong = parseFloat(pos.szi) > 0;
  const entryDisp = ozToDisp(coin, parseFloat(pos.entryPx || 0));

  setTxt('slTitle',    `🛡 وقف الخسارة — ${a.icon} ${a.name}`);
  setTxt('slSubtitle', `${isLong ? '▲ شراء' : '▼ بيع'} · دخول: $${fmt(entryDisp, a.pxDp)}`);

  showLoader('جلب الأوامر...');
  let ft = { tp:null, sl:null, tpOid:null, slOid:null };
  try {
    const ords = await hlInfo({ type:'frontendOpenOrders', user:State.wallet.address, dex:'xyz' });
    ft = parseTpslFromOrders(Array.isArray(ords) ? ords : [], pos.coin);
    if (State.positions[i]) State.positions[i].tpsl = ft;
  } catch {}
  hideLoader();

  $('slCurrentDetails').innerHTML = _buildSlDetails(ft.sl, pos.entryPx, pos.szi, a, coin);
  $('slDeleteRow').classList.toggle('hidden', !ft.slOid);
  $('slAmount').value = '';
  setTxt('slPreview', 'سعر الوقف: —');

  State.pendingSL = { index:i, coin:pos.coin, szi:pos.szi, entryPx:pos.entryPx, sym:coin, tpsl:ft };
  openModal('modalSL');
};

function _buildSlDetails(slPxOz, ep, szi, a, coin) {
  if (!slPxOz) return `<div class="confirm-row"><span class="confirm-key">الوقف</span><span class="confirm-val muted">لم يُعيَّن بعد</span></div>`;
  const slDisp = ozToDisp(coin, slPxOz);
  const sz     = Math.abs(parseFloat(szi));
  const gross  = (slPxOz - parseFloat(ep)) * parseFloat(szi);
  const fee    = slPxOz * sz * feeRate(coin);
  const net    = gross - fee;
  return `<div class="confirm-row"><span class="confirm-key">⛔ سعر الوقف</span><span class="confirm-val sl">$${fmt(slDisp, a.pxDp)}</span></div>
    <div class="tpsl-breakdown">
      <div class="tb-row"><span>📉 خسارة متوقعة</span><span class="tb-mono neg">${gross >= 0 ? '+' : ''}$${Math.abs(gross).toFixed(2)}</span></div>
      <div class="tb-row"><span>💸 رسوم</span><span class="tb-mono warn">−$${fee.toFixed(4)}</span></div>
      <div class="tb-row tb-net"><span>🏁 صافي</span><span class="tb-mono ${net >= 0 ? 'pos' : 'neg'}">${net >= 0 ? '+' : ''}$${Math.abs(net).toFixed(2)}</span></div>
    </div>`;
}

function recalcSlPreview() {
  const sl  = State.pendingSL; if (!sl) return;
  const val = parseFloat($('slAmount')?.value || 0);
  const el  = $('slPreview'); if (!el) return;
  if (!val || val <= 0) { el.innerHTML = '<span style="color:var(--text-secondary)">سعر الوقف: —</span>'; return; }

  const a    = ASSETS[sl.sym] || { pxDp:2 };
  const pxOz = calcSlPrice(sl.entryPx, sl.szi, val);
  const pxDisp = ozToDisp(sl.sym, pxOz);
  const sz   = Math.abs(parseFloat(sl.szi));
  const fee  = pxOz * sz * feeRate(sl.sym);
  const net  = -(val + fee);

  el.innerHTML = `<div class="tpsl-breakdown">
    <div class="tb-row"><span>⛔ سعر الوقف</span><span class="tb-mono">$${fmt(pxDisp, a.pxDp)}</span></div>
    <div class="tb-row"><span>📉 خسارة</span><span class="tb-mono neg">−$${val.toFixed(2)}</span></div>
    <div class="tb-row"><span>💸 رسوم (${feeRatePct(sl.sym)})</span><span class="tb-mono warn">−$${fee.toFixed(4)}</span></div>
    <div class="tb-row tb-net"><span>🏁 صافي الخسارة</span><span class="tb-mono neg">${net.toFixed(2)}</span></div>
  </div>`;
}

async function execSL() {
  const sl = State.pendingSL; if (!sl) return closeModal('modalSL');
  const val = parseFloat($('slAmount').value || 0);
  if (!val || val <= 0) return toast('أدخل مبلغ الخسارة المسموح بها', 'err');
  const a      = ASSETS[sl.sym]; if (!a) return;
  const slPxOz = calcSlPrice(sl.entryPx, sl.szi, val);
  const slDisp = ozToDisp(sl.sym, slPxOz);
  const isLong = parseFloat(sl.szi) > 0;
  if (isLong  && slPxOz >= parseFloat(sl.entryPx)) return toast('⚠️ SL يجب أن يكون تحت سعر الدخول', 'err');
  if (!isLong && slPxOz <= parseFloat(sl.entryPx)) return toast('⚠️ SL يجب أن يكون فوق سعر الدخول', 'err');

  setBtnLoading('slExecute', '⏳'); showLoader(`${a.icon} تعيين وقف الخسارة...`);
  try {
    await placeNativeTpsl(sl.sym, sl.szi, 'sl', slPxOz);
    closeModal('modalSL');
    toast(`✅ وقف الخسارة = $${fmt(slDisp, a.pxDp)}`, 'ok', 4000);
    State.pendingSL = null; setTimeout(pollAccount, 2000);
  } catch (e) { toast(tradeErr(e.message), 'err', 5000); }
  finally { resetBtn('slExecute'); hideLoader(); }
}

async function deleteSL() {
  const sl = State.pendingSL; if (!sl) return;
  const a  = ASSETS[sl.sym]; if (!a) return;
  let oid  = sl.tpsl?.slOid;
  if (!oid) {
    showLoader('جلب الأمر...');
    try { const ords = await hlInfo({ type:'frontendOpenOrders', user:State.wallet.address, dex:'xyz' }); oid = parseTpslFromOrders(Array.isArray(ords) ? ords : [], sl.coin).slOid; } catch {}
    hideLoader();
  }
  if (!oid) { toast('لا يوجد وقف خسارة نشط', 'info'); return; }
  showLoader(`${a.icon} إلغاء وقف الخسارة...`);
  try {
    await hlExchange({ type:'cancel', cancels:[{ a:a.idx, o:BigInt(oid) }] });
    closeModal('modalSL'); toast('✅ تم إلغاء وقف الخسارة', 'ok', 3000);
    State.pendingSL = null; setTimeout(pollAccount, 1500);
  } catch (e) { toast(tradeErr(e.message), 'err', 4000); }
  finally { hideLoader(); }
}

/* ════ تنفيذ أمر TP/SL عبر Hyperliquid ════ */
async function placeNativeTpsl(sym, sziStr, type, px) {
  const a   = ASSETS[sym];
  const sz  = parseFloat(sziStr);
  const isBuy = sz < 0;
  const res = await hlExchange({
    type: 'order',
    orders: [{ a:a.idx, b:isBuy,
      p: isBuy ? wirePx(px * 1.10, a.szDp) : wirePx(px * 0.90, a.szDp),
      s: wire(Math.abs(sz), a.szDp),
      r: true,
      t: { trigger:{ isMarket:true, triggerPx:wirePx(px, a.szDp), tpsl:type } }
    }],
    grouping: 'positionTpsl'
  });
  const status = res?.response?.data?.statuses?.[0];
  if (status?.error) throw new Error(status.error);
  return status?.resting?.oid ?? null;
}
