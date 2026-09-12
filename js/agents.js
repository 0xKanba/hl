/* ═══════════════════════════════════════════════════════════════
   agents.js — إدارة محافظ الوكلاء (Hyperliquid Agent/API Wallets) — v3

   ⚠️ إصلاح أمني جوهري (سبب هذا الإصدار) — الحذف السابق (revokeOne) كان
   محلياً بحتاً: يمسح السجل من localStorage فقط، بلا أي اتصال بالشبكة
   إطلاقاً. النتيجة: الوكيل "المحذوف" يبقى مفوَّضاً وفعّالاً بالكامل
   عند Hyperliquid — أي نسخة من مفتاحه الخاص (لو تسرّبت، أو بقيت بجهاز
   آخر) تقدر تتداول نيابة عن الحساب رغم أن التطبيق "نسي" الوكيل تماماً.
   هذا لا يطابق سلوك موقع Hyperliquid الرسمي، الذي يطلب توقيعاً فعلياً
   عند إزالة وكيل ويُبطله حقاً من جهته.

   🔍 بحث مباشر قبل الإصلاح (إلزامي لأي سلوك API حسّاس بمال حقيقي) —
   فُحص توثيق exchange-endpoint الرسمي + الكود المصدري لـHyperliquid
   Python SDK الرسمي (hyperliquid-dex/hyperliquid-python-sdk،
   exchange.py) مباشرة. النتيجة المؤكَّدة: **لا يوجد أي إجراء "إلغاء/
   إبطال" منفصل بكامل واجهة Hyperliquid** — `approveAgent` هي الإجراء
   الوحيد المتعلق بالوكلاء بكل الـAPI (لا `revokeAgent`، لا
   `deregisterAgent`). الآلية الحقيقية الوحيدة لإبطال وكيل مبكراً (قبل
   انتهاء صلاحيته الطبيعية): إعادة اعتماد **نفس اسم الخانة** بمفتاح
   عشوائي جديد يُهمَل فوراً بلا حفظ — Hyperliquid يستبدل حامل الاسم
   السابق بهذا الجديد (سلوك مُثبَت فعلياً بتجربة هذا المشروع نفسه
   تاريخياً — راجع CHANGES.md القديم: "Hyperliquid يستبدل الوكيل صاحب
   نفس الاسم عند أي approveAgent جديد بنفس الاسم"). توقيع واحد فقط،
   تماماً كالإنشاء — هذا هو ما تفعله _revokeSigned أدناه بالضبط.

   ⚠️ قيد حقيقي مؤكَّد من التوثيق الرسمي (لا افتراض): حساب واحد يملك
   وكيلاً غير مُسمّى واحداً + **حتى 3 وكلاء مُسمّين فقط**، بلا أي إجراء
   لحجز اسم جديد كلياً بعد امتلاء الثلاثة — إعادة استخدام **نفس** اسم
   قديم هي الطريقة الوحيدة لتحرير سعة فعلية. لذلك أسماء الخانات
   *الحقيقية* المُرسَلة لـHyperliquid (BASE_NAME أدناه) تبقى 3 أسماء
   ثابتة يُعاد استخدامها للأبد (تماماً كالإصدار السابق — ضماناً للتوافق
   الخلفي: أي وكيل مُوافَق عليه فعلاً بهذي الأسماء قبل هذا التحديث يبقى
   مُتعرَّفاً عليه تلقائياً) — **غير مرئية للمستخدم إطلاقاً**.

   ✅ الجديد الذي يراه المستخدم فعلاً — رقم تسلسلي محلي بحت (0x1، 0x2،
   0x3... 0x10...) منفصل تماماً عن الاسم الحقيقي المُرسَل لـHyperliquid.
   يزيد فقط عند نجاح إنشاء حقيقي (لا فجوات من محاولات أُلغيت أو فشلت)،
   ولا يتراجع أبداً حتى لو حُذفت كل الوكلاء — بالضبط كما طُلب: 0x9
   يُحذف ← الوكيل التالي 0x10. وبما أن الحذف الآن حقيقي (يُبطل الوكيل
   عند Hyperliquid فعلاً)، السعة الحقيقية (3 خانات) تتحرر تلقائياً مع
   كل حذف — فلا حد "مصطنع" يظهر للمستخدم بالاستخدام الطبيعي (إنشاء ←
   حذف ← إنشاء...)، فقط لو امتلك 3 وكلاء صالحين بنفس اللحظة فعلاً.

   ✅ تبسيط الواجهة (بطلب مباشر) — بطاقة كل وكيل 3 أزرار فقط: 🔗 رابط
   تداول · 🔑 كشف المفتاح · 🗑 حذف. حُذف تماماً: تصدير/استيراد JSON
   (ملف أو نص)، التفعيل اليدوي ("🎯 نشّطه" — الآن تلقائي بالكامل: أحدث
   وكيل صالح محلياً هو المُستخدَم دائماً للتوقيع، بلا أي إعداد يدوي —
   راجع _ensureImpl)، وصندوق عنوان المحفظة (متوفر أصلاً بنافذة الإيداع).

   ✅ عزل كامل بين المحافظ — بلا تغيير: كل شيء (السجل المحلي + العداد
   التسلسلي) مفتاح بعنوان المحفظة (hl_agents_<addr> / hl_agent_seq_
   <addr>)، فلا تسريب أو تداخل بين حسابات مختلفة بنفس المتصفح.

   ✅ توافق خلفي كامل — وكيل أي مستخدم مُوافَق عليه أصلاً (v1 أو v2)
   يُرحَّل تلقائياً (نفس مفتاحه/عنوانه، بلا أي توقيع جديد) ويُعطى رقماً
   تسلسلياً محلياً جديداً (0x1، 0x2...) أول مرة يُحمَّل بعد هذا التحديث.
═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const AGENT_TTL_MS        = 180 * 24 * 3600 * 1000; // الحد الأقصى الموثّق رسمياً لـvalid_until
  const AGENT_KEY_PREFIX    = 'hl_agents_';     // مصفوفة وكلاء لكل محفظة
  const AGENT_KEY_PREFIX_V1 = 'hl_agent_';      // v1 القديم: كائن وكيل مفرد (يُرحَّل تلقائياً)
  const SEQ_KEY_PREFIX      = 'hl_agent_seq_';  // عدّاد الاسم المعروض (0x1، 0x2...) — محلي بحت
  /* الأسماء الحقيقية المُرسَلة فعلياً لـHyperliquid — 3 خانات ثابتة تُعاد
     استخدامها للأبد (راجع تعليق رأس الملف لسبب هذا التحديد بالذات).
     غير مرئية للمستخدم إطلاقاً — فقط _consumeDisplayName أدناه ينتج
     الاسم الذي يراه فعلاً. */
  const BASE_NAME       = 'market-liq';
  const NAMED_POOL_SIZE = 3;

  let _ensurePromise = null;
  let _tickTimer     = null;

  function _uerr(msg) { return new Error(msg); }

  function _key(addr)    { return AGENT_KEY_PREFIX + addr.toLowerCase(); }
  function _seqKey(addr) { return SEQ_KEY_PREFIX + addr.toLowerCase(); }

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
            pk: m.pk, agentAddress: m.agentAddress, agentName: m.agentName || BASE_NAME + '-1',
            createdAt: m.createdAt || Date.now(), validUntil: null,
          });
          localStorage.setItem(_key(addr), JSON.stringify(cur));
        }
      }
    } catch {}
    localStorage.removeItem(oldKey);
  }

  /* ════ عدّاد الاسم المعروض — محلي بحت، يزيد فقط عند نجاح حقيقي ════ */
  function _peekNextDisplayName(addr) {
    const n = (parseInt(localStorage.getItem(_seqKey(addr)) || '0', 10) || 0) + 1;
    return '0x' + n;
  }
  function _consumeDisplayName(addr) {
    const n = (parseInt(localStorage.getItem(_seqKey(addr)) || '0', 10) || 0) + 1;
    try { localStorage.setItem(_seqKey(addr), String(n)); } catch {}
    return '0x' + n;
  }
  function _backfillDisplayNames(addr, arr) {
    let changed = false;
    arr.forEach(rec => {
      if (!rec.displayName) { rec.displayName = _consumeDisplayName(addr); changed = true; }
    });
    return changed;
  }

  function _loadAll(addr) {
    _migrateV1(addr);
    let list;
    try { list = JSON.parse(localStorage.getItem(_key(addr)) || '[]'); } catch { list = []; }
    if (_backfillDisplayNames(addr, list)) _saveAll(addr, list);
    return list;
  }
  function _saveAll(addr, list) { try { localStorage.setItem(_key(addr), JSON.stringify(list)); } catch {} }

  function _isValid(rec) {
    if (!rec || !rec.pk) return false;
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

  /* ✅ جديد — يُطهّر القائمة المحلية تلقائياً من أي وكيل لم يعد موجوداً
     على الخادم إطلاقاً (حُذف فعلياً — من هذا الجهاز أو غيره) أو انتهت
     صلاحيته فعلياً — بلا أي حالة "غير موجود، احذفه يدوياً" تحتاج فعلاً
     يدوياً؛ القائمة المعروضة دائماً "وكلاء صالحون الآن" فقط. */
  function _reconcile(addr, local, serverList) {
    if (!Array.isArray(serverList)) return local; // فشل شبكة — لا تغيير
    const byAddr = {};
    serverList.forEach(s => { byAddr[(s.address || '').toLowerCase()] = s; });
    const now = Date.now();
    let changed = false;
    const kept = local.filter(rec => {
      const srv = byAddr[rec.agentAddress.toLowerCase()];
      if (!srv || (srv.validUntil && srv.validUntil <= now)) { changed = true; return false; }
      if (srv.validUntil !== rec.validUntil) { rec.validUntil = srv.validUntil; changed = true; }
      return true;
    });
    if (changed) _saveAll(addr, kept);
    return kept;
  }

  /* اختيار خانة حقيقية قابلة للاستخدام الآن (فارغة كلياً، أو منتهية
     فعلياً حسب الخادم) — لا علاقة لها بالاسم المعروض للمستخدم إطلاقاً. */
  function _pickReusableSlot(serverList) {
    const now = Date.now();
    const byName = {};
    (serverList || []).forEach(s => { byName[s.name] = s; });
    for (let n = 1; n <= NAMED_POOL_SIZE; n++) {
      const nm = `${BASE_NAME}-${n}`;
      const srv = byName[nm];
      if (!srv || !srv.validUntil || srv.validUntil <= now) return nm;
    }
    return null;
  }

  function _info(rec) {
    if (!rec) return null;
    const expiresAt = rec.validUntil || (rec.createdAt + AGENT_TTL_MS);
    return {
      displayName: rec.displayName, address: rec.agentAddress, createdAt: rec.createdAt,
      expiresAt, daysLeft: Math.max(0, Math.ceil((expiresAt - Date.now()) / 86400000)),
      valid: _isValid(rec), estimated: !rec.validUntil,
    };
  }

  /* أحدث وكيل صالح محلياً — لا مفهوم "مفضَّل" يدوي بعد الآن (راجع
     تعليق رأس الملف): الأحدث إنشاءً هو المُستخدَم تلقائياً. */
  function getInfo(address) {
    const addr = address || State.wallet?.address;
    if (!addr) return null;
    const best = _loadAll(addr).filter(_isValid).sort((a, b) => b.createdAt - a.createdAt)[0];
    return _info(best);
  }

  function list(address) {
    const addr = address || State.wallet?.address;
    if (!addr) return [];
    return _loadAll(addr).sort((a, b) => b.createdAt - a.createdAt).map(_info);
  }

  /* ════ نافذة التفويض — ذاتية الحقن بالكامل، تُستخدم للإنشاء فقط
     (الحذف يمر مباشرة بـ_confirm الأحمر ثم التوقيع، بلا معاينة عنوان
     جديد — لا شيء جديد ليُعاين عند الحذف). ════ */
  function _confirmApproval(agentAddress, displayName) {
    return new Promise((resolve, reject) => {
      const box   = document.getElementById('agApproveModal');
      const okBtn = document.getElementById('agApproveConfirm');
      const noBtn = document.getElementById('agApproveCancel');
      if (!box || !okBtn || !noBtn) {
        console.error('[agents.js] عناصر نافذة التفويض الذاتية غير موجودة — تحقق من ترتيب تحميل agents.js');
        reject(_uerr('تعذّر فتح نافذة التفويض — أعد تحميل الصفحة وحاول مجدداً'));
        return;
      }
      setTxt('agApprovePreview', `${displayName} — ${agentAddress}`);
      box.classList.add('open');
      okBtn.onclick = () => { box.classList.remove('open'); resolve(); };
      noBtn.onclick = () => { box.classList.remove('open'); reject(new Error('CANCELLED')); };
    });
  }

  async function _createAndApprove(addr) {
    const serverList = await _fetchExtraAgents(addr);
    const slot = _pickReusableSlot(serverList);
    if (!slot) throw _uerr('لديك 3 وكلاء فعّالين الآن — الحد الأقصى المسموح من Hyperliquid لكل حساب. احذف أحدهم أولاً لإضافة وكيل جديد');

    const agent = ethers.Wallet.createRandom();
    const previewName = _peekNextDisplayName(addr); // معاينة فقط — لا يُستهلَك إلا بعد نجاح حقيقي
    await _confirmApproval(agent.address, previewName);

    showLoader('بانتظار توقيعك...');
    try {
      const nonce      = Date.now();
      const validUntil = nonce + AGENT_TTL_MS;
      const nameOnChain = `${slot} valid_until ${validUntil}`; // موثّق رسمياً
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

      const displayName = _consumeDisplayName(addr); // يُستهلَك الآن فقط — نجاح مؤكَّد، بلا فجوات بالترقيم
      const rec = { pk: agent.privateKey, agentAddress: agent.address, agentName: slot, displayName, createdAt: nonce, validUntil };
      const all = _loadAll(addr); all.push(rec); _saveAll(addr, all);
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
      const usable = local.filter(_isValid).sort((a, b) => b.createdAt - a.createdAt)[0];
      if (usable) {
        _fetchExtraAgents(addr).then(sl => _reconcile(addr, _loadAll(addr), sl)); // مزامنة صامتة بالخلفية
        try { State.agent = new ethers.Wallet(usable.pk); return State.agent; } catch {}
      }
    }

    const serverList = await _fetchExtraAgents(addr);
    local = _reconcile(addr, local, serverList);

    if (!forceNew) {
      const stillValid = local.filter(_isValid).sort((a, b) => b.createdAt - a.createdAt)[0];
      if (stillValid) { try { State.agent = new ethers.Wallet(stillValid.pk); return State.agent; } catch {} }
    }

    return _createAndApprove(addr);
  }

  /* ════════════════════════════════════════════════
     ✅ حذف حقيقي بتوقيع — يعيد اعتماد نفس الخانة الحقيقية (rec.agentName)
     بمفتاح عشوائي يُهمَل فوراً (لا يُحفظ بأي مكان، لا يُعرَض، لا فائدة
     منه سوى إشغال الاسم بدل الوكيل القديم) — فيُبطل مفتاح الوكيل
     المحذوف فعلياً عند Hyperliquid. هذه الآلية الوحيدة الموثّقة (ضمنياً
     عبر غياب أي إجراء بديل + سلوك استبدال نفس الاسم المُجرَّب سابقاً
     بهذا المشروع) لإبطال وكيل قبل انتهاء صلاحيته الطبيعية — راجع تعليق
     رأس الملف. توقيع واحد، بالضبط كالإنشاء.
  ════════════════════════════════════════════════ */
  async function _revokeSigned(addr, rec) {
    const throwaway = ethers.Wallet.createRandom();
    const nonce = Date.now();
    const nameOnChain = `${rec.agentName} valid_until ${nonce + AGENT_TTL_MS}`;
    const action = {
      type: 'approveAgent', hyperliquidChain: 'Mainnet', signatureChainId: '0xa4b1',
      agentAddress: throwaway.address, agentName: nameOnChain, nonce,
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
      { hyperliquidChain: 'Mainnet', agentAddress: throwaway.address, agentName: nameOnChain, nonce }
    );
    const { r, s, v } = ethers.Signature.from(sig);
    const body = { action, nonce, signature: { r, s, v } };
    const d = HL.isOpen() ? await HL.post(body, true).catch(() => _restExchange(body)) : await _restExchange(body);
    if (d.status !== 'ok') throw new Error(typeof d.response === 'string' ? d.response : JSON.stringify(d));
  }

  async function revokeOne(address, agentAddress) {
    const addr = address || State.wallet?.address;
    if (!addr || !State.wallet) throw _uerr('سجّل الدخول أولاً');
    const all = _loadAll(addr);
    const rec = all.find(a => a.agentAddress.toLowerCase() === agentAddress.toLowerCase());
    if (!rec) return;
    await _revokeSigned(addr, rec); // يرمي استثناءً لو رفض المستخدم التوقيع أو فشلت الشبكة — القائمة المحلية تبقى كما هي
    _saveAll(addr, all.filter(a => a.agentAddress.toLowerCase() !== agentAddress.toLowerCase()));
    if (State.agent?.address?.toLowerCase() === agentAddress.toLowerCase()) State.agent = null;
    _refreshUI();
  }

  /* حذف محلي جماعي فقط — يُستخدم حصراً بمسار "نسيت رمز PIN" (تنظيف
     طارئ لبيانات هذا الجهاز). لا توقيع هنا عمداً: تلك لحظة طوارئ قد لا
     يريد فيها المستخدم التعامل مع توقيعات متعددة؛ الوكلاء الفعليون
     يبقون صالحين عند Hyperliquid حتى انتهاء صلاحيتهم الطبيعية، ويمكن
     حذفهم لاحقاً بأمان بنفس هذا الملف (revokeOne) من أي جهاز مُتصل. */
  function revoke(address) {
    const addr = address || State.wallet?.address;
    if (!addr) return;
    _saveAll(addr, []);
    if (State.wallet?.address?.toLowerCase() === addr.toLowerCase()) State.agent = null;
    _refreshUI();
  }

  function clearSession() { State.agent = null; }

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
.ag-btn{padding:11px;border-radius:12px;font-size:12.5px;font-weight:800;cursor:pointer;
  border:1.5px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);
  color:var(--text-primary,#f1f5f9);display:flex;align-items:center;justify-content:center;gap:5px;
  transition:filter .12s,transform .1s;font-family:'Cairo',sans-serif;}
.ag-btn:active{transform:scale(.96);}
.ag-btn.rot{border-color:rgba(139,92,246,.4);background:rgba(139,92,246,.1);color:#8b5cf6;}
.ag-btn.del{border-color:rgba(239,68,68,.4);background:rgba(239,68,68,.1);color:#ef4444;}
.ag-btn.wide{grid-column:1/-1;width:100%;}
.ag-actions-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:10px;}
.ag-actions-3 .ag-btn{padding:9px 4px;font-size:11.5px;}
.ag-note{font-size:11.5px;line-height:1.7;color:#94a3b8;background:rgba(139,92,246,.06);
  border:1px solid rgba(139,92,246,.18);border-radius:10px;padding:10px 12px;margin-top:10px;}
.ag-note b{color:#8b5cf6;}
.ag-empty{text-align:center;padding:26px 10px;color:#94a3b8;font-size:13px;font-weight:700;}
.ag-empty .ag-btn{margin-top:14px;max-width:230px;margin-inline:auto;}
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
        <button class="ag-btn rot wide" id="agRevealCopyLink" style="margin-top:10px;">🔗 نسخ رابط تداول</button>
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
    const statusCls = !info.valid ? 'bad' : info.daysLeft <= 14 ? 'warn' : 'ok';
    const statusTxt = !info.valid ? 'منتهي' : info.daysLeft <= 14 ? 'ينتهي قريباً' : 'نشط';
    return `
      <div class="ag-card-box">
        <div class="ag-row"><span class="ag-row-k">${info.displayName}</span><span class="ag-status ${statusCls}">● ${statusTxt}</span></div>
        <div class="ag-row"><span class="ag-row-k">تاريخ الانتهاء</span><span class="ag-row-v">${_fmtDate(info.expiresAt)}${info.estimated ? ' (تقديري)' : ''}</span></div>
        <div class="ag-row"><span class="ag-row-k">الأيام المتبقية</span><span class="ag-row-v">${info.daysLeft} يوم</span></div>
        <div class="ag-addr-box">
          <span class="ag-addr-txt">${info.address}</span>
          <button class="ag-copy-btn" data-copy="${info.address}" title="نسخ">⧉</button>
        </div>
        <div class="ag-actions-3">
          <button class="ag-btn rot" data-act="link" data-addr="${info.address}">🔗 رابط</button>
          <button class="ag-btn" data-act="key" data-addr="${info.address}">🔑 المفتاح</button>
          <button class="ag-btn del" data-act="del" data-addr="${info.address}">🗑 حذف</button>
        </div>
      </div>`;
  }

  function _render() {
    const body = document.getElementById('agBody');
    if (!body || !State.wallet) return;
    const infos = list();

    const agentsHtml = infos.length
      ? infos.map(_agentCardHtml).join('') + `<button class="ag-btn rot wide" id="agAddMore">+ إنشاء وكيل جديد</button>`
      : `<div class="ag-empty">🔒 لا يوجد وكيل نشط حالياً
          <button class="ag-btn rot wide" id="agActivate" style="margin-top:14px;">⚡ تفعيل الوكيل الآن</button>
        </div>`;

    body.innerHTML = `
      <div class="ag-sec-title">الوكلاء (${infos.length})</div>
      ${agentsHtml}
      <div class="ag-note">
        🛡 كل وكيل يوقّع الصفقات فقط — لا يقدر إطلاقاً على سحب أو تحويل أموالك.
        حذف أي وكيل من هنا يُبطله فعلياً عند Hyperliquid (يتطلب توقيعك)، فلا يبقى صالحاً للتداول بأي مكان آخر بعدها.
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
      if (act === 'link') {
        const link = buildLink(addr);
        link ? _copy(link) : toast('تعذّر توليد الرابط', 'err');
      } else if (act === 'key') {
        _showReveal(_loadAll(State.wallet.address).find(a => a.agentAddress === addr));
      } else if (act === 'del') {
        _confirm(
          'سيتطلب هذا توقيعاً واحداً من محفظتك لإبطال الوكيل فعلياً عند Hyperliquid — لن يعود صالحاً للتداول بأي مكان بعدها. صفقاتك المفتوحة تبقى كما هي.',
          async () => {
            showLoader('بانتظار توقيعك...');
            try {
              await revokeOne(State.wallet.address, addr);
              toast('🗑 تم إبطال الوكيل فعلياً', 'ok');
            } catch (e) {
              _showAgentError(e);
            } finally {
              hideLoader();
            }
          }
        );
      }
    }));
  }

  function _showReveal(rec) {
    if (!rec) return;
    const box = document.getElementById('agReveal');
    if (!box) { console.error('[agents.js] #agReveal غير موجود'); return; }
    const link = typeof AgentLink !== 'undefined' ? AgentLink.build(State.wallet.address, rec.pk) : null;
    setTxt('agRevealTitle', `🔑 ${rec.displayName}`);
    setTxt('agRevealPk', rec.pk);
    box.classList.add('open');
    const byId = id => document.getElementById(id);
    if (byId('agRevealCopyPk'))   byId('agRevealCopyPk').onclick   = () => _copy(rec.pk);
    if (byId('agRevealCopyLink')) byId('agRevealCopyLink').onclick = () => link ? _copy(link) : toast('تعذّر توليد الرابط', 'err');
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
    ensure, revoke, revokeOne, clearSession, getInfo, list, buildLink,
    openModal: _open, closeModal: _close, TTL_MS: AGENT_TTL_MS,
  };
})();
