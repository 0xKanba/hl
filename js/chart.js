'use strict';

const ChartModule = (function () {

  const HL_API = 'https://api.hyperliquid.xyz';
  const HL_WS  = 'wss://api.hyperliquid.xyz/ws';
  const TL     = 31.1035;

  let _widget = null;
  let _visible = false;
  let _sym = 'CL';
  let _res = '60';
  let _subs = {};
  let _rtWs = null;
  let _rtTimer = null;
  let _rtCoin = null;
  let _rtIv = null;
  let _built = false;
  let _ro = null;
  let _layoutTmr = null;

  const RES = {
    '1':'1m','3':'3m','5':'5m','15':'5m','30':'30m',
    '60':'1h','120':'2h','240':'4h','D':'1d','1D':'1d'
  };

  const _coin = s => (typeof ASSETS!=='undefined' && ASSETS[s]?.coin) || ('xyz:'+s);
  const _gram = s => !!(typeof ASSETS!=='undefined' && ASSETS[s]?.gram);
  const _asset = s => (typeof ASSETS!=='undefined' && ASSETS[s]) || {pxDp:2,szDp:2,name:s,unit:'',icon:'📊',lev:10,presets:[1]};
  const _px = s => (typeof State!=='undefined' ? State.prices?.[s]?.mid : 0) || 0;

  /* ───────── CSS ───────── */
  (function(){
    if (document.getElementById('_cCSS')) return;
    const st = document.createElement('style');
    st.id = '_cCSS';
    st.textContent = `
.chart-screen{position:fixed;inset:0;z-index:50;display:flex;flex-direction:column;background:#000;}
.chart-screen.hidden{display:none!important;}
._ctw{flex:1;position:relative;min-height:0;overflow:hidden;}
#_tvC{position:absolute;inset:0;}
`;
    document.head.appendChild(st);
  })();

  /* ───────── BUILD ───────── */
  function _build(){
    if (_built) return;
    const sc = document.getElementById('chartScreen');
    if (!sc) return;

    _built = true;

    sc.innerHTML = `
<div class="_ctw" id="_cWrap">
  <div id="_tvC"></div>
</div>`;
  }

  /* ───────── WAIT STABLE LAYOUT (CRITICAL FIX) ───────── */
  function _waitLayout(cb, n=0){
    clearTimeout(_layoutTmr);

    const wrap = document.getElementById('_cWrap');
    if (wrap && _visible) {
      const r = wrap.getBoundingClientRect();

      if (r.width > 50 && r.height > 50) {
        return cb(Math.floor(r.width), Math.floor(r.height));
      }
    }

    if (!_visible) return;

    if (n < 120) {
      _layoutTmr = setTimeout(() => _waitLayout(cb, n+1), 16);
    } else {
      const sc = document.getElementById('chartScreen');
      cb(sc.clientWidth, sc.clientHeight - 80);
    }
  }

  /* ───────── CLEAN DESTROY ───────── */
  function _destroy(){
    clearTimeout(_layoutTmr);

    if (_ro) { _ro.disconnect(); _ro = null; }

    if (_widget) {
      try { _widget.remove(); } catch {}
      _widget = null;
    }

    _subs = {};

    if (_rtWs) {
      try { _rtWs.close(); } catch {}
      _rtWs = null;
    }

    const c = document.getElementById('_tvC');
    if (c) c.innerHTML = '';
  }

  /* ───────── DATAFEED (UNCHANGED LOGIC) ───────── */
  const Datafeed = {

    onReady(cb){
      setTimeout(()=>cb({
        supported_resolutions:['1','3','5','15','30','60','120','240','D']
      }),0);
    },

    resolveSymbol(name, ok){
      const a = _asset(name);
      setTimeout(()=>ok({
        name, ticker:name,
        session:'24x7',
        type:'crypto',
        timezone:'Etc/UTC',
        pricescale:Math.pow(10,a.pxDp||2),
        has_intraday:true,
      }),0);
    },

    async getBars(si,res,pp,ok){
      try{
        const r = await fetch(HL_API+'/info',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            type:'candleSnapshot',
            req:{
              coin:_coin(si.ticker),
              interval:RES[res]||'1h',
              startTime:pp.from*1000,
              endTime:pp.to*1000
            }
          })
        });

        const raw = await r.json();
        if (!Array.isArray(raw) || !raw.length) return ok([], {noData:true});

        ok(raw.map(c=>({
          time: Math.floor(c.t/1000),
          open:+c.o,
          high:+c.h,
          low:+c.l,
          close:+c.c,
          volume:+c.v
        })));

      } catch(e){
        ok([], {noData:true});
      }
    },

    subscribeBars(){},
    unsubscribeBars(){}
  };

  /* ───────── INIT FIXED ───────── */
  function _init(sym){
    _destroy();

    if (typeof TradingView === 'undefined') return;

    _waitLayout((w,h)=>{

      const cont = document.getElementById('_tvC');

      /* 🔥 FORCE REAL SIZE BEFORE INIT */
      cont.style.width = w + 'px';
      cont.style.height = h + 'px';
      cont.offsetHeight;

      _widget = new TradingView.widget({
        width: w,
        height: h,
        symbol: sym,
        interval: '60',
        container: '_tvC',

        /* IMPORTANT FIX */
        library_path: '/charting_library/',

        datafeed: Datafeed,
        locale: 'en',
        theme: 'Dark',

        autosize: false,   // 🔥 must be false
        debug: false,

        disabled_features:[
          'header_toolbar',
          'left_toolbar',
          'timeframes_toolbar'
        ]
      });

      _widget.onChartReady(()=>{

        /* 🔥 FORCE FIRST RENDER FIX */
        setTimeout(()=>{
          try{
            _widget.activeChart().setVisibleRange({
              from: Date.now()/1000 - 86400,
              to: Date.now()/1000
            });
          }catch{}
        },80);

        /* FORCE RESIZE SYNC */
        const wrap = document.getElementById('_cWrap');
        const r = wrap.getBoundingClientRect();
        try { _widget.resize(r.width, r.height); } catch {}

      });

    });
  }

  /* ───────── PUBLIC API ───────── */
  function open(sym){
    _sym = sym;
    _visible = true;
    _build();
    document.getElementById('chartScreen')?.classList.remove('hidden');
    _init(sym);
  }

  function close(){
    _visible = false;
    _destroy();
    document.getElementById('chartScreen')?.classList.add('hidden');
  }

  function switchAssetChart(sym){
    if (sym !== _sym) open(sym);
  }

  return { open, close, switchAssetChart };
})();
