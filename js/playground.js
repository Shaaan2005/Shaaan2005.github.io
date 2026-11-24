/* Interactive canvases:
   1. .hero-field  – ambient "embedding space" behind the hero; points near the cursor link into a small network.
   2. .pg-canvas   – the search playground: resumes clustered by meaning; a query lights up its nearest neighbours.
   Both pause when off-screen, follow the light/dark theme, and stay still for reduced-motion users. */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var fields = [];

  /* ---------- Theme colours (read from CSS custom properties) ---------- */
  function readColors() {
    var cs = getComputedStyle(root);
    var g = function (n) { return cs.getPropertyValue(n).trim(); };
    return { ink: g("--ink"), muted: g("--muted"), rule: g("--rule-strong"), accent: g("--accent"),
             accentInk: g("--accent-ink"), surface: g("--surface"), bg: g("--bg"), ink2: g("--ink-2") };
  }
  var C = readColors();
  new MutationObserver(function () {
    C = readColors();
    fields.forEach(function (f) { f.requestDraw(); });
  }).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

  function rgba(hex, a) {
    var h = hex.replace("#", "");
    if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
    var n = parseInt(h, 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }

  /* ---------- Deterministic randomness, so the layout is the same on every visit ---------- */
  function rng(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
  function gauss(r) { var u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  var easeOut = function (t) { return 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3); };

  /* ---------- Base class: sizing, visibility, render loop ---------- */
  function Field(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext("2d");
    this.mouse = null;
    this.visible = false;
    this.raf = 0;
    this.pending = false;
    var self = this;
    this.resize();
    new ResizeObserver(function () { self.resize(); self.requestDraw(); }).observe(canvas);
    new IntersectionObserver(function (e) {
      self.visible = e[0].isIntersecting;
      if (self.visible) self.start(); else self.stop();
    }, { rootMargin: "100px" }).observe(canvas);
    document.addEventListener("visibilitychange", function () { if (document.hidden) self.stop(); else if (self.visible) self.start(); });
    fields.push(this);
  }
  Field.prototype.resize = function () {
    var r = this.c.getBoundingClientRect();
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
    this.c.width = Math.round(this.w * dpr); this.c.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  Field.prototype.animating = function () { return !reduceMQ.matches; };
  Field.prototype.start = function () {
    var self = this;
    if (this.raf) return;
    var loop = function (now) {
      self.draw(now);
      self.raf = self.animating() || self.busy(now) ? requestAnimationFrame(loop) : 0;
    };
    this.raf = requestAnimationFrame(loop);
  };
  Field.prototype.stop = function () { cancelAnimationFrame(this.raf); this.raf = 0; };
  Field.prototype.busy = function () { return false; };
  Field.prototype.requestDraw = function () { if (this.visible && !this.raf) this.start(); };
  Field.prototype.trackPointer = function (el) {
    var self = this;
    el.addEventListener("pointermove", function (e) {
      var r = self.c.getBoundingClientRect();
      self.mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
      self.requestDraw();
    });
    el.addEventListener("pointerleave", function () { self.mouse = null; self.requestDraw(); });
  };

  /* =====================================================================
     1. Hero ambient field
     ===================================================================== */
  function HeroField(canvas) {
    Field.call(this, canvas);
    var r = rng(7);
    this.pts = [];
    for (var i = 0; i < 90; i++) this.pts.push({ x: r(), y: r(), p: r() * Math.PI * 2, s: 0.15 + r() * 0.35, z: 0.6 + r() * 0.8 });
    if (finePointer) this.trackPointer(canvas.parentElement);
  }
  HeroField.prototype = Object.create(Field.prototype);
  // Keep the field out from behind the "at a glance" panel so its text stays clean.
  HeroField.prototype.blocked = function () {
    var card = document.querySelector(".hero-card");
    if (!card) return null;
    var c = this.c.getBoundingClientRect(), r = card.getBoundingClientRect(), pad = 18;
    return { l: r.left - c.left - pad, t: r.top - c.top - pad, r: r.right - c.left + pad, b: r.bottom - c.top + pad };
  };
  HeroField.prototype.draw = function (now) {
    var ctx = this.ctx, w = this.w, h = this.h, t = now / 1000, m = this.mouse, R = 180;
    var still = !this.animating();
    var box = this.blocked();
    var inBox = function (x, y) { return box && x > box.l && x < box.r && y > box.t && y < box.b; };
    ctx.clearRect(0, 0, w, h);
    var pos = this.pts.map(function (p) {
      var x = p.x * w + (still ? 0 : Math.sin(t * p.s + p.p) * 14);
      var y = p.y * h + (still ? 0 : Math.cos(t * p.s * 0.8 + p.p) * 10);
      var near = 0;
      if (m) {
        var dx = x - m.x, dy = y - m.y, d = Math.hypot(dx, dy);
        if (d < R) { near = 1 - d / R; x += (dx / (d || 1)) * near * 18; y += (dy / (d || 1)) * near * 18; }
      }
      return { x: x, y: y, near: near, z: p.z, hide: inBox(x, y) };
    });
    // network lines between points close to the cursor
    if (m) {
      for (var i = 0; i < pos.length; i++) {
        if (!pos[i].near || pos[i].hide) continue;
        for (var j = i + 1; j < pos.length; j++) {
          if (!pos[j].near || pos[j].hide) continue;
          var d = Math.hypot(pos[i].x - pos[j].x, pos[i].y - pos[j].y);
          if (d < 120) {
            ctx.strokeStyle = rgba(C.accent, 0.6 * Math.min(pos[i].near, pos[j].near) * (1 - d / 120) + 0.08);
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(pos[i].x, pos[i].y); ctx.lineTo(pos[j].x, pos[j].y); ctx.stroke();
          }
        }
      }
    }
    pos.forEach(function (p) {
      if (p.hide) return;
      ctx.fillStyle = p.near ? rgba(C.accent, 0.45 + p.near * 0.5) : rgba(C.muted, 0.45);
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.6 * p.z + p.near * 1.8, 0, Math.PI * 2); ctx.fill();
    });
  };

  /* =====================================================================
     2. Search playground
     ===================================================================== */
  var CLUSTERS = [
    { label: "Accountants",        x: 0.24, y: 0.30, query: "handles payroll and taxes" },
    { label: "Software engineers", x: 0.72, y: 0.26, query: "builds web apps in Python" },
    { label: "Nurses",             x: 0.30, y: 0.76, query: "cares for patients on a ward" },
    { label: "Designers",          x: 0.76, y: 0.72, query: "creates brand visuals" },
    { label: "HR",                 x: 0.52, y: 0.52 },
    { label: "Teachers",           x: 0.08, y: 0.55 }
  ];
  var PER = 26, K = 5;

  function Playground(canvas, ui) {
    Field.call(this, canvas);
    this.ui = ui;
    var r = rng(42);
    this.pts = [];
    var self = this;
    CLUSTERS.forEach(function (c, ci) {
      for (var i = 0; i < PER; i++) {
        self.pts.push({
          c: ci,
          x: Math.min(0.97, Math.max(0.03, c.x + gauss(r) * 0.055)),
          y: Math.min(0.95, Math.max(0.06, c.y + gauss(r) * 0.075)),
          kw: r() < 0.16,                     // this resume uses the query's exact words
          p: r() * Math.PI * 2, s: 0.3 + r() * 0.4
        });
      }
    });
    this.query = null;   // { c, x, y, at, mode, matches[] }
    this.hover = -1;
    this.trackPointer(canvas);
  }
  Playground.prototype = Object.create(Field.prototype);
  Playground.prototype.busy = function (now) { return this.query && now - this.query.at < 2200; };

  Playground.prototype.ask = function (ci, mode) {
    var c = CLUSTERS[ci];
    var qx = c.x + 0.035, qy = c.y - 0.04;
    var aspect = this.w / this.h;
    var matches;
    if (mode === "keyword") {
      matches = this.pts.map(function (p, i) { return i; }).filter(function (i) { return this.pts[i].c === ci && this.pts[i].kw; }, this);
    } else {
      matches = this.pts.map(function (p, i) { return { i: i, d: Math.hypot((p.x - qx) * aspect, p.y - qy) }; })
        .sort(function (a, b) { return a.d - b.d; }).slice(0, K).map(function (o) { return o.i; });
    }
    this.query = { c: ci, x: qx, y: qy, at: performance.now(), mode: mode, matches: matches };
    var inCluster = this.pts.filter(function (p) { return p.c === ci; }).length;
    var msg = mode === "keyword"
      ? "Exact keywords found " + matches.length + " of the " + inCluster + " " + c.label.toLowerCase() + ". The rest describe the same work in other words."
      : "The " + K + " closest resumes are all " + c.label.toLowerCase() + ", including ones that never use your exact words.";
    this.ui.result.textContent = msg;
    this.requestDraw();
  };

  Playground.prototype.draw = function (now) {
    var ctx = this.ctx, w = this.w, h = this.h, t = now / 1000, q = this.query, self = this;
    var still = !this.animating();
    ctx.clearRect(0, 0, w, h);

    var pos = this.pts.map(function (p) {
      return { x: p.x * w + (still ? 0 : Math.sin(t * p.s + p.p) * 3), y: p.y * h + (still ? 0 : Math.cos(t * p.s + p.p) * 3) };
    });

    // cluster labels
    ctx.font = "500 11px 'IBM Plex Mono', ui-monospace, monospace";
    ctx.textAlign = "center";
    CLUSTERS.forEach(function (c, ci) {
      var active = q && q.c === ci;
      ctx.fillStyle = active ? C.accentInk : rgba(C.muted, 0.9);
      ctx.fillText(c.label.toUpperCase(), c.x * w, c.y * h - 0.12 * h - 4);
    });

    var since = q ? (still ? 1e9 : now - q.at) : 0;
    var matchSet = {};
    if (q) q.matches.forEach(function (i, k) { matchSet[i] = k; });

    // lines from the query to its matches
    if (q) {
      var qx = q.x * w, qy = q.y * h;
      q.matches.forEach(function (i, k) {
        var prog = easeOut((since - 250 - k * 110) / 550);
        if (prog <= 0) return;
        var p = pos[i];
        ctx.strokeStyle = rgba(C.accent, 0.75);
        ctx.lineWidth = 1.25;
        ctx.setLineDash(q.mode === "keyword" ? [3, 3] : []);
        ctx.beginPath(); ctx.moveTo(qx, qy); ctx.lineTo(qx + (p.x - qx) * prog, qy + (p.y - qy) * prog); ctx.stroke();
      });
      ctx.setLineDash([]);
    }

    // resumes
    pos.forEach(function (p, i) {
      var k = matchSet[i];
      var lit = k !== undefined ? easeOut((since - 700 - k * 110) / 400) : 0;
      var dim = q && k === undefined && self.pts[i].c !== q.c ? 0.45 : 1;
      if (lit > 0) {
        ctx.fillStyle = rgba(C.accent, 0.18 * lit);
        ctx.beginPath(); ctx.arc(p.x, p.y, 4 + 7 * lit, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = lit > 0 ? C.accent : rgba(C.ink2, 0.55 * dim);
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.6 + 1.8 * lit, 0, Math.PI * 2); ctx.fill();
    });

    // the query point with a one-off ripple
    if (q) {
      var qx2 = q.x * w, qy2 = q.y * h;
      var rip = easeOut(since / 900);
      if (rip < 1) {
        ctx.strokeStyle = rgba(C.ink, 0.5 * (1 - rip)); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(qx2, qy2, 6 + rip * 40, 0, Math.PI * 2); ctx.stroke();
      }
      var pop = easeOut(since / 300);
      ctx.fillStyle = C.ink;
      ctx.beginPath(); ctx.arc(qx2, qy2, 6 * pop, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.bg;
      ctx.beginPath(); ctx.arc(qx2, qy2, 2.2 * pop, 0, Math.PI * 2); ctx.fill();
      ctx.font = "500 11px 'IBM Plex Mono', ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.fillStyle = C.ink;
      ctx.globalAlpha = pop;
      ctx.fillText("your query", qx2 + 10, qy2 - 9);
      ctx.globalAlpha = 1;
    }

    // hover tooltip
    var m = this.mouse;
    this.hover = -1;
    if (m) {
      var best = 14, bi = -1;
      pos.forEach(function (p, i) { var d = Math.hypot(p.x - m.x, p.y - m.y); if (d < best) { best = d; bi = i; } });
      if (bi >= 0) {
        this.hover = bi;
        var hp = pos[bi], pt = this.pts[bi];
        ctx.strokeStyle = C.ink; ctx.lineWidth = 1.25;
        ctx.beginPath(); ctx.arc(hp.x, hp.y, 7, 0, Math.PI * 2); ctx.stroke();
        var text = "Resume · " + CLUSTERS[pt.c].label.replace(/s$/, "") + (pt.kw ? " · uses the exact words" : "");
        ctx.font = "12px 'IBM Plex Sans', system-ui, sans-serif";
        var tw = ctx.measureText(text).width + 16;
        var tx = Math.min(w - tw - 4, Math.max(4, hp.x - tw / 2)), ty = hp.y - 36 < 4 ? hp.y + 14 : hp.y - 36;
        ctx.fillStyle = C.ink;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(tx, ty, tw, 24, 5); else ctx.rect(tx, ty, tw, 24);
        ctx.fill();
        ctx.fillStyle = C.bg; ctx.textAlign = "left";
        ctx.fillText(text, tx + 8, ty + 16);
      }
    }
    this.c.style.cursor = this.hover >= 0 ? "help" : "default";
  };

  /* ---------- Wire up ---------- */
  var heroCanvas = document.querySelector(".hero-field");
  if (heroCanvas && heroCanvas.getContext) new HeroField(heroCanvas);

  var pgCanvas = document.querySelector(".pg-canvas");
  if (pgCanvas && pgCanvas.getContext) {
    var ui = {
      chips: document.querySelectorAll(".pg-chip"),
      modes: document.querySelectorAll(".pg-mode"),
      result: document.querySelector(".pg-result")
    };
    var pg = new Playground(pgCanvas, ui);
    var current = { c: 0, mode: "meaning" };
    var run = function () {
      Array.prototype.forEach.call(ui.chips, function (b) { b.setAttribute("aria-pressed", String(+b.dataset.cluster === current.c)); });
      Array.prototype.forEach.call(ui.modes, function (b) { b.setAttribute("aria-pressed", String(b.dataset.mode === current.mode)); });
      pg.ask(current.c, current.mode);
    };
    Array.prototype.forEach.call(ui.chips, function (b) {
      b.addEventListener("click", function () { current.c = +b.dataset.cluster; run(); });
    });
    Array.prototype.forEach.call(ui.modes, function (b) {
      b.addEventListener("click", function () { current.mode = b.dataset.mode; run(); });
    });
    // Play the first query once the playground scrolls into view, so it never sits empty.
    var once = new IntersectionObserver(function (e) {
      if (e[0].isIntersecting) { once.disconnect(); setTimeout(run, reduceMQ.matches ? 0 : 500); }
    }, { threshold: 0.5 });
    once.observe(pgCanvas);
  }
})();
