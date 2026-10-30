/**
 * Level 10 — "Out": breathe out through limewater.
 *
 * Hold = exhale. CO₂-rich breath bubbles through flask B and the limewater turns milky
 * (insoluble calcium carbonate forms). Releasing breathes in through flask A, so room air
 * bubbles through it, and that flask barely clouds. Cloudiness of flask B is the readout.
 *
 * All geometry is procedural.
 */
import * as THREE from 'three';
import type { ControlInput, LevelPhase, Readout, ReadoutStatus } from '../types';
import { LevelScene, type LevelContext } from './base';
import {
  clamp01,
  damp,
  frac,
  fresnelMaterial,
  glassMaterial,
  glowPointsMaterial,
  glowTexture,
  lerp,
  lineMaterial,
  neonMaterial,
  rng,
  setFresnel,
  smoothstep,
} from './neon';

/* ------------------------------------------------------------------ */
/* Layout constants (world units)                                      */
/* ------------------------------------------------------------------ */

const BENCH_Y = -0.55;
const FLASK_X = 0.55;
const TUBE_OFF = 0.025;
const FILL_H = 0.22;
const TIP_H = 0.05;
const TIP_Y = BENCH_Y + TIP_H;
const HEAD_Y = -0.2;
const JUNCTION_Y = 0.92;
const ARCH_Y = 0.975;
const LUNG_Y = 0.46;
const LUNG_SECONDS = 3.4;
const REFILL_SECONDS = 1.8;
const BUBBLE_POOL = 44;

const COL_CO2 = new THREE.Color(0xff4fd8);
const COL_AIR = new THREE.Color(0x4fe3ff);
const COL_LUNG = new THREE.Color(0xff5a7a);
const COL_WARN = new THREE.Color(0xffb020);
const COL_OUTLET = new THREE.Color(0xb57bff);
const LIQ_CLEAR = new THREE.Color(0x0d3f4c);
const LIQ_MILK = new THREE.Color(0xc2ced4);
const EMI_CLEAR = new THREE.Color(0x0b4656);
const EMI_MILK = new THREE.Color(0x2e3a42);

/** Conical flask outer profile (radius, height above base). */
const OUTER_PROFILE: ReadonlyArray<readonly [number, number]> = [
  [0.001, 0],
  [0.2, 0],
  [0.218, 0.012],
  [0.222, 0.035],
  [0.075, 0.41],
  [0.066, 0.44],
  [0.066, 0.6],
  [0.078, 0.615],
  [0.078, 0.635],
  [0.064, 0.64],
];

const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _c = new THREE.Color();
const _c2 = new THREE.Color();
const _Z = new THREE.Vector3(0, 0, 1);
const _X = new THREE.Vector3(1, 0, 0);

const v3 = (x: number, y: number, z = 0): THREE.Vector3 => new THREE.Vector3(x, y, z);

function flaskRadiusAt(h: number): number {
  if (h <= 0.035) return 0.222;
  if (h >= 0.41) return 0.075;
  return lerp(0.222, 0.075, (h - 0.035) / (0.41 - 0.035));
}

function setUniform(mat: THREE.ShaderMaterial, name: string, value: number): void {
  const u = mat.uniforms[name];
  if (u) u.value = value;
}

function setUniformColor(mat: THREE.ShaderMaterial, name: string, c: THREE.Color): void {
  const u = mat.uniforms[name];
  if (u && u.value instanceof THREE.Color) u.value.copy(c);
}

function sampleLut(lut: THREE.Vector3[], t: number, out: THREE.Vector3): THREE.Vector3 {
  const m = lut.length - 1;
  if (m < 1) return out.set(0, 0, 0);
  const f = clamp01(t) * m;
  const i = Math.min(m - 1, Math.floor(f));
  const a = lut[i];
  const b = lut[i + 1];
  if (!a || !b) return out.set(0, 0, 0);
  return out.copy(a).lerp(b, f - i);
}

/** Flat ring gauge on the bench: segmented arc fill + target tick. */
function gaugeMaterial(color: THREE.Color, target: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uProgress: { value: 0 },
      uColor: { value: color.clone() },
      uTarget: { value: target },
      uGlow: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vP;
      void main() {
        vP = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uProgress;
      uniform vec3 uColor;
      uniform float uTarget;
      uniform float uGlow;
      varying vec2 vP;
      void main() {
        float a = fract(atan(vP.x, -vP.y) / 6.2831853 + 1.0);
        float fill = step(a, uProgress);
        float s = fract(a * 48.0);
        float seg = smoothstep(0.0, 0.08, s) * (1.0 - smoothstep(0.84, 1.0, s));
        float tick = 1.0 - smoothstep(0.0, 0.006, abs(a - uTarget));
        vec3 col = uColor * (0.1 + fill * 1.35 * uGlow) * mix(0.35, 1.0, seg);
        col += vec3(1.0) * tick * 1.3;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/** Two-line neon caption on a canvas (procedural, no assets). */
function makeLabel(line1: string, line2: string, css: string): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  if (g) {
    g.clearRect(0, 0, 512, 128);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = css;
    g.shadowBlur = 18;
    g.fillStyle = css;
    g.font = '700 44px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    g.fillText(line1, 256, 42);
    g.shadowBlur = 6;
    g.fillStyle = 'rgba(232,242,255,0.88)';
    g.font = '500 34px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    g.fillText(line2, 256, 96);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.115), mat);
  mesh.renderOrder = 6;
  return mesh;
}

/** Lung lobe: tapered apex, flattened medial face, flatter diaphragm base. */
function lobeGeometry(side: number, seg: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7));
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const taper = 0.6 + 0.4 * smoothstep(1.0, -0.3, y);
    let nx = x * taper;
    const nz = z * taper;
    if (nx * side < 0) nx *= 0.55;
    const ny = y < -0.5 ? -0.5 + (y + 0.5) * 0.55 : y;
    p.setXYZ(i, nx, ny, nz);
  }
  g.computeVertexNormals();
  return g;
}

