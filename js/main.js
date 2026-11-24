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
    if (themeMeta) themeMeta.setAttribute("content", t === "dark" ? "#0E1124" : "#F6F7FB");
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

  /* ---------- Section titles: words blur into focus one after another ---------- */
  if (!reduceMQ.matches && "IntersectionObserver" in window) {
    each(document.querySelectorAll(".section-head h2"), function (h) {
      // Split only plain-text titles; spans keep the words readable in order for screen readers.
      if (h.children.length) return;
      h.innerHTML = h.textContent.trim().split(/\s+/).map(function (w, i) {
        return '<span class="tw" style="--wi:' + i + '">' + w + "</span>";
      }).join(" ");
      h.classList.add("is-split");
    });
  }

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

  /* ---------- Spotlight on project cards: a soft accent light follows the cursor (mouse only) ---------- */
  if (finePointer) {
    each(document.querySelectorAll(".project"), function (card) {
      card.addEventListener("pointermove", function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty("--sx", (e.clientX - r.left).toFixed(0) + "px");
        card.style.setProperty("--sy", (e.clientY - r.top).toFixed(0) + "px");
      });
    });
  }

  /* ---------- Scroll-linked effects: demo frame, Experience line, stacking project cards ----------
     One rAF-throttled scroll handler, and each effect only works while its element is near the viewport. */
  var scrollFx = [];
  var clamp01 = function (v) { return Math.min(1, Math.max(0, v)); };

  function addScrollFx(el, update) {
    var fx = { el: el, update: update, near: false };
    scrollFx.push(fx);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (en) {
        fx.near = en[0].isIntersecting;
        if (fx.near) fx.update();
      }, { rootMargin: "25% 0px" }).observe(el);
    } else {
      fx.near = true;
    }
  }

  if (!reduceMQ.matches) {
    // The demo recording tilts back like a screen on a desk, and settles flat as it scrolls into view.
    var demoFrame = document.querySelector(".demo-frame");
    if (demoFrame) {
      demoFrame.parentNode.classList.add("is-tilting");
      addScrollFx(demoFrame, function () {
        var r = demoFrame.getBoundingClientRect();
        var p = clamp01((innerHeight - r.top) / (innerHeight * 0.7));
        demoFrame.style.setProperty("--demo-p", p.toFixed(3));
      });
    }

    // Experience: the accent line fills down the timeline with the scroll; milestones light as it reaches them.
    var timeline = document.querySelector(".timeline");
    if (timeline) {
      var bodies = Array.prototype.slice.call(timeline.querySelectorAll(".tl-body"));
      timeline.classList.add("is-scroll");
      addScrollFx(timeline, function () {
        var mark = innerHeight * 0.6;
        bodies.forEach(function (b) {
          var r = b.getBoundingClientRect();
          b.style.setProperty("--tl-p", clamp01((mark - r.top) / r.height).toFixed(3));
          b.classList.toggle("is-reached", r.top < mark);
        });
      });
    }
  }

  // Work: on desktop the project cards stack like a deck. Each pins under the header; the next one
  // rises tilted and soft, lands flat and sharp, and the ones beneath sink back and peek out above.
  var grid = document.querySelector(".project-grid");
  if (grid && !reduceMQ.matches) {
    var stackMQ = window.matchMedia("(min-width: 64.0625rem)");
    var stackCards = Array.prototype.slice.call(grid.querySelectorAll(".project"));
    var stickTops = [];
    var stackOn = false;
    stackCards.forEach(function (c, i) { c.style.setProperty("--stack-i", i); });

    var updateStack = function () {
      if (!stackOn) return;
      var travel = innerHeight * 0.65;
      var rects = stackCards.map(function (c) { return c.getBoundingClientRect(); });
      // How far each card still is from its pinned position: 1 = a full travel away, 0 = landed.
      var away = rects.map(function (r, i) { return clamp01((r.top - stickTops[i]) / travel); });
      stackCards.forEach(function (c, i) {
        var depth = 0;
        for (var k = i + 1; k < stackCards.length; k++) depth += 1 - away[k];
        var d = away[i];
        c.style.transform = "perspective(1400px) translateY(" + (d * 48).toFixed(1) + "px) rotateX(" + (d * 14).toFixed(2) + "deg) scale(" + (1 - depth * 0.05).toFixed(4) + ")";
        c.style.filter = d > 0.01 ? "blur(" + (d * 3).toFixed(2) + "px)" : depth > 0.01 ? "brightness(" + (1 - depth * 0.08).toFixed(3) + ")" : "";
      });
    };

    var setStack = function () {
      stackOn = stackMQ.matches;
      grid.classList.toggle("is-stack", stackOn);
      if (!stackOn) {
        stackCards.forEach(function (c) { c.style.transform = ""; c.style.filter = ""; });
        return;
      }
      stickTops = stackCards.map(function (c) { return parseFloat(getComputedStyle(c).top) || 0; });
      updateStack();
    };
    stackMQ.addEventListener("change", setStack);
    window.addEventListener("resize", setStack);
    setStack();
    addScrollFx(grid, updateStack);
  }

  if (scrollFx.length) {
    var fxTicking = false;
    var runFx = function () {
      fxTicking = false;
      scrollFx.forEach(function (fx) { if (fx.near) fx.update(); });
    };
    var queueFx = function () { if (!fxTicking) { fxTicking = true; requestAnimationFrame(runFx); } };
    window.addEventListener("scroll", queueFx, { passive: true });
    window.addEventListener("resize", queueFx);
    runFx();
  }

  /* ---------- Footer: a giant wordmark rises through the floor line, with a reflection ---------- */
  var mark = document.querySelector(".footer-mark");
  if (mark) {
    var top = mark.querySelector(".fm-top");
    var mirror = mark.querySelector(".fm-reflect");
    var letters = [];

    // One span per letter, in both the word and its reflection, staggered from the left.
    [top, mirror].forEach(function (word, w) {
      var text = word.textContent;
      word.textContent = "";
      text.split("").forEach(function (ch, i) {
        var s = document.createElement("span");
        s.className = ch === " " ? "fl fl-space" : "fl";
        s.textContent = ch === " " ? " " : ch;
        s.style.setProperty("--li", i);
        word.appendChild(s);
        if (w === 0) letters.push(s);
      });
    });

    // Set the type so the name spans the full width of the container.
    var fitMark = function () {
      mark.style.fontSize = "100px";
      var cs = getComputedStyle(mark);
      var avail = mark.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      mark.style.fontSize = Math.max(40, Math.floor((100 * avail) / top.scrollWidth)) + "px";
    };
    fitMark();
    window.addEventListener("resize", fitMark);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitMark);

    var reveal = function () {
      mark.classList.add("is-revealed");
      setTimeout(function () { mark.classList.add("is-done"); }, 2200);
    };
    if ("IntersectionObserver" in window && !reduceMQ.matches) {
      mark.classList.add("is-hidden");
      var markObs = new IntersectionObserver(function (en) {
        if (!en[0].isIntersecting) return;
        markObs.disconnect();
        reveal();
      }, { threshold: 0.35 });
      markObs.observe(mark);
    } else {
      reveal();
    }

    // Letters near the cursor lift a little and take the accent colour (mouse only).
    if (finePointer && !reduceMQ.matches) {
      var nearRaf = 0;
      mark.addEventListener("pointermove", function (e) {
        cancelAnimationFrame(nearRaf);
        nearRaf = requestAnimationFrame(function () {
          letters.forEach(function (l) {
            var r = l.getBoundingClientRect();
            var d = Math.abs(e.clientX - (r.left + r.width / 2));
            l.style.setProperty("--near", Math.max(0, 1 - d / (r.height * 0.9)).toFixed(2));
          });
        });
      });
      mark.addEventListener("pointerleave", function () {
        cancelAnimationFrame(nearRaf);
        letters.forEach(function (l) { l.style.setProperty("--near", 0); });
      });
    }
  }

  // Status line: local time in Noida, updated each minute.
  var clock = document.querySelector(".fs-clock");
  if (clock && window.Intl) {
    var timeEl = clock.querySelector(".fs-time");
    var fmt = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true });
    var tick = function () {
      var now = new Date();
      timeEl.textContent = fmt.format(now);
      timeEl.setAttribute("datetime", now.toISOString());
      setTimeout(tick, 60000 - (now.getSeconds() * 1000 + now.getMilliseconds()));
    };
    tick();
    clock.hidden = false;
  }

  /* ---------- Hero profile: a ring draws round the photo; hover, tap or Enter opens a profile card ---------- */
  var profile = document.querySelector(".profile");
  var profileTpl = document.getElementById("profile-tpl");
  if (profile && profileTpl && "content" in profileTpl) {
    var photo = profile.querySelector(".hero-avatar");
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "avatar-btn";
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-controls", "profile-card");
    btn.setAttribute("aria-label", "Show Utkarsh Rai's profile card");
    btn.innerHTML = '<svg class="avatar-ring" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><circle cx="50" cy="50" r="48" pathLength="1"/></svg>';
    profile.insertBefore(btn, photo);
    btn.appendChild(photo);
    photo.querySelector("img").alt = ""; // the button's label names it now

    var card = profileTpl.content.firstElementChild.cloneNode(true);
    card.hidden = true;
    profile.appendChild(card);
    var nums = card.querySelectorAll(".pc-num");

    var cardOpen = false, pinned = false, hoverTimer = 0, lastPointer = "mouse";
    var showCard = function (open) {
      if (open === cardOpen) return;
      cardOpen = open;
      clearTimeout(hoverTimer);
      btn.setAttribute("aria-expanded", String(open));
      if (open) {
        card.hidden = false;
        void card.offsetWidth; // start the entrance from the closed state
        card.classList.add("is-open");
        each(nums, function (n, i) {
          var to = +n.dataset.to;
          setTimeout(function () { countTo(n, 0, to, 700, function (v) { return String(Math.round(v)); }); }, 120 + i * 70);
        });
      } else {
        pinned = false;
        card.classList.remove("is-open");
        setTimeout(function () { if (!cardOpen) card.hidden = true; }, reduceMQ.matches ? 0 : 260);
      }
    };

    // Mouse: hover opens, leaving closes, a click pins it open. Touch and keyboard: tap / Enter toggles.
    btn.addEventListener("pointerdown", function (e) { lastPointer = e.pointerType; });
    btn.addEventListener("click", function () {
      if (lastPointer === "mouse" && cardOpen && !pinned) { pinned = true; return; }
      showCard(!cardOpen);
      pinned = cardOpen;
      lastPointer = "mouse";
    });
    if (finePointer) {
      profile.addEventListener("pointerenter", function (e) {
        if (e.pointerType !== "mouse") return;
        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(function () { showCard(true); }, 140);
      });
      profile.addEventListener("pointerleave", function (e) {
        if (e.pointerType !== "mouse" || pinned) return;
        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(function () { showCard(false); }, 220);
      });
    }
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && cardOpen) { showCard(false); btn.focus(); }
    });
    document.addEventListener("click", function (e) {
      if (cardOpen && !profile.contains(e.target)) showCard(false);
    });
    profile.addEventListener("focusout", function (e) {
      if (cardOpen && !profile.contains(e.relatedTarget)) showCard(false);
    });

    // The ring draws once the hero has loaded.
    setTimeout(function () { profile.classList.add("is-drawn"); }, reduceMQ.matches ? 0 : 350);
  }

  /* ---------- Cursor: a target frame (mouse only) ----------
     Four corner brackets frame the pointer. Over anything clickable they spring out to frame that element,
     like a viewfinder locking focus, so the cursor marks a target without covering its text.
     The system cursor stays visible. */
  if (finePointer && !reduceMQ.matches) {
    var frame = document.createElement("div");
    frame.className = "cursor-frame";
    frame.setAttribute("aria-hidden", "true");
    frame.innerHTML = '<i class="cf-c cf-tl"></i><i class="cf-c cf-tr"></i><i class="cf-c cf-bl"></i><i class="cf-c cf-br"></i>';
    document.body.appendChild(frame);
    var corners = frame.querySelectorAll(".cf-c");

    var INTERACTIVE = "a, button, summary, label, [role='button'], .pg-chip, .core-hit, .stage-card";
    var REST = 11, PAD = 5, MAX_W = 520, MAX_H = 180; // half-size at rest; gap around a target; skip huge targets
    // Each corner is its own spring, so they arrive a touch apart and the frame feels alive rather than rigid.
    var pts = [0, 1, 2, 3].map(function () { return { x: -100, y: -100, vx: 0, vy: 0 }; });
    var mouse = { x: -100, y: -100 }, target = null, pressed = false, frameRaf = 0, lastT = 0, seen = false;

    var aims = function () {
      var l, t, r, b;
      if (target && target.isConnected) {
        var box = target.getBoundingClientRect();
        // A slight pull toward the pointer keeps a locked frame responsive while the mouse moves inside it.
        var px = (mouse.x - (box.left + box.width / 2)) * 0.06, py = (mouse.y - (box.top + box.height / 2)) * 0.06;
        var pad = pressed ? PAD - 2 : PAD;
        l = box.left - pad + px; t = box.top - pad + py; r = box.right + pad + px; b = box.bottom + pad + py;
      } else {
        var h = pressed ? REST - 3 : REST;
        l = mouse.x - h; t = mouse.y - h; r = mouse.x + h; b = mouse.y + h;
      }
      return [[l, t], [r, t], [l, b], [r, b]];
    };

    var frameStep = function (now) {
      var dt = Math.min(0.032, (now - (lastT || now)) / 1000);
      lastT = now;
      var goal = aims(), still = true;
      pts.forEach(function (p, i) {
        var k = 640 - i * 40; // corners differ slightly in stiffness
        for (var s2 = 0; s2 < 2; s2++) {
          var h2 = dt / 2;
          p.vx += (k * (goal[i][0] - p.x) - 42 * p.vx) * h2;
          p.vy += (k * (goal[i][1] - p.y) - 42 * p.vy) * h2;
          p.x += p.vx * h2;
          p.y += p.vy * h2;
        }
        corners[i].style.transform = "translate3d(" + p.x.toFixed(1) + "px," + p.y.toFixed(1) + "px,0)";
        if (Math.abs(goal[i][0] - p.x) > 0.1 || Math.abs(goal[i][1] - p.y) > 0.1 || Math.abs(p.vx) + Math.abs(p.vy) > 1) still = false;
      });
      // While locked on, keep tracking: the target can move under a still mouse (scrolling, hover lifts).
      frameRaf = still && !target ? 0 : requestAnimationFrame(frameStep);
      if (!frameRaf) lastT = 0;
    };
    var wake = function () { if (!frameRaf) frameRaf = requestAnimationFrame(frameStep); };

    document.addEventListener("pointermove", function (e) {
      if (e.pointerType !== "mouse") return;
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      if (!seen) {
        seen = true;
        pts.forEach(function (p) { p.x = mouse.x; p.y = mouse.y; });
      }
      frame.classList.add("is-visible");
      wake();
    }, { passive: true });

    document.addEventListener("pointerover", function (e) {
      var el = e.target.closest && e.target.closest(INTERACTIVE);
      if (el) {
        var r0 = el.getBoundingClientRect();
        if (r0.width > MAX_W || r0.height > MAX_H) el = null; // big blocks: keep the small frame
      }
      target = el || null;
      frame.classList.toggle("is-locked", !!target);
      // The headshot has its own ring that reacts to hover, so the frame steps aside there.
      frame.classList.toggle("is-away", !!(e.target.closest && e.target.closest(".avatar-btn")));
      wake();
    });
    document.addEventListener("pointerdown", function (e) { if (e.pointerType === "mouse") { pressed = true; wake(); } });
    document.addEventListener("pointerup", function () { pressed = false; wake(); });
    document.documentElement.addEventListener("pointerleave", function () { frame.classList.remove("is-visible"); target = null; });
    window.addEventListener("blur", function () { frame.classList.remove("is-visible"); });
  }

  /* ---------- Benchmark table: mark the best value in each column ---------- */
  var benchTable = document.querySelector(".bench-table table");
  if (benchTable) {
    var bodyRows = Array.prototype.slice.call(benchTable.tBodies[0].rows);
    var cols = bodyRows[0].cells.length;
    for (var ci = 1; ci < cols; ci++) {
      var lowerIsBetter = /latency/i.test(benchTable.tHead.rows[0].cells[ci].textContent);
      var best = null, bestVal = null;
      bodyRows.forEach(function (tr) {
        var v = parseFloat(tr.cells[ci].textContent);
        if (isNaN(v)) return;
        if (bestVal === null || (lowerIsBetter ? v < bestVal : v > bestVal)) { bestVal = v; best = tr.cells[ci]; }
      });
      if (best) {
        best.classList.add("is-best");
        var note = document.createElement("span");
        note.className = "visually-hidden";
        note.textContent = " (best)";
        best.appendChild(note);
      }
    }
    bodyRows.forEach(function (tr, i) { tr.style.setProperty("--ri", i); });
  }

  /* ---------- Demo video: plays on its own, on a loop, with chapter tabs as the progress bar ----------
     It plays only while on screen (and not for reduced-motion users, who get a play button).
     Without JS the video keeps the browser's own controls. */
  var demoVideo = document.querySelector(".demo video");
  var demoFrameEl = demoVideo && demoVideo.closest(".demo-frame");
  if (demoVideo && demoFrameEl) {
    var LOOP_START = 2.2; // skip the blank first frame and the login screen; start on the dashboard
    var CHAPTERS = [
      { label: "Semantic search", short: "Search", start: LOOP_START, end: 9 },
      { label: "Resume vs. job", short: "Match", start: 9, end: 17 },
      { label: "Benchmark", short: "Benchmark", start: 17, end: null } // runs to the end
    ];
    var ICON_PAUSE = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect x="4" y="3" width="2.6" height="10" rx=".8"/><rect x="9.4" y="3" width="2.6" height="10" rx=".8"/></svg>';
    var ICON_PLAY = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M5 3.2v9.6a.6.6 0 0 0 .9.5l7.4-4.8a.6.6 0 0 0 0-1L5.9 2.7a.6.6 0 0 0-.9.5z"/></svg>';
    var fmtTime = function (s) { s = Math.max(0, Math.round(s - LOOP_START)); return "0:" + (s < 10 ? "0" : "") + s; };

    demoVideo.removeAttribute("controls");
    var player = document.createElement("div");
    player.className = "demo-player";
    player.innerHTML =
      '<button type="button" class="dp-toggle" aria-label="Play the demo">' + ICON_PLAY + "</button>" +
      '<div class="dp-chapters" role="group" aria-label="Jump to a part of the demo">' +
      CHAPTERS.map(function (c, i) {
        return '<button type="button" class="dp-chapter" data-i="' + i + '"><span class="dp-track" aria-hidden="true"><span class="dp-fill"></span></span>' +
          '<span class="dp-time" aria-hidden="true">' + fmtTime(c.start) + '</span><span class="dp-label" aria-label="' + c.label + '"><span class="dp-long" aria-hidden="true">' + c.label + '</span><span class="dp-short" aria-hidden="true">' + c.short + "</span></span></button>";
      }).join("") + "</div>";
    demoFrameEl.appendChild(player);

    var toggleBtn = player.querySelector(".dp-toggle");
    var chapterBtns = Array.prototype.slice.call(player.querySelectorAll(".dp-chapter"));
    var fills = chapterBtns.map(function (b) { return b.querySelector(".dp-fill"); });
    var userPaused = reduceMQ.matches, videoInView = false, progressRaf = 0;

    var chapterEnd = function (c) { return c.end === null ? (demoVideo.duration || 21) : c.end; };
    var setChapterWidths = function () {
      // each tab is as wide as its share of the video
      player.querySelector(".dp-chapters").style.gridTemplateColumns =
        CHAPTERS.map(function (c) { return (chapterEnd(c) - c.start).toFixed(2) + "fr"; }).join(" ");
    };
    setChapterWidths();
    demoVideo.addEventListener("loadedmetadata", setChapterWidths);

    var paintProgress = function () {
      var t = demoVideo.currentTime;
      CHAPTERS.forEach(function (c, i) {
        var p = clamp01((t - c.start) / (chapterEnd(c) - c.start));
        fills[i].style.transform = "scaleX(" + p.toFixed(4) + ")";
        var current = t >= c.start && t < chapterEnd(c);
        chapterBtns[i].classList.toggle("is-current", current);
        if (current) chapterBtns[i].setAttribute("aria-current", "true"); else chapterBtns[i].removeAttribute("aria-current");
      });
    };
    var progressLoop = function () {
      paintProgress();
      progressRaf = demoVideo.paused ? 0 : requestAnimationFrame(progressLoop);
    };

    var playDemo = function () {
      if (demoVideo.preload !== "auto") demoVideo.preload = "auto";
      var skipIntro = function () { if (demoVideo.currentTime < LOOP_START) demoVideo.currentTime = LOOP_START; };
      // A seek before the metadata loads is dropped, so apply it again once the video knows its length.
      if (demoVideo.readyState < 1) demoVideo.addEventListener("loadedmetadata", skipIntro, { once: true });
      skipIntro();
      var pr = demoVideo.play();
      if (pr && pr.catch) pr.catch(function () {});
    };
    var syncPlayback = function () {
      if (videoInView && !userPaused && !document.hidden) playDemo(); else demoVideo.pause();
    };

    demoVideo.addEventListener("play", function () {
      toggleBtn.innerHTML = ICON_PAUSE;
      toggleBtn.setAttribute("aria-label", "Pause the demo");
      demoFrameEl.classList.add("is-playing");
      if (!progressRaf) progressRaf = requestAnimationFrame(progressLoop);
    });
    demoVideo.addEventListener("pause", function () {
      toggleBtn.innerHTML = ICON_PLAY;
      toggleBtn.setAttribute("aria-label", "Play the demo");
      demoFrameEl.classList.remove("is-playing");
      paintProgress();
    });
    // Loop by hand, so each lap restarts after the blank first second instead of flashing white.
    demoVideo.addEventListener("ended", function () {
      demoVideo.currentTime = LOOP_START;
      syncPlayback();
    });

    toggleBtn.addEventListener("click", function () {
      userPaused = !demoVideo.paused;
      if (userPaused) demoVideo.pause(); else playDemo();
    });
    demoVideo.addEventListener("click", function () { toggleBtn.click(); });
    chapterBtns.forEach(function (b, i) {
      b.addEventListener("click", function () {
        if (demoVideo.preload !== "auto") demoVideo.preload = "auto";
        demoVideo.currentTime = CHAPTERS[i].start + 0.01;
        userPaused = false;
        playDemo();
        paintProgress();
      });
    });

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (en) {
        videoInView = en[0].isIntersecting;
        syncPlayback();
      }, { threshold: 0.35 }).observe(demoVideo);
    }
    document.addEventListener("visibilitychange", syncPlayback);
  }

  /* ---------- Copy email address ---------- */
  var copyBtn = document.querySelector(".copy-btn");
  if (copyBtn && navigator.clipboard && window.isSecureContext) {
    var copyStatus = document.querySelector(".copy-status");
    var copyLabel = copyBtn.querySelector(".copy-label");
    var resetTimer;
    copyBtn.hidden = false;
    // A tick that draws itself when the address is copied (kept out of the accessible name).
    copyBtn.insertAdjacentHTML("afterbegin", '<svg class="copy-tick" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path pathLength="1" d="M4.5 12.5l4.8 4.8L19.5 7"/></svg>');
    copyBtn.addEventListener("click", function () {
      navigator.clipboard.writeText(copyBtn.dataset.copy).then(function () {
        copyBtn.classList.remove("is-copied");
        void copyBtn.offsetWidth;
        copyBtn.classList.add("is-copied");
        copyLabel.textContent = "Copied";
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
