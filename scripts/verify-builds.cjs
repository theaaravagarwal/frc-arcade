"use strict";
// Native Electron smoke: no server, browser driver, or global tool installation.
const { spawn } = require("node:child_process");
const { mkdtemp, rm, mkdir, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const profile = await mkdtemp(path.join(tmpdir(), "hosa-engine-"));
  const port = 9300 + Math.floor(Math.random() * 500);
  const child = spawn(require("electron"), [".",`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,...process.argv.slice(2)], {
    cwd:path.resolve(__dirname,".."),env:{...process.env,NODE_ENV:"development"},stdio:"ignore",
  });
  let ws;
  try {
    let pages;
    for(let i=0;i<60;i++) {
      try { pages=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();if(pages.some(p=>p.type==="page"))break; } catch {}
      await wait(100);
    }
    assert.ok(pages,"Electron did not expose its debug endpoint");
    ws=new WebSocket(pages.find(p=>p.type==="page").webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
    let id=0;const pending=new Map(),errors=[];
    ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.method==="Runtime.exceptionThrown")errors.push(m.params);if(m.method==="Runtime.consoleAPICalled"&&m.params.type==="error")errors.push(m.params.args.map(a=>a.description||a.value));if(m.id){pending.get(m.id)(m);pending.delete(m.id);}};
    const call=(method,params={})=>new Promise(resolve=>{pending.set(++id,resolve);ws.send(JSON.stringify({id,method,params}));});
    const evaluate=async expression=>{const r=await call("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});assert.ok(!r.result?.exceptionDetails,JSON.stringify(r));return r.result.result.value;};
    await call("Runtime.enable");await call("Emulation.setFocusEmulationEnabled",{enabled:true});
    for(let i=0;i<60;i++){if(await evaluate("typeof shell !== 'undefined' && Boolean(shell.presentationRuntime)"))break;await wait(100);}
    assert.equal(await evaluate("shell.presentationRuntime?.getSnapshot().version"),"4.2.1",JSON.stringify(errors));
    assert.deepEqual(await evaluate("shell.games.map(g=>g.id)"),["cellDefender"]);
    assert.equal(await evaluate("document.querySelectorAll('.scene.dash').length"),0);
    await evaluate("shell.stop()");
    const shots=path.join(tmpdir(),"hosa-builds");await mkdir(shots,{recursive:true});
    const capture=async name=>{const r=await call("Page.captureScreenshot",{format:"png"});await writeFile(path.join(shots,name+".png"),Buffer.from(r.result.data,"base64"));};
    await call("Emulation.setDeviceMetricsOverride",{width:1280,height:720,deviceScaleFactor:1,mobile:false});
    await evaluate(`(()=>{
      window.buildCheckTime=1000;
      window.buildCheckTap=code=>{
        shell.keys.clear();shell.keyEdges.clear();shell.tick(buildCheckTime+=20);
        shell.keys.add(code);shell.keyEdges.add(code);shell.tick(buildCheckTime+=20);
        shell.keys.clear();shell.tick(buildCheckTime+=20);
      };
      window.buildCheckCountdown=()=>{
        shell.keys.clear();shell.keyEdges.clear();
        for(let i=0;i<20&&shell.phase==='countdown';i++)shell.tick(buildCheckTime+=250);
      };
      window.buildCheckReward=()=>{
        const g=shell.game;
        for(let rounds=0;rounds<20&&!g.getSnapshot().pendingReward;rounds++) {
          g.__test.clearWave();for(let i=0;i<105&&!g.getSnapshot().pendingReward;i++)g.step(.02,{});
        }
        g.render();shell.presentationRuntime.frame(0);
        return g.getSnapshot().pendingReward;
      };
      shell.startSession();buildCheckCountdown();
    })()`);
    let reward=await evaluate("buildCheckReward()");assert.equal(reward.kind,"core");assert.equal(reward.wave,3);
    assert.equal(await evaluate("shell.phase"),"upgrade");await capture("core-720");
    const frozen=await evaluate("JSON.stringify(shell.game.getSnapshot())");
    await evaluate("for(let i=0;i<100;i++)shell.tick(buildCheckTime+=20)");
    assert.equal(await evaluate("JSON.stringify(shell.game.getSnapshot())"),frozen,"Reward previews advanced simulation");
    await evaluate("buildCheckTap('ArrowRight');buildCheckTap('Space')");
    assert.equal(await evaluate("shell.phase"),"countdown");
    assert.equal(await evaluate("shell.game.getSnapshot().pendingReward"),null);
    await evaluate("buildCheckCountdown()");
    assert.equal(await evaluate("shell.phase"),"playing");
    assert.equal(await evaluate("getComputedStyle(document.getElementById('engineCanvas')).visibility"),"visible","Combat canvas stays visible after choosing a reward");
    const chosen=await evaluate("shell.game.getSnapshot().build");assert.notEqual(chosen.weaponId,"base");
    reward=await evaluate("buildCheckReward()");assert.equal(reward.kind,"draft");assert.equal(reward.wave,5);
    assert.equal(reward.offers.length,3);assert.equal(reward.rerollsRemaining,1);
    await capture("draft-720");
    await call("Emulation.setDeviceMetricsOverride",{width:1920,height:1080,deviceScaleFactor:1,mobile:false});await capture("draft-1080");
    await call("Emulation.setDeviceMetricsOverride",{width:1280,height:720,deviceScaleFactor:1,mobile:false});
    await evaluate("buildCheckTap('KeyX')");
    const rerolled=await evaluate("shell.game.getSnapshot().pendingReward");assert.equal(rerolled.rerollsRemaining,0);
    await evaluate("buildCheckTap('KeyX')");assert.deepEqual(await evaluate("shell.game.getSnapshot().pendingReward"),rerolled);
    await evaluate("buildCheckTap('KeyP')");assert.equal(await evaluate("shell.phase"),"paused");
    await evaluate("buildCheckTap('Space')");assert.equal(await evaluate("shell.phase"),"upgrade");
    assert.deepEqual(await evaluate("shell.game.getSnapshot().pendingReward"),rerolled);
    await evaluate("buildCheckTap('Escape')");assert.equal(await evaluate("shell.phase"),"countdown");
    assert.equal(await evaluate("shell.game.getSnapshot().build.weaponId"),chosen.weaponId);
    await evaluate("buildCheckCountdown()");
    reward=await evaluate("buildCheckReward()");assert.equal(reward.kind,"evolution");assert.equal(reward.wave,10);
    await capture("evolution-720");
    await evaluate("buildCheckTap('Space');buildCheckCountdown()");
    assert.notEqual(await evaluate("shell.game.getSnapshot().build.weaponId"),chosen.weaponId);
    assert.equal(await evaluate("shell.phase"),"playing");
    await evaluate(`(()=>{
      shell._html('');const g=shell.game;for(let i=0;i<105;i++)g.step(.02,{});g.__test.clearWave();
      g.__test.setBuild({weaponId:'drones',abilityId:'barrier',perks:{power:8,overclock:5,focus:1,magnet:3,thrusters:2,chargeCoil:3,burstCore:1}});
      g.__test.setCharge(2);g.__test.setShip(640,610);
      for(const x of [560,640,720]){const e=g.__test.spawn('tank',x,400);Object.assign(e,{hp:1000,maxHp:1000,cool:999,vx:0,active:true});}
      g.__test.spawnDrop('charge',500,550);
      for(let i=0;i<25;i++)g.step(.02,{specialPressed:i===0});
      g.render();shell.presentationRuntime.frame(0);
    })()`);
    await capture("drones-barrier-charge-720");
    await evaluate(`(()=>{
      const g=shell.game;g.__test.setBuild({weaponId:'chain',perks:{burstCore:1}});
      for(let i=0;i<100;i++){g.step(.02,{});if(g.getSnapshot().effects.chains)break;}
      g.render();shell.presentationRuntime.frame(0);
    })()`);
    await capture("chain-combat-720");
    await evaluate("shell.endRun()");assert.equal(await evaluate("shell.presentationRuntime.getSnapshot().objects"),0);
    assert.deepEqual(errors,[]);
    console.log(`Native rewards: wave 3 core, wave 5 draft/reroll/pause/skip, wave 10 evolution, frozen simulation, keyboard navigation, screenshots ${shots}`);
  } finally {
    ws?.close();child.kill();
    await new Promise(resolve=>{if(child.exitCode!==null)resolve();else child.once("exit",resolve);});
    await rm(profile,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
