/* ═══════════════════════════════════════
   auth.js — دخول وخروج + وضع الزائر
   ✅ الموقع يعمل بدون محفظة
   ✅ زر الاتصال: لون حسب Hyperliquid WS
      نص حسب وجود محفظة محلياً
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

/* ════ وضع الزائر — يُستدعى عند فتح الصفحة بدون محفظة ════ */
function initGuestMode() {
  State.isGuest = true;
  $('loginScreen')?.classList.add('hidden');
  $('appScreen')?.classList.remove('hidden');

  _showGuestBanner();
  switchAsset('CL');
  _fetchPricesBackground();
  State.timers.push(setInterval(pollPrices, 2000));
  startSessionPolling();

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

    setTxt('navAddress', State.wallet.address.slice(0, 6) + '...' + State.wallet.address.slice(-4));
    $('withdrawAddress').value = State.wallet.address;

    closeModal('modalLogin');
    _hideGuestBanner();
    loadQuickState();
    _fetchPricesBackground();
    pollAccount().catch(() => {});
    autoSetReferrer();

    State.timers.push(setInterval(pollAccount, 4000));
    startFundingTimer();

    updateConnectBtn();
    toast('مرحباً 🤝', 'ok');

    if (localStorage.getItem(PIN_KEY) && localStorage.getItem(LOCKED_KEY) === 'true')
      setTimeout(() => { if (State.wallet) lockApp(); }, 300);

  } catch (e) {
    State.wallet  = null;
    State.isGuest = true;
    updateConnectBtn();
    toast('خطأ: ' + e.message.slice(0, 80), 'err');
  } finally { resetBtn('loginBtn'); }
}

/* ════ جلب الأسعار الأولي ════ */
function _fetchPricesBackground() {
  const uniqueCoins = {};
  Object.keys(ASSETS).forEach(sym => {
    if (sym === 'XAU') return;
    const c = ASSETS[sym].coin;
    if (!uniqueCoins[c]) uniqueCoins[c] = sym;
  });
  Object.entries(uniqueCoins).forEach(([coinStr, sym]) => {
    hlInfo({ type: 'l2Book', coin: coinStr })
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
          State.prices['XAU'] = { bid: bid / TROY, ask: ask / TROY, mid: gm };
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

  _showGuestBanner();
  updateConnectBtn();
  resetPosFingerprint();
  renderPositions();
  toast('تم الخروج بنجاح', 'info');

  /* أعد تشغيل الأسعار */
  startMainWs();
  State.timers.push(setInterval(pollPrices, 2000));
  startSessionPolling();
}

/* ════ Guest Banner ════ */
function _showGuestBanner() {
  let b = $('guestBanner');
  if (!b) {
    b = document.createElement('div');
    b.id = 'guestBanner';
    b.className = 'guest-banner';
    b.innerHTML = `
      <span class="gb-msg">🔒 اربط محفظتك لبدء التداول وعرض صفقاتك المفتوحة</span>
      <button class="gb-btn" onclick="openLoginModal()">اتصال ←</button>`;
    const main = $('appScreen');
    if (main) {
      const footer = main.querySelector('.footer');
      if (footer) main.insertBefore(b, footer);
      else main.appendChild(b);
    }
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

/* ════════════════════════════════════════════════
   ✅ updateConnectBtn — المنطق:
   
   لونه (Hyperliquid WS):
     أخضر  → State.wsConnected === true
     أصفر  → WS تحاول الاتصال (لم يُفتح بعد)
     أحمر  → State.wsConnected === false

   نصه (المحفظة المحلية):
     "متصل"  → State.wallet موجود (محفظة مربوطة)
     "اتصال" → State.isGuest (لا محفظة)
════════════════════════════════════════════════ */
function updateConnectBtn() {
  const btn = $('btnConnect');
  if (!btn) return;

  /* النص — حسب المحفظة المحلية */
  const hasWallet = !!State.wallet;
  btn.dataset.label = hasWallet ? 'متصل' : 'اتصال';

  /* اللون — حسب اتصال Hyperliquid */
  if (State.wsConnected) {
    btn.className = 'footer-connect-btn ws-connected';
  } else {
    /* إذا كان WS لم يُفتح بعد (أول تحميل) → أصفر */
    const wasEverConnected = btn.dataset.everConnected === '1';
    if (!wasEverConnected) {
      btn.className = 'footer-connect-btn ws-connecting';
    } else {
      btn.className = 'footer-connect-btn ws-disconnected';
    }
  }

  /* عند الاتصال الأول نضع علامة */
  if (State.wsConnected) btn.dataset.everConnected = '1';

  /* تحديث محتوى الزر */
  btn.innerHTML = `<span class="cb-dot"></span><span class="cb-lbl">${hasWallet ? 'متصل' : 'اتصال'}</span>`;
}
