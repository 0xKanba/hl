/* ═══════════════════════════════════════════════════════════════
   js/order/logic.js — تصنيف الأمر (حدّي/إيقاف)، بناء حمولة Hyperliquid،
   والحسابات المعاينة (قيمة/هامش/تصفية/رسوم).

   ✅ الجولة التاسعة — منطق الحجم والتنفيذ منقول حرفياً من master
      (js/trading.js:askTrade/execTrade) وحُذف المنطق المستقل الذي كان هنا:
        • الكمية: غرام → +(qty / TROY).toFixed(4) (تقريب، لا قصّ) ثم wireSz
          بدقة szDp = 4 للغرام وa.szDp لغيره — OM.execQty/OM.execSzDp.
          (كان kanba يقصّ مباشرة: 3.11035 غ ← 0.0999 أونصة بدل 0.1).
        • أمر السوق: IOC بسعر السوق ±5% (OM.SLIP_MARKET) — بلا أي تغيير.
        • المعاينة تستخدم نفس OM.execQty فتطابق ما يُرسَل فعلاً.
      لا حد أدنى محلي مانع (كـmaster): الحاكم هو Hyperliquid —
      "Order must have minimum value of $10". نُظهر فقط تنبيهاً لطيفاً
      بالمعاينة (OM.MIN_NOTIONAL) لو القيمة التقريبية أقل منه، ورسالة
      خطأ عربية واضحة لو رُفض (api.js:tradeErr). أوامر الإغلاق (reduce-only)
      معفاة من الحد على الخادم.

   ✅ الكشف التلقائي حدّي↔إيقاف — مطابق لصفحة "Order types" الرسمية:
        شراء: سعر أعلى من السوق → إيقاف (trigger) · أقل → حدّي عادي
        بيع:  سعر أقل من السوق  → إيقاف (trigger) · أعلى → حدّي عادي
   ✅ tpsl:'sl' لأمر إيقاف الدخول (الحقل مطلوب ببنية trigger؛ لا يؤثر
      على شروط التنفيذ — isMarket/triggerPx/reduceOnly/الجهة هي الحاكمة).
   ✅ grouping:'normalTpsl' لربط دخول (سوق/حدّي) بأمرَي TP/SL بتوقيع واحد.
      لأمر الإيقاف: يُرسَل وحده (grouping:'na') ويُلحَق TP/SL بعد التفعيل
      الفعلي (index.js:_tickPendingWatch) — حزم trigger entry غير موثّق.
   ⚠️ الكمية تُحوَّل بـOM.execQty (قسمة TROY للغرام) — dispToOz للأسعار فقط.
   ✅ calcLiqPrice (positions.js) ترفض أي نتيجة بجهة خاطئة؛ buildPreview
      تعرض «رصيد غير كافٍ» حين لا يغطّي الرصيد الهامش الأولي.
   ✅ الرسوم تُعرَض كنسبة مئوية فقط (feePct) — لا مبالغ بالدولار.
═══════════════════════════════════════════════════════════════ */
'use strict';
var OM = window.__om = window.__om || {};

