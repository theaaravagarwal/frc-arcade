# Cell Defender attack variety, progression, and frame pacing

## Scope and playtest findings

The cabinet selector now offers Cell Defender only, in both production and development. Lab Dash remains in the repository for future use and independent tests. The selector retains its arcade artwork and the A Learn / X Play entry choices.

The relevant playtest feedback distinguishes two problems: a brief whole-game freeze near a miniboss attack, and bosses that repeatedly use the same attack and movement destinations. The difficulty target is manageable growth through wave 20 followed by a sharper climb. These are separate requirements: adding bullets cannot repair frame pacing, and raising health cannot by itself create varied decisions.

The physical cabinet test is expected in about 48 hours. This pass therefore keeps the current Phaser runtime, deterministic gameplay rules, controller policy, and existing game-over flow. It concentrates changes in the Cell model and presentation rather than expanding into another engine migration or level editor.

## Evidence and limits

A native Electron probe sampled real display frames in wave 1, the wave 3 miniboss, and the wave 10 major boss. Before this pass's presentation optimizations, one recorded run measured frame-gap medians around 16.7 ms and maxima below 18 ms in all three cases. Host update/render work peaked at 1.3 ms. These short development-machine samples did not reproduce the reported freeze, and cannot establish that a longer run or the physical cabinet will be stall-free.

A separate deterministic defect was visible in the source. Boss movement was skipped while an attack warning was pending, then resumed from a sine function of global time. The first frame after the warning could therefore move the boss directly to where it would have been without the pause. That explains a boss-position jump, but not a whole-game freeze.

The presentation also contained avoidable work specifically during boss fights: the center HUD text was set to a short wave label and immediately replaced with the longer boss label on every rendered frame. Phaser text uses a canvas-backed texture, so repeatedly changing the text is a poor hot-path choice. The correction computes the final label once. Phaser's own documentation distinguishes normal Text from BitmapText and discusses text rendering cost; switching the entire HUD font system is not necessary to remove this particular churn. [1]

## Timing and movement design

The simulation advances at a fixed rate while the display may refresh at a different rate. Showing the last simulation position without interpolation can produce uneven visual movement even when CPU time is low. Glenn Fiedler's fixed-timestep explanation specifically describes the mismatch between a 50 Hz simulation and a 60 Hz display and presents interpolation of adjacent simulation states as a solution. [2]

The implementation stores previous position scalars and interpolates presentation positions using the host accumulator fraction. It does not interpolate score, hit detection, warning targets, or other authoritative state. New objects start at their actual spawn position. A boss holding a warned attack remains aligned with its warning origin. This introduces at most one simulation step of visual interpolation delay while preserving deterministic rules.

Bosses move toward different bounded destinations at a limited speed between attacks. Rotation patience instead follows a bounded upper-arena ellipse at a capped speed. Their paths do not jump to a global-time position after an attack. The attack reservation freezes the firing origin and trajectory; its displayed warning and eventual projectiles use the same geometry. Movement variety is introduced by changing destination order and attack order, not by making bullets secretly track the player after a warning.

## Boss variety and difficulty

Michael Molinari's shmup boss design essay treats difficulty, variety, battle length, payoff, and character as distinct concerns. It explicitly describes cycling several attacks within a health section and argues that merely moving between equivalent safe spots does not necessarily change strategy. This is practitioner guidance, not a controlled experiment or a universal formula. It directly supports changing the current repeated-pattern behavior rather than only increasing HP. [3]

Minibosses start in recon with crossing streams and delayed blooms, then enter frenzy with orbit gaps and sweep pursuit. Major bosses are damageable through assault (100–65% health), mutation (65–35%), and rage (35–10%). Reaching 10% starts the shielded patience test; surviving it automatically collapses the boss and enters the usual reward flow. Wave 10 has ten seconds of weave, wave 20 has twelve seconds of rotation, and wave 30+ has sixteen seconds comprising seven seconds of weave, one declared safe second, and eight seconds of rotation. Rotation adds a sparse warned, locked pursuit bolt so a stationary position is not a solution. The normal phases draw from declarative families such as crossing streams, orbit gaps, delayed blooms, and sweep pursuit, including combinations and multiple emitters. Each pool uses an attack bag that prevents immediate repetition and exposes its vocabulary before another cycle. Phase and sequence parameters vary angle or gap placement while preserving each pattern's readable identity.

