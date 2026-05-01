/* ═══════════════════════════════════════
   auth.js — دخول وخروج
═══════════════════════════════════════ */
'use strict';

/* ════ إنشاء محفظة جديدة ════ */
function createNewWallet() {
  const wallet = ethers.Wallet.createRandom();
  const key    = wallet.privateKey;
  const input  = $('privateKey');
  if (input) { input.value = key; input.type = 'text'; }
  navigator.clipboard?.writeText(key).catch(() => {});
  alert(`✅ تم إنشاء محفظة جديدة!\n\nالمفتاح الخاص:\n${key}\n\n⚠️ احفظه الآن في مكان آمن!`);
  toast('✅ المفتاح جاهز — احفظه!', 'ok', 6000);
}

/* ════ تسجيل الدخول ════ */
async function login() {
  let key = $('privateKey').value.trim();
  if (!key) return toast('أدخل المفتاح الخاص', 'err');
  key = key.startsWith('0x') ? key : '0x' + key;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) return toast('المفتاح 64 حرف هكساديسيمال', 'err');

  setBtnLoading('loginBtn', '⏳');
  showLoader('التحقق من المحفظة...');
  try {
    State.wallet = new ethers.Wallet(key);
    localStorage.setItem(LS_KEY, key);

    setTxt('navAddress', State.wallet.address.slice(0, 6) + '...' + State.wallet.address.slice(-4));
    $('withdrawAddress').value = State.wallet.address;

    $('loginScreen').classList.add('hidden');
    $('appScreen').classList.remove('hidden');

    switchAsset('CL');
    loadQuickState();

    showLoader('جلب الأسعار والحساب...');
    await Promise.all([pollPrices(), pollAccount()]);

    autoSetReferrer();
    hideLoader();
    toast('مرحباً 🤝', 'ok');

    // تحديث دوري
    State.timers.push(
      setInterval(pollPrices,  2000),
      setInterval(pollAccount, 3000)
    );
    startMainClock();
    startSessionPolling();
    startMainWs();
    startFundingTimer();

  } catch (e) {
    hideLoader();
    State.wallet = null;
    toast('خطأ: ' + e.message.slice(0, 80), 'err');
  } finally {
    resetBtn('loginBtn');
  }
}

/* ════ تسجيل الخروج ════ */
function doLogout() {
  State.timers.forEach(clearInterval);
  clearInterval(State.priceTimer);
  clearInterval(State._balTimer);
  clearInterval(State._clockTimer);
  clearInterval(State._sessionTimer);
  clearInterval(State._fundingTimer);
  wsMainClose();

  localStorage.removeItem(LS_KEY);
  localStorage.removeItem(PIN_KEY);
  localStorage.removeItem(LOCKED_KEY);
  localStorage.removeItem(LAST_PIN_KEY);
  localStorage.removeItem(QSTATE_KEY);

  State.wallet    = null;
  State.positions = [];
  State.openOrders= [];
  State.isLocked  = false;
  State.timers    = [];

  closeModal('modalLogout');
  closeModal('modalPIN');
  closeModal('modalSetPIN');
  closeModal('modalForgotPIN');

  $('appScreen').classList.add('hidden');
  $('loginScreen').classList.remove('hidden');
  $('privateKey').value = '';

  toast('تم الخروج بنجاح', 'info');
}
