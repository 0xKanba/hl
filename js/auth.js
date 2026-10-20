/* ═══════════════════════════════════════
   auth.js — دخول وخروج + وضع الزائر
   ✅ منطق الوكلاء (إنشاء/تدوير/حذف) بالكامل في agents.js؛ هذا الملف يستدعي
      Agents.ensure()/Agents.revoke() فقط. وضع "رابط الوكيل" في agentlink.js.

   ── تاريخ الإصلاحات (مختصر) ──
   • العلمان PRIVY_FLAG_KEY وEXTWALLET_FLAG_KEY متنافيان دائماً؛ الثاني يخزّن
     rdns المحفظة. حارس زمني (_logoutAt) بعد doLogout يتجاهل أي privy:update
     متأخر. أزرار المحافظ الخارجية تُعطَّل أثناء محاولة الاتصال (_extConnecting).
     الوكيل المحفوظ محلياً لا يُحذف بتسجيل الخروج العادي.
   • ترتيب تفويض الوكيل: initAccountFeeds() أولاً ثم Agents.ensure() فقط لحساب
     يبدو مموَّلاً أو لديه وكيل محلي صالح (Hyperliquid يرفض approveAgent على حساب
     غير مموَّل). الحساب الجديد يُوجَّه للإيداع، والتفويض يتم كسولاً بأول صفقة.
   • تسلسل toasts أول اتصال: "مرحباً" فوراً (2.2ث) ثم توجيه الإيداع بعد 900ms
     (9ث) لحساب جديد فارغ؛ تذكير تصدير المفتاح يُؤجَّل لأول إيداع ناجح
     (account.js:doDeposit) لحساب جديد، ويظهر فوراً هنا لحساب مموَّل.
   • State._identityReady تُضبط متزامناً بأول سطر بكل مسار اتصال (يستهلكها
     lastplace.js). قفل PIN يُفحص أول سطر بإقلاع app.js — لا نسخة مؤجَّلة هنا.
   • زر الاتصال مدمج بالـappbar (updateConnectBtn)، والعنوان الكامل بـpopover.
   • c.js (التقويم) يبدأ زحفه الهادئ بعد الاتصال؛ OM.resumePendingWatch()
     تستأنف مراقبة أوامر الإيقاف المعلّقة.

   ✅ جديد — جلسة رابط الوكيل الدائمة (راجع agentlink.js v2):
      1) _onWalletConnected: كان يحرس بـ"نفس العنوان ← return"، وعنوان جلسة
         الرابط هو عنوان المحفظة الرئيسية نفسها — فالاتصال بالمحفظة الرئيسية
         بعد رابط وكيل كان يُتجاهل بصمت ويبقى المستخدم بوضع الوكيل. الآن
         جلسة الرابط تُستبدل صراحةً: AgentLink.release() + State.agent=null
         (وإلا بقي مفتاح الوكيل القديم يوقّع الصفقات).
      2) wallet:accountChanged/externalDisconnect لا تُنهي جلسة رابط الوكيل
         (أحداث محافظ متصفح لا علاقة لها بمفتاح الرابط).
      3) doLogout تمسح الجلسة المحفوظة (إلغاء يدوي = الإنهاء الوحيد الإرادي)؛
         وتقبل {silent:true} (مسار حذف الوكيل يعرض إشعاره الخاص). ⚠️ تُربط
         كمعالج onclick مباشرة (يمرّر Event) — لذا الفحص opts.silent===true.
      4) _onAgentLinkConnected: يبدأ مراقبة صلاحية الوكيل، ورسالة "وضع رابط
         وكيل" تظهر فقط عند أول فتح من الرابط لا بكل إقلاع لاحق.

   ✅ جديد — زر "تصدير المحفظة" (#optExportWallet) يظهر فقط حين تكون المحفظة
      المتصلة محفظة بريد (Privy): updateConnectBtn تبدّل الصنف .show
      (قاعدة CSS الافتراضية "مخفي" بـcss/agentlink.css فلا وميض بالإقلاع).
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
  /* إشارة قرار الهوية — متزامنة، أول سطرين بالدالة (راجع lastplace.js) */
  State._identityReady = true;
  $('loginScreen')?.classList.add('hidden');
  $('appScreen')?.classList.remove('hidden');
  switchAsset('CL');
  startSessionPolling();
  updateConnectBtn();
}

function connectWallet() {
  if (!State.isGuest) return openDock();
  _walletListOpenedAt = Date.now();
  _renderExtWalletList();
  if (typeof Wallets !== 'undefined') Wallets.onListChanged(_renderExtWalletList);
  openModal('modalLogin');
}

function _stopWalletListWatch() {
  if (typeof Wallets !== 'undefined') Wallets.onListChanged(null);
}

let _extConnecting = false; /* قفل يمنع نداءين متزامنين لنفس eth_requestAccounts */

