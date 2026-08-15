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
      فيه شيء إطلاقاً — فمستخدم جديد تماماً كان يُطالَب بتوقيع تفويض
      وكيل محكوم عليه بالفشل فوراً بعد أول اتصال. الحل: initAccountFeeds()
      تُستدعى أولاً (تُعبّئ balance/positions/fillsCache من لقطة حقيقية)،
      ثم نتحقق: هل يوجد وكيل محلي صالح أصلاً (Agents.getInfo) أو هل
      الحساب يبدو مموَّلاً فعلياً (رصيد/مركز/fill سابق)؟ فقط عندها نطلب
      Agents.ensure(). حساب جديد غير مموَّل يحصل بدلاً من ذلك على توجيه
      هادئ بالإيداع أولاً، والتفويض يحدث تلقائياً لاحقاً بأول صفقة
      حقيقية عبر المسار الكسول الموجود أصلاً بـhlExchange (api.js).

   ✅ FIX — زر "🔌 قطع الاتصال" المستقل حُذف نهائياً واندمج بزر "اتصال"
      نفسه (انتقل للشريط العلوي — راجع index.html/app.js/components.css).
   ✅ FIX — c.js (تقويم التداول) يبدأ زحفه الهادئ تلقائياً بعد استقرار
      initAccountFeeds بدل انتظار فتح "التقويم" يدوياً.

   ✅ FIX (2026-08) — رسالة "لا توجد محفظة مكتشَفة" كانت نهاية مسدودة
      بلا أي مخرج للمستخدم الذي لا يملك أي محفظة أصلاً. أُضيف زر صغير
      أسفل الرسالة يفتح https://ethereum.org/wallets/find-wallet/
      (دليل رسمي محايد لاختيار محفظة) بتبويب جديد.

   ✅ FIX (2026-08) — إعادة ترتيب جوهرية لتسلسل toasts أول اتصال، بعد
      ملاحظة أن مستخداً جديداً كلياً (بريد Privy، رصيد $0) كان يشاهد
      ثلاث رسائل متتالية بلا أي فاصل زمني حقيقي: "مرحباً" ثم فوراً
      "أودع USDC أولاً" ثم بعد 2.5 ثانية "صدّر مفتاح محفظتك" — وبما أن
      toast() تستبدل نفس عنصر DOM في كل نداء، الرسالتان الأوليان كانتا
      تتصادمان بصمت بنفس الجزء من الثانية، فتضيع "أودع USDC أولاً" —
      الرسالة الوحيدة المهمة فعلياً لمستخدم جديد لا يملك أي فكرة عن
      الخطوة التالية. الآن:
      1) "مرحباً" يظهر فوراً عند تعيين State.wallet (قبل جلب بيانات
         الحساب — لا يعتمد عليها)، بمدة قصيرة مقصودة (2200ms).
      2) رسالة التوجيه للإيداع (لحساب جديد غير مموَّل تحديداً) تُؤجَّل
         900ms فتظهر بعد أن "مرحباً" أخذ وقته، وبمدة أطول (9 ثوانٍ)
         لأنها الأهم فعلياً بهذي اللحظة.
      3) تذكير تصدير المفتاح (_maybePromptExportBackup) لم يعد يُستدعى
         هنا لحساب جديد فارغ — لا شيء يستحق "نسخة احتياطية" بعد. يبقى
         يُستدعى فوراً هنا فقط لحساب *مموَّل بالفعل* (إعادة اتصال مثلاً).
         للحساب الجديد، الاستدعاء انتقل لـdoDeposit بaccount.js بعد أول
         إيداع ناجح — عندها فقط يصبح التذكير منطقياً وذا معنى فعلي.

   ✅ جديد (إعادة هيكلة UI) —
      1) _showGuestBanner كانت تُدرِج قبل ".footer" (عنصر لم يعد موجوداً
         بعد استبدال الفوتر بـtabbar سفلي) — كانت ستسقط لـappendChild
         بآخر #appScreen (بعد tabbar نفسها بالـDOM)، فتظهر البانر تحت
         الشريط السفلي بدل مكانها الصحيح. الآن تُدرَج داخل شاشة الرئيسية
         (#screenHome .screen-scroll) في أعلاها، قبل بطاقة الرصيد —
         نفس الفكرة الأصلية (أول عنصر يراه من ليس متصلاً) بمكان صحيح.
      2) doLogout يستدعي _renderBalanceFromState() صراحة بعد ضبط
         isGuest=true — البطاقة الدائمة الجديدة تعرض "—" تلقائياً
         بفضل شرط isGuest بداخل الدالة (راجع account.js)، فلا حاجة
         لتصفير State.balance يدوياً؛ فقط الاستدعاء كافٍ لتحديث العرض
         فوراً بدل بقاء أرقام الجلسة السابقة ظاهرة بعد قطع الاتصال.
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
  if (!State.isGuest) return openDrawer();
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
   الثانية. الآن: لأول ~1.2 ثانية من فتح النافذة، قائمة فارغة تُعرَض
   كـ"يتم الاكتشاف..." هادئة بدل رسالة "غير موجودة" القطعية. */
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
    /* ✅ FIX (2026-08) — زر صغير لدليل ethereum.org الرسمي لاختيار محفظة،
       لمن لا يملك أي محفظة أصلاً بهذا المتصفح. */
    box.innerHTML = `
      <div style="text-align:center;color:var(--text-muted);font-size:var(--fs-sm);padding:8px 4px;">لا توجد محفظة مكتشَفة بهذا المتصفح — افتح الموقع من داخل تطبيق محفظتك (مثل Trust Wallet) أو من متصفح فيه إضافة محفظة.</div>
      <div style="text-align:center;margin-top:10px;">
        <a href="https://ethereum.org/wallets/find-wallet/" target="_blank" rel="noopener noreferrer" class="find-wallet-btn">📥 تنزيل محفظة ←</a>
      </div>`;
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
   ✅ FIX (2026-08) — راجع تعليق رأس الملف: "مرحباً" الآن أول شيء يظهر
   (فور تعيين State.wallet، قبل أي جلب شبكة)، وتوجيه "أودع USDC أولاً"
   لحساب جديد فارغ يُؤجَّل قليلاً بدل التصادم البصري معه.
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

  updateAddrPopoverText();
  $('withdrawAddress').value = State.wallet.address;

  closeModal('modalLogin');
  _hideGuestBanner();
  loadQuickState();

  /* ✅ يظهر فوراً — لا يعتمد على أي بيانات حساب، فلا داعي لانتظارها */
  updateConnectBtn();
  toast('مرحباً 🤝', 'ok', 2200);

  /* ✅ لقطة الحساب أولاً — تُعبّئ State.balance/positions/fillsCache
     قبل أي قرار بخصوص تفويض الوكيل (راجع تعليق رأس الملف). initAccountFeeds
     نفسها ترسم بطاقة الرصيد الدائمة فور اكتمال اللقطة (راجع account.js). */
  try { await initAccountFeeds(); } catch (e) { console.warn('[initAccountFeeds]', e); }

  /* ✅ تحميل تقويم التداول تدريجياً بصمت — بلا انتظار فتح "التقويم" يدوياً */
  setTimeout(() => { if (typeof preloadCalendarData === 'function') preloadCalendarData(); }, 3000);

  const hasValidLocalAgent = (typeof Agents !== 'undefined') && !!Agents.getInfo(State.wallet.address)?.valid;
  const looksFunded = !!((State.balance?.total > 0) || (State.positions.length > 0) || (State.fillsCache.length > 0));

  if (hasValidLocalAgent || looksFunded) {
    try {
      await Agents.ensure();
      autoSetReferrer();
    } catch (e) {
      if (e.message === 'CANCELLED') {
        toast('تم تخطي تفويض الوكيل — تقدر تفعّله لاحقاً من "الوكلاء" بالخيارات', 'info', 5000);
      } else {
        toast('⚠️ فشل تفويض محفظة التداول: ' + errToAr(e.message), 'err');
      }
    }
    /* ✅ حساب فيه رصيد/مركز/سجل فعلاً (إعادة اتصال مثلاً) — تذكير
       النسخ الاحتياطي منطقي هنا فوراً، فعلاً يوجد شيء يستحق الحماية. */
    _maybePromptExportBackup(walletObj);
  } else {
    /* ✅ حساب جديد فارغ تماماً — التذكير يُؤجَّل لأول إيداع ناجح
       (doDeposit بaccount.js). التأخير هنا (900ms) يمنع تصادم "أودع
       USDC أولاً" مع "مرحباً" أعلاه — راجع تعليق رأس الملف. */
    setTimeout(() => {
      toast('💵 أودع USDC أولاً لتفعيل حسابك — اضغط ☰ القائمة ← 💵 إيداع', 'warn', 9000);
    }, 900);
  }

  if (localStorage.getItem(PIN_KEY) && localStorage.getItem(LOCKED_KEY) === 'true')
    setTimeout(function () { if (State.wallet) lockApp(); }, 300);
}

