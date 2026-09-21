# Cell Defender modifications

This directory adapts `vendor/spaceinvaders/spaceinvaders.js` from
[`dwmkerr/spaceinvaders`](https://github.com/dwmkerr/spaceinvaders) at
`07fee2a3a54e925764637ce68c559c617b4289e3` (MIT; see the vendored license).

This is now a deliberately divergent, host-stepped 50 Hz top-down shooter.
It retains the source-derived formation-wave idea and MIT attribution, while
adding full XY motion, automatic fire, capped projectile pools, scripted cell
types, minibosses, drops, charge-limited specials, and branching weapon builds.
Healthy crossing targets and their penalties have been removed. It uses no browser listeners, RAF, timers, or wall-clock
time; the host owns lifecycle and calls `step(dt, input)`.