/* إعلانات EIP-6963 غير متزامنة وقد تصل بعد جزء من الثانية: لأول ~1.2 ثانية
   من فتح النافذة، القائمة الفارغة تُعرَض كـ"يتم الاكتشاف..." لا "غير موجودة". */
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
    /* دليل ethereum.org الرسمي لمن لا يملك أي محفظة بهذا المتصفح */
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
  if (_extConnecting) return; /* نداء ثانٍ قبل انتهاء الأول — تجاهله */
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

  /* حارس زمني: أي حدث خلال ثانية ونصف من إلغاء اتصال صريح هو على الأغلب
     صدى متأخر من logout() نفسها، لا اتصالاً جديداً حقيقياً */
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

/* أحداث مزوّد محفظة المتصفح لا تخص جلسة رابط الوكيل (لا مزوّد ولا مفتاح رئيسي) */
window.addEventListener('wallet:accountChanged', function () {
  if (State.wallet && State.wallet.walletClientType !== 'privy' && !State.wallet.isAgentLink) {
    toast('🔄 تغيّر حساب المحفظة — سجّل الدخول بالحساب الجديد', 'info', 5000);
    doLogout();
  }
});
window.addEventListener('wallet:externalDisconnect', function () {
  if (State.wallet && State.wallet.walletClientType !== 'privy' && !State.wallet.isAgentLink) {
    toast('🔌 انقطع الاتصال من داخل المحفظة', 'info', 4000);
    doLogout();
  }
});

/* ════════════════════════════════════════════════
   نقطة إنهاء موحّدة — تُستدعى من أي مسار اتصال بمحفظة رئيسية (بريد/
   خارجية/استرجاع جلسة عند الإقلاع).
════════════════════════════════════════════════ */
async function _onWalletConnected(walletObj) {
  const wasAgentLink = !!(State.wallet && State.wallet.isAgentLink);

  /* نفس العنوان = حدث مكرر → تجاهل. لكن عنوان جلسة رابط الوكيل هو عنوان
     المحفظة الرئيسية نفسها، والاتصال بها يجب أن يستبدل جلسة الوكيل. */
  if (State.wallet && !wasAgentLink && State.wallet.address === walletObj.address) return;

  /* اتصال بمحفظة رئيسية ينهي جلسة رابط الوكيل المحفوظة ويُسقط إشعار حذفه */
  if (typeof AgentLink !== 'undefined') { AgentLink.release(); AgentLink.dismissNotice(); }
  if (wasAgentLink) {
    State.agent = null;            // مفتاح الوكيل القديم لا يوقّع بعد الآن
    State.positions = []; State.openOrders = []; State.fillsCache = [];
    State.referrerSet = false;
  }

  State.wallet = walletObj;
  State.isGuest = false;
  State._identityReady = true;

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
  loadQuickState();

  /* يظهر فوراً — لا يعتمد على أي بيانات حساب */
  updateConnectBtn();
  toast('مرحباً 🤝', 'ok', 2200);

  /* لقطة الحساب أولاً — تُعبّئ balance/positions/fillsCache قبل قرار الوكيل */
  try { await initAccountFeeds(); } catch (e) { console.warn('[initAccountFeeds]', e); }

  /* استئناف مراقبة أوامر الإيقاف المعلّقة (TP/SL بانتظار التفعيل) */
  if (typeof OM !== 'undefined' && typeof OM.resumePendingWatch === 'function') {
    try { OM.resumePendingWatch(); } catch (e) { console.warn('[order] resumePendingWatch', e); }
  }

  /* تحميل تقويم التداول تدريجياً بصمت */
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
    /* حساب فيه رصيد/مركز/سجل — تذكير النسخ الاحتياطي منطقي هنا فوراً */
    _maybePromptExportBackup(walletObj);
  } else {
    /* حساب جديد فارغ — التذكير يُؤجَّل لأول إيداع ناجح؛ التأخير (900ms)
       يمنع تصادم "أودع USDC أولاً" مع "مرحباً" أعلاه */
    setTimeout(() => {
      toast('💵 أودع USDC أولاً لتفعيل حسابك — اضغط ☰ القائمة ← 💵 إيداع', 'warn', 9000);
    }, 900);
  }
}

/* ════════════════════════════════════════════════
   وضع "رابط وكيل" (js/agentlink.js): AgentLink.tryConsume() يضبط
   State.wallet/State.agent مباشرة بلا أي توقيع (من الرابط أو من الجلسة
   المحفوظة). مسار إقلاع مبسّط عمداً — بلا Agents.ensure، بلا أعلام
   PRIVY/EXTWALLET، بلا تذكير تصدير/إيداع.
════════════════════════════════════════════════ */
async function _onAgentLinkConnected() {
  State._identityReady = true; /* أول شيء، قبل أي await */

  updateAddrPopoverText();
  updateConnectBtn();

  /* الرسالة التعريفية عند أول فتح من الرابط فقط — لا بكل إقلاع لاحق */
  if (typeof AgentLink !== 'undefined' && AgentLink.source() === 'url')
    toast('🔗 وضع رابط وكيل — تداول فقط، بلا صلاحية سحب. الجلسة محفوظة بهذا المتصفح حتى حذف الوكيل أو إلغاء الاتصال', 'info', 7000);

  /* مراقبة صلاحية الوكيل عند Hyperliquid — لا تعتمد على اكتمال لقطة الحساب */
  if (typeof AgentLink !== 'undefined') { try { AgentLink.startWatch(); } catch (e) { console.warn('[agentlink watch]', e); } }

  try { await initAccountFeeds(); } catch (e) { console.warn('[agentlink]', e); }
  if (typeof OM !== 'undefined' && typeof OM.resumePendingWatch === 'function') {
    try { OM.resumePendingWatch(); } catch (e) {}
  }
  setTimeout(() => { if (typeof preloadCalendarData === 'function') preloadCalendarData(); }, 3000);
}

