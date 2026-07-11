/* ═══════════════════════════════════════════════════════════════
   wallets.js — اتصال مباشر بمحفظة Web3 خارجية (Brave / Trust /
   Rabby / MetaMask / أي محفظة تحقن نفسها بالصفحة الحالية).

   منفصل بالكامل عن Privy — بلا WalletConnect، بلا سجل خارجي، بلا
   سيرفر، صفر استهلاك من حصة Privy الشهرية المجانية (تلك محجوزة
   لمستخدمي البريد الإلكتروني حصرياً — راجع privy-bridge.js).

   ⚠️ حد مهم يستاهل تفهمه بدقة: هذا يكتشف فقط محفظة *محقونة بنفس
   السياق الحالي* لصفحتك — يعني إما:
   (أ) إضافة متصفح بالديسكتوب (MetaMask/Rabby/Brave)، أو
   (ب) المستخدم فاتح موقعك من داخل متصفح محفظته هي بالذات
       (بالضبط متل Trust Wallet).
   ما يقدر يتصل بمحفظة منفصلة تماماً وانت فاتح Chrome عادي بدون
   علاقة بها — هذا يحتاج WalletConnect تحديداً (بروتوكول مختلف
   كلياً، تعمّدنا عدم استخدامه هنا).
═══════════════════════════════════════════════════════════════ */
'use strict';

const Wallets = (function () {
  const _providers = new Map(); // rdns/uuid → { info, provider }
  let _onNewProvider = null;    // callback حي أثناء فتح نافذة الاتصال

  /* ── EIP-6963: المعيار الحديث، يدعم اكتشاف عدة محافظ بنفس الوقت.
     نسجّل المستمع فوراً عند تحميل الملف — بعض المحافظ تعلن نفسها
     مرة وحدة فقط عند تحميل الصفحة، لازم نكون جاهزين قبل ما تصل. ── */
  window.addEventListener('eip6963:announceProvider', function (e) {
    const detail = e.detail || {};
    if (!detail.info || !detail.provider) return;
    const key = detail.info.rdns || detail.info.uuid;
    const isNew = !_providers.has(key);
    _providers.set(key, { info: detail.info, provider: detail.provider });
    if (isNew && typeof _onNewProvider === 'function') _onNewProvider();
  });

  function _requestAnnouncements() {
    window.dispatchEvent(new Event('eip6963:requestProvider'));
  }
  _requestAnnouncements();

  /* ── دعم قديم — محفظة وحيدة تحقن window.ethereum مباشرة، شائع
     بمتصفحات المحافظ بالموبايل (Trust/Coinbase/...) اللي لسا ما
     طبّقت EIP-6963 بالكامل ── */
  function _legacyEntry() {
    const eth = window.ethereum;
    if (!eth) return null;
    const name = eth.isTrust ? 'Trust Wallet'
      : eth.isBraveWallet ? 'Brave Wallet'
      : eth.isRabby ? 'Rabby'
      : eth.isMetaMask ? 'MetaMask'
      : eth.isCoinbaseWallet ? 'Coinbase Wallet'
      : 'محفظة المتصفح';
    return { info: { name: name, rdns: 'legacy:' + name, icon: null }, provider: eth };
  }

  /* قائمة المحافظ المكتشَفة الآن. استدعِها فور فتح نافذة الاتصال
     (وليس عند تحميل الصفحة فقط) لأن بعض المحافظ تعلن نفسها متأخر شوي. */
  function list() {
    _requestAnnouncements();
    const out = Array.from(_providers.values());
    const legacy = _legacyEntry();
    if (legacy && !out.some(function (p) { return p.provider === legacy.provider; })) out.push(legacy);
    return out;
  }

  /* يسجّل دالة تُستدعى تلقائياً لو محفظة جديدة أعلنت نفسها متأخرة —
     استخدمها لتحديث القائمة حيّاً وقت ما نافذة الاتصال مفتوحة. مرّر
     null لإيقاف الاستماع (نافذة الاتصال أُغلقت). */
  function onListChanged(cb) { _onNewProvider = cb; }

  /* مهلة أمان — لو محفظة تعلّقت (extension معطوبة، أو نافذة موافقة
     ما ظهرت أبداً)، ما نخلّي المستخدم عالق بشاشة تحميل للأبد */
  function _withTimeout(promise, ms, msg) {
    return Promise.race([
      promise,
      new Promise(function (_, reject) { setTimeout(function () { reject(new Error(msg)); }, ms); })
    ]);
  }

  /* ── الاتصال الفعلي + بناء واجهة موحّدة (نفس شكل State.wallet
     سواء المصدر Privy أو مفتاح خام قديم) — بهذا auth.js/account.js
     ما يحتاجون أي معرفة خاصة بمصدر المحفظة ── */
  async function connect(entry) {
    const provider = entry.provider;
    await _withTimeout(
      provider.request({ method: 'eth_requestAccounts' }),
      30000,
      'انتهت المهلة — تحقق من نافذة الموافقة داخل ' + entry.info.name
    );

    const bp     = new window.ethers.BrowserProvider(provider);
    const signer = await bp.getSigner();
    const address = await signer.getAddress();

    return {
      address: address,
      walletClientType: entry.info.rdns || 'injected',
      walletName: entry.info.name,
      walletIcon: entry.info.icon,

      /* يطابق ethers.Wallet.signTypedData(domain, types, value) تماماً */
      signTypedData: function (domain, types, value) { return signer.signTypedData(domain, types, value); },

      /* Signer متصل بـArbitrum لعقود USDC/الجسر — يبدّل الشبكة تلقائياً،
         يضيفها لو غير موجودة أصلاً بالمحفظة */
      getArbitrumSigner: async function () {
        try {
          await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xa4b1' }] });
        } catch (switchErr) {
          if (switchErr && switchErr.code === 4902) {
            await provider.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0xa4b1', chainName: 'Arbitrum One',
                rpcUrls: [ARB_RPC],
                nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
                blockExplorerUrls: ['https://arbiscan.io']
              }]
            });
          } else { throw switchErr; }
        }
        return new window.ethers.BrowserProvider(provider).getSigner();
      },
    };
  }

  /* محاولة اتصال صامتة (بلا نافذة موافقة) — تُستخدم عند إقلاع التطبيق
     لاسترجاع جلسة سابقة، فقط إذا كانت المحفظة أصلاً صرّحت للموقع من
     قبل. eth_accounts (بعكس eth_requestAccounts) لا يفتح أي نافذة —
     يرجّع مصفوفة فاضية بصمت لو ما في تصريح سابق. */
  async function reconnectSilently(rdns) {
    const entries = list();
    const target = rdns ? entries.find(function (e) { return (e.info.rdns || e.info.uuid) === rdns; }) : entries[0];
    if (!target) return null;
    try {
      const accounts = await target.provider.request({ method: 'eth_accounts' });
      if (!accounts || !accounts.length) return null;
      return connect(target);
    } catch (e) { return null; }
  }

  return { list: list, connect: connect, onListChanged: onListChanged, reconnectSilently: reconnectSilently };
})();

window.Wallets = Wallets;
