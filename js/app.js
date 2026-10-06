/* ═══════════════════════════════════════
   app.js — appbar + tabbar سفلي (3 أزرار) + دوك أيقونات جانبي
   ✅ راوتر شاشات: الرئيسية / الأسواق / الرسم البياني (data-screen) —
      switchScreen() المسؤول الوحيد عن إظهار/إخفاء أي من الثلاث، وتستدعي
      ChartModule.open()/close() فقط عند الدخول/الخروج من شاشة الرسم.
   ✅ الدوك: عمود أيقونات دائم (موبايل: يتمدّد عند ☰ ويطفو فوق المحتوى،
      سطح مكتب ≥900px: شريط جانبي دائم بالـCSS — راجع components.css).
      كل زر (.dock-item) له onclick واحد يعمل بصرف النظر عن التمدد.
   ✅ زر المظهر واحد (#dockTheme) بأيقونة/عنوان يعكسان المظهر الحالي.
   ✅ عنوان الحساب بالـappbar popover صغير (نسخ + إلغاء اتصال).
   ✅ "الأسواق" الشاشة الافتراضية عند الإقلاع (_activeScreen).
   ✅ نافذة معلومات الأصل (؟) بشاشة الأسواق: الرافعة تُقرأ حيّاً من
      ASSETS[sym].lev، والاسم من نص البطاقة نفسها (مصدر واحد).
   ✅ وضع "رابط الوكيل" (js/agentlink.js) يُفحص أولاً بتسلسل الإقلاع؛
      الإيداع/السحب/الوكلاء تُحجب برسالة واضحة بهذا الوضع.
   ✅ قفل PIN يُفحص أول سطر بمعالج DOMContentLoaded (بلا setTimeout/شبكة)،
      مع سكربت <head> بـindex.html (data-boot-lock) يمنع أي وميض.
   ✅ شريط "فتح صفقة جديدة" وشاشة التداول بالكامل بـjs/order/* (يُبنى
      الشريط من bar.js — لا سطر له هنا). بطاقة سوق تفتح شاشة التداول
      مباشرة على أصلها كـoverlay فوق شاشة الأسواق.
   ✅ جولة سابعة: _syncNavActive تُزامن مؤشر النشاط على التابّبار **و**
      الدوك معاً — ضروري لسطح المكتب حيث الدوك هو التنقل الوحيد المرئي.
═══════════════════════════════════════ */
'use strict';

/* وصول آمن للعناصر داخل DOMContentLoaded: _el() تُرجع عنصراً وهمياً
   غير ضار وتُسجّل تحذيراً بدل أن يُلغي معرّف مفقود كل الروابط التالية. */
const _NOOP_EL = {
  onclick: null, oninput: null, value: '', textContent: '', min: '', placeholder: '',
  addEventListener() {}, removeEventListener() {}, select() {}, focus() {}, contains() { return false; },
  querySelector() { return null; }, querySelectorAll() { return []; },
  classList: { contains: () => false, add() {}, remove() {}, toggle() {} },
  dataset: {}, style: {}
};
function _el(id) {
  const e = typeof $ === 'function' ? $(id) : document.getElementById(id);
  if (e) return e;
  console.warn('[app] عنصر مفقود بالـDOM: #' + id);
  return _NOOP_EL;
}


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

/* ═══ المظهر ═══ */
function _applyTheme(theme, animate) {
  if (animate) {
    document.documentElement.classList.add('theme-transitioning');
    setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 320);
  }
  document.documentElement.setAttribute('data-theme', theme);
  _syncThemeToggleUI();
}

function _initTheme() {
  const saved = localStorage.getItem('hl_theme');
  const sys   = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  _applyTheme(saved || sys, false);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (!localStorage.getItem('hl_theme')) _applyTheme(e.matches ? 'dark' : 'light', true);
  });
}

