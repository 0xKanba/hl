/* ═══════════════════════════════════════════════════════════════
   agents.js — إدارة محافظ الوكلاء (Hyperliquid Agent/API Wallets) — v2.1

   ⚠️ FIX جذري (هذا هو سبب "حدث خطأ غير متوقع — حاول مجدداً" فوراً عند
   محاولة إنشاء وكيل): _confirmApproval بالإصدار السابق (وبالنسخة
   الأصلية قبله أيضاً) كانت تعتمد على مودال ثابت بـindex.html
   (modalAgentApproval/agentAddrPreview/agentApprovalConfirm/
   agentApprovalCancel) غير موجود فعلياً بملف index.html المُستلَم —
   فـ`$('agentApprovalConfirm').onclick = ...` كان يرمي
   `TypeError: Cannot set properties of null` فوراً (العنصر null).
   هذا الخطأ لا يطابق أي كلمة إنجليزية بـerrToAr فيسقط لعبارتها
   العامة الافتراضية بالضبط — من هنا الرسالة الغامضة.
   الحل: نافذة التفويض أصبحت ذاتية الحقن بالكامل (#agApproveModal)،
   بلا أي اعتماد خارجي على index.html — تماماً كبقية نوافذ هذا الملف
   (#agModal/#agConfirm/#agReveal). تعمل الآن سواء استُدعيت من داخل
   نافذة "الوكلاء" المفتوحة، أو تلقائياً من auth.js عند أول اتصال
   بمحفظة مموَّلة (السياق الذي لا تكون فيه نافذة الوكلاء مفتوحة أصلاً).

   ✅ تحصين شامل — كل نداء DOM بهذا الملف الآن يتحقق من وجود العنصر
   فعلياً قبل استخدامه (بدل الاعتماد على أنه "يجب أن يكون موجوداً" لأنه
   ذاتي الحقن) — أي خطأ مستقبلي بترتيب الحقن يُسجَّل بوضوح بالـconsole
   ويُعرض كرسالة عربية مفهومة، لا ينهار صامتاً كـ"خطأ غير متوقع".

   ✅ جديد — تصدير/استيراد وكيل بطريقتين متكافئتين لكل اتجاه:
      تصدير: 💾 تنزيل ملف .json  +  📋 نسخ كنص (للصقه بواتساب/تيليجرام مباشرة)
      استيراد: 📥 من ملف         +  📋 لصق نص JSON (textarea)

   ✅ رسائل الأخطاء الآن كاملة عربية دائماً — errToAr (utils.js) صار
   يمرّر أي رسالة عربية جاهزة كما هي بدل استبدالها بالعبارة العامة
   (راجع utils.js لهذا الإصلاح المصاحب)، فرسائل مثل "وصلت الحد الأقصى
   لعدد الوكلاء" تظهر حرفياً بدل "خطأ غير متوقع".

   ✅ FIX جوهري سابق (باقٍ كما هو — تاريخ الانتهاء + تعدد الأجهزة):
      كل approveAgent يُرفق "valid_until <ms>" بحقل agentName (موثّق
      رسمياً — Hyperliquid Exchange Endpoint وDwellir API Docs يؤكدان
      الصيغة والحد الأقصى 180 يوماً حرفياً)، وكل عرض/فحص صلاحية يمر
      عبر type:"extraAgents" (نفس مصدر بيانات لوحة Hyperliquid تماماً).
      أسماء مرقّمة market-liq-1/2/3 بدل اسم ثابت مشترك — لا تصادم بين
      الأجهزة، ولا "تدوير" — إنشاء/حذف صريحان فقط.

   ✅ إعادة تلوين (2026-08) — نافذة "الوكلاء" بالكامل (بطاقات، حالات
      نشط/تحذير/منتهي، أزرار التفعيل/الحذف/التصدير، صندوق المفتاح
      الخاص) استُبدلت من البرتقالي/الأخضر/الأحمر/الذهبي القديم إلى
      اللوحة الجديدة: بنفسجي (#8b5cf6) للتمييز والأزرار الأساسية،
      success (#10b981) لحالة "نشط"، warning (#f59e0b) لحالة "ينتهي
      قريباً"، danger (#ef4444) لحالة "منتهي/غير موجود" وأزرار الحذف.
═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const AGENT_TTL_MS        = 180 * 24 * 3600 * 1000; // الحد الأقصى الموثّق رسمياً لـvalid_until
  const AGENT_KEY_PREFIX    = 'hl_agents_';     // v2: مصفوفة وكلاء لكل محفظة
  const AGENT_KEY_PREFIX_V1 = 'hl_agent_';      // v1: كائن وكيل مفرد (يُرحَّل تلقائياً)
  const PREF_KEY_PREFIX     = 'hl_agent_pref_'; // عنوان الوكيل "النشط" المفضَّل لهذا الجهاز
  const BASE_NAME           = 'market-liq';
  const MAX_NAMED_AGENTS    = 3; // حد Hyperliquid الرسمي للوكلاء المُسمّين لكل حساب

  let _ensurePromise = null;
  let _tickTimer     = null;

  /* ════ خطأ برسالة عربية جاهزة للعرض المباشر (لا تحتاج ترجمة) ════ */
  function _uerr(msg) { return new Error(msg); }

  /* ════ تخزين محلي (v2 — مصفوفة) ════ */
  function _key(addr)     { return AGENT_KEY_PREFIX + addr.toLowerCase(); }
  function _prefKey(addr) { return PREF_KEY_PREFIX + addr.toLowerCase(); }

  function _migrateV1(addr) {
    const oldKey = AGENT_KEY_PREFIX_V1 + addr.toLowerCase();
    const raw = localStorage.getItem(oldKey);
    if (!raw) return;
    try {
      const m = JSON.parse(raw);
      if (m && m.pk && m.agentAddress) {
        const cur = JSON.parse(localStorage.getItem(_key(addr)) || '[]');
        if (!cur.some(a => a.agentAddress.toLowerCase() === m.agentAddress.toLowerCase())) {
          cur.push({
            pk: m.pk, agentAddress: m.agentAddress, agentName: m.agentName || 'suyula-agent',
            createdAt: m.createdAt || Date.now(), validUntil: null, serverMissing: false,
          });
          localStorage.setItem(_key(addr), JSON.stringify(cur));
        }
      }
    } catch {}
    localStorage.removeItem(oldKey);
  }

  function _loadAll(addr) {
    _migrateV1(addr);
    try { return JSON.parse(localStorage.getItem(_key(addr)) || '[]'); } catch { return []; }
  }
  function _saveAll(addr, list) { try { localStorage.setItem(_key(addr), JSON.stringify(list)); } catch {} }

  function _getPref(addr)        { return localStorage.getItem(_prefKey(addr)); }
  function _setPref(addr, aAddr) { try { localStorage.setItem(_prefKey(addr), aAddr); } catch {} }

  function _isValid(rec) {
    if (!rec || !rec.pk || rec.serverMissing) return false;
    if (!rec.validUntil) return true; // لا مزامنة خادم بعد — تفاؤل مؤقت حتى أول extraAgents
    return Date.now() < rec.validUntil;
  }

  /* ════ extraAgents — مصدر الحقيقة الوحيد (موثّق رسمياً) ════ */
  async function _fetchExtraAgents(addr) {
    try {
      const r = await hlInfo({ type: 'extraAgents', user: addr });
      return Array.isArray(r) ? r : [];
    } catch { return null; } // null = فشل شبكة — لا نفترض فراغاً أبداً
  }

  function _reconcile(addr, local, serverList) {
    if (!Array.isArray(serverList)) return local; // فشل شبكة — لا تغيير
    const byAddr = {};
    serverList.forEach(s => { byAddr[(s.address || '').toLowerCase()] = s; });
    const merged = local.map(rec => {
      const srv = byAddr[rec.agentAddress.toLowerCase()];
      if (!srv) return { ...rec, serverMissing: true };
      return { ...rec, validUntil: srv.validUntil || rec.validUntil, serverMissing: false };
    });
    _saveAll(addr, merged);
    return merged;
  }

  function _pickFreeSlotName(serverList, localList) {
    const taken = new Set((serverList || []).map(a => a.name));
    for (let n = 1; n <= MAX_NAMED_AGENTS; n++) {
      const nm = `${BASE_NAME}-${n}`;
      if (localList.some(a => a.agentName === nm)) continue;
      if (!taken.has(nm)) return nm;
    }
    return null;
  }

  function _info(rec) {
    if (!rec) return null;
    const expiresAt = rec.validUntil || (rec.createdAt + AGENT_TTL_MS);
    return {
      name: rec.agentName, address: rec.agentAddress, createdAt: rec.createdAt,
      expiresAt, daysLeft: Math.max(0, Math.ceil((expiresAt - Date.now()) / 86400000)),
      valid: _isValid(rec), serverMissing: !!rec.serverMissing, estimated: !rec.validUntil,
    };
  }

  function getInfo(address) {
    const addr = address || State.wallet?.address;
    if (!addr) return null;
    const all = _loadAll(addr);
    const pref = _getPref(addr);
    const best = all.find(a => a.agentAddress === pref && _isValid(a)) || all.find(_isValid) || all[0];
    return _info(best);
  }

  function list(address) {
    const addr = address || State.wallet?.address;
    if (!addr) return [];
    return _loadAll(addr).map(_info);
  }

  /* ════ نافذة التفويض — ذاتية الحقن بالكامل (راجع تعليق رأس الملف) ════ */
  function _confirmApproval(agentAddress, slotName) {
    return new Promise((resolve, reject) => {
      const box   = document.getElementById('agApproveModal');
      const okBtn = document.getElementById('agApproveConfirm');
      const noBtn = document.getElementById('agApproveCancel');
      if (!box || !okBtn || !noBtn) {
        console.error('[agents.js] عناصر نافذة التفويض الذاتية غير موجودة — تحقق من ترتيب تحميل agents.js');
        reject(_uerr('تعذّر فتح نافذة التفويض — أعد تحميل الصفحة وحاول مجدداً'));
        return;
      }
      setTxt('agApprovePreview', `${slotName} — ${agentAddress}`);
      box.classList.add('open');
      okBtn.onclick = () => { box.classList.remove('open'); resolve(); };
      noBtn.onclick = () => { box.classList.remove('open'); reject(new Error('CANCELLED')); };
    });
  }

  async function _createAndApprove(addr, slotName) {
    const agent = ethers.Wallet.createRandom();
    await _confirmApproval(agent.address, slotName);

    showLoader('بانتظار توقيعك...');
    try {
      const nonce      = Date.now();
      const validUntil = nonce + AGENT_TTL_MS;
      const nameOnChain = `${slotName} valid_until ${validUntil}`; // موثّق رسمياً
      const action = {
        type: 'approveAgent', hyperliquidChain: 'Mainnet', signatureChainId: '0xa4b1',
        agentAddress: agent.address, agentName: nameOnChain, nonce,
      };
      const sig = await State.wallet.signTypedData(
        { name: 'HyperliquidSignTransaction', version: '1', chainId: 42161,
          verifyingContract: '0x0000000000000000000000000000000000000000' },
        { 'HyperliquidTransaction:ApproveAgent': [
            { name: 'hyperliquidChain', type: 'string' },
            { name: 'agentAddress',     type: 'address' },
            { name: 'agentName',        type: 'string' },
            { name: 'nonce',            type: 'uint64' },
        ]},
        { hyperliquidChain: 'Mainnet', agentAddress: agent.address, agentName: nameOnChain, nonce }
      );
      const { r, s, v } = ethers.Signature.from(sig);
      const body = { action, nonce, signature: { r, s, v } };
      const d = HL.isOpen() ? await HL.post(body, true).catch(() => _restExchange(body)) : await _restExchange(body);
      if (d.status !== 'ok') throw new Error(typeof d.response === 'string' ? d.response : JSON.stringify(d));

      const rec = { pk: agent.privateKey, agentAddress: agent.address, agentName: slotName, createdAt: nonce, validUntil, serverMissing: false };
      const all = _loadAll(addr); all.push(rec); _saveAll(addr, all);
      _setPref(addr, agent.address);
      State.agent = agent;
      _refreshUI();
      _showReveal(rec);
      return agent;
    } finally { hideLoader(); }
  }

  function ensure(forceNew) {
    if (!State.wallet) return Promise.reject(new Error('NO_WALLET'));
    if (_ensurePromise) return _ensurePromise;
    _ensurePromise = _ensureImpl(forceNew).finally(() => { _ensurePromise = null; });
    return _ensurePromise;
  }

  async function _ensureImpl(forceNew) {
    const addr = State.wallet.address;
    let local = _loadAll(addr);

    if (!forceNew) {
      const pref = _getPref(addr);
      const usable = local.find(a => a.agentAddress === pref && _isValid(a)) || local.find(_isValid);
      if (usable) {
        _fetchExtraAgents(addr).then(sl => _reconcile(addr, _loadAll(addr), sl)); // مزامنة صامتة بالخلفية
        try { State.agent = new ethers.Wallet(usable.pk); return State.agent; } catch {}
      }
    }

    const serverList = await _fetchExtraAgents(addr);
    local = _reconcile(addr, local, serverList);

    if (!forceNew) {
      const stillValid = local.find(_isValid);
      if (stillValid) { try { State.agent = new ethers.Wallet(stillValid.pk); return State.agent; } catch {} }
    }

    const slotName = _pickFreeSlotName(serverList, local);
    if (!slotName) throw _uerr('وصلت الحد الأقصى لعدد الوكلاء (3) — احذف وكيلاً أولاً من "الوكلاء" بالخيارات');
    return _createAndApprove(addr, slotName);
  }

  function revokeOne(address, agentAddress) {
    const addr = address || State.wallet?.address;
    if (!addr) return;
    _saveAll(addr, _loadAll(addr).filter(a => a.agentAddress.toLowerCase() !== agentAddress.toLowerCase()));
    if (_getPref(addr) === agentAddress) localStorage.removeItem(_prefKey(addr));
    if (State.agent?.address?.toLowerCase() === agentAddress.toLowerCase()) State.agent = null;
    _refreshUI();
  }

  function revoke(address) {
    const addr = address || State.wallet?.address;
    if (!addr) return;
    _saveAll(addr, []);
    localStorage.removeItem(_prefKey(addr));
    if (State.wallet?.address?.toLowerCase() === addr.toLowerCase()) State.agent = null;
    _refreshUI();
  }

  function clearSession() { State.agent = null; }

  function setPreferred(agentAddress) {
    if (!State.wallet) return;
    _setPref(State.wallet.address, agentAddress);
    const rec = _loadAll(State.wallet.address).find(a => a.agentAddress === agentAddress);
    if (rec && _isValid(rec)) { try { State.agent = new ethers.Wallet(rec.pk); } catch {} }
    _refreshUI();
  }

  /* ════ نقل وكيل بين الأجهزة — ملف .json أو نص خام (نسخ/لصق) ════ */
  function _exportPayload(rec) {
    return {
      mainAddress: State.wallet.address, agentName: rec.agentName, agentAddress: rec.agentAddress,
      pk: rec.pk, createdAt: rec.createdAt, validUntil: rec.validUntil,
    };
  }

  function exportJSON(agentAddress) {
    if (!State.wallet) return;
    const rec = _loadAll(State.wallet.address).find(a => a.agentAddress === agentAddress);
    if (!rec) return;
    const blob = new Blob([JSON.stringify(_exportPayload(rec), null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `${rec.agentName}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function copyJSONText(agentAddress) {
    if (!State.wallet) return;
    const rec = _loadAll(State.wallet.address).find(a => a.agentAddress === agentAddress);
    if (!rec) return;
    _copy(JSON.stringify(_exportPayload(rec)));
  }

  function importJSON(obj) {
    if (!State.wallet) return { ok: false, msg: 'سجّل الدخول أولاً' };
    if (!obj || !obj.pk || !obj.agentAddress) return { ok: false, msg: 'الملف/النص لا يحتوي بيانات وكيل صالحة' };
    if (!/^0x[0-9a-fA-F]{64}$/.test(obj.pk)) return { ok: false, msg: 'مفتاح الوكيل بالملف غير صالح' };
    if (!/^0x[0-9a-fA-F]{40}$/.test(obj.agentAddress)) return { ok: false, msg: 'عنوان الوكيل بالملف غير صالح' };
    const addr = State.wallet.address;
    const all  = _loadAll(addr);
    if (all.some(a => a.agentAddress.toLowerCase() === obj.agentAddress.toLowerCase()))
      return { ok: false, msg: 'هذا الوكيل مستورَد أصلاً بهذا الجهاز' };
    if (all.length >= MAX_NAMED_AGENTS) return { ok: false, msg: 'الحد الأقصى 3 وكلاء لكل محفظة — احذف أحدها أولاً' };
    const mismatch = obj.mainAddress && obj.mainAddress.toLowerCase() !== addr.toLowerCase();
    all.push({
      pk: obj.pk, agentAddress: obj.agentAddress, agentName: obj.agentName || `${BASE_NAME}-imported`,
      createdAt: obj.createdAt || Date.now(), validUntil: obj.validUntil || null, serverMissing: false,
    });
    _saveAll(addr, all);
    _refreshUI();
    return { ok: true, msg: mismatch ? '✅ استُورد — تنبيه: عنوان المحفظة بالملف مختلف عن المتصلة الآن' : '✅ تم الاستيراد بنجاح' };
  }

  function buildLink(agentAddress, target) {
    if (!State.wallet || typeof AgentLink === 'undefined') return null;
    const rec = _loadAll(State.wallet.address).find(a => a.agentAddress === agentAddress);
    return rec ? AgentLink.build(State.wallet.address, rec.pk, target) : null;
  }

  /* ═══════════════════════ الواجهة (CSS/HTML) ═══════════════════════ */

  document.head.insertAdjacentHTML('beforeend', `<style>
#agModal{position:fixed;inset:0;z-index:500;background:rgba(0,0,0,.75);display:none;
  align-items:center;justify-content:center;padding:16px;font-family:'Cairo',sans-serif;
  direction:rtl;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);}
#agModal.open{display:flex;animation:agFade .18s ease;}
@keyframes agFade{from{opacity:0}to{opacity:1}}
.ag-card{background:var(--bg-app,#0f172a);border:1px solid rgba(255,255,255,.1);border-radius:20px;
  width:min(94vw,440px);max-height:88vh;overflow-y:auto;box-shadow:0 24px 70px rgba(0,0,0,.6);
  animation:agPop .2s cubic-bezier(.34,1.56,.64,1);position:relative;}
@keyframes agPop{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:scale(1)}}
.ag-hdr{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;
  border-bottom:1px solid rgba(255,255,255,.08);background:var(--bg-card,#1e293b);
  position:sticky;top:0;z-index:2;border-radius:20px 20px 0 0;}
.ag-title{font-size:16px;font-weight:900;color:var(--text-primary,#f1f5f9);display:flex;align-items:center;gap:7px;}
.ag-close{width:30px;height:30px;border-radius:50%;border:1.5px solid rgba(255,255,255,.14);
  background:rgba(255,255,255,.06);color:var(--text-primary,#f1f5f9);font-size:15px;
  display:flex;align-items:center;justify-content:center;cursor:pointer;}
.ag-body{padding:16px 18px 22px;}
.ag-sec-title{font-size:11px;font-weight:800;color:#94a3b8;letter-spacing:.6px;
  text-transform:uppercase;margin:16px 0 8px;}
.ag-sec-title:first-child{margin-top:0;}
.ag-card-box{background:var(--bg-card,#1e293b);border:1px solid rgba(255,255,255,.08);
  border-radius:14px;padding:14px;margin-bottom:10px;transition:border-color .15s;}
.ag-card-box.ag-pref{border-color:#8b5cf6;box-shadow:0 0 0 1px rgba(139,92,246,.3);}
.ag-row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;
  border-bottom:1px solid rgba(255,255,255,.06);font-size:13px;gap:10px;}
.ag-row:last-child{border-bottom:none;}
.ag-row-k{color:#94a3b8;font-weight:700;flex-shrink:0;}
.ag-row-v{font-family:'IBM Plex Mono',monospace;font-weight:800;color:var(--text-primary,#f1f5f9);
  direction:ltr;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ag-status{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:800;
  padding:3px 10px;border-radius:99px;white-space:nowrap;}
.ag-status.ok{background:rgba(16,185,129,.16);color:#10b981;}
.ag-status.warn{background:rgba(245,158,11,.16);color:#f59e0b;}
.ag-status.bad{background:rgba(239,68,68,.16);color:#ef4444;}
.ag-addr-box{display:flex;align-items:center;gap:8px;background:rgba(0,0,0,.22);
  border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:9px 11px;margin-top:8px;}
.ag-addr-txt{font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--text-primary,#f1f5f9);
  direction:ltr;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ag-pk-box{background:rgba(0,0,0,.22);border:1px solid rgba(255,255,255,.08);border-radius:10px;
  padding:10px 12px;margin-bottom:10px;display:flex;align-items:flex-start;gap:8px;}
.ag-pk-txt{font-family:'IBM Plex Mono',monospace;font-size:11.5px;line-height:1.6;word-break:break-all;
  direction:ltr;text-align:left;flex:1;user-select:text;-webkit-user-select:text;color:var(--text-primary,#f1f5f9);}
.ag-copy-btn{flex-shrink:0;background:rgba(139,92,246,.14);border:1.5px solid rgba(139,92,246,.35);
  color:#8b5cf6;border-radius:8px;width:30px;height:30px;font-size:13px;cursor:pointer;
  display:flex;align-items:center;justify-content:center;}
.ag-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;}
.ag-actions-4{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px;}
.ag-btn{padding:11px;border-radius:12px;font-size:12.5px;font-weight:800;cursor:pointer;
  border:1.5px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);
  color:var(--text-primary,#f1f5f9);display:flex;align-items:center;justify-content:center;gap:5px;
  transition:filter .12s,transform .1s;font-family:'Cairo',sans-serif;}
.ag-actions-4 .ag-btn{padding:9px 4px;font-size:11.5px;}
.ag-btn:active{transform:scale(.96);}
.ag-btn.rot{border-color:rgba(139,92,246,.4);background:rgba(139,92,246,.1);color:#8b5cf6;}
.ag-btn.del{border-color:rgba(239,68,68,.4);background:rgba(239,68,68,.1);color:#ef4444;}
.ag-btn.wide{grid-column:1/-1;}
.ag-note{font-size:11.5px;line-height:1.7;color:#94a3b8;background:rgba(139,92,246,.06);
  border:1px solid rgba(139,92,246,.18);border-radius:10px;padding:10px 12px;margin-top:10px;}
.ag-note b{color:#8b5cf6;}
.ag-empty{text-align:center;padding:26px 10px;color:#94a3b8;font-size:13px;font-weight:700;}
.ag-empty .ag-btn{margin-top:14px;max-width:230px;margin-inline:auto;}
.ag-paste-area{width:100%;background:rgba(0,0,0,.22);border:1px solid rgba(255,255,255,.12);
  border-radius:10px;padding:10px;font-family:'IBM Plex Mono',monospace;font-size:11px;
  color:var(--text-primary,#f1f5f9);direction:ltr;text-align:left;resize:vertical;min-height:64px;}
.ag-confirm{position:absolute;inset:0;background:rgba(0,0,0,.6);display:none;
  align-items:center;justify-content:center;padding:20px;border-radius:20px;z-index:3;}
.ag-confirm.open{display:flex;}
.ag-confirm-card{background:var(--bg-card,#1e293b);border:1px solid rgba(255,255,255,.12);
  border-radius:16px;padding:18px;width:100%;max-width:320px;text-align:center;}
.ag-confirm-txt{font-size:13px;color:var(--text-primary,#f1f5f9);line-height:1.7;
  margin-bottom:14px;font-weight:700;}
.ag-confirm-btns{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.ag-approve-ov{position:fixed;inset:0;z-index:600;background:rgba(0,0,0,.75);display:none;
  align-items:center;justify-content:center;padding:16px;font-family:'Cairo',sans-serif;
  direction:rtl;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);}
.ag-approve-ov.open{display:flex;animation:agFade .18s ease;}
.ag-approve-card{background:var(--bg-card,#1e293b);border:1px solid rgba(255,255,255,.12);
  border-radius:18px;padding:20px;width:100%;max-width:340px;
  animation:agPop .2s cubic-bezier(.34,1.56,.64,1);}
.ag-approve-txt{font-size:12.5px;line-height:1.7;color:#94a3b8;text-align:center;}
</style>`);

  document.body.insertAdjacentHTML('beforeend', `
<div id="agModal">
  <div class="ag-card">
    <div class="ag-hdr">
      <span class="ag-title">🤖 الوكلاء</span>
      <button class="ag-close" id="agClose">✕</button>
    </div>
    <div class="ag-body" id="agBody"></div>

    <div class="ag-confirm" id="agConfirm">
      <div class="ag-confirm-card">
        <div class="ag-confirm-txt" id="agConfirmTxt">—</div>
        <div class="ag-confirm-btns">
          <button class="ag-btn" id="agConfirmNo">إلغاء</button>
          <button class="ag-btn del" id="agConfirmYes">تأكيد</button>
        </div>
      </div>
    </div>

    <div class="ag-confirm" id="agReveal">
      <div class="ag-confirm-card" style="max-width:360px;text-align:right;">
        <div class="ag-title" id="agRevealTitle" style="margin-bottom:12px;justify-content:center;">🔑 —</div>
        <div class="ag-pk-box">
          <span class="ag-pk-txt" id="agRevealPk">—</span>
          <button class="ag-copy-btn" id="agRevealCopyPk" title="نسخ المفتاح">⧉</button>
        </div>
        <div class="ag-note">⚠️ احفظه الآن بمكان آمن — من يملكه يقدر يتداول نيابة عنك فقط (بدون سحب أموال إطلاقاً).</div>
        <div class="ag-actions">
          <button class="ag-btn rot" id="agRevealCopyLink">🔗 رابط تداول</button>
          <button class="ag-btn" id="agRevealCopyJson">📋 نسخ JSON</button>
        </div>
        <button class="ag-btn wide" id="agRevealJson" style="margin-top:8px;">💾 تنزيل كملف .json</button>
        <button class="ag-btn wide" id="agRevealClose" style="margin-top:8px;">فهمت، إغلاق</button>
      </div>
    </div>
  </div>
</div>

<div class="ag-approve-ov" id="agApproveModal">
  <div class="ag-approve-card">
    <div class="ag-title" style="justify-content:center;margin-bottom:8px;">🤖 تفويض محفظة تداول جديدة</div>
    <p class="ag-approve-txt">توقيع واحد من محفظتك الرئيسية يكفي — هذا الوكيل يقدر يتداول فقط، لا يقدر إطلاقاً على سحب أو تحويل أموالك.</p>
    <div class="ag-addr-box" style="margin:10px 0 14px;">
      <span class="ag-addr-txt" id="agApprovePreview">—</span>
    </div>
    <div class="ag-confirm-btns">
      <button class="ag-btn" id="agApproveCancel">إلغاء</button>
      <button class="ag-btn rot" id="agApproveConfirm">✅ وافق ووقّع</button>
    </div>
  </div>
</div>`);

  function _fmtDate(ms) { return new Date(ms).toLocaleDateString('ar-EG', { day:'2-digit', month:'2-digit', year:'numeric' }); }

  function _agentCardHtml(info) {
    const statusCls = info.serverMissing ? 'bad' : !info.valid ? 'bad' : info.daysLeft <= 14 ? 'warn' : 'ok';
    const statusTxt = info.serverMissing ? 'غير موجود بالخادم — احذفه'
                     : !info.valid ? 'منتهي' : info.daysLeft <= 14 ? 'ينتهي قريباً' : 'نشط';
    const isPref = State.wallet && _getPref(State.wallet.address) === info.address;
    return `
      <div class="ag-card-box${isPref ? ' ag-pref' : ''}">
        <div class="ag-row"><span class="ag-row-k">${info.name}${isPref ? ' 🎯' : ''}</span><span class="ag-status ${statusCls}">● ${statusTxt}</span></div>
        <div class="ag-row"><span class="ag-row-k">تاريخ الانتهاء</span><span class="ag-row-v">${_fmtDate(info.expiresAt)}${info.estimated ? ' (تقديري)' : ''}</span></div>
        <div class="ag-row"><span class="ag-row-k">الأيام المتبقية</span><span class="ag-row-v">${info.daysLeft} يوم</span></div>
        <div class="ag-addr-box">
          <span class="ag-addr-txt">${info.address}</span>
          <button class="ag-copy-btn" data-copy="${info.address}" title="نسخ">⧉</button>
        </div>
        <div class="ag-actions-4">
          <button class="ag-btn" data-act="pref" data-addr="${info.address}">🎯 نشّطه</button>
          <button class="ag-btn" data-act="key" data-addr="${info.address}">🔑 المفتاح</button>
          <button class="ag-btn" data-act="json" data-addr="${info.address}">💾 JSON</button>
          <button class="ag-btn del" data-act="del" data-addr="${info.address}">🗑 حذف</button>
        </div>
      </div>`;
  }

  function _render() {
    const body = document.getElementById('agBody');
    if (!body || !State.wallet) return;
    const infos = list();

    let agentsHtml;
    if (!infos.length) {
      agentsHtml = `<div class="ag-empty">🔒 لا يوجد وكيل نشط حالياً
        <button class="ag-btn rot wide" id="agActivate" style="margin-top:14px;">⚡ تفعيل الوكيل الآن</button>
      </div>`;
    } else {
      agentsHtml = infos.map(_agentCardHtml).join('') + (infos.length < MAX_NAMED_AGENTS
        ? `<button class="ag-btn rot wide" id="agAddMore">+ إنشاء وكيل إضافي (${infos.length}/${MAX_NAMED_AGENTS})</button>`
        : `<div class="ag-note">وصلت الحد الأقصى (3 وكلاء لكل محفظة حسب Hyperliquid). احذف أحدها لإضافة آخر.</div>`);
    }

    const wAddr = State.wallet.address;
    body.innerHTML = `
      <div class="ag-sec-title">الوكلاء (${infos.length}/${MAX_NAMED_AGENTS})</div>
      ${agentsHtml}
      <div class="ag-sec-title">استيراد وكيل من جهاز آخر</div>
      <div class="ag-card-box">
        <div class="ag-actions" style="margin-top:0;">
          <button class="ag-btn" id="agImportBtn">📥 من ملف</button>
          <button class="ag-btn" id="agPasteBtn">📋 لصق JSON</button>
        </div>
        <input type="file" accept="application/json" id="agImportFile" style="display:none;">
        <div id="agPasteBox" class="hidden" style="margin-top:10px;">
          <textarea id="agPasteArea" class="ag-paste-area" placeholder="الصق محتوى JSON هنا (بالكامل)..." rows="4"></textarea>
          <button class="ag-btn rot wide" id="agPasteImport" style="margin-top:8px;">استيراد الآن</button>
        </div>
      </div>
      <div class="ag-sec-title">المحفظة</div>
      <div class="ag-card-box">
        <div class="ag-row"><span class="ag-row-k">عنوان الإيداع</span></div>
        <div class="ag-addr-box">
          <span class="ag-addr-txt">${wAddr}</span>
          <button class="ag-copy-btn" data-copy="${wAddr}" title="نسخ">⧉</button>
        </div>
      </div>
      <div class="ag-note">
        💵 الإيداع والسحب متاحان من ⚙️ الخيارات. 🛡 كل وكيل يوقّع الصفقات فقط —
        لا يقدر إطلاقاً على سحب أو تحويل أموالك، حتى لو شاركت مفتاحه الخاص أو رابط تداوله مع أي جهاز آخر.
      </div>`;

    _wireActions();
  }

  function _showAgentError(e) {
    if (!e || e.message === 'CANCELLED') return;
    const msg = typeof errToAr === 'function' ? errToAr(e.message) : e.message;
    toast('⚠️ ' + msg, 'err');
  }

  async function _createFlow() {
    try { await ensure(true); }
    catch (e) { _showAgentError(e); }
  }

  function _wireActions() {
    document.getElementById('agActivate')?.addEventListener('click', _createFlow);
    document.getElementById('agAddMore')?.addEventListener('click', _createFlow);

    document.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => _copy(b.dataset.copy)));

    document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
      const addr = b.dataset.addr, act = b.dataset.act;
      if (act === 'pref') { setPreferred(addr); toast('🎯 الوكيل النشط الآن: ' + addr.slice(0, 8) + '…', 'ok'); }
      else if (act === 'key') _showReveal(_loadAll(State.wallet.address).find(a => a.agentAddress === addr));
      else if (act === 'json') exportJSON(addr);
      else if (act === 'del') _confirm(
        'سيتوقف هذا الوكيل عن العمل فوراً من داخل التطبيق. صفقاتك المفتوحة تبقى كما هي على Hyperliquid.',
        () => { revokeOne(State.wallet.address, addr); toast('🗑 تم الحذف', 'info'); _render(); }
      );
    }));

    const importBtn  = document.getElementById('agImportBtn');
    const importFile = document.getElementById('agImportFile');
    importBtn?.addEventListener('click', () => importFile?.click());
    importFile?.addEventListener('change', () => {
      const f = importFile.files?.[0]; if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const res = importJSON(JSON.parse(reader.result));
          toast(res.msg, res.ok ? 'ok' : 'err');
          if (res.ok) _render();
        } catch { toast('ملف JSON غير صالح', 'err'); }
      };
      reader.readAsText(f);
      importFile.value = '';
    });

    document.getElementById('agPasteBtn')?.addEventListener('click', () => {
      document.getElementById('agPasteBox')?.classList.toggle('hidden');
    });
    document.getElementById('agPasteImport')?.addEventListener('click', () => {
      const ta  = document.getElementById('agPasteArea');
      const raw = ta?.value?.trim();
      if (!raw) { toast('الصق محتوى JSON أولاً', 'err'); return; }
      try {
        const res = importJSON(JSON.parse(raw));
        toast(res.msg, res.ok ? 'ok' : 'err');
        if (res.ok) { if (ta) ta.value = ''; _render(); }
      } catch { toast('نص JSON غير صالح — تأكد من نسخه كاملاً بلا نقص', 'err'); }
    });
  }

  function _showReveal(rec) {
    if (!rec) return;
    const box = document.getElementById('agReveal');
    if (!box) { console.error('[agents.js] #agReveal غير موجود'); return; }
    const link = typeof AgentLink !== 'undefined' ? AgentLink.build(State.wallet.address, rec.pk) : null;
    setTxt('agRevealTitle', `🔑 ${rec.agentName}`);
    setTxt('agRevealPk', rec.pk);
    box.classList.add('open');
    const byId = id => document.getElementById(id);
    if (byId('agRevealCopyPk'))   byId('agRevealCopyPk').onclick   = () => _copy(rec.pk);
    if (byId('agRevealCopyLink')) byId('agRevealCopyLink').onclick = () => link ? _copy(link) : toast('تعذّر توليد الرابط', 'err');
    if (byId('agRevealCopyJson')) byId('agRevealCopyJson').onclick = () => copyJSONText(rec.agentAddress);
    if (byId('agRevealJson'))     byId('agRevealJson').onclick     = () => exportJSON(rec.agentAddress);
    if (byId('agRevealClose'))    byId('agRevealClose').onclick    = () => box.classList.remove('open');
  }

  function _copy(text) {
    if (!text) return;
    navigator.clipboard?.writeText(text).then(() => toast('✅ تم النسخ', 'info', 2000)).catch(() => toast('تعذّر النسخ', 'err'));
  }

  function _confirm(msg, onYes) {
    const box = document.getElementById('agConfirm');
    if (!box) { console.error('[agents.js] #agConfirm غير موجود'); return; }
    setTxt('agConfirmTxt', msg);
    box.classList.add('open');
    const noBtn = document.getElementById('agConfirmNo'), yesBtn = document.getElementById('agConfirmYes');
    if (noBtn)  noBtn.onclick  = () => box.classList.remove('open');
    if (yesBtn) yesBtn.onclick = () => { box.classList.remove('open'); onYes(); };
  }

  function _refreshUI() { if (document.getElementById('agModal')?.classList.contains('open')) _render(); }

  function _open() {
    if (State.isGuest || !State.wallet) { toast('سجّل الدخول أولاً', 'err'); return; }
    _render();
    document.getElementById('agModal')?.classList.add('open');
    clearInterval(_tickTimer);
    _tickTimer = setInterval(_render, 60000);
  }
  function _close() {
    document.getElementById('agModal')?.classList.remove('open');
    document.getElementById('agConfirm')?.classList.remove('open');
    document.getElementById('agReveal')?.classList.remove('open');
    document.getElementById('agApproveModal')?.classList.remove('open');
    clearInterval(_tickTimer);
  }

  document.getElementById('agClose')?.addEventListener('click', _close);
  document.getElementById('agModal')?.addEventListener('click', (e) => { if (e.target.id === 'agModal') _close(); });

  window.Agents = {
    ensure, revoke, revokeOne, clearSession, getInfo, list, setPreferred,
    exportJSON, importJSON, copyJSONText, buildLink,
    openModal: _open, closeModal: _close, TTL_MS: AGENT_TTL_MS,
  };
})();
