# Engine and asset reuse for HOSA Arcade

## Recommendation

Adopt **Phaser 4.2.1** as the shared game engine, beginning with Cell Defender's rendering, assets, sprite animation, and reusable display objects. Keep the existing Electron cabinet shell and its controller policy. Preserve Lab Dash's tested movement and collision rules while moving its presentation into Phaser next. Use existing asset packs and a standard level editor to reduce the amount of artwork and content tooling that must be maintained locally.

This is a staged migration, not a claim that installing an engine automatically improves difficulty or artwork. Phaser supplies the machinery for scenes, textures, animation, and physics; enemy telegraph timing, encounter design, and scoring remain game-specific decisions. The adoption should remove existing rendering and effects code as each scene is replaced, rather than add another engine around a full-frame image of the old canvas.

Phaser's official release index and the npm registry both identify 4.2.1 as the current release checked on September 12, 2026. The release index dates it July 9, 2026. Phaser 3.90.0 is the final listed v3 release, not the latest overall release. Pin the tested version rather than installing an unbounded latest version. [1]

## Current implementation and constraints

The repository is an Electron/CommonJS application with no frontend framework or bundler. The working branch is `hosa`. Its two game modules contain about 2,200 lines combined, including simulation, drawing, tutorials, effects, and lifecycle handling. These counts are observations of the current working tree, not a general measure of code quality.

`renderer.js` polls and normalizes input, controls the menu and score storage, and advances each game in fixed 20 ms simulation steps. Game factories expose `startSession`, `step`, `render`, `pause`, `resume`, `dispose`, and `getSnapshot`. Tests exercise this contract without a browser. The host also owns countdowns, disconnect handling, game-over presentation, and the development-only keyboard gate.

The migration must preserve controller slot 0 as the active pad and ignore slot 1. Keyboard input remains development-only. Both games must work offline on the mirrored cabinet display. No cloud account or runtime CDN should be required to start a game. The existing changes in `main.js` are outside the migration's write scope.

The current suite has 61 passing tests. These cover mechanical consistency, including encounter scheduling, tutorial completion, controller isolation, countdowns, results, and repeated Lab circuits. They do not establish that the games are as polished or enjoyable as their commercial references. A physical-controller playtest remains necessary to judge warning readability and difficulty.

## Options compared

| Option | Reusable capability | Fit for this repository | Decision |
|---|---|---|---|
| Phaser 4 | Scenes, sprites, loaders, texture cache, groups, animation, tweens, cameras, audio, optional physics | JavaScript and CommonJS fit the current Electron renderer; replaces several bespoke systems together | Adopt in stages |
| PixiJS 8 | GPU renderer, scene graph, textures, assets, filters, ticker | Good for rendering alone, but more gameplay infrastructure remains local | Alternative if the scope becomes rendering-only |
| Godot | Full editor and game authoring environment, web export | Requires a different project/runtime boundary and conversion of current JavaScript gameplay | Better suited to a new standalone project |
| GDevelop | Visual event authoring, ready-made behaviors, extensions and export tools | Useful if ongoing authors need a no-code editor; existing gameplay would need reconstruction in that workflow | Reconsider if visual editing becomes the main requirement |
| Keep current canvas engine | Existing tested behavior, no migration | Fastest immediate maintenance, but continues bespoke sprite/effect/content work | Temporary compatibility path only |

Phaser scenes provide their own display lists and managers and can be paused, resumed, or slept. Shared engine systems include textures, animation definitions, and rendering. That structure fits separate Cell and Lab scenes beneath a persistent cabinet interface. [2]

PixiJS documents an architecture centered on rendering, containers, assets, tickers, events, and filters. Its modularity is attractive for a view-only replacement. Choosing it would still leave this project to select or maintain more of its scene, gameplay, and animation infrastructure, which works against the stated goal of broader reuse. This is an architectural judgment, not a measured performance comparison. [3]

Godot's web export requires WebAssembly and WebGL 2. Its default single-threaded export avoids the cross-origin isolation requirements of threaded exports, so those headers are not an unavoidable blocker. Nevertheless, moving this existing Electron/JavaScript project into Godot introduces a second authoring and export pipeline. Native Godot would be a separate application strategy, not a small dependency change. [4]

