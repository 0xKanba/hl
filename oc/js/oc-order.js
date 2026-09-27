/* ═══════════════════════════════════════════════════════════════
   oc-order.js — تذكرة الشراء/البيع لأسواق التوقعات

   الفكرة ببساطة: كل سهم "نعم" أو "لا" يُسوّى إلى 1$ إن تحقّقت نتيجته
   و0$ إن لم تتحقق. إذن:
     - شراء سهم بسعر p يكلّف (p × عدد الأسهم) دولار
     - أقصى ربح = (1 − p) × عدد الأسهم ، وأقصى خسارة = التكلفة نفسها
     - لا رفع مالي ولا تصفية إطلاقاً (ممول بالكامل)

   الإرسال عبر hlExchange (core/api.js — نفس التوقيع والوكيل 100%):
     asset id = 100_000_000 + encoding     (راجع oc-config.js)
     سوق   → أمر حدّي عابر (Ioc) بسعر عدواني بحدود آمنة
     حدّي  → Gtc بسعر المستخدم
═══════════════════════════════════════════════════════════════ */
'use strict';

const OcOrder = (function () {

  /* ════ الجانب المختار حالياً ════ */
  function activeSide() {
    const o = OcState.activeOutcome;
    if (!o) return null;
    return o.sides[OcState.activeSide] || o.sides[0];
  }

  /* ════ السعر المرجعي للجانب ════ */
  function refPx() {
    const s = activeSide();
    if (!s) return null;
    const { bid, ask } = OcPrices.bbo(s.coin);
    const t = OcState.ticket;
    if (t.dir === 'buy'  && ask != null) return ask;
    if (t.dir === 'sell' && bid != null) return bid;
    const m = OcPrices.mid(s.coin);
    if (m != null) return m;
    if (bid != null && ask != null) return (bid + ask) / 2;
    return bid != null ? bid : (ask != null ? ask : null);
  }

  /* سعر التنفيذ المستخدم بالحساب/الإرسال */
  function execPx() {
    const t = OcState.ticket;
    if (t.type === 'limit') {
      const p = parseFloat(t.px);
      return isFinite(p) && p > 0 ? p : refPx();
    }
    return refPx();
  }

  /* ════ مزامنة الدولار ↔ عدد الأسهم ════ */
  function syncFromUsd() {
    const px = execPx();
    const usd = parseFloat(OcState.ticket.usd);
    if (!isFinite(usd) || !px) { OcState.ticket.sz = ''; return; }
    OcState.ticket.sz = ocWireSz(usd / px);
  }
  function syncFromSz() {
    const px = execPx();
    const sz = parseFloat(OcState.ticket.sz);
    if (!isFinite(sz) || !px) { OcState.ticket.usd = ''; return; }
    OcState.ticket.usd = (sz * px).toFixed(2);
  }

  /* ════ ملخّص التذكرة للعرض ════ */
  function summary() {
    const t  = OcState.ticket;
    const px = execPx();
    const sz = parseFloat(t.sz) || 0;
    if (!px || !sz) return null;
    const cost   = px * sz;                       // تكلفة الشراء
    const proceed = cost;                         // عائد البيع الفوري
    const maxWin = t.dir === 'buy' ? (1 - px) * sz : cost;
    return {
      px, sz,
      cost,
      proceed,
      maxWin,
      maxLoss: t.dir === 'buy' ? cost : (1 - px) * sz,
      roi: t.dir === 'buy' && cost > 0 ? (maxWin / cost) * 100 : null
    };
  }

  /* ════ فحوصات قبل الإرسال ════ */
  function validate() {
    const s = activeSide();
    if (!s) return 'اختر سوقاً أولاً';
    if (State.isGuest || !State.wallet) return 'سجّل الدخول أولاً';
    const t = OcState.ticket;
    const px = execPx();
    if (!px) return 'لا يوجد سعر متاح لهذا السوق الآن';
    if (t.type === 'limit') {
      const p = parseFloat(t.px);
      if (!isFinite(p) || p < OC_MIN_PX || p > OC_MAX_PX)
        return `السعر الحدّي يجب أن يكون بين ${ocPct(OC_MIN_PX, 3)} و${ocPct(OC_MAX_PX, 3)}`;
    }
    const sz = parseFloat(t.sz);
    if (!isFinite(sz) || sz <= 0) return 'أدخل الكمية أو المبلغ';
    if (px * sz < OC_MIN_NOTIONAL) return `أدنى قيمة للصفقة ${ocUsd(OC_MIN_NOTIONAL)}`;
    if (t.dir === 'buy') {
      const avail = OcState.usdc;
      if (avail && px * sz > avail + 1e-9) return 'رصيد USDC غير كافٍ';
    } else {
      const held = OcPortfolio.sharesOf(s.token);
      if (held <= 0) return 'لا تملك أسهماً بهذا الجانب للبيع';
      if (sz > held + 1e-9) return `أقصى كمية للبيع ${ocFmt(held, 2)} سهم`;
    }
    return null;
  }

  /* ════ الإرسال ════ */
  async function submit() {
    const err = validate();
    if (err) { toast('⚠️ ' + err, 'warn'); return; }

    const s  = activeSide();
    const t  = OcState.ticket;
    const isBuy = t.dir === 'buy';
    const sz = ocWireSz(t.sz);

    /* سعر الإرسال: حدّي = سعر المستخدم ، سوق = سعر عدواني داخل الحدود */
    let px;
    if (t.type === 'limit') {
      px = ocWirePx(t.px);
    } else {
      const ref = refPx();
      px = ocWirePx(isBuy ? Math.min(OC_MAX_PX, ref * 1.03 + 0.005)
                          : Math.max(OC_MIN_PX, ref * 0.97 - 0.005));
    }

    const action = {
      type: 'order',
      orders: [{
        a: s.asset,
        b: isBuy,
        p: px,
        s: sz,
        r: false,
        t: { limit: { tif: t.type === 'limit' ? 'Gtc' : 'Ioc' } }
      }],
      grouping: 'na'
    };

    setBtnLoading('ocSubmit', '⏳ جارٍ التنفيذ...');
    showLoader(isBuy ? 'جارٍ تنفيذ الشراء...' : 'جارٍ تنفيذ البيع...');
    try {
      const res = await hlExchange(action);
      const st  = res?.response?.data?.statuses?.[0] || {};
      if (st.error) throw new Error(st.error);

      if (st.filled) {
        const f = st.filled;
        toast(`✅ ${isBuy ? 'شراء' : 'بيع'} ${ocFmt(f.totalSz, 2)} سهم بسعر ${ocPct(f.avgPx, 1)}`, 'ok', 5000);
        playFillSound();
      } else if (st.resting) {
        toast(`🕒 أمر حدّي مُدرَج بسعر ${ocPct(px, 1)} — بانتظار التنفيذ`, 'info', 5000);
      } else {
        toast('✅ تم إرسال الأمر', 'ok');
      }
      ocBuzz();
      OcState.ticket.usd = '';
      OcState.ticket.sz  = '';
      OcPortfolio.refresh();
      if (typeof OcUI !== 'undefined') OcUI.renderTicket();
    } catch (e) {
      toast(tradeErr(e.message), 'err');
    } finally {
      resetBtn('ocSubmit');
      hideLoader();
    }
  }

  /* ════ إلغاء أمر مفتوح ════ */
  async function cancel(coin, oid) {
    const dec = ocDecode(coin);
    if (!dec) return;
    showLoader('جارٍ إلغاء الأمر...');
    try {
      await hlExchange({ type: 'cancel', cancels: [{ a: OC_ASSET_BASE + dec.enc, o: typeof oid === 'string' ? BigInt(oid) : oid }] });
      toast('✅ تم إلغاء الأمر', 'ok');
      OcPortfolio.refresh();
    } catch (e) {
      toast('⚠️ ' + errToAr(e.message), 'err');
    } finally { hideLoader(); }
  }

  return { activeSide, refPx, execPx, syncFromUsd, syncFromSz, summary, validate, submit, cancel };
})();
