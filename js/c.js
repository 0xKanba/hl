/* c.js — تقويم التداول v7 — تحميل تدريجي بالأولوية + هيكل تحميل أنيق
   ✅ FIX جوهري — كانت getAddr() تقرأ window.State?.wallet?.address.
      لكن state.js يُعرِّف `const State = {...}` أعلى مستوى سكربت
      كلاسيكي — إعلانات const/let أعلى المستوى تُنشئ رابطاً بالنطاق
      المعجمي المشترك بين كل سكربتات الصفحة (تماماً كما تقرأه app.js/
      auth.js/trading.js/chart.js وكل ملف آخر بالمشروع عبر `State`
      المباشرة، وتعمل بصحة تامة) — لكنها لا تُسجَّل أبداً كخاصية على
      window (خلافاً لـvar). فـwindow.State كانت دائماً undefined، بصرف
      النظر عن حالة الدخول الفعلية، فتُشغَّل رسالة "سجّل الدخول أولاً"
      دائماً حتى وأنت متصل فعلياً وبصفقة مفتوحة. c.js كان الملف الوحيد
      بالمشروع كله يستخدم window.State بدل State مباشرة.
   ✅ FIX — استبدال hlInfo({type:'userFills',...}) بلا أي startTime
      (يُرجع فقط أحدث ما يتوفر ضمن سقف Hyperliquid البالغ 2000 صفقة لكل
      استدعاء، ولا يتوفر عبره سوى آخر 10,000 صفقة على الإطلاق — موثَّق
      رسمياً) بترقيم فعلي عبر نوافذ زمنية متتالية من الأحدث للأقدم:
      نافذة 30 يوماً فورية عند الفتح (تكفي لعرض الشهر الحالي وإحصائيات
      24 ساعة/7 أيام/30 يوماً بدقة تامة منذ أول لحظة)، ثم زحف خلفي كل
      5 ثوانٍ يجلب 30 يوماً أقدم في كل مرة حتى يبلغ سقف سنة كاملة أو
      ينفد التاريخ، بلا حجب الواجهة وبلا إغراق الاتصال المشترك بطلبات
      متلاحقة. أولوية التنقل اليدوي (calPrev/calNext) تتخطى الطابور
      وتجلب الشهر المطلوب مباشرة لو لم يُغطَّ بعد.
   ✅ FIX — 'xyz' كانت مكتوبة حرفياً بدل ثابت HL_DEX المشترك (config.js).
   ✅ تحميل هيكلي (skeleton) بدل دوّار+نص فقط عند أول فتح — يعطي إحساساً
      فورياً بالبنية قبل وصول البيانات الحقيقية، بنفس روح المنصات
      الاحترافية. رقم "الكل" يحمل مؤشراً هادئاً (نقطة دوّارة صغيرة) طالما
      السجل التاريخي ما زال يكتمل بالخلفية — بلا حجب أي شيء آخر.
*/
(function(){
'use strict';

/* ══════════════════════════════════════════════
   CSS — ديناميكي: موبايل + ديسكتوب + هيكل التحميل الجديد
══════════════════════════════════════════════ */
document.head.insertAdjacentHTML('beforeend',`<style>
/* ── نافذة التقويم الرئيسية ── */
#calMod{
  position:fixed;inset:0;z-index:500;
  background:var(--bg-app,#131210);
  display:none;flex-direction:column;overflow:hidden;
  font-family:'Cairo',sans-serif;direction:rtl;
}
#calMod.open{display:flex;}

/* ── Header ── */
.cal-hdr{
  display:flex;align-items:center;justify-content:space-between;
  padding:14px 18px 12px;
  border-bottom:1px solid rgba(255,255,255,.08);
  flex-shrink:0;background:var(--bg-card,#1e1c18);
}
.cal-title{font-size:17px;font-weight:900;color:var(--text-primary,#f0ece4);
  display:flex;align-items:center;gap:8px;}
.cal-back{
  background:rgba(255,255,255,.1);border:1.5px solid rgba(255,255,255,.15);
  color:var(--text-primary,#f0ece4);border-radius:20px;padding:7px 18px;
  font-size:13px;font-weight:800;cursor:pointer;font-family:'Cairo',sans-serif;
  transition:all .15s;
}
.cal-back:hover{background:rgba(255,255,255,.18);}

/* ── Stats ── */
.cal-stats{
  display:grid;grid-template-columns:repeat(4,1fr);gap:6px;
  padding:10px 14px 8px;flex-shrink:0;
  background:var(--bg-app,#131210);
}
.cal-stat{
  background:var(--bg-card,#1e1c18);border-radius:10px;
  padding:10px 6px;text-align:center;
  border:1px solid rgba(255,255,255,.07);
  transition:transform .15s, opacity .2s;
}
.cal-stat:hover{transform:translateY(-1px);}
.cal-stat-l{font-size:10px;color:#8a8278;display:block;margin-bottom:3px;font-weight:700;letter-spacing:.5px;}
.cal-stat-v{font-size:13px;font-weight:900;font-family:'IBM Plex Mono',monospace;}
.cal-stat-v.up{color:#34c85a;} .cal-stat-v.dn{color:#f05248;} .cal-stat-v.dim{color:#8a8278;}
.cal-stat-pending .cal-stat-v{opacity:.72;}
.cal-mini-spin{display:inline-block;width:7px;height:7px;margin-right:3px;
  border:1.5px solid rgba(224,114,72,.3);border-top-color:#e07248;border-radius:50%;
  animation:cSpin .7s linear infinite;vertical-align:middle;}

/* ── Nav ── */
.cal-nav{
  display:flex;align-items:center;justify-content:center;
  gap:16px;padding:10px 14px 6px;flex-shrink:0;
}
.cal-nav-btn{
  background:var(--bg-card,#1e1c18);border:1.5px solid rgba(255,255,255,.12);
  color:var(--text-primary,#f0ece4);
  width:32px;height:32px;border-radius:50%;font-size:18px;
  cursor:pointer;display:flex;align-items:center;justify-content:center;
  transition:all .15s;
}
.cal-nav-btn:hover{background:rgba(255,255,255,.15);border-color:rgba(255,255,255,.25);}
.cal-month{
  font-size:16px;font-weight:900;color:var(--text-primary,#f0ece4);
  min-width:160px;text-align:center;letter-spacing:.3px;
}

/* ══════════════════════════════
   GRID HEADER — اسم اليوم
══════════════════════════════ */
.cal-ghdr{
  display:grid;grid-template-columns:repeat(7,1fr);gap:3px;
  padding:0 14px 4px;flex-shrink:0;
}
.cal-ghdr span{
  text-align:center;font-weight:800;color:#8a8278;
  background:var(--bg-card,#1e1c18);padding:5px 2px;border-radius:4px;
  white-space:nowrap;overflow:hidden;
}

/* ══════════════════════════════
   CALENDAR GRID WRAPPER
══════════════════════════════ */
.cal-grid-wrap{
  flex:1;overflow-y:auto;padding:0 14px 14px;
  -webkit-overflow-scrolling:touch;position:relative;
}
.cal-grid{
  display:grid;grid-template-columns:repeat(7,1fr);gap:3px;
  transition:opacity .22s ease;
}
.cal-grid.cal-refreshing{opacity:.4;}

/* تلميح "جاري تحميل هذا الشهر" — أولوية التنقل اليدوي */
.cal-jump-hint{
  position:absolute;inset:0 14px 14px;display:none;
  align-items:center;justify-content:center;gap:8px;
  background:color-mix(in srgb, var(--bg-app,#131210) 78%, transparent);
  border-radius:12px;font-size:12.5px;font-weight:800;color:#8a8278;
  backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);z-index:3;
}

/* ══════════════════════════════
   CELL — يوم واحد
══════════════════════════════ */
.cal-day{
  background:var(--bg-card,#1e1c18);border-radius:7px;
  display:flex;flex-direction:column;
  justify-content:space-between;
  padding:5px 4px 4px;
  cursor:pointer;
  border:1.5px solid transparent;
  overflow:hidden;
  transition:border-color .15s,transform .1s,box-shadow .15s;
  min-height:0;
}
.cal-day:hover:not(.dim){
  border-color:#e07248;
  transform:scale(1.04);
  box-shadow:0 3px 12px rgba(224,114,72,.2);
  z-index:2;position:relative;
}
.cal-day.dim{opacity:.18;pointer-events:none;}
.cal-day.profit{background:rgba(52,200,90,.12);border-color:rgba(52,200,90,.35);}
.cal-day.loss{background:rgba(240,82,72,.12);border-color:rgba(240,82,72,.35);}
.cal-day.today{border-color:#e07248!important;box-shadow:0 0 0 1px rgba(224,114,72,.3);}
.cal-day.today .cal-dn{color:#e07248;font-weight:900;}

/* رقم اليوم */
.cal-dn{
  font-size:11px;font-weight:700;color:#8a8278;line-height:1;
  text-align:right;padding-right:1px;
}

/* قيمة PnL — وسط الخلية */
.cal-dv-wrap{
  flex:1;display:flex;align-items:center;justify-content:center;
  padding:2px 0;
}
.cal-dv{
  font-weight:900;text-align:center;line-height:1;
  font-family:'IBM Plex Mono',monospace;
  word-break:break-all;
}
.cal-dv.up{color:#34c85a;} .cal-dv.dn{color:#f05248;}

/* ══════════════════════════════
   HEADER SKELETON — أول تحميل فقط
══════════════════════════════ */
@keyframes calShimmer{0%{background-position:-135% 0}100%{background-position:135% 0}}
.cal-skel-wrap{padding:10px 14px;flex:1;display:flex;flex-direction:column;min-height:0;}
.cal-skel-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:12px;flex-shrink:0;}
.cal-skel-stat,.cal-skel-day{
  background:linear-gradient(90deg, var(--bg-input,#302d28) 25%, var(--border-strong,#5a554c) 45%, var(--bg-input,#302d28) 65%);
  background-size:300% 100%;animation:calShimmer 1.5s ease-in-out infinite;
}
.cal-skel-stat{height:50px;border-radius:10px;}
.cal-skel-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;flex:1;min-height:0;}
.cal-skel-day{border-radius:7px;aspect-ratio:1/.95;}
.cal-skel-txt{text-align:center;color:#8a8278;font-size:12.5px;font-weight:700;
  padding-top:12px;flex-shrink:0;}

/* ══════════════════════════════════════════════
   DESKTOP — شاشة كبيرة: تصميم احترافي بالكامل
══════════════════════════════════════════════ */
@media (min-width:768px){
  #calMod{
    align-items:center;justify-content:center;
    background:rgba(0,0,0,.75);
    backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
  }
  .cal-inner{
    background:var(--bg-app,#131210);
    border-radius:20px;
    border:1px solid rgba(255,255,255,.1);
    box-shadow:0 24px 80px rgba(0,0,0,.7);
    width:min(92vw,860px);
    max-height:90vh;
    display:flex;flex-direction:column;
    overflow:hidden;
    animation:calPop .2s cubic-bezier(.34,1.56,.64,1);
  }
  @keyframes calPop{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:scale(1)}}

  .cal-hdr{padding:18px 24px 14px;}
  .cal-title{font-size:20px;}

  .cal-stats{padding:12px 20px 10px;gap:10px;}
  .cal-stat{padding:12px 8px;border-radius:12px;}
  .cal-stat-l{font-size:11px;}
  .cal-stat-v{font-size:16px;}

  .cal-nav{padding:12px 20px 8px;}
  .cal-month{font-size:20px;min-width:200px;}
  .cal-nav-btn{width:38px;height:38px;font-size:20px;}

  .cal-ghdr{padding:0 20px 6px;gap:5px;}
  .cal-ghdr span{
    font-size:12px;padding:7px 4px;border-radius:6px;
    font-weight:800;letter-spacing:.5px;
  }

  .cal-grid-wrap{padding:0 20px 20px;}
  .cal-grid{gap:5px;}

  .cal-day{
    padding:8px 7px 6px;
    border-radius:10px;
    border-width:2px;
    min-height:80px;
  }
  .cal-dn{font-size:13px;font-weight:800;}
  .cal-dv{font-size:clamp(11px,1.1vw,15px);}

  .cal-skel-wrap{padding:12px 20px 20px;}
}

/* ══════════════════════════════════════════════
   MOBILE — أرقام كبيرة، أيام كاملة
══════════════════════════════════════════════ */
@media (max-width:767px){
  .cal-inner{display:contents;}
  .cal-ghdr span{font-size:8px;padding:4px 1px;}
  .cal-day{padding:3px 2px 2px;border-radius:5px;aspect-ratio:1/.95;}
  .cal-dn{font-size:9px;}
  .cal-dv{font-size:clamp(9px,2.2vw,12px);}
  .cal-stats{padding:8px 10px 6px;gap:4px;}
  .cal-stat{padding:8px 3px;border-radius:8px;}
  .cal-stat-l{font-size:9px;}
  .cal-stat-v{font-size:12px;}
  .cal-nav{padding:8px 10px 4px;gap:10px;}
  .cal-month{font-size:14px;min-width:130px;}
  .cal-nav-btn{width:28px;height:28px;font-size:16px;}
  .cal-ghdr{padding:0 10px 3px;gap:2px;}
  .cal-grid-wrap{padding:0 10px 10px;}
  .cal-grid{gap:2px;}
  .cal-jump-hint{inset:0 10px 10px;}
}

/* ── Loader (رسالة/خطأ بلا هيكل — تُستخدم فقط لو ما فيه عنوان محفظة) ── */
.cal-load{
  flex:1;display:flex;flex-direction:column;
  align-items:center;justify-content:center;
  gap:14px;color:#8a8278;font-size:14px;font-weight:700;
}
.cal-spin{
  width:28px;height:28px;border:3px solid rgba(255,255,255,.1);
  border-top-color:#e07248;border-radius:50%;
  animation:cSpin .8s linear infinite;
}
@keyframes cSpin{to{transform:rotate(360deg);}}

/* ══════════════════════════════
   DAY DETAIL PANEL
══════════════════════════════ */
.cal-det{
  position:absolute;inset:0;z-index:10;
  background:var(--bg-app,#131210);
  display:none;flex-direction:column;
  border-radius:inherit;
}
.cal-det.open{display:flex;}
.cal-det-hdr{
  display:flex;align-items:center;justify-content:space-between;
  padding:14px 18px;border-bottom:1px solid rgba(255,255,255,.08);
  flex-shrink:0;background:var(--bg-card,#1e1c18);
  border-radius:inherit inherit 0 0;
}
.cal-det-body{flex:1;overflow-y:auto;padding:12px 14px;}
.cal-tot{
  text-align:center;font-family:'IBM Plex Mono',monospace;
  font-size:28px;font-weight:900;margin-bottom:14px;
  letter-spacing:-.5px;
}
.cal-tcard{
  background:var(--bg-card,#1e1c18);border-radius:12px;
  padding:12px;margin-bottom:10px;
  border:1px solid rgba(255,255,255,.07);
  transition:border-color .15s;
}
.cal-tcard:hover{border-color:rgba(255,255,255,.14);}
.cal-tt{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;}
.cal-tc{font-weight:900;font-size:15px;color:var(--text-primary,#f0ece4);}
.cal-ts{font-size:11px;font-weight:800;padding:3px 10px;border-radius:99px;}
.cal-ts.buy{background:rgba(52,200,90,.2);color:#34c85a;}
.cal-ts.sell{background:rgba(240,82,72,.2);color:#f05248;}
.cal-tg{
  display:grid;grid-template-columns:1fr 1fr;gap:6px;
  background:rgba(0,0,0,.2);border-radius:8px;padding:8px;
}
.cal-ti{display:flex;flex-direction:column;gap:2px;}
.cal-tl{font-size:9px;color:#8a8278;font-weight:700;text-transform:uppercase;letter-spacing:.5px;}
.cal-tv{font-size:13px;font-weight:800;font-family:'IBM Plex Mono',monospace;color:var(--text-primary,#f0ece4);}
.cal-tp{margin-top:8px;font-family:'IBM Plex Mono',monospace;font-size:18px;font-weight:900;}
.cal-tp.up{color:#34c85a;} .cal-tp.dn{color:#f05248;}
.cal-empty{text-align:center;padding:50px 20px;color:#8a8278;font-size:14px;font-weight:700;}
.cal-fund-card{
  background:rgba(224,114,72,.08);border:1.5px solid rgba(224,114,72,.25);
  border-radius:12px;padding:12px;margin-bottom:10px;
}
.cal-fund-title{font-size:12px;font-weight:700;color:#e07248;margin-bottom:6px;}

@media (min-width:768px){
  .cal-det-body{padding:16px 20px;}
  .cal-tot{font-size:36px;}
  .cal-tcard{padding:14px;}
  .cal-tg{grid-template-columns:1fr 1fr 1fr 1fr;}
}
</style>`);

/* ══════════════════════════════════════════════
   HTML
══════════════════════════════════════════════ */
document.body.insertAdjacentHTML('beforeend',`
<div id="calMod">
  <div class="cal-inner" style="position:relative;">

    <div class="cal-hdr">
      <button class="cal-back" id="calBack">← رجوع</button>
      <span class="cal-title">📅 تقويم التداول</span>
      <span style="width:80px"></span>
    </div>

    <div class="cal-load" id="calLoad">
      <div class="cal-spin"></div><span>جاري التحميل...</span>
    </div>

    <div id="calMain" style="display:none;flex:1;flex-direction:column;overflow:hidden;min-height:0;">
      <div class="cal-stats" id="calStats"></div>
      <div class="cal-nav">
        <button class="cal-nav-btn" id="calPrev">‹</button>
        <span class="cal-month" id="calMonth">—</span>
        <button class="cal-nav-btn" id="calNext">›</button>
      </div>
      <div class="cal-ghdr" id="calGhdr"></div>
      <div class="cal-grid-wrap">
        <div class="cal-grid" id="calGrid"></div>
      </div>
    </div>

    <div class="cal-det" id="calDet">
      <div class="cal-det-hdr">
        <span id="calDetT" style="font-size:15px;font-weight:900;">—</span>
        <button class="cal-back" id="calDetClose">✕</button>
      </div>
      <div class="cal-det-body" id="calDetB"></div>
    </div>

  </div>
</div>`);

/* ══════════════════════════════════════════════
   Constants & State
══════════════════════════════════════════════ */
const MONTHS=['يناير','فبراير','مارس','أبريل','مايو','يونيو',
              'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

const DAYS_FULL=['الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت','الأحد'];
const DAYS_SHORT=['إث','ث','أر','خ','ج','س','أح'];

/* ✅ ترقيم تدريجي — راجع تعليق رأس الملف */
const CHUNK_DAYS          = 30;
const MAX_LOOKBACK_DAYS   = 365;
const BG_INTERVAL_MS      = 5000;

let _fills=[], _fundMap={}, _dayMap={}, _cur=new Date(), _ready=false;
let _monthsCovered = new Set();
let _crawlCoveredSinceMs = Date.now();
let _historyComplete = false;
let _bgTimer = null;
let _navDebounce = null;
const _seenFillIds = new Set();
const _seenFundKeys = new Set();

const $=id=>document.getElementById(id);

/* ══ Helpers ══ */
function dayKey(d){
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function addDays(d,n){const r=new Date(d);r.setDate(r.getDate()+n);return r;}
function monStart(d){
  const r=new Date(d);const day=r.getDay();
  r.setDate(r.getDate()-(day===0?6:day-1));return r;
}
function isDesktop(){return window.innerWidth>=768;}
function _monthKey(y,m){ return y+'-'+m; }
function _monthsBackFromNow(y,m){
  const now=new Date();
  return (now.getFullYear()-y)*12+(now.getMonth()-m);
}
function _isMonthCovered(y,m){
  const monthStartMs = new Date(y,m,1).getTime();
  if (monthStartMs >= _crawlCoveredSinceMs) return true;
  return _monthsCovered.has(_monthKey(y,m));
}

/* ══ دمج إضافي (لا استبدال) — كل نافذة زمنية تُضاف لما سبق، بلا تكرار ══ */
function _accumulate(fills, funding){
  for (const f of fills){
    const id = (f.hash ? f.hash : '') + ':' + (f.tid ?? f.oid ?? '') + ':' + f.time;
    if (_seenFillIds.has(id)) continue;
    _seenFillIds.add(id);
    _fills.push(f);
    const k = dayKey(new Date(f.time));
    const pnl = parseFloat(f.closedPnl||0) - parseFloat(f.fee||0);
    _dayMap[k] = (_dayMap[k]||0) + pnl;
  }
  for (const e of funding){
    if (e.delta?.type !== 'funding') continue;
    const fkey = e.time + ':' + (e.delta.coin||'') + ':' + e.delta.usdc;
    if (_seenFundKeys.has(fkey)) continue;
    _seenFundKeys.add(fkey);
    const k = dayKey(new Date(e.time));
    const usd = -parseFloat(e.delta.usdc||0);
    _fundMap[k] = (_fundMap[k]||0) + usd;
  }
}

/* ══ جلب نافذة زمنية مُطلَقة (للزحف الخلفي المتسلسل) ══ */
async function _fetchChunk(addr, startMs, endMs){
  try{
    const [fills, funding] = await Promise.all([
      hlInfo({type:'userFillsByTime', user:addr, startTime:startMs, endTime:endMs, dex:HL_DEX}).catch(()=>[]),
      hlInfo({type:'userFunding', user:addr, startTime:startMs, endTime:endMs}).catch(()=>[])
    ]);
    _accumulate(Array.isArray(fills)?fills:[], Array.isArray(funding)?funding:[]);
    return true;
  }catch{ return false; }
}

/* ══ جلب شهر تقويمي كامل بعينه (للقفز اليدوي عبر calPrev/calNext) ══ */
async function _fetchMonth(addr, y, m){
  const key = _monthKey(y,m);
  if (_monthsCovered.has(key) || _isMonthCovered(y,m)) return true;
  const start = new Date(y,m,1).getTime();
  const end   = new Date(y,m+1,1).getTime();
  const ok = await _fetchChunk(addr, start, end);
  if (ok) _monthsCovered.add(key);
  return ok;
}

/* ══ الزحف الخلفي — كل 5 ثوانٍ، من الأحدث للأقدم، حتى سقف سنة كاملة ══ */
function _startBgCrawl(addr){
  _stopBgCrawl();
  _bgTimer = setInterval(async () => {
    if (_historyComplete) { _stopBgCrawl(); return; }
    const now = Date.now();
    const floor = now - MAX_LOOKBACK_DAYS*86400000;
    if (_crawlCoveredSinceMs <= floor) { _historyComplete = true; _stopBgCrawl(); showStats(); return; }

    const nextEnd   = _crawlCoveredSinceMs;
    const rawStart  = nextEnd - CHUNK_DAYS*86400000;
    const clampedStart = Math.max(rawStart, floor);

    const ok = await _fetchChunk(addr, clampedStart, nextEnd);
    if (ok) _crawlCoveredSinceMs = clampedStart;

    showStats();
    showCal();

    if (_crawlCoveredSinceMs <= floor) { _historyComplete = true; _stopBgCrawl(); }
  }, BG_INTERVAL_MS);
}
function _stopBgCrawl(){ clearInterval(_bgTimer); _bgTimer = null; }

/* ══ أولوية التنقل اليدوي — يتخطى الطابور المتسلسل لو الشهر غير مُغطّى ══ */
function _onNavChange(){
  _renderJumpHint();
  clearTimeout(_navDebounce);
  _navDebounce = setTimeout(_ensureCurMonthLoaded, 150);
}
async function _ensureCurMonthLoaded(){
  const addr = getAddr();
  if (!addr || !_ready) return;
  const y = _cur.getFullYear(), m = _cur.getMonth();
  if (_isMonthCovered(y,m)) { _renderJumpHint(); return; }
  const monthsBack = _monthsBackFromNow(y,m);
  const horizonMonths = Math.ceil(MAX_LOOKBACK_DAYS/30) + 1;
  if (monthsBack < 0 || monthsBack > horizonMonths) { _renderJumpHint(); return; }
  await _fetchMonth(addr, y, m);
  showStats();
  if (_cur.getFullYear()===y && _cur.getMonth()===m) showCal();
}
function _renderJumpHint(){
  const wrap = $('calGrid')?.parentElement;
  if (!wrap) return;
  let hint = wrap.querySelector('.cal-jump-hint');
  const y=_cur.getFullYear(), m=_cur.getMonth();
  const monthsBack = _monthsBackFromNow(y,m);
  const horizonMonths = Math.ceil(MAX_LOOKBACK_DAYS/30) + 1;
  const needsFetch = !_isMonthCovered(y,m) && monthsBack>=0 && monthsBack<=horizonMonths;
  if (needsFetch){
    if (!hint){ hint=document.createElement('div'); hint.className='cal-jump-hint'; wrap.appendChild(hint); }
    hint.innerHTML='<span class="cal-spin" style="width:16px;height:16px;border-width:2px;"></span> جاري تحميل بيانات هذا الشهر...';
    hint.style.display='flex';
  } else if (hint){
    hint.style.display='none';
  }
}

/* ══ Stats ══ */
function showStats(){
  const now=Date.now();

  function sumFunding(ms){
    const cutoff=now-ms;
    return Object.entries(_fundMap).reduce((s,[k,v])=>{
      const ts=new Date(k+'T12:00:00Z').getTime();
      return ts>=cutoff ? s+v : s;
    },0);
  }
  const allFunding=Object.values(_fundMap).reduce((s,v)=>s+v,0);

  const tradePnl=ms=>_fills.filter(f=>f.time>=now-ms)
    .reduce((s,f)=>s+parseFloat(f.closedPnl||0)-parseFloat(f.fee||0),0);
  const allTrade=_fills.reduce((s,f)=>s+parseFloat(f.closedPnl||0)-parseFloat(f.fee||0),0);

  const row=(lbl,v,pending)=>`<div class="cal-stat${pending?' cal-stat-pending':''}">
    <span class="cal-stat-l">${pending?'<span class="cal-mini-spin"></span>':''}${lbl}</span>
    <span class="cal-stat-v ${v>=0?'up':'dn'}">${v>=0?'+':''}$${Math.abs(v).toFixed(2)}</span>
  </div>`;

  $('calStats').innerHTML=
    row('24 ساعة',  tradePnl(86400000)   + sumFunding(86400000))+
    row('7 أيام',   tradePnl(604800000)  + sumFunding(604800000))+
    row('30 يوم',   tradePnl(2592000000) + sumFunding(2592000000))+
    row('الكل',     allTrade + allFunding, !_historyComplete);
}

/* ══ Day Names ══ */
function renderDayHeaders(){
  const desktop=isDesktop();
  const names=desktop?DAYS_FULL:DAYS_SHORT;
  $('calGhdr').innerHTML=names.map(n=>`<span>${n}</span>`).join('');
}

/* ══ PnL display ══ */
function fmtPnl(total){
  const abs=Math.abs(total);
  if(abs>=10000) return (abs/1000).toFixed(1)+'K';
  if(abs>=1000)  return abs.toFixed(0);
  if(abs>=100)   return abs.toFixed(1);
  if(abs>=10)    return abs.toFixed(2);
  return abs.toFixed(2);
}

/* ══════════════════════════════
   SHOW CALENDAR
══════════════════════════════ */
function showCal(){
  const y=_cur.getFullYear(),m=_cur.getMonth();
  $('calMonth').textContent=MONTHS[m]+' '+y;
  renderDayHeaders();

  const grid=$('calGrid');
  grid.classList.add('cal-refreshing');
  setTimeout(()=>grid.classList.remove('cal-refreshing'), 180);

  const first=new Date(y,m,1),last=new Date(y,m+1,0);
  const start=monStart(first);
  const end=addDays(last,last.getDay()===0?0:7-last.getDay());
  const todayK=dayKey(new Date());
  grid.innerHTML='';
  const desktop=isDesktop();

  let d=new Date(start);
  while(d<=end){
    const k=dayKey(d);
    const trad=_dayMap[k]||0,fund=_fundMap[k]||0;
    const total=trad+fund;
    const inM=d.getMonth()===m&&d.getFullYear()===y;

    const box=document.createElement('div');
    let cls='cal-day';
    if(!inM) cls+=' dim';
    else if(total>0.01) cls+=' profit';
    else if(total<-0.01) cls+=' loss';
    if(k===todayK) cls+=' today';
    box.className=cls;

    let pHtml='<span></span>';
    if(inM&&Math.abs(total)>0.005){
      const txt=(total>0?'':'-')+'$'+fmtPnl(total);
      const fs=txt.length>8?'clamp(7px,1.6vw,11px)':txt.length>6?'clamp(8px,1.9vw,13px)':'clamp(9px,2.1vw,14px)';
      pHtml=`<span class="cal-dv ${total>0?'up':'dn'}" style="font-size:${fs}">${txt}</span>`;
    }

    box.innerHTML=`
      <span class="cal-dn">${d.getDate()}</span>
      <div class="cal-dv-wrap">${pHtml}</div>`;

    if(inM){const snap=new Date(d);box.onclick=()=>showDay(snap);}
    grid.appendChild(box);
    d=addDays(d,1);
  }

  _renderJumpHint();
}

/* ══════════════════════════════
   SHOW DAY DETAIL
══════════════════════════════ */
function showDay(date){
  const k=dayKey(date);
  const fills=_fills.filter(f=>dayKey(new Date(f.time))===k);
  const fund=_fundMap[k]||0;
  $('calDetT').textContent=`${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  const body=$('calDetB');body.innerHTML='';

  if(fills.length===0&&fund===0){
    body.innerHTML='<div class="cal-empty">📂 لا توجد صفقات هذا اليوم</div>';
    $('calDet').classList.add('open');return;
  }

  const trad=fills.reduce((s,f)=>s+parseFloat(f.closedPnl||0)-parseFloat(f.fee||0),0);
  const total=trad+fund;
  const totColor=total>=0?'#34c85a':'#f05248';

  body.insertAdjacentHTML('beforeend',`
    <div class="cal-tot" style="color:${totColor}">
      ${total>=0?'+':'-'}$${Math.abs(total).toFixed(2)}
    </div>`);

  if(fund!==0){
    body.insertAdjacentHTML('beforeend',`
      <div class="cal-fund-card">
        <div class="cal-fund-title">💰 رسوم التمويل (${fund>=0?'ربحت':'دفعت'})</div>
        <div style="font-family:'IBM Plex Mono';font-size:18px;font-weight:900;color:${fund>=0?'#34c85a':'#f05248'}">
          ${fund>=0?'+':'-'}$${Math.abs(fund).toFixed(6)}
        </div>
      </div>`);
  }

  fills.forEach(f=>{
    const pnl=parseFloat(f.closedPnl||0)-parseFloat(f.fee||0);
    const t=new Date(f.time);
    const tm=String(t.getHours()).padStart(2,'0')+':'+String(t.getMinutes()).padStart(2,'0');
    const pCls=pnl>=0?'up':'dn';
    const c=document.createElement('div');c.className='cal-tcard';
    c.innerHTML=`
      <div class="cal-tt">
        <span class="cal-tc">${f.coin?.includes(':')?f.coin.split(':')[1]:f.coin}</span>
        <span class="cal-ts ${f.side==='B'?'buy':'sell'}">${f.side==='B'?'▲ شراء':'▼ بيع'}</span>
      </div>
      <div class="cal-tg">
        <div class="cal-ti"><span class="cal-tl">السعر</span><span class="cal-tv">$${parseFloat(f.px).toFixed(2)}</span></div>
        <div class="cal-ti"><span class="cal-tl">الحجم</span><span class="cal-tv">${parseFloat(f.sz).toFixed(4)}</span></div>
        <div class="cal-ti"><span class="cal-tl">الوقت</span><span class="cal-tv">${tm}</span></div>
        <div class="cal-ti"><span class="cal-tl">رسوم التداول</span><span class="cal-tv" style="color:#f0be30">-$${parseFloat(f.fee||0).toFixed(4)}</span></div>
      </div>
      <div class="cal-tp ${pCls}">${pnl>=0?'+':'-'}$${Math.abs(pnl).toFixed(2)}</div>`;
    body.appendChild(c);
  });

  $('calDet').classList.add('open');
}

/* ══ Show Main ══ */
function showMain(){
  $('calLoad').style.display='none';
  const m=$('calMain');
  m.style.display='flex';m.style.flexDirection='column';
  m.style.overflow='hidden';m.style.flex='1';m.style.minHeight='0';
}

/* ══ هيكل التحميل الأول — شمشة بدل دوّار+نص فقط ══ */
function _skeletonHtml(){
  const dayCount = 35;
  return `<div class="cal-skel-wrap">
    <div class="cal-skel-stats">
      <div class="cal-skel-stat"></div><div class="cal-skel-stat"></div>
      <div class="cal-skel-stat"></div><div class="cal-skel-stat"></div>
    </div>
    <div class="cal-skel-grid">${'<div class="cal-skel-day"></div>'.repeat(dayCount)}</div>
    <div class="cal-skel-txt">📥 جاري تحميل آخر 30 يوماً من سجلّك...</div>
  </div>`;
}

/* ══ Load Data — الآن تدريجي: نافذة فورية + زحف خلفي ══ */
function getAddr(){
  /* ✅ FIX — كانت window.State (دائماً undefined)، الآن State مباشرة */
  return (typeof State !== 'undefined' && State.wallet && State.wallet.address) || null;
}

async function load(addr){
  _fills=[]; _fundMap={}; _dayMap={};
  _monthsCovered=new Set(); _seenFillIds.clear(); _seenFundKeys.clear();
  _historyComplete=false;
  _stopBgCrawl();

  $('calLoad').style.display='flex';
  $('calLoad').innerHTML=_skeletonHtml();
  $('calMain').style.display='none';

  const now=Date.now();
  _crawlCoveredSinceMs = now;
  const ok = await _fetchChunk(addr, now - CHUNK_DAYS*86400000, now);

  if(!ok){
    $('calLoad').innerHTML=`<div class="cal-load"><span style="color:#f05248;font-size:14px">❌ ${typeof errToAr==='function'?errToAr(''):'تعذّر جلب السجل'}</span></div>`;
    return;
  }
  _crawlCoveredSinceMs = now - CHUNK_DAYS*86400000;

  _ready=true;
  showStats();showCal();showMain();
  _startBgCrawl(addr);
}

/* ══ Events ══ */
$('calBack').onclick=()=>{ $('calMod').classList.remove('open'); _stopBgCrawl(); };
$('calDetClose').onclick=()=>$('calDet').classList.remove('open');
$('calPrev').onclick=()=>{_cur=new Date(_cur.getFullYear(),_cur.getMonth()-1,1);showCal();_onNavChange();};
$('calNext').onclick=()=>{_cur=new Date(_cur.getFullYear(),_cur.getMonth()+1,1);showCal();_onNavChange();};

window.addEventListener('resize',()=>{if(_ready)renderDayHeaders();});

$('calMod').addEventListener('click',e=>{
  if(isDesktop()&&e.target===$('calMod')){ $('calMod').classList.remove('open'); _stopBgCrawl(); }
});

/* ══ Public API ══ */
window.openCalendar=function(){
  _cur=new Date();
  $('calMod').classList.add('open');
  $('calDet').classList.remove('open');
  const addr=getAddr();
  if(!addr){
    $('calLoad').style.display='flex';
    $('calLoad').innerHTML='<span style="color:#8a8278;font-size:14px">⚠️ سجّل الدخول أولاً</span>';
    $('calMain').style.display='none';
    return;
  }
  if(_ready){
    showStats();showCal();showMain();
    if(!_historyComplete) _startBgCrawl(addr);
  } else {
    load(addr);
  }
};

function bind(){const b=$('btnCalendar');if(b)b.onclick=()=>window.openCalendar();}
bind();
document.addEventListener('DOMContentLoaded',bind);
})();
