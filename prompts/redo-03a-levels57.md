# REDO PASS 3a — Levels 5–7 only (match LevelScene API)

Shell + levels 1–4 already exist. DO NOT rewrite base/app/hud or levels 1–4.
Match the QUALITY and STYLE of level04_swap.ts in context (neon helpers, procedural geometry, makeReadout).

## API (see context)
- `export class Level0X... extends LevelScene`
- meshes on `this.root` in `onEnter(ctx)`; animate in `tick(dt, time, input)`
- hooks: onHoldStart/End, onTap, onSlider, onExtraSlider, onDrag(e: DragInfo)
- getReadout() via this.makeReadout(value, {status, note, active, progress})
- set this.framing; neon emissive procedural geometry
- import { LevelScene } from './base'
- import type { DragInfo } from '../ui/hud' when using onDrag
- import helpers from './neon' (neonMaterial, glassMaterial, damp, clamp01, lerp, rng, …)

## Control map
5 ride — **drag** (RBC along capillary; load O₂ → readout % toward 95). onDrag(DragInfo) moves cell; oxygen % climbs as it travels through oxygenated zone.
6 pump — **tap** (heart beat; BPM toward ~60 resting). Tap establishes rhythm; if BPM too high fill suffers — readout heart rate bpm.
7 loops — **slider** (0 = pulmonary path emphasis, 1 = systemic; send one cell; need BOTH loops completed → readout 0..2).

## Files to write (ONLY these three + index with 1–7 registered; keep 8–10 out of index for now OR stub-omit)
- src/levels/level05_ride.ts — Level05Ride
- src/levels/level06_pump.ts — Level06Pump
- src/levels/level07_loops.ts — Level07Loops
- src/levels/index.ts — register breathe,tree,unfold,swap,ride,pump,loops (7 factories). Do NOT import 8–10 yet.

CRITICAL: After a SHORT plan, immediately emit ---FILE--- blocks. Do not burn the token budget on planning. Complete working TypeScript.
