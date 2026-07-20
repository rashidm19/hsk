/* app/shell.js — shell module: top app bar, bottom tab bar, HOME dashboard,
   welcome overlay (3 steps), full-screen global search.
   IIFE augmenting window.App per the /app/ contract. Markup ported from
   HSK-Prep-Mobile.dc.html lines 35-52, 54-146, 922-941, 1131-1185, 1268-1356. */
(function () {
  'use strict';

  var App = window.App = window.App || {};
  App.actions = App.actions || {};
  App.screens = App.screens || {};
  App.regions = App.regions || {};
  App.util = App.util || {};

  /* ---------- helpers ---------- */

  function esc(v) {
    var u = App.util;
    if (u && typeof u.esc === 'function') return u.esc(v);
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtToday() {
    var u = App.util;
    if (u && typeof u.fmtToday === 'function') { try { return u.fmtToday(); } catch (e) {} }
    try { return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); } catch (e) { return 'Today'; }
  }

  function shortDate(ts) {
    var u = App.util;
    if (u && typeof u.shortDate === 'function') { try { return u.shortDate(ts); } catch (e) {} }
    try { return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch (e) { return ''; }
  }

  function TESTS() { return (App.data && App.data.TESTS) || []; }
  function WORDS() { return (App.data && App.data.WORDS) || []; }

  function dayKey(d) { return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }

  /* band score /300 for one attempt (contract §Stats formulas) */
  function bandScore(a) {
    var secs = (a && a.sections) || [];
    if (!secs.length) return Math.round(((a && a.pct) || 0) * 3);
    var band = 0;
    secs.forEach(function (x) { band += x.tot ? Math.round(x.ok / x.tot * 100) : 0; });
    if (secs.length >= 3) return band;
    return Math.round(band / (secs.length * 100) * 300);
  }

  /* est score = mean bandScore of last 3 attempts */
  function estScore(attempts) {
    var last = (attempts || []).slice(-3);
    if (!last.length) return 0;
    var sum = 0;
    last.forEach(function (a) { sum += bandScore(a); });
    return Math.round(sum / last.length);
  }

  /* consecutive calendar days with >=1 attempt, counting back from today
     (today counts if it has one; else start from yesterday) */
  function calcStreak(attempts) {
    if (!attempts || !attempts.length) return 0;
    var days = {};
    attempts.forEach(function (a) { try { days[dayKey(new Date(a.ts))] = 1; } catch (e) {} });
    var cur = new Date(), streak = 0;
    if (!days[dayKey(cur)]) cur.setDate(cur.getDate() - 1);
    while (days[dayKey(cur)]) { streak++; cur.setDate(cur.getDate() - 1); }
    return streak;
  }

  /* share formulas with other modules without clobbering theirs
     (function declarations hoist, so the view-model exports below are safe) */
  if (!App.util.bandScore) App.util.bandScore = bandScore;
  if (!App.util.estScore) App.util.estScore = estScore;
  if (!App.util.calcStreak) App.util.calcStreak = calcStreak;
  if (!App.util.skillsData) App.util.skillsData = skillsData;
  if (!App.util.weeklyData) App.util.weeklyData = weeklyData;
  if (!App.util.computeHome) App.util.computeHome = computeHome;

  function scrollTop() {
    try {
      var el = document.getElementById('shell-scroll');
      if (!el) el = document.querySelector('#r-shell .hsk-scroll');
      if (el) el.scrollTop = 0;
    } catch (e) {}
  }

  function stopExamTimer() {
    try {
      if (App.exam && typeof App.exam.stopTimer === 'function') App.exam.stopTimer();
      if (App.exam && typeof App.exam.stopClip === 'function') App.exam.stopClip();
    } catch (e) {}
  }

  /* ---------- HOME view-model (contract §Home dashboard — real-data spec) ---------- */

  function skillsData(attempts) {
    var last5 = (attempts || []).slice(-5);
    var defs = [
      { name: 'Listening', cn: '听力', icon: '听', color: 'var(--gold)', soft: 'var(--gold-soft)' },
      { name: 'Reading', cn: '阅读', icon: '读', color: 'var(--jade)', soft: 'var(--jade-soft)' },
      { name: 'Writing', cn: '书写', icon: '写', color: 'var(--accent)', soft: 'var(--accent-soft)' }
    ];
    return defs.map(function (d) {
      var sum = 0, c = 0;
      last5.forEach(function (a) {
        (a.sections || []).forEach(function (x) {
          if (x.name === d.name && x.tot) { sum += x.ok / x.tot * 100; c++; }
        });
      });
      /* section-less legacy attempts: fall back to overall pct — identical to
         Stats skillRows (contract: dashboard skills = Stats skills) */
      if (!c) last5.forEach(function (a) { if (a.pct != null) { sum += a.pct; c++; } });
      var score = c ? Math.round(sum / c) : 0;
      return { name: d.name, cn: d.cn, icon: d.icon, color: d.color, soft: d.soft, score: score, w: score + '%' };
    });
  }

  function weeklyData(attempts) {
    var now = new Date();
    var mon = new Date(now); mon.setHours(0, 0, 0, 0); mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    var counts = [0, 0, 0, 0, 0, 0, 0];
    (attempts || []).forEach(function (a) {
      try {
        var d = new Date(a.ts); d.setHours(0, 0, 0, 0);
        var diff = Math.round((d - mon) / 864e5);
        if (diff >= 0 && diff < 7) counts[diff]++;
      } catch (e) {}
    });
    var max = Math.max.apply(null, counts.concat([1]));
    var names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return counts.map(function (c, i) {
      return { day: names[i], h: c ? (Math.max(30, Math.round(c / max * 100)) + '%') : '8%', color: c ? 'var(--jade)' : 'var(--surface-sunken)' };
    });
  }

  function computeHome(s) {
    var tests = TESTS();
    var attempts = s.attempts || [];
    var n = attempts.length;
    var masteredCount = (s.vMastered || []).length;
    var dueCount = Math.max(0, (WORDS().length || 0) - masteredCount);
    var first = ((s.profile && s.profile.name) || '').trim().split(/\s+/)[0] || '';
    var est = estScore(attempts);
    var goalScore = s.goalScore || 250;
    var gap = goalScore - est;

    var heading, headingCn, sub;
    if (n === 0) {
      heading = 'Welcome' + (first ? ', ' + first : '');
      headingCn = '你好';
      sub = 'Set your baseline — take your first mock';
    } else {
      heading = 'Welcome back' + (first ? ', ' + first : '');
      headingCn = '加油';
      sub = gap > 0 ? (gap + ' points to your ' + goalScore + ' goal') : 'Goal reached — keep it sharp';
    }

    /* next unattempted test */
    var doneMap = {};
    attempts.forEach(function (a) { doneMap[a.testIdx] = 1; });
    var nextIdx = -1;
    for (var i = 0; i < tests.length; i++) { if (!doneMap[i]) { nextIdx = i; break; } }
    if (nextIdx < 0) nextIdx = tests.length ? ((attempts.length ? (attempts[attempts.length - 1].testIdx + 1) : 0) % tests.length) : 0;

    /* today's attempt (latest today) */
    var tk = dayKey(new Date());
    var todayAttempt = null;
    for (var j = attempts.length - 1; j >= 0; j--) {
      try { if (dayKey(new Date(attempts[j].ts)) === tk) { todayAttempt = attempts[j]; break; } } catch (e) {}
    }

    var nextShort = tests[nextIdx] ? (tests[nextIdx].short || tests[nextIdx].title || ('#' + (nextIdx + 1))) : ('#' + (nextIdx + 1));
    var t1 = n === 0
      ? { title: 'Diagnostic mock', cn: '模拟', sub: 'Take it to set your baseline', icon: '模', iconBg: 'var(--accent-soft)', iconFg: 'var(--accent)', kind: 'mock', testIdx: 0, done: !!todayAttempt, score: todayAttempt ? (todayAttempt.pct + '%') : '' }
      : { title: 'Mock exam', cn: '模拟', sub: 'Paper ' + nextShort, icon: '模', iconBg: 'var(--accent-soft)', iconFg: 'var(--accent)', kind: 'mock', testIdx: nextIdx, done: !!todayAttempt, score: todayAttempt ? (todayAttempt.pct + '%') : '' };
    var t2 = { title: 'Vocabulary review', cn: '词汇', sub: Math.min(dueCount, 20) + ' cards to review', icon: '词', iconBg: 'var(--jade-soft)', iconFg: 'var(--jade)', kind: 'cards', done: dueCount === 0, score: '' };
    /* subtitle names patterns that exist in the real 8-pattern catalog */
    var t3 = { title: 'Grammar patterns', cn: '语法', sub: '尽管 · 只有 · 连 structures', icon: '语', iconBg: 'var(--gold-soft)', iconFg: 'var(--gold)', kind: 'grammar', done: false, score: '' };
    var tasks = [t1, t2, t3];

    var firstPending = -1;
    tasks.forEach(function (t, k) {
      t.pending = !t.done;
      if (t.pending && firstPending < 0) firstPending = k;
      t.rowBg = 'transparent';
    });
    if (firstPending >= 0) tasks[firstPending].rowBg = 'var(--surface-sunken)';

    var planDone = tasks.filter(function (t) { return t.done; }).length;

    return {
      n: n,
      heading: heading, headingCn: headingCn, sub: sub,
      tasks: tasks, firstPending: firstPending, nextIdx: nextIdx,
      planDone: planDone, planTotal: 3,
      planPct: Math.round(planDone / 3 * 100) + '%',
      planSub: '≈ 25 min · ' + (n === 0 ? 'start with a diagnostic' : 'keep the streak alive'),
      planTitle: firstPending >= 0 ? tasks[firstPending].title : 'Start another mock',
      goal: {
        level: s.goalLevel || 'HSK 4',
        est: n === 0 ? '—' : String(est),
        target: goalScore,
        w: (n === 0 || !goalScore) ? '0%' : (Math.max(0, Math.min(100, Math.round(est / goalScore * 100))) + '%'),
        pass: 180, tests: n
      },
      showSkills: n > 0,
      skills: skillsData(attempts),
      weekly: weeklyData(attempts),
      hasRecent: n > 0,
      recent: attempts.slice(-3).reverse().map(function (a) {
        var t = tests[a.testIdx];
        return {
          title: t ? (t.short || t.title) : (a.title || ('Test ' + (a.testIdx + 1))),
          date: shortDate(a.ts), score: a.pct,
          color: a.pct >= 60 ? 'var(--jade)' : 'var(--accent)'
        };
      })
    };
  }

  /* ---------- markup: top app bar (prototype 40-49; 44px touch targets per contract) ---------- */

  var SVG_SEARCH = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>';
  var SVG_MOON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>';
  var SVG_SUN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/></svg>';
  var SVG_FLAME = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5Z"/></svg>';
  var SVG_PLAY = '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  var SVG_PLAY_SM = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  var SVG_CHEV = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--mist)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';
  var SVG_TARGET = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></svg>';

  function topBar(s) {
    var isLight = s.theme !== 'dark';
    var streak = calcStreak(s.attempts || []);
    var streakLabel = 'Study streak — ' + streak + ' days';
    var streakBtn = streak > 0
      ? '<button type="button" class="pa" data-a="goStats" aria-label="' + esc(streakLabel) + '" title="' + esc(streakLabel) + '" style="display:flex;align-items:center;gap:6px;border:1px solid var(--gold-border);background:var(--gold-soft);border-radius:99px;padding:5px 12px 5px 10px;min-height:44px;cursor:pointer">'
        + '<span style="display:inline-flex;color:var(--gold)">' + SVG_FLAME + '</span>'
        + '<span style="font-weight:700;font-size:1rem;color:var(--gold);line-height:1">' + streak + '</span>'
        + '<span style="font-size:.52rem;line-height:1.05;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--gold);opacity:.8;text-align:left">day<br>streak</span>'
        + '</button>'
      : '';
    return '<div style="flex:none;display:flex;align-items:center;gap:11px;padding:14px 18px 12px;background:color-mix(in srgb, var(--paper) 86%, transparent);backdrop-filter:blur(12px);border-bottom:1px solid var(--border-subtle);z-index:5">'
      + '<span class="serif-cn" style="width:34px;height:34px;flex:none;display:grid;place-items:center;background:var(--accent);color:#fff8f1;border-radius:10px;font-size:19px;font-weight:700"><span style="display:block;line-height:1;transform:translate(-0.02em,-0.08em)">汉</span></span>'
      + '<span style="font-weight:700;font-size:1.05rem;letter-spacing:-.02em;color:var(--ink)">HSK Prep</span>'
      + '<span style="flex:1"></span>'
      + '<button type="button" class="pa" data-a="openSearch" aria-label="Search" style="width:44px;height:44px;flex:none;display:grid;place-items:center;border:1px solid var(--border-subtle);background:var(--surface);border-radius:11px;cursor:pointer;color:var(--ink)">' + SVG_SEARCH + '</button>'
      + '<button type="button" class="pa" data-a="toggleTheme" aria-label="Toggle dark mode" style="width:44px;height:44px;flex:none;display:grid;place-items:center;border:1px solid var(--border-subtle);background:var(--surface);border-radius:11px;cursor:pointer;color:var(--ink)">' + (isLight ? SVG_MOON : SVG_SUN) + '</button>'
      + streakBtn
      + '</div>';
  }

  /* ---------- markup: bottom tab bar (prototype 922-941) ---------- */

  var NAV_ICONS = {
    home: '<path d="M3 9.5 12 3l9 6.5"/><path d="M5 10v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10"/>',
    exams: '<path d="M8 3h8a2 2 0 0 1 2 2v15l-6-3-6 3V5a2 2 0 0 1 2-2z"/>',
    vocab: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>',
    more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>'
  };

  function navBtn(tab, action, label, active) {
    var fg = active ? 'var(--accent)' : 'var(--stone)';
    var fw = active ? '700' : '600';
    /* prototype binds the icon fill dynamically — active tab's icon is filled */
    var fill = active ? 'currentColor' : 'none';
    return '<button type="button" class="pa" data-a="' + action + '" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;border:0;background:transparent;cursor:pointer;padding:6px 0;color:' + fg + '">'
      + '<svg width="24" height="24" viewBox="0 0 24 24" fill="' + fill + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + NAV_ICONS[tab] + '</svg>'
      + '<span style="font-size:.66rem;font-weight:' + fw + '">' + label + '</span>'
      + '</button>';
  }

  function tabBar(s) {
    return '<div style="flex:none;display:flex;align-items:stretch;background:color-mix(in srgb, var(--surface) 92%, transparent);backdrop-filter:blur(14px);border-top:1px solid var(--border-subtle);padding:8px 8px calc(8px + env(safe-area-inset-bottom))">'
      + navBtn('home', 'goHome', 'Dashboard', s.tab === 'home')
      + navBtn('exams', 'goExams', 'Exams', s.tab === 'exams')
      + navBtn('vocab', 'goVocab', 'Words', s.tab === 'vocab')
      + navBtn('more', 'goMore', 'More', s.tab === 'more')
      + '</div>';
  }

  /* ---------- markup: HOME dashboard (prototype 54-146) ---------- */

  function homeScreen(s) {
    var h = computeHome(s);

    var tasksHtml = h.tasks.map(function (t, i) {
      var right = t.done
        ? '<span style="display:inline-flex;align-items:center;gap:5px;color:var(--jade);font-weight:700;font-size:.82rem;background:var(--jade-soft);padding:5px 10px;border-radius:99px">✓' + (t.score ? ' ' + esc(t.score) : '') + '</span>'
        : '<span style="width:34px;height:34px;flex:none;display:grid;place-items:center;background:var(--accent);color:#fff8f1;border-radius:10px">' + SVG_PLAY_SM + '</span>';
      return '<button type="button" class="pa" data-a="startTask" data-argn="' + i + '" style="display:flex;align-items:center;gap:13px;width:100%;text-align:left;border:0;background:' + t.rowBg + ';border-radius:13px;padding:13px 12px;cursor:pointer">'
        + '<span class="chinese" style="width:44px;height:44px;flex:none;display:grid;place-items:center;background:' + t.iconBg + ';color:' + t.iconFg + ';border-radius:12px;font-size:1.15rem;font-weight:700">' + esc(t.icon) + '</span>'
        + '<span style="flex:1;min-width:0">'
        + '<span style="display:block;font-weight:600;color:var(--ink);font-size:.98rem">' + esc(t.title) + '</span>'
        + '<span style="display:block;font-size:.82rem;color:var(--stone)"><span class="chinese">' + esc(t.cn) + '</span> · ' + esc(t.sub) + '</span>'
        + '</span>'
        + right
        + '</button>';
    }).join('');

    var skillsHtml = !h.showSkills ? '' :
      '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:18px;box-shadow:var(--shadow);padding:18px;margin-top:16px">'
      + '<div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700;margin-bottom:15px">Skill estimate · /100</div>'
      + '<div style="display:flex;flex-direction:column;gap:15px">'
      + h.skills.map(function (sk) {
        return '<div style="display:flex;align-items:center;gap:12px">'
          + '<span class="chinese" style="width:34px;height:34px;flex:none;display:grid;place-items:center;background:' + sk.soft + ';color:' + sk.color + ';border-radius:10px;font-size:16px;font-weight:700">' + esc(sk.icon) + '</span>'
          + '<div style="flex:1;min-width:0">'
          + '<div style="display:flex;justify-content:space-between;font-size:.85rem;margin-bottom:5px"><span style="color:var(--ink);font-weight:600">' + esc(sk.name) + ' <span class="chinese" style="color:var(--stone);font-weight:400">' + esc(sk.cn) + '</span></span><span style="font-weight:700;color:var(--ink)">' + sk.score + '</span></div>'
          + '<div style="height:6px;border-radius:99px;background:var(--surface-sunken);overflow:hidden"><div style="height:100%;width:' + sk.w + ';background:' + sk.color + ';border-radius:99px"></div></div>'
          + '</div>'
          + '</div>';
      }).join('')
      + '</div>'
      + '</div>';

    var weeklyHtml = '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:18px;box-shadow:var(--shadow);padding:18px;margin-top:16px">'
      + '<div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700">This week · <span class="chinese">本周</span></div>'
      + '<div style="display:flex;align-items:flex-end;gap:8px;height:84px;margin-top:14px">'
      + h.weekly.map(function (d) {
        return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end">'
          + '<div style="width:100%;border-radius:6px 6px 3px 3px;background:' + d.color + ';height:' + d.h + '"></div>'
          + '<span style="font-size:.68rem;color:var(--stone)">' + esc(d.day) + '</span>'
          + '</div>';
      }).join('')
      + '</div>'
      + '</div>';

    var recentHtml = !h.hasRecent ? '' :
      '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:18px;box-shadow:var(--shadow);padding:18px;margin-top:16px">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><span style="font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700">Recent tests</span><button type="button" data-a="goHistory" style="border:0;background:transparent;color:var(--accent);font-weight:600;font-size:.85rem;cursor:pointer">View all →</button></div>'
      + h.recent.map(function (r) {
        return '<button type="button" class="pa" data-a="goHistory" style="display:flex;align-items:center;gap:12px;width:100%;border:0;background:transparent;text-align:left;padding:12px 4px;cursor:pointer;border-top:1px solid var(--border-subtle)">'
          + '<div style="flex:1;min-width:0"><div style="font-weight:600;color:var(--ink);font-size:.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(r.title) + '</div><div style="font-size:.74rem;color:var(--stone)">Taken ' + esc(r.date) + '</div></div>'
          + '<span style="font-weight:700;font-size:1rem;color:' + r.color + '">' + r.score + '%</span>'
          + '</button>';
      }).join('')
      + '</div>';

    return '<div data-screen-label="Dashboard" style="padding:20px 16px 108px;animation:hsk-fade .35s ease both">'
      + '<div style="margin-bottom:18px">'
      + '<div style="font-size:.8rem;color:var(--stone);font-weight:600">' + esc(fmtToday()) + '</div>'
      + '<h1 style="margin:3px 0 0;font-size:1.5rem;font-weight:700;letter-spacing:-.02em;color:var(--ink)">' + esc(h.heading) + ' <span class="serif-cn" style="color:var(--accent);font-weight:400;font-size:.7em">' + esc(h.headingCn) + '</span></h1>'
      + '<p style="margin:5px 0 0;color:var(--stone);font-size:.9rem">' + esc(h.sub) + '</p>'
      + '</div>'

      /* today's plan hero */
      + '<div style="position:relative;overflow:hidden;background:linear-gradient(135deg,var(--accent),var(--accent-hover));color:#fff8f1;border-radius:22px;padding:22px;box-shadow:var(--shadow-lg)">'
      + '<span class="serif-cn" aria-hidden="true" style="position:absolute;right:-18px;bottom:-56px;font-size:180px;line-height:1;opacity:.13;color:#fff">学</span>'
      + '<div style="position:relative;z-index:1">'
      + '<div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.12em;font-weight:700;opacity:.9">Today\'s plan · <span class="chinese">今日计划</span></div>'
      + '<div style="font-size:1.5rem;font-weight:700;margin-top:8px">' + h.planDone + ' of ' + h.planTotal + ' tasks done</div>'
      + '<div style="opacity:.9;margin-top:3px;font-size:.9rem">' + esc(h.planSub) + '</div>'
      + '<div style="height:9px;border-radius:99px;background:rgba(255,248,241,.28);margin-top:16px;overflow:hidden"><div style="height:100%;width:' + h.planPct + ';background:#fff8f1;border-radius:99px"></div></div>'
      + '<button type="button" class="pa" data-a="startToday" style="display:flex;align-items:center;justify-content:center;gap:9px;width:100%;margin-top:16px;background:#fff8f1;color:var(--accent);border:0;border-radius:13px;padding:14px;font-weight:700;font-size:1rem;cursor:pointer">'
      + SVG_PLAY + ' ' + esc(h.planTitle)
      + '</button>'
      + '</div>'
      + '</div>'

      /* task list */
      + '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:18px;box-shadow:var(--shadow);padding:7px;margin-top:16px">'
      + tasksHtml
      + '</div>'

      /* goal card */
      + '<div style="position:relative;background:var(--surface);border:1px solid var(--border-subtle);border-left:3px solid var(--jade);border-radius:20px;padding:20px;box-shadow:var(--shadow);margin-top:16px">'
      + '<div style="position:absolute;top:16px;right:16px;color:var(--jade)">' + SVG_TARGET + '</div>'
      + '<div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.12em;font-weight:700;color:var(--stone)">Your goal · <span class="chinese">目标</span></div>'
      + '<div style="display:flex;align-items:baseline;gap:9px;margin-top:6px"><span style="font-size:2rem;font-weight:700;line-height:1;color:var(--ink)">' + esc(h.goal.level) + '</span><span style="color:var(--stone);font-size:.85rem">on your first try</span></div>'
      + '<div style="font-size:.85rem;color:var(--stone);margin-top:9px">Est. score <b style="color:var(--ink)">' + esc(h.goal.est) + '</b> / ' + h.goal.target + '</div>'
      + '<div style="height:8px;border-radius:99px;background:var(--surface-sunken);margin-top:7px;overflow:hidden"><div style="height:100%;width:' + h.goal.w + ';background:var(--jade);border-radius:99px"></div></div>'
      + '<div style="display:flex;justify-content:space-between;font-size:.72rem;color:var(--stone);margin-top:7px"><span>Pass at ' + h.goal.pass + ' ✓</span><span>' + h.goal.tests + ' tests done</span></div>'
      + '</div>'

      + skillsHtml
      + weeklyHtml
      + recentHtml
      + '</div>';
  }

  App.screens.home = homeScreen;

  /* ---------- markup: welcome overlay (prototype 1131-1185, welcomeVals 1958-1975) ---------- */

  var LEVEL_ORDER = ['HSK 3', 'HSK 4', 'HSK 5', 'HSK 6', 'HSK 2', 'HSK 1'];
  var LEVEL_WORDS = { 'HSK 1': '150 词', 'HSK 2': '300 词', 'HSK 3': '600 词', 'HSK 4': '1200 词', 'HSK 5': '2500 词', 'HSK 6': '5000+ 词' };
  var SCORE_OPTS = [{ val: 180, tag: 'Pass' }, { val: 250, tag: 'Strong' }, { val: 280, tag: 'Top' }];

  function welcomeHtml(s) {
    var step = s.welcomeStep || 0;
    var dots = [0, 1, 2].map(function (i) {
      return '<div style="flex:1;height:4px;border-radius:99px;background:' + (i <= step ? 'var(--accent)' : 'var(--surface-sunken)') + '"></div>';
    }).join('');

    var body = '';
    if (step === 0) {
      body = '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:30px 26px;animation:hsk-up .35s ease both">'
        + '<div style="position:relative;width:130px;height:130px;display:grid;place-items:center;background:linear-gradient(135deg,var(--accent),var(--accent-hover));border-radius:34px;box-shadow:var(--shadow-lg)"><span class="serif-cn" style="font-size:74px;color:#fff8f1;font-weight:700;line-height:1">汉</span></div>'
        + '<h1 style="margin:28px 0 0;font-size:1.8rem;font-weight:700;letter-spacing:-.02em;color:var(--ink)">Welcome to HSK Prep</h1>'
        + '<div class="serif-cn" style="font-size:1.15rem;color:var(--accent);margin-top:4px">你的 HSK 之路</div>'
        + '<p style="margin:14px 0 0;color:var(--stone);font-size:1rem;line-height:1.6;max-width:300px">Everything you need to pass HSK 4 — mock exams, a smart word bank and daily practice, in one place.</p>'
        + '</div>';
    } else if (step === 1) {
      var levels = LEVEL_ORDER.map(function (n) {
        var on = s.goalLevel === n;
        var bd = on ? 'var(--accent)' : 'var(--border-subtle)', bg = on ? 'var(--accent-soft)' : 'var(--surface)', fg = on ? 'var(--accent)' : 'var(--ink)';
        return '<button type="button" class="pa" data-a="setGoalLevel" data-arg="' + esc(n) + '" style="border:2px solid ' + bd + ';background:' + bg + ';color:' + fg + ';border-radius:15px;padding:16px 6px;cursor:pointer;font-weight:700;text-align:center"><div style="font-size:1.05rem">' + esc(n) + '</div><div class="chinese" style="font-size:.68rem;font-weight:600;opacity:.75;margin-top:2px">' + esc(LEVEL_WORDS[n]) + '</div></button>';
      }).join('');
      var scores = SCORE_OPTS.map(function (o) {
        var on = s.goalScore === o.val;
        var bd = on ? 'var(--accent)' : 'var(--border-subtle)', bg = on ? 'var(--accent-soft)' : 'var(--surface)', fg = on ? 'var(--accent)' : 'var(--ink)';
        return '<button type="button" class="pa" data-a="setGoalScore" data-argn="' + o.val + '" style="flex:1;border:2px solid ' + bd + ';background:' + bg + ';color:' + fg + ';border-radius:13px;padding:14px 6px;cursor:pointer;font-weight:700"><div style="font-size:1.15rem">' + o.val + '</div><div style="font-size:.66rem;font-weight:600;opacity:.75">' + esc(o.tag) + '</div></button>';
      }).join('');
      body = '<div style="padding:20px 22px;animation:hsk-up .35s ease both">'
        + '<h1 style="margin:0;font-size:1.55rem;font-weight:700;letter-spacing:-.02em;color:var(--ink)">Set your goal</h1>'
        + '<p style="margin:6px 0 22px;color:var(--stone);font-size:.95rem">Which level are you aiming for?</p>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">' + levels + '</div>'
        + '<p style="margin:26px 0 12px;color:var(--stone);font-size:.95rem;font-weight:600">Target score <span style="color:var(--mist);font-weight:400">· pass is 180 / 300</span></p>'
        + '<div style="display:flex;gap:10px">' + scores + '</div>'
        + '</div>';
    } else {
      var testCount = TESTS().length || 14;
      body = '<div style="padding:20px 22px;animation:hsk-up .35s ease both">'
        + '<div style="text-align:center;margin-bottom:22px"><div style="color:var(--accent);display:flex;justify-content:center"><svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></svg></div><h1 style="margin:8px 0 0;font-size:1.55rem;font-weight:700;letter-spacing:-.02em;color:var(--ink)">You\'re all set</h1><p style="margin:6px 0 0;color:var(--stone);font-size:.95rem">Your personalised plan is ready.</p></div>'
        + '<div style="background:var(--surface);border:1px solid var(--border-subtle);border-radius:18px;box-shadow:var(--shadow);padding:6px 6px 6px;overflow:hidden">'
        + '<div style="display:flex;align-items:center;gap:13px;padding:15px 14px;border-bottom:1px solid var(--border-subtle)"><span class="chinese" style="width:42px;height:42px;flex:none;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent);border-radius:12px;font-weight:700;font-size:.82rem">目标</span><div style="flex:1"><div style="font-weight:600;color:var(--ink);font-size:.95rem">Goal</div><div style="font-size:.82rem;color:var(--stone)">' + esc(s.goalLevel || 'HSK 4') + ' · target ' + (s.goalScore || 250) + ' / 300</div></div></div>'
        + '<div style="display:flex;align-items:center;gap:13px;padding:15px 14px;border-bottom:1px solid var(--border-subtle)"><span class="chinese" style="width:42px;height:42px;flex:none;display:grid;place-items:center;background:var(--jade-soft);color:var(--jade);border-radius:12px;font-size:20px">词</span><div style="flex:1"><div style="font-weight:600;color:var(--ink);font-size:.95rem">1,200-word bank</div><div style="font-size:.82rem;color:var(--stone)">Swipe flashcards · mark what you know</div></div></div>'
        + '<div style="display:flex;align-items:center;gap:13px;padding:15px 14px"><span class="chinese" style="width:42px;height:42px;flex:none;display:grid;place-items:center;background:var(--gold-soft);color:var(--gold);border-radius:12px;font-size:20px">模</span><div style="flex:1"><div style="font-weight:600;color:var(--ink);font-size:.95rem">' + testCount + ' mock exams</div><div style="font-size:.82rem;color:var(--stone)">Auto-scored, full HSK 4 format</div></div></div>'
        + '</div>'
        + '</div>';
    }

    var cta = step === 0 ? 'Get started' : step === 1 ? 'Continue' : 'Enter HSK Prep';
    var backBtn = step > 0
      ? '<button type="button" class="pa" data-a="wBack" aria-label="Back" style="width:52px;height:52px;flex:none;display:grid;place-items:center;border:1.5px solid var(--border-subtle);background:var(--surface);border-radius:14px;cursor:pointer;color:var(--ink)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>'
      : '';

    return '<div data-screen-label="Welcome" style="position:absolute;inset:0;z-index:90;background:var(--paper);display:flex;flex-direction:column;animation:hsk-fade .3s ease both">'
      + '<div style="flex:none;display:flex;align-items:center;gap:8px;padding:calc(16px + env(safe-area-inset-top)) 18px 8px">'
      + dots
      + '<button type="button" data-a="wSkip" style="flex:none;border:0;background:transparent;color:var(--stone);font-weight:600;font-size:.82rem;cursor:pointer;padding:4px 6px;margin-left:6px">Skip</button>'
      + '</div>'
      + '<div class="hsk-scroll" style="flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column">' + body + '</div>'
      + '<div style="flex:none;display:flex;align-items:center;gap:11px;padding:12px 18px calc(18px + env(safe-area-inset-bottom));border-top:1px solid var(--border-subtle);background:var(--surface)">'
      + backBtn
      + '<button type="button" class="pa" data-a="wNext" style="flex:1;display:flex;align-items:center;justify-content:center;gap:9px;border:0;background:var(--accent);color:#fff8f1;border-radius:14px;padding:16px;font-weight:700;font-size:1rem;cursor:pointer">' + cta + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></button>'
      + '</div>'
      + '</div>';
  }

  /* ---------- markup: global search (prototype 1268-1356) ---------- */

  function doSearch(q) {
    try { if (App.data && typeof App.data.search === 'function') return App.data.search(q) || {}; } catch (e) {}
    return {};
  }

  function searchResultsHtml(s) {
    var q = (s.gQuery || '').trim();

    if (!q) {
      var sugg = (App.data && (App.data.SUGGESTIONS || App.data.SEARCH_SUGGESTIONS)) || ['旅行', 'cai jiu', '只有…才', 'listening', 'mock'];
      return '<div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700;margin-bottom:12px">Try searching</div>'
        + '<div style="display:flex;flex-wrap:wrap;gap:9px">'
        + sugg.map(function (t) {
          return '<button type="button" class="chinese pa" data-a="setQuery" data-arg="' + esc(t) + '" style="border:1px solid var(--border-subtle);background:var(--surface);border-radius:99px;padding:9px 15px;font-size:.88rem;color:var(--ink);cursor:pointer">' + esc(t) + '</button>';
        }).join('')
        + '</div>'
        + '<div style="display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px;margin-top:64px;color:var(--stone)">'
        + '<svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="var(--mist)" stroke-width="1.6" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>'
        + '<div style="font-size:.9rem;max-width:240px;line-height:1.6">Search your word bank, characters, grammar patterns and mock exams — in Chinese, pinyin or English.</div>'
        + '</div>';
    }

    var r = doSearch(q);
    var words = r.words || [], chars = r.chars || [], grammar = r.grammar || [], pairs = r.pairs || [], exams = r.exams || [];

    if (!words.length && !chars.length && !grammar.length && !pairs.length && !exams.length) {
      return '<div style="display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px;margin-top:74px;color:var(--stone)">'
        + '<div style="font-size:2.2rem;opacity:.55">🔍</div>'
        + '<div style="font-weight:700;color:var(--ink);font-size:1rem">No matches</div>'
        + '<div style="font-size:.88rem;max-width:250px;line-height:1.6">Nothing for “<b class="chinese" style="color:var(--ink)">' + esc(q) + '</b>”. Try a pinyin, a character, or an English meaning.</div>'
        + '</div>';
    }

    var out = '';

    if (words.length) {
      out += '<div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700;margin:2px 0 10px">Words <span class="chinese" style="font-weight:400">词汇</span></div>'
        + '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:22px">'
        + words.map(function (w) {
          var argAttr = (typeof w.id === 'number') ? ('data-argn="' + w.id + '"') : ('data-arg="' + esc(w.id) + '"');
          return '<button type="button" class="pa" data-a="pickWord" ' + argAttr + ' style="display:flex;align-items:center;gap:12px;width:100%;text-align:left;background:var(--surface);border:1px solid var(--border-subtle);border-radius:14px;box-shadow:var(--shadow);padding:13px 15px;cursor:pointer">'
            + '<span class="chinese" style="font-size:1.15rem;font-weight:700;color:var(--ink)">' + esc(w.word) + '</span>'
            + '<span style="font-size:.82rem;color:var(--accent);font-weight:600">' + esc(w.pinyin) + '</span>'
            + '<span style="flex:1;min-width:0;font-size:.82rem;color:var(--stone);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(w.meaning) + '</span>'
            + SVG_CHEV
            + '</button>';
        }).join('')
        + '</div>';
    }

    if (chars.length) {
      out += '<div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700;margin:2px 0 10px">Characters <span class="chinese" style="font-weight:400">汉字</span></div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:22px">'
        + chars.map(function (c) {
          return '<button type="button" class="pa" data-a="pickChar" data-arg="' + esc(c.char) + '" style="display:flex;align-items:center;gap:11px;width:100%;text-align:left;background:var(--surface);border:1px solid var(--border-subtle);border-radius:14px;box-shadow:var(--shadow);padding:11px 13px;cursor:pointer">'
            + '<span class="serif-cn" style="font-size:1.7rem;line-height:1;color:var(--ink);font-weight:700">' + esc(c.char) + '</span>'
            + '<div style="flex:1;min-width:0"><div style="font-size:.8rem;color:var(--accent);font-weight:600">' + esc(c.pinyin) + '</div><div style="font-size:.74rem;color:var(--stone);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(c.meaning) + '</div></div>'
            + '</button>';
        }).join('')
        + '</div>';
    }

    if (grammar.length) {
      out += '<div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700;margin:2px 0 10px">Grammar <span class="chinese" style="font-weight:400">语法</span></div>'
        + '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:22px">'
        + grammar.map(function (g) {
          return '<button type="button" class="pa" data-a="pickGrammar" data-arg="' + esc(g.slug) + '" style="display:flex;align-items:center;gap:12px;width:100%;text-align:left;background:var(--surface);border:1px solid var(--border-subtle);border-radius:14px;box-shadow:var(--shadow);padding:13px 15px;cursor:pointer">'
            + '<span class="serif-cn" style="width:40px;height:40px;flex:none;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent);border-radius:11px;font-size:1rem;font-weight:700">' + esc(g.cn) + '</span>'
            + '<div style="flex:1;min-width:0"><div style="font-weight:600;color:var(--ink);font-size:.92rem">' + esc(g.en) + '</div><div style="font-size:.78rem;color:var(--stone);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(g.structure) + '</div></div>'
            + SVG_CHEV
            + '</button>';
        }).join('')
        + '</div>';
    }

    if (pairs.length) {
      out += '<div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700;margin:2px 0 10px">Confusables <span class="chinese" style="font-weight:400">近义词</span></div>'
        + '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:22px">'
        + pairs.map(function (p) {
          return '<button type="button" class="pa" data-a="pickPair" data-arg="' + esc(p.slug) + '" style="display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:var(--surface);border:1px solid var(--border-subtle);border-radius:14px;box-shadow:var(--shadow);padding:13px 15px;cursor:pointer">'
            + '<span class="serif-cn" style="font-size:1.15rem;font-weight:700;color:var(--ink)">' + esc(p.a) + '</span>'
            + '<span style="font-size:.78rem;color:var(--mist)">vs</span>'
            + '<span class="serif-cn" style="font-size:1.15rem;font-weight:700;color:var(--jade)">' + esc(p.b) + '</span>'
            + '<span style="flex:1;min-width:0;font-size:.78rem;color:var(--stone);text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(p.cat) + '</span>'
            + SVG_CHEV
            + '</button>';
        }).join('')
        + '</div>';
    }

    if (exams.length) {
      out += '<div style="font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);font-weight:700;margin:2px 0 10px">Exams <span class="chinese" style="font-weight:400">考试</span></div>'
        + '<div style="display:flex;flex-direction:column;gap:8px">'
        + exams.map(function (e) {
          var idx = (typeof e.idx === 'number') ? e.idx : ((typeof e.i === 'number') ? e.i : 0);
          var meta = e.meta || ((e.official ? 'Official HSK 4 exam' : 'Practice paper') + (e.q ? (' · ' + e.q + ' questions') : ''));
          return '<button type="button" class="pa" data-a="pickExam" data-argn="' + idx + '" style="display:flex;align-items:center;gap:12px;width:100%;text-align:left;background:var(--surface);border:1px solid var(--border-subtle);border-radius:14px;box-shadow:var(--shadow);padding:13px 15px;cursor:pointer">'
            + '<span style="width:40px;height:40px;flex:none;display:grid;place-items:center;background:var(--jade-soft);color:var(--jade);border-radius:11px"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3h8a2 2 0 0 1 2 2v15l-6-3-6 3V5a2 2 0 0 1 2-2z"/></svg></span>'
            + '<div style="flex:1;min-width:0"><div style="font-weight:600;color:var(--ink);font-size:.92rem">' + esc(e.title) + '</div><div style="font-size:.78rem;color:var(--stone)">' + esc(meta) + '</div></div>'
            + SVG_CHEV
            + '</button>';
        }).join('')
        + '</div>';
    }

    return out;
  }

  function searchHtml(s) {
    return '<div data-screen-label="Search" style="position:absolute;inset:0;z-index:90;display:flex;flex-direction:column;background:var(--paper);animation:hsk-fade .2s ease both">'
      + '<div style="flex:none;display:flex;align-items:center;gap:10px;padding:14px 14px 12px;background:color-mix(in srgb, var(--paper) 88%, transparent);backdrop-filter:blur(12px);border-bottom:1px solid var(--border-subtle)">'
      + '<label style="flex:1;display:flex;align-items:center;gap:9px;background:var(--surface);border:1px solid var(--border-subtle);border-radius:13px;padding:11px 14px;box-shadow:var(--shadow)">'
      + '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--stone)" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>'
      + '<input type="text" id="g-search" value="' + esc(s.gQuery || '') + '" data-in="onGQuery" placeholder="Words, characters, grammar, exams…" style="flex:1;min-width:0;border:0;background:transparent;outline:none;font-size:.95rem;color:var(--ink)">'
      + '<button type="button" id="g-clear" data-a="clearQuery" aria-label="Clear" style="width:20px;height:20px;flex:none;display:' + ((s.gQuery || '').length ? 'grid' : 'none') + ';place-items:center;border:0;background:var(--surface-sunken);border-radius:99px;color:var(--stone);cursor:pointer"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>'
      + '</label>'
      + '<button type="button" class="pa" data-a="closeSearch" style="flex:none;border:0;background:transparent;color:var(--accent);font-weight:700;font-size:.9rem;cursor:pointer;padding:6px 4px">Cancel</button>'
      + '</div>'
      + '<div class="hsk-scroll" style="flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:18px 16px calc(24px + env(safe-area-inset-bottom))">'
      + '<div id="search-results">' + searchResultsHtml(s) + '</div>'
      + '</div>'
      + '</div>';
  }

  /* ---------- regions ---------- */

  function loadingHtml() {
    return '<div style="display:flex;flex-direction:column;height:100%;min-height:0;align-items:center;justify-content:center;gap:14px">'
      + '<span class="serif-cn" style="width:64px;height:64px;display:grid;place-items:center;background:var(--accent);color:#fff8f1;border-radius:18px;font-size:34px;font-weight:700">汉</span>'
      + '<div style="color:var(--stone);font-size:.9rem;font-weight:600">Loading your prep…</div>'
      + '</div>';
  }

  /* Data load failed (offline / CDN blip): an error state with a retry, instead of
     a skeleton that never resolves. data.js nulls its `loading` latch on settle, so
     retryDataLoad can re-run the fetch. */
  function errorHtml() {
    return '<div style="display:flex;flex-direction:column;height:100%;min-height:0;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center">'
      + '<span style="width:56px;height:56px;display:grid;place-items:center;background:var(--bad-bg);color:var(--bad-ink);border-radius:16px;font-size:26px" aria-hidden="true">⚠</span>'
      + '<div style="color:var(--ink);font-size:1rem;font-weight:700">Couldn’t load your study data</div>'
      + '<div style="color:var(--stone);font-size:.85rem;max-width:280px;line-height:1.55">Check your connection and try again.</div>'
      + '<button type="button" data-a="retryDataLoad" class="pa" style="border:0;background:var(--accent);color:#fff8f1;border-radius:12px;padding:12px 22px;font-weight:700;font-size:.9rem;cursor:pointer">Try again</button>'
      + '</div>';
  }

  function screenHtml(s) {
    var S = App.screens || {};
    var fn = null;
    if (s.tab === 'home') fn = S.home;
    else if (s.tab === 'exams') fn = S.exams || S.examsList || S.examList;
    else if (s.tab === 'vocab') fn = S.vocab || S.vocabulary;
    else if (s.tab === 'more') fn = S.more;
    return (typeof fn === 'function') ? fn(s) : '';
  }

  function shellHtml(s) {
    if (s.examView && s.examView !== 'list') return '';
    if (!s.dataReady) return '<div style="display:flex;flex-direction:column;height:100%;min-height:0">' + (s.dataError ? errorHtml() : loadingHtml()) + '</div>';
    return '<div style="display:flex;flex-direction:column;height:100%;min-height:0">'
      + topBar(s)
      + '<div id="shell-scroll" class="hsk-scroll" style="flex:1;min-height:0;overflow-y:auto;overflow-x:hidden">' + screenHtml(s) + '</div>'
      + tabBar(s)
      + '</div>';
  }

  /* other modules may push extra volatile keys onto App.regions['r-shell'].skip.
     vMastered is owned by the #vocab-list subregion (+ data-live counters);
     testIdx/examMode/examSection/qReady/qPending are intro-sheet/player state the
     shell never renders — skipping them preserves scroll + focus (contract §1). */
  var SHELL_SKIP = [
    'elapsed', 'audioProg', 'audioPlaying', 'audioPlays', 'curQ', 'answers', 'flags',
    'reviewFilter', 'reviewOpen', 'welcome', 'welcomeStep', 'searchOpen', 'gQuery',
    'wordSheetId', 'introOpen', 'navOpen', 'examExitConfirm',
    'profileSheet', 'planSheet', 'langSheet', 'selPlan', 'profileDraft', '_focus',
    'vMastered', 'testIdx', 'examMode', 'examSection', 'qReady', 'qPending'
  ];

  function shellDeps(s) {
    var o = {};
    for (var k in s) {
      if (SHELL_SKIP.indexOf(k) >= 0) continue;
      o[k] = s[k];
    }
    return o;
  }

  /* ---------- registrations (core.js conventions) ---------- */

  App.screens.shell = { deps: shellDeps, html: shellHtml };

  App.overlays = App.overlays || {};
  /* welcome first — order = priority in core's composite overlay */
  App.overlays.welcome = {
    open: function (s) { return !!s.welcome; },
    deps: function (s) { return [s.welcomeStep, s.goalLevel, s.goalScore, s.dataReady]; },
    html: welcomeHtml
  };
  /* NOTE: deps exclude gQuery — typing updates only the 'search-results'
     subregion (focus preservation, core.js §2). */
  App.overlays.search = {
    open: function (s) { return !!s.searchOpen; },
    deps: function (s) { return [s.dataReady]; },
    html: searchHtml
  };

  /* focus-safe subregion for search results (core.js subregion machinery) */
  App.screens['search-results'] = {
    deps: function (s) { return [s.gQuery, s.dataReady]; },
    html: searchResultsHtml
  };

  function updateSearchResults() {
    try { if (typeof App.update === 'function') { App.update('search-results'); return; } } catch (e) {}
    try {
      var el = document.getElementById('search-results');
      if (el) el.innerHTML = searchResultsHtml(App.state || {});
    } catch (e) {}
  }

  /* ---------- actions ---------- */

  var A = App.actions;

  /* shell / nav (prototype 1532-1544) */
  A.goTab = function (t) {
    stopExamTimer();
    App.setState({ tab: t, examView: 'list', vMode: t === 'vocab' ? (App.state.vMode || 'list') : 'list', moreView: null }, scrollTop);
  };
  A.goHome = function () { A.goTab('home'); };
  A.goExams = function () { A.goTab('exams'); };
  A.goVocab = function () { A.goTab('vocab'); };
  A.goMore = function () { A.goTab('more'); };
  A.goStats = function () {
    stopExamTimer();
    App.setState({ tab: 'more', examView: 'list', moreView: 'stats', statsTab: 'overview' }, scrollTop);
  };
  A.goHistory = function () {
    stopExamTimer();
    App.setState({ tab: 'more', examView: 'list', moreView: 'stats', statsTab: 'history' }, scrollTop);
  };

  /* global search (prototype 1546-1556); input id "g-search" per core §12 */
  function syncSearchDom() {
    try {
      var el = document.getElementById('g-search');
      if (el && el.value !== (App.state.gQuery || '')) el.value = App.state.gQuery || '';
    } catch (e) {}
    try { var c = document.getElementById('g-clear'); if (c) c.style.display = (App.state.gQuery || '') ? 'grid' : 'none'; } catch (e) {}
  }
  A.openSearch = function () { App.state._focus = 'g-search'; App.setState({ searchOpen: true }); };
  A.closeSearch = function () { App.state._focus = null; App.setState({ searchOpen: false }); };
  A.setQuery = function (q) {
    App.state.gQuery = String(q == null ? '' : q);
    App.state._focus = 'g-search';
    syncSearchDom();
    App.setState({ gQuery: App.state.gQuery }); /* re-renders only the subregion (overlay deps exclude gQuery) */
  };
  A.clearQuery = function () { A.setQuery(''); };
  A.onGQuery = function (v, e) {
    var val = '';
    if (typeof v === 'string') val = v;
    else if (v && v.target) val = v.target.value;
    else if (e && e.target) val = e.target.value;
    App.state.gQuery = val;               /* direct write — no full render, no focus loss */
    App.state._focus = 'g-search';
    try { var c = document.getElementById('g-clear'); if (c) c.style.display = val ? 'grid' : 'none'; } catch (err) {}
    updateSearchResults();
  };
  A.pickWord = function (id) {
    App.state._focus = null;
    App.setState({ searchOpen: false, tab: 'vocab', examView: 'list', vMode: 'list', wordSheetId: id }, scrollTop);
  };
  A.pickChar = function (c) {
    App.state._focus = null;
    try { App.hw = null; } catch (e) {}
    App.setState({ searchOpen: false, tab: 'more', examView: 'list', moreView: 'characters', curChar: c }, scrollTop);
  };
  A.pickGrammar = function (slug) {
    App.state._focus = null;
    App.setState({ searchOpen: false, tab: 'more', examView: 'list', moreView: 'study', studySub: 'grammar', curGrammar: slug, curPair: null, gqChoice: null, gqIdx: 0 }, scrollTop);
  };
  A.pickPair = function (slug) {
    App.state._focus = null;
    App.setState({ searchOpen: false, tab: 'more', examView: 'list', moreView: 'study', studySub: 'confuse', curPair: slug, curGrammar: null }, scrollTop);
  };
  A.pickExam = function (i) {
    App.state._focus = null;
    stopExamTimer();
    var idx = (typeof i === 'number') ? i : (parseInt(i, 10) || 0);
    App.setState({ searchOpen: false, tab: 'exams', examView: 'list' }, function () {
      if (typeof App.actions.openIntro === 'function') App.actions.openIntro(idx);
      else App.setState({ testIdx: idx, introOpen: true, examSection: 'all' });
      scrollTop();
    });
  };

  /* welcome (prototype 1558-1568) */
  function saveGoal() {
    App.store.setJSON(App.keys.goal, { level: App.state.goalLevel, score: App.state.goalScore });
  }
  A.wNext = function () {
    var s = App.state;
    if ((s.welcomeStep || 0) >= 2) {
      App.store.set(App.keys.welcome, 'done'); App.store.set(App.keys.firstrun, '1');
      saveGoal();
      App.setState({ welcome: false, welcomeStep: 0, firstRun: true });
      return;
    }
    App.setState({ welcomeStep: (s.welcomeStep || 0) + 1 });
  };
  A.wBack = function () { App.setState({ welcomeStep: Math.max(0, (App.state.welcomeStep || 0) - 1) }); };
  A.wSkip = function () {
    App.store.set(App.keys.welcome, 'done'); App.store.set(App.keys.firstrun, '1');
    App.setState({ welcome: false, firstRun: true });
  };
  A.setGoalLevel = function (l) { App.setState({ goalLevel: l }, saveGoal); };
  A.setGoalScore = function (v) {
    var n = (typeof v === 'number') ? v : (parseInt(v, 10) || 250);
    App.setState({ goalScore: n }, saveGoal);
  };

  /* today's plan tasks */
  function openMock(idx) {
    if (typeof App.actions.openIntro === 'function') App.actions.openIntro(idx);
    else App.setState({ testIdx: idx, introOpen: true, examSection: 'all' });
  }
  function runTask(i) {
    var h = computeHome(App.state);
    var t = h.tasks[i];
    if (!t) return;
    if (t.kind === 'mock') {
      openMock(t.testIdx != null ? t.testIdx : h.nextIdx);
    } else if (t.kind === 'cards') {
      if (typeof App.actions.goCards === 'function') App.actions.goCards();
      else App.setState({ tab: 'vocab', examView: 'list', vMode: 'cards' }, scrollTop);
    } else {
      App.setState({ tab: 'more', examView: 'list', moreView: 'study' }, function () {
        if (typeof App.actions.setStudySub === 'function') App.actions.setStudySub('grammar');
        else App.setState({ studySub: 'grammar', curGrammar: null, curPair: null, curTopic: null });
        scrollTop();
      });
    }
  }
  A.startTask = function (i) { runTask((typeof i === 'number') ? i : (parseInt(i, 10) || 0)); };
  A.startToday = function () {
    var h = computeHome(App.state);
    if (h.firstPending >= 0) runTask(h.firstPending);
    else openMock(h.nextIdx);
  };

})();
