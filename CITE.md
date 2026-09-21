# Art attribution

## Original art in this repository

`renderer/hosa/cellAtlas.js`, `renderer/hosa/art.js`, and `renderer/hosa/menuArt.js` contain original procedural pixel sprites and backgrounds. The Cell atlas includes 136 idle, charge, release, and destruction frames. Reused projectiles, effects, fonts, and controller prompts are listed separately below.

## Reused third-party files

- Kenney, [Input Prompts](https://kenney.nl/assets/input-prompts), CC0. `assets/hosa/prompts/a.png` and `assets/hosa/prompts/x.png` are unmodified Xbox Series prompt PNGs used by the selector controls. The original license is retained as `assets/hosa/prompts/LICENSE-Kenney.txt`.
- Kenney, [Pixel Platformer Industrial Expansion](https://kenney.nl/assets/pixel-platformer-industrial-expansion), CC0. `assets/hosa/tiles/kenney-industrial-tilemap.png` is an unmodified 18px industrial tile atlas used for laboratory walls, machinery, and pipes; its original license is retained beside it.
- Kenney, [Kenney Fonts](https://kenney.nl/assets/kenney-fonts), CC0. `assets/hosa/fonts/kenney-pixel.ttf` is the unmodified **Kenney Pixel** font; its original license is retained as `assets/hosa/fonts/LICENSE-Kenney-Fonts.txt`.
- Kenney, [Pixel Shmup](https://kenney.nl/assets/pixel-shmup), CC0. `assets/hosa/cell/player-shot.png` (the cream/gold projectile) and `assets/hosa/cell/impact.png` (the impact star) are unmodified 16px tiles; their original license is retained as `assets/hosa/cell/LICENSE-Kenney-Pixel-Shmup.txt`.

## Reference-only sources (not redistributed or incorporated)

- Foozle, [Sci-Fi Lab Tileset Decor & Traps](https://foozlecc.itch.io/sci-fi-lab-tileset-decor-traps), CC0. Referenced for genre, laboratory prop vocabulary, and palette direction only.
- *Sky Force*, *Geometry Dash*, and *Sonic Mania* are visual-motion references only. No assets, source files, or distinctive artwork from those games are included.

No Foozle source files are present under `assets/` or used at runtime.

## Runtime engine

- Phaser Studio, [Phaser 4.2.1](https://phaser.io/download/release/v4.2.1), [MIT license](https://github.com/phaserjs/phaser/blob/v4.2.1/LICENSE.md). Installed through npm with the upstream license retained in `node_modules/phaser/LICENSE.md`. Phaser powers both games' presentation; gameplay rules and cabinet integration are project code.

## Weapon progression references

- [Diep.io tiers](https://diepio.fandom.com/wiki/Tiers): user-supplied reference for branching weapon classes; no assets or code reused. The page was inaccessible during research.
- [Nova Drift: Cosmic Powers](https://blog.novadrift.io/nova-drift-cosmic-powers/) and [design manifesto](https://blog.novadrift.io/nova-drift-manifesto/): references for compatible upgrades, build identity, and encounter variety.
- [Dead Cells update 11](https://deadcells.com/patchnotes/11): reference for avoiding enemy scaling based on the player’s equipment.

Weapon definitions, reward logic, and animated card diagrams are original project code.

## Developer sandbox reference

- [Godot debugging tools: Remote inspector](https://docs.godotengine.org/en/stable/tutorials/scripting/debug/overview_of_debugging_tools.html#remote-in-scene-dock): reference for inspecting and changing live game parameters. No Godot code or assets reused; the sandbox uses the existing game model and native HTML controls.

## Boss encounter design references

- Itay Keren, [Boss Up: Creating Exciting and Memorable Boss Fights](https://media.gdcvault.com/gdc2018/presentations/Keren_Itay_BossUp.pdf), GDC 2018. Reference for telegraphed attacks, safe negative space, and phases that change or combine mechanics instead of only extending fight length.
- Rebecca Vessal, [Crafting Epic Boss Fights Through Modular Design](https://media.gdcvault.com/gdc2023/Slides/CraftingEpicBoss_Vessal_Beca.pdf), GDC 2023. Reference for reusable telegraph, attack, and recovery chains with phase-specific parameters.
- [Design Deep Dive: Angelical Echo Boss Fight](https://www.gamedeveloper.com/design/design-deep-dive-angelical-echo-boss-fight). Reference for clearly signposted invulnerable survival phases followed by vulnerable damage windows.
- DECA Games, [Update 2.0.2 – The Shatters](https://remaster.realmofthemadgod.com/?p=2156), August 26, 2021. Reference-only research for readable boss stances, mobile patterns, and multiple concurrent projectile emitters.
- DECA Games, [Public Testing: O3 Changes](https://remaster.realmofthemadgod.com/?p=3675), April 6, 2023. Reference-only research for complete attack-combo chains and damage-threshold invulnerability that lets a promised sequence resolve.

RealmEye was not inspected and is not a source for this project.

These sources informed encounter structure only. No source code, artwork, audio, or text from them is included at runtime.
