"use strict";

const { DateTime, IANAZone } = luxon;

const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const MAX_PLACE_RESULTS = 8;
const MIN_PLACE_QUERY_LENGTH = 2;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;
const DISPLAY_LOCALE = "en-US";
const MOOD_NAMES = { calm: "Calm", energized: "Energized" };

const WALLPAPER_WIDTH = 1179;
const WALLPAPER_HEIGHT = 2556;
const PREVIEW_PIXEL_RATIO_LIMIT = 2;
const STYLE_REFERENCE_WIDTH = 450; // wallpaper width at which the d3-celestial sizes below read well
const MAP_RENDER_SETTLE_MS = 100; // d3-celestial draws shortly after resize/skyview
// Constellations ranked 1..ranksShown show names (d3-celestial ranks 1-3, most to least prominent).
// Lines and stars never change with this rule.
const LABELS = { ranksShown: 1 };
const EXPORT_FILE_NAME = "inner-orbit-memory-sky.png";

// The sky fills the whole wallpaper. All positions are fractions of it so preview and
// export agree. Essential text stays inside the middle 80% and below the Lock Screen clock area.
const LAYOUT = {
  mapOverscan: 1.02, // the sky disc is this much larger than the screen diagonal, so its horizon edge is off-screen
  textTop: 0.76, // × height
  textMaxWidth: 0.8, // × width
  titleSize: 0.056, // × width
  detailSize: 0.032, // × width
  lineHeight: 1.18,
  scrimStart: 0.6, // × height: fade behind the text block begins
  scrimFull: 0.78, // × height: fade reaches full strength
};

// Mood changes color and glow only; it never moves anything.
const MOODS = {
  calm: {
    backgroundTop: "#111342",
    backgroundBottom: "#060719",
    haze: "rgba(118, 105, 230, 0.26)",
    scrim: "6, 7, 25",
    star: "#e6e2ff",
    line: "#a99cff",
    label: "#cfc8ff",
    text: "#f1efff",
    detail: "#b9b4e6",
    lineOpacity: 0.7,
  },
  energized: {
    backgroundTop: "#3d143e",
    backgroundBottom: "#10071c",
    haze: "rgba(255, 104, 103, 0.3)",
    scrim: "16, 7, 28",
    star: "#fff3dc",
    line: "#ff9d93",
    label: "#ffd2c8",
    text: "#fff4ef",
    detail: "#ffc2b8",
    lineOpacity: 0.85,
  },
};

// Single source of truth. The DOM and the sky map are both derived from it.
const state = {
  memoryTitle: "",
  placeQuery: "",
  searchResults: [], // candidates from the last explicit search
  place: null, // selected candidate: { label, latitude, longitude, timezone }
  localDate: "", // YYYY-MM-DD, interpreted in the selected place's zone
  localTime: "", // HH:mm
  disambiguation: null, // "earlier" | "later" when the clock time happened twice
  mood: "calm",
  instant: null, // resolved UTC Date, or null while incomplete
  timeIssue: null, // "gap" | "ambiguous" | null
  timeChoices: [], // candidate instants (ms) when ambiguous
};

const elements = {
  form: document.querySelector("#memory-form"),
  title: document.querySelector("#memory-title"),
  placeQuery: document.querySelector("#place-query"),
  placeSearch: document.querySelector("#place-search"),
  placeStatus: document.querySelector("#place-status"),
  placeResults: document.querySelector("#place-results"),
  placeOptions: document.querySelector("#place-options"),
  date: document.querySelector("#local-date"),
  time: document.querySelector("#local-time"),
  timeChoice: document.querySelector("#time-choice"),
  timeChoiceOptions: document.querySelector("#time-choice-options"),
  summary: document.querySelector("#result-summary"),
  status: document.querySelector("#app-status"),
  phoneFrame: document.querySelector(".phone-frame"),
  previewCanvas: document.querySelector("#preview-canvas"),
  skyMap: document.querySelector("#sky-map"),
  skyPlaceholder: document.querySelector("#sky-placeholder"),
  exportButton: document.querySelector("#submit-button"),
};