(function () {

  /* أقل قيمة أمر يقبلها Hyperliquid لأوامر فتح/زيادة المركز (غير reduce-only) */
  OM.MIN_NOTIONAL = 10;

  /* ════ منطق الحجم من master (trading.js:execTrade) ════ */
  OM.execSzDp = function (sym) {
    var a = (typeof ASSETS !== 'undefined' && ASSETS[sym]) || OM.asset(sym);
    return a.gram ? 4 : a.szDp;
  };
  OM.execQty = function (sym, qtyDisp) {
    var a = (typeof ASSETS !== 'undefined' && ASSETS[sym]) || OM.asset(sym);
    return a.gram ? +(qtyDisp / TROY).toFixed(4) : qtyDisp;
  };

  OM.classify = function (isBuy, priceDisp, midDisp) {
    if (!priceDisp || !midDisp) return null;
    if (isBuy) return priceDisp > midDisp ? 'stop' : 'limit';
    return priceDisp < midDisp ? 'stop' : 'limit';
  };

  /* سعر الحد لأمر trigger بعد التفعيل — بنفس اتجاه *أمر التنفيذ نفسه*
     (forBuyOrder) — دالة واحدة لمنع أي عكس عرضي للاتجاه. */
  OM._triggerBoundPx = function (priceOz, forBuyOrder, szDp) {
    var mult = forBuyOrder ? (1 + OM.SLIP_TRIGGER) : (1 - OM.SLIP_TRIGGER);
    return wirePx(priceOz * mult, szDp);
  };

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

  /* opts: { sym, isBuy, qtyDisp, mode:'market'|'priced', priceDisp, midDisp, tpDisp, slDisp }
     يُعيد: { orders:[...], grouping, kind:'market'|'limit'|'stop', triggerPxOz } أو null */
  OM.buildOrders = function (opts) {
    var sym = opts.sym, isBuy = opts.isBuy, qtyDisp = opts.qtyDisp, mode = opts.mode;
    var aApi = (typeof ASSETS !== 'undefined' && ASSETS[sym]) || null;   /* كـmaster: ASSETS[sym] مباشرة */
    if (!aApi || !qtyDisp || qtyDisp <= 0) return null;

    var qtyOz = OM.execQty(sym, qtyDisp);
    var szDp  = OM.execSzDp(sym);
    var out = { orders: [], grouping: 'na', kind: null, triggerPxOz: null };

    if (mode === 'market') {
      if (!opts.midDisp) return null;
      var execOz = dispToOz(sym, opts.midDisp);
      out.kind = 'market';
      out.orders.push({
        a: aApi.idx, b: isBuy,
        p: wirePx(execOz * (isBuy ? 1 + OM.SLIP_MARKET : 1 - OM.SLIP_MARKET), szDp),
        s: wireSz(qtyOz, szDp),
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
          p: wirePx(priceOz, szDp),
          s: wireSz(qtyOz, szDp),
          r: false,
          t: { limit: { tif: 'Gtc' } }
        });
      } else {
        out.kind = 'stop';
        out.triggerPxOz = priceOz;
        out.orders.push({
          a: aApi.idx, b: isBuy,
          p: OM._triggerBoundPx(priceOz, isBuy, szDp),
          s: wireSz(qtyOz, szDp),
          r: false,
          t: { trigger: { isMarket: true, triggerPx: wirePx(priceOz, szDp), tpsl: 'sl' } }
        });
      }
    }

    if (out.kind !== 'stop' && (opts.tpDisp || opts.slDisp)) {
      out.grouping = 'normalTpsl';
      var closeIsBuy = !isBuy;
      if (opts.tpDisp) {
        var tpOz = dispToOz(sym, opts.tpDisp);
        out.orders.push({
          a: aApi.idx, b: closeIsBuy,
          p: OM._triggerBoundPx(tpOz, closeIsBuy, szDp),
          s: wireSz(qtyOz, szDp),
          r: true,
          t: { trigger: { isMarket: true, triggerPx: wirePx(tpOz, szDp), tpsl: 'tp' } }
        });
      }
      if (opts.slDisp) {
        var slOz = dispToOz(sym, opts.slDisp);
        out.orders.push({
          a: aApi.idx, b: closeIsBuy,
          p: OM._triggerBoundPx(slOz, closeIsBuy, szDp),
          s: wireSz(qtyOz, szDp),
          r: true,
          t: { trigger: { isMarket: true, triggerPx: wirePx(slOz, szDp), tpsl: 'sl' } }
        });
      }
    }

    return out;
  };

  /* معاينة حيّة — تعيد استخدام liqPriceDisplay/crossEquityExcluding/feeRate.
     يُعيد: { usd, margin, feePct, liqText, marginShort, belowMin } — الرسوم نسبة فقط. */
  OM.buildPreview = function (sym, isBuy, qtyDisp, refPriceDisp) {
    var a = OM.asset(sym);
    if (!qtyDisp || qtyDisp <= 0 || !refPriceDisp) return null;
    var qtyOz = OM.execQty(sym, qtyDisp);          /* نفس ما يُرسَل فعلاً */
    var refOz = dispToOz(sym, refPriceDisp);
    var usd    = refOz * qtyOz;
    var margin = usd / a.lev;
    var equity = crossEquityExcluding(0);
    var sziLiq = isBuy ? qtyOz : -qtyOz;

    /* الرصيد لا يغطي الهامش الأولي → لا معنى لسعر تصفية (الصفقة مرفوضة
       أو مُصفّاة فوراً) — نُظهر السبب بدل رقم بجهة معكوسة */
    var marginShort = !!a.cross && equity < margin;

    var liq = (typeof liqPriceDisplay === 'function')
      ? liqPriceDisplay(sym, refOz, sziLiq, equity)
      : { text: '—' };

    return {
      usd: usd, margin: margin,
      feePct: feeRatePct(sym),
      liqText: marginShort ? 'رصيد غير كافٍ' : liq.text,
      marginShort: marginShort,
      belowMin: usd < OM.MIN_NOTIONAL
    };
  };

})();
