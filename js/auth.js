/* ═══════════════════════════════════════
   auth.js — دخول وخروج + وضع الزائر
   ✅ الدخول الأساسي: Privy (بريد OTP أولاً، محفظة خارجية ثانوياً)
   ✅ محفظة الوكيل (Agent Wallet): تفويض مرة واحدة، توقيع محلي بلا
      نوافذ تأكيد لكل صفقة بعدها — راجع ensureAgent()
   ✅ الموقع يعمل بدون محفظة (وضع زائر)
   ✅ loginWithRawKey() القديم موجود كمسار احتياطي/انتقالي فقط —
      غير موصول بأي زر افتراضياً، وصله يدوياً بـ app.js إذا احتجته
   ✅ زر الاتصال: لون حسب Hyperliquid WS، نص حسب هوية المحفظة الفعلية
═══════════════════════════════════════ */
'use strict';

/* ════════════════════════════════════════════════
   تحميل كسول لـ privy-bridge.js (~1.4MB gzip)
   يُحمَّل فقط عند الحاجة الفعلية: أول اتصال، أو عند استرجاع
   جلسة Privy سابقة عند الإقلاع — أبداً لوضع الزائر البارد.
════════════════════════════════════════════════ */
let _privyLoadPromise = null;
function _loadPrivyBridge() {
  if (window.PrivyBridge) return Promise.resolve();
  if (_privyLoadPromise) return _privyLoadPromise;

  _privyLoadPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/js/privy-bridge.js';
    s.onerror = () => { _privyLoadPromise = null; reject(new Error('تعذّر تحميل وحدة الاتصال')); };
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

/* ════ إنشاء محفظة جديدة محلياً (مسار قديم — راجع الشرح أعلاه) ════ */
function createNewWallet() {
  const wallet = ethers.Wallet.createRandom();
  const key    = wallet.privateKey;
  const input  = $('privateKey');
  if (input) { input.value = key; input.type = 'text'; }
  navigator.clipboard?.writeText(key).catch(() => {});
  alert(`✅ تم إنشاء محفظة جديدة!\n\nالمفتاح الخاص:\n${key}\n\n⚠️ احفظه الآن في مكان آمن!`);
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
   الدخول عبر Privy — هذا هو المسار الافتراضي الوحيد الآن.
   يفتح مودال Privy الرسمي مباشرة: بريد + OTP أولاً، ثم قائمة
   محافظ خارجية (Brave/Trust/Rabby/...) عبر EIP-6963 تلقائياً.
   لا يوجد نموذج مخصص من طرفنا — Privy يتكفّل بكل الواجهة.
════════════════════════════════════════════════ */
async function connectWallet() {
  if (!State.isGuest) return openOptions();
  setBtnLoading('btnConnect', '⏳');
  try {
    await _loadPrivyBridge();
    await window.PrivyBridge.connect();
    /* النتيجة الفعلية تصل عبر حدث privy:update — راجع _onPrivyUpdate بالأسفل.
       لو المستخدم أغلق المودال بدون تسجيل، ما راح يوصل أي حدث — طبيعي. */
  } catch (e) {
    toast('⚠️ ' + (e.message || 'تعذّر فتح نافذة الاتصال'), 'err', 5000);
  } finally {
    resetBtn('btnConnect');
  }
}

/* يُستدعى تلقائياً من privy-bridge.js عند كل تغيّر بحالة التوثيق */
window.addEventListener('privy:update', e => _onPrivyUpdate(e.detail || {}));

async function _onPrivyUpdate(detail) {
  if (!detail.authenticated || !detail.wallet) return;
  if (State.wallet?.address === detail.wallet.address) return; /* لا تكرر نفس الجلسة */

  const meta = detail.wallet; /* {address, walletClientType, name, icon} */

  State.wallet = {
    address:          meta.address,
    walletClientType: meta.walletClientType,   /* 'privy' = بريد/embedded، غير ذلك = محفظة خارجية */
    walletName:       meta.name,               /* "Brave Wallet" / "Trust Wallet" / ... من EIP-6963 */
    walletIcon:       meta.icon,
    /* شكل موحّد يطابق ethers.Wallet.signTypedData(domain, types, value) —
       بهذا الشكل account.js (doWithdraw) ما يحتاج يتغيّر إطلاقاً */
    signTypedData: (domain, types, value) =>
      window.PrivyBridge.signTypedData(domain, types, value, meta.address),
  };
  State.isGuest = false;
  localStorage.setItem(PRIVY_FLAG_KEY, '1');

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

  _maybePromptRecovery(meta);

  await pollAccount();
  autoSetReferrer();
  updateConnectBtn();
  toast('مرحباً 🤝', 'ok');

  if (localStorage.getItem(PIN_KEY) && localStorage.getItem(LOCKED_KEY) === 'true')
    setTimeout(() => { if (State.wallet) lockApp(); }, 300);
}

/* ════════════════════════════════════════════════
   محفظة الوكيل (Agent / API Wallet) — Hyperliquid native.
   تفويض بتوقيع واحد من المحفظة الرئيسية (Privy)، بعدها كل أوامر
   hlExchange() (فتح/إغلاق/TP/SL/رافعة) توقّع محلياً بهذا المفتاح —
   بلا Privy، بلا نافذة تأكيد لكل صفقة. هذا يحافظ على سرعة التداول
   تماماً متل النظام القديم، حتى مع محفظة خارجية (Brave/Trust/Rabby)
   اللي ما تقدر Privy تسكت نافذة تأكيدها.

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
    try { State.agent = new ethers.Wallet(meta.pk); return; } catch { /* تالف — أعد التفويض */ }
  }

  showLoader(meta ? 'تجديد تفويض التداول (كل 30 يوم لحمايتك)...' : 'تفويض محفظة التداول (مرة واحدة فقط)...');
  try {
    const agent     = ethers.Wallet.createRandom();
    const nonce     = Date.now();
    const agentName = 'suyula-' + nonce;
    const action = {
      type: 'approveAgent', hyperliquidChain: 'Mainnet', signatureChainId: '0xa4b1',
      agentAddress: agent.address, agentName, nonce
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
      { hyperliquidChain: 'Mainnet', agentAddress: agent.address, agentName, nonce }
    );
    const { r, s, v } = ethers.Signature.from(sig);
    const res = await fetch(HL_API + '/exchange', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, nonce, signature: { r, s, v } })
    });
    const d = await res.json();
    if (d.status !== 'ok') throw new Error(typeof d.response === 'string' ? d.response : JSON.stringify(d));

    localStorage.setItem(key, JSON.stringify({ pk: agent.privateKey, createdAt: Date.now(), agentAddress: agent.address }));
    State.agent = agent;
  } finally { hideLoader(); }
}

