/* ═══════════════════════════════════════════════════════════════
   oc-meta.js — تحويل ردّ `outcomeMeta` إلى موديل عربي جاهز للعرض

   شكل الرد الرسمي:
     { outcomes:[{outcome,name,description,sideSpecs:[{name},{name}],
                  quoteToken,venue,deployerFeeScale}],
       questions:[{question,name,description,fallbackOutcome,
                   namedOutcomes:[...],settledNamedOutcomes:[...]}],
       deployers:[...], feeScale:"1.0" }

   القوالب (`template:<id>`) تُسمّى بالإنجليزية والوصف عبارة عن
   `keyword:value|keyword:value`. هذا الملف يفكّ ذلك ويبني:
     - عنواناً عربياً واضحاً
     - سؤالاً/سوقاً منفرداً
     - تصنيفاً (عملات/رياضة/اقتصاد/شركات)
     - وقت التسوية (Date) وعدّاداً تنازلياً
     - أسماء الجانبين بالعربية (نعم/لا أو أسماء الفريقين)

   لا يعرف هذا الملف شيئاً عن الشبكة أو الـDOM — دوال خالصة فقط.
═══════════════════════════════════════════════════════════════ */
'use strict';

const OcMeta = (function () {

  /* ════ أدوات ════ */
  function parseKV(desc) {
    const out = {};
    if (!desc || typeof desc !== 'string') return out;
    desc.split('|').forEach(part => {
      const i = part.indexOf(':');
      if (i <= 0) return;
      out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
    });
    return out;
  }

  /* `20260922-1600` أو `20260922` → Date (UTC) */
  function parseTime(v) {
    if (!v) return null;
    let m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(v);
    if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
    m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
    if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 23, 59));
    return null;
  }

  function tplId(name) {
    if (!name) return '';
    if (name.startsWith('template:')) return name.slice(9);
    return name;
  }

  function num(v) {
    const n = parseFloat(v);
    if (!isFinite(n)) return v || '';
    return n.toLocaleString('en-US', { maximumFractionDigits: 8 });
  }

  const PERIOD_AR = { '1d': 'يومي', '15m': '15 دقيقة', '1h': 'كل ساعة', '4h': 'كل 4 ساعات', '1w': 'أسبوعي' };

  /* ════ التصنيف ════ */
  function categoryOf(tpl, kv) {
    const t = (tpl || '').toLowerCase();
    const s = JSON.stringify(kv).toLowerCase();
    if (t.includes('sports') || /football|soccer|baseball|basketball|nfl|nba|mlb|tennis/.test(s)) return 'sports';
    if (t.includes('price') || t.includes('touch') || kv.perp || kv.underlying) return 'crypto';
    if (t.includes('policyrate') || t.includes('cpi') || t.includes('inflation') || t.includes('rate')) return 'econ';
    if (t.includes('company') || t.includes('ipo') || t.includes('earnings')) return 'company';
    return 'other';
  }

  /* ════ اسم الجانب ════ */
  function sideName(raw, kv, fallbackIdx) {
    let s = (raw || '').replace(/^template:/, '');
    /* أسماء مثل `{shortNameA}` تُستبدل بقيمة الكلمة المفتاحية */
    s = s.replace(/\{(\w+)\}/g, (_, k) => kv[k] || k);
    const low = s.trim().toLowerCase();
    if (!s.trim()) return fallbackIdx === 0 ? 'نعم' : 'لا';
    if (low === 'yes') return 'نعم';
    if (low === 'no')  return 'لا';
    if (low === 'over')  return 'أعلى';
    if (low === 'under') return 'أدنى';
    return s.trim();
  }

  /* ════ عنوان عربي للسوق المنفرد ════ */
  function outcomeTitle(tpl, kv, o) {
    const perp   = kv.perp || kv.underlying || '';
    const when   = kv.time || kv.expiry || kv.dateTime || kv.resolutionDeadline || '';

    switch (tpl) {
      case 'binaryPrice':
        return `هل يكون ${perp} أعلى من $${num(kv.threshold)}؟`;
      case 'priceTouch':
        return `هل يلمس ${perp} سعر $${num(kv.target)}؟`;
      case 'companyIpoConfirmed':
        return `هل تُعلن ${kv.company || 'الشركة'} طرحها العام؟`;
      case 'policyRateNoChange':
        return 'قرار الفائدة: بلا تغيير';
      case 'policyRateDecrease':
        return 'قرار الفائدة: خفض';
      case 'policyRateIncrease':
        return 'قرار الفائدة: رفع';
      case 'sportsTournamentParticipant':
        return `${kv.participant || 'الفريق'} يفوز بالبطولة`;
      case 'sportsContestParticipant2':
        return `فوز ${kv.participant || 'الفريق'}`;
      case 'sportsContestDraw2':
        return 'تعادل';
      case 'sportsContestWinner': {
        const a = kv.participantA || kv.shortNameA || 'الفريق الأول';
        const b = kv.participantB || kv.shortNameB || 'الفريق الثاني';
        return `${a} ضد ${b}`;
      }
      case 'fallback':
        return 'نتيجة أخرى';
      default: break;
    }

    /* الأسواق المتكررة التي ينشرها البروتوكول */
    if (/^recurring/i.test(o.name || '')) {
      if (kv.class === 'priceBinary')
        return `هل يتجاوز ${kv.underlying || ''} $${num(kv.targetPrice)}؟`;
      if (kv.class === 'priceBucket')
        return `نطاق سعر ${kv.underlying || ''}`;
      if ((o.name || '').includes('Fallback')) return 'نتيجة أخرى';
      return `سوق متكرر ${kv.underlying || ''}`.trim();
    }
    if ((o.name || '').toLowerCase().includes('fallback')) return 'نتيجة أخرى';

    /* احتياطي: أول قيمة نصية مفيدة */
    const firstVal = Object.values(kv).find(v => v && isNaN(parseFloat(v)));
    return firstVal || `سوق #${o.outcome}`;
  }

  /* عنوان عربي للسؤال (حاوية عدة نتائج) */
  function questionTitle(tpl, kv) {
    switch (tpl) {
      case 'sportsTournamentWinner':
        return `من يفوز بـ${kv.competition || 'البطولة'}؟${kv.season ? ' — ' + kv.season : ''}`;
      case 'sportsContestResult': {
        const a = kv.participantA || kv.shortNameA || '';
        const b = kv.participantB || kv.shortNameB || '';
        return a && b ? `نتيجة ${a} ضد ${b}` : 'نتيجة المباراة';
      }
      case 'policyRateDecision':
        return `قرار الفائدة${kv.centralBank ? ' — ' + kv.centralBank : ''}`;
      default: break;
    }
    if (kv.class === 'priceBucket') return `نطاق سعر ${kv.underlying || ''}`;
    return kv.competition || kv.question || 'سؤال';
  }

  /* وصف عربي مختصر لسطر ثانوي */
  function subtitle(kv) {
    const bits = [];
    if (kv.competition) bits.push(kv.competition);
    if (kv.stage)       bits.push(kv.stage);
    if (kv.season)      bits.push('موسم ' + kv.season);
    if (kv.priceDescription) bits.push(kv.priceDescription);
    if (kv.period)      bits.push(PERIOD_AR[kv.period] || kv.period);
    if (kv.officialSource) bits.push('المصدر: ' + kv.officialSource);
    return bits.join(' · ');
  }

  /* ════ بناء نتيجة واحدة ════ */
  function buildOutcome(o) {
    const kv   = parseKV(o.description);
    const tpl  = tplId(o.name) === 'template fallback' ? 'fallback' : tplId(o.name);
    const time = parseTime(kv.time || kv.expiry || kv.dateTime || kv.resolutionDeadline || kv.scheduledStart);
    return {
      id:        o.outcome,
      raw:       o,
      tpl,
      kv,
      isFallback: /fallback/i.test(o.name || '') || kv.other !== undefined || o.description === 'other',
      title:     outcomeTitle(tpl, kv, o),
      subtitle:  subtitle(kv),
      category:  categoryOf(tpl, kv),
      settleAt:  time,
      quote:     o.quoteToken || 'USDC',
      venue:     o.venue || '—',
      feeScale:  parseFloat(o.deployerFeeScale || '0') || 0,
      sides: [
        { side: 0, name: sideName(o.sideSpecs?.[0]?.name, kv, 0), coin: ocCoin(o.outcome, 0), token: ocToken(o.outcome, 0), asset: ocAsset(o.outcome, 0) },
        { side: 1, name: sideName(o.sideSpecs?.[1]?.name, kv, 1), coin: ocCoin(o.outcome, 1), token: ocToken(o.outcome, 1), asset: ocAsset(o.outcome, 1) }
      ]
    };
  }

  /* ════ بناء الموديل الكامل ════
     يُنتج:
       markets: [{ kind:'question'|'single', ... }]
       byOutcome: خريطة id → نتيجة
       coins: كل أسماء الـcoin المطلوبة للاشتراك */
  function build(meta) {
    const outcomes  = (meta?.outcomes || []).map(buildOutcome);
    const byOutcome = new Map(outcomes.map(o => [o.id, o]));
    const usedInQ   = new Set();
    const markets   = [];

    (meta?.questions || []).forEach(q => {
      const kv   = parseKV(q.description);
      const tpl  = tplId(q.name);
      const kids = (q.namedOutcomes || []).map(id => byOutcome.get(id)).filter(Boolean);
      const fb   = byOutcome.get(q.fallbackOutcome);
      kids.forEach(k => usedInQ.add(k.id));
      if (fb) usedInQ.add(fb.id);
      if (!kids.length) return;
      /* كلمات السؤال تُكمل كلمات النتائج (أسماء الفريقين مثلاً) */
      kids.forEach(k => { k.kv = Object.assign({}, kv, k.kv); k.question = q.question; });
      markets.push({
        kind:     'question',
        id:       'q' + q.question,
        question: q.question,
        tpl,
        kv,
        title:    questionTitle(tpl, kv),
        subtitle: subtitle(kv),
        category: categoryOf(tpl, kv),
        settleAt: parseTime(kv.resolutionDeadline || kv.expiry || kv.time),
        outcomes: kids,
        fallback: fb || null,
        settled:  (q.settledNamedOutcomes || []).length
      });
    });

    outcomes.forEach(o => {
      if (usedInQ.has(o.id)) return;
      markets.push({
        kind:     'single',
        id:       'o' + o.id,
        tpl:      o.tpl,
        kv:       o.kv,
        title:    o.title,
        subtitle: o.subtitle,
        category: o.category,
        settleAt: o.settleAt,
        outcomes: [o],
        fallback: null
      });
    });

    const coins = [];
    outcomes.forEach(o => o.sides.forEach(s => coins.push(s.coin)));

    return { markets, byOutcome, outcomes, coins, feeScale: parseFloat(meta?.feeScale || '0') || 0 };
  }

  return { build, buildOutcome, parseKV, parseTime, sideName, categoryOf };
})();