/** Procedural bronchial tree as line segments, clipped to the lobe volume. */
function bronchialTree(side: number, seed: number, depth: number): THREE.BufferGeometry {
  const r = rng(seed);
  const pts: number[] = [];
  const cx = side * 0.13;
  const inside = (q: THREE.Vector3): boolean =>
    ((q.x - cx) / 0.1) ** 2 + (q.y / 0.17) ** 2 + (q.z / 0.08) ** 2 < 1;
  const grow = (o: THREE.Vector3, d: THREE.Vector3, len: number, lvl: number): void => {
    const e = o.clone().addScaledVector(d, len);
    if (lvl !== depth && !inside(e)) return;
    pts.push(o.x, o.y, o.z, e.x, e.y, e.z);
    if (lvl === 0) return;
    for (let k = 0; k < 2; k++) {
      const ang = (k === 0 ? 1 : -1) * (0.35 + r() * 0.4);
      const nd = d
        .clone()
        .applyAxisAngle(_Z, ang)
        .applyAxisAngle(_X, (r() - 0.5) * 0.6)
        .normalize();
      grow(e, nd, len * (0.68 + r() * 0.12), lvl - 1);
    }
  };
  grow(v3(side * 0.06, 0.11, 0), v3(side * 0.55, -1, 0).normalize(), 0.075, depth);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return geo;
}

/* ------------------------------------------------------------------ */
/* Tube / path control points                                          */
/* ------------------------------------------------------------------ */

const LONG_B = FLASK_X - TUBE_OFF; // exhale tube into B (dips under liquid)
const SHORT_B = FLASK_X + TUBE_OFF; // B outlet (headspace → room)
const SHORT_A = -FLASK_X + TUBE_OFF; // A headspace → mouth
const LONG_A = -FLASK_X - TUBE_OFF; // A inlet (room → under liquid)

const mouthToB = (): THREE.Vector3[] => [
  v3(0, JUNCTION_Y),
  v3(0.16, ARCH_Y),
  v3(0.42, ARCH_Y),
  v3(LONG_B, 0.88),
  v3(LONG_B, 0.55),
  v3(LONG_B, 0.0),
  v3(LONG_B, TIP_Y),
];
const outletB = (): THREE.Vector3[] => [
  v3(SHORT_B, HEAD_Y),
  v3(SHORT_B, 0.15),
  v3(0.6, 0.235),
  v3(0.68, 0.27),
  v3(0.8, 0.275),
];
const mouthToA = (): THREE.Vector3[] => [
  v3(0, JUNCTION_Y),
  v3(-0.16, ARCH_Y),
  v3(-0.42, ARCH_Y),
  v3(SHORT_A, 0.88),
  v3(SHORT_A, 0.5),
  v3(SHORT_A, HEAD_Y),
];
const inletA = (): THREE.Vector3[] => [
  v3(-0.8, 0.275),
  v3(-0.68, 0.27),
  v3(-0.6, 0.235),
  v3(LONG_A, 0.15),
  v3(LONG_A, HEAD_Y),
  v3(LONG_A, TIP_Y),
];

const lobeCore = (side: number): THREE.Vector3 => v3(side * 0.13, LUNG_Y - 0.02);
const hilum = (side: number): THREE.Vector3 => v3(side * 0.065, LUNG_Y + 0.11);
const CARINA = v3(0, LUNG_Y + 0.17);

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface Bubble {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r: number;
  ph: number;
}

interface Speck {
  r: number;
  ang: number;
  h: number;
  spd: number;
  wob: number;
}

interface FlaskRig {
  group: THREE.Group;
  tipLX: number;
  liquidMat: THREE.MeshStandardMaterial;
  shellMat: THREE.ShaderMaterial;
  surface: THREE.Mesh;
  surfaceMat: THREE.MeshStandardMaterial;
  baseRingMat: THREE.MeshStandardMaterial;
  gauge: THREE.ShaderMaterial;
  bubbles: Bubble[];
  bubbleMesh: THREE.InstancedMesh;
  spawnAcc: number;
  ripple: number;
  specks: Speck[];
  precipGeo: THREE.BufferGeometry;
  precipMat: THREE.PointsMaterial;
  tipGlow: THREE.Sprite;
  tipGlowMat: THREE.SpriteMaterial;
}

