/* ═══════════════════════════════════════════════════════════════
   js/order/bar.js — شريط "فتح صفقة جديدة" بشاشة الرئيسية.
   ✅ بلا أي HTML بـindex.html — يُبنى هنا وقت التشغيل (كـc.js وagents.js).
      index.html مُحمِّل فقط: link/script + الصدفة الثابتة.
   ✅ يحل محل بانر الضيف القديم (.guest-banner) نهائياً. الضيف لا يفقد
      التوجيه: OrderModule.open() تستدعي _promptConnect() أولاً.
   ✅ التوقيت: إدراج فوري (readyState)، لا انتظار شبكة/محفظة، وبناء مسبق
      لهيكل الشاشة وقت الخمول (requestIdleCallback، مهلة 2.5 ثانية).
═══════════════════════════════════════════════════════════════ */
'use strict';
var OM = window.__om = window.__om || {};

(function () {

  var BAR_ID    = 'omBar';
  var MAX_TRIES = 20;

  function _openOrder() {
    if (typeof OrderModule === 'undefined' || typeof OrderModule.open !== 'function') return;
    OrderModule.open(typeof State !== 'undefined' ? State.asset : null);
  }

  function _build() {
    if (document.getElementById(BAR_ID)) return true;
    var host = document.querySelector('#screenHome .screen-scroll');
    if (!host) return false;

    var bar = document.createElement('div');
    bar.id        = BAR_ID;
    bar.className = 'om-bar';
    bar.setAttribute('role', 'button');
    bar.setAttribute('tabindex', '0');
    bar.innerHTML =
      '<span class="om-bar-lbl">فتح صفقة جديدة</span>' +
      '<button class="om-bar-btn" type="button" tabindex="-1">فتح</button>';

    bar.addEventListener('click', _openOrder);
    bar.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _openOrder(); }
    });

    host.insertBefore(bar, host.firstChild);
    return true;
  }

  function _prebuild() {
    try {
      if (typeof OM.ensureScreen === 'function') OM.ensureScreen();
      if (!OM._wired && typeof OM._wireEvents === 'function') { OM._wireEvents(); OM._wired = true; }
    } catch (e) { console.warn('[order/bar] prebuild', e); }
  }

  function _init(tries) {
    if (!_build() && (tries || 0) < MAX_TRIES) {
      requestAnimationFrame(function () { _init((tries || 0) + 1); });
      return;
    }
    var idle = window.requestIdleCallback || function (cb) { return setTimeout(cb, 500); };
    idle(_prebuild, { timeout: 2500 });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { _init(0); });
  else _init(0);

})();
