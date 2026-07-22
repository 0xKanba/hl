/* ═══════════════════════════════════════
   auth.js — دخول وخروج + وضع الزائر
   ✅ منطق الوكلاء (إنشاء/تدوير/حذف) انتقل بالكامل لـ agents.js —
      هذا الملف يستدعي Agents.ensure()/Agents.revoke() فقط.
   ✅ إصلاحات تزامن الاتصال/قطع الاتصال:
      - العلمان PRIVY_FLAG_KEY وEXTWALLET_FLAG_KEY يُبقيان متنافيين دائماً
        (كان يمكن سابقاً أن يتراكم كلاهما بعد تبديل نوع تسجيل الدخول).
      - EXTWALLET_FLAG_KEY يخزّن rdns المحفظة الآن أيضاً — Wallets.
        reconnectSilently() القديم كان يتصل بأول محفظة بالقائمة (ترتيب
        غير مضمون) بدل المحفظة الحقيقية التي اتصل بها المستخدم.
      - حارس زمني قصير بعد doLogout يتجاهل أي حدث privy:update متأخر
        يصل بعد تسجيل الخروج مباشرة (سباق نادر لكنه حقيقي — كان يمكن
        أن يعيد ربط المستخدم فوراً بعد ضغطه "خروج").
      - privy:update يعالج الآن authenticated:false أيضاً (تسجيل خروج
        من جانب Privy نفسه) — قبلاً كان يُتجاهل كلياً فتبقى الحالة
        المحلية "متصل" بينما جلسة Privy فعلياً منتهية.
      - أزرار المحافظ الخارجية بمودال تسجيل الدخول تُعطَّل أثناء محاولة
        الاتصال لمنع نداءين متزامنين لنفس eth_requestAccounts (يفشل عند
        كثير من المحافظ بخطأ "already pending").
      - الوكيل المحفوظ محلياً لا يُحذف بعد تسجيل الخروج العادي — يبقى
        صالحاً 180 يوماً كما هو مصمَّم؛ يُمسح فقط بالذاكرة الحيّة، فلا
        يحتاج المستخدم توقيعاً جديداً كل مرة يُعيد الاتصال بنفس المحفظة.
        الحذف الكامل متاح يدوياً من "الوكلاء" أو تلقائياً عند "نسيت PIN"
        (سيناريو أمان أشد حساسية).
   ✅ حُذف "استرداد المحفظة" (openWalletRecovery) — "تصدير المحفظة"
      يكفي وحده كنسخة احتياطية حقيقية (يعرض المفتاح الخاص/العبارة
      السرية مباشرة)؛ كان وجود الاثنين معاً تكراراً بلا فائدة إضافية.
      التذكير الدوري بعد الدخول عبر البريد الآن يوجّه المستخدم لتصدير
      مفتاحه بدل تفعيل استرداد منفصل — راجع _maybePromptExportBackup.
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
  _renderExtWalletList();
  if (typeof Wallets !== 'undefined') Wallets.onListChanged(_renderExtWalletList);
  openModal('modalLogin');
}

function _stopWalletListWatch() {
  if (typeof Wallets !== 'undefined') Wallets.onListChanged(null);
}

let _extConnecting = false; /* ✅ قفل بسيط يمنع نداءين متزامنين لنفس eth_requestAccounts */

function _renderExtWalletList() {
  const box = $('extWalletList');
  if (!box) return;
  const entries = (typeof Wallets !== 'undefined') ? Wallets.list() : [];
  if (!entries.length) {
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
    toast('⚠️ ' + (e.message || 'تعذّر فتح نافذة البريد الإلكتروني'), 'err', 5000);
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
    toast('⚠️ تعذّر الاتصال بالمحفظة: ' + (e.message || '').slice(0, 100), 'err', 5000);
  } finally {
    _extConnecting = false;
    hideLoader();
  }
}

