"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const traces = require("./fixtures/labDash/success-traces.json");
const { createGame } = require("../renderer/games/labDash");

function canvasStub(record = {}) {
  const noop = () => {};
  const context = new Proxy(
    {
      createLinearGradient: () => ({ addColorStop: noop }),
      moveTo(x, y) {
        (record.points ||= []).push([x, y]);
      },
      lineTo(x, y) {
        (record.points ||= []).push([x, y]);
      },
    },
    {
      get: (target, key) => (key in target ? target[key] : noop),
      set: (target, key, value) => ((target[key] = value), true),
    },
  );
  return { width: 1280, height: 720, getContext: () => context };
}

const makeGame = (options = {}) =>
  createGame({
    canvas: canvasStub(options.record),
    audio: options.audio,
    onEvent: options.onEvent,
    reducedMotion: options.reducedMotion,
    sessionKind: options.sessionKind,
  });
const unpack = (trace) => {
  const bytes = Buffer.from(trace.bits, "base64");
  return Array.from({ length: trace.frames }, (_, frame) =>
    Boolean(bytes[frame >> 3] & (1 << (frame & 7))),
  );
};
const corridorGates = [
  [],
  [
    [199, "bottom"], [222, "top"], [245, "bottom"], [269, "top"], [293, "bottom"], [317, "top"], [341, "bottom"], [365, "top"], [389, "bottom"],
  ],
  [
    [149, "bottom"], [170, "top"], [192, "bottom"], [214, "top"], [236, "bottom"], [258, "top"], [298, "bottom"], [316, "top"], [334, "bottom"], [352, "top"], [370, "bottom"], [388, "top"], [406, "bottom"], [424, "top"], [442, "bottom"],
  ],
].map((stage) => stage.map(([x, side]) => ({ x, side })));
const cubeJumpXs = traces.map((trace) => {
  const frames = unpack(trace);
  return frames.flatMap((down, frame) =>
    down && !frames[frame - 1] ? [frame / 6] : [],
  );
});

function playTrace(game, trace, onFrame = () => {}) {
  let previous = false;
  unpack(trace).forEach((actionDown, frame) => {
    onFrame(game.getSnapshot(), frame);
    game.step(1 / 60, { actionDown, actionPressed: actionDown && !previous });
    previous = actionDown;
  });
}
function playScaledStepTrace(game, trace) {
  let previous = false;
  unpack(trace).forEach((actionDown) => {
    const speed = game.getSnapshot().speedScale;
    game.step(1 / 60 / speed, {
      actionDown,
      actionPressed: actionDown && !previous,
    });
    previous = actionDown;
  });
}
function playCorridorController(game, stage) {
  const jumps = cubeJumpXs[stage].slice();
  let waveHold = 0,
    waveDown = false,
    lastY = game.getSnapshot().heroY,
    hostFrames = 0;
  while (
    game.getSnapshot().phase === "playing" &&
    !game.getSnapshot().substate &&
    hostFrames++ < 10000
  ) {
    const snapshot = game.getSnapshot();
    const vy = (snapshot.heroY - lastY) * 60;
    lastY = snapshot.heroY;
    let actionDown = false,
      actionPressed = false;
    if (snapshot.mode === "cube") {
      if (jumps.length && snapshot.heroX >= jumps[0] - 0.08) {
        actionDown = actionPressed = true;
        jumps.shift();
      }
    } else {
      const gate = corridorGates[stage].find(
        (entry) =>
          entry.x + 2.8 >= snapshot.heroX && entry.x - snapshot.heroX <= 8,
      );
      const targetY = gate
        ? gate.side === "bottom"
          ? snapshot.mode === "wave"
            ? 5.5
            : 4.5
          : snapshot.mode === "wave"
            ? 2.5
            : 3.5
        : 4;
      if (snapshot.mode === "wave") {
        if (!waveHold) {
          waveDown = snapshot.heroY < targetY;
          waveHold = 8;
        } else waveHold -= 1;
        actionDown = waveDown;
      } else actionDown = 2 * (targetY - snapshot.heroY) - vy > 0;
    }
    game.step(1 / 60, { actionDown, actionPressed });
  }
  assert.ok(hostFrames < 10000, "controller should reach a terminal stage state");
}
function clearCircuitScaled(game) {
  traces.forEach((trace, stage) => {
    playScaledStepTrace(game, trace);
    if (stage < 2) advanceStage(game);
  });
}
function clearCircuitAtHostRate(game) {
  for (let stage = 0; stage < 3; stage += 1) {
    playCorridorController(game, stage);
    assert.equal(
      game.getSnapshot().substate,
      stage === 2 ? "circuit-clear" : "level-clear",
    );
    if (stage < 2) advanceStage(game);
  }
}

