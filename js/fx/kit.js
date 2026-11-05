/* kit.js — the ONE shared motion kit for muskan-shourya scenes.
 *
 * Every scene module imports THIS file and nothing else shared. A scene owns exactly
 * two files: js/scenes/<slug>.js + css/scenes/<slug>.css. No scene ever edits the
 * engine (js/stage.js, js/nav.js), js/main.js, css/base.css, css/stage.css or data/*.
 *
 * ---------------------------------------------------------------------------
 * REGISTRATION (why it lives here)
 *
 * js/stage.js is a factory: scene modules cannot import the live instance. So they
 * queue through kit and the queue is flushed the moment boot dispatches `stage:ready`:
 *
 *   import * as kit from "../fx/kit.js";
 *   kit.defineTransition("my-driver", fn);            // optional
 *   kit.defineScene("slug", { forward: "my-driver", enter, armInteraction, idle, exit });
 *
 * ---------------------------------------------------------------------------
 * MOTION CONTRACT — every primitive below obeys all six:
 *
 *   1. transform / opacity / filter ONLY. Never width/height/top/left/margin.
 *   2. RESTING FRAME IS SACRED. Every loop is one full cycle that STARTS and ENDS on
 *      the PSD frame, so starting and stopping ambient motion are both invisible, and
 *      stopping restores the artwork exactly (inline value cleared, WAAPI animation
 *      cancelled — never left holding a `fill`).
 *      `phase` (0..1) therefore staggers a loop's START, spent sitting on the resting
 *      frame; it does NOT seek the clock. Antiphase = a NEGATIVE amplitude.
 *   3. ctx.signal drives cleanup. Pass `ctx` (via `kit.use(ctx)` or `opts.ctx`) and the
 *      loop dies with the scene. Anything not tied to a ctx must be stopped by hand.
 *   4. ctx.reducedMotion => no loops. Primitives no-op (ambient) or degrade to a single
 *      static frame (hint). Interactions keep working; only the motion goes away.
 *   5. will-change is set only while an imperative scrub is in flight (bendGroup.set —
 *      a `set()` driven by a pointer, with no animation for the compositor to read
 *      ahead) and removed on release. WAAPI transform/opacity loops are promoted by the
 *      compositor on their own; adding will-change there would just pin layers.
 *      NOTHING SCENE-SIZED EVER CARRIES ONE. A phone kills the tab over a handful of
 *      pinned full-screen surfaces, and a pinned surface is exactly what will-change
 *      asks for. The largest node this kit may promote is a single artwork cutout.
 *   6. NO `filter` ON A SCENE-SIZED NODE. transform/opacity are compositor properties:
 *      they re-use the texture that is already there. `filter` is not — it makes the
 *      engine re-render the node's whole subtree into a fresh offscreen buffer, at
 *      device resolution, every frame, for as long as it runs. Two scenes are live
 *      during a transition, so an animated brightness() on "the scene" is two of them.
 *      A flat sheet of colour over the scene does the same job for nothing: a childless
 *      box with one flat background is turned into a SOLID-COLOUR layer by both engines
 *      (cc::SolidColorLayer / GraphicsLayer::setContentsToSolidColor) — the compositor
 *      stores the colour, not a bitmap. Bake the light the filter used to add into that
 *      sheet's alpha, or into the gradient stops of the one node carrying the flood.
 *      `filter` stays legal on artwork-cutout-sized layers (glowPulse) and on the kit's
 *      own small chrome.
 *
 * ---------------------------------------------------------------------------
 * API
 *
 *   use(ctx)                       -> every primitive below, pre-bound to ctx
 *
 *   sway(el, {deg, dur, origin, phase})          rotate, alternate loop
 *   bob(el, {px, dur, phase})                    translateY, alternate loop
 *   drift(el, {dx, dur, phase, easing})          translateX, alternate loop
 *   breathe(el, {scale, dur, phase})             scale, alternate loop (never < 1)
 *   pendulum(el, {deg, dur, phase})              rotate about top-centre (hanging things)
 *   glowPulse(el, {from, to, dur, jitter, phase, brightness})   opacity / filter shimmer
 *   sparkleField(container, {count, region, sizeRange, color, dur})  soft dot twinkles
 *        -> all of the above return { stop() }
 *
 *   bendGroup(items)               items: [{el, maxDeg, origin, phase}]
 *        -> { set(p /* -1..1 *\/), release(), wave({dir, stagger}), stop() }
 *
 *   frameZoom(ctxOrEl, {scale, originDesign:[x,y], dur, easing})
 *        -> { finished: Promise, cancel() }   composes ON TOP of the layout matrix
 *        transform only, no will-change — for the bloom that used to ride along on
 *        it, put a flat sheet over the scene (rule 6)
 *
 *   hint(ctx, {designX, designY, type, label, labelKey, labelSide, labelAt})
 *        type: tap | swipe-left | press-hold | rub
 *        copy: data/template.json `hints`, keyed by scene slug (see hint() below)
 *        -> { show(), hide(), done(), destroy(), linger(ms) }
 *
 * Shapes drawn by this kit are geometric light only — rings, dots, trails, and one
 * microcopy pill set in the system serif. It never draws representational artwork and
 * never ships a font file; both come from the PSD side of the template.
 */

/* ------------------------------------------------------------------ plumbing */

const sceneQueue = [];
const transitionQueue = [];
let liveStage = null;

/** Queue a scene module. Flushed against the live stage on `stage:ready`. */
export function defineScene(slug, mod) {
  if (liveStage) {
    liveStage.register(slug, mod);
  } else {
    sceneQueue.push([slug, mod]);
  }
  return mod;
}

/** Queue a named transition driver. Always flushed BEFORE any scene registration,
 *  so a scene's `forward: "<name>"` can never resolve to a missing driver. */
