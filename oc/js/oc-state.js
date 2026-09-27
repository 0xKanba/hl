/* ═══════════════════════════════════════════════════════════════
   oc-state.js — الحالة المركزية لتطبيق أسواق التوقعات

   كل ملفات /oc/js تقرأ وتكتب هنا فقط (بلا حالة مبثوثة بالوحدات)،
   وState الخاصة بطبقة المحفظة/الاتصال (core/state.js) تبقى كما هي
   بلا تعديل — OcState طبقة فوقها لا بديلة عنها.
═══════════════════════════════════════════════════════════════ */
'use strict';

const OcState = {
  /* الميتاداتا المبنية (راجع oc-meta.js) */
  model:      null,          // { markets, byOutcome, outcomes, coins }
  loaded:     false,
  metaError:  null,

  /* أسعار مباشرة: coin → { mid, bid, ask, prev } */
  px:         Object.create(null),

  /* دفتر أوامر السوق المفتوح: coin → { bids:[], asks:[], time } */
  book:       Object.create(null),
  trades:     [],            // آخر التداولات للسوق المفتوح

  /* الأرصدة: token(+enc) → { total, hold } */
  shares:     Object.create(null),
  usdc:       0,
  usdcHold:   0,

  openOrders: [],            // أوامر مفتوحة على أسواق التوقعات فقط
  fills:      [],            // آخر التنفيذات

  /* تصفّح */
  view:       'markets',     // markets | market | portfolio
  category:   'all',
  query:      '',
  sort:       'time',        // time | volume | price
  favs:       new Set(),

  /* السوق المفتوح */
  active:     null,          // مرجع لعنصر markets
  activeOutcome: null,       // النتيجة المختارة داخل السؤال
  activeSide: 0,             // 0 = الجانب الأول (نعم) ، 1 = لا

  /* تذكرة الأمر */
  ticket: {
    dir:    'buy',           // buy | sell
    type:   'market',        // market | limit
    px:     '',
    sz:     '',
    usd:    '',
    mode:   'usd'            // usd = المستخدم يدخل بالدولار ، sz = بعدد الأسهم
  },

  /* اشتراكات نشطة للسوق المفتوح — تُلغى عند الخروج */
  _subs: []
};

/* ════ مفضلات ════ */
function ocLoadFavs() {
  try {
    const raw = JSON.parse(localStorage.getItem(OC_LS_FAVS) || '[]');
    OcState.favs = new Set(Array.isArray(raw) ? raw : []);
  } catch { OcState.favs = new Set(); }
}
function ocSaveFavs() {
  try { localStorage.setItem(OC_LS_FAVS, JSON.stringify([...OcState.favs])); } catch {}
}
function ocToggleFav(id) {
  if (OcState.favs.has(id)) OcState.favs.delete(id); else OcState.favs.add(id);
  ocSaveFavs();
}

/* ════ إلغاء اشتراكات السوق المفتوح ════ */
function ocClearSubs() {
  OcState._subs.forEach(fn => { try { fn(); } catch {} });
  OcState._subs = [];
}
