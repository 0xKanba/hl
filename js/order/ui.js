/* ═══════════════════════════════════════════════════════════════
   js/order/ui.js — بناء DOM لشاشة "فتح صفقة جديدة" (بلا أي CSS —
   التنسيقات كلها بـcss/order.css، ملف حقيقي يُحمَّل من index.html).
   ✅ نفس أسلوب c.js وagents.js بالضبط: overlay ذاتي الحقن (position:
      fixed;inset:0) خارج نظام switchScreen تماماً — يُفتح فوق أي شاشة
      نشطة حالياً (رئيسية/أسواق/رسم)، ويُغلق عائداً لها بلا أي تنسيق
      إضافي مطلوب. z-index:510 (أعلى من 500 المستخدم بـcalMod/agModal
      احتياطاً فقط، لا تعارض فعلي متوقَّع بين overlay وآخر).
═══════════════════════════════════════════════════════════════ */
'use strict';
var OM = window.__om = window.__om || {};

(function () {

  /* ✅ لا CSS هنا بعد الآن — كل تنسيقات هذه الشاشة انتقلت لملف حقيقي
     (css/order.css) يُحمَّل من index.html مع بقية ملفات التنسيق. هذا
     الملف صار DOM فقط: بناء الهيكل + قائمة الأصول. راجع رأس order.css. */

  /* ══════════ DOM SHELL ══════════ */
  OM.ensureScreen = function () {
    if (document.getElementById('omScreen')) return;

    var el = document.createElement('div');
    el.id = 'omScreen';
    el.innerHTML =
      '<div class="om-hdr">' +
        '<button class="om-back" id="omBack">→</button>' +
        '<span class="om-title">فتح صفقة جديدة</span>' +
        '<span style="width:34px"></span>' +
      '</div>' +
      '<div class="om-body" id="omBody">' +

        '<button class="om-asset-btn" id="omAssetBtn">' +
          '<span class="om-asset-icon" id="omAssetIcon">🛢</span>' +
          '<span class="om-asset-name" id="omAssetName">—</span>' +
          '<span class="om-asset-caret">▾</span>' +
        '</button>' +
        '<div class="om-asset-drop" id="omAssetDrop"></div>' +

        '<div class="om-price-block">' +
          '<div class="om-price-big" id="omPriceBig">—</div>' +
          '<div class="om-price-chg" id="omPriceChg">—</div>' +
          '<div class="om-session" id="omSession"></div>' +
        '</div>' +

        '<div class="om-side-row">' +
          '<button class="om-side-btn buy" id="omSideBuy">▲ شراء</button>' +
          '<button class="om-side-btn sell" id="omSideSell">▼ بيع</button>' +
        '</div>' +

        '<div class="om-type-row">' +
          '<button class="om-type-btn" id="omTypeMarket">⚡ سوق</button>' +
          '<button class="om-type-btn" id="omTypeLimit">🎯 طلب بسعر محدد</button>' +
        '</div>' +

        '<div class="om-price-input-wrap hidden" id="omPriceInputWrap">' +
          '<label class="om-lbl">السعر المطلوب</label>' +
          '<input type="number" class="om-price-input" id="omPriceInput" inputmode="decimal" step="any" placeholder="0.00">' +
          '<div class="om-price-badge empty" id="omPriceBadge"></div>' +
        '</div>' +

        '<div class="om-qty-row">' +
          '<label class="om-lbl">الكمية</label>' +
          '<div class="om-qty-inner">' +
            '<input type="number" class="om-qty-input" id="omQtyInput" inputmode="decimal" step="any" placeholder="0.00">' +
            '<span class="om-qty-unit" id="omQtyUnit">—</span>' +
          '</div>' +
          '<div class="om-qty-quick">' +
            '<button class="om-qty-btn" data-om-pct="25">25%</button>' +
            '<button class="om-qty-btn" data-om-pct="50">50%</button>' +
            '<button class="om-qty-btn" data-om-pct="75">75%</button>' +
            '<button class="om-qty-btn" data-om-pct="100">100%</button>' +
          '</div>' +
        '</div>' +

        '<button class="om-tpsl-toggle" id="omTpslToggle">+ إضافة جني ربح / وقف خسارة (اختياري)</button>' +
        '<div class="om-tpsl-wrap hidden" id="omTpslWrap">' +
          '<div class="om-tpsl-row">' +
            '<label class="om-lbl">🎯 جني الربح</label>' +
            '<input type="number" class="om-tpsl-input" id="omTpInput" inputmode="decimal" step="any" placeholder="اختياري">' +
          '</div>' +
          '<div class="om-tpsl-row">' +
            '<label class="om-lbl">🛡 وقف الخسارة</label>' +
            '<input type="number" class="om-tpsl-input" id="omSlInput" inputmode="decimal" step="any" placeholder="اختياري">' +
          '</div>' +
        '</div>' +

        '<div class="om-preview" id="omPreview"></div>' +

        '<div class="om-depth-wrap om-depth-loading" id="omDepthWrap">' +
          '<div class="om-depth-hdr"><span>📊 عمق السوق</span><span class="om-spread" id="omSpreadVal">السبريد: —</span></div>' +
          '<div class="om-depth-side" id="omDepthAsks"></div>' +
          '<div class="om-depth-mid" id="omDepthMid">—</div>' +
          '<div class="om-depth-side" id="omDepthBids"></div>' +
        '</div>' +

      '</div>' +
      '<div class="om-footer"><button class="om-submit" id="omSubmit">فتح الصفقة</button></div>' +

      '<div class="om-confirm-ov" id="omConfirmOv">' +
        '<div class="om-confirm-card">' +
          '<div class="om-confirm-hdl"></div>' +
          '<div class="om-confirm-title" id="omConfirmTitle">—</div>' +
          '<div class="om-confirm-body" id="omConfirmBody"></div>' +
          '<div class="om-confirm-btns">' +
            '<button class="om-confirm-cancel" id="omConfirmCancel">إلغاء</button>' +
            '<button class="om-confirm-exec" id="omConfirmExec">تأكيد</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(el);
    OM.buildAssetDropdown();
  };

  /* ══════════ قائمة اختيار الأصل ══════════ */
  OM.buildAssetDropdown = function () {
    var el = document.getElementById('omAssetDrop');
    if (!el) return;
    el.innerHTML = OM.NAV_ASSETS.map(function (a) {
      return '<div class="om-ad-row" data-om-sym="' + a.sym + '">' +
        '<span class="om-ad-icon">' + a.icon + '</span>' +
        '<span class="om-ad-name">' + a.ar + '</span>' +
        '<span class="om-ad-px" id="omAdPx_' + a.sym + '">—</span>' +
      '</div>';
    }).join('');
  };

  OM.refreshAssetDropdownPrices = function () {
    if (typeof State === 'undefined') return;
    OM.NAV_ASSETS.forEach(function (a) {
      var el = document.getElementById('omAdPx_' + a.sym);
      if (!el) return;
      var p = State.prices && State.prices[a.sym] && State.prices[a.sym].mid;
      if (p) el.textContent = '$' + fmt(p, OM.asset(a.sym).pxDp);
    });
  };

  OM.markActiveAssetInDropdown = function (sym) {
    document.querySelectorAll('#omAssetDrop .om-ad-row').forEach(function (r) {
      r.classList.toggle('active', r.dataset.omSym === sym);
    });
  };

})();
