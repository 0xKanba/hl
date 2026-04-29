/* c.js — تقويم التداول v6 — ديسكتوب احترافي + موبايل مثالي */
(function(){
'use strict';

/* ══════════════════════════════════════════════
   CSS — ديناميكي: موبايل + ديسكتوب
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
  transition:transform .15s;
}
.cal-stat:hover{transform:translateY(-1px);}
.cal-stat-l{font-size:10px;color:#8a8278;display:block;margin-bottom:3px;font-weight:700;letter-spacing:.5px;}
.cal-stat-v{font-size:13px;font-weight:900;font-family:'IBM Plex Mono',monospace;}
.cal-stat-v.up{color:#34c85a;} .cal-stat-v.dn{color:#f05248;} .cal-stat-v.dim{color:#8a8278;}

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
  -webkit-overflow-scrolling:touch;
}
.cal-grid{
  display:grid;grid-template-columns:repeat(7,1fr);gap:3px;
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

/* ══════════════════════════════════════════════
   DESKTOP — شاشة كبيرة: تصميم احترافي بالكامل
══════════════════════════════════════════════ */
@media (min-width:768px){
  /* نافذة محاذية للمنتصف */
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

  /* Header ديسكتوب */
  .cal-hdr{padding:18px 24px 14px;}
  .cal-title{font-size:20px;}

  /* Stats ديسكتوب */
  .cal-stats{padding:12px 20px 10px;gap:10px;}
  .cal-stat{padding:12px 8px;border-radius:12px;}
  .cal-stat-l{font-size:11px;}
  .cal-stat-v{font-size:16px;}

  /* Nav ديسكتوب */
  .cal-nav{padding:12px 20px 8px;}
  .cal-month{font-size:20px;min-width:200px;}
  .cal-nav-btn{width:38px;height:38px;font-size:20px;}

  /* Grid header ديسكتوب */
  .cal-ghdr{padding:0 20px 6px;gap:5px;}
  .cal-ghdr span{
    font-size:12px;padding:7px 4px;border-radius:6px;
    font-weight:800;letter-spacing:.5px;
  }

  /* Grid ديسكتوب */
  .cal-grid-wrap{padding:0 20px 20px;}
  .cal-grid{gap:5px;}

  /* خلية ديسكتوب — ارتفاع ثابت يملأ بشكل متناسب */
  .cal-day{
    padding:8px 7px 6px;
    border-radius:10px;
    border-width:2px;
    min-height:80px;
  }
  .cal-dn{font-size:13px;font-weight:800;}
  .cal-dv{font-size:clamp(11px,1.1vw,15px);}
}

/* ══════════════════════════════════════════════
   MOBILE — أرقام كبيرة، أيام كاملة
══════════════════════════════════════════════ */
@media (max-width:767px){
  .cal-inner{display:contents;} /* لا wrapper على موبايل */
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
}

/* ── Loader ── */
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
  <!-- wrapper: على ديسكتوب يصبح بطاقة مركزية، على موبايل contents -->
  <div class="cal-inner" style="position:relative;">

    <!-- Header -->
    <div class="cal-hdr">
      <button class="cal-back" id="calBack">← رجوع</button>
      <span class="cal-title">📅 تقويم التداول</span>
      <span style="width:80px"></span>
    </div>

    <!-- Loader -->
    <div class="cal-load" id="calLoad">
      <div class="cal-spin"></div><span>جاري التحميل...</span>
    </div>

    <!-- Main -->
    <div id="calMain" style="display:none;flex:1;flex-direction:column;overflow:hidden;min-height:0;">
      <div class="cal-stats" id="calStats"></div>
      <div class="cal-nav">
        <button class="cal-nav-btn" id="calPrev">›</button>
        <span class="cal-month" id="calMonth">—</span>
        <button class="cal-nav-btn" id="calNext">‹</button>
      </div>
      <div class="cal-ghdr" id="calGhdr"></div>
      <div class="cal-grid-wrap">
        <div class="cal-grid" id="calGrid"></div>
      </div>
    </div>

    <!-- Day Detail -->
    <div class="cal-det" id="calDet">
      <div class="cal-det-hdr">
        <span id="calDetT" style="font-size:15px;font-weight:900;">—</span>
        <button class="cal-back" id="calDetClose">✕</button>
      </div>
      <div class="cal-det-body" id="calDetB"></div>
    </div>

  </div><!-- /.cal-inner -->
</div>`);

/* ══════════════════════════════════════════════
   Constants & State
══════════════════════════════════════════════ */
const MONTHS=['يناير','فبراير','مارس','أبريل','مايو','يونيو',
              'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

// أيام الأسبوع — كاملة للديسكتوب، مختصرة للموبايل
const DAYS_FULL=['الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت','الأحد'];
const DAYS_SHORT=['إث','ث','أر','خ','ج','س','أح'];

let _fills=[], _fundMap={}, _dayMap={}, _cur=new Date(), _ready=false;
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

/* ══ API ══ */
async function api(body){
  const r=await fetch('https://api.hyperliquid.xyz/info',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)
  });return r.json();
}

/* ══ Build Maps ══ */
function buildMaps(fills,funding){
  const dayMap={},fundMap={};
  fills.forEach(f=>{
    const k=dayKey(new Date(f.time));
    const pnl=parseFloat(f.closedPnl||0)-parseFloat(f.fee||0);
    dayMap[k]=(dayMap[k]||0)+pnl;
  });
  (funding||[]).forEach(e=>{
    if(e.delta?.type!=='funding')return;
    const k=dayKey(new Date(e.time));
    // ✅ إشارة صحيحة: نعكس (موجب API = دفعت = ينقص من رصيدك = سالب)
    const usd=-parseFloat(e.delta.usdc||0);
    fundMap[k]=(fundMap[k]||0)+usd;
  });
  return{dayMap,fundMap};
}

/* ══ Stats ══ */
function showStats(){
  const now=Date.now();
  const pnl=ms=>_fills.filter(f=>f.time>=now-ms)
    .reduce((s,f)=>s+parseFloat(f.closedPnl||0)-parseFloat(f.fee||0),0);
  const all=_fills.reduce((s,f)=>s+parseFloat(f.closedPnl||0)-parseFloat(f.fee||0),0);
  const row=(lbl,v)=>`<div class="cal-stat">
    <span class="cal-stat-l">${lbl}</span>
    <span class="cal-stat-v ${v>=0?'up':'dn'}">${v>=0?'+':''}$${Math.abs(v).toFixed(2)}</span>
  </div>`;
  $('calStats').innerHTML=
    row('24 ساعة',pnl(86400000))+
    row('7 أيام',pnl(604800000))+
    row('30 يوم',pnl(2592000000))+
    row('الكل',all);
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

  const first=new Date(y,m,1),last=new Date(y,m+1,0);
  const start=monStart(first);
  const end=addDays(last,last.getDay()===0?0:7-last.getDay());
  const todayK=dayKey(new Date());
  const grid=$('calGrid');grid.innerHTML='';
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

    // PnL text — حجم ديناميكي
    let pHtml='<span></span>';
    if(inM&&Math.abs(total)>0.005){
      const txt=(total>0?'':'-')+'$'+fmtPnl(total);
      // حجم الخط يتكيف مع طول النص
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

  // رسوم التمويل
  if(fund!==0){
    body.insertAdjacentHTML('beforeend',`
      <div class="cal-fund-card">
        <div class="cal-fund-title">💰 رسوم التمويل (${fund>=0?'ربحت':'دفعت'})</div>
        <div style="font-family:'IBM Plex Mono';font-size:18px;font-weight:900;color:${fund>=0?'#34c85a':'#f05248'}">
          ${fund>=0?'+':'-'}$${Math.abs(fund).toFixed(6)}
        </div>
      </div>`);
  }

  // الصفقات
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

/* ══ Load Data ══ */
function getAddr(){
  if(window.State?.wallet?.address)return window.State.wallet.address;
  const pk=localStorage.getItem('hl_trade_pk');
  if(pk){try{if(typeof ethers!=='undefined')return new ethers.Wallet(pk).address;}catch{}}
  return null;
}

async function load(addr){
  $('calLoad').style.display='flex';
  $('calLoad').innerHTML='<div class="cal-spin"></div><span>جاري التحميل...</span>';
  $('calMain').style.display='none';
  try{
    const[fills,funding]=await Promise.all([
      api({type:'userFills',user:addr,dex:'xyz'}),
      api({type:'userFundingHistory',user:addr,dex:'xyz',startTime:Date.now()-365*86400000}).catch(()=>[])
    ]);
    _fills=Array.isArray(fills)?fills:[];
    const maps=buildMaps(_fills,Array.isArray(funding)?funding:[]);
    _dayMap=maps.dayMap;_fundMap=maps.fundMap;
    _ready=true;
    showStats();showCal();showMain();
  }catch(e){
    $('calLoad').innerHTML=`<span style="color:#f05248;font-size:14px">❌ ${e.message}</span>`;
  }
}

/* ══ Events ══ */
$('calBack').onclick=()=>$('calMod').classList.remove('open');
$('calDetClose').onclick=()=>$('calDet').classList.remove('open');
$('calPrev').onclick=()=>{_cur=new Date(_cur.getFullYear(),_cur.getMonth()-1,1);showCal();};
$('calNext').onclick=()=>{_cur=new Date(_cur.getFullYear(),_cur.getMonth()+1,1);showCal();};

// أعد رسم عناوين الأيام عند تغيير حجم النافذة
window.addEventListener('resize',()=>{if(_ready)renderDayHeaders();});

/* ══ Close on backdrop click (desktop) ══ */
$('calMod').addEventListener('click',e=>{
  if(isDesktop()&&e.target===$('calMod'))$('calMod').classList.remove('open');
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
  if(_ready){showStats();showCal();showMain();}
  else load(addr);
};

function bind(){const b=$('btnCalendar');if(b)b.onclick=()=>window.openCalendar();}
bind();
document.addEventListener('DOMContentLoaded',bind);
})();
