/* wedding.js — scene 6 of 7. "Shower them with blessings."
 *
 * ART        base (mandap, filigree arches, drape, lawn) + four hanging floral strings
 *            on the left tree, four ceiling chandeliers, two chandeliers hung in the
 *            arches, the cheval mirror (with its baked reflection), the vases /
 *            candelabra / rose bowl, and the couple.
 * AMBIENT    the strings sway, every chandelier swings on its own slow period, the two
 *            in the arches breathe light, the couple stand and settle, and once in a
 *            while the light walks across the mirror glass. The BASE never moves.
 * SIGNATURE  bless the couple: ONE tap over them and the whole blessing runs itself —
 *            rose petals fall across the two of them, a warm glow gathers, and the ring
 *            on the canopy fills smoothly to full over 1.4s. Nothing is accumulated
 *            across taps and nothing can be half-done: the first tap latches, every one
 *            after it is ignored, and the guest simply watches. Full ring: the shower
 *            lifts, blooms, and the palace opens.
 * FORWARD    "wedding-petals" — the petals swirl up through a white-gold bloom and the
 *            last scene settles back out of it.
 *
 * PETAL SPRITES
 *   assets/fx/petal-1..3.webp are CROPS of this template's own wedding artwork
 *   (qa/ref/wedding.png, which is the 1080x1920 PSD render, so crop boxes are design
 *   px), upscaled and given a soft alpha derived from each crop's own background:
 *     petal-1  design (683,1289)-(701,1307)   the stray magenta bloom above the bouquet
 *     petal-2  design (105,1757)-(137,1787)   a loose rose petal on the lawn
 *     petal-3  design (1018,1289)-(1040,1311) a coral rose from the mirror's garland
 *   Nothing here is drawn, generated or fetched — every pixel comes from the PSD.
 *
 * Owns exactly: this file + css/scenes/wedding.css (+ the three derived sprites).
 */

import * as kit from "../fx/kit.js?v=8";
import * as text from "../fx/text.js?v=5";

/* ------------------------------------------------------- design-space anchors */

const COUPLE = { x: 285, y: 1353, w: 337, h: 538 };
const CX = COUPLE.x + COUPLE.w / 2; /* 453.5 */

/* the tap target covers the couple and the air just above them, where the petals
   come from — the cutout is mostly transparent, so "near them" has to count */
const HIT = { x: 213, y: 1205, w: 481, h: 700 };
const RING = { x: 453, y: 1236 }; /* hint + blessing ring, on the canopy above their heads */

/* the mirror's glass, inset from the gilt frame (mirror layer sits at 760,1240) */
const GLASS = { x: 904, y: 1312, w: 112, h: 292 };

/* ---- the blessing ---------------------------------------------------------
 * The tap starts a fixed 1.4s run: progress ramps at 1/BLESS_MS per ms, the ring is
 * painted straight off it (no glide to ease — there are no discrete steps left to
 * absorb), and the glow rises with it. There is nothing to accumulate and nothing to
 * decay: one tap is the whole blessing, and the scene's own enter() is the reset. */
const BLESS_MS = 1400;
const TAP_BURST = [4, 6]; /* petals released the instant the tap lands */
const GLOW_MAX = 0.42; /* the warmth gathered at a full ring */
/* rAF stops in a hidden tab. Without this clamp the first frame back would bill the
   whole absence to the ramp and finish the blessing while nobody was looking. */
const FRAME_MAX_MS = 64;

const SPAWN_MS = 110;
const PETAL_MAX = 16;
const SWIRL_MS = 860;
const BLOOM_MS = 420;
const PETALS_MS = 1400;
const FADE_MS = 400;

