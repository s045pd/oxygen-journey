# REDO 1b — renderer / body / scale / audio

Write ONLY these core modules. Dark studio, neon bloom-ready.

1. `src/core/renderer.ts` — createRenderer(container) returns { renderer, camera, scene, clock, composer?, render(scene,cam), onResize, dispose }. ACESFilmic + SRGBColorSpace. Fog matching #070a10 far. Prefer EffectComposer+RenderPass+UnrealBloomPass+OutputPass from `three/addons/postprocessing/*` (and `three/addons/postprocessing/OutputPass.js`). FOV ~35°. setPixelRatio min(dpr,2).
2. `src/core/body.ts` — createGlassTorso(): detailed procedural translucent torso+neck+head hint (lathe/capsules), subtle emissive spine. MeshPhysicalMaterial transmission.
3. `src/core/scaleRing.ts` — mountScaleRing(el), setScale(label, t 0..1). Compact right-edge dial (SVG or canvas). Needle eases.
4. `src/audio/sfx.ts` — WebAudio: inhale,exhale,tap,success,fail,whoosh; resume() on gesture.

Emit ---FILE--- only. Prefer emitting files quickly.
