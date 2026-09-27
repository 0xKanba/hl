/* ═══════════════════════════════════════════════════════════════
   oc-format.js — تنسيق أرقام/أوقات + أدوات DOM صغيرة

   ملاحظة مهمة عن الأسعار: أسواق التوقعات تتداول بين 0 و1، وتُعرض
   للمستخدم كنسبة احتمال (مثلاً 0.6428 → «64.3%»). قواعد الدقّة
   الرسمية: حتى 5 أرقام معنوية، وحتى (8 − szDecimals) خانة عشرية —
   لذلك نقصّ السعر إلى 5 خانات عشرية والكمية إلى خانتين.
═══════════════════════════════════════════════════════════════ */
'use strict';

/* ════ DOM ════ */
const oc$ = (id) => document.getElementById(id);
function ocSetTxt(id, v)  { const e = oc$(id); if (e) e.textContent = v; }
function ocSetHtml(id, v) { const e = oc$(id); if (e) e.innerHTML = v; }
function ocShow(id, on)   { const e = oc$(id); if (e) e.classList.toggle('hidden', !on); }
function ocEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ════ أرقام ════ */
function ocFmt(v, dp = 2) {
  const n = parseFloat(v);
  if (!isFinite(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function ocUsd(v, dp = 2) {
  const n = parseFloat(v);
  if (!isFinite(n)) return '—';
  return '$' + ocFmt(n, dp);
}
/* احتمال بالنسبة المئوية — 0.6428 → «64.3%» */
function ocPct(px, dp = 1) {
  const n = parseFloat(px);
  if (!isFinite(n)) return '—';
  return (n * 100).toFixed(dp) + '%';
}
function ocCents(px) {
  const n = parseFloat(px);
  if (!isFinite(n)) return '—';
  return (n * 100).toFixed(1) + '¢';
}

/* ════ تقريب للشبكة (wire) ════
   الأسعار: أقصى 5 خانات عشرية + إزالة الأصفار الزائدة (مطلوب للتوقيع)
   الكميات: szDecimals = 2 */
function ocWirePx(px) {
  let p = Math.min(OC_MAX_PX, Math.max(OC_MIN_PX, parseFloat(px) || 0));
  return String(parseFloat(p.toFixed(OC_PX_DP)));
}
function ocWireSz(sz) {
  const s = Math.max(0, parseFloat(sz) || 0);
  return String(parseFloat(s.toFixed(OC_SZ_DP)));
}

/* ════ وقت ════ */
const OC_AR_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

function ocDateAr(d) {
  if (!(d instanceof Date) || isNaN(d)) return '—';
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${OC_AR_MONTHS[d.getMonth()]} ${d.getFullYear()} · ${h}:${m}`;
}

/* عدّاد تنازلي مختصر: «٣ س ١٢ د» */
function ocCountdown(d) {
  if (!(d instanceof Date) || isNaN(d)) return '';
  let s = Math.floor((d.getTime() - Date.now()) / 1000);
  if (s <= 0) return 'انتهى';
  const day = Math.floor(s / 86400); s -= day * 86400;
  const hr  = Math.floor(s / 3600);  s -= hr * 3600;
  const mi  = Math.floor(s / 60);
  if (day > 0) return `${day} يوم${hr ? ` ${hr} س` : ''}`;
  if (hr > 0)  return `${hr} س${mi ? ` ${mi} د` : ''}`;
  return `${mi} د`;
}

/* ════ اهتزاز خفيف (اختياري) ════ */
function ocBuzz(ms = 12) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch {}
}
