/* ═══════════════════════════════════════
   config.js — ثوابت وإعدادات المشروع
═══════════════════════════════════════ */
'use strict';

const TROY = 31.1035;

const HL_API  = 'https://api.hyperliquid.xyz';
const ARB_RPC = 'https://arb1.arbitrum.io/rpc';
const USDC_CA = '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8';
const BRDG_CA = '0x2Df1c51E09aECF9d2B5688B5c82A9bBDE18B9494';

/* مفاتيح localStorage */
const LS_KEY       = 'hl_trade_pk';
const PIN_KEY      = 'hl_trade_pin';
const LOCKED_KEY   = 'hl_trade_locked';
const LAST_PIN_KEY = 'hl_last_pin_time';
const QSTATE_KEY   = 'hl_qstate_v1';

/* تعريف الأصول */
const ASSETS = {
  XAU:    { coin:'xyz:GOLD',   idx:110003, lev:25, cross:true,  szDp:4, pxDp:2, unit:'غرام',  presets:[1,2,5,10,20,50],  icon:'⚖️',  name:'ذهب/غرام',      gram:true },
  NQ:     { coin:'xyz:XYZ100', idx:110000, lev:30, cross:true,  szDp:4, pxDp:0, unit:'عقد',   presets:[0.1,0.5,1,2,5],   icon:'📊', name:'ناسداك 100' },
  GOLD:   { coin:'xyz:GOLD',   idx:110003, lev:25, cross:true,  szDp:4, pxDp:0, unit:'أونصة', presets:[0.1,0.5,1,2,5],   icon:'🟡', name:'ذهب (أونصة)' },
  SILVER: { coin:'xyz:SILVER', idx:110026, lev:25, cross:true,  szDp:2, pxDp:2, unit:'أونصة', presets:[1,2,3,5,8,10,20], icon:'⚪', name:'فضة' },
  CL:     { coin:'xyz:CL',     idx:110029, lev:20, cross:false, szDp:3, pxDp:2, unit:'برميل', presets:[1,2,3,5,8,10,20], icon:'🛢',  name:'نفط خام' }
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
