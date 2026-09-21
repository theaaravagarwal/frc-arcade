"use strict";

// Phaser presentation for Lab Dash. This module deliberately knows nothing about
// the simulation loop: the host advances the authoritative game and hands each
// completed frame to render().
const { BITMAPS, PALETTES, SPRITE_PALETTES } = require("../../hosa/art");

const hex = (value) => Number.parseInt(String(value).replace("#", ""), 16);
const paletteFor = (name) => SPRITE_PALETTES[name] || PALETTES.lab;

function createSpriteTextures(scene) {
  for (const [name, rows] of Object.entries(BITMAPS)) {
    if (scene.textures.exists(name)) continue;
    const texture = scene.textures.createCanvas(name, rows[0].length, rows.length);
    const context = texture.context;
    const palette = paletteFor(name);
    context.clearRect(0, 0, rows[0].length, rows.length);
    rows.forEach((row, y) => [...row].forEach((pixel, x) => {
      if (pixel !== "0") {
        context.fillStyle = palette[Number(pixel)] || palette[1];
        context.fillRect(x, y, 1, 1);
      }
    }));
    texture.refresh();
  }
}

function addText(scene, style) {
  return scene.add.text(0, 0, "", style).setScrollFactor(0).setDepth(20);
}

function createView(scene) {
  if (!scene || !scene.add || !scene.textures) throw new Error("Lab Phaser view requires an active Phaser scene");
  createSpriteTextures(scene);

  const background = scene.add.graphics().setDepth(0);
  const course = scene.add.graphics().setDepth(2);
  const effects = scene.add.graphics().setDepth(4);
  const overlay = scene.add.graphics().setDepth(10);
  const hero = scene.add.sprite(0, 0, "cube").setDepth(5).setOrigin(0.5);
  const pickups = new Map();
  const portalLabels = new Map();
  const tutorialTarget = scene.add.sprite(0, 0, "ribbon").setDepth(6).setOrigin(.5).setVisible(false);
  const hud = addText(scene, {
    fontFamily: "system-ui, sans-serif", fontSize: "18px", fontStyle: "800", color: "#eaf9ff",
    stroke: "#07101d", strokeThickness: 5,
  }).setPosition(36, 26);
  const status = addText(scene, {
    fontFamily: "system-ui, sans-serif", fontSize: "18px", fontStyle: "800", color: "#a9f5e7",
    stroke: "#07101d", strokeThickness: 5, align: "right",
  }).setOrigin(1, 0).setPosition(1244, 26);
  const title = addText(scene, {
    fontFamily: "system-ui, sans-serif", fontSize: "52px", fontStyle: "900", color: "#ffffff",
    stroke: "#07101d", strokeThickness: 8, align: "center",
  }).setOrigin(0.5).setPosition(640, 330);
  const detail = addText(scene, {
    fontFamily: "system-ui, sans-serif", fontSize: "21px", fontStyle: "800", color: "#9ff6eb",
    stroke: "#07101d", strokeThickness: 6, align: "center",
  }).setOrigin(0.5).setPosition(640, 390);
  const machinery = [];
  if (scene.textures.exists("lab-industrial")) {
    for (let i = 0; i < 68; i++) {
      machinery.push(scene.add.image(0, 0, "lab-industrial", 0).setScale(3).setDepth(1).setAlpha(.8));
    }
  }
  let destroyed = false;

  const sx = (state, worldX) => state.camera.heroX + (worldX - state.camera.x) * state.camera.unit;
  const sy = (state, worldY) => state.camera.groundY - worldY * state.camera.unit;

  function drawBackground(state) {
    background.clear();
    background.fillStyle(hex("#071222"), 1).fillRect(0, 0, state.width, state.height);
    const unit = 320;
    const scroll = -((state.camera.x * 9) % unit);
    background.fillStyle(0x10243a,1).fillRect(0,100,state.width,420);
    let panel=0;
    for(let x=scroll-unit;x<state.width+unit;x+=unit) {
      background.fillStyle(0x1c3448,1).fillRect(x+12,128,286,350);
      background.fillStyle(0x36536a,1).fillRect(x+12,128,286,7);
      background.fillStyle(0x0a1729,1).fillRect(x+34,160,108,250);
      background.fillStyle(0x245368,1).fillRect(x+42,168,92,232);
      background.fillStyle(0x477f87,.7).fillRect(x+49,176,7,214);
      background.fillStyle(0x1a2b40,1).fillRect(x+167,176,107,222);
      background.fillStyle(0x36536a,1).fillRect(x+167,300,107,5);
      background.fillStyle(0x0a1729,1).fillRect(x+25,430,255,18);
      background.fillRect(x+40,448,14,67).fillRect(x+249,448,14,67);
      if(machinery.length) {
        const base=panel*4;
        machinery[base].setFrame(28).setPosition(x+220,228).setVisible(true).setAlpha(.6);
        machinery[base+1].setFrame(43).setPosition(x+89,230).setVisible(true).setAlpha(.5);
        machinery[base+2].setFrame(59).setPosition(x+89,284).setVisible(true).setAlpha(.5);
        machinery[base+3].setFrame(87).setPosition(x+220,353).setVisible(true).setAlpha(.5);
      }
      panel++;
    }
    for(let i=panel*4;i<machinery.length;i++)machinery[i].setVisible(false);
  }

  function drawCourse(state) {
    course.clear();
    const palette = state.level.palette;
    const floorY = state.camera.groundY;
    course.fillStyle(hex("#0b1424"), 1).fillRect(0, floorY, state.width, state.height - floorY);
    course.fillStyle(hex(palette[2]), 1).fillRect(0, floorY, state.width, 6);
    for (const obstacle of state.level.obstacles) {
      const x = sx(state, obstacle.x), width = obstacle.width * state.camera.unit;
      if (obstacle.type === "gap") {
        course.fillStyle(hex("#020714"), 1).fillRect(x, floorY - 3, width, state.height - floorY + 3);
      } else if (obstacle.type === "spike") {
        const h = obstacle.height * state.camera.unit;
        course.fillStyle(hex(palette[3]), 1).fillTriangle(x, floorY, x + width / 2, floorY - h, x + width, floorY);
        course.lineStyle(2, hex("#fff0f5"), .72).strokeTriangle(x, floorY, x + width / 2, floorY - h, x + width, floorY);
      } else if (obstacle.type === "gate") {
        const h = obstacle.reach * state.camera.unit;
        const top = obstacle.side === "top" ? sy(state, 8) : floorY - h;
        course.fillStyle(hex(palette[3]), 1).fillRect(x, top, width, h);
        course.lineStyle(3, hex(palette[2]), .9).strokeRect(x, top, width, h);
      } else {
        const h = obstacle.height * state.camera.unit;
        course.fillStyle(hex(palette[3]), 1).fillRect(x, floorY - h, width, h);
        course.lineStyle(3, hex(palette[2]), .9).strokeRect(x, floorY - h, width, h);
      }
    }
    const visiblePortals = new Set();
    for (const portal of state.level.portals) {
      visiblePortals.add(portal.x);
      const x = sx(state, portal.x);
      course.lineStyle(5, hex(palette[2]), .9).lineBetween(x, sy(state, 7.4), x, sy(state, .6));
      course.fillStyle(hex("#071421"), .85).fillRect(x - 39, sy(state, 7.4), 78, 30);
      course.lineStyle(2, hex(palette[3]), 1).strokeRect(x - 39, sy(state, 7.4), 78, 30);
      let label = portalLabels.get(portal.x);
      if (!label) {
        label = scene.add.text(0, 0, "", { fontFamily: "system-ui, sans-serif", fontSize: "14px", fontStyle: "900", color: "#ffffff", stroke: "#07101d", strokeThickness: 4 })
          .setOrigin(.5).setDepth(7);
        portalLabels.set(portal.x, label);
      }
      label.setText(portal.mode.toUpperCase()).setPosition(x, sy(state, 6.9)).setVisible(true);
    }
    for (const [portalX, label] of portalLabels) if (!visiblePortals.has(portalX)) label.setVisible(false);
  }

  function drawEffects(state) {
    effects.clear();
    if (state.trail.length > 1) {
      effects.lineStyle(4, hex(state.level.palette[2]), .48).beginPath();
      state.trail.forEach((point, index) => index ? effects.lineTo(sx(state, point.x), sy(state, point.y)) : effects.moveTo(sx(state, point.x), sy(state, point.y)));
      effects.strokePath();
    }
    if (state.portalFx) {
      const t = Math.min(1, state.portalFx.age / 200);
      effects.lineStyle(4, hex(state.level.palette[2]), 1 - t).strokeCircle(sx(state, state.portalFx.x), sy(state, state.portalFx.y), state.reducedMotion ? 30 : 18 + t * 36);
    }
    for (const fx of state.pickupFx) {
      const t = Math.min(1, fx.age / 210), px = sx(state, fx.x), py = sy(state, fx.y);
      effects.lineStyle(3, hex(fx.type === "research" ? "#d8ff66" : "#ffafc9"), 1 - t).strokeCircle(px, py, state.reducedMotion ? 20 : 12 + t * 22);
    }
  }

  function drawPickups(state) {
    const seen = new Set();
    for (const item of state.pickups) {
      seen.add(item.id);
      let sprite = pickups.get(item.id);
      if (!sprite) {
        sprite = scene.add.sprite(0, 0, item.type === "research" ? "flask" : "ribbon").setDepth(5).setOrigin(.5);
        pickups.set(item.id, sprite);
      }
      sprite.setTexture(item.type === "research" ? "flask" : "ribbon");
      sprite.setPosition(sx(state, item.x), sy(state, item.y));
      sprite.setDisplaySize(item.type === "research" ? 34 : 42, item.type === "research" ? 42 : 32).setVisible(true);
    }
    for (const [id, sprite] of pickups) if (!seen.has(id)) sprite.setVisible(false);
  }

  function drawOverlay(state) {
    title.setVisible(false).setAlpha(1); detail.setVisible(false).setAlpha(1); tutorialTarget.setVisible(false); overlay.clear();
    if (state.sessionKind === "tutorial" && state.tutorial) {
      const targetX = sx(state, state.tutorial.target.x), targetY = sy(state, state.tutorial.target.y);
      effects.lineStyle(3, hex("#f5c400"), .85).strokeCircle(targetX, targetY, 28);
      const showCollection = state.tutorial.title === "COLLECT";
      tutorialTarget.setPosition(targetX, targetY).setDisplaySize(38, 30).setVisible(showCollection);
      title.setText(state.tutorial.title).setFontSize(34).setPosition(640, 70).setVisible(true);
      detail.setText(`${state.tutorial.hint}\n${Math.ceil(state.tutorial.remainingMs / 1000)} SEC`).setPosition(640, 112).setVisible(true);
      return;
    }
    if (state.phase === "attempt-over") {
      overlay.fillStyle(hex("#030910"), .72).fillRect(0, 0, state.width, state.height);
      title.setText("TRIAL INTERRUPTED").setFontSize(54).setPosition(640, 310).setVisible(true);
      detail.setText(`${state.hud.attemptsRemaining} ATTEMPT${state.hud.attemptsRemaining === 1 ? "" : "S"} REMAINING\nRELEASE A`).setPosition(640, 375).setVisible(true);
    } else if (state.substate === "level-clear") {
      title.setText("STAGE CLEAR").setFontSize(56).setPosition(640, 335).setAlpha(Math.min(1, state.transitionMs / 200)).setVisible(true);
      detail.setText("ANALYZING RESULTS…").setPosition(640, 382).setVisible(true);
    } else if (state.substate === "level-ready") {
      title.setText(`STAGE ${state.level.index + 2} READY`).setFontSize(52).setPosition(640, 330).setVisible(true);
      detail.setText("RELEASE A").setPosition(640, 390).setVisible(true);
    } else if (state.substate === "circuit-clear") {
      title.setText("RESEARCH BREAKTHROUGH").setFontSize(56).setPosition(640, 335).setAlpha(Math.min(1, state.transitionMs / 200)).setVisible(true);
      detail.setText(`CIRCUIT ${state.hud.circuit} COMPLETE`).setPosition(640, 382).setVisible(true);
    } else if (state.substate === "circuit-ready") {
      title.setText(`CIRCUIT ${state.hud.circuit + 1} READY`).setFontSize(52).setPosition(640, 330).setVisible(true);
      detail.setText("RELEASE A").setPosition(640, 390).setVisible(true);
    } else if (state.phase === "ended") {
      overlay.fillStyle(hex("#030910"), .72).fillRect(0, 0, state.width, state.height);
      title.setText("SESSION COMPLETE").setFontSize(56).setPosition(640, 350).setVisible(true);
    }
    if (state.paused && state.phase !== "ended") {
      overlay.fillStyle(hex("#030910"), .88).fillRect(0, 0, state.width, state.height);
      title.setText("PAUSED").setFontSize(60).setPosition(640, 360).setAlpha(1).setVisible(true);
      detail.setVisible(false);
    }
  }

  function render(state) {
    if (destroyed || !state) return;
    drawBackground(state);
    if (state.sessionKind !== "tutorial") {
      drawCourse(state);
      drawEffects(state);
      drawPickups(state);
    } else {
      course.clear();
      effects.clear();
      for (const label of portalLabels.values()) label.setVisible(false);
      for (const sprite of pickups.values()) sprite.setVisible(false);
    }
    hero.setTexture(state.hero.mode).setPosition(sx(state, state.hero.x), sy(state, state.hero.y))
      .setRotation(-state.hero.angle).setVisible(true);
    if (state.hero.mode === "cube") hero.setDisplaySize(54, 54);
    else if (state.hero.mode === "ship") hero.setDisplaySize(70, 46);
    else hero.setDisplaySize(58, 32);
    if (state.sessionKind === "tutorial") {
      hud.setVisible(false);
      status.setVisible(false);
    } else {
      hud.setVisible(true).setText(`CIRCUIT ${state.hud.circuit}  •  STAGE ${state.hud.stage}/3 · ${state.hud.localProgress}%\nSCORE ${state.hud.score.toLocaleString()}  •  SAMPLES ${state.hud.samples}/${state.hud.sampleTotal}`);
      status.setVisible(true).setText(`ATTEMPTS ${state.hud.attemptsRemaining}/3\n${Math.round(state.hud.speedScale * 100)}% RATE`);
    }
    drawOverlay(state);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    background.destroy(); course.destroy(); effects.destroy(); overlay.destroy(); hero.destroy(); tutorialTarget.destroy(); hud.destroy(); status.destroy(); title.destroy(); detail.destroy();
    for (const sprite of machinery) sprite.destroy();
    for (const label of portalLabels.values()) label.destroy();
    for (const sprite of pickups.values()) sprite.destroy();
    pickups.clear();
  }
  return { render, destroy };
}

module.exports = { createView };
