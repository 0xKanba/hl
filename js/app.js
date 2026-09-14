/* ═══════════════════════════════════════
   app.js — appbar + tabbar سفلي (3 أزرار) + دوك أيقونات جانبي
   ✅ راوتر شاشات: الرئيسية / الأسواق / الرسم البياني (data-screen)
      — switchScreen() المسؤول الوحيد عن إظهار/إخفاء أي من الثلاث،
      بما فيها الرسم البياني الآن (لم يعد overlay منفصلاً — راجع
      index.html/chart.js). تستدعي ChartModule.open()/close() فقط
      عند الدخول/الخروج من شاشة الرسم تحديداً، بلا أي منطق إضافي.
   ✅ جديد — الدرج المنبثق (drawerOverlay/.drawer) استُبدل بالكامل
      بـ"دوك" (Dock): عمود أيقونات دائم الظهور يمين الشاشة (لا يُحكَم
      بـ.hidden/.open — عائم عمودياً بمنتصف الشاشة طوال الوقت)، يتمدّد
      فقط لعرض العناوين عند نقر ☰ (.expanded على #dock). كل زر بداخله
      (.dock-item) له onclick واحد يعمل بصرف النظر عن حالة التمدد —
      "أيقونة تُنقر مباشرة دون فتح اللوحة" بالضبط كما طُلب. نفس الـIDs
      القديمة تماماً لعناصر الإجراءات (optDeposit/optWithdraw/...)،
      فمنطق الحراسات (تسجيل دخول/وضع رابط وكيل) أدناه لم يتغيّر إطلاقاً
      — فقط غلاف الإغلاق تغيّر اسمه من _drawerAction إلى _dockAction.
   ✅ جديد — زر تبديل المظهر أصبح زراً واحداً (#dockTheme) بدل شعارين
      منفصلين (☀️/🌙) كانا يعيشان أسفل الدرج القديم. الأيقونة والعنوان
      بداخله يعكسان المظهر الحالي فعلياً ويتبدّلان فور كل تبديل
      (_syncThemeToggleUI)، والنقر يقلب الحالة مباشرة (_initThemeToggle).
   ✅ عنوان الحساب المتصل بالـappbar الآن popover صغير (نسخ + إلغاء
      اتصال يفتح modalLogout) بدل مودال منفصل مباشرة عند نقر الزر.
   ✅ "الرصيد" حُذف من القائمة نهائياً — بطاقة دائمة أعلى الرئيسية الآن
      (راجع account.js:_renderBalanceFromState).
   ✅ FIX (شاشة الأسواق الافتراضية) — "الأسواق" الآن الشاشة الافتراضية
      عند الإقلاع (_activeScreen أدناه)، لا "الرئيسية". التبديل
      الابتدائي بين .hidden/.active على screenHome/screenMarkets +
      tabHome/tabMarkets تم بـindex.html — هذا الملف فقط يطابق نفس
      الحالة الابتدائية بمتغيّره الداخلي.
   ✅ FIX — استطلاع بطاقات الأسواق القديم (مؤقّت setInterval كل ثانية
      بهذا الملف: _refreshMarketCards/_startMarketsRefresh) حُذف
      بالكامل. كان يقرأ نفس State.prices/prevDayPx التي يقرأها تاب
      الرئيسية لكن بمؤقّت منفصل — تأخير محسوس حتى ثانية كاملة، ومصدرين
      مستقلّين يكتبان لعناصر مرتبطة بنفس الحالة (خطر تضارب لاحق). الآن
      prices.js تكتب مباشرة لعناصر البطاقة (mktPrice* / mktChg*) بنفس
      لحظة كل WS tick (بلا أي مؤقّت)، وsession.js تفعل المثل من الكاش
      المحلي فور الإقلاع. تفعيل البطاقة النشطة (.active) انتقل لـ
      switchAsset() بـassets.js (فوري أيضاً، أي مصدر تبديل).
   ✅ جديد — نافذة معلومات الأصل: زر "؟" بجانب اسم كل بطاقة بشاشة
      الأسواق يفتح modalAssetInfo (صورة ← رافعة ← شرح مختصر). الرافعة
      تُقرأ حيّاً من ASSETS[sym].lev (config.js) — مصدر واحد، لا رقم
      مكرَّر. الاسم المعروض بالنافذة يُقرأ من نص البطاقة نفسها (مصدر
      واحد أيضاً)، لا خريطة أسماء منفصلة قد تنحرف عن HTML لاحقاً.
   ✅ بطاقات الأسواق (شاشة الأسواق) — بدون أي مؤقّت الآن (راجع أعلاه):
      السعر/النسبة من prices.js وsession.js، البطاقة النشطة من
      assets.js. app.js لا يلمس prices.js/session.js بمنطقها الداخلي
      — فقط الدالتان الجاهزتان (_updateMarketCardPrice/Chg) تُستدعيان
      من هناك، بلا أي تغيير على أسلوب push الحي الأصلي لـWS.
   ✅ جديد — وضع "رابط الوكيل" (js/agentlink.js): يُفحص أولاً بتسلسل
      الإقلاع، قبل Privy/EXTWALLET — رابط صالح بالعنوان يعني جلسة
      تداول جاهزة فوراً بلا أي توقيع. أزرار الإيداع/السحب/الوكلاء
      بالدوك تُحجب برسالة واضحة بهذا الوضع (لا مفتاح محفظة رئيسية
      متاح محلياً أصلاً ليُستخدم لأي منها).

   ✅ إصلاح توقيت جوهري (2026-08) — قفل PIN كان يتأخر 600ms على الأقل
      (وأحياناً لا يظهر إطلاقاً لو تجاوز اتصال المحفظة تلك المهلة، لأن
      الفحص كان `if (State.wallet)` بعد setTimeout ثابت — سباق حقيقي
      ضد الشبكة). القفل نفسه لا يعتمد على أي بيانات شبكة أو حتى معرفة
      "ضيف أم متصل" إطلاقاً — فقط PIN_KEY/LOCKED_KEY المحليان. الآن
      يُفحص ويُطلَق فوراً كأول سطر بكامل معالج DOMContentLoaded، قبل
      أي شيء آخر، بلا أي انتظار أو شرط على State.wallet. بالتزامن مع
      هذا: سكربت <head> جديد بـindex.html (data-boot-lock) يُخفي
      .app-shell بالكامل قبل أول رسم أصلاً لو كان القفل مفعَّلاً آخر
      جلسة — فلا وميض لواجهة التداول خلف الشاشة حتى قبل أن يصل تنفيذ
      JS لهذا السطر. راجع css/base.css وjs/pin.js:unlockApp لبقية
      الآلية. النسخة المكرَّرة من نفس الفحص بنهاية _onWalletConnected
      (auth.js) حُذفت أيضاً — مصدر واحد فقط الآن.
═══════════════════════════════════════ */
'use strict';

