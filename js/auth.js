/* ═══════════════════════════════════════
   auth.js — دخول وخروج + وضع الزائر
   ✅ بريد إلكتروني → Privy فقط (embedded wallet + OTP)
   ✅ محفظة خارجية (Brave/Trust/Rabby/أي محفظة) → wallets.js فقط،
      بلا أي علاقة بـPrivy إطلاقاً — راجع connectWallet()
   ✅ محفظة الوكيل (Agent Wallet): تفويض مرة واحدة، توقيع محلي بلا
      نوافذ تأكيد لكل صفقة بعدها — راجع ensureAgent()
   ✅ الموقع يعمل بدون محفظة (وضع زائر)
   ✅ loginWithRawKey() القديم موجود كمسار احتياطي/انتقالي فقط
═══════════════════════════════════════ */
'use strict';

/* ════════════════════════════════════════════════
   تحميل كسول لـ privy-bridge.js (~1.4MB gzip)
   يُحمَّل فقط عند اختيار "بريد إلكتروني" فعلياً، أو عند استرجاع
   جلسة Privy سابقة عند الإقلاع — أبداً لوضع الزائر البارد، وأبداً
   لمسار المحفظة الخارجية (wallets.js لا يحتاجه إطلاقاً).
════════════════════════════════════════════════ */
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

/* ════ إنشاء محفظة جديدة محلياً (مسار قديم — راجع الشرح بالأسفل) ════ */
function createNewWallet() {
  const wallet = ethers.Wallet.createRandom();
  const key    = wallet.privateKey;
  const input  = $('privateKey');
  if (input) { input.value = key; input.type = 'text'; }
  navigator.clipboard?.writeText(key).catch(() => {});
  alert('✅ تم إنشاء محفظة جديدة!\n\nالمفتاح الخاص:\n' + key + '\n\n⚠️ احفظه الآن في مكان آمن!');
  toast('✅ المفتاح جاهز — احفظه!', 'ok', 6000);
}

/* ════ وضع الزائر ════ */
function initGuestMode() {
  State.isGuest = true;
  $('loginScreen')?.classList.add('hidden');
  $('appScreen')?.classList.remove('hidden');

  _showGuestBanner();
  switchAsset('CL');
  _fetchPricesBackground();
  startSessionPolling();
  updateConnectBtn();
}

/* ════════════════════════════════════════════════
   نافذة الاتصال — بريد إلكتروني (زر واحد بالأعلى) أو محفظة
   مكتشَفة (قائمة بالأسفل، من wallets.js، بلا Privy إطلاقاً).
════════════════════════════════════════════════ */
function connectWallet() {
  if (!State.isGuest) return openOptions();
  _renderExtWalletList();
  if (typeof Wallets !== 'undefined') Wallets.onListChanged(_renderExtWalletList); /* حي أثناء فتح النافذة */
  openModal('modalLogin');
}

/* يوقف الاستماع الحي لما تُغلق النافذة (بأي طريقة: زر إغلاق، اتصال ناجح، نقر خارج المودال) */
function _stopWalletListWatch() {
  if (typeof Wallets !== 'undefined') Wallets.onListChanged(null);
}

function _renderExtWalletList() {
  const box = $('extWalletList');
  if (!box) return;
  const entries = (typeof Wallets !== 'undefined') ? Wallets.list() : [];

  if (!entries.length) {
    box.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:var(--fs-sm);padding:8px 4px;">لا توجد محفظة مكتشَفة بهذا المتصفح — افتح الموقع من داخل تطبيق محفظتك (مثل Trust Wallet) أو من متصفح فيه إضافة محفظة.</div>';
    return;
  }

  box.innerHTML = entries.map(function (e, i) {
    const iconHtml = e.info.icon
      ? '<img src="' + e.info.icon + '" alt="" style="width:20px;height:20px;border-radius:5px;">'
      : '👛';
    return '<button class="create-wallet-btn" data-ext-idx="' + i + '" style="display:flex;align-items:center;justify-content:center;gap:8px;">'
      + iconHtml + '<span>' + e.info.name + '</span></button>';
  }).join('');

  box.querySelectorAll('[data-ext-idx]').forEach(function (btn) {
    btn.onclick = function () { _connectExternal(entries[+btn.dataset.extIdx]); };
  });
}