export function defineTransition(name, fn) {
  if (liveStage) {
    liveStage.registerTransition(name, fn);
  } else {
    transitionQueue.push([name, fn]);
  }
  return fn;
}

function flush(stage) {
  if (!stage || liveStage) return;
  liveStage = stage;
  transitionQueue.splice(0).forEach(function (t) {
    stage.registerTransition(t[0], t[1]);
  });
  sceneQueue.splice(0).forEach(function (s) {
    stage.register(s[0], s[1]);
  });
}

if (typeof document !== "undefined") {
  if (typeof window !== "undefined" && window.MS && window.MS.stage) {
    flush(window.MS.stage);
  } else {
    document.addEventListener(
      "stage:ready",
      function (e) {
        flush(e && e.detail ? e.detail.stage : null);
      },
      { once: true }
    );
  }
}

/* ------------------------------------------------------------------ helpers */

const reduceQuery =
  typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;

function reduced(ctx) {
  if (ctx && typeof ctx.reducedMotion === "boolean") return ctx.reducedMotion;
  return !!(reduceQuery && reduceQuery.matches);
}

const NOOP_HANDLE = { stop: function () {}, anim: null };

/** Run `stop` once, and hook it to ctx.signal so the scene's exit kills it. */
function tie(ctx, stop) {
  let done = false;
  const once = function () {
    if (done) return;
    done = true;
    try {
      stop();
    } catch (e) {
      /* a stopped animation must never take the scene down with it */
    }
  };
  if (ctx && ctx.signal) {
    if (ctx.signal.aborted) {
      once();
    } else {
      ctx.signal.addEventListener("abort", once, { once: true });
    }
  }
  return { stop: once };
}

const STEPS = 12; /* sine samples per cycle; 12 linear segments deviate < 3.5% of A */
const PHASE_WINDOW = 1800; /* ms — the most a `phase` of 1 may stagger a loop's start */

/**
 * The one place a looping animation is created.
 *
 * EVERY loop is ONE FULL CYCLE that starts and ends at the resting frame. That is not
 * a stylistic choice: an `alternate` loop starts at its own negative extreme, so a
 * plant would visibly POP off the PSD frame the instant ambient motion begins, and
 * again when it stops. Sampling a sine over a full cycle means identity is both the
 * first and the last keyframe, so starting, stopping and cancelling are all invisible.
 *
 * `phase` staggers the START (a real delay, spent sitting on the resting frame) rather
 * than seeking the clock — seeking would reintroduce exactly the pop described above.
 * Antiphase is expressed by a NEGATIVE amplitude, not by phase 0.5.
 *
 * @param {(t:number)=>object} sample t in 0..1 -> a keyframe object; sample(0) MUST be
 *        the element's resting value.
 */
function loop(el, ctx, sample, opts) {
  if (!el || typeof el.animate !== "function") return NOOP_HANDLE;
  if (reduced(ctx)) return NOOP_HANDLE; /* rule 4: no ambient loops */

  const dur = Math.max(1, opts.dur || 4000);
  const frames = [];
  for (let i = 0; i <= STEPS; i += 1) {
    frames.push(Object.assign({ offset: i / STEPS }, sample(i / STEPS)));
  }

  const anim = el.animate(frames, {
    duration: dur,
    iterations: Infinity,
    easing: opts.easing || "linear", /* the shape is IN the samples */
    delay: Math.round(clamp(opts.phase || 0, 0, 1) * Math.min(dur, PHASE_WINDOW))
  });
  if (opts.origin) el.style.transformOrigin = opts.origin;

  const handle = tie(ctx, function () {
    anim.cancel(); /* rule 2 — back to the PSD frame exactly */
    if (opts.origin) el.style.removeProperty("transform-origin");
  });
  /* the live Animation, for the rare scene that wants to re-time a loop in place
     (e.g. `h.anim.playbackRate = 3` to make clouds scud) — null under reduced motion */
  handle.anim = anim;
  return handle;
}

/** sin wave through zero: 0 at t=0 and t=1, +A at t=.25, -A at t=.75 */
function wave(t) {
  return Math.sin(t * 2 * Math.PI);
}

/** raised cosine: 0 at t=0 and t=1, 1 at t=.5 — for values that must never overshoot
 *  their resting side (scale, opacity, brightness) */
function swell(t) {
  return (1 - Math.cos(t * 2 * Math.PI)) / 2;
}

function px(n) {
  return (Math.round(n * 1000) / 1000) + "px";
}

