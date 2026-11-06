/* main.js — boot.
 *
 * Loads data/scenes.json (written by the asset pipeline) and data/template.json (music
 * + gesture-hint copy), builds the stage, wires nav and audio, and exposes window.MS.
 * The invitation COPY comes from neither: js/fx/text.js fetches data/textspec.json and
 * typesets it over each scene — see css/scenes.css for the manifest.
 *
 * Both fetches tolerate a 404: with no scenes.json the engine falls back to its own
 * slug order and renders dev placeholders, so the paged experience — fit maths, nav,
 * gating, transitions — is testable before a single asset exists.
 *
 * The CURTAIN INTRO (js/intro.js) runs ahead of all of this, from static markup in
 * index.html. Boot only owes it two things, both below: a failsafe that tears the
 * overlay down if that script never loaded, and an audio path that treats the tap on
 * the curtain as the first gesture.
 */

import { createStage } from "./stage.js?v=3";
import { createNav } from "./nav.js?v=1";
import { initAudio } from "./audio.js?v=1";
import "./scenes/index.js?v=30"; /* scene modules self-register on `stage:ready` */
import "./ns-venue.js?v=11";

async function loadJSON(url) {
  try {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    /* missing, unparseable, or served from file:// — all non-fatal */
    return null;
  }
}

async function boot() {
  const root = document.querySelector("[data-stage]");
  const viewport = document.querySelector("[data-stage-viewport]");
  const device = document.querySelector("[data-stage-device]");
  const backdrop = document.querySelector("[data-stage-backdrop]");
  const navMount = document.querySelector("[data-nav-mount]");
  const audioMount = document.querySelector("[data-audio-mount]");
  if (!root || !viewport) return;

  /* CURTAIN-INTRO FAILSAFE. The overlay is static markup in index.html, so js/intro.js
     is the only thing that can ever remove it — a 404 or a parse error on that file
     would otherwise seal the invitation shut behind a poster. It sets MS.introAlive as
     its "I am here" flag (and always runs before this module: deferred classic scripts
     and module scripts execute in document order). Without the flag, drop the overlay
     and the gate class here so the cover behaves exactly as it did before the intro
     existed. */
  const introEl = document.querySelector("[data-intro]");
  if (introEl && !(window.MS && window.MS.introAlive)) {
    document.documentElement.classList.remove("intro-active");
    document.querySelectorAll("[data-stage-viewport], [data-nav-mount]").forEach(function (n) {
      n.removeAttribute("inert");
    });
    if (introEl.parentNode) introEl.parentNode.removeChild(introEl);
    document.dispatchEvent(new CustomEvent("intro:done"));
  }

  const [scenes, template] = await Promise.all([
    loadJSON("data/scenes.json?v=11"),
    loadJSON("data/template.json?v=12")
  ]);

  if (!scenes) {
    root.classList.add("is-placeholder-mode");
    if (console && console.info) {
      console.info("[stage] data/scenes.json not found — rendering dev placeholders.");
    }
  }

  const stage = createStage({
    root: root,
    viewport: viewport,
    device: device,
    backdrop: backdrop,
    scenes: scenes || {},
    template: template || {}
  });

  const nav = navMount ? createNav(stage, navMount) : null;

  /* MUSIC. Autoplay policy means the <audio> can only start inside a user gesture, and
     the first gesture this invitation ever gets is the tap on the curtain intro — which
     lands on the overlay, NOT inside [data-stage]. Listening on `document` is what makes
     that tap count: it is the one ancestor both the overlay and the stage share, so the
     same handler covers a guest who opened via the curtain and one who reached the
     stage with the overlay already gone (the failsafe path above). js/audio.js owns
     everything after that — lazy creation, the volume ramp, the mute toggle, and
     pause-on-hidden / resume-on-return. */
  const audio = initAudio({
    src: (template && template.music && template.music.src) || "",
    mount: audioMount,
    gestureTarget: document,
    nav: nav
  });

  /* The sliver where the guest taps the curtain BEFORE this module finished booting:
     the listener above did not exist yet, so nothing heard it. js/intro.js leaves a
     flag; honour it here. Chrome's sticky user activation makes this play() succeed;
     Safari's transient activation may refuse it, in which case the mute toggle is
     right there — and in practice boot lands in tens of ms, long before a human taps. */
  if (audio.enabled && window.MS && window.MS.introTapped && !audio.isPlaying()) {
    audio.toggle();
  }

  /* dark scenes want slightly heavier nav chrome */
  stage.on("change", function (e) {
    root.classList.toggle("is-tone-dark", e.slug === "cocktail" || e.slug === "reception");
  });

  window.MS = Object.assign(window.MS || {}, {
    stage: stage,
    nav: nav,
    audio: audio,
    /* QA hooks */
    debugUnlock: stage.debugUnlock,
    debugReset: stage.debugReset,
    state: function () {
      return stage.state;
    }
  });

  document.dispatchEvent(new CustomEvent("stage:ready", { detail: { stage: stage } }));
}

boot();
