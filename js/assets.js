/* ═══════════════════════════════════════
   assets.js — تبديل الأصول
   ✅ لا وميض عند تبديل الأصل
   ✅ الأصل الافتراضي النفط (CL)
   ✅ قيمة افتراضية منطقية في حقل الكمية
   ✅ جديد — مزامنة البطاقة النشطة بشاشة "الأسواق" فوراً مع أي تبديل
      أصل (تاب الرئيسية، بطاقة السوق نفسها، أو قائمة الأصول المنسدلة
      بالرسم البياني — كلها تمر عبر switchAsset()) — بلا انتظار أي
      مؤقّت. يستبدل الاستطلاع القديم كل ثانية بـapp.js (راجع تعليق
      app.js لتفاصيل الإزالة الكاملة).
═══════════════════════════════════════ */
'use strict';

function switchAsset(sym) {
  if (!ASSETS[sym]) return;
  State.asset = sym;

  /* تفعيل التاب الصحيح */
  document.querySelectorAll('.tab[data-asset]').forEach(t =>
    t.classList.toggle('active', t.dataset.asset === sym)
  );

  /* ✅ نفس التفعيل لبطاقة شاشة الأسواق — فوري، بلا أي تأخير مؤقّت */
  document.querySelectorAll('.market-card[data-asset]').forEach(c =>
    c.classList.toggle('active', c.dataset.asset === sym)
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
  /* ✅ إصلاح — احترام تعديل المستخدم فعلياً. سابقاً كان العلم يُصفَّر هنا
     فقط ولا يُضبط true بأي مكان (راجع app.js:_initQtyInput)، فكانت كمية
     المستخدم تُمحى دائماً عند تبديل الأصل خلافاً للسلوك الموثّق. */
  const kept = qtyEl && qtyEl._userEdited && parseFloat(qtyEl.value) > 0;
  if (kept) {
    State.qty = parseFloat(qtyEl.value);
  } else {
    State.qty = preset;
    if (qtyEl) {
      qtyEl.value = preset;
      qtyEl._userEdited = false;
    }
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
