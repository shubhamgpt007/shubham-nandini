/* reception.js — scene 5 of 6. "The Grand Soiree" (Reception, 2nd Dec, night)
 *
 * ART        base (a glam night ballroom in crimson, wine and gold: crystal/fairy-light
 *            strands hung from the top, a velvety crimson middle where the copy lives,
 *            rose-dressed velvet arches, globe bulbs on brass stands, candelabras and a
 *            glossy checkerboard dance floor) + three rosy mirror disco balls, each a
 *            separate cutout hanging from a short gold chain.
 * AMBIENT    the balls swing slowly on their chains while light runs across their
 *            mirror facets (travelling glints, a passing sheen, star flares), a few
 *            reflected light spots drift across the walls and the floor, the crystal
 *            strands twinkle, the globe bulbs breathe and a little glitter hangs in the
 *            air.
 * SIGNATURE  tap the dance floor (or a ball) -> "light up the night": the balls kick
 *            and spin faster and flash, a burst of reflections swirls out of them across
 *            the room, the bulbs come up, stars pop along the strands, two spotlight
 *            pools cross the dance floor, gold & rose glitter showers
 *            down, the room flashes warm — then complete().
 * FORWARD    "soiree-golden-hour" — the ballroom dissolves into gold while a low sun
 *            swells exactly where the RSVP slide's sunset sits, and the beach settles
 *            out of that light.
 *
 * COMPOSITION NOTE
 *   ball <img>      `transform` = the ambient pendulum, `rotate` = the burst kick. Two
 *                   different properties about the same origin, so they add up instead
 *                   of one animation replacing the other (same trick as kit.bendGroup).
 *   .rc-rig         an FX twin per ball: a box at the ball's exact rect, one z above it,
 *                   running the SAME pendulum (same keyframes, same startTime) so the
 *                   facet light rides the swing. The stage builds layers as <img>, which
 *                   cannot hold children — hence a twin rather than a child.
 *   everything else small, absolutely placed nodes in design px inside the frame. The
 *                   largest is ball-1's burst flash (~340 x 340 design px). Light that has to
 *                   cover the whole viewport is a flat, childless solid-colour sheet.
 *
 * LEAVING
 *   exit() commits every ambient loop's current pose before the stage aborts ctx.signal,
 *   so nothing snaps back to rest while the room is still visible under the transition;
 *   enter() wipes those inline poses on the next visit (rule 2: a revisited scene starts
 *   on the exact art). The burst's own particles are free-running: they finish (and
 *   remove themselves) inside the dissolve instead of vanishing on the frame it begins.
 *
 * Owns exactly: this file + css/scenes/reception.css.
 */

import * as kit from "../fx/kit.js?v=8";
import * as text from "../fx/text.js?v=9";

/* --------------------------------------------------- design anchors (scenes.json) */

/* The balls. Rects come off the live layer (its --x/--y/--w/--h), so a moved layer keeps
   its light; ORB is the mirror sphere inside the cutout, measured off the alpha of each
   webp, as fractions of the layer box (cx, cy of w/h, r of w). PIVOT is the top of the
   chain. Distinct periods + alternating signs so the three never swing in lockstep
   (kit rule: antiphase is a NEGATIVE amplitude). */
const BALLS = [
  {
    id: "ball-1",
    orb: { cx: 0.48, cy: 0.604, r: 0.452 },
    pivot: "48% 0%",
    deg: 2.2,
    dur: 6200,
    phase: 0,
    kick: 6,
    facets: 6,
    flares: [[-0.42, -0.38], [0.5, 0.18]]
  },
  {
    id: "ball-2",
    orb: { cx: 0.5, cy: 0.616, r: 0.41 },
    pivot: "50.75% 0%",
    deg: -2.6,
    dur: 5400,
    phase: 0.35,
    kick: -7,
    facets: 5,
    flares: [[-0.36, -0.46], [0.44, 0.3]]
  },
  {
    id: "ball-3",
    orb: { cx: 0.538, cy: 0.643, r: 0.398 },
    pivot: "54.2% 0%",
    deg: 3.2,
    dur: 4300,
    phase: 0.7,
    kick: 9,
    facets: 3,
    flares: [[-0.3, -0.4]]
  }
];

/* the fourteen globe bulbs on brass stands, centres measured off the base art */
const BULBS = [
  [84, 1378], [60, 1419], [115, 1481], [319, 1363], [278, 1428], [357, 1421], [311, 1485],
  [748, 1362], [720, 1421], [791, 1428], [757, 1483], [990, 1379], [1014, 1420], [960, 1482]
];

/* Crystal strands across the top. The base is placed at y -240 and a tall phone shows
   ~220 design px of that bleed, so the band starts above the frame. z 9: under the balls
   (10+), so a dot never lands pasted on a mirror. */
const STRANDS = { x: 0, y: -230, w: 1080, h: 500 };
/* glitter in the air: the crimson middle, behind the copy (text is z 450) */
const AIR = { x: 40, y: 300, w: 1000, h: 1000 };