GDevelop offers ready-made behaviors and visual event authoring, with optional JavaScript. Those capabilities could substantially reduce work for a team that wants to edit game behavior visually. Here, the immediate cost would be translating two existing games and their regression harness into that model. Its editor/runtime are open source, while hosted service offerings should be evaluated separately from local runtime licensing. [5]

## What the engine should replace

### Assets and sprite presentation

Use Phaser's loader and shared texture cache for local spritesheets or atlases. Define named sprite animations once and play them on both gameplay and attract-mode objects. Replace the hand-authored runtime bitmap cache and repeated canvas drawing once the migrated scene has equivalent readable silhouettes. Phaser's loader handles several asset types, and its animation system separates reusable animation definitions from individual sprites. [6][7]

A real improvement is the ability to replace a sprite sheet, change an animation frame rate, or adjust an atlas frame without editing drawing code. The game should retain explicit collision radii and shapes: transparent padding in imported art must not silently change hitboxes. Medical categories need redundant visual cues, such as a white cross on healthy cells, rather than color alone.

### Reusable objects and effects

Use engine Groups for bounded sprite reuse. Enemy, bullet, and pickup views should be keyed to stable simulation IDs and reset fully when recycled. Group reuse does not decide the game's projectile budget; the existing scheduler remains authoritative about how many bullets may be emitted. Phaser documents inactive-object retrieval and group reuse, so a second generic pooling framework is unnecessary. [8]

Use Phaser tweens and particles for hit bursts, pickup feedback, shield activation, and boss phase transitions. Tween only presentation properties. A warning can brighten or pulse, but its origin, target, and minimum warning duration must come from the combat model. Phaser tweens are scene-local and can animate object properties with sequencing and repetition. [9]

### Physics and rules

Do not immediately replace Lab Dash's physics with a generic platformer controller. Its cube, ship, and wave modes share authored geometry and tested timing. Changing acceleration, collision shapes, or update frequency while changing rendering would make failures difficult to diagnose.

Phaser Arcade Physics is appropriate to evaluate for straightforward future overlap and movement behavior; its supported bodies and configuration are documented. It is not an automatic solution to the runner's custom mode transitions or the shooter's reserved attack patterns. Keep deterministic rules in plain JavaScript initially, then adopt engine physics only where a production replay proves equivalent behavior or a deliberate redesign is desired. [10]

## Animation strategy

Keep CSS transitions for selection and button feedback, and the existing Web Animations API for short DOM entrances and exits. These are already browser-provided animation systems. Replacing a working 180–200 ms transform/opacity transition with another library would not create useful reuse. WAAPI exposes playback and cancellation controls needed for the current shell. [11]

Use Phaser animation and tweens inside the games. This gives one engine-managed lifetime for scene effects, rather than individual timers and hand-updated effect arrays. Pausing a game must also pause its visual effects; restarting must remove old tweens and callbacks.

Motion is a viable vanilla-JavaScript option if the selector later needs a more complicated synchronized sequence or spring-driven interaction. Its animation API offers both a small native-animation implementation and a larger hybrid implementation. Do not add both Motion and GSAP for the same menu. GSAP has capable timelines, but its standard license is distinct from an MIT dependency; it is unnecessary for the current selector. [12][13]

Maintain the existing motion tokens and explicit development keyboard parity. Button feedback should retarget immediately; launching must not wait for decorative animation. Full attract-mode movement remains available in `npm run dev-motion`, while production respects reduced motion. Reduced motion must retain the informational warning path and countdown even when decorative movement is removed.

## Artwork and level authoring

Adopt a coherent pack before adding more custom sprites. Kenney's Pixel Platformer provides 18×18 tiles under CC0 and links an industrial expansion; it is a practical starting point to inspect for Lab backgrounds and machinery. It is not evidence that every tile fits the laboratory theme. Select a small compatible subset, preview it at cabinet scale, and retain the exact license and source in `CITE.md`. [14]

Keep the already integrated Kenney A/X prompts. For specialized cell silhouettes and medical icons, a small custom set can sit beside reused environmental tiles if palette, outline weight, and pixel scale match. A general space pack should not turn cancer cells into unexplained spaceships. Engine adoption and asset selection are separate tasks, and both are needed for a noticeable visual improvement.

