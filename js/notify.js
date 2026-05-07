/* ═══════════════════════════════════════
   notify.js — إشعارات المتصفح
   ✅ إشعار فوري عند ضرب TP أو SL
   ✅ يعمل حتى لو المتصفح في الخلفية
   ✅ لا خوادم — يعتمد على مقارنة الصفقات
═══════════════════════════════════════ */
'use strict';

/* ════ الحالة الداخلية ════ */
const Notify = {
  permitted: false,          /* هل المستخدم وافق على الإشعارات */
  _prevPositions: new Map(), /* coin → { szi, pnl, tp, sl } */
  _prevFillCount: 0,         /* عدد الصفقات المغلقة السابقة */
};

/* ════ طلب الإذن ════ */
async function notifyRequestPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') {
    Notify.permitted = true; return true;
  }
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  Notify.permitted = result === 'granted';
  return Notify.permitted;
}

/* ════ إرسال إشعار ════ */
function notifyFire(title, body, icon = '/icon-192x192.png') {
  if (!Notify.permitted || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, {
      body,
      icon,
      badge: '/icon-192x192.png',
      tag: 'hl-trade-' + Date.now(),   /* منع تكرار نفس الإشعار */
      requireInteraction: false,
      silent: false,
    });
    /* أغلق تلقائياً بعد 8 ثوانٍ */
    setTimeout(() => n.close(), 8000);
    /* نقر → ينتقل للتطبيق */
    n.onclick = () => { window.focus(); n.close(); };
  } catch (e) { console.warn('[Notify]', e.message); }
}

/* ════ مقارنة الصفقات — يُستدعى بعد كل pollAccount ════ */
function notifyCheckPositions() {
  const current = State.positions || [];

  /* بناء Map جديد بالصفقات الحالية */
  const nowMap = new Map();
  for (const p of current) {
    const pos  = p.position;
    const coin = pos.coin;
    const sym  = shortCoinPos(coin);
    const a    = ASSETS[sym] || { name: sym, pxDp: 2, icon: '📊' };
    const szi  = parseFloat(pos.szi || 0);
    const pnl  = parseFloat(pos.unrealizedPnl || 0);
    nowMap.set(coin, { szi, pnl, sym, a, tpsl: p.tpsl || {} });
  }

  /* ── اكتشاف صفقة مُغلقة (كانت موجودة والآن اختفت) ── */
  for (const [coin, prev] of Notify._prevPositions.entries()) {
    if (!nowMap.has(coin)) {
      /* الصفقة اختفت — هل ضُرب TP أو SL؟ */
      const { sym, a, tpsl } = prev;
      const wasLong = prev.szi > 0;

      let reason = 'إغلاق صفقة';
      let emoji  = '✅';

      /* تخمين السبب من اتجاه الـ PnL الأخير */
      if (prev.pnl > 0.01) {
        reason = 'جني الربح 🎯';
        emoji  = '🎯';
      } else if (prev.pnl < -0.01) {
        reason = 'وقف الخسارة 🛡';
        emoji  = '🛡';
      }

      const pnlSign  = prev.pnl >= 0 ? '+' : '';
      const pnlStr   = `${pnlSign}$${Math.abs(prev.pnl).toFixed(2)}`;
      const dirLabel = wasLong ? '▲ شراء' : '▼ بيع';

      notifyFire(
        `${emoji} ${a.name} — ${reason}`,
        `${dirLabel} · PnL: ${pnlStr}`,
        '/icon-192x192.png'
      );
    }
  }

  /* ── اكتشاف صفقة جديدة فُتحت ── */
  for (const [coin, now] of nowMap.entries()) {
    if (!Notify._prevPositions.has(coin)) {
      const { sym, a } = now;
      const wasLong = now.szi > 0;
      const dirLabel = wasLong ? '▲ شراء' : '▼ بيع';
      notifyFire(
        `📈 ${a.name} — صفقة جديدة`,
        `${dirLabel} · ${Math.abs(now.szi).toFixed(a.szDp || 2)} ${a.unit || ''}`,
      );
    }
  }

  /* حفظ الحالة للمقارنة التالية */
  Notify._prevPositions = nowMap;
}

/* ════ تهيئة عند الدخول ════ */
async function notifyInit() {
  const granted = await notifyRequestPermission();
  if (!granted) return;

  /* snapshot أولي للصفقات الحالية بدون إشعارات */
  const current = State.positions || [];
  for (const p of current) {
    const pos  = p.position;
    const sym  = shortCoinPos(pos.coin);
    const a    = ASSETS[sym] || { name: sym, pxDp: 2, icon: '📊' };
    Notify._prevPositions.set(pos.coin, {
      szi:  parseFloat(pos.szi || 0),
      pnl:  parseFloat(pos.unrealizedPnl || 0),
      sym, a,
      tpsl: p.tpsl || {}
    });
  }
}