/* يعرض حالة المظهر الحالية (لا الحالة التي سيتحوّل إليها) */
function _syncThemeToggleUI() {
  const cur  = document.documentElement.getAttribute('data-theme') || 'dark';
  const icon = $('dockThemeIcon');
  const lbl  = $('dockThemeLbl');
  if (icon) icon.textContent = cur === 'dark' ? '🌙' : '☀️';
  if (lbl)  lbl.textContent  = cur === 'dark' ? 'المظهر الداكن' : 'المظهر الفاتح';
}
function _setTheme(theme) {
  if (theme === (document.documentElement.getAttribute('data-theme') || 'dark')) return;
  localStorage.setItem('hl_theme', theme);
  _applyTheme(theme, true);
}
function _initThemeToggle() {
  $('dockTheme')?.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    _setTheme(cur === 'dark' ? 'light' : 'dark');
  });
  _syncThemeToggleUI();
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

/* عنوان محفظة المستخدم داخل modalDeposit */
function _fillDepositAddr() {
  const addr = State.wallet?.address || '—';
  setTxt('depositAddrTxt', addr);
  const btn = $('depositAddrCopy');
  if (btn) btn.onclick = () => {
    if (!State.wallet) return;
    navigator.clipboard?.writeText(State.wallet.address)
      .then(() => toast('✅ تم نسخ العنوان', 'info', 2000))
      .catch(() => toast('تعذّر النسخ', 'err'));
  };
}

/* ═══════════════════════════════════════
   راوتر الشاشات — الرئيسية / الأسواق / الرسم البياني
═══════════════════════════════════════ */
let _activeScreen = 'markets';

function switchScreen(name) {
  if (name === _activeScreen) return;
  const next = document.querySelector(`.app-screen[data-screen="${name}"]`);
  if (!next) return;
  const current = document.querySelector(`.app-screen[data-screen="${_activeScreen}"]`);
  if (current) current.classList.add('hidden');

  if (_activeScreen === 'chart' && typeof ChartModule !== 'undefined') ChartModule.close();

  next.classList.remove('hidden');
  /* إعادة تشغيل أنيميشن الدخول حتى لو الشاشة مبنية أصلاً */
  next.classList.remove('screen-anim');
  void next.offsetWidth; /* إجبار reflow */
  next.classList.add('screen-anim');

  _activeScreen = name;
  _syncNavActive();

  if (name === 'chart' && typeof ChartModule !== 'undefined') {
    ChartModule.open(State.asset);
  } else {
    const scroller = next.querySelector('.screen-scroll');
    if (scroller) scroller.scrollTop = 0;
  }
}

/* تُزامن مؤشر النشاط على التابّبار السفلي (.tab-btn — مصدر الحقيقة بالموبايل)
   **و**عناصر الدوك الملاحية (.dock-item[data-nav-screen] — ضرورية لسطح
   المكتب حيث التابّبار مختفٍ والدوك هو الشريط الجانبي الدائم). دالة
   واحدة، مصدر واحد للحقيقة (_activeScreen). */
function _syncNavActive() {
  document.querySelectorAll('.tab-btn[data-tab]').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === _activeScreen)
  );
  document.querySelectorAll('.dock-item[data-nav-screen]').forEach(b =>
    b.classList.toggle('active', b.dataset.navScreen === _activeScreen)
  );
}

/* ═══════════════════════════════════════
   DOCK — openDock/closeDock يبدّلان .expanded فقط (بالموبايل). الأزرار
   تعمل دائماً بصرف النظر عن التمدد؛ _dockAction = "أغلق ثم نفّذ".
   نقرة خارج الدوك المتمدد (أو خارج ☰) تُغلقه.
═══════════════════════════════════════ */
function openDock() {
  $('dock')?.classList.add('expanded');
}
function closeDock() {
  $('dock')?.classList.remove('expanded');
}
function _dockAction(fn) {
  return () => { closeDock(); fn(); };
}
function _initDock() {
  $('btnMenu')?.addEventListener('click', () => {
    const d = $('dock');
    if (d && d.classList.contains('expanded')) closeDock(); else openDock();
  });
  document.addEventListener('click', e => {
    const d = $('dock');
    if (!d || !d.classList.contains('expanded')) return;
    if (d.contains(e.target) || $('btnMenu')?.contains(e.target)) return;
    closeDock();
  });
}

