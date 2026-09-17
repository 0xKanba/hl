/* ═══════════════════════════════════════════════════════════════
   js/order/logic.js — تصنيف الأمر (حدّي/إيقاف)، بناء حمولة Hyperliquid،
   والحسابات المعاينة (قيمة/هامش/تصفية/رسوم).

   ✅ الكشف التلقائي حدّي↔إيقاف — مطابق حرفياً لصفحة "Order types"
      الرسمية بتوثيق Hyperliquid:
        Stop Market (شراء):  سعر التفعيل > سعر السوق  → أمر إيقاف
        Stop Market (بيع):   سعر التفعيل < سعر السوق  → أمر إيقاف
        (والعكس — سعر أفضل من السوق بنفس الاتجاه — أمر حدّي عادي يستقر
        بقائمة الأوامر، بلا حاجة لتريغر إطلاقاً؛ هذا بالضبط ما وصفه
        الطلب: "فتح شراء 101 والسعر الآن 100 = إيقاف شراء").
      المرجع: for-developers/api/exchange-endpoint (بنية trigger) +
      صفحة "Order types" الرسمية (شروط سعر التفعيل مقابل السوق).

   ✅ tpsl:'sl' لكل أمر إيقاف دخول (غير reduce-only) — الحقل مطلوب
      دائماً ببنية trigger (لا "omitempty" بأي SDK رسمي فُحص)، و"sl"
      هو نفس التصنيف الذي يستخدمه Hyperliquid داخلياً لاتجاه "Stop"
      (بعكس "tp" لاتجاه "Take") — يؤثر فقط على العرض/التصنيف الداخلي
      لدى الخادم، لا على شروط التنفيذ الفعلية (isMarket/triggerPx/
      reduceOnly/جهة الأمر هي وحدها ما يحكم التنفيذ).

   ✅ grouping:'normalTpsl' — موثّق رسمياً لربط أمر دخول (سوق أو حدّي)
      بأمرَي خروج TP/SL بتوقيع واحد؛ يُستخدَم هنا فقط لدخول سوق/حدّي.
      لأمر الإيقاف (trigger entry) نُرسِل الدخول وحده (grouping:'na')
      ونُلحِق TP/SL تلقائياً بعد التفعيل الفعلي (راجع index.js) — توثيق
      Hyperliquid لا يُثبت صراحة حزم trigger entry ضمن normalTpsl، وهذا
      المسار الأضمن لمال حقيقي بدل افتراض سلوك غير موثّق.
═══════════════════════════════════════════════════════════════ */
'use strict';
var OM = window.__om = window.__om || {};

