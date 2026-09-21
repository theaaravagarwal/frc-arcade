"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHosaShell, ALL_GAMES } = require("../renderer");
const { sandboxCatalog } = require("../renderer/hosa/devSandbox");

function pad(buttons = [], axes = [0, 0]) {
  return {
    axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({
      pressed: buttons.includes(i),
    })),
  };
}
const emptyGame = () => ({ startSession(){}, step(){}, render(){}, pause(){}, resume(){}, dispose(){}, getSnapshot(){return {};} });
function finishCountdown(shell) {
  shell.lastTime = 0;
  for (let t = 250; t <= 3250 && shell.phase === "countdown"; t += 250) shell.tick(t);
  shell.lastTime = null;
}
function fixture(options = {}) {
  let pads = [null, null];
  const calls = [];
  const values = new Map();
  const leaderboardEntries = [];
  const screen = { innerHTML: "" };
  const factory = () => ({
    startSession() {
      calls.push("start");
    },
    step(dt, input) {
      calls.push(["step", dt, input]);
    },
    render() {
      calls.push("render");
    },
    pause() {
      calls.push("pause");
    },
    resume() {
      calls.push("resume");
    },
    dispose() {
      calls.push("dispose");
    },
    getSnapshot() {
      return { phase: "playing", score: 4, wave: 3, build: { weaponId: "base", abilityId: "pulse", perks: [] } };
    },
    applySandbox(change) {
      calls.push(["sandbox", change]);
      return true;
    },
  });
  const shell = createHosaShell({
    navigator: { getGamepads: () => pads },
    screen,
    storage: {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
    },
    factories: { cellDefender: factory, labDash: factory },
    games: ALL_GAMES,
    audio: {
      play() {},
      toggleMute() {
        return false;
      },
    },
    now: () => 0,
    devMode: options.devMode,
    leaderboard: options.leaderboard || {
      async append(entry) {
        if (!leaderboardEntries.some((saved) => saved.runId === entry.runId)) leaderboardEntries.push(entry);
        return entry;
      },
      async list() {
        return leaderboardEntries.slice().sort((a, b) => b.score - a.score);
      },
    },
  });
  return {
    shell,
    calls,
    screen,
    values,
    leaderboardEntries,
    setPads(value) {
      pads = value;
    },
  };
}
function tick(f, time, zero = [], axes = [0, 0], one = [], oneAxes = [0, 0]) {
  f.setPads([pad(zero, axes), pad(one, oneAxes)]);
  f.shell.tick(time);
}
function keyboardDocument() {
  const listeners = new Map();
  return {
    body: { classList: { add() {}, remove() {} } },
    getElementById() { return null; },
    addEventListener(type, listener) { listeners.set(type, listener); },
    emit(type, code, extra = {}) {
      let prevented = false;
      listeners.get(type)?.({ code, ...extra, preventDefault() { prevented = true; } });
      return prevented;
    },
  };
}

test("only controller slot zero can select a game", () => {
  const f = fixture();
  f.setPads([null, pad([13])]);
  f.shell.tick(0);
  assert.equal(f.shell.getSnapshot().selectedGame, "cellDefender");
  tick(f, 1);
  tick(f, 2, [13]);
  assert.equal(f.shell.getSnapshot().selectedGame, "labDash");
});

test("production selector exposes only Cell Defender and ignores navigation", () => {
  const screen = { innerHTML: "" };
  const shell = createHosaShell({
    navigator: { getGamepads: () => [null] },
    screen,
    factories: { cellDefender: () => ({}) },
    audio: { play() {}, toggleMute() { return false; } },
  });
  assert.equal(shell.getSnapshot().selectedGame, "cellDefender");
  shell._handle({ yPressed: false, nav: 1, actionPressed: false });
  assert.equal(shell.getSnapshot().selectedGame, "cellDefender");
  assert.doesNotMatch(screen.innerHTML, /LAB DASH/);
});

