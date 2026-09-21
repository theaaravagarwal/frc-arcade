"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const {
  createGame,
  difficultyForWave,
  regularEnemyHealthForWave,
  encounterTypeForWave,
  bossHealthForWave,
} = require("../renderer/games/cellDefender");
const { COMBO_IDS } = require("../renderer/games/cellDefender/bossPatterns");
function ctx() {
  let g = { addColorStop() {} };
  return {
    clearRect() {},
    fillRect() {},
    strokeRect() {},
    fillText() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    bezierCurveTo() {},
    arc() {},
    stroke() {},
    fill() {},
    save() {},
    restore() {},
    scale() {},
    createLinearGradient() {
      return g;
    },
  };
}
function game(events = [], options = {}) {
  return createGame({
    canvas: { width: 1280, height: 720, getContext: ctx },
    random: () => 0.5,
    onEvent: (e) => events.push(e),
    audio: { play() {} },
    reducedMotion: options.reducedMotion,
    sessionKind: options.sessionKind,
    devMode: options.devMode,
  });
}
const ticks = (g, n, i = {}) => {
  while (n--) g.step(0.02, i);
  return g.getSnapshot();
};
function settleReward(g, offer = 0) {
  const pending = g.getSnapshot().pendingReward;
  if (pending) assert.equal(g.chooseUpgrade(pending.offers[offer].id), true);
}
function advanceToWave(g, targetWave) {
  let guard = 200;
  while (g.getSnapshot().wave < targetWave && guard--) {
    settleReward(g);
    g.__test.clearWave();
    g.step(0.02);
    settleReward(g);
    ticks(g, 102);
  }
  assert.ok(guard > 0, `advanced to wave ${targetWave}`);
}
test("XY speed is normalized; automatic fire begins without action and focus slows it", () => {
  let g = game();
  g.startSession();
  let a = g.getSnapshot(),
    b = ticks(g, 1, { moveX: 1, moveY: 1 });
  assert.ok(
    Math.abs(Math.hypot(b.ship.x - a.ship.x, b.ship.y - a.ship.y) - 7.6) < 0.01,
  );
  assert.equal(b.counts.shots, 1);
  let c = ticks(g, 1, { moveX: 1, actionDown: true });
  assert.ok(c.ship.x - b.ship.x < 7.6);
});
test("difficulty curve rises smoothly and remains bounded at arbitrarily late waves", () => {
  const early = difficultyForWave(1),
    mid = difficultyForWave(8),
    late = difficultyForWave(80),
    extreme = difficultyForWave(8000);
  assert.equal(early.enemySpeed, 18);
  assert.ok(
    mid.enemySpeed > early.enemySpeed && late.enemySpeed > mid.enemySpeed,
  );
  assert.ok(extreme.enemySpeed <= 70 && extreme.bulletSpeed <= 260);
  assert.ok(
    extreme.fireCooldown >= 0.5 &&
      extreme.emitBudget <= 72 &&
      extreme.activeBullets <= 112,
  );
  assert.equal(difficultyForWave(1).groupSize, 3);
  assert.equal(difficultyForWave(20).groupSize, 7);
  assert.equal(difficultyForWave(12).groupCount, 2);
  assert.equal(difficultyForWave(13).groupCount, 3);
  assert.ok(
    difficultyForWave(21).pressure > 0 &&
      difficultyForWave(40).groupSize > difficultyForWave(20).groupSize,
    "the explicit post-wave-20 pressure branch raises density",
  );
});
test("boss cadence and health helpers are pure and use the fixed encounter curve", () => {
  assert.equal(encounterTypeForWave(3), null);
  assert.equal(encounterTypeForWave(5), "miniboss");
  assert.equal(encounterTypeForWave(10), "majorboss");
  assert.equal(encounterTypeForWave(15), "miniboss");
  assert.equal(encounterTypeForWave(25), "miniboss");
  assert.equal(bossHealthForWave(3), null);
  assert.equal(bossHealthForWave(5), 190);
  assert.equal(bossHealthForWave(10), 360);
  assert.equal(bossHealthForWave(15), 250);
  assert.equal(bossHealthForWave(20), 500);
  assert.equal(bossHealthForWave(25), 335);
  assert.equal(bossHealthForWave(30), 715);
  assert.equal(encounterTypeForWave(0), null);
  assert.equal(encounterTypeForWave(-5), null);
  assert.equal(encounterTypeForWave(5.5), null);
  assert.equal(bossHealthForWave(0), null);
  assert.equal(bossHealthForWave(5.5), null);
  assert.equal(bossHealthForWave(5), 190, "helper results do not depend on prior calls");
});
test("regular enemy health follows the reviewed ordinary-wave curve", () => {
  const expected = new Map([
    [1, [1, 2, 4, 2]],
    [4, [1, 3, 5, 3]],
    [6, [2, 4, 8, 4]],
    [9, [3, 6, 11, 6]],
    [14, [4, 9, 17, 9]],
    [19, [6, 12, 23, 12]],
    [21, [6, 12, 24, 12]],
    [25, [7, 14, 28, 14]],
  ]);
  for (const [wave, hp] of expected)
    assert.deepEqual(
      ["drifter", "aimed", "tank", "diver"].map((type) =>
        regularEnemyHealthForWave(type, wave),
      ),
      hp,
      `wave ${wave}`,
    );
  assert.equal(regularEnemyHealthForWave("unknown", 4), null);
  assert.equal(regularEnemyHealthForWave("__proto__", 4), null);
  assert.equal(regularEnemyHealthForWave("drifter", NaN), 1);
  assert.equal(regularEnemyHealthForWave("tank", Infinity), 4);
  assert.ok(Number.isFinite(regularEnemyHealthForWave("tank", 1e9)));
});
test("spawned regular enemies use the curve while boss health remains fixed", () => {
  const g = game([], { devMode: true });
  g.startSession();
  g.__test.clearWave();
  g.__test.setWave(14);
  ["drifter", "aimed", "tank", "diver"].forEach((type, index) =>
    g.__test.spawn(type, 250 + index * 100, 160),
  );
  assert.deepEqual(g.getSnapshot().enemies.map((enemy) => enemy.hp), [4, 9, 17, 9]);
  assert.equal(g.applySandbox({ wave: 5 }), true);
  assert.equal(g.getSnapshot().enemies[0].hp, 190);
  assert.equal(g.applySandbox({ wave: 10 }), true);
  assert.equal(g.getSnapshot().enemies[0].hp, 360);
});
test("regular first tells speed up with wave progress and never fire before fireAt", () => {
  const firstTellAt = (wave) => {
    const g = game([], { devMode: true });
    g.startSession();
    assert.equal(g.applySandbox({ wave }), true);
    for (let frame = 0; frame < 80; frame++) {
      const before = g.getSnapshot();
      const after = g.step(0.02);
      if (!after.warnings.length) continue;
      const warning = after.warnings[0];
      assert.equal(before.counts.hostileBullets, 0);
      return warning.fireAt - (warning.kind === "tank" ? 0.8 : 0.6);
    }
    assert.fail(`wave ${wave} did not schedule a first tell`);
  };
  const expected = new Map([
    [1, 0.75], [4, 0.71], [6, 0.68], [9, 0.64],
    [14, 0.58], [19, 0.51], [21, 0.5],
  ]);
  for (const [wave, readiness] of expected) {
    const actual = firstTellAt(wave);
    assert.ok(
      actual >= readiness - 0.001 && actual <= readiness + 0.021,
      `wave ${wave} first tell ${actual} is within one fixed step of ${readiness}`,
    );
  }
});
test("actual encounter groups follow the linear opening curve", () => {
  const g = game();
  g.startSession();
  let s = g.getSnapshot();
  assert.equal(s.counts.enemies, 6);
  assert.equal(s.enemies.filter((e) => e.active).length, 3);
  advanceToWave(g, 13);
  s = g.getSnapshot();
  assert.equal(s.counts.enemies, 18);
  assert.equal(s.enemies.filter((e) => e.active).length, 6);
});
test("aimed telegraph locks player and hostile pool is capped", () => {
  let g = game();
  g.startSession();
  g.__test.clearWave();
  g.__test.spawn("aimed", 500, 250);
  g.__test.setShip(800, 600);
  ticks(g, 31);
  let q = g.getSnapshot().hostilebullets[0];
  assert.ok(q.vx > 0 && q.vy > 0);
  g.__test.clearWave();
  for (let i = 0; i < 30; i++) g.__test.spawn("tank", 200 + i * 20, 100);
  ticks(g, 2);
  assert.ok(g.getSnapshot().counts.hostileBullets <= 70);
});
test("damage gives three lives and prevents multiple losses in one frame", () => {
  let ev = [],
    g = game(ev);
  g.startSession();
  g.__test.setShip(600, 600);
  g.__test.setHostile([
    { x: 600, y: 600, vx: 0, vy: 0 },
    { x: 601, y: 600, vx: 0, vy: 0 },
  ]);
  g.step(0.02);
  assert.equal(g.getSnapshot().lives, 2);
  g.__test.setHostile([{ x: 600, y: 600, vx: 0, vy: 0 }]);
  g.step(0.02);
  assert.equal(g.getSnapshot().lives, 2);
  ticks(g, 76);
  g.__test.setHostile([{ x: 600, y: 600, vx: 0, vy: 0 }]);
  g.step(0.02);
  ticks(g, 76);
  g.__test.setHostile([{ x: 600, y: 600, vx: 0, vy: 0 }]);
  g.step(0.02);
  assert.equal(g.getSnapshot().phase, "ended");
  assert.equal(ev.length, 1);
});
test("shield consumes one hit before the three-life damage sequence", () => {
  let g = game();
  g.startSession();
  g.__test.setShip(600, 600);
  g.__test.setShield();
  g.__test.setHostile([{ x: 600, y: 600, vx: 0, vy: 0 }]);
  g.step(0.02);
  assert.equal(g.getSnapshot().lives, 3);
  assert.equal(g.getSnapshot().shield, false);
});
test("special clears bullets and held X does not recharge or repeat", () => {
  let g = game();
  g.startSession();
  g.__test.setCharge(1);
  g.__test.setHostile([{ x: 200, y: 200, vx: 0, vy: 0 }]);
  g.step(0.02, { specialPressed: true });
  assert.equal(g.getSnapshot().chargeMeter, 0);
  assert.equal(g.getSnapshot().counts.hostileBullets, 0);
  g.step(0.02, { specialPressed: true });
  assert.equal(g.getSnapshot().chargeMeter, 0);
});
test("fifth kill guarantees a useful pickup and never drops old weapon levels", () => {
  let g = game();
  g.startSession();
  g.__test.kill(5);
  assert.equal(g.getSnapshot().powerups[0].kind, "shield");
  for (let i = 0; i < 8; i++) g.__test.spawn("drifter", 200 + i * 30, 150);
  g.__test.kill(8);
  assert.ok(g.getSnapshot().powerups.every((drop) => drop.kind !== "weapon"));
});
test("drops survive the wave breather and remain collectable", () => {
  let g = game();
  g.startSession();
  for (let i = 0; i < 2; i++) g.__test.spawn("drifter", 200 + i * 30, 150);
  g.__test.spawnDrop("rapid", 600, 600);
  let rapid = g.getSnapshot().powerups.find((drop) => drop.kind === "rapid");
  assert.ok(rapid);
  g.__test.clearWave();
  g.step(0.02);
  assert.equal(g.getSnapshot().substate, "breather");
  const beforeMove = g.getSnapshot().ship.x;
  g.step(0.02, { moveX: 1 });
  assert.ok(
    g.getSnapshot().ship.x > beforeMove,
    "movement remains available during the breather",
  );
  assert.ok(g.getSnapshot().powerups.some((drop) => drop.kind === "rapid"));
  g.__test.setShip(rapid.x, rapid.y + 2);
  g.step(0.02);
  assert.equal(g.getSnapshot().rapidFire, true);
});
test("redundant shield grants score, while rapid refresh cannot exceed eight seconds", () => {
  let g = game();
  g.startSession();
  g.__test.setShip(600, 600);
  g.__test.setShield(true);
  g.__test.setScore(0);
  g.__test.spawnDrop("shield", 600, 600);
  g.step(0.02);
  assert.equal(g.getSnapshot().score, 5);
  g.__test.spawnDrop("rapid", 600, 600);
  g.step(0.02);
  ticks(g, 100);
  g.__test.spawnDrop("rapid", 600, 600);
  g.step(0.02);
  assert.ok(
    g.getSnapshot().rapidSeconds <= 8 && g.getSnapshot().rapidSeconds > 7.9,
  );
});
test("render records telegraph geometry and a special pulse", () => {
  let lines = 0,
    arcs = 0;
  const record = {
    clearRect() {},
    fillRect() {},
    fillText() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {
      lines++;
    },
    bezierCurveTo() {},
    arc() {
      arcs++;
    },
    stroke() {},
    fill() {},
    save() {},
    restore() {},
    scale() {},
    createLinearGradient() {
      return { addColorStop() {} };
    },
  };
  let g = createGame({
    canvas: { width: 1280, height: 720, getContext: () => record },
    random: () => 0.5,
  });
  g.startSession();
  g.__test.clearWave();
  g.__test.spawn("aimed", 500, 250);
  g.step(0.02);
  g.render();
  assert.ok(lines > 0, "aimed warning draws warning geometry");
  const arcsBeforePulse = arcs;
  g.__test.setCharge(1);
  g.step(0.02, { specialPressed: true });
  g.render();
  assert.ok(
    arcs > arcsBeforePulse,
    "special pulse is rendered after activation",
  );
});
test("wave three freezes for a core choice before the next breather", () => {
  let g = game();
  g.startSession();
  advanceToWave(g, 3);
  g.__test.clearWave();
  g.step(0.02);
  const pending = g.getSnapshot().pendingReward;
  assert.equal(g.getSnapshot().wave, 3);
  assert.deepEqual(pending.offers.map((offer) => offer.preview), ["spread", "lance", "seeker"]);
  const frozenShip = g.getSnapshot().ship;
  ticks(g, 100, { moveX: 1 });
  assert.deepEqual(g.getSnapshot().ship, frozenShip);
  settleReward(g, 1);
  assert.equal(g.getSnapshot().wave, 4);
  assert.equal(g.getSnapshot().substate, "breather");
  assert.equal(g.getSnapshot().build.weaponId, "lance");
});
test("pause and dispose are safe", () => {
  let g = game();
  g.startSession();
  let a = g.getSnapshot();
  g.pause();
  g.step(0.02, { moveX: 1 });
  assert.equal(g.getSnapshot().ship.x, a.ship.x);
  g.dispose();
  assert.equal(g.getSnapshot().counts.enemies, 0);
});
function continueTutorial(g) {
  g.step(0.02, {});
  g.step(0.02, { actionPressed: true });
}
function waitForTutorialSuccess(g, input = {}, limit = 300) {
  while (limit-- && g.getSnapshot().tutorial.status !== "success")
    g.step(0.02, input);
  assert.equal(g.getSnapshot().tutorial.status, "success");
}
function lineUpTutorialFire(g) {
  ticks(g, 33, { moveX: 1 });
}
test("tutorial does not idle-advance, gives contextual help, and needs a fresh A", () => {
  const g = game([], { sessionKind: "tutorial" });
  g.startSession();
  ticks(g, 401);
  let tutorial = g.getSnapshot().tutorial;
  assert.deepEqual(
    [tutorial.step, tutorial.lessonId, tutorial.status],
    [0, "move-fire", "active"],
  );
  assert.match(tutorial.hint, /Move right/);
  assert.deepEqual(tutorial.progress, { current: 0, total: 5 });
  lineUpTutorialFire(g);
  waitForTutorialSuccess(g);
  g.step(0.02, { actionDown: true, actionPressed: true });
  g.step(0.02, { actionDown: true });
  assert.equal(g.getSnapshot().tutorial.step, 0, "held A cannot continue");
  continueTutorial(g);
  assert.equal(g.getSnapshot().tutorial.lessonId, "dodge");
});
test("tutorial exercises use real success and retry paths without scoring", () => {
  const g = game([], { sessionKind: "tutorial" });
  g.startSession();
  lineUpTutorialFire(g);
  waitForTutorialSuccess(g);
  continueTutorial(g);

  ticks(g, 145);
  assert.equal(g.getSnapshot().tutorial.status, "active", "a warning bullet resets dodge");
  assert.equal(g.getSnapshot().counts.hostileBullets, 0);
  assert.equal(g.getSnapshot().warnings.length, 0, "retry breather delays the new warning");
  assert.match(g.getSnapshot().tutorial.hint, /amber lane/);
  ticks(g, 30);
  ticks(g, 20, { moveX: 1 });
  waitForTutorialSuccess(g);
  continueTutorial(g);

  const choice = g.getSnapshot().pendingReward;
  assert.equal(choice.context, "tutorial");
  assert.equal(choice.kind, "core");
  assert.equal(g.chooseUpgrade(choice.offers[0].id), true);
  assert.equal(g.getSnapshot().tutorial.status, "success");
  continueTutorial(g);

  ticks(g, 21, { moveX: 1 });
  waitForTutorialSuccess(g);
  assert.equal(g.getSnapshot().rapidFire, true, "the pickup has a visible model effect");
  continueTutorial(g);

  assert.equal(g.getSnapshot().tutorial.lessonId, "pulse");
  ticks(g, 120);
  assert.equal(g.getSnapshot().counts.hostileBullets, 3, "an expired pulse volley reseeds");
  assert.match(g.getSnapshot().tutorial.hint, /Try X/);
  ticks(g, 30);
  const before = g.getSnapshot().counts.hostileBullets;
  g.step(0.02, { specialPressed: true });
  assert.equal(g.getSnapshot().counts.hostileBullets, 0);
  assert.equal(g.getSnapshot().tutorial.status, "success");
  g.step(0.02, { specialPressed: true });
  assert.equal(g.getSnapshot().chargeMeter, 0, "held X cannot pulse twice");
  assert.equal(before, 3);
  assert.equal(g.getSnapshot().score, 0);
  assert.equal(g.getSnapshot().lives, 3);
});
test("tutorial completion emits once only after a final fresh A", () => {
  const events = [];
  const g = game(events, { sessionKind: "tutorial" });
  g.startSession();
  for (let step = 0; step < 4; step++) {
    if (step === 0) {
      lineUpTutorialFire(g);
      waitForTutorialSuccess(g);
    }
    else if (step === 1) {
      ticks(g, 20, { moveX: 1 });
      waitForTutorialSuccess(g);
    } else if (step === 2) {
      const pending = g.getSnapshot().pendingReward;
      assert.ok(pending);
      g.chooseUpgrade(pending.offers[0].id);
    } else {
      ticks(g, 21, { moveX: 1 });
      waitForTutorialSuccess(g);
    }
    continueTutorial(g);
  }
  g.step(0.02, { specialPressed: true });
  assert.equal(g.getSnapshot().tutorial.status, "success");
  g.step(0.02, { actionDown: true, actionPressed: true });
  assert.equal(g.getSnapshot().phase, "playing");
  continueTutorial(g);
  assert.equal(g.getSnapshot().phase, "ended");
  assert.equal(events.filter((event) => event.type === "sessionEnd").length, 0);
  assert.equal(events.filter((event) => event.type === "tutorialComplete").length, 1);
});
test("reduced motion keeps the same simulation and can change during a session", () => {
  let reduce = false;
  const standard = game();
  const reduced = game([], { reducedMotion: () => reduce });
  standard.startSession();
  reduced.startSession();
  for (let frame = 0; frame < 90; frame++) {
    const input = { moveX: frame < 40 ? 1 : -0.5, moveY: frame % 3 ? 0 : 1 };
    standard.step(0.02, input);
    reduced.step(0.02, input);
  }
  reduce = true;
  standard.step(0.02, { moveX: 1 });
  reduced.step(0.02, { moveX: 1 });
  reduced.render();
  const a = standard.getSnapshot(),
    b = reduced.getSnapshot();
  assert.deepEqual(
    [
      b.phase,
      b.score,
      b.lives,
      b.wave,
      b.ship,
      b.counts,
      b.powerups,
      b.chargeMeter,
    ],
    [
      a.phase,
      a.score,
      a.lives,
      a.wave,
      a.ship,
      a.counts,
      a.powerups,
      a.chargeMeter,
    ],
  );
});
test("reduced-motion damage alpha is fixed and shield draws a persistent ring", () => {
  let shipAlpha,
    shieldStrokes = 0;
  const context = {
    clearRect() {},
    fillRect() {},
    fillText() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    bezierCurveTo() {},
    arc() {},
    stroke() {
      if (this.strokeStyle === "#8fa8ff") shieldStrokes++;
    },
    fill() {
      if (this.fillStyle === "#76f3df") shipAlpha = this.globalAlpha;
    },
    save() {},
    restore() {},
    scale() {},
    createLinearGradient() {
      return { addColorStop() {} };
    },
    globalAlpha: 1,
  };
  const g = createGame({
    canvas: { width: 1280, height: 720, getContext: () => context },
    random: () => 0.5,
    reducedMotion: true,
  });
  g.startSession();
  g.__test.setShip(600, 600);
  g.__test.setShield(true);
  g.render();
  assert.ok(shieldStrokes > 0);
  g.__test.setShield(false);
  g.__test.setHostile([{ x: 600, y: 600, vx: 0, vy: 0 }]);
  g.step(0.02);
  g.render();
  assert.ok(shipAlpha === undefined || shipAlpha === 0.65);
});
test("effects are capped, pause and dispose clear them, and enemy opacity remains solid", () => {
  const enemyAlphas = [];
  const alphaStack = [];
  const context = {
    clearRect() {},
    fillRect() {},
    fillText() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    bezierCurveTo() {},
    arc() {},
    stroke() {},
    save() {
      alphaStack.push(this.globalAlpha);
    },
    restore() {
      this.globalAlpha = alphaStack.pop();
    },
    scale() {},
    fill() {
      if (this.fillStyle === "#ff9d55") enemyAlphas.push(this.globalAlpha);
    },
    createLinearGradient() {
      return { addColorStop() {} };
    },
    globalAlpha: 1,
  };
  const g = createGame({
    canvas: { width: 1280, height: 720, getContext: () => context },
    random: () => 0.5,
  });
  g.startSession();
  g.__test.clearWave();
  g.__test.setShip(500, 600);
  g.__test.spawn("tank", 500, 560);
  g.step(0.02);
  for (let i = 0; i < 20; i++) g.__test.addHitFx(500, 560);
  assert.equal(g.getSnapshot().effects.hitParticles, 48);
  g.render();
  assert.ok(enemyAlphas.every((alpha) => alpha === 1));
  g.pause();
  const frozen = g.getSnapshot().effects;
  g.step(0.02);
  assert.deepEqual(g.getSnapshot().effects, frozen);
  g.dispose();
  assert.deepEqual(g.getSnapshot().effects, {
    hitParticles: 0,
    pickups: 0,
    shields: 0,
    guards: 0,
    chains: 0,
    trails: 0,
    blasts: [],
  });
});
test("accelerated 100-wave stress keeps simulation state finite and capped", () => {
  // This is scripted stress, not a human-balance claim: __test.clearWave
  // accelerates transitions while ordinary 50 Hz ticks still exercise firing.
  const g = game();
  g.startSession();
  for (let completed = 0; completed < 100; completed++) {
    g.__test.setShield(true);
    ticks(g, 35, {
      moveX: completed % 2 ? 0.8 : -0.8,
      moveY: completed % 3 ? 0 : -0.3,
    });
    let active = g.getSnapshot();
    if (active.phase !== "playing") break; // late escalation can defeat this non-dodging stress bot.
    assert.ok(
      active.counts.hostileBullets <= 70 &&
        active.counts.shots <= 100 &&
        active.counts.powerups <= 12,
    );
    for (const entity of [
      ...active.enemies,
      ...active.hostilebullets,
      ...active.powerups,
      active.ship,
    ]) {
      assert.ok(Number.isFinite(entity.x) && Number.isFinite(entity.y));
    }
    g.__test.clearWave();
    g.step(0.02);
    settleReward(g);
    ticks(g, 100, { moveX: completed % 2 ? -1 : 1 });
  }
  const late = difficultyForWave(101),
    farLate = difficultyForWave(10001);
  assert.ok(late.enemySpeed <= farLate.enemySpeed && farLate.enemySpeed <= 70);
  assert.ok(["playing", "ended"].includes(g.getSnapshot().phase));
});
test("normal-frame scheduler emits only after a warning and stays inside its rolling budget", () => {
  const g = game();
  g.startSession();
  let sawWarning = false,
    prior = [];
  for (let frame = 0; frame < 300; frame++) {
    const before = g.getSnapshot();
    prior = before.warnings;
    if (prior.length) sawWarning = true;
    const after = g.step(0.02, { moveX: frame % 80 < 40 ? 0.5 : -0.5 });
    if (after.counts.hostileBullets > before.counts.hostileBullets) {
      assert.ok(
        prior.length,
        "a projectile was preceded by a scheduled warning",
      );
      const warning = prior[0];
      assert.ok(warning.fireAt > 0 && warning.bullets.length > 0);
    }
    assert.ok(after.scheduler.emittedLast3Seconds <= after.scheduler.budget);
    assert.ok(after.counts.hostileBullets <= after.scheduler.activeBulletLimit);
  }
  assert.ok(sawWarning);
});
test("boss phases, pulse damage, explicit shot damage, and useful reward run through gameplay paths", () => {
  const g = game();
  g.startSession();
  // Test-only clears accelerate the normal wave breaks to the real wave-5 boss.
  advanceToWave(g, 5);
  let boss = g.getSnapshot().enemies.find((e) => e.type === "miniboss");
  assert.equal(boss.phases, 2);
  const original = boss.hp;
  g.__test.setCharge(2);
  for (let n = 0; n < 18; n++) {
    g.step(0.02, { specialPressed: true });
    ticks(g, 26);
    g.__test.setCharge(2);
  }
  boss = g.getSnapshot().enemies.find((e) => e.type === "miniboss");
  assert.ok(
    boss.phase >= 2 && boss.hp < original,
    "pulse crosses a real boss phase threshold",
  );
  g.__test.setWeapon(3);
  g.__test.setShip(boss.x, 600);
  const before = boss.hp;
  ticks(g, 55, { moveX: 0 });
  const after = g.getSnapshot().enemies.find((e) => e.type === "miniboss");
  assert.ok(after.hp < before, "boss damage comes from each projectile's explicit damage");
  for (let n = 0; n < 40 && g.getSnapshot().counts.enemies; n++) {
    g.__test.setCharge(2);
    g.step(0.02, { specialPressed: true });
    ticks(g, 26);
  }
  assert.equal(g.getSnapshot().shield, true, "the milestone collects the useful boss shield before presenting its reward");
});
test("major boss arrives on wave ten and divers advertise their exit path", () => {
  const g = game();
  g.startSession();
  for (let n = 0; n < 12 && g.getSnapshot().wave < 10; n++) {
    g.__test.clearWave();
    g.step(0.02);
    settleReward(g);
    ticks(g, 102);
  }
  assert.equal(g.getSnapshot().wave, 10);
  assert.ok(g.getSnapshot().enemytypes.majorboss);
  g.__test.clearWave();
  g.__test.spawn("diver", 500, 180);
  let warned = false;
  for (let n = 0; n < 220; n++) {
    const s = g.step(0.02);
    warned ||= s.warnings.some((w) => w.kind === "dive" && w.target.y > 700);
  }
  assert.ok(warned, "diver reserves an on-screen exit path before diving");
});
test("warning freezes its source geometry and locked target before firing", () => {
  const g = game();
  g.startSession();
  g.__test.clearWave();
  g.__test.spawn("aimed", 420, 180);
  g.__test.setShip(800, 600);
  let warning;
  for (let n = 0; n < 8 && !warning; n++) warning = g.step(0.02).warnings[0];
  assert.ok(warning && warning.kind === "aimed");
  g.__test.setShip(200, 500);
  const later = g.step(0.02).warnings.find((w) => w.id === warning.id);
  assert.deepEqual(later.origin, warning.origin);
  assert.deepEqual(later.target, warning.target);
  ticks(g, 30);
  const shot = g.getSnapshot().hostilebullets[0];
  assert.ok(
    shot.vx > 0 && shot.vy > 0,
    "fired path still follows the original lock",
  );
});
test("a committed regular warning fires once after its source dies", () => {
  const g = game();
  g.startSession();
  g.__test.clearWave();
  g.__test.setWave(4);
  const drifter = g.__test.spawn("drifter", 500, 200);
  g.__test.spawn("tank", 850, 170);
  let warning;
  for (let n = 0; n < 8 && !warning; n++) warning = g.step(0.02).warnings[0];
  assert.ok(warning && warning.kind === "drifter");
  assert.equal(warning.enemyId, drifter.id);
  g.__test.kill(1);
  assert.equal(g.getSnapshot().enemies.length, 1);
  assert.equal(g.getSnapshot().warnings.length, 1, "the frozen warning remains visible");
  assert.doesNotThrow(() => g.render(), "the warning remains renderable without its source");
  for (let n = 0; n < 29; n++) {
    const s = g.step(0.02);
    assert.equal(s.counts.hostileBullets, 0, "no projectile precedes fireAt");
  }
  const fired = g.step(0.02);
  assert.equal(fired.counts.hostileBullets, 1);
  assert.equal(fired.warnings.length, 0);
  ticks(g, 5);
  assert.equal(g.getSnapshot().counts.hostileBullets, 1, "the promise fires only once");
});
test("clearing an active group cancels even a committed warning", () => {
  const g = game();
  g.startSession();
  g.__test.clearWave();
  g.__test.setWave(4);
  g.__test.spawn("drifter", 500, 200);
  g.__test.spawn("tank", 850, 170);
  let warning;
  for (let n = 0; n < 8 && !warning; n++) warning = g.step(0.02).warnings[0];
  assert.ok(warning && warning.kind === "drifter");
  g.__test.kill(2);
  const cleared = g.step(0.02);
  assert.equal(cleared.counts.hostileBullets, 0);
  assert.equal(cleared.warnings.length, 0);
});
test("diver death still cancels its empty dive tell", () => {
  const g = game();
  g.startSession();
  g.__test.clearWave();
  g.__test.setWave(4);
  g.__test.spawn("diver", 500, 180);
  let warning;
  for (let n = 0; n < 240 && !warning; n++) {
    const s = g.step(0.02);
    warning = s.warnings.find((entry) => entry.kind === "dive");
  }
  assert.ok(warning, "the diver exposes its exit tell");
  g.__test.kill(1);
  const afterKill = g.getSnapshot();
  assert.equal(afterKill.warnings.some((entry) => entry.kind === "dive"), false);
  ticks(g, 50);
  assert.equal(g.getSnapshot().warnings.some((entry) => entry.kind === "dive"), false);
});
test("simultaneous sources never reserve or emit beyond scheduler budget", () => {
  const g = game();
  g.startSession();
  g.__test.clearWave();
  for (let n = 0; n < 18; n++)
    g.__test.spawn(n % 3 === 0 ? "tank" : "drifter", 200 + n * 35, 130);
  let maxWarnings = 0;
  for (let frame = 0; frame < 360; frame++) {
    const s = g.step(0.02, { moveX: frame % 100 < 50 ? 0.7 : -0.7 });
    maxWarnings = Math.max(maxWarnings, s.warnings.length);
    assert.ok(s.scheduler.emittedLast3Seconds <= s.scheduler.budget);
    assert.ok(s.counts.hostileBullets <= s.scheduler.activeBulletLimit);
  }
  assert.ok(
    maxWarnings >= 1 && maxWarnings <= 1,
    "early wave permits one readable warning at a time",
  );
});
test("presentation interpolation uses scalar previous positions without changing snapshots", () => {
  let state;
  const g = createGame({
    canvas: { width: 1280, height: 720, getContext: ctx },
    random: () => 0.5,
    presentation: (s) => {
      state = s;
    },
  });
  g.startSession();
  const before = g.getSnapshot();
  g.step(0.02, { moveX: 1 });
  const current = g.getSnapshot();
  g.render(0.5);
  assert.equal(state.ship.x, (before.ship.x + current.ship.x) / 2);
  assert.deepEqual(
    g.getSnapshot(),
    current,
    "render interpolation never mutates the model snapshot",
  );
});

