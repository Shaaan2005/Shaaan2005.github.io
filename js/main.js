/* Portfolio interactions. No dependencies.
   Everything is progressive enhancement: without JS the page shows every finished state.
   With "reduce motion" turned on, animations jump straight to their end state. */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };
  var easeOut = function (t) { return 1 - Math.pow(1 - t, 3); };

  /* Animate a number in an element's text from `from` to `to`. */
  function countTo(el, from, to, dur, fmt) {
    if (reduceMQ.matches || dur <= 0) { el.textContent = fmt(to); return; }
    var start = null;
    if (el._raf) cancelAnimationFrame(el._raf);
    var step = function (now) {
      if (start === null) start = now;
      var t = Math.min(1, (now - start) / dur);
      el.textContent = fmt(from + (to - from) * easeOut(t));
      if (t < 1) el._raf = requestAnimationFrame(step);
    };
    el._raf = requestAnimationFrame(step);
  }

  /* ---------- Theme (light / dark) with a circular reveal ---------- */
  var themeBtn = document.querySelector(".theme-toggle");
  var themeMeta = document.querySelector('meta[name="theme-color"]');

  function applyTheme(t) {
    root.dataset.theme = t;
    if (themeMeta) themeMeta.setAttribute("content", t === "dark" ? "#0D1117" : "#F6F7FB");
    if (themeBtn) themeBtn.setAttribute("aria-label", t === "dark" ? "Switch to light theme" : "Switch to dark theme");
  }

  if (themeBtn) {
    themeBtn.hidden = false;
    applyTheme(root.dataset.theme || "light");

    themeBtn.addEventListener("click", function (e) {
      var next = root.dataset.theme === "dark" ? "light" : "dark";
      var commit = function () {
        applyTheme(next);
        try { localStorage.setItem("theme-v2", next); } catch (err) {}
      };
      if (!document.startViewTransition || reduceMQ.matches) { commit(); return; }

      var r = themeBtn.getBoundingClientRect();
      var x = e.clientX || r.left + r.width / 2;
      var y = e.clientY || r.top + r.height / 2;
      var radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      var vt = document.startViewTransition(commit);
      vt.ready.then(function () {
        root.animate(
          { clipPath: ["circle(0px at " + x + "px " + y + "px)", "circle(" + radius + "px at " + x + "px " + y + "px)"] },
          { duration: 700, easing: "cubic-bezier(.65,0,.35,1)", pseudoElement: "::view-transition-new(root)" }
        );
      });
    });

  }

  /* ---------- Mobile navigation ---------- */
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");

  function setMenu(open) {
    toggle.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("is-open", open);
  }

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      setMenu(toggle.getAttribute("aria-expanded") !== "true");
    });
    nav.addEventListener("click", function (e) {
      if (e.target.closest("a")) setMenu(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setMenu(false);
        toggle.focus();
      }
    });
    document.addEventListener("click", function (e) {
      if (toggle.getAttribute("aria-expanded") === "true" && !nav.contains(e.target) && !toggle.contains(e.target)) {
        setMenu(false);
      }
    });
    window.matchMedia("(min-width: 48.0625rem)").addEventListener("change", function (mq) {
      if (mq.matches) setMenu(false);
    });
  }

  /* ---------- Header: hairline once scrolled + reading progress ---------- */
  var header = document.querySelector(".site-header");
  var ticking = false;
  function onScroll() {
    var max = root.scrollHeight - innerHeight;
    header.classList.toggle("is-scrolled", scrollY > 8);
    header.style.setProperty("--progress", max > 0 ? Math.min(1, scrollY / max).toFixed(4) : 0);
    ticking = false;
  }
  if (header) {
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
    }, { passive: true });
    onScroll();
  }

  /* ---------- Active section: aria-current + sliding indicator ---------- */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.site-nav a[href^="#"]'));
  var indicator = document.querySelector(".nav-indicator");
  var currentLink = null;

  function placeIndicator() {
    if (!indicator) return;
    if (!currentLink) { indicator.classList.remove("is-visible"); return; }
    var cs = getComputedStyle(currentLink);
    var padL = parseFloat(cs.paddingLeft), padR = parseFloat(cs.paddingRight);
    indicator.style.setProperty("--ix", currentLink.offsetLeft + padL + "px");
    indicator.style.setProperty("--iw", currentLink.offsetWidth - padL - padR + "px");
    indicator.classList.add("is-visible");
  }

  function setCurrent(link) {
    if (link === currentLink) return;
    navLinks.forEach(function (a) { a.removeAttribute("aria-current"); });
    if (link) link.setAttribute("aria-current", "true");
    currentLink = link;
    placeIndicator();
  }

  if ("IntersectionObserver" in window && navLinks.length) {
    var byId = {};
    navLinks.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });
    var sectionObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) setCurrent(byId[entry.target.id] || null);
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    Object.keys(byId).forEach(function (id) {
      var s = document.getElementById(id);
      if (s) sectionObs.observe(s);
    });
    var hero = document.querySelector(".hero");
    if (hero) sectionObs.observe(hero); // the hero has no nav link, so it clears the highlight
    window.addEventListener("resize", placeIndicator);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeIndicator);
  }

  /* ---------- Hero: words rise in, then the check mark draws ---------- */
  var title = document.querySelector(".hero-title");
  if (title) {
    var wordIndex = 0;
    var split = function (node) {
      each(Array.prototype.slice.call(node.childNodes), function (child) {
        if (child.nodeType === 3) {
          var frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            var w = document.createElement("span");
            var wi = document.createElement("span");
            w.className = "w";
            wi.className = "wi";
            wi.style.setProperty("--wi", wordIndex++);
            wi.textContent = part;
            w.appendChild(wi);
            frag.appendChild(w);
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === 1 && child.tagName.toLowerCase() !== "svg") {
          split(child);
        }
      });
    };
    split(title);
    title.style.setProperty("--check-d", (0.08 + wordIndex * 0.055 + 0.75).toFixed(2) + "s");
  }

  /* ---------- Stagger indices, step indices ---------- */
  each(document.querySelectorAll("[data-stagger]"), function (list) {
    each(list.children, function (child, i) { child.style.setProperty("--si", i); });
  });
  each(document.querySelectorAll(".pipeline li, .bench-rows li"), function (li) {
    li.style.setProperty("--i", Array.prototype.indexOf.call(li.parentNode.children, li));
  });

  /* ---------- Scroll reveals ---------- */
  var revealEls = document.querySelectorAll("[data-reveal]");
  function markDone(el) {
    if (el.classList.contains("is-done")) return;
    el.classList.add("is-done");
  }
  if ("IntersectionObserver" in window && !reduceMQ.matches) {
    var revealObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        // Staggered --d delays only choreograph the first view; anything reached later by scrolling appears at once.
        if (performance.now() > 1500) el.style.setProperty("--d", "0s");
        el.classList.add("is-in");
        revealObs.unobserve(el);
        var delay = parseFloat(getComputedStyle(el).getPropertyValue("--d")) || 0;
        setTimeout(function () { markDone(el); }, (delay + 1.05) * 1000);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    each(revealEls, function (el) { revealObs.observe(el); });
  } else {
    each(revealEls, function (el) { el.classList.add("is-in"); markDone(el); });
  }

  /* ---------- Play-once animations (stats, pipeline, chart, project visuals) ---------- */
  var BENCH_FMT = {
    ndcg: function (v) { return v.toFixed(3); },
    mrr: function (v) { return v.toFixed(3); },
    p5: function (v) { return v.toFixed(3); },
    lat: function (v) { return Math.round(v) + " ms"; }
  };
  var benchMetric = "ndcg";

  function play(el) {
    el.classList.remove("is-playing", "is-settled");
    void el.offsetWidth; // restart CSS animations
    el.classList.add("is-playing");
    el._playedAt = Date.now();
    clearTimeout(el._settle);
    el._settle = setTimeout(function () { el.classList.add("is-settled"); }, 3800);

    // Counters
    each(el.querySelectorAll("[data-count]"), function (n) {
      var to = parseFloat(n.dataset.count);
      countTo(n, 0, to, 1400, function (v) { return String(Math.round(v)); });
    });
    if (el.classList.contains("bench")) {
      each(el.querySelectorAll(".bench-rows li"), function (row, i) {
        var val = row.querySelector(".bench-val");
        var to = parseFloat(row.dataset[benchMetric]);
        setTimeout(function () { countTo(val, 0, to, 1000, BENCH_FMT[benchMetric]); }, 150 + i * 110);
      });
    }
  }

  var playEls = document.querySelectorAll("[data-play]");
  if ("IntersectionObserver" in window && !reduceMQ.matches) {
    var playObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        playObs.unobserve(entry.target);
        // Let the parent card finish rising in before the visual starts.
        setTimeout(function () { play(entry.target); }, 250);
      });
    }, { threshold: 0.45 });
    each(playEls, function (el) { playObs.observe(el); });

    // Hovering a project card replays its visual (once the previous run has finished).
    each(document.querySelectorAll("[data-replay]"), function (viz) {
      var card = viz.closest(".project") || viz;
      card.addEventListener("pointerenter", function (e) {
        if (e.pointerType !== "mouse" || !viz._playedAt) return;
        if (Date.now() - viz._playedAt > 4200) play(viz);
      });
    });
  } else {
    each(playEls, function (el) { el.classList.add("is-playing"); });
  }

  /* ---------- Benchmark metric switcher ---------- */
  var METRICS = {
    ndcg: { note: "nDCG@10, higher is better (scale 0–1)", max: 1 },
    mrr: { note: "MRR (mean reciprocal rank), higher is better (scale 0–1)", max: 1 },
    p5: { note: "P@5 (precision in the top 5), higher is better (scale 0–1)", max: 1 },
    lat: { note: "Search latency in milliseconds, lower is better (scale 0–700 ms, one run)", max: 700 }
  };
  var bench = document.querySelector(".bench");
  if (bench) {
    var buttons = bench.querySelectorAll(".bench-toggle button");
    var rows = bench.querySelectorAll(".bench-rows li");
    var note = bench.querySelector(".bench-note");

    var show = function (key) {
      var m = METRICS[key];
      if (!m || key === benchMetric) return;
      var prev = benchMetric;
      benchMetric = key;
      each(buttons, function (b) { b.setAttribute("aria-pressed", String(b.dataset.metric === key)); });
      each(rows, function (row) {
        var v = parseFloat(row.dataset[key]);
        var from = parseFloat(row.dataset[prev]);
        row.querySelector(".bench-bar").style.setProperty("--w", (v / m.max * 100).toFixed(1) + "%");
        var val = row.querySelector(".bench-val");
        // Different units: count from 0; same unit: count from the previous value.
        countTo(val, prev === "lat" || key === "lat" ? 0 : from, v, 550, BENCH_FMT[key]);
      });
      note.textContent = m.note;
    };
    each(buttons, function (b) {
      b.addEventListener("click", function () { show(b.dataset.metric); });
    });
  }

  /* ---------- Magnetic buttons (mouse only) ---------- */
  if (finePointer && !reduceMQ.matches) {
    each(document.querySelectorAll("[data-magnetic]"), function (btn) {
      btn.addEventListener("pointermove", function (e) {
        var r = btn.getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
        var dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
        btn.style.setProperty("--mx", (dx * 6).toFixed(1) + "px");
        btn.style.setProperty("--my", (dy * 4).toFixed(1) + "px");
      });
      btn.addEventListener("pointerleave", function () {
        btn.style.removeProperty("--mx");
        btn.style.removeProperty("--my");
      });
    });
  }

  /* ---------- 3D tilt on project cards (mouse only) ---------- */
  if (finePointer && !reduceMQ.matches) {
    each(document.querySelectorAll(".project"), function (card) {
      card.addEventListener("pointermove", function (e) {
        var r = card.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5;
        var y = (e.clientY - r.top) / r.height - 0.5;
        card.style.setProperty("--ry", (x * 5).toFixed(2) + "deg");
        card.style.setProperty("--rx", (-y * 4).toFixed(2) + "deg");
      });
      card.addEventListener("pointerleave", function () {
        card.style.removeProperty("--rx");
        card.style.removeProperty("--ry");
      });
    });
  }

  /* ---------- Copy email address ---------- */
  var copyBtn = document.querySelector(".copy-btn");
  if (copyBtn && navigator.clipboard && window.isSecureContext) {
    var copyStatus = document.querySelector(".copy-status");
    var copyLabel = copyBtn.querySelector(".copy-label");
    var resetTimer;
    copyBtn.hidden = false;
    copyBtn.addEventListener("click", function () {
      navigator.clipboard.writeText(copyBtn.dataset.copy).then(function () {
        copyBtn.classList.remove("is-copied");
        void copyBtn.offsetWidth;
        copyBtn.classList.add("is-copied");
        copyLabel.textContent = "Copied ✓";
        copyStatus.textContent = "Email address copied to clipboard";
      }, function () {
        copyStatus.textContent = "Couldn’t copy. Select the address above instead.";
      });
      clearTimeout(resetTimer);
      resetTimer = setTimeout(function () {
        copyBtn.classList.remove("is-copied");
        copyLabel.textContent = "Copy email address";
        copyStatus.textContent = "";
      }, 2500);
    });
  }
})();
