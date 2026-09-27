/* ═══════════════════════════════════════════════════════════════
   oc-ui.js — كل الرسم: قائمة الأسواق، شاشة السوق، التذكرة، المحفظة

   ثلاث شاشات داخل صفحة واحدة:
     markets   → بحث + تصنيفات + ترتيب + بطاقات أسواق حيّة
     market    → رأس السوق + اختيار النتيجة + الجانبان + دفتر + تذكرة
     portfolio → أسهمك + أوامرك المفتوحة + السجل

   الرسم كله يقرأ من OcState فقط، ويُعاد بناؤه عند تغيّر الأسعار بترقيق
   (throttle) من oc-prices.js — بلا إعادة رسم ثقيلة لكل رسالة WebSocket.
═══════════════════════════════════════════════════════════════ */
'use strict';

const OcUI = (function () {

  /* ════ تنقّل ════ */
  function go(view) {
    OcState.view = view;
    ocShow('ocViewMarkets',   view === 'markets');
    ocShow('ocViewMarket',    view === 'market');
    ocShow('ocViewPortfolio', view === 'portfolio');
    document.querySelectorAll('.oc-tab').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (view === 'markets')   renderMarkets();
    if (view === 'portfolio') renderPortfolio();
  }

  /* ════ فلترة وترتيب ════ */
  function _visibleMarkets() {
    const model = OcState.model;
    if (!model) return [];
    const q   = OcState.query.trim().toLowerCase();
    const cat = OcState.category;

    let list = model.markets.filter(m => {
      /* السوق "حيّ" إذا كان لأحد جوانبه سعر في allMids */
      const live = m.outcomes.some(o => o.sides.some(s => OcPrices.mid(s.coin) != null));
      if (!live) return false;
      if (cat === 'fav') { if (!OcState.favs.has(m.id)) return false; }
      else if (cat !== 'all' && m.category !== cat) return false;
      if (q) {
        const hay = (m.title + ' ' + (m.subtitle || '') + ' ' +
                     m.outcomes.map(o => o.title).join(' ')).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const sort = OcState.sort;
    list.sort((a, b) => {
      if (sort === 'time') {
        const ta = a.settleAt ? a.settleAt.getTime() : Infinity;
        const tb = b.settleAt ? b.settleAt.getTime() : Infinity;
        return ta - tb;
      }
      if (sort === 'price') return (_topPx(b) ?? 0) - (_topPx(a) ?? 0);
      return b.outcomes.length - a.outcomes.length;
    });
    return list;
  }

  /* أعلى احتمال داخل سوق */
  function _topPx(m) {
    let best = null;
    m.outcomes.forEach(o => {
      const p = OcPrices.mid(o.sides[0].coin);
      if (p != null && (best == null || p > best)) best = p;
    });
    return best;
  }

  /* ════ شاشة الأسواق ════ */
  function renderCats() {
    const el = oc$('ocCats');
    if (!el) return;
    const cats = [{ id: 'fav', label: 'المفضلة', icon: '★' }, ...OC_CATEGORIES];
    el.innerHTML = cats.map(c =>
      `<button class="oc-cat ${OcState.category === c.id ? 'active' : ''}" data-cat="${c.id}">
         <span class="oc-cat-i">${c.icon}</span>${ocEsc(c.label)}
       </button>`).join('');
    el.querySelectorAll('.oc-cat').forEach(b => b.onclick = () => {
      OcState.category = b.dataset.cat; ocBuzz(); renderCats(); renderMarkets();
    });
  }

  function renderMarkets() {
    const el = oc$('ocMarketList');
    if (!el) return;

    if (!OcState.loaded) {
      el.innerHTML = '<div class="oc-skel"></div>'.repeat(6);
      return;
    }
    if (OcState.metaError) {
      el.innerHTML = `<div class="oc-empty">⚠️ ${ocEsc(OcState.metaError)}
        <button class="oc-btn-mini" onclick="OcApp.reload()">إعادة المحاولة</button></div>`;
      return;
    }

    const list = _visibleMarkets();
    ocSetTxt('ocMarketCount', list.length ? `${list.length} سوق` : '');
    if (!list.length) {
      el.innerHTML = `<div class="oc-empty">لا توجد أسواق مطابقة${OcState.query ? ` لـ«${ocEsc(OcState.query)}»` : ''}</div>`;
      return;
    }

    el.innerHTML = list.slice(0, 120).map(m => _card(m)).join('');
    el.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openMarket(b.dataset.open));
    el.querySelectorAll('[data-fav]').forEach(b => b.onclick = e => {
      e.stopPropagation(); ocToggleFav(b.dataset.fav); ocBuzz(); renderMarkets();
    });
  }

  function _card(m) {
    const fav  = OcState.favs.has(m.id);
    const cd   = m.settleAt ? ocCountdown(m.settleAt) : '';
    const cat  = OC_CATEGORIES.find(c => c.id === m.category);

    /* سؤال بعدة نتائج → أعلى 3 احتمالات ؛ سوق منفرد → شريط نعم/لا */
    let body;
    if (m.kind === 'question' && m.outcomes.length > 1) {
      const rows = m.outcomes
        .map(o => ({ o, px: OcPrices.mid(o.sides[0].coin) }))
        .filter(r => r.px != null)
        .sort((a, b) => b.px - a.px)
        .slice(0, 3);
      body = `<div class="oc-card-rows">${rows.map(r => `
        <div class="oc-card-row">
          <span class="oc-cr-name">${ocEsc(r.o.kv.participant || r.o.title)}</span>
          <span class="oc-cr-bar"><i style="width:${(r.px * 100).toFixed(1)}%"></i></span>
          <span class="oc-cr-px">${ocPct(r.px, 0)}</span>
        </div>`).join('')}
        ${m.outcomes.length > 3 ? `<div class="oc-card-more">+${m.outcomes.length - 3} احتمال آخر</div>` : ''}
      </div>`;
    } else {
      const o = m.outcomes[0];
      const y = OcPrices.mid(o.sides[0].coin);
      const n = OcPrices.mid(o.sides[1].coin);
      body = `<div class="oc-card-yn">
        <div class="oc-yn yes"><span>${ocEsc(o.sides[0].name)}</span><b>${y != null ? ocPct(y, 0) : '—'}</b></div>
        <div class="oc-yn no"><span>${ocEsc(o.sides[1].name)}</span><b>${n != null ? ocPct(n, 0) : (y != null ? ocPct(1 - y, 0) : '—')}</b></div>
      </div>`;
    }

    return `<article class="oc-card" data-open="${ocEsc(m.id)}">
      <header class="oc-card-head">
        <span class="oc-chip">${cat ? cat.icon + ' ' + cat.label : 'سوق'}</span>
        ${cd ? `<span class="oc-chip time ${cd === 'انتهى' ? 'over' : ''}">⏳ ${cd}</span>` : ''}
        <button class="oc-fav ${fav ? 'on' : ''}" data-fav="${ocEsc(m.id)}" aria-label="مفضلة">★</button>
      </header>
      <h3 class="oc-card-title">${ocEsc(m.title)}</h3>
      ${m.subtitle ? `<p class="oc-card-sub">${ocEsc(m.subtitle)}</p>` : ''}
      ${body}
      <footer class="oc-card-foot">${m.settleAt ? 'التسوية: ' + ocDateAr(m.settleAt) : 'تسوية غير محددة'}</footer>
    </article>`;
  }

  /* ════ شاشة السوق ════ */
  function openMarket(id) {
    const m = OcState.model?.markets.find(x => x.id === id);
    if (!m) return;
    OcState.active        = m;
    OcState.activeOutcome = m.outcomes[0];
    OcState.activeSide    = 0;
    OcState.ticket.px = ''; OcState.ticket.sz = ''; OcState.ticket.usd = '';
    try { localStorage.setItem(OC_LS_LASTMKT, id); } catch {}
    go('market');
    renderMarket();
    _bindBook();
  }

  function closeMarket() { OcBook.close(); OcState.active = null; go('markets'); }

  function _bindBook() {
    const s = OcOrder.activeSide();
    if (s) OcBook.open(s.coin);
  }

  function selectOutcome(outcomeId) {
    const m = OcState.active;
    if (!m) return;
    const o = m.outcomes.find(x => String(x.id) === String(outcomeId)) ||
              (m.fallback && String(m.fallback.id) === String(outcomeId) ? m.fallback : null);
    if (!o) return;
    OcState.activeOutcome = o;
    OcState.activeSide = 0;
    renderMarket(); _bindBook();
  }

  function selectSide(side) {
    OcState.activeSide = Number(side) ? 1 : 0;
    ocBuzz();
    renderMarket(); _bindBook();
  }

  function renderMarket() {
    const m = OcState.active, o = OcState.activeOutcome;
    if (!m || !o) return;

    ocSetTxt('ocMktTitle', m.title);
    ocSetTxt('ocMktSub',   m.subtitle || (m.kind === 'question' ? 'اختر الاحتمال ثم الجانب' : ''));
    ocSetTxt('ocMktSettle', m.settleAt ? `التسوية ${ocDateAr(m.settleAt)} · ${ocCountdown(m.settleAt)}` : 'تسوية غير محددة');
    ocSetTxt('ocMktVenue', `${o.quote} · ${o.venue}`);

    /* اختيار النتيجة داخل سؤال */
    const chips = oc$('ocOutcomeChips');
    const multi = m.outcomes.length > 1 || m.fallback;
    ocShow('ocOutcomeWrap', !!multi);
    if (chips && multi) {
      const all = m.fallback ? [...m.outcomes, m.fallback] : m.outcomes;
      chips.innerHTML = all.map(x => {
        const px = OcPrices.mid(x.sides[0].coin);
        return `<button class="oc-ochip ${x.id === o.id ? 'active' : ''}" data-oc="${x.id}">
          <span>${ocEsc(x.kv.participant || x.title)}</span>
          <b>${px != null ? ocPct(px, 0) : '—'}</b>
        </button>`;
      }).join('');
      chips.querySelectorAll('[data-oc]').forEach(b => b.onclick = () => selectOutcome(b.dataset.oc));
    }

    /* الجانبان */
    const sides = oc$('ocSides');
    if (sides) {
      sides.innerHTML = o.sides.map((s, i) => {
        const px = OcPrices.mid(s.coin);
        const held = OcPortfolio.sharesOf(s.token);
        return `<button class="oc-side ${i === OcState.activeSide ? 'active' : ''} ${i === 0 ? 'yes' : 'no'}" data-side="${i}">
          <span class="oc-side-name">${ocEsc(s.name)}</span>
          <span class="oc-side-px">${px != null ? ocPct(px, 1) : '—'}</span>
          <span class="oc-side-sub">${px != null ? ocCents(px) + ' للسهم' : 'بلا سعر'}</span>
          ${held > 0 ? `<span class="oc-side-held">تملك ${ocFmt(held, 2)}</span>` : ''}
        </button>`;
      }).join('');
      sides.querySelectorAll('[data-side]').forEach(b => b.onclick = () => selectSide(b.dataset.side));
    }

    OcBook.render();
    renderTicket();
  }

  /* ════ التذكرة ════ */
  function renderTicket() {
    if (OcState.view !== 'market') return;
    const s = OcOrder.activeSide();
    if (!s) return;
    const t = OcState.ticket;

    document.querySelectorAll('[data-dir]').forEach(b => b.classList.toggle('active', b.dataset.dir === t.dir));
    document.querySelectorAll('[data-type]').forEach(b => b.classList.toggle('active', b.dataset.type === t.type));
    ocShow('ocPxWrap', t.type === 'limit');

    const pxIn  = oc$('ocPx'), szIn = oc$('ocSz'), usdIn = oc$('ocUsd');
    if (pxIn && document.activeElement !== pxIn) {
      const ref = OcOrder.refPx();
      pxIn.value = t.px || (ref != null ? String(parseFloat(ref.toFixed(OC_PX_DP))) : '');
      if (!t.px && ref != null) t.px = pxIn.value;
    }
    if (szIn  && document.activeElement !== szIn)  szIn.value  = t.sz;
    if (usdIn && document.activeElement !== usdIn) usdIn.value = t.usd;

    ocSetTxt('ocTicketSide', `${t.dir === 'buy' ? 'شراء' : 'بيع'} «${s.name}»`);
    ocSetTxt('ocAvail', t.dir === 'buy' ? ocUsd(OcState.usdc) : `${ocFmt(OcPortfolio.sharesOf(s.token), 2)} سهم`);
    ocSetTxt('ocAvailLbl', t.dir === 'buy' ? 'الرصيد المتاح' : 'أسهمك القابلة للبيع');

    const sum = OcOrder.summary();
    const box = oc$('ocSummary');
    if (box) {
      box.innerHTML = sum ? `
        <div class="oc-sum-row"><span>${t.dir === 'buy' ? 'التكلفة' : 'العائد الفوري'}</span><b>${ocUsd(t.dir === 'buy' ? sum.cost : sum.proceed)}</b></div>
        <div class="oc-sum-row"><span>عدد الأسهم</span><b>${ocFmt(sum.sz, 2)}</b></div>
        <div class="oc-sum-row"><span>سعر السهم</span><b>${ocPct(sum.px, 1)} · ${ocCents(sum.px)}</b></div>
        ${t.dir === 'buy' ? `
        <div class="oc-sum-row win"><span>إن تحقّقت النتيجة</span><b>+${ocUsd(sum.maxWin)}${sum.roi != null ? ` (${sum.roi.toFixed(0)}%)` : ''}</b></div>
        <div class="oc-sum-row loss"><span>إن لم تتحقق</span><b>−${ocUsd(sum.cost)}</b></div>` : ''}
      ` : '<div class="oc-sum-hint">أدخل المبلغ أو عدد الأسهم لعرض الأرباح المحتملة</div>';
    }

    const btn = oc$('ocSubmit');
    if (btn && !btn.dataset.loading) {
      const err = OcOrder.validate();
      btn.className = 'oc-submit ' + (t.dir === 'buy' ? 'buy' : 'sell');
      btn.disabled  = false;
      btn.textContent = err ? err : `${t.dir === 'buy' ? 'شراء' : 'بيع'} ${ocFmt(t.sz || 0, 2)} سهم «${s.name}»`;
      btn.classList.toggle('blocked', !!err);
    }
  }

  /* ════ المحفظة ════ */
  function renderPortfolio() {
    const el = oc$('ocPortfolio');
    if (!el) return;
    if (State.isGuest || !State.wallet) {
      el.innerHTML = `<div class="oc-empty">سجّل الدخول لعرض أسهمك وأوامرك
        <button class="oc-btn-mini" onclick="openModal('modalLogin')">تسجيل الدخول</button></div>`;
      return;
    }
    const t = OcPortfolio.totals();

    const tokens = Object.keys(OcState.shares);
    const posHtml = tokens.length ? tokens.map(tk => {
      const dec = ocDecode(tk);
      const px  = OcPrices.mid('#' + dec.enc);
      const sh  = OcState.shares[tk];
      const val = (px != null ? px : 0) * sh.total;
      const o   = OcState.model?.byOutcome?.get(dec.outcome);
      return `<div class="oc-pos" ${o ? `data-goto="o${o.id}"` : ''}>
        <div class="oc-pos-top">
          <span class="oc-pos-name">${ocEsc(OcPortfolio.label(tk))}</span>
          <span class="oc-pos-val">${ocUsd(val)}</span>
        </div>
        <div class="oc-pos-sub">
          <span>${ocFmt(sh.total, 2)} سهم</span>
          <span>${px != null ? ocPct(px, 1) : '—'}</span>
          <span>إن تحقّقت: ${ocUsd(sh.total)}</span>
        </div>
      </div>`;
    }).join('') : '<div class="oc-empty">لا تملك أسهماً بعد</div>';

    const ordHtml = OcState.openOrders.length ? OcState.openOrders.map(o => `
      <div class="oc-ord">
        <div class="oc-ord-top">
          <span class="oc-ord-dir ${o.side === 'B' ? 'buy' : 'sell'}">${o.side === 'B' ? 'شراء' : 'بيع'}</span>
          <span class="oc-ord-name">${ocEsc(OcPortfolio.label(o.coin))}</span>
        </div>
        <div class="oc-ord-sub">
          <span>${ocFmt(o.sz, 2)} سهم · ${ocPct(o.limitPx, 1)}</span>
          <button class="oc-cancel" data-cancel="${o.oid}" data-coin="${ocEsc(o.coin)}">إلغاء</button>
        </div>
      </div>`).join('') : '<div class="oc-empty">لا أوامر مفتوحة</div>';

    el.innerHTML = `
      <div class="oc-pf-cards">
        <div class="oc-pf-card"><span>القيمة الكلية</span><b>${ocUsd(t.equity)}</b></div>
        <div class="oc-pf-card"><span>نقد متاح</span><b>${ocUsd(t.usdc)}</b></div>
        <div class="oc-pf-card"><span>قيمة الأسهم</span><b>${ocUsd(t.sharesValue)}</b></div>
        <div class="oc-pf-card"><span>مراكز</span><b>${t.count}</b></div>
      </div>
      <h4 class="oc-h4">أسهمك</h4>${posHtml}
      <h4 class="oc-h4">أوامر مفتوحة</h4>${ordHtml}
      <button class="oc-btn-wide" onclick="showHistory()">📜 سجل التداول</button>`;

    el.querySelectorAll('[data-cancel]').forEach(b => b.onclick = () => OcOrder.cancel(b.dataset.coin, b.dataset.cancel));
    el.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => openMarket(b.dataset.goto));
  }

  /* ════ إعادة الرسم عند تغيّر الأسعار ════ */
  function onPrices() {
    if (OcState.view === 'markets')   renderMarkets();
    if (OcState.view === 'market')    renderMarket();
    if (OcState.view === 'portfolio') renderPortfolio();
  }

  return { go, renderCats, renderMarkets, renderMarket, renderTicket, renderPortfolio,
           openMarket, closeMarket, selectOutcome, selectSide, onPrices };
})();