const errorElements = {
  title: document.querySelector("#memory-title-error"),
  place: document.querySelector("#place-error"),
  date: document.querySelector("#local-date-error"),
  time: document.querySelector("#local-time-error"),
};
const errorInputs = {
  title: elements.title,
  place: elements.placeQuery,
  date: elements.date,
  time: elements.time,
};

let searchToken = 0; // lets a newer search or edit discard an older response
let errorsRevealed = false;

/* ---------- Time ---------- */

// Every UTC instant at which `date` + `time` shows on the clock in `zone`.
// Zero matches means a DST gap; two means a fall-back repeat. Native Date and
// Luxon's default parsing would silently pick one, so we enumerate instead.
function matchingInstants(localDate, localTime, zoneName) {
  const [year, month, day] = localDate.split("-").map(Number);
  const [hour, minute] = localTime.split(":").map(Number);
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const zone = IANAZone.create(zoneName);
  const DAY = 86400000;
  const candidateOffsets = new Set([zone.offset(localAsUtc - DAY), zone.offset(localAsUtc + DAY)]);

  return [...candidateOffsets]
    .map((offsetMinutes) => localAsUtc - offsetMinutes * 60000)
    .filter((utc) => zone.offset(utc) === (localAsUtc - utc) / 60000)
    .sort((a, b) => a - b);
}

function zonedDateTime(instantMs, zoneName) {
  return DateTime.fromMillis(instantMs, { zone: zoneName }).setLocale(DISPLAY_LOCALE);
}

function offsetLabel(dateTime) {
  return `${dateTime.toFormat("ZZZZ")}, UTC${dateTime.toFormat("ZZ")}`;
}

// Recomputes state.instant / timeIssue from the current inputs.
function resolveTime() {
  state.instant = null;
  state.timeIssue = null;
  state.timeChoices = [];

  const hasInputs = state.place && state.localDate && state.localTime;
  const year = Number(state.localDate.slice(0, 4));
  if (!hasInputs || year < MIN_YEAR || year > MAX_YEAR) return;

  const matches = matchingInstants(state.localDate, state.localTime, state.place.timezone);
  if (matches.length === 0) {
    state.timeIssue = "gap";
  } else if (matches.length === 1) {
    state.instant = new Date(matches[0]);
  } else {
    state.timeIssue = "ambiguous";
    state.timeChoices = matches;
    const index = { earlier: 0, later: 1 }[state.disambiguation];
    if (index !== undefined) state.instant = new Date(matches[index]);
  }
}

/* ---------- Place search ---------- */

function placeLabel(result) {
  const parts = [result.name, result.admin2, result.admin1, result.country]
    .filter(Boolean)
    .filter((part, index, all) => all.indexOf(part) === index);
  return parts.join(", ");
}

function toCandidate(result) {
  return {
    id: result.id,
    label: placeLabel(result),
    latitude: result.latitude,
    longitude: result.longitude,
    timezone: result.timezone,
  };
}

function setPlaceStatus(message = "", tone = "") {
  elements.placeStatus.textContent = message;
  if (tone) elements.placeStatus.dataset.tone = tone;
  else delete elements.placeStatus.dataset.tone;
}

function clearSearchResults() {
  state.searchResults = [];
  renderPlaceOptions();
}