test("held A is gated, then starts a fixed-step session without dropping its edge", () => {
  const f = fixture();
  tick(f, 0, [0]);
  tick(f, 1, [0]);
  assert.equal(f.shell.getSnapshot().phase, "menu");
  tick(f, 2);
  tick(f, 3, [0]);
  assert.equal(f.shell.getSnapshot().phase, "tutorial");
  tick(f, 4);
  tick(f, 5, [0]);
  assert.equal(f.shell.getSnapshot().phase, "tutorial");
  tick(f, 6);
  tick(f, 27, [0]);
  const step = f.calls.find(
    (call) => Array.isArray(call) && call[0] === "step",
  );
  assert.equal(step[2].actionPressed, true);
});

test("pause and exit confirmation preserve a run when cancelled", () => {
  const f = fixture();
  tick(f, 0);
  f.shell.startSession();
  finishCountdown(f.shell);
  tick(f, 2);
  tick(f, 3, [0]);
  tick(f, 4);
  tick(f, 5, [0]);
  tick(f, 6);
  tick(f, 7, [9]);
  assert.equal(f.shell.getSnapshot().phase, "paused");
  assert.match(f.screen.innerHTML, /GAME PAUSED/);
  assert.match(f.screen.innerHTML, /A RESUME.*B EXIT/);
  tick(f, 8);
  tick(f, 9, [1]);
  assert.equal(f.shell.getSnapshot().phase, "confirm");
  tick(f, 10);
  tick(f, 11, [1]);
  assert.equal(f.shell.getSnapshot().phase, "paused");
  assert.ok(f.calls.includes("pause"));
});

test("keyboard is ignored in cabinet mode and accepted only when dev mode is explicit", () => {
  const cabinet = fixture();
  cabinet.shell.keys.add("Space");
  cabinet.shell.keyEdges.add("Space");
  cabinet.shell.tick(0);
  assert.equal(cabinet.shell.getSnapshot().phase, "menu");
  const dev = createHosaShell({
    navigator: { getGamepads: () => [null] },
    devMode: true,
    factories: { cellDefender: emptyGame, labDash: emptyGame },
    audio: {
      play() {},
      toggleMute() {
        return false;
      },
    },
  });
  dev.keys.add("Space");
  dev.keyEdges.add("Space");
  dev.tick(0);
  assert.equal(dev.getSnapshot().phase, "tutorial");
});

test("dev keyboard ignores host shortcuts while supported keys still gate countdown", () => {
  const makeShell = (doc) => createHosaShell({
    document: doc,
    screen: { innerHTML: "" },
    navigator: { getGamepads: () => [pad()] },
    devMode: true,
    factories: { cellDefender: emptyGame, labDash: emptyGame },
    games: ALL_GAMES,
    audio: { play() {}, toggleMute() { return false; } },
  });
  const doc = keyboardDocument();
  const shell = makeShell(doc);
  shell.startSession();
  assert.equal(doc.emit("keydown", "MetaLeft"), false);
  assert.equal(doc.emit("keydown", "KeyQ"), false);
  assert.equal(shell.keys.size, 0);
  shell.tick(0);
  assert.equal(shell.countdown.released, true);

  const gatedDoc = keyboardDocument();
  const gated = makeShell(gatedDoc);
  gated.startSession();
  gatedDoc.emit("keydown", "Space");
  gated.tick(0);
  assert.equal(gated.countdown.released, false);
  gatedDoc.emit("keyup", "Space");
  gated.tick(1);
  assert.equal(gated.countdown.released, true);
});

test("release gates reset stick navigation latches after a controller reconnect", () => {
  const f = fixture();
  tick(f, 0);
  tick(f, 1, [], [0, -1]);
  assert.equal(f.shell.getSnapshot().selectedGame, "labDash");
  f.setPads([null]);
  f.shell.tick(2);
  tick(f, 3, [], [0, -1]);
  tick(f, 4);
  tick(f, 5, [], [0, -1]);
  assert.equal(f.shell.getSnapshot().selectedGame, "cellDefender");
});

