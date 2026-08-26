/* ═══════════════════════════════════════
   utils.js — أدوات مساعدة عامة
   ✅ جديد — errToAr(): مصدر ترجمة واحد لكل رسائل الخطأ بالمشروع.
      كل مكان كان يُلحق e.message الخام بالإنجليزية مباشرة بواجهة
      المستخدم (agents.js، auth.js، c.js، ومسار tradeErr الافتراضي
      بـapi.js) أصبح يمر من هنا. أي رسالة غير معروفة → عبارة عربية
      عامة ثابتة بدل تسريب النص الأجنبي؛ النص الأصلي يُطبع بالconsole
      فقط للتشخيص، لا بالواجهة.
   ✅ toast() الآن تفرض حداً أدنى أطول تلقائياً لأنواع 'err'/'warn' —
      بمكان واحد، بدل الاعتماد على كل نداء بالمشروع ليتذكر تمرير مدة
      طويلة يدوياً (كان هذا سبب رسائل تختفي خلال 3.5 ثانية فقط رغم
      احتواءها معلومة مهمة). أي مدة أطول يمرّرها المستدعي صراحة تبقى
      محترمة كما هي — الفرض فقط يرفع الحد الأدنى، لا يخفضه.
   ✅ toast() تدعم نوعاً رابعاً 'warn' (تحذير مهم غير فاشل) — يستخدم
      لون --warn الموجود أصلاً بthemes.css، بدل إعادة استخدام 'err'
      لأشياء ليست فشلاً حقيقياً (مثل "أودع USDC أولاً").
═══════════════════════════════════════ */
'use strict';

/* ════ MsgPack Encoder ════ */
const MsgPack = (function () {
  const te = new TextEncoder();
  function enc(v, b) {
    if (v === null)  { b.push(0xc0); return; }
    if (v === true)  { b.push(0xc3); return; }
    if (v === false) { b.push(0xc2); return; }
    if (typeof v === 'number') {
      if (Number.isInteger(v) && v >= -2147483648 && v <= 4294967295) {
        if (v >= 0 && v <= 127)           { b.push(v); return; }
        if (v < 0 && v >= -32)            { b.push(0xe0 | (v + 32)); return; }
        if (v >= 0 && v <= 255)           { b.push(0xcc, v); return; }
        if (v >= -128 && v < 0)           { b.push(0xd0, (v + 256) & 0xff); return; }
        if (v >= 0 && v <= 65535)         { b.push(0xcd, (v >> 8) & 0xff, v & 0xff); return; }
        if (v >= -32768 && v < 0)         { b.push(0xd1, (v >> 8) & 0xff, v & 0xff); return; }
        if (v >= 0)                       { b.push(0xce, (v>>>24)&0xff,(v>>>16)&0xff,(v>>>8)&0xff, v&0xff); return; }
        b.push(0xd2, (v>>>24)&0xff, (v>>>16)&0xff, (v>>>8)&0xff, v&0xff); return;
      }
      const dv = new DataView(new ArrayBuffer(9));
      dv.setFloat64(1, v, false);
      b.push(0xcb); for (let i = 1; i <= 8; i++) b.push(dv.getUint8(i)); return;
    }
    if (typeof v === 'bigint') {
      b.push(0xcf);
      const dv = new DataView(new ArrayBuffer(8));
      dv.setBigUint64(0, v, false);
      for (let i = 0; i < 8; i++) b.push(dv.getUint8(i)); return;
    }
    if (typeof v === 'string') {
      const u = te.encode(v);
      if (u.length <= 31)   b.push(0xa0 | u.length);
      else if (u.length <= 255) b.push(0xd9, u.length);
      else b.push(0xda, (u.length >> 8) & 0xff, u.length & 0xff);
      for (const c of u) b.push(c); return;
    }
    if (Array.isArray(v)) {
      if (v.length <= 15) b.push(0x90 | v.length);
      for (const i of v) enc(i, b); return;
    }
    if (typeof v === 'object') {
      const ks = Object.keys(v);
      if (ks.length <= 15) b.push(0x80 | ks.length);
      for (const k of ks) { enc(k, b); enc(v[k], b); }
    }
  }
  return {
    encode: obj => { const b = []; enc(obj, b); return new Uint8Array(b); }
  };
})();