async function searchPlaces() {
  const query = elements.placeQuery.value.trim();
  if (query.length < MIN_PLACE_QUERY_LENGTH) {
    setPlaceStatus(`Type at least ${MIN_PLACE_QUERY_LENGTH} characters, then choose Find place.`, "error");
    elements.placeQuery.focus();
    return;
  }

  const token = (searchToken += 1);
  state.place = null;
  clearSearchResults();
  elements.placeSearch.disabled = true;
  setPlaceStatus("Searching Open-Meteo…");
  refresh();

  try {
    // Only the place text leaves the browser.
    const url = `${GEOCODING_URL}?name=${encodeURIComponent(query)}&count=${MAX_PLACE_RESULTS}&language=en&format=json`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Geocoding returned ${response.status}`);
    const data = await response.json();
    if (token !== searchToken) return; // the User edited or searched again

    const candidates = (data.results ?? []).filter((result) => result.timezone).map(toCandidate);
    state.searchResults = candidates;
    renderPlaceOptions();
    if (candidates.length === 0) {
      setPlaceStatus(`No places found for “${query}”. Check the spelling or try a nearby city.`, "error");
    } else {
      setPlaceStatus(`${candidates.length} ${candidates.length === 1 ? "place" : "places"} found. Choose the one you meant.`);
    }
  } catch {
    if (token !== searchToken) return;
    setPlaceStatus("Place search failed. Check your connection and choose Find place to try again. Your other entries are unchanged.", "error");
  } finally {
    if (token === searchToken) elements.placeSearch.disabled = false;
  }
}

/* ---------- Radio-style choice lists ---------- */

function optionMarkup({ name, value, title, detail, checked }) {
  return `
    <label class="choice-card">
      <input type="radio" name="${name}" value="${value}"${checked ? " checked" : ""}>
      <span class="choice-copy">
        <strong>${title}</strong>
        <small>${detail}</small>
      </span>
    </label>`;
}

function escapeHtml(text) {
  const span = document.createElement("span");
  span.textContent = text;
  return span.innerHTML;
}

function renderPlaceOptions() {
  elements.placeResults.hidden = state.searchResults.length === 0;
  elements.placeOptions.innerHTML = state.searchResults
    .map((place, index) =>
      optionMarkup({
        name: "place-choice",
        value: index,
        title: escapeHtml(place.label),
        detail: `${escapeHtml(place.timezone)} · ${place.latitude.toFixed(2)}°, ${place.longitude.toFixed(2)}°`,
        checked: state.place?.id === place.id,
      }),
    )
    .join("");
}

function renderTimeChoices() {
  const ambiguous = state.timeIssue === "ambiguous";
  elements.timeChoice.hidden = !ambiguous;
  if (!ambiguous) {
    elements.timeChoiceOptions.replaceChildren();
    return;
  }

  const labels = ["Earlier", "Later"];
  elements.timeChoiceOptions.innerHTML = state.timeChoices
    .map((instantMs, index) =>
      optionMarkup({
        name: "time-choice",
        value: index === 0 ? "earlier" : "later",
        title: labels[index],
        detail: escapeHtml(offsetLabel(zonedDateTime(instantMs, state.place.timezone))),
        checked: state.disambiguation === (index === 0 ? "earlier" : "later"),
      }),
    )
    .join("");
}

/* ---------- Validation and summary ---------- */

function fieldProblems() {
  const problems = {};
  if (!state.memoryTitle.trim()) problems.title = "Enter a title for this memory.";
  if (!state.place) {
    problems.place = state.placeQuery.trim()
      ? "Choose Find place, then select the place you meant."
      : "Enter a place and choose Find place.";
  }

  const year = Number(state.localDate.slice(0, 4));
  if (!state.localDate) problems.date = "Enter the date.";
  else if (year < MIN_YEAR || year > MAX_YEAR) problems.date = `Enter a year between ${MIN_YEAR} and ${MAX_YEAR}.`;

  if (!state.localTime) problems.time = "Enter the approximate local time.";
  else if (state.timeIssue === "gap") {
    problems.time = `That time does not exist in ${state.place.timezone} on this date because clocks skipped forward. Choose another time.`;
  } else if (state.timeIssue === "ambiguous" && !state.disambiguation) {
    problems.time = "Choose the earlier or later occurrence of this time.";
  }
  return problems;
}

function showFieldProblems(problems) {
  for (const key of Object.keys(errorElements)) {
    const message = problems[key] ?? "";
    errorElements[key].textContent = message;
    errorInputs[key].setAttribute("aria-invalid", message ? "true" : "false");
  }
}

// Time-zone problems are shown at once; "required" problems wait for a submit.
function visibleProblems() {
  const problems = fieldProblems();
  if (errorsRevealed) return problems;
  const immediate = {};
  if (problems.time && state.timeIssue) immediate.time = problems.time;
  return immediate;
}

function describeSky() {
  if (!state.instant) return null;
  const local = zonedDateTime(state.instant.getTime(), state.place.timezone);
  const when = `${local.toFormat("LLLL d, yyyy")} at ${local.toFormat("h:mm a")} (${offsetLabel(local)})`;
  const title = state.memoryTitle.trim();
  return {
    local,
    text:
      `${title ? `“${title}” — ` : ""}${state.place.label}, ${when}, ${state.place.timezone}. ` +
      `The map shows the stars and constellations above the horizon at that moment, centered on the point overhead. ` +
      `Atmosphere: ${MOOD_NAMES[state.mood]}.`,
  };
}

function updateSummary() {
  const description = describeSky();
  if (description) {
    elements.summary.textContent = description.text;
    elements.previewCanvas.setAttribute("aria-label", description.text);
    return;
  }

  const missing = [];
  if (!state.memoryTitle.trim()) missing.push("a title");
  if (!state.place) missing.push("a selected place");
  if (!state.localDate) missing.push("a date");
  if (!state.localTime) missing.push("a time");
  elements.summary.textContent = missing.length
    ? `No memory sky yet. Still needed: ${missing.join(", ")}.`
    : "Resolve the time issue above to see the sky.";
  elements.previewCanvas.setAttribute("aria-label", "Wallpaper preview appears after you choose a place, date, and time.");
}

/* ---------- Sky map (d3-celestial) ---------- */

// d3-celestial owns one global canvas. Everything that touches it runs through
// this lock so preview and export renders cannot interleave.
let skyLock = Promise.resolve();
function withSkyLock(task) {
  const run = skyLock.then(task);
  skyLock = run.catch(() => {});
  return run;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// d3-celestial sizes its canvas as width × devicePixelRatio. On a 3× iPhone the large
// sky disc would exceed Safari's canvas limit, and the map is scaled into the wallpaper
// anyway, so build it at a ratio of 1.
function withPixelRatioOne(task) {
  const original = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
  Object.defineProperty(window, "devicePixelRatio", { value: 1, configurable: true });
  try {
    task();
  } finally {
    if (original) Object.defineProperty(window, "devicePixelRatio", original);
    else delete window.devicePixelRatio;
  }
}

function configureSky() {
  withPixelRatioOne(displaySky);
}

function displaySky() {
  Celestial.display({
    container: "sky-map",
    width: STYLE_REFERENCE_WIDTH,
    projection: "stereographic",
    projectionRatio: 1,
    transform: "equatorial",
    follow: "zenith",
    geopos: [0, 0],
    location: true,
    interactive: false,
    controls: false,
    form: false,
    disableAnimations: true,
    datapath: "vendor/d3-celestial/data/",
    stars: { show: true, limit: 6, colors: false, style: { fill: "#fff8ec", opacity: 1 }, size: 5, exponent: -0.28, designation: false, propername: false, data: "stars.6.json" },
    dsos: { show: false, data: "dsos.bright.json" },
    constellations: {
      names: true,
      namesType: "iau",
      nameStyle: { fill: "#d8b4ff", align: "center", baseline: "middle", font: ["14px sans-serif", "12px sans-serif", "10px sans-serif"] },
      lines: true,
      lineStyle: { stroke: "#9f7aea", width: 1.2, opacity: 0.75 },
      bounds: false,
    },
    mw: { show: false },
    lines: {
      graticule: { show: false, lon: { pos: [] }, lat: { pos: [] } },
      equatorial: { show: false },
      ecliptic: { show: false },
      galactic: { show: false },
      supergalactic: { show: false },
    },
    planets: { show: false },
    background: { fill: "#080615", opacity: 1, stroke: "#5e4a82", width: 2 },
    horizon: { show: true, stroke: "#9f7aea", width: 1, fill: "#080615", opacity: 1 },
    daylight: { show: false },
    formFields: { location: false, general: false, stars: false, dsos: false, constellations: false, lines: false, other: false, download: false },
  });
}

// Diameter of the sky disc that covers the whole wallpaper (centered on the screen).
function skyDiameter(width, height) {
  return Math.round(Math.hypot(width, height) * LAYOUT.mapOverscan);
}

// Star, line, and label sizes scale with the wallpaper width, not the zoomed disc,
// so a small preview and the large export look alike.
function skyStyle(wallpaperWidth, palette) {
  const scale = wallpaperWidth / STYLE_REFERENCE_WIDTH;
  const rankOpacity = [1, 2, 3].map((rank) => (rank <= LABELS.ranksShown ? 1 : 0));
  return {
    stars: { size: 5 * scale, style: { fill: palette.star, opacity: 1 } },
    constellations: {
      nameStyle: {
        fill: [palette.label, palette.label, palette.label],
        opacity: rankOpacity,
        align: "center",
        baseline: "middle",
        font: [14, 12, 10].map((px) => `${(px * scale).toFixed(1)}px sans-serif`),
      },
      lineStyle: { stroke: palette.line, width: 1.2 * scale, opacity: palette.lineOpacity },
    },
    // The composition supplies the background; d3-celestial draws only stars, lines, and names.
    background: { fill: "#000000", opacity: 0, stroke: "#000000", width: 0 },
    horizon: { show: false, stroke: "#000000", width: 0, fill: "#000000", opacity: 0 },
  };
}

// d3-celestial converts the date through a hidden form that uses the browser's own time zone, so
// the `timezone` it expects is the browser's current UTC offset in minutes, not the place's. The
// date we pass is already an exact instant, so with this value the library adds no further shift.
// (Passing the place's offset drew the sky for the wrong time whenever the two zones differed;
// verified against an independent sidereal-time calculation in tests/sky-engine.html.)
function celestialTimezoneArgument() {
  return -new Date().getTimezoneOffset();
}

// Draws the resolved sky for a wallpaper of this size and returns its canvas.
// The astronomy inputs are identical at every size; only the pixel scale changes.
// A cached snapshot is returned for previews. With useCache false the live d3-celestial
// canvas is returned and is valid only until the next render, so callers hold the sky lock.
let mapCache = { key: "", canvas: null };
async function renderMap(width, height, { useCache = true } = {}) {
  const palette = MOODS[state.mood];
  const { place, instant } = state;
  const diameter = skyDiameter(width, height);
  const key = [instant.getTime(), place.latitude, place.longitude, state.mood, width, height, LABELS.ranksShown].join("|");
  if (useCache && mapCache.key === key) return mapCache.canvas;

  Celestial.apply(skyStyle(width, palette));
  Celestial.resize({ width: diameter });
  Celestial.skyview({
    date: instant,
    location: [place.latitude, place.longitude],
    timezone: celestialTimezoneArgument(),
  });
  await wait(MAP_RENDER_SETTLE_MS);

  const source = elements.skyMap.querySelector("canvas");
  if (!useCache) return source;

  const copy = document.createElement("canvas");
  copy.width = source.width;
  copy.height = source.height;
  copy.getContext("2d").drawImage(source, 0, 0);
  mapCache = { key, canvas: copy };
  return copy;
}

/* ---------- Wallpaper composition ---------- */

// Everything the composition draws, taken from state. The renderer reads only this.
function wallpaperContent() {
  const description = describeSky();
  return {
    mood: state.mood,
    title: state.memoryTitle.trim(),
    place: state.place?.label ?? "",
    when: description
      ? `${description.local.toFormat("LLLL d, yyyy")} · ${description.local.toFormat("h:mm a")} ${description.local.toFormat("ZZZZ")}`
      : "",
  };
}

function wrapLines(ctx, text, maxWidth, maxLines) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || ctx.measureText(candidate).width <= maxWidth) current = candidate;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines;

  let last = `${lines.slice(maxLines - 1).join(" ")}…`;
  while (last.length > 1 && ctx.measureText(last).width > maxWidth) last = `${last.slice(0, -2)}…`;
  return [...lines.slice(0, maxLines - 1), last];
}

function drawTextBlock(ctx, text, { x, y, size, weight, color, maxWidth, maxLines }) {
  if (!text) return y;
  ctx.font = `${weight} ${size}px ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.fillStyle = color;
  const lines = wrapLines(ctx, text, maxWidth, maxLines);
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * size * LAYOUT.lineHeight));
  return y + lines.length * size * LAYOUT.lineHeight;
}

