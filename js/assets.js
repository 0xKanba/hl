/* ═══════════════════════════════════════
   assets.js — تبديل الأصول
   ✅ لا وميض عند تبديل الأصل
   ✅ الأصل الافتراضي النفط (CL)
   ✅ قيمة افتراضية منطقية في حقل الكمية
═══════════════════════════════════════ */
'use strict';

function switchAsset(sym) {
  if (!ASSETS[sym]) return;
  State.asset = sym;

  /* تفعيل التاب الصحيح */
  document.querySelectorAll('.tab[data-asset]').forEach(t =>
    t.classList.toggle('active', t.dataset.asset === sym)
  );

  const a = ASSETS[sym];

  setTxt('priceAssetName', a.name);
  setTxt('qtyUnit', a.unit);

  /* صورة بطاقة السعر */
  const img = $('priceAssetImg');
  if (img && ASSET_IMAGES[sym]) { img.src = ASSET_IMAGES[sym]; img.alt = sym; }

  /* ── الكمية الافتراضية ──
     نضع القيمة الأولى من presets كقيمة افتراضية.
     إذا عدّل المستخدم الحقل يدوياً نحافظ على قيمته.
  */
  const qtyEl = $('qtyInput');
  const preset = a.presets?.[0] ?? 1;
  State.qty = preset;
  if (qtyEl) {
    qtyEl.value = preset;
    qtyEl._userEdited = false; /* reset flag on asset switch */
  }

  /* إعادة تعيين prevMid بدون وميض */
  State.prevMid[sym] = State.prices[sym]?.mid || 0;

  /* مسح delta */
  const deltaEl = $('priceDelta');
  if (deltaEl) { deltaEl.textContent = ''; deltaEl.className = 'price-delta n'; }

  /* إخفاء إحصائيات الجلسة حتى تُجلب */
  $('priceSession')?.classList.add('hidden');

  /* تحديث الواجهة مباشرة */
  updatePriceUI();

  /* جلب إحصائيات الجلسة */
  fetchSessionStats(sym);

  /* تحديث الرسم البياني إن كان مفتوحاً */
  if (typeof ChartModule !== 'undefined') ChartModule.switchAssetChart(sym);
}