/* ---- the bloom, in two BOUNDED pieces -------------------------------------
 *
 * Same rebuild as the haldi wash, for the same reason and the same measurement. This
 * was one 3000x3000 design-px disc scaled out to 1.575: a 3250x3250 compositor
 * surface on a 390px iPhone at dpr 3 (40MB), or ~100MB if the compositor rasters at
 * the animation's peak scale — the single biggest allocation left in the invitation
 * once haldi was fixed, and the next scene that would have killed the tab.
 *
 * Two rules, as in haldi: no node is bigger than the frame it has to cover, and
 * nothing scales above 1.
 *
 *   DISC (.wd-bloom)       the light the blessing lets go: a 2 x BLOOM_R box on the
 *                          couple, growing 0.355 -> 1. Alpha 0 lands at 0.78 x 930 =
 *                          725 design px — where the old disc's did at the end of the
 *                          scene's own bloom, so that beat is unchanged.
 *   FIELD (.wd-bloom-field) the pull-back's light. The visible frame band only, the
 *                          same stops resolved at the radius the old disc reached at
 *                          its peak (0.78 x 2363 = 1843 design px), on opacity alone.
 */
const BLOOM_R = 930; /* disc radius in design px — the box is twice this */
const BLOOM_S0 = 0.355; /* the scene's bloom starts here... */
const BLOOM_A0 = 0.5;
const BLOOM_A1 = 0.92;
const BLOOM_C = [CX, 1560];
const BLOOM_STOPS =
  " rgba(255, 252, 244, 0.98) 0%," +
  " rgba(255, 240, 210, 0.9) 28%," +
  " rgba(240, 214, 158, 0.5) 54%," +
  " rgba(226, 190, 128, 0) 78%";
const BLOOM_GRADIENT = "radial-gradient(circle at 50% 50%," + BLOOM_STOPS + ")";

/* the visible design band, generously oversized on every side */
const BFIELD = { x: -140, y: -340, w: 1360, h: 2700 };
const BFIELD_R = 2363; /* 0.78 x this = 1843 = where the old disc's light ended up */

/* The field's stops are the disc's, LIFTED. The old driver ran this beat underneath
   animated `filter: brightness()` on BOTH scene elements (1 -> 1.16 leaving, 1.28 -> 1
   arriving), so the light the guest saw at the peak was ~12% brighter and whiter than
   these numbers. Baked in here, on the one node that carries the flood, instead of
   paid for with two full-scene filter snapshots. The disc keeps the unlifted stops:
   the scene's own bloom never had the filter over it. */
const BFIELD_STOPS =
  " rgba(255, 255, 255, 0.98) 0%," +
  " rgba(255, 255, 235, 0.9) 28%," +
  " rgba(255, 240, 177, 0.5) 54%," +
  " rgba(253, 213, 143, 0) 78%";
const BFIELD_GRADIENT =
  "radial-gradient(circle " +
  BFIELD_R +
  "px at " +
  (BLOOM_C[0] - BFIELD.x) +
  "px " +
  (BLOOM_C[1] - BFIELD.y) +
  "px," +
  BFIELD_STOPS +
  ")";

/* the three derived crops, at their natural size in design px */
const SPRITES = [
  { src: "assets/fx/petal-1.webp", w: 32, h: 22 },
  { src: "assets/fx/petal-2.webp", w: 35, h: 36 },
  { src: "assets/fx/petal-3.webp", w: 34, h: 38 }
];

let state = null;

/* ---------------------------------------------------------------- ambient */

/* the floral strings hang off the tree at the top-left: they pivot where they are tied */
const STRINGS = [
  { id: "string-1", deg: 2, dur: 5200, phase: 0 },
  { id: "string-2", deg: -2, dur: 6000, phase: 0.28 },
  { id: "string-3", deg: 2, dur: 5600, phase: 0.56 },
  { id: "string-4", deg: -2, dur: 6400, phase: 0.84 }
];

/* ceiling chandeliers: heavy, so slow and barely there */
const CHANDELIERS = [
  { id: "chandelier-1", deg: 1, dur: 6400, phase: 0.1 },
  { id: "chandelier-2", deg: -1, dur: 7200, phase: 0.38 },
  { id: "chandelier-3", deg: 1, dur: 6800, phase: 0.62 },
  { id: "chandelier-4", deg: -1, dur: 7600, phase: 0.88 }
];