/* روابط المستكشف الخارجية — تُبنى من عنوان المحفظة عند كل فتح للـpopover */
function _updateExplorerLinks() {
  const addr = State.wallet?.address;
  const ex = $('addrPopoverExplorer'), st = $('addrPopoverStatus');
  if (ex) ex.href = addr ? `https://blockscan.com/address/${addr}` : '#';
  if (st) st.href = addr ? `https://hyperscreener.asxn.xyz/profile/${addr}` : '#';
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
  if (State.wallet.isAgentLink)
    return toast('وضع رابط الوكيل — لا يوجد مفتاح محفظة رئيسية هنا لتصديره، فقط مفتاح الوكيل نفسه', 'info', 6000);
  if (State.wallet.walletClientType !== 'privy')
    return toast('محفظتك خارجية — صدّرها من داخل تطبيق المحفظة نفسه (مفتاحها لا يمر أبداً عبر هذا التطبيق)', 'info', 6000);
  try {
    await _loadPrivyBridge();
    await window.PrivyBridge.exportWallet(State.wallet.address);
  } catch (e) {
    toast('⚠️ تعذّر فتح نافذة التصدير: ' + errToAr(e.message || ''), 'err');
  }
}

/* ════ إلغاء الاتصال — الأسعار تبقى حيّة، فقط اشتراكات الحساب تُفكّك.
   الوكيل المحفوظ محلياً (Agents) لا يُحذف هنا؛ Agents.clearSession() تمسح
   فقط النسخة الحيّة. جلسة رابط الوكيل المحفوظة تُمسح (إلغاء اتصال = إنهاء
   إرادي). رمز PIN المحلي يُحذف كجزء من هذا الإجراء.
   opts.silent===true: بلا toast "تم إلغاء الاتصال" (مسار حذف الوكيل). ════ */
function doLogout(opts) {
  const silent = !!(opts && opts.silent === true);

  State.timers.forEach(clearInterval);
  clearInterval(State.priceTimer);
  clearInterval(State._balTimer);
  clearInterval(State._clockTimer);
  clearInterval(State._sessionTimer);
  teardownAccountFeeds();
  if (typeof teardownCalendarPreload === 'function') teardownCalendarPreload();
  /* أغلق شاشة "فتح صفقة جديدة" لو كانت مفتوحة */
  if (typeof OrderModule !== 'undefined' && typeof OrderModule.close === 'function') {
    try { OrderModule.close(); } catch (e) {}
  }

  if (State.wallet && typeof State.wallet._teardownListeners === 'function') {
    try { State.wallet._teardownListeners(); } catch {}
  }

  if (typeof AgentLink !== 'undefined') AgentLink.release();
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
  State._logoutAt  = Date.now(); /* حارس ضد أحداث privy:update متأخرة */

  closeModal('modalLogout');
  closeModal('modalPIN');
  closeModal('modalSetPIN');
  closeModal('modalForgotPIN');

  updateConnectBtn();
  if (typeof _toggleAddrPopover === 'function') _toggleAddrPopover(false);
  resetPosFingerprint();
  renderPositions();
  /* يعيد بطاقة الرصيد إلى "—" فوراً (الشرط isGuest داخل الدالة نفسها) */
  if (typeof _renderBalanceFromState === 'function') _renderBalanceFromState();
  if (!silent) toast('🔌 تم إلغاء الاتصال', 'info');
  startSessionPolling();
}

function openLoginModal() { connectWallet(); }

/* زر الاتصال مدمج بالـappbar — متصل: العنوان المختصر + popover؛ ضيف: "اتصال".
   ✅ زر "تصدير المحفظة": يظهر فقط مع محفظة بريد (Privy) — راجع تعليق الرأس. */
function updateConnectBtn() {
  const canExport = !!(State.wallet && !State.isGuest && State.wallet.walletClientType === 'privy');
  ['optExportWallet', 'dockExport'].forEach(function (id) {
    const b = $(id);
    if (b) b.classList.toggle('show', canExport);
  });

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
      lbl = State.wallet.isAgentLink
        ? '🔗 ' + State.wallet.address.slice(0, 6) + '...' + State.wallet.address.slice(-4)
        : State.wallet.address.slice(0, 6) + '...' + State.wallet.address.slice(-4);
    }
    btn.innerHTML = '<span class="cb-dot"></span><span class="cb-lbl">' + lbl + '</span>';
  }
}

/* العنوان الكامل داخل .addr-popover بالـappbar (نسخ + إلغاء اتصال) */
function updateAddrPopoverText() {
  if (!State.wallet) return;
  setTxt('addrPopoverTxt', State.wallet.address);
}