(function () {

  /* ══════════ تصنيف حدّي/إيقاف ══════════ */
  OM.classify = function (isBuy, priceDisp, midDisp) {
    if (!priceDisp || !midDisp) return null;
    if (isBuy) return priceDisp > midDisp ? 'stop' : 'limit';
    return priceDisp < midDisp ? 'stop' : 'limit';
  };

  /* سعر الحد لأمر trigger بعد التفعيل (يتحول IOC فوراً) — مسافة أمان
     ثابتة حول سعر التفعيل، بنفس اتجاه *أمر التنفيذ نفسه* (forBuyOrder)
     لا اتجاه الصفقة الأصلية — دالة واحدة بدل تكرار الشرط بكل موضع،
     لمنع أي عكس عرضي للاتجاه (الخطر الحقيقي الوحيد بهذا الجزء). */
  OM._triggerBoundPx = function (priceOz, forBuyOrder, szDp) {
    var mult = forBuyOrder ? (1 + OM.SLIP_TRIGGER) : (1 - OM.SLIP_TRIGGER);
    return wirePx(priceOz * mult, szDp);
  };

  /* ══════════ التحقق من TP/SL مقابل سعر الدخول المتوقَّع ══════════ */
  OM.validateTpSl = function (isBuy, refDisp, tpDisp, slDisp) {
    if (tpDisp) {
      if (isBuy  && tpDisp <= refDisp) return '🎯 جني الربح يجب أن يكون فوق سعر الدخول المتوقَّع';
      if (!isBuy && tpDisp >= refDisp) return '🎯 جني الربح يجب أن يكون تحت سعر الدخول المتوقَّع';
    }
    if (slDisp) {
      if (isBuy  && slDisp >= refDisp) return '🛡 وقف الخسارة يجب أن يكون تحت سعر الدخول المتوقَّع';
      if (!isBuy && slDisp <= refDisp) return '🛡 وقف الخسارة يجب أن يكون فوق سعر الدخول المتوقَّع';
    }
    return null;
  };

  /* ══════════ بناء حمولة الأمر الكاملة لـhlExchange ══════════
     opts: { sym, isBuy, qtyDisp, mode:'market'|'priced', priceDisp,
             midDisp, tpDisp, slDisp }
     يُعيد: { orders:[...], grouping, kind:'market'|'limit'|'stop',
              triggerPxOz } أو null لو مدخلات غير صالحة. */
  OM.buildOrders = function (opts) {
    var sym = opts.sym, isBuy = opts.isBuy, qtyDisp = opts.qtyDisp, mode = opts.mode;
    var aApi = OM.isGram(sym) ? ASSETS['GOLD'] : ASSETS[sym];
    if (!aApi || !qtyDisp || qtyDisp <= 0) return null;

    var qtyOz = OM.szToOz(sym, qtyDisp);
    var out = { orders: [], grouping: 'na', kind: null, triggerPxOz: null };

    if (mode === 'market') {
      if (!opts.midDisp) return null;
      var execOz = dispToOz(sym, opts.midDisp);
      out.kind = 'market';
      out.orders.push({
        a: aApi.idx, b: isBuy,
        p: wirePx(execOz * (isBuy ? 1 + OM.SLIP_MARKET : 1 - OM.SLIP_MARKET), aApi.szDp),
        s: wireSz(qtyOz, aApi.szDp),
        r: false,
        t: { limit: { tif: 'Ioc' } }
      });
    } else {
      if (!opts.priceDisp || !opts.midDisp) return null;
      var priceOz = dispToOz(sym, opts.priceDisp);
      var cls = OM.classify(isBuy, opts.priceDisp, opts.midDisp);
      if (cls === 'limit') {
        out.kind = 'limit';
        out.orders.push({
          a: aApi.idx, b: isBuy,
          p: wirePx(priceOz, aApi.szDp),
          s: wireSz(qtyOz, aApi.szDp),
          r: false,
          t: { limit: { tif: 'Gtc' } }
        });
      } else {
        out.kind = 'stop';
        out.triggerPxOz = priceOz;
        out.orders.push({
          a: aApi.idx, b: isBuy,
          p: OM._triggerBoundPx(priceOz, isBuy, aApi.szDp),
          s: wireSz(qtyOz, aApi.szDp),
          r: false,
          t: { trigger: { isMarket: true, triggerPx: wirePx(priceOz, aApi.szDp), tpsl: 'sl' } }
        });
      }
    }

    /* TP/SL مُحزَمة — سوق/حدّي فقط (راجع تعليق رأس الملف). اتجاه
       الإغلاق دائماً عكس الدخول، reduce-only. */
    if (out.kind !== 'stop' && (opts.tpDisp || opts.slDisp)) {
      out.grouping = 'normalTpsl';
      var closeIsBuy = !isBuy;
      if (opts.tpDisp) {
        var tpOz = dispToOz(sym, opts.tpDisp);
        out.orders.push({
          a: aApi.idx, b: closeIsBuy,
          p: OM._triggerBoundPx(tpOz, closeIsBuy, aApi.szDp),
          s: wireSz(qtyOz, aApi.szDp),
          r: true,
          t: { trigger: { isMarket: true, triggerPx: wirePx(tpOz, aApi.szDp), tpsl: 'tp' } }
        });
      }
      if (opts.slDisp) {
        var slOz = dispToOz(sym, opts.slDisp);
        out.orders.push({
          a: aApi.idx, b: closeIsBuy,
          p: OM._triggerBoundPx(slOz, closeIsBuy, aApi.szDp),
          s: wireSz(qtyOz, aApi.szDp),
          r: true,
          t: { trigger: { isMarket: true, triggerPx: wirePx(slOz, aApi.szDp), tpsl: 'sl' } }
        });
      }
    }

    return out;
  };

  /* ══════════ معاينة حيّة: قيمة/هامش/تصفية تقريبية/رسوم ══════════
     يعيد استخدام calcLiqPrice/liqPriceDisplay/crossEquityExcluding
     (positions.js/utils.js) — نفس المصدر المستخدم بكل مكان آخر
     بالمشروع لهذا الرقم بالذات، لا حساب مواز قد ينحرف عنه لاحقاً. */
  OM.buildPreview = function (sym, isBuy, qtyDisp, refPriceDisp) {
    var a = OM.asset(sym);
    if (!qtyDisp || qtyDisp <= 0 || !refPriceDisp) return null;
    var qtyOz = OM.szToOz(sym, qtyDisp);
    var refOz = dispToOz(sym, refPriceDisp);
    var usd    = refOz * qtyOz;
    var margin = usd / a.lev;
    var fr     = feeRate(sym);
    var feeOpen  = usd * fr;
    var sziLiq   = isBuy ? qtyOz : -qtyOz;
    var liq = (typeof liqPriceDisplay === 'function')
      ? liqPriceDisplay(sym, refOz, sziLiq, crossEquityExcluding(0))
      : { text: '—' };
    return {
      usd: usd, margin: margin,
      feeOpen: feeOpen, feeTotal: feeOpen * 2,
      feePct: feeRatePct(sym),
      liqText: liq.text
    };
  };

})();
