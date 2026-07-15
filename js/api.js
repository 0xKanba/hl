/* ═══════════════════════════════════════
   api.js — واجهة Hyperliquid API
   ✅ WS Post Requests أولاً (عبر HL)، REST كبديل احتياطي فقط
═══════════════════════════════════════ */
'use strict';

/* ════ Info: WS post → REST fallback ════ */
async function hlInfo(body) {
  if (HL.isOpen()) {
    try { return await HL.post(body, false); }
    catch (_) { /* fall through to REST */ }
  }
  const r = await fetch(HL_API + '/info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const text = await r.text();
  return JSON.parse(text.replace(/"oid":\s*(\d{15,})/g, '"oid":"$1"'));
}

/* ════ Exchange (توقيع EIP-712 بمحفظة الوكيل) — WS post أولاً، REST كبديل ════
   نفس نمط action الموقّع سواء عبر WS أو REST، الرد بنفس الشكل تماماً
   ({status,response}) بفضل توحيد HL.post — hlExchange لا يحتاج يعرف الفرق. */
async function hlExchange(action) {
  if (!State.agent) throw new Error('محفظة التداول غير مفوّضة بعد — أعد تسجيل الدخول');
  const nonce   = Date.now();
  const encoded = MsgPack.encode(action);
  const nb      = new ArrayBuffer(8);
  new DataView(nb).setBigUint64(0, BigInt(nonce), false);
  const payload = new Uint8Array(encoded.length + 9);
  payload.set(encoded, 0);
  payload.set(new Uint8Array(nb), encoded.length);
  payload[encoded.length + 8] = 0x00;

  const connId = ethers.keccak256(payload);
  const sig    = await State.agent.signTypedData(
    { name:'Exchange', version:'1', chainId:1337, verifyingContract:'0x0000000000000000000000000000000000000000' },
    { Agent:[{ name:'source', type:'string' }, { name:'connectionId', type:'bytes32' }] },
    { source:'a', connectionId:connId }
  );
  const { r, s, v } = ethers.Signature.from(sig);
  const body = { action, nonce, signature:{ r, s, v }, vaultAddress: null };

  let data;
  if (HL.isOpen()) {
    try { data = await HL.post(body, true); }
    catch (_) { data = await _restExchange(body); }
  } else {
    data = await _restExchange(body);
  }

  if (data.status !== 'ok') {
    const err = data.response?.data?.statuses?.[0] || data.response || JSON.stringify(data).slice(0, 200);
    throw new Error(typeof err === 'string' ? err : JSON.stringify(err));
  }
  return data;
}

async function _restExchange(body) {
  const jb = HL.stringify(body);
  const res = await fetch(HL_API + '/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: jb
  });
  return JSON.parse((await res.text()).replace(/"oid":\s*(\d{15,})/g, '"oid":"$1"'));
}

/* ════ إحالة تلقائية ════ */
async function autoSetReferrer() {
  if (!State.wallet || State.referrerSet) return;
  try {
    const ref = await hlInfo({ type:'referral', user:State.wallet.address });
    if (ref.referredBy) { State.referrerSet = true; return; }
    await hlExchange({ type:'setReferrer', code:'KANBA' });
    State.referrerSet = true;
  } catch {}
}

/* ════ ترجمة أخطاء API ════ */
function tradeErr(msg) {
  const m = msg.toLowerCase();
  if (m.includes('does not exist') || m.includes('not found')) return '⚠️ الحساب غير مفعّل — أودع USDC أولاً';
  if (m.includes('insufficient')   || m.includes('margin'))    return '❌ رصيد غير كافٍ';
  if (m.includes('halted')         || m.includes('no fill'))   return '❌ السوق مغلق الآن';
  if (m.includes('reduce'))                                     return '❌ لا يوجد مركز مفتوح';
  return `❌ ${msg.slice(0, 150)}`;
}
