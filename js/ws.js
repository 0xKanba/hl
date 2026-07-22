/* ═══════════════════════════════════════════════════════════════
   ws.js — HL: طبقة اتصال Hyperliquid الموحّدة (WebSocket واحد فقط)

   يُطابق التوثيق الرسمي الحالي (2026):
   - Post Requests:  {method:"post",id,request:{type:"info"|"action",payload}}
                      رد: {channel:"post",data:{id,response:{type,payload}}}
   - Subscriptions:  {method:"subscribe",subscription:{...}} / "unsubscribe"
   - Heartbeats:      خادم Hyperliquid يقفل أي اتصال ساكت 60 ثانية —
                      نرسل {method:"ping"} كل ~30 ثانية، ونراقب استلام أي
                      رسالة خلال 45 ثانية (ping+مهلة) كضمانة إعادة اتصال.
   - Reconnect:       exponential backoff (1s→2s→4s...حتى 15s سقف)،
                      وإعادة إرسال كل الاشتراكات النشطة فور نجاح الاتصال
                      (الخادم لا يحتفظ بأي اشتراك عبر اتصال جديد).

   هذا الملف عام بالكامل — لا يعرف شيئاً عن أصول سيولة أو التداول.
   كل منطق التطبيق (bbo→سعر، clearinghouseState→صفقات...) يعيش في
   الملفات المستهلكة (prices.js / account.js / chart.js) عبر HL.subscribe().
═══════════════════════════════════════════════════════════════ */
'use strict';

