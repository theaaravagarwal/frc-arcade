# HOSA pixel-art assets

Runtime HOSA sprite pixels are authored procedurally in
`renderer/hosa/art.js`. `prompts/a.png` and `prompts/x.png` are unmodified CC0
Kenney Input Prompts assets used in the selector controls; their source license is
retained beside them. See `CITE.md` for attribution and reference-only sources.

`tiles/kenney-industrial-tilemap.png` is the selected unmodified CC0 Kenney Pixel
Platformer Industrial Expansion atlas. It is 303×132px: 16 columns × 7 rows of
18×18px tiles, with a 1px gutter; tile `(column,row)` is `(column*19,row*19,18,18)`.
Useful Phaser frames: wall plating `(0–3,0–3)`, vertical pipes `(6,0–3)`, warning
panel `(10,2)`, machine/console panels `(12–15,1–3)`, floor/beam pieces `(7–10,5)`,
and large machinery/wheel tiles `(0–5,5–6)`. The original CC0 license is retained
as `tiles/LICENSE-Kenney-Pixel-Platformer-Industrial-Expansion.txt`.