test("Lab Dash persists and displays the highest session progress", () => {
  const f = fixture();
  f.shell.selected = 1;
  f.shell.startSession();
  f.shell._event({
    type: "sessionEnd",
    result: { score: 420, bestProgress: 0.42 },
  });
  f.shell.showResults();
  assert.match(f.screen.innerHTML, /BEST PROGRESS 42%/);
  f.shell.startSession();
  f.shell._event({
    type: "sessionEnd",
    result: { score: 20, bestProgress: 0.1 },
  });
  f.shell.showResults();
  assert.match(f.screen.innerHTML, /BEST PROGRESS 42%/);
});

test("Lab results show the scoring components without nesting controls in the report", () => {
  const f = fixture();
  f.shell.selected = 1;
  f.shell.startSession();
  f.shell._event({
    type: "sessionEnd",
    result: {
      score: 9175,
      bestProgress: 1,
      progressScore: 3000,
      pickupScore: 725,
      multiplier: 3,
      completionBonus: 3000,
      attemptBonus: 1000,
      attemptsRemaining: 3,
      completed: true,
    },
  });
  f.shell.showResults();
  assert.match(f.screen.innerHTML, /PROGRESS 3000 · PICKUPS 725 ×3\.00 = 2175/);
  assert.equal(
    (f.screen.innerHTML.match(/RESEARCH BREAKTHROUGH/g) || []).length,
    1,
  );
  assert.match(f.screen.innerHTML, /<\/div><p class="strip-controls">/);
});

test("dev keyboard can advance a game without a controller while cabinet mode cannot", () => {
  const calls = [];
  const game = {
    startSession() {},
    step() {
      calls.push("step");
    },
    render() {},
    pause() {},
    resume() {},
    dispose() {},
    getSnapshot() {
      return {};
    },
  };
  const shell = createHosaShell({
    navigator: { getGamepads: () => [null] },
    devMode: true,
    factories: { cellDefender: () => game, labDash: () => game },
    audio: {
      play() {},
      toggleMute() {
        return false;
      },
    },
  });
  shell.keyEdges.add("Space");
  shell.keys.add("Space");
  shell.tick(0);
  shell.keys.delete("Space");
  shell.tick(1);
  shell.keyEdges.add("Space");
  shell.keys.add("Space");
  shell.tick(2);
  shell.keys.delete("Space");
  shell.tick(25);
  assert.equal(shell.getSnapshot().phase, "tutorial");
  assert.ok(calls.length > 0);
});

test("dev keyboard remains available while slot zero is connected", () => {
  const shell = createHosaShell({
    navigator: { getGamepads: () => [pad()] },
    devMode: true,
    factories: { cellDefender: emptyGame, labDash: emptyGame },
    audio: {
      play() {},
      toggleMute() {
        return false;
      },
    },
  });
  shell.tick(0);
  shell.keys.add("Space");
  shell.keyEdges.add("Space");
  shell.tick(1);
  assert.equal(shell.getSnapshot().phase, "tutorial");
});

test("requestAnimationFrame keeps the browser window receiver", () => {
  const win = {
    requestAnimationFrame() {
      assert.equal(this, win);
      return 7;
    },
    cancelAnimationFrame() {
      assert.equal(this, win);
    },
  };
  const shell = createHosaShell({
    window: win,
    navigator: { getGamepads: () => [null] },
    factories: { cellDefender: emptyGame, labDash: emptyGame },
    audio: {
      play() {},
      toggleMute() {
        return false;
      },
    },
  });
  shell.start();
  shell.stop();
});

test("XY movement and X special survive host fixed-step edge gating", () => {
  const f = fixture();
  tick(f, 0);
  f.shell.startSession();
  finishCountdown(f.shell);
  f.calls.length = 0;
  tick(f, 0);
  tick(f, 1, [], [0.6, -0.8]);
  tick(f, 22, [2], [0.6, -0.8]);
  const step = f.calls.find(
    (call) => Array.isArray(call) && call[0] === "step",
  );
  assert.equal(step[2].moveX, 0.6);
  assert.equal(step[2].moveY, -0.8);
  assert.equal(step[2].specialPressed, true);
  tick(f, 43, [2], [0.6, -0.8]);
  const steps = f.calls.filter(
    (call) => Array.isArray(call) && call[0] === "step",
  );
  assert.equal(steps.at(-1)[2].specialPressed, false);
});

