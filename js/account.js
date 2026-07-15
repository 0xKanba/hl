/* ═══════════════════════════════════════
   account.js — بيانات الحساب حيّة بالكامل عبر WS
   ✅ initAccountFeeds بديل pollAccount:
      لقطة أولية عبر WS Post + اشتراكات حية:
      allDexsClearinghouseState / spotState / userFills / orderUpdates
   ✅ لا polling — كل تحديث دفعي (push) من الخادم
═══════════════════════════════════════ */
'use strict';

function _depositErr(msg) {
  const m = (msg || '').toLowerCase();
  if (m.includes('insufficient') || m.includes('balance')) return 'رصيد USDC غير كافٍ في محفظة Arbitrum';
  if (m.includes('rejected') || m.includes('denied') || m.includes('cancel')) return 'تم إلغاء العملية من المحفظة';
  if (m.includes('gas') || m.includes('fee')) return 'رصيد ETH غير كافٍ لرسوم شبكة Arbitrum';
  if (m.includes('network') || m.includes('timeout') || m.includes('fetch')) return 'انقطع الاتصال — تحقق من الشبكة';
  if (m.includes('nonce')) return 'تعارض في العملية — انتظر وأعد المحاولة';
  if (m.includes('revert')) return 'رفضت شبكة Arbitrum العملية — تحقق من الرصيد';
  return 'فشل الإيداع — حاول مجدداً';
}

function _withdrawErr(msg) {
  const m = (msg || '').toLowerCase();
  if (m.includes('insufficient') || m.includes('balance')) return 'رصيد غير كافٍ للسحب';
  if (m.includes('rejected') || m.includes('denied') || m.includes('cancel')) return 'تم إلغاء توقيع السحب';
  if (m.includes('destination') || m.includes('address') || m.includes('invalid')) return 'عنوان المستلم غير صالح';
  if (m.includes('network') || m.includes('timeout') || m.includes('fetch')) return 'انقطع الاتصال — تحقق من الشبكة';
  if (m.includes('rate') || m.includes('limit')) return 'طلبات كثيرة — انتظر دقيقة';
  return 'فشل السحب — حاول مجدداً';
}

/* ════════════════════════════════════════════════
   initAccountFeeds — يُستدعى مرة واحدة فور ربط المحفظة (auth.js).
   1) لقطة أولية بالتوازي عبر WS Post (REST fallback تلقائي عبر hlInfo)
   2) اشتراكات حية تُبقي كل شيء متزامناً بلا أي polling بعدها
════════════════════════════════════════════════ */
let _acctUnsubs = [];
let _reconnectUnsub = null;
let _ordersRefreshTimer = null;

async function initAccountFeeds() {
  if (!State.wallet) return;
  teardownAccountFeeds();
  const user = State.wallet.address;

  const [spot, chs, fills, orders] = await Promise.all([
    hlInfo({ type: 'spotClearinghouseState', user }).catch(() => ({})),
    hlInfo({ type: 'clearinghouseState', user, dex: HL_DEX }).catch(() => ({})),
    hlInfo({ type: 'userFills', user }).catch(() => []),
    hlInfo({ type: 'frontendOpenOrders', user, dex: HL_DEX }).catch(() => []),
  ]);

  let spotUSDC = 0;
  for (const b of spot?.balances || []) {
    const coin = (b.coin || '').toUpperCase();
    if (coin === 'USDC' || coin === 'USDC:0') spotUSDC += parseFloat(b.total || 0);
  }
  const margin = parseFloat(chs?.marginSummary?.totalMarginUsed || 0);
  State.balance = { total: spotUSDC, margin, floatPnl: 0, available: Math.max(0, spotUSDC - margin) };
  State.fillsCache  = Array.isArray(fills) ? fills.slice(0, 300) : [];
  State.openOrders  = Array.isArray(orders) ? orders : [];

  const rawPos = (chs?.assetPositions || []).filter(p => parseFloat(p.position?.szi || 0) !== 0);
  _applyPositions(rawPos);

  _acctUnsubs.push(HL.subscribe({ type: 'allDexsClearinghouseState', user }, _onClearinghouseStatePush));
  _acctUnsubs.push(HL.subscribe({ type: 'spotState', user }, _onSpotStatePush));
  _acctUnsubs.push(HL.subscribe({ type: 'userFills', user }, _onUserFillsPush));
  _acctUnsubs.push(HL.subscribe({ type: 'orderUpdates', user }, _onOrderUpdatesPush));

  _reconnectUnsub = HL.onReconnect(() => { _refreshOpenOrders(); });

  autoSetReferrer();
}

