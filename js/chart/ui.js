/* ═══════════════════════════════════════════════════════════════
   js/chart/ui.js — الواجهة: CSS + بناء DOM + عرض السعر/PnL + BBO +
   الحفظ التلقائي + خطوط الصفقات على الرسم + محوّل الحفظ/التحميل.

   ✅ جديد — القائمة الأفقية القديمة لتبديل الأصول (_tvNav) وزر
      "← رجوع" (_tvBack) حُذفا بالكامل. بدلاً منهما: زر واحد بالرأس
      (أيقونة + اسم الأصل + سهم ▾) يفتح قائمة منسدلة صغيرة (أسعار كل
      الأصول حيّة) — نفس فكرة عنوان الحساب بالـappbar (راجع app.js:
      addr-popover) لكن هنا لتبديل الأصل. التنقل نفسه (رجوع للرئيسية/
      الأسواق) صار عبر tabbar المشترك، فلا حاجة لزر رجوع داخلي.
   ✅ جديد — شريط الشراء/البيع الثابت (_tvTrade) حُذف، استُبدل بزر
      أنيق بجانب زر ملء الشاشة (💹) يفتح/يُغلق لوحة عائمة فوق الرسم
      (طبقة ثانية، z-index أعلى من الشارت، بلا حجب كامل الشاشة) —
      تظهر عند الطلب فقط بدل شغل مساحة دائمة.
   ✅ إعادة تلوين (2026-08) — بنفسجي (#8b5cf6) أساس الواجهة بدل البرتقالي
      القديم بكل مكان بهذا الملف (زر الأصل/القائمة المنسدلة/زر الفتح
      العائم/شمشة التحميل). up/down بكل شارات السعر والـPnL الآن
      success/danger من اللوحة الجديدة (#10b981/#ef4444) بدل الأخضر/
      الأحمر القديمين. أزرار الشراء/البيع باللوحة العائمة والتأكيد
      تستخدم نفس التدرجات الجديدة. سطر خطوط الصفقات على الرسم نفسه
      (execLines) في أسفل الملف مُعاد تلوينه بالكامل أيضاً — TP يُعرض
      الآن بنجاح أخضر (بدل تركواز)، SL بتحذير كهرماني (بدل برتقالي)،
      خط التصفية بخطر أحمر موحّد، ونص كل تسمية اختير أبيض أو كحلي غامق
      (#0f172a) حسب سطوع الخلفية فعلياً — الكهرماني الجديد أفتح من
      البرتقالي القديم فاحتاج نصاً داكناً بدل الأبيض ليبقى مقروءاً.
═══════════════════════════════════════════════════════════════ */
'use strict';
var CM = window.__cm = window.__cm || {};

