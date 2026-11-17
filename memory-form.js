// The memory form: title, place (explicit search, then choose), date, clock time, and mood. It owns its own
// fields and stays mounted while other screens show, so nothing the player typed is lost on the way back.
// The rules live in memory.js; this file reads and writes the DOM.

import { MIN_PLACE_QUERY_LENGTH, MIN_YEAR, MAX_YEAR, fieldProblems, offsetLabel, resolveTime, searchPlaces, zonedDateTime } from "./memory.js";

const escapeText = (text) => {
  const span = document.createElement("span");
  span.textContent = text;
  return span.innerHTML;
};

const TEMPLATE = `
  <h2 id="memory-heading" tabindex="-1">Describe a memory</h2>
  <p class="lede">Say where and when it happened. You will see the constellations that were above the horizon at that moment, and can play and learn about each one.</p>
  <p class="privacy-note"><span aria-hidden="true">●</span> Only the place you search for is sent to Open-Meteo. Everything else stays in this browser.</p>

  <form id="memory-form" novalidate>
    <div class="field">
      <label for="memory-title">Memory title</label>
      <input id="memory-title" name="memory-title" type="text" maxlength="60" autocomplete="off"
        placeholder="e.g. Our first night in Chicago" aria-describedby="memory-title-error" required>
      <p id="memory-title-error" class="field-error"></p>
    </div>

    <div class="field">
      <label for="place-query">Place</label>
      <div class="place-row">
        <input id="place-query" name="place-query" type="text" maxlength="80" autocomplete="off"
          placeholder="City or town, e.g. Chicago" aria-describedby="place-help place-error" required>
        <button id="place-search" class="button button-secondary" type="button">Find place</button>
      </div>
      <p id="place-help" class="field-help">“Find place” sends only this text to the Open-Meteo Geocoding API. Choose a result to confirm the location and its time zone.</p>
      <p id="place-status" class="status-message" role="status" aria-live="polite"></p>
      <p id="place-error" class="field-error"></p>
    </div>

    <fieldset id="place-results" class="choice-fieldset" hidden>
      <legend>Choose the place you meant</legend>
      <div id="place-options" class="choice-list"></div>
    </fieldset>

    <div class="datetime-row">
      <div class="field">
        <label for="local-date">Date</label>
        <input id="local-date" name="local-date" type="date" min="${MIN_YEAR}-01-01" max="${MAX_YEAR}-12-31" aria-describedby="local-date-error" required>
        <p id="local-date-error" class="field-error"></p>
      </div>
      <div class="field">
        <label for="local-time">Approximate local time</label>
        <input id="local-time" name="local-time" type="time" aria-describedby="local-time-help local-time-error" required>
        <p id="local-time-error" class="field-error"></p>
      </div>
    </div>
    <p id="local-time-help" class="field-help">Use the clock time at the place, not your phone’s time zone.</p>

    <fieldset id="time-choice" class="choice-fieldset" hidden>
      <legend>That clock time happened twice</legend>
      <p class="field-help">Clocks moved back that day. Choose which one you remember.</p>
      <div id="time-choice-options" class="choice-list"></div>
    </fieldset>

    <fieldset class="mood-fieldset">
      <legend>Choose the atmosphere for your wallpaper</legend>
      <div class="mood-options">
        <label class="mood-card">
          <input type="radio" name="mood" value="calm" checked>
          <span class="mood-visual calm-visual" aria-hidden="true"></span>
          <span class="mood-copy"><strong>Calm</strong><small>Soft glow · deep blue</small></span>
        </label>
        <label class="mood-card">
          <input type="radio" name="mood" value="energized">
          <span class="mood-visual energized-visual" aria-hidden="true"></span>
          <span class="mood-copy"><strong>Energized</strong><small>Bright pulse · warm coral</small></span>
        </label>
      </div>
    </fieldset>

    <button id="explore-button" class="button button-primary button-wide" type="submit">Explore constellations <span aria-hidden="true">→</span></button>
    <p id="form-status" class="status-message" role="status" aria-live="polite"></p>
  </form>`;

function choiceMarkup({ name, value, title, detail, checked }) {
  return `
    <label class="choice-card">
      <input type="radio" name="${name}" value="${value}"${checked ? " checked" : ""}>
      <span class="choice-copy"><strong>${title}</strong><small>${detail}</small></span>
    </label>`;
}

