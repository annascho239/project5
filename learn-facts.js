// The facts shown on a constellation's Learn view. Every fact is read from the vendored catalog or computed
// from it for the chosen place and moment. Nothing is looked up elsewhere and nothing is invented.
// Pure: no DOM, no network (the one data file is loaded by the caller).

import { centerOf, compassName, constellationStars, describePosition, greenwichSiderealDegrees, horizontalPosition } from "./sky-engine.js";

export const STAR_FACTS_PATH = "data/constellation-stars.json";
const DEGREES = Math.PI / 180;
const SIDEREAL_DEGREES_PER_DAY = 360.98564736629;
const MS_PER_DAY = 86400000;

// data/constellation-stars.json: the brightest catalog star each constellation's lines connect, derived
// from the full star files by tools/make-star-facts.py (and re-checked against them in the tests).
export async function loadStarFacts(path = STAR_FACTS_PATH) {
  const document = await (await fetch(path)).json();
  return new Map(Object.entries(document.constellations));
}

const unitVector = ([ra, dec]) => [Math.cos(dec * DEGREES) * Math.cos(ra * DEGREES), Math.cos(dec * DEGREES) * Math.sin(ra * DEGREES), Math.sin(dec * DEGREES)];

// The widest angle, in degrees, between any two stars of the pattern.
export function angularSpanDegrees(stars) {
  const vectors = stars.map(unitVector);
  let widest = 0;
  for (let i = 0; i < vectors.length; i += 1) {
    for (let j = i + 1; j < vectors.length; j += 1) {
      const dot = vectors[i][0] * vectors[j][0] + vectors[i][1] * vectors[j][1] + vectors[i][2] * vectors[j][2];
      widest = Math.max(widest, Math.acos(Math.max(-1, Math.min(1, dot))) / DEGREES);
    }
  }
  return widest;
}

// How the whole pattern relates to the horizon over a day, from the observer's latitude alone.
//   "circumpolar"      every star stays above the horizon all day
//   "never-rises"      every star stays below it all day
//   "rises-and-sets"   otherwise
export function latitudeReach(stars, latitude) {
  // A star at declination dec stays above the horizon all day when it is closer to the visible pole than
  // the horizon is, and below it all day when it is closer to the hidden pole.
  const neverSets = (dec) => (latitude >= 0 ? dec > 90 - latitude : dec < -90 - latitude);
  const neverRises = (dec) => (latitude >= 0 ? dec < latitude - 90 : dec > 90 + latitude);
  if (stars.every(([, dec]) => neverSets(dec))) return "circumpolar";
  if (stars.every(([, dec]) => neverRises(dec))) return "never-rises";
  return "rises-and-sets";
}

// The moment, within half a sidereal day of `date`, when the pattern's centre crosses the meridian
// (its highest point of the day for that place).
export function nextMeridianCrossing(center, observer, date) {
  const localSidereal = (greenwichSiderealDegrees(date) + observer.longitude) % 360;
  const behind = ((center.rightAscension - localSidereal + 540) % 360) - 180; // -180..180 degrees still to turn
  return new Date(date.getTime() + (behind / SIDEREAL_DEGREES_PER_DAY) * MS_PER_DAY);
}

// "Rigel (β Orionis)", "Navi (γ Cassiopeiae)", or just "Rigel" / "HIP 24436" when the catalog has less.
export function starLabel(star, genitive) {
  const designation = star.bayer ? `${star.bayer} ${genitive}` : star.flamsteed ? `${star.flamsteed} ${genitive}` : "";
  if (star.name && designation) return `${star.name} (${designation})`;
  return star.name || designation || `HIP ${star.hip}`;
}

const clean = (text) => (text || "").replace(/\s+/g, " ").trim();

