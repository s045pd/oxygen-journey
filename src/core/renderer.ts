/**
 * Oxygen Journey — studio renderer.
 *
 * Dark cinematic stage:
 *  - ACES Filmic tone mapping, sRGB output, HDR (half-float) composer chain
 *  - RenderPass → UnrealBloomPass (high threshold: only true HDR neon blooms) → OutputPass
 *  - Procedural dark-studio PMREM environment (warm softbox + two neon strips) so glass
 *    reads with crisp reflections instead of a grey ambient wash
 *  - Motivated key (warm spot) + accent rim + magenta counter-rim + low hemisphere fill
 *  - Far fog matched to the page background so the floor melts into black
 *
 * resetAtmosphere() restores fog / environment / exposure / bloom / lights between levels
 * so one level's tweaks never leak into the next. setFade() is a non-destructive
 * exposure dip used for stage transitions.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const STAGE_BG = 0x070a10;
export const STAGE_FOV = 35;
/** World-space height of the studio floor (body pelvis sits just above it). */
export const FLOOR_Y = -0.92;

export const STAGE_DEFAULTS = {
  exposure: 0.95,
  bloomStrength: 0.55,
  bloomRadius: 0.38,
  bloomThreshold: 0.9,
  fogNear: 12,
  fogFar: 44,
  envIntensity: 0.7,
} as const;

export interface RendererOptions {
  /** Use the post-processing chain (default true). Falls back to direct render on failure. */
  bloom?: boolean;
  bloomStrength?: number;
  bloomRadius?: number;
  bloomThreshold?: number;
  exposure?: number;
  /** Show the studio floor + neon pedestal rings (default true). */
  floor?: boolean;
  /** Initial accent colour for rim light and pedestal rings. */
  accent?: THREE.ColorRepresentation;
  /** Device-pixel-ratio cap (default 2). */
  maxDpr?: number;
}

export interface BloomSettings {
  strength: number;
  radius: number;
  threshold: number;
}

export interface StudioRig {
  group: THREE.Group;
  key: THREE.SpotLight;
  rim: THREE.DirectionalLight;
  counterRim: THREE.DirectionalLight;
  fill: THREE.HemisphereLight;
  floor: THREE.Mesh;
  rings: THREE.Group;
  /** Tint rim light + pedestal rings to the level accent. */
  setAccent(color: THREE.ColorRepresentation): void;
  setFloorVisible(visible: boolean): void;
  /** Scale overall light level (0..1.5). */
  setLevel(level: number): void;
  /** Restore authored positions, colours, intensities and floor visibility. */
  reset(): void;
}

export interface StageRenderer {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  clock: THREE.Clock;
  composer?: EffectComposer;
  bloom?: UnrealBloomPass;
  studio: StudioRig;
  /** Current CSS-pixel size and pixel ratio. */
  size: { width: number; height: number; dpr: number; portrait: boolean };
  render(scene?: THREE.Scene, cam?: THREE.Camera): void;
  onResize(): void;
  /** Subscribe to size changes. Returns an unsubscribe function. */
  onResized(cb: (width: number, height: number) => void): () => void;
  setBloom(settings: Partial<BloomSettings>): void;
  /** Non-destructive exposure multiplier for fades (0..1). */
  setFade(f: number): void;
  /** Restore fog, environment, exposure, bloom and studio lights to defaults. */
  resetAtmosphere(): void;
  dispose(): void;
}

/* -------------------------------------------------------------------------- */
/* Environment                                                                */
/* -------------------------------------------------------------------------- */

