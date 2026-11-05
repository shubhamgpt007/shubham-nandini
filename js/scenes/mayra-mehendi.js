/* mayra-mehendi.js — scene 3 of 7. "Mayra & Mehendi"
 *
 * ART        base (blush paper, bougainvillea arch, stairs, trees, carpet) + a hanging
 *            canopy (drapes, three inverted Rajasthani umbrellas, three fringe lamps),
 *            the mehendi party on the stairs (women-group, man-left, dancer), the pink
 *            hot-air balloon parked at the left, and static pots / flower rows.
 * AMBIENT    the canopy sways — every umbrella and tassel on its own period and phase —
 *            the drapes breathe by a hair, the balloon floats, the dancer bounces on the
 *            beat, and the seated party only breathes. The BASE never moves.
 * SIGNATURE  tap the balloon -> it bobs an acknowledgement, then lifts off, rising and
 *            swinging on its basket. Mid-rise it calls complete().
 * FORWARD    "mayra-balloon" — the balloon keeps climbing while the day scene fades and
 *            dims out from under it and the cocktail night settles in beneath; it drifts
 *            past the top edge and fades into the stars.
 *
 * COMPOSITION NOTE
 *   Two layers need translate AND rotate at once (the floating balloon, the dancing
 *   man). Two WAAPI animations on the same element both target `transform` and the
 *   later one simply wins, so those layers get ONE combined transform loop — built with
 *   the same shape kit.loop() uses (12 sine samples over one full cycle, phase spent
 *   sitting on the resting frame, cancelled on ctx.signal), so starting and stopping
 *   ambient motion stay invisible and the resting frame is still the PSD frame.
 *   Their transform-origin is declared in css/scenes/mayra-mehendi.css rather than set
 *   inline, so the lift can re-use it after the idle loop has been stopped.
 *
 * Owns exactly: this file + css/scenes/mayra-mehendi.css.
 */

import * as kit from "../fx/kit.js?v=8";
import * as text from "../fx/text.js?v=9";

/* --------------------------------------------------- design anchors (scenes.json) */

const BALLOON = { x: 56, y: 1186, w: 235, h: 369 };
const HIT_PAD = 64; /* the required >= 64 design px of slop around the cutout */
const HINT_AT = [173, 1300]; /* centre of the envelope, well clear of the basket */

/* Hanging canopy. Distinct periods AND phases, so the row never swings in lockstep;
   alternating signs make neighbours lean opposite ways (kit rule: antiphase is a
   NEGATIVE amplitude, never phase 0.5). */
const UMBRELLAS = [
  { id: "umbrella-left", deg: 2.6, dur: 5200, phase: 0 },
  { id: "umbrella-mid", deg: -2.2, dur: 6300, phase: 0.42 },
  { id: "umbrella-right", deg: 3, dur: 4700, phase: 0.71 }
];

const TASSELS = [
  { id: "tassel-left", deg: -3, dur: 4400, phase: 0.18 },
  { id: "tassel-mid", deg: 3, dur: 5100, phase: 0.63 },
  { id: "tassel-right", deg: -2.6, dur: 4800, phase: 0.9 }
];

/* ------------------------------------------------------------------- lift-off */

const ACK_MS = 420; /* the balloon nods before it goes */
const LIFT_MS = 2100;
const LIFT_RISE = 600; /* design px of climb inside the scene's own animation */
const LIFT_SCALE = 0.92;
const LIFT_DRIFT = 46; /* it never rises perfectly vertically */
const PEND_MS = 1400; /* basket swing period */
const PEND_DEG = 3;

const HANDOVER_MS = 1000; /* mid-rise: where ctx.complete() fires */
const AWAY_MS = 1600; /* the "mayra-balloon" transition */
const AWAY_RISE = 1000; /* extra climb that carries it off the top edge */
const AWAY_SCALE = 0.86;
const TOTAL_MS = HANDOVER_MS + AWAY_MS;

/* The climb is one ease-out curve; the escape continues it with the curve's OWN
   velocity at the handover and a constant upward acceleration, so the join between the
   scene's animation and the transition's is C1-continuous — the guest sees one rise. */