test("slot one buttons and axes cannot enter or control a session", () => {
  const f = fixture();
  f.setPads([null, pad([0, 2, 9], [0.9, -0.9])]);
  f.shell.tick(0);
  assert.equal(f.shell.getSnapshot().phase, "menu");
  assert.equal(f.shell.getSnapshot().selectedGame, "cellDefender");
});

test("dev X maps to special while keyboard remains disabled in cabinet mode", () => {
  const cabinet = fixture();
  cabinet.shell.keys.add("KeyX");
  cabinet.shell.keyEdges.add("KeyX");
  assert.equal(cabinet.shell._readInput().specialPressed, false);
  const dev = createHosaShell({
    navigator: { getGamepads: () => [pad()] },
    devMode: true,
    factories: { cellDefender: emptyGame, labDash: emptyGame },
    audio: {
      play() {},
      toggleMute() {
        return false;
      },
    },
  });
  dev.keys.add("KeyX");
  dev.keyEdges.add("KeyX");
  assert.equal(dev._readInput().specialPressed, true);
});

test("session end during a fixed loop disposes once and stops further game stepping", () => {
  let emit;
  let steps = 0;
  const game = {
    startSession() {},
    step() {
      steps += 1;
      emit({ type: "sessionEnd", result: { score: 12, wave: 2 } });
    },
    render() {},
    pause() {},
    resume() {},
    dispose() {},
    getSnapshot() {
      return {};
    },
  };
  const shell = createHosaShell({
    navigator: { getGamepads: () => [pad()] },
    factories: {
      cellDefender: ({ onEvent }) => {
        emit = onEvent;
        return game;
      },
      labDash: () => game,
    },
    audio: {
      play() {},
      toggleMute() {
        return false;
      },
    },
  });
  shell.startSession();
  shell.awaitRelease = false;
  finishCountdown(shell);
  shell.tick(0); shell.tick(80);
  assert.equal(shell.getSnapshot().phase, "gameover");
  assert.equal(steps, 1);
  assert.equal(shell.getSnapshot().lastResult.score, 12);
});

test("dev animation preview is explicit, cannot affect cabinet mode, and respects live preference normally", () => {
  const previous = process.env.HOSA_MOTION_PREVIEW;
  try {
    process.env.HOSA_MOTION_PREVIEW = "full";
    const cabinet = createHosaShell({ devMode: false, matchMedia: () => ({ matches: true }) });
    assert.equal(cabinet.reduceMotion, true);
    const preview = createHosaShell({ devMode: true, matchMedia: () => ({ matches: true }) });
    assert.equal(preview.reduceMotion, false);
    delete process.env.HOSA_MOTION_PREVIEW;
    let change;
    const regular = createHosaShell({ devMode: true, matchMedia: () => ({ matches: false, addEventListener: (_, cb) => { change = cb; } }) });
    regular._setInputSource("keyboard");
    assert.equal(regular._motionAllowed(), true);
    change({ matches: true });
    assert.equal(regular._motionAllowed(), false);
  } finally {
    if (previous === undefined) delete process.env.HOSA_MOTION_PREVIEW;
    else process.env.HOSA_MOTION_PREVIEW = previous;
  }
});

test("endless Lab results reconcile banked and current score and label circuit progress", () => {
  const f = fixture();
  f.shell.selected = 1;
  f.shell.startSession();
  f.shell._event({ type: "sessionEnd", result: {
    score: 9425, bankedScore: 9175, currentCircuitScore: 250,
    bestProgress: 1.08, circuitsCleared: 1, levelsCleared: 3,
    attemptsRemaining: 0, completed: true,
  } });
  f.shell.showResults();
  assert.match(f.screen.innerHTML, /BANKED 9175 \+ CURRENT 250/);
  assert.match(f.screen.innerHTML, /CIRCUITS CLEARED 1 · STAGES 3/);
  assert.match(f.screen.innerHTML, /BEST 1 CIRCUIT \+ 8%/);
});