/* Reflected light spots from the turning balls. They all drift the same way (right to
   left), at different speeds, the way a real room's reflections move together; floor
   spots are squashed into ellipses by the perspective. Invisible at both ends of their
   cycle, so the resting frame is the art. */
const SPOTS = [
  { x: 980, y: 300, dx: -300, dy: 20, s: 18, tone: "rose", a: 0.5, dur: 11000, delay: 0 },
  { x: 200, y: 760, dx: -180, dy: 10, s: 14, tone: "gold", a: 0.45, dur: 9000, delay: 2600 },
  { x: 1060, y: 880, dx: -200, dy: -10, s: 16, tone: "ivory", a: 0.45, dur: 10000, delay: 1200 },
  { x: 820, y: 1110, dx: -360, dy: 16, s: 20, tone: "rose", a: 0.5, dur: 12500, delay: 4200 },
  { x: 420, y: 1240, dx: -280, dy: 0, s: 16, tone: "gold", a: 0.42, dur: 10500, delay: 800 },
  { x: 900, y: 1720, dx: -380, dy: 12, s: 30, tone: "ivory", a: 0.55, dur: 13000, delay: 1800, floor: true },
  { x: 520, y: 1820, dx: -420, dy: 20, s: 34, tone: "rose", a: 0.5, dur: 14000, delay: 3400, floor: true },
  { x: 1040, y: 1880, dx: -360, dy: 10, s: 28, tone: "gold", a: 0.5, dur: 12000, delay: 5200, floor: true }
];
const FLOOR_SQUASH = 0.42;

/* The tap target: the stage, the arches and the dance floor. The copy ends ~y1060, so
   nothing here covers it. The balls are tappable too (they are role "interactive"). */
const HIT = { x: 40, y: 1160, w: 1000, h: 740 };
/* the affordance on the floor's edge, its pill on the plain centre curtain above it */
const TAP_AT = [540, 1640];
const LABEL_AT = [540, 1500];

/* Two spotlight pools crossing the dance floor (y ~1650-1950). Pools, not cones: a drawn
   beam reads as a grey wedge pasted on watercolour, while light landing on the glossy
   floor is what a guest actually sees of a follow-spot. The nearer pool is bigger. */
const POOLS = [
  { x: 190, y: 1770, dx: 640, w: 420, delay: 0 },
  { x: 890, y: 1865, dx: -620, w: 500, delay: 120 }
];

/* the RSVP slide's sun, on its horizon (design px, read off the rsvp base) */
const SUN = [560, 1285];
const SUN_R = 540; /* the disc box is 2r = 1080: never wider than the frame */

/* ------------------------------------------------------------------- timing */

const BURST_MS = 1500; /* tap -> complete() */
const KICK_MS = 1350; /* the balls' burst swing; settles before complete() */
const SPIN_RATE = 3.5; /* facet light during the burst */
const TRANS_MS = 1700; /* "soiree-golden-hour" */
const BURST_CAP_MS = 4000; /* belt and braces: every burst particle is gone by now */

const RAYS_PER_BALL = [14, 12, 8];
const STRAND_POPS = 18;
const CONFETTI = 56;

/* tones, as gradients' hot cores */
const TONE = {
  rose: "255, 178, 204",
  gold: "255, 214, 128",
  ivory: "255, 246, 232"
};
const CONFETTI_INK = ["#f3d27a", "#e8b85c", "#fff1d6", "#f08aa6", "#ff6d8c", "#d9a441"];

/* -------------------------------------------------------- the transition's light
 *
 * No filter anywhere (kit.js rule 6). The room's dissolve into gold is a flat sheet in
 * the leaving scene; the sun is one bounded radial disc (box == frame width) that grows
 * from scale 0.15 to 1, never above; the beach arrives under a flat peach sheet that
 * clears. Flat sheets are solid-colour layers in both engines: no backing store.
 */
const GOLD_TINT = "#ffd99a";
const GOLD_A = 0.78;
const PEACH_TINT = "#ffe7c8";
const PEACH_A = 0.62;
const FLASH_TINT = "#ffcdb6"; /* the burst's warm room flash */
const FLASH_A = 0.2;

/* ------------------------------------------------------------------ helpers */

const STEPS = 12; /* same sampling the kit uses: 12 segments deviate < 3.5% of A */

