/* ═══════════════════════════════════════════════════════════════
   agents.js — إدارة محافظ الوكلاء (Hyperliquid Agent/API Wallets) — v6

   ⚠️ العطل المُبلَّغ عنه (مُتكرر من v4): حذف وكيل من داخل المشروع لا
   ينعكس فعلياً — يبقى ظاهراً بـ app.hyperliquid.xyz/API. v5 أضافت
   تحقّقاً بعد كل حذف (استعلام extraAgents 3 مرات بفاصل 600ms)، لكن هذا
   لم يعالج السبب الجذري الحقيقي. أُعيد فحص كامل الآلية مقابل التوثيق
   الرسمي مباشرة (exchange-endpoint + nonces-and-api-wallets، 2026-09):

   🔍 ما تأكَّد رسمياً (لا افتراض):
   1) exchange-endpoint: "agentName: ... A custom expiration can be set
      by appending `valid_until {timestamp}` after the name. The
      expiration can be at most 180 days in the future." — صيغة
      "الاسم valid_until الطابع_الزمني" المستخدمة بهذا الملف أصلاً
      حقيقية وموثّقة رسمياً، ليست تخميناً — هذا الجزء كان صحيحاً أصلاً.
   2) nonces-and-api-wallets → "API wallet pruning": "This ... happens
      to an existing named API Wallet when an ApproveAgent action is
      sent with a matching name." — أي أن آلية "إعادة الاعتماد بنفس
      الاسم لإبطال القديم" هي فعلاً الآلية الرسمية الوحيدة، وتعمل كما
      افترضت v4/v5 تماماً. لا بديل مخفي كنا نفتقده.

   ✅ السبب الجذري الحقيقي (لم يُكتشف بالإصدارات السابقة): عند الحذف،
   كان الكود يمنح المفتاح المهمَل (throwaway) نفس صلاحية 180 يوماً
   (AGENT_TTL_MS) المستخدمة للتفعيل الحقيقي. النتيجة: بعد "حذف" ناجح
   فعلياً 100% عند الخادم، الخانة (مثلاً "وكيل-1") تبقى تظهر بـ
   app.hyperliquid.xyz/API كوكيل "نشط" لمدة 180 يوماً كاملة — فقط
   بعنوان عشوائي غريب بدل عنوان المستخدم القديم. هذا بالضبط ما يراه
   المستخدم ويُفسّره (بمنطقية تامة) كـ"لم يُحذف" رغم أن الإبطال الفعلي
   (تعطيل المفتاح القديم عن التوقيع) تم بنجاح فوراً. الإصلاح: المفتاح
   المهمَل الآن يأخذ صلاحية قصيرة جداً (REVOKE_GRACE_MS، دقيقتان) بدل
   180 يوماً — فتختفي الخانة فعلياً من موقع Hyperliquid الرسمي خلال
   دقيقتين تقريباً بدل نصف سنة. لا حاجة لهذا التمديد أصلاً: لا أحد
   يملك مفتاح هذا الوكيل المهمَل ليستخدمه أبداً.

   ✅ إصلاح ثانٍ (بوابة نجاح/فشل كانت خاطئة الأساس): v5 كانت تُعامل
   نجاح استعلام extraAgents اللاحق كشرط للنجاح، وتفشل (رسالة خطأ مخيفة)
   لو لم يلحق القراءة خلال 1.8 ثانية فقط — رغم أن `status:'ok'` من
   /exchange هو نفسه الدليل الرسمي الوحيد المطلوب (شكل الرد الموثّق
   لـapproveAgent بسيط: {status:'ok', response:{type:'default'}}، بلا
   أي تفصيل جزئي كالطلبات). الآن: `status:'ok'` = نجاح مؤكَّد فوراً؛
   استعلام extraAgents بعدها تأكيد تفاؤلي إضافي فقط (نافذة أطول، ~10
   ثوانٍ) لتحديث الواجهة بدقة أكبر — لا يُفشل العملية أبداً لو تأخّر.

   ✅ إصلاح ثالث (تفاؤل محلي فوري): فور نجاح الحذف، الخانة تُعرض "فارغة"
   بواجهتنا نحن مباشرة (بصرف النظر عن صلاحية المفتاح المهمَل المتبقية)
   عبر خريطة `_locallyRevoked` مؤقتة — نفس نمط `State._closedCoins`
   المستخدم أصلاً بـ trading.js لإغلاق الصفقات المتفائل. يسمح هذا
   بإعادة تفعيل نفس الخانة فوراً بلا انتظار.

   ✅ إصلاح رابع — ثغرة تلاعب HTML: كانت أسماء الوكلاء "الأخرى" (من
   مصدر خارجي، قد تحوي أي محارف) تُمرَّر عبر data-name="..." بهروب
   جزئي (علامات الاقتباس فقط، لا &/</>)، فأي اسم بمحارف خاصة قد يُقرأ
   بصيغة مختلفة عند التوقيع فيُنشئ خانة اسم جديدة بدل إبطال الصحيحة.
   الحل: سجل صفوف محلي بالذاكرة (rowId) بدل تمرير النص عبر HTML.

   ✅ إصلاح خامس — نقرة مزدوجة: نوافذ التأكيد (agConfirm/agApproveModal)
   عناصر DOM مشتركة يُعاد ربط أحداثها بكل استدعاء؛ نقرة ثانية أثناء
   انتظار الأولى كانت تُبطل وعد الأولى للأبد بصمت. الآن قفل `_busy`
   عام يمنع أي إجراء متزامن آخر حتى انتهاء الحالي.

   ✅ إصلاح سادس — عزل `_locallyRevoked` بعنوان المحفظة (لم يكن معزولاً
   سابقاً، فتبديل محفظة خلال نافذة الدقيقتين كان يُظهر خانة محفظة
   مختلفة تماماً كـ"فارغة" خطأً لو تشابه اسم الخانة).

   المرجع الرسمي المُستخدم للتحقّق (فُحص مباشرة قبل هذا التعديل):
   - https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint
   - https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets

   ملاحظة لأي وكيل "عالق" من قبل هذا التحديث (أُبطل سابقاً لكن ما زال
   ظاهراً بصلاحية 180 يوم قديمة): اضغط "🗑 حذف" عليه مرة أخرى من قسم
   "وكلاء أخرى" — الحذف الجديد سيُعيد اعتماده بصلاحية قصيرة فيختفي
   خلال دقيقتين، بلا أي إجراء يدوي آخر مطلوب.
═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const AGENT_TTL_MS        = 180 * 24 * 3600 * 1000; // الحد الأقصى الموثّق رسمياً — يُستخدم فقط عند تفعيل وكيل حقيقي
  const REVOKE_GRACE_MS     = 2 * 60 * 1000;          // ✅ v6 — صلاحية قصيرة عمداً لمفتاح الإبطال المهمَل (راجع تعليق الرأس)
  const LOCAL_OVERRIDE_MS   = REVOKE_GRACE_MS + 45000; // مهلة إظهار "فارغة" بواجهتنا محلياً — هامش أمان فوق صلاحية المفتاح المهمَل
  const VERIFY_DELAYS       = [700, 1000, 1400, 1800, 2400, 3000]; // ~10.3s تأكيد تفاؤلي إضافي — ليس بوابة نجاح/فشل
  const AGENT_KEY_PREFIX    = 'hl_agents_';   // مصفوفة الوكلاء التي نملك مفاتيحها محلياً، لكل محفظة
  const AGENT_KEY_PREFIX_V1 = 'hl_agent_';    // v1 القديم: كائن وكيل مفرد (يُرحَّل تلقائياً)
  const SLOT_NAMES = ['وكيل-1', 'وكيل-2', 'وكيل-3']; // الأسماء الحقيقية الثابتة — 3 خانات دائماً، لا أكثر ولا أقل
  const UNNAMED_KEY = '\u0000__unnamed__';    // مفتاح داخلي للوكيل غير المُسمّى (لا يصطدم أبداً باسم حقيقي)

  let _ensurePromise = null;
  let _tickTimer     = null;
  let _busy          = false;   // ✅ v6 — قفل عام: يمنع أي إجراء آخر متزامن (نقرة مزدوجة) أثناء تفعيل/حذف جارٍ
  let _renderInFlight  = false; // ✅ v6 — يمنع تراكب استدعاءين لـ_render (مؤقّت 30s + إجراء يستدعيها معاً)
  let _renderAgainPending = false;
  let _rowRegistry = new Map(); // ✅ v6 — rowId → كائن الصف (بديل تمرير الاسم عبر data-attribute مهروب جزئياً)
  let _rowSeq = 0;
  const _locallyRevoked = new Map(); // ✅ v6 — `${addrLower}::${name}` → وقت الإبطال — تفاؤل محلي فوري، معزول بالمحفظة

  function _uerr(msg) { return new Error(msg); }
  function _key(addr) { return AGENT_KEY_PREFIX + addr.toLowerCase(); }
  function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function _lrKey(addr, name) { return addr.toLowerCase() + '::' + (name || UNNAMED_KEY); }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function _setBusy(v) {
    _busy = v;
    const body = document.getElementById('agBody');
    if (body) body.classList.toggle('ag-busy', v);
  }

  function _pruneLocalOverrides() {
    const now = Date.now();
    for (const [k, t] of _locallyRevoked) {
      if (now - t > LOCAL_OVERRIDE_MS) _locallyRevoked.delete(k);
    }
  }

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
            pk: m.pk, agentAddress: m.agentAddress, agentName: m.agentName || SLOT_NAMES[0],
            createdAt: m.createdAt || Date.now(), validUntil: null,
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

  function _isValidLocal(rec) {
    if (!rec || !rec.pk) return false;
    if (!rec.validUntil) return true;
    return Date.now() < rec.validUntil;
  }

  /* ════ extraAgents — حقيقة الخادم الوحيدة لكل وكيل مُسمّى + غير مُسمّى ════ */
  async function _fetchExtraAgents(addr) {
    try {
      const r = await hlInfo({ type: 'extraAgents', user: addr });
      return Array.isArray(r) ? r : [];
    } catch { return null; } // null = فشل شبكة — لا نفترض فراغاً أبداً
  }

  /* ✅ v6 — تأكيد تفاؤلي إضافي فقط: يُعيد true/false، لا يرمي أبداً.
     status:'ok' من _signApprove هو دليل النجاح الفعلي؛ هذه الدالة فقط
     تُحدِّث الواجهة بدقّة أكبر لو القراءة لحقت خلال المهلة. */
  async function _verifyAgentState(addr, predicate, delays) {
    for (const d of delays) {
      await _sleep(d);
      const list = await _fetchExtraAgents(addr);
      if (Array.isArray(list) && predicate(list)) return true;
    }
    return false;
  }

  function _reconcile(addr, local, serverList) {
    if (!Array.isArray(serverList)) return local;
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

  /* ════ نافذة التفويض — ذاتية الحقن، للتفعيل فقط (الحذف يمر مباشرة عبر
     _confirm الأحمر ثم التوقيع). ════ */
  function _confirmApproval(agentAddress, name) {
    return new Promise((resolve, reject) => {
      const box   = document.getElementById('agApproveModal');
      const okBtn = document.getElementById('agApproveConfirm');
      const noBtn = document.getElementById('agApproveCancel');
      if (!box || !okBtn || !noBtn) {
        console.error('[agents.js] عناصر نافذة التفويض الذاتية غير موجودة — تحقق من ترتيب تحميل agents.js');
        reject(_uerr('تعذّر فتح نافذة التفويض — أعد تحميل الصفحة وحاول مجدداً'));
        return;
      }
      setTxt('agApprovePreview', `${name} — ${agentAddress}`);
      box.classList.add('open');
      okBtn.onclick = () => { box.classList.remove('open'); resolve(); };
      noBtn.onclick = () => { box.classList.remove('open'); reject(new Error('CANCELLED')); };
    });
  }

  /* ════ توقيع approveAgent موحَّد — للتفعيل وللحذف معاً. realName فارغ/
     null = الوكيل غير المُسمّى. يطابق approve_agent الرسمي حرفياً:
     التوقيع يُحسَب بحقل agentName حاضراً (فارغاً لو بلا اسم)، ثم الحقل
     يُحذف كلياً من الحمولة المُرسَلة لحالة "بلا اسم" تحديداً.
     status:'ok' هنا = الفعل الرسمي الوحيد الموثّق لإثبات النجاح؛ أي
     استدعاء لاحق لهذه الدالة لا يرمي يعني أن الكتابة نجحت فعلياً. ════ */
  async function _signApprove(agentAddress, realName, validUntilMs, nonce) {
    const nameOnChain = realName ? `${realName} valid_until ${validUntilMs}` : '';
    const action = {
      type: 'approveAgent', hyperliquidChain: 'Mainnet', signatureChainId: '0xa4b1',
      agentAddress, agentName: nameOnChain, nonce,
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
      { hyperliquidChain: 'Mainnet', agentAddress, agentName: nameOnChain, nonce }
    );
    const { r, s, v } = ethers.Signature.from(sig);
    if (!realName) delete action.agentName;
    const body = { action, nonce, signature: { r, s, v } };
    const d = HL.isOpen() ? await HL.post(body, true).catch(() => _restExchange(body)) : await _restExchange(body);
    if (d.status !== 'ok') throw new Error(typeof d.response === 'string' ? d.response : JSON.stringify(d));
  }

  /* تُفعِّل خانة ثابتة بعينها (وكيل-1/2/3) بمفتاح جديد كلياً — توقيع
     واحد. status:'ok' يعني الوكيل مسجَّل فعلاً عند الخادم فوراً — نبدأ
     استخدامه محلياً مباشرة بلا انتظار قراءة extraAgents (تلك تأكيد
     تفاؤلي إضافي فقط، لا بوابة). ════ */
  async function _activateSlot(addr, slotName) {
    const agent = ethers.Wallet.createRandom();
    await _confirmApproval(agent.address, slotName);

    showLoader('بانتظار توقيعك...');
    try {
      const nonce = Date.now();
      const validUntil = nonce + AGENT_TTL_MS;
      await _signApprove(agent.address, slotName, validUntil, nonce);

      const rec = { pk: agent.privateKey, agentAddress: agent.address, agentName: slotName, createdAt: nonce, validUntil };
      const all = _loadAll(addr).filter(a => a.agentName !== slotName);
      all.push(rec); _saveAll(addr, all);
      State.agent = agent;
      _locallyRevoked.delete(_lrKey(addr, slotName)); // ✅ يُلغي أي تعليم "أُبطل للتو" سابق لنفس الاسم بنفس الجلسة

      showLoader('جاري التأكد من الخادم...');
      const confirmed = await _verifyAgentState(
        addr,
        list => list.some(s => s.name === slotName && (s.address || '').toLowerCase() === agent.address.toLowerCase()),
        VERIFY_DELAYS
      );
      if (!confirmed) console.warn('[agents.js] لم يظهر', slotName, 'عبر extraAgents خلال المهلة رغم قبول التوقيع (status:ok) — الوكيل مفعَّل فعلياً، القراءة فقط متأخرة.');

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
      const usable = local.filter(_isValidLocal).sort((a, b) => b.createdAt - a.createdAt)[0];
      if (usable) {
        _fetchExtraAgents(addr).then(sl => _reconcile(addr, _loadAll(addr), sl)); // مزامنة صامتة بالخلفية
        try { State.agent = new ethers.Wallet(usable.pk); return State.agent; } catch {}
      }
    }

    const serverList = await _fetchExtraAgents(addr);
    local = _reconcile(addr, local, serverList);

    if (!forceNew) {
      const stillValid = local.filter(_isValidLocal).sort((a, b) => b.createdAt - a.createdAt)[0];
      if (stillValid) { try { State.agent = new ethers.Wallet(stillValid.pk); return State.agent; } catch {} }
    }

    const now = Date.now();
    const byName = {};
    (serverList || []).forEach(s => { if (s.name) byName[s.name] = s; });
    /* ✅ v6 — خانة أُبطلت للتو محلياً (ضمن نافذة العرض المتفائل) تُعتبر
       فارغة فوراً هنا أيضاً، حتى لو extraAgents ما زالت تُظهر المفتاح
       المهمَل بصلاحيته القصيرة المتبقية — بلا هذا، محاولة تداول فورية
       بعد حذف يدوي قد تفشل بخطأ "الخانات الثلاث مشغولة" زوراً. */
    const emptySlot = SLOT_NAMES.find(n => {
      if (_locallyRevoked.has(_lrKey(addr, n))) return true;
      const s = byName[n];
      return !s || (s.validUntil && s.validUntil <= now);
    });
    if (!emptySlot) throw _uerr('الخانات الثلاث كلها مُشغولة الآن بوكلاء صالحين — احذف واحداً من قسم "الوكلاء" أولاً');
    return _activateSlot(addr, emptySlot);
  }

  /* ════ حذف حقيقي بتوقيع — لا يحتاج مفتاح الوكيل المحذوف إطلاقاً، فقط
     اسمه الحقيقي (من extraAgents) وتوقيع واحد من المحفظة الرئيسية.
     ✅ v6 — status:'ok' من _signApprove هو النجاح الفعلي؛ الدالة الآن
     تُحدِّث التخزين المحلي فوراً بعده مباشرة (لا تنتظر أي قراءة لاحقة)
     وتُعيد قيمة منطقية تصف فقط ما إذا لحقت extraAgents بالتأكيد خلال
     المهلة الإضافية — لا ترمي أبداً بسبب بطء القراءة وحدها. المفتاح
     المهمَل الجديد يأخذ صلاحية قصيرة (REVOKE_GRACE_MS) لأي اسم حقيقي،
     فتختفي الخانة فعلياً من app.hyperliquid.xyz/API خلال دقيقتين بدل
     180 يوماً (راجع تعليق رأس الملف لتفصيل السبب الجذري). ════ */
  async function revokeOne(address, agentAddress, realName) {
    const addr = address || State.wallet?.address;
    if (!addr || !State.wallet) throw _uerr('سجّل الدخول أولاً');

    const throwaway = ethers.Wallet.createRandom();
    const nonce = Date.now();
    const validUntil = realName ? (nonce + REVOKE_GRACE_MS) : (nonce + AGENT_TTL_MS);
    await _signApprove(throwaway.address, realName || null, validUntil, nonce);

    /* الكتابة نجحت فعلياً عند الخادم — هذا مؤكَّد الآن، لا افتراضاً */
    _saveAll(addr, _loadAll(addr).filter(a => a.agentAddress.toLowerCase() !== agentAddress.toLowerCase()));
    if (State.agent?.address?.toLowerCase() === agentAddress.toLowerCase()) State.agent = null;
    _locallyRevoked.set(_lrKey(addr, realName), Date.now());

    const confirmed = await _verifyAgentState(
      addr,
      list => !list.some(s => (s.address || '').toLowerCase() === agentAddress.toLowerCase() && (realName ? s.name === realName : !s.name)),
      VERIFY_DELAYS
    );
    return confirmed;
  }

  /* حذف محلي جماعي فقط — يُستخدم حصراً بمسار "نسيت رمز PIN" (تنظيف
     طارئ، بلا توقيعات متعددة بلحظة طوارئ). الوكلاء الفعليون يبقون
     صالحين عند Hyperliquid حتى انتهاء صلاحيتهم، أو يمكن حذفهم لاحقاً
     بأمان من هنا (revokeOne). */
  function revoke(address) {
    const addr = address || State.wallet?.address;
    if (!addr) return;
    _saveAll(addr, []);
    if (State.wallet?.address?.toLowerCase() === addr.toLowerCase()) State.agent = null;
    _refreshUI();
  }

  function clearSession() { State.agent = null; }

  function getInfo(address) {
    const addr = address || State.wallet?.address;
    if (!addr) return null;
    const best = _loadAll(addr).filter(_isValidLocal).sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!best) return null;
    const expiresAt = best.validUntil || (best.createdAt + AGENT_TTL_MS);
    return {
      name: best.agentName, address: best.agentAddress, createdAt: best.createdAt,
      expiresAt, daysLeft: Math.max(0, Math.ceil((expiresAt - Date.now()) / 86400000)),
      valid: _isValidLocal(best),
    };
  }

  /* ✅ v6.1 — FIX: كانت المقارنة حساسة لحالة الأحرف (===) بينما كل مقارنة
     عنوان أخرى بالملف تُطبَّع بـ.toLowerCase() أولاً. extraAgents يُعيد
     العنوان بصيغة تختلف حالة أحرفها عن ethers.Wallet.createRandom().address
     المخزَّن محلياً (checksummed/mixed-case) — فالمطابقة الحرفية كانت تفشل
     دائماً لزر "🔗 رابط" بالبطاقة الرئيسية (يستدعي buildLink(row.address)
     مباشرة من عنوان الخادم)، بينما مسار "🔑 المفتاح"→"نسخ رابط" كان يعمل
     لأنه يمرّ بمقارنة مُطبَّعة بمكان آخر (_wireActions: act==='key') ثم
     يُمرِّر rec الجاهز مباشرة لـ_showReveal بلا أي استدعاء لـbuildLink
     إطلاقاً. */
  function buildLink(agentAddress, target) {
    if (!State.wallet || typeof AgentLink === 'undefined' || !agentAddress) return null;
    const needle = agentAddress.toLowerCase();
    const rec = _loadAll(State.wallet.address).find(a => a.agentAddress.toLowerCase() === needle);
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
.ag-hdr-btns{display:flex;align-items:center;gap:6px;}
.ag-close{width:30px;height:30px;border-radius:50%;border:1.5px solid rgba(255,255,255,.14);
  background:rgba(255,255,255,.06);color:var(--text-primary,#f1f5f9);font-size:15px;
  display:flex;align-items:center;justify-content:center;cursor:pointer;transition:transform .12s;}
.ag-close:active{transform:scale(.88);}
.ag-body{padding:16px 18px 22px;transition:opacity .15s;}
.ag-body.ag-busy{opacity:.55;pointer-events:none;}
.ag-sec-title{font-size:11px;font-weight:800;color:#94a3b8;letter-spacing:.6px;
  text-transform:uppercase;margin:16px 0 8px;}
.ag-sec-title:first-child{margin-top:0;}
.ag-card-box{background:var(--bg-card,#1e293b);border:1px solid rgba(255,255,255,.08);
  border-radius:14px;padding:14px;margin-bottom:10px;transition:border-color .15s;}
.ag-row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;
  border-bottom:1px solid rgba(255,255,255,.06);font-size:13px;gap:10px;}
.ag-row:last-child{border-bottom:none;}
.ag-row-k{color:#94a3b8;font-weight:700;flex-shrink:0;display:flex;align-items:center;gap:5px;flex-wrap:wrap;}
.ag-row-v{font-family:'IBM Plex Mono',monospace;font-weight:800;color:var(--text-primary,#f1f5f9);
  direction:ltr;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ag-status{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:800;
  padding:3px 10px;border-radius:99px;white-space:nowrap;flex-shrink:0;}
.ag-status.ok{background:rgba(16,185,129,.16);color:#10b981;}
.ag-status.warn{background:rgba(245,158,11,.16);color:#f59e0b;}
.ag-status.bad{background:rgba(239,68,68,.16);color:#ef4444;}
.ag-foreign-tag{font-size:10px;font-weight:800;color:#94a3b8;background:rgba(148,163,184,.14);
  padding:2px 8px;border-radius:99px;white-space:nowrap;}
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
      <div class="ag-hdr-btns">
        <button class="ag-close" id="agRefresh" title="تحديث من الخادم">🔄</button>
        <button class="ag-close" id="agClose" title="إغلاق">✕</button>
      </div>
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

  function _regRow(row) {
    const id = 'r' + (_rowSeq++);
    _rowRegistry.set(id, row);
    return id;
  }

  function _slotCardHtml(row) {
    if (row.empty) {
      return `
        <div class="ag-card-box">
          <div class="ag-row"><span class="ag-row-k">${_esc(row.realName)}</span><span class="ag-status" style="background:rgba(148,163,184,.14);color:#94a3b8;">○ فارغة</span></div>
          <button class="ag-btn rot wide" data-slot-activate="${_esc(row.realName)}" style="margin-top:10px;">⚡ تفعيل ${_esc(row.realName)}</button>
        </div>`;
    }
    return _agentCardHtml(row);
  }

  function _agentCardHtml(row) {
    const now = Date.now();
    const valid = !row.expiresAt || row.expiresAt > now;
    const daysLeft = row.expiresAt ? Math.max(0, Math.ceil((row.expiresAt - now) / 86400000)) : null;
    const statusCls = !valid ? 'bad' : (daysLeft !== null && daysLeft <= 14) ? 'warn' : 'ok';
    const statusTxt = !valid ? 'منتهي' : (daysLeft !== null && daysLeft <= 14) ? 'ينتهي قريباً' : 'نشط';
    const label = row.realName || 'بلا اسم (افتراضي)';
    const rowId = _regRow(row);

    const actions = row.hasKey
      ? `<div class="ag-actions-3">
           <button class="ag-btn rot" data-act="link" data-row-id="${rowId}">🔗 رابط</button>
           <button class="ag-btn" data-act="key" data-row-id="${rowId}">🔑 المفتاح</button>
           <button class="ag-btn del" data-act="del" data-row-id="${rowId}">🗑 حذف</button>
         </div>`
      : `<div class="ag-actions-3" style="grid-template-columns:1fr;">
           <button class="ag-btn del" data-act="del" data-row-id="${rowId}">🗑 حذف — يُبطله عند Hyperliquid</button>
         </div>`;

    return `
      <div class="ag-card-box">
        <div class="ag-row"><span class="ag-row-k">${_esc(label)}${row.hasKey ? '' : ' <span class="ag-foreign-tag">🌐 من مكان آخر</span>'}</span><span class="ag-status ${statusCls}">● ${statusTxt}</span></div>
        <div class="ag-row"><span class="ag-row-k">تاريخ الانتهاء</span><span class="ag-row-v">${row.expiresAt ? _fmtDate(row.expiresAt) : '—'}</span></div>
        ${daysLeft !== null ? `<div class="ag-row"><span class="ag-row-k">الأيام المتبقية</span><span class="ag-row-v">${daysLeft} يوم</span></div>` : ''}
        <div class="ag-addr-box">
          <span class="ag-addr-txt">${_esc(row.address)}</span>
          <button class="ag-copy-btn" data-copy="${_esc(row.address)}" title="نسخ">⧉</button>
        </div>
        ${actions}
      </div>`;
  }

  async function _buildRows(addr) {
    _pruneLocalOverrides();
    const serverList = await _fetchExtraAgents(addr);
    const local = _loadAll(addr);
    const localByAddr = {};
    local.forEach(r => { localByAddr[r.agentAddress.toLowerCase()] = r; });

    if (!Array.isArray(serverList)) {
      const slotRows = SLOT_NAMES.map(n => {
        if (_locallyRevoked.has(_lrKey(addr, n))) return { realName: n, empty: true };
        const rec = local.find(r => r.agentName === n);
        return rec
          ? { realName: n, address: rec.agentAddress, expiresAt: rec.validUntil, hasKey: true, empty: false }
          : { realName: n, empty: true };
      });
      const otherRows = local
        .filter(r => !SLOT_NAMES.includes(r.agentName))
        .map(r => ({ realName: r.agentName, address: r.agentAddress, expiresAt: r.validUntil, hasKey: true }));
      return { slotRows, otherRows, networkFailed: true };
    }

    const now = Date.now();
    const byName = {};
    serverList.forEach(s => { if (s.name) byName[s.name] = s; });

    const slotRows = SLOT_NAMES.map(slotName => {
      if (_locallyRevoked.has(_lrKey(addr, slotName))) return { realName: slotName, empty: true };
      const s = byName[slotName];
      const valid = s && (!s.validUntil || s.validUntil > now);
      if (!valid) return { realName: slotName, empty: true };
      const rec = localByAddr[(s.address || '').toLowerCase()];
      return { realName: slotName, address: s.address, expiresAt: s.validUntil || null, hasKey: !!rec, empty: false };
    });

    const otherRows = serverList
      .filter(s => !(s.name && SLOT_NAMES.includes(s.name)))
      .filter(s => !_locallyRevoked.has(_lrKey(addr, s.name || null)))
      .map(s => {
        const rec = localByAddr[(s.address || '').toLowerCase()];
        return { realName: s.name || null, address: s.address, expiresAt: s.validUntil || null, hasKey: !!rec };
      });

    return { slotRows, otherRows, networkFailed: false };
  }

  async function _render() {
    if (_renderInFlight) { _renderAgainPending = true; return; }
    _renderInFlight = true;
    try {
      await _renderImpl();
    } finally {
      _renderInFlight = false;
      if (_renderAgainPending) { _renderAgainPending = false; _render(); }
    }
  }

  async function _renderImpl() {
    const body = document.getElementById('agBody');
    if (!body || !State.wallet) return;
    const addr = State.wallet.address;

    if (!body.dataset.rendered) {
      body.innerHTML = `<div class="ag-empty">⏳ جاري جلب الوكلاء من Hyperliquid...</div>`;
    }

    _rowRegistry = new Map(); // ✅ يُعاد بناؤه بالكامل كل رسم — لا مراجع قديمة معلَّقة
    const { slotRows, otherRows, networkFailed } = await _buildRows(addr);
    if (!document.getElementById('agModal')?.classList.contains('open')) return; // أُغلقت أثناء الجلب

    const otherHtml = otherRows.length
      ? `<div class="ag-sec-title">وكلاء أخرى مرتبطة بحسابك</div>${otherRows.map(_agentCardHtml).join('')}`
      : '';

    body.innerHTML = `
      <div class="ag-sec-title">الوكلاء</div>
      ${networkFailed ? `<div class="ag-note" style="border-color:rgba(239,68,68,.3);background:rgba(239,68,68,.06);">⚠️ تعذّر الاتصال بـ Hyperliquid الآن — الحالة أدناه من آخر ما هو معروف بهذا الجهاز فقط.</div>` : ''}
      ${slotRows.map(_slotCardHtml).join('')}
      ${otherHtml}
      <div class="ag-note">
        🛡 كل وكيل يوقّع الصفقات فقط — لا يقدر إطلاقاً على سحب أو تحويل أموالك. Hyperliquid يسمح بحد أقصى 3 وكلاء مُسمّين لكل حساب — لهذا 3 خانات ثابتة فقط. حذف أي وكيل من هنا يُبطله فعلياً عند Hyperliquid (توقيع واحد) بصرف النظر عن مكان إنشائه، ويختفي نهائياً من app.hyperliquid.xyz/API خلال دقيقتين تقريباً (يُستبدل مؤقتاً بمفتاح مُهمَل غير قابل للاستخدام إطلاقاً — هذا وحده، لا "عدم حذف"، ما قد تراه هناك لبضع دقائق).
      </div>`;

    body.dataset.rendered = '1';
    _wireActions();
  }

  function _showAgentError(e) {
    if (!e || e.message === 'CANCELLED') return;
    const msg = typeof errToAr === 'function' ? errToAr(e.message) : e.message;
    toast('⚠️ ' + msg, 'err', 6000);
  }

  function _wireActions() {
    document.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => _copy(b.dataset.copy)));

    document.querySelectorAll('[data-slot-activate]').forEach(b => b.addEventListener('click', async () => {
      if (_busy) return;
      _setBusy(true);
      const slot = b.dataset.slotActivate;
      try { await _activateSlot(State.wallet.address, slot); }
      catch (e) { _showAgentError(e); }
      finally { _setBusy(false); _refreshUI(); }
    }));

    document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
      if (_busy) return;
      const row = _rowRegistry.get(b.dataset.rowId);
      const act = b.dataset.act;
      if (!row) return;

      if (act === 'link') {
        const link = buildLink(row.address);
        link ? _copy(link) : toast('تعذّر توليد الرابط', 'err');
      } else if (act === 'key') {
        const rec = _loadAll(State.wallet.address).find(a => a.agentAddress.toLowerCase() === row.address.toLowerCase());
        _showReveal(rec);
      } else if (act === 'del') {
        _setBusy(true);
        _confirm(
          'سيتطلب هذا توقيعاً واحداً من محفظتك لإبطال الوكيل فعلياً عند Hyperliquid — لن يعود صالحاً للتداول بأي مكان بعدها. صفقاتك المفتوحة تبقى كما هي. سيختفي اسمه من app.hyperliquid.xyz/API خلال دقيقتين تقريباً (وقت انتشار طبيعي، وليس علامة فشل).',
          async () => {
            showLoader('بانتظار توقيعك...');
            try {
              const confirmed = await revokeOne(State.wallet.address, row.address, row.realName);
              toast(confirmed
                ? '🗑 تم الإبطال وتأكَّد من خادم Hyperliquid ✅'
                : '🗑 تم إرسال الإبطال بنجاح — سيختفي من app.hyperliquid.xyz خلال دقيقتين', 'ok', 5500);
            } catch (e) {
              _showAgentError(e);
            } finally {
              hideLoader();
              _setBusy(false);
              _refreshUI();
            }
          },
          () => { _setBusy(false); }
        );
      }
    }));
  }

  function _showReveal(rec) {
    if (!rec) return;
    const box = document.getElementById('agReveal');
    if (!box) { console.error('[agents.js] #agReveal غير موجود'); return; }
    const link = typeof AgentLink !== 'undefined' ? AgentLink.build(State.wallet.address, rec.pk) : null;
    setTxt('agRevealTitle', `🔑 ${rec.agentName || 'بلا اسم'}`);
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

  function _confirm(msg, onYes, onNo) {
    const box = document.getElementById('agConfirm');
    if (!box) { console.error('[agents.js] #agConfirm غير موجود'); return; }
    setTxt('agConfirmTxt', msg);
    box.classList.add('open');
    const noBtn = document.getElementById('agConfirmNo'), yesBtn = document.getElementById('agConfirmYes');
    if (noBtn)  noBtn.onclick  = () => { box.classList.remove('open'); if (onNo) onNo(); };
    if (yesBtn) yesBtn.onclick = () => { box.classList.remove('open'); onYes(); };
  }

  function _refreshUI() { if (document.getElementById('agModal')?.classList.contains('open')) _render(); }

  function _open() {
    if (State.isGuest || !State.wallet) { toast('سجّل الدخول أولاً', 'err'); return; }
    document.getElementById('agModal')?.classList.add('open');
    const body = document.getElementById('agBody');
    if (body) body.dataset.rendered = '';
    _render();
    clearInterval(_tickTimer);
    _tickTimer = setInterval(_render, 30000);
  }
  function _close() {
    document.getElementById('agModal')?.classList.remove('open');
    document.getElementById('agConfirm')?.classList.remove('open');
    document.getElementById('agReveal')?.classList.remove('open');
    document.getElementById('agApproveModal')?.classList.remove('open');
    clearInterval(_tickTimer);
    _setBusy(false); // ✅ أمان إضافي لو أُغلقت النافذة أثناء عملية معلَّقة
  }

  document.getElementById('agClose')?.addEventListener('click', _close);
  document.getElementById('agRefresh')?.addEventListener('click', () => {
    if (_busy) return;
    const body = document.getElementById('agBody');
    if (body) body.dataset.rendered = '';
    _render();
  });
  document.getElementById('agModal')?.addEventListener('click', (e) => { if (e.target.id === 'agModal') _close(); });

  window.Agents = {
    ensure, revoke, revokeOne, clearSession, getInfo, buildLink,
    openModal: _open, closeModal: _close, TTL_MS: AGENT_TTL_MS,
  };
})();
