/* ═══════════════════════════════════════════════════════════════
   oc-shims.js — جسر التوافق مع طبقة الاتصال المنسوخة كما هي

   ملفات /oc/js/core/*.js منسوخة حرفياً من المشروع الأصلي (HIP-3) بلا
   أي تعديل، لذلك تنادي أسماءً كانت تعيش بملفات خاصة بالمراكز/الرافعة
   (prices.js / positions.js / session.js / chart) — لا وجود لها هنا
   ولا معنى لها بأسواق التوقعات (ممولة بالكامل، بلا هامش ولا تصفية).

   هذا الملف يوفّرها كدوال صامتة أو موجّهة لمكافئها بأسواق التوقعات،
   فيبقى core بلا لمس (تحديثه مستقبلاً = نسخ الملف مجدداً فقط).
═══════════════════════════════════════════════════════════════ */
'use strict';

/* ════ الأسعار/الجلسة (HIP-3) — لا مقابل لها هنا ════ */
function initPriceFeeds()      { /* أسعار التوقعات تُدار بـOcPrices */ }
function startSessionPolling() { /* لا إحصائيات جلسة بأسواق التوقعات */ }
function fetchSessionStats()   {}
function updateSessionUI()     {}
function saveQuickState()      {}
function loadQuickState()      {}

/* ════ المراكز (HIP-3) — أسواق التوقعات تملك أسهماً لا مراكز رافعة ════ */
function renderPositions()          { if (typeof OcUI !== 'undefined' && OcState.view === 'portfolio') OcUI.renderPortfolio(); }
function resetPosFingerprint()      {}
function mergeFillData(pos)         { return pos || []; }
function parseTpslFromOrders()      { return { tp: null, sl: null }; }
function updateFundingFromPositions() {}

/* ════ تبديل الأصل (HIP-3) — المكافئ هنا هو فتح سوق توقّع ════ */
function switchAsset() { /* لا أصول ثابتة هنا — الأسواق تُبنى من outcomeMeta */ }

/* ════ شاشة التداول القديمة — لا وجود لها ════ */
const OrderModule = { open() {}, close() {} };
