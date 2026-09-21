"use strict";

// Deterministic controller-route probe. It uses real fixed-step movement and
// collision, but chooses each stick direction from a small grid against the
// currently visible projectile and area geometry. It is intentionally a
// reachability check, not a claim about human difficulty.
const assert = require("node:assert/strict");
const { createGame } = require("../renderer/games/cellDefender");

const STEP = 0.02;
const FAMILIES = ["crossingStreams", "orbitGaps", "delayedBlooms", "sweepPursuit"];
const NEW_FAMILIES = ["latticeSweep", "petalBurst", "anchorCross"];
const DIRECTIONS = [
  [0, 0], [-1, 0], [1, 0], [0, -1], [0, 1],
  [-1, -1], [1, -1], [-1, 1], [1, 1],
];

function context() {
  return {
    clearRect() {}, fillRect() {}, strokeRect() {}, fillText() {}, beginPath() {}, closePath() {},
    moveTo() {}, lineTo() {}, bezierCurveTo() {}, arc() {}, stroke() {}, fill() {}, save() {}, restore() {}, scale() {},
    createLinearGradient() { return { addColorStop() {} }; },
  };
}
function game() {
  return createGame({
    canvas: { width: 1280, height: 720, getContext: context },
    audio: { play() {} },
    random: () => 0.5,
    devMode: true,
  });
}
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function nextPosition(ship, direction, focus) {
  let [x, y] = direction;
  const length = Math.hypot(x, y) || 1;
  x /= length; y /= length;
  const speed = focus ? 210 : 380;
  return {
    x: Math.max(42, Math.min(1238, ship.x + x * speed * STEP)),
    y: Math.max(105, Math.min(675, ship.y + y * speed * STEP)),
  };
}
function dangerAt(state, point) {
  const shipRadius = state.ship.r;
  let penalty = 0;
  for (const bullet of state.hostilebullets || []) {
    // Test both the imminent fixed step and a short readable lookahead. This
    // makes a corridor that is merely empty this frame insufficient.
    for (const lead of [STEP, 0.16, 0.32]) {
      const future = { x: bullet.x + bullet.vx * lead, y: bullet.y + bullet.vy * lead };
      const clearance = distance(point, future) - shipRadius - (bullet.r || 5);
      if (clearance <= 0) { penalty += 1e8; continue; }
      penalty += 1100 / Math.max(12, clearance * clearance);
    }
  }
  for (const area of state.hazards || []) {
    if (area.state === "expiry") continue;
    const clearance = distance(point, area) - shipRadius - area.radius;
    if (area.state === "active" && clearance <= 0) { penalty += 1e8; continue; }
    // Telegraphs reserve space but are not treated as a collision before the
    // model declares them active.
    penalty += (area.state === "active" ? 1200 : 140) / Math.max(10, clearance * clearance);
  }
  return penalty;
}
function chooseInput(state, focus) {
  const locked = (state.warnings || []).find((warning) => warning.kind === "boss-orbitGaps" && warning.target);
  // A locked pursuit tell gives enough time to leave its stored target. Move
  // decisively before applying the local bullet-grid choice at release.
  if (locked) {
    const side = state.ship.x <= locked.target.x ? -1 : 1;
    return { moveX: side, moveY: state.ship.y > 620 ? -.25 : .25, actionDown: focus };
  }
  let best = null;
  for (const direction of DIRECTIONS) {
    const point = nextPosition(state.ship, direction, focus);
    const centerPenalty = Math.abs(point.x - 640) * 0.0008 + Math.max(0, 250 - point.y) * 0.01;
    const score = dangerAt(state, point) + centerPenalty;
    if (!best || score < best.score) best = { direction, score };
  }
  return { moveX: best.direction[0], moveY: best.direction[1], actionDown: focus };
}
function route({ wave, bossPhase, bossPattern, expectedPatterns = [bossPattern], focus, start, frames, label }) {
  const instance = game();
  instance.startSession();
  assert.equal(
    instance.applySandbox({ wave, bossPhase, ...(bossPattern ? { bossPattern } : {}) }),
    true,
    `${label}: sandbox must create the requested real boss state`,
  );
  instance.__test.setShip(...start);
  const initial = instance.getSnapshot();
  const initialLives = initial.lives;
  const warnings = new Set();
  const observed = { emitters: 0, hazards: 0, activeHazards: 0 };
  for (let frame = 0; frame < frames; frame++) {
    const before = instance.getSnapshot();
    const state = instance.step(STEP, chooseInput(before, focus));
    state.warnings.forEach((warning) => warnings.add(warning.kind));
    observed.emitters = Math.max(observed.emitters, state.emitters.length);
    observed.hazards = Math.max(observed.hazards, state.hazards.length);
    observed.activeHazards = Math.max(observed.activeHazards, state.hazards.filter((area) => area.state === "active").length);
    if (state.lives !== initialLives) return { label, start, survived: false, warnings: [...warnings], ...observed };
    assert.ok(state.counts.hostileBullets <= state.scheduler.activeBulletLimit, `${label}: hostile cap`);
  }
  for (const expected of expectedPatterns)
    assert.ok(warnings.has(`boss-${expected}`), `${label}: expected family ${expected} was not emitted`);
  return { label, start, survived: true, warnings: [...warnings], ...observed };
}
function reachable(spec) {
  const starts = spec.starts || [[240, 620], [640, 620], [1040, 620]];
  const row = starts.map((start) => route({ ...spec, start })).find((candidate) => candidate.survived);
  assert.ok(row, `${spec.label}: no listed controller start reached the promised corridor`);
  return row;
}

const rows = [];
for (const bossPhase of ["assault", "mutation", "rage"]) {
  for (const bossPattern of FAMILIES) {
    for (const focus of [false, true]) {
      rows.push(reachable({
        wave: 10,
        bossPhase,
        bossPattern,
        focus,
        starts: focus ? [[240, 650], [640, 650], [1040, 650]] : undefined,
        frames: 260,
        label: `${bossPhase}/${bossPattern}/${focus ? "focus" : "normal"}`,
      }));
    }
  }
}

for (const bossPattern of NEW_FAMILIES) {
  for (const focus of [false, true]) {
    rows.push(reachable({
      wave: 10,
      bossPhase: "assault",
      bossPattern,
      focus,
      starts: focus ? [[240, 650], [640, 650], [1040, 650]] : undefined,
      frames: 260,
      label: `assault/${bossPattern}/${focus ? "focus" : "normal"}`,
    }));
  }
}

// These three runs exercise the actual scripted weave, rotation, and mixed
// patience schedules from different reachable opening positions.
for (const [wave, start] of [[10, [260, 620]], [20, [640, 620]], [30, [1020, 620]]]) {
  rows.push(reachable({
    wave,
    bossPhase: "patience",
    expectedPatterns: wave === 10 ? ["crossingStreams"] : wave === 20 ? ["orbitGaps"] : ["crossingStreams", "orbitGaps"],
    focus: false,
    starts: [start, [640, 620], [240, 620], [1040, 620]],
    frames: wave === 10 ? 540 : wave === 20 ? 640 : 840,
    label: `patience-wave-${wave}`,
  }));
}

console.log(JSON.stringify({
  notes: "Assisted unscored sandbox route planner. It evaluates a 3x3 stick grid against live bullets and hazard geometry every 20 ms. Passing shows a discrete controller corridor from the recorded starts under normal/focus movement; it does not measure human difficulty.",
  rows,
}, null, 2));