/* the two hung in the arches are smaller and lit — they swing a little more and breathe */
const ARCH_CHANDELIERS = [
  { id: "arch-chandelier-1", deg: 1.5, dur: 5600, phase: 0.16 },
  { id: "arch-chandelier-2", deg: -1.5, dur: 6200, phase: 0.54 }
];

function startAmbient(ctx) {
  const fx = kit.use(ctx);

  STRINGS.forEach(function (s) {
    fx.sway(ctx.layer(s.id), { deg: s.deg, dur: s.dur, origin: "50% 0%", phase: s.phase });
  });

  CHANDELIERS.forEach(function (c) {
    fx.pendulum(ctx.layer(c.id), { deg: c.deg, dur: c.dur, phase: c.phase });
  });

  ARCH_CHANDELIERS.forEach(function (c) {
    const el = ctx.layer(c.id);
    fx.pendulum(el, { deg: c.deg, dur: c.dur, phase: c.phase });
    /* opacity + brightness, so it composes with the pendulum's `transform` instead of
       fighting it — crystal catching the afternoon */
    fx.glowPulse(el, { from: 0.93, to: 1, brightness: 1.14, dur: 3400, jitter: 0.3 });
  });

  state.bob = fx.bob(ctx.layer("couple"), { px: 2, dur: 3900 });

  /* light walking across the glass, once every eight seconds or so. Both ends of the
     loop are fully transparent, so the mirror's resting frame is the PSD frame. */
  if (!ctx.reducedMotion) {
    const sheen = document.createElement("span");
    sheen.className = "wd-fx wd-sheen";
    sheen.setAttribute("aria-hidden", "true");
    sheen.style.setProperty("--x", GLASS.x + "px");
    sheen.style.setProperty("--y", GLASS.y + "px");
    sheen.style.setProperty("--w", GLASS.w + "px");
    sheen.style.setProperty("--h", GLASS.h + "px");
    const streak = document.createElement("span");
    streak.className = "wd-sheen__streak";
    sheen.appendChild(streak);
    ctx.frame.appendChild(sheen);
    fx.play(
      streak,
      [
        { transform: "translate3d(-220%, 0, 0) rotate(14deg)", opacity: 0, offset: 0 },
        { transform: "translate3d(-160%, 0, 0) rotate(14deg)", opacity: 0, offset: 0.06 },
        { transform: "translate3d(-20%, 0, 0) rotate(14deg)", opacity: 0.4, offset: 0.14 },
        { transform: "translate3d(180%, 0, 0) rotate(14deg)", opacity: 0.34, offset: 0.22 },
        { transform: "translate3d(340%, 0, 0) rotate(14deg)", opacity: 0, offset: 0.3 },
        { transform: "translate3d(340%, 0, 0) rotate(14deg)", opacity: 0, offset: 1 }
      ],
      { duration: 8200, iterations: Infinity, easing: "linear" }
    );
  }
}

/* ----------------------------------------------------------------- petals */

function rand(a, b) {
  return a + Math.random() * (b - a);
}

/** Keep every hand-rolled animation, so leaving the scene cancels the lot. */
function track(anim) {
  if (!anim || !state) return anim;
  state.anims.push(anim);
  const drop = function () {
    const i = state ? state.anims.indexOf(anim) : -1;
    if (i >= 0) state.anims.splice(i, 1);
  };
  if (anim.finished && typeof anim.finished.then === "function") {
    anim.finished.then(drop, drop);
  }
  return anim;
}

function currentTransform(el) {
  const t = getComputedStyle(el).transform;
  return !t || t === "none" ? "translate3d(0,0,0)" : t;
}

/**
 * One petal, falling over the couple.
 *
 * Two nested elements so two motions can run at once without either owning the other's
 * `transform`: the wrapper carries the fall + drift, the <img> inside carries the spin.
 * Everything is transform/opacity; the sprite itself is a crop of the PSD.
 */
