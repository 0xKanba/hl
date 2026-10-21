/* ═══════════════════════════════════════════════════════════════
   agentlink.js — روابط وكيل قابلة للمشاركة (trade-only link) — v2 (جلسة دائمة)

   الرابط يحمل {address: المحفظة الرئيسية, key: مفتاح وكيل} بصيغة base64(JSON)
   — نفس آلية Hyperliquid الرسمية. الوكيل بلا صلاحية سحب إطلاقاً.

   ✅ v2 — الجلسة تُحفَظ بالمتصفح (localStorage: hl_agentlink_v1) فتبقى
      متصلة بعد إعادة التحميل/إغلاق المتصفح/فتح تطبيق الويب (PWA) بـstart_url
      "/" بلا ?link — كانت v1 تمسح الرابط من شريط العنوان ولا تحفظ شيئاً،
      فكل إعادة تحميل = ضيف (هذا هو "الـbug" المُبلَّغ عنه).
      الجلسة لا تنتهي إلا بـ:
        1) إلغاء اتصال يدوي (doLogout)             → release()
        2) رابط وكيل آخر بالمتصفح                   → tryConsume() يستبدلها
        3) الاتصال بمحفظة رئيسية (بريد/خارجية)     → _onWalletConnected → release()
        4) حذف/انتهاء الوكيل عند Hyperliquid        → verify() ← handleRevoked()
           (إشعار وسط الشاشة 30 ثانية يشرح الخطوة التالية)

   ✅ التحقق من صلاحية الوكيل (حقيقة الخادم الوحيدة): info/extraAgents للمحفظة
      الرئيسية — عند الإقلاع، كل 5 دقائق، عند عودة التبويب للواجهة، وعند
      أي خطأ "User or API Wallet ... does not exist" بالتداول (api.js).
      غياب الوكيل يُؤكَّد بقراءتين (فاصل 3ث) قبل اعتباره محذوفاً؛ فشل الشبكة
      "غير معروف" لا يقطع الجلسة أبداً (لا نفترض الحذف عند غياب الاتصال).
      validUntil المُتعلَّم من الخادم يُخزَّن، فانتهاء الصلاحية (180 يوماً)
      يُكتشف حتى بلا شبكة عند الإقلاع التالي.

   ✅ تحليل الرابط يدوي بدل URLSearchParams ويقبل + و%2B وbase64url (تحصين
      فقط: payload هذا الرابط ASCII من JSON فلا يحوي "+" عملياً، لكن الروابط
      المنسوخة/المعاد تشفيرها قد تُغيَّر بصيغتها). تُمسح ?link من العنوان
      ويُبقى باقي الـquery.

   ✅ مفتاح الوكيل لا يترك هذا الجهاز؛ المحفظة الرئيسية لا تُلمس: الكائن
      State.wallet قراءة فقط (isAgentLink) ويرفض أي توقيع رئيسي.
═══════════════════════════════════════════════════════════════ */
'use strict';