/* ════ اتصال بريد إلكتروني — Privy فقط، لا محافظ هنا إطلاقاً ════ */
async function connectEmail() {
  setBtnLoading('connectEmailBtn', '⏳');
  try {
    await _loadPrivyBridge();
    await window.PrivyBridge.connect();
    /* النتيجة تصل عبر حدث privy:update بالأسفل */
  } catch (e) {
    toast('⚠️ ' + (e.message || 'تعذّر فتح نافذة البريد الإلكتروني'), 'err', 5000);
  } finally {
    resetBtn('connectEmailBtn');
  }
}

/* ════ اتصال محفظة خارجية — wallets.js فقط، بلا Privy ════ */
async function _connectExternal(entry) {
  _stopWalletListWatch();
  showLoader('جارٍ الاتصال بـ ' + entry.info.name + '...');
  try {
    const w = await Wallets.connect(entry);
    closeModal('modalLogin');
    await _onWalletConnected(w);
  } catch (e) {
    toast('⚠️ تعذّر الاتصال بالمحفظة: ' + (e.message || '').slice(0, 100), 'err', 5000);
  } finally {
    hideLoader();
  }
}

/* يُستدعى تلقائياً من privy-bridge.js عند كل تغيّر بحالة التوثيق (مسار البريد فقط) */
window.addEventListener('privy:update', function (e) {
  const d = e.detail || {};
  if (!d.authenticated || !d.wallet) return;
  const meta = d.wallet; /* {address, walletClientType:'privy', name, icon} */
  _onWalletConnected({
    address:          meta.address,
    walletClientType: meta.walletClientType,
    walletName:       meta.name,
    walletIcon:       meta.icon,
    signTypedData:    function (domain, types, value) { return window.PrivyBridge.signTypedData(domain, types, value, meta.address); },
    getArbitrumSigner: function () { return window.PrivyBridge.getArbitrumSigner(meta.address); },
  });
});

/* ════════════════════════════════════════════════
   نقطة إنهاء موحّدة — تشتغل بغض النظر عن مصدر المحفظة (Privy بريد،
   أو wallets.js خارجية، أو المسار القديم). كل مصدر يبني كائن
   بنفس الشكل بالضبط: {address, walletClientType, walletName,
   walletIcon, signTypedData(domain,types,value), getArbitrumSigner()}
   — وبهذا باقي التطبيق (account.js, api.js) ما يعرف ولا يهتم من
   أين جاءت المحفظة.
════════════════════════════════════════════════ */
async function _onWalletConnected(walletObj) {
  if (State.wallet && State.wallet.address === walletObj.address) return; /* لا تكرر نفس الجلسة */

  State.wallet = walletObj;
  State.isGuest = false;
  if (walletObj.walletClientType === 'privy') localStorage.setItem(PRIVY_FLAG_KEY, '1');
  else localStorage.setItem(EXTWALLET_FLAG_KEY, JSON.stringify({ address: walletObj.address }));

  updateNavAddressDisplay();
  $('withdrawAddress').value = State.wallet.address;

  closeModal('modalLogin');
  _hideGuestBanner();
  loadQuickState();
  _fetchPricesBackground();

  try {
    await ensureAgent();
  } catch (e) {
    /* فشل approveAgent ما يمنع تسجيل الدخول — بس التداول السريع بلا محفظة وكيل غير متاح لحد ما ينجح */
    toast('⚠️ فشل تفويض محفظة التداول: ' + e.message.slice(0, 100), 'err', 6000);
  }

  _maybePromptRecovery(walletObj);

  await pollAccount();
  autoSetReferrer();
  updateConnectBtn();
  toast('مرحباً 🤝', 'ok');

  if (localStorage.getItem(PIN_KEY) && localStorage.getItem(LOCKED_KEY) === 'true')
    setTimeout(function () { if (State.wallet) lockApp(); }, 300);
}

