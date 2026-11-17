// The memory the player describes: a place, a date, and a clock time at that place. This file holds the
// rules only (no DOM): turning a clock time at a place into an exact instant, with daylight-saving gaps
// rejected and repeated hours made a choice, plus validation and the place search request.
// Luxon (vendor/luxon.min.js) must be loaded as a classic script first; it provides the time-zone maths.

export const MIN_YEAR = 1900;
export const MAX_YEAR = 2100;
export const MIN_PLACE_QUERY_LENGTH = 2;
export const MAX_PLACE_RESULTS = 8;
export const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const DAY_MS = 86400000;

const luxon = () => {
  if (!globalThis.luxon) throw new Error("Luxon must be loaded before memory.js is used.");
  return globalThis.luxon;
};

// Every UTC instant at which `localDate` + `localTime` shows on the clock in `zoneName`.
// Zero matches is a daylight-saving gap (the time does not exist); two is a fall-back repeat.
// Native Date or Luxon's default parsing would silently pick one, so the possibilities are listed.
export function matchingInstants(localDate, localTime, zoneName) {
  const { IANAZone } = luxon();
  const [year, month, day] = localDate.split("-").map(Number);
  const [hour, minute] = localTime.split(":").map(Number);
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const zone = IANAZone.create(zoneName);
  const candidateOffsets = new Set([zone.offset(localAsUtc - DAY_MS), zone.offset(localAsUtc + DAY_MS)]);

  return [...candidateOffsets]
    .map((offsetMinutes) => localAsUtc - offsetMinutes * 60000)
    .filter((utc) => zone.offset(utc) === (localAsUtc - utc) / 60000)
    .sort((a, b) => a - b);
}

// Resolves the memory's clock time. Returns { instant, issue, choices }:
//   issue "gap"        the time does not exist that day
//   issue "ambiguous"  it happened twice; `choices` lists both instants (ms), earlier first
//   instant            a Date once the time is unambiguous or the player has chosen
export function resolveTime({ place, localDate, localTime, disambiguation }) {
  const none = { instant: null, issue: null, choices: [] };
  const year = Number((localDate || "").slice(0, 4));
  if (!place || !localDate || !localTime || year < MIN_YEAR || year > MAX_YEAR) return none;

  const matches = matchingInstants(localDate, localTime, place.timezone);
  if (matches.length === 0) return { ...none, issue: "gap" };
  if (matches.length === 1) return { ...none, instant: new Date(matches[0]) };

  const index = { earlier: 0, later: 1 }[disambiguation];
  return { instant: index === undefined ? null : new Date(matches[index]), issue: "ambiguous", choices: matches };
}

export function zonedDateTime(instantMs, zoneName) {
  return luxon().DateTime.fromMillis(instantMs, { zone: zoneName }).setLocale("en-US");
}

export function offsetLabel(dateTime) {
  return `${dateTime.toFormat("ZZZZ")}, UTC${dateTime.toFormat("ZZ")}`;
}

// How a moment reads at its place, for summaries.
export function describeMoment(instant, zoneName) {
  const local = zonedDateTime(instant.getTime(), zoneName);
  return {
    dateText: local.toFormat("LLLL d, yyyy"),
    timeText: local.toFormat("h:mm a"),
    zoneText: offsetLabel(local),
    local,
  };
}

// Required and time-zone problems, keyed by field. The caller decides which to show and when.
export function fieldProblems(memory, resolution) {
  const problems = {};
  if (!memory.title.trim()) problems.title = "Enter a title for this memory.";
  if (!memory.place) {
    problems.place = memory.placeQuery.trim()
      ? "Choose Find place, then select the place you meant."
      : "Enter a place and choose Find place.";
  }

  const year = Number((memory.localDate || "").slice(0, 4));
  if (!memory.localDate) problems.date = "Enter the date.";
  else if (year < MIN_YEAR || year > MAX_YEAR) problems.date = `Enter a year between ${MIN_YEAR} and ${MAX_YEAR}.`;

  if (!memory.localTime) problems.time = "Enter the approximate local time.";
  else if (resolution.issue === "gap") {
    problems.time = `That time does not exist in ${memory.place.timezone} on this date because clocks skipped forward. Choose another time.`;
  } else if (resolution.issue === "ambiguous" && !memory.disambiguation) {
    problems.time = "Choose the earlier or later occurrence of this time.";
  }
  return problems;
}

// "Chicago, Cook, Illinois, United States": the parts that tell similar names apart, without repeats.
export function placeLabel(result) {
  return [result.name, result.admin2, result.admin1, result.country]
    .filter(Boolean)
    .filter((part, index, all) => all.indexOf(part) === index)
    .join(", ");
}

export function toCandidate(result) {
  return { id: result.id, label: placeLabel(result), latitude: result.latitude, longitude: result.longitude, timezone: result.timezone };
}

// The one request that leaves the browser: only the typed place text goes to Open-Meteo.
export async function searchPlaces(query, fetchImpl = (...args) => fetch(...args)) {
  const url = `${GEOCODING_URL}?name=${encodeURIComponent(query)}&count=${MAX_PLACE_RESULTS}&language=en&format=json`;
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Geocoding returned ${response.status}`);
  const data = await response.json();
  return (data.results ?? []).filter((result) => result.timezone).map(toCandidate);
}
