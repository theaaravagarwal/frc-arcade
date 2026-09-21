"use strict";
// Native Electron RAF profiler for Cell Defender. Fast-forward setup is excluded
// from samples; the measured interval always uses the cabinet's normal RAF/tick.
const { spawn } = require("node:child_process");
const { mkdtemp, rm, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { encounterTypeForWave } = require("../renderer/games/cellDefender");
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const requestedWaves = String(process.env.HOSA_PROFILE_WAVES || "10,20,30,50")
  .split(",").map(value => Number(value.trim())).filter(value => Number.isInteger(value) && value > 0);
const profileWaves = requestedWaves.length ? requestedWaves : [10, 20, 30, 50];
// A run never exceeds this aggregate RAF budget. Boss setup is explicitly
// sandboxed and unscored; the sampled interval crosses every live phase.
const profileSeconds = Math.min(120, Math.max(.5, Number(process.env.HOSA_PROFILE_SECONDS || 120) || 120));
const profileSecondsPerCase = Math.max(.5, profileSeconds / profileWaves.length);
const profileWeapon = process.env.HOSA_PROFILE_WEAPON || "";
const outputIndex = process.argv.indexOf("--out");
const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : null;
const labelForWave = wave => {
  const encounterType = encounterTypeForWave(wave);
  return `wave-${wave}${encounterType ? `-${encounterType}` : ""}`;
};

function percentile(values, percentile) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percentile) - 1)];
}
function summarize(label, allRows) {
  const rows=allRows.filter(row=>row.phase==="playing" && row.wave);
  const gaps = rows.slice(1).map((row, index) => row.start - rows[index].start);
  const ticks = rows.map(row => row.duration);
  const worst = rows.reduce((a, b) => !a || b.duration > a.duration ? b : a, null);
  return {
    label,
    frames: rows.length,
    excludedNonPlayingFrames: allRows.length-rows.length,
    frameGapMs: { p50: percentile(gaps, .5), p95: percentile(gaps, .95), max: Math.max(0, ...gaps) },
    hostTickMs: { p50: percentile(ticks, .5), p95: percentile(ticks, .95), max: Math.max(0, ...ticks) },
    peaks: {
      warnings: Math.max(0, ...rows.map(row => row.warnings)),
      bullets: Math.max(0, ...rows.map(row => row.bullets)),
      shots: Math.max(0, ...rows.map(row => row.shots)),
      hitParticles: Math.max(0, ...rows.map(row => row.effects?.hitParticles || 0)),
      trails: Math.max(0, ...rows.map(row => row.effects?.trails || 0)),
    },
    worstTick: worst && {
      durationMs: worst.duration,
      gapBeforeMs: worst.gap,
      wave: worst.wave,
      bossPhase: worst.bossPhase,
      warnings: worst.warnings,
      bullets: worst.bullets,
      enemies: worst.enemies,
      shots: worst.shots,
      effects: worst.effects,
      substate: worst.substate,
    },
  };
}

