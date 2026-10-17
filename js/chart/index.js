/* ═══════════════════════════════════════════════════════════════
   js/chart/index.js — المنسّق: بناء الودجت + التهيئة + الواجهة العامة
   window.ChartModule (نفس الشكل الخارجي: open/close/switchInterval/
   switchAssetChart/refreshLines — app.js لا يحتاج أي تعديل).

   ✅ الرسم النظيف (الوضع الافتراضي): شموع يابانية + سعر + زمن فقط —
      بلا شبكة، بلا خط سعر، بلا عدّاد، بلا وسوم/مفتاح وصفي، بلا أشرطة
      TradingView (العلوي/الجانبي/السفلي). الأطر الزمنية من سطر عربي
      خاص بنا (ui.js). لغة المكتبة 'ar'.
   ✅ applyOverrides بعد الجاهزية بالوضع النظيف: saved_data (الخطة
      المحفوظة) تستعيد خصائص قديمة فوق overrides — هذا كان سبب بقاء
      الشبكة/خط السعر عند بعض المستخدمين. الآن تُفرض النظافة دائماً.
   ✅ وضع الأدوات المتقدّمة: نفس الودجت لكن بأشرطة TradingView الكاملة
      (رسم/مؤشرات/قوالب)، وخصائص المستخدم تُحترم بلا فرض.
   ✅ خطة واحدة عامة (layout_v2) لكل الأصول: الرسومات مرتبطة برمز كل أصل
      داخل TradingView نفسها، والرمز/الإطار يُزامَنان بعد الاستعادة بدل
      إسقاط الخطة كلما اختلف الأصل (السلوك القديم).
   ✅ تبديل الثيم الحيّ (☀️/🌙) ينعكس على الرسم فوراً (كان يحتاج إعادة بناء).
   ✅ فشل تحميل المكتبة/انتهاء المهلة → رسالة عربية + زر إعادة المحاولة
      (كانت شاشة فارغة بلا تفسير).
   ✅ حفظ فوري عند إخفاء التبويب/مغادرة الصفحة (لا فقدان لآخر 3 ثوانٍ).
═══════════════════════════════════════════════════════════════ */
'use strict';
var CM = window.__cm = window.__cm || {};

