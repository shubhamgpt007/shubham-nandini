/* haldi.js — scene 5 of 7. "Put the haldi on."
 *
 * ART        base (aqua sky, pink backdrop panels, garden) + two garden umbrellas on
 *            poles, four hanging rattan lamps, two hanging tulip baskets, the tree
 *            blossoms, the gazebo / cart / pots, and the seated couple.
 * AMBIENT    the lamps swing on their cords, the baskets rock, the umbrellas breathe on
 *            their poles, the blossoms flutter, the couple settle on their cushions.
 *            The BASE never moves: its resting frame is the PSD frame.
 * SIGNATURE  the ritual itself — one tap on the couple and the haldi goes on. Warm
 *            turmeric strokes sweep across the two of them over about a second, laid
 *            down by the same canvas stamp routine a finger used to drive but walked
 *            along a timed path instead; then a golden wash blooms out of the cushions
 *            and the day turns.
 * FORWARD    "haldi-glow" — that same wash floods the frame and the mandap settles out
 *            of the light.
 *
 * COMPOSITION NOTE
 *   ambient       -> `transform` (kit loops on the layers)
 *   the smear     -> a <canvas> at z 105: above the couple (z 100), UNDER the foreground
 *                    pot / blossoms / lamps, so the turmeric sits on them, not on the
 *                    whole garden. It is FX paint, never artwork: every mark is a soft
 *                    radial blob of turmeric light, and the strokes are kept in DESIGN
 *                    coordinates so a relayout re-renders them instead of stretching
 *                    stale pixels. Pure paint — the tap is taken by .hd-hit above it.
 *                    The marks multiply against each other INSIDE the canvas
 *                    (ctx.globalCompositeOperation), never through mix-blend-mode on
 *                    the element: a compositor blend would force a backing buffer for
 *                    everything under it.
 *
 * Owns exactly: this file + css/scenes/haldi.css.
 */

import * as kit from "../fx/kit.js?v=8";
import * as text from "../fx/text.js?v=9";

/* ------------------------------------------------------- design-space anchors */
/* read off data/scenes.json; the PSD render qa/ref/haldi.png is 1:1 with design px */

const COUPLE = { x: 298, y: 1553, w: 716, h: 285 };
const CX = COUPLE.x + COUPLE.w / 2; /* 656 */
const CY = COUPLE.y + COUPLE.h / 2; /* 1695.5 */

/* the canvas is the couple's rect + slop: haldi is smeared generously, and a stroke
   that stops dead on the cutout's edge would read as a mask, not as a gesture */
const PAD = 80;
const PAINT = {
  x: COUPLE.x - PAD,
  y: COUPLE.y - PAD,
  w: COUPLE.w + PAD * 2,
  h: COUPLE.h + PAD * 2
};

const STEP = 13; /* design px between stamps along the stroke */
const R_MIN = 34;
const R_MAX = 54;
const A_MIN = 0.17;
const A_MAX = 0.3;
const MAX_STAMPS = 1200; /* the replay log; the whole application lands well short */
const POP_CHANCE = 0.16;
const POP_MAX = 10;

/* ---- the self-painting stroke -------------------------------------------
 * The rub, described as a path instead of read off a finger: SWEEPS passes across the
 * couple, descending, which is the shape a hand makes putting haldi on and the same
 * ground the old pointer rub had to cover before the wash would light. INSET keeps the
 * stroke off the cutout's outer edge — a blob is R_MAX wide, so it still spills onto
 * the slop around them exactly as a real rub did. */
const SMEAR_MS = 1150; /* how long the haldi takes to go on */
const SWEEPS = 3;
const INSET = 46;
const WOBBLE = 16; /* design px of vertical give per sweep, so no pass is a ruled line */

const IGNITE_MS = 360;
const GLOW_MS = 1300;
const FADE_MS = 400;

