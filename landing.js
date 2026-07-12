/**
 * HSK Prep — landing redesign behaviors.
 * Ported from the Claude Design file's DCLogic component to plain,
 * dependency-free JS. Drives: generic hover, the HSK level picker,
 * the platform tab switcher, the FAQ accordion, count-up stats,
 * scroll reveal, and hero parallax. All motion respects
 * prefers-reduced-motion.
 */
(function () {
  'use strict';

  var motion = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- analytics: landing CTA click (best-effort — the anchor navigates away,
     so the async beacon may not flush; ob_start on /quiz/ is the reliable entry
     signal). Delegated so it covers every current/future /quiz/ CTA. ---- */
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href^="/quiz"]') : null;
    if (a) { try { if (window.ymGoal) window.ymGoal('landing_cta'); } catch (err) {} }
  }, true);

  /* ---- generic hover (was the design's style-hover="…", now data-hover="…")
     Re-applies the captured original inline style on leave, so it reverts
     correctly no matter which property the hover overrode. ---- */
  document.querySelectorAll('[data-hover]').forEach(function (el) {
    var hov = el.getAttribute('data-hover');
    var orig = el.getAttribute('style') || '';
    var enter = function () { el.setAttribute('style', orig + ';' + hov); };
    var leave = function () { el.setAttribute('style', orig); };
    el.addEventListener('mouseenter', enter);
    el.addEventListener('mouseleave', leave);
    el.addEventListener('focus', enter);
    el.addEventListener('blur', leave);
  });

  /* ---- HSK level picker ---- */
  function applyLevel(n) {
    document.querySelectorAll('[data-levelchips] [data-level]').forEach(function (btn) {
      var active = parseInt(btn.getAttribute('data-level'), 10) === n;
      btn.style.background = active ? '#c23b22' : '#ffffff';
      btn.style.color = active ? '#fffdf9' : '#5c5c6a';
      btn.style.borderColor = active ? '#c23b22' : 'rgba(26,26,46,.15)';
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    document.querySelectorAll('[data-levelpanel]').forEach(function (p) {
      p.style.display = p.getAttribute('data-levelpanel') === String(n) ? 'block' : 'none';
    });
  }
  document.querySelectorAll('[data-levelchips] [data-level]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      applyLevel(parseInt(btn.getAttribute('data-level'), 10));
    });
  });

  /* ---- platform tab switcher ---- */
  function applyTab(n) {
    var urls = ['exams', 'vocabulary', 'characters', 'grammar', 'strategies', 'traps'];
    document.querySelectorAll('[data-tabchips] [data-tab]').forEach(function (btn) {
      var active = parseInt(btn.getAttribute('data-tab'), 10) === n;
      btn.style.background = active ? '#fde8e4' : 'transparent';
      btn.style.color = active ? '#c23b22' : '#5c5c6a';
      btn.style.borderColor = active ? 'transparent' : 'rgba(26,26,46,.14)';
      btn.style.fontWeight = active ? '600' : '500';
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    document.querySelectorAll('[data-tabpanel]').forEach(function (p) {
      p.style.display = p.getAttribute('data-tabpanel') === String(n) ? 'block' : 'none';
    });
    document.querySelectorAll('[data-appnav-i]').forEach(function (el) {
      var active = parseInt(el.getAttribute('data-appnav-i'), 10) === n;
      el.style.color = active ? '#b84e2e' : '#574f49';
      el.style.fontWeight = active ? '600' : '400';
    });
    var url = document.querySelector('[data-urlbar]');
    if (url) url.textContent = 'hskprep.cc/' + urls[n] + '/';
    // Mobile app-card title (mobile block only; desktop has no [data-apptitle]).
    var names = ['Mock Exams', 'Vocabulary', 'Characters', 'Grammar', 'Strategies', 'Traps'];
    var apptitle = document.querySelector('[data-apptitle]');
    if (apptitle) apptitle.textContent = names[n];
  }
  document.querySelectorAll('[data-tabchips] [data-tab]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      applyTab(parseInt(btn.getAttribute('data-tab'), 10));
    });
  });

  /* Seed aria-pressed on both switchers to their default (the chip whose panel is
     shown). Re-applies the identical default styles/urlbar — idempotent. */
  (function initSwitcherAria() {
    var lp = document.querySelectorAll('[data-levelpanel]');
    for (var i = 0; i < lp.length; i++) { if (getComputedStyle(lp[i]).display !== 'none') { applyLevel(parseInt(lp[i].getAttribute('data-levelpanel'), 10)); break; } }
    var tp = document.querySelectorAll('[data-tabpanel]');
    for (var j = 0; j < tp.length; j++) { if (getComputedStyle(tp[j]).display !== 'none') { applyTab(parseInt(tp[j].getAttribute('data-tabpanel'), 10)); break; } }
  })();

  /* ---- FAQ accordion ---- */
  document.querySelectorAll('[data-faq-q]').forEach(function (btn, i) {
    var item = btn.closest('[data-faq]');
    var ans = item && item.querySelector('[data-faq-a]');
    var chev = item && item.querySelector('[data-faq-chev]');
    // Initial ARIA (unique ids across desktop + mobile since forEach spans both).
    if (ans) { if (!ans.id) { ans.id = 'faq-ans-' + i; } btn.setAttribute('aria-controls', ans.id); }
    btn.setAttribute('aria-expanded', ans && ans.style.display !== 'none' ? 'true' : 'false');
    if (chev) { chev.setAttribute('aria-hidden', 'true'); }
    btn.addEventListener('click', function () {
      var open = ans && ans.style.display !== 'none';
      document.querySelectorAll('[data-faq]').forEach(function (el) {
        var a = el.querySelector('[data-faq-a]');
        var c = el.querySelector('[data-faq-chev]');
        var q = el.querySelector('[data-faq-q]');
        if (a) a.style.display = 'none';
        if (c) c.style.transform = 'rotate(0deg)';
        if (q) q.setAttribute('aria-expanded', 'false');
      });
      if (!open && ans) {
        ans.style.display = 'block';
        if (chev) chev.style.transform = 'rotate(180deg)';
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });

  /* ---- reduced motion: pause CSS float/marquee ---- */
  if (!motion) {
    document.querySelectorAll('[data-anim]').forEach(function (el) {
      el.style.animationPlayState = 'paused';
    });
  }

  /* ---- count-up stats ---- */
  var fmt = function (v, dec) {
    return dec ? v.toFixed(dec) : Math.round(v).toLocaleString('en-US');
  };
  var runCounter = function (el) {
    var target = parseFloat(el.getAttribute('data-count'));
    var dec = parseInt(el.getAttribute('data-dec') || '0', 10);
    if (!motion) { el.textContent = fmt(target, dec); return; }
    var t0 = performance.now();
    var dur = 1400;
    var step = function (t) {
      var p = Math.min(1, (t - t0) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(target * eased, dec);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  if ('IntersectionObserver' in window) {
    var cObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { runCounter(en.target); cObs.unobserve(en.target); }
      });
    }, { threshold: 0.5 });
    document.querySelectorAll('[data-count]').forEach(function (el) { cObs.observe(el); });
  } else {
    document.querySelectorAll('[data-count]').forEach(runCounter);
  }

  /* ---- scroll reveal ---- */
  if (motion && 'IntersectionObserver' in window) {
    var rObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.style.opacity = '1';
          en.target.style.transform = 'translateY(0)';
          rObs.unobserve(en.target);
        }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll('[data-reveal]').forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top > window.innerHeight * 0.92) {
        el.style.opacity = '0';
        el.style.transform = 'translateY(26px)';
        el.style.transition = 'opacity .7s cubic-bezier(.2,.7,.2,1), transform .7s cubic-bezier(.2,.7,.2,1)';
        rObs.observe(el);
      }
    });
  }

  /* ---- hero parallax ---- */
  if (motion) {
    var plx = Array.prototype.slice.call(document.querySelectorAll('[data-plx]'));
    if (plx.length) {
      var ticking = false;
      window.addEventListener('scroll', function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
          var y = window.scrollY;
          plx.forEach(function (el) {
            var f = parseFloat(el.getAttribute('data-plx'));
            el.style.transform = 'translateY(' + (-y * f) + 'px)';
          });
          ticking = false;
        });
      }, { passive: true });
    }
  }

  /* ---- mobile sticky bottom CTA — reveal after scrolling past the hero ---- */
  var bar = document.querySelector('[data-stickybar]');
  if (bar) {
    var shown = false;
    var setBar = function (v) {
      if (v === shown) return;
      shown = v;
      bar.style.transform = v
        ? 'translateX(-50%) translateY(0)'
        : 'translateX(-50%) translateY(130%)';
    };
    var barTicking = false;
    var onBarScroll = function () {
      if (barTicking) return;
      barTicking = true;
      requestAnimationFrame(function () {
        setBar(window.scrollY > 560);
        barTicking = false;
      });
    };
    window.addEventListener('scroll', onBarScroll, { passive: true });
    onBarScroll();
  }
})();