Use Tiled for future Lab stage authoring rather than writing an in-house editor. Tiled supports tile layers, object layers, and custom properties; its JSON export is documented and can also be produced from the command line. Object layers can represent hazards, pickups, and mode portals. [15][16]

Initially preserve existing stage data and its replay IDs. Convert one stage to Tiled JSON and verify that positions, pickup IDs, and completion times match before converting the rest. Use a small explicit import mapping for game-specific properties. Do not build a general editor or unrestricted level scripting language.

## Compatibility evidence

A temporary probe loaded the actual Phaser 4.2.1 distribution through CommonJS in the project's Electron renderer. It created a scene with a display object and a tween, then exercised both CanvasRenderer and WebGLRenderer. Both initialized successfully. After stopping the engine loop, the scene's update count remained fixed during a 100 ms wait; one explicit `game.step(time, 20)` advanced it once. Both instances were then destroyed.

This establishes basic CommonJS, renderer, and manual stepping compatibility on the development machine. It does not establish full-game frame rate, hardware compatibility on the cabinet, leak-free repeated switching, asset-loading resilience, or deterministic tween timing. The probe used a fresh canvas; the current gameplay canvas has already acquired a 2D context and must not be reused as though it were an untouched WebGL canvas.

Package source inspection also found that the engine starts its loop after its `postBoot` callback. Stopping the loop only inside that callback would therefore be insufficient. The integration must stop it after startup or use another verified lifecycle arrangement. This detail is a reason to keep runtime ownership in one shared adapter rather than let each game improvise it.

## Implementation status and 48-hour scope

Phaser 4.2.1 is now pinned in production dependencies. Both games have real Phaser presentation modules, connected through `renderer/hosa/phaserRuntime.js`; the engine owns sprites, Graphics, text, groups, textures, and cosmetic effects. The cabinet retains input, the fixed gameplay clock, countdowns, and results. Lab uses the local Kenney industrial atlas. The old Canvas drawing remains available for the headless compatibility tests, but the Electron application selects Phaser for both games.

The native integration explicitly selects Phaser CanvasRenderer. Phaser AUTO failed in Electron's detected custom environment, while the explicit renderer passed. WebGL worked in the isolated probe but is not enabled by default for this 48-hour cabinet build. This is engine adoption without requiring a GPU-specific feature path.

`npm run test:engine` exercises both scenes over 12 session cycles, verifies one engine canvas, a stopped autonomous loop, pause parity, 1080p sizing, and loaded controller prompts. The ordinary suite compares scored and tutorial traces with and without the presentation adapter. The same native smoke also runs with `--disable-gpu`. These checks are development-machine evidence, not a measured cabinet performance guarantee.

Tiled conversion and physics replacement are deferred until after the physical test. They would broaden the change beyond the immediate rendering and reuse objective. The milestones below remain the intended consolidation path; full removal of the legacy test renderer and content-editor conversion are follow-up work.

## Implementation plan

### Increment 1: shared runtime and one Cell encounter

**Owner:** root integration, with one bounded Cell scene worker. **Files:** new `renderer/hosa/phaserRuntime.js`, new Cell scene module, `renderer.js`, `package.json`, lockfile, and runtime tests. **Dependencies:** exact Phaser version and an agreed canvas lifecycle.

Create one persistent engine runtime with a fresh engine-owned canvas. Disable engine keyboard/gamepad/pointer handlers because normalized cabinet input already exists. Keep the host authoritative for game state. Supply a narrow render-state contract containing stable entity IDs, positions, sprite keys, warnings, and effects; do not expose mutable model internals to the scene.

The first runnable slice must render actual player, enemy, projectile, and pickup objects through Phaser, including a warning and a hit effect. A texture containing the entire old canvas does not count. Prove pause/resume, a return to the selector, and repeated scene restart before extending the scene.

### Increment 2: complete Cell rendering and asset reuse

**Owner:** Cell scene worker; asset worker has separate ownership of assets and attribution. **Dependencies:** increment 1's runtime contract. Replace the remaining custom Cell drawing with engine objects and Graphics where appropriate. Add coherent sprite animation and reusable effects without changing attack scheduling or score rules. Remove superseded canvas rendering rather than keeping two production paths indefinitely.