function teardownAccountFeeds() {
  _acctUnsubs.forEach(u => { try { u(); } catch {} });
  _acctUnsubs = [];
  if (_reconnectUnsub) { try { _reconnectUnsub(); } catch {} _reconnectUnsub = null; }
  clearTimeout(_ordersRefreshTimer);
}

/* ════ Push: positions (Main + كل HIP-3 dex في رسالة واحدة، نستخرج HL_DEX) ════ */
function _onClearinghouseStatePush(data) {
  const entry = (data.clearinghouseStates || []).find(([dex]) => dex === HL_DEX);
  const inner = entry ? entry[1] : null;
  const rawPos = inner ? (inner.assetPositions || []).filter(p => parseFloat(p.position?.szi || 0) !== 0) : [];

  const margin   = parseFloat(inner?.marginSummary?.totalMarginUsed || 0);
  const floatPnl = rawPos.reduce((s, p) => s + parseFloat(p.position?.unrealizedPnl || 0), 0);
  const total    = State.balance?.total || 0;
  State.balance  = { total, margin, floatPnl, available: Math.max(0, total - margin) };

  const inGuard = (Date.now() - (State._lastOptimisticClose || 0)) < 20000;
  if (inGuard) {
    const closedCoins = State._closedCoins || [];
    if (rawPos.length > 0 || State.positions.length > 0) {
      const filtered = closedCoins.length > 0 ? rawPos.filter(p => !closedCoins.includes(p.position.coin)) : rawPos;
      State._emptyPosCount = 0;
      _applyPositions(filtered);
    }
  } else {
    if (State.positions.length > 0 && rawPos.length === 0) {
      State._emptyPosCount = (State._emptyPosCount || 0) + 1;
      if (State._emptyPosCount < 2) return;
      State._emptyPosCount = 0;
    } else {
      State._emptyPosCount = 0;
    }
    _applyPositions(rawPos);
  }
  if ($('modalBalance')?.classList.contains('open')) _renderBalanceFromState();
}

/* ════ Push: رصيد USDC الفعلي (Spot — مصدر الرصيد الوحيد) ════ */
function _onSpotStatePush(data) {
  let spotUSDC = 0;
  for (const b of data.spotState?.balances || []) {
    const coin = (b.coin || '').toUpperCase();
    if (coin === 'USDC' || coin === 'USDC:0') spotUSDC += parseFloat(b.total || 0);
  }
  const margin   = State.balance?.margin || 0;
  const floatPnl = State.balance?.floatPnl || 0;
  State.balance  = { total: spotUSDC, margin, floatPnl, available: Math.max(0, spotUSDC - margin) };
  if ($('modalBalance')?.classList.contains('open')) _renderBalanceFromState();
}

/* ════ Push: Fills حية — تُغذّي fillsCache + تُعيد دمج الصفقات فوراً ════ */
function _onUserFillsPush(data) {
  const incoming = data.fills || [];
  State.fillsCache = data.isSnapshot
    ? incoming.slice(0, 300)
    : [...incoming, ...(State.fillsCache || [])].slice(0, 300);

  if (State.positions.length) {
    State.positions = mergeFillData(
      State.positions.map(p => ({ position: p.position, type: p.type, tpsl: p.tpsl })),
      State.fillsCache
    );
    renderPositions();
  }
}

/* ════ Push: تغيّر حالة أمر (فتح/تنفيذ/إلغاء/تفعيل) — إشارة لإعادة جلب
   frontendOpenOrders الغني (isTrigger/orderType/triggerPx) بدل polling أعمى ════ */
function _onOrderUpdatesPush() {
  clearTimeout(_ordersRefreshTimer);
  _ordersRefreshTimer = setTimeout(_refreshOpenOrders, 400);
}

async function _refreshOpenOrders() {
  if (!State.wallet) return;
  try {
    const ords = await hlInfo({ type: 'frontendOpenOrders', user: State.wallet.address, dex: HL_DEX });
    State.openOrders = Array.isArray(ords) ? ords : [];
    if (State.positions.length) {
      State.positions = State.positions.map(p => ({ ...p, tpsl: parseTpslFromOrders(State.openOrders, p.position.coin) }));
      renderPositions();
    }
    if (typeof ChartModule !== 'undefined') ChartModule.refreshLines();
  } catch (e) { console.warn('[orders]', e.message); }
}

