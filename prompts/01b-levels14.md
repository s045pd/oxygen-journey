Implement fully interactive Three.js levels 1–4 for Oxygen Journey. Extend LevelScene from src/levels/base.ts.

Also update `src/levels/index.ts` to register these four (leave 5–10 unregistered for now).

## Shared conventions
- `import * as THREE from 'three'`
- `import { LevelScene } from './base'`
- Procedural geometry only. Neon colors: cyan lungs, violet airways, magenta alveoli, amber/gold for gas.
- Dark-friendly materials: MeshStandardMaterial with emissive, or MeshPhysicalMaterial transmission for glass bits.
- `getReadout()` returns short HTML/text for bottom-right (e.g. `Volume 2.4 L`).
- Animate in `update(dt)`.

## Level 1 — `src/levels/level01_breathe.ts`
Class `Level01Breathe`
- Glass torso + rib cage (arcs/curves) + dome diaphragm + two lung ellipsoids.
- onHoldStart: inhale=true; onHoldEnd: inhale=false.
- Inhale: ribs expand outward, diaphragm descends, lungs scale up, volume 0.5→4.5 L.
- Exhale: reverse with easing.
- Soft cyan emissive pulse on lungs while inhaling.

## Level 2 — `src/levels/level02_tree.ts`
Class `Level02Tree`
- Start with trachea cylinder. onTap: add next bifurcation generation (up to 7 visual levels).
- Recursive Y-branch tubes with decreasing radius; violet emissive.
- Camera slowly orbits. Readout: `Generation n / 23` (map visual 1..7 to conceptual labels).

## Level 3 — `src/levels/level03_unfold.ts`
Class `Level03Unfold`
- Cluster of ~12–20 spheres (alveoli) packed. onDrag: increase unfold amount (0..1) based on drag distance.
- As unfold↑, spheres spread on a surface and inflate; show surface area 0→70 m² conceptually.
- Magenta/pink emissive.

## Level 4 — `src/levels/level04_swap.ts`
Class `Level04Swap`
- Cross-section: alveolar air side | membrane slab | capillary blood side.
- O2 particles (cyan) diffuse air→blood while holding; CO2 (amber) blood→air.
- onSlider(0..1): membrane thickness; thicker slows diffusion rate.
- onHoldStart/End gates diffusion.
- Readout: exchange rate + thickness nm.

## Also write
`src/levels/index.ts`:
```
import type { LevelScene } from './base'
import { Level01Breathe } from './level01_breathe'
...
export const levelFactories: Record<string, () => LevelScene> = {
  breathe: () => new Level01Breathe(),
  tree: () => new Level02Tree(),
  unfold: () => new Level03Unfold(),
  swap: () => new Level04Swap(),
}
```

Emit ---FILE--- markers only. Complete working TypeScript.
