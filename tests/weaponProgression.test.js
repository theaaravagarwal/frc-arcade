"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createGame, enemyHealthMultiplier } = require("../renderer/games/cellDefender");
const { WEAPONS, projectileSpecs } = require("../renderer/games/cellDefender/weapons");
const { draftCards, rewardForWave } = require("../renderer/games/cellDefender/builds");

function context() {
  return {
    clearRect() {}, fillRect() {}, strokeRect() {}, fillText() {}, beginPath() {}, closePath() {},
    moveTo() {}, lineTo() {}, bezierCurveTo() {}, arc() {}, stroke() {}, fill() {}, save() {}, restore() {}, scale() {},
    createLinearGradient() { return { addColorStop() {} }; },
  };
}

function game(events = [], options = {}) {
  return createGame({
    canvas: { width: 1280, height: 720, getContext: context },
    random: options.random || (() => 0.5),
    offerRandom: options.offerRandom,
    onEvent: (event) => events.push(event),
  });
}

function tick(instance, count, input = {}) {
  while (count--) instance.step(0.02, input);
  return instance.getSnapshot();
}

test("weapon definitions match the approved cores and evolutions", () => {
  assert.deepEqual(projectileSpecs("spread").map((shot) => shot.damage), [0.8, 0.8, 0.8]);
  assert.deepEqual([WEAPONS.spread.cooldown, WEAPONS.lance.damage, WEAPONS.lance.pierce], [0.24, 3, 2]);
  assert.deepEqual([WEAPONS.seeker.damage, WEAPONS.seeker.cooldown, WEAPONS.seeker.homing], [2.6, 0.26, true]);
  assert.equal(projectileSpecs("fan").length, 5);
  assert.deepEqual(projectileSpecs("barrage").map((shot) => shot.delay), [0, 0.06, 0.12]);
  assert.deepEqual([WEAPONS.rail.damage, WEAPONS.rail.pierce, WEAPONS.chain.chain.targets], [7.5, 4, 2]);
  assert.equal(projectileSpecs("swarm").length, 3);
  assert.equal(projectileSpecs("drones").length, 2);
});

test("all twelve tier-three weapons expose parent, tradeoff, visual metadata, and approved fire patterns", () => {
  const expected = {
    tempest: 7, trident: 3, vulcan: 5, helix: 2, needle: 1, siege: 1,
    arcstorm: 1, tesla: 2, hive: 5, hunter: 1, escort: 4, sentinel: 2,
  };
  const shapes = new Set();
  for (const [id, count] of Object.entries(expected)) {
    const weapon = WEAPONS[id];
    assert.equal(weapon.tier, 3, `${id} is tier three`);
    assert.equal(weapon.evolved, true);
    assert.ok(weapon.parent && weapon.description && weapon.role);
    assert.ok(Number.isInteger(weapon.visual.color));
    shapes.add(weapon.visual.shape);
    assert.equal(projectileSpecs(id).length, count);
    for (const shot of projectileSpecs(id)) {
      assert.ok(shot.speed > 0 && shot.radius > 0);
      assert.ok(shot.trailLength >= 0 && shot.trailLength <= 18);
    }
  }
  assert.equal(shapes.size, 12);
  assert.deepEqual(projectileSpecs("trident").map((s) => [Math.round(s.angle), s.muzzleOffset]), [[0, -22], [0, 0], [0, 22]]);
  assert.deepEqual(projectileSpecs("vulcan").map((s) => s.delay), [0, 0.06, 0.12, 0.18, 0.24]);
  assert.deepEqual(projectileSpecs("hive").map((s) => [Math.round(s.angle * 180 / Math.PI), s.delay]), [[-30, 0], [-15, .05], [0, .1], [15, .15], [30, .2]]);
  assert.deepEqual([projectileSpecs("needle")[0].speed, projectileSpecs("siege")[0].speed], [820, 300]);
});

test("wave ten only offers tier-one children, while tier-two advances begin at wave twenty", () => {
  const build = { weaponId: "fan", abilityId: "pulse", perks: {}, baseDamageBonus: 0, evolutionDeclines: 0 };
  const ten = rewardForWave({ wave: 10, build, lives: 3, shield: false, random: () => 0.5 });
  assert.equal(ten.kind, "draft");
  assert.ok(ten.cards.every((card) => !["tempest", "trident"].includes(card.preview)));
  const reward = rewardForWave({ wave: 20, build, lives: 3, shield: false, random: () => 0.5 });
  assert.equal(reward.kind, "evolution");
  assert.deepEqual(reward.cards.map((card) => card.preview), ["tempest", "trident", "fan"]);
});