/* ✅ إصلاح — وصول آمن للعناصر داخل DOMContentLoaded.
   سابقاً كانت عشرات الروابط بصيغة $('id').onclick = ... بلا حماية؛
   أي معرّف مفقود أو معاد تسميته بـindex.html يرمي TypeError في منتصف
   المعالج، فتُلغى كل الروابط التالية وتسلسل الإقلاع نفسه — التطبيق
   يظهر لكنه ميت. _el() تُرجع عنصراً وهمياً غير ضار وتُسجّل تحذيراً
   بدل الانهيار. */
const _NOOP_EL = {
  onclick: null, oninput: null, value: '', textContent: '', min: '', placeholder: '',
  addEventListener() {}, removeEventListener() {}, select() {}, focus() {}, contains() { return false; },
  querySelector() { return null; }, querySelectorAll() { return []; },
  classList: { contains: () => false, add() {}, remove() {}, toggle() {} },
  dataset: {}, style: {}
};
function _el(id) {
  const e = typeof $ === 'function' ? $(id) : document.getElementById(id);
  if (e) return e;
  console.warn('[app] عنصر مفقود بالـDOM: #' + id);
  return _NOOP_EL;
}


const _AR_MONTHS = [
  'يناير','فبراير','مارس','أبريل','مايو','يونيو',
  'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'
];

function _startDatetimeClock() {
  const el = document.getElementById('dtClock');
  if (!el) return;
  const tick = () => {
    const now = new Date(Date.now() + 3 * 3600000);
    const d   = String(now.getUTCDate()).padStart(2,'0');
    const mo  = _AR_MONTHS[now.getUTCMonth()];
    const y   = now.getUTCFullYear();
    let   h   = now.getUTCHours();
    const m   = String(now.getUTCMinutes()).padStart(2,'0');
    const s   = String(now.getUTCSeconds()).padStart(2,'0');
    const ap  = h >= 12 ? 'مساءً' : 'صباحاً';
    h = h % 12 || 12;
    el.textContent = `${d} ${mo} ${y} · ${String(h).padStart(2,'0')}:${m}:${s} ${ap}`;
  };
  tick();
  setInterval(tick, 1000);
}