/* ════ دمج بيانات الصفقة (تُستدعى من كل نقاط تحديث clearinghouseState) ════ */
function _applyPositions(rawPos) {
  _trackOpenTimes(rawPos); // احتياطي محلي (localStorage) لصفقات أقدم من سجل الـ fills المتاح
  const merged = mergeFillData(rawPos, State.fillsCache);
  State.positions = merged.map(p => {
    const existing = State.positions.find(e => e.position.coin === p.position.coin);
    const tpsl     = parseTpslFromOrders(State.openOrders, p.position.coin);
    const openTime = p.openTime || State._openTimes?.[p.position.coin] || null;
    const base     = { ...p, openTime };
    if (existing && !tpsl.tp && !tpsl.sl && existing.tpsl) return { ...base, tpsl: existing.tpsl };
    return { ...base, tpsl };
  });
  updateFundingFromPositions(rawPos);
  renderPositions();
}

/* ════ وقت فتح احتياطي (localStorage) — يُستخدم فقط لو لم تجد mergeFillData
   Fill مطابقاً (صفقة أقدم من سجل الـ fills المُحمَّل) ════ */
function _loadOpenTimes() {
  try { return JSON.parse(localStorage.getItem(OPENTIME_KEY) || '{}'); } catch { return {}; }
}
function _trackOpenTimes(rawPos) {
  const times   = _loadOpenTimes();
  const current = new Set(rawPos.map(p => p.position.coin));
  let changed = false;
  current.forEach(coin => { if (!times[coin]) { times[coin] = Date.now(); changed = true; } });
  Object.keys(times).forEach(coin => { if (!current.has(coin)) { delete times[coin]; changed = true; } });
  if (changed) { try { localStorage.setItem(OPENTIME_KEY, JSON.stringify(times)); } catch {} }
  State._openTimes = times;
}

/* ════ Balance Modal — يرسم من State الحي، بلا أي fetch أثناء الفتح ════ */
function showBalance() {
  openModal('modalBalance');
  _renderBalanceFromState();
  clearInterval(State._balTimer);
  State._balTimer = setInterval(() => {
    if (!$('modalBalance')?.classList.contains('open')) { clearInterval(State._balTimer); return; }
    _renderBalanceFromState();
  }, 1000); // إعادة رسم محلية فقط (لا شبكة) — تحديث فوري أصلاً عبر spotState/clearinghouseState push
}

function _renderBalanceFromState() {
  const el = $('balanceContent'); if (!el) return;
  const b = State.balance;
  if (!b) { el.innerHTML = '<div class="balance-loading">⏳ جاري جلب الرصيد...</div>'; return; }
  const pCls = b.floatPnl >= 0 ? 'green' : 'red';
  el.innerHTML = `
    <div class="balance-grid">
      <div class="balance-item">
        <span class="balance-label">💰 رصيد Spot USDC</span>
        <span class="balance-value blue">$${fmt(b.total, 2)}</span>
      </div>
      <div class="balance-item">
        <span class="balance-label">✅ المتاح للتداول</span>
        <span class="balance-value green">$${fmt(b.available, 2)}</span>
      </div>
      <div class="balance-item">
        <span class="balance-label">🔒 الهامش المستخدم</span>
        <span class="balance-value warn">$${fmt(b.margin, 2)}</span>
      </div>
      <div class="balance-item">
        <span class="balance-label">📊 ربح / خسارة عائمة</span>
        <span class="balance-value ${pCls}">${b.floatPnl >= 0 ? '+' : ''}$${fmt(b.floatPnl, 2)}</span>
      </div>
    </div>
    <div class="balance-auto-note">↻ تحديث حي (WebSocket)</div>`;
}

/* ════ Trade History — يستخدم fillsCache الحي أولاً (مصدر وحيد)، لا يُعيد
   جلب الـ fills إلا لو الكاش غير كافٍ. userFunding (وليس userFundingHistory
   — الاسم القديم غير موثّق ويفشل بصمت) للتمويل التاريخي. ════ */