function _maybePromptExportBackup(walletObj) {
  if (walletObj.walletClientType !== 'privy') return;
  const flag = 'hl_export_prompted_' + walletObj.address.toLowerCase();
  if (localStorage.getItem(flag)) return;
  localStorage.setItem(flag, '1');
  setTimeout(function () { toast('🔑 صدّر مفتاح محفظتك واحفظه بمكان آمن كنسخة احتياطية — ☰ القائمة', 'info', 8000); }, 2500);
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
   الإجراء. ════ */
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
  if (typeof _toggleAddrPopover === 'function') _toggleAddrPopover(false);
  resetPosFingerprint();
  renderPositions();
  /* ✅ جديد — يعيد بطاقة الرصيد الدائمة إلى حالة "—" فوراً (بدل بقاء
     أرقام الجلسة السابقة ظاهرة) — الشرط isGuest داخل الدالة نفسها
     (account.js) يكفي، لا حاجة لتصفير State.balance يدوياً. */
  if (typeof _renderBalanceFromState === 'function') _renderBalanceFromState();
  toast('🔌 تم إلغاء الاتصال', 'info');
  startSessionPolling();
}

/* ✅ جديد — تُدرَج الآن داخل شاشة الرئيسية (screen-scroll) في أعلاها،
   قبل بطاقة الرصيد، بدل الاعتماد على ".footer" الذي لم يعد موجوداً
   (راجع تعليق رأس الملف). fallback دفاعي لو لأي سبب لم توجد الشاشة. */
