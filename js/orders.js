/* ═══════════════════════════════════════════════════════════════
   js/orders.js — "الطلبات" : الطلبات المعلّقة (حدّية · إيقاف · TP/SL)
   زر بجانب "الصفقات المفتوحة" بالرئيسية يفتح ورقة تعرض كل أمر مفتوح
   على Hyperliquid مع: تفاصيل كاملة · تعديل · حذف · حذف الكل.

   ✅ المصدر: State.openOrders (frontendOpenOrders الحي، يُحدَّث دفعياً من
      account.js:_refreshOpenOrders). لا اشتراك/استطلاع شبكة جديد — مؤقّت
      محلي (1ث) يقارن بصمة القائمة فقط ويعيد الرسم عند تغيّرها، فيشمل
      تسجيل الخروج وإعادة الاتصال بلا أي ربط إضافي بملفات أخرى.
   ✅ التصنيف (طبقاً لحقول frontendOpenOrders الرسمية):
        isTrigger=false                    → حدّي (limit)
        isTrigger && (isPositionTpsl || reduceOnly) → TP/SL (tp/sl من orderType)
        isTrigger && !reduceOnly           → أمر إيقاف دخول (stop)
   ✅ التعديل — حسب النوع (exchange-endpoint الرسمي):
        حدّي / إيقاف دخول → action "modify" {type, oid, order{a,b,p,s,r,t}}
          (ترتيب المفاتيح مطابق لما يُسلسَل به msgpack؛ oid بـBigInt).
        TP/SL → نفس مسار tpsl.js المُجرَّب (placeNativeTpsl) ثم إلغاء القديم
          (الجديد أولاً — لا فجوة حماية). يتطلب وجود المركز.
        أمر مرتبط بأوامر TP/SL معلّقة (children) → حذف فقط (تعديله قد يفكّ
          الارتباط، غير موثّق).
   ✅ الحذف: action "cancel" {a,o}، حذف الكل: دفعة واحدة بتوقيع واحد.
   ✅ كل عملية تمر عبر requirePin كبقية التطبيق.
   ✅ الغرام: xyz:GOLD يُعرَض بالغرام (نفس عرض الصفقات)، التحويل بـTROY،
      وتقريب الكمية مطابق لـmaster (toFixed(4) ثم wireSz).
═══════════════════════════════════════════════════════════════ */
'use strict';

