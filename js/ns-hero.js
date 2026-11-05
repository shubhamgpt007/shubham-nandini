/** Slide 2 hashtag + slide 3 Ganesh ornament (DOM overlays). */

const GANESH_SVG =
  '<svg viewBox="0 0 200 220" aria-hidden="true">' +
  '<ellipse cx="100" cy="118" rx="72" ry="78" fill="#f4c430" opacity="0.95"/>' +
  '<ellipse cx="100" cy="105" rx="58" ry="62" fill="#e8a317"/>' +
  '<path d="M100 42 C115 28 140 35 138 58 C136 72 118 78 100 74 C82 78 64 72 62 58 C60 35 85 28 100 42Z" fill="#e8a317"/>' +
  '<circle cx="88" cy="98" r="5" fill="#3a2510"/>' +
  '<circle cx="112" cy="98" r="5" fill="#3a2510"/>' +
  '<path d="M92 118 Q100 128 108 118" stroke="#3a2510" stroke-width="3" fill="none"/>' +
  "</svg>";

const HASHTAG = "#Nandini\u0915\u093eShubh\u092e\u093f\u0932\u0928";

function clearOverlay(frame, cls) {
  frame.querySelectorAll("." + cls).forEach(function (n) {
    n.parentNode.removeChild(n);
  });
}

function onSceneChange(stage) {
  stage.on("change", function (e) {
    const sceneEl = document.querySelector('.scene[data-scene="' + e.slug + '"]');
    if (!sceneEl) return;
    const frame = sceneEl.querySelector(".scene__frame");
    if (!frame) return;

    clearOverlay(frame, "ns-cover-hashtag");
    clearOverlay(frame, "ns-names-ganesh");

    if (e.slug === "cover") {
      const tag = document.createElement("p");
      tag.className = "ns-cover-hashtag";
      tag.textContent = HASHTAG;
      frame.appendChild(tag);
    }
    if (e.slug === "names") {
      const g = document.createElement("div");
      g.className = "ns-names-ganesh";
      g.innerHTML = GANESH_SVG;
      frame.appendChild(g);
    }
  });
}

document.addEventListener("stage:ready", function (ev) {
  const stage = (ev.detail && ev.detail.stage) || (window.MS && window.MS.stage);
  if (stage) onSceneChange(stage);
});