function deg(n) {
  return (Math.round(n * 1000) / 1000) + "deg";
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/* ---------------------------------------------------------------- primitives */

/** Gentle rotate, e.g. a sprig hinged on the frame edge it grows from.
 *  A negative `deg` is the antiphase twin — use it, not phase 0.5. */
export function sway(el, o) {
  o = o || {};
  const d = o.deg == null ? 1.4 : o.deg;
  return loop(
    el,
    o.ctx,
    function (t) {
      return { transform: "rotate(" + deg(d * wave(t)) + ")" };
    },
    { dur: o.dur || 5500, phase: o.phase, origin: o.origin || "50% 100%", easing: o.easing }
  );
}

/** Vertical breathing float — a figure shifting weight, a lantern riding the air.
 *  Positive `px` rises first. */
export function bob(el, o) {
  o = o || {};
  const p = o.px == null ? 3 : o.px;
  return loop(
    el,
    o.ctx,
    function (t) {
      return { transform: "translate3d(0," + px(-p * wave(t)) + ",0)" };
    },
    { dur: o.dur || 3600, phase: o.phase, origin: o.origin, easing: o.easing }
  );
}

/** Lateral drift — clouds. Positive `dx` sets off to the right. */
export function drift(el, o) {
  o = o || {};
  const d = o.dx == null ? 30 : o.dx;
  return loop(
    el,
    o.ctx,
    function (t) {
      return { transform: "translate3d(" + px(d * wave(t)) + ",0,0)" };
    },
    { dur: o.dur || 24000, phase: o.phase, origin: o.origin, easing: o.easing }
  );
}

/** Slow swell. Never dips below 1 — a shrinking backdrop would expose its own edge. */
export function breathe(el, o) {
  o = o || {};
  const s = o.scale == null ? 1.03 : o.scale;
  return loop(
    el,
    o.ctx,
    function (t) {
      return { transform: "scale(" + (1 + (s - 1) * swell(t)).toFixed(5) + ")" };
    },
    { dur: o.dur || 45000, phase: o.phase, origin: o.origin || "50% 50%", easing: o.easing }
  );
}

/** Rotate about top-centre: chandeliers, hanging lamps, garlands, danglers. */
export function pendulum(el, o) {
  o = o || {};
  const d = o.deg == null ? 1.8 : o.deg;
  return loop(
    el,
    o.ctx,
    function (t) {
      return { transform: "rotate(" + deg(d * wave(t)) + ")" };
    },
    { dur: o.dur || 4200, phase: o.phase, origin: o.origin || "50% 0%", easing: o.easing }
  );
}

/**
 * Opacity (and optional brightness) shimmer for light sources — string lights,
 * windows, candles.
 *
 * `to` is the RESTING value (the lit PSD frame, default 1) and `from` is the dip, so
 * the loop leaves and returns to the artwork as authored. `jitter` (0..1) randomises
 * the period, so a row of lamps never pulses in lockstep.
 */
export function glowPulse(el, o) {
  o = o || {};
  const from = o.from == null ? 0.55 : o.from;
  const to = o.to == null ? 1 : o.to;
  const bright = o.brightness;
  const base = o.dur || 2600;
  const j = o.jitter == null ? 0.35 : o.jitter;
  const dur = base * (1 + (Math.random() * 2 - 1) * j);
  return loop(
    el,
    o.ctx,
    function (t) {
      const k = swell(t);
      const kf = { opacity: (to + (from - to) * k).toFixed(4) };
      if (bright) kf.filter = "brightness(" + (1 + (bright - 1) * k).toFixed(4) + ")";
      return kf;
    },
    { dur: dur, phase: o.phase, easing: o.easing }
  );
}

/**
 * A field of soft twinkling dots — stars, glints on water, fireflies, gold dust.
 * GEOMETRIC LIGHT ONLY: dots and their glow, never a drawn shape.
 *
 * region is in DESIGN px {x, y, w, h}; the field is appended to `container`
 * (normally ctx.frame, whose local coordinates are design px).
 */
export function sparkleField(container, o) {
  o = o || {};
  if (!container) return NOOP_HANDLE;
  const ctx = o.ctx;

  const region = o.region || { x: 0, y: 0, w: 1080, h: 1920 };
  const count = Math.max(0, Math.min(120, o.count == null ? 24 : o.count));
  const size = o.sizeRange || [4, 10];
  const color = o.color || "rgba(255, 247, 226, 0.95)";
  const dur = o.dur || 2800;

  const field = document.createElement("div");
  field.className = "fx-sparkles";
  field.style.setProperty("--fx-x", px(region.x));
  field.style.setProperty("--fx-y", px(region.y));
  field.style.setProperty("--fx-w", px(region.w));
  field.style.setProperty("--fx-h", px(region.h));
  if (o.z != null) field.style.setProperty("--fx-z", String(o.z));

  const still = reduced(ctx);
  for (let i = 0; i < count; i += 1) {
    const dot = document.createElement("span");
    dot.className = "fx-sparkles__dot";
    const s = size[0] + Math.random() * Math.max(0, size[1] - size[0]);
    dot.style.setProperty("--fx-dx", (Math.random() * 100).toFixed(2) + "%");
    dot.style.setProperty("--fx-dy", (Math.random() * 100).toFixed(2) + "%");
    dot.style.setProperty("--fx-size", px(s));
    dot.style.setProperty("--fx-color", color);
    if (!still) {
      dot.style.setProperty("--fx-dur", Math.round(dur * (0.6 + Math.random() * 0.8)) + "ms");
      dot.style.setProperty("--fx-delay", "-" + Math.round(Math.random() * dur * 2) + "ms");
    }
    field.appendChild(dot);
  }
  if (still) field.classList.add("is-still"); /* rule 4: a single static frame */
  container.appendChild(field);

  return tie(ctx, function () {
    if (field.parentNode) field.parentNode.removeChild(field);
  });
}

/* --------------------------------------------------------------- bendGroup */

const BEND_LAG = 0.4; /* how much of the drag a trailing item waits out */

/**
 * Wind-bending foliage.
 *
 * items: [{ el, maxDeg, origin, phase }]
 *   phase 0..1 — normally the item's x across the scene, so the bend travels as a gust
 *   rather than snapping the whole meadow at once.
 *
 * Controller
 *   set(p)                p in -1..1, pointer-driven, imperative (no WAAPI in the hot path)
 *   release()             elastic settle back to the exact resting frame
 *   wave({dir, stagger})  a left/right sweep that bends and settles on its own
 *   stop()                hard reset
 *
 * WHY THE `rotate` PROPERTY, NOT `transform`
 * A WAAPI animation on `transform` always beats an inline `style.transform`, so a bend
 * written into `transform` would be invisible under a running idle sway. The independent
 * `rotate` property is applied BEFORE `transform` in the used value, about the same
 * transform-origin — so a bend and a transform-based sway on the same element simply add
 * up. Idle motion and the drag never fight, and clearing `rotate` restores the PSD frame.
 */
export function bendGroup(items, o) {
  o = o || {};
  const ctx = o.ctx;
  const soft = reduced(ctx) ? 0 : 1; /* rule 4: the gesture still works, the bend doesn't */
  const list = (items || []).filter(function (it) {
    return it && it.el;
  });

  let held = false;
  let stopped = false;
  const running = [];

  /* transform-origin and will-change are claimed ONLY while the bend is actually
     driving an element, and the previous inline origin is restored on release — an
     idle sway loop on the same element owns that property the rest of the time, and a
     stray non-default transform-origin measurably shifts how a scaled layer rasterises
     (a few edge pixels), which would break the pixel-identical resting frame. */
  function hold() {
    if (held) return;
    held = true;
    list.forEach(function (it) {
      it.prevOrigin = it.el.style.transformOrigin;
      it.el.style.transformOrigin = it.origin || "50% 100%";
      it.el.style.willChange = "transform, rotate"; /* rule 5: only while scrubbing */
    });
  }

  function releaseHold() {
    if (!held) return;
    held = false;
    list.forEach(function (it) {
      if (it.prevOrigin) it.el.style.transformOrigin = it.prevOrigin;
      else it.el.style.removeProperty("transform-origin");
      it.el.style.removeProperty("will-change");
    });
  }

  function cancelRunning() {
    running.splice(0).forEach(function (a) {
      try {
        a.cancel();
      } catch (e) {}
    });
  }

  /** Per-item bend for a global progress, with the trailing-gust lag folded in. */
  function angleFor(it, p) {
    const mag = Math.abs(p);
    const lag = clamp(it.phase == null ? 0 : it.phase, 0, 1) * BEND_LAG;
    const local = clamp((mag - lag) / Math.max(0.0001, 1 - lag), 0, 1);
    return (p < 0 ? -1 : 1) * local * (it.maxDeg == null ? 4 : it.maxDeg) * soft;
  }

  function set(p) {
    if (stopped) return;
    cancelRunning();
    hold();
    const prog = clamp(p, -1, 1);
    list.forEach(function (it) {
      it.el.style.rotate = deg(angleFor(it, prog));
    });
  }

  /** Damped settle from wherever each item currently sits, ending at exact identity. */
  function settle(it, fromDeg, delay, amp) {
    const el = it.el;
    if (!fromDeg || typeof el.animate !== "function" || reduced(ctx)) {
      el.style.removeProperty("rotate");
      return null;
    }
    const over = -fromDeg * (amp == null ? 0.34 : amp);
    const anim = el.animate(
      [
        { rotate: deg(fromDeg), offset: 0 },
        { rotate: deg(over), offset: 0.42 },
        { rotate: deg(-over * 0.34), offset: 0.72 },
        { rotate: "0deg", offset: 1 }
      ],
      {
        duration: 620 + Math.round((it.phase || 0) * 120),
        delay: delay || 0,
        easing: "cubic-bezier(0.33, 1, 0.68, 1)",
        fill: "forwards"
      }
    );
    watch(el, anim);
    return anim;
  }

  /** finish -> clear the inline value, then drop the animation, in ONE task, so the
   *  element is never painted holding a stale rotation and getAnimations() empties. */
  function watch(el, anim) {
    const clear = function () {
      el.style.removeProperty("rotate");
      try {
        anim.cancel();
      } catch (e) {}
      const i = running.indexOf(anim);
      if (i >= 0) running.splice(i, 1);
      if (!running.length) releaseHold();
    };
    if (anim.finished && typeof anim.finished.then === "function") {
      anim.finished.then(clear, function () {});
    } else {
      anim.onfinish = clear;
    }
    running.push(anim);
  }

  function currentDeg(el) {
    const r = el.style.rotate;
    const m = r && /(-?[\d.]+)deg/.exec(r);
    return m ? parseFloat(m[1]) : 0;
  }

  function release() {
    if (stopped) return;
    cancelRunning();
    list.forEach(function (it) {
      settle(it, currentDeg(it.el), 0);
    });
    if (!running.length) releaseHold();
  }

  /** A gust that crosses the scene on its own: bend in, settle out, staggered by phase.
   *  `stagger` is per-item ms; the sweep spans phase 0 -> 1 in stagger*(n-1) ms. */
  function wave(opts) {
    if (stopped) return;
    opts = opts || {};
    const dir = opts.dir === "right" ? 1 : -1;
    const stagger = opts.stagger == null ? 26 : opts.stagger;
    const spread = Math.min(900, stagger * Math.max(0, list.length - 1));
    const strength = opts.strength == null ? 1 : opts.strength;
    if (reduced(ctx)) return;
    cancelRunning();
    hold();
    list.forEach(function (it, i) {
      const el = it.el;
      const from = currentDeg(el);
      const peak = dir * (it.maxDeg == null ? 4 : it.maxDeg) * strength * soft;
      const p = it.phase == null ? i / Math.max(1, list.length - 1) : it.phase;
      const delay = Math.round(clamp(p, 0, 1) * spread);
      const anim = el.animate(
        [
          { rotate: deg(from), offset: 0 },
          { rotate: deg(peak), offset: 0.28 },
          { rotate: deg(-peak * 0.3), offset: 0.62 },
          { rotate: deg(peak * 0.1), offset: 0.84 },
          { rotate: "0deg", offset: 1 }
        ],
        {
          duration: 900,
          delay: delay,
          easing: "cubic-bezier(0.33, 1, 0.68, 1)",
          fill: "forwards"
        }
      );
      watch(el, anim);
    });
  }

  const handle = tie(ctx, function () {
    stopped = true;
    cancelRunning();
    releaseHold(); /* restores whatever transform-origin was there before the bend */
    list.forEach(function (it) {
      it.el.style.removeProperty("rotate");
    });
  });

  return {
    items: list,
    set: set,
    release: release,
    wave: wave,
    stop: handle.stop
  };
}

/* --------------------------------------------------------------- frameZoom */

const LAYOUT_TRANSFORM_RE = /translate3d\([^)]*\)\s*scale\([^)]*\)/;

