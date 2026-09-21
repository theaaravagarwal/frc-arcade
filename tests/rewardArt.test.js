"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { rewardArt } = require("../renderer/hosa/rewardArt");
const catalog = require("../renderer/games/cellDefender/weapons");
const { ACTORS, FRAMES } = require("../renderer/hosa/cellAtlas");

const ADVANCED = ["tempest", "trident", "vulcan", "helix", "needle", "siege", "arcstorm", "tesla", "hive", "hunter", "escort", "sentinel"];

test("advanced weapons have exact, distinct firing pattern previews", () => {
  for (const id of ADVANCED) {
    assert.ok(catalog.WEAPONS[id], `missing catalog weapon ${id}`);
    const svg = rewardArt({ id, preview: id, category: "weapon" });
    assert.match(svg, new RegExp(`preview-${id}(?:[" ])`));
    assert.doesNotMatch(svg, /preview-perk/);
  }
  const geometry = ADVANCED.map((id) => {
    const svg = rewardArt({ id, preview: id });
    const start = svg.indexOf('<g class="preview-effect"');
    const end = svg.indexOf('<g class="preview-emitter"', start);
    return svg.slice(start, end);
  });
  assert.equal(new Set(geometry).size, ADVANCED.length);
});

test("preview matching never confuses similarly named weapon IDs", () => {
  const trident = rewardArt({ id: "trident", preview: "trident" });
  const rail = rewardArt({ id: "rail", preview: "rail" });
  const hive = rewardArt({ id: "hive", preview: "hive" });
  const hunter = rewardArt({ id: "hunter", preview: "hunter" });
  assert.match(trident, /preview-trident/);
  assert.match(rail, /preview-rail/);
  assert.match(hive, /preview-hive/);
  assert.match(hunter, /preview-hunter/);
  assert.notEqual(trident, rail);
  assert.notEqual(hive, hunter);
  assert.match(rewardArt({ id: "weapon:needle" }), /preview-needle/);
});

test("identity enemy atlas has dedicated complete frames for new public types", () => {
  for (const type of ["skirmisher", "bulwark", "orbiter"]) {
    assert.ok(ACTORS[type], `missing actor atlas entry for ${type}`);
    for (const state of ["idle", "charge", "release", "death"]) {
      assert.ok(ACTORS[type][state]?.length, `missing ${type} ${state} frames`);
      assert.ok(FRAMES[ACTORS[type][state][0]], `missing painted ${type} ${state} frame`);
    }
  }
  assert.notEqual(FRAMES[ACTORS.skirmisher.idle[0]], FRAMES[ACTORS.bulwark.idle[0]]);
  assert.notEqual(FRAMES[ACTORS.bulwark.idle[0]], FRAMES[ACTORS.orbiter.idle[0]]);
});