/* ════ DOM Helpers ════ */
const $ = id => document.getElementById(id);
const openModal  = id => $(id)?.classList.add('open');
const closeModal = id => $(id)?.classList.remove('open');

/* ════ ترجمة الأخطاء إلى العربية — مصدر واحد لكل المشروع ════
   استُدعيت سابقاً بأسماء مختلفة جزئياً بكل ملف (tradeErr بـapi.js،
   _depositErr/_withdrawErr بـaccount.js) — هذه النسخة المركزية تغطي
   حالات أوسع (رفض توقيع، محفظة غير ممولة، نوافذ منبثقة محظورة، حدود
   معدل الطلبات...) ويُفترض أن تُستخدم كخط دفاع أخير من أي دالة أخرى
   لا تعرف كيف تصنّف خطأ معيّن، بدل عرض النص الأجنبي الخام. */
function errToAr(rawMsg) {
  const msg = String(rawMsg == null ? '' : rawMsg);
  const m = msg.toLowerCase();
  if (msg) console.warn('[errToAr] رسالة أصلية:', msg);

  /* ✅ جديد — وضع "رابط الوكيل" (js/agentlink.js): لا مفتاح محفظة
     رئيسية محلياً بهذا الوضع، فأي محاولة توقيع (إيداع/سحب/تفويض وكيل
     جديد/تصدير) ترفض بهذا الاستثناء المتعمَّد — رسالة واضحة بدل
     السقوط للعبارة العامة أدناه. */
  if (m.includes('link_mode_no_master_key'))
    return 'وضع رابط الوكيل للتداول فقط — هذا الإجراء يحتاج الدخول بالمحفظة الرئيسية';

  if (m.includes('no_free_slot') || m.includes('الخانات الثلاث'))
    return 'وصلت الحد الأقصى لعدد الوكلاء (3) — احذف أحدها من "الوكلاء" أولاً';

  if (m.includes('cancelled') || m.includes('canceled') || m.includes('rejected') ||
      m.includes('denied') || m.includes('user rejected') || m.includes('4001'))
    return 'تم إلغاء العملية من المحفظة';

  if (m.includes('does not exist') || m.includes('not found') || m.includes('not activated') ||
      (m.includes('must') && m.includes('deposit')) || (m.includes('positive') && m.includes('account')))
    return 'الحساب غير مفعَّل على Hyperliquid — يجب الإيداع أولاً قبل هذا الإجراء';

  if (m.includes('insufficient') || m.includes('margin') || m.includes('balance'))
    return 'رصيد غير كافٍ لإتمام العملية';

  if (m.includes('gas') || (m.includes('fee') && m.includes('eth')))
    return 'رصيد ETH غير كافٍ لرسوم شبكة Arbitrum';

  if (m.includes('timeout') || m.includes('timed out'))
    return 'انتهت المهلة — تحقق من الاتصال وحاول مجدداً';

  if (m.includes('network') || m.includes('fetch') || m.includes('offline') || m.includes('ws-'))
    return 'انقطع الاتصال — تحقق من الشبكة وحاول مجدداً';

  if (m.includes('nonce'))
    return 'تعارض بترتيب العملية — انتظر لحظة وأعد المحاولة';

  if (m.includes('revert'))
    return 'رفضت الشبكة العملية — تحقق من الرصيد والبيانات المُدخلة';

  if (m.includes('halted') || m.includes('no fill') || (m.includes('market') && m.includes('closed')))
    return 'السوق مغلق حالياً — حاول لاحقاً';

  if (m.includes('reduce'))
    return 'لا يوجد مركز مفتوح لتنفيذ هذا الإجراء';

  if (m.includes('popup') || m.includes('blocked'))
    return 'المتصفح منع نافذة منبثقة — فعّل النوافذ المنبثقة لهذا الموقع وحاول مجدداً';

  if (m.includes('rate limit') || m.includes('too many') || m.includes('429'))
    return 'طلبات كثيرة جداً بوقت قصير — انتظر قليلاً وحاول مجدداً';

  if (m.includes('signature') || m.includes('sign'))
    return 'فشل التوقيع — تأكد من محفظتك وحاول مجدداً';

  if (!msg) return 'حدث خطأ غير متوقع — حاول مجدداً';

  return 'حدث خطأ غير متوقع — حاول مجدداً، وإن تكرر تواصل مع الدعم';
}

