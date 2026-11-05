/* cocktail.js — scene 4 of 7. "Cocktail"
 *
 * ART        base (starry sky, the great tree, ground and stairs) + a hung ceiling
 *            (fairy-light strings, seven green swags, four ivory ribbons, four crystal
 *            chandeliers) + two more chandeliers down in the tree, the standing gold
 *            mirror at the left with the couple already reflected in it, the candle
 *            cluster at its feet, the couple dancing, and static foreground planting.
 * AMBIENT    the sky twinkles, the fairy lights breathe, every chandelier swings on its
 *            own period, the swags billow, the candles flicker, the couple sway together,
 *            and a specular sheen crosses the mirror glass every eight seconds.
 * SIGNATURE  touch the mirror -> the glass answers with a bloom and an expanding ring,
 *            then complete().
 * FORWARD    "cocktail-mirror" — the whole night is drawn INTO the glass: the frame
 *            dollies into the reflection, light floods out of it, and the haldi morning
 *            settles out of that light.
 *
 * COMPOSITION NOTE
 *   The dancing couple need translate AND rotate at once. Two WAAPI animations on the
 *   same element both target `transform` and the later one simply wins, so they get ONE
 *   combined transform loop, built with the same shape kit.loop() uses (12 sine samples
 *   over one full cycle, `phase` spent sitting on the resting frame, cancelled on
 *   ctx.signal). Their pivot is declared in css/scenes/cocktail.css, not written inline.
 *   The chandeliers in the tree carry a `transform` pendulum AND an opacity/filter
 *   glowPulse — different properties, so those two kit loops compose instead of fighting.
 *
 * Owns exactly: this file + css/scenes/cocktail.css.
 */

import * as kit from "../fx/kit.js?v=8";
import * as text from "../fx/text.js?v=9";

/* --------------------------------------------------- design anchors (scenes.json) */

/* The arched glass inside the gold frame, measured off qa/ref/cocktail.png. The mirror
   leans, so the panel is a touch trapezoid; this box is inset far enough to sit inside
   it at every height, and css/scenes/cocktail.css gives it the arch and the lean. */
const GLASS = { x: 126, y: 1258, w: 124, h: 415 };
const GLASS_MID = [GLASS.x + GLASS.w / 2, GLASS.y + GLASS.h / 2]; /* [188, 1465.5] */

/* Where the hand meets the glass, and where its answer breaks out: the open blue above
   the reflection, so neither the affordance nor the burst sits on the couple's faces. */
const TOUCH_AT = [190, 1350];

/* Pivot for the dolly. NOT the glass centre: kit.frameZoom is a pure scale about a
   point, so zooming about the glass would leave the mirror pinned in the bottom-left
   corner while the room flew away around it. Scaling about the frame's left edge
   instead carries the glass up and inward as it grows — at the 2.1x peak the glass
   centre lands at (395, 960), close to the middle of the viewport — and keeping the
   pivot's x at 0 guarantees the artwork still covers the frame at every step. */
const ZOOM_FROM = [0, 1918];

/* the whole mirror head, with >= 64 design px of slop around the glass on every side */
const HIT = { x: 62, y: 1180, w: 268, h: 560 };

/* Open sky only. The spec's band starts at y 250, but everything above y ~430 is swag,
   hanging foliage or fairy-light string, and everything right of x ~600 is the tree —
   a twinkle landing on a painted leaf reads as a bug, so the field is inset to the
   clear navy between them. */
const SKY = { x: 40, y: 450, w: 560, h: 610 };

/* Hung ceiling. Distinct periods AND phases so the row never swings in lockstep;
   alternating signs make neighbours lean opposite ways (kit rule: antiphase is a
   NEGATIVE amplitude, never phase 0.5). */
const CHANDELIERS = [
  { id: "chandelier-top-1", deg: 1.2, dur: 6100, phase: 0 },
  { id: "chandelier-top-2", deg: -1.2, dur: 7400, phase: 0.34 },
  { id: "chandelier-top-3", deg: 1.1, dur: 5600, phase: 0.62 },
  /* one cutout, TWO lamps, hung 725 design px apart — a single pivot cannot serve both,
     so this one swings at 3/4 amplitude, where the off-pivot lamp still reads as sway */
  { id: "chandelier-top-4", deg: -0.9, dur: 6800, phase: 0.86 }
];

