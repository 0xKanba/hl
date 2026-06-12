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
  let _ro        = null;   // ResizeObserver — keeps widget synced to container
  let _layoutTmr = null;   // poll handle for _waitLayout

  const RES = {
    '1':'1m','3':'3m','5':'5m','15':'15m','30':'30m',
    '60':'1h','120':'2h','240':'4h','D':'1d','1D':'1d'
  };

  const _coin  = s => (typeof ASSETS!=='undefined'&&ASSETS[s]?.coin)||('xyz:'+s);
  const _gram  = s => !!(typeof ASSETS!=='undefined'&&ASSETS[s]?.gram);
  const _asset = s => (typeof ASSETS!=='undefined'&&ASSETS[s])||{pxDp:2,szDp:2,name:s,unit:'',icon:'📊',lev:10,presets:[1],idx:0,cross:true};
  const _px    = s => (typeof State!=='undefined'?State.prices[s]?.mid:0)||0;

  /* ── CSS (injected once) ── */
  (function(){
    if (document.getElementById('_cCSS')) return;
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
`;
    document.head.appendChild(st);
  })();

  /* ── Build screen HTML once ── */
  function _build() {
    if (_built) return;
    const sc=document.getElementById('chartScreen');
    if (!sc) return;
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

  function _hdr(sym) {
    const a=_asset(sym);
    const ic=document.getElementById('_cIco'),nm=document.getElementById('_cNam');
    const qu=document.getElementById('_cQun'),qi=document.getElementById('_cQty');
    if(ic)ic.textContent=a.icon||'📊';
    if(nm)nm.textContent=a.name||sym;
    if(qu)qu.textContent=a.unit||'';
    if(qi)qi.value=a.presets?.[0]??1;
    _btnPx();
  }

  function _btnPx() {
    const p=_px(_sym),a=_asset(_sym);
    const b=document.getElementById('_cBpx'),s=document.getElementById('_cSpx');
    if(!p)return;
    if(b)b.textContent='$'+(p*1.0005).toFixed(a.pxDp);
    if(s)s.textContent='$'+(p*0.9995).toFixed(a.pxDp);
  }

  /* ════════════════════════════════════════════════════════
     DATAFEED — implements the 6 methods TradingView requires:
     onReady, searchSymbols, resolveSymbol, getBars,
     subscribeBars, unsubscribeBars
     Source of truth: api.hyperliquid.xyz (REST + WS)
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
      const a=_asset(name);
      if(!a||!ASSETS[name]){
        err && err('unknown_symbol: '+name);
        return;
      }
      const dp=a.pxDp||2;
      console.log('[Chart] resolveSymbol →', name, '(coin:', _coin(name)+')');
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

    async getBars(si,res,pp,ok,err){
      try{
        const iv=RES[res]||'1h',sym=si.ticker,gram=_gram(sym);
        const r=await fetch(HL_API+'/info',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({type:'candleSnapshot',req:{
            coin:_coin(sym),interval:iv,
            startTime:pp.from*1000,endTime:pp.to*1000
          }})
        });
        if(!r.ok)throw new Error('HTTP '+r.status);
        const raw=await r.json();
        if(!Array.isArray(raw)||!raw.length){
          console.log('[Chart] getBars', sym, iv, '→ noData');
          ok([],{noData:true});return;
        }
        const bars=raw.map(c=>({
          time:Math.floor(c.t/1000),
          open:gram?+c.o/TL:+c.o,high:gram?+c.h/TL:+c.h,
          low:gram?+c.l/TL:+c.l,close:gram?+c.c/TL:+c.c,
          volume:+c.v||0,
        })).sort((a,b)=>a.time-b.time);
        console.log('[Chart] getBars', sym, iv, '→', bars.length, 'bars');
        ok(bars,{noData:false});
      }catch(e){
        console.error('[Chart] getBars error:', e.message);
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
        console.log('[Chart] WS subscribe', coin, iv);
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
            low:gram?+c.l/TL:+c.l,close:gram?+c.c/TL:+c.c,volume:+c.v||0,
          };
          Object.values(_subs).forEach(s=>{try{s.cb(bar);}catch{}});
        }catch{}
      };
      _rtWs.onclose=()=>{
        if(_visible&&Object.keys(_subs).length)
          _rtTimer=setTimeout(()=>_rtConn(_sym,_res),4000);
      };
      _rtWs.onerror=()=>{
        console.warn('[Chart] WS error for', coin);
      };
    }catch(e){console.warn('[Chart] WS connect error:',e.message);}
  }

  function _rtDis(){
    clearTimeout(_rtTimer);
    if(_rtWs){try{_rtWs.close();}catch{}_rtWs=null;}
    _rtCoin=null;_rtIv=null;
  }

  /* ── Destroy: full cleanup before re-init ── */
  function _destroy(){
    clearTimeout(_layoutTmr); _layoutTmr=null;
    if(_ro){_ro.disconnect();_ro=null;}
    if(_widget){try{_widget.remove();}catch{}_widget=null;}
    _subs={}; _rtDis();
    const c=document.getElementById('_tvC');
    if(c){c.innerHTML=''; c.style.width=''; c.style.height='';}
  }

  /* ════════════════════════════════════════════════════════
     _waitLayout — ROOT-CAUSE FIX

     The original code used two nested requestAnimationFrame
     calls before measuring #_cWrap. That is not sufficient:
     after `chartScreen.classList.remove('hidden')` (display:
     none → flex), the browser may need MULTIPLE frames to
     finish the flex layout pass — especially on first open
     and on mobile. When getBoundingClientRect() returned
     height === 0, the old `if (h > 0)` guard silently did
     NOTHING, leaving #_tvC at its CSS height:100% of a
     still-zero ancestor. TradingView's `autosize:true` then
     measured a 0×0 container AT CONSTRUCTION TIME → internal
     canvas = 0×0 → nothing ever paints → loading screen never
     clears, even though onChartReady may still fire.

     Fix: poll every 16ms (one frame) until BOTH width and
     height are > 10px, then proceed. Hard timeout at ~1.6s
     falls back to a computed size derived from the screen,
     so the widget is NEVER constructed with a zero container.
  ════════════════════════════════════════════════════════ */
  function _waitLayout(cb, n){
    clearTimeout(_layoutTmr);
    n = n || 0;
    const wrap = document.getElementById('_cWrap');
    if (wrap && _visible) {
      const r = wrap.getBoundingClientRect();
      if (r.width > 10 && r.height > 10) {
        cb(Math.floor(r.width), Math.floor(r.height));
        return;
      }
    }
    if (!_visible) return; // closed while waiting
    if (n < 100) {
      _layoutTmr = setTimeout(() => _waitLayout(cb, n + 1), 16);
    } else {
      console.warn('[Chart] layout wait timed out — using fallback size');
      const sc = document.getElementById('chartScreen');
      const w  = sc ? sc.clientWidth  : window.innerWidth;
      const h  = Math.max(200, (sc ? sc.clientHeight : window.innerHeight) - 120);
      cb(w, h);
    }
  }

  /* ════════════════════════════════════════════════════════
     _setupResize — replaces autosize:true.

     autosize relies on TradingView's internal ResizeObserver,
     which measures the container at the moment it's attached.
     If that first measurement was 0×0 (see above), later size
     changes are not guaranteed to trigger a correct repaint in
     all library versions. We instead own the ResizeObserver,
     keep #_tvC's inline pixel size in sync with #_cWrap, and
     call widget.resize(w,h) explicitly — guaranteed to work for
     orientation change, keyboard open/close, split-screen, etc.
  ════════════════════════════════════════════════════════ */
  function _setupResize(){
    if(_ro){_ro.disconnect();_ro=null;}
    const wrap=document.getElementById('_cWrap');
    if(!wrap||!window.ResizeObserver)return;
    _ro=new ResizeObserver(entries=>{
      if(!_widget||!_visible)return;
      const {width,height}=entries[0].contentRect;
      if(width<10||height<10)return;
      const c=document.getElementById('_tvC');
      if(c){c.style.width=Math.floor(width)+'px';c.style.height=Math.floor(height)+'px';}
      try{_widget.resize(Math.floor(width),Math.floor(height));}catch{}
    });
    _ro.observe(wrap);
  }

  /* ════ WIDGET INIT ════ */
  function _initWidget(sym){
    _destroy();

    if(typeof TradingView==='undefined'||typeof TradingView.widget!=='function'){
      console.error('[Chart] TradingView.widget is undefined.');
      console.error('[Chart] Check that /charting_library/charting_library.standalone.js');
      console.error('[Chart] exists and loads BEFORE /js/chart.js in index.html.');
      const w=document.getElementById('_cWrap');
      if(w)w.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ff8c42;font-size:14px;font-weight:700;font-family:Cairo,sans-serif;text-align:center;padding:20px;direction:rtl">⚠️ تعذر تحميل مكتبة الرسم البياني<br><small style="opacity:.6;font-size:11px;margin-top:8px;display:block">تأكد من وجود /charting_library/charting_library.standalone.js</small></div>';
      return;
    }

    _waitLayout((w,h)=>_doInit(sym,w,h));
  }

  function _doInit(sym,w,h){
    if(!_visible)return;
    const cont=document.getElementById('_tvC');
    if(!cont){console.error('[Chart] #_tvC missing — _build() did not run');return;}

    /* Explicit pixel dimensions — guaranteed non-zero (see _waitLayout) */
    cont.style.position='absolute';
    cont.style.top='0';
    cont.style.left='0';
    cont.style.width=w+'px';
    cont.style.height=h+'px';

    const dark=document.documentElement.getAttribute('data-theme')!=='light';
    const bg=dark?'#040404':'#ffffff';
    _res='60'; // default 1H

    console.log('[Chart] creating widget', sym, w+'x'+h, dark?'dark':'light');

    try{
      _widget=new TradingView.widget({
        /* Explicit width/height — NOT autosize.
           autosize measures the container at construction time;
           if that measurement is 0×0 the canvas never recovers.
           Resizing after init is handled by _setupResize(). */
        width:  w,
        height: h,

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
        save_image:false,
        loading_screen:{backgroundColor:bg,foregroundColor:'#ff8c42'},
        disabled_features:[
          'header_symbol_search','header_resolutions','header_chart_type',
          'header_settings','header_indicators','header_compare',
          'header_undo_redo','header_screenshot','header_fullscreen_button',
          'header_saveload','left_toolbar','border_around_the_chart',
          'popup_hints','symbol_info','go_to_date','display_market_status',
          'timeframes_toolbar','legend_context_menu',
          'show_interval_dialog_on_key_press','volume_force_overlay',
          'create_volume_indicator_by_default','use_localstorage_for_settings',
          'countdown_timer','show_logo_on_all_charts',
        ],
        enabled_features:[
          'move_logo_to_main_pane','hide_left_toolbar_by_default',
        ],
        overrides:{
          'mainSeriesProperties.candleStyle.upColor':'#00e676',
          'mainSeriesProperties.candleStyle.downColor':'#ff3d3d',
          'mainSeriesProperties.candleStyle.borderUpColor':'#00e676',
          'mainSeriesProperties.candleStyle.borderDownColor':'#ff3d3d',
          'mainSeriesProperties.candleStyle.wickUpColor':'#00e676',
          'mainSeriesProperties.candleStyle.wickDownColor':'#ff3d3d',
          'paneProperties.background':bg,
          'paneProperties.backgroundType':'solid',
          'paneProperties.vertGridProperties.color':dark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.05)',
          'paneProperties.horzGridProperties.color':dark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.05)',
          'scalesProperties.textColor':dark?'#a0a0a0':'#333',
          'scalesProperties.fontSize':11,
          'scalesProperties.backgroundColor':dark?'#0a0a0a':'#f5f5f5',
        },
      });

      _widget.onChartReady(()=>{
        console.log('[Chart] ✅ onChartReady —', sym);
        _setupResize();
        _btnPx();
        try{
          _widget.activeChart().onIntervalChanged().subscribe(null,iv=>{
            console.log('[Chart] interval →', iv);
            _res=iv;
          });
        }catch{}
      });

    }catch(e){
      console.error('[Chart] widget constructor threw:', e);
      const w2=document.getElementById('_cWrap');
      if(w2)w2.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ff3d3d;font-size:13px;font-weight:700;font-family:Cairo,sans-serif;text-align:center;padding:20px;direction:rtl">❌ خطأ في إنشاء الرسم البياني<br><small style="opacity:.7;font-size:11px;margin-top:6px;display:block;font-family:monospace;direction:ltr">'+(e.message||e)+'</small></div>';
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
<div class="_cft" style="color:${buy?'#00e676':'#ff3d3d'}">${a.icon||'📊'} ${buy?'شراء ▲':'بيع ▼'} — ${a.name}</div>
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

  /* No-op kept for API compatibility — positions.js calls this
     after every position update. Not part of the required
     integration surface (onReady/searchSymbols/resolveSymbol/
     getBars/subscribeBars/unsubscribeBars); safe to leave empty. */
  function refreshLines(){}

  return{open,close,switchInterval,switchAssetChart,refreshLines};
})();
