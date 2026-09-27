/* ═══════════════════════════════════════════════════════════════
   oc-prices.js — تحميل الميتاداتا + الأسعار المباشرة

   مصدر الأسعار: allMids (لقطة عبر hlInfo ثم اشتراك حيّ عبر HL) —
   مفاتيح أسواق التوقعات تظهر بالشكل `#${encoding}` بالضبط، ولا تظهر
   إلا للأسواق المتداولة فعلياً (غير المدرَجة لا يوجد لها mid) — نستخدم
   ذلك مباشرة لتصفية "الأسواق الحيّة" بالواجهة بلا أي فرضيات إضافية.
═══════════════════════════════════════════════════════════════ */
'use strict';

const OcPrices = (function () {

  let _midsUnsub = null;
  let _reconnUnsub = null;
  let _renderTimer = null;

  /* كل coin ظهر له سعر حقيقي = سوق حيّ قابل للتداول */
  const live = new Set();

  function _applyMids(mids) {
    if (!mids) return;
    let touched = false;
    for (const k in mids) {
      if (k.charCodeAt(0) !== 35) continue; // '#'
      const v = parseFloat(mids[k]);
      if (!isFinite(v)) continue;
      const cur = OcState.px[k] || (OcState.px[k] = { mid: 0, prev: 0 });
      if (cur.mid !== v) { cur.prev = cur.mid; cur.mid = v; touched = true; }
      live.add(k);
    }
    if (touched) _scheduleRender();
  }

  /* تجميع التحديثات — رسم واحد كل 400ms بدل رسم لكل رسالة */
  function _scheduleRender() {
    if (_renderTimer) return;
    _renderTimer = setTimeout(() => {
      _renderTimer = null;
      _emit();
    }, 400);
  }

  async function loadMeta() {
    try {
      const meta = await hlInfo({ type: 'outcomeMeta' });
      OcState.model = OcMeta.build(meta);
      OcState.loaded = true;
      OcState.metaError = null;
    } catch (e) {
      OcState.metaError = errToAr(e.message);
      console.warn('[oc-prices] outcomeMeta', e);
    }
  }

  async function snapshotMids() {
    try {
      const mids = await hlInfo({ type: 'allMids' });
      _applyMids(mids && mids.mids ? mids.mids : mids);
    } catch (e) { console.warn('[oc-prices] allMids', e.message); }
  }

  function start() {
    snapshotMids();
    if (_midsUnsub) return;
    _midsUnsub  = HL.subscribe({ type: 'allMids' }, d => _applyMids(d && d.mids ? d.mids : d));
    _reconnUnsub = HL.onReconnect(snapshotMids);
  }

  /* مستمعو التحديث (الواجهة) */
  const _listeners = [];
  function onUpdate(fn) { if (typeof fn === 'function') _listeners.push(fn); }
  function _emit() { _listeners.forEach(f => { try { f(); } catch {} }); }

  function stop() {
    if (_midsUnsub) { try { _midsUnsub(); } catch {} _midsUnsub = null; }
    if (_reconnUnsub) { try { _reconnUnsub(); } catch {} _reconnUnsub = null; }
  }

  /* سعر جانب (احتمال 0..1) */
  function mid(coin) {
    const p = OcState.px[coin];
    return p && isFinite(p.mid) ? p.mid : null;
  }

  /* هل السوق حيّ؟ (أي جانب له سعر) */
  function isLive(market) {
    return (market.outcomes || []).some(o => o.sides.some(s => live.has(s.coin)));
  }

  /* أفضل عرض/طلب من دفتر السوق المفتوح إن توفّر */
  function bbo(coin) {
    const b = OcState.book[coin];
    if (!b) return { bid: null, ask: null };
    return {
      bid: b.bids?.[0] ? parseFloat(b.bids[0].px) : null,
      ask: b.asks?.[0] ? parseFloat(b.asks[0].px) : null
    };
  }

  return { loadMeta, snapshotMids, start, stop, mid, isLive, bbo, live, onUpdate };
})();
