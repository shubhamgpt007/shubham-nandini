/* stage.js — the paged stage engine.
 *
 * Responsibilities
 *   1. LAYOUT   fit the 1080x1920 design frame into the live viewport (fit-to-width on
 *               phones, bleed-aware vertical distribution, fit-to-height on squat
 *               screens, a centred phone-column in desktop mode).
 *   2. SCENES   build one <section class="scene"> per entry in scenes.json `order`,
 *               with underlay / base / layers placed at design coordinates, plus a
 *               graceful placeholder when the data or the art is not on disk yet.
 *   3. STATE    {index, unlockedMax, transitioning} with sessionStorage persistence of
 *               unlockedMax, and the hard guarantee that the ONLY way past unlockedMax
 *               is a scene module calling ctx.complete().
 *   4. MOTION   a transition-driver registry (forward "bloom", back "fade-back" by
 *               default) plus a default staggered entry cascade, so phase-3 themed
 *               transitions plug in with zero engine edits.
 *   5. MEMORY   an image WINDOW: only the live scene and its immediate neighbours ever
 *               hold a real image `src`, so peak decoded-bitmap memory stays at "a few
 *               scenes" instead of all seven. See "image window" below.
 *
 * ---------------------------------------------------------------------------
 * SCENE MODULE CONTRACT
 *
 *   stage.register(slug, {
 *     defaultEntry: true,          // optional, default true. false = engine skips its
 *                                  //   entry cascade; animate it yourself in enter().
 *     forward: "bloom",            // optional, default "bloom". Name of the registered
 *                                  //   transition driver used when LEAVING this scene
 *                                  //   forwards.
 *     enter(ctx)          {},      // scene became active (replays on every entry)
 *     armInteraction(ctx) {},      // wire the advance gesture; may return a teardown fn
 *     idle(ctx)           {},      // entry cascade finished, scene is settled
 *     exit(ctx)           {}       // scene is leaving (ctx.signal is aborted right after)
 *   });
 *
 * Call order on activation:  enter -> armInteraction -> (settle) -> idle
 * Call order on leaving:     exit  -> teardown()      -> signal.abort()
 *
 * ctx = {
 *   slug, index, el, frame, data, stage,
 *   direction,                     // "forward" | "back" | "init" — how we got here
 *   signal,                        // AbortSignal, aborted on exit
 *   reducedMotion,                 // live boolean
 *   layer(id)  -> HTMLElement|null // by scenes.json layer id
 *   layers()   -> HTMLElement[]
 *   text(key)  -> HTMLElement|null // a data/template.json text slot
 *   on(target, type, handler, opts) // listener auto-removed on exit; passive by default
 *   isActive() -> boolean
 *   complete()                      // THE advance gate: unlocks + moves to the next scene
 * }
 *
 * ---------------------------------------------------------------------------
 * TRANSITION DRIVER CONTRACT
 *
 *   stage.registerTransition(name, function (fromEl, toEl, done, meta) {
 *     // fromEl: leaving .scene element (null on the very first mount)
 *     // toEl:   entering .scene element
 *     // done:   call exactly once when the visual handover is complete
 *     // meta:   { direction, from, to, fromSlug, toSlug, reducedMotion, duration }
 *     return function cleanup() {};   // optional — called after done()
 *   });
 *
 * Drivers must animate transform / opacity only on a .scene or .scene__frame, and must
 * never touch .scene__frame's transform directly (that carries the layout — go through
 * kit.frameZoom). NO `filter` AND NO `will-change` ON A SCENE-SIZED NODE: transform and
 * opacity are compositor properties and re-use the texture that is already there, while
 * a filter makes the engine re-render the node's whole subtree into a fresh offscreen
 * buffer every frame — and a transition always has TWO scenes live at once. Light that
 * used to come out of `filter: brightness()` comes out of a flat sheet of colour over
 * the scene instead; see bloomSheet() below.
 */

export const DESIGN_W = 1080;
export const DESIGN_H = 1920;

/* Unique per template: the sibling `muskan-shourya` uses "ms-unlocked", so both
   builds can be opened on the same origin during QA without one handing the
   other a pre-unlocked stage. */
const STORE_KEY = "db-unlocked";

/* ---------------------------------------------------------------- image window
 *
 * WHY. Every scene is built into the DOM up front and never released, so on the old
 * build all seven scenes' artwork stayed decoded for the life of the page: 220MB of
 * RGBA by the last scene (measured, 122 <img>s). iOS Safari terminates a tab well
 * inside that range — the guest saw the invitation "crash or reload" somewhere around
 * the haldi scene, which is exactly where the running total crossed the line.
 *
 * HOW. The layer URLs live in `data-src`; `src` carries a real URL only while the
 * scene is inside the window, and a 1x1 transparent GIF otherwise. The element, its
 * design-space rect, its z-order and every class a scene module put on it all survive
 * the swap untouched — only the bitmap goes. A data: URI (rather than removing `src`)
 * is deliberate: removing the attribute fires `error`, which would trip makeImage()'s
 * 404 fallback and permanently mark the scene as missing art, and `src=""` re-fetches
 * the document. The GIF is 43 bytes, costs no request, and fires `load`.
 *
 * WINDOW = 1 -> the live scene plus one either side. During a transition BOTH the
 * outgoing and the incoming scene are pinned regardless of distance, so a dot-rail
 * jump across the whole invitation still crossfades between two fully painted scenes.
 */
const BLANK_SRC =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const WINDOW = 1;
/* Hard cap on waiting for a restored scene's art to decode before it is revealed. A
   stalled decode, a 404 or a browser without img.decode() must still show the scene. */
const DECODE_CAP_MS = 2000;

/* Fallback order — used only when data/scenes.json is missing, so the engine is
   testable before the asset pipeline lands. Never overrides real data. */
const FALLBACK_ORDER = [
  "cover",
  "names",
  "mayra-mehendi",
  "cocktail",
  "haldi",
  "wedding",
  "reception",
  "last"
];

