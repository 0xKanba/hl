/* ═══════════════════════════════════════
   prices.js — جلب الأسعار وتحديث الواجهة
   ✅ كل سعر يُحدَّث فور وصوله بدون انتظار
═══════════════════════════════════════ */
'use strict';

let _ctxCounter = 0;

/* ════ الأصول الفريدة (GOLD يغطي XAU) ════ */
function _uniqueCoins() {
  const out = {};
  Object.keys(ASSETS).forEach(sym => {
    if (sym === 'XAU') return;
    const c = ASSETS[sym].coin;
    if (!out[c]) out[c] = sym;
  });
  return out;
}

/* ════ تحديث سعر واحد في State + UI ════ */
function _applyPrice(sym, bid, ask) {
  const mid = (bid && ask) ? (bid + ask) / 2 : 0;
  if (!mid) return;

  if (sym === 'GOLD') {
    State.prices['GOLD'] = { bid, ask, mid };
    _updateTab('GOLD', mid, ASSETS['GOLD'].pxDp);
    State.prevMid['GOLD'] = mid;
    if (State.asset === 'GOLD') updatePriceUI();

    const gm = mid / TROY;
    State.prices['XAU'] = { bid:bid/TROY, ask:ask/TROY, mid:gm };
    _updateTab('XAU', gm, ASSETS['XAU'].pxDp);
    State.prevMid['XAU'] = gm;
    if (State.asset === 'XAU') updatePriceUI();
  } else {
    State.prices[sym] = { bid, ask, mid };
    _updateTab(sym, mid, ASSETS[sym].pxDp);
    State.prevMid[sym] = mid;
    if (sym === State.asset) updatePriceUI();
  }
}

/* ════ جلب الأسعار (كل 2 ثانية) ════
   كل عملة مستقلة — تُحدِّث UI فور وصولها
   لا await مشترك = لا تأخير بسبب عملة بطيئة
*/
function pollPrices() {
  /* prevDayPx كل 30 ثانية */
  if (_ctxCounter % 15 === 0) {
    hlInfo({ type:'metaAndAssetCtxs', dex:'xyz' })
      .then(xyz => {
        if (!Array.isArray(xyz) || !xyz[1]) return;
        xyz[0].universe.forEach((u, i) => {
          const r    = u.name.includes(':') ? u.name.split(':')[1] : u.name;
          const prev = parseFloat(xyz[1][i].prevDayPx || 0);
          if (!prev) return;
          if (r === 'GOLD') {
            State.prevDayPx['GOLD'] = prev;
            State.prevDayPx['XAU']  = prev / TROY;
            return;
          }
          const sym = COIN_TO_SYM[r] || r;
          if (ASSETS[sym]) State.prevDayPx[sym] = prev;
        });
      })
      .catch(() => {});
  }
  _ctxCounter++;

  /* كل عملة تُجلب بشكل مستقل */
  Object.entries(_uniqueCoins()).forEach(([coinStr, sym]) => {
    hlInfo({ type:'l2Book', coin:coinStr })
      .then(lb => {
        const bid = parseFloat(lb.levels?.[0]?.[0]?.px || 0);
        const ask = parseFloat(lb.levels?.[1]?.[0]?.px || 0);
        _applyPrice(sym, bid, ask);
        saveQuickState();
      })
      .catch(() => {});
  });
}

/* ════ تحديث واجهة السعر الرئيسي ════ */
function updatePriceUI() {
  const a = ASSETS[State.asset];
  const p = State.prices[State.asset];
  if (!p || !p.mid) return;

  const prev = State.prevMid[State.asset];
  const dir  = p.mid > prev ? 1 : p.mid < prev ? -1 : 0;
  const cls  = dir > 0 ? 'up' : dir < 0 ? 'dn' : 'n';

  $('priceCard').className = `price-card${dir > 0 ? ' up' : dir < 0 ? ' dn' : ''}`;
  setText('priceValue', fmt(p.mid, a.pxDp), `price-value ${cls}`);
  setTxt('buyPrice',  fmt(p.mid, a.pxDp));
  setTxt('sellPrice', fmt(p.mid, a.pxDp));

  /* تغيير 24 ساعة */
  const prevDay = State.prevDayPx[State.asset];
  if (prevDay > 0) {
    const chg = ((p.mid - prevDay) / prevDay) * 100;
    setText('priceDelta',
      `تغيير 24 ساعة: ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`,
      `price-delta ${chg > 0 ? 'up' : chg < 0 ? 'dn' : 'n'}`
    );
  }

  if (p.bid && p.ask)
    setTxt('priceBidAsk', `شراء ${fmt(p.bid, a.pxDp)} · بيع ${fmt(p.ask, a.pxDp)}`);

  State.prevMid[State.asset] = p.mid;
  updateSessionUI();

  /* مؤقت الثانية */
  let s = 1;
  clearInterval(State.priceTimer);
  setTxt('priceTimer', `↻ ${s}s`);
  State.priceTimer = setInterval(() => { s++; setTxt('priceTimer', `↻ ${s}s`); }, 1000);

  /* معاينة TP/SL */
  if (typeof recalcTpPreview === 'function') recalcTpPreview();
  if (typeof recalcSlPreview === 'function') recalcSlPreview();
}