test("shots carry explicit damage and held focus applies only while held", () => {
  const instance = game();
  instance.startSession();
  instance.__test.setBuild({ weaponId: "base", perks: { focus: 1 } });
  instance.__test.clearWave();
  instance.__test.spawn("tank", 100, 100);
  instance.step(0.02, { actionDown: true });
  assert.equal(instance.getSnapshot().shots[0].damage, 1.2);
  tick(instance, 9);
  instance.step(0.02);
  assert.equal(instance.getSnapshot().shots.at(-1).damage, 1);
});

test("lance pierces two unique enemies and chain hits only two neighbors", () => {
  const lance = game();
  lance.startSession();
  lance.__test.setBuild({ weaponId: "lance", perks: {} });
  lance.__test.clearWave();
  lance.__test.spawn("drifter", 640, 520);
  lance.__test.spawn("drifter", 640, 455);
  tick(lance, 22);
  assert.equal(lance.getSnapshot().counts.enemies, 0);

  const chain = game();
  chain.startSession();
  chain.__test.setBuild({ weaponId: "chain", perks: {} });
  chain.__test.clearWave();
  const center = chain.__test.spawn("drifter", 640, 520);
  const nearby = [580, 700, 760].map((x) => chain.__test.spawn("drifter", x, 520));
  nearby.forEach((enemy) => { enemy.hp = enemy.maxHp = 1.6; });
  center.hp = center.maxHp = 3;
  tick(chain, 14);
  const survivors = chain.getSnapshot().enemies;
  assert.equal(survivors.length, 1);
  assert.equal(survivors[0].x, 760);
});

test("drone evolution fires from both drone positions and every weapon respects the shot cap", () => {
  const drones = game();
  drones.startSession();
  drones.__test.setBuild({ weaponId: "drones", perks: {} });
  drones.__test.clearWave();
  drones.__test.spawn("tank", 100, 100);
  drones.step(0.02);
  const state = drones.getSnapshot();
  assert.equal(state.drones.length, 2);
  assert.equal(state.shots.length, 2);
  assert.equal(new Set(state.shots.map((shot) => shot.x)).size, 2);

  for (const weaponId of Object.keys(WEAPONS)) {
    const instance = game();
    instance.startSession();
    instance.__test.setBuild({ weaponId, perks: { overclock: 5 } });
    instance.__test.clearWave();
    const tank = instance.__test.spawn("tank", 80, 80);
    tank.hp = tank.maxHp = 1e9;
    tick(instance, 500);
    assert.ok(instance.getSnapshot().counts.shots <= 100, `${weaponId} stays under the global cap`);
  }
});

test("advanced projectiles use their declared speed, radius, offsets, trails, and formations", () => {
  const trident = game();
  trident.startSession();
  trident.__test.setBuild({ weaponId: "trident", perks: {} });
  trident.__test.clearWave();
  trident.__test.spawn("tank", 100, 100);
  let state = trident.step(.02);
  assert.deepEqual(state.shots.map((shot) => Math.round(shot.x - state.ship.x)), [-22, 0, 22]);
  assert.ok(state.shots.every((shot) => shot.r === 5.5 && Math.round(shot.speed) === 620));
  tick(trident, 20);
  state = trident.getSnapshot();
  assert.ok(state.shots.every((shot) => shot.trail.length <= 9));
  assert.ok(state.counts.shots <= 100 && state.effects.trails <= state.counts.shots * 18);

  const sentinel = game();
  sentinel.startSession();
  sentinel.__test.setBuild({ weaponId: "sentinel", perks: {} });
  sentinel.__test.clearWave();
  sentinel.__test.spawn("tank", 100, 100);
  state = sentinel.step(.02, { moveX: 1 });
  assert.deepEqual(state.drones.map((drone) => Math.round(drone.x - state.ship.x)), [-58, 58]);
  assert.ok(state.drones.every((drone) => drone.formation === "outrigger"));

  const escort = game();
  escort.startSession();
  escort.__test.setBuild({ weaponId: "escort", perks: {} });
  escort.__test.clearWave();
  escort.__test.spawn("tank", 100, 100);
  const before = escort.step(.02).drones.map(({ x, y }) => [x, y]);
  const after = tick(escort, 8).drones.map(({ x, y }) => [x, y]);
  assert.ok(escort.getSnapshot().drones.every((drone) => drone.formation === "orbit"));
  assert.notDeepEqual(after, before);
});

