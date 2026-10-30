Rewrite Oxygen Journey as a SkillBay public demo under the Demo contract. Output ONLY ---FILE: path--- blocks. Paths relative to `public/demos/oxygen-journey/`.

## Hard contract
1. Files: index.html, main.js, style.css, config.js, audio.js, hud.js, levels.js (ALL 10 levels in one file), plus optional quiz.js if needed. Prefer ≤8 files.
2. index.html: doctype, lang=en, viewport, title, description, `<link rel="icon" href="/demos/_shared/icon.svg" />`, `<link rel="stylesheet" href="/vendor/fonts/fonts.css" />`, `<link rel="stylesheet" href="style.css" />`, EXACT import map:
`<script type="importmap">{"imports":{"three":"/vendor/three/three.module.js","three/addons/":"/vendor/three/addons/"}}</script>`
then `<script type="module" src="./main.js"></script>`. NO other scripts. NO Google fonts. NO inline scripts except that import map. NO on* attributes.
3. Body: full-bleed `<canvas id="scene" tabindex="0" role="img" aria-label="...">`, HUD overlays with `data-overlay`, pause button `#pause`, sample note "Sample output · fictional GCSE biology lesson". Splash optional as overlay.
4. main.js must:
```
import { createStage, fontsReady, captureMode, reducedMotion, pixelRatio, seeded, hashSeed } from "../_shared/stage.js";
import * as THREE from "three";
```
- create WebGLRenderer with `{ antialias: true, alpha: false, preserveDrawingBuffer: captureMode, powerPreference: "high-performance" }`, setPixelRatio(pixelRatio(2))
- Drive ALL animation via `stage.onFrame((t, dt) => ...)` — never Date.now/performance.now/Math.random
- Use `seeded(hashSeed("oxygen-journey"))` if randomness needed
- After first frame + fontsReady: `stage.markReady(); stage.play();`
- If WebGL fails: honest static fallback message
- captureMode: `document.body.classList.add("capture")` and hide overlays/chrome (CSS .capture [data-overlay]{display:none})
- reducedMotion: still composed frame; interaction still works
- Visible Pause control for continuous motion
- Keyboard: Space = primary action, ←/→ levels, Esc quiz, P pause
5. levels.js: export factories for ids breathe,tree,unfold,swap,ride,pump,loops,burn,run,out. Each level: enter(scene,camera), exit(), update(dt,t), onHoldStart/End, onTap, onSlider, onDrag, getReadout(). Procedural THREE geometry only. Neon dark studio look. Port the existing TS level logic faithfully but as plain JS (no types, no private fields with # unless fine).
6. config.js: export LEVELS array with original English GCSE copy (tour, yourTurn, quiz×2), controlKind, scaleLabel like `x1 WHOLE BODY`, extraSlider for swap/burn. Also COPY for title/subtitle/sample note.
7. audio.js: WebAudio procedural SFX; resume on gesture; no Math.random (use seeded or fixed).
8. hud.js: build overlays into document.body (not replacing canvas); callbacks; HOLD button; extra slider; progress; quiz overlay.
9. style.css: dark #0a0c12, glass panels, fonts from vendor names only (`"Inter Variable"`, `"JetBrains Mono Variable"`, `"Space Grotesk Variable"`). Full bleed canvas. Phone-friendly. No external URLs.
10. No fetch/CDN/localStorage. No eval.

## Product
10-level Tour→Hands-on→Check GCSE O₂ journey. Interactive depth as in the provided TypeScript sources.

## Quality
Studio-grade. Full viewport canvas. Overlays ≤40% on phone. Contrasting text.

Emit complete working files. If a file would exceed ~200KB, split levels into levels-a.js and levels-b.js and import both from main.