function resolveFrame(target) {
  if (!target) return null;
  if (target.frame) return target.frame; /* a scene ctx */
  if (target.nodeType === 1) {
    return target.classList.contains("scene__frame")
      ? target
      : target.querySelector(".scene__frame");
  }
  return null;
}

/** The frame's live layout matrix, read from its own custom properties. */
function layoutTransform(frame) {
  const cs = getComputedStyle(frame);
  const fx = cs.getPropertyValue("--fx").trim() || "0px";
  const fy = cs.getPropertyValue("--fy").trim() || "0px";
  const fs = cs.getPropertyValue("--fs").trim() || "1";
  return "translate3d(" + fx + ", " + fy + ", 0) scale(" + fs + ")";
}

/**
 * Dolly / push-in on a scene's frame, composed ON TOP of the engine's layout matrix.
 *
 * The frame's transform-origin is 0 0 and its local coordinates ARE design px, so
 * zooming about a design point is just `translate(p) scale(s) translate(-p)` appended
 * after the layout matrix — the layout is preserved exactly and restored on cancel.
 * This is the ONLY sanctioned way to touch .scene__frame's transform.
 *
 * Survives relayout: on a stage `layout` event the animation is rebuilt from the new
 * matrix and re-seeked to the same currentTime.
 *
 * TRANSFORM ONLY — and no `will-change`.
 *   This used to animate `filter: brightness() blur()` on the frame as well, and to
 *   claim `will-change: transform, filter` for the length of the dolly. Both are the
 *   most expensive thing a phone can be asked to do to a node this size. A filter makes
 *   the engine render the frame's ENTIRE subtree into an offscreen buffer, sized to the
 *   frame's RENDERED bounds, every frame it runs — and this is a dolly, so those bounds
 *   are growing: the cocktail dive reaches scale 2.1, which is 4.4x the area of the
 *   frame at rest (measured: a 9.28MB surface becomes a 40.94MB one). `blur()` needs a
 *   second buffer on top of that. The `will-change` then pins the whole thing.
 *   A dolly needs none of it: a transform-only animation is handed to the compositor,
 *   which scales the texture it already has. Callers that want the frame to bloom put a
 *   flat sheet of light over the scene instead — a solid colour is a solid-colour layer
 *   in both engines, so it costs no backing store at all (see cover.js / cocktail.js).
 *
 * @param {object|Element} ctxOrEl a scene ctx, a .scene element, or the frame itself
 */
