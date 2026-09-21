# HOSA Arcade

The cabinet selector exposes Cell Defender only. Lab Dash source and tests remain available in the repository, but the game is hidden in both production and development. Controller 1 is always the browser's gamepad slot 0. Use the stick or D-pad to select a game, A to learn or act, X to play from selection or use the equipped ability during gameplay, Start to pause, B to open the exit confirmation, and Y to mute shared sound. Controller slot 1 is ignored.

Cell Defender uses both stick axes to move, auto-fires, and maps X (button 2) to its equipped ability. Holding A is its focus mode. Lab Dash maps A to jump/hold flight and has three shared attempts across repeating three-stage circuits; a retry starts the current stage and attempts never refill. Results show Cell score and wave, or Lab progress, pickups, completion/retry bonuses, attempts remaining, and a Research Breakthrough for each circuit cleared. Score records use `hosa.arcade.v4`; the weapon-build mode uses separate `cellDefender.builds.*` keys, preserving earlier encounter scores. Lab records remain compatible.

Cell Defender was adapted from [dwmkerr/spaceinvaders](https://github.com/dwmkerr/spaceinvaders) at commit [`07fee2a3a54e925764637ce68c559c617b4289e3`](https://github.com/dwmkerr/spaceinvaders/tree/07fee2a3a54e925764637ce68c559c617b4289e3), licensed under [MIT](vendor/spaceinvaders/LICENSE). Its vendored source and license are in `vendor/spaceinvaders/`; the game source was substantially modified for the HOSA controller-first Cell Defender objective.

Lab Dash was adapted from [ishaanSh06/PolyDash](https://github.com/ishaanSh06/PolyDash) at commit [`8013c933980c1f31eb0aa95d101993c525d0e09f`](https://github.com/ishaanSh06/PolyDash/tree/8013c933980c1f31eb0aa95d101993c525d0e09f), licensed under [BSD 3-Clause](vendor/polydash/LICENSE). Its vendored source and license are in `vendor/polydash/`; the game source was substantially modified for the HOSA Lab Dash objective.

Run `npm start` for the cabinet and `npm test` for automated checks. A physical cabinet check should still cover slot-0 controller reconnect, pause/exit confirmation, and display sizing.

`npm run dev` enables the visible **DEV MODE · KEYBOARD TESTING** label with or without a connected controller: arrows/WASD move or select, Space acts, X uses special, P pauses, Escape goes back, and M mutes. The normal cabinet command (`npm start`) accepts controller input only.

Lab Dash repeats three original stages with baseline durations of 35, 40, and 45 seconds: cube, cube/ship, then cube/ship/wave. Each cleared circuit banks its score and starts the next circuit after a release-gated countdown. Circuit speed is `1 + 0.15 × (1 − exp(−(circuit − 1)/4))`, approaching a 15% speed increase. All physics advance together, preserving the authored jump geometry. There is no fixed final circuit.

Each circuit scores `floor(3000 × completion + pickupPoints × (1 + 2 × completion))`, plus 3,000 for clearing the circuit and 500 for each unused retry. Completion is weighted equally across that circuit's stages. Ribbons are worth 25 base points and research items 100; each item scores once per circuit, including across retries. Banked score survives later deaths; the current circuit adds its best progress and unique pickups.

Cell Defender starts each run with three lives, the starter gun, and one Pulse charge. Core guns are chosen after wave 3; random reward drafts appear every five waves, with fixed weapon specializations at wave 10. Each specialization has two further weapon children available at wave 20 and later ten-wave boundaries while it remains eligible. Builds survive damage and reset after the run. X equips one of Pulse, Barrier, or Overdrive. Ordinary qualifying kills recharge the shared ability meter, up to two charges. Healthy cells and their score penalty have been removed.

The authored boss projectile contract uses `kind` values `standard`, `heavy`, and `needle` with the emitted `r` radius and final `vx`/`vy` vector. Heavy shots are sparse, wide, and slower; needle shots are sparse, narrow, and faster within the 260 speed cap. The Phaser view reads these fields from model snapshots and warnings.


Cell encounter size grows linearly through wave 20, then exponentially toward explicit safety limits. Early waves contain two groups of three cells; late ordinary waves can contain six sequential groups of sixteen. Regular-cell health begins a separate gradual climb at wave 4, and the first firing tell becomes ready sooner as a circuit advances. A visible regular projectile tell is committed even if its source is destroyed, while a complete group clear still removes the remaining warnings and bullets. Minibosses arrive on waves divisible by five and progress from recon to frenzy. Major bosses on waves divisible by ten use assault from 100–65% health, mutation from 65–35%, rage from 35–10%, then a shielded patience sequence at 10% that ends in an automatic collapse and normal reward break. Patience lasts 10 seconds at wave 10, 12 at wave 20, and 16 at wave 30+: weave at wave 10; rotation at wave 20; and seven seconds weave, one safe second, then eight seconds rotation at wave 30+. Active hostile bullets are capped. Each mode has its own telegraphed attack family; attack bags avoid immediate repeats, vulnerable modes use varied speed-limited destinations, rotation patience follows a bounded upper-arena ellipse, and warnings retain fixed origins. The F2 development sandbox can directly select a compatible major-boss phase or pattern family; every sandbox application is unscored. See [balance research](docs/CELL-BALANCE-RESEARCH.md) for exact settings and profiling limitations.

Choose **A Learn** for five safe, self-paced practice exercises or **X Play** to go straight to a scored run. Practice never saves scores or consumes attempts. Starts, retries, stage changes, and pause resumes use a release-gated 3–2–1–GO countdown. A 1.5-second GAME OVER beat leads to the results screen; A returns to selection. Controller disconnect freezes the session.

Art and reference credits are in [CITE.md](CITE.md). Gameplay uses original pixel sprites, with Kenney CC0 button prompts.

Verification includes production collision replays, a twenty-circuit replay with time-scaled steps (geometry and score accounting), real 60 Hz controller clears of Dash circuits 20 and 100 near the speed cap, an accelerated 100-wave Cell stress test with explicit test-hook clears, pickup/charge limits, reduced-motion equivalence, and controller/dev-keyboard isolation. Native Electron checks cover the selector trajectory, circuit continuation, HUD readability, and final score reconciliation. These establish mechanical consistency; a cabinet playtest is still the check for human difficulty and feel. The games take inspiration from Geometry Dash and Sky Force Reloaded, rather than claiming their complete feature sets or production polish.

### Practice and art

Cell practice teaches movement and auto-fire, warning dodges, weapon selection, pickups, and pulse one at a time. Exercises wait for success and a fresh A press; there is no timed automatic advance. Start opens practice options (A resume, X skip to the scored countdown, B menu). Practice mistakes only restart the exercise and never affect scores or lives.

Cell art uses a shared detailed pixel atlas across the selector and Phaser view, with local pixel typography, charge/release frames, and bounded destruction effects. The presentation remains separate from combat rules; weapon damage and progression are defined by the model. Source credits are in CITE.md.

### Weapon reward breaks

After wave 3, choose Spread, Lance, or Seeker. At wave 10 choose one of two specializations or keep the current gun with a damage perk. Deferred specialization returns at later ten-wave milestones. Other five-wave milestones offer three compatible cards with one free reroll; ten-wave drafts include a stronger Breakthrough damage card.

Move left/right to select, press A to accept, X to reroll a random draft, or B to skip a random draft and keep your current build. Fixed choices use their explicit keep-current option where available. Start pauses without changing the offers. Combat and temporary effects freeze during reward breaks, and the next wave begins through the normal countdown. Practice uses a safe version of weapon selection and resets all choices before the scored run.

Passive perks accumulate, with capped perks removed from the offer pool. Main guns and X abilities replace their respective slot. Damage perks remain repeatable so late rewards continue improving the build. After wave 20, health scales with wave number in addition to existing capped encounter pressure; it does not react to the player's selected equipment.


The weapon identity pass gives all twelve advanced builds distinct shot bodies, recorded trails, firing speeds, and launch patterns. Skirmisher, Bulwark, and Orbiter enemies enter at waves 6, 12, and 18 by replacing existing formation slots. Lattice Sweep, Petal Burst, and Anchor Cross expand the boss combo pool. See `docs/WEAPON-IDENTITY-VALIDATION.md` for behavior and verification scope.
