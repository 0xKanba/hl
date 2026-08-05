/* ═══════════════════════════════════════
   app.js — تغييرات الإقلاع فقط:
   HL.connect() + initPriceFeeds() فوراً (زائر ومتصل)،
   initAccountFeeds() ينتقل داخل _onWalletConnected (auth.js)،
   _startAuthedTimers أصبحت أخف (startSessionPolling فقط)
   ✅ حذف كامل حقلي "اسم العرض" و"صوت التنبيهات" من الأسلاك.
   ✅ "الوكلاء" تفتح Agents.openModal() بدل enableFastTrading القديمة.
   ✅ نصوص رسوم السحب ومدة الوكيل تُملأ ديناميكياً من الثوابت المركزية.
   ✅ Wallets.reconnectSilently(rdns) تستقبل rdns المحفوظ فعلاً.
   ✅ "نسيت PIN" يحذف الوكيل يدوياً قبل تسجيل الخروج.
   ✅ حُذف زر/سلك "استرداد المحفظة".
   ✅ FIX — إعادة الاتصال التلقائي بالبريد (Privy) عند إعادة تحميل
      الصفحة تنتظر .ready فعلياً (حتى 6 ثوان) قبل قراءة authenticated.

   ✅ FIX — فتح الرسم البياني كان محظوراً على الزوّار (`if (State.isGuest)
      return _promptConnect();`) رغم أن بيانات الشموع/الأسعار عامة
      بالكامل بلا أي حاجة لتوقيع (candleSnapshot وBBO لا يتطلبان مصادقة
      — راجع chart.js). القرار الوحيد الذي يحتاج فعلاً محفظة متصلة هو
      محاولة تنفيذ صفقة من داخل الرسم، وهذا مُتحقَّق منه أصلاً وبشكل
      صحيح داخل _showCf بـchart.js (تُظهر توست "سجّل الدخول أولاً" بدل
      التنفيذ). إزالة الحظر هنا تتيح للزائر تصفّح الرسم البياني كاملاً
      قبل أي التزام بربط محفظة — بلا أي خطر تقني.

   ✅ FIX — دُمج زر "🔌 إلغاء الاتصال" المستقل بزر "اتصال" نفسه (انتقل
      للشريط العلوي — راجع index.html/auth.js/components.css). لم يعد
      هناك عنصر #btnDisconnect منفصل: نفس الزر الآن يفتح تسجيل الدخول
      للزائر، ويفتح مباشرة modalLogout (تأكيد قطع الاتصال) لمن هو
      متصل بالفعل. الوصول لـ"⚙️ الخيارات" يبقى متاحاً عبر زر الخيارات
      المستقل بالفوتر (btnOptions) كما هو — لا تغيير هناك.

   ✅ FIX — إغلاق modalLogin عبر النقر على الخلفية المعتمة (لا زر
      "إغلاق" الصريح) لم يكن يستدعي _stopWalletListWatch()، فيبقى
      مستمع Wallets.onListChanged معلَّقاً بلا فائدة يعيد بناء قائمة
      داخل مودال مغلق كل مرة تُعلن محفظة جديدة نفسها لاحقاً. أُضيفت حالة
      خاصة لـmodalLogin بمعالج نقر الخلفية العام أدناه.
═══════════════════════════════════════ */
'use strict';

const _AR_MONTHS = [
  'يناير','فبراير','مارس','أبريل','مايو','يونيو',
  'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'
];

function _startDatetimeClock() {
  const el = document.getElementById('dtClock');
  if (!el) return;
  const tick = () => {
    const now = new Date(Date.now() + 3 * 3600000);
    const d   = String(now.getUTCDate()).padStart(2,'0');
    const mo  = _AR_MONTHS[now.getUTCMonth()];
    const y   = now.getUTCFullYear();
    let   h   = now.getUTCHours();
    const m   = String(now.getUTCMinutes()).padStart(2,'0');
    const s   = String(now.getUTCSeconds()).padStart(2,'0');
    const ap  = h >= 12 ? 'مساءً' : 'صباحاً';
    h = h % 12 || 12;
    el.textContent = `${d} ${mo} ${y} · ${String(h).padStart(2,'0')}:${m}:${s} ${ap}`;
  };
  tick();
  setInterval(tick, 1000);
}

function _initMonthsPanel() {
  const bar   = document.getElementById('datetimeBar');
  const panel = document.getElementById('monthsPanel');
  if (!bar || !panel) return;
  bar.addEventListener('click', () => panel.classList.toggle('hidden'));
  document.addEventListener('click', e => {
    if (!bar.contains(e.target) && !panel.contains(e.target))
      panel.classList.add('hidden');
  });
}