/* ════════════════════════════════════════════════
   محفظة الوكيل (Agent / API Wallet) — Hyperliquid native.
   تفويض بتوقيع واحد من المحفظة الرئيسية (بريد أو خارجية، ما يفرق)،
   بعدها كل أوامر hlExchange() (فتح/إغلاق/TP/SL/رافعة) توقّع محلياً
   بهذا المفتاح — بلا Privy، بلا wallets.js، بلا نافذة تأكيد لكل
   صفقة. هذا يحافظ على سرعة التداول تماماً متل النظام القديم.

   ✅ صلاحية 30 يوم — بعدها يطلب توقيع جديد ظاهر من المحفظة الرئيسية
   (مرة كل شهر، مو مزعج). حماية إضافية: لو التطبيق تعرّض لاختراق
   (XSS/مكتبة ملوّثة)، أقصى ضرر ممكن هو مفتاح تداول-فقط منتهي خلال
   30 يوم كحد أقصى — لا صلاحية سحب له إطلاقاً مهما طال الوقت.

   ⚠️ السحب (doWithdraw) والتفويض نفسه يبقيان دايماً على المحفظة
   الرئيسية عمداً — Hyperliquid ما يسمح لمحفظة وكيل بالسحب.
════════════════════════════════════════════════ */
const AGENT_TTL_MS = 30 * 24 * 3600 * 1000;

async function ensureAgent() {
  const key  = 'hl_agent_' + State.wallet.address.toLowerCase();
  const meta = JSON.parse(localStorage.getItem(key) || 'null');

  if (meta && (Date.now() - meta.createdAt) < AGENT_TTL_MS) {
    try { State.agent = new ethers.Wallet(meta.pk); return; } catch (e) { /* تالف — أعد التفويض */ }
  }

  showLoader(meta ? 'تجديد تفويض التداول (كل 30 يوم لحمايتك)...' : 'تفويض محفظة التداول (مرة واحدة فقط)...');
  try {
    const agent     = ethers.Wallet.createRandom();
    const nonce     = Date.now();
    const agentName = 'suyula-' + nonce;
    const action = {
      type: 'approveAgent', hyperliquidChain: 'Mainnet', signatureChainId: '0xa4b1',
      agentAddress: agent.address, agentName: agentName, nonce: nonce
    };
    const sig = await State.wallet.signTypedData(
      { name: 'HyperliquidSignTransaction', version: '1', chainId: 42161,
        verifyingContract: '0x0000000000000000000000000000000000000000' },
      { 'HyperliquidTransaction:ApproveAgent': [
          { name: 'hyperliquidChain', type: 'string' },
          { name: 'agentAddress',     type: 'address' },
          { name: 'agentName',        type: 'string' },
          { name: 'nonce',            type: 'uint64' }
      ]},
      { hyperliquidChain: 'Mainnet', agentAddress: agent.address, agentName: agentName, nonce: nonce }
    );
    const sigParts = ethers.Signature.from(sig);
    const res = await fetch(HL_API + '/exchange', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: action, nonce: nonce, signature: { r: sigParts.r, s: sigParts.s, v: sigParts.v } })
    });
    const d = await res.json();
    if (d.status !== 'ok') throw new Error(typeof d.response === 'string' ? d.response : JSON.stringify(d));

    localStorage.setItem(key, JSON.stringify({ pk: agent.privateKey, createdAt: Date.now(), agentAddress: agent.address }));
    State.agent = agent;
  } finally { hideLoader(); }
}

/* فحص دوري خفيف — لو التطبيق ضل مفتوح أسابيع بدون إعادة تحميل، يجدد
   الوكيل تلقائياً (بتوقيع ظاهر واحد) قبل ما ينتهي بمنتصف صفقة */
setInterval(function () { if (State.wallet) ensureAgent().catch(function () {}); }, 6 * 3600000);

/* ════ اقتراح تفعيل استرداد المحفظة — مرة واحدة فقط، لمحفظة البريد ════
   حماية ضد فقدان الجهاز (مسح بيانات المتصفح، تغيير هاتف) — بدونها،
   محفظة embedded تعتمد على "device share" محلي فقط قد يضيع. ════ */
function _maybePromptRecovery(walletObj) {
  if (walletObj.walletClientType !== 'privy') return; /* خارجية — المفتاح أصلاً بمحفظتها هي */
  const flag = 'hl_recovery_prompted_' + walletObj.address.toLowerCase();
  if (localStorage.getItem(flag)) return;
  localStorage.setItem(flag, '1');
  setTimeout(function () { toast('🔐 فعّل استرداد المحفظة لحمايتها من فقدان الجهاز — الخيارات ⚙️', 'info', 8000); }, 2500);
}

/* ════ تصدير المفتاح الخاص / الـ seed phrase ════
   يشتغل فقط لمحفظة embedded (بريد). المحافظ الخارجية (Brave/Trust/
   Rabby) عندها مفتاحها أصلاً بداخلها — تصديرها يتم من المحفظة نفسها. ════ */
