const TROY = 31.1035;

const LS_KEY       = 'hl_trade_pk';
const PIN_KEY      = 'hl_trade_pin';
const LOCKED_KEY   = 'hl_trade_locked';
const LAST_PIN_KEY = 'hl_last_pin_time';
const QSTATE_KEY   = 'hl_qstate_v1'; // progressive loading cache

const ASSETS = {
  XAU:    { coin:'xyz:GOLD',   idx:110003, lev:25, cross:true,  szDp:4, pxDp:2, unit:'غرام',  presets:[1,2,5,10,20,50],  icon:'⚖️', name:'ذهب/غرام', gram:true },
  NQ:     { coin:'xyz:XYZ100', idx:110000, lev:30, cross:true,  szDp:4, pxDp:0, unit:'عقد',   presets:[0.1,0.5,1,2,5],   icon:'📊', name:'ناسداك 100' },
  GOLD:   { coin:'xyz:GOLD',   idx:110003, lev:25, cross:true,  szDp:4, pxDp:2, unit:'أونصة', presets:[0.1,0.5,1,2,5],   icon:'🟡', name:'ذهب (أونصة)' },
  SILVER: { coin:'xyz:SILVER', idx:110026, lev:25, cross:true,  szDp:2, pxDp:2, unit:'أونصة', presets:[1,2,3,5,8,10,20], icon:'⚪', name:'فضة' },
  CL:     { coin:'xyz:CL',     idx:110029, lev:20, cross:false, szDp:3, pxDp:2, unit:'برميل', presets:[1,2,3,5,8,10,20], icon:'🛢', name:'نفط خام' }
};

// ✅ COIN_TO_SYM: XAU مستثنى — يُعالج يدوياً في _onWsBbo
const COIN_TO_SYM = {};
Object.entries(ASSETS).forEach(([sym,a]) => {
  if (sym === 'XAU') return;
  const raw = a.coin.includes(':') ? a.coin.split(':')[1] : a.coin;
  COIN_TO_SYM[raw] = sym;
  COIN_TO_SYM[sym] = sym;
});
COIN_TO_SYM['XAU'] = 'XAU';

const State = {
  wallet:null, asset:'CL', qty:0.1,
  prices:  {XAU:{bid:0,ask:0,mid:0},NQ:{bid:0,ask:0,mid:0},GOLD:{bid:0,ask:0,mid:0},SILVER:{bid:0,ask:0,mid:0},CL:{bid:0,ask:0,mid:0}},
  prevMid: {XAU:0,NQ:0,GOLD:0,SILVER:0,CL:0},
  prevDayPx:{XAU:0,NQ:0,GOLD:0,SILVER:0,CL:0},
  fundingRates:{}, positions:[], openOrders:[], timers:[],
  pendingTrade:null,pendingClose:null,pendingTP:null,pendingSL:null,
  balance:null,priceTimer:null,_balTimer:null,_clockTimer:null,_fundingTimer:null,
  lastPinTime:0,pinCallback:null,isLocked:false,
  currentPinInput:'',currentSetPinInput:'',referrerSet:false,
  sessionStats:{XAU:null,NQ:null,GOLD:null,SILVER:null,CL:null},
  _sessionTimer:null
};

/* ════ القفل ════ */
function lockApp(isManual=false){
  const pin=localStorage.getItem(PIN_KEY);
  if(!pin){if(isManual)openModal('modalSetPIN');return;}
  State.isLocked=true; localStorage.setItem(LOCKED_KEY,'true');
  State.currentPinInput=''; updatePinDots(); openModal('modalPIN');
  $('pinCancel').classList.add('hidden');
}
function unlockApp(){
  State.isLocked=false; localStorage.setItem(LOCKED_KEY,'false');
  localStorage.setItem(LAST_PIN_KEY,Date.now().toString());
  State.lastPinTime=Date.now(); State.currentPinInput='';
  closeModal('modalPIN'); $('pinCancel').classList.remove('hidden');
}
function appendPin(d){if(State.currentPinInput.length>=4)return;State.currentPinInput+=d;updatePinDots();if(State.currentPinInput.length===4)setTimeout(handleVerifyPin,150);}
function backspacePin(){if(!State.currentPinInput.length)return;State.currentPinInput=State.currentPinInput.slice(0,-1);updatePinDots();}
function updatePinDots(){const dots=$('pinDots')?.querySelectorAll('.dot');if(!dots)return;dots.forEach((d,i)=>d.classList.toggle('filled',i<State.currentPinInput.length));}
function appendSetPin(d){if(State.currentSetPinInput.length>=4)return;State.currentSetPinInput+=d;updateSetPinDots();if(State.currentSetPinInput.length===4)setTimeout(handleSetPin,150);}
function backspaceSetPin(){if(!State.currentSetPinInput.length)return;State.currentSetPinInput=State.currentSetPinInput.slice(0,-1);updateSetPinDots();}
function updateSetPinDots(){const dots=$('setPinDots')?.querySelectorAll('.dot');if(!dots)return;dots.forEach((d,i)=>d.classList.toggle('filled',i<State.currentSetPinInput.length));}
function requirePin(cb){
  const pin=localStorage.getItem(PIN_KEY);
  if(!pin){cb();return;}
  if(State.isLocked){State.pinCallback=cb;State.currentPinInput='';updatePinDots();openModal('modalPIN');$('pinCancel').classList.remove('hidden');}
  else cb();
}
function handleSetPin(){
  const pin=State.currentSetPinInput;
  if(!pin||pin.length<4)return toast('يجب أن يكون الرمز 4 أرقام','err');
  localStorage.setItem(PIN_KEY,pin);State.lastPinTime=Date.now();
  localStorage.setItem(LAST_PIN_KEY,State.lastPinTime.toString());
  State.currentSetPinInput='';updateSetPinDots();closeModal('modalSetPIN');unlockApp();
  toast('تم تعيين رمز PIN بنجاح','ok');
  if(State.pinCallback){const cb=State.pinCallback;State.pinCallback=null;cb();}
}
function handleVerifyPin(){
  const input=State.currentPinInput,saved=localStorage.getItem(PIN_KEY);
  if(input===saved){
    State.lastPinTime=Date.now();localStorage.setItem(LAST_PIN_KEY,State.lastPinTime.toString());
    unlockApp();
    if(State.pinCallback){const cb=State.pinCallback;State.pinCallback=null;cb();}
  } else {
    toast('رمز PIN غير صحيح','err');
    const d=$('pinDots');if(d){d.classList.add('shake');setTimeout(()=>d.classList.remove('shake'),400);}
    State.currentPinInput='';updatePinDots();
  }
}

/* ════ MsgPack ════ */
const MsgPack=(function(){
  const te=new TextEncoder();
  function enc(v,b){
    if(v===null){b.push(0xc0);return;}if(v===true){b.push(0xc3);return;}if(v===false){b.push(0xc2);return;}
    if(typeof v==='number'){
      if(Number.isInteger(v)&&v>=-2147483648&&v<=4294967295){
        if(v>=0&&v<=127){b.push(v);return;}if(v<0&&v>=-32){b.push(0xe0|(v+32));return;}
        if(v>=0&&v<=255){b.push(0xcc,v);return;}if(v>=-128&&v<0){b.push(0xd0,(v+256)&0xff);return;}
        if(v>=0&&v<=65535){b.push(0xcd,(v>>8)&0xff,v&0xff);return;}if(v>=-32768&&v<0){b.push(0xd1,(v>>8)&0xff,v&0xff);return;}
        if(v>=0){b.push(0xce,(v>>>24)&0xff,(v>>>16)&0xff,(v>>>8)&0xff,v&0xff);return;}
        b.push(0xd2,(v>>>24)&0xff,(v>>>16)&0xff,(v>>>8)&0xff,v&0xff);return;
      }
      const dv=new DataView(new ArrayBuffer(9));dv.setFloat64(1,v,false);
      b.push(0xcb);for(let i=1;i<=8;i++)b.push(dv.getUint8(i));return;
    }
    if(typeof v==='bigint'){b.push(0xcf);const dv=new DataView(new ArrayBuffer(8));dv.setBigUint64(0,v,false);for(let i=0;i<8;i++)b.push(dv.getUint8(i));return;}
    if(typeof v==='string'){
      const u=te.encode(v);
      if(u.length<=31)b.push(0xa0|u.length);else if(u.length<=255)b.push(0xd9,u.length);else b.push(0xda,(u.length>>8)&0xff,u.length&0xff);
      for(const c of u)b.push(c);return;
    }
    if(Array.isArray(v)){if(v.length<=15)b.push(0x90|v.length);for(const i of v)enc(i,b);return;}
    if(typeof v==='object'){const ks=Object.keys(v);if(ks.length<=15)b.push(0x80|ks.length);for(const k of ks){enc(k,b);enc(v[k],b);}}
  }
  return{encode:obj=>{const b=[];enc(obj,b);return new Uint8Array(b);}};
})();

/* ════ DOM ════ */
const $=id=>document.getElementById(id);
const openModal=id=>$(id)?.classList.add('open');
const closeModal=id=>$(id)?.classList.remove('open');
function toast(msg,type='info',dur=3500){const e=$('toast');if(!e)return;e.textContent=msg;e.className=`show ${type}`;clearTimeout(e._t);e._t=setTimeout(()=>e.className='',dur);}
function showLoader(t='جاري...'){$('loaderText').textContent=t;$('loader').classList.add('active');}
function hideLoader(){$('loader').classList.remove('active');}
function setTxt(id,t){const e=$(id);if(e)e.textContent=t;}
function setText(id,t,c){const e=$(id);if(!e)return;e.textContent=t;if(c)e.className=c;}
function setBtnLoading(id,t='⏳'){const b=$(id);if(!b)return;b._orig=b.innerHTML;b.disabled=true;b.innerHTML=t;}
function resetBtn(id){const b=$(id);if(!b)return;b.disabled=false;if(b._orig)b.innerHTML=b._orig;}
function wireSz(n,szDp){const f=Math.pow(10,szDp);const s=(Math.floor(Math.abs(+n)*f)/f).toFixed(szDp);return s.includes('.')?s.replace(/\.?0+$/,''):s;}
function wirePx(n,szDp){
  const price=Math.abs(+n);if(!price)return'0';
  const maxDp=6-szDp;const mag=Math.floor(Math.log10(price));
  const dp=Math.min(maxDp,Math.max(0,4-mag));
  const f=Math.pow(10,dp);const s=(Math.round(price*f)/f).toFixed(dp);
  return s.includes('.')?s.replace(/\.?0+$/,''):s;
}
function wire(n,dp){return wireSz(n,dp);}
const fmt=(n,d)=>(+n).toFixed(d);
function shortCoin(c){const raw=c.includes(':')?c.split(':')[1]:c;return COIN_TO_SYM[raw]||raw;}

/* ════ Progressive Loading Cache ════ */
function saveQuickState(){
  if(!State.wallet)return;
  try{
    localStorage.setItem(QSTATE_KEY,JSON.stringify({
      prices:State.prices, prevDayPx:State.prevDayPx, t:Date.now()
    }));
  }catch{}
}
function loadQuickState(){
  try{
    const d=JSON.parse(localStorage.getItem(QSTATE_KEY)||'null');
    if(!d||Date.now()-d.t>300000)return; // 5 min
    if(d.prices)Object.assign(State.prices,d.prices);
    if(d.prevDayPx)Object.assign(State.prevDayPx,d.prevDayPx);
    // Show cached prices immediately in tabs
    Object.keys(ASSETS).forEach(sym=>{
      const p=State.prices[sym];if(!p?.mid)return;
      const el=$(`price${sym}`);if(el)el.textContent=fmt(p.mid,ASSETS[sym].pxDp);
    });
  }catch{}
}

