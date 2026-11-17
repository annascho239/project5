// The explore page: one page, five screens (memory, explore, learn, play, wallpaper), so what the player typed
// stays in memory the whole time and never goes into a web address or storage. Rules and data live in the
// modules imported here; this file connects them to the screens and manages focus and the Back button.

import { loadCatalog } from "./game-levels.js";
import { mountGame } from "./game-view.js";
import { buildPlayableLevel, quickAssess } from "./game-pool.js";
import { learnRows, loadStarFacts } from "./learn-facts.js";
import { describeMoment } from "./memory.js";
import { mountMemoryForm } from "./memory-form.js";
import { compassName, visibleConstellations } from "./sky-engine.js";
import { mountWallpaper } from "./wallpaper-view.js";

const TITLES = {
  memory: "Inner Orbit — Explore a memory sky",
  explore: "Your sky — Inner Orbit",
  learn: "Learn — Inner Orbit",
  play: "Play — Inner Orbit",
  wallpaper: "Your wallpaper — Inner Orbit",
};
const DIFFICULTY_ORDER = { Easy: 0, Medium: 1, Hard: 2 };

const $ = (selector) => document.querySelector(selector);
const views = {
  memory: $("#view-memory"),
  explore: $("#view-explore"),
  learn: $("#view-learn"),
  play: $("#view-play"),
  wallpaper: $("#view-wallpaper"),
};
const loadStatus = $("#load-status");

const escapeText = (text) => {
  const span = document.createElement("span");
  span.textContent = text;
  return span.innerHTML;
};
const clean = (text) => (text || "").replace(/\s+/g, " ").trim();
const plural = (count, word, many = `${word}s`) => `${count} ${count === 1 ? word : many}`;

// Everything the player has chosen, in memory only.
const session = {
  memory: null, // the resolved memory, once Explore constellations has been pressed
  sky: [], // constellations at least partly above the horizon then
  assessments: new Map(), // id → playability verdict (a property of the constellation, never of the sky)
  bests: new Map(), // id → fewest launches that filled it this session
  instant: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
};
let catalog = null;
let starFacts = null;
let current = null; // the view now showing
let gameHandle = null;
let wallpaperHandle = null;
let memoryForm = null;
let returnTo = null; // the card button to focus when coming back to the list

function names(id) {
  const properties = catalog.info.get(id);
  const latin = clean(properties.name);
  return { latin, english: clean(properties.en) || latin };
}

function assess(id) {
  if (!session.assessments.has(id)) session.assessments.set(id, quickAssess(id, catalog));
  return session.assessments.get(id);
}

/* ---------- Showing a view ---------- */

function show(view, id = null, { push = true } = {}) {
  if (view !== "memory" && !session.memory) view = "memory";
  if ((view === "learn" || view === "play") && !(id && catalog.info.has(id))) view = "explore";
  if (view === "play") {
    const entry = session.sky.find((item) => item.id === id);
    if (!entry || entry.status !== "full" || !assess(id).playable) view = "learn";
  }

  if (current === "play" && view !== "play" && gameHandle) {
    gameHandle.destroy();
    gameHandle = null;
  }
  for (const [name, element] of Object.entries(views)) element.hidden = name !== view;
  const previous = current;
  current = view;
  document.title = TITLES[view];

  if (push && !(history.state && history.state.view === view && history.state.id === id)) {
    history.pushState({ view, id }, "");
  }

  window.scrollTo(0, 0); // before focusing, so a restored focus can scroll its own card into view

  if (view === "memory") {
    if (previous !== null) memoryForm.focusHeading(); // not on first load: leave focus where the browser put it
  } else if (view === "explore") {
    renderExplore();
    focusAfterReturn(previous);
  } else if (view === "learn") {
    renderLearn(id);
    $("#learn-heading").focus({ preventScroll: true });
  } else if (view === "play") mountPlay(id);
  else if (view === "wallpaper") openWallpaper();
}

function focusAfterReturn(previous) {
  if (previous && previous !== "explore" && returnTo) {
    const button = $(`#explore-groups button[data-id="${CSS.escape(returnTo.id)}"][data-action="${returnTo.action}"]`);
    if (button) {
      button.focus({ preventScroll: true });
      button.scrollIntoView({ block: "center" });
      return;
    }
  }
  $("#explore-heading").focus({ preventScroll: true });
}