function buildStudioEnvironment(renderer: THREE.WebGLRenderer): THREE.WebGLRenderTarget {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();

  env.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(20, 32, 16),
      new THREE.MeshBasicMaterial({ color: 0x010205, side: THREE.BackSide }),
    ),
  );

  const panel = (
    w: number,
    h: number,
    color: THREE.ColorRepresentation,
    intensity: number,
    x: number,
    y: number,
    z: number,
  ): void => {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(intensity),
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    env.add(m);
  };

  // Warm key softbox, upper front-left.
  panel(6, 3.6, 0xfff1e2, 2.6, -6, 7, 6);
  // Neon strips behind — the glass rim reflections.
  panel(1.0, 10, 0x38f0ff, 1.8, 8, 1, -6);
  panel(1.0, 10, 0xff3fd0, 1.0, -8, 0.5, -6);
  // Thin cool top strip for a hairline highlight.
  panel(10, 0.7, 0xa9c4ff, 0.4, 0, 9, -1.5);
  // Very dark floor bounce so undersides are not pure black.
  panel(16, 16, 0x0a0f19, 1, 0, -6, 0);

  const rt = pmrem.fromScene(env, 0.04);

  env.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  });
  pmrem.dispose();
  return rt;
}

function makeRadialAlphaTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, size, size);
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, '#b0b0b0');
    g.addColorStop(0.7, '#303030');
    g.addColorStop(1, '#000000');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

/* -------------------------------------------------------------------------- */
/* Studio rig                                                                 */
/* -------------------------------------------------------------------------- */