These patterns call for different responses. Aimed spreads reward baiting the target lock and moving afterward. Crossfire asks the player to assess intersecting paths. A curtain emphasizes choosing the announced opening. A ring changes the direction of approach. The design objective is a sequence of recognizable decisions; randomizing velocity every frame would create uncertainty without meaningful counterplay.

Major bosses receive greater pressure and shorter recovery than minibosses, together with moderate health increases. Their shielded patience test disables auto-fire and X, including an already active ability, without spending a charge. Every pattern reserves its complete projectile count before its warning starts. If capacity is unavailable, it waits; it does not warn one pattern and silently emit a different subset. Phase transitions retain recovery and bullet clearing so the new pattern begins from a legible state.

Attack names appear during boss warnings, alongside the actual dashed trajectories. The name helps a returning player recognize the pattern, but the geometry remains sufficient to act on. Decorative flashes, screen shake, and haze must not obscure the player or be required to understand the attack. Reduced motion keeps the essential warning information.

## Progression after wave 20

The first regime increases encounter size in small steps. The later regime adds an exponential term after wave 20, affecting encounter size and the number of sequential groups, together with higher projectile pressure. The threshold matches the chosen playtest direction rather than a claimed industry-wide optimum.

Physical entity counts remain bounded. Unbounded exponential allocation would eventually turn challenge into a performance failure, regardless of engine. Sequential groups let a later room demand more survival without requiring every enemy to exist on screen at once. Warning duration also retains a floor; harder attacks should not become invisible attacks.

At sufficiently late waves, the numerical limits are reached. The game can continue indefinitely, but it does not allocate exponentially increasing memory forever. The practical aim is an extreme survival ceiling after a long manageable opening. Whether the chosen ceiling feels nearly impossible needs playtesting; formulas alone do not measure human difficulty.

Healthy cells are no longer part of the combat model. Power-up and pulse limits remain part of the same run economy. Boss difficulty should be evaluated with ordinary weapons and earned charges, rather than benchmarked using unlimited injected pulses. Test hooks are useful for reaching a wave quickly, but setup assistance must be excluded from claims about ordinary survival.

Ordinary encounter settings are summarized below. Major/miniboss waves replace these groups with an isolated boss; wave 20 is included to show the curve boundary, not an extra ordinary encounter.

| Wave | Enemies per group | Sequential groups | Active bullet ceiling | Regular emissions per 3 seconds |
|---|---:|---:|---:|---:|
| 1 | 3 | 2 | 24 | 12 |
| 5 | 4 | 2 | 29 | 15 |
| 13 | 6 | 3 | 39 | 23 |
| 20 | 7 | 3 | 48 | 30 |
| 25 | 8 | 3 | 57 | 34 |
| 30 | 11 | 4 | 71 | 41 |
| 35 | 15 | 5 | 93 | 52 |
| 40+ | 16 | 6 | 112 | 70 |

Regular-cell durability is separate from boss health. Wave 1 retains the original values, then regular health rises gradually from wave 4 through wave 19 and continues with the existing post-wave-20 health multiplier.

| Wave | Drifter HP | Aimed HP | Tank HP | Diver HP |
|---:|---:|---:|---:|---:|
| 1 | 1 | 2 | 4 | 2 |
| 6 | 2 | 4 | 8 | 4 |
| 9 | 3 | 6 | 11 | 6 |
| 14 | 4 | 9 | 17 | 9 |
| 19 | 6 | 12 | 23 | 12 |
| 25 | 7 | 14 | 28 | 14 |

From wave 4 onward, a regular projectile attack remains committed after its visible warning begins even if that individual source dies. The frozen warning still displays its origin and path and fires once at the promised time. Clearing the entire active group or encounter cancels outstanding warnings, and diver movement tells still cancel when the diver dies.

## Rendering and allocation controls

Phaser Groups provide a built-in mechanism for holding and reusing objects. The engine's group APIs support finding inactive objects and managing a bounded collection; the project does not need another pooling library. [4]

