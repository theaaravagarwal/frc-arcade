"use strict";

const { WEAPONS = {} } = require("./weapons");

// Phaser projection only: game clocks, input, collision, score, and rules stay
// in the deterministic Cell Defender model.
function createView(scene) {
  const pools = new Map();
  const enemyBuckets = Object.fromEntries(["drifter", "aimed", "tank", "diver", "skirmisher", "bulwark", "orbiter", "miniboss", "majorboss"].map((type) => [type, []]));
  const dropBuckets = Object.fromEntries(["charge", "rapid", "shield", "star"].map((kind) => [kind, []]));
  const knownEnemies = new Map(), warnings = new Map(), releaseUntil = new Map();
  const background = scene.add.graphics().setDepth(-2);
  const graphics = scene.add.graphics().setDepth(8);
  const warningGraphics = scene.add.graphics().setDepth(7);
  // Area effects are supplied by the model as timed states.  Keeping them in
  // their own layer prevents a warning redraw from erasing active danger.
  const areaGraphics = scene.add.graphics().setDepth(7);
  // Short-lived presentation rings live beneath danger geometry, so a cue can
  // never make a telegraph harder to read.
  const cueGraphics = scene.add.graphics().setDepth(6);
  const tutorialPanel = scene.add.graphics().setDepth(19);
  const font = "'Kenney Pixel', monospace";
  const attackLabel = scene.add.text(640, 687, "", { fontFamily: font, fontSize: "28px", fontStyle: "bold", color: "#ffd879" }).setOrigin(.5).setDepth(20);
  const leftHud = scene.add.text(24, 20, "", { fontFamily: font, fontSize: "32px", fontStyle: "bold", color: "#f3fbff" }).setDepth(20);
  const centerHud = scene.add.text(640, 20, "", { fontFamily: font, fontSize: "32px", fontStyle: "bold", color: "#80f3e8" }).setOrigin(.5, 0).setDepth(20);
  const rightHud = scene.add.text(1256, 20, "", { fontFamily: font, fontSize: "32px", fontStyle: "bold", color: "#ffb0c1" }).setOrigin(1, 0).setDepth(20);
  // Bosses can rise to y=90, so this label must finish above the arena rather
  // than competing with the sprite or its shield silhouette.
  const bossModeLabel = scene.add.text(640, 54, "", { fontFamily: font, fontSize: "24px", fontStyle: "bold", color: "#f3fbff", align: "center" }).setOrigin(.5, 0).setDepth(20).setVisible(false);
  const tutorialObjective = scene.add.text(640, 88, "", { fontFamily: font, fontSize: "40px", fontStyle: "bold", color: "#f3fbff", align: "center", wordWrap: { width: 780 } }).setOrigin(.5, 0).setDepth(20);
  const tutorialHint = scene.add.text(640, 134, "", { fontFamily: font, fontSize: "28px", color: "#b8dcff", align: "center", wordWrap: { width: 760 } }).setOrigin(.5, 0).setDepth(20);
  const tutorialProgress = scene.add.text(640, 171, "", { fontFamily: font, fontSize: "28px", fontStyle: "bold", color: "#80f3e8" }).setOrigin(.5, 0).setDepth(20);
  const shipMarker = scene.add.text(0, 0, "YOU", { fontFamily: font, fontSize: "28px", fontStyle: "bold", color: "#a6fff1" }).setOrigin(.5).setDepth(20);
  const targetMarker = scene.add.text(0, 0, "TARGET", { fontFamily: font, fontSize: "28px", fontStyle: "bold", color: "#ffd879" }).setOrigin(.5).setDepth(20);
  const dropLabels = Array.from({length:12}, () => scene.add.text(0,0,"",{fontFamily:font,fontSize:"28px",color:"#fff7d1"}).setOrigin(.5).setDepth(12).setVisible(false));
  const pickupLabels = Array.from({length:16}, () => scene.add.text(0,0,"",{fontFamily:font,fontSize:"28px",color:"#fff7d1"}).setOrigin(.5).setDepth(20).setVisible(false));
  let warningKey = null, deathRevision = 0, destroyed = false;
  let lastPresentationTime = null, tutorialEnterKey = null, tutorialEnterAt = 0;
  let previousAbilityActive = null, previousCharges = null;
  let trackedBossId = null, trackedBossPhase = null, trackedBossMode = null;
  let abilityCue = null, chargeReadyCue = null, bossPhaseCue = null;

  const maxFor = (key) => key === "shot" ? 100 : key === "hostile" ? 112 : key === "drone" ? 4 : key === "impact" ? 16 : key === "blast" ? 8 : key === "death" || key === "pickup" ? 32 : key.startsWith("drop") ? 12 : 32;
  const displayTypeFor = (actor) => {
    const declared = actor && actor.renderType;
    if (declared && Object.hasOwn(enemyBuckets, declared)) return declared;
    // The aliases retain the model's real enemy type for identities, warnings,
    // and death bookkeeping while sharing the authored atlas silhouettes.
    if (actor?.type === "burstSower") return "aimed";
    if (actor?.type === "bloomSentinel") return "tank";
    return actor?.type;
  };
  const textureExists = (key) => Boolean(scene.textures && scene.textures.exists && scene.textures.exists(key));
  const textureFor = (type, state, frame) => {
    const key = `cell-${type}-${state}-${frame}`;
    return textureExists(key) ? key : type;
  };
  // Atlas frames intentionally include transparent breathing room.  Scaling by
  // its measured silhouette ratio keeps the visible membrane around its real
  // collision circle rather than silently moving a larger hitbox underneath it.
  const actorSize = (actor, type = actor.type) => ((actor.r || 10) * 2 + 10) / (type === "emitter" ? .44 : .65);
  function record(key, texture) {
    if (!pools.has(key)) pools.set(key, { group: scene.add.group({ maxSize: maxFor(key) }), items: [], texture });
    return pools.get(key);
  }
  function sprite(key, index) {
    const pool = pools.get(key);
    if (!pool.items[index]) {
      const item = pool.group.create(0, 0, pool.texture);
      item.setOrigin(.5);
      pool.items[index] = item;
    }
    return pool.items[index];
  }
  function show(key, texture, items, draw) {
    const pool = record(key, texture), count = Math.min(items.length, maxFor(key));
    for (let index = 0; index < count; index++) {
      const item = sprite(key, index);
      item.setActive(true).setVisible(true);
      draw(item, items[index], index);
    }
    for (let index = count; index < pool.items.length; index++) pool.items[index].setActive(false).setVisible(false);
  }
  function prewarm(key, texture, count) {
    record(key, texture);
    for (let index = 0; index < count; index++) sprite(key, index).setActive(false).setVisible(false);
  }
  [["ship", "emitter", 1], ["drone", "emitter", 4], ["shot", "cell-player-shot", 100], ["hostile", "hostile", 112], ["death", "drifter", 32], ["impact", "cell-impact", 16], ["blast", "cell-impact", 8], ...["drifter", "aimed", "tank", "diver", "skirmisher", "bulwark", "orbiter"].map((type) => [`enemy-${type}`, type, 16]), ...["miniboss", "majorboss"].map((type) => [`enemy-${type}`, type, 1]), ...["charge", "rapid", "shield", "star"].map((kind) => [`drop-${kind}`, kind === "charge" ? "shield" : kind, 12])].forEach(([key, texture, count]) => prewarm(key, texture, count));

  // Cached tissue layers keep the game field dark and calm without spending a
  // frame redrawing scenery.
  background.fillStyle(0x0c152c, 1).fillRect(0, 0, 1280, 720);
  background.fillStyle(0x101e38, 1).fillRect(18, 72, 1244, 638);
  const tissueCell = (x, y, width, height, notch) => [
    { x: x + 20, y }, { x: x + width - 34, y }, { x: x + width, y: y + 28 + notch },
    { x: x + width, y: y + height - 34 }, { x: x + width - 42, y: y + height },
    { x: x + 28, y: y + height }, { x, y: y + height - 28 }, { x, y: y + 26 - notch },
  ];
  background.lineStyle(2, 0x263b58, .68);
  for (let row = 0; row < 5; row++) for (let column = -1; column < 7; column++) {
    const width = 218, height = 142, x = column * 220 + (row % 2 ? 108 : -24), y = 94 + row * 146;
    const points = tissueCell(x, y, width, height, (column + row) % 3 * 5);
    background.fillStyle(row % 2 ? 0x172b49 : 0x192b49, .48).fillPoints(points, true).strokePoints(points, true);
  }
  tutorialPanel.fillStyle(0x07101e, .92).fillRoundedRect(215, 76, 850, 128, 10);
  tutorialPanel.lineStyle(2, 0x62eadb, .82).strokeRoundedRect(215, 76, 850, 128, 10);

  const actorKey = (actor) => actor.id || actor.enemyId || actor.sourceId || `${actor.type}:${Math.round(actor.x / 8)}:${Math.round(actor.y / 8)}`;
  const warningOwner = (warning) => warning.enemyId || warning.sourceId || warning.ownerId || `${warning.kind}:${Math.round(warning.origin.x / 8)}:${Math.round(warning.origin.y / 8)}`;
  const arenaBounds = Object.freeze({ left: 18, right: 1262, top: 94, bottom: 677 });
  function clipToArena(x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    let low = 0, high = 1;
    for (const [p, q] of [[-dx, x1 - arenaBounds.left], [dx, arenaBounds.right - x1], [-dy, y1 - arenaBounds.top], [dy, arenaBounds.bottom - y1]]) {
      if (p === 0) { if (q < 0) return null; continue; }
      const ratio = q / p;
      if (p < 0) { if (ratio > high) return null; low = Math.max(low, ratio); }
      else { if (ratio < low) return null; high = Math.min(high, ratio); }
    }
    return { x1: x1 + dx * low, y1: y1 + dy * low, x2: x1 + dx * high, y2: y1 + dy * high };
  }
  const circleFitsArena = (x, y, radius) => x - radius >= arenaBounds.left && x + radius <= arenaBounds.right && y - radius >= arenaBounds.top && y + radius <= arenaBounds.bottom;
  function strokeArenaArc(target, x, y, radius, start, end) {
    // The normal case stays on Phaser's compact primitive. Only boundary
    // effects need the segment clipper that protects HUD space.
    if (circleFitsArena(x, y, radius)) {
      target.beginPath().arc(x, y, radius, start, end, false).strokePath();
      return;
    }
    const segments = Math.max(8, Math.ceil(Math.abs(end - start) * radius / 6));
    let previousX = x + Math.cos(start) * radius, previousY = y + Math.sin(start) * radius;
    for (let index = 1; index <= segments; index++) {
      const angle = start + ((end - start) * index) / segments;
      const currentX = x + Math.cos(angle) * radius, currentY = y + Math.sin(angle) * radius;
      const segment = clipToArena(previousX, previousY, currentX, currentY);
      if (segment) target.lineBetween(segment.x1, segment.y1, segment.x2, segment.y2);
      previousX = currentX; previousY = currentY;
    }
  }
  function warningFor(actor, now) {
    const exact = actorKey(actor);
    for (const warning of warnings.values()) {
      if (warningOwner(warning) === exact) return warning;
      if (warning.kind === actor.type && Math.abs(warning.origin.x - actor.x) < 6 && Math.abs(warning.origin.y - actor.y) < 6) return warning;
    }
    return releaseUntil.get(exact) > now ? { releasing: true } : null;
  }
  function actorFrame(actor, now, reducedMotion) {
    if (actor.charging) return ["charge", Math.min(2, Math.floor(Math.max(0, Math.min(.999, actor.chargeProgress || 0)) * 3))];
    const warning = warningFor(actor, now);
    if (warning && warning.releasing) return ["release", Math.min(3, Math.floor((now - (releaseUntil.get(actorKey(actor)) - .2)) / .05))];
    if (warning) return ["charge", Math.min(2, Math.floor(Math.max(0, Math.min(.999, 1 - (warning.fireAt - now) / .9)) * 3))];
    return ["idle", reducedMotion ? 0 : Math.floor(now * 8) % 4];
  }
  function drawDashed(x, y, targetX, targetY) {
    const length = Math.hypot(targetX - x, targetY - y) || 1, dx = (targetX - x) / length, dy = (targetY - y) / length;
    for (let distance = 0; distance < Math.min(length, 1500); distance += 20) {
      const segment = clipToArena(x + dx * distance, y + dy * distance, x + dx * Math.min(distance + 10, length), y + dy * Math.min(distance + 10, length));
      if (segment) warningGraphics.lineBetween(segment.x1, segment.y1, segment.x2, segment.y2);
    }
  }
  function updateWarnings(nextWarnings, now, explicitEmitters = []) {
    const next = new Map();
    for (const warning of nextWarnings) next.set(warning.id, warning);
    // Cancellation (for example, killing the source) has no release burst.
    // Only a warning that actually reached its scheduled fire time releases.
    for (const [id, warning] of warnings) if (!next.has(id) && now >= warning.fireAt) releaseUntil.set(warningOwner(warning), now + .2);
    warnings.clear(); for (const [id, warning] of next) warnings.set(id, warning);
    for (const [key, until] of releaseUntil) if (until <= now) releaseUntil.delete(key);
    const nextKey = nextWarnings.map((warning) => warning.id).join("|");
    if (nextKey === warningKey) return;
    warningKey = nextKey; warningGraphics.clear().lineStyle(3, 0xffd879, .92);
    for (const warning of nextWarnings) {
      if (warning.kind === "dive" && warning.target) drawDashed(warning.origin.x, warning.origin.y, warning.target.x, warning.target.y);
      else for (const bullet of warning.bullets || []) drawDashed(bullet.x, bullet.y, bullet.x + bullet.vx * 3, bullet.y + bullet.vy * 3);
      // Combo emitters already show their exact authored source rings. Avoid a
      // second, generic boss-origin circle that falsely suggests the boss is
      // the physical source of an external stream or sweep.
      if (!(warning.kind?.startsWith("boss") && explicitEmitters.length)) strokeArenaArc(warningGraphics, warning.origin.x, warning.origin.y, 23, 0, Math.PI * 2);
    }
    const bossWarning = nextWarnings.find((warning) => warning.kind.startsWith("boss"));
    const bossAttackCopy = {
      "broad-fan": "WIDE FAN · FIND THE GAPS",
      "aimed-spread": "AIMED BURST · MOVE LATE",
      "split-crossfire": "CROSSFIRE · CHANGE LANES",
      "open-curtain": "OPEN CURTAIN · TAKE THE WIDE GAP",
      "shifting-curtain": "SHIFTING CURTAIN · TRACK THE GAP",
      "pincer-burst": "PINCER BURST · BREAK SIDEWAYS",
      "offset-ring": "OFFSET RING · FOLLOW THE WEDGE",
      "dense-fan": "DENSE FAN · COMMIT TO A LANE",
      "spiral-gates": "SPIRAL GATES · FOLLOW THE WEDGE",
      "converging-walls": "CONVERGING WALLS · THREAD THE GAPS",
      "combo-fan-crossfire": "FAN + CROSSFIRE · MOVE DIAGONALLY",
      "crossing-streams": "CROSSFIRE · MOVE BETWEEN STREAMS",
      "orbit-gaps": "ROTATING GAPS · FOLLOW THE OPENING",
      "delayed-blooms": "BLOOMS · LEAVE THE MARKED AREA",
      "sweep-pursuit": "SWEEP + AIM · KEEP MOVING",
      "lattice-sweep": "LATTICE · FOLLOW THE MOVING GAP",
      "petal-burst": "PETALS · SLIP BETWEEN THE FANS",
      "anchor-cross": "ANCHORS · CLEAR THE CROSSING LANES",
    };
    if (bossWarning) {
      const raw = bossWarning.kind.replace(/^boss-/, "").replace(/([a-z])([A-Z])/g, "$1-$2").replace(/_/g, "-").toLowerCase();
      attackLabel.setText(bossAttackCopy[raw] || raw.replace(/-/g, " ").toUpperCase());
    } else attackLabel.setText("");
  }
  function updateDeaths(enemies, deathEffects, now) {
    if (Array.isArray(deathEffects)) {
      deathRevision++;
      for (const effect of deathEffects) {
        const pool = pools.get("death");
        const item = pool.items.find((candidate) => candidate.death && candidate.death.id === effect.id) || pool.items.find((candidate) => !candidate.active) || pool.items[0];
        item.death = { id: effect.id, type: displayTypeFor(effect) || "drifter", x: effect.x, y: effect.y, r: effect.r || 16, until: now + Math.max(0, .3 - effect.age), revision: deathRevision };
        item.setActive(true).setVisible(true);
      }
      for (const item of pools.get("death").items) if (item.death && item.death.revision !== deathRevision) item.death = null;
      knownEnemies.clear();
      return;
    }
    const current = new Map();
    for (const enemy of enemies) current.set(actorKey(enemy), enemy);
    for (const [key, enemy] of knownEnemies) if (!current.has(key)) {
      const item = pools.get("death").items.find((candidate) => !candidate.active) || pools.get("death").items[0];
      item.death = { type: displayTypeFor(enemy) || "drifter", x: enemy.x, y: enemy.y, r: enemy.r, until: now + .3 };
      item.setActive(true).setVisible(true);
    }
    knownEnemies.clear(); for (const [key, enemy] of current) knownEnemies.set(key, enemy);
  }
  function drawShotStyles(shots) {
    for (let index = 0; index < shots.length && index < 100; index++) {
      const shot = shots[index], style = shot.style || shot.weaponId || "base", meta = WEAPONS[shot.weaponId] || WEAPONS[style] || {}, shape = meta.visual?.shape || style, radius = Math.max(1, shot.r || meta.projectileRadius || 4), color = meta.visual?.color || (style === "rail" || style === "lance" ? 0x74eef4 : style === "chain" ? 0xb9a8ff : style === "swarm" || style === "drones" ? 0x86f4d1 : 0xfff0c9);
      const angle = Number.isFinite(shot.heading) ? shot.heading : (Number.isFinite(shot.angle) ? shot.angle : Math.atan2(shot.vy || -1, shot.vx || 0));
      const vector = (distance, offset = 0) => ({ x: shot.x + Math.cos(angle + offset) * distance, y: shot.y + Math.sin(angle + offset) * distance });
      graphics.fillStyle(color, .9);
      if (shape === "needle" || style === "needle") { const tip=vector(radius), tail=vector(radius*.82,Math.PI); graphics.fillTriangle(tip.x,tip.y,tail.x+Math.cos(angle+Math.PI/2)*radius*.28,tail.y+Math.sin(angle+Math.PI/2)*radius*.28,tail.x-Math.cos(angle+Math.PI/2)*radius*.28,tail.y-Math.sin(angle+Math.PI/2)*radius*.28); }
      else if (shape === "shell" || style === "siege") { graphics.fillCircle(shot.x,shot.y,radius*.82); graphics.lineStyle(1,0xfff8d5,.95).strokeCircle(shot.x,shot.y,radius*.52); }
      else if (shape === "drone" || style === "hive") { graphics.fillCircle(shot.x,shot.y,radius*.72); graphics.fillStyle(0xeafffb,.9).fillCircle(shot.x+Math.cos(angle)*radius*.25,shot.y+Math.sin(angle)*radius*.25,Math.max(1,radius*.2)); }
      else if (shape === "rocket" || style === "hunter") { const tip=vector(radius), back=vector(radius*.76,Math.PI); graphics.fillTriangle(tip.x,tip.y,back.x+Math.cos(angle+Math.PI/2)*radius*.62,back.y+Math.sin(angle+Math.PI/2)*radius*.62,back.x-Math.cos(angle+Math.PI/2)*radius*.62,back.y-Math.sin(angle+Math.PI/2)*radius*.62); }
      else if (shape === "helix" || style === "helix") { graphics.fillCircle(shot.x,shot.y,radius*.76); graphics.lineStyle(2,0xeafffb,.9).strokeCircle(shot.x,shot.y,radius*.48); }
      else if (shape === "rail" || shape === "lance" || style === "rail" || style === "lance") { const tip=vector(radius), tail=vector(radius*.85,Math.PI); graphics.lineStyle(Math.max(2,radius*.35),color,.96).lineBetween(tail.x,tail.y,tip.x,tip.y); }
      else if (style === "arcstorm") {
        const tail = vector(radius * .8, Math.PI);
        graphics.lineStyle(2, color, .98);
        for (const offset of [-.8, 0, .8]) {
          const tip = vector(radius, offset);
          graphics.lineBetween(tail.x, tail.y, shot.x, shot.y).lineBetween(shot.x, shot.y, tip.x, tip.y);
        }
      }
      else if (style === "tesla") {
        const tip = vector(radius), tail = vector(radius, Math.PI);
        const left = vector(radius * .55, Math.PI / 2), right = vector(radius * .55, -Math.PI / 2);
        graphics.lineStyle(2, color, .98).lineBetween(tail.x, tail.y, left.x, left.y).lineBetween(left.x, left.y, right.x, right.y).lineBetween(right.x, right.y, tip.x, tip.y);
      }
      else if (shape === "pod") {
        graphics.fillRect(shot.x - radius * .6, shot.y - radius * .6, radius * 1.2, radius * 1.2);
        graphics.fillStyle(0xfff8d5, .95).fillCircle(shot.x, shot.y, radius * .25);
      }
      else if (shape === "fork" || shape === "arc" || style === "chain") { const tip=vector(radius), a=vector(radius*.52,2.35), b=vector(radius*.52,-2.35); graphics.fillTriangle(tip.x,tip.y,a.x,a.y,b.x,b.y); }
      else if (shape === "crescent" || style === "tempest") { graphics.lineStyle(Math.max(2,radius*.35),color,.96).beginPath().arc(shot.x,shot.y,radius*.62,angle-.95,angle+.95,false).strokePath(); }
      else if (shape === "prong" || style === "trident") { [-.45,0,.45].forEach((offset) => { const tip=vector(radius*.9,offset), tail=vector(radius*.42,Math.PI+offset); graphics.lineStyle(Math.max(1,radius*.16),color,.95).lineBetween(tail.x,tail.y,tip.x,tip.y); }); }
      else if (shape === "tracer" || style === "vulcan") { const tip=vector(radius), tail=vector(radius*.55,Math.PI); graphics.lineStyle(Math.max(2,radius*.7),color,.96).lineBetween(tail.x,tail.y,tip.x,tip.y); }
      else if (shape === "orb" || style === "swarm" || style === "drones") graphics.fillCircle(shot.x, shot.y, radius * .72);
      else { const tip=vector(radius), a=vector(radius*.78,2.5), b=vector(radius*.78,-2.5); graphics.fillTriangle(tip.x,tip.y,a.x,a.y,b.x,b.y); }
      // A trail is a history recorded by the model, never a decorative beam to
      // a guessed target. It is therefore safe for seekers and chain shots.
      const trail = shot.trail;
      if (!Array.isArray(trail) || trail.length < 2) continue;
      graphics.lineStyle(style === "chain" || style === "arcstorm" || style === "tesla" ? 2 : 1, style === "chain" || style === "arcstorm" || style === "tesla" ? 0x9fffe3 : color, .6);
      for (let point = 1; point < trail.length; point++) {
        const previous = trail[point - 1], current = trail[point];
        if (previous && current && Number.isFinite(previous.x) && Number.isFinite(previous.y) && Number.isFinite(current.x) && Number.isFinite(current.y)) {
          graphics.lineBetween(previous.x, previous.y, current.x, current.y);
          if (style === "chain" || style === "arcstorm" || style === "tesla") graphics.fillStyle(0xd9fff0, .75).fillCircle(current.x, current.y, 1);
        }
      }
    }
  }
  function drawBlastImpacts(blasts, reducedMotion) {
    for (let index = 0; index < blasts.length && index < 8; index++) {
      const blast = blasts[index];
      if (!blast || !Number.isFinite(blast.x) || !Number.isFinite(blast.y)) continue;
      const duration = Number.isFinite(blast.duration) ? blast.duration : .24, age = Math.max(0, Number(blast.age) || 0), progress = Math.min(1, age / duration), radius = Math.max(2, Number(blast.radius) || 10);
      const eased = reducedMotion ? 1 : progress;
      graphics.lineStyle(3, 0xb9ffe4, Math.max(0, .8 * (1 - progress))).strokeCircle(blast.x, blast.y, radius * (.72 + .28 * eased));
      if (!reducedMotion) graphics.fillStyle(0xffd86b, .24 * (1 - progress)).fillCircle(blast.x, blast.y, radius * .55);
    }
  }
  function drawHostileDetails(bullets) {
    for (let index = 0; index < bullets.length && index < 112; index++) {
      const bullet = bullets[index], kind = bullet?.kind || "standard", radius = Number.isFinite(bullet?.r) ? bullet.r : kind === "heavy" ? 8 : kind === "needle" ? 3.5 : 5;
      if (kind === "heavy") {
        graphics.lineStyle(2, 0x3a1724, .95).strokeCircle(bullet.x, bullet.y, radius * .62);
      } else if (kind === "needle") {
        const angle = Math.atan2(bullet.vy || 0, bullet.vx || 1), tip = radius * 1.35;
        graphics.fillStyle(0xffd4ed, .95).fillTriangle(bullet.x + Math.cos(angle) * tip, bullet.y + Math.sin(angle) * tip, bullet.x + Math.cos(angle + 2.7) * radius, bullet.y + Math.sin(angle + 2.7) * radius, bullet.x + Math.cos(angle - 2.7) * radius, bullet.y + Math.sin(angle - 2.7) * radius);
      }
    }
  }
  function drawChainLinks(links) {
    for (let index = 0; index < links.length && index < 12; index++) {
      const link = links[index], from = link && link.from, to = link && link.to;
      if (!from || !to || !Number.isFinite(from.x) || !Number.isFinite(from.y) || !Number.isFinite(to.x) || !Number.isFinite(to.y)) continue;
      const alpha = Math.max(0, 1 - (Number.isFinite(link.age) ? link.age : .18) / .18);
      graphics.lineStyle(3, 0x9fffe3, alpha).lineBetween(from.x, from.y, to.x, to.y);
      graphics.fillStyle(0xd9fff0, alpha).fillCircle(from.x, from.y, 2).fillCircle(to.x, to.y, 2);
    }
  }
  function drawAreaEffects(emitters, hazards, reducedMotion) {
    areaGraphics.clear();
    const draw = (effect, family) => {
      if (!effect || !Number.isFinite(effect.x) || !Number.isFinite(effect.y) || !Number.isFinite(effect.radius)) return;
      const radius = Math.max(2, effect.radius);
      const progress = Math.max(0, Math.min(1, Number(effect.progress) || 0));
      const state = effect.state;
      if (state !== "telegraph" && state !== "active" && state !== "expiry") return;
      const isEmitter = family === "emitter";
      const base = isEmitter ? 0x8de9e4 : 0xff957f;
      const bright = isEmitter ? 0xd9fffb : 0xffe0ba;
      const fullyVisible = circleFitsArena(effect.x, effect.y, radius + 5);
      if (state === "telegraph") {
        // The opening outline is deliberately stable: it advertises the
        // model's footprint before it can cause harm, without guessing a path.
        areaGraphics.lineStyle(3, base, .94); strokeArenaArc(areaGraphics, effect.x, effect.y, radius, 0, Math.PI * 2);
        areaGraphics.lineStyle(1, bright, .72); strokeArenaArc(areaGraphics, effect.x, effect.y, Math.max(2, radius - 6), 0, Math.PI * 2);
        const tick = Math.max(5, Math.round(radius * .2));
        if (fullyVisible) areaGraphics.fillStyle(bright, .95)
          .fillRect(effect.x - 2, effect.y - radius - 2, 4, tick)
          .fillRect(effect.x - 2, effect.y + radius - tick + 2, 4, tick)
          .fillRect(effect.x - radius - 2, effect.y - 2, tick, 4)
          .fillRect(effect.x + radius - tick + 2, effect.y - 2, tick, 4);
        // A single model-time progress rail makes a short tell legible even
        // with reduced motion, without pulsing or inventing an animation.
        areaGraphics.lineStyle(3, bright, 1); strokeArenaArc(areaGraphics, effect.x, effect.y, radius + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
      } else if (state === "active") {
        const alpha = reducedMotion ? .23 : .17 + .09 * progress;
        if (fullyVisible) areaGraphics.fillStyle(base, alpha).fillCircle(effect.x, effect.y, radius);
        areaGraphics.lineStyle(4, bright, .96); strokeArenaArc(areaGraphics, effect.x, effect.y, radius, 0, Math.PI * 2);
        areaGraphics.lineStyle(1, base, 1); strokeArenaArc(areaGraphics, effect.x, effect.y, Math.max(2, radius - 7), 0, Math.PI * 2);
        const notch = Math.max(6, Math.round(radius * .24));
        if (fullyVisible) areaGraphics.fillStyle(bright, 1)
          .fillRect(effect.x - notch, effect.y - 2, notch * 2, 4)
          .fillRect(effect.x - 2, effect.y - notch, 4, notch * 2);
      } else {
        // Expiry is model-declared noncolliding, so it only fades and never
        // looks like a fresh warning or active damage region.
        const alpha = Math.max(0, .56 * (1 - progress));
        areaGraphics.lineStyle(2, base, alpha); strokeArenaArc(areaGraphics, effect.x, effect.y, radius, 0, Math.PI * 2);
        areaGraphics.lineStyle(1, bright, alpha * .65); strokeArenaArc(areaGraphics, effect.x, effect.y, Math.max(2, radius - 6), 0, Math.PI * 2);
      }
    };
    (Array.isArray(emitters) ? emitters : []).forEach((effect) => draw(effect, "emitter"));
    (Array.isArray(hazards) ? hazards : []).forEach((effect) => draw(effect, "hazard"));
  }
  // This is the CSS-like cubic used by the compact tutorial settle.  It is
  // evaluated from model time rather than by starting a Phaser tween each
  // render, which also means pausing the model freezes it exactly in place.
  function settleEase(t) {
    const progress = Math.max(0, Math.min(1, t));
    if (progress === 0 || progress === 1) return progress;
    let low = 0, high = 1, parameter = progress;
    for (let index = 0; index < 8; index++) {
      parameter = (low + high) / 2;
      const inverse = 1 - parameter;
      const x = 3 * inverse * inverse * parameter * .23 + 3 * inverse * parameter * parameter * .32 + parameter * parameter * parameter;
      if (x < progress) low = parameter; else high = parameter;
    }
    const inverse = 1 - parameter;
    return 3 * inverse * inverse * parameter + 3 * inverse * parameter * parameter + parameter * parameter * parameter;
  }
  function cueProgress(now, cue, reducedMotion) {
    if (!cue) return -1;
    const duration = reducedMotion ? .1 : .2;
    return Math.max(0, Math.min(1, (now - cue.at) / duration));
  }
  function updatePresentationCues({ now, tutorial, tutorialVisible, boss, charges, abilityActive, ship }) {
    // A fresh model session can reuse this view and starts its clock at zero.
    // Reset edge history without fabricating an activation or charge cue.
    if (lastPresentationTime !== null && now < lastPresentationTime) {
      tutorialEnterKey = null;
      previousAbilityActive = previousCharges = null;
      trackedBossId = trackedBossPhase = trackedBossMode = null;
      abilityCue = chargeReadyCue = bossPhaseCue = null;
    }
    lastPresentationTime = now;
    const tutorialKey = tutorialVisible ? `${tutorial.lessonId || tutorial.step || 0}:${tutorial.status || "active"}` : null;
    if (tutorialKey !== tutorialEnterKey) {
      tutorialEnterKey = tutorialKey;
      tutorialEnterAt = now;
    }
    if (previousAbilityActive !== null && !previousAbilityActive && abilityActive && ship) abilityCue = { at: now };
    previousAbilityActive = abilityActive;
    if (previousCharges !== null && charges > previousCharges && ship) chargeReadyCue = { at: now, x: ship.x, y: ship.y };
    previousCharges = charges;
    if (!boss) {
      trackedBossId = trackedBossPhase = trackedBossMode = null;
      bossPhaseCue = null;
    } else if (boss.id !== trackedBossId) {
      trackedBossId = boss.id;
      trackedBossPhase = boss.phase;
      trackedBossMode = boss.mode || null;
    } else if ((boss.mode || null) !== trackedBossMode || boss.phase > trackedBossPhase) {
      trackedBossPhase = boss.phase;
      trackedBossMode = boss.mode || null;
      bossPhaseCue = { at: now, mode: boss.mode || "phase" };
    } else {
      trackedBossPhase = boss.phase;
      trackedBossMode = boss.mode || null;
    }
  }
  function drawPresentationCues(now, reducedMotion, ship, boss) {
    cueGraphics.clear();
    const phaseProgress = cueProgress(now, bossPhaseCue, reducedMotion);
    if (boss && !reducedMotion && phaseProgress >= 0 && phaseProgress < 1) {
      const ease = settleEase(phaseProgress), radius = boss.r + 18 + (reducedMotion ? 0 : 26 * ease);
      if (bossPhaseCue.mode === "patience") {
        // The outer membrane visibly closes onto the steady shield. This is a
        // one-shot state transition; the persistent shield below never pulses.
        const closingRadius = boss.r + 42 - 28 * ease;
        cueGraphics.lineStyle(5, 0x79f4ec, .78 * (1 - ease)).strokeCircle(boss.x, boss.y, closingRadius);
        cueGraphics.lineStyle(2, 0xd9fffb, .58 * (1 - ease)).strokeCircle(boss.x, boss.y, closingRadius + 8);
      } else if (bossPhaseCue.mode === "rage" || bossPhaseCue.mode === "frenzy") {
        const flare = boss.r + 14 + 18 * ease, alpha = .82 * (1 - ease);
        cueGraphics.lineStyle(5, 0xff745f, alpha);
        cueGraphics.lineBetween(boss.x - flare, boss.y, boss.x - boss.r, boss.y);
        cueGraphics.lineBetween(boss.x + boss.r, boss.y, boss.x + flare, boss.y);
        cueGraphics.lineBetween(boss.x, boss.y - flare, boss.x, boss.y - boss.r);
        cueGraphics.lineBetween(boss.x, boss.y + boss.r, boss.x, boss.y + flare);
        cueGraphics.lineStyle(2, 0xffd879, alpha * .7).strokeCircle(boss.x, boss.y, radius);
      } else {
        const color = bossPhaseCue.mode === "mutation" ? 0xd1a7ff : 0xffdd72;
        cueGraphics.lineStyle(3, color, .76 * (1 - ease)).strokeCircle(boss.x, boss.y, radius);
      }
    }
    const activationProgress = cueProgress(now, abilityCue, reducedMotion);
    if (ship && activationProgress >= 0 && activationProgress < 1) {
      const ease = settleEase(activationProgress), radius = 28 + (reducedMotion ? 0 : 18 * ease);
      cueGraphics.fillStyle(0xc6fff4, .18 * (1 - ease)).fillCircle(ship.x, ship.y, radius);
      cueGraphics.lineStyle(2, 0xc6fff4, .72 * (1 - ease)).strokeCircle(ship.x, ship.y, radius);
    }
    const readyProgress = cueProgress(now, chargeReadyCue, reducedMotion);
    if (readyProgress >= 0 && readyProgress < 1) {
      cueGraphics.lineStyle(2, 0x80f3e8, .82 * (1 - readyProgress)).strokeCircle(chargeReadyCue.x, chargeReadyCue.y, 22);
    }
  }
  function render(state) {
    if (destroyed) return;
    state = state && typeof state === "object" ? state : {};
    const now = Number.isFinite(state.time) ? state.time : 0, enemies = state.enemies || [], effects = state.effects || {}, hud = state.hud || {};
    const tutorial = state.tutorial, visible = Boolean(tutorial);
    const boss = enemies.find((enemy) => enemy.type === "miniboss" || enemy.type === "majorboss");
    const barrierSeconds = Number.isFinite(hud.barrierSeconds) ? hud.barrierSeconds : (hud.shield ? 3 : 0);
    const overdriveSeconds = Number.isFinite(hud.overdriveSeconds) ? hud.overdriveSeconds : 0;
    const charges = Number.isFinite(hud.abilityCharges) ? hud.abilityCharges : (hud.charge || 0);
    updatePresentationCues({ now, tutorial: tutorial || {}, tutorialVisible: visible, boss, charges, abilityActive: effects.pulse > 0 || barrierSeconds > 0 || overdriveSeconds > 0, ship: state.ship });
    updateWarnings(state.warnings || [], now, state.emitters || []); updateDeaths(enemies, effects.deaths, now);
    for (const type of Object.keys(enemyBuckets)) enemyBuckets[type].length = 0;
    for (const enemy of enemies) {
      const displayType = displayTypeFor(enemy);
      if (enemyBuckets[displayType]) enemyBuckets[displayType].push(enemy);
    }
    for (const kind of Object.keys(dropBuckets)) dropBuckets[kind].length = 0;
    for (const drop of state.drops || []) if (dropBuckets[drop.kind]) dropBuckets[drop.kind].push(drop);
    show("ship", "emitter", state.ship ? [state.ship] : [], (sprite, ship) => {
      const [motion, frame] = actorFrame(ship, now, state.reducedMotion);
      sprite.setTexture(textureFor("emitter", motion, frame)).setPosition(ship.x, ship.y).setDisplaySize(actorSize(ship, "emitter"), actorSize(ship, "emitter")).setAlpha(ship.invulnerable ? (state.reducedMotion ? .7 : .62 + .28 * Math.sin(now * 25)) : 1);
    });
    // Drones are actors supplied by the model. Their locations are never
    // invented by the view; this makes the two mint companions readable while
    // keeping their displayed footprint tied to their real collision radius.
    show("drone", "emitter", state.drones || [], (sprite, drone) => {
      const diameter = Math.max(4, (drone.r || 5) * 2);
      sprite.setTexture(textureFor("emitter", "idle", 0)).setPosition(drone.x, drone.y).setDisplaySize(diameter, diameter).setTint(0x86f4d1).setRotation(state.reducedMotion ? 0 : (Number.isFinite(drone.angle) ? drone.angle : 0)).setAlpha(1);
    });
    for (const type of Object.keys(enemyBuckets)) show(`enemy-${type}`, type, enemyBuckets[type], (sprite, enemy) => {
      const [motion, frame] = actorFrame(enemy, now, state.reducedMotion);
      sprite.setTexture(textureFor(type, motion, frame)).setPosition(enemy.x, enemy.y).setDisplaySize(actorSize(enemy), actorSize(enemy)).setAlpha(1);
      const mode = enemy.mode;
      if (mode === "patience") sprite.setTint(0x8de9e4);
      else if (mode === "rage" || mode === "frenzy") sprite.setTint(0xff947e);
      else if (mode === "mutation" || (type === "majorboss" && enemy.phase > 1)) sprite.setTint(0xd8bcff);
      // Variant enemies deliberately reuse their stated atlas silhouette, but
      // the model type remains visible as a stable color cue at a glance.
      else if (enemy.type === "burstSower") sprite.setTint(0xe1b7ff);
      else if (enemy.type === "bloomSentinel") sprite.setTint(0xffc07c);
      else sprite.clearTint();
    });
    show("shot", "cell-player-shot", state.shots || [], (sprite, shot) => {
      const style = shot.style || shot.weaponId || "base";
      const diameter = Math.max(2, (shot.r || 4) * 2);
      const damage = Number.isFinite(shot.damage) ? shot.damage : 1;
      const tint = style === "spread" || style === "fan" ? 0xfff0c9 : style === "seeker" || style === "homing" ? 0xffd957 : (style === "lance" || style === "rail") ? 0x74eef4 : style === "chain" ? 0xb9a8ff : style === "drones" || style === "swarm" ? 0x86f4d1 : style === "barrage" ? 0xc9e9ff : 0xf3fbff;
      // The sprite always stays inside the model's circular shot diameter.
      // Longer-looking weapons get their shape from the graphics pass below,
      // also clipped to this measured bound rather than an invented hit area.
      // Heads are painted by drawShotStyles at their true position/radius.
      // Keeping this shared diamond invisible avoids a second generic shape
      // obscuring advanced silhouettes.
      sprite.setTexture("cell-player-shot").setPosition(shot.x, shot.y).setDisplaySize(diameter, diameter).setTint(tint).setAlpha(0);
    });
    show("hostile", "hostile", state.hostileBullets || [], (sprite, bullet) => {
      const kind = bullet.kind || "standard", radius = Number.isFinite(bullet.r) ? bullet.r : kind === "heavy" ? 8 : kind === "needle" ? 3.5 : 5;
      sprite.setPosition(bullet.x, bullet.y).setDisplaySize(radius * 2, radius * 2).setTint(kind === "heavy" ? 0xff765f : kind === "needle" ? 0xff42a5 : 0xff8fa8).setRotation(Math.atan2(bullet.vy || 0, bullet.vx || 1));
    });
    for (const kind of Object.keys(dropBuckets)) show(`drop-${kind}`, kind, dropBuckets[kind], (sprite, drop) => {
      sprite.setPosition(drop.x, drop.y).setDisplaySize((drop.r || 12) * 2, (drop.r || 12) * 2);
      if (drop.kind === "charge") sprite.setTint(0xc6fff4); else sprite.clearTint();
    });
    for (const sprite of pools.get("death").items) {
      if (!sprite.death || sprite.death.until <= now) { sprite.death = null; sprite.setActive(false).setVisible(false); continue; }
      const death = sprite.death, frame = Math.min(5, Math.floor((1 - (death.until - now) / .3) * 6));
      sprite.setTexture(textureFor(death.type, "death", frame)).setPosition(death.x, death.y).setDisplaySize(actorSize(death), actorSize(death)).setAlpha(Math.max(0, (death.until - now) / .3));
    }
    show("impact", "cell-impact", effects.hits || [], (sprite, hit) => sprite.setTexture("cell-impact").setPosition(hit.x,hit.y).setDisplaySize(18,18).setAlpha(Math.max(0,1-hit.age/.18)));
    dropLabels.forEach((label,index) => {
      const drop = (state.drops || [])[index]; label.setVisible(Boolean(drop));
      if(drop) label.setPosition(drop.x,drop.y+30).setText({charge:"CHARGE",rapid:"RAPID",shield:"SHIELD",star:"BONUS"}[drop.kind] || "BONUS");
    });
    pickupLabels.forEach((label,index) => {
      const effect = (effects.pickups || [])[index]; label.setVisible(Boolean(effect));
      if(effect) {
        const rise = state.reducedMotion ? 0 : 24 * (1 - Math.pow(1 - Math.min(1,effect.age/.2),3));
        label.setPosition(effect.x,effect.y-rise).setText(effect.text).setColor(effect.color || "#fff7d1").setAlpha(Math.min(1,Math.max(0,(.65-effect.age)/.2)));
      }
    });
    graphics.clear();
    // emitters/hazards are explicit model output.  Their live state and
    // normalized progress are the only source for warning, danger, and fade.
    drawAreaEffects(state.emitters, state.hazards, state.reducedMotion);
    drawPresentationCues(now, state.reducedMotion, state.ship, boss);
    drawHostileDetails(state.hostileBullets || []);
    drawShotStyles(state.shots || []);
    drawChainLinks(effects.chainLinks || []);
    drawBlastImpacts(Array.isArray(effects.blasts) ? effects.blasts : [], state.reducedMotion);
    // Shield impacts have their own cyan bracket language, so a blocked shot
    // can never be mistaken for the warm flash of successful damage.
    for (const guard of effects.guards || []) {
      const age = Math.max(0, Number.isFinite(guard.age) ? guard.age : 0);
      if (age >= .24 || !Number.isFinite(guard.x) || !Number.isFinite(guard.y)) continue;
      const progress = Math.min(1, age / .24), alpha = .9 * (1 - progress);
      const radius = 13 + (state.reducedMotion ? 0 : 9 * settleEase(progress));
      graphics.lineStyle(3, 0x79f4ec, alpha);
      graphics.lineBetween(guard.x - radius, guard.y - 5, guard.x - radius, guard.y + 5);
      graphics.lineBetween(guard.x + radius, guard.y - 5, guard.x + radius, guard.y + 5);
      graphics.lineStyle(1, 0xd9fffb, alpha * .8).strokeCircle(guard.x, guard.y, Math.max(5, radius - 5));
    }
    if (effects.pulse && state.ship) { graphics.lineStyle(5, 0xc6fff4, effects.pulse * 2); graphics.strokeCircle(state.ship.x, state.ship.y, state.reducedMotion ? 40 : (.5 - effects.pulse) * 650); }
    const build = hud.build || {};
    if (barrierSeconds > 0 && state.ship) {
      graphics.lineStyle(3, 0x8fa8ff, .86).strokeCircle(state.ship.x, state.ship.y, 28);
      graphics.lineStyle(1, 0xd7f1ff, .72).strokeCircle(state.ship.x, state.ship.y, 24);
    }
    // A constant halo reads as damage amplification without a strobe or any
    // extra timer; the host-controlled model owns the ability's duration.
    if (overdriveSeconds > 0 && state.ship) graphics.fillStyle(0xffedb0, .12).fillCircle(state.ship.x, state.ship.y, 34);
    if (boss) {
      const bossMode = boss.mode || (boss.phase >= (boss.phases || 3) ? "rage" : boss.phase >= 2 ? "mutation" : (boss.type === "miniboss" ? "recon" : "assault"));
      const bossHpRatio = Math.max(0, Math.min(1, boss.hp / Math.max(1, boss.maxHp)));
      const barColor = bossMode === "patience" ? 0x79f4ec : bossMode === "rage" || bossMode === "frenzy" ? 0xff745f : bossMode === "mutation" ? 0xd1a7ff : 0xffdd72;
      graphics.fillStyle(0x26132a, 1).fillRect(440, 76, 400, 9);
      graphics.fillStyle(barColor, 1).fillRect(440, 76, 400 * bossHpRatio, 9);
      // Threshold ticks preview the structure of the fight before a transition
      // happens, rather than making the next state feel arbitrary.
      const bossPhases = Math.max(1, Math.round(boss.phases || (boss.type === "majorboss" ? 3 : 2)));
      graphics.fillStyle(0xf3fbff, .88);
      for (let phase = 1; phase < bossPhases; phase++) graphics.fillRect(Math.round(440 + 400 * phase / bossPhases) - 1, 73, 3, 15);

      // Mode anatomy is readable at play speed and survives reduced motion:
      // open core (assault), sealed core (patience), split tissue (mutation),
      // or four hot exposed pylons (rage/frenzy).
      const core = Math.max(8, Math.round(boss.r * .22));
      if (bossMode === "patience") {
        graphics.fillStyle(0x123849, .98).fillRect(boss.x - core - 2, boss.y - core - 2, core * 2 + 4, core * 2 + 4);
        graphics.fillStyle(0x79f4ec, 1).fillRect(boss.x - Math.round(core * .45), boss.y - core, Math.round(core * .9), core * 2);
        graphics.lineStyle(4, 0x79f4ec, .96).strokeCircle(boss.x, boss.y, boss.r + 12);
        graphics.lineStyle(1, 0xd9fffb, .82).strokeCircle(boss.x, boss.y, boss.r + 17);
        const bracket = boss.r + 9;
        graphics.fillStyle(0xd9fffb, .96)
          .fillRect(boss.x - bracket - 3, boss.y - 10, 6, 20).fillRect(boss.x + bracket - 3, boss.y - 10, 6, 20)
          .fillRect(boss.x - 10, boss.y - bracket - 3, 20, 6).fillRect(boss.x - 10, boss.y + bracket - 3, 20, 6);
      } else {
        graphics.fillStyle(0xfff0c9, .95).fillRect(boss.x - core, boss.y - core, core * 2, core * 2);
        graphics.fillStyle(bossMode === "rage" || bossMode === "frenzy" ? 0xff553f : 0xff5d89, .95).fillRect(boss.x - Math.round(core * .5), boss.y - Math.round(core * .5), core, core);
        // Health-gate recovery lasts less than a second, but it still needs an
        // honest static read because auto-fire continues during the shift.
        if (boss.vulnerable === false) graphics.lineStyle(3, 0xffd879, .9).strokeCircle(boss.x, boss.y, boss.r + 10);
      }
      if (bossMode === "mutation") {
        graphics.fillStyle(0xd1a7ff, .96)
          .fillRect(boss.x - boss.r * .66, boss.y - boss.r * .56, 13, 13)
          .fillRect(boss.x + boss.r * .66 - 13, boss.y - boss.r * .56, 13, 13);
        graphics.lineStyle(3, 0xffd8e4, .84);
        graphics.lineBetween(boss.x - boss.r * .58, boss.y + boss.r * .1, boss.x - boss.r * .3, boss.y + boss.r * .4);
        graphics.lineBetween(boss.x + boss.r * .58, boss.y + boss.r * .1, boss.x + boss.r * .3, boss.y + boss.r * .4);
      }
      if (bossMode === "rage" || bossMode === "frenzy") {
        graphics.fillStyle(0xff745f, .98);
        graphics.fillRect(boss.x - boss.r * .78, boss.y - 5, 12, 10).fillRect(boss.x + boss.r * .78 - 12, boss.y - 5, 12, 10).fillRect(boss.x - 5, boss.y - boss.r * .78, 10, 12).fillRect(boss.x - 5, boss.y + boss.r * .78 - 12, 10, 12);
        graphics.lineStyle(3, 0xffd879, .76);
        graphics.lineBetween(boss.x - boss.r * .62, boss.y - boss.r * .62, boss.x - boss.r * .82, boss.y - boss.r * .82);
        graphics.lineBetween(boss.x + boss.r * .62, boss.y - boss.r * .62, boss.x + boss.r * .82, boss.y - boss.r * .82);
      }
    }
    if (state.ship) {
      graphics.lineStyle(1, 0xfff9db, .6).strokeCircle(state.ship.x, state.ship.y, state.ship.r || 10); graphics.fillStyle(0xfff9db, 1).fillCircle(state.ship.x, state.ship.y, 3);
      // These are emitter modules only; every muzzle is anchored on the real
      // ship and never implies another collision body or target.
      const weaponId = state.build?.weaponId || hud.weaponId || "base", x = state.ship.x, y = state.ship.y - (state.ship.r || 10);
      graphics.fillStyle(0xa6fff1, .94);
      if (weaponId === "trident") [-8,0,8].forEach((offset) => graphics.fillRect(x+offset-1,y-12,3,12));
      else if (weaponId === "siege") { graphics.fillStyle(0xffedb0,.94).fillRect(x-6,y-14,12,14); graphics.lineStyle(2,0xfff7d1,.9).strokeCircle(x,y-15,5); }
      else if (weaponId === "arcstorm" || weaponId === "tesla" || weaponId === "chain") { graphics.lineStyle(2,0x9fffe3,.95).lineBetween(x-8,y-5,x-3,y-13).lineBetween(x-3,y-13,x+2,y-5).lineBetween(x+2,y-5,x+7,y-14); }
      else if (weaponId === "hunter") { graphics.fillStyle(0x86f4d1,.95).fillTriangle(x,y-16,x-6,y-4,x+6,y-4); }
      else if (weaponId === "escort") [-15,-5,5,15].forEach((offset) => graphics.fillRect(x+offset-2,y-7,4,6));
      else if (weaponId === "sentinel") [-58,58].forEach((offset) => { graphics.fillStyle(0xffedb0,.9).fillRect(x+offset-4,y-3,8,6); graphics.lineStyle(1,0xfff7d1,.9).lineBetween(x+offset,y-3,x+offset,y-14); });
      else if (weaponId === "helix") { graphics.lineStyle(2,0x86f4d1,.9).strokeCircle(x-4,y-8,4).strokeCircle(x+4,y-13,4); }
      else if (weaponId === "needle" || weaponId === "rail" || weaponId === "lance") graphics.fillStyle(0x9be7ff,.94).fillRect(x-2,y-18,4,18);
      else graphics.fillRect(x-3,y-10,6,10);
    }

    const weaponName = build.weaponName || hud.weaponName || (hud.weaponId ? String(hud.weaponId).toUpperCase() : `WEAPON ${hud.weapon || 1}`);
    const abilityName = build.abilityName || hud.abilityName || (hud.abilityId ? String(hud.abilityId).toUpperCase() : "PULSE");
    const abilitySeconds = barrierSeconds > 0 ? barrierSeconds : overdriveSeconds;
    const maxCharges = Number.isFinite(hud.abilityMaxCharges) ? hud.abilityMaxCharges : 2;
    const abilityStatus = abilitySeconds > 0 ? `${Math.ceil(abilitySeconds)}s` : `${charges}/${maxCharges}`;
    let perks = "";
    if (Array.isArray(build.perks) && build.perks.length) {
      let shown = 0, omitted = 0;
      for (let index = 0; index < build.perks.length; index++) {
        const perk = build.perks[index];
        if (!perk) continue;
        if (shown >= 3) { omitted++; continue; }
        perks += `${perks ? " · " : ""}${perk.title || perk.id || "PERK"}${perk.rank ? ` ${perk.rank}` : ""}`;
        shown++;
      }
      if (omitted) perks += `${perks ? " · " : ""}+${omitted} MORE`;
    }
    const patienceActive = boss?.mode === "patience";
    leftHud.setVisible(!visible).setText(`SCORE ${String(hud.score || 0).padStart(5, "0")}\n${patienceActive ? "SURVIVAL ONLY" : `GUN ${weaponName}`}`);
    rightHud.setVisible(!visible).setText(boss
      ? `LIVES ${"●".repeat(hud.lives || 0)}${"○".repeat(Math.max(0, 3 - (hud.lives || 0)))}\n${patienceActive ? "WEAPONS / X DISABLED" : `X ${abilityName} · ${abilityStatus}`}`
      : `LIVES ${"●".repeat(hud.lives || 0)}${"○".repeat(Math.max(0, 3 - (hud.lives || 0)))}`);
    centerHud.setVisible(!visible).setText(boss
      ? `WAVE ${hud.wave || 1} · ${boss.type === "majorboss" ? "MAJOR BOSS" : "MINIBOSS"}`
      : `WAVE ${hud.wave || 1}${hud.wave > 20 ? " · ESCALATION" : ""}\nX ${abilityName} · ${abilityStatus}`);
    if (boss && !visible) {
      const mode = boss.mode || (boss.phase >= (boss.phases || 3) ? "rage" : boss.phase >= 2 ? "mutation" : (boss.type === "miniboss" ? "recon" : "assault"));
      const remaining = Number.isFinite(boss.modeRemaining) ? Math.max(0, Math.ceil(boss.modeRemaining)) : null;
      const shifting = boss.vulnerable === false && mode !== "patience";
      const patienceStyle = String(boss.patienceStyle || "").replace(/([a-z])([A-Z])/g, "$1 $2").toUpperCase();
      const modeCopy = shifting
        ? "PHASE SHIFT · CORE REFORMING"
        : mode === "patience"
        ? remaining !== null && remaining <= 0
          ? "PATIENCE · SURVIVE · FINALE"
          : `PATIENCE · SURVIVE${remaining === null ? "" : ` ${remaining}s`}${patienceStyle ? ` · ${patienceStyle}` : ""}`
        : mode === "rage" ? "RAGE · COMBINED ATTACKS"
          : mode === "frenzy" ? "FRENZY · FASTER PATTERNS"
            : mode === "mutation" ? "MUTATION · NEW PATTERNS"
              : mode === "recon" ? "RECON · READ THE PATTERN"
                : "ASSAULT · CORE EXPOSED";
      const modeColor = shifting ? "#ffd879" : mode === "patience" ? "#79f4ec" : mode === "rage" || mode === "frenzy" ? "#ff8a76" : mode === "mutation" ? "#d1a7ff" : "#ffd879";
      bossModeLabel.setVisible(true).setText(modeCopy).setColor(modeColor);
    } else bossModeLabel.setVisible(false);
    let bossWarning = false;
    for (const warning of state.warnings || []) if (warning.kind && warning.kind.startsWith("boss")) { bossWarning = true; break; }
    if (!bossWarning) {
      const comboId = String(boss?.comboId || "");
      const combo = comboId.replace(/([a-z])([A-Z])/g, "$1 $2").toUpperCase();
      const beat = Number.isFinite(boss?.beat) && boss.beat > 0 ? ` · BEAT ${boss.beat}` : "";
      const instruction = comboId === "latticeSweep" ? "FIND THE MOVING GAP" : comboId === "petalBurst" ? "SLIP BETWEEN PETALS" : comboId === "anchorCross" ? "CLEAR THE OFFSET CROSS" : "";
      attackLabel.setText(combo ? `BOSS ${combo}${beat}${instruction ? ` · ${instruction}` : ""}` : perks ? `PERKS ${perks}` : "");
    }
    const tutorialDuration = state.reducedMotion ? .1 : .2;
    const tutorialProgression = visible ? Math.max(0, Math.min(1, (now - tutorialEnterAt) / tutorialDuration)) : 1;
    const tutorialEase = settleEase(tutorialProgression);
    const tutorialAlpha = visible ? tutorialEase : 1;
    const tutorialOffset = state.reducedMotion ? 0 : 8 * (1 - tutorialEase);
    tutorialPanel.setVisible(visible).setAlpha(tutorialAlpha).setY(tutorialOffset);
    tutorialObjective.setVisible(visible).setAlpha(tutorialAlpha).setY(88 + tutorialOffset);
    tutorialHint.setVisible(visible).setAlpha(tutorialAlpha).setY(134 + tutorialOffset);
    tutorialProgress.setVisible(visible).setAlpha(tutorialAlpha).setY(171 + tutorialOffset);
    if (visible) {
      const success = tutorial.status === "success" || tutorial.finishing;
      tutorialObjective.setColor(success ? "#ffd879" : "#f3fbff").setText(success ? "SUCCESS" : (tutorial.objective || `PRACTICE ${(tutorial.step || 0) + 1}/5`));
      tutorialHint.setText(success ? "PRESS A TO CONTINUE" : (tutorial.hint || "SAFE EXERCISE"));
      const progress = tutorial.progress && typeof tutorial.progress === "object" ? `LESSON ${(tutorial.step || 0) + 1}/${tutorial.progress.total}` : (Number.isFinite(tutorial.remaining) ? `${Math.ceil(tutorial.remaining)}s SAFE EXERCISE` : `LESSON ${(tutorial.step || 0) + 1}/5`);
      tutorialProgress.setText(success && tutorial.canContinue ? "A CONTINUE" : progress);
    }
    const showMarkers = visible && tutorial.status === "active";
    shipMarker.setVisible(showMarkers && Boolean(state.ship));
    if (state.ship) shipMarker.setPosition(state.ship.x, state.ship.y - 48);
    const target = enemies.find((enemy) => enemy.type === "drifter");
    targetMarker.setVisible(showMarkers && Boolean(target) && (tutorial.lessonId === "move-fire" || tutorial.lessonId === "weapon-choice"));
    if (target) targetMarker.setPosition(target.x, target.y + 44);
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    [background, graphics, warningGraphics, areaGraphics, cueGraphics, tutorialPanel, attackLabel, leftHud, centerHud, rightHud, bossModeLabel, tutorialObjective, tutorialHint, tutorialProgress, shipMarker, targetMarker, ...dropLabels, ...pickupLabels].forEach((item) => item.destroy());
    pools.forEach((pool) => { pool.items.forEach((item) => item.destroy()); pool.group.destroy(true); });
    pools.clear(); knownEnemies.clear(); warnings.clear(); releaseUntil.clear();
  }
  return { render, destroy };
}
module.exports = { createView };
