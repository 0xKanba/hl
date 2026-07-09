/* ═══════════════════════════════════════
   state.js — الحالة العامة للتطبيق
═══════════════════════════════════════ */
'use strict';

const State = {
  /* المحفظة والأصل الحالي */
  wallet: null,
  agent:  null,   /* ✅ جديد — ethers.Wallet محلي، صلاحية تداول فقط، راجع ensureAgent() بـ auth.js */
  asset:  'CL',
  qty:    0.1,
  isGuest: true,

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
  sessionStats: { XAU:null, NQ:null, GOLD:null, SILVER:null, CL:null },

  /* ✅ حماية الصفقات من الاختفاء
     _lastOptimisticClose : timestamp آخر إغلاق — guard 20 ثانية
     _emptyPosCount       : عداد استجابات API فارغة (يتطلب 2 متتاليتين)
     _closedCoins         : ✅ FIX — قائمة الـ coins التي أُغلقت optimistically
                            تُفلتر من rawPos أثناء نافذة الحماية
                            لمنع إعادة ظهور الصفقة كـ "ghost position"
  */
  _lastOptimisticClose: 0,
  _emptyPosCount:       0,
  _closedCoins:         [],   /* coin strings e.g. ['xyz:CL', 'xyz:GOLD'] */

  /* اتصال Hyperliquid */
  wsConnected: false
};
