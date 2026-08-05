/* ═══════════════════════════════════════
   auth.js — دخول وخروج + وضع الزائر
   ✅ منطق الوكلاء (إنشاء/تدوير/حذف) انتقل بالكامل لـ agents.js —
      هذا الملف يستدعي Agents.ensure()/Agents.revoke() فقط.
   ✅ إصلاحات تزامن الاتصال/قطع الاتصال:
      - العلمان PRIVY_FLAG_KEY وEXTWALLET_FLAG_KEY يُبقيان متنافيين دائماً.
      - EXTWALLET_FLAG_KEY يخزّن rdns المحفظة الآن أيضاً.
      - حارس زمني قصير بعد doLogout يتجاهل أي حدث privy:update متأخر.
      - privy:update يعالج authenticated:false أيضاً.
      - أزرار المحافظ الخارجية بمودال تسجيل الدخول تُعطَّل أثناء محاولة
        الاتصال لمنع نداءين متزامنين لنفس eth_requestAccounts.
      - الوكيل المحفوظ محلياً لا يُحذف بعد تسجيل الخروج العادي.
   ✅ حُذف "استرداد المحفظة" — "تصدير المحفظة" يكفي وحده كنسخة احتياطية.

   ✅ FIX جوهري — ترتيب تفويض الوكيل عند الاتصال:
      كانت Agents.ensure() تُستدعى فوراً بعد أي اتصال محفظة، قبل أي فحص
      لحالة التمويل. Hyperliquid يرفض approveAgent على حساب لم يُودَع
      فيه شيء إطلاقاً (موثَّق من عدة مصادر مستقلة) — فمستخدم جديد تماماً
      كان يُطالَب بتوقيع تفويض وكيل محكوم عليه بالفشل فوراً بعد أول
      اتصال، وتظهر له رسالة الفشل الخام (راجع errToAr بـutils.js).
      أسوأ من هذا: initAccountFeeds تستدعي بعدها autoSetReferrer التي
      كانت (قبل إصلاح api.js) تُعيد محاولة نفس التفويض تلقائياً وبصمت
      تام خلال نفس اللحظة — نافذة توقيع ثانية غير متوقعة فوراً بعد فشل
      الأولى، فشلها يُبتلع بالكامل بلا أي أثر.
      الحل: initAccountFeeds() تُستدعى أولاً (تُعبّئ balance/positions/
      fillsCache من لقطة حقيقية)، ثم نتحقق: هل يوجد وكيل محلي صالح أصلاً
      (Agents.getInfo) أو هل الحساب يبدو مموَّلاً فعلياً (رصيد/مركز/fill
      سابق)؟ فقط عندها نطلب Agents.ensure(). حساب جديد غير مموَّل يحصل
      بدلاً من ذلك على توجيه هادئ بالإيداع أولاً، والتفويض يحدث تلقائياً
      لاحقاً بأول صفقة حقيقية عبر المسار الكسول الموجود أصلاً بـhlExchange
      (api.js) — الذي لا يمكن أن يفشل لنفس السبب، لأن أي صفقة حقيقية
      تعني ضمناً أن الحساب أصبح مموَّلاً.

   ✅ FIX — زر "🔌 قطع الاتصال" المستقل حُذف نهائياً واندمج بزر "اتصال"
      نفسه (انتقل للشريط العلوي — راجع index.html/app.js/components.css).
      updateConnectBtn() هنا عادت أبسط: تلوين/تسمية الزر الواحد فقط،
      بلا أي منطق إظهار/إخفاء زر ثانٍ منفصل.
   ✅ FIX — c.js (تقويم التداول) كان لا يبدأ أي جلب/زحف خلفي إلا لو
      المستخدم فتح "التقويم" يدوياً. الآن preloadCalendarData() تُستدعى
      تلقائياً هنا بعد استقرار initAccountFeeds (بتأخير بسيط، حتى لا
      تتنافس مع رصيد/صفقات/أسعار أول تحميل) — فيبدأ الزحف الهادئ
      الموجود أصلاً بc.js بصمت، ويكون جاهزاً فوراً لو فتح المستخدم
      التقويم لاحقاً. teardownCalendarPreload() المقابلة تُستدعى من
      doLogout() أدناه (لم تكن موقوفة هناك سابقاً — تسريب صامت لمؤقت
      خلفي يستمر لعنوان محفظة انفصل عنها المستخدم فعلياً).
═══════════════════════════════════════ */
'use strict';

