/**
 * Oxygen Journey — level scene base class.
 *
 * Each level owns:
 *  - `root`: a Group added to the shared studio scene on enter (so it inherits the
 *    studio key/rim lights, dark PMREM environment and fog), removed on exit.
 *  - its own PerspectiveCamera (~35°), auto-framed around `framing` with a slow
 *    cinematic drift and a HUD-safe view offset so the subject sits above the card.
 *
 * The app renders with getCamera() every frame and calls setViewport() on resize and
 * level change, which keeps aspect + view offset in sync.
 */
import * as THREE from 'three';
import type { ControlInput, LevelDef, LevelPhase, Readout, ReadoutStatus } from '../types';
import type { StudioRig } from '../core/renderer';
import type { GlassTorso } from '../core/body';
import type { DragInfo } from '../ui/hud';

export const LEVEL_FOV = 35;

export interface LevelContext {
  def: LevelDef;
  /** Shared studio scene (lights, environment, fog). Add content via `root`. */
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  studio: StudioRig;
  /** Shared glass torso. Visible only when the level sets `showsBody = true`. */
  torso: GlassTorso;
  accent: THREE.Color;
  lowPower: boolean;
}

export interface Framing {
  /** World point the camera looks at. */
  target: THREE.Vector3;
  /** Radius of the subject sphere that must fit in view. */
  radius: number;
  /** Direction from target to camera (normalised internally). */
  dir: THREE.Vector3;
  /** Drift amplitude in radians (slow orbit sway). */
  drift: number;
  /** Camera easing rate (higher = snappier). */
  ease: number;
  minDistance: number;
}

export function createControlInput(extra = 0.5): ControlInput {
  return {
    holding: false,
    holdTime: 0,
    tapsThisFrame: 0,
    tapCount: 0,
    dragging: false,
    dragDX: 0,
    dragDY: 0,
    slider: 0,
    extra,
  };
}

export function resetControlInput(input: ControlInput, extra = 0.5): void {
  Object.assign(input, createControlInput(extra));
}

/**
 * Vertical view offset (px) that lifts the subject clear of the bottom HUD card.
 * Portrait phones: the card owns roughly the bottom quarter, the header ~8%, so the
 * visual centre of the free area sits ~11% above screen centre.
 */
export function hudSafeShift(w: number, h: number): number {
  const portrait = h > w;
  return Math.round(h * (portrait ? 0.11 : w < 900 ? 0.06 : 0.03));
}

/** Sync aspect and apply the HUD-safe view offset. Cheap when nothing changed. */
export function applyHudSafeFraming(cam: THREE.PerspectiveCamera, w: number, h: number): void {
  const W = Math.max(1, Math.round(w));
  const H = Math.max(1, Math.round(h));
  const shift = hudSafeShift(W, H);
  const v = cam.view;
  if (
    v &&
    v.enabled &&
    v.fullWidth === W &&
    v.fullHeight === H &&
    v.width === W &&
    v.height === H &&
    v.offsetX === 0 &&
    v.offsetY === shift &&
    Math.abs(cam.aspect - W / H) < 1e-6
  ) {
    return;
  }
  // setViewOffset sets aspect = W / H and updates the projection matrix.
  cam.setViewOffset(W, H, 0, shift, W, H);
}

/** Dispose geometries, materials and textures under an object. */
export function disposeObject3D(obj: THREE.Object3D): void {
  const mats = new Set<THREE.Material>();
  obj.traverse((o) => {
    const node = o as THREE.Object3D & {
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material | THREE.Material[];
    };
    node.geometry?.dispose();
    if (Array.isArray(node.material)) node.material.forEach((m) => mats.add(m));
    else if (node.material) mats.add(node.material);
    if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
  });
  for (const m of mats) {
    for (const value of Object.values(m)) {
      if (value instanceof THREE.Texture) value.dispose();
    }
    const uniforms = (m as THREE.ShaderMaterial).uniforms;
    if (uniforms) {
      for (const u of Object.values(uniforms)) {
        if (u && u.value instanceof THREE.Texture) u.value.dispose();
      }
    }
    m.dispose();
  }
}