// The one composition rule used by preview and export. `mapCanvas` is optional.
function renderWallpaper(ctx, width, height, content, mapCanvas) {
  const palette = MOODS[content.mood];
  const centerX = width / 2;
  const centerY = height / 2;
  const diameter = skyDiameter(width, height);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, palette.backgroundTop);
  background.addColorStop(1, palette.backgroundBottom);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const haze = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, height * 0.6);
  haze.addColorStop(0, palette.haze);
  haze.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, width, height);

  if (mapCanvas) {
    ctx.drawImage(mapCanvas, centerX - diameter / 2, centerY - diameter / 2, diameter, diameter);
  }

  // Dark fade so the text stays readable over the stars.
  const scrim = ctx.createLinearGradient(0, height * LAYOUT.scrimStart, 0, height);
  const fullAt = (LAYOUT.scrimFull - LAYOUT.scrimStart) / (1 - LAYOUT.scrimStart);
  scrim.addColorStop(0, `rgba(${palette.scrim}, 0)`);
  scrim.addColorStop(fullAt, `rgba(${palette.scrim}, 0.82)`);
  scrim.addColorStop(1, `rgba(${palette.scrim}, 0.9)`);
  ctx.fillStyle = scrim;
  ctx.fillRect(0, height * LAYOUT.scrimStart, width, height * (1 - LAYOUT.scrimStart));

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const x = centerX;
  const maxWidth = width * LAYOUT.textMaxWidth;
  let y = height * LAYOUT.textTop;
  y = drawTextBlock(ctx, content.title, { x, y, size: width * LAYOUT.titleSize, weight: 700, color: palette.text, maxWidth, maxLines: 2 });
  y += width * 0.012;
  y = drawTextBlock(ctx, content.place, { x, y, size: width * LAYOUT.detailSize, weight: 600, color: palette.detail, maxWidth, maxLines: 2 });
  y += width * 0.008;
  drawTextBlock(ctx, content.when, { x, y, size: width * LAYOUT.detailSize, weight: 500, color: palette.detail, maxWidth, maxLines: 1 });

  ctx.restore();
}

