/* ═══════════════════════════════════════
   state.js — الحالة العامة للتطبيق
═══════════════════════════════════════ */
'use strict';

const State = {
  /* المحفظة والأصل الحالي */
  wallet: null,
  asset:  'CL',
  qty:    0.1,

  /* أسعار الأصول */
  prices: {
    XAU:    { bid:0, ask:0, mid:0 },
    NQ:     { bid:0, ask:0, mid:0 },
    GOLD:   { bid:0, ask:0, mid:0 },
    SILVER: { bid:0, ask:0, mid:0 },
    CL:     { bid:0, ask:0, mid:0 }
  },
  prevMid:    { XAU:0, NQ:0, GOLD:0, SILVER:0, CL:0 },
  prevDayPx:  { XAU:0, NQ:0, GOLD:0, SILVER:0, CL:0 },

  /* بيانات الحساب */
  fundingRates: {},
  positions:    [],
  openOrders:   [],
  balance:      null,

  /* مؤقتات */
  timers:        [],
  priceTimer:    null,
  _balTimer:     null,
  _clockTimer:   null,
  _fundingTimer: null,
  _sessionTimer: null,

  /* صفقات معلقة */
  pendingTrade: null,
  pendingClose: null,
  pendingTP:    null,
  pendingSL:    null,

  /* PIN وقفل */
  lastPinTime:         0,
  pinCallback:         null,
  isLocked:            false,
  currentPinInput:     '',
  currentSetPinInput:  '',

  /* إحالة */
  referrerSet: false,

  /* إحصائيات الجلسة */
  sessionStats: { XAU:null, NQ:null, GOLD:null, SILVER:null, CL:null }
};