/* فحص دوري خفيف — لو التطبيق ضل مفتوح أسابيع بدون إعادة تحميل، يجدد
   الوكيل تلقائياً (بتوقيع ظاهر واحد) قبل ما ينتهي بمنتصف صفقة */
setInterval(() => { if (State.wallet) ensureAgent().catch(() => {}); }, 6 * 3600_000);

/* ════ اقتراح تفعيل استرداد المحفظة — مرة واحدة فقط، لمحفظة البريد ════
   حماية ضد فقدان الجهاز (مسح بيانات المتصفح، تغيير هاتف) — بدونها،
   محفظة embedded تعتمد على "device share" محلي فقط قد يضيع. ════ */
function _maybePromptRecovery(meta) {
  if (meta.walletClientType !== 'privy') return; /* خارجية — المفتاح أصلاً بمحفظتها هي */
  const flag = 'hl_recovery_prompted_' + meta.address.toLowerCase();
  if (localStorage.getItem(flag)) return;
  localStorage.setItem(flag, '1');
  setTimeout(() => toast('🔐 فعّل استرداد المحفظة لحمايتها من فقدان الجهاز — الخيارات ⚙️', 'info', 8000), 2500);
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
          _updateTabText('GOLD', mid, ASSETS['GOLD'].pxDp);
          State.prevMid['GOLD'] = mid;
          if (State.asset === 'GOLD') updatePriceUI();
          const gm = mid / TROY;
          State.prices['XAU'] = { bid: bid/TROY, ask: ask/TROY, mid: gm };
          _updateTabText('XAU', gm, ASSETS['XAU'].pxDp);
          State.prevMid['XAU'] = gm;
          if (State.asset === 'XAU') updatePriceUI();
        } else {
          State.prices[sym] = { bid, ask, mid };
          _updateTabText(sym, mid, ASSETS[sym].pxDp);
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

  const agentKey = State.wallet ? 'hl_agent_' + State.wallet.address.toLowerCase() : null;

  localStorage.removeItem(LS_KEY);
  localStorage.removeItem(PIN_KEY);
  localStorage.removeItem(LOCKED_KEY);
  localStorage.removeItem(LAST_PIN_KEY);
  localStorage.removeItem(QSTATE_KEY);
  localStorage.removeItem(PRIVY_FLAG_KEY);
  if (agentKey) localStorage.removeItem(agentKey);

  if (window.PrivyBridge) { try { window.PrivyBridge.logout(); } catch {} }

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
    b.innerHTML = `
      <span class="gb-msg">🔒 اربط محفظتك لبدء التداول وعرض صفقاتك المفتوحة</span>
      <button class="gb-btn" onclick="connectWallet()">اتصال ←</button>`;
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

/* ════ فتح نافذة الدخول — الآن يعني: افتح مودال Privy مباشرة ════ */
function openLoginModal() { connectWallet(); }

/* ════════════════════════════════════════════════
   updateConnectBtn
   اللون  ← Hyperliquid WS (أخضر/أصفر/أحمر) — بدون تغيير
   النص   ← هوية المحفظة الفعلية: "بريد" لمحفظة Privy embedded،
            أو اسم المحفظة الخارجية الحقيقي (Brave Wallet/Trust Wallet/...)
            كما تُبلّغه هي نفسها عبر EIP-6963.
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
  btn.innerHTML = `<span class="cb-dot"></span><span class="cb-lbl">${lbl}</span>`;
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
  setTimeout(() => input?.focus(), 200);
}

function saveDisplayName() {
  const input = $('displayNameInput');
  const name  = (input?.value || '').trim().slice(0, 20);
  if (name) { localStorage.setItem(DISPNAME_KEY, name); toast(`✅ الاسم: ${name}`, 'ok'); }
  else       { localStorage.removeItem(DISPNAME_KEY);   toast('تمت إزالة الاسم المخصص', 'info'); }
  updateNavAddressDisplay();
  closeModal('modalDisplayName');
}

/* ════════════════════════════════════════════════
   مسار احتياطي/انتقالي: دخول بمفتاح خاص يدوي (النظام القديم)
   غير موصول بأي زر افتراضياً بعد التحديث. لو احتجته مؤقتاً
   (مثلاً لاستيراد محفظتك الحالية قبل نقلها إلى Rabby/Brave):
     $('loginBtn').onclick = loginWithRawKey;
   بـ app.js، واستخدم #modalLogin زي ما هو.
   احذف هذي الدالة كلياً بعد ما تتأكد إن الهجرة تمّت بأمان.
════════════════════════════════════════════════ */
async function loginWithRawKey() {
  let key = $('privateKey').value.trim();
  if (!key) return toast('أدخل المفتاح الخاص', 'err');
  key = key.startsWith('0x') ? key : '0x' + key;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) return toast('المفتاح 64 حرف هكساديسيمال', 'err');

  setBtnLoading('loginBtn', '⏳');
  try {
    const rawWallet = new ethers.Wallet(key);
    State.wallet = {
      address: rawWallet.address,
      walletClientType: 'raw-key',
      walletName: 'مفتاح محلي',
      signTypedData: (domain, types, value) => rawWallet.signTypedData(domain, types, value),
      _raw: rawWallet, /* يُستخدم فقط من doDeposit() لبناء signer متصل بـ Arbitrum لهذا المسار القديم */
    };
    State.isGuest = false;
    localStorage.setItem(LS_KEY, key);

    updateNavAddressDisplay();
    $('withdrawAddress').value = State.wallet.address;

    closeModal('modalLogin');
    _hideGuestBanner();
    loadQuickState();
    _fetchPricesBackground();
    try { await ensureAgent(); } catch (e) { toast('⚠️ فشل تفويض محفظة التداول', 'err'); }
    await pollAccount();
    autoSetReferrer();
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