function advanceStage(game) {
  for (
    let frame = 0;
    frame < 130 && game.getSnapshot().substate === "level-clear";
    frame += 1
  )
    game.step(1 / 60, {});
  assert.equal(game.getSnapshot().substate, "level-ready");
  game.step(1 / 60, { actionDown: false });
  assert.equal(game.getSnapshot().stageReleased, true);
  game.step(1 / 60, { actionDown: true, actionPressed: true });
  assert.equal(game.resume(), true);
  game.step(1 / 60, { actionDown: false });
}
function advanceCircuit(game) {
  for (
    let frame = 0;
    frame < 130 && game.getSnapshot().substate === "circuit-clear";
    frame += 1
  )
    game.step(1 / 60, {});
  assert.equal(game.getSnapshot().substate, "circuit-ready");
  game.step(1 / 60, { actionDown: false });
  game.step(1 / 60, { actionDown: true, actionPressed: true });
  assert.equal(game.resume(), true);
  game.step(1 / 60, { actionDown: false });
}

function runUntilStopped(game, input, limit = 3000) {
  for (
    let frame = 0;
    frame < limit &&
    game.getSnapshot().phase === "playing" &&
    !game.getSnapshot().substate;
    frame += 1
  )
    game.step(1 / 60, input(frame));
  return game.getSnapshot();
}

test("authors three fixed-duration stages with readable mode portals and safety corridors", () => {
  const game = makeGame();
  game.startSession();
  assert.equal(game.getSnapshot().levelDuration, 35);
  playTrace(game, traces[0]);
  advanceStage(game);
  assert.equal(game.getSnapshot().levelDuration, 40);
  assert.deepEqual(game.getSnapshot().portals, [
    { x: 0, mode: "cube" },
    { x: 180, mode: "ship" },
  ]);
  playTrace(game, traces[1]);
  advanceStage(game);
  const stage3 = game.getSnapshot();
  assert.equal(stage3.levelDuration, 45);
  assert.deepEqual(stage3.portals, [
    { x: 0, mode: "cube" },
    { x: 130, mode: "ship" },
    { x: 280, mode: "wave" },
  ]);
  assert.equal(stage3.sourceCommit, "8013c933980c1f31eb0aa95d101993c525d0e09f");
});

test("prerecorded input clears every stage through production physics and collision", () => {
  const events = [];
  const game = makeGame({ onEvent: (event) => events.push(event) });
  game.startSession();
  const cleared = [];
  traces.forEach((trace, index) => {
    playTrace(game, trace);
    const snapshot = game.getSnapshot();
    cleared.push({
      stage: index + 1,
      x: snapshot.heroX,
      mode: snapshot.mode,
      attempts: snapshot.attemptsRemaining,
    });
    if (index < 2) {
      assert.equal(snapshot.substate, "level-clear");
      assert.equal(snapshot.levelsCleared, index + 1);
      advanceStage(game);
    }
  });
  assert.deepEqual(
    cleared.map((entry) => entry.mode),
    ["cube", "ship", "wave"],
  );
  assert.ok(cleared.every((entry) => entry.attempts === 3));
  assert.ok(Math.abs(cleared[0].x - 350) < 0.01);
  assert.ok(Math.abs(cleared[1].x - 400) < 0.01);
  assert.ok(Math.abs(cleared[2].x - 450) < 0.01);
  const final = game.getSnapshot();
  assert.equal(final.phase, "playing");
  assert.equal(final.substate, "circuit-clear");
  assert.equal(final.completed, true);
  assert.equal(final.levelsCleared, 3);
  assert.equal(final.bestProgress, 1);
  assert.equal(final.circuit, 1);
  assert.equal(final.circuitsCleared, 1);
  assert.equal(final.currentCircuitScore, 0);
  assert.equal(final.score, final.bankedScore);
  assert.equal(final.simulationMs, 120000.00000001203);
  assert.equal(events.filter((event) => event.type === "sessionEnd").length, 0);
});

