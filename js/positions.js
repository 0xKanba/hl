'use strict';

function shortCoinPos(c) {
  const raw = c.includes(':') ? c.split(':')[1] : c;
  if (raw === 'GOLD') return 'XAU';
  return COIN_TO_SYM[raw] || raw;
}
function apiAsset(sym) {
  return (sym === 'XAU') ? ASSETS['GOLD'] : ASSETS[sym];
}

function parseTpslFromOrders(orders, coin) {
  const r = { tp: null, sl: null, tpOid: null, slOid: null };
  for (const o of orders || []) {
    if (o.coin !== coin || !o.isTrigger) continue;
    const ot = (o.orderType || '').toLowerCase();
    if (ot.includes('take profit') || ot.includes('tp')) {
      r.tp = parseFloat(o.triggerPx); r.tpOid = o.oid;
    } else if (ot.includes('stop') || ot.includes('sl')) {
      r.sl = parseFloat(o.triggerPx); r.slOid = o.oid;
    }
  }
  return r;
}

function calcLiqPrice(entryPxOz, sziOz, balance, isCross, maxLev) {
  if (!entryPxOz || !sziOz || !maxLev) return null;
  const side    = sziOz > 0 ? 1 : -1;
  const absSize = Math.abs(sziOz);
  const mmFrac  = 0.5 / maxLev;
  const notional = absSize * entryPxOz;
  let liq;
  if (isCross) {
    const bal        = balance > 0 ? balance : notional / maxLev;
    const freeMargin = bal - notional * mmFrac;
    if (freeMargin <= 0) {
      liq = side > 0 ? entryPxOz * 0.99 : entryPxOz * 1.01;
    } else {
      liq = entryPxOz - side * freeMargin / absSize;
    }
  } else {
    liq = side > 0
      ? entryPxOz * (1 - 1 / maxLev + mmFrac)
      : entryPxOz * (1 + 1 / maxLev - mmFrac);
  }
  if (liq <= 0) return 0.01;
  if (side === -1 && liq > entryPxOz * 8) return null;
  return liq;
}

function liqPriceDisplay(sym, entryPxOz, sziOz, balance) {
  const a      = ASSETS[sym] || ASSETS['GOLD'] || { lev: 20, cross: false, pxDp: 2, gram: false };
  const isGram = !!a.gram;
  const liqOz  = calcLiqPrice(entryPxOz, sziOz, balance, a.cross, a.lev);
  if (liqOz === null) return { text: '—', ounce: null };
  const liqDisp = isGram ? liqOz / TROY : liqOz;
  return { text: `$${fmt(liqDisp, a.pxDp)}`, ounce: liqOz };
}

function calcTpPrice(ep, szi, pnl) {
  const sz = parseFloat(szi), e = parseFloat(ep);
  if (!sz || !e) return e;
  return sz > 0 ? e + pnl / sz : e - pnl / Math.abs(sz);
}

function calcSlPrice(ep, szi, sl) {
  const sz = parseFloat(szi), e = parseFloat(ep);
  if (!sz || !e) return e;
  return sz > 0 ? e - sl / sz : e + sl / Math.abs(sz);
}

/* ════ Funding ════ */
function updateFundingFromPositions(positions) {
  const acc = {};
  for (const p of positions || []) {
    const pos  = p.position, coin = pos.coin || '';
    const raw  = coin.includes(':') ? coin.split(':')[1] : coin;
    const sym  = raw === 'GOLD' ? 'XAU' : (COIN_TO_SYM[raw] || raw);
    acc[sym] = -parseFloat(pos.cumFunding?.sinceOpen || 0);
  }
  State.fundingRates = acc;
  Object.entries(acc).forEach(([sym, usd]) => {
    document.querySelectorAll(`[data-funding-sym="${sym}"]`).forEach(el => {
      el.textContent = `${usd >= 0 ? '+' : '-'}$${Math.abs(usd).toFixed(4)}`;
      el.className   = `pos-data-value pos-funding-val ${usd >= 0 ? 'pos' : 'neg'}`;
    });
  });
}

async function fetchFundingRates() {
  if (!State.wallet) return;
  try {
    const xyz    = await hlInfo({ type: 'clearinghouseState', user: State.wallet.address, dex: 'xyz' }).catch(() => ({}));
    const rawPos = (xyz?.assetPositions || []).filter(p => parseFloat(p.position?.szi || 0) !== 0);
    if (rawPos.length) updateFundingFromPositions(rawPos);
  } catch {}
}

function startFundingTimer() {
  clearInterval(State._fundingTimer);
  fetchFundingRates();
  State._fundingTimer = setInterval(fetchFundingRates, 60_000);
}