test("countdown waits for release and advances no simulation before GO", () => {
  const f = fixture(); tick(f,0); tick(f,1,[2]);
  assert.equal(f.shell.phase,"countdown");
  for(let t=251;t<=3251;t+=250)tick(f,t,[2]);
  assert.equal(f.shell.countdown.remaining,3);
  assert.equal(f.calls.filter(Array.isArray).length,0);
  tick(f,3252);
  for(let t=3502;t<=6002;t+=250)tick(f,t);
  assert.equal(f.shell.phase,"countdown");
  assert.equal(f.calls.filter(Array.isArray).length,0);
  tick(f,6252);
  assert.equal(f.shell.phase,"playing");
  assert.equal(f.calls.filter(Array.isArray).length,0);
  tick(f,6273);
  assert.equal(f.calls.filter(Array.isArray).length,1);
});
test("tutorial completion creates clean scored session and skips do not save scores",()=>{
  const f=fixture();tick(f,0);tick(f,1,[0]);
  assert.equal(f.shell.phase,"tutorial");
  f.shell._event({type:"sessionEnd",result:{score:9999}});
  assert.equal(f.values.size,0);
  f.shell._event({type:"tutorialComplete"});
  assert.equal(f.shell.phase,"countdown");
  assert.equal(f.calls.filter(x=>x==="start").length,2);
  assert.equal(f.calls.filter(x=>x==="dispose").length,1);
});
test("game over lasts 1.5 seconds, accepts a controller name, saves once, then A returns to selector",async()=>{
  const f=fixture(); tick(f,0); f.shell.startSession(); finishCountdown(f.shell);
  f.shell._event({type:"sessionEnd",result:{score:50}});
  f.shell._event({type:"sessionEnd",result:{score:999}});
  assert.equal(f.shell.lastResult.score,50);
  assert.equal(f.shell.phase,"gameover");
  tick(f,0);for(let t=250;t<=1250;t+=250)tick(f,t,[0]);
  assert.equal(f.shell.phase,"gameover");tick(f,1500,[0]);
  assert.equal(f.shell.phase,"nameEntry");
  tick(f,1501); tick(f,1502,[0]); tick(f,1503);
  for(let n=0;n<4;n++){tick(f,1504+n*2,[13]);tick(f,1505+n*2);}
  tick(f,1512,[14]);tick(f,1513);tick(f,1514,[0]);
  await new Promise((resolve)=>setImmediate(resolve));
  assert.equal(f.shell.phase,"ended");
  assert.equal(f.leaderboardEntries.length,1);
  assert.equal(f.leaderboardEntries[0].name,"A");
  tick(f,1515);tick(f,1516,[0]);
  assert.equal(f.shell.phase,"menu");
});
test("disconnect freezes countdown and reconnect requires a new countdown confirmation",()=>{
  const f=fixture();tick(f,0);f.shell.startSession();tick(f,250);
  f.setPads([null]);f.shell.tick(500);assert.equal(f.shell.phase,"paused");
  tick(f,750);assert.equal(f.shell.phase,"paused");tick(f,1000,[0]);
  assert.equal(f.shell.phase,"countdown");assert.equal(f.shell.countdown.remaining,3);
});


test("practice X stays in the lesson; skipping is explicit in pause options", () => {
  const f = fixture(); tick(f, 0); tick(f, 1, [0]); tick(f, 2);
  tick(f, 25, [2]);
  assert.equal(f.shell.phase, "tutorial");
  assert.ok(f.calls.some(call => Array.isArray(call) && call[2].specialPressed));
  tick(f, 26); tick(f, 27, [9]);
  assert.equal(f.shell.phase, "paused");
  assert.match(f.screen.innerHTML, /SKIP TO GAME/);
  tick(f, 28); tick(f, 29, [2]);
  assert.equal(f.shell.phase, "countdown");
  assert.equal(f.calls.filter(call => call === "dispose").length, 1);
  assert.equal(f.values.size, 0);
});

test("practice pause B returns to menu without a scored-run confirmation", () => {
  const f = fixture(); tick(f, 0); tick(f, 1, [0]); tick(f, 2);
  tick(f, 3, [9]); tick(f, 4); tick(f, 5, [1]);
  assert.equal(f.shell.phase, "menu");
  assert.equal(f.values.size, 0);
});

