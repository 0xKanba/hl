/* ═══════════════════════════════════════
   account.js — الحساب والتاريخ والمحفظة
═══════════════════════════════════════ */
'use strict';

/* ════ جلب بيانات الحساب ════ */
async function pollAccount() {
  if (!State.wallet) return;
  try {
    const [native, spot, xyz, openOrders] = await Promise.all([
      hlInfo({ type:'clearinghouseState',     user:State.wallet.address           }).catch(() => ({})),
      hlInfo({ type:'spotClearinghouseState', user:State.wallet.address           }).catch(() => ({})),
      hlInfo({ type:'clearinghouseState',     user:State.wallet.address, dex:'xyz'}).catch(() => ({})),
      hlInfo({ type:'frontendOpenOrders',     user:State.wallet.address, dex:'xyz'}).catch(() => [])
    ]);

    State.openOrders = Array.isArray(openOrders) ? openOrders : [];

    const nativeVal = parseFloat(native?.marginSummary?.accountValue || 0);
    const xyzVal    = parseFloat(xyz?.marginSummary?.accountValue    || 0);
    let spotUSDC    = 0;
    for (const b of spot?.balances || [])
      if (b.coin === 'USDC' || b.coin === 'USDC:0') spotUSDC += parseFloat(b.total || 0);

    const total  = nativeVal + (xyzVal > 0 && xyzVal !== nativeVal ? xyzVal : 0) + spotUSDC;
    const margin = parseFloat(xyz?.marginSummary?.totalMarginUsed   || 0) ||
                   parseFloat(native?.marginSummary?.totalMarginUsed || 0);

    const rawPos  = (xyz?.assetPositions || []).filter(p => parseFloat(p.position?.szi || 0) !== 0);
    const floatPnl= rawPos.reduce((s, p) => s + parseFloat(p.position?.unrealizedPnl || 0), 0);
    State.balance = { total, margin, floatPnl };

    State.positions = rawPos.map(p => {
      const existing = State.positions.find(e => e.position.coin === p.position.coin);
      const tpsl     = parseTpslFromOrders(State.openOrders, p.position.coin);
      if (existing && !tpsl.tp && !tpsl.sl && existing.tpsl) return { ...p, tpsl:existing.tpsl };
      return { ...p, tpsl };
    });

    updateFundingFromPositions(rawPos);
    renderPositions();
    autoSetReferrer();
  } catch (e) { console.warn('[pollAccount]', e.message); }
}

/* ════ عرض الرصيد ════ */
async function showBalance() {
  openModal('modalBalance');
  await _renderBalance();
  clearInterval(State._balTimer);
  State._balTimer = setInterval(async () => {
    if (!$('modalBalance')?.classList.contains('open')) { clearInterval(State._balTimer); return; }
    await _renderBalance();
  }, 2000);
}

async function _renderBalance() {
  if (!State.wallet) return;
  const el = $('balanceContent'); if (!el) return;
  try {
    const [spot, xyz] = await Promise.all([
      hlInfo({ type:'spotClearinghouseState', user:State.wallet.address           }).catch(() => ({})),
      hlInfo({ type:'clearinghouseState',     user:State.wallet.address, dex:'xyz'}).catch(() => ({}))
    ]);
    let total = 0;
    for (const b of spot?.balances || [])
      if (b.coin === 'USDC' || b.coin === 'USDC:0') total += parseFloat(b.total || 0);

    const margin   = parseFloat(xyz?.marginSummary?.totalMarginUsed || 0);
    const floatPnl = (xyz?.assetPositions || [])
      .reduce((s, p) => s + parseFloat(p.position?.unrealizedPnl || 0), 0);
    const pCls = floatPnl >= 0 ? 'green' : 'red';

    el.innerHTML = `
      <div class="balance-grid">
        <div class="balance-item">
          <span class="balance-label">💰 الرصيد الكلي</span>
          <span class="balance-value blue">$${fmt(total, 2)}</span>
        </div>
        <div class="balance-item">
          <span class="balance-label">🔒 الهامش المستخدم</span>
          <span class="balance-value warn">$${fmt(margin, 2)}</span>
        </div>
        <div class="balance-item">
          <span class="balance-label">📊 ربح / خسارة عائمة</span>
          <span class="balance-value ${pCls}">${floatPnl >= 0 ? '+' : ''}$${fmt(floatPnl, 2)}</span>
        </div>
      </div>
      <div class="balance-auto-note">↻ تحديث تلقائي كل 2 ثانية</div>`;
  } catch (e) {
    el.innerHTML = `<div class="balance-loading" style="color:var(--dn)">❌ ${e.message.slice(0, 150)}</div>`;
  }
}