(function () {

  /* ══════════ OVERRIDES ══════════ */
  CM.baseOverrides = function (dark, clean) {
    var bg = dark ? '#0f172a' : '#f8fafc';
    var o = {
      'paneProperties.background': bg,
      'paneProperties.backgroundType': 'solid',
      /* بلا شبكة */
      'paneProperties.vertGridProperties.color': 'rgba(0,0,0,0)',
      'paneProperties.horzGridProperties.color': 'rgba(0,0,0,0)',
      'paneProperties.gridLinesMode': 'none',
      'paneProperties.crossHairProperties.color': '#64748b',
      'paneProperties.crossHairProperties.style': 2,
      'paneProperties.crossHairProperties.width': 1,
      /* شموع يابانية */
      'mainSeriesProperties.style': 1,
      'mainSeriesProperties.candleStyle.upColor': '#10b981',
      'mainSeriesProperties.candleStyle.downColor': '#ef4444',
      'mainSeriesProperties.candleStyle.drawWick': true,
      'mainSeriesProperties.candleStyle.drawBorder': true,
      'mainSeriesProperties.candleStyle.borderUpColor': '#10b981',
      'mainSeriesProperties.candleStyle.borderDownColor': '#ef4444',
      'mainSeriesProperties.candleStyle.wickUpColor': '#10b981',
      'mainSeriesProperties.candleStyle.wickDownColor': '#ef4444',
      /* بلا خط سعر ولا عدّاد — قيمة السعر الأخيرة تبقى على المقياس */
      'mainSeriesProperties.showPriceLine': false,
      'mainSeriesProperties.showCountdown': false,
      'mainSeriesProperties.highLowAvgPrice.highLowPriceLabelsVisible': false,
      'mainSeriesProperties.highLowAvgPrice.averageClosePriceLabelVisible': false,
      'scalesProperties.showSeriesLastValue': true,
      'scalesProperties.showSymbolLabels': false,
      'scalesProperties.fontSize': window.innerWidth >= 600 ? 13 : 12,
      'scalesProperties.textColor': dark ? '#94a3b8' : '#64748b',
      'scalesProperties.lineColor': dark ? '#334155' : '#e2e8f0',
      'scalesProperties.backgroundColor': bg,
      'symbolWatermarkProperties.transparency': 100,
      'symbolWatermarkProperties.color': 'rgba(0,0,0,0)'
    };
    if (clean) {
      o['paneProperties.legendProperties.showLegend'] = false;
      o['paneProperties.legendProperties.showSeriesTitle'] = false;
      o['paneProperties.legendProperties.showSeriesOHLC'] = false;
      o['paneProperties.legendProperties.showBarChange'] = false;
      o['paneProperties.legendProperties.showVolume'] = false;
      o['paneProperties.legendProperties.showStudyTitles'] = false;
      o['paneProperties.legendProperties.showStudyValues'] = false;
    }
    return o;
  };

  CM.enforceLook = function () {
    if (!CM.widget || CM.toolsOn) return;
    try { CM.widget.applyOverrides(CM.baseOverrides(CM.dark(), true)); } catch (e) {}
  };

  CM.applyTheme = function () {
    if (!CM.widget || !CM.linesReady) return;
    var dark = CM.dark();
    var w = CM.widget;
    var after = function () {
      try { w.applyOverrides(CM.baseOverrides(dark, !CM.toolsOn)); } catch (e) {}
    };
    try {
      var r = w.changeTheme(dark ? 'Dark' : 'Light');
      if (r && typeof r.then === 'function') r.then(after).catch(after); else after();
    } catch (e) { after(); }
  };

  /* ══════════ WIDGET BUILDER ══════════ */
  CM.mkWidget = function (sym, iv, saved) {
    if (!window.TradingView || !window.TradingView.widget) return null;
    var dark = CM.dark();
    var clean = !CM.toolsOn;

    var disabled = [
      'header_symbol_search', 'symbol_search_hot_key', 'header_compare', 'symbol_info',
      'border_around_the_chart', 'display_market_status', 'go_to_date',
      'create_volume_indicator_by_default', 'volume_force_overlay'
    ];
    if (clean) {
      disabled.push('header_widget', 'left_toolbar', 'timeframes_toolbar', 'control_bar',
        'legend_widget', 'edit_buttons_in_legend', 'property_pages', 'show_chart_property_page');
    }

    var enabled = [
      'side_toolbar_in_fullscreen_mode', 'header_in_fullscreen_mode',
      'horz_touch_drag_scroll', 'vert_touch_drag_scroll', 'pinch_scale',
      'axis_pressed_mouse_move_scale', 'axis_double_clicked_reset_scale',
      'shift_visible_range_on_new_bar', 'pre_post_market_sessions',
      'hide_last_na_study_output', 'adaptive_logo', 'move_logo_to_main_pane',
      'force_touch_drag', 'iframe_loading_compatibility_mode'
    ];
    if (!clean) {
      enabled.push('study_templates', 'items_favoriting', 'show_hide_button_in_legend',
        'chart_property_page_style', 'chart_property_page_scales',
        'chart_property_page_background', 'chart_property_page_timezone_sessions',
        'chart_property_page_trading');
    }

    var cfg = {
      container: '_tvC', autosize: true,
      symbol: sym, interval: iv,
      datafeed: CM.datafeed,
      library_path: 'https://chart.kanba.pw/charting_library/',
      locale: 'ar',
      timezone: 'Asia/Kuwait',            // عرض فقط — البيانات UTC دائماً
      theme: dark ? 'Dark' : 'Light',
      toolbar_bg: dark ? '#1e293b' : '#ffffff',
      overrides: CM.baseOverrides(dark, clean),
      studies_overrides: {},
      disabled_features: disabled,
      enabled_features: enabled,
      save_load_adapter: CM.buildSLA(),
      loading_screen: {
        backgroundColor: dark ? '#0f172a' : '#f8fafc',
        foregroundColor: '#8b5cf6'
      },
      client_id: 'suyula_hl', user_id: 'trader',
      charts_storage_api_version: '1.1',
      fullscreen: false, debug: false
    };
    if (saved) cfg.saved_data = saved;
    return new window.TradingView.widget(cfg);
  };

  /* ══════════ CHART INIT (هدم + إعادة بناء كاملة) ══════════
     تُستدعى: أول دخول، تبديل وضع الأدوات، تطبيق قالب، إعادة ضبط، فشل
     setSymbol/setResolution، أو إعادة المحاولة بعد فشل التحميل. */
  CM.initChart = function (sym, iv, saved) {
    CM.ovrShow(sym);
    CM.linesReady = false; CM.linesPending = false;
    clearTimeout(CM.readyTimer);

    if (CM.widget) {
      CM.clearLines();
      try { CM.widget.remove(); } catch (e) {}
      CM.widget = null;
    }
    if (CM.datafeed) { CM.datafeed.destroy(); CM.datafeed = null; }

    var c = document.getElementById('_tvC');
    if (c) c.innerHTML = '';

    if (!window.TradingView || !window.TradingView.widget) {
      CM.dot('off');
      CM.ovrFail('تعذّر تحميل مكتبة الرسم البياني — تحقق من الاتصال ثم أعد المحاولة');
      return;
    }

    CM.datafeed = new CM.Datafeed();
    var w = null;
    try { w = CM.mkWidget(sym, iv, saved); } catch (e) { console.error('[chart] mkWidget', e); }
    if (!w) { CM.widget = null; CM.ovrFail('تعذّر بناء الرسم البياني — أعد المحاولة'); return; }
    CM.widget = w;

    CM.readyTimer = setTimeout(function () {
      if (CM.widget === w && !CM.linesReady) CM.ovrFail('انتهت مهلة تحميل الرسم البياني — تحقق من الاتصال');
    }, 25000);

    w.onChartReady(function () {
      if (CM.widget !== w) return;            // ودجت قديم أُلغي أثناء التحميل
      clearTimeout(CM.readyTimer);
      CM.failCount = 0;
      var ch = w.chart();

      function finish() {
        if (CM.widget !== w) return;
        CM.linesReady = true;
        CM.enforceLook();
        setTimeout(CM.ovrHide, 200);
        CM.execLines(true);
        if (CM.linesPending) { CM.linesPending = false; CM.execLines(true); }

        try {
          ch.onIntervalChanged().subscribe(null, function (newIv) {
            CM.interval = CM.normIv(newIv);
            CM.lsSet('iv_' + CM.sym, CM.interval);
            CM.markActiveInterval();
            CM.scheduleAutoSave();
            CM.linesSig = '';
            setTimeout(function () { CM.execLines(true); }, 300);
          });
        } catch (e) {}
        try { w.subscribe('onAutoSaveNeeded', CM.scheduleAutoSave); } catch (e) {}
        setTimeout(CM.doAutoSave, 5000);
      }

      /* الخطة المستعادة قد تحمل رمزاً/إطاراً مختلفاً عمّا نعرضه بالرأس */
      function syncResolution() {
        try {
          var cur = CM.normIv(ch.resolution());
          if (cur !== CM.normIv(CM.interval)) {
            ch.setResolution(CM.interval, function () { finish(); });
            return;
          }
        } catch (e) {}
        finish();
      }
      var curSym = null;
      try { curSym = ch.symbol(); } catch (e) {}
      if (curSym && curSym !== CM.sym) {
        try { ch.setSymbol(CM.sym, function () { syncResolution(); }); return; } catch (e) {}
      }
      syncResolution();
    });
  };

  CM.retryInit = function () {
    CM.failCount = (CM.failCount || 0) + 1;
    /* الإعادة الثانية بلا الخطة المحفوظة — احتمال أن تكون هي المعطوبة */
    CM.initChart(CM.sym, CM.interval, CM.failCount >= 2 ? null : CM.layoutContent());
  };

  /* ══════════ عدّاد السعر/PnL الحي ══════════ */
  CM.restartClock = function () {
    clearInterval(CM.clockTimer);
    CM.clockTick = 0;
    CM.clockTimer = setInterval(function () {
      if (!CM.visible || typeof State === 'undefined') return;
      CM.clockTick++;
      var p = State.prices && State.prices[CM.sym] && State.prices[CM.sym].mid;
      if (p) CM.setPrice(CM.sym, p);
      CM.updatePnlBadge();
      CM.liveEntry();
      if (CM.clockTick % 5 === 0) CM.scheduleLines();      // شبكة أمان لأي تغيير فات
      if (CM.assetDropOpen) CM.refreshAssetDropdownPrices();
    }, 1000);
  };

  /* ══════════ مراقبة الثيم + حفظ عند المغادرة (مرة واحدة) ══════════ */
  if (!CM._globalsBound) {
    CM._globalsBound = true;
    try {
      new MutationObserver(function () { CM.applyTheme(); })
        .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    } catch (e) {}
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') CM.doAutoSave();
    });
    window.addEventListener('pagehide', function () { CM.doAutoSave(); });
  }

  /* ══════════ PUBLIC API ══════════ */
  CM.initialInterval = function (sym) {
    var s = CM.lsGet('iv_' + sym);
    return (s && CM.TV_TO_HL[CM.normIv(s)]) ? CM.normIv(s) : '60';
  };

  CM.open = function (sym) {
    var targetSym = sym || (typeof State !== 'undefined' ? State.asset : 'CL') || 'CL';
    CM.visible = true;
    CM.ensureScreen();
    CM.applyModeUi();

    /* الودجت جاهز أصلاً — لا هدم، فقط استئناف حي */
    if (CM.widget && CM.linesReady) {
      if (targetSym !== CM.sym) CM.switchAssetChart(targetSym);
      else { CM.setHdr(CM.sym); CM.bboConn(CM.sym); }
      CM.restartClock();
      CM.scheduleLines();
      return;
    }

    CM.sym = targetSym;
    CM.interval = CM.initialInterval(CM.sym);
    CM.setHdr(CM.sym);
    CM.markActiveInterval();
    CM.renderFloatTrade();

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        CM.initChart(CM.sym, CM.interval, CM.layoutContent());
      });
    });

    CM.dot('wait');
    CM.bboConn(CM.sym);
    CM.restartClock();
  };

  CM.close = function () {
    CM.visible = false;
    clearInterval(CM.clockTimer); clearTimeout(CM.saveTimer);
    CM.doAutoSave(); CM.bboClose(); CM.hideCf();
    CM.toggleAssetDrop(false); CM.toggleFloatTrade(false); CM.toggleMenu(false);
    if (document.fullscreenElement) { document.exitFullscreen && document.exitFullscreen(); }
  };

  CM.switchInterval = function (iv) {
    iv = CM.normIv(iv);
    if (!iv || iv === CM.normIv(CM.interval)) return;
    CM.interval = iv; CM.lsSet('iv_' + CM.sym, iv);
    CM.markActiveInterval();
    if (!CM.widget || !CM.linesReady) return;
    try {
      CM.widget.chart().setResolution(iv);
    } catch (e) {
      requestAnimationFrame(function () { CM.initChart(CM.sym, iv, CM.layoutContent()); });
    }
  };

  /* تبديل الأصل بلا هدم — chart().setSymbol() على نفس الودجت؛ تراجع تلقائي
     كامل لو فشلت. الإطار الزمني يبقى كما هو ما لم يكن للأصل إطار محفوظ. */
  CM.switchAssetChart = function (sym) {
    if (!CM.visible || sym === CM.sym) return;
    CM.doAutoSave();
    CM.clearLines();
    CM.sym = sym;
    CM.setHdr(sym);
    CM.renderFloatTrade();
    CM.bboConn(sym);

    var savedIv = CM.lsGet('iv_' + sym);
    var nextIv = (savedIv && CM.TV_TO_HL[CM.normIv(savedIv)]) ? CM.normIv(savedIv) : CM.normIv(CM.interval);

    if (CM.widget && CM.linesReady) {
      try {
        var ch = CM.widget.chart();
        if (ch && typeof ch.setSymbol === 'function') {
          CM.ovrShow(sym);
          ch.setSymbol(sym, function () {
            try {
              if (nextIv !== CM.normIv(CM.interval) && typeof ch.setResolution === 'function') ch.setResolution(nextIv);
            } catch (e) {}
            CM.interval = nextIv;
            CM.lsSet('iv_' + sym, nextIv);
            CM.markActiveInterval();
            CM.linesReady = true;
            setTimeout(CM.ovrHide, 150);
            CM.execLines(true);
          });
          return;
        }
      } catch (e) {
        console.warn('[chart] setSymbol failed, falling back to full reinit', e);
      }
    }

    CM.interval = nextIv;
    CM.markActiveInterval();
    requestAnimationFrame(function () { CM.initChart(sym, CM.interval, CM.layoutContent()); });
  };

  CM.refreshLines = function () { if (CM.visible) CM.scheduleLines(); };

})();

/* ══════════ الواجهة العامة — نفس الشكل الخارجي القديم بالضبط ══════════ */
window.ChartModule = {
  open: CM.open,
  close: CM.close,
  switchInterval: CM.switchInterval,
  switchAssetChart: CM.switchAssetChart,
  refreshLines: CM.refreshLines
};
