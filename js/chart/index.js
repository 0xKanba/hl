/* ═══════════════════════════════════════════════════════════════
   js/chart/index.js — المنسّق النهائي: بناء الودجت + التهيئة + الواجهة
   العامة window.ChartModule (نفس الشكل الخارجي القديم بالضبط —
   open/close/switchInterval/switchAssetChart/refreshLines — فـapp.js
   لا يحتاج أي تعديل).

   ✅ FIX جوهري — الودجت القديم كان يُهدَم ويُعاد بناؤه بالكامل مع كل
      استدعاء لـopen() حتى لو نفس الأصل (بطيء، يتعارض مع "سريع في
      التنقل" المطلوب). الآن: لو الودجت موجود وجاهز أصلاً (CM.widget +
      CM.linesReady)، open() تكتفي بإعادة الاتصال بالسعر الحي + إعادة
      رسم الرأس، أو تستدعي switchAssetChart() (تستخدم أصلاً
      chart().setSymbol() بلا هدم) لو الأصل المطلوب مختلف — التهيئة
      الكاملة (initChart) تحدث فقط أول مرة فعلية، أو لو فشل setSymbol/
      setResolution لأي سبب (احتياط تلقائي كامل).
   ✅ close() الآن تُوقف فقط المحتوى الحي (BBO/الساعة/الحفظ التلقائي/
      ورقة التأكيد/القوائم المنسدلة) — لا تلمس .hidden على الشاشة
      نفسها إطلاقاً؛ ذاك حصراً مسؤولية switchScreen() بـapp.js (نفس
      المعاملة بالضبط لشاشتي الرئيسية والأسواق)، فلا تعارض بين الاثنين.
   ✅ إعادة تلوين (2026-08) — كل ألوان overrides/loading_screen هذه
      لا تمرّ عبر CSS variables (تُرسَل مباشرة لمكتبة TradingView كقيم
      JS خام)، فتحديث themes.css وحده لا يغطيها. حُدِّثت هنا يدوياً
      لنفس اللوحة الجديدة: شموع up/down=success/danger، priceLineColor
      وloading foregroundColor=البنفسجي الأساسي، شبكة الرسم بلون
      rgba(148,163,184,...) الموثّق صراحة كـ"شبكة الرسوم البيانية"،
      وخلفية/نص/خطوط المقاييس من نفس ثنائي bg-app/border الجديد.
═══════════════════════════════════════════════════════════════ */
'use strict';
var CM = window.__cm = window.__cm || {};

