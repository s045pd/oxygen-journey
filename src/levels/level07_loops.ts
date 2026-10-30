/**
 * Oxygen Journey — Level 07 "LOOPS": double circulation.
 *
 * One red blood cell, two loops:
 *   pulmonary — right ventricle → lungs (picks up O2, drops CO2) → left atrium
 *   systemic  — left ventricle → body tissues (drops O2, picks up CO2) → right atrium
 *
 * Hands-on: the slider routes the cell. 0 opens the pulmonary valve gate, 1 opens the
 * aortic (systemic) gate and spotlights that loop. Both loops must complete → readout 2.
 * Everything is procedural: arc-length flow tubes, lathe chambers, biconcave RBC.
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
  neonMaterial,
  rng,
  setFresnel,
  smoothstep,
} from './neon';

/* ------------------------------------------------------------------ palette */

const CYAN = 0x2ee8ff;
const VIOLET = 0x7b5cff;
const CRIMSON = 0xff2b55;
const AMBER = 0xffb22e;
const MINT = 0x3dffb4;
const PINK = 0xff6aa8;
const STOP = 0xff5a2e;

const C_CYAN = new THREE.Color(CYAN);
const C_AMBER = new THREE.Color(AMBER);
const C_VIOLET = new THREE.Color(VIOLET);
const C_CRIMSON = new THREE.Color(CRIMSON);
const C_MINT = new THREE.Color(MINT);
const C_STOP = new THREE.Color(STOP);
const OXY = new THREE.Color(CRIMSON);
const DEOXY = new THREE.Color(VIOLET);

/* ----------------------------------------------------------------- geometry */

type V3 = readonly [number, number, number];
type Leg = 'raRv' | 'gateR' | 'pulm' | 'laLv' | 'gateL' | 'sys';

const TRAIL_N = 48;
const CELL_R = 0.055;
/** World units per second along the big loops. */
const CELL_SPEED = 0.7;

// Heart chambers (viewer's left = patient's right side).
const RA_P: V3 = [-0.14, 0.1, 0.02];
const LA_P: V3 = [0.14, 0.1, 0.02];
const RV_P: V3 = [-0.1, -0.13, 0.04];
const LV_P: V3 = [0.11, -0.15, 0.04];

const LUNG_C: V3 = [0, 0.88, -0.06];
const LOBE_X = 0.34;
const LOBE_S: V3 = [0.24, 0.32, 0.2];

const BODY_C: V3 = [0, -0.98, -0.06];
const BODY_S: V3 = [0.56, 0.2, 0.2];

const RARV: V3[] = [
  [-0.14, 0.1, 0.05],
  [-0.145, 0.0, 0.07],
  [-0.1, -0.14, 0.07],
];

const LALV: V3[] = [
  [0.14, 0.1, 0.05],
  [0.145, 0.0, 0.07],
  [0.11, -0.15, 0.07],
];

const PULM: V3[] = [
  [-0.1, -0.14, 0.07],
  [-0.05, -0.02, 0.13],
  [-0.07, 0.28, 0.12],
  [-0.22, 0.52, 0.08],
  [-0.4, 0.74, 0.02],
  [-0.44, 0.98, 0.0],
  [-0.2, 1.1, 0.04],
  [0.2, 1.1, 0.04],
  [0.44, 0.98, 0.0],
  [0.4, 0.74, 0.02],
  [0.27, 0.46, 0.1],
  [0.2, 0.24, 0.12],
  [0.14, 0.1, 0.05],
];

const SYS: V3[] = [
  [0.11, -0.15, 0.07],
  [0.06, 0.0, 0.12],
  [0.08, 0.3, -0.02],
  [0.3, 0.3, -0.1],
  [0.52, -0.06, -0.04],
  [0.6, -0.5, 0.0],
  [0.46, -0.9, 0.04],
  [0.2, -1.08, 0.08],
  [-0.2, -1.08, 0.08],
  [-0.46, -0.9, 0.04],
  [-0.6, -0.5, 0.0],
  [-0.5, -0.12, 0.04],
  [-0.3, 0.06, 0.07],
  [-0.14, 0.1, 0.05],
];

/* --------------------------------------------------------------- scratch */

const _a = new THREE.Vector3();
const _d = new THREE.Vector3();
const _tan = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _c = new THREE.Color();
const _Y = new THREE.Vector3(0, 1, 0);
const _Z = new THREE.Vector3(0, 0, 1);

/* ---------------------------------------------------------------- helpers */

const vec = (p: V3): THREE.Vector3 => new THREE.Vector3(p[0], p[1], p[2]);

function curveOf(points: V3[]): THREE.CatmullRomCurve3 {
  return new THREE.CatmullRomCurve3(points.map(vec), false, 'centripetal', 0.5);
}

/** 0 outside [a,b], 1 inside, soft shoulders. */
function bump(t: number, a: number, b: number): number {
  return smoothstep(a, a + 0.04, t) * (1 - smoothstep(b - 0.04, b, t));
}

function randUnit(out: THREE.Vector3, r: () => number = Math.random): THREE.Vector3 {
  const z = r() * 2 - 1;
  const th = r() * Math.PI * 2;
  const s = Math.sqrt(Math.max(0, 1 - z * z));
  return out.set(s * Math.cos(th), s * Math.sin(th), z);
}

function quadBezier(
  out: THREE.Vector3,
  a: THREE.Vector3,
  c: THREE.Vector3,
  b: THREE.Vector3,
  t: number,
): THREE.Vector3 {
  const u = 1 - t;
  return out.set(
    u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    u * u * a.y + 2 * u * t * c.y + t * t * b.y,
    u * u * a.z + 2 * u * t * c.z + t * t * b.z,
  );
}

function setFresnelColor(mat: THREE.ShaderMaterial, c: THREE.Color): void {
  const u = mat.uniforms['uColor'];
  if (u) (u.value as THREE.Color).copy(c);
}