test("boss combos expose declarative families, beats, emitters, and hazards", () => {
  const expectedBeats = { assault: 2, mutation: 3, rage: 4 };
  for (const mode of Object.keys(expectedBeats)) for (const family of COMBO_IDS) {
    const g = game([], { devMode: true });
    g.startSession();
    assert.equal(g.applySandbox({ wave: 10, bossPhase: mode, bossPattern: family, invincible: true }), true);
    let maxBeat = 0, emitters = 0, hazards = 0, activeHazards = 0, seen = new Set();
    for (let frame = 0; frame < 360; frame++) {
      const state = g.step(.02, { moveX: frame % 90 < 45 ? .4 : -.4 });
      const boss = state.enemies[0];
      maxBeat = Math.max(maxBeat, boss.beat || 0);
      emitters = Math.max(emitters, state.emitters.length);
      hazards = Math.max(hazards, state.hazards.length);
      activeHazards = Math.max(activeHazards, state.hazards.filter((area) => area.state === "active").length);
      state.warnings.forEach((warning) => seen.add(warning.kind));
      assert.ok(state.counts.hostileBullets <= state.scheduler.activeBulletLimit);
    }
    assert.equal(maxBeat, expectedBeats[mode], `${mode}/${family} emits its complete combo`);
    assert.ok(seen.has(`boss-${family}`), `${family} warning is observable`);
    assert.ok(emitters > 0, `${family} publishes emitter geometry`);
    if (family === "delayedBlooms") assert.ok(hazards > 0 && activeHazards > 0, "bloom publishes an active hazard");
  }
});
test("miniboss preserves its two-stage recovery gate and declarative combo bag", () => {
  const g = game([], { devMode: true });
  g.startSession();
  assert.equal(g.applySandbox({ wave: 5, bossPhase: "recon", bossPattern: "crossingStreams", invincible: true }), true);
  let maxBeat = 0, previousCombo = null, seenCombos = [];
  for (let frame = 0; frame < 180; frame++) {
    const state = g.step(.02);
    const boss = state.enemies[0]; maxBeat = Math.max(maxBeat, boss.beat || 0);
    if (boss.comboId && boss.beat === 1 && boss.comboId !== previousCombo) { seenCombos.push(boss.comboId); previousCombo = boss.comboId; }
  }
  assert.equal(maxBeat, 2); assert.ok(seenCombos.includes("crossingStreams"));
  const boss = g.getSnapshot().enemies[0]; g.__test.damageEnemy(boss.id, 1e6);
  let state = g.getSnapshot(); assert.deepEqual([state.enemies[0].mode, state.enemies[0].phase, state.enemies[0].vulnerable], ["frenzy", 2, false]);
  ticks(g, 40); state = g.getSnapshot(); assert.equal(state.enemies[0].vulnerable, true);
});
test("major boss gates 65, 35, and 10 percent before a locked ten-second survival kill", () => {
  const g = game([], { devMode: true });
  g.startSession();
  assert.equal(g.applySandbox({ wave: 10, invincible: true, weaponId: "barrage", abilityId: "barrier" }), true);
  ticks(g, 46);
  let boss = g.getSnapshot().enemies[0];
  g.__test.damageEnemy(boss.id, 99999);
  boss = g.getSnapshot().enemies[0];
  assert.deepEqual([boss.hp, boss.mode, boss.phase], [234, "mutation", 2]);
  ticks(g, 38); g.__test.damageEnemy(boss.id, 99999);
  boss = g.getSnapshot().enemies[0];
  assert.ok(Math.abs(boss.hp - 126) < 1e-6); assert.deepEqual([boss.mode, boss.phase], ["rage", 3]);
  ticks(g, 38);
  g.__test.setCharge(1); g.step(.02, { specialPressed: true });
  assert.ok(g.getSnapshot().barrierSeconds > 0);
  g.__test.damageEnemy(g.getSnapshot().enemies[0].id, 99999);
  let state = g.getSnapshot(), patience = state.enemies[0];
  assert.deepEqual([patience.hp, patience.mode, patience.phase, patience.modeDuration, patience.patienceStyle], [36, "patience", 4, 10, "weave"]);
  assert.equal(patience.vulnerable, false);
  assert.equal(state.barrierSeconds, 0, "patience ends an already-active ability");
  assert.equal(state.counts.shots, 0, "patience clears fired and deferred auto-fire");
  const charge = state.chargeMeter, beforeX = state.ship.x;
  state = g.step(.02, { moveX: 1, actionDown: true, specialPressed: true });
  assert.equal(state.chargeMeter, charge, "patience rejects X without spending a charge");
  assert.equal(state.counts.shots, 0, "patience rejects auto-fire while retaining focus movement");
  assert.ok(state.ship.x > beforeX && state.ship.x - beforeX < 5, "focus movement remains available during patience");
  for (let frame = 0; frame < 530 && state.enemies.length; frame++) {
    g.__test.setHostile([]);
    state = g.step(.02, { moveX: frame % 80 < 40 ? .5 : -.5 });
  }
  assert.equal(state.enemies.length, 0, "surviving patience resolves the final kill");
  assert.equal(state.substate, "breather");
});
test("a real multi-shot volley cannot continue colliding after it triggers the patience gate", () => {
  const g = game([], { devMode: true });
  g.startSession();
  assert.equal(g.applySandbox({ wave: 10, bossPhase: "rage", invincible: true }), true);
  // Tempest supplies a real seven-shot volley. Power reaches the final gate
  // from rage without calling the direct damage test hook.
  g.__test.setBuild({ weaponId: "tempest", perks: { power: 100 } });
  let state;
  assert.doesNotThrow(() => {
    for (let frame = 0; frame < 180; frame++) {
      state = g.step(.02);
      if (state.enemies[0]?.mode === "patience") return;
    }
  });
  assert.equal(state.enemies[0].mode, "patience");
  assert.equal(state.counts.shots, 0, "the gate clears the whole volley atomically");
});
test("patience schedules weave, rotation, and a declared safe reposition segment", () => {
  for (const [wave, seconds, styles] of [[10, 10, new Set(["weave"])], [20, 12, new Set(["rotation"])], [30, 16, new Set(["weave", "reposition", "rotation"])]]) {
    const g = game([], { devMode: true });
    g.startSession();
    assert.equal(g.applySandbox({ wave, bossPhase: "patience", invincible: true }), true);
    const observed = new Set(); let state = g.getSnapshot();
    for (let frame = 0; frame < seconds * 50 + 12 && state.enemies.length; frame++) {
      const boss = state.enemies[0]; observed.add(boss.patienceStyle);
      if (boss.patienceStyle === "reposition") {
        assert.equal(state.warnings.length, 0); assert.equal(state.counts.hostileBullets, 0); assert.equal(state.hazards.length, 0);
      }
      state = g.step(.02, { moveX: frame % 70 < 35 ? .5 : -.5 });
    }
    assert.deepEqual(observed, styles, `wave ${wave} patience plan`);
    assert.equal(state.enemies.length, 0, `wave ${wave} completes after ${seconds} seconds`);
  }
});
test("wave-twenty rotation reaches a stationary center position", () => {
  const g = game([], { devMode: true });
  g.startSession();
  assert.equal(g.applySandbox({ wave: 20, bossPhase: "patience" }), true);
  g.__test.setShip(640, 620);
  let state = g.getSnapshot();
  for (let frame = 0; frame < 600 && state.phase === "playing"; frame++) state = g.step(.02);
  assert.ok(state.lives < 3, "the warned rotation pursuit bolt prevents an all-safe stationary center");
});
test("patience rotation moves on a bounded ellipse without moving reserved warning geometry", () => {
  const g = game([], { devMode: true });
  g.startSession();
  assert.equal(g.applySandbox({ wave: 20, bossPhase: "patience", invincible: true }), true);
  let prior, lockedWarning, movedWhileLocked = false, rotationFrames = 0;
  for (let frame = 0; frame < 620; frame++) {
    const state = g.step(.02, { moveX: frame % 90 < 45 ? .3 : -.3 });
    const boss = state.enemies[0]; if (!boss) break;
    const warning = state.warnings.find((entry) => entry.kind === "boss-orbitGaps");
    if (boss.patienceStyle === "rotation") {
      rotationFrames++;
      if (prior) assert.ok(Math.hypot(boss.x - prior.x, boss.y - prior.y) <= 3.161, "rotation uses the 158px/s movement cap");
      assert.ok(boss.x >= 340 && boss.x <= 940 && boss.y >= 115 && boss.y <= 275, "rotation remains in its upper-arena ellipse bounds");
      if (warning && !lockedWarning) lockedWarning = { id: warning.id, origin: warning.origin, boss: { x: boss.x, y: boss.y } };
      if (lockedWarning && warning?.id === lockedWarning.id) {
        assert.deepEqual(warning.origin, lockedWarning.origin, "warning origin remains immutable while the boss moves");
        movedWhileLocked ||= Math.hypot(boss.x - lockedWarning.boss.x, boss.y - lockedWarning.boss.y) > .1;
      }
      prior = boss;
    }
  }
  assert.ok(rotationFrames > 0 && movedWhileLocked, "rotation visibly moves under a locked telegraph");
});
test("wave variants create bounded staggered bursts and warned floor hazards", () => {
  for (const [wave, type, needHazard] of [[8, "burstSower", false], [16, "bloomSentinel", true]]) {
    const g = game([], { devMode: true }); g.startSession(); assert.equal(g.applySandbox({ wave, invincible: true }), true);
    g.__test.clearWave(); g.__test.spawn(type, 640, 160);
    let saw = false, hazard = false, maxActive = 0;
    for (let frame = 0; frame < 280; frame++) {
      const state = g.step(.02); saw ||= state.warnings.some((warning) => warning.kind === type);
      hazard ||= state.hazards.some((area) => area.kind === "sentinelBloom"); maxActive = Math.max(maxActive, state.counts.hostileBullets);
    }
    assert.ok(saw, `${type} schedules its telegraph`); assert.equal(hazard, needHazard, `${type} hazard contract`);
    assert.ok(maxActive <= g.getSnapshot().scheduler.activeBulletLimit);
  }
});

