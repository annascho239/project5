// Which constellations can be played as launcher levels, decided by rules in code, never by a hand-kept
// list. Pure: no DOM. A level depends only on the constellation (its shape and a seed from its id), never
// on the place or time, so the answer for each of the 88 constellations is fixed.

import { BOARD, buildLevel } from "./game-levels.js";
import { PHYSICS, createGame, playShot } from "./game-physics.js";

export const PLAYABLE = Object.freeze({
  minStars: 3, // fewer than this is not a game
  maxStars: 12, // more than this is too many to light on a phone screen
  minSeparation: 2 * BOARD.starRadius + 4, // stars closer than this cannot be hit one at a time
  extraBumpers: 3, // bumpers = stars + this, capped at maxBumpers (matches the first three levels)
  maxBumpers: 14,
  aimStepDegrees: 0.5, // resolution of the "can every star be reached?" search
});

const DIFFICULTY_BY_STARS = [
  { upTo: 5, name: "Easy" },
  { upTo: 8, name: "Medium" },
  { upTo: Infinity, name: "Hard" },
];

export function difficultyFor(starCount) {
  return DIFFICULTY_BY_STARS.find((tier) => starCount <= tier.upTo).name;
}

export function bumperCountFor(starCount) {
  return Math.min(PLAYABLE.maxBumpers, starCount + PLAYABLE.extraBumpers);
}

function starCountOf(polylines) {
  const keys = new Set();
  for (const line of polylines) for (const point of line) keys.add(`${point[0]},${point[1]}`);
  return keys.size;
}

function closestPair(stars) {
  let closest = Infinity;
  for (let i = 0; i < stars.length; i += 1) {
    for (let j = i + 1; j < stars.length; j += 1) {
      closest = Math.min(closest, Math.hypot(stars[i].x - stars[j].x, stars[i].y - stars[j].y));
    }
  }
  return closest;
}

// The reasons a constellation cannot be played, in plain words. `kind` is stable for code and tests.
const REASONS = {
  "too-few": (n) => `Too few stars to make a game (${n}).`,
  "too-many": (n) => `Too many stars to play on a phone screen (${n}).`,
  crowded: () => "Its stars are too close together to tap one at a time.",
  unreachable: (n) => `${n} of its stars cannot be reached by any shot.`,
  "no-room": () => "There is no room on the board for the bouncers.",
};

function unplayable(base, kind, detail) {
  return { ...base, playable: false, kind, reason: REASONS[kind](detail) };
}

// The cheap checks: star count and spacing. Every constellation that passes these also passes the full
// reachability check (verified for all 88 in tests/game-pool.html), so lists can use this quickly.
export function quickAssess(id, catalog) {
  const polylines = catalog.lines.get(id);
  const properties = catalog.info.get(id);
  if (!polylines || !properties) throw new Error(`Unknown constellation "${id}".`);

  const starCount = starCountOf(polylines);
  const base = { id, starCount, difficulty: difficultyFor(starCount), minSeparation: null };

  if (starCount < PLAYABLE.minStars) return unplayable(base, "too-few", starCount);
  if (starCount > PLAYABLE.maxStars) return unplayable(base, "too-many", starCount);

  let level;
  try {
    level = buildLevel({ id, bumpers: bumperCountFor(starCount) }, catalog);
  } catch {
    return unplayable(base, "no-room");
  }
  const separation = closestPair(level.stars);
  const measured = { ...base, minSeparation: Math.round(separation * 10) / 10 };
  if (separation < PLAYABLE.minSeparation) return unplayable(measured, "crowded");
  return { ...measured, playable: true, kind: "playable", reason: "" };
}

// The full check: also searches every aim for stars no shot can reach, and estimates how many launches
// a perfect player would need (a greedy cover, an upper bound on the best possible).
export function assessConstellation(id, catalog) {
  const quick = quickAssess(id, catalog);
  if (!quick.playable) return quick;

  const level = buildLevel({ id, bumpers: bumperCountFor(quick.starCount) }, catalog);
  const outcomes = new Map();
  const reached = new Array(level.stars.length).fill(false);
  const limit = PHYSICS.maxAimDegrees + 1e-9;
  for (let degrees = -PHYSICS.maxAimDegrees; degrees <= limit; degrees += PLAYABLE.aimStepDegrees) {
    const game = createGame(level);
    playShot(game, (degrees * Math.PI) / 180);
    outcomes.set(game.lit.join(), game.lit);
    game.lit.forEach((lit, index) => { if (lit) reached[index] = true; });
  }

  const unreachable = reached.filter((r) => !r).length;
  if (unreachable > 0) return unplayable({ ...quick }, "unreachable", unreachable);

  const shots = [...outcomes.values()];
  let remaining = new Array(level.stars.length).fill(true);
  let launches = 0;
  while (remaining.some(Boolean) && launches < 50) {
    let best = null;
    let bestGain = 0;
    for (const shot of shots) {
      const gain = shot.reduce((sum, lit, index) => sum + (lit && remaining[index] ? 1 : 0), 0);
      if (gain > bestGain) { bestGain = gain; best = shot; }
    }
    if (!best) break;
    remaining = remaining.map((needed, index) => needed && !best[index]);
    launches += 1;
  }
  return { ...quick, expertLaunches: launches, bestSingleShot: Math.max(...shots.map((s) => s.filter(Boolean).length)) };
}

// Assess every constellation in the catalog.
export function assessAll(catalog, { full = true } = {}) {
  return [...catalog.lines.keys()].map((id) => (full ? assessConstellation(id, catalog) : quickAssess(id, catalog)));
}

export function buildPlayableLevel(id, catalog) {
  const assessment = quickAssess(id, catalog);
  if (!assessment.playable) throw new Error(`${id} is not playable: ${assessment.reason}`);
  return buildLevel({ id, bumpers: bumperCountFor(assessment.starCount) }, catalog);
}
