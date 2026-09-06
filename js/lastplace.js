/* ═══════════════════════════════════════════════════════════════
   lastplace.js — يتذكر آخر "مكان" كان فيه المستخدم بالتطبيق (الشاشة
   الحالية/الأصل النشط/نافذة الدرج المفتوحة إن وُجدت) ويستعيده تلقائياً
   بعد أي إعادة تحميل للصفحة أو إغلاق وفتح جديد للمتصفح — بلا أي خادم،
   نفس فلسفة كل تخزين محلي آخر بالمشروع.

   ✅ التصميم مقصود ليكون إضافياً بالكامل — بلا أي تعديل على الدوال
      الأصلية (switchScreen/switchAsset/openModal/Agents.openModal/
      openCalendar...). المراقبة تتم بقراءة كلاسات DOM الموجودة أصلاً
      فقط (.hidden على الشاشات، .open على النوافذ، بنفس الاصطلاح
      المستخدم بكل ملفات المشروع) — لقطة دورية كل ثانيتين + حفظ فوري
      إضافي عند إخفاء التبويب (visibilitychange) أو إغلاقه/مغادرته
      (pagehide، وليس beforeunload عمداً — الأخيرة قد تعطّل bfcache
      بمتصفحات الموبايل، لا داعي لها هنا). لا MutationObserver — لقطة
      دورية بسيطة كافية تماماً لهذا الغرض (النجاة من إعادة تحميل/إغلاق
      متعمَّد، لا تتبع فوري لكل تفاعل).

      الاستعادة نفسها تمر حصراً عبر: (أ) استدعاء مباشر لـswitchAsset/
      switchScreen (دالتان عامتان، بلا أي حراسة دخول تستحق تكرارها)،
      أو (ب) محاكاة نقرة حقيقية (.click()) على نفس زر الدرج الأصلي
      (optDeposit/optWithdraw/optHistory/optCalendar/optAgents) —
      فتُطبَّق كل حراسات ذلك الزر بالضبط كما هي (تسجيل دخول مطلوب؟
      وضع رابط وكيل يحظرها؟...) بلا أي تكرار أو احتمال انحراف مستقبلي
      عن السلوك الحقيقي لو تغيّرت تلك الحراسات لاحقاً بملف آخر.

   ✅ قائمة النوافذ القابلة للاستعادة ضيّقة عمداً — فقط الخمس التي لا
      تعتمد على حالة صفقة عابرة بالذاكرة (State.pendingTrade/pendingTP/
      pendingSL/pendingClose، أو فهرس صفقة معيّن بمصفوفة State.positions
      التي تُعاد تعبئتها بترتيب مختلف تماماً بعد أي إعادة تحميل):
      إيداع (modalDeposit) · سحب (modalWithdraw) · التأريخ (modalHistory)
      · التقويم (calMod) · الوكلاء (agModal). أي نافذة تأكيد تداول
      (شراء/بيع/إغلاق/TP/SL/تفاصيل صفقة) تُستبعد عمداً — استعادتها إما
      تعرض محتوى فارغاً/مكسوراً، أو الأخطر: لو ارتبط زر التنفيذ بداخلها
      بفهرس صفقة (index) وأُعيد تحميل الصفقات بترتيب مختلف، قد يُنفَّذ
      إجراء على صفقة غير التي قصدها المستخدم أصلاً — مخاطرة لا تستحق
      الفائدة الجمالية لاستعادتها. نافذة معلومات الأصل (؟) استُبعدت
      أيضاً لقيمتها المنخفضة مقابل تعقيد إضافي (تحتاج تذكّر أي أصل أيضاً).

   ✅ FIX توقيت جوهري (2026-08) — كانت الاستعادة تنتظر State._sessionTimer
      (لا يُضبط إلا بعد اكتمال initAccountFeeds كاملة — عدة طلبات شبكة
      متوازية، ثانية أو ثانيتين على اتصال عادي). لكن كل ما تحتاجه فعلياً
      هذه الاستعادة هو معرفة "ضيف أم متصل" — وهذا يُحسَم متزامناً، بلا
      أي انتظار شبكة، بأول سطر بكل من initGuestMode()/_onWalletConnected()/
      _onAgentLinkConnected() (راجع state.js/app.js/auth.js). الآن
      تنتظر State._identityReady تحديداً (فحص كل 15ms بدل 120ms) —
      عملياً فوري (أقل من عشرات المللي ثانية) بدل ثانية أو ثانيتين.
      State._sessionTimer يبقى فحصاً احتياطياً إضافياً فقط (OR)، لا
      أساسياً، في حال فشل ضبط العلم الجديد لسبب غير متوقع مستقبلاً.

   ✅ قفل PIN: منفصل تماماً عن هذا الملف الآن ولا علاقة له باستعادة
      "آخر مكان" — يُعالَج بمساره الخاص الأسرع (فوري، بلا أي انتظار
      إطلاقاً؛ راجع app.js أعلى معالج DOMContentLoaded + css/base.css
      لسكربت <head> بـindex.html الذي يمنع أي وميض حتى قبل وصول تنفيذ
      JS لتلك النقطة). لا حاجة لأي تنسيق بينهما: modalPIN يقع بترتيب
      DOM بعد كل النوافذ المُستعادة هنا، فيُرسَم دائماً فوقها بصرياً
      بصرف النظر عن توقيت فتح كل منها — يحجب أي تفاعل حتى يُفتح القفل،
      وما تحته يبقى مستعاداً بالضبط كما كان.
═══════════════════════════════════════════════════════════════ */
'use strict';

