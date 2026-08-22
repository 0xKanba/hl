/* ═══════════════════════════════════════════════════════════════
   js/chart/state.js — الحالة الداخلية المشتركة لوحدة الرسم البياني
   ✅ جديد — chart.js انقسم لعدة ملفات هنا (js/chart/*.js) بطلب مباشر
      لتسهيل الترتيب/الصيانة بدل ملف واحد ضخم. لا حزمة/bundler بهذا
      المشروع (سكربتات كلاسيكية بترتيب محدد بـindex.html)، فكل ملفات
      js/chart/*.js تشارك حالة واحدة عبر الكائن الداخلي CM (Chart
      Module) — window.__cm. هذا الملف (يُحمَّل أولاً) يُنشئه، وبقية
      الملفات (datafeed.js → ui.js → trading.js → index.js) تتوسّع
      فيه بالترتيب. آخرها (index.js) يجمع الواجهة العامة النهائية
      window.ChartModule — بلا أي تغيير على app.js (ما زال يستدعي فقط
      ChartModule.open()/close()/switchInterval()/switchAssetChart()/
      refreshLines() كما كان بالضبط).
   ⚠️ ملاحظة تقنية مهمة: `CM` هنا مُعرَّف بـ`var` عمداً وليس `const` —
      كل ملف بمجلد js/chart/ يكرّر نفس السطر (`var CM = window.__cm =
      window.__cm || {};`) لأن `let`/`const` بمستوى السكربت الأعلى
      يتشارك نطاقاً معجمياً واحداً عبر كل وسوم <script> الكلاسيكية
      بالصفحة (بعكس `var`) — إعادة تعريف نفس اسم `const` بملفين
      منفصلين يرمي SyntaxError فوراً ويكسر الصفحة بالكامل. `var` وحده
      يسمح بإعادة التعريف الآمنة عبر الملفات. كل شيء آخر بكل ملف يعيش
      داخل IIFE خاصة به (بلا أي تسريب لأسماء عامة تتعارض مع بقية
      المشروع)، ويُلحَق بـCM فقط عند الحاجة الفعلية للمشاركة بين الملفات.
═══════════════════════════════════════════════════════════════ */
'use strict';
var CM = window.__cm = window.__cm || {};

(function () {

  /* ══════════ CONSTANTS ══════════ */
  CM.HL_API     = 'https://api.hyperliquid.xyz';
  CM.TROY       = 31.1035;
  CM.MIN_TIME   = 1577836800000;          // 2020-01-01 00:00 UTC
  CM.LS_PREFIX  = 'hl_tv_';
  CM.LAYOUT_KEY = 'layout_v1';

  CM.TV_RESOLUTIONS = ['1','3','5','15','30','60','120','240','1D','1W'];

  CM.TV_TO_HL = {
    '1':'1m','3':'3m','5':'5m','15':'15m','30':'30m',
    '60':'1h','120':'2h','240':'4h','1D':'1d','1W':'1d'
  };

  /* ✅ نفس قائمة الأصول القديمة (كانت _tvNav) — الآن مصدر بيانات
     القائمة المنسدلة (أسعارها) بدل صف أزرار ثابت (راجع ui.js). */
  CM.NAV_ASSETS = [
    { sym:'CL',     ar:'النفط',     icon:'🛢'  },
    { sym:'GOLD',   ar:'الذهب',     icon:'🟡'  },
    { sym:'XAU',    ar:'غرام ذهب',  icon:'⚖️'  },
    { sym:'SILVER', ar:'الفضة',     icon:'⚪'  },
    { sym:'NQ',     ar:'ناسداك',    icon:'📊'  },
  ];

  /* ══════════ MODULE STATE (مشترك بين كل ملفات js/chart/) ══════════ */
  CM.widget       = null;
  CM.datafeed     = null;
  CM.visible      = false;
  CM.sym          = 'CL';
  CM.interval     = '60';
  CM.clockTimer   = null;
  CM.saveTimer    = null;
  CM.prices       = {};
  CM.bboUnsub     = null;
  CM.bboSym       = '';
  CM.lines        = [];
  CM.linesReady   = false;
  CM.linesPending = false;
  CM.assetDropOpen  = false;
  CM.floatTradeOpen = false;

  /* ══════════ HELPERS ══════════ */
  CM.lsGet = function (k) { try { return JSON.parse(localStorage.getItem(CM.LS_PREFIX + k)); } catch (e) { return null; } };
  CM.lsSet = function (k, v) { try { localStorage.setItem(CM.LS_PREFIX + k, JSON.stringify(v)); } catch (e) {} };

  CM.asset = function (s) {
    return (typeof ASSETS !== 'undefined' && ASSETS[s]) ||
      { pxDp: 2, szDp: 2, name: s, icon: '📊', unit: '', lev: 10, idx: 0, cross: true, coin: 'xyz:' + s };
  };

  CM.coin = function (s) {
    if (s === 'XAU') return 'xyz:GOLD';
    var a = CM.asset(s);
    return a.coin || ('xyz:' + s);
  };

  CM.isGram = function (s) { return s === 'XAU'; };
  CM.toDisp = function (s, v) { return CM.isGram(s) ? v / CM.TROY : v; };
  CM.toOz   = function (s, v) { return CM.isGram(s) ? v * CM.TROY : v; };
  CM.dark   = function () { return (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark'; };

  /* ══════════ UTC TIME NORMALIZATION ══════════
     Every timestamp is snapped to the exact interval boundary via
     floor (never rounds up/forward — verified case by case). No
     drift, no timezone shifts, no manual compensation. */
  CM.normTime = function (ms, res) {
    var d = new Date(ms);
    switch (res) {
      case '1':
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes());
      case '3': {
        var m3 = d.getUTCMinutes();
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), m3 - (m3 % 3));
      }
      case '5': {
        var m5 = d.getUTCMinutes();
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), m5 - (m5 % 5));
      }
      case '15': {
        var m15 = d.getUTCMinutes();
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), m15 - (m15 % 15));
      }
      case '30': {
        var m30 = d.getUTCMinutes();
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), m30 - (m30 % 30));
      }
      case '60':
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours());
      case '120': {
        var h2 = d.getUTCHours();
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h2 - (h2 % 2));
      }
      case '240': {
        var h4 = d.getUTCHours();
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h4 - (h4 % 4));
      }
      case '1D':
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      case '1W': {
        var dow = d.getUTCDay();                  // 0=Sun … 6=Sat
        var back = dow === 0 ? 6 : dow - 1;        // days since Monday
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back);
      }
      default:
        return ms;
    }
  };

  CM.weekStart = function (ms) { return CM.normTime(ms, '1W'); };

})();
