"use strict";

const COMBO_IDS = Object.freeze([
  "crossingStreams",
  "orbitGaps",
  "delayedBlooms",
  "sweepPursuit",
  "latticeSweep",
  "petalBurst",
  "anchorCross",
]);

const MODE_BEATS = Object.freeze({
  recon: 2,
  frenzy: 2,
  assault: 2,
  mutation: 3,
  rage: 4,
});

const SECONDARY_FAMILY = Object.freeze({
  crossingStreams: "delayedBlooms",
  delayedBlooms: "crossingStreams",
  orbitGaps: "sweepPursuit",
  sweepPursuit: "orbitGaps",
  latticeSweep: "anchorCross",
  anchorCross: "latticeSweep",
  petalBurst: "delayedBlooms",
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const bullet = (x, y, vx, vy, delay = 0, kind = "standard", radius = 5) => ({ x, y, vx, vy, r: radius, kind, delay });

function variantBullet(x, y, angle, speed, kind) {
  const radius = kind === "heavy" ? 8 : kind === "needle" ? 3.5 : 5;
  const scaled = kind === "heavy" ? speed * 0.8 : kind === "needle" ? Math.min(260, speed * 1.12) : speed;
  return bullet(x, y, Math.cos(angle) * scaled, Math.sin(angle) * scaled, 0, kind, radius);
}

function speedForWave(wave, mode) {
  const bonus = { recon: 0, frenzy: 10, assault: 8, mutation: 20, rage: 34 }[mode] || 0;
  return clamp(176 + Math.max(0, wave - 5) * 1.35 + bonus, 176, 260);
}

function makeBeat({ family, mode, wave, boss, ship, comboSerial, index }) {
  const speed = speedForWave(wave, mode);
  let origin = { x: boss.x, y: boss.y + 35 };
  const target = { x: ship.x, y: ship.y };
  const bullets = [];
  const emitters = [];
  const hazards = [];
  const emitter = (x, y, kind = family, radius = 16) =>
    emitters.push({ x, y, radius, kind });

  if (family === "crossingStreams") {
    const y = 220 + ((comboSerial + index) % 4) * 74;
    for (const side of [-1, 1]) {
      const x = side < 0 ? 72 : 1208;
      emitter(x, y, "streamEmitter", 18);
      const aim = Math.atan2(target.y - y, target.x - x);
      const count = mode === "recon" ? 2 : 3;
      for (let lane = 0; lane < count; lane++) {
        const angle = aim + (lane - (count - 1) / 2) * 0.085;
        const kind = (mode === "mutation" || mode === "frenzy") && lane === Math.floor(count / 2) ? "heavy" : "standard";
        bullets.push(variantBullet(x, y, angle, speed, kind));
      }
    }
  } else if (family === "orbitGaps") {
    // Each beat rotates the omitted arc by one slot. This is a real sequence of
    // angular emissions; the gap is four slots (120 degrees / comfortably >60px
    // at gameplay distance), and its lower arc stays reachable inside the arena.
    const slots = 12;
    const gapSlots = 4;
    const orbitAngle = comboSerial * 0.31 + index * 0.72;
    origin = {
      x: clamp(boss.x + Math.cos(orbitAngle) * 76, 70, 1210),
      y: clamp(boss.y + 38 + Math.sin(orbitAngle) * 42, 90, 250),
    };
    const playerAngle = Math.atan2(target.y - origin.y, target.x - origin.x);
    const rotation = comboSerial * 0.07 + index * 0.09;
    const baseGap = Math.round(((playerAngle - rotation) / (Math.PI * 2)) * slots);
    const gapStart =
      (baseGap - Math.floor(gapSlots / 2) + slots * 4) % slots;
    emitter(origin.x, origin.y, "orbitEmitter", 22);
    for (let slot = 0; slot < slots; slot++) {
      const gapDistance = (slot - gapStart + slots) % slots;
      if (gapDistance < gapSlots) continue;
      const angle = rotation + (slot * Math.PI * 2) / slots;
      const kind = mode === "rage" && wave >= 20 && index % 2 === 0 && slot === (gapStart + gapSlots) % slots ? "needle" : "standard";
      bullets.push(variantBullet(origin.x, origin.y, angle, speed, kind));
    }
  } else if (family === "delayedBlooms") {
    const offset = index % 2 ? -118 : 118;
    const bloom = {
      x: clamp(target.x + offset, 82, 1198),
      y: clamp(target.y - 28 + (index % 3) * 32, 300, 650),
      radius: mode === "recon" ? 34 : 40,
      kind: "delayedBloom",
      activeDuration: mode === "rage" ? 0.55 : 0.45,
      expiryDuration: 0.25,
    };
    hazards.push(bloom);
    emitter(bloom.x, bloom.y, "bloomEmitter", 22);
    for (let ray = 0; ray < 6; ray++) {
      const angle = (ray * Math.PI * 2) / 6 + index * 0.18;
      bullets.push(
        bullet(bloom.x, bloom.y, Math.cos(angle) * speed * 0.72, Math.sin(angle) * speed * 0.72),
      );
    }
  } else if (family === "sweepPursuit") {
    const laneGap = 260;
    const gapCenter = clamp(target.x + (index - 1.5) * 52, 180, 1100);
    for (let lane = 0; lane < 7; lane++) {
      const x = 145 + lane * 165;
      if (Math.abs(x - gapCenter) < laneGap / 2) continue;
      emitter(x, 92, "sweepEmitter", 14);
      bullets.push(bullet(x, 92, 0, speed));
    }
    emitter(origin.x, origin.y, "pursuitEmitter", 18);
    const aim = Math.atan2(target.y - origin.y, target.x - origin.x);
    for (const [pursuitIndex, spread] of [-0.08, 0.08].entries())
      bullets.push(
        variantBullet(origin.x, origin.y, aim + spread, speed, mode === "rage" && wave >= 20 && index % 2 === 0 && pursuitIndex === 0 ? "needle" : "standard"),
      );
  } else if (family === "latticeSweep") {
    // Seven fixed downward lanes leave a two-lane opening.  The opening is
    // locked to the ship's lane, with only a one-lane drift per beat.
    const lanes = 7;
    const laneSpacing = 165;
    const firstLane = 145;
    const playerLane = clamp(Math.round((target.x - firstLane) / laneSpacing), 0, lanes - 1);
    const driftSequence = [-1, 0, 1, 0];
    // Mutation and rage weave a secondary family on odd beats, so advance the
    // lattice phase only when a lattice beat is actually emitted.
    const latticeIndex = (mode === "mutation" || mode === "rage") ? Math.floor(index / 2) : index;
    const gapCenter = clamp(playerLane + driftSequence[(comboSerial + latticeIndex) % driftSequence.length], 0, lanes - 2);
    for (let lane = 0; lane < lanes; lane++) {
      if (lane === gapCenter || lane === gapCenter + 1) continue;
      const x = firstLane + lane * laneSpacing;
      emitter(x, 92, "latticeEmitter", 14);
      bullets.push(bullet(x, 92, 0, speed));
    }
  } else if (family === "petalBurst") {
    // Offset upper emitters produce concave-looking fans.  The second petal
    // fires one fifth of a second later; the delay is part of each warning's
    // frozen projectile contract.
    const beatTurn = (comboSerial * 0.17 + index * 0.23) % (Math.PI * 2);
    const fanOffsets = [-0.38, -0.14, 0.16, 0.41];
    const emitX = [clamp(boss.x - 122, 100, 1180), clamp(boss.x + 122, 100, 1180)];
    for (let emitterIndex = 0; emitterIndex < 2; emitterIndex++) {
      const x = emitX[emitterIndex];
      const y = 104 + (emitterIndex ? 18 : 0);
      emitter(x, y, "petalEmitter", 18);
      for (let petal = 0; petal < fanOffsets.length; petal++) {
        // The slight quadratic spacing bends the fan around its central lane.
        const bend = (petal - 1.5) * (petal - 1.5) * 0.035;
        const angle = Math.PI / 2 + fanOffsets[petal] + (emitterIndex ? -bend : bend) + Math.sin(beatTurn) * 0.035;
        bullets.push(variantBullet(x, y, angle, speed, "standard"));
        bullets[bullets.length - 1].delay = emitterIndex ? 0.18 : 0;
      }
    }
  } else if (family === "anchorCross") {
    // Three anchors at the upper and side edges send paired diagonals through
    // the arena. Their lane offsets move each beat while preserving a broad
    // opening around the locked target column.
    const anchors = [
      { x: 76, y: 190 },
      { x: clamp(boss.x, 180, 1100), y: 92 },
      { x: 1204, y: 190 },
    ];
    const drift = ((comboSerial + index) % 3) - 1;
    const opening = clamp(target.x + drift * 58, 300, 980);
    for (const [anchorIndex, anchor] of anchors.entries()) {
      emitter(anchor.x, anchor.y, "anchorEmitter", 17);
      const toward = Math.atan2(target.y - anchor.y, target.x - anchor.x);
      const side = anchorIndex === 0 ? 1 : anchorIndex === 2 ? -1 : (target.x >= anchor.x ? 1 : -1);
      const gapBias = (opening - target.x) / 640;
      for (const spread of [-0.17, 0.17]) {
        const angle = toward + spread + side * gapBias * 0.12;
        bullets.push(variantBullet(anchor.x, anchor.y, angle, speed, "standard"));
      }
    }
  }

  return { family, origin, target, bullets, emitters, hazards };
}

function buildCombo({ family, mode, wave, boss, ship, comboSerial }) {
  if (!COMBO_IDS.includes(family) || !Object.hasOwn(MODE_BEATS, mode)) return null;
  const count = MODE_BEATS[mode];
  const cadence = { recon: 1.05, frenzy: 0.9, assault: 1, mutation: 0.88, rage: 0.78 }[mode];
  const beats = Array.from({ length: count }, (_, index) => {
    const beatFamily = index > 0 && index % 2 === 1 && (mode === "mutation" || mode === "rage")
      ? SECONDARY_FAMILY[family]
      : family;
    return {
      ...makeBeat({ family: beatFamily, mode, wave, boss, ship, comboSerial, index }),
      index,
      cueOffset: index * cadence,
      warning: index === 0 ? 0.9 : 0.65,
    };
  });
  return {
    id: family,
    beats,
    capacity: beats.reduce((sum, beat) => sum + beat.bullets.length, 0),
    endsAfter: (count - 1) * cadence + 0.65,
  };
}

function buildPatienceBeat({ style, wave, boss, ship, index }) {
  const family = style === "rotation" ? "orbitGaps" : "crossingStreams";
  const beat = makeBeat({
    family,
    mode: wave >= 30 ? "rage" : "mutation",
    wave,
    boss,
    ship,
    comboSerial: Math.floor(index / 2),
    index,
  });
  if (style === "rotation") {
    const side = index % 2 ? -1 : 1;
    const pursuit = {
      x: clamp(boss.x + side * 112, 72, 1208),
      y: clamp(boss.y + 24, 92, 235),
    };
    const distance = Math.hypot(ship.x - pursuit.x, ship.y - pursuit.y) || 1;
    const speed = clamp(180 + wave * 0.5, 180, 260);
    beat.emitters.push({
      x: pursuit.x,
      y: pursuit.y,
      radius: 16,
      kind: "pursuitEmitter",
    });
    const kind = wave >= 20 && index % 2 === 0 ? "needle" : "standard";
    const scaledSpeed = kind === "needle" ? Math.min(260, speed * 1.12) : speed;
    beat.bullets.push(
      bullet(
        pursuit.x,
        pursuit.y,
        ((ship.x - pursuit.x) / distance) * scaledSpeed,
        ((ship.y - pursuit.y) / distance) * scaledSpeed,
        0,
        kind,
        kind === "needle" ? 3.5 : 5,
      ),
    );
  }
  return beat;
}

module.exports = {
  COMBO_IDS,
  MODE_BEATS,
  buildCombo,
  buildPatienceBeat,
};
