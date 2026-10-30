/**
 * Level 08 — BURN.
 * Inside a muscle cell: blood in a capillary delivers oxygen (HOLD) while the glucose
 * supply is set by the extra slider. Aerobic respiration in the mitochondrion lights
 * the cristae, fires ATP sparks into the myofibrils (which visibly contract) and sends
 * carbon dioxide back into the blood. With no oxygen, glucose is split in the cytoplasm
 * into lactic acid and releases only a trickle of energy.
 * Fully procedural geometry + neon emissive materials.
 */
import * as THREE from 'three';
import { LevelScene } from './base';
import type { LevelContext } from './base';
import type { ControlInput, LevelPhase, Readout, ReadoutStatus } from '../types';
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
/* Palette + layout constants                                          */
/* ------------------------------------------------------------------ */

const C_O2 = 0x46f0ff;
const C_GLU = 0xffc43d;
const C_ATP = 0xfff0b8;
const C_CO2 = 0xa48bff;
const C_LAC = 0xff5b2e;
const C_BLOOD = 0xff2b4f;
const C_MITO = 0xff3f86;
const C_FIBRE = 0xb76cff;
const C_THICK = 0xff5fd2;
const C_THIN = 0x8fe3ff;

const SARC_N = 10;
const SARC_REST = 0.34;
const SARC_SHORT = 0.27;
const THIN_LEN = 0.13;
const THICK_LEN = 0.16;
const FIBRE_CENTER = new THREE.Vector3(0, -0.8, -0.45);
/** [dy, dz] offsets of each myofibril in the bundle. */
const FIBRE_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0.125, -0.04],
  [-0.115, -0.07],
  [0.04, -0.2],
  [-0.05, 0.11],
];

const MITO_INNER_R = 0.32;
const MITO_HALF_STRAIGHT = 0.4;

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _dummy = new THREE.Object3D();
const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);

/* ------------------------------------------------------------------ */
/* Small particle helpers                                              */
/* ------------------------------------------------------------------ */

interface Flyer {
  live: boolean;
  t: number;
  dur: number;
  a: THREE.Vector3;
  c: THREE.Vector3;
  b: THREE.Vector3;
  p: THREE.Vector3;
  seed: number;
  tag: number;
}

function makeFlyers(n: number): Flyer[] {
  const out: Flyer[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      live: false,
      t: 0,
      dur: 1,
      a: new THREE.Vector3(),
      c: new THREE.Vector3(),
      b: new THREE.Vector3(),
      p: new THREE.Vector3(),
      seed: Math.random(),
      tag: 0,
    });
  }
  return out;
}

function claimFlyer(
  list: Flyer[],
  a: THREE.Vector3,
  c: THREE.Vector3,
  b: THREE.Vector3,
  dur: number,
  tag: number,
): Flyer | null {
  for (const f of list) {
    if (f.live) continue;
    f.live = true;
    f.t = 0;
    f.dur = Math.max(0.05, dur);
    f.a.copy(a);
    f.c.copy(c);
    f.b.copy(b);
    f.p.copy(a);
    f.seed = Math.random();
    f.tag = tag;
    return f;
  }
  return null;
}

function bezier(out: THREE.Vector3, a: THREE.Vector3, c: THREE.Vector3, b: THREE.Vector3, t: number): THREE.Vector3 {
  const u = 1 - t;
  const w0 = u * u;
  const w1 = 2 * u * t;
  const w2 = t * t;
  return out.set(
    w0 * a.x + w1 * c.x + w2 * b.x,
    w0 * a.y + w1 * c.y + w2 * b.y,
    w0 * a.z + w1 * c.z + w2 * b.z,
  );
}

const easeSmooth = (t: number): number => t * t * (3 - 2 * t);
const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);
const easeLinear = (t: number): number => t;

function jitter(v: THREE.Vector3, amt: number): THREE.Vector3 {
  v.x += (Math.random() - 0.5) * 2 * amt;
  v.y += (Math.random() - 0.5) * 2 * amt;
  v.z += (Math.random() - 0.5) * 2 * amt;
  return v;
}

/** Additive glow sparks driven by per-point vertex colour (black = invisible). */
class GlowCloud {
  readonly points: THREE.Points;
  readonly items: Flyer[];
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly posAttr: THREE.BufferAttribute;
  private readonly colAttr: THREE.BufferAttribute;
  private readonly tint: THREE.Color;
  private readonly ease: (t: number) => number;

  constructor(n: number, color: THREE.ColorRepresentation, size: number, ease: (t: number) => number) {
    this.items = makeFlyers(n);
    this.tint = new THREE.Color(color);
    this.ease = ease;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('color', this.colAttr);
    this.points = new THREE.Points(geo, glowPointsMaterial(0xffffff, size, 1, true));
    this.points.frustumCulled = false;
  }

  spawn(a: THREE.Vector3, c: THREE.Vector3, b: THREE.Vector3, dur: number, tag = 0): Flyer | null {
    return claimFlyer(this.items, a, c, b, dur, tag);
  }

  clear(): void {
    for (const f of this.items) f.live = false;
  }

  update(dt: number, alpha: (f: Flyer) => number, onArrive?: (f: Flyer) => void): void {
    const items = this.items;
    for (let i = 0; i < items.length; i++) {
      const f = items[i];
      if (!f) continue;
      const k = i * 3;
      if (f.live) {
        f.t += dt / f.dur;
        if (f.t >= 1) {
          f.live = false;
          if (onArrive) onArrive(f);
        }
      }
      if (f.live) {
        bezier(f.p, f.a, f.c, f.b, this.ease(clamp01(f.t)));
        const a = Math.max(0, alpha(f));
        this.pos[k] = f.p.x;
        this.pos[k + 1] = f.p.y;
        this.pos[k + 2] = f.p.z;
        this.col[k] = this.tint.r * a;
        this.col[k + 1] = this.tint.g * a;
        this.col[k + 2] = this.tint.b * a;
      } else {
        this.col[k] = 0;
        this.col[k + 1] = 0;
        this.col[k + 2] = 0;
      }
    }
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
  }
}

