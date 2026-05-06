/* ═══════════════════════════════════════
   assets.js — تبديل الأصول
   ✅ priceAssetName الصحيح (كان tradeAssetName — خطأ)
═══════════════════════════════════════ */
'use strict';

function switchAsset(sym) {
  State.asset = sym;

  document.querySelectorAll('.tab[data-asset]').forEach(t =>
    t.classList.toggle('active', t.dataset.asset === sym)
  );

  const a = ASSETS[sym];

  /* ✅ الإصلاح: ID الصحيح هو priceAssetName وليس tradeAssetName */
  setTxt('priceAssetName', a.name);
  setTxt('qtyUnit', a.unit);

  /* صورة بطاقة السعر */
  const img = $('priceAssetImg');
  if (img && ASSET_IMAGES[sym]) { img.src = ASSET_IMAGES[sym]; img.alt = sym; }

  /* الكمية الافتراضية */
  State.qty = a.presets?.[0] || 1;
  const qtyEl = $('qtyInput');
  if (qtyEl) qtyEl.value = State.qty;

  State.prevMid[sym] = 0;
  setText('priceDelta', '', 'price-delta n');
  updatePriceUI();
  $('priceSession')?.classList.add('hidden');
  fetchSessionStats(sym);

  if (typeof ChartModule !== 'undefined') ChartModule.switchAssetChart(sym);
}