/* ---- the golden wash, in two BOUNDED pieces --------------------------------
 *
 * This was one 3800x3800 design-px disc carrying `will-change: transform, opacity`
 * and scaled out to 1.33. On a 390px iPhone at dpr 3 that is a 4117x4117 compositor
 * surface — 65MB allocated in one go on the frame the guest taps, and ~115MB if the
 * compositor rasters at the animation's peak scale, which is what a compositor does
 * with a scaling layer it has been told to promote. iOS Safari kills the tab for
 * that, which is why this scene still "crashed on tap" after the image window had
 * already brought decoded bitmaps down from 220MB to 70MB: the trigger was never the
 * running total, it was this one allocation.
 *
 * Rebuilt on two rules: no node is bigger than the frame it has to cover, and NOTHING
 * scales above 1 — a layer's backing store then cannot exceed its own box whatever
 * raster-scale policy the browser applies.
 *
 *   DISC (.hd-wash)        the bloom out of the cushions. A 2 x WASH_R box centred on
 *                          the couple, growing 0.16 -> 1. Its gradient reaches alpha 0
 *                          at 0.8 x 950 = 760 design px, which is exactly where the old
 *                          disc's did at the end of the ignition — so the ignition is
 *                          the same picture, pixel for pixel.
 *   FIELD (.hd-wash-field) the flood. The visible frame band and not one px more,
 *                          painted with the SAME stops resolved at the radius the old
 *                          disc reached at its peak (0.8 x 2529 = 2023 design px), and
 *                          brought in on OPACITY ALONE. Its outer stops are faint, so
 *                          they only cross the visible threshold as the opacity climbs:
 *                          the gold still travels outward and still reaches the corners
 *                          last, it just does it without a 4000px surface.
 */
const WASH_R = 950; /* disc radius in design px — the box is twice this */
const WASH_S0 = 0.16; /* ignition start */
const WASH_A0 = 0.55; /* ignition end / flood start */
const WASH_STOPS =
  " rgba(255, 240, 186, 0.98) 0%," +
  " rgba(248, 206, 96, 0.92) 30%," +
  " rgba(236, 175, 54, 0.55) 56%," +
  " rgba(224, 150, 40, 0) 80%";
const WASH_GRADIENT = "radial-gradient(circle at 50% 50%," + WASH_STOPS + ")";

/* The flood's box: the visible design band, generously. The frame is 1080x1920, but a
   tall phone shows bleed above and below it, so the field is oversized on every side
   and undersized on none. 1360 x 2700 design px -> 1473 x 2925 device px at dpr 3. */
const FIELD = { x: -140, y: -340, w: 1360, h: 2700 };
const FIELD_R = 2529; /* 0.8 x this = 2023 = where the old disc's gold ended up */

/* The field's stops are the disc's, LIFTED. The old driver ran the flood underneath an
   animated `filter: brightness(1 -> 1.18)` on the whole outgoing scene, so the gold the
   guest actually saw at the peak was 18% brighter than these numbers — dropping the
   filter without accounting for it left the flood measurably dim (-19/-25/-15 RGB on
   the frame mean, over the 2.0-2.8s window). Baked in here instead, on the ONE node
   that carries the flood, rather than paid for with a full-scene filter snapshot.
   The disc keeps the unlifted stops: the ignition never had the filter over it. */
const FIELD_STOPS =
  " rgba(255, 255, 205, 0.98) 0%," +
  " rgba(255, 227, 106, 0.92) 30%," +
  " rgba(255, 193, 59, 0.55) 56%," +
  " rgba(246, 165, 44, 0) 80%";
const FIELD_GRADIENT =
  "radial-gradient(circle " +
  FIELD_R +
  "px at " +
  (CX - FIELD.x) +
  "px " +
  (CY - FIELD.y) +
  "px," +
  FIELD_STOPS +
  ")";

/* One scene instance is ever live, so one module-scope slot is enough. Reset in
   enter(), which the engine replays on every entry. */
let state = null;

/* ---------------------------------------------------------------- ambient */

/* hanging lamps: cords run off the top of each cutout, so they pivot at top-centre.
   Alternating signs are true antiphase — the row never swings as one piece. */
const LAMPS = [
  { id: "lamp-1", deg: 2.5, dur: 4400, phase: 0 },
  { id: "lamp-2", deg: -2.5, dur: 5200, phase: 0.27 },
  { id: "lamp-3", deg: 2.5, dur: 4800, phase: 0.55 },
  { id: "lamp-4", deg: -2.5, dur: 5800, phase: 0.82 }
];

/* the tulip baskets hang from ropes above the frame edge — same top pivot */
const BASKETS = [
  { id: "basket-left", deg: 2, dur: 6400, phase: 0.12 },
  { id: "basket-right", deg: -2, dur: 7000, phase: 0.48 }
];

/* the umbrellas STAND on poles: they hinge at the ground, and only just */
const UMBRELLAS = [
  { id: "umbrella-left", deg: 0.8, dur: 7600, phase: 0.2 },
  { id: "umbrella-right", deg: -0.8, dur: 8400, phase: 0.62 }
];

