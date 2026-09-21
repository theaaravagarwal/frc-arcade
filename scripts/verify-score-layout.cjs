"use strict";
// Native Electron smoke: no server, browser driver, or global tool installation.
const { spawn } = require("node:child_process");
const { mkdtemp, rm, mkdir, writeFile } = require("node:fs/promises");
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
    const output=path.join(tmpdir(),`hosa-score-layout-${reduced?'reduced':'full'}`);await mkdir(output,{recursive:true});
    const capture=async name=>{const r=await call('Page.captureScreenshot',{format:'png'});await writeFile(path.join(output,name+'.png'),Buffer.from(r.result.data,'base64'));};
    const key=async(code,down)=>call('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',code,key:code==='Space'?' ':code});
    const tap=async code=>{await key(code,true);await wait(40);await key(code,false);await wait(40);};
    const until=async(expression,label)=>{for(let n=0;n<90;n++){if(await evaluate(expression))return;await wait(80);}throw new Error(label);};
    await call('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
    try{
      // Assisted presentation-only check; full controls/save flow lives in test:startup.
      await evaluate(`shell.startSession();shell._event({type:'sessionEnd',result:{score:490,wave:5}});shell.gameOverRemaining=999`);
      for(const [width,height] of [[1280,720],[1920,1080]]){
        await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
        await evaluate('shell.showNameEntry();shell.nameEntry.name="WWWWWWWWWWWWWWWW";shell._renderNameEntry()');
        await wait(300);await capture(`name-${height}`);
        assert.equal(await evaluate(`(()=>{const r=document.querySelector('.name-entry-panel').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;})()`),true,'Name panel must fit '+height);
        await evaluate(`shell.leaderboardRows=Array.from({length:11},(_,i)=>({name:i===0?'WWWWWWWWWWWWWWWW':'PLAYER '+(i+1),score:100000-i,runId:i===10?shell.runId:'fixture-'+i}));shell.ownRank=11;shell.showResults()`);
        await wait(300);await capture(`results-${height}`);
        assert.equal(await evaluate(`(()=>{const r=document.querySelector('.results-leaderboard').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;})()`),true,'Leaderboard must fit '+height);
        assert.equal(await evaluate("document.querySelectorAll('.results-leaderboard li').length"),11);
        assert.equal(await evaluate(`(()=>{const p=document.querySelector('.results-leaderboard').getBoundingClientRect();return [...document.querySelectorAll('.results-leaderboard li > *')].every(e=>{const r=e.getBoundingClientRect();return r.left>=p.left&&r.right<=p.right+1;});})()`),true,'Long names must not overlap score columns');
      }
      assert.deepEqual(errors,[]);
      console.log(`PASS 720p/1080p name entry and full leaderboard layout. ${output}`);
    }catch(error){await capture('failure');await writeFile(path.join(output,'failure.json'),JSON.stringify(await evaluate('({phase:shell.phase,keys:[...shell.keys],buttons:shell.previousButtons,countdown:shell.countdown,awaitRelease:shell.awaitRelease})'),null,2));throw error;}
  }finally{
    ws?.close();child.kill();await new Promise(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',resolve);});await rm(profile,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
