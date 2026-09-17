/* ═══════════════════════════════════════════════════════════════
   js/order/book.js — عمق السوق (L2 Book) + السبريد.
   ✅ يطابق حرفياً تنسيق WsBook الرسمي (websocket/subscriptions):
      { coin, levels:[bidsArr, asksArr], time }، وكل مستوى بمصفوفتي
      bids/asks هو { px, sz, n } — bids[0]/asks[0] هما أفضل سعر (الأقرب
      للسبريد) دائماً حسب نفس التوثيق. ws.js يدعم الاشتراك بنوع l2Book
      أصلاً (_subKey/_identify) — هذا الملف أول مستهلك فعلي له بالمشروع.
   ✅ تحويل أونصة↔غرام لـXAU يطابق بقية المشروع تماماً (نفس ما تفعله
      chart/datafeed.js وprices.js لنفس الزوج GOLD/XAU).
   ✅ كاش لقطة العمق لكل عملة (OM._bookCache) — يجعل فتح الشاشة أو
      تبديل الأصل يعرض عمقاً فوراً بدل فراغ بانتظار الخادم. الرسم
      نفسه يتوقف تماماً وقت إغلاق الشاشة (لا عمل DOM بلا مُشاهد).
═══════════════════════════════════════════════════════════════ */
'use strict';
var OM = window.__om = window.__om || {};

(function () {

  OM.bookConn = function (sym) {
    OM.bookClose();
    if (typeof HL === 'undefined') return;
    var coin = OM.coin(sym);

    /* ✅ رسم فوري من آخر لقطة محفوظة لنفس العملة (إن وُجدت) — فتح/تبديل
       الأصل يعرض عمقاً حقيقياً باللحظة صفر بدل لوحة باهتة تنتظر الدفعة
       التالية من الخادم (l2Book تُدفَع بكل بلوك مضى عليه ≥0.5 ثانية
       حسب التوثيق الرسمي، فالانتظار محسوس فعلاً). اللقطة المحفوظة قد
       تكون قديمة بأجزاء من الثانية — تُستبدل بأول دفعة حيّة تصل. */
    var cached = OM._bookCache && OM._bookCache[coin];
    if (cached) OM._renderBook(sym, cached);
    else {
      var wrap = document.getElementById('omDepthWrap');
      if (wrap) wrap.classList.add('om-depth-loading');
    }

    OM.bookUnsub = HL.subscribe({ type: 'l2Book', coin: coin }, function (data) {
      if (OM._bookCache) OM._bookCache[coin] = data;
      OM._renderBook(sym, data);
    });
  };

  OM.bookClose = function () {
    if (OM.bookUnsub) { try { OM.bookUnsub(); } catch (e) {} OM.bookUnsub = null; }
  };

  OM._renderBook = function (sym, data) {
    if (sym !== OM.sym || !data || !Array.isArray(data.levels)) return;
    if (!OM.visible) return; /* الشاشة مغلقة — لا رسم؛ الكاش أعلاه كافٍ للفتح التالي */
    var bidsRaw = data.levels[0] || [];
    var asksRaw = data.levels[1] || [];
    var a       = OM.asset(sym);
    var isGram  = OM.isGram(sym);
    var n       = OM.DEPTH_LEVELS;

    function conv(levels) {
      return levels.slice(0, n).map(function (lv) {
        var px = parseFloat(lv.px), sz = parseFloat(lv.sz);
        return { px: isGram ? px / TROY : px, sz: isGram ? sz * TROY : sz };
      });
    }

    var bids = conv(bidsRaw);
    var asks = conv(asksRaw);

    var maxSz = 0.0001;
    bids.forEach(function (l) { if (l.sz > maxSz) maxSz = l.sz; });
    asks.forEach(function (l) { if (l.sz > maxSz) maxSz = l.sz; });

    var szDp   = isGram ? 2 : a.szDp;
    var bidsEl = document.getElementById('omDepthBids');
    var asksEl = document.getElementById('omDepthAsks');
    if (bidsEl) bidsEl.innerHTML = bids.map(function (l) { return OM._depthRowHtml(l, a, maxSz, szDp, 'bid'); }).join('');
    /* الأفضل (asks[0]) يُرسَم أقرب للسبريد — بالأسفل ضمن قائمة الطلبات
       المعروضة من الأعلى للأسفل، فنعكس ترتيب المصفوفة للعرض فقط. */
    if (asksEl) asksEl.innerHTML = asks.slice().reverse().map(function (l) { return OM._depthRowHtml(l, a, maxSz, szDp, 'ask'); }).join('');

    var wrap = document.getElementById('omDepthWrap');
    if (wrap) wrap.classList.remove('om-depth-loading');

    if (bids.length && asks.length) {
      var bestBid = bids[0].px, bestAsk = asks[0].px;
      var spread  = Math.max(0, bestAsk - bestBid);
      var mid     = (bestBid + bestAsk) / 2;
      var pct     = mid ? (spread / mid) * 100 : 0;
      var sv = document.getElementById('omSpreadVal');
      if (sv) sv.textContent = 'السبريد: $' + fmt(spread, a.pxDp) + ' (' + pct.toFixed(3) + '%)';
      var mv = document.getElementById('omDepthMid');
      if (mv) mv.textContent = '$' + fmt(mid, a.pxDp);
    }
  };

  OM._depthRowHtml = function (l, a, maxSz, szDp, side) {
    var pct = maxSz ? Math.min(100, (l.sz / maxSz) * 100) : 0;
    var cls = side === 'bid' ? 'up' : 'dn';
    return '<div class="om-drow" data-om-px="' + l.px + '">' +
      '<div class="om-dbar ' + cls + '" style="width:' + pct.toFixed(0) + '%"></div>' +
      '<span class="om-dpx ' + cls + '">' + fmt(l.px, a.pxDp) + '</span>' +
      '<span class="om-dsz">' + l.sz.toFixed(szDp) + '</span>' +
    '</div>';
  };

})();
