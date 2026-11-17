// The look-around sky map: a wide patch of the real night sky for one place and moment, seen as if looking
// up from there. Drag to look around, pinch / wheel / buttons to zoom, tap a constellation to select it.
// The maths is in sky-projection.js (tested). This file draws and handles input.
//
// Non-colour cues: playable constellations have solid lines and a ▶ in their label; learn-only ones have
// dashed lines; filled ones are gold with a ✓. The card list on the same page is the accessible alternative,
// and the arrow keys, + and -, [ and ] work on the map itself.

import { constellationStars, greenwichSiderealDegrees } from "./sky-engine.js";
import { VIEW_LIMITS, arcPoints, clampView, directionVector, horizonVector, horizonVectorFromHourAngle, makeProjector, panView, pointSegmentDistance, starRadius, vectorToAzAlt, zoomView } from "./sky-projection.js";

const DEGREES = Math.PI / 180;
const PIXEL_RATIO_LIMIT = 2;
const BACKGROUND_CELL = 4; // the sky gradient is computed on a grid this many pixels wide, then scaled up
const TAP_MOVE_LIMIT = 6; // a press that moves less than this is a tap, not a drag
const HIT_RADIUS = 24; // a tap this close (pixels) to a constellation's lines or stars selects it
const KEY_PAN_DEGREES = 8;
const KEY_PAN_FAST_DEGREES = 24;
const KEY_ZOOM = 1.25;
const SMALL_FIGURE_PIXELS = 36; // unselected, unplayable figures smaller than this get no label

const COLORS = {
  line: "rgba(169, 156, 255, 0.62)",
  playable: "rgba(210, 202, 255, 0.98)",
  filled: "#ffd68c",
  selected: "#ffffff",
  label: "#e9e6ff",
  halo: "rgba(5, 6, 20, 0.85)",
  horizon: "rgba(190, 184, 255, 0.7)",
  ring: "rgba(160, 150, 240, 0.16)",
  compass: "#f4f1ff",
};
const COMPASS = [["N", 0], ["NE", 45], ["E", 90], ["SE", 135], ["S", 180], ["SW", 225], ["W", 270], ["NW", 315]];

const escapeText = (text) => {
  const span = document.createElement("span");
  span.textContent = text;
  return span.innerHTML;
};
const plural = (count, word, many = `${word}s`) => `${count} ${count === 1 ? word : many}`;

const TEMPLATE = `
  <p id="sky-legend" class="sky-legend">
    <span class="legend-item"><span class="legend-line legend-playable" aria-hidden="true"></span>▶ solid lines: you can play it</span>
    <span class="legend-item"><span class="legend-line legend-learn" aria-hidden="true"></span>dashed: learn only</span>
    <span class="legend-item"><span class="legend-line legend-filled" aria-hidden="true"></span>✓ gold: filled</span>
  </p>
  <div class="sky-stage">
    <canvas id="sky-canvas" tabindex="0" role="img" aria-label="Sky map" aria-describedby="sky-legend sky-keys"></canvas>
    <div class="sky-zoom" role="group" aria-label="Zoom and view">
      <button type="button" class="sky-button" data-zoom="in" aria-label="Zoom in">+</button>
      <button type="button" class="sky-button" data-zoom="out" aria-label="Zoom out">−</button>
      <button type="button" class="sky-button" data-reset aria-label="Reset the view">⟲</button>
    </div>
    <div id="sky-sheet" class="sky-sheet" role="region" aria-label="Selected constellation" hidden></div>
  </div>
  <div class="sky-compass" role="group" aria-label="Look toward">
    <button type="button" class="button" data-face="0">North</button>
    <button type="button" class="button" data-face="90">East</button>
    <button type="button" class="button" data-face="180">South</button>
    <button type="button" class="button" data-face="270">West</button>
    <button type="button" class="button" data-face="up">Overhead</button>
  </div>
  <p id="sky-keys" class="sr-only">Arrow keys look around. Plus and minus zoom. The bracket keys, [ and ], select the previous or next constellation.</p>
  <p id="sky-live" class="sr-only" role="status" aria-live="polite"></p>`;

