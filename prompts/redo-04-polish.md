# REDO PASS 4 — Polish for SkillBay bar

Given the existing shell + 10 levels, rewrite the files below so the demo hits top-studio bar.

## Goals
1. Overlay ≤ ~40% on phone: shrink HUD paddings, tour card, splash; compact scale ring.
2. Ensure App renders with `currentLevel.getCamera()` and syncs aspect on resize/level change.
3. Bloom / tone mapping sane (no chalky wash); fog far; modest ambient.
4. Hold button + Space; extraSlider for swap/burn; skip tour on Space/click.
5. controlKind matches interaction; dual controls work.
6. Scale ring labels animate with level scaleLabel.
7. Fix any TypeScript issues you see in provided context files.

## Rewrite completely:
- src/style.css
- src/app.ts
- src/ui/hud.ts
- src/core/renderer.ts
- src/core/scaleRing.ts
- src/types.ts (if needed)
- src/content/levels.ts (tighten copy, ensure extraSlider + scaleLabels)
- src/levels/base.ts (getCamera, sensible defaults)

Do NOT rewrite all level*.ts unless a critical bug is obvious in context — then patch only those.

Emit ---FILE--- only.
