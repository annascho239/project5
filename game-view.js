// The Star Launcher screen as a component: drawing, input, and status text on top of the pure rules in
// game-levels.js and game-physics.js. mountGame() fills a container with the game and returns a handle to
// remove it again, so the same game serves play.html (three fixed levels) and the explore page (any one
// constellation). This file reads and writes the DOM; the rules never do.

import { BOARD } from "./game-levels.js";
import { PHYSICS, aimToward, clampAim, createGame, launch, playShot, progress, step } from "./game-physics.js";

const AIM_STEP_DEGREES = 1;
const AIM_FAST_STEP_DEGREES = 5;
const AIM_LINE_LENGTH = 130; // board units
const CANCEL_RADIUS = 24; // releasing this close to the launcher cancels the aim
const TRAIL_LENGTH = 28;
const PULSE_MS = 600;
const PIXEL_RATIO_LIMIT = 2;
const MAX_FRAME_SECONDS = 0.05; // after a stalled frame, do not fast-forward the physics

const COLORS = {
  backgroundTop: "#111342",
  backgroundBottom: "#060719",
  link: "rgba(169, 156, 255, 0.28)",
  linkLit: "rgba(198, 188, 255, 0.95)",
  bumper: "rgba(120, 130, 200, 0.5)",
  bumperRim: "rgba(190, 195, 255, 0.55)",
  starUnlit: "rgba(255, 255, 255, 0.55)",
  starLit: "#fff3dc",
  starGlow: "rgba(255, 214, 140, ",
  ball: "#ff8078",
  aim: "rgba(255, 128, 120, ",
  path: "rgba(255, 128, 120, 0.32)",
};

function plural(count, word, many = `${word}s`) {
  return `${count} ${count === 1 ? word : many}`;
}

// Catalog facts only: nothing here comes from outside the vendored constellation data.
export function factRows(level) {
  const { facts } = level;
  const rows = [["Latin name", facts.latin]];
  if (facts.english !== facts.latin) rows.push(["Common name", facts.english]);
  rows.push(
    ["IAU abbreviation", facts.abbreviation],
    ["Genitive form (used in star designations)", facts.genitive],
    ["Stars in this pattern", String(facts.starCount)],
    ["Lines connecting them", String(facts.linkCount)],
  );
  return rows;
}

const escapeText = (text) => {
  const span = document.createElement("span");
  span.textContent = text;
  return span.innerHTML;
};

function template({ leadingHtml, eyebrow, headingTag, winHeadingTag, picker, nextLevel, winActions }) {
  const extra = winActions
    .map((action) => `<button class="button" type="button" data-action="${escapeText(action.id)}">${escapeText(action.label)}</button>`)
    .join("");
  return `
    ${leadingHtml}
    <header class="hud">
      <div class="hud-title">
        <p class="eyebrow">${escapeText(eyebrow)}</p>
        <${headingTag} id="game-title">Loading…</${headingTag}>
      </div>
      <dl class="hud-counts">
        <div><dt>Stars lit</dt><dd id="stars-lit">0 of 0</dd></div>
        <div><dt>Launches</dt><dd id="launch-count">0</dd></div>
      </dl>
    </header>

    <div class="board-wrap">
      <canvas id="board" tabindex="0" role="img"
        aria-label="Game board loading."
        aria-describedby="aim-readout game-hint">
        Star Launcher board. Use the buttons and the text below it to play.
      </canvas>
    </div>

    <section id="win-panel" class="win-panel" aria-labelledby="win-title" hidden>
      <${winHeadingTag} id="win-title" tabindex="-1">Constellation filled</${winHeadingTag}>
      <p id="win-summary" class="win-summary"></p>
      <p id="win-best" class="win-best"></p>
      <dl id="win-facts" class="facts"></dl>
      <p id="win-overall" class="win-overall" hidden></p>
      <div class="win-actions">
        ${nextLevel ? '<button id="next-button" class="button button-primary" type="button">Next level</button>' : ""}
        <button id="again-button" class="button" type="button">Play again</button>
        ${extra}
      </div>
    </section>

    <p id="aim-readout" class="aim-readout">Aim: straight up</p>
    <p id="game-hint" class="hint">
      Drag on the board and release to launch. Or use the arrow keys to aim and Space to launch.
      Light every star in the constellation with as few launches as you can.
    </p>
    <p id="game-status" class="status" role="status" aria-live="polite"></p>

    <div class="controls">
      <button id="launch-button" class="button button-primary" type="button">Launch</button>
      <button id="reset-button" class="button" type="button">Reset level</button>
    </div>

    ${picker ? `
    <fieldset class="levels">
      <legend>Level</legend>
      <div id="level-options" class="level-options"></div>
    </fieldset>` : ""}

    <label class="toggle">
      <input id="instant-toggle" type="checkbox">
      <span>Show each launch's result instantly (no animation)</span>
    </label>

    <ul id="star-list" class="sr-only" aria-label="Stars in this constellation"></ul>`;
}

