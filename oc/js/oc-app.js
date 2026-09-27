/* ═══════════════════════════════════════════════════════════════
   oc-app.js — التشغيل وربط الأحداث

   الترتيب: قفل PIN → الثيم → التبويبات → القائمة/العنوان → النوافذ →
   تحميل outcomeMeta → بثّ الأسعار → استعادة الجلسة (رابط وكيل ← بريد
   Privy ← محفظة خارجية ← ضيف) — بنفس تسلسل المشروع الأصلي.

   ملاحظة: updateConnectBtn / updateAddrPopoverText / doLogout /
   connectWallet / connectEmail / lockApp ... كلها من core/*.js بلا لمس.
═══════════════════════════════════════════════════════════════ */
'use strict';

/* ════ أسماء تناديها core/*.js ولا وجود لها بأسواق التوقعات ════ */
function preloadCalendarData()   {}
function teardownCalendarPreload() {}
function openCalendar()          {}
function _updateMarketCardPrice(){}
function _updateMarketCardChg()  {}
const ChartModule = { load() {}, destroy() {} };

/* الدرج (☰) — نفس الاسم الذي تناديه auth.js:connectWallet */
function openDock()  { oc$('ocDock')?.classList.add('open'); }
function closeDock() { oc$('ocDock')?.classList.remove('open'); }

function _toggleAddrPopover(on) {
  const p = oc$('addrPopover');
  if (!p) return;
  const show = (on === undefined) ? p.classList.contains('hidden') : !!on;
  p.classList.toggle('hidden', !show);
  if (show) {
    if (typeof updateAddrPopoverText === 'function') updateAddrPopoverText();
    if (typeof _updateExplorerLinks === 'function') _updateExplorerLinks();
  }
}

/* عنوان الإيداع داخل النافذة */
function _fillDepositAddr() {
  const a = State.wallet?.address || '—';
  ocSetTxt('depositAddrTxt', a);
  const wd = oc$('withdrawAddress');
  if (wd && !wd.value && State.wallet) wd.value = State.wallet.address;
}

