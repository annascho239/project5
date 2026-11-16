// Level data for the constellation launcher: real constellations from the vendored
// d3-celestial catalog, projected to flat board coordinates. Pure functions only:
// no DOM, no physics, no randomness except a seeded generator, so a level is always the same.

export const BOARD = Object.freeze({
  width: 360,
  height: 640,
  starRadius: 14, // generous hit circle around each star
  ballRadius: 7,
  bumperRadius: 9,
  launcher: Object.freeze({ x: 180, y: 600 }),
  // The constellation is fitted inside this box, centered, keeping its real proportions.
  region: Object.freeze({ left: 40, right: 320, top: 70, bottom: 410 }),
  // Bumpers may sit anywhere in this band (never near the launcher).
  bumperZone: Object.freeze({ top: 50, bottom: 520 }),
  wallClearance: 23, // bumper edge to wall: the ball (diameter 14) can always pass
  bumperToStarClearance: 44, // center to center
  bumperToBumperClearance: 40, // center to center
});

// First playable loop: three levels, easy to harder (5, 7, and 9 stars).
export const LEVELS = Object.freeze([
  Object.freeze({ id: "Cas", bumpers: 8 }),
  Object.freeze({ id: "UMi", bumpers: 10 }),
  Object.freeze({ id: "Cyg", bumpers: 12 }),
]);

export const CATALOG_PATH = "vendor/d3-celestial/data/";

// Loads the two catalog files that describe constellations. No network beyond the app's own files.
export async function loadCatalog(path = CATALOG_PATH) {
  const [linesFile, infoFile] = await Promise.all([
    fetch(`${path}constellations.lines.json`).then((response) => response.json()),
    fetch(`${path}constellations.json`).then((response) => response.json()),
  ]);
  const lines = new Map(linesFile.features.map((feature) => [feature.id, feature.geometry.coordinates]));
  const info = new Map(infoFile.features.map((feature) => [feature.id, { ...feature.properties }]));
  applyKnownCorrections(info);
  return { lines, info };
}

// Errors found in the vendored catalog. Each is applied only while the catalog still has the wrong value,
// so fixing the data upstream later makes it a harmless no-op. tests/learn-facts.html scans for more.
export const KNOWN_CATALOG_ERRORS = Object.freeze([
  Object.freeze({
    id: "Cru", field: "gen", wrong: "Crux", right: "Crucis",
    reason: "The genitive of Crux is Crucis (as in Alpha Crucis, Acrux); the catalog repeats the nominative.",
  }),
]);

function applyKnownCorrections(info) {
  for (const { id, field, wrong, right } of KNOWN_CATALOG_ERRORS) {
    const properties = info.get(id);
    if (properties && properties[field] === wrong) properties[field] = right;
  }
}