let _privyLoadPromise = null;
function _loadPrivyBridge() {
  if (window.PrivyBridge) return Promise.resolve();
  if (_privyLoadPromise) return _privyLoadPromise;
  _privyLoadPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/js/privy-bridge.js';
    s.onerror = () => { _privyLoadPromise = null; reject(new Error('تعذّر تحميل وحدة البريد الإلكتروني')); };
    s.onload = () => {
      const t0 = Date.now();
      (function wait() {
        if (window.PrivyBridge) return resolve();
        if (Date.now() - t0 > 8000) return reject(new Error('انتهت مهلة تهيئة Privy'));
        setTimeout(wait, 50);
      })();
    };
    document.body.appendChild(s);
  });
  return _privyLoadPromise;
}

function initGuestMode() {
  State.isGuest = true;
  $('loginScreen')?.classList.add('hidden');
  $('appScreen')?.classList.remove('hidden');
  _showGuestBanner();
  switchAsset('CL');
  startSessionPolling();
  updateConnectBtn();
}

function connectWallet() {
  if (!State.isGuest) return openOptions();
  _walletListOpenedAt = Date.now();
  _renderExtWalletList();
  if (typeof Wallets !== 'undefined') Wallets.onListChanged(_renderExtWalletList);
  openModal('modalLogin');
}

function _stopWalletListWatch() {
  if (typeof Wallets !== 'undefined') Wallets.onListChanged(null);
}

let _extConnecting = false; /* ✅ قفل بسيط يمنع نداءين متزامنين لنفس eth_requestAccounts */

/* ✅ FIX — كانت تفحص Wallets.list() مرة واحدة متزامنة فقط عند فتح
   النافذة، بينما إعلانات EIP-6963 غير متزامنة وقد تصل بعد جزء من
   الثانية (نفس السباق الذي تحلّه reconnectSilently بـwallets.js بحلقة
   انتظار). كانت أول فتحة تُظهر أحياناً "لا توجد محفظة مكتشَفة" لجزء من
   ثانية قبل أن تتحدَّث تلقائياً عبر onListChanged — وميض مربك قد يدفع
   مستخداً للتراجع ظناً أن محفظته غير مدعومة رغم أنها موجودة فعلاً.
   الآن: لأول ~1.2 ثانية من فتح النافذة، قائمة فارغة تُعرَض كـ"يتم
   الاكتشاف..." هادئة بدل رسالة "غير موجودة" القطعية؛ بعد ذلك فقط تظهر
   الرسالة الأقسى لو بقيت القائمة فارغة فعلاً. */
let _walletListOpenedAt = 0;

function _renderExtWalletList() {
  const box = $('extWalletList');
  if (!box) return;
  const entries = (typeof Wallets !== 'undefined') ? Wallets.list() : [];

  if (!entries.length) {
    const elapsed = Date.now() - _walletListOpenedAt;
    if (elapsed < 1200) {
      box.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;gap:8px;color:var(--text-muted);font-size:var(--fs-sm);padding:14px 4px;"><span class="ext-detect-spin"></span> يتم اكتشاف المحافظ المتوفرة...</div>';
      if (!box._detectTimer) box._detectTimer = setTimeout(() => { box._detectTimer = null; _renderExtWalletList(); }, 300);
      return;
    }
    box.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:var(--fs-sm);padding:8px 4px;">لا توجد محفظة مكتشَفة بهذا المتصفح — افتح الموقع من داخل تطبيق محفظتك (مثل Trust Wallet) أو من متصفح فيه إضافة محفظة.</div>';
    return;
  }

  box.innerHTML = entries.map(function (e, i) {
    const iconHtml = e.info.icon
      ? '<img src="' + e.info.icon + '" alt="" style="width:20px;height:20px;border-radius:5px;">'
      : '👛';
    return '<button class="create-wallet-btn" data-ext-idx="' + i + '" ' + (_extConnecting ? 'disabled' : '') + ' style="display:flex;align-items:center;justify-content:center;gap:8px;">'
      + iconHtml + '<span>' + e.info.name + '</span></button>';
  }).join('');
  box.querySelectorAll('[data-ext-idx]').forEach(function (btn) {
    btn.onclick = function () { _connectExternal(entries[+btn.dataset.extIdx]); };
  });
}

