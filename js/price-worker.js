/**
 * Web Worker for Price Calculations
 * حسابات الأسعار والـ PnL في thread منفصل
 * ✅ UI يبقى سلس حتى مع حسابات ثقيلة
 */

// استقبال الرسائل من الـ main thread
self.onmessage = (event) => {
  const { type, data } = event.data;

  switch (type) {
    case 'calculate-pnl':
      calculatePnL(data);
      break;

    case 'calculate-delta':
      calculateDelta(data);
      break;

    case 'batch-calculations':
      batchCalculations(data);
      break;

    default:
      console.error('❌ نوع رسالة غير معروف:', type);
  }
};

// ✅ حساب PnL للصفقات
function calculatePnL(data) {
  const { positions, prices } = data;

  const results = positions.map(pos => {
    const currentPrice = prices[pos.asset];
    if (!currentPrice) {
      return {
        id: pos.id,
        pnl: 0,
        pnlPercent: 0,
        status: 'error'
      };
    }

    const priceDifference = currentPrice - pos.entryPrice;
    const pnl = priceDifference * pos.size;
    const pnlPercent = (priceDifference / pos.entryPrice) * 100;

    return {
      id: pos.id,
      asset: pos.asset,
      pnl: parseFloat(pnl.toFixed(2)),
      pnlPercent: parseFloat(pnlPercent.toFixed(4)),
      currentPrice: currentPrice,
      direction: pnl > 0 ? 'pos' : pnl < 0 ? 'neg' : 'neutral',
      fundingPnL: pos.fundingPnL || 0
    };
  });

  // حساب إجمالي PnL
  const totalPnL = results.reduce((sum, r) => sum + r.pnl, 0);

  self.postMessage({
    type: 'pnl-update',
    data: {
      positions: results,
      totalPnL: parseFloat(totalPnL.toFixed(2))
    }
  });
}

// ✅ حساب التغير في السعر
function calculateDelta(data) {
  const { currentPrice, previousPrice, asset } = data;

  const delta = currentPrice - previousPrice;
  const deltaPercent = (delta / previousPrice) * 100;

  self.postMessage({
    type: 'delta-update',
    data: {
      asset,
      delta: parseFloat(delta.toFixed(2)),
      deltaPercent: parseFloat(deltaPercent.toFixed(4)),
      direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'neutral'
    }
  });
}

// ✅ حسابات متعددة في دفعة واحدة
function batchCalculations(data) {
  const { operations } = data;
  const results = [];

  operations.forEach(op => {
    let result;

    if (op.type === 'pnl') {
      const priceDiff = op.currentPrice - op.entryPrice;
      result = {
        id: op.id,
        pnl: priceDiff * op.size,
        type: 'pnl'
      };
    } else if (op.type === 'delta') {
      result = {
        asset: op.asset,
        delta: op.currentPrice - op.previousPrice,
        type: 'delta'
      };
    }

    results.push(result);
  });

  self.postMessage({
    type: 'batch-results',
    data: results
  });
}
