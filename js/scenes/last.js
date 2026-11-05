/* last.js — finale. "The palace, and all the time in the world."
 *
 * ART        underlay (the whole sky) + base (palace, gardens, terraces) + the fountain,
 *            the two wisteria hangings, the bushes and the flower bands.
 * AMBIENT    the sky drifts so slowly it reads as air, the wisteria rocks on its top
 *            hinges, and the fountain lives: quick white glints over the plume and the
 *            bowl, and the faintest breath of light on the water itself.
 * SIGNATURE  tap the fountain — it splashes, and the page turns to the venue map.
 * FORWARD    the stage's default "bloom", to js/scenes/map.js.
 *
 * Owns exactly: this file + css/scenes/last.css.
 */

import * as kit from "../fx/kit.js?v=8";
import * as text from "../fx/text.js?v=5";

/* ------------------------------------------------------- design-space anchors */
/* the fountain layer is (33,1570) 634x206; these are read off the cutout itself */

const PLUME = { x: 252, y: 1556, w: 180, h: 108 }; /* the jet and the lotus bowl */
const SPLASH = { x: 120, y: 1548, w: 462, h: 200 }; /* + both side pools */
const JET = [338, 1584]; /* where the water leaves the bowl */
const HIT = { x: 0, y: 1530, w: 690, h: 256 };

const SKY_DX = 22;
const SKY_MS = 60000;
const BURST_MS = 1150;
const DROPS = 7;
const BURST_MAX = 3;
const HANDOVER_MS = 650; /* let the splash read before the page turns */

let state = null;

/* ---------------------------------------------------------------- ambient */

const WISTERIA = [
  { id: "wisteria-left", deg: 1.5, dur: 7200, origin: "18% 0%", phase: 0 },
  { id: "wisteria-right", deg: -1.5, dur: 8000, origin: "82% 0%", phase: 0.42 }
];

function driftSky(ctx, fx) {
  const sky = ctx.el.querySelector(".layer--underlay");
  if (!sky) return;
  const slack = (SKY_DX / 540) * 1.15;
  const steps = 16;
  const frames = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const w = Math.sin(t * 2 * Math.PI);
    frames.push({
      offset: t,
      transform:
        "translate3d(" + (SKY_DX * w).toFixed(2) + "px,0,0) scale(" +
        (1 + slack * Math.abs(w)).toFixed(5) + ")"
    });
  }
  fx.play(sky, frames, { duration: SKY_MS, iterations: Infinity, easing: "linear" });
}

function startAmbient(ctx) {
  const fx = kit.use(ctx);

  driftSky(ctx, fx);

  WISTERIA.forEach(function (w) {
    fx.sway(ctx.layer(w.id), { deg: w.deg, dur: w.dur, origin: w.origin, phase: w.phase });
  });

  fx.sparkleField(ctx.frame, {
    count: 16,
    region: PLUME,
    sizeRange: [4, 11],
    color: "rgba(255, 255, 255, 0.95)",
    dur: 1700,
    z: 200
  });

  fx.glowPulse(ctx.layer("fountain"), { from: 0.965, to: 1, brightness: 1.05, dur: 4200, jitter: 0.25 });
}

/* ------------------------------------------------------------------ splash */

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function droplets(ctx, fx) {
  for (let i = 0; i < DROPS; i += 1) {
    const dot = document.createElement("span");
    dot.className = "lt-fx lt-drop";
    dot.style.setProperty("--x", JET[0] + "px");
    dot.style.setProperty("--y", JET[1] + "px");
    dot.style.setProperty("--s", rand(8, 16).toFixed(1) + "px");
    ctx.frame.appendChild(dot);

    const dx = rand(-130, 130);
    const peak = rand(42, 96);
    const drop = rand(70, 130);
    const steps = 8;
    const path = [];
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps;
      const y = -4 * peak * t * (1 - t) + drop * t * t;
      path.push({
        offset: t,
        transform: "translate3d(" + (dx * t).toFixed(1) + "px," + y.toFixed(1) + "px,0) scale(" + (1 - 0.35 * t).toFixed(3) + ")",
        opacity: t < 0.12 ? t / 0.12 : t > 0.72 ? (1 - t) / 0.28 : 1
      });
    }
    fx
      .play(dot, path, {
        duration: Math.round(rand(620, 900)),
        delay: Math.round(rand(0, 130)),
        easing: "linear",
        fill: "backwards"
      })
      .then(function () {
        if (dot.parentNode) dot.parentNode.removeChild(dot);
      });
  }
}

function splash(ctx, fx) {
  if (!state || !ctx.isActive()) return;

  while (state.bursts.length >= BURST_MAX) {
    const old = state.bursts.shift();
    clearTimeout(old.timer);
    old.field.stop();
  }

  const field = fx.sparkleField(ctx.frame, {
    count: 38,
    region: SPLASH,
    sizeRange: [6, 18],
    color: "rgba(255, 255, 255, 0.98)",
    dur: 900,
    z: 210
  });
  const burst = { field: field, timer: 0 };
  burst.timer = setTimeout(function () {
    const i = state ? state.bursts.indexOf(burst) : -1;
    if (i >= 0) state.bursts.splice(i, 1);
    field.stop();
  }, BURST_MS);
  state.bursts.push(burst);

  if (!ctx.reducedMotion) droplets(ctx, fx);
}

/* -------------------------------------------------------------- interaction */

function armFountain(ctx) {
  const fx = kit.use(ctx);

  const tip = fx.hint({
    designX: 345,
    designY: 1640,
    type: "tap",
    labelSide: "above",
  });

  const hit = document.createElement("button");
  hit.type = "button";
  hit.className = "lt-fx lt-splash";
  hit.setAttribute("aria-label", "Splash the fountain and turn to the venue map");
  hit.style.setProperty("--x", HIT.x + "px");
  hit.style.setProperty("--y", HIT.y + "px");
  hit.style.setProperty("--w", HIT.w + "px");
  hit.style.setProperty("--h", HIT.h + "px");
  ctx.frame.appendChild(hit);

  ctx.on(hit, "click", function () {
    if (!state || state.done || !ctx.isActive()) return;
    state.done = true;
    splash(ctx, fx);
    tip.done();
    if (ctx.reducedMotion) {
      ctx.complete();
      return;
    }
    state.timer = setTimeout(function () {
      if (ctx.isActive()) ctx.complete();
    }, HANDOVER_MS);
  });

  return function teardown() {
    clearTimeout(state && state.timer);
    state.bursts.splice(0).forEach(function (b) {
      clearTimeout(b.timer);
      b.field.stop();
    });
    tip.destroy();
    ctx.el.querySelectorAll(".lt-fx").forEach(function (n) {
      n.parentNode.removeChild(n);
    });
    ctx.frame.querySelectorAll(".lt-fx").forEach(function (n) {
      n.parentNode.removeChild(n);
    });
  };
}

/* ------------------------------------------------------------------ module */

kit.defineScene("last", {
  enter: function (ctx) {
    text.mount(ctx);
    state = { bursts: [], done: false, timer: 0 };
    ctx.el.querySelectorAll(".lt-fx").forEach(function (n) {
      n.parentNode.removeChild(n);
    });
    const sky = ctx.el.querySelector(".layer--underlay");
    if (sky) sky.style.removeProperty("transform");
  },

  armInteraction: armFountain,

  idle: function (ctx) {
    text.reveal(ctx);
    if (!state) return;
    startAmbient(ctx);
  }
});
