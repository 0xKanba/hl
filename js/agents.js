
/* ═══════════════════════════════════════════════════════════════
   agents.js — إدارة محافظ الوكلاء (Hyperliquid Agent/API Wallets) — v4

   ⚠️ السبب المباشر لهذا الإصدار — تجربة حقيقية أبلغ عنها المستخدم: إنشاء
   0x1/0x2/0x3 ثم حذف 0x1 و0x2، فمحاولة إنشاء 0x4 كانت تُرفض بـ"وكلاء
   كثيرة الآن" رغم الحذف. السبب الجذري: "الحذف" (إعادة اعتماد نفس الاسم
   بمفتاح عشوائي مُهمَل) يضع مع ذلك المفتاح صلاحية 180 يوماً كاملة (تماماً
   كأي اعتماد عادي — ضرورية لضمان قبول الخادم للحذف نفسه). فحص السعة
   القديم كان يعتمد فقط على validUntil من الخادم، فيرى تلك الخانة
   "مُشغولة وصالحة" رغم أنها فعلياً فارغة (لا أحد يملك ذلك المفتاح
   العشوائي). الحل: تتبّع محلي صريح لكل اسم حرّرناه نحن بأنفسنا
   (hl_agent_freed_<addr>) — يُعامَل كفارغ فعلياً بصرف النظر عمّا يُظهره
   validUntil، ويُزال من القائمة تلقائياً حين يُعاد استخدامه لاحقاً.

   ⚠️ إصلاح إضافي مصاحب — تصادم أسماء بين أجهزة مختلفة لنفس المحفظة:
   بما أن الاسم الحقيقي المُرسَل لـHyperliquid صار مطابقاً للرقم المتسلسل
   المعروض (0x1، 0x2...)، وهذا الرقم يُولَّد من عدّاد محلي بحت لكل جهاز/
   متصفح على حدة — جهازان مختلفان بنفس المحفظة (كلاهما بعدّاد يبدأ من
   الصفر) قد يحاولان كلاهما اعتماد "0x1" فيُسقط أحدهما الآخر صامتاً (نفس
   عطل "وكيلان بجهازين" التاريخي بهذا المشروع). الإصلاح: قبل التوقيع،
   يُتحقَّق من extraAgents الحقيقي أن الاسم المُقترَح غير مُستخدَم فعلياً
   على الخادم (بأي جهاز)؛ لو كان مُستخدَماً، يُتخطّى تلقائياً للرقم التالي.

   🔍 التحقق المباشر (بحث فعلي 2026-09، لا افتراض) — exchange-endpoint
   ونونces-and-api-wallets فُحصا مباشرة:
   • حساب واحد: وكيل غير مُسمّى واحد + حتى 3 وكلاء مُسمّين — رقم حقيقي
     موثّق، يُستخدَم هنا فقط كتلميح لاختيار الاسم قبل التوقيع (تفادي
     توقيعين بالحالة الشائعة)، لا حاجزاً يمنع الإنشاء.
   • آلية الإبطال المبكر الوحيدة الموثّقة: إرسال ApproveAgent بنفس الاسم
     الحقيقي القائم فعلاً — يستبدل حامله السابق (يشمل الوكيل غير المُسمّى
     أيضاً، بإرسال ApproveAgent بلا حقل agentName إطلاقاً — يطابق تماماً
     approve_agent الرسمي بـPython SDK: التوقيع يُحسَب بقيمة فارغة أولاً،
     ثم يُحذف الحقل من الحمولة المُرسَلة تحديداً لهذه الحالة).

   ✅ القائمة تُبنى دائماً من extraAgents (حقيقة الخادم) — أي وكيل مرتبط
   بالمحفظة الرئيسية فعلياً يظهر، بصرف النظر عن مصدر إنشائه (هذا التطبيق،
   الموقع الرسمي مباشرة، أو جهاز آخر) — تطابق تام مع app.hyperliquid.xyz
   API. الحذف لا يحتاج مفتاح الوكيل نفسه إطلاقاً، فقط توقيع من المحفظة
   الرئيسية — فأي وكيل بالقائمة قابل للحذف من هنا. 🔗 رابط تداول و🔑 كشف
   المفتاح يظهران فقط للوكلاء التي أنشأها هذا المتصفح (نملك مفتاحها).

   ✅ الإنشاء لا يُرفض أبداً من جهة التطبيق نفسه: اسم جديد كلياً (0xN)
   لو وُجدت مساحة حقيقية الآن، وإلا إعادة استخدام خانة قائمة تلقائياً
   (أولوية لما حرّرناه نحن بأنفسنا، ثم الأقدم انتهاءً) — توقيع واحد. رفض
   حقيقي من الخادم رغم كل هذا (احتياط أخير) يُعالَج بتراجع تلقائي فوري،
   لا بإظهار خطأ لمحاولة أولى فقط.

   ✅ تبسيط الواجهة — بطاقة كل وكيل: 🔗 رابط · 🔑 المفتاح (فقط لو نملكه
   محلياً) · 🗑 حذف (دائماً). حُذف: تصدير/استيراد JSON، التفعيل اليدوي
   (أحدث وكيل صالح محلياً يُستخدَم تلقائياً للتوقيع)، صندوق عنوان المحفظة.

   ✅ عزل كامل بين المحافظ بلا تغيير — كل تخزين محلي (مفاتيح الوكلاء،
   عدّاد الاسم، أسماء المُحرَّرة) مفتاح بعنوان المحفظة.
═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const AGENT_TTL_MS        = 180 * 24 * 3600 * 1000; // الحد الأقصى الموثّق رسمياً لـvalid_until
  const AGENT_KEY_PREFIX    = 'hl_agents_';       // مصفوفة الوكلاء التي نملك مفاتيحها محلياً، لكل محفظة
  const AGENT_KEY_PREFIX_V1 = 'hl_agent_';        // v1 القديم: كائن وكيل مفرد (يُرحَّل تلقائياً)
  const SEQ_KEY_PREFIX      = 'hl_agent_seq_';    // عدّاد الاسم الجديد كلياً (0x1، 0x2...) — محلي بحت
  const FREED_KEY_PREFIX    = 'hl_agent_freed_';  // أسماء حرّرناها نحن بأنفسنا (راجع تعليق رأس الملف)
  const NAMED_DOC_CAP       = 3; // تلميح فقط — راجع تعليق رأس الملف

  let _ensurePromise = null;
  let _tickTimer     = null;

  function _uerr(msg) { return new Error(msg); }
  function _key(addr)      { return AGENT_KEY_PREFIX + addr.toLowerCase(); }
  function _seqKey(addr)   { return SEQ_KEY_PREFIX + addr.toLowerCase(); }
  function _freedKey(addr) { return FREED_KEY_PREFIX + addr.toLowerCase(); }

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
            pk: m.pk, agentAddress: m.agentAddress, agentName: m.agentName || 'agent-1',
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

  /* ════ عدّاد الاسم الجديد — محلي بحت، يزيد فقط عند نجاح اسم جديد فعلاً
     (لا عند إعادة استخدام)، بلا فجوات، بلا تراجع أبداً ════ */
  function _peekNextFreshSeq(addr) {
    return (parseInt(localStorage.getItem(_seqKey(addr)) || '0', 10) || 0) + 1;
  }
  function _consumeFreshSeqAtLeast(addr, n) {
    const cur = parseInt(localStorage.getItem(_seqKey(addr)) || '0', 10) || 0;
    if (n > cur) { try { localStorage.setItem(_seqKey(addr), String(n)); } catch {} }
  }

  /* ════ أسماء حرّرناها نحن بأنفسنا صراحة (بالحذف) — راجع تعليق رأس
     الملف لسبب الحاجة لهذا التتبّع المنفصل عن validUntil ════ */
  function _loadFreedNames(addr) {
    try { return new Set(JSON.parse(localStorage.getItem(_freedKey(addr)) || '[]')); } catch { return new Set(); }
  }
  function _saveFreedNames(addr, set) { try { localStorage.setItem(_freedKey(addr), JSON.stringify([...set])); } catch {} }
  function _markFreed(addr, name) {
    if (!name) return;
    const s = _loadFreedNames(addr);
    if (!s.has(name)) { s.add(name); _saveFreedNames(addr, s); }
  }
  function _unmarkFreed(addr, name) {
    if (!name) return;
    const s = _loadFreedNames(addr);
    if (s.delete(name)) _saveFreedNames(addr, s);
  }

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

  /* خلفية: يُحدّث/يُطهّر السجل المحلي (مفاتيحنا فقط) حسب حقيقة الخادم —
     يخدم فقط تسريع مسار التوقيع بـ_ensureImpl؛ عرض القائمة الكاملة
     بالواجهة يُبنى من extraAgents مباشرة في كل مرة (راجع _buildRows). */
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

  /* يُصنِّف كل الوكلاء المُسمّين الحاليين حسب حقيقة الخادم: "مُشغولة
     فعلاً" (لا يزال أحدهم يريدها) مقابل "قابلة لإعادة الاستخدام"
     (منتهية فعلاً حسب validUntil، أو حرّرناها نحن بأنفسنا). */
  function _classifyServerAgents(addr, serverList) {
    const now = Date.now();
    const freed = _loadFreedNames(addr);
    const local = _loadAll(addr);
    const localAddrs = new Set(local.map(r => r.agentAddress.toLowerCase()));
    const namedEntries = (serverList || []).filter(s => !!s.name);
    const trulyOccupied = [], reusable = [];
    namedEntries.forEach(s => {
      const expired = s.validUntil && s.validUntil <= now;
      if (expired || freed.has(s.name)) reusable.push(s); else trulyOccupied.push(s);
    });
    return { namedEntries, trulyOccupied, reusable, localAddrs };
  }

  async function _pickReuseFallback(addr) {
    const serverList = await _fetchExtraAgents(addr);
    if (!Array.isArray(serverList)) return null;
    const { reusable, localAddrs } = _classifyServerAgents(addr, serverList);
    if (!reusable.length) return null;
    const foreign = reusable.filter(s => !localAddrs.has((s.address || '').toLowerCase()));
    const pool = foreign.length ? foreign : reusable;
    return pool.slice().sort((a, b) => (a.validUntil || 0) - (b.validUntil || 0))[0].name;
  }

  /* القرار الرئيسي قبل أي توقيع إنشاء: اسم جديد كلياً لو وُجدت مساحة
     حقيقية الآن (بعد استبعاد ما حرّرناه نحن من "المُشغول")، أو إعادة
     استخدام خانة قائمة لو كانت ممتلئة فعلياً — بلا رفض، بلا سؤال. */
  async function _pickNamedApproach(addr) {
    const serverList = await _fetchExtraAgents(addr);
    if (!Array.isArray(serverList)) {
      const n = _peekNextFreshSeq(addr);
      return { name: '0x' + n, seqUsed: n, fresh: true };
    }
    const { namedEntries, trulyOccupied, reusable, localAddrs } = _classifyServerAgents(addr, serverList);
    const allNames = new Set(namedEntries.map(s => s.name));

    if (trulyOccupied.length < NAMED_DOC_CAP) {
      let n = _peekNextFreshSeq(addr), candidate = '0x' + n, guard = 0;
      while (allNames.has(candidate) && guard < 200) { n++; candidate = '0x' + n; guard++; }
      return { name: candidate, seqUsed: n, fresh: true };
    }
    if (!reusable.length) return { name: null, fresh: false };
    const foreign = reusable.filter(s => !localAddrs.has((s.address || '').toLowerCase()));
    const pool = foreign.length ? foreign : reusable;
    return { name: pool.slice().sort((a, b) => (a.validUntil || 0) - (b.validUntil || 0))[0].name, fresh: false };
  }

  /* ════ نافذة التفويض — ذاتية الحقن، للإنشاء فقط (الحذف يمر مباشرة عبر
     _confirm الأحمر ثم التوقيع — لا شيء جديد ليُعاين). ════ */
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

  /* ════ توقيع approveAgent موحَّد — للإنشاء وللحذف معاً. realName فارغ/
     null = الوكيل غير المُسمّى. يطابق approve_agent الرسمي حرفياً:
     التوقيع يُحسَب بحقل agentName حاضراً (فارغاً لو بلا اسم)، ثم الحقل
     يُحذف كلياً من الحمولة المُرسَلة لحالة "بلا اسم" تحديداً — لا قبلها. ════ */
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

  async function _createAndApprove(addr) {
    const agent = ethers.Wallet.createRandom();
    const approach = await _pickNamedApproach(addr);
    if (!approach.name) throw _uerr('لا توجد خانة وكيل متاحة الآن حتى بإعادة الاستخدام — أعد المحاولة بعد قليل');
    await _confirmApproval(agent.address, approach.name);

    showLoader('بانتظار توقيعك...');
    try {
      let usedName = approach.name;
      let usedNonce = Date.now();
      let usedValidUntil = usedNonce + AGENT_TTL_MS;

      try {
        await _signApprove(agent.address, usedName, usedValidUntil, usedNonce);
      } catch (e1) {
        /* رفض حقيقي من الخادم (نادر لو approach.fresh) — تراجع تلقائي
           فوري لإعادة استخدام خانة قائمة، بلا إظهار خطأ لمحاولة أولى فقط. */
        if (!approach.fresh) throw e1;
        const fallback = await _pickReuseFallback(addr);
        if (!fallback) throw e1;
        usedName = fallback;
        usedNonce = Date.now();
        usedValidUntil = usedNonce + AGENT_TTL_MS;
        await _signApprove(agent.address, usedName, usedValidUntil, usedNonce);
      }

      if (approach.fresh && usedName === approach.name) _consumeFreshSeqAtLeast(addr, approach.seqUsed);
      _unmarkFreed(addr, usedName); // لم يعد فارغاً — أصبح مُستخدَماً فعلياً من جديد

      const rec = { pk: agent.privateKey, agentAddress: agent.address, agentName: usedName, createdAt: usedNonce, validUntil: usedValidUntil };
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

    return _createAndApprove(addr);
  }

  /* ════ حذف حقيقي بتوقيع — لا يحتاج مفتاح الوكيل المحذوف إطلاقاً، فقط
     اسمه الحقيقي (من extraAgents) وتوقيع واحد من المحفظة الرئيسية. يعيد
     اعتماد نفس الاسم بمفتاح عشوائي يُهمَل فوراً — Hyperliquid يستبدل
     حامل الاسم السابق بهذا الجديد، فيُبطل الوكيل المحذوف فعلياً بصرف
     النظر عن مصدر إنشائه. ════ */
  async function _revokeSigned(realName) {
    const throwaway = ethers.Wallet.createRandom();
    const nonce = Date.now();
    await _signApprove(throwaway.address, realName || null, nonce + AGENT_TTL_MS, nonce);
  }

  async function revokeOne(address, agentAddress, realName) {
    const addr = address || State.wallet?.address;
    if (!addr || !State.wallet) throw _uerr('سجّل الدخول أولاً');
    await _revokeSigned(realName);
    _markFreed(addr, realName); // ✅ يُصحِّح فحص السعة القادم فوراً — راجع تعليق رأس الملف
    _saveAll(addr, _loadAll(addr).filter(a => a.agentAddress.toLowerCase() !== agentAddress.toLowerCase()));
    if (State.agent?.address?.toLowerCase() === agentAddress.toLowerCase()) State.agent = null;
  }

  /* حذف محلي جماعي فقط — يُستخدم حصراً بمسار "نسيت رمز PIN" (تنظيف
     طارئ، بلا توقيعات متعددة بلحظة طوارئ). الوكلاء الفعليون يبقون
     صالحين عند Hyperliquid حتى انتهاء صلاحيتهم، أو يمكن حذفهم لاحقاً
     بأمان من هنا (revokeOne) من أي جهاز — القائمة تعرضهم دائماً بصرف
     النظر عن هذا المسح المحلي. */
  function revoke(address) {
    const addr = address || State.wallet?.address;
    if (!addr) return;
    _saveAll(addr, []);
    if (State.wallet?.address?.toLowerCase() === addr.toLowerCase()) State.agent = null;
    _refreshUI();
  }

  function clearSession() { State.agent = null; }

  /* أحدث وكيل صالح محلياً — فحص محلي سريع (بلا جولة شبكة)، يُستخدم
     داخلياً بـauth.js لتقرير هل يوجد مفتاح جاهز للتوقيع أصلاً. */
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

  function _agentCardHtml(row) {
    const now = Date.now();
    const valid = !row.expiresAt || row.expiresAt > now;
    const daysLeft = row.expiresAt ? Math.max(0, Math.ceil((row.expiresAt - now) / 86400000)) : null;
    const statusCls = !valid ? 'bad' : (daysLeft !== null && daysLeft <= 14) ? 'warn' : 'ok';
    const statusTxt = !valid ? 'منتهي' : (daysLeft !== null && daysLeft <= 14) ? 'ينتهي قريباً' : 'نشط';
    const label = row.realName || 'بلا اسم (افتراضي)';
    const nameAttr = row.realName ? row.realName.replace(/"/g, '&quot;') : '';

    const actions = row.hasKey
      ? `<div class="ag-actions-3">
           <button class="ag-btn rot" data-act="link" data-addr="${row.address}">🔗 رابط</button>
           <button class="ag-btn" data-act="key" data-addr="${row.address}">🔑 المفتاح</button>
           <button class="ag-btn del" data-act="del" data-addr="${row.address}" data-name="${nameAttr}">🗑 حذف</button>
         </div>`
      : `<div class="ag-actions-3" style="grid-template-columns:1fr;">
           <button class="ag-btn del" data-act="del" data-addr="${row.address}" data-name="${nameAttr}">🗑 حذف — يُبطله عند Hyperliquid</button>
         </div>`;

    return `
      <div class="ag-card-box">
        <div class="ag-row"><span class="ag-row-k">${label}${row.hasKey ? '' : ' <span class="ag-foreign-tag">🌐 من مكان آخر</span>'}</span><span class="ag-status ${statusCls}">● ${statusTxt}</span></div>
        <div class="ag-row"><span class="ag-row-k">تاريخ الانتهاء</span><span class="ag-row-v">${row.expiresAt ? _fmtDate(row.expiresAt) : '—'}</span></div>
        ${daysLeft !== null ? `<div class="ag-row"><span class="ag-row-k">الأيام المتبقية</span><span class="ag-row-v">${daysLeft} يوم</span></div>` : ''}
        <div class="ag-addr-box">
          <span class="ag-addr-txt">${row.address}</span>
          <button class="ag-copy-btn" data-copy="${row.address}" title="نسخ">⧉</button>
        </div>
        ${actions}
      </div>`;
  }

  /* ════ يبني القائمة الكاملة من extraAgents (حقيقة الخادم)، مع إخفاء
     أي اسم حرّرناه نحن بأنفسنا (بالنسبة للمستخدم هو محذوف فعلاً — راجع
     تعليق رأس الملف)، ودمج أي مفتاح محلي نملكه لنفس العنوان. ════ */
  async function _buildRows(addr) {
    const serverList = await _fetchExtraAgents(addr);
    const local = _loadAll(addr);
    const localByAddr = {};
    local.forEach(r => { localByAddr[r.agentAddress.toLowerCase()] = r; });

    if (Array.isArray(serverList)) {
      const freed = _loadFreedNames(addr);
      const rows = serverList
        .filter(s => !(s.name && freed.has(s.name)))
        .map(s => {
          const rec = localByAddr[(s.address || '').toLowerCase()];
          return { realName: s.name || null, address: s.address, expiresAt: s.validUntil || null, hasKey: !!rec };
        });
      rows.sort((a, b) => (b.expiresAt || 0) - (a.expiresAt || 0));
      return { rows, networkFailed: false };
    }

    const rows = local.map(r => ({ realName: r.agentName, address: r.agentAddress, expiresAt: r.validUntil, hasKey: true }));
    rows.sort((a, b) => (b.expiresAt || 0) - (a.expiresAt || 0));
    return { rows, networkFailed: true };
  }

  async function _render() {
    const body = document.getElementById('agBody');
    if (!body || !State.wallet) return;
    const addr = State.wallet.address;

    if (!body.dataset.rendered) {
      body.innerHTML = `<div class="ag-empty">⏳ جاري جلب الوكلاء المرتبطين بمحفظتك من Hyperliquid...</div>`;
    }

    const { rows, networkFailed } = await _buildRows(addr);
    if (!document.getElementById('agModal')?.classList.contains('open')) return; // أُغلقت أثناء الجلب

    const agentsHtml = rows.length
      ? rows.map(_agentCardHtml).join('') + `<button class="ag-btn rot wide" id="agAddMore">+ إنشاء وكيل جديد</button>`
      : `<div class="ag-empty">🔒 لا يوجد وكيل نشط حالياً
          <button class="ag-btn rot wide" id="agActivate" style="margin-top:14px;">⚡ تفعيل الوكيل الآن</button>
        </div>`;

    body.innerHTML = `
      <div class="ag-sec-title">الوكلاء (${rows.length})</div>
      ${networkFailed ? `<div class="ag-note" style="border-color:rgba(239,68,68,.3);background:rgba(239,68,68,.06);">⚠️ تعذّر الاتصال بـ Hyperliquid الآن — القائمة أدناه من آخر ما هو معروف بهذا الجهاز فقط، وقد لا تشمل كل الوكلاء الفعليين حتى تعود الشبكة.</div>` : ''}
      ${agentsHtml}
      <div class="ag-note">
        🛡 كل وكيل يوقّع الصفقات فقط — لا يقدر إطلاقاً على سحب أو تحويل أموالك.
        حذف أي وكيل من هنا يُبطله فعلياً عند Hyperliquid (توقيع واحد من محفظتك)، بصرف النظر عن مكان إنشائه — حتى لو أُنشئ من الموقع الرسمي أو جهاز آخر.
      </div>`;

    body.dataset.rendered = '1';
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
        const rec = _loadAll(State.wallet.address).find(a => a.agentAddress.toLowerCase() === addr.toLowerCase());
        _showReveal(rec);
      } else if (act === 'del') {
        const realName = b.dataset.name || null;
        _confirm(
          'سيتطلب هذا توقيعاً واحداً من محفظتك لإبطال الوكيل فعلياً عند Hyperliquid — لن يعود صالحاً للتداول بأي مكان بعدها، بصرف النظر عن مكان إنشائه. صفقاتك المفتوحة تبقى كما هي.',
          async () => {
            showLoader('بانتظار توقيعك...');
            try {
              await revokeOne(State.wallet.address, addr, realName);
              toast('🗑 تم إبطال الوكيل فعلياً', 'ok');
            } catch (e) {
              _showAgentError(e);
            } finally {
              hideLoader();
              _refreshUI();
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
  }

  document.getElementById('agClose')?.addEventListener('click', _close);
  document.getElementById('agModal')?.addEventListener('click', (e) => { if (e.target.id === 'agModal') _close(); });

  window.Agents = {
    ensure, revoke, revokeOne, clearSession, getInfo, buildLink,
    openModal: _open, closeModal: _close, TTL_MS: AGENT_TTL_MS,
  };
})();