/* ════ تفاصيل الصفقة — عند النقر على اسم الأصل ════ */
window.openPosDetail = function (i) {
  const p = State.positions[i]; if (!p) return;
  const pos     = p.position;
  const sziOz   = parseFloat(pos.szi);
  const sym     = shortCoinPos(pos.coin);
  const a       = ASSETS[sym] || { name: sym, unit: '', icon: '📊', pxDp: 2, lev: 10, cross: true };
  const isGram  = !!a.gram;
  const isLong  = sziOz > 0;
  const entryOz = parseFloat(pos.entryPx || 0);
  const entryDisp = isGram ? entryOz / TROY : entryOz;
  const curPx   = State.prices[sym]?.mid;
  const fundUsd = State.fundingRates[sym] || State.fundingRates['GOLD'] || 0;
  const bal     = State.balance?.total || 0;
  const liqInfo = liqPriceDisplay(sym, entryOz, sziOz, bal);
  const openTs  = State._openTimes?.[pos.coin];
  const openStr = openTs
    ? new Date(openTs).toLocaleString('ar-EG', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
    : '—';

  setTxt('posDetailTitle', `${a.icon} ${a.name}`);
  $('posDetailBody').innerHTML = `
    <div class="confirm-row"><span class="confirm-key">الاتجاه</span><span class="confirm-val ${isLong?'buy':'sell'}">${isLong?'▲ شراء':'▼ بيع'}</span></div>
    <div class="confirm-row"><span class="confirm-key">الرافعة المالية</span><span class="confirm-val">${a.lev}x ${a.cross?'· Cross':'· Isolated'}</span></div>
    <div class="confirm-row"><span class="confirm-key">وقت الفتح</span><span class="confirm-val">${openStr}</span></div>
    <div class="confirm-row"><span class="confirm-key">رسوم التمويل</span><span class="confirm-val ${fundUsd>=0?'buy':'sell'}">${fundUsd>=0?'+':'-'}$${Math.abs(fundUsd).toFixed(4)}</span></div>
    <div class="confirm-row"><span class="confirm-key">⚡ سعر التصفية</span><span class="confirm-val warn">${liqInfo.text}</span></div>
  `;
  openModal('modalPosDetail');
};

/* ════ Render ════ */
/* ✅ null sentinel — empty string '' equals '' causing ghost cards bug */
let _posFingerprint = null;

function resetPosFingerprint() { _posFingerprint = null; }

function _fmtOpenTime(ts) {
  if (!ts) return '—';
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 60) return 'الآن';
  const m = Math.floor(diffSec / 60);
  if (m < 60) return `${m} د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} س`;
  return `${Math.floor(h / 24)} ي`;
}

