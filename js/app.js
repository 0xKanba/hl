/* ═══════════════════════════════════════
   app.js — appbar + tabbar سفلي (3 أزرار) + درج هامبرغر
   ✅ راوتر شاشات: الرئيسية / الأسواق / الرسم البياني (data-screen)
      — switchScreen() المسؤول الوحيد عن إظهار/إخفاء أي من الثلاث،
      بما فيها الرسم البياني الآن (لم يعد overlay منفصلاً — راجع
      index.html/chart.js). تستدعي ChartModule.open()/close() فقط
      عند الدخول/الخروج من شاشة الرسم تحديداً، بلا أي منطق إضافي.
   ✅ الدرج فوري 100% (بلا transition) — الهامبرغر نفسه مفتاح تبديل
      (لا زر ✕). محتواه يبدأ بنفس أزرار التذييل (رئيسية/أسواق/رسم)،
      ثم إيداع/سحب/تأريخ/تقويم/وكلاء/تصدير محفظة/وثائق كما هي.
      القفل انتقل لـappbar، وتبديل المظهر أصبح شعارين ثابتين أسفل
      الدرج (☀️/🌙) بدل زر واحد يقلب الحالة.
   ✅ عنوان الحساب المتصل بالـappbar الآن popover صغير (نسخ + إلغاء
      اتصال يفتح modalLogout) بدل مودال منفصل مباشرة عند نقر الزر.
   ✅ "الرصيد" حُذف من القائمة نهائياً — بطاقة دائمة أعلى الرئيسية الآن
      (راجع account.js:_renderBalanceFromState).
   ✅ بطاقات الأسواق (شاشة الأسواق) تُحدَّث بمؤقّت خفيف كل ثانية من
      State.prices/State.prevDayPx مباشرة — بلا أي لمس لـprices.js/
      session.js (تبقيان كما هما بالضبط، الأسعار نفسها تبقى حيّة 100%
      عبر WS الموجود أصلاً؛ هذا فقط مؤقّت عرض لشاشة التصفح).
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

/* ✅ الآن شعاران ثابتان (☀️/🌙) أسفل الدرج بدل زر واحد يقلب الحالة —
   _syncThemeToggleUI() تُبرز الحالة النشطة، _setTheme() تختار صراحة. */
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

function _syncThemeToggleUI() {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  document.querySelectorAll('.theme-opt').forEach(b => b.classList.toggle('active', b.dataset.themeSet === cur));
}
function _setTheme(theme) {
  if (theme === (document.documentElement.getAttribute('data-theme') || 'dark')) return;
  localStorage.setItem('hl_theme', theme);
  _applyTheme(theme, true);
}
function _initThemeToggle() {
  document.querySelectorAll('.theme-opt').forEach(b => b.onclick = () => _setTheme(b.dataset.themeSet));
  _syncThemeToggleUI();
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

/* عنوان محفظة المستخدم داخل modalDeposit نفسها — بلا تغيير */
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
   ✅ راوتر الشاشات — الرئيسية / الأسواق / الرسم البياني
   الرسم البياني شاشة ثالثة عادية الآن (data-screen="chart") — هذه
   الدالة وحدها مسؤولة عن إظهار/إخفاء أي من الثلاث (.hidden)؛ فقط
   تستدعي ChartModule.open()/close() لإدارة محتواها الداخلي (الودجت/
   اشتراك BBO/الساعة) عند الدخول/الخروج تحديداً — لا علاقة له بإظهار
   العنصر نفسه، فلا حاجة لمراقب DOM منفصل كما سابقاً.
═══════════════════════════════════════ */
let _activeScreen = 'home';

function switchScreen(name) {
  if (name === _activeScreen) return;
  const next = document.querySelector(`.app-screen[data-screen="${name}"]`);
  if (!next) return;
  const current = document.querySelector(`.app-screen[data-screen="${_activeScreen}"]`);
  if (current) current.classList.add('hidden');

  if (_activeScreen === 'chart' && typeof ChartModule !== 'undefined') ChartModule.close();

  next.classList.remove('hidden');
  /* إعادة تشغيل أنيميشن الدخول حتى لو الشاشة كانت مبنية أصلاً */
  next.classList.remove('screen-anim');
  void next.offsetWidth; /* إجبار reflow */
  next.classList.add('screen-anim');

  _activeScreen = name;
  _syncTabbarActive();

  if (name === 'chart' && typeof ChartModule !== 'undefined') {
    ChartModule.open(State.asset);
  } else {
    const scroller = next.querySelector('.screen-scroll');
    if (scroller) scroller.scrollTop = 0;
  }
}

function _syncTabbarActive() {
  document.querySelectorAll('.tab-btn[data-tab]').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === _activeScreen)
  );
}

/* ═══════════════════════════════════════
   ✅ درج هامبرغر — فوري 100% (بلا أي transition/انتظار). الهامبرغر
   نفسه مفتاح تبديل (لا زر ✕ منفصل) — أي نقر خارج اللوحة أو على عنصر
   بداخلها يُغلقها أيضاً.
═══════════════════════════════════════ */
function openDrawer() {
  const ov = $('drawerOverlay');
  if (!ov) return;
  ov.classList.remove('hidden');
  ov.classList.add('open');
}
function closeDrawer() {
  const ov = $('drawerOverlay');
  if (!ov) return;
  ov.classList.remove('open');
  ov.classList.add('hidden');
}
function _drawerAction(fn) {
  return () => { closeDrawer(); fn(); };
}
function _initDrawer() {
  $('btnMenu')?.addEventListener('click', () => {
    const ov = $('drawerOverlay');
    if (ov && ov.classList.contains('open')) closeDrawer(); else openDrawer();
  });
  $('drawerOverlay')?.addEventListener('click', e => { if (e.target === $('drawerOverlay')) closeDrawer(); });
}

