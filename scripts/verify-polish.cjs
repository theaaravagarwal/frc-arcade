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
    const shots = path.join(tmpdir(), "hosa-polish"); await mkdir(shots,{recursive:true});
    const capture=async name=>{const shot=await call("Page.captureScreenshot",{format:"png"});await writeFile(path.join(shots,name+".png"),Buffer.from(shot.result.data,"base64"));};
    await call("Emulation.setDeviceMetricsOverride",{width:1280,height:720,deviceScaleFactor:1,mobile:false});
    await evaluate("document.fonts.ready"); await capture("menu-720");
    await call("Emulation.setDeviceMetricsOverride",{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
    await capture("menu-1080");
    await call("Emulation.setDeviceMetricsOverride",{width:1280,height:720,deviceScaleFactor:1,mobile:false});
    await evaluate("shell.startSession('tutorial'); shell.game.render(); shell.presentationRuntime.frame(0)");
    for(let lesson=0;lesson<5;lesson++) {
      await capture(`practice-${lesson}-active`);
      const success=await evaluate(`(()=>{
        const g=shell.game;
        for(let frame=0;frame<2500;frame++) {
          const s=g.getSnapshot(); if(s.tutorial.status==='success') break;
          const input={}; const id=s.tutorial.lessonId;
          if(s.pendingReward) { shell._checkReward(); shell.rewardSelected=0; shell._resolveReward('choose',s.pendingReward.offers[0].id); continue; }
          if(id==='move-fire') input.moveX=Math.max(-1,Math.min(1,(s.enemies[0].x-s.ship.x)/8));
          if(id==='dodge') input.moveX=s.ship.x>180?-1:0;
          if(id==='upgrade'&&s.powerups.length) { input.moveX=Math.max(-1,Math.min(1,(s.powerups[0].x-s.ship.x)/8)); input.moveY=Math.max(-1,Math.min(1,(s.powerups[0].y-s.ship.y)/8)); }
          if(id==='pulse')input.specialPressed=frame%20===1;
          g.step(.02,input);g.render();shell.presentationRuntime.frame(.02);
        }
        g.render();shell.presentationRuntime.frame(0);return g.getSnapshot();
      })()`);
      assert.equal(success.tutorial.status,"success",JSON.stringify(success.tutorial));
      assert.equal(success.score,0);assert.equal(success.lives,3);
      await capture(`practice-${lesson}-success`);
      await evaluate("shell.game.step(.02,{});shell.game.step(.02,{actionPressed:true});shell.game.render();shell.presentationRuntime.frame(0)");
    }
    assert.equal(await evaluate("shell.phase"),"countdown");await capture("countdown");
    await evaluate(`(()=>{
      shell.countdown=null;shell.phase='playing';shell._html('');shell.game.resume();
      const g=shell.game;
      for(let round=0;g.getSnapshot().wave<10&&round<50;round++){
        const reward=g.getSnapshot().pendingReward;
        if(reward){g.chooseUpgrade(reward.offers[0].id);shell.phase='playing';shell.countdown=null;shell._html('');g.resume();}
        if(g.getSnapshot().wave>=10)break;
        g.__test.clearWave();for(let i=0;i<105;i++)g.step(.02,{});
      }
      g.__test.setShip(60,630);g.__test.setShield(true);
      for(let i=0;i<800;i++){g.step(.02,{});if(g.getSnapshot().warnings.some(w=>w.kind==='boss-laneCurtain'))break;}
      g.render();shell.presentationRuntime.frame(0);
    })()`);
    await capture("boss-charge");
    await evaluate("for(let i=0;i<47;i++){shell.game.step(.02,{});shell.game.render();shell.presentationRuntime.frame(.02)}");
    await capture("boss-release");
    await evaluate("shell.endRun()");
    assert.equal(await evaluate("shell.presentationRuntime.getSnapshot().objects"),0);
    console.log(`Practice: all five lessons completed using movement/pulse inputs, clean countdown, screenshots ${shots}`);
    assert.deepEqual(errors,[]);

  } finally {
    ws?.close();child.kill();
    await new Promise(resolve=>{if(child.exitCode!==null)resolve();else child.once("exit",resolve);});
    await rm(profile,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
