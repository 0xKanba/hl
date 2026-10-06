/* ═══════════════════════════════════════
   state.js — الحالة العامة للتطبيق
   ✅ pendingTrade حُذف (كان حصرياً لـaskTrade/execTrade القديمتين
      بtrading.js، حُذفتا معاً). js/order/* يحمل حالته الخاصة (OM).
═══════════════════════════════════════ */
'use strict';

const State = {
  wallet: null,
  agent:  null,
  asset:  'CL',
  qty:    0.1,
  isGuest: true,
  /* إشارة "قرار الهوية اتّخذ" (ضيف أم متصل)، تُضبط true متزامناً بأول
     سطرين من كل مسار إقلاع — يستهلكها lastplace.js. */
  _identityReady: false,

  prices: {
    XAU:    { bid:0, ask:0, mid:0 },
    NQ:     { bid:0, ask:0, mid:0 },
    GOLD:   { bid:0, ask:0, mid:0 },
    SILVER: { bid:0, ask:0, mid:0 },
    CL:     { bid:0, ask:0, mid:0 }
  },
  prevMid:    { XAU:0, NQ:0, GOLD:0, SILVER:0, CL:0 },
  prevDayPx:  { XAU:0, NQ:0, GOLD:0, SILVER:0, CL:0 },
  /* PerpsAssetCtx حي لكل رمز (funding/OI/markPx/oraclePx/prevDayPx) */
  assetCtx: { XAU:null, NQ:null, GOLD:null, SILVER:null, CL:null },

  /* بيانات الحساب */
  fundingRates: {},
  positions:    [],
  openOrders:   [],
  balance:      null,
  /* آخر ~300 fill حي — مصدر وقت فتح الصفقة/Order ID/Trade ID/Hash */
  fillsCache:   [],

  timers:        [],
  priceTimer:    null,
  _balTimer:     null,
  _clockTimer:   null,
  _sessionTimer: null,

  pendingClose: null,
  pendingTP:    null,
  pendingSL:    null,

  lastPinTime:         0,
  pinCallback:         null,
  isLocked:            false,
  currentPinInput:     '',
  currentSetPinInput:  '',

  referrerSet: false,

  sessionStats: { XAU:null, NQ:null, GOLD:null, SILVER:null, CL:null },

  _lastOptimisticClose: 0,
  _emptyPosCount:       0,
  _closedCoins:         [],

  /* اتصال Hyperliquid الموحّد (ws.js) */
  wsConnected: false
};
