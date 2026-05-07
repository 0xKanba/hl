/* ═══════════════════════════════════════
   auth.js — دخول وخروج
   ✅ عرض فوري بدون انتظار API
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
  try {
    State.wallet = new ethers.Wallet(key);
    localStorage.setItem(LS_KEY, key);

    setTxt('navAddress', State.wallet.address.slice(0, 6) + '...' + State.wallet.address.slice(-4));
    $('withdrawAddress').value = State.wallet.address;

    /* ══ عرض الشاشة فوراً ══ */
    $('loginScreen').classList.add('hidden');
    $('appScreen').classList.remove('hidden');
    switchAsset('CL');

    /* ══ تحميل الكاش المحفوظ فوراً (بدون loader) ══ */
    loadQuickState();

    /* ══ جلب الأسعار في الخلفية — كل سعر يظهر فور وصوله ══ */
    _fetchPricesBackground();

    /* ══ بيانات الحساب في الخلفية ══ */
    pollAccount().catch(() => {});

    autoSetReferrer();
    toast('مرحباً 🤝', 'ok');

    /* ══ بدء التحديثات الدورية ══ */
    State.timers.push(
      setInterval(pollPrices,  2000),
      setInterval(pollAccount, 3000)
    );
    /* ✅ startMainClock() محذوفة — الساعة تعمل من _startDatetimeClock() في app.js */
    startSessionPolling();
    startMainWs();
    startFundingTimer();
    /* ✅ طلب إذن الإشعارات وأخذ snapshot أولي */
    if (typeof notifyInit === 'function') notifyInit();

  } catch (e) {
    State.wallet = null;
    toast('خطأ: ' + e.message.slice(0, 80), 'err');
  } finally {
    resetBtn('loginBtn');
  }
}

/* ════ جلب الأسعار الأولي في الخلفية بدون loader ════ */
function _fetchPricesBackground() {
  /* كل سعر مستقل — يُحدّث UI فور وصوله */
  const uniqueCoins = {};
  Object.keys(ASSETS).forEach(sym => {
    if (sym === 'XAU') return;
    const c = ASSETS[sym].coin;
    if (!uniqueCoins[c]) uniqueCoins[c] = sym;
  });

  Object.entries(uniqueCoins).forEach(([coinStr, sym]) => {
    hlInfo({ type:'l2Book', coin:coinStr })
      .then(lb => {
        const bid = parseFloat(lb.levels?.[0]?.[0]?.px || 0);
        const ask = parseFloat(lb.levels?.[1]?.[0]?.px || 0);
        const mid = (bid && ask) ? (bid + ask) / 2 : 0;
        if (!mid) return;
        if (sym === 'GOLD') {
          State.prices['GOLD'] = { bid, ask, mid };
          _updateTab('GOLD', mid, ASSETS['GOLD'].pxDp);
          State.prevMid['GOLD'] = mid;
          if (State.asset === 'GOLD') updatePriceUI();
          const gm = mid / TROY;
          State.prices['XAU'] = { bid:bid/TROY, ask:ask/TROY, mid:gm };
          _updateTab('XAU', gm, ASSETS['XAU'].pxDp);
          State.prevMid['XAU'] = gm;
          if (State.asset === 'XAU') updatePriceUI();
        } else {
          State.prices[sym] = { bid, ask, mid };
          _updateTab(sym, mid, ASSETS[sym].pxDp);
          State.prevMid[sym] = mid;
          if (sym === State.asset) updatePriceUI();
        }
      })
      .catch(() => {});
  });
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

  State.wallet     = null;
  State.positions  = [];
  State.openOrders = [];
  State.isLocked   = false;
  State.timers     = [];

  closeModal('modalLogout');
  closeModal('modalPIN');
  closeModal('modalSetPIN');
  closeModal('modalForgotPIN');

  $('appScreen').classList.add('hidden');
  $('loginScreen').classList.remove('hidden');
  $('privateKey').value = '';

  toast('تم الخروج بنجاح', 'info');
}