/* ---------- The explore list ---------- */

function entryFor(skyItem) {
  return { ...skyItem, ...names(skyItem.id), assessment: assess(skyItem.id) };
}

function positionText(entry) {
  if (entry.status === "partial") return `${entry.starsAbove} of ${entry.starCount} stars above the horizon`;
  return `about ${Math.round(entry.center.altitude)}° up, ${compassName(entry.center.azimuth)}`;
}

function cardMarkup(entry, kind) {
  const { id, english, latin, assessment } = entry;
  const best = session.bests.get(id);
  const sub = english !== latin ? `<p class="card-sub">${escapeText(latin)}</p>` : "";
  const chips = [
    `<span class="chip">${plural(entry.starCount, "star")}</span>`,
    kind === "play" ? `<span class="chip">${assessment.difficulty}</span>` : "",
    `<span class="chip">${escapeText(positionText(entry))}</span>`,
  ].join("");
  let note = "";
  if (best != null) note = `<p class="card-note card-done">✓ Filled in ${plural(best, "launch", "launches")}</p>`;
  else if (kind === "learn") note = `<p class="card-note">${escapeText(assessment.reason)}</p>`;
  else if (kind === "partial") note = '<p class="card-note">Only part of it was above the horizon, so you can learn about it but not play it.</p>';

  const playButton = kind === "play"
    ? `<button class="button button-primary" type="button" data-action="play" data-id="${escapeText(id)}" aria-label="Play ${escapeText(english)}">${best != null ? "Play again" : "Play"}</button>`
    : "";
  return `
    <li class="constellation-card">
      <div>
        <h4>${escapeText(english)}</h4>
        ${sub}
        <p class="card-meta">${chips}</p>
        ${note}
      </div>
      <div class="card-actions">
        ${playButton}
        <button class="button" type="button" data-action="learn" data-id="${escapeText(id)}" aria-label="Learn about ${escapeText(english)}">Learn</button>
      </div>
    </li>`;
}

function groupMarkup({ id, title, note, entries, kind, empty }) {
  const cards = entries.length
    ? `<ul class="constellation-list">${entries.map((entry) => cardMarkup(entry, kind)).join("")}</ul>`
    : `<p class="group-note">${escapeText(empty)}</p>`;
  return `
    <section class="group" aria-labelledby="${id}">
      <h3 id="${id}">${escapeText(title)} (${entries.length})</h3>
      <p class="group-note">${escapeText(note)}</p>
      ${cards}
    </section>`;
}

function renderExplore() {
  const { memory } = session;
  const moment = describeMoment(memory.instant, memory.place.timezone);
  const inView = session.sky.map(entryFor);
  const byName = (a, b) => a.english.localeCompare(b.english);
  const play = inView
    .filter((e) => e.status === "full" && e.assessment.playable)
    .sort((a, b) => DIFFICULTY_ORDER[a.assessment.difficulty] - DIFFICULTY_ORDER[b.assessment.difficulty] || a.starCount - b.starCount || byName(a, b));
  const learnFull = inView.filter((e) => e.status === "full" && !e.assessment.playable).sort(byName);
  const partial = inView.filter((e) => e.status === "partial").sort(byName);

  $("#explore-summary").textContent =
    `“${memory.title}” — ${memory.place.label}, ${moment.dateText} at ${moment.timeText} (${moment.zoneText}). These constellations were above the horizon at that moment.`;
  $("#explore-counts").textContent =
    `${play.length} to play, ${learnFull.length} more to learn about, and ${partial.length} partly above the horizon.`;
  $("#explore-groups").innerHTML = [
    groupMarkup({
      id: "group-play", title: "Ready to play", entries: play, kind: "play",
      note: "Fully above the horizon, with stars far enough apart to aim at one at a time. Easier ones come first.",
      empty: "None of the constellations in this sky can be played. You can still learn about them below.",
    }),
    groupMarkup({
      id: "group-learn", title: "Learn only, fully in view", entries: learnFull, kind: "learn",
      note: "Too big or too crowded to play on a phone, but you can learn about them.",
      empty: "None.",
    }),
    groupMarkup({
      id: "group-partial", title: "Partly above the horizon", entries: partial, kind: "partial",
      note: "Only some of their stars were up, so these are for learning only.",
      empty: "None.",
    }),
  ].join("");
}

