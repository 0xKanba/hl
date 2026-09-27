/* ═══════════════════════════════════════════════════════════════
   oc-portfolio.js — أرصدة الأسهم والأوامر المفتوحة والسجل

   يوفّر نفس نقاط الدخول التي تنتظرها طبقة الاتصال المنسوخة كما هي
   (core/auth.js): initAccountFeeds / teardownAccountFeeds /
   _renderBalanceFromState — لكن بمنطق أسواق التوقعات:

     رصيد USDC   ← spotClearinghouseState.balances (coin = "USDC")
     أسهم نتيجة  ← نفس القائمة، coin = `+${encoding}`  (راجع oc-config)
     الأوامر     ← frontendOpenOrders، نُبقي ما coin له الشكل `#enc` فقط
     السجل       ← userFills، نفس التصفية

   كل شيء حيّ عبر اشتراكات HL (spotState / userFills / orderUpdates) —
   بلا أي polling، مطابقاً أسلوب المشروع الأصلي.
═══════════════════════════════════════════════════════════════ */
'use strict';

const OcPortfolio = (function () {

  let _unsubs = [];
  let _reconnUnsub = null;
  let _ordersTimer = null;

  /* ════ أرصدة ════ */
  function _applySpotBalances(balances) {
    const shares = Object.create(null);
    let usdc = 0, usdcHold = 0;
    for (const b of balances || []) {
      const coin = b.coin || '';
      if (coin.toUpperCase() === 'USDC' || coin.toUpperCase() === 'USDC:0') {
        usdc     += parseFloat(b.total || 0);
        usdcHold += parseFloat(b.hold || 0);
        continue;
      }
      if (coin.charCodeAt(0) !== 43) continue; // '+'
      const total = parseFloat(b.total || 0);
      if (!(total > 0)) continue;
      shares[coin] = { total, hold: parseFloat(b.hold || 0) };
    }
    OcState.shares   = shares;
    OcState.usdc     = Math.max(0, usdc - usdcHold);
    OcState.usdcHold = usdcHold;
  }

  function sharesOf(token) {
    const s = OcState.shares[token];
    if (!s) return 0;
    return Math.max(0, s.total - (s.hold || 0));
  }

  /* ════ لقطة + اشتراكات ════ */
  async function initAccountFeeds() {
    if (!State.wallet) return;
    teardownAccountFeeds();
    const user = State.wallet.address;

    const [spot, orders, fills] = await Promise.all([
      hlInfo({ type: 'spotClearinghouseState', user }).catch(() => ({})),
      hlInfo({ type: 'frontendOpenOrders', user }).catch(() => []),
      hlInfo({ type: 'userFills', user }).catch(() => [])
    ]);

    _applySpotBalances(spot?.balances);
    OcState.openOrders = _onlyOutcomes(orders);
    OcState.fills      = _onlyOutcomes(fills).slice(0, 200);

    _render();

    _unsubs.push(HL.subscribe({ type: 'spotState', user }, d => {
      _applySpotBalances(d.spotState?.balances);
      _render();
    }));
    _unsubs.push(HL.subscribe({ type: 'userFills', user }, d => {
      const incoming = _onlyOutcomes(d.fills || []);
      OcState.fills = d.isSnapshot ? incoming.slice(0, 200)
                                   : [...incoming, ...(OcState.fills || [])].slice(0, 200);
      if (!d.isSnapshot && incoming.length) playFillSound();
      _render();
    }));
    _unsubs.push(HL.subscribe({ type: 'orderUpdates', user }, () => {
      clearTimeout(_ordersTimer);
      _ordersTimer = setTimeout(refreshOrders, 400);
    }));

    _reconnUnsub = HL.onReconnect(() => { refresh(); });

    autoSetReferrer();
  }

  function teardownAccountFeeds() {
    _unsubs.forEach(u => { try { u(); } catch {} });
    _unsubs = [];
    if (_reconnUnsub) { try { _reconnUnsub(); } catch {} _reconnUnsub = null; }
    clearTimeout(_ordersTimer);
    OcState.shares = Object.create(null);
    OcState.usdc = 0; OcState.usdcHold = 0;
    OcState.openOrders = []; OcState.fills = [];
  }

  function _onlyOutcomes(arr) {
    return (Array.isArray(arr) ? arr : []).filter(x => typeof x.coin === 'string' && x.coin.charCodeAt(0) === 35);
  }

  async function refreshOrders() {
    if (!State.wallet) return;
    try {
      const o = await hlInfo({ type: 'frontendOpenOrders', user: State.wallet.address });
      OcState.openOrders = _onlyOutcomes(o);
      _render();
    } catch (e) { console.warn('[oc-portfolio orders]', e.message); }
  }

  async function refresh() {
    if (!State.wallet) return;
    try {
      const [spot, orders] = await Promise.all([
        hlInfo({ type: 'spotClearinghouseState', user: State.wallet.address }).catch(() => ({})),
        hlInfo({ type: 'frontendOpenOrders', user: State.wallet.address }).catch(() => [])
      ]);
      _applySpotBalances(spot?.balances);
      OcState.openOrders = _onlyOutcomes(orders);
      _render();
    } catch (e) { console.warn('[oc-portfolio refresh]', e.message); }
  }

  /* ════ اسم معروض لعملة/توكن نتيجة ════ */
  function label(name) {
    const dec = ocDecode(name);
    if (!dec) return name;
    const o = OcState.model?.byOutcome?.get(dec.outcome);
    if (!o) return name;
    const side = o.sides[dec.side];
    return `${o.title} — ${side ? side.name : ''}`;
  }

  /* ════ قيمة المحفظة ════ */
  function totals() {
    let sharesValue = 0, count = 0;
    for (const token in OcState.shares) {
      const dec = ocDecode(token);
      if (!dec) continue;
      const px = OcPrices.mid('#' + dec.enc);
      const sz = OcState.shares[token].total;
      count++;
      sharesValue += (px != null ? px : 0) * sz;
    }
    return { usdc: OcState.usdc, hold: OcState.usdcHold, sharesValue, count, equity: OcState.usdc + OcState.usdcHold + sharesValue };
  }

  /* ════ الرسم ════ */
  function _render() {
    _renderBalanceFromState();
    if (typeof OcUI !== 'undefined' && OcState.view === 'portfolio') OcUI.renderPortfolio();
    if (typeof OcUI !== 'undefined') OcUI.renderTicket();
  }

  /* نفس اسم الدالة المتوقَّع من core/auth.js:doLogout */
  function _renderBalanceFromState() {
    const connected = !State.isGuest && !!State.wallet;
    const t = totals();
    ocSetTxt('bcTotal',  connected ? ocUsd(t.equity)      : '—');
    ocSetTxt('bcAvail',  connected ? ocUsd(t.usdc)        : '—');
    ocSetTxt('bcShares', connected ? ocUsd(t.sharesValue) : '—');
    ocSetTxt('bcCount',  connected ? String(t.count)      : '—');
  }

  return {
    initAccountFeeds, teardownAccountFeeds, refresh, refreshOrders,
    sharesOf, totals, label, _renderBalanceFromState
  };
})();

/* ════ أسماء عامة تنتظرها طبقة الاتصال المنسوخة كما هي (core/auth.js) ════ */
function initAccountFeeds()        { return OcPortfolio.initAccountFeeds(); }
function teardownAccountFeeds()    { return OcPortfolio.teardownAccountFeeds(); }
function _renderBalanceFromState() { return OcPortfolio._renderBalanceFromState(); }
