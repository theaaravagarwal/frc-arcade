"use strict";

// Fast, deterministic content contract checks. This validates authored IDs and
// bounded projectile geometry without starting Electron or judging fun.
const assert = require("node:assert/strict");
const { WEAPONS, EVOLUTIONS } = require("../renderer/games/cellDefender/weapons");
const { buildCombo, buildPatienceBeat } = require("../renderer/games/cellDefender/bossPatterns");

const expectedParents = ["spread", "lance", "seeker", "fan", "barrage", "rail", "chain", "swarm", "drones"];
for (const id of expectedParents) assert.ok(Array.isArray(EVOLUTIONS[id]), `missing evolution path: ${id}`);
assert.equal(Object.values(EVOLUTIONS).reduce((n, ids) => n + ids.length, 0), 18, "six paths must expose two children each");
for (const [parent, children] of Object.entries(EVOLUTIONS)) {
  assert.equal(children.length, 2, `${parent} has two children`);
  for (const child of children) assert.ok(WEAPONS[child], `missing weapon: ${child}`);
}

const context = { boss: { x: 640, y: 150 }, ship: { x: 640, y: 620 }, comboSerial: 7 };
for (const mode of ["frenzy", "mutation", "rage"]) for (const family of ["crossingStreams", "orbitGaps", "sweepPursuit"]) {
  const combo = buildCombo({ family, mode, wave: 20, ...context });
  for (const beat of combo.beats) for (const shot of beat.bullets) {
    assert.ok(["standard", "heavy", "needle"].includes(shot.kind));
    assert.ok(Number.isFinite(shot.r) && shot.r >= 3.5 && shot.r <= 8);
    assert.ok(Math.hypot(shot.vx, shot.vy) <= 260 + 1e-9);
  }
}
for (const index of [0, 1, 2, 3]) {
  const beat = buildPatienceBeat({ style: "rotation", wave: 20, boss: context.boss, ship: context.ship, index });
  assert.ok(beat.bullets.every((shot) => Number.isFinite(shot.r) && Math.hypot(shot.vx, shot.vy) <= 260 + 1e-9));
}
console.log(`content OK: ${Object.keys(WEAPONS).length} weapons, ${Object.values(EVOLUTIONS).reduce((n, ids) => n + ids.length, 0)} evolution children, bounded boss projectile variants`);
