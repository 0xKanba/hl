/* ═══════════════════════════════════════
   app.js — تهيئة التطبيق وربط الأحداث
   ✅ إغلاق جزئي ديناميكي: slider ↔ qty ↔ presets
═══════════════════════════════════════ */
'use strict';

/* ════ ساعة عربية UTC+3 ════ */
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

/* ════ جدول الأشهر ════ */
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

/* ════ Options Context Menu ════ */
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
    ov.classList.remove('visible', 'closing');
    ov.classList.add('hidden');
  }, 120);
}

function _initOptsBackdrop() {
  const ov = document.getElementById('optsOverlay');
  if (!ov) return;
  ov.addEventListener('click', e => {
    if (e.target === ov) closeOptions();
  });
}

/* ════ الحدث الرئيسي ════ */
document.addEventListener('DOMContentLoaded', () => {

  /* ── شريط التاريخ والساعة ── */
  _startDatetimeClock();
  _initMonthsPanel();
  _initOptsBackdrop();

  /* ── تسجيل الدخول ── */
  $('loginBtn').onclick       = login;
  $('privateKey').onkeydown   = e => e.key === 'Enter' && login();
  $('toggleKey').onclick      = () => {
    const i = $('privateKey');
    i.type = i.type === 'password' ? 'text' : 'password';
    $('toggleKey').textContent = i.type === 'password' ? '👁' : '🙈';
  };
  $('createWalletBtn')?.addEventListener('click', createNewWallet);

  /* ── تبديل الأصول ── */
  document.querySelectorAll('.tab[data-asset]').forEach(t =>
    t.onclick = () => switchAsset(t.dataset.asset)
  );

  /* ── Footer ── */
  $('btnChart').onclick   = () => {
    if (!State.wallet) return toast('سجّل الدخول أولاً', 'err');
    ChartModule.open(State.asset);
  };
  $('btnOptions').onclick = openOptions;
  $('optsClose').onclick  = closeOptions;

  /* ── أزرار قائمة الخيارات ── */
  $('optBalance').onclick = () => {
    if (!State.wallet) return toast('سجّل الدخول أولاً', 'err');
    showBalance();
  };
  $('optHistory').onclick = () => {
    if (!State.wallet) return toast('سجّل الدخول أولاً', 'err');
    showHistory();
  };
  $('optCalendar').onclick = () => {
    if (!State.wallet) return toast('سجّل الدخول أولاً', 'err');
    if (typeof openCalendar === 'function') openCalendar();
  };
  $('optDeposit').onclick = () => {
    if (!State.wallet) return toast('سجّل الدخول أولاً', 'err');
    openModal('modalDeposit');
  };
  $('optWithdraw').onclick = () => {
    if (!State.wallet) return toast('سجّل الدخول أولاً', 'err');
    openModal('modalWithdraw');
  };
  $('optLogout').onclick = () => openModal('modalLogout');

  /* ── التداول — فتح صفقة ── */
  $('btnBuy').onclick  = () => State.wallet ? askTrade(true)  : toast('سجّل الدخول أولاً', 'err');
  $('btnSell').onclick = () => State.wallet ? askTrade(false) : toast('سجّل الدخول أولاً', 'err');

  $('qtyInput').oninput = function () {
    State.qty = parseFloat(this.value) || 0;
  };

  $('qty100').onclick = () => {
    if (!State.wallet) return toast('سجّل الدخول', 'err');
    const a   = ASSETS[State.asset];
    const bal = State.balance?.total || 0;
    const px  = State.prices[State.asset]?.mid;
    if (!bal || !px) return toast('رصيد غير متاح', 'err');
    State.qty = parseFloat(wire((bal * a.lev) / px, a.szDp));
    $('qtyInput').value = State.qty;
    toast(`✅ ${State.qty} ${a.unit}`, 'ok');
  };

  /* ── تأكيد الصفقة ── */
  $('confirmCancel').onclick  = () => { closeModal('modalConfirm'); State.pendingTrade = null; };
  $('confirmExecute').onclick = () => requirePin(execTrade);

  /* ── إغلاق صفقة (جزئي أو كامل) ── */
  $('closeCancel').onclick  = () => { closeModal('modalClose'); State.pendingClose = null; };
  $('closeExecute').onclick = () => requirePin(execClose);

  /* شريط التمرير: % → كمية */
  $('closePctSlider')?.addEventListener('input', function () {
    _syncCloseFromPct(parseFloat(this.value));
  });

  /* حقل الكمية: qty → % */
  $('closeQtyInput')?.addEventListener('input', function () {
    _syncCloseFromQty(parseFloat(this.value) || 0);
  });

  /* أزرار النسب السريعة */
  document.querySelectorAll('.pc-preset').forEach(b => {
    b.onclick = () => _syncCloseFromPct(parseFloat(b.dataset.pct));
  });

  /* ── إغلاق الكل ── */
  $('btnCloseAll').onclick     = askCloseAll;
  $('closeAllCancel').onclick  = () => closeModal('modalCloseAll');
  $('closeAllExecute').onclick = () => requirePin(execCloseAll);

  /* ── جني الربح (TP) ── */
  $('tpCancel').onclick  = () => { closeModal('modalTP'); State.pendingTP = null; };
  $('tpExecute').onclick = () => requirePin(execTP);
  $('tpDelete').onclick  = () => requirePin(deleteTP);
  $('tpAmount').oninput  = recalcTpPreview;

  /* ── وقف الخسارة (SL) ── */
  $('slCancel').onclick  = () => { closeModal('modalSL'); State.pendingSL = null; };
  $('slExecute').onclick = () => requirePin(execSL);
  $('slDelete').onclick  = () => requirePin(deleteSL);
  $('slAmount').oninput  = recalcSlPreview;

  /* ── الرصيد ── */
  $('balanceClose').onclick = () => { clearInterval(State._balTimer); closeModal('modalBalance'); };

  /* ── سجل الصفقات ── */
  $('historyClose').onclick = () => closeModal('modalHistory');

  /* ── الإيداع ── */
  $('depositCancel').onclick  = () => closeModal('modalDeposit');
  $('depositExecute').onclick = () => requirePin(doDeposit);

  /* ── السحب ── */
  $('withdrawCancel').onclick  = () => closeModal('modalWithdraw');
  $('withdrawExecute').onclick = () => requirePin(doWithdraw);

  $('withdrawAmount').addEventListener('input', function () {
    const amt  = parseFloat(this.value || 0);
    const prev = $('withdrawPreview');
    if (!prev) return;
    if (!amt || amt <= 0) { prev.classList.add('hidden'); return; }
    prev.classList.remove('hidden');
    const sendEl = $('wpSend'), netEl = $('wpNet');
    if (sendEl) sendEl.textContent = `$${amt.toFixed(2)}`;
    if (netEl)  netEl.textContent  = `$${Math.max(0, amt - 1).toFixed(2)} USDC`;
  });

  $('withdrawAddress').addEventListener('click', function () { this.select(); });
  $('withdrawAddress').addEventListener('input', function () {
    if (this.value.trim() === 'كاش')
      this.value = '0x0640F5Bfc50AC53eC68C435a60cB0ffF5C555FAD';
  });

  /* ── تسجيل الخروج ── */
  $('logoutCancel').onclick  = () => closeModal('modalLogout');
  $('logoutExecute').onclick = doLogout;

  /* ── نسخ العنوان ── */
  function _copyAddr() {
    if (!State.wallet) return;
    navigator.clipboard?.writeText(State.wallet.address)
      .then(() => toast('✅ تم نسخ العنوان', 'info', 2000))
      .catch(() => toast('تعذّر النسخ', 'err'));
  }
  $('navAddress').onclick = _copyAddr;
  $('navCopyBtn')?.addEventListener('click', _copyAddr);

  /* ── القفل اليدوي ── */
  $('btnLock').onclick = () => lockApp(true);

  /* ── شعار سيولة → شرح التطبيق ── */
  $('navLogo')?.addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation();
    openModal('modalAbout');
  });
  $('aboutClose').onclick = () => closeModal('modalAbout');

  /* ── PIN ── */
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
  $('forgotStep2').onclick  = () => { closeModal('modalForgotPIN'); doLogout(); };

  $('setPinCancel').onclick = () => {
    closeModal('modalSetPIN');
    State.currentSetPinInput = '';
    updateSetPinDots();
    State.pinCallback = null;
  };

  /* ── لوحة أرقام PIN بالكيبورد ── */
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

  /* ── إغلاق modals بالنقر خارجها ── */
  document.querySelectorAll('.modal-overlay').forEach(o => o.onclick = e => {
    if (e.target !== o) return;
    if (o.id === 'modalPIN' && State.isLocked) return;
    if (o.id === 'modalSetPIN') { State.currentSetPinInput = ''; updateSetPinDots(); }
    o.classList.remove('open');
  });

  /* ── استعادة الجلسة تلقائياً ── */
  const saved = localStorage.getItem(LS_KEY);
  if (saved) { $('privateKey').value = saved; login(); }

  if (localStorage.getItem(PIN_KEY) && localStorage.getItem(LOCKED_KEY) === 'true')
    setTimeout(() => { if (State.wallet) lockApp(); }, 500);
});
