/* ═══════════════════════════════════════════════════════════════
   js/order/state.js — حالة وحدة "فتح صفقة جديدة" المشتركة (OM)
   ✅ جديد — يستبدل تدفّق الشراء/البيع القديم بشاشة الرئيسية بالكامل.
      نفس أسلوب js/chart/*.js حرفياً (window.__om بدل window.__cm) —
      عدة ملفات تشارك حالة واحدة عبر IIFE مُلحَقة بكائن عام واحد؛ `var`
      عمداً لا `const` (تعريفات const بمستوى السكربت الأعلى تتشارك نطاقاً
      معجمياً واحداً عبر كل وسوم <script> الكلاسيكية بالصفحة، فإعادة
      تعريفها بملفين منفصلين يكسر الصفحة — راجع chart/state.js لنفس
      الملاحظة بالتفصيل). لا اعتماد فعلي على تحميل chart/*.js أولاً —
      كل ما يحتاجه هذا المشروع مُعاد تعريفه محلياً هنا (NAV_ASSETS مثلاً)
      عمداً، فالوحدتان مستقلّتان تماماً رغم تشابه بعض الأنماط.
   ✅ التحويلات أونصة↔عرض (ozToDisp/dispToOz/szToDisp) تُستخدَم مباشرة
      من js/tpsl.js (عام أصلاً، مُحمَّل قبل هذا الملف) — لا تكرار محلي.
═══════════════════════════════════════════════════════════════ */
'use strict';
var OM = window.__om = window.__om || {};

(function () {

  /* ══════════ CONSTANTS ══════════ */
  /* هامش أمر السوق (IOC) — يطابق حرفياً trading.js/execTrade القديمة */
  OM.SLIP_MARKET   = 0.05;
  /* هامش السعر الحدّي لأوامر التريغر (تصبح IOC فور التفعيل) — يطابق
     حرفياً tpsl.js/placeNativeTpsl، نفس الفكرة: وسادة تضمن التنفيذ
     الفعلي بلا تعريض المستخدم لانزلاق سعر غير محدود. */
  OM.SLIP_TRIGGER  = 0.10;
  /* عدد مستويات العمق المعروضة لكل جهة (شراء/بيع) بلوحة السوق */
  OM.DEPTH_LEVELS  = 7;
  /* ✅ الحد الأدنى الرسمي لقيمة أي أمر على Hyperliquid — موثّق صراحة
     بصفحة error-responses الرسمية: "Order must have minimum value of
     10 {quote_token}" (الاستثناء الوحيد: أمر reduce-only يُغلق مركزاً
     بالكامل، وهذا ليس مسار هذه الشاشة إطلاقاً). نفحصه محلياً بالعربية
     قبل الإرسال بدل ترك المستخدم يصطدم برفض إنجليزي خام من الخادم. */
  OM.MIN_ORDER_USD = 10;
  /* أوامر إيقاف (trigger) بانتظار تفعيلها ثم إلحاق TP/SL تلقائياً بعدها
     — راجع index.js:_watchPending لسبب هذا التصميم بدل محاولة حزم
     trigger entry ضمن normalTpsl مباشرة (سلوك غير موثّق رسمياً). */
  OM.PENDING_KEY_PREFIX = 'hl_om_pending_';
  OM.PENDING_POLL_MS    = 4000;

  OM.NAV_ASSETS = [
    { sym:'CL',     ar:'النفط',     icon:'🛢' },
    { sym:'GOLD',   ar:'الذهب',     icon:'🟡' },
    { sym:'XAU',    ar:'غرام ذهب',  icon:'⚖️' },
    { sym:'SILVER', ar:'الفضة',     icon:'⚪' },
    { sym:'NQ',     ar:'ناسداك',    icon:'📊' },
  ];

  /* ══════════ MODULE STATE ══════════ */
  OM.visible       = false;
  OM.sym           = 'CL';
  OM.side          = true;      // true=شراء · false=بيع
  OM.mode          = 'market';  // 'market' | 'priced' ("طلب بسعر محدد")
  OM.tpslOpen      = false;
  OM.assetDropOpen = false;
  OM.bboUnsub      = null;
  OM.bookUnsub     = null;
  OM._pendingTimer = null;
  OM._qtyUserEdited = false;

  /* ══════════ طبقة التوقيت/التزامن ══════════
     _rafPending: نبضات BBO تصل عدة مرات بالثانية، وكل واحدة كانت تُعيد
     بناء المعاينة بالكامل (innerHTML) فوراً. الآن تُجمَّع كل النبضات
     الواردة ضمن نفس الإطار بتحديث واحد عبر requestAnimationFrame —
     الرسم يبقى بسلاسة 60fps مهما تسارع السوق، بلا أي تأخير محسوس
     (الإطار التالي = أقل من 17ms).
     _bookCache: آخر لقطة عمق مُعالَجة لكل عملة — تُرسَم فوراً عند
     إعادة فتح نفس الأصل بدل انتظار الدفعة التالية من الخادم (حتى
     نصف ثانية حسب التوثيق الرسمي لـl2Book).
     _paint: آخر ما كُتب فعلاً بالـDOM — يمنع كتابة نص مطابق لما هو
     معروض أصلاً (كل كتابة تعني إعادة تخطيط محتملة بلا فائدة). */
  OM._rafPending = false;
  OM._bookCache  = {};
  OM._paint      = {};

  /* ══════════ HELPERS ══════════ */
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

  /* ⚠️ حرج — تحويل *الكمية* من وحدة العرض للأونصة يقسم على TROY، لا
     يضربه. tpsl.js يوفّر dispToOz للأسعار فقط (غرام→أونصة = ×TROY،
     لأن سعر الأونصة أكبر) وszToDisp للكميات بالاتجاه المعاكس
     (أونصة→غرام = ×TROY، لأن الأونصة الواحدة 31.1 غراماً) — لكن لا
     يوجد مقابل لـ"كمية عرض → أونصة". استخدام dispToOz للكمية بالخطأ
     يعني أمراً أكبر بـTROY² (≈967×) على الذهب/غرام. هذه الدالة هي
     المسار الوحيد المسموح لتحويل الكميات بهذه الوحدة، وتطابق حرفياً
     ما كانت تفعله trading.js القديمة: `a.gram ? qty / TROY : qty`. */
  OM.szToOz = function (s, dispSz) { return OM.isGram(s) ? dispSz / TROY : dispSz; };
  OM.dark   = function () { return (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark'; };

  /* ══════════ أوامر إيقاف معلّقة — تخزين محلي معزول بعنوان المحفظة ══════════ */
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

})();
