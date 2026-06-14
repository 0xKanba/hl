'use strict';

const ChartModule = (function () {

  const HL_API = 'https://api.hyperliquid.xyz';
  const HL_WS  = 'wss://api.hyperliquid.xyz/ws';
  const TL     = 31.1035;

  let _widget    = null;
  let _visible   = false;
  let _sym       = 'CL';
  let _res       = '60';
  let _subs      = {};
  let _rtWs      = null;
  let _rtTimer   = null;
  let _rtCoin    = null;
  let _rtIv      = null;
  let _built     = false;
  let _ro        = null;
  let _layoutTmr = null;
  let _readyTmr  = null;

  /* TradingView resolution → Hyperliquid interval */
  const RES = {
    '1':'1m','3':'3m','5':'5m','15':'15m','30':'30m',
    '60':'1h','120':'2h','240':'4h','D':'1d','1D':'1d'
  };

  /* Hyperliquid interval → seconds per bar (used to compute safe ranges) */
  const IV_SEC = {
    '1m':60,'3m':180,'5m':300,'15m':900,'30m':1800,
    '1h':3600,'2h':7200,'4h':14400,'1d':86400
  };

  const _coin  = s => (typeof ASSETS!=='undefined'&&ASSETS[s]?.coin)||('xyz:'+s);
  const _gram  = s => !!(typeof ASSETS!=='undefined'&&ASSETS[s]?.gram);
  const _asset = s => (typeof ASSETS!=='undefined'&&ASSETS[s])||{pxDp:2,szDp:2,name:s,unit:'',icon:'📊',lev:10,presets:[1],idx:0,cross:true};
  const _px    = s => (typeof State!=='undefined'?State.prices[s]?.mid:0)||0;

  /* ── CSS (injected once) ── */
  (function(){
    if(document.getElementById('_cCSS'))return;
    const st=document.createElement('style');st.id='_cCSS';
    st.textContent=`
.chart-screen{position:fixed;inset:0;z-index:50;display:flex;flex-direction:column;background:var(--bg-app,#000);}
.chart-screen.hidden{display:none!important;}
._cn{display:flex;align-items:center;justify-content:space-between;padding:7px 12px;background:var(--bg-card,#0d0d0d);border-bottom:1px solid var(--border,#2a2a2a);flex-shrink:0;gap:8px;direction:rtl;min-height:48px;}
._cnl,._cnr{display:flex;align-items:center;gap:8px;}
._cbk{padding:5px 14px;border-radius:999px;border:1.5px solid rgba(255,140,66,.3);background:rgba(255,140,66,.1);color:var(--hc-ac,#ff8c42);font-size:13px;font-weight:800;font-family:'Cairo',sans-serif;cursor:pointer;-webkit-tap-highlight-color:transparent;}
._cbk:active{opacity:.7;}
._clk{background:var(--bg-elev,#161616);border:1.5px solid var(--border-strong,#3d3d3d);border-radius:12px;color:var(--text-secondary,#a0a0a0);font-size:16px;padding:4px 8px;line-height:1;cursor:pointer;-webkit-tap-highlight-color:transparent;}
._cai{display:flex;align-items:center;gap:6px;}
._cic{font-size:17px;line-height:1;}
._cnm{font-size:14px;font-weight:900;color:var(--text-primary,#f5f5f5);}
._ctb{display:flex;align-items:center;gap:8px;padding:6px 12px;background:var(--bg-card,#0d0d0d);border-bottom:1px solid var(--border,#2a2a2a);flex-shrink:0;direction:rtl;}
._cb{flex:1;min-height:52px;padding:6px;border-radius:14px;border:none;font-family:'Cairo',sans-serif;cursor:pointer;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;-webkit-tap-highlight-color:transparent;transition:transform .11s,filter .11s;}
._cb:active{transform:scale(.93);filter:brightness(.87);}
._buy{background:linear-gradient(150deg,#00e676,#007c3a);box-shadow:0 2px 12px rgba(0,200,80,.28);}
._sel{background:linear-gradient(150deg,#ff3d3d,#a00000);box-shadow:0 2px 12px rgba(220,50,50,.28);}
._cdir{font-size:15px;font-weight:900;line-height:1;}
._cpx{font-family:'IBM Plex Mono',monospace;font-size:10px;opacity:.82;font-weight:700;}
._cmd{flex:1.1;display:flex;flex-direction:column;align-items:center;gap:4px;}
._cql{font-size:9px;color:var(--text-muted,#555);font-weight:700;letter-spacing:.5px;text-transform:uppercase;}
._cqr{display:flex;align-items:center;gap:5px;}
._cqi{width:80px;font-family:'IBM Plex Mono',monospace;font-size:19px;font-weight:800;text-align:center;direction:ltr;background:var(--bg-input,#1e1e1e);border:2px solid var(--border-strong,#3d3d3d);border-radius:10px;padding:5px 4px;color:var(--text-primary,#f5f5f5);outline:none;font-size:max(16px,1em);}
._cqi:focus{border-color:var(--hc-ac,#ff8c42);box-shadow:0 0 0 3px rgba(255,140,66,.18);}
._cqu{font-size:10px;color:var(--text-secondary,#a0a0a0);font-weight:800;white-space:nowrap;}
._ctw{flex:1;min-height:0;position:relative;overflow:hidden;background:#040404;direction:ltr;}
#_tvC{position:absolute;top:0;left:0;overflow:hidden;direction:ltr;}
#_tvC iframe{border:none!important;display:block;direction:ltr;}
._cfo{position:absolute;inset:0;z-index:90;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.7);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);direction:rtl;}
._cfc{background:var(--bg-card,#0d0d0d);border-top:2px solid var(--border-strong,#3d3d3d);border-radius:22px 22px 0 0;width:100%;max-width:480px;padding:13px 15px 30px;animation:_cfSU .22s cubic-bezier(.4,0,.2,1);}
@keyframes _cfSU{from{transform:translateY(100%)}to{transform:none}}
._cfh{width:30px;height:4px;background:var(--border-strong,#3d3d3d);border-radius:999px;margin:0 auto 11px;}
._cft{font-size:16px;font-weight:900;margin-bottom:10px;color:var(--text-primary,#f5f5f5);}
._cfr{background:var(--bg-input,#1e1e1e);border-radius:12px;padding:8px 12px;margin-bottom:13px;}
._cfrow{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border,#2a2a2a);}
._cfrow:last-child{border:none;}
._cfk{font-size:12px;color:var(--text-secondary,#a0a0a0);font-weight:700;}
._cfv{font-family:'IBM Plex Mono',monospace;font-size:13px;font-weight:900;color:var(--text-primary,#f5f5f5);}
._cfv.g{color:#00e676;}._cfv.r{color:#ff3d3d;}._cfv.w{color:#ffd600;}
._cfb{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
._cfca{padding:13px;border-radius:999px;border:1.5px solid var(--border-strong,#3d3d3d);background:var(--bg-elev,#161616);color:var(--text-secondary,#a0a0a0);font-size:14px;font-weight:700;cursor:pointer;font-family:'Cairo',sans-serif;}
._cfex{padding:13px;border-radius:999px;border:none;color:#fff;font-size:14px;font-weight:900;cursor:pointer;font-family:'Cairo',sans-serif;display:flex;align-items:center;justify-content:center;gap:5px;}
._cfex.g{background:linear-gradient(135deg,#00e676,#007c3a);}
._cfex.r{background:linear-gradient(135deg,#ff3d3d,#a00000);}
._cfex:active{filter:brightness(.85);}
._cfex:disabled{opacity:.5;pointer-events:none;}
._cfspin{width:14px;height:14px;border:2.5px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:_sp .7s linear infinite;}
@keyframes _sp{to{transform:rotate(360deg)}}
._cwd{position:absolute;inset:0;z-index:80;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;background:var(--bg-app,#040404);text-align:center;direction:rtl;font-family:'Cairo',sans-serif;}
._cwd-ico{font-size:38px;}
._cwd-title{font-size:15px;font-weight:900;color:var(--text-primary,#f5f5f5);}
._cwd-msg{font-size:12.5px;color:var(--text-secondary,#a0a0a0);line-height:1.9;max-width:380px;}
._cwd-msg code{font-family:'IBM Plex Mono',monospace;font-size:11px;background:var(--bg-elev,#161616);padding:2px 6px;border-radius:6px;direction:ltr;display:inline-block;}
._cwd-btn{margin-top:6px;padding:10px 28px;border-radius:999px;border:none;background:linear-gradient(135deg,#ff8c42,#a8502f);color:#fff;font-size:13px;font-weight:900;font-family:'Cairo',sans-serif;cursor:pointer;}
._cwd-btn:active{opacity:.8;}
`;
    document.head.appendChild(st);
  })();

  /* ── Build screen HTML once ── */
  function _build(){
    if(_built)return;
    const sc=document.getElementById('chartScreen');
    if(!sc)return;
    _built=true;
    sc.innerHTML=`
<div class="_cn">
  <div class="_cnl">
    <button class="_cbk" id="_cBack">← رجوع</button>
    <div class="_cai">
      <span class="_cic" id="_cIco">🛢</span>
      <span class="_cnm" id="_cNam">—</span>
    </div>
  </div>
  <div class="_cnr">
    <button class="_clk" id="_cLck">🔒</button>
  </div>
</div>
<div class="_ctb">
  <button class="_cb _sel" id="_cSel">
    <span class="_cdir">▼ بيع</span>
    <span class="_cpx" id="_cSpx">—</span>
  </button>
  <div class="_cmd">
    <span class="_cql">الكمية</span>
    <div class="_cqr">
      <input class="_cqi" id="_cQty" type="number" value="1" min="0" step="any" inputmode="decimal">
      <span class="_cqu" id="_cQun">—</span>
    </div>
  </div>
  <button class="_cb _buy" id="_cBuy">
    <span class="_cdir">▲ شراء</span>
    <span class="_cpx" id="_cBpx">—</span>
  </button>
</div>
<div class="_ctw" id="_cWrap">
  <div id="_tvC"></div>
</div>`;
    document.getElementById('_cBack').onclick=()=>ChartModule.close();
    document.getElementById('_cLck').onclick=()=>typeof lockApp==='function'&&lockApp(true);
    document.getElementById('_cBuy').onclick=()=>_cf(true);
    document.getElementById('_cSel').onclick=()=>_cf(false);
  }

  function _hdr(sym){
    const a=_asset(sym);
    const ic=document.getElementById('_cIco'),nm=document.getElementById('_cNam');
    const qu=document.getElementById('_cQun'),qi=document.getElementById('_cQty');
    if(ic)ic.textContent=a.icon||'📊';
    if(nm)nm.textContent=a.name||sym;
    if(qu)qu.textContent=a.unit||'';
    if(qi)qi.value=a.presets?.[0]??1;
    _btnPx();
  }

  function _btnPx(){
    const p=_px(_sym),a=_asset(_sym);
    const b=document.getElementById('_cBpx'),s=document.getElementById('_cSpx');
    if(!p)return;
    if(b)b.textContent='$'+(p*1.0005).toFixed(a.pxDp);
    if(s)s.textContent='$'+(p*0.9995).toFixed(a.pxDp);
  }

  /* ════════════════════════════════════════════════════════
     DATAFEED
     All 6 required TradingView datafeed methods.
     Historical data: api.hyperliquid.xyz candleSnapshot via hlInfo()
     Realtime data  : wss://api.hyperliquid.xyz/ws candle channel
  ════════════════════════════════════════════════════════ */
  const Datafeed={

    onReady(cb){
      console.log('[Chart] datafeed.onReady');
      setTimeout(()=>cb({
        supported_resolutions:['1','3','5','15','30','60','120','240','D'],
        exchanges:[{value:'HL',name:'Hyperliquid',desc:'Hyperliquid Perps'}],
        symbols_types:[{name:'crypto',value:'crypto'}],
        supports_marks:false,
        supports_timescale_marks:false,
      }),0);
    },

    searchSymbols(q,ex,t,cb){
      if(typeof ASSETS==='undefined'){cb([]);return;}
      const ql=(q||'').toLowerCase();
      cb(Object.keys(ASSETS).map(s=>({
        symbol:s,full_name:s,ticker:s,
        description:ASSETS[s].name||s,
        exchange:'Hyperliquid',type:'crypto',
      })).filter(x=>x.symbol.toLowerCase().includes(ql)||x.description.toLowerCase().includes(ql)));
    },

    resolveSymbol(name,ok,err){
      if(typeof ASSETS==='undefined'||!ASSETS[name]){
        (err||console.warn)('unknown_symbol:'+name);return;
      }
      const a=_asset(name),dp=a.pxDp||2;
      console.log('[Chart] resolveSymbol →',name,'coin:',_coin(name));
      setTimeout(()=>ok({
        name,ticker:name,description:a.name||name,
        type:'crypto',session:'24x7',
        exchange:'Hyperliquid',listed_exchange:'Hyperliquid',
        timezone:'Etc/UTC',format:'price',
        pricescale:Math.pow(10,dp),minmov:1,
        has_intraday:true,has_daily:true,has_weekly_and_monthly:false,
        intraday_multipliers:['1','3','5','15','30','60','120','240'],
        supported_resolutions:['1','3','5','15','30','60','120','240','D'],
        volume_precision:4,data_status:'streaming',
      }),0);
    },

    /* ──────────────────────────────────────────────────────
       getBars — ROOT CAUSE FIX

       Previous implementation used raw fetch() directly.
       Cause of HTTP 422: hlInfo() in api.js processes the
       response differently AND — critically — the rest of the
       app's API calls all go through hlInfo().  When chart.js
       used raw fetch with slightly different headers/format,
       Hyperliquid's server rejected it with 422.

       Fix: use hlInfo() exactly as session.js, prices.js and
       every other module in the project does.  If hlInfo()
       works for session stats, it works here.

       Also: TradingView's pp.from/pp.to are UNIX seconds.
       We multiply by 1000 for Hyperliquid (expects ms).
       Added defensive clamping so 0/NaN/future values never
       reach the API.
    ────────────────────────────────────────────────────── */
    async getBars(si,res,pp,ok,err){
      try{
        const iv      = RES[res]||'1h';
        const sym     = si.ticker;
        const gram    = _gram(sym);
        const barSec  = IV_SEC[iv]||3600;
        const want    = (pp&&pp.countBack>0)?pp.countBack:300;
        const nowSec  = Math.floor(Date.now()/1000);

        /* clamp to valid UNIX second range */
        let toSec   = (pp&&pp.to  >1e9&&pp.to  <nowSec+86400)?Math.floor(pp.to)  :nowSec;
        let fromSec = (pp&&pp.from>1e9&&pp.from<toSec)        ?Math.floor(pp.from):0;

        /* ensure we request enough bars */
        if(!fromSec||(toSec-fromSec)/barSec<want){
          fromSec=toSec-barSec*want;
        }

        const startTime=fromSec*1000;  /* → ms for Hyperliquid */
        const endTime  =toSec  *1000;

        console.log('[Chart] getBars',sym,iv,
          'first='+pp?.firstDataRequest,
          new Date(startTime).toISOString().slice(0,16)+'..'+new Date(endTime).toISOString().slice(0,16)
        );

        /* hlInfo() — same helper used by session.js, prices.js, account.js */
        const raw=await hlInfo({
          type:'candleSnapshot',
          req:{coin:_coin(sym),interval:iv,startTime,endTime}
        });

        if(!Array.isArray(raw)||!raw.length){
          console.warn('[Chart] getBars noData',sym,iv,'coin='+_coin(sym),
            'raw='+(Array.isArray(raw)?'[]':JSON.stringify(raw).slice(0,120)));
          ok([],{noData:true});return;
        }

        const bars=raw.map(c=>({
          time:Math.floor(c.t/1000),
          open:gram?+c.o/TL:+c.o,high:gram?+c.h/TL:+c.h,
          low :gram?+c.l/TL:+c.l,close:gram?+c.c/TL:+c.c,
          volume:+c.v||0,
        })).sort((a,b)=>a.time-b.time);

        console.log('[Chart] getBars',sym,iv,'→',bars.length,'bars',
          bars.length?'('+new Date(bars[0].time*1000).toISOString().slice(0,10)+'..'+
                          new Date(bars[bars.length-1].time*1000).toISOString().slice(0,10)+')':'');

        ok(bars,{noData:false});

      }catch(e){
        console.error('[Chart] getBars ERROR',si.ticker,res,e.message);
        err(e.message);
      }
    },

    subscribeBars(si,res,cb,uid){
      _subs[uid]={sym:si.ticker,cb};
      _rtConn(si.ticker,res);
    },

    unsubscribeBars(uid){
      delete _subs[uid];
      if(!Object.keys(_subs).length)_rtDis();
    },
  };

  /* ── Realtime candle WebSocket ── */
  function _rtConn(sym,res){
    const coin=_coin(sym),iv=RES[res]||'1h';
    if(_rtWs&&_rtWs.readyState<=1&&_rtCoin===coin&&_rtIv===iv)return;
    _rtDis();_rtCoin=coin;_rtIv=iv;
    try{
      _rtWs=new WebSocket(HL_WS);
      _rtWs.onopen=()=>{
        if(!_rtWs)return;
        console.log('[Chart] WS subscribe',coin,iv);
        _rtWs.send(JSON.stringify({method:'subscribe',subscription:{type:'candle',coin,interval:iv}}));
      };
      _rtWs.onmessage=e=>{
        try{
          const msg=JSON.parse(e.data);
          if(msg.channel!=='candle'||!msg.data)return;
          const c=msg.data,gram=_gram(_sym);
          const bar={
            time:Math.floor(c.t/1000),
            open:gram?+c.o/TL:+c.o,high:gram?+c.h/TL:+c.h,
            low :gram?+c.l/TL:+c.l,close:gram?+c.c/TL:+c.c,volume:+c.v||0,
          };
          Object.values(_subs).forEach(s=>{try{s.cb(bar);}catch{}});
        }catch{}
      };
      _rtWs.onclose=()=>{
        if(_visible&&Object.keys(_subs).length)
          _rtTimer=setTimeout(()=>_rtConn(_sym,_res),4000);
      };
      _rtWs.onerror=()=>console.warn('[Chart] WS error',coin);
    }catch(e){console.warn('[Chart] WS connect error:',e.message);}
  }

  function _rtDis(){
    clearTimeout(_rtTimer);
    if(_rtWs){try{_rtWs.close();}catch{}_rtWs=null;}
    _rtCoin=null;_rtIv=null;
  }

  /* ── Destroy ── */
  function _destroy(){
    clearTimeout(_layoutTmr);_layoutTmr=null;
    clearTimeout(_readyTmr); _readyTmr=null;
    if(_ro){_ro.disconnect();_ro=null;}
    if(_widget){try{_widget.remove();}catch{}_widget=null;}
    _subs={};_rtDis();
    const c=document.getElementById('_tvC');
    if(c){c.innerHTML='';c.style.width='';c.style.height='';}
    document.getElementById('_cWatchdog')?.remove();
  }

  /* ── Poll until container has real pixel size ── */
  function _waitLayout(cb,n){
    clearTimeout(_layoutTmr);n=n||0;
    const wrap=document.getElementById('_cWrap');
    if(wrap&&_visible){
      const r=wrap.getBoundingClientRect();
      if(r.width>10&&r.height>10){cb(Math.floor(r.width),Math.floor(r.height));return;}
    }
    if(!_visible)return;
    if(n<100){_layoutTmr=setTimeout(()=>_waitLayout(cb,n+1),16);}
    else{
      const sc=document.getElementById('chartScreen');
      cb(sc?sc.clientWidth:window.innerWidth,
         Math.max(200,(sc?sc.clientHeight:window.innerHeight)-120));
    }
  }

  /* ── ResizeObserver ── */
  function _setupResize(){
    if(_ro){_ro.disconnect();_ro=null;}
    const wrap=document.getElementById('_cWrap');
    if(!wrap||!window.ResizeObserver)return;
    _ro=new ResizeObserver(entries=>{
      if(!_widget||!_visible)return;
      const{width,height}=entries[0].contentRect;
      if(width<10||height<10)return;
      const c=document.getElementById('_tvC');
      if(c){c.style.width=Math.floor(width)+'px';c.style.height=Math.floor(height)+'px';}
      try{_widget.resize(Math.floor(width),Math.floor(height));}catch{}
    });
    _ro.observe(wrap);
  }

  /* ── Watchdog: visible retry overlay if chart never paints ── */
  function _showWatchdog(sym){
    const wrap=document.getElementById('_cWrap');
    if(!wrap||!_visible)return;
    document.getElementById('_cWatchdog')?.remove();
    const ov=document.createElement('div');
    ov.id='_cWatchdog';ov.className='_cwd';
    ov.innerHTML=`
<div class="_cwd-ico">⏱</div>
<div class="_cwd-title">الرسم البياني لم يكتمل (9 ثوانٍ)</div>
<div class="_cwd-msg">
  افتح <b>DevTools → Console</b> وابحث عن آخر سطر
  <code>[Chart]</code> — سيخبرك أين توقف التحميل بالضبط.
</div>
<button class="_cwd-btn" id="_cWdRetry">إعادة المحاولة</button>`;
    wrap.appendChild(ov);
    document.getElementById('_cWdRetry').onclick=()=>_initWidget(sym);
  }

  /* ════ WIDGET INIT ════ */
  function _initWidget(sym){
    _destroy();
    if(typeof TradingView==='undefined'||typeof TradingView.widget!=='function'){
      console.error('[Chart] TradingView undefined — check /charting_library/charting_library.standalone.js loads before chart.js');
      const w=document.getElementById('_cWrap');
      if(w)w.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ff8c42;font-size:14px;font-weight:700;font-family:Cairo,sans-serif;text-align:center;padding:20px;direction:rtl">⚠️ مكتبة TradingView غير متاحة</div>';
      return;
    }
    _waitLayout((w,h)=>_doInit(sym,w,h));
  }

  function _doInit(sym,w,h){
    if(!_visible)return;
    const cont=document.getElementById('_tvC');
    if(!cont)return;

    cont.style.position='absolute';cont.style.top='0';cont.style.left='0';
    cont.style.width=w+'px';cont.style.height=h+'px';

    const dark=document.documentElement.getAttribute('data-theme')!=='light';
    const bg=dark?'#131722':'#ffffff';
    _res='60';

    console.log('[Chart] creating widget',sym,w+'x'+h,dark?'dark':'light');

    clearTimeout(_readyTmr);
    _readyTmr=setTimeout(()=>{
      console.warn('[Chart] onChartReady timeout (9s)',sym);
      _showWatchdog(sym);
    },9000);

    try{
      _widget=new TradingView.widget({
        width:w,height:h,
        symbol:sym,
        interval:'60',
        container:'_tvC',
        datafeed:Datafeed,
        library_path:'/charting_library/',
        locale:'en',
        timezone:'Asia/Baghdad',
        theme:dark?'Dark':'Light',
        style:'1',
        debug:false,
        enable_publishing:false,
        allow_symbol_change:false,
        save_image:true,

        loading_screen:{backgroundColor:bg,foregroundColor:'#f0a500'},

        /* ── Full TradingView experience ──
           Only disable what would cause errors (no save server,
           no external symbol search, no fullscreen — we use our
           own back button).  Everything else — toolbar, drawing
           tools, indicators, timeframes — enabled. */
        disabled_features:[
          'header_symbol_search',   /* keep our symbols, don't open TV search */
          'header_saveload',        /* no chart storage server */
          'header_compare',
          'header_fullscreen_button',
          'symbol_info',
          'display_market_status',
          'go_to_date',
          'show_logo_on_all_charts',
          'popup_hints',
          'use_localstorage_for_settings',
        ],

        enabled_features:[
          'move_logo_to_main_pane',
          'side_toolbar_in_fullscreen_mode',
          'header_in_fullscreen_mode',
          'create_volume_indicator_by_default',
        ],

        overrides:{
          'mainSeriesProperties.candleStyle.upColor':'#26a69a',
          'mainSeriesProperties.candleStyle.downColor':'#ef5350',
          'mainSeriesProperties.candleStyle.borderUpColor':'#26a69a',
          'mainSeriesProperties.candleStyle.borderDownColor':'#ef5350',
          'mainSeriesProperties.candleStyle.wickUpColor':'#26a69a',
          'mainSeriesProperties.candleStyle.wickDownColor':'#ef5350',
          'paneProperties.background':bg,
          'paneProperties.backgroundType':'solid',
          'paneProperties.vertGridProperties.color':dark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.04)',
          'paneProperties.horzGridProperties.color':dark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.04)',
          'scalesProperties.textColor':dark?'#b2b5be':'#555',
          'scalesProperties.fontSize':11,
          'scalesProperties.backgroundColor':dark?'#131722':'#f0f3fa',
        },

        studies_overrides:{
          'volume.volume.color.0':'#ef5350',
          'volume.volume.color.1':'#26a69a',
          'volume.volume ma.color':'#FF6D00',
          'volume.volume ma.linewidth':1,
          'volume.show ma':false,
        },
      });

      _widget.onChartReady(()=>{
        console.log('[Chart] ✅ onChartReady',sym);
        clearTimeout(_readyTmr);_readyTmr=null;
        document.getElementById('_cWatchdog')?.remove();
        _setupResize();
        _btnPx();
        try{
          _widget.activeChart().onIntervalChanged().subscribe(null,iv=>{
            console.log('[Chart] interval →',iv);_res=iv;
          });
        }catch{}
      });

    }catch(e){
      console.error('[Chart] widget threw:',e);
      clearTimeout(_readyTmr);_readyTmr=null;
      const w2=document.getElementById('_cWrap');
      if(w2)w2.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ef5350;font-size:13px;font-weight:700;font-family:Cairo,sans-serif;text-align:center;padding:20px;direction:rtl">❌ خطأ في الرسم البياني<br><small style="opacity:.7;font-size:11px;margin-top:6px;display:block;font-family:monospace;direction:ltr">'+(e.message||e)+'</small></div>';
    }
  }

  /* ── Confirm sheet ── */
  function _hideCf(){document.getElementById('_cfOv')?.remove();}

  function _cf(buy){
    if(typeof State==='undefined'||!State.wallet){
      typeof toast!=='undefined'&&toast('سجّل الدخول أولاً','err');return;
    }
    const qty=parseFloat(document.getElementById('_cQty')?.value||0);
    if(!qty||qty<=0){typeof toast!=='undefined'&&toast('أدخل الكمية','err');return;}
    const a=_asset(_sym),gram=_gram(_sym),mid=_px(_sym);
    if(!mid){typeof toast!=='undefined'&&toast('لا يوجد سعر','err');return;}
    const midOz=gram?mid*TL:mid,qtyOz=gram?qty/TL:qty;
    const usd=(midOz*qtyOz).toFixed(2),mgn=(midOz*qtyOz/a.lev).toFixed(2);
    const liqOz=buy?midOz*(1-1/a.lev+0.5/a.lev):midOz*(1+1/a.lev-0.5/a.lev);
    const liqD=gram?(liqOz/TL).toFixed(a.pxDp):liqOz.toFixed(a.pxDp);
    _hideCf();
    const wrap=document.getElementById('_cWrap');if(!wrap)return;
    const ov=document.createElement('div');ov.id='_cfOv';ov.className='_cfo';
    ov.innerHTML=`<div class="_cfc">
<div class="_cfh"></div>
<div class="_cft" style="color:${buy?'#26a69a':'#ef5350'}">${a.icon||'📊'} ${buy?'شراء ▲':'بيع ▼'} — ${a.name}</div>
<div class="_cfr">
  <div class="_cfrow"><span class="_cfk">الكمية</span><span class="_cfv">${qty.toFixed(gram?2:a.szDp)} ${a.unit}</span></div>
  <div class="_cfrow"><span class="_cfk">السعر</span><span class="_cfv">$${mid.toFixed(a.pxDp)}</span></div>
  <div class="_cfrow"><span class="_cfk">القيمة</span><span class="_cfv">≈ $${usd}</span></div>
  <div class="_cfrow"><span class="_cfk">الهامش</span><span class="_cfv w">≈ $${mgn}</span></div>
  <div class="_cfrow"><span class="_cfk">التصفية التقريبية</span><span class="_cfv ${buy?'r':'g'}">≈ $${liqD}</span></div>
</div>
<div class="_cfb">
  <button class="_cfca" id="_cfC">إلغاء ✕</button>
  <button class="_cfex ${buy?'g':'r'}" id="_cfX">${buy?'✅ تأكيد الشراء':'✅ تأكيد البيع'}</button>
</div></div>`;
    wrap.appendChild(ov);
    ov.addEventListener('click',e=>{if(e.target===ov)_hideCf();});
    document.getElementById('_cfC').onclick=_hideCf;
    document.getElementById('_cfX').onclick=()=>
      typeof requirePin!=='undefined'?requirePin(()=>_exec(buy,qty)):_exec(buy,qty);
  }

  async function _exec(buy,qty){
    if(!State?.wallet)return;
    const btn=document.getElementById('_cfX');
    if(btn){btn.disabled=true;btn.innerHTML='<span class="_cfspin"></span>';}
    const gram=_gram(_sym);
    const aApi=gram?(typeof ASSETS!=='undefined'?ASSETS['GOLD']:_asset(_sym)):_asset(_sym);
    const mid=_px(_sym),midOz=gram?mid*TL:mid;
    if(!midOz){_hideCf();return;}
    const qtyOz=gram?qty/TL:qty;
    try{
      try{await hlExchange({type:'updateLeverage',asset:aApi.idx,isCross:aApi.cross,leverage:aApi.lev});}catch{}
      await hlExchange({
        type:'order',
        orders:[{a:aApi.idx,b:buy,
          p:wirePx(midOz*(buy?1.05:0.95),aApi.szDp),
          s:wireSz(qtyOz,aApi.szDp),
          r:false,t:{limit:{tif:'Ioc'}}
        }],
        grouping:'na'
      });
      _hideCf();
      const da=_asset(_sym);
      const lb=gram?qty.toFixed(2)+' غرام':qty.toFixed(da.szDp)+' '+da.unit;
      typeof toast!=='undefined'&&toast(`✅ ${da.icon||''} ${buy?'شراء':'بيع'} ${lb}`,'ok',4000);
      if(typeof pollAccount!=='undefined')setTimeout(pollAccount,2000);
    }catch(e){
      typeof toast!=='undefined'&&toast(
        typeof tradeErr!=='undefined'?tradeErr(e.message):'❌ '+e.message.slice(0,100),'err',5000);
      if(btn){btn.disabled=false;btn.innerHTML=buy?'✅ تأكيد الشراء':'✅ تأكيد البيع';}
    }
  }

  /* ════ Public API ════ */

  function open(sym){
    _sym=sym||(typeof State!=='undefined'?State.asset:'CL');
    _visible=true;
    _build();
    document.getElementById('chartScreen')?.classList.remove('hidden');
    _hdr(_sym);
    _initWidget(_sym);
  }

  function close(){
    _visible=false;
    _hideCf();
    _destroy();
    document.getElementById('chartScreen')?.classList.add('hidden');
  }

  function switchInterval(iv){
    if(!_widget)return;
    try{_widget.onChartReady(()=>{_widget.activeChart().setResolution(iv,()=>{_res=iv;});});}catch{}
  }

  function switchAssetChart(sym){
    if(!_visible||sym===_sym)return;
    _sym=sym;_hdr(sym);_initWidget(sym);
  }

  function refreshLines(){}

  return{open,close,switchInterval,switchAssetChart,refreshLines};
})();
