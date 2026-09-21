"use strict";

// Cell Defender's sprites are native-resolution pixel paintings.  The small
// drawing vocabulary below keeps the atlas readable in source while producing
// complete 32, 64 and 96 pixel frames (rather than scaled-up icon art).
const FRAMES = Object.create(null);
const PALETTES = Object.create(null);
const ACTORS = Object.create(null);

const COLORS = {
  emitter: ["", "#101a38", "#26496a", "#64dcca", "#a6fff1", "#eafffb", "#e4497d", "#7b315c"],
  healthy: ["", "#102746", "#287a88", "#56cdb5", "#9af4cf", "#edfff1", "#f3b64d", "#24566d"],
  drifter: ["", "#211943", "#6e315c", "#d34b82", "#ff9fbd", "#ffe4ed", "#8d295d", "#3a2055"],
  aimed: ["", "#1d1742", "#50306d", "#9a57c3", "#e2a9ff", "#fff0ff", "#e84e91", "#352052"],
  tank: ["", "#261a42", "#743250", "#bd4c68", "#f59a74", "#fff0d1", "#e45172", "#47254d"],
  diver: ["", "#20153d", "#64285e", "#bd3e8d", "#ff9ed8", "#fff0fb", "#e354a4", "#402054"],
  skirmisher: ["", "#23153c", "#70305a", "#d54878", "#ff9bc0", "#ffe6ef", "#ef4e86", "#3c204e"],
  bulwark: ["", "#291634", "#77334a", "#be4c61", "#f98972", "#fff0d5", "#eb4a67", "#4b223d"],
  orbiter: ["", "#24133b", "#6b285e", "#c13c8b", "#ff92d1", "#fff0fb", "#ec4aa1", "#3d1c55"],
  miniboss: ["", "#1b173d", "#542953", "#a83b73", "#ff739f", "#ffb9cf", "#fff1d7", "#73215e"],
  majorboss: ["", "#17153c", "#48245b", "#962d70", "#ed467d", "#ff9dbd", "#fff0d4", "#6d1e64"],
};