const AgentLink = (function () {
  const RE_ADDR = /^0x[0-9a-fA-F]{40}$/;
  const RE_KEY  = /^0x[0-9a-fA-F]{64}$/;

  const LS_KEY           = 'hl_agentlink_v1';
  const CHECK_MS         = 5 * 60 * 1000;   // تحقق دوري
  const FOCUS_MIN_GAP_MS = 60 * 1000;       // أقل فاصل بين تحققين عند عودة التبويب
  const RECHECK_DELAY_MS = 3000;            // قراءة ثانية قبل اعتبار الوكيل محذوفاً
  const NOTICE_MS        = 30000;           // مدة إشعار الحذف
  const NOTICE_ID        = 'agentRevokedNotice';

  let _timer = null, _noticeTimer = null, _checking = false, _lastCheck = 0, _visBound = false;
  let _source = null; // 'url' | 'stored' — مصدر آخر tryConsume ناجح

  const _sleep = ms => new Promise(r => setTimeout(r, ms));
  const _short = a => a ? a.slice(0, 6) + '...' + a.slice(-4) : '';

  /* ════ بناء/تحليل الرابط ════ */
  function _encode(mainAddress, agentPk) {
    return btoa(JSON.stringify({ address: mainAddress, key: agentPk }));
  }

  /* target: 'self' (افتراضي، رابط موقعنا) أو 'hyperliquid' (app.hyperliquid.xyz/trade) */
  function build(mainAddress, agentPk, target) {
    const b64 = _encode(mainAddress, agentPk);
    if (target === 'hyperliquid') return `https://app.hyperliquid.xyz/trade?link=${b64}`;
    const base = window.location.origin + window.location.pathname;
    return `${base}?link=${b64}`;
  }

  /* القيمة الخام لـ?link= بلا فك "+" (راجع تعليق الرأس) */
  function _rawParam() {
    const m = /[?&]link=([^&#]*)/.exec(window.location.search || '');
    return m ? m[1] : null;
  }

  function _decode(raw) {
    try {
      let s = raw;
      try { s = decodeURIComponent(raw); } catch (e) {}
      s = s.replace(/ /g, '+').replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/=]/g, '');
      while (s.length % 4) s += '=';
      const obj = JSON.parse(atob(s));
      if (!obj || !RE_ADDR.test(obj.address) || !RE_KEY.test(obj.key)) return null;
      return { address: obj.address, key: obj.key };
    } catch (e) { return null; }
  }

  function parseFromLocation() {
    const raw = _rawParam();
    return raw ? _decode(raw) : null;
  }

  function _stripUrl() {
    try {
      const u = new URL(window.location.href);
      if (!u.searchParams.has('link')) return;
      u.searchParams.delete('link');
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch (e) {
      try { history.replaceState(null, '', window.location.pathname); } catch (e2) {}
    }
  }

  /* ════ التخزين المحلي ════ */
  function _load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (!o || !RE_ADDR.test(o.address) || !RE_KEY.test(o.key)) { localStorage.removeItem(LS_KEY); return null; }
      return { address: o.address, key: o.key, savedAt: o.savedAt || 0, validUntil: Number(o.validUntil) || null };
    } catch (e) { return null; }
  }
  function _save(rec) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(rec)); } catch (e) {}
    /* يطلب من المتصفح عدم تفريغ التخزين تلقائياً تحت ضغط المساحة */
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
  }
  function forget() { try { localStorage.removeItem(LS_KEY); } catch (e) {} }

  function hasLink() { return !!parseFromLocation() || !!_load(); }
  function isActive() { return !!(State.wallet && State.wallet.isAgentLink); }
  function source() { return _source; }

  /* اتصال محفظة رئيسية/رابط جديد يلغي أي جلسة اتصال أخرى محفوظة */
  function _supersedeOtherSessions() {
    try {
      if (typeof PRIVY_FLAG_KEY !== 'undefined') localStorage.removeItem(PRIVY_FLAG_KEY);
      if (typeof EXTWALLET_FLAG_KEY !== 'undefined') localStorage.removeItem(EXTWALLET_FLAG_KEY);
    } catch (e) {}
  }

  /* ════ الاستهلاك عند الإقلاع — رابط ?link= أولاً، ثم الجلسة المحفوظة ════ */
  function tryConsume() {
    const hadParam = _rawParam() !== null;
    let data = hadParam ? parseFromLocation() : null;
    let src = data ? 'url' : null, rec = null;

    if (hadParam) {
      _stripUrl();
      if (!data && typeof toast === 'function') toast('⚠️ رابط الوكيل غير صالح أو تالف', 'err', 6000);
    }
    if (!data) {
      rec = _load();
      if (rec) { data = rec; src = 'stored'; }
    }
    if (!data) return false;

    if (src === 'stored' && rec.validUntil && rec.validUntil <= Date.now()) {
      forget();
      showRevokedNotice('expired', rec.address);
      return false;
    }

    let agentWallet;
    try { agentWallet = new ethers.Wallet(data.key); }
    catch (e) { if (src === 'stored') forget(); return false; }

    State.agent  = agentWallet;
    State.wallet = {
      address: data.address,
      walletClientType: 'agentlink',
      walletName: 'رابط وكيل تداول',
      isAgentLink: true,
      signTypedData:     () => Promise.reject(new Error('LINK_MODE_NO_MASTER_KEY')),
      getArbitrumSigner: () => Promise.reject(new Error('LINK_MODE_NO_MASTER_KEY')),
    };
    State.isGuest = false;

    if (src === 'url') {
      _supersedeOtherSessions();
      _save({ address: data.address, key: data.key, savedAt: Date.now(), validUntil: null });
    }
    _source = src;
    return true;
  }

  /* ════ التحقق من صلاحية الوكيل عند Hyperliquid ════ */
  async function _lookup(mainAddr, agentAddrLower) {
    let list;
    try { list = await hlInfo({ type: 'extraAgents', user: mainAddr }); }
    catch (e) { return { s: 'unknown' }; }
    if (!Array.isArray(list)) return { s: 'unknown' };
    const rec = list.find(a => String((a && a.address) || '').toLowerCase() === agentAddrLower);
    if (!rec) return { s: 'missing' };
    const vu = Number(rec.validUntil) || null;
    if (vu && vu <= Date.now()) return { s: 'expired' };
    return { s: 'ok', validUntil: vu };
  }

  async function verify() {
    const w = State.wallet;
    if (!w || !w.isAgentLink || !State.agent || _checking) return 'skip';
    _checking = true; _lastCheck = Date.now();
    const mainAddr = w.address, me = State.agent.address.toLowerCase();
    try {
      let r = await _lookup(mainAddr, me);
      if (r.s === 'missing') {
        await _sleep(RECHECK_DELAY_MS);
        if (State.wallet !== w) return 'skip';
        r = await _lookup(mainAddr, me);
      }
      if (State.wallet !== w) return 'skip';

      if (r.s === 'missing' || r.s === 'expired') {
        handleRevoked(r.s === 'expired' ? 'expired' : 'deleted');
        return 'revoked';
      }
      if (r.s === 'ok' && r.validUntil) {
        const rec = _load();
        if (rec && rec.validUntil !== r.validUntil) { rec.validUntil = r.validUntil; _save(rec); }
      }
      return r.s; // 'ok' | 'unknown'
    } finally { _checking = false; }
  }

  function startWatch() {
    stopWatch();
    _timer = setInterval(verify, CHECK_MS);
    if (!_visBound) {
      _visBound = true;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && isActive() && Date.now() - _lastCheck > FOCUS_MIN_GAP_MS) verify();
      });
    }
    verify();
  }
  function stopWatch() { clearInterval(_timer); _timer = null; }

  /* ════ حذف/انتهاء الوكيل ════ */
  function handleRevoked(reason) {
    const mainAddr = State.wallet ? State.wallet.address : null;
    release();
    if (State.wallet && State.wallet.isAgentLink && typeof doLogout === 'function') doLogout({ silent: true });
    showRevokedNotice(reason, mainAddr);
  }

  /* جلسة الوكيل تنتهي نهائياً (إلغاء يدوي أو اتصال رئيسي أو حذف) */
  function release() { forget(); stopWatch(); _source = null; }

  /* ════ إشعار وسط الشاشة (30 ثانية) ════ */
  function dismissNotice() {
    clearTimeout(_noticeTimer); _noticeTimer = null;
    const el = document.getElementById(NOTICE_ID);
    if (el) el.remove();
  }

  function showRevokedNotice(reason, mainAddr) {
    dismissNotice();
    const expired = reason === 'expired';
    const el = document.createElement('div');
    el.id = NOTICE_ID;
    el.className = 'al-notice-ov';
    el.setAttribute('role', 'alertdialog');
    el.innerHTML =
      '<div class="al-notice-card">' +
        '<div class="al-notice-ic">🔗</div>' +
        '<h3 class="al-notice-title">' + (expired ? 'انتهت صلاحية محفظة الوكيل' : 'تم حذف محفظة الوكيل') + '</h3>' +
        '<p class="al-notice-txt">' +
          (expired ? 'انتهت مدة صلاحية هذا الوكيل ولم يعد صالحاً للتداول.'
                   : 'أُبطل هذا الوكيل من المحفظة الرئيسية ولم يعد صالحاً للتداول.') +
          '<br>للمتابعة: <b>ضع رابط محفظة وكيل أخرى</b> في المتصفح، أو <b>اتصل بالمحفظة الرئيسية</b> لإنشاء رابط وكيل جديد.' +
        '</p>' +
        (mainAddr && RE_ADDR.test(mainAddr) ? '<div class="al-notice-addr">' + _short(mainAddr) + '</div>' : '') +
        '<div class="al-notice-btns">' +
          '<button class="al-notice-btn pri" data-al="connect">🔌 اتصال بالمحفظة</button>' +
          '<button class="al-notice-btn" data-al="close">إغلاق</button>' +
        '</div>' +
        '<div class="al-notice-bar"><i style="animation-duration:' + NOTICE_MS + 'ms"></i></div>' +
      '</div>';
    el.addEventListener('click', e => {
      const b = e.target && e.target.closest ? e.target.closest('[data-al]') : null;
      if (b) {
        dismissNotice();
        if (b.dataset.al === 'connect' && typeof connectWallet === 'function') connectWallet();
      } else if (e.target === el) dismissNotice();
    });
    document.body.appendChild(el);
    _noticeTimer = setTimeout(dismissNotice, NOTICE_MS);
  }

  return {
    build, parseFromLocation, hasLink, tryConsume, source, isActive,
    verify, startWatch, stopWatch, release, forget,
    handleRevoked, showRevokedNotice, dismissNotice,
  };
})();

window.AgentLink = AgentLink;
