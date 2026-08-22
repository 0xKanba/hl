/* ═══════════════════════════════════════════════════════════════
   js/chart/datafeed.js — TradingView Datafeed API implementation
   طبقة البيانات فقط (getBars/subscribeBars/...) — بلا أي منطق واجهة.
   نفس منطق chart.js القديم حرفياً (راجع تعليقات الدقة الزمنية بالأسفل)،
   فقط منقول لملف مستقل ومُعاد توصيله بـCM (راجع state.js لسبب هذا).
═══════════════════════════════════════════════════════════════ */
'use strict';
var CM = window.__cm = window.__cm || {};

(function () {

  /* Single class implementing the exact TradingView Datafeed API.
     Per-subscriber lastBar cache, deduplicated emissions, weekly
     aggregation from daily WS, clean destroy(). */
  function HyperliquidDatafeed() {
    this._subs = new Map();      // uid  → {sym,res,callback,wsKey,lastBar}
    this._ws   = new Map();      // wsKey → {unsub,lastBar,dailyMap}
  }

  HyperliquidDatafeed.prototype.onReady = function (cb) {
    setTimeout(function () {
      cb({
        supported_resolutions: CM.TV_RESOLUTIONS,
        currency_codes: ['USD'],
        exchanges: [{ value: 'HL', name: 'Hyperliquid', desc: 'Hyperliquid Perps' }],
        symbols_types: [{ name: 'Perp', value: 'perp' }],
        supports_search: false,
        supports_group_request: false,
        supports_marks: false,
        supports_timescale_marks: false,
        supports_time: false,
      });
    }, 0);
  };

  HyperliquidDatafeed.prototype.searchSymbols = function () {};

  HyperliquidDatafeed.prototype.resolveSymbol = function (name, onOk, onErr) {
    var a = CM.asset(name);
    setTimeout(function () {
      onOk({
        name: name, ticker: name, description: a.name || name, type: 'crypto', session: '24x7',
        timezone: 'Etc/UTC',          // data timestamps are pure UTC
        minmov: 1,
        pricescale: Math.pow(10, a.pxDp || 2),
        has_intraday: true,
        has_daily: true,
        has_weekly_and_monthly: true,
        intraday_multipliers: ['1', '3', '5', '15', '30', '60', '120', '240'],
        supported_resolutions: CM.TV_RESOLUTIONS,
        volume_precision: 4,
        data_status: 'streaming',
        exchange: 'Hyperliquid',
        listed_exchange: 'Hyperliquid',
        format: 'price',
        currency_code: 'USD',
      });
    }, 0);
  };

  HyperliquidDatafeed.prototype.getBars = async function (symbolInfo, resolution, periodParams, onHistory, onError) {
    var self = this;
    var sym  = symbolInfo.name;
    var coin = CM.coin(sym);
    var isW  = resolution === '1W';
    var hlIv = isW ? '1d' : (CM.TV_TO_HL[resolution] || '1h');
    var fromMs = Math.max(periodParams.from * 1000, CM.MIN_TIME);
    /* حد صارم Date.now() — بلا أي هامش مستقبلي من جهتنا نحن. */
    var toMs   = Math.min(periodParams.to * 1000, Date.now());

    if (fromMs >= toMs) { onHistory([], { noData: true }); return; }

    try {
      /* تحويل الغرام يعتمد على الرمز المعروض (XAU) لا على العملة
         (xyz:GOLD) — لأن "الذهب أونصة" (GOLD) يشترك بنفس العملة. */
      var raw  = await self._fetchRest(coin, hlIv, fromMs, toMs, CM.isGram(sym));
      var bars = isW ? self._aggWeekly(raw) : raw;

      if (!bars.length) { onHistory([], { noData: true }); return; }

      // Seed WS lastBar so the first realtime tick merges instead of dupes
      var wk = self._key(coin, isW ? '1d' : hlIv, CM.isGram(sym));
      var s  = self._ws.get(wk);
      if (s) s.lastBar = Object.assign({}, bars[bars.length - 1]);

      onHistory(bars, { noData: false });
    } catch (e) {
      console.error('[DF getBars]', e);
      onError(e.message);
    }
  };

  HyperliquidDatafeed.prototype.subscribeBars = function (symbolInfo, resolution, onRealtime, uid, onReset) {
    var sym  = symbolInfo.name;
    var coin = CM.coin(sym);
    var isW  = resolution === '1W';
    var hlIv = isW ? '1d' : (CM.TV_TO_HL[resolution] || '1h');
    /* مفتاح البث يفصل الأونصة عن الغرام رغم اشتراكهما بنفس العملة،
       حتى لا تختلط وحدات lastBar بين الرسمين. */
    var wsKey = this._key(coin, hlIv, CM.isGram(sym));

    this._subs.set(uid, { sym: sym, resolution: resolution, callback: onRealtime, wsKey: wsKey, lastBar: null });

    if (!this._ws.has(wsKey)) this._openWs(wsKey, coin, hlIv, CM.isGram(sym));
  };

  HyperliquidDatafeed.prototype.unsubscribeBars = function (uid) {
    var sub = this._subs.get(uid);
    if (!sub) return;
    this._subs.delete(uid);

    var need = false;
    for (var it = this._subs.values(), r; !(r = it.next()).done;) {
      if (r.value.wsKey === sub.wsKey) { need = true; break; }
    }
    if (!need) {
      var w = this._ws.get(sub.wsKey);
      if (w) { try { w.unsub(); } catch (e) {} this._ws.delete(sub.wsKey); }
    }
  };

  HyperliquidDatafeed.prototype.destroy = function () {
    for (var it = this._ws.values(), r; !(r = it.next()).done;) {
      try { r.value.unsub(); } catch (e) {}
    }
    this._ws.clear();
    this._subs.clear();
  };

  /* ── internals ── */
  HyperliquidDatafeed.prototype._key = function (coin, res, gram) { return coin + ':' + res + ':' + (gram ? 'g' : 'o'); };

  /*
    Build a bar from a Hyperliquid candle object.
    Hyperliquid t is OPEN time in both REST and WS (confirmed:
    Candle{ t: open millis; T: close millis } — T = t + duration - 1,
    an inclusive-end convention; we never read T, only t).
    No subtraction needed — use t directly.
  */
  HyperliquidDatafeed.prototype._bar = function (candle, sym, res) {
    var g = CM.isGram(sym);
    var t = candle.t > 1e12 ? candle.t : candle.t * 1000;
    var time = CM.normTime(t, res);
    return {
      time: time,
      open:  g ? parseFloat(candle.o) / CM.TROY : parseFloat(candle.o),
      high:  g ? parseFloat(candle.h) / CM.TROY : parseFloat(candle.h),
      low:   g ? parseFloat(candle.l) / CM.TROY : parseFloat(candle.l),
      close: g ? parseFloat(candle.c) / CM.TROY : parseFloat(candle.c),
      volume: parseFloat(candle.v) || 0,
    };
  };

  HyperliquidDatafeed.prototype._fetchRest = async function (coin, hlIv, fromMs, toMs, gram) {
    gram = gram === true;   // ← لا يعتمد على العملة بعد الآن
    var r = await fetch(CM.HL_API + '/info', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'candleSnapshot', req: { coin: coin, interval: hlIv, startTime: fromMs, endTime: toMs } })
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    var data = await r.json();
    if (!Array.isArray(data)) return [];

    // Map HL interval back to TV resolution for normalization
    var tvRes = Object.keys(CM.TV_TO_HL).find(function (k) { return CM.TV_TO_HL[k] === hlIv; }) || '60';
    var seen = new Set();
    var out = [];

    for (var i = 0; i < data.length; i++) {
      var c = data[i];
      var t = c.t > 1e12 ? c.t : c.t * 1000;
      if (t < CM.MIN_TIME || t > toMs + 86400000) continue;
      var time = CM.normTime(t, tvRes);
      if (seen.has(time)) continue;
      seen.add(time);

      out.push({
        time: time,
        open:  gram ? parseFloat(c.o) / CM.TROY : parseFloat(c.o),
        high:  gram ? parseFloat(c.h) / CM.TROY : parseFloat(c.h),
        low:   gram ? parseFloat(c.l) / CM.TROY : parseFloat(c.l),
        close: gram ? parseFloat(c.c) / CM.TROY : parseFloat(c.c),
        volume: parseFloat(c.v) || 0,
      });
    }
    return out.sort(function (a, b) { return a.time - b.time; });
  };

  HyperliquidDatafeed.prototype._aggWeekly = function (daily) {
    var m = new Map();
    for (var i = 0; i < daily.length; i++) {
      var b = daily[i];
      var w = CM.weekStart(b.time);
      var ex = m.get(w);
      if (!ex) m.set(w, Object.assign({}, b, { time: w }));
      else {
        ex.high = Math.max(ex.high, b.high);
        ex.low  = Math.min(ex.low, b.low);
        ex.close = b.close;
        ex.volume += b.volume; // ← صحيح هنا: مجموع أيام منفصلة، لا تحديثات متكررة لنفس اليوم
      }
    }
    return Array.from(m.values()).sort(function (a, b) { return a.time - b.time; });
  };

  HyperliquidDatafeed.prototype._openWs = function (wsKey, coin, hlIv, gram) {
    var self = this;
    if (typeof HL === 'undefined') return;
    var entry = { unsub: null, lastBar: null, dailyMap: new Map() };
    this._ws.set(wsKey, entry);

    entry.unsub = HL.subscribe({ type: 'candle', coin: coin, interval: hlIv }, function (c) {
      var w = self._ws.get(wsKey);
      if (!w) return;

      for (var it = self._subs.values(), r; !(r = it.next()).done;) {
        var sub = r.value;
        if (sub.wsKey !== wsKey) continue;

        // For weekly subscribers, normalize to daily boundary first,
        // then aggregate to weekly. For others, normalize to their resolution.
        var normRes = sub.resolution === '1W' ? '1D' : sub.resolution;
        var raw = self._bar(c, sub.sym, normRes);

        // Guard against stale historical ticks after reconnect
        if (w.lastBar && raw.time < w.lastBar.time) continue;

        if (!w.lastBar || raw.time > w.lastBar.time) {
          w.lastBar = Object.assign({}, raw);
        } else {
          /* Candle.v هو إجمالي تراكمي للشمعة حتى الآن (موثّق رسمياً)،
             لا دلتا لكل رسالة WS — استبدال، لا تراكم. */
          w.lastBar.high = Math.max(w.lastBar.high, raw.high);
          w.lastBar.low  = Math.min(w.lastBar.low, raw.low);
          w.lastBar.close = raw.close;
          w.lastBar.volume = raw.volume;
        }

        var emit;
        if (sub.resolution === '1W') {
          var dk = CM.normTime(w.lastBar.time, '1D');
          w.dailyMap.set(dk, Object.assign({}, w.lastBar));
          // prune old weeks to prevent unbounded growth
          var curW = CM.weekStart(w.lastBar.time);
          for (var it2 = Array.from(w.dailyMap.keys()), i2 = 0; i2 < it2.length; i2++) {
            if (it2[i2] < curW - 7 * 86400000) w.dailyMap.delete(it2[i2]);
          }
          emit = self._calcWeek(w.dailyMap, curW);
          if (!emit) continue;
        } else {
          emit = Object.assign({}, w.lastBar);
        }

        // Deduplicate: only emit if bar actually changed
        if (!sub.lastBar || emit.time !== sub.lastBar.time ||
            emit.open !== sub.lastBar.open || emit.high !== sub.lastBar.high ||
            emit.low !== sub.lastBar.low || emit.close !== sub.lastBar.close ||
            emit.volume !== sub.lastBar.volume) {
          sub.callback(emit);
          sub.lastBar = emit;
        }
      }
    });

    /* الشمعة الأسبوعية الحيّة: نجلب أيام الأسبوع الحالي المنقضية فوراً
       (بالتوازي مع الاشتراك أعلاه، لا بعده — لا تأخير على البيانات
       الحيّة) ونضعها بـdailyMap قبل وصول أي تحديث حي. مُقيَّدة بمشترك
       1W فعلي فقط. */
    var needsWeekly = false;
    for (var it3 = this._subs.values(), r3; !(r3 = it3.next()).done;) {
      if (r3.value.wsKey === wsKey && r3.value.resolution === '1W') { needsWeekly = true; break; }
    }
    if (hlIv === '1d' && needsWeekly) {
      var now = Date.now();
      this._fetchRest(coin, '1d', now - 9 * 86400000, now, gram).then(function (raw) {
        var w = self._ws.get(wsKey);
        if (!w) return; // أُلغي الاشتراك قبل اكتمال الجلب
        var curWeekStart = CM.weekStart(now);
        for (var i = 0; i < raw.length; i++) {
          var d = raw[i];
          if (d.time >= curWeekStart && !w.dailyMap.has(d.time)) w.dailyMap.set(d.time, Object.assign({}, d));
        }
        if (!w.lastBar && raw.length) w.lastBar = Object.assign({}, raw[raw.length - 1]);
      }).catch(function () {});
    }
  };

  HyperliquidDatafeed.prototype._calcWeek = function (map, start) {
    var open = null, high = -Infinity, low = Infinity, close = null, vol = 0;
    var end = start + 7 * 86400000;
    for (var it = map.entries(), r; !(r = it.next()).done;) {
      var t = r.value[0], b = r.value[1];
      if (t < start || t >= end) continue;
      if (open === null) open = b.open;
      high = Math.max(high, b.high);
      low  = Math.min(low, b.low);
      close = b.close;
      vol  += b.volume; // ← صحيح هنا أيضاً: مجموع أيام منفصلة بـdailyMap
    }
    if (open === null) return null;
    return { time: start, open: open, high: high, low: low, close: close, volume: vol };
  };

  CM.Datafeed = HyperliquidDatafeed;

})();
