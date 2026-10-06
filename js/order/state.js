/* ═══════════════════════════════════════════════════════════════
   js/order/state.js — حالة وحدة "فتح صفقة جديدة" المشتركة (OM)
   نفس أسلوب js/chart/*.js (window.__om بدل window.__cm) — `var` عمداً
   لا `const` (تعريفات const بمستوى السكربت الأعلى تتشارك نطاقاً معجمياً
   واحداً عبر وسوم <script> الكلاسيكية فإعادة تعريفها تكسر الصفحة).
   التحويلات أونصة↔عرض (ozToDisp/dispToOz/szToDisp) من js/tpsl.js.
   ✅ لا حد أدنى لقيمة الأمر — الشرط الوحيد qty > 0 (مطابق للنظام القديم).
═══════════════════════════════════════════════════════════════ */
'use strict';
var OM = window.__om = window.__om || {};

(function () {

  /* هامش أمر السوق (IOC) — يطابق trading.js القديمة */
  OM.SLIP_MARKET   = 0.05;
  /* هامش سعر الحد لأوامر التريغر — يطابق tpsl.js/placeNativeTpsl */
  OM.SLIP_TRIGGER  = 0.10;
  /* مستويات العمق المعروضة لكل جهة */
  OM.DEPTH_LEVELS  = 7;
  /* أوامر إيقاف بانتظار إلحاق TP/SL بعد التفعيل (index.js:_tickPendingWatch) */
  OM.PENDING_KEY_PREFIX = 'hl_om_pending_';
  OM.PENDING_POLL_MS    = 4000;
  /* ✅ مهلة سماح (ms) بعد وضع أمر الإيقاف قبل اعتباره "أُلغي بلا تنفيذ":
     State.openOrders تتأخر بعد الوضع (تصل بنبضة orderUpdates ثم إعادة جلب
     frontendOpenOrders) — بلا هذه المهلة كان المراقب يرى "غير مفتوح وغير
     منفَّذ" فيمسح الإدخال فوراً ولا يُلحَق TP/SL أبداً. */
  OM.PENDING_GRACE_MS     = 20000;
  /* أقصى انتظار (ms) لظهور المركز بعد ثبوت التنفيذ بـfillsCache — نبضتا
     userFills وclearinghouseState مستقلتان وقد تسبق إحداهما الأخرى. */
  OM.PENDING_FILL_WAIT_MS = 45000;

  OM.NAV_ASSETS = [
    { sym:'CL',     ar:'النفط',     icon:'🛢' },
    { sym:'GOLD',   ar:'الذهب',     icon:'🟡' },
    { sym:'XAU',    ar:'غرام ذهب',  icon:'⚖️' },
    { sym:'SILVER', ar:'الفضة',     icon:'⚪' },
    { sym:'NQ',     ar:'ناسداك',    icon:'📊' },
  ];

  OM.visible       = false;
  OM.sym           = 'CL';
  OM.side          = true;      // true=شراء · false=بيع
  OM.mode          = 'market';  // 'market' | 'priced'
  OM.tpslOpen      = false;
  OM.assetDropOpen = false;
  OM.bboUnsub      = null;
  OM.bookUnsub     = null;
  OM._pendingTimer = null;
  OM._qtyUserEdited = false;

  /* طبقة التوقيت: _rafPending يجمّع نبضات BBO بتحديث واحد لكل إطار،
     _bookCache لقطة عمق لكل عملة تُرسَم فوراً عند الفتح، _paint آخر
     نص كُتب فعلاً (كتابة مشروطة). */
  OM._rafPending = false;
  OM._bookCache  = {};
  OM._paint      = {};

  OM.asset = function (s) {
    return (typeof ASSETS !== 'undefined' && ASSETS[s]) ||
      { pxDp:2, szDp:2, name:s, icon:'📊', unit:'', lev:10, idx:0, cross:true, coin:'xyz:'+s };
  };
  OM.coin = function (s) {
    if (s === 'XAU') return 'xyz:GOLD';
    var a = OM.asset(s);
    return a.coin || ('xyz:' + s);
  };
  OM.isGram = function (s) { return s === 'XAU'; };

  /* ⚠️ كمية العرض → أونصة تقسم على TROY (لا تضرب) — dispToOz للأسعار فقط */
  OM.szToOz = function (s, dispSz) { return OM.isGram(s) ? dispSz / TROY : dispSz; };
  OM.dark   = function () { return (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark'; };

  /* أوامر إيقاف معلّقة — تخزين محلي معزول بعنوان المحفظة */
  OM.pendingKey = function (addr) { return OM.PENDING_KEY_PREFIX + String(addr || '').toLowerCase(); };
  OM.loadPending = function (addr) {
    try { return JSON.parse(localStorage.getItem(OM.pendingKey(addr)) || '[]'); }
    catch (e) { return []; }
  };
  OM.savePending = function (addr, list) {
    try { localStorage.setItem(OM.pendingKey(addr), JSON.stringify(list)); } catch (e) {}
  };
  OM.addPending = function (addr, entry) {
    var list = OM.loadPending(addr);
    list.push(entry);
    OM.savePending(addr, list);
  };
  OM.removePending = function (addr, oid) {
    var list = OM.loadPending(addr).filter(function (e) { return String(e.oid) !== String(oid); });
    OM.savePending(addr, list);
  };
  /* يُعلّم الإدخال "شوهد مفتوحاً فعلاً بقائمة الأوامر" — بعدها فقط يصحّ أن
     نعتبر اختفاءه بلا fill إلغاءً حقيقياً (وليس تأخّر حالة محلية). */
  OM.markPendingSeen = function (addr, oid) {
    var list = OM.loadPending(addr);
    var hit = false;
    list.forEach(function (e) { if (String(e.oid) === String(oid) && !e.seen) { e.seen = true; hit = true; } });
    if (hit) OM.savePending(addr, list);
  };

})();