/* Layout constants. TOP_BIAS: art gravity is bottom, so surplus vertical space is
   spent mostly on sky bleed above the frame, pushing the (bottom-heavy) subject down. */
const TOP_BIAS = 0.65;
const DESKTOP_MIN_W = 768;
const DESKTOP_MIN_ASPECT = 0.75; /* wider than 3:4 */
const DESKTOP_H_RATIO = 0.94; /* max-height 94vh */
const DEVICE_ASPECT = 9 / 19.5;

/* Mirrors of the css/base.css duration tokens. */
const MOTION = {
  enter: 600,
  forward: 700,
  back: 400,
  settle: 380
};

const reduceQuery =
  typeof matchMedia === "function"
    ? matchMedia("(prefers-reduced-motion: reduce)")
    : null;

function prefersReducedMotion() {
  return !!(reduceQuery && reduceQuery.matches);
}

/* Durations collapse to "instant" under reduced motion, exactly like the CSS tokens. */
function dur(ms) {
  return prefersReducedMotion() ? 1 : ms;
}

/* ------------------------------------------------------------------ layout */

/**
 * Fit the design frame into a viewport box.
 *
 * @param {number} vw viewport width in css px
 * @param {number} vh viewport height in css px
 * @param {{top:number,bottom:number}} bleed available bleed art, in DESIGN px, above
 *        y=0 and below y=1920 (derived from the scene's base/underlay rects)
 * @returns {{scale:number,x:number,y:number,mode:"width"|"height",voidPx:number}}
 *          x/y are css px offsets for the frame's top-left; voidPx > 0 means the art
 *          cannot cover the surplus and the blurred bleed-filler must be enabled.
 */
export function computeFit(vw, vh, bleed) {
  const scaleW = vw / DESIGN_W;
  const framedH = DESIGN_H * scaleW;

  /* Viewport is wider than 9:16 (squat / short-portrait window; true landscape phones
     are ≥768 wide and go to desktop mode instead): fit to height and centre
     horizontally. A 9:16 frame can never overflow a wider box, so the surplus lands on
     the sides — reported as voidPx so the blurred bleed-filler covers it rather than
     leaving bands. Cropping horizontally is never an option: the full 1080 must show. */
  if (framedH > vh + 0.5) {
    const scaleH = vh / DESIGN_H;
    const framedW = DESIGN_W * scaleH;
    return {
      scale: scaleH,
      x: (vw - framedW) / 2,
      y: 0,
      mode: "height",
      voidPx: Math.max(0, vw - framedW)
    };
  }

  /* Fit to width — the full 1080 is always visible. Spend the surplus height on the
     scene's own bleed art, biased to the top, clamped to what actually exists. */
  const extra = Math.max(0, vh - framedH);
  const maxTop = Math.max(0, bleed.top) * scaleW;
  const maxBottom = Math.max(0, bleed.bottom) * scaleW;

  let top = Math.min(extra * TOP_BIAS, maxTop);
  let bottom = extra - top;
  if (bottom > maxBottom) {
    bottom = maxBottom;
    top = Math.min(extra - bottom, maxTop);
  }

  return {
    scale: scaleW,
    x: 0,
    y: top,
    mode: "width",
    voidPx: Math.max(0, extra - top - bottom)
  };
}

/**
 * Device-column box. Phones (and portrait tablets) get the whole viewport; wide
 * viewports get a centred 9:19.5 phone-stage.
 */
export function computeDevice(vw, vh) {
  const isDesktop = vw >= DESKTOP_MIN_W && vw / vh > DESKTOP_MIN_ASPECT;
  if (!isDesktop) return { desktop: false, w: vw, h: vh };

  let h = Math.round(vh * DESKTOP_H_RATIO);
  let w = Math.round(h * DEVICE_ASPECT);
  const maxW = vw - 48;
  if (w > maxW) {
    w = Math.max(240, maxW);
    h = Math.round(w / DEVICE_ASPECT);
  }
  return { desktop: true, w, h };
}

/** Bleed available above y=0 / below y=1920, from a scene's backdrop rects. */
function bleedFromScene(scene) {
  const rects = [scene && scene.base, scene && scene.underlay].filter(Boolean);
  if (!rects.length) {
    /* Placeholder scenes paint the full .scene box, so nothing can ever be void. */
    return { top: Infinity, bottom: Infinity };
  }
  let top = 0;
  let bottom = 0;
  for (const r of rects) {
    top = Math.max(top, -num(r.y, 0));
    bottom = Math.max(bottom, num(r.y, 0) + num(r.h, DESIGN_H) - DESIGN_H);
  }
  return { top: Math.max(0, top), bottom: Math.max(0, bottom) };
}

function num(v, fallback) {
  return typeof v === "number" && isFinite(v) ? v : fallback;
}

function now() {
  return typeof performance !== "undefined" && performance.now
    ? performance.now()
    : Date.now();
}

/* ------------------------------------------------------- session persistence */

function readUnlocked(max) {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (raw == null) return 0;
    const n = parseInt(raw, 10);
    if (!isFinite(n) || n < 0) return 0;
    return Math.min(n, max);
  } catch (e) {
    return 0; /* private mode / storage disabled — start locked, never throw */
  }
}

function writeUnlocked(n) {
  try {
    sessionStorage.setItem(STORE_KEY, String(n));
  } catch (e) {
    /* non-fatal */
  }
}

/* ---------------------------------------------------------- scene DOM build */

function el(tag, cls, attrs) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (attrs) {
    for (const k in attrs) {
      if (attrs[k] != null) node.setAttribute(k, attrs[k]);
    }
  }
  return node;
}

function applyRect(node, rect) {
  node.style.setProperty("--x", num(rect.x, 0) + "px");
  node.style.setProperty("--y", num(rect.y, 0) + "px");
  node.style.setProperty("--w", num(rect.w, DESIGN_W) + "px");
  node.style.setProperty("--h", num(rect.h, DESIGN_H) + "px");
}