interface Stream {
  lut: THREE.Vector3[];
  offsets: number[];
  phase: number;
  speed: number;
  color: THREE.Color;
  geo: THREE.BufferGeometry;
  mat: THREE.PointsMaterial;
  points: THREE.Points;
  kind: 'out' | 'in';
}

type Focus = 'all' | 'lungs' | 'flask';

/* ------------------------------------------------------------------ */
/* Level                                                               */
/* ------------------------------------------------------------------ */

export class Level10Out extends LevelScene {
  private built = false;
  private fA!: FlaskRig;
  private fB!: FlaskRig;
  private streams: Stream[] = [];
  private lungs!: THREE.Group;
  private lobeMat!: THREE.MeshPhysicalMaterial;
  private lobeShell!: THREE.ShaderMaterial;
  private treeMat!: THREE.LineBasicMaterial;
  private alvMat!: THREE.PointsMaterial;
  private ringMat!: THREE.MeshStandardMaterial;
  private stripMat!: THREE.MeshStandardMaterial;
  private light: THREE.PointLight | null = null;
  private rand = rng(1010);

  /* simulation state */
  private air = 1;
  private flowOut = 0;
  private flowIn = 0;
  private lungsEmpty = false;
  private cloudB = 0;
  private cloudA = 0;
  private demoB = 0;
  private demoA = 0;
  private visB = 0;
  private visA = 0;
  private wasDone = false;
  private doneFlash = 0;
  private hlL = 0;
  private hlA = 0;
  private hlB = 0;

  constructor() {
    super();
    this.framing.target.set(0, 0.14, 0);
    this.framing.radius = 1.0;
    this.framing.dir.set(0, 0.28, 1);
    this.framing.drift = 0.08;
    this.framing.ease = 1.8;
    this.framing.minDistance = 0.8;
  }

  /* ---------------- lifecycle ---------------- */

  protected override onEnter(ctx: LevelContext): void {
    if (!this.built) this.build(ctx);
    this.air = 1;
    this.flowOut = 0;
    this.flowIn = 0;
    this.cloudA = 0;
    this.cloudB = 0;
    this.demoA = 0;
    this.demoB = 0;
    this.visA = 0;
    this.visB = 0;
    this.wasDone = false;
    this.doneFlash = 0;
    this.lungsEmpty = false;
    this.setFocus('all');
    this.snapCamera();
  }

  protected override onPhase(phase: LevelPhase): void {
    if (phase === 'handsOn') {
      if (this.cloudB < this.targetValue()) {
        this.cloudB = 0;
        this.cloudA = 0;
        this.wasDone = false;
      }
      this.air = 1;
      this.demoA = 0;
      this.demoB = 0;
      this.setFocus('all');
    } else if (phase === 'check') {
      this.setFocus('all');
    } else {
      this.setFocus(this.focusForBeat(this.tourBeat));
    }
  }

  protected override onTourBeat(beat: number): void {
    if (this.phase === 'tour') this.setFocus(this.focusForBeat(beat));
  }

  override dispose(): void {
    super.dispose();
    this.built = false;
    this.streams = [];
    this.light = null;
  }

  /* ---------------- readout ---------------- */

  override getReadout(): Readout {
    if (!this.ctx) {
      return { label: 'Cloudiness', value: 0, unit: '%', progress: 0, status: 'idle' };
    }
    const target = this.targetValue();
    const v = this.cloudB;
    const opts: { status?: ReadoutStatus; note?: string; active?: boolean } = {
      active: this.flowOut > 0.05,
    };
    if (v >= target) {
      opts.note = 'MILKY · CO₂ DETECTED';
    } else if (this.phase === 'handsOn') {
      if (this.lungsEmpty) {
        opts.note = 'LUNGS EMPTY · LET GO';
        opts.status = 'warn';
      } else if (this.flowOut > 0.08) {
        opts.note = 'BREATHING OUT · ~4% CO₂';
      } else if (this.flowIn > 0.08) {
        opts.note = 'BREATHING IN · ~0.04% CO₂';
      } else {
        opts.note = 'HOLD TO BREATHE OUT';
      }
    }
    return this.makeReadout(v, opts);
  }

  /* ---------------- per-frame ---------------- */

