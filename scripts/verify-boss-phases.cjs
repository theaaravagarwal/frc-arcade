"use strict";
// Native Electron validation; sandbox captures are deliberately unscored.
const { spawn } = require("node:child_process");
const { mkdtemp, rm, mkdir, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const profile = await mkdtemp(path.join(tmpdir(), "hosa-boss-phases-"));
  const port = 9300 + Math.floor(Math.random() * 500);
  const child = spawn(require("electron"), [".", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`], { cwd: path.resolve(__dirname, ".."), env: { ...process.env, NODE_ENV: "development", HOSA_LEADERBOARD_PATH: path.join(profile, "scores.json") }, stdio: "ignore" });
  let ws;
  try {
    let pages;
    for (let i = 0; i < 80; i++) { try { pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (pages.some(page => page.type === "page")) break; } catch {} await wait(100); }
    assert.ok(pages, "Electron did not expose its debug endpoint");
    ws = new WebSocket(pages.find(page => page.type === "page").webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    let id = 0; const pending = new Map(), errors = [];
    ws.onmessage = event => { const message = JSON.parse(event.data); if (message.method === "Runtime.exceptionThrown") errors.push(message.params); if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") errors.push(message.params.args.map(arg => arg.description || arg.value)); if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); } };
    const call = (method, params = {}) => new Promise(resolve => { pending.set(++id, resolve); ws.send(JSON.stringify({ id, method, params })); });
    const evaluate = async expression => { const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); assert.ok(!result.result?.exceptionDetails, JSON.stringify(result)); return result.result.result.value; };
    await call("Runtime.enable"); await call("Emulation.setFocusEmulationEnabled", { enabled: true });
    for (let i = 0; i < 80; i++) { if (await evaluate("typeof shell !== 'undefined' && Boolean(shell.presentationRuntime)")) break; await wait(100); }
    await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    const output = path.join(tmpdir(), "hosa-boss-phases"); await mkdir(output, { recursive: true });
    const capture = async name => { const shot = await call("Page.captureScreenshot", { format: "png" }); await writeFile(path.join(output, `${name}.png`), Buffer.from(shot.result.data, "base64")); };
    const phase = async (name, bossPhase, bossPattern, wave = 10) => {
      const state = await evaluate(`(() => { shell.stop(); shell.startSession(); shell.countdown=null; shell.phase='playing'; shell._html(''); shell.game.resume(); if (!shell.game.applySandbox({wave:${wave},bossPhase:'${bossPhase}',bossPattern:'${bossPattern}',invincible:true})) throw new Error('sandbox setup rejected'); let s; for(let i=0;i<180;i++){s=shell.game.step(.02,{moveX:i%80<40?.35:-.35});if(s.warnings.length)break;} shell.game.render();shell.presentationRuntime.frame(0);const b=s.enemies[0];return {mode:b.mode,phase:b.phase,comboId:b.comboId,beat:b.beat,warning:s.warnings[0]?.kind,emitters:s.emitters.length,hazards:s.hazards.length,sandbox:s.sandbox}; })()`);
      assert.equal(state.mode, bossPhase); assert.equal(state.sandbox, true); assert.ok(state.warning?.startsWith("boss-")); assert.ok(state.emitters > 0); await capture(name); return state;
    };
    const assault = await phase("assault", "assault", "crossingStreams");
    const mutation = await phase("mutation", "mutation", "delayedBlooms"); assert.ok(mutation.hazards > 0, "delayed blooms create native visible hazards");
    assert.equal(await evaluate(`(() => { let s; for(let i=0;i<100;i++){s=shell.game.step(.02,{});if(s.hazards.some(area=>area.state==='active'))break;}shell.game.render();shell.presentationRuntime.frame(0);return s.hazards.some(area=>area.state==='active'); })()`), true, "native capture reaches active bloom state"); await capture("mutation-hazard-active");
    const rage = await phase("rage", "rage", "sweepPursuit");
    const patience = await phase("patience", "patience", "crossingStreams"); assert.deepEqual([patience.mode, patience.phase], ["patience", 4]);
    const rotation = await phase("patience-rotation", "patience", "orbitGaps", 20); assert.deepEqual([rotation.mode, rotation.phase], ["patience", 4]);
    await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    assert.equal(await evaluate("shell.game.render();shell.presentationRuntime.frame(0);shell.game.getSnapshot().reducedMotion"), true, "uses actual model reduced-motion state"); await capture("patience-reduced-motion");
    const progression = await evaluate(`(() => { shell.stop();shell.startSession();shell.countdown=null;shell.phase='playing';shell.game.resume();shell.game.__test.setWave(9);shell.game.__test.clearWave();for(let i=0;i<102;i++)shell.game.step(.02,{});for(let i=0;i<46;i++)shell.game.step(.02,{});let b=shell.game.getSnapshot().enemies[0];shell.game.__test.damageEnemy(b.id,1e6);let s=shell.game.getSnapshot(),mutation=[Math.round(s.enemies[0].hp),s.enemies[0].mode];for(let i=0;i<40;i++)shell.game.step(.02,{});b=shell.game.getSnapshot().enemies[0];shell.game.__test.damageEnemy(b.id,1e6);s=shell.game.getSnapshot();const rage=[Math.round(s.enemies[0].hp),s.enemies[0].mode];for(let i=0;i<40;i++)shell.game.step(.02,{});b=shell.game.getSnapshot().enemies[0];shell.game.__test.damageEnemy(b.id,1e6);s=shell.game.getSnapshot();const patience=[Math.round(s.enemies[0].hp),s.enemies[0].mode,s.enemies[0].modeDuration];for(let i=0;i<530&&s.enemies.length;i++){shell.game.__test.setHostile([]);s=shell.game.step(.02,{moveX:i%70<35?.5:-.5});}return {mutation,rage,patience,enemies:s.enemies.length,rewardWave:s.pendingReward?.wave,substate:s.substate}; })()`);
    assert.deepEqual(progression.mutation, [234, "mutation"]); assert.deepEqual(progression.rage, [126, "rage"]); assert.deepEqual(progression.patience, [36, "patience", 10]); assert.equal(progression.enemies, 0); assert.equal(progression.rewardWave, 10, "normal victory reaches reward");
    await evaluate("shell.endRun();shell.startSession();shell.countdown=null;shell.phase='playing';shell.game.resume()"); assert.ok(await evaluate("shell.game.getSnapshot().counts.enemies>0"), "new run replays"); await evaluate("shell.endRun()"); assert.equal(await evaluate("shell.presentationRuntime.getSnapshot().objects"), 0);
    assert.deepEqual(errors, []); console.log(`Boss states ${assault.mode}, ${mutation.mode}, ${rage.mode}, ${patience.mode}; gates/reward/replay verified; captures ${output}`);
  } finally { ws?.close(); child.kill(); await new Promise(resolve => { if (child.exitCode !== null) resolve(); else child.once("exit", resolve); }); await rm(profile, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