/* ════ API ════ */
const HL_API='https://api.hyperliquid.xyz';
// ✅ ثوابت الإيداع عبر Arbitrum
const ARB_RPC  = 'https://arb1.arbitrum.io/rpc';
const USDC_CA  = '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8'; // USDC.e on Arbitrum
const BRDG_CA  = '0x2Df1c51E09aECF9d2B5688B5c82A9bBDE18B9494'; // Hyperliquid bridge
async function hlInfo(body){
  const r=await fetch(HL_API+'/info',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!r.ok)throw new Error(`HTTP ${r.status}`);
  const text=await r.text();
  return JSON.parse(text.replace(/"oid":\s*(\d{15,})/g,'"oid":"$1"'));
}
async function hlExchange(action){
  if(!State.wallet)throw new Error('لا توجد محفظة');
  const nonce=Date.now();
  const encoded=MsgPack.encode(action);
  const nb=new ArrayBuffer(8);new DataView(nb).setBigUint64(0,BigInt(nonce),false);
  const payload=new Uint8Array(encoded.length+9);
  payload.set(encoded,0);payload.set(new Uint8Array(nb),encoded.length);
  payload[encoded.length+8]=0x00;
  const connId=ethers.keccak256(payload);
  const sig=await State.wallet.signTypedData(
    {name:'Exchange',version:'1',chainId:1337,verifyingContract:'0x0000000000000000000000000000000000000000'},
    {Agent:[{name:'source',type:'string'},{name:'connectionId',type:'bytes32'}]},
    {source:'a',connectionId:connId}
  );
  const {r,s,v}=ethers.Signature.from(sig);
  const jb=JSON.stringify({action,nonce,signature:{r,s,v},vaultAddress:null},(k,val)=>typeof val==='bigint'?`:BIGINT:${val}:`:val);
  const res=await fetch(HL_API+'/exchange',{method:'POST',headers:{'Content-Type':'application/json'},body:jb.replace(/":BIGINT:(\d+):"/g,'$1')});
  const data=JSON.parse((await res.text()).replace(/"oid":\s*(\d{15,})/g,'"oid":"$1"'));
  if(data.status!=='ok'){const err=data.response?.data?.statuses?.[0]||data.response||JSON.stringify(data).slice(0,200);throw new Error(typeof err==='string'?err:JSON.stringify(err));}
  return data;
}
async function autoSetReferrer(){
  if(!State.wallet||State.referrerSet)return;
  try{
    const ref=await hlInfo({type:'referral',user:State.wallet.address});
    if(ref.referredBy){State.referrerSet=true;return;}
    await hlExchange({type:'setReferrer',code:'KANBA'});
    State.referrerSet=true;
    console.log('✅ رابط الإحالة: https://app.hyperliquid.xyz/join/KANBA');
  }catch{}
}
function tradeErr(msg){
  const m=msg.toLowerCase();
  if(m.includes('does not exist')||m.includes('not found'))return'⚠️ الحساب غير مفعّل — أودع USDC أولاً';
  if(m.includes('insufficient')||m.includes('margin'))return'❌ رصيد غير كافٍ';
  if(m.includes('halted')||m.includes('no fill'))return'❌ السوق مغلق الآن';
  if(m.includes('reduce'))return'❌ لا يوجد مركز مفتوح';
  return`❌ ${msg.slice(0,150)}`;
}

/* ════ جلسة اليوم (12 AM UTC+3) ════ */
function getSessionStartMs(){
  const u3=new Date(Date.now()+3*3600_000);
  return Date.UTC(u3.getUTCFullYear(),u3.getUTCMonth(),u3.getUTCDate(),0,0,0)-3*3600_000;
}
async function fetchSessionStats(sym){
  try{
    const a=ASSETS[sym];if(!a)return;
    const div=a.gram?TROY:1;
    const raw=await hlInfo({type:'candleSnapshot',req:{coin:a.coin,interval:'1h',startTime:getSessionStartMs(),endTime:Date.now()}});
    if(!Array.isArray(raw)||!raw.length)return;
    State.sessionStats[sym]={
      open:parseFloat(raw[0].o)/div,
      high:Math.max(...raw.map(c=>parseFloat(c.h)))/div,
      low:Math.min(...raw.map(c=>parseFloat(c.l)))/div
    };
    if(State.asset===sym)updateSessionUI();
  }catch(e){console.warn('[Session]',sym,e.message);}
}
function updateSessionUI(){
  const sym=State.asset,st=State.sessionStats[sym],p=State.prices[sym],a=ASSETS[sym],el=$('priceSession');
  if(!st||!p?.mid||!el)return;
  const pct=((p.mid-st.open)/st.open)*100;
  el.classList.remove('hidden');
  const chgEl=$('psChg');
  if(chgEl){chgEl.textContent=`${pct>=0?'+':''}${pct.toFixed(2)}%`;chgEl.className=`ps-chg ${pct>=0?'up':'dn'}`;}
  const hEl=$('psH');if(hEl)hEl.textContent=`H ${fmt(st.high,a.pxDp)}`;
  const lEl=$('psL');if(lEl)lEl.textContent=`L ${fmt(st.low,a.pxDp)}`;
}
function startSessionPolling(){
  if(State._sessionTimer)clearInterval(State._sessionTimer);
  fetchSessionStats(State.asset);
  State._sessionTimer=setInterval(()=>fetchSessionStats(State.asset),3*60_000);
}

/* ════ WebSocket BBO ════ */
let _mainWs=null,_mainWsReconTimer=null;
function startMainWs(){
  wsMainClose();
  try{
    _mainWs=new WebSocket('wss://api.hyperliquid.xyz/ws');
    _mainWs.onopen=()=>{
      if(!_mainWs)return;
      const seen=new Set();
      Object.values(ASSETS).forEach(a=>{if(!seen.has(a.coin)){seen.add(a.coin);_mainWs.send(JSON.stringify({method:'subscribe',subscription:{type:'bbo',coin:a.coin}}));}});
    };
    _mainWs.onmessage=e=>{try{const msg=JSON.parse(e.data);if(msg.channel==='bbo'&&msg.data)_onWsBbo(msg.data);}catch{}};
    _mainWs.onerror=()=>{};
    _mainWs.onclose=()=>{if(State.wallet)_mainWsReconTimer=setTimeout(startMainWs,4000);};
  }catch(e){console.warn('[WS]',e.message);}
}
function wsMainClose(){clearTimeout(_mainWsReconTimer);if(_mainWs){try{_mainWs.close();}catch{}_mainWs=null;}}

/* ✅ معالجة BBO — GOLD و XAU منفصلان تماماً بدون تداخل */
function _updateTab(sym,mid,dp){
  const el=$(`price${sym}`);if(!el)return;
  const dir=mid>State.prevMid[sym]?'up':mid<State.prevMid[sym]?'dn':'';
  el.textContent=fmt(mid,dp);
  el.className=`tab-price${dir?' '+dir:''}`;
  if(dir)setTimeout(()=>el.className='tab-price',800);
}
function _onWsBbo(data){
  const coin=data.coin||'';
  const raw=coin.includes(':')?coin.split(':')[1]:coin;
  const bid=parseFloat(data.bbo?.[0]?.px||0);
  const ask=parseFloat(data.bbo?.[1]?.px||0);
  const mid=(bid&&ask)?(bid+ask)/2:(bid||ask);
  if(!mid)return;

  if(raw==='GOLD'){
    // ── أونصة ذهب ──
    State.prices['GOLD']={bid,ask,mid};
    _updateTab('GOLD',mid,ASSETS['GOLD'].pxDp);
    State.prevMid['GOLD']=mid;
    if(State.asset==='GOLD')updatePriceUI();

    // ── غرام ذهب (XAU) = أونصة ÷ TROY ──
    const gm=mid/TROY,gBid=bid/TROY,gAsk=ask/TROY;
    State.prices['XAU']={bid:gBid,ask:gAsk,mid:gm};
    _updateTab('XAU',gm,ASSETS['XAU'].pxDp);
    State.prevMid['XAU']=gm;
    if(State.asset==='XAU')updatePriceUI();
    return;
  }

  const sym=COIN_TO_SYM[raw]||raw;
  if(!ASSETS[sym])return;
  State.prices[sym]={bid,ask,mid};
  _updateTab(sym,mid,ASSETS[sym].pxDp);
  State.prevMid[sym]=mid;
  if(sym===State.asset)updatePriceUI();
}

/* ════ رسوم حسب الأصل ════
   GOLD/XAU: 0.09% فتح + 0.09% إغلاق = 0.18% إجمالي
   باقي الأصول: 0.009% فتح + 0.009% إغلاق
════════════════════════════ */
function feeRate(sym){return(sym==='GOLD'||sym==='XAU')?0.0009:0.00009;}
function feeRatePct(sym){return(sym==='GOLD'||sym==='XAU')?'0.09%':'0.009%';}

/* ════ REST Polling — كل 2 ثانية دائماً ════ */
let _ctxCounter=0;
async function pollPrices(){
  // prevDayPx كل 30 ثانية
  if(_ctxCounter%15===0){
    try{
      const xyz=await hlInfo({type:'metaAndAssetCtxs',dex:'xyz'}).catch(()=>null);
      if(xyz&&Array.isArray(xyz)&&xyz[1]){
        xyz[0].universe.forEach((u,i)=>{
          const r=u.name.includes(':')?u.name.split(':')[1]:u.name;
          const prev=parseFloat(xyz[1][i].prevDayPx||0);if(!prev)return;
          if(r==='GOLD'){State.prevDayPx['GOLD']=prev;State.prevDayPx['XAU']=prev/TROY;return;}
          const sym=COIN_TO_SYM[r]||r;if(ASSETS[sym])State.prevDayPx[sym]=prev;
        });
      }
    }catch{}
  }
  _ctxCounter++;

  // ✅ إصلاح الخلل الجذري: XAU مستثنى من uniqueCoins لأنه مشتق من GOLD
  // Object.keys يُرجع XAU قبل GOLD فكان يضع سعر الأونصة في XAU!
  const uniqueCoins={};
  Object.keys(ASSETS).forEach(sym=>{
    if(sym==='XAU')return; // XAU مشتق من GOLD — يُحسب تلقائياً عند معالجة GOLD
    const c=ASSETS[sym].coin;if(!uniqueCoins[c])uniqueCoins[c]=sym;
  });
  await Promise.all(Object.entries(uniqueCoins).map(async([coinStr,sym])=>{
    try{
      const lb=await hlInfo({type:'l2Book',coin:coinStr});
      const bid=parseFloat(lb.levels?.[0]?.[0]?.px||0);
      const ask=parseFloat(lb.levels?.[1]?.[0]?.px||0);
      const mid=(bid&&ask)?(bid+ask)/2:0;
      if(!mid)return;
      if(sym==='GOLD'){
        State.prices['GOLD']={bid,ask,mid};
        _updateTab('GOLD',mid,ASSETS['GOLD'].pxDp);
        State.prevMid['GOLD']=mid;
        if(State.asset==='GOLD')updatePriceUI();
        const gm=mid/TROY;
        State.prices['XAU']={bid:bid/TROY,ask:ask/TROY,mid:gm};
        _updateTab('XAU',gm,ASSETS['XAU'].pxDp);
        State.prevMid['XAU']=gm;
        if(State.asset==='XAU')updatePriceUI();
      } else {
        State.prices[sym]={bid,ask,mid};
        _updateTab(sym,mid,ASSETS[sym].pxDp);
        State.prevMid[sym]=mid;
        if(sym===State.asset)updatePriceUI();
      }
    }catch{}
  }));
  saveQuickState(); // حفظ الحالة لتحميل سريع في المرة القادمة
}