// options: {
//   lines     Map of constellation id to its polylines of [right ascension, declination]
//   stars     rows of [hip, right ascension, declination, magnitude]
//   describe  (id) => { english, latin, status, starCount, starsAbove, playable, difficulty, positionText, reason, best }
//   onAction  (id, "play" | "learn") => void
// }
export function mountSkyMap(root, options) {
  root.innerHTML = TEMPLATE;
  const $ = (selector) => root.querySelector(selector);
  const canvas = $("#sky-canvas");
  const sheet = $("#sky-sheet");
  const live = $("#sky-live");

  const sky = { observer: null, date: null, entries: [], starVectors: [], starMagnitudes: [] };
  let view = { azimuth: 180, altitude: 35, fov: 100 };
  let selectedId = null;
  let redrawQueued = false;
  let destroyed = false;
  let lastDrawMs = 0;

  /* ---------- Sky data for one place and moment ---------- */

  function defaultView() {
    return { azimuth: sky.observer && sky.observer.latitude < 0 ? 0 : 180, altitude: 35, fov: 100 };
  }

  // entries: [{ id, status }] for constellations at least partly above the horizon.
  function setSky({ observer, date, entries }) {
    sky.observer = observer;
    sky.date = date;
    const localSidereal = greenwichSiderealDegrees(date) + observer.longitude;
    sky.starVectors = options.stars.map(([, ra, dec]) => horizonVectorFromHourAngle((localSidereal - ra) * DEGREES, dec, observer.latitude));
    sky.starMagnitudes = options.stars.map((row) => row[3]);

    sky.entries = entries.map((entry) => {
      const stars = constellationStars(options.lines.get(entry.id));
      const above = stars.map(([ra, dec]) => horizonVector(ra, dec, observer, date)).filter((vector) => vector[2] > 0);
      // Label anchor: the mean direction of the stars that are above the horizon.
      const sum = above.reduce((acc, vector) => [acc[0] + vector[0], acc[1] + vector[1], acc[2] + vector[2]], [0, 0, 0]);
      const length = Math.hypot(...sum) || 1;
      return {
        id: entry.id,
        status: entry.status,
        polylines: options.lines.get(entry.id).map((line) => line.map(([ra, dec]) => horizonVector(ra, dec, observer, date))),
        anchor: sum.map((component) => component / length),
      };
    });
    select(null, { announceIt: false }); // a new place or moment starts with nothing selected
    view = defaultView();
    canvas.setAttribute("aria-label", `Sky map: ${plural(sky.entries.length, "constellation")} above the horizon. Drag to look around, or use the arrow keys.`);
    requestDraw();
  }

  /* ---------- Drawing ---------- */

  function sizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const ratio = Math.min(window.devicePixelRatio || 1, PIXEL_RATIO_LIMIT);
    const width = Math.round(rect.width * ratio);
    const height = Math.round(rect.height * ratio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    return { cssWidth: rect.width, cssHeight: rect.height, ratio };
  }

  // Sky and ground, shaded by height above the horizon, computed on a coarse grid and scaled up smoothly.
  let backgroundCanvas = null;
  function drawBackground(ctx, projector, size) {
    const columns = Math.max(1, Math.ceil(size.cssWidth / BACKGROUND_CELL));
    const rows = Math.max(1, Math.ceil(size.cssHeight / BACKGROUND_CELL));
    if (!backgroundCanvas) backgroundCanvas = document.createElement("canvas");
    if (backgroundCanvas.width !== columns || backgroundCanvas.height !== rows) {
      backgroundCanvas.width = columns;
      backgroundCanvas.height = rows;
    }
    const bctx = backgroundCanvas.getContext("2d");
    const image = bctx.createImageData(columns, rows);
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const vector = projector.unproject((column + 0.5) * BACKGROUND_CELL, (row + 0.5) * BACKGROUND_CELL);
        const altitude = Math.asin(Math.max(-1, Math.min(1, vector[2]))) / DEGREES;
        let r, g, b;
        if (altitude < 0) {
          const depth = Math.min(1, -altitude / 25);
          r = 9 - 3 * depth; g = 9 - 3 * depth; b = 20 - 6 * depth; // dark ground, a touch lighter at the horizon
        } else {
          const t = Math.pow(1 - Math.min(1, altitude / 90), 2.4);
          const glow = Math.max(0, 1 - altitude / 9) * 18; // a soft band along the horizon
          r = 7 + 30 * t + glow; g = 8 + 30 * t + glow * 0.9; b = 26 + 72 * t + glow * 1.4;
        }
        const index = (row * columns + column) * 4;
        image.data[index] = r; image.data[index + 1] = g; image.data[index + 2] = b; image.data[index + 3] = 255;
      }
    }
    bctx.putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(backgroundCanvas, 0, 0, columns * BACKGROUND_CELL, rows * BACKGROUND_CELL);
  }

  // Draws a path through projected directions, lifting the pen where the line is behind the viewer or below
  // the horizon (when `aboveHorizon`).
  function strokePath(ctx, projector, vectors, aboveHorizon) {
    ctx.beginPath();
    let penDown = false;
    for (const vector of vectors) {
      const point = aboveHorizon && vector[2] < 0 ? null : projector.project(vector);
      if (!point) { penDown = false; continue; }
      if (penDown) ctx.lineTo(point.x, point.y);
      else { ctx.moveTo(point.x, point.y); penDown = true; }
    }
    ctx.stroke();
  }

  function ringVectors(altitude) {
    const vectors = [];
    for (let azimuth = 0; azimuth <= 360; azimuth += 3) vectors.push(directionVector(azimuth, altitude));
    return vectors;
  }

  function haloText(ctx, text, x, y) {
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = COLORS.halo;
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
  }

  function styleFor(entry, state) {
    if (entry.id === selectedId) return { color: COLORS.selected, width: 3.2, dash: [], glow: 10 };
    if (state.best != null) return { color: COLORS.filled, width: 2.6, dash: [], glow: 5 };
    if (state.playable) return { color: COLORS.playable, width: 2.1, dash: [], glow: 0 };
    return { color: COLORS.line, width: 1.3, dash: [5, 4], glow: 0 };
  }

  // The segments of an entry's figure as projected pieces (for drawing and for tap tests).
  function figureSegments(entry, projector) {
    const segments = [];
    for (const line of entry.polylines) {
      for (let i = 0; i < line.length - 1; i += 1) {
        const points = arcPoints(line[i], line[i + 1]).filter((vector) => vector[2] >= 0).map((vector) => projector.project(vector));
        for (let k = 0; k < points.length - 1; k += 1) {
          if (points[k] && points[k + 1]) segments.push([points[k].x, points[k].y, points[k + 1].x, points[k + 1].y]);
        }
      }
    }
    return segments;
  }

  function draw() {
    redrawQueued = false;
    if (destroyed) return;
    const size = sizeCanvas();
    if (!size || !sky.observer) return;
    const started = performance.now();
    const ctx = canvas.getContext("2d");
    ctx.setTransform(size.ratio, 0, 0, size.ratio, 0, 0);
    const projector = makeProjector(view, size.cssWidth, size.cssHeight);
    const onScreen = (p) => p && p.x > -20 && p.x < size.cssWidth + 20 && p.y > -20 && p.y < size.cssHeight + 20;

    drawBackground(ctx, projector, size);

    // Height rings every 30 degrees, then the horizon
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 6]);
    ctx.strokeStyle = COLORS.ring;
    for (const altitude of [30, 60]) strokePath(ctx, projector, ringVectors(altitude), false);
    ctx.setLineDash([]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = COLORS.horizon;
    strokePath(ctx, projector, ringVectors(0), false);

    // Stars above the horizon, sized by brightness
    ctx.fillStyle = "#f4f2ff";
    for (let i = 0; i < sky.starVectors.length; i += 1) {
      const vector = sky.starVectors[i];
      if (vector[2] <= 0) continue;
      const point = projector.project(vector);
      if (!onScreen(point)) continue;
      const radius = starRadius(sky.starMagnitudes[i], view.fov);
      ctx.globalAlpha = Math.min(1, 0.35 + radius / 3);
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Constellation figures
    const states = new Map(sky.entries.map((entry) => [entry.id, options.describe(entry.id)]));
    const ordered = [...sky.entries].sort((a, b) => (a.id === selectedId) - (b.id === selectedId));
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const entry of ordered) {
      const style = styleFor(entry, states.get(entry.id));
      ctx.strokeStyle = style.color;
      ctx.lineWidth = style.width;
      ctx.setLineDash(style.dash);
      ctx.shadowColor = style.color;
      ctx.shadowBlur = style.glow;
      for (const line of entry.polylines) {
        for (let i = 0; i < line.length - 1; i += 1) strokePath(ctx, projector, arcPoints(line[i], line[i + 1]), true);
      }
    }
    ctx.shadowBlur = 0;
    ctx.setLineDash([]);

    // Labels (selected first, then playable and filled, then the rest), skipping ones that would overlap
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const placed = [];
    const priority = (entry) => (entry.id === selectedId ? 0 : states.get(entry.id).best != null ? 1 : states.get(entry.id).playable ? 2 : 3);
    for (const entry of [...sky.entries].sort((a, b) => priority(a) - priority(b))) {
      const state = states.get(entry.id);
      const point = projector.project(entry.anchor);
      if (!onScreen(point)) continue;
      if (priority(entry) === 3) {
        const segments = figureSegments(entry, projector);
        const span = segments.reduce((widest, [x1, y1, x2, y2]) => Math.max(widest, Math.hypot(x2 - x1, y2 - y1)), 0) * Math.sqrt(Math.max(1, segments.length));
        if (span < SMALL_FIGURE_PIXELS) continue;
      }
      const prefix = state.best != null ? "✓ " : state.playable ? "▶ " : "";
      const text = `${prefix}${state.english}`;
      ctx.font = `${entry.id === selectedId ? 700 : 600} ${entry.id === selectedId ? 14 : 12}px ui-sans-serif, -apple-system, "Segoe UI", sans-serif`;
      const width = ctx.measureText(text).width + 8;
      // Slide the label inside the screen so a constellation near the edge can still be read.
      const x = Math.min(size.cssWidth - width / 2 - 2, Math.max(width / 2 + 2, point.x));
      const y = Math.min(size.cssHeight - 12, Math.max(12, point.y));
      const box = [x - width / 2, y - 9, x + width / 2, y + 9];
      if (priority(entry) > 0 && placed.some((other) => box[0] < other[2] && box[2] > other[0] && box[1] < other[3] && box[3] > other[1])) continue;
      placed.push(box);
      ctx.fillStyle = state.best != null ? COLORS.filled : COLORS.label;
      haloText(ctx, text, x, y);
    }

    // Compass letters just above the horizon
    ctx.font = "700 13px ui-sans-serif, -apple-system, 'Segoe UI', sans-serif";
    ctx.fillStyle = COLORS.compass;
    for (const [letter, azimuth] of COMPASS) {
      const point = projector.project(directionVector(azimuth, 2.5));
      if (onScreen(point)) haloText(ctx, letter, point.x, point.y);
    }

    lastDrawMs = performance.now() - started;
    canvas.dataset.az = view.azimuth.toFixed(2);
    canvas.dataset.alt = view.altitude.toFixed(2);
    canvas.dataset.fov = view.fov.toFixed(2);
    canvas.dataset.drawMs = lastDrawMs.toFixed(1);
    canvas.dataset.selected = selectedId || "";
  }

  function requestDraw() {
    if (redrawQueued || destroyed) return;
    redrawQueued = true;
    requestAnimationFrame(draw);
  }

  /* ---------- Selection ---------- */

  function announce(message) {
    live.textContent = "";
    live.textContent = message;
  }

  function renderSheet() {
    if (!selectedId) { sheet.hidden = true; sheet.replaceChildren(); return; }
    const state = options.describe(selectedId);
    const chips = [
      `<span class="chip">${plural(state.starCount, "star")}</span>`,
      state.playable ? `<span class="chip">${escapeText(state.difficulty)}</span>` : "",
      `<span class="chip">${escapeText(state.positionText)}</span>`,
    ].join("");
    let note = "";
    if (state.best != null) note = `<p class="card-note card-done">✓ Filled in ${plural(state.best, "launch", "launches")}</p>`;
    else if (state.status === "partial") note = '<p class="card-note">Only part of it was above the horizon, so you can learn about it but not play it.</p>';
    else if (!state.playable) note = `<p class="card-note">${escapeText(state.reason)}</p>`;

    sheet.innerHTML = `
      <div class="sheet-head">
        <div>
          <h3>${escapeText(state.english)}</h3>
          ${state.english !== state.latin ? `<p class="card-sub">${escapeText(state.latin)}</p>` : ""}
        </div>
        <button type="button" class="sky-button sheet-close" data-close aria-label="Close ${escapeText(state.english)}">×</button>
      </div>
      <p class="card-meta">${chips}</p>
      ${note}
      <div class="card-actions">
        ${state.playable ? `<button class="button button-primary" type="button" data-action="play" aria-label="Play ${escapeText(state.english)}">${state.best != null ? "Play again" : "Play"}</button>` : ""}
        <button class="button" type="button" data-action="learn" aria-label="Learn about ${escapeText(state.english)}">Learn</button>
      </div>`;
    sheet.hidden = false;
  }

  function select(id, { announceIt = true } = {}) {
    selectedId = id;
    renderSheet();
    requestDraw();
    if (id && announceIt) {
      const state = options.describe(id);
      announce(`${state.english} selected. ${state.playable ? "You can play it or learn about it." : state.status === "partial" ? "Partly above the horizon: learn only." : "Learn only."}`);
    } else if (!id && announceIt) announce("Selection cleared.");
  }

  sheet.addEventListener("click", (event) => {
    if (event.target.closest("[data-close]")) { select(null); canvas.focus({ preventScroll: true }); return; }
    const button = event.target.closest("button[data-action]");
    if (button && selectedId) options.onAction(selectedId, button.dataset.action);
  });

  // Which constellation's lines are within reach of a tap at (x, y)? Only the part of a figure that is on
  // the screen counts: a figure far off to the side can project near a corner but is not what was tapped.
  function hitTest(x, y, projector) {
    const bounds = canvas.getBoundingClientRect();
    const onScreen = (px, py) => px >= -8 && px <= bounds.width + 8 && py >= -8 && py <= bounds.height + 8;
    let best = null;
    for (const entry of sky.entries) {
      let distance = Infinity;
      for (const [x1, y1, x2, y2] of figureSegments(entry, projector)) {
        if (!onScreen(x1, y1) && !onScreen(x2, y2)) continue;
        distance = Math.min(distance, pointSegmentDistance(x, y, x1, y1, x2, y2));
      }
      if (distance <= HIT_RADIUS && (!best || distance < best.distance)) best = { id: entry.id, distance };
    }
    return best && best.id;
  }

  // Looks at a constellation: the view turns to its centre.
  function centerOn(id) {
    const entry = sky.entries.find((item) => item.id === id);
    if (!entry) return;
    const { azimuth, altitude } = vectorToAzAlt(entry.anchor);
    view = clampView({ ...view, azimuth, altitude: Math.max(altitude, 10) });
    requestDraw();
  }

  function step(direction) {
    if (sky.entries.length === 0) return;
    const sorted = [...sky.entries].sort((a, b) => vectorToAzAlt(a.anchor).azimuth - vectorToAzAlt(b.anchor).azimuth);
    const index = sorted.findIndex((entry) => entry.id === selectedId);
    const next = sorted[(index + direction + sorted.length) % sorted.length];
    select(next.id);
    centerOn(next.id);
  }

  /* ---------- Looking around: drag, pinch, wheel, keys, buttons ---------- */

  const pointers = new Map();
  let drag = null;
  let pinch = null;

  const projectorNow = () => {
    const rect = canvas.getBoundingClientRect();
    return makeProjector(view, rect.width, rect.height);
  };

  canvas.addEventListener("pointerdown", (event) => {
    if (event.button > 0) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try { canvas.setPointerCapture(event.pointerId); } catch { /* synthetic pointers cannot be captured */ }
    if (pointers.size === 1) drag = { startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: 0 };
    else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), fov: view.fov };
      drag = null;
    }
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (distance > 0) { view = clampView({ ...view, fov: pinch.fov * (pinch.distance / distance) }); requestDraw(); }
      return;
    }
    if (!drag) return;
    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.moved = Math.max(drag.moved, Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY));
    if (drag.moved >= TAP_MOVE_LIMIT) {
      view = panView(view, dx, dy, projectorNow().pixelsPerUnit);
      requestDraw();
    }
  });

  function endPointer(event) {
    const wasTap = drag && drag.moved < TAP_MOVE_LIMIT && pointers.size === 1 && event.type === "pointerup";
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
    if (wasTap) {
      const rect = canvas.getBoundingClientRect();
      const id = hitTest(event.clientX - rect.left, event.clientY - rect.top, projectorNow());
      select(id);
    }
    if (pointers.size === 0) drag = null;
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);

  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    view = zoomView(view, Math.exp(-event.deltaY * 0.0015));
    requestDraw();
  }, { passive: false });

  canvas.addEventListener("keydown", (event) => {
    const pan = event.shiftKey ? KEY_PAN_FAST_DEGREES : KEY_PAN_DEGREES;
    if (event.key === "ArrowLeft") view = clampView({ ...view, azimuth: view.azimuth - pan });
    else if (event.key === "ArrowRight") view = clampView({ ...view, azimuth: view.azimuth + pan });
    else if (event.key === "ArrowUp") view = clampView({ ...view, altitude: view.altitude + pan });
    else if (event.key === "ArrowDown") view = clampView({ ...view, altitude: view.altitude - pan });
    else if (event.key === "+" || event.key === "=") view = zoomView(view, KEY_ZOOM);
    else if (event.key === "-" || event.key === "_") view = zoomView(view, 1 / KEY_ZOOM);
    else if (event.key === "Home") view = defaultView();
    else if (event.key === "]") step(1);
    else if (event.key === "[") step(-1);
    else if (event.key === "Escape" && selectedId) select(null);
    else return;
    event.preventDefault();
    requestDraw();
  });

  root.querySelectorAll("[data-zoom]").forEach((button) => {
    button.addEventListener("click", () => { view = zoomView(view, button.dataset.zoom === "in" ? KEY_ZOOM : 1 / KEY_ZOOM); requestDraw(); });
  });
  root.querySelector("[data-reset]").addEventListener("click", () => { view = defaultView(); requestDraw(); });
  root.querySelectorAll("[data-face]").forEach((button) => {
    button.addEventListener("click", () => {
      view = button.dataset.face === "up" ? clampView({ ...view, altitude: VIEW_LIMITS.maxAltitude }) : clampView({ ...view, azimuth: Number(button.dataset.face), altitude: Math.min(view.altitude, 60) });
      requestDraw();
    });
  });

  const observer = new ResizeObserver(requestDraw);
  observer.observe(canvas);

  return {
    setSky,
    select,
    getSelected: () => selectedId,
    getView: () => ({ ...view }),
    refresh() { renderSheet(); requestDraw(); }, // after the player fills a constellation, say
    focusCanvas: () => canvas.focus({ preventScroll: true }),
    focusSheetAction(action) {
      const button = sheet.querySelector(`button[data-action="${action}"]`) || sheet.querySelector("button[data-action]");
      if (button) { button.focus({ preventScroll: true }); return true; }
      return false;
    },
    destroy() { destroyed = true; observer.disconnect(); root.replaceChildren(); },
  };
}