function _initMonthsPanel() {
  const bar   = document.getElementById('datetimeBar');
  const panel = document.getElementById('monthsPanel');
  if (!bar || !panel) return;
  bar.addEventListener('click', () => panel.classList.toggle('hidden'));
  document.addEventListener('click', e => {
    if (!bar.contains(e.target) && !panel.contains(e.target))
      panel.classList.add('hidden');
  });
}

/* ✅ زر واحد الآن (#dockTheme داخل الدوك) بدل شعارين منفصلين —
   _syncThemeToggleUI() تحدّث أيقونة/عنوان هذا الزر ليعكسا المظهر
   الحالي فعلياً، _setTheme() تُطبَّق صراحة من _initThemeToggle أدناه. */
function _applyTheme(theme, animate) {
  if (animate) {
    document.documentElement.classList.add('theme-transitioning');
    setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 320);
  }
  document.documentElement.setAttribute('data-theme', theme);
  _syncThemeToggleUI();
}

function _initTheme() {
  const saved = localStorage.getItem('hl_theme');
  const sys   = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  _applyTheme(saved || sys, false);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (!localStorage.getItem('hl_theme')) _applyTheme(e.matches ? 'dark' : 'light', true);
  });
}

/* ✅ يحدّث أيقونة/عنوان زر تبديل المظهر الموحّد (#dockTheme) — يعرض
   حالة المظهر الحالية (لا الحالة التي سيتحوّل إليها)، مطابقاً نفس
   اصطلاح "الأيقونة تعكس ما هو نشط الآن" المعتمَد ببقية أزرار الدوك. */
function _syncThemeToggleUI() {
  const cur  = document.documentElement.getAttribute('data-theme') || 'dark';
  const icon = $('dockThemeIcon');
  const lbl  = $('dockThemeLbl');
  if (icon) icon.textContent = cur === 'dark' ? '🌙' : '☀️';
  if (lbl)  lbl.textContent  = cur === 'dark' ? 'المظهر الداكن' : 'المظهر الفاتح';
}
function _setTheme(theme) {
  if (theme === (document.documentElement.getAttribute('data-theme') || 'dark')) return;
  localStorage.setItem('hl_theme', theme);
  _applyTheme(theme, true);
}
function _initThemeToggle() {
  $('dockTheme')?.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    _setTheme(cur === 'dark' ? 'light' : 'dark');
  });
  _syncThemeToggleUI();
}

function _initQtyInput() {
  const input = $('qtyInput');
  if (!input) return;
  const a = ASSETS[State.asset];
  const defaultVal = a?.presets?.[0] ?? 1;
  if (!input.value || +input.value <= 0) {
    input.value = defaultVal;
    State.qty   = defaultVal;
  }
  input.addEventListener('focus', () => { input.select?.(); });
  input.addEventListener('blur', () => {
    if (!input.value || +input.value <= 0) {
      const asset = ASSETS[State.asset];
      const def   = asset?.presets?.[0] ?? 1;
      input.value = def;
      State.qty   = def;
    }
  });
  input.oninput = function () {
    this._userEdited = true; /* ✅ إصلاح — كان العلم لا يُضبط أبداً */
    State.qty = parseFloat(this.value) || 0;
  };
}

function _initWithdrawFeeUI() {
  const fee = WITHDRAW_FEE_USDC;
  setTxt('wFeeAmt', `$${fee.toFixed(2)}`);
  const exSend = fee + 20;
  setTxt('wFeeExSend', `$${exSend.toFixed(2)}`);
  setTxt('wFeeExNet',  `$${(exSend - fee).toFixed(2)}`);
  const amtEl = $('withdrawAmount');
  if (amtEl) {
    amtEl.min = String(fee + 1);
    amtEl.placeholder = String(exSend);
  }
}

function _initAgentCopy() {
  if (typeof Agents === 'undefined') return;
  const days = Math.round(Agents.TTL_MS / 86400000);
  setTxt('agentTtlTxt1', `${days} يوم`);
  setTxt('agentTtlTxt2', `${days} يوم، ويُطلب توقيع جديد عند الحاجة`);
}

/* عنوان محفظة المستخدم داخل modalDeposit نفسها — بلا تغيير */
function _fillDepositAddr() {
  const addr = State.wallet?.address || '—';
  setTxt('depositAddrTxt', addr);
  const btn = $('depositAddrCopy');
  if (btn) btn.onclick = () => {
    if (!State.wallet) return;
    navigator.clipboard?.writeText(State.wallet.address)
      .then(() => toast('✅ تم نسخ العنوان', 'info', 2000))
      .catch(() => toast('تعذّر النسخ', 'err'));
  };
}

