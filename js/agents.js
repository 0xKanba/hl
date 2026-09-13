/* ═══════════════════════════════════════════════════════════════
   agents.js — إدارة محافظ الوكلاء (Hyperliquid Agent/API Wallets) — v5

   ⚠️ العطل المُبلَّغ عنه (v4): حذف "0x3" من داخل المشروع لم ينعكس عند
   https://app.hyperliquid.xyz/API — بقي مرئياً بنفس الحالة. v4 كانت
   تُصدّق status:'ok' من الخادم كدليل نجاح كافٍ، مع منطق ديناميكي معقّد
   (عدّاد أسماء متسلسل + "خانات مُحرَّرة" محلياً + تفادي تصادم بين أجهزة)
   لاختيار اسم جديد أو إعادة استخدام قائم. هذا التعقيد يصعب التحقق منه
   ويُخفي أي فشل صامت حقيقي بآلية إعادة الاستخدام بالاسم (التي لا بديل
   موثّق لها أصلاً — راجع v4 لتفاصيل البحث). بدلاً من الاستمرار بتخمين
   سبب دقيق غير مؤكَّد، هذا الإصدار يعتمد نهجين معاً:

   1) تبسيط جذري: 3 خانات ثابتة فقط بأسماء عربية دائمة — "وكيل-1"،
      "وكيل-2"، "وكيل-3" (بطلب المستخدم مباشرة، ومناسبة لمنصة عربية).
      لا عدّاد، لا "تحرير" محلي، لا تصادم أجهزة مُحتمَل — نفس 3 الأسماء
      دائماً، يُستعلَم عن حالة كل واحدة من extraAgents مباشرة في كل مرة.
      واجهة "الوكلاء" تعرض دائماً 3 بطاقات: فارغة (⚡ تفعيل) أو مُفعَّلة
      (🔗🔑🗑). زر "إنشاء جديد" العام حُذف تماماً — كل خانة زرّها الخاص،
      بدل ملاحظة "الحد الأقصى 3" العائمة (بطلب المستخدم، البديل الأبسط).

   2) ✅ تحقّق فعلي إلزامي بعد كل إنشاء/حذف — لا نُصدّق status:'ok' وحده
      أبداً بعد الآن. بعد أي توقيع approveAgent (إنشاء أو حذف)، يُعاد
      استعلام extraAgents فعلياً (حتى 3 محاولات بفواصل قصيرة، مراعاةً
      لزمن انتشار الحالة بالخادم) للتأكد أن العنوان/الاسم أصبحا كما
      يُفترَض حقاً — لا افتراضاً من رمز استجابة فقط. لو فشل التحقّق رغم
      قبول التوقيع، يظهر خطأ صريح للمستخدم (لا نجاح وهمي) — وهذا بالضبط
      ما كان يجب أن يظهر بالعطل المذكور أعلاه لو كان حاضراً حينها، وسيكشف
      فوراً لو تكرر العطل نفسه بمحاولة تالية.

   🔍 المرجع الرسمي (بحث مباشر 2026-09، لا افتراض): exchange-endpoint
   يؤكد صراحة حد "1 غير مُسمّى + حتى 3 مُسمّين" لكل حساب. nonces-and-
   api-wallets يؤكد أن الآلية الوحيدة الموثّقة للإبطال المبكر هي إرسال
   ApproveAgent بنفس الاسم القائم فعلاً (يشمل الوكيل غير المُسمّى، عبر
   عدم إرسال حقل agentName إطلاقاً — يطابق approve_agent الرسمي بـ
   Python SDK حرفياً). لا إجراء "إلغاء" منفصل موجود بكامل الـAPI.

   ✅ القائمة تشمل أي وكيل آخر مرتبط بالمحفظة الرئيسية فعلياً (بلا اسم،
   أو باسم غير "وكيل-N" — من الموقع الرسمي مباشرة، جهاز آخر، أو إصدار
   سابق لهذا المشروع) — قسم منفصل أسفل الخانات الثلاث، قابل للحذف من
   هنا أيضاً (الحذف لا يحتاج مفتاح الوكيل نفسه إطلاقاً، فقط توقيع من
   المحفظة الرئيسية). 🔗 رابط و🔑 مفتاح يظهران فقط لما أنشأه هذا المتصفح.

   ✅ عزل كامل بين المحافظ بلا تغيير — التخزين المحلي مفتاح بعنوان
   المحفظة (hl_agents_<addr>).
═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const AGENT_TTL_MS        = 180 * 24 * 3600 * 1000; // الحد الأقصى الموثّق رسمياً لـvalid_until
  const AGENT_KEY_PREFIX    = 'hl_agents_';   // مصفوفة الوكلاء التي نملك مفاتيحها محلياً، لكل محفظة
  const AGENT_KEY_PREFIX_V1 = 'hl_agent_';    // v1 القديم: كائن وكيل مفرد (يُرحَّل تلقائياً)
  const SLOT_NAMES = ['وكيل-1', 'وكيل-2', 'وكيل-3']; // الأسماء الحقيقية الثابتة — 3 خانات دائماً، لا أكثر ولا أقل

  let _ensurePromise = null;
  let _tickTimer     = null;

  function _uerr(msg) { return new Error(msg); }
  function _key(addr) { return AGENT_KEY_PREFIX + addr.toLowerCase(); }
  function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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

  /* يُعيد الاستعلام حتى تتحقّق شرط، بمهلات قصيرة — يمنح الخادم وقتاً
     لنشر الحالة قبل الحكم بفشل حقيقي. */
  async function _verifyAgentState(addr, predicate, attempts, delayMs) {
    for (let i = 0; i < attempts; i++) {
      await _sleep(delayMs);
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
     يُحذف كلياً من الحمولة المُرسَلة لحالة "بلا اسم" تحديداً. ════ */
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
     واحد، ثم تحقّق فعلي من extraAgents قبل إخبار المستخدم بالنجاح. */
  async function _activateSlot(addr, slotName) {
    const agent = ethers.Wallet.createRandom();
    await _confirmApproval(agent.address, slotName);

    showLoader('بانتظار توقيعك...');
    try {
      const nonce = Date.now();
      const validUntil = nonce + AGENT_TTL_MS;
      await _signApprove(agent.address, slotName, validUntil, nonce);

      showLoader('جاري التأكد من الخادم...');
      const ok = await _verifyAgentState(
        addr,
        list => list.some(s => s.name === slotName && (s.address || '').toLowerCase() === agent.address.toLowerCase()),
        3, 600
      );
      if (!ok) throw _uerr(`لم يُفعَّل "${slotName}" فعلياً عند Hyperliquid رغم قبول التوقيع — تحقّق من app.hyperliquid.xyz/API وحاول مجدداً`);

      const rec = { pk: agent.privateKey, agentAddress: agent.address, agentName: slotName, createdAt: nonce, validUntil };
      const all = _loadAll(addr).filter(a => a.agentName !== slotName);
      all.push(rec); _saveAll(addr, all);
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

    const now = Date.now();
    const byName = {};
    (serverList || []).forEach(s => { if (s.name) byName[s.name] = s; });
    const emptySlot = SLOT_NAMES.find(n => { const s = byName[n]; return !s || (s.validUntil && s.validUntil <= now); });
    if (!emptySlot) throw _uerr('الخانات الثلاث كلها مُشغولة الآن بوكلاء صالحين — احذف واحداً من قسم "الوكلاء" أولاً');
    return _activateSlot(addr, emptySlot);
  }

  /* ════ حذف حقيقي بتوقيع — لا يحتاج مفتاح الوكيل المحذوف إطلاقاً، فقط
     اسمه الحقيقي (من extraAgents) وتوقيع واحد من المحفظة الرئيسية. ثم
     تحقّق فعلي إلزامي من extraAgents قبل إخبار المستخدم بالنجاح — لا
     نصدّق status:'ok' وحده لعملية بهذه الحساسية. ════ */
  async function revokeOne(address, agentAddress, realName) {
    const addr = address || State.wallet?.address;
    if (!addr || !State.wallet) throw _uerr('سجّل الدخول أولاً');

    const throwaway = ethers.Wallet.createRandom();
    const nonce = Date.now();
    await _signApprove(throwaway.address, realName || null, nonce + AGENT_TTL_MS, nonce);

    const ok = await _verifyAgentState(
      addr,
      list => !list.some(s => (s.address || '').toLowerCase() === agentAddress.toLowerCase() && (realName ? s.name === realName : !s.name)),
      3, 600
    );
    if (!ok) throw _uerr('لم يتم إبطال الوكيل فعلياً عند Hyperliquid — العنوان ما زال مرتبطاً بنفس الاسم عند الخادم بعد عدة محاولات تحقّق. تحقّق يدوياً من app.hyperliquid.xyz/API وحاول مجدداً');

    _saveAll(addr, _loadAll(addr).filter(a => a.agentAddress.toLowerCase() !== agentAddress.toLowerCase()));
    if (State.agent?.address?.toLowerCase() === agentAddress.toLowerCase()) State.agent = null;
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

  function _slotCardHtml(row) {
    if (row.empty) {
      return `
        <div class="ag-card-box">
          <div class="ag-row"><span class="ag-row-k">${row.realName}</span><span class="ag-status" style="background:rgba(148,163,184,.14);color:#94a3b8;">○ فارغة</span></div>
          <button class="ag-btn rot wide" data-slot-activate="${row.realName}" style="margin-top:10px;">⚡ تفعيل ${row.realName}</button>
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

  async function _buildRows(addr) {
    const serverList = await _fetchExtraAgents(addr);
    const local = _loadAll(addr);
    const localByAddr = {};
    local.forEach(r => { localByAddr[r.agentAddress.toLowerCase()] = r; });

    if (!Array.isArray(serverList)) {
      const slotRows = SLOT_NAMES.map(n => {
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
      const s = byName[slotName];
      const valid = s && (!s.validUntil || s.validUntil > now);
      if (!valid) return { realName: slotName, empty: true };
      const rec = localByAddr[(s.address || '').toLowerCase()];
      return { realName: slotName, address: s.address, expiresAt: s.validUntil || null, hasKey: !!rec, empty: false };
    });

    const otherRows = serverList
      .filter(s => !(s.name && SLOT_NAMES.includes(s.name)))
      .map(s => {
        const rec = localByAddr[(s.address || '').toLowerCase()];
        return { realName: s.name || null, address: s.address, expiresAt: s.validUntil || null, hasKey: !!rec };
      });

    return { slotRows, otherRows, networkFailed: false };
  }

  async function _render() {
    const body = document.getElementById('agBody');
    if (!body || !State.wallet) return;
    const addr = State.wallet.address;

    if (!body.dataset.rendered) {
      body.innerHTML = `<div class="ag-empty">⏳ جاري جلب الوكلاء من Hyperliquid...</div>`;
    }

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
        🛡 كل وكيل يوقّع الصفقات فقط — لا يقدر إطلاقاً على سحب أو تحويل أموالك. Hyperliquid يسمح بحد أقصى 3 وكلاء مُسمّين لكل حساب — لهذا 3 خانات ثابتة فقط. حذف أي وكيل من هنا يُبطله فعلياً عند Hyperliquid (توقيع واحد)، بصرف النظر عن مكان إنشائه — ويُتحقَّق من ذلك آلياً بعد كل عملية.
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
      const slot = b.dataset.slotActivate;
      try { await _activateSlot(State.wallet.address, slot); }
      catch (e) { _showAgentError(e); }
      finally { _refreshUI(); }
    }));

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
          'سيتطلب هذا توقيعاً واحداً من محفظتك لإبطال الوكيل فعلياً عند Hyperliquid — لن يعود صالحاً للتداول بأي مكان بعدها. صفقاتك المفتوحة تبقى كما هي. سيُتحقَّق آلياً من الخادم قبل تأكيد النجاح.',
          async () => {
            showLoader('بانتظار توقيعك...');
            try {
              await revokeOne(State.wallet.address, addr, realName);
              toast('🗑 تم إبطال الوكيل فعلياً — تأكَّد آلياً من الخادم', 'ok');
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
