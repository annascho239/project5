// Which constellations are above the horizon for a place and a moment. Pure functions: no DOM,
// no network. Star positions are the catalog's J2000 coordinates, used as they are (no precession),
// which matches how d3-celestial draws the wallpaper, so the explore list and the wallpaper agree.

const DEGREES = Math.PI / 180;
const MS_PER_DAY = 86400000;
const UNIX_EPOCH_JULIAN_DATE = 2440587.5;
const J2000_JULIAN_DATE = 2451545.0;
const COMPASS_POINTS = [
  "north", "north-northeast", "northeast", "east-northeast",
  "east", "east-southeast", "southeast", "south-southeast",
  "south", "south-southwest", "southwest", "west-southwest",
  "west", "west-northwest", "northwest", "north-northwest",
];

export function julianDate(date) {
  return date.getTime() / MS_PER_DAY + UNIX_EPOCH_JULIAN_DATE;
}

// Greenwich mean sidereal time in degrees (IAU 1982 expression, good to a fraction of an arcsecond
// for the dates this app accepts).
export function greenwichSiderealDegrees(date) {
  const days = julianDate(date) - J2000_JULIAN_DATE;
  const centuries = days / 36525;
  const degrees = 280.46061837 + 360.98564736629 * days + 0.000387933 * centuries * centuries - (centuries ** 3) / 38710000;
  return ((degrees % 360) + 360) % 360;
}

// Altitude (degrees above the horizon) and azimuth (degrees clockwise from north) of a point given by
// right ascension and declination in degrees. The catalog stores right ascension as a longitude in
// -180..180, which is the same angle modulo 360, so it can be passed as it is.
// Observer longitude is positive east.
export function horizontalPosition(rightAscension, declination, observer, date) {
  const localSidereal = greenwichSiderealDegrees(date) + observer.longitude;
  const hourAngle = (localSidereal - rightAscension) * DEGREES;
  const latitude = observer.latitude * DEGREES;
  const dec = declination * DEGREES;

  const sinAltitude = Math.sin(latitude) * Math.sin(dec) + Math.cos(latitude) * Math.cos(dec) * Math.cos(hourAngle);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAltitude)));
  const azimuth = Math.atan2(
    -Math.cos(dec) * Math.sin(hourAngle),
    Math.sin(dec) * Math.cos(latitude) - Math.cos(dec) * Math.sin(latitude) * Math.cos(hourAngle),
  );
  return { altitude: altitude / DEGREES, azimuth: (((azimuth / DEGREES) % 360) + 360) % 360 };
}

export function compassName(azimuth) {
  const index = Math.round((((azimuth % 360) + 360) % 360) / 22.5) % 16;
  return COMPASS_POINTS[index];
}

// The distinct stars (as [rightAscension, declination]) that a constellation's lines connect.
export function constellationStars(polylines) {
  const seen = new Map();
  for (const line of polylines) for (const point of line) seen.set(`${point[0]},${point[1]}`, point);
  return [...seen.values()];
}

// Mean direction of a set of positions on the sky, as right ascension and declination in degrees.
// (A plain average of right ascensions fails across 0/360 degrees; averaging unit vectors does not.)
export function centerOf(stars) {
  let x = 0, y = 0, z = 0;
  for (const [ra, dec] of stars) {
    const a = ra * DEGREES, d = dec * DEGREES;
    x += Math.cos(d) * Math.cos(a);
    y += Math.cos(d) * Math.sin(a);
    z += Math.sin(d);
  }
  return {
    rightAscension: Math.atan2(y, x) / DEGREES,
    declination: Math.atan2(z, Math.hypot(x, y)) / DEGREES,
  };
}

// Classifies every constellation in the catalog for this place and moment.
//   "full"    every star of its pattern is above the horizon
//   "partial" some, but not all, are above the horizon
//   "none"    none are
// `lines` is the Map from loadCatalog (id → polylines).
export function visibleConstellations(lines, observer, date) {
  const result = [];
  for (const [id, polylines] of lines) {
    const stars = constellationStars(polylines);
    if (stars.length === 0) continue;

    const positions = stars.map(([ra, dec]) => horizontalPosition(ra, dec, observer, date));
    const above = positions.filter((position) => position.altitude > 0).length;
    const center = centerOf(stars);
    const centerPosition = horizontalPosition(center.rightAscension, center.declination, observer, date);

    result.push({
      id,
      starCount: stars.length,
      starsAbove: above,
      status: above === 0 ? "none" : above === stars.length ? "full" : "partial",
      lowestAltitude: Math.min(...positions.map((position) => position.altitude)),
      center: centerPosition, // altitude and azimuth of the pattern's centre (may be below the horizon)
    });
  }
  return result;
}

// Plain-language position, for the Learn view.
export function describePosition(position) {
  const height = Math.round(position.altitude);
  const direction = compassName(position.azimuth);
  if (position.altitude <= 0) return `below the horizon, toward the ${direction}`;
  return `about ${height}° above the horizon, toward the ${direction}`;
}
