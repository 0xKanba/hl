/* ═══════════════════════════════════════
   ws.js — WebSocket BBO (أسعار لحظية)
   ✅ يُحدِّث State.wsConnected عند كل حدث
   ✅ يستدعي updateConnectBtn فوراً
═══════════════════════════════════════ */
'use strict';

let _mainWs = null;
let _mainWsReconTimer = null;

/* ════ تحديث تاب السعر ════ */
function _updateTab(sym, mid, dp) {
  const el = $(`price${sym}`);
  if (!el) return;
  const dir = mid > State.prevMid[sym] ? 'up' : mid < State.prevMid[sym] ? 'dn' : '';
  el.textContent = fmt(mid, dp);
  el.className = `tab-price${dir ? ' ' + dir : ''}`;
  if (dir) setTimeout(() => el.className = 'tab-price', 800);
}

/* ════ معالجة BBO ════ */
function _onWsBbo(data) {
  const coin = data.coin || '';
  const raw  = coin.includes(':') ? coin.split(':')[1] : coin;
  const bid  = parseFloat(data.bbo?.[0]?.px || 0);
  const ask  = parseFloat(data.bbo?.[1]?.px || 0);
  const mid  = (bid && ask) ? (bid + ask) / 2 : (bid || ask);
  if (!mid) return;

  if (raw === 'GOLD') {
    State.prices['GOLD'] = { bid, ask, mid };
    _updateTab('GOLD', mid, ASSETS['GOLD'].pxDp);
    State.prevMid['GOLD'] = mid;
    if (State.asset === 'GOLD') updatePriceUI();

    const gm = mid / TROY, gBid = bid / TROY, gAsk = ask / TROY;
    State.prices['XAU'] = { bid: gBid, ask: gAsk, mid: gm };
    _updateTab('XAU', gm, ASSETS['XAU'].pxDp);
    State.prevMid['XAU'] = gm;
    if (State.asset === 'XAU') updatePriceUI();
    return;
  }

  const sym = COIN_TO_SYM[raw] || raw;
  if (!ASSETS[sym]) return;
  State.prices[sym] = { bid, ask, mid };
  _updateTab(sym, mid, ASSETS[sym].pxDp);
  State.prevMid[sym] = mid;
  if (sym === State.asset) updatePriceUI();
}

/* ════ اتصال WS رئيسي ════ */
function startMainWs() {
  wsMainClose();
  try {
    _mainWs = new WebSocket('wss://api.hyperliquid.xyz/ws');

    _mainWs.onopen = () => {
      if (!_mainWs) return;
      const seen = new Set();
      Object.values(ASSETS).forEach(a => {
        if (!seen.has(a.coin)) {
          seen.add(a.coin);
          _mainWs.send(JSON.stringify({
            method: 'subscribe',
            subscription: { type: 'bbo', coin: a.coin }
          }));
        }
      });
      /* ✅ متصل بـ Hyperliquid */
      State.wsConnected = true;
      updateConnectBtn();
    };

    _mainWs.onmessage = e => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.channel === 'bbo' && msg.data) _onWsBbo(msg.data);
      } catch {}
    };

    _mainWs.onerror = () => {
      State.wsConnected = false;
      updateConnectBtn();
    };

    _mainWs.onclose = () => {
      State.wsConnected = false;
      updateConnectBtn();
      /* إعادة الاتصال دائماً */
      _mainWsReconTimer = setTimeout(startMainWs, 4000);
    };

  } catch (e) {
    console.warn('[WS]', e.message);
    State.wsConnected = false;
    updateConnectBtn();
  }
}

function wsMainClose() {
  clearTimeout(_mainWsReconTimer);
  if (_mainWs) {
    try { _mainWs.close(); } catch {}
    _mainWs = null;
  }
  State.wsConnected = false;
}