(async () => {
  const profile = await mkdtemp(path.join(tmpdir(), "hosa-cell-profile-"));
  const port = 9700 + Math.floor(Math.random() * 200);
  const child = spawn(require("electron"), [".", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`], {
    cwd: path.resolve(__dirname, ".."), env: { ...process.env, NODE_ENV: "development" }, stdio: "ignore",
  });
  let ws;
  try {
    let pages;
    for (let i = 0; i < 80; i++) {
      try {
        pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        if (pages.some(page => page.type === "page")) break;
      } catch (_) {}
      await wait(100);
    }
    assert.ok(pages, "Electron did not expose a CDP page");
    ws = new WebSocket(pages.find(page => page.type === "page").webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    let id = 0;
    const pending = new Map();
    const errors = [];
    ws.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.method === "Runtime.exceptionThrown") errors.push(message.params);
      if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); }
    };
    const call = (method, params = {}) => new Promise(resolve => { pending.set(++id, resolve); ws.send(JSON.stringify({ id, method, params })); });
    const evaluate = async expression => {
      const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      assert.ok(!result.result?.exceptionDetails, JSON.stringify(result));
      return result.result.result.value;
    };
    await call("Runtime.enable");
    await call("Emulation.setFocusEmulationEnabled", { enabled: true });
    for (let i = 0; i < 80; i++) {
      if (await evaluate("typeof shell !== 'undefined' && Boolean(shell.presentationRuntime)")) break;
      await wait(100);
    }
    assert.equal(await evaluate("shell.presentationRuntime?.getSnapshot().version"), "4.2.1");

    const raw = [];
    for (const targetWave of profileWaves) {
      raw.push(await evaluate(`(() => new Promise(resolve => {
        shell.stop();
        shell.selected = 0;
        shell.startSession("scored");
        shell.countdown = null;
        shell.phase = "playing";
        shell.game.resume();
        const game = shell.game;
        // Assisted setup only, excluded from samples. Major-boss defaults use
        // direct unscored state selection so one bounded trace reaches every
        // health phase and the real timed survival sequence.
        const major = ${targetWave} % 10 === 0;
        if (!game.applySandbox(major ? { wave: ${targetWave}, bossPhase: "assault", invincible: true } : { wave: ${targetWave}, invincible: true })) throw new Error("Profile sandbox setup was rejected");
        shell.phase = "playing"; shell.countdown = null; shell._html(""); game.resume();
        if (getComputedStyle(document.getElementById("engineCanvas")).visibility !== "visible") throw new Error("Profile requires a visible combat canvas");
        game.__test.setShip(60, 670);
        game.__test.setShield(true);
        if (${JSON.stringify(profileWeapon)}) game.__test.setBuild({weaponId:${JSON.stringify(profileWeapon)},abilityId:"overdrive",perks:{overclock:5,burstCore:1,power:5}});
        game.render();
        shell.presentationRuntime.frame(0);
        const rows = [], phaseGates = [4, 8, 12]; let gated = 0, profileStart = 0;
        const originalTick = shell.tick.bind(shell);
        shell.tick = function profiledTick(time) {
          const start = performance.now();
          profileStart ||= start;
          if (major && gated < phaseGates.length && (start - profileStart) / 1000 >= phaseGates[gated]) {
            const boss = game.getSnapshot().enemies.find(enemy => enemy.type === "majorboss");
            if (boss) { game.__test.damageEnemy(boss.id, boss.maxHp * 2); gated++; }
          }
          const result = originalTick(time);
          const end = performance.now();
          const snapshot = shell.game && shell.game.getSnapshot();
          const previous = rows[rows.length - 1];
          rows.push({
            phase: shell.phase, start, duration: end - start, gap: previous ? start - previous.start : 0,
            wave: snapshot?.wave, bossPhase: snapshot?.enemies?.find(e => e.type === "miniboss" || e.type === "majorboss")?.phase || 0,
            bossMode: snapshot?.enemies?.find(e => e.type === "miniboss" || e.type === "majorboss")?.mode || null,
            warnings: snapshot?.warnings?.length || 0, bullets: snapshot?.counts?.hostileBullets || 0,
            enemies: snapshot?.counts?.enemies || 0, shots: snapshot?.counts?.shots || 0,
            effects: snapshot?.effects, substate: snapshot?.substate,
          });
          return result;
        };
        shell.lastTime = null;
        shell.start();
        setTimeout(() => {
          shell.stop();
          shell.tick = originalTick;
          resolve(rows);
        }, ${profileSecondsPerCase * 1000});
      }))()`));
    }
    const result = raw.map((rows, index) => {
      const major = profileWaves[index] % 10 === 0;
      const modeTrace = [...new Set(rows.map(row => row.bossMode).filter(Boolean))];
      const collapsed = rows.some(row => row.substate === "breather" && !row.bossMode);
      if (major) {
        for (const mode of ["assault", "mutation", "rage", "patience"]) assert.ok(modeTrace.includes(mode), `wave ${profileWaves[index]} profile missed ${mode}`);
        for (const mode of ["assault", "mutation", "rage", "patience"]) assert.ok(rows.some(row => row.bossMode === mode && row.bullets > 0), `wave ${profileWaves[index]} profile did not observe live ${mode} bullets`);
        assert.ok(collapsed, `wave ${profileWaves[index]} profile missed patience collapse`);
      }
      return {
        ...summarize(labelForWave(profileWaves[index]), rows),
        assistedSetup: true,
        intendedPhaseTrace: major ? ["assault", "mutation", "rage", "patience", "collapse"] : ["regular"],
        phaseTrace: modeTrace.concat(collapsed ? ["collapse"] : []),
      };
    });
    const json = JSON.stringify(result, null, 2);
    if (outputPath) await writeFile(path.resolve(outputPath), `${json}\n`);
    console.log(json);
    assert.deepEqual(errors, []);
  } finally {
    ws?.close();
    child.kill();
    await new Promise(resolve => { if (child.exitCode !== null) resolve(); else child.once("exit", resolve); });
    await rm(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