(function () {

  /* ══════════ CSS ══════════ */
  CM.injectCSS = function () {
    if (document.getElementById('_tvCSS')) return;
    var s = document.createElement('style');
    s.id = '_tvCSS';
    s.textContent = [
'#_tvHdr{display:flex;align-items:center;justify-content:space-between;padding:0 8px;height:46px;background:var(--bg-card,#1e293b);border-bottom:1px solid var(--border,#334155);flex-shrink:0;direction:rtl;gap:6px;z-index:5;min-width:0;position:relative;}',
'.tvh-l{display:flex;align-items:center;gap:6px;min-width:0;flex:1;overflow:hidden;}',
'.tvh-r{display:flex;align-items:center;gap:5px;flex-shrink:0;}',
'.tvh-asset-btn{display:flex;align-items:center;gap:4px;background:var(--bg-elev,#334155);border:1.5px solid var(--border,#334155);border-radius:9px;padding:4px 8px;flex-shrink:0;cursor:pointer;transition:border-color .12s,background .12s;max-width:100%;}',
'.tvh-asset-btn:hover{border-color:var(--ac,#8b5cf6);}',
'.tvh-asset-btn:active{transform:scale(.94);}',
'.tvh-asset-btn.open{border-color:var(--ac,#8b5cf6);background:rgba(139,92,246,.1);}',
'.tvh-icon{font-size:14px;flex-shrink:0;line-height:1;}',
'.tvh-name{font-size:11px;font-weight:900;color:var(--text-primary,#f1f5f9);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:74px;}',
'.tvh-caret{font-size:8px;color:var(--text-secondary,#94a3b8);transition:transform 180ms cubic-bezier(.22,1,.36,1);flex-shrink:0;}',
'.tvh-asset-btn.open .tvh-caret{transform:rotate(180deg);}',
'.tvh-price{font-family:\'IBM Plex Mono\',monospace;font-size:13px;font-weight:800;color:var(--text-primary,#f1f5f9);flex-shrink:0;transition:color .18s;white-space:nowrap;}',
'.tvh-price.up{color:#10b981;}',
'.tvh-price.dn{color:#ef4444;}',
'.tvh-pnl{font-family:\'IBM Plex Mono\',monospace;font-size:10px;font-weight:800;padding:2px 6px;border-radius:6px;white-space:nowrap;flex-shrink:0;display:none;}',
'.tvh-pnl.pos{background:rgba(16,185,129,.15);color:#10b981;border:1px solid rgba(16,185,129,.3);}',
'.tvh-pnl.neg{background:rgba(239,68,68,.15);color:#ef4444;border:1px solid rgba(239,68,68,.3);}',
'.tvh-pnl.show{display:inline-block;}',
'.tvh-dot{width:7px;height:7px;border-radius:50%;background:#334155;flex-shrink:0;transition:background .3s;}',
'.tvh-dot.on{background:#10b981;box-shadow:0 0 6px #10b981;}',
'.tvh-dot.wait{background:#f59e0b;animation:_tvDt 1.1s ease-in-out infinite;}',
'.tvh-dot.off{background:#ef4444;}',
'@keyframes _tvDt{0%,100%{opacity:1}50%{opacity:.15}}',
'.tvh-fs{width:27px;height:27px;border-radius:7px;border:1.5px solid var(--border,#334155);background:var(--bg-elev,#334155);color:var(--text-secondary,#94a3b8);font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .12s;flex-shrink:0;}',
'.tvh-fs:hover{border-color:var(--ac,#8b5cf6);color:var(--ac,#8b5cf6);}',
'.tvh-fs:active{transform:scale(.86);}',
'.tvh-trade-btn{width:27px;height:27px;border-radius:7px;border:1.5px solid var(--ac,#8b5cf6);background:rgba(139,92,246,.12);color:var(--ac,#8b5cf6);font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .12s;flex-shrink:0;}',
'.tvh-trade-btn:hover{background:rgba(139,92,246,.22);}',
'.tvh-trade-btn:active{transform:scale(.86);}',
'.tvh-trade-btn.active{background:var(--ac,#8b5cf6);color:#fff;}',
/* ── القائمة المنسدلة للأصول (بديل _tvNav) ── */
'#_tvAssetDrop{position:absolute;top:100%;right:8px;margin-top:6px;width:min(76vw,250px);max-height:min(60vh,360px);overflow-y:auto;background:var(--bg-card,#1e293b);border:1.5px solid var(--border-strong,#334155);border-radius:14px;box-shadow:0 14px 40px rgba(0,0,0,.55);z-index:25;padding:6px;display:none;-webkit-overflow-scrolling:touch;}',
'#_tvAssetDrop.open{display:block;animation:_tvDropIn 160ms cubic-bezier(.22,1,.36,1);}',
'@keyframes _tvDropIn{from{opacity:0;transform:translateY(-6px) scale(.97);}to{opacity:1;transform:translateY(0) scale(1);}}',
'.tvad-row{display:flex;align-items:center;gap:8px;padding:9px 8px;border-radius:10px;cursor:pointer;transition:background .1s;border:1px solid transparent;}',
'.tvad-row:active{transform:scale(.98);}',
'.tvad-row:hover{background:var(--bg-elev,#334155);}',
'.tvad-row.active{background:var(--bg-elev,#334155);border-color:var(--ac,#8b5cf6);}',
'.tvad-icon{font-size:16px;flex-shrink:0;width:22px;text-align:center;}',
'.tvad-name{flex:1;min-width:0;font-size:12.5px;font-weight:800;color:var(--text-primary,#f1f5f9);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
'.tvad-px{font-family:\'IBM Plex Mono\',monospace;font-size:12px;font-weight:800;color:var(--text-primary,#f1f5f9);white-space:nowrap;flex-shrink:0;}',
/* ── اللوحة العائمة للشراء/البيع (بديل _tvTrade الثابت) ── */
'#_tvFloatTrade{position:absolute;bottom:16px;left:50%;transform:translateX(-50%) translateY(10px);width:min(92%,380px);background:var(--bg-card,#1e293b);border:1.5px solid var(--border-strong,#334155);border-radius:18px;box-shadow:0 14px 40px rgba(0,0,0,.55);z-index:22;padding:12px;display:none;opacity:0;transition:opacity 180ms ease,transform 180ms cubic-bezier(.22,1,.36,1);}',
'#_tvFloatTrade.open{display:block;opacity:1;transform:translateX(-50%) translateY(0);}',
'.tvft-qty-row{display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:10px;}',
'.tvft-qty-input{width:100px;font-family:\'IBM Plex Mono\',monospace;font-size:max(16px,17px);font-weight:700;text-align:center;direction:ltr;background:var(--bg-input,#334155);border:1.5px solid var(--border,#334155);border-radius:10px;padding:8px 6px;color:var(--text-primary,#f1f5f9);outline:none;transition:border-color .13s;}',
'.tvft-qty-input:focus{border-color:var(--ac,#8b5cf6);}',
'.tvft-unit{font-size:11px;font-weight:800;color:var(--text-secondary,#94a3b8);white-space:nowrap;}',
'.tvft-btns{display:flex;gap:8px;}',
'.tvft-btn{flex:1;min-height:48px;border-radius:13px;border:none;font-family:\'Cairo\',sans-serif;font-size:13px;font-weight:900;cursor:pointer;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;transition:filter .12s,transform .1s;}',
'.tvft-btn:active{transform:scale(.94);filter:brightness(.85);}',
'.tvft-buy{background:linear-gradient(150deg,#10b981,color-mix(in srgb,#10b981 60%,black));box-shadow:0 2px 8px rgba(16,185,129,.25);}',
'.tvft-sell{background:linear-gradient(150deg,#ef4444,color-mix(in srgb,#ef4444 60%,black));box-shadow:0 2px 8px rgba(239,68,68,.25);}',
'.tvft-dir{font-size:13px;line-height:1;}',
'.tvft-px{font-family:\'IBM Plex Mono\',monospace;font-size:9px;opacity:.7;}',
'#_tvChartWrap{flex:1;min-height:0;width:100%;position:relative;overflow:hidden;background:#0f172a;}',
'#_tvC{position:absolute;inset:0;direction:ltr!important;overflow:hidden;background:#0f172a;}',
'#_tvC>div{width:100%!important;height:100%!important;}',
'#_tvC>iframe{width:100%!important;height:100%!important;display:block;}',
'#_tvOvr{position:absolute;inset:0;z-index:20;background:var(--bg-app,#0f172a);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;transition:opacity .35s ease;pointer-events:all;padding:20px;}',
'#_tvOvr.fading{opacity:0;pointer-events:none;}',
'#_tvOvr.gone{display:none;}',
'.tvovr-icon{font-size:26px;line-height:1;opacity:.55;}',
'.tvovr-skel{display:flex;align-items:flex-end;gap:4px;height:64px;width:min(78%,240px);}',
'.tvovr-bar2{flex:1;border-radius:3px 3px 1px 1px;background:linear-gradient(90deg, rgba(139,92,246,.10) 25%, rgba(139,92,246,.32) 45%, rgba(139,92,246,.10) 65%);background-size:300% 100%;animation:_tvShimmer 1.4s ease-in-out infinite;}',
'@keyframes _tvShimmer{0%{background-position:-135% 0}100%{background-position:135% 0}}',
'.tvovr-txt{font-family:\'Cairo\',sans-serif;font-size:12px;font-weight:800;color:var(--text-secondary,#94a3b8);text-align:center;}',
'.tvcf-ov{position:absolute;inset:0;z-index:99;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.65);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);direction:rtl;}',
'.tvcf-card{background:var(--bg-card,#1e293b);border-top:1.5px solid var(--border-strong,#334155);border-radius:22px 22px 0 0;width:100%;max-width:520px;padding:14px 14px 30px;animation:_tvcfUp .22s cubic-bezier(.4,0,.2,1);}',
'@keyframes _tvcfUp{from{transform:translateY(100%)}to{transform:none}}',
'.tvcf-hdl{width:30px;height:3px;background:var(--border-strong,#334155);border-radius:999px;margin:0 auto 10px;}',
'.tvcf-title{font-size:16px;font-weight:900;margin-bottom:2px;}',
'.tvcf-sub{font-size:11px;color:var(--text-secondary,#94a3b8);margin-bottom:9px;}',
'.tvcf-rows{background:var(--bg-input,#334155);border-radius:10px;padding:5px 10px;margin-bottom:10px;}',
'.tvcf-row{display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border,#334155);font-size:13px;}',
'.tvcf-row:last-child{border:none;}',
'.tvcf-k{color:var(--text-secondary,#94a3b8);font-weight:700;}',
'.tvcf-v{font-family:\'IBM Plex Mono\',monospace;font-weight:800;color:var(--text-primary,#f1f5f9);}',
'.tvcf-v.g{color:#10b981;} .tvcf-v.r{color:#ef4444;} .tvcf-v.w{color:#f59e0b;}',
'.tvcf-btns{display:grid;grid-template-columns:1fr 1fr;gap:7px;}',
'.tvcf-cancel{padding:12px;border-radius:999px;border:1.5px solid var(--border-strong,#334155);background:var(--bg-elev,#334155);color:var(--text-secondary,#94a3b8);font-size:13px;font-weight:700;cursor:pointer;font-family:\'Cairo\',sans-serif;}',
'.tvcf-exec{padding:12px;border-radius:999px;border:none;color:#fff;font-size:13px;font-weight:900;cursor:pointer;font-family:\'Cairo\',sans-serif;display:flex;align-items:center;justify-content:center;gap:5px;transition:filter .12s;}',
'.tvcf-exec:active{filter:brightness(.82);}',
'.tvcf-exec:disabled{opacity:.5;pointer-events:none;}',
'.tvcf-exec.g{background:linear-gradient(135deg,#10b981,color-mix(in srgb,#10b981 60%,black));}',
'.tvcf-exec.r{background:linear-gradient(135deg,#ef4444,color-mix(in srgb,#ef4444 60%,black));}',
'.tvsp{width:13px;height:13px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:_tvSp .7s linear infinite;}',
'@keyframes _tvSp{to{transform:rotate(360deg)}}',
'@media(min-width:600px){#_tvHdr{height:48px;padding:0 12px;}.tvh-price{font-size:15px;}.tvh-name{font-size:12px;max-width:110px;}.tvft-qty-input{width:110px;font-size:max(16px,19px);}}',
'@media(min-width:900px){#_tvHdr{height:50px;padding:0 16px;}.tvcf-card{border-radius:22px;margin-bottom:20px;}#_tvFloatTrade{width:min(60%,420px);}}'
    ].join('\n');
    document.head.appendChild(s);
  };
  CM.injectCSS();

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

  CM.updBtnPx = function (sym, mid) {
    if (!mid || sym !== CM.sym) return;
    var a = CM.asset(sym);
    var bp = document.getElementById('_tvFtBuyPx');
    var sp = document.getElementById('_tvFtSellPx');
    if (bp) bp.textContent = '$' + (mid * 1.0003).toFixed(a.pxDp);
    if (sp) sp.textContent = '$' + (mid * 0.9997).toFixed(a.pxDp);
  };

  CM.curPx = function () {
    return CM.prices[CM.sym] || (typeof State !== 'undefined' && State.prices && State.prices[CM.sym] && State.prices[CM.sym].mid) || 0;
  };

  CM.updatePnlBadge = function () {
    var el = document.getElementById('_tvPnl');
    if (!el || typeof State === 'undefined') return;
    var pnl = null;
    var positions = State.positions || [];
    for (var i = 0; i < positions.length; i++) {
      var p = positions[i];
      var rawC = (p.position.coin || '').indexOf(':') >= 0 ? p.position.coin.split(':')[1] : p.position.coin;
      var pSym = rawC === 'GOLD' ? 'XAU' : (typeof COIN_TO_SYM !== 'undefined' ? (COIN_TO_SYM[rawC] || rawC) : rawC);
      if (pSym === CM.sym) { pnl = parseFloat(p.position.unrealizedPnl || 0); break; }
    }
    if (pnl === null) {
      el.classList.remove('show', 'pos', 'neg');
      el.textContent = '';
    } else {
      var cls = pnl >= 0 ? 'pos' : 'neg';
      el.className = 'tvh-pnl show ' + cls;
      el.textContent = (pnl >= 0 ? '+' : '') + '$' + Math.abs(pnl).toFixed(2);
    }
  };

  /* ══════════ OVERLAY (شمشة التحميل) ══════════ */
  CM.ovrShow = function (sym) {
    var wrap = document.getElementById('_tvChartWrap');
    if (!wrap) return;
    var el = document.getElementById('_tvOvr');
    if (!el) {
      el = document.createElement('div');
      el.id = '_tvOvr';
      wrap.appendChild(el);
    }
    var a = CM.asset(sym);
    var heights = [38, 58, 32, 66, 46, 72, 40, 60, 34, 52];
    var bars = heights.map(function (h) { return '<div class="tvovr-bar2" style="height:' + h + '%"></div>'; }).join('');
    el.innerHTML =
      '<span class="tvovr-icon">' + a.icon + '</span>' +
      '<div class="tvovr-skel">' + bars + '</div>' +
      '<span class="tvovr-txt">' + a.name + ' — جاري تحميل الرسم البياني...</span>';
    el.classList.remove('fading', 'gone');
    el.style.opacity = '1';
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
    if (typeof HL === 'undefined' || !HL.isOpen()) CM.dot('wait');
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

  /* ══════════ AUTO-SAVE ══════════ */
  CM.scheduleAutoSave = function () {
    clearTimeout(CM.saveTimer);
    CM.saveTimer = setTimeout(CM.doAutoSave, 3000);
  };

  CM.doAutoSave = function () {
    if (!CM.widget || !CM.linesReady) return;
    try {
      CM.widget.save(function (c) { CM.lsSet(CM.LAYOUT_KEY, { sym: CM.sym, interval: CM.interval, content: c, ts: Date.now() }); });
    } catch (e) {}
  };

  CM.loadLayout = function () { return CM.lsGet(CM.LAYOUT_KEY); };

  /* ══════════ ORDER LINES ══════════ */
  CM.clearLines = function () {
    CM.lines.forEach(function (l) { try { l.remove(); } catch (e) {} });
    CM.lines = [];
  };

  CM.scheduleLines = function () {
    if (CM.linesReady) CM.execLines();
    else CM.linesPending = true;
  };

  CM.execLines = function () {
    if (!CM.linesReady || !CM.widget || typeof State === 'undefined') return;
    var chart;
    try { chart = CM.widget.chart(); } catch (e) { return; }
    if (!chart) return;
    CM.clearLines();

    var positions = State.positions || [];
    for (var pi = 0; pi < positions.length; pi++) {
      var p = positions[pi];
      var rawC = (p.position.coin || '').indexOf(':') >= 0 ? p.position.coin.split(':')[1] : p.position.coin;
      var pSym = rawC === 'GOLD' ? 'XAU' : (typeof COIN_TO_SYM !== 'undefined' ? (COIN_TO_SYM[rawC] || rawC) : rawC);
      if (pSym !== CM.sym) continue;
      var pos = p.position, sziOz = parseFloat(pos.szi || 0);
      if (!sziOz) continue;
      var isGr = CM.isGram(CM.sym), entOz = parseFloat(pos.entryPx || 0), entD = CM.toDisp(CM.sym, entOz);
      var pnl = parseFloat(pos.unrealizedPnl || 0), isLong = sziOz > 0, tpsl = p.tpsl || {};
      var pnlCol = pnl >= 0 ? '#10b981' : '#ef4444';

      if (entD > 0) {
        try {
          CM.lines.push(chart.createOrderLine()
            .setPrice(entD)
            .setQuantity((isLong ? '▲' : '▼') + '  ' + (pnl >= 0 ? '+' : '') + '$' + Math.abs(pnl).toFixed(2))
            .setLineColor(pnlCol).setBodyBorderColor(pnlCol).setBodyBackgroundColor(pnlCol)
            .setBodyTextColor('#fff').setLineWidth(1).setLineStyle(0));
        } catch (e) { console.warn('[L]entry', e); }
      }
      if (tpsl.tp) {
        var tpD = CM.toDisp(CM.sym, tpsl.tp), tpPnl = (Math.abs(sziOz) * Math.abs(tpsl.tp - entOz)).toFixed(2);
        try {
          CM.lines.push(chart.createOrderLine()
            .setPrice(tpD).setQuantity('🎯 TP  +$' + tpPnl)
            .setLineColor('#10b981').setBodyBorderColor('#10b981').setBodyBackgroundColor('#10b981')
            .setBodyTextColor('#fff').setLineWidth(1).setLineStyle(2));
        } catch (e) { console.warn('[L]tp', e); }
      }
      if (tpsl.sl) {
        var slD = CM.toDisp(CM.sym, tpsl.sl), slPnl = (Math.abs(sziOz) * Math.abs(tpsl.sl - entOz)).toFixed(2);
        try {
          CM.lines.push(chart.createOrderLine()
            .setPrice(slD).setQuantity('🛡 SL  -$' + slPnl)
            .setLineColor('#f59e0b').setBodyBorderColor('#f59e0b').setBodyBackgroundColor('#f59e0b')
            .setBodyTextColor('#0f172a').setLineWidth(1).setLineStyle(2));
        } catch (e) { console.warn('[L]sl', e); }
      }
      try {
        var apiLiqOz = parseFloat(pos.liquidationPx || 0);
        var liqOz = apiLiqOz > 0 ? apiLiqOz : null;
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
      break;
    }

    var openOrders = State.openOrders || [];
    for (var oi = 0; oi < openOrders.length; oi++) {
      var o = openOrders[oi];
      var orawC = (o.coin || '').indexOf(':') >= 0 ? o.coin.split(':')[1] : o.coin;
      var oSym = orawC === 'GOLD' ? 'XAU' : (typeof COIN_TO_SYM !== 'undefined' ? (COIN_TO_SYM[orawC] || orawC) : orawC);
      if (oSym !== CM.sym) continue;
      var px = parseFloat(o.limitPx || o.triggerPx || 0);
      if (!px) continue;
      var dispPx = CM.toDisp(CM.sym, px), isBuy = o.side === 'B', isTrig = !!o.isTrigger;
      var ot = (o.orderType || '').toLowerCase();
      var label, color, bg;
      if (isTrig) {
        if (ot.indexOf('take profit') >= 0 || ot.indexOf('tp') >= 0) { label = '🎯 TP ' + (isBuy ? '▲' : '▼'); color = '#10b981'; bg = '#10b981'; }
        else if (ot.indexOf('stop') >= 0) { label = '🛡 SL ' + (isBuy ? '▲' : '▼'); color = '#f59e0b'; bg = '#f59e0b'; }
        else { label = '⏹ ' + (isBuy ? '▲' : '▼'); color = '#f59e0b'; bg = '#f59e0b'; }
      } else if (isBuy) { label = '📋 شراء'; color = '#10b981'; bg = '#10b981'; }
      else { label = '📋 بيع'; color = '#ef4444'; bg = '#ef4444'; }
      try {
        CM.lines.push(chart.createOrderLine()
          .setPrice(dispPx).setQuantity(label)
          .setLineColor(color).setBodyBorderColor(color).setBodyBackgroundColor(bg)
          .setBodyTextColor(bg === '#f59e0b' ? '#0f172a' : '#fff')
          .setLineWidth(1).setLineStyle(isTrig ? 2 : 0));
      } catch (e) { console.warn('[L]ord', e); }
    }

    CM.updatePnlBadge();
  };

  /* ══════════ SAVE/LOAD ADAPTER ══════════ */
  CM.buildSLA = function (sym) {
    var K = 'sla_' + sym + '_';
    var g = function (k) { return CM.lsGet(K + k) || []; };
    var sv = function (k, v) { CM.lsSet(K + k, v); };
    return {
      getAllCharts: function () { return Promise.resolve(g('_c')); },
      removeChart: function (id) { sv('_c', g('_c').filter(function (x) { return x.id !== id; })); return Promise.resolve(); },
      saveChart: function (d) { sv('_c', [Object.assign({}, d, { id: 'auto', timestamp: Date.now() })]); return Promise.resolve('auto'); },
      getChartContent: function (id) { var i = g('_c').find(function (x) { return x.id === id; }); return Promise.resolve((i && i.content) || ''); },
      getAllStudyTemplates: function () { return Promise.resolve(g('_st')); },
      removeStudyTemplate: function (n) { sv('_st', g('_st').filter(function (x) { return x.name !== n; })); return Promise.resolve(); },
      saveStudyTemplate: function (t) { var d = g('_st'), i = d.findIndex(function (x) { return x.name === t.name; }); if (i >= 0) d[i] = t; else d.push(t); sv('_st', d); return Promise.resolve(); },
      getStudyTemplateContent: function (n) { var i = g('_st').find(function (x) { return x.name === n; }); return Promise.resolve((i && i.content) || ''); },
      getDrawingTemplates: function (t) { return Promise.resolve(g('_dt' + t)); },
      loadDrawingTemplate: function (t, n) { var i = g('_dt' + t).find(function (x) { return x.name === n; }); return Promise.resolve((i && i.content) || ''); },
      removeDrawingTemplate: function (t, n) { sv('_dt' + t, g('_dt' + t).filter(function (x) { return x.name !== n; })); return Promise.resolve(); },
      saveDrawingTemplate: function (t, n, c) { var d = g('_dt' + t), i = d.findIndex(function (x) { return x.name === n; }); var it = { name: n, content: c }; if (i >= 0) d[i] = it; else d.push(it); sv('_dt' + t, d); return Promise.resolve(); },
    };
  };

  /* ══════════ DOM SHELL ══════════ */
  CM.ensureScreen = function () {
    var scr = document.getElementById('chartScreen');
    if (!scr || document.getElementById('_tvHdr')) return;

    document.addEventListener('fullscreenchange', function () {
      var btn = document.getElementById('_tvFsBtn');
      if (btn) btn.title = document.fullscreenElement ? 'خروج ملء الشاشة' : 'ملء الشاشة';
    });

    var hdr = document.createElement('nav');
    hdr.id = '_tvHdr';
    hdr.innerHTML =
      '<div class="tvh-l">' +
        '<button class="tvh-asset-btn" id="_tvAssetBtn">' +
          '<span id="_tvIcon" class="tvh-icon">🛢</span>' +
          '<span id="_tvName" class="tvh-name">—</span>' +
          '<span class="tvh-caret" id="_tvCaret">▾</span>' +
        '</button>' +
        '<span id="_tvPx" class="tvh-price" data-p="0">—</span>' +
        '<span id="_tvPnl" class="tvh-pnl"></span>' +
      '</div>' +
      '<div class="tvh-r">' +
        '<button class="tvh-trade-btn" id="_tvTradeBtn" title="فتح صفقة">💹</button>' +
        '<button class="tvh-fs" id="_tvFsBtn" title="ملء الشاشة">⛶</button>' +
        '<div class="tvh-dot wait" id="_tvDot"></div>' +
      '</div>' +
      '<div id="_tvAssetDrop"></div>';
    scr.prepend(hdr);

    var wrap = document.createElement('div');
    wrap.id = '_tvChartWrap';
    var tvC = document.createElement('div');
    tvC.id = '_tvC';
    wrap.appendChild(tvC);
    scr.appendChild(wrap);

    document.getElementById('_tvFsBtn').onclick = function () {
      var el = document.getElementById('chartScreen');
      if (!el) return;
      if (document.fullscreenElement) { document.exitFullscreen && document.exitFullscreen(); }
      else { el.requestFullscreen && el.requestFullscreen().catch(function () {}); }
    };
    document.getElementById('_tvAssetBtn').onclick = function (e) { e.stopPropagation(); CM.toggleAssetDrop(); };
    document.getElementById('_tvTradeBtn').onclick = function (e) { e.stopPropagation(); CM.toggleFloatTrade(); };

    document.addEventListener('click', function (e) {
      var drop = document.getElementById('_tvAssetDrop');
      var abtn = document.getElementById('_tvAssetBtn');
      if (drop && CM.assetDropOpen && !drop.contains(e.target) && (!abtn || !abtn.contains(e.target))) CM.toggleAssetDrop(false);
      var ft = document.getElementById('_tvFloatTrade');
      var tbtn = document.getElementById('_tvTradeBtn');
      if (ft && CM.floatTradeOpen && !ft.contains(e.target) && (!tbtn || !tbtn.contains(e.target))) CM.toggleFloatTrade(false);
    });

    CM.buildAssetDropdown();
    CM.buildFloatTrade();
  };

  /* ══════════ ASSET DROPDOWN (بديل _tvNav) ══════════ */
  CM.buildAssetDropdown = function () {
    var el = document.getElementById('_tvAssetDrop');
    if (!el) return;
    el.innerHTML = CM.NAV_ASSETS.map(function (a) {
      return '<div class="tvad-row" data-sym="' + a.sym + '" id="_tvadRow_' + a.sym + '">' +
        '<span class="tvad-icon">' + a.icon + '</span>' +
        '<span class="tvad-name">' + a.ar + '</span>' +
        '<span class="tvad-px" id="_tvadPx_' + a.sym + '">—</span>' +
      '</div>';
    }).join('');
    el.querySelectorAll('.tvad-row').forEach(function (row) {
      row.onclick = function () {
        var s = row.dataset.sym;
        CM.toggleAssetDrop(false);
        if (s === CM.sym) return;
        CM.switchAssetChart(s);
        if (typeof switchAsset === 'function') switchAsset(s);
      };
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
    var el = document.getElementById('_tvAssetDrop');
    var btn = document.getElementById('_tvAssetBtn');
    if (!el) return;
    var open = force !== undefined ? force : !CM.assetDropOpen;
    CM.assetDropOpen = open;
    el.classList.toggle('open', open);
    if (btn) btn.classList.toggle('open', open);
    if (open) { CM.refreshAssetDropdownPrices(); CM.markActiveAssetInDropdown(CM.sym); }
  };

  /* ══════════ FLOATING TRADE PANEL (بديل _tvTrade الثابت) ══════════ */
  CM.buildFloatTrade = function () {
    var wrap = document.getElementById('_tvChartWrap');
    if (!wrap || document.getElementById('_tvFloatTrade')) return;
    var el = document.createElement('div');
    el.id = '_tvFloatTrade';
    wrap.appendChild(el);
    CM.renderFloatTrade();
  };

  CM.renderFloatTrade = function () {
    var el = document.getElementById('_tvFloatTrade');
    if (!el) return;
    var a = CM.asset(CM.sym);
    var defQ = CM.lsGet('qty_' + CM.sym) || (a.presets && a.presets[0]) || 1;
    el.innerHTML =
      '<div class="tvft-qty-row">' +
        '<input class="tvft-qty-input" id="_tvQty" type="number" value="' + defQ + '" min="0" step="any" inputmode="decimal">' +
        '<span class="tvft-unit">' + (a.unit || '') + '</span>' +
      '</div>' +
      '<div class="tvft-btns">' +
        '<button class="tvft-btn tvft-sell" id="_tvSell"><span class="tvft-dir">▼ بيع</span><span class="tvft-px" id="_tvFtSellPx">—</span></button>' +
        '<button class="tvft-btn tvft-buy" id="_tvBuy"><span class="tvft-dir">▲ شراء</span><span class="tvft-px" id="_tvFtBuyPx">—</span></button>' +
      '</div>';
    document.getElementById('_tvQty').addEventListener('change', function () {
      var v = parseFloat(this.value);
      if (v > 0) CM.lsSet('qty_' + CM.sym, v);
    });
    document.getElementById('_tvBuy').onclick = function () { CM.showCf(true); };
    document.getElementById('_tvSell').onclick = function () { CM.showCf(false); };
    var p = CM.curPx();
    if (p) CM.setPrice(CM.sym, p);
  };

  CM.toggleFloatTrade = function (force) {
    var el = document.getElementById('_tvFloatTrade');
    var btn = document.getElementById('_tvTradeBtn');
    if (!el) return;
    var open = force !== undefined ? force : !CM.floatTradeOpen;
    CM.floatTradeOpen = open;
    el.classList.toggle('open', open);
    if (btn) btn.classList.toggle('active', open);
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