/** Instanced neon molecules (O₂, glucose, CO₂) with a soft glow halo per molecule. */
class MoleculeSwarm {
  readonly mesh: THREE.InstancedMesh;
  readonly glow: THREE.Points;
  readonly items: Flyer[];
  private readonly gPos: Float32Array;
  private readonly gCol: Float32Array;
  private readonly gPosAttr: THREE.BufferAttribute;
  private readonly gColAttr: THREE.BufferAttribute;
  private readonly tint: THREE.Color;
  private readonly spin: number;
  private readonly wobble: number;

  constructor(
    n: number,
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    glowColor: THREE.ColorRepresentation,
    glowSize: number,
    glowOpacity: number,
    spin: number,
    wobble: number,
  ) {
    this.items = makeFlyers(n);
    this.tint = new THREE.Color(glowColor).multiplyScalar(glowOpacity);
    this.spin = spin;
    this.wobble = wobble;
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < n; i++) this.mesh.setMatrixAt(i, ZERO_M);

    this.gPos = new Float32Array(n * 3);
    this.gCol = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry();
    this.gPosAttr = new THREE.BufferAttribute(this.gPos, 3).setUsage(THREE.DynamicDrawUsage);
    this.gColAttr = new THREE.BufferAttribute(this.gCol, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.gPosAttr);
    g.setAttribute('color', this.gColAttr);
    this.glow = new THREE.Points(g, glowPointsMaterial(0xffffff, glowSize, 1, true));
    this.glow.frustumCulled = false;
  }

  spawn(a: THREE.Vector3, c: THREE.Vector3, b: THREE.Vector3, dur: number, tag = 0): Flyer | null {
    return claimFlyer(this.items, a, c, b, dur, tag);
  }

  clear(): void {
    for (const f of this.items) f.live = false;
  }

  update(dt: number, time: number, size: (f: Flyer) => number, onArrive?: (f: Flyer) => void): void {
    const items = this.items;
    for (let i = 0; i < items.length; i++) {
      const f = items[i];
      if (!f) continue;
      const k = i * 3;
      if (f.live) {
        f.t += dt / f.dur;
        if (f.t >= 1) {
          f.live = false;
          if (onArrive) onArrive(f);
        }
      }
      if (f.live) {
        const t = clamp01(f.t);
        bezier(f.p, f.a, f.c, f.b, easeSmooth(t));
        const w = this.wobble * (1 - t);
        f.p.x += Math.sin(time * 4.1 + f.seed * 17) * w;
        f.p.y += Math.sin(time * 3.3 + f.seed * 29) * w;
        const s = Math.max(0, size(f));
        _dummy.position.copy(f.p);
        _dummy.rotation.set(
          f.seed * 6.28 + time * this.spin * (0.6 + f.seed),
          f.seed * 3.1 + time * this.spin * 0.7,
          time * this.spin * 0.4 * (f.seed - 0.5),
        );
        _dummy.scale.setScalar(Math.max(1e-4, s));
        _dummy.updateMatrix();
        this.mesh.setMatrixAt(i, _dummy.matrix);
        this.gPos[k] = f.p.x;
        this.gPos[k + 1] = f.p.y;
        this.gPos[k + 2] = f.p.z;
        this.gCol[k] = this.tint.r * s;
        this.gCol[k + 1] = this.tint.g * s;
        this.gCol[k + 2] = this.tint.b * s;
      } else {
        this.mesh.setMatrixAt(i, ZERO_M);
        this.gCol[k] = 0;
        this.gCol[k + 1] = 0;
        this.gCol[k + 2] = 0;
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.gPosAttr.needsUpdate = true;
    this.gColAttr.needsUpdate = true;
  }
}

/* ------------------------------------------------------------------ */
/* Procedural geometry helpers                                         */
/* ------------------------------------------------------------------ */

/** Lathe a chain of overlapping spheres [radius, centreY] into a molecule silhouette. */
function chainGeometry(atoms: ReadonlyArray<readonly [number, number]>, steps = 36, radial = 14): THREE.LatheGeometry {
  let lo = Infinity;
  let hi = -Infinity;
  for (const [r, y] of atoms) {
    lo = Math.min(lo, y - r);
    hi = Math.max(hi, y + r);
  }
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= steps; i++) {
    const y = lo + ((hi - lo) * i) / steps;
    let x = 0;
    for (const [r, cy] of atoms) {
      const d = r * r - (y - cy) * (y - cy);
      if (d > x * x) x = Math.sqrt(d);
    }
    pts.push(new THREE.Vector2(Math.max(x, 1e-4), y));
  }
  return new THREE.LatheGeometry(pts, radial);
}

/** A crista "finger" outline: wavy sides, rounded tip, base on the inner membrane. */
function cristaShape(len: number, w: number, wob: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-w, 0);
  s.bezierCurveTo(-w - wob, len * 0.35, -w + wob, len * 0.65, -w, len - w);
  s.absarc(0, len - w, w, Math.PI, 0, true);
  s.bezierCurveTo(w + wob, len * 0.65, w - wob, len * 0.35, w, 0);
  s.lineTo(-w, 0);
  return s;
}