test("arcstorm relays through four unique targets beyond the primary radius", () => {
  const instance = game();
  instance.startSession();
  instance.__test.setBuild({ weaponId: "arcstorm", perks: {} });
  instance.__test.clearWave();
  const primary = instance.__test.spawn("tank", 640, 520);
  primary.hp = primary.maxHp = 20;
  for (const x of [750, 860, 970, 1080]) {
    const relay = instance.__test.spawn("drifter", x, 520);
    relay.hp = relay.maxHp = 1;
  }
  tick(instance, 14);
  const state = instance.getSnapshot();
  assert.equal(state.counts.enemies, 1);
  assert.equal(state.effects.chains, 4);
});

test("milestones emit one frozen reward and reroll exactly once", () => {
  const events = [];
  let offerIndex = 0;
  const sequence = [0.1, 0.8, 0.3, 0.6, 0.2, 0.9];
  const instance = game(events, { offerRandom: () => sequence[(offerIndex++) % sequence.length] });
  instance.startSession();
  instance.__test.setWave(3);
  instance.__test.clearWave();
  instance.step(0.02);
  const core = instance.getSnapshot().pendingReward;
  assert.deepEqual(core.offers.map((offer) => offer.preview), ["spread", "lance", "seeker"]);
  assert.equal(events.filter((event) => event.type === "upgradeRequested").length, 1);
  const frozen = instance.getSnapshot();
  tick(instance, 50, { moveX: 1 });
  assert.deepEqual(instance.getSnapshot(), frozen);
  instance.chooseUpgrade("weapon:spread");
  tick(instance, 100);
  instance.__test.setWave(5);
  instance.__test.clearWave();
  instance.step(0.02);
  const before = instance.getSnapshot().pendingReward.offers.map((offer) => offer.id);
  assert.equal(instance.rerollUpgrade(), true);
  assert.equal(instance.getSnapshot().pendingReward.rerollsRemaining, 0);
  assert.equal(instance.rerollUpgrade(), false);
  assert.equal(new Set(instance.getSnapshot().pendingReward.offers.map((offer) => offer.id)).size, 3);
  assert.ok(instance.getSnapshot().pendingReward.offers.some((offer) => ["damage", "rate"].includes(offer.category)));
  assert.equal(events.filter((event) => event.type === "upgradeRequested").length, 2);
  assert.ok(before.length === 3);
});

test("evolution choices advance through tier three and terminal tens guarantee Breakthrough", () => {
  const instance = game();
  instance.startSession();
  instance.__test.setBuild({ weaponId: "spread", perks: {} });
  instance.__test.setWave(10);
  instance.__test.clearWave();
  instance.step(0.02);
  assert.equal(instance.getSnapshot().pendingReward.kind, "evolution");
  assert.ok(instance.getSnapshot().pendingReward.offers.some((offer) => offer.id === "keep-current"));
  instance.chooseUpgrade("keep-current");
  tick(instance, 100);
  instance.__test.setWave(20);
  instance.__test.clearWave();
  instance.step(0.02);
  assert.equal(instance.getSnapshot().pendingReward.kind, "evolution");
  instance.chooseUpgrade("weapon:fan");
  tick(instance, 100);
  instance.__test.setWave(30);
  instance.__test.clearWave();
  instance.step(0.02);
  assert.equal(instance.getSnapshot().pendingReward.kind, "evolution");
  assert.equal(instance.getSnapshot().pendingReward.offers.length, 3);
  instance.chooseUpgrade("weapon:tempest");
  tick(instance, 100);
  instance.__test.setWave(40);
  instance.__test.clearWave();
  instance.step(0.02);
  assert.equal(instance.getSnapshot().pendingReward.kind, "draft");
  assert.ok(instance.getSnapshot().pendingReward.offers.some((offer) => offer.id === "perk:breakthrough"));
});

test("abilities do not double-spend and active ability kills pause charge gain", () => {
  const barrier = game();
  barrier.startSession();
  barrier.__test.setBuild({ weaponId: "base", abilityId: "barrier", perks: {} });
  barrier.__test.setCharge(2);
  barrier.__test.setShip(600, 600);
  barrier.__test.setHostile([{ x: 600, y: 600, vx: 0, vy: 0 }]);
  barrier.step(0.02, { specialPressed: true });
  assert.equal(barrier.getSnapshot().lives, 3);
  assert.equal(barrier.getSnapshot().chargeMeter, 1);
  barrier.step(0.02, {});
  barrier.step(0.02, { specialPressed: true });
  assert.equal(barrier.getSnapshot().chargeMeter, 1);

  const overdrive = game();
  overdrive.startSession();
  overdrive.__test.setBuild({ weaponId: "base", abilityId: "overdrive", perks: {} });
  overdrive.__test.setCharge(1);
  overdrive.__test.clearWave();
  overdrive.__test.spawn("tank", 100, 100);
  overdrive.step(0.02, { specialPressed: true });
  assert.equal(overdrive.getSnapshot().shots[0].damage, 1.5);
  overdrive.__test.kill(1);
  assert.equal(overdrive.getSnapshot().chargeProgress, 0);
});

