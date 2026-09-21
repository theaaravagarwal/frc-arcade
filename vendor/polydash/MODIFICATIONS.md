# Lab Dash modifications

Upstream: `ishaanSh06/PolyDash` at commit
`8013c933980c1f31eb0aa95d101993c525d0e09f`.

The repository's five upstream files are vendored in this directory.
Both `impossible-game.js` and the preservation copy `upstream.original.js` are
byte-for-byte copies of the pinned source; their SHA-256 values are recorded in
`UPSTREAM.sha256`. `source-core.js` is the shipping
source-derived module. It retains the original geometry, SAT collision, hero
movement, grid, and complete level-one builder, while removing browser drawing,
DOM input, timers, audio, save-position code, and restart flow. Its only added
state is the simulation-step setter and CommonJS export. The game classes and
course construction remain upstream code. The original browser game is never
loaded by Lab Dash.

`renderer/games/labDash/index.js` supplies a new host adapter, procedural
laboratory renderer, and three original deterministic courses. It replaces the
upstream level builder, DOM events, wall-clock timing, animation frames, remote
assets, checkpoint state, and restart flow. The arcade host supplies fixed
simulation steps, input, audio hooks, pause/resume calls, and session lifecycle.

The adapter reuses the pinned `point`, `polygon`, `square`, and convex SAT
implementation for player and obstacle collision. Cube gravity, top landing,
ship thrust, wave movement, mode portals, course data, collectibles, scoring,
and the three-attempt gauntlet lifecycle are new. The 35-second cube course,
40-second cube/ship course, and 45-second cube/ship/wave course are authored
data; no random chunks or upstream level-one geometry are used.

Ribbon and research IDs are deterministic and session-scoped. Their collected
IDs and score persist across stage retries so a sample cannot be farmed.

No upstream remote art, font, or music asset is loaded by Lab Dash.
