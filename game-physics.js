// Rules and physics for the constellation launcher. Pure and deterministic: a fixed time step,
// no randomness, no DOM. The same level, aim, and launch always produce the same path.

import { BOARD } from "./game-levels.js";

export const PHYSICS = Object.freeze({
  speed: 420, // board units per second, constant (no gravity, no energy loss)
  step: 1 / 120, // seconds per fixed step; speed × step (3.5) is smaller than the ball radius (7), so no tunnelling
  maxSteps: 120 * 20, // a launch that lasts 20 seconds ends on its own
  maxBounces: 8, // a launch is spent on the bounce after this many (walls, pegs, and stars all count)
  maxAimDegrees: 70, // the ball always starts upward
  starsBounce: true, // stars are solid like pegs; provisional until play-testing
});

const MAX_AIM = (PHYSICS.maxAimDegrees * Math.PI) / 180;

// Aim angle is measured from straight up; positive leans right.
export function clampAim(angle) {
  return Math.max(-MAX_AIM, Math.min(MAX_AIM, angle));
}

// Angle from the launcher toward a touched or clicked board point.
export function aimToward(x, y) {
  return clampAim(Math.atan2(x - BOARD.launcher.x, BOARD.launcher.y - y));
}

export function createGame(level, { maxSteps = PHYSICS.maxSteps, maxBounces = PHYSICS.maxBounces } = {}) {
  return {
    level,
    maxSteps,
    maxBounces,
    lit: level.stars.map(() => false),
    launches: 0,
    ball: null, // { x, y, vx, vy, steps } while a launch is in flight
    won: false,
  };
}

export function progress(game) {
  const lit = game.lit.filter(Boolean).length;
  return { lit, total: game.lit.length, launches: game.launches, won: game.won, inFlight: game.ball !== null };
}

// Starts a launch. Refused while a ball is in flight or after the level is won.
export function launch(game, angle) {
  if (game.ball || game.won) return false;
  const aim = clampAim(angle);
  game.launches += 1;
  game.ball = {
    x: BOARD.launcher.x,
    y: BOARD.launcher.y,
    vx: PHYSICS.speed * Math.sin(aim),
    vy: -PHYSICS.speed * Math.cos(aim),
    steps: 0,
    bounces: 0,
  };
  return true;
}

// Pushes the ball out of a circle and reflects it, if they overlap. Returns whether they touched.
function collideCircle(ball, cx, cy, radius) {
  const dx = ball.x - cx;
  const dy = ball.y - cy;
  const reach = BOARD.ballRadius + radius;
  const distanceSquared = dx * dx + dy * dy;
  if (distanceSquared >= reach * reach) return false;

  const distance = Math.sqrt(distanceSquared);
  const nx = distance === 0 ? 0 : dx / distance;
  const ny = distance === 0 ? 1 : dy / distance;
  ball.x = cx + nx * reach;
  ball.y = cy + ny * reach;

  const approach = ball.vx * nx + ball.vy * ny;
  if (approach < 0) {
    ball.vx -= 2 * approach * nx;
    ball.vy -= 2 * approach * ny;
  }
  return true;
}

function bounceOffWalls(ball) {
  const r = BOARD.ballRadius;
  let hit = false;
  if (ball.x < r) { ball.x = r; ball.vx = Math.abs(ball.vx); hit = true; }
  if (ball.x > BOARD.width - r) { ball.x = BOARD.width - r; ball.vx = -Math.abs(ball.vx); hit = true; }
  if (ball.y < r) { ball.y = r; ball.vy = Math.abs(ball.vy); hit = true; }
  return hit;
}

// Advances one fixed step. Returns the events that happened:
//   { type: "bounce", kind: "wall" | "bumper" | "star" }
//   { type: "light", index }           a star lit for the first time
//   { type: "end", reason: "bottom" | "timeout" | "spent" | "won" }
export function step(game) {
  const events = [];
  const ball = game.ball;
  if (!ball) return events;

  ball.x += ball.vx * PHYSICS.step;
  ball.y += ball.vy * PHYSICS.step;
  ball.steps += 1;

  if (bounceOffWalls(ball)) events.push({ type: "bounce", kind: "wall" });

  for (const bumper of game.level.bumpers) {
    if (collideCircle(ball, bumper.x, bumper.y, BOARD.bumperRadius)) events.push({ type: "bounce", kind: "bumper" });
  }

  game.level.stars.forEach((star, index) => {
    const touched = PHYSICS.starsBounce
      ? collideCircle(ball, star.x, star.y, BOARD.starRadius)
      : Math.hypot(ball.x - star.x, ball.y - star.y) < BOARD.ballRadius + BOARD.starRadius;
    if (!touched) return;
    events.push({ type: "bounce", kind: "star" });
    if (!game.lit[index]) {
      game.lit[index] = true;
      events.push({ type: "light", index });
    }
  });

  if (bounceOffWalls(ball)) events.push({ type: "bounce", kind: "wall" });

  // Keep speed constant against rounding drift.
  const speed = Math.hypot(ball.vx, ball.vy);
  ball.vx = (ball.vx / speed) * PHYSICS.speed;
  ball.vy = (ball.vy / speed) * PHYSICS.speed;

  ball.bounces += events.filter((event) => event.type === "bounce").length;

  // A level with no stars can never be won ("every star is lit" would be vacuously true).
  if (game.lit.length > 0 && game.lit.every(Boolean)) {
    game.won = true;
    game.ball = null;
    events.push({ type: "end", reason: "won" });
  } else if (ball.y - BOARD.ballRadius > BOARD.height) {
    game.ball = null;
    events.push({ type: "end", reason: "bottom" });
  } else if (ball.bounces > game.maxBounces) {
    game.ball = null;
    events.push({ type: "end", reason: "spent" });
  } else if (ball.steps >= game.maxSteps) {
    game.ball = null;
    events.push({ type: "end", reason: "timeout" });
  }
  return events;
}

// Launches and runs the whole shot at once (used for the reduced-motion "instant result" and in tests).
// With recordPath, also returns the ball's position after every step so it can be drawn immediately.
export function playShot(game, angle, { recordPath = false } = {}) {
  const accepted = launch(game, angle);
  if (!accepted) return { accepted, events: [], path: [], reason: null };

  const events = [];
  const path = recordPath ? [[game.ball.x, game.ball.y]] : [];
  let reason = null;
  while (game.ball) {
    for (const event of step(game)) {
      events.push(event);
      if (event.type === "end") reason = event.reason;
    }
    if (recordPath && game.ball) path.push([game.ball.x, game.ball.y]);
  }
  return { accepted, events, path, reason };
}