function startAmbient(ctx) {
  const fx = kit.use(ctx);

  LAMPS.forEach(function (l) {
    fx.pendulum(ctx.layer(l.id), { deg: l.deg, dur: l.dur, phase: l.phase });
  });

  BASKETS.forEach(function (b) {
    fx.sway(ctx.layer(b.id), { deg: b.deg, dur: b.dur, origin: "50% 0%", phase: b.phase });
  });

  UMBRELLAS.forEach(function (u) {
    fx.sway(ctx.layer(u.id), { deg: u.deg, dur: u.dur, origin: "50% 100%", phase: u.phase });
  });

  /* the blossom canopy is rooted in the tree at the frame's top-right corner. Two
     loops on two DIFFERENT properties (opacity vs transform) compose instead of
     fighting: a flutter of light plus a barely-there lean. */
  const blossoms = ctx.layer("tree-blossoms");
  fx.glowPulse(blossoms, { from: 0.94, to: 1, dur: 5200, jitter: 0.25 });
  fx.sway(blossoms, { deg: 0.6, dur: 7400, origin: "100% 0%", phase: 0.3 });

  /* the couple breathe on their cushions until the haldi arrives */
  state.bob = fx.bob(ctx.layer("couple"), { px: 2, dur: 3800 });
}

/* ------------------------------------------------------------------- wash */

/** The golden disc, positioned on the couple. Styled inline because the transition
 *  builds the very same object from a scene that is already leaving.
 *
 *  No `will-change`. A WAAPI transform/opacity animation is composited on its own —
 *  kit.js's own rule 5 says so — and pinning a layer here is precisely what turned a
 *  soft gradient into a 65MB allocation on the tap. */
function makeWash(frame) {
  const w = document.createElement("div");
  w.className = "hd-fx hd-wash";
  w.style.position = "absolute";
  w.style.left = CX - WASH_R + "px";
  w.style.top = CY - WASH_R + "px";
  w.style.width = WASH_R * 2 + "px";
  w.style.height = WASH_R * 2 + "px";
  w.style.zIndex = "470"; /* over every layer, under the kit's hint (480) */
  w.style.borderRadius = "50%";
  w.style.background = WASH_GRADIENT;
  w.style.opacity = "0";
  w.style.pointerEvents = "none";
  frame.appendChild(w);
  return w;
}

/** The flood: the visible band of the frame, gold, brought in on OPACITY ALONE.
 *  Never transformed, so its backing store is exactly its own box and nothing else. */
function makeField(frame) {
  const f = document.createElement("div");
  f.className = "hd-fx hd-wash-field";
  f.style.position = "absolute";
  f.style.left = FIELD.x + "px";
  f.style.top = FIELD.y + "px";
  f.style.width = FIELD.w + "px";
  f.style.height = FIELD.h + "px";
  f.style.zIndex = "469"; /* under the disc, over every layer */
  f.style.background = FIELD_GRADIENT;
  f.style.opacity = "0";
  f.style.pointerEvents = "none";
  frame.appendChild(f);
  return f;
}

/** A flat sheet of warm light over the ARRIVING scene, fading off.
 *
 *  This replaces `filter: brightness(1.5 -> 1)` animated on the whole incoming
 *  .scene element. A filter on a scene forces the compositor to snapshot every layer
 *  beneath it, at device resolution, for as long as it runs — and the old transition
 *  did it to BOTH scenes at once. A solid colour costs a compositor essentially
 *  nothing, and it can push past white where brightness() could only lift what was
 *  already there. */
function makeBloomIn(el) {
  const b = document.createElement("div");
  b.className = "hd-bloom-in";
  b.setAttribute("aria-hidden", "true");
  b.style.position = "absolute";
  b.style.inset = "0";
  b.style.zIndex = "600"; /* over the frame (1) and the copy (500) */
  b.style.background = "#fff3d8";
  b.style.opacity = "0";
  b.style.pointerEvents = "none";
  el.appendChild(b);
  return b;
}

/* -------------------------------------------------------------- the smear */

function rand(a, b) {
  return a + Math.random() * (b - a);
}

/**
 * The canvas is sized in DESIGN px by CSS and backed by a store scaled to the live
 * frame scale x dpr, so a stroke is as crisp as the artwork under it. Every stamp is
 * logged in design coordinates: on a relayout the store is rebuilt and the log is
 * replayed, so the turmeric stays anchored to the couple instead of being stretched.
 */