const _dir = new THREE.Vector3();
const _goal = new THREE.Vector3();
const _Y = new THREE.Vector3(0, 1, 0);
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export abstract class LevelScene {
  readonly root = new THREE.Group();
  /** Show the shared glass torso while this level is active. */
  showsBody = false;

  protected readonly camera: THREE.PerspectiveCamera;
  protected ctx: LevelContext | null = null;
  protected phase: LevelPhase = 'tour';
  protected tourBeat = 0;
  protected input: ControlInput = createControlInput();
  protected time = 0;
  /** Disable to drive the camera manually in tick(). */
  protected autoFrame = true;
  protected readonly framing: Framing = {
    target: new THREE.Vector3(0, 0.05, 0),
    radius: 0.75,
    dir: new THREE.Vector3(0, 0.12, 1),
    drift: 0.09,
    ease: 2.4,
    minDistance: 0.4,
  };

  private readonly look = new THREE.Vector3();
  private camReady = false;
  private vpW = 0;
  private vpH = 0;

  constructor(fov = LEVEL_FOV) {
    this.camera = new THREE.PerspectiveCamera(fov, 1, 0.01, 120);
    this.camera.position.set(0, 0.1, 3.6);
    this.root.name = 'LevelRoot';
  }

  protected get def(): LevelDef {
    if (!this.ctx) throw new Error('LevelScene used before enter()');
    return this.ctx.def;
  }

  /** Canvas CSS width last passed to setViewport. */
  protected get viewportWidth(): number {
    return this.vpW;
  }

  /** Canvas CSS height last passed to setViewport. */
  protected get viewportHeight(): number {
    return this.vpH;
  }

  getCamera(): THREE.PerspectiveCamera | null {
    return this.camera;
  }

  /**
   * Called by the app with the canvas CSS size (every frame, on resize and on level
   * change). Re-applies aspect + HUD-safe offset when size or aspect drift.
   */
  setViewport(w: number, h: number, force = false): void {
    const W = Math.max(1, Math.round(w));
    const H = Math.max(1, Math.round(h));
    const aspectOk = Math.abs(this.camera.aspect - W / H) < 1e-4;
    if (!force && W === this.vpW && H === this.vpH && aspectOk) return;
    this.vpW = W;
    this.vpH = H;
    applyHudSafeFraming(this.camera, W, H);
    this.onResize(W, H);
  }

  enter(ctx: LevelContext): void {
    this.ctx = ctx;
    this.camReady = false;
    this.vpW = this.vpH = 0;
    this.phase = 'tour';
    this.tourBeat = 0;
    ctx.scene.add(this.root);
    this.root.visible = true;
    this.onEnter(ctx);
  }

  exit(): void {
    this.onExit();
    this.root.removeFromParent();
  }

  setPhase(phase: LevelPhase): void {
    this.phase = phase;
    this.onPhase(phase);
  }

  setTourBeat(beat: number): void {
    this.tourBeat = beat;
    this.onTourBeat(beat);
  }

  update(dt: number, time: number, input: ControlInput): void {
    this.input = input;
    this.time = time;
    this.tick(dt, time, input);
    if (this.autoFrame) this.updateFraming(dt, time);
  }

  /* ---- Input hooks (override as needed) ---- */
  onHoldStart(): void {}
  onHoldEnd(): void {}
  onTap(): void {}
  onSlider(_v: number): void {}
  onExtraSlider(_v: number): void {}
  onDrag(_e: DragInfo): void {}

  /** Live readout for the HUD. Return status 'done' when the hands-on goal is met. */
  abstract getReadout(): Readout;

  /* ---- Lifecycle hooks ---- */
  protected onEnter(_ctx: LevelContext): void {}
  protected onExit(): void {}
  protected onPhase(_phase: LevelPhase): void {}
  protected onTourBeat(_beat: number): void {}
  protected onResize(_w: number, _h: number): void {}
  protected tick(_dt: number, _time: number, _input: ControlInput): void {}

  /** Build a Readout from the level's spec. Status auto-resolves to 'done' at target. */
  protected makeReadout(
    value: number,
    opts: { status?: ReadoutStatus; note?: string; active?: boolean; progress?: number } = {},
  ): Readout {
    const spec = this.def.readout;
    const span = spec.max - spec.min || 1;
    const v = Number.isFinite(value) ? value : spec.min;
    const progress = clamp01(opts.progress ?? (v - spec.min) / span);
    const rounded = Number(v.toFixed(spec.decimals));
    const status: ReadoutStatus =
      opts.status ?? (rounded >= spec.target ? 'done' : opts.active ? 'active' : 'idle');
    return { label: spec.label, value: v, unit: spec.unit, progress, status, note: opts.note };
  }

  /** Jump the camera to its framing goal next frame (no easing). */
  protected snapCamera(): void {
    this.camReady = false;
  }

  private updateFraming(dt: number, time: number): void {
    const f = this.framing;
    const cam = this.camera;
    const vHalf = THREE.MathUtils.degToRad(cam.fov) * 0.5;
    const hHalf = Math.atan(Math.tan(vHalf) * cam.aspect);
    const half = Math.max(0.05, Math.min(vHalf, hHalf));
    // Portrait: leave room for the right-edge scale clock.
    const pad = cam.aspect < 1 ? 1.12 : 1.0;
    const dist = Math.max(f.minDistance, (f.radius * pad) / Math.sin(half));

    _dir.copy(f.dir).normalize().applyAxisAngle(_Y, Math.sin(time * 0.11) * f.drift);
    _dir.y += Math.sin(time * 0.07) * f.drift * 0.35;
    _dir.normalize();
    _goal.copy(f.target).addScaledVector(_dir, dist);

    if (!this.camReady) {
      cam.position.copy(_goal);
      this.look.copy(f.target);
      this.camReady = true;
    } else {
      const k = 1 - Math.exp(-Math.max(0, dt) * f.ease);
      cam.position.lerp(_goal, k);
      this.look.lerp(f.target, k);
    }
    cam.lookAt(this.look);
  }

  dispose(): void {
    this.root.removeFromParent();
    disposeObject3D(this.root);
    this.root.clear();
    this.ctx = null;
  }
}