// Small deterministic generator (mulberry32) seeded from the constellation id.
function seededRandom(text) {
  let seed = 0;
  for (const character of text) seed = (Math.imul(seed, 31) + character.charCodeAt(0)) >>> 0;
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round2 = (value) => Math.round(value * 100) / 100;

// The catalog writes some names with typographic spaces (for example U+2005 in "Little Dipper").
// They look the same but break matching, so names are stored with ordinary single spaces.
const cleanText = (text) => text.replace(/\s+/g, " ").trim();

// The distinct stars of a constellation and the links between them, from its drawn lines.
function starsAndLinks(polylines) {
  const keyOf = ([ra, dec]) => `${ra},${dec}`;
  const stars = new Map();
  for (const line of polylines) for (const point of line) stars.set(keyOf(point), point);

  const ordered = [...stars.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const indexOf = new Map(ordered.map((point, index) => [keyOf(point), index]));

  const linkKeys = new Set();
  const links = [];
  for (const line of polylines) {
    for (let i = 0; i < line.length - 1; i += 1) {
      const a = indexOf.get(keyOf(line[i]));
      const b = indexOf.get(keyOf(line[i + 1]));
      if (a === b) continue;
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (linkKeys.has(key)) continue;
      linkKeys.add(key);
      links.push(a < b ? [a, b] : [b, a]);
    }
  }
  return { ordered, links };
}

// Gnomonic projection about the constellation's centre, as seen looking up at the sky:
// north is up and east is to the left. Right ascension is unwrapped so a constellation
// that crosses 0°/360° stays in one piece.
function projectToSky(points) {
  const reference = points[0][0];
  const unwrapped = points.map(([ra, dec]) => {
    let delta = ra - reference;
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    return [reference + delta, dec];
  });
  const centerRa = unwrapped.reduce((sum, point) => sum + point[0], 0) / unwrapped.length;
  const centerDec = unwrapped.reduce((sum, point) => sum + point[1], 0) / unwrapped.length;
  const dec0 = (centerDec * Math.PI) / 180;

  return unwrapped.map(([ra, dec]) => {
    const a = ((ra - centerRa) * Math.PI) / 180;
    const d = (dec * Math.PI) / 180;
    const denominator = Math.sin(dec0) * Math.sin(d) + Math.cos(dec0) * Math.cos(d) * Math.cos(a);
    const xi = (Math.cos(d) * Math.sin(a)) / denominator;
    const eta = (Math.cos(dec0) * Math.sin(d) - Math.sin(dec0) * Math.cos(d) * Math.cos(a)) / denominator;
    return { x: -xi, y: -eta }; // east left, north up (screen y grows downward)
  });
}

function fitToRegion(points, region) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = Math.max(...xs) - minX;
  const height = Math.max(...ys) - minY;
  const regionWidth = region.right - region.left;
  const regionHeight = region.bottom - region.top;
  const scale = Math.min(regionWidth / width, regionHeight / height);
  const offsetX = region.left + (regionWidth - width * scale) / 2;
  const offsetY = region.top + (regionHeight - height * scale) / 2;
  return points.map((point) => ({
    x: round2(offsetX + (point.x - minX) * scale),
    y: round2(offsetY + (point.y - minY) * scale),
  }));
}

// Bumper pegs are invented, not astronomical: they keep the ball moving. They are placed
// deterministically and never crowd a star, a wall, or each other.
function placeBumpers(stars, count, seedText) {
  const random = seededRandom(seedText);
  const { width, bumperRadius, bumperZone, wallClearance, bumperToStarClearance, bumperToBumperClearance } = BOARD;
  const bumpers = [];

  for (let attempt = 0; attempt < 20000 && bumpers.length < count; attempt += 1) {
    const x = round2(wallClearance + bumperRadius + random() * (width - 2 * (wallClearance + bumperRadius)));
    const y = round2(bumperZone.top + random() * (bumperZone.bottom - bumperZone.top));
    const clearOfStars = stars.every((star) => Math.hypot(star.x - x, star.y - y) >= bumperToStarClearance);
    const clearOfBumpers = bumpers.every((other) => Math.hypot(other.x - x, other.y - y) >= bumperToBumperClearance);
    if (clearOfStars && clearOfBumpers) bumpers.push({ x, y });
  }
  if (bumpers.length < count) throw new Error(`Could not place ${count} bumpers for ${seedText}.`);
  return bumpers;
}

// Builds one playable level from the catalog.
export function buildLevel(spec, catalog) {
  const polylines = catalog.lines.get(spec.id);
  const properties = catalog.info.get(spec.id);
  if (!polylines || !properties) throw new Error(`Unknown constellation "${spec.id}".`);

  const { ordered, links } = starsAndLinks(polylines);
  const stars = fitToRegion(projectToSky(ordered), BOARD.region);
  const bumpers = placeBumpers(stars, spec.bumpers, spec.id);

  // Catalog facts only; nothing here comes from outside the vendored data.
  const facts = {
    latin: cleanText(properties.name),
    english: cleanText(properties.en),
    abbreviation: cleanText(properties.desig),
    genitive: cleanText(properties.gen),
    starCount: stars.length,
    linkCount: links.length,
  };

  return { id: spec.id, title: cleanText(properties.en || properties.name), stars, links, bumpers, facts };
}

export function buildAllLevels(catalog) {
  return LEVELS.map((spec) => buildLevel(spec, catalog));
}