function dropPetal(ctx) {
  if (!state || state.petals.length >= PETAL_MAX) return;
  const sprite = SPRITES[Math.floor(Math.random() * SPRITES.length)];
  const scale = rand(0.85, 1.45);

  const wrap = document.createElement("span");
  wrap.className = "wd-fx wd-petal";
  wrap.style.setProperty("--x", rand(COUPLE.x + 10, COUPLE.x + COUPLE.w - 10).toFixed(1) + "px");
  wrap.style.setProperty("--y", rand(1140, 1235).toFixed(1) + "px");

  const img = document.createElement("img");
  img.className = "wd-petal__img";
  img.src = sprite.src;
  img.alt = "";
  img.decoding = "async";
  img.draggable = false;
  img.style.setProperty("--w", (sprite.w * scale).toFixed(1) + "px");
  img.style.setProperty("--h", (sprite.h * scale).toFixed(1) + "px");
  wrap.appendChild(img);
  ctx.frame.appendChild(wrap);

  const petal = { wrap: wrap, img: img, fall: null, spin: null, gone: false };
  state.petals.push(petal);

  const remove = function () {
    if (petal.gone) return;
    petal.gone = true;
    const i = state ? state.petals.indexOf(petal) : -1;
    if (i >= 0) state.petals.splice(i, 1);
    if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
  };
  petal.remove = remove;

  if (ctx.reducedMotion) {
    /* rule 4: the gesture still works, the particles do not */
    remove();
    return;
  }

  /* a sampled fall: gravity on Y, a slow S on X — a petal, not a falling brick */
  const dist = rand(520, 760);
  const swayA = rand(18, 54) * (Math.random() < 0.5 ? -1 : 1);
  const swayN = rand(1.2, 2.4);
  const phase = Math.random() * Math.PI * 2;
  const steps = 10;
  const path = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const y = dist * (0.55 * t + 0.45 * t * t); /* a petal, easing gently into the fall */
    const x = swayA * Math.sin(phase + t * Math.PI * swayN);
    path.push({
      offset: t,
      transform: "translate3d(" + x.toFixed(1) + "px," + y.toFixed(1) + "px,0)"
    });
  }
  const dur = Math.round(rand(1700, 2700));
  petal.fall = track(wrap.animate(path, { duration: dur, easing: "linear", fill: "forwards" }));
  track(
    wrap.animate(
      [
        { opacity: 0, offset: 0 },
        { opacity: 1, offset: 0.1 },
        { opacity: 1, offset: 0.74 },
        { opacity: 0, offset: 1 }
      ],
      { duration: dur, easing: "linear", fill: "forwards" }
    )
  );

  const spin0 = rand(-40, 40);
  petal.spin = track(
    img.animate(
      [
        { transform: "rotate(" + spin0.toFixed(1) + "deg)" },
        { transform: "rotate(" + (spin0 + rand(-200, 200)).toFixed(1) + "deg)" }
      ],
      { duration: dur, easing: "linear", fill: "forwards" }
    )
  );

  if (petal.fall && petal.fall.finished && typeof petal.fall.finished.then === "function") {
    petal.fall.finished.then(remove, function () {});
  }
}

/** Everything still in the air lifts, turns and dissolves into the bloom. */
function swirlPetals(ctx) {
  state.petals.slice().forEach(function (petal) {
    const wrap = petal.wrap;
    const img = petal.img;
    /* read the live pose FIRST — cancelling reverts the computed value to identity */
    const base = currentTransform(wrap);
    const spun = currentTransform(img);
    const alpha = parseFloat(getComputedStyle(wrap).opacity) || 0;
    state.anims.forEach(function (a) {
      if (a.effect && (a.effect.target === wrap || a.effect.target === img)) {
        try {
          a.cancel();
        } catch (e) {}
      }
    });

    const dx = rand(-70, 70);
    const rise = rand(240, 380);
    const lift = track(
      wrap.animate(
        [
          { transform: base, opacity: alpha, offset: 0 },
          {
            transform: base + " translate3d(" + (dx * 0.35).toFixed(1) + "px," + (-rise * 0.45).toFixed(1) + "px,0) scale(1.1)",
            opacity: Math.min(1, alpha + 0.1),
            offset: 0.45
          },
          {
            transform: base + " translate3d(" + dx.toFixed(1) + "px," + (-rise).toFixed(1) + "px,0) scale(1.22)",
            opacity: 0,
            offset: 1
          }
        ],
        { duration: SWIRL_MS, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)", fill: "forwards" }
      )
    );
    track(
      img.animate([{ transform: spun }, { transform: spun + " rotate(" + rand(-150, 150).toFixed(1) + "deg)" }], {
        duration: SWIRL_MS,
        easing: "cubic-bezier(0.33, 1, 0.68, 1)",
        fill: "forwards"
      })
    );
    if (lift && lift.finished && typeof lift.finished.then === "function") {
      lift.finished.then(petal.remove, function () {});
    }
  });
}