export function frameZoom(ctxOrEl, o) {
  o = o || {};
  const frame = resolveFrame(ctxOrEl);
  const ctx = ctxOrEl && ctxOrEl.frame ? ctxOrEl : null;
  if (!frame || typeof frame.animate !== "function") {
    return { finished: Promise.resolve(), cancel: function () {} };
  }

  const scale = o.scale == null ? 1.12 : o.scale;
  const origin = o.originDesign || [540, 960];
  const duration = Math.max(1, o.dur || 900);
  const easing = o.easing || "cubic-bezier(0.42, 0, 0.28, 1)";

  if (reduced(ctx) || scale === 1) {
    return { finished: Promise.resolve(), cancel: function () {} };
  }

  const ox = origin[0];
  const oy = origin[1];

  function frames() {
    const base = layoutTransform(frame);
    const at = function (s) {
      return base + " translate(" + px(ox) + "," + px(oy) + ") scale(" + s + ") translate(" + px(-ox) + "," + px(-oy) + ")";
    };
    return [
      { transform: at(1), offset: 0 },
      { transform: at(1 + (scale - 1) * 0.62), offset: 0.6 },
      { transform: at(scale), offset: 1 }
    ];
  }

  let anim = frame.animate(frames(), { duration: duration, easing: easing, fill: "forwards" });
  let offLayout = null;
  let cancelled = false;

  /* A resize mid-dolly changes --fx/--fy/--fs; the baked keyframes would snap the frame
     back to the old fit. Rebuild and re-seek instead. Transition drivers get no ctx, so
     fall back to the stage kit already holds. */
  const stage = (ctx && ctx.stage) || liveStage;
  if (stage && typeof stage.on === "function") {
    offLayout = stage.on("layout", function () {
      if (cancelled || !anim) return;
      const t = anim.currentTime || 0;
      try {
        anim.cancel();
      } catch (e) {}
      anim = frame.animate(frames(), { duration: duration, easing: easing, fill: "forwards" });
      try {
        anim.currentTime = t;
      } catch (e) {}
    });
  }

  const cancel = function () {
    if (cancelled) return;
    cancelled = true;
    if (offLayout) offLayout();
    if (anim) {
      try {
        anim.cancel(); /* rule 2 — the layout matrix comes straight back */
      } catch (e) {}
    }
    /* Belt and braces: this function no longer sets will-change, but a build that did
       may have left one baked on the frame of a scene the guest is revisiting. */
    frame.style.removeProperty("will-change");
  };

  if (ctx && ctx.signal) {
    if (ctx.signal.aborted) cancel();
    else ctx.signal.addEventListener("abort", cancel, { once: true });
  }

  /* A relayout rebuild replaces `anim`, so its `finished` promise is not a reliable
     clock. A plain timer is — and it can never wedge a caller that awaits it. */
  const finished = new Promise(function (res) {
    const t = setTimeout(res, duration + 20);
    if (ctx && ctx.signal) {
      ctx.signal.addEventListener("abort", function () {
        clearTimeout(t);
        res();
      }, { once: true });
    }
  });

  return { finished: finished, cancel: cancel };
}

/* -------------------------------------------------------------------- hint */

/* ---- hint timing ----------------------------------------------------------
 *
 * A hint is chrome that TELLS THE GUEST WHAT TO DO. The only thing that may ever end
 * one is the scene's interaction actually completing (done(), from ctx.complete()).
 * A pointerdown is not a completion — it is just a finger in the way — so all it does
 * is DUCK the mark to --fx-hint-duck for as long as that finger is down.
 *
 *   down + HINT_DUCK_MS resting     -> duck   (a flick shorter than this never ducks,
 *                                              so a stray tap leaves the hint alone)
 *   last pointer up + HINT_RESTORE_MS (+ linger) -> restore, over --dur-md
 *   HINT_IDLE_MS with a pointer stuck down       -> restore anyway (backstop only)
 */