Acceptance requires all Cell model tests to pass, warning paths to match emitted trajectories, and a complete tutorial → countdown → play → game over → results cycle in native Electron. Test the maximum configured bullet population and boss transitions, not just the first wave.

### Increment 3: Lab scene and standard content pipeline

**Owner:** Lab scene worker. **Dependencies:** shared runtime stable; Cell lifecycle accepted. Move Lab sprites, backgrounds, portals, trails, and feedback into the engine. Keep its tested physics and scoring model. Convert one stage into a Tiled-authored representation only after the rendering conversion passes; stage conversion and physics replacement must not happen together.

Acceptance requires the existing three-stage and late-circuit replays, unique pickup accounting across retries, and no drift in portal/collision alignment. Inspect trails during cube, ship, and wave transitions at both 720p and 1080p.

### Increment 4: consolidate and cabinet check

**Owner:** root. Remove unused art helpers, duplicate timers, and obsolete compatibility code. Update README and CITE. Record asset files actually used, package versions, and engine license. Keep all game assets local and verify startup without network access.

Run repeated start/exit cycles and check canvas count, update count, event listeners, and retained scene objects. Capture frame-time distributions on the target computer during a dense encounter; use the display's frame budget as the target rather than claim a speedup from the engine name. Finish with novice tutorial and experienced-player difficulty checks on the actual controllers.

## Risk controls and decision boundaries

The largest integration risk is dual clock ownership. The host's accumulator and Phaser's loop must never both advance gameplay. During the first migration, the host retains the fixed simulation clock, while the runtime adapter owns the single presentation update. If a later step transfers timing to Phaser, it should be a separate tested change.

A second risk is treating visual polish as balance. More particles, screen shake, or bullet glow can reduce readability. The priority order remains warning clarity, safe lanes, player hitbox visibility, and pickup distinction. Boss difficulty should be assessed through ordinary weapon damage and limited real pulse charges, not unlimited test-hook attacks.

Migration effort depends on the playable deadline and how much visual redesign is included. No credible hours-saved figure has been measured. The strongest expected savings are future sprite/effect work and level editing. Preserve a playable checkpoint before each runtime change and revert the bounded migration diff if its acceptance gates fail; never reset unrelated working-tree changes.

## Sources

1. Phaser Studio, [Phaser 4 releases](https://phaser.io/download/phaser4), release dates listed; npm `phaser@4.2.1` metadata and distributed package inspected September 12, 2026.
2. Phaser, [Scenes](https://docs.phaser.io/phaser/concepts/scenes), live documentation.
3. PixiJS, [Architecture](https://pixijs.com/8.x/guides/concepts/architecture), v8 documentation; npm reports 8.20.1 at inspection.
4. Godot, [Exporting for the Web](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html), stable documentation.
5. GDevelop, [Engine overview](https://gdevelop.io/) and [repository license](https://github.com/4ian/GDevelop/blob/master/LICENSE.md).
6. Phaser, [Loader](https://docs.phaser.io/phaser/concepts/loader).
7. Phaser, [Animations](https://docs.phaser.io/phaser/concepts/animations).
8. Phaser, [Group](https://docs.phaser.io/phaser/concepts/gameobjects/group).
9. Phaser, [Tweens](https://docs.phaser.io/phaser/concepts/tweens).
10. Phaser, [Arcade Physics](https://docs.phaser.io/phaser/concepts/physics/arcade).
11. MDN, [Web Animations API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API).
12. Motion, [animate](https://motion.dev/docs/animate).
13. GSAP, [Standard license](https://gsap.com/community/standard-license/).
14. Kenney, [Pixel Platformer](https://kenney.nl/assets/pixel-platformer), CC0 pack listing.
15. Tiled, [Introduction](https://docs.mapeditor.org/en/stable/manual/introduction/).
16. Tiled, [JSON map format](https://docs.mapeditor.org/en/stable/reference/json-map-format/).

All live web documentation was checked September 12, 2026. Recommendations and migration sequencing are project-specific engineering judgments. The initial compatibility probe was isolated; the accepted runtime and both scene adapters are now integrated.