$("#explore-groups").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  returnTo = { id: button.dataset.id, action: button.dataset.action };
  show(button.dataset.action === "play" ? "play" : "learn", button.dataset.id);
});

/* ---------- Learn ---------- */

function renderLearn(id) {
  const { memory } = session;
  const { english, latin } = names(id);
  const entry = session.sky.find((item) => item.id === id);
  const moment = describeMoment(memory.instant, memory.place.timezone);

  $("#learn-heading").textContent = english === latin ? english : `${english} (${latin})`;
  $("#learn-lede").textContent = `What the star catalog says, and where it sat in the sky over ${memory.place.label} on ${moment.dateText} at ${moment.timeText}.`;
  const rows = learnRows(id, catalog, starFacts, {
    observer: { latitude: memory.place.latitude, longitude: memory.place.longitude },
    date: memory.instant,
    timeZone: memory.place.timezone,
  });
  $("#learn-facts").replaceChildren(
    ...rows.flatMap(([name, value]) => {
      const term = document.createElement("dt");
      term.textContent = name;
      const detail = document.createElement("dd");
      detail.textContent = value;
      return [term, detail];
    }),
  );
  const canPlay = Boolean(entry) && entry.status === "full" && assess(id).playable;
  $("#learn-play").hidden = !canPlay;
  $("#learn-play").dataset.id = id;
  $("#learn-play").setAttribute("aria-label", `Play ${english}`);
}

$("#learn-play").addEventListener("click", () => show("play", $("#learn-play").dataset.id));
$("#learn-back").addEventListener("click", () => show("explore"));
$("#learn-back-top").addEventListener("click", () => show("explore"));

/* ---------- Play ---------- */

function mountPlay(id) {
  const level = buildPlayableLevel(id, catalog);
  gameHandle = mountGame(views.play, {
    levels: [level],
    picker: false,
    nextLevel: false,
    bests: session.bests,
    winFacts: null,
    winActions: [
      { id: "back", label: "Back to constellations" },
      { id: "learn", label: "Learn about it" },
    ],
    onAction: (action) => {
      if (action === "back") show("explore");
      else if (action === "learn") show("learn", id);
    },
    instant: session.instant,
    onInstantChange: (value) => { session.instant = value; },
    headingTag: "h2",
    eyebrow: "Star Launcher",
    leadingHtml: '<nav class="top-nav" aria-label="Game"><button type="button" class="link-button" data-action="back">← Back to constellations</button></nav>',
  });
  gameHandle.focusBoard();
}

/* ---------- Wallpaper ---------- */

function openWallpaper() {
  if (!wallpaperHandle) {
    wallpaperHandle = mountWallpaper(views.wallpaper, { getMemory: () => session.memory, onBack: () => show("explore") });
  }
  wallpaperHandle.open();
}

$("#open-wallpaper").addEventListener("click", () => {
  returnTo = null;
  show("wallpaper");
});
$("#edit-memory").addEventListener("click", () => show("memory"));

/* ---------- Starting out ---------- */

function startExploring(memory) {
  session.memory = memory;
  session.sky = visibleConstellations(
    catalog.lines,
    { latitude: memory.place.latitude, longitude: memory.place.longitude },
    memory.instant,
  ).filter((item) => item.status !== "none");
  returnTo = null;
  show("explore");
}

window.addEventListener("popstate", (event) => {
  const state = event.state || { view: "memory", id: null };
  show(state.view, state.id, { push: false });
});

async function start() {
  try {
    [catalog, starFacts] = await Promise.all([loadCatalog(), loadStarFacts()]);
  } catch {
    loadStatus.textContent = "The constellation data could not be loaded. Reload the page to try again.";
    loadStatus.dataset.tone = "error";
    return;
  }
  loadStatus.hidden = true;
  memoryForm = mountMemoryForm(views.memory, { onExplore: startExploring });
  history.replaceState({ view: "memory", id: null }, "");
  show("memory", null, { push: false });
}

start();
