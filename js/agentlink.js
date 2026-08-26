/* ═══════════════════════════════════════════════════════════════
   agentlink.js — روابط وكيل قابلة للمشاركة (trade-only link)
   ✅ جديد — نفس آلية Hyperliquid الرسمية لمشاركة وكيل تداول جاهز:
      رابط يحمل {address: عنوان المحفظة الرئيسية, key: مفتاح خاص لوكيل}
      بصيغة base64(JSON) — أي شخص يفتحه يتداول فوراً (الوكيل بلا صلاحية
      سحب مطلقاً، موثّق من Hyperliquid نفسها)، بلا محفظة ولا بريد.
      build() يدعم رابط موقعنا (افتراضي) أو رابط app.hyperliquid.xyz/trade
      الرسمي نفسه (target:'hyperliquid') — نفس شكل JSON بالضبط.

   ✅ tryConsume() تُستدعى مرة واحدة عند إقلاع app.js، قبل أي استرجاع
      جلسة Privy/محفظة خارجية. لو ?link= صالح بالعنوان: State.agent
      يُبنى مباشرة من المفتاح (تداول فوري، بلا أي توقيع)، وState.wallet
      كائن قراءة فقط (isAgentLink:true) يكفي لطلبات info لكنه يرفض
      بوضوح أي عملية تحتاج توقيع المحفظة الرئيسية (إيداع/سحب/تفويض
      وكيل جديد/تصدير) — نفس القيد المفروض أصلاً على مفتاح الوكيل عند
      Hyperliquid، لا قيداً اخترعناه نحن. الرابط يُمحى من شريط العنوان
      فوراً (history.replaceState) فلا يبقى المفتاح بتاريخ المتصفح.
═══════════════════════════════════════════════════════════════ */
'use strict';

const AgentLink = (function () {
  const RE_ADDR = /^0x[0-9a-fA-F]{40}$/;
  const RE_KEY  = /^0x[0-9a-fA-F]{64}$/;

  function _encode(mainAddress, agentPk) {
    return btoa(JSON.stringify({ address: mainAddress, key: agentPk }));
  }

  /* target: 'self' (افتراضي، رابط موقعنا) أو 'hyperliquid' (app.hyperliquid.xyz/trade) */
  function build(mainAddress, agentPk, target) {
    const b64 = _encode(mainAddress, agentPk);
    if (target === 'hyperliquid') return `https://app.hyperliquid.xyz/trade?link=${b64}`;
    const base = window.location.origin + window.location.pathname;
    return `${base}?link=${b64}`;
  }

  function parseFromLocation() {
    const raw = new URLSearchParams(window.location.search).get('link');
    if (!raw) return null;
    try {
      const obj = JSON.parse(atob(raw));
      if (!obj || !RE_ADDR.test(obj.address) || !RE_KEY.test(obj.key)) return null;
      return obj;
    } catch { return null; }
  }

  function tryConsume() {
    const data = parseFromLocation();
    if (!data) return false;
    try {
      const agentWallet = new ethers.Wallet(data.key);
      State.agent  = agentWallet;
      State.wallet = {
        address: data.address,
        walletClientType: 'agentlink',
        walletName: 'رابط وكيل تداول',
        isAgentLink: true,
        signTypedData:     () => Promise.reject(new Error('LINK_MODE_NO_MASTER_KEY')),
        getArbitrumSigner: () => Promise.reject(new Error('LINK_MODE_NO_MASTER_KEY')),
      };
      State.isGuest = false;
      history.replaceState(null, '', window.location.pathname);
      return true;
    } catch { return false; }
  }

  return { build, parseFromLocation, tryConsume };
})();

window.AgentLink = AgentLink;
