/* ═══════════════════════════════════════════════════════════════
   js/chart/trading.js — شراء/بيع مباشر من الرسم البياني + إغلاق المركز.

   ✅ لا حد أدنى محلي لقيمة الأمر — الشرط الوحيد كمية > 0 (مطابق للنظام
      الحالي بالكامل). أي رفض يأتي من Hyperliquid ويُترجَم عبر tradeErr.
   ✅ إصلاحات مقارنةً بالنسخة السابقة:
      1) تقريب كمية الغرام كـjs/order/logic.js (OM.execQty): قسمة TROY ثم
         toFixed(4) — النسخة القديمة كانت تقصّ مباشرة (3.11035غ ← 0.0999
         أونصة بدل 0.1).
      2) قراءة نتيجة الأمر الفعلية (statuses[0]): رد "ok" قد يحمل خطأً
         داخلياً (مثل IOC لم يجد مقابلاً) وكانت النسخة القديمة تعرض
         "✅ نجاح" حتى بهذه الحالة. الآن: filled / resting / خطأ صريح.
      3) هامش أمر السوق من OM.SLIP_MARKET (5%) كبقية المشروع بدل 2% وحدها
         (الأضيق كان يفشل IOC بالأسواق الرقيقة).
      4) ضيف غير متصل → _promptConnect() الموحّدة (توست + نبض زر الاتصال).
      5) قفل CM.trading يمنع إرسالين متزامنين من نقرة مزدوجة.
      6) autoSetReferrer() بعد النجاح (كـOM._execute).
   ✅ جديد: تنفيذ فوري (بلا ورقة تأكيد، PIN يبقى) + زر إغلاق المركز من
      اللوحة عبر askClose() الموجودة (نافذة التأكيد نفسها).
═══════════════════════════════════════════════════════════════ */
'use strict';
var CM = window.__cm = window.__cm || {};