  protected override tick(dt: number, time: number, input: ControlInput): void {
    if (!this.built) return;
    const step = Math.min(0.05, Math.max(0, dt));
    const phase = this.phase;
    const holding =
      phase === 'handsOn' ? input.holding : phase === 'tour' ? frac(time / 5.2) < 0.45 : false;

    // Lungs: hold empties them, release refills.
    if (holding) this.air = Math.max(0, this.air - step / LUNG_SECONDS);
    else this.air = Math.min(1, this.air + step / REFILL_SECONDS);
    const outGoal = holding ? smoothstep(0, 0.1, this.air) : 0;
    const inGoal = !holding && this.air < 0.995 ? 0.35 + 0.65 * (1 - this.air) : 0;
    this.flowOut = damp(this.flowOut, outGoal, 9, step);
    this.flowIn = damp(this.flowIn, inGoal, 7, step);
    this.lungsEmpty = phase === 'handsOn' && holding && this.air <= 0.02;

    // Cloudiness.
    const target = this.targetValue();
    if (phase === 'handsOn') {
      const rate = 15 * (1 - (0.35 * this.cloudB) / 100);
      this.cloudB = Math.min(100, this.cloudB + this.flowOut * step * rate);
      this.cloudA = Math.min(12, this.cloudA + this.flowIn * step * 0.3);
      if (!this.wasDone && this.cloudB >= target) {
        this.wasDone = true;
        this.doneFlash = 1;
      }
    } else if (phase === 'tour') {
      this.demoB = Math.min(40, this.demoB + this.flowOut * step * 7);
      this.demoA = Math.min(4, this.demoA + this.flowIn * step * 0.3);
    }
    const showB = phase === 'tour' ? this.demoB : this.cloudB;
    const showA = phase === 'tour' ? this.demoA : this.cloudA;
    this.visB = damp(this.visB, showB / 100, 3, step);
    this.visA = damp(this.visA, showA / 100, 3, step);
    this.doneFlash = Math.max(0, this.doneFlash - step * 0.7);

    // Tour highlights.
    let gL = 0;
    let gA = 0;
    let gB = 0;
    if (phase === 'tour') {
      if (this.tourBeat === 1) gL = 1;
      else if (this.tourBeat === 2) gB = 1;
      else if (this.tourBeat >= 3) {
        gA = 1;
        gB = 1;
      }
    } else if (phase === 'handsOn') {
      gB = 0.35 + 0.45 * this.flowOut;
      gA = 0.3 * this.flowIn;
    }
    this.hlL = damp(this.hlL, gL, 3, step);
    this.hlA = damp(this.hlA, gA, 3, step);
    this.hlB = damp(this.hlB, gB, 3, step);

    this.updateFlask(this.fB, this.flowOut, this.visB, this.hlB, this.doneFlash, step, time);
    this.updateFlask(this.fA, this.flowIn, this.visA, this.hlA, 0, step, time);
    for (const s of this.streams) {
      this.updateStream(s, s.kind === 'out' ? this.flowOut : this.flowIn, step, time);
    }
    this.updateLungs(time);

    const flow = Math.max(this.flowOut, this.flowIn);
    this.ringMat.emissiveIntensity = 0.8 + flow * 1.4;
    this.stripMat.emissiveIntensity = 1.4 + this.doneFlash * 2.5 + Math.sin(time * 1.3) * 0.15;
    if (this.light) {
      this.light.intensity = 0.32 + this.flowOut * 1.1 + this.visB * 0.35 + this.doneFlash * 1.1;
    }
  }

  /* ---------------- helpers ---------------- */

  private targetValue(): number {
    return this.ctx ? this.def.readout.target : 90;
  }

  private focusForBeat(beat: number): Focus {
    if (beat === 1) return 'lungs';
    if (beat === 2) return 'flask';
    return 'all';
  }

  private setFocus(kind: Focus): void {
    const f = this.framing;
    if (kind === 'lungs') {
      f.target.set(0, 0.62, 0);
      f.radius = 0.5;
    } else if (kind === 'flask') {
      f.target.set(0.4, -0.16, 0);
      f.radius = 0.6;
    } else {
      f.target.set(0, 0.14, 0);
      f.radius = 1.0;
    }
  }

  /* ---------------- build ---------------- */

  private build(ctx: LevelContext): void {
    const lp = ctx.lowPower;
    const accent = ctx.accent.clone();
    this.rand = rng(1010);

    this.buildBench(accent);
    this.fA = this.buildFlask(-FLASK_X, LONG_A, COL_AIR, accent, lp, 11);
    this.fB = this.buildFlask(FLASK_X, LONG_B, COL_CO2, accent, lp, 23);
    setUniform(this.fA.gauge, 'uTarget', -1);

    const labelA = makeLabel('IN · ROOM AIR', 'CO₂ ≈ 0.04%', '#4fe3ff');
    labelA.position.set(-FLASK_X, BENCH_Y - 0.07, 0.4772);
    const labelB = makeLabel('OUT · YOUR BREATH', 'CO₂ ≈ 4%', '#ff4fd8');
    labelB.position.set(FLASK_X, BENCH_Y - 0.07, 0.4772);
    this.root.add(labelA, labelB);

    this.buildTubes(accent, lp);
    this.buildLungs(accent, lp);
    this.buildStreams(lp);

    if (!lp) {
      const light = new THREE.PointLight(0xa8c4d0, 0.32, 1.6, 2);
      light.position.set(FLASK_X, BENCH_Y + 0.15, 0.25);
      this.root.add(light);
      this.light = light;
    }
    this.built = true;
  }

