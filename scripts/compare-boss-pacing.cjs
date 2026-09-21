"use strict";
// Assisted pacing probe: boss movement and attacks run normally; a refreshed
// shield removes survival as a variable. This is not a human fight-time claim.
const assert = require('node:assert/strict');
const {createGame,bossHealthForWave}=require('../renderer/games/cellDefender');
function probe(wave,weaponId,y){
 const g=createGame({canvas:{width:1280,height:720,getContext:()=>({})},presentation:()=>{},random:()=>.5});
 g.startSession();g.__test.setWave(wave-1);g.__test.clearWave();g.step(.02);
 for(let i=0;i<101;i++)g.step(.02);
 assert.equal(g.getSnapshot().enemies[0].maxHp,bossHealthForWave(wave));
 g.__test.setBuild({weaponId,perks:{power:wave<10?0:wave<20?1:2}});g.__test.setShip(640,y);
 let frames=0;const patterns=new Set(),modes=new Set(),modeFrames={};
 while(frames<9000){
  const s=g.getSnapshot(),boss=s.enemies.find(e=>['miniboss','majorboss'].includes(e.type));if(!boss)break;
  if(boss.lastPattern)patterns.add(boss.lastPattern);
  modes.add(boss.mode);modeFrames[boss.mode]=(modeFrames[boss.mode]||0)+1;
  g.__test.setShield(true);
  g.step(.02,{moveX:Math.max(-1,Math.min(1,(boss.x-s.ship.x)/7.6))});frames++;
 }
 const modeSeconds=Object.fromEntries(Object.entries(modeFrames).map(([mode,count])=>[mode,Number((count*.02).toFixed(2))]));
 g.dispose();return {wave,weaponId,playerY:y,hp:bossHealthForWave(wave),seconds:frames===9000?null:Number((frames*.02).toFixed(2)),patternsSeen:patterns.size,modesSeen:[...modes],modeSeconds};
}
const rows=[];
for(const [wave,weapons] of [[5,['spread','lance','seeker']],[10,['spread','lance','seeker']],[15,['fan','barrage','rail','chain','swarm','drones']],[20,['fan','barrage','rail','chain','swarm','drones']]])
 for(const weapon of weapons)for(const y of [350,610])rows.push(probe(wave,weapon,y));
console.log(JSON.stringify({notes:'Assisted, deterministic moving-boss aim probe. Player follows boss horizontally at fixed height. Refreshed shield prevents death; no specials. Mode dwell time includes guarded transitions and the major-boss survival test. Power ranks 0/1/1/2 at waves 5/10/15/20. null = 180-second timeout. Real dodging/player skill are not modeled.',rows},null,2));