const H = HANDOVER_MS / LIFT_MS;
const H_EASE = 1 - Math.pow(1 - H, 3);
const CLIMB_Y = -LIFT_RISE * H_EASE;
const CLIMB_S = 1 + (LIFT_SCALE - 1) * H_EASE;
const CLIMB_V = (-LIFT_RISE * 3 * Math.pow(1 - H, 2)) / LIFT_MS; /* px per ms, negative */
const AWAY_ACC = (2 * (-AWAY_RISE - CLIMB_V * AWAY_MS)) / (AWAY_MS * AWAY_MS);

/** The whole journey, in ms from the moment the lift starts. */
function liftPose(t) {
  let y;
  let s;
  if (t <= HANDOVER_MS) {
    const e = 1 - Math.pow(1 - t / LIFT_MS, 3);
    y = -LIFT_RISE * e;
    s = 1 + (LIFT_SCALE - 1) * e;
  } else {
    const k = t - HANDOVER_MS;
    y = CLIMB_Y + CLIMB_V * k + 0.5 * AWAY_ACC * k * k;
    s = CLIMB_S + (AWAY_SCALE - CLIMB_S) * (k / AWAY_MS);
  }
  /* the basket keeps swinging the whole way up, settling as the air thins */
  const damp = t <= HANDOVER_MS ? 1 : 1 - 0.45 * ((t - HANDOVER_MS) / AWAY_MS);
  return {
    x: LIFT_DRIFT * (t / TOTAL_MS),
    y: y,
    s: s,
    r: PEND_DEG * damp * Math.sin((2 * Math.PI * t) / PEND_MS)
  };
}

function poseCss(p) {
  return (
    "translate3d(" + p.x.toFixed(2) + "px," + p.y.toFixed(2) + "px,0)" +
    " scale(" + p.s.toFixed(4) + ")" +
    " rotate(" + p.r.toFixed(3) + "deg)"
  );
}

/* --------------------------------------------------------------- loop helper */

const STEPS = 12; /* same sampling the kit uses: 12 segments deviate < 3.5% of A */

function samples(sample, steps) {
  const frames = [];
  const n = steps || STEPS;
  for (let i = 0; i <= n; i += 1) {
    frames.push(Object.assign({ offset: i / n }, sample(i / n)));
  }
  return frames;
}

function wave(t) {
  return Math.sin(t * 2 * Math.PI);
}

/**
 * One full-cycle `transform` loop for a layer that needs translate and rotate at once.
 * sample(0) is the resting frame, so starting, stopping and cancelling are invisible;
 * `phase` is spent sitting on that frame, exactly like kit.loop.
 */
function transformLoop(ctx, el, sample, o) {
  if (!el || ctx.reducedMotion || typeof el.animate !== "function") return null;
  const dur = Math.max(1, o.dur || 4000);
  const anim = el.animate(samples(sample), {
    duration: dur,
    iterations: Infinity,
    easing: "linear", /* the shape is IN the samples */
    delay: Math.round(Math.min(1, Math.max(0, o.phase || 0)) * Math.min(dur, 1800))
  });
  let dead = false;
  const stop = function () {
    if (dead) return;
    dead = true;
    try {
      anim.cancel(); /* back to the PSD frame exactly */
    } catch (e) {}
  };
  if (ctx.signal) {
    if (ctx.signal.aborted) stop();
    else ctx.signal.addEventListener("abort", stop, { once: true });
  }
  return { stop: stop, anim: anim };
}

/* One scene instance is ever live. Reset in enter(), which replays on every entry. */
let state = null;

/* ------------------------------------------------------------------ ambient */

