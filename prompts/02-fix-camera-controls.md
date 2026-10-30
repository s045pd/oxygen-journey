Fix Oxygen Journey so levels render correctly and dual controls work.

## Bugs
1. Each LevelScene has its own `this.camera`, but App renders with `ctx.camera`. Level camera moves (e.g. tree orbit) are invisible. Fix:
   - In `src/levels/base.ts`: add `getCamera(): THREE.PerspectiveCamera { return this.camera; }`
   - In `src/app.ts` `animate`: when `this.currentLevel` exists, copy aspect from ctx.camera, then `renderer.render(scene, this.currentLevel.getCamera())`; else use ctx.camera. Also on `goToLevel` after enter, sync aspect on level camera.
2. Levels 4 (swap) and 8 (burn) need BOTH hold and slider, but ControlKind is single. Update:
   - `src/types.ts`: add optional `extraSlider?: { label: string; initial?: number }` on LevelDef
   - `src/content/levels.ts`: for swap set controlKind `'hold'`, yourTurn mention Hold SPACE for diffusion + slider for membrane thickness; extraSlider `{ label: 'Membrane thickness', initial: 0.3 }`. For burn: controlKind `'hold'`, yourTurn Hold for O₂ + slider glucose; extraSlider `{ label: 'Glucose', initial: 0.5 }`. Improve scaleLabel strings to look like `x1 WHOLE BODY`, `x10 AIRWAYS`, `x1e3 ALVEOLI`, `x1e4 MEMBRANE`, `x1e5 BLOOD`, `x10 HEART`, `x1 BODY`, `x1e6 CELL`, `x1 BODY`, `x1 LAB`.
   - `src/ui/hud.ts`: if def.extraSlider, show slider even when kind is hold; call onSlider. Add a visible Hold button (`.hud__hold-btn`) shown for hold kind: pointerdown→onHoldStart, pointerup/leave→onHoldEnd. Keep SPACE. For drag, allow pointer on whole document as now. Skip tour with click on tour overlay → advance? Optional: clicking tour overlay shouldn't break. Esc closes quiz if open — leave quiz as is.
3. Soften tour: allow Space during tour to skip to handsOn — wire in App: during tour, Space/click tour calls startHandsOnPhase. Pass a method or set hud.onSkipTour.

## Files to rewrite completely (emit ---FILE---):
- src/levels/base.ts
- src/app.ts
- src/types.ts
- src/content/levels.ts
- src/ui/hud.ts
- src/style.css (add .hud__hold-btn styles matching existing glass/neon look)

Do not rewrite level scene files. Keep TypeScript compiling.