function rewardFixture(context = "scored") {
  let pads = [pad()];
  let emit;
  const screen = { innerHTML: "" };
  let pending = {
    id: "wave-2",
    kind: "core",
    context,
    wave: 2,
    offers: [
      { id: "spread", title: "SPREAD", description: "More lanes.", category: "weapon", preview: "spread", detail: "+2 shots" },
      { id: "barrier", title: "BARRIER", description: "More cover.", category: "ability", preview: "barrier", detail: "+shield" },
      { id: "focus", title: "FOCUS", description: "More power.", category: "perk", detail: "+damage" },
    ],
    rerollsRemaining: 1,
    canSkip: true,
  };
  const calls = [];
  const game = {
    startSession() {}, step() {}, render() {}, pause() { calls.push("pause"); }, resume() { calls.push("resume"); }, dispose() {},
    getSnapshot() { return { pendingReward: pending, weaponName: "BASE", abilityName: "PULSE", perks: ["CALM"] }; },
    chooseUpgrade(id) { calls.push(["choose", id]); pending = null; return true; },
    rerollUpgrade() { calls.push("reroll"); pending = { ...pending, rerollsRemaining: 0, offers: pending.offers.slice().reverse() }; return true; },
    skipUpgrade() { calls.push("skip"); pending = null; return true; },
  };
  const shell = createHosaShell({
    navigator: { getGamepads: () => pads }, screen,
    factories: { cellDefender: ({ onEvent }) => { emit = onEvent; return game; } },
    audio: { play() {}, toggleMute() { return false; } },
  });
  shell.startSession(context === "tutorial" ? "tutorial" : "scored");
  if (context === "scored") { shell.awaitRelease = false; finishCountdown(shell); }
  emit({ type: "upgradeRequested" });
  shell.tick(1);
  return { shell, game, screen, calls, emit, setPads(value) { pads = value; } };
}

test("upgrade requests use the snapshot, gate input, and send the selected card once", () => {
  const f = rewardFixture();
  assert.equal(f.shell.phase, "upgrade");
  assert.equal(f.shell.rewardSelected, 0);
  f.shell.tick(2); // Release first; a held stick must not select a card.
  f.shell.tick(3); // Fresh right edge selects only one card.
  f.setPads([pad([15])]); f.shell.tick(4);
  assert.equal(f.shell.rewardSelected, 1);
  f.setPads([pad()]); f.shell.tick(5);
  f.setPads([pad([0])]); f.shell.tick(6);
  assert.deepEqual(f.calls.find(Array.isArray), ["choose", "barrier"]);
  assert.equal(f.shell.phase, "countdown");
});

test("reward navigation keeps rendered cards and updates their selected state", () => {
  const f = rewardFixture();
  const labels = [{ textContent: "SELECTED" }, { textContent: "" }, { textContent: "" }];
  const cards = labels.map((label) => ({
    classList: { toggle(_name, value) { this.selected = value; } },
    attributes: new Map(),
    setAttribute(name, value) { this.attributes.set(name, value); },
    querySelector(selector) { return selector === "[data-reward-selection]" ? label : null; },
  }));
  const view = { querySelectorAll(selector) { return selector === ".reward-card" ? cards : []; } };
  f.screen.querySelector = (selector) => selector === ".reward-view" ? view : null;
  const markup = f.screen.innerHTML;

  f.shell.rewardSelected = 2;
  f.shell._renderReward();

  assert.equal(f.screen.innerHTML, markup);
  assert.equal(cards[0].classList.selected, false);
  assert.equal(cards[2].classList.selected, true);
  assert.equal(cards[0].attributes.get("aria-selected"), "false");
  assert.equal(cards[2].attributes.get("aria-current"), "true");
  assert.equal(labels[0].textContent, "");
  assert.equal(labels[2].textContent, "SELECTED");
});