async function connectEmail() {
  setBtnLoading('connectEmailBtn', '⏳');
  try {
    await _loadPrivyBridge();
    await window.PrivyBridge.connect();
  } catch (e) {
    toast('⚠️ ' + errToAr(e.message || 'تعذّر فتح نافذة البريد الإلكتروني'), 'err');
  } finally {
    resetBtn('connectEmailBtn');
  }
}

async function _connectExternal(entry) {
  if (_extConnecting) return; /* نداء ثانٍ وصل قبل انتهاء الأول — تجاهله بدل فتح eth_requestAccounts مرتين */
  _extConnecting = true;
  _renderExtWalletList(); /* عطّل كل الأزرار بصرياً أثناء المحاولة */
  _stopWalletListWatch();
  showLoader('جارٍ الاتصال بـ ' + entry.info.name + '...');
  try {
    const w = await Wallets.connect(entry);
    closeModal('modalLogin');
    await _onWalletConnected(w);
  } catch (e) {
    toast('⚠️ تعذّر الاتصال بالمحفظة: ' + errToAr(e.message || ''), 'err');
  } finally {
    _extConnecting = false;
    hideLoader();
  }
}

window.addEventListener('privy:update', function (e) {
  const d = e.detail || {};

  if (!d.authenticated) {
    if (State.wallet && State.wallet.walletClientType === 'privy') {
      toast('🔌 انتهت جلسة البريد الإلكتروني — سجّل الدخول مجدداً', 'info', 5000);
      doLogout();
    }
    return;
  }
  if (!d.wallet) return;

  /* حارس زمني: أي حدث يصل خلال ثانية ونصف من إلغاء اتصال صريح هو
     على الأغلب صدى متأخر من عملية logout() نفسها، لا اتصالاً جديداً حقيقياً */
  if (Date.now() - (State._logoutAt || 0) < 1500) return;

  const meta = d.wallet;
  _onWalletConnected({
    address:          meta.address,
    walletClientType: meta.walletClientType,
    walletName:       meta.name,
    walletIcon:       meta.icon,
    signTypedData:    function (domain, types, value) { return window.PrivyBridge.signTypedData(domain, types, value, meta.address); },
    getArbitrumSigner: function () { return window.PrivyBridge.getArbitrumSigner(meta.address); },
  });
});

window.addEventListener('wallet:accountChanged', function () {
  if (State.wallet && State.wallet.walletClientType !== 'privy') {
    toast('🔄 تغيّر حساب المحفظة — سجّل الدخول بالحساب الجديد', 'info', 5000);
    doLogout();
  }
});
window.addEventListener('wallet:externalDisconnect', function () {
  if (State.wallet && State.wallet.walletClientType !== 'privy') {
    toast('🔌 انقطع الاتصال من داخل المحفظة', 'info', 4000);
    doLogout();
  }
});