const HL = (function () {
  const WS_URL          = 'wss://api.hyperliquid.xyz/ws';
  const PING_MS         = 30000;   // نرسل ping كل 30 ثانية (الحد الرسمي 60 ثانية سكوت)
  const SILENCE_LIMIT_MS = PING_MS + 15000; // إن مرّت 45 ثانية بلا أي رسالة واردة → إعادة اتصال قسرية
  const MAX_BACKOFF_MS  = 15000;
  const POST_TIMEOUT_MS = 10000;

  let ws = null;
  let wantConnected = false;
  let connecting    = false;
  let backoff       = 1000;
  let heartbeatTimer = null;
  let lastMsgAt     = 0;
  let postId        = 1;
  let lastOrderUpdatesKey = null; // WsOrder[] لا يحمل user — نفترض مستخدم واحد متصل بأي وقت

  const pending      = new Map(); // id -> {resolve,reject,timer,isAction}
  const subs         = new Map(); // key -> {sub, handlers:Set<fn>}
  const reconnectCbs = new Set();

  /* ════ تسلسل JSON آمن لـ BigInt (لـ oid الكبيرة في أوامر الإلغاء) ════
     نفس حيلة api.js القديمة: BigInt → وسم نصي → إزالة الاقتباس بعد التسلسل،
     فتبقى الدقة الكاملة بلا أي مرور عبر حدود Number (53-bit). */
  function stringify(obj) {
    const json = JSON.stringify(obj, (k, v) => typeof v === 'bigint' ? `:BIGINT:${v}:` : v);
    return json.replace(/":BIGINT:(\d+):"/g, '$1');
  }

  function _send(obj) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try { ws.send(stringify(obj)); return true; } catch { return false; }
  }

  function _setConnected(v) {
    if (State.wsConnected === v) return;
    State.wsConnected = v;
    if (typeof updateConnectBtn === 'function') updateConnectBtn();
  }

  /* ════ اتصال ════ */
  function connect() {
    wantConnected = true;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    if (connecting) return;
    connecting = true;
    try {
      ws = new WebSocket(WS_URL);
    } catch {
      connecting = false;
      _scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      connecting = false;
      backoff = 1000;
      lastMsgAt = Date.now();
      _setConnected(true);
      _startHeartbeat();
      _resubscribeAll();
      reconnectCbs.forEach(cb => { try { cb(); } catch (e) { console.warn('[HL onReconnect]', e); } });
    };
    ws.onmessage = (e) => {
      lastMsgAt = Date.now();
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      _route(msg);
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      connecting = false;
      _setConnected(false);
      _stopHeartbeat();
      ws = null;
      pending.forEach(p => { clearTimeout(p.timer); p.reject(new Error('ws-closed')); });
      pending.clear();
      if (wantConnected) _scheduleReconnect();
    };
  }

  function disconnect() {
    wantConnected = false;
    _stopHeartbeat();
    if (ws) { try { ws.close(); } catch {} }
    ws = null;
    _setConnected(false);
  }

  function _scheduleReconnect() {
    const delay = backoff;
    backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    setTimeout(() => { if (wantConnected) connect(); }, delay);
  }

  function isOpen() { return !!ws && ws.readyState === WebSocket.OPEN; }

  /* ════ Heartbeat ════ */
  function _startHeartbeat() {
    _stopHeartbeat();
    let lastPing = Date.now();
    heartbeatTimer = setInterval(() => {
      if (!isOpen()) return;
      const now = Date.now();
      if (now - lastPing >= PING_MS) {
        lastPing = now;
        _send({ method: 'ping' });
      }
      if (now - lastMsgAt > SILENCE_LIMIT_MS) {
        try { ws.close(); } catch {} // onclose سيتكفّل بإعادة الاتصال
      }
    }, 5000);
  }
  function _stopHeartbeat() { clearInterval(heartbeatTimer); heartbeatTimer = null; }

  /* ════ Post Requests (info أو action موقّعة) ════ */
  function post(payload, isAction) {
    return new Promise((resolve, reject) => {
      if (!isOpen()) { reject(new Error('ws-not-open')); return; }
      const id = postId++;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('ws-post-timeout')); }, POST_TIMEOUT_MS);
      pending.set(id, { resolve, reject, timer, isAction: !!isAction });
      const ok = _send({ method: 'post', id, request: { type: isAction ? 'action' : 'info', payload } });
      if (!ok) { clearTimeout(timer); pending.delete(id); reject(new Error('ws-send-failed')); }
    });
  }

  function _handlePost(msg) {
    const id = msg.data?.id;
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    clearTimeout(entry.timer);
    const resp = msg.data?.response;
    if (!resp || resp.type === 'error') {
      const detail = typeof resp?.payload === 'string' ? resp.payload : (resp?.payload ? JSON.stringify(resp.payload) : 'ws post error');
      entry.reject(new Error(detail));
      return;
    }
    if (entry.isAction) {
      entry.resolve(resp.payload); // {status, response:{type,data}} — مطابق تماماً لرد REST المباشر
    } else {
      const p = resp.payload;
      entry.resolve(p && Object.prototype.hasOwnProperty.call(p, 'data') ? p.data : p);
    }
  }

  /* ════ Subscriptions — dedup + ref-count + resubscribe-on-reconnect ════ */
  function _subKey(sub) {
    const u = (sub.user || '').toLowerCase();
    switch (sub.type) {
      case 'bbo':                        return `bbo:${sub.coin}`;
      case 'activeAssetCtx':             return `activeAssetCtx:${sub.coin}`;
      case 'candle':                     return `candle:${sub.coin}:${sub.interval}`;
      case 'allDexsClearinghouseState':  return `adchs:${u}`;
      case 'spotState':                  return `spotState:${u}`;
      case 'userFills':                  return `userFills:${u}`;
      case 'orderUpdates':               { const k = `orderUpdates:${u}`; lastOrderUpdatesKey = k; return k; }
      case 'clearinghouseState':         return `chs:${u}:${sub.dex || ''}`;
      case 'openOrders':                 return `openOrders:${u}:${sub.dex || ''}`;
      case 'l2Book':                     return `l2Book:${sub.coin}`;
      case 'trades':                     return `trades:${sub.coin}`;
      default:                           return `${sub.type}:${JSON.stringify(sub)}`;
    }
  }

  function _identify(channel, data) {
    switch (channel) {
      case 'bbo':                        return `bbo:${data.coin}`;
      case 'activeAssetCtx':
      case 'activeSpotAssetCtx':         return `activeAssetCtx:${data.coin}`;
      case 'candle':                     return `candle:${data.s}:${data.i}`;
      case 'allDexsClearinghouseState':  return `adchs:${(data.user || '').toLowerCase()}`;
      case 'spotState':                  return `spotState:${(data.user || '').toLowerCase()}`;
      case 'userFills':                  return `userFills:${(data.user || '').toLowerCase()}`;
      case 'orderUpdates':               return lastOrderUpdatesKey;
      case 'clearinghouseState':         return `chs:${(data.user || '').toLowerCase()}:${data.dex || ''}`;
      case 'openOrders':                 return `openOrders:${(data.user || '').toLowerCase()}:${data.dex || ''}`;
      case 'l2Book':                     return `l2Book:${data.coin}`;
      case 'trades':                     return Array.isArray(data) && data[0] ? `trades:${data[0].coin}` : null;
      default:                           return null;
    }
  }

  function subscribe(sub, handler) {
    const key = _subKey(sub);
    let entry = subs.get(key);
    if (!entry) {
      entry = { sub, handlers: new Set() };
      subs.set(key, entry);
      _send({ method: 'subscribe', subscription: sub }); // إن لم نكن متصلين بعد، _resubscribeAll سيرسلها لاحقاً
    }
    entry.handlers.add(handler);
    return function unsubscribe() {
      const e = subs.get(key);
      if (!e) return;
      e.handlers.delete(handler);
      if (e.handlers.size === 0) {
        subs.delete(key);
        _send({ method: 'unsubscribe', subscription: sub });
      }
    };
  }

  function _resubscribeAll() {
    subs.forEach(entry => _send({ method: 'subscribe', subscription: entry.sub }));
  }

  function _route(msg) {
    const ch = msg.channel;
    if (!ch || ch === 'pong' || ch === 'subscriptionResponse') return;
    if (ch === 'post') { _handlePost(msg); return; }
    if (ch === 'error') { console.warn('[HL] server error:', msg.data); return; }
    const key = _identify(ch, msg.data);
    if (!key) return;
    const entry = subs.get(key);
    if (entry) entry.handlers.forEach(h => { try { h(msg.data); } catch (e) { console.warn('[HL handler]', e); } });
  }

  /* يُستدعى فور نجاح كل (إعادة) اتصال — يُستخدم لإعادة مزامنة بيانات
     ليست اشتراكات نفسها (مثل frontendOpenOrders الغنية) */
  function onReconnect(cb) {
    reconnectCbs.add(cb);
    return () => reconnectCbs.delete(cb);
  }

  return { connect, disconnect, isOpen, post, subscribe, onReconnect, stringify };
})();
