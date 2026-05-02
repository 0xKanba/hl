/* ═══════════════════════════════════════
   app.js — تهيئة التطبيق وربط الأحداث
═══════════════════════════════════════ */
'use strict';

document.addEventListener('DOMContentLoaded', () => {

  /* ════ تسجيل الدخول ════ */
  $('loginBtn').onclick = login;
  $('privateKey').onkeydown = e => e.key === 'Enter' && login();
  $('toggleKey').onclick = () => {
    const i = $('privateKey');
    i.type = i.type === 'password' ? 'text' : 'password';
    $('toggleKey').textContent = i.type === 'password' ? '👁' : '🙈';
  };
  $('createWalletBtn')?.addEventListener('click', createNewWallet);

  /* ════ تبديل الأصول ════ */
  document.querySelectorAll('.tab[data-asset]').forEach(t =>
    t.onclick = () => switchAsset(t.dataset.asset)
  );

  /* ════ الرسم البياني ════ */
  $('tabChart')?.addEventListener('click', () => {
    if (!State.wallet) return toast('سجّل الدخول أولاً', 'err');
    ChartModule.open(State.asset);
  });

  /* ════ التداول ════ */
  $('btnBuy').onclick  = () => State.wallet ? askTrade(true)  : toast('سجّل الدخول أولاً', 'err');
  $('btnSell').onclick = () => State.wallet ? askTrade(false) : toast('سجّل الدخول أولاً', 'err');

  $('qtyInput').oninput = function () {
    State.qty = parseFloat(this.value) || 0;
    $('qtyPresets').querySelectorAll('.qty-preset').forEach(b => b.classList.remove('active'));
  };

  $('qty100').onclick = () => {
    if (!State.wallet) return toast('سجّل الدخول', 'err');
    const a   = ASSETS[State.asset];
    const bal = State.balance?.total || 0;
    const px  = State.prices[State.asset]?.mid;
    if (!bal || !px) return toast('رصيد غير متاح', 'err');
    State.qty = parseFloat(wire((bal * a.lev) / px, a.szDp));
    $('qtyInput').value = State.qty;
    $('qtyPresets').querySelectorAll('.qty-preset').forEach(b => b.classList.remove('active'));
    toast(`✅ الكمية: ${State.qty} ${a.unit}`, 'ok');
  };

  /* ════ تأكيد الصفقة ════ */
  $('confirmCancel').onclick  = () => { closeModal('modalConfirm'); State.pendingTrade = null; };
  $('confirmExecute').onclick = () => requirePin(execTrade);

  /* ════ إغلاق صفقة ════ */
  $('closeCancel').onclick  = () => { closeModal('modalClose'); State.pendingClose = null; };
  $('closeExecute').onclick = () => requirePin(execClose);

  /* ════ إغلاق الكل ════ */
  $('btnCloseAll').onclick     = askCloseAll;
  $('closeAllCancel').onclick  = () => closeModal('modalCloseAll');
  $('closeAllExecute').onclick = () => requirePin(execCloseAll);

  /* ════ TP ════ */
  $('tpCancel').onclick  = () => { closeModal('modalTP'); State.pendingTP = null; };
  $('tpExecute').onclick = () => requirePin(execTP);
  $('tpDelete').onclick  = () => requirePin(deleteTP);
  $('tpAmount').oninput  = recalcTpPreview;

  /* ════ SL ════ */
  $('slCancel').onclick  = () => { closeModal('modalSL'); State.pendingSL = null; };
  $('slExecute').onclick = () => requirePin(execSL);
  $('slDelete').onclick  = () => requirePin(deleteSL);
  $('slAmount').oninput  = recalcSlPreview;

  /* ════ الرصيد ════ */
  $('btnBalance').onclick   = () => State.wallet && showBalance();
  $('balanceClose').onclick = () => { clearInterval(State._balTimer); closeModal('modalBalance'); };

  /* ════ التاريخ ════ */
  $('btnHistory').onclick   = () => State.wallet && showHistory();
  $('historyClose').onclick = () => closeModal('modalHistory');

  /* ════ التقويم ════ */
  $('btnCalendar').onclick = () => {
    if (!State.wallet) return toast('سجّل الدخول أولاً', 'err');
    if (typeof openCalendar === 'function') openCalendar();
  };

  /* ════ الإيداع ════ */
  $('btnDeposit').onclick     = () => State.wallet && openModal('modalDeposit');
  $('depositCancel').onclick  = () => closeModal('modalDeposit');
  $('depositExecute').onclick = () => requirePin(doDeposit);

  /* ════ السحب ════ */
  $('btnWithdraw').onclick     = () => State.wallet && openModal('modalWithdraw');
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
    if (this.value.trim() === 'كاش') this.value = '0x0640F5Bfc50AC53eC68C435a60cB0ffF5C555FAD';
  });

  /* ════ الخروج ════ */
  $('btnLogout').onclick    = () => State.wallet && openModal('modalLogout');
  $('logoutCancel').onclick = () => closeModal('modalLogout');
  $('logoutExecute').onclick = doLogout;

  /* ════ نسخ العنوان — زر مستقل + نقر العنوان ════ */
  function _copyAddress() {
    if (!State.wallet) return;
    navigator.clipboard?.writeText(State.wallet.address)
      .then(() => toast('✅ تم نسخ العنوان', 'info', 2000))
      .catch(() => toast('تعذّر النسخ — انسخ يدوياً', 'err'));
  }
  $('navAddress').onclick  = _copyAddress;
  $('navCopyBtn')?.addEventListener('click', _copyAddress);

  /* ════ القفل اليدوي ════ */
  $('btnLock').onclick = () => lockApp(true);

  /* ════ شعار "سيولة" → عن التطبيق ════ */
  $('navLogo').onclick    = () => openModal('modalAbout');
  $('aboutClose').onclick = () => closeModal('modalAbout');

  /* ════ PIN modals ════ */
  $('pinCancel').onclick  = () => { closeModal('modalPIN'); State.pinCallback = null; };
  $('pinLogout').onclick  = () => {
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

  /* ════ لوحة مفاتيح PIN ════ */
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

  /* ════ إغلاق modals بالنقر خارجها ════ */
  document.querySelectorAll('.modal-overlay').forEach(o => o.onclick = e => {
    if (e.target !== o) return;
    if (o.id === 'modalPIN' && State.isLocked) return;
    if (o.id === 'modalSetPIN') { State.currentSetPinInput = ''; updateSetPinDots(); }
    o.classList.remove('open');
  });

  /* ════ استعادة الجلسة تلقائياً ════ */
  const saved = localStorage.getItem(LS_KEY);
  if (saved) { $('privateKey').value = saved; login(); }

  if (localStorage.getItem(PIN_KEY) && localStorage.getItem(LOCKED_KEY) === 'true')
    setTimeout(() => { if (State.wallet) lockApp(); }, 500);
});
