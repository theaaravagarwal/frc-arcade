"use strict";

const degrees = (value) => (value * Math.PI) / 180;

const WEAPONS = Object.freeze({
  base: { id: "base", name: "Emitter", cooldown: 0.18, damage: 1, style: "base", projectileSpeed: 520, projectileRadius: 4, trailLength: 2, tier: 0 },
  spread: { id: "spread", name: "Spread", cooldown: 0.24, damage: 0.8, style: "spread", angles: [-14, 0, 14], projectileSpeed: 500, projectileRadius: 4, trailLength: 3, tier: 1 },
  lance: { id: "lance", name: "Lance", cooldown: 0.3, damage: 3, style: "lance", pierce: 2, projectileSpeed: 470, projectileRadius: 5, trailLength: 6, tier: 1 },
  seeker: { id: "seeker", name: "Seeker", cooldown: 0.26, damage: 2.6, style: "seeker", homing: true, turnRate: 5.5, projectileSpeed: 460, projectileRadius: 5, trailLength: 5, tier: 1 },
  fan: { id: "fan", name: "Fan", cooldown: 0.3, damage: 0.75, style: "fan", angles: [-28, -14, 0, 14, 28], projectileSpeed: 500, projectileRadius: 4, trailLength: 3, evolved: true, tier: 2 },
  barrage: { id: "barrage", name: "Barrage", cooldown: 0.3, damage: 1.25, style: "barrage", angles: [-5, 0, 5], stagger: [0, 0.06, 0.12], projectileSpeed: 540, projectileRadius: 4, trailLength: 4, evolved: true, tier: 2 },
  rail: { id: "rail", name: "Rail", cooldown: 0.6, damage: 7.5, style: "rail", pierce: 4, projectileSpeed: 700, projectileRadius: 6, trailLength: 10, evolved: true, tier: 2 },
  chain: { id: "chain", name: "Chain", cooldown: 0.3, damage: 3.75, style: "chain", projectileSpeed: 510, projectileRadius: 5, trailLength: 6, chain: { targets: 2, ratio: 0.45, radius: 110 }, evolved: true, tier: 2 },
  swarm: { id: "swarm", name: "Swarm", cooldown: 0.3, damage: 1.25, style: "swarm", angles: [-8, 0, 8], homing: true, turnRate: 5, projectileSpeed: 420, projectileRadius: 4.5, trailLength: 5, evolved: true, tier: 2 },
  drones: { id: "drones", name: "Drones", cooldown: 0.24, damage: 1.5, style: "drones", drones: 2, droneFormation: "orbit", orbitRadius: 34, orbitSpeed: 2.2, projectileSpeed: 500, projectileRadius: 4, trailLength: 4, evolved: true, tier: 2 },
  tempest: { id: "tempest", name: "Tempest", cooldown: 0.34, damage: 0.95, style: "tempest", angles: [-36, -24, -12, 0, 12, 24, 36], volleyAngleBias: 5, projectileSpeed: 460, projectileRadius: 6, trailLength: 7, evolved: true, tier: 3, parent: "fan", description: "Seven sweeping blades alternate across a broad lane.", role: "lane clear", visual: { color: 0x7de5ff, shape: "crescent" } },
  trident: { id: "trident", name: "Trident", cooldown: 0.34, damage: 1.9, style: "trident", angles: [0, 0, 0], muzzleOffsets: [-22, 0, 22], pierce: 2, projectileSpeed: 620, projectileRadius: 5.5, trailLength: 9, evolved: true, tier: 3, parent: "fan", description: "Three parallel piercing prongs hold a tight formation.", role: "piercing volley", visual: { color: 0x9be7ff, shape: "prong" } },
  vulcan: { id: "vulcan", name: "Vulcan", cooldown: 0.6, damage: 2.2, style: "vulcan", angles: [-3, 0, 3, 0, -3], stagger: [0, 0.06, 0.12, 0.18, 0.24], projectileSpeed: 580, projectileRadius: 4, trailLength: 4, evolved: true, tier: 3, parent: "barrage", description: "A five-round burst walks onto one target over a quarter second.", role: "focused burst", visual: { color: 0xffdf8a, shape: "tracer" } },
  helix: { id: "helix", name: "Helix", cooldown: 0.42, damage: 3.6, style: "helix", angles: [0, 0], projectileSpeed: 420, projectileRadius: 6, trailLength: 12, weavePhaseStep: Math.PI / 2, weave: { amplitude: 42, frequency: 9, phases: [0, Math.PI] }, evolved: true, tier: 3, parent: "barrage", description: "Two wide corkscrewing shots sweep opposite sides of the lane.", role: "weaving fire", visual: { color: 0x88f2e8, shape: "helix" } },
  needle: { id: "needle", name: "Needle", cooldown: 0.14, damage: 2.1, style: "needle", pierce: 4, projectileSpeed: 820, projectileRadius: 3.5, trailLength: 11, evolved: true, tier: 3, parent: "rail", description: "A hair-thin, extremely fast round pierces four targets.", role: "piercing fire", visual: { color: 0xa1d8ff, shape: "needle" } },
  siege: { id: "siege", name: "Siege", cooldown: 0.75, damage: 10.4, style: "siege", pierce: 1, projectileSpeed: 300, projectileRadius: 9, trailLength: 5, splash: { radius: 80, ratio: 0.45, targets: 4 }, evolved: true, tier: 3, parent: "rail", description: "A slow heavy shell detonates across nearby targets.", role: "impact blast", visual: { color: 0xfff0b0, shape: "shell" } },
  arcstorm: { id: "arcstorm", name: "Arcstorm", cooldown: 0.26, damage: 2.8, style: "arcstorm", projectileSpeed: 500, projectileRadius: 5, trailLength: 7, chain: { targets: 4, ratio: 0.45, radius: 130, relay: true }, evolved: true, tier: 3, parent: "chain", description: "A relay arc jumps outward through four unique nearby targets.", role: "chain clear", visual: { color: 0x9adfff, shape: "fork" } },
  tesla: { id: "tesla", name: "Tesla", cooldown: 0.24, damage: 2, style: "tesla", angles: [0, 0], muzzleOffsets: [-10, 10], stagger: [0, 0.12], projectileSpeed: 500, projectileRadius: 4.5, trailLength: 6, chain: { targets: 1, ratio: 0.5, radius: 90 }, evolved: true, tier: 3, parent: "chain", description: "Two short parallel arcs fire in an alternating beat.", role: "twin arc", visual: { color: 0x8ff5dc, shape: "arc" } },
  hive: { id: "hive", name: "Hive", cooldown: 0.28, damage: 0.95, style: "hive", angles: [-30, -15, 0, 15, 30], stagger: [0, 0.05, 0.1, 0.15, 0.2], homing: true, turnRate: 4, projectileSpeed: 320, projectileRadius: 5, trailLength: 8, evolved: true, tier: 3, parent: "swarm", description: "Five slow seekers fan out before turning onto targets.", role: "homing swarm", visual: { color: 0x91f5b0, shape: "drone" } },
  hunter: { id: "hunter", name: "Hunter", cooldown: 0.36, damage: 6, style: "hunter", homing: true, turnRate: 2.5, projectileSpeed: 680, projectileRadius: 7, trailLength: 13, pierce: 2, evolved: true, tier: 3, parent: "swarm", description: "A fast heavy rocket bends gradually toward its prey.", role: "heavy pursuit", visual: { color: 0x74e5c2, shape: "rocket" } },
  escort: { id: "escort", name: "Escort", cooldown: 0.26, damage: 1.2, style: "escort", drones: 4, droneFormation: "orbit", orbitRadius: 45, orbitSpeed: 1.8, stagger: [0, 0.04, 0.08, 0.12], projectileSpeed: 430, projectileRadius: 4.5, trailLength: 5, evolved: true, tier: 3, parent: "drones", description: "Four orbiting pods fire a staggered perimeter barrage.", role: "orbit barrage", visual: { color: 0xffd775, shape: "pod" } },
  sentinel: { id: "sentinel", name: "Sentinel", cooldown: 0.4, damage: 3.2, style: "sentinel", angles: [8, -8], drones: 2, droneFormation: "outrigger", muzzleOffsets: [-58, 58], pierce: 2, projectileSpeed: 680, projectileRadius: 5.5, trailLength: 9, evolved: true, tier: 3, parent: "drones", description: "Two fixed outriggers launch converging piercing bolts.", role: "heavy broadside", visual: { color: 0xffefb3, shape: "lance" } },
});