function makeImage(rect, cls, extra) {
  const img = el("img", cls, {
    /* IMAGE WINDOW: the real URL is parked in data-src and only applyWindow() ever
       promotes it into `src` — so a scene outside the window is never even fetched,
       let alone decoded. That is strictly stronger than loading="lazy", which is why
       these are eager: a LAZY image inside a display:none scene (which every
       non-mounted scene is) never intersects anything, so it never loads at all — its
       `complete` stays false and img.decode() never settles. That is fine for real art
       we are deliberately withholding, but it would hang anyone awaiting the 43-byte
       placeholder. Eager keeps every released <img> in a settled, decodable state. */
    "data-src": rect.src,
    src: BLANK_SRC,
    alt: "",
    decoding: "async",
    loading: "eager",
    draggable: "false"
  });
  applyRect(img, rect);
  if (extra && extra.z != null) img.style.setProperty("--z", String(extra.z));
  if (extra && extra.id) img.setAttribute("data-layer", extra.id);
  if (extra && extra.role) img.setAttribute("data-role", extra.role);
  /* A 404 must degrade to the placeholder wash, not a broken-image glyph. */
  img.addEventListener(
    "error",
    function () {
      img.classList.add("is-missing");
      const scene = img.closest(".scene");
      if (scene) scene.classList.add("scene--placeholder", "has-missing-art");
    },
    { once: true }
  );
  return img;
}

/* ------------------------------------------------------------- text slots */

function buildTextSlots(sceneEl, frame, slug, template) {
  const zone = (template.zones && template.zones[slug]) || null;
  const values = (template.text && template.text[slug]) || null;
  if (!values) return null;

  const box = el("div", "scene-text", { "data-scene-text": slug });
  if (zone) {
    box.style.setProperty("--tx", num(zone.left, 8) + "%");
    box.style.setProperty("--ty", num(zone.top, 8) + "%");
    box.style.setProperty("--tw", num(zone.width, 84) + "%");
    if (zone.height != null) box.style.setProperty("--th", zone.height + "%");
    if (zone.valign) box.style.setProperty("--tvalign", zone.valign);
    if (zone.align) box.style.setProperty("--talign", zone.align);
  }

  let filled = 0;
  for (const key in values) {
    const raw = values[key];
    const list = Array.isArray(raw) ? raw : [raw];
    list.forEach(function (value, i) {
      const slot = el("p", "slot slot--" + key, { "data-slot": key });
      if (Array.isArray(raw)) slot.setAttribute("data-slot-index", String(i));
      const text = typeof value === "string" ? value.trim() : "";
      if (text) {
        slot.textContent = text;
        filled += 1;
      } else {
        slot.hidden = true; /* empty slots never render */
      }
      box.appendChild(slot);
    });
  }
  if (!filled) box.hidden = true;

  frame.appendChild(box);
  return box;
}

/* ------------------------------------------------- default transition drivers */

/* Web Animations API: no dependency, precise timing, a real `finished` promise, and
   it only ever touches transform / opacity / filter on the .scene element (never on
   .scene__frame, whose transform carries the layout). */
function animate(node, keyframes, options) {
  if (!node || typeof node.animate !== "function") return null;
  return node.animate(keyframes, options);
}

/**
 * Cancel every animation still targeting a .scene element.
 *
 * `fill: "forwards"` keeps applying its final frame FOREVER unless the animation is
 * cancelled — a scene that had faded out as `fromEl` would come back stuck at
 * opacity 0 the next time it was visited. Scenes carry no CSS animations of their
 * own (the entry cascade runs on the .layer children), so a non-subtree
 * getAnimations() here returns exactly the transition driver's animations.
 */
function clearSceneAnimations(node) {
  if (!node || typeof node.getAnimations !== "function") return;
  node.getAnimations().forEach(function (a) {
    try {
      a.cancel();
    } catch (e) {}
  });
}

/* ------------------------------------------------------------ bloom sheets
 *
 * A flat sheet of warm light over a whole scene, resting invisible.
 *
 * This is how the default bloom gets its light now. It used to animate
 * `filter: brightness()` on the .scene elements themselves — on BOTH of them, since two
 * scenes are live for the length of a transition. A filter on a node this size makes the
 * engine re-render that node's entire subtree into a fresh offscreen buffer, at device
 * resolution, for every frame it runs; two of those is how a phone ends up killing the
 * tab. A childless box with one flat background colour, by contrast, is turned into a
 * solid-colour layer by both engines (cc::SolidColorLayer /
 * GraphicsLayer::setContentsToSolidColor) — the compositor stores the colour, not a
 * bitmap, so it costs no backing store at all.
 *
 * The alphas are the old brightness stops re-solved as `s = (b - 1) * C / (W - C)`
 * against a mid-tone scene (C ~= 140 RGB). Themed drivers do the same thing against
 * their own scene's measured mean — see js/scenes/*.js.
 */
const BLOOM_TINT = "#fff4e2";

function bloomSheet(el, z) {
  if (!el) return null;
  const s = document.createElement("div");
  s.className = "scene__bloom";
  s.setAttribute("data-fx-sheet", ""); /* the engine's sweep — see mount() */
  s.setAttribute("aria-hidden", "true");
  s.style.position = "absolute";
  s.style.inset = "0";
  s.style.zIndex = z;
  s.style.background = BLOOM_TINT;
  s.style.opacity = "0";
  s.style.pointerEvents = "none";
  el.appendChild(s);
  return s;
}

