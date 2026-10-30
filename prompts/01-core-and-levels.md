Build the complete Oxygen Journey interactive Three.js education app (Vite + TypeScript + three r170).

## Product
GCSE / KS3 biology: follow one oxygen molecule from air into a body cell and out as CO2.
10 levels. Each level cycle: Tour (short narration + camera) → Hands-on (interactive) → Check yourself (2 MCQs).
English UI. Original copy — do NOT copy techartist wording or assets.

## Levels (implement ALL; 1–4 must be fully interactive; 5–10 at least playable skeletons with working controls + quiz)

| # | id | title | scale | hands-on |
|---|-----|-------|-------|----------|
| 1 | breathe | Breathe In | x1 WHOLE BODY | Hold button to inhale (ribs expand, diaphragm drops, lung volume rises); release to exhale. Show volume L. |
| 2 | tree | The Tree | x10 AIRWAYS | Tap to grow next airway branch level (trachea→bronchi→bronchioles, ~23 generations conceptually; show 6–8 visual levels). |
| 3 | unfold | Unfold | x1e3 ALVEOLI | Drag to unfold/inflate alveolar cluster; show surface area m² rising. |
| 4 | swap | The Swap | x1e4 MEMBRANE | Hold to run O2↔CO2 diffusion across thin wall; slider for wall thickness (thicker = slower). |
| 5 | ride | The Ride | x1e5 BLOOD | Drag RBC along capillary; O2 binds when near Hb sites. |
| 6 | pump | The Pump | x10 HEART | Tap to beat; too fast → incomplete fill (readout). |
| 7 | loops | Two Loops | x1 BODY | Click pulmonary vs systemic path to send cell. |
| 8 | burn | Burn | x1e6 CELL | Hold O2 supply + glucose slider → ATP meter. |
| 9 | run | Run! | x1 BODY | Drag effort intensity; watch O2 debt / lactate rise and repay at rest. |
| 10 | out | Out | x1 LAB | Hold exhale into limewater flasks; compare clear vs milky CO2 test. |

## Visual / UI (must match)
- Dark studio background (#0a0c12), glass-like translucent body silhouette where relevant, neon organ accents (cyan lungs, magenta alveoli, red blood, amber mitochondria, violet airways).
- Top-left: Roman numeral + level title + scale subtitle (e.g. `I  ·  Breathe In` / `x1 WHOLE BODY`).
- Bottom-left: `YOUR TURN` instruction panel + `Check yourself` button (opens 2-question quiz overlay).
- Bottom-right: control cluster (Hold / Tap / Drag / Slider) + live readout.
- Right edge: scale ring dial showing current magnification.
- Progress dots / next-prev level.
- Keyboard: Space = primary action (hold/tap), ←/→ change level, Esc close quiz.
- Intro splash: title "Oxygen Journey", subtitle "From air to every cell", Start button.

## Architecture — write these files (complete, compilable):

1. `src/style.css` — full UI chrome (glass panels, buttons, quiz modal, scale ring). Mobile-friendly.
2. `src/vite-env.d.ts` — reference vite/client
3. `src/types.ts` — LevelDef, QuizQuestion, LevelPhase, AppState types
4. `src/content/levels.ts` — all 10 level metadata + original English tour text + YOUR TURN copy + 2 quiz Qs each (correctIndex 0–3)
5. `src/audio/sfx.ts` — WebAudio procedural: inhale whoosh, exhale, tap click, success chime, fail soft buzz. No external files.
6. `src/core/renderer.ts` — Three.js WebGLRenderer + PerspectiveCamera + ambient/dir/point lights setup; resize; dispose
7. `src/core/body.ts` — procedural glass human torso silhouette (lathe/extrude or simple mesh group) reusable across levels
8. `src/core/scaleRing.ts` — update DOM scale ring
9. `src/ui/hud.ts` — build/update HUD DOM from #app structure
10. `src/ui/quiz.ts` — quiz overlay logic
11. `src/levels/base.ts` — abstract LevelScene: scene, enter/exit, update(dt), onPointer*, onHoldStart/End, setSlider, dispose
12. `src/levels/level01_breathe.ts` through `src/levels/level10_out.ts` — each exports a class extending LevelScene
13. `src/levels/index.ts` — factory map
14. `src/app.ts` — App class: splash → level loop, phase machine Tour→HandsOn→Check, input wiring, level switching
15. `src/main.ts` — bootstrap

## Implementation notes
- Use `three` imports (`import * as THREE from 'three'`).
- Procedural geometry only (Sphere, Cylinder, Torus, Tube, Lathe, BufferGeometry). No GLB loading.
- Tour phase: auto-run ~4s camera ease + show tour text; then enable hands-on.
- Each level's `update(dt)` animates visuals based on interaction state.
- Keep each level file self-contained (~150–250 lines). Quality over stubs for 1–4; 5–10 can be simpler but must respond to input and look intentional.
- No external CSS frameworks. CSS variables for colors.
- `document.getElementById('app')` root; create canvas + HUD inside.

## Output
Emit every file with ---FILE: path--- / ---ENDFILE--- markers. Paths relative to project root. Do not omit files. Prefer working TypeScript that passes `tsc` strict-ish (noUnusedLocals off).