/* ════ تاريخ الصفقات ════ */
async function showHistory() {
  if (!State.wallet) return toast('سجّل الدخول أولاً', 'err');
  openModal('modalHistory');
  const list = $('historyList'), sub = $('historySubtitle');
  list.innerHTML = '<div class="balance-loading">⏳ جاري جلب التاريخ...</div>';
  try {
    const [fillsMain, fillsXyz, ledger] = await Promise.all([
      hlInfo({ type:'userFills', user:State.wallet.address           }).catch(() => []),
      hlInfo({ type:'userFills', user:State.wallet.address, dex:'xyz'}).catch(() => []),
      hlInfo({ type:'userFundingHistory', user:State.wallet.address, dex:'xyz',
               startTime:Date.now() - 90 * 24 * 3600 * 1000          }).catch(() => [])
    ]);

    const allFills = [
      ...(Array.isArray(fillsMain) ? fillsMain : []),
      ...(Array.isArray(fillsXyz)  ? fillsXyz  : [])
    ];
    const seen  = new Set();
    const fills = allFills
      .filter(f => { const k = `${f.time}_${f.coin}_${f.px}`; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => b.time - a.time);

    if (!fills.length) {
      if (sub) sub.textContent = 'لا يوجد تاريخ صفقات بعد';
      list.innerHTML = '<div class="positions-empty">📂 لا يوجد تاريخ صفقات</div>';
      return;
    }

    // رسوم التمويل
    const fundingEvents = {};
    if (Array.isArray(ledger)) {
      for (const e of ledger) {
        const d = e.delta; if (d?.type !== 'funding') continue;
        const raw = d.coin?.includes(':') ? d.coin.split(':')[1] : d.coin;
        const sym = raw === 'GOLD' ? 'XAU' : (COIN_TO_SYM[raw] || raw);
        if (!fundingEvents[sym]) fundingEvents[sym] = [];
        fundingEvents[sym].push({ t:e.time, usd:-parseFloat(d.usdc || 0) });
      }
    }
    function getFundingForFill(sym, fillTime) {
      const events = fundingEvents[sym]; if (!events?.length) return 0;
      return events.filter(e => Math.abs(e.t - fillTime) <= 4 * 3600_000).reduce((s, e) => s + e.usd, 0);
    }

    const lastFills = fills.slice(0, 30);
    if (sub) sub.textContent = `آخر ${lastFills.length} صفقة`;

    const imgMap = {
      NQ:'/images/100.png', GOLD:'/images/gold.svg', XAU:'/images/gold.svg',
      SILVER:'/images/silver.svg', CL:'/images/oil.svg'
    };

    list.innerHTML = lastFills.map(f => {
      const raw   = f.coin?.includes(':') ? f.coin.split(':')[1] : f.coin;
      const sym   = raw === 'GOLD' ? 'XAU' : (COIN_TO_SYM[raw] || raw);
      const a     = ASSETS[sym] || { name:sym, icon:'📊', pxDp:2, szDp:2, unit:'' };
      const isGram= !!a.gram;
      const isBuy = f.side === 'B';
      const pnl   = parseFloat(f.closedPnl || 0);
      const fee   = parseFloat(f.fee       || 0);
      const fundUsd   = getFundingForFill(sym, f.time);
      const totalPnl  = pnl + fundUsd;
      const d         = new Date(f.time);
      const dateStr   = `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
      const timeStr   = d.toLocaleTimeString('en-US', { hour12:true, hour:'2-digit', minute:'2-digit' });
      const pCls      = pnl > 0 ? 'pos' : pnl < 0 ? 'neg' : 'zero';
      const tCls      = totalPnl > 0 ? 'pos' : totalPnl < 0 ? 'neg' : 'zero';
      const pxDisp    = isGram ? parseFloat(f.px) / TROY : parseFloat(f.px);
      const szDisp    = isGram ? parseFloat(f.sz) * TROY : parseFloat(f.sz);
      const fundSign  = fundUsd >= 0 ? '+' : '-';
      const fundCls   = fundUsd >= 0 ? 'pos' : 'neg';
      const assetImg  = imgMap[sym]
        ? `<img src="${imgMap[sym]}" style="width:22px;height:22px;object-fit:contain;vertical-align:middle;" alt="${sym}">`
        : `<span>${a.icon}</span>`;

      return `<div class="history-item">
        <div class="hist-top">
          <div class="hist-asset">${assetImg} ${a.name}</div>
          <div class="hist-badge"><span class="hist-type ${isBuy ? 'buy' : 'sell'}">${isBuy ? '▲ شراء' : '▼ بيع'}</span></div>
          <div class="hist-pnl ${pCls}">${pnl !== 0 ? (pnl > 0 ? '+' : '') + '$' + fmt(pnl, 2) : '—'}</div>
        </div>
        <div class="hist-grid">
          <div class="hist-cell"><span class="hist-lbl">الحجم</span><span class="hist-val">${szDisp.toFixed(isGram ? 2 : a.szDp)} ${a.unit}</span></div>
          <div class="hist-cell"><span class="hist-lbl">السعر</span><span class="hist-val">$${fmt(pxDisp, a.pxDp)}</span></div>
          <div class="hist-cell"><span class="hist-lbl">رسوم التداول</span><span class="hist-val" style="color:var(--warn)">-$${fmt(fee, 4)}</span></div>
          <div class="hist-cell"><span class="hist-lbl">رسوم التمويل</span><span class="hist-val ${fundCls}">${fundSign}$${Math.abs(fundUsd).toFixed(4)}</span></div>
          <div class="hist-cell"><span class="hist-lbl">🏁 الإجمالي</span><span class="hist-val ${tCls}">${totalPnl >= 0 ? '+' : ''}$${fmt(totalPnl, 2)}</span></div>
          <div class="hist-cell"><span class="hist-lbl">التوقيت</span><span class="hist-val">${dateStr} — ${timeStr}</span></div>
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    if (sub) sub.textContent = '';
    list.innerHTML = `<div class="balance-loading" style="color:var(--dn)">❌ فشل: ${e.message.slice(0, 100)}</div>`;
  }
}

/* ════ إيداع USDC ════ */
async function doDeposit() {
  const amt = parseFloat($('depositAmount').value || 0);
  if (!amt || amt < 8) return toast('الحد الأدنى $8', 'err');
  setBtnLoading('depositExecute', '⏳'); showLoader('موافقة USDC...');
  try {
    const p = new ethers.JsonRpcProvider(ARB_RPC);
    const w = new ethers.Wallet(State.wallet.privateKey, p);
    const usdc = new ethers.Contract(USDC_CA, [
      'function approve(address,uint256) returns(bool)',
      'function balanceOf(address) view returns(uint256)'
    ], w);
    const bridge = new ethers.Contract(BRDG_CA, ['function deposit(address,uint64) external'], w);
    const raw    = ethers.parseUnits(amt.toString(), 6);
    if (await usdc.balanceOf(w.address) < raw) throw new Error('رصيد USDC غير كافٍ على Arbitrum');
    await (await usdc.approve(BRDG_CA, raw)).wait();
    showLoader('إرسال للجسر...');
    await (await bridge.deposit(w.address, raw)).wait();
    closeModal('modalDeposit');
    toast(`✅ إيداع ${amt} USDC — 1-3 دقائق`, 'ok', 6000);
    setTimeout(pollAccount, 6000);
  } catch (e) { toast(`❌ ${e.message.slice(0, 120)}`, 'err', 5000); }
  finally { resetBtn('depositExecute'); hideLoader(); }
}

/* ════ سحب USDC ════ */
async function doWithdraw() {
  const amt  = parseFloat($('withdrawAmount').value  || 0);
  const dest = $('withdrawAddress').value.trim();
  if (!amt || amt <= 0)                              return toast('أدخل المبلغ', 'err');
  if (!/^0x[0-9a-fA-F]{40}$/.test(dest))            return toast('عنوان غير صحيح', 'err');
  setBtnLoading('withdrawExecute', '⏳'); showLoader('توقيع السحب...');
  try {
    const nonce  = Date.now(), to = dest.toLowerCase();
    const action = { type:'withdraw3', hyperliquidChain:'Mainnet', signatureChainId:'0xa4b1',
                     destination:to, amount:amt.toFixed(2), time:nonce };
    const sig = await State.wallet.signTypedData(
      { name:'HyperliquidSignTransaction', version:'1', chainId:42161,
        verifyingContract:'0x0000000000000000000000000000000000000000' },
      { 'HyperliquidTransaction:Withdraw': [
        { name:'hyperliquidChain', type:'string' }, { name:'destination', type:'string' },
        { name:'amount',          type:'string' }, { name:'time',        type:'uint64' }
      ]},
      { hyperliquidChain:'Mainnet', destination:to, amount:action.amount, time:nonce }
    );
    const { r, s, v } = ethers.Signature.from(sig);
    const res  = await fetch(HL_API + '/exchange', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action, nonce, signature:{ r,s,v } })
    });
    const d = await res.json();
    if (d.status !== 'ok') throw new Error(JSON.stringify(d));
    closeModal('modalWithdraw');
    toast(`✅ سحب ${amt} USDC قيد المعالجة`, 'ok', 5000);
    setTimeout(pollAccount, 5000);
  } catch (e) { toast(`❌ ${e.message.slice(0, 120)}`, 'err', 5000); }
  finally { resetBtn('withdrawExecute'); hideLoader(); }
}
