/* ═══════════════════════════════════════
   pin.js — نظام قفل PIN
═══════════════════════════════════════ */
'use strict';

/* ════ قفل / فتح ════ */
function lockApp(isManual = false) {
  const pin = localStorage.getItem(PIN_KEY);
  if (!pin) { if (isManual) openModal('modalSetPIN'); return; }
  State.isLocked = true;
  localStorage.setItem(LOCKED_KEY, 'true');
  State.currentPinInput = '';
  updatePinDots();
  openModal('modalPIN');
  $('pinCancel').classList.add('hidden');
}

function unlockApp() {
  State.isLocked = false;
  localStorage.setItem(LOCKED_KEY, 'false');
  localStorage.setItem(LAST_PIN_KEY, Date.now().toString());
  State.lastPinTime = Date.now();
  State.currentPinInput = '';
  closeModal('modalPIN');
  $('pinCancel').classList.remove('hidden');
  /* ✅ جديد — يزيل خاصية الإخفاء المسبق (data-boot-lock) التي يضبطها
     سكربت <head> بـindex.html قبل أول رسم لمنع أي وميض لواجهة التداول
     خلف شاشة القفل عند الإقلاع. إزالة آمنة دائماً حتى لو لم تكن مضبوطة
     أصلاً (removeAttribute على خاصية غير موجودة لا يفعل شيئاً). راجع
     تعليق ذلك السكربت + css/base.css للتفاصيل الكاملة. */
  document.documentElement.removeAttribute('data-boot-lock');
}

/* ════ requirePin — يطلب PIN قبل تنفيذ callback ════ */
function requirePin(cb) {
  const pin = localStorage.getItem(PIN_KEY);
  if (!pin) { cb(); return; }
  if (State.isLocked) {
    State.pinCallback = cb;
    State.currentPinInput = '';
    updatePinDots();
    openModal('modalPIN');
    $('pinCancel').classList.remove('hidden');
  } else {
    cb();
  }
}

/* ════ إدخال PIN ════ */
function appendPin(d) {
  if (State.currentPinInput.length >= 4) return;
  State.currentPinInput += d;
  updatePinDots();
  if (State.currentPinInput.length === 4) setTimeout(handleVerifyPin, 150);
}

function backspacePin() {
  if (!State.currentPinInput.length) return;
  State.currentPinInput = State.currentPinInput.slice(0, -1);
  updatePinDots();
}

function updatePinDots() {
  const dots = $('pinDots')?.querySelectorAll('.dot');
  if (!dots) return;
  dots.forEach((d, i) => d.classList.toggle('filled', i < State.currentPinInput.length));
}

function handleVerifyPin() {
  const input = State.currentPinInput;
  const saved = localStorage.getItem(PIN_KEY);
  if (input === saved) {
    State.lastPinTime = Date.now();
    localStorage.setItem(LAST_PIN_KEY, State.lastPinTime.toString());
    unlockApp();
    if (State.pinCallback) {
      const cb = State.pinCallback;
      State.pinCallback = null;
      cb();
    }
  } else {
    toast('رمز PIN غير صحيح', 'err');
    const d = $('pinDots');
    if (d) { d.classList.add('shake'); setTimeout(() => d.classList.remove('shake'), 400); }
    State.currentPinInput = '';
    updatePinDots();
  }
}

/* ════ تعيين PIN جديد ════ */
function appendSetPin(d) {
  if (State.currentSetPinInput.length >= 4) return;
  State.currentSetPinInput += d;
  updateSetPinDots();
  if (State.currentSetPinInput.length === 4) setTimeout(handleSetPin, 150);
}

function backspaceSetPin() {
  if (!State.currentSetPinInput.length) return;
  State.currentSetPinInput = State.currentSetPinInput.slice(0, -1);
  updateSetPinDots();
}

function updateSetPinDots() {
  const dots = $('setPinDots')?.querySelectorAll('.dot');
  if (!dots) return;
  dots.forEach((d, i) => d.classList.toggle('filled', i < State.currentSetPinInput.length));
}

function handleSetPin() {
  const pin = State.currentSetPinInput;
  if (!pin || pin.length < 4) return toast('يجب أن يكون الرمز 4 أرقام', 'err');
  localStorage.setItem(PIN_KEY, pin);
  State.lastPinTime = Date.now();
  localStorage.setItem(LAST_PIN_KEY, State.lastPinTime.toString());
  State.currentSetPinInput = '';
  updateSetPinDots();
  closeModal('modalSetPIN');
  unlockApp();
  toast('تم تعيين رمز PIN بنجاح ✅', 'ok');
  if (State.pinCallback) {
    const cb = State.pinCallback;
    State.pinCallback = null;
    cb();
  }
}