function makeCanvas(ctx) {
  const canvas = document.createElement("canvas");
  canvas.className = "hd-fx hd-smear";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.setProperty("--x", PAINT.x + "px");
  canvas.style.setProperty("--y", PAINT.y + "px");
  canvas.style.setProperty("--w", PAINT.w + "px");
  canvas.style.setProperty("--h", PAINT.h + "px");
  ctx.frame.appendChild(canvas);

  let c2d = null;
  let renderScale = 1;

  function frameScale() {
    const raw = getComputedStyle(ctx.frame).getPropertyValue("--fs");
    const n = parseFloat(raw);
    return isFinite(n) && n > 0 ? n : 1;
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const next = Math.max(0.5, Math.min(2.4, frameScale() * dpr));
    const w = Math.max(1, Math.round(PAINT.w * next));
    const h = Math.max(1, Math.round(PAINT.h * next));
    if (canvas.width === w && canvas.height === h) return false;
    renderScale = next;
    canvas.width = w;
    canvas.height = h;
    c2d = canvas.getContext("2d");
    /* The stain, blended INSIDE the canvas. This used to be `mix-blend-mode: multiply`
       on the element, which is a compositor blend: it forces the whole stacking
       context beneath the canvas into its own backing buffer and defeats tiling, on a
       scene that is already the heaviest in the invitation. Doing it here costs
       nothing — a resize re-creates the context, so it is re-armed on every rebuild. */
    c2d.globalCompositeOperation = "multiply";
    /* draw in design px from here on */
    c2d.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    return true;
  }

  /** one soft blob of turmeric light, in design coordinates.
   *
   * THE COLOURS ARE NOT THE RAW TURMERIC. The element used to be composited with
   * `mix-blend-mode: multiply`, so every mark was the ARTWORK multiplied by the gold —
   * a stain that kept the garden's texture and luminance underneath it. With the
   * element compositing normally that same gold reads as opaque orange paint sprayed
   * over the couple (measured: +11 R against the old look, and obvious on sight).
   *
   * Normal compositing reproduces a multiply exactly when the source colour is
   * `backdrop x source`, so these are the old stops pulled 55% of the way toward
   * (gold x the mean artwork under the smear rect, measured at 158/150/98). That lands
   * the stained band within ~1 RGB point of the old blend, and it reads as turmeric
   * soaking in rather than sitting on top. Re-measure if the haldi art is ever
   * re-exported. */
  function paint(s) {
    if (!c2d) return;
    const g = c2d.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
    g.addColorStop(0, "rgba(194, 151, 41, " + s.a.toFixed(3) + ")");
    g.addColorStop(0.45, "rgba(188, 141, 29, " + (s.a * 0.86).toFixed(3) + ")");
    g.addColorStop(0.75, "rgba(182, 127, 24, " + (s.a * 0.4).toFixed(3) + ")");
    g.addColorStop(1, "rgba(179, 119, 21, 0)");
    c2d.fillStyle = g;
    c2d.beginPath();
    c2d.arc(s.x, s.y, s.r, 0, 6.283185);
    c2d.fill();
  }

  function replay() {
    if (!c2d) return;
    c2d.clearRect(0, 0, PAINT.w, PAINT.h);
    state.stamps.forEach(paint);
  }

  function clear() {
    state.stamps.length = 0;
    if (c2d) c2d.clearRect(0, 0, PAINT.w, PAINT.h);
  }

  resize();

  return {
    el: canvas,
    /** design-space stamp; x/y are frame coordinates */
    add: function (x, y, r, a) {
      const s = { x: x - PAINT.x, y: y - PAINT.y, r: r, a: a };
      if (state.stamps.length < MAX_STAMPS) state.stamps.push(s);
      paint(s);
    },
    relayout: function () {
      if (resize()) replay();
    },
    clear: clear,
    destroy: function () {
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }
  };
}

/* the little marigold pops that follow the stroke — geometric light, never artwork.
   fx.play ties every one of them to ctx.signal, so leaving the scene mid-smear cancels
   them and document.getAnimations() empties. */