/** Inner radius of the mitochondrial capsule at a given x. */
function innerRadiusAt(x: number): number {
  const ax = Math.abs(x);
  if (ax <= MITO_HALF_STRAIGHT) return MITO_INNER_R;
  const d = ax - MITO_HALF_STRAIGHT;
  return Math.sqrt(Math.max(0.0025, MITO_INNER_R * MITO_INNER_R - d * d));
}

interface CristaInfo {
  x: number;
  wall: number;
  len: number;
  top: boolean;
  depth: number;
}

/* ------------------------------------------------------------------ */
/* Level                                                               */
/* ------------------------------------------------------------------ */

export class Level08Burn extends LevelScene {
  private built = false;
  private lowPower = false;
  private portrait = false;
  private readonly accent = new THREE.Color(C_MITO);

  /* simulation state */
  private oxy = 0;
  private glu = 0.5;
  private energy = 0;
  private aer = 0;
  private anaer = 0;
  private reached = false;
  private hasHeld = false;
  private delivering = false;
  private holdPulse = 0;
  private gluPulse = 0;
  private lastExtra = 0.5;
  private cristaeFlash = 0;
  private twitch = 0;
  private accO2 = 0;
  private accGlu = 0;
  private accAtp = 0;
  private accCo2 = 0;
  private accLac = 0;
  private fCap = 1;
  private fMito = 1;
  private fFibre = 1;

  /* scene parts */
  private capCurve!: THREE.CatmullRomCurve3;
  private capRim!: THREE.ShaderMaterial;
  private plasmaMat!: THREE.MeshBasicMaterial;
  private rbc!: THREE.InstancedMesh;
  private rbcMat!: THREE.MeshStandardMaterial;
  private rbcSeeds: number[] = [];

  private mito!: THREE.Group;
  private mitoRim!: THREE.ShaderMaterial;
  private innerRim!: THREE.ShaderMaterial;
  private cristae: CristaInfo[] = [];
  private cristaeMat!: THREE.MeshStandardMaterial;
  private cristaeEdgeMat!: THREE.LineBasicMaterial;
  private synthMat!: THREE.PointsMaterial;
  private matrixGlow!: THREE.Sprite;
  private mitoLight!: THREE.PointLight;

  private discs!: THREE.InstancedMesh;
  private thick!: THREE.InstancedMesh;
  private thin!: THREE.InstancedMesh;
  private discMat!: THREE.MeshStandardMaterial;
  private thickMat!: THREE.MeshStandardMaterial;
  private thinMat!: THREE.MeshStandardMaterial;
  private sheathRim!: THREE.ShaderMaterial;
  private fibreFlash: number[] = FIBRE_OFFSETS.map(() => 0);

  private o2!: MoleculeSwarm;
  private glucose!: MoleculeSwarm;
  private co2!: MoleculeSwarm;
  private atp!: GlowCloud;
  private lactate!: GlowCloud;
  private dust!: THREE.Points;

  constructor() {
    super();
    this.root.name = 'Level08Burn';
  }

  /* ---------------- lifecycle ---------------- */

  protected onEnter(ctx: LevelContext): void {
    if (!this.built) this.build(ctx);
    this.resetSim(true);
    this.lastExtra = this.input.extra;
    this.setFramingGoal();
    this.snapCamera();
  }

  protected onExit(): void {
    this.holdPulse = 0;
    this.gluPulse = 0;
  }

  protected onPhase(phase: LevelPhase): void {
    if (phase === 'handsOn') this.resetSim(false);
    if (phase === 'tour') this.resetSim(true);
    this.setFramingGoal();
  }

  protected onTourBeat(_beat: number): void {
    this.setFramingGoal();
  }

  protected onResize(w: number, h: number): void {
    this.portrait = h > w;
    this.setFramingGoal();
  }

  onHoldStart(): void {
    this.holdPulse = 1;
    if (this.phase === 'handsOn') this.hasHeld = true;
  }

  onHoldEnd(): void {
    this.holdPulse = Math.max(this.holdPulse, 0.35);
  }

  onExtraSlider(v: number): void {
    this.gluPulse = Math.min(1, this.gluPulse + Math.abs(v - this.lastExtra) * 4 + 0.12);
    this.lastExtra = v;
  }

  private resetSim(keepWarm: boolean): void {
    this.oxy = keepWarm ? 0.6 : 0;
    this.glu = keepWarm ? 0.8 : clamp01(this.input.extra);
    this.energy = keepWarm ? 45 : 0;
    this.aer = 0;
    this.anaer = 0;
    this.reached = false;
    this.hasHeld = false;
    this.cristaeFlash = 0;
    this.accO2 = this.accGlu = this.accAtp = this.accCo2 = this.accLac = 0;
    if (this.built && !keepWarm) {
      this.lactate.clear();
    }
  }

  /* ---------------- build ---------------- */