test("new enemy variants enter on schedule without increasing group counts", () => {
  for (const [wave, introduced] of [[6, "skirmisher"], [12, "bulwark"], [18, "orbiter"]]) {
    const g = game([], { devMode: true });
    g.startSession();
    assert.equal(g.applySandbox({ wave, invincible: true }), true);
    const state = g.getSnapshot();
    const difficulty = difficultyForWave(wave);
    assert.equal(state.enemies.length, difficulty.groupSize * difficulty.groupCount);
    assert.ok(state.enemies.some((enemy) => enemy.type === introduced), `${introduced} appears at wave ${wave}`);
    const variants = state.enemies.filter((enemy) => ["skirmisher", "bulwark", "orbiter", "burstSower", "bloomSentinel"].includes(enemy.type));
    assert.equal(variants.length, difficulty.groupCount, "pre-20 waves replace one slot in each group");
  }
  const late = game([], { devMode: true });
  late.startSession();
  assert.equal(late.applySandbox({ wave: 21, invincible: true }), true);
  const state = late.getSnapshot(), difficulty = difficultyForWave(21);
  assert.equal(state.enemies.length, difficulty.groupSize * difficulty.groupCount);
  assert.equal(state.enemies.filter((enemy) => ["skirmisher", "bulwark", "orbiter", "burstSower", "bloomSentinel"].includes(enemy.type)).length, difficulty.groupCount * 2);
});

