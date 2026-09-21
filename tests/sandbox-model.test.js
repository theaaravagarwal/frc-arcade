"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createGame } = require("../renderer/games/cellDefender");

function context() {
  return {
    clearRect() {}, fillRect() {}, strokeRect() {}, fillText() {}, beginPath() {}, closePath() {},
    moveTo() {}, lineTo() {}, bezierCurveTo() {}, arc() {}, stroke() {}, fill() {}, save() {}, restore() {}, scale() {},
    createLinearGradient() { return { addColorStop() {} }; },
  };
}

function game({ devMode = false, sessionKind } = {}) {
  return createGame({
    canvas: { width: 1280, height: 720, getContext: context },
    audio: { play() {} },
    random: () => 0.5,
    devMode,
    sessionKind,
  });
}

function tick(instance, count, input = {}) {
  while (count--) instance.step(0.02, input);
  return instance.getSnapshot();
}

test("sandbox API is inert in production and invalid configs do not mutate a dev run", () => {
  const production = game();
  production.startSession();
  const beforeProduction = production.getSnapshot();
  assert.equal(production.applySandbox({ weaponId: "rail", invincible: true }), false);
  assert.deepEqual(production.getSnapshot(), beforeProduction);

  const tutorial = game({ devMode: true, sessionKind: "tutorial" });
  tutorial.startSession();
  const beforeTutorial = tutorial.getSnapshot();
  assert.equal(tutorial.applySandbox({ weaponId: "rail" }), false);
  assert.deepEqual(tutorial.getSnapshot(), beforeTutorial);

  const development = game({ devMode: true });
  development.startSession();
  const beforeInvalid = development.getSnapshot();
  for (const config of [
    { weaponId: "not-a-weapon" },
    { abilityId: "not-an-ability" },
    { perks: { overclock: 6 } },
    { perks: { repair: 1 } },
    { perks: { shield: 1 } },
    JSON.parse('{"perks":{"__proto__":1}}'),
    { perks: { power: Infinity } },
    { perks: { power: 101 } },
    { wave: 0 },
    { wave: 1001 },
    { bossPhase: "not-a-phase" },
    { bossPattern: "not-a-pattern" },
    { wave: 9, bossPhase: "assault" },
    { wave: 5, bossPhase: "rage" },
    { wave: 10, bossPhase: "recon" },
    { wave: 10, bossPattern: "crossingStreams", unexpected: true },
    { invincible: "yes" },
    { unexpected: true },
  ]) {
    assert.equal(development.applySandbox(config), false);
    assert.deepEqual(development.getSnapshot(), beforeInvalid);
  }
});

test("sandbox directly restarts compatible boss phase and family states as unscored", () => {
  const instance = game({ devMode: true });
  instance.startSession();
  instance.__test.setScore(410);
  assert.equal(instance.applySandbox({ wave: 10, bossPhase: "rage", bossPattern: "delayedBlooms" }), true);
  let state = instance.getSnapshot();
  assert.equal(state.sandbox, true);
  assert.equal(state.score, 410);
  assert.deepEqual(
    [state.wave, state.enemies[0].type, state.enemies[0].mode, state.enemies[0].phase],
    [10, "majorboss", "rage", 3],
  );
  tick(instance, 80);
  assert.equal(instance.getSnapshot().enemies[0].comboId, "delayedBlooms");
  assert.equal(instance.applySandbox({ bossPhase: "patience" }), true);
  state = instance.getSnapshot();
  assert.deepEqual(
    [state.enemies[0].mode, state.enemies[0].phase, state.enemies[0].hp, state.enemies[0].patienceStyle],
    ["patience", 4, 36, "weave"],
  );
  assert.equal(instance.applySandbox({ wave: 5, bossPhase: "frenzy", bossPattern: "orbitGaps" }), true);
  state = instance.getSnapshot();
  tick(instance, 80);
  assert.deepEqual([state.enemies[0].type, state.enemies[0].mode, state.enemies[0].phase, state.enemies[0].comboId], ["miniboss", "frenzy", 2, "orbitGaps"]);
});