const HINT_APPEAR_MS = 1200; /* let the scene land before asking for anything */
const HINT_DUCK_MS = 150; /* a finger must REST this long before the mark steps back */
const HINT_RESTORE_MS = 90; /* ...and the mark waits this long after the last one lifts */
const HINT_LINGER_MAX = 900; /* the most a scene may add to that — see linger() */
const HINT_IDLE_MS = 6000; /* BACKSTOP ONLY: a duck whose pointerup never arrived */
const HINT_OUT_MS = 260; /* done(): the fade-out before the node goes */
const HINT_TYPES = { tap: 1, "swipe-left": 1, "press-hold": 1, rub: 1 };

function clock() {
  return typeof performance !== "undefined" && performance.now
    ? performance.now()
    : Date.now();
}

const FRAME_W = 1080;
const FRAME_H = 1920;

/* The marks each gesture is drawn from. `plate` is always first, so it paints under
   everything else; --fx-i is numbered PER CLASS, so a stagger reads the same whether
   or not a type also carries a plate or an orbit path. */
const HINT_PARTS = {
  tap: ["plate", "ring", "ring", "core"],
  "press-hold": ["plate", "ring", "ring", "core"],
  "swipe-left": ["plate", "trail", "trail", "trail", "trail", "trail", "core"],
  rub: ["plate", "ring", "trail", "trail", "trail", "trail", "core"]
};

/* design px from the gesture's centre to the chip's NEAR edge — i.e. clear of that
   type's largest mark at its widest frame */
const CHIP_GAP = { tap: 138, "press-hold": 126, "swipe-left": 104, rub: 130 };
const CHIP_MARGIN = 44; /* the pill never comes closer than this to the frame edge */

/* ------------------------------------------------------------- hint copy */

/**
 * Chip microcopy lives in data/template.json under `hints`, keyed by scene slug, and
 * the kit loads it itself.
 *
 * WHY HERE AND NOT IN THE SCENES: the engine and js/main.js are not the kit's to
 * edit, and a scene module gets DOM handed to it, not raw config. Loading once here
 * beats six scene modules each fetching the same file. Same URL string as js/main.js,
 * so the two share one HTTP cache entry.
 *
 * The fetch starts when kit is imported — which is before boot() runs, and long
 * before any scene calls hint() — so the copy is almost always already in hand. A
 * chip whose copy has not landed yet fills itself in when it does.
 *
 * KEEP THE TOKEN BELOW IN LOCK-STEP WITH js/main.js's data/template.json?v=. Two
 * different tokens means two cache entries, and this one going stale means chips
 * showing yesterday's copy. Byte-identical strings are the whole point.
 */
const HINT_COPY_URL = "data/template.json?v=12";

let hintCopy = null;
let hintCopyPending = null;

function loadHintCopy() {
  if (hintCopy || hintCopyPending) return hintCopyPending;
  if (typeof fetch !== "function") {
    hintCopy = {};
    return null;
  }
  hintCopyPending = fetch(HINT_COPY_URL)
    .then(function (r) {
      return r.ok ? r.json() : null;
    })
    .then(function (j) {
      hintCopy = (j && j.hints) || {};
    })
    .catch(function () {
      hintCopy = {}; /* missing or unparseable copy just means no chips */
    });
  return hintCopyPending;
}

if (typeof document !== "undefined") loadHintCopy();

/** The configured string for a key, or "" while the copy is still in flight. */
function copyFor(key) {
  return hintCopy && typeof hintCopy[key] === "string" ? hintCopy[key].trim() : "";
}

/**
 * A gesture affordance, positioned in DESIGN coordinates, with optional microcopy.
 *
 *   tap         double-pulse rings breaking off an ivory core
 *   swipe-left  a comet gliding right-to-left
 *   press-hold  a ring a core fills, holds, and lets go of
 *   rub         a dot scrubbing a circle, smearing light behind it
 *
 * Options
 *   designX, designY   the gesture locus, design px (default frame centre)
 *   type               one of the four above (default "tap")
 *   delay              ms before the first appearance (default 1200)
 *   scale              multiplies the marks (not the chip)
 *   label              literal chip copy; "" / null / false = no chip
 *   labelKey           data/template.json `hints` key (default ctx.slug)
 *   labelSide          "below" (default) | "above" — which side of the locus
 *   labelAt            [x, y] design px for the chip's centre; overrides labelSide
 *
 * The chip is clamped to stay CHIP_MARGIN inside the 1080x1920 frame whichever way it
 * is placed, so a locus near an edge slides its copy along rather than off-stage.
 *
 * Lifecycle: appears after 1.2s and STAYS until the scene's interaction completes.
 * A pointerdown only DUCKS it (see the timing block above) — a guest who taps an inert
 * corner has the instruction back inside half a second, never six. done() is the one
 * exit, and destroy() runs on ctx exit. The chip is a child of the hint node, so it
 * inherits every beat of that for free. Under reduced motion the whole thing still
 * appears — as one static frame.
 *
 * Handle: { show, hide, done, destroy, linger, el }
 */
