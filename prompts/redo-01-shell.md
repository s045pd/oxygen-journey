# REDO PASS 1 — Shell (studio-grade)

Rebuild the SHELL of Oxygen Journey (Vite + TS + three r170). Do NOT write level scene files yet.

## Art direction (this piece)
- Idea: follow one breath of O₂ from air → cell → out as a neon anatomy journey inside a dark glass studio.
- Signature: translucent glass torso with cyan lung bloom pulsing on inhale; scale clock ticks as we zoom from body → cell.
- Composition: hero anatomy fills ~50–65% frame height, slight low three-quarter, shallow vignette.
- Lens: ~32–38° vertical FOV landscape; widen FOV in portrait to keep horizontal FOV.
- Light: cool key from upper-left, warm rim from right, very low ambient hemisphere; fog matches bg (#070a10) and starts FAR.
- Palette: bg #070a10, cyan #00e8ff, magenta #ff2bd6, violet #8b5cff, crimson #ff3b5c, amber #ffb020, text #e8edf5.
- Overlay voice: sparse HUD — small roman+title top-left, YOUR TURN + Check bottom-left, control+readout bottom-right, scale dial right. Glass panels with thin neon borders, high blur, low opacity. **Phone: keep overlays thin.**

## Files to write (complete, compiling):

1. `src/style.css` — full-bleed; splash; HUD; quiz; scale-ring; progress dots; hold button; safe-area; mobile compact (≤40% overlay). CSS vars from palette. `.hud` pointer-events none; interactive children auto.
2. `src/vite-env.d.ts`
3. `src/types.ts` — LevelId, LevelPhase ('tour'|'handsOn'|'check'), ControlKind ('hold'|'tap'|'drag'|'slider'), QuizQuestion, LevelDef (optional extraSlider), Readout helpers
4. `src/content/levels.ts` — ALL 10 levels: ids breathe,tree,unfold,swap,ride,pump,loops,burn,run,out. Titles: Breathe In, The Tree, Unfold, The Swap, The Ride, The Pump, Two Loops, Burn, Run!, Out. scaleLabels like `x1 WHOLE BODY`, `x10 AIRWAYS`, `x1e3 ALVEOLI`, `x1e4 MEMBRANE`, `x1e5 BLOOD`, `x10 HEART`, `x1 BODY`, `x1e6 CELL`, `x1 BODY`, `x1 LAB`. Original English tour/yourTurn/quiz[2]. swap+burn: controlKind hold + extraSlider.
5. `src/audio/sfx.ts` — WebAudio synth: inhale,exhale,tap,success,fail,whoosh; resume()
6. `src/core/renderer.ts` — createRenderer(container): ACESFilmic tone mapping, outputColorSpace SRGB, shadows optional, fog, resize, dispose. Prefer EffectComposer+RenderPass+UnrealBloomPass+OutputPass from three/addons; expose `render(scene,camera)` and `setSize`.
7. `src/core/body.ts` — createGlassTorso(): detailed procedural translucent torso+neck+head hint (lathe/capsule blend), subtle emissive spine, not a bare box.
8. `src/core/scaleRing.ts` — SVG or canvas dial on right; mountScaleRing(el), setScale(label, t 0..1) with smooth needle.
9. `src/ui/hud.ts` — HUD class: splash, setLevel, setPhase, setYourTurn, setReadout, setControl, setTour, hold btn for hold kind, extraSlider support, progress, onStart/Check/Next/Prev/Hold/Tap/Slider/Drag/SkipTour
10. `src/ui/quiz.ts` — QuizOverlay open/close
11. `src/levels/base.ts` — abstract LevelScene with own PerspectiveCamera (~35°), getCamera(), enter/exit/update, control hooks, getReadout(), dispose
12. `src/levels/index.ts` — empty levelFactories {} with comment
13. `src/app.ts` — App: splash→levels, Tour(~4s, Space/click skip)→HandsOn→Check, render with level.getCamera() when present, ←/→, Space hold/tap
14. `src/main.ts` — bootstrap
15. Touch `index.html` only if viewport-fit=cover / meta missing

Emit ---FILE--- markers only.