(function () {

  CM.needLogin = function () {
    if (typeof State === 'undefined' || State.isGuest || !State.wallet) {
      if (typeof _promptConnect === 'function') _promptConnect();
      else CM.say('سجّل الدخول أولاً', 'err');
      return true;
    }
    return false;
  };

  /* نقطة الدخول الوحيدة من أزرار اللوحة */
  CM.trade = function (isBuy) {
    if (CM.trading) return;
    if (CM.needLogin()) return;
    var qty = CM.readQty();
    if (!qty) { CM.say('أدخل الكمية', 'err'); return; }
    var mid = CM.curPx();
    if (!mid) { CM.say('لا يوجد سعر الآن', 'err'); return; }

    if (CM.instant) {
      var run = function () { CM.execTrade(isBuy, qty); };
      if (typeof requirePin === 'function') requirePin(run); else run();
      return;
    }
    CM.showCf(isBuy, qty, mid);
  };

  CM.showCf = function (isBuy, qty, mid) {
    var a = CM.asset(CM.sym), isGr = CM.isGram(CM.sym);
    var midOz = CM.toOz(CM.sym, mid), qtyOz = isGr ? qty / CM.TROY : qty;
    var usd = (midOz * qtyOz).toFixed(2), mgn = (midOz * qtyOz / a.lev).toFixed(2);

    /* معاينة صفقة لم تُفتح بعد — الصيغة التقريبية المشتركة (calcLiqPrice) */
    var sziLiqOz = isBuy ? qtyOz : -qtyOz;
    var eq    = (typeof crossEquityExcluding === 'function') ? crossEquityExcluding(0) : 0;
    var liqOz = (typeof calcLiqPrice === 'function') ? calcLiqPrice(midOz, sziLiqOz, eq, a.cross, a.lev) : null;
    var liqD  = liqOz ? CM.toDisp(CM.sym, liqOz).toFixed(a.pxDp) : null;
    var fee   = (typeof feeRatePct === 'function') ? feeRatePct(CM.sym) : null;

    CM.hideCf();
    var scr = document.getElementById('chartScreen'); if (!scr) return;
    var ov = document.createElement('div'); ov.id = '_tvcfOv'; ov.className = 'tvcf-ov';
    ov.innerHTML =
      '<div class="tvcf-card">' +
        '<div class="tvcf-hdl"></div>' +
        '<div class="tvcf-title" style="color:' + (isBuy ? '#10b981' : '#ef4444') + '">' + a.icon + ' ' + (isBuy ? 'شراء ▲' : 'بيع ▼') + ' — ' + CM.esc(a.name) + '</div>' +
        '<div class="tvcf-sub">رافعة ' + a.lev + 'x · تأكيد قبل التنفيذ</div>' +
        '<div class="tvcf-rows">' +
          '<div class="tvcf-row"><span class="tvcf-k">الكمية</span><span class="tvcf-v">' + qty.toFixed(a.szDp) + ' ' + CM.esc(a.unit) + '</span></div>' +
          '<div class="tvcf-row"><span class="tvcf-k">السعر</span><span class="tvcf-v">$' + mid.toFixed(a.pxDp) + '</span></div>' +
          '<div class="tvcf-row"><span class="tvcf-k">القيمة</span><span class="tvcf-v">≈ $' + usd + '</span></div>' +
          '<div class="tvcf-row"><span class="tvcf-k">الهامش</span><span class="tvcf-v w">≈ $' + mgn + '</span></div>' +
          '<div class="tvcf-row"><span class="tvcf-k">التصفية</span><span class="tvcf-v ' + (isBuy ? 'r' : 'g') + '">' + (liqD ? '≈ $' + liqD : '—') + '</span></div>' +
          (fee ? '<div class="tvcf-row"><span class="tvcf-k">الرسوم</span><span class="tvcf-v">' + fee + '</span></div>' : '') +
        '</div>' +
        '<div class="tvcf-btns">' +
          '<button class="tvcf-cancel" id="_tvcfC">إلغاء ✕</button>' +
          '<button class="tvcf-exec ' + (isBuy ? 'g' : 'r') + '" id="_tvcfX">' + (isBuy ? '✅ تأكيد الشراء' : '✅ تأكيد البيع') + '</button>' +
        '</div>' +
      '</div>';
    scr.appendChild(ov);
    ov.onclick = function (e) { if (e.target === ov) CM.hideCf(); };
    document.getElementById('_tvcfC').onclick = CM.hideCf;
    document.getElementById('_tvcfX').onclick = function () {
      if (typeof requirePin === 'function') requirePin(function () { CM.execTrade(isBuy, qty); });
      else CM.execTrade(isBuy, qty);
    };
  };

  CM.hideCf = function () {
    var el = document.getElementById('_tvcfOv');
    if (el) el.remove();
  };

  CM.execTrade = async function (isBuy, qty) {
    if (CM.trading) return;
    if (typeof State === 'undefined' || !State.wallet) return;

    var btn = document.getElementById('_tvcfX');
    var isGr = CM.isGram(CM.sym);
    var aApi = isGr ? ((typeof ASSETS !== 'undefined' && ASSETS['GOLD']) || CM.asset('GOLD')) : CM.asset(CM.sym);
    var aDisp = CM.asset(CM.sym);
    var mid = CM.curPx(), midOz = CM.toOz(CM.sym, mid);
    if (!midOz) { CM.hideCf(); CM.say('لا يوجد سعر الآن', 'err'); return; }

    /* نفس منطق الحجم بـjs/order/logic.js */
    var qtyOz = isGr ? +(qty / CM.TROY).toFixed(4) : qty;
    var szDp  = isGr ? 4 : aApi.szDp;
    var slip  = (typeof OM !== 'undefined' && OM.SLIP_MARKET) || 0.05;

    CM.trading = true;
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="tvsp"></span>'; }
    var buyBtn = document.getElementById('_tvBuy'), sellBtn = document.getElementById('_tvSell');
    if (buyBtn) buyBtn.disabled = true;
    if (sellBtn) sellBtn.disabled = true;

    try {
      try { await hlExchange({ type: 'updateLeverage', asset: aApi.idx, isCross: aApi.cross, leverage: aApi.lev }); } catch (e) {}

      var res = await hlExchange({
        type: 'order',
        orders: [{
          a: aApi.idx, b: isBuy,
          p: wirePx(midOz * (isBuy ? 1 + slip : 1 - slip), szDp),
          s: wireSz(qtyOz, szDp),
          r: false,
          t: { limit: { tif: 'Ioc' } }
        }],
        grouping: 'na'
      });

      var st = res && res.response && res.response.data && res.response.data.statuses && res.response.data.statuses[0];
      if (!st || st.error) throw new Error((st && st.error) || 'فشل وضع الأمر');

      CM.hideCf();
      if (st.filled) {
        var f = st.filled;
        var dSz = isGr ? (+f.totalSz * CM.TROY).toFixed(2) : f.totalSz;
        var dPx = (parseFloat(f.avgPx) / (isGr ? CM.TROY : 1)).toFixed(aDisp.pxDp);
        CM.say('✅ مُنفَّذ — ' + aDisp.icon + ' ' + (isBuy ? 'شراء' : 'بيع') + ' ' + dSz + ' ' + (aDisp.unit || '') + ' @ $' + dPx, 'ok', 4500);
        if (typeof playFillSound === 'function') playFillSound();
      } else if (st.resting) {
        CM.say('⏳ أمر معلّق — ' + aDisp.icon + ' ' + qty + ' ' + (aDisp.unit || ''), 'info', 4000);
      } else {
        CM.say('⚠️ لم يُنفَّذ — حاول مجدداً', 'err', 4000);
      }
      if (typeof autoSetReferrer === 'function') autoSetReferrer();
      if (typeof _multiPoll === 'function') _multiPoll();
    } catch (e) {
      CM.say(typeof tradeErr === 'function' ? tradeErr(e.message) : '❌ ' + String(e.message).slice(0, 100), 'err', 5500);
      if (btn) { btn.disabled = false; btn.innerHTML = isBuy ? '✅ تأكيد الشراء' : '✅ تأكيد البيع'; }
    } finally {
      CM.trading = false;
      if (buyBtn) buyBtn.disabled = false;
      if (sellBtn) sellBtn.disabled = false;
    }
  };

  /* إغلاق مركز الأصل الحالي — عبر نافذة التأكيد الموجودة (trading.js الرئيسي) */
  CM.closeCurrent = function () {
    var i = CM.posIndex();
    if (i < 0) { CM.say('لا يوجد مركز مفتوح لهذا الأصل', 'info'); return; }
    if (typeof askClose === 'function') askClose(i);
  };

})();
