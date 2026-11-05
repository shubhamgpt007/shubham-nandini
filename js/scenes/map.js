/* map.js — scene 8 of 8. "The way to the celebration."
 *
 * ART        one base (garden path to a gateway, garlands at the top corners). It is
 *            AI-generated (see VARIANT.md), not a designer PSD, so there are no cutouts.
 * COPY       title, venue name and address: data/textspec.json `map`, authored by
 *            tools/apply_overrides.py and typeset by js/fx/text.js like every other slide.
 * CHROME     a live Google map in a framed card, a "Get Directions" button, the studio
 *            credit, and the replay control (credit + replay moved here from last.js
 *            when this slide became the finale).
 *            URLs and the button label are data/template.json `map`.
 * FORWARD    NONE. This is the finale: no transition, ctx.complete() is never called.
 *
 * Owns exactly: this file + css/scenes/map.css.
 */

import * as kit from "../fx/kit.js?v=8";
import * as text from "../fx/text.js?v=5";

/* KEEP IN LOCK-STEP with the data/template.json token in js/main.js and js/fx/kit.js */
const CONFIG_URL = "data/template.json?v=7";

/* design-space rects: the card sits in the clear sky between the address (ends ~y 464)
   and the garden (starts ~y 1440); the button under it, above the path */
const CARD = { x: 110, y: 510, w: 860, h: 720 };
const BUTTON = { y: 1276, h: 104 };
const CREDIT_Y = 1412; /* glyph top: pale sky between the button and the tree line (~1450) */
const CREDIT = { href: "https://www.instagram.com/shagunstudioindia/", text: "Designed by Shagun Studio India" };

let state = null;
let configPromise = null;

function loadConfig() {
  if (!configPromise) {
    configPromise = fetch(CONFIG_URL)
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (d) {
        return (d && d.map) || null;
      })
      .catch(function () {
        return null;
      });
  }
  return configPromise;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** A circular arrow, drawn as geometry: a 300-degree arc and a chevron head. */
function replayIcon() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  ["M12 4.6 A7.4 7.4 0 1 1 5.59 8.3", "M8.9 1.9 L12 4.6 L8.9 7.3"].forEach(function (d) {
    const p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("d", d);
    svg.appendChild(p);
  });
  return svg;
}

/** A map pin, drawn as geometry, for the directions button. */
function pinIcon() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const p = document.createElementNS(SVG_NS, "path");
  p.setAttribute("d", "M12 21.5s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0c0 5-6.5 11.2-6.5 11.2z");
  const c = document.createElementNS(SVG_NS, "circle");
  c.setAttribute("cx", "12");
  c.setAttribute("cy", "10.3");
  c.setAttribute("r", "2.4");
  svg.appendChild(p);
  svg.appendChild(c);
  return svg;
}

/* -------------------------------------------------------------- interaction */

function armMap(ctx) {
  /* Finale: replay only — venue details are ns-venue.js on this slide. */
  const replay = document.createElement("button");
  replay.type = "button";
  replay.className = "mp-fx mp-replay";
  replay.setAttribute("aria-label", "Replay");
  replay.appendChild(replayIcon());
  ctx.el.appendChild(replay);
  ctx.on(replay, "click", function () {
    ctx.stage.jump(0);
  });

  if (ctx.reducedMotion) {
    replay.classList.add("is-on");
  } else {
    state.reveal = setTimeout(function () {
      replay.classList.add("is-on");
    }, 700);
  }

  return function teardown() {
    clearTimeout(state && state.reveal);
    ctx.el.querySelectorAll(".mp-fx").forEach(function (n) {
      n.parentNode.removeChild(n);
    });
  };
}

/* ------------------------------------------------------------------ module */
/* No `forward` and no transition driver: nothing follows this scene. */

kit.defineScene("map", {
  enter: function (ctx) {
    text.mount(ctx);
    state = { reveal: 0 };
    ctx.el.querySelectorAll(".mp-fx").forEach(function (n) {
      n.parentNode.removeChild(n);
    });
  },

  armInteraction: armMap,

  idle: function (ctx) {
    text.reveal(ctx);
  }
});
