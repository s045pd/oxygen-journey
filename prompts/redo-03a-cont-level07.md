# CONTINUE — finish Level 07 + index only

Prior generation wrote complete level05_ride.ts and level06_pump.ts, then truncated mid level07_loops.ts.

## Emit ONLY these files (complete):
1. `src/levels/level07_loops.ts` — full Level07Loops (re-emit completely; do not resume mid-file)
2. `src/levels/index.ts` — register 7 factories: breathe,tree,unfold,swap,ride,pump,loops

## Level07 spec
- control: **slider** — 0 = pulmonary path emphasis, 1 = systemic; send one cell; BOTH loops must complete → readout 0..2 (Loops done)
- extends LevelScene; meshes on this.root; tick + onSlider; getReadout via makeReadout
- neon emissive procedural; import from './neon' and './base'
- Match style of level04/level05/level06 in quality

CRITICAL: SHORT plan then FILE blocks immediately. Complete TypeScript. No other files.