  private build(ctx: LevelContext): void {
    this.built = true;
    this.lowPower = ctx.lowPower;
    this.accent.copy(ctx.accent);
    const R = rng(808);
    const root = this.root;
    const white = new THREE.Color(0xffffff);

    /* --- cytoplasm dust for depth --- */
    const dustN = this.lowPower ? 140 : 280;
    const dp = new Float32Array(dustN * 3);
    for (let i = 0; i < dustN; i++) {
      dp[i * 3] = (R() - 0.5) * 5.6;
      dp[i * 3 + 1] = (R() - 0.5) * 2.9;
      dp[i * 3 + 2] = -1.9 + R() * 2.7;
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    this.dust = new THREE.Points(dg, glowPointsMaterial(this.accent.clone().lerp(white, 0.55), 0.022, 0.3));
    root.add(this.dust);

    /* --- capillary with red blood cells --- */
    this.capCurve = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(-3.2, 0.5, -1.4),
        new THREE.Vector3(-1.6, 0.82, -0.5),
        new THREE.Vector3(-0.6, 0.95, -0.22),
        new THREE.Vector3(0.4, 0.98, -0.28),
        new THREE.Vector3(1.5, 0.84, -0.6),
        new THREE.Vector3(3.2, 0.56, -1.5),
      ],
      false,
      'catmullrom',
      0.5,
    );
    const capGeo = new THREE.TubeGeometry(this.capCurve, 140, 0.085, 20, false);
    const capGlass = new THREE.Mesh(
      capGeo,
      glassMaterial(C_BLOOD, { opacity: 0.16, emissive: 0.08, side: THREE.DoubleSide }),
    );
    this.capRim = fresnelMaterial(C_BLOOD, { power: 2.0, intensity: 0.9 });
    const capRimMesh = new THREE.Mesh(capGeo.clone(), this.capRim);
    capRimMesh.renderOrder = 3;
    const coreGeo = new THREE.TubeGeometry(this.capCurve, 140, 0.032, 8, false);
    this.plasmaMat = new THREE.MeshBasicMaterial({
      color: C_GLU,
      transparent: true,
      opacity: 0.1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const plasma = new THREE.Mesh(coreGeo, this.plasmaMat);
    root.add(capGlass, capRimMesh, plasma);

    const rbcN = this.lowPower ? 12 : 20;
    this.rbcMat = neonMaterial(C_BLOOD, 0.8, 0.4);
    this.rbc = new THREE.InstancedMesh(new THREE.TorusGeometry(0.04, 0.026, 10, 22), this.rbcMat, rbcN);
    this.rbc.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rbc.frustumCulled = false;
    this.rbcSeeds = [];
    for (let i = 0; i < rbcN; i++) this.rbcSeeds.push(R());
    root.add(this.rbc);

    /* --- mitochondrion --- */
    this.mito = new THREE.Group();
    this.mito.name = 'Mitochondrion';
    root.add(this.mito);

    const outerGeo = new THREE.CapsuleGeometry(0.37, 0.86, 10, 36);
    outerGeo.rotateZ(Math.PI / 2);
    const outer = new THREE.Mesh(outerGeo, glassMaterial(C_MITO, { opacity: 0.2, emissive: 0.1 }));
    outer.renderOrder = 2;
    this.mitoRim = fresnelMaterial(C_MITO, { power: 2.2, intensity: 1.1 });
    const outerRim = new THREE.Mesh(outerGeo.clone(), this.mitoRim);
    outerRim.renderOrder = 4;
    const innerGeo = new THREE.CapsuleGeometry(0.335, 0.8, 8, 32);
    innerGeo.rotateZ(Math.PI / 2);
    this.innerRim = fresnelMaterial(this.accent, { power: 3.2, intensity: 0.55 });
    const inner = new THREE.Mesh(innerGeo, this.innerRim);
    inner.renderOrder = 3;
    this.mito.add(outer, outerRim, inner);

    const cristaCol = this.accent.clone().lerp(new THREE.Color(C_MITO), 0.35);
    this.cristaeMat = neonMaterial(cristaCol, 0.6, 0.18);
    this.cristaeEdgeMat = lineMaterial(cristaCol.clone().lerp(white, 0.45), 0.4);
    const synthPts: number[] = [];
    const count = 9;
    this.cristae = [];
    for (let i = 0; i < count; i++) {
      const x = -0.56 + (1.12 * i) / (count - 1);
      const top = i % 2 === 0;
      const rho = innerRadiusAt(x);
      const wall = rho * 0.92;
      const len = wall * (0.82 + R() * 0.3);
      const w = 0.03 + R() * 0.008;
      const depth = rho * 0.55;
      const geo = new THREE.ExtrudeGeometry(cristaShape(len, w, 0.012 + R() * 0.01), {
        depth: depth * 2,
        bevelEnabled: true,
        bevelThickness: 0.01,
        bevelSize: 0.008,
        bevelSegments: 2,
        curveSegments: 10,
        steps: 1,
      });
      geo.translate(0, 0, -depth);
      const mesh = new THREE.Mesh(geo, this.cristaeMat);
      mesh.position.set(x, top ? wall : -wall, 0);
      if (top) mesh.rotation.z = Math.PI;
      mesh.rotation.y = (R() - 0.5) * 0.22;
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 28), this.cristaeEdgeMat));
      this.mito.add(mesh);
      this.cristae.push({ x, wall, len, top, depth });

