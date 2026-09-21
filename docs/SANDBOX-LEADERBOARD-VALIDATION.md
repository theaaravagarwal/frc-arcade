# Sandbox, named scores, and motion validation

Validated September 13, 2026 on the development Mac, branch `hosa`.

- Native `test:sandbox`: normal boot and F2 input, frozen simulation while editing, cancellation preserves scoring eligibility, Rail/Overdrive with Power 4 at major-boss wave 10, invincibility toggle, permanent unscored status, no sandbox score file, fresh scored replay and development-keyboard name save. Death setup is assisted by hostile-projectile injection; this is not a human balance evaluation.
- Native `test:startup -- --gamepad`: fresh production boot, keyboard/F2 isolation, five tutorial lessons, paused upgrade/reconnect and held-confirm gates, natural opening waves, scored weapon choice, natural game over, controller name entry, durable save, leaderboard and clean replay. The test uses a simulated slot-zero gamepad, not physical hardware. Ten pre-existing temporary score records verify top-ten display and rank 11. No competition files are touched.
- Native `verify-score-layout.cjs`: 720p/1080p name keyboard, maximum-length input, top ten plus own rank, long-name column containment. Assisted presentation setup; complete control/save verification is separate above. Long leaderboard names visually truncate when needed; the complete name remains in the record and DOM.
- Node suites cover model configuration validation, effective perk damage, production/tutorial gating, pending-reward dismissal, save failure/retry, duplicate-run prevention, corruption preservation and concurrent store handles.
- Motion checks cover persistent reward cards/artwork during rapid navigation, paused simulation, immediate confirmation cleanup, and pause/resume. New name-key selection retains its DOM and only changes feedback state.

## Frame pacing

`HOSA_PROFILE_WAVES=5,10,25 HOSA_PROFILE_SECONDS=5 HOSA_PROFILE_WEAPON=swarm npm run profile:cell`

Each encounter supplied 302 measured frames. Median frame gaps were 16.7 ms; p95 gaps were 17.4–17.6 ms and the largest gap was 17.9 ms. Maximum host tick was 3.3 ms. Setup was excluded; these short samples cover opening boss attacks, not every late-boss phase or physical cabinet performance.

After adding regular-wave durability, an additional four-second native sample covered waves 6, 14, 19, and 24 with a Swarm test build. Median frame gaps remained 16.7 ms; p95 was at most 17.7 ms and the largest gap was 17.8 ms. Maximum host tick was 1.5 ms. Peak live hostile bullets rose from 6 at wave 6 to 10 at waves 19 and 24. This establishes bounded runtime behavior under the sampled setup; it does not establish human difficulty.

## Design detector

The only advisory was the existing weapon-choice blueprint grid. A file-scoped `codex-grid-background` exception in `.impeccable/config.json` retains that established visual treatment. New sandbox and name-entry surfaces use flat backgrounds. No typography or interaction finding was waived.