  private buildBench(accent: THREE.Color): void {
    const bench = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 0.14, 0.95),
      new THREE.MeshPhysicalMaterial({
        color: 0x07090d,
        roughness: 0.3,
        metalness: 0.55,
        clearcoat: 0.7,
        clearcoatRoughness: 0.2,
      }),
    );
    bench.position.set(0, BENCH_Y - 0.07, 0);
    this.root.add(bench);

    this.stripMat = neonMaterial(accent, 1.6);
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.005, 0.005), this.stripMat);
    top.position.set(0, BENCH_Y - 0.0025, 0.4755);
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.004, 0.004), neonMaterial(accent, 0.5));
    bottom.position.set(0, BENCH_Y - 0.138, 0.4755);
    this.root.add(top, bottom);
  }

  private buildFlask(
    cx: number,
    tipX: number,
    color: THREE.Color,
    accent: THREE.Color,
    lp: boolean,
    seed: number,
  ): FlaskRig {
    const g = new THREE.Group();
    g.position.set(cx, BENCH_Y, 0);
    this.root.add(g);
    const segs = lp ? 36 : 64;

    // Glass body + rim shell.
    const glassGeo = new THREE.LatheGeometry(
      OUTER_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)),
      segs,
    );
    const glass = new THREE.Mesh(
      glassGeo,
      glassMaterial(0xaeefff, { opacity: 0.15, emissive: 0.05, roughness: 0.06, side: THREE.DoubleSide }),
    );
    glass.renderOrder = 4;
    const shellMat = fresnelMaterial(0x8feeff, { power: 2.6, intensity: 0.7 });
    const shell = new THREE.Mesh(glassGeo, shellMat);
    shell.renderOrder = 5;
    g.add(glass, shell);

    // Limewater.
    const topR = flaskRadiusAt(FILL_H) - 0.012;
    const liqGeo = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.001, 0.01),
        new THREE.Vector2(0.2, 0.01),
        new THREE.Vector2(0.21, 0.035),
        new THREE.Vector2(topR, FILL_H),
        new THREE.Vector2(0.001, FILL_H),
      ],
      segs,
    );
    const liquidMat = new THREE.MeshStandardMaterial({
      color: LIQ_CLEAR.clone(),
      emissive: EMI_CLEAR.clone(),
      emissiveIntensity: 0.14,
      roughness: 0.22,
      metalness: 0,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    const liquid = new THREE.Mesh(liqGeo, liquidMat);
    liquid.renderOrder = 1;
    g.add(liquid);

    // Surface ring.
    const surfaceMat = neonMaterial(COL_AIR, 0.35);
    const surface = new THREE.Mesh(new THREE.TorusGeometry(topR, 0.003, 6, 72), surfaceMat);
    surface.rotation.x = Math.PI / 2;
    surface.position.y = FILL_H;
    surface.renderOrder = 2;
    g.add(surface);

    // Stopper + rings.
    const stopper = new THREE.Mesh(
      new THREE.CylinderGeometry(0.074, 0.064, 0.06, 32),
      new THREE.MeshStandardMaterial({ color: 0x15161c, roughness: 0.6, metalness: 0.1 }),
    );
    stopper.position.y = 0.635;
    const stopRing = new THREE.Mesh(new THREE.TorusGeometry(0.074, 0.003, 6, 48), neonMaterial(accent, 0.65));
    stopRing.rotation.x = Math.PI / 2;
    stopRing.position.y = 0.665;
    const baseRingMat = neonMaterial(accent, 0.55);
    const baseRing = new THREE.Mesh(new THREE.TorusGeometry(0.222, 0.004, 6, 96), baseRingMat);
    baseRing.rotation.x = Math.PI / 2;
    baseRing.position.y = 0.004;
    g.add(stopper, stopRing, baseRing);

    // Floor gauge.
    const gauge = gaugeMaterial(color, this.targetValue() / 100);
    const gaugeMesh = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.282, lp ? 64 : 128, 1), gauge);
    gaugeMesh.rotation.x = -Math.PI / 2;
    gaugeMesh.position.y = 0.003;
    gaugeMesh.renderOrder = 6;
    g.add(gaugeMesh);

    // Bubbles.
    const bubbleMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 10, 8),
      fresnelMaterial(0xdffaff, { power: 1.5, intensity: 1.5 }),
      BUBBLE_POOL,
    );
    bubbleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    bubbleMesh.frustumCulled = false;
    bubbleMesh.renderOrder = 3;
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < BUBBLE_POOL; i++) bubbleMesh.setMatrixAt(i, _m);
    bubbleMesh.instanceMatrix.needsUpdate = true;
    g.add(bubbleMesh);
    const bubbles: Bubble[] = [];
    for (let i = 0; i < BUBBLE_POOL; i++) {
      bubbles.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 0, ph: 0 });
    }

    // Calcium carbonate precipitate specks.
    const r = rng(seed);
    const n = lp ? 200 : 380;
    const specks: Speck[] = [];
    for (let i = 0; i < n; i++) {
      const h = 0.02 + r() * (FILL_H - 0.035);
      const rMax = (h < 0.035 ? 0.2 : flaskRadiusAt(h)) - 0.022;
      specks.push({
        r: Math.sqrt(r()) * rMax,
        ang: r() * Math.PI * 2,
        h,
        spd: 0.4 + r() * 0.9,
        wob: r() * 6.28,
      });
    }
    const precipGeo = new THREE.BufferGeometry();
    precipGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    // Matte CaCO₃ motes — NormalBlending so turbidity reads milky, not white bloom.
    const precipMat = new THREE.PointsMaterial({
      color: 0xd8e2e8,
      size: 0.038,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.NormalBlending,
    });
    const precip = new THREE.Points(precipGeo, precipMat);
    precip.frustumCulled = false;
    precip.renderOrder = 2;
    g.add(precip);

    // Tube-tip glow.
    const tipGlowMat = new THREE.SpriteMaterial({
      map: glowTexture(),
      color: color.clone(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
    });
    const tipGlow = new THREE.Sprite(tipGlowMat);
    tipGlow.position.set(tipX - cx, TIP_H, 0);
    tipGlow.scale.setScalar(0.05);
    tipGlow.renderOrder = 6;
    g.add(tipGlow);

    return {
      group: g,
      tipLX: tipX - cx,
      liquidMat,
      shellMat,
      surface,
      surfaceMat,
      baseRingMat,
      gauge,
      bubbles,
      bubbleMesh,
      spawnAcc: 0,
      ripple: 0,
      specks,
      precipGeo,
      precipMat,
      tipGlow,
      tipGlowMat,
    };
  }

  private buildTubes(accent: THREE.Color, lp: boolean): void {
    const glass = glassMaterial(0xbff4ff, { opacity: 0.26, emissive: 0.1, roughness: 0.1 });
    const rim = fresnelMaterial(0x9ff0ff, { power: 2.0, intensity: 0.9 });
    const add = (pts: THREE.Vector3[], radius: number, mat: THREE.Material, shellMat: THREE.Material): void => {
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      const geo = new THREE.TubeGeometry(curve, lp ? 48 : 110, radius, lp ? 8 : 12, false);
      const body = new THREE.Mesh(geo, mat);
      body.renderOrder = 4;
      const shell = new THREE.Mesh(geo, shellMat);
      shell.renderOrder = 5;
      this.root.add(body, shell);
    };
    add(mouthToB(), 0.012, glass, rim);
    add(mouthToA(), 0.012, glass, rim);
    add(outletB(), 0.012, glass, rim);
    add(inletA(), 0.012, glass, rim);

    // Trachea + bronchi (glass, lung tint).
    const tracheaMat = glassMaterial(COL_LUNG, { opacity: 0.3, emissive: 0.25 });
    const tracheaRim = fresnelMaterial(COL_LUNG, { power: 2.0, intensity: 1.0 });
    add([CARINA.clone(), v3(0, 0.76), v3(0, JUNCTION_Y)], 0.022, tracheaMat, tracheaRim);
    for (const side of [-1, 1]) {
      const h = hilum(side);
      add([CARINA.clone(), v3(side * 0.035, LUNG_Y + 0.15), h], 0.013, tracheaMat, tracheaRim);
    }

    // Cartilage rings.
    this.ringMat = neonMaterial(accent, 0.9);
    const ringGeo = new THREE.TorusGeometry(0.026, 0.0035, 6, 32);
    for (const y of [0.68, 0.74, 0.8, 0.86]) {
      const ring = new THREE.Mesh(ringGeo, this.ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, y, 0);
      this.root.add(ring);
    }

    // Mouth junction.
    const junction = new THREE.Mesh(
      new THREE.SphereGeometry(0.034, 24, 16),
      glassMaterial(0xbff4ff, { opacity: 0.32, emissive: 0.18 }),
    );
    junction.position.set(0, JUNCTION_Y, 0);
    junction.renderOrder = 4;
    const jRing = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.004, 8, 48), neonMaterial(accent, 1.6));
    jRing.position.set(0, JUNCTION_Y, 0);
    this.root.add(junction, jRing);

    // Open-end markers (to room air).
    const endGeo = new THREE.TorusGeometry(0.017, 0.003, 6, 32);
    const endB = new THREE.Mesh(endGeo, neonMaterial(COL_OUTLET, 1.4));
    endB.rotation.y = Math.PI / 2;
    endB.position.set(0.8, 0.275, 0);
    const endA = new THREE.Mesh(endGeo, neonMaterial(COL_AIR, 1.4));
    endA.rotation.y = Math.PI / 2;
    endA.position.set(-0.8, 0.275, 0);
    this.root.add(endA, endB);
  }

  private buildLungs(accent: THREE.Color, lp: boolean): void {
    const lg = new THREE.Group();
    lg.position.set(0, LUNG_Y, 0);
    this.root.add(lg);
    this.lungs = lg;

    this.lobeMat = glassMaterial(COL_LUNG, { opacity: 0.26, emissive: 0.26 });
    this.lobeShell = fresnelMaterial(COL_LUNG, { power: 2.2, intensity: 1.0 });
    this.treeMat = lineMaterial(0xffb3c6, 0.6);
    this.alvMat = glowPointsMaterial(COL_LUNG, 0.028, 0.5);
    const seg = lp ? 28 : 44;
    const r = rng(77);

    for (const side of [-1, 1]) {
      const geo = lobeGeometry(side, seg);
      const sx = side < 0 ? 0.12 : 0.11;
      const sy = side < 0 ? 0.2 : 0.19;
      const lobe = new THREE.Mesh(geo, this.lobeMat);
      lobe.position.set(side * 0.13, 0, 0);
      lobe.scale.set(sx, sy, 0.095);
      lobe.renderOrder = 4;
      const shell = new THREE.Mesh(geo, this.lobeShell);
      shell.position.copy(lobe.position);
      shell.scale.copy(lobe.scale);
      shell.renderOrder = 5;
      lg.add(lobe, shell);

      const tree = new THREE.LineSegments(bronchialTree(side, 300 + side * 17, lp ? 3 : 4), this.treeMat);
      tree.renderOrder = 6;
      lg.add(tree);

      const n = lp ? 30 : 60;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        let x = 0;
        let y = 0;
        let z = 0;
        do {
          x = r() * 2 - 1;
          y = r() * 2 - 1;
          z = r() * 2 - 1;
        } while (x * x + y * y + z * z > 1);
        arr[i * 3] = side * 0.13 + x * sx * 0.7;
        arr[i * 3 + 1] = y * sy * 0.75;
        arr[i * 3 + 2] = z * 0.095 * 0.7;
      }
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      const pts = new THREE.Points(pg, this.alvMat);
      pts.renderOrder = 6;
      lg.add(pts);
    }

    // Diaphragm hint: soft neon arc beneath the lungs.
    const arc = new THREE.Mesh(
      new THREE.TorusGeometry(0.2, 0.0035, 6, 64, Math.PI * 0.7),
      neonMaterial(accent, 0.7),
    );
    arc.rotation.z = Math.PI * 1.15;
    arc.position.set(0, LUNG_Y + 0.02, 0);
    this.root.add(arc);
  }

  private buildStreams(lp: boolean): void {
    const mk = (pts: THREE.Vector3[], n: number, color: THREE.Color, kind: 'out' | 'in', speed: number): void => {
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      const lut = curve.getSpacedPoints(lp ? 120 : 220);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
      const mat = glowPointsMaterial(0xffffff, 0.045, 0, true);
      const points = new THREE.Points(geo, mat);
      points.frustumCulled = false;
      points.renderOrder = 7;
      points.visible = false;
      this.root.add(points);
      const offsets: number[] = [];
      for (let i = 0; i < n; i++) offsets.push(i / n + (this.rand() - 0.5) * (0.6 / n));
      this.streams.push({ lut, offsets, phase: 0, speed, color: color.clone(), geo, mat, points, kind });
    };

    const nMain = lp ? 16 : 26;
    const nShort = lp ? 8 : 14;
    const toB = mouthToB();
    const fromA = mouthToA().reverse();
    for (const side of [-1, 1]) {
      mk(
        [lobeCore(side), hilum(side), CARINA.clone(), v3(0, 0.78), ...toB],
        nMain,
        COL_CO2,
        'out',
        0.42,
      );
      mk(
        [...fromA, v3(0, 0.78), CARINA.clone(), hilum(side), lobeCore(side)],
        nMain,
        COL_AIR,
        'in',
        0.5,
      );
    }
    mk(outletB(), nShort, COL_OUTLET, 'out', 0.7);
    mk(inletA(), nShort, COL_AIR, 'in', 0.75);
  }

  /* ---------------- updates ---------------- */

  private spawnBubble(f: FlaskRig): void {
    const b = f.bubbles.find((q) => !q.alive);
    if (!b) return;
    const r = this.rand;
    b.alive = true;
    b.x = f.tipLX + (r() - 0.5) * 0.008;
    b.y = TIP_H + 0.004;
    b.z = (r() - 0.5) * 0.008;
    b.vx = (r() - 0.5) * 0.2;
    b.vz = (r() - 0.5) * 0.2;
    b.vy = 0.16 + r() * 0.18;
    b.r = 0.01 + r() * 0.014;
    b.ph = r() * Math.PI * 2;
  }

  private updateFlask(
    f: FlaskRig,
    flow: number,
    vis: number,
    hl: number,
    flash: number,
    dt: number,
    time: number,
  ): void {
    // Spawn bubbles at the tube tip.
    f.spawnAcc += flow * 32 * dt;
    while (f.spawnAcc >= 1) {
      this.spawnBubble(f);
      f.spawnAcc -= 1;
    }

    // Integrate bubbles.
    const drag = Math.exp(-2.2 * dt);
    f.bubbles.forEach((b, i) => {
      if (!b.alive) {
        _m.makeScale(0, 0, 0);
        f.bubbleMesh.setMatrixAt(i, _m);
        return;
      }
      b.vy += 0.9 * dt;
      b.vx *= drag;
      b.vz *= drag;
      b.x += (b.vx + Math.sin(time * 14 + b.ph) * 0.03) * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      b.r = Math.min(0.03, b.r + dt * 0.006);
      const maxR = Math.max(0.01, flaskRadiusAt(b.y) - 0.02 - b.r);
      const rr = Math.hypot(b.x, b.z);
      if (rr > maxR) {
        b.x *= maxR / rr;
        b.z *= maxR / rr;
      }
      if (b.y >= FILL_H - b.r * 0.5) {
        b.alive = false;
        f.ripple = Math.min(1.5, f.ripple + 0.12);
        _m.makeScale(0, 0, 0);
      } else {
        const w = Math.sin(time * 18 + b.ph) * 0.12;
        _m.makeScale(b.r * (1 + w), b.r * (1 - w), b.r * (1 + w));
        _m.setPosition(b.x, b.y, b.z);
      }
      f.bubbleMesh.setMatrixAt(i, _m);
    });
    f.bubbleMesh.instanceMatrix.needsUpdate = true;

    // Surface ripple.
    f.ripple *= Math.exp(-3.5 * dt);
    const rip = f.ripple + flow * 0.4;
    const sc = 1 + Math.sin(time * 22) * 0.012 * rip;
    f.surface.scale.set(sc, sc, 1);
    f.surface.position.y = FILL_H + Math.sin(time * 17) * 0.002 * rip;
    f.surfaceMat.emissiveIntensity = 0.25 + rip * 0.55 + vis * 0.15;

    // Limewater colour: clear → milky Ca(OH)₂ / CaCO₃ turbidity (matte, not white glow).
    const k = Math.pow(clamp01(vis), 0.7);
    f.liquidMat.color.copy(LIQ_CLEAR).lerp(LIQ_MILK, k);
    f.liquidMat.emissive.copy(EMI_CLEAR).lerp(EMI_MILK, k);
    f.liquidMat.emissiveIntensity = lerp(0.14, 0.1, k) + flash * 0.12 + flow * 0.04;
    f.liquidMat.opacity = lerp(0.42, 0.94, k);
    f.liquidMat.roughness = lerp(0.22, 0.78, k);

    // Precipitate specks swirl, faster when bubbling — dense enough to read as cloudiness.
    f.precipMat.opacity = clamp01(vis * 1.85) * 0.92;
    f.precipMat.size = lerp(0.028, 0.046, k);
    if (f.precipMat.opacity > 0.005) {
      const pa = f.precipGeo.getAttribute('position') as THREE.BufferAttribute;
      const swirl = dt * (0.25 + flow * 1.3);
      f.specks.forEach((s, i) => {
        s.ang += s.spd * swirl;
        pa.setXYZ(
          i,
          Math.cos(s.ang) * s.r,
          s.h + Math.sin(time * s.spd * 3 + s.wob) * 0.006,
          Math.sin(s.ang) * s.r,
        );
      });
      pa.needsUpdate = true;
    }

    // Gauge, rim and accents.
    setUniform(f.gauge, 'uProgress', clamp01(vis));
    setUniform(f.gauge, 'uGlow', 0.8 + flow * 0.6 + flash * 1.5 + hl * 0.3);
    setFresnel(f.shellMat, 0.55 + hl * 0.9 + flow * 0.25);
    f.baseRingMat.emissiveIntensity = 0.4 + hl * 0.55 + flash * 0.7;
    f.tipGlowMat.opacity = clamp01(flow * 0.7) * (0.55 - 0.25 * vis);
    f.tipGlow.scale.setScalar(0.04 + flow * 0.045);
  }

  private updateStream(s: Stream, flow: number, dt: number, time: number): void {
    s.phase = frac(s.phase + dt * s.speed * flow);
    s.mat.opacity = clamp01(flow * 1.2);
    s.points.visible = flow > 0.01;
    if (!s.points.visible) return;
    const pa = s.geo.getAttribute('position') as THREE.BufferAttribute;
    const ca = s.geo.getAttribute('color') as THREE.BufferAttribute;
    const c = s.color;
    s.offsets.forEach((o, i) => {
      const t = frac(o + s.phase);
      sampleLut(s.lut, t, _v);
      const j = Math.sin(time * 9 + i * 1.7) * 0.004;
      pa.setXYZ(i, _v.x + j, _v.y + Math.cos(time * 7 + i * 2.3) * 0.004, _v.z - j);
      const fade = smoothstep(0, 0.05, t) * smoothstep(1, 0.95, t);
      ca.setXYZ(i, c.r * fade, c.g * fade, c.b * fade);
    });
    pa.needsUpdate = true;
    ca.needsUpdate = true;
  }

  private updateLungs(time: number): void {
    const s = 0.84 + 0.18 * this.air;
    this.lungs.scale.set(s, 0.88 + 0.14 * this.air, s);

    _c.copy(COL_LUNG).lerp(COL_CO2, this.flowOut * 0.65).lerp(COL_AIR, this.flowIn * 0.5);
    if (this.lungsEmpty) {
      _c2.copy(COL_WARN);
      _c.lerp(_c2, 0.5 + 0.5 * Math.sin(time * 10));
    }
    setUniformColor(this.lobeShell, 'uColor', _c);
    setFresnel(this.lobeShell, 0.9 + this.hlL * 0.9 + 0.4 * (this.flowOut + this.flowIn));
    this.lobeMat.emissiveIntensity = 0.22 + this.flowOut * 0.25 + this.hlL * 0.15;
    this.treeMat.opacity = clamp01(0.45 + this.flowOut * 0.4 + this.flowIn * 0.2 + this.hlL * 0.3);
    this.alvMat.opacity = clamp01(0.4 + 0.25 * this.air + this.hlL * 0.3);
  }
}