# REDO 1c — HUD / quiz / base / app shell

Write app wiring. Levels factories stay EMPTY for now.

1. `src/ui/hud.ts` — class HUD: splash, setLevel(def), setPhase, setYourTurn, setReadout, setControl(kind,label), setTour, show/hideSplash, hold btn for hold, extraSlider support, progress, callbacks onStart/Check/Next/Prev/HoldStart/HoldEnd/Tap/Slider/ExtraSlider/Drag/SkipTour
2. `src/ui/quiz.ts` — QuizOverlay open(questions,onDone)/close
3. `src/levels/base.ts` — abstract LevelScene with own PerspectiveCamera ~35°, getCamera(), enter/exit/update, onHoldStart/End, onTap, onSlider, onDrag, getReadout(), dispose
4. `src/levels/index.ts` — `export const levelFactories: Record<string, () => LevelScene> = {}`
5. `src/app.ts` — App: splash→levels, Tour(~4s, Space/click skip)→HandsOn→Check quiz, render with level.getCamera() when present (sync aspect), ←/→, Space=hold/tap. If no factory, show glass torso placeholder.
6. `src/main.ts` — new App().start()
7. Update `index.html` only if viewport-fit=cover / meta missing

Context files provided are the types/content/css you must match.

Emit ---FILE--- only. Prefer emitting files quickly.
