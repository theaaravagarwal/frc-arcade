"use strict";

/* Lab Dash: source-derived PolyDash convex SAT with original arcade courses. */
const source = require("../../../vendor/polydash/source-core");
const { drawSprite, drawLabBackground } = require("../../hosa/art");
const WIDTH = 1280;
const HEIGHT = 720;
const DT = 1 / 60;
const SPEED = 10;
const UNIT = 62;
const HERO_X = 250;
const FLOOR = 0;
const CEILING = 8;
const TUTORIAL_STEPS = Object.freeze([
  { title: "CUBE JUMP", hint: "PRESS A TO CLEAR THE SAMPLE MARK", mode: "cube", target: { x: 4, y: 1.8 } },
  { title: "COLLECT", hint: "PASS THROUGH THE RIBBON SAMPLE", mode: "cube", target: { x: 10, y: 0.41 } },
  { title: "SHIP", hint: "HOLD A TO RISE TO THE SAMPLE MARK", mode: "ship", target: { x: 16, y: 5.5 } },
  { title: "WAVE", hint: "HOLD A TO ANGLE UP THROUGH THE MARK", mode: "wave", target: { x: 16, y: 5.5 } },
]);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// Cubic-bezier(.23, 1, .32, 1), evaluated against elapsed time for the clear overlay.
const easeOut = (t) => {
  let u = clamp(t, 0, 1);
  for (let i = 0; i < 5; i++) {
    const inv = 1 - u;
    const x = 3 * inv * inv * u * 0.23 + 3 * inv * u * u * 0.32 + u * u * u;
    const dx = 3 * inv * inv * 0.23 + 6 * inv * u * 0.09 + 3 * u * u * 0.68;
    u = clamp(u - (x - t) / dx, 0, 1);
  }
  const inv = 1 - u;
  return 3 * inv * inv * u + 3 * inv * u * u + u * u * u;
};
const spike = (x, width = 1.15, height = 1.15) => ({
  type: "spike",
  x,
  width,
  height,
});
const gap = (x, width) => ({ type: "gap", x, width });
const block = (x, width = 1.5, height = 1.25) => ({
  type: "block",
  x,
  width,
  height,
});
const gate = (x, side, reach, width = 1.8) => ({
  type: "gate",
  x,
  width,
  side,
  reach,
});
const portal = (x, mode) => ({ x, mode });
const cubes = (rows) =>
  rows.map((r) =>
    r[0] === "s"
      ? spike(r[1], r[2], r[3])
      : r[0] === "g"
        ? gap(r[1], r[2])
        : block(r[1], r[2], r[3]),
  );

const LEVELS = Object.freeze([
  {
    name: "Calibration Run",
    duration: 35,
    palette: ["#081927", "#123d4c", "#65e5d1", "#ff5f91"],
    portals: [portal(0, "cube")],
    obstacles: cubes([
      ["s", 22],
      ["s", 48],
      ["g", 76, 3.2],
      ["b", 105, 1.5, 1.15],
      ["s", 135],
      ["s", 160],
      ["g", 188, 3.5],
      ["s", 218],
      ["b", 245, 1.7, 1.25],
      ["s", 273],
      ["g", 301, 3.8],
      ["s", 329],
    ]),
  },
  {
    name: "Ion Transfer",
    duration: 40,
    palette: ["#160d2b", "#382052", "#77ecff", "#ffad54"],
    portals: [portal(0, "cube"), portal(180, "ship")],
    obstacles: [
      ...cubes([
        ["s", 20],
        ["g", 46, 3.2],
        ["s", 72],
        ["b", 98, 1.8, 1.3],
        ["s", 126],
        ["g", 151, 3.8],
        ["s", 168],
      ]),
      gate(199, "bottom", 3.25),
      gate(222, "top", 3.25),
      gate(245, "bottom", 3.45),
      gate(269, "top", 3.45),
      gate(293, "bottom", 3.6),
      gate(317, "top", 3.6),
      gate(341, "bottom", 3.7),
      gate(365, "top", 3.7),
      gate(389, "bottom", 3.6),
    ],
  },
  {
    name: "Quantum Gauntlet",
    duration: 45,
    palette: ["#071b20", "#193c37", "#d8ff66", "#ff4f70"],
    portals: [portal(0, "cube"), portal(130, "ship"), portal(280, "wave")],
    obstacles: [
      ...cubes([
        ["s", 18],
        ["g", 40, 3.5],
        ["b", 63, 1.7, 1.35],
        ["s", 86],
        ["g", 108, 4],
        ["s", 120],
      ]),
      gate(149, "bottom", 3.25),
      gate(170, "top", 3.25),
      gate(192, "bottom", 3.45),
      gate(214, "top", 3.45),
      gate(236, "bottom", 3.65),
      gate(258, "top", 3.5),
      gate(298, "bottom", 3.1, 2.1),
      gate(316, "top", 3.1, 2.1),
      gate(334, "bottom", 3.25, 2.1),
      gate(352, "top", 3.25, 2.1),
      gate(370, "bottom", 3.4, 2.1),
      gate(388, "top", 3.4, 2.1),
      gate(406, "bottom", 3.55, 2.1),
      gate(424, "top", 3.55, 2.1),
      gate(442, "bottom", 3.7, 2.1),
    ],
  },
]);

