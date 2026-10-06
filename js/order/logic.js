/* ═══════════════════════════════════════════════════════════════
   js/order/logic.js — تصنيف الأمر (حدّي/إيقاف)، بناء حمولة Hyperliquid،
   والحسابات المعاينة (قيمة/هامش/تصفية/رسوم).

   ✅ الكشف التلقائي حدّي↔إيقاف — مطابق لصفحة "Order types" الرسمية:
        شراء: سعر أعلى من السوق → إيقاف (trigger) · أقل → حدّي عادي
        بيع:  سعر أقل من السوق  → إيقاف (trigger) · أعلى → حدّي عادي
   ✅ tpsl:'sl' لأمر إيقاف الدخول (الحقل مطلوب ببنية trigger؛ لا يؤثر
      على شروط التنفيذ — isMarket/triggerPx/reduceOnly/الجهة هي الحاكمة).
   ✅ grouping:'normalTpsl' لربط دخول (سوق/حدّي) بأمرَي TP/SL بتوقيع واحد.
      لأمر الإيقاف: يُرسَل وحده (grouping:'na') ويُلحَق TP/SL بعد التفعيل
      الفعلي (index.js:_tickPendingWatch) — حزم trigger entry غير موثّق.
   ⚠️ الكمية تُحوَّل بـOM.szToOz (قسمة TROY للغرام) — dispToOz للأسعار فقط.
═══════════════════════════════════════════════════════════════ */
'use strict';
var OM = window.__om = window.__om || {};

(function () {

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

  /* معاينة حيّة — تعيد استخدام liqPriceDisplay/crossEquityExcluding/feeRate */
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