/** Arc-length lookup over a curve: cheap per-frame position + tangent. */
class PathLUT {
  readonly length: number;
  private readonly pts: THREE.Vector3[];
  private readonly n: number;

  constructor(curve: THREE.Curve<THREE.Vector3>, n: number) {
    this.n = Math.max(2, n);
    this.pts = curve.getSpacedPoints(this.n);
    this.length = curve.getLength();
  }

  private idx(t: number): [number, number] {
    const f = clamp01(t) * this.n;
    const i = Math.min(this.n - 1, Math.floor(f));
    return [i, f - i];
  }

  at(t: number, out: THREE.Vector3): THREE.Vector3 {
    const [i, k] = this.idx(t);
    return out.copy(this.pts[i]!).lerp(this.pts[i + 1]!, k);
  }

  tangent(t: number, out: THREE.Vector3): THREE.Vector3 {
    const [i] = this.idx(t);
    return out.subVectors(this.pts[i + 1]!, this.pts[i]!).normalize();
  }

  /** First/last normalised parameter where `test` holds. */
  zone(test: (p: THREE.Vector3) => boolean, fallback: [number, number]): [number, number] {
    let a = -1;
    let b = -1;
    for (let i = 0; i <= this.n; i++) {
      if (test(this.pts[i]!)) {
        if (a < 0) a = i;
        b = i;
      }
    }
    return a < 0 ? fallback : [a / this.n, b / this.n];
  }
}

/** Biconcave disc (classic RBC profile), axis = Y, radius 1. */
function rbcGeometry(seg: number): THREE.LatheGeometry {
  const h = (r: number): number =>
    0.5 * Math.sqrt(Math.max(0, 1 - r * r)) * (0.207 + 2.003 * r * r - 1.123 * r * r * r * r);
  const pts: THREE.Vector2[] = [];
  const n = 22;
  for (let i = 0; i <= n; i++) {
    const r = Math.sin((i / n) * Math.PI * 0.5);
    pts.push(new THREE.Vector2(r, -h(r)));
  }
  for (let i = n - 1; i >= 0; i--) {
    const r = Math.sin((i / n) * Math.PI * 0.5);
    pts.push(new THREE.Vector2(r, h(r)));
  }
  return new THREE.LatheGeometry(pts, seg);
}

/** Rounded teardrop (point down) for the ventricles and heart shell. */
function teardropGeometry(seg: number): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = [];
  const n = 26;
  for (let i = 0; i <= n; i++) {
    const a = Math.PI * (1 - i / n);
    const t = a / Math.PI;
    const c = Math.cos(a);
    pts.push(new THREE.Vector2(Math.max(0, Math.sin(a) * (1 - 0.42 * t * t)), c < 0 ? c * 1.25 : c));
  }
  return new THREE.LatheGeometry(pts, seg);
}

/* ------------------------------------------------------------ flow tube */

type FlowU = {
  uA: { value: THREE.Color };
  uB: { value: THREE.Color };
  uZone: { value: THREE.Color };
  uZ0: { value: number };
  uZ1: { value: number };
  uTime: { value: number };
  uBands: { value: number };
  uSpeed: { value: number };
  uGain: { value: number };
  uFlow: { value: number };
  uZoneGain: { value: number };
};

const FLOW_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const FLOW_FRAG = /* glsl */ `
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uZone;
uniform float uZ0;
uniform float uZ1;
uniform float uTime;
uniform float uBands;
uniform float uSpeed;
uniform float uGain;
uniform float uFlow;
uniform float uZoneGain;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  float u = vUv.x;
  vec3 col = mix(uA, uB, smoothstep(uZ0, uZ1, u));
  float z = smoothstep(uZ0 - 0.03, uZ0 + 0.03, u) * (1.0 - smoothstep(uZ1 - 0.03, uZ1 + 0.03, u));
  col = mix(col, uZone, z * uZoneGain);
  float ph = fract(u * uBands - uTime * uSpeed);
  float band = smoothstep(0.0, 0.12, ph) * (1.0 - smoothstep(0.12, 0.5, ph));
  float fr = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.5);
  float body = 0.26 + 0.74 * fr;
  float ends = smoothstep(0.0, 0.03, u) * (1.0 - smoothstep(0.97, 1.0, u));
  vec3 c = col * (body + band * uFlow * 0.85) * uGain * ends;
  gl_FragColor = vec4(c, 1.0);
}
`;