/* ════════════════════════════════════════════════
   نقطة إنهاء موحّدة — تُستدعى من أي مسار اتصال (بريد/محفظة خارجية/
   استرجاع جلسة عند الإقلاع).
════════════════════════════════════════════════ */
async function _onWalletConnected(walletObj) {
  if (State.wallet && State.wallet.address === walletObj.address) return;

  State.wallet = walletObj;
  State.isGuest = false;

  if (walletObj.walletClientType === 'privy') {
    localStorage.setItem(PRIVY_FLAG_KEY, '1');
    localStorage.removeItem(EXTWALLET_FLAG_KEY);
  } else {
    localStorage.setItem(EXTWALLET_FLAG_KEY, JSON.stringify({ address: walletObj.address, rdns: walletObj.walletClientType }));
    localStorage.removeItem(PRIVY_FLAG_KEY);
  }

  updateNavAddressDisplay();
  $('withdrawAddress').value = State.wallet.address;

  closeModal('modalLogin');
  _hideGuestBanner();
  loadQuickState();

  /* ✅ لقطة الحساب أولاً — تُعبّئ State.balance/positions/fillsCache
     قبل أي قرار بخصوص تفويض الوكيل (راجع تعليق رأس الملف). محمية
     بـtry/catch كي لا يوقف عطل شبكي هنا بقية تدفّق الاتصال. */
  try { await initAccountFeeds(); } catch (e) { console.warn('[initAccountFeeds]', e); }

  /* ✅ تحميل تقويم التداول تدريجياً بصمت — بلا انتظار فتح "التقويم"
     يدوياً كما كان سابقاً. تأخير بسيط (3 ثوانٍ) حتى لا يتنافس مع
     رصيد/صفقات/أسعار أول تحميل، وبنفس وتيرة الزحف الهادئة الموجودة
     أصلاً بـc.js (شهر كل 5 ثوانٍ) — راجع تعليق رأس الملف وpreloadCalendarData
     بـc.js. */
  setTimeout(() => { if (typeof preloadCalendarData === 'function') preloadCalendarData(); }, 3000);

  const hasValidLocalAgent = (typeof Agents !== 'undefined') && !!Agents.getInfo(State.wallet.address)?.valid;
  const looksFunded = !!((State.balance?.total > 0) || (State.positions.length > 0) || (State.fillsCache.length > 0));

  if (hasValidLocalAgent || looksFunded) {
    try {
      await Agents.ensure();
      /* أول توفّر ناجح لوكيل بهذه الجلسة — فرصة جيدة لضبط رمز الإحالة
         إن لم يكن مضبوطاً أصلاً (autoSetReferrer نفسها تتجاهل الطلب
         بصمت لو ما زال لا يوجد وكيل، فاستدعاؤها هنا آمن دائماً). */
      autoSetReferrer();
    } catch (e) {
      if (e.message === 'CANCELLED') {
        toast('تم تخطي تفويض الوكيل — تقدر تفعّله لاحقاً من "الوكلاء" بالخيارات', 'info', 5000);
      } else {
        toast('⚠️ فشل تفويض محفظة التداول: ' + errToAr(e.message), 'err');
      }
    }
  } else {
    toast('💵 أودع USDC أولاً لتفعيل حسابك على Hyperliquid — محفظة التنفيذ تُفعَّل تلقائياً عند أول صفقة', 'warn', 8000);
  }

  _maybePromptExportBackup(walletObj);

  updateConnectBtn();
  toast('مرحباً 🤝', 'ok');

  if (localStorage.getItem(PIN_KEY) && localStorage.getItem(LOCKED_KEY) === 'true')
    setTimeout(function () { if (State.wallet) lockApp(); }, 300);
}

function _maybePromptExportBackup(walletObj) {
  if (walletObj.walletClientType !== 'privy') return;
  const flag = 'hl_export_prompted_' + walletObj.address.toLowerCase();
  if (localStorage.getItem(flag)) return;
  localStorage.setItem(flag, '1');
  setTimeout(function () { toast('🔑 صدّر مفتاح محفظتك واحفظه بمكان آمن كنسخة احتياطية — الخيارات ⚙️', 'info', 8000); }, 2500);
}

async function exportWallet() {
  if (State.isGuest || !State.wallet) return toast('سجّل الدخول أولاً', 'err');
  if (State.wallet.walletClientType !== 'privy')
    return toast('محفظتك خارجية — صدّرها من داخل تطبيق المحفظة نفسه (مفتاحها لا يمر أبداً عبر هذا التطبيق)', 'info', 6000);
  try {
    await _loadPrivyBridge();
    await window.PrivyBridge.exportWallet(State.wallet.address);
  } catch (e) {
    toast('⚠️ تعذّر فتح نافذة التصدير: ' + errToAr(e.message || ''), 'err');
  }
}

/* ════ إلغاء الاتصال (سابقاً "تغيير المحفظة"/logout) — الأسعار تبقى
   حيّة، فقط اشتراكات الحساب تُفكّك. الوكيل المحفوظ محلياً لا يُحذف هنا
   (راجع تعليق رأس الملف) — Agents.clearSession() تمسح فقط النسخة
   الحيّة بالذاكرة. ملاحظة: رمز PIN المحلي (إن وُجد) يُحذف كجزء من هذا
   الإجراء — محذَّر عنها بوضوح بنص modalLogout بـindex.html. ════ */