function pop(ctx, fx, x, y) {
  if (ctx.reducedMotion || state.pops >= POP_MAX) return;
  const dot = document.createElement("span");
  dot.className = "hd-fx hd-pop";
  dot.style.setProperty("--x", x + "px");
  dot.style.setProperty("--y", y + "px");
  dot.style.setProperty("--s", rand(9, 17).toFixed(1) + "px");
  ctx.frame.appendChild(dot);
  state.pops += 1;

  const drift = rand(-16, 16);
  fx
    .play(
      dot,
      [
        { transform: "translate3d(0,0,0) scale(0.3)", opacity: 0 },
        {
          transform: "translate3d(" + (drift * 0.4).toFixed(1) + "px,-9px,0) scale(1)",
          opacity: 0.9,
          offset: 0.35
        },
        { transform: "translate3d(" + drift.toFixed(1) + "px,-26px,0) scale(0.7)", opacity: 0 }
      ],
      { duration: Math.round(rand(620, 900)), easing: "cubic-bezier(0.22, 0.61, 0.36, 1)" }
    )
    .then(function () {
      state.pops -= 1;
      if (dot.parentNode) dot.parentNode.removeChild(dot);
    });
}

/**
 * Where the stroke is at `t` (0..1 across SMEAR_MS), in design px.
 *
 * A triangle wave gives SWEEPS left-right passes; `t` walks the whole thing down the
 * couple; the sine adds a little give so no pass is a ruled line. t=0 starts at the
 * top-left of them, t=1 finishes bottom-right — which is where a hand would end up.
 */
function strokeAt(t) {
  const u = t * SWEEPS;
  const tri = 1 - Math.abs((u % 2) - 1); /* 0 -> 1 -> 0, once per pass */
  return {
    x: COUPLE.x + INSET + tri * (COUPLE.w - INSET * 2),
    y: COUPLE.y + INSET + t * (COUPLE.h - INSET * 2) + Math.sin(u * Math.PI) * WOBBLE
  };
}

/* ---------------------------------------------------------------- complete */

/** The wash ignites over the couple and the day turns. The pose it ends on is where
 *  "haldi-glow" picks the very same disc up, so nothing pops on the hand-over. */
function ignite(ctx) {
  if (!state || state.done || !ctx.isActive()) return;
  state.done = true;
  if (state.tip) state.tip.done(); /* idempotent: the tap has usually retired it already */

  const finish = function () {
    if (ctx.isActive()) ctx.complete();
  };

  if (ctx.reducedMotion) {
    finish();
    return;
  }

  /* 0.16 -> 1 of a 950px radius is 152 -> 950 design px of gold: the exact sweep the
     old 0.08 -> 0.5 of a 1900px radius drew, off a quarter of the surface. */
  const wash = makeWash(ctx.frame);
  wash.animate(
    [
      { transform: "scale(" + WASH_S0 + ")", opacity: 0 },
      { transform: "scale(1)", opacity: WASH_A0 }
    ],
    { duration: IGNITE_MS, easing: "cubic-bezier(0.33, 1, 0.68, 1)", fill: "forwards" }
  );
  state.timer = setTimeout(finish, IGNITE_MS);
}

/* -------------------------------------------------------------- interaction */