function updatePriceUI(){
  const a=ASSETS[State.asset],p=State.prices[State.asset];
  if(!p||!p.mid)return;
  const dir=p.mid>State.prevMid[State.asset]?1:p.mid<State.prevMid[State.asset]?-1:0;
  const cls=dir>0?'up':dir<0?'dn':'n';
  $('priceCard').className=`price-card${dir>0?' up':dir<0?' dn':''}`;
  setText('priceValue',fmt(p.mid,a.pxDp),`price-value ${cls}`);
  setTxt('buyPrice',fmt(p.mid,a.pxDp));setTxt('sellPrice',fmt(p.mid,a.pxDp));
  const prevDay=State.prevDayPx[State.asset];
  if(prevDay>0){
    const chg=((p.mid-prevDay)/prevDay)*100;
    setText('priceDelta',`تغيير 24 ساعة: ${chg>=0?'+':''}${chg.toFixed(2)}%`,`price-delta ${chg>0?'up':chg<0?'dn':'n'}`);
  }
  if(p.bid&&p.ask)setTxt('priceBidAsk',`شراء ${fmt(p.bid,a.pxDp)} · بيع ${fmt(p.ask,a.pxDp)}`);
  State.prevMid[State.asset]=p.mid;
  updateSessionUI();
  let s=1;clearInterval(State.priceTimer);setTxt('priceTimer',`↻ ${s}s`);
  State.priceTimer=setInterval(()=>{s++;setTxt('priceTimer',`↻ ${s}s`);},1000);
  recalcTpPreview();recalcSlPreview();
}

/* ════ الحساب — native + xyz ════ */
async function pollAccount(){
  if(!State.wallet)return;
  try{
    const [native,spot,xyz,openOrders]=await Promise.all([
      hlInfo({type:'clearinghouseState',user:State.wallet.address}).catch(()=>({})),
      hlInfo({type:'spotClearinghouseState',user:State.wallet.address}).catch(()=>({})),
      hlInfo({type:'clearinghouseState',user:State.wallet.address,dex:'xyz'}).catch(()=>({})),
      hlInfo({type:'frontendOpenOrders',user:State.wallet.address,dex:'xyz'}).catch(()=>[])
    ]);
    State.openOrders=Array.isArray(openOrders)?openOrders:[];

    // ✅ الرصيد الكلي الصحيح
    const nativeVal=parseFloat(native?.marginSummary?.accountValue||0);
    const xyzVal   =parseFloat(xyz?.marginSummary?.accountValue||0);
    let spotUSDC=0;
    for(const b of spot?.balances||[])
      if(b.coin==='USDC'||b.coin==='USDC:0')spotUSDC+=parseFloat(b.total||0);
    const total=nativeVal+(xyzVal>0&&xyzVal!==nativeVal?xyzVal:0)+spotUSDC;
    const margin=parseFloat(xyz?.marginSummary?.totalMarginUsed||0)||parseFloat(native?.marginSummary?.totalMarginUsed||0);

    // ✅ الصفقات: من xyz (حيث يُتداول GOLD/SILVER/CL)
    const rawPos=(xyz?.assetPositions||[]).filter(p=>parseFloat(p.position?.szi||0)!==0);
    const floatPnl=rawPos.reduce((s,p)=>s+parseFloat(p.position?.unrealizedPnl||0),0);
    State.balance={total,margin,floatPnl};

    State.positions=rawPos.map(p=>{
      const existing=State.positions.find(e=>e.position.coin===p.position.coin);
      const tpsl=parseTpslFromOrders(State.openOrders,p.position.coin);
      if(existing&&!tpsl.tp&&!tpsl.sl&&existing.tpsl)return{...p,tpsl:existing.tpsl};
      return{...p,tpsl};
    });
    updateFundingFromPositions(rawPos);
    renderPositions();
    autoSetReferrer();
  }catch(e){console.warn('[pollAccount]',e.message);}
}
function parseTpslFromOrders(orders,coin){
  const r={tp:null,sl:null,tpOid:null,slOid:null};
  for(const o of orders||[]){
    if(o.coin!==coin||!o.isTrigger)continue;
    const ot=(o.orderType||'').toLowerCase();
    if(ot.includes('take profit')||ot.includes('tp')){r.tp=parseFloat(o.triggerPx);r.tpOid=o.oid;}
    else if(ot.includes('stop')||ot.includes('sl')){r.sl=parseFloat(o.triggerPx);r.slOid=o.oid;}
  }
  return r;
}

/* ════════════════════════════════════════════════════════════════
   حساب سعر التصفية — صيغة Hyperliquid الرسمية
   liq_price = entry - side × margin_available / size / (1 - l × side)
   l = 1 / maintenance_leverage = mm_rate
   mm_rate = 1 / (2 × max_leverage)

   Cross:    margin_available = balance - notional × mm_rate
   Isolated: margin_available = (notional / lev) - notional × mm_rate

   إذا كان liq_price <= 0 للـ Long أو >= ∞ للـ Short → "آمن" (لا تصفية)
════════════════════════════════════════════════════════════════ */
function calcLiqPrice(entryPxOz, sziOz, balance, isCross, maxLev){
  if(!entryPxOz||!sziOz||!maxLev)return null;
  const mmRate  = 1/(2*maxLev);        // 2% عند 25x، 2.5% عند 20x
  const mmLev   = 2*maxLev;
  const l       = mmRate;              // = 1/mmLev
  const side    = sziOz>0?1:-1;
  const absSize = Math.abs(sziOz);
  const notional= absSize*entryPxOz;
  let marginAvail;
  if(isCross){
    // Cross: كل الرصيد يحمي الصفقة
    marginAvail = (balance||0) - notional*mmRate;
  } else {
    // Isolated: فقط الهامش المخصص
    const initMargin = notional/maxLev;
    marginAvail = initMargin - notional*mmRate;
  }
  const denom = 1 - l*side;
  if(Math.abs(denom)<0.0001)return null;
  const liq = entryPxOz - side*marginAvail/absSize/denom;
  // فحص صحة: Long→ liq<entry، Short→ liq>entry
  if(side===1&&liq<=0)return 0;   // آمن جداً (يحتاج انهيار 100%)
  if(side===-1&&liq>=entryPxOz*100)return null; // آمن جداً
  return liq;
}

// نص عرض سعر التصفية للمستخدم (بوحدة العرض — غرام أو أونصة)
function liqPriceDisplay(sym, entryPxOz, sziOz, balance){
  const a=ASSETS[sym]||ASSETS['GOLD']||{lev:20,cross:false,pxDp:2,gram:false};
  const isGram=!!a.gram;
  const liqOz=calcLiqPrice(entryPxOz,sziOz,balance,a.cross,a.lev);
  if(liqOz===null)return{text:'—',ounce:null};
  if(liqOz===0)return{text:'آمن ✅',ounce:0};
  const liqDisp=isGram?liqOz/TROY:liqOz;
  return{text:`$${fmt(liqDisp,a.pxDp)}`,ounce:liqOz};
}

function calcTpPrice(ep,szi,pnl){const sz=parseFloat(szi),e=parseFloat(ep);return sz>0?e+pnl/sz:e-pnl/Math.abs(sz);}
function calcSlPrice(ep,szi,sl){const sz=parseFloat(szi),e=parseFloat(ep);return sz>0?e-sl/sz:e+sl/Math.abs(sz);}

/* ════ رسوم التمويل ════
   cumFunding.sinceOpen من API:
   موجب = دفعت (ينقص رصيدك) → نعرضه بعلامة - وأحمر
   سالب = استلمت (يزيد رصيدك) → نعرضه بعلامة + وأخضر
   → نعكس بضرب -1 ════ */
function updateFundingFromPositions(positions){
  const acc={};
  for(const p of positions||[]){
    const pos=p.position,coin=pos.coin||'';
    const raw=coin.includes(':')?coin.split(':')[1]:coin;
    // ✅ GOLD → XAU (غرام) لعرض صحيح
    const sym=raw==='GOLD'?'XAU':(COIN_TO_SYM[raw]||raw);
    acc[sym]=-parseFloat(pos.cumFunding?.sinceOpen||0);
  }
  State.fundingRates=acc;
  // تحديث عناصر DOM
  Object.entries(acc).forEach(([sym,usd])=>{
    document.querySelectorAll(`[data-funding-sym="${sym}"]`).forEach(el=>{
      // ✅ علامة - أو + صريحة دائماً
      const sign=usd>=0?'+':'-';
      el.textContent=`${sign}$${Math.abs(usd).toFixed(4)}`;
      el.className=`pos-funding-val ${usd>=0?'pos':'neg'}`;
    });
  });
}
async function fetchFundingRates(){
  if(!State.wallet)return;
  try{
    const xyz=await hlInfo({type:'clearinghouseState',user:State.wallet.address,dex:'xyz'}).catch(()=>({}));
    const rawPos=(xyz?.assetPositions||[]).filter(p=>parseFloat(p.position?.szi||0)!==0);
    if(rawPos.length)updateFundingFromPositions(rawPos);
  }catch(e){console.warn('[funding]',e.message);}
}
function startFundingTimer(){
  clearInterval(State._fundingTimer);fetchFundingRates();
  State._fundingTimer=setInterval(fetchFundingRates,60*1000);
}

/* ════ Render Positions ════ */

// ✅ للصفقات: xyz:GOLD دائماً يُعرض كـ XAU (غرام)
// كلا الأصلين نفس العقد — نختار عرض الغرام دائماً
function shortCoinPos(c){
  const raw=c.includes(':')?c.split(':')[1]:c;
  if(raw==='GOLD')return'XAU'; // xyz:GOLD → غرام دائماً في الصفقات
  return COIN_TO_SYM[raw]||raw;
}
// للـ API: دائماً نستخدم GOLD (أونصة) لأن الـ idx والـ szDp صحيحان
function apiAsset(sym){return(sym==='XAU')?ASSETS['GOLD']:ASSETS[sym]||ASSETS[sym];}

