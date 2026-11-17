// The wallpaper screen: a phone-shaped preview and the PNG download. The sky library (d3 and d3-celestial,
// about a megabyte with its star data) is loaded only when this screen is first opened, so exploring stays
// light on a phone. This file owns the DOM and the sky library; the drawing rules are in wallpaper-render.js.

import { LABELS, WALLPAPER_HEIGHT, WALLPAPER_WIDTH, EXPORT_FILE_NAME, MOODS, STYLE_REFERENCE_WIDTH, celestialTimezoneArgument, renderWallpaper, skyDiameter, skyStyle, wallpaperContent } from "./wallpaper-render.js";

const MAP_RENDER_SETTLE_MS = 100; // d3-celestial draws shortly after resize/skyview
const PREVIEW_PIXEL_RATIO_LIMIT = 2;
const SCRIPTS = ["vendor/d3/d3.v3.5.17.min.js", "vendor/d3-celestial/celestial.min.js"];

let libraryPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.append(script);
  });
}

// d3-celestial sizes its canvas as width × devicePixelRatio. On a 3× iPhone the large sky disc would
// exceed Safari's canvas limit, and the map is scaled into the wallpaper anyway, so build it at a ratio of 1.
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

// Loads the sky library once and draws its (hidden) first map. Retried if loading fails.
function loadSkyLibrary() {
  if (!libraryPromise) {
    libraryPromise = (async () => {
      if (!document.getElementById("sky-map")) {
        const holder = document.createElement("div");
        holder.id = "sky-map";
        holder.setAttribute("aria-hidden", "true");
        document.body.append(holder);
      }
      for (const src of SCRIPTS) await loadScript(src);
      withPixelRatioOne(displaySky);
      await new Promise((resolve) => setTimeout(resolve, MAP_RENDER_SETTLE_MS * 4));
    })().catch((error) => {
      libraryPromise = null;
      throw error;
    });
  }
  return libraryPromise;
}