window.addEventListener('privy:update', function (e) {
  const d = e.detail || {};

  /* ✅ Privy أعلن تسجيل خروج (من مصدر خارج زر الخروج بالتطبيق، مثل
     انتهاء صلاحية الجلسة) بينما التطبيق لا يزال يعتقد أنه متصل بها —
     قبلاً كان هذا يُتجاهل بصمت ويبقى State.wallet متصل خطأً */
  if (!d.authenticated) {
    if (State.wallet && State.wallet.walletClientType === 'privy') {
      toast('🔌 انتهت جلسة البريد الإلكتروني — سجّل الدخول مجدداً', 'info', 5000);
      doLogout();
    }
    return;
  }
  if (!d.wallet) return;

  /* ✅ حارس زمني: أي حدث يصل خلال ثانية ونصف من تسجيل خروج صريح هو
     على الأغلب صدى متأخر من عملية logout() نفسها بالجهة الثانية
     (React/Privy)، لا دخولاً جديداً حقيقياً — تسجيل الدخول الحقيقي
     يحتاج تفاعل المستخدم (OTP بريد) يستحيل يحصل بأقل من ثانية ونصف */
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

/* ✅ محفظة خارجية بدّلت حسابها النشط من داخل تطبيقها هي، أو قطعت صلاحية
   الموقع بالكامل — كلا الحالتين تعني عنواننا المحفوظ صار غير مطابق لما
   يوقّعه المستخدم فعلياً؛ الأسلم إعادة الاتصال من الصفر بدل الاستمرار
   بحالة متضاربة بين "من نعرض بياناته" و"من يوقّع فعلياً". */
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
   استرجاع جلسة عند الإقلاع). Agents.ensure() تنشئ/تسترجع وكيل التنفيذ
   (180 يوم)، initAccountFeeds() تفعّل اللقطة الأولية + الاشتراكات الحية.
════════════════════════════════════════════════ */
async function _onWalletConnected(walletObj) {
  if (State.wallet && State.wallet.address === walletObj.address) return;

  State.wallet = walletObj;
  State.isGuest = false;

  /* ✅ العلمان متنافيان دائماً — تفعيل أحدهما يمسح الآخر فوراً، يمنع
     تراكم حالة قديمة لو المستخدم بدّل طريقة الدخول أكثر من مرة */
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

  try {
    await Agents.ensure();
  } catch (e) {
    if (e.message === 'CANCELLED') {
      toast('تم تخطي تفويض الوكيل — تقدر تفعّله لاحقاً من "الوكلاء" بالخيارات', 'info', 5000);
    } else {
      toast('⚠️ فشل تفويض محفظة التداول: ' + e.message.slice(0, 100), 'err', 6000);
    }
  }

  _maybePromptExportBackup(walletObj);

  await initAccountFeeds();
  updateConnectBtn();
  toast('مرحباً 🤝', 'ok');

  if (localStorage.getItem(PIN_KEY) && localStorage.getItem(LOCKED_KEY) === 'true')
    setTimeout(function () { if (State.wallet) lockApp(); }, 300);
}

/* ✅ تذكير لمرة واحدة لكل محفظة بريد (Privy embedded) بتصدير مفتاحها —
   هذا الآن المسار الوحيد للنسخ الاحتياطي (بعد حذف "استرداد المحفظة"
   المكرِّر). لا يظهر لمحافظ خارجية (Trust/Brave/...) لأن مفتاحها أصلاً
   خارج هذا التطبيق بالكامل — النسخ الاحتياطي مسؤولية تطبيق المحفظة نفسه. */
function _maybePromptExportBackup(walletObj) {
  if (walletObj.walletClientType !== 'privy') return;
  const flag = 'hl_export_prompted_' + walletObj.address.toLowerCase();
  if (localStorage.getItem(flag)) return;
  localStorage.setItem(flag, '1');
  setTimeout(function () { toast('🔑 صدّر مفتاح محفظتك واحفظه بمكان آمن كنسخة احتياطية — الخيارات ⚙️', 'info', 8000); }, 2500);
}

/* ✅ زر واحد فقط لتصدير المحفظة (كان "تصدير المفتاح الخاص" منفصلاً) —
   يفرّع تلقائياً: Privy → نافذة Privy الآمنة، محفظة خارجية → توجيه
   المستخدم لتصدير المفتاح من داخل تطبيق محفظته هو (لا يمكن ولا يجب
   لهذا التطبيق الوصول لمفتاح محفظة خارجية أبداً — حد أمان أساسي). */
async function exportWallet() {
  if (State.isGuest || !State.wallet) return toast('سجّل الدخول أولاً', 'err');
  if (State.wallet.walletClientType !== 'privy')
    return toast('محفظتك خارجية — صدّرها من داخل تطبيق المحفظة نفسه (مفتاحها لا يمر أبداً عبر هذا التطبيق)', 'info', 6000);
  try {
    await _loadPrivyBridge();
    await window.PrivyBridge.exportWallet(State.wallet.address);
  } catch (e) {
    toast('⚠️ تعذّر فتح نافذة التصدير', 'err');
  }
}

/* ════ تسجيل الخروج — الأسعار تبقى حيّة، فقط اشتراكات الحساب تُفكّك.
   ✅ الوكيل المحفوظ محلياً لا يُحذف هنا (راجع تعليق رأس الملف) —
   Agents.clearSession() تمسح فقط النسخة الحيّة بالذاكرة. ════ */
function doLogout() {
  State.timers.forEach(clearInterval);
  clearInterval(State.priceTimer);
  clearInterval(State._balTimer);
  clearInterval(State._clockTimer);
  clearInterval(State._sessionTimer);
  teardownAccountFeeds();

  /* ✅ فكّ مراقبة accountsChanged عن المحفظة الخارجية قبل تصفيرها —
     بدون هذا يبقى الاستماع معلَّقاً على provider القديم للأبد */
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
  State._logoutAt  = Date.now(); /* ✅ حارس ضد أحداث privy:update متأخرة — راجع الأعلى */

  closeModal('modalLogout');
  closeModal('modalPIN');
  closeModal('modalSetPIN');
  closeModal('modalForgotPIN');

  _showGuestBanner();
  updateConnectBtn();
  resetPosFingerprint();
  renderPositions();
  toast('تم الخروج بنجاح', 'info');
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

function updateConnectBtn() {
  const btn = $('btnConnect');
  if (!btn) return;
  const hasWallet = !!State.wallet;
  if (State.wsConnected) {
    btn.className = 'footer-connect-btn ws-connected';
  } else {
    const wasEver = btn.dataset.everConnected === '1';
    btn.className = wasEver ? 'footer-connect-btn ws-disconnected' : 'footer-connect-btn ws-connecting';
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

/* ✅ حُذف حقل "اسم العرض" — العنوان المُختصَر يظهر دائماً، بلا تخصيص */
function updateNavAddressDisplay() {
  if (!State.wallet) return;
  setTxt('navAddress', State.wallet.address.slice(0,6) + '...' + State.wallet.address.slice(-4));
}
