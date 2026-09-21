"use strict";

const { WEAPONS, EVOLUTIONS, weaponById } = require("./weapons");

const PERKS = Object.freeze({
  power: { title: "Power", description: "+15% additive damage.", maxRank: Infinity, category: "damage" },
  overclock: { title: "Overclock", description: "+10% fire rate.", maxRank: 5, category: "rate" },
  focus: { title: "Focus", description: "+20% damage while A is held.", maxRank: 1, category: "damage" },
  magnet: { title: "Magnet", description: "+25% pickup radius.", maxRank: 3, category: "utility" },
  thrusters: { title: "Thrusters", description: "+10% movement speed.", maxRank: 2, category: "mobility" },
  chargeCoil: { title: "Charge Coil", description: "Abilities charge 15% faster from kills.", maxRank: 3, category: "ability" },
  burstCore: { title: "Burst Core", description: "Kills blast up to 3 nearby targets for 40% of the killing hit.", maxRank: 1, category: "damage" },
  repair: { title: "Repair", description: "Restore 1 life.", maxRank: Infinity, category: "survival" },
  shield: { title: "Shield", description: "Gain a shield that absorbs one hit.", maxRank: Infinity, category: "survival" },
  breakthrough: { title: "Breakthrough", description: "+30% additive base damage.", maxRank: Infinity, category: "damage" },
});

const ABILITIES = Object.freeze({
  pulse: { id: "pulse", name: "Pulse", description: "Clear bullets and damage enemies." },
  barrier: { id: "barrier", name: "Barrier", description: "Become invulnerable for 3 seconds." },
  overdrive: { id: "overdrive", name: "Overdrive", description: "+50% damage for 5 seconds." },
});

function initialBuild() {
  return { weaponId: "base", abilityId: "pulse", perks: {}, baseDamageBonus: 0, evolutionDeclines: 0 };
}

function card(id, title, description, category, preview, detail, apply) {
  return { id, title, description, category, preview, detail, apply };
}

function publicCard(value) {
  const { apply, ...publicValue } = value;
  return publicValue;
}

function coreCards() {
  const descriptions = {
    spread: "Covers a wide lane with three lighter shots; overlap them up close for single-target damage.",
    lance: "Fires a slow, heavy shot that pierces two targets.",
    seeker: "Fires a strong homing shot that tracks moving targets.",
  };
  return ["spread", "lance", "seeker"].map((id) => {
    const w = WEAPONS[id];
    return card(`weapon:${id}`, w.name, descriptions[id], "weapon", id, `${w.damage} damage · ${w.cooldown}s cooldown`, (build) => { build.weaponId = id; });
  });
}

function evolutionCards(build) {
  const descriptions = {
    fan: "Blankets a very wide lane; get close to overlap shots on one target.", barrage: "Staggers three powerful shots into a narrow lane.",
    rail: "Fires a devastating beam that pierces four targets.", chain: "Hits hard, then arcs to two nearby enemies.",
    swarm: "Launches three homing shots to hunt spread-out targets.", drones: "Replaces primary fire with two orbiting attack drones.",
  };
  const ids = EVOLUTIONS[build.weaponId] || [];
  const cards = ids.map((id) => {
    const w = WEAPONS[id];
    return card(`weapon:${id}`, w.name, w.description || descriptions[id], "evolution", id, `Tier ${w.tier} · ${w.damage} damage · ${w.cooldown}s cooldown${w.role ? ` · ${w.role}` : ""}`, (next) => { next.weaponId = id; });
  });
  cards.push(card("keep-current", "Keep Current", "+15% additive base damage; evolution returns later.", "evolution", build.weaponId, "Keep this weapon", (next) => { next.baseDamageBonus += 0.15; next.evolutionDeclines += 1; }));
  return cards;
}

function eligibleDraftCards(build, lives, shield) {
  const rank = (id) => build.perks[id] || 0;
  const result = [];
  for (const [id, spec] of Object.entries(PERKS)) {
    if (id === "breakthrough" || id === "repair" || id === "shield") continue;
    if (rank(id) >= spec.maxRank) continue;
    result.push(card(`perk:${id}`, spec.title, spec.description, spec.category, id, `Rank ${rank(id) + 1}${Number.isFinite(spec.maxRank) ? `/${spec.maxRank}` : ""}`, (next) => { next.perks[id] = rank(id) + 1; }));
  }
  if (lives < 3) result.push(card("perk:repair", PERKS.repair.title, PERKS.repair.description, "survival", "repair", "+1 life", (_next, state) => { state.lives = Math.min(3, state.lives + 1); }));
  if (!shield) result.push(card("perk:shield", PERKS.shield.title, PERKS.shield.description, "survival", "shield", "Absorb one hit", (_next, state) => { state.shield = true; }));
  for (const id of ["pulse", "barrier", "overdrive"]) {
    if (build.abilityId === id) continue;
    const ability = ABILITIES[id];
    result.push(card(`ability:${id}`, ability.name, ability.description, "ability", id, "Replaces current ability", (next) => { next.abilityId = id; }));
  }
  return result;
}

function shuffled(values, random) {
  const result = values.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function draftCards(build, lives, shield, random, guaranteedBreakthrough = false) {
  const pool = eligibleDraftCards(build, lives, shield);
  const offense = pool.filter((entry) => entry.category === "damage" || entry.category === "rate");
  const chosen = [];
  if (guaranteedBreakthrough) {
    chosen.push(card("perk:breakthrough", PERKS.breakthrough.title, PERKS.breakthrough.description, "damage", "breakthrough", "+30% base damage", (next) => { next.baseDamageBonus += 0.3; next.perks.breakthrough = (next.perks.breakthrough || 0) + 1; }));
  } else if (offense.length) chosen.push(shuffled(offense, random)[0]);
  for (const candidate of shuffled(pool, random)) {
    if (chosen.some((entry) => entry.id === candidate.id)) continue;
    chosen.push(candidate);
    if (chosen.length === 3) break;
  }
  return chosen;
}

function rewardForWave({ wave, build, lives, shield, random, context = "scored" }) {
  if (context === "tutorial") return { kind: "core", cards: coreCards(), canSkip: false, rerollsRemaining: 0 };
  if (wave === 3 && build.weaponId === "base") return { kind: "core", cards: coreCards(), canSkip: false, rerollsRemaining: 0 };
  const children = EVOLUTIONS[build.weaponId] || [];
  if (children.length && ((wave === 10 && weaponById(build.weaponId).tier === 1) || (wave >= 20 && wave % 10 === 0))) {
    return { kind: "evolution", cards: evolutionCards(build), canSkip: true, rerollsRemaining: 0 };
  }
  if (wave >= 5 && wave % 5 === 0) {
    return { kind: "draft", cards: draftCards(build, lives, shield, random, weaponById(build.weaponId).tier === 3 && wave % 10 === 0), canSkip: true, rerollsRemaining: 1 };
  }
  return null;
}

function publicBuild(build) {
  const weapon = weaponById(build.weaponId);
  const ability = ABILITIES[build.abilityId] || ABILITIES.pulse;
  return {
    weaponId: weapon.id,
    weaponName: weapon.name,
    abilityId: ability.id,
    abilityName: ability.name,
    perks: Object.entries(build.perks).filter(([, rank]) => rank > 0).map(([id, rank]) => ({ id, title: PERKS[id]?.title || id, rank, maxRank: PERKS[id]?.maxRank })),
  };
}

module.exports = { PERKS, ABILITIES, initialBuild, publicBuild, publicCard, rewardForWave, draftCards };