function startAmbient(ctx) {
  const fx = kit.use(ctx);

  /* the canopy: everything up there hangs from a rod, so it pivots about its own top */
  UMBRELLAS.concat(TASSELS).forEach(function (h) {
    fx.pendulum(ctx.layer(h.id), { deg: h.deg, dur: h.dur, phase: h.phase });
  });

  /* the swags only breathe — a drape that visibly moved would drag the whole ceiling */
  fx.breathe(ctx.layer("drapes"), { scale: 1.012, dur: 26000, origin: "50% 0%" });

  /* the party: the seated group breathes rather than wobbles, the standing man shifts
     his weight, and the dancer is the only one actually on the beat */
  fx.sway(ctx.layer("women-group"), { deg: -0.5, dur: 6000, origin: "50% 100%", phase: 0.55 });
  fx.sway(ctx.layer("man-left"), { deg: 0.7, dur: 8200, origin: "50% 100%", phase: 0.25 });

  /* ~1.7 bounces a second, with the lean riding the same beat: he is dancing, not
     drifting. One transform loop — see the COMPOSITION NOTE. */
  transformLoop(
    ctx,
    ctx.layer("dancer"),
    function (t) {
      const w = wave(t);
      return {
        transform: "translate3d(0," + (-5 * w).toFixed(2) + "px,0) rotate(" + (1.5 * w).toFixed(3) + "deg)"
      };
    },
    { dur: 1150 }
  );

  /* the balloon is the only thing here not touching the ground: it rides the air, and
     rocks twice per float so it reads as buoyant rather than hinged */
  state.balloon = transformLoop(
    ctx,
    ctx.layer("balloon"),
    function (t) {
      return {
        transform:
          "translate3d(0," + (-6 * wave(t)).toFixed(2) + "px,0)" +
          " rotate(" + (1 * Math.sin(t * 4 * Math.PI)).toFixed(3) + "deg)"
      };
    },
    { dur: 5000 }
  );
}

/* -------------------------------------------------------------- interaction */

function armTap(ctx) {
  const fx = kit.use(ctx);
  const balloon = ctx.layer("balloon");
  if (!balloon) return null;

  /* A real <button>, so the gesture is keyboard-reachable and announced. Sized from the
     PSD rect + 64 design px of slop — the cutout is mostly transparent, so tapping
     "near" the balloon has to count. Clamped to the frame's left edge. */
  const hit = document.createElement("button");
  hit.type = "button";
  hit.className = "mm-hit";
  hit.setAttribute("aria-label", "Send the balloon up");
  const left = Math.max(0, BALLOON.x - HIT_PAD);
  hit.style.setProperty("--x", left + "px");
  hit.style.setProperty("--y", BALLOON.y - HIT_PAD + "px");
  hit.style.setProperty("--w", BALLOON.x + BALLOON.w + HIT_PAD - left + "px");
  hit.style.setProperty("--h", BALLOON.h + HIT_PAD * 2 + "px");
  ctx.frame.appendChild(hit);

  /* the pill clears the balloon upward, onto the blush wall left of the arch — below
     it are the basket, the flower stalls and the family on the steps */
  const tip = fx.hint({
    designX: HINT_AT[0],
    designY: HINT_AT[1],
    type: "tap",
    labelAt: [HINT_AT[0], 1075]
  });

  const onTap = function () {
    if (!state || state.lifting || !ctx.isActive()) return;
    state.lifting = true;
    hit.disabled = true;
    tip.done();

    const finish = function () {
      if (ctx.isActive()) ctx.complete();
    };

    if (ctx.reducedMotion || typeof balloon.animate !== "function") {
      finish();
      return;
    }

    /* the idle float owns `transform`; it has to let go before the lift claims it */
    if (state.balloon) {
      state.balloon.stop();
      state.balloon = null;
    }

    /* acknowledge — a nod on the tether, ending exactly where it started */
    fx.play(
      balloon,
      [
        { transform: "translate3d(0,0,0) rotate(0deg)", offset: 0 },
        { transform: "translate3d(0,-7px,0) rotate(-4.5deg)", offset: 0.3 },
        { transform: "translate3d(0,-3px,0) rotate(3.2deg)", offset: 0.62 },
        { transform: "translate3d(0,0,0) rotate(-1.2deg)", offset: 0.84 },
        { transform: "translate3d(0,0,0) rotate(0deg)", offset: 1 }
      ],
      { duration: ACK_MS, easing: "cubic-bezier(0.33, 1, 0.68, 1)" }
    );

    state.ackTimer = setTimeout(function () {
      if (!ctx.isActive()) return;

      /* ...and away. The climb runs the full 2.1s curve; at HANDOVER_MS the exact pose
         is baked inline and the animation dropped IN THE SAME TASK, so the balloon is
         never painted snapped back and getAnimations() still empties. The transition
         driver picks the same curve up from there. */
      const lift = balloon.animate(
        samples(function (t) {
          return { transform: poseCss(liftPose(t * LIFT_MS)) };
        }, 24),
        { duration: LIFT_MS, easing: "linear", fill: "forwards" }
      );
      /* fill:"forwards" applies its last frame forever unless cancelled, so a guest who
         navigates away mid-lift must not leave the balloon parked in a hidden scene —
         and getAnimations() has to empty. cancel() twice is a no-op. */
      if (ctx.signal) {
        ctx.signal.addEventListener(
          "abort",
          function () {
            try {
              lift.cancel();
            } catch (e) {}
          },
          { once: true }
        );
      }

      state.handTimer = setTimeout(function () {
        balloon.style.transform = poseCss(liftPose(HANDOVER_MS));
        try {
          lift.cancel();
        } catch (e) {}
        finish();
      }, HANDOVER_MS);
    }, ACK_MS);
  };

  ctx.on(hit, "click", onTap);

  return function teardown() {
    clearTimeout(state && state.ackTimer);
    clearTimeout(state && state.handTimer);
    if (hit.parentNode) hit.parentNode.removeChild(hit);
  };
}