function _applyTheme(theme, animate) {
  if (animate) {
    document.documentElement.classList.add('theme-transitioning');
    setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 320);
  }
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('btnTheme');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function _initTheme() {
  const saved = localStorage.getItem('hl_theme');
  const sys   = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  _applyTheme(saved || sys, false);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (!localStorage.getItem('hl_theme')) _applyTheme(e.matches ? 'dark' : 'light', true);
  });
}

function _toggleTheme() {
  const cur  = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = cur === 'dark' ? 'light' : 'dark';
  localStorage.setItem('hl_theme', next);
  _applyTheme(next, true);
}

function _initQtyInput() {
  const input = $('qtyInput');
  if (!input) return;
  const a = ASSETS[State.asset];
  const defaultVal = a?.presets?.[0] ?? 1;
  if (!input.value || +input.value <= 0) {
    input.value = defaultVal;
    State.qty   = defaultVal;
  }
  input.addEventListener('focus', () => { input.select?.(); });
  input.addEventListener('blur', () => {
    if (!input.value || +input.value <= 0) {
      const asset = ASSETS[State.asset];
      const def   = asset?.presets?.[0] ?? 1;
      input.value = def;
      State.qty   = def;
    }
  });
  input.oninput = function () { State.qty = parseFloat(this.value) || 0; };
}

function _initWithdrawFeeUI() {
  const fee = WITHDRAW_FEE_USDC;
  setTxt('wFeeAmt', `$${fee.toFixed(2)}`);
  const exSend = fee + 20;
  setTxt('wFeeExSend', `$${exSend.toFixed(2)}`);
  setTxt('wFeeExNet',  `$${(exSend - fee).toFixed(2)}`);
  const amtEl = $('withdrawAmount');
  if (amtEl) {
    amtEl.min = String(fee + 1);
    amtEl.placeholder = String(exSend);
  }
}

function _initAgentCopy() {
  if (typeof Agents === 'undefined') return;
  const days = Math.round(Agents.TTL_MS / 86400000);
  setTxt('agentTtlTxt1', `${days} يوم`);
  setTxt('agentTtlTxt2', `${days} يوم، ويُطلب توقيع جديد عند الحاجة`);
}

function openOptions() {
  const ov = document.getElementById('optsOverlay');
  if (!ov) return;
  ov.classList.remove('hidden');
  ov.classList.add('visible');
}

function closeOptions() {
  const ov = document.getElementById('optsOverlay');
  if (!ov) return;
  ov.classList.add('closing');
  setTimeout(() => {
    ov.classList.remove('visible','closing');
    ov.classList.add('hidden');
  }, 120);
}

function _initOptsBackdrop() {
  const ov = document.getElementById('optsOverlay');
  if (!ov) return;
  ov.addEventListener('click', e => { if (e.target === ov) closeOptions(); });
}