test("changed reward offers with the same card count replace stale card content", () => {
  const f = rewardFixture();
  const cards = f.shell.reward.offers.map(() => ({
    classList: { toggle() {} },
    setAttribute() {},
    querySelector() { return { textContent: "" }; },
  }));
  const view = { querySelectorAll(selector) { return selector === ".reward-card" ? cards : []; } };
  f.screen.querySelector = (selector) => selector === ".reward-view" ? view : null;
  f.shell.reward = {
    ...f.shell.reward,
    offers: f.shell.reward.offers.map((offer, index) => index === 1 ? { ...offer, title: "UPDATED BARRIER" } : offer),
  };

  f.shell._renderReward();

  assert.match(f.screen.innerHTML, /UPDATED BARRIER/);
});

test("tutorial reward clears its view before resuming the model", () => {
  const f = rewardFixture("tutorial");
  let markupAtResume;
  f.game.resume = () => {
    markupAtResume = f.screen.innerHTML;
    f.calls.push("resume");
  };

  f.shell.tick(2);
  f.setPads([pad([0])]); f.shell.tick(3);

  assert.equal(f.shell.phase, "tutorial");
  assert.equal(markupAtResume, "");
  assert.equal(f.shell.awaitRelease, true);
});

test("tutorial reward resolution requires release before it passes a fresh A to the model", () => {
  const f = rewardFixture("tutorial");
  const actions = [];
  f.game.step = (_dt, input) => actions.push(input.actionPressed);

  f.shell.tick(2);
  f.setPads([pad([0])]); f.shell.tick(3);
  f.shell.tick(23);
  f.setPads([pad()]); f.shell.tick(43);
  f.setPads([pad([0])]); f.shell.tick(63);

  assert.deepEqual(actions, [false, false, true]);
});

test("upgrade rerolls and keeps a pending tutorial reward paused across reconnect", () => {
  const f = rewardFixture("tutorial");
  f.shell.tick(2);
  f.setPads([pad([2])]); f.shell.tick(3);
  assert.ok(f.calls.includes("reroll"));
  assert.equal(f.shell.phase, "upgrade");
  f.setPads([null]); f.shell.tick(4);
  assert.equal(f.shell.phase, "paused");
  f.setPads([pad()]); f.shell.tick(5);
  f.setPads([pad([0])]); f.shell.tick(6);
  assert.equal(f.shell.phase, "upgrade");
  assert.match(f.screen.innerHTML, /CHOOSE AN UPGRADE/);
  assert.equal(f.calls.filter((call) => call === "resume").length, 0);
  f.setPads([pad()]); f.shell.tick(7);
  f.setPads([pad([0])]); f.shell.tick(8);
  assert.equal(f.shell.phase, "tutorial");
  assert.equal(f.calls.filter((call) => call === "resume").length, 1);
});

test("applying the dev sandbox taints the current run and writes no score records", () => {
  const f = fixture({ devMode: true });
  tick(f, 0);
  f.shell.startSession();
  finishCountdown(f.shell);

  assert.equal(f.shell.toggleSandbox(), true);
  assert.equal(f.shell.phase, "sandbox");
  assert.equal(f.shell.applySandbox({
    weaponId: "fan",
    abilityId: "barrier",
    perks: { power: 7, breakthrough: 3 },
    wave: "25",
    invincible: true,
  }), true);
  assert.equal(f.shell.phase, "countdown");
  assert.equal(f.shell.runUnscored, true);
  const call = f.calls.find((value) => Array.isArray(value) && value[0] === "sandbox");
  assert.equal(call[1].wave, 25);
  assert.equal(call[1].weaponId, "fan");
  assert.equal(call[1].perks.power, 7);

  f.shell._event({ type: "sessionEnd", result: { score: 9000, wave: 25 } });
  assert.equal(f.values.size, 0);
  f.shell.gameOverRemaining = 0;
  tick(f, 4000);
  assert.equal(f.shell.phase, "ended");
  assert.equal(f.leaderboardEntries.length, 0);
  assert.match(f.screen.innerHTML, /SANDBOX · UNSCORED/);
});