function doLogout() {
  State.timers.forEach(clearInterval);
  clearInterval(State.priceTimer);
  clearInterval(State._balTimer);
  clearInterval(State._clockTimer);
  clearInterval(State._sessionTimer);
  teardownAccountFeeds();
  if (typeof teardownCalendarPreload === 'function') teardownCalendarPreload();

  if (State.wallet && typeof State.wallet._teardownListeners === 'function') {
    try { State.wallet._teardownListeners(); } catch {}
  }

  if (typeof Agents !== 'undefined') Agents.clearSession();

  localStorage.removeItem(LS_KEY);
  localStorage.removeItem(PIN_KEY);
  localStorage.removeItem(LOCKED_KEY);
  localStorage.removeItem(LAST_PIN_KEY);
  localStorage.removeItem(QSTATE_KEY);
  localStorage.removeItem(PRIVY_FLAG_KEY);
  localStorage.removeItem(EXTWALLET_FLAG_KEY);

  if (window.PrivyBridge) { try { window.PrivyBridge.logout(); } catch (e) {} }

  State.wallet     = null;
  State.agent      = null;
  State.positions  = [];
  State.openOrders = [];
  State.fillsCache = [];
  State.isLocked   = false;
  State.timers     = [];
  State.isGuest    = true;
  State._lastOptimisticClose = 0;
  State._emptyPosCount       = 0;
  State._logoutAt  = Date.now(); /* ✅ حارس ضد أحداث privy:update متأخرة */

  closeModal('modalLogout');
  closeModal('modalPIN');
  closeModal('modalSetPIN');
  closeModal('modalForgotPIN');

  _showGuestBanner();
  updateConnectBtn();
  resetPosFingerprint();
  renderPositions();
  toast('🔌 تم إلغاء الاتصال', 'info');
  startSessionPolling();
}

function _showGuestBanner() {
  let b = $('guestBanner');
  if (!b) {
    b = document.createElement('div');
    b.id = 'guestBanner';
    b.className = 'guest-banner';
    b.innerHTML = '<span class="gb-msg">🔒 اربط محفظتك لبدء التداول وعرض صفقاتك المفتوحة</span><button class="gb-btn" onclick="connectWallet()">اتصال ←</button>';
    const main = $('appScreen');
    if (main) {
      const footer = main.querySelector('.footer');
      if (footer) main.insertBefore(b, footer);
      else main.appendChild(b);
    }
  }
  b.classList.remove('hidden');
}

function _hideGuestBanner() {
  const b = $('guestBanner');
  if (b) b.classList.add('hidden');
}

function openLoginModal() { connectWallet(); }

/* ✅ FIX — الزر الآن مدمج (اتصال + قطع اتصال بزر واحد بالشريط العلوي).
   updateConnectBtn تكتفي بتلوين/تسمية #btnConnect فقط — لا يوجد بعد
   الآن أي #btnDisconnect منفصل لإظهاره/إخفاؤه. */
function updateConnectBtn() {
  const btn = $('btnConnect');
  if (btn) {
    const hasWallet = !!State.wallet;
    if (State.wsConnected) {
      btn.className = 'nav-connect-btn ws-connected';
    } else {
      const wasEver = btn.dataset.everConnected === '1';
      btn.className = wasEver ? 'nav-connect-btn ws-disconnected' : 'nav-connect-btn ws-connecting';
    }
    if (State.wsConnected) btn.dataset.everConnected = '1';

    let lbl = 'اتصال';
    if (hasWallet) {
      lbl = State.wallet.walletClientType === 'privy'
        ? '📧 بريد'
        : (State.wallet.walletName || 'متصل');
    }
    btn.innerHTML = '<span class="cb-dot"></span><span class="cb-lbl">' + lbl + '</span>';
  }
}

function updateNavAddressDisplay() {
  if (!State.wallet) return;
  setTxt('navAddress', State.wallet.address.slice(0,6) + '...' + State.wallet.address.slice(-4));
}