/* -------------------------------------------------- forward: "mayra-balloon" */
/* The arriving night's own lift, in place of `filter: brightness(1.18 -> 1)` on the
   whole .scene (kit.js rule 6). Solved as `s = (b - 1) * C / (W - C)` against the
   cocktail room's mean of ~40 RGB: a night scene has almost nothing for a brightness
   to lift, so the sheet that replaces it is nearly invisible — which is the point. */
const NIGHT_TINT = "#dce8ff"; /* the room's own cool crystal, never gold */
const NIGHT_A = 0.04;

/** A flat sheet of light over `parent`, resting invisible. Solid colour only — no
 *  gradient, no children, no border: that is what keeps it a solid-colour layer, and a
 *  solid-colour layer costs the compositor no backing store at all. */
function makeSheet(parent, tint, z) {
  if (!parent) return null;
  const s = document.createElement("div");
  s.className = "mm-sheet";
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
 * Day into night, through a rising balloon.
 *
 * The outgoing scene is NOT faded as one element — that would take the balloon down
 * with it. Instead every layer EXCEPT the balloon fades and dims on its own, the
 * scene's blush ground tint is switched off (`.mm-away`, a static style, never
 * animated), and the balloon holds full opacity while it keeps climbing over the
 * cocktail night settling in underneath. Only in the last beat does it fade out,
 * already past the top edge.
 *
 * THE COOLING IS IN THE OPACITY CURVE, NOT IN A FILTER.
 * Because this driver dims every layer separately, the `filter: brightness(1 -> 0.92
 * -> 0.7)` it used to pair with each fade was TWENTY-ONE offscreen filter buffers at
 * once (measured: 50.73MB of them, on the scene with the most layers in the
 * invitation) — the single worst instance of kit.js rule 6 in the template.
 * Dimming a layer by b while it composites over a backdrop N is the same picture as
 * multiplying its alpha by b, up to a residual of a(1-b)N — and N here is the cocktail
 * NIGHT settling in underneath, which is nearly black, so the residual is worth a
 * fraction of an RGB point. The alphas below are the old opacity stops times the old
 * brightness stops, and nothing in this driver touches `filter` any more.
 */