test("dev sandbox forwards explicit boss phase and pattern selections to the model", () => {
  const f = fixture({ devMode: true });
  tick(f, 0);
  f.shell.startSession();
  finishCountdown(f.shell);
  assert.equal(f.shell.toggleSandbox(), true);
  assert.equal(f.shell.applySandbox({ wave: "10", bossPhase: "patience", bossPattern: "orbitGaps" }), true);
  const call = f.calls.find((value) => Array.isArray(value) && value[0] === "sandbox");
  assert.equal(call[1].wave, 10);
  assert.equal(call[1].bossPhase, "patience");
  assert.equal(call[1].bossPattern, "orbitGaps");
});

test("cancelling the dev sandbox restores play without mutating or tainting the run", () => {
  const f = fixture({ devMode: true });
  f.shell.startSession();
  finishCountdown(f.shell);
  assert.equal(f.shell.phase, "playing");
  assert.equal(f.shell.toggleSandbox(), true);
  assert.equal(f.shell.cancelSandbox(), true);
  assert.equal(f.shell.phase, "playing");
  assert.equal(f.shell.runUnscored, false);
  assert.equal(f.calls.some((value) => Array.isArray(value) && value[0] === "sandbox"), false);
  assert.ok(f.calls.includes("resume"));
});

test("production ignores F2 and does not expose the run sandbox", () => {
  const doc = keyboardDocument();
  const shell = createHosaShell({
    document: doc,
    screen: { innerHTML: "" },
    navigator: { getGamepads: () => [pad()] },
    devMode: false,
    factories: { cellDefender: emptyGame },
    audio: { play() {}, toggleMute() { return false; } },
    leaderboard: { async append() {}, async list() { return []; } },
  });
  shell.startSession();
  assert.equal(doc.emit("keydown", "F2"), false);
  assert.equal(shell.phase, "countdown");
  assert.equal(shell.toggleSandbox(), false);
});

test("name entry reports save failures and retries the same run without a false saved result", async () => {
  let attempts = 0;
  const saved = [];
  const f = fixture({
    leaderboard: {
      async append(entry) {
        attempts += 1;
        if (attempts === 1) throw new Error("disk unavailable");
        saved.push(entry);
        return entry;
      },
      async list() { return saved.slice(); },
    },
  });
  f.shell.startSession();
  const runId = f.shell.runId;
  f.shell._event({ type: "sessionEnd", result: { score: 88, wave: 6 } });
  f.shell.showNameEntry();
  f.shell.nameEntry.name = "TEAM_10";

  assert.equal(await f.shell.saveNameEntry(), false);
  assert.equal(f.shell.phase, "nameEntry");
  assert.match(f.screen.innerHTML, /COULD NOT BE SAVED/);
  assert.equal(saved.length, 0);

  assert.equal(await f.shell.saveNameEntry(), true);
  assert.equal(f.shell.phase, "ended");
  assert.equal(saved.length, 1);
  assert.equal(saved[0].runId, runId);
  assert.equal(saved[0].name, "TEAM_10");
});

test("development game controls leave operating-system shortcuts alone", () => {
  const doc = keyboardDocument();
  const shell = createHosaShell({document:doc,screen:{innerHTML:""},devMode:true,navigator:{getGamepads:()=>[]},audio:{play(){},toggleMute(){}},leaderboard:{async list(){return []},async append(){}}});
  assert.equal(doc.emit("keydown","KeyW",{metaKey:true}),false);
  assert.equal(doc.emit("keydown","KeyS",{ctrlKey:true}),false);
  assert.equal(shell.keys.size,0);
});

test("sandbox catalog exposes all 22 weapons with tier groups and full ancestor paths", () => {
  const catalog = sandboxCatalog();
  assert.equal(catalog.weapons.length, 22);
  assert.deepEqual(new Set(catalog.weapons.map((weapon) => weapon.tier)), new Set([0, 1, 2, 3]));
  for (const weapon of catalog.weapons) {
    assert.ok(weapon.path && !weapon.path.includes("undefined"), `missing path for ${weapon.id}`);
    if (weapon.tier === 3) assert.match(weapon.path, /→/);
  }
  assert.match(catalog.weapons.find((weapon) => weapon.id === "tempest")?.path || "", /Spread.*Fan.*Tempest/);
  assert.match(catalog.weapons.find((weapon) => weapon.id === "sentinel")?.path || "", /Seeker.*Drones.*Sentinel/);
});