/* ═══════════════════════════════════════
   ✅ راوتر الشاشات — الرئيسية / الأسواق / الرسم البياني
   الرسم البياني شاشة ثالثة عادية الآن (data-screen="chart") — هذه
   الدالة وحدها مسؤولة عن إظهار/إخفاء أي من الثلاث (.hidden)؛ فقط
   تستدعي ChartModule.open()/close() لإدارة محتواها الداخلي (الودجت/
   اشتراك BBO/الساعة) عند الدخول/الخروج تحديداً — لا علاقة له بإظهار
   العنصر نفسه، فلا حاجة لمراقب DOM منفصل كما سابقاً.
   ✅ الافتراضية الآن "markets" (كانت "home") — يطابق الحالة الابتدائية
      بـindex.html (screenMarkets ظاهرة، tabMarkets نشط ابتدائياً).
═══════════════════════════════════════ */
let _activeScreen = 'markets';

function switchScreen(name) {
  if (name === _activeScreen) return;
  const next = document.querySelector(`.app-screen[data-screen="${name}"]`);
  if (!next) return;
  const current = document.querySelector(`.app-screen[data-screen="${_activeScreen}"]`);
  if (current) current.classList.add('hidden');

  if (_activeScreen === 'chart' && typeof ChartModule !== 'undefined') ChartModule.close();

  next.classList.remove('hidden');
  /* إعادة تشغيل أنيميشن الدخول حتى لو الشاشة كانت مبنية أصلاً */
  next.classList.remove('screen-anim');
  void next.offsetWidth; /* إجبار reflow */
  next.classList.add('screen-anim');

  _activeScreen = name;
  _syncTabbarActive();

  if (name === 'chart' && typeof ChartModule !== 'undefined') {
    ChartModule.open(State.asset);
  } else {
    const scroller = next.querySelector('.screen-scroll');
    if (scroller) scroller.scrollTop = 0;
  }
}

function _syncTabbarActive() {
  document.querySelectorAll('.tab-btn[data-tab]').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === _activeScreen)
  );
}

/* ═══════════════════════════════════════
   ✅ DOCK — عمود الأيقونات الجانبي الدائم (بديل الدرج المنبثق القديم).
   openDock/closeDock يبدّلان فقط .expanded على #dock — الأزرار نفسها
   (.dock-item) تبقى مرسومة وتعمل طوال الوقت بصرف النظر عن هذه الحالة،
   فـ_dockAction لا تفعل شيء أكثر من "أغلق (إن كان مفتوحاً، وإلا فلا
   شيء) ثم نفّذ الإجراء" — تماماً كيف كان _drawerAction يتصرّف مع الدرج
   القديم، فقط بمصطلحات جديدة. لا خلفية معتمة كاملة الشاشة بعد الآن
   (#dockBackdrop حُذف — راجع components.css:"جولة خامسة") لأن التمدد
   لم يعد يغطّي الشاشة كلها؛ بدلاً منه: نقرة خارج #dock (أو خارج زر ☰
   نفسه) بينما الدوك متمدد تُغلقه — بنفس نمط _initAddrPopover أدناه. */
function openDock() {
  $('dock')?.classList.add('expanded');
}
function closeDock() {
  $('dock')?.classList.remove('expanded');
}
function _dockAction(fn) {
  return () => { closeDock(); fn(); };
}
function _initDock() {
  $('btnMenu')?.addEventListener('click', () => {
    const d = $('dock');
    if (d && d.classList.contains('expanded')) closeDock(); else openDock();
  });
  document.addEventListener('click', e => {
    const d = $('dock');
    if (!d || !d.classList.contains('expanded')) return;
    if (d.contains(e.target) || $('btnMenu')?.contains(e.target)) return;
    closeDock();
  });
}