function renderPositions() {
  const count = State.positions.length;
  const fp    = State.positions.map(p =>
    `${p.position.coin}|${p.position.szi}|${p.tpsl?.tp||''}|${p.tpsl?.sl||''}`
  ).join(';');

  setTxt('positionsCount', count);
  const clsBtn = $('btnCloseAll');
  if (clsBtn) clsBtn.classList.toggle('hidden', count === 0);

  const totalPnl = State.positions.reduce((s, p) => s + parseFloat(p.position.unrealizedPnl || 0), 0);

  /* Live-update existing DOM nodes without rebuild */
  State.positions.forEach((p, i) => {
    const pnl  = parseFloat(p.position.unrealizedPnl || 0);
    const pEl  = document.querySelector(`[data-pnl-idx="${i}"]`);
    if (pEl) {
      pEl.textContent = `${pnl >= 0 ? '+' : ''}$${fmt(pnl, 2)}`;
      pEl.className   = `pos-pnl ${pnl >= 0 ? 'pos' : 'neg'}`;
    }

    const szEl = document.querySelector(`[data-sz-idx="${i}"]`);
    if (szEl) {
      const sym    = shortCoinPos(p.position.coin);
      const a      = ASSETS[sym] || { szDp: 4, gram: false, unit: '' };
      const isGram = !!a.gram;
      const sziOz  = parseFloat(p.position.szi || 0);
      const disp   = isGram ? sziOz * TROY : sziOz;
      szEl.textContent = `${Math.abs(disp).toFixed(isGram ? 2 : a.szDp)} ${a.unit}`;
    }

    const cpEl = document.querySelector(`[data-curpx-idx="${i}"]`);
    if (cpEl) {
      const sym = shortCoinPos(p.position.coin);
      const a   = ASSETS[sym] || { pxDp: 2 };
      const cur = State.prices[sym]?.mid;
      cpEl.textContent = cur ? `$${fmt(cur, a.pxDp)}` : '—';
    }

    const otEl = document.querySelector(`[data-opentime-idx="${i}"]`);
    if (otEl) otEl.textContent = _fmtOpenTime(State._openTimes?.[p.position.coin]);
  });

  const tEl = $('totalPnl');
  if (tEl) {
    tEl.textContent = count > 0 ? `${totalPnl >= 0 ? '+' : ''}$${fmt(totalPnl, 2)}` : '';
    tEl.className   = `positions-pnl ${totalPnl >= 0 ? 'pos' : 'neg'}`;
  }

  /* ✅ Full DOM rebuild only when structure changes */
  if (fp === _posFingerprint) return;
  _posFingerprint = fp;

  const list = $('positionsList');
  if (!list) return;

  if (!count) {
    list.innerHTML = '<div class="positions-empty">📂 لا توجد صفقات مفتوحة</div>';
    if (typeof ChartModule !== 'undefined') ChartModule.refreshLines();
    return;
  }

  list.innerHTML = State.positions.map((p, i) => {
    const pos       = p.position;
    const sziOz     = parseFloat(pos.szi);
    const pnl       = parseFloat(pos.unrealizedPnl || 0);
    const sym       = shortCoinPos(pos.coin);
    const a         = ASSETS[sym] || { name: sym, unit: '', icon: '📊', pxDp: 2, szDp: 2, lev: 10 };
    const isGram    = !!a.gram;
    const sziDisp   = isGram ? sziOz * TROY : sziOz;
    const entryDisp = isGram ? parseFloat(pos.entryPx || 0) / TROY : parseFloat(pos.entryPx || 0);
    const curPx     = State.prices[sym]?.mid;
    const isLong    = sziOz > 0;
    const pCls      = pnl >= 0 ? 'pos' : 'neg';
    const tpsl      = p.tpsl || {};
    const tpDisp    = tpsl.tp ? (isGram ? tpsl.tp / TROY : tpsl.tp) : null;
    const slDisp    = tpsl.sl ? (isGram ? tpsl.sl / TROY : tpsl.sl) : null;

    return `<div class="position-item">
      <div class="pos-top">
        <div>
          <div class="pos-name" onclick="openPosDetail(${i})" role="button" tabindex="0">${a.icon} ${a.name} <span class="pos-name-hint">ⓘ</span></div>
          <div class="pos-dir ${isLong?'long':'short'}">${isLong?'▲ شراء':'▼ بيع'}</div>
        </div>
        <div class="pos-right">
          <div class="pos-pnl ${pCls}" data-pnl-idx="${i}">${pnl>=0?'+':''}$${fmt(pnl,2)}</div>
          <div class="pos-size" data-sz-idx="${i}">${Math.abs(sziDisp).toFixed(isGram?2:a.szDp)} ${a.unit}</div>
        </div>
      </div>
      <div class="pos-data-grid">
        <div class="pos-data-item">
          <span class="pos-data-label">سعر الدخول</span>
          <span class="pos-data-value">$${fmt(entryDisp,a.pxDp)}</span>
        </div>
        <div class="pos-data-item">
          <span class="pos-data-label">السعر الحالي</span>
          <span class="pos-data-value" data-curpx-idx="${i}">${curPx?`$${fmt(curPx,a.pxDp)}`:'—'}</span>
        </div>
        <div class="pos-data-item">
          <span class="pos-data-label">وقت الفتح</span>
          <span class="pos-data-value" data-opentime-idx="${i}">${_fmtOpenTime(State._openTimes?.[pos.coin])}</span>
        </div>
      </div>
      <div class="pos-tpsl-row">
        <button class="tpsl-btn ${tpDisp?'tp-set':'tp-unset'}" onclick="openTP(${i})">
          <span class="sub">🎯 جني الربح</span>
          <span class="val">${tpDisp?`$${fmt(tpDisp,a.pxDp)}`:'تعيين'}</span>
        </button>
        <button class="tpsl-btn ${slDisp?'sl-set':'sl-unset'}" onclick="openSL(${i})">
          <span class="sub">🛡 وقف الخسارة</span>
          <span class="val">${slDisp?`$${fmt(slDisp,a.pxDp)}`:'تعيين'}</span>
        </button>
      </div>
      <div class="pos-actions-row">
        <button class="btn-pos-close" onclick="askClose(${i})">إغلاق الصفقة ✕</button>
      </div>
    </div>`;
  }).join('');

  if (typeof ChartModule !== 'undefined') ChartModule.refreshLines();
}
