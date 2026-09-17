/* ═══════════════════════════════════════════════════════════════
   js/order/index.js — المنسّق النهائي: فتح/إغلاق الشاشة، كل ربط
   الأحداث، تدفّق التأكيد والتنفيذ، ومراقب "الأقواس المعلّقة".

   ✅ مراقب الأقواس المعلّقة (pending bracket watcher) — لماذا يوجد:
      أمر الإيقاف (trigger, غير reduce-only) يُرسَل وحده (لا حزمة
      normalTpsl معه — راجع تعليق logic.js). لو طلب المستخدم TP/SL
      معه، نُخزِّنهما محلياً (معزول بعنوان المحفظة، مطابقاً State
      isolation المعتمد بكل المشروع) ونراقب: هل اختفى هذا الـoid تحديداً
      من State.openOrders؟ لو اختفى وظهر فعلاً بـState.fillsCache (تأكيد
      أنه *نُفِّذ* لا أُلغي فقط) → نُلحق TP/SL فوراً عبر placeNativeTpsl
      نفسها المستخدمة أصلاً لأي صفقة قائمة (tpsl.js) — لا مسار موازٍ.
      المراقبة تستأنف تلقائياً عند أي اتصال محفظة جديد فيه أوامر معلّقة
      محفوظة من جلسة سابقة (راجع resumePendingWatch + auth.js).
═══════════════════════════════════════════════════════════════ */
'use strict';
var OM = window.__om = window.__om || {};