const OcApp = (function () {

  /* ════ الثيم ════ */
  function _initTheme() {
    const saved = localStorage.getItem(OC_LS_THEME) || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    _paintTheme(saved);
    const t = oc$('btnTheme');
    if (t) t.onclick = () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem(OC_LS_THEME, next); } catch {}
      _paintTheme(next); ocBuzz();
    };
  }
  function _paintTheme(v) { ocSetTxt('btnTheme', v === 'dark' ? '🌙' : '☀️'); }

  /* ════ التبويبات ════ */
  function _initTabs() {
    document.querySelectorAll('.oc-tab').forEach(b => b.onclick = () => {
      if (b.dataset.view === 'market' && !OcState.active) return toast('افتح سوقاً أولاً', 'info');
      ocBuzz(); OcUI.go(b.dataset.view);
    });
  }

  /* ════ الشريط العلوي والدرج ════ */
  function _initChrome() {
    const btn = oc$('btnConnect'), pop = oc$('addrPopover');
    if (btn) btn.onclick = () => {
      if (State.isGuest || !State.wallet) return connectWallet();
      _toggleAddrPopover();
    };
    if (pop) document.addEventListener('click', e => {
      if (!pop.contains(e.target) && btn && !btn.contains(e.target)) pop.classList.add('hidden');
    });
    const cp = oc$('addrPopoverCopy');
    if (cp) cp.onclick = async () => {
      try { await navigator.clipboard.writeText(State.wallet?.address || ''); toast('✅ تم نسخ العنوان', 'ok'); } catch {}
    };
    const dc = oc$('addrPopoverDisconnect');
    if (dc) dc.onclick = () => { _toggleAddrPopover(false); openModal('modalLogout'); };

    const menu = oc$('btnMenu'); if (menu) menu.onclick = openDock;
    const lock = oc$('btnLock'); if (lock) lock.onclick = () => lockApp(true);
    document.querySelectorAll('[data-dock-close]').forEach(b => b.onclick = closeDock);

    const map = {
      dockDeposit:  () => { _fillDepositAddr(); openModal('modalDeposit'); },
      dockWithdraw: () => { _fillDepositAddr(); openModal('modalWithdraw'); },
      dockHistory:  () => showHistory(),
      dockAgents:   () => { if (typeof Agents !== 'undefined') Agents.openModal(); },
      dockExport:   () => exportWallet(),
      dockPin:      () => openModal('modalSetPIN'),
      dockLogout:   () => openModal('modalLogout')
    };
    Object.keys(map).forEach(id => {
      const el = oc$(id);
      if (el) el.onclick = () => { closeDock(); map[id](); };
    });
  }

  /* ════ النوافذ ════ */
  function _initModals() {
    const close = (btnId, modalId) => { const b = oc$(btnId); if (b) b.onclick = () => closeModal(modalId); };
    close('loginClose',     'modalLogin');
    close('historyClose',   'modalHistory');
    close('depositCancel',  'modalDeposit');
    close('withdrawCancel', 'modalWithdraw');
    close('logoutCancel',   'modalLogout');

    const em = oc$('connectEmailBtn'); if (em) em.onclick = connectEmail;
    const lo = oc$('logoutExecute');   if (lo) lo.onclick = doLogout;

    const dcp = oc$('depositAddrCopy');
    if (dcp) dcp.onclick = async () => {
      try { await navigator.clipboard.writeText(State.wallet?.address || ''); toast('✅ تم نسخ العنوان', 'ok'); } catch {}
    };

    /* PIN */
    const pc = oc$('pinCancel'); if (pc) pc.onclick = () => closeModal('modalPIN');
    const pl = oc$('pinLogout'); if (pl) pl.onclick = () => { closeModal('modalPIN'); openModal('modalForgotPIN'); };
    const fc = oc$('forgotCancel'); if (fc) fc.onclick = () => closeModal('modalForgotPIN');
    const f1 = oc$('forgotStep1');
    const f2 = oc$('forgotStep2');
    if (f1) f1.onclick = () => { f1.classList.add('hidden'); f2?.classList.remove('hidden'); };
    if (f2) f2.onclick = () => { localStorage.clear(); location.reload(); };

    /* إغلاق بالنقر على الخلفية */
    document.querySelectorAll('.modal-overlay').forEach(ov => ov.addEventListener('click', e => {
      if (e.target === ov) ov.classList.remove('open');
    }));
  }

  /* ════ البحث والترتيب ════ */
  function _initSearch() {
    const s = oc$('ocSearch');
    if (s) {
      let tm = null;
      s.oninput = () => {
        clearTimeout(tm);
        tm = setTimeout(() => { OcState.query = s.value; OcUI.renderMarkets(); }, 180);
      };
    }
    const sort = oc$('ocSort');
    if (sort) {
      sort.value = localStorage.getItem(OC_LS_SORT) || 'time';
      OcState.sort = sort.value;
      sort.onchange = () => {
        OcState.sort = sort.value;
        try { localStorage.setItem(OC_LS_SORT, sort.value); } catch {}
        OcUI.renderMarkets();
      };
    }
  }

  /* ════ تذكرة الأمر ════ */
  function _initTicket() {
    document.querySelectorAll('[data-dir]').forEach(b => b.onclick = () => {
      OcState.ticket.dir = b.dataset.dir; ocBuzz(); OcUI.renderTicket();
    });
    document.querySelectorAll('[data-type]').forEach(b => b.onclick = () => {
      OcState.ticket.type = b.dataset.type; OcState.ticket.px = ''; OcUI.renderTicket();
    });

    const usd = oc$('ocUsd'), sz = oc$('ocSz'), px = oc$('ocPx');
    if (usd) usd.oninput = () => { OcState.ticket.usd = usd.value; OcState.ticket.mode = 'usd'; OcOrder.syncFromUsd(); OcUI.renderTicket(); };
    if (sz)  sz.oninput  = () => { OcState.ticket.sz  = sz.value;  OcState.ticket.mode = 'sz';  OcOrder.syncFromSz();  OcUI.renderTicket(); };
    if (px)  px.oninput  = () => {
      OcState.ticket.px = px.value;
      if (OcState.ticket.mode === 'usd') OcOrder.syncFromUsd(); else OcOrder.syncFromSz();
      OcUI.renderTicket();
    };

    document.querySelectorAll('[data-quick]').forEach(b => b.onclick = () => {
      const t = OcState.ticket;
      if (t.dir === 'buy') {
        const v = b.dataset.quick === 'max' ? OcState.usdc : parseFloat(b.dataset.quick);
        t.usd = (Math.max(0, v) || 0).toFixed(2); t.mode = 'usd'; OcOrder.syncFromUsd();
      } else {
        const s = OcOrder.activeSide();
        const held = s ? OcPortfolio.sharesOf(s.token) : 0;
        const frac = b.dataset.quick === 'max' ? 1 : Math.min(1, parseFloat(b.dataset.quick) / 100);
        t.sz = ocWireSz(held * frac); t.mode = 'sz'; OcOrder.syncFromSz();
      }
      ocBuzz(); OcUI.renderTicket();
    });

    const sub = oc$('ocSubmit'); if (sub) sub.onclick = () => OcOrder.submit();
    const back = oc$('ocBack');  if (back) back.onclick = () => OcUI.closeMarket();
  }

  /* ════ الإيداع/السحب ════ */
  function _initFunds() {
    const d = oc$('depositExecute');  if (d) d.onclick = doDeposit;
    const w = oc$('withdrawExecute'); if (w) w.onclick = doWithdraw;
    ocSetTxt('wFeeAmt',   '$' + WITHDRAW_FEE_USDC.toFixed(2));
    ocSetTxt('wFeeExSend', '$' + (WITHDRAW_FEE_USDC + 20).toFixed(2));
    ocSetTxt('wFeeExNet',  '$20.00');
    const wa = oc$('withdrawAmount');
    if (wa) wa.oninput = () => {
      const v = parseFloat(wa.value || 0);
      const ok = isFinite(v) && v > WITHDRAW_FEE_USDC;
      ocShow('withdrawPreview', ok);
      if (ok) {
        ocSetTxt('wpSend', ocUsd(v));
        ocSetTxt('wpFee', '- ' + ocUsd(WITHDRAW_FEE_USDC));
        ocSetTxt('wpNet', ocUsd(v - WITHDRAW_FEE_USDC));
      }
    };
  }

  /* ════ تحميل الأسواق ════ */
  async function reload() {
    OcState.loaded = false; OcState.metaError = null;
    OcUI.renderMarkets();
    await OcPrices.loadMeta();
    OcState.loaded = true;
    OcUI.renderCats();
    OcUI.renderMarkets();
  }

  /* ════ الإقلاع ════ */
  async function boot() {
    /* 1) القفل أولاً — قبل أي رسم أو اتصال (نفس ترتيب المشروع الأصلي) */
    if (localStorage.getItem(LOCKED_KEY) === 'true') lockApp();
    else document.documentElement.removeAttribute('data-boot-lock');

    ocLoadFavs();
    _initTheme();
    _initTabs();
    _initChrome();
    _initModals();
    _initSearch();
    _initTicket();
    _initFunds();
    updateConnectBtn();
    OcPortfolio._renderBalanceFromState();
    OcUI.go('markets');

    oc$('loginScreen')?.classList.add('hidden');
    oc$('appScreen')?.classList.remove('hidden');

    /* 2) الأسعار + الأسواق */
    OcPrices.onUpdate(() => OcUI.onPrices());
    try { await reload(); }
    catch (e) { OcState.loaded = true; OcState.metaError = errToAr(e.message); OcUI.renderMarkets(); }
    OcPrices.start();

    /* 3) استعادة الجلسة — نفس أولويات المشروع الأصلي */
    try {
      let restored = false;
      if (typeof AgentLink !== 'undefined' && AgentLink.parseFromLocation && AgentLink.parseFromLocation()) {
        restored = await AgentLink.tryConsume();
        if (restored) await _onAgentLinkConnected();
      }
      if (!restored && localStorage.getItem(PRIVY_FLAG_KEY) === '1') {
        try { await _loadPrivyBridge(); } catch (e) { console.warn('[privy]', e.message); }
      }
      if (!restored && localStorage.getItem(EXTWALLET_FLAG_KEY) && typeof Wallets !== 'undefined') {
        const w = await Wallets.reconnectSilently();
        if (w) await _onWalletConnected(w);
      }
    } catch (e) { console.warn('[oc boot session]', e.message); }

    if (!State.wallet) { State.isGuest = true; State._identityReady = true; updateConnectBtn(); }

    /* 4) تحديث العدّادات التنازلية */
    setInterval(() => { if (OcState.view === 'markets') OcUI.renderMarkets(); }, 60000);
  }

  return { boot, reload };
})();

document.addEventListener('DOMContentLoaded', () => { OcApp.boot(); });
