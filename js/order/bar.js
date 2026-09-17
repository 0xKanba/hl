/* ═══════════════════════════════════════════════════════════════
   js/order/bar.js — شريط "فتح صفقة جديدة" بشاشة الرئيسية.

   ✅ بلا أي HTML بـindex.html — الشريط يُبنى هنا بالكامل وقت التشغيل،
      تماماً كما تبني js/c.js نافذة التقويم وjs/agents.js نافذة الوكلاء.
      index.html بقي ملفاً واحداً موحّداً لا يفعل شيئاً سوى تحميل
      css/js (تطبيق صفحة واحدة بالمعنى الحرفي).

   ✅ يحل محل بانر الضيف القديم (.guest-banner بـauth.js) نهائياً:
      كان شريطان يتبادلان حسب حالة الاتصال ("اربط محفظتك…/اتصال ←"
      للضيف، ولا شيء للمتصل). الآن شريط واحد دائم: "فتح صفقة جديدة"
      + زر "فتح". الضيف لا يفقد التوجيه — OrderModule.open() نفسها
      تستدعي _promptConnect() (توست + نبض زر الاتصال) قبل أي شيء آخر،
      فالمسار أوضح: نية المستخدم أولاً، ثم ما يلزم لتحقيقها.

   ✅ التوقيت (مقصود، لا مصادفة):
      1) الإدراج فوري — السكربت يُحمَّل بعد وسم #screenHome بالـDOM،
         فلا انتظار DOMContentLoaded إطلاقاً عند المسار الطبيعي (فحص
         readyState يغطي أي ترتيب تحميل مستقبلي بلا افتراض).
      2) الشريط لا ينتظر شبكة ولا محفظة ولا هوية — يظهر بأول إطار رسم
         مع بقية الرئيسية، لا بعدها بوميض.
      3) بناء مسبق هادئ لهيكل الشاشة كاملاً وقت خمول المتصفح
         (requestIdleCallback) — فأول نقرة تفتح شاشة مبنية جاهزة
         بدل بنائها لحظتها. لا يزاحم الإقلاع: يعمل بعد استقراره فقط،
         وبمهلة قصوى 2.5 ثانية لضمان التنفيذ حتى لو لم يخمل المتصفح.
═══════════════════════════════════════════════════════════════ */
'use strict';
var OM = window.__om = window.__om || {};

(function () {

  var BAR_ID    = 'omBar';
  var MAX_TRIES = 20;

  function _openOrder() {
    if (typeof OrderModule === 'undefined' || typeof OrderModule.open !== 'function') return;
    OrderModule.open(typeof State !== 'undefined' ? State.asset : null);
  }

  function _build() {
    if (document.getElementById(BAR_ID)) return true;
    var host = document.querySelector('#screenHome .screen-scroll');
    if (!host) return false;

    var bar = document.createElement('div');
    bar.id        = BAR_ID;
    bar.className = 'om-bar';
    bar.setAttribute('role', 'button');
    bar.setAttribute('tabindex', '0');
    bar.innerHTML =
      '<span class="om-bar-lbl">فتح صفقة جديدة</span>' +
      '<button class="om-bar-btn" type="button" tabindex="-1">فتح</button>';

    /* مستمع واحد على الحاوية — النقر على الزر يصعد إليها، فلا ازدواج
       تنفيذ ولا حاجة لمستمع ثانٍ على الزر نفسه. */
    bar.addEventListener('click', _openOrder);
    bar.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _openOrder(); }
    });

    host.insertBefore(bar, host.firstChild);
    return true;
  }

  /* بناء هيكل الشاشة + ربط أحداثها مسبقاً — idempotent بالكامل
     (ensureScreen تخرج فوراً لو الشاشة موجودة، و_wired يمنع ربطاً
     مكرراً)، والشاشة تبقى display:none حتى .open فلا أثر بصري. */
  function _prebuild() {
    try {
      if (typeof OM.ensureScreen === 'function') OM.ensureScreen();
      if (!OM._wired && typeof OM._wireEvents === 'function') { OM._wireEvents(); OM._wired = true; }
    } catch (e) { console.warn('[order/bar] prebuild', e); }
  }

  function _init(tries) {
    if (!_build() && (tries || 0) < MAX_TRIES) {
      requestAnimationFrame(function () { _init((tries || 0) + 1); });
      return;
    }
    var idle = window.requestIdleCallback || function (cb) { return setTimeout(cb, 500); };
    idle(_prebuild, { timeout: 2500 });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { _init(0); });
  else _init(0);

})();