(function () {

  /* ══════════ WIDGET BUILDER ══════════ */
  CM.mkWidget = function (sym, iv, saved) {
    if (!window.TradingView || !window.TradingView.widget) { console.error('[chart] TV not loaded'); return null; }
    var dark = CM.dark();
    var scaleFont = window.innerWidth >= 600 ? 13 : 12;
    var cfg = {
      container: '_tvC', autosize: true,
      symbol: sym, interval: iv,
      datafeed: CM.datafeed,
      library_path: 'https://chart.kanba.pw/charting_library/',
      locale: 'en',
      timezone: 'Asia/Kuwait',   // display only — data is always UTC
      theme: dark ? 'Dark' : 'Light',
      overrides: {
        'paneProperties.background': dark ? '#0f172a' : '#f8fafc',
        'paneProperties.backgroundType': 'solid',
        'paneProperties.vertGridProperties.color': dark ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.15)',
        'paneProperties.horzGridProperties.color': dark ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.15)',
        'paneProperties.vertGridProperties.style': 0,
        'paneProperties.horzGridProperties.style': 0,
        'paneProperties.crossHairProperties.color': '#64748b',
        'paneProperties.crossHairProperties.style': 2,
        'paneProperties.crossHairProperties.width': 1,
        'mainSeriesProperties.candleStyle.upColor': '#10b981',
        'mainSeriesProperties.candleStyle.downColor': '#ef4444',
        'mainSeriesProperties.candleStyle.drawBorder': true,
        'mainSeriesProperties.candleStyle.borderUpColor': '#10b981',
        'mainSeriesProperties.candleStyle.borderDownColor': '#ef4444',
        'mainSeriesProperties.candleStyle.wickUpColor': '#10b981',
        'mainSeriesProperties.candleStyle.wickDownColor': '#ef4444',
        'mainSeriesProperties.showPriceLine': true,
        'mainSeriesProperties.priceLineColor': '#8b5cf6',
        'mainSeriesProperties.priceLineWidth': 1,
        'mainSeriesProperties.showCountdown': true,
        'scalesProperties.fontSize': scaleFont,
        'scalesProperties.textColor': dark ? '#94a3b8' : '#64748b',
        'scalesProperties.lineColor': dark ? '#334155' : '#e2e8f0',
        'scalesProperties.backgroundColor': dark ? '#0f172a' : '#f8fafc',
      },
      studies_overrides: {},
      disabled_features: [
        'header_symbol_search', 'symbol_search_hot_key',
        'header_compare', 'symbol_info',
        'border_around_the_chart', 'display_market_status', 'go_to_date',
        'create_volume_indicator_by_default', 'volume_force_overlay',
      ],
      enabled_features: [
        'study_templates', 'side_toolbar_in_fullscreen_mode', 'header_in_fullscreen_mode',
        'horz_touch_drag_scroll', 'vert_touch_drag_scroll', 'pinch_scale',
        'axis_pressed_mouse_move_scale', 'axis_double_clicked_reset_scale',
        'shift_visible_range_on_new_bar', 'pre_post_market_sessions',
        'items_favoriting', 'show_hide_button_in_legend', 'hide_last_na_study_output',
        'adaptive_logo', 'move_logo_to_main_pane',
        'use_localstorage_for_settings', 'save_chart_properties_to_local_storage',
        'chart_property_page_style', 'chart_property_page_scales',
        'chart_property_page_background', 'chart_property_page_timezone_sessions',
        'chart_property_page_trading',
        'force_touch_drag', 'iframe_loading_compatibility_mode',
      ],
      save_load_adapter: CM.buildSLA(sym),
      loading_screen: {
        backgroundColor: dark ? '#0f172a' : '#f8fafc',
        foregroundColor: '#8b5cf6',
      },
      client_id: 'suyula_hl', user_id: 'trader',
      charts_storage_api_version: '1.1',
      fullscreen: false, debug: false,
    };
    if (saved) cfg.saved_data = saved;
    return new window.TradingView.widget(cfg);
  };

  /* ══════════ CHART INIT (full teardown+rebuild) ══════════
     تُستدعى فقط: أول دخول للشارت إطلاقاً، فشل تبديل الفترة، أو فشل
     setSymbol بتبديل الأصل — راجع switchAssetChart بالأسفل. */
  CM.initChart = function (sym, iv, saved) {
    CM.ovrShow(sym);
    CM.linesReady = false; CM.linesPending = false;

    if (CM.widget) {
      CM.clearLines();
      try { CM.widget.remove(); } catch (e) {}
      CM.widget = null;
    }
    if (CM.datafeed) {
      CM.datafeed.destroy();
      CM.datafeed = null;
    }

    var c = document.getElementById('_tvC');
    if (c) c.innerHTML = '';

    CM.datafeed = new CM.Datafeed();
    CM.widget = CM.mkWidget(sym, iv, saved);
    if (!CM.widget) { CM.ovrHide(); return; }

    CM.widget.onChartReady(function () {
      CM.linesReady = true;
      setTimeout(CM.ovrHide, 200);
      CM.execLines();
      if (CM.linesPending) { CM.linesPending = false; CM.execLines(); }

      try {
        CM.widget.chart().onIntervalChanged().subscribe(null, function (newIv) {
          CM.interval = newIv;
          CM.lsSet('iv_' + CM.sym, newIv);
          CM.scheduleAutoSave();
          setTimeout(CM.execLines, 300);
        });
      } catch (e) {}

      try { CM.widget.subscribe('onAutoSaveNeeded', CM.scheduleAutoSave); } catch (e) {}
      setTimeout(CM.doAutoSave, 5000);
    });
  };

  /* ══════════ عدّاد السعر/PnL الحي (كل ثانية بينما الشاشة ظاهرة) ══════════ */
  CM.restartClock = function () {
    clearInterval(CM.clockTimer);
    CM.clockTimer = setInterval(function () {
      if (!CM.visible || typeof State === 'undefined') return;
      var p = State.prices && State.prices[CM.sym] && State.prices[CM.sym].mid;
      if (p) CM.setPrice(CM.sym, p);
      if (Date.now() % 3000 < 1100) { CM.updatePnlBadge(); CM.scheduleLines(); }
      if (CM.assetDropOpen) CM.refreshAssetDropdownPrices();
    }, 1000);
  };

  /* ══════════ PUBLIC API ══════════ */
  CM.open = function (sym) {
    var targetSym = sym || (typeof State !== 'undefined' ? State.asset : 'CL') || 'CL';
    CM.visible = true;

    CM.ensureScreen();

    /* ✅ الودجت جاهز أصلاً — لا هدم/إعادة بناء، فقط استئناف حي */
    if (CM.widget && CM.linesReady) {
      if (targetSym !== CM.sym) {
        CM.switchAssetChart(targetSym);
      } else {
        CM.setHdr(CM.sym);
        CM.bboConn(CM.sym);
      }
      CM.restartClock();
      return;
    }

    /* أول مرة فعلية (أو الودجت فشل/لم يُبنَ بعد) — تهيئة كاملة */
    CM.sym = targetSym;
    var saved = CM.loadLayout();
    var useSaved = saved && saved.sym === CM.sym && saved.content;
    var savedIv = CM.lsGet('iv_' + CM.sym);
    CM.interval = useSaved && saved.interval ? saved.interval : (savedIv && CM.TV_TO_HL[savedIv] ? savedIv : '60');

    CM.setHdr(CM.sym);
    CM.renderFloatTrade();

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        CM.initChart(CM.sym, CM.interval, useSaved ? saved.content : null);
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
    CM.toggleAssetDrop(false); CM.toggleFloatTrade(false);
    if (document.fullscreenElement) { document.exitFullscreen && document.exitFullscreen(); }
  };

  CM.switchInterval = function (iv) {
    if (!iv || iv === CM.interval) return;
    CM.interval = iv; CM.lsSet('iv_' + CM.sym, iv);
    try {
      CM.widget && CM.widget.chart().setResolution(iv);
    } catch (e) {
      requestAnimationFrame(function () {
        CM.clearLines();
        if (CM.widget) { try { CM.widget.remove(); } catch (e2) {} CM.widget = null; }
        if (CM.datafeed) { CM.datafeed.destroy(); CM.datafeed = null; }
        CM.initChart(CM.sym, iv, null);
      });
    }
  };

  /* ══════════ تبديل الأصل — بدون هدم/إعادة بناء الودجت ══════════
     chart().setSymbol() مدعومة رسمياً بـTradingView Advanced Charts
     وتبدّل الرمز على نفس نسخة الودجت الحيّة، بلا أي هدم لـiframe/
     canvas. تراجع تلقائي كامل (initChart) لو فشلت لأي سبب. */
  CM.switchAssetChart = function (sym) {
    if (!CM.visible || sym === CM.sym) return;
    CM.doAutoSave();
    CM.sym = sym;
    CM.setHdr(sym);
    CM.renderFloatTrade();
    CM.bboConn(sym);

    var saved = CM.loadLayout();
    var useSaved = saved && saved.sym === sym && saved.content;
    var savedIv = CM.lsGet('iv_' + sym);
    var nextIv = useSaved && saved.interval ? saved.interval : (savedIv && CM.TV_TO_HL[savedIv] ? savedIv : '60');

    if (CM.widget && CM.linesReady) {
      try {
        var ch = CM.widget.chart();
        if (ch && typeof ch.setSymbol === 'function') {
          CM.ovrShow(sym);
          ch.setSymbol(sym, function () {
            try {
              if (nextIv !== CM.interval && typeof ch.setResolution === 'function') ch.setResolution(nextIv);
            } catch (e) {}
            CM.interval = nextIv;
            CM.lsSet('iv_' + sym, nextIv);
            CM.linesReady = true;
            setTimeout(CM.ovrHide, 150);
            CM.execLines();
          });
          return;
        }
      } catch (e) {
        console.warn('[chart] setSymbol failed, falling back to full reinit', e);
      }
    }

    CM.interval = nextIv;
    requestAnimationFrame(function () { CM.initChart(sym, CM.interval, useSaved ? saved.content : null); });
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
