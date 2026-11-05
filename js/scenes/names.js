/* names.js — scene 2 of 7. "The breeze carries the page."
 *
 * ART        base (meadow + sky) + border vines/roses + 14 foliage cutouts
 *            + the two top-corner sprigs.
 * AMBIENT    every plant idling on its own phase, the sprigs swinging on their corner
 *            hinges. The BASE never moves. (The clouds were removed -- see CLOUDS.)
 * SIGNATURE  tap the meadow. One tap IS the wind: the gust sweeps across the foliage
 *            from the right and the page turns. The sweep always travels leftward — that reads as turning the page forward.
 * FORWARD    "names-breeze" — the page is carried off on that same leftward wind.
 *
 * COMPOSITION NOTE
 *   idle sway -> `transform`  (kit loops)
 *   gust bend -> `rotate`     (kit.bendGroup)
 * Two independent properties on the same element, applied about the same origin, so
 * ambient motion and the gust add up instead of cancelling each other out.
 *
 * Owns exactly: this file + css/scenes/names.css.
 *
 * deepesh-bhavna: the same module also drives "compliments" ("Best wishes from", after the
 * Reception) -- same art minus the Ganesha, same tap, same breeze (as krishang-neha).
 */

import * as kit from "../fx/kit.js?v=8";
import * as text from "../fx/text.js?v=5";

/* Per-layer idle + bend spec. `x` is the layer's design-space centre and drives the
   gust phase: the wind arrives from the right, so the RIGHTMOST plants move first.
   Origins are where each plant is rooted — bottom-centre for anything standing in the
   meadow, the border edge for the hanging vines. */
const FLORA = [
  { id: "vine-left",        deg: 1.0, dur: 7200, origin: "88% 0%",   x: 75,   bend: 3.4 },
  { id: "roses-left",       deg: 1.3, dur: 6400, origin: "70% 0%",   x: 18,   bend: 4.0 },
  { id: "vine-right",       deg: 1.0, dur: 7600, origin: "25% 0%",   x: 1005, bend: 3.4 },
  { id: "tree-left",        deg: 0.9, dur: 8200, origin: "62% 100%", x: 53,   bend: 3.2 },
  { id: "bush-left",        deg: 1.4, dur: 5800, origin: "50% 100%", x: 50,   bend: 5.0 },
  { id: "bush-mid-right",   deg: 1.4, dur: 6100, origin: "50% 100%", x: 972,  bend: 5.0 },
  { id: "bush-row-mid",     deg: 0.8, dur: 9000, origin: "50% 100%", x: 540,  bend: 2.6 },
  { id: "bush-row-right",   deg: 0.8, dur: 8600, origin: "40% 100%", x: 900,  bend: 2.6 },
  { id: "bush-front-right", deg: 1.0, dur: 7400, origin: "45% 100%", x: 1000, bend: 3.4 },
  /* "palm" (x 518) removed 2026-09-22: the bride's family lines now sit where it stood
     (tools/apply_overrides.py drops the layer) */
  { id: "tuft-mid",         deg: 1.6, dur: 4600, origin: "50% 100%", x: 533,  bend: 6.0 },
  { id: "yellow-cluster-1", deg: 1.5, dur: 5000, origin: "50% 100%", x: 909,  bend: 5.4 },
  { id: "yellow-cluster-2", deg: 1.5, dur: 5400, origin: "50% 100%", x: -68,  bend: 5.4 },
  { id: "yellow-cluster-3", deg: 1.5, dur: 4800, origin: "50% 100%", x: 92,   bend: 5.4 },
  { id: "yellow-cluster-4", deg: 1.5, dur: 5600, origin: "50% 100%", x: 18,   bend: 5.4 },
  { id: "yellow-cluster-5", deg: 1.5, dur: 5200, origin: "50% 100%", x: 839,  bend: 5.4 }
];

/* EMPTY ON PURPOSE — the clouds are gone from this scene.
 *
 * Our art came from the client's FIRST, art-only PSD set, which drew five line-work
 * clouds across this sky. Their current `Names.psd` has no cloud layer at all, and
 * `Names.jpg` shows clean paper behind the couple's names (measured: stddev ~3.3 in
 * that band). Ours put grey outlines straight through the crimson type, which is what
 * made the names read muddy — the type itself measures at 0.99/1.06 of the client's
 * ink, i.e. correct. Client asked for the clouds to go (2026-09-04).
 *
 * The layers are hidden in css/scenes/names.css rather than deleted from
 * data/scenes.json, because that file is regenerated from the OLD PSDs by
 * tools/extract_muskan.py and would bring them straight back.
 *
 * The drift and scud machinery below is left intact and simply iterates nothing, so
 * restoring the clouds is a matter of putting their entries back here and dropping the
 * one rule in the stylesheet.
 *
 * `par` was the parallax factor for the scud run-out — high thin clouds moved least. */