/* Down in the tree: bigger, closer, and lit — these two get the glow as well.
   Their suspension wire starts 93px down the cutout, at 49% of its width. */
const TREE_LIGHTS = [
  { id: "chandelier-tree-1", deg: 1.8, dur: 5400, phase: 0.12, glow: 4400 },
  { id: "chandelier-tree-2", deg: -1.8, dur: 6600, phase: 0.58, glow: 5200 }
];
const TREE_PIVOT = "49% 18%";

/* The swags. kit.breathe never dips below 1 — three of these bleed past a frame edge,
   and a swag that shrank would pull its own cut edge into view — so "back vs front
   antiphase" is expressed as clearly different amplitudes AND periods instead: the two
   groups drift in and out of step on their own, which reads richer than a fixed
   half-cycle offset ever does. */
const SWAGS = [
  { id: "curtain-back-1", scale: 1.015, dur: 17000, phase: 0 },
  { id: "curtain-back-2", scale: 1.014, dur: 19000, phase: 0.4 },
  { id: "curtain-back-3", scale: 1.015, dur: 15500, phase: 0.75 },
  { id: "curtain-front-1", scale: 1.01, dur: 12000, phase: 0.2 },
  { id: "curtain-front-2", scale: 1.011, dur: 13500, phase: 0.55 },
  { id: "curtain-front-3", scale: 1.009, dur: 11000, phase: 0.85 },
  { id: "curtain-front-4", scale: 1.009, dur: 12800, phase: 0.65 }
];

const TOUCH_MS = 450; /* the glass answering the hand */
const ZOOM_MS = 1400; /* the "cocktail-mirror" transition */

/* ------------------------------------------------------- the dive's light
 *
 * The dive used to ask kit.frameZoom for `filter: brightness(1.5) blur(5px)` on the
 * frame, and the arriving haldi for `filter: brightness(1.45 -> 1)` on the whole
 * .scene. This is the single most expensive pattern in the invitation (kit.js rule 6):
 * a filter re-renders the node's whole subtree into an offscreen buffer every frame,
 * and this dolly grows the frame to 2.1x while it runs — the frame's surface went from
 * 9.28MB at rest to 40.94MB at the peak, with the arriving scene asking for a second
 * one at the same moment.
 *
 * Both are flat sheets now, and a childless box with one flat background is a
 * solid-colour layer in both engines — no backing store at all. The alphas are the old
 * brightness curves re-solved as `s = (b - 1) * C / (W - C)` against each scene's own
 * mean, then trimmed on the filmstrip. The dive's own lift is small because the room is
 * navy: brightness on a night scene "can only ever wash it grey", which is exactly why
 * .ck-flash was doing the real whitening all along.
 */
const DIVE_TINT = "#e9f2ff"; /* the mirror's cool crystal, not the room's gold */
const DIVE_A = 0.13; /* peak alpha ~= brightness(1.5) over navy (mean ~40 RGB) */
const ARRIVE_TINT = "#fff6e4"; /* the haldi morning the dive opens onto */
const ARRIVE_A = 0.74;

/* --------------------------------------------------------------- loop helper */

const STEPS = 12; /* same sampling the kit uses: 12 segments deviate < 3.5% of A */