// options: { onExplore(memory) } is called with the resolved memory when the form is valid.
export function mountMemoryForm(root, options) {
  root.innerHTML = TEMPLATE;
  const $ = (selector) => root.querySelector(selector);
  const el = {
    heading: $("#memory-heading"),
    form: $("#memory-form"),
    title: $("#memory-title"),
    placeQuery: $("#place-query"),
    placeSearch: $("#place-search"),
    placeStatus: $("#place-status"),
    placeResults: $("#place-results"),
    placeOptions: $("#place-options"),
    date: $("#local-date"),
    time: $("#local-time"),
    timeChoice: $("#time-choice"),
    timeChoiceOptions: $("#time-choice-options"),
    status: $("#form-status"),
  };
  const errorBox = { title: $("#memory-title-error"), place: $("#place-error"), date: $("#local-date-error"), time: $("#local-time-error") };
  const errorInput = { title: el.title, place: el.placeQuery, date: el.date, time: el.time };

  const memory = {
    title: "", placeQuery: "", searchResults: [], place: null, localDate: "", localTime: "", disambiguation: null, mood: "calm",
  };
  let resolution = { instant: null, issue: null, choices: [] };
  let searchToken = 0; // lets a newer search or edit discard an older response
  let errorsRevealed = false;

  function setPlaceStatus(message = "", tone = "") {
    el.placeStatus.textContent = message;
    if (tone) el.placeStatus.dataset.tone = tone;
    else delete el.placeStatus.dataset.tone;
  }

  function renderPlaceOptions() {
    el.placeResults.hidden = memory.searchResults.length === 0;
    el.placeOptions.innerHTML = memory.searchResults
      .map((place, index) =>
        choiceMarkup({
          name: "place-choice",
          value: index,
          title: escapeText(place.label),
          detail: `${escapeText(place.timezone)} · ${place.latitude.toFixed(2)}°, ${place.longitude.toFixed(2)}°`,
          checked: memory.place?.id === place.id,
        }))
      .join("");
  }

  function renderTimeChoices() {
    const ambiguous = resolution.issue === "ambiguous";
    el.timeChoice.hidden = !ambiguous;
    if (!ambiguous) {
      el.timeChoiceOptions.replaceChildren();
      return;
    }
    const labels = ["Earlier", "Later"];
    el.timeChoiceOptions.innerHTML = resolution.choices
      .map((instantMs, index) =>
        choiceMarkup({
          name: "time-choice",
          value: index === 0 ? "earlier" : "later",
          title: labels[index],
          detail: escapeText(offsetLabel(zonedDateTime(instantMs, memory.place.timezone))),
          checked: memory.disambiguation === (index === 0 ? "earlier" : "later"),
        }))
      .join("");
  }

  function showProblems() {
    const all = fieldProblems(memory, resolution);
    // Time-zone problems show at once; "required" problems wait until the player tries to continue.
    const shown = errorsRevealed ? all : resolution.issue && all.time ? { time: all.time } : {};
    for (const key of Object.keys(errorBox)) {
      const message = shown[key] ?? "";
      errorBox[key].textContent = message;
      errorInput[key].setAttribute("aria-invalid", message ? "true" : "false");
    }
    return all;
  }

  function refresh() {
    resolution = resolveTime(memory);
    renderTimeChoices();
    showProblems();
  }

  async function runSearch() {
    const query = el.placeQuery.value.trim();
    if (query.length < MIN_PLACE_QUERY_LENGTH) {
      setPlaceStatus(`Type at least ${MIN_PLACE_QUERY_LENGTH} characters, then choose Find place.`, "error");
      el.placeQuery.focus();
      return;
    }
    const token = (searchToken += 1);
    memory.place = null;
    memory.searchResults = [];
    renderPlaceOptions();
    el.placeSearch.disabled = true;
    setPlaceStatus("Searching Open-Meteo…");
    refresh();

    try {
      const candidates = await searchPlaces(query);
      if (token !== searchToken) return; // the player edited or searched again
      memory.searchResults = candidates;
      renderPlaceOptions();
      setPlaceStatus(
        candidates.length === 0
          ? `No places found for “${query}”. Check the spelling or try a nearby city.`
          : `${candidates.length} ${candidates.length === 1 ? "place" : "places"} found. Choose the one you meant.`,
        candidates.length === 0 ? "error" : "",
      );
    } catch {
      if (token !== searchToken) return;
      setPlaceStatus("Place search failed. Check your connection and choose Find place to try again. Your other entries are unchanged.", "error");
    } finally {
      if (token === searchToken) el.placeSearch.disabled = false;
    }
  }

  el.title.addEventListener("input", () => { memory.title = el.title.value; refresh(); });

  el.placeQuery.addEventListener("input", () => {
    // Editing the text after a selection makes that selection stale.
    searchToken += 1;
    memory.placeQuery = el.placeQuery.value;
    memory.place = null;
    memory.disambiguation = null;
    memory.searchResults = [];
    renderPlaceOptions();
    setPlaceStatus();
    el.placeSearch.disabled = false;
    refresh();
  });
  el.placeQuery.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    runSearch();
  });
  el.placeSearch.addEventListener("click", runSearch);

  el.placeOptions.addEventListener("change", (event) => {
    if (!event.target.matches('input[name="place-choice"]')) return;
    memory.place = memory.searchResults[Number(event.target.value)];
    memory.disambiguation = null;
    setPlaceStatus(`Selected ${memory.place.label}. Time zone: ${memory.place.timezone}.`);
    refresh();
  });
  el.date.addEventListener("input", () => { memory.localDate = el.date.value; memory.disambiguation = null; refresh(); });
  el.time.addEventListener("input", () => { memory.localTime = el.time.value; memory.disambiguation = null; refresh(); });
  el.timeChoiceOptions.addEventListener("change", (event) => {
    if (!event.target.matches('input[name="time-choice"]')) return;
    memory.disambiguation = event.target.value;
    refresh();
  });
  el.form.addEventListener("change", (event) => {
    if (event.target.matches('input[name="mood"]')) memory.mood = event.target.value;
  });

  el.form.addEventListener("submit", (event) => {
    event.preventDefault();
    errorsRevealed = true;
    const problems = showProblems();
    const first = ["title", "place", "date", "time"].find((key) => problems[key]);
    if (first) {
      el.status.textContent = "Fix the highlighted fields to continue.";
      el.status.dataset.tone = "error";
      errorInput[first].focus();
      return;
    }
    el.status.textContent = "";
    delete el.status.dataset.tone;
    options.onExplore(getMemory());
  });

  // A snapshot of what the player entered, with the exact moment once it is resolved.
  function getMemory() {
    return {
      title: memory.title.trim(),
      place: memory.place,
      localDate: memory.localDate,
      localTime: memory.localTime,
      mood: memory.mood,
      instant: resolution.instant,
    };
  }

  refresh();
  return { getMemory, focusHeading: () => el.heading.focus({ preventScroll: true }) };
}