test("recorded wave control has human-scale dwell while clearing precision gates", () => {
  const inputs = unpack(traces[2]);
  const changes = [];
  for (let frame = 1681; frame < inputs.length; frame += 1) {
    if (inputs[frame] !== inputs[frame - 1]) changes.push(frame);
  }
  const dwellFrames = changes
    .slice(1)
    .map((frame, index) => frame - changes[index]);
  assert.ok(dwellFrames.length > 10);
  assert.ok(dwellFrames.every((frames) => frames >= 8));
});

test("no input and one held input both fail the first authored hazard", () => {
  for (const input of [
    () => ({}),
    (frame) => ({ actionDown: true, actionPressed: frame === 0 }),
  ]) {
    const game = makeGame();
    game.startSession();
    const stopped = runUntilStopped(game, input, 300);
    assert.equal(stopped.phase, "attempt-over");
    assert.equal(stopped.attemptsRemaining, 2);
    assert.ok(stopped.lastDeathX > 21 && stopped.lastDeathX < 23);
  }
});

test("three deaths charge once, require release and a fresh edge, and retry the current stage", () => {
  const events = [];
  const game = makeGame({ onEvent: (event) => events.push(event) });
  game.startSession();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let stopped = runUntilStopped(game, () => ({}), 300);
    assert.equal(stopped.attemptsRemaining, 2 - attempt);
    if (attempt === 2) break;
    for (let frame = 0; frame < 10; frame += 1)
      game.step(1 / 60, { actionDown: true });
    assert.equal(game.getSnapshot().phase, "attempt-over");
    game.step(1 / 60, { actionDown: false });
    assert.equal(game.getSnapshot().retryReleased, true);
    game.step(1 / 60, { actionDown: true, actionPressed: true });
    assert.equal(game.getSnapshot().heroX, 0);
    assert.equal(game.getSnapshot().stageIndex, 0);
    assert.equal(game.resume(), true);
    game.step(1 / 60, { actionDown: false });
  }
  assert.equal(game.getSnapshot().phase, "ended");
  assert.equal(events.filter((event) => event.type === "sessionEnd").length, 1);
  game.step(1, {});
  assert.equal(events.filter((event) => event.type === "sessionEnd").length, 1);
});

test("retrying a later stage keeps cleared stages and restarts that stage only", () => {
  const game = makeGame();
  game.startSession();
  playTrace(game, traces[0]);
  advanceStage(game);
  const stopped = runUntilStopped(game, () => ({}), 300);
  assert.equal(stopped.stageIndex, 1);
  assert.equal(stopped.levelsCleared, 1);
  game.step(1 / 60, {});
  game.step(1 / 60, { actionDown: true, actionPressed: true });
  const retried = game.getSnapshot();
  assert.equal(retried.stageIndex, 1);
  assert.equal(retried.levelsCleared, 1);
  assert.equal(retried.heroX, 0);
  assert.equal(game.resume(), true);
  game.step(1 / 60, { actionDown: false });
});

test("samples remain unique across deaths and score never decreases", () => {
  const game = makeGame();
  game.startSession();
  const frames = unpack(traces[0]);
  let previous = false,
    priorScore = 0;
  for (let frame = 0; frame < 500; frame += 1) {
    const down = frames[frame];
    game.step(1 / 60, { actionDown: down, actionPressed: down && !previous });
    previous = down;
    assert.ok(game.getSnapshot().score >= priorScore);
    priorScore = game.getSnapshot().score;
  }
  assert.ok(game.getSnapshot().collectedCount > 0);
  const before = runUntilStopped(game, () => ({}));
  game.step(1 / 60, {});
  game.step(1 / 60, { actionDown: true, actionPressed: true });
  assert.equal(game.resume(), true);
  game.step(1 / 60, {});
  previous = false;
  for (let frame = 0; frame < 230; frame += 1) {
    const down = frames[frame];
    game.step(1 / 60, { actionDown: down, actionPressed: down && !previous });
    previous = down;
  }
  assert.equal(game.getSnapshot().pickupScore, before.pickupScore);
  assert.equal(game.getSnapshot().collectedCount, before.collectedCount);
});

test("level clear waits two simulated seconds and needs release then fresh A", () => {
  const game = makeGame();
  game.startSession();
  playTrace(game, traces[0]);
  for (let frame = 0; frame < 119; frame += 1)
    game.step(1 / 60, { actionDown: true });
  assert.equal(game.getSnapshot().substate, "level-clear");
  for (let frame = 0; frame < 4; frame += 1)
    game.step(1 / 60, { actionDown: true });
  assert.equal(game.getSnapshot().substate, "level-ready");
  game.step(1 / 60, { actionDown: true, actionPressed: true });
  assert.equal(game.getSnapshot().stageIndex, 0);
  game.step(1 / 60, {});
  game.step(1 / 60, { actionDown: true, actionPressed: true });
  assert.equal(game.getSnapshot().stageIndex, 1);
});

