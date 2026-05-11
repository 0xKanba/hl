/* ═══════════════════════════════════════
   state.js — الحالة العامة للتطبيق
═══════════════════════════════════════ */
'use strict';

const State = {
  wallet: null,
  asset:  'CL',
  qty:    0.1,

  prices: {
    XAU:    { bid:0, ask:0, mid:0 },
    NQ:     { bid:0, ask:0, mid:0 },
    GOLD:   { bid:0, ask:0, mid:0 },
    SILVER: { bid:0, ask:0, mid:0 },
    CL:     { bid:0, ask:0, mid:0 }
  },
  prevMid:    { XAU:0, NQ:0, GOLD:0, SILVER:0, CL:0 },
  prevDayPx:  { XAU:0, NQ:0, GOLD:0, SILVER:0, CL:0 },

  fundingRates: {},
  positions:    [],
  openOrders:   [],
  balance:      null,

  timers:        [],
  priceTimer:    null,
  _balTimer:     null,
  _clockTimer:   null,
  _fundingTimer: null,
  _sessionTimer: null,

  pendingTrade: null,
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

  /* ✅ يحمي التحديث الـ optimistic من الكتابة فوقه */
  _lastOptimisticClose: 0
};
