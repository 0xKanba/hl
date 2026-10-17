/* ═══════════════════════════════════════════════════════════════
   js/chart/ui.js — واجهة شاشة الرسم: CSS + DOM + السعر/PnL + BBO +
   الحفظ التلقائي + القوالب المحلية + خطوط الصفقات + لوحة التداول.

   ✅ ما الجديد بهذه الجولة:
      • سطر الأطر الزمنية بالعربية (1د 5د 15د … يوم أسبوع) بدل شريط
        TradingView العلوي — الرسم نظيف: شموع + سعر + زمن فقط.
      • قائمة ⚙: وضع الأدوات المتقدّمة · التنفيذ الفوري · القوالب
        المحلية (حفظ/تطبيق/حذف) · إعادة ضبط الرسم.
      • شريط الإسناد الإجباري (Charts powered by TradingView) أسفل
        الرسم مباشرة — شريط 18px ثابت لا يؤثر على بقية الصفحة.
      • لوحة التداول: كمية (±/اختصارات) + قيمة/هامش حيّ + شراء/بيع
        بسعر العرض/الطلب الحقيقي + صف المركز الحالي مع زر إغلاق.
      • خطوط الصفقات تُعاد بناؤها فقط عند تغيّر البصمة (كانت تُهدَم
        وتُبنى كل 3 ثوانٍ = وميض)، وتحديث PnL حيّ بلا إعادة بناء.
      • إصلاح: مراكز الذهب كانت تظهر بالغرام فقط (GOLD↔XAU نفس العملة).
      • إصلاح محوّل الحفظ: getDrawingTemplates تُرجع أسماء، وحذف/جلب
        قالب الدراسات كان يمرّر كائناً بدل اسم فلا يطابق شيئاً أبداً؛
        القوالب الآن عامة لكل الأصول لا مقيّدة بأصل واحد.
═══════════════════════════════════════════════════════════════ */
'use strict';
var CM = window.__cm = window.__cm || {};