/* ═══════════════════════════════════════
   عنوان الحساب بالـappbar — popover (btnConnect يُلوَّن/يُسمّى من
   auth.js:updateConnectBtn؛ هنا التبديل + الإغلاق بالنقر خارجه + نسخ/إلغاء اتصال)
═══════════════════════════════════════ */
function _toggleAddrPopover(forceOpen) {
  const pop = $('addrPopover');
  if (!pop) return;
  const open = forceOpen !== undefined ? forceOpen : pop.classList.contains('hidden');
  pop.classList.toggle('hidden', !open);
  if (open && typeof _updateExplorerLinks === 'function') _updateExplorerLinks();
}
function _initAddrPopover() {
  $('addrPopoverCopy')?.addEventListener('click', () => {
    if (!State.wallet) return;
    navigator.clipboard?.writeText(State.wallet.address)
      .then(() => toast('✅ تم نسخ العنوان', 'info', 2000))
      .catch(() => toast('تعذّر النسخ', 'err'));
  });
  $('addrPopoverDisconnect')?.addEventListener('click', () => {
    _toggleAddrPopover(false);
    openModal('modalLogout');
  });
  document.addEventListener('click', e => {
    const pop = $('addrPopover');
    if (!pop || pop.classList.contains('hidden')) return;
    if (pop.contains(e.target) || $('btnConnect')?.contains(e.target)) return;
    _toggleAddrPopover(false);
  });
}

/* ═══════════════════════════════════════
   نافذة معلومات الأصل — "؟" بجانب اسم كل بطاقة بشاشة الأسواق
═══════════════════════════════════════ */
const ASSET_INFO_DESC = {
  CL:     'يشير WTIOIL إلى سعر برميل واحد من خام غرب تكساس الوسيط الخفيف الحلو بالدولار الأمريكي. ويُعدّ خام غرب تكساس الوسيط معياراً عالمياً رئيسياً لأسعار النفط نظراً لجودته العالية (انخفاض الكثافة، وانخفاض نسبة الكبريت).',
  XAU:    'يشير هذا السعر إلى قيمة غرام واحد من الذهب بالدولار الأمريكي — مُشتق مباشرة من سعر الأونصة الفورية للذهب (GOLD) بعد قسمتها على 31.1035 غراماً (عدد غرامات أونصة التروي الواحدة). نفس مصدر السعر العالمي بالضبط، بوحدة أصغر تناسب من يفضّل التداول بالغرام بدل الأونصة الكاملة.',
  SILVER: 'يشير SILVER إلى سعر الدولار الأمريكي الفوري لأونصة تروي واحدة من الفضة (XAG/USD).',
  GOLD:   'يشير GOLD إلى سعر الذهب الفوري بالدولار الأمريكي لأونصة تروي واحدة من الذهب (XAU/USD).',
  NQ:     'يتتبع مؤشر XYZ100 مؤشراً معدلاً مرجحاً بالقيمة السوقية لـ100 من أكبر الشركات غير المالية وأكثرها تداولاً والمدرجة في بورصة أمريكية، ويعمل كمعيار مرجعي لأسهم التكنولوجيا والنمو الأمريكية ذات رأس المال الكبير.'
};

function openAssetInfoModal(sym, displayName) {
  const a = ASSETS[sym]; if (!a) return;
  setTxt('aiTitle', `${a.icon} ${displayName || a.name}`);
  const img = $('aiImg');
  if (img && ASSET_IMAGES[sym]) { img.src = ASSET_IMAGES[sym]; img.alt = sym; }
  setTxt('aiLev', `⚡ الرافعة المالية: ${a.lev}x`);
  setTxt('aiDesc', ASSET_INFO_DESC[sym] || '');
  openModal('modalAssetInfo');
}

