/* ═══════════════════════════════════════
   config.js — ثوابت وإعدادات المشروع
═══════════════════════════════════════ */
'use strict';

const TROY = 31.1035;

const HL_API  = 'https://api.hyperliquid.xyz';
const ARB_RPC = 'https://arb1.arbitrum.io/rpc';

/* ⚠️ CRITICAL FIX — كان العنوانان أدناه خاطئين تماماً (لا يطابقان أي
   عقد حقيقي على Arbitrum) قبل هذا الإصلاح:
   - USDC_CA يجب أن يكون عقد USDC الأصلي (native) على Arbitrum One.
   - BRDG_CA يجب أن يكون عقد Bridge2 الرسمي لـHyperliquid.
   تم التحقق من كليهما مقابل توثيق Hyperliquid الرسمي مباشرة
   (hyperliquid-docs/for-developers/api/bridge2) وArbiscan:
   https://arbiscan.io/address/0x2df1c51e09aecf9cacb7bc98cb1742757f163df7
   راجع أيضاً doDeposit بـaccount.js — الإيداع أصبح تحويل ERC20 مباشر
   لعنوان الجسر (لا يوجد approve ولا دالة deposit() منفصلة؛ Bridge2
   يعتمد على مراقبة تحويلات USDC الواردة وتزكيتها للمُرسِل خلال دقيقة). */
const USDC_CA = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const BRDG_CA = '0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7';

/* ✅ HIP-3 dex هذا المشروع يتداول عليه — كل الأصول مُعرَّفة بادئة `${HL_DEX}:`
   تغيير هذا الثابت وحده كافٍ لتحويل التطبيق لأي HIP-3 dex آخر لاحقاً.
   السلسلة الفارغة '' تعني "أول perp dex" (Main Perps) حسب توثيق Hyperliquid. */
const HL_DEX = 'xyz';

/* رسوم السحب — رسم بروتوكول Hyperliquid نفسه (يُخصم آلياً عند معالجة
   withdraw3)، ليست رسوماً يجمعها هذا التطبيق. $1 مؤكَّد من توثيق
   Hyperliquid الرسمي (bridge2/exchange-endpoint، الحد الأدنى للسحب $2
   يطابق "رسم $1 ثابت + $1 صافي على الأقل"). راجع التوثيق دورياً بدل
   تغيير هذا الرقم يدوياً بلا تأكيد.
   ثابت واحد فقط بدل تكراره بعدة ملفات — استخدمه دائماً، لا رقماً حرفياً. */
const WITHDRAW_FEE_USDC = 1;

/* مفاتيح localStorage */
const LS_KEY        = 'hl_trade_pk';
const PIN_KEY       = 'hl_trade_pin';
const LOCKED_KEY    = 'hl_trade_locked';
const LAST_PIN_KEY  = 'hl_last_pin_time';
const QSTATE_KEY    = 'hl_qstate_v1';
const OPENTIME_KEY  = 'hl_position_opens';
const PRIVY_FLAG_KEY = 'hl_privy_connected';
const EXTWALLET_FLAG_KEY = 'hl_extwallet_connected';
/* ✅ جديد — آخر "مكان" كان فيه المستخدم (الشاشة/الأصل/نافذة الدرج
   المفتوحة إن وُجدت) — راجع js/lastplace.js لمنطق الحفظ/الاستعادة. */
const LASTPLACE_KEY = 'hl_last_place';

/* تعريف الأصول */
const ASSETS = {
  XAU:    { coin:'xyz:GOLD',   idx:110003, lev:25, cross:true,  szDp:4, pxDp:2, unit:'غرام',  presets:[1,2,5,10,20,50],  icon:'⚖️',  name:'ذهب/غرام',      gram:true },
  NQ:     { coin:'xyz:XYZ100', idx:110000, lev:30, cross:true,  szDp:4, pxDp:2, unit:'عقد',   presets:[0.1,0.5,1,2,5],   icon:'📊', name:'ناسداك 100' },
  GOLD:   { coin:'xyz:GOLD',   idx:110003, lev:25, cross:true,  szDp:4, pxDp:2, unit:'أونصة', presets:[0.1,0.5,1,2,5],   icon:'🟡', name:'ذهب (أونصة)' },
  SILVER: { coin:'xyz:SILVER', idx:110026, lev:25, cross:true,  szDp:3, pxDp:3, unit:'أونصة', presets:[1,2,3,5,8,10,20], icon:'⚪', name:'فضة' },
  CL:     { coin:'xyz:CL',     idx:110029, lev:20, cross:true, szDp:3, pxDp:3, unit:'برميل', presets:[1,2,3,5,8,10,20], icon:'🛢',  name:'نفط خام' }
};

/* صور الأصول */
const ASSET_IMAGES = {
  XAU:    '/images/gold.svg',
  NQ:     '/images/100.png',
  GOLD:   '/images/gold.svg',
  SILVER: '/images/silver.svg',
  CL:     '/images/oil.svg'
};

/* خريطة coin → symbol */
const COIN_TO_SYM = {};
Object.entries(ASSETS).forEach(([sym, a]) => {
  if (sym === 'XAU') return; // XAU مشتق من GOLD — يُعالج يدوياً
  const raw = a.coin.includes(':') ? a.coin.split(':')[1] : a.coin;
  COIN_TO_SYM[raw] = sym;
  COIN_TO_SYM[sym] = sym;
});
COIN_TO_SYM['XAU'] = 'XAU';

/* رسوم التداول حسب الأصل */
function feeRate(sym)    { return (sym === 'GOLD' || sym === 'XAU') ? 0.0009  : 0.00009; }
function feeRatePct(sym) { return (sym === 'GOLD' || sym === 'XAU') ? '0.09%' : '0.009%'; }
