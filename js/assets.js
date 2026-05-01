/* ═══════════════════════════════════════
   assets.js — تبديل الأصول والكميات
═══════════════════════════════════════ */
'use strict';

/* ════ تبديل الأصل الحالي ════ */
function switchAsset(sym) {
  State.asset = sym;
  document.querySelectorAll('.tab[data-asset]').forEach(t =>
    t.classList.toggle('active', t.dataset.asset === sym)
  );
  const a = ASSETS[sym];
  setTxt('priceAssetName', a.name);
  setTxt('tradeAssetName', a.name);
  setTxt('qtyUnit', a.unit);

  const img = $('priceAssetImg');
  if (img && ASSET_IMAGES[sym]) { img.src = ASSET_IMAGES[sym]; img.alt = sym; }

  renderPresets(a.presets);
  State.prevMid[sym] = 0;
  setText('priceDelta', '', 'price-delta n');
  updatePriceUI();
  $('priceSession')?.classList.add('hidden');
  fetchSessionStats(sym);

  if (typeof ChartModule !== 'undefined') ChartModule.switchAssetChart(sym);
}

/* ════ أزرار الكميات ════ */
function renderPresets(arr) {
  $('qtyPresets').innerHTML = arr.map((v, i) =>
    `<button class="qty-preset${i === 0 ? ' active' : ''}" data-v="${v}">${v}</button>`
  ).join('');
  State.qty = arr[0];
  $('qtyInput').value = arr[0];

  $('qtyPresets').onclick = e => {
    if (!e.target.classList.contains('qty-preset')) return;
    State.qty = parseFloat(e.target.dataset.v);
    $('qtyInput').value = State.qty;
    $('qtyPresets').querySelectorAll('.qty-preset').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
  };
}