(function () {

  /* ══════════ فتح/إغلاق الشاشة ══════════ */
  OM.open = function (sym) {
    if (typeof State === 'undefined') return;
    if (State.isGuest) { if (typeof _promptConnect === 'function') _promptConnect(); return; }

    var target = (sym && typeof ASSETS !== 'undefined' && ASSETS[sym]) ? sym : (State.asset || 'CL');

    OM.ensureScreen();
    if (!OM._wired) { OM._wireEvents(); OM._wired = true; }

    OM.sym      = target;
    OM.side     = true;
    OM.tpslOpen = false;
    OM.mode     = 'market';

    var priceEl = document.getElementById('omPriceInput'); if (priceEl) priceEl.value = '';
    var qtyEl   = document.getElementById('omQtyInput');   if (qtyEl)   qtyEl.value   = OM._qtyDefault(target);
    var tpEl    = document.getElementById('omTpInput');    if (tpEl)    tpEl.value    = '';
    var slEl    = document.getElementById('omSlInput');    if (slEl)    slEl.value    = '';
    OM._qtyUserEdited = false;

    OM._setMode('market');
    OM._setSide(true);
    OM._toggleTpsl(false);

    OM._renderHeader(target);
    OM._updateChg(target);
    OM._updateSession(target);
    OM.markActiveAssetInDropdown(target);
    OM.toggleAssetDrop(false);

    OM._paint = {};
    OM._bboConn(target);
    OM.bookConn(target);
    /* بالتوازي، بلا انتظار: نطاق الجلسة لهذا الأصل تحديداً (session.js
       تستطلع الأصل النشط عالمياً فقط، وقد يكون المختار هنا غيره). */
    if (typeof fetchSessionStats === 'function') { try { fetchSessionStats(target); } catch (e) {} }
    OM._refreshBadgeAndPreview();

    OM.visible = true;
    document.getElementById('omScreen').classList.add('open');

    OM._startPendingWatch();
  };

  OM.close = function () {
    OM.visible = false;
    document.getElementById('omScreen')?.classList.remove('open');
    OM._bboClose();
    OM.bookClose();
    OM.toggleAssetDrop(false);
    OM._hideConfirm();
  };

  OM._qtyDefault = function (sym) {
    var a = OM.asset(sym);
    return (a.presets && a.presets[0]) || 1;
  };

  /* ══════════ رأس الشاشة (أيقونة/اسم/وحدة) ══════════ */
  OM._renderHeader = function (sym) {
    var a = OM.asset(sym);
    var ic = document.getElementById('omAssetIcon'); if (ic) ic.textContent = a.icon;
    var nm = document.getElementById('omAssetName');  if (nm) nm.textContent = a.name;
    var un = document.getElementById('omQtyUnit');    if (un) un.textContent = a.unit;
    var p  = State.prices[sym] && State.prices[sym].mid;
    var pe = document.getElementById('omPriceBig');
    if (pe) { pe.textContent = p ? '$' + fmt(p, a.pxDp) : '—'; pe.dataset.p = p || 0; pe.className = 'om-price-big'; }
  };

  OM._updateChg = function (sym) {
    var el = document.getElementById('omPriceChg');
    if (!el || typeof State === 'undefined') return;
    var mid     = State.prices[sym] && State.prices[sym].mid;
    var prevDay = State.prevDayPx[sym];
    if (!mid || !prevDay) { el.textContent = '—'; el.className = 'om-price-chg'; return; }
    var chg = ((mid - prevDay) / prevDay) * 100;
    el.textContent = (chg >= 0 ? '+' : '') + chg.toFixed(2) + '% (24س)';
    el.className   = 'om-price-chg ' + (chg > 0.005 ? 'up' : chg < -0.005 ? 'dn' : '');
  };

  /* ✅ نطاق الجلسة (افتتاح/أعلى/أدنى منذ 12 صباحاً UTC+3) — يُعاد
     استخدام State.sessionStats المُعبّأة أصلاً بـsession.js (كانت
     تُجلب كل 3 دقائق بلا أي مستهلك بعد حذف بطاقة السعر القديمة).
     معلومة عملية مباشرة هنا: تساعد على اختيار سعر حدّي/إيقاف منطقي. */
  OM._updateSession = function (sym) {
    var el = document.getElementById('omSession');
    if (!el || typeof State === 'undefined') return;
    var st = State.sessionStats && State.sessionStats[sym];
    var a  = OM.asset(sym);
    if (!st || !st.open) { el.innerHTML = ''; return; }
    el.innerHTML =
      '<span>افتتاح ' + fmt(st.open, a.pxDp) + '</span>' +
      '<span class="sd">·</span><span class="sh">أعلى ' + fmt(st.high, a.pxDp) + '</span>' +
      '<span class="sd">·</span><span class="sl">أدنى ' + fmt(st.low, a.pxDp) + '</span>';
  };

  /* ══════════ السعر الحي (BBO مخصّص، بلا تكلفة شبكة إضافية —
     ws.js يُوحِّد الاشتراكات بنفس المفتاح؛ نفس نمط chart/ui.js:bboConn) ══════════ */
  OM._bboConn = function (sym) {
    OM._bboClose();
    if (typeof HL === 'undefined') return;
    OM.bboUnsub = HL.subscribe({ type: 'bbo', coin: OM.coin(sym) }, function (data) {
      var b  = parseFloat((data.bbo && data.bbo[0] && data.bbo[0].px) || 0);
      var ak = parseFloat((data.bbo && data.bbo[1] && data.bbo[1].px) || 0);
      var mid = b && ak ? (b + ak) / 2 : 0;
      if (!mid) return;
      var raw = (data.coin || '').indexOf(':') >= 0 ? data.coin.split(':')[1] : data.coin;
      OM._onPrice(sym, sym === 'XAU' && raw === 'GOLD' ? mid / TROY : mid);
    });
  };
  OM._bboClose = function () {
    if (OM.bboUnsub) { try { OM.bboUnsub(); } catch (e) {} OM.bboUnsub = null; }
  };
  OM._onPrice = function (sym, midDisp) {
    if (sym !== OM.sym || !OM.visible) return;
    var a  = OM.asset(sym);
    var el = document.getElementById('omPriceBig');
    if (el) {
      var prev = parseFloat(el.dataset.p || 0);
      var txt  = '$' + fmt(midDisp, a.pxDp);
      /* كتابة مشروطة: نص مطابق لما هو معروض = صفر فائدة، وتكلفة تخطيط
         محتملة بكل نبضة. اللون يتغيّر فقط عند تغيّر فعلي بالاتجاه. */
      if (OM._paint.px !== txt) {
        el.textContent = txt;
        el.className   = 'om-price-big' + (midDisp > prev ? ' up' : midDisp < prev ? ' dn' : '');
        el.dataset.p   = midDisp;
        OM._paint.px   = txt;
      }
    }
    OM._updateChg(sym);
    OM._scheduleRefresh();
  };

  /* تجميع كل تحديثات الإطار الواحد بنداء واحد — راجع _rafPending
     بـstate.js. أي مصدر (نبضة سعر، كتابة بحقل، تبديل جهة/نوع) يمر
     من هنا، فلا تتسابق مصادر متعددة على إعادة بناء نفس المعاينة
     عدة مرات قبل أن يرسم المتصفح إطاراً واحداً أصلاً. */
  OM._scheduleRefresh = function () {
    if (OM._rafPending) return;
    OM._rafPending = true;
    requestAnimationFrame(function () {
      OM._rafPending = false;
      if (OM.visible) OM._refreshBadgeAndPreview();
    });
  };

  /* ══════════ تبديل الأصل من داخل الشاشة ══════════ */
  OM.switchAsset = function (sym) {
    if (!ASSETS[sym]) return;
    OM.toggleAssetDrop(false);
    if (sym === OM.sym) return;
    OM.sym = sym;

    var priceEl = document.getElementById('omPriceInput'); if (priceEl) priceEl.value = '';
    var qtyEl   = document.getElementById('omQtyInput');   if (qtyEl)   qtyEl.value   = OM._qtyDefault(sym);
    var tpEl    = document.getElementById('omTpInput');    if (tpEl)    tpEl.value    = '';
    var slEl    = document.getElementById('omSlInput');    if (slEl)    slEl.value    = '';
    OM._qtyUserEdited = false;
    if (OM.mode === 'priced') OM._setMode('market'); /* السعر كان بمقياس الأصل القديم — أبسط إعادة ضبط آمنة */

    /* ✅ تبديل الأصل هنا يُبدّل الأصل النشط بالتطبيق كله (بطاقة الأسواق
       النشطة، الرسم البياني، وجلب إحصائيات الجلسة لهذا الأصل) — مصدر
       واحد للحقيقة بدل حالة محلية تنحرف عن بقية الشاشات. */
    if (typeof switchAsset === 'function') { try { switchAsset(sym); } catch (e) {} }

    OM._renderHeader(sym);
    OM._updateChg(sym);
    OM._updateSession(sym);
    OM.markActiveAssetInDropdown(sym);

    OM._paint = {};
    OM._bboConn(sym);
    OM.bookConn(sym);
    if (typeof fetchSessionStats === 'function') { try { fetchSessionStats(sym); } catch (e) {} }
    OM._refreshBadgeAndPreview();
  };

  OM.toggleAssetDrop = function (force) {
    var el  = document.getElementById('omAssetDrop');
    var btn = document.getElementById('omAssetBtn');
    if (!el) return;
    var open = force !== undefined ? force : !OM.assetDropOpen;
    OM.assetDropOpen = open;
    el.classList.toggle('open', open);
    if (btn) btn.classList.toggle('open', open);
    if (open) { OM.refreshAssetDropdownPrices(); OM.markActiveAssetInDropdown(OM.sym); }
  };

  /* ══════════ شراء/بيع، سوق/طلب بسعر محدد ══════════ */
  OM._setSide = function (isBuy) {
    OM.side = isBuy;
    var b = document.getElementById('omSideBuy'), s = document.getElementById('omSideSell');
    if (b) b.classList.toggle('active', isBuy);
    if (s) s.classList.toggle('active', !isBuy);
    OM._refreshBadgeAndPreview();
  };

  OM._setMode = function (mode) {
    OM.mode = mode;
    var mb = document.getElementById('omTypeMarket'), lb = document.getElementById('omTypeLimit');
    if (mb) mb.classList.toggle('active', mode === 'market');
    if (lb) lb.classList.toggle('active', mode === 'priced');
    var wrap = document.getElementById('omPriceInputWrap');
    if (wrap) wrap.classList.toggle('hidden', mode !== 'priced');
    OM._refreshBadgeAndPreview();
  };

  OM._toggleTpsl = function (force) {
    OM.tpslOpen = force !== undefined ? force : !OM.tpslOpen;
    var wrap = document.getElementById('omTpslWrap');
    var btn  = document.getElementById('omTpslToggle');
    if (wrap) wrap.classList.toggle('hidden', !OM.tpslOpen);
    if (btn)  btn.textContent = OM.tpslOpen
      ? '− إخفاء جني الربح / وقف الخسارة'
      : '+ إضافة جني ربح / وقف خسارة (اختياري)';
  };

  OM._applyQtyPct = function (pct) {
    if (typeof State === 'undefined' || State.isGuest || !State.wallet) return;
    var sym = OM.sym, a = OM.asset(sym);
    var bal = (State.balance && (State.balance.available || State.balance.total)) || 0;
    var px  = State.prices[sym] && State.prices[sym].mid;
    if (!bal || !px) { toast('رصيد أو سعر غير متاح الآن', 'err'); return; }
    var qty = (bal * a.lev * (pct / 100)) / px;
    var input = document.getElementById('omQtyInput');
    if (input) { input.value = wire(qty, a.szDp); OM._qtyUserEdited = true; }
    OM._refreshBadgeAndPreview();
  };

  /* ══════════ شارة نوع الأمر + المعاينة الحيّة + نص زر الإرسال ══════════ */
  OM._refreshBadgeAndPreview = function () {
    var sym = OM.sym;
    var midDisp   = State.prices[sym] && State.prices[sym].mid;
    var qtyDisp   = parseFloat((document.getElementById('omQtyInput') || {}).value || 0);
    var priceDisp = OM.mode === 'priced' ? parseFloat((document.getElementById('omPriceInput') || {}).value || 0) : 0;

    var badge = document.getElementById('omPriceBadge');
    if (badge) {
      if (OM.mode !== 'priced' || !priceDisp || !midDisp) {
        badge.className = 'om-price-badge empty';
        badge.textContent = '';
      } else {
        var cls = OM.classify(OM.side, priceDisp, midDisp);
        if (cls === 'limit') {
          badge.className   = 'om-price-badge limit';
          badge.textContent = '📥 أمر حدّي — سيُنفَّذ فوراً إن توفّر بالسوق الآن، أو ينتظر بقائمة الأوامر حتى يصل السعر لهذا المستوى';
        } else {
          badge.className   = 'om-price-badge stop';
          badge.textContent = '⚡ أمر إيقاف — سيُنفَّذ تلقائياً بسعر السوق فور وصول سعر ' + OM.asset(sym).name + ' لهذا المستوى بالضبط';
        }
      }
    }

    var refDisp = OM.mode === 'market' ? midDisp : priceDisp;
    var prev = OM.buildPreview(sym, OM.side, qtyDisp, refDisp);
    var avail = (State.balance && State.balance.available) || 0;
    var blockReason = null;
    if (prev) {
      if (prev.usd < OM.MIN_ORDER_USD)  blockReason = '⚠️ أقل من الحد الأدنى $' + OM.MIN_ORDER_USD + ' لقيمة الأمر';
      else if (prev.margin > avail)     blockReason = '❌ الهامش المطلوب أكبر من رصيدك المتاح ($' + avail.toFixed(2) + ')';
    }

    var pv = document.getElementById('omPreview');
    if (pv) {
      pv.innerHTML = !prev ? '' :
        OM._prevRow('القيمة التقريبية', '≈ $' + prev.usd.toFixed(2)) +
        OM._prevRow('الهامش المطلوب', '≈ $' + prev.margin.toFixed(2), 'warn') +
        OM._prevRow('⚡ التصفية التقريبية', prev.liqText, 'warn') +
        OM._prevRow('الرسوم (' + prev.feePct + ')', '$' + prev.feeOpen.toFixed(4)) +
        (blockReason ? '<div class="om-prev-row om-prev-block">' + blockReason + '</div>' : '');
    }

    var submitBtn = document.getElementById('omSubmit');
    if (submitBtn) {
      submitBtn.className = 'om-submit ' + (OM.side ? 'buy' : 'sell');
      submitBtn.disabled = !!blockReason;
      var label;
      if (OM.mode === 'market') {
        label = OM.side ? '🚀 شراء بالسوق' : '🚀 بيع بالسوق';
      } else {
        var cls2 = (midDisp && priceDisp) ? OM.classify(OM.side, priceDisp, midDisp) : null;
        label = cls2 === 'stop' ? '⚡ وضع أمر إيقاف' : cls2 === 'limit' ? '📥 وضع أمر حدّي' : 'أدخل السعر أولاً';
      }
      submitBtn.textContent = label;
    }
  };
  OM._prevRow = function (k, v, cls) {
    return '<div class="om-prev-row"><span class="om-prev-k">' + k + '</span><span class="om-prev-v' + (cls ? ' ' + cls : '') + '">' + v + '</span></div>';
  };

  /* ══════════ ربط الأحداث — مرة واحدة فقط ══════════ */
  OM._wireEvents = function () {
    document.getElementById('omBack').onclick = OM.close;

    document.getElementById('omAssetBtn').onclick = function (e) { e.stopPropagation(); OM.toggleAssetDrop(); };
    document.getElementById('omAssetDrop').addEventListener('click', function (e) {
      var row = e.target.closest('.om-ad-row');
      if (row) OM.switchAsset(row.dataset.omSym);
    });
    document.addEventListener('click', function (e) {
      var drop = document.getElementById('omAssetDrop');
      var btn  = document.getElementById('omAssetBtn');
      if (drop && OM.assetDropOpen && !drop.contains(e.target) && (!btn || !btn.contains(e.target))) OM.toggleAssetDrop(false);
    });

    document.getElementById('omSideBuy').onclick  = function () { OM._setSide(true); };
    document.getElementById('omSideSell').onclick = function () { OM._setSide(false); };
    document.getElementById('omTypeMarket').onclick = function () { OM._setMode('market'); };
    document.getElementById('omTypeLimit').onclick  = function () { OM._setMode('priced'); };

    document.getElementById('omPriceInput').addEventListener('input', OM._scheduleRefresh);
    document.getElementById('omQtyInput').addEventListener('input', function () { OM._qtyUserEdited = true; OM._scheduleRefresh(); });
    document.getElementById('omTpInput').addEventListener('input', OM._scheduleRefresh);
    document.getElementById('omSlInput').addEventListener('input', OM._scheduleRefresh);

    document.querySelectorAll('.om-qty-btn').forEach(function (b) {
      b.onclick = function () { OM._applyQtyPct(parseFloat(b.dataset.omPct)); };
    });

    document.getElementById('omTpslToggle').onclick = function () { OM._toggleTpsl(); };

    document.getElementById('omDepthWrap').addEventListener('click', function (e) {
      var row = e.target.closest('.om-drow');
      if (!row) return;
      var px = row.dataset.omPx; if (!px) return;
      if (OM.mode !== 'priced') OM._setMode('priced');
      var input = document.getElementById('omPriceInput');
      if (input) { input.value = parseFloat(px).toFixed(OM.asset(OM.sym).pxDp); OM._refreshBadgeAndPreview(); }
    });

    document.getElementById('omSubmit').onclick = OM._onSubmit;
    document.getElementById('omConfirmCancel').onclick = OM._hideConfirm;
    document.getElementById('omConfirmExec').onclick = function () {
      if (typeof requirePin === 'function') requirePin(OM._execute);
      else OM._execute();
    };
    document.getElementById('omConfirmOv').addEventListener('click', function (e) {
      if (e.target.id === 'omConfirmOv') OM._hideConfirm();
    });
  };

  /* ══════════ تأكيد الأمر ══════════ */
  OM._onSubmit = function () {
    var sym = OM.sym;
    var midDisp = State.prices[sym] && State.prices[sym].mid;
    if (!midDisp) { toast('لا يوجد سعر — السوق مغلق؟', 'err'); return; }

    var qtyDisp = parseFloat((document.getElementById('omQtyInput') || {}).value || 0);
    if (!qtyDisp || qtyDisp <= 0) return toast('أدخل الكمية أولاً', 'err');

    var priceDisp = 0;
    if (OM.mode === 'priced') {
      priceDisp = parseFloat((document.getElementById('omPriceInput') || {}).value || 0);
      if (!priceDisp || priceDisp <= 0) return toast('أدخل السعر المطلوب', 'err');
    }

    var tpDisp = parseFloat((document.getElementById('omTpInput') || {}).value || 0) || 0;
    var slDisp = parseFloat((document.getElementById('omSlInput') || {}).value || 0) || 0;

    var refDisp = OM.mode === 'market' ? midDisp : priceDisp;
    var vErr = OM.validateTpSl(OM.side, refDisp, tpDisp, slDisp);
    if (vErr) return toast('⚠️ ' + vErr, 'err', 5000);

    /* ✅ فحوصات ما قبل التوقيع — نفس شرطَي الرفض الرسميَّين الأكثر
       شيوعاً بـHyperliquid (error-responses): الحد الأدنى $10، والهامش
       غير الكافي. نمنعهما هنا برسالة عربية واضحة بدل رفض إنجليزي خام
       بعد أن يكون المستخدم قد وقّع فعلاً. */
    var pre = OM.buildPreview(sym, OM.side, qtyDisp, refDisp);
    if (pre) {
      if (pre.usd < OM.MIN_ORDER_USD) {
        return toast('⚠️ الحد الأدنى لقيمة الأمر على Hyperliquid هو $' + OM.MIN_ORDER_USD +
                     ' — قيمة أمرك الحالية ≈ $' + pre.usd.toFixed(2) + '، ارفع الكمية', 'warn', 7000);
      }
      var avail = (State.balance && State.balance.available) || 0;
      if (pre.margin > avail) {
        return toast('❌ الهامش المطلوب ≈ $' + pre.margin.toFixed(2) +
                     ' أكبر من رصيدك المتاح $' + avail.toFixed(2) + ' — قلّل الكمية أو أودع المزيد', 'err', 7000);
      }
    }

    var built = OM.buildOrders({
      sym: sym, isBuy: OM.side, qtyDisp: qtyDisp, mode: OM.mode,
      priceDisp: priceDisp, midDisp: midDisp, tpDisp: tpDisp, slDisp: slDisp
    });
    if (!built) return toast('تعذّر بناء الأمر — تحقق من البيانات', 'err');

    OM._pendingSubmit = {
      sym: sym, isBuy: OM.side, qtyDisp: qtyDisp, kind: built.kind,
      priceDisp: priceDisp, midDisp: midDisp, tpDisp: tpDisp, slDisp: slDisp, built: built
    };
    OM._showConfirm();
  };

  OM._showConfirm = function () {
    var p = OM._pendingSubmit; if (!p) return;
    var a = OM.asset(p.sym);
    var prev = OM.buildPreview(p.sym, p.isBuy, p.qtyDisp, p.kind === 'market' ? p.midDisp : p.priceDisp);

    setTxt('omConfirmTitle', a.icon + ' ' + (p.isBuy ? 'شراء ▲' : 'بيع ▼') + ' — ' + a.name);

    var kindLabel = p.kind === 'market' ? '⚡ سوق' : p.kind === 'limit' ? '📥 حدّي' : '⚡ إيقاف';
    var rows = OM._cfRow('نوع الأمر', kindLabel) + OM._cfRow('الكمية', p.qtyDisp + ' ' + a.unit);
    rows += p.kind === 'market'
      ? OM._cfRow('السعر التقريبي', '$' + fmt(p.midDisp, a.pxDp))
      : OM._cfRow(p.kind === 'stop' ? 'سعر التفعيل' : 'السعر الحدّي', '$' + fmt(p.priceDisp, a.pxDp));
    if (prev) {
      rows += OM._cfRow('القيمة التقريبية', '≈ $' + prev.usd.toFixed(2));
      rows += OM._cfRow('الهامش المطلوب', '≈ $' + prev.margin.toFixed(2));
      rows += OM._cfRow('⚡ التصفية التقريبية', prev.liqText);
      rows += OM._cfRow('الرسوم', '$' + prev.feeOpen.toFixed(4) + ' (' + prev.feePct + ')');
    }
    if (p.tpDisp) rows += OM._cfRow('🎯 جني الربح', '$' + fmt(p.tpDisp, a.pxDp));
    if (p.slDisp) rows += OM._cfRow('🛡 وقف الخسارة', '$' + fmt(p.slDisp, a.pxDp));
    if (p.kind === 'stop' && (p.tpDisp || p.slDisp))
      rows += '<div class="om-cf-row" style="border:none;"><span class="om-cf-k" style="font-size:11px;line-height:1.7;">⚠️ لأنه أمر إيقاف: TP/SL يُلحَقان تلقائياً فور تفعيل الأمر فعلياً وفتح المركز — لا يُنفَّذان الآن</span></div>';

    var body = document.getElementById('omConfirmBody');
    if (body) body.innerHTML = rows;

    var btn = document.getElementById('omConfirmExec');
    btn.className = 'om-confirm-exec ' + (p.isBuy ? 'buy' : 'sell');
    btn.disabled  = false;
    btn.innerHTML = p.isBuy ? '✅ تأكيد الشراء' : '✅ تأكيد البيع';

    document.getElementById('omConfirmOv').classList.add('open');
  };
  OM._cfRow = function (k, v) {
    return '<div class="om-cf-row"><span class="om-cf-k">' + k + '</span><span class="om-cf-v">' + v + '</span></div>';
  };
  OM._hideConfirm = function () {
    document.getElementById('omConfirmOv')?.classList.remove('open');
  };

  /* ══════════ التنفيذ الفعلي ══════════ */
  OM._execute = async function () {
    var p = OM._pendingSubmit; if (!p) { OM._hideConfirm(); return; }
    var a    = OM.asset(p.sym);
    var aApi = OM.isGram(p.sym) ? ASSETS['GOLD'] : ASSETS[p.sym];

    var btn = document.getElementById('omConfirmExec');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="om-sp"></span>'; }
    showLoader('⏳ جارٍ إرسال الأمر...');

    try {
      try { await hlExchange({ type: 'updateLeverage', asset: aApi.idx, isCross: aApi.cross, leverage: aApi.lev }); } catch (e) {}

      var res = await hlExchange({ type: 'order', orders: p.built.orders, grouping: p.built.grouping });
      var statuses = (res && res.response && res.response.data && res.response.data.statuses) || [];
      var entryStatus = statuses[0];
      if (!entryStatus || entryStatus.error) throw new Error((entryStatus && entryStatus.error) || 'فشل وضع الأمر');

      OM._hideConfirm();
      OM.close();

      if (p.kind === 'market') {
        toast('✅ نُفِّذ — ' + a.icon + ' ' + (p.isBuy ? 'شراء' : 'بيع') + ' ' + p.qtyDisp + ' ' + a.unit, 'ok', 5000);
        if (typeof playFillSound === 'function') playFillSound();
      } else if (p.kind === 'limit') {
        toast('📥 وُضع الأمر الحدّي بنجاح — ' + a.icon + ' ' + a.name, 'ok', 5000);
      } else {
        toast('⚡ وُضع أمر الإيقاف بنجاح — سيُنفَّذ تلقائياً عند وصول السعر', 'ok', 6000);
        var oid = entryStatus.resting && entryStatus.resting.oid;
        if (oid && (p.tpDisp || p.slDisp) && State.wallet) {
          OM.addPending(State.wallet.address, {
            oid: oid, coin: aApi.coin, sym: p.sym, isBuy: p.isBuy,
            tp: p.tpDisp || null, sl: p.slDisp || null, at: Date.now()
          });
          OM._startPendingWatch();
        }
      }

      /* أي رِجل TP/SL مُرفَقة (سوق/حدّي) فشلت رغم نجاح الدخول نفسه —
         تحذير منفصل صادق، لا إخفاء الفشل الجزئي خلف رسالة نجاح كاملة */
      var legIssues = statuses.slice(1).filter(function (s) { return s && s.error; });
      if (legIssues.length) {
        toast('⚠️ فُتحت الصفقة، لكن تعذّر ضبط ' + (legIssues.length > 1 ? 'TP/SL' : (p.tpDisp ? 'جني الربح' : 'وقف الخسارة')) + ' تلقائياً — اضبطه يدوياً من بطاقة الصفقة', 'warn', 7500);
      }

      _multiPoll();
    } catch (e) {
      toast(tradeErr(e.message), 'err', 6000);
    } finally {
      hideLoader();
      if (btn) btn.disabled = false;
      OM._pendingSubmit = null;
    }
  };

  /* ══════════ مراقب الأقواس المعلّقة (راجع تعليق رأس الملف) ══════════ */
  OM._startPendingWatch = function () {
    if (OM._pendingTimer) return;
    OM._pendingTimer = setInterval(OM._tickPendingWatch, OM.PENDING_POLL_MS);
    OM._tickPendingWatch();
  };
  OM._stopPendingWatch = function () {
    clearInterval(OM._pendingTimer);
    OM._pendingTimer = null;
  };
  /* ✅ تُستدعى من auth.js فور استقرار اتصال المحفظة — تستأنف المراقبة
     لو بقيت أوامر معلّقة من جلسة سابقة لم تُفعَّل بعد. */
  OM.resumePendingWatch = function () {
    if (typeof State === 'undefined' || !State.wallet) return;
    if (OM.loadPending(State.wallet.address).length) OM._startPendingWatch();
  };

  OM._tickPendingWatch = async function () {
    if (typeof State === 'undefined' || !State.wallet) { OM._stopPendingWatch(); return; }
    var addr = State.wallet.address;
    var list = OM.loadPending(addr);
    if (!list.length) { OM._stopPendingWatch(); return; }

    for (var i = 0; i < list.length; i++) {
      var entry = list[i];
      var stillOpen = (State.openOrders || []).some(function (o) { return String(o.oid) === String(entry.oid); });
      if (stillOpen) continue;

      var filled = (State.fillsCache || []).some(function (f) { return String(f.oid) === String(entry.oid); });
      OM.removePending(addr, entry.oid);
      if (!filled) continue; /* أُلغي أو رُفض بلا تنفيذ — لا شيء يُلحَق */

      var pos = (State.positions || []).find(function (pp) { return pp.position.coin === entry.coin; });
      var szi = pos ? pos.position.szi : null;
      if (szi == null || typeof placeNativeTpsl !== 'function') continue;

      try {
        if (entry.tp) await placeNativeTpsl(entry.sym, szi, 'tp', dispToOz(entry.sym, entry.tp));
        if (entry.sl) await placeNativeTpsl(entry.sym, szi, 'sl', dispToOz(entry.sym, entry.sl));
        toast('🎯 تم إلحاق TP/SL تلقائياً بصفقة ' + OM.asset(entry.sym).name + ' بعد تفعيل أمر الإيقاف', 'ok', 6500);
        _multiPoll();
      } catch (e) {
        toast('⚠️ فُعِّل أمر الإيقاف وفُتحت الصفقة، لكن تعذّر إلحاق TP/SL تلقائياً — اضبطه يدوياً من بطاقة الصفقة', 'warn', 8000);
      }
    }

    if (!OM.loadPending(addr).length) OM._stopPendingWatch();
  };

})();

/* ══════════ الواجهة العامة ══════════ */
window.OrderModule = { open: OM.open, close: OM.close };
