"use strict";
// Controlled geometry probes, not a human difficulty rating. Stationary targets
// isolate coverage/aim tradeoffs from boss behavior and randomly timed attacks.
const assert = require("node:assert/strict");
const { createGame } = require("../renderer/games/cellDefender");
const { WEAPONS } = require("../renderer/games/cellDefender/weapons");
const context = new Proxy({}, { get: () => () => ({addColorStop(){}}) });
function probe(weaponId, positions, radius = 24) {
  const game = createGame({canvas:{width:1280,height:720,getContext:()=>context}, random:()=>.5, presentation:()=>{}, audio:{play(){}}});
  game.startSession();game.__test.clearWave();game.__test.setBuild({weaponId});game.__test.setShip(640,610);
  const targets = positions.map(([x,y])=>{
    const e=game.__test.spawn("tank",x,y);Object.assign(e,{hp:10000,maxHp:10000,vx:0,cool:999,active:true,r:radius});return e;
  });
  let peakShots=0;
  for(let i=0;i<500;i++) {game.step(.02,{});peakShots=Math.max(peakShots,game.getSnapshot().counts.shots);}
  const damage=targets.reduce((sum,e)=>sum+10000-e.hp,0);
  assert.ok(Number.isFinite(damage) && damage>0,weaponId);
  assert.ok(peakShots<=100,weaponId);
  game.dispose();
  return {damage:Number(damage.toFixed(2)),targetsHit:targets.filter(e=>e.hp<10000).length,peakShots};
}
const rows=Object.keys(WEAPONS).map(weapon=>({
  weapon,
  tier: WEAPONS[weapon].tier,
  parent: WEAPONS[weapon].parent || null,
  role: WEAPONS[weapon].role || null,
  single:probe(weapon,[[640,220]],55),
  wide:probe(weapon,[[430,220],[475,220],[545,220],[640,220],[735,220],[805,220],[850,220]]),
  column:probe(weapon,[[640,180],[640,260],[640,340]]),
}));
console.log(JSON.stringify({seconds:10,notes:"Stationary 10,000 HP targets; no perks. Includes projectile travel time. Different geometry should favor different builds.",rows},null,2));