async function exportPrivateKey() {
  if (State.isGuest || !State.wallet) return toast('سجّل الدخول أولاً', 'err');
  if (State.wallet.walletClientType !== 'privy')
    return toast('محفظتك خارجية — صدّر المفتاح من داخل تطبيق المحفظة نفسه', 'info', 5000);
  try {
    await _loadPrivyBridge();
    await window.PrivyBridge.exportWallet(State.wallet.address);
  } catch (e) {
    toast('⚠️ تعذّر فتح نافذة التصدير', 'err');
  }
}

/* ════ تفعيل استرداد المحفظة يدوياً (كلمة سر / Google Drive / iCloud) ════
   نفس القيد: لمحفظة البريد (embedded) فقط. ════ */
async function openWalletRecovery() {
  if (State.isGuest || !State.wallet) return toast('سجّل الدخول أولاً', 'err');
  if (State.wallet.walletClientType !== 'privy')
    return toast('هذا خاص بمحفظة البريد — محفظتك الخارجية آمنة عندها هي', 'info', 5000);
  try {
    await _loadPrivyBridge();
    await window.PrivyBridge.setupRecovery();
  } catch (e) {
    toast('⚠️ تعذّر فتح نافذة الاسترداد', 'err');
  }
}

/* ════ جلب الأسعار الأولي ════ */
function _fetchPricesBackground() {
  const uniqueCoins = {};
  Object.keys(ASSETS).forEach(function (sym) {
    if (sym === 'XAU') return;
    const c = ASSETS[sym].coin;
    if (!uniqueCoins[c]) uniqueCoins[c] = sym;
  });
  Object.entries(uniqueCoins).forEach(function (entry) {
    const coinStr = entry[0], sym = entry[1];
    hlInfo({ type: 'l2Book', coin: coinStr })
      .then(function (lb) {
        const bid = parseFloat((lb.levels && lb.levels[0] && lb.levels[0][0] && lb.levels[0][0].px) || 0);
        const ask = parseFloat((lb.levels && lb.levels[1] && lb.levels[1][0] && lb.levels[1][0].px) || 0);
        const mid = (bid && ask) ? (bid + ask) / 2 : 0;
        if (!mid) return;
        if (sym === 'GOLD') {
          State.prices['GOLD'] = { bid: bid, ask: ask, mid: mid };
          _updateTabText('GOLD', mid, ASSETS['GOLD'].pxDp);
          State.prevMid['GOLD'] = mid;
          if (State.asset === 'GOLD') updatePriceUI();
          const gm = mid / TROY;
          State.prices['XAU'] = { bid: bid/TROY, ask: ask/TROY, mid: gm };
          _updateTabText('XAU', gm, ASSETS['XAU'].pxDp);
          State.prevMid['XAU'] = gm;
          if (State.asset === 'XAU') updatePriceUI();
        } else {
          State.prices[sym] = { bid: bid, ask: ask, mid: mid };
          _updateTabText(sym, mid, ASSETS[sym].pxDp);
          State.prevMid[sym] = mid;
          if (sym === State.asset) updatePriceUI();
        }
      })
      .catch(function () {});
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

  const agentKey = State.wallet ? 'hl_agent_' + State.wallet.address.toLowerCase() : null;

  localStorage.removeItem(LS_KEY);
  localStorage.removeItem(PIN_KEY);
  localStorage.removeItem(LOCKED_KEY);
  localStorage.removeItem(LAST_PIN_KEY);
  localStorage.removeItem(QSTATE_KEY);
  localStorage.removeItem(PRIVY_FLAG_KEY);
  localStorage.removeItem(EXTWALLET_FLAG_KEY);
  if (agentKey) localStorage.removeItem(agentKey);

  if (window.PrivyBridge) { try { window.PrivyBridge.logout(); } catch (e) {} }

  State.wallet     = null;
  State.agent      = null;
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

  startMainWs();
  State.timers.push(setInterval(pollPrices, 3000));
  startSessionPolling();
}

/* ════ Guest Banner ════ */
function _showGuestBanner() {
  let b = $('guestBanner');
  if (!b) {
    b = document.createElement('div');
    b.id = 'guestBanner';
    b.className = 'guest-banner';
    b.innerHTML = '<span class="gb-msg">🔒 اربط محفظتك لبدء التداول وعرض صفقاتك المفتوحة</span><button class="gb-btn" onclick="connectWallet()">اتصال ←</button>';
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
  const b = $('guestBanner');
  if (b) b.classList.add('hidden');
}

/* ════ فتح نافذة الدخول — نفس connectWallet() ════ */
function openLoginModal() { connectWallet(); }

/* ════════════════════════════════════════════════
   updateConnectBtn
   اللون  ← Hyperliquid WS (أخضر/أصفر/أحمر) — بدون تغيير
   النص   ← هوية المحفظة الفعلية: "بريد" لمحفظة Privy embedded،
            أو اسم المحفظة الخارجية الحقيقي (Brave Wallet/Trust Wallet/...)
            كما تُبلّغه هي نفسها.
════════════════════════════════════════════════ */
function updateConnectBtn() {
  const btn = $('btnConnect');
  if (!btn) return;

  const hasWallet = !!State.wallet;

  if (State.wsConnected) {
    btn.className = 'footer-connect-btn ws-connected';
  } else {
    const wasEver = btn.dataset.everConnected === '1';
    btn.className = wasEver
      ? 'footer-connect-btn ws-disconnected'
      : 'footer-connect-btn ws-connecting';
  }
  if (State.wsConnected) btn.dataset.everConnected = '1';

  let lbl = 'اتصال';
  if (hasWallet) {
    lbl = State.wallet.walletClientType === 'privy'
      ? '📧 بريد'
      : (State.wallet.walletName || 'متصل');
  }
  btn.innerHTML = '<span class="cb-dot"></span><span class="cb-lbl">' + lbl + '</span>';
}

/* ════ اسم العرض المخصص — بدون تغيير ════ */
function updateNavAddressDisplay() {
  if (!State.wallet) return;
  const custom = (localStorage.getItem(DISPNAME_KEY) || '').trim();
  const fallback = State.wallet.address.slice(0,6) + '...' + State.wallet.address.slice(-4);
  setTxt('navAddress', custom || fallback);
}

function openDisplayNameModal() {
  if (!State.wallet) return toast('يجب تسجيل الدخول أولاً', 'err');
  const input = $('displayNameInput');
  if (input) input.value = localStorage.getItem(DISPNAME_KEY) || '';
  openModal('modalDisplayName');
  setTimeout(function () { if (input) input.focus(); }, 200);
}

function saveDisplayName() {
  const input = $('displayNameInput');
  const name  = ((input && input.value) || '').trim().slice(0, 20);
  if (name) { localStorage.setItem(DISPNAME_KEY, name); toast('✅ الاسم: ' + name, 'ok'); }
  else       { localStorage.removeItem(DISPNAME_KEY);   toast('تمت إزالة الاسم المخصص', 'info'); }
  updateNavAddressDisplay();
  closeModal('modalDisplayName');
}

/* ════════════════════════════════════════════════
   مسار احتياطي/انتقالي: دخول بمفتاح خاص يدوي (النظام القديم)
   غير موصول بأي زر افتراضياً بعد التحديث. لو احتجته مؤقتاً:
     $('loginBtn').onclick = loginWithRawKey;
   بـ app.js. احذف هذي الدالة كلياً بعد ما تتأكد إن الهجرة تمّت بأمان.
════════════════════════════════════════════════ */
async function loginWithRawKey() {
  let key = $('privateKey').value.trim();
  if (!key) return toast('أدخل المفتاح الخاص', 'err');
  key = key.startsWith('0x') ? key : '0x' + key;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) return toast('المفتاح 64 حرف هكساديسيمال', 'err');

  setBtnLoading('loginBtn', '⏳');
  try {
    const rawWallet = new ethers.Wallet(key);
    await _onWalletConnected({
      address: rawWallet.address,
      walletClientType: 'raw-key',
      walletName: 'مفتاح محلي',
      signTypedData: function (domain, types, value) { return rawWallet.signTypedData(domain, types, value); },
      getArbitrumSigner: async function () { return rawWallet.connect(new ethers.JsonRpcProvider(ARB_RPC)); },
    });
    localStorage.setItem(LS_KEY, key);
  } catch (e) {
    State.wallet  = null;
    State.isGuest = true;
    updateConnectBtn();
    toast('خطأ: ' + e.message.slice(0, 80), 'err');
  } finally { resetBtn('loginBtn'); }
}