function rand(lo, hi) {
  return lo + Math.random() * (hi - lo);
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function r2(n) {
  return Math.round(n * 100) / 100;
}

function node(cls, parent) {
  const n = document.createElement("span");
  n.className = cls;
  n.setAttribute("aria-hidden", "true");
  if (parent) parent.appendChild(n);
  return n;
}

function removeNode(n) {
  if (n && n.parentNode) n.parentNode.removeChild(n);
}

/** Design-px rect of a stage layer, off its own custom properties. */
function layerRect(el) {
  const v = function (k) {
    return parseFloat(el.style.getPropertyValue(k)) || 0;
  };
  return { x: v("--x"), y: v("--y"), w: v("--w"), h: v("--h"), z: parseInt(el.style.getPropertyValue("--z"), 10) || 1 };
}

/** A flat sheet of light, resting invisible. Solid colour only — no gradient, no
 *  children, no border: that is what keeps it a solid-colour layer. */
function makeSheet(parent, cls, tint, z) {
  if (!parent) return null;
  const s = document.createElement("div");
  s.className = cls;
  s.setAttribute("data-fx-sheet", ""); /* the engine's sweep, if a cleanup never ran */
  s.setAttribute("aria-hidden", "true");
  s.style.position = "absolute";
  s.style.inset = "0";
  s.style.zIndex = z;
  s.style.background = tint;
  s.style.opacity = "0";
  s.style.pointerEvents = "none";
  parent.appendChild(s);
  return s;
}

/* One scene instance is ever live. Reset in enter(), which replays on every entry. */
let state = null;

/* Burst particles outlive the scene's ctx by design (see LEAVING), so they are tracked
   at module scope and swept by the next enter() as well as by their own finish. */
const burstNodes = [];
let burstTimer = 0;

function sweepBurst() {
  clearTimeout(burstTimer);
  burstTimer = 0;
  burstNodes.splice(0).forEach(function (n) {
    if (n.getAnimations) {
      n.getAnimations().forEach(function (a) {
        try {
          a.cancel();
        } catch (e) {}
      });
    }
    removeNode(n);
  });
}

/** A one-shot that removes its own node when it lands. Not tied to ctx (see LEAVING). */
function fling(n, frames, opts) {
  burstNodes.push(n);
  const a = n.animate(frames, Object.assign({ fill: "both" }, opts));
  const drop = function () {
    const i = burstNodes.indexOf(n);
    if (i >= 0) burstNodes.splice(i, 1);
    removeNode(n);
  };
  if (a.finished && typeof a.finished.then === "function") a.finished.then(drop, drop);
  else a.onfinish = drop;
  return a;
}

/**
 * An ambient loop. Frame 0 and the last frame are the resting value, so starting,
 * stopping and cancelling are invisible. Registered in state.loops: exit() commits
 * their pose, ctx.signal cancels them.
 */
function ambient(ctx, el, frames, o) {
  if (!el || ctx.reducedMotion || typeof el.animate !== "function") return null;
  const a = el.animate(frames, {
    duration: Math.max(1, o.dur),
    delay: Math.round(o.delay || 0),
    iterations: Infinity,
    easing: o.easing || "linear"
  });
  state.loops.push(a);
  return a;
}

/** 12-sample pendulum, identity at both ends — the kit's pendulum shape. */
function pendulumFrames(d) {
  const f = [];
  for (let i = 0; i <= STEPS; i += 1) {
    const t = i / STEPS;
    f.push({ offset: t, transform: "rotate(" + r2(d * Math.sin(t * 2 * Math.PI)) + "deg)" });
  }
  return f;
}

/* ------------------------------------------------------------------ ambient */

/** The FX twin for one ball: same rect, one z above, never takes input. */
function buildRig(ctx, ballEl, spec) {
  const rect = layerRect(ballEl);
  const rig = document.createElement("div");
  rig.className = "rc-rig";
  rig.setAttribute("aria-hidden", "true");
  rig.style.setProperty("--x", rect.x + "px");
  rig.style.setProperty("--y", rect.y + "px");
  rig.style.setProperty("--w", rect.w + "px");
  rig.style.setProperty("--h", rect.h + "px");
  rig.style.setProperty("--z", String(rect.z + 1));
  rig.style.transformOrigin = spec.pivot;
  ctx.frame.appendChild(rig);

  const r = spec.orb.r * rect.w;
  const cx = spec.orb.cx * rect.w;
  const cy = spec.orb.cy * rect.h;

  /* the sphere itself: everything travelling across the mirror is clipped to it */
  const orb = node("rc-orb", rig);
  orb.style.setProperty("--ox", r2(cx - r) + "px");
  orb.style.setProperty("--oy", r2(cy - r) + "px");
  orb.style.setProperty("--od", r2(2 * r) + "px");

  /* the burst's flash, unclipped, centred on the sphere */
  const glow = node("rc-orb-glow", rig);
  glow.style.setProperty("--gx", r2(cx) + "px");
  glow.style.setProperty("--gy", r2(cy) + "px");
  glow.style.setProperty("--gd", r2(3 * r) + "px");

  return { el: rig, orb: orb, glow: glow, r: r, cx: cx, cy: cy, spin: [] };
}

/** Facets catching the light as the ball turns: each glint runs along one latitude,
 *  slow at the rim and quick across the middle (a projected circle), and flashes once
 *  where it faces the room. */
function startFacets(ctx, rig, count) {
  const r = rig.r;
  const size = Math.max(14, Math.min(32, r * 0.27));
  for (let i = 0; i < count; i += 1) {
    const f = node("rc-facet", rig.orb);
    f.style.setProperty("--fs", r2(size) + "px");
    const u = -0.72 + (1.44 * (i + 0.5)) / count + rand(-0.06, 0.06);
    const y = u * r;
    const c = r * Math.sqrt(1 - u * u) * 0.94;
    const tf = rand(0.36, 0.64);
    const RUN = 0.72; /* the pass takes this much of the cycle; the rest is dark */
    const at = function (t, o, s) {
      return {
        offset: r2(t * RUN * 1000) / 1000,
        opacity: o,
        transform:
          "translate3d(" + r2(-c * Math.cos(Math.PI * t)) + "px," + r2(y) + "px,0) scale(" + s + ")"
      };
    };
    const frames = [
      at(0, 0, 0.7),
      at(0.18, 0.45, 0.8),
      at(tf - 0.07, 0.5, 0.85),
      at(tf, 1, 1.6),
      at(tf + 0.07, 0.5, 0.85),
      at(0.84, 0.38, 0.8),
      at(1, 0, 0.7),
      { offset: 1, opacity: 0, transform: "translate3d(" + r2(c) + "px," + r2(y) + "px,0) scale(0.7)" }
    ];
    const a = ambient(ctx, f, frames, { dur: rand(2600, 3800), delay: rand(0, 2400), easing: "linear" });
    if (a) rig.spin.push(a);
  }

  /* a broad sheen passing across the sphere: the turn, read at a glance */
  const sheen = node("rc-sheen", rig.orb);
  const sa = ambient(
    ctx,
    sheen,
    [
      { offset: 0, opacity: 0, transform: "translate3d(" + r2(-r * 1.1) + "px,0,0) rotate(14deg)" },
      { offset: 0.5, opacity: 0.55, transform: "translate3d(" + r2(r * 0.5) + "px,0,0) rotate(14deg)" },
      { offset: 0.8, opacity: 0, transform: "translate3d(" + r2(r * 1.7) + "px,0,0) rotate(14deg)" },
      { offset: 1, opacity: 0, transform: "translate3d(" + r2(r * 1.7) + "px,0,0) rotate(14deg)" }
    ],
    { dur: rand(5200, 6600), delay: rand(200, 1600), easing: "cubic-bezier(0.45, 0, 0.55, 1)" }
  );
  if (sa) rig.spin.push(sa);
}

/** Star flares: the classic four-point disco glint, fixed on the sphere (so they ride
 *  the swing via the rig), popping now and then. */
function startFlares(ctx, rig, spots) {
  spots.forEach(function (p) {
    const f = makeFlare(rig, rig.cx + p[0] * rig.r, rig.cy + p[1] * rig.r, rig.r * 0.95);
    const a = ambient(
      ctx,
      f,
      [
        { offset: 0, opacity: 0, transform: "scale(0) rotate(0deg)" },
        { offset: 0.1, opacity: 1, transform: "scale(1) rotate(22deg)" },
        { offset: 0.24, opacity: 0, transform: "scale(0.1) rotate(45deg)" },
        { offset: 1, opacity: 0, transform: "scale(0) rotate(0deg)" }
      ],
      { dur: rand(2600, 4000), delay: rand(300, 2400), easing: "cubic-bezier(0.33, 1, 0.68, 1)" }
    );
    if (a) rig.spin.push(a);
  });
}

function makeFlare(rig, x, y, size) {
  const f = node("rc-flare", rig.el);
  f.style.setProperty("--fx", r2(x) + "px");
  f.style.setProperty("--fy", r2(y) + "px");
  f.style.setProperty("--fd", r2(size) + "px");
  return f;
}

function startBalls(ctx) {
  BALLS.forEach(function (spec) {
    const ball = ctx.layer(spec.id);
    if (!ball || ball.classList.contains("is-missing")) return;
    const rig = buildRig(ctx, ball, spec);
    state.rigs.push({ spec: spec, ball: ball, rig: rig });

    /* ball and twin swing as one: identical keyframes, one shared startTime */
    ball.style.transformOrigin = spec.pivot;
    const frames = pendulumFrames(spec.deg);
    const opts = { dur: spec.dur, delay: spec.phase * Math.min(spec.dur, 1800) };
    const a = ambient(ctx, ball, frames, opts);
    const b = ambient(ctx, rig.el, frames, opts);
    if (a && b && document.timeline && document.timeline.currentTime != null) {
      const t0 = document.timeline.currentTime;
      a.startTime = t0;
      b.startTime = t0;
    }

    startFacets(ctx, rig, spec.facets);
    startFlares(ctx, rig, spec.flares);
  });
}

function startBulbs(ctx) {
  BULBS.forEach(function (p) {
    const g = node("rc-bulb", ctx.frame);
    g.style.setProperty("--x", p[0] + "px");
    g.style.setProperty("--y", p[1] + "px");
    state.bulbs.push({ el: g, x: p[0] });
    const peak = r2(rand(0.4, 0.62));
    ambient(
      ctx,
      g,
      [
        { offset: 0, opacity: 0 },
        { offset: 0.5, opacity: peak },
        { offset: 1, opacity: 0 }
      ],
      { dur: rand(3200, 5400), delay: rand(0, 1800), easing: "ease-in-out" }
    );
  });
}

function startSpots(ctx) {
  SPOTS.forEach(function (s) {
    const n = node("rc-spot", ctx.frame);
    n.style.setProperty("--x", s.x + "px");
    n.style.setProperty("--y", s.y + "px");
    n.style.setProperty("--s", s.s + "px");
    n.style.setProperty("--tone", TONE[s.tone]);
    const sq = s.floor ? " scale(1," + FLOOR_SQUASH + ")" : "";
    const at = function (t) {
      return "translate3d(" + r2(s.dx * t) + "px," + r2(s.dy * t) + "px,0)" + sq;
    };
    ambient(
      ctx,
      n,
      [
        { offset: 0, opacity: 0, transform: at(0) },
        { offset: 0.2, opacity: s.a, transform: at(0.2) },
        { offset: 0.8, opacity: s.a, transform: at(0.8) },
        { offset: 1, opacity: 0, transform: at(1) }
      ],
      { dur: s.dur, delay: s.delay }
    );
  });
}

function startAmbient(ctx) {
  const fx = kit.use(ctx);

  fx.sparkleField(ctx.frame, {
    count: 24,
    region: STRANDS,
    sizeRange: [6, 13], /* ~2-4.7 css px on a 390px phone */
    color: "rgba(255, 238, 196, 0.98)",
    dur: 2600,
    z: 9
  });
  fx.sparkleField(ctx.frame, {
    count: 12,
    region: AIR,
    sizeRange: [3, 7],
    color: "rgba(255, 220, 200, 0.9)",
    dur: 4200,
    z: 30
  });

  /* rule 4: no loops — and so no FX nodes that would only ever sit at opacity 0 */
  if (ctx.reducedMotion) return;
  startBulbs(ctx);
  startSpots(ctx);
  startBalls(ctx);

  /* the couple sway in their slow dance, rooted at their feet (added 2026-10-27) */
  fx.sway(ctx.layer("couple"), { deg: 1.1, dur: 4600, origin: "50% 100%" });
}

/* -------------------------------------------------------------- the burst */

/** Reflections thrown out of one ball: each spot swirls outward along an arc, all of
 *  them turning the same way, like the room's light being swept round by the spin. */
function throwRays(ctx, cx, cy, count) {
  const dir = Math.random() < 0.5 ? -1 : 1;
  for (let i = 0; i < count; i += 1) {
    const n = node("rc-ray", ctx.frame);
    const s = rand(22, 46);
    n.style.setProperty("--x", r2(cx) + "px");
    n.style.setProperty("--y", r2(cy) + "px");
    n.style.setProperty("--s", r2(s) + "px");
    n.style.setProperty("--tone", TONE[pick(["rose", "rose", "gold", "gold", "ivory"])]);
    const a0 = rand(0.12, 0.88) * Math.PI; /* the lower half of the circle: walls & floor */
    const sweep = dir * rand(0.35, 0.65);
    const dist = rand(380, 1150);
    const frames = [];
    const N = 5;
    for (let k = 0; k <= N; k += 1) {
      const t = k / N;
      const ang = a0 + sweep * t;
      const d = dist * (1 - Math.pow(1 - t, 2.2));
      frames.push({
        offset: t,
        opacity: k === 0 ? 0 : k === N ? 0 : k === 1 ? 1 : r2(0.95 - 0.1 * k),
        transform:
          "translate3d(" + r2(Math.cos(ang) * d) + "px," + r2(Math.sin(ang) * d) + "px,0) scale(" + r2(0.5 + 0.8 * t) + ")"
      });
    }
    fling(n, frames, { duration: rand(1050, 1450), delay: rand(0, 260), easing: "linear" });
  }
}

/** The globe bulbs come up in a wave from the centre out. A one-shot on the same
 *  `opacity` the breathing loop drives: the newer animation wins while it runs, and the
 *  loop simply takes over again when it ends. */
function raiseLights() {
  state.bulbs.forEach(function (b) {
    b.el.animate(
      [
        { offset: 0, opacity: 0 },
        { offset: 0.3, opacity: 0.95 },
        { offset: 1, opacity: 0 }
      ],
      { duration: 1200, delay: Math.round(Math.abs(b.x - 540) * 0.45), easing: "ease-out" }
    );
  });
}

/** Star glints popping all along the crystal strands. */
function popStrands(ctx) {
  for (let i = 0; i < STRAND_POPS; i += 1) {
    const f = node("rc-flare rc-flare--strand", ctx.frame);
    const d = rand(54, 96);
    f.style.setProperty("--fx", r2(rand(STRANDS.x + 20, STRANDS.x + STRANDS.w - 20)) + "px");
    f.style.setProperty("--fy", r2(rand(STRANDS.y + 40, STRANDS.y + STRANDS.h - 60)) + "px");
    f.style.setProperty("--fd", r2(d) + "px");
    fling(
      f,
      [
        { offset: 0, opacity: 0, transform: "scale(0) rotate(0deg)" },
        { offset: 0.35, opacity: 1, transform: "scale(1) rotate(25deg)" },
        { offset: 1, opacity: 0, transform: "scale(0.1) rotate(60deg)" }
      ],
      { duration: rand(520, 800), delay: rand(0, 1100), easing: "cubic-bezier(0.33, 1, 0.68, 1)" }
    );
  }
}

/** Gold & rose glitter, tumbling down through the whole room. */
function shower(ctx) {
  for (let i = 0; i < CONFETTI; i += 1) {
    const n = node("rc-confetti", ctx.frame);
    const kind = pick(["strip", "strip", "diamond", "dot"]);
    n.classList.add("rc-confetti--" + kind);
    n.style.setProperty("--x", r2(rand(10, 1070)) + "px");
    n.style.setProperty("--y", r2(rand(-280, -60)) + "px");
    n.style.setProperty("--ink", pick(CONFETTI_INK));
    const fall = rand(1950, 2300); /* design px: from above the frame to below it */
    const sway = rand(30, 90) * (Math.random() < 0.5 ? -1 : 1);
    const spin = rand(240, 760) * (Math.random() < 0.5 ? -1 : 1);
    const flips = Math.round(rand(2, 5));
    const frames = [];
    const N = 8;
    for (let k = 0; k <= N; k += 1) {
      const t = k / N;
      frames.push({
        offset: t,
        opacity: k === 0 ? 0 : t > 0.82 ? r2(1 - (t - 0.82) / 0.18) : 1,
        transform:
          "translate3d(" + r2(sway * Math.sin(t * Math.PI * 2)) + "px," + r2(fall * t) + "px,0)" +
          " rotate(" + r2(spin * t) + "deg)" +
          " scale(1," + r2(Math.max(0.15, Math.abs(Math.cos(t * Math.PI * flips)))) + ")"
      });
    }
    fling(n, frames, {
      duration: rand(2100, 2900), /* still drifting down through the dissolve */
      delay: rand(0, 520),
      easing: "cubic-bezier(0.3, 0.1, 0.6, 1)"
    });
  }
}

function sweepPools(ctx) {
  POOLS.forEach(function (p) {
    const n = node("rc-pool", ctx.frame);
    n.style.setProperty("--x", p.x + "px");
    n.style.setProperty("--y", p.y + "px");
    n.style.setProperty("--pw", p.w + "px");
    const at = function (t) {
      return "translate3d(" + r2(p.dx * t) + "px,0,0)";
    };
    fling(
      n,
      [
        { offset: 0, opacity: 0, transform: at(0), easing: "cubic-bezier(0.3, 0, 0.5, 1)" },
        { offset: 0.2, opacity: 1, transform: at(0.16), easing: "cubic-bezier(0.45, 0, 0.55, 1)" },
        { offset: 0.78, opacity: 1, transform: at(0.84), easing: "cubic-bezier(0.5, 0, 0.7, 1)" },
        { offset: 1, opacity: 0, transform: at(1) }
      ],
      { duration: 1400, delay: p.delay }
    );
  });
}

function lightUp(ctx) {
  /* the room flashes warm — a flat sheet over the whole viewport, bleed included */
  const flash = makeSheet(ctx.el, "rc-flash", FLASH_TINT, "2");
  if (flash) {
    fling(
      flash,
      [
        { offset: 0, opacity: 0 },
        { offset: 0.16, opacity: FLASH_A },
        { offset: 0.45, opacity: FLASH_A * 0.35 },
        { offset: 1, opacity: 0 }
      ],
      { duration: 1000, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)" }
    );
  }

  state.rigs.forEach(function (it, i) {
    const spec = it.spec;
    const rig = it.rig;

    /* the kick: `rotate`, so it adds to the running `transform` pendulum. Free-running
       and back at 0deg well before complete(), so the hand-over never sees a pose. */
    const kick = [0, 1, -0.62, 0.36, -0.18, 0.06, 0];
    const offs = [0, 0.14, 0.34, 0.54, 0.72, 0.88, 1];
    const frames = kick.map(function (k, j) {
      return { offset: offs[j], rotate: r2(spec.kick * k) + "deg" };
    });
    [it.ball, rig.el].forEach(function (el) {
      el.animate(frames, { duration: KICK_MS, delay: i * 70, easing: "linear" });
    });

    /* the mirror spins up: same loops, faster */
    rig.spin.forEach(function (a) {
      if (typeof a.updatePlaybackRate === "function") a.updatePlaybackRate(SPIN_RATE);
      else a.playbackRate = SPIN_RATE;
    });

    /* and flashes */
    fling(
      rig.glow,
      [
        { offset: 0, opacity: 0, transform: "scale(0.5)" },
        { offset: 0.2, opacity: 0.95, transform: "scale(1)" },
        { offset: 0.5, opacity: 0.45, transform: "scale(0.9)" },
        { offset: 1, opacity: 0, transform: "scale(0.8)" }
      ],
      { duration: 1100, delay: i * 70, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)" }
    );
    for (let k = 0; k < 3; k += 1) {
      const ang = rand(0, Math.PI * 2);
      const f = makeFlare(rig, rig.cx + Math.cos(ang) * rig.r * 0.6, rig.cy + Math.sin(ang) * rig.r * 0.6, rig.r * 1.3);
      fling(
        f,
        [
          { offset: 0, opacity: 0, transform: "scale(0) rotate(0deg)" },
          { offset: 0.3, opacity: 1, transform: "scale(1) rotate(30deg)" },
          { offset: 1, opacity: 0, transform: "scale(0.2) rotate(70deg)" }
        ],
        { duration: 700, delay: 80 + k * 190 + i * 60, easing: "cubic-bezier(0.33, 1, 0.68, 1)" }
      );
    }

    /* reflections thrown across the room from this ball's centre (design px) */
    const rect = layerRect(it.ball);
    throwRays(ctx, rect.x + rig.cx, rect.y + rig.cy, RAYS_PER_BALL[i] || 6);
  });

  sweepPools(ctx);
  raiseLights();
  popStrands(ctx);
  shower(ctx);

  burstTimer = setTimeout(sweepBurst, BURST_CAP_MS);
}

/* -------------------------------------------------------------- interaction */

function armTap(ctx) {
  const fx = kit.use(ctx);

  /* A real <button> over the stage and the dance floor: the tap target, the keyboard
     route and the accessible name, all one control. Invisible by design — js/fx/kit.js
     draws the only affordance the guest ever sees. */
  const hit = document.createElement("button");
  hit.type = "button";
  hit.className = "rc-hit";
  hit.setAttribute("aria-label", "Tap to light up the night");
  hit.style.setProperty("--x", HIT.x + "px");
  hit.style.setProperty("--y", HIT.y + "px");
  hit.style.setProperty("--w", HIT.w + "px");
  hit.style.setProperty("--h", HIT.h + "px");
  ctx.frame.appendChild(hit);

  const tip = fx.hint({
    designX: TAP_AT[0],
    designY: TAP_AT[1],
    type: "tap",
    labelAt: LABEL_AT
  });

  const onLight = function () {
    if (!state || state.lit || !ctx.isActive()) return;
    state.lit = true;
    hit.disabled = true;
    tip.done();

    const finish = function () {
      if (ctx.isActive()) ctx.complete();
    };

    if (ctx.reducedMotion) {
      finish();
      return;
    }

    lightUp(ctx);
    state.timer = setTimeout(finish, BURST_MS);
  };

  ctx.on(hit, "click", onLight);
  /* the balls themselves answer too (they are role "interactive" in scenes.json) */
  BALLS.forEach(function (spec) {
    const ball = ctx.layer(spec.id);
    if (ball) ctx.on(ball, "click", onLight);
  });

  return function teardown() {
    clearTimeout(state && state.timer);
    removeNode(hit);
  };
}

/* ------------------------------------------ forward: "soiree-golden-hour" */

function crossfade(fromEl, toEl, done) {
  const anims = [];
  if (fromEl) {
    fromEl.style.zIndex = "2";
    anims.push(fromEl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: "forwards" }));
  }
  toEl.style.zIndex = "1";
  anims.push(toEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, fill: "backwards" }));
  const t = setTimeout(done, 400);
  return function () {
    clearTimeout(t);
    anims.forEach(function (a) {
      if (a) a.cancel();
    });
    if (fromEl) fromEl.style.zIndex = "";
    toEl.style.zIndex = "";
  };
}