test("pause freezes simulation; dispose is terminal and render remains safe", () => {
  const record = {},
    game = makeGame({ record });
  game.startSession();
  for (let frame = 0; frame < 40; frame += 1) game.step(1 / 60, {});
  assert.equal(game.pause(), true);
  const before = game.getSnapshot();
  game.step(0.25, { actionDown: true, actionPressed: true });
  assert.equal(game.getSnapshot().heroX, before.heroX);
  assert.deepEqual(game.getSnapshot().effects, before.effects);
  assert.equal(game.resume(), true);
  game.render();
  assert.ok(record.points.length > 0);
  game.dispose();
  assert.equal(game.getSnapshot().disposed, true);
  assert.deepEqual(game.getSnapshot().effects, { trailPoints: 0, portal: 0, pickups: 0 });
  assert.equal(game.startSession(), false);
  assert.doesNotThrow(() => game.render());
});

test("completed circuits bank the prior formula before a fresh local score begins", () => {
  const game = makeGame();
  game.startSession();
  let last = 0;
  traces.forEach((trace, index) => {
    playTrace(game, trace, (snapshot) => {
      assert.ok(snapshot.score >= last);
      last = snapshot.score;
    });
    if (index < 2) advanceStage(game);
  });
  const s = game.getSnapshot();
  assert.equal(s.circuitsCleared, 1);
  assert.equal(s.bankedScore, 9175);
  assert.equal(s.currentCircuitScore, 0);
  assert.equal(s.pickupContribution, 0);
  assert.equal(s.score, 9175);
  assert.equal(s.completionBonus, 0);
  assert.equal(s.attemptBonus, 0);
});

test("a new circuit keeps shared attempts while a retry cannot re-collect its samples", () => {
  const game = makeGame();
  game.startSession();
  traces.forEach((trace, index) => {
    playTrace(game, trace);
    if (index < 2) advanceStage(game);
  });
  const banked = game.getSnapshot().bankedScore;
  advanceCircuit(game);
  let next = game.getSnapshot();
  assert.deepEqual(
    [next.circuit, next.circuitsCleared, next.stageIndex, next.attemptsRemaining, next.bankedScore, next.pickupScore, next.collectedCount],
    [2, 1, 0, 3, banked, 0, 0],
  );
  const stopped = runUntilStopped(game, () => ({}), 300);
  assert.equal(stopped.attemptsRemaining, 2);
  game.step(1 / 60, { actionDown: false });
  game.step(1 / 60, { actionDown: true, actionPressed: true });
  next = game.getSnapshot();
  assert.deepEqual(
    [next.circuit, next.stageIndex, next.attemptsRemaining, next.bankedScore, next.pickupScore, next.collectedCount],
    [2, 0, 2, banked, 0, 0],
  );
  assert.ok(next.speedScale > 1 && next.speedScale < 1.15);
});

test("scaled-step replay preserves geometry and bounded circuit accounting over twenty circuits", () => {
  const game = makeGame();
  game.startSession();
  let previousBank = 0;
  for (let circuit = 1; circuit <= 20; circuit += 1) {
    for (let stage = 0; stage < 3; stage += 1) {
      playScaledStepTrace(game, traces[stage]);
      if (stage < 2) advanceStage(game);
    }
    const snapshot = game.getSnapshot();
    assert.deepEqual(
      [snapshot.substate, snapshot.circuit, snapshot.circuitsCleared, snapshot.levelsCleared, snapshot.attemptsRemaining, snapshot.currentCircuitScore],
      ["circuit-clear", circuit, circuit, circuit * 3, 3, 0],
    );
    assert.equal(snapshot.bankedScore - previousBank, 9175);
    assert.ok(snapshot.collectedCount <= 21);
    assert.ok(snapshot.speedScale >= 1 && snapshot.speedScale < 1.15);
    previousBank = snapshot.bankedScore;
    if (circuit < 20) advanceCircuit(game);
  }
});