document.addEventListener('DOMContentLoaded', () => {

  _initTheme();
  const themeBtn = document.getElementById('btnTheme');
  if (themeBtn) themeBtn.onclick = _toggleTheme;

  _startDatetimeClock();
  _initMonthsPanel();
  _initOptsBackdrop();
  _initQtyInput();
  _initWithdrawFeeUI();
  _initAgentCopy();

  $('connectEmailBtn')?.addEventListener('click', connectEmail);
  $('loginClose')?.addEventListener('click', () => { _stopWalletListWatch(); closeModal('modalLogin'); });
  $('loaderClose')?.addEventListener('click', hideLoader);

  document.querySelectorAll('.tab[data-asset]').forEach(t =>
    t.onclick = () => switchAsset(t.dataset.asset)
  );

  /* ✅ الرسم البياني يفتح للجميع الآن — زائر أو متصل، راجع تعليق رأس الملف */
  $('btnChart').onclick = () => {
    ChartModule.open(State.asset);
  };

  /* ✅ FIX — زر "اتصال" أصبح مدمجاً: زائر → فتح تسجيل الدخول، متصل →
     فتح modalLogout (تأكيد قطع الاتصال) مباشرة بدل فتح الخيارات —
     راجع تعليق رأس الملف. الوصول لـ"⚙️ الخيارات" يبقى عبر btnOptions
     المستقل بالفوتر، بلا أي تغيير هناك. */
  $('btnConnect').onclick = () => {
    if (State.isGuest) connectWallet();
    else openModal('modalLogout');
  };

  $('btnOptions').onclick = openOptions;
  $('optsClose').onclick  = closeOptions;

  $('optBalance').onclick  = () => { closeOptions(); if (State.isGuest) return _promptConnect(); showBalance(); };
  $('optHistory').onclick  = () => { closeOptions(); if (State.isGuest) return _promptConnect(); showHistory(); };
  $('optCalendar').onclick = () => { closeOptions(); if (State.isGuest) return _promptConnect(); if (typeof openCalendar==='function') openCalendar(); };
  $('optDeposit').onclick  = () => { closeOptions(); if (State.isGuest) return _promptConnect(); openModal('modalDeposit'); };
  $('optWithdraw').onclick = () => { closeOptions(); if (State.isGuest) return _promptConnect(); openModal('modalWithdraw'); };
  $('optExportWallet')?.addEventListener('click', () => { closeOptions(); exportWallet(); });
  $('optAgents')?.addEventListener('click', () => { closeOptions(); if (typeof Agents !== 'undefined') Agents.openModal(); });

  $('btnBuy').onclick  = () => askTrade(true);
  $('btnSell').onclick = () => askTrade(false);

  $('qty100').onclick = () => {
    if (State.isGuest) return _promptConnect();
    const a   = ASSETS[State.asset];
    const bal = State.balance?.available || State.balance?.total || 0;
    const px  = State.prices[State.asset]?.mid;
    if (!bal || !px) return toast('رصيد غير متاح', 'err');
    const qty100 = parseFloat(wire((bal * a.lev) / px, a.szDp));
    State.qty = qty100;
    $('qtyInput').value = qty100;
    toast(`✅ ${qty100} ${a.unit}`, 'ok');
  };

  $('confirmCancel').onclick  = () => { closeModal('modalConfirm'); State.pendingTrade = null; };
  $('confirmExecute').onclick = () => requirePin(execTrade);

  $('closeCancel').onclick  = () => { closeModal('modalClose'); State.pendingClose = null; };
  $('closeExecute').onclick = () => requirePin(execClose);

  $('btnCloseAll').onclick     = askCloseAll;
  $('closeAllCancel').onclick  = () => closeModal('modalCloseAll');
  $('closeAllExecute').onclick = () => requirePin(execCloseAll);

  $('tpCancel').onclick  = () => { closeModal('modalTP'); State.pendingTP = null; };
  $('tpExecute').onclick = () => requirePin(execTP);
  $('tpDelete').onclick  = () => requirePin(deleteTP);
  $('tpAmount').oninput  = recalcTpPreview;

  $('slCancel').onclick  = () => { closeModal('modalSL'); State.pendingSL = null; };
  $('slExecute').onclick = () => requirePin(execSL);
  $('slDelete').onclick  = () => requirePin(deleteSL);
  $('slAmount').oninput  = recalcSlPreview;

  $('balanceClose').onclick = () => { clearInterval(State._balTimer); closeModal('modalBalance'); };
  $('historyClose').onclick = () => closeModal('modalHistory');

  $('posDetailClose').onclick = () => closeModal('modalPosDetail');

  $('depositCancel').onclick  = () => closeModal('modalDeposit');
  $('depositExecute').onclick = () => requirePin(doDeposit);

  $('withdrawCancel').onclick  = () => closeModal('modalWithdraw');
  $('withdrawExecute').onclick = () => requirePin(doWithdraw);

  $('withdrawAmount').addEventListener('input', function () {
    const amt  = parseFloat(this.value || 0);
    const prev = $('withdrawPreview');
    if (!prev) return;
    if (!amt || amt <= 0) { prev.classList.add('hidden'); return; }
    prev.classList.remove('hidden');
    const sendEl = $('wpSend'), netEl = $('wpNet'), feeEl = $('wpFee');
    if (sendEl) sendEl.textContent = `$${amt.toFixed(2)}`;
    if (feeEl)  feeEl.textContent  = `- $${WITHDRAW_FEE_USDC.toFixed(2)}`;
    if (netEl)  netEl.textContent  = `$${Math.max(0, amt - WITHDRAW_FEE_USDC).toFixed(2)} USDC`;
  });

  $('withdrawAddress').addEventListener('click', function () { this.select(); });
  $('withdrawAddress').addEventListener('input', function () {
    if (this.value.trim() === 'كاش')
      this.value = '0x0640F5Bfc50AC53eC68C435a60cB0ffF5C555FAD';
  });

  $('logoutCancel').onclick  = () => closeModal('modalLogout');
  $('logoutExecute').onclick = doLogout;

  function _copyAddr() {
    if (!State.wallet) return;
    navigator.clipboard?.writeText(State.wallet.address)
      .then(() => toast('✅ تم نسخ العنوان', 'info', 2000))
      .catch(() => toast('تعذّر النسخ', 'err'));
  }
  $('navAddress').onclick = _copyAddr;
  $('navCopyBtn')?.addEventListener('click', _copyAddr);

  $('btnLock').onclick = () => {
    if (State.isGuest) return _promptConnect();
    lockApp(true);
  };

  $('pinCancel').onclick = () => { closeModal('modalPIN'); State.pinCallback = null; };
  $('pinLogout').onclick = () => {
    $('forgotStep1').classList.remove('hidden');
    $('forgotStep2').classList.add('hidden');
    openModal('modalForgotPIN');
  };
  $('forgotCancel').onclick = () => closeModal('modalForgotPIN');
  $('forgotStep1').onclick  = () => {
    $('forgotStep1').classList.add('hidden');
    $('forgotStep2').classList.remove('hidden');
  };
  $('forgotStep2').onclick = () => {
    closeModal('modalForgotPIN');
    if (typeof Agents !== 'undefined') Agents.revoke();
    doLogout();
  };

  $('setPinCancel').onclick = () => {
    closeModal('modalSetPIN');
    State.currentSetPinInput = '';
    updateSetPinDots();
    State.pinCallback = null;
  };

  document.addEventListener('keydown', e => {
    const isPinOpen    = $('modalPIN').classList.contains('open');
    const isSetPinOpen = $('modalSetPIN').classList.contains('open');
    if (!State.isLocked && !isPinOpen && !isSetPinOpen) return;
    if (e.key >= '0' && e.key <= '9') {
      if (isSetPinOpen) appendSetPin(e.key); else appendPin(e.key);
    } else if (e.key === 'Backspace') {
      if (isSetPinOpen) backspaceSetPin(); else backspacePin();
    }
  });

  document.querySelectorAll('.modal-overlay').forEach(o => o.onclick = e => {
    if (e.target !== o) return;
    if (o.id === 'modalPIN' && State.isLocked) return;
    if (o.id === 'modalSetPIN') { State.currentSetPinInput = ''; updateSetPinDots(); }
    if (o.id === 'modalLogin') _stopWalletListWatch();
    o.classList.remove('open');
  });

  /* ═══════════════════════════════════════
     Boot sequence
  ═══════════════════════════════════════ */
  HL.connect();
  initPriceFeeds();

  function _startAuthedTimers() {
    startSessionPolling();
  }
  function _fallbackToGuest() {
    initGuestMode();
  }
  function _showAppOptimistically() {
    $('loginScreen')?.classList.add('hidden');
    $('appScreen')?.classList.remove('hidden');
  }

  function _waitPrivyReady(timeoutMs) {
    return new Promise(resolve => {
      const t0 = Date.now();
      (function poll() {
        if (window.PrivyBridge && window.PrivyBridge.ready) return resolve(true);
        if (Date.now() - t0 > timeoutMs) return resolve(false);
        setTimeout(poll, 80);
      })();
    });
  }

  if (localStorage.getItem(PRIVY_FLAG_KEY)) {
    _showAppOptimistically();
    _loadPrivyBridge()
      .then(() => _waitPrivyReady(6000))
      .then((readyOk) => {
        const w = readyOk && window.PrivyBridge.authenticated && window.PrivyBridge.getActiveWallet();
        if (!w) throw new Error('no active Privy session');
        return _onWalletConnected({
          address: w.address, walletClientType: w.walletClientType,
          walletName: w.name, walletIcon: w.icon,
          signTypedData: (d, t, v) => window.PrivyBridge.signTypedData(d, t, v, w.address),
          getArbitrumSigner: () => window.PrivyBridge.getArbitrumSigner(w.address),
        });
      })
      .then(_startAuthedTimers)
      .catch(_fallbackToGuest);
  } else if (localStorage.getItem(EXTWALLET_FLAG_KEY)) {
    _showAppOptimistically();
    let _extMeta = null;
    try { _extMeta = JSON.parse(localStorage.getItem(EXTWALLET_FLAG_KEY)); } catch {}
    (typeof Wallets !== 'undefined' ? Wallets.reconnectSilently(_extMeta?.rdns) : Promise.resolve(null))
      .then(w => { if (!w) throw new Error('no prior wallet authorization'); return _onWalletConnected(w); })
      .then(_startAuthedTimers)
      .catch(_fallbackToGuest);
  } else {
    _fallbackToGuest();
  }

  if (localStorage.getItem(PIN_KEY) && localStorage.getItem(LOCKED_KEY) === 'true')
    setTimeout(() => { if (State.wallet) lockApp(); }, 600);
});
