// How the wallpaper is drawn: the layout, the two moods, and the one composition rule used by the preview and
// the export. Pure drawing (a canvas context in, pixels out); no DOM and no sky library here. The sky itself
// arrives as a ready-made canvas drawn by d3-celestial (see wallpaper-view.js).
// Ported from app.js (the Phase 2 wallpaper maker); app.js retires when the old pages are cleaned up.

import { zonedDateTime, describeMoment } from "./memory.js";

export const WALLPAPER_WIDTH = 1179;
export const WALLPAPER_HEIGHT = 2556;
export const STYLE_REFERENCE_WIDTH = 450; // wallpaper width at which the d3-celestial sizes below read well
export const EXPORT_FILE_NAME = "inner-orbit-memory-sky.png";

// Constellations ranked 1..ranksShown show names (d3-celestial ranks 1-3, most to least prominent).
// Lines and stars never change with this rule.
export const LABELS = { ranksShown: 1 };

// The sky fills the whole wallpaper. All positions are fractions of it so preview and
// export agree. Essential text stays inside the middle 80% and below the Lock Screen clock area.
export const LAYOUT = {
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
export const MOODS = {
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

// Diameter of the sky disc that covers the whole wallpaper (centered on the screen).
export function skyDiameter(width, height) {
  return Math.round(Math.hypot(width, height) * LAYOUT.mapOverscan);
}

// Star, line, and label sizes scale with the wallpaper width, not the zoomed disc,
// so a small preview and the large export look alike.
export function skyStyle(wallpaperWidth, palette) {
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
export function celestialTimezoneArgument() {
  return -new Date().getTimezoneOffset();
}

// Everything the composition draws, taken from a resolved memory. The renderer reads only this.
export function wallpaperContent(memory) {
  const moment = memory.instant ? describeMoment(memory.instant, memory.place.timezone) : null;
  const zone = memory.instant ? zonedDateTime(memory.instant.getTime(), memory.place.timezone).toFormat("ZZZZ") : "";
  return {
    mood: memory.mood,
    title: memory.title.trim(),
    place: memory.place?.label ?? "",
    when: moment ? `${moment.dateText} · ${moment.timeText} ${zone}` : "",
  };
}

export function wrapLines(ctx, text, maxWidth, maxLines) {
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
export function renderWallpaper(ctx, width, height, content, mapCanvas) {
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
