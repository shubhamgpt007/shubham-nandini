/* audio.js — gesture-gated background music scaffold.
 *
 * No src in data/template.json -> the whole module no-ops and the mute toggle stays
 * hidden. With a src: the <audio> is created lazily inside the FIRST user gesture on
 * the stage (autoplay policy + zero network cost for a guest who never interacts),
 * loops, and ramps to volume 0.55 over 600ms.
 *
 * A hidden tab pauses; returning resumes, but only if it was playing when it left.
 * QA hook: window.MS.audioEl
 */

const TARGET_VOLUME = 0.55;
const FADE_MS = 600;

export function initAudio(options) {
  const src = (options && options.src) || "";
  const mount = options.mount;
  const gestureTarget = options.gestureTarget || document;
  const nav = options.nav || null;

  const api = {
    enabled: false,
    el: null,
    isPlaying: function () {
      return false;
    },
    toggle: function () {
      return false;
    }
  };

  if (!src) {
    /* no music configured — the toggle never appears */
    if (nav && nav.showMute) nav.showMute(false);
    return api;
  }

  let audioEl = null;
  let playing = false;
  let wasPlaying = false;
  let fadeRaf = 0;
  let gestureDone = false;

  const button = nav && nav.muteButton ? nav.muteButton : null;
  if (nav && nav.showMute) nav.showMute(true);

  function syncButton() {
    if (!button) return;
    button.setAttribute("aria-pressed", String(playing));
    button.setAttribute("aria-label", playing ? "Mute music" : "Play music");
  }

  function ensure() {
    if (audioEl) return audioEl;
    audioEl = new Audio(src);
    audioEl.loop = true;
    audioEl.preload = "auto";
    audioEl.volume = 0;
    if (mount) mount.appendChild(audioEl);
    window.MS = window.MS || {};
    window.MS.audioEl = audioEl; /* QA hook */
    return audioEl;
  }

  /* volume is not a CSS property — a short rAF ramp is the only way to fade it. */
  function fadeTo(target, ms, onDone) {
    cancelAnimationFrame(fadeRaf);
    if (!audioEl) return;
    const from = audioEl.volume;
    const delta = target - from;
    if (Math.abs(delta) < 0.001 || ms <= 0) {
      audioEl.volume = target;
      if (onDone) onDone();
      return;
    }
    const start = performance.now();
    const step = function (now) {
      const t = Math.min(1, (now - start) / ms);
      audioEl.volume = Math.max(0, Math.min(1, from + delta * t));
      if (t < 1) {
        fadeRaf = requestAnimationFrame(step);
      } else if (onDone) {
        onDone();
      }
    };
    fadeRaf = requestAnimationFrame(step);
  }

  function play() {
    ensure();
    let p;
    try {
      p = audioEl.play();
    } catch (e) {
      p = null;
    }
    const started = function () {
      if (document.hidden) {
        /* the promise can settle after the tab was backgrounded */
        audioEl.pause();
        playing = false;
        syncButton();
        return;
      }
      playing = true;
      wasPlaying = true;
      syncButton();
      fadeTo(TARGET_VOLUME, FADE_MS);
    };
    if (p && typeof p.then === "function") {
      p.then(started, function () {
        playing = false;
        syncButton();
      });
    } else {
      started();
    }
  }

  function pause(remember) {
    if (!audioEl) return;
    cancelAnimationFrame(fadeRaf);
    audioEl.pause();
    playing = false;
    if (remember === false) wasPlaying = false;
    syncButton();
  }

  /* ---- first gesture on the stage --------------------------------------- */

  function onFirstGesture(e) {
    if (gestureDone) return;
    if (e.type === "pointerup" && e.button != null && e.button !== 0) return;
    if (e.type === "keydown" && !(e.key === "Enter" || e.key === " " || e.code === "Space")) return;
    gestureDone = true;
    play();
  }

  gestureTarget.addEventListener("pointerup", onFirstGesture, { passive: true });
  gestureTarget.addEventListener("click", onFirstGesture, { passive: true });
  gestureTarget.addEventListener("keydown", onFirstGesture, { passive: true });

  /* ---- toggle ------------------------------------------------------------ */

  if (button) {
    button.addEventListener("click", function (e) {
      e.stopPropagation();
      gestureDone = true;
      if (playing) {
        pause(false); /* an explicit mute must survive a tab switch */
      } else {
        play();
      }
    });
  }

  /* ---- tab visibility ---------------------------------------------------- */

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      if (playing) {
        pause(true); /* remember, so we can resume */
        wasPlaying = true;
      }
    } else if (wasPlaying && !playing && audioEl) {
      play();
    }
  });

  /* iOS bfcache safety net */
  window.addEventListener("pagehide", function () {
    if (audioEl) {
      try {
        audioEl.pause();
      } catch (e) {}
    }
  });

  syncButton();

  api.enabled = true;
  api.isPlaying = function () {
    return playing;
  };
  api.toggle = function () {
    if (playing) {
      pause(false);
    } else {
      play();
    }
    return playing;
  };
  Object.defineProperty(api, "el", {
    get: function () {
      return audioEl;
    }
  });

  return api;
}