/**
 * Night into golden hour.
 *
 * The ballroom fills with gold (a flat sheet in the leaving scene) while a low sun
 * swells at the exact point where the RSVP slide's sun sits on its horizon, so when the
 * beach settles out of the light the sun is already where the eye is. The leaving scene
 * also lifts a touch (scale on the .scene, the same move the default bloom makes); the
 * beach arrives from a slight push under a peach sheet that clears.
 *
 * Easing is per keyframe, never on the options: an options easing re-times the WHOLE
 * multi-step curve, which pushed every hand-over beat late.
 *
 * The sun disc lives on the scene, not in the frame, so it sits ABOVE the gold sheet.
 * It is placed in CSS px off the frame's live rect, once — a 1.7s hand-over does not
 * need to survive a resize the way a long dolly does.
 */
kit.defineTransition("soiree-golden-hour", function (fromEl, toEl, done, meta) {
  if (meta.reducedMotion || !fromEl) return crossfade(fromEl, toEl, done);

  const anims = [];
  const nodes = [];

  fromEl.style.zIndex = "2";
  toEl.style.zIndex = "1";

  /* the room goes gold... */
  const gold = makeSheet(fromEl, "rc-gold", GOLD_TINT, "600");
  if (gold) {
    nodes.push(gold);
    anims.push(
      gold.animate(
        [
          { opacity: 0, offset: 0, easing: "cubic-bezier(0.3, 0, 0.6, 1)" },
          { opacity: GOLD_A * 0.6, offset: 0.4, easing: "cubic-bezier(0.4, 0, 0.6, 1)" },
          { opacity: GOLD_A, offset: 1 }
        ],
        { duration: TRANS_MS, fill: "forwards" }
      )
    );
  }

  /* ...and the sun comes up out of it */
  const frame = fromEl.querySelector(".scene__frame");
  if (frame) {
    const fr = frame.getBoundingClientRect();
    const sr = fromEl.getBoundingClientRect();
    const s = fr.width / 1080;
    if (s > 0) {
      const sun = document.createElement("div");
      sun.className = "rc-sun";
      sun.setAttribute("aria-hidden", "true");
      sun.setAttribute("data-fx-sheet", "");
      sun.style.left = r2(fr.left - sr.left + (SUN[0] - SUN_R) * s) + "px";
      sun.style.top = r2(fr.top - sr.top + (SUN[1] - SUN_R) * s) + "px";
      sun.style.width = r2(2 * SUN_R * s) + "px";
      sun.style.height = r2(2 * SUN_R * s) + "px";
      fromEl.appendChild(sun);
      nodes.push(sun);
      anims.push(
        sun.animate(
          [
            { opacity: 0, transform: "scale(0.15)", offset: 0, easing: "cubic-bezier(0.33, 0.8, 0.5, 1)" },
            { opacity: 0.9, transform: "scale(0.6)", offset: 0.45, easing: "cubic-bezier(0.4, 0, 0.4, 1)" },
            { opacity: 1, transform: "scale(1)", offset: 1 }
          ],
          { duration: TRANS_MS, fill: "forwards" }
        )
      );
    }
  }

  anims.push(
    fromEl.animate(
      [
        { opacity: 1, transform: "scale(1)", offset: 0 },
        { opacity: 1, transform: "scale(1.014)", offset: 0.42, easing: "cubic-bezier(0.45, 0, 0.55, 1)" },
        { opacity: 0, transform: "scale(1.035)", offset: 1 }
      ],
      { duration: TRANS_MS, fill: "forwards" }
    )
  );

  /* the beach settles out of the light */
  const peach = makeSheet(toEl, "rc-peach", PEACH_TINT, "600");
  if (peach) {
    nodes.push(peach);
    anims.push(
      peach.animate(
        [
          { opacity: PEACH_A, offset: 0 },
          { opacity: PEACH_A, offset: 0.42, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)" },
          { opacity: 0, offset: 1 }
        ],
        { duration: TRANS_MS, fill: "backwards" }
      )
    );
  }
  anims.push(
    toEl.animate(
      [
        { opacity: 0, transform: "scale(1.04)", offset: 0 },
        { opacity: 1, transform: "scale(1.02)", offset: 0.5, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)" },
        { opacity: 1, transform: "scale(1)", offset: 1 }
      ],
      { duration: TRANS_MS, fill: "backwards" }
    )
  );

  const timer = setTimeout(done, TRANS_MS);

  return function cleanup() {
    clearTimeout(timer);
    anims.forEach(function (a) {
      try {
        a.cancel();
      } catch (e) {}
    });
    nodes.forEach(removeNode);
    fromEl.style.zIndex = "";
    toEl.style.zIndex = "";
  };
});