/* ------------------------------------------------------------------- bloom */

/** The white-gold bloom, centred over the couple. Styled inline because the transition
 *  builds the very same object from a scene that is already leaving.
 *
 *  No `will-change`: a WAAPI transform/opacity animation composites on its own (kit.js
 *  rule 5), and pinning a layer on a node this size is what makes it dangerous. */
function makeBloom(frame) {
  const b = document.createElement("div");
  b.className = "wd-fx wd-bloom";
  b.style.position = "absolute";
  b.style.left = BLOOM_C[0] - BLOOM_R + "px";
  b.style.top = BLOOM_C[1] - BLOOM_R + "px";
  b.style.width = BLOOM_R * 2 + "px";
  b.style.height = BLOOM_R * 2 + "px";
  b.style.zIndex = "250"; /* over every layer, UNDER the petals so the swirl stays in it */
  b.style.borderRadius = "50%";
  b.style.background = BLOOM_GRADIENT;
  b.style.opacity = "0";
  b.style.pointerEvents = "none";
  frame.appendChild(b);
  return b;
}

/** The pull-back's light: the visible band of the frame, on OPACITY ALONE. Never
 *  transformed, so its backing store is exactly its own box. */
function makeBloomField(frame) {
  const f = document.createElement("div");
  f.className = "wd-fx wd-bloom-field";
  f.style.position = "absolute";
  f.style.left = BFIELD.x + "px";
  f.style.top = BFIELD.y + "px";
  f.style.width = BFIELD.w + "px";
  f.style.height = BFIELD.h + "px";
  f.style.zIndex = "249"; /* under the disc, over every layer */
  f.style.background = BFIELD_GRADIENT;
  f.style.opacity = "0";
  f.style.pointerEvents = "none";
  frame.appendChild(f);
  return f;
}

/** A flat sheet of warm light over the ARRIVING scene, fading off — in place of the
 *  `filter: brightness()` this transition used to animate on a whole .scene element
 *  (which snapshots every layer under it at device resolution, for both scenes at
 *  once). A solid colour costs the compositor nothing. */
function makeBloomIn(el) {
  const b = document.createElement("div");
  b.className = "wd-bloom-in";
  b.setAttribute("aria-hidden", "true");
  b.style.position = "absolute";
  b.style.inset = "0";
  b.style.zIndex = "600";
  b.style.background = "#fff6e6";
  b.style.opacity = "0";
  b.style.pointerEvents = "none";
  el.appendChild(b);
  return b;
}

/* -------------------------------------------------------------- interaction */