export function hint(ctx, o) {
  o = o || {};
  const mount = (ctx && ctx.frame) || o.mount;
  if (!mount) return { show: function () {}, hide: function () {}, done: function () {}, destroy: function () {} };

  const type = HINT_TYPES[o.type] ? o.type : "tap";
  const still = reduced(ctx);
  const atX = o.designX == null ? FRAME_W / 2 : o.designX;
  const atY = o.designY == null ? FRAME_H / 2 : o.designY;

  const node = document.createElement("div");
  node.className = "fx-hint fx-hint--" + type + (still ? " is-still" : "");
  node.setAttribute("aria-hidden", "true");
  node.style.setProperty("--fx-x", px(atX));
  node.style.setProperty("--fx-y", px(atY));
  if (o.scale != null) node.style.setProperty("--fx-hint-scale", String(o.scale));

  /* geometric light only — a contrast plate, rings, a core, trails */
  const seen = Object.create(null);
  (HINT_PARTS[type] || HINT_PARTS.tap).forEach(function (part) {
    const span = document.createElement("span");
    span.className = "fx-hint__" + part;
    span.style.setProperty("--fx-i", String(seen[part] || 0));
    seen[part] = (seen[part] || 0) + 1;
    node.appendChild(span);
  });

  /* the microcopy pill. aria-hidden in its own right: the gesture's accessible name
     lives on the scene's real <button>, and a duplicate would only be noise. */
  const chip = document.createElement("p");
  chip.className = "fx-hint__chip";
  chip.setAttribute("aria-hidden", "true");
  node.appendChild(chip);

  mount.appendChild(node);

  /* visible  the hint WANTS to be seen (is-on). Only done()/destroy() clear it.
     ducked   a finger is down: the mark steps back to --fx-hint-duck so it is not
              sitting on top of whatever is being touched. Ducking never ends a hint.
     down     live pointer ids. Empty = nothing is being touched = restore. */
  let visible = false;
  let finished = false;
  let ducked = false;
  let lingerMs = 0; /* extra duck a scene asked for — see linger() */
  let lastAt = 0; /* last pointerdown / pointermove, for the stuck-duck backstop */
  const down = [];
  let appearTimer = 0;
  let duckTimer = 0;
  let restoreTimer = 0;
  let stuckTimer = 0;
  let outTimer = 0;
  const bound = []; /* only used on the ctx-less path; ctx.on cleans itself up */

  /** Centre `v` on the frame, never letting a `half`-wide box cross the margin. */
  function clampAxis(v, half, size) {
    const lo = CHIP_MARGIN + half;
    const hi = size - CHIP_MARGIN - half;
    return lo > hi ? size / 2 : clamp(v, lo, hi);
  }

  function setLabel(text) {
    if (finished) return;
    if (!text) {
      node.classList.remove("has-label");
      chip.textContent = "";
      return;
    }
    chip.textContent = text;
    node.classList.add("has-label"); /* the chip is display:none until this lands */

    /* measured, not assumed: the pill is sized by its own copy, and offsetWidth here
       is already in design px (the frame's scale is a transform, not layout) */
    const w = chip.offsetWidth;
    const h = chip.offsetHeight;
    let cx;
    let cy;
    if (o.labelAt && o.labelAt.length === 2) {
      cx = o.labelAt[0];
      cy = o.labelAt[1];
    } else {
      cx = atX;
      const gap = (CHIP_GAP[type] || CHIP_GAP.tap) + h / 2;
      cy = o.labelSide === "above" ? atY - gap : atY + gap;
    }
    chip.style.setProperty("--fx-chip-x", px(clampAxis(cx, w / 2, FRAME_W) - atX));
    chip.style.setProperty("--fx-chip-y", px(clampAxis(cy, h / 2, FRAME_H) - atY));
  }

  /* an explicit `label` wins; otherwise the slug (or labelKey) picks its own copy */
  if (typeof o.label === "string") {
    setLabel(o.label.trim());
  } else if (o.label !== null && o.label !== false) {
    const key = o.labelKey || (ctx && ctx.slug) || "";
    setLabel(copyFor(key));
    if (!hintCopy && hintCopyPending) {
      hintCopyPending.then(function () {
        setLabel(copyFor(key));
      });
    }
  }

  function show() {
    if (finished || visible) return;
    visible = true;
    node.classList.add("is-on");
  }

  function hide() {
    if (!visible) return;
    visible = false;
    node.classList.remove("is-on");
  }

  /* ------------------------------------------------------------------ duck */

  function duck() {
    duckTimer = 0;
    if (finished || ducked) return;
    ducked = true;
    node.classList.add("is-ducked");
  }

  function unduck() {
    restoreTimer = 0;
    lingerMs = 0;
    if (!ducked) return;
    ducked = false;
    node.classList.remove("is-ducked");
  }

  /* The restore waits a beat ON PURPOSE. A pointerup that COMPLETES the scene's
     gesture reaches the scene's own listener on the same element in the same tick,
     and that calls done() — a hint already fading back in would flash on its way
     out. HINT_RESTORE_MS is that tick, not a stall. */
  function scheduleRestore() {
    clearTimeout(duckTimer);
    duckTimer = 0;
    clearTimeout(stuckTimer);
    stuckTimer = 0;
    clearTimeout(restoreTimer);
    restoreTimer = 0;
    if (finished) return;
    if (!ducked) {
      lingerMs = 0;
      return;
    }
    restoreTimer = setTimeout(unduck, HINT_RESTORE_MS + lingerMs);
  }

  /* BACKSTOP, not the way home. If the pointerup never arrives — capture lost to the
     OS, the stream torn down mid-gesture — nothing else would ever lift the duck.
     Re-arms itself while the gesture is still moving, so a long deliberate rub is not
     interrupted by its own safety net. */
  function stuckCheck() {
    stuckTimer = 0;
    if (finished || !down.length) return;
    const idle = clock() - lastAt;
    if (idle < HINT_IDLE_MS) {
      stuckTimer = setTimeout(stuckCheck, HINT_IDLE_MS - idle);
      return;
    }
    down.length = 0; /* the pointerup that never came */
    scheduleRestore();
  }

  /**
   * Hold the duck a beat longer once the finger lifts — for a scene whose OWN chrome
   * stands in for the hint while the gesture is live (wedding's hold meter sits on the
   * very spot the hint marks). The ring gets that spot to itself for a moment; the
   * hint still comes back on its own, so a guest who stops there is never stranded.
   *
   * A no-op unless the hint is actually ducked, so a press too brief to have ducked it
   * can never be made to blink.
   */
  function linger(ms) {
    if (finished || (!ducked && !down.length)) return;
    const v = clamp(ms || 0, 0, HINT_LINGER_MAX);
    if (v > lingerMs) lingerMs = v;
  }

  /* --------------------------------------------------------------- teardown */

  function clearTimers() {
    clearTimeout(appearTimer);
    clearTimeout(duckTimer);
    clearTimeout(restoreTimer);
    clearTimeout(stuckTimer);
    appearTimer = 0;
    duckTimer = 0;
    restoreTimer = 0;
    stuckTimer = 0;
  }

  function unbind() {
    bound.splice(0).forEach(function (b) {
      b[0].removeEventListener(b[1], b[2]);
    });
  }

  function destroy() {
    finished = true;
    clearTimers();
    clearTimeout(outTimer);
    outTimer = 0;
    unbind();
    if (node.parentNode) node.parentNode.removeChild(node);
  }

  function done() {
    finished = true;
    clearTimers();
    ducked = false;
    node.classList.remove("is-ducked");
    hide();
    /* let the fade-out finish before the node goes; destroy() is idempotent */
    outTimer = setTimeout(destroy, HINT_OUT_MS);
  }

  /* ------------------------------------------------------- pointer plumbing */

  function pid(e) {
    return e && e.pointerId != null ? e.pointerId : "p";
  }

  const onDown = function (e) {
    if (finished) return;
    if (down.indexOf(pid(e)) < 0) down.push(pid(e));
    lastAt = clock();
    clearTimeout(restoreTimer);
    restoreTimer = 0;
    lingerMs = 0;
    if (!ducked && !duckTimer) duckTimer = setTimeout(duck, HINT_DUCK_MS);
    clearTimeout(stuckTimer);
    stuckTimer = setTimeout(stuckCheck, HINT_IDLE_MS);
  };

  const onMove = function () {
    if (down.length) lastAt = clock();
  };

  const onUp = function (e) {
    if (finished) return;
    const i = down.indexOf(pid(e));
    if (i >= 0) down.splice(i, 1);
    if (down.length) return;
    lastAt = clock();
    scheduleRestore();
  };

  /* ctx.on ties a listener to the scene's abort signal; the ctx-less path (a bare
     `mount`) has no signal, so those come off by hand in destroy(). */
  function bind(el, type, fn) {
    if (!el) return;
    if (ctx && typeof ctx.on === "function") {
      ctx.on(el, type, fn);
    } else {
      el.addEventListener(type, fn, { passive: true });
      bound.push([el, type, fn]);
    }
  }

  appearTimer = setTimeout(show, o.delay == null ? HINT_APPEAR_MS : o.delay);

  const target = (ctx && ctx.el) || mount;
  bind(target, "pointerdown", onDown);
  bind(target, "pointermove", onMove);
  bind(target, "pointerup", onUp);
  bind(target, "pointercancel", onUp);
  /* a pointer released OUTSIDE the scene box (a mouse dragged off the stage) never
     reaches `target` — without these the duck would sit until the backstop */
  if (typeof window !== "undefined") {
    bind(window, "pointerup", onUp);
    bind(window, "pointercancel", onUp);
  }

  if (ctx && ctx.signal) {
    if (ctx.signal.aborted) destroy();
    else ctx.signal.addEventListener("abort", destroy, { once: true });
  }

  return {
    show: show,
    hide: hide,
    done: done,
    destroy: destroy,
    linger: linger,
    el: node
  };
}

