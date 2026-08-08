/* ═══════════════════════════════════════
   state.js — الحالة العامة للتطبيق
═══════════════════════════════════════ */
'use strict';

const State = {
  wallet: null,
  agent:  null,
  asset:  'CL',
  qty:    0.1,
  isGuest: true,

  prices: {
    XAU:    { bid:0, ask:0, mid:0 },
    NQ:     { bid:0, ask:0, mid:0 },
    GOLD:   { bid:0, ask:0, mid:0 },
    SILVER: { bid:0, ask:0, mid:0 },
    CL:     { bid:0, ask:0, mid:0 }
  },
  prevMid:    { XAU:0, NQ:0, GOLD:0, SILVER:0, CL:0 },
  prevDayPx:  { XAU:0, NQ:0, GOLD:0, SILVER:0, CL:0 },
  /* ✅ جديد — PerpsAssetCtx كامل لكل رمز (funding/openInterest/markPx/oraclePx/midPx)
     يُغذّى حياً من اشتراك activeAssetCtx — بديل metaAndAssetCtxs المتكرر كل 60 ثانية */
  assetCtx: { XAU:null, NQ:null, GOLD:null, SILVER:null, CL:null },

  /* بيانات الحساب */
  fundingRates: {},
  positions:    [],
  openOrders:   [],
  balance:      null,
  /* ✅ جديد — نسخة حية من آخر ~300 fill (WsUserFills) — مصدر وحيد لاشتقاق
     وقت فتح الصفقة/آخر تنفيذ/Order ID/Trade ID/Hash — راجع positions.js:mergeFillData */
  fillsCache:   [],

  /* مؤقتات (ما تبقى بعد إزالة polling) */
  timers:        [],
  priceTimer:    null,
  _balTimer:     null,
  _clockTimer:   null,
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

  _lastOptimisticClose: 0,
  _emptyPosCount:       0,
  _closedCoins:         [],

  /* اتصال Hyperliquid (الآن اتصال واحد مشترك — راجع ws.js) */
  wsConnected: false
};
