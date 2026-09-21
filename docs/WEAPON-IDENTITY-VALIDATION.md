# Weapon identity pass

This pass keeps the 22-weapon tree and adds stronger mechanical and visual differences to its twelve advanced weapons. It also adds three enemy types and three boss combo families.

## Behavior

- Tempest alternates its seven-blade spread; Trident uses three parallel muzzles.
- Vulcan staggers five tracers; Helix uses wide opposite corkscrews with per-volley phase changes to avoid permanently blind distances.
- Needle is fast and narrow; Siege is a slow heavy shell with a bounded impact blast.
- Arcstorm relays through four unique nearby targets; Tesla alternates two shorter arcs.
- Hive fans out five slow homing shots; Hunter launches a fast heavy homing rocket.
- Escort has four moving orbit pods; Sentinel has two fixed outriggers with slightly converging piercing shots.

Projectile bodies and trails follow actual model positions, radii, velocities, and recorded history. Decorative trails do not add collision areas. Reduced motion retains distinct projectile heads. Friendly colors remain separate from hostile bullets.

Skirmishers enter at wave 6, Bulwarks at wave 12, and Orbiters at wave 18. They replace formation slots and retain the existing threat budget. Their distinct two-needle, three-heavy-round, and open-ring attacks have locked telegraphs. Motion freezes during the tell and resumes without advancing a hidden orbit clock.

Lattice Sweep, Petal Burst, and Anchor Cross join the existing boss families. They keep the existing global projectile caps, declared origins/delays, and warning durations. Lattice openings use a triangle drift sequence to prevent a two-lane wraparound jump.

## Verification scope

Automated model tests cover shot metadata, bounded trails, formations, relay uniqueness, new enemy introductions and attacks, telegraph movement, and existing lifecycle behavior. The 22-weapon comparison probes stationary single targets, rows, and columns; these measure coverage tradeoffs rather than human balance. Boss route probes check sampled normal and focus movement paths rather than proving every position survivable.

The native Electron harness boots the app, chooses each advanced weapon through F2, resolves real wave-20 reward cards, captures model-driven projectile/enemy/boss geometry at 1280×720, and checks reduced motion and bounded full-motion frame pacing. It uses temporary profile and score files. Cabinet hardware and human difficulty still need playtesting.

Visual review also caught and fixed a Phaser path-reuse artifact that connected Tempest crescent heads across the volley. Each crescent now begins its own drawing path.


## Recorded result

- 137 automated tests passed after the final rendering change.
- All 22 weapon geometry probes and 33 sampled boss routes passed.
- Native content captures covered 12 advanced weapons, 3 enemies, and 3 new boss families; all eighteen screenshots were visually reviewed.
- Native boot, F2 selection, wave-20 card resolution, reduced-motion capture/restore, console-error checks, and engine cleanup passed.
- Four five-second full-motion samples recorded 300–301 frames each. P95 frame gaps were 17.4–17.5 ms; maximum observed gap was 18.2 ms. P95 host ticks were 2.1–2.5 ms, with a maximum of 4.5 ms. These are bounded development-machine measurements.

Evidence was completed across the accepted content fixture run and a targeted reduced-motion/performance run. A single default harness invocation did not finish cleanly: media-query delivery and CDP evaluation timing caused harness races after the gameplay checks. The targeted runs covered the remaining checks; this is not a claim that the default test command is fully reliable.

Native evidence is in `/var/folders/5w/l2b9qlms07g2ky4_nwq8kxjh0000gn/T/hosa-content-native` (`fixtures-report.json`, `report.json`, and PNG captures). Temporary profiles and leaderboard paths isolated the tests from participant scores.
