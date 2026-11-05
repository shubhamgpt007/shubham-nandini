/* nav.js — dots rail, back / next chevrons, mute toggle.
 *
 * Pure view over stage state: it never mutates {index, unlockedMax} itself, it only
 * calls stage.back() / stage.next() / stage.jump(), all of which the engine gates.
 * The next chevron exists ONLY as revisit convenience (index < unlockedMax) — it can
 * never be the thing that unlocks a scene.
 *
 * Accessibility: the dots are a <nav> landmark of real <button>s (locked ones are
 * `disabled`, so genuinely inert and out of the tab order); chevrons and mute carry
 * aria-labels; Left/Right arrows mirror back/next. No text labels anywhere.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

function svg(paths, extra) {
  const node = document.createElementNS(SVG_NS, "svg");
  node.setAttribute("viewBox", "0 0 24 24");
  node.setAttribute("aria-hidden", "true");
  node.setAttribute("focusable", "false");
  if (extra) node.setAttribute("class", extra);
  paths.forEach(function (d) {
    const p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("d", d);
    node.appendChild(p);
  });
  return node;
}

function button(cls, label) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "nav-btn " + cls;
  b.setAttribute("aria-label", label);
  return b;
}

export function createNav(stage, mount, opts) {
  opts = opts || {};

  /* ---- back / next chevrons (geometric SVG, no artwork) ---------------- */
  const back = button("nav-btn--back", "Previous scene");
  back.setAttribute("data-nav-back", "");
  back.appendChild(svg(["M15 5 L8 12 L15 19"]));

  const next = button("nav-btn--next", "Next scene");
  next.setAttribute("data-nav-next", "");
  next.appendChild(svg(["M9 5 L16 12 L9 19"]));

  /* ---- mute toggle ----------------------------------------------------- */
  const mute = button("nav-btn--mute", "Play music");
  mute.setAttribute("data-nav-mute", "");
  mute.setAttribute("aria-pressed", "false");
  mute.appendChild(
    svg(["M4 9.5 h3.4 L12 5.5 v13 l-4.6 -4 H4 z", "M16 9.2 a4 4 0 0 1 0 5.6", "M18.7 6.6 a7.6 7.6 0 0 1 0 10.8"], "icon-on")
  );
  mute.appendChild(svg(["M4 9.5 h3.4 L12 5.5 v13 l-4.6 -4 H4 z", "M16.5 9.8 L21 14.3", "M21 9.8 L16.5 14.3"], "icon-off"));
  mute.hidden = true; /* stays hidden until audio.js is given a real src */

  /* ---- dots rail (nav landmark) ---------------------------------------- */
  const rail = document.createElement("nav");
  rail.className = "nav-rail";
  rail.setAttribute("aria-label", "Invitation scenes");
  rail.setAttribute("data-nav-rail", "");

  const list = document.createElement("ul");
  list.className = "nav-rail__list";
  rail.appendChild(list);

  const dots = stage.order.map(function (slug, i) {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "dot";
    b.setAttribute("data-dot", String(i));
    b.setAttribute("aria-label", "Scene " + (i + 1) + " of " + stage.order.length);
    const mark = document.createElement("span");
    mark.className = "dot__mark";
    b.appendChild(mark);
    li.appendChild(b);
    list.appendChild(li);
    return b;
  });

  mount.appendChild(back);
  mount.appendChild(next);
  mount.appendChild(mute);
  mount.appendChild(rail);

  /* ---- sync ------------------------------------------------------------ */

  function sync() {
    const index = stage.index;
    const unlocked = stage.unlockedMax;

    back.hidden = index <= 0;
    /* revisit-only: absent when there is nothing already-unlocked ahead */
    next.hidden = index >= unlocked;

    dots.forEach(function (b, i) {
      const state = i === index ? "current" : i <= unlocked ? "visited" : "locked";
      b.setAttribute("data-state", state);
      b.disabled = state === "locked";
      if (i === index) {
        b.setAttribute("aria-current", "true");
      } else {
        b.removeAttribute("aria-current");
      }
    });
  }

  /* ---- input ----------------------------------------------------------- */

  back.addEventListener("click", function () {
    stage.back();
  });

  next.addEventListener("click", function () {
    stage.next();
  });

  /* one delegated handler for all seven dots */
  list.addEventListener("click", function (e) {
    const b = e.target.closest("[data-dot]");
    if (!b || b.disabled) return;
    stage.jump(parseInt(b.getAttribute("data-dot"), 10));
  });

  document.addEventListener("keydown", function (e) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;

    if (e.key === "ArrowLeft") {
      if (stage.back()) e.preventDefault();
    } else if (e.key === "ArrowRight") {
      if (stage.next()) e.preventDefault();
    }
    /* Enter/Space on a focused dot is native <button> behaviour — nothing to add. */
  });

  stage.on("change", sync);
  stage.on("unlock", sync);
  sync();

  return {
    sync: sync,
    muteButton: mute,
    /** audio.js calls this once it has a real src to reveal the toggle. */
    showMute: function (show) {
      mute.hidden = !show;
    }
  };
}