function samples(sample) {
  const frames = [];
  for (let i = 0; i <= STEPS; i += 1) {
    frames.push(Object.assign({ offset: i / STEPS }, sample(i / STEPS)));
  }
  return frames;
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

/** Place a chrome box on the mirror glass (both of the glass overlays share the rect). */
function onGlass(node) {
  node.style.setProperty("--x", GLASS.x + "px");
  node.style.setProperty("--y", GLASS.y + "px");
  node.style.setProperty("--w", GLASS.w + "px");
  node.style.setProperty("--h", GLASS.h + "px");
  return node;
}

/* One scene instance is ever live. Reset in enter(), which replays on every entry. */
let state = null;

/* ------------------------------------------------------------------ ambient */

function startAmbient(ctx) {
  const fx = kit.use(ctx);

  /* stars over the open navy. z 95 keeps the field above the base and UNDER every
     hanging cutout, so a dot that strays high is occluded rather than pasted on a swag */
  fx.sparkleField(ctx.frame, {
    count: 14,
    region: SKY,
    sizeRange: [4, 9], /* ~1.5-3 css px on a 390px phone */
    color: "rgba(226, 238, 255, 0.95)",
    dur: 4200,
    z: 95
  });

  /* the strings breathe rather than blink — jitter keeps the run out of lockstep */
  fx.glowPulse(ctx.layer("fairy-lights"), {
    from: 0.86,
    to: 1,
    brightness: 1.1,
    dur: 3500,
    jitter: 0.35
  });

  /* everything hung from the ceiling pivots about its own suspension point */
  CHANDELIERS.forEach(function (c) {
    fx.pendulum(ctx.layer(c.id), { deg: c.deg, dur: c.dur, phase: c.phase });
  });

  TREE_LIGHTS.forEach(function (c) {
    const el = ctx.layer(c.id);
    fx.pendulum(el, { deg: c.deg, dur: c.dur, phase: c.phase, origin: TREE_PIVOT });
    /* opacity + filter, so this composes with the pendulum's transform instead of
       replacing it */
    fx.glowPulse(el, { from: 0.9, to: 1, brightness: 1.08, dur: c.glow, jitter: 0.25 });
  });

  SWAGS.forEach(function (s) {
    fx.breathe(ctx.layer(s.id), { scale: s.scale, dur: s.dur, phase: s.phase, origin: "50% 0%" });
  });

  /* candlelight: intensity only — the glasses themselves must not move */
  fx.glowPulse(ctx.layer("gift-boxes"), {
    from: 1,
    to: 1,
    brightness: 1.12,
    dur: 4600,
    jitter: 0.4
  });

  /* they are slow-dancing: one lean each way per bar, and they rise on both leans.
     One transform loop — see the COMPOSITION NOTE. */
  transformLoop(
    ctx,
    ctx.layer("couple"),
    function (t) {
      return {
        transform:
          "translate3d(0," + (-1.5 * Math.sin(t * 4 * Math.PI)).toFixed(2) + "px,0)" +
          " rotate(" + (1.2 * Math.sin(t * 2 * Math.PI)).toFixed(3) + "deg)"
      };
    },
    { dur: 4200 }
  );

  /* a specular streak crossing the glass every eight seconds. Pure light, clipped to
     the panel; invisible at both ends of its cycle, so the resting frame is untouched.
     CSS-driven (css/scenes/cocktail.css) and removed with the scene. */
  if (!ctx.reducedMotion) {
    const sheen = onGlass(document.createElement("span"));
    sheen.className = "ck-sheen";
    sheen.setAttribute("aria-hidden", "true");
    ctx.frame.appendChild(sheen);
    if (ctx.signal) {
      ctx.signal.addEventListener(
        "abort",
        function () {
          if (sheen.parentNode) sheen.parentNode.removeChild(sheen);
        },
        { once: true }
      );
    }
  }
}

/* -------------------------------------------------------------- interaction */

function armTouch(ctx) {
  const fx = kit.use(ctx);

  /* A real <button>, so the gesture is keyboard-reachable and announced. Covers the
     mirror head with >= 64 design px of slop around the glass; the cutout is mostly
     transparent, so touching "near" the mirror has to count. */
  const hit = document.createElement("button");
  hit.type = "button";
  hit.className = "ck-hit";
  hit.setAttribute("aria-label", "Touch the mirror");
  hit.style.setProperty("--x", HIT.x + "px");
  hit.style.setProperty("--y", HIT.y + "px");
  hit.style.setProperty("--w", HIT.w + "px");
  hit.style.setProperty("--h", HIT.h + "px");
  ctx.frame.appendChild(hit);

  /* the answer: a bloom inside the glass (behind the candles, like light in the panel)
     and a ring breaking out of it (in front of everything, like light in the room) */
  const bloom = onGlass(document.createElement("span"));
  bloom.className = "ck-bloom";
  bloom.setAttribute("aria-hidden", "true");
  ctx.frame.appendChild(bloom);

  const ring = document.createElement("span");
  ring.className = "ck-ring";
  ring.setAttribute("aria-hidden", "true");
  ring.style.setProperty("--x", TOUCH_AT[0] + "px");
  ring.style.setProperty("--y", TOUCH_AT[1] + "px");
  ctx.frame.appendChild(ring);

  /* The pill sits on the band of open navy between the invitation copy and the
     couple: the dress-code line now runs to y1131 and the mirror's gilt crown starts
     at y1166, so the old spot (TOUCH_AT[0], 1120) printed the chip straight through
     "Dress Code: Glam & Glitter". Right of the mirror (x <= 433) and above the couple
     (y >= 1289) is the one clear plate on this slide; below the glass are the candles
     and the flower bank. */
  const tip = fx.hint({
    designX: TOUCH_AT[0],
    designY: TOUCH_AT[1],
    type: "tap",
    labelAt: [700, 1225]
  });

  const onTouch = function () {
    if (!state || state.answered || !ctx.isActive()) return;
    state.answered = true;
    hit.disabled = true;
    tip.done();

    const finish = function () {
      if (ctx.isActive()) ctx.complete();
    };

    if (ctx.reducedMotion) {
      finish();
      return;
    }

    fx.play(
      bloom,
      [
        { opacity: 0, offset: 0 },
        { opacity: 0.88, offset: 0.26 },
        { opacity: 0.5, offset: 0.6 },
        { opacity: 0, offset: 1 }
      ],
      { duration: TOUCH_MS, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)" }
    );

    fx.play(
      ring,
      [
        { opacity: 0, transform: "scale(0.3)", offset: 0 },
        { opacity: 0.95, offset: 0.24 },
        { opacity: 0, transform: "scale(1.75)", offset: 1 }
      ],
      { duration: TOUCH_MS, easing: "cubic-bezier(0.16, 0.8, 0.3, 1)" }
    );

    state.timer = setTimeout(finish, TOUCH_MS - 40);
  };

  ctx.on(hit, "click", onTouch);

  return function teardown() {
    clearTimeout(state && state.timer);
    [hit, bloom, ring].forEach(function (node) {
      if (node.parentNode) node.parentNode.removeChild(node);
    });
  };
}

/* ------------------------------------------------- forward: "cocktail-mirror" */

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

/** A flat sheet of light over `parent`, resting invisible. Solid colour only — no
 *  gradient, no children, no border: that is what keeps it a solid-colour layer. */
function makeSheet(parent, cls, tint, z) {
  if (!parent) return null;
  const s = document.createElement("div");
  s.className = cls;
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

/**
 * Night into day, through the glass.
 *
 * kit.frameZoom dollies the outgoing scene into the reflection — composed on top of the
 * engine's layout matrix, so the push-in is expressed in design coordinates and survives
 * a resize mid-transition. A radial flash centred on the same point blooms the navy out
 * to white, and the haldi morning settles out of that light.
 *
 * Nothing here animates `filter`. The dive's own lift rides on .ck-dive, the arrival's
 * on .ck-bloom-in — two flat sheets, no backing store between them (kit.js rule 6).
 */
kit.defineTransition("cocktail-mirror", function (fromEl, toEl, done, meta) {
  if (meta.reducedMotion || !fromEl) return crossfade(fromEl, toEl, done);

  const anims = [];
  const nodes = [];
  let zoom = null;
  let flash = null;

  fromEl.style.zIndex = "2";

  zoom = kit.frameZoom(fromEl, {
    scale: 2.1,
    originDesign: ZOOM_FROM,
    dur: ZOOM_MS,
    easing: "cubic-bezier(0.42, 0, 0.28, 1)"
  });

  /* light pouring out of the panel — geometric chrome, inside the frame so it is carried
     by the same dolly */
  const frame = fromEl.querySelector(".scene__frame");
  if (frame) {
    flash = document.createElement("span");
    flash.className = "ck-flash";
    flash.setAttribute("aria-hidden", "true");
    flash.style.setProperty("--x", GLASS_MID[0] + "px");
    flash.style.setProperty("--y", GLASS_MID[1] + "px");
    frame.appendChild(flash);
    nodes.push(flash);
    anims.push(
      flash.animate(
        [
          { opacity: 0, offset: 0 },
          { opacity: 0.22, offset: 0.44 },
          { opacity: 0.95, offset: 0.84 },
          { opacity: 0.7, offset: 1 }
        ],
        { duration: ZOOM_MS, easing: "cubic-bezier(0.5, 0, 0.8, 0.6)", fill: "forwards" }
      )
    );

    /* the room's own lift, in place of brightness(1.5) on the frame. Inside the frame
       so the dolly carries it, at 474 — over every artwork layer, immediately under
       .ck-flash (475), which is the hot core and has to stay on top of this wash. */
    const dive = makeSheet(frame, "ck-dive", DIVE_TINT, "474");
    if (dive) {
      nodes.push(dive);
      anims.push(
        dive.animate(
          [
            { opacity: 0, offset: 0 },
            { opacity: DIVE_A * 0.55, offset: 0.6 },
            { opacity: DIVE_A, offset: 1 }
          ],
          { duration: ZOOM_MS, easing: "cubic-bezier(0.42, 0, 0.28, 1)", fill: "forwards" }
        )
      );
    }
  }

  /* the scene element only dissolves — the push-in lives on its frame */
  anims.push(
    fromEl.animate(
      [
        { opacity: 1, offset: 0 },
        { opacity: 1, offset: 0.52 },
        { opacity: 0, offset: 1 }
      ],
      { duration: ZOOM_MS, easing: "cubic-bezier(0.5, 0, 0.75, 0.5)", fill: "forwards" }
    )
  );

  /* the morning settles out of that light. The sheet rides INSIDE toEl, so the scene's
     own opacity ramp fades it in exactly as it used to fade in the filter. */
  toEl.style.zIndex = "1";
  const bloomIn = makeSheet(toEl, "ck-bloom-in", ARRIVE_TINT, "600");
  if (bloomIn) {
    nodes.push(bloomIn);
    anims.push(
      bloomIn.animate(
        [
          { opacity: ARRIVE_A, offset: 0 },
          { opacity: ARRIVE_A * 0.51, offset: 0.66 },
          { opacity: 0, offset: 1 }
        ],
        { duration: ZOOM_MS, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)", fill: "backwards" }
      )
    );
  }
  anims.push(
    toEl.animate(
      [
        { opacity: 0, transform: "scale(1.05)", offset: 0 },
        { opacity: 0.5, offset: 0.66 },
        { opacity: 1, transform: "scale(1)", offset: 1 }
      ],
      { duration: ZOOM_MS, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)", fill: "backwards" }
    )
  );

  const timer = setTimeout(done, ZOOM_MS);

  return function cleanup() {
    clearTimeout(timer);
    anims.forEach(function (a) {
      if (a) {
        try {
          a.cancel();
        } catch (e) {}
      }
    });
    if (zoom) zoom.cancel(); /* restores the layout matrix exactly */
    nodes.forEach(function (n) {
      if (n && n.parentNode) n.parentNode.removeChild(n);
    });
    fromEl.style.zIndex = "";
    toEl.style.zIndex = "";
  };
});

/* ------------------------------------------------------------------ module */

kit.defineScene("cocktail", {
  forward: "cocktail-mirror",

  enter: function (ctx) {
    /* the invitation copy, rebuilt from data/textspec.json on every entry */
    text.mount(ctx);
    state = { answered: false, timer: 0 };
    /* revisit: nothing a previous visit left may survive — no baked pose, no orphan
       chrome, and no will-change pinned on the frame by the dolly */
    ctx.layers().forEach(function (el) {
      el.style.removeProperty("transform");
      el.style.removeProperty("rotate");
      el.style.removeProperty("opacity");
      el.style.removeProperty("filter");
      el.style.removeProperty("will-change");
    });
    ctx.frame.style.removeProperty("will-change");
    ctx.el.querySelectorAll(".ck-sheen, .ck-flash, .ck-bloom, .ck-ring, .ck-dive, .ck-bloom-in").forEach(function (n) {
      n.parentNode.removeChild(n);
    });
  },

  armInteraction: armTouch,

  /* the entry cascade owns `transform` until it finishes, so the copy's reveal and
     the ambient loops both start at idle */
  idle: function (ctx) {
    text.reveal(ctx); /* before the ambient guards — the copy always shows */
    if (!state || state.answered) return;
    startAmbient(ctx);
  }
});
