const ChartModule = (function () {
  'use strict';

  /* ══════════ CONSTANTS ══════════ */
  const HL_API      = 'https://api.hyperliquid.xyz';
  const TROY        = 31.1035;
  const MIN_TIME    = 1577836800000;          // 2020-01-01 00:00 UTC
  const LS_PREFIX   = 'hl_tv_';
  const LAYOUT_KEY  = 'layout_v2';

  const TV_RESOLUTIONS = ['1','3','5','15','30','60','120','240','1D','1W'];

  const TV_TO_HL = {
    '1':'1m','3':'3m','5':'5m','15':'15m','30':'30m',
    '60':'1h','120':'2h','240':'4h','1D':'1d','1W':'1d'
  };

  /* ✅ جديد — مدة كل دقة زمنية بالمللي ثانية، للعدّ التنازلي المستقل
     فقط (راجع _updateCountdown أدناه). لا علاقة لها إطلاقاً ببيانات
     الشموع أو قرارات الـDatafeed — عرض نصي بحت، بصمة الحساب مطابقة
     تماماً لملف المشروع بدون مكتبة (Math.ceil(Date.now()/ms)*ms). */
  const RES_MS = {
    '1':60000, '3':180000, '5':300000, '15':900000, '30':1800000,
    '60':3600000, '120':7200000, '240':14400000, '1D':86400000, '1W':604800000
  };

  const NAV_ASSETS = [
    { sym:'CL',     ar:'النفط',     icon:'🛢'  },
    { sym:'GOLD',   ar:'الذهب',     icon:'🟡'  },
    { sym:'XAU',    ar:'غرام ذهب',  icon:'⚖️'  },
    { sym:'SILVER', ar:'الفضة',     icon:'⚪'  },
    { sym:'NQ',     ar:'ناسداك',    icon:'📊'  },
  ];

  /* ══════════ HELPERS ══════════ */
  const _lsGet = k => { try { return JSON.parse(localStorage.getItem(LS_PREFIX+k)); } catch { return null; } };
  const _lsSet = (k,v) => { try { localStorage.setItem(LS_PREFIX+k, JSON.stringify(v)); } catch {} };

  const _asset = s =>
    (typeof ASSETS !== 'undefined' && ASSETS[s]) ||
    { pxDp:2, szDp:2, name:s, icon:'📊', unit:'', lev:10, idx:0, cross:true, coin:`xyz:${s}` };

  const _coin = s => {
    if (s === 'XAU') return 'xyz:GOLD';
    const a = _asset(s);
    return a.coin || `xyz:${s}`;
  };

  const _isGram = s => s === 'XAU';
  const _toDisp = (s,v) => _isGram(s) ? v / TROY : v;
  const _toOz   = (s,v) => _isGram(s) ? v * TROY : v;
  const _dark   = () => (document.documentElement.getAttribute('data-theme')||'dark')==='dark';

  /* ══════════ UTC TIME NORMALIZATION ══════════
     Every timestamp is snapped to the exact interval boundary via
     floor (never rounds up/forward). No drift, no timezone shifts,
     no manual compensation — raw server time only.               */
  function _normTime(ms, res) {
    const d = new Date(ms);
    switch (res) {
      case '1':
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes());
      case '3': {
        const m = d.getUTCMinutes();
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), m - (m % 3));
      }
      case '5': {
        const m = d.getUTCMinutes();
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), m - (m % 5));
      }
      case '15': {
        const m = d.getUTCMinutes();
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), m - (m % 15));
      }
      case '30': {
        const m = d.getUTCMinutes();
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), m - (m % 30));
      }
      case '60':
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours());
      case '120': {
        const h = d.getUTCHours();
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h - (h % 2));
      }
      case '240': {
        const h = d.getUTCHours();
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h - (h % 4));
      }
      case '1D':
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      case '1W': {
        const dow = d.getUTCDay();                 // 0=Sun … 6=Sat
        const back = dow === 0 ? 6 : dow - 1;      // days since Monday
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back);
      }
      default:
        return ms;
    }
  }

  const _weekStart = ms => _normTime(ms, '1W');

  /* ══════════ DATAFEED ══════════
     ✅ FIX جوهري — حُذف بالكامل نظام تصحيح الساعة المحلية القديم
     (_correctedNow / _calibrateClock / _advanceTime / getServerTime /
     supports_time). كان هذا يُسبِّب إغلاق الشمعة قبل موعدها الحقيقي
     بثانية تقريباً ("1د" تُغلق عند 59 ثانية وتفتح التالية): كل شمعة حية
     واردة من الخادم كانت تُشغِّل _calibrateClock، وأحد فرعيها يُعيد ضبط
     _clockOffsetMs بحيث "الآن المصحَّح" = بداية الدلو الحالي بالضبط
     بمجرد أن يتجاوزه — حلقة تغذية راجعة تُصفِّر تقدّم الوقت الفعلي
     بدل تركه يتقدّم طبيعياً، وتُغذّي getServerTime المكتبة مباشرة بهذا
     الرقم غير المستقر. الحل: لا تصحيح إطلاقاً — بيانات الوقت/السعر
     تُغذّى تماماً كما تصل من الخادم (نفس فلسفة النسخة القديمة بلا
     مكتبة Advanced Charts)، والعدّ التنازلي (showCountdown) يعتمد على
     ساعة المتصفح الافتراضية لـTradingView (supports_time=false)، بلا
     أي طبقة تخمين محلية بيننا وبين البيانات الحقيقية.
     الأثر الجانبي المقبول: بلا تداول فعلي لفترة طويلة، الشمعة قيد
     التكوّن تبقى ثابتة حتى وصول أول تحديث حقيقي — بالضبط سلوك النسخة
     القديمة بلا مكتبة، لا نقص وظيفي عنها.

     ✅ FIX ثانٍ وأهم — إزالة الطبقة أعلاه وحدها لم تكفِ: مكتبة
     TradingView Advanced Charts تملك آلية showCountdown *داخلية* خاصة
     بها، منفصلة تماماً عن الـDatafeed — تقارن آخر بار وصلها فعلياً مع
     Date.now() الخام لجهاز المتصفح بمعزل عن أي بيانات حقيقية جديدة،
     وتُظهر/تتصرّف وكأن الشمعة أُغلقت بمجرد انتهاء المدة حسابياً، حتى
     لو الـDatafeed لم يُرسل أي بار جديد بعد. هذا تخمين المكتبة نفسها،
     لا علاقة له بـ_ingestCandle أعلاه (المُصلَح فعلاً ويعمل بشكل سليم).
     الحل: تعطيل showCountdown الداخلي كلياً (أسفل بـ_mkWidget)، واستبداله
     بعدّاد تنازلي مستقل مبني خارج المكتبة تماماً — نفس معادلة الملف بدون
     مكتبة حرفياً (_updateCountdown أسفل)، بلا أي تدخّل من TradingView.
  ══════════════════════════════════════════════════════════════ */
  class HyperliquidDatafeed {
    constructor() {
      this._subs = new Map();      // uid  → {sym,res,callback,wsKey,lastBar}
      this._ws   = new Map();      // wsKey → {unsub,lastBar,dailyMap}
    }

    onReady(cb) {
      setTimeout(() => cb({
        supported_resolutions: TV_RESOLUTIONS,
        currency_codes: ['USD'],
        exchanges: [{value:'HL',name:'Hyperliquid',desc:'Hyperliquid Perps'}],
        symbols_types: [{name:'Perp',value:'perp'}],
        supports_search: false,
        supports_group_request: false,
        supports_marks: false,
        supports_timescale_marks: false,
        /* ✅ FIX — كانت true (getServerTime مصدر الانحراف، راجع تعليق
           رأس الملف). false تعني: المكتبة تستخدم ساعة المتصفح مباشرة،
           بلا أي وسيط تصحيح محلي — تماماً كالنسخة القديمة بلا مكتبة. */
        supports_time: false,
      }), 0);
    }

    searchSymbols() {}

    resolveSymbol(name, onOk, onErr) {
      const a = _asset(name);
      setTimeout(() => onOk({
        name, ticker:name, description:a.name||name, type:'crypto', session:'24x7',
        timezone: 'Etc/UTC',          // data timestamps are pure UTC
        minmov: 1,
        pricescale: Math.pow(10, a.pxDp||2),
        has_intraday: true,
        has_daily: true,
        has_weekly_and_monthly: true,
        intraday_multipliers: ['1','3','5','15','30','60','120','240'],
        supported_resolutions: TV_RESOLUTIONS,
        volume_precision: 4,
        data_status: 'streaming',
        exchange: 'Hyperliquid',
        listed_exchange: 'Hyperliquid',
        format: 'price',
        currency_code: 'USD',
      }), 0);
    }

    async getBars(symbolInfo, resolution, periodParams, onHistory, onError) {
      const sym = symbolInfo.name;
      const coin = _coin(sym);
      const isW = resolution === '1W';
      const hlIv = isW ? '1d' : (TV_TO_HL[resolution] || '1h');
      const fromMs = Math.max(periodParams.from * 1000, MIN_TIME);
      /* ✅ Date.now() خام مباشرة — بلا أي إزاحة محلية (راجع تعليق رأس
         الملف). مطابق تماماً لأسلوب النسخة القديمة بلا مكتبة. */
      const toMs   = Math.min(periodParams.to   * 1000, Date.now());

      if (fromMs >= toMs) { onHistory([], {noData:true}); return; }

      try {
        const raw = await this._fetchRest(coin, hlIv, fromMs, toMs);
        const bars = isW ? this._aggWeekly(raw) : raw;

        if (!bars.length) { onHistory([], {noData:true}); return; }

        // Seed WS lastBar so the first realtime tick merges instead of dupes
        const wk = this._key(coin, isW ? '1d' : hlIv);
        const s = this._ws.get(wk);
        if (s) s.lastBar = { ...bars[bars.length-1] };

        onHistory(bars, {noData:false});
      } catch (e) {
        console.error('[DF getBars]', e);
        onError(e.message);
      }
    }

    subscribeBars(symbolInfo, resolution, onRealtime, uid, onReset) {
      const sym = symbolInfo.name;
      const coin = _coin(sym);
      const isW = resolution === '1W';
      const hlIv = isW ? '1d' : (TV_TO_HL[resolution] || '1h');
      const wsKey = this._key(coin, hlIv);

      this._subs.set(uid, { sym, resolution, callback: onRealtime, wsKey, lastBar: null });

      if (!this._ws.has(wsKey)) this._openWs(wsKey, coin, hlIv);
    }

    unsubscribeBars(uid) {
      const sub = this._subs.get(uid);
      if (!sub) return;
      this._subs.delete(uid);

      let need = false;
      for (const [,s] of this._subs) if (s.wsKey === sub.wsKey) { need = true; break; }
      if (!need) {
        const w = this._ws.get(sub.wsKey);
        if (w) { try { w.unsub(); } catch {} this._ws.delete(sub.wsKey); }
      }
    }

    destroy() {
      for (const [,w] of this._ws) { try { w.unsub(); } catch {} }
      this._ws.clear();
      this._subs.clear();
    }

    /* ── internals ── */
    _key(coin, res) { return `${coin}:${res}`; }

    /*
      Build a bar from a Hyperliquid candle object.
      Hyperliquid t is OPEN time in both REST and WS (confirmed:
      Candle{ t: open millis; T: close millis }); we never read T,
      only t — used directly, no correction.
    */
    _bar(candle, sym, res) {
      const g = _isGram(sym);
      const t = candle.t > 1e12 ? candle.t : candle.t * 1000;
      const time = _normTime(t, res);
      return {
        time,
        open:  g ? parseFloat(candle.o)/TROY : parseFloat(candle.o),
        high:  g ? parseFloat(candle.h)/TROY : parseFloat(candle.h),
        low:   g ? parseFloat(candle.l)/TROY : parseFloat(candle.l),
        close: g ? parseFloat(candle.c)/TROY : parseFloat(candle.c),
        volume: parseFloat(candle.v) || 0,
      };
    }

    async _fetchRest(coin, hlIv, fromMs, toMs) {
      const r = await fetch(HL_API+'/info', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({type:'candleSnapshot', req:{coin, interval:hlIv, startTime:fromMs, endTime:toMs}})
      });
      if (!r.ok) throw new Error('HTTP '+r.status);
      const data = await r.json();
      if (!Array.isArray(data)) return [];

      const g = coin === 'xyz:GOLD';
      // Map HL interval back to TV resolution for normalization
      const tvRes = Object.keys(TV_TO_HL).find(k => TV_TO_HL[k] === hlIv) || '60';
      const seen = new Set();
      const out = [];

      for (const c of data) {
        const t = c.t > 1e12 ? c.t : c.t * 1000;
        if (t < MIN_TIME || t > toMs + 86400000) continue;
        const time = _normTime(t, tvRes);
        if (seen.has(time)) continue;
        seen.add(time);

        out.push({
          time,
          open:  g ? parseFloat(c.o)/TROY : parseFloat(c.o),
          high:  g ? parseFloat(c.h)/TROY : parseFloat(c.h),
          low:   g ? parseFloat(c.l)/TROY : parseFloat(c.l),
          close: g ? parseFloat(c.c)/TROY : parseFloat(c.c),
          volume: parseFloat(c.v) || 0,
        });
      }
      return out.sort((a,b)=>a.time-b.time);
    }

    _aggWeekly(daily) {
      const m = new Map();
      for (const b of daily) {
        const w = _weekStart(b.time);
        const ex = m.get(w);
        if (!ex) m.set(w, {...b, time:w});
        else {
          ex.high = Math.max(ex.high, b.high);
          ex.low  = Math.min(ex.low,  b.low);
          ex.close = b.close;
          ex.volume += b.volume; // ← صحيح هنا: مجموع أيام منفصلة، لا تحديثات متكررة لنفس اليوم
        }
      }
      return Array.from(m.values()).sort((a,b)=>a.time-b.time);
    }

    _openWs(wsKey, coin, hlIv) {
      if (typeof HL === 'undefined') return;
      const entry = { unsub: null, lastBar: null, dailyMap: new Map() };
      this._ws.set(wsKey, entry);

      entry.unsub = HL.subscribe({type:'candle', coin, interval:hlIv}, payload => {
        this._ingestCandle(wsKey, payload);
      });

      /* بذر أيام الأسبوع الحالي المنقضية فوراً (بالتوازي مع الاشتراك
         أعلاه) لصحّة تجميع 1W من أول لحظة، بلا انتظار تحديثات حيّة
         تتراكم من الصفر — مُقيَّدة بمشترك 1W فعلي فقط. */
      let needsWeekly = false;
      for (const [,s] of this._subs) if (s.wsKey === wsKey && s.resolution === '1W') { needsWeekly = true; break; }
      if (hlIv === '1d' && needsWeekly) {
        const now = Date.now();
        this._fetchRest(coin, '1d', now - 9 * 86400000, now).then(raw => {
          const w = this._ws.get(wsKey);
          if (!w) return; // أُلغي الاشتراك قبل اكتمال الجلب
          const curWeekStart = _weekStart(now);
          for (const d of raw) {
            if (d.time >= curWeekStart && !w.dailyMap.has(d.time)) w.dailyMap.set(d.time, { ...d });
          }
          if (!w.lastBar && raw.length) w.lastBar = { ...raw[raw.length - 1] };
        }).catch(() => {});
      }
    }

    /* ══════════════════════════════════════════════════════════════
       ✅ نقطة الاستيعاب الموحّدة الوحيدة لكل تحديث شمعة حي. مبسَّطة
       بالكامل بعد حذف مفهوم "الشمعة الاصطناعية" (لم يعد هناك أي بار
       يُنشأ محلياً — كل بار هنا حقيقي 100% قادم من الخادم). القاعدة:
       دلو زمني جديد → استبدال كامل؛ نفس الدلو → تحديث high/low/close
       (Candle.v إجمالي تراكمي، لا دلتا — استبدال لا تراكم)؛ دلو أقدم
       (تكة متأخرة بعد إعادة اتصال) → تجاهل.
       ══════════════════════════════════════════════════════════════ */
    _ingestCandle(wsKey, payload) {
      const w = this._ws.get(wsKey);
      if (!w) return;

      const c = Array.isArray(payload) ? payload[payload.length - 1] : payload;
      if (!c) return;

      for (const [,sub] of this._subs) {
        if (sub.wsKey !== wsKey) continue;

        // For weekly subscribers, normalize to daily boundary first,
        // then aggregate to weekly. For others, normalize to their resolution.
        const normRes = sub.resolution === '1W' ? '1D' : sub.resolution;
        const raw = this._bar(c, sub.sym, normRes);

        if (!w.lastBar || raw.time > w.lastBar.time) {
          w.lastBar = { ...raw };
        } else if (raw.time === w.lastBar.time) {
          w.lastBar.high  = Math.max(w.lastBar.high, raw.high);
          w.lastBar.low   = Math.min(w.lastBar.low,  raw.low);
          w.lastBar.close = raw.close;
          w.lastBar.volume = raw.volume;
        } else {
          continue; // تكة متأخرة أقدم من المعروض فعلاً — تجاهل
        }

        this._emit(sub, w);
      }
    }

    /* ✅ تجميع منطق الإصدار (weekly aggregation + dedup + callback). */
    _emit(sub, w) {
      let emit;
      if (sub.resolution === '1W') {
        const dk = _normTime(w.lastBar.time, '1D');
        w.dailyMap.set(dk, {...w.lastBar});
        const curW = _weekStart(w.lastBar.time);
        for (const [k] of w.dailyMap) if (k < curW - 7*86400000) w.dailyMap.delete(k);
        emit = this._calcWeek(w.dailyMap, curW);
        if (!emit) return;
      } else {
        emit = {...w.lastBar};
      }

      // Deduplicate: only emit if bar actually changed
      if (!sub.lastBar || emit.time!==sub.lastBar.time ||
          emit.open!==sub.lastBar.open || emit.high!==sub.lastBar.high ||
          emit.low!==sub.lastBar.low || emit.close!==sub.lastBar.close ||
          emit.volume!==sub.lastBar.volume) {
        sub.callback(emit);
        sub.lastBar = emit;
      }
    }

    _calcWeek(map, start) {
      let open=null, high=-Infinity, low=Infinity, close=null, vol=0;
      const end = start + 7*86400000;
      for (const [t,b] of map) {
        if (t < start || t >= end) continue;
        if (open===null) open=b.open;
        high = Math.max(high,b.high);
        low  = Math.min(low, b.low);
        close = b.close;
        vol  += b.volume; // ← صحيح هنا أيضاً: مجموع أيام منفصلة بـdailyMap
      }
      if (open===null) return null;
      return {time:start, open, high, low, close, volume:vol};
    }
  }

  /* ══════════ MODULE STATE ══════════ */
  let _widget      = null;
  let _datafeed    = null;
  let _visible     = false;
  let _sym         = 'CL';
  let _interval    = '60';
  let _clockTimer  = null;
  let _saveTimer   = null;
  const _prices    = {};
  let _bboUnsub    = null;
  let _bboSym      = '';
  let _lines       = [];
  let _linesReady  = false;
  let _linesPending = false;
  let _widgetReady = false;

  /* ══════════ CSS ══════════ */
  (function _injectCSS() {
    if (document.getElementById('_tvCSS')) return;
    const s = document.createElement('style');
    s.id = '_tvCSS';
    s.textContent = `
.chart-screen{position:fixed;inset:0;z-index:50;display:flex;flex-direction:column;background:var(--bg-app,#000);overflow:hidden;}
.chart-screen.hidden{display:none!important;}
#_tvHdr{display:flex;align-items:center;justify-content:space-between;padding:0 8px;height:46px;background:var(--bg-card,#0d0d0d);border-bottom:1px solid var(--border,#1e1e1e);flex-shrink:0;direction:rtl;gap:6px;z-index:5;min-width:0;}
.tvh-l{display:flex;align-items:center;gap:5px;min-width:0;flex:1;overflow:hidden;}
.tvh-r{display:flex;align-items:center;gap:5px;flex-shrink:0;}
.tvh-back{font-size:11px;font-weight:800;padding:4px 9px;border-radius:8px;border:1.5px solid rgba(255,140,66,.3);background:rgba(255,140,66,.1);color:var(--ac,#ff8c42);font-family:'Cairo',sans-serif;cursor:pointer;white-space:nowrap;flex-shrink:0;transition:opacity .12s;}
.tvh-back:active{opacity:.5;transform:scale(.9);}
.tvh-info{display:flex;align-items:center;gap:4px;min-width:0;overflow:hidden;flex:1;}
.tvh-icon{font-size:14px;flex-shrink:0;line-height:1;}
.tvh-name{font-size:11px;font-weight:900;color:var(--text-primary,#f0f0f0);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:none;}
.tvh-price{font-family:'IBM Plex Mono',monospace;font-size:13px;font-weight:800;color:var(--text-primary,#f0f0f0);flex-shrink:0;transition:color .18s;white-space:nowrap;}
.tvh-price.up{color:#00e676;}
.tvh-price.dn{color:#ff3d3d;}
.tvh-pnl{font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:800;padding:2px 6px;border-radius:6px;white-space:nowrap;flex-shrink:0;display:none;}
.tvh-pnl.pos{background:rgba(0,230,118,.15);color:#00e676;border:1px solid rgba(0,230,118,.3);}
.tvh-pnl.neg{background:rgba(255,61,61,.15);color:#ff3d3d;border:1px solid rgba(255,61,61,.3);}
.tvh-pnl.show{display:inline-block;}
.tvh-cd{font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:800;color:var(--text-secondary,#8a8278);white-space:nowrap;flex-shrink:0;letter-spacing:.3px;}
.tvh-dot{width:7px;height:7px;border-radius:50%;background:#444;flex-shrink:0;transition:background .3s;}
.tvh-dot.on{background:#00e676;box-shadow:0 0 6px #00e676;}
.tvh-dot.wait{background:#ffd600;animation:_tvDt 1.1s ease-in-out infinite;}
.tvh-dot.off{background:#ff3d3d;}
@keyframes _tvDt{0%,100%{opacity:1}50%{opacity:.15}}
.tvh-fs{width:27px;height:27px;border-radius:7px;border:1.5px solid var(--border,#1e1e1e);background:var(--bg-elev,#161616);color:var(--text-secondary,#777);font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .12s;flex-shrink:0;}
.tvh-fs:hover{border-color:var(--ac,#ff8c42);color:var(--ac,#ff8c42);}
.tvh-fs:active{transform:scale(.86);}
#_tvNav{display:flex;align-items:center;gap:3px;padding:4px 8px;background:var(--bg-card,#0d0d0d);border-bottom:1px solid var(--border,#1e1e1e);flex-shrink:0;direction:rtl;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;}
#_tvNav::-webkit-scrollbar{display:none;}
.tvn-btn{display:flex;align-items:center;gap:3px;padding:3px 9px;border-radius:999px;cursor:pointer;border:1.5px solid var(--border,#1e1e1e);background:var(--bg-elev,#161616);white-space:nowrap;flex-shrink:0;transition:all .12s;}
.tvn-btn:active{transform:scale(.88);}
.tvn-icon{font-size:11px;line-height:1;}
.tvn-label{font-family:'Cairo',sans-serif;font-size:10px;font-weight:700;color:var(--text-secondary,#777);}
.tvn-btn.on{border-color:var(--ac,#ff8c42);background:rgba(255,140,66,.13);}
.tvn-btn.on .tvn-label{color:var(--ac,#ff8c42);font-weight:900;}
#_tvTrade{display:flex;align-items:center;gap:5px;padding:6px 8px;background:var(--bg-card,#0d0d0d);border-bottom:1px solid var(--border,#1e1e1e);flex-shrink:0;direction:rtl;}
.tvt-btn{flex:1;min-height:48px;padding:5px 3px;border-radius:11px;border:none;font-family:'Cairo',sans-serif;font-size:13px;font-weight:900;cursor:pointer;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;transition:filter .12s,transform .1s;flex-shrink:0;}
.tvt-btn:active{transform:scale(.91);filter:brightness(.82);}
.tvt-buy{background:linear-gradient(150deg,#00c853,#1b5e20);box-shadow:0 2px 8px rgba(0,200,83,.25);}
.tvt-sell{background:linear-gradient(150deg,#ff1744,#b71c1c);box-shadow:0 2px 8px rgba(255,23,68,.25);}
.tvt-dir{font-size:13px;line-height:1;}
.tvt-px{font-family:'IBM Plex Mono',monospace;font-size:9px;opacity:.7;}
.tvt-mid{flex:1;display:flex;flex-direction:column;align-items:center;gap:1px;min-width:0;}
.tvt-qlbl{font-size:8px;color:var(--text-muted,#444);font-weight:700;letter-spacing:.6px;}
.tvt-qrow{display:flex;align-items:center;gap:4px;}
.tvt-qin{width:72px;font-family:'IBM Plex Mono',monospace;font-size:max(16px,18px);font-weight:700;text-align:center;direction:ltr;background:var(--bg-input,#181818);border:1.5px solid var(--border,#1e1e1e);border-radius:9px;padding:4px 5px;color:var(--text-primary,#f0f0f0);outline:none;transition:border-color .13s;}
.tvt-qin:focus{border-color:var(--ac,#ff8c42);}
.tvt-unit{font-size:10px;font-weight:800;color:var(--text-secondary,#666);white-space:nowrap;}
#_tvChartWrap{flex:1;min-height:0;width:100%;position:relative;overflow:hidden;background:#000;}
#_tvC{position:absolute;inset:0;direction:ltr!important;overflow:hidden;background:#000;}
#_tvC>div{width:100%!important;height:100%!important;}
#_tvC>iframe{width:100%!important;height:100%!important;display:block;}
#_tvOvr{position:absolute;inset:0;z-index:20;background:var(--bg-app,#000);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;transition:opacity .35s ease;pointer-events:all;padding:20px;}
#_tvOvr.fading{opacity:0;pointer-events:none;}
#_tvOvr.gone{display:none;}
.tvovr-icon{font-size:26px;line-height:1;opacity:.55;}
.tvovr-skel{display:flex;align-items:flex-end;gap:4px;height:64px;width:min(78%,240px);}
.tvovr-bar2{flex:1;border-radius:3px 3px 1px 1px;background:linear-gradient(90deg, rgba(255,140,66,.10) 25%, rgba(255,140,66,.32) 45%, rgba(255,140,66,.10) 65%);background-size:300% 100%;animation:_tvShimmer 1.4s ease-in-out infinite;}
@keyframes _tvShimmer{0%{background-position:-135% 0}100%{background-position:135% 0}}
.tvovr-txt{font-family:'Cairo',sans-serif;font-size:12px;font-weight:800;color:var(--text-secondary,#888);text-align:center;}
.tvcf-ov{position:absolute;inset:0;z-index:99;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.65);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);direction:rtl;}
.tvcf-card{background:var(--bg-card,#0d0d0d);border-top:1.5px solid var(--border-strong,#2a2a2a);border-radius:22px 22px 0 0;width:100%;max-width:520px;padding:14px 14px 30px;animation:_tvcfUp .22s cubic-bezier(.4,0,.2,1);}
@keyframes _tvcfUp{from{transform:translateY(100%)}to{transform:none}}
.tvcf-hdl{width:30px;height:3px;background:var(--border-strong,#2a2a2a);border-radius:999px;margin:0 auto 10px;}
.tvcf-title{font-size:16px;font-weight:900;margin-bottom:2px;}
.tvcf-sub{font-size:11px;color:var(--text-secondary,#666);margin-bottom:9px;}
.tvcf-rows{background:var(--bg-input,#181818);border-radius:10px;padding:5px 10px;margin-bottom:10px;}
.tvcf-row{display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border,#1e1e1e);font-size:13px;}
.tvcf-row:last-child{border:none;}
.tvcf-k{color:var(--text-secondary,#666);font-weight:700;}
.tvcf-v{font-family:'IBM Plex Mono',monospace;font-weight:800;color:var(--text-primary,#f0f0f0);}
.tvcf-v.g{color:#00e676;} .tvcf-v.r{color:#ff3d3d;} .tvcf-v.w{color:#ffd600;}
.tvcf-btns{display:grid;grid-template-columns:1fr 1fr;gap:7px;}
.tvcf-cancel{padding:12px;border-radius:999px;border:1.5px solid var(--border-strong,#2a2a2a);background:var(--bg-elev,#161616);color:var(--text-secondary,#777);font-size:13px;font-weight:700;cursor:pointer;font-family:'Cairo',sans-serif;}
.tvcf-exec{padding:12px;border-radius:999px;border:none;color:#fff;font-size:13px;font-weight:900;cursor:pointer;font-family:'Cairo',sans-serif;display:flex;align-items:center;justify-content:center;gap:5px;transition:filter .12s;}
.tvcf-exec:active{filter:brightness(.82);}
.tvcf-exec:disabled{opacity:.5;pointer-events:none;}
.tvcf-exec.g{background:linear-gradient(135deg,#00c853,#1b5e20);}
.tvcf-exec.r{background:linear-gradient(135deg,#ff1744,#b71c1c);}
.tvsp{width:13px;height:13px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:_tvSp .7s linear infinite;}
@keyframes _tvSp{to{transform:rotate(360deg)}}
@media(min-width:400px){.tvh-name{display:block;}.tvt-qin{width:78px;}}
@media(min-width:600px){#_tvHdr{height:48px;padding:0 12px;}.tvh-price{font-size:15px;}.tvh-name{font-size:12px;}.tvh-back{font-size:12px;padding:5px 12px;}.tvt-btn{min-height:52px;font-size:14px;}.tvt-qin{width:90px;font-size:max(16px,20px);}.tvn-label{font-size:11px;}}
@media(min-width:900px){#_tvHdr{height:50px;padding:0 16px;}#_tvNav{padding:5px 12px;gap:5px;}.tvn-btn{padding:4px 12px;}#_tvTrade{padding:7px 12px;gap:8px;}.tvcf-card{border-radius:22px;margin-bottom:20px;}}
`;
    document.head.appendChild(s);
  })();

  /* ══════════ PRICE STATE ══════════ */
  function _setPrice(sym, disp) {
    _prices[sym] = disp;
    if (sym !== _sym) return;
    const el = document.getElementById('_tvPx');
    if (!el) return;
    const prev = parseFloat(el.dataset.p || 0);
    el.textContent = '$' + disp.toFixed(_asset(sym).pxDp);
    el.className = 'tvh-price' + (disp > prev ? ' up' : disp < prev ? ' dn' : '');
    el.dataset.p = disp;
    _updBtnPx(sym, disp);
  }

  function _updBtnPx(sym, mid) {
    if (!mid || sym !== _sym) return;
    const a = _asset(sym);
    const bp = document.getElementById('_tvBuyPx');
    const sp = document.getElementById('_tvSellPx');
    if (bp) bp.textContent = '$' + (mid * 1.0003).toFixed(a.pxDp);
    if (sp) sp.textContent = '$' + (mid * 0.9997).toFixed(a.pxDp);
  }

  function _curPx() {
    return _prices[_sym] || (typeof State !== 'undefined' ? State.prices?.[_sym]?.mid : 0) || 0;
  }

  function _updatePnlBadge() {
    const el = document.getElementById('_tvPnl');
    if (!el || typeof State === 'undefined') return;
    let pnl = null;
    for (const p of (State.positions || [])) {
      const rawC = (p.position.coin || '').includes(':') ? p.position.coin.split(':')[1] : p.position.coin;
      const pSym = rawC === 'GOLD' ? 'XAU' : (typeof COIN_TO_SYM !== 'undefined' ? COIN_TO_SYM[rawC] || rawC : rawC);
      if (pSym === _sym) { pnl = parseFloat(p.position.unrealizedPnl || 0); break; }
    }
    if (pnl === null) {
      el.classList.remove('show', 'pos', 'neg');
      el.textContent = '';
    } else {
      const cls = pnl >= 0 ? 'pos' : 'neg';
      el.className = `tvh-pnl show ${cls}`;
      el.textContent = (pnl >= 0 ? '+' : '') + '$' + Math.abs(pnl).toFixed(2);
    }
  }

  /* ══════════ OVERLAY ══════════ */
  function _ovrShow(sym) {
    const wrap = document.getElementById('_tvChartWrap');
    if (!wrap) return;
    let el = document.getElementById('_tvOvr');
    if (!el) {
      el = document.createElement('div');
      el.id = '_tvOvr';
      wrap.appendChild(el);
    }
    const a = _asset(sym);
    const heights = [38,58,32,66,46,72,40,60,34,52];
    const bars = heights.map(h => `<div class="tvovr-bar2" style="height:${h}%"></div>`).join('');
    el.innerHTML = `
      <span class="tvovr-icon">${a.icon}</span>
      <div class="tvovr-skel">${bars}</div>
      <span class="tvovr-txt">${a.name} — جاري تحميل الرسم البياني...</span>`;
    el.classList.remove('fading', 'gone');
    el.style.opacity = '1';
  }

  function _ovrHide() {
    const el = document.getElementById('_tvOvr');
    if (!el || el.classList.contains('gone')) return;
    el.classList.add('fading');
    setTimeout(() => { el.classList.add('gone'); el.classList.remove('fading'); }, 440);
  }

  /* ══════════ BBO ══════════ */
  function _bboConn(sym) {
    if (_bboSym === sym && _bboUnsub) return;
    _bboClose();
    _bboSym = sym;
    if (typeof HL === 'undefined' || !HL.isOpen()) _dot('wait');
    _bboUnsub = HL.subscribe({ type: 'bbo', coin: _coin(sym) }, data => {
      const b = parseFloat(data.bbo?.[0]?.px || 0);
      const a = parseFloat(data.bbo?.[1]?.px || 0);
      const mid = b && a ? (b + a) / 2 : 0;
      if (!mid) return;
      const raw = (data.coin || '').includes(':') ? data.coin.split(':')[1] : data.coin;
      _setPrice(sym, sym === 'XAU' && raw === 'GOLD' ? mid / TROY : mid);
      _dot('on');
    });
  }

  function _bboClose() {
    if (_bboUnsub) { try { _bboUnsub(); } catch {} _bboUnsub = null; }
    _bboSym = '';
  }

  /* ══════════ AUTO-SAVE ══════════ */
  function _scheduleAutoSave() {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(_doAutoSave, 3000);
  }

  function _doAutoSave() {
    if (!_widget || !_linesReady) return;
    try {
      _widget.save(c => _lsSet(LAYOUT_KEY, { sym: _sym, interval: _interval, content: c, ts: Date.now() }));
    } catch {}
  }

  function _loadLayout() { return _lsGet(LAYOUT_KEY); }

  /* ══════════ ORDER LINES ══════════
     ✅ FIX جوهري — كانت تُرسم عبر chart.createOrderLine() (Order Line
     Tool)، وهذه موثّقة رسمياً حصراً ضمن منتج "Trading Terminal" —
     مختلف عن "Advanced Charts"/"Charting Library" العادي المُستضاف
     فعلياً هنا (chart.kanba.pw/charting_library). النتيجة: النداء لا
     يرمي أي خطأ ظاهر، لكنه لا يرسم شيئاً على الإطلاق بهذا الترخيص —
     بالضبط سبب ظهور الخطوط بالنسخة القديمة (Lightweight Charts، بلا
     أي قيد ترخيص) وغيابها التام هنا رغم نفس منطق الحساب حرفياً.
     البديل: chart.createShape() بنوع 'horizontal_line' — جزء أساسي من
     Drawings API متاح في كل نسخ Charting Library/Advanced Charts بلا
     استثناء وبلا أي ترخيص إضافي. الإزالة عبر chart.removeEntity(id)
     بدل .remove() القديمة على كائن order line غير الموجود فعلياً.
  ══════════════════════════════════════════════════════════════ */
  function _clearLines() {
    if (!_widget) { _lines = []; return; }
    let chart;
    try { chart = _widget.chart(); } catch { _lines = []; return; }
    _lines.forEach(id => { try { chart.removeEntity(id); } catch {} });
    _lines = [];
  }

  function _scheduleLines() {
    if (_linesReady) _execLines();
    else _linesPending = true;
  }

  /* رسم خط أفقي واحد ثابت (بلا تحديد/حفظ/تراجع من المستخدم) — يغطي كل
     أنواع الخطوط الخمسة (Entry/TP/SL/Liq/أوامر معلّقة) بنفس الدالة. */
  function _drawLine(chart, price, text, color, style, textColor) {
    try {
      const id = chart.createShape(
        { time: Math.floor(Date.now() / 1000), price },
        {
          shape: 'horizontal_line',
          text,
          lock: true,
          disableSelection: true,
          disableSave: true,
          disableUndo: true,
          zOrder: 'top',
          overrides: {
            linecolor: color, linewidth: 1, linestyle: style,
            showLabel: true, textcolor: textColor || '#fff',
            horzLabelsAlign: 'right', vertLabelsAlign: 'bottom',
            bold: true, fontsize: 11,
          },
        }
      );
      if (id != null) _lines.push(id);
    } catch (e) { console.warn('[L]', text, e); }
  }

  function _execLines() {
    if (!_linesReady || !_widget || typeof State === 'undefined') return;
    let chart;
    try { chart = _widget.chart(); } catch { return; }
    if (!chart) return;
    _clearLines();

    for (const p of (State.positions || [])) {
      const rawC = (p.position.coin || '').includes(':') ? p.position.coin.split(':')[1] : p.position.coin;
      const pSym = rawC === 'GOLD' ? 'XAU' : (typeof COIN_TO_SYM !== 'undefined' ? COIN_TO_SYM[rawC] || rawC : rawC);
      if (pSym !== _sym) continue;
      const pos = p.position, sziOz = parseFloat(pos.szi || 0);
      if (!sziOz) continue;
      const isGr = _isGram(_sym), entOz = parseFloat(pos.entryPx || 0), entD = _toDisp(_sym, entOz);
      const pnl = parseFloat(pos.unrealizedPnl || 0), isLong = sziOz > 0, tpsl = p.tpsl || {};
      const pnlCol = pnl >= 0 ? '#00e676' : '#ff3d3d';

      if (entD > 0) {
        _drawLine(chart, entD, `${isLong ? '▲' : '▼'}  ${pnl >= 0 ? '+' : ''}$${Math.abs(pnl).toFixed(2)}`,
                  pnlCol, 0, pnl >= 0 ? '#000' : '#fff');
      }
      if (tpsl.tp) {
        const tpD = _toDisp(_sym, tpsl.tp), tpPnl = (Math.abs(sziOz) * Math.abs(tpsl.tp - entOz)).toFixed(2);
        _drawLine(chart, tpD, `🎯 TP  +$${tpPnl}`, '#00e8a2', 2, '#000');
      }
      if (tpsl.sl) {
        const slD = _toDisp(_sym, tpsl.sl), slPnl = (Math.abs(sziOz) * Math.abs(tpsl.sl - entOz)).toFixed(2);
        _drawLine(chart, slD, `🛡 SL  -$${slPnl}`, '#ff6a1a', 2, '#fff');
      }
      /* سعر التصفية: يقرأ position.liquidationPx مباشرة من الـAPI أولاً
         (موثّق رسمياً ضمن clearinghouseState — أدق من أي حساب محلي).
         calcLiqPrice المحلي احتياط نادر فقط لو غاب الحقل. */
      try {
        const apiLiqOz = parseFloat(pos.liquidationPx || 0);
        let liqOz = apiLiqOz > 0 ? apiLiqOz : null;
        if (!liqOz) {
          const aL = isGr ? ((typeof ASSETS !== 'undefined' && ASSETS['GOLD']) || _asset('GOLD')) : _asset(_sym);
          const eq = (typeof crossEquityExcluding === 'function') ? crossEquityExcluding(pnl) : 0;
          liqOz = (typeof calcLiqPrice === 'function') ? calcLiqPrice(entOz, sziOz, eq, aL.cross, aL.lev) : null;
        }
        if (liqOz && liqOz > 0) {
          _drawLine(chart, _toDisp(_sym, liqOz), '⚡ تصفية', '#ff3d3d', 1, '#fff');
        }
      } catch (e) { console.warn('[L]liq', e); }
      break;
    }

    for (const o of (State.openOrders || [])) {
      const rawC = (o.coin || '').includes(':') ? o.coin.split(':')[1] : o.coin;
      const oSym = rawC === 'GOLD' ? 'XAU' : (typeof COIN_TO_SYM !== 'undefined' ? COIN_TO_SYM[rawC] || rawC : rawC);
      if (oSym !== _sym) continue;
      const px = parseFloat(o.limitPx || o.triggerPx || 0);
      if (!px) continue;
      const dispPx = _toDisp(_sym, px), isBuy = o.side === 'B', isTrig = !!o.isTrigger;
      const ot = (o.orderType || '').toLowerCase();
      let label, color, textCol;
      if (isTrig) {
        if (ot.includes('take profit') || ot.includes('tp')) { label = `🎯 TP ${isBuy ? '▲' : '▼'}`; color = '#00e8a2'; textCol = '#000'; }
        else if (ot.includes('stop')) { label = `🛡 SL ${isBuy ? '▲' : '▼'}`; color = '#ff6a1a'; textCol = '#fff'; }
        else { label = `⏹ ${isBuy ? '▲' : '▼'}`; color = '#ffd600'; textCol = '#000'; }
      } else if (isBuy) { label = '📋 شراء'; color = '#00e676'; textCol = '#fff'; }
      else { label = '📋 بيع'; color = '#ff3d3d'; textCol = '#fff'; }
      _drawLine(chart, dispPx, label, color, isTrig ? 2 : 0, textCol);
    }

    _updatePnlBadge();
  }

  /* ══════════ SAVE/LOAD ADAPTER ══════════ */
  function _buildSLA(sym) {
    const K = 'sla_' + sym + '_';
    const g = k => _lsGet(K + k) || [];
    const sv = (k, v) => _lsSet(K + k, v);
    return {
      getAllCharts() { return Promise.resolve(g('_c')); },
      removeChart(id) { sv('_c', g('_c').filter(x => x.id !== id)); return Promise.resolve(); },
      saveChart(d) { sv('_c', [{ ...d, id: 'auto', timestamp: Date.now() }]); return Promise.resolve('auto'); },
      getChartContent(id) { const i = g('_c').find(x => x.id === id); return Promise.resolve(i?.content || ''); },
      getAllStudyTemplates() { return Promise.resolve(g('_st')); },
      removeStudyTemplate(n) { sv('_st', g('_st').filter(x => x.name !== n)); return Promise.resolve(); },
      saveStudyTemplate(t) { const d = g('_st'), i = d.findIndex(x => x.name === t.name); if (i >= 0) d[i] = t; else d.push(t); sv('_st', d); return Promise.resolve(); },
      getStudyTemplateContent(n) { const i = g('_st').find(x => x.name === n); return Promise.resolve(i?.content || ''); },
      getDrawingTemplates(t) { return Promise.resolve(g('_dt' + t)); },
      loadDrawingTemplate(t, n) { const i = g('_dt' + t).find(x => x.name === n); return Promise.resolve(i?.content || ''); },
      removeDrawingTemplate(t, n) { sv('_dt' + t, g('_dt' + t).filter(x => x.name !== n)); return Promise.resolve(); },
      saveDrawingTemplate(t, n, c) { const d = g('_dt' + t), i = d.findIndex(x => x.name === n); const it = { name: n, content: c }; if (i >= 0) d[i] = it; else d.push(it); sv('_dt' + t, d); return Promise.resolve(); },
    };
  }

  /* ══════════ WIDGET BUILDER ══════════ */
  function _mkWidget(sym, iv, saved) {
    if (!window.TradingView?.widget) { console.error('[chart.js] TV not loaded'); return null; }
    const dark = _dark();
    const scaleFont = window.innerWidth >= 600 ? 13 : 12;
    const a = _asset(sym);
    const cfg = {
      container: '_tvC', autosize: true,
      symbol: sym, interval: iv,
      datafeed: _datafeed,
      library_path: 'https://chart.kanba.pw/charting_library/',
      locale: 'en',
      timezone: 'Asia/Kuwait',   // display only — data is always UTC
      theme: dark ? 'Dark' : 'Light',
      overrides: {
        'paneProperties.background': dark ? '#000000' : '#F9F9F9',
        'paneProperties.backgroundType': 'solid',
        'paneProperties.vertGridProperties.color': dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)',
        'paneProperties.horzGridProperties.color': dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)',
        'paneProperties.vertGridProperties.style': 0,
        'paneProperties.horzGridProperties.style': 0,
        'paneProperties.crossHairProperties.color': '#888',
        'paneProperties.crossHairProperties.style': 2,
        'paneProperties.crossHairProperties.width': 1,
        'mainSeriesProperties.candleStyle.upColor': '#00e676',
        'mainSeriesProperties.candleStyle.downColor': '#ff3d3d',
        'mainSeriesProperties.candleStyle.drawBorder': true,
        'mainSeriesProperties.candleStyle.borderUpColor': '#00e676',
        'mainSeriesProperties.candleStyle.borderDownColor': '#ff3d3d',
        'mainSeriesProperties.candleStyle.wickUpColor': '#00e676',
        'mainSeriesProperties.candleStyle.wickDownColor': '#ff3d3d',
        'mainSeriesProperties.showPriceLine': true,
        'mainSeriesProperties.priceLineColor': '#ff8c42',
        'mainSeriesProperties.priceLineWidth': 1,
        /* ✅ FIX — معطَّل عمداً. آلية showCountdown الداخلية لمكتبة
           TradingView تخمّن إغلاق الشمعة بمقارنة آخر بار مع Date.now()
           الخام بمعزل عن الـDatafeed — هي نفسها مصدر انحراف "الشمعة
           المتقدّمة"، لا شيء بجانبنا. العدّاد الآن عنصر DOM مستقل تماماً
           (#_tvCd) بمعادلة الملف بدون مكتبة حرفياً — راجع _updateCountdown. */
        'mainSeriesProperties.showCountdown': false,
        'scalesProperties.fontSize': scaleFont,
        'scalesProperties.textColor': dark ? '#999' : '#444',
        'scalesProperties.lineColor': dark ? '#222' : '#ddd',
        'scalesProperties.backgroundColor': dark ? '#000' : '#F9F9F9',
      },
      studies_overrides: {},
      disabled_features: [
        'header_symbol_search', 'symbol_search_hot_key',
        'header_compare', 'symbol_info',
        'border_around_the_chart', 'display_market_status', 'go_to_date',
        'create_volume_indicator_by_default', 'volume_force_overlay',
      ],
      enabled_features: [
        'study_templates', 'side_toolbar_in_fullscreen_mode', 'header_in_fullscreen_mode',
        'horz_touch_drag_scroll', 'vert_touch_drag_scroll', 'pinch_scale',
        'axis_pressed_mouse_move_scale', 'axis_double_clicked_reset_scale',
        'shift_visible_range_on_new_bar', 'pre_post_market_sessions',
        'items_favoriting', 'show_hide_button_in_legend', 'hide_last_na_study_output',
        'adaptive_logo', 'move_logo_to_main_pane', 'end_of_period_timescale_marks',
        'use_localstorage_for_settings', 'save_chart_properties_to_local_storage',
        'chart_property_page_style', 'chart_property_page_scales',
        'chart_property_page_background', 'chart_property_page_timezone_sessions',
        'chart_property_page_trading',
        'force_touch_drag', 'iframe_loading_compatibility_mode',
      ],
      save_load_adapter: _buildSLA(sym),
      loading_screen: {
        backgroundColor: dark ? '#000000' : '#F9F9F9',
        foregroundColor: dark ? '#ff8c42' : '#c96442',
      },
      client_id: 'suyula_hl', user_id: 'trader',
      charts_storage_api_version: '1.1',
      fullscreen: false, debug: false,
    };
    if (saved) cfg.saved_data = saved;
    return new window.TradingView.widget(cfg);
  }

  /* ══════════ CHART INIT (full teardown+rebuild) ══════════ */
  function _initChart(sym, iv, saved) {
    _ovrShow(sym);
    _linesReady = false; _linesPending = false; _widgetReady = false;

    if (_widget) {
      _clearLines();
      try { _widget.remove(); } catch {}
      _widget = null;
    }
    if (_datafeed) {
      _datafeed.destroy();
      _datafeed = null;
    }

    const c = document.getElementById('_tvC');
    if (c) c.innerHTML = '';

    _datafeed = new HyperliquidDatafeed();
    _widget = _mkWidget(sym, iv, saved);
    if (!_widget) { _ovrHide(); return; }

    _widget.onChartReady(() => {
      _linesReady = true; _widgetReady = true;
      setTimeout(_ovrHide, 200);
      _execLines();
      if (_linesPending) { _linesPending = false; _execLines(); }

      try {
        _widget.chart().onIntervalChanged().subscribe(null, newIv => {
          _interval = newIv;
          _lsSet('iv_' + _sym, newIv);
          _updateCountdown();
          _scheduleAutoSave();
          setTimeout(_execLines, 300);
        });
      } catch {}

      try { _widget.subscribe('onAutoSaveNeeded', _scheduleAutoSave); } catch {}
      setTimeout(_doAutoSave, 5000);
    });
  }

  /* ══════════ ASSET NAV ══════════ */
  function _buildNav() {
    document.getElementById('_tvNav')?.remove();
    const nav = document.createElement('div');
    nav.id = '_tvNav';
    nav.innerHTML = NAV_ASSETS.map(a =>
      `<button class="tvn-btn${a.sym === _sym ? ' on' : ''}" data-sym="${a.sym}">
         <span class="tvn-icon">${a.icon}</span>
         <span class="tvn-label">${a.ar}</span>
       </button>`
    ).join('');
    const scr = document.getElementById('chartScreen');
    const trd = document.getElementById('_tvTrade');
    const wrap = document.getElementById('_tvChartWrap');
    if (scr && trd) scr.insertBefore(nav, trd);
    else if (scr && wrap) scr.insertBefore(nav, wrap);
    nav.querySelectorAll('.tvn-btn').forEach(b => b.onclick = () => {
      const s = b.dataset.sym;
      if (!s || s === _sym) return;
      ChartModule.switchAssetChart(s);
      if (typeof switchAsset === 'function') switchAsset(s);
    });
  }

  function _setNavOn(sym) {
    document.querySelectorAll('.tvn-btn').forEach(b => b.classList.toggle('on', b.dataset.sym === sym));
  }

  /* ══════════ TRADE BAR ══════════ */
  function _buildTrade() {
    document.getElementById('_tvTrade')?.remove();
    const a = _asset(_sym), defQ = _lsGet('qty_' + _sym) || a.presets?.[0] || 1;
    const bar = document.createElement('div');
    bar.id = '_tvTrade';
    bar.innerHTML = `
      <button class="tvt-btn tvt-sell" id="_tvSell">
        <span class="tvt-dir">▼ بيع</span>
        <span class="tvt-px" id="_tvSellPx">—</span>
      </button>
      <div class="tvt-mid">
        <span class="tvt-qlbl">الكمية</span>
        <div class="tvt-qrow">
          <input class="tvt-qin" id="_tvQty" type="number" value="${defQ}" min="0" step="any" inputmode="decimal">
          <span class="tvt-unit">${a.unit || ''}</span>
        </div>
      </div>
      <button class="tvt-btn tvt-buy" id="_tvBuy">
        <span class="tvt-dir">▲ شراء</span>
        <span class="tvt-px" id="_tvBuyPx">—</span>
      </button>`;
    const scr = document.getElementById('chartScreen');
    const wrap = document.getElementById('_tvChartWrap');
    if (scr && wrap) scr.insertBefore(bar, wrap);
    document.getElementById('_tvQty').addEventListener('change', function () {
      const v = parseFloat(this.value); if (v > 0) _lsSet('qty_' + _sym, v);
    });
    document.getElementById('_tvBuy').onclick = () => _showCf(true);
    document.getElementById('_tvSell').onclick = () => _showCf(false);
    const p = _curPx(); if (p) _setPrice(_sym, p);
  }

  /* ══════════ CONFIRM SHEET ══════════ */
  function _showCf(isBuy) {
    if (typeof State === 'undefined' || !State.wallet)
      return typeof toast !== 'undefined' && toast('سجّل الدخول أولاً', 'err');
    const qty = parseFloat(document.getElementById('_tvQty')?.value || 0);
    if (!qty || qty <= 0) return typeof toast !== 'undefined' && toast('أدخل الكمية', 'err');
    const a = _asset(_sym), isGr = _isGram(_sym), mid = _curPx();
    if (!mid) return typeof toast !== 'undefined' && toast('لا يوجد سعر', 'err');
    const midOz = _toOz(_sym, mid), qtyOz = isGr ? qty / TROY : qty;
    const usd = (midOz * qtyOz).toFixed(2), mgn = (midOz * qtyOz / a.lev).toFixed(2);
    const sziLiqOz = isBuy ? qtyOz : -qtyOz;
    const eq       = (typeof crossEquityExcluding === 'function') ? crossEquityExcluding(0) : 0;
    const liqOz    = (typeof calcLiqPrice === 'function') ? calcLiqPrice(midOz, sziLiqOz, eq, a.cross, a.lev) : null;
    const liqD     = liqOz ? _toDisp(_sym, liqOz).toFixed(a.pxDp) : null;
    _hideCf();
    const scr = document.getElementById('chartScreen'); if (!scr) return;
    const ov = document.createElement('div'); ov.id = '_tvcfOv'; ov.className = 'tvcf-ov';
    ov.innerHTML = `
      <div class="tvcf-card">
        <div class="tvcf-hdl"></div>
        <div class="tvcf-title" style="color:${isBuy ? '#00e676' : '#ff3d3d'}">${a.icon} ${isBuy ? 'شراء ▲' : 'بيع ▼'} — ${a.name}</div>
        <div class="tvcf-sub">رافعة ${a.lev}x · تأكيد قبل التنفيذ</div>
        <div class="tvcf-rows">
          <div class="tvcf-row"><span class="tvcf-k">الكمية</span><span class="tvcf-v">${qty.toFixed(a.szDp)} ${a.unit}</span></div>
          <div class="tvcf-row"><span class="tvcf-k">السعر</span><span class="tvcf-v">$${mid.toFixed(a.pxDp)}</span></div>
          <div class="tvcf-row"><span class="tvcf-k">القيمة</span><span class="tvcf-v">≈ $${usd}</span></div>
          <div class="tvcf-row"><span class="tvcf-k">الهامش</span><span class="tvcf-v w">≈ $${mgn}</span></div>
          <div class="tvcf-row"><span class="tvcf-k">التصفية</span><span class="tvcf-v ${isBuy ? 'r' : 'g'}">${liqD ? '≈ $'+liqD : '—'}</span></div>
        </div>
        <div class="tvcf-btns">
          <button class="tvcf-cancel" id="_tvcfC">إلغاء ✕</button>
          <button class="tvcf-exec ${isBuy ? 'g' : 'r'}" id="_tvcfX">${isBuy ? '✅ تأكيد الشراء' : '✅ تأكيد البيع'}</button>
        </div>
      </div>`;
    scr.appendChild(ov);
    ov.onclick = e => { if (e.target === ov) _hideCf(); };
    document.getElementById('_tvcfC').onclick = _hideCf;
    document.getElementById('_tvcfX').onclick = () =>
      typeof requirePin !== 'undefined' ? requirePin(() => _execTrade(isBuy, qty)) : _execTrade(isBuy, qty);
  }

  function _hideCf() { document.getElementById('_tvcfOv')?.remove(); }

  async function _execTrade(isBuy, qty) {
    if (!State?.wallet) return;
    const btn = document.getElementById('_tvcfX');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="tvsp"></span>'; }
    const isGr = _isGram(_sym);
    const aApi = isGr ? ((typeof ASSETS !== 'undefined' && ASSETS['GOLD']) || _asset('GOLD')) : _asset(_sym);
    const mid = _curPx(), midOz = _toOz(_sym, mid);
    if (!midOz) { _hideCf(); return; }
    const qtyOz = isGr ? qty / TROY : qty;
    try {
      try { await hlExchange({ type: 'updateLeverage', asset: aApi.idx, isCross: aApi.cross, leverage: aApi.lev }); } catch {}
      await hlExchange({
        type: 'order',
        orders: [{
          a: aApi.idx, b: isBuy,
          p: wirePx(midOz * (isBuy ? 1.02 : 0.98), aApi.szDp),
          s: wireSz(qtyOz, aApi.szDp),
          r: false,
          t: { limit: { tif: 'Ioc' } }
        }],
        grouping: 'na'
      });
      _hideCf();
      const disp = isGr ? qty.toFixed(2) + ' غرام' : qty.toFixed(aApi.szDp) + ' ' + (aApi.unit || '');
      if (typeof toast !== 'undefined') toast(`✅ ${aApi.icon} ${isBuy ? 'شراء' : 'بيع'} ${disp}`, 'ok', 4000);
      if (typeof _multiPoll !== 'undefined') setTimeout(_multiPoll, 2000);
    } catch (e) {
      if (typeof toast !== 'undefined')
        toast(typeof tradeErr !== 'undefined' ? tradeErr(e.message) : '❌ ' + e.message.slice(0, 100), 'err', 5000);
      if (btn) { btn.disabled = false; btn.innerHTML = isBuy ? '✅ تأكيد الشراء' : '✅ تأكيد البيع'; }
    }
  }

  /* ══════════ DOM ══════════ */
  function _ensureScreen() {
    const scr = document.getElementById('chartScreen');
    if (!scr || document.getElementById('_tvHdr')) return;

    document.addEventListener('fullscreenchange', () => {
      const btn = document.getElementById('_tvFsBtn');
      if (btn) btn.title = document.fullscreenElement ? 'خروج ملء الشاشة' : 'ملء الشاشة';
    });

    const hdr = document.createElement('nav');
    hdr.id = '_tvHdr';
    hdr.innerHTML = `
      <div class="tvh-l">
        <button class="tvh-back" id="_tvBack">← رجوع</button>
        <div class="tvh-info">
          <span id="_tvIcon" class="tvh-icon">🛢</span>
          <span id="_tvName" class="tvh-name">—</span>
          <span id="_tvPx" class="tvh-price" data-p="0">—</span>
          <span id="_tvPnl" class="tvh-pnl"></span>
        </div>
      </div>
      <div class="tvh-r">
        <span id="_tvCd" class="tvh-cd">⏱ —</span>
        <button class="tvh-fs" id="_tvFsBtn" title="ملء الشاشة">⛶</button>
        <div class="tvh-dot wait" id="_tvDot"></div>
      </div>`;
    scr.prepend(hdr);

    const wrap = document.createElement('div');
    wrap.id = '_tvChartWrap';
    const tvC = document.createElement('div');
    tvC.id = '_tvC';
    wrap.appendChild(tvC);
    scr.appendChild(wrap);

    document.getElementById('_tvBack').onclick = () => ChartModule.close();
    document.getElementById('_tvFsBtn').onclick = () => {
      const el = document.getElementById('chartScreen');
      if (!el) return;
      document.fullscreenElement ? document.exitFullscreen?.() : el.requestFullscreen?.().catch(() => {});
    };
  }

  function _setHdr(sym) {
    const a = _asset(sym);
    const ic = document.getElementById('_tvIcon');
    const nm = document.getElementById('_tvName');
    if (ic) ic.textContent = a.icon;
    if (nm) nm.textContent = a.name;
    const p = _prices[sym] || (typeof State !== 'undefined' ? State.prices?.[sym]?.mid : 0) || 0;
    const el = document.getElementById('_tvPx');
    if (el) {
      if (p) { el.textContent = '$' + p.toFixed(a.pxDp); el.dataset.p = p; el.className = 'tvh-price'; _updBtnPx(sym, p); }
      else { el.textContent = '—'; el.dataset.p = '0'; el.className = 'tvh-price'; }
    }
    _updatePnlBadge();
  }

  function _dot(cls) {
    const e = document.getElementById('_tvDot');
    if (e) e.className = 'tvh-dot ' + cls;
  }

  /* ══════════ PUBLIC API ══════════ */
  function open(sym) {
    const targetSym = sym || (typeof State !== 'undefined' ? State.asset : 'CL') || 'CL';
    _visible = true;
    _ensureScreen();
    document.getElementById('chartScreen')?.classList.remove('hidden');

    if (_widget && _widgetReady) {
      _linesReady = true;
      if (targetSym !== _sym) {
        switchAssetChart(targetSym);
      } else {
        _setHdr(_sym); _setNavOn(_sym);
        _execLines();
      }
      _dot('wait'); _bboConn(_sym);
      _ovrHide();
      _restartLiveClock();
      return;
    }

    _sym = targetSym;
    const saved = _loadLayout();
    const useSaved = saved && saved.sym === _sym && saved.content;
    const savedIv = _lsGet('iv_' + _sym);
    _interval = useSaved && saved.interval ? saved.interval : (savedIv && TV_TO_HL[savedIv] ? savedIv : '60');

    _setHdr(_sym); _buildTrade(); _buildNav();

    requestAnimationFrame(() => requestAnimationFrame(() => {
      _initChart(_sym, _interval, useSaved ? saved.content : null);
    }));

    _dot('wait'); _bboConn(_sym);
    _restartLiveClock();
  }

  /* ✅ عدّاد تنازلي مستقل بالكامل عن TradingView — نفس معادلة الملف
     بدون مكتبة حرفياً (Math.ceil(Date.now()/ms)*ms - Date.now()، بلا
     أي تصحيح/تخمين). راجع تعليق رأس الملف — showCountdown الداخلية
     للمكتبة كانت هي مصدر انحراف "الشمعة المتقدّمة" المتبقي. */
  function _updateCountdown() {
    const el = document.getElementById('_tvCd');
    if (!el) return;
    const ms   = RES_MS[_interval] || 60000;
    const diff = Math.ceil(Date.now() / ms) * ms - Date.now();
    const hh = Math.floor(diff / 3600000);
    const mm = Math.floor((diff % 3600000) / 60000);
    const ss = Math.floor((diff % 60000) / 1000);
    el.textContent = '⏱ ' + (hh > 0 ? hh + ':' : '') + String(mm).padStart(2,'0') + ':' + String(ss).padStart(2,'0');
  }

  function _restartLiveClock() {
    clearInterval(_clockTimer);
    _updateCountdown();
    _clockTimer = setInterval(() => {
      _updateCountdown();
      if (!_visible || typeof State === 'undefined') return;
      const p = State.prices?.[_sym]?.mid;
      if (p) _setPrice(_sym, p);
      if (Date.now() % 3000 < 1100) { _updatePnlBadge(); _scheduleLines(); }
    }, 1000);
  }

  function close() {
    _visible = false; _linesReady = false;
    clearInterval(_clockTimer); clearTimeout(_saveTimer);
    _doAutoSave(); _bboClose(); _hideCf(); _clearLines();
    if (document.fullscreenElement) document.exitFullscreen?.();
    document.getElementById('chartScreen')?.classList.add('hidden');
    const ov = document.getElementById('_tvOvr');
    if (ov && !ov.classList.contains('gone')) ov.classList.add('gone');
  }

  function switchInterval(iv) {
    if (!iv || iv === _interval) return;
    _interval = iv; _lsSet('iv_' + _sym, iv);
    _updateCountdown();
    try {
      _widget?.chart?.().setResolution?.(iv);
    } catch {
      requestAnimationFrame(() => {
        _clearLines();
        if (_widget) { try { _widget.remove(); } catch {} _widget = null; }
        if (_datafeed) { _datafeed.destroy(); _datafeed = null; }
        _initChart(_sym, iv, null);
      });
    }
  }

  function switchAssetChart(sym) {
    if (!_visible || sym === _sym) return;
    _doAutoSave();
    _sym = sym;
    _setHdr(sym); _setNavOn(sym); _buildTrade(); _bboConn(sym);

    const saved = _loadLayout();
    const useSaved = saved && saved.sym === sym && saved.content;
    const savedIv = _lsGet('iv_' + sym);
    const nextIv = useSaved && saved.interval ? saved.interval : (savedIv && TV_TO_HL[savedIv] ? savedIv : '60');

    if (_widget && _linesReady) {
      try {
        const ch = _widget.chart();
        if (ch && typeof ch.setSymbol === 'function') {
          _ovrShow(sym);
          ch.setSymbol(sym, () => {
            try {
              if (nextIv !== _interval && typeof ch.setResolution === 'function') ch.setResolution(nextIv);
            } catch {}
            _interval = nextIv;
            _lsSet('iv_' + sym, nextIv);
            _linesReady = true;
            _updateCountdown();
            setTimeout(_ovrHide, 150);
            _execLines();
          });
          return;
        }
      } catch (e) {
        console.warn('[chart] setSymbol failed, falling back to full reinit', e);
      }
    }

    _interval = nextIv;
    _updateCountdown();
    requestAnimationFrame(() => { _initChart(sym, _interval, useSaved ? saved.content : null); });
  }

  function refreshLines() { if (_visible) _scheduleLines(); }

  return { open, close, switchInterval, switchAssetChart, refreshLines };
})();
