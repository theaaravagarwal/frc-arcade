"use strict";

const { WEAPONS, EVOLUTIONS } = require("../games/cellDefender/weapons");
const { COMBO_IDS } = require("../games/cellDefender/bossPatterns");
const { ABILITIES, PERKS } = require("../games/cellDefender/builds");

const title = (value) => String(value || "").replace(/([a-z])([A-Z])/g, "$1 $2").toUpperCase();

function sandboxCatalog() {
  const parentByEvolution = {};
  Object.entries(EVOLUTIONS).forEach(([parent, evolutions]) => evolutions.forEach((id) => { parentByEvolution[id] = parent; }));
  const pathFor = (id) => {
    const seen = new Set(), parts = [];
    let current = id;
    while (current && !seen.has(current)) {
      seen.add(current); parts.unshift(WEAPONS[current]?.name || current);
      current = parentByEvolution[current];
    }
    return parts.join(" → ");
  };
  return {
    weapons: Object.values(WEAPONS).map(({ id, name, evolved, tier }) => ({
      id,
      name,
      evolved: Boolean(evolved),
      tier: Number.isFinite(tier) ? tier : (evolved ? 2 : 0),
      path: pathFor(id),
    })),
    abilities: Object.values(ABILITIES).map(({ id, name }) => ({ id, name })),
    perks: Object.entries(PERKS)
      .filter(([id]) => !["repair", "shield"].includes(id))
      .map(([id, perk]) => ({
        id,
        name: perk.title || title(id),
        maxRank: Number.isFinite(perk.maxRank) ? perk.maxRank : 100,
      })),
    // These values are deliberately the model's public enum values.  The
    // renderer does not translate a label back into a gameplay instruction.
    bossPhases: [
      { id: "assault", name: "Assault" },
      { id: "mutation", name: "Mutation" },
      { id: "rage", name: "Rage" },
      { id: "patience", name: "Patience" },
      { id: "recon", name: "Recon" },
      { id: "frenzy", name: "Frenzy" },
    ],
    // Keep F2 choices identical to the model's accepted public enum.
    bossPatterns: COMBO_IDS.map((id) => ({ id, name: title(id) })),
  };
}

function sandboxState(snapshot = {}) {
  const build = snapshot.build || {};
  const ranks = {};
  const perks = Array.isArray(build.perks) ? build.perks : snapshot.perks;
  if (Array.isArray(perks)) perks.forEach((perk) => { if (perk?.id) ranks[perk.id] = Number(perk.rank) || 0; });
  else if (perks && typeof perks === "object") Object.entries(perks).forEach(([id, rank]) => { ranks[id] = Number(rank) || 0; });
  return {
    weaponId: build.weaponId || snapshot.weaponId || snapshot.weapon || "base",
    abilityId: build.abilityId || snapshot.abilityId || "pulse",
    perks: ranks,
    wave: "",
    invincible: Boolean(snapshot.sandboxInvincible),
    restartWave: false,
    bossPhase: "",
    bossPattern: "",
  };
}

module.exports = { sandboxCatalog, sandboxState };
