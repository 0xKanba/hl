/* ═══════════════════════════════════════
   api.js — واجهة Hyperliquid API
   ✅ WS Post Requests أولاً (عبر HL)، REST كبديل احتياطي فقط
   ✅ hlExchange يضمن وجود وكيل صالح ذاتياً (Agents.ensure) قبل التوقيع —
      بدل الفشل الفوري لو انتهت صلاحية الوكيل أو أُلغيت الموافقة الأولى؛
      يفتح نافذة تفويض عند الحاجة الفعلية فقط (أول صفقة تحتاجها).
   ✅ FIX — tradeErr(): المسار الافتراضي (لأي خطأ لا يطابق الكلمات
      المفتاحية الأربع أدناه) كان يعرض msg.slice(0,150) بالإنجليزية
      الخام مباشرة بالواجهة. الآن يمر عبر errToAr() المركزية (utils.js)
      بدل تسريب النص الأجنبي.
   ✅ FIX — autoSetReferrer(): كانت تستدعي hlExchange بلا أي شرط على
      وجود وكيل مسبق، وhlExchange نفسها تحتوي مساراً كسولاً يفتح نافذة
      "تفويض محفظة التداول" تلقائياً لو State.agent فارغ. النتيجة: على
      حساب جديد غير ممول، auth.js يحاول Agents.ensure() صراحة أولاً
      (يفشل لأن Hyperliquid يرفض approveAgent على حساب غير مموَّل) ثم
      autoSetReferrer تُعيد نفس المحاولة تلقائياً وبصمت تام (catch فارغة)
      خلال نفس اللحظة — نافذة توقيع ثانية غير متوقعة فوراً بعد فشل
      الأولى. الآن autoSetReferrer لا تحاول إطلاقاً إنشاء وكيل جديد
      بنفسها؛ فقط تضبط الإحالة لو وُجد وكيل صالح أصلاً (سواء من التخزين
      المحلي أو من نجاح تفويض حقيقي بنفس الجلسة — راجع auth.js).
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

/* ════ Exchange (توقيع EIP-712 بمحفظة الوكيل) — WS post أولاً، REST كبديل ════ */
async function hlExchange(action) {
  if (!State.agent) {
    try {
      await (typeof Agents !== 'undefined' ? Agents.ensure() : Promise.reject(new Error('NO_AGENTS_MODULE')));
    } catch (e) {
      const msg = e.message === 'CANCELLED' ? 'تم إلغاء تفويض محفظة التداول'
                : e.message === 'NO_WALLET' ? 'سجّل الدخول أولاً'
                : 'تعذّر تفويض محفظة التداول — راجع "الوكلاء" بالخيارات';
      throw new Error(msg);
    }
  }
  if (!State.agent) throw new Error('محفظة التداول غير مفوّضة — أعد المحاولة');

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

/* ════ إحالة تلقائية ════
   ✅ لا تحاول إنشاء وكيل جديد بنفسها إطلاقاً (راجع تعليق رأس الملف) —
   تكتفي بالتحقق والضبط لو وكيل صالح متوفر أصلاً. */
async function autoSetReferrer() {
  if (!State.wallet || State.referrerSet || !State.agent) return;
  try {
    const ref = await hlInfo({ type:'referral', user:State.wallet.address });
    if (ref.referredBy) { State.referrerSet = true; return; }
    await hlExchange({ type:'setReferrer', code:'KANBA' });
    State.referrerSet = true;
  } catch {}
}

/* ════ ترجمة أخطاء API الخاصة بالتداول ════ */
function tradeErr(msg) {
  const m = (msg || '').toLowerCase();
  if (m.includes('does not exist') || m.includes('not found')) return '⚠️ الحساب غير مفعّل — أودع USDC أولاً';
  if (m.includes('insufficient')   || m.includes('margin'))    return '❌ رصيد غير كافٍ';
  if (m.includes('halted')         || m.includes('no fill'))   return '❌ السوق مغلق الآن';
  if (m.includes('reduce'))                                     return '❌ لا يوجد مركز مفتوح';
  return `❌ ${typeof errToAr === 'function' ? errToAr(msg) : (msg || '').slice(0, 150)}`;
}