/* حد أدنى للمدة حسب النوع — يُطبَّق تلقائياً بلا حاجة لتذكّره بكل نداء.
   أي مدة أطول يمرّرها المستدعي صراحة تبقى كما هي (Math.max لا يخفّضها). */
const _TOAST_MIN_DUR = { err: 7000, warn: 6000 };

function toast(msg, type = 'info', dur = 3500) {
  const e = $('toast');
  if (!e) return;
  const floor = _TOAST_MIN_DUR[type] || 0;
  const finalDur = Math.max(dur, floor);
  e.textContent = msg;
  e.className = `show ${type}`;
  clearTimeout(e._t);
  e._t = setTimeout(() => e.className = '', finalDur);
}

function showLoader(t = 'جاري...') {
  $('loaderText').textContent = t;
  $('loader').classList.add('active');
}
function hideLoader() { $('loader').classList.remove('active'); }

function setTxt(id, t)    { const e = $(id); if (e) e.textContent = t; }
function setText(id, t, c) { const e = $(id); if (!e) return; e.textContent = t; if (c) e.className = c; }

function setBtnLoading(id, t = '⏳') {
  const b = $(id); if (!b) return;
  b._orig = b.innerHTML; b.disabled = true; b.innerHTML = t;
}
function resetBtn(id) {
  const b = $(id); if (!b) return;
  b.disabled = false; if (b._orig) b.innerHTML = b._orig;
}

/* ════ Corner Status — مؤشر صغير للعمليات في الخلفية (زاوية يمين) ════ */
function cornerStatus(msg, dur = 5000) {
  const e = $('cornerStatus');
  if (!e) return;
  e.textContent = msg;
  e.classList.add('show');
  clearTimeout(e._t);
  e._t = setTimeout(() => e.classList.remove('show'), dur);
}
function hideCornerStatus() {
  const e = $('cornerStatus');
  if (!e) return;
  clearTimeout(e._t);
  e.classList.remove('show');
}

/* ════ صوت خفيف عند تنفيذ الصفقة — WebAudio، بلا ملف خارجي ════ */
let _audioCtx = null;
function _getAudioCtx() {
  if (!_audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) { try { _audioCtx = new AC(); } catch {} }
  }
  return _audioCtx;
}
function playFillSound() {
  try {
    const ctx = _getAudioCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    [[880, now, 0.09], [1175, now + 0.09, 0.11]].forEach(([freq, start, dur]) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(start); osc.stop(start + dur + 0.02);
    });
  } catch {}
}

/* ════ Number Formatting ════ */
const fmt = (n, d) => (+n).toFixed(d);

function wireSz(n, szDp) {
  const f = Math.pow(10, szDp);
  const s = (Math.floor(Math.abs(+n) * f) / f).toFixed(szDp);
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}
function wirePx(n, szDp) {
  const price = Math.abs(+n); if (!price) return '0';
  const maxDp  = 6 - szDp;
  const mag    = Math.floor(Math.log10(price));
  const dp     = Math.min(maxDp, Math.max(0, 4 - mag));
  const f      = Math.pow(10, dp);
  const s      = (Math.round(price * f) / f).toFixed(dp);
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}
const wire = (n, dp) => wireSz(n, dp);

function shortCoin(c) {
  const raw = c.includes(':') ? c.split(':')[1] : c;
  return COIN_TO_SYM[raw] || raw;
}

/* ════ Cross-margin equity, EXCLUDING one position's own unrealized PnL ════ */
function crossEquityExcluding(ownPnl) {
  const b = State.balance;
  if (!b) return 0;
  return (b.total || 0) + (b.floatPnl || 0) - (ownPnl || 0);
}
