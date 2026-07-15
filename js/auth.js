/* ═══════════════════════════════════════
   auth.js — دخول وخروج + وضع الزائر
   ✅ تغييرات: initAccountFeeds بدل pollAccount، حذف
      _fetchPricesBackground (initPriceFeeds يغطيها من app.js عند الإقلاع)،
      teardownAccountFeeds بدل wsMainClose عند الخروج (الأسعار لا تتوقف)
═══════════════════════════════════════ */
'use strict';

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

function initGuestMode() {
  State.isGuest = true;
  $('loginScreen')?.classList.add('hidden');
  $('appScreen')?.classList.remove('hidden');
  _showGuestBanner();
  switchAsset('CL');
  startSessionPolling();
  updateConnectBtn();
}

function connectWallet() {
  if (!State.isGuest) return openOptions();
  _renderExtWalletList();
  if (typeof Wallets !== 'undefined') Wallets.onListChanged(_renderExtWalletList);
  openModal('modalLogin');
}

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

async function connectEmail() {
  setBtnLoading('connectEmailBtn', '⏳');
  try {
    await _loadPrivyBridge();
    await window.PrivyBridge.connect();
  } catch (e) {
    toast('⚠️ ' + (e.message || 'تعذّر فتح نافذة البريد الإلكتروني'), 'err', 5000);
  } finally {
    resetBtn('connectEmailBtn');
  }
}

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

window.addEventListener('privy:update', function (e) {
  const d = e.detail || {};
  if (!d.authenticated || !d.wallet) return;
  const meta = d.wallet;
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
   نقطة إنهاء موحّدة — تُستدعى من أي مسار اتصال (بريد/محفظة خارجية/
   استرجاع جلسة عند الإقلاع). initAccountFeeds() تفعل كل شيء الآن:
   لقطة أولية + اشتراكات حية — بديل pollAccount + polling القديم بالكامل.
════════════════════════════════════════════════ */
async function _onWalletConnected(walletObj) {
  if (State.wallet && State.wallet.address === walletObj.address) return;

  State.wallet = walletObj;
  State.isGuest = false;
  if (walletObj.walletClientType === 'privy') localStorage.setItem(PRIVY_FLAG_KEY, '1');
  else localStorage.setItem(EXTWALLET_FLAG_KEY, JSON.stringify({ address: walletObj.address }));

  updateNavAddressDisplay();
  $('withdrawAddress').value = State.wallet.address;

  closeModal('modalLogin');
  _hideGuestBanner();
  loadQuickState();

  try {
    await ensureAgent();
  } catch (e) {
    if (e.message === 'CANCELLED') {
      toast('تم تخطي تفويض التداول السريع — تقدر تفعّله لاحقاً من الخيارات', 'info', 5000);
    } else {
      toast('⚠️ فشل تفويض محفظة التداول: ' + e.message.slice(0, 100), 'err', 6000);
    }
  }

  _maybePromptRecovery(walletObj);

  await initAccountFeeds();
  updateConnectBtn();
  toast('مرحباً 🤝', 'ok');

  if (localStorage.getItem(PIN_KEY) && localStorage.getItem(LOCKED_KEY) === 'true')
    setTimeout(function () { if (State.wallet) lockApp(); }, 300);
}

/* ════════════════════════════════════════════════
   محفظة الوكيل (Agent Wallet) — بدون تغيير وظيفي
════════════════════════════════════════════════ */
const AGENT_TTL_MS = 30 * 24 * 3600 * 1000;

function _showAgentApprovalModal(agentAddress) {
  return new Promise(function (resolve, reject) {
    setTxt('agentAddrPreview', agentAddress);
    openModal('modalAgentApproval');
    $('agentApprovalConfirm').onclick = function () { closeModal('modalAgentApproval'); resolve(); };
    $('agentApprovalCancel').onclick  = function () { closeModal('modalAgentApproval'); reject(new Error('CANCELLED')); };
  });
}

async function ensureAgent() {
  const key  = 'hl_agent_' + State.wallet.address.toLowerCase();
  const meta = JSON.parse(localStorage.getItem(key) || 'null');

  if (meta && (Date.now() - meta.createdAt) < AGENT_TTL_MS) {
    try { State.agent = new ethers.Wallet(meta.pk); return; } catch (e) {}
  }

  const agent = ethers.Wallet.createRandom();
  await _showAgentApprovalModal(agent.address);

  showLoader('بانتظار توقيعك...');
  try {
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
    const body = { action: action, nonce: nonce, signature: { r: sigParts.r, s: sigParts.s, v: sigParts.v } };
    const d = HL.isOpen() ? await HL.post(body, true).catch(() => _restExchange(body)) : await _restExchange(body);
    if (d.status !== 'ok') throw new Error(typeof d.response === 'string' ? d.response : JSON.stringify(d));

    localStorage.setItem(key, JSON.stringify({ pk: agent.privateKey, createdAt: Date.now(), agentAddress: agent.address }));
    State.agent = agent;
  } finally { hideLoader(); }
}

setInterval(function () { if (State.wallet) ensureAgent().catch(function () {}); }, 6 * 3600000);

function _maybePromptRecovery(walletObj) {
  if (walletObj.walletClientType !== 'privy') return;
  const flag = 'hl_recovery_prompted_' + walletObj.address.toLowerCase();
  if (localStorage.getItem(flag)) return;
  localStorage.setItem(flag, '1');
  setTimeout(function () { toast('🔐 فعّل استرداد المحفظة لحمايتها من فقدان الجهاز — الخيارات ⚙️', 'info', 8000); }, 2500);
}

async function enableFastTrading() {
  if (State.isGuest || !State.wallet) return toast('سجّل الدخول أولاً', 'err');
  if (State.agent) return toast('التداول السريع مفعّل أصلاً ✅', 'info');
  try {
    await ensureAgent();
    if (State.agent) toast('✅ تم تفعيل التداول السريع', 'ok');
  } catch (e) {
    if (e.message !== 'CANCELLED') toast('⚠️ ' + e.message.slice(0, 100), 'err');
  }
}

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

/* ════ تسجيل الخروج — الأسعار تبقى حيّة، فقط اشتراكات الحساب تُفكّك ════ */
function doLogout() {
  State.timers.forEach(clearInterval);
  clearInterval(State.priceTimer);
  clearInterval(State._balTimer);
  clearInterval(State._clockTimer);
  clearInterval(State._sessionTimer);
  teardownAccountFeeds();

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
  State.fillsCache = [];
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
  startSessionPolling();
}

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

function openLoginModal() { connectWallet(); }

function updateConnectBtn() {
  const btn = $('btnConnect');
  if (!btn) return;
  const hasWallet = !!State.wallet;
  if (State.wsConnected) {
    btn.className = 'footer-connect-btn ws-connected';
  } else {
    const wasEver = btn.dataset.everConnected === '1';
    btn.className = wasEver ? 'footer-connect-btn ws-disconnected' : 'footer-connect-btn ws-connecting';
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