The Cell view prepares its common enemy and projectile display objects during session setup, before the countdown finishes. Repeated attacks then reuse them. This reduces first-use display allocation during an attack; it is not a claim that allocation was proven to cause the original freeze. The common warning geometry is cached by reservation ID and rebuilt only when reservations change. Damage and pulse feedback remain dynamic.

The runtime remains host-driven, with a single owner for updates. Profiling should include both simulation and rendering work, plus actual frame gaps. A short JavaScript tick with a long frame gap can indicate scheduling or presentation delays outside the game logic; looking only at the model's execution time would miss that distinction.

## Updated native measurements

Historical short samples are retained for context, but they do not represent the current four-phase encounter. The current native profiler has a bounded 120-second budget and covers waves 10, 20, 30, and 50, recording phase transitions. The separate native boss check verifies the model’s actual reduced-motion state. Setup is assisted through the unscored developer sandbox and excluded from measured RAF rows. These measurements characterize this development machine; they do not prove a cabinet will be free of stalls or establish human difficulty.

| Encounter | Frame gap p95 / max | Host work p95 / max | Peak active bullets |
|---|---:|---:|---:|
| Wave 10 major boss | 17.7 / 18.2 ms | 2.4 / 5.9 ms | 34 |
| Wave 20 major boss | 17.7 / 18.1 ms | 2.1 / 3.7 ms | 35 |
| Wave 30 major boss | 17.7 / 18.2 ms | 2.1 / 4.1 ms | 32 |
| Wave 50 major boss | 17.7 / 17.9 ms | 0.7 / 1.3 ms | 30 |

Each current sample recorded assault, mutation, rage, patience, and collapse over about 1,800 RAF frames. The regular-wave samples did not reach the configured projectile ceiling. Separate automated tests cover the scheduler limits; a timing table must not be read as a benchmark at that ceiling.

## Verification and next cabinet playtest

Automated checks establish the 100–65/65–35/35–10/patience progression, hazard creation by the declarative families, temporary ability lock without charge spend, phase-matched sandbox setup, reward progression after victory, and end/replay cleanup. They also assert native reduced-motion state instead of assuming an emulated media setting changed the model. Interpolation tests verify both midpoint positions and unchanged simulation snapshots.

The native boss test captures every major-boss phase, an active delayed-bloom hazard, rotation patience, and a reduced-motion state. It also verifies normal reward progression and a replay after victory. The bounded profile covers the revised major bosses at waves 10, 20, 30, and 50. Report observed frame-gap and host-work distributions rather than announcing that a freeze is fixed merely because tests pass.

For the physical test, record the wave, attack label, approximate duration of any freeze, and whether input resumes at the old position or after a jump. For balance feedback, record which attacks force a different dodge, whether one safe location still works repeatedly, and whether a major boss becomes challenging before it becomes tedious. These observations give actionable tuning targets without requiring a full gameplay video.

## Sources

1. Phaser, [Text](https://docs.phaser.io/phaser/concepts/gameobjects/text), live documentation checked September 12, 2026; local Phaser 4.2.1 source and Cell HUD code inspected separately.
2. Glenn Fiedler, [Fix Your Timestep!](https://gafferongames.com/post/fix_your_timestep/), June 10, 2004. The timing principle is longstanding; the article is not a current benchmark of this application.
3. Michael Molinari, [Video Game Boss Design For Shmups](https://www.gamedeveloper.com/design/video-game-boss-design-for-shmups), June 19, 2010, practitioner essay.
4. Phaser, [Group](https://docs.phaser.io/phaser/concepts/gameobjects/group), live documentation checked September 12, 2026.
5. DECA Games, [Update 2.0.2 – The Shatters](https://remaster.realmofthemadgod.com/?p=2156), August 26, 2021. Read for stance-driven mobile boss patterns and simultaneous projectile threats; it is a reference only.
6. DECA Games, [Public Testing: O3 Changes](https://remaster.realmofthemadgod.com/?p=3675), April 6, 2023. Read for complete combo chains and damage-threshold invulnerability; it is a reference only. RealmEye was not inspected.

Local evidence: `scripts/profile-cell.cjs`, `tests/cellDefender.test.js`, `tests/presentation.test.js`, and `scripts/verify-engine.cjs`. Recommendations and numeric progression choices are project-specific design judgments; native timings are measurements of the development environment.
