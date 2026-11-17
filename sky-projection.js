// The maths behind the look-around sky map. Pure functions: no DOM, no canvas.
//
// The sky is seen from the ground, in a "horizon frame" of unit vectors [east, north, up]. A view looks in
// the direction (azimuth, altitude) with a field of view across the screen's shorter side, and the sky is
// drawn with a stereographic projection: every shape, such as a constellation, keeps its true form at any
// zoom, and circles on the sky stay circles on the screen.
//
// Conventions: azimuth is measured clockwise from north (0 north, 90 east, 180 south, 270 west); altitude
// is degrees above the horizon. Facing south, east is on your left, as when you look at the real sky.

import { greenwichSiderealDegrees } from "./sky-engine.js";

const DEGREES = Math.PI / 180;

export const VIEW_LIMITS = Object.freeze({
  minFov: 25, // degrees across the shorter screen side when fully zoomed in
  maxFov: 140, // fully zoomed out
  minAltitude: -5, // you may look a little below the horizon
  maxAltitude: 90, // straight up
});

const wrapAzimuth = (degrees) => ((degrees % 360) + 360) % 360;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// A direction in the horizon frame [east, north, up].
export function directionVector(azimuth, altitude) {
  const az = azimuth * DEGREES;
  const alt = altitude * DEGREES;
  return [Math.cos(alt) * Math.sin(az), Math.cos(alt) * Math.cos(az), Math.sin(alt)];
}

export function vectorToAzAlt(vector) {
  const [east, north, up] = vector;
  return {
    azimuth: wrapAzimuth(Math.atan2(east, north) / DEGREES),
    altitude: Math.asin(clamp(up, -1, 1)) / DEGREES,
  };
}

// The horizon-frame vector of a star at right ascension and declination (degrees), seen from `observer`
// at `date`. Uses the same sidereal-time and spherical formulas as sky-engine.js, which is verified against
// d3-celestial's sky, so the map and the constellation list always agree.
export function horizonVector(rightAscension, declination, observer, date) {
  const hourAngle = (greenwichSiderealDegrees(date) + observer.longitude - rightAscension) * DEGREES;
  return horizonVectorFromHourAngle(hourAngle, declination, observer.latitude);
}

// The same, when the hour angle (radians) is already known: lets a whole star table share one sidereal time.
export function horizonVectorFromHourAngle(hourAngle, declination, latitude) {
  const dec = declination * DEGREES;
  const lat = latitude * DEGREES;
  return [
    -Math.cos(dec) * Math.sin(hourAngle),
    Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.sin(lat) * Math.cos(hourAngle),
    Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hourAngle),
  ];
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// The screen's three axes in the horizon frame: forward (where you look), right, and up.
export function viewBasis(azimuth, altitude) {
  const az = azimuth * DEGREES;
  const forward = directionVector(azimuth, altitude);
  const right = [Math.cos(az), -Math.sin(az), 0]; // stays defined even when looking straight up
  const up = [
    right[1] * forward[2],
    -right[0] * forward[2],
    right[0] * forward[1] - right[1] * forward[0],
  ];
  return { forward, right, up };
}

// view: { azimuth, altitude, fov }. Returns functions to go between sky directions and screen pixels.
export function makeProjector(view, width, height) {
  const basis = viewBasis(view.azimuth, view.altitude);
  // Stereographic radius is 2·tan(θ/2); the screen's shorter half-side must correspond to half the field of view.
  const pixelsPerUnit = Math.min(width, height) / 2 / (2 * Math.tan((view.fov * DEGREES) / 4));
  const centerX = width / 2;
  const centerY = height / 2;

  return {
    pixelsPerUnit,
    basis,
    // Returns { x, y } in pixels, or null for directions behind the viewer (too close to the opposite point).
    project(vector) {
      const forward = dot(vector, basis.forward);
      if (forward < -0.97) return null;
      const scale = (2 * pixelsPerUnit) / (1 + forward);
      return { x: centerX + dot(vector, basis.right) * scale, y: centerY - dot(vector, basis.up) * scale };
    },
    // The direction (horizon-frame unit vector) shown at a pixel.
    unproject(x, y) {
      const X = (x - centerX) / pixelsPerUnit;
      const Y = (centerY - y) / pixelsPerUnit;
      const r2 = X * X + Y * Y;
      const forward = (4 - r2) / (4 + r2);
      const factor = (1 + forward) / 2;
      const a = X * factor;
      const b = Y * factor;
      return [
        a * basis.right[0] + b * basis.up[0] + forward * basis.forward[0],
        a * basis.right[1] + b * basis.up[1] + forward * basis.forward[1],
        a * basis.right[2] + b * basis.up[2] + forward * basis.forward[2],
      ];
    },
  };
}

export function clampView(view) {
  return {
    azimuth: wrapAzimuth(view.azimuth),
    altitude: clamp(view.altitude, VIEW_LIMITS.minAltitude, VIEW_LIMITS.maxAltitude),
    fov: clamp(view.fov, VIEW_LIMITS.minFov, VIEW_LIMITS.maxFov),
  };
}

// Dragging by (dx, dy) pixels moves the sky with the finger: a drag to the right turns the view left
// (smaller azimuth), a drag down tilts the view up. Near the zenith a sideways drag turns the azimuth faster,
// as it does on the real sky, but never faster than 5 times, so the view cannot spin wildly.
export function panView(view, dx, dy, pixelsPerUnit) {
  const degreesPerPixel = 1 / pixelsPerUnit / DEGREES;
  const sideways = 1 / Math.max(Math.cos(view.altitude * DEGREES), 0.2);
  return clampView({
    ...view,
    azimuth: view.azimuth - dx * degreesPerPixel * sideways,
    altitude: view.altitude + dy * degreesPerPixel,
  });
}

// Zooms by a factor (above 1 zooms in).
export function zoomView(view, factor) {
  return clampView({ ...view, fov: view.fov / factor });
}

// The great-circle path between two unit vectors, as points, so a line between far-apart stars curves
// the way it does on the real sky. About one point per 5 degrees.
export function arcPoints(a, b) {
  const angle = Math.acos(clamp(dot(a, b), -1, 1));
  const steps = Math.max(1, Math.ceil(angle / (5 * DEGREES)));
  if (angle < 1e-9) return [a];
  const points = [];
  const sinAngle = Math.sin(angle);
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const wa = Math.sin((1 - t) * angle) / sinAngle;
    const wb = Math.sin(t * angle) / sinAngle;
    points.push([wa * a[0] + wb * b[0], wa * a[1] + wb * b[1], wa * a[2] + wb * b[2]]);
  }
  return points;
}

export function pointSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : clamp(((px - x1) * dx + (py - y1) * dy) / lengthSquared, 0, 1);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// Size of a star's dot in pixels from its magnitude (smaller magnitude = brighter = bigger), with a
// little growth as you zoom in.
export function starRadius(magnitude, fov) {
  const zoomGrowth = 1 + (VIEW_LIMITS.maxFov - fov) / VIEW_LIMITS.maxFov;
  return clamp((6.6 - magnitude) * 0.5 * zoomGrowth, 0.6, 5.5);
}
