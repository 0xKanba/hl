/* ═══════════════════════════════════════
   api.js — واجهة Hyperliquid API
═══════════════════════════════════════ */
'use strict';

/* ════ REST Info ════ */
async function hlInfo(body) {
  const r = await fetch(HL_API + '/info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const text = await r.text();
  return JSON.parse(text.replace(/"oid":\s*(\d{15,})/g, '"oid":"$1"'));
}

/* ════ REST Exchange (توقيع EIP-712) ════ */
async function hlExchange(action) {
  if (!State.wallet) throw new Error('لا توجد محفظة');
  const nonce   = Date.now();
  const encoded = MsgPack.encode(action);
  const nb      = new ArrayBuffer(8);
  new DataView(nb).setBigUint64(0, BigInt(nonce), false);
  const payload = new Uint8Array(encoded.length + 9);
  payload.set(encoded, 0);
  payload.set(new Uint8Array(nb), encoded.length);
  payload[encoded.length + 8] = 0x00;

  const connId = ethers.keccak256(payload);
  const sig    = await State.wallet.signTypedData(
    { name:'Exchange', version:'1', chainId:1337, verifyingContract:'0x0000000000000000000000000000000000000000' },
    { Agent:[{ name:'source', type:'string' }, { name:'connectionId', type:'bytes32' }] },
    { source:'a', connectionId:connId }
  );
  const { r, s, v } = ethers.Signature.from(sig);

  const jb  = JSON.stringify(
    { action, nonce, signature:{ r,s,v }, vaultAddress:null },
    (k, val) => typeof val === 'bigint' ? `:BIGINT:${val}:` : val
  );
  const res  = await fetch(HL_API + '/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: jb.replace(/":BIGINT:(\d+):"/g, '$1')
  });
  const data = JSON.parse(
    (await res.text()).replace(/"oid":\s*(\d{15,})/g, '"oid":"$1"')
  );
  if (data.status !== 'ok') {
    const err = data.response?.data?.statuses?.[0] || data.response || JSON.stringify(data).slice(0, 200);
    throw new Error(typeof err === 'string' ? err : JSON.stringify(err));
  }
  return data;
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