kit.defineTransition("mayra-balloon", function (fromEl, toEl, done, meta) {
  if (meta.reducedMotion || !fromEl) return crossfade(fromEl, toEl, done);

  const anims = [];
  const nodes = [];
  let balloon = fromEl.querySelector('[data-layer="balloon"]');

  /* This driver continues a rise the SCENE started and baked inline. Reached any other
     way — the nav rail skipping forward past this scene — there is no handover to
     continue, so the balloon simply leaves with everything else instead of teleporting
     to mid-flight. */
  if (balloon && !balloon.style.transform) balloon = null;

  fromEl.style.zIndex = "2";
  fromEl.classList.add("mm-away"); /* drops the blush ground tint, so night shows through */

  /* the day goes out from under the balloon: fading, and cooling as it goes.
     0.74 x 0.92 = 0.681 — the old opacity stop carrying the old dim inside it. */
  const fading = fromEl.querySelectorAll(".layer, .scene__bleed, .scene-text");
  Array.prototype.forEach.call(fading, function (node, i) {
    if (balloon && node === balloon) return;
    anims.push(
      node.animate(
        [
          { opacity: 1, offset: 0 },
          { opacity: 0.681, offset: 0.45 },
          { opacity: 0, offset: 1 }
        ],
        {
          duration: 980,
          delay: 90 + (i % 6) * 26, /* the canopy lets go a beat after the ground does */
          easing: "cubic-bezier(0.5, 0, 0.75, 0.5)",
          fill: "forwards"
        }
      )
    );
  });

  /* ...and the balloon carries on, on the same curve the scene handed over. Its own
     dim into the dark is folded into the same alpha, on the same reasoning. */
  if (balloon) {
    anims.push(
      balloon.animate(
        samples(function (u) {
          const p = liftPose(HANDOVER_MS + u * AWAY_MS);
          const hold = u < 0.62 ? 1 : Math.max(0, (0.94 - u) / 0.32);
          return {
            transform: poseCss(p),
            opacity: (hold * (1 - 0.16 * u)).toFixed(4)
          };
        }, 24),
        { duration: AWAY_MS, easing: "linear", fill: "forwards" }
      )
    );
  }

  /* the night is already there, settling out of the dark rather than sliding in.
     Its old `brightness(1.18 -> 1)` is a flat sheet now — inside toEl, so the scene's
     own opacity ramp fades it in exactly as it used to fade in the filter. */
  toEl.style.zIndex = "1";
  const bloomIn = makeSheet(toEl, NIGHT_TINT, "600");
  if (bloomIn) {
    nodes.push(bloomIn);
    anims.push(
      bloomIn.animate(
        [
          { opacity: NIGHT_A, offset: 0 },
          { opacity: NIGHT_A * 0.33, offset: 0.52 },
          { opacity: 0, offset: 1 }
        ],
        { duration: Math.round(AWAY_MS * 0.78), easing: "cubic-bezier(0.22, 0.61, 0.36, 1)", fill: "backwards" }
      )
    );
  }
  anims.push(
    toEl.animate(
      [
        { opacity: 0, transform: "scale(1.025)", offset: 0 },
        { opacity: 0.62, offset: 0.52 },
        { opacity: 1, transform: "scale(1)", offset: 1 }
      ],
      { duration: Math.round(AWAY_MS * 0.78), easing: "cubic-bezier(0.22, 0.61, 0.36, 1)", fill: "backwards" }
    )
  );

  const timer = setTimeout(done, AWAY_MS);

  return function cleanup() {
    clearTimeout(timer);
    anims.forEach(function (a) {
      if (a) {
        try {
          a.cancel();
        } catch (e) {}
      }
    });
    nodes.forEach(function (n) {
      if (n && n.parentNode) n.parentNode.removeChild(n);
    });
    fromEl.classList.remove("mm-away");
    fromEl.style.zIndex = "";
    toEl.style.zIndex = "";
  };
});

/* ------------------------------------------------------------------ module */

kit.defineScene("mayra-mehendi", {
  forward: "mayra-balloon",

  enter: function (ctx) {
    /* the invitation copy, rebuilt from data/textspec.json on every entry */
    text.mount(ctx);
    state = { balloon: null, lifting: false, ackTimer: 0, handTimer: 0 };
    /* revisit: nothing a previous lift baked in may survive — the balloon is parked
       back on its tether and the scene has its blush ground tint again */
    ctx.el.classList.remove("mm-away");
    /* revisit: no sheet of transition light may survive a previous visit */
    ctx.el.querySelectorAll(".mm-sheet").forEach(function (n) {
      n.parentNode.removeChild(n);
    });
    ctx.layers().forEach(function (el) {
      el.style.removeProperty("transform");
      el.style.removeProperty("rotate");
      el.style.removeProperty("opacity");
      el.style.removeProperty("filter");
      el.style.removeProperty("will-change");
    });
  },

  armInteraction: armTap,

  /* the entry cascade owns `transform` until it finishes, so the copy's reveal and
     the ambient loops both start at idle */
  idle: function (ctx) {
    text.reveal(ctx); /* before the ambient guards — the copy always shows */
    if (!state || state.lifting) return;
    startAmbient(ctx);
  }
});
