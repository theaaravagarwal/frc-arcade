# Weapon builds validation — 2026-09-13

Implemented on `hosa`. Cell Defender remains the only visible game; Lab Dash source and records remain retained.

## Behavior checked

- Three core guns, six evolutions, recurring three-card drafts, one reroll, fixed-choice exit handling, and countdown return.
- Damage retains the build; a fresh scored run resets it. Practice choices do not enter the score table.
- Reward breaks freeze model state, including temporary ability and pickup timers.
- Explicit damage, unique-target piercing, two firing drones, two chain neighbors, bounded nonrecursive Burst Core, capped fire-rate perks, and useful offers after caps.
- Charge Coil adds the advertised charge per qualifying kill. Active abilities reject a second activation and do not recharge themselves.
- Native Electron exercises development keyboard choices and verifies the combat canvas becomes visible after rewards. Unit checks cover controller isolation and release gating.
- 720p/1080p card screenshots inspected; drone/barrier/charge and chain-hit combat screenshots inspected. The five practice lessons complete through the native harness.

`npm test`: 84 passing. Native reward and tutorial checks pass. Engine lifecycle checks pass normally and with `--disable-gpu`.

## Weapon comparisons

Run `npm run compare:weapons`; recorded output is in `weapon-comparison.json`. Ten-second probes use stationary targets with enough health to isolate geometry: a boss-sized target, seven targets across the screen, and a three-target column. No passive perks are applied. Travel time is included.

Fan hits five separate targets; Rail benefits strongly from aligned targets; Chain damages nearby targets; Seeker and Swarm track targets. Spread/Fan have a substantial distant-single-target penalty: move closer to overlap shots. The numbers are the approved initial tuning, not proof that every path has equal human difficulty. The next playtest should compare boss time-to-kill and survival for these paths.

## Frame pacing

`weapon-build-profile.json` records native, visible-canvas traces for Fan, Swarm, Chain, and Drones at late waves with full motion and capped Overclock. Each sample lasts four seconds; wave setup is assisted and excluded. These are development-computer samples, not cabinet measurements or worst-case hardware guarantees.

No external assets were added for the weapon cards; diagrams are original CSS/SVG. Research references are recorded in `CITE.md`.

## Follow-up: startup and boss cadence

The earlier assisted native checks missed tutorial card dismissal: they asserted model state without requiring the reward DOM to disappear. The tutorial transition now removes the blocking view before resuming. Upgrade pause/reconnect leaves the model paused. `test:startup` uses a fresh process, normal RAF, actual development key events or simulated production slot-zero controller input; it does not change gameplay state or call internal lifecycle methods. Its full scenario covers tutorial, natural opening waves, rewards, game-over/results, and replay.

The five-wave boss cadence keeps the wave-3 core choice. Health is 190/250/335 for miniboss waves 5/15/25 and 360/500/715 for major waves 10/20/30. `boss-pacing.json` records assisted moving-boss probes: close-range core builds take roughly 20–25 seconds at wave 5 and 34–40 seconds at wave 10. These probes remove survival as a variable. Fan remains slower against a single boss, especially from the bottom of the arena; this is an outstanding weapon tradeoff to assess in the next human playtest, not evidence that all builds meet the brisk-fight target.
