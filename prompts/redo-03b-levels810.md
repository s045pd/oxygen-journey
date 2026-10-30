# REDO PASS 3b — Levels 8–10 only (match LevelScene API)

Shell + levels 1–7 already exist. DO NOT rewrite base/app/hud or levels 1–7 scene files except index.ts.
Match the QUALITY and STYLE of level04_swap.ts in context.

## API (see context)
- extend LevelScene; meshes on `this.root` in `onEnter`; animate in `tick(dt,time,input)`
- hooks: onHoldStart/End, onTap, onSlider, onExtraSlider, onDrag(DragInfo)
- getReadout() via makeReadout(); set framing; neon emissive procedural geometry
- import from './base' and './neon' as needed; DragInfo from '../ui/hud' if used

## Control map
8 burn — **hold** + extraSlider glucose (ATP/energy % toward 80). Hold delivers O₂ to mitochondria; extra = glucose supply.
9 run — **slider** effort (maps to heart rate 60..190; target 160). Show anaerobic / lactic feel at high effort.
10 out — **hold** exhale into limewater flasks (cloudiness % → 90). Hold = exhale; flasks cloud.

## Files to write
- src/levels/level08_burn.ts — Level08Burn
- src/levels/level09_run.ts — Level09Run
- src/levels/level10_out.ts — Level10Out
- src/levels/index.ts — register ALL 10:
  breathe,tree,unfold,swap,ride,pump,loops,burn,run,out
  (import Level05–10 from their files — assume 05–07 already exist on disk)

CRITICAL: After a SHORT plan, immediately emit ---FILE--- blocks. Do not burn the token budget on planning. Complete working TypeScript.
