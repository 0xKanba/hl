/* ═══════════════════════════════════════
   auth.js — دخول وخروج + وضع الزائر
   ✅ الموقع يعمل بدون محفظة (أسعار مباشرة)
   ✅ زر "اتصال" يُظهر صفحة المفتاح الخاص
   ✅ عند الدخول: تحميل الصفقات + الرصيد
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

/* ════ تهيئة وضع الزائر (يُستدعى عند فتح الصفحة) ════ */
function initGuestMode() {
  State.isGuest = true;

  /* أظهر شاشة التطبيق فوراً */
  $('loginScreen')?.classList.add('hidden');
  $('appScreen')?.classList.remove('hidden');

  /* أظهر banner الزائر */
  _showGuestBanner();

  /* ابدأ الأسعار بدون محفظة */
  switchAsset('CL');
  _fetchPricesBackground();
  State.timers.push(setInterval(pollPrices, 2000));
  startSessionPolling();
  startMainWs();

  /* حالة الاتصال */
  updateConnectBtn();
}

/* ════ تسجيل الدخول ════ */
async function login() {
  let key = $('privateKey').value.trim();
  if (!key) return toast('أدخل المفتاح الخاص', 'err');
  key = key.startsWith('0x') ? key : '0x' + key;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) return toast('المفتاح 64 حرف هكساديسيمال', 'err');

  setBtnLoading('loginBtn', '⏳');
  try {
    State.wallet  = new ethers.Wallet(key);
    State.isGuest = false;
    localStorage.setItem(LS_KEY, key);

    setTxt('navAddress', State.wallet.address.slice(0,6) + '...' + State.wallet.address.slice(-4));
    $('withdrawAddress').value = State.wallet.address;

    /* أغلق شاشة الدخول إذا كانت مفتوحة */
    closeModal('modalLogin');

    /* أزل banner الزائر */
    _hideGuestBanner();

    /* تحميل بيانات الحساب */
    loadQuickState();
    _fetchPricesBackground();
    pollAccount().catch(() => {});
    autoSetReferrer();
    toast('مرحباً 🤝', 'ok');

    /* مؤقتات إضافية للحساب */
    State.timers.push(setInterval(pollAccount, 4000));
    startFundingTimer();

    /* تحديث زر الاتصال */
    updateConnectBtn();

    /* PIN إذا كان محدداً */
    if (localStorage.getItem(PIN_KEY) && localStorage.getItem(LOCKED_KEY) === 'true')
      setTimeout(() => { if (State.wallet) lockApp(); }, 300);

  } catch (e) {
    State.wallet  = null;
    State.isGuest = true;
    toast('خطأ: ' + e.message.slice(0, 80), 'err');
  } finally { resetBtn('loginBtn'); }
}

/* ════ جلب الأسعار الأولي في الخلفية ════ */
function _fetchPricesBackground() {
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
  State.isGuest    = true;
  State._lastOptimisticClose = 0;
  State._emptyPosCount       = 0;

  closeModal('modalLogout');
  closeModal('modalPIN');
  closeModal('modalSetPIN');
  closeModal('modalForgotPIN');

  /* عد لوضع الزائر بدلاً من شاشة الدخول */
  _showGuestBanner();
  updateConnectBtn();
  renderPositions();
  toast('تم الخروج بنجاح', 'info');
}

/* ════ banner الزائر ════ */
function _showGuestBanner() {
  let b = $('guestBanner');
  if (!b) {
    b = document.createElement('div');
    b.id = 'guestBanner';
    b.className = 'guest-banner';
    b.innerHTML = `
      <span class="gb-msg">🔒 اربط محفظتك لبدء التداول وعرض صفقاتك</span>
      <button class="gb-btn" onclick="openLoginModal()">اتصال ←</button>`;
    /* أدرجه فوق شريط التداول */
    const main = $('appScreen');
    if (main) main.insertBefore(b, main.querySelector('.main'));
  }
  b.classList.remove('hidden');
}

function _hideGuestBanner() {
  $('guestBanner')?.classList.add('hidden');
}

/* ════ فتح modal الدخول ════ */
function openLoginModal() {
  openModal('modalLogin');
  setTimeout(() => $('privateKey')?.focus(), 200);
}

/* ════ زر الاتصال — تحديث الحالة ════ */
function updateConnectBtn() {
  const btn  = $('btnConnect');
  const lbl  = $('btnConnectLbl');
  if (!btn || !lbl) return;

  if (State.isGuest) {
    btn.className  = 'footer-connect-btn disconnected';
    lbl.textContent = 'اتصال';
  } else {
    const ok = State.wsConnected;
    btn.className  = `footer-connect-btn ${ok ? 'connected' : 'connecting'}`;
    lbl.textContent = ok ? 'متصل' : 'جاري...';
  }
}