function flowTube(a: number, b: number, zone: number, bands: number): { mat: THREE.ShaderMaterial; u: FlowU } {
  const u: FlowU = {
    uA: { value: new THREE.Color(a) },
    uB: { value: new THREE.Color(b) },
    uZone: { value: new THREE.Color(zone) },
    uZ0: { value: 0.4 },
    uZ1: { value: 0.6 },
    uTime: { value: 0 },
    uBands: { value: bands },
    uSpeed: { value: 0.32 },
    uGain: { value: 1 },
    uFlow: { value: 1 },
    uZoneGain: { value: 0.45 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: FLOW_VERT,
    fragmentShader: FLOW_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return { mat, u };
}

/* ------------------------------------------------------------------ RBC */

interface RbcRig {
  group: THREE.Group;
  spin: THREE.Group;
  mat: THREE.MeshPhysicalMaterial;
  rim: THREE.ShaderMaterial;
  glow: THREE.SpriteMaterial;
}

function makeRbcRig(seg: number): RbcRig {
  const group = new THREE.Group();
  const spin = new THREE.Group();
  group.add(spin);
  const geo = rbcGeometry(seg);
  const mat = new THREE.MeshPhysicalMaterial({
    color: OXY.clone().multiplyScalar(0.22),
    emissive: OXY,
    emissiveIntensity: 0.9,
    roughness: 0.34,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.18,
  });
  const body = new THREE.Mesh(geo, mat);
  body.renderOrder = 10;
  const rim = fresnelMaterial(CRIMSON, { power: 2, intensity: 1.4 });
  const shell = new THREE.Mesh(geo, rim);
  shell.scale.setScalar(1.07);
  shell.renderOrder = 11;
  const glow = new THREE.SpriteMaterial({
    map: glowTexture(),
    color: CRIMSON,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sprite = new THREE.Sprite(glow);
  sprite.scale.setScalar(4.4);
  sprite.renderOrder = 12;
  spin.add(body, shell);
  group.add(sprite);
  return { group, spin, mat, rim, glow };
}

function tintRbc(rig: RbcRig, c: THREE.Color, flash: number): void {
  rig.mat.color.copy(c).multiplyScalar(0.22);
  rig.mat.emissive.copy(c);
  rig.mat.emissiveIntensity = 0.85 + flash * 1.3;
  setFresnelColor(rig.rim, c);
  setFresnel(rig.rim, 1.3 + flash * 1.6);
  rig.glow.color.copy(c);
  rig.glow.opacity = 0.5 + flash * 0.45;
}

/* --------------------------------------------------------------- types */

interface Spark {
  alive: boolean;
  inward: boolean;
  tissue: boolean;
  p: number;
  dur: number;
  from: THREE.Vector3;
  ctrl: THREE.Vector3;
  to: THREE.Vector3;
  color: THREE.Color;
}

interface Valve {
  group: THREE.Group;
  ring: THREE.MeshStandardMaterial;
  disc: THREE.MeshBasicMaterial;
  iris: THREE.Mesh;
}

/* ================================================================ LEVEL */

export class Level07Loops extends LevelScene {
  private built = false;

  private lutPulm!: PathLUT;
  private lutSys!: PathLUT;
  private lutRaRv!: PathLUT;
  private lutLaLv!: PathLUT;
  private pulmZone: [number, number] = [0.36, 0.72];
  private sysZone: [number, number] = [0.4, 0.66];
  private pulmU!: FlowU;
  private sysU!: FlowU;

  private readonly heart = new THREE.Group();
  private readonly atriaBlood: THREE.MeshStandardMaterial[] = [];
  private readonly ventBlood: THREE.MeshStandardMaterial[] = [];
  private heartRim!: THREE.ShaderMaterial;

  private readonly lungs = new THREE.Group();
  private lungMat!: THREE.MeshPhysicalMaterial;
  private lungRim!: THREE.ShaderMaterial;
  private alvMat!: THREE.PointsMaterial;
  private airwayMat!: THREE.MeshStandardMaterial;

  private bodyMat!: THREE.MeshPhysicalMaterial;
  private bodyRim!: THREE.ShaderMaterial;
  private tissueMat!: THREE.MeshStandardMaterial;
  private readonly tissuePos: THREE.Vector3[] = [];

  private valveP!: Valve;
  private valveA!: Valve;
  private readonly chevP: THREE.MeshStandardMaterial[] = [];
  private readonly chevA: THREE.MeshStandardMaterial[] = [];

  private flowPGeo!: THREE.BufferGeometry;
  private flowSGeo!: THREE.BufferGeometry;

  private rig!: RbcRig;
  private readonly sparks: Spark[] = [];
  private sparkGeo!: THREE.BufferGeometry;
  private trailGeo!: THREE.BufferGeometry;
  private readonly trailCols: THREE.Color[] = [];
  private trailIdx = 0;
  private readonly trailLast = new THREE.Vector3(999, 999, 999);
  private dust!: THREE.Points;

  private readonly cellPos = new THREE.Vector3();
  private leg: Leg = 'raRv';
  private legT = 0;
  private wait = 0;
  private oxy = 0.12;
  private oxyVis = 0.12;
  private pulmDone = false;
  private sysDone = false;
  private reached = false;
  private pulmFx = 0;
  private sysFx = 0;
  private tissueFx = 0;
  private lungFx = 0;
  private flash = 0;
  private emph = 0;
  private openP = 1;
  private openA = 0;
  private sliderRaw = 0;
  private accEx = 0;
  private vw = 0;
  private vh = 0;

  /* ----------------------------------------------------------- lifecycle */

  protected override onEnter(ctx: LevelContext): void {
    if (!this.built) {
      this.build(ctx.lowPower);
      this.built = true;
    }
    const f = this.framing;
    f.target.set(0, 0.15, 0);
    f.dir.set(0.12, 0.14, 1);
    f.drift = 0.08;
    f.ease = 2.2;
    f.minDistance = 1.2;
    this.applyRadius();
    this.resetCell();
    this.snapCamera();
  }

  protected override onResize(w: number, h: number): void {
    this.vw = w;
    this.vh = h;
    this.applyRadius();
  }

  private applyRadius(): void {
    const w = this.vw || window.innerWidth;
    const h = this.vh || window.innerHeight;
    this.framing.radius = h > w ? 1.05 : 1.5;
  }

  protected override onPhase(phase: LevelPhase): void {
    if (phase === 'handsOn') this.resetCell();
  }

  override onSlider(v: number): void {
    this.sliderRaw = clamp01(v);
  }

  private resetCell(): void {
    this.leg = 'raRv';
    this.legT = 0;
    this.wait = 0;
    this.oxy = 0.12;
    this.oxyVis = 0.12;
    this.pulmDone = false;
    this.sysDone = false;
    this.reached = false;
    this.pulmFx = 0;
    this.sysFx = 0;
    this.accEx = 0;
    for (const s of this.sparks) s.alive = false;
    this.trailLast.set(999, 999, 999);
    for (const c of this.trailCols) c.setRGB(0, 0, 0);
    if (this.lutRaRv) {
      this.lutRaRv.at(0, this.cellPos);
      if (this.trailGeo) {
        const pos = this.trailGeo.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < TRAIL_N; i++) pos.setXYZ(i, this.cellPos.x, this.cellPos.y, this.cellPos.z);
        pos.needsUpdate = true;
      }
    }
  }

  /* ---------------------------------------------------------------- build */

  private build(lowPower: boolean): void {
    const R = rng(707);
    const sphere = new THREE.SphereGeometry(1, lowPower ? 24 : 40, lowPower ? 16 : 28);
    const tear = teardropGeometry(lowPower ? 22 : 32);

    /* Paths */
    const pulmCurve = curveOf(PULM);
    const sysCurve = curveOf(SYS);
    this.lutPulm = new PathLUT(pulmCurve, 360);
    this.lutSys = new PathLUT(sysCurve, 360);
    this.lutRaRv = new PathLUT(curveOf(RARV), 60);
    this.lutLaLv = new PathLUT(curveOf(LALV), 60);
    this.pulmZone = this.lutPulm.zone((p) => p.y > 0.78, [0.36, 0.72]);
    this.sysZone = this.lutSys.zone((p) => p.y < -0.84, [0.4, 0.66]);

    const pulm = flowTube(VIOLET, CRIMSON, CYAN, 20);
    const sys = flowTube(CRIMSON, VIOLET, AMBER, 24);
    this.pulmU = pulm.u;
    this.sysU = sys.u;
    this.pulmU.uZ0.value = this.pulmZone[0];
    this.pulmU.uZ1.value = this.pulmZone[1];
    this.sysU.uZ0.value = this.sysZone[0];
    this.sysU.uZ1.value = this.sysZone[1];
    const seg = lowPower ? 180 : 300;
    const pulmTube = new THREE.Mesh(new THREE.TubeGeometry(pulmCurve, seg, 0.034, 12, false), pulm.mat);
    const sysTube = new THREE.Mesh(new THREE.TubeGeometry(sysCurve, seg, 0.036, 12, false), sys.mat);
    pulmTube.renderOrder = 5;
    sysTube.renderOrder = 5;
    this.root.add(pulmTube, sysTube);

    /* Heart */
    this.root.add(this.heart);
    const chamber = (geo: THREE.BufferGeometry, p: V3, s: V3, color: number, atrium: boolean): void => {
      const glass = new THREE.Mesh(geo, glassMaterial(color, { opacity: 0.2, emissive: 0.25 }));
      glass.position.set(p[0], p[1], p[2]);
      glass.scale.set(s[0], s[1], s[2]);
      glass.renderOrder = 3;
      const bm = neonMaterial(color, 0.8, 0.3);
      const blood = new THREE.Mesh(geo, bm);
      blood.position.copy(glass.position);
      blood.scale.copy(glass.scale).multiplyScalar(0.72);
      (atrium ? this.atriaBlood : this.ventBlood).push(bm);
      this.heart.add(blood, glass);
    };
    chamber(sphere, RA_P, [0.12, 0.12, 0.12], VIOLET, true);
    chamber(sphere, LA_P, [0.12, 0.12, 0.12], CRIMSON, true);
    chamber(tear, RV_P, [0.13, 0.18, 0.12], VIOLET, false);
    chamber(tear, LV_P, [0.14, 0.2, 0.13], CRIMSON, false);

    const shell = new THREE.Mesh(tear, glassMaterial(PINK, { opacity: 0.07, emissive: 0.1 }));
    shell.position.set(0, -0.04, 0);
    shell.scale.set(0.4, 0.36, 0.28);
    shell.renderOrder = 4;
    this.heartRim = fresnelMaterial(PINK, { power: 2.4, intensity: 0.8 });
    const hrim = new THREE.Mesh(tear, this.heartRim);
    hrim.position.copy(shell.position);
    hrim.scale.copy(shell.scale).multiplyScalar(1.01);
    hrim.renderOrder = 5;
    const septum = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.46, 0.18), neonMaterial(PINK, 0.7, 0.2));
    septum.position.set(0, -0.04, 0);
    this.heart.add(shell, hrim, septum);

    /* Lungs */
    this.lungs.position.set(LUNG_C[0], LUNG_C[1], LUNG_C[2]);
    this.root.add(this.lungs);
    this.lungMat = glassMaterial(CYAN, { opacity: 0.11, emissive: 0.14 });
    this.lungRim = fresnelMaterial(CYAN, { power: 2.5, intensity: 0.8 });
    this.alvMat = glowPointsMaterial(CYAN, 0.03, 0.55);
    const nAlv = lowPower ? 70 : 120;
    for (const sx of [-1, 1]) {
      const cx = sx * LOBE_X;
      const lobe = new THREE.Mesh(sphere, this.lungMat);
      lobe.position.set(cx, 0, 0);
      lobe.scale.set(LOBE_S[0], LOBE_S[1], LOBE_S[2]);
      lobe.renderOrder = 1;
      const rim = new THREE.Mesh(sphere, this.lungRim);
      rim.position.copy(lobe.position);
      rim.scale.copy(lobe.scale).multiplyScalar(1.01);
      rim.renderOrder = 2;
      const ap = new Float32Array(nAlv * 3);
      for (let i = 0; i < nAlv; i++) {
        randUnit(_d, R).multiplyScalar(Math.cbrt(R()) * 0.86);
        ap[i * 3] = cx + _d.x * LOBE_S[0];
        ap[i * 3 + 1] = _d.y * LOBE_S[1];
        ap[i * 3 + 2] = _d.z * LOBE_S[2];
      }
      const ag = new THREE.BufferGeometry();
      ag.setAttribute('position', new THREE.BufferAttribute(ap, 3));
      this.lungs.add(lobe, rim, new THREE.Points(ag, this.alvMat));
    }
    this.airwayMat = neonMaterial(CYAN, 0.9, 0.2);
    const trachea = new THREE.LineCurve3(new THREE.Vector3(0, 0.6, 0.02), new THREE.Vector3(0, 0.34, 0.02));
    this.lungs.add(new THREE.Mesh(new THREE.TubeGeometry(trachea, 12, 0.019, 8, false), this.airwayMat));
    for (const sx of [-1, 1]) {
      const br = curveOf([
        [0, 0.34, 0.02],
        [sx * 0.14, 0.26, 0.0],
        [sx * 0.3, 0.14, -0.02],
      ]);
      this.lungs.add(new THREE.Mesh(new THREE.TubeGeometry(br, 20, 0.015, 8, false), this.airwayMat));
    }

    /* Body tissues */
    this.bodyMat = glassMaterial(AMBER, { opacity: 0.1, emissive: 0.12 });
    const body = new THREE.Mesh(sphere, this.bodyMat);
    body.position.set(BODY_C[0], BODY_C[1], BODY_C[2]);
    body.scale.set(BODY_S[0], BODY_S[1], BODY_S[2]);
    body.renderOrder = 1;
    this.bodyRim = fresnelMaterial(AMBER, { power: 2.5, intensity: 0.7 });
    const brim = new THREE.Mesh(sphere, this.bodyRim);
    brim.position.copy(body.position);
    brim.scale.copy(body.scale).multiplyScalar(1.01);
    brim.renderOrder = 2;
    this.root.add(body, brim);

    const nTis = lowPower ? 12 : 18;
    this.tissueMat = neonMaterial(AMBER, 0.6, 0.25);
    const tissue = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), this.tissueMat, nTis);
    const m4 = new THREE.Matrix4();
    const sc = new THREE.Vector3();
    const qq = new THREE.Quaternion();
    for (let i = 0; i < nTis; i++) {
      randUnit(_d, R).multiplyScalar(0.35 + 0.5 * Math.cbrt(R()));
      const p = new THREE.Vector3(
        BODY_C[0] + _d.x * BODY_S[0],
        BODY_C[1] + _d.y * BODY_S[1] * 0.7,
        BODY_C[2] - Math.abs(_d.z) * BODY_S[2] * 0.6,
      );
      this.tissuePos.push(p);
      const s = 0.028 + R() * 0.024;
      sc.set(s * 1.6, s, s);
      qq.setFromAxisAngle(_Z, (R() - 0.5) * 1.2);
      m4.compose(p, qq, sc);
      tissue.setMatrixAt(i, m4);
    }
    tissue.instanceMatrix.needsUpdate = true;
    this.root.add(tissue);

    /* Valve gates */
    this.valveP = this.makeValve(this.lutPulm, 0.07);
    this.valveA = this.makeValve(this.lutSys, 0.065);

    /* Chevrons after each valve (chase lights when the gate is open) */
    const coneGeo = new THREE.ConeGeometry(0.018, 0.045, 12);
    const chev = (lut: PathLUT, list: THREE.MeshStandardMaterial[]): void => {
      for (let k = 0; k < 3; k++) {
        const t = 0.11 + k * 0.035;
        const mat = neonMaterial(MINT, 1.0, 0.2);
        const m = new THREE.Mesh(coneGeo, mat);
        lut.at(t, m.position);
        m.quaternion.setFromUnitVectors(_Y, lut.tangent(t, _tan));
        m.renderOrder = 7;
        list.push(mat);
        this.root.add(m);
      }
    };
    chev(this.lutPulm, this.chevP);
    chev(this.lutSys, this.chevA);

    /* Ambient circulation particles */
    this.flowPGeo = this.makeFlow(lowPower ? 26 : 40);
    this.flowSGeo = this.makeFlow(lowPower ? 28 : 46);

    /* The cell */
    this.rig = makeRbcRig(lowPower ? 24 : 40);
    this.rig.group.scale.setScalar(CELL_R);
    this.root.add(this.rig.group);

    /* Gas sparks */
    const nSp = lowPower ? 26 : 40;
    for (let i = 0; i < nSp; i++) {
      this.sparks.push({
        alive: false,
        inward: true,
        tissue: false,
        p: 0,
        dur: 0.5,
        from: new THREE.Vector3(),
        ctrl: new THREE.Vector3(),
        to: new THREE.Vector3(),
        color: new THREE.Color(),
      });
    }
    this.sparkGeo = new THREE.BufferGeometry();
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nSp * 3), 3));
    this.sparkGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nSp * 3), 3));
    const sp = new THREE.Points(this.sparkGeo, glowPointsMaterial(0xffffff, 0.05, 1, true));
    sp.frustumCulled = false;
    sp.renderOrder = 9;
    this.root.add(sp);

    /* Trail */
    for (let i = 0; i < TRAIL_N; i++) this.trailCols.push(new THREE.Color(0, 0, 0));
    this.trailGeo = new THREE.BufferGeometry();
    this.trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 3), 3));
    this.trailGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 3), 3));
    const tr = new THREE.Points(this.trailGeo, glowPointsMaterial(0xffffff, 0.04, 0.9, true));
    tr.frustumCulled = false;
    tr.renderOrder = 8;
    this.root.add(tr);

    /* Dust */
    const nDust = lowPower ? 60 : 120;
    const dp = new Float32Array(nDust * 3);
    for (let i = 0; i < nDust; i++) {
      dp[i * 3] = (R() - 0.5) * 3.6;
      dp[i * 3 + 1] = (R() - 0.5) * 3.6;
      dp[i * 3 + 2] = -1.8 + R() * 1.5;
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    this.dust = new THREE.Points(dg, glowPointsMaterial(VIOLET, 0.018, 0.3));
    this.root.add(this.dust);
  }

  private makeValve(lut: PathLUT, t: number): Valve {
    const group = new THREE.Group();
    lut.at(t, group.position);
    group.quaternion.setFromUnitVectors(_Z, lut.tangent(t, _tan));
    const ring = neonMaterial(MINT, 1.2, 0.2);
    const torus = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 8, 40), ring);
    const disc = new THREE.MeshBasicMaterial({
      color: STOP,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const iris = new THREE.Mesh(new THREE.CircleGeometry(0.046, 32), disc);
    torus.renderOrder = 7;
    iris.renderOrder = 7;
    group.add(torus, iris);
    this.root.add(group);
    return { group, ring, disc, iris };
  }

  private makeFlow(n: number): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const pts = new THREE.Points(g, glowPointsMaterial(0xffffff, 0.034, 0.85, true));
    pts.frustumCulled = false;
    pts.renderOrder = 6;
    this.root.add(pts);
    return g;
  }

  private updateFlow(
    geo: THREE.BufferGeometry,
    lut: PathLUT,
    zone: [number, number],
    time: number,
    gain: number,
    a: THREE.Color,
    b: THREE.Color,
  ): void {
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const col = geo.getAttribute('color') as THREE.BufferAttribute;
    const n = pos.count;
    for (let i = 0; i < n; i++) {
      const t = frac(i / n + time * 0.05);
      lut.at(t, _a);
      pos.setXYZ(i, _a.x, _a.y, _a.z);
      _c.copy(a).lerp(b, smoothstep(zone[0], zone[1], t));
      const k = gain * smoothstep(0.02, 0.08, t) * (1 - smoothstep(0.92, 0.98, t));
      col.setXYZ(i, _c.r * k, _c.g * k, _c.b * k);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  /* -------------------------------------------------------- cell journey */

  private advance(dt: number, live: boolean, routeSys: boolean): void {
    switch (this.leg) {
      case 'raRv':
        this.legT += dt / 0.9;
        if (this.legT >= 1) {
          this.legT = 1;
          this.leg = 'gateR';
          this.wait = 0;
        }
        break;
      case 'gateR':
        this.wait += dt;
        if (live ? !routeSys && this.wait > 0.2 : this.wait > 0.5) {
          this.leg = 'pulm';
          this.legT = 0;
        }
        break;
      case 'pulm': {
        const slow = 1 - 0.5 * bump(this.legT, this.pulmZone[0], this.pulmZone[1]);
        this.legT += (dt * CELL_SPEED * slow) / this.lutPulm.length;
        if (this.legT >= 1) {
          this.legT = 0;
          this.leg = 'laLv';
          this.pulmFx = 1;
          if (live) this.pulmDone = true;
        }
        break;
      }
      case 'laLv':
        this.legT += dt / 0.9;
        if (this.legT >= 1) {
          this.legT = 1;
          this.leg = 'gateL';
          this.wait = 0;
        }
        break;
      case 'gateL':
        this.wait += dt;
        if (live ? routeSys && this.wait > 0.2 : this.wait > 0.5) {
          this.leg = 'sys';
          this.legT = 0;
        }
        break;
      case 'sys': {
        const slow = 1 - 0.5 * bump(this.legT, this.sysZone[0], this.sysZone[1]);
        this.legT += (dt * CELL_SPEED * slow) / this.lutSys.length;
        if (this.legT >= 1) {
          this.legT = 0;
          this.leg = 'raRv';
          this.sysFx = 1;
          if (live) this.sysDone = true;
        }
        break;
      }
    }
  }

  private cellPose(time: number): void {
    switch (this.leg) {
      case 'raRv':
        this.lutRaRv.at(this.legT, this.cellPos);
        this.lutRaRv.tangent(this.legT, _tan);
        break;
      case 'gateR':
        this.lutRaRv.at(1, this.cellPos);
        this.lutPulm.tangent(0, _tan);
        this.cellPos.y += Math.sin(time * 6) * 0.006;
        break;
      case 'pulm':
        this.lutPulm.at(this.legT, this.cellPos);
        this.lutPulm.tangent(this.legT, _tan);
        break;
      case 'laLv':
        this.lutLaLv.at(this.legT, this.cellPos);
        this.lutLaLv.tangent(this.legT, _tan);
        break;
      case 'gateL':
        this.lutLaLv.at(1, this.cellPos);
        this.lutSys.tangent(0, _tan);
        this.cellPos.y += Math.sin(time * 6) * 0.006;
        break;
      case 'sys':
        this.lutSys.at(this.legT, this.cellPos);
        this.lutSys.tangent(this.legT, _tan);
        break;
    }
  }

  private spawnSpark(inward: boolean, tissue: boolean, color: THREE.Color): void {
    const s = this.sparks.find((x) => !x.alive);
    if (!s) return;
    const anchor = _a;
    if (tissue && this.tissuePos.length > 0) {
      let best = this.tissuePos[0]!;
      let bd = Infinity;
      for (let k = 0; k < 3; k++) {
        const p = this.tissuePos[Math.floor(Math.random() * this.tissuePos.length)]!;
        const d = p.distanceToSquared(this.cellPos);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      anchor.copy(best);
    } else {
      randUnit(_d);
      anchor.copy(this.cellPos).addScaledVector(_d, 0.12 + Math.random() * 0.08);
    }
    if (inward) {
      s.from.copy(anchor);
      s.to.copy(this.cellPos);
    } else {
      s.from.copy(this.cellPos);
      s.to.copy(anchor);
    }
    s.ctrl.copy(s.from).lerp(s.to, 0.5);
    s.ctrl.y += 0.05 + Math.random() * 0.05;
    s.inward = inward;
    s.tissue = tissue;
    s.color.copy(color);
    s.p = 0;
    s.dur = 0.4 + Math.random() * 0.3;
    s.alive = true;
  }

  private updateSparks(dt: number): void {
    const pos = this.sparkGeo.getAttribute('position') as THREE.BufferAttribute;
    const col = this.sparkGeo.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < this.sparks.length; i++) {
      const s = this.sparks[i]!;
      if (s.alive) {
        s.p += dt / s.dur;
        if (s.inward) s.to.copy(this.cellPos);
        if (s.p >= 1) {
          s.alive = false;
          if (s.inward) this.flash = Math.min(1, this.flash + 0.15);
          else if (s.tissue) this.tissueFx = Math.min(1, this.tissueFx + 0.12);
          else this.lungFx = Math.min(1, this.lungFx + 0.1);
        }
      }
      if (!s.alive) {
        pos.setXYZ(i, this.cellPos.x, this.cellPos.y, this.cellPos.z);
        col.setXYZ(i, 0, 0, 0);
        continue;
      }
      quadBezier(_a, s.from, s.ctrl, s.to, s.p);
      pos.setXYZ(i, _a.x, _a.y, _a.z);
      const b = smoothstep(0, 0.12, s.p) * (1 - smoothstep(0.8, 1, s.p));
      col.setXYZ(i, s.color.r * b, s.color.g * b, s.color.b * b);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  private updateTrail(cell: THREE.Color): void {
    const pos = this.trailGeo.getAttribute('position') as THREE.BufferAttribute;
    const col = this.trailGeo.getAttribute('color') as THREE.BufferAttribute;
    if (this.cellPos.distanceToSquared(this.trailLast) > 0.02 * 0.02) {
      this.trailIdx = (this.trailIdx + 1) % TRAIL_N;
      pos.setXYZ(this.trailIdx, this.cellPos.x, this.cellPos.y, this.cellPos.z);
      this.trailCols[this.trailIdx]!.copy(cell);
      this.trailLast.copy(this.cellPos);
      pos.needsUpdate = true;
    }
    for (let i = 0; i < TRAIL_N; i++) {
      const age = (this.trailIdx - i + TRAIL_N) % TRAIL_N;
      const k = Math.pow(1 - age / TRAIL_N, 1.6) * 0.75;
      const c = this.trailCols[i]!;
      col.setXYZ(i, c.r * k, c.g * k, c.b * k);
    }
    col.needsUpdate = true;
  }

  private styleValve(v: Valve, open: number, time: number, waiting: boolean): void {
    _c.copy(C_STOP).lerp(C_MINT, open);
    v.ring.emissive.copy(_c);
    v.ring.color.copy(_c).multiplyScalar(0.2);
    const pulse = waiting ? 0.5 + 0.5 * Math.sin(time * 7) : 0;
    v.ring.emissiveIntensity = 1.0 + open * 0.5 + pulse * 0.9 * (1 - open);
    v.disc.opacity = (1 - open) * (0.45 + 0.25 * pulse);
    v.iris.scale.setScalar(Math.max(0.05, 1 - open * 0.95));
  }

  private styleChevrons(list: THREE.MeshStandardMaterial[], open: number, time: number, gain: number): void {
    list.forEach((m, k) => {
      const chase = Math.pow(0.5 + 0.5 * Math.sin(time * 6 - k * 1.3), 3);
      m.emissiveIntensity = (0.12 + open * (0.4 + 1.2 * chase)) * gain;
      _c.copy(C_STOP).lerp(C_MINT, open);
      m.emissive.copy(_c);
    });
  }

  /* ----------------------------------------------------------------- tick */

  protected override tick(dt: number, time: number, input: ControlInput): void {
    const live = this.phase === 'handsOn';
    const step = Math.min(dt, 0.05);
    if (Number.isFinite(input.slider)) this.sliderRaw = clamp01(input.slider);
    const routeSys = this.sliderRaw >= 0.5;

    this.advance(step, live, routeSys);
    this.cellPose(time);

    if (live && !this.reached && this.pulmDone && this.sysDone) this.reached = true;

    // Oxygen state of the cell: loads in lungs, unloads in tissues.
    const pz = this.pulmZone;
    const sz = this.sysZone;
    if (this.leg === 'pulm') {
      this.oxy = Math.max(this.oxy, lerp(0.12, 1, smoothstep(pz[0], pz[1] - 0.04, this.legT)));
    } else if (this.leg === 'sys') {
      this.oxy = Math.min(this.oxy, lerp(1, 0.12, smoothstep(sz[0], sz[1] - 0.02, this.legT)));
    }
    this.oxyVis = damp(this.oxyVis, this.oxy, 6, dt);

    // Gas exchange at the two capillary beds.
    const exP = this.leg === 'pulm' ? bump(this.legT, pz[0], pz[1]) : 0;
    const exS = this.leg === 'sys' ? bump(this.legT, sz[0], sz[1]) : 0;
    this.accEx += (exP + exS) * 30 * step;
    while (this.accEx >= 1) {
      this.accEx -= 1;
      const o2 = Math.random() < 0.55;
      if (exP > 0) this.spawnSpark(o2, false, o2 ? C_CYAN : C_AMBER);
      else this.spawnSpark(!o2, true, o2 ? C_CYAN : C_AMBER);
    }
    this.updateSparks(step);

    // The cell.
    this.rig.group.position.copy(this.cellPos);
    _q.setFromUnitVectors(_Y, _tan);
    this.rig.group.quaternion.slerp(_q, 1 - Math.exp(-dt * 10));
    this.rig.spin.rotation.x = Math.sin(time * 2.1) * 0.15;
    this.rig.spin.rotation.y = time * 0.8;
    _c.copy(DEOXY).lerp(OXY, this.oxyVis);
    tintRbc(this.rig, _c, this.flash);
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.updateTrail(_c);

    // Emphasis: the slider spotlights a loop; on tour it follows the cell.
    const autoEmph = this.leg === 'laLv' || this.leg === 'gateL' || this.leg === 'sys' ? 1 : 0;
    this.emph = damp(this.emph, live ? this.sliderRaw : autoEmph, 4, dt);

    // Valve gates.
    let openPT: number;
    let openAT: number;
    if (live) {
      openPT = routeSys ? 0 : 1;
      openAT = routeSys ? 1 : 0;
    } else {
      openPT = this.leg === 'gateR' ? smoothstep(0.15, 0.45, this.wait) : 1;
      openAT = this.leg === 'gateL' ? smoothstep(0.15, 0.45, this.wait) : 1;
    }
    this.openP = damp(this.openP, openPT, 9, dt);
    this.openA = damp(this.openA, openAT, 9, dt);
    const waitP = live && this.leg === 'gateR' && routeSys;
    const waitA = live && this.leg === 'gateL' && !routeSys;
    this.styleValve(this.valveP, this.openP, time, waitP);
    this.styleValve(this.valveA, this.openA, time, waitA);

    // Loop tubes.
    this.pulmFx = Math.max(0, this.pulmFx - dt * 0.8);
    this.sysFx = Math.max(0, this.sysFx - dt * 0.8);
    const doneP = live && this.pulmDone ? 0.18 : 0;
    const doneS = live && this.sysDone ? 0.18 : 0;
    const gainP = lerp(1.25, 0.3, this.emph) + this.pulmFx * 1.2 + doneP;
    const gainS = lerp(0.3, 1.25, this.emph) + this.sysFx * 1.2 + doneS;
    this.pulmU.uTime.value = time;
    this.sysU.uTime.value = time;
    this.pulmU.uGain.value = gainP;
    this.sysU.uGain.value = gainS;
    this.pulmU.uFlow.value = 0.35 + 0.65 * this.openP;
    this.sysU.uFlow.value = 0.35 + 0.65 * this.openA;
    this.pulmU.uZoneGain.value = 0.35 + 0.55 * exP;
    this.sysU.uZoneGain.value = 0.35 + 0.55 * exS;
    this.styleChevrons(this.chevP, this.openP, time, lerp(1.1, 0.5, this.emph));
    this.styleChevrons(this.chevA, this.openA, time, lerp(0.5, 1.1, this.emph));

    this.updateFlow(this.flowPGeo, this.lutPulm, pz, time, gainP * 0.85, C_VIOLET, C_CRIMSON);
    this.updateFlow(this.flowSGeo, this.lutSys, sz, time + 3.1, gainS * 0.85, C_CRIMSON, C_VIOLET);

    // Heart beat (atria lead, ventricles follow).
    const ph = frac(time * 1.15);
    const atr = Math.pow(Math.max(0, Math.sin(ph * Math.PI * 2)), 6);
    const ven = Math.pow(Math.max(0, Math.sin((ph - 0.18) * Math.PI * 2)), 6);
    this.heart.scale.setScalar(1 + 0.035 * ven + 0.012 * atr);
    for (const m of this.atriaBlood) m.emissiveIntensity = 0.6 + 0.7 * atr;
    for (const m of this.ventBlood) m.emissiveIntensity = 0.6 + 0.9 * ven;
    setFresnel(this.heartRim, 0.7 + 0.5 * ven);

    // Lungs breathe; glow when the pulmonary loop is spotlit or exchanging.
    const breath = Math.sin(time * 1.3);
    this.lungs.scale.setScalar(1 + 0.025 * breath);
    this.lungFx = Math.max(0, this.lungFx - dt * 1.2);
    const lungGlow = (1 - this.emph) * 0.6 + exP * 1.0 + this.lungFx * 0.5;
    setFresnel(this.lungRim, 0.45 + lungGlow);
    this.lungMat.emissiveIntensity = 0.08 + lungGlow * 0.2;
    this.alvMat.opacity = 0.3 + lungGlow * 0.4;
    this.airwayMat.emissiveIntensity = 0.5 + lungGlow * 0.6 + 0.15 * breath;

    // Body tissues glow when the systemic loop is spotlit or receiving oxygen.
    this.tissueFx = Math.max(0, this.tissueFx - dt * 0.9);
    const bodyGlow = this.emph * 0.6 + exS * 1.0;
    setFresnel(this.bodyRim, 0.4 + bodyGlow);
    this.bodyMat.emissiveIntensity = 0.08 + bodyGlow * 0.2;
    this.tissueMat.emissiveIntensity = 0.45 + bodyGlow * 0.4 + this.tissueFx * 1.4;

    this.dust.rotation.y = time * 0.012;

    // Camera leans towards the spotlit loop.
    this.framing.target.y = lerp(0.24, 0.06, this.emph);
  }

  /* -------------------------------------------------------------- readout */

  getReadout(): Readout {
    if (this.phase === 'tour') return this.makeReadout(0, { status: 'idle' });
    const loops = this.reached ? 2 : (this.pulmDone ? 1 : 0) + (this.sysDone ? 1 : 0);
    if (this.reached) return this.makeReadout(2, { note: 'DOUBLE LOOP ✓' });

    const routeSys = this.sliderRaw >= 0.5;
    let note: string;
    let status: ReadoutStatus = 'active';
    if (this.leg === 'gateR' && routeSys) {
      note = '◀ OPEN PULMONARY';
      status = 'warn';
    } else if (this.leg === 'gateL' && !routeSys) {
      note = 'OPEN SYSTEMIC ▶';
      status = 'warn';
    } else if (this.leg === 'pulm' || this.leg === 'raRv' || this.leg === 'gateR') {
      note = this.leg === 'pulm' && this.oxy > 0.6 ? 'O₂ LOADED' : 'TO THE LUNGS';
    } else {
      note = this.leg === 'sys' && this.oxy < 0.5 ? 'O₂ DELIVERED' : 'TO THE BODY';
    }
    return this.makeReadout(loops, { status, note });
  }
}