/* ═══════════════════════════════════════
   ✅ عنوان الحساب بالـappbar — popover صغير بدل مودال منفصل مباشرة.
   الزر نفسه (btnConnect) يُلوَّن/يُسمّى عادةً عبر auth.js:updateConnectBtn؛
   هنا فقط التبديل + الإغلاق بالنقر خارجه + النسخ/إلغاء الاتصال.
═══════════════════════════════════════ */
function _toggleAddrPopover(forceOpen) {
  const pop = $('addrPopover');
  if (!pop) return;
  const open = forceOpen !== undefined ? forceOpen : pop.classList.contains('hidden');
  pop.classList.toggle('hidden', !open);
  if (open && typeof _updateExplorerLinks === 'function') _updateExplorerLinks();
}
function _initAddrPopover() {
  $('addrPopoverCopy')?.addEventListener('click', () => {
    if (!State.wallet) return;
    navigator.clipboard?.writeText(State.wallet.address)
      .then(() => toast('✅ تم نسخ العنوان', 'info', 2000))
      .catch(() => toast('تعذّر النسخ', 'err'));
  });
  $('addrPopoverDisconnect')?.addEventListener('click', () => {
    _toggleAddrPopover(false);
    openModal('modalLogout');
  });
  document.addEventListener('click', e => {
    const pop = $('addrPopover');
    if (!pop || pop.classList.contains('hidden')) return;
    if (pop.contains(e.target) || $('btnConnect')?.contains(e.target)) return;
    _toggleAddrPopover(false);
  });
}

/* ═══════════════════════════════════════
   ✅ نافذة معلومات الأصل — "؟" بجانب اسم كل بطاقة بشاشة الأسواق.
   الوصف فقط مصدره هنا (لا يوجد بمكان آخر بالمشروع)؛ الرافعة تُقرأ
   حيّاً من ASSETS[sym].lev، والاسم المعروض يُقرأ من نص البطاقة نفسها
   (btn.dataset.info + العثور على .market-card-name المجاورة) — بلا
   أي خريطة أسماء JS منفصلة قد تنحرف لاحقاً عن HTML.
═══════════════════════════════════════ */
const ASSET_INFO_DESC = {
  CL:     'يشير WTIOIL إلى سعر برميل واحد من خام غرب تكساس الوسيط الخفيف الحلو بالدولار الأمريكي. ويُعدّ خام غرب تكساس الوسيط معياراً عالمياً رئيسياً لأسعار النفط نظراً لجودته العالية (انخفاض الكثافة، وانخفاض نسبة الكبريت).',
  XAU:    'يشير هذا السعر إلى قيمة غرام واحد من الذهب بالدولار الأمريكي — مُشتق مباشرة من سعر الأونصة الفورية للذهب (GOLD) بعد قسمتها على 31.1035 غراماً (عدد غرامات أونصة التروي الواحدة). نفس مصدر السعر العالمي بالضبط، بوحدة أصغر تناسب من يفضّل التداول بالغرام بدل الأونصة الكاملة.',
  SILVER: 'يشير SILVER إلى سعر الدولار الأمريكي الفوري لأونصة تروي واحدة من الفضة (XAG/USD).',
  GOLD:   'يشير GOLD إلى سعر الذهب الفوري بالدولار الأمريكي لأونصة تروي واحدة من الذهب (XAU/USD).',
  NQ:     'يتتبع مؤشر XYZ100 مؤشراً معدلاً مرجحاً بالقيمة السوقية لـ100 من أكبر الشركات غير المالية وأكثرها تداولاً والمدرجة في بورصة أمريكية، ويعمل كمعيار مرجعي لأسهم التكنولوجيا والنمو الأمريكية ذات رأس المال الكبير.'
};

function openAssetInfoModal(sym, displayName) {
  const a = ASSETS[sym]; if (!a) return;
  setTxt('aiTitle', `${a.icon} ${displayName || a.name}`);
  const img = $('aiImg');
  if (img && ASSET_IMAGES[sym]) { img.src = ASSET_IMAGES[sym]; img.alt = sym; }
  setTxt('aiLev', `⚡ الرافعة المالية: ${a.lev}x`);
  setTxt('aiDesc', ASSET_INFO_DESC[sym] || '');
  openModal('modalAssetInfo');
}

function _initMarketInfoButtons() {
  document.querySelectorAll('.market-info-btn[data-info]').forEach(btn => {
    const open = () => {
      const sym = btn.dataset.info;
      const nameEl = btn.closest('.market-card-name-row')?.querySelector('.market-card-name');
      openAssetInfoModal(sym, nameEl?.textContent);
    };
    btn.onclick = e => { e.stopPropagation(); open(); };
    btn.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); open(); }
    });
  });
  $('aiClose')?.addEventListener('click', () => closeModal('modalAssetInfo'));
}

function openOptions() {
  /* إبقاء الاسم للتوافق لو استُدعيت من أي مكان قديم — الآن تفتح الدوك */
  openDock();
}
function closeOptions() {
  closeDock();
}