function makeCollectibles() {
  return LEVELS.flatMap((level, stage) => {
    const items = [];
    for (let x = 32, i = 0; x < level.duration * SPEED - 8; x += 58, i += 1) {
      const type = i % 3 === 2 ? "research" : "ribbon";
      items.push({
        id: `s${stage + 1}-${i}`,
        stage,
        type,
        value: type === "research" ? 100 : 25,
        x,
        y: stage === 0 || x < level.portals.at(-1).x ? 1.45 : 4,
      });
    }
    return items;
  });
}

const poly = (points) =>
  new source.polygon(points.map(([x, y]) => new source.point(x, y)));
const rect = (x, y, w, h) =>
  poly([
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ]);
function obstacleShape(o) {
  if (o.type === "spike")
    return poly([
      [o.x, 0],
      [o.x + o.width / 2, o.height],
      [o.x + o.width, 0],
    ]);
  if (o.type === "block") return rect(o.x, 0, o.width, o.height);
  if (o.type === "gate")
    return o.side === "bottom"
      ? rect(o.x, FLOOR, o.width, o.reach)
      : rect(o.x, CEILING - o.reach, o.width, o.reach);
  return null;
}

function createGame({ canvas, audio, onEvent, random = Math.random, reducedMotion, sessionKind = "scored", presentation } = {}) {
  if (!canvas || typeof canvas.getContext !== "function")
    throw new TypeError("Lab Dash requires a canvas");
  const ctx = canvas.getContext("2d");
  const present = typeof presentation === "function" ? presentation : null;
  const emit = typeof onEvent === "function" ? onEvent : () => {};
  const sound = audio && typeof audio.play === "function" ? audio : null;
  const tutorialSession = sessionKind === "tutorial";
  let phase = "ended";
  let substate = null;
  let stageIndex = 0;
  let levelsCleared = 0;
  let circuit = 1;
  let circuitsCleared = 0;
  let attemptsRemaining = 3;
  let attemptNumber = 1;
  let x = 0;
  let y = 0.41;
  let vy = 0;
  let angle = 0;
  let mode = "cube";
  let grounded = true;
  let accumulator = 0;
  let simulationMs = 0;
  let transitionMs = 0;
  let paused = false;
  let disposed = false;
  let completed = false;
  let endSent = false;
  let attemptReleased = false;
  let stageReleased = false;
  let startReleased = false;
  let lastDeathX = null;
  let collectedIds = new Set();
  let pickupScore = 0;
  let pickupFeedback = null;
  let localBestProgress = 0;
  let bankedScore = 0;
  let score = 0;
  let collectibles = makeCollectibles();
  let trail = [];
  let portalFx = null;
  let pickupFx = [];
  let motionWasAllowed;
  let tutorial = null;
  const motionAllowed = () => {
    const reduce =
      typeof reducedMotion === "function"
        ? reducedMotion()
        : reducedMotion ?? globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    return !reduce;
  };
  function clearFx() {
    trail = [];
    portalFx = null;
    pickupFx = [];
  }
  function refreshMotion() {
    const allowed = motionAllowed();
    if (motionWasAllowed !== undefined && motionWasAllowed !== allowed) clearFx();
    motionWasAllowed = allowed;
    return allowed;
  }
  function updateFx() {
    const moving = refreshMotion();
    if (moving) {
      trail.push({ x, y, age: 0 });
      if (trail.length > 10) trail.shift();
    }
    trail.forEach((point) => (point.age += 1000 / 60));
    trail = trail.filter((point) => point.age <= 120);
    if (portalFx) {
      portalFx.age += 1000 / 60;
      if (portalFx.age >= 200) portalFx = null;
    }
    pickupFx.forEach((effect) => (effect.age += 1000 / 60));
    pickupFx = pickupFx.filter((effect) => effect.age < 200);
  }
  const play = (name) => {
    if (!sound) return;
    try {
      sound.play(name);
    } catch (_) {
      /* Audio is optional. */
    }
  };
  const stageProgress = () =>
    clamp(x / (LEVELS[stageIndex].duration * SPEED), 0, 1);
  const overallProgress = () => clamp((stageIndex + stageProgress()) / 3, 0, 1);
  const difficultyScale = () =>
    1 + 0.15 * (1 - Math.exp(-(circuit - 1) / 4));
  const bestProgress = () => circuitsCleared + localBestProgress;
  function scoring() {
    const progressScore = Math.floor(3000 * localBestProgress);
    const multiplier = 1 + 2 * localBestProgress;
    const currentCircuitScore = Math.floor(
      3000 * localBestProgress + pickupScore * multiplier,
    );
    const pickupContribution = currentCircuitScore - progressScore;
    return {
      progressScore,
      multiplier,
      pickupContribution,
      currentCircuitScore,
      completionBonus: 0,
      attemptBonus: 0,
      score: bankedScore + currentCircuitScore,
    };
  }
  const updateScore = () => {
    score = scoring().score;
  };
  const result = () => {
    const values = scoring();
    return {
      score: values.score,
      bestProgress: bestProgress(),
      completed,
      levelsCleared,
      attemptsRemaining,
      pickupScore,
      bankedScore,
      currentCircuitScore: values.currentCircuitScore,
      pickupContribution: values.pickupContribution,
      circuit,
      circuitsCleared,
      speedScale: difficultyScale(),
      progressScore: values.progressScore,
      multiplier: values.multiplier,
      completionBonus: values.completionBonus,
      attemptBonus: values.attemptBonus,
    };
  };
  function sendEnd() {
    if (endSent) return;
    endSent = true;
    emit({ type: "sessionEnd", result: result() });
  }
  function modeAt(worldX) {
    let value = "cube";
    for (const entry of LEVELS[stageIndex].portals) {
      if (worldX >= entry.x) value = entry.mode;
    }
    return value;
  }
  function resetPlayer() {
    x = 0;
    y = 0.41;
    vy = 0;
    angle = 0;
    mode = "cube";
    grounded = true;
    accumulator = 0;
    pickupFeedback = null;
    clearFx();
  }
  function resetCircuit() {
    collectedIds.clear();
    pickupScore = 0;
    localBestProgress = 0;
    resetPlayer();
  }
  function resetTutorialStep(step = 0) {
    const scenario = TUTORIAL_STEPS[step];
    tutorial = { step, elapsedMs: 0, completed: false };
    x = 0;
    y = scenario.mode === "cube" ? 0.41 : 4;
    vy = 0;
    angle = 0;
    mode = scenario.mode;
    grounded = scenario.mode === "cube";
    accumulator = 0;
    clearFx();
  }
  function finishTutorialStep() {
    if (!tutorial || tutorial.completed) return;
    if (tutorial.step + 1 < TUTORIAL_STEPS.length) {
      resetTutorialStep(tutorial.step + 1);
      play("stage-clear");
      return;
    }
    tutorial.completed = true;
    phase = "ended";
    emit({ type: "tutorialComplete" });
  }
  function pauseForReady(reason) {
    startReleased = true;
    paused = true;
    emit({ type: "ready", reason });
  }
  function loseAttempt() {
    if (phase !== "playing" || substate) return;
    lastDeathX = x;
    attemptsRemaining = Math.max(0, attemptsRemaining - 1);
    play("death");
    accumulator = 0;
    if (!attemptsRemaining) {
      phase = "ended";
      updateScore();
      sendEnd();
    } else {
      phase = "attempt-over";
      attemptReleased = false;
    }
  }
  function finishStage() {
    levelsCleared += 1;
    localBestProgress = Math.max(localBestProgress, (stageIndex + 1) / 3);
    updateScore();
    if (stageIndex === 2) {
      completed = true;
      const values = scoring();
      bankedScore +=
        values.currentCircuitScore + 3000 + 500 * (attemptsRemaining - 1);
      circuitsCleared += 1;
      localBestProgress = 0;
      pickupScore = 0;
      substate = "circuit-clear";
      transitionMs = 0;
      stageReleased = false;
      updateScore();
      play("win");
    } else {
      substate = "level-clear";
      transitionMs = 0;
      stageReleased = false;
      play("stage-clear");
    }
  }
  function playerShape() {
    if (mode === "cube")
      return new source.square(new source.point(x, y), [0.82, angle]);
    if (mode === "ship")
      return poly([
        [x - 0.52, y],
        [x + 0.42, y + 0.33],
        [x + 0.58, y],
        [x + 0.42, y - 0.33],
      ]);
    return poly([
      [x - 0.45, y],
      [x, y + 0.42],
      [x + 0.45, y],
      [x, y - 0.42],
    ]);
  }
  function topAt(worldX) {
    let top = FLOOR;
    for (const obstacle of LEVELS[stageIndex].obstacles) {
      if (
        obstacle.type === "gap" &&
        worldX > obstacle.x &&
        worldX < obstacle.x + obstacle.width
      )
        top = -Infinity;
      if (
        obstacle.type === "block" &&
        worldX > obstacle.x &&
        worldX < obstacle.x + obstacle.width
      )
        top = Math.max(top, obstacle.height);
    }
    return top;
  }
  function collides() {
    const hero = playerShape();
    for (const obstacle of LEVELS[stageIndex].obstacles) {
      if (
        obstacle.type === "gap" ||
        obstacle.x > x + 1 ||
        obstacle.x + (obstacle.width || 0) < x - 1
      )
        continue;
      const standingOnTop =
        obstacle.type === "block" &&
        grounded &&
        Math.abs(y - (obstacle.height + 0.41)) < 0.05 &&
        x > obstacle.x - 0.4 &&
        x < obstacle.x + obstacle.width + 0.4;
      if (standingOnTop) continue;
      const shape = obstacleShape(obstacle);
      if (shape && !hero.sat(shape)) return true;
    }
    return false;
  }
  function collect() {
    for (const item of collectibles) {
      if (item.stage !== stageIndex || collectedIds.has(item.id)) continue;
      if (Math.abs(item.x - x) < 0.7 && Math.abs(item.y - y) < 1.15) {
        collectedIds.add(item.id);
        pickupScore += item.value;
        pickupFeedback = {
          text: `+${item.value} ${item.type === "research" ? "RESEARCH" : "RIBBON"}`,
          until: simulationMs + 650,
        };
        if (pickupFx.length < 6)
          pickupFx.push({ x, y, age: 0 });
        updateScore();
        play("pickup");
      }
    }
  }
  function simulate(input) {
    const oldMode = mode;
    const oldY = y;
    x += SPEED * DT;
    mode = tutorialSession ? TUTORIAL_STEPS[tutorial.step].mode : modeAt(x);
    if (mode !== oldMode) {
      trail = [];
      y = 4;
      vy = 0;
      grounded = false;
      angle = 0;
      portalFx = { x, y, mode, age: 0 };
      play("portal");
    }
    if (mode === "cube") {
      if (grounded && input.actionPressed && startReleased) {
        vy = 11.5;
        grounded = false;
        play("jump");
      }
      if (!grounded) {
        vy -= 28 * DT;
        y += vy * DT;
        angle += Math.PI * 2.05 * DT;
      }
      const top = topAt(x);
      if (
        vy <= 0 &&
        top !== -Infinity &&
        oldY - 0.41 >= top - 0.08 &&
        y - 0.41 <= top
      ) {
        y = top + 0.41;
        vy = 0;
        grounded = true;
        angle = Math.round(angle / (Math.PI / 2)) * (Math.PI / 2);
      } else if (grounded && top === -Infinity) {
        grounded = false;
      }
    } else if (mode === "ship") {
      vy += (input.actionDown ? 18 : -18) * DT;
      vy *= 0.985;
      y += vy * DT;
      angle = clamp(vy * 0.055, -0.48, 0.48);
    } else {
      vy = input.actionDown ? 6.3 : -6.3;
      y += vy * DT;
      angle = input.actionDown ? Math.PI / 4 : -Math.PI / 4;
    }
    simulationMs += 1000 / 60;
    updateFx();
    if (tutorialSession) {
      const scenario = TUTORIAL_STEPS[tutorial.step];
      tutorial.elapsedMs += 1000 / 60;
      if (mode !== "cube") y = clamp(y, 0.7, CEILING - 0.7);
      const success =
        (tutorial.step === 0 && !grounded && x >= scenario.target.x - 0.7) ||
        (tutorial.step === 1 && Math.abs(x - scenario.target.x) < 0.7) ||
        (tutorial.step >= 2 && y >= scenario.target.y - 0.2);
      if (success || tutorial.elapsedMs >= 8000) finishTutorialStep();
      return;
    }
    localBestProgress = Math.max(localBestProgress, overallProgress());
    updateScore();
    collect();
    if (pickupFeedback && simulationMs >= pickupFeedback.until)
      pickupFeedback = null;
    if (y < -1.1 || y > CEILING + 0.8 || collides()) loseAttempt();
    else if (x >= LEVELS[stageIndex].duration * SPEED) finishStage();
  }
  function startSession() {
    if (disposed) return false;
    phase = "playing";
    substate = null;
    stageIndex = 0;
    levelsCleared = 0;
    circuit = 1;
    circuitsCleared = 0;
    attemptsRemaining = 3;
    attemptNumber = 1;
    simulationMs = 0;
    transitionMs = 0;
    paused = false;
    completed = false;
    endSent = false;
    attemptReleased = false;
    stageReleased = false;
    startReleased = false;
    lastDeathX = null;
    collectedIds = new Set();
    pickupScore = 0;
    localBestProgress = 0;
    bankedScore = 0;
    score = 0;
    collectibles = makeCollectibles();
    clearFx();
    motionWasAllowed = motionAllowed();
    if (tutorialSession) resetTutorialStep();
    else resetPlayer();
    return true;
  }
  function step(dt, input = {}) {
    if (disposed || paused || phase === "ended") return;
    const normalized = {
      actionDown: Boolean(input.actionDown),
      actionPressed: Boolean(input.actionPressed),
    };
    if (!normalized.actionDown) startReleased = true;
    if (phase === "attempt-over") {
      if (!normalized.actionDown) attemptReleased = true;
      if (attemptReleased && normalized.actionPressed) {
        attemptNumber += 1;
        resetPlayer();
        startReleased = false;
        phase = "playing";
        pauseForReady("retry");
      }
      return;
    }
    if (substate === "level-clear") {
      transitionMs += clamp(Number(dt) || 0, 0, 0.25) * 1000;
      if (transitionMs >= 2000) substate = "level-ready";
      return;
    }
    if (substate === "circuit-clear") {
      transitionMs += clamp(Number(dt) || 0, 0, 0.25) * 1000;
      if (transitionMs >= 2000) substate = "circuit-ready";
      return;
    }
    if (substate === "level-ready") {
      if (!normalized.actionDown) stageReleased = true;
      if (stageReleased && normalized.actionPressed) {
        stageIndex += 1;
        substate = null;
        resetPlayer();
        startReleased = false;
        pauseForReady("stage");
      }
      return;
    }
    if (substate === "circuit-ready") {
      if (!normalized.actionDown) stageReleased = true;
      if (stageReleased && normalized.actionPressed) {
        circuit += 1;
        stageIndex = 0;
        substate = null;
        resetCircuit();
        startReleased = false;
        pauseForReady("circuit");
      }
      return;
    }
    accumulator += clamp(Number(dt) || 0, 0, 0.25) * difficultyScale();
    let guard = 0;
    while (
      accumulator + 1e-10 >= DT &&
      phase === "playing" &&
      !substate &&
      guard < 15
    ) {
      simulate(normalized);
      accumulator -= DT;
      guard += 1;
    }
  }

  const sx = (wx) => HERO_X + (wx - x) * UNIT,
    sy = (wy) => 590 - wy * UNIT;
  function drawPoly(shape, fill, stroke) {
    ctx.beginPath();
    shape.vertices.forEach((p, i) =>
      i ? ctx.lineTo(sx(p.x), sy(p.y)) : ctx.moveTo(sx(p.x), sy(p.y)),
    );
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
  function drawBackground(level) {
    const accent = level.palette[2];
    drawLabBackground(ctx, { width: WIDTH, height: HEIGHT, scroll: x });
    ctx.strokeStyle = `${accent}33`;
    ctx.lineWidth = 1;
    for (let row = 0; row <= 8; row++) {
      ctx.beginPath();
      ctx.moveTo(0, sy(row));
      ctx.lineTo(WIDTH, sy(row));
      ctx.stroke();
    }
  }
  function drawCourse(level) {
    const accent = level.palette[2],
      danger = level.palette[3];
    ctx.fillStyle = "#071018";
    ctx.fillRect(0, sy(0), WIDTH, HEIGHT - sy(0));
    ctx.fillStyle = accent;
    ctx.fillRect(0, sy(0), WIDTH, 5);
    for (const o of level.obstacles) {
      if (o.x < x - 6 || o.x > x + 19) continue;
      if (o.type === "gap") {
        ctx.fillStyle = level.palette[0];
        ctx.fillRect(sx(o.x), sy(0) - 5, o.width * UNIT, HEIGHT - sy(0) + 5);
      } else
        drawPoly(
          obstacleShape(o),
          o.type === "spike" ? danger : "#102632",
          o.type === "spike" ? "#ffe1ea" : accent,
        );
    }
    for (const p of level.portals) {
      if (p.x === 0 || p.x < x - 6 || p.x > x + 19) continue;
      const px = sx(p.x);
      ctx.fillStyle = `${accent}22`;
      ctx.fillRect(px - 12, sy(7.4), 24, sy(0.6) - sy(7.4));
      ctx.strokeStyle = accent;
      ctx.lineWidth = 5;
      ctx.strokeRect(px - 12, sy(7.4), 24, sy(0.6) - sy(7.4));
      ctx.fillStyle = "#fff";
      ctx.font = "900 16px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(p.mode.toUpperCase(), px, sy(6.9));
    }
  }
  function drawCollectibles() {
    for (const item of collectibles) {
      if (
        item.stage !== stageIndex ||
        collectedIds.has(item.id) ||
        item.x < x - 5 ||
        item.x > x + 18
      )
        continue;
      const px = sx(item.x),
        py = sy(item.y);
      ctx.fillStyle =
        item.type === "research"
          ? LEVELS[stageIndex].palette[2]
          : LEVELS[stageIndex].palette[3];
      ctx.beginPath();
      if (item.type === "research") {
        // Flask silhouette: distinct from both hazards and ribbon pickups.
        ctx.moveTo(px - 4, py - 13);
        ctx.lineTo(px + 4, py - 13);
        ctx.lineTo(px + 4, py - 3);
        ctx.lineTo(px + 12, py + 10);
        ctx.lineTo(px - 12, py + 10);
        ctx.lineTo(px - 4, py - 3);
        ctx.closePath();
        ctx.fill();
        drawSprite(ctx, "flask", px, py, 34, 34);
      } else {
        // A loop with crossed tails reads as a ribbon, rather than a score dot.
        ctx.strokeStyle = "#ff5f91";
        ctx.lineWidth = 5;
        ctx.arc(px, py - 5, 5, Math.PI, Math.PI * 3);
        ctx.moveTo(px - 4, py - 2);
        ctx.lineTo(px + 7, py + 12);
        ctx.moveTo(px + 4, py - 2);
        ctx.lineTo(px - 7, py + 12);
        ctx.stroke();
        drawSprite(ctx, "ribbon", px, py, 36, 30);
      }
    }
  }
  function drawHero() {
    const moving = refreshMotion();
    if (moving && trail.length > 1) {
      ctx.strokeStyle = `${LEVELS[stageIndex].palette[2]}88`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      trail.forEach((point, index) =>
        index ? ctx.lineTo(sx(point.x), sy(point.y)) : ctx.moveTo(sx(point.x), sy(point.y)),
      );
      ctx.stroke();
    }
    drawPoly(playerShape(), "#fff5d7", LEVELS[stageIndex].palette[2]);
    const sprite = mode === "cube" ? "cube" : mode;
    drawSprite(
      ctx,
      sprite,
      sx(x),
      sy(y),
      mode === "ship" ? 70 : mode === "wave" ? 58 : 54,
      mode === "ship" ? 46 : mode === "wave" ? 32 : 54,
      { angle: -angle },
    );
  }
  function drawHud() {
    const local = Math.round(stageProgress() * 100),
      overall = Math.round(overallProgress() * 100);
    ctx.fillStyle = "#040b12d9";
    ctx.fillRect(22, 20, 1236, 92);
    ctx.strokeStyle = LEVELS[stageIndex].palette[2];
    ctx.lineWidth = 2;
    ctx.strokeRect(22, 20, 1236, 92);
    ctx.textAlign = "left";
    ctx.fillStyle = "#fff5d7";
    ctx.font = "900 23px system-ui";
    ctx.fillText(`LAB DASH  ·  CIRCUIT ${circuit} · STAGE ${stageIndex + 1}/3`, 43, 54);
    ctx.font = "700 14px system-ui";
    ctx.fillStyle = "#b5c7c7";
    ctx.fillText(
      `${LEVELS[stageIndex].name.toUpperCase()}  ${local}%   ·   CIRCUIT ${local}%  ·  SPEED ${difficultyScale().toFixed(2)}×`,
      43,
      82,
    );
    ctx.fillStyle = LEVELS[stageIndex].palette[2];
    ctx.fillText(`MODE ${mode.toUpperCase()}`, 535, 54);
    ctx.fillStyle = LEVELS[stageIndex].palette[3];
    ctx.fillText(`ATTEMPTS ${attemptsRemaining}`, 535, 82);
    ctx.fillStyle = "#fff5d7";
    ctx.font = "900 19px system-ui";
    ctx.fillText(`SCORE ${score}`, 920, 54);
    ctx.font = "700 14px system-ui";
    ctx.fillStyle = "#b5c7c7";
    ctx.fillText(
      `SAMPLES ${collectedIds.size}/${collectibles.length}  ·  BANK ${bankedScore}`,
      920,
      82,
    );
    ctx.fillStyle = "#050a10e8";
    ctx.fillRect(0, 675, WIDTH, 45);
    ctx.fillStyle = "#d9e3df";
    ctx.textAlign = "center";
    ctx.font = "700 15px system-ui";
    ctx.fillText(
      mode === "cube"
        ? "A  JUMP"
        : mode === "ship"
          ? "HOLD A  THRUST UP   ·   RELEASE  FALL"
          : "HOLD A  DIAGONAL UP   ·   RELEASE  DIAGONAL DOWN",
      WIDTH / 2,
      703,
    );
    if (pickupFeedback) {
      ctx.fillStyle = LEVELS[stageIndex].palette[2];
      ctx.font = "900 20px system-ui";
      ctx.fillText(pickupFeedback.text, HERO_X, 180);
    }
    const moving = refreshMotion();
    pickupFx.forEach((effect) => {
      const t = effect.age / 200;
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = LEVELS[stageIndex].palette[2];
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(
        sx(effect.x),
        sy(effect.y),
        moving ? 12 + t * 20 : 20,
        0,
        Math.PI * 2,
      );
      ctx.strokeStyle = LEVELS[stageIndex].palette[2];
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }
  function drawTutorial() {
    const scenario = TUTORIAL_STEPS[tutorial.step];
    const targetX = sx(scenario.target.x),
      targetY = sy(scenario.target.y);
    ctx.fillStyle = "#040b12d9";
    ctx.fillRect(22, 20, 1236, 104);
    ctx.strokeStyle = LEVELS[0].palette[2];
    ctx.lineWidth = 2;
    ctx.strokeRect(22, 20, 1236, 104);
    ctx.textAlign = "left";
    ctx.fillStyle = "#fff5d7";
    ctx.font = "900 24px system-ui";
    ctx.fillText(`PRACTICE ${tutorial.step + 1}/${TUTORIAL_STEPS.length} · ${scenario.title}`, 43, 57);
    ctx.font = "700 16px system-ui";
    ctx.fillStyle = "#b5c7c7";
    ctx.fillText(scenario.hint, 43, 88);
    ctx.fillText(`${Math.max(0, Math.ceil((8000 - tutorial.elapsedMs) / 1000))} SEC`, 1110, 88);
    ctx.strokeStyle = scenario.mode === "cube" ? "#ffad54" : LEVELS[0].palette[2];
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(targetX, targetY, 17, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = scenario.mode === "cube" ? "#ffad54" : LEVELS[0].palette[2];
    ctx.beginPath();
    ctx.arc(targetX, targetY, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  function drawOverlay() {
    if (phase === "playing" && !substate) return;
    ctx.fillStyle = "#030910e6";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff5d7";
    if (phase === "attempt-over") {
      ctx.font = "900 54px system-ui";
      ctx.fillText("TRIAL INTERRUPTED", WIDTH / 2, 310);
      ctx.font = "800 22px system-ui";
      ctx.fillStyle = LEVELS[stageIndex].palette[3];
      ctx.fillText(
        `${attemptsRemaining} ATTEMPT${attemptsRemaining === 1 ? "" : "S"} REMAINING`,
        WIDTH / 2,
        355,
      );
      ctx.fillStyle = LEVELS[stageIndex].palette[2];
      ctx.fillText(
        attemptReleased ? "PRESS A TO RETRY THIS STAGE" : "RELEASE A",
        WIDTH / 2,
        410,
      );
    } else if (substate === "level-clear") {
      const t = clamp(transitionMs / 200, 0, 1);
      const eased = easeOut(t);
      ctx.globalAlpha = t;
      ctx.font = "900 56px system-ui";
      ctx.fillText("STAGE CLEAR", WIDTH / 2, 335 + (motionAllowed() ? (1 - eased) * 18 : 0));
      ctx.font = "700 20px system-ui";
      ctx.fillText("ANALYZING RESULTS…", WIDTH / 2, 382);
      ctx.globalAlpha = 1;
    } else if (substate === "level-ready") {
      ctx.font = "900 52px system-ui";
      ctx.fillText(`STAGE ${stageIndex + 2} READY`, WIDTH / 2, 330);
      ctx.font = "800 21px system-ui";
      ctx.fillStyle = LEVELS[stageIndex].palette[2];
      ctx.fillText(
        stageReleased ? "PRESS A TO CONTINUE" : "RELEASE A",
        WIDTH / 2,
        390,
      );
    } else if (substate === "circuit-clear") {
      const t = clamp(transitionMs / 200, 0, 1);
      ctx.globalAlpha = t;
      ctx.fillStyle = "#65e5d1";
      ctx.font = "900 56px system-ui";
      ctx.fillText("RESEARCH BREAKTHROUGH", WIDTH / 2, 335);
      ctx.font = "800 22px system-ui";
      ctx.fillText(`CIRCUIT ${circuit} COMPLETE`, WIDTH / 2, 382);
      ctx.globalAlpha = 1;
    } else if (substate === "circuit-ready") {
      ctx.font = "900 52px system-ui";
      ctx.fillText(`CIRCUIT ${circuit + 1} READY`, WIDTH / 2, 330);
      ctx.font = "800 21px system-ui";
      ctx.fillStyle = LEVELS[stageIndex].palette[2];
      ctx.fillText(
        stageReleased ? "PRESS A TO CONTINUE" : "RELEASE A",
        WIDTH / 2,
        390,
      );
    } else {
      ctx.fillStyle = "#ff5f91";
      ctx.font = "900 56px system-ui";
      ctx.fillText("SESSION COMPLETE", WIDTH / 2, 350);
    }
  }
  function render() {
    if (disposed || !ctx) return;
    if (present) {
      present(renderState());
      return;
    }
    ctx.save();
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    const level = LEVELS[stageIndex];
    drawBackground(level);
    if (!tutorialSession) drawCourse(level);
    if (!tutorialSession && portalFx) {
      const t = portalFx.age / 200;
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = level.palette[2];
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(sx(portalFx.x), sy(portalFx.y), motionAllowed() ? 18 + t * 36 : 30, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (!tutorialSession) drawCollectibles();
    drawHero();
    if (tutorialSession) drawTutorial();
    else {
      drawHud();
      drawOverlay();
    }
    if (paused && phase !== "ended") {
      ctx.fillStyle = "#030910e8";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = "#fff";
      ctx.font = "900 60px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("PAUSED", WIDTH / 2, HEIGHT / 2);
    }
    ctx.restore();
  }
  function renderState() {
    const level = LEVELS[stageIndex];
    const visible = (worldX) => worldX >= x - 6 && worldX <= x + 19;
    return {
      width: WIDTH,
      height: HEIGHT,
      camera: { x, unit: UNIT, heroX: HERO_X, groundY: 590 },
      reducedMotion: !motionAllowed(),
      phase,
      substate,
      paused,
      disposed,
      sessionKind: tutorialSession ? "tutorial" : "scored",
      level: {
        index: stageIndex,
        name: level.name,
        palette: level.palette.slice(),
        obstacles: level.obstacles.filter((o) => visible(o.x)).map((o) => ({ ...o })),
        portals: level.portals.filter((p) => p.x && visible(p.x)).map((p) => ({ ...p })),
      },
      hero: { x, y, angle, mode, grounded },
      pickups: collectibles
        .filter((item) => item.stage === stageIndex && !collectedIds.has(item.id) && visible(item.x))
        .map((item) => ({ ...item })),
      trail: trail.map((point) => ({ ...point })),
      portalFx: portalFx && { ...portalFx },
      pickupFx: pickupFx.map((effect) => ({ ...effect })),
      tutorial: tutorialSession && tutorial && {
        step: tutorial.step,
        title: TUTORIAL_STEPS[tutorial.step].title,
        hint: TUTORIAL_STEPS[tutorial.step].hint,
        elapsedMs: tutorial.elapsedMs,
        remainingMs: Math.max(0, 8000 - tutorial.elapsedMs),
        completed: tutorial.completed,
        target: { ...TUTORIAL_STEPS[tutorial.step].target },
      },
      hud: {
        circuit,
        stage: stageIndex + 1,
        localProgress: Math.round(stageProgress() * 100),
        score,
        attemptsRemaining,
        samples: collectedIds.size,
        sampleTotal: collectibles.length,
        bankedScore,
        speedScale: difficultyScale(),
        mode,
      },
      transitionMs,
    };
  }
  function pause() {
    if (disposed || paused || phase === "ended") return false;
    paused = true;
    return true;
  }
  function resume() {
    if (disposed || !paused) return false;
    paused = false;
    accumulator = 0;
    return true;
  }
  function dispose() {
    disposed = true;
    paused = false;
    accumulator = 0;
    collectibles = [];
    collectedIds.clear();
    clearFx();
  }
  function getSnapshot() {
    const v = scoring();
    return {
      phase,
      sessionKind: tutorialSession ? "tutorial" : "scored",
      substate,
      stageIndex,
      level: stageIndex + 1,
      levelName: LEVELS[stageIndex].name,
      levelsCleared,
      circuit,
      circuitsCleared,
      speedScale: difficultyScale(),
      score,
      attemptsRemaining,
      attemptNumber,
      progress: stageProgress(),
      overallProgress: overallProgress(),
      bestProgress: bestProgress(),
      completed,
      paused,
      disposed,
      simulationMs,
      heroX: x,
      heroY: y,
      heroAngle: angle,
      heroJumping: mode === "cube" && !grounded,
      mode,
      retryReleased: attemptReleased,
      stageReleased,
      lastDeathX,
      pickupScore,
      bankedScore,
      currentCircuitScore: v.currentCircuitScore,
      pickupContribution: v.pickupContribution,
      collectedCount: collectedIds.size,
      collectibleCount: collectibles.length,
      ribbonCount: collectibles.filter((i) => i.type === "ribbon").length,
      researchCount: collectibles.filter((i) => i.type === "research").length,
      pickupFeedback: pickupFeedback ? pickupFeedback.text : null,
      courseStartX: 0,
      courseEndX: LEVELS[stageIndex].duration * SPEED,
      levelDuration: LEVELS[stageIndex].duration,
      portals: LEVELS[stageIndex].portals.map((p) => ({ ...p })),
      obstacleCount: LEVELS[stageIndex].obstacles.length,
      sourceCommit: "8013c933980c1f31eb0aa95d101993c525d0e09f",
      progressScore: v.progressScore,
      multiplier: v.multiplier,
      completionBonus: v.completionBonus,
      attemptBonus: v.attemptBonus,
      effects: {
        trailPoints: trail.length,
        portal: portalFx ? 1 : 0,
        pickups: pickupFx.length,
      },
      tutorial: tutorialSession && tutorial && {
        step: tutorial.step,
        title: TUTORIAL_STEPS[tutorial.step].title,
        hint: TUTORIAL_STEPS[tutorial.step].hint,
        elapsedMs: tutorial.elapsedMs,
        remainingMs: Math.max(0, 8000 - tutorial.elapsedMs),
        completed: tutorial.completed,
      },
    };
  }
  void random;
  return { startSession, step, render, pause, resume, dispose, getSnapshot };
}
module.exports = { createGame };
