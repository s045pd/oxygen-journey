# REDO PASS 3 — Levels 5–10 (match LevelScene API)

Implement levels 5–10. Shell + levels 1–4 already exist. DO NOT rewrite base/app/hud or levels 1–4.

## API (see context)
- extend LevelScene; meshes on `this.root` in `onEnter`; animate in `tick(dt,time,input)`
- hooks: onHoldStart/End, onTap, onSlider, onExtraSlider, onDrag(DragInfo)
- getReadout() via makeReadout(); set framing; neon emissive procedural geometry
- import { LevelScene } from './base'; import type { LevelContext } from './base' if needed
- Shared helper `src/levels/neon.ts` may already exist — you may import from it OR keep self-contained

## Control map (must match content)
5 ride — **drag** (RBC along capillary; load O₂ → readout % toward 95)
6 pump — **tap** (heart beat; BPM toward ~60 resting goal — tap to establish rhythm; if BPM too high fill suffers — readout heart rate)
7 loops — **slider** (0 = pulmonary path, 1 = systemic; send cell; need both loops done → readout 0..2)
8 burn — **hold** + extraSlider glucose (ATP/energy % toward 80)
9 run — **slider** effort (maps to heart rate 60..190; target 160)
10 out — **hold** exhale into limewater flasks (cloudiness % → 90)

## Files to write
- src/levels/level05_ride.ts — Level05Ride
- src/levels/level06_pump.ts — Level06Pump
- src/levels/level07_loops.ts — Level07Loops
- src/levels/level08_burn.ts — Level08Burn
- src/levels/level09_run.ts — Level09Run
- src/levels/level10_out.ts — Level10Out
- src/levels/index.ts — register ALL 10:
  breathe,tree,unfold,swap,ride,pump,loops,burn,run,out

Emit ---FILE--- only. Prefer emitting after a short plan.