/* ---------- Preview ---------- */

async function renderPreview() {
  const canvas = elements.previewCanvas;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  const pixelRatio = Math.min(window.devicePixelRatio || 1, PREVIEW_PIXEL_RATIO_LIMIT);
  const width = Math.max(1, Math.round(rect.width * pixelRatio));
  const height = Math.max(1, Math.round(rect.height * pixelRatio));

  const ready = Boolean(state.instant);
  const map = ready ? await renderMap(width, height) : null;

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  elements.phoneFrame.dataset.ready = String(ready);
  elements.skyPlaceholder.hidden = ready;
  renderWallpaper(canvas.getContext("2d", { alpha: false }), width, height, wallpaperContent(), map);
}

// Coalesces rapid edits into the latest state; one render at a time.
let previewDirty = false;
let previewRunning = false;
function scheduleRender() {
  previewDirty = true;
  if (previewRunning) return;
  previewRunning = true;
  (async () => {
    while (previewDirty) {
      previewDirty = false;
      await withSkyLock(renderPreview).catch(() => {});
    }
    previewRunning = false;
  })();
}

/* ---------- Export ---------- */

function encodePng(canvas) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("PNG encoding returned no file."));
      }, "image/png");
    } catch (error) {
      reject(error);
    }
  });
}

function startDownload(blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = EXPORT_FILE_NAME;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// One temporary full-size canvas, released afterwards. `encode` is injectable for tests.
function exportWallpaper() {
  return withSkyLock(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = WALLPAPER_WIDTH;
    canvas.height = WALLPAPER_HEIGHT;
    try {
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("Canvas is unavailable.");
      const map = await renderMap(WALLPAPER_WIDTH, WALLPAPER_HEIGHT, { useCache: false });
      renderWallpaper(ctx, WALLPAPER_WIDTH, WALLPAPER_HEIGHT, wallpaperContent(), map);
      startDownload(await encodePng(canvas));
    } finally {
      canvas.width = 1;
      canvas.height = 1;
    }
  }).finally(scheduleRender); // shrink the shared map back to preview size
}

