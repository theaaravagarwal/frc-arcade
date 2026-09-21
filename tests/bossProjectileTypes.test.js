"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildCombo, buildPatienceBeat } = require("../renderer/games/cellDefender/bossPatterns");

const args = (overrides = {}) => ({
  family: "crossingStreams", mode: "assault", wave: 10,
  boss: { x: 640, y: 150 }, ship: { x: 640, y: 620 }, comboSerial: 2, ...overrides,
});
const kinds = (beat) => beat.bullets.map((b) => b.kind);

test("heavy variants replace one center stream per side in mutation and miniboss frenzy", () => {
  for (const mode of ["mutation", "frenzy"]) {
    const combo = buildCombo(args({ mode, wave: mode === "frenzy" ? 5 : 10 }));
    const heavy = combo.beats[0].bullets.filter((b) => b.kind === "heavy");
    assert.equal(heavy.length, 2);
    assert.deepEqual(heavy.map((b) => b.r), [8, 8]);
    assert.ok(heavy.every((b) => Math.hypot(b.vx, b.vy) <= 260));
    assert.equal(combo.beats[0].bullets.length, 6);
  }
  assert.equal(buildCombo(args()).beats[0].bullets.filter((b) => b.kind !== "standard").length, 0);
});

test("needle variants are sparse, alternating, and speed capped in rage orbit and sweep beats", () => {
  for (const family of ["orbitGaps", "sweepPursuit"]) {
    const combo = buildCombo(args({ family, mode: "rage", wave: 20 }));
    const first = combo.beats[0].bullets.filter((b) => b.kind === "needle");
    const second = combo.beats[1].bullets.filter((b) => b.kind === "needle");
    assert.equal(first.length, 1);
    assert.equal(second.length, 0);
    assert.equal(first[0].r, 3.5);
    assert.ok(Math.hypot(first[0].vx, first[0].vy) <= 260);
    assert.equal(combo.beats[0].bullets.length, family === "orbitGaps" ? 8 : 7);
  }
  const early = buildCombo(args({ family: "orbitGaps", mode: "rage", wave: 19 }));
  assert.equal(early.beats[0].bullets.some((b) => b.kind === "needle"), false);
});

test("late patience rotation adds alternating needle pursuit bolts", () => {
  const even = buildPatienceBeat({ style: "rotation", wave: 20, boss: { x: 640, y: 150 }, ship: { x: 640, y: 620 }, index: 0 });
  const odd = buildPatienceBeat({ style: "rotation", wave: 20, boss: { x: 640, y: 150 }, ship: { x: 640, y: 620 }, index: 1 });
  assert.equal(even.bullets.filter((b) => b.kind === "needle").length, 1);
  assert.equal(odd.bullets.filter((b) => b.kind === "needle").length, 0);
  assert.equal(even.bullets.length, odd.bullets.length);
});

test("expanded families keep their declared projectile and emitter contracts", () => {
  const specs = [
    ["latticeSweep", 5, 5, 5],
    ["petalBurst", 8, 8, 2],
    ["anchorCross", 6, 6, 3],
  ];
  for (const [family, count, maxSpeed, emitters] of specs) {
    const combo = buildCombo(args({ family, mode: "assault" }));
    assert.ok(combo);
    assert.ok(combo.capacity <= 32);
    assert.equal(combo.beats[0].bullets.length, count);
    assert.equal(combo.beats[0].emitters.length, emitters);
    assert.ok(combo.beats.every((beat) => beat.bullets.every((b) => Math.hypot(b.vx, b.vy) <= 260)));
    assert.ok(combo.beats[0].bullets.every((b) => Number.isFinite(b.delay)));
  }
  const petal = buildCombo(args({ family: "petalBurst", mode: "assault" })).beats[0].bullets;
  assert.equal(petal.filter((b) => b.delay === 0.18).length, 4);
});

test("lattice opening drifts at most one lane between adjacent beats", () => {
  for (const mode of ["assault", "mutation", "rage"]) {
    for (let comboSerial = 0; comboSerial < 8; comboSerial++) {
      const combo = buildCombo(args({ family: "latticeSweep", mode, comboSerial, ship: { x: 640, y: 620 } }));
      const gapCenter = (beat) => {
        const occupied = new Set(beat.bullets.map((b) => Math.round((b.x - 145) / 165)));
        return [0, 1, 2, 3, 4, 5].find((lane) => !occupied.has(lane) && !occupied.has(lane + 1));
      };
      const latticeBeats = combo.beats.filter((beat) => beat.family === "latticeSweep");
      for (let index = 1; index < latticeBeats.length; index++) {
        assert.ok(Math.abs(gapCenter(latticeBeats[index]) - gapCenter(latticeBeats[index - 1])) <= 1);
      }
    }
  }
});
