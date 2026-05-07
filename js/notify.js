/* ═══════════════════════════════════════
   notify.js — إشعارات حقيقية
   ✅ ntfy.sh — يصل حتى لو المتصفح مغلق كلياً
   ✅ Notification API — احتياطي عندما التبويب مفتوح
   ✅ بدون سيرفر، بدون حساب، مجاني
═══════════════════════════════════════ */
'use strict';

/* ════════════════════════════════════
   الإعداد — غيّر NTFY_TOPIC فقط
   اختر اسم عشوائي صعب التخمين
   مثال: hl-kanba-gold-x7k2q9
════════════════════════════════════ */
const NTFY_TOPIC  = localStorage.getItem('hl_ntfy_topic') || '';
const NTFY_URL    = topic => `https://ntfy.sh/${topic}`;

const Notify = {
  permitted:    false,
  _prevMap:     new Map(),
  _initialized: false,
  _ntfyEnabled: false,
};

/* ════ طلب إذن المتصفح ════ */
async function notifyRequestPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted')  { Notify.permitted = true; return true; }
  if (Notification.permission === 'denied')   return false;
  const r = await Notification.requestPermission();
  Notify.permitted = (r === 'granted');
  return Notify.permitted;
}

/* ════ إشعار محلي (تبويب مفتوح) ════ */
function _fireLocal(title, body) {
  if (!Notify.permitted || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, {
      body, icon: '/icon-192x192.png',
      tag: 'hl-' + Date.now(),
      requireInteraction: false,
    });
    setTimeout(() => n.close(), 9000);
    n.onclick = () => { window.focus(); n.close(); };
  } catch {}
}

/* ════ إشعار ntfy (متصفح مغلق / هاتف) ════ */
async function _fireNtfy(title, body) {
  const topic = localStorage.getItem('hl_ntfy_topic');
  if (!topic) return;
  try {
    await fetch(NTFY_URL(topic), {
      method: 'POST',
      headers: {
        'Title':    encodeURIComponent(title),
        'Priority': 'high',
        'Tags':     'chart_with_upwards_trend',
      },
      body: body,
    });
  } catch (e) { console.warn('[ntfy]', e.message); }
}

/* ════ إرسال للقناتين ════ */
function _fire(title, body) {
  _fireLocal(title, body);   /* فوري — إذا التبويب مفتوح */
  _fireNtfy(title, body);    /* ntfy  — يصل حتى لو المتصفح مغلق */
}

/* ════ بناء Map الصفقات ════ */
function _buildMap() {
  const m = new Map();
  for (const p of (State.positions || [])) {
    const pos = p.position;
    m.set(pos.coin, {
      szi:   parseFloat(pos.szi || 0),
      pnl:   parseFloat(pos.unrealizedPnl || 0),
      hasTP: !!(p.tpsl && p.tpsl.tp),
      hasSL: !!(p.tpsl && p.tpsl.sl),
      sym:   shortCoinPos(pos.coin),
    });
  }
  return m;
}

/* ════ فحص الصفقات — بعد كل pollAccount ════ */
function notifyCheckPositions() {
  const nowMap = _buildMap();

  /* أول استدعاء: snapshot بدون إشعارات */
  if (!Notify._initialized) {
    Notify._prevMap     = nowMap;
    Notify._initialized = true;
    return;
  }

  for (const [coin, prev] of Notify._prevMap.entries()) {
    if (nowMap.has(coin)) continue;   /* لا تزال مفتوحة */

    const a    = ASSETS[prev.sym] || { name: prev.sym, icon: '📊' };
    const dir  = prev.szi > 0 ? '▲ شراء' : '▼ بيع';
    const pnl  = prev.pnl;
    const pStr = (pnl >= 0 ? '+' : '') + '$' + Math.abs(pnl).toFixed(2);

    let title, body;
    if (prev.hasTP && pnl > 0.01) {
      title = `🎯 جني الربح — ${a.name}`;
      body  = `${dir} · ربح ${pStr}`;
    } else if (prev.hasSL && pnl < -0.01) {
      title = `🛡 وقف الخسارة — ${a.name}`;
      body  = `${dir} · خسارة ${pStr}`;
    } else if (pnl > 0.01) {
      title = `✅ صفقة مُغلقة بربح — ${a.name}`;
      body  = `${dir} · ${pStr}`;
    } else {
      title = `📋 صفقة مُغلقة — ${a.name}`;
      body  = `${dir} · ${pStr}`;
    }
    _fire(title, body);
  }

  Notify._prevMap = nowMap;
}

/* ════ تهيئة ════ */
async function notifyInit() {
  await notifyRequestPermission();
}

/* ════ إعداد ntfy من الواجهة ════ */
function notifySetTopic(topic) {
  if (!topic || topic.length < 8) return false;
  localStorage.setItem('hl_ntfy_topic', topic.trim());
  return true;
}

function notifyGetTopic() {
  return localStorage.getItem('hl_ntfy_topic') || '';
}

/* ════ اختبار الإشعار ════ */
async function notifyTest() {
  await _fireNtfy('🧪 اختبار سيولة', 'الإشعارات تعمل بشكل صحيح ✅');
  _fireLocal('🧪 اختبار سيولة', 'الإشعارات تعمل بشكل صحيح ✅');
}