(function () {

  /* النوافذ الآمنة للاستعادة فقط — راجع تعليق رأس الملف لسبب هذا الحصر */
  const RESTORABLE_MODALS = ['modalDeposit', 'modalWithdraw', 'modalHistory', 'calMod', 'agModal'];
  const BTN_FOR_MODAL = {
    modalDeposit: 'optDeposit',
    modalWithdraw: 'optWithdraw',
    modalHistory: 'optHistory',
    calMod: 'optCalendar',
    agModal: 'optAgents',
  };
  const VALID_SCREENS = ['home', 'markets', 'chart'];
  const SNAPSHOT_INTERVAL_MS = 2000;
  const READY_POLL_MS = 15;
  const READY_TIMEOUT_MS = 6000;

  function _storageKey() {
    return (typeof LASTPLACE_KEY !== 'undefined') ? LASTPLACE_KEY : 'hl_last_place';
  }

  function _load() {
    try {
      const raw = localStorage.getItem(_storageKey());
      if (!raw) return null;
      const d = JSON.parse(raw);
      return (d && typeof d === 'object') ? d : null;
    } catch (e) { return null; }
  }

  function _save(state) {
    try { localStorage.setItem(_storageKey(), JSON.stringify(state)); } catch (e) {}
  }

  /* ════ قراءة الحالة الحالية من DOM/State — بلا أي اعتماد على متغيّرات
     داخلية خاصة بملف آخر (فقط كلاسات/معرّفات مستقرة موجودة أصلاً) ════ */
  function _detectScreen() {
    const screens = document.querySelectorAll('.app-screen[data-screen]');
    for (let i = 0; i < screens.length; i++) {
      if (!screens[i].classList.contains('hidden')) return screens[i].dataset.screen || null;
    }
    return null;
  }

  function _detectOpenModal() {
    for (let i = 0; i < RESTORABLE_MODALS.length; i++) {
      const el = document.getElementById(RESTORABLE_MODALS[i]);
      if (el && el.classList.contains('open')) return RESTORABLE_MODALS[i];
    }
    return null;
  }

  function _detectDrawerOpen() {
    const d = document.getElementById('drawerOverlay');
    return !!(d && d.classList.contains('open'));
  }

  function _snapshot() {
    _save({
      screen: _detectScreen(),
      asset: (typeof State !== 'undefined' && State.asset) || null,
      modal: _detectOpenModal(),
      drawerOpen: _detectDrawerOpen(),
      ts: Date.now(),
    });
  }

  /* ════ ننتظر قرار الهوية فقط (ضيف أم متصل) — ليس اكتمال الحساب
     كاملاً. راجع تعليق رأس الملف لسبب هذا التحديد بالذات. ════ */
  function _waitIdentityReady(timeoutMs) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      (function poll() {
        if (typeof State !== 'undefined' && (State._identityReady || State._sessionTimer)) return resolve(true);
        if (Date.now() - t0 > timeoutMs) return resolve(false);
        setTimeout(poll, READY_POLL_MS);
      })();
    });
  }

  function _restore(saved) {
    if (!saved) return;

    if (saved.asset && typeof ASSETS !== 'undefined' && ASSETS[saved.asset] && typeof switchAsset === 'function') {
      try { switchAsset(saved.asset); } catch (e) { console.warn('[lastplace] switchAsset', e); }
    }

    if (saved.screen && VALID_SCREENS.indexOf(saved.screen) !== -1 && typeof switchScreen === 'function') {
      try { switchScreen(saved.screen); } catch (e) { console.warn('[lastplace] switchScreen', e); }
    }

    if (saved.modal && BTN_FOR_MODAL[saved.modal]) {
      const btn = document.getElementById(BTN_FOR_MODAL[saved.modal]);
      if (btn) { try { btn.click(); } catch (e) { console.warn('[lastplace] modal restore', e); } }
    } else if (saved.drawerOpen) {
      const menuBtn = document.getElementById('btnMenu');
      if (menuBtn) { try { menuBtn.click(); } catch (e) { console.warn('[lastplace] drawer restore', e); } }
    }
  }

  function _startTracking() {
    setInterval(_snapshot, SNAPSHOT_INTERVAL_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') _snapshot();
    });
    window.addEventListener('pagehide', _snapshot);
  }

  document.addEventListener('DOMContentLoaded', () => {
    /* ✅ يُقرأ قبل أي بدء لمؤقّت الحفظ الدوري — لا نريد أن تُكتب فوق
       الحالة المحفوظة الحقيقية بحالة الإقلاع الافتراضية المؤقتة قبل
       أن نصل لفرصة استعادتها. */
    const saved = _load();
    _waitIdentityReady(READY_TIMEOUT_MS).then(() => {
      _restore(saved);
      _startTracking();
    });
  });

})();