/* ------------------------------------------------------------------ module */

kit.defineScene("reception", {
  forward: "soiree-golden-hour",

  enter: function (ctx) {
    /* the invitation copy, rebuilt from data/textspec.json on every entry */
    text.mount(ctx);
    sweepBurst();
    /* revisit: nothing a previous visit left may survive — no committed pose, no kick,
       no orphan chrome */
    ctx.layers().forEach(function (el) {
      el.getAnimations().forEach(function (a) {
        try {
          a.cancel();
        } catch (e) {}
      });
      el.style.removeProperty("transform");
      el.style.removeProperty("rotate");
      el.style.removeProperty("opacity");
      el.style.removeProperty("transform-origin");
    });
    ctx.el.querySelectorAll(".rc-rig, .rc-bulb, .rc-spot").forEach(removeNode);
    state = { lit: false, timer: 0, loops: [], rigs: [], bulbs: [] };

    /* rule 3: the loops die with the scene (exit() has already frozen their pose) */
    const own = state;
    ctx.signal.addEventListener(
      "abort",
      function () {
        own.loops.splice(0).forEach(function (a) {
          try {
            a.cancel();
          } catch (e) {}
        });
      },
      { once: true }
    );
  },

  armInteraction: armTap,

  /* the entry cascade owns `transform` until it finishes, so the copy's reveal and the
     ambient loops both start at idle */
  idle: function (ctx) {
    text.reveal(ctx); /* before the ambient guards — the copy always shows */
    if (!state || state.lit) return;
    startAmbient(ctx);
  },

  /* Freeze every ambient loop where it is: the room stays visible for most of the
     hand-over, and a ball snapping back to rest on the frame the dissolve starts would
     read as a glitch. Committed as inline styles; enter() clears them on the next visit,
     and the hidden scene is display:none in the meantime. */
  exit: function () {
    if (!state) return;
    state.loops.forEach(function (a) {
      try {
        a.commitStyles();
      } catch (e) {}
    });
  }
});
