Implement playable Three.js levels 5–10 for Oxygen Journey. Extend LevelScene from ./base.
Update `src/levels/index.ts` to register ALL 10 levels (1–4 already exist — re-export them and add 5–10).

## Levels

### 5 `src/levels/level05_ride.ts` Level05Ride
Capillary tube + hemoglobin sites. Drag moves an RBC along the tube; when near a site and close, bind O2 (cyan spark). Readout: O2 bound n/8.

### 6 `src/levels/level06_pump.ts` Level06Pump
4-chamber heart schematic (boxes/spheres). onTap = beat. Track BPM from tap intervals. If BPM > 140, fillFraction drops (incomplete fill). Chambers pulse scale. Readout BPM + fill %.

### 7 `src/levels/level07_loops.ts` Level07Loops
Body silhouette + heart + two loop paths (pulmonary blue-ish, systemic red). onTap cycles/selects path OR use two clickable mesh hotspots — simplest: onTap toggles path and sends a glowing cell along CatmullRom curve. Readout: current path name.

### 8 `src/levels/level08_burn.ts` Level08Burn
Cell with mitochondria (elongated ellipsoids, amber). onHold supplies O2; onSlider sets glucose 0..1. ATP meter rises when both present. Readout ATP + substrates.

### 9 `src/levels/level09_run.ts` Level09Run
Runner stick figure or pulsing body. onDrag vertical sets effort 0..1. High effort: O2 debt + lactate rise; when effort low, debt repays. Readout effort, debt, lactate.

### 10 `src/levels/level10_out.ts` Level10Out
Two flasks. Hold = exhale bubbles. Left "air" stays clear; right "expired" turns milky (opacity/color) as CO2 indicator. Readout bubble count + turbidity.

## index.ts
Register: breathe,tree,unfold,swap,ride,pump,loops,burn,run,out.

Procedural geometry, neon materials, getReadout(), update(dt). Emit ---FILE--- only.
