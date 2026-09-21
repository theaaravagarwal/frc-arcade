"use strict";
const { FRAMES: CELL_FRAMES, PALETTES: CELL_PALETTES, ACTORS: CELL_ACTORS } = require("./cellAtlas");

// Hand-authored pixel sprites. They are deliberately procedural: no asset load can
// delay a game frame, and every sprite is drawn with nearest-neighbour scaling.
const PALETTES = {
  cell: ["#111a35", "#263b70", "#62eadb", "#f5c400", "#ec245f", "#fff7d1"],
  lab: ["#151b3a", "#2e476f", "#62eadb", "#f5c400", "#ec245f", "#fff7d1"],
};
const BITMAPS = {
  shot: ["0550","0550","0550","0550","0550","0550","0220","0220"],
  hostile: ["0440","4554","4554","0440"],
  drifter: ["0001100000","0113311000","1133331100","1334433100","1333333100","1133331100","0113311000","0001100000","0000000000","0000000000"],
  aimed: ["0004400000","0144441000","1443344100","1435534100","1443344100","0144441000","0004400000","0001100000","0000000000","0000000000"],
  tank: ["0111111100","1133333110","1334443310","1345554310","1334443310","1133333110","0111111100","0001100000","0011110000","0000000000"],
  diver: ["0001100000","0013310000","0133331000","1134433100","1333333100","0133331000","0013310000","0001100000","0001000000","0000000000"],
  cell: ["0001100000","0113311000","1133331100","1334433100","1333333100","1133331100","0113311000","0001100000","0000000000","0000000000"],
  healthy: ["0002200000","0022220000","0222222000","0222522000","0222222000","0022220000","0002200000","0002200000","0000000000","0000000000"],
  emitter: ["00050000","00555000","01111100","11333110","11111110","00122100","00011000","00011000"],
  miniboss: ["0111111100","1133333110","1334443310","1345554310","1334443310","1133333110","0111111100","0010010000","0111111100","0000000000"],
  majorboss: ["1111111111","1333333331","1344444431","1345555431","1345555431","1344444431","1333333331","1111111111","0011001100","0111111110"],
  cube: ["01111110","12333321","13244231","13455431","13244231","12333321","01111110","00011000"],
  ship: ["000110000000","001331000000","011333110000","122333331100","125553333351","122333331100","011333110000","001331000000","000110000000"],
  wave: ["00000000","00005000","00055500","05555550","00055500","00005000","00000000","00000000"],
  flask: ["00011000","00011000","00111100","00122100","01222210","01222210","01111110","00000000"],
  ribbon: ["51111115","13333331","13222231","13333331","51111115","00000000","00000000","00000000"],
  powerup: ["00050000","00555000","05555550","55555555","05555550","00555000","00050000","00000000"],
  weapon: ["00000000","00050000","00555000","01111100","11111110","00110000","00110000","00000000"],
  rapid: ["00040000","00444000","04444400","00444000","00040000","00040000","00000000","00000000"],
  shield: ["00022000","00222200","02255220","02255220","00222200","00022000","00000000","00000000"],
  star: ["00040000","00444000","44444440","04444400","00444000","00040000","00000000","00000000"],
};
const SPRITE_PALETTES = {
  drifter: ["", "#501c4f", "#ffb7c9", "#ec5286", "#963062", "#fff2d1"],
  aimed: ["", "#35224f", "#d6b9ff", "#a578dd", "#6541a1", "#fff2d1"],
  tank: ["", "#59314c", "#ffe7b6", "#e59b59", "#ad574e", "#fff2d1"],
  diver: ["", "#4d1e55", "#ffbae0", "#df55b4", "#93387d", "#fff2d1"],
  healthy: ["", "#193953", "#67d8be", "#3f9eaa", "#28728a", "#fff8e0"],
  ribbon: ["", "#542545", "#ffafc9", "#ef548c", "#bd386c", "#ffe8e9"],
};
SPRITE_PALETTES.miniboss = SPRITE_PALETTES.tank;
SPRITE_PALETTES.majorboss = SPRITE_PALETTES.diver;
BITMAPS.healthy = ["000111111000","001222222100","012222222210","122225522221","122225522221","122555555221","122555555221","122225522221","122225522221","012222222210","001222222100","000111111000"];
BITMAPS.ribbon = ["000133100000","001355310000","013200231000","013200231000","001322310000","000133100000","000133100000","001332310000","013310331000","133100133100","131000013100","110000001100"];
const cache = new Map();
function makeCanvas(width, height) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  if (typeof document !== "undefined") { const c = document.createElement("canvas"); c.width = width; c.height = height; return c; }
  return null;
}
function pixelSource(name, frame = 0) {
  const actor = CELL_ACTORS[name];
  if (actor) {
    const key = actor.idle[Math.abs(frame) % actor.idle.length];
    return { key, pixels: CELL_FRAMES[key], palette: CELL_PALETTES[key] };
  }
  return { key: name, pixels: BITMAPS[name] || BITMAPS.cube, palette: SPRITE_PALETTES[name] || PALETTES.lab };
}
function sprite(name, frame = 0) {
  const source = pixelSource(name, frame);
  if (cache.has(source.key)) return cache.get(source.key);
  const { pixels, palette } = source, c = makeCanvas(pixels[0].length, pixels.length);
  if (!c) return null;
  const ctx = c.getContext("2d");
  pixels.forEach((row, y) => [...row].forEach((value, x) => { if (value !== "0") { ctx.fillStyle = palette[Number(value)] || palette[1]; ctx.fillRect(x, y, 1, 1); } }));
  cache.set(source.key, c); return c;
}
function drawSprite(ctx, name, x, y, width, height, { angle = 0, frame = 0 } = {}) {
  if (!ctx) return;
  const image = sprite(name, frame);
  ctx.save(); ctx.imageSmoothingEnabled = false;
  if (image) { ctx.translate(x, y); ctx.rotate(angle); ctx.drawImage(image, -width / 2, -height / 2, width, height); }
  else { ctx.fillStyle = (SPRITE_PALETTES[name] || PALETTES.lab)[3]; ctx.fillRect(x-width/2,y-height/2,width,height); }
  ctx.restore();
}
function drawLabBackground(ctx, { width, height, scroll = 0, palette = PALETTES.lab } = {}) {
  if (!ctx) return;
  ctx.save(); ctx.fillStyle = "#101d31"; ctx.fillRect(0,0,width,height);
  // Three quiet depth layers: structural bays, glass chambers, and work benches.
  const offset = -((scroll * 9) % 320);
  for (let x=offset-320; x<width+320; x+=320) {
    ctx.fillStyle="#1c3045"; ctx.fillRect(x+10,130,292,365);
    ctx.fillStyle="#29445a"; ctx.fillRect(x+20,140,272,6);
    ctx.fillStyle="#0a182b"; ctx.fillRect(x+38,170,115,210);
    ctx.fillStyle="#234c60"; ctx.fillRect(x+44,176,103,196);
    ctx.fillStyle="#306577"; ctx.fillRect(x+51,183,8,181);
    ctx.fillStyle="#76baaf"; ctx.fillRect(x+70,233,47,5);
    ctx.fillStyle="#365d6e"; ctx.fillRect(x+62,256,71,89);
    ctx.fillStyle="#102438"; ctx.fillRect(x+177,186,87,62);
    ctx.fillStyle="#456e78"; ctx.fillRect(x+184,193,73,43);
    ctx.fillStyle="#87bca5"; ctx.fillRect(x+190,201,35,4);ctx.fillRect(x+190,215,54,4);
    ctx.fillStyle="#17283d";ctx.fillRect(x+163,268,119,118);
    ctx.fillStyle="#34495d";ctx.fillRect(x+163,268,119,8);
    ctx.fillStyle="#77958d";ctx.fillRect(x+183,294,13,4);ctx.fillRect(x+183,340,13,4);
    ctx.fillStyle="#0c182b";ctx.fillRect(x+23,401,272,17);ctx.fillRect(x+38,418,14,94);ctx.fillRect(x+261,418,14,94);
    ctx.fillStyle="#385268";ctx.fillRect(x+23,401,272,5);
  }
  ctx.restore();
}
function drawCellBackground(ctx, { width, height, scroll = 0, palette = PALETTES.cell } = {}) {
  if (!ctx) return; ctx.save(); ctx.fillStyle = palette[0]; ctx.fillRect(0, 0, width, height); ctx.strokeStyle = palette[1]; ctx.lineWidth = 2;
  for (let y = -20; y < height + 30; y += 46) { ctx.beginPath(); ctx.moveTo(0, y + Math.sin(scroll + y) * 6); ctx.bezierCurveTo(width * .3, y - 18, width * .7, y + 18, width, y); ctx.stroke(); } ctx.restore();
}
function ready() { return Promise.resolve(); }
function svgSprite(name, x = 0, y = 0, scale = 7) {
  const { pixels, palette } = pixelSource(name);
  scale = scale * 8 / Math.max(pixels.length, pixels[0].length);
  // One rect per same-colour run keeps menu SVGs compact even for 96px bosses.
  const rects = [];
  pixels.forEach((row, yy) => {
    let start = 0, value = "0";
    for (let xx = 0; xx <= row.length; xx++) {
      const next = row[xx] || "0";
      if (next !== value) {
        if (value !== "0") rects.push(`<rect x="${start * scale}" y="${yy * scale}" width="${(xx - start) * scale}" height="${scale}" fill="${palette[parseInt(value, 16)] || palette[1]}"/>`);
        start = xx; value = next;
      }
    }
  });
  return `<g transform="translate(${x} ${y})">${rects.join("")}</g>`;
}
module.exports = { drawSprite, drawLabBackground, drawCellBackground, ready, svgSprite, BITMAPS, PALETTES, SPRITE_PALETTES };