function buildStudio(scene: THREE.Scene, accent: THREE.ColorRepresentation, showFloor: boolean): StudioRig {
  const group = new THREE.Group();
  group.name = 'StudioRig';

  // Key: warm, soft-edged spot from upper front-left (candela, physical units).
  const key = new THREE.SpotLight(0xfff0dc, 56, 0, 0.52, 0.85, 2);
  key.position.set(-3.1, 4.2, 4.1);
  key.target.position.set(0, -0.1, 0);
  group.add(key, key.target);

  // Rim: accent-coloured edge light from behind-right.
  const rim = new THREE.DirectionalLight(accent, 2.6);
  rim.position.set(3.2, 2.1, -4.2);
  group.add(rim);

  // Counter rim: magenta kiss from behind-left for neon separation.
  const counterRim = new THREE.DirectionalLight(0xff3fd0, 1.05);
  counterRim.position.set(-3.6, 0.9, -3.2);
  group.add(counterRim);

  // Modest ambient: cool sky, near-black ground. Low to avoid grey wash.
  const fill = new THREE.HemisphereLight(0x1a2a44, 0x030407, 0.22);
  group.add(fill);

  const base = {
    key: key.intensity,
    rim: rim.intensity,
    counterRim: counterRim.intensity,
    fill: fill.intensity,
    keyColor: key.color.clone(),
    keyPos: key.position.clone(),
    keyTarget: key.target.position.clone(),
    keyAngle: key.angle,
    keyPenumbra: key.penumbra,
    rimColor: rim.color.clone(),
    rimPos: rim.position.clone(),
    counterColor: counterRim.color.clone(),
    counterPos: counterRim.position.clone(),
    fillSky: fill.color.clone(),
    fillGround: fill.groundColor.clone(),
  };

  // Floor: dark satin disc with radial alpha falloff, catches the key pool.
  const alpha = makeRadialAlphaTexture();
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x0a0e16,
    roughness: 0.55,
    metalness: 0.05,
    alphaMap: alpha,
    transparent: true,
    depthWrite: false,
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(5.5, 96), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  floor.renderOrder = -2;
  group.add(floor);

  // Neon pedestal rings (HDR colour so bloom catches them softly).
  const rings = new THREE.Group();
  rings.position.y = FLOOR_Y + 0.002;
  const ringMats: THREE.MeshBasicMaterial[] = [];
  const ringDefs: [number, number, number, number][] = [
    // inner, outer, opacity, hdr gain
    [0.54, 0.552, 0.6, 1.6],
    [0.86, 0.864, 0.22, 1.2],
    [1.32, 1.3225, 0.1, 1.0],
  ];
  for (const [inner, outer, opacity, gain] of ringDefs) {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(accent).multiplyScalar(gain),
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
    });
    mat.userData.gain = gain;
    ringMats.push(mat);
    const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 160), mat);
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = -1;
    rings.add(ring);
  }
  group.add(rings);

  floor.visible = rings.visible = showFloor;
  scene.add(group);

  const setLevel = (level: number): void => {
    const l = THREE.MathUtils.clamp(level, 0, 1.5);
    key.intensity = base.key * l;
    rim.intensity = base.rim * l;
    counterRim.intensity = base.counterRim * l;
    fill.intensity = base.fill * l;
  };

  return {
    group,
    key,
    rim,
    counterRim,
    fill,
    floor,
    rings,
    setAccent(color) {
      rim.color.set(color);
      for (const m of ringMats) m.color.set(color).multiplyScalar(m.userData.gain as number);
    },
    setFloorVisible(visible) {
      floor.visible = visible;
      rings.visible = visible;
    },
    setLevel,
    reset() {
      group.visible = true;
      key.color.copy(base.keyColor);
      key.position.copy(base.keyPos);
      key.target.position.copy(base.keyTarget);
      key.angle = base.keyAngle;
      key.penumbra = base.keyPenumbra;
      rim.color.copy(base.rimColor);
      rim.position.copy(base.rimPos);
      counterRim.color.copy(base.counterColor);
      counterRim.position.copy(base.counterPos);
      fill.color.copy(base.fillSky);
      fill.groundColor.copy(base.fillGround);
      setLevel(1);
      floor.visible = rings.visible = showFloor;
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Renderer                                                                   */
/* -------------------------------------------------------------------------- */

type SceneWithEnvIntensity = THREE.Scene & { environmentIntensity?: number };

export function createRenderer(container: HTMLElement, options: RendererOptions = {}): StageRenderer {
  const opts = {
    bloom: options.bloom ?? true,
    bloomStrength: options.bloomStrength ?? STAGE_DEFAULTS.bloomStrength,
    bloomRadius: options.bloomRadius ?? STAGE_DEFAULTS.bloomRadius,
    bloomThreshold: options.bloomThreshold ?? STAGE_DEFAULTS.bloomThreshold,
    exposure: options.exposure ?? STAGE_DEFAULTS.exposure,
    floor: options.floor ?? true,
    accent: options.accent ?? (0x38f0ff as THREE.ColorRepresentation),
    maxDpr: options.maxDpr ?? 2,
  };

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = opts.exposure;
  renderer.setClearColor(STAGE_BG, 1);

  const canvas = renderer.domElement;
  canvas.classList.add('webgl');
  canvas.setAttribute('aria-label', '3D lesson stage');
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  container.prepend(canvas);

  const scene = new THREE.Scene() as SceneWithEnvIntensity;
  const bgColor = new THREE.Color(STAGE_BG);
  scene.background = bgColor;
  const baseFog = new THREE.Fog(STAGE_BG, STAGE_DEFAULTS.fogNear, STAGE_DEFAULTS.fogFar);
  scene.fog = baseFog;

  const envRT = buildStudioEnvironment(renderer);
  scene.environment = envRT.texture;
  scene.environmentIntensity = STAGE_DEFAULTS.envIntensity;

  const camera = new THREE.PerspectiveCamera(STAGE_FOV, 1, 0.03, 120);
  camera.position.set(0, 0.08, 3.6);
  camera.lookAt(0, 0.04, 0);

  const studio = buildStudio(scene, opts.accent, opts.floor);
  const clock = new THREE.Clock();

  const size = { width: 1, height: 1, dpr: 1, portrait: false };
  const listeners = new Set<(w: number, h: number) => void>();
  let fade = 1;

  const measure = (): { w: number; h: number } => {
    const r = container.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width || window.innerWidth));
    const h = Math.max(1, Math.round(r.height || window.innerHeight));
    return { w, h };
  };
  const pixelRatio = (): number => Math.min(window.devicePixelRatio || 1, opts.maxDpr);

  // ---- Post chain -------------------------------------------------------
  let composer: EffectComposer | undefined;
  let renderPass: RenderPass | undefined;
  let bloom: UnrealBloomPass | undefined;
  let outputPass: OutputPass | undefined;

  if (opts.bloom) {
    try {
      const { w, h } = measure();
      const dpr = pixelRatio();
      const target = new THREE.WebGLRenderTarget(Math.round(w * dpr), Math.round(h * dpr), {
        type: THREE.HalfFloatType,
        samples: dpr >= 2 ? 2 : 4,
      });
      composer = new EffectComposer(renderer, target);
      renderPass = new RenderPass(scene, camera);
      bloom = new UnrealBloomPass(new THREE.Vector2(w, h), opts.bloomStrength, opts.bloomRadius, opts.bloomThreshold);
      outputPass = new OutputPass();
      composer.addPass(renderPass);
      composer.addPass(bloom);
      composer.addPass(outputPass);
    } catch (err) {
      console.warn('[renderer] post-processing unavailable, rendering direct.', err);
      composer?.dispose();
      composer = undefined;
      renderPass = undefined;
      bloom = undefined;
      outputPass = undefined;
    }
  }

  // ---- Resize -----------------------------------------------------------
  const onResize = (): void => {
    const { w, h } = measure();
    const dpr = pixelRatio();
    const changed = w !== size.width || h !== size.height || dpr !== size.dpr;
    size.width = w;
    size.height = h;
    size.dpr = dpr;
    size.portrait = h > w;

    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);

    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    if (composer) {
      composer.setPixelRatio(dpr);
      composer.setSize(w, h);
    }
    if (changed) listeners.forEach((cb) => cb(w, h));
  };

  let resizeQueued = false;
  const queueResize = (): void => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      onResize();
    });
  };

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(queueResize) : null;
  ro?.observe(container);
  window.addEventListener('resize', queueResize);
  window.visualViewport?.addEventListener('resize', queueResize);
  onResize();

  // ---- Context loss -----------------------------------------------------
  const onLost = (e: Event): void => {
    e.preventDefault();
    console.warn('[renderer] WebGL context lost');
  };
  const onRestored = (): void => onResize();
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  // ---- API --------------------------------------------------------------
  const render = (sc: THREE.Scene = scene, cam: THREE.Camera = camera): void => {
    const authored = renderer.toneMappingExposure;
    if (fade < 0.999) renderer.toneMappingExposure = authored * fade;
    if (composer && renderPass) {
      renderPass.scene = sc;
      renderPass.camera = cam;
      composer.render();
    } else {
      renderer.render(sc, cam);
    }
    renderer.toneMappingExposure = authored;
  };

  const setBloom = (s: Partial<BloomSettings>): void => {
    if (!bloom) return;
    if (s.strength !== undefined) bloom.strength = s.strength;
    if (s.radius !== undefined) bloom.radius = s.radius;
    if (s.threshold !== undefined) bloom.threshold = s.threshold;
  };

  const resetAtmosphere = (): void => {
    bgColor.set(STAGE_BG);
    scene.background = bgColor;
    baseFog.color.set(STAGE_BG);
    baseFog.near = STAGE_DEFAULTS.fogNear;
    baseFog.far = STAGE_DEFAULTS.fogFar;
    scene.fog = baseFog;
    scene.environment = envRT.texture;
    scene.environmentIntensity = STAGE_DEFAULTS.envIntensity;
    renderer.toneMappingExposure = opts.exposure;
    setBloom({ strength: opts.bloomStrength, radius: opts.bloomRadius, threshold: opts.bloomThreshold });
    studio.reset();
  };

  const dispose = (): void => {
    ro?.disconnect();
    listeners.clear();
    window.removeEventListener('resize', queueResize);
    window.visualViewport?.removeEventListener('resize', queueResize);
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', onRestored);

    studio.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.alphaMap?.dispose();
        mat.dispose();
      }
    });
    bloom?.dispose();
    outputPass?.dispose();
    composer?.dispose();
    envRT.dispose();
    renderer.dispose();
    canvas.remove();
  };

  return {
    renderer,
    camera,
    scene,
    clock,
    composer,
    bloom,
    studio,
    size,
    render,
    onResize,
    onResized(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    setBloom,
    setFade(f) {
      fade = THREE.MathUtils.clamp(f, 0, 1);
    },
    resetAtmosphere,
    dispose,
  };
}