const CLOUDS = [];

/* the negative amplitude on the right sprig is true antiphase: the two corners lean
   opposite ways, and both still start and finish on the resting frame */
const SPRIGS = [
  { id: "sprig-left", deg: 1.6, dur: 5500, origin: "0% 18%", phase: 0 },
  { id: "sprig-right", deg: -1.6, dur: 6500, origin: "100% 18%", phase: 0.35 }
];

/* The planted lower third — hedgerow, palm, tufts and flower clumps: the ground the
   wind actually moves. The invitation copy ends around y 1110, so this rect never sits
   under a line of type, and a tap on the open sky above it is inert by design. */
const MEADOW = { x: 0, y: 1120, w: 1080, h: 800 };

const CLOUD_DRAG = 16; /* design px of sky travel the run-out below is scaled from */
const SCUD_RATE = 3.4; /* how much faster the clouds run once the gust is loosed */
const HANDOVER_MS = 520; /* gust lead-in before the page actually turns */
const BREEZE_MS = 900;

let state = null;

/* ------------------------------------------------------------------ ambient */

function startAmbient(ctx) {
  const fx = kit.use(ctx);

  /* alternating signs + distinct periods: the sky never moves as one sheet */
  state.clouds.forEach(function (c, i) {
    c.drift = fx.drift(c.el, { dx: i % 2 ? -c.dx : c.dx, dur: c.dur, phase: (i * 0.37) % 1 });
  });

  FLORA.forEach(function (f, i) {
    fx.sway(ctx.layer(f.id), {
      deg: i % 2 ? -f.deg : f.deg,
      dur: f.dur,
      origin: f.origin,
      phase: (i * 0.29) % 1
    });
  });

  SPRIGS.forEach(function (s) {
    fx.sway(ctx.layer(s.id), { deg: s.deg, dur: s.dur, origin: s.origin, phase: s.phase });
  });
}

/** One last push on the sky as the gust leaves. The drift loops are re-timed in place
 *  (so nothing jumps), and the whole sky runs out leftward with the wind, from the
 *  resting frame it has been sitting on — nothing ever offsets the clouds before this.
 *
 *  `fill: "forwards"` on a LAYER would outlive the scene (the engine's unmount sweep
 *  is non-subtree and only cancels animations on the .scene element itself), so every
 *  run-out is parked in state.scud and cancelled by teardown. */
function scudClouds() {
  state.clouds.forEach(function (c) {
    if (c.drift && c.drift.anim) c.drift.anim.playbackRate = SCUD_RATE * c.par;
    if (typeof c.el.animate !== "function") return;
    const to = (-CLOUD_DRAG * SCUD_RATE * 0.5 * c.par).toFixed(2) + "px";
    state.scud.push(
      c.el.animate([{ translate: "0px" }, { translate: to }], {
        duration: HANDOVER_MS + BREEZE_MS,
        easing: "cubic-bezier(0.33, 0.9, 0.5, 1)",
        fill: "forwards"
      })
    );
  });
}

function stopScud() {
  state.scud.splice(0).forEach(function (a) {
    try {
      a.cancel();
    } catch (e) {
      /* an already-finished run-out is nothing to report */
    }
  });
}

/* -------------------------------------------------------------- interaction */

