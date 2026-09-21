# HOSA Arcade

Electron cabinet shell featuring Cell Defender. Lab Dash source remains in the repository but is hidden from both production and development selection. See [HOSA.md](HOSA.md) for controls, source credits, and license notices.

Cell Defender adapts [dwmkerr/spaceinvaders](https://github.com/dwmkerr/spaceinvaders) at [`07fee2a3a54e925764637ce68c559c617b4289e3`](https://github.com/dwmkerr/spaceinvaders/tree/07fee2a3a54e925764637ce68c559c617b4289e3), under [MIT](vendor/spaceinvaders/LICENSE); the vendored source is in `vendor/spaceinvaders/` and was modified for this game. Lab Dash adapts [ishaanSh06/PolyDash](https://github.com/ishaanSh06/PolyDash) at [`8013c933980c1f31eb0aa95d101993c525d0e09f`](https://github.com/ishaanSh06/PolyDash/tree/8013c933980c1f31eb0aa95d101993c525d0e09f), under [BSD 3-Clause](vendor/polydash/LICENSE); the vendored source is in `vendor/polydash/` and was modified for this game.

```sh
npm install
npm start
```

Run `npm test` to execute the Node test suite.

The full-screen shell uses an original, reference-led checkerboard and angled-strip arcade composition. Its scene art uses original pixel sprites and animated SVG scenery. See [CITE.md](CITE.md) for artwork and reference credits. It scales a 1280×720 cabinet canvas to the available display, including 1080p.

For keyboard testing, run `npm run dev`. Use arrows/WASD for XY movement or selector navigation, Space for A/fire/jump/confirm, X for the equipped Cell Defender ability, P to pause, Escape to go back, and M to mute. Keyboard input is disabled in normal cabinet mode. Controller slot 0 is the only accepted pad: A (0) acts, B (1) exits, X (2) is special, Y (3) mutes, and Start (9) pauses.

Legacy best-score display uses the `hosa.arcade.v4` storage namespace, with separate `cellDefender.builds.*` keys. Named competition records use the local file described below; old anonymous best scores are not converted into named entries.

### Animation preview

Development keyboard controls preview the same menu motion as the controller. `npm run dev` respects the system Reduce Motion setting. To explicitly preview full arcade motion while testing, use `npm run dev-motion`; this override is development-only. Production always respects the system preference.

Choose A for five safe, self-paced practice exercises or X to play. Practice waits for success and a fresh A press. Start opens practice options: A resumes, X skips to the scored countdown, and B returns to selection. Each scored start and retry includes a countdown, and GAME OVER leads to a score breakdown.

### Game engine

Both games now render with Phaser 4.2.1 through a shared runtime. The cabinet owns controller input and fixed simulation timing; Phaser owns scene objects, textures, and visual effects. Lab artwork includes a local CC0 Kenney industrial atlas. No network connection is needed to play.

Run `npm run test:engine` for the native Electron scene/lifecycle check, or `npm run test:engine -- --disable-gpu` for the software-rendering check. See [engine research and migration notes](docs/ENGINE-RESEARCH.md) for the tradeoffs and remaining content-editor work.

### Cell playtest tools

Cell encounters grow steadily through wave 20 and then escalate sharply. Ordinary cells gain their own gradual health curve from wave 4 onward, and their opening attack readiness shortens toward wave 20. Once a regular projectile warning is visible, killing that one cell no longer erases the promised attack; clearing the complete active group still clears its warnings. Minibosses arrive on multiples of five and move from recon into frenzy. Multiples of ten use major bosses with assault (100–65%), mutation (65–35%), rage (35–10%), then a shielded patience sequence at 10% that ends in an automatic collapse and normal reward break. Patience is 10 seconds at wave 10, 12 seconds at wave 20, and 16 seconds at wave 30+: wave 10 weaves, wave 20 rotates, and wave 30+ uses seven seconds of weave, one safe second, then eight seconds of rotation. Each mode uses telegraphed patterns without immediate repeats. Bosses move between varied destinations during vulnerable phases, while rotation patience moves along a bounded upper-arena ellipse with each warning origin locked when reserved. Rendering interpolates fixed simulation steps.

Run `npm run profile:cell` to measure native frame pacing. The default bounded trace covers waves 10, 20, 30, and 50, including the major-boss phase transitions. `HOSA_PROFILE_SECONDS` caps total wall time (default 120 seconds); `HOSA_PROFILE_WAVES=10,20,30,50 HOSA_PROFILE_SECONDS=120 npm run profile:cell -- --out /tmp/cell-profile.json` writes the full report. Setup uses the unscored developer sandbox and is excluded from timing samples, so this measures frame pacing rather than player skill. See [balance research](docs/CELL-BALANCE-RESEARCH.md).

Run `npm run test:polish` to drive all five practice exercises in native Electron using movement and pulse inputs, verify the clean countdown, and capture 720p/1080p screenshots in the temporary `hosa-polish` directory. `npm run dev-motion` enables the full animation preview with development-only keyboard controls.

### Weapon builds

Clear wave 3 to choose Spread, Lance, or Seeker. Every five waves brings a paused reward break. Wave 10 evolves a tier-one weapon; tier-two weapons advance to one of two tier-three branches on wave 20 or later multiples of ten. Those evolution cards also offer **Keep Current**, which adds damage and lets the same branch return on a later eligible wave. Drafts have three cards, one free reroll, and a skip option. Use left/right to browse, A to choose, X to reroll, and B to skip a draft. Damage keeps your build; a new run resets it. Healthy cells have been removed.

| Tier-two weapon | Tier-three choices | Tradeoff |
| --- | --- | --- |
| Fan | Tempest / Trident | Seven lanes / three piercing prongs |
| Barrage | Vulcan / Helix | Staggered five-shot burst / wide corkscrewing fire |
| Rail | Needle / Siege | Rapid piercing fire / slow splash impacts |
| Chain | Arcstorm / Tesla | Four-target propagation / paired short arcs |
| Swarm | Hive / Hunter | Five slow seekers / fast heavy homing rocket |
| Drones | Escort / Sentinel | Four staggered orbit guns / two fixed piercing outriggers |

Run `npm run test:builds` for native keyboard checks of choices, rerolls, pause/resume, skipping, evolutions, and frozen combat during previews. Run `node scripts/verify-content-native.cjs` for native Electron evidence of the F2 loadout form, scored wave-20 advanced cards and release countdown, representative rendered geometry, reduced-motion Siege impacts, and four bounded five-second RAF stress cases. Its performance figures are development-machine bounded cases, not a whole-session 120-second profile. See the [restore point](#restore-point) before replacing project files.

`npm run compare:weapons` probes each gun against a stationary boss-sized target, a wide row, and a column. These isolate aim/coverage tradeoffs; they do not measure human difficulty. Add `HOSA_PROFILE_WEAPON=swarm` (or another gun ID) to the frame profiler to exercise a late build with capped Overclock.

### Fresh-launch regression check

`npm run test:startup` boots a fresh Electron process and uses keyboard events through the normal game loop: selection, five tutorial lessons, card pause/dismissal, naturally cleared opening waves, scored choice, game over/results, and clean replay. It does not call internal lifecycle methods or modify gameplay state. `-- --gamepad` uses a simulated slot-zero controller in production mode and checks reconnect plus keyboard isolation; `-- --disable-gpu --reduced-motion` covers software rendering and reduced motion. Physical controller hardware still needs cabinet testing.

`test:builds` and `test:polish` remain assisted checks with internal combat setup; they do not substitute for `test:startup`. Run `npm run compare:bosses` for a deterministic boss pacing probe with a refreshed shield (survival excluded). Recorded results are in `docs/boss-pacing.json`; Spread/Fan trade boss damage at long range for screen coverage.

### Development sandbox

Start with `npm run dev` (or `npm run dev-motion`), begin a run, then press **F2** to pause and edit it. Choose a weapon or specialization, equipped ability, perk ranks, invincibility, or a wave to test. Major-boss waves also permit direct phase and pattern-family setup for visual and rule verification; a requested phase must match a major-boss encounter. You can apply only the build, or restart/jump to an encounter. Waves divisible by five have minibosses; multiples of ten have major bosses.

Opening and cancelling leaves the run unchanged. **Applying any sandbox change permanently makes that run unscored**, with an on-screen badge; turning invincibility off does not restore eligibility. Start a fresh run to return to normal scoring. Sandbox runs advance without upgrade-choice interruptions. Existing projectiles remain when changing only the build; restarting/jumping to a wave clears the encounter. The panel and shortcut are unavailable in production (`npm start`).

### Named competition scores

After GAME OVER, each scored player enters a **name or identifier (up to 16 characters)** on an on-screen keyboard. Move with the joystick/D-pad, press **A** to select a letter, **B** to delete, and select **DONE** to save. Results show the leading runs and the player's rank. Every saved run is retained, including repeated attempts under the same name.

The game writes a readable JSON file automatically:

- Production: `~/Documents/Cell Defender Scores/leaderboard.json`
- Development: `~/Documents/Cell Defender Scores/leaderboard-dev.json`

Each record contains the name, score, wave, timestamp, unique run ID, and build when available. For prize matching, ask players to use an identifier you can recognize; the game does not verify identity. Keep a copy of the production file after the event. Only run one cabinet app against a given file at a time. To choose another location, set `HOSA_LEADERBOARD_PATH` to the desired file path before launch.

Writes use a temporary file and atomic replacement. A failed save stays on name entry with a retry option; retries do not duplicate a run. A damaged existing file is reported and preserved rather than silently replaced. Sandbox and tutorial runs never enter the named leaderboard.

`npm run test:sandbox` checks the development panel, live build edits, wave jumps, and exclusion from score files in native Electron. `npm run test:startup -- --gamepad` checks the full cabinet flow through controller name entry and a saved score in an isolated temporary file.

### Restore point

The pre-redesign snapshot is at `/Users/aa/Documents/coding/robotics/frc/10/hosa-backup-20260913-185711`. With the game closed and any later work saved elsewhere, run `python3 "/Users/aa/Documents/coding/robotics/frc/10/hosa-backup-20260913-185711/restore.py"` to restore its manifest-listed files. Its `new-files.json` lists redesign additions that the restore script removes.


### Weapon identity and encounter expansion

All twelve advanced weapons now have separate projectile silhouettes, recorded flight trails, firing speeds, and launch rhythms. Trident fires from three parallel muzzles; Siege launches a slow impact shell; Hive sends staggered seekers; Hunter sends a fast rocket. Escort orbits the player while Sentinel holds fixed outriggers. Arcstorm chains outward between unique targets.

Skirmishers enter from wave 6, armored Bulwarks from wave 12, and moving Orbiters from wave 18. They replace existing formation slots, so these additions do not independently increase enemy counts. Bosses gain Lattice Sweep, Petal Burst, and Anchor Cross patterns with declared warning paths and existing projectile limits. Use the development F2 panel to compare guns and boss patterns directly.

The snapshot immediately before this identity pass is at `/Users/aa/Documents/coding/robotics/frc/10/hosa-identity-backup-20260913-210949`; its `restore.py` restores that snapshot and removes only additions recorded in its manifest.
