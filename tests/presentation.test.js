"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const factories = {
  cellDefender: require("../renderer/games/cellDefender").createGame,
  labDash: require("../renderer/games/labDash").createGame,
};
const canvas = () => ({width:1280,height:720,getContext:()=>new Proxy({}, {get:(_,key)=>key === "createLinearGradient" ? ()=>({addColorStop(){}}) : ()=>{},set:()=>true})});
for(const [name,createGame] of Object.entries(factories)) {
  test(`${name} presentation adapter preserves scored and tutorial simulation`,()=>{
    for(const sessionKind of ["scored","tutorial"]) {
      const eventsA=[], eventsB=[];let frames=0;
      const a=createGame({canvas:canvas(),random:()=>.5,sessionKind,onEvent:e=>eventsA.push(e)});
      const b=createGame({canvas:canvas(),random:()=>.5,sessionKind,onEvent:e=>eventsB.push(e),presentation:state=>{assert.ok(state);frames++;}});
      a.startSession();b.startSession();
      for(let i=0;i<1800;i++) {
        const input={moveX:Math.sin(i/30),moveY:Math.cos(i/45)*.2,actionDown:i%90<25,actionPressed:i%90===0,specialPressed:i%400===0};
        a.step(.02,input);b.step(.02,input);
        if (a.getSnapshot().pendingReward) {
          const card = a.getSnapshot().pendingReward.offers[0].id;
          assert.equal(a.chooseUpgrade(card),true); assert.equal(b.chooseUpgrade(card),true);
        }
        if(i%10===0) {a.render();b.render();assert.deepEqual(b.getSnapshot(),a.getSnapshot());}
        if(i===200){a.pause();b.pause();a.render();b.render();a.resume();b.resume();}
      }
      assert.deepEqual(eventsB,eventsA);assert.ok(frames>100);
      a.dispose();b.dispose();
    }
  });
}
