/* Hero core: an isometric stack of the five layers of an AI system I build.
   At rest it is one object; hovering (or tapping, or pressing Enter on) it takes it apart into five
   plates, each labelled with a card. Ported from the "syntra" React hero to plain JS: the geometry is
   the same, springs replace the motion library, and every colour comes from CSS custom properties
   (css/hero-core.css), so it follows the light/dark theme without redrawing.
   Progressive enhancement: the layers also exist as a plain list (#core-stages) in the page. */
(function () {
  "use strict";

  var host = document.querySelector("[data-core]");
  var list = document.getElementById("core-stages");
  if (!host || !list || !window.requestAnimationFrame) return;

  var hero = host.closest(".hero");
  var reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  var reduce = reduceMQ.matches;

  /* ---------- Dials ---------- */
  var MOTION = {
    tilt: 3.5,              // max tilt toward the cursor, degrees
    ringParallax: 12,       // px the orbits slide against the core
    backdropParallax: 5,    // px the backdrop slides the other way
    orbitSeconds: [70, 95], // one lap of the inner / outer orbit
    orbitOpenOpacity: 0.15  // orbits step back while the stack is open
  };
  var EXPLODE = {
    spring: { k: 105, d: 25, m: 1 },
    gap: 94,                // distance between plates once apart (artboard units)
    aiLift: 12,             // the main plate rides a little higher
    topPlateY: 230,
    stagger: 0.05,          // later plates start a beat behind the main one
    scales: [0.63, 0.62, 0.7, 1.07, 1.06]
  };
  var CARDS = { left: { edge: -2, width: 31 }, right: { edge: 0, width: 29 }, restInset: 0, outward: 4, beadSeconds: 1.6 };
  var POINTER_SPRING = { k: 55, d: 18, m: 0.9 };

  /* ---------- Isometric geometry (1000-unit artboard) ---------- */
  var ISO_X = 0.866, ISO_Y = 0.5, CX = 500, CY = 500, ART = 1000;
  var RING_FLATTEN = 0.57, RING_RX = [400, 530];

  var BASE = { half: 168, radius: 40, top: 475, depth: 34 };
  var SEAM_GAP = 9;
  var MID = { half: 151, radius: 36, top: BASE.top - SEAM_GAP - 28, depth: 28 };
  var CAP = { half: 101, radius: 28, top: MID.top - 14, depth: 14 };

  function ext(o, p) { var r = {}, k; for (k in o) r[k] = o[k]; for (k in p) r[k] = p[k]; return r; }
  function clamp(v) { return Math.min(1, Math.max(0, v)); }
  function round(n) { return Math.round(n * 100) / 100; }
  function fx(n) { return n.toFixed(2); }

  function project(x, y, cx, cy) {
    if (cx == null) cx = CX;
    if (cy == null) cy = CY;
    return [cx + (x - y) * ISO_X, cy + (x + y) * ISO_Y];
  }

  // Rounded square in plane coordinates, walked once around.
  function footprint(half, radius, steps) {
    steps = steps || 14;
    var r = Math.min(radius, half), c = half - r, pts = [];
    [[c, c, 0], [-c, c, 90], [-c, -c, 180], [c, -c, 270]].forEach(function (k) {
      for (var i = 0; i <= steps; i++) {
        var a = ((k[2] + (90 * i) / steps) * Math.PI) / 180;
        pts.push([k[0] + r * Math.cos(a), k[1] + r * Math.sin(a)]);
      }
    });
    return pts;
  }

  function toPath(pts) { return "M" + pts.map(function (p) { return fx(p[0]) + " " + fx(p[1]); }).join("L") + "Z"; }

  function topPath(slab, inset, cx, dy) {
    inset = inset || 0;
    var half = slab.half - inset, radius = Math.max(slab.radius - inset, 1);
    return toPath(footprint(half, radius).map(function (p) { return project(p[0], p[1], cx, slab.top + (dy || 0)); }));
  }

  // A vertically extruded convex shape is the convex hull of its top and bottom outlines.
  function hull(points) {
    var pts = points.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    var cross = function (o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); };
    var build = function (l) {
      var out = [];
      l.forEach(function (p) {
        while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
        out.push(p);
      });
      out.pop();
      return out;
    };
    return build(pts).concat(build(pts.slice().reverse()));
  }

  function bodyPath(slab, inset) {
    inset = inset || 0;
    var outline = footprint(slab.half - inset, Math.max(slab.radius - inset, 1));
    var upper = outline.map(function (p) { return project(p[0], p[1], CX, slab.top); });
    var lower = outline.map(function (p) { return project(p[0], p[1], CX, slab.top + slab.depth); });
    return toPath(hull(upper.concat(lower)));
  }

  // A point on one of the two visible side faces. u runs along the face, v down its thickness.
  function facePoint(slab, side, u, v) {
    var p = side === "left"
      ? project(-slab.half + 2 * slab.half * u, slab.half, CX, slab.top)
      : project(slab.half, slab.half - 2 * slab.half * u, CX, slab.top);
    return [p[0], p[1] + slab.depth * v];
  }

  var FACE_MATRIX = { left: ISO_X + " " + ISO_Y + " 0 1", right: ISO_X + " " + -ISO_Y + " 0 1", top: ISO_X + " " + ISO_Y + " " + -ISO_X + " " + ISO_Y };

  function ringPoint(rx, deg) {
    var a = (deg * Math.PI) / 180;
    return [round(CX + rx * Math.cos(a)), round(CY + rx * RING_FLATTEN * Math.sin(a))];
  }
  function ringPath(rx) {
    var ry = rx * RING_FLATTEN;
    return "M" + (CX + rx) + " " + CY + "A" + rx + " " + ry + " 0 1 1 " + (CX - rx) + " " + CY + "A" + rx + " " + ry + " 0 1 1 " + (CX + rx) + " " + CY + "Z";
  }

  /* ---------- Colour: every paint is a CSS variable, so the theme switch restyles it ---------- */
  function paint(o) {
    var s = [];
    for (var k in o) {
      var v = String(o[k]);
      s.push(k + ":" + (/^(url|none|#|rgb|\d)/.test(v) ? v : "var(--core-" + v + ")"));
    }
    return ' style="' + s.join(";") + '"';
  }
  function stop(offset, color, opacity) {
    return '<stop offset="' + offset + '" style="stop-color:var(--core-' + color + ")" + (opacity != null ? ";stop-opacity:" + opacity : "") + '"/>';
  }
  function lin(id, x1, y1, x2, y2, stops) {
    return '<linearGradient id="' + id + '" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '">' + stops.join("") + "</linearGradient>";
  }
  function blur(id, sd, pad) {
    pad = pad || 40;
    return '<filter id="' + id + '" x="-' + pad + '%" y="-' + pad + '%" width="' + (100 + 2 * pad) + '%" height="' + (100 + 2 * pad) + '%"><feGaussianBlur stdDeviation="' + sd + '"/></filter>';
  }
  function svg(cls, body, extra) {
    return '<svg class="' + cls + '" viewBox="0 0 ' + ART + " " + ART + '" aria-hidden="true" focusable="false"' + (extra || "") + ">" + body + "</svg>";
  }

  // One set of gradients and filters, shared by every layer.
  var DEFS =
    '<svg class="core-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>' +
    lin("core-side", 0, 0, 1, 0, [stop(0, "side-1"), stop(0.46, "side-2"), stop(0.5, "side-3"), stop(1, "side-4")]) +
    lin("core-side-shade", 0, 0, 0, 1, [stop(0.45, "shade", 0), stop(1, "shade", "var(--core-shade-a)")]) +
    lin("core-bevel", 0, 0, 1, 1, [stop(0, "bevel-1"), stop(1, "bevel-2")]) +
    lin("core-top", 0.1, 0, 0.9, 1, [stop(0, "top-1"), stop(1, "top-2")]) +
    lin("core-inlay", 0, 0, 1, 1, [stop(0, "inlay-1"), stop(1, "inlay-2")]) +
    lin("core-seam", 0, 0, 1, 0, [stop(0, "seam-1"), stop(0.5, "accent"), stop(1, "seam-2")]) +
    lin("core-slot", 0, 0, 0, 1, [stop(0, "slot-1"), stop(1, "slot-2")]) +
    lin("core-logo-top", 0, 0, 1, 1, [stop(0, "logo-1"), stop(0.55, "logo-2"), stop(1, "accent")]) +
    '<radialGradient id="core-hole" cx="0.5" cy="0.4" r="0.7">' + stop(0, "hole-1") + stop(1, "hole-2") + "</radialGradient>" +
    lin("core-crystal-body", 0.15, 0.1, 0.85, 0.95, [stop(0, "crystal-1", 0.9), stop(0.5, "crystal-2", 0.88), stop(1, "crystal-3", 0.95)]) +
    '<radialGradient id="core-crystal-refract" cx="0.6" cy="0.78" r="0.45">' + stop(0, "crystal-hi", 0.85) + stop(1, "crystal-hi", 0) + "</radialGradient>" +
    lin("core-crystal-rim", 0, 0, 0, 1, [stop(0, "spec", 0.95), stop(1, "crystal-deep", 0.55)]) +
    '<radialGradient id="core-crystal-halo" cx="0.5" cy="0.5" r="0.5">' + stop(0.5, "accent", 0.14) + stop(1, "accent", 0) + "</radialGradient>" +
    '<filter id="core-crystal-shadow" x="-80%" y="-80%" width="260%" height="260%"><feDropShadow dx="0" dy="2.5" stdDeviation="2.5" style="flood-color:var(--core-crystal-deep);flood-opacity:.25"/></filter>' +
    lin("core-glass", 0, 0, 1, 1, [stop(0, "glass", 0.7), stop(1, "glass", 0.12)]) +
    lin("core-axis-v", 0, 0, 0, 1, [stop(0, "tech", 0), stop(0.5, "tech", 0.45), stop(1, "tech", 0)]) +
    lin("core-axis-h", 0, 0, 1, 0, [stop(0, "tech", 0), stop(0.5, "tech", 0.7), stop(1, "tech", 0)]) +
    blur("core-blur-sm", 3.5) + blur("core-blur-glow", 9) + blur("core-blur-spill", 18) +
    blur("core-blur-lg", 26, 30) + blur("core-blur-md", 9, 30) +
    '<clipPath id="core-clip-back"><rect x="-200" y="-200" width="1400" height="' + (CY + 200) + '"/></clipPath>' +
    '<clipPath id="core-clip-front"><rect x="-200" y="' + CY + '" width="1400" height="700"/></clipPath>' +
    "</defs></svg>";

  /* ---------- Parts of the core ---------- */
  function faceMark(slab, side, u, v, w, h, fill, glow) {
    var p = facePoint(slab, side, u, v);
    var g = '<g transform="translate(' + fx(p[0]) + " " + fx(p[1]) + ") matrix(" + FACE_MATRIX[side] + ' 0 0)">';
    if (glow) g += '<rect x="' + (-w / 2 - 2) + '" y="' + (-h / 2 - 3) + '" width="' + (w + 4) + '" height="' + (h + 6) + '" rx="' + h + '"' + paint({ fill: fill }) + ' filter="url(#core-blur-sm)" opacity=".75"/>';
    return g + '<rect x="' + -w / 2 + '" y="' + -h / 2 + '" width="' + w + '" height="' + h + '" rx="' + h / 2 + '"' + paint({ fill: fill }) + "/></g>";
  }
  var slot = function (slab, side, u, v, w, h) { return faceMark(slab, side, u, v, w, h, "url(#core-slot)"); };

  function panelLine(slab, side, v) {
    var a = facePoint(slab, side, 0.14, v), b = facePoint(slab, side, 0.86, v);
    return '<line x1="' + fx(a[0]) + '" y1="' + fx(a[1]) + '" x2="' + fx(b[0]) + '" y2="' + fx(b[1]) + '"' + paint({ stroke: "panel" }) + ' stroke-width=".9" opacity=".55"/>';
  }

  function fastener(slab, x, y) {
    var p = project(x, y, CX, slab.top);
    return '<g transform="translate(' + fx(p[0]) + " " + fx(p[1]) + ") matrix(" + FACE_MATRIX.top + ' 0 0)"><circle r="6.5"' + paint({ fill: "url(#core-hole)", stroke: "hole-edge" }) + ' stroke-width="1"/></g>';
  }

  function slabBody(slab) {
    var d = bodyPath(slab);
    return '<path d="' + d + '" fill="url(#core-side)"/><path d="' + d + '" fill="url(#core-side-shade)"/><path d="' + d + '"' + paint({ fill: "none", stroke: "edge" }) + ' stroke-width="1" opacity=".85"/>';
  }

  function slabTop(slab, groove) {
    var s = '<path d="' + topPath(slab) + '"' + paint({ fill: "url(#core-bevel)", stroke: "rim" }) + ' stroke-width="1"/>' +
      '<path d="' + topPath(slab, 4.5) + '"' + paint({ fill: "url(#core-top)", stroke: "hi" }) + ' stroke-width="1"/>';
    if (groove != null) s += '<path d="' + topPath(slab, groove) + '"' + paint({ fill: "none", stroke: "groove" }) + ' stroke-width="1.2"/>';
    return s;
  }

  function inlay(slab) {
    return '<path d="' + topPath(slab, 19) + '"' + paint({ fill: "url(#core-inlay)", stroke: "groove" }) + ' stroke-width="1.2"/>' +
      '<path d="' + topPath(slab, 20.5) + '"' + paint({ fill: "none", stroke: "hi" }) + ' stroke-width="1" opacity=".9"/>';
  }

  // The same check mark as the headline's, extruded and laid flat on the top plate:
  // "...and then check whether it actually works" sits on top of the stack.
  var CHECK = "M4 22 C 10 26, 14 31, 18 35 C 24 24, 33 12, 44 4";
  function coreLogo(x, y) {
    var plane = function (lift) { return "translate(" + x + " " + (y - lift) + ") matrix(" + FACE_MATRIX.top + " 0 0) rotate(-45) scale(1.45) translate(-24 -19.5)"; };
    var line = ' fill="none" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"';
    var s = '<g transform="' + plane(0) + ' translate(2.4 2.4)" opacity=".22" filter="url(#core-blur-sm)"><path d="' + CHECK + '"' + line + paint({ stroke: "shadow-1" }) + "/></g>";
    for (var k = 0; k < 6; k++) s += '<g transform="' + plane(k) + '"><path d="' + CHECK + '"' + line + paint({ stroke: "logo-s" + k }) + "/></g>";
    return s + '<g transform="' + plane(6) + '"><path d="' + CHECK + '"' + line + ' stroke="url(#core-logo-top)"/>' +
      '<path d="' + CHECK + '" transform="translate(-.7 -.9)" fill="none" stroke-width="1.4" stroke-linecap="round"' + paint({ stroke: "logo-rim" }) + ' opacity=".7"/></g>';
  }

  var SEAM = { half: MID.half - 2, radius: MID.radius - 2, top: MID.top + MID.depth - 1, depth: SEAM_GAP + 1 };

  function seamGlow() {
    return '<g class="core-pulse"><path d="' + topPath(MID, 4, CX, BASE.top - MID.top) + '"' + paint({ fill: "accent" }) + ' opacity=".24" filter="url(#core-blur-spill)"/>' +
      '<path d="' + bodyPath(SEAM) + '"' + paint({ fill: "accent" }) + ' opacity=".6" filter="url(#core-blur-glow)"/></g>';
  }

  function baseMarks() {
    return slot(BASE, "right", 0.5, 0.62, 4.5, 4.5) + slot(BASE, "right", 0.58, 0.62, 4.5, 4.5) + slot(BASE, "right", 0.66, 0.62, 4.5, 4.5) +
      slot(BASE, "left", 0.32, 0.62, 4.5, 4.5) + slot(BASE, "left", 0.4, 0.62, 4.5, 4.5);
  }

  function midDetail() {
    return panelLine(MID, "left", 0.78) + panelLine(MID, "right", 0.78) +
      slot(MID, "left", 0.62, 0.42, 34, 7.5) + slot(MID, "left", 0.34, 0.42, 5, 5) + slot(MID, "left", 0.42, 0.42, 5, 5) +
      slot(MID, "right", 0.44, 0.42, 5, 5) + slot(MID, "right", 0.52, 0.42, 5, 5) + slot(MID, "right", 0.68, 0.42, 22, 4.5) +
      '<g class="core-pulse">' + faceMark(MID, "left", 0.2, 0.42, 7, 2.6, "accent", true) + "</g>" +
      fastener(MID, 0, -MID.half + 28) + fastener(MID, -MID.half + 28, 0) + fastener(MID, MID.half - 28, 0) + fastener(MID, 0, MID.half - 28);
  }

  // The core at rest: base, mid and cap slabs, a lit seam, the check mark on top.
  function coreObject() {
    return slabBody(BASE) + slabTop(BASE, 10) + panelLine(BASE, "left", 0.3) + panelLine(BASE, "right", 0.3) + baseMarks() +
      seamGlow() + '<path d="' + bodyPath(SEAM) + '" fill="url(#core-seam)"/>' +
      slabBody(MID) + slabTop(MID, 11) + midDetail() +
      slabBody(CAP) + slabTop(CAP) + inlay(CAP) + coreLogo(CX, CAP.top);
  }

  /* ---------- The exploded view: five plates cut from the same three slabs ---------- */
  var PLATE_SLABS = [
    ext(BASE, { top: BASE.top + 17, depth: 17 }),
    ext(BASE, { depth: 17 }),
    MID,
    ext(CAP, { top: CAP.top + 7, depth: 7 }),
    ext(CAP, { depth: 7 })
  ];
  var AI_PLATE = 2;
  var SKIRT = [0, 4, 0, 10, 10];
  var TARGET_TOPS = PLATE_SLABS.map(function (_, i) {
    return EXPLODE.topPlateY + (PLATE_SLABS.length - 1 - i) * EXPLODE.gap - (i === AI_PLATE ? EXPLODE.aiLift : 0);
  });
  var TRAVEL = PLATE_SLABS.map(function (slab, i) { return TARGET_TOPS[i] - slab.top; });

  function plateProgress(i, p) { var delay = Math.abs(i - AI_PLATE) * EXPLODE.stagger; return clamp((p - delay) / (1 - delay)); }
  function tipX(i, side) {
    var s = PLATE_SLABS[i];
    return CX + (side === "right" ? 1 : -1) * 0.866 * (2 * s.half - 0.586 * s.radius) * EXPLODE.scales[i];
  }
  function cornerY(i) { return TARGET_TOPS[i] + PLATE_SLABS[i].depth / 2; }

  function plateNumber(slab, n, main) {
    var k = slab.half * 0.56, p = project(k, k, CX, slab.top);
    var plane = "matrix(" + FACE_MATRIX.top + " 0 0) rotate(-45)";
    var t = ' text-anchor="middle" dominant-baseline="central" font-size="25" font-weight="500" letter-spacing="2.5"';
    var label = (n < 10 ? "0" : "") + n;
    return '<g class="core-num" transform="translate(' + fx(p[0]) + " " + fx(p[1]) + ')">' +
      "<text" + t + ' transform="translate(0 .9) ' + plane + '"' + paint({ fill: "hi" }) + ' opacity=".95">' + label + "</text>" +
      "<text" + t + ' transform="' + plane + '"' + paint({ fill: main ? "accent-soft" : "num" }) + ">" + label + "</text></g>";
  }

  function plate(i, body) {
    var slab = PLATE_SLABS[i], s = "";
    if (i > 0) s += '<path class="plate-shadow" d="' + topPath(slab, -6, CX, slab.depth + 34) + '"' + paint({ fill: "shadow-1" }) + ' filter="url(#core-blur-spill)" opacity="0"/>';
    if (SKIRT[i]) s += '<g class="plate-skirt" opacity="0">' + slabBody(ext(slab, { top: slab.top + slab.depth - 1, depth: SKIRT[i] + 1 })) + "</g>";
    return '<g class="plate">' + s + body + "</g>";
  }

  function explodedCore() {
    var ai = '<g transform="translate(' + CX + " " + MID.top + ") matrix(" + FACE_MATRIX.top + ' 0 0)">' +
      '<circle class="ai-spill" r="86"' + paint({ fill: "accent" }) + ' filter="url(#core-blur-spill)" opacity="0"/>' +
      '<circle class="ai-rim" r="56"' + paint({ fill: "none", stroke: "accent" }) + ' stroke-width="1.4" opacity="0"/>' +
      '<circle class="ai-halo" r="38"' + paint({ fill: "none", stroke: "accent" }) + ' stroke-width="1" stroke-dasharray="3 6" opacity="0"/>' +
      '<circle class="ai-rim" r="9"' + paint({ fill: "accent" }) + ' opacity="0"/></g>';
    return plate(0, slabBody(PLATE_SLABS[0]) + slabTop(PLATE_SLABS[0], 10) + plateNumber(PLATE_SLABS[0], 1) + baseMarks()) +
      plate(1, slabBody(PLATE_SLABS[1]) + slabTop(PLATE_SLABS[1], 10) + plateNumber(PLATE_SLABS[1], 2) + panelLine(BASE, "left", 0.3) + panelLine(BASE, "right", 0.3)) +
      plate(2, seamGlow() + '<path class="ai-glow" d="' + bodyPath(SEAM) + '"' + paint({ fill: "accent" }) + ' filter="url(#core-blur-glow)" opacity="0"/>' +
        '<path d="' + bodyPath(SEAM) + '" fill="url(#core-seam)"/>' + slabBody(MID) + slabTop(MID, 11) + plateNumber(MID, 3, true) + midDetail() + ai) +
      plate(3, slabBody(PLATE_SLABS[3]) + slabTop(PLATE_SLABS[3]) + inlay(PLATE_SLABS[3]) + plateNumber(PLATE_SLABS[3], 4)) +
      plate(4, slabBody(PLATE_SLABS[4]) + slabTop(PLATE_SLABS[4]) + inlay(CAP) + coreLogo(CX, CAP.top));
  }

  /* ---------- Surroundings: shadow, backdrops, orbits and their crystal beads ---------- */
  function coreShadow() {
    var floor = ext(BASE, { top: BASE.top + BASE.depth + 30 });
    return '<path d="' + topPath(floor, -14) + '"' + paint({ fill: "shadow-1" }) + ' opacity=".2" filter="url(#core-blur-lg)"/>' +
      '<path d="' + topPath(floor, 6) + '"' + paint({ fill: "shadow-2" }) + ' opacity=".22" filter="url(#core-blur-md)"/>';
  }

  function depthBackdrop() {
    var nodes = [[118, 132], [318, 82], [690, 96], [884, 188], [936, 470], [70, 512], [150, 858], [850, 846]];
    return '<g fill="url(#core-glass)"' + paint({ stroke: "glass-edge" }) + ' stroke-width="1" opacity=".35">' +
      '<rect width="290" height="250" rx="22" transform="matrix(0.866 -0.5 0 1 232 300)"/><rect width="290" height="250" rx="22" transform="matrix(0.866 0.5 0 1 520 150)"/></g>' +
      "<g" + paint({ fill: "node", stroke: "edge" }) + ' stroke-width="1">' +
      nodes.map(function (n, i) { return '<circle cx="' + n[0] + '" cy="' + n[1] + '" r="' + (i % 3 === 0 ? 4 : 3) + '" opacity=".85"/>'; }).join("") + "</g>";
  }

  function technicalBackdrop() {
    var dots = "";
    for (var i = 0; i < 26; i++) {
      var a = (i * 137.5 * Math.PI) / 180, r = 160 + ((i * 53) % 340);
      dots += '<circle cx="' + round(CX + r * Math.cos(a) * 1.02) + '" cy="' + round(CY + r * Math.sin(a) * RING_FLATTEN * 1.6) + '" r="' + (0.8 + (i % 3) * 0.5) + '" opacity="' + (0.35 + (i % 4) * 0.12).toFixed(2) + '"/>';
    }
    var cross = [[212, 292], [790, 690], [860, 430], [150, 560]].map(function (c) {
      return '<path d="M' + (c[0] - 5) + " " + c[1] + "h10M" + c[0] + " " + (c[1] - 5) + 'v10"/>';
    }).join("");
    return '<rect x="' + (CX - 0.5) + '" y="110" width="1" height="780" fill="url(#core-axis-v)"/>' +
      '<rect x="70" y="' + (CY - 0.5) + '" width="860" height="1" fill="url(#core-axis-h)"/>' +
      "<g" + paint({ fill: "tech" }) + ">" + dots + "</g><g" + paint({ stroke: "tech" }) + ' stroke-width="1" opacity=".5">' + cross + "</g>";
  }

  function orbits() {
    return "<g" + paint({ fill: "none", stroke: "orbit" }) + ' stroke-width="1">' +
      '<ellipse cx="' + CX + '" cy="' + CY + '" rx="' + RING_RX[0] + '" ry="' + RING_RX[0] * RING_FLATTEN + '" opacity=".8"/>' +
      '<ellipse cx="' + CX + '" cy="' + CY + '" rx="' + RING_RX[1] + '" ry="' + RING_RX[1] * RING_FLATTEN + '" opacity=".65"/></g>';
  }

  var BEADS = [
    { ring: 0, angle: 20, size: 7 }, { ring: 0, angle: 110, size: 5.5 }, { ring: 0, angle: 200, size: 8 }, { ring: 0, angle: 290, size: 6 },
    { ring: 1, angle: 60, size: 6 }, { ring: 1, angle: 132, size: 8 }, { ring: 1, angle: 204, size: 5.5 }, { ring: 1, angle: 276, size: 7 }, { ring: 1, angle: 348, size: 6.5 }
  ];

  // A small sphere of tinted glass: lit from the upper left, with a rim and a specular glint.
  function crystal(s) {
    return '<g filter="url(#core-crystal-shadow)"><circle r="' + s * 1.55 + '" fill="url(#core-crystal-halo)"/>' +
      '<circle r="' + s + '" fill="url(#core-crystal-body)"/><circle r="' + s + '" fill="url(#core-crystal-refract)"/>' +
      '<circle r="' + (s - 0.5) + '" fill="none" stroke="url(#core-crystal-rim)" stroke-width="1"/>' +
      '<ellipse cx="' + -s * 0.32 + '" cy="' + -s * 0.4 + '" rx="' + s * 0.36 + '" ry="' + s * 0.2 + '" transform="rotate(-30 ' + -s * 0.32 + " " + -s * 0.4 + ')"' + paint({ fill: "spec" }) + ' opacity=".95"/>' +
      '<circle cx="' + s * 0.34 + '" cy="' + -s * 0.5 + '" r="' + Math.max(0.7, s * 0.07) + '"' + paint({ fill: "spec" }) + ' opacity=".85"/></g>';
  }

  // Beads are drawn twice, clipped to the back and front halves, so one passing behind the core slips behind it.
  function beads(half, animated) {
    return '<g clip-path="url(#core-clip-' + half + ')">' + BEADS.map(function (b) {
      var rx = RING_RX[b.ring], dur = MOTION.orbitSeconds[b.ring], reverse = b.ring === 1, start = b.angle / 360;
      if (!animated) {
        var p = ringPoint(rx, b.angle);
        return '<g transform="translate(' + p[0].toFixed(1) + " " + p[1].toFixed(1) + ')">' + crystal(b.size) + "</g>";
      }
      var begin = -dur * (reverse ? 1 - start : start);
      return "<g>" + crystal(b.size) + '<animateMotion dur="' + dur + 's" begin="' + begin + 's" repeatCount="indefinite" path="' + ringPath(rx) + '"' +
        (reverse ? ' keyPoints="1;0" keyTimes="0;1" calcMode="linear"' : "") + "/></g>";
    }).join("") + "</g>";
  }

  /* ---------- Cards and connectors ---------- */
  var stages = Array.prototype.slice.call(list.children).map(function (li) {
    return { side: li.dataset.side === "left" ? "left" : "right", main: li.hasAttribute("data-main"), body: li.querySelector(".stage") };
  });
  if (stages.length !== 5) return; // the geometry has exactly five plates

  function lineEnds(i) {
    var st = stages[i], c = CARDS[st.side], dir = st.side === "right" ? 1 : -1;
    var card = st.side === "left" ? (c.edge + c.width) * 10 : (100 - c.edge - c.width) * 10;
    return { plateX: tipX(i, st.side) + dir * 7, nodeX: card - dir * 10, y: cornerY(i) };
  }

  function connectors() {
    return stages.map(function (st, i) {
      var e = lineEnds(i), y = fx(e.y);
      return '<g class="conn" opacity="0">' +
        '<line x1="' + fx(e.plateX) + '" x2="' + fx(e.nodeX) + '" y1="' + y + '" y2="' + y + '"' + paint({ stroke: "edge" }) + ' stroke-width="1"/>' +
        '<line class="conn-lit" x1="' + fx(e.plateX) + '" x2="' + fx(e.nodeX) + '" y1="' + y + '" y2="' + y + '"' + paint({ stroke: "accent" }) + ' stroke-width="1.2"/>' +
        '<circle cx="' + fx(e.plateX) + '" cy="' + y + '" r="2.6"' + paint({ fill: "panel" }) + "/>" +
        '<circle class="conn-halo' + (st.main ? " is-main" : "") + '" cx="' + fx(e.nodeX) + '" cy="' + y + '" r="' + (st.main ? 10 : 8) + '"' + paint({ fill: "accent" }) + "/>" +
        '<circle cx="' + fx(e.nodeX) + '" cy="' + y + '" r="3.6"' + paint({ fill: "accent" }) + "/>" +
        '<circle class="conn-bead" cx="' + fx(e.nodeX) + '" cy="' + y + '" r="2.6"' + paint({ fill: "accent" }) + ' opacity="0"/></g>';
    }).join("");
  }

  /* ---------- Build the visual ---------- */
  var tilt = function (inner) { return '<div class="core-tilt"><div class="core-tilt-inner"><div class="core-float">' + inner + "</div></div></div>"; };
  var animatedBeads = !reduce;

  host.innerHTML = DEFS +
    '<div class="core-halo"></div>' +
    '<div class="core-fade"><div class="core-layer" data-reach="' + -MOTION.backdropParallax + '">' + svg("core-svg", depthBackdrop()) + svg("core-svg", technicalBackdrop()) + "</div></div>" +
    '<div class="core-layer" data-reach="' + MOTION.ringParallax + '"><div class="core-orbits">' + svg("core-svg", orbits()) + svg("core-svg core-beads", beads("back", animatedBeads)) + "</div></div>" +
    '<div class="core-shadow">' + svg("core-svg", coreShadow()) + "</div>" +
    tilt('<div class="core-rest">' + svg("core-svg", coreObject()) + '</div><div class="core-exploded">' + svg("core-svg", explodedCore()) + "</div>" + svg("core-svg core-conns", connectors())) +
    '<div class="core-layer" data-reach="' + MOTION.ringParallax + '"><div class="core-orbits">' + svg("core-svg core-beads", beads("front", animatedBeads)) + "</div></div>" +
    tilt('<ul class="core-cards" aria-hidden="true"></ul>') +
    '<p class="core-hint" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M4.5 3.5 11 20l2.4-7.1L20.5 10z"/></svg>' +
    '<span class="core-hint-hover">Hover to take it apart</span><span class="core-hint-tap">Tap to take it apart</span></p>' +
    '<button class="core-hit" type="button" aria-expanded="false" aria-controls="core-stages" aria-label="Take the stack apart: the five layers of an AI system I build"></button>';

  var $ = function (s) { return host.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(host.querySelectorAll(s)); };

  // Cards: copies of the list items, placed beside their plates. Screen readers get the list itself.
  var cardsEl = $(".core-cards");
  var cards = stages.map(function (st, i) {
    var c = CARDS[st.side], li = document.createElement("li"), card = document.createElement("div");
    li.className = "core-card";
    li.style.top = (cornerY(i) / ART) * 100 + "%";
    li.style.left = (st.side === "left" ? c.edge : 100 - c.edge - c.width) + "%";
    li.style.width = c.width + "%";
    card.className = "stage-card";
    card.appendChild(st.body.cloneNode(true));
    li.appendChild(card);
    cardsEl.appendChild(li);
    card.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") hoverCard(i); });
    card.addEventListener("pointerleave", function () { hoverCard(null); });
    return card;
  });

  var el = {
    layers: $$(".core-layer").map(function (n) { return { n: n, reach: +n.dataset.reach }; }),
    tilts: $$(".core-tilt-inner"),
    orbits: $$(".core-orbits"),
    shadow: $(".core-shadow"),
    rest: $(".core-rest"),
    exploded: $(".core-exploded"),
    hint: $(".core-hint"),
    hit: $(".core-hit"),
    beadSvgs: $$(".core-beads"),
    plates: $$(".plate").map(function (g) { return { g: g, shadow: g.querySelector(".plate-shadow"), skirt: g.querySelector(".plate-skirt") }; }),
    aiRim: $$(".ai-rim"), aiHalo: $(".ai-halo"), aiSpill: $(".ai-spill"), aiGlow: $(".ai-glow"),
    conns: $$(".conn").map(function (g) { return { g: g, bead: g.querySelector(".conn-bead") }; })
  };
  var ends = stages.map(function (_, i) { return lineEnds(i); });

  /* ---------- State and springs ---------- */
  var open = false, hovered = null, openedAt = 0;
  var onScreen = true, raf = 0, last = 0;
  var target = { x: 0, y: 0, p: 0 };
  var sx = { v: 0, vel: 0 }, sy = { v: 0, vel: 0 }, sp = { v: 0, vel: 0 };

  function stepSpring(s, to, c, dt) {
    var a = (c.k * (to - s.v) - c.d * s.vel) / c.m;
    s.vel += a * dt;
    s.v += s.vel * dt;
  }
  function settled(s, to) { return Math.abs(to - s.v) < 0.0005 && Math.abs(s.vel) < 0.0005; }

  function setOpen(v) {
    if (v === open) return;
    open = v;
    if (v) openedAt = performance.now();
    target.p = v ? 1 : 0;
    host.classList.toggle("is-open", v);
    el.hit.setAttribute("aria-expanded", String(v));
    syncBeads();
    kick();
  }

  function hoverCard(i) {
    hovered = i;
    cards.forEach(function (c, k) { c.classList.toggle("is-lit", k === i); });
    el.conns.forEach(function (c, k) { c.g.classList.toggle("is-lit", k === i); });
    if (i !== null && !reduce) setOpen(true);
  }

  // The orbit beads run on SMIL clocks: freeze them while open, off screen, in a hidden tab, or for reduced motion.
  function syncBeads() {
    var paused = open || !onScreen || document.hidden || reduce;
    el.beadSvgs.forEach(function (s) {
      if (!s.pauseAnimations) return;
      if (paused) s.pauseAnimations(); else s.unpauseAnimations();
    });
  }

  var easeInOut = function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };

  function render(now) {
    var x = sx.v, y = sy.v, p = clamp(sp.v);
    var rx = -y * MOTION.tilt + p * 4, ry = x * MOTION.tilt;
    var t = "rotateX(" + rx.toFixed(3) + "deg) rotateY(" + ry.toFixed(3) + "deg)";
    el.tilts.forEach(function (n) { n.style.transform = t; });
    el.layers.forEach(function (l) { l.n.style.transform = "translate3d(" + (x * l.reach).toFixed(2) + "px," + (y * l.reach).toFixed(2) + "px,0)"; });

    var orbitOp = 1 - (1 - MOTION.orbitOpenOpacity) * clamp(p / 0.6);
    el.orbits.forEach(function (n) { n.style.opacity = orbitOp; });
    el.rest.style.opacity = 1 - clamp(p / 0.04);
    el.exploded.style.opacity = clamp(p / 0.03);
    el.shadow.style.opacity = 1 - 0.45 * p;
    el.hint.style.opacity = 1 - clamp(p / 0.25);

    el.plates.forEach(function (pl, i) {
      var k = plateProgress(i, p), slab = PLATE_SLABS[i];
      var s = 1 + (EXPLODE.scales[i] - 1) * k, cy = slab.top + slab.depth / 2;
      pl.g.setAttribute("transform", "translate(0 " + fx(TRAVEL[i] * k) + ") translate(" + CX + " " + fx(cy) + ") scale(" + s.toFixed(4) + ") translate(" + -CX + " " + fx(-cy) + ")");
      if (pl.shadow) pl.shadow.setAttribute("opacity", (k * 0.16).toFixed(3));
      if (pl.skirt) pl.skirt.setAttribute("opacity", k.toFixed(3));
    });

    var on = clamp((p - 0.5) / 0.4);
    el.aiRim.forEach(function (n) { n.setAttribute("opacity", (on * 0.9).toFixed(3)); });
    el.aiHalo.setAttribute("opacity", (on * 0.55).toFixed(3));
    el.aiSpill.setAttribute("opacity", (on * 0.55 * 0.35).toFixed(3));
    el.aiGlow.setAttribute("opacity", (clamp((p - 0.4) / 0.5) * 0.6).toFixed(3));

    // Cards stay readable at rest (labels a glance can catch) and reach full strength as the stack opens.
    var cardOp = 0.8 + 0.2 * clamp(p / 0.6);
    cards.forEach(function (c, i) {
      var dir = stages[i].side === "left" ? -1 : 1;
      var dx = -dir * CARDS.restInset + (dir * CARDS.outward + dir * CARDS.restInset) * p;
      c.style.opacity = cardOp;
      c.style.transform = "translate3d(" + dx.toFixed(2) + "px,0,0)";
    });

    var show = clamp((p - 0.55) / 0.35), beadsOn = open && !reduce;
    el.conns.forEach(function (c, i) {
      c.g.setAttribute("opacity", show.toFixed(3));
      var k = 0;
      if (beadsOn) {
        var cycle = CARDS.beadSeconds + 1.4, el2 = (now - openedAt) / 1000 - (0.5 + i * 0.25);
        if (el2 > 0) { var ph = el2 % cycle; k = ph < CARDS.beadSeconds ? easeInOut(ph / CARDS.beadSeconds) : 0; }
      }
      c.bead.setAttribute("cx", fx(ends[i].nodeX + (ends[i].plateX - ends[i].nodeX) * k));
      c.bead.setAttribute("opacity", (show * Math.sin(Math.PI * k)).toFixed(3));
    });
  }

  function frame(now) {
    var dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    if (reduce) {
      sx.v = sy.v = 0; sx.vel = sy.vel = 0;
      sp.v = target.p; sp.vel = 0;
    } else {
      // Fixed substeps keep the springs stable on slow frames.
      for (var n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n, i = 0; i < n; i++) {
        stepSpring(sx, target.x, POINTER_SPRING, h);
        stepSpring(sy, target.y, POINTER_SPRING, h);
        stepSpring(sp, target.p, EXPLODE.spring, h);
      }
    }
    render(now);
    var moving = !(settled(sx, target.x) && settled(sy, target.y) && settled(sp, target.p));
    raf = onScreen && !document.hidden && (moving || (open && !reduce)) ? requestAnimationFrame(frame) : 0;
    if (!raf) last = 0;
  }

  function kick() { if (!raf && onScreen && !document.hidden) raf = requestAnimationFrame(frame); }

  /* ---------- Input ---------- */
  var pointerType = "mouse";

  host.addEventListener("pointermove", function (e) {
    if (reduce || e.pointerType !== "mouse") return;
    var box = host.getBoundingClientRect();
    target.x = ((e.clientX - box.left) / box.width - 0.5) * 2;
    target.y = ((e.clientY - box.top) / box.height - 0.5) * 2;
    kick();
  });
  host.addEventListener("pointerleave", function (e) {
    // A finger "leaves" on every lift, just before its click; closing here would make each tap re-open.
    if (e.pointerType !== "mouse") return;
    target.x = target.y = 0;
    hoverCard(null);
    setOpen(false);
    kick();
  });

  // A mouse opens it by hovering the core; touch and keyboard have no hover, so they toggle instead.
  el.hit.addEventListener("pointerdown", function (e) { pointerType = e.pointerType; });
  el.hit.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse" && !reduce) setOpen(true); });
  el.hit.addEventListener("click", function (e) { if (e.detail === 0 || pointerType !== "mouse" || reduce) setOpen(!open); });
  el.hit.addEventListener("blur", function () { setOpen(false); });
  el.hit.addEventListener("keydown", function (e) { if (e.key === "Escape" && open) { e.preventDefault(); setOpen(false); } });

  /* ---------- Floor grid with a spotlight that follows the cursor across the hero ---------- */
  var floor = hero && hero.querySelector(".hero-floor");
  if (floor) {
    var grid = function (id, cls) {
      return '<svg class="' + cls + '" width="100%" height="100%" aria-hidden="true" focusable="false"><defs><pattern id="' + id + '" width="84" height="48" patternUnits="userSpaceOnUse">' +
        '<path d="M0 24L42 0L84 24M0 24L42 48L84 24" fill="none"/></pattern></defs><rect width="100%" height="100%" fill="url(#' + id + ')"/></svg>';
    };
    floor.innerHTML = grid("core-floor-cell", "floor-grid") + '<div class="floor-spot"><div class="floor-lit">' + grid("core-floor-cell-lit", "floor-grid floor-grid-lit") + "</div></div>";
    var spot = floor.querySelector(".floor-spot"), lit = floor.querySelector(".floor-lit"), SPOT = 340, spotRaf = 0;
    new ResizeObserver(function (en) {
      lit.style.width = en[0].contentRect.width + "px";
      lit.style.height = en[0].contentRect.height + "px";
    }).observe(hero);
    hero.addEventListener("pointermove", function (e) {
      if (e.pointerType !== "mouse" || reduce) return;
      cancelAnimationFrame(spotRaf);
      spotRaf = requestAnimationFrame(function () {
        var b = hero.getBoundingClientRect(), x = e.clientX - b.left - SPOT / 2, y = e.clientY - b.top - SPOT / 2;
        spot.style.transform = "translate3d(" + x + "px," + y + "px,0)";
        lit.style.transform = "translate3d(" + -x + "px," + -y + "px,0)";
        floor.dataset.spot = "on";
      });
    });
    hero.addEventListener("pointerleave", function () { cancelAnimationFrame(spotRaf); floor.dataset.spot = "off"; });
  }

  /* ---------- A one-time peek, so visitors who never hover still see the layers ---------- */
  // Once the core is first on screen it opens by itself for a few seconds, then closes. Any
  // interaction (or reduced motion) cancels it, and from then on the visitor is in control.
  var touched = false, peeked = false, peeking = false;
  ["pointerenter", "pointerdown", "focusin"].forEach(function (ev) {
    host.addEventListener(ev, function () { touched = true; peeking = false; });
  });
  function peek() {
    if (peeked) return;
    peeked = true;
    setTimeout(function () {
      if (touched || reduce || !onScreen || document.hidden) return;
      peeking = true;
      setOpen(true);
      setTimeout(function () { if (peeking) { peeking = false; setOpen(false); } }, 3200);
    }, 2200);
  }

  /* ---------- Lifecycle ---------- */
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (en) {
      onScreen = en[0].isIntersecting;
      syncBeads();
      if (onScreen) { kick(); peek(); }
    }, { rootMargin: "40px" }).observe(host);
  }
  document.addEventListener("visibilitychange", function () { syncBeads(); if (!document.hidden) kick(); });
  reduceMQ.addEventListener("change", function (mq) {
    reduce = mq.matches;
    if (reduce) { target.x = target.y = 0; if (floor) floor.dataset.spot = "off"; }
    syncBeads();
    kick();
  });

  host.classList.add("is-ready");
  syncBeads();
  render(performance.now());
})();
