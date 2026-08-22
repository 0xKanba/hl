/* ═══════════════════════════════════════════════════════════════
   js/chart/trading.js — ورقة تأكيد الشراء/البيع + تنفيذ الصفقة.
   تُستدعى الآن من اللوحة العائمة الجديدة (راجع ui.js:renderFloatTrade)
   بدل شريط التداول الثابت القديم — المنطق نفسه بالضبط بلا أي تغيير
   بخطوات الأمان (نفس ورقة التأكيد قبل أي توقيع).
═══════════════════════════════════════════════════════════════ */
'use strict';
var CM = window.__cm = window.__cm || {};

(function () {

  CM.showCf = function (isBuy) {
    if (typeof State === 'undefined' || !State.wallet) {
      if (typeof toast !== 'undefined') toast('سجّل الدخول أولاً', 'err');
      return;
    }
    var qtyEl = document.getElementById('_tvQty');
    var qty = parseFloat((qtyEl && qtyEl.value) || 0);
    if (!qty || qty <= 0) { if (typeof toast !== 'undefined') toast('أدخل الكمية', 'err'); return; }
    var a = CM.asset(CM.sym), isGr = CM.isGram(CM.sym), mid = CM.curPx();
    if (!mid) { if (typeof toast !== 'undefined') toast('لا يوجد سعر', 'err'); return; }
    var midOz = CM.toOz(CM.sym, mid), qtyOz = isGr ? qty / CM.TROY : qty;
    var usd = (midOz * qtyOz).toFixed(2), mgn = (midOz * qtyOz / a.lev).toFixed(2);
    /* صيغة Cross الحقيقية المشتركة (calcLiqPrice) — معاينة صفقة لم
       تُفتح بعد، ما فيه position.liquidationPx حقيقي بعد لنقرأه. */
    var sziLiqOz = isBuy ? qtyOz : -qtyOz;
    var eq    = (typeof crossEquityExcluding === 'function') ? crossEquityExcluding(0) : 0;
    var liqOz = (typeof calcLiqPrice === 'function') ? calcLiqPrice(midOz, sziLiqOz, eq, a.cross, a.lev) : null;
    var liqD  = liqOz ? CM.toDisp(CM.sym, liqOz).toFixed(a.pxDp) : null;

    CM.hideCf();
    var scr = document.getElementById('chartScreen'); if (!scr) return;
    var ov = document.createElement('div'); ov.id = '_tvcfOv'; ov.className = 'tvcf-ov';
    ov.innerHTML =
      '<div class="tvcf-card">' +
        '<div class="tvcf-hdl"></div>' +
        '<div class="tvcf-title" style="color:' + (isBuy ? '#00e676' : '#ff3d3d') + '">' + a.icon + ' ' + (isBuy ? 'شراء ▲' : 'بيع ▼') + ' — ' + a.name + '</div>' +
        '<div class="tvcf-sub">رافعة ' + a.lev + 'x · تأكيد قبل التنفيذ</div>' +
        '<div class="tvcf-rows">' +
          '<div class="tvcf-row"><span class="tvcf-k">الكمية</span><span class="tvcf-v">' + qty.toFixed(a.szDp) + ' ' + a.unit + '</span></div>' +
          '<div class="tvcf-row"><span class="tvcf-k">السعر</span><span class="tvcf-v">$' + mid.toFixed(a.pxDp) + '</span></div>' +
          '<div class="tvcf-row"><span class="tvcf-k">القيمة</span><span class="tvcf-v">≈ $' + usd + '</span></div>' +
          '<div class="tvcf-row"><span class="tvcf-k">الهامش</span><span class="tvcf-v w">≈ $' + mgn + '</span></div>' +
          '<div class="tvcf-row"><span class="tvcf-k">التصفية</span><span class="tvcf-v ' + (isBuy ? 'r' : 'g') + '">' + (liqD ? '≈ $' + liqD : '—') + '</span></div>' +
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
      if (typeof requirePin !== 'undefined') requirePin(function () { CM.execTrade(isBuy, qty); });
      else CM.execTrade(isBuy, qty);
    };
  };

  CM.hideCf = function () {
    var el = document.getElementById('_tvcfOv');
    if (el) el.remove();
  };

  CM.execTrade = async function (isBuy, qty) {
    if (!State || !State.wallet) return;
    var btn = document.getElementById('_tvcfX');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="tvsp"></span>'; }
    var isGr = CM.isGram(CM.sym);
    var aApi = isGr ? ((typeof ASSETS !== 'undefined' && ASSETS['GOLD']) || CM.asset('GOLD')) : CM.asset(CM.sym);
    var mid = CM.curPx(), midOz = CM.toOz(CM.sym, mid);
    if (!midOz) { CM.hideCf(); return; }
    var qtyOz = isGr ? qty / CM.TROY : qty;
    try {
      try { await hlExchange({ type: 'updateLeverage', asset: aApi.idx, isCross: aApi.cross, leverage: aApi.lev }); } catch (e) {}
      await hlExchange({
        type: 'order',
        orders: [{
          a: aApi.idx, b: isBuy,
          p: wirePx(midOz * (isBuy ? 1.02 : 0.98), aApi.szDp),
          s: wireSz(qtyOz, aApi.szDp),
          r: false,
          t: { limit: { tif: 'Ioc' } }
        }],
        grouping: 'na'
      });
      CM.hideCf();
      var disp = isGr ? qty.toFixed(2) + ' غرام' : qty.toFixed(aApi.szDp) + ' ' + (aApi.unit || '');
      if (typeof toast !== 'undefined') toast('✅ ' + aApi.icon + ' ' + (isBuy ? 'شراء' : 'بيع') + ' ' + disp, 'ok', 4000);
      if (typeof _multiPoll !== 'undefined') setTimeout(_multiPoll, 2000);
    } catch (e) {
      if (typeof toast !== 'undefined')
        toast(typeof tradeErr !== 'undefined' ? tradeErr(e.message) : '❌ ' + e.message.slice(0, 100), 'err', 5000);
      if (btn) { btn.disabled = false; btn.innerHTML = isBuy ? '✅ تأكيد الشراء' : '✅ تأكيد البيع'; }
    }
  };

})();