function _showGuestBanner() {
  let b = $('guestBanner');
  if (!b) {
    b = document.createElement('div');
    b.id = 'guestBanner';
    b.className = 'guest-banner';
    b.innerHTML = '<span class="gb-msg">🔒 اربط محفظتك لبدء التداول وعرض صفقاتك المفتوحة</span><button class="gb-btn" onclick="connectWallet()">اتصال ←</button>';
    const scroller = document.querySelector('#screenHome .screen-scroll');
    if (scroller) {
      scroller.insertBefore(b, scroller.firstChild);
    } else {
      const main = $('appScreen');
      if (main) main.appendChild(b);
    }
  }
  b.classList.remove('hidden');
}

function _hideGuestBanner() {
  const b = $('guestBanner');
  if (b) b.classList.add('hidden');
}

function openLoginModal() { connectWallet(); }

/* ✅ الزر الآن مدمج بالـappbar — متصل: يعرض العنوان المختصر ويفتح
   .addr-popover عند النقر (راجع app.js:_toggleAddrPopover)؛ ضيف: يعرض
   "اتصال" ويفتح modalLogin مباشرة. updateConnectBtn تكتفي بتلوين/
   تسمية #btnConnect فقط. */
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
      lbl = State.wallet.address.slice(0, 6) + '...' + State.wallet.address.slice(-4);
    }
    btn.innerHTML = '<span class="cb-dot"></span><span class="cb-lbl">' + lbl + '</span>';
  }
}

/* ✅ العنوان الكامل الآن يُعرَض بداخل .addr-popover بالـappbar (نسخ +
   إلغاء اتصال) بدل بطاقة الدرج المحذوفة — العنوان المختصر بالزر نفسه
   يُدار من updateConnectBtn أعلاه. */
function updateAddrPopoverText() {
  if (!State.wallet) return;
  setTxt('addrPopoverTxt', State.wallet.address);
}