/* ---------- Refresh and events ---------- */

function setStatus(message = "", tone = "") {
  elements.status.textContent = message;
  if (tone) elements.status.dataset.tone = tone;
  else delete elements.status.dataset.tone;
}

// Derive everything visible from `state`.
function refresh() {
  resolveTime();
  renderTimeChoices();
  showFieldProblems(visibleProblems());
  updateSummary();
  scheduleRender();
}

elements.title.addEventListener("input", () => {
  state.memoryTitle = elements.title.value;
  refresh();
});

elements.placeQuery.addEventListener("input", () => {
  // Editing the text after a selection makes that selection stale.
  searchToken += 1;
  state.placeQuery = elements.placeQuery.value;
  state.place = null;
  state.disambiguation = null;
  clearSearchResults();
  setPlaceStatus();
  elements.placeSearch.disabled = false;
  refresh();
});

elements.placeQuery.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  searchPlaces();
});

elements.placeSearch.addEventListener("click", searchPlaces);

elements.placeOptions.addEventListener("change", (event) => {
  if (!event.target.matches('input[name="place-choice"]')) return;
  state.place = state.searchResults[Number(event.target.value)];
  state.disambiguation = null;
  setPlaceStatus(`Selected ${state.place.label}. Time zone: ${state.place.timezone}.`);
  refresh();
});