// options:
//   levels        the levels to offer (at least one)
//   startIndex    which level opens first (default 0)
//   picker        show the level choice (default: true when there is more than one level)
//   nextLevel     show "Next level" in the win panel (default: same as picker)
//   bests         a Map of level id to fewest launches; pass one in to keep bests across mounts
//   winFacts      function(level) giving [label, value] rows for the win panel, or null for none
//   winActions    extra win-panel buttons: [{ id, label }], reported through onAction
//   onAction      (id, level) => void
//   onWin         ({ level, launches, best, improved }) => void
//   instant       start with "show results instantly" on (default: the system's reduced-motion setting)
//   onInstantChange  (checked) => void
//   eyebrow, headingTag, leadingHtml   small presentation choices (play.html and the explore page differ)
export function mountGame(root, options) {
  const levels = options.levels;
  const settings = {
    picker: options.picker ?? levels.length > 1,
    nextLevel: options.nextLevel ?? (options.picker ?? levels.length > 1),
    winFacts: options.winFacts === undefined ? factRows : options.winFacts,
    winActions: options.winActions ?? [],
    headingTag: options.headingTag ?? "h1",
    eyebrow: options.eyebrow ?? "Star Launcher",
    leadingHtml: options.leadingHtml ?? "",
  };
  settings.winHeadingTag = settings.headingTag === "h1" ? "h2" : "h3";
  const bests = options.bests ?? new Map();

  root.innerHTML = template(settings);
  const $ = (selector) => root.querySelector(selector);
  const elements = {
    title: $("#game-title"),
    starsLit: $("#stars-lit"),
    launchCount: $("#launch-count"),
    canvas: $("#board"),
    aimReadout: $("#aim-readout"),
    status: $("#game-status"),
    launchButton: $("#launch-button"),
    resetButton: $("#reset-button"),
    levelOptions: $("#level-options"),
    instantToggle: $("#instant-toggle"),
    starList: $("#star-list"),
    winPanel: $("#win-panel"),
    winTitle: $("#win-title"),
    winSummary: $("#win-summary"),
    winBest: $("#win-best"),
    winFacts: $("#win-facts"),
    winOverall: $("#win-overall"),
    nextButton: $("#next-button"),
    againButton: $("#again-button"),
  };

  const ui = {
    levelIndex: 0,
    game: null,
    aim: 0, // radians from straight up, positive leans right
    dragging: false,
    trail: [], // recent ball positions while animating
    lastPath: [], // full path of the last instant launch
    pulses: [], // { index, start } glow effects on newly lit stars
    litBeforeLaunch: 0,
    animating: false,
    destroyed: false,
    frameHandle: 0,
    lastFrameTime: 0,
    accumulator: 0,
  };

  /* ---------- Text ---------- */

  function setStatus(message, tone = "") {
    elements.status.textContent = message;
    if (tone) elements.status.dataset.tone = tone;
    else delete elements.status.dataset.tone;
  }

  function aimDescription() {
    const degrees = Math.round((ui.aim * 180) / Math.PI);
    if (degrees === 0) return "straight up";
    return `${Math.abs(degrees)}° ${degrees > 0 ? "right" : "left"}`;
  }

  function updateText() {
    const { game } = ui;
    const { lit, total, launches, won, inFlight } = progress(game);
    const title = game.level.title;

    elements.title.textContent = title;
    elements.starsLit.textContent = `${lit} of ${total}`;
    elements.launchCount.textContent = String(launches);
    elements.aimReadout.textContent = `Aim: ${aimDescription()}`;
    elements.canvas.setAttribute(
      "aria-label",
      `${title} board. ${lit} of ${plural(total, "star")} lit after ${plural(launches, "launch", "launches")}. Aim ${aimDescription()}.`,
    );
    elements.launchButton.disabled = won || inFlight;

    elements.starList.replaceChildren(
      ...game.lit.map((isLit, index) => {
        const item = document.createElement("li");
        item.textContent = `Star ${index + 1} of ${total}: ${isLit ? "lit" : "not lit"}`;
        return item;
      }),
    );
  }

  /* ---------- Drawing (board units, scaled to the canvas) ---------- */

  function sizeCanvas() {
    const canvas = elements.canvas;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const ratio = Math.min(window.devicePixelRatio || 1, PIXEL_RATIO_LIMIT);
    const width = Math.round(rect.width * ratio);
    const height = Math.round(rect.height * ratio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    return true;
  }

  function drawStar(ctx, star, isLit, pulseAmount) {
    const { starRadius } = BOARD;
    const glowRadius = starRadius * (isLit ? 2.1 + pulseAmount * 0.9 : 1.5);
    const glow = ctx.createRadialGradient(star.x, star.y, 1, star.x, star.y, glowRadius);
    glow.addColorStop(0, `${COLORS.starGlow}${isLit ? 0.65 : 0.12})`);
    glow.addColorStop(1, `${COLORS.starGlow}0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(star.x, star.y, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // The hit circle: a ring for unlit stars, a filled core once lit.
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = isLit ? COLORS.starLit : COLORS.starUnlit;
    ctx.beginPath();
    ctx.arc(star.x, star.y, starRadius * 0.82, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = isLit ? COLORS.starLit : "rgba(255, 255, 255, 0.35)";
    ctx.beginPath();
    ctx.arc(star.x, star.y, isLit ? starRadius * 0.5 : 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw() {
    if (ui.destroyed || !sizeCanvas()) return;
    const { canvas } = elements;
    const ctx = canvas.getContext("2d");
    const { game } = ui;
    const { level } = game;
    const now = performance.now();

    ctx.setTransform(canvas.width / BOARD.width, 0, 0, canvas.height / BOARD.height, 0, 0);
    const background = ctx.createLinearGradient(0, 0, 0, BOARD.height);
    background.addColorStop(0, COLORS.backgroundTop);
    background.addColorStop(1, COLORS.backgroundBottom);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, BOARD.width, BOARD.height);

    // Constellation lines: faint until both ends are lit.
    ctx.lineWidth = 1.6;
    for (const [a, b] of level.links) {
      const bothLit = game.lit[a] && game.lit[b];
      ctx.strokeStyle = bothLit ? COLORS.linkLit : COLORS.link;
      ctx.beginPath();
      ctx.moveTo(level.stars[a].x, level.stars[a].y);
      ctx.lineTo(level.stars[b].x, level.stars[b].y);
      ctx.stroke();
    }

    for (const bumper of level.bumpers) {
      ctx.fillStyle = COLORS.bumper;
      ctx.strokeStyle = COLORS.bumperRim;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(bumper.x, bumper.y, BOARD.bumperRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    level.stars.forEach((star, index) => {
      const pulse = ui.pulses.find((p) => p.index === index);
      const pulseAmount = pulse ? Math.max(0, 1 - (now - pulse.start) / PULSE_MS) : 0;
      drawStar(ctx, star, game.lit[index], pulseAmount);
    });

    // The path of the last instant launch stays visible until the next launch.
    if (ui.lastPath.length > 1 && !game.ball) {
      ctx.strokeStyle = COLORS.path;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ui.lastPath.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Launcher and aim line.
    const { launcher } = BOARD;
    if (!game.ball && !game.won) {
      ctx.strokeStyle = `${COLORS.aim}${ui.dragging ? 0.95 : 0.6})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(launcher.x, launcher.y);
      ctx.lineTo(launcher.x + Math.sin(ui.aim) * AIM_LINE_LENGTH, launcher.y - Math.cos(ui.aim) * AIM_LINE_LENGTH);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
    ctx.beginPath();
    ctx.arc(launcher.x, launcher.y, BOARD.ballRadius * 2.2, 0, Math.PI * 2);
    ctx.fill();

    // Ball trail and ball (or the ball waiting in the launcher).
    const ball = game.ball;
    ui.trail.forEach(([x, y], i) => {
      ctx.fillStyle = `${COLORS.aim}${(0.35 * (i + 1)) / ui.trail.length})`;
      ctx.beginPath();
      ctx.arc(x, y, BOARD.ballRadius * 0.6, 0, Math.PI * 2);
      ctx.fill();
    });
    if (!game.won) {
      ctx.fillStyle = COLORS.ball;
      ctx.beginPath();
      ctx.arc(ball ? ball.x : launcher.x, ball ? ball.y : launcher.y, BOARD.ballRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ---------- Launching ---------- */

  function describeEnd(reason, newlyLit) {
    const { lit, total, launches } = progress(ui.game);
    const gained = newlyLit === 0 ? "No new stars lit" : `${plural(newlyLit, "new star")} lit`;
    if (reason === "won") return `${ui.game.level.title} is filled in ${plural(launches, "launch", "launches")}!`;
    const how = reason === "bottom" ? "The ball left the board" : "The ball ran out of bounces";
    return `Launch ${launches}: ${how}. ${gained}. ${lit} of ${total} stars lit.`;
  }

  function finishLaunch(reason) {
    const lit = progress(ui.game).lit;
    const newlyLit = lit - ui.litBeforeLaunch;
    ui.trail = [];
    setStatus(describeEnd(reason, newlyLit), reason === "won" ? "win" : "");
    updateText();
    draw();
    if (reason === "won") showWin();
  }

  /* ---------- Win panel, best scores, and progression ---------- */

  function levelCardDetail(index) {
    const stars = plural(levels[index].stars.length, "star");
    const best = bests.get(levels[index].id);
    return best == null ? stars : `${stars} · filled in ${best}`;
  }

  function updateLevelCards() {
    if (!elements.levelOptions) return;
    elements.levelOptions.querySelectorAll(".level-card small").forEach((small, index) => {
      small.textContent = levelCardDetail(index);
    });
  }

  function showWin() {
    const { game, levelIndex } = ui;
    const { launches } = progress(game);
    const level = game.level;
    const previous = bests.get(level.id);
    const improved = previous == null || launches < previous;
    if (improved) bests.set(level.id, launches);

    elements.winTitle.textContent = `${level.title} filled!`;
    elements.winSummary.textContent = `You lit all ${plural(level.stars.length, "star")} in ${plural(launches, "launch", "launches")}.`;
    elements.winBest.textContent =
      previous == null
        ? `Best this session: ${launches}.`
        : improved
          ? `New best! The previous best was ${previous}.`
          : `Best this session: ${previous}.`;

    const rows = settings.winFacts ? settings.winFacts(level) : [];
    elements.winFacts.hidden = rows.length === 0;
    elements.winFacts.replaceChildren(
      ...rows.flatMap(([name, value]) => {
        const term = document.createElement("dt");
        term.textContent = name;
        const detail = document.createElement("dd");
        detail.textContent = value;
        return [term, detail];
      }),
    );

    const allFilled = levels.length > 1 && levels.every((each) => bests.has(each.id));
    elements.winOverall.hidden = !allFilled;
    if (allFilled) {
      const list = levels.map((each) => bests.get(each.id));
      const total = list.reduce((sum, value) => sum + value, 0);
      elements.winOverall.textContent = `All ${levels.length} constellations filled. Your best launches: ${list.join(", ")} (${total} in all).`;
    }

    if (elements.nextButton) elements.nextButton.hidden = levelIndex === levels.length - 1;
    elements.winPanel.hidden = false;
    updateLevelCards();
    updateText();
    elements.winTitle.focus({ preventScroll: true });
    elements.winPanel.scrollIntoView({ block: "nearest" });
    options.onWin?.({ level, launches, best: bests.get(level.id), improved });
  }

  function hideWin() {
    elements.winPanel.hidden = true;
  }

  function handleEvents(events, now) {
    let reason = null;
    for (const event of events) {
      if (event.type === "light") ui.pulses.push({ index: event.index, start: now });
      if (event.type === "end") reason = event.reason;
    }
    if (reason) finishLaunch(reason);
  }

  function frame(now) {
    if (ui.destroyed) return;
    const seconds = Math.min((now - ui.lastFrameTime) / 1000, MAX_FRAME_SECONDS);
    ui.lastFrameTime = now;
    ui.accumulator += seconds;

    while (ui.accumulator >= PHYSICS.step && ui.game.ball) {
      handleEvents(step(ui.game), now);
      ui.accumulator -= PHYSICS.step;
      if (ui.game.ball) {
        ui.trail.push([ui.game.ball.x, ui.game.ball.y]);
        if (ui.trail.length > TRAIL_LENGTH) ui.trail.shift();
      }
    }

    ui.pulses = ui.pulses.filter((pulse) => now - pulse.start < PULSE_MS);
    draw();

    if (ui.game.ball || ui.pulses.length > 0) ui.frameHandle = requestAnimationFrame(frame);
    else ui.animating = false;
  }

  function startAnimation() {
    if (ui.animating) return;
    ui.animating = true;
    ui.lastFrameTime = performance.now();
    ui.accumulator = 0;
    ui.frameHandle = requestAnimationFrame(frame);
  }

  function startLaunch() {
    const { game } = ui;
    if (game.ball || game.won) return;

    ui.litBeforeLaunch = progress(game).lit;
    ui.lastPath = [];
    ui.trail = [];

    if (elements.instantToggle.checked) {
      const result = playShot(game, ui.aim, { recordPath: true });
      ui.lastPath = result.path;
      finishLaunch(result.reason);
      return;
    }

    launch(game, ui.aim);
    setStatus("");
    updateText();
    startAnimation();
  }

  /* ---------- Input ---------- */

  function setAim(angle) {
    ui.aim = clampAim(angle);
    updateText();
    draw();
  }

  function toBoardPoint(event) {
    const rect = elements.canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * BOARD.width,
      y: ((event.clientY - rect.top) / rect.height) * BOARD.height,
    };
  }

  function pointerInactive() {
    return ui.game.ball !== null || ui.game.won;
  }

  elements.canvas.addEventListener("pointerdown", (event) => {
    if (pointerInactive() || event.button > 0) return;
    event.preventDefault();
    ui.dragging = true;
    try {
      elements.canvas.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic or already-released pointers cannot be captured; dragging still works.
    }
    const point = toBoardPoint(event);
    setAim(aimToward(point.x, point.y));
  });

  elements.canvas.addEventListener("pointermove", (event) => {
    if (!ui.dragging) return;
    const point = toBoardPoint(event);
    setAim(aimToward(point.x, point.y));
  });

  elements.canvas.addEventListener("pointerup", (event) => {
    if (!ui.dragging) return;
    ui.dragging = false;
    const point = toBoardPoint(event);
    const cancelled = Math.hypot(point.x - BOARD.launcher.x, point.y - BOARD.launcher.y) < CANCEL_RADIUS || point.y > BOARD.launcher.y;
    if (cancelled) {
      setStatus("Aim cancelled. Drag away from the launcher and release to launch.");
      draw();
      return;
    }
    setAim(aimToward(point.x, point.y));
    startLaunch();
  });

  elements.canvas.addEventListener("pointercancel", () => {
    ui.dragging = false;
    draw();
  });

  // Keyboard aim moves in whole degrees so a shot is exactly repeatable.
  function nudgeAim(deltaDegrees) {
    const degrees = Math.round((ui.aim * 180) / Math.PI) + deltaDegrees;
    setAim((degrees * Math.PI) / 180);
  }

  elements.canvas.addEventListener("keydown", (event) => {
    const stepDegrees = event.shiftKey ? AIM_FAST_STEP_DEGREES : AIM_STEP_DEGREES;
    if (event.key === "ArrowLeft") nudgeAim(-stepDegrees);
    else if (event.key === "ArrowRight") nudgeAim(stepDegrees);
    else if (event.key === " " || event.key === "Enter") startLaunch();
    else return;
    event.preventDefault();
  });

  elements.launchButton.addEventListener("click", startLaunch);
  elements.resetButton.addEventListener("click", () => {
    selectLevel(ui.levelIndex);
    setStatus("Level reset.");
  });

  /* ---------- Levels ---------- */

  function selectLevel(index) {
    ui.levelIndex = index;
    ui.game = createGame(levels[index]);
    ui.aim = 0;
    ui.dragging = false;
    ui.trail = [];
    ui.lastPath = [];
    ui.pulses = [];
    hideWin();
    setStatus("");
    updateText();
    draw();
  }

  function renderLevelOptions() {
    if (!elements.levelOptions) return;
    elements.levelOptions.replaceChildren(
      ...levels.map((level, index) => {
        const label = document.createElement("label");
        label.className = "level-card";
        label.innerHTML = `
          <input type="radio" name="level" value="${index}"${index === ui.levelIndex ? " checked" : ""}>
          <strong>${index + 1}. ${escapeText(level.title)}</strong>
          <small>${escapeText(levelCardDetail(index))}</small>`;
        return label;
      }),
    );
  }

  if (elements.nextButton) {
    elements.nextButton.addEventListener("click", () => {
      const next = ui.levelIndex + 1;
      if (next >= levels.length) return;
      const radio = elements.levelOptions?.querySelectorAll('input[name="level"]')[next];
      if (radio) radio.checked = true;
      selectLevel(next);
      elements.canvas.focus({ preventScroll: true });
    });
  }

  elements.againButton.addEventListener("click", () => {
    selectLevel(ui.levelIndex);
    setStatus("Playing again. Your best is kept for this session.");
    elements.canvas.focus({ preventScroll: true });
  });

  root.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => options.onAction?.(button.dataset.action, ui.game.level));
  });

  if (elements.levelOptions) {
    elements.levelOptions.addEventListener("change", (event) => {
      if (!event.target.matches('input[name="level"]')) return;
      selectLevel(Number(event.target.value));
    });
  }

  elements.instantToggle.addEventListener("change", () => options.onInstantChange?.(elements.instantToggle.checked));

  /* ---------- Start ---------- */

  elements.instantToggle.checked = options.instant ?? window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  ui.levelIndex = options.startIndex ?? 0;
  renderLevelOptions();
  selectLevel(ui.levelIndex);
  const observer = new ResizeObserver(draw);
  observer.observe(elements.canvas);

  return {
    root,
    bests,
    focusBoard: () => elements.canvas.focus({ preventScroll: true }),
    // Stops the animation and removes the game from the page.
    destroy() {
      ui.destroyed = true;
      cancelAnimationFrame(ui.frameHandle);
      observer.disconnect();
      root.replaceChildren();
    },
  };
}
