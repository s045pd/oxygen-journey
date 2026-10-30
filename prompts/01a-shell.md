Build the SHELL of Oxygen Journey (Vite + TypeScript + three). Do NOT write level scene files yet.

## App
GCSE/KS3 interactive Three.js lesson. Dark studio UI. English. Original copy.

## Files to write (complete):

1. `src/style.css` — full chrome: splash, HUD top-left (roman+title+scale), bottom-left YOUR TURN + Check, bottom-right controls+readout, right scale-ring, quiz modal, progress dots. CSS vars. Mobile ok. Colors: bg #0a0c12, cyan/magenta/red/amber accents, glass panels.
2. `src/vite-env.d.ts`
3. `src/types.ts` — LevelId, LevelPhase ('tour'|'handsOn'|'check'), ControlKind ('hold'|'tap'|'drag'|'slider'), QuizQuestion, LevelDef, Readout
4. `src/content/levels.ts` — ALL 10 levels metadata: roman, title, scaleLabel, tourText, yourTurn, controlKind, controlLabel, quiz[2]. Original English. IDs: breathe,tree,unfold,swap,ride,pump,loops,burn,run,out. Titles: Breathe In, The Tree, Unfold, The Swap, The Ride, The Pump, Two Loops, Burn, Run!, Out.
5. `src/audio/sfx.ts` — WebAudio: inhale, exhale, tap, success, fail, whoosh. resume() on gesture.
6. `src/core/renderer.ts` — createRenderer(container): { renderer, camera, scene, clock, onResize, dispose }
7. `src/core/body.ts` — createGlassTorso(): THREE.Group procedural translucent torso+head hint
8. `src/core/scaleRing.ts` — mountScaleRing(el), setScale(label: string, t: number 0..1)
9. `src/ui/hud.ts` — class HUD: mount into #app, methods setLevel(def), setPhase(phase), setYourTurn(text), setReadout(html), setControl(kind,label), setTour(text), showSplash/hideSplash, onStart, onCheck, onNext, onPrev, onHoldStart/End, onTap, onSlider, onDrag — wire DOM events
10. `src/ui/quiz.ts` — class QuizOverlay: open(questions, onDone), close
11. `src/levels/base.ts` — abstract class LevelScene { scene, camera ref helpers; abstract enter(root:THREE.Scene):void; abstract exit():void; abstract update(dt:number):void; onHoldStart():void; onHoldEnd():void; onTap():void; onSlider(v:number):void; onDrag(dx:number,dy:number):void; getReadout():string; dispose():void }
12. `src/levels/index.ts` — export type LevelCtor; PLACEHOLDER: export const levelFactories: Record<string, () => LevelScene> = {}  (empty for now; comment that levels will be registered)
13. `src/app.ts` — App class wiring splash→levels, phase Tour(4s)→HandsOn, Check opens quiz, ←/→ levels, Space hold/tap. For now if no factory, show empty scene with body torso + message.
14. `src/main.ts` — new App().start()

Emit ---FILE: path--- / ---ENDFILE--- for each. Compilable TypeScript.
