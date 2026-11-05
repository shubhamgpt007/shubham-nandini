/** Slide 1 — Rajasthani royal hero (names, hashtag, dates, venue). */

const HASHTAG = "#Nandini\u0915\u093eShubh\u092e\u093f\u0932\u0928";
const ROOT_CLS = "ns-cover-royal";
const SCENE_CLS = "has-ns-cover-royal";

let activeFrame = null;

export function isCoverRoyal() {
  return true;
}

function clear(frame) {
  if (!frame) return;
  frame.querySelectorAll("." + ROOT_CLS).forEach(function (n) {
    n.parentNode.removeChild(n);
  });
}

export function mountCoverRoyal(ctx) {
  const frame = ctx.frame;
  const scene = ctx.el;
  clear(frame);
  scene.classList.add(SCENE_CLS);
  activeFrame = frame;

  const root = document.createElement("div");
  root.className = ROOT_CLS;
  root.setAttribute("aria-hidden", "true");

  root.innerHTML =
    '<div class="ns-cover-royal__arch" aria-hidden="true"></div>' +
    '<div class="ns-cover-royal__panel">' +
    '<p class="ns-cover-royal__name ns-cover-royal__name--a">Dr. Shubham</p>' +
    '<p class="ns-cover-royal__amp">&amp;</p>' +
    '<p class="ns-cover-royal__name ns-cover-royal__name--b">Dr. Nandini</p>' +
    '<p class="ns-cover-royal__tag">' +
    HASHTAG +
    "</p>" +
    '<p class="ns-cover-royal__dates">10th &amp; 11th December 2026</p>' +
    '<p class="ns-cover-royal__venue">Panchkula Bhawan, Salasar, Rajasthan</p>' +
    "</div>";

  frame.appendChild(root);
}

export function unmountCoverRoyal(ctx) {
  if (ctx && ctx.el) ctx.el.classList.remove(SCENE_CLS);
  if (ctx && ctx.frame) clear(ctx.frame);
  else if (activeFrame) clear(activeFrame);
  activeFrame = null;
}