elements.date.addEventListener("input", () => {
  state.localDate = elements.date.value;
  state.disambiguation = null;
  refresh();
});

elements.time.addEventListener("input", () => {
  state.localTime = elements.time.value;
  state.disambiguation = null;
  refresh();
});

elements.timeChoiceOptions.addEventListener("change", (event) => {
  if (!event.target.matches('input[name="time-choice"]')) return;
  state.disambiguation = event.target.value;
  refresh();
});

elements.form.addEventListener("change", (event) => {
  if (!event.target.matches('input[name="mood"]')) return;
  state.mood = event.target.value;
  document.body.dataset.mood = state.mood;
  refresh();
});

let exporting = false;

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorsRevealed = true;
  const problems = fieldProblems();
  showFieldProblems(problems);

  const firstInvalid = ["title", "place", "date", "time"].find((key) => problems[key]);
  if (firstInvalid) {
    setStatus("Fix the highlighted fields to create your wallpaper.", "error");
    errorInputs[firstInvalid].focus();
    return;
  }

  if (exporting) return;
  exporting = true;
  elements.exportButton.disabled = true;
  elements.exportButton.setAttribute("aria-busy", "true");
  setStatus("Creating your 1179 × 2556 wallpaper…");

  try {
    await exportWallpaper();
    setStatus("Wallpaper created. Check your Downloads for the PNG, then save it to Photos.", "success");
  } catch {
    setStatus("We couldn't create the wallpaper. Your entries are still here, so you can try again.", "error");
  } finally {
    exporting = false;
    elements.exportButton.disabled = false;
    elements.exportButton.removeAttribute("aria-busy");
  }
});

configureSky();
new ResizeObserver(scheduleRender).observe(elements.previewCanvas);
refresh();
