/* ═══════════════════════════════════════
   session.js — إحصائيات الجلسة والكاش السريع
   ✅ بداية الجلسة 00:00 UTC+3
   ✅ كاش يشمل sessionStats → يظهر فوراً عند فتح التطبيق
   ✅ startMainClock محذوفة (كانت ميتة — dtClock في app.js يغطيها)
═══════════════════════════════════════ */

'use strict';

/* ════ بداية الجلسة (12AM UTC+3) ════ */
function getSessionStartMs() {
  const u3 = new Date(Date.now() + 3 * 3600_000);
  return Date.UTC(u3.getUTCFullYear(), u3.getUTCMonth(), u3.getUTCDate(), 0, 0, 0) - 3 * 3600_000;
}

/* ════ جلب إحصائيات الجلسة ════ */
async function fetchSessionStats(sym) {
  try {
    const a   = ASSETS[sym]; if (!a) return;
    const div = a.gram ? TROY : 1;
    const raw = await hlInfo({
      type: 'candleSnapshot',
      req:  { coin:a.coin, interval:'1h', startTime:getSessionStartMs(), endTime:Date.now() }
    });
    if (!Array.isArray(raw) || !raw.length) return;
    State.sessionStats[sym] = {
      open: parseFloat(raw[0].o) / div,
      high: Math.max(...raw.map(c => parseFloat(c.h))) / div,
      low:  Math.min(...raw.map(c => parseFloat(c.l))) / div
    };
    if (State.asset === sym) updateSessionUI();
    saveQuickState(); /* ✅ احفظ بعد كل تحديث للجلسة */
  } catch (e) { console.warn('[Session]', sym, e.message); }
}

/* ════ تحديث شريط الجلسة ════ */
function updateSessionUI() {
  const sym = State.asset;
  const st  = State.sessionStats[sym];
  const p   = State.prices[sym];
  const a   = ASSETS[sym];
  const el  = $('priceSession');
  if (!st || !p?.mid || !el) return;

  const pct = ((p.mid - st.open) / st.open) * 100;
  el.classList.remove('hidden');

  const chgEl = $('psChg');
  if (chgEl) {
    chgEl.textContent = `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
    chgEl.className   = `ps-chg ${pct >= 0 ? 'up' : 'dn'}`;
  }
  const hEl = $('psH'); if (hEl) hEl.textContent = `H ${fmt(st.high, a.pxDp)}`;
  const lEl = $('psL'); if (lEl) lEl.textContent = `L ${fmt(st.low,  a.pxDp)}`;
}

/* ════ بدء تحديث الجلسة كل 3 دقائق ════ */
function startSessionPolling() {
  if (State._sessionTimer) clearInterval(State._sessionTimer);
  fetchSessionStats(State.asset);
  State._sessionTimer = setInterval(() => fetchSessionStats(State.asset), 3 * 60_000);
}

/* ════ Cache سريع — يشمل الأسعار + إحصائيات الجلسة ════
   الفائدة: عند إعادة فتح التطبيق خلال 5 دقائق،
   الأسعار وإحصائيات الجلسة تظهر فوراً بدون انتظار API
════ */
function saveQuickState() {
  if (!State.wallet) return;
  try {
    localStorage.setItem(QSTATE_KEY, JSON.stringify({
      prices:       State.prices,
      prevDayPx:    State.prevDayPx,
      sessionStats: State.sessionStats, /* ✅ الجديد */
      t:            Date.now()
    }));
  } catch {}
}

function loadQuickState() {
  try {
    const d = JSON.parse(localStorage.getItem(QSTATE_KEY) || 'null');
    if (!d || Date.now() - d.t > 300_000) return; /* 5 دقائق حد أقصى */

    if (d.prices)       Object.assign(State.prices,       d.prices);
    if (d.prevDayPx)    Object.assign(State.prevDayPx,    d.prevDayPx);
    if (d.sessionStats) Object.assign(State.sessionStats, d.sessionStats); /* ✅ فوري */

    /* تحديث تابات الأسعار فوراً */
    Object.keys(ASSETS).forEach(sym => {
      const p  = State.prices[sym]; if (!p?.mid) return;
      const el = $(`price${sym}`);  if (el) el.textContent = fmt(p.mid, ASSETS[sym].pxDp);
    });

    /* ✅ عرض إحصائيات الجلسة المحفوظة فوراً */
    updateSessionUI();
  } catch {}
}