test("enemy health scaling starts after wave twenty", () => {
  assert.equal(enemyHealthMultiplier(20), 1);
  assert.ok(Math.abs(enemyHealthMultiplier(21) - 1.0358) < 1e-12);
  assert.ok(enemyHealthMultiplier(100) > enemyHealthMultiplier(40));
});

test("taking damage keeps the build and a new run resets every upgrade", () => {
  const instance = game();
  instance.startSession();
  instance.__test.setBuild({ weaponId: "fan", abilityId: "barrier", perks: { power: 3, overclock: 2 } });
  instance.__test.setShip(600, 600);
  instance.__test.setHostile([{ x: 600, y: 600, vx: 0, vy: 0 }]);
  instance.step(0.02);
  assert.deepEqual(instance.getSnapshot().build, {
    weaponId: "fan", weaponName: "Fan", abilityId: "barrier", abilityName: "Barrier",
    perks: [
      { id: "power", title: "Power", rank: 3, maxRank: Infinity },
      { id: "overclock", title: "Overclock", rank: 2, maxRank: 5 },
    ],
  });
  instance.startSession();
  assert.deepEqual(instance.getSnapshot().build, {
    weaponId: "base", weaponName: "Emitter", abilityId: "pulse", abilityName: "Pulse", perks: [],
  });
});

test("a fully capped build still gets three compatible distinct draft offers with offense", () => {
  const build = {
    weaponId: "fan", abilityId: "overdrive", baseDamageBonus: 0, evolutionDeclines: 0,
    perks: { overclock: 5, focus: 1, magnet: 3, thrusters: 2, chargeCoil: 3, burstCore: 1 },
  };
  const cards = draftCards(build, 3, true, () => 0.5);
  assert.equal(cards.length, 3);
  assert.equal(new Set(cards.map((card) => card.id)).size, 3);
  assert.ok(cards.some((card) => ["damage", "rate"].includes(card.category)));
  assert.ok(cards.every((card) => !["perk:overclock", "perk:focus", "perk:magnet", "perk:thrusters", "perk:chargeCoil", "perk:burstCore", "perk:repair", "perk:shield", "ability:overdrive"].includes(card.id)));
});

test("rank-three Charge Coil grants one charge after fourteen qualifying kills", () => {
  const instance = game();
  instance.startSession();
  instance.__test.setBuild({ weaponId: "base", abilityId: "pulse", perks: { chargeCoil: 3 } });
  instance.__test.setCharge(0);
  instance.__test.clearWave();
  for (let index = 0; index < 14; index++) instance.__test.spawn("drifter", 100 + index * 20, 100);
  instance.__test.kill(14);
  assert.ok(Math.abs(instance.getSnapshot().chargeRequired - 20 / 1.45) < 1e-12);
  assert.equal(instance.getSnapshot().chargeMeter, 1);
});

test("Burst Core damages at most three neighbors without recursive blasts", () => {
  const instance = game();
  instance.startSession();
  instance.__test.setBuild({ weaponId: "base", abilityId: "pulse", perks: { burstCore: 1 } });
  instance.__test.clearWave();
  const center = instance.__test.spawn("drifter", 640, 520);
  center.hp = center.maxHp = 1;
  for (const x of [600, 620, 660, 680]) {
    const neighbor = instance.__test.spawn("drifter", x, 520);
    neighbor.hp = neighbor.maxHp = 0.3;
  }
  tick(instance, 12);
  assert.equal(instance.getSnapshot().counts.enemies, 1);
});

test("helix follows opposite continuous weave paths and siege splashes unique nearby enemies", () => {
  const helix = game();
  helix.startSession();
  helix.__test.setBuild({ weaponId: "helix", perks: {} });
  helix.__test.clearWave();
  helix.__test.spawn("tank", 100, 100);
  helix.step(0.02);
  const first = helix.getSnapshot().shots;
  assert.equal(first.length, 2);
  assert.notEqual(first[0].x, first[1].x);

  const siege = game();
  siege.startSession();
  siege.__test.setBuild({ weaponId: "siege", perks: {} });
  siege.__test.clearWave();
  const primary = siege.__test.spawn("drifter", 640, 520);
  const nearby = siege.__test.spawn("drifter", 700, 520);
  primary.hp = primary.maxHp = 9;
  nearby.hp = nearby.maxHp = 4;
  tick(siege, 24);
  const state = siege.getSnapshot();
  assert.equal(state.counts.enemies, 0);
  assert.equal(state.effects.blasts.length, 1);
  assert.equal(state.effects.blasts[0].radius, 80);
});