function armTap(ctx) {
  const fx = kit.use(ctx);
  const reduced = ctx.reducedMotion;

  const hit = document.createElement("button");
  hit.type = "button";
  hit.className = "wd-fx wd-hit";
  hit.setAttribute("aria-label", "Tap to shower Nandini and Shubham with blessings");
  hit.style.setProperty("--x", HIT.x + "px");
  hit.style.setProperty("--y", HIT.y + "px");
  hit.style.setProperty("--w", HIT.w + "px");
  hit.style.setProperty("--h", HIT.h + "px");
  ctx.frame.appendChild(hit);

  /* the pill goes just above the ring, onto the open sky beside the mandap roof —
     below the ring are the couple's heads, and the ring takes that spot the moment
     the tap lands */
  const tip = fx.hint({
    designX: RING.x,
    designY: RING.y,
    type: "tap",
    labelAt: [560, 1058]
  });

  /* the blessing made visible: a ring with a core that fills it. Geometric light only. */
  let ring = null;
  let fill = null;
  let glow = null;
  if (!reduced) {
    ring = document.createElement("span");
    ring.className = "wd-fx wd-hold";
    ring.setAttribute("aria-hidden", "true");
    ring.style.setProperty("--x", RING.x + "px");
    ring.style.setProperty("--y", RING.y + "px");
    const edge = document.createElement("span");
    edge.className = "wd-hold__ring";
    fill = document.createElement("span");
    fill.className = "wd-hold__fill";
    ring.appendChild(edge);
    ring.appendChild(fill);
    ctx.frame.appendChild(ring);

    glow = document.createElement("span");
    glow.className = "wd-fx wd-glow";
    glow.setAttribute("aria-hidden", "true");
    ctx.frame.appendChild(glow);
  }

  let running = false; /* the tap latch: true from the first tap until finish() */
  let last = 0; /* the previous frame's timestamp */

  /* The ring is scrubbed imperatively rather than through WAAPI: nothing else has to
     stay in step with it, and a hand-rolled ramp is one value read in one place — no
     keyframes to rebuild, and the hidden-tab clamp lands in the same line as the ramp. */

  function paint() {
    if (fill) fill.style.transform = "scale(" + (0.12 + 0.88 * state.progress).toFixed(4) + ")";
    if (glow) glow.style.opacity = (GLOW_MAX * state.progress).toFixed(4);
  }

  function stopMeter() {
    if (state.meter) cancelAnimationFrame(state.meter);
    state.meter = 0;
    last = 0;
    if (fill) fill.style.removeProperty("will-change"); /* rule 5 — only while scrubbing */
  }

  function tick(t) {
    const dt = last ? Math.min(FRAME_MAX_MS, Math.max(0, t - last)) : 0;
    last = t;

    state.progress = Math.min(1, state.progress + dt / BLESS_MS);
    paint();

    if (state.progress >= 1) {
      finish();
      return;
    }
    state.meter = requestAnimationFrame(tick);
  }

  function finish() {
    if (!state || state.done || !ctx.isActive()) return;
    state.done = true;
    clearInterval(state.spawn);
    state.spawn = 0;
    running = false;

    /* the ring lands full, and the whole blessing chrome then lets go into the bloom */
    state.progress = 1;
    if (fill) fill.style.transform = "scale(1)";
    stopMeter();
    if (ring) ring.classList.remove("is-on");
    if (glow) glow.style.opacity = "0";
    hit.disabled = true;

    const go = function () {
      if (ctx.isActive()) ctx.complete();
    };

    if (reduced) {
      go();
      return;
    }

    swirlPetals(ctx);
    /* 0.355 -> 1 of a 930px radius is 330 -> 930 design px of light: the same sweep
       the old 0.22 -> 0.62 of a 1500px radius drew, off a third of the surface. */
    const bloom = makeBloom(ctx.frame);
    track(
      bloom.animate(
        [
          { transform: "scale(" + BLOOM_S0 + ")", opacity: 0 },
          { transform: "scale(1)", opacity: BLOOM_A0 }
        ],
        { duration: BLOOM_MS, easing: "cubic-bezier(0.33, 1, 0.68, 1)", fill: "forwards" }
      )
    );
    state.timer = setTimeout(go, BLOOM_MS);
  }

  /**
   * One tap runs the whole blessing.
   *
   * `running`, `state.done` and the disabled button are three independent latches, so a
   * double- or triple-tap — and a long press, which is still just one click on release —
   * can only ever start this once. The same handler serves the keyboard: Enter and Space
   * on the focused button raise a click like any other.
   */
  function bless() {
    if (!state || state.done || running || !ctx.isActive()) return;
    running = true;
    hit.disabled = true;
    tip.done();

    if (reduced) {
      /* rule 4: no petals, no ramp — the blessing still lands, it just does not linger */
      finish();
      return;
    }

    /* a burst the instant the tap lands, so the shower starts on the same frame */
    const burst = Math.round(rand(TAP_BURST[0], TAP_BURST[1]));
    for (let i = 0; i < burst; i += 1) dropPetal(ctx);
    state.spawn = setInterval(function () {
      if (running) dropPetal(ctx);
    }, SPAWN_MS);

    if (ring) ring.classList.add("is-on");
    if (fill) fill.style.willChange = "transform"; /* rule 5: only while scrubbing */
    state.meter = requestAnimationFrame(tick);
  }

  ctx.on(hit, "click", bless);

  /* iOS Safari answers a STATIONARY long-press with its own callout / magnifier. The
     callout is refused twice: in CSS (-webkit-touch-callout on the stage subtree) and
     here, on this element alone — a guest who rests a finger on the couple out of old
     habit must still get a plain tap out of it. */
  ctx.on(
    hit,
    "contextmenu",
    function (e) {
      e.preventDefault();
    },
    { passive: false } /* ctx.on passes { passive: true }, which may not preventDefault */
  );

  return function teardown() {
    stopMeter();
    clearTimeout(state.timer);
    clearInterval(state.spawn);
    state.anims.splice(0).forEach(function (a) {
      try {
        a.cancel();
      } catch (e) {}
    });
    state.petals.length = 0;
    ctx.frame.querySelectorAll(".wd-fx").forEach(function (n) {
      n.parentNode.removeChild(n);
    });
  };
}

