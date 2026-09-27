/* ═══════════════════════════════════════════════════════════════
   oc-config.js — ثوابت تطبيق أسواق التوقعات (HIP-4 Outcomes)

   ترميز الأصول (موثّق رسمياً — api/asset-ids):
     encoding  = 10 * outcome + side          (side: 0 = الجانب الأول/نعم، 1 = الثاني/لا)
     spot coin = `#${encoding}`               (l2Book / trades / allMids / الأوامر)
     token     = `+${encoding}`               (أرصدة spotClearinghouseState)
     asset id  = 100_000_000 + encoding       (إرسال الأوامر عبر /exchange)

   أسواق التوقعات ممولة بالكامل (بلا رفع مالي ولا تصفية): شراء سهم "نعم"
   بسعر p يكلّف p دولار ويُسوّى إلى 1$ إن تحقّق الحدث و0$ إن لم يتحقق.
═══════════════════════════════════════════════════════════════ */
'use strict';

const OC_API      = 'https://api.hyperliquid.xyz';
const OC_WS_URL   = 'wss://api.hyperliquid.xyz/ws';

/* أرقام سحرية للترميز */
const OC_ASSET_BASE = 100000000;

/* دقّة الأسعار والكميات بأسواق التوقعات */
const OC_PX_DP   = 5;   // السعر بين 0 و1 — 5 خانات عشرية كحد أقصى
const OC_SZ_DP   = 2;   // الكميات (عدد الأسهم)
const OC_MIN_PX  = 0.00001;
const OC_MAX_PX  = 0.99999;

/* حدود واجهة */
const OC_BOOK_ROWS   = 8;     // صفوف دفتر الأوامر بكل جانب
const OC_TRADES_ROWS = 14;    // صفوف آخر التداولات
const OC_MIN_NOTIONAL = 1;    // أدنى قيمة صفقة تقريبية بالدولار (تحقّق ودّي بالواجهة)

/* مفاتيح التخزين المحلي — منفصلة عن تطبيق HIP-3 كي لا تتعارض الإعدادات */
const OC_LS_THEME   = 'oc_theme';
const OC_LS_FAVS    = 'oc_favs_v1';
const OC_LS_LASTMKT = 'oc_last_market';
const OC_LS_SORT    = 'oc_sort_v1';

/* دوال ترميز */
function ocEnc(outcome, side)   { return 10 * Number(outcome) + Number(side ? 1 : 0); }
function ocCoin(outcome, side)  { return '#' + ocEnc(outcome, side); }
function ocToken(outcome, side) { return '+' + ocEnc(outcome, side); }
function ocAsset(outcome, side) { return OC_ASSET_BASE + ocEnc(outcome, side); }

/* فك الترميز — من coin أو token إلى {outcome, side} */
function ocDecode(name) {
  if (typeof name !== 'string') return null;
  const m = name.match(/^[#+](\d+)$/);
  if (!m) return null;
  const enc  = parseInt(m[1], 10);
  return { outcome: Math.floor(enc / 10), side: enc % 10, enc };
}

/* التصنيفات المعروضة بالواجهة */
const OC_CATEGORIES = [
  { id: 'all',     label: 'الكل',       icon: '✦' },
  { id: 'crypto',  label: 'العملات',    icon: '₿' },
  { id: 'sports',  label: 'رياضة',      icon: '⚽' },
  { id: 'econ',    label: 'اقتصاد',     icon: '🏦' },
  { id: 'company', label: 'شركات',      icon: '🏢' },
  { id: 'other',   label: 'أخرى',       icon: '◇' }
];