const EVOLUTIONS = Object.freeze({
  spread: ["fan", "barrage"],
  lance: ["rail", "chain"],
  seeker: ["swarm", "drones"],
  fan: ["tempest", "trident"],
  barrage: ["vulcan", "helix"],
  rail: ["needle", "siege"],
  chain: ["arcstorm", "tesla"],
  swarm: ["hive", "hunter"],
  drones: ["escort", "sentinel"],
});

function weaponById(id) {
  return WEAPONS[id] || WEAPONS.base;
}

function projectileSpecs(weaponId) {
  const weapon = weaponById(weaponId);
  const angles = weapon.angles || Array.from({ length: weapon.drones || 1 }, () => 0);
  return angles.map((angle, index) => ({
    angle: degrees(angle),
    delay: weapon.stagger?.[index] || 0,
    damage: weapon.damage,
    pierce: weapon.pierce || 1,
    homing: Boolean(weapon.homing),
    speed: weapon.projectileSpeed || 520,
    radius: weapon.projectileRadius || 4,
    trailLength: Math.min(18, Math.max(0, weapon.trailLength || 0)),
    turnRate: weapon.turnRate || 0,
    muzzleOffset: weapon.muzzleOffsets?.[index] || 0,
    style: weapon.style,
    weave: weapon.weave && { ...weapon.weave, phase: weapon.weave.phases?.[index] || 0 },
    splash: weapon.splash && { ...weapon.splash },
  }));
}

module.exports = { WEAPONS, EVOLUTIONS, weaponById, projectileSpecs };
