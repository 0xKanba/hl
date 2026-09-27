/* ═══════════════════════════════════════════════════════════════
   oc-book.js — دفتر الأوامر وآخر التداولات للسوق/الجانب المفتوح

   يشترك بـ l2Book و trades لعملة الجانب المختار (`#enc`) فقط، ويُلغي
   الاشتراك فوراً عند تغيير الجانب/النتيجة أو الخروج من السوق —
   لا اشتراكات متراكمة.

   العرض: الأسعار كنِسب مئوية (احتمال) + الكميات بعدد الأسهم + القيمة
   التقريبية بالدولار (px * sz) لأن كل سهم يُسوّى إلى 1$ أو 0$.
═══════════════════════════════════════════════════════════════ */
'use strict';

const OcBook = (function () {

  let _coin = null;
  let _unsubs = [];
  let _raf = null;

  function open(coin) {
    if (_coin === coin) return;
    close();
    _coin = coin;
    OcState.book[coin] = { bids: [], asks: [], time: 0 };
    OcState.trades = [];
    render();

    _unsubs.push(HL.subscribe({ type: 'l2Book', coin }, d => {
      const lv = d.levels || [];
      OcState.book[coin] = {
        bids: (lv[0] || []).slice(0, OC_BOOK_ROWS * 3),
        asks: (lv[1] || []).slice(0, OC_BOOK_ROWS * 3),
        time: d.time || Date.now()
      };
      _schedule();
    }));

    _unsubs.push(HL.subscribe({ type: 'trades', coin }, arr => {
      if (!Array.isArray(arr) || !arr.length) return;
      OcState.trades = [...arr.slice().reverse(), ...OcState.trades].slice(0, OC_TRADES_ROWS);
      _schedule();
    }));
  }

  function close() {
    _unsubs.forEach(u => { try { u(); } catch {} });
    _unsubs = [];
    _coin = null;
  }

  function _schedule() {
    if (_raf) return;
    _raf = requestAnimationFrame(() => { _raf = null; render(); });
  }

  /* ════ الرسم ════ */
  function render() {
    const bookEl   = oc$('ocBookRows');
    const tradesEl = oc$('ocTradeRows');
    if (!bookEl) return;

    const b = (_coin && OcState.book[_coin]) || { bids: [], asks: [] };
    const asks = (b.asks || []).slice(0, OC_BOOK_ROWS).reverse();
    const bids = (b.bids || []).slice(0, OC_BOOK_ROWS);

    const maxSz = Math.max(
      1e-9,
      ...asks.map(l => parseFloat(l.sz) || 0),
      ...bids.map(l => parseFloat(l.sz) || 0)
    );

    const row = (l, side) => {
      const px = parseFloat(l.px), sz = parseFloat(l.sz);
      const w  = Math.min(100, (sz / maxSz) * 100);
      return `<div class="oc-book-row ${side}">
        <span class="oc-bk-bar" style="width:${w.toFixed(1)}%"></span>
        <span class="oc-bk-px">${ocPct(px, 1)}</span>
        <span class="oc-bk-sz">${ocFmt(sz, 2)}</span>
        <span class="oc-bk-usd">${ocUsd(px * sz)}</span>
      </div>`;
    };

    if (!asks.length && !bids.length) {
      bookEl.innerHTML = '<div class="oc-empty">لا توجد أوامر معروضة حالياً</div>';
    } else {
      const bestAsk = asks.length ? parseFloat(asks[asks.length - 1].px) : null;
      const bestBid = bids.length ? parseFloat(bids[0].px) : null;
      const spread  = (bestAsk != null && bestBid != null) ? bestAsk - bestBid : null;
      const midTxt  = (bestAsk != null && bestBid != null) ? ocPct((bestAsk + bestBid) / 2, 1) : '—';
      bookEl.innerHTML =
        asks.map(l => row(l, 'ask')).join('') +
        `<div class="oc-book-mid">
           <span class="oc-bm-mid">${midTxt}</span>
           <span class="oc-bm-sp">${spread != null ? 'الفرق ' + (spread * 100).toFixed(2) + '¢' : ''}</span>
         </div>` +
        bids.map(l => row(l, 'bid')).join('');
    }

    if (tradesEl) {
      tradesEl.innerHTML = OcState.trades.length
        ? OcState.trades.map(t => {
            const px = parseFloat(t.px), sz = parseFloat(t.sz);
            const up = t.side === 'B';
            const d  = new Date(t.time);
            const hh = String(d.getHours()).padStart(2, '0');
            const mm = String(d.getMinutes()).padStart(2, '0');
            const ss = String(d.getSeconds()).padStart(2, '0');
            return `<div class="oc-trade-row ${up ? 'buy' : 'sell'}">
              <span class="oc-tr-px">${ocPct(px, 1)}</span>
              <span class="oc-tr-sz">${ocFmt(sz, 2)}</span>
              <span class="oc-tr-t">${hh}:${mm}:${ss}</span>
            </div>`;
          }).join('')
        : '<div class="oc-empty">لا تداولات بعد</div>';
    }
  }

  return { open, close, render, coin: () => _coin };
})();
