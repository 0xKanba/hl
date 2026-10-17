/* ═══════════════════════════════════════════════════════════════
   js/chart/state.js — الحالة الداخلية المشتركة لوحدة الرسم البياني
   (نفس البنية: كائن CM مشترك عبر js/chart/*.js، و`var` عمداً لا `const`).

   ✅ الجولة الجديدة:
      • LAYOUT_KEY → layout_v2: النسخة v1 كانت تحمل خصائص قديمة (شبكة +
        خط سعر) تُعيدها TradingView عند الاستعادة فوق إعداداتنا النظيفة.
      • TPL_KEY: قوالب مسمّاة محلية (localStorage) — راجع ui.js.
      • TOOLS_KEY / INSTANT_KEY: وضع الأدوات المتقدمة · التنفيذ الفوري.
      • lsSet تُرجع true/false (كان يبتلع فشل الحصة بصمت).
═══════════════════════════════════════════════════════════════ */
'use strict';
var CM = window.__cm = window.__cm || {};

(function () {

  /* ══════════ CONSTANTS ══════════ */
  CM.HL_API     = 'https://api.hyperliquid.xyz';
  CM.TROY       = 31.1035;
  CM.MIN_TIME   = 1577836800000;          // 2020-01-01 00:00 UTC
  CM.LS_PREFIX  = 'hl_tv_';
  CM.LAYOUT_KEY = 'layout_v2';
  CM.TPL_KEY    = 'tpl_v1';
  CM.TOOLS_KEY  = 'tools_on';
  CM.INSTANT_KEY = 'instant_on';

  CM.TV_RESOLUTIONS = ['1','3','5','15','30','60','120','240','1D','1W'];

  CM.TV_TO_HL = {
    '1':'1m','3':'3m','5':'5m','15':'15m','30':'30m',
    '60':'1h','120':'2h','240':'4h','1D':'1d','1W':'1d'
  };

  CM.NAV_ASSETS = [
    { sym:'CL',     ar:'النفط',     icon:'🛢'  },
    { sym:'GOLD',   ar:'الذهب',     icon:'🟡'  },
    { sym:'XAU',    ar:'غرام ذهب',  icon:'⚖️'  },
    { sym:'SILVER', ar:'الفضة',     icon:'⚪'  },
    { sym:'NQ',     ar:'ناسداك',    icon:'📊'  },
  ];

  /* ══════════ MODULE STATE ══════════ */
  CM.widget       = null;
  CM.datafeed     = null;
  CM.visible      = false;
  CM.sym          = 'CL';
  CM.interval     = '60';
  CM.clockTimer   = null;
  CM.clockTick    = 0;
  CM.saveTimer    = null;
  CM.prices       = {};
  CM.bboUnsub     = null;
  CM.bboSym       = '';
  CM.lines        = [];
  CM.linesSig     = '';
  CM.entryLine    = null;
  CM.entryTxt     = '';
  CM.linesReady   = false;
  CM.linesPending = false;
  CM.assetDropOpen  = false;
  CM.floatTradeOpen = false;
  CM.menuOpen       = false;
  CM.trading        = false;

  /* ══════════ HELPERS ══════════ */
  CM.lsGet = function (k) { try { return JSON.parse(localStorage.getItem(CM.LS_PREFIX + k)); } catch (e) { return null; } };
  CM.lsSet = function (k, v) {
    try { localStorage.setItem(CM.LS_PREFIX + k, JSON.stringify(v)); return true; }
    catch (e) { return false; }
  };

  CM.toolsOn = !!CM.lsGet(CM.TOOLS_KEY);
  CM.instant = !!CM.lsGet(CM.INSTANT_KEY);

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

  CM.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  CM.say = function (msg, type, dur) { if (typeof toast === 'function') toast(msg, type || 'info', dur); };

  /* TradingView قد تُرجع 'D'/'W' بدل '1D'/'1W' بحسب الإصدار */
  CM.normIv = function (r) {
    r = String(r || '');
    if (r === 'D') return '1D';
    if (r === 'W') return '1W';
    return r;
  };

  /* ══════════ UTC TIME NORMALIZATION ══════════ */
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
        var dow = d.getUTCDay();
        var back = dow === 0 ? 6 : dow - 1;
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back);
      }
      default:
        return ms;
    }
  };

  CM.weekStart = function (ms) { return CM.normTime(ms, '1W'); };

})();