function armTap(ctx) {
  const fx = kit.use(ctx);
  const reduced = ctx.reducedMotion;

  /* A real <button> over the couple + their slop: the tap target, the keyboard route
     and the accessible name, all one control. Invisible by design — js/fx/kit.js draws
     the only affordance the guest ever sees, and a tap anywhere else does nothing. */
  const hit = document.createElement("button");
  hit.type = "button";
  hit.className = "hd-fx hd-hit";
  hit.setAttribute("aria-label", "Tap to join the carnival");
  hit.style.setProperty("--x", PAINT.x + "px");
  hit.style.setProperty("--y", PAINT.y + "px");
  hit.style.setProperty("--w", PAINT.w + "px");
  hit.style.setProperty("--h", PAINT.h + "px");
  ctx.frame.appendChild(hit);

  /* the pill sits above the smear rect, on the lattice between the pink panels */
  state.tip = fx.hint({
    designX: CX,
    designY: CY - 10,
    type: "tap",
    labelAt: [540, 1385]
  });

  /* rule 4: reduced motion gets the ritual without the particles — no canvas, no
     stroke, no pops. The tap still completes the scene, through the same ignite(). */
  const canvas = reduced ? null : makeCanvas(ctx);
  state.canvas = canvas;

  /* a resize rewrites --fs, so the backing store is rebuilt and the log replayed */
  const offLayout = canvas
    ? ctx.stage.on("layout", function () {
        canvas.relayout();
      })
    : null;

  function smear(x, y) {
    canvas.add(x, y, rand(R_MIN, R_MAX), rand(A_MIN, A_MAX));
    if (Math.random() < POP_CHANCE) pop(ctx, fx, x, y);
  }

  /**
   * The haldi going on, on its own.
   *
   * `strokeAt` is sampled per frame and the gap since the last sample is filled in
   * STEP increments — the identical trick the pointer rub used to turn a fast drag
   * into a stroke rather than a dotted line, so the marks, their spacing and the
   * marigold pops are the ones the rub produced. A frame lost to a hidden tab simply
   * means a longer segment to fill, and the run is bounded by the path's own length.
   */
  function runStroke(done) {
    /* pinned, not read off the module slot: enter() replaces `state` on every entry,
       and a frame belonging to a visit that has ended must never write to the new one */
    const st = state;
    let last = strokeAt(0);
    let started = 0;
    smear(last.x, last.y);

    const tick = function (now) {
      if (st !== state || st.done || !ctx.isActive()) return;
      st.raf = 0;
      if (!started) started = now;
      const t = Math.min(1, (now - started) / SMEAR_MS);
      const p = strokeAt(t);
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= STEP) {
        const steps = Math.floor(dist / STEP);
        for (let i = 1; i <= steps; i += 1) {
          smear(last.x + (dx * i) / steps, last.y + (dy * i) / steps);
        }
        last = p;
      }
      if (t >= 1) {
        done();
        return;
      }
      st.raf = requestAnimationFrame(tick);
    };

    st.raf = requestAnimationFrame(tick);
  }

  /** One tap puts the haldi on. `state.smearing` latches on the first one, so a
   *  double- or triple-tap can never start a second stroke or a second wash. */
  const onTap = function () {
    if (!state || state.done || state.smearing || !ctx.isActive()) return;
    state.smearing = true;
    hit.disabled = true;
    if (state.tip) state.tip.done();

    if (!canvas) {
      ignite(ctx);
      return;
    }
    runStroke(function () {
      ignite(ctx);
    });
  };

  ctx.on(hit, "click", onTap);

  /* iOS Safari answers a stationary long-press with its own callout / magnifier. The
     callout is refused twice: in CSS (-webkit-touch-callout on the stage subtree) and
     here, on this element alone — a guest who rests a finger on the couple out of old
     habit must still get a plain tap out of it. `passive: false` — ctx.on passes
     { passive: true }, and a passive listener may not preventDefault. */
  ctx.on(
    hit,
    "contextmenu",
    function (e) {
      e.preventDefault();
    },
    { passive: false }
  );

  return function teardown() {
    cancelAnimationFrame(state.raf);
    state.raf = 0;
    clearTimeout(state.timer);
    if (offLayout) offLayout();
    if (canvas) canvas.clear();
    state.canvas = null;
    ctx.frame.querySelectorAll(".hd-fx").forEach(function (n) {
      n.parentNode.removeChild(n);
    });
  };
}

/* ---------------------------------------------------- forward: "haldi-glow" */

function crossfade(fromEl, toEl, done) {
  const anims = [];
  if (fromEl) {
    fromEl.style.zIndex = "2";
    anims.push(fromEl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, fill: "forwards" }));
  }
  toEl.style.zIndex = "1";
  anims.push(toEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, fill: "backwards" }));
  const t = setTimeout(done, FADE_MS);
  return function cleanup() {
    clearTimeout(t);
    anims.forEach(function (a) {
      if (a) a.cancel();
    });
    if (fromEl) fromEl.style.zIndex = "";
    toEl.style.zIndex = "";
  };
}

/**
 * The wash the couple just lit floods the whole garden, and the mandap settles out of
 * that light.
 *
 * The DISC is the same one the scene ignited (same centre, same gradient, picked up at
 * the exact pose and opacity the ignition left it on), so there is no seam at the
 * hand-over — it simply has nowhere left to grow, because the FIELD behind it is
 * already the size of the frame. Both live in the OUTGOING frame: as haldi dissolves
 * the gold goes with it, which is the recede.
 *
 * Nothing here animates `filter`, and nothing scales above 1. The old driver put an
 * animated `brightness()` on BOTH scene elements at once — two full-scene filter
 * snapshots at device resolution, on top of the 4117px wash — for a bloom that a flat
 * sheet of light over the arriving scene delivers for free.
 */
