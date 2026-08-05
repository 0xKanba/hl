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

   ✅ مراقبة accountsChanged/قطع الصلاحية من نفس المزوّد بعد الاتصال —
      لو بدّل المستخدم الحساب النشط من داخل تطبيق محفظته، أو قطع
      صلاحية الموقع بالكامل، التطبيق يعرف فوراً بدل الاستمرار بعنوان
      قديم غير مطابق لما يوقّعه الـsigner الفعلي.

   ✅ FIX — استرجاع الجلسة عند إعادة تحميل الصفحة (reconnectSilently)
      كان يفشل أحياناً بلا سبب ظاهري ويُسقِط المستخدم لوضع الزائر رغم
      أن محفظته مصرَّحة أصلاً: بعض إضافات المحافظ (خصوصاً متصفحات
      Trust/Rabby بالموبايل) تُعلن نفسها عبر EIP-6963 بعد
      DOMContentLoaded بقليل، لا معه فوراً. فحص list() الفوري الوحيد
      سابقاً كان أحياناً يمر قبل وصول الإعلان فيرجع فارغاً. الحل: انتظار
      قصير (حتى ~1.2 ثانية، بفحص كل 100ms) بدل فحص واحد فوري — يتوقف
      بمجرد وصول الإعلان فلا تأثير محسوس على السرعة الفعلية، ويحمي فقط
      من هذا السباق الزمني النادر لكنه حقيقي.

   ✅ FIX جوهري — التوقيع يفشل على شبكة غير Arbitrum (Trust Wallet
      تحديداً، MetaMask بدرجة أقل): الاتصال نفسه (eth_requestAccounts)
      لا يهتم بالشبكة الحالية إطلاقاً، لهذا ينجح دائماً بأي EVM. لكن كل
      توقيعات EIP-712 بهذا المشروع (تفويض الوكيل، السحب) تحمل
      domain.chainId=42161 (Arbitrum) صراحة — نفس ما تتحقق منه عقود
      Hyperliquid لاحقاً. المفتاح نفسه لا يفرّق بين الشبكات، لكن
      برمجيات بعض المحافظ (Trust Wallet أبرزها) تقارن الـchainId
      المطلوب بالشبكة المفعّلة فعلياً بالمحفظة وترفض توقيع
      eth_signTypedData_v4 لو ما تطابقا — حماية مقصودة ضد إعادة
      استخدام توقيع بشبكة خاطئة. getArbitrumSigner (المستخدمة للإيداع
      فقط) كانت الوحيدة اللي تطلب التبديل التلقائي؛ signTypedData
      (المستخدمة لتفويض الوكيل وللسحب) كانت تُرسِل مباشرة بلا أي فحص
      شبكة. الحل: _ensureArbitrum() دالة مشتركة تفحص eth_chainId أولاً
      (فلا طلب تبديل زائد لمن هو أصلاً على Arbitrum)، وتُستدعى الآن قبل
      أي توقيع أيضاً — لا فقط قبل الإيداع. النتيجة: اتصال بأي شبكة EVM
      بلا احتكاك، وأول توقيع فعلي يطلب من المحفظة تبديل/إضافة Arbitrum
      تلقائياً (موافقة واحدة)، ثم نافذة التوقيع العادية فوراً.
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
    /* ✅ استبعاد التكرار بمرجع provider نفسه، وأيضاً بالاسم احتياطياً —
       بعض المحافظ تُنشئ غلاف (proxy) مختلف الشكل لـwindow.ethereum عن
       الغلاف المُعلَن عبر EIP-6963 لنفس المحفظة الفعلية، فمقارنة المرجع
       فقط قد تفشل باكتشاف التكرار وتُظهر نفس المحفظة مرتين بالقائمة. */
    if (legacy && !out.some(function (p) {
      return p.provider === legacy.provider ||
             (p.info.name || '').toLowerCase() === legacy.info.name.toLowerCase();
    })) out.push(legacy);
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

  /* ════════════════════════════════════════════════
     ✅ جديد — يضمن أن المحفظة على شبكة Arbitrum One قبل أي طلب توقيع
     أو تحويل يحتاجها. يفحص eth_chainId أولاً (بلا أي نافذة منبثقة) —
     لو مطابق أصلاً لا شيء يحدث. غير ذلك: wallet_switchEthereumChain،
     وwallet_addEthereumChain كبديل احتياطي لو Arbitrum غير مُضافة بعد
     بالمحفظة (رمز خطأ 4902 القياسي). مشتركة بين getArbitrumSigner
     (الإيداع) وsignTypedData (تفويض الوكيل + السحب) — راجع تعليق رأس
     الملف لسبب هذا التوحيد.
  ════════════════════════════════════════════════ */
  async function _ensureArbitrum(provider) {
    try {
      const current = await provider.request({ method: 'eth_chainId' });
      if (typeof current === 'string' && current.toLowerCase() === '0xa4b1') return; // أصلاً على Arbitrum
    } catch { /* بعض المزوّدين لا يدعمون eth_chainId بلا حسابات متصلة — نتابع لمحاولة التبديل مباشرة */ }

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

    /* ✅ مراقبة تغيّر الحساب/قطع الصلاحية من نفس المزوّد بعد الاتصال.
       eth_accounts (بعكس eth_requestAccounts) لا يفتح أي نافذة، لذا هذه
       المراقبة سلبية بالكامل ولا تُقاطع المستخدم؛ فقط تُعلم auth.js
       بحدث حقيقي ليتصرّف (إعادة اتصال نظيفة بدل الاستمرار بعنوان غير
       مطابق لما يوقّعه المستخدم فعلياً في محفظته). */
    const _onAccountsChanged = function (accounts) {
      const next = accounts && accounts[0];
      if (!next) {
        window.dispatchEvent(new CustomEvent('wallet:externalDisconnect', { detail: { address } }));
      } else if (next.toLowerCase() !== address.toLowerCase()) {
        window.dispatchEvent(new CustomEvent('wallet:accountChanged', { detail: { oldAddress: address, newAddress: next } }));
      }
    };
    try { provider.on?.('accountsChanged', _onAccountsChanged); } catch {}

    return {
      address: address,
      walletClientType: entry.info.rdns || 'injected',
      walletName: entry.info.name,
      walletIcon: entry.info.icon,

      /* ✅ FIX — يضمن Arbitrum أولاً (بصمت لو مطابق أصلاً) قبل أي
         eth_signTypedData_v4. يطابق حرفياً ethers.Wallet.signTypedData
         (domain, types, value) — راجع تعليق رأس الملف. */
      signTypedData: async function (domain, types, value) {
        await _ensureArbitrum(provider);
        return signer.signTypedData(domain, types, value);
      },

      /* Signer متصل بـArbitrum لعقود USDC/الجسر — يبدّل الشبكة تلقائياً،
         يضيفها لو غير موجودة أصلاً بالمحفظة (نفس _ensureArbitrum
         المشتركة أعلاه الآن، بدل نسخة مكرَّرة محلياً هنا). */
      getArbitrumSigner: async function () {
        await _ensureArbitrum(provider);
        return new window.ethers.BrowserProvider(provider).getSigner();
      },

      /* ✅ يُستدعى من doLogout لفكّ المراقبة أعلاه — بدونه يبقى الاستماع
         معلَّقاً على provider القديم للأبد (تسريب ذاكرة + احتمال إطلاق
         doLogout بلا داعٍ من محفظة لم تعد مرتبطة بالتطبيق أصلاً). */
      _teardownListeners: function () {
        try { provider.removeListener?.('accountsChanged', _onAccountsChanged); } catch {}
      },
    };
  }

  /* محاولة اتصال صامتة (بلا نافذة موافقة) — تُستخدم عند إقلاع التطبيق
     لاسترجاع جلسة سابقة، فقط إذا كانت المحفظة أصلاً صرّحت للموقع من
     قبل. eth_accounts (بعكس eth_requestAccounts) لا يفتح أي نافذة —
     يرجّع مصفوفة فاضية بصمت لو ما في تصريح سابق.
     rdns مُمرَّر من app.js من EXTWALLET_FLAG_KEY المحفوظ — بدونه كان
     يتصل بأول محفظة بالقائمة (ترتيب إعلان غير مضمون) بدل المحفظة
     الحقيقية التي اختارها المستخدم، مما يعني احتمال ربط عنوان خاطئ
     بصمت عند إعادة تحميل الصفحة إذا كان أكثر من محفظة مثبّتة.
     ✅ FIX: يعيد المحاولة لحتى ~1.2 ثانية لو القائمة فاضية أو المحفظة
     المطلوبة (rdns) غير موجودة بعد — راجع تعليق رأس الملف. */
  async function reconnectSilently(rdns) {
    function findTarget() {
      const entries = list();
      return rdns
        ? (entries.find(function (e) { return (e.info.rdns || e.info.uuid) === rdns; }) || null)
        : (entries[0] || null);
    }
    let target = findTarget();
    const t0 = Date.now();
    while (!target && Date.now() - t0 < 1200) {
      await new Promise(function (r) { setTimeout(r, 100); });
      target = findTarget();
    }
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