let _posFingerprint='';
function renderPositions(){
  const count=State.positions.length;
  const fp=State.positions.map(p=>`${p.position.coin}|${p.position.szi}|${p.tpsl?.tp||''}|${p.tpsl?.sl||''}`).join(';');
  setTxt('positionsCount',count);
  const clsBtn=$('btnCloseAll');if(clsBtn)clsBtn.classList.toggle('hidden',count===0);
  const totalPnl=State.positions.reduce((s,p)=>s+parseFloat(p.position.unrealizedPnl||0),0);

  // تحديث PnL + السعر الحالي بسلاسة
  State.positions.forEach((p,i)=>{
    const pnl=parseFloat(p.position.unrealizedPnl||0);
    const el=document.querySelector(`[data-pnl-idx="${i}"]`);
    if(el){const s=pnl>=0?'+':'';el.textContent=`${s}$${fmt(pnl,2)}`;el.className=`pos-pnl ${pnl>=0?'pos':'neg'}`;}
    const cpEl=document.querySelector(`[data-curpx-idx="${i}"]`);
    if(cpEl){
      const sym=shortCoinPos(p.position.coin);
      const a=ASSETS[sym]||{pxDp:2};
      const cur=State.prices[sym]?.mid;
      cpEl.textContent=cur?'$'+fmt(cur,a.pxDp):'—';
    }
    // ✅ سعر التصفية الحقيقي — يُحدَّث لحظياً مع كل سعر جديد
    const liqEl=document.querySelector(`[data-liq-idx="${i}"]`);
    if(liqEl){
      const sym=shortCoinPos(p.position.coin);
      const a=ASSETS[sym]||{};
      const isGram=!!a.gram;
      const entryOz=parseFloat(p.position.entryPx||0);
      const sziOz=parseFloat(p.position.szi||0);
      const bal=State.balance?.total||0;
      const liqInfo=liqPriceDisplay(sym,entryOz,sziOz,bal);
      liqEl.textContent=liqInfo.text;
      liqEl.style.color=liqInfo.text==='آمن ✅'?'var(--up)':'var(--warn)';
    }
  });
  const tEl=$('totalPnl');
  if(tEl){tEl.textContent=`${totalPnl>=0?'+':''}$${fmt(totalPnl,2)}`;tEl.className=`positions-pnl ${totalPnl>=0?'pos':'neg'}`;}
  if(fp===_posFingerprint)return;_posFingerprint=fp;
  const list=$('positionsList');
  if(!count){list.innerHTML='<div class="positions-empty">📂 لا توجد صفقات مفتوحة</div>';return;}
  list.innerHTML=State.positions.map((p,i)=>{
    const pos=p.position,sziOz=parseFloat(pos.szi);
    const pnl=parseFloat(pos.unrealizedPnl||0);
    const sym=shortCoinPos(pos.coin); // 'XAU' للذهب الغرام
    const a=ASSETS[sym]||{name:sym,unit:'',icon:'📊',pxDp:2,szDp:2};
    const isGram=!!a.gram;
    // ✅ تحويل: الحجم بالغرام، الأسعار بالغرام
    const sziDisp=isGram?sziOz*TROY:sziOz;        // أونصة→غرام للعرض
    const entryDisp=isGram?parseFloat(pos.entryPx||0)/TROY:parseFloat(pos.entryPx||0);
    const curPx=State.prices[sym]?.mid;             // XAU سعره بالغرام مباشرة
    const isLong=sziOz>0,pCls=pnl>=0?'pos':'neg';
    const tpsl=p.tpsl||{};
    // ✅ TP/SL: من API بسعر أونصة → نقسم على TROY للعرض
    const tpDisp=tpsl.tp?(isGram?tpsl.tp/TROY:tpsl.tp):null;
    const slDisp=tpsl.sl?(isGram?tpsl.sl/TROY:tpsl.sl):null;
    const fundUsd=State.fundingRates[sym]||State.fundingRates['GOLD']||0;
    // ✅ إصلاح علامة التمويل: - أو + صريحة دائماً
    const fundSign=fundUsd>=0?'+':'-';
    const fundCls=fundUsd>=0?'pos':'neg';
    return`<div class="position-item">
      <div class="pos-top">
        <div>
          <div class="pos-name">${a.icon} ${a.name}</div>
          <div class="pos-dir ${isLong?'long':'short'}">${isLong?'▲ شراء':'▼ بيع'} · رافعة ${a.lev}x</div>
        </div>
        <div class="pos-right">
          <div class="pos-pnl ${pCls}" data-pnl-idx="${i}">${pnl>=0?'+':''}$${fmt(pnl,2)}</div>
          <div class="pos-size">${Math.abs(sziDisp).toFixed(isGram?2:a.szDp)} ${a.unit}</div>
        </div>
      </div>
      <div class="pos-data-grid">
        <div class="pos-data-item"><span class="pos-data-label">سعر الدخول</span><span class="pos-data-value">$${fmt(entryDisp,a.pxDp)}</span></div>
        <div class="pos-data-item"><span class="pos-data-label">السعر الحالي</span><span class="pos-data-value" data-curpx-idx="${i}">${curPx?'$'+fmt(curPx,a.pxDp):'—'}</span></div>
        <div class="pos-data-item"><span class="pos-data-label">رسوم التمويل</span>
          <span class="pos-data-value pos-funding-val ${fundCls}" data-funding-sym="${sym}">${fundSign}$${Math.abs(fundUsd).toFixed(4)}</span></div>
        <div class="pos-data-item" style="grid-column:1/-1;border-top:1px solid var(--border);padding-top:4px;margin-top:2px;">
          <span class="pos-data-label">⚡ سعر التصفية</span>
          <span class="pos-data-value" style="color:var(--warn)" data-liq-idx="${i}">—</span>
        </div>
      </div>
      <div class="pos-tpsl-row">
        <button class="tpsl-btn ${tpDisp?'tp-set':'tp-unset'}" onclick="openTP(${i})">
          <span class="sub">🎯 جني الربح</span>
          <span class="val">${tpDisp?`$${fmt(tpDisp,a.pxDp)}`:'تعيين'}</span>
        </button>
        <button class="tpsl-btn ${slDisp?'sl-set':'sl-unset'}" onclick="openSL(${i})">
          <span class="sub">🛡 وقف الخسارة</span>
          <span class="val">${slDisp?`$${fmt(slDisp,a.pxDp)}`:'تعيين'}</span>
        </button>
      </div>
      <div class="pos-actions-row">
        <button class="btn-pos-close" onclick="askClose(${i})">إغلاق الصفقة ✕</button>
      </div>
    </div>`;
  }).join('');
  if(typeof ChartModule!=='undefined')ChartModule.refreshLines();
}

/* ════ Assets ════ */
const ASSET_IMAGES={XAU:'/hl/images/gold.svg',NQ:'/hl/images/100.png',GOLD:'/hl/images/gold.svg',SILVER:'/hl/images/silver.svg',CL:'/hl/images/oil.svg'};
function switchAsset(sym){
  State.asset=sym;
  document.querySelectorAll('.tab[data-asset]').forEach(t=>t.classList.toggle('active',t.dataset.asset===sym));
  const a=ASSETS[sym];
  setTxt('priceAssetName',a.name);setTxt('tradeAssetName',a.name);setTxt('qtyUnit',a.unit);
  const img=$('priceAssetImg');if(img&&ASSET_IMAGES[sym]){img.src=ASSET_IMAGES[sym];img.alt=sym;}
  renderPresets(a.presets);State.prevMid[sym]=0;
  setText('priceDelta','','price-delta n');
  updatePriceUI();$('priceSession')?.classList.add('hidden');
  fetchSessionStats(sym);
  if(typeof ChartModule!=='undefined')ChartModule.switchAssetChart(sym);
}
function renderPresets(arr){
  $('qtyPresets').innerHTML=arr.map((v,i)=>`<button class="qty-preset${i===0?' active':''}" data-v="${v}">${v}</button>`).join('');
  State.qty=arr[0];$('qtyInput').value=arr[0];
  $('qtyPresets').onclick=e=>{
    if(!e.target.classList.contains('qty-preset'))return;
    State.qty=parseFloat(e.target.dataset.v);$('qtyInput').value=State.qty;
    $('qtyPresets').querySelectorAll('.qty-preset').forEach(b=>b.classList.remove('active'));
    e.target.classList.add('active');
  };
}

/* ════ التداول ════ */
function askTrade(isBuy){
  const qty=parseFloat($('qtyInput').value||State.qty||0);
  if(!qty||qty<=0)return toast('أدخل الكمية أولاً','err');
  const a=ASSETS[State.asset],p=State.prices[State.asset];
  if(!p?.mid)return toast('لا يوجد سعر — السوق مغلق؟','err');

  // ✅ XAU: عرض الغرامات والأونصات معاً
  const isGram=!!a.gram;
  const ozQty=isGram?(qty/TROY):qty;
  const dispQty=isGram?`${qty} غرام (≈ ${ozQty.toFixed(4)} أونصة)`:` ${qty} ${a.unit}`;
  const tradeMid=isGram?p.mid*TROY:p.mid; // سعر الأونصة للحسابات
  const usd=(tradeMid*ozQty).toFixed(2);
  const mgn=(tradeMid*ozQty/a.lev).toFixed(2);
  const liq=fmt(p.mid*(isBuy?1-1/a.lev:1+1/a.lev),a.pxDp);
  const fr=feeRate(State.asset);
  const feeOpen=(tradeMid*ozQty*fr).toFixed(4);
  const feeTot=(tradeMid*ozQty*fr*2).toFixed(4);

  // ✅ سعر التصفية بصيغة Hyperliquid الرسمية
  const sziForLiq = isBuy ? ozQty : -ozQty;
  const balance   = State.balance?.total||0;
  const liqInfo   = liqPriceDisplay(State.asset, tradeMid, sziForLiq, balance);
  const liqCls    = liqInfo.text==='آمن ✅'?'up':'sell';

  setTxt('confirmTitle',`${a.icon} ${isBuy?'شراء ↑':'بيع ↓'} — ${a.name}`);
  setTxt('confirmSubtitle',`رافعة ${a.lev}x · تنفيذ فوري`);
  $('confirmDetails').innerHTML=`
    <div class="confirm-row"><span class="confirm-key">الكمية</span><span class="confirm-val">${dispQty}</span></div>
    <div class="confirm-row"><span class="confirm-key">سعر ${isGram?'الغرام':'الوحدة'}</span><span class="confirm-val">${fmt(p.mid,a.pxDp)} $</span></div>
    <div class="confirm-row"><span class="confirm-key">القيمة الكلية</span><span class="confirm-val">≈ $${usd}</span></div>
    <div class="confirm-row"><span class="confirm-key">الهامش المطلوب</span><span class="confirm-val warn">≈ $${mgn}</span></div>
    <div class="confirm-row"><span class="confirm-key">التصفية التقريبية</span><span class="confirm-val ${liqCls}">${liqInfo.text}</span></div>
    <div class="confirm-row"><span class="confirm-key">رسوم الفتح</span><span class="confirm-val fee">$${feeOpen} (${feeRatePct(State.asset)})</span></div>
    <div class="confirm-row"><span class="confirm-key">إجمالي الرسوم</span><span class="confirm-val fee">≈ $${feeTot}</span></div>`;
  const btn=$('confirmExecute');
  btn.className=`btn-modal btn-confirm ${isBuy?'btn-success':'btn-danger'}`;
  btn.innerHTML=isBuy?'✅ تأكيد الشراء':'✅ تأكيد البيع';
  State.pendingTrade={isBuy,qty,sym:State.asset};
  openModal('modalConfirm');
}
async function execTrade(){
  if(!State.pendingTrade){closeModal('modalConfirm');return;}
  let{isBuy,qty,sym}=State.pendingTrade;
  const a=ASSETS[sym],p=State.prices[sym];
  // ✅ XAU: المستخدم يدخل غرامات → نرسل أونصات لـ Hyperliquid (1 غرام = 1/TROY أونصة)
  const execQty=a.gram?+(qty/TROY).toFixed(4):qty;
  const execMid=a.gram?p.mid*TROY:p.mid; // سعر الأونصة للحساب
  const execSzDp=a.gram?4:a.szDp;
  if(!p?.mid){toast('لا يوجد سعر','err');closeModal('modalConfirm');return;}
  setBtnLoading('confirmExecute','⏳');showLoader(`${a.icon} ${isBuy?'شراء':'بيع'} ${qty} ${a.unit}...`);
  try{
    try{await hlExchange({type:'updateLeverage',asset:a.idx,isCross:a.cross,leverage:a.lev});}catch(e){console.warn('[lev]',e.message);}
    const slip=sym==='NQ'?0.03:0.02;
    const res=await hlExchange({
      type:'order',
      orders:[{a:a.idx,b:isBuy,p:wirePx(execMid*(isBuy?1+slip:1-slip),execSzDp),s:wireSz(execQty,execSzDp),r:false,t:{limit:{tif:'Ioc'}}}],
      grouping:'na'
    });
    const status=res?.response?.data?.statuses?.[0];
    if(status?.error)throw new Error(status.error);
    if(status?.filled){
      const f=status.filled;closeModal('modalConfirm');
      const dispSz=a.gram?(+f.totalSz*TROY).toFixed(2):f.totalSz;
      toast(`✅ مُنفَّذ — ${a.icon} ${dispSz} ${a.unit} @ ${fmt(parseFloat(f.avgPx)/(a.gram?TROY:1),a.pxDp)}`,'ok',5000);
    } else if(status?.resting){closeModal('modalConfirm');toast(`⏳ أمر معلق — ${a.icon} ${qty} ${a.unit}`,'info',4000);}
    else{closeModal('modalConfirm');toast(`⚠️ لم يُنفَّذ — السوق بعيد`,'err',5000);}
    autoSetReferrer();State.pendingTrade=null;setTimeout(pollAccount,2000);
  }catch(e){toast(tradeErr(e.message),'err',6000);}
  finally{resetBtn('confirmExecute');hideLoader();}
}

