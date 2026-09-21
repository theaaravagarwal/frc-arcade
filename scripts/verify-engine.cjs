"use strict";
// Native Electron smoke: no server, browser driver, or global tool installation.
const { spawn } = require("node:child_process");
const { mkdtemp, rm } = require("node:fs/promises");
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
    for(let selected=0;selected<1;selected++) {
      for(let cycle=0;cycle<12;cycle++) {
        const result=await evaluate(`(()=>{
          shell.selected=${selected};shell.startSession('tutorial');
          for(let i=0;i<100;i++){shell.game.step(.02,{moveX:.3,actionDown:i%40<15});shell.game.render();shell.presentationRuntime.frame(.02);}
          const before=shell.game.getSnapshot();shell.game.pause();
          for(let i=0;i<5;i++)shell.presentationRuntime.frame(0);
          return {engine:shell.presentationRuntime.getSnapshot(),same:JSON.stringify(before)===JSON.stringify({...shell.game.getSnapshot(),paused:before.paused})};
        })()`);
        assert.equal(result.engine.canvasCount,1);assert.equal(result.engine.autonomousLoop,false);assert.ok(result.engine.objects>0);assert.ok(result.same);
        await evaluate("shell.endRun()");
        assert.equal(await evaluate("shell.presentationRuntime.getSnapshot().objects"),0);
      }
    }
    await call("Emulation.setDeviceMetricsOverride",{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
    assert.equal(await evaluate("document.querySelector('#engineCanvas').getBoundingClientRect().width"),1920);
    assert.equal(await evaluate("document.querySelectorAll('img.control-prompt').length===2 && Array.from(document.querySelectorAll('img.control-prompt')).every(i=>i.complete&&i.naturalWidth>0)"),true);
    assert.deepEqual(errors,[]);
    console.log("Phaser 4.2.1: Cell-only selector, 12 session cycles, pause parity, one canvas, host-owned loop, 1080p sizing, no runtime exceptions.");
  } finally {
    ws?.close();child.kill();
    await new Promise(resolve=>{if(child.exitCode!==null)resolve();else child.once("exit",resolve);});
    await rm(profile,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