test("real 60Hz corridor control clears circuit 20 and the near-cap circuit 100", () => {
  const game = makeGame();
  game.startSession();
  for (let circuit = 1; circuit < 20; circuit += 1) {
    clearCircuitScaled(game);
    advanceCircuit(game);
  }
  assert.equal(game.getSnapshot().circuit, 20);
  clearCircuitAtHostRate(game);
  assert.equal(game.getSnapshot().attemptsRemaining, 3);
  advanceCircuit(game);
  for (let circuit = 21; circuit < 100; circuit += 1) {
    clearCircuitScaled(game);
    advanceCircuit(game);
  }
  const nearCap = game.getSnapshot();
  assert.equal(nearCap.circuit, 100);
  assert.ok(nearCap.speedScale > 1.149 && nearCap.speedScale < 1.15);
  clearCircuitAtHostRate(game);
  assert.equal(game.getSnapshot().attemptsRemaining, 3);
  assert.equal(game.getSnapshot().circuitsCleared, 100);
});

test("reduced motion leaves authored physics and scoring unchanged", () => {
  let reduce = false;
  const standard = makeGame();
  const reduced = makeGame({ reducedMotion: () => reduce });
  standard.startSession();
  reduced.startSession();
  const inputs = unpack(traces[0]);
  let previous = false;
  inputs.forEach((actionDown, frame) => {
    const input = { actionDown, actionPressed: actionDown && !previous };
    standard.step(1 / 60, input);
    reduced.step(1 / 60, input);
    previous = actionDown;
    if (frame === 300) reduce = true;
  });
  const a = standard.getSnapshot(), b = reduced.getSnapshot();
  assert.deepEqual(
    [b.phase, b.substate, b.heroX, b.heroY, b.score, b.pickupScore, b.collectedCount],
    [a.phase, a.substate, a.heroX, a.heroY, a.score, a.pickupScore, a.collectedCount],
  );
});

test("tutorial runs four bounded controls exercises without scoring a session", () => {
  const events = [];
  const game = makeGame({
    sessionKind: "tutorial",
    onEvent: (event) => events.push(event),
  });
  game.startSession();
  assert.deepEqual(
    [game.getSnapshot().tutorial.step, game.getSnapshot().tutorial.title],
    [0, "CUBE JUMP"],
  );
  game.step(1 / 60, {});
  game.step(1 / 60, { actionDown: true, actionPressed: true });
  for (let frame = 0; frame < 480 && game.getSnapshot().tutorial.step === 0; frame += 1)
    game.step(1 / 60, {});
  assert.equal(game.getSnapshot().tutorial.step, 1);
  for (let frame = 0; frame < 480 && game.getSnapshot().tutorial.step === 1; frame += 1)
    game.step(1 / 60, {});
  assert.equal(game.getSnapshot().tutorial.step, 2);
  for (let frame = 0; frame < 480 && game.getSnapshot().tutorial.step === 2; frame += 1)
    game.step(1 / 60, { actionDown: true });
  assert.equal(game.getSnapshot().tutorial.step, 3);
  for (let frame = 0; frame < 480 && game.getSnapshot().phase === "playing"; frame += 1)
    game.step(1 / 60, { actionDown: true });
  const snapshot = game.getSnapshot();
  assert.equal(snapshot.phase, "ended");
  assert.equal(snapshot.tutorial.completed, true);
  assert.equal(snapshot.score, 0);
  assert.equal(events.filter((event) => event.type === "tutorialComplete").length, 1);
  assert.equal(events.filter((event) => event.type === "sessionEnd").length, 0);
  assert.doesNotThrow(() => game.render());
});

test("scored resets pause and announce their shell-owned ready boundary", () => {
  const events = [];
  const game = makeGame({ onEvent: (event) => events.push(event) });
  game.startSession();
  const stopped = runUntilStopped(game, () => ({}), 300);
  assert.equal(stopped.phase, "attempt-over");
  game.step(1 / 60, {});
  game.step(1 / 60, { actionDown: true, actionPressed: true });
  assert.equal(game.getSnapshot().paused, true);
  assert.deepEqual(events.at(-1), { type: "ready", reason: "retry" });
  assert.equal(game.resume(), true);
  const boundaryEvents = [];
  const boundaryGame = makeGame({ onEvent: (event) => boundaryEvents.push(event) });
  boundaryGame.startSession();
  clearCircuitScaled(boundaryGame);
  advanceCircuit(boundaryGame);
  assert.deepEqual(
    boundaryEvents.filter((event) => event.type === "ready").map((event) => event.reason),
    ["stage", "stage", "circuit"],
  );
});
