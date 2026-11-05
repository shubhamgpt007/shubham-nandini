/** Venue program — compliments + map finale (same UI as former compliments slide). */
const COMPLIMENTS_VENUES = [
  {
    heading: "Marriage Venue",
    lines: ["Panchkula Bhawan", "Salasar Balaji, Rajasthan"],
    href: "https://www.google.com/maps/place/Panchkula+Bhawan,+Salasar/@27.73946,74.750067,17z/data=!3m1!4b1!4m6!3m5!1s0x396cad8c97a5b36f:0x37740b7ba253f347!8m2!3d27.73946!4d74.7526419!16s%2Fg%2F11f9y4tjm3?entry=ttu&g_ep=EgoyMDI2MTEwMi4wIKXMDSoASAFQAw%3D%3D",
    linkText: "Location",
  },
  {
    heading: "Reception Venue",
    lines: ["Rosella By SK Noida", "Noida, Uttar Pradesh"],
    href: "https://www.google.com/maps/place/Rosella+By+SK+Noida/@28.5829069,77.3911819,17z/data=!3m1!4b1!4m6!3m5!1s0x390cef006e56167d:0x97495ae07131946b!8m2!3d28.5829069!4d77.3937568!16s%2Fg%2F11ylv3d_qy?entry=ttu&g_ep=EgoyMDI2MTEwMi4wIKXMDSoASAFQAw%3D%3D",
    linkText: "Location",
  },
];

const COMPLIMENTS_FOOTER = "Your presence will make our celebrations special.";

const VENUE_PROGRAM_SLUGS = ["compliments", "map"];

function buildVenueBlock(spec) {
  const block = document.createElement("section");
  block.className = "ns-venue-block";

  const h = document.createElement("h3");
  h.className = "ns-venue-block__heading";

  const headingText = document.createElement("span");
  headingText.className = "ns-venue-block__heading-text";
  headingText.textContent = spec.heading;

  const ornament = document.createElement("span");
  ornament.className = "ns-venue-block__ornament";
  ornament.setAttribute("aria-hidden", "true");

  h.appendChild(headingText);
  h.appendChild(ornament);

  const place = document.createElement("p");
  place.className = "ns-venue-block__place";
  spec.lines.forEach(function (line, i) {
    if (i) place.appendChild(document.createElement("br"));
    const span = document.createElement("span");
    if (i === 0) span.className = "ns-venue-block__place-name";
    span.textContent = line;
    place.appendChild(span);
  });

  const link = document.createElement("a");
  link.className = "ns-venue-block__link";
  link.href = spec.href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "📍 " + spec.linkText;

  block.appendChild(h);
  block.appendChild(place);
  block.appendChild(link);
  return block;
}

function mountVenueProgram(sceneEl) {
  if (!sceneEl || sceneEl.querySelector("[data-ns-compliments-program]")) return;
  const wrap = document.createElement("div");
  wrap.dataset.nsComplimentsProgram = "1";
  wrap.className = "ns-compliments-program";
  wrap.setAttribute("aria-label", "Wedding and reception venues");

  COMPLIMENTS_VENUES.forEach(function (spec) {
    wrap.appendChild(buildVenueBlock(spec));
  });

  const footer = document.createElement("p");
  footer.className = "ns-compliments-program__footer";
  footer.textContent = COMPLIMENTS_FOOTER;
  wrap.appendChild(footer);

  sceneEl.appendChild(wrap);
  requestAnimationFrame(function () {
    wrap.classList.add("is-on");
  });
}

function maybeMountVenueProgram(slug) {
  if (VENUE_PROGRAM_SLUGS.indexOf(slug) === -1) return;
  mountVenueProgram(document.querySelector('.scene[data-scene="' + slug + '"]'));
}

document.addEventListener("stage:ready", function () {
  const stage = window.MS && window.MS.stage;
  if (!stage) return;
  stage.on("change", function (e) {
    maybeMountVenueProgram(e.slug);
  });
  maybeMountVenueProgram(stage.slug);
});
