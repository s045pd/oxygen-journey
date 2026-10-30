# REDO PASS 2 — Levels 1–4 (match existing LevelScene API)

Implement studio-grade interactive levels 1–4. The shell already exists — DO NOT rewrite base/app/hud.

## API you MUST follow (from context files)
- `export class Level0X... extends LevelScene`
- Put all meshes under `this.root` in `onEnter(ctx)`
- Drive animation in `tick(dt, time, input)` using `ControlInput` (`holding`, `holdTime`, `tapCount`, `tapsThisFrame`, `slider`, `extra`, `dragDX/DY`)
- Also implement hooks: `onHoldStart/End`, `onTap`, `onSlider`, `onExtraSlider`, `onDrag(e: DragInfo)` as needed
- `getReadout(): Readout` via `this.makeReadout(value, {status, note, active, progress})`
- Set `this.framing` (target/radius/dir) so autoFrame works; set `this.showsBody = true` only if the shared glass torso helps (level 1 yes; others usually false)
- Neon materials (emissive). Procedural geometry only. Dark-friendly.
- import * as THREE from 'three'
- import { LevelScene } from './base'
- import type { DragInfo } from '../ui/hud' when using onDrag

## Control map (must match content/levels.ts)
1 breathe — hold
2 tree — tap
3 unfold — **slider** (0..1 unfolds alveoli; NOT drag)
4 swap — hold + extraSlider (membrane thickness via onExtraSlider / input.extra)

## Files
### `src/levels/level01_breathe.ts` — Level01Breathe
Rib cage arcs + diaphragm dome + two cyan lung ellipsoids. Hold=inhale (expand/descend/scale, volume→target). Release=exhale ease. showsBody=true OK.

### `src/levels/level02_tree.ts` — Level02Tree
Trachea; each tap adds bifurcation generation (≤7 visual). Violet tubes. Readout generations toward target.

### `src/levels/level03_unfold.ts` — Level03Unfold
~16–24 alveoli. **Slider** sets unfold 0..1: pack→spread + inflate; surface area toward ~70. Magenta.

### `src/levels/level04_swap.ts` — Level04Swap
Air | membrane | blood cross-section. Hold: O₂ cyan air→blood, CO₂ amber reverse. Extra slider = thickness (slows rate).

### `src/levels/index.ts`
Register ONLY these four factories for now:
```
import type { LevelScene } from './base'
import { Level01Breathe } from './level01_breathe'
import { Level02Tree } from './level02_tree'
import { Level03Unfold } from './level03_unfold'
import { Level04Swap } from './level04_swap'
export const levelFactories: Record<string, () => LevelScene> = {
  breathe: () => new Level01Breathe(),
  tree: () => new Level02Tree(),
  unfold: () => new Level03Unfold(),
  swap: () => new Level04Swap(),
}
```

Emit ---FILE--- only. Complete TypeScript. Prefer emitting files after a short plan.
