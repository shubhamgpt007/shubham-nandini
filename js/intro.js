/* intro.js — the tap-to-open CURTAIN INTRO. The invitation's opening scene.
 *
 * A closed-curtain still fills the device column from the first paint, a chip invites
 * the tap, and that one tap starts BOTH the silent clip of the curtains parting AND the
 * background music (autoplay policy allows neither outside a gesture). When the clip
 * ends, the overlay dissolves into scene 1.
 */
(function () {
  "use strict";

  var root = document.documentElement;
  window.MS = window.MS || {};

  var intro = document.querySelector("[data-intro]");
  if (!intro) {
    root.classList.remove("intro-active");
    return;
  }

  window.MS.introAlive = true;

  var video = intro.querySelector("[data-intro-video]");
  var posterImg = intro.querySelector("[data-intro-poster]");
  var hintEl = intro.querySelector("[data-intro-hint]");
  var chipEl = intro.querySelector("[data-intro-chip]");

  var COPY_URL = "data/template.json?v=12";
  var HINT_DELAY_MS = 1000;
  var ART_CAP_MS = 3000;
  var REMOVE_MS = 1700;
  var reduced =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var activated = false;
  var finished = false;
  var videoErrored = false;
  var safetyTimer = 0;
  var hintTimer = 0;
  hintTimer = window.setTimeout(function () {
    if (!activated && hintEl) hintEl.classList.add("is-on");
  }, HINT_DELAY_MS);

  if (chipEl && typeof fetch === "function") {
    fetch(COPY_URL)
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (j) {
        var copy = j && j.hints && typeof j.hints.intro === "string" ? j.hints.intro.trim() : "";
        if (!copy || finished) return;
        chipEl.textContent = copy;
        if (hintEl) hintEl.classList.add("has-label");
      })
      .catch(function () {});
  }

  function onVideoError() {
    videoErrored = true;
    if (activated) finish();
  }

  function videoDead() {
    if (!video || videoErrored) return true;
    if (video.error) return true;
    return video.networkState === 3;
  }

  if (video) {
    video.addEventListener("error", onVideoError, { once: true });
    var srcEl = video.querySelector("source");
    if (srcEl) srcEl.addEventListener("error", onVideoError, { once: true });
    video.addEventListener("ended", finish, { once: true });
  }

  function hidePosterOnFirstFrame() {
    if (!posterImg || !video) return;
    var drop = function () {
      posterImg.classList.add("is-hidden");
    };
    if (typeof video.requestVideoFrameCallback === "function") {
      video.requestVideoFrameCallback(drop);
      return;
    }
    video.addEventListener(
      "playing",
      function () {
        window.requestAnimationFrame(function () {
          window.requestAnimationFrame(drop);
        });
      },
      { once: true }
    );
  }

  function freeVideo() {
    if (!video) return;
    try {
      video.pause();
      video.removeAttribute("src");
      var s = video.querySelector("source");
      if (s) s.removeAttribute("src");
      video.load();
    } catch (e) {}
  }

  if (reduced) freeVideo();

  function activate() {
    if (activated || finished) return;
    activated = true;

    window.clearTimeout(hintTimer);
    if (hintEl) hintEl.classList.remove("is-on");
    intro.classList.add("is-playing");

    window.MS.introTapped = true;

    if (reduced || (window.MS && window.MS.skipIntroVideo)) {
      finish();
      return;
    }
    if (videoDead()) {
      finish();
      return;
    }

    var dur = isFinite(video.duration) && video.duration > 0 ? video.duration : 2.58;
    safetyTimer = window.setTimeout(finish, dur * 1000 + 2500);

    hidePosterOnFirstFrame();

    video.muted = true;
    var p;
    try {
      p = video.play();
    } catch (e) {
      p = null;
    }
    if (p && typeof p.catch === "function") {
      p.catch(function () {
        finish();
      });
    }
  }

  function finish() {
    if (finished) return;
    finished = true;
    window.clearTimeout(safetyTimer);
    window.clearTimeout(hintTimer);
    safetyTimer = 0;

    var proceeded = false;
    var poll = 0;
    var cap = 0;

    var go = function () {
      if (proceeded) return;
      proceeded = true;
      window.clearInterval(poll);
      window.clearTimeout(cap);
      proceed();
    };

    var tryDecode = function () {
      var imgs = document.querySelectorAll('.scene[data-scene="cover"] img');
      if (!imgs.length) return;
      window.clearInterval(poll);
      var pending = [];
      for (var i = 0; i < imgs.length; i++) {
        var img = imgs[i];
        if (typeof img.decode === "function") {
          pending.push(img.decode().catch(function () {}));
        } else if (!img.complete) {
          pending.push(
            new Promise(function (res) {
              img.addEventListener("load", res, { once: true });
              img.addEventListener("error", res, { once: true });
            })
          );
        }
      }
      Promise.all(pending).then(go, go);
    };

    cap = window.setTimeout(go, ART_CAP_MS);
    poll = window.setInterval(tryDecode, 60);
    tryDecode();
  }

  function proceed() {
    try {
      document.dispatchEvent(new CustomEvent("intro:done"));
    } catch (e) {
      document.dispatchEvent(new Event("intro:done"));
    }
    root.classList.remove("intro-active");
    setInert(false);
    intro.classList.add("is-done");

    var removed = false;
    var onEnd = function (e) {
      if (e.target === intro && e.propertyName === "opacity") remove();
    };
    function remove() {
      if (removed) return;
      removed = true;
      intro.removeEventListener("transitionend", onEnd);
      if (intro.parentNode) intro.parentNode.removeChild(intro);
      freeVideo();
    }
    intro.addEventListener("transitionend", onEnd);
    window.setTimeout(remove, REMOVE_MS);
  }

  function setInert(on) {
    var mounts = [
      document.querySelector("[data-stage-viewport]"),
      document.querySelector("[data-nav-mount]")
    ];
    for (var i = 0; i < mounts.length; i++) {
      if (!mounts[i]) continue;
      if (on) mounts[i].setAttribute("inert", "");
      else mounts[i].removeAttribute("inert");
    }
  }

  setInert(true);

  intro.addEventListener("pointerup", function (e) {
    if (e.button != null && e.button !== 0) return;
    activate();
  });
  intro.addEventListener("click", activate);
  intro.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar" || e.code === "Space") {
      e.preventDefault();
      activate();
    }
  });
})();