function driverBloom(fromEl, toEl, done, meta) {
  const d = meta.duration;
  const anims = [];
  const sheets = [];

  /* the outgoing scene brightens, swells and dissolves... */
  if (fromEl) {
    fromEl.style.zIndex = "2";
    anims.push(
      animate(
        fromEl,
        [
          { opacity: 1, transform: "scale(1)" },
          { opacity: 0.92, transform: "scale(1.018)", offset: 0.42 },
          { opacity: 0, transform: "scale(1.04)" }
        ],
        { duration: d, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" }
      )
    );
    const out = bloomSheet(fromEl, "600");
    if (out) {
      sheets.push(out);
      anims.push(
        animate(
          out,
          [{ opacity: 0 }, { opacity: 0.36, offset: 0.42 }, { opacity: 0.57 }],
          { duration: d, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" }
        )
      );
    }
  }

  /* ...revealing the next scene already resting underneath it. */
  toEl.style.zIndex = "1";
  const into = bloomSheet(toEl, "600");
  if (into) {
    sheets.push(into);
    anims.push(
      animate(into, [{ opacity: 0.28 }, { opacity: 0 }], {
        duration: Math.round(d * 0.72),
        easing: "cubic-bezier(0.33, 1, 0.68, 1)",
        fill: "backwards"
      })
    );
  }
  anims.push(
    animate(toEl, [{ opacity: 0 }, { opacity: 1 }], {
      duration: Math.round(d * 0.72),
      easing: "cubic-bezier(0.33, 1, 0.68, 1)",
      fill: "backwards"
    })
  );

  waitAll(anims, d, done);

  return function cleanup() {
    anims.forEach(function (a) {
      if (a) {
        try {
          a.cancel();
        } catch (e) {}
      }
    });
    sheets.forEach(function (n) {
      if (n.parentNode) n.parentNode.removeChild(n);
    });
    if (fromEl) fromEl.style.zIndex = "";
    toEl.style.zIndex = "";
  };
}

function driverFadeBack(fromEl, toEl, done, meta) {
  const d = meta.duration;
  const anims = [];

  if (fromEl) {
    fromEl.style.zIndex = "2";
    anims.push(
      animate(
        fromEl,
        [
          { opacity: 1, transform: "scale(1)" },
          { opacity: 0, transform: "scale(0.985)" }
        ],
        { duration: d, easing: "cubic-bezier(0.65, 0, 0.35, 1)", fill: "forwards" }
      )
    );
  }

  toEl.style.zIndex = "1";
  anims.push(
    animate(
      toEl,
      [
        { opacity: 0, transform: "scale(1.012)" },
        { opacity: 1, transform: "scale(1)" }
      ],
      { duration: d, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)", fill: "backwards" }
    )
  );

  waitAll(anims, d, done);

  return function cleanup() {
    if (fromEl) fromEl.style.zIndex = "";
    toEl.style.zIndex = "";
  };
}

/** Resolve when every animation settles, with a timeout so a dropped `finish` event
 *  can never wedge the state machine in `transitioning: true`. */
function waitAll(anims, duration, done) {
  let finished = false;
  const finish = function () {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    done();
  };
  const timer = setTimeout(finish, duration + 260);

  const live = anims.filter(Boolean);
  if (!live.length) {
    finish();
    return;
  }
  let pending = live.length;
  live.forEach(function (a) {
    const settle = function () {
      pending -= 1;
      if (pending <= 0) finish();
    };
    if (a.finished && typeof a.finished.then === "function") {
      a.finished.then(settle, settle);
    } else {
      a.onfinish = settle;
      a.oncancel = settle;
    }
  });
}

/* ================================================================== factory */

export function createStage(options) {
  const root = options.root; /* .stage */
  const viewport = options.viewport; /* .stage__viewport */
  const device = options.device; /* .stage__device */
  const backdrop = options.backdrop || null; /* .stage__backdrop */
  const config = options.scenes || {};
  const template = options.template || {};

  const design = config.design || {};
  const designW = num(design.w, DESIGN_W);
  const designH = num(design.h, DESIGN_H);

  const order =
    Array.isArray(config.order) && config.order.length
      ? config.order.slice()
      : FALLBACK_ORDER.slice();
  const scenesData = config.scenes || {};
  const hasData = !!(config.order && config.scenes);

  const listeners = Object.create(null);
  const modules = Object.create(null);
  const transitions = Object.create(null);
  const records = [];

  let index = 0;
  let unlockedMax = readUnlocked(order.length - 1);
  let transitioning = false;
  let activeCtx = null;
  let activeTeardown = null;
  let settleTimer = 0;
  let backdropSlot = 0;

  const backdropLayers = backdrop
    ? Array.prototype.slice.call(backdrop.querySelectorAll("[data-backdrop-layer]"))
    : [];

  /* ------------------------------------------------------------- build DOM */

  order.forEach(function (slug, i) {
    const data = scenesData[slug] || null;
    const sceneEl = el("section", "scene", {
      "data-scene": slug,
      "data-index": String(i),
      "aria-hidden": "true"
    });

    const frame = el("div", "scene__frame");

    /* void-filler (blurred copy of the base) — only painted when .has-void is set */
    let bleedImg = null;
    if (data && data.base && data.base.src) {
      bleedImg = el("img", "scene__bleed", {
        /* IMAGE WINDOW, and one step stricter than the layers: the void-filler is a
           second full-size copy of the base (9.9MB decoded per scene) that only ever
           paints under `.has-void` — which the 9:16-or-taller phone viewport and the
           9:19.5 desktop column never produce, only squat/short-landscape windows do.
           So it is retained only when layout() actually asks for it, which is what
           keeps a hot window of three scenes at ~70MB instead of ~100MB. */
        "data-src": data.base.src,
        src: BLANK_SRC,
        alt: "",
        decoding: "async",
        loading: "eager",
        draggable: "false"
      });
      sceneEl.appendChild(bleedImg);
    }

    if (data && data.underlay && data.underlay.src) {
      frame.appendChild(makeImage(data.underlay, "layer layer--underlay"));
    }
    if (data && data.base && data.base.src) {
      frame.appendChild(makeImage(data.base, "layer layer--base"));
    }
    if (data && Array.isArray(data.layers)) {
      data.layers.forEach(function (layer, li) {
        if (!layer || !layer.src) return;
        frame.appendChild(
          makeImage(layer, "layer layer--art", {
            z: num(layer.z, 10 + li),
            id: layer.id || "layer-" + li,
            role: layer.role || null
          })
        );
      });
    }

    /* No art on disk yet: soft wash + slug label so the engine stays testable. */
    if (!data || !data.base || !data.base.src) {
      sceneEl.classList.add("scene--placeholder");
      const label = el("p", "scene__dev-label");
      label.textContent = slug;
      const idx = el("span", "scene__dev-index");
      idx.textContent = i + 1 + " / " + order.length;
      label.appendChild(idx);
      frame.appendChild(label);
    }

    sceneEl.appendChild(frame);
    buildTextSlots(sceneEl, frame, slug, template);
    viewport.appendChild(sceneEl);

    records.push({
      slug: slug,
      index: i,
      el: sceneEl,
      frame: frame,
      bleedImg: bleedImg,
      data: data,
      bleed: bleedFromScene(data),
      images: Array.prototype.slice.call(frame.querySelectorAll("img.layer"))
    });
  });

  /* ------------------------------------------------------------- geometry */

  let vw = 0;
  let vh = 0;
  let rafId = 0;

  function readViewport() {
    const vv = window.visualViewport;
    /* visualViewport is the only reading that tracks the real visible box, but it also
       shrinks under pinch-zoom — fall back to innerHeight when the page is zoomed. */
    if (vv && Math.abs(vv.scale - 1) < 0.01) {
      return { w: Math.round(vv.width), h: Math.round(vv.height) };
    }
    return {
      w: window.innerWidth || document.documentElement.clientWidth,
      h: window.innerHeight || document.documentElement.clientHeight
    };
  }

  function layout() {
    const v = readViewport();
    vw = v.w;
    vh = v.h;
    root.style.setProperty("--stage-h", vh + "px");

    const box = computeDevice(vw, vh);
    root.classList.toggle("is-desktop", box.desktop);
    if (box.desktop) {
      root.style.setProperty("--device-w", box.w + "px");
      root.style.setProperty("--device-h", box.h + "px");
    } else {
      root.style.removeProperty("--device-w");
      root.style.removeProperty("--device-h");
    }

    const stageW = box.w;
    const stageH = box.h;

    let voidChanged = false;
    records.forEach(function (rec) {
      const fit = computeFit(stageW, stageH, rec.bleed);
      rec.frame.style.setProperty("--fx", fit.x.toFixed(2) + "px");
      rec.frame.style.setProperty("--fy", fit.y.toFixed(2) + "px");
      rec.frame.style.setProperty("--fs", fit.scale.toFixed(5));
      rec.fit = fit;
      /* only pay for the blurred filler when the art genuinely cannot cover */
      const wantsVoid = fit.voidPx > 0.5 && !!rec.bleedImg;
      if (rec.el.classList.contains("has-void") !== wantsVoid) {
        rec.el.classList.toggle("has-void", wantsVoid);
        voidChanged = true;
      }
    });
    /* .has-void is what decides whether a scene's void-filler is worth a bitmap, so
       the window has to be re-applied whenever that answer flips. */
    if (voidChanged) applyWindow();

    emit("layout", { w: stageW, h: stageH, desktop: box.desktop });
  }

  function scheduleLayout() {
    if (rafId) return;
    rafId = requestAnimationFrame(function () {
      rafId = 0;
      layout();
    });
  }

  /* ---------------------------------------------------------- image window */
  /* The memory fix. See the BLANK_SRC block at the top of this file for the why.
     Nothing outside these helpers knows the window exists: scene modules still see the
     same <img> elements at the same rects, and go() guarantees a scene's art has
     decoded before that scene is ever painted. */

  /* Indices that must stay retained no matter where the window is — the outgoing and
     incoming scenes of a transition in flight (a dot-rail jump can put them seven
     apart). Emptied by the transition's finish(). */
  let pins = [];

  /** Give this <img> its real URL back. No-op if it already has it. */
  function retainImg(img) {
    const url = img.getAttribute("data-src");
    if (!url || img.getAttribute("src") === url) return;
    img.setAttribute("src", url);
  }

  /** Drop this <img>'s bitmap. The URL stays in data-src; the element is untouched. */
  function releaseImg(img) {
    if (!img.getAttribute("data-src")) return;
    if (img.getAttribute("src") === BLANK_SRC) return;
    img.setAttribute("src", BLANK_SRC);
  }

  function retainScene(rec, priority) {
    rec.images.forEach(function (img) {
      retainImg(img);
      if (priority) img.fetchPriority = priority;
    });
    /* the void-filler is only ever painted under .has-void — see the build */
    if (rec.bleedImg) {
      if (rec.el.classList.contains("has-void")) retainImg(rec.bleedImg);
      else releaseImg(rec.bleedImg);
    }
  }

  function releaseScene(rec) {
    rec.images.forEach(releaseImg);
    if (rec.bleedImg) releaseImg(rec.bleedImg);
  }

  /** Retain {index-WINDOW .. index+WINDOW} + pins; release everything else. */
  function applyWindow() {
    records.forEach(function (rec) {
      const hot = Math.abs(rec.index - index) <= WINDOW || pins.indexOf(rec.index) >= 0;
      if (hot) retainScene(rec, rec.index === index ? "high" : "low");
      else releaseScene(rec);
    });
  }

  /** Resolve — never reject — once this <img> has pixels, or clearly never will. */
  function imgReady(img) {
    const url = img.getAttribute("data-src");
    /* released on purpose, or never had art: nothing to wait for */
    if (!url || img.getAttribute("src") !== url) return Promise.resolve();
    if (typeof img.decode === "function") {
      /* decode() is the only reading that also guarantees the bitmap is ready to
         PAINT; `complete` alone can still cost a frame of blank. It rejects when the
         src changes mid-flight or the file is broken — both are "show it anyway". */
      try {
        return img.decode().then(noop, noop);
      } catch (e) {
        return Promise.resolve();
      }
    }
    if (img.complete) return Promise.resolve();
    return new Promise(function (res) {
      img.addEventListener("load", res, { once: true });
      img.addEventListener("error", res, { once: true });
    });
  }

  function noop() {}

  /** Every layer of `rec` decoded, or DECODE_CAP_MS — whichever comes first. */
  function whenSceneReady(rec) {
    const pending = rec.images.map(imgReady);
    if (!pending.length) return Promise.resolve();
    return new Promise(function (res) {
      let done = false;
      const settle = function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        res();
      };
      /* NEVER DEAD-END: a stalled decode still reveals the scene. */
      const timer = setTimeout(settle, DECODE_CAP_MS);
      Promise.all(pending).then(settle, settle);
    });
  }

  /* --------------------------------------------------------- desktop backdrop */

  function updateBackdrop(rec) {
    if (!backdropLayers.length) return;
    const src = rec.data && rec.data.base && rec.data.base.src ? rec.data.base.src : null;
    const next = backdropLayers[backdropSlot % backdropLayers.length];
    const prev = backdropLayers[(backdropSlot + 1) % backdropLayers.length];
    if (src) {
      next.style.backgroundImage = 'url("' + src + '")';
      next.style.backgroundColor = "";
    } else {
      /* no art yet: fall back to the scene's ground tint so the crossfade still reads */
      next.style.backgroundImage = "none";
      next.style.backgroundColor = getComputedStyle(rec.el).backgroundColor;
    }
    next.classList.add("is-on");
    prev.classList.remove("is-on");
    backdropSlot += 1;
  }

  /* ------------------------------------------------------------- scene ctx */

  function makeCtx(rec, direction) {
    const controller =
      typeof AbortController === "function" ? new AbortController() : null;
    const ctx = {
      slug: rec.slug,
      index: rec.index,
      el: rec.el,
      frame: rec.frame,
      data: rec.data,
      stage: api,
      direction: direction,
      signal: controller ? controller.signal : undefined,
      _abort: function () {
        if (controller) controller.abort();
      },
      get reducedMotion() {
        return prefersReducedMotion();
      },
      layer: function (id) {
        return rec.frame.querySelector('[data-layer="' + id + '"]');
      },
      layers: function () {
        return Array.prototype.slice.call(rec.frame.querySelectorAll("[data-layer]"));
      },
      text: function (key) {
        return rec.frame.querySelector('[data-slot="' + key + '"]');
      },
      on: function (target, type, handler, opts) {
        const o = Object.assign({ passive: true }, opts || {});
        if (controller) o.signal = controller.signal;
        target.addEventListener(type, handler, o);
      },
      isActive: function () {
        return activeCtx === ctx && !transitioning;
      },
      complete: function () {
        /* THE gate. A scene may only ever unlock the scene immediately after itself,
           and only while it is the live scene. */
        if (activeCtx !== ctx) return false;
        return advance();
      }
    };
    return ctx;
  }

  /* --------------------------------------------------------- entry cascade */

  function playEntry(rec) {
    const mod = modules[rec.slug];
    if (mod && mod.defaultEntry === false) return 0;

    const nodes = [];
    const underlay = rec.frame.querySelector(".layer--underlay");
    const base = rec.frame.querySelector(".layer--base");
    const arts = Array.prototype.slice.call(rec.frame.querySelectorAll(".layer--art"));
    const label = rec.frame.querySelector(".scene__dev-label");
    const textBox = rec.frame.querySelector(".scene-text");

    if (underlay) nodes.push(underlay);
    if (base) nodes.push(base);
    arts.forEach(function (n) {
      nodes.push(n);
    });
    if (label) nodes.push(label);
    if (textBox && !textBox.hidden) nodes.push(textBox);
    if (!nodes.length) return 0;

    /* underlay -> base -> layers cascade, squeezed so the whole thing lands inside
       --dur-enter (600ms) no matter how many layers a scene has. */
    const budget = Math.max(0, MOTION.enter - MOTION.settle);
    const step = nodes.length > 1 ? budget / (nodes.length - 1) : 0;
    nodes.forEach(function (node, i) {
      node.style.setProperty("--enter-delay", Math.round(i * step) + "ms");
    });

    rec.el.classList.remove("is-entering");
    void rec.el.offsetWidth; /* restart the cascade on every entry */
    rec.el.classList.add("is-entering");
    rec.entryStart = now();
    return prefersReducedMotion() ? 1 : MOTION.enter;
  }

  /* ms still to run on rec's entry cascade. The cascade starts when the scene mounts —
     i.e. at the START of the transition — so by the time a 700ms forward transition
     ends, a 600ms cascade is already over. Measuring from finish() instead would put a
     dead ~600ms beat before idle() on every single scene. */
  function entryRemaining(rec, entryMs) {
    if (!entryMs) return 1;
    const elapsed = rec.entryStart ? now() - rec.entryStart : 0;
    return Math.max(1, Math.round(entryMs - elapsed));
  }

  function endEntry(rec) {
    rec.el.classList.remove("is-entering");
    rec.frame.querySelectorAll("[style*='--enter-delay']").forEach(function (n) {
      n.style.removeProperty("--enter-delay");
    });
  }

  /* --------------------------------------------------------- state machine */

  function resolveDriver(direction, fromRec) {
    if (direction === "back") return transitions["fade-back"];
    const mod = fromRec ? modules[fromRec.slug] : null;
    const name = (mod && mod.forward) || "bloom";
    return transitions[name] || transitions.bloom;
  }

  /* A transition's light lives on a `data-fx-sheet` node that the driver appends to a
     scene and removes in its own cleanup. A driver that threw on the way out would
     leave one behind, permanently tinting a scene the guest comes back to — so the
     engine sweeps the arriving scene clean here, before it is ever painted live. This
     runs before any driver appends its own sheet (mount -> enter -> driver). */
  function clearSheets(rec) {
    rec.el.querySelectorAll("[data-fx-sheet]").forEach(function (n) {
      n.parentNode.removeChild(n);
    });
  }

  function mount(rec, live) {
    clearSheets(rec);
    rec.el.classList.add("is-mounted");
    rec.el.setAttribute("aria-hidden", live ? "false" : "true");
    rec.el.classList.toggle("is-live", !!live);
  }

  function unmount(rec) {
    clearSceneAnimations(rec.el);
    rec.el.classList.remove("is-mounted", "is-live", "is-transitioning");
    rec.el.setAttribute("aria-hidden", "true");
    rec.el.style.opacity = "";
    rec.el.style.transform = "";
    rec.el.style.filter = "";
    rec.el.style.zIndex = "";
    clearSheets(rec);
  }

  /**
   * Move to `target`.
   * @param {number} target
   * @param {{force?:boolean, driver?:string, direction?:string}} [opts]
   *        force is PRIVATE — only advance() passes it. Public callers can never
   *        move beyond unlockedMax.
   */
  function go(target, opts) {
    opts = opts || {};
    if (transitioning) return false;
    if (!isFinite(target)) return false;
    target = Math.max(0, Math.min(order.length - 1, Math.round(target)));
    if (target === index) return false;

    const direction = opts.direction || (target > index ? "forward" : "back");
    if (direction === "forward" && target > unlockedMax && !opts.force) return false;

    const fromRec = records[index];
    const toRec = records[target];

    /* Claim the machine BEFORE the (asynchronous) art restore below, so a second tap
       arriving during the wait can never start a competing transition — the gate is
       exactly as tight as it was when go() was synchronous. */
    transitioning = true;
    clearTimeout(settleTimer);

    /* IMAGE WINDOW. The arriving scene may be outside the window with its bitmaps
       released (a dot-rail jump), or inside it and already decoded (every step of the
       normal walk, where this resolves in a microtask and costs nothing). Pin both
       ends of the transition, put the art back, and wait — capped — for it to DECODE,
       so the crossfade can never land on a blank or half-painted scene. */
    pins = [fromRec.index, toRec.index];
    retainScene(toRec, "high");
    whenSceneReady(toRec).then(function () {
      runTransition(fromRec, toRec, direction, opts);
    });
    return true;
  }

  /** The transition itself. Only ever called by go(), with the machine already claimed
   *  and `toRec`'s artwork decoded. */
  function runTransition(fromRec, toRec, direction, opts) {
    /* leave */
    if (activeCtx) {
      const mod = modules[fromRec.slug];
      if (mod && typeof mod.exit === "function") {
        try {
          mod.exit(activeCtx);
        } catch (e) {
          reportError("exit:" + fromRec.slug, e);
        }
      }
      if (typeof activeTeardown === "function") {
        try {
          activeTeardown();
        } catch (e) {
          reportError("teardown:" + fromRec.slug, e);
        }
      }
      activeTeardown = null;
      activeCtx._abort();
      activeCtx = null;
    }
    endEntry(fromRec);
    fromRec.el.classList.remove("is-live");
    fromRec.el.classList.add("is-transitioning");

    /* enter */
    index = toRec.index;
    clearSceneAnimations(toRec.el); /* drop any stale fill from a previous visit */
    mount(toRec, true);
    toRec.el.classList.add("is-transitioning");
    updateBackdrop(toRec);

    const ctx = makeCtx(toRec, direction);
    activeCtx = ctx;

    const toMod = modules[toRec.slug];
    if (toMod && typeof toMod.enter === "function") {
      try {
        toMod.enter(ctx);
      } catch (e) {
        reportError("enter:" + toRec.slug, e);
      }
    }
    const entryMs = playEntry(toRec);

    const duration = dur(direction === "back" ? MOTION.back : MOTION.forward);
    const driver =
      (opts.driver && transitions[opts.driver]) || resolveDriver(direction, fromRec);

    const meta = {
      direction: direction,
      from: fromRec.index,
      to: toRec.index,
      fromSlug: fromRec.slug,
      toSlug: toRec.slug,
      reducedMotion: prefersReducedMotion(),
      duration: duration
    };

    let cleanup = null;
    let settled = false;
    const finish = function () {
      if (settled) return;
      settled = true;
      if (typeof cleanup === "function") {
        try {
          cleanup();
        } catch (e) {
          reportError("transition-cleanup", e);
        }
      }
      /* unmount() cancels fromEl's fill; do the same for the arriving scene so a
         driver's forwards-fill can never outlive its own transition. Both happen in
         one task, so no intermediate frame is ever painted. */
      unmount(fromRec);
      clearSceneAnimations(toRec.el);
      toRec.el.classList.remove("is-transitioning");
      transitioning = false;

      /* IMAGE WINDOW: the leaving scene is hidden now, so re-centre the window on
         where we landed and let everything outside it drop its bitmaps. */
      pins = [];
      applyWindow();

      if (toMod && typeof toMod.armInteraction === "function") {
        try {
          activeTeardown = toMod.armInteraction(ctx) || null;
        } catch (e) {
          reportError("armInteraction:" + toRec.slug, e);
        }
      }
      settleTimer = setTimeout(function () {
        endEntry(toRec);
        if (activeCtx === ctx && toMod && typeof toMod.idle === "function") {
          try {
            toMod.idle(ctx);
          } catch (e) {
            reportError("idle:" + toRec.slug, e);
          }
        }
      }, entryRemaining(toRec, entryMs));

      emit("change", { index: index, slug: toRec.slug, unlockedMax: unlockedMax, direction: direction });
    };

    try {
      cleanup = driver(fromRec.el, toRec.el, finish, meta);
    } catch (e) {
      reportError("transition:" + direction, e);
      finish();
    }
  }

  /** The ONLY path past unlockedMax. Reachable exclusively from ctx.complete(). */
  function advance() {
    const target = index + 1;
    if (target > order.length - 1) {
      emit("finish", { index: index, slug: order[index] });
      return false;
    }
    if (target > unlockedMax) {
      unlockedMax = target;
      writeUnlocked(unlockedMax);
      emit("unlock", { unlockedMax: unlockedMax });
    }
    return go(target, { force: true, direction: "forward" });
  }

  /* -------------------------------------------------------------- events */

  function on(type, handler) {
    (listeners[type] || (listeners[type] = [])).push(handler);
    return function off() {
      const list = listeners[type];
      if (!list) return;
      const i = list.indexOf(handler);
      if (i >= 0) list.splice(i, 1);
    };
  }

  function emit(type, detail) {
    const list = listeners[type];
    if (!list) return;
    list.slice().forEach(function (fn) {
      try {
        fn(detail);
      } catch (e) {
        reportError("listener:" + type, e);
      }
    });
  }

  function reportError(where, err) {
    /* Never let a scene module's throw wedge the engine. */
    if (typeof console !== "undefined" && console.error) {
      console.error("[stage] " + where, err);
    }
  }

  /* ------------------------------------------------------------- public API */

  const api = {
    DESIGN_W: designW,
    DESIGN_H: designH,
    order: order.slice(),
    hasData: hasData,

    get index() {
      return index;
    },
    get unlockedMax() {
      return unlockedMax;
    },
    get transitioning() {
      return transitioning;
    },
    get state() {
      return { index: index, unlockedMax: unlockedMax, transitioning: transitioning };
    },
    get slug() {
      return order[index];
    },

    register: function (slug, mod) {
      modules[slug] = mod || {};
      /* Registered after boot (the normal case for scene 0, whose module imports
         resolve after createStage): run the activation sequence it missed. */
      if (order[index] === slug && activeCtx && !transitioning && mod) {
        const rec = records[index];
        if (typeof mod.enter === "function") {
          try {
            mod.enter(activeCtx);
          } catch (e) {
            reportError("enter:" + slug, e);
          }
        }
        if (typeof mod.armInteraction === "function") {
          try {
            activeTeardown = mod.armInteraction(activeCtx) || null;
          } catch (e) {
            reportError("armInteraction:" + slug, e);
          }
        }
        if (typeof mod.idle === "function") {
          const ctx = activeCtx;
          clearTimeout(settleTimer);
          settleTimer = setTimeout(function () {
            endEntry(rec);
            if (activeCtx !== ctx) return;
            try {
              mod.idle(ctx);
            } catch (e) {
              reportError("idle:" + slug, e);
            }
          }, entryRemaining(rec, prefersReducedMotion() ? 1 : MOTION.enter));
        }
      }
      return api;
    },

    registerTransition: function (name, fn) {
      if (typeof fn === "function") transitions[name] = fn;
      return api;
    },

    /** Public navigation — cannot pass unlockedMax. */
    go: function (target, opts) {
      const o = Object.assign({}, opts || {});
      delete o.force;
      return go(target, o);
    },
    next: function () {
      if (index >= unlockedMax) return false; /* revisit-forward only */
      return go(index + 1, { direction: "forward" });
    },
    back: function () {
      if (index <= 0) return false;
      return go(index - 1, { direction: "back" });
    },
    jump: function (target) {
      if (target > unlockedMax || target < 0) return false;
      return go(target);
    },

    on: on,
    relayout: layout,
    sceneEl: function (slug) {
      const rec = records.filter(function (r) {
        return r.slug === slug;
      })[0];
      return rec ? rec.el : null;
    },

    /** DEV ONLY — exposed as window.MS.debugUnlock(n) for QA of the nav states. */
    debugUnlock: function (n) {
      const target = Math.max(0, Math.min(order.length - 1, Math.round(n)));
      unlockedMax = Math.max(unlockedMax, target);
      writeUnlocked(unlockedMax);
      emit("unlock", { unlockedMax: unlockedMax });
      emit("change", { index: index, slug: order[index], unlockedMax: unlockedMax, direction: "debug" });
      return unlockedMax;
    },
    debugReset: function () {
      unlockedMax = 0;
      writeUnlocked(0);
      emit("unlock", { unlockedMax: 0 });
      emit("change", { index: index, slug: order[index], unlockedMax: 0, direction: "debug" });
      return 0;
    }
  };

  /* default drivers — replaceable by name, so phase-3 themed transitions
     (zoom-to-point, breeze-sweep, balloon-rise, mirror-zoom, golden-bloom,
     petal-bloom) register here and are selected per-scene via `forward`. */
  api.registerTransition("bloom", driverBloom);
  api.registerTransition("fade-back", driverFadeBack);

  /* --------------------------------------------------------------- boot */

  layout();
  window.addEventListener("resize", scheduleLayout, { passive: true });
  window.addEventListener("orientationchange", scheduleLayout, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", scheduleLayout, { passive: true });
  }
  if (reduceQuery && typeof reduceQuery.addEventListener === "function") {
    reduceQuery.addEventListener("change", scheduleLayout);
  }

  /* first mount: no transition, but the entry cascade still plays */
  index = 0;
  const first = records[0];
  mount(first, true);
  applyWindow();
  updateBackdrop(first);
  activeCtx = makeCtx(first, "init");
  playEntry(first);
  settleTimer = setTimeout(function () {
    endEntry(first);
    const mod = modules[first.slug];
    if (mod && typeof mod.idle === "function") {
      try {
        mod.idle(activeCtx);
      } catch (e) {
        reportError("idle:" + first.slug, e);
      }
    }
  }, prefersReducedMotion() ? 1 : MOTION.enter);
  emit("change", { index: 0, slug: first.slug, unlockedMax: unlockedMax, direction: "init" });

  return api;
}
