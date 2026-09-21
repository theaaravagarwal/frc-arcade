"use strict";
// Native Electron smoke: no server, browser driver, or global tool installation.
const { spawn } = require("node:child_process");
const { mkdtemp, rm, mkdir, writeFile, readFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const gamepadMode = false;
  const profile = await mkdtemp(path.join(tmpdir(), "hosa-engine-"));
  const port = 9300 + Math.floor(Math.random() * 500);
  const child = spawn(require("electron"), [".",`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,...process.argv.slice(2).filter(arg=>!["--gamepad","--reduced-motion"].includes(arg))], {
    cwd:path.resolve(__dirname,".."),env:{...process.env,NODE_ENV:"development",HOSA_MOTION_PREVIEW:process.argv.includes("--reduced-motion")?"":"full",HOSA_LEADERBOARD_PATH:path.join(profile,"scores.json")},stdio:"ignore",
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
    if(process.argv.includes("--reduced-motion"))await call("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"reduce"}]});
    for(let i=0;i<60;i++){if(await evaluate("typeof shell !== 'undefined' && Boolean(shell.presentationRuntime)"))break;await wait(100);}
    assert.equal(await evaluate("shell.presentationRuntime?.getSnapshot().version"),"4.2.1",JSON.stringify(errors));
    assert.deepEqual(await evaluate("shell.games.map(g=>g.id)"),["cellDefender"]);
    assert.equal(await evaluate("document.querySelectorAll('.scene.dash').length"),0);
    const reduced=process.argv.includes('--reduced-motion');
    const output=path.join(tmpdir(),`hosa-sandbox-${reduced?'reduced':'full'}`);await mkdir(output,{recursive:true});
    const capture=async name=>{const r=await call('Page.captureScreenshot',{format:'png'});await writeFile(path.join(output,name+'.png'),Buffer.from(r.result.data,'base64'));};
    const key=async(code,down)=>call('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',code,key:code==='Space'?' ':code});
    const tap=async code=>{await key(code,true);await wait(40);await key(code,false);await wait(40);};
    const until=async(expression,label)=>{for(let n=0;n<90;n++){if(await evaluate(expression))return;await wait(80);}throw new Error(label);};
    await call('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
    try{
      await wait(350);
      await tap('KeyX');await until("shell.phase==='playing'",'scored startup');
      await tap('F2');await until("shell.phase==='sandbox'",'sandbox entry');
      await capture('sandbox');
      const frozen=await evaluate('JSON.stringify(shell.game.getSnapshot())');
      await wait(400);
      assert.equal(await evaluate('JSON.stringify(shell.game.getSnapshot())'),frozen,'Sandbox must pause combat');
      await tap('F2');
      assert.equal(await evaluate('shell.runUnscored'),false,'Cancel must preserve eligibility');
      await until("shell.phase==='playing'",'cancel resume');
      await tap('F2');
      await evaluate(`(()=>{const f=document.getElementById('sandboxForm');f.elements.namedItem('weaponId').value='rail';f.elements.namedItem('abilityId').value='overdrive';f.elements.namedItem('perk.power').value='4';f.elements.namedItem('wave').value='10';f.elements.namedItem('invincible').checked=true;f.requestSubmit();})()`);
      await until("shell.phase==='playing'",'sandbox apply/countdown');
      let state=await evaluate('shell.game.getSnapshot()');
      assert.equal(state.wave,10);assert.equal(state.build.weaponId,'rail');assert.equal(state.build.abilityId,'overdrive');
      assert.equal(state.sandbox,true);assert.equal(state.sandboxInvincible,true);
      assert.equal(state.enemies[0].type,'majorboss');
      assert.equal(await evaluate('shell.runUnscored'),true);
      assert.equal(await evaluate("document.getElementById('sandboxBadge').classList.contains('show')"),true);
      await capture('sandbox-applied');
      await tap('F2');
      await evaluate(`(()=>{const f=document.getElementById('sandboxForm');f.elements.namedItem('invincible').checked=false;f.requestSubmit();})()`);
      await until("shell.phase==='playing'",'second apply');
      assert.equal(await evaluate('shell.game.getSnapshot().sandboxInvincible'),false);
      assert.equal(await evaluate('shell.runUnscored'),true,'Taint survives invincibility off');
      // Assisted death only; the sandbox panel and countdown use normal DOM/RAF.
      for(let hit=0;hit<6;hit++){
        if(await evaluate("shell.phase!=='playing'"))break;
        await evaluate('(()=>{const s=shell.game.getSnapshot();shell.game.__test.setHostile([{x:s.ship.x,y:s.ship.y,vx:0,vy:0,r:5}]);})()');
        await wait(1600);
      }
      await until("shell.phase==='ended'",'unscored results without name entry');
      assert.match(await evaluate("document.getElementById('screen').textContent"),/UNSCORED/);
      await assert.rejects(readFile(path.join(profile,'scores.json'),'utf8'),{code:'ENOENT'});
      await capture('sandbox-results');
      await tap('Space');
      await until("shell.phase==='menu'",'return to menu');
      await tap('KeyX');
      await until("shell.phase==='playing' && shell.countdown===null",'fresh scored replay');
      assert.equal(await evaluate('shell.runUnscored'),false);
      for(let hit=0;hit<6;hit++){
        if(await evaluate("shell.phase!=='playing'"))break;
        await evaluate('(()=>{const s=shell.game.getSnapshot();shell.game.__test.setHostile([{x:s.ship.x,y:s.ship.y,vx:0,vy:0,r:5}]);})()');
        await wait(1600);
      }
      await until("shell.phase==='nameEntry'",'scored name entry');
      await tap('Space');
      assert.equal(await evaluate('shell.getSnapshot().nameEntry.name'),'A','Focused key must not double type');
      for(let n=0;n<4;n++)await tap('ArrowDown');
      for(let n=0;n<6;n++)await tap('ArrowRight');
      await tap('Space');await until("shell.phase==='ended'",'keyboard name save');
      const saved=JSON.parse(await readFile(path.join(profile,'scores.json'),'utf8'));
      assert.equal(saved.entries.length,1);assert.equal(saved.entries[0].name,'A');
      assert.deepEqual(errors,[]);
      console.log(`PASS sandbox: paused editing, cancel eligibility, rail/overdrive wave-10 jump, invincibility toggle, permanent unscored status, no sandbox score file, clean scored replay and dev keyboard name save. ${output}`);
    }catch(error){await capture('failure');await writeFile(path.join(output,'failure.json'),JSON.stringify(await evaluate('({phase:shell.phase,keys:[...shell.keys],buttons:shell.previousButtons,countdown:shell.countdown,awaitRelease:shell.awaitRelease})'),null,2));throw error;}
  }finally{
    ws?.close();child.kill();await new Promise(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',resolve);});await rm(profile,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
