"use strict";

const { WEAPONS = {} } = require("../games/cellDefender/weapons");
const PREVIEW_KEYS = ["pulse", "barrier", "overdrive", "repair", "shield", "magnet", "thrusters", "chargecoil", "burstcore", "power", "breakthrough", "overclock", "focus"];
function keyFor(offer) {
  const normalize = (value) => String(value || "").toLowerCase().replace(/^(?:weapon|perk):/, "");
  const preview = normalize(offer?.preview);
  const id = normalize(offer?.id);
  if (Object.hasOwn(WEAPONS, preview)) return preview;
  if (Object.hasOwn(WEAPONS, id)) return id;
  return PREVIEW_KEYS.includes(preview) ? preview : PREVIEW_KEYS.includes(id) ? id : null;
}
function rewardArt(offer) {
  const key = keyFor(offer);
  const attack = key === "tempest"
    ? '<path class="preview-shot fan-a" d="M52 67L10 18"/><path class="preview-shot fan-b" d="M52 67L25 8"/><path class="preview-shot fan-c" d="M52 67L52 5"/><path class="preview-shot fan-d" d="M52 67L79 8"/><path class="preview-shot fan-e" d="M52 67L94 18"/><path class="preview-shot fan-f" d="M52 67L6 35"/><path class="preview-shot fan-g" d="M52 67L98 35"/>'
    : key === "trident"
      ? '<path class="preview-shot fan-a" d="M34 67V12"/><path class="preview-shot fan-b" d="M52 67V7"/><path class="preview-shot fan-c" d="M70 67V12"/>'
    : key === "vulcan"
      ? '<path class="preview-shot fan-a" d="M43 67L43 10"/><path class="preview-shot fan-b" d="M48 67L48 7"/><path class="preview-shot fan-c" d="M53 67L53 5"/><path class="preview-shot fan-d" d="M58 67L58 7"/><path class="preview-shot fan-e" d="M63 67L63 10"/>'
    : key === "helix"
      ? '<path class="preview-shot" d="M42 67C22 52 79 40 59 8"/><path class="preview-shot" d="M62 67C82 52 25 40 45 8"/>'
    : key === "needle"
      ? '<path class="preview-rail" d="M52 67V55M52 49V38M52 32V21M52 15V8"/>'
    : key === "siege"
      ? '<circle class="preview-pulse" cx="52" cy="30" r="15"/><path class="preview-rail" d="M52 67V30"/>'
    : key === "arcstorm"
      ? '<path class="preview-chain" d="M52 64L27 46 74 34 30 21 68 10"/>'
    : key === "tesla"
      ? '<path class="preview-chain" d="M40 67V38L27 24M64 67V38L77 24"/>'
    : key === "hive"
      ? '<circle class="preview-orb orb-a" cx="31" cy="49" r="4"/><circle class="preview-orb orb-b" cx="52" cy="39" r="4"/><circle class="preview-orb orb-c" cx="73" cy="49" r="4"/><circle class="preview-orb" cx="52" cy="21" r="4"/><circle class="preview-orb" cx="52" cy="57" r="4"/><path class="preview-shot" d="M31 49L22 17M52 39V8M73 49L82 17M52 57V30"/>'
    : key === "hunter"
      ? '<path class="preview-orb" d="M82 10L76 27 86 24Z"/><path class="preview-seeker" d="M52 67C52 51 75 49 82 24"/>'
    : key === "escort"
      ? '<g class="preview-drone drone-a"><rect x="13" y="40" width="11" height="9"/></g><g class="preview-drone drone-b"><rect x="34" y="30" width="11" height="9"/></g><g class="preview-drone drone-c"><rect x="59" y="30" width="11" height="9"/></g><g class="preview-drone drone-d"><rect x="80" y="40" width="11" height="9"/></g>'
    : key === "sentinel"
      ? '<g class="preview-drone drone-a"><rect x="12" y="36" width="12" height="10"/></g><g class="preview-drone drone-b"><rect x="80" y="36" width="12" height="10"/></g><path class="preview-rail" d="M18 36L24 14M86 36L80 14"/>'
    : key === "fan"
    ? '<path class="preview-shot fan-a" d="M52 67L13 25"/><path class="preview-shot fan-b" d="M52 67L32 12"/><path class="preview-shot fan-c" d="M52 67L52 8"/><path class="preview-shot fan-d" d="M52 67L72 12"/><path class="preview-shot fan-e" d="M52 67L91 25"/>'
    : key === "spread"
      ? '<path class="preview-shot fan-a" d="M52 67L22 17"/><path class="preview-shot fan-b" d="M52 67L52 11"/><path class="preview-shot fan-c" d="M52 67L82 17"/>'
    : key === "rail" || key === "lance"
      ? '<path class="preview-rail" d="M52 67V8"/>'
      : key === "seeker"
        ? '<path class="preview-seeker" d="M52 67C52 43 74 52 78 23"/>'
        : key === "chain"
          ? '<path class="preview-chain" d="M52 64L52 41 29 24M52 41l23-17"/>'
          : key === "swarm"
            ? '<circle class="preview-orb orb-a" cx="35" cy="49" r="5"/><circle class="preview-orb orb-b" cx="66" cy="42" r="5"/><circle class="preview-orb orb-c" cx="51" cy="23" r="5"/>'
            : key === "drones"
              ? '<g class="preview-drone drone-a"><rect x="19" y="39" width="12" height="10"/></g><g class="preview-drone drone-b"><rect x="73" y="39" width="12" height="10"/></g><path class="preview-shot drone-shot-a" d="M25 39L39 18"/><path class="preview-shot drone-shot-b" d="M79 39L65 18"/>'
              : key === "barrage"
                ? '<path class="preview-shot fan-a" d="M43 67L43 10"/><path class="preview-shot fan-b" d="M52 67V7"/><path class="preview-shot fan-c" d="M61 67L61 10"/>'
                : key === "pulse"
                ? '<circle class="preview-pulse pulse-a" cx="52" cy="46" r="10"/><circle class="preview-pulse pulse-b" cx="52" cy="46" r="18"/>'
                : key === "barrier"
                  ? '<path class="preview-barrier" d="M52 16L76 26v17c0 17-12 25-24 30-12-5-24-13-24-30V26Z"/>'
                  : key === "overdrive"
                    ? '<path class="preview-shot over-a" d="M46 65L46 13"/><path class="preview-shot over-b" d="M52 65L52 6"/><path class="preview-shot over-c" d="M58 65L58 13"/>'
                    : key === "repair"
                      ? '<path class="preview-repair" d="M52 62C18 42 30 20 43 28l9 9 9-9c13-8 25 14-9 34Z"/><path class="preview-plus" d="M52 31v18M43 40h18"/>'
                      : key === "shield"
                        ? '<circle class="preview-shield-ring" cx="52" cy="54" r="22"/><circle class="preview-shield-ring ring-b" cx="52" cy="54" r="14"/>'
                        : key === "magnet"
                          ? '<path class="preview-magnet" d="M20 25L45 49M84 25L59 49M20 55l24-2M84 55l-24-2"/><rect class="preview-pickup pickup-a" x="15" y="20" width="8" height="8"/><rect class="preview-pickup pickup-b" x="81" y="20" width="8" height="8"/><rect class="preview-pickup pickup-c" x="15" y="51" width="8" height="8"/><rect class="preview-pickup pickup-d" x="81" y="51" width="8" height="8"/>'
                          : key === "thrusters"
                            ? '<path class="preview-thrust" d="M47 72l-6 7M52 72v8M57 72l6 7"/>'
                            : key === "chargecoil"
                              ? '<rect class="preview-meter" x="25" y="26" width="54" height="13"/><path class="preview-coil" d="M32 54h12l5-10 7 20 7-20 5 10h8"/>'
                              : key === "burstcore"
                                ? '<path class="preview-burst" d="M52 13v29M32 25l20 17 20-17M37 12l15 30 15-30M27 41h50"/>'
                                : key === "power" || key === "breakthrough"
                                  ? '<path class="preview-strong-shot" d="M52 67V8"/><path class="preview-strong-shot side-a" d="M44 67V19"/><path class="preview-strong-shot side-b" d="M60 67V19"/>'
                                  : key === "overclock"
                                    ? '<path class="preview-shot fast-a" d="M46 67V10"/><path class="preview-shot fast-b" d="M52 67V10"/><path class="preview-shot fast-c" d="M58 67V10"/>'
                                    : key === "focus"
                                      ? '<path class="preview-focus-shot" d="M52 67V8"/><path class="preview-focus-bracket" d="M43 23h18M43 51h18"/>'
                                      : '<path class="preview-shot" d="M52 67V15"/>';
  return `<svg class="reward-art preview-${key || "perk"}" viewBox="0 0 104 82" aria-hidden="true"><rect x="2" y="2" width="100" height="78" fill="#102653" stroke="#fff7d1" stroke-width="4"/><g class="preview-targets" fill="#ec245f"><rect x="17" y="12" width="12" height="12"/><rect x="46" y="8" width="12" height="12"/><rect x="75" y="12" width="12" height="12"/></g><g class="preview-effect" fill="none" stroke="#62eadb" stroke-width="4" stroke-linecap="square" stroke-linejoin="miter">${attack}</g><g class="preview-emitter" fill="#ffda28" stroke="#fff7d1" stroke-width="3"><path d="M44 72h16l-3-10H47Z"/></g></svg>`;
}
module.exports = { rewardArt };
