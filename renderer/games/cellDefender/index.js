/* Cell Defender — host-stepped SkyForce-like game, derived from the MIT source in vendor/spaceinvaders. */
"use strict";
const { drawSprite, drawCellBackground } = require("../../hosa/art");
const { WEAPONS, weaponById, projectileSpecs } = require("./weapons");
const {
  COMBO_IDS,
  buildCombo,
  buildPatienceBeat,
} = require("./bossPatterns");
const {
  ABILITIES,
  PERKS,
  initialBuild,
  publicBuild,
  publicCard,
  rewardForWave,
} = require("./builds");
const W = 1280,
  H = 720,
  TICK = 0.02,
  cap = (n, a, b) => Math.max(a, Math.min(b, n)),
  dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const TUTORIAL_LESSONS = [
  {
    id: "move-fire",
    objective: "Move to line up auto-fire with the target.",
    hint: "Move right until your shots meet the offset target.",
  },
  {
    id: "dodge",
    objective: "Move aside before the warning shot arrives.",
    hint: "Leave the warning lane before its bullet reaches you.",
  },
  {
    id: "weapon-choice",
    objective: "Choose a primary weapon for this practice run.",
    hint: "Compare the three weapons, then choose one.",
  },
  {
    id: "upgrade",
    objective: "Collect the rapid-fire upgrade.",
    hint: "Move into the rapid-fire marker to collect it.",
  },
  {
    id: "pulse",
    objective: "Press X to clear the bullets.",
    hint: "Use X while the incoming bullets are still visible.",
  },
];
// Linear onboarding through wave 20, then exponential pressure up to explicit
// hardware-safe limits. Exported so encounter tuning is directly testable.
function difficultyForWave(wave) {
  const linear = Math.min(1, Math.max(0, wave - 1) / 19);
  const pressure = Math.exp(Math.min(20, Math.max(0, wave - 20)) * 0.09) - 1;
  return {
    progress: linear,
    pressure,
    enemySpeed: Math.min(70, 18 + 42 * linear + pressure * 8),
    fireCooldown: Math.max(0.5, 1.85 - 0.95 * linear - pressure * 0.06),
    bulletSpeed: Math.min(260, 155 + 85 * linear + pressure * 10),
    emitBudget: Math.min(
      72,
      12 + Math.floor(18 * linear) + Math.floor(pressure * 8),
    ),
    attackGap: Math.max(0.25, 0.8 - 0.55 * linear - pressure * 0.04),
    warningSlots: wave < 5 ? 1 : wave < 20 ? 2 : 3,
    activeBullets: Math.min(
      112,
      24 + Math.floor(24 * linear) + Math.floor(pressure * 16),
    ),
    groupSize: Math.min(
      16,
      wave <= 20
        ? 3 + Math.floor((wave - 1) / 4)
        : 7 + Math.floor(pressure * 3),
    ),
    groupCount: wave < 13 ? 2 : Math.min(6, 3 + Math.floor(pressure)),
    groupGap: Math.max(0.5, 1 - 0.5 * linear - pressure * 0.03),
  };
}
function enemyHealthMultiplier(wave) {
  const n = Math.max(0, wave - 20);
  return 1 + 0.035 * n + 0.0008 * n * n;
}
function regularEnemyHealthForWave(type, wave) {
  const bases = {
    drifter: 1,
    aimed: 2,
    tank: 4,
    diver: 2,
    burstSower: 2,
    bloomSentinel: 4,
    skirmisher: 2,
    bulwark: 6.4,
    orbiter: 3,
  };
  if (!Object.hasOwn(bases, type)) return null;
  const base = bases[type];
  // Regular waves and sandbox jumps are bounded to the game's supported range.
  // Invalid values fall back to the opening encounter rather than producing NaN.
  const safeWave = Number.isFinite(wave)
    ? cap(Math.floor(wave), 1, 1000)
    : 1;
  const early = 1 + 0.3 * Math.min(16, Math.max(0, safeWave - 3));
  return Math.max(
    base,
    Math.round(base * early * enemyHealthMultiplier(safeWave)),
  );
}
function encounterTypeForWave(wave) {
  if (!Number.isInteger(wave) || wave <= 0) return null;
  if (wave % 10 === 0) return "majorboss";
  if (wave % 5 === 0) return "miniboss";
  return null;
}
function bossHealthForWave(wave) {
  const type = encounterTypeForWave(wave);
  if (!type) return null;
  const cappedWave = Math.min(wave, 20);
  const base = type === "majorboss"
    ? 360 + 14 * (cappedWave - 10)
    : 190 + 6 * (cappedWave - 5);
  return Math.round(base * enemyHealthMultiplier(wave));
}
function createGame({
  canvas,
  audio,
  onEvent,
  random = Math.random,
  reducedMotion,
  sessionKind = "regular",
  presentation,
  offerRandom,
  devMode = false,
} = {}) {
  if (!canvas || typeof canvas.getContext !== "function")
    throw new TypeError("createGame requires a canvas");
  const c = canvas.getContext("2d");
  if (!c) throw new TypeError("canvas must provide a 2d context");
  const play =
      typeof audio?.play === "function" ? (x) => audio.play(x) : () => {},
    emit = typeof onEvent === "function" ? onEvent : () => {},
    rnd = typeof random === "function" ? random : Math.random,
    rewardRnd = typeof offerRandom === "function" ? offerRandom : rnd;
  let phase = "ended",
    paused = false,
    ended = false,
    now = 0,
    score = 0,
    lives = 3,
    wave = 1,
    ship,
    enemies = [],
    shots = [],
    bullets = [],
    scheduledBullets = [],
    emitters = [],
    hazards = [],
    drops = [],
    breather = 0,
    lastShot = -9,
    kills = 0,
    playerBuild = initialBuild(),
    rapid = 0,
    shield = false,
    pulse = 0,
    charge = 1,
    invuln = 0,
    boss = null,
    latch = false,
    qualifyingKills = 0,
    enemySerial = 0,
    shotSerial = 0,
    pendingReward = null,
    rewardSerial = 0,
    deferredShots = [],
    drones = [],
    barrierUntil = 0,
    overdriveUntil = 0,
    sandbox = false,
    sandboxInvincible = false,
    areaSerial = 0;
  let waveCleared = false;
  let groupSize = 3,
    groupDelay = 0,
    volleyId = 0;
  let tutorialStep = 0,
    tutorialElapsed = 0,
    tutorialStatus = "active",
    tutorialAwaitContinueRelease = false,
    tutorialCompleteEmitted = false,
    tutorialTargetHit = false,
    tutorialPickupTaken = false,
    tutorialDodgeFired = false,
    tutorialDodgePending = false,
    tutorialRetryUntil = 0,
    tutorialRetryHint = "",
    tutorialRetryHintUntil = 0;
  let attacks = [],
    emittedAt = [],
    lastAttack = -99;
  let hitFx = [],
    pickupFx = [],
    shieldFx = [],
    guardFx = [],
    chainFx = [],
    deathFx = [],
    blastFx = [],
    motionWasAllowed;
  const MAXB = 128,
    MAXS = 100,
    MAX_DROPS = 12,
    RAPID_SECONDS = 8,
    MAX_HIT_FX = 48,
    MAX_PICKUP_FX = 6,
    MAX_BLAST_FX = 8,
    SHOT_TTL = 2.5,
    SANDBOX_MAX_PERK_RANK = 100;
  const SANDBOX_PERKS = new Set(
    Object.keys(PERKS).filter((id) => id !== "repair" && id !== "shield"),
  );
  const motionAllowed = () => {
    const reduce =
      typeof reducedMotion === "function"
        ? reducedMotion()
        : (reducedMotion ??
          globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
    return !reduce;
  };
  function clearFx() {
    hitFx = [];
    pickupFx = [];
    shieldFx = [];
    guardFx = [];
    chainFx = [];
    deathFx = [];
    blastFx = [];
    shots.forEach((s) => delete s.trail);
  }
  function refreshMotion() {
    const allowed = motionAllowed();
    if (motionWasAllowed !== undefined && allowed !== motionWasAllowed)
      clearFx();
    motionWasAllowed = allowed;
    return allowed;
  }
  function addHitFx(x, y, color) {
    const moving = refreshMotion();
    const count = moving ? 6 : 1;
    for (let i = 0; i < count && hitFx.length < MAX_HIT_FX; i++) {
      const a = (i / count) * Math.PI * 2;
      hitFx.push({
        x,
        y,
        vx: moving ? Math.cos(a) * 100 : 0,
        vy: moving ? Math.sin(a) * 100 : 0,
        age: 0,
        color,
      });
    }
  }
  function addPickupFx(x, y, text, color) {
    if (pickupFx.length < MAX_PICKUP_FX)
      pickupFx.push({ x, y, text, color, age: 0 });
  }
  function addBlastFx(x, y, radius) {
    const moving = refreshMotion();
    if (blastFx.length >= MAX_BLAST_FX) return;
    blastFx.push({ id: `blast-${++areaSerial}`, x, y, radius, age: 0, duration: moving ? 0.24 : 0.12 });
  }
  function addGuardFx(e) {
    if (!e || now - (e.lastGuardAt ?? -99) < 0.1) return;
    e.lastGuardAt = now;
    if (guardFx.length < 6)
      guardFx.push({ x: e.x, y: e.y, age: 0, mode: e.mode });
  }
  function updateFx(dt) {
    const moving = refreshMotion();
    hitFx.forEach((p) => {
      p.age += dt;
      if (moving) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    });
    hitFx = hitFx.filter((p) => p.age < 0.18);
    pickupFx.forEach((p) => (p.age += dt));
    pickupFx = pickupFx.filter((p) => p.age < 0.65);
    shieldFx.forEach((p) => (p.age += dt));
    shieldFx = shieldFx.filter((p) => p.age < 0.16);
    guardFx.forEach((p) => (p.age += dt));
    guardFx = guardFx.filter((p) => p.age < 0.32);
    chainFx.forEach((p) => (p.age += dt));
    chainFx = chainFx.filter((p) => p.age < 0.18);
    deathFx.forEach((p) => (p.age += dt));
    deathFx = deathFx.filter((p) => p.age < 0.3);
    blastFx.forEach((p) => (p.age += dt));
    blastFx = blastFx.filter((p) => p.age < p.duration);
  }
  function add(type, x, y, o = {}) {
    const d = {
      drifter: ["#f35d87", 1, 16],
      aimed: ["#ae7cff", 2, 18],
      tank: ["#ff9d55", 4, 25],
      diver: ["#ed55c2", 2, 17],
      burstSower: ["#ae7cff", 2, 18],
      bloomSentinel: ["#ff9d55", 4, 25],
      skirmisher: ["#f35d87", 2, 16],
      bulwark: ["#ff718f", 6.4, 28],
      orbiter: ["#d95fba", 3, 20],
    }[type];
    const hp = regularEnemyHealthForWave(type, wave);
    let e = {
      id: `enemy-${++enemySerial}`,
      type,
      renderType:
        type === "burstSower"
          ? "aimed"
          : type === "bloomSentinel"
            ? "tank"
            : type,
      x,
      y,
      vx: o.vx ?? (type === "skirmisher" ? 45 : type === "bulwark" ? 15 : 0),
      vy: o.vy || 0,
      hp,
      maxHp: hp,
      r: d[2],
      color: d[0],
      cool: o.cool ?? 0.35 + rnd(),
      tele: 0,
      dive: o.dive ?? 1.2 + rnd() * 1.5,
      anchorX: x,
      anchorY: type === "orbiter" ? y - 24 : y,
      motionPhase: type === "orbiter" ? Math.PI / 2 : 0,
      motionDirection: o.motionDirection || 1,
      dead: false,
    };
    enemies.push(e);
    return e;
  }
  function spawnWave() {
    attacks = [];
    emittedAt = [];
    lastAttack = -99;
    enemies = [];
    shots = [];
    deferredShots = [];
    bullets = [];
    scheduledBullets = [];
    emitters = [];
    hazards = [];
    boss = null;
    const difficulty = difficultyForWave(wave);
    const encounterType = encounterTypeForWave(wave);
    if (encounterType) {
      const major = encounterType === "majorboss";
      const phases = major ? 4 : 2;
      const hp = bossHealthForWave(wave);
      boss = {
        id: `enemy-${++enemySerial}`,
        type: encounterType,
        x: W / 2,
        y: 145,
        hp,
        maxHp: hp,
        phase: 1,
        phases,
        recovery: 0.9,
        mode: major ? "assault" : "recon",
        modeDuration: 0,
        modeEndsAt: 0,
        patienceStartedAt: 0,
        patienceStage: 0,
        patienceNextAt: 0,
        patienceStyle: null,
        patienceSegment: -1,
        patienceOrbitAngle: null,
        r: 55,
        color: "#ff5d79",
        cool: 1,
        patternBag: [],
        lastPattern: null,
        comboId: null,
        beat: 0,
        combo: null,
        comboSerial: 0,
        forcedPattern: null,
        attackSerial: 0,
        destinationIndex: 2,
        destination: { x: W / 2, y: 145 },
        lastGuardAt: -99,
        dead: false,
      };
      enemies.push(boss);
    } else {
      groupSize = difficulty.groupSize;
      let cols = groupSize,
        rows = difficulty.groupCount;
      for (let r = 0; r < rows; r++)
        for (let col = 0; col < cols; col++) {
          let n = r * cols + col,
            type =
              wave === 1
                ? "drifter"
                : wave === 2
                  ? n % 5 === 0
                    ? "aimed"
                    : "drifter"
                  : wave < 5
                    ? n % 6 === 0
                      ? "tank"
                      : n % 4 === 0
                        ? "aimed"
                        : "drifter"
                    : n % 7 === 0
                      ? "tank"
                      : n % 5 === 0
                        ? "aimed"
                        : n % 6 === 0
                          ? "diver"
                          : "drifter";
          const variantPool = [
            ...(wave >= 6 ? ["skirmisher"] : []),
            ...(wave >= 8 ? ["burstSower"] : []),
            ...(wave >= 12 ? ["bulwark"] : []),
            ...(wave >= 16 ? ["bloomSentinel"] : []),
            ...(wave >= 18 ? ["orbiter"] : []),
          ];
          const variantsPerGroup = variantPool.length ? (wave < 20 ? 1 : 2) : 0;
          const variantSlot = cols - 1 - col;
          if (variantSlot < variantsPerGroup) {
            const intro = { 6: "skirmisher", 12: "bulwark", 18: "orbiter" }[wave];
            type = intro && variantSlot === 0
              ? intro
              : variantPool[(wave + r + variantSlot * 2) % variantPool.length];
          }
          const speedScale = type === "bulwark" ? 0.42 : type === "orbiter" ? 0 : 1;
          add(type, 230 + (col * 820) / Math.max(1, cols - 1), 110 + r * 72, {
            vx: (col % 2 ? 1 : -1) * difficulty.enemySpeed * speedScale,
            motionDirection: col % 2 ? 1 : -1,
            cool:
              Math.max(0.5, 0.75 - 0.25 * difficulty.progress) +
              (n % 4) * 0.22,
          });
          enemies.forEach((e, index) => (e.active = index < groupSize));
          groupDelay = 0;
        }
    }
    play("wave");
  }
  function startSession() {
    phase = "playing";
    paused = ended = false;
    now = score = kills = qualifyingKills = 0;
    lives = 3;
    wave = 1;
    playerBuild = initialBuild();
    sandbox = false;
    sandboxInvincible = false;
    rapid = 0;
    shield = false;
    charge = 1;
    invuln = 0;
    barrierUntil = overdriveUntil = 0;
    breather = 0;
    latch = false;
    lastShot = -9;
    pulse = 0;
    tutorialStep = tutorialElapsed = 0;
    tutorialStatus = "active";
    tutorialAwaitContinueRelease = false;
    tutorialCompleteEmitted = false;
    tutorialTargetHit = tutorialPickupTaken = false;
    tutorialDodgeFired = false;
    tutorialDodgePending = false;
    tutorialRetryUntil = tutorialRetryHintUntil = 0;
    tutorialRetryHint = "";
    enemySerial = 0;
    shotSerial = rewardSerial = 0;
    areaSerial = 0;
    pendingReward = null;
    waveCleared = false;
    deferredShots = [];
    drones = [];
    drops = [];
    clearFx();
    motionWasAllowed = motionAllowed();
    ship = { x: W / 2, y: H - 90, r: 10 };
    if (sessionKind === "tutorial") {
      enemies = [];
      bullets = [];
      shots = [];
      setupTutorialStep();
    } else spawnWave();
    render();
  }
  function finish() {
    phase = "ended";
    if (!ended) {
      ended = true;
      emit({ type: "sessionEnd", result: { score, wave, completed: false } });
    }
  }
  function burst(a) {
    if (bullets.length + a.length <= MAXB) bullets.push(...a);
  }
  function b(x, y, vx, vy, o = {}) {
    return { x, y, vx, vy, r: o.r || 5, kind: o.kind || "standard" };
  }
  function clearThreats() {
    bullets = [];
    scheduledBullets = [];
    attacks = [];
    emitters = [];
    hazards = [];
    emittedAt = [];
    lastAttack = -99;
  }
  function addAttackAreas(attack) {
    const layerId = attack.id;
    for (const spec of attack.emitters || []) {
      const activeDuration = spec.activeDuration ?? 0.2;
      const expiryDuration = spec.expiryDuration ?? 0.25;
      emitters.push({
        id: `emitter-${++areaSerial}`,
        layerId,
        x: spec.x,
        y: spec.y,
        radius: spec.radius,
        kind: spec.kind,
        startAt: now,
        activeAt: attack.fireAt,
        expiryAt: attack.fireAt + activeDuration,
        endAt: attack.fireAt + activeDuration + expiryDuration,
      });
    }
    for (const spec of attack.hazards || []) {
      const activeDuration = spec.activeDuration ?? 0.45;
      const expiryDuration = spec.expiryDuration ?? 0.25;
      hazards.push({
        id: `hazard-${++areaSerial}`,
        layerId,
        x: spec.x,
        y: spec.y,
        radius: spec.radius,
        kind: spec.kind,
        startAt: now,
        activeAt: attack.fireAt,
        expiryAt: attack.fireAt + activeDuration,
        endAt: attack.fireAt + activeDuration + expiryDuration,
      });
    }
  }
  function areaState(area) {
    if (now < area.activeAt)
      return {
        state: "telegraph",
        progress: cap((now - area.startAt) / Math.max(TICK, area.activeAt - area.startAt), 0, 1),
      };
    if (now < area.expiryAt)
      return {
        state: "active",
        progress: cap((now - area.activeAt) / Math.max(TICK, area.expiryAt - area.activeAt), 0, 1),
      };
    return {
      state: "expiry",
      progress: cap((now - area.expiryAt) / Math.max(TICK, area.endAt - area.expiryAt), 0, 1),
    };
  }
  function publicArea(area) {
    return {
      id: area.id,
      x: area.x,
      y: area.y,
      radius: area.radius,
      ...areaState(area),
      kind: area.kind,
    };
  }
  function updateAreas() {
    emitters = emitters.filter((area) => now < area.endAt);
    hazards = hazards.filter((area) => now < area.endAt);
    if (
      hazards.some(
        (area) =>
          areaState(area).state === "active" &&
          dist(area, ship) < area.radius + ship.r,
      )
    )
      hurt();
  }
  function addDrop(kind, x, y) {
    if (drops.length < MAX_DROPS) drops.push({ kind, x, y, r: 12 });
  }
  function abilityActive() {
    return pulse > 0 || now < barrierUntil || now < overdriveUntil;
  }
  function chargeRequirement() {
    return 20 / (1 + 0.15 * Math.min(3, playerBuild.perks.chargeCoil || 0));
  }
  function usefulDrop() {
    if (!shield) return "shield";
    if (charge < 2) return "charge";
    return now >= rapid ? "rapid" : "star";
  }
  function kill(e, abilityKill = false, killingDamage = 0, allowBurst = true) {
    if (e.dead) return;
    e.dead = true;
    if (deathFx.length < 24)
      deathFx.push({
        id: e.id,
        type: e.type,
        x: e.x,
        y: e.y,
        age: 0,
        color: e.color,
      });
    attacks = attacks.filter((a) => a.committed || a.sourceId !== e.id);
    score += e.type === "miniboss" ? 150 : e.type === "majorboss" ? 300 : 10;
    kills++;
    if (!abilityKill && !abilityActive()) {
      qualifyingKills += 1;
      const requirement = chargeRequirement();
      if (qualifyingKills >= requirement) {
        charge = Math.min(2, charge + 1);
        qualifyingKills %= requirement;
      }
    }
    if (kills === 5) addDrop(usefulDrop(), e.x, e.y);
    else if (kills > 5 && kills % 8 === 0) addDrop(usefulDrop(), e.x, e.y);
    if (!abilityKill && qualifyingKills > 0 && kills % 12 === 0)
      addDrop("star", e.x + 14, e.y);
    if (allowBurst && playerBuild.perks.burstCore) {
      enemies.filter((other) => !other.dead && other.active !== false && dist(e, other) <= 70)
        .sort((a, b) => dist(e, a) - dist(e, b)).slice(0, 3)
        .forEach((other) => damageEnemy(other, killingDamage * 0.4, { allowBurst: false }));
    }
    play("hit");
  }
  function enemyFire(e, dt) {
    e.cool -= dt;
    if (e.cool > 0) return;
    const difficulty = difficultyForWave(wave);
    e.cool =
      e.type === "aimed"
        ? Math.max(1.1, difficulty.fireCooldown * (2.4 / 1.85))
        : e.type === "bulwark"
          ? Math.max(1.65, difficulty.fireCooldown * 1.35)
          : e.type === "orbiter"
            ? Math.max(1.35, difficulty.fireCooldown * 1.15)
        : difficulty.fireCooldown;
    const warning =
      e.type === "tank"
        ? 0.8
        : e.type === "diver" || e.type === "bloomSentinel"
          ? 0.9
          : e.type === "burstSower"
            ? 0.75
            : e.type === "skirmisher"
              ? 0.85
              : e.type === "bulwark"
                ? 1.1
                : e.type === "orbiter"
                  ? 0.9
            : 0.6;
    const origin = { x: e.x, y: e.y };
    const target = { x: ship.x, y: ship.y };
    let pattern;
    let hazardSpecs;
    let emitterSpecs;
    if (e.type === "skirmisher") {
      const aim = Math.atan2(target.y - origin.y, target.x - origin.x);
      pattern = [0, 0.12].map((delay) => ({
        ...b(
          origin.x,
          origin.y,
          Math.cos(aim) * difficulty.bulletSpeed * 1.2,
          Math.sin(aim) * difficulty.bulletSpeed * 1.2,
          { r: 3.5, kind: "needle" },
        ),
        delay,
      }));
    } else if (e.type === "bulwark") {
      const aim = Math.atan2(target.y - origin.y, target.x - origin.x);
      pattern = [-0.3, 0, 0.3].map((spread, index) => ({
        ...b(
          origin.x,
          origin.y,
          Math.cos(aim + spread) * difficulty.bulletSpeed * 0.72,
          Math.sin(aim + spread) * difficulty.bulletSpeed * 0.72,
          { r: 8, kind: "heavy" },
        ),
        delay: index * 0.12,
      }));
    } else if (e.type === "orbiter") {
      const aim = Math.atan2(target.y - origin.y, target.x - origin.x);
      pattern = [90, 135, 180, 225, 270, 315].map((offset) => {
        const angle = aim + (offset * Math.PI) / 180;
        return b(
          origin.x,
          origin.y,
          Math.cos(angle) * difficulty.bulletSpeed * 0.8,
          Math.sin(angle) * difficulty.bulletSpeed * 0.8,
          { r: 5, kind: "orbiterArc" },
        );
      });
    } else if (e.type === "bloomSentinel") {
      const bloom = {
        x: cap(target.x, 60, W - 60),
        y: cap(target.y, 280, H - 55),
        radius: 34,
        kind: "sentinelBloom",
        activeDuration: 0.4,
        expiryDuration: 0.25,
      };
      hazardSpecs = [bloom];
      emitterSpecs = [{ x: bloom.x, y: bloom.y, radius: 13, kind: "bloomEmitter" }];
      pattern = [];
      for (let ray = 0; ray < 6; ray++) {
        const angle = (ray * Math.PI * 2) / 6;
        pattern.push(
          b(
            bloom.x,
            bloom.y,
            Math.cos(angle) * difficulty.bulletSpeed * 0.65,
            Math.sin(angle) * difficulty.bulletSpeed * 0.65,
          ),
        );
      }
    } else if (e.type === "burstSower") {
      const aim = Math.atan2(target.y - origin.y, target.x - origin.x);
      pattern = [-0.13, 0, 0.13].map((spread, index) => ({
        ...b(
          origin.x,
          origin.y,
          Math.cos(aim + spread) * difficulty.bulletSpeed,
          Math.sin(aim + spread) * difficulty.bulletSpeed,
        ),
        delay: index * 0.16,
      }));
    } else if (e.type === "tank") {
      let n = wave > 5 ? 5 : 3,
        a = [],
        spread = n === 5 ? 0.72 : 0.48;
      for (let i = 0; i < n; i++) {
        let angle = Math.PI / 2 + ((i - (n - 1) / 2) * spread) / (n - 1);
        a.push(
          b(origin.x, origin.y, Math.cos(angle) * 150, Math.sin(angle) * 150),
        );
      }
      pattern = a;
    } else if (e.type === "aimed") {
      const d = Math.hypot(target.x - origin.x, target.y - origin.y) || 1;
      pattern = [
        b(
          origin.x,
          origin.y,
          ((target.x - origin.x) / d) * 230,
          ((target.y - origin.y) / d) * 230,
        ),
      ];
    } else pattern = [b(origin.x, origin.y, 0, difficulty.bulletSpeed)];
    reserveAttack({
      source: e,
      kind: e.type,
      warning,
      origin,
      target,
      pattern,
      hazards: hazardSpecs,
      emitters: emitterSpecs,
      committed: wave >= 4 && pattern.length > 0,
    });
  }
  function reserveAttack(attack) {
    const d = difficultyForWave(wave);
    const source = attack.source;
    const sourceId = attack.sourceId || source?.id;
    if (!sourceId) return false;
    emittedAt = emittedAt.filter((t) => now - t < 3);
    const comboFutureCapacity = boss?.combo
      ? boss.combo.beats
          .slice(boss.combo.nextBeat)
          .reduce((sum, beat) => sum + beat.bullets.length, 0)
      : 0;
    const reserved =
      attacks.reduce((sum, a) => sum + a.pattern.length, 0) +
      scheduledBullets.length +
      comboFutureCapacity;
    const isBoss = attack.kind.startsWith("boss");
    const sameSource = attacks.some((a) => a.sourceId === sourceId);
    const bossWarnings = attacks.filter((a) => a.kind.startsWith("boss")).length;
    const hazardLayers = new Set(
      hazards.filter((area) => areaState(area).state !== "expiry").map((area) => area.layerId),
    );
    const introducesHazardLayer = Boolean(attack.hazards?.length);
    if (
      (sameSource && !(isBoss && attack.parentComboId)) ||
      (isBoss ? bossWarnings >= 2 : attacks.length >= d.warningSlots) ||
      now - lastAttack < d.attackGap ||
      (introducesHazardLayer && hazardLayers.size >= 2) ||
      (!isBoss &&
        emittedAt.length + reserved + attack.pattern.length > d.emitBudget) ||
      (!attack.preReserved &&
        (bullets.length + reserved + attack.pattern.length > d.activeBullets ||
          bullets.length + reserved + attack.pattern.length > MAXB))
    )
      return false;
    attack.sourceId = sourceId;
    delete attack.source;
    attack.fireAt = now + attack.warning;
    attack.id = `${wave}:${now}:${attacks.length}`;
    attacks.push(attack);
    addAttackAreas(attack);
    lastAttack = now;
    return true;
  }
  function updateAttacks() {
    emittedAt = emittedAt.filter((t) => now - t < 3);
    attacks = attacks.filter((a) => {
      if (a.committed) return true;
      const source = enemies.find((e) => e.id === a.sourceId);
      return source && !source.dead && source.active !== false;
    });
    for (let i = attacks.length - 1; i >= 0; i--) {
      if (now < attacks[i].fireAt) continue;
      const a = attacks[i];
      if (a.onFire) a.onFire(enemies.find((e) => e.id === a.sourceId));
      const immediate = a.pattern.filter((projectile) => !(projectile.delay > 0));
      const deferred = a.pattern.filter((projectile) => projectile.delay > 0);
      burst(immediate.map(({ delay, ...projectile }) => projectile));
      scheduledBullets.push(
        ...deferred.map(({ delay, ...projectile }) => ({
          ...projectile,
          fireAt: now + delay,
          parentComboId: a.parentComboId,
        })),
      );
      emittedAt.push(...immediate.map(() => now));
      attacks.splice(i, 1);
    }
  }
  function updateScheduledBullets() {
    for (let index = scheduledBullets.length - 1; index >= 0; index--) {
      if (now < scheduledBullets[index].fireAt) continue;
      const { fireAt, parentComboId, ...projectile } = scheduledBullets[index];
      burst([projectile]);
      emittedAt.push(now);
      scheduledBullets.splice(index, 1);
    }
  }
  const BOSS_COMBO_POOLS = {
    recon: ["crossingStreams", "delayedBlooms"],
    frenzy: ["crossingStreams", "orbitGaps", "delayedBlooms", "latticeSweep", "petalBurst"],
    assault: COMBO_IDS,
    mutation: COMBO_IDS,
    rage: COMBO_IDS,
  };
  function patienceTimelineForWave(value) {
    if (value === 10) return [{ style: "weave", start: 0, end: 10 }];
    if (value === 20) return [{ style: "rotation", start: 0, end: 12 }];
    return [
      { style: "weave", start: 0, end: 7 },
      { style: "reposition", start: 7, end: 8 },
      { style: "rotation", start: 8, end: 16 },
    ];
  }
  function bossVulnerable(e) {
    return Boolean(e && e.recovery <= 0 && e.mode !== "patience");
  }
  function bossMovementSpeed(mode) {
    return {
      recon: 120,
      frenzy: 145,
      assault: 125,
      patience: 0,
      mutation: 145,
      rage: 165,
    }[mode] || 125;
  }
  function bossAttackCooldown(mode) {
    return {
      recon: 0.72,
      frenzy: 0.56,
      assault: 0.64,
      mutation: 0.5,
      rage: 0.4,
    }[mode] || 0.64;
  }
  function refillBossPatternBag(e, choices) {
    e.patternBag = choices.slice();
    for (let i = e.patternBag.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [e.patternBag[i], e.patternBag[j]] = [e.patternBag[j], e.patternBag[i]];
    }
    if (
      e.patternBag.length > 1 &&
      e.patternBag[e.patternBag.length - 1] === e.lastPattern
    ) {
      [e.patternBag[0], e.patternBag[e.patternBag.length - 1]] = [
        e.patternBag[e.patternBag.length - 1],
        e.patternBag[0],
      ];
    }
  }
  function startBossCombo(e, kind) {
    const serial = e.comboSerial + 1;
    const combo = buildCombo({
      family: kind,
      mode: e.mode,
      wave,
      boss: e,
      ship,
      comboSerial: serial,
    });
    if (!combo) return false;
    const difficulty = difficultyForWave(wave);
    const reserved = attacks.reduce((sum, attack) => sum + attack.pattern.length, 0) + scheduledBullets.length;
    if (
      bullets.length + reserved + combo.capacity > difficulty.activeBullets ||
      bullets.length + reserved + combo.capacity > MAXB
    )
      return false;
    e.comboSerial = serial;
    e.attackSerial++;
    e.lastPattern = kind;
    e.comboId = kind;
    e.beat = 0;
    e.combo = {
      ...combo,
      startedAt: now,
      nextBeat: 0,
      parentId: `${e.id}:combo-${serial}`,
    };
    if (e.mode !== "recon" || e.attackSerial % 2 === 0) {
      const zones = [
        { x: 180, y: 120 },
        { x: 420, y: 205 },
        { x: 640, y: 105 },
        { x: 860, y: 205 },
        { x: 1100, y: 120 },
      ];
      let destinationIndex = Math.floor(rnd() * zones.length);
      if (destinationIndex === e.destinationIndex)
        destinationIndex = (destinationIndex + 1) % zones.length;
      e.destinationIndex = destinationIndex;
      e.destination = { ...zones[destinationIndex] };
    }
    return true;
  }
  function updateBossCombo(e) {
    const combo = e.combo;
    if (!combo) return;
    const beat = combo.beats[combo.nextBeat];
    if (beat && now >= combo.startedAt + beat.cueOffset) {
      if (
        reserveAttack({
          source: e,
          parentComboId: combo.parentId,
          preReserved: true,
          kind: `boss-${beat.family}`,
          warning: beat.warning,
          origin: beat.origin,
          target: beat.target,
          pattern: beat.bullets,
          emitters: beat.emitters,
          hazards: beat.hazards,
        })
      ) {
        e.beat = beat.index + 1;
        combo.nextBeat++;
      }
      return;
    }
    const comboLive =
      attacks.some((attack) => attack.parentComboId === combo.parentId) ||
      scheduledBullets.some((projectile) => projectile.parentComboId === combo.parentId);
    if (
      combo.nextBeat >= combo.beats.length &&
      !comboLive &&
      now >= combo.startedAt + combo.endsAfter
    ) {
      e.combo = null;
      e.comboId = null;
      e.beat = 0;
      e.cool = bossAttackCooldown(e.mode);
    }
  }
  function bossFire(dt) {
    if (!boss || boss.mode === "patience") return;
    if (boss.combo) {
      updateBossCombo(boss);
      return;
    }
    boss.cool -= dt;
    if (boss.cool > 0) return;
    const choices = BOSS_COMBO_POOLS[boss.mode] || BOSS_COMBO_POOLS.assault;
    const forced = boss.forcedPattern;
    if (!forced && !boss.patternBag.length) refillBossPatternBag(boss, choices);
    const kind = forced || boss.patternBag[boss.patternBag.length - 1];
    if (startBossCombo(boss, kind)) {
      boss.forcedPattern = null;
      if (forced) boss.patternBag = [];
      else boss.patternBag.pop();
    }
  }
  function updatePatienceRotation(e, dt, entering) {
    const centerX = 640;
    const centerY = 195;
    const radiusX = 300;
    const radiusY = 80;
    const angularSpeed = 0.45;
    const movementSpeed = 158;
    if (entering || !Number.isFinite(e.patienceOrbitAngle))
      e.patienceOrbitAngle = Math.atan2(
        (e.y - centerY) / radiusY,
        (e.x - centerX) / radiusX,
      );
    e.patienceOrbitAngle += angularSpeed * dt;
    const destination = {
      x: centerX + Math.cos(e.patienceOrbitAngle) * radiusX,
      y: centerY + Math.sin(e.patienceOrbitAngle) * radiusY,
    };
    e.destination = destination;
    const dx = destination.x - e.x;
    const dy = destination.y - e.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 0) {
      const step = Math.min(distance, movementSpeed * dt);
      e.x += (dx / distance) * step;
      e.y += (dy / distance) * step;
    }
  }
  function updateBossPatience(dt) {
    if (!boss || boss.mode !== "patience") return;
    const elapsed = now - boss.patienceStartedAt;
    if (elapsed >= boss.modeDuration) {
      clearThreats();
      completeBossSurvival(boss);
      return;
    }
    const timeline = patienceTimelineForWave(wave);
    const segmentIndex = timeline.findIndex(
      (segment) => elapsed >= segment.start && elapsed < segment.end,
    );
    const segment = timeline[Math.max(0, segmentIndex)];
    const enteringSegment = segmentIndex !== boss.patienceSegment;
    if (enteringSegment) {
      boss.patienceSegment = segmentIndex;
      boss.patienceStyle = segment.style;
      boss.patienceStage = 0;
      boss.comboId = null;
      boss.beat = 0;
      clearThreats();
      boss.patienceNextAt = now + (segment.style === "reposition" ? 1 : 0);
    }
    if (segment.style === "rotation")
      updatePatienceRotation(boss, dt, enteringSegment);
    if (segment.style === "reposition" || now < boss.patienceNextAt) return;
    const warning = boss.patienceStage === 0 ? 0.9 : 0.65;
    const segmentEndAt = boss.patienceStartedAt + segment.end;
    if (now + warning + 0.15 >= segmentEndAt) return;
    const beat = buildPatienceBeat({
      style: segment.style,
      wave,
      boss,
      ship,
      index: boss.patienceStage,
    });
    if (
      reserveAttack({
        source: boss,
        parentComboId: `${boss.id}:patience-${segmentIndex}`,
        kind: `boss-${beat.family}`,
        warning,
        origin: beat.origin,
        target: beat.target,
        pattern: beat.bullets,
        emitters: beat.emitters,
        hazards: beat.hazards,
      })
    ) {
      boss.patienceStage++;
      boss.comboId = beat.family;
      boss.beat = boss.patienceStage;
      boss.patienceNextAt = now + (segment.style === "rotation" ? 0.82 : 1.05);
    }
  }
  function updateDrones() {
    const weapon = weaponById(playerBuild.weaponId);
    if (!weapon.drones) {
      drones = [];
      return;
    }
    const count = weapon.drones;
    const radius = weapon.orbitRadius || 34;
    drones = Array.from({ length: count }, (_, index) => {
      if (weapon.droneFormation === "outrigger") {
        const x = ship.x + (weapon.muzzleOffsets?.[index] || 0);
        return { id: `drone-${index + 1}`, x, y: ship.y - 4, r: 7, angle: -Math.PI / 2, formation: "outrigger" };
      }
      const offset = (Math.PI * 2 * index) / count;
      const angle = now * (weapon.orbitSpeed || 2.2) + offset;
      return { id: `drone-${index + 1}`, x: ship.x + Math.cos(angle) * radius, y: ship.y + Math.sin(angle) * radius * 0.55, r: 7, angle, formation: "orbit" };
    });
  }
  function makeShot(spec, origin, weaponId, damageMultiplier) {
    const speed = spec.speed;
    const vx = Math.sin(spec.angle) * speed;
    const vy = -Math.cos(spec.angle) * speed;
    return {
      id: `shot-${++shotSerial}`,
      x: origin.x,
      y: origin.y,
      vx,
      vy,
      speed,
      heading: Math.atan2(vy, vx),
      muzzleOffset: spec.muzzleOffset,
      r: spec.radius,
      ttl: SHOT_TTL,
      damage: spec.damage * damageMultiplier,
      pierce: spec.pierce,
      hitIds: new Set(),
      homing: spec.homing,
      turnRate: spec.turnRate,
      trailLength: spec.trailLength,
      weave: spec.weave && { ...spec.weave, offset: 0, age: 0 },
      splash: spec.splash,
      weaponId,
      style: spec.style,
    };
  }
  function fire(input = {}) {
    if (boss?.mode === "patience") return;
    const weapon = weaponById(playerBuild.weaponId);
    const rateBonus = 0.1 * Math.min(5, playerBuild.perks.overclock || 0) + (now < rapid ? 0.25 : 0);
    const gap = weapon.cooldown / (1 + rateBonus);
    const specs = projectileSpecs(playerBuild.weaponId);
    if (now - lastShot < gap || shots.length + deferredShots.length + specs.length > MAXS) return;
    lastShot = now;
    volleyId++;
    updateDrones();
    const damageMultiplier = 1 + playerBuild.baseDamageBonus + 0.15 * (playerBuild.perks.power || 0) + ((input.actionDown || input.actionPressed) && playerBuild.perks.focus ? 0.2 : 0) + (now < overdriveUntil ? 0.5 : 0);
    specs.forEach((spec, index) => {
      const origin = weapon.drones ? drones[index % drones.length] : ship;
      const volleyBias = weapon.volleyAngleBias
        ? ((volleyId % 2 ? -1 : 1) * weapon.volleyAngleBias * Math.PI) / 180
        : 0;
      const offset = weapon.drones ? 0 : spec.muzzleOffset;
      const shot = makeShot(
        {
          ...spec,
          angle: spec.angle + volleyBias,
          weave: spec.weave && {
            ...spec.weave,
            phase: spec.weave.phase + volleyId * (weapon.weavePhaseStep || 0),
          },
        },
        { x: origin.x + offset, y: origin.y - 14 },
        weapon.id,
        damageMultiplier,
      );
      if (spec.delay) deferredShots.push({ fireAt: now + spec.delay, shot });
      else shots.push(shot);
    });
    play("shoot");
  }
  function hurt() {
    if (sandboxInvincible || now < invuln) return;
    bullets = [];
    if (shield) {
      shield = false;
      invuln = now + 0.5;
      if (shieldFx.length < 4) shieldFx.push({ x: ship.x, y: ship.y, age: 0 });
      play("shield");
      return;
    }
    lives--;
    shield = false;
    invuln = now + 1.5;
    play("death");
    if (lives <= 0) {
      lives = 0;
      finish();
    }
  }
  function special() {
    if (boss?.mode === "patience") return false;
    if (charge < 1 || abilityActive()) return false;
    charge--;
    if (playerBuild.abilityId === "barrier") {
      barrierUntil = now + 3;
      invuln = Math.max(invuln, barrierUntil);
    } else if (playerBuild.abilityId === "overdrive") {
      overdriveUntil = now + 5;
    } else {
      bullets = [];
      attacks = [];
      scheduledBullets = [];
      emitters = [];
      hazards = [];
      pulse = 0.5;
      invuln = Math.max(invuln, now + 0.5);
      enemies.forEach((e) => {
        if (e.active === false || e.dead) return;
        damageEnemy(e, e.type === "miniboss" || e.type === "majorboss" ? 5 : 3, { abilityKill: true, allowBurst: false });
      });
    }
    play("special");
    return true;
  }
  function beginBossGate(e) {
    e.phase++;
    clearThreats();
    e.patternBag = [];
    e.combo = null;
    e.comboId = null;
    e.beat = 0;
    e.cool = 0.35;
    e.destination = { x: e.x, y: e.y };
    if (e.type === "majorboss" && e.phase === 4) {
      e.mode = "patience";
      const timeline = patienceTimelineForWave(wave);
      e.modeDuration = timeline[timeline.length - 1].end;
      e.modeEndsAt = now + e.modeDuration;
      e.patienceStartedAt = now;
      e.patienceStage = 0;
      e.patienceSegment = -1;
      e.patienceOrbitAngle = null;
      e.patienceStyle = timeline[0].style;
      e.patienceNextAt = now;
      e.recovery = 0;
      shots = [];
      deferredShots = [];
      clearFx();
      pulse = 0;
      barrierUntil = 0;
      overdriveUntil = 0;
      addPickupFx(e.x, e.y, "PATIENCE · DODGE", "#8cf0ff");
      return;
    }
    e.mode =
      e.type === "miniboss"
        ? "frenzy"
        : e.phase === 2
          ? "mutation"
          : "rage";
    e.modeDuration = 0;
    e.modeEndsAt = 0;
    e.patienceStyle = null;
    e.recovery = 0.75;
    addPickupFx(
      e.x,
      e.y,
      e.mode.toUpperCase(),
      e.mode === "rage" ? "#ff7b72" : "#ffdd72",
    );
  }
  function dropBossReward(e) {
    if (!shield) addDrop("shield", e.x, e.y);
    else if (charge < 2) addDrop("charge", e.x, e.y);
    else addDrop(now < rapid ? "star" : "rapid", e.x, e.y);
  }
  function completeBossSurvival(e) {
    if (!e || e.dead || e.mode !== "patience") return;
    e.hp = 0;
    kill(e, false, e.maxHp * 0.1, true);
    dropBossReward(e);
  }
  function damageEnemy(e, amount, { abilityKill = false, allowBurst = true } = {}) {
    if (e.dead || !Number.isFinite(amount) || amount <= 0) return false;
    const bossType = e.type === "miniboss" || e.type === "majorboss";
    if (bossType && !bossVulnerable(e)) {
      addGuardFx(e);
      return false;
    }
    const gate =
      e.type === "majorboss" && e.phase < 4
        ? Math.round(e.maxHp * [0.65, 0.35, 0.1][e.phase - 1])
        : e.type === "miniboss" && e.phase < 2
          ? e.maxHp * 0.5
          : null;
    if (gate !== null && e.hp - amount <= gate) {
      e.hp = gate;
      beginBossGate(e);
      return true;
    }
    e.hp -= amount;
    if (e.hp <= 0) {
      kill(e, abilityKill, amount, allowBurst);
      if (bossType) dropBossReward(e);
    }
    return true;
  }
  function take(kind) {
    let reward = kind.toUpperCase();
    if (kind === "rapid") rapid = now + RAPID_SECONDS;
    if (kind === "shield") {
      if (!shield) {
        shield = true;
        if (shieldFx.length < 4) shieldFx.push({ x: ship.x, y: ship.y, age: 0 });
      }
      else {
        score += 5;
        reward = "+5";
      }
    }
    if (kind === "star") score += 10;
    if (kind === "charge") charge = Math.min(2, charge + 1);
    addPickupFx(
      ship.x,
      ship.y,
      kind === "star" ? "+10" : reward,
      { rapid: "#8cf0ff", shield: "#8fa8ff", star: "#fff", charge: "#c6fff4" }[
        kind
      ],
    );
  }
  function updateDrops(dt) {
    for (let i = drops.length - 1; i >= 0; i--) {
      let z = drops[i];
      z.y += 65 * dt;
      const pickupRadius = 120 * (1 + 0.25 * Math.min(3, playerBuild.perks.magnet || 0));
      if (dist(z, ship) < pickupRadius) {
        z.x += (ship.x - z.x) * dt * 5;
        z.y += (ship.y - z.y) * dt * 5;
      }
      if (dist(z, ship) < z.r + ship.r + 3) {
        take(z.kind);
        drops.splice(i, 1);
      } else if (z.y > H + 20) drops.splice(i, 1);
    }
  }
  function capturePreviousPositions() {
    if (ship) {
      ship.prevX = ship.x;
      ship.prevY = ship.y;
    }
    enemies.forEach((e) => {
      e.prevX = e.x;
      e.prevY = e.y;
    });
    shots.forEach((s) => {
      s.prevX = s.x;
      s.prevY = s.y;
    });
    bullets.forEach((b) => {
      b.prevX = b.x;
      b.prevY = b.y;
    });
  }
  function moveShip(dt, input) {
    let x = cap(+input.moveX || 0, -1, 1),
      y = cap(+input.moveY || 0, -1, 1),
      d = Math.hypot(x, y);
    if (d > 1) {
      x /= d;
      y /= d;
    }
    const speedBonus = 1 + 0.1 * Math.min(2, playerBuild.perks.thrusters || 0);
    const speed = (input.actionDown || input.actionPressed ? 210 : 380) * speedBonus;
    ship.x = cap(ship.x + x * speed * dt, 42, W - 42);
    ship.y = cap(ship.y + y * speed * dt, 105, H - 45);
  }
  function publicPendingReward() {
    if (!pendingReward) return null;
    return {
      id: pendingReward.id,
      kind: pendingReward.kind,
      context: pendingReward.context,
      wave: pendingReward.wave,
      offers: pendingReward.cards.map(publicCard),
      rerollsRemaining: pendingReward.rerollsRemaining,
      canSkip: pendingReward.canSkip,
    };
  }
  function requestReward(kind, rewardWave, prepared) {
    if (sandbox && kind !== "tutorial") return;
    if (pendingReward) return;
    const context = kind === "tutorial" ? "tutorial" : "scored";
    const reward = prepared || rewardForWave({ wave: rewardWave, build: playerBuild, lives, shield, random: rewardRnd, context });
    if (!reward) return;
    pendingReward = {
      id: `reward-${++rewardSerial}`,
      kind: reward.kind,
      context,
      wave: rewardWave,
      cards: reward.cards,
      rerollsRemaining: reward.rerollsRemaining,
      canSkip: reward.canSkip,
    };
    emit({ type: "upgradeRequested" });
  }
  function startBreather() {
    wave++;
    breather = 2;
  }
  function resolveReward(card) {
    if (!pendingReward) return false;
    const context = pendingReward.context;
    if (card) card.apply(playerBuild, { get lives() { return lives; }, set lives(value) { lives = value; }, get shield() { return shield; }, set shield(value) { shield = value; } });
    pendingReward = null;
    if (context === "tutorial") {
      tutorialTargetHit = true;
      succeedTutorialStep();
    } else startBreather();
    return true;
  }
  function chooseUpgrade(cardId) {
    if (!pendingReward || typeof cardId !== "string") return false;
    const card = pendingReward.cards.find((entry) => entry.id === cardId);
    return card ? resolveReward(card) : false;
  }
  function rerollUpgrade() {
    if (!pendingReward || pendingReward.kind !== "draft" || pendingReward.rerollsRemaining < 1) return false;
    const reward = rewardForWave({ wave: pendingReward.wave, build: playerBuild, lives, shield, random: rewardRnd, context: pendingReward.context });
    pendingReward.cards = reward.cards;
    pendingReward.rerollsRemaining--;
    return true;
  }
  function skipUpgrade() {
    if (!pendingReward || !pendingReward.canSkip) return false;
    if (pendingReward.kind === "evolution") playerBuild.evolutionDeclines++;
    return resolveReward(null);
  }
  function setupTutorialStep() {
    // Each attempt starts from a readable, deterministic arrangement.
    ship.x = 640;
    ship.y = 610;
    shots = [];
    bullets = [];
    scheduledBullets = [];
    emitters = [];
    hazards = [];
    attacks = [];
    drops = [];
    enemies = [];
    tutorialTargetHit = tutorialPickupTaken = false;
    tutorialDodgeFired = false;
    tutorialDodgePending = false;
    latch = false;
    charge = 1;
    if (tutorialStep === 0) {
      const target = add("drifter", 900, 245, { vx: 0, cool: 99 });
      target.hp = target.maxHp = 99;
    } else if (tutorialStep === 1) {
      tutorialDodgePending = true;
    } else if (tutorialStep === 2) {
      requestReward("tutorial", 0);
    } else if (tutorialStep === 3) {
      rapid = 0;
      drops.push({ kind: "rapid", x: 810, y: 510, r: 12 });
    } else {
      bullets = [
        b(ship.x - 75, ship.y - 180, 0, 160),
        b(ship.x, ship.y - 210, 0, 160),
        b(ship.x + 75, ship.y - 180, 0, 160),
      ];
    }
  }
  function tutorialState() {
    const lesson = TUTORIAL_LESSONS[tutorialStep];
    const completed = tutorialStep + (tutorialStatus === "success" ? 1 : 0);
    return {
      step: tutorialStep,
      lessonId: lesson.id,
      status: tutorialStatus,
      objective: lesson.objective,
      hint:
        now < tutorialRetryHintUntil
          ? tutorialRetryHint
          : tutorialElapsed >= 8 && tutorialStatus === "active"
            ? lesson.hint
            : "",
      progress: { current: completed, total: TUTORIAL_LESSONS.length },
      canContinue: tutorialStatus === "success" && !tutorialAwaitContinueRelease,
      finishing: false,
    };
  }
  function retryTutorialStep(hint) {
    tutorialStatus = "active";
    tutorialAwaitContinueRelease = false;
    tutorialRetryUntil = now + 0.6;
    tutorialRetryHint = hint;
    tutorialRetryHintUntil = now + 1.5;
    setupTutorialStep();
  }
  function succeedTutorialStep() {
    tutorialStatus = "success";
    tutorialAwaitContinueRelease = true;
  }
  function advanceTutorialStep() {
    tutorialStep += 1;
    tutorialElapsed = 0;
    tutorialStatus = "active";
    tutorialAwaitContinueRelease = false;
    tutorialRetryUntil = tutorialRetryHintUntil = 0;
    tutorialRetryHint = "";
    setupTutorialStep();
  }
  function updateTutorialProjectiles(dt) {
    shots.forEach((s) => {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.weave) {
        s.weave.age += dt;
        const nextOffset = s.weave.amplitude * Math.sin(s.weave.age * s.weave.frequency + s.weave.phase);
        const change = nextOffset - s.weave.offset;
        const speed = Math.hypot(s.vx, s.vy) || 1;
        s.x += (-s.vy / speed) * change;
        s.y += (s.vx / speed) * change;
        s.weave.offset = nextOffset;
      }
    });
    shots = shots.filter((s) => s.y > -20 && s.x > -20 && s.x < W + 20);
    bullets.forEach((q) => {
      q.x += q.vx * dt;
      q.y += q.vy * dt;
    });
    bullets = bullets.filter(
      (q) => q.y > -25 && q.y < H + 25 && q.x > -30 && q.x < W + 30,
    );
  }
  function updateTutorial(dt, input) {
    if (tutorialStatus === "success") {
      if (!input.actionDown && !input.actionPressed)
        tutorialAwaitContinueRelease = false;
      if (!tutorialAwaitContinueRelease && input.actionPressed) {
        if (tutorialStep + 1 === TUTORIAL_LESSONS.length) {
          phase = "ended";
          if (!tutorialCompleteEmitted) {
            tutorialCompleteEmitted = true;
            emit({ type: "tutorialComplete" });
          }
        } else advanceTutorialStep();
      }
      return;
    }
    tutorialElapsed += dt;
    if (now < tutorialRetryUntil) return;
    if (tutorialDodgePending) {
      tutorialDodgePending = false;
      reserveAttack({
        sourceId: "tutorial-dodge",
        committed: true,
        kind: "tutorial-dodge",
        warning: 0.7,
        origin: { x: ship.x, y: 180 },
        target: { x: ship.x, y: ship.y },
        pattern: [b(ship.x, 180, 0, 220)],
      });
    }
    moveShip(dt, input);
    fire();
    updateAttacks();
    updateTutorialProjectiles(dt);
    const specialInput = !!(input.specialPressed || input.devKeyX);
    const hadBulletsBeforePulse = bullets.length > 0;
    const pulsed = specialInput && !latch && special();
    latch = specialInput;
    if (tutorialStep === 0) {
      const target = enemies[0];
      for (let i = shots.length - 1; i >= 0; i--)
        if (target && dist(shots[i], target) < shots[i].r + target.r) {
          addHitFx(shots[i].x, shots[i].y, target.color);
          shots.splice(i, 1);
          tutorialTargetHit = true;
        }
    } else if (tutorialStep === 1) {
      tutorialDodgeFired ||= bullets.length > 0;
      if (bullets.some((q) => dist(q, ship) < q.r + ship.r)) {
        retryTutorialStep("Try again: move out of the amber lane.");
        return;
      }
      if (
        tutorialDodgeFired &&
        bullets.some((q) => q.y > ship.y + ship.r + q.r)
      )
        tutorialTargetHit = true;
    } else if (tutorialStep === 3) {
      updateDrops(dt);
      tutorialPickupTaken = now < rapid;
    } else if (tutorialStep === 4) {
      if (pulsed && hadBulletsBeforePulse && bullets.length === 0)
        tutorialTargetHit = true;
    }
    if (
      (tutorialStep === 1 && tutorialDodgeFired && !attacks.length && !bullets.length) ||
      (tutorialStep === 3 && !tutorialPickupTaken && !drops.length) ||
      (tutorialStep === 4 && !tutorialTargetHit && !bullets.length)
    ) {
      retryTutorialStep(
        [
          "",
          "Try again: move out of the amber lane.",
          "",
          "Missed it? Follow the rapid-fire marker.",
          "Try X while the bullets are visible.",
        ][tutorialStep],
      );
      return;
    }
    if (
      tutorialTargetHit ||
      tutorialPickupTaken
    )
      succeedTutorialStep();
  }
  function update(dt, input) {
    capturePreviousPositions();
    updateFx(dt);
    pulse = Math.max(0, pulse - dt);
    if (sessionKind === "tutorial") {
      updateTutorial(dt, input);
      return;
    }
    updateAttacks();
    updateScheduledBullets();
    updateDrops(dt);
    if (breather) {
      moveShip(dt, input);
      breather -= dt;
      if (breather <= 0) {
        breather = 0;
        spawnWave();
      }
      return;
    }
    moveShip(dt, input);
    updateAreas();
    let sp = !!(input.specialPressed || input.devKeyX);
    if (sp && !latch) special();
    latch = sp;
    fire(input);
    updateDrones();
    for (let i = deferredShots.length - 1; i >= 0; i--) {
      if (deferredShots[i].fireAt <= now) {
        shots.push(deferredShots[i].shot);
        deferredShots.splice(i, 1);
      }
    }
    shots.forEach((s) => {
      if (refreshMotion() && s.trailLength > 0) {
        (s.trail ||= []).push({ x: s.x, y: s.y });
        if (s.trail.length > s.trailLength) s.trail.shift();
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.weave) {
        s.weave.age += dt;
        const nextOffset = s.weave.amplitude * Math.sin(s.weave.age * s.weave.frequency + s.weave.phase);
        const change = nextOffset - s.weave.offset;
        const speed = Math.hypot(s.vx, s.vy) || 1;
        s.x += (-s.vy / speed) * change;
        s.y += (s.vx / speed) * change;
        s.weave.offset = nextOffset;
      }
      s.ttl -= dt;
      if (s.homing) {
        let target = null, nearestSquared = Infinity;
        for (const enemy of enemies) {
          if (enemy.dead || enemy.active === false || s.hitIds.has(enemy.id)) continue;
          const dx = s.x - enemy.x, dy = s.y - enemy.y, squared = dx * dx + dy * dy;
          if (squared < nearestSquared) { nearestSquared = squared; target = enemy; }
        }
        if (target) {
          const desired = Math.atan2(target.y - s.y, target.x - s.x);
          const current = Math.atan2(s.vy, s.vx);
          const difference = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
          const heading = current + cap(difference, -s.turnRate * dt, s.turnRate * dt);
          s.vx = Math.cos(heading) * s.speed;
          s.vy = Math.sin(heading) * s.speed;
        }
      }
      s.heading = Math.atan2(s.vy, s.vx);
    });
    shots = shots.filter((s) => s.ttl > 0 && s.y > -20 && s.y < H + 20 && s.x > -20 && s.x < W + 20);
    bullets.forEach((q) => {
      q.x += q.vx * dt;
      q.y += q.vy * dt;
    });
    bullets = bullets.filter(
      (q) => q.y > -25 && q.y < H + 25 && q.x > -30 && q.x < W + 30,
    );
    enemies.forEach((e) => {
      if (e.dead) return;
      if (e.active === false) return;
      if (e.type === "miniboss" || e.type === "majorboss") {
        if (e.mode === "patience") {
          updateBossPatience(dt);
          return;
        }
        if (e.recovery > 0) {
          e.recovery = Math.max(0, e.recovery - dt);
          return;
        }
        const dx = e.destination.x - e.x,
          dy = e.destination.y - e.y,
          distance = Math.hypot(dx, dy);
        if (distance > 0) {
          const step = Math.min(distance, bossMovementSpeed(e.mode) * dt);
          e.x += (dx / distance) * step;
          e.y += (dy / distance) * step;
        }
        bossFire(dt);
        return;
      }
      if (attacks.some((a) => a.sourceId === e.id)) return;
      if (e.type === "orbiter") {
        e.motionPhase += dt * 1.1 * e.motionDirection;
        e.x = cap(e.anchorX + Math.cos(e.motionPhase) * 55, 95, W - 95);
        e.y = cap(e.anchorY + Math.sin(e.motionPhase) * 24, 70, 245);
        enemyFire(e, dt);
        return;
      }
      if (e.type === "skirmisher") {
        e.motionPhase += dt * 5;
        e.x += e.vx * 1.35 * dt;
        if (e.x < e.anchorX - 70 || e.x > e.anchorX + 70) e.vx *= -1;
        e.x = cap(e.x, Math.max(95, e.anchorX - 72), Math.min(W - 95, e.anchorX + 72));
        e.y = e.anchorY + Math.sin(e.motionPhase) * 18;
        enemyFire(e, dt);
        return;
      }
      e.x += e.vx * dt;
      if (e.x < 95 || e.x > W - 95) e.vx *= -1;
      if (e.type === "diver") {
        if (e.diving) {
          e.y += e.vy * dt;
        } else {
          e.dive -= dt;
          if (e.dive <= 0) {
            const reserved = reserveAttack({
              source: e,
              kind: "dive",
              warning: 0.9,
              origin: { x: e.x, y: e.y },
              target: { x: e.x, y: H + 35 },
              pattern: [],
              onFire: (diver) => {
                if (!diver) return;
                diver.diving = true;
                diver.vx = 0;
                diver.vy = 115;
              },
            });
            e.dive = reserved ? 3.5 : 0;
          }
        }
        if (e.y > H + 35) {
          e.dead = true;
          return;
        }
      }
      if (e.type !== "diver" || !e.diving) enemyFire(e, dt);
    });
    updateAttacks();
    updateScheduledBullets();
    const collisionShots = shots;
    for (let i = collisionShots.length - 1; i >= 0; i--) {
      const s = collisionShots[i];
      const hit = enemies.find((e) => !e.dead && e.active !== false && !s.hitIds.has(e.id) && dist(s, e) < s.r + e.r);
      if (!hit) continue;
      s.hitIds.add(hit.id);
      addHitFx(s.x, s.y, hit.color);
      const primaryDamaged = damageEnemy(hit, s.damage);
      // A boss gate can atomically clear every shot (especially entering
      // Patience). Do not inspect the stale volley or create impact effects.
      if (shots !== collisionShots) break;
      if (primaryDamaged && s.splash && !s.splash.used) {
        s.splash.used = true;
        addBlastFx(hit.x, hit.y, s.splash.radius);
        enemies.filter((other) => !other.dead && other.active !== false && other !== hit && !s.hitIds.has(other.id) && dist(hit, other) <= s.splash.radius + other.r)
          .sort((a, b) => dist(hit, a) - dist(hit, b)).slice(0, s.splash.targets)
          .forEach((other) => {
            s.hitIds.add(other.id);
            damageEnemy(other, s.damage * s.splash.ratio, { allowBurst: false });
          });
      }
      const chain = weaponById(s.weaponId).chain;
      if (chain) {
        let relayFrom = hit;
        for (let hop = 0; hop < chain.targets; hop++) {
          const candidates = enemies
            .filter((other) => !other.dead && other.active !== false && !s.hitIds.has(other.id) && dist(relayFrom, other) <= chain.radius)
            .sort((a, b) => dist(relayFrom, a) - dist(relayFrom, b));
          const next = candidates[0];
          if (!next) break;
          s.hitIds.add(next.id);
          if (chainFx.length < 12) chainFx.push({ id: `${s.id}:${hop}:${next.id}`, fromX: relayFrom.x, fromY: relayFrom.y, toX: next.x, toY: next.y, age: 0 });
          damageEnemy(next, s.damage * chain.ratio, { allowBurst: false });
          if (chain.relay) relayFrom = next;
        }
      }
      s.pierce--;
      if (s.pierce <= 0) shots.splice(i, 1);
    }
    enemies = enemies.filter((e) => !e.dead);
    for (let i = bullets.length - 1; i >= 0; i--)
      if (dist(bullets[i], ship) < bullets[i].r + ship.r) {
        bullets.splice(i, 1);
        hurt();
        break;
      }
    if (phase !== "playing") return;
    if (enemies.some((e) => e.active !== false && dist(e, ship) < e.r + ship.r))
      hurt();
    if (
      !enemies.some((e) => e.active !== false) &&
      enemies.some((e) => e.active === false) &&
      !groupDelay
    ) {
      groupDelay = 1;
      clearThreats();
    }
    if (groupDelay) {
      groupDelay -= dt;
      if (groupDelay <= 0) {
        const next = enemies.findIndex((e) => e.active === false);
        enemies.slice(next, next + groupSize).forEach((e) => (e.active = true));
        groupDelay = 0;
      }
    }
    if (!enemies.length) {
      score += wave * 25;
      clearThreats();
      shots = [];
      deferredShots = [];
      const clearedWave = wave;
      const milestone = clearedWave === 3 || (clearedWave >= 5 && clearedWave % 5 === 0);
      if (milestone) {
        drops.forEach((drop) => take(drop.kind));
        drops = [];
      }
      const reward = sandbox
        ? null
        : rewardForWave({ wave: clearedWave, build: playerBuild, lives, shield, random: rewardRnd });
      if (reward) requestReward(reward.kind, clearedWave, reward);
      else startBreather();
      play("clear");
    }
  }
  function step(dt, input = {}) {
    if (phase !== "playing" || paused || pendingReward) return snapshot();
    let z = Math.min(TICK, Math.max(0, Number.isFinite(dt) ? dt : TICK));
    now += z;
    update(z, input);
    return snapshot();
  }
  function sandboxConfig(config) {
    if (!config || typeof config !== "object" || Array.isArray(config)) return null;
    const allowed = new Set([
      "weaponId",
      "abilityId",
      "perks",
      "wave",
      "invincible",
      "bossPhase",
      "bossPattern",
    ]);
    if (Object.keys(config).some((key) => !allowed.has(key))) return null;
    const has = (key) => Object.prototype.hasOwnProperty.call(config, key);
    const next = {
      weaponId: playerBuild.weaponId,
      abilityId: playerBuild.abilityId,
      perks: playerBuild.perks,
      baseDamageBonus: playerBuild.baseDamageBonus,
      invincible: sandboxInvincible,
    };
    if (has("weaponId")) {
      if (typeof config.weaponId !== "string" || !Object.hasOwn(WEAPONS, config.weaponId)) return null;
      next.weaponId = config.weaponId;
    }
    if (has("abilityId")) {
      if (typeof config.abilityId !== "string" || !Object.hasOwn(ABILITIES, config.abilityId)) return null;
      next.abilityId = config.abilityId;
    }
    if (has("perks")) {
      if (!config.perks || typeof config.perks !== "object" || Array.isArray(config.perks)) return null;
      next.perks = {};
      for (const [id, rank] of Object.entries(config.perks)) {
        if (!Object.hasOwn(PERKS, id) || !SANDBOX_PERKS.has(id)) return null;
        const perk = PERKS[id];
        const maxRank = Math.min(perk?.maxRank ?? -1, SANDBOX_MAX_PERK_RANK);
        if (!Number.isInteger(rank) || rank < 0 || rank > maxRank) return null;
        if (rank > 0) next.perks[id] = rank;
      }
      const currentBreakthrough = playerBuild.perks.breakthrough || 0;
      const nextBreakthrough = next.perks.breakthrough || 0;
      next.baseDamageBonus = Math.max(
        0,
        playerBuild.baseDamageBonus + 0.3 * (nextBreakthrough - currentBreakthrough),
      );
    }
    if (has("wave")) {
      if (!Number.isInteger(config.wave) || config.wave < 1 || config.wave > 1000) return null;
      next.wave = config.wave;
    }
    if (has("invincible")) {
      if (typeof config.invincible !== "boolean") return null;
      next.invincible = config.invincible;
    }
    const encounterWave = next.wave ?? wave;
    const encounter = encounterTypeForWave(encounterWave);
    if (has("bossPhase")) {
      const allowedModes =
        encounter === "majorboss"
          ? new Set(["assault", "mutation", "rage", "patience"])
          : encounter === "miniboss"
            ? new Set(["recon", "frenzy"])
            : null;
      if (!allowedModes?.has(config.bossPhase)) return null;
      next.bossPhase = config.bossPhase;
    }
    if (has("bossPattern")) {
      if (!encounter || !COMBO_IDS.includes(config.bossPattern)) return null;
      next.bossPattern = config.bossPattern;
    }
    return next;
  }
  function restartSandboxWave(nextWave) {
    wave = nextWave;
    breather = 0;
    pendingReward = null;
    enemies = [];
    shots = [];
    deferredShots = [];
    bullets = [];
    scheduledBullets = [];
    emitters = [];
    hazards = [];
    drops = [];
    attacks = [];
    emittedAt = [];
    lastAttack = -99;
    boss = null;
    groupDelay = 0;
    waveCleared = false;
    pulse = 0;
    barrierUntil = overdriveUntil = 0;
    invuln = 0;
    drones = [];
    clearFx();
    spawnWave();
  }
  function configureSandboxBoss(mode, pattern) {
    if (!boss) return;
    const phaseByMode = {
      recon: 1,
      frenzy: 2,
      assault: 1,
      mutation: 2,
      rage: 3,
      patience: 4,
    };
    const healthByMode = {
      recon: 1,
      frenzy: 0.5,
      assault: 1,
      mutation: 0.65,
      rage: 0.35,
      patience: 0.1,
    };
    boss.mode = mode || boss.mode;
    boss.phase = phaseByMode[boss.mode];
    boss.hp = Math.round(boss.maxHp * healthByMode[boss.mode]);
    boss.patternBag = [];
    boss.forcedPattern = pattern || null;
    boss.combo = null;
    boss.comboId = pattern || null;
    boss.beat = 0;
    clearThreats();
    if (boss.mode === "patience") {
      const timeline = patienceTimelineForWave(wave);
      boss.modeDuration = timeline[timeline.length - 1].end;
      boss.modeEndsAt = now + boss.modeDuration;
      boss.patienceStartedAt = now;
      boss.patienceStage = 0;
      boss.patienceSegment = -1;
      boss.patienceOrbitAngle = null;
      boss.patienceStyle = timeline[0].style;
      boss.patienceNextAt = now;
      boss.recovery = 0;
      shots = [];
      deferredShots = [];
      pulse = 0;
      barrierUntil = 0;
      overdriveUntil = 0;
    } else {
      boss.modeDuration = 0;
      boss.modeEndsAt = 0;
      boss.patienceStyle = null;
      boss.recovery = 0.75;
      boss.cool = 0;
    }
  }
  function applySandbox(config) {
    if (!devMode || sessionKind === "tutorial" || phase !== "playing") return false;
    const next = sandboxConfig(config);
    if (!next) return false;
    const weaponChanged = next.weaponId !== playerBuild.weaponId;
    const abilityChanged = next.abilityId !== playerBuild.abilityId;
    const dismissedReward = Boolean(
      pendingReward && pendingReward.context !== "tutorial",
    );
    playerBuild = {
      ...playerBuild,
      weaponId: next.weaponId,
      abilityId: next.abilityId,
      perks: { ...next.perks },
      baseDamageBonus: next.baseDamageBonus,
    };
    sandbox = true;
    sandboxInvincible = next.invincible;
    if (
      next.wave !== undefined ||
      next.bossPhase !== undefined ||
      next.bossPattern !== undefined
    ) {
      restartSandboxWave(next.wave ?? wave);
      if (boss)
        configureSandboxBoss(next.bossPhase || boss.mode, next.bossPattern);
    }
    else {
      if (weaponChanged) {
        deferredShots = [];
        drones = [];
        updateDrones();
      }
      if (abilityChanged) {
        pulse = 0;
        barrierUntil = overdriveUntil = 0;
        invuln = 0;
      }
      if (dismissedReward) {
        pendingReward = null;
        startBreather();
      }
    }
    emit({ type: "sandboxApplied", dismissedReward });
    render();
    return true;
  }
  function shape(x, y, r, n) {
    c.beginPath();
    for (let i = 0; i < n; i++) {
      let a = (i * Math.PI * 2) / n,
        rr = i % 2 ? r * 0.72 : r;
      i
        ? c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
        : c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.closePath();
  }
  function presentationState(alpha = 1) {
    alpha = cap(Number.isFinite(alpha) ? alpha : 1, 0, 1);
    const project = (item) => ({
      ...item,
      x:
        item.prevX === undefined
          ? item.x
          : item.prevX + (item.x - item.prevX) * alpha,
      y:
        item.prevY === undefined
          ? item.y
          : item.prevY + (item.y - item.prevY) * alpha,
    });
    return {
      width: W,
      height: H,
      time: now,
      phase,
      substate: pendingReward ? "reward" : breather ? "breather" : "play",
      hud: {
        score,
        lives,
        wave,
        charge,
        chargeProgress: qualifyingKills,
        chargeRequired: chargeRequirement(),
        weapon: playerBuild.weaponId,
        weaponId: playerBuild.weaponId,
        weaponName: weaponById(playerBuild.weaponId).name,
        abilityId: playerBuild.abilityId,
        abilityName: ABILITIES[playerBuild.abilityId].name,
        abilityCharges: charge,
        abilityChargeProgress: qualifyingKills,
        build: publicBuild(playerBuild),
        shield,
        rapidFire: now < rapid,
        rapidSeconds: Math.max(0, rapid - now),
        barrierSeconds: Math.max(0, barrierUntil - now),
        overdriveSeconds: Math.max(0, overdriveUntil - now),
        pressure: difficultyForWave(wave).pressure,
      },
      ship: ship && { ...project(ship), invulnerable: now < invuln },
      enemies: enemies
        .filter((e) => e.active !== false)
        .map((e) => {
          const attack = attacks.find((a) => a.sourceId === e.id);
          const projected = project(e);
          return {
            id: e.id,
            type: e.type,
            renderType: e.renderType,
            x: projected.x,
            y: projected.y,
            r: e.r,
            hp: e.hp,
            maxHp: e.maxHp,
            phase: e.phase,
            phases: e.phases,
            recovery: e.recovery,
            mode: e.mode,
            modeRemaining: e.mode === "patience" ? Math.max(0, e.modeEndsAt - now) : 0,
            modeDuration: e.mode === "patience" ? e.modeDuration : 0,
            comboId: e.comboId || null,
            beat: e.beat || 0,
            patienceStyle: e.patienceStyle || null,
            vulnerable:
              e.type === "miniboss" || e.type === "majorboss"
                ? bossVulnerable(e)
                : true,
            attackSerial: e.attackSerial,
            lastPattern: e.lastPattern,
            destination: e.destination && { ...e.destination },
            charging: Boolean(attack),
            chargeProgress: attack
              ? cap(1 - (attack.fireAt - now) / attack.warning, 0, 1)
              : 0,
          };
        }),
      shots: shots.map((s) => ({
        id: s.id,
        x: project(s).x,
        y: project(s).y,
        vx: s.vx,
        vy: s.vy,
        heading: Math.atan2(s.vy, s.vx),
        speed: Math.hypot(s.vx, s.vy),
        muzzleOffset: s.muzzleOffset,
        r: s.r,
        damage: s.damage,
        weaponId: s.weaponId,
        style: s.style,
        trail: s.trail,
      })),
      drones: drones.map((drone) => ({ ...drone })),
      hostileBullets: bullets.map((b) => ({
        x: project(b).x,
        y: project(b).y,
        vx: b.vx,
        vy: b.vy,
        r: b.r,
        kind: b.kind || "standard",
      })),
      emitters: emitters.map(publicArea),
      hazards: hazards.map(publicArea),
      drops: drops.map((d) => ({ ...d })),
      pendingReward: publicPendingReward(),
      warnings: attacks.map((a) => ({
        id: a.id,
        enemyId: a.sourceId,
        kind: a.kind,
        fireAt: a.fireAt,
        warning: a.warning,
        origin: { ...a.origin },
        target: a.target && { ...a.target },
        bullets: a.pattern.map((b) => ({
          x: b.x,
          y: b.y,
          vx: b.vx,
          vy: b.vy,
          delay: b.delay || 0,
          r: b.r,
          kind: b.kind || "standard",
        })),
      })),
      effects: {
        pulse,
        hits: hitFx.map((p) => ({ ...p })),
        pickups: pickupFx.map((p) => ({ ...p })),
        shields: shieldFx.map((p) => ({ ...p })),
        guards: guardFx.map((p) => ({ ...p })),
        deaths: deathFx.map((p) => ({ ...p })),
        blasts: blastFx.map((p) => ({ ...p })),
        chainLinks: chainFx.map((p) => ({ id: p.id, from: { x: p.fromX, y: p.fromY }, to: { x: p.toX, y: p.toY }, age: p.age })),
      },
      tutorial: sessionKind === "tutorial" ? tutorialState() : null,
      reducedMotion: !motionAllowed(),
    };
  }
  function render(alpha = 1) {
    if (typeof presentation === "function") {
      presentation(presentationState(alpha));
      return;
    }
    const moving = refreshMotion();
    let w = canvas.width || W,
      h = canvas.height || H;
    c.clearRect(0, 0, w, h);
    let g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#071b2a");
    g.addColorStop(1, "#102536");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.save();
    c.scale(w / W, h / H);
    drawCellBackground(c, {
      width: W,
      height: H,
      scroll: moving ? now * 0.3 : 0,
    });
    c.strokeStyle = "#1d5262";
    for (let y = 95; y < H; y += 72) {
      c.beginPath();
      c.moveTo(30, y + Math.sin(now + y) * 4);
      c.lineTo(W - 30, y);
      c.stroke();
    }
    attacks.forEach((a) => {
      c.save();
      c.strokeStyle = "#ffd879";
      c.lineWidth = 3;
      c.globalAlpha = 0.9;
      if (c.setLineDash) c.setLineDash([9, 8]);
      c.beginPath();
      if (a.kind === "dive") {
        c.moveTo(a.origin.x, a.origin.y);
        c.lineTo(a.target.x, a.target.y);
      } else
        a.pattern.forEach((q) => {
          c.moveTo(q.x, q.y);
          c.lineTo(q.x + q.vx * 3, q.y + q.vy * 3);
        });
      c.stroke();
      if (c.setLineDash) c.setLineDash([]);
      c.beginPath();
      c.arc(a.origin.x, a.origin.y, 23, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    });
    if (pulse && ship) {
      c.save();
      c.strokeStyle = "#c6fff4";
      c.lineWidth = 5;
      c.globalAlpha = pulse * 2;
      c.beginPath();
      c.arc(ship.x, ship.y, moving ? (0.5 - pulse) * 650 : 40, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    }
    c.save();
    chainFx.forEach((arc) => {
      c.globalAlpha = Math.max(0, 1 - arc.age / 0.18);
      c.strokeStyle = "#9fffe3";
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(arc.fromX, arc.fromY);
      c.lineTo(arc.toX, arc.toY);
      c.stroke();
    });
    hitFx.forEach((p) => {
      c.globalAlpha = Math.max(0, 1 - p.age / 0.18);
      c.fillStyle = p.color;
      c.beginPath();
      c.arc(p.x, p.y, 4, 0, Math.PI * 2);
      c.fill();
    });
    shieldFx.forEach((p) => {
      const t = p.age / 0.16;
      c.globalAlpha = 1 - t;
      c.strokeStyle = "#b8dcff";
      c.lineWidth = 4;
      c.beginPath();
      c.arc(p.x, p.y, moving ? 18 + t * 42 : 30, 0, Math.PI * 2);
      c.stroke();
    });
    guardFx.forEach((p) => {
      const t = p.age / 0.32;
      c.globalAlpha = Math.max(0, 1 - t);
      c.strokeStyle = p.mode === "patience" ? "#8cf0ff" : "#ffdd72";
      c.lineWidth = 5;
      c.beginPath();
      c.arc(p.x, p.y, moving ? 64 + t * 20 : 72, 0, Math.PI * 2);
      c.stroke();
    });
    c.restore();
    enemies.forEach((e) => {
      if (e.active === false) return;
      drawSprite(c, e.renderType || e.type, e.x, e.y, e.r * 2 + 8, e.r * 2 + 8);
      if (e.type === "miniboss" || e.type === "majorboss") {
        c.fillStyle = "#26132a";
        c.fillRect(e.x - 90, e.y - 84, 180, 10);
        c.fillStyle = "#ffdd72";
        c.fillRect(e.x - 90, e.y - 84, (180 * Math.max(0, e.hp)) / e.maxHp, 10);
        c.font = "700 15px system-ui";
        c.fillStyle = "#fff5d7";
        c.fillText(
          `${e.type === "majorboss" ? "MAJOR BOSS" : "MINIBOSS"} · PHASE ${e.phase}/${e.phases}`,
          e.x - 90,
          e.y - 95,
        );
      }
    });
    shots.forEach((s) => {
      if (moving && s.trail?.length > 1) {
        c.globalAlpha = 0.28;
        c.strokeStyle = "#8cf0ff";
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(s.trail[0].x, s.trail[0].y);
        s.trail.slice(1).forEach((p) => c.lineTo(p.x, p.y));
        c.stroke();
        c.globalAlpha = 1;
      }
      c.strokeStyle = "#e8fff7";
      c.lineWidth = 4;
      c.beginPath();
      c.moveTo(s.x, s.y + 8);
      c.lineTo(s.x, s.y - 8);
      c.stroke();
    });
    [...emitters, ...hazards].forEach((area) => {
      const view = publicArea(area);
      c.save();
      c.globalAlpha = view.state === "expiry" ? 1 - view.progress : 0.35 + view.progress * 0.45;
      c.strokeStyle = emitters.includes(area) ? "#8cf0ff" : "#ffcf72";
      c.fillStyle = emitters.includes(area) ? "#8cf0ff22" : "#ff6f9130";
      c.lineWidth = view.state === "active" ? 4 : 2;
      if (view.state === "telegraph" && c.setLineDash) c.setLineDash([8, 7]);
      c.beginPath();
      c.arc(view.x, view.y, view.radius, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      if (c.setLineDash) c.setLineDash([]);
      c.restore();
    });
    bullets.forEach((q) => {
      c.fillStyle = "#591d43";
      c.fillRect(q.x - 7, q.y - 7, 14, 14);
      c.fillStyle = "#ff91ae";
      c.fillRect(q.x - 5, q.y - 5, 10, 10);
      c.fillStyle = "#fff1dd";
      c.fillRect(q.x - 2, q.y - 3, 3, 3);
    });
    drops.forEach((z) => {
      c.fillStyle = "#13253d";
      c.fillRect(z.x - 18, z.y - 18, 36, 36);
      c.strokeStyle = "#9cebd6";
      c.lineWidth = 2;
      c.strokeRect(z.x - 18, z.y - 18, 36, 36);
      drawSprite(c, z.kind, z.x, z.y, 28, 28);
      c.fillStyle = "#fff7d1";
      c.font = "700 12px system-ui";
      const label =
        {
          rapid: "RAPID",
          shield: "SHIELD",
          star: "BONUS",
          pulse: "PULSE",
          charge: "CHARGE",
        }[z.kind] || "BONUS";
      c.fillText(label, z.x - label.length * 3.6, z.y + 32);
    });
    pickupFx.forEach((p) => {
      const t = p.age / 0.65;
      c.globalAlpha = 1 - t;
      c.strokeStyle = p.color;
      c.lineWidth = 3;
      c.beginPath();
      c.arc(p.x, p.y, moving ? 14 + t * 28 : 24, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = p.color;
      c.font = "800 15px system-ui";
      c.fillText(p.text, p.x + 18, p.y + (moving ? -t * 20 : 0));
    });
    c.globalAlpha = 1;
    if (ship) {
      c.globalAlpha =
        now < invuln ? (moving ? 0.45 + 0.45 * Math.sin(now * 25) : 0.65) : 1;
      if (shield) {
        c.strokeStyle = "#8fa8ff";
        c.lineWidth = 2.5;
        c.globalAlpha = moving ? 0.7 + 0.2 * Math.sin(now * 7) : 0.8;
        c.beginPath();
        c.arc(ship.x, ship.y, 23, 0, Math.PI * 2);
        c.stroke();
      }
      drawSprite(c, "emitter", ship.x, ship.y, 38, 38);
      c.fillStyle = "#f8ffef";
      c.beginPath();
      c.arc(ship.x, ship.y, ship.r, 0, 7);
      c.fill();
      c.globalAlpha = 1;
    }
    c.restore();
    c.font = "700 20px system-ui";
    c.fillStyle = "#f3fbff";
    c.fillText(`SCORE ${String(score).padStart(5, "0")}`, 24, 32);
    c.fillStyle = "#80f3e8";
    c.fillText(`WAVE ${wave}`, w / 2 - 45, 32);
    c.fillStyle = "#ff9abb";
    c.fillText(
      `LIVES ${"●".repeat(lives)}${"○".repeat(3 - lives)}`,
      w - 145,
      32,
    );
    c.fillStyle = "#ffe372";
    c.fillText(
      `X ${ABILITIES[playerBuild.abilityId].name.toUpperCase()} ${charge}/2  •  CHARGE ${Math.floor(qualifyingKills)}/${Math.ceil(chargeRequirement())}  •  ${weaponById(playerBuild.weaponId).name.toUpperCase()}${shield ? "  •  SHIELD" : ""}${now < rapid ? `  •  RAPID ${Math.ceil(rapid - now)}s` : ""}`,
      24,
      62,
    );
    if (sessionKind === "tutorial") {
      const tutorial = tutorialState();
      c.fillStyle = "#030910df";
      c.fillRect(w / 2 - 275, 92, 550, 74);
      c.strokeStyle = "#80f3e8";
      c.lineWidth = 2;
      c.strokeRect(w / 2 - 275, 92, 550, 74);
      c.textAlign = "center";
      c.fillStyle = "#f3fbff";
      c.font = "900 21px system-ui";
      c.fillText(
        `PRACTICE ${tutorial.progress.current}/${tutorial.progress.total} · ${tutorial.lessonId.toUpperCase()}`,
        w / 2,
        122,
      );
      c.font = "700 14px system-ui";
      c.fillStyle = "#b8dcff";
      c.fillText(
        tutorial.status === "success"
          ? "SUCCESS · RELEASE A, THEN PRESS A TO CONTINUE"
          : tutorial.hint || tutorial.objective,
        w / 2,
        148,
      );
      c.textAlign = "left";
    }
  }
  function snapshot() {
    let types = {};
    enemies.forEach((e) => (types[e.type] = (types[e.type] || 0) + 1));
    return {
      phase,
      tutorial:
        sessionKind === "tutorial"
          ? {
              ...tutorialState(),
              elapsed: tutorialElapsed,
              shots: shots.map(({ x, y }) => ({ x, y })),
            }
          : null,
      substate: pendingReward ? "reward" : breather ? "breather" : "play",
      score,
      lives,
      wave,
      sandbox,
      sandboxInvincible,
      pressure: difficultyForWave(wave).pressure,
      paused,
      reducedMotion: !motionAllowed(),
      ship: ship && {
        x: ship.x,
        y: ship.y,
        r: ship.r,
        invulnerable: now < invuln,
      },
      counts: {
        enemies: enemies.length,
        shots: shots.length,
        hostileBullets: bullets.length,
        powerups: drops.length,
      },
      powerups: drops.map((z) => ({ kind: z.kind, x: z.x, y: z.y })),
      chargeMeter: charge,
      chargeProgress: qualifyingKills,
      chargeRequired: chargeRequirement(),
      weapon: playerBuild.weaponId,
      weaponId: playerBuild.weaponId,
      weaponName: weaponById(playerBuild.weaponId).name,
      abilityId: playerBuild.abilityId,
      abilityName: ABILITIES[playerBuild.abilityId].name,
      build: publicBuild(playerBuild),
      pendingReward: publicPendingReward(),
      shield,
      rapidFire: now < rapid,
      rapidSeconds: Math.max(0, rapid - now),
      barrierSeconds: Math.max(0, barrierUntil - now),
      overdriveSeconds: Math.max(0, overdriveUntil - now),
      emitters: emitters.map(publicArea),
      hazards: hazards.map(publicArea),
      scheduler: {
        emittedLast3Seconds: emittedAt.length,
        budget: difficultyForWave(wave).emitBudget,
        activeBulletLimit: difficultyForWave(wave).activeBullets,
        globalBulletLimit: MAXB,
        scheduledCapacity:
          attacks.reduce((sum, attack) => sum + attack.pattern.length, 0) +
          scheduledBullets.length +
          (boss?.combo
            ? boss.combo.beats
                .slice(boss.combo.nextBeat)
                .reduce((sum, beat) => sum + beat.bullets.length, 0)
            : 0),
        threatLayers: new Set(
          hazards
            .filter((area) => areaState(area).state !== "expiry")
            .map((area) => area.layerId),
        ).size,
      },
      warnings: attacks.map((a) => ({
        id: a.id,
        enemyId: a.sourceId,
        kind: a.kind,
        fireAt: a.fireAt,
        warning: a.warning,
        origin: a.origin,
        target: a.target,
        bullets: a.pattern.map((q) => ({
          x: q.x,
          y: q.y,
          vx: q.vx,
          vy: q.vy,
          delay: q.delay || 0,
          r: q.r,
          kind: q.kind || "standard",
        })),
      })),
      enemytypes: types,
      enemies: enemies.map((e) => {
        const attack = attacks.find((a) => a.sourceId === e.id);
        return {
          id: e.id,
          type: e.type,
          renderType: e.renderType,
          x: e.x,
          y: e.y,
          r: e.r,
          hp: e.hp,
          maxHp: e.maxHp,
          phase: e.phase,
          phases: e.phases,
          recovery: e.recovery,
          mode: e.mode,
          modeRemaining: e.mode === "patience" ? Math.max(0, e.modeEndsAt - now) : 0,
          modeDuration: e.mode === "patience" ? e.modeDuration : 0,
          comboId: e.comboId || null,
          beat: e.beat || 0,
          patienceStyle: e.patienceStyle || null,
          vulnerable:
            e.type === "miniboss" || e.type === "majorboss"
              ? bossVulnerable(e)
              : true,
          active: e.active !== false,
          attackSerial: e.attackSerial,
          lastPattern: e.lastPattern,
          destination: e.destination && { ...e.destination },
          charging: Boolean(attack),
          chargeProgress: attack
            ? cap(1 - (attack.fireAt - now) / attack.warning, 0, 1)
            : 0,
        };
      }),
      hostilebullets: bullets.map((q) => ({
        x: q.x,
        y: q.y,
        vx: q.vx,
        vy: q.vy,
        r: q.r,
        kind: q.kind || "standard",
      })),
      shots: shots.map((s) => ({ id: s.id, x: s.x, y: s.y, vx: s.vx, vy: s.vy, heading: Math.atan2(s.vy, s.vx), speed: Math.hypot(s.vx, s.vy), muzzleOffset: s.muzzleOffset, r: s.r, damage: s.damage, weaponId: s.weaponId, style: s.style, pierce: s.pierce, ttl: s.ttl, trail: s.trail?.map((point) => ({ ...point })) || [], hitIds: [...s.hitIds] })),
      drones: drones.map((drone) => ({ ...drone })),
      effects: {
        hitParticles: hitFx.length,
        pickups: pickupFx.length,
        shields: shieldFx.length,
        guards: guardFx.length,
        chains: chainFx.length,
        trails: shots.reduce((n, s) => n + (s.trail?.length || 0), 0),
        blasts: blastFx.map((p) => ({ ...p })),
      },
    };
  }
  function pause() {
    if (phase === "playing") {
      paused = true;
      clearFx();
    }
  }
  function resume() {
    if (phase === "playing") paused = false;
  }
  function dispose() {
    phase = "ended";
    paused = false;
    enemies = [];
    shots = [];
    bullets = [];
    scheduledBullets = [];
    emitters = [];
    hazards = [];
    attacks = [];
    drops = [];
    pendingReward = null;
    deferredShots = [];
    drones = [];
    clearFx();
  }
  let api = {
    startSession,
    step,
    render,
    pause,
    resume,
    dispose,
    getSnapshot: snapshot,
    applySandbox,
    chooseUpgrade,
    rerollUpgrade,
    skipUpgrade,
  };
  Object.defineProperty(api, "__test", {
    enumerable: false,
    value: {
      clearWave() {
        enemies = [];
        clearThreats();
      },
      setWave(value) {
        wave = value;
      },
      damageEnemy(id, amount) {
        const enemy = enemies.find((entry) => entry.id === id);
        if (enemy) damageEnemy(enemy, amount);
      },
      setHostile(a) {
        bullets = a.map((q) => ({ ...q, r: q.r || 5 }));
      },
      kill(n = 1) {
        for (let i = 0; i < n && enemies.length; i++) kill(enemies.shift());
        enemies = enemies.filter((e) => !e.dead);
      },
      setShip(x, y) {
        ship.x = x;
        ship.y = y;
      },
      setCharge(n) {
        charge = n;
      },
      setShield(value = true) {
        shield = value;
      },
      setScore(value) {
        score = value;
      },
      setWeapon(value) {
        playerBuild.weaponId = typeof value === "string" ? value : ({ 1: "base", 2: "spread", 3: "fan" }[value] || "base");
      },
      setBuild(value = {}) {
        playerBuild = {
          ...initialBuild(),
          ...value,
          perks: { ...(value.perks || {}) },
        };
      },
      spawnDrop(kind, x, y) {
        addDrop(kind, x, y);
      },
      spawn(type, x, y) {
        return add(type, x, y, { cool: 0 });
      },
      addHitFx(x = 0, y = 0) {
        addHitFx(x, y, "#fff");
      },
    },
  });
  return api;
}
module.exports = {
  createGame,
  difficultyForWave,
  enemyHealthMultiplier,
  regularEnemyHealthForWave,
  encounterTypeForWave,
  bossHealthForWave,
};