/* ------------------------------------------------ forward: "wedding-petals" */

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

/** A last handful of petals turning up through the bloom, and the palace settling back
 *  out of the light — the camera pulls away rather than pushing in. */
kit.defineTransition("wedding-petals", function (fromEl, toEl, done, meta) {
  if (meta.reducedMotion || !fromEl) return crossfade(fromEl, toEl, done);

  const frame = fromEl.querySelector(".scene__frame");
  const anims = [];
  const nodes = [];

  if (frame) {
    /* the light spreads on the FIELD's opacity — its outer stops are faint, so they
       cross the visible threshold late and the light still reaches the corners last */
    const bfield = makeBloomField(frame);
    nodes.push(bfield);
    anims.push(
      bfield.animate(
        [
          { opacity: 0, offset: 0 },
          { opacity: 0.3, offset: 0.28 },
          { opacity: 0.82, offset: 0.56 },
          { opacity: BLOOM_A1, offset: 0.78 },
          { opacity: 0.84, offset: 1 }
        ],
        { duration: PETALS_MS, easing: "cubic-bezier(0.33, 1, 0.68, 1)", fill: "forwards" }
      )
    );

    /* the bloom the scene lit, picked up at the exact pose it was left on. It holds
       there and lets go into the field, so the centre never doubles up on itself. */
    const bloom = makeBloom(frame);
    nodes.push(bloom);
    anims.push(
      bloom.animate(
        [
          { transform: "scale(1)", opacity: BLOOM_A0, offset: 0 },
          { transform: "scale(1)", opacity: 0.68, offset: 0.4 },
          { transform: "scale(1)", opacity: 0.32, offset: 0.78 },
          { transform: "scale(1)", opacity: 0.12, offset: 1 }
        ],
        { duration: PETALS_MS, easing: "cubic-bezier(0.33, 1, 0.68, 1)", fill: "forwards" }
      )
    );

    for (let i = 0; i < 10; i += 1) {
      const sprite = SPRITES[i % SPRITES.length];
      const scale = rand(0.7, 1.25);
      const wrap = document.createElement("span");
      wrap.className = "wd-petal";
      wrap.style.setProperty("--x", rand(160, 900).toFixed(1) + "px");
      wrap.style.setProperty("--y", rand(1420, 1820).toFixed(1) + "px");
      const img = document.createElement("img");
      img.className = "wd-petal__img";
      img.src = sprite.src;
      img.alt = "";
      img.decoding = "async";
      img.draggable = false;
      img.style.setProperty("--w", (sprite.w * scale).toFixed(1) + "px");
      img.style.setProperty("--h", (sprite.h * scale).toFixed(1) + "px");
      wrap.appendChild(img);
      frame.appendChild(wrap);
      nodes.push(wrap);

      const dx = rand(-90, 90);
      const rise = rand(420, 760);
      const delay = Math.round(rand(0, 260));
      anims.push(
        wrap.animate(
          [
            { transform: "translate3d(0,0,0) scale(0.9)", opacity: 0, offset: 0 },
            {
              transform: "translate3d(" + (dx * 0.4).toFixed(1) + "px," + (-rise * 0.35).toFixed(1) + "px,0) scale(1.05)",
              opacity: 0.95,
              offset: 0.3
            },
            {
              transform: "translate3d(" + dx.toFixed(1) + "px," + (-rise).toFixed(1) + "px,0) scale(1.2)",
              opacity: 0,
              offset: 1
            }
          ],
          {
            duration: PETALS_MS - delay,
            delay: delay,
            easing: "cubic-bezier(0.22, 0.61, 0.36, 1)",
            fill: "backwards"
          }
        )
      );
      anims.push(
        img.animate(
          [{ transform: "rotate(0deg)" }, { transform: "rotate(" + rand(-220, 220).toFixed(1) + "deg)" }],
          { duration: PETALS_MS, easing: "linear" }
        )
      );
    }
  }

  /* opacity only. An animated `brightness()` on a whole .scene forces a full-scene
     filter snapshot at device resolution for as long as it runs, and this driver used
     to ask for two of them at once. The bloom above already carries the light. */
  fromEl.style.zIndex = "2";
  anims.push(
    fromEl.animate(
      [
        { opacity: 1, offset: 0 },
        { opacity: 1, offset: 0.42 },
        { opacity: 0, offset: 0.9 },
        { opacity: 0, offset: 1 }
      ],
      { duration: PETALS_MS, easing: "cubic-bezier(0.5, 0, 0.75, 0.6)", fill: "forwards" }
    )
  );

  /* the grand pull-back: the palace arrives a touch too close and settles, out of a
     flat sheet of light rather than out of a filter on the whole scene */
  toEl.style.zIndex = "1";
  const bloomIn = makeBloomIn(toEl);
  nodes.push(bloomIn);
  anims.push(
    toEl.animate(
      [
        { opacity: 0, transform: "scale(1.06)", offset: 0 },
        { opacity: 0, transform: "scale(1.052)", offset: 0.3 },
        { opacity: 0.7, transform: "scale(1.024)", offset: 0.66 },
        { opacity: 1, transform: "scale(1)", offset: 1 }
      ],
      { duration: PETALS_MS, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)", fill: "backwards" }
    )
  );
  anims.push(
    bloomIn.animate(
      [
        { opacity: 0.64, offset: 0 },
        { opacity: 0.6, offset: 0.3 },
        { opacity: 0.34, offset: 0.66 },
        { opacity: 0, offset: 1 }
      ],
      { duration: PETALS_MS, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)", fill: "backwards" }
    )
  );

  const timer = setTimeout(done, PETALS_MS);

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
      if (n.parentNode) n.parentNode.removeChild(n);
    });
    fromEl.style.zIndex = "";
    toEl.style.zIndex = "";
  };
});

/* ------------------------------------------------------------------ module */

kit.defineScene("wedding", {
  forward: "wedding-petals",

  enter: function (ctx) {
    /* the invitation copy, rebuilt from data/textspec.json on every entry */
    text.mount(ctx);
    state = {
      bob: null,
      petals: [],
      anims: [],
      spawn: 0,
      progress: 0, /* the blessing's ramp, 0..1 — driven by the one tap */
      meter: 0, /* the rAF driving it, live only while the blessing is running */
      timer: 0,
      done: false
    };
    /* revisit: no petal, ring, glow or bloom may survive a previous visit, and the
       ramp starts from zero — this object is rebuilt on every entry */
    ctx.frame.querySelectorAll(".wd-fx, .wd-petal").forEach(function (n) {
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
