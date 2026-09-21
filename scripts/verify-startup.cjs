"use strict";
// Native Electron smoke: no server, browser driver, or global tool installation.
const { spawn } = require("node:child_process");
const { mkdtemp, rm, mkdir, writeFile, readFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const gamepadMode = process.argv.includes("--gamepad");
  const profile = await mkdtemp(path.join(tmpdir(), "hosa-engine-"));
  // Existing saved competition fixture; no gameplay state is changed.
  await writeFile(path.join(profile,'scores.json'),JSON.stringify({version:1,entries:Array.from({length:10},(_,i)=>({runId:`fixture-${i}`,name:`PLAYER ${i+1}`,score:100000+i,wave:30,createdAt:'2026-09-13T00:00:00.000Z'}))}));
  const port = 9300 + Math.floor(Math.random() * 500);
  const child = spawn(require("electron"), [".",`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,...process.argv.slice(2).filter(arg=>!["--gamepad","--reduced-motion"].includes(arg))], {
    cwd:path.resolve(__dirname,".."),env:{...process.env,NODE_ENV:gamepadMode?"production":"development",HOSA_LEADERBOARD_PATH:path.join(profile,"scores.json")},stdio:"ignore",
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
    // Keep the application's RAF and all lifecycle handlers running normally.
    // The only writes to application memory below emulate a controller device.
    const output=path.join(tmpdir(),`hosa-startup-${gamepadMode?'controller':'keyboard'}`);
    await mkdir(output,{recursive:true});
    const capture=async name=>{
      const result=await call("Page.captureScreenshot",{format:"png"});
      await writeFile(path.join(output,`${name}.png`),Buffer.from(result.result.data,"base64"));
    };
    const read=()=>evaluate(`({phase:shell.phase,sessionKind:shell.sessionKind,game:shell.game?.getSnapshot(),cards:document.querySelectorAll('#screen .reward-view').length,screen:document.getElementById('screen').textContent,canvas:getComputedStyle(document.getElementById('engineCanvas')).visibility})`);
    const held=new Set();
    const buttons={Space:0,Escape:1,KeyX:2,KeyP:9,ArrowUp:12,ArrowDown:13,ArrowLeft:14,ArrowRight:15};
    if(gamepadMode) await evaluate(`window.testPad={id:'Startup verification controller',index:0,connected:true,mapping:'standard',axes:[0,0],buttons:Array.from({length:16},()=>({pressed:false,value:0}))};Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[window.testPad]})`);
    const setHeld=async codes=>{
      const next=new Set(codes);
      if(gamepadMode) {
        await evaluate(`window.testPad.buttons=Array.from({length:16},(_,i)=>({pressed:${JSON.stringify(codes.map(c=>buttons[c]))}.includes(i),value:${JSON.stringify(codes.map(c=>buttons[c]))}.includes(i)?1:0}))`);
      } else {
        for(const code of held) if(!next.has(code)) await call('Input.dispatchKeyEvent',{type:'keyUp',code,key:code==='Space'?' ':code});
        for(const code of next) if(!held.has(code)) await call('Input.dispatchKeyEvent',{type:'keyDown',code,key:code==='Space'?' ':code});
      }
      held.clear();for(const code of next)held.add(code);
    };
    const tap=async code=>{await setHeld([]);await wait(120);await setHeld([code]);await wait(100);await setHeld([]);await wait(140);};
    const until=async (predicate,label,timeout=12000)=>{
      const end=Date.now()+timeout;let state;
      while(Date.now()<end){state=await read();if(predicate(state))return state;await wait(80);}
      throw new Error(`${label} timed out: ${JSON.stringify(state)}`);
    };
    try {
      await wait(250);await capture('01-boot-menu');
      assert.equal((await read()).phase,'menu');
      if(gamepadMode){
        await call('Input.dispatchKeyEvent',{type:'keyDown',code:'Space',key:' '});await wait(150);
        await call('Input.dispatchKeyEvent',{type:'keyUp',code:'Space',key:' '});
        assert.equal((await read()).phase,'menu','Production keyboard must not start a run');
        await call('Input.dispatchKeyEvent',{type:'keyDown',code:'F2',key:'F2'});
        await call('Input.dispatchKeyEvent',{type:'keyUp',code:'F2',key:'F2'});
        assert.equal((await read()).phase,'menu','Production F2 must not open sandbox');
      }
      await tap('Space');await until(s=>s.phase==='tutorial','enter tutorial');
      const visited=new Set();let checkedCards=false;
      const tutorialEnd=Date.now()+65000;
      while(Date.now()<tutorialEnd){
        const s=await read();
        if(s.sessionKind==='scored')break;
        const t=s.game?.tutorial;
        assert.ok(t,'Tutorial snapshot exists');visited.add(t.lessonId);
        if(s.phase==='upgrade'){
          assert.equal(s.cards,1);assert.equal(s.game.paused,true);
          const frozen=JSON.stringify(s.game);await wait(350);assert.equal(JSON.stringify((await read()).game),frozen);
          await tap('KeyP');assert.equal((await read()).phase,'paused');
          await tap('Space');const restored=await read();assert.equal(restored.phase,'upgrade');assert.equal(restored.game.paused,true);
          if(gamepadMode){
            await evaluate('window.savedTestPad=window.testPad;window.testPad=null');await wait(150);assert.equal((await read()).phase,'paused');
            await evaluate('window.testPad=window.savedTestPad');await wait(150);await tap('Space');
            const reconnected=await read();assert.equal(reconnected.phase,'upgrade');assert.equal(reconnected.game.paused,true);
          }
          await tap('ArrowRight');await capture('02-weapon-cards');
          await setHeld(['Space']);await wait(350);
          const chosen=await read();
          assert.equal(chosen.phase,'tutorial');assert.equal(chosen.cards,0,'Confirmed tutorial cards must disappear before play resumes');
          assert.equal(chosen.canvas,'visible');assert.equal(chosen.game.tutorial.lessonId,'weapon-choice');assert.equal(chosen.game.tutorial.status,'success');
          await capture('03-choice-dismissed');console.log('Tutorial choice dismissed with fresh-confirm gate intact.');await setHeld([]);await wait(150);checkedCards=true;
          continue;
        }
        if(t.status==='success'){await tap('Space');continue;}
        const codes=[];
        if(t.lessonId==='move-fire'){
          const dx=s.game.enemies[0].x-s.game.ship.x;if(Math.abs(dx)>18)codes.push(dx>0?'ArrowRight':'ArrowLeft');
        } else if(t.lessonId==='dodge') {if(s.game.ship.x>230)codes.push('ArrowLeft');}
        else if(t.lessonId==='upgrade' && s.game.powerups.length){
          const p=s.game.powerups[0],dx=p.x-s.game.ship.x,dy=p.y-s.game.ship.y;
          if(Math.abs(dx)>15)codes.push(dx>0?'ArrowRight':'ArrowLeft');
          if(Math.abs(dy)>15)codes.push(dy>0?'ArrowDown':'ArrowUp');
        } else if(t.lessonId==='pulse'){await tap('KeyX');continue;}
        await setHeld(codes);await wait(80);
      }
      await setHeld([]);assert.equal(checkedCards,true);assert.equal(visited.size,5);
      await until(s=>s.phase==='playing'&&s.sessionKind==='scored'&&!s.screen.trim(),'clean scored countdown');
      let scored=await read();assert.equal(scored.game.wave,1);assert.equal(scored.game.build.weaponId,'base');assert.equal(scored.cards,0);
      await capture('04-scored-start');console.log('Five tutorial lessons complete; scored wave 1 started.');
      // Play the ordinary opening waves through movement and special inputs.
      const deadline=Date.now()+90000;
      while(Date.now()<deadline){
        const s=await read();if(s.phase==='upgrade')break;
        assert.equal(s.phase,'playing','Opening pilot survived to the first scored reward');
        const target=s.game.enemies.find(e=>e.active);
        const codes=[];
        if(target){const dx=target.x-s.game.ship.x;if(Math.abs(dx)>18)codes.push(dx>0?'ArrowRight':'ArrowLeft');}
        if(s.game.hostilebullets?.some(b=>Math.hypot(b.x-s.game.ship.x,b.y-s.game.ship.y)<100)&&s.game.chargeMeter>0)codes.push('KeyX');
        await setHeld(codes);await wait(80);
      }
      await setHeld([]);scored=await read();
      assert.equal(scored.phase,'upgrade');assert.equal(scored.game.pendingReward.wave,3);
      await tap('ArrowRight');await tap('ArrowRight');await tap('Space');
      await until(s=>s.phase==='playing'&&s.cards===0&&!s.screen.trim(),'scored choice countdown');
      await capture('05-scored-choice-dismissed');
      // Deliberately collide using controls to verify the normal game-over flow.
      // This changes no lives, score, enemies, or phase through test hooks.
      const lossDeadline=Date.now()+90000;
      while(Date.now()<lossDeadline){
        const s=await read();if(['gameover','nameEntry','ended'].includes(s.phase))break;
        if(s.phase==='upgrade'){await tap('Space');continue;}
        if(s.phase==='countdown'){await setHeld([]);await wait(100);continue;}
        const target=s.game.enemies.filter(e=>e.active).sort((a,b)=>Math.hypot(a.x-s.game.ship.x,a.y-s.game.ship.y)-Math.hypot(b.x-s.game.ship.x,b.y-s.game.ship.y))[0];
        const codes=[];
        if(target){
          const dx=target.x-s.game.ship.x,dy=target.y-s.game.ship.y;
          if(Math.abs(dx)>8)codes.push(dx>0?'ArrowRight':'ArrowLeft');
          if(Math.abs(dy)>8)codes.push(dy>0?'ArrowDown':'ArrowUp');
        }
        await setHeld(codes);await wait(80);
      }
      await setHeld([]);await until(s=>s.phase==='nameEntry','game over to name entry',6000);
      await capture('06-name-entry');
      await tap('Space'); // A is the first on-screen letter.
      for(let row=0;row<4;row++)await tap('ArrowDown');
      for(let col=0;col<6;col++)await tap('ArrowRight');
      await tap('Space'); // DONE: persist the named result.
      await until(s=>s.phase==='ended','name save to results',6000);await capture('06-results');
      const saved=JSON.parse(await readFile(path.join(profile,'scores.json'),'utf8'));
      assert.equal(saved.entries.length,11);assert.equal(saved.entries[10].name,'A');
      assert.ok(saved.entries[10].score>=0);assert.ok(saved.entries[10].runId);
      assert.equal(await evaluate('shell.ownRank'),11);

      await tap('Space');assert.equal((await read()).phase,'menu');
      await tap('KeyX');await until(s=>s.phase==='playing'&&!s.screen.trim(),'replay countdown');
      const replay=await read();assert.equal(replay.game.wave,1);assert.equal(replay.game.score,0);assert.equal(replay.game.lives,3);assert.equal(replay.game.build.weaponId,'base');
      await capture('07-clean-replay');
      assert.deepEqual(errors,[]);
      console.log(`PASS fresh boot (${gamepadMode?'production controller':'development keyboard'}): five tutorial lessons, paused cards, held-confirm gate, dismissed cards, clean scored start, naturally cleared waves 1–3, scored choice/countdown, natural game-over, controller name entry, durable score file, results, clean replay. Screenshots: ${output}`);
    } catch(error) {
      await capture('failure');await writeFile(path.join(output,'failure.json'),JSON.stringify(await read(),null,2));throw error;
    } finally {await setHeld([]);}
  } finally {
    ws?.close();child.kill();
    await new Promise(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',resolve);});
    await rm(profile,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