/* --------------------------------------------------------------------- use */

/**
 * Everything above, pre-bound to one scene ctx — the ergonomic path:
 *
 *   const fx = kit.use(ctx);
 *   fx.sway(ctx.layer("sprig-left"), { deg: 1.6, dur: 5500 });
 *   const tip = fx.hint({ designX: 540, designY: 1400, type: "tap" });
 */
export function use(ctx) {
  const bindEl = function (fn) {
    return function (el, o) {
      return fn(el, Object.assign({}, o, { ctx: ctx }));
    };
  };
  return {
    ctx: ctx,
    sway: bindEl(sway),
    bob: bindEl(bob),
    drift: bindEl(drift),
    breathe: bindEl(breathe),
    pendulum: bindEl(pendulum),
    glowPulse: bindEl(glowPulse),
    sparkleField: function (container, o) {
      return sparkleField(container || ctx.frame, Object.assign({}, o, { ctx: ctx }));
    },
    bendGroup: function (items, o) {
      return bendGroup(items, Object.assign({}, o, { ctx: ctx }));
    },
    frameZoom: function (o) {
      return frameZoom(ctx, o);
    },
    hint: function (o) {
      return hint(ctx, o);
    },
    /**
     * One-shot WAAPI on any element, cancelled on scene EXIT (not on finish, so a
     * `fill: "forwards"` pose survives until the scene actually leaves).
     *
     * If a one-shot ends away from identity, the scene MUST reset that element in
     * enter() — the engine replays enter() on every re-entry, and rule 2 says a
     * revisited scene starts on the exact PSD frame.
     */
    play: function (el, keyframes, options) {
      if (!el || typeof el.animate !== "function") return Promise.resolve();
      if (reduced(ctx)) {
        const t = (options && options.duration) || 0;
        return new Promise(function (res) {
          setTimeout(res, Math.min(60, t));
        });
      }
      const anim = el.animate(keyframes, options);
      tie(ctx, function () {
        try {
          anim.cancel();
        } catch (e) {}
      });
      return anim.finished && typeof anim.finished.then === "function"
        ? anim.finished.then(
            function () {},
            function () {}
          )
        : new Promise(function (res) {
            anim.onfinish = res;
          });
    }
  };
}
