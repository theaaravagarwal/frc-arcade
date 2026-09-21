"use strict";

// The cabinet owns RAF and input. Phaser owns display objects and rendering.
async function createPhaserRuntime({ document: doc, parent }) {
  const Phaser = require("phaser");
  const { BITMAPS, PALETTES, SPRITE_PALETTES } = require("./art");
  const cellAtlas = require("./cellAtlas");
  const views = {
    cellDefender: require("../games/cellDefender/phaserView"),
    labDash: require("../games/labDash/phaserView"),
  };
  let scene, game, view = null, activeId = null, elapsed = 0, disposed = false;
  // Phaser snapshots text into canvas textures when it is created.  Wait for
  // the bundled face once so the first scene never gets stuck with a fallback.
  if (doc.fonts) {
    try {
      await doc.fonts.load('24px "Kenney Pixel"');
      await doc.fonts.ready;
    } catch (_) { /* monospace remains the intentional readable fallback */ }
  }
  const canvas = doc.createElement("canvas");
  canvas.id = "engineCanvas";
  canvas.setAttribute("aria-label", "HOSA game canvas powered by Phaser");
  parent.appendChild(canvas);
  await new Promise((resolve, reject) => {
    try {
      game = new Phaser.Game({
        type: Phaser.CANVAS, canvas, width: 1280, height: 720,
        banner: false, backgroundColor: "#111a35", pixelArt: true,
        audio: { noAudio: true },
        input: { keyboard: false, mouse: false, touch: false, gamepad: false },
        scene: {
          preload() {
            this.load.spritesheet("lab-industrial", "assets/hosa/tiles/kenney-industrial-tilemap.png", {frameWidth:18,frameHeight:18,spacing:1});
            this.load.image("cell-player-shot", "assets/hosa/cell/player-shot.png");
            this.load.image("cell-impact", "assets/hosa/cell/impact.png");
            this.load.once("loaderror", (file) => reject(new Error(`Cannot load ${file.src}`)));
          },
          create() {
            scene = this;
            const pixelTexture = (key, pixels, palette) => {
              if (this.textures.exists(key)) return;
              const texture = this.textures.createCanvas(key, pixels[0].length, pixels.length);
              const ctx = texture.getContext();
              pixels.forEach((row,y) => [...row].forEach((value,x) => {
                if(value !== "0") {ctx.fillStyle=palette[parseInt(value,16)] || palette[1];ctx.fillRect(x,y,1,1);}
              }));
              texture.refresh();
            };
            for (const [key, pixels] of Object.entries(BITMAPS)) {
              pixelTexture(key, pixels, SPRITE_PALETTES[key] || PALETTES.lab);
            }
            // Build all Cell Defender frame canvases during boot.  View changes
            // textures only; no gameplay frame pays bitmap parsing or allocation.
            for (const [key, pixels] of Object.entries(cellAtlas.FRAMES)) {
              pixelTexture(key, pixels, cellAtlas.PALETTES[key] || PALETTES.cell);
            }
            // Phaser's tween clock normally reads wall time. Bind cosmetic time
            // to this adapter so pause/countdown cannot age an effect invisibly.
            this.tweens.getDelta = () => this.registry.get("hostDelta") || 0;
            queueMicrotask(() => { this.game.loop.stop(); resolve(); });
          },
        },
      });
    } catch(error) { canvas.remove(); reject(error); }
  });
  const api = {
    present(id, state) {
      if(disposed) return;
      if(activeId !== id) {api.reset();view=views[id].createView(scene);activeId=id;}
      // Views are projections of model snapshots. An older test harness can
      // omit optional presentation fields while the model is being upgraded.
      view.render(state && typeof state === "object" ? state : {});
    },
    frame(delta = 0) {
      if(disposed) return;
      // Boot and visibility callbacks must never restart an autonomous loop.
      if(game.loop.running) game.loop.stop();
      const ms=Math.min(250,Math.max(0,delta*1000));
      elapsed+=ms;scene.registry.set("hostDelta",ms);game.step(elapsed,ms);
    },
    reset() {
      view?.destroy();view=null;activeId=null;
      scene.tweens.killAll();scene.time.removeAllEvents();
      scene.children.removeAll(true);
    },
    getSnapshot() {return {version:Phaser.VERSION,activeId,canvasCount:doc.querySelectorAll("#engineCanvas").length,autonomousLoop:game.loop.running,objects:scene.children.length};},
    destroy() {
      if(disposed) return;api.reset();disposed=true;
      game.destroy(true);game.step(elapsed,0);
    },
  };
  return api;
}
module.exports = { createPhaserRuntime };