// Facts that do not depend on place or time.
export function constellationFacts(id, catalog, starFacts) {
  const polylines = catalog.lines.get(id);
  const properties = catalog.info.get(id);
  if (!polylines || !properties) throw new Error(`Unknown constellation "${id}".`);

  const stars = constellationStars(polylines);
  const genitive = clean(properties.gen);
  const entry = starFacts.get(id);
  const brightest = entry && entry.brightest ? entry.brightest : null;
  const links = new Set();
  const key = (p) => `${p[0]},${p[1]}`;
  for (const line of polylines) {
    for (let i = 0; i < line.length - 1; i += 1) {
      if (key(line[i]) !== key(line[i + 1])) links.add([key(line[i]), key(line[i + 1])].sort().join("|"));
    }
  }
  return {
    id,
    latin: clean(properties.name),
    english: clean(properties.en),
    abbreviation: clean(properties.desig),
    genitive,
    starCount: stars.length,
    linkCount: links.size,
    brightest: brightest && { label: starLabel(brightest, genitive), magnitude: brightest.magnitude },
    spanDegrees: angularSpanDegrees(stars),
    stars,
  };
}

// Facts about this constellation in a particular sky.
export function skyFacts(id, catalog, observer, date) {
  const stars = constellationStars(catalog.lines.get(id));
  const center = centerOf(stars);
  const centerPosition = horizontalPosition(center.rightAscension, center.declination, observer, date);
  const above = stars.filter(([ra, dec]) => horizontalPosition(ra, dec, observer, date).altitude > 0).length;
  const reach = latitudeReach(stars, observer.latitude);
  const crossing = nextMeridianCrossing(center, observer, date);
  const crossingPosition = horizontalPosition(center.rightAscension, center.declination, observer, crossing);
  return {
    status: above === 0 ? "none" : above === stars.length ? "full" : "partial",
    starsAbove: above,
    starCount: stars.length,
    center: centerPosition,
    reach,
    crossing,
    crossingAltitude: crossingPosition.altitude,
    crossingAzimuth: crossingPosition.azimuth,
  };
}

function formatTime(instant, timeZone, date) {
  const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(instant);
  const dayOf = (d) => new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" }).format(d);
  if (dayOf(instant) === dayOf(date)) return time;
  const day = new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" }).format(instant);
  return `${time} on ${day}`;
}

const REACH_TEXT = {
  circumpolar: "Never sets: every star stays above the horizon all day",
  "never-rises": "Never rises: every star stays below the horizon from here",
  "rises-and-sets": "Rises and sets",
};

// The rows shown on the Learn view, as plain label/value text.
// `sky` is optional: { observer: {latitude, longitude}, date, timeZone }.
export function learnRows(id, catalog, starFacts, sky = null) {
  const facts = constellationFacts(id, catalog, starFacts);
  const rows = [["Latin name", facts.latin]];
  if (facts.english !== facts.latin) rows.push(["Common name", facts.english]);
  rows.push(
    ["IAU abbreviation", facts.abbreviation],
    ["Genitive form (used in star designations)", facts.genitive],
    ["Stars in this pattern", String(facts.starCount)],
    ["Lines connecting them", String(facts.linkCount)],
  );
  if (facts.brightest) rows.push(["Brightest star in the pattern", `${facts.brightest.label}, magnitude ${facts.brightest.magnitude}`]);
  rows.push(["Size on the sky", `about ${Math.round(facts.spanDegrees)}° across`]);

  if (sky) {
    const here = skyFacts(id, catalog, sky.observer, sky.date);
    rows.push(["From your latitude", REACH_TEXT[here.reach]]);
    if (here.status === "full") rows.push(["In your sky then", `Fully in view, ${describePosition(here.center)}`]);
    else if (here.status === "partial") rows.push(["In your sky then", `Partly above the horizon (${here.starsAbove} of ${here.starCount} stars); its centre is ${describePosition(here.center)}`]);
    else rows.push(["In your sky then", "Below the horizon"]);
    if (here.reach !== "never-rises" && here.crossingAltitude > 0) {
      rows.push(["Highest point that day", `Around ${formatTime(here.crossing, sky.timeZone, sky.date)}, about ${Math.round(here.crossingAltitude)}° above the horizon, toward the ${compassName(here.crossingAzimuth)}`]);
    }
  }
  return rows;
}
