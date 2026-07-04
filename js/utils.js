/* ═══════════════════════════════════════
   utils.js — أدوات مساعدة عامة
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

function toast(msg, type = 'info', dur = 3500) {
  const e = $('toast');
  if (!e) return;
  e.textContent = msg;
  e.className = `show ${type}`;
  clearTimeout(e._t);
  e._t = setTimeout(() => e.className = '', dur);
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
function isSoundEnabled() { return localStorage.getItem(SOUND_KEY) !== 'off'; }
function toggleSound() {
  const wasOn = isSoundEnabled();
  localStorage.setItem(SOUND_KEY, wasOn ? 'off' : 'on');
  toast(wasOn ? '🔇 تم إيقاف صوت التنبيهات' : '🔊 تم تفعيل صوت التنبيهات', 'info');
  updateSoundOptionLabel();
}
function updateSoundOptionLabel() {
  const btn = $('optSound');
  if (btn) btn.textContent = isSoundEnabled() ? '🔊 صوت التنبيهات' : '🔇 صوت التنبيهات (متوقف)';
}
function playFillSound() {
  if (!isSoundEnabled()) return;
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