(function () {

  CM.FRAMES = [['1','1د'],['5','5د'],['15','15د'],['30','30د'],['60','1س'],['240','4س'],['1D','يوم'],['1W','أسبوع']];

  CM.frameLabel = function (iv) {
    iv = CM.normIv(iv);
    for (var i = 0; i < CM.FRAMES.length; i++) if (CM.FRAMES[i][0] === iv) return CM.FRAMES[i][1];
    return iv;
  };

  /* ══════════ CSS ══════════ */
  CM.injectCSS = function () {
    if (document.getElementById('_tvCSS')) return;
    var s = document.createElement('style');
    s.id = '_tvCSS';
    s.textContent = [
"#_tvHdr{display:flex;align-items:center;justify-content:space-between;padding:0 8px;height:46px;background:var(--bg-card,#1e293b);border-bottom:1px solid var(--border,#334155);flex-shrink:0;direction:rtl;gap:6px;z-index:5;min-width:0;position:relative;}",
".tvh-l{display:flex;align-items:center;gap:8px;min-width:0;flex:1;overflow:hidden;}",
".tvh-r{display:flex;align-items:center;gap:6px;flex-shrink:0;}",
".tvh-asset-btn{display:flex;align-items:center;gap:4px;background:var(--bg-elev,#334155);border:1.5px solid var(--border,#334155);border-radius:10px;padding:5px 9px;flex-shrink:0;cursor:pointer;transition:border-color .12s,background .12s;max-width:100%;min-height:32px;}",
".tvh-asset-btn:hover,.tvh-asset-btn.open{border-color:var(--ac,#8b5cf6);}",
".tvh-asset-btn.open{background:var(--ac-dim,rgba(139,92,246,.15));}",
".tvh-asset-btn:active{transform:scale(.95);}",
".tvh-icon{font-size:14px;flex-shrink:0;line-height:1;}",
".tvh-name{font-size:11.5px;font-weight:900;color:var(--text-primary,#f1f5f9);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70px;}",
".tvh-caret{font-size:8px;color:var(--text-secondary,#94a3b8);transition:transform 180ms cubic-bezier(.22,1,.36,1);flex-shrink:0;}",
".tvh-asset-btn.open .tvh-caret{transform:rotate(180deg);}",
".tvh-price{font-family:'IBM Plex Mono',monospace;font-size:14px;font-weight:800;color:var(--text-primary,#f1f5f9);flex-shrink:0;transition:color .18s;white-space:nowrap;direction:ltr;}",
".tvh-price.up{color:#10b981;} .tvh-price.dn{color:#ef4444;}",
".tvh-btn{width:32px;height:32px;border-radius:9px;border:1.5px solid var(--border,#334155);background:var(--bg-elev,#334155);color:var(--text-secondary,#94a3b8);font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .12s;flex-shrink:0;}",
".tvh-btn:hover{border-color:var(--ac,#8b5cf6);color:var(--ac,#8b5cf6);}",
".tvh-btn:active{transform:scale(.88);}",
".tvh-btn.active{background:var(--ac,#8b5cf6);border-color:var(--ac,#8b5cf6);color:#fff;}",
".tvh-trade-btn{border-color:var(--ac,#8b5cf6);color:var(--ac,#8b5cf6);background:var(--ac-dim,rgba(139,92,246,.15));}",
".tvh-dot{width:7px;height:7px;border-radius:50%;background:#334155;flex-shrink:0;transition:background .3s;}",
".tvh-dot.on{background:#10b981;box-shadow:0 0 6px #10b981;}",
".tvh-dot.wait{background:#f59e0b;animation:_tvDt 1.1s ease-in-out infinite;}",
".tvh-dot.off{background:#ef4444;}",
"@keyframes _tvDt{0%,100%{opacity:1}50%{opacity:.15}}",

/* ── سطر الأطر الزمنية + شارة PnL ── */
"#_tvSub{display:flex;align-items:center;gap:6px;padding:4px 8px;background:var(--bg-card,#1e293b);border-bottom:1px solid var(--border,#334155);flex-shrink:0;direction:rtl;min-height:36px;min-width:0;}",
"#_tvSub.tools-on:not(.has-pnl){display:none;}",
"#_tvSub.tools-on .tvs-ivs{display:none;}",
".tvs-ivs{display:flex;gap:4px;flex:1;min-width:0;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;}",
".tvs-ivs::-webkit-scrollbar{display:none;}",
".tvs-iv{flex:0 0 auto;min-width:38px;height:28px;padding:0 10px;border-radius:8px;border:1.5px solid transparent;background:transparent;color:var(--text-secondary,#94a3b8);font-size:12px;font-family:'Cairo',sans-serif;cursor:pointer;transition:all .12s;}",
".tvs-iv:active{transform:scale(.93);}",
".tvs-iv.active{background:var(--ac-dim,rgba(139,92,246,.15));border-color:var(--ac,#8b5cf6);color:var(--ac,#8b5cf6);}",
".tvh-pnl{font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:800;padding:3px 9px;border-radius:8px;white-space:nowrap;flex-shrink:0;display:none;cursor:pointer;border:1px solid transparent;margin-inline-start:auto;}",
".tvh-pnl.pos{background:rgba(16,185,129,.15);color:#10b981;border-color:rgba(16,185,129,.3);}",
".tvh-pnl.neg{background:rgba(239,68,68,.15);color:#ef4444;border-color:rgba(239,68,68,.3);}",
".tvh-pnl.show{display:inline-block;}",

/* ── قائمة الأصول ── */
"#_tvAssetDrop{position:absolute;top:100%;right:8px;margin-top:6px;width:min(76vw,250px);max-height:min(60vh,360px);overflow-y:auto;background:var(--bg-card,#1e293b);border:1.5px solid var(--border-strong,#334155);border-radius:14px;box-shadow:0 14px 40px rgba(0,0,0,.55);z-index:25;padding:6px;display:none;-webkit-overflow-scrolling:touch;}",
"#_tvAssetDrop.open{display:block;animation:_tvDropIn 160ms cubic-bezier(.22,1,.36,1);}",
"@keyframes _tvDropIn{from{opacity:0;transform:translateY(-6px) scale(.97);}to{opacity:1;transform:translateY(0) scale(1);}}",
".tvad-row{display:flex;align-items:center;gap:8px;padding:10px 8px;border-radius:10px;cursor:pointer;transition:background .1s;border:1px solid transparent;}",
".tvad-row:active{transform:scale(.98);}",
".tvad-row:hover{background:var(--bg-elev,#334155);}",
".tvad-row.active{background:var(--bg-elev,#334155);border-color:var(--ac,#8b5cf6);}",
".tvad-icon{font-size:16px;flex-shrink:0;width:22px;text-align:center;}",
".tvad-name{flex:1;min-width:0;font-size:12.5px;font-weight:800;color:var(--text-primary,#f1f5f9);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
".tvad-px{font-family:'IBM Plex Mono',monospace;font-size:12px;font-weight:800;color:var(--text-primary,#f1f5f9);white-space:nowrap;flex-shrink:0;direction:ltr;}",

/* ── قائمة الإعدادات والقوالب ── */
"#_tvMenu{position:absolute;top:100%;left:8px;margin-top:6px;width:min(90vw,310px);max-height:min(74vh,520px);overflow-y:auto;background:var(--bg-card,#1e293b);border:1.5px solid var(--border-strong,#334155);border-radius:14px;box-shadow:0 14px 40px rgba(0,0,0,.55);z-index:26;padding:10px;display:none;direction:rtl;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;}",
"#_tvMenu.open{display:block;animation:_tvDropIn 160ms cubic-bezier(.22,1,.36,1);}",
".tvm-sec{font-size:10.5px;font-weight:800;color:var(--text-muted,#64748b);letter-spacing:.4px;margin:10px 2px 6px;}",
".tvm-sec:first-child{margin-top:2px;}",
".tvm-row{display:flex;align-items:center;gap:10px;padding:8px 4px;}",
".tvm-row-t{flex:1;min-width:0;}",
".tvm-row-t b{display:block;font-size:12.5px;color:var(--text-primary,#f1f5f9);}",
".tvm-row-t small{display:block;font-size:10.5px;color:var(--text-secondary,#94a3b8);line-height:1.5;margin-top:1px;}",
".tvm-sw{width:42px;height:24px;border-radius:99px;background:var(--bg-input,#334155);border:1.5px solid var(--border-strong,#334155);position:relative;flex-shrink:0;cursor:pointer;transition:background .15s,border-color .15s;}",
".tvm-sw i{position:absolute;top:2px;right:2px;width:16px;height:16px;border-radius:50%;background:var(--text-secondary,#94a3b8);transition:transform .15s,background .15s;}",
".tvm-sw.on{background:var(--ac,#8b5cf6);border-color:var(--ac,#8b5cf6);}",
".tvm-sw.on i{background:#fff;transform:translateX(-18px);}",
".tvm-save{display:flex;gap:6px;margin-bottom:8px;}",
".tvm-in{flex:1;min-width:0;font-family:'Cairo',sans-serif;font-size:max(16px,13px);padding:8px 10px;border-radius:9px;background:var(--bg-input,#334155);border:1.5px solid var(--border,#334155);color:var(--text-primary,#f1f5f9);outline:none;}",
".tvm-in:focus{border-color:var(--ac,#8b5cf6);}",
".tvm-btn{flex-shrink:0;padding:0 12px;min-height:36px;border-radius:9px;border:1.5px solid var(--ac,#8b5cf6);background:var(--ac-dim,rgba(139,92,246,.15));color:var(--ac,#8b5cf6);font-size:12px;font-weight:900;font-family:'Cairo',sans-serif;cursor:pointer;}",
".tvm-btn:active{transform:scale(.95);}",
".tvm-tpl{display:flex;align-items:center;gap:6px;padding:7px 8px;border-radius:10px;background:var(--bg-input,#334155);margin-bottom:5px;}",
".tvm-tpl-info{flex:1;min-width:0;display:flex;flex-direction:column;}",
".tvm-tpl-name{font-size:12.5px;font-weight:800;color:var(--text-primary,#f1f5f9);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
".tvm-tpl-meta{font-size:10px;color:var(--text-muted,#64748b);}",
".tvm-mini{flex-shrink:0;min-width:34px;height:30px;padding:0 9px;border-radius:8px;border:1.5px solid var(--border-strong,#334155);background:var(--bg-elev,#334155);color:var(--text-primary,#f1f5f9);font-size:11.5px;font-family:'Cairo',sans-serif;cursor:pointer;}",
".tvm-mini.ok{border-color:#10b981;color:#10b981;background:rgba(16,185,129,.12);}",
".tvm-mini.bad{color:#ef4444;}",
".tvm-mini.bad.armed{border-color:#ef4444;background:rgba(239,68,68,.15);}",
".tvm-mini:active{transform:scale(.93);}",
".tvm-empty{font-size:11.5px;color:var(--text-secondary,#94a3b8);text-align:center;padding:10px 4px;line-height:1.7;}",
".tvm-reset{width:100%;margin-top:8px;min-height:36px;border-radius:9px;border:1.5px dashed var(--border-strong,#334155);background:none;color:var(--text-secondary,#94a3b8);font-size:12px;font-family:'Cairo',sans-serif;cursor:pointer;}",
".tvm-reset.armed{border-color:#ef4444;color:#ef4444;}",

/* ── لوحة التداول العائمة ── */
"#_tvFloatTrade{position:absolute;bottom:14px;left:50%;transform:translateX(-50%) translateY(12px);width:min(94%,360px);background:var(--bg-card,#1e293b);border:1.5px solid var(--border-strong,#334155);border-radius:18px;box-shadow:0 14px 40px rgba(0,0,0,.55);z-index:22;padding:10px 12px 12px;display:none;opacity:0;transition:opacity 180ms ease,transform 180ms cubic-bezier(.22,1,.36,1);direction:rtl;}",
"#_tvFloatTrade.open{display:block;opacity:1;transform:translateX(-50%) translateY(0);}",
".tvft-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;}",
".tvft-title{font-size:12.5px;font-weight:900;color:var(--text-primary,#f1f5f9);display:flex;align-items:center;gap:6px;}",
".tvft-inst{font-size:10px;padding:2px 7px;border-radius:99px;background:rgba(245,158,11,.16);color:#f59e0b;display:none;}",
".tvft-inst.on{display:inline-block;}",
".tvft-x{width:26px;height:26px;border-radius:50%;border:1.5px solid var(--border,#334155);background:var(--bg-elev,#334155);color:var(--text-secondary,#94a3b8);font-size:12px;display:flex;align-items:center;justify-content:center;cursor:pointer;}",
".tvft-pos{display:none;}",
".tvft-pos[data-has]{display:flex;align-items:center;gap:8px;background:var(--bg-input,#334155);border-radius:10px;padding:6px 8px;margin-bottom:8px;font-size:11.5px;color:var(--text-primary,#f1f5f9);}",
".tvft-pos-dir{font-weight:900;white-space:nowrap;} .tvft-pos-dir.long{color:#10b981;} .tvft-pos-dir.short{color:#ef4444;}",
".tvft-pos-sz{flex:1;min-width:0;font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--text-secondary,#94a3b8);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;direction:ltr;text-align:right;}",
".tvft-pos-pnl{font-family:'IBM Plex Mono',monospace;font-weight:800;white-space:nowrap;direction:ltr;} .tvft-pos-pnl.pos{color:#10b981;} .tvft-pos-pnl.neg{color:#ef4444;}",
".tvft-pos-close{flex-shrink:0;min-height:28px;padding:0 10px;border-radius:8px;border:1.5px solid #ef4444;background:rgba(239,68,68,.12);color:#ef4444;font-size:11px;font-weight:900;font-family:'Cairo',sans-serif;cursor:pointer;}",
".tvft-qty-row{display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:8px;}",
".tvft-step{width:38px;height:38px;border-radius:10px;border:1.5px solid var(--border-strong,#334155);background:var(--bg-elev,#334155);color:var(--text-primary,#f1f5f9);font-size:18px;line-height:1;cursor:pointer;flex-shrink:0;}",
".tvft-step:active{transform:scale(.9);}",
".tvft-qty-input{width:110px;font-family:'IBM Plex Mono',monospace;font-size:max(16px,17px);font-weight:700;text-align:center;direction:ltr;background:var(--bg-input,#334155);border:1.5px solid var(--border,#334155);border-radius:10px;padding:8px 6px;color:var(--text-primary,#f1f5f9);outline:none;transition:border-color .13s;}",
".tvft-qty-input:focus{border-color:var(--ac,#8b5cf6);}",
".tvft-unit{font-size:11px;font-weight:800;color:var(--text-secondary,#94a3b8);white-space:nowrap;min-width:34px;}",
".tvft-chips{display:flex;gap:5px;overflow-x:auto;margin-bottom:6px;scrollbar-width:none;}",
".tvft-chips::-webkit-scrollbar{display:none;}",
".tvft-chip{flex:0 0 auto;min-width:38px;height:26px;padding:0 9px;border-radius:8px;border:1.5px solid var(--border,#334155);background:var(--bg-elev,#334155);color:var(--text-secondary,#94a3b8);font-family:'IBM Plex Mono',monospace;font-size:11px;cursor:pointer;}",
".tvft-chip:active{transform:scale(.93);background:var(--ac-dim,rgba(139,92,246,.15));color:var(--ac,#8b5cf6);}",
".tvft-info{font-size:10.5px;color:var(--text-secondary,#94a3b8);text-align:center;min-height:16px;margin-bottom:8px;line-height:1.5;}",
".tvft-info b{color:var(--text-primary,#f1f5f9);font-family:'IBM Plex Mono',monospace;}",
".tvft-btns{display:flex;gap:8px;}",
".tvft-btn{flex:1;min-height:50px;border-radius:13px;border:none;font-family:'Cairo',sans-serif;font-size:13px;font-weight:900;cursor:pointer;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;transition:filter .12s,transform .1s;}",
".tvft-btn:active{transform:scale(.94);filter:brightness(.85);}",
".tvft-buy{background:linear-gradient(150deg,#10b981,color-mix(in srgb,#10b981 60%,black));box-shadow:0 2px 8px rgba(16,185,129,.25);}",
".tvft-sell{background:linear-gradient(150deg,#ef4444,color-mix(in srgb,#ef4444 60%,black));box-shadow:0 2px 8px rgba(239,68,68,.25);}",
".tvft-dir{font-size:13px;line-height:1;}",
".tvft-px{font-family:'IBM Plex Mono',monospace;font-size:10px;opacity:.8;direction:ltr;}",

/* ── منطقة الرسم + التحميل + الإسناد ── */
"#_tvChartWrap{flex:1;min-height:0;width:100%;position:relative;overflow:hidden;background:var(--bg-app,#0f172a);}",
"#_tvC{position:absolute;inset:0;direction:ltr!important;overflow:hidden;background:var(--bg-app,#0f172a);}",
"#_tvC>div{width:100%!important;height:100%!important;}",
"#_tvC>iframe{width:100%!important;height:100%!important;display:block;}",
"#_tvOvr{position:absolute;inset:0;z-index:20;background:var(--bg-app,#0f172a);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;transition:opacity .35s ease;pointer-events:all;padding:20px;}",
"#_tvOvr.fading{opacity:0;pointer-events:none;}",
"#_tvOvr.gone{display:none;}",
".tvovr-icon{font-size:26px;line-height:1;opacity:.55;}",
".tvovr-skel{display:flex;align-items:flex-end;gap:4px;height:64px;width:min(78%,240px);}",
".tvovr-bar2{flex:1;border-radius:3px 3px 1px 1px;background:linear-gradient(90deg, rgba(139,92,246,.10) 25%, rgba(139,92,246,.32) 45%, rgba(139,92,246,.10) 65%);background-size:300% 100%;animation:_tvShimmer 1.4s ease-in-out infinite;}",
"@keyframes _tvShimmer{0%{background-position:-135% 0}100%{background-position:135% 0}}",
".tvovr-txt{font-family:'Cairo',sans-serif;font-size:12px;font-weight:800;color:var(--text-secondary,#94a3b8);text-align:center;line-height:1.7;}",
".tvovr-retry{min-height:38px;padding:0 18px;border-radius:99px;border:1.5px solid var(--ac,#8b5cf6);background:var(--ac-dim,rgba(139,92,246,.15));color:var(--ac,#8b5cf6);font-size:12.5px;font-weight:900;font-family:'Cairo',sans-serif;cursor:pointer;}",
".chart-attribution{display:flex;align-items:center;justify-content:center;height:18px;flex-shrink:0;font-family:'Cairo',sans-serif;font-size:10px;color:var(--text-muted,#64748b);text-decoration:none;background:var(--bg-card,#1e293b);border-top:1px solid var(--border,#334155);direction:ltr;letter-spacing:.2px;line-height:1;}",
".chart-attribution b{color:var(--text-secondary,#94a3b8);margin-inline-start:3px;}",
".chart-attribution:hover b{color:var(--ac,#8b5cf6);}",

/* ── ورقة التأكيد ── */
".tvcf-ov{position:absolute;inset:0;z-index:99;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.65);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);direction:rtl;}",
".tvcf-card{background:var(--bg-card,#1e293b);border-top:1.5px solid var(--border-strong,#334155);border-radius:22px 22px 0 0;width:100%;max-width:520px;padding:14px 14px calc(26px + env(safe-area-inset-bottom));animation:_tvcfUp .22s cubic-bezier(.4,0,.2,1);}",
"@keyframes _tvcfUp{from{transform:translateY(100%)}to{transform:none}}",
".tvcf-hdl{width:30px;height:3px;background:var(--border-strong,#334155);border-radius:999px;margin:0 auto 10px;}",
".tvcf-title{font-size:16px;font-weight:900;margin-bottom:2px;}",
".tvcf-sub{font-size:11px;color:var(--text-secondary,#94a3b8);margin-bottom:9px;}",
".tvcf-rows{background:var(--bg-input,#334155);border-radius:10px;padding:5px 10px;margin-bottom:10px;}",
".tvcf-row{display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border,#334155);font-size:13px;}",
".tvcf-row:last-child{border:none;}",
".tvcf-k{color:var(--text-secondary,#94a3b8);font-weight:700;}",
".tvcf-v{font-family:'IBM Plex Mono',monospace;font-weight:800;color:var(--text-primary,#f1f5f9);direction:ltr;}",
".tvcf-v.g{color:#10b981;} .tvcf-v.r{color:#ef4444;} .tvcf-v.w{color:#f59e0b;}",
".tvcf-btns{display:grid;grid-template-columns:1fr 1fr;gap:7px;}",
".tvcf-cancel{padding:13px;border-radius:999px;border:1.5px solid var(--border-strong,#334155);background:var(--bg-elev,#334155);color:var(--text-secondary,#94a3b8);font-size:13px;font-weight:700;cursor:pointer;font-family:'Cairo',sans-serif;}",
".tvcf-exec{padding:13px;border-radius:999px;border:none;color:#fff;font-size:13px;font-weight:900;cursor:pointer;font-family:'Cairo',sans-serif;display:flex;align-items:center;justify-content:center;gap:5px;transition:filter .12s;}",
".tvcf-exec:active{filter:brightness(.82);}",
".tvcf-exec:disabled{opacity:.5;pointer-events:none;}",
".tvcf-exec.g{background:linear-gradient(135deg,#10b981,color-mix(in srgb,#10b981 60%,black));}",
".tvcf-exec.r{background:linear-gradient(135deg,#ef4444,color-mix(in srgb,#ef4444 60%,black));}",
".tvsp{width:13px;height:13px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:_tvSp .7s linear infinite;}",
"@keyframes _tvSp{to{transform:rotate(360deg)}}",
"@media(min-width:600px){#_tvHdr{height:48px;padding:0 12px;}.tvh-price{font-size:15px;}.tvh-name{font-size:12px;max-width:110px;}}",
"@media(min-width:900px){#_tvHdr{height:50px;padding:0 16px;}.tvcf-card{border-radius:22px;margin-bottom:20px;}#_tvFloatTrade{width:min(60%,400px);}}"
    ].join('\n');
    document.head.appendChild(s);
  };
  CM.injectCSS();

  /* ══════════ مساعدات المراكز (GOLD ↔ XAU نفس العملة xyz:GOLD) ══════════ */
  CM.coinMatches = function (coin) {
    var raw = (coin || '').indexOf(':') >= 0 ? coin.split(':')[1] : (coin || '');
    if (raw === 'GOLD') return CM.sym === 'XAU' || CM.sym === 'GOLD';
    var s = (typeof COIN_TO_SYM !== 'undefined') ? (COIN_TO_SYM[raw] || raw) : raw;
    return s === CM.sym;
  };

  CM.posIndex = function () {
    var ps = (typeof State !== 'undefined' && State.positions) || [];
    for (var i = 0; i < ps.length; i++) {
      if (parseFloat(ps[i].position.szi || 0) && CM.coinMatches(ps[i].position.coin)) return i;
    }
    return -1;
  };
  CM.findPos = function () {
    var i = CM.posIndex();
    return i < 0 ? null : State.positions[i];
  };

  /* ══════════ PRICE STATE ══════════ */
  CM.setPrice = function (sym, disp) {
    CM.prices[sym] = disp;
    if (sym !== CM.sym) return;
    var el = document.getElementById('_tvPx');
    if (!el) return;
    var prev = parseFloat(el.dataset.p || 0);
    el.textContent = '$' + disp.toFixed(CM.asset(sym).pxDp);
    el.className = 'tvh-price' + (disp > prev ? ' up' : disp < prev ? ' dn' : '');
    el.dataset.p = disp;
    CM.updBtnPx(sym, disp);
  };

  /* شراء = أفضل طلب (ask) · بيع = أفضل عرض (bid) — من State.prices، لا هامش وهمي */
  CM.updBtnPx = function (sym, mid) {
    if (!mid || sym !== CM.sym) return;
    var a = CM.asset(sym);
    var p = (typeof State !== 'undefined' && State.prices && State.prices[sym]) || {};
    var ask = p.ask || mid * 1.0003, bid = p.bid || mid * 0.9997;
    var bp = document.getElementById('_tvFtBuyPx');
    var sp = document.getElementById('_tvFtSellPx');
    if (bp) bp.textContent = '$' + ask.toFixed(a.pxDp);
    if (sp) sp.textContent = '$' + bid.toFixed(a.pxDp);
    CM.updFtInfo();
  };

  CM.curPx = function () {
    return CM.prices[CM.sym] || (typeof State !== 'undefined' && State.prices && State.prices[CM.sym] && State.prices[CM.sym].mid) || 0;
  };

  CM.updatePnlBadge = function () {
    var el = document.getElementById('_tvPnl');
    var sub = document.getElementById('_tvSub');
    if (!el || typeof State === 'undefined') return;
    var p = CM.findPos();
    if (!p) {
      el.classList.remove('show', 'pos', 'neg');
      el.textContent = '';
      if (sub) sub.classList.remove('has-pnl');
    } else {
      var pnl = parseFloat(p.position.unrealizedPnl || 0);
      el.className = 'tvh-pnl show ' + (pnl >= 0 ? 'pos' : 'neg');
      el.textContent = (parseFloat(p.position.szi) > 0 ? '▲ ' : '▼ ') + (pnl >= 0 ? '+' : '-') + '$' + Math.abs(pnl).toFixed(2);
      if (sub) sub.classList.add('has-pnl');
    }
    CM.updFtPos();
  };

  /* ══════════ OVERLAY (شمشة التحميل / حالة الفشل) ══════════ */
  CM._ovr = function () {
    var wrap = document.getElementById('_tvChartWrap');
    if (!wrap) return null;
    var el = document.getElementById('_tvOvr');
    if (!el) { el = document.createElement('div'); el.id = '_tvOvr'; wrap.appendChild(el); }
    return el;
  };

  CM.ovrShow = function (sym) {
    var el = CM._ovr(); if (!el) return;
    var a = CM.asset(sym);
    var heights = [38, 58, 32, 66, 46, 72, 40, 60, 34, 52];
    var bars = heights.map(function (h) { return '<div class="tvovr-bar2" style="height:' + h + '%"></div>'; }).join('');
    el.innerHTML =
      '<span class="tvovr-icon">' + a.icon + '</span>' +
      '<div class="tvovr-skel">' + bars + '</div>' +
      '<span class="tvovr-txt">' + CM.esc(a.name) + ' — جاري تحميل الرسم البياني...</span>';
    el.classList.remove('fading', 'gone');
    el.style.opacity = '1';
  };

  CM.ovrFail = function (msg) {
    var el = CM._ovr(); if (!el) return;
    el.innerHTML =
      '<span class="tvovr-icon">⚠️</span>' +
      '<span class="tvovr-txt">' + CM.esc(msg) + '</span>' +
      '<button class="tvovr-retry" id="_tvRetry">إعادة المحاولة</button>';
    el.classList.remove('fading', 'gone');
    el.style.opacity = '1';
    var b = document.getElementById('_tvRetry');
    if (b) b.onclick = function () { if (CM.retryInit) CM.retryInit(); };
  };

  CM.ovrHide = function () {
    var el = document.getElementById('_tvOvr');
    if (!el || el.classList.contains('gone')) return;
    el.classList.add('fading');
    setTimeout(function () { el.classList.add('gone'); el.classList.remove('fading'); }, 440);
  };

  /* ══════════ BBO ══════════ */
  CM.bboConn = function (sym) {
    if (CM.bboSym === sym && CM.bboUnsub) return;
    CM.bboClose();
    CM.bboSym = sym;
    if (typeof HL === 'undefined') { CM.dot('wait'); return; }
    if (!HL.isOpen()) CM.dot('wait');
    CM.bboUnsub = HL.subscribe({ type: 'bbo', coin: CM.coin(sym) }, function (data) {
      var b = parseFloat((data.bbo && data.bbo[0] && data.bbo[0].px) || 0);
      var a = parseFloat((data.bbo && data.bbo[1] && data.bbo[1].px) || 0);
      var mid = b && a ? (b + a) / 2 : 0;
      if (!mid) return;
      var raw = (data.coin || '').indexOf(':') >= 0 ? data.coin.split(':')[1] : data.coin;
      CM.setPrice(sym, sym === 'XAU' && raw === 'GOLD' ? mid / CM.TROY : mid);
      CM.dot('on');
    });
  };

  CM.bboClose = function () {
    if (CM.bboUnsub) { try { CM.bboUnsub(); } catch (e) {} CM.bboUnsub = null; }
    CM.bboSym = '';
  };

  /* ══════════ الحفظ المحلي: الخطة (layout) الحالية ══════════ */
  CM.scheduleAutoSave = function () {
    clearTimeout(CM.saveTimer);
    CM.saveTimer = setTimeout(CM.doAutoSave, 3000);
  };

  CM.saveLayout = function (content) {
    if (!content) return;
    CM.lsSet(CM.LAYOUT_KEY, { v: 2, content: content, ts: Date.now() });
  };
  CM.loadLayout = function () { return CM.lsGet(CM.LAYOUT_KEY); };
  CM.layoutContent = function () {
    var l = CM.loadLayout();
    return (l && l.content) || null;
  };

  CM.doAutoSave = function () {
    if (!CM.widget || !CM.linesReady) return;
    try { CM.widget.save(function (c) { CM.saveLayout(c); }); } catch (e) {}
  };

  /* لقطة ثم متابعة — تُستخدم قبل إعادة بناء الودجت (تبديل وضع الأدوات) */
  CM.snapshot = function (cb) {
    var done = false;
    function fin() { if (done) return; done = true; cb(); }
    if (!CM.widget || !CM.linesReady) { fin(); return; }
    try { CM.widget.save(function (c) { CM.saveLayout(c); fin(); }); } catch (e) { fin(); }
    setTimeout(fin, 900);
  };

  /* ══════════ القوالب المحلية المسمّاة ══════════ */
  CM.tplList = function () {
    var l = CM.lsGet(CM.TPL_KEY);
    return Array.isArray(l) ? l : [];
  };

  CM.saveTemplate = function (name) {
    name = String(name || '').trim().slice(0, 30);
    if (!name) { CM.say('اكتب اسماً للقالب أولاً', 'info'); return; }
    if (!CM.widget || !CM.linesReady) { CM.say('الرسم لم يجهز بعد', 'info'); return; }
    try {
      CM.widget.save(function (content) {
        var list = CM.tplList(), idx = -1;
        for (var i = 0; i < list.length; i++) if (list[i].name === name) { idx = i; break; }
        if (idx < 0 && list.length >= 20) { CM.say('الحد الأقصى 20 قالباً — احذف قالباً أولاً', 'warn'); return; }
        var item = { id: idx >= 0 ? list[idx].id : 't' + Date.now(), name: name, interval: CM.interval, content: content, ts: Date.now() };
        if (idx >= 0) list[idx] = item; else list.push(item);
        if (!CM.lsSet(CM.TPL_KEY, list)) { CM.say('تعذّر الحفظ — مساحة التخزين المحلي ممتلئة', 'err'); return; }
        CM.saveLayout(content);
        CM.say('💾 حُفظ القالب «' + name + '» على جهازك', 'ok', 3000);
        CM.renderMenu();
      });
    } catch (e) { CM.say('تعذّر حفظ القالب', 'err'); }
  };

  CM.applyTemplate = function (id) {
    var list = CM.tplList(), t = null;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) { t = list[i]; break; }
    if (!t) return;
    CM.interval = CM.normIv(t.interval) || CM.interval;
    CM.lsSet('iv_' + CM.sym, CM.interval);
    CM.saveLayout(t.content);
    CM.markActiveInterval();
    CM.toggleMenu(false);
    CM.initChart(CM.sym, CM.interval, t.content);
    CM.say('✅ طُبّق القالب «' + t.name + '»', 'ok', 2500);
  };

  CM.deleteTemplate = function (id) {
    var list = CM.tplList().filter(function (t) { return t.id !== id; });
    CM.lsSet(CM.TPL_KEY, list);
    CM._delArm = null;
    CM.renderMenu();
  };

  CM.resetLayout = function () {
    try { localStorage.removeItem(CM.LS_PREFIX + CM.LAYOUT_KEY); } catch (e) {}
    CM.interval = '60';
    CM.lsSet('iv_' + CM.sym, '60');
    CM.markActiveInterval();
    CM.toggleMenu(false);
    CM.initChart(CM.sym, '60', null);
    CM.say('تمت إعادة ضبط الرسم', 'info', 2500);
  };

  CM.setTools = function (on) {
    on = !!on;
    if (on === CM.toolsOn) return;
    CM.toolsOn = on;
    CM.lsSet(CM.TOOLS_KEY, on);
    CM.applyModeUi();
    CM.renderMenu();
    CM.snapshot(function () { CM.initChart(CM.sym, CM.interval, CM.layoutContent()); });
  };

  CM.setInstant = function (on) {
    CM.instant = !!on;
    CM.lsSet(CM.INSTANT_KEY, CM.instant);
    CM.applyModeUi();
    CM.renderMenu();
    if (CM.instant) CM.say('⚡ التنفيذ الفوري: الضغط على شراء/بيع ينفّذ مباشرة بلا ورقة تأكيد', 'warn', 5000);
  };

  CM.applyModeUi = function () {
    var sub = document.getElementById('_tvSub');
    if (sub) sub.classList.toggle('tools-on', CM.toolsOn);
    var mb = document.getElementById('_tvMenuBtn');
    if (mb) mb.classList.toggle('active', CM.toolsOn || CM.instant);
    var ib = document.getElementById('_tvFtInst');
    if (ib) ib.classList.toggle('on', CM.instant);
  };

  /* ══════════ ORDER LINES ══════════ */
  CM.clearLines = function () {
    CM.lines.forEach(function (l) { try { l.remove(); } catch (e) {} });
    CM.lines = [];
    CM.entryLine = null;
    CM.entryTxt = '';
    CM.linesSig = '';
  };

  CM.scheduleLines = function () {
    if (CM.linesReady) CM.execLines();
    else CM.linesPending = true;
  };

  CM._entryLabel = function (isLong, pnl) {
    return (isLong ? '▲' : '▼') + '  ' + (pnl >= 0 ? '+' : '-') + '$' + Math.abs(pnl).toFixed(2);
  };

  /* تحديث نص/لون خط الدخول حيّاً — بلا هدم أي خط */
  CM.liveEntry = function () {
    if (!CM.entryLine) return;
    var p = CM.findPos(); if (!p) return;
    var pnl = parseFloat(p.position.unrealizedPnl || 0), isLong = parseFloat(p.position.szi) > 0;
    var txt = CM._entryLabel(isLong, pnl) + (pnl >= 0 ? '|g' : '|r');
    if (txt === CM.entryTxt) return;
    CM.entryTxt = txt;
    var col = pnl >= 0 ? '#10b981' : '#ef4444';
    try {
      CM.entryLine.setQuantity(CM._entryLabel(isLong, pnl));
      CM.entryLine.setLineColor(col).setBodyBorderColor(col).setBodyBackgroundColor(col);
    } catch (e) {}
  };

  CM.execLines = function (force) {
    if (!CM.linesReady || !CM.widget || typeof State === 'undefined') return;
    var chart;
    try { chart = CM.widget.chart(); } catch (e) { return; }
    if (!chart) return;

    var pos = CM.findPos();
    var myOrders = (State.openOrders || []).filter(function (o) { return CM.coinMatches(o.coin); });

    var sig = CM.sym + '|' + (pos ? [pos.position.szi, pos.position.entryPx, pos.position.liquidationPx || '',
      (pos.tpsl && pos.tpsl.tp) || '', (pos.tpsl && pos.tpsl.sl) || ''].join(',') : '-') + '|' +
      myOrders.map(function (o) { return [o.oid, o.limitPx, o.triggerPx, o.side, o.orderType, o.sz].join(','); }).join(';');
    if (!force && sig === CM.linesSig) { CM.liveEntry(); CM.updatePnlBadge(); return; }

    CM.clearLines();
    CM.linesSig = sig;

    if (pos) {
      var p = pos.position, sziOz = parseFloat(p.szi || 0);
      var isGr = CM.isGram(CM.sym), entOz = parseFloat(p.entryPx || 0), entD = CM.toDisp(CM.sym, entOz);
      var pnl = parseFloat(p.unrealizedPnl || 0), isLong = sziOz > 0, tpsl = pos.tpsl || {};
      var pnlCol = pnl >= 0 ? '#10b981' : '#ef4444';

      if (entD > 0) {
        try {
          CM.entryLine = chart.createOrderLine()
            .setPrice(entD)
            .setQuantity(CM._entryLabel(isLong, pnl))
            .setLineColor(pnlCol).setBodyBorderColor(pnlCol).setBodyBackgroundColor(pnlCol)
            .setBodyTextColor('#fff').setLineWidth(1).setLineStyle(0);
          CM.lines.push(CM.entryLine);
          CM.entryTxt = CM._entryLabel(isLong, pnl) + (pnl >= 0 ? '|g' : '|r');
        } catch (e) { console.warn('[L]entry', e); }
      }
      if (tpsl.tp) {
        var tpPnl = (Math.abs(sziOz) * Math.abs(tpsl.tp - entOz)).toFixed(2);
        try {
          CM.lines.push(chart.createOrderLine()
            .setPrice(CM.toDisp(CM.sym, tpsl.tp)).setQuantity('🎯 جني ربح  +$' + tpPnl)
            .setLineColor('#10b981').setBodyBorderColor('#10b981').setBodyBackgroundColor('#10b981')
            .setBodyTextColor('#fff').setLineWidth(1).setLineStyle(2));
        } catch (e) { console.warn('[L]tp', e); }
      }
      if (tpsl.sl) {
        var slPnl = (Math.abs(sziOz) * Math.abs(tpsl.sl - entOz)).toFixed(2);
        try {
          CM.lines.push(chart.createOrderLine()
            .setPrice(CM.toDisp(CM.sym, tpsl.sl)).setQuantity('🛡 وقف خسارة  -$' + slPnl)
            .setLineColor('#f59e0b').setBodyBorderColor('#f59e0b').setBodyBackgroundColor('#f59e0b')
            .setBodyTextColor('#0f172a').setLineWidth(1).setLineStyle(2));
        } catch (e) { console.warn('[L]sl', e); }
      }
      try {
        var liqOz = parseFloat(p.liquidationPx || 0) || null;
        if (!liqOz) {
          var aL = isGr ? ((typeof ASSETS !== 'undefined' && ASSETS['GOLD']) || CM.asset('GOLD')) : CM.asset(CM.sym);
          var eq = (typeof crossEquityExcluding === 'function') ? crossEquityExcluding(pnl) : 0;
          liqOz = (typeof calcLiqPrice === 'function') ? calcLiqPrice(entOz, sziOz, eq, aL.cross, aL.lev) : null;
        }
        if (liqOz && liqOz > 0) {
          CM.lines.push(chart.createOrderLine()
            .setPrice(CM.toDisp(CM.sym, liqOz)).setQuantity('⚡ تصفية')
            .setLineColor('#ef4444').setBodyBorderColor('#ef4444').setBodyBackgroundColor('#ef4444')
            .setBodyTextColor('#fff').setLineWidth(1).setLineStyle(1));
        }
      } catch (e) { console.warn('[L]liq', e); }
    }

    myOrders.forEach(function (o) {
      var px = parseFloat(o.limitPx || o.triggerPx || 0);
      if (!px) return;
      var isBuy = o.side === 'B', isTrig = !!o.isTrigger, ot = (o.orderType || '').toLowerCase();
      var label, color;
      if (isTrig) {
        if (ot.indexOf('take profit') >= 0 || ot.indexOf('tp') >= 0) { label = '🎯 جني ربح ' + (isBuy ? '▲' : '▼'); color = '#10b981'; }
        else if (ot.indexOf('stop') >= 0) { label = '🛡 إيقاف ' + (isBuy ? '▲' : '▼'); color = '#f59e0b'; }
        else { label = '⏹ ' + (isBuy ? '▲' : '▼'); color = '#f59e0b'; }
      } else if (isBuy) { label = '📋 شراء حدّي'; color = '#10b981'; }
      else { label = '📋 بيع حدّي'; color = '#ef4444'; }
      try {
        CM.lines.push(chart.createOrderLine()
          .setPrice(CM.toDisp(CM.sym, px)).setQuantity(label)
          .setLineColor(color).setBodyBorderColor(color).setBodyBackgroundColor(color)
          .setBodyTextColor(color === '#f59e0b' ? '#0f172a' : '#fff')
          .setLineWidth(1).setLineStyle(isTrig ? 2 : 0));
      } catch (e) { console.warn('[L]ord', e); }
    });

    CM.updatePnlBadge();
  };

  /* ══════════ محوّل الحفظ/التحميل (قوالب عامة لكل الأصول) ══════════
     كل المفاتيح عامة (لا بادئة أصل) — قالب دراسات محفوظ على النفط يظهر بالذهب.
     أنواع الإرجاع مطابقة لتوثيق ISaveLoadAdapter: getDrawingTemplates → أسماء،
     وremove/getStudyTemplate يستلمان كائناً {name} لا نصاً. */
  CM.buildSLA = function () {
    var g = function (k) { return CM.lsGet('sla_' + k) || []; };
    var sv = function (k, v) { CM.lsSet('sla_' + k, v); };
    var nm = function (x) { return (x && typeof x === 'object') ? x.name : x; };
    return {
      getAllCharts: function () { return Promise.resolve(g('c')); },
      removeChart: function (id) { sv('c', g('c').filter(function (x) { return x.id !== id; })); return Promise.resolve(); },
      saveChart: function (d) {
        var list = g('c'), id = d.id || ('c' + Date.now()), idx = -1;
        for (var i = 0; i < list.length; i++) if (list[i].id === id) { idx = i; break; }
        var item = Object.assign({}, d, { id: id, timestamp: Math.round(Date.now() / 1000) });
        if (idx >= 0) list[idx] = item; else list.push(item);
        sv('c', list);
        return Promise.resolve(id);
      },
      getChartContent: function (id) { var i = g('c').find(function (x) { return x.id === id; }); return Promise.resolve((i && i.content) || ''); },
      getAllStudyTemplates: function () { return Promise.resolve(g('st')); },
      removeStudyTemplate: function (t) { var n = nm(t); sv('st', g('st').filter(function (x) { return x.name !== n; })); return Promise.resolve(); },
      saveStudyTemplate: function (t) { var d = g('st'), i = d.findIndex(function (x) { return x.name === t.name; }); if (i >= 0) d[i] = t; else d.push(t); sv('st', d); return Promise.resolve(); },
      getStudyTemplateContent: function (t) { var n = nm(t); var i = g('st').find(function (x) { return x.name === n; }); return Promise.resolve((i && i.content) || ''); },
      getDrawingTemplates: function (tool) { return Promise.resolve(g('dt' + tool).map(function (x) { return x.name; })); },
      loadDrawingTemplate: function (tool, n) { var i = g('dt' + tool).find(function (x) { return x.name === n; }); return Promise.resolve((i && i.content) || ''); },
      removeDrawingTemplate: function (tool, n) { sv('dt' + tool, g('dt' + tool).filter(function (x) { return x.name !== n; })); return Promise.resolve(); },
      saveDrawingTemplate: function (tool, n, c) { var d = g('dt' + tool), i = d.findIndex(function (x) { return x.name === n; }); var it = { name: n, content: c }; if (i >= 0) d[i] = it; else d.push(it); sv('dt' + tool, d); return Promise.resolve(); },
    };
  };

  /* ══════════ DOM SHELL ══════════ */
  CM.ensureScreen = function () {
    var scr = document.getElementById('chartScreen');
    if (!scr || document.getElementById('_tvHdr')) return;

    var hdr = document.createElement('nav');
    hdr.id = '_tvHdr';
    hdr.innerHTML =
      '<div class="tvh-l">' +
        '<button class="tvh-asset-btn" id="_tvAssetBtn" aria-haspopup="true" aria-label="اختيار الأصل">' +
          '<span id="_tvIcon" class="tvh-icon">🛢</span>' +
          '<span id="_tvName" class="tvh-name">—</span>' +
          '<span class="tvh-caret">▾</span>' +
        '</button>' +
        '<span id="_tvPx" class="tvh-price" data-p="0">—</span>' +
      '</div>' +
      '<div class="tvh-r">' +
        '<button class="tvh-btn tvh-trade-btn" id="_tvTradeBtn" title="فتح صفقة" aria-label="فتح صفقة">💹</button>' +
        '<button class="tvh-btn" id="_tvMenuBtn" title="القوالب والإعدادات" aria-label="القوالب والإعدادات">⚙</button>' +
        '<button class="tvh-btn" id="_tvFsBtn" title="ملء الشاشة" aria-label="ملء الشاشة">⛶</button>' +
        '<span class="tvh-dot wait" id="_tvDot" title="حالة الاتصال"></span>' +
      '</div>' +
      '<div id="_tvAssetDrop"></div>' +
      '<div id="_tvMenu"></div>';
    scr.prepend(hdr);

    var wrap = document.createElement('div');
    wrap.id = '_tvChartWrap';
    var tvC = document.createElement('div');
    tvC.id = '_tvC';
    wrap.appendChild(tvC);
    scr.appendChild(wrap);

    var sub = document.createElement('div');
    sub.id = '_tvSub';
    sub.innerHTML = '<div class="tvs-ivs" id="_tvIvs"></div><span id="_tvPnl" class="tvh-pnl" title="فتح لوحة التداول"></span>';
    scr.insertBefore(sub, wrap);

    /* ✅ شرط ترخيص مكتبة TradingView: إسناد إلزامي أسفل الرسم مباشرة */
    const attr = document.createElement('a');
    attr.className = 'chart-attribution';
    attr.href = 'https://www.tradingview.com/';
    attr.target = '_blank';
    attr.rel = 'noopener noreferrer';
    attr.innerHTML = 'Charts powered by <b>TradingView</b>';
    scr.appendChild(attr);

    /* ملء الشاشة غير مدعوم على iPhone — لا نعرض زراً ميتاً */
    var fs = document.getElementById('_tvFsBtn');
    if (!document.fullscreenEnabled) fs.style.display = 'none';
    fs.onclick = function () {
      var el = document.getElementById('chartScreen');
      if (!el) return;
      if (document.fullscreenElement) { document.exitFullscreen && document.exitFullscreen(); }
      else { el.requestFullscreen && el.requestFullscreen().catch(function () {}); }
    };
    document.addEventListener('fullscreenchange', function () {
      var b = document.getElementById('_tvFsBtn');
      if (b) { b.title = document.fullscreenElement ? 'خروج من ملء الشاشة' : 'ملء الشاشة'; b.classList.toggle('active', !!document.fullscreenElement); }
    });

    document.getElementById('_tvAssetBtn').onclick = function (e) { e.stopPropagation(); CM.toggleAssetDrop(); };
    document.getElementById('_tvTradeBtn').onclick = function (e) { e.stopPropagation(); CM.toggleFloatTrade(); };
    document.getElementById('_tvMenuBtn').onclick  = function (e) { e.stopPropagation(); CM.toggleMenu(); };
    document.getElementById('_tvPnl').onclick      = function (e) { e.stopPropagation(); CM.toggleFloatTrade(true); };

    /* قائمة ⚙: stopPropagation داخلها — إعادة رسمها تفصل الهدف عن DOM فكان
       مستمع document يظنّه نقراً خارجياً ويغلق القائمة */
    document.getElementById('_tvMenu').addEventListener('click', function (e) {
      e.stopPropagation();
      var b = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!b) return;
      var act = b.dataset.act, id = b.dataset.id;
      if (act === 'tools') CM.setTools(!CM.toolsOn);
      else if (act === 'instant') CM.setInstant(!CM.instant);
      else if (act === 'tpl-save') { var inp = document.getElementById('_tvTplName'); CM.saveTemplate(inp && inp.value); }
      else if (act === 'tpl-apply') CM.applyTemplate(id);
      else if (act === 'tpl-del') {
        if (CM._delArm === id) CM.deleteTemplate(id);
        else { CM._delArm = id; CM.renderMenu(); setTimeout(function () { if (CM._delArm === id) { CM._delArm = null; CM.renderMenu(); } }, 3000); }
      } else if (act === 'reset') {
        if (CM._resetArm) { CM._resetArm = false; CM.resetLayout(); }
        else { CM._resetArm = true; CM.renderMenu(); setTimeout(function () { if (CM._resetArm) { CM._resetArm = false; CM.renderMenu(); } }, 3000); }
      }
    });

    document.addEventListener('click', function (e) {
      var drop = document.getElementById('_tvAssetDrop'), abtn = document.getElementById('_tvAssetBtn');
      if (drop && CM.assetDropOpen && !drop.contains(e.target) && (!abtn || !abtn.contains(e.target))) CM.toggleAssetDrop(false);
      var ft = document.getElementById('_tvFloatTrade'), tbtn = document.getElementById('_tvTradeBtn');
      if (ft && CM.floatTradeOpen && !ft.contains(e.target) && (!tbtn || !tbtn.contains(e.target))) CM.toggleFloatTrade(false);
      var mn = document.getElementById('_tvMenu'), mbtn = document.getElementById('_tvMenuBtn');
      if (mn && CM.menuOpen && !mn.contains(e.target) && (!mbtn || !mbtn.contains(e.target))) CM.toggleMenu(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && CM.visible) { CM.toggleAssetDrop(false); CM.toggleFloatTrade(false); CM.toggleMenu(false); }
    });

    CM.buildIntervals();
    CM.buildAssetDropdown();
    CM.buildFloatTrade();
    CM.applyModeUi();
  };

  /* ══════════ الأطر الزمنية ══════════ */
  CM.buildIntervals = function () {
    var el = document.getElementById('_tvIvs');
    if (!el) return;
    el.innerHTML = CM.FRAMES.map(function (f) {
      return '<button class="tvs-iv" data-iv="' + f[0] + '">' + f[1] + '</button>';
    }).join('');
    el.querySelectorAll('.tvs-iv').forEach(function (b) {
      b.onclick = function () { CM.switchInterval(b.dataset.iv); CM.markActiveInterval(); };
    });
    CM.markActiveInterval();
  };

  CM.markActiveInterval = function () {
    var cur = CM.normIv(CM.interval);
    document.querySelectorAll('#_tvIvs .tvs-iv').forEach(function (b) {
      var on = b.dataset.iv === cur;
      b.classList.toggle('active', on);
      if (on && b.scrollIntoView) { try { b.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (e) {} }
    });
  };

  /* ══════════ قائمة الأصول ══════════ */
  CM.buildAssetDropdown = function () {
    var el = document.getElementById('_tvAssetDrop');
    if (!el) return;
    el.innerHTML = CM.NAV_ASSETS.map(function (a) {
      return '<div class="tvad-row" data-sym="' + a.sym + '" role="button" tabindex="0">' +
        '<span class="tvad-icon">' + a.icon + '</span>' +
        '<span class="tvad-name">' + a.ar + '</span>' +
        '<span class="tvad-px" id="_tvadPx_' + a.sym + '">—</span>' +
      '</div>';
    }).join('');
    el.querySelectorAll('.tvad-row').forEach(function (row) {
      var pick = function () {
        var s = row.dataset.sym;
        CM.toggleAssetDrop(false);
        if (s === CM.sym) return;
        CM.switchAssetChart(s);
        if (typeof switchAsset === 'function') switchAsset(s);
      };
      row.onclick = pick;
      row.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } };
    });
    CM.refreshAssetDropdownPrices();
  };

  CM.refreshAssetDropdownPrices = function () {
    if (typeof State === 'undefined') return;
    CM.NAV_ASSETS.forEach(function (a) {
      var el = document.getElementById('_tvadPx_' + a.sym);
      if (!el) return;
      var p = State.prices && State.prices[a.sym] && State.prices[a.sym].mid;
      if (p && typeof fmt === 'function') el.textContent = '$' + fmt(p, CM.asset(a.sym).pxDp);
    });
  };

  CM.markActiveAssetInDropdown = function (sym) {
    document.querySelectorAll('#_tvAssetDrop .tvad-row').forEach(function (r) {
      r.classList.toggle('active', r.dataset.sym === sym);
    });
  };

  CM.toggleAssetDrop = function (force) {
    var el = document.getElementById('_tvAssetDrop'), btn = document.getElementById('_tvAssetBtn');
    if (!el) return;
    var open = force !== undefined ? force : !CM.assetDropOpen;
    if (open) { CM.toggleMenu(false); CM.toggleFloatTrade(false); }
    CM.assetDropOpen = open;
    el.classList.toggle('open', open);
    if (btn) btn.classList.toggle('open', open);
    if (open) { CM.refreshAssetDropdownPrices(); CM.markActiveAssetInDropdown(CM.sym); }
  };

  /* ══════════ قائمة ⚙ ══════════ */
  CM.renderMenu = function () {
    var el = document.getElementById('_tvMenu');
    if (!el) return;
    var tpls = CM.tplList();
    var rows = tpls.length ? tpls.map(function (t) {
      var armed = CM._delArm === t.id;
      var d = new Date(t.ts || Date.now()).toLocaleDateString('ar-EG', { day: '2-digit', month: '2-digit' });
      return '<div class="tvm-tpl">' +
        '<div class="tvm-tpl-info"><span class="tvm-tpl-name">' + CM.esc(t.name) + '</span>' +
        '<span class="tvm-tpl-meta">' + CM.frameLabel(t.interval) + ' · ' + d + '</span></div>' +
        '<button class="tvm-mini ok" data-act="tpl-apply" data-id="' + t.id + '">تطبيق</button>' +
        '<button class="tvm-mini bad' + (armed ? ' armed' : '') + '" data-act="tpl-del" data-id="' + t.id + '" aria-label="حذف القالب">' + (armed ? 'تأكيد؟' : '🗑') + '</button>' +
      '</div>';
    }).join('') : '<div class="tvm-empty">لا توجد قوالب بعد. اضبط الرسم كما تريد ثم احفظه باسم.</div>';

    el.innerHTML =
      '<div class="tvm-sec">الوضع</div>' +
      '<div class="tvm-row"><div class="tvm-row-t"><b>أدوات متقدّمة</b><small>رسم واتجاهات ومؤشرات وإعدادات TradingView الكاملة. الافتراضي: شموع نظيفة فقط.</small></div>' +
        '<button class="tvm-sw' + (CM.toolsOn ? ' on' : '') + '" role="switch" aria-checked="' + CM.toolsOn + '" data-act="tools"><i></i></button></div>' +
      '<div class="tvm-row"><div class="tvm-row-t"><b>تنفيذ فوري</b><small>شراء/بيع بنقرة واحدة بلا ورقة تأكيد (رمز PIN يبقى مطلوباً إن كان مفعّلاً).</small></div>' +
        '<button class="tvm-sw' + (CM.instant ? ' on' : '') + '" role="switch" aria-checked="' + CM.instant + '" data-act="instant"><i></i></button></div>' +
      '<div class="tvm-sec">القوالب — محفوظة على جهازك فقط</div>' +
      '<div class="tvm-save"><input class="tvm-in" id="_tvTplName" maxlength="30" placeholder="اسم القالب"><button class="tvm-btn" data-act="tpl-save">💾 حفظ</button></div>' +
      rows +
      '<button class="tvm-reset' + (CM._resetArm ? ' armed' : '') + '" data-act="reset">' + (CM._resetArm ? 'اضغط مجدداً للتأكيد — سيُمسح التخطيط المحفوظ' : '↺ إعادة ضبط الرسم للوضع الافتراضي') + '</button>';
  };

  CM.toggleMenu = function (force) {
    var el = document.getElementById('_tvMenu'), btn = document.getElementById('_tvMenuBtn');
    if (!el) return;
    var open = force !== undefined ? force : !CM.menuOpen;
    if (open) { CM.toggleAssetDrop(false); CM.toggleFloatTrade(false); CM._delArm = null; CM._resetArm = false; CM.renderMenu(); }
    CM.menuOpen = open;
    el.classList.toggle('open', open);
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  /* ══════════ لوحة التداول العائمة ══════════ */
  CM.buildFloatTrade = function () {
    var wrap = document.getElementById('_tvChartWrap');
    if (!wrap || document.getElementById('_tvFloatTrade')) return;
    var el = document.createElement('div');
    el.id = '_tvFloatTrade';
    wrap.appendChild(el);
    CM.renderFloatTrade();
  };

  CM.readQty = function () {
    var inp = document.getElementById('_tvQty');
    var v = parseFloat(inp && inp.value);
    return v > 0 ? v : 0;
  };

  CM.renderFloatTrade = function () {
    var el = document.getElementById('_tvFloatTrade');
    if (!el) return;
    var a = CM.asset(CM.sym);
    var step = (a.presets && a.presets[0]) || 1;
    var defQ = CM.lsGet('qty_' + CM.sym) || step;
    var chips = (a.presets || []).slice(0, 6).map(function (p) {
      return '<button class="tvft-chip" data-q="' + p + '">' + p + '</button>';
    }).join('');
    el.innerHTML =
      '<div class="tvft-top">' +
        '<span class="tvft-title">فتح صفقة — ' + CM.esc(a.name) + ' <span class="tvft-inst' + (CM.instant ? ' on' : '') + '" id="_tvFtInst">⚡ فوري</span></span>' +
        '<button class="tvft-x" id="_tvFtX" aria-label="إغلاق اللوحة">✕</button>' +
      '</div>' +
      '<div class="tvft-pos" id="_tvFtPos"></div>' +
      '<div class="tvft-qty-row">' +
        '<button class="tvft-step" id="_tvQtyPlus" aria-label="زيادة">+</button>' +
        '<input class="tvft-qty-input" id="_tvQty" type="number" value="' + defQ + '" min="0" step="any" inputmode="decimal" aria-label="الكمية">' +
        '<button class="tvft-step" id="_tvQtyMinus" aria-label="إنقاص">−</button>' +
        '<span class="tvft-unit">' + CM.esc(a.unit || '') + '</span>' +
      '</div>' +
      '<div class="tvft-chips">' + chips + '</div>' +
      '<div class="tvft-info" id="_tvFtInfo"></div>' +
      '<div class="tvft-btns">' +
        '<button class="tvft-btn tvft-buy" id="_tvBuy"><span class="tvft-dir">▲ شراء</span><span class="tvft-px" id="_tvFtBuyPx">—</span></button>' +
        '<button class="tvft-btn tvft-sell" id="_tvSell"><span class="tvft-dir">▼ بيع</span><span class="tvft-px" id="_tvFtSellPx">—</span></button>' +
      '</div>';

    var qty = document.getElementById('_tvQty');
    function save() { var v = parseFloat(qty.value); if (v > 0) CM.lsSet('qty_' + CM.sym, v); CM.updFtInfo(); }
    qty.addEventListener('input', save);
    qty.addEventListener('change', save);
    document.getElementById('_tvQtyPlus').onclick = function () {
      var v = parseFloat(qty.value) || 0;
      qty.value = +(v + step).toFixed(6); save();
    };
    document.getElementById('_tvQtyMinus').onclick = function () {
      var v = parseFloat(qty.value) || 0;
      qty.value = +Math.max(step, v - step).toFixed(6); save();
    };
    el.querySelectorAll('.tvft-chip').forEach(function (c) {
      c.onclick = function () { qty.value = c.dataset.q; save(); };
    });
    document.getElementById('_tvFtX').onclick = function () { CM.toggleFloatTrade(false); };
    document.getElementById('_tvBuy').onclick  = function () { CM.trade(true); };
    document.getElementById('_tvSell').onclick = function () { CM.trade(false); };

    var p = CM.curPx();
    if (p) CM.setPrice(CM.sym, p);
    CM.updFtInfo();
    CM.updFtPos();
  };

  CM.updFtInfo = function () {
    var el = document.getElementById('_tvFtInfo');
    if (!el) return;
    var q = CM.readQty(), px = CM.curPx(), a = CM.asset(CM.sym);
    if (!q || !px) { el.textContent = ''; return; }
    var usd = q * px;
    el.innerHTML = 'القيمة ≈ <b>$' + usd.toFixed(2) + '</b> · الهامش ≈ <b>$' + (usd / a.lev).toFixed(2) + '</b> · رافعة ' + a.lev + 'x';
  };

  /* صف المركز الحالي بلوحة التداول — يُبنى مرة ثم تُحدَّث نصوصه فقط
     (إعادة بناء كل ثانية كانت ستبتلع نقرة زر "إغلاق") */
  CM.updFtPos = function () {
    var box = document.getElementById('_tvFtPos');
    if (!box) return;
    var p = CM.findPos();
    if (!p) { if (box.dataset.has) { box.innerHTML = ''; delete box.dataset.has; } return; }
    if (!box.dataset.has) {
      box.dataset.has = '1';
      box.innerHTML = '<span class="tvft-pos-dir" id="_tvFtPosDir"></span><span class="tvft-pos-sz" id="_tvFtPosSz"></span>' +
        '<span class="tvft-pos-pnl" id="_tvFtPosPnl"></span><button class="tvft-pos-close" id="_tvFtClose">إغلاق ✕</button>';
      document.getElementById('_tvFtClose').onclick = function () { CM.closeCurrent(); };
    }
    var a = CM.asset(CM.sym), isGr = CM.isGram(CM.sym);
    var szi = parseFloat(p.position.szi), pnl = parseFloat(p.position.unrealizedPnl || 0);
    var dir = document.getElementById('_tvFtPosDir'), sz = document.getElementById('_tvFtPosSz'), pn = document.getElementById('_tvFtPosPnl');
    if (dir) { dir.textContent = szi > 0 ? '▲ شراء' : '▼ بيع'; dir.className = 'tvft-pos-dir ' + (szi > 0 ? 'long' : 'short'); }
    if (sz) sz.textContent = Math.abs(isGr ? szi * CM.TROY : szi).toFixed(isGr ? 2 : a.szDp) + ' ' + (a.unit || '');
    if (pn) { pn.textContent = (pnl >= 0 ? '+' : '-') + '$' + Math.abs(pnl).toFixed(2); pn.className = 'tvft-pos-pnl ' + (pnl >= 0 ? 'pos' : 'neg'); }
  };

  CM.toggleFloatTrade = function (force) {
    var el = document.getElementById('_tvFloatTrade'), btn = document.getElementById('_tvTradeBtn');
    if (!el) return;
    var open = force !== undefined ? force : !CM.floatTradeOpen;
    if (open) { CM.toggleAssetDrop(false); CM.toggleMenu(false); }
    CM.floatTradeOpen = open;
    el.classList.toggle('open', open);
    if (btn) btn.classList.toggle('active', open);
    if (open) { CM.updFtInfo(); CM.updFtPos(); }
  };

  /* ══════════ HEADER TEXT / DOT ══════════ */
  CM.setHdr = function (sym) {
    var a = CM.asset(sym);
    var ic = document.getElementById('_tvIcon');
    var nm = document.getElementById('_tvName');
    if (ic) ic.textContent = a.icon;
    if (nm) nm.textContent = a.name;
    var p = CM.prices[sym] || (typeof State !== 'undefined' && State.prices && State.prices[sym] && State.prices[sym].mid) || 0;
    var el = document.getElementById('_tvPx');
    if (el) {
      if (p) { el.textContent = '$' + p.toFixed(a.pxDp); el.dataset.p = p; el.className = 'tvh-price'; CM.updBtnPx(sym, p); }
      else { el.textContent = '—'; el.dataset.p = '0'; el.className = 'tvh-price'; }
    }
    CM.updatePnlBadge();
    CM.markActiveAssetInDropdown(sym);
  };

  CM.dot = function (cls) {
    var e = document.getElementById('_tvDot');
    if (e) e.className = 'tvh-dot ' + cls;
  };

})();