function board(w, h) { return Array.from({ length: h }, () => Array(w).fill("0")); }
function dot(a, x, y, color) {
  x = Math.round(x); y = Math.round(y);
  if (a[y] && a[y][x] !== undefined) a[y][x] = color.toString(16);
}
function box(a, x, y, w, h, color) {
  x = Math.round(x); y = Math.round(y); w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  for (let yy=y; yy<y+h; yy++) for (let xx=x; xx<x+w; xx++) dot(a, xx, yy, color);
}
function oval(a, cx, cy, rx, ry, color) {
  for (let y=Math.floor(cy-ry); y<=Math.ceil(cy+ry); y++) for (let x=Math.floor(cx-rx); x<=Math.ceil(cx+rx); x++) {
    const dx=(x-cx)/rx, dy=(y-cy)/ry;
    if (dx*dx + dy*dy <= 1) dot(a, x, y, color);
  }
}
function line(a, x0, y0, x1, y1, color) {
  const n=Math.max(Math.abs(x1-x0), Math.abs(y1-y0));
  for (let i=0; i<=n; i++) dot(a, Math.round(x0+(x1-x0)*i/n), Math.round(y0+(y1-y0)*i/n), color);
}
function triangle(a, x1, y1, x2, y2, x3, y3, color) {
  const minX=Math.floor(Math.min(x1,x2,x3)), maxX=Math.ceil(Math.max(x1,x2,x3));
  const minY=Math.floor(Math.min(y1,y2,y3)), maxY=Math.ceil(Math.max(y1,y2,y3));
  const area=(x2-x1)*(y3-y1)-(y2-y1)*(x3-x1);
  for (let y=minY;y<=maxY;y++) for (let x=minX;x<=maxX;x++) {
    const a1=(x2-x1)*(y-y1)-(y2-y1)*(x-x1), a2=(x3-x2)*(y-y2)-(y3-y2)*(x-x2), a3=(x1-x3)*(y-y3)-(y1-y3)*(x-x3);
    if (area >= 0 ? a1>=0 && a2>=0 && a3>=0 : a1<=0 && a2<=0 && a3<=0) dot(a,x,y,color);
  }
}
function blob(a, cx, cy, rx, ry, phase, colors) {
  // A low-frequency contour gives each membrane an intentionally irregular,
  // hand-pixeled silhouette. Subsequent passes make an ink outline and lit rim.
  for (let y=Math.floor(cy-ry-2); y<=Math.ceil(cy+ry+2); y++) for (let x=Math.floor(cx-rx-2); x<=Math.ceil(cx+rx+2); x++) {
    const dx=(x-cx)/rx, dy=(y-cy)/ry, angle=Math.atan2(dy, dx);
    const edge=1 + .075*Math.sin(angle*5+phase) + .045*Math.cos(angle*3-phase*1.7);
    const r=Math.sqrt(dx*dx+dy*dy);
    if (r <= edge) dot(a,x,y,1);
    if (r <= edge-.07) dot(a,x,y, y > cy+ry*.16 ? 2 : 3);
    if (r <= edge-.22) dot(a,x,y,3);
    // A warm, crisp rim makes the cell volume read on navy backgrounds.
    if (r <= edge && r > edge-.19 && dx < -.08 && dy < .48) dot(a,x,y,4);
  }
  oval(a,cx-rx*.25,cy-ry*.28,Math.max(1,rx*.22),Math.max(1,ry*.12),4);
  oval(a,cx-rx*.33,cy-ry*.34,Math.max(1,rx*.08),Math.max(1,ry*.045),5);
  // membrane pores
  dot(a,Math.round(cx+rx*.62),Math.round(cy-ry*.28),4);
  dot(a,Math.round(cx-rx*.66),Math.round(cy+ry*.30),3);
  dot(a,Math.round(cx+rx*.38),Math.round(cy+ry*.54),4);
  dot(a,Math.round(cx-rx*.42),Math.round(cy+ry*.46),2);
}
function nucleus(a, cx, cy, rx, ry, phase, type) {
  oval(a,cx,cy,rx+1,ry+1,1); oval(a,cx,cy,rx,ry,6);
  oval(a,cx+Math.sin(phase)*Math.max(1,rx*.16),cy,Math.max(1,rx*.57),Math.max(1,ry*.62),3);
  oval(a,cx-rx*.20,cy-ry*.23,Math.max(1,rx*.19),Math.max(1,ry*.15),4);
  if (type === "aimed") { line(a,cx-rx*.8,cy,cx+rx*.8,cy,5); line(a,cx,cy-ry*.75,cx,cy+ry*.75,5); }
  if (type === "diver") { line(a,cx-rx*.5,cy-ry*.55,cx+rx*.6,cy+ry*.55,5); }
  if (type === "tank") { box(a,Math.round(cx-rx*.45),Math.round(cy-ry*.35),Math.max(2,Math.round(rx*.9)),Math.max(2,Math.round(ry*.7)),4); }
}
function ring(a, cx, cy, r, color) {
  for (let i=0; i<32; i++) { const t=i*Math.PI/16; dot(a,Math.round(cx+Math.cos(t)*r),Math.round(cy+Math.sin(t)*r),color); }
}
function armorPlate(a, cx, cy, w, h, tilt = 0) {
  oval(a,cx,cy,w+1,h+1,1); oval(a,cx,cy,w,h,4);
  box(a,cx-w*.55,cy-h*.18,w*1.1,Math.max(1,h*.32),3);
  dot(a,cx-w*.45,cy-h*.48,5); dot(a,cx+w*.45,cy+h*.48,2);
  if (tilt) line(a,cx-w*.55,cy+h*.42,cx+w*.55,cy-h*.42,2);
}
function cellFrame(type, state, index) {
  const boss = type === "miniboss" ? 64 : type === "majorboss" ? 96 : 32;
  const a=board(boss,boss), c=boss/2, phase=index*.71 + type.length*.39;
  const death=state === "death", progress=death ? index/5 : 0;
  const scale=death ? Math.max(.25,1-progress*.72) : state === "charge" ? 1 + index*.035 : 1;
  const rx=(boss*.30)*(type === "tank" ? 1.08 : type === "diver" ? .76 : 1)*scale;
  const ry=(boss*.265)*(type === "diver" ? 1.16 : 1)*scale;
  const bob=state === "idle" ? Math.round(Math.sin(phase)*1) : state === "charge" ? -index : 0;
  if (type === "emitter") {
    // A clean scientific drone: white ceramic cap, mint display, and antenna.
    oval(a,c,c+2,rx*.84,ry*.68,1); oval(a,c,c+2,rx*.72,ry*.57,5);
    oval(a,c,c+2,rx*.43,ry*.31,2); oval(a,c,c+2,rx*.29,ry*.20,3);
    box(a,c-2,Math.round(c+ry*.50),4,Math.max(2,Math.round(ry*.38)),2);
    box(a,c-1,Math.round(c+ry*.50),2,Math.max(2,Math.round(ry*.38)),4);
    line(a,c-5,c-ry*.4,c-8,c-ry*.75,2); line(a,c+5,c-ry*.4,c+8,c-ry*.75,2);
    dot(a,c-8,Math.round(c-ry*.75),4); dot(a,c+8,Math.round(c-ry*.75),4);
    box(a,c-1,c+1,2,2,5);
  } else if (type === "healthy") {
    blob(a,c,c+bob,rx*.91,ry*.91,phase,COLORS[type]);
    oval(a,c,c+bob,rx*.49,ry*.49,7); oval(a,c,c+bob,rx*.42,ry*.42,3);
    box(a,c-2,c-7+bob,4,14,5); box(a,c-7,c-2+bob,14,4,5);
    box(a,c-1,c-5+bob,2,10,4); box(a,c-5,c-1+bob,10,2,4);
  } else {
    blob(a,c,c+bob,rx,ry,phase,COLORS[type]);
    nucleus(a,c+(type === "drifter" ? Math.sin(phase)*2 : 0),c+bob,rx*.38,ry*.40,phase,type);
    if (type === "drifter") {
      oval(a,c-rx*.62,c-ry*.42+bob,Math.max(2,rx*.13),Math.max(2,ry*.13),4);
      oval(a,c+rx*.57,c+ry*.38+bob,Math.max(2,rx*.10),Math.max(2,ry*.10),4);
      oval(a,c+rx*.23,c-ry*.58+bob,Math.max(1,rx*.09),Math.max(1,ry*.09),5);
    }
    if (type === "aimed") { ring(a,c,c+bob,Math.round(rx*.71),4); }
    if (type === "tank") {
      // Tank cells have a plated carapace, visible rivets, and side pylons.
      for (const [x,y,t] of [[-.66,-.42,1],[.66,-.42,-1],[-.66,.42,-1],[.66,.42,1]]) armorPlate(a,c+x*rx,c+y*ry+bob,Math.max(2,rx*.17),Math.max(2,ry*.14),t);
      armorPlate(a,c,c-ry*.64+bob,Math.max(2,rx*.28),Math.max(2,ry*.12),0);
      box(a,c-rx*.98,c-3+bob,Math.max(2,rx*.21),6,1); box(a,c+rx*.77,c-3+bob,Math.max(2,rx*.21),6,1);
      box(a,c-rx*.94,c-1+bob,Math.max(1,rx*.14),2,5); box(a,c+rx*.80,c-1+bob,Math.max(1,rx*.14),2,5);
    }
    if (type === "diver") {
      // Fins give divers a vertical, dart-like silhouette rather than a round cell.
      triangle(a,c-rx*.42,c-ry*.28+bob,c-rx*1.28,c-ry*.86+bob,c-rx*.84,c+ry*.12+bob,1);
      triangle(a,c+rx*.42,c-ry*.28+bob,c+rx*1.28,c-ry*.86+bob,c+rx*.84,c+ry*.12+bob,1);
      triangle(a,c-rx*.38,c-ry*.26+bob,c-rx*1.14,c-ry*.72+bob,c-rx*.78,c+ry*.04+bob,4);
      triangle(a,c+rx*.38,c-ry*.26+bob,c+rx*1.14,c-ry*.72+bob,c+rx*.78,c+ry*.04+bob,4);
      line(a,c,c-ry*.9+bob,c,c-ry*1.23+bob,5); line(a,c,c+ry*.9+bob,c,c+ry*1.20+bob,4);
    }
    if (type === "skirmisher") {
      // Narrow kite and two needle pylons: it reads as a fast zig-zagger even
      // at the 32px atlas scale.
      triangle(a,c-rx*.52,c-ry*.7+bob,c,c-ry*1.34+bob,c+rx*.52,c-ry*.7+bob,1);
      triangle(a,c-rx*.35,c-ry*.67+bob,c,c-ry*1.14+bob,c+rx*.35,c-ry*.67+bob,4);
      line(a,c-rx*.74,c-ry*.08+bob,c-rx*1.15,c+ry*.38+bob,5);
      line(a,c+rx*.74,c-ry*.08+bob,c+rx*1.15,c+ry*.38+bob,5);
    }
    if (type === "bulwark") {
      // A broad armored hexagon with three dark vent bays is deliberately
      // unlike the round tank and remains inside the declared circle.
      for (const [x,y] of [[-.62,-.32],[0,-.52],[.62,-.32],[-.62,.34],[0,.54],[.62,.34]]) armorPlate(a,c+x*rx,c+y*ry+bob,Math.max(2,rx*.24),Math.max(2,ry*.17));
      for (const x of [-.42,0,.42]) box(a,c+x*rx-1,c+ry*.12+bob,3,Math.max(2,ry*.35),1);
    }
    if (type === "orbiter") {
      // Six satellite nodes leave a visible gap at the bottom; this is a ring
      // organism rather than another recolored membrane.
      for (let node=0; node<6; node++) {
        const angle=-Math.PI*.84 + node*Math.PI*.335;
        const x=c+Math.cos(angle)*rx*.92, y=c+bob+Math.sin(angle)*ry*.92;
        oval(a,x,y,Math.max(2,rx*.18),Math.max(2,ry*.18),1); oval(a,x,y,Math.max(1,rx*.11),Math.max(1,ry*.11),4);
      }
      ring(a,c,c+bob,Math.max(3,Math.round(rx*.53)),3);
      oval(a,c,c+bob,Math.max(2,rx*.19),Math.max(2,ry*.19),6);
    }
    if (type === "miniboss" || type === "majorboss") {
      const eyes=type === "majorboss" ? 3 : 2;
      for (let e=0; e<eyes; e++) { const x=c+(e-(eyes-1)/2)*rx*.58; oval(a,x,c-ry*.12+bob,rx*.16,ry*.17,1); oval(a,x,c-ry*.12+bob,rx*.11,ry*.12,5); oval(a,x+rx*.025,c-ry*.12+bob,rx*.045,ry*.065,6); }
      // Crown lobes and a bright, hostile mouth distinguish big bosses instantly.
      for (let i=-1;i<=1;i++) { oval(a,c+i*rx*.50,c-ry*.83+bob,rx*.19,ry*.18,1); oval(a,c+i*rx*.50,c-ry*.83+bob,rx*.13,ry*.11,4); }
      oval(a,c,c+ry*.42+bob,rx*.37,ry*.13,1); oval(a,c,c+ry*.42+bob,rx*.28,ry*.07,6);
      for (let i=-2;i<=2;i++) dot(a,c+i*rx*.10,c+ry*.42+bob,5);
      for (let i=-1;i<=1;i++) line(a,c+i*rx*.54,c+ry*.72+bob,c+i*rx*.72,c+ry*1.03+bob,4);
      ring(a,c,c+bob,Math.round(rx*.76),4);
    }
  }
  if (state === "charge") {
    ring(a,c,c+bob,Math.min(c-1,Math.round(rx*(1.05+index*.12))),4);
    for (let i=0;i<4;i++) {
      const t=phase+i*1.57, x=c+Math.cos(t)*rx*1.20, y=c+bob+Math.sin(t)*ry*1.20;
      oval(a,x,y,Math.max(1,rx*.08),Math.max(1,ry*.08),1); oval(a,x,y,Math.max(1,rx*.045),Math.max(1,ry*.045),5);
    }
  }
  if (state === "release") {
    const rr=Math.min(c-2,Math.round(rx*(.95+index*.19)));
    ring(a,c,c+bob,rr,5);
    for (let i=0;i<6;i++) { const t=phase+i*Math.PI/3; dot(a,Math.round(c+Math.cos(t)*rr*1.14),Math.round(c+bob+Math.sin(t)*rr*1.14),4); }
  }
  if (death) {
    // Dissolving pixels keep death readable without changing the actor's bound.
    for (let i=0;i<8;i++) { const t=phase+i*.79, d=rx*(.75+progress*.9); dot(a,Math.round(c+Math.cos(t)*d),Math.round(c+bob+Math.sin(t)*d),i%2 ? 4 : 6); }
    if (index > 3) ring(a,c,c+bob,Math.max(3,Math.round(rx*.55)),6);
  }
  return a.map(row => row.join(""));
}
function add(type, state, count) {
  const keys=[];
  for (let i=0;i<count;i++) { const key=`cell-${type}-${state}-${i}`; FRAMES[key]=cellFrame(type,state,i); PALETTES[key]=COLORS[type]; keys.push(key); }
  return keys;
}
for (const type of ["emitter","healthy","drifter","aimed","tank","diver","skirmisher","bulwark","orbiter","miniboss","majorboss"]) {
  ACTORS[type] = { idle:add(type,"idle",4), charge:add(type,"charge",3), release:add(type,"release",4), death:add(type,"death",6) };
}

module.exports = { FRAMES, PALETTES, ACTORS };