test("new enemies publish honest radii, freeze during tells, and fire distinct attacks", () => {
  const cases = [
    [6, "skirmisher", 16, 2, .85],
    [12, "bulwark", 28, 3, 1.1],
    [18, "orbiter", 20, 6, .9],
  ];
  for (const [wave, type, radius, shotCount, tell] of cases) {
    const g = game([], { devMode: true });
    g.startSession();
    assert.equal(g.applySandbox({ wave, invincible: true }), true);
    g.__test.clearWave();
    g.__test.setShip(120, 650);
    g.__test.spawn(type, 640, 160);
    let state = g.step(.02);
    const warning = state.warnings.find((entry) => entry.kind === type);
    assert.ok(warning, `${type} reserves its attack`);
    assert.equal(warning.warning, tell);
    assert.equal(state.enemies[0].r, radius);
    const locked = { x: state.enemies[0].x, y: state.enemies[0].y, origin: warning.origin };
    const tellFrames = Math.floor((tell - .08) / .02);
    state = ticks(g, tellFrames);
    assert.deepEqual({ x: state.enemies[0].x, y: state.enemies[0].y }, { x: locked.x, y: locked.y });
    assert.deepEqual(state.warnings[0].origin, locked.origin);
    let maxBullets = state.counts.hostileBullets;
    for (let frame = 0; frame < 20; frame++) {
      state = g.step(.02);
      maxBullets = Math.max(maxBullets, state.counts.hostileBullets);
    }
    assert.equal(maxBullets, shotCount, `${type} emits its full pattern`);
    assert.ok(Math.hypot(state.enemies[0].x - locked.x, state.enemies[0].y - locked.y) < 30, `${type} resumes without teleporting`);
    assert.ok(state.counts.hostileBullets <= state.scheduler.activeBulletLimit);
  }
});
