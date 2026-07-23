/* ============================================================
 * app/data.js — data adapter for the /app/ mobile client.
 *
 * Fetches the site's real /data/*.json catalog in parallel and
 * normalizes it into the shapes the UI modules consume (see
 * CONTRACT.md §"Data adapter"). Exam papers (test-NN.json) are
 * fetched lazily per exam via App.data.questionsFor(idx).
 *
 * Static content that has no JSON source (WRITE_TASK, ARTICLES,
 * PLANS, the 30-task syllabus metadata mirrored from build.js's
 * TASKS array) is embedded here verbatim.
 * ============================================================ */
(function () {
  'use strict';

  var App = window.App || (window.App = {});
  var D = App.data = App.data || {};

  /* ---------- pre-load defaults (safe property access before load()) ---------- */
  D.ready = false;
  D.TESTS = [];
  D.WORDS = [];
  D.CHARS = [];
  D.GRAMMAR = [];
  D.CONFUSABLES = [];
  D.TASKS = [];
  D.TOPICS = D.TASKS; /* alias — prototype name */
  D.SENTENCE_CATS = [];
  D.TRAPS = [];
  D.TRAP_CATS = [];
  D.PRACTICE = [];
  D.TOTAL_QUESTIONS = 0;
  D.fullErrors = [];   /* phase-2 catalog files that failed to load (B1) */
  D.charsError = false; /* G1: Characters catalog failed (decoupled from Study) */
  D.studyError = false; /* G1: Study catalog (grammar/confusables/…) failed */

  /* ---------- small utils ---------- */

  /* Pinyin/latin normalizer: lowercase, strip tone diacritics, spaces, apostrophes,
   * and fold the IME ü-convention v→u so "lvxing"/"nv" match 旅行/女 (stored as ü,
   * which NFD-strips to u). Applied symmetrically to the index and the query.
   * norm('Rènzhēn') === 'renzhen'; norm('lǚxíng') === norm('lvxing') === 'luxing'. */
  D.norm = function (s) {
    var str = String(s == null ? '' : s).toLowerCase();
    try { str = str.normalize('NFD'); } catch (e) {}
    return str.replace(/[̀-ͯ]/g, '').replace(/[\s'’ʼ`´]/g, '').replace(/v/g, 'u');
  };

  /* Strip a leading exam numbering prefix: "66. …", "66-67. …", "5、…". */
  function stripNum(s) {
    return String(s == null ? '' : s).replace(/^\s*\d+(?:\s*[-–]\s*\d+)?\s*[.、．]\s*/, '');
  }
  D.stripNum = stripNum;

  /* Deterministic PRNG (mulberry32) — verbatim from build.js so the topic
   * quick-check quiz matches the site's /topics/<slug>/ pages. */
  function seededRandom(seedStr) {
    var h = 1779033703;
    for (var i = 0; i < seedStr.length; i++) {
      h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h = (h ^= h >>> 16) >>> 0;
      return h / 4294967296;
    };
  }

  /* Strip scripts + inline event handlers from a pre-rendered HTML blob
   * (traps.json fallback rendering). TRUST ASSUMPTION: regex-based, adequate
   * only because traps.json is repo-authored build output (it does not strip
   * javascript: hrefs etc.) — never point this at untrusted content. */
  function sanitizeHtml(html) {
    var s = String(html || '');
    s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
    s = s.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '');
    s = s.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '');
    s = s.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '');
    return s;
  }

  /* Make in-content anchors (root-relative site links in traps.json blobs)
   * open in a new tab so they never navigate the SPA away. */
  function externalizeLinks(html) {
    return String(html || '').replace(/<a\s(?![^>]*\btarget=)/gi, '<a target="_blank" rel="noopener" ');
  }

  /* Decode HTML entities that ship pre-escaped in some datasets (sentences.json
   * carries &#x27; on ~22 rows). Must run in the adapter, before the UI's esc()
   * would escape the '&' again and show the literal entity text. */
  function decodeEntities(s) {
    return String(s == null ? '' : s)
      .replace(/&#x([0-9a-f]+);/gi, function (m, h) { return String.fromCodePoint(parseInt(h, 16)); })
      .replace(/&#(\d+);/g, function (m, d) { return String.fromCodePoint(parseInt(d, 10)); })
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  /* Per-file failures resolve the fallback but are RECORDED, so load() can
   * reject when the critical catalog files never arrived (offline boot) —
   * otherwise the app would render a fully "ready" shell with zero content. */
  var loadErrors = [];
  function fetchJson(url, fallback) {
    return fetch(url)
      .then(function (r) { if (!r.ok) throw new Error(url + ' → ' + r.status); return r.json(); })
      .catch(function () { loadErrors.push(url); return fallback; });
  }

  /* ============================================================
   * Static content (no JSON source)
   * ============================================================ */

  /* Verbatim from the prototype (HSK-Prep-Mobile.dc.html). */
  D.WRITE_TASK = { keyword: '旅行', theme: 'Write a short paragraph about a trip you took. Use the keyword 旅行 and 3–4 connectors (因为…所以, 不但…而且). Aim for 80+ characters.', model: '上个月我和朋友一起去云南旅行。那里的天气很好,风景也非常美。我们爬了山,还尝了很多当地的美食。虽然有点儿累,可是我觉得非常开心。因为这次旅行,所以我不但放松了心情,而且认识了几个新朋友。' };

  D.ARTICLES = {
    writing: { title: 'Writing trainer', cn: '写作训练', body: ['HSK 4 写作 has two parts: 完成句子 (arrange given words into a sentence) and 看图造句 (write a sentence from a picture + keyword).', 'For 完成句子, find the verb first, then place 把 / 被 / 时间 words in their fixed slots.', 'For 看图造句, keep it simple: Subject + Time + Verb + Object. One clean sentence beats a fancy broken one.', 'Aim for 80+ characters on the short essay, use 3–4 connectors (因为…所以, 不但…而且), and leave 2 minutes to check 的/得/地.'] },
    strategies: { title: 'Exam strategies', cn: '考试策略', body: ['Listening plays twice — use the first play to catch the gist and the second to confirm your answer.', 'In 判断对错, watch for negatives (不, 没) and opposites the speaker sneaks in.', 'Reading gap-fill: decide the part of speech the blank needs before scanning the word bank.', 'Budget ~40 min for reading, ~30 for listening, and never leave writing blank — partial answers still score.'] },
    compare: { title: 'HSK 4 vs HSK 3 & 5', cn: '等级对比', body: ['HSK 4 doubles the vocabulary of HSK 3 — 1,200 words vs 600 — and adds longer listening passages.', 'Grammar steps up with 把/被 sentences, complements, and multi-clause connectors.', 'Compared with HSK 5 (2,500 words), HSK 4 stays in everyday topics; HSK 5 adds abstract and written-register language.', 'Most universities ask for HSK 4 for undergraduate entry and HSK 5 for graduate programs.'] },
  };

  /* Plans live in more.js (PLANS) with the real StudyBox tier ids
   * ('1mo'/'3mo'/'12mo') — no duplicate here, one owner per constant. */

  /* Contract chips revised against the real catalog: every chip must return
   * results ('把字句'/'认真' have no source rows in grammar-patterns.json /
   * vocabulary.json; 'cai jiu' hits the now-indexed CONFUSABLES; '只有…才'
   * hits grammar; 'mock' hits exams). */
  D.SEARCH_SUGGESTIONS = ['旅行', 'cai jiu', '只有…才', 'listening', 'mock'];

  /* The 30 official communicative tasks — mirrored from build.js's TASKS
   * array (slug / task_cn / task_en / topic_ids / syllabus_cn), which is the
   * generator behind the site's /topics/<slug>/ pages. Word lists, category
   * labels, dialogues and the quick-check quiz are joined from topics.json /
   * vocabulary.json / task-dialogues.json at load() with the same logic. */
  var TASK_META = [
    { slug: 'describe-a-person', cn: '谈论某个人物', en: 'Describe a Person', topic_ids: ['personal', 'social'], requirement: '能听懂他人关于某个熟人或公众人物个人信息、个人特征方面有一定复杂度的问题。如履历、家庭背景、职业背景、外貌、装扮、性格、影响力等。' },
    { slug: 'daily-affairs', cn: '交流、处理日常事务', en: 'Handle Daily Affairs', topic_ids: ['daily-affairs'], requirement: '能听懂日常生活中有关业务处理、困难求助的有一定复杂度的话语。如办理快递收发、证件办理、申请会员、法律咨询、警务求助等。' },
    { slug: 'social-expressions', cn: '日常言语交往', en: 'Daily Social Expressions', topic_ids: ['social', 'etiquette'], requirement: '能听懂日常交往中对方表达客气、赞美、祝贺、鼓励、歉意的有一定复杂度的言语。' },
    { slug: 'emotions', cn: '谈论情感话题', en: 'Discuss Emotions', topic_ids: ['social', 'family'], requirement: '能听懂关于情感及感悟的有一定复杂度的问题。如爱情、友情、亲情、理想等。' },
    { slug: 'food-dining', cn: '介绍饮食情况', en: 'Food & Dining', topic_ids: ['food', 'food-culture'], requirement: '能听懂关于食物饮品、就餐情况、菜品制作情况等有一定复杂度的问题或介绍。如饮食味道、种类、特点、餐厅环境、服务、制作过程等。' },
    { slug: 'transportation', cn: '谈论交通出行', en: 'Transportation & Travel', topic_ids: ['transport'], requirement: '能听懂关于交通出行的有一定复杂度的问题。如出行经历感受、交通客运情况、行程计划、酒店预订等。' },
    { slug: 'shopping', cn: '交流购物体验、商业活动内容', en: 'Shopping Experiences', topic_ids: ['shopping'], requirement: '能听懂关于商品选购、购物体验、商业活动等方面有一定复杂度的问题。如网购与品牌选择、支付方式、打折促销等。' },
    { slug: 'health-medical', cn: '谈论就医情况、健康生活', en: 'Health & Medical', topic_ids: ['health'], requirement: '能听懂关于就医情况、健康生活情况的有一定复杂度的询问。如生病症状、受伤情况、健康观念和常识等。' },
    { slug: 'hobbies-leisure', cn: '交流业余爱好、休闲度假', en: 'Hobbies & Leisure', topic_ids: ['leisure'], requirement: '能听懂关于休闲活动情况及感受、看法的有一定复杂度的询问。如阅读、网络活动、运动、健身、旅行、聚会等。' },
    { slug: 'housing-community', cn: '交流居住情况、社区情况', en: 'Housing & Community', topic_ids: ['community'], requirement: '能听懂关于居住情况、社区生活、房屋租赁与买卖等情况的有一定复杂度的询问。如小区环境、邻里相处、租房条件等。' },
    { slug: 'family-life', cn: '交流家庭生活情况', en: 'Family Life', topic_ids: ['family'], requirement: '能听懂关于居家生活、家庭关系、成长过程、生活习惯、家庭事务等有一定复杂度的问题。' },
    { slug: 'education-learning', cn: '谈论教学、学习情况', en: 'Education & Learning', topic_ids: ['study'], requirement: '能听懂关于课程情况、教学情况、学习经历与心得等有一定复杂度的询问。如课程、专业、考试、学业规划、学位学历、奖学金、学习方法等。' },
    { slug: 'campus-life', cn: '交流校园生活', en: 'Campus Life', topic_ids: ['campus', 'study'], requirement: '能听懂关于校园活动、学校情况的有一定复杂度的问题。如食堂、图书馆、毕业晚会、校园环境、费用、专业等。' },
    { slug: 'education-issues', cn: '谈论教育现象、观念', en: 'Education Phenomena', topic_ids: ['edu-issues'], requirement: '能听懂关于家庭教育、社会教育等教育问题的有一定复杂度的询问。如教育目标、教育方式、升学报考、职业教育等。' },
    { slug: 'work-performance', cn: '谈论工作情况与表现', en: 'Work & Performance', topic_ids: ['office', 'workplace-social'], requirement: '能听懂关于办公事务、工作表现、职场交往情况的有一定复杂度的询问。如工作安排、工作态度能力、同事相处、团建活动等。' },
    { slug: 'career-experience', cn: '介绍职业经历与单位情况', en: 'Career & Company', topic_ids: ['career', 'company'], requirement: '能听懂关于职业与工作经历、单位情况的有一定复杂度的问题。如求职、打工、职位变动、招聘应聘、考核面试、工作环境与待遇等。' },
    { slug: 'nature', cn: '谈论自然情况', en: 'Nature & Geography', topic_ids: ['nature'], requirement: '能听懂关于自然情况的有一定复杂度的询问。如地球、海洋、森林、气候、动植物、自然景观、天气现象等。' },
    { slug: 'environment', cn: '谈论生活中的环保情况', en: 'Environmental Protection', topic_ids: ['environment', 'nature'], requirement: '能听懂关于环境状况、环保情况有一定复杂度的问题。如环境的一般情况、污染情况、环保做法、观念、相关法规等。' },
    { slug: 'technology', cn: '介绍新技术应用及科技成果', en: 'Technology', topic_ids: ['tech', 'science'], requirement: '能听懂关于新技术运用、科普知识、科技成果等相关情况的一般性询问。如扫码支付、无人机等新技术、实用科普知识、简单的研究发现等。' },
    { slug: 'china-provinces', cn: '介绍中国的主要省市、民族', en: 'China Overview', topic_ids: ['overview'], requirement: '能听懂关于中国某个主要省市、民族的一般性询问或介绍。如中国首都、各省主要城市、少数民族特点、分布等。' },
    { slug: 'economy', cn: '谈论经济现象', en: 'Economic Phenomena', topic_ids: ['economy'], requirement: '能听懂关于流行产品、新商业形态、经济状况等经济现象有一定复杂度的询问。如网店、短视频、上门经济等。' },
    { slug: 'social-phenomena', cn: '谈论社会现象', en: 'Social Phenomena', topic_ids: ['social-phenomena'], requirement: '能听懂关于生活观念、网络生活、流行事物等社会现象有一定复杂度的询问。如婚恋观、消费观、网络生活的方式和影响等。' },
    { slug: 'arts-entertainment', cn: '介绍文艺形式、活动、作品', en: 'Arts & Entertainment', topic_ids: ['arts'], requirement: '能听懂关于某种文艺形式、文艺活动、文艺作品创作者及其作品等有一定复杂度的询问。如某部小说、电影、话剧的大致内容、某场文艺表演、某位歌手、作家等。' },
    { slug: 'sports', cn: '谈论体育项目及比赛', en: 'Sports', topic_ids: ['sports'], requirement: '能听懂关于乒乓球、排球等项目情况、比赛情况、体育名人及故事的有一定复杂度的问题。' },
    { slug: 'international-friendship', cn: '讲述中外友好故事', en: 'China-World Friendship', topic_ids: ['exchange'], requirement: '能听懂对方讲述的有一定复杂度的中外友好往来的故事及其产生的影响。如友好城市、友好学校、跨国友谊、留学经历、中文比赛经历等。' },
    { slug: 'proverbs-sayings', cn: '介绍常见俗语、名言', en: 'Proverbs & Sayings', topic_ids: ['language'], requirement: '能听懂日常交谈中别人介绍的某些中文常见俗语、名言；能大致介绍一些中文常见俗语、名言及其主要含义；能看懂介绍、解读某些中文常见俗语、名言的小短文。' },
    { slug: 'food-culture', cn: '介绍传统饮食文化', en: 'Traditional Food Culture', topic_ids: ['food-culture'], requirement: '能听懂朋友、同学、老师等对中国传统饮食观念、中国各地饮食特点、传统店铺、品牌等中国传统饮食文化相关情况的有一定复杂度的介绍。如中国人的餐桌礼仪、某种食物的内涵，各地饮食的风味等。' },
    { slug: 'customs-traditions', cn: '介绍风俗传统', en: 'Customs & Traditions', topic_ids: ['customs', 'etiquette'], requirement: '能听懂朋友、同学、老师等对中国传统节日习俗、国粹、各地传统、人际交往礼仪等中国民俗传统相关情况的有一定复杂度的介绍。如春节、中秋节等节日习俗；中国功夫、京剧等国粹；民间喜好与禁忌等。' },
    { slug: 'scenic-spots', cn: '介绍名胜古迹', en: 'Scenic Spots & Historic Sites', topic_ids: ['landmarks'], requirement: '能听懂朋友、同学、老师等对中国某个名胜古迹的一般性介绍。如天安门、长城等。能看懂介绍中国某个名胜古迹的一般性短文；能写出一段话简单介绍中国某个名胜古迹。' },
    { slug: 'historical-figures', cn: '介绍历史人物、历史事件', en: 'Historical Figures & Events', topic_ids: ['history'], requirement: '能听懂朋友、同学、老师等对某位中国历史人物或某个中国历史事件的一般性介绍。如孔子、老子等。能看懂介绍某位中国历史人物或者某个中国历史事件的一般性短文。' },
  ];

  /* ============================================================
   * Normalizers
   * ============================================================ */

  function posBucketsOf(pos) {
    var out = [];
    String(pos || '').split('/').forEach(function (tok) {
      tok = tok.replace(/[()]/g, '').trim();
      var b = null;
      if (tok === 'n.') b = 'noun';
      else if (tok === 'v.') b = 'verb';
      else if (tok.indexOf('adj') === 0) b = 'adj';
      if (b && out.indexOf(b) < 0) out.push(b);
    });
    return out;
  }

  function normalizeWords(vocab, vocabFreq) {
    return (vocab || []).map(function (w) {
      var n = Number(vocabFreq && vocabFreq[w.id]) || 0;
      var buckets = posBucketsOf(w.pos);
      return {
        id: w.id,
        word: w.word,
        pinyin: w.pinyin,
        pinyinNorm: D.norm(w.pinyin),
        pos: w.pos || '',
        posBucket: buckets[0] || null,
        posBuckets: buckets,
        meaning: w.meaning || '',
        meaningNorm: String(w.meaning || '').toLowerCase(),
        ex: w.example_cn || '',
        exPy: w.example_pinyin || '',
        exEn: w.example_en || '',
        freqN: n,
        freq: n >= 20 ? '高频' : n >= 6 ? '常考' : null,
      };
    });
  }

  function normalizeChars(writeRows, recogRows, charData, charFreq) {
    function mk(row, tier) {
      var cd = (charData && charData[row.char]) || null;
      return {
        char: row.char,
        pinyin: row.pinyin || '',
        pinyinNorm: D.norm(row.pinyin || ''),
        meaning: row.meaning || '',
        meaningNorm: String(row.meaning || '').toLowerCase(),
        tier: tier,
        strokes: cd && cd.matches ? cd.matches.length : 0,
        radical: (cd && cd.radical) || null,
        decomp: (cd && cd.decomposition) || null,
        etym: (cd && cd.etymology && cd.etymology.hint) || null,
        freq: Number(charFreq && charFreq[row.char]) || 0,
      };
    }
    var out = [];
    (writeRows || []).forEach(function (r) { out.push(mk(r, 'write')); });
    (recogRows || []).forEach(function (r) { out.push(mk(r, 'recognition')); });
    return out;
  }

  function normalizeGrammar(patterns) {
    return (patterns || []).map(function (g) {
      var correctFirst = g.slug.length % 2 === 1;
      return {
        slug: g.slug,
        cn: g.pattern_cn,
        en: g.pattern_en,
        enNorm: D.norm(g.pattern_en),
        structure: g.structure || '',
        desc: g.summary || '',
        examples: (g.examples || []).slice(0, 5).map(function (e) { return { cn: e.cn, en: e.en }; }),
        wrong: (g.wrong_examples || []).slice(0, 2).map(function (w) { return { bad: w.wrong, good: w.right }; }),
        quiz: (g.quiz || []).slice(0, 3).map(function (q) {
          return {
            q: q.stem,
            opts: correctFirst ? [q.correct, q.wrong] : [q.wrong, q.correct],
            correct: correctFirst ? 0 : 1,
            note: q.explain || '',
          };
        }),
      };
    });
  }

  function normalizeConfusables(rows) {
    return (rows || []).map(function (c) {
      var parts = String(c.subtitle || '').split(' vs ');
      var aUse, bUse;
      if (parts.length === 2) { aUse = parts[0].trim(); bUse = parts[1].trim(); }
      else {
        aUse = (c.rows && c.rows[0] && c.rows[0][1]) || '';
        bUse = (c.rows && c.rows[0] && c.rows[0][2]) || '';
      }
      return {
        slug: c.slug,
        a: c.wordA, b: c.wordB,
        aPy: c.pinyinA, bPy: c.pinyinB,
        aPyNorm: D.norm(c.pinyinA),
        bPyNorm: D.norm(c.pinyinB),
        pairPyNorm: D.norm(String(c.pinyinA || '') + ' ' + String(c.pinyinB || '')),
        cat: c.category || '',
        aUse: aUse, bUse: bUse,
        rule: c.tip || '',
        exA: c.exA || null,
        exB: c.exB || null,
        rows: c.rows || [],
        quiz: (c.quiz || []).map(function (q, qi) {
          var correctFirst = (c.slug.length + qi) % 2 === 1;
          return {
            q: q.stem,
            opts: correctFirst ? [q.correct, q.wrong] : [q.wrong, q.correct],
            correct: correctFirst ? 0 : 1,
            note: q.explain || '',
          };
        }),
      };
    });
  }

  /* Mixed-practice pool: all grammar quiz items + all confusable quiz items. */
  function buildPracticePool(grammar, confusables) {
    var pool = [];
    (grammar || []).forEach(function (g) {
      (g.quiz || []).forEach(function (q) {
        pool.push({ q: q.q, opts: q.opts, correct: q.correct, note: q.note, src: 'grammar', slug: g.slug });
      });
    });
    (confusables || []).forEach(function (c) {
      (c.quiz || []).forEach(function (q) {
        pool.push({ q: q.q, opts: q.opts, correct: q.correct, note: q.note, src: 'confusable', slug: c.slug });
      });
    });
    return pool;
  }

  /* One drill round = 15 random pool items (Math.random at round start). */
  D.drillRound = function (n) {
    n = n || 15;
    var pool = D.PRACTICE.slice();
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    return pool.slice(0, Math.min(n, pool.length));
  };

  /* ---- 30 communicative tasks: joins mirrored from build.js buildTaskTopicPages ---- */

  function normalizeTasks(topicsData, wordById, dialogues, taskMetas) {
    /* Prefer build-emitted metadata (data/app-data.json `tasks`, generated from
       build.js's TASKS constant) — the bundled TASK_META below is a fallback
       copy for older app-data.json files and offline dev. */
    var METAS = (taskMetas && taskMetas.length) ? taskMetas : TASK_META;
    var topicWords = (topicsData && topicsData.topic_words) || {};
    var groups = (topicsData && topicsData.hierarchy) || [];
    var groupOf = {};
    groups.forEach(function (g) {
      (g.topics || []).forEach(function (t) {
        if (!groupOf[t.id]) groupOf[t.id] = (g.name_en || '') + ' · ' + (g.name || '');
      });
    });

    return METAS.map(function (meta) {
      /* Word join — identical to the generator: Set-union of topic_words
       * over topic_ids, in array order, mapped to vocabulary rows. */
      var seen = {};
      var words = [];
      (meta.topic_ids || []).forEach(function (tid) {
        (topicWords[tid] || []).forEach(function (id) {
          if (seen[id]) return;
          seen[id] = true;
          var w = wordById[id];
          if (w) words.push(w);
        });
      });

      /* Category label: hierarchy group of the first resolvable topic_id. */
      var cat = '';
      for (var i = 0; i < meta.topic_ids.length; i++) {
        if (groupOf[meta.topic_ids[i]]) { cat = groupOf[meta.topic_ids[i]]; break; }
      }

      /* Quick-check quiz — same seeded PRNG + pick logic as build.js
       * generateTopicQuiz(words, slug); the mobile card shows item #1.
       * NOTE: `sort(() => rand() - 0.5)` comparator call counts are
       * engine-specific, so picks match the static site's exactly only on V8
       * (Chrome/Android); on JSC/SpiderMonkey the quiz is a different but
       * equally valid draw — internally consistent either way, since the
       * correct index is computed from the shuffled result.
       * The generator only renders a quiz for pages with >= 8 words. */
      var quiz = null;
      if (words.length >= 8) {
        var rand = seededRandom(meta.slug);
        var shuffled = words.slice().sort(function () { return rand() - 0.5; });
        var quizWords = shuffled.slice(0, Math.min(5, words.length));
        var first = null;
        quizWords.forEach(function (w, qi) {
          var others = words.filter(function (x) { return x.id !== w.id; })
            .sort(function () { return rand() - 0.5; }).slice(0, 2);
          var allOpts = [w].concat(others).sort(function () { return rand() - 0.5; });
          if (qi === 0) {
            var correct = -1;
            var opts = allOpts.map(function (o, oi) {
              if (o.id === w.id) correct = oi;
              return o.meaning;
            });
            first = {
              word: w.word, pinyin: w.pinyin,
              q: w.word, py: w.pinyin,
              options: opts, opts: opts,
              correct: correct,
              answer: w.meaning,
              note: 'The answer is: ' + w.meaning,
            };
          }
        });
        quiz = first;
      }

      var dlg = (dialogues && dialogues[meta.slug]) || null;
      var lines = ((dlg && dlg.lines) || []).map(function (l) {
        var isA = l.s !== 'B';
        return {
          who: l.s || 'A',
          cn: l.cn, py: l.py, en: l.en,
          align: isA ? 'flex-start' : 'flex-end',
          bubbleBg: isA ? 'var(--surface-sunken)' : 'var(--accent-soft)',
        };
      });

      return {
        slug: meta.slug,
        cn: meta.cn,
        en: meta.en,
        cat: cat,
        requirement: meta.requirement,
        scene: (dlg && dlg.scene_en) || '',
        dialogue: lines,
        core: words.map(function (w) { return { id: w.id, w: w.word, py: w.pinyin, m: w.meaning }; }),
        wordCount: words.length,
        quiz: quiz,
      };
    });
  }

  /* ---- traps.json: DOMParser adapter over the pre-rendered HTML blobs ----
   * Card blob structure (verified against data): <article class="trap-card">
   * with <h3> title, <p class="trap-summary">, optional <div class="ex-wrong">
   * (first <strong> = "✗ …" bad example — present on 7 of 15), one or more
   * <div class="ex-right"> (first ✓-prefixed <strong> = good example) and a
   * <div class="trap-rule">. Quiz blob: <article class="trap-quiz-item"> with
   * .tq-stem, 3 × button.tq-opt (data-correct="1" marks the answer), .tq-explain.
   * A trap that doesn't yield the full {bad, good, explain} card shape gets
   * fallbackHtml (sanitized article) instead; the quiz parse is independent. */
  function normalizeTraps(rawCats) {
    var traps = [];
    var cats = [];
    var canDom = typeof DOMParser !== 'undefined';
    (rawCats || []).forEach(function (cat) {
      cats.push({ slug: cat.slug, letter: cat.letter, cn: cat.name_cn, en: cat.name_en, count: (cat.traps || []).length });
      (cat.traps || []).forEach(function (t) {
        var entry = {
          id: cat.slug + '-' + t.id,
          catSlug: cat.slug, catLetter: cat.letter, catCn: cat.name_cn, catEn: cat.name_en,
          title: stripNum(t.title || ''),
          bad: null, good: null, explain: null,
          quiz: null, fallbackHtml: null, quizFallbackHtml: null,
        };
        try {
          if (!canDom) throw new Error('no DOMParser');
          var doc = new DOMParser().parseFromString(t.html || '', 'text/html');
          var h3 = doc.querySelector('h3');
          if (h3) entry.title = stripNum(h3.textContent.trim());
          var sum = doc.querySelector('.trap-summary');
          if (sum) entry.explain = sum.textContent.trim();
          var wStrong = doc.querySelector('.ex-wrong strong');
          if (wStrong) {
            var wt = wStrong.textContent.trim();
            if (/^[✗×✘]/.test(wt)) entry.bad = wt.replace(/^[✗×✘]\s*/, '');
          }
          var rStrongs = doc.querySelectorAll('.ex-right strong');
          for (var i = 0; i < rStrongs.length; i++) {
            var rt = rStrongs[i].textContent.trim();
            if (/^[✓√✔]/.test(rt)) { entry.good = rt.replace(/^[✓√✔]\s*/, ''); break; }
          }
        } catch (e) {}
        if (!(entry.bad && entry.good && entry.explain)) {
          /* card shell already renders the title — drop the blob's h3 + tag chips */
          entry.fallbackHtml = externalizeLinks(sanitizeHtml(t.html || '')
            .replace(/<h3[\s\S]*?<\/h3>/i, '')
            .replace(/<span class="trap-tag[\s\S]*?<\/span>/gi, ''));
        }
        try {
          if (!canDom) throw new Error('no DOMParser');
          var qd = new DOMParser().parseFromString(t.quiz_html || '', 'text/html');
          var stem = qd.querySelector('.tq-stem');
          var optEls = qd.querySelectorAll('.tq-opt');
          var expl = qd.querySelector('.tq-explain');
          if (stem && optEls.length) {
            var opts = [];
            var correct = -1;
            for (var j = 0; j < optEls.length; j++) {
              opts.push(optEls[j].textContent.trim());
              if (optEls[j].getAttribute('data-correct') === '1') correct = j;
            }
            if (correct >= 0) {
              entry.quiz = { q: stem.textContent.trim(), opts: opts, correct: correct, note: expl ? expl.textContent.trim() : '' };
            }
          }
        } catch (e) {}
        if (!entry.quiz) entry.quizFallbackHtml = externalizeLinks(sanitizeHtml(t.quiz_html || ''));
        traps.push(entry);
      });
    });
    return { traps: traps, cats: cats };
  }

  /* ============================================================
   * Exams — lazy per-test fetch
   * ============================================================
   * Returns the RAW parsed test json ({questions, listening_audio, ...});
   * exam.js owns ALL question normalization (one normalizer, no drift —
   * a duplicate pipeline here previously diverged and was removed). */
  var qCache = {};
  D.questionsFor = function (idx) {
    if (qCache[idx]) return qCache[idx];
    var meta = D.TESTS[idx];
    if (!meta) return Promise.reject(new Error('unknown test ' + idx));
    var p = fetch('/data/' + meta.file)
      .then(function (r) { if (!r.ok) throw new Error(meta.file + ' → ' + r.status); return r.json(); });
    /* Drop failed fetches from the cache so "Begin" can retry. */
    p.catch(function () { if (qCache[idx] === p) delete qCache[idx]; });
    qCache[idx] = p;
    return p;
  };

  /* ============================================================
   * Global search
   * ============================================================ */

  function ranked(list, rankFn, cap) {
    var hits = [];
    list.forEach(function (item, i) {
      var r = rankFn(item);
      if (r != null) hits.push({ r: r, i: i, item: item });
    });
    hits.sort(function (a, b) { return a.r - b.r || a.i - b.i; });
    return hits.slice(0, cap).map(function (h) { return h.item; });
  }

  /* Rank: exact hanzi (0) > startsWith pinyinNorm/word (1) > includes in
   * pinyin/word (2) > includes in meaning (3). Caps: 8/8/4/4/4. */
  D.search = function (q) {
    var raw = String(q == null ? '' : q).trim();
    var res = { words: [], chars: [], grammar: [], pairs: [], exams: [] };
    if (!raw) return res;
    var nq = D.norm(raw);
    if (!nq) return res;
    var lower = raw.toLowerCase();

    res.words = ranked(D.WORDS, function (w) {
      if (w.word === raw) return 0;
      if (w.pinyinNorm.indexOf(nq) === 0 || w.word.indexOf(raw) === 0) return 1;
      if (w.pinyinNorm.indexOf(nq) >= 0 || w.word.indexOf(raw) >= 0) return 2;
      if (w.meaningNorm.indexOf(lower) >= 0) return 3;
      return null;
    }, 8);

    res.chars = ranked(D.CHARS, function (c) {
      if (c.char === raw) return 0;
      if (c.pinyinNorm.indexOf(nq) === 0) return 1;
      if (raw.indexOf(c.char) >= 0 || c.pinyinNorm.indexOf(nq) >= 0) return 2;
      if (c.meaningNorm.indexOf(lower) >= 0) return 3;
      return null;
    }, 8);

    res.grammar = ranked(D.GRAMMAR, function (g) {
      if (g.cn === raw) return 0;
      if (g.cn.indexOf(raw) === 0 || g.enNorm.indexOf(nq) === 0) return 1;
      if (g.cn.indexOf(raw) >= 0 || g.enNorm.indexOf(nq) >= 0 || g.structure.indexOf(raw) >= 0) return 2;
      return null;
    }, 4);

    /* Confusable pairs ('cai jiu' → 才/就) — hanzi or toneless pinyin of
     * either word, or both pinyins run together ('caijiu'). */
    res.pairs = ranked(D.CONFUSABLES, function (p) {
      if (p.a === raw || p.b === raw) return 0;
      if (p.aPyNorm.indexOf(nq) === 0 || p.bPyNorm.indexOf(nq) === 0 || p.pairPyNorm.indexOf(nq) === 0) return 1;
      if (raw.indexOf(p.a) >= 0 || raw.indexOf(p.b) >= 0 || p.aPyNorm.indexOf(nq) >= 0 || p.bPyNorm.indexOf(nq) >= 0) return 2;
      return null;
    }, 4);

    res.exams = ranked(D.TESTS, function (t) {
      if (t.titleNorm.indexOf(nq) >= 0) return 2;
      return null;
    }, 4);

    return res;
  };

  /* ============================================================
   * Loader
   * ============================================================ */

  var wordByIdMap = {};
  var charByCharMap = {};
  D.wordById = function (id) { return wordByIdMap[id] || null; };
  D.charInfo = function (ch) { return charByCharMap[ch] || null; };
  D.grammarBySlug = function (slug) {
    for (var i = 0; i < D.GRAMMAR.length; i++) if (D.GRAMMAR[i].slug === slug) return D.GRAMMAR[i];
    return null;
  };
  D.pairBySlug = function (slug) {
    for (var i = 0; i < D.CONFUSABLES.length; i++) if (D.CONFUSABLES[i].slug === slug) return D.CONFUSABLES[i];
    return null;
  };
  D.taskBySlug = function (slug) {
    for (var i = 0; i < D.TASKS.length; i++) if (D.TASKS[i].slug === slug) return D.TASKS[i];
    return null;
  };

  var loading = null;      // phase 1 (core: index + vocabulary + app-data)
  var loadingFull = null;  // phase 2 (Characters + Study catalogs)

  /* Phase 2 — the heavy catalogs (~460 KB) that only Characters + Study need.
     Streams in the background after core so first paint isn't gated on them.
     Failure resolves (readyFull = true) so those sections show an empty state,
     not a permanent spinner. */
  /* Phase-2 catalog files (Characters + Study), in the Promise.all order below.
     Named so a failure can be surfaced (D.fullErrors) and retried (D.retryFull)
     instead of silently rendering empty "0 of N" sections. */
  var REST_FILES = [
    '/data/hsk4-characters.json', '/data/hsk4-rendu-characters.json', '/data/character-data.json',
    '/data/grammar-patterns.json', '/data/confusables.json', '/data/sentences.json',
    '/data/topics.json', '/data/task-dialogues.json', '/data/traps.json'
  ];
  /* G1: which phase-2 files back each section, so one section's failure doesn't
     blank out the other (Characters and Study fail independently). */
  var CHAR_FILES = REST_FILES.slice(0, 3);
  var STUDY_FILES = REST_FILES.slice(3);
  function anyFailed(files) { return files.some(function (u) { return loadErrors.indexOf(u) >= 0; }); }
  var restAppData = null;

  function loadRest(appData) {
    if (loadingFull) return loadingFull;
    restAppData = appData || restAppData;

    /* L2: Characters and Study normalize on INDEPENDENT chains, each with its own
       catch. A throw in one section's normalizer (a fetch OK but unexpected-shape
       catalog — e.g. a null grammar/confusable slug hitting `slug.length`) sets
       only that section's error flag, so the healthy other section still renders;
       it also can't leave the app permanently stuck (retryFull re-runs both, so a
       fixed section recovers while a genuinely-bad one stays errored). Both fetch
       batches fire synchronously here, so the network behaviour is unchanged from
       the old single Promise.all. */
    var charsChain = Promise.all([
      fetchJson('/data/hsk4-characters.json', []),
      fetchJson('/data/hsk4-rendu-characters.json', []),
      fetchJson('/data/character-data.json', {}),
    ]).then(function (r) {
      var charFreq = (appData && appData.charFreq) || {};
      D.CHARS = normalizeChars(r[0], r[1], r[2], charFreq);
      charByCharMap = {};
      D.CHARS.forEach(function (c) { charByCharMap[c.char] = c; });
      D.charsError = anyFailed(CHAR_FILES);
    }).catch(function () { D.charsError = true; });

    var studyChain = Promise.all([
      fetchJson('/data/grammar-patterns.json', []),
      fetchJson('/data/confusables.json', []),
      fetchJson('/data/sentences.json', []),
      fetchJson('/data/topics.json', {}),
      fetchJson('/data/task-dialogues.json', {}),
      fetchJson('/data/traps.json', []),
    ]).then(function (r) {
      var grammar = r[0], confusables = r[1], sentences = r[2], topics = r[3], dialogues = r[4], rawTraps = r[5];

      D.GRAMMAR = normalizeGrammar(grammar);
      D.CONFUSABLES = normalizeConfusables(confusables);
      D.SENTENCE_CATS = (sentences || []).map(function (cat) {
        return {
          slug: cat.slug,
          name_cn: cat.name_cn,
          name_en: cat.name_en,
          icon: cat.icon || '',
          desc: cat.desc || '',
          sentences: (cat.sentences || []).map(function (s) {
            return { cn: decodeEntities(s.cn), py: decodeEntities(s.py), en: decodeEntities(s.en), use: decodeEntities(s.use || '') };
          }),
        };
      });

      D.TASKS = normalizeTasks(topics, wordByIdMap, dialogues, appData && appData.tasks);
      D.TOPICS = D.TASKS;

      var tr = normalizeTraps(rawTraps);
      D.TRAPS = tr.traps;
      D.TRAP_CATS = tr.cats;

      D.PRACTICE = buildPracticePool(D.GRAMMAR, D.CONFUSABLES);
      D.studyError = anyFailed(STUDY_FILES);
    }).catch(function () { D.studyError = true; });

    loadingFull = Promise.all([charsChain, studyChain]).then(function () {
      D.fullErrors = REST_FILES.filter(function (u) { return loadErrors.indexOf(u) >= 0; });
      D.readyFull = true;
      return D;
    });
    return loadingFull;
  }

  /* Retry phase 2 after a failure: clear the failed marks + cached promise so the
     files are re-fetched, then re-run loadRest with the stashed appData. */
  D.retryFull = function () {
    loadingFull = null;
    D.readyFull = false;
    D.fullErrors = [];
    D.charsError = false;
    D.studyError = false;
    loadErrors = loadErrors.filter(function (u) { return REST_FILES.indexOf(u) < 0; });
    return loadRest(restAppData);
  };

  D.load = function () {
    if (loading) return loading;
    loadErrors = [];
    /* Phase 1 — core catalogs only (index + vocabulary + app-data). Enough for the
       dashboard, Mock Exams, Vocabulary and Statistics, so first paint doesn't wait
       on the ~460 KB Characters/Study data (phase 2, loadRest). */
    loading = Promise.all([
      fetchJson('/data/index.json', []),
      fetchJson('/data/vocabulary.json', []),
      fetchJson('/data/app-data.json', {}),
    ]).then(function (res) {
      /* Either core catalog file failing → reject so boot shows the error+retry
         screen (dataError) instead of a silently-empty Mock Exams or Vocabulary.
         Clear `loading` so retryDataLoad can re-fetch. */
      if (loadErrors.indexOf('/data/index.json') >= 0 || loadErrors.indexOf('/data/vocabulary.json') >= 0) {
        loading = null;
        throw new Error('catalog load failed: ' + loadErrors.join(', '));
      }
      var index = res[0], vocab = res[1], appData = res[2];
      var vocabFreq = (appData && appData.vocabFreq) || {};

      D.TESTS = (index || []).map(function (meta, i) {
        var official = !!meta.official;
        return {
          idx: i,
          file: meta.file,
          title: meta.title,
          titleNorm: D.norm(meta.title),
          short: String(meta.title || '').replace(/^HSK 4 /, ''),
          sub: official ? 'Official HSK 4 exam' : 'Practice paper',
          glyph: official ? 'HSK4' : String(i + 1).padStart(2, '0'),
          official: official,
          q: meta.questions || 0,
        };
      });
      D.TOTAL_QUESTIONS = D.TESTS.reduce(function (s, t) { return s + t.q; }, 0);

      D.WORDS = normalizeWords(vocab, vocabFreq);
      wordByIdMap = {};
      D.WORDS.forEach(function (w) { wordByIdMap[w.id] = w; });

      D.ready = true;
      loadRest(appData);   // kick phase 2 in the background (non-blocking)
      return D;
    });
    return loading;
  };

  /* Resolves when phase 2 (Characters/Study data) is in. Characters + Study gate
     on D.readyFull / App.state.dataReadyFull until then. */
  D.loadFull = function () {
    if (loadingFull) return loadingFull;
    if (loading) return loading.then(function () { return loadingFull || D; });
    return Promise.resolve(D);
  };

})();