(function () {

  const KIND_LBL = { limit: 'حدّي', stop: 'إيقاف', tp: 'جني ربح', sl: 'وقف خسارة' };
  const KIND_ICO = { limit: '📥', stop: '⚡', tp: '🎯', sl: '🛡' };
  const ST_AR = {
    open: 'مفتوح', filled: 'مُنفَّذ', canceled: 'مُلغى', triggered: 'فُعِّل',
    rejected: 'مرفوض', marginCanceled: 'أُلغي (هامش)', unknown: 'غير معروف'
  };
  const MIN_NOTIONAL = 10;

  let _isOpen = false, _filter = 'all', _lastSig = '', _timer = null;
  let _busy = false, _confirmAll = false;
  const _ui    = Object.create(null);  // oid → 'details' | 'edit' | 'del'
  const _draft = Object.create(null);  // oid → { px, sz } (مسودة التعديل تنجو من إعادة الرسم)
  const _stat  = Object.create(null);  // oid → { st, ts } من orderStatus

  const $o = id => document.getElementById(id);
  const _esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const _orders = () => (typeof State !== 'undefined' && Array.isArray(State.openOrders)) ? State.openOrders : [];
  const _num = (n, d) => (isFinite(+n) ? (+n).toFixed(d) : '—');

  /* ════ نموذج العرض لأمر واحد ════ */
  function _vm(o) {
    const sym  = shortCoinPos(o.coin);
    const a    = ASSETS[sym] || { name: sym, icon: '📊', unit: '', pxDp: 2, szDp: 2, lev: 10, gram: false };
    const aApi = apiAsset(sym) || a;
    const isGram = !!a.gram;
    const trig = !!o.isTrigger;
    const ot   = String(o.orderType || '').toLowerCase();
    const exit = trig && (!!o.isPositionTpsl || o.reduceOnly !== false);
    let kind = 'limit';
    if (trig) kind = exit ? (ot.includes('take profit') ? 'tp' : 'sl') : 'stop';

    const pxOz  = parseFloat(trig ? o.triggerPx : o.limitPx) || 0;
    const szOz  = parseFloat(o.sz) || 0;
    const origOz = parseFloat(o.origSz) || szOz;
    const pos   = (State.positions || []).find(p => p.position.coin === o.coin) || null;
    const posSzi = pos ? parseFloat(pos.position.szi) : 0;
    const wholePos = !!o.isPositionTpsl && szOz === 0;
    const effSzOz  = wholePos ? Math.abs(posSzi) : szOz;
    const hasKids  = Array.isArray(o.children) && o.children.length > 0;

    const pxDisp = ozToDisp(sym, pxOz);
    const szDisp = szToDisp(sym, effSzOz);
    const szDp   = isGram ? 2 : a.szDp;
    const cur    = (State.prices[sym] && State.prices[sym].mid) || 0;

    const isExitKind = kind === 'tp' || kind === 'sl';
    return {
      o, oid: String(o.oid), sym, a, aApi, isGram, kind, exit, trig,
      isBuy: o.side === 'B', reduce: !!o.reduceOnly || !!o.isPositionTpsl,
      pxOz, pxDisp, pxDp: a.pxDp, szOz, effSzOz, origOz, szDisp, szDp, wholePos,
      cur, pos, posSzi, hasKids,
      notional: pxOz * effSzOz,
      sizeEditable: kind === 'limit' || kind === 'stop',
      canEdit: !hasKids && (!isExitKind || !!pos),
      editWhy: hasKids ? 'مرتبط بأوامر TP/SL — احذفه وأنشئ طلباً جديداً'
             : (isExitKind && !pos) ? 'لا يوجد مركز مفتوح لهذا الأمر' : ''
    };
  }

  const _group = v => (v.kind === 'tp' || v.kind === 'sl') ? 'exit' : v.kind;
  const _find  = oid => _orders().find(o => String(o.oid) === String(oid)) || null;
  const _list  = () => _orders().map(_vm).sort((x, y) => (y.o.timestamp || 0) - (x.o.timestamp || 0));
  const _dist  = v => (v.cur && v.pxDisp) ? ((v.pxDisp - v.cur) / v.cur) * 100 : null;
  const _distTxt = d => d == null ? '—' : `${d >= 0 ? '+' : ''}${d.toFixed(2)}% ${d >= 0 ? 'فوق' : 'تحت'} السعر الحالي`;

  function _ago(ts) {
    if (!ts) return '—';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'الآن';
    const m = Math.floor(s / 60); if (m < 60) return `${m} د`;
    const h = Math.floor(m / 60); if (h < 24) return `${h} س`;
    return `${Math.floor(h / 24)} ي`;
  }
  const _when = ts => ts
    ? new Date(ts).toLocaleString('ar-EG', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—';

  /* ════ الزر بالرئيسية — بجانب "الصفقات المفتوحة" ════ */
  function _inject() {
    if ($o('ordersBtn')) return true;
    const cnt = $o('positionsCount');
    if (!cnt) return false;
    const btn = document.createElement('button');
    btn.id = 'ordersBtn'; btn.type = 'button'; btn.className = 'ord-btn';
    btn.title = 'الطلبات المعلّقة';
    btn.innerHTML = '<span class="ord-btn-ic">📋</span><span class="ord-btn-lbl">الطلبات</span><span class="ord-btn-n" id="ordersCount">0</span>';
    cnt.insertAdjacentElement('afterend', btn);
    btn.addEventListener('click', open);
    return true;
  }

  function _syncBadge() {
    const n = _orders().length;
    const c = $o('ordersCount'); if (c) c.textContent = n;
    const b = $o('ordersBtn');   if (b) b.classList.toggle('has', n > 0);
  }

  /* ════ هيكل الورقة (يُبنى مرة واحدة) ════ */
  function _ensureSheet() {
    if ($o('ordSheet')) return;
    const el = document.createElement('div');
    el.id = 'ordSheet'; el.className = 'ord-ov';
    el.innerHTML =
      '<div class="ord-panel" id="ordPanel">' +
        '<div class="ord-hdr">' +
          '<span class="ord-title">📋 الطلبات المعلّقة <b id="ordTotal">0</b></span>' +
          '<button class="ord-x" id="ordClose" aria-label="إغلاق">✕</button>' +
        '</div>' +
        '<div class="ord-chips" id="ordChips"></div>' +
        '<div class="ord-list" id="ordList"></div>' +
        '<div class="ord-foot" id="ordFoot"></div>' +
      '</div>';
    document.body.appendChild(el);

    el.addEventListener('click', e => { if (e.target === el) close(); });
    $o('ordClose').addEventListener('click', close);
    $o('ordPanel').addEventListener('click', _onClick);
    $o('ordPanel').addEventListener('input', _onInput);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && _isOpen && !document.querySelector('.modal-overlay.open')) close();
    });
  }

  /* ════ الرسم ════ */
  function _chip(id, lbl, n) {
    return `<button class="ord-chip${_filter === id ? ' on' : ''}" data-ord-f="${id}">${lbl}<i>${n}</i></button>`;
  }

  function _hintHtml(v, pxStr, szStr) {
    const px = parseFloat(pxStr), sz = parseFloat(szStr);
    if (!(px > 0)) return '<span class="ord-hint-line">أدخل سعراً صحيحاً</span>';
    const rows = [];
    const d = v.cur ? ((px - v.cur) / v.cur) * 100 : null;
    if (d != null) rows.push(`<span class="ord-hint-line">${_distTxt(d)}</span>`);
    if (v.sizeEditable && sz > 0) {
      const szOz = v.isGram ? +(sz / TROY).toFixed(4) : sz;
      const usd = dispToOz(v.sym, px) * szOz;
      rows.push(`<span class="ord-hint-line">القيمة ≈ <b>$${usd.toFixed(2)}</b> · هامش ≈ $${(usd / v.a.lev).toFixed(2)}</span>`);
      if (!v.reduce && usd < MIN_NOTIONAL)
        rows.push(`<span class="ord-hint-line warn">⚠️ أقل من $${MIN_NOTIONAL} — قد يرفضه Hyperliquid</span>`);
    }
    if (v.kind === 'limit' && v.cur && !v.reduce) {
      if (v.isBuy && px >= v.cur) rows.push('<span class="ord-hint-line warn">⚡ السعر عند/فوق السوق — سيُنفَّذ فوراً</span>');
      if (!v.isBuy && px <= v.cur) rows.push('<span class="ord-hint-line warn">⚡ السعر عند/تحت السوق — سيُنفَّذ فوراً</span>');
    }
    return rows.join('');
  }

  function _validate(v, px, sz) {
    if (!(px > 0)) return 'أدخل سعراً صحيحاً';
    if (v.sizeEditable && !(sz > 0)) return 'أدخل كمية صحيحة';
    if (v.kind === 'stop' && v.cur) {
      if (v.isBuy && px <= v.cur) return 'سعر إيقاف الشراء يجب أن يكون فوق السعر الحالي';
      if (!v.isBuy && px >= v.cur) return 'سعر إيقاف البيع يجب أن يكون تحت السعر الحالي';
    }
    if ((v.kind === 'tp' || v.kind === 'sl') && v.pos) {
      const entry = ozToDisp(v.sym, parseFloat(v.pos.position.entryPx || 0));
      const long = v.posSzi > 0;
      if (v.kind === 'tp' && ((long && px <= entry) || (!long && px >= entry)))
        return long ? 'جني الربح يجب أن يكون فوق سعر الدخول' : 'جني الربح يجب أن يكون تحت سعر الدخول';
      if (v.kind === 'sl' && ((long && px >= entry) || (!long && px <= entry)))
        return long ? 'وقف الخسارة يجب أن يكون تحت سعر الدخول' : 'وقف الخسارة يجب أن يكون فوق سعر الدخول';
    }
    return null;
  }

  function _row(k, val, id) {
    return `<div class="ord-r"><span class="ord-k">${k}</span><span class="ord-v"${id ? ` id="${id}"` : ''}>${val}</span></div>`;
  }

  function _stTxt(s) {
    if (!s) return '…';
    if (!s.st) return 'غير متاح';
    return (ST_AR[s.st] || _esc(s.st)) + (s.ts ? ` · ${_when(s.ts)}` : '');
  }

  function _detailsHtml(v) {
    const o = v.o, a = v.a;
    let rows = '';
    rows += _row('النوع', `${KIND_ICO[v.kind]} ${KIND_LBL[v.kind]} <small class="ord-raw">${_esc(o.orderType || '')}</small>`);
    rows += _row('الاتجاه', v.isBuy ? '▲ شراء' : '▼ بيع');
    rows += _row('الأصل', `${a.icon} ${_esc(a.name)}`);
    rows += _row(v.trig ? 'سعر التفعيل' : 'سعر الطلب', `$${_num(v.pxDisp, v.pxDp)}`);
    if (v.trig && o.triggerCondition && o.triggerCondition !== 'N/A')
      rows += _row('شرط التفعيل', `<span class="ord-raw">${_esc(o.triggerCondition)}</span>`);
    if (v.trig && parseFloat(o.limitPx) > 0 && /limit/i.test(o.orderType || ''))
      rows += _row('سعر التنفيذ الحدّي', `$${_num(ozToDisp(v.sym, parseFloat(o.limitPx)), v.pxDp)}`);
    rows += _row('الكمية', v.wholePos ? 'كامل الصفقة' : `${_num(v.szDisp, v.szDp)} ${a.unit}`);
    const orig = szToDisp(v.sym, v.origOz);
    if (!v.wholePos && Math.abs(orig - v.szDisp) > 1e-9) rows += _row('الكمية الأصلية', `${_num(orig, v.szDp)} ${a.unit}`);
    rows += _row('القيمة التقريبية', `≈ $${v.notional.toFixed(2)}`);
    if (!v.reduce) rows += _row('الهامش المطلوب', `≈ $${(v.notional / a.lev).toFixed(2)} (${a.lev}x)`);
    rows += _row('المسافة عن السعر', `<span data-ord-dist="${v.oid}">${_distTxt(_dist(v))}</span>`);
    if (v.pos && (v.kind === 'tp' || v.kind === 'sl')) {
      const pnl = (v.pxOz - parseFloat(v.pos.position.entryPx || 0)) * v.posSzi;
      rows += _row('النتيجة المتوقعة', `<span class="${pnl >= 0 ? 'ord-up' : 'ord-dn'}">${pnl >= 0 ? '+' : '−'}$${Math.abs(pnl).toFixed(2)}</span>`);
    }
    rows += _row('للتخفيض فقط', v.reduce ? 'نعم' : 'لا');
    if (o.tif) rows += _row('الصلاحية (TIF)', _esc(o.tif));
    rows += _row('وُضع في', `${_when(o.timestamp)} <small class="ord-raw">منذ ${_ago(o.timestamp)}</small>`);
    rows += _row('الحالة', _stTxt(_stat[v.oid]), 'ordSt_' + v.oid);
    rows += _row('رقم الأمر', `<span class="ord-raw">${_esc(o.oid)}</span> <button class="ord-copy" data-ord-act="copy" data-oid="${v.oid}" title="نسخ">⧉</button>`);
    if (v.hasKids) {
      const kids = o.children.map(c => {
        const t = String(c.orderType || '').toLowerCase().includes('take profit') ? '🎯 TP' : '🛡 SL';
        return `${t} $${_num(ozToDisp(v.sym, parseFloat(c.triggerPx || c.limitPx || 0)), v.pxDp)}`;
      }).join(' · ');
      rows += _row('أوامر مرتبطة', kids);
    }
    return `<div class="ord-pane">${rows}</div>`;
  }

  function _editHtml(v) {
    const d = _draft[v.oid] || {};
    const px = d.px != null ? d.px : _num(v.pxDisp, v.pxDp);
    const sz = d.sz != null ? d.sz : _num(v.szDisp, v.szDp);
    const lbl = { limit: 'سعر الطلب', stop: 'سعر التفعيل', tp: 'سعر جني الربح', sl: 'سعر وقف الخسارة' }[v.kind];
    const szField = v.sizeEditable
      ? `<label class="ord-f"><span>الكمية (${_esc(v.a.unit)})</span><input class="ord-in" id="ordSz_${v.oid}" data-ord-in="sz" data-oid="${v.oid}" type="number" inputmode="decimal" step="any" min="0" value="${_esc(sz)}"></label>`
      : '<div class="ord-note">الكمية تتبع حجم الصفقة تلقائياً</div>';
    return `<div class="ord-pane">
      <div class="ord-fields">
        <label class="ord-f"><span>${lbl}</span><input class="ord-in" id="ordPx_${v.oid}" data-ord-in="px" data-oid="${v.oid}" type="number" inputmode="decimal" step="any" min="0" value="${_esc(px)}"></label>
        ${szField}
      </div>
      <div class="ord-hint" id="ordHint_${v.oid}">${_hintHtml(v, px, sz)}</div>
      <div class="ord-btns">
        <button class="ord-b ok" data-ord-act="save" data-oid="${v.oid}">✅ حفظ التعديل</button>
        <button class="ord-b" data-ord-act="close" data-oid="${v.oid}">تراجع</button>
      </div>
    </div>`;
  }

  function _delHtml(v) {
    return `<div class="ord-pane ord-del">
      <div class="ord-note">سيُلغى هذا الطلب فوراً من Hyperliquid. صفقاتك المفتوحة لا تتأثر.</div>
      <div class="ord-btns">
        <button class="ord-b bad" data-ord-act="del-yes" data-oid="${v.oid}">🗑 نعم، احذف</button>
        <button class="ord-b" data-ord-act="close" data-oid="${v.oid}">تراجع</button>
      </div>
    </div>`;
  }

  function _cardHtml(v) {
    const ui = _ui[v.oid] || '';
    const szTxt = v.wholePos ? 'كامل الصفقة' : `${_num(v.szDisp, v.szDp)} ${_esc(v.a.unit)}`;
    const d = _dist(v);
    const editAttr = v.canEdit ? '' : ` disabled title="${_esc(v.editWhy)}"`;
    return `<article class="ord-card k-${v.kind}" data-oid="${v.oid}">
      <div class="ord-top">
        <div class="ord-id">
          <b class="ord-name">${v.a.icon} ${_esc(v.a.name)}</b>
          <span class="ord-badge ${v.isBuy ? 'buy' : 'sell'}">${v.isBuy ? '▲ شراء' : '▼ بيع'}</span>
          <span class="ord-badge kind">${KIND_ICO[v.kind]} ${KIND_LBL[v.kind]}</span>
        </div>
        <div class="ord-px">$${_num(v.pxDisp, v.pxDp)}</div>
      </div>
      <div class="ord-mid">
        <span>${szTxt}</span><span class="ord-dot">·</span>
        <span>≈ $${v.notional.toFixed(2)}</span><span class="ord-dot">·</span>
        <span class="ord-dist" data-ord-dist="${v.oid}">${_distTxt(d)}</span>
      </div>
      <div class="ord-acts">
        <button class="ord-a${ui === 'details' ? ' on' : ''}" data-ord-act="details" data-oid="${v.oid}">${ui === 'details' ? '▴' : '▾'} تفاصيل</button>
        <button class="ord-a${ui === 'edit' ? ' on' : ''}" data-ord-act="edit" data-oid="${v.oid}"${editAttr}>✎ تعديل</button>
        <button class="ord-a bad${ui === 'del' ? ' on' : ''}" data-ord-act="del" data-oid="${v.oid}">🗑 حذف</button>
      </div>
      ${ui === 'details' ? _detailsHtml(v) : ui === 'edit' ? _editHtml(v) : ui === 'del' ? _delHtml(v) : ''}
    </article>`;
  }

  function _render() {
    if (!$o('ordSheet')) return;
    const all = _list();
    const cnt = { all: all.length, limit: 0, stop: 0, exit: 0 };
    all.forEach(v => { cnt[_group(v)]++; });
    $o('ordTotal').textContent = all.length;
    $o('ordChips').innerHTML =
      _chip('all', 'الكل', cnt.all) + _chip('limit', '📥 حدّية', cnt.limit) +
      _chip('stop', '⚡ إيقاف', cnt.stop) + _chip('exit', '🎯 TP/SL', cnt.exit);

    const shown = all.filter(v => _filter === 'all' || _group(v) === _filter);
    const list = $o('ordList');
    const keep = list.scrollTop;
    const ae = document.activeElement;
    const focusId = (ae && ae.dataset && ae.dataset.ordIn) ? ae.id : null;
    const caret = focusId ? ae.selectionStart : null;

    list.innerHTML = shown.length
      ? shown.map(_cardHtml).join('')
      : `<div class="ord-empty"><div class="ord-empty-ic">📭</div>
           <div>${all.length ? 'لا طلبات ضمن هذا التصنيف' : 'لا توجد طلبات معلّقة'}</div>
           <small>الطلبات الحدّية وأوامر الإيقاف وأهداف TP/SL تظهر هنا فور وضعها.</small></div>`;
    list.scrollTop = keep;
    if (focusId) {
      const el = $o(focusId);
      if (el) { el.focus(); try { el.setSelectionRange(caret, caret); } catch (e) {} }
    }

    const foot = $o('ordFoot');
    if (!shown.length) { foot.innerHTML = ''; foot.classList.add('hidden'); return; }
    foot.classList.remove('hidden');
    foot.innerHTML = _confirmAll
      ? `<span class="ord-foot-t">حذف ${shown.length} طلب؟</span>
         <button class="ord-b bad" data-ord-act="all-yes">🗑 تأكيد</button>
         <button class="ord-b" data-ord-act="all-no">تراجع</button>`
      : `<button class="ord-b bad wide" data-ord-act="all">🗑 حذف ${_filter === 'all' ? 'كل الطلبات' : 'طلبات هذا التصنيف'} (${shown.length})</button>`;
  }

  /* تحديث حيّ خفيف لنصوص المسافة فقط (بلا إعادة بناء) */
  function _tickDynamic() {
    _list().forEach(v => {
      document.querySelectorAll(`[data-ord-dist="${v.oid}"]`).forEach(el => { el.textContent = _distTxt(_dist(v)); });
    });
  }

  function _sig() {
    const os = _orders().map(o => [o.oid, o.limitPx, o.triggerPx, o.sz, o.side, o.orderType].join('|')).join(';');
    const ps = (State.positions || []).map(p => p.position.coin + ':' + p.position.szi).join(',');
    return os + '#' + ps;
  }

  function _tick() {
    const s = _sig();
    if (s !== _lastSig) { _lastSig = s; _syncBadge(); if (_isOpen) _render(); }
    if (_isOpen) _tickDynamic();
  }

  /* ════ الأحداث ════ */
  function _onInput(e) {
    const t = e.target;
    if (!t || !t.dataset || !t.dataset.ordIn) return;
    const oid = t.dataset.oid;
    const d = _draft[oid] || (_draft[oid] = {});
    d[t.dataset.ordIn] = t.value;
    const o = _find(oid); if (!o) return;
    const v = _vm(o);
    const px = ($o('ordPx_' + oid) || {}).value;
    const sz = v.sizeEditable ? ($o('ordSz_' + oid) || {}).value : v.szDisp;
    const h = $o('ordHint_' + oid);
    if (h) h.innerHTML = _hintHtml(v, px, sz);
  }

  function _onClick(e) {
    const chip = e.target.closest('[data-ord-f]');
    if (chip) { _filter = chip.dataset.ordF; _confirmAll = false; _render(); return; }
    const b = e.target.closest('[data-ord-act]');
    if (!b || b.disabled || _busy) return;
    const act = b.dataset.ordAct, oid = b.dataset.oid;

    if (act === 'details') {
      _ui[oid] = _ui[oid] === 'details' ? '' : 'details';
      _render();
      if (_ui[oid] === 'details') _loadStatus(oid);
    } else if (act === 'edit') {
      _ui[oid] = _ui[oid] === 'edit' ? '' : 'edit'; _render();
    } else if (act === 'del') {
      _ui[oid] = _ui[oid] === 'del' ? '' : 'del'; _render();
    } else if (act === 'close') {
      _ui[oid] = ''; delete _draft[oid]; _render();
    } else if (act === 'copy') {
      if (navigator.clipboard) navigator.clipboard.writeText(String(oid)).then(() => toast('✅ تم نسخ رقم الأمر', 'info', 1800)).catch(() => toast('تعذّر النسخ', 'err'));
    } else if (act === 'save') {
      _onSave(oid);
    } else if (act === 'del-yes') {
      _guard(() => _doDelete([oid]));
    } else if (act === 'all') {
      _confirmAll = true; _render();
    } else if (act === 'all-no') {
      _confirmAll = false; _render();
    } else if (act === 'all-yes') {
      const ids = _list().filter(v => _filter === 'all' || _group(v) === _filter).map(v => v.oid);
      _guard(() => _doDelete(ids));
    }
  }

  const _guard = fn => (typeof requirePin === 'function') ? requirePin(fn) : fn();

  async function _loadStatus(oid) {
    if (!State.wallet) return;
    try {
      const r = await hlInfo({ type: 'orderStatus', user: State.wallet.address, oid: Number(oid) });
      _stat[oid] = (r && r.order) ? { st: r.order.status, ts: r.order.statusTimestamp }
                 : (r && r.status === 'unknownOid') ? { st: 'unknown' } : { st: null };
    } catch (e) { _stat[oid] = { st: null }; }
    const el = $o('ordSt_' + oid);
    if (el) el.textContent = _stTxt(_stat[oid]);
  }

  async function _reload() {
    if (typeof _refreshOpenOrders === 'function') { try { await _refreshOpenOrders(); } catch (e) {} }
    _lastSig = ''; _tick();
  }

  const _gone = m => /already canceled|never placed|filled/i.test(m || '');

  /* ════ حذف (فردي أو جماعي) — action: cancel ════ */
  async function _doDelete(oids) {
    if (_busy || !oids.length) return;
    const cancels = [];
    oids.forEach(id => {
      const o = _find(id); if (!o) return;
      const v = _vm(o);
      cancels.push({ a: v.aApi.idx, o: BigInt(o.oid) });
    });
    if (!cancels.length) { _confirmAll = false; _render(); return; }
    _busy = true; showLoader(cancels.length > 1 ? '🗑 جارٍ حذف الطلبات...' : '🗑 جارٍ حذف الطلب...');
    try {
      const res = await hlExchange({ type: 'cancel', cancels });
      const sts = (res && res.response && res.response.data && res.response.data.statuses) || [];
      const ok = sts.filter(s => s === 'success').length || (sts.length ? 0 : cancels.length);
      const firstErr = sts.find(s => s && s.error);
      if (ok) toast(`✅ تم حذف ${ok} ${ok > 1 ? 'طلبات' : 'طلب'}`, 'ok', 3500);
      else if (firstErr) toast(_gone(firstErr.error) ? 'ℹ️ الطلب لم يعد موجوداً (نُفِّذ أو أُلغي مسبقاً)' : '⚠️ ' + firstErr.error, 'info', 5000);
      oids.forEach(id => { delete _ui[id]; delete _draft[id]; });
    } catch (e) {
      toast(_gone(e.message) ? 'ℹ️ الطلب لم يعد موجوداً (نُفِّذ أو أُلغي مسبقاً)' : tradeErr(e.message), 'err', 6000);
    } finally {
      _busy = false; _confirmAll = false; hideLoader();
      _reload();
    }
  }

  /* ════ تعديل ════ */
  function _onSave(oid) {
    const o = _find(oid);
    if (!o) { toast('الطلب لم يعد موجوداً', 'info'); _render(); return; }
    const v = _vm(o);
    const px = parseFloat(($o('ordPx_' + oid) || {}).value);
    const sz = v.sizeEditable ? parseFloat(($o('ordSz_' + oid) || {}).value) : v.szDisp;
    const err = _validate(v, px, sz);
    if (err) { toast('⚠️ ' + err, 'err', 5000); return; }
    _guard(() => _doSave(o, v, px, sz));
  }

  async function _doSave(o, v, pxDisp, szDisp) {
    if (_busy) return;
    _busy = true; showLoader('✎ جارٍ تعديل الطلب...');
    try {
      const pxOz = dispToOz(v.sym, pxDisp);
      const dp = v.aApi.szDp;

      if (v.kind === 'tp' || v.kind === 'sl') {
        /* TP/SL: الجديد أولاً ثم إلغاء القديم — لا فجوة حماية */
        if (!v.pos) throw new Error('لا يوجد مركز مفتوح لهذا الأمر');
        await placeNativeTpsl(v.sym, v.pos.position.szi, v.kind, pxOz);
        try { await hlExchange({ type: 'cancel', cancels: [{ a: v.aApi.idx, o: BigInt(o.oid) }] }); } catch (e) {}
      } else {
        const szOz = v.isGram ? +(szDisp / TROY).toFixed(4) : szDisp;   // تقريب master
        const isBuy = o.side === 'B';
        const ot = String(o.orderType || '').toLowerCase();
        let t, limitOz;
        if (o.isTrigger) {
          const isMarket = ot.includes('market');
          t = { trigger: { isMarket, triggerPx: wirePx(pxOz, dp), tpsl: ot.includes('take profit') ? 'tp' : 'sl' } };
          const oldTrig = parseFloat(o.triggerPx) || 0, oldLim = parseFloat(o.limitPx) || 0;
          limitOz = isMarket ? pxOz * (isBuy ? 1.10 : 0.90) : (oldLim + (pxOz - oldTrig));
        } else {
          t = { limit: { tif: ['Gtc', 'Alo', 'Ioc'].includes(o.tif) ? o.tif : 'Gtc' } };
          limitOz = pxOz;
        }
        const res = await hlExchange({
          type: 'modify',
          oid: BigInt(o.oid),
          order: { a: v.aApi.idx, b: isBuy, p: wirePx(limitOz, dp), s: wireSz(szOz, dp), r: !!o.reduceOnly, t }
        });
        const st = res && res.response && res.response.data && res.response.data.statuses && res.response.data.statuses[0];
        if (st && st.error) throw new Error(st.error);
      }
      toast('✅ تم تعديل الطلب', 'ok', 3500);
      delete _ui[v.oid]; delete _draft[v.oid];
    } catch (e) {
      toast(_gone(e.message) ? 'ℹ️ الطلب لم يعد موجوداً (نُفِّذ أو أُلغي مسبقاً)' : tradeErr(e.message), 'err', 6000);
    } finally {
      _busy = false; hideLoader();
      _reload();
    }
  }

  /* ════ فتح/إغلاق ════ */
  function open() {
    if (typeof State === 'undefined' || State.isGuest || !State.wallet) {
      if (typeof _promptConnect === 'function') _promptConnect();
      return;
    }
    _ensureSheet();
    _isOpen = true; _confirmAll = false;
    $o('ordSheet').classList.add('open');
    _lastSig = _sig(); _render();
    _reload();
  }
  function close() {
    _isOpen = false;
    const s = $o('ordSheet'); if (s) s.classList.remove('open');
  }
  function refresh() { _lastSig = ''; _tick(); }

  function _init(tries) {
    if (!_inject() && (tries || 0) < 20) { requestAnimationFrame(() => _init((tries || 0) + 1)); return; }
    _syncBadge();
    if (!_timer) _timer = setInterval(_tick, 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => _init(0));
  else _init(0);

  window.OrdersModule = { open, close, refresh };

})();