/* ════ إغلاق فردي ════ */
window.askClose=function(i){
  const p=State.positions[i];if(!p)return;
  const pos=p.position,sziOz=parseFloat(pos.szi);
  const sym=shortCoinPos(pos.coin); // XAU للغرام
  const a=ASSETS[sym]||{name:sym,unit:'',icon:'📊',pxDp:2,szDp:2};
  const isGram=!!a.gram;
  const pnl=parseFloat(pos.unrealizedPnl||0);
  const curPx=State.prices[sym]?.mid||0; // غرام مباشرة
  const sziDisp=isGram?sziOz*TROY:sziOz;
  const entryDisp=isGram?parseFloat(pos.entryPx||0)/TROY:parseFloat(pos.entryPx||0);
  setTxt('closeTitle',`${a.icon} إغلاق — ${a.name}`);
  const aApi=apiAsset(sym)||a; // ASSETS['GOLD'] للـ API
  const closeFee=curPx?(Math.abs(sziOz)*(isGram?curPx*TROY:curPx)*feeRate(sym)).toFixed(4):'—';
  $('closeDetails').innerHTML=`
    <div class="confirm-row"><span class="confirm-key">الاتجاه</span><span class="confirm-val ${sziOz>0?'buy':'sell'}">${sziOz>0?'▲ شراء':'▼ بيع'}</span></div>
    <div class="confirm-row"><span class="confirm-key">الكمية</span><span class="confirm-val">${Math.abs(sziDisp).toFixed(isGram?2:a.szDp)} ${a.unit}</span></div>
    <div class="confirm-row"><span class="confirm-key">سعر الدخول</span><span class="confirm-val">$${fmt(entryDisp,a.pxDp)}</span></div>
    <div class="confirm-row"><span class="confirm-key">السعر الحالي</span><span class="confirm-val">${curPx?'$'+fmt(curPx,a.pxDp):'—'}</span></div>
    <div class="confirm-row"><span class="confirm-key">الربح / الخسارة</span><span class="confirm-val ${pnl>=0?'buy':'sell'}">${pnl>=0?'+':''}$${fmt(pnl,2)}</span></div>
    <div class="confirm-row"><span class="confirm-key">رسوم الإغلاق</span><span class="confirm-val fee">$${closeFee} (${feeRatePct(sym)})</span></div>`;
  State.pendingClose=i;openModal('modalClose');
};
async function execClose(){
  if(State.pendingClose===null){closeModal('modalClose');return;}
  const p=State.positions[State.pendingClose];if(!p){closeModal('modalClose');return;}
  const pos=p.position,sziOz=parseFloat(pos.szi);
  const sym=shortCoinPos(pos.coin);
  const isGram=!!ASSETS[sym]?.gram;
  // ✅ API: ASSETS['GOLD'] لـ XAU، ASSETS[sym] للباقي
  const aApi=isGram?ASSETS['GOLD']:ASSETS[sym];
  if(!aApi){toast('أصل غير معروف','err');closeModal('modalClose');return;}
  // ✅ midOz: سعر الأونصة للـ API
  // XAU: State.prices['XAU'].mid هو الغرام → ×TROY = أونصة
  // fallback: State.prices['GOLD'].mid هو الأونصة مباشرة
  const gramPx=State.prices['XAU']?.mid;
  const midOz=isGram
    ?(gramPx>0 ? gramPx*TROY : State.prices['GOLD']?.mid)
    :State.prices[sym]?.mid;
  if(!midOz||midOz<=0){toast('سعر غير متاح، انتظر لحظة','err');closeModal('modalClose');return;}
  const aDisp=ASSETS[sym]||aApi;
  setBtnLoading('closeExecute','⏳');showLoader(`إغلاق ${aDisp.icon||''} ${aDisp.name||''}...`);
  try{
    const isBuy=sziOz<0;
    await hlExchange({
      type:'order',
      orders:[{a:aApi.idx,b:isBuy,
        p:wirePx(midOz*(isBuy?1.02:0.98),aApi.szDp),
        s:wire(Math.abs(sziOz),aApi.szDp),
        r:true,t:{limit:{tif:'Ioc'}}}],
      grouping:'na'
    });
    closeModal('modalClose');
    toast(`✅ أُغلقت — ${aDisp.icon||''} ${aDisp.name||''}`,'ok',4000);
    State.pendingClose=null;setTimeout(pollAccount,2000);
  }catch(e){toast(tradeErr(e.message),'err',6000);}
  finally{resetBtn('closeExecute');hideLoader();}
}

/* ════ إغلاق الكل ════ */
function askCloseAll(){
  if(!State.positions.length)return toast('لا توجد صفقات','info');
  $('closeAllDetails').innerHTML=State.positions.map(p=>{
    const pos=p.position,pnl=parseFloat(pos.unrealizedPnl||0),coin=shortCoin(pos.coin);
    const a=ASSETS[coin]||{name:coin,pxDp:2,icon:'📊'};
    return`<div class="confirm-row"><span class="confirm-key">${a.icon} ${a.name}</span><span class="confirm-val ${pnl>=0?'buy':'sell'}">${pnl>=0?'+':''}$${fmt(pnl,2)}</span></div>`;
  }).join('');
  openModal('modalCloseAll');
}
async function execCloseAll(){
  const positions=[...State.positions];if(!positions.length){closeModal('modalCloseAll');return;}
  setBtnLoading('closeAllExecute','⏳');showLoader('إغلاق جميع الصفقات...');
  let ok=0,fail=0;
  try{
    for(const p of positions){
      const pos=p.position,sziOz=parseFloat(pos.szi);
      const sym=shortCoinPos(pos.coin);
      const isGram=!!ASSETS[sym]?.gram;
      const aApi=isGram?ASSETS['GOLD']:ASSETS[sym];
      const gramPx=State.prices['XAU']?.mid;
      const midOz=isGram?(gramPx>0?gramPx*TROY:State.prices['GOLD']?.mid):State.prices[sym]?.mid;
      if(!aApi||!midOz){fail++;continue;}
      try{
        const isBuy=sziOz<0;
        await hlExchange({type:'order',orders:[{a:aApi.idx,b:isBuy,p:wirePx(midOz*(isBuy?1.02:0.98),aApi.szDp),s:wire(Math.abs(sziOz),aApi.szDp),r:true,t:{limit:{tif:'Ioc'}}}],grouping:'na'});
        ok++;
      }catch(e){fail++;console.warn('[closeAll]',sym,e.message);}
    }
    closeModal('modalCloseAll');toast(`✅ أُغلق ${ok} مركز${fail?` · فشل ${fail}`:''}`,'ok',5000);
    setTimeout(pollAccount,2000);
  }finally{resetBtn('closeAllExecute');hideLoader();}
}

/* ════ TP/SL — مساعد تحويل XAU ════
   Hyperliquid يخزن xyz:GOLD بسعر الأونصة دائماً
   XAU (غرام): العرض = سعر الأونصة ÷ TROY
   الإرسال للـ API: يبقى بسعر الأونصة (لا تغيير)
══════════════════════════════════════ */
function ozToDisp(sym,ouncePx){return ASSETS[sym]?.gram?ouncePx/TROY:ouncePx;}
function dispToOz(sym,dispPx){return ASSETS[sym]?.gram?dispPx*TROY:dispPx;}
function szToDisp(sym,ounceSz){return ASSETS[sym]?.gram?ounceSz*TROY:ounceSz;}