// d3-celestial owns one global canvas. Everything that touches it runs through this lock so a preview
// and an export cannot interleave.
let skyLock = Promise.resolve();
function withSkyLock(task) {
  const run = skyLock.then(task);
  skyLock = run.catch(() => {});
  return run;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let mapCache = { key: "", canvas: null };

// Draws the sky for this memory at the size of a wallpaper this big and returns its canvas.
// A cached snapshot is returned for previews. With useCache false the live d3-celestial canvas is
// returned and is valid only until the next render, so callers hold the sky lock.
async function renderMap(memory, width, height, { useCache = true } = {}) {
  const palette = MOODS[memory.mood];
  const { place, instant } = memory;
  const diameter = skyDiameter(width, height);
  const key = [instant.getTime(), place.latitude, place.longitude, memory.mood, width, height, LABELS.ranksShown].join("|");
  if (useCache && mapCache.key === key) return mapCache.canvas;

  Celestial.apply(skyStyle(width, palette));
  Celestial.resize({ width: diameter });
  Celestial.skyview({
    date: instant,
    location: [place.latitude, place.longitude],
    timezone: celestialTimezoneArgument(),
  });
  await wait(MAP_RENDER_SETTLE_MS);

  const source = document.querySelector("#sky-map canvas");
  if (!useCache) return source;

  const copy = document.createElement("canvas");
  copy.width = source.width;
  copy.height = source.height;
  copy.getContext("2d").drawImage(source, 0, 0);
  mapCache = { key, canvas: copy };
  return copy;
}

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

const TEMPLATE = `
  <nav class="top-nav" aria-label="Wallpaper"><button type="button" class="link-button" data-action="back">← Back to constellations</button></nav>
  <h2 id="wallpaper-heading" tabindex="-1">Your wallpaper</h2>
  <p class="lede">The real sky above your memory, sized for an iPhone 15 Pro (1179 × 2556) with your title, place, and time.</p>
  <div class="phone-stage">
    <div class="phone-frame" id="wallpaper-frame" data-ready="false">
      <canvas id="wallpaper-canvas" role="img" aria-label="Wallpaper preview is loading."></canvas>
      <p id="wallpaper-placeholder" class="sky-placeholder">Preparing the sky…</p>
    </div>
  </div>
  <p id="wallpaper-summary" class="result-summary"></p>
  <p id="wallpaper-status" class="status-message" role="status" aria-live="polite"></p>
  <div class="view-actions">
    <button id="wallpaper-download" class="button button-primary" type="button" disabled>Download wallpaper (PNG)</button>
    <button id="wallpaper-retry" class="button" type="button" hidden>Try loading the sky again</button>
  </div>`;

// options: { getMemory() → resolved memory, onBack() }
export function mountWallpaper(root, options) {
  root.innerHTML = TEMPLATE;
  const $ = (selector) => root.querySelector(selector);
  const el = {
    heading: $("#wallpaper-heading"),
    frame: $("#wallpaper-frame"),
    canvas: $("#wallpaper-canvas"),
    placeholder: $("#wallpaper-placeholder"),
    summary: $("#wallpaper-summary"),
    status: $("#wallpaper-status"),
    download: $("#wallpaper-download"),
    retry: $("#wallpaper-retry"),
  };
  let ready = false;
  let exporting = false;
  let renderDirty = false;
  let renderRunning = false;
  let opened = false;

  function setStatus(message = "", tone = "") {
    el.status.textContent = message;
    if (tone) el.status.dataset.tone = tone;
    else delete el.status.dataset.tone;
  }

  async function renderPreview() {
    const memory = options.getMemory();
    const rect = el.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || !memory.instant) return;

    const pixelRatio = Math.min(window.devicePixelRatio || 1, PREVIEW_PIXEL_RATIO_LIMIT);
    const width = Math.max(1, Math.round(rect.width * pixelRatio));
    const height = Math.max(1, Math.round(rect.height * pixelRatio));
    const map = await renderMap(memory, width, height);

    if (el.canvas.width !== width || el.canvas.height !== height) {
      el.canvas.width = width;
      el.canvas.height = height;
    }
    renderWallpaper(el.canvas.getContext("2d", { alpha: false }), width, height, wallpaperContent(memory), map);
    el.frame.dataset.ready = "true";
    el.placeholder.hidden = true;
  }

  // Coalesces rapid requests into the latest state; one render at a time.
  function scheduleRender() {
    if (!ready) return;
    renderDirty = true;
    if (renderRunning) return;
    renderRunning = true;
    (async () => {
      while (renderDirty) {
        renderDirty = false;
        await withSkyLock(renderPreview).catch(() => {});
      }
      renderRunning = false;
    })();
  }

  function exportWallpaper() {
    return withSkyLock(async () => {
      const memory = options.getMemory();
      const canvas = document.createElement("canvas");
      canvas.width = WALLPAPER_WIDTH;
      canvas.height = WALLPAPER_HEIGHT;
      try {
        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) throw new Error("Canvas is unavailable.");
        const map = await renderMap(memory, WALLPAPER_WIDTH, WALLPAPER_HEIGHT, { useCache: false });
        renderWallpaper(ctx, WALLPAPER_WIDTH, WALLPAPER_HEIGHT, wallpaperContent(memory), map);
        startDownload(await encodePng(canvas));
      } finally {
        canvas.width = 1;
        canvas.height = 1;
      }
    }).finally(scheduleRender); // shrink the shared map back to preview size
  }

  el.download.addEventListener("click", async () => {
    if (exporting || !ready) return;
    exporting = true;
    el.download.disabled = true;
    el.download.setAttribute("aria-busy", "true");
    setStatus("Creating your 1179 × 2556 wallpaper…");
    try {
      await exportWallpaper();
      setStatus("Wallpaper created. Check your Downloads for the PNG, then save it to Photos.", "success");
    } catch {
      setStatus("We couldn't create the wallpaper. Your memory is still here, so you can try again.", "error");
    } finally {
      exporting = false;
      el.download.disabled = false;
      el.download.removeAttribute("aria-busy");
    }
  });

  async function prepare() {
    el.retry.hidden = true;
    el.placeholder.hidden = false;
    el.placeholder.textContent = "Preparing the sky…";
    setStatus("Loading the sky library…");
    try {
      await loadSkyLibrary();
      ready = true;
      el.download.disabled = false;
      setStatus("");
      scheduleRender();
    } catch {
      el.placeholder.textContent = "The sky could not be loaded.";
      setStatus("The sky library could not be loaded. Check your connection and try again.", "error");
      el.retry.hidden = false;
    }
  }
  el.retry.addEventListener("click", prepare);
  root.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => options.onBack?.());
  });
  new ResizeObserver(scheduleRender).observe(el.canvas);

  return {
    // Called each time the screen is shown. Loads the sky library the first time.
    open() {
      const memory = options.getMemory();
      el.summary.textContent = `${memory.title} — ${memory.place.label}. Atmosphere: ${memory.mood === "calm" ? "Calm" : "Energized"}.`;
      el.canvas.setAttribute("aria-label", `Wallpaper preview: ${el.summary.textContent}`);
      el.frame.dataset.ready = ready ? el.frame.dataset.ready : "false";
      if (!opened) {
        opened = true;
        prepare();
      } else {
        scheduleRender();
      }
      el.heading.focus({ preventScroll: true });
    },
    focusHeading: () => el.heading.focus({ preventScroll: true }),
  };
}