kit.defineTransition("haldi-glow", function (fromEl, toEl, done, meta) {
  if (meta.reducedMotion || !fromEl) return crossfade(fromEl, toEl, done);

  const frame = fromEl.querySelector(".scene__frame");
  const field = frame ? makeField(frame) : null;
  const wash = frame ? makeWash(frame) : null;
  const anims = [];

  /* the flood. Its outer stops are faint, so they cross the visible threshold late:
     the gold front still travels out to the corners, driven by opacity instead of by
     a disc four thousand px across. */
  if (field) {
    anims.push(
      field.animate(
        [
          { opacity: 0, offset: 0 },
          { opacity: 0.34, offset: 0.22 },
          { opacity: 0.88, offset: 0.48 },
          { opacity: 1, offset: 0.72 },
          { opacity: 0.94, offset: 1 }
        ],
        { duration: GLOW_MS, easing: "cubic-bezier(0.33, 1, 0.68, 1)", fill: "forwards" }
      )
    );
  }

  /* the disc holds the pose the ignition left it on, brightens, and lets go into the
     field as the field takes the frame — so the centre never doubles up on itself */
  if (wash) {
    anims.push(
      wash.animate(
        [
          { transform: "scale(1)", opacity: WASH_A0, offset: 0 },
          { transform: "scale(1)", opacity: 0.72, offset: 0.34 },
          { transform: "scale(1)", opacity: 0.34, offset: 0.72 },
          { transform: "scale(1)", opacity: 0.12, offset: 1 }
        ],
        { duration: GLOW_MS, easing: "cubic-bezier(0.33, 1, 0.68, 1)", fill: "forwards" }
      )
    );
  }

  fromEl.style.zIndex = "2";
  anims.push(
    fromEl.animate(
      [
        { opacity: 1, offset: 0 },
        { opacity: 1, offset: 0.4 },
        { opacity: 0, offset: 0.88 },
        { opacity: 0, offset: 1 }
      ],
      { duration: GLOW_MS, easing: "cubic-bezier(0.5, 0, 0.75, 0.6)", fill: "forwards" }
    )
  );

  toEl.style.zIndex = "1";
  const bloomIn = makeBloomIn(toEl);
  anims.push(
    toEl.animate(
      [
        { opacity: 0, transform: "scale(1.02)", offset: 0 },
        { opacity: 0, transform: "scale(1.017)", offset: 0.32 },
        { opacity: 0.72, offset: 0.68 },
        { opacity: 1, transform: "scale(1)", offset: 1 }
      ],
      { duration: GLOW_MS, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)", fill: "backwards" }
    )
  );
  anims.push(
    bloomIn.animate(
      [
        { opacity: 0.78, offset: 0 },
        { opacity: 0.74, offset: 0.34 },
        { opacity: 0.44, offset: 0.7 },
        { opacity: 0, offset: 1 }
      ],
      { duration: GLOW_MS, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)", fill: "backwards" }
    )
  );

  const timer = setTimeout(done, GLOW_MS);

  return function cleanup() {
    clearTimeout(timer);
    anims.forEach(function (a) {
      if (a) a.cancel();
    });
    [wash, field, bloomIn].forEach(function (n) {
      if (n && n.parentNode) n.parentNode.removeChild(n);
    });
    fromEl.style.zIndex = "";
    toEl.style.zIndex = "";
  };
});

/* ------------------------------------------------------------------ module */

kit.defineScene("haldi", {
  forward: "haldi-glow",

  enter: function (ctx) {
    /* the invitation copy, rebuilt from data/textspec.json on every entry */
    text.mount(ctx);
    state = {
      bob: null,
      canvas: null,
      tip: null,
      stamps: [],
      pops: 0,
      smearing: false, /* the tap latch — one stroke per visit */
      raf: 0,
      done: false,
      timer: 0
    };
    /* revisit: no turmeric, no pops and no wash may survive a previous visit */
    ctx.frame.querySelectorAll(".hd-fx").forEach(function (n) {
      n.parentNode.removeChild(n);
    });
    const couple = ctx.layer("couple");
    if (couple) couple.style.removeProperty("transform");
  },

  armInteraction: armTap,

  /* the entry cascade owns `transform` until it finishes, so the copy's reveal and
     the ambient loops both start at idle */
  idle: function (ctx) {
    text.reveal(ctx); /* before the ambient guards — the copy always shows */
    if (!state || state.done) return;
    startAmbient(ctx);
  }
});