/* ✅ جديد — حارس موحّد لعمليات تحتاج توقيع المحفظة الرئيسية (إيداع/
   سحب/إدارة وكلاء) وغير متاحة إطلاقاً بوضع "رابط الوكيل" (لا يوجد
   مفتاح محفظة رئيسية محلياً بهذا الوضع أصلاً — راجع js/agentlink.js). */
function _blockIfAgentLink() {
  if (!State.wallet?.isAgentLink) return false;
  toast('🔗 وضع رابط الوكيل للتداول فقط — هذا الإجراء يحتاج الدخول بالمحفظة الرئيسية', 'info', 5500);
  return true;
}

document.addEventListener('DOMContentLoaded', () => {

  /* ✅ إصلاح توقيت جوهري (2026-08) — أول شيء يحدث بالإقلاع بالكامل،
     قبل أي تهيئة أخرى أو أي مسار اتصال. القفل لا يعتمد على أي بيانات
     شبكة ولا حتى على معرفة "ضيف أم متصل" — فقط PIN_KEY/LOCKED_KEY
     المحليان، متاحان فوراً بلا أي انتظار. لا setTimeout، لا شرط على
     State.wallet (كان السبب الحقيقي للتأخير القديم 600ms+ ولاحتمال
     عدم ظهور القفل إطلاقاً لو تجاوز اتصال المحفظة تلك المهلة — سباق
     حقيقي ضد الشبكة لشيء لا علاقة له بالشبكة إطلاقاً). سكربت <head>
     بـindex.html (data-boot-lock) يُخفي .app-shell بالكامل (بما فيها
     #dock — عنصر flex داخلها الآن، يرث الإخفاء تلقائياً بلا أي استثناء
     خاص مطلوب، راجع base.css) قبل هذا السطر حتى (قبل أول
     رسم أصلاً) فلا وميض ممكن مهما استغرق تحميل بقية السكربتات أدناه.
     راجع css/base.css وjs/pin.js:unlockApp لبقية الآلية. */
  if (localStorage.getItem(PIN_KEY) && localStorage.getItem(LOCKED_KEY) === 'true') {
    lockApp();
  }

  _initTheme();
  _startDatetimeClock();
  _initMonthsPanel();
  _initDock();
  _initAddrPopover();
  _initThemeToggle();
  _initQtyInput();
  _initWithdrawFeeUI();
  _initAgentCopy();
  _initMarketInfoButtons();

  $('connectEmailBtn')?.addEventListener('click', connectEmail);
  $('loginClose')?.addEventListener('click', () => { _stopWalletListWatch(); closeModal('modalLogin'); });
  $('loaderClose')?.addEventListener('click', hideLoader);

  /* تبويبات تبديل الأصل السريعة — تبقى بالرئيسية بلا أي تغيير */
  document.querySelectorAll('.tab[data-asset]').forEach(t =>
    t.onclick = () => switchAsset(t.dataset.asset)
  );

  /* بطاقات شاشة الأسواق — الضغط يبدّل الأصل ويعود للرئيسية */
  document.querySelectorAll('.market-card[data-asset]').forEach(c =>
    c.onclick = () => { switchAsset(c.dataset.asset); switchScreen('home'); }
  );

  /* ✅ Tabbar السفلي — 3 أزرار: رسم / رئيسية / أسواق (افتراضي الآن) —
     الثلاثة الآن تمر عبر switchScreen() نفسها (راجع تعليقها أعلاه) —
     لا حاجة لأي حالة خاصة بالرسم البياني هنا بعد الآن. */
  document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchScreen(btn.dataset.tab));
  });

  _el('btnConnect').onclick = e => {
    if (State.isGuest) { connectWallet(); return; }
    e.stopPropagation();
    _toggleAddrPopover();
  };

  /* ✅ نفس أزرار التذييل، كأول عناصر بالدوك */
  document.querySelectorAll('.dock-item[data-nav-screen]').forEach(btn => {
    btn.onclick = _dockAction(() => switchScreen(btn.dataset.navScreen));
  });

  /* ✅ محتويات الدوك — نفس الـIDs القديمة تماماً. القفل انتقل لـappbar
     (لم يعد بداخل الدوك، فلا حاجة لـ_dockAction هنا). المظهر أصبح
     زراً واحداً موحَّداً داخل الدوك نفسه (راجع _initThemeToggle). */
  _el('btnLock').onclick = () => { if (State.isGuest) return _promptConnect(); lockApp(true); };
  $('btnDocs')?.addEventListener('click', () => closeDock());

  _el('optHistory').onclick  = _dockAction(() => { if (State.isGuest) return _promptConnect(); showHistory(); });
  _el('optCalendar').onclick = _dockAction(() => { if (State.isGuest) return _promptConnect(); if (typeof openCalendar==='function') openCalendar(); });
  _el('optDeposit').onclick  = _dockAction(() => { if (State.isGuest) return _promptConnect(); if (_blockIfAgentLink()) return; _fillDepositAddr(); openModal('modalDeposit'); });
  _el('optWithdraw').onclick = _dockAction(() => { if (State.isGuest) return _promptConnect(); if (_blockIfAgentLink()) return; openModal('modalWithdraw'); });
  $('optExportWallet')?.addEventListener('click', _dockAction(exportWallet));
  $('optAgents')?.addEventListener('click', _dockAction(() => {
    if (State.isGuest) return _promptConnect();
    if (_blockIfAgentLink()) return;
    if (typeof Agents !== 'undefined') Agents.openModal();
  }));

  _el('btnBuy').onclick  = () => askTrade(true);
  _el('btnSell').onclick = () => askTrade(false);

  _el('qty100').onclick = () => {
    if (State.isGuest) return _promptConnect();
    const a   = ASSETS[State.asset];
    const bal = State.balance?.available || State.balance?.total || 0;
    const px  = State.prices[State.asset]?.mid;
    if (!bal || !px) return toast('رصيد غير متاح', 'err');
    const qty100 = parseFloat(wire((bal * a.lev) / px, a.szDp));
    State.qty = qty100;
    _el('qtyInput').value = qty100;
    toast(`✅ ${qty100} ${a.unit}`, 'ok');
  };

  _el('confirmCancel').onclick  = () => { closeModal('modalConfirm'); State.pendingTrade = null; };
  _el('confirmExecute').onclick = () => requirePin(execTrade);

  _el('closeCancel').onclick  = () => { closeModal('modalClose'); State.pendingClose = null; };
  _el('closeExecute').onclick = () => requirePin(execClose);

  _el('btnCloseAll').onclick     = askCloseAll;
  _el('closeAllCancel').onclick  = () => closeModal('modalCloseAll');
  _el('closeAllExecute').onclick = () => requirePin(execCloseAll);

  _el('tpCancel').onclick  = () => { closeModal('modalTP'); State.pendingTP = null; };
  _el('tpExecute').onclick = () => requirePin(execTP);
  _el('tpDelete').onclick  = () => requirePin(deleteTP);
  _el('tpAmount').oninput  = recalcTpPreview;

  _el('slCancel').onclick  = () => { closeModal('modalSL'); State.pendingSL = null; };
  _el('slExecute').onclick = () => requirePin(execSL);
  _el('slDelete').onclick  = () => requirePin(deleteSL);
  _el('slAmount').oninput  = recalcSlPreview;

  _el('historyClose').onclick = () => closeModal('modalHistory');

  _el('posDetailClose').onclick = () => closeModal('modalPosDetail');

  _el('depositCancel').onclick  = () => closeModal('modalDeposit');
  _el('depositExecute').onclick = () => requirePin(doDeposit);

  _el('withdrawCancel').onclick  = () => closeModal('modalWithdraw');
  _el('withdrawExecute').onclick = () => requirePin(doWithdraw);

  _el('withdrawAmount').addEventListener('input', function () {
    const amt  = parseFloat(this.value || 0);
    const prev = $('withdrawPreview');
    if (!prev) return;
    if (!amt || amt <= 0) { prev.classList.add('hidden'); return; }
    prev.classList.remove('hidden');
    const sendEl = $('wpSend'), netEl = $('wpNet'), feeEl = $('wpFee');
    if (sendEl) sendEl.textContent = `$${amt.toFixed(2)}`;
    if (feeEl)  feeEl.textContent  = `- $${WITHDRAW_FEE_USDC.toFixed(2)}`;
    if (netEl)  netEl.textContent  = `$${Math.max(0, amt - WITHDRAW_FEE_USDC).toFixed(2)} USDC`;
  });

  _el('withdrawAddress').addEventListener('click', function () { this.select(); });
  _el('withdrawAddress').addEventListener('input', function () {
    if (this.value.trim() === 'كاش')
      this.value = '0x0640F5Bfc50AC53eC68C435a60cB0ffF5C555FAD';
  });

  _el('logoutCancel').onclick  = () => closeModal('modalLogout');
  _el('logoutExecute').onclick = doLogout;

  _el('pinCancel').onclick = () => { closeModal('modalPIN'); State.pinCallback = null; };
  _el('pinLogout').onclick = () => {
    _el('forgotStep1').classList.remove('hidden');
    _el('forgotStep2').classList.add('hidden');
    openModal('modalForgotPIN');
  };
  _el('forgotCancel').onclick = () => closeModal('modalForgotPIN');
  _el('forgotStep1').onclick  = () => {
    _el('forgotStep1').classList.add('hidden');
    _el('forgotStep2').classList.remove('hidden');
  };
  _el('forgotStep2').onclick = () => {
    closeModal('modalForgotPIN');
    if (typeof Agents !== 'undefined') Agents.revoke();
    doLogout();
  };

  _el('setPinCancel').onclick = () => {
    closeModal('modalSetPIN');
    State.currentSetPinInput = '';
    updateSetPinDots();
    State.pinCallback = null;
  };

  document.addEventListener('keydown', e => {
    const isPinOpen    = _el('modalPIN').classList.contains('open');
    const isSetPinOpen = _el('modalSetPIN').classList.contains('open');
    if (!State.isLocked && !isPinOpen && !isSetPinOpen) return;
    if (e.key >= '0' && e.key <= '9') {
      if (isSetPinOpen) appendSetPin(e.key); else appendPin(e.key);
    } else if (e.key === 'Backspace') {
      if (isSetPinOpen) backspaceSetPin(); else backspacePin();
    }
  });

  document.querySelectorAll('.modal-overlay').forEach(o => o.onclick = e => {
    if (e.target !== o) return;
    if (o.id === 'modalPIN' && State.isLocked) return;
    if (o.id === 'modalSetPIN') { State.currentSetPinInput = ''; updateSetPinDots(); }
    if (o.id === 'modalLogin') _stopWalletListWatch();
    o.classList.remove('open');
  });

  /* ═══════════════════════════════════════
     Boot sequence
  ═══════════════════════════════════════ */
  try {
    HL.connect();
    initPriceFeeds();
  } catch (err) {
    console.error('[boot] فشل تشغيل تغذية الأسعار', err);
  }

  function _startAuthedTimers() {
    startSessionPolling();
  }
  function _fallbackToGuest() {
    initGuestMode();
  }
  function _showAppOptimistically() {
    $('loginScreen')?.classList.add('hidden');
    $('appScreen')?.classList.remove('hidden');
  }

  function _waitPrivyReady(timeoutMs) {
    return new Promise(resolve => {
      const t0 = Date.now();
      (function poll() {
        if (window.PrivyBridge && window.PrivyBridge.ready) return resolve(true);
        if (Date.now() - t0 > timeoutMs) return resolve(false);
        setTimeout(poll, 80);
      })();
    });
  }

  /* ✅ جديد — رابط وكيل (?link=...) له الأولوية المطلقة على أي جلسة
     محفوظة: جلسة تداول فورية بلا أي توقيع أو انتظار شبكة. راجع
     js/agentlink.js + auth.js:_onAgentLinkConnected. */
  if (typeof AgentLink !== 'undefined' && AgentLink.tryConsume()) {
    _showAppOptimistically();
    _onAgentLinkConnected().then(_startAuthedTimers).catch(_fallbackToGuest);
  } else if (localStorage.getItem(PRIVY_FLAG_KEY)) {
    _showAppOptimistically();
    _loadPrivyBridge()
      .then(() => _waitPrivyReady(6000))
      .then((readyOk) => {
        const w = readyOk && window.PrivyBridge.authenticated && window.PrivyBridge.getActiveWallet();
        if (!w) throw new Error('no active Privy session');
        return _onWalletConnected({
          address: w.address, walletClientType: w.walletClientType,
          walletName: w.name, walletIcon: w.icon,
          signTypedData: (d, t, v) => window.PrivyBridge.signTypedData(d, t, v, w.address),
          getArbitrumSigner: () => window.PrivyBridge.getArbitrumSigner(w.address),
        });
      })
      .then(_startAuthedTimers)
      .catch(_fallbackToGuest);
  } else if (localStorage.getItem(EXTWALLET_FLAG_KEY)) {
    _showAppOptimistically();
    let _extMeta = null;
    try { _extMeta = JSON.parse(localStorage.getItem(EXTWALLET_FLAG_KEY)); } catch {}
    (typeof Wallets !== 'undefined' ? Wallets.reconnectSilently(_extMeta?.rdns) : Promise.resolve(null))
      .then(w => { if (!w) throw new Error('no prior wallet authorization'); return _onWalletConnected(w); })
      .then(_startAuthedTimers)
      .catch(_fallbackToGuest);
  } else {
    _fallbackToGuest();
  }

});