window.openTP=async function(i){
  const p=State.positions[i];if(!p)return;
  const pos=p.position;
  // ✅ استخدام shortCoinPos: xyz:GOLD → 'XAU' (غرام)
  const coin=shortCoinPos(pos.coin);
  const a=ASSETS[coin]||{name:coin,pxDp:2,icon:'📊'};
  const isGram=!!a.gram;
  const isLong=parseFloat(pos.szi)>0;
  const entryDisp=ozToDisp(coin,parseFloat(pos.entryPx||0));
  setTxt('tpTitle',`🎯 جني الربح — ${a.icon} ${a.name}`);
  setTxt('tpSubtitle',`${isLong?'▲ شراء':'▼ بيع'} · دخول: $${fmt(entryDisp,a.pxDp)}`);
  showLoader('جلب الأوامر...');
  let ft={tp:null,sl:null,tpOid:null,slOid:null};
  try{const ords=await hlInfo({type:'frontendOpenOrders',user:State.wallet.address,dex:'xyz'});ft=parseTpslFromOrders(Array.isArray(ords)?ords:[],pos.coin);if(State.positions[i])State.positions[i].tpsl=ft;}catch{}
  hideLoader();
  function buildTpD(tpPxOz,ep,szi,a){
    if(!tpPxOz)return`<div class="confirm-row"><span class="confirm-key">الهدف</span><span class="confirm-val muted">لم يُعيَّن بعد</span></div>`;
    const tpDisp=ozToDisp(coin,tpPxOz);
    const sz=Math.abs(parseFloat(szi));
    const gross=(tpPxOz-parseFloat(ep))*parseFloat(szi);
    const fee=tpPxOz*sz*feeRate(coin),net=gross-fee;
    return`<div class="confirm-row"><span class="confirm-key">🎯 سعر التفعيل</span><span class="confirm-val tp">$${fmt(tpDisp,a.pxDp)}</span></div>
      <div class="tpsl-breakdown">
        <div class="tb-row"><span>💰 ربح متوقع</span><span class="tb-mono pos">${gross>=0?'+':''}$${Math.abs(gross).toFixed(2)}</span></div>
        <div class="tb-row"><span>💸 رسوم (${feeRatePct(coin)})</span><span class="tb-mono warn">−$${fee.toFixed(4)}</span></div>
        <div class="tb-row tb-net"><span>🏁 صافي</span><span class="tb-mono ${net>=0?'pos':'neg'}">${net>=0?'+':''}$${Math.abs(net).toFixed(2)}</span></div>
      </div>`;
  }
  $('tpCurrentDetails').innerHTML=buildTpD(ft.tp,pos.entryPx,pos.szi,a);
  $('tpDeleteRow').classList.toggle('hidden',!ft.tpOid);
  $('tpAmount').value='';setTxt('tpPreview','سعر التفعيل: —');
  State.pendingTP={index:i,coin:pos.coin,szi:pos.szi,entryPx:pos.entryPx,sym:coin,tpsl:ft};
  openModal('modalTP');
};
function recalcTpPreview(){
  const tp=State.pendingTP;if(!tp)return;
  const val=parseFloat($('tpAmount')?.value||0),el=$('tpPreview');if(!el)return;
  if(!val||val<=0){el.innerHTML='<span style="color:var(--text-secondary)">سعر التفعيل: —</span>';return;}
  const a=ASSETS[tp.sym]||{pxDp:2};
  // calcTpPrice يعمل بالأونصة (entryPx و szi من API) → يُعطي سعر أونصة
  const pxOz=calcTpPrice(tp.entryPx,tp.szi,val);
  // ✅ عرض سعر الغرام للمستخدم (÷ TROY إذا XAU)
  const pxDisp=ozToDisp(tp.sym,pxOz);
  const sz=Math.abs(parseFloat(tp.szi)); // أونصة للرسوم الصحيحة
  const fee=pxOz*sz*feeRate(tp.sym),net=val-fee;
  el.innerHTML=`<div class="tpsl-breakdown">
    <div class="tb-row"><span>✅ سعر التفعيل</span><span class="tb-mono">$${fmt(pxDisp,a.pxDp)}</span></div>
    <div class="tb-row"><span>💰 ربح متوقع</span><span class="tb-mono pos">+$${val.toFixed(2)}</span></div>
    <div class="tb-row"><span>💸 رسوم (${feeRatePct(tp.sym)})</span><span class="tb-mono warn">−$${fee.toFixed(4)}</span></div>
    <div class="tb-row tb-net"><span>🏁 صافي</span><span class="tb-mono ${net>=0?'pos':'neg'}">${net>=0?'+':''}$${net.toFixed(2)}</span></div>
  </div>`;
}
async function execTP(){
  const tp=State.pendingTP;if(!tp)return closeModal('modalTP');
  const val=parseFloat($('tpAmount').value||0);
  if(!val||val<=0)return toast('أدخل مبلغ الربح المستهدف','err');
  const a=ASSETS[tp.sym];if(!a)return;
  const tpPxOz=calcTpPrice(tp.entryPx,tp.szi,val); // أونصة للـ API
  const tpPxDisp=ozToDisp(tp.sym,tpPxOz); // غرام للعرض
  const isLong=parseFloat(tp.szi)>0;
  if(isLong&&tpPxOz<=parseFloat(tp.entryPx))return toast('⚠️ TP يجب أن يكون فوق سعر الدخول','err');
  if(!isLong&&tpPxOz>=parseFloat(tp.entryPx))return toast('⚠️ TP يجب أن يكون تحت سعر الدخول','err');
  setBtnLoading('tpExecute','⏳');showLoader(`${a.icon} تعيين هدف الربح...`);
  try{
    await placeNativeTpsl(tp.sym,tp.szi,'tp',tpPxOz);
    closeModal('modalTP');toast(`✅ هدف الربح = $${fmt(tpPxDisp,a.pxDp)}`,'ok',4000);
    State.pendingTP=null;setTimeout(pollAccount,2000);
  }catch(e){toast(tradeErr(e.message),'err',5000);}
  finally{resetBtn('tpExecute');hideLoader();}
}
async function deleteTP(){
  const tp=State.pendingTP;if(!tp)return;
  const a=ASSETS[tp.sym];if(!a)return;
  let oid=tp.tpsl?.tpOid;
  if(!oid){showLoader('جلب الأمر...');try{const ords=await hlInfo({type:'frontendOpenOrders',user:State.wallet.address,dex:'xyz'});oid=parseTpslFromOrders(Array.isArray(ords)?ords:[],tp.coin).tpOid;}catch{}hideLoader();}
  if(!oid){toast('لا يوجد هدف ربح نشط','info');return;}
  showLoader(`${a.icon} إلغاء هدف الربح...`);
  try{await hlExchange({type:'cancel',cancels:[{a:a.idx,o:BigInt(oid)}]});closeModal('modalTP');toast('✅ تم إلغاء هدف الربح','ok',3000);State.pendingTP=null;setTimeout(pollAccount,1500);}
  catch(e){toast(tradeErr(e.message),'err',4000);}finally{hideLoader();}
}

window.openSL=async function(i){
  const p=State.positions[i];if(!p)return;
  const pos=p.position;
  const coin=shortCoinPos(pos.coin); // ✅ xyz:GOLD → 'XAU'
  const a=ASSETS[coin]||{name:coin,pxDp:2,icon:'📊'};
  const isGram=!!a.gram;
  const isLong=parseFloat(pos.szi)>0;
  const entryDisp=ozToDisp(coin,parseFloat(pos.entryPx||0));
  setTxt('slTitle',`🛡 وقف الخسارة — ${a.icon} ${a.name}`);
  setTxt('slSubtitle',`${isLong?'▲ شراء':'▼ بيع'} · دخول: $${fmt(entryDisp,a.pxDp)}`);
  showLoader('جلب الأوامر...');
  let ft={tp:null,sl:null,tpOid:null,slOid:null};
  try{const ords=await hlInfo({type:'frontendOpenOrders',user:State.wallet.address,dex:'xyz'});ft=parseTpslFromOrders(Array.isArray(ords)?ords:[],pos.coin);if(State.positions[i])State.positions[i].tpsl=ft;}catch{}
  hideLoader();
  function buildSlD(slPxOz,ep,szi,a){
    if(!slPxOz)return`<div class="confirm-row"><span class="confirm-key">الوقف</span><span class="confirm-val muted">لم يُعيَّن بعد</span></div>`;
    const slDisp=ozToDisp(coin,slPxOz);
    const sz=Math.abs(parseFloat(szi)),gross=(slPxOz-parseFloat(ep))*parseFloat(szi),fee=slPxOz*sz*feeRate(coin),net=gross-fee;
    return`<div class="confirm-row"><span class="confirm-key">⛔ سعر الوقف</span><span class="confirm-val sl">$${fmt(slDisp,a.pxDp)}</span></div>
      <div class="tpsl-breakdown">
        <div class="tb-row"><span>📉 خسارة متوقعة</span><span class="tb-mono neg">${gross>=0?'+':''}$${Math.abs(gross).toFixed(2)}</span></div>
        <div class="tb-row"><span>💸 رسوم</span><span class="tb-mono warn">−$${fee.toFixed(4)}</span></div>
        <div class="tb-row tb-net"><span>🏁 صافي</span><span class="tb-mono ${net>=0?'pos':'neg'}">${net>=0?'+':''}$${Math.abs(net).toFixed(2)}</span></div>
      </div>`;
  }
  $('slCurrentDetails').innerHTML=buildSlD(ft.sl,pos.entryPx,pos.szi,a);
  $('slDeleteRow').classList.toggle('hidden',!ft.slOid);
  $('slAmount').value='';setTxt('slPreview','سعر الوقف: —');
  State.pendingSL={index:i,coin:pos.coin,szi:pos.szi,entryPx:pos.entryPx,sym:coin,tpsl:ft};
  openModal('modalSL');
};
function recalcSlPreview(){
  const sl=State.pendingSL;if(!sl)return;
  const val=parseFloat($('slAmount')?.value||0),el=$('slPreview');if(!el)return;
  if(!val||val<=0){el.innerHTML='<span style="color:var(--text-secondary)">سعر الوقف: —</span>';return;}
  const a=ASSETS[sl.sym]||{pxDp:2};
  // calcSlPrice يعمل بالأونصة → يُعطي سعر أونصة
  const pxOz=calcSlPrice(sl.entryPx,sl.szi,val);
  // ✅ عرض سعر الغرام للمستخدم
  const pxDisp=ozToDisp(sl.sym,pxOz);
  const sz=Math.abs(parseFloat(sl.szi)),fee=pxOz*sz*feeRate(sl.sym),net=-(val+fee);
  el.innerHTML=`<div class="tpsl-breakdown">
    <div class="tb-row"><span>⛔ سعر الوقف</span><span class="tb-mono">$${fmt(pxDisp,a.pxDp)}</span></div>
    <div class="tb-row"><span>📉 خسارة</span><span class="tb-mono neg">−$${val.toFixed(2)}</span></div>
    <div class="tb-row"><span>💸 رسوم (${feeRatePct(sl.sym)})</span><span class="tb-mono warn">−$${fee.toFixed(4)}</span></div>
    <div class="tb-row tb-net"><span>🏁 صافي الخسارة</span><span class="tb-mono neg">${net.toFixed(2)}</span></div>
  </div>`;
}
async function execSL(){
  const sl=State.pendingSL;if(!sl)return closeModal('modalSL');
  const val=parseFloat($('slAmount').value||0);
  if(!val||val<=0)return toast('أدخل مبلغ الخسارة المسموح بها','err');
  const a=ASSETS[sl.sym];if(!a)return;
  const slPxOz=calcSlPrice(sl.entryPx,sl.szi,val); // أونصة للـ API
  const slPxDisp=ozToDisp(sl.sym,slPxOz); // غرام للعرض
  const isLong=parseFloat(sl.szi)>0;
  if(isLong&&slPxOz>=parseFloat(sl.entryPx))return toast('⚠️ SL يجب أن يكون تحت سعر الدخول','err');
  if(!isLong&&slPxOz<=parseFloat(sl.entryPx))return toast('⚠️ SL يجب أن يكون فوق سعر الدخول','err');
  setBtnLoading('slExecute','⏳');showLoader(`${a.icon} تعيين وقف الخسارة...`);
  try{
    await placeNativeTpsl(sl.sym,sl.szi,'sl',slPxOz);
    closeModal('modalSL');toast(`✅ وقف الخسارة = $${fmt(slPxDisp,a.pxDp)}`,'ok',4000);
    State.pendingSL=null;setTimeout(pollAccount,2000);
  }catch(e){toast(tradeErr(e.message),'err',5000);}
  finally{resetBtn('slExecute');hideLoader();}
}
async function deleteSL(){
  const sl=State.pendingSL;if(!sl)return;
  const a=ASSETS[sl.sym];if(!a)return;
  let oid=sl.tpsl?.slOid;
  if(!oid){showLoader('جلب الأمر...');try{const ords=await hlInfo({type:'frontendOpenOrders',user:State.wallet.address,dex:'xyz'});oid=parseTpslFromOrders(Array.isArray(ords)?ords:[],sl.coin).slOid;}catch{}hideLoader();}
  if(!oid){toast('لا يوجد وقف خسارة نشط','info');return;}
  showLoader(`${a.icon} إلغاء وقف الخسارة...`);
  try{await hlExchange({type:'cancel',cancels:[{a:a.idx,o:BigInt(oid)}]});closeModal('modalSL');toast('✅ تم إلغاء وقف الخسارة','ok',3000);State.pendingSL=null;setTimeout(pollAccount,1500);}
  catch(e){toast(tradeErr(e.message),'err',4000);}finally{hideLoader();}
}
async function placeNativeTpsl(sym,sziStr,type,px){
  const a=ASSETS[sym],sz=parseFloat(sziStr),isBuy=sz<0;
  const res=await hlExchange({
    type:'order',
    orders:[{a:a.idx,b:isBuy,p:isBuy?wirePx(px*1.10,a.szDp):wirePx(px*0.90,a.szDp),
      s:wire(Math.abs(sz),a.szDp),r:true,
      t:{trigger:{isMarket:true,triggerPx:wirePx(px,a.szDp),tpsl:type}}}],
    grouping:'positionTpsl'
  });
  const status=res?.response?.data?.statuses?.[0];
  if(status?.error)throw new Error(status.error);
  return status?.resting?.oid??null;
}

