/* ═══════════════════════════════════════════════════════════════
   agents.js — إدارة محفظة الوكيل (Hyperliquid Agent Wallet)

   ✅ صالح 180 يوماً، للتنفيذ فقط — لا يقدر أبداً على السحب. مضمون من
      تصميم Hyperliquid نفسه: توثيق exchange-endpoint الرسمي لا يملك أي
      action يوقّعه وكيل لسحب أموال (withdraw3 حصراً بتوقيع المحفظة
      الرئيسية — راجع api.js/account.js).

   ✅ اسم الوكيل ثابت (لا nonce بالاسم كالتصميم القديم) — سبب حقيقي:
      توثيق Hyperliquid الرسمي يحدد صراحة "حساب واحد يقدر يملك وكيل غير
      مُسمّى واحد + حتى 3 وكلاء مُسمّين فقط"، ولا يوجد أي endpoint لسحب
      موافقة وكيل. اسم فريد بكل تدوير يستهلك خانة تسمية جديدة للأبد،
      وبعد 3-4 تدويرات تبلغ Hyperliquid السقف وترفض أي approveAgent
      جديد نهائياً. إعادة استخدام الاسم نفسه تُحدِّث نفس الخانة كل مرة،
      فتبقى ضمن الحد دائماً. للمستخدمين القدامى (اسم قديم فريد محفوظ
      محلياً من نسخة سابقة) نُعيد استخدام اسمهم الخاص المخزَّن بدل
      الاسم الثابت الجديد — فلا تراكم إضافي لأي طرف من هذي النقطة.

   ✅ قفل تزامن (ensure lock): نداءان متزامنان (تدقيق تلقائي عند صفقة +
      ضغطة يدوية على "الوكلاء" مثلاً) كانا سابقاً يفتحان نافذة موافقة
      فوق الأخرى فتُكتب onclick handlers الثانية فوق الأولى، فتعلق أول
      عملية توقيع للأبد بلا resolve ولا reject. الآن كل نداء متزامن
      ينضم لنفس العملية الجارية بدل فتح نافذة ثانية.

   ✅ الوكيل يبقى صالحاً محلياً عبر تسجيل الخروج/الدخول لنفس المحفظة —
      auth.js لا يحذفه من localStorage عند doLogout العادي، فقط يمسح
      النسخة الحيّة بالذاكرة (Agents.clearSession). هذا يخدم فكرة "وكيل
      قائم 180 يوماً" فعلياً بدل توقيع جديد كل تسجيل دخول. الحذف الكامل
      يبقى متاحاً يدوياً من هذي الواجهة، وتلقائياً عند "نسيت PIN".

   ✅ لا مؤقت خلفي يفتح نافذة توقيع مفاجئة أثناء تصفح المستخدم — كان
      التصميم القديم يفتح نافذة موافقة تلقائياً كل 6 ساعات لو انتهت
      الصلاحية، حتى لو المستخدم يقرأ الرسم البياني بهدوء. التجديد الآن
      يحدث فقط عند الحاجة الفعلية (أول صفقة بعد الانتهاء) عبر hlExchange
      بـapi.js. عدّاد الأيام بهذي الواجهة يتحدّث تلقائياً فقط أثناء فتحها.

   ✅ حُذفت أزرار الإيداع/السحب من هذي النافذة — كانت مكرَّرة حرفياً مع
      نفس الزرين بقائمة "⚙️ الخيارات" (نفس المودالين modalDeposit/
      modalWithdraw بالضبط، بلا أي فرق وظيفي). الخيارات هي المكان
      الوحيد الآن للإيداع/السحب؛ نافذة الوكلاء تركّز فقط على دورة حياة
      مفتاح التوقيع (الحالة/التدوير/الحذف) + عرض عنوان الإيداع للنسخ
      السريع، بلا تكرار أزرار فعل.
═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const AGENT_TTL_MS      = 180 * 24 * 3600 * 1000; // 180 يوم
  const AGENT_KEY_PREFIX  = 'hl_agent_';
  const DEFAULT_AGENT_NAME = 'suyula-agent';

  let _ensurePromise = null;
  let _tickTimer     = null;

  /* ════ تخزين ════ */
  function _key(addr)     { return AGENT_KEY_PREFIX + addr.toLowerCase(); }
  function _load(addr)    { try { return JSON.parse(localStorage.getItem(_key(addr)) || 'null'); } catch { return null; } }
  function _save(addr, m) { try { localStorage.setItem(_key(addr), JSON.stringify(m)); } catch {} }
  function _wipe(addr)    { try { localStorage.removeItem(_key(addr)); } catch {} }
  function _isValid(m)    { return !!(m && m.pk && m.createdAt && (Date.now() - m.createdAt) < AGENT_TTL_MS); }

  /* ════ معلومات للعرض — "اسم الوكيل + العنوان العام" المطلوبين ════ */
  function getInfo(address) {
    const addr = address || State.wallet?.address;
    if (!addr) return null;
    const m = _load(addr);
    if (!m) return null;
    const expiresAt = m.createdAt + AGENT_TTL_MS;
    return {
      name:      m.agentName,
      address:   m.agentAddress,
      createdAt: m.createdAt,
      expiresAt: expiresAt,
      daysLeft:  Math.max(0, Math.ceil((expiresAt - Date.now()) / 86400000)),
      valid:     _isValid(m),
    };
  }

  /* ════ نافذة الموافقة (الموجودة أصلاً بـ index.html) ════ */
  function _confirmApproval(agentAddress) {
    return new Promise((resolve, reject) => {
      setTxt('agentAddrPreview', agentAddress);
      openModal('modalAgentApproval');
      $('agentApprovalConfirm').onclick = () => { closeModal('modalAgentApproval'); resolve(); };
      $('agentApprovalCancel').onclick  = () => { closeModal('modalAgentApproval'); reject(new Error('CANCELLED')); };
    });
  }

  async function _createAndApprove() {
    const prior     = _load(State.wallet.address);
    const agentName = prior?.agentName || DEFAULT_AGENT_NAME; /* راجع تعليق رأس الملف */
    const agent     = ethers.Wallet.createRandom();

    await _confirmApproval(agent.address);

    showLoader('بانتظار توقيعك...');
    try {
      const nonce = Date.now();
      const action = {
        type: 'approveAgent', hyperliquidChain: 'Mainnet', signatureChainId: '0xa4b1',
        agentAddress: agent.address, agentName, nonce,
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
        { hyperliquidChain: 'Mainnet', agentAddress: agent.address, agentName, nonce }
      );
      const { r, s, v } = ethers.Signature.from(sig);
      const body = { action, nonce, signature: { r, s, v } };
      const d = HL.isOpen() ? await HL.post(body, true).catch(() => _restExchange(body)) : await _restExchange(body);
      if (d.status !== 'ok') throw new Error(typeof d.response === 'string' ? d.response : JSON.stringify(d));

      _save(State.wallet.address, { pk: agent.privateKey, agentAddress: agent.address, agentName, createdAt: Date.now() });
      State.agent = agent;
      _refreshUI();
      return agent;
    } finally { hideLoader(); }
  }

  /* ════ نقطة الدخول الوحيدة — محمية بقفل تزامن ════
     forceNew=true → تدوير يدوي (وكيل جديد حتى لو الحالي صالح).
     أي نداء متزامن ثانٍ (forced أو لا) ينضم لنفس العملية الجارية بدل
     فتح نافذة موافقة ثانية فوق الأولى. */
  function ensure(forceNew) {
    if (!State.wallet) return Promise.reject(new Error('NO_WALLET'));
    if (_ensurePromise) return _ensurePromise;

    const meta = _load(State.wallet.address);
    if (!forceNew && _isValid(meta)) {
      try { State.agent = new ethers.Wallet(meta.pk); return Promise.resolve(State.agent); }
      catch { /* مفتاح تالف محلياً — تابع لإنشاء وكيل جديد بالأسفل */ }
    }

    _ensurePromise = _createAndApprove().finally(() => { _ensurePromise = null; });
    return _ensurePromise;
  }

  /* ════ حذف يدوي — محلي فقط ════
     Hyperliquid لا توثّق أي endpoint لسحب موافقة وكيل. الحذف هنا يوقف
     استخدام هذا الوكيل من التطبيق نهائياً وفوراً. حتى لو بقي تقنياً
     مُصرَّحاً على شبكة Hyperliquid حتى انتهائه الأصلي، محفظة الوكيل لا
     تقدر إطلاقاً على سحب أو تحويل الأموال — لا خطر مالي رغم هذا القيد. */
  function revoke(address) {
    const addr = address || State.wallet?.address;
    if (!addr) return;
    _wipe(addr);
    if (State.wallet && State.wallet.address?.toLowerCase() === addr.toLowerCase()) State.agent = null;
    _refreshUI();
  }

  /* يُستدعى من doLogout العادي — يمسح النسخة الحيّة بالذاكرة فقط، يُبقي
     localStorage كما هو ليُعاد استخدام الوكيل بلا توقيع جديد عند إعادة
     الاتصال بنفس المحفظة خلال 180 يوم. */
  function clearSession() { State.agent = null; }

  /* ═══════════════════════ الواجهة ═══════════════════════ */

  document.head.insertAdjacentHTML('beforeend', `<style>
#agModal{position:fixed;inset:0;z-index:500;background:rgba(0,0,0,.75);display:none;
  align-items:center;justify-content:center;padding:16px;font-family:'Cairo',sans-serif;
  direction:rtl;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);}
#agModal.open{display:flex;animation:agFade .18s ease;}
@keyframes agFade{from{opacity:0}to{opacity:1}}
.ag-card{background:var(--bg-app,#131210);border:1px solid rgba(255,255,255,.1);border-radius:20px;
  width:min(94vw,440px);max-height:88vh;overflow-y:auto;box-shadow:0 24px 70px rgba(0,0,0,.6);
  animation:agPop .2s cubic-bezier(.34,1.56,.64,1);position:relative;}
@keyframes agPop{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:scale(1)}}
.ag-hdr{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;
  border-bottom:1px solid rgba(255,255,255,.08);background:var(--bg-card,#1e1c18);
  position:sticky;top:0;z-index:2;border-radius:20px 20px 0 0;}
.ag-title{font-size:16px;font-weight:900;color:var(--text-primary,#f0ece4);display:flex;align-items:center;gap:7px;}
.ag-close{width:30px;height:30px;border-radius:50%;border:1.5px solid rgba(255,255,255,.14);
  background:rgba(255,255,255,.06);color:var(--text-primary,#f0ece4);font-size:15px;
  display:flex;align-items:center;justify-content:center;cursor:pointer;}
.ag-body{padding:16px 18px 22px;}
.ag-sec-title{font-size:11px;font-weight:800;color:#8a8278;letter-spacing:.6px;
  text-transform:uppercase;margin:16px 0 8px;}
.ag-sec-title:first-child{margin-top:0;}
.ag-card-box{background:var(--bg-card,#1e1c18);border:1px solid rgba(255,255,255,.08);
  border-radius:14px;padding:14px;margin-bottom:10px;}
.ag-row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;
  border-bottom:1px solid rgba(255,255,255,.06);font-size:13px;gap:10px;}
.ag-row:last-child{border-bottom:none;}
.ag-row-k{color:#8a8278;font-weight:700;flex-shrink:0;}
.ag-row-v{font-family:'IBM Plex Mono',monospace;font-weight:800;color:var(--text-primary,#f0ece4);
  direction:ltr;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ag-status{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:800;
  padding:3px 10px;border-radius:99px;}
.ag-status.ok{background:rgba(52,200,90,.16);color:#34c85a;}
.ag-status.warn{background:rgba(240,190,48,.16);color:#f0be30;}
.ag-status.bad{background:rgba(240,82,72,.16);color:#f05248;}
.ag-addr-box{display:flex;align-items:center;gap:8px;background:rgba(0,0,0,.22);
  border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:9px 11px;margin-top:8px;}
.ag-addr-txt{font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--text-primary,#f0ece4);
  direction:ltr;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ag-copy-btn{flex-shrink:0;background:rgba(224,114,72,.14);border:1.5px solid rgba(224,114,72,.35);
  color:#e07248;border-radius:8px;width:30px;height:30px;font-size:13px;cursor:pointer;
  display:flex;align-items:center;justify-content:center;}
.ag-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;}
.ag-btn{padding:11px;border-radius:12px;font-size:12.5px;font-weight:800;cursor:pointer;
  border:1.5px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);
  color:var(--text-primary,#f0ece4);display:flex;align-items:center;justify-content:center;gap:5px;
  transition:filter .12s,transform .1s;font-family:'Cairo',sans-serif;}
.ag-btn:active{transform:scale(.96);}
.ag-btn.rot{border-color:rgba(224,114,72,.4);background:rgba(224,114,72,.1);color:#e07248;}
.ag-btn.del{border-color:rgba(240,82,72,.4);background:rgba(240,82,72,.1);color:#f05248;}
.ag-btn.wide{grid-column:1/-1;}
.ag-note{font-size:11.5px;line-height:1.7;color:#8a8278;background:rgba(224,114,72,.06);
  border:1px solid rgba(224,114,72,.18);border-radius:10px;padding:10px 12px;margin-top:10px;}
.ag-note b{color:#e07248;}
.ag-empty{text-align:center;padding:26px 10px;color:#8a8278;font-size:13px;font-weight:700;}
.ag-empty .ag-btn{margin-top:14px;max-width:230px;margin-inline:auto;}
.ag-confirm{position:absolute;inset:0;background:rgba(0,0,0,.6);display:none;
  align-items:center;justify-content:center;padding:20px;border-radius:20px;}
.ag-confirm.open{display:flex;}
.ag-confirm-card{background:var(--bg-card,#1e1c18);border:1px solid rgba(255,255,255,.12);
  border-radius:16px;padding:18px;width:100%;max-width:320px;text-align:center;}
.ag-confirm-txt{font-size:13px;color:var(--text-primary,#f0ece4);line-height:1.7;
  margin-bottom:14px;font-weight:700;}
.ag-confirm-btns{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
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
  </div>
</div>`);

  function _fmtDate(ms) { return new Date(ms).toLocaleDateString('ar-EG', { day:'2-digit', month:'2-digit', year:'numeric' }); }

  function _render() {
    const body = document.getElementById('agBody');
    if (!body) return;
    const info = getInfo();

    let agentHtml;
    if (!info) {
      agentHtml = `
        <div class="ag-empty">🔒 لا يوجد وكيل نشط حالياً
          <button class="ag-btn rot wide" id="agActivate" style="margin-top:14px;">⚡ تفعيل الوكيل الآن</button>
        </div>`;
    } else {
      const statusCls = !info.valid ? 'bad' : info.daysLeft <= 14 ? 'warn' : 'ok';
      const statusTxt = !info.valid ? 'منتهي — سيُطلب تجديد بأول صفقة' : info.daysLeft <= 14 ? 'ينتهي قريباً' : 'نشط';
      agentHtml = `
        <div class="ag-card-box">
          <div class="ag-row"><span class="ag-row-k">الحالة</span><span class="ag-status ${statusCls}">● ${statusTxt}</span></div>
          <div class="ag-row"><span class="ag-row-k">اسم الوكيل</span><span class="ag-row-v">${info.name}</span></div>
          <div class="ag-row"><span class="ag-row-k">تاريخ الإنشاء</span><span class="ag-row-v">${_fmtDate(info.createdAt)}</span></div>
          <div class="ag-row"><span class="ag-row-k">ينتهي في</span><span class="ag-row-v">${_fmtDate(info.expiresAt)}</span></div>
          <div class="ag-row"><span class="ag-row-k">الأيام المتبقية</span><span class="ag-row-v">${info.daysLeft} يوم</span></div>
          <div class="ag-addr-box">
            <span class="ag-addr-txt">${info.address}</span>
            <button class="ag-copy-btn" id="agCopyAgent" title="نسخ">⧉</button>
          </div>
        </div>
        <div class="ag-actions">
          <button class="ag-btn rot" id="agRotate">🔄 تدوير</button>
          <button class="ag-btn del" id="agDelete">🗑 حذف</button>
        </div>
        <div class="ag-note">🛡 <b>محفظة الوكيل توقّع الصفقات فقط</b> — لا تقدر إطلاقاً على سحب
          أو تحويل أموالك. صالحة 180 يوماً، وتُستخدم تلقائياً بلا نوافذ توقيع متكررة أثناء التداول.</div>`;
    }

    const wAddr = State.wallet?.address || '';
    body.innerHTML = `
      <div class="ag-sec-title">الوكيل الحالي</div>
      ${agentHtml}
      <div class="ag-sec-title">المحفظة</div>
      <div class="ag-card-box">
        <div class="ag-row"><span class="ag-row-k">عنوان الإيداع</span></div>
        <div class="ag-addr-box">
          <span class="ag-addr-txt">${wAddr}</span>
          <button class="ag-copy-btn" id="agCopyWallet" title="نسخ">⧉</button>
        </div>
      </div>
      <div class="ag-note">
        💵 الإيداع والسحب متاحان من ⚙️ الخيارات — بدون رسوم من التطبيق على
        الإيداع (فقط غاز Arbitrum الفعلي، عادة أقل من $0.10)، ورسوم بروتوكول
        Hyperliquid الثابتة $${WITHDRAW_FEE_USDC.toFixed(2)} على السحب تُخصم
        تلقائياً من المبلغ المُرسَل.
      </div>`;

    _wireActions();
  }

  function _wireActions() {
    document.getElementById('agActivate')?.addEventListener('click', () => {
      ensure(true).then(_render).catch(e => { if (e.message !== 'CANCELLED') toast('⚠️ ' + e.message.slice(0,100), 'err'); });
    });
    document.getElementById('agCopyAgent')?.addEventListener('click', () => _copy(getInfo()?.address));
    document.getElementById('agCopyWallet')?.addEventListener('click', () => _copy(State.wallet?.address));
    document.getElementById('agRotate')?.addEventListener('click', () => _confirm(
      'سيتم إنشاء وكيل جديد ويحتاج توقيعاً واحداً — الوكيل الحالي يتوقف عن الاستخدام فوراً.',
      () => ensure(true).then(() => { toast('✅ تم تدوير الوكيل', 'ok'); _render(); })
               .catch(e => { if (e.message !== 'CANCELLED') toast('⚠️ ' + e.message.slice(0,100), 'err'); })
    ));
    document.getElementById('agDelete')?.addEventListener('click', () => _confirm(
      'سيتوقف هذا الوكيل عن العمل فوراً من داخل التطبيق. صفقاتك المفتوحة تبقى كما هي على Hyperliquid — ستحتاج وكيلاً جديداً فقط عند صفقتك القادمة.',
      () => { revoke(); toast('🗑 تم حذف الوكيل', 'info'); _render(); }
    ));
  }

  function _copy(text) {
    if (!text) return;
    navigator.clipboard?.writeText(text).then(() => toast('✅ تم النسخ', 'info', 2000)).catch(() => toast('تعذّر النسخ', 'err'));
  }

  function _confirm(msg, onYes) {
    const box = document.getElementById('agConfirm');
    document.getElementById('agConfirmTxt').textContent = msg;
    box.classList.add('open');
    document.getElementById('agConfirmNo').onclick = () => box.classList.remove('open');
    document.getElementById('agConfirmYes').onclick = () => { box.classList.remove('open'); onYes(); };
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
    clearInterval(_tickTimer);
  }

  document.getElementById('agClose')?.addEventListener('click', _close);
  document.getElementById('agModal')?.addEventListener('click', (e) => { if (e.target.id === 'agModal') _close(); });

  window.Agents = { ensure, revoke, clearSession, getInfo, openModal: _open, closeModal: _close, TTL_MS: AGENT_TTL_MS };
})();