async function showHistory() {
  if (!State.wallet) return toast('سجّل الدخول أولاً', 'err');
  openModal('modalHistory');
  const list = $('historyList'), sub = $('historySubtitle');
  list.innerHTML = '<div class="balance-loading">⏳ جاري جلب السجل...</div>';
  try {
    const needFresh = !State.fillsCache || State.fillsCache.length < 30;
    const [fillsRaw, ledger] = await Promise.all([
      needFresh ? hlInfo({ type: 'userFills', user: State.wallet.address }).catch(() => []) : Promise.resolve(State.fillsCache),
      hlInfo({ type: 'userFunding', user: State.wallet.address,
               startTime: Date.now() - 90 * 24 * 3600 * 1000 }).catch(() => [])
    ]);

    const fills = (Array.isArray(fillsRaw) ? fillsRaw : []).slice().sort((a, b) => b.time - a.time);

    if (!fills.length) {
      if (sub) sub.textContent = 'لا يوجد سجل تداول حتى الآن';
      list.innerHTML = '<div class="positions-empty">📂 لا يوجد سجل تداول</div>';
      return;
    }

    const fundingEvents = {};
    if (Array.isArray(ledger)) {
      for (const e of ledger) {
        const d = e.delta; if (d?.type !== 'funding') continue;
        const raw = d.coin?.includes(':') ? d.coin.split(':')[1] : d.coin;
        const sym = raw === 'GOLD' ? 'XAU' : (COIN_TO_SYM[raw] || raw);
        if (!fundingEvents[sym]) fundingEvents[sym] = [];
        fundingEvents[sym].push({ t: e.time, usd: -parseFloat(d.usdc || 0) });
      }
    }

    function getFundingForFill(sym, fillTime) {
      const events = fundingEvents[sym]; if (!events?.length) return 0;
      return events.filter(e => Math.abs(e.t - fillTime) <= 4 * 3600_000).reduce((s, e) => s + e.usd, 0);
    }

    const lastFills = fills.slice(0, 30);
    if (sub) sub.textContent = `آخر ${lastFills.length} صفقة`;

    const imgMap = {
      NQ: '/images/100.png', GOLD: '/images/gold.svg', XAU: '/images/gold.svg',
      SILVER: '/images/silver.svg', CL: '/images/oil.svg'
    };

    list.innerHTML = lastFills.map(f => {
      const raw      = f.coin?.includes(':') ? f.coin.split(':')[1] : f.coin;
      const sym      = raw === 'GOLD' ? 'XAU' : (COIN_TO_SYM[raw] || raw);
      const a        = ASSETS[sym] || { name: sym, icon: '📊', pxDp: 2, szDp: 2, unit: '' };
      const isGram   = !!a.gram;
      const isBuy    = f.side === 'B';
      const pnl      = parseFloat(f.closedPnl || 0);
      const fee      = parseFloat(f.fee || 0);
      const fundUsd  = getFundingForFill(sym, f.time);
      const totalPnl = pnl + fundUsd;
      const d        = new Date(f.time);
      const dateStr  = `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
      const timeStr  = d.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit' });
      const pCls     = pnl > 0 ? 'pos' : pnl < 0 ? 'neg' : 'zero';
      const tCls     = totalPnl > 0 ? 'pos' : totalPnl < 0 ? 'neg' : 'zero';
      const pxDisp   = isGram ? parseFloat(f.px) / TROY : parseFloat(f.px);
      const szDisp   = isGram ? parseFloat(f.sz) * TROY : parseFloat(f.sz);
      const fundSign = fundUsd >= 0 ? '+' : '-';
      const fundCls  = fundUsd >= 0 ? 'pos' : 'neg';
      const assetImg = imgMap[sym]
        ? `<img src="${imgMap[sym]}" style="width:22px;height:22px;object-fit:contain;vertical-align:middle;" alt="${sym}">`
        : `<span>${a.icon}</span>`;

      return `<div class="history-item">
        <div class="hist-top">
          <div class="hist-asset">${assetImg} ${a.name}</div>
          <div class="hist-badge"><span class="hist-type ${isBuy?'buy':'sell'}">${isBuy?'▲ شراء':'▼ بيع'}</span></div>
          <div class="hist-pnl ${pCls}">${pnl!==0?(pnl>0?'+':'')+'$'+fmt(pnl,2):'—'}</div>
        </div>
        <div class="hist-grid">
          <div class="hist-cell"><span class="hist-lbl">الحجم</span><span class="hist-val">${szDisp.toFixed(isGram?2:a.szDp)} ${a.unit}</span></div>
          <div class="hist-cell"><span class="hist-lbl">السعر</span><span class="hist-val">$${fmt(pxDisp,a.pxDp)}</span></div>
          <div class="hist-cell"><span class="hist-lbl">رسوم التداول</span><span class="hist-val" style="color:var(--hc-warn)">-$${fmt(fee,4)}</span></div>
          <div class="hist-cell"><span class="hist-lbl">رسوم التمويل</span><span class="hist-val ${fundCls}">${fundSign}$${Math.abs(fundUsd).toFixed(4)}</span></div>
          <div class="hist-cell"><span class="hist-lbl">🏁 الإجمالي</span><span class="hist-val ${tCls}">${totalPnl>=0?'+':''}$${fmt(totalPnl,2)}</span></div>
          <div class="hist-cell"><span class="hist-lbl">التوقيت</span><span class="hist-val">${dateStr} — ${timeStr}</span></div>
        </div>
      </div>`;
    }).join('');
  } catch {
    if (sub) sub.textContent = '';
    list.innerHTML = `<div class="balance-loading" style="color:var(--hc-dn)">⚠️ تعذّر جلب السجل</div>`;
  }
}

/* ════ Deposit ════ (بدون تغيير وظيفي) */
async function doDeposit() {
  const amt = parseFloat($('depositAmount').value || 0);
  if (!amt || amt < 5) return toast('الحد الأدنى للإيداع $5', 'err');
  if (!State.wallet)   return toast('يجب تسجيل الدخول أولاً', 'err');
  setBtnLoading('depositExecute', '⏳');
  showLoader('جارٍ التحقق من رصيد USDC...');
  try {
    const w = await State.wallet.getArbitrumSigner();
    const usdc = new ethers.Contract(USDC_CA, [
      'function approve(address,uint256) returns(bool)',
      'function balanceOf(address) view returns(uint256)'
    ], w);
    const bridge = new ethers.Contract(BRDG_CA, ['function deposit(address,uint64) external'], w);
    const raw    = ethers.parseUnits(amt.toString(), 6);
    const bal    = await usdc.balanceOf(State.wallet.address);
    if (bal < raw) throw new Error('رصيد USDC غير كافٍ على Arbitrum');
    showLoader('انتظر موافقة المحفظة...');
    await (await usdc.approve(BRDG_CA, raw)).wait();
    showLoader('جارٍ إرسال USDC...');
    await (await bridge.deposit(State.wallet.address, raw)).wait();
    closeModal('modalDeposit');
    toast(`✅ تم إرسال $${amt} — يصل خلال 1-3 دقائق`, 'ok', 6000);
  } catch (e) {
    toast(`⚠️ ${_depositErr(e.message)}`, 'err', 5000);
  } finally { resetBtn('depositExecute'); hideLoader(); }
}

/* ════ Withdraw ════ (بدون تغيير وظيفي) */
async function doWithdraw() {
  const amt  = parseFloat($('withdrawAmount').value || 0);
  const dest = $('withdrawAddress').value.trim();
  if (!amt || amt <= 0)  return toast('أدخل المبلغ المراد سحبه', 'err');
  if (amt < 2)           return toast('الحد الأدنى $2 (بعد رسوم $1)', 'err');
  if (!/^0x[0-9a-fA-F]{40}$/.test(dest)) return toast('عنوان المحفظة غير صحيح', 'err');
  if (!State.wallet)     return toast('يجب تسجيل الدخول أولاً', 'err');
  setBtnLoading('withdrawExecute', '⏳');
  showLoader('انتظر توقيع طلب السحب...');
  try {
    const nonce  = Date.now();
    const to     = dest.toLowerCase();
    const action = {
      type: 'withdraw3', hyperliquidChain: 'Mainnet',
      signatureChainId: '0xa4b1', destination: to,
      amount: amt.toFixed(2), time: nonce
    };
    const sig = await State.wallet.signTypedData(
      { name: 'HyperliquidSignTransaction', version: '1', chainId: 42161,
        verifyingContract: '0x0000000000000000000000000000000000000000' },
      { 'HyperliquidTransaction:Withdraw': [
        { name: 'hyperliquidChain', type: 'string' },
        { name: 'destination',      type: 'string' },
        { name: 'amount',           type: 'string' },
        { name: 'time',             type: 'uint64' }
      ]},
      { hyperliquidChain: 'Mainnet', destination: to, amount: action.amount, time: nonce }
    );
    const { r, s, v } = ethers.Signature.from(sig);
    showLoader('جارٍ إرسال طلب السحب...');
    const body = { action, nonce, signature: { r, s, v } };
    const d = HL.isOpen() ? await HL.post(body, true).catch(() => _restExchange(body)) : await _restExchange(body);
    if (d.status !== 'ok') throw new Error(JSON.stringify(d));
    closeModal('modalWithdraw');
    toast(`✅ طلب السحب مقبول — سيصلك $${(amt - 1).toFixed(2)} USDC`, 'ok', 6000);
  } catch (e) {
    toast(`⚠️ ${_withdrawErr(e.message)}`, 'err', 5000);
  } finally { resetBtn('withdrawExecute'); hideLoader(); }
}