      // "ATP synthase" studs on the crista surfaces
      const studs = this.lowPower ? 10 : 18;
      for (let j = 0; j < studs; j++) {
        const v = len * (0.08 + R() * 0.86);
        const u = (R() < 0.5 ? -1 : 1) * (w + 0.008);
        const z = (R() - 0.5) * 2 * depth * 0.9;
        if (top) synthPts.push(x - u, wall - v, z);
        else synthPts.push(x + u, -wall + v, z);
      }
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(synthPts, 3));
    this.synthMat = glowPointsMaterial(C_ATP, 0.035, 0.2);
    this.mito.add(new THREE.Points(sg, this.synthMat));

    this.matrixGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(128),
        color: this.accent,
        transparent: true,
        opacity: 0.15,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.matrixGlow.scale.set(1.9, 0.95, 1);
    this.mito.add(this.matrixGlow);

    this.mitoLight = new THREE.PointLight(this.accent, 0.3, 3, 2);
    this.mito.add(this.mitoLight);

    /* --- myofibril bundle --- */
    const sheathGeo = new THREE.CylinderGeometry(0.058, 0.058, 3.8, 18, 1, true);
    sheathGeo.rotateZ(Math.PI / 2);
    const sheathMat = glassMaterial(C_FIBRE, { opacity: 0.12, emissive: 0.1, side: THREE.DoubleSide });
    this.sheathRim = fresnelMaterial(C_FIBRE, { power: 2.6, intensity: 0.6 });
    for (let fi = 0; fi < FIBRE_OFFSETS.length; fi++) {
      this.fibreCenter(_v1, fi);
      const sheath = new THREE.Mesh(sheathGeo, sheathMat);
      sheath.position.copy(_v1);
      const rim = new THREE.Mesh(sheathGeo, this.sheathRim);
      rim.position.copy(_v1);
      rim.renderOrder = 3;
      root.add(sheath, rim);
    }
    const nF = FIBRE_OFFSETS.length;
    const discGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.012, 18).rotateZ(Math.PI / 2);
    const thickGeo = new THREE.CylinderGeometry(0.011, 0.011, THICK_LEN, 6).rotateZ(Math.PI / 2);
    const thinGeo = new THREE.CylinderGeometry(0.0045, 0.0045, THIN_LEN, 5).rotateZ(Math.PI / 2);
    this.discMat = neonMaterial(C_FIBRE, 0.9, 0.2);
    this.thickMat = neonMaterial(C_THICK, 0.8, 0.2);
    this.thinMat = neonMaterial(C_THIN, 0.8, 0.2);
    this.discs = new THREE.InstancedMesh(discGeo, this.discMat, nF * (SARC_N + 1));
    this.thick = new THREE.InstancedMesh(thickGeo, this.thickMat, nF * SARC_N * 3);
    this.thin = new THREE.InstancedMesh(thinGeo, this.thinMat, nF * SARC_N * 6);
    for (const im of [this.discs, this.thick, this.thin]) {
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      root.add(im);
    }

    /* --- molecule swarms + spark clouds --- */
    const nO2 = this.lowPower ? 36 : 60;
    this.o2 = new MoleculeSwarm(
      nO2,
      chainGeometry([
        [0.017, -0.014],
        [0.017, 0.014],
      ]),
      neonMaterial(C_O2, 1.6, 0.2),
      C_O2,
      0.1,
      0.55,
      1.6,
      0.015,
    );
    this.glucose = new MoleculeSwarm(
      this.lowPower ? 20 : 28,
      new THREE.TorusGeometry(0.036, 0.009, 6, 6),
      neonMaterial(C_GLU, 1.5, 0.2),
      C_GLU,
      0.13,
      0.5,
      0.9,
      0.02,
    );
    this.co2 = new MoleculeSwarm(
      this.lowPower ? 26 : 40,
      chainGeometry([
        [0.014, -0.027],
        [0.017, 0],
        [0.014, 0.027],
      ]),
      neonMaterial(C_CO2, 1.3, 0.2),
      C_CO2,
      0.09,
      0.45,
      1.2,
      0.012,
    );
    this.atp = new GlowCloud(this.lowPower ? 110 : 180, C_ATP, 0.055, easeOut);
    this.lactate = new GlowCloud(this.lowPower ? 50 : 80, C_LAC, 0.075, easeLinear);
    root.add(
      this.o2.mesh,
      this.o2.glow,
      this.glucose.mesh,
      this.glucose.glow,
      this.co2.mesh,
      this.co2.glow,
      this.atp.points,
      this.lactate.points,
    );

    this.updateFibres(0);
  }

  /* ---------------- spatial helpers ---------------- */

  private fibreCenter(out: THREE.Vector3, fi: number): THREE.Vector3 {
    out.copy(FIBRE_CENTER);
    const o = FIBRE_OFFSETS[fi];
    if (o) {
      out.y += o[0];
      out.z += o[1];
    }
    return out;
  }

  private mitoInterior(out: THREE.Vector3, x0: number, x1: number): THREE.Vector3 {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 0.2;
    out.set(lerp(x0, x1, Math.random()), Math.cos(a) * r, Math.sin(a) * r);
    return this.mito.localToWorld(out);
  }

  private cristaPoint(out: THREE.Vector3): THREE.Vector3 {
    const c = this.cristae[Math.floor(Math.random() * this.cristae.length)];
    if (!c) return this.mitoInterior(out, -0.4, 0.4);
    const v = c.len * (0.3 + Math.random() * 0.7);
    out.set(
      c.x + (Math.random() - 0.5) * 0.05,
      c.top ? c.wall - v : -c.wall + v,
      (Math.random() - 0.5) * c.depth * 1.6,
    );
    return this.mito.localToWorld(out);
  }

  private capPoint(out: THREE.Vector3, u0: number, u1: number): THREE.Vector3 {
    this.capCurve.getPointAt(clamp01(lerp(u0, u1, Math.random())), out);
    return jitter(out, 0.045);
  }

  /* ---------------- spawners ---------------- */

  private spawnO2(): void {
    this.capPoint(_v1, 0.2, 0.52);
    this.mitoInterior(_v2, -0.55, 0.3);
    _v3.lerpVectors(_v1, _v2, 0.5);
    _v3.x += (Math.random() - 0.5) * 0.35;
    _v3.y += 0.12;
    _v3.z += 0.15 + Math.random() * 0.25;
    this.o2.spawn(_v1, _v3, _v2, 1.0 + Math.random() * 0.7);
  }

  private spawnGlucose(): void {
    this.capPoint(_v1, 0.5, 0.74);
    const aerobic = this.oxy > 0.3;
    if (aerobic) this.mitoInterior(_v2, -0.1, 0.55);
    else _v2.set(0.35 + Math.random() * 0.55, -0.22 - Math.random() * 0.3, 0.2 + Math.random() * 0.3);
    _v3.lerpVectors(_v1, _v2, 0.5);
    _v3.x += (Math.random() - 0.5) * 0.4 + 0.15;
    _v3.y += 0.1;
    _v3.z += 0.2 + Math.random() * 0.2;
    this.glucose.spawn(_v1, _v3, _v2, 1.5 + Math.random() * 0.8, aerobic ? 1 : 0);
  }

  private spawnATP(from?: THREE.Vector3): void {
    if (from) _v1.copy(from);
    else this.cristaPoint(_v1);
    const fi = Math.floor(Math.random() * FIBRE_OFFSETS.length);
    this.fibreCenter(_v2, fi);
    _v2.x += (Math.random() - 0.5) * 2.6;
    _v2.y += 0.05;
    _v2.z += (Math.random() - 0.5) * 0.06;
    _v3.lerpVectors(_v1, _v2, 0.5);
    _v3.x += (Math.random() - 0.5) * 0.6;
    _v3.y += 0.05;
    _v3.z += 0.25 + Math.random() * 0.25;
    this.atp.spawn(_v1, _v3, _v2, 0.75 + Math.random() * 0.5, fi);
  }

  private spawnCO2(from?: THREE.Vector3): void {
    if (from) {
      _v1.copy(from);
    } else {
      const phi = (Math.random() - 0.5) * 1.6;
      _v1.set((Math.random() - 0.5) * 1.0, Math.cos(phi) * 0.36, Math.sin(phi) * 0.36);
      this.mito.localToWorld(_v1);
    }
    this.capPoint(_v2, 0.35, 0.85);
    _v3.lerpVectors(_v1, _v2, 0.5);
    _v3.x += (Math.random() - 0.5) * 0.3;
    _v3.y += 0.15;
    _v3.z += 0.2 + Math.random() * 0.15;
    this.co2.spawn(_v1, _v3, _v2, 1.5 + Math.random() * 0.7);
  }

  private spawnLactate(at?: THREE.Vector3): void {
    if (at) jitter(_v1.copy(at), 0.04);
    else _v1.set(0.35 + Math.random() * 0.5, -0.2 - Math.random() * 0.3, 0.15 + Math.random() * 0.3);
    _v2.set(
      _v1.x + (Math.random() - 0.5) * 0.5,
      _v1.y + (Math.random() - 0.5) * 0.35,
      _v1.z + (Math.random() - 0.5) * 0.4,
    );
    _v3.lerpVectors(_v1, _v2, 0.5);
    _v3.y += 0.05;
    this.lactate.spawn(_v1, _v3, _v2, 3.5 + Math.random() * 2.5);
  }

  private readonly onGlucoseArrive = (f: Flyer): void => {
    if (f.tag === 1 && this.oxy > 0.18) {
      // Aerobic: full breakdown inside the mitochondrion → lots of ATP + CO₂.
      for (let i = 0; i < 3; i++) this.spawnATP(f.b);
      this.spawnCO2(f.b);
      this.cristaeFlash = Math.min(1.5, this.cristaeFlash + 0.22);
    } else {
      // Anaerobic: split in the cytoplasm → lactic acid + a little ATP.
      for (let i = 0; i < 3; i++) this.spawnLactate(f.b);
      this.spawnATP(f.b);
    }
  };

  private readonly onO2Arrive = (): void => {
    this.cristaeFlash = Math.min(1.5, this.cristaeFlash + 0.03);
  };

  private readonly onAtpArrive = (f: Flyer): void => {
    const cur = this.fibreFlash[f.tag] ?? 0;
    this.fibreFlash[f.tag] = Math.min(1.5, cur + 0.08);
  };

  /* ---------------- per-frame ---------------- */

  protected tick(dtRaw: number, time: number, input: ControlInput): void {
    if (!this.built) return;
    const dt = Math.min(0.05, Math.max(0, dtRaw));

    /* inputs (autopilot outside the hands-on phase) */
    let holding: boolean;
    let gSet: number;
    if (this.phase === 'handsOn') {
      holding = input.holding;
      gSet = clamp01(input.extra);
    } else if (this.phase === 'check') {
      holding = true;
      gSet = 0.9;
    } else {
      holding = time % 8 < 5.5;
      gSet = 0.85;
    }
    this.delivering = holding;

    /* respiration model */
    this.oxy = damp(this.oxy, holding ? 1 : 0, holding ? 1.3 : 0.45, dt);
    this.glu = damp(this.glu, gSet, 2.5, dt);
    this.aer = Math.min(this.oxy, this.glu);
    this.anaer = this.glu * (1 - smoothstep(0.15, 0.55, this.oxy));
    const targetE = 100 * clamp01(this.aer * 1.05 + this.anaer * 0.14);
    this.energy = damp(this.energy, targetE, targetE > this.energy ? 1.2 : 0.7, dt);
    const target = this.ctx?.def.readout.target ?? 80;
    if (this.phase === 'handsOn' && this.energy >= target) this.reached = true;

    this.holdPulse = damp(this.holdPulse, 0, 2.6, dt);
    this.gluPulse = damp(this.gluPulse, 0, 2.2, dt);
    this.cristaeFlash = damp(this.cristaeFlash, 0, 3, dt);

    /* spawning */
    const lp = this.lowPower ? 0.65 : 1;
    this.accO2 += dt * (holding ? 26 * lp : 0);
    this.accGlu += dt * this.glu * 7 * lp;
    this.accAtp += dt * (this.aer * 60 + this.anaer * 8) * lp;
    this.accCo2 += dt * this.aer * 10 * lp;
    this.accLac += dt * this.anaer * 5 * lp;
    for (let n = 0; this.accO2 >= 1 && n < 8; n++, this.accO2 -= 1) this.spawnO2();
    for (let n = 0; this.accGlu >= 1 && n < 4; n++, this.accGlu -= 1) this.spawnGlucose();
    for (let n = 0; this.accAtp >= 1 && n < 8; n++, this.accAtp -= 1) this.spawnATP();
    for (let n = 0; this.accCo2 >= 1 && n < 4; n++, this.accCo2 -= 1) this.spawnCO2();
    for (let n = 0; this.accLac >= 1 && n < 4; n++, this.accLac -= 1) this.spawnLactate();
    this.accO2 = Math.min(this.accO2, 2);
    this.accGlu = Math.min(this.accGlu, 2);
    this.accAtp = Math.min(this.accAtp, 2);
    this.accCo2 = Math.min(this.accCo2, 2);
    this.accLac = Math.min(this.accLac, 2);

    /* particle updates */
    this.o2.update(dt, time, (f) => smoothstep(0, 0.08, f.t) * (1 - smoothstep(0.82, 1, f.t)), this.onO2Arrive);
    this.glucose.update(
      dt,
      time,
      (f) => smoothstep(0, 0.1, f.t) * (1 - smoothstep(0.86, 1, f.t)),
      this.onGlucoseArrive,
    );
    this.co2.update(dt, time, (f) => smoothstep(0, 0.12, f.t) * (1 - smoothstep(0.85, 1, f.t)));
    this.atp.update(
      dt,
      (f) =>
        smoothstep(0, 0.08, f.t) *
        (1 - smoothstep(0.88, 1, f.t)) *
        (0.72 + 0.28 * Math.sin(time * 30 + f.seed * 50)),
      this.onAtpArrive,
    );
    this.lactate.update(dt, (f) => Math.sin(Math.PI * clamp01(f.t)) * 0.85);

    /* focus weights for tour beats */
    let tc = 1;
    let tm = 1;
    let tf = 1;
    if (this.phase === 'tour' && this.tourBeat >= 1) {
      tc = this.tourBeat === 1 ? 1.25 : 0.5;
      tm = this.tourBeat === 2 ? 1.25 : 0.55;
      tf = this.tourBeat >= 3 ? 1.25 : 0.5;
    }
    this.fCap = damp(this.fCap, tc, 3, dt);
    this.fMito = damp(this.fMito, tm, 3, dt);
    this.fFibre = damp(this.fFibre, tf, 3, dt);

    this.updateCapillary(time);
    this.updateMito(time);
    this.updateFibres(dt);

    /* ambient drift */
    this.dust.rotation.y = Math.sin(time * 0.05) * 0.08;
    this.dust.position.y = Math.sin(time * 0.13) * 0.03;
  }

  private updateCapillary(time: number): void {
    const n = this.rbcSeeds.length;
    for (let i = 0; i < n; i++) {
      const seed = this.rbcSeeds[i] ?? 0;
      const u = frac(i / n + time * 0.035 + seed * 0.02);
      this.capCurve.getPointAt(u, _v1);
      this.capCurve.getTangentAt(u, _tan);
      _v1.y += Math.sin(seed * 20) * 0.024;
      _v1.z += Math.cos(seed * 20) * 0.024;
      _dummy.position.copy(_v1);
      _v2.copy(_v1).add(_tan);
      _dummy.lookAt(_v2);
      _dummy.rotateX(Math.sin(time * 1.3 + seed * 9) * 0.6);
      _dummy.scale.setScalar(1);
      _dummy.updateMatrix();
      this.rbc.setMatrixAt(i, _dummy.matrix);
    }
    this.rbc.instanceMatrix.needsUpdate = true;

    this.rbcMat.emissiveIntensity =
      (0.55 + (this.delivering ? 0.45 : 0.15) + this.holdPulse * 0.9 + Math.sin(time * 6) * 0.05) * this.fCap;
    setFresnel(this.capRim, (0.65 + this.holdPulse * 0.7 + (this.delivering ? 0.25 : 0)) * this.fCap);
    this.plasmaMat.opacity = (0.04 + this.glu * 0.22 + this.gluPulse * 0.25) * Math.min(1.1, this.fCap);
  }

  private updateMito(time: number): void {
    const a = this.aer;
    const fm = this.fMito;
    this.mito.rotation.y = Math.sin(time * 0.2) * 0.08;
    this.mito.position.y = Math.sin(time * 0.35) * 0.012;

    const flicker = Math.sin(time * 13) * 0.08 * a + Math.sin(time * 5.7) * 0.05 * a;
    this.cristaeMat.emissiveIntensity = (0.3 + 2.3 * a + this.cristaeFlash * 0.9 + flicker) * fm;
    this.cristaeEdgeMat.opacity = clamp01((0.2 + 0.6 * a + this.cristaeFlash * 0.3) * fm);
    this.synthMat.opacity = clamp01((0.08 + 0.9 * a * (0.8 + 0.2 * Math.sin(time * 9))) * fm);
    setFresnel(this.mitoRim, (0.8 + 0.8 * a + this.holdPulse * 0.4) * fm);
    setFresnel(this.innerRim, (0.35 + 0.7 * a + this.cristaeFlash * 0.4) * fm);

    const gm = this.matrixGlow.material;
    gm.opacity = clamp01((0.06 + 0.5 * a + this.cristaeFlash * 0.2) * fm);
    const pulse = 1 + Math.sin(time * 2.4) * 0.04 * a;
    this.matrixGlow.scale.set(1.9 * pulse, 0.95 * pulse, 1);
    this.mitoLight.intensity = (0.2 + 2.2 * a + this.cristaeFlash * 0.8) * fm;
  }

  private updateFibres(dt: number): void {
    if (!this.built) return;
    const e = clamp01(this.energy / 100);
    this.twitch += dt * (1.1 + 4.2 * e);
    let di = 0;
    let ki = 0;
    let ti = 0;
    let flashSum = 0;
    for (let fi = 0; fi < FIBRE_OFFSETS.length; fi++) {
      const fl = damp(this.fibreFlash[fi] ?? 0, 0, 3.2, dt);
      this.fibreFlash[fi] = fl;
      flashSum += fl;
      const pulse = 0.5 - 0.5 * Math.cos(this.twitch + fi * 0.45);
      const c = clamp01(Math.pow(e, 1.25) * pulse * pulse * 1.1 + fl * 0.25);
      const s = lerp(SARC_REST, SARC_SHORT, c);
      const L = s * SARC_N;
      this.fibreCenter(_v1, fi);
      const x0 = _v1.x - L / 2;
      for (let k = 0; k <= SARC_N; k++) {
        _m4.makeTranslation(x0 + k * s, _v1.y, _v1.z);
        this.discs.setMatrixAt(di++, _m4);
      }
      for (let k = 0; k < SARC_N; k++) {
        const left = x0 + k * s;
        const right = left + s;
        const mid = left + s / 2;
        for (let j = 0; j < 3; j++) {
          const ang = (j / 3) * Math.PI * 2 + fi;
          _m4.makeTranslation(mid, _v1.y + Math.cos(ang) * 0.02, _v1.z + Math.sin(ang) * 0.02);
          this.thick.setMatrixAt(ki++, _m4);
          const b = ang + Math.PI / 3;
          const yy = _v1.y + Math.cos(b) * 0.033;
          const zz = _v1.z + Math.sin(b) * 0.033;
          _m4.makeTranslation(left + THIN_LEN / 2 + 0.006, yy, zz);
          this.thin.setMatrixAt(ti++, _m4);
          _m4.makeTranslation(right - THIN_LEN / 2 - 0.006, yy, zz);
          this.thin.setMatrixAt(ti++, _m4);
        }
      }
    }
    this.discs.instanceMatrix.needsUpdate = true;
    this.thick.instanceMatrix.needsUpdate = true;
    this.thin.instanceMatrix.needsUpdate = true;

    const flash = flashSum / FIBRE_OFFSETS.length;
    const ff = this.fFibre;
    this.discMat.emissiveIntensity = (0.35 + 1.5 * e + flash * 0.9) * ff;
    this.thickMat.emissiveIntensity = (0.3 + 1.3 * e + flash * 0.7) * ff;
    this.thinMat.emissiveIntensity = (0.35 + 0.9 * e + flash * 0.5) * ff;
    setFresnel(this.sheathRim, (0.3 + 0.6 * e + flash * 0.4) * ff);
  }

  /* ---------------- camera framing ---------------- */

  private setFramingGoal(): void {
    const f = this.framing;
    let t: [number, number, number] = [0, 0.06, -0.12];
    let r = 1.3;
    let d: [number, number, number] = [0.22, 0.18, 1];
    let drift = 0.08;
    if (this.phase === 'tour') {
      if (this.tourBeat === 1) {
        t = [-0.4, 0.5, -0.15];
        r = 0.92;
        d = [-0.28, 0.22, 1];
        drift = 0.06;
      } else if (this.tourBeat === 2) {
        t = [0, 0, 0];
        r = 0.8;
        d = [0.32, 0.34, 1];
        drift = 0.06;
      } else if (this.tourBeat >= 3) {
        t = [0.05, -0.42, -0.3];
        r = 1.05;
        d = [0.18, -0.02, 1];
        drift = 0.07;
      }
    } else if (this.phase === 'handsOn') {
      t = [0, 0.06, -0.1];
      r = 1.26;
      d = [0.16, 0.16, 1];
      drift = 0.05;
    } else {
      t = [0.04, 0.04, -0.12];
      r = 1.18;
      d = [-0.2, 0.14, 1];
      drift = 0.07;
    }
    f.target.set(t[0], t[1], t[2]);
    f.radius = r * (this.portrait ? 0.84 : 1);
    f.dir.set(d[0], d[1], d[2]);
    f.drift = drift;
    f.ease = 2.2;
    f.minDistance = 0.6;
  }

  /* ---------------- readout ---------------- */

  private noteText(target: number): string | undefined {
    if (this.phase === 'handsOn') {
      if (this.reached) return 'AEROBIC';
      if (!this.hasHeld && !this.delivering) return 'HOLD FOR O₂';
    }
    if (this.glu < 0.12) return 'NO GLUCOSE';
    if (this.oxy < 0.22 && this.anaer > 0.2) return 'ANAEROBIC';
    if (this.energy < target && this.oxy > 0.6 && this.glu + 0.1 < this.oxy) return 'MORE GLUCOSE';
    if (this.delivering) return 'O₂ IN';
    if (this.aer > 0.6) return 'AEROBIC';
    return undefined;
  }

  getReadout(): Readout {
    if (!this.ctx) {
      return { label: 'ENERGY', value: 0, unit: '%', progress: 0, status: 'idle' };
    }
    const spec = this.def.readout;
    const e = Math.min(spec.max, Math.max(spec.min, this.energy));
    const note = this.noteText(spec.target);
    let status: ReadoutStatus;
    if (this.phase === 'check') status = 'done';
    else if (this.phase === 'tour') status = this.delivering ? 'active' : 'idle';
    else if (this.reached) status = 'done';
    else if (this.hasHeld && (note === 'ANAEROBIC' || note === 'NO GLUCOSE')) status = 'warn';
    else status = this.delivering || e > 1 ? 'active' : 'idle';
    return this.makeReadout(e, { status, note });
  }
}