function armTap(ctx) {
  const fx = kit.use(ctx);

  /* phase 0 = the rightmost plant: the gust arrives from the right and travels left */
  const items = FLORA.map(function (f) {
    const el = ctx.layer(f.id);
    return el && {
      el: el,
      maxDeg: f.bend,
      origin: f.origin,
      phase: 1 - Math.min(1, Math.max(0, f.x / 1080))
    };
  }).filter(Boolean);

  const bend = fx.bendGroup(items);

  /* A real <button> so the gesture is reachable by keyboard and announced to AT, and
     so a tap on the sky — where the invitation copy is — stays inert. Covers the whole
     planted band, which is both the thing that moves and the easiest target on screen. */
  const hit = document.createElement("button");
  hit.type = "button";
  hit.className = "nm-hit";
  hit.setAttribute("aria-label", "Tap the meadow to let the breeze turn the page");
  hit.style.setProperty("--x", MEADOW.x + "px");
  hit.style.setProperty("--y", MEADOW.y + "px");
  hit.style.setProperty("--w", MEADOW.w + "px");
  hit.style.setProperty("--h", MEADOW.h + "px");
  ctx.frame.appendChild(hit);

  /* the pill sits ABOVE the mark: below it the meadow's front row of tufts and
     flower clumps starts, and the copy would land on top of them */
  const tip = fx.hint({
    designX: 540,
    designY: 1526, /* 1480 + 46: follows the copy down (2026-09-22) */
    type: "tap",
    labelSide: "above"
  });

  /** One tap, one gust, one page turn. `state.done` and the disabled button are two
   *  independent latches, so a double- or triple-tap can never run this twice. */
  function commit() {
    if (!state || state.done || !ctx.isActive()) return;
    state.done = true;
    hit.disabled = true;
    tip.done();

    if (ctx.reducedMotion) {
      ctx.complete();
      return;
    }
    /* the gust crosses the meadow from the right, the sky scuds after it, then the
       page turns on the same wind */
    bend.wave({ dir: "left", stagger: 26, strength: 1.15 });
    scudClouds();
    state.timer = setTimeout(function () {
      if (ctx.isActive()) ctx.complete();
    }, HANDOVER_MS);
  }

  ctx.on(hit, "click", commit);

  return function teardown() {
    clearTimeout(state.timer);
    stopScud();
    if (hit.parentNode) hit.parentNode.removeChild(hit);
  };
}

/* --------------------------------------------------- forward: "names-breeze" */

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

/** The page is carried off leftward on the gust the tap loosed, and the next one
 *  arrives on the same wind. */
kit.defineTransition("names-breeze", function (fromEl, toEl, done, meta) {
  if (meta.reducedMotion) return crossfade(fromEl, toEl, done);

  /* `n` is the leftward magnitude — the wind only ever blows one way now */
  const shift = function (n) {
    return "translate3d(" + (-n).toFixed(2) + "%,0,0)";
  };

  const anims = [];
  if (fromEl) {
    fromEl.style.zIndex = "2";
    anims.push(
      fromEl.animate(
        [
          { opacity: 1, transform: "translate3d(0,0,0)", offset: 0 },
          { opacity: 0.86, transform: shift(2.2), offset: 0.45 },
          { opacity: 0, transform: shift(7), offset: 1 }
        ],
        { duration: BREEZE_MS, easing: "cubic-bezier(0.55, 0, 0.35, 1)", fill: "forwards" }
      )
    );
  }

  toEl.style.zIndex = "1";
  anims.push(
    toEl.animate(
      [
        { opacity: 0, transform: shift(-4), offset: 0 },
        { opacity: 0.7, offset: 0.5 },
        { opacity: 1, transform: "translate3d(0,0,0)", offset: 1 }
      ],
      { duration: BREEZE_MS, easing: "cubic-bezier(0.16, 0.8, 0.3, 1)", fill: "backwards" }
    )
  );

  const timer = setTimeout(done, BREEZE_MS);

  return function cleanup() {
    clearTimeout(timer);
    anims.forEach(function (a) {
      if (a) a.cancel();
    });
    if (fromEl) fromEl.style.zIndex = "";
    toEl.style.zIndex = "";
  };
});

/* ------------------------------------------------------------------ module */

["names", "compliments"].forEach(function (slug) {
kit.defineScene(slug, {
  forward: "names-breeze",

  enter: function (ctx) {
    /* the invitation copy, rebuilt from data/textspec.json on every entry */
    text.mount(ctx);
    state = { clouds: [], scud: [], done: false, timer: 0 };
    /* revisit: nothing may survive a previous visit's gust */
    FLORA.concat(SPRIGS, CLOUDS).forEach(function (f) {
      const el = ctx.layer(f.id);
      if (!el) return;
      el.style.removeProperty("rotate");
      el.style.removeProperty("translate");
      el.style.removeProperty("transform");
    });
    CLOUDS.forEach(function (c) {
      const el = ctx.layer(c.id);
      if (el) state.clouds.push({ el: el, dx: c.dx, dur: c.dur, par: c.par, drift: null });
    });
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
});