test("a build-only sandbox edit marks the current run and preserves its encounter, position, score, and pause", () => {
  const instance = game({ devMode: true });
  instance.startSession();
  instance.step(0.02, { moveX: 1, moveY: -1 });
  instance.__test.setScore(875);
  const before = instance.getSnapshot();
  instance.pause();

  assert.equal(instance.applySandbox({
    weaponId: "lance",
    abilityId: "barrier",
    perks: { power: 3, overclock: 2 },
    invincible: true,
  }), true);

  const after = instance.getSnapshot();
  assert.equal(after.sandbox, true);
  assert.equal(after.sandboxInvincible, true);
  assert.equal(after.score, 875);
  assert.equal(after.paused, true);
  assert.deepEqual(after.ship, { ...before.ship, invulnerable: false });
  assert.equal(after.counts.enemies, before.counts.enemies);
  assert.deepEqual(after.build.perks.map((perk) => [perk.id, perk.rank]), [["power", 3], ["overclock", 2]]);
  assert.equal(after.weaponId, "lance");
  assert.equal(after.abilityId, "barrier");
});

test("sandbox wave changes rebuild the requested real encounter without resetting score or player position", () => {
  const instance = game({ devMode: true });
  instance.startSession();
  instance.__test.setScore(410);
  instance.__test.setShip(444, 555);
  instance.__test.setHostile([{ x: 444, y: 555, vx: 0, vy: 0 }]);

  assert.equal(instance.applySandbox({ wave: 5 }), true);
  const state = instance.getSnapshot();
  assert.equal(state.wave, 5);
  assert.equal(state.score, 410);
  assert.deepEqual(state.ship, { x: 444, y: 555, r: 10, invulnerable: false });
  assert.equal(state.counts.hostileBullets, 0);
  assert.equal(state.pendingReward, null);
  assert.equal(state.enemies.length, 1);
  assert.equal(state.enemies[0].type, "miniboss");
});

test("sandbox runs skip ordinary rewards and can ignore damage when invincible", () => {
  const rewards = game({ devMode: true });
  rewards.startSession();
  assert.equal(rewards.applySandbox({}), true);
  rewards.__test.setWave(3);
  rewards.__test.clearWave();
  rewards.step(0.02);
  assert.equal(rewards.getSnapshot().pendingReward, null);
  assert.equal(rewards.getSnapshot().substate, "breather");
  tick(rewards, 101);
  assert.equal(rewards.getSnapshot().wave, 4);

  const invincible = game({ devMode: true });
  invincible.startSession();
  assert.equal(invincible.applySandbox({ invincible: true }), true);
  invincible.__test.setShip(600, 600);
  invincible.__test.setHostile([{ x: 600, y: 600, vx: 0, vy: 0 }]);
  invincible.step(0.02);
  assert.equal(invincible.getSnapshot().lives, 3);
  assert.equal(invincible.getSnapshot().sandboxInvincible, true);
});

test("sandbox perks preserve their real gameplay meaning and swaps clear stale transients", () => {
  const instance = game({ devMode: true });
  instance.startSession();
  assert.equal(instance.applySandbox({ weaponId: "barrage", abilityId: "barrier", perks: { breakthrough: 2 } }), true);
  instance.__test.clearWave();
  instance.__test.spawn("tank", 100, 100);
  instance.step(0.02);
  assert.equal(instance.getSnapshot().shots[0].damage, 2);

  instance.__test.setCharge(1);
  instance.step(0.02, { specialPressed: true });
  assert.ok(instance.getSnapshot().barrierSeconds > 0);
  assert.equal(instance.applySandbox({ weaponId: "lance", abilityId: "overdrive" }), true);
  assert.equal(instance.getSnapshot().barrierSeconds, 0);
  assert.equal(instance.getSnapshot().overdriveSeconds, 0);
  tick(instance, 10);
  assert.equal(
    instance.getSnapshot().shots.filter((shot) => shot.weaponId === "barrage").length,
    1,
    "only the already-fired barrage shot remains; delayed shots were cleared",
  );
});

test("sandbox safely dismisses a regular pending reward into a paused breather", () => {
  const instance = game({ devMode: true });
  instance.startSession();
  instance.__test.setWave(3);
  instance.__test.clearWave();
  instance.step(0.02);
  assert.ok(instance.getSnapshot().pendingReward);
  instance.pause();
  assert.equal(instance.applySandbox({ weaponId: "seeker" }), true);
  const state = instance.getSnapshot();
  assert.equal(state.pendingReward, null);
  assert.equal(state.substate, "breather");
  assert.equal(state.wave, 4);
  assert.equal(state.paused, true);
});