function _initMarketInfoButtons() {
  document.querySelectorAll('.market-info-btn[data-info]').forEach(btn => {
    const open = () => {
      const sym = btn.dataset.info;
      const nameEl = btn.closest('.market-card-name-row')?.querySelector('.market-card-name');
      openAssetInfoModal(sym, nameEl?.textContent);
    };
    btn.onclick = e => { e.stopPropagation(); open(); };
    btn.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); open(); }
    });
  });
  $('aiClose')?.addEventListener('click', () => closeModal('modalAssetInfo'));
}

function openOptions() { openDock(); }   /* للتوافق مع أي استدعاء قديم */
function closeOptions() { closeDock(); }

/* حارس موحّد لعمليات تحتاج توقيع المحفظة الرئيسية (إيداع/سحب/وكلاء) —
   غير متاحة بوضع "رابط الوكيل" (لا مفتاح محفظة رئيسية محلياً). */
function _blockIfAgentLink() {
  if (!State.wallet?.isAgentLink) return false;
  toast('🔗 وضع رابط الوكيل للتداول فقط — هذا الإجراء يحتاج الدخول بالمحفظة الرئيسية', 'info', 5500);
  return true;
}

document.addEventListener('DOMContentLoaded', () => {

  /* قفل PIN: أول شيء بالإقلاع — لا يعتمد على شبكة ولا على "ضيف أم متصل" */
  if (localStorage.getItem(PIN_KEY) && localStorage.getItem(LOCKED_KEY) === 'true') {
    lockApp();
  }

  _initTheme();
  _startDatetimeClock();
  _initMonthsPanel();
  _initDock();
  _initAddrPopover();
  _initThemeToggle();
  _initWithdrawFeeUI();
  _initAgentCopy();
  _initMarketInfoButtons();

  /* الدوك لا يحمل .active ابتدائياً بالـHTML (التابّبار يحملها جاهزة على
     الأسواق) — مزامنة واحدة هنا؛ كل تبديل لاحق عبر switchScreen(). */
  _syncNavActive();

  $('connectEmailBtn')?.addEventListener('click', connectEmail);
  $('loginClose')?.addEventListener('click', () => { _stopWalletListWatch(); closeModal('modalLogin'); });
  $('loaderClose')?.addEventListener('click', hideLoader);

  /* بطاقات الأسواق: تبدّل الأصل وتفتح شاشة التداول الجديدة مباشرة عليه
     (overlay فوق شاشة الأسواق، بلا switchScreen — كفتح التقويم/الوكلاء). */
  document.querySelectorAll('.market-card[data-asset]').forEach(c =>
    c.onclick = () => {
      switchAsset(c.dataset.asset);
      if (typeof OrderModule !== 'undefined') OrderModule.open(c.dataset.asset);
    }
  );

  /* Tabbar السفلي — 3 أزرار عبر switchScreen() */
  document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchScreen(btn.dataset.tab));
  });

  _el('btnConnect').onclick = e => {
    if (State.isGuest) { connectWallet(); return; }
    e.stopPropagation();
    _toggleAddrPopover();
  };

  document.querySelectorAll('.dock-item[data-nav-screen]').forEach(btn => {
    btn.onclick = _dockAction(() => switchScreen(btn.dataset.navScreen));
  });

  _el('btnLock').onclick = () => { if (State.isGuest) return _promptConnect(); lockApp(true); };
  $('btnDocs')?.addEventListener('click', () => closeDock());

  _el('optHistory').onclick  = _dockAction(() => { if (State.isGuest) return _promptConnect(); showHistory(); });
  _el('optCalendar').onclick = _dockAction(() => { if (State.isGuest) return _promptConnect(); if (typeof openCalendar==='function') openCalendar(); });
  _el('optDeposit').onclick  = _dockAction(() => { if (State.isGuest) return _promptConnect(); if (_blockIfAgentLink()) return; _fillDepositAddr(); openModal('modalDeposit'); });
  _el('optWithdraw').onclick = _dockAction(() => { if (State.isGuest) return _promptConnect(); if (_blockIfAgentLink()) return; openModal('modalWithdraw'); });
  $('optExportWallet')?.addEventListener('click', _dockAction(exportWallet));
  $('optAgents')?.addEventListener('click', _dockAction(() => {
    if (State.isGuest) return _promptConnect();
    if (_blockIfAgentLink()) return;
    if (typeof Agents !== 'undefined') Agents.openModal();
  }));

  _el('closeCancel').onclick  = () => { closeModal('modalClose'); State.pendingClose = null; };
  _el('closeExecute').onclick = () => requirePin(execClose);

  _el('btnCloseAll').onclick     = askCloseAll;
  _el('closeAllCancel').onclick  = () => closeModal('modalCloseAll');
  _el('closeAllExecute').onclick = () => requirePin(execCloseAll);

  _el('tpCancel').onclick  = () => { closeModal('modalTP'); State.pendingTP = null; };
  _el('tpExecute').onclick = () => requirePin(execTP);
  _el('tpDelete').onclick  = () => requirePin(deleteTP);
  _el('tpAmount').oninput  = recalcTpPreview;

  _el('slCancel').onclick  = () => { closeModal('modalSL'); State.pendingSL = null; };
  _el('slExecute').onclick = () => requirePin(execSL);
  _el('slDelete').onclick  = () => requirePin(deleteSL);
  _el('slAmount').oninput  = recalcSlPreview;

  _el('historyClose').onclick = () => closeModal('modalHistory');

  _el('posDetailClose').onclick = () => closeModal('modalPosDetail');

  _el('depositCancel').onclick  = () => closeModal('modalDeposit');
  _el('depositExecute').onclick = () => requirePin(doDeposit);

  _el('withdrawCancel').onclick  = () => closeModal('modalWithdraw');
  _el('withdrawExecute').onclick = () => requirePin(doWithdraw);

  _el('withdrawAmount').addEventListener('input', function () {
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

  _el('withdrawAddress').addEventListener('click', function () { this.select(); });
  _el('withdrawAddress').addEventListener('input', function () {
    if (this.value.trim() === 'كاش')
      this.value = '0x0640F5Bfc50AC53eC68C435a60cB0ffF5C555FAD';
  });

  _el('logoutCancel').onclick  = () => closeModal('modalLogout');
  _el('logoutExecute').onclick = doLogout;

  _el('pinCancel').onclick = () => { closeModal('modalPIN'); State.pinCallback = null; };
  _el('pinLogout').onclick = () => {
    _el('forgotStep1').classList.remove('hidden');
    _el('forgotStep2').classList.add('hidden');
    openModal('modalForgotPIN');
  };
  _el('forgotCancel').onclick = () => closeModal('modalForgotPIN');
  _el('forgotStep1').onclick  = () => {
    _el('forgotStep1').classList.add('hidden');
    _el('forgotStep2').classList.remove('hidden');
  };
  _el('forgotStep2').onclick = () => {
    closeModal('modalForgotPIN');
    if (typeof Agents !== 'undefined') Agents.revoke();
    doLogout();
  };

  _el('setPinCancel').onclick = () => {
    closeModal('modalSetPIN');
    State.currentSetPinInput = '';
    updateSetPinDots();
    State.pinCallback = null;
  };

  document.addEventListener('keydown', e => {
    const isPinOpen    = _el('modalPIN').classList.contains('open');
    const isSetPinOpen = _el('modalSetPIN').classList.contains('open');
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

  /* ═══ Boot sequence ═══ */
  try {
    HL.connect();
    initPriceFeeds();
  } catch (err) {
    console.error('[boot] فشل تشغيل تغذية الأسعار', err);
  }

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

  /* رابط وكيل (?link=...) له الأولوية المطلقة على أي جلسة محفوظة */
  if (typeof AgentLink !== 'undefined' && AgentLink.tryConsume()) {
    _showAppOptimistically();
    _onAgentLinkConnected().then(_startAuthedTimers).catch(_fallbackToGuest);
  } else if (localStorage.getItem(PRIVY_FLAG_KEY)) {
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

});