/* ═══════════════════════════════════════
   ✅ عنوان الحساب بالـappbar — popover صغير بدل مودال منفصل مباشرة.
   الزر نفسه (btnConnect) يُلوَّن/يُسمّى عادةً عبر auth.js:updateConnectBtn؛
   هنا فقط التبديل + الإغلاق بالنقر خارجه + النسخ/إلغاء الاتصال.
═══════════════════════════════════════ */
function _toggleAddrPopover(forceOpen) {
  const pop = $('addrPopover');
  if (!pop) return;
  const open = forceOpen !== undefined ? forceOpen : pop.classList.contains('hidden');
  pop.classList.toggle('hidden', !open);
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
   ✅ جديد — تحديث بطاقات شاشة الأسواق (سعر + تغيّر 24س)
   يقرأ فقط من State.prices/State.prevDayPx الحيّة أصلاً عبر WS —
   لا يلمس prices.js إطلاقاً، مجرّد "نافذة عرض" خفيفة لهذي الشاشة.
═══════════════════════════════════════ */
let _marketsRefreshTimer = null;

function _refreshMarketCards() {
  Object.keys(ASSETS).forEach(sym => {
    const p = State.prices[sym];
    const priceEl = $(`mktPrice${sym}`);
    if (priceEl && p?.mid) priceEl.textContent = fmt(p.mid, ASSETS[sym].pxDp);

    const prevDay = State.prevDayPx[sym];
    const chgEl = $(`mktChg${sym}`);
    if (chgEl && p?.mid && prevDay > 0) {
      const chg = ((p.mid - prevDay) / prevDay) * 100;
      chgEl.textContent = `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`;
      chgEl.className   = `market-card-chg ${chg > 0.005 ? 'up' : chg < -0.005 ? 'dn' : 'n'}`;
    }
  });
  document.querySelectorAll('.market-card[data-asset]').forEach(c =>
    c.classList.toggle('active', c.dataset.asset === State.asset)
  );
}
function _startMarketsRefresh() {
  clearInterval(_marketsRefreshTimer);
  _refreshMarketCards();
  _marketsRefreshTimer = setInterval(_refreshMarketCards, 1000);
}

function openOptions() {
  /* إبقاء الاسم للتوافق لو استُدعيت من أي مكان قديم — الآن تفتح الدرج */
  openDrawer();
}
function closeOptions() {
  closeDrawer();
}

document.addEventListener('DOMContentLoaded', () => {

  _initTheme();
  _startDatetimeClock();
  _initMonthsPanel();
  _initDrawer();
  _initAddrPopover();
  _initThemeToggle();
  _initQtyInput();
  _initWithdrawFeeUI();
  _initAgentCopy();
  _startMarketsRefresh();

  $('connectEmailBtn')?.addEventListener('click', connectEmail);
  $('loginClose')?.addEventListener('click', () => { _stopWalletListWatch(); closeModal('modalLogin'); });
  $('loaderClose')?.addEventListener('click', hideLoader);

  /* تبويبات تبديل الأصل السريعة — تبقى بالرئيسية بلا أي تغيير */
  document.querySelectorAll('.tab[data-asset]').forEach(t =>
    t.onclick = () => switchAsset(t.dataset.asset)
  );

  /* بطاقات شاشة الأسواق — الضغط يبدّل الأصل ويعود للرئيسية */
  document.querySelectorAll('.market-card[data-asset]').forEach(c =>
    c.onclick = () => { switchAsset(c.dataset.asset); switchScreen('home'); }
  );

  /* ✅ Tabbar السفلي — 3 أزرار: رسم / رئيسية (افتراضي) / أسواق —
     الثلاثة الآن تمر عبر switchScreen() نفسها (راجع تعليقها أعلاه) —
     لا حاجة لأي حالة خاصة بالرسم البياني هنا بعد الآن. */
  document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchScreen(btn.dataset.tab));
  });

  $('btnConnect').onclick = e => {
    if (State.isGuest) { connectWallet(); return; }
    e.stopPropagation();
    _toggleAddrPopover();
  };

  /* ✅ نفس أزرار التذييل، كأول خيارات بالدرج */
  document.querySelectorAll('.drawer-item[data-nav-screen]').forEach(btn => {
    btn.onclick = _drawerAction(() => switchScreen(btn.dataset.navScreen));
  });

  /* ✅ محتويات الدرج — نفس الـIDs القديمة تماماً. القفل انتقل لـappbar
     (لم يعد بداخل الدرج، فلا حاجة لـ_drawerAction هنا). المظهر أصبح
     شعارين ثابتين أسفل الدرج (راجع _initThemeToggle). */
  $('btnLock').onclick = () => { if (State.isGuest) return _promptConnect(); lockApp(true); };
  $('btnDocs')?.addEventListener('click', () => closeDrawer());

  $('optHistory').onclick  = _drawerAction(() => { if (State.isGuest) return _promptConnect(); showHistory(); });
  $('optCalendar').onclick = _drawerAction(() => { if (State.isGuest) return _promptConnect(); if (typeof openCalendar==='function') openCalendar(); });
  $('optDeposit').onclick  = _drawerAction(() => { if (State.isGuest) return _promptConnect(); _fillDepositAddr(); openModal('modalDeposit'); });
  $('optWithdraw').onclick = _drawerAction(() => { if (State.isGuest) return _promptConnect(); openModal('modalWithdraw'); });
  $('optExportWallet')?.addEventListener('click', _drawerAction(exportWallet));
  $('optAgents')?.addEventListener('click', _drawerAction(() => { if (typeof Agents !== 'undefined') Agents.openModal(); }));

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
