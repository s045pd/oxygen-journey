# REDO 1a — types + content + CSS foundation

Write ONLY these files for Oxygen Journey (Vite+TS+three). Studio bar. English original copy.

## Art (brief)
Dark cinematic (#070a10). Cyan/magenta/violet/crimson/amber neon. Compact HUD — phone overlays ≤40%. Scale labels like `x1 WHOLE BODY`.

## Files
1. `src/vite-env.d.ts`
2. `src/types.ts` — LevelId, LevelPhase ('tour'|'handsOn'|'check'), ControlKind ('hold'|'tap'|'drag'|'slider'), QuizQuestion, LevelDef with optional extraSlider?: {label, initial?}, Readout type if useful
3. `src/content/levels.ts` — ALL 10 levels ids: breathe,tree,unfold,swap,ride,pump,loops,burn,run,out. Titles: Breathe In, The Tree, Unfold, The Swap, The Ride, The Pump, Two Loops, Burn, Run!, Out. scaleLabels: x1 WHOLE BODY, x10 AIRWAYS, x1e3 ALVEOLI, x1e4 MEMBRANE, x1e5 BLOOD, x10 HEART, x1 BODY, x1e6 CELL, x1 BODY, x1 LAB. Original tourText, yourTurn, controlKind, controlLabel, quiz[2] each. swap+burn: controlKind 'hold' + extraSlider.
4. `src/style.css` — full-bleed canvas page; splash; HUD (top-left roman+title+scale, bottom-left YOUR TURN+Check, bottom-right control+readout, right scale-ring host); quiz modal; progress dots; hold button; safe-area; MOBILE COMPACT. CSS vars. pointer-events none on .hud, auto on controls. No giant opaque panels.

Emit ---FILE--- only. Complete compiling TS/CSS. Prefer emitting files quickly after a short plan.