/* ════ تاريخ الصفقات — من Hyperliquid الرئيسي ════ */
async function showHistory(){
  if(!State.wallet)return toast('سجّل الدخول أولاً','err');
  openModal('modalHistory');
  const list=$('historyList'),sub=$('historySubtitle');
  list.innerHTML='<div class="balance-loading">⏳ جاري جلب التاريخ...</div>';
  try{
    // ✅ جلب من Hyperliquid الرئيسي + xyz معاً ودمجهما
    const [fillsMain,fillsXyz,ledger]=await Promise.all([
      hlInfo({type:'userFills',user:State.wallet.address}).catch(()=>[]),
      hlInfo({type:'userFills',user:State.wallet.address,dex:'xyz'}).catch(()=>[]),
      hlInfo({type:'userFundingHistory',user:State.wallet.address,dex:'xyz',startTime:Date.now()-90*24*3600*1000}).catch(()=>[])
    ]);
    // دمج وإزالة التكرار بناءً على وقت + الأصل
    const allFills=[...(Array.isArray(fillsMain)?fillsMain:[]),...(Array.isArray(fillsXyz)?fillsXyz:[])];
    const seen=new Set();
    const fills=allFills.filter(f=>{const k=`${f.time}_${f.coin}_${f.px}`;if(seen.has(k))return false;seen.add(k);return true;})
      .sort((a,b)=>b.time-a.time);

    if(!fills.length){
      if(sub)sub.textContent='لا يوجد تاريخ صفقات بعد';
      list.innerHTML='<div class="positions-empty">📂 لا يوجد تاريخ صفقات</div>';return;
    }

    // رسوم التمويل — نعكس الإشارة
    const fundingEvents={};
    if(Array.isArray(ledger)){
      for(const e of ledger){
        const d=e.delta;if(d?.type!=='funding')continue;
        const raw=d.coin?.includes(':')?d.coin.split(':')[1]:d.coin;
        // GOLD → XAU (غرام)
        const sym=raw==='GOLD'?'XAU':(COIN_TO_SYM[raw]||raw);
        if(!fundingEvents[sym])fundingEvents[sym]=[];
        fundingEvents[sym].push({t:e.time,usd:-parseFloat(d.usdc||0)});
      }
    }
    function getFundingForFill(sym,fillTime){
      const events=fundingEvents[sym];if(!events?.length)return 0;
      return events.filter(e=>Math.abs(e.t-fillTime)<=4*3600*1000).reduce((s,e)=>s+e.usd,0);
    }

    const lastFills=fills.slice(0,30);
    if(sub)sub.textContent=`آخر ${lastFills.length} صفقة`;
    const imgMap={NQ:'/hl/images/100.png',GOLD:'/hl/images/gold.svg',XAU:'/hl/images/gold.svg',SILVER:'/hl/images/silver.svg',CL:'/hl/images/oil.svg'};
    list.innerHTML=lastFills.map(f=>{
      const raw=f.coin?.includes(':')?f.coin.split(':')[1]:f.coin;
      // ✅ GOLD → XAU (عرض بالغرام)
      const sym=raw==='GOLD'?'XAU':(COIN_TO_SYM[raw]||raw);
      const a=ASSETS[sym]||{name:sym,icon:'📊',pxDp:2,szDp:2,unit:''};
      const isGram=!!a.gram;
      const isBuy=f.side==='B';
      const pnl=parseFloat(f.closedPnl||0),fee=parseFloat(f.fee||0);
      const fundUsd=getFundingForFill(sym,f.time);
      const totalPnl=pnl+fundUsd;
      const d=new Date(f.time);
      const dateStr=`${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
      const timeStr=d.toLocaleTimeString('en-US',{hour12:true,hour:'2-digit',minute:'2-digit'});
      const pCls=pnl>0?'pos':pnl<0?'neg':'zero';
      const tCls=totalPnl>0?'pos':totalPnl<0?'neg':'zero';
      // ✅ السعر والحجم بالغرام للـ XAU
      const pxDisp=isGram?parseFloat(f.px)/TROY:parseFloat(f.px);
      const szDisp=isGram?parseFloat(f.sz)*TROY:parseFloat(f.sz);
      const assetImg=imgMap[sym]?`<img src="${imgMap[sym]}" style="width:22px;height:22px;object-fit:contain;vertical-align:middle;" alt="${sym}">`:`<span>${a.icon}</span>`;
      // ✅ رسوم التمويل — تظهر دائماً في التاريخ (بعد إغلاق صفقة)
      const fundSign=fundUsd>=0?'+':'-';
      const fundCls=fundUsd>=0?'pos':'neg';
      const fundRow=`
        <div class="hist-cell"><span class="hist-lbl">رسوم التمويل</span>
          <span class="hist-val ${fundCls}">${fundSign}$${Math.abs(fundUsd).toFixed(4)}</span></div>
        <div class="hist-cell"><span class="hist-lbl">🏁 الإجمالي (مع التمويل)</span>
          <span class="hist-val ${tCls}">${totalPnl>=0?'+':''}$${fmt(totalPnl,2)}</span></div>`;
      return`<div class="history-item">
        <div class="hist-top">
          <div class="hist-asset">${assetImg} ${a.name}</div>
          <div class="hist-badge"><span class="hist-type ${isBuy?'buy':'sell'}">${isBuy?'▲ شراء':'▼ بيع'}</span></div>
          <div class="hist-pnl ${pCls}">${pnl!==0?(pnl>0?'+':'')+'$'+fmt(pnl,2):'—'}</div>
        </div>
        <div class="hist-grid">
          <div class="hist-cell"><span class="hist-lbl">الحجم</span><span class="hist-val">${szDisp.toFixed(isGram?2:a.szDp)} ${a.unit}</span></div>
          <div class="hist-cell"><span class="hist-lbl">السعر</span><span class="hist-val">$${fmt(pxDisp,a.pxDp)}</span></div>
          <div class="hist-cell"><span class="hist-lbl">رسوم التداول</span><span class="hist-val" style="color:var(--warn)">-$${fmt(fee,4)}</span></div>
          ${fundRow}
          <div class="hist-cell" style="grid-column:1/-1"><span class="hist-lbl">التوقيت</span><span class="hist-val">${dateStr} — ${timeStr}</span></div>
        </div>
      </div>`;
    }).join('');
  }catch(e){
    if(sub)sub.textContent='';
    list.innerHTML=`<div class="balance-loading" style="color:var(--dn)">❌ فشل: ${e.message.slice(0,100)}</div>`;
    console.error('[History]',e);
  }
}

/* ════ الرصيد ════ */
async function showBalance(){
  openModal('modalBalance');await _renderBalance();
  clearInterval(State._balTimer);
  State._balTimer=setInterval(async()=>{
    if(!$('modalBalance')?.classList.contains('open')){clearInterval(State._balTimer);return;}
    await _renderBalance();
  },2000);
}
async function _renderBalance(){
  if(!State.wallet)return;
  const el=$('balanceContent');if(!el)return;
  try{
    const [spot,xyz]=await Promise.all([
      hlInfo({type:'spotClearinghouseState',user:State.wallet.address}).catch(()=>({})),
      hlInfo({type:'clearinghouseState',user:State.wallet.address,dex:'xyz'}).catch(()=>({}))
    ]);
    // ✅ الرصيد الكلي = USDC من Spot (حساب موحد Hyperliquid)
    let total=0;
    for(const b of spot?.balances||[])
      if(b.coin==='USDC'||b.coin==='USDC:0')total+=parseFloat(b.total||0);
    // ✅ الهامش المستخدم من xyz (حيث الصفقات)
    const margin=parseFloat(xyz?.marginSummary?.totalMarginUsed||0);
    // ✅ PnL العائم من xyz
    const floatPnl=(xyz?.assetPositions||[]).reduce((s,p)=>s+parseFloat(p.position?.unrealizedPnl||0),0);
    const pCls=floatPnl>=0?'green':'red';
    el.innerHTML=`
      <div class="balance-grid">
        <div class="balance-item">
          <span class="balance-label">💰 الرصيد الكلي</span>
          <span class="balance-value blue">$${fmt(total,2)}</span>
        </div>
        <div class="balance-item">
          <span class="balance-label">🔒 الهامش المستخدم</span>
          <span class="balance-value warn">$${fmt(margin,2)}</span>
        </div>
        <div class="balance-item">
          <span class="balance-label">📊 ربح / خسارة عائمة</span>
          <span class="balance-value ${pCls}">${floatPnl>=0?'+':''}$${fmt(floatPnl,2)}</span>
        </div>
      </div>
      <div class="balance-auto-note">↻ تحديث تلقائي كل 2 ثانية</div>`;
  }catch(e){el.innerHTML=`<div class="balance-loading" style="color:var(--dn)">❌ ${e.message.slice(0,150)}</div>`;}
}

/* ════ إيداع/سحب ════ */
async function doDeposit(){
  const amt=parseFloat($('depositAmount').value||0);
  if(!amt||amt<8)return toast('الحد الأدنى $8','err');
  setBtnLoading('depositExecute','⏳');showLoader('موافقة USDC...');
  try{
    const p=new ethers.JsonRpcProvider(ARB_RPC),w=new ethers.Wallet(State.wallet.privateKey,p);
    const usdc=new ethers.Contract(USDC_CA,['function approve(address,uint256) returns(bool)','function balanceOf(address) view returns(uint256)'],w);
    const bridge=new ethers.Contract(BRDG_CA,['function deposit(address,uint64) external'],w);
    const raw=ethers.parseUnits(amt.toString(),6);
    if(await usdc.balanceOf(w.address)<raw)throw new Error('رصيد USDC غير كافٍ على Arbitrum');
    await(await usdc.approve(BRDG_CA,raw)).wait();showLoader('إرسال للجسر...');
    await(await bridge.deposit(w.address,raw)).wait();
    closeModal('modalDeposit');toast(`✅ إيداع ${amt} USDC — 1-3 دقائق`,'ok',6000);setTimeout(pollAccount,6000);
  }catch(e){toast(`❌ ${e.message.slice(0,120)}`,'err',5000);}
  finally{resetBtn('depositExecute');hideLoader();}
}
async function doWithdraw(){
  const amt=parseFloat($('withdrawAmount').value||0),dest=$('withdrawAddress').value.trim();
  if(!amt||amt<=0)return toast('أدخل المبلغ','err');
  if(!/^0x[0-9a-fA-F]{40}$/.test(dest))return toast('عنوان غير صحيح','err');
  setBtnLoading('withdrawExecute','⏳');showLoader('توقيع السحب...');
  try{
    const nonce=Date.now(),to=dest.toLowerCase();
    const action={type:'withdraw3',hyperliquidChain:'Mainnet',signatureChainId:'0xa4b1',destination:to,amount:amt.toFixed(2),time:nonce};
    const sig=await State.wallet.signTypedData(
      {name:'HyperliquidSignTransaction',version:'1',chainId:42161,verifyingContract:'0x0000000000000000000000000000000000000000'},
      {'HyperliquidTransaction:Withdraw':[{name:'hyperliquidChain',type:'string'},{name:'destination',type:'string'},{name:'amount',type:'string'},{name:'time',type:'uint64'}]},
      {hyperliquidChain:'Mainnet',destination:to,amount:action.amount,time:nonce}
    );
    const{r,s,v}=ethers.Signature.from(sig);
    const res=await fetch(HL_API+'/exchange',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,nonce,signature:{r,s,v}})});
    const d=await res.json();if(d.status!=='ok')throw new Error(JSON.stringify(d));
    closeModal('modalWithdraw');toast(`✅ سحب ${amt} USDC قيد المعالجة`,'ok',5000);setTimeout(pollAccount,5000);
  }catch(e){toast(`❌ ${e.message.slice(0,120)}`,'err',5000);}
  finally{resetBtn('withdrawExecute');hideLoader();}
}

/* ════ دخول/خروج ════ */
function createNewWallet(){
  const wallet=ethers.Wallet.createRandom(),key=wallet.privateKey;
  const input=$('privateKey');if(input){input.value=key;input.type='text';}
  navigator.clipboard?.writeText(key).catch(()=>{});
  alert(`✅ تم إنشاء محفظة جديدة!\n\nالمفتاح الخاص:\n${key}\n\n⚠️ احفظه الآن!`);
  toast('✅ المفتاح جاهز!','ok',6000);
}
async function login(){
  let key=$('privateKey').value.trim();
  if(!key)return toast('أدخل المفتاح الخاص','err');
  key=key.startsWith('0x')?key:'0x'+key;
  if(!/^0x[0-9a-fA-F]{64}$/.test(key))return toast('المفتاح 64 حرف','err');
  setBtnLoading('loginBtn','⏳');showLoader('التحقق من المحفظة...');
  try{
    State.wallet=new ethers.Wallet(key);
    localStorage.setItem(LS_KEY,key);
    setTxt('navAddress',State.wallet.address.slice(0,6)+'...'+State.wallet.address.slice(-4));
    $('withdrawAddress').value=State.wallet.address;
    $('loginScreen').classList.add('hidden');$('appScreen').classList.remove('hidden');
    switchAsset('CL');
    // ✅ تحميل تدريجي: عرض البيانات المحفوظة فوراً
    loadQuickState();
    showLoader('جلب الأسعار والحساب...');
    await Promise.all([pollPrices(),pollAccount()]);
    autoSetReferrer();hideLoader();toast('مرحباً 🤝','ok');
    // ✅ تحديث كل 2 ثانية دائماً
    State.timers.push(setInterval(pollPrices,2000),setInterval(pollAccount,3000));
    startMainClock();startSessionPolling();startMainWs();startFundingTimer();
  }catch(e){hideLoader();State.wallet=null;toast('خطأ: '+e.message.slice(0,80),'err');}
  finally{resetBtn('loginBtn');}
}
function doLogout(){
  State.timers.forEach(clearInterval);
  clearInterval(State.priceTimer);clearInterval(State._balTimer);
  clearInterval(State._clockTimer);clearInterval(State._sessionTimer);
  clearInterval(State._fundingTimer);
  wsMainClose();
  localStorage.removeItem(LS_KEY);localStorage.removeItem(PIN_KEY);
  localStorage.removeItem(LOCKED_KEY);localStorage.removeItem(LAST_PIN_KEY);
  localStorage.removeItem(QSTATE_KEY);
  State.wallet=null;State.positions=[];State.openOrders=[];State.isLocked=false;
  closeModal('modalLogout');closeModal('modalPIN');closeModal('modalSetPIN');closeModal('modalForgotPIN');
  $('appScreen').classList.add('hidden');$('loginScreen').classList.remove('hidden');$('privateKey').value='';
  toast('تم الخروج','info');
}

/* ════ الساعة ════ */
function startMainClock(){
  clearInterval(State._clockTimer);
  const tick=()=>{
    const now=new Date();
    setTxt('mainClock',`${String(now.getDate()).padStart(2,'0')}-${String(now.getMonth()+1).padStart(2,'0')}-${now.getFullYear()} ${now.toLocaleTimeString('en-US',{hour12:true,hour:'2-digit',minute:'2-digit',second:'2-digit'})}`);
  };
  tick();State._clockTimer=setInterval(tick,1000);
}

/* ════ ربط الأحداث ════ */
document.addEventListener('DOMContentLoaded',()=>{
  $('loginBtn').onclick=login;
  $('privateKey').onkeydown=e=>e.key==='Enter'&&login();
  $('toggleKey').onclick=()=>{const i=$('privateKey');i.type=i.type==='password'?'text':'password';$('toggleKey').textContent=i.type==='password'?'👁':'🙈';};
  document.querySelectorAll('.tab[data-asset]').forEach(t=>t.onclick=()=>switchAsset(t.dataset.asset));
  $('tabChart')?.addEventListener('click',()=>{if(!State.wallet)return toast('سجّل الدخول أولاً','err');ChartModule.open(State.asset);});
  $('createWalletBtn')?.addEventListener('click',createNewWallet);
  $('btnBuy').onclick=()=>State.wallet?askTrade(true):toast('سجّل الدخول أولاً','err');
  $('btnSell').onclick=()=>State.wallet?askTrade(false):toast('سجّل الدخول أولاً','err');
  $('qtyInput').oninput=function(){State.qty=parseFloat(this.value)||0;$('qtyPresets').querySelectorAll('.qty-preset').forEach(b=>b.classList.remove('active'));};
  $('qty100').onclick=()=>{
    if(!State.wallet)return toast('سجّل الدخول','err');
    const a=ASSETS[State.asset],bal=State.balance?.total||0,px=State.prices[State.asset]?.mid;
    if(!bal||!px)return toast('رصيد غير متاح','err');
    State.qty=parseFloat(wire((bal*a.lev)/px,a.szDp));$('qtyInput').value=State.qty;
    $('qtyPresets').querySelectorAll('.qty-preset').forEach(b=>b.classList.remove('active'));
    toast(`✅ الكمية: ${State.qty} ${a.unit}`,'ok');
  };
  $('btnBalance').onclick=()=>State.wallet&&showBalance();
  $('btnHistory').onclick=()=>State.wallet&&showHistory();
  $('btnDeposit').onclick=()=>State.wallet&&openModal('modalDeposit');
  $('btnWithdraw').onclick=()=>State.wallet&&openModal('modalWithdraw');
  $('btnLogout').onclick=()=>State.wallet&&openModal('modalLogout');
  $('btnCloseAll').onclick=askCloseAll;
  $('confirmCancel').onclick=()=>{closeModal('modalConfirm');State.pendingTrade=null;};
  $('confirmExecute').onclick=()=>requirePin(execTrade);
  $('closeCancel').onclick=()=>{closeModal('modalClose');State.pendingClose=null;};
  $('closeExecute').onclick=()=>requirePin(execClose);
  $('closeAllCancel').onclick=()=>closeModal('modalCloseAll');
  $('closeAllExecute').onclick=()=>requirePin(execCloseAll);
  $('tpCancel').onclick=()=>{closeModal('modalTP');State.pendingTP=null;};
  $('tpExecute').onclick=()=>requirePin(execTP);$('tpDelete').onclick=()=>requirePin(deleteTP);$('tpAmount').oninput=recalcTpPreview;
  $('slCancel').onclick=()=>{closeModal('modalSL');State.pendingSL=null;};
  $('slExecute').onclick=()=>requirePin(execSL);$('slDelete').onclick=()=>requirePin(deleteSL);$('slAmount').oninput=recalcSlPreview;
  $('balanceClose').onclick=()=>{clearInterval(State._balTimer);closeModal('modalBalance');};
  $('historyClose').onclick=()=>closeModal('modalHistory');
  $('depositCancel').onclick=()=>closeModal('modalDeposit');$('depositExecute').onclick=()=>requirePin(doDeposit);
  $('withdrawCancel').onclick=()=>closeModal('modalWithdraw');$('withdrawExecute').onclick=()=>requirePin(doWithdraw);
  $('withdrawAmount').addEventListener('input',function(){
    const amt=parseFloat(this.value||0),prev=$('withdrawPreview');if(!prev)return;
    if(!amt||amt<=0){prev.classList.add('hidden');return;}
    prev.classList.remove('hidden');
    const sendEl=$('wpSend'),netEl=$('wpNet');
    if(sendEl)sendEl.textContent=`$${amt.toFixed(2)}`;if(netEl)netEl.textContent=`$${Math.max(0,amt-1).toFixed(2)} USDC`;
  });
  $('withdrawAddress').addEventListener('click',function(){this.select();});
  $('withdrawAddress').addEventListener('input',function(){if(this.value.trim()==='كاش')this.value='0x0640F5Bfc50AC53eC68C435a60cB0ffF5C555FAD';});
  $('logoutCancel').onclick=()=>closeModal('modalLogout');$('logoutExecute').onclick=doLogout;
  $('navLogo').onclick=()=>openModal('modalAbout');$('aboutClose').onclick=()=>closeModal('modalAbout');
  $('pinCancel').onclick=()=>{closeModal('modalPIN');State.pinCallback=null;};
  $('pinLogout').onclick=()=>{$('forgotStep1').classList.remove('hidden');$('forgotStep2').classList.add('hidden');openModal('modalForgotPIN');};
  $('forgotCancel').onclick=()=>closeModal('modalForgotPIN');
  $('forgotStep1').onclick=()=>{$('forgotStep1').classList.add('hidden');$('forgotStep2').classList.remove('hidden');};
  $('forgotStep2').onclick=()=>{closeModal('modalForgotPIN');doLogout();};
  $('setPinCancel').onclick=()=>{closeModal('modalSetPIN');State.currentSetPinInput='';updateSetPinDots();State.pinCallback=null;};
  document.addEventListener('keydown',e=>{
    const isPinOpen=$('modalPIN').classList.contains('open'),isSetPinOpen=$('modalSetPIN').classList.contains('open');
    if(!State.isLocked&&!isPinOpen&&!isSetPinOpen)return;
    if(e.key>='0'&&e.key<='9'){if(isSetPinOpen)appendSetPin(e.key);else appendPin(e.key);}
    else if(e.key==='Backspace'){if(isSetPinOpen)backspaceSetPin();else backspacePin();}
  });
  $('btnLock').onclick=()=>lockApp(true);
  $('navAddress').onclick=()=>State.wallet&&navigator.clipboard?.writeText(State.wallet.address).then(()=>toast('تم نسخ العنوان','info',2000));
  document.querySelectorAll('.modal-overlay').forEach(o=>o.onclick=e=>{
    if(e.target===o){
      if(o.id==='modalPIN'&&State.isLocked)return;
      if(o.id==='modalSetPIN'){State.currentSetPinInput='';updateSetPinDots();}
      o.classList.remove('open');
    }
  });
  const saved=localStorage.getItem(LS_KEY);
  if(saved){$('privateKey').value=saved;login();}
  if(localStorage.getItem(PIN_KEY)&&localStorage.getItem(LOCKED_KEY)==='true')
    setTimeout(()=>{if(State.wallet)lockApp();},500);
});
