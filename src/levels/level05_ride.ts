/**
 * Level V — THE RIDE.
 * One red blood cell squeezes, single file, through a pulmonary capillary that hugs an
 * alveolus. DRAG pushes the cell along the vessel. While it is pressed against the air sac,
 * O₂ diffuses in, haemoglobin binds it and the cell shifts from dusky violet to scarlet.
 * CO₂ leaves the other way.
 *
 * Also exports small shared helpers (path LUT, flow-tube shader, RBC rig) reused by VI & VII.
 */
import * as THREE from 'three';
import { LevelScene } from './base';
import type { LevelContext } from './base';
import type { ControlInput, LevelPhase, Readout, ReadoutStatus } from '../types';
import type { DragInfo } from '../ui/hud';
import {
  clamp01,
  damp,
  fresnelMaterial,
  glassMaterial,
  glowPointsMaterial,
  lerp,
  lineMaterial,
  neonMaterial,
  rng,
  setFresnel,
  smoothstep,
} from './neon';

/* ============================== shared helpers ============================== */

/** Biconcave disc (thin centre, thick rim), unit radius, disc axis = +Y. */
export function rbcGeometry(): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = [];
  const N = 14;
  const h = (rho: number): number =>
    0.5 * Math.sqrt(Math.max(0, 1 - rho * rho)) * (0.207 + 2.003 * rho * rho - 1.123 * Math.pow(rho, 4));
  for (let i = 0; i <= N; i++) {
    const rho = Math.sin(((i / N) * Math.PI) / 2);
    pts.push(new THREE.Vector2(rho, -h(rho)));
  }
  for (let i = N - 1; i >= 0; i--) {
    const rho = Math.sin(((i / N) * Math.PI) / 2);
    pts.push(new THREE.Vector2(rho, h(rho)));
  }
  return new THREE.LatheGeometry(pts, 28);
}

/** Arc-length lookup table for cheap, evenly-paced sampling along a curve. */
export class PathLUT {
  readonly pts: THREE.Vector3[];
  readonly length: number;

  constructor(curve: THREE.Curve<THREE.Vector3>, divisions = 240) {
    this.pts = curve.getSpacedPoints(divisions);
    this.length = curve.getLength();
  }

  at(t: number, out: THREE.Vector3): THREE.Vector3 {
    const n = this.pts.length - 1;
    const f = clamp01(t) * n;
    const i = Math.min(n - 1, Math.floor(f));
    return out.copy(this.pts[i]).lerp(this.pts[i + 1], f - i);
  }

  tangent(t: number, out: THREE.Vector3): THREE.Vector3 {
    const n = this.pts.length - 1;
    const i = Math.min(n - 1, Math.floor(clamp01(t) * n));
    return out.subVectors(this.pts[i + 1], this.pts[i]).normalize();
  }
}

export function quadBezier(
  out: THREE.Vector3,
  a: THREE.Vector3,
  c: THREE.Vector3,
  b: THREE.Vector3,
  u: number,
): THREE.Vector3 {
  const iu = 1 - u;
  const k0 = iu * iu;
  const k1 = 2 * iu * u;
  const k2 = u * u;
  return out.set(k0 * a.x + k1 * c.x + k2 * b.x, k0 * a.y + k1 * c.y + k2 * b.y, k0 * a.z + k1 * c.z + k2 * b.z);
}

const TUBE_VERT = /* glsl */ `
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

const TUBE_FRAG = /* glsl */ `
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uZoneCol;
uniform float uMid0;
uniform float uMid1;
uniform float uZone0;
uniform float uZone1;
uniform float uZoneAmt;
uniform float uBands;
uniform float uSpeed;
uniform float uTime;
uniform float uGlow;
uniform float uOpacity;
uniform float uFocus;
uniform float uDone;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  float t = vUv.x;
  vec3 base = mix(uA, uB, smoothstep(uMid0, uMid1, t));
  float fr = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
  float flow = pow(0.5 + 0.5 * sin(6.2831853 * (t * uBands - uTime * uSpeed)), 6.0);
  float zone = smoothstep(uZone0 - 0.035, uZone0 + 0.035, t) * (1.0 - smoothstep(uZone1 - 0.035, uZone1 + 0.035, t));
  float d = (t - uFocus) * 16.0;
  float focus = exp(-d * d);
  vec3 col = base * (0.22 + 1.3 * fr)
    + base * flow * (0.25 + 0.5 * fr)
    + uZoneCol * zone * uZoneAmt * (0.2 + 1.1 * fr)
    + mix(base, vec3(1.0), 0.25) * focus * 1.1
    + uB * uDone * 0.45 * (0.3 + fr);
  float a = clamp((0.1 + 0.8 * fr + 0.18 * flow + 0.35 * focus + 0.15 * zone * uZoneAmt) * uOpacity, 0.0, 1.0);
  gl_FragColor = vec4(col * uGlow, a);
}
`;

export interface FlowTubeOptions {
  a: THREE.ColorRepresentation;
  b: THREE.ColorRepresentation;
  mid0?: number;
  mid1?: number;
  zone?: THREE.ColorRepresentation;
  zone0?: number;
  zone1?: number;
  bands?: number;
  speed?: number;
  opacity?: number;
}

export interface FlowTubeUniforms {
  time: THREE.IUniform;
  glow: THREE.IUniform;
  focus: THREE.IUniform;
  done: THREE.IUniform;
  zoneAmt: THREE.IUniform;
  opacity: THREE.IUniform;
}

/** Additive glass-vessel shader: fresnel walls, colour gradient along length, flowing bands. */
export function flowTubeMaterial(o: FlowTubeOptions): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uA: { value: new THREE.Color(o.a) },
      uB: { value: new THREE.Color(o.b) },
      uZoneCol: { value: new THREE.Color(o.zone ?? o.b) },
      uMid0: { value: o.mid0 ?? 0.4 },
      uMid1: { value: o.mid1 ?? 0.6 },
      uZone0: { value: o.zone0 ?? 2 },
      uZone1: { value: o.zone1 ?? 3 },
      uZoneAmt: { value: 0 },
      uBands: { value: o.bands ?? 10 },
      uSpeed: { value: o.speed ?? 0.4 },
      uTime: { value: 0 },
      uGlow: { value: 1 },
      uOpacity: { value: o.opacity ?? 1 },
      uFocus: { value: -10 },
      uDone: { value: 0 },
    },
    vertexShader: TUBE_VERT,
    fragmentShader: TUBE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

export function flowTubeUniforms(mat: THREE.ShaderMaterial): FlowTubeUniforms {
  const get = (k: string): THREE.IUniform => {
    const u = mat.uniforms[k];
    if (!u) throw new Error(`flowTube: missing uniform ${k}`);
    return u;
  };
  return {
    time: get('uTime'),
    glow: get('uGlow'),
    focus: get('uFocus'),
    done: get('uDone'),
    zoneAmt: get('uZoneAmt'),
    opacity: get('uOpacity'),
  };
}

export interface RbcRig {
  group: THREE.Group;
  spin: THREE.Group;
  mat: THREE.MeshStandardMaterial;
  rim: THREE.ShaderMaterial;
  glow: THREE.PointsMaterial;
}

/** A single glowing red blood cell (body + fresnel rim + soft halo). Scale `group` to size. */
export function makeRbcRig(): RbcRig {
  const geo = rbcGeometry();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x3a1450,
    emissive: 0x7a2fd0,
    emissiveIntensity: 0.6,
    roughness: 0.42,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const rim = fresnelMaterial(0x7a2fd0, { power: 2.0, intensity: 1.1 });
  const body = new THREE.Mesh(geo, mat);
  const shell = new THREE.Mesh(geo, rim);
  shell.scale.setScalar(1.07);
  shell.renderOrder = 7;
  const spin = new THREE.Group();
  spin.add(body, shell);
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
  const glow = glowPointsMaterial(0x7a2fd0, 0.26, 0.5);
  const halo = new THREE.Points(glowGeo, glow);
  halo.frustumCulled = false;
  halo.renderOrder = 8;
  const group = new THREE.Group();
  group.add(spin, halo);
  return { group, spin, mat, rim, glow };
}

export function tintRbc(rig: RbcRig, c: THREE.Color, flash: number): void {
  rig.mat.color.copy(c).multiplyScalar(0.42);
  rig.mat.emissive.copy(c);
  rig.mat.emissiveIntensity = 0.55 + 0.9 * flash;
  const u = rig.rim.uniforms['uColor'];
  if (u) (u.value as THREE.Color).copy(c);
  setFresnel(rig.rim, 1.0 + 1.2 * flash);
  rig.glow.color.copy(c);
  rig.glow.opacity = 0.4 + 0.4 * flash;
}

/* ================================ level V ================================== */

const CYAN = 0x3cf0ff;
const AMBER = 0xffae2e;
const CRIMSON = 0xff2d55;
const VIOLET = 0x8a5cff;
const PINK = 0xff5ad1;
const DEOXY = new THREE.Color(0x7a2fd0);
const OXY = new THREE.Color(0xff2b3a);
const C_HB_OFF = new THREE.Color(0x5b3a9e);
const C_HB_ON = new THREE.Color(CYAN);
const C_VIOLET = new THREE.Color(VIOLET);
const C_CRIMSON = new THREE.Color(CRIMSON);

const ZONE0 = 0.27;
const ZONE1 = 0.74;
const ALV_C = new THREE.Vector3(0, -0.14, -0.24);
const ALV_R = 0.48;
const TUBE_R = 0.068;
const CELL_R = 0.054;
/** Saturation rises fast: most O₂ is loaded in the first third of the contact zone. */
const LOAD_K = 9;
const T_START = 0.03;
const DRAG_GAIN = 1.2;
const TOUR_PERIOD = 8;

const PATH: [number, number, number][] = [
  [-1.1, -0.52, 0.2],
  [-0.8, -0.4, 0.24],
  [-0.5, -0.14, 0.26],
  [-0.24, 0.1, 0.22],
  [0.06, 0.2, 0.22],
  [0.34, 0.1, 0.22],
  [0.6, -0.14, 0.25],
  [0.86, -0.4, 0.22],
  [1.12, -0.52, 0.18],
];

const NEIGHBOURS: [number, number, number, number][] = [
  [-0.82, 0.32, -0.62, 0.32],
  [0.84, 0.28, -0.58, 0.34],
  [0.02, 0.62, -0.86, 0.3],
];

interface Spark {
  alive: boolean;
  inward: boolean;
  p: number;
  dur: number;
  from: THREE.Vector3;
  ctrl: THREE.Vector3;
  to: THREE.Vector3;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _c = new THREE.Color();
const _Y = new THREE.Vector3(0, 1, 0);
const _Z = new THREE.Vector3(0, 0, 1);

function zoneWeight(t: number): number {
  return smoothstep(ZONE0 - 0.035, ZONE0 + 0.035, t) * (1 - smoothstep(ZONE1 - 0.035, ZONE1 + 0.035, t));
}

function randomUnit(out: THREE.Vector3, r: () => number = Math.random): THREE.Vector3 {
  const u = r() * 2 - 1;
  const th = r() * Math.PI * 2;
  const s = Math.sqrt(Math.max(0, 1 - u * u));
  return out.set(s * Math.cos(th), u, s * Math.sin(th));
}

export class Level05Ride extends LevelScene {
  private built = false;
  private lut!: PathLUT;
  private tubeU!: FlowTubeUniforms;
  private alvMat!: THREE.MeshPhysicalMaterial;
  private alvRim!: THREE.ShaderMaterial;
  private air!: THREE.Points;
  private plasmaGeo!: THREE.BufferGeometry;
  private plasmaT: number[] = [];
  private plasmaOff: THREE.Vector3[] = [];
  private rig!: RbcRig;
  private readonly hbGroup = new THREE.Group();
  private hbMats: THREE.MeshStandardMaterial[] = [];
  private chevrons: THREE.Mesh[] = [];
  private chevMat!: THREE.MeshStandardMaterial;
  private startMat!: THREE.MeshStandardMaterial;
  private endMat!: THREE.MeshStandardMaterial;
  private o2: Spark[] = [];
  private co2: Spark[] = [];
  private o2Geo!: THREE.BufferGeometry;
  private co2Geo!: THREE.BufferGeometry;

  private readonly cellPos = new THREE.Vector3();
  private t = T_START;
  private zoneTravel = 0;
  private load = 0;
  private loadVis = 0;
  private speed = 0;
  private moveAmt = 0;
  private flash = 0;
  private doneFx = 0;
  private hint = 0;
  private fade = 1;
  private reached = false;
  private tourClock = 0;
  private accO2 = 0;
  private accCO2 = 0;
  private evDX = 0;
  private evDY = 0;
  private vw = 0;
  private vh = 0;

  protected override onEnter(ctx: LevelContext): void {
    if (!this.built) {
      this.build(ctx.lowPower);
      this.built = true;
    }
    const f = this.framing;
    f.target.set(0, 0.04, 0);
    f.dir.set(0.1, 0.3, 1);
    f.drift = 0.07;
    f.ease = 2.2;
    this.applyRadius();
    this.resetRide();
    this.tourClock = 0;
    this.placeCell(0, true);
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
    this.framing.radius = h > w ? 1.12 : 0.95;
  }

  protected override onPhase(phase: LevelPhase): void {
    if (phase === 'handsOn') {
      this.resetRide();
      this.hint = 1;
    } else {
      this.tourClock = 0;
    }
  }

  override onDrag(e: DragInfo): void {
    // Prefer per-frame input deltas; event deltas are a fallback only.
    const r = e as unknown as Record<string, unknown>;
    const num = (k: string): number => {
      const v = r[k];
      return typeof v === 'number' && Number.isFinite(v) ? v : 0;
    };
    this.evDX += num('dx') || num('deltaX');
    this.evDY += num('dy') || num('deltaY');
  }

  private resetRide(): void {
    this.t = T_START;
    this.zoneTravel = 0;
    this.load = 0;
    this.loadVis = 0;
    this.reached = false;
    this.accO2 = 0;
    this.accCO2 = 0;
    this.speed = 0;
    this.killSparks();
  }

  private killSparks(): void {
    for (const s of this.o2) s.alive = false;
    for (const s of this.co2) s.alive = false;
  }

  /* ---------------------------------------------------------------- build */

  private build(lowPower: boolean): void {
    const R = rng(0x5e5);

    // Capillary vessel
    const curve = new THREE.CatmullRomCurve3(
      PATH.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
      false,
      'centripetal',
    );
    this.lut = new PathLUT(curve, 360);
    const tubeMat = flowTubeMaterial({
      a: VIOLET,
      b: CRIMSON,
      mid0: ZONE0 + 0.06,
      mid1: ZONE1 - 0.06,
      zone: CYAN,
      zone0: ZONE0,
      zone1: ZONE1,
      bands: 16,
      speed: 0.3,
    });
    this.tubeU = flowTubeUniforms(tubeMat);
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, lowPower ? 140 : 220, TUBE_R, lowPower ? 12 : 20, false),
      tubeMat,
    );
    tube.renderOrder = 5;
    this.root.add(tube);

    // Entry / exit rings
    const ringGeo = new THREE.TorusGeometry(TUBE_R * 1.28, 0.0075, 8, 48);
    this.startMat = neonMaterial(VIOLET, 1.3, 0.2);
    this.endMat = neonMaterial(CRIMSON, 0.9, 0.2);
    const addRing = (tt: number, mat: THREE.Material): void => {
      const ring = new THREE.Mesh(ringGeo, mat);
      this.lut.at(tt, ring.position);
      ring.quaternion.setFromUnitVectors(_Z, this.lut.tangent(tt, _tan));
      this.root.add(ring);
    };
    addRing(0.004, this.startMat);
    addRing(0.996, this.endMat);

    // Alveolus (glass air sac + fresnel rim)
    const sphere = new THREE.SphereGeometry(1, lowPower ? 32 : 56, lowPower ? 22 : 40);
    this.alvMat = glassMaterial(CYAN, { opacity: 0.1, emissive: 0.14 });
    const alv = new THREE.Mesh(sphere, this.alvMat);
    alv.position.copy(ALV_C);
    alv.scale.setScalar(ALV_R);
    alv.renderOrder = 1;
    this.alvRim = fresnelMaterial(CYAN, { power: 2.6, intensity: 0.9 });
    const alvRim = new THREE.Mesh(sphere, this.alvRim);
    alvRim.position.copy(ALV_C);
    alvRim.scale.setScalar(ALV_R * 1.004);
    alvRim.renderOrder = 2;
    this.root.add(alv, alvRim);

    // Neighbouring alveoli (depth cue)
    const nbGlass = glassMaterial(CYAN, { opacity: 0.05, emissive: 0.08 });
    const nbRim = fresnelMaterial(CYAN, { power: 2.8, intensity: 0.45 });
    for (const [x, y, z, r] of NEIGHBOURS) {
      const g = new THREE.Mesh(sphere, nbGlass);
      g.position.set(x, y, z);
      g.scale.setScalar(r);
      const rim = new THREE.Mesh(sphere, nbRim);
      rim.position.set(x, y, z);
      rim.scale.setScalar(r * 1.004);
      g.renderOrder = 0;
      rim.renderOrder = 1;
      this.root.add(g, rim);
    }

    // Capillary net wrapping the alveolus
    const netA = lineMaterial(CRIMSON, 0.2);
    const netB = lineMaterial(VIOLET, 0.24);
    for (let k = 0; k < 10; k++) {
      const axis = randomUnit(new THREE.Vector3(), R);
      const v0 = randomUnit(new THREE.Vector3(), R).cross(axis);
      if (v0.lengthSq() < 1e-4) continue;
      v0.normalize();
      const arc = 1.1 + R() * 1.6;
      const a0 = R() * Math.PI * 2;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 36; i++) {
        const p = v0
          .clone()
          .applyAxisAngle(axis, a0 + (i / 36) * arc)
          .multiplyScalar(ALV_R * (1.03 + 0.012 * Math.sin(i * 0.9 + k)));
        pts.push(p.add(ALV_C));
      }
      this.root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), k % 2 ? netA : netB));
    }

    // Air inside the sac: dissolved O₂ waiting to cross
    const nAir = lowPower ? 50 : 90;
    const ap = new Float32Array(nAir * 3);
    for (let i = 0; i < nAir; i++) {
      randomUnit(_d, R).multiplyScalar(Math.cbrt(R()) * ALV_R * 0.84);
      ap[i * 3] = _d.x;
      ap[i * 3 + 1] = _d.y;
      ap[i * 3 + 2] = _d.z;
    }
    const ag = new THREE.BufferGeometry();
    ag.setAttribute('position', new THREE.BufferAttribute(ap, 3));
    this.air = new THREE.Points(ag, glowPointsMaterial(CYAN, 0.045, 0.7));
    this.air.position.copy(ALV_C);
    this.air.renderOrder = 3;
    this.root.add(this.air);

    // Background dust
    const nDust = lowPower ? 70 : 140;
    const dp = new Float32Array(nDust * 3);
    for (let i = 0; i < nDust; i++) {
      dp[i * 3] = (R() - 0.5) * 4.8;
      dp[i * 3 + 1] = (R() - 0.5) * 2.8;
      dp[i * 3 + 2] = -1.6 + R() * 2.2;
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    const dust = new THREE.Points(dg, glowPointsMaterial(VIOLET, 0.02, 0.35));
    this.root.add(dust);

    // Plasma motes drifting inside the vessel
    const nPl = lowPower ? 24 : 40;
    this.plasmaGeo = new THREE.BufferGeometry();
    this.plasmaGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nPl * 3), 3));
    this.plasmaGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nPl * 3), 3));
    for (let i = 0; i < nPl; i++) {
      this.plasmaT.push(i / nPl + R() * 0.02);
      this.plasmaOff.push(randomUnit(new THREE.Vector3(), R).multiplyScalar(TUBE_R * 0.55 * R()));
    }
    const plasma = new THREE.Points(this.plasmaGeo, glowPointsMaterial(0xffffff, 0.028, 0.75, true));
    plasma.frustumCulled = false;
    plasma.renderOrder = 6;
    this.root.add(plasma);

    // The red blood cell + four haemoglobin "seats"
    this.rig = makeRbcRig();
    this.rig.group.add(this.hbGroup);
    const hbGeo = new THREE.SphereGeometry(0.17, 12, 8);
    for (let k = 0; k < 4; k++) {
      const m = neonMaterial(C_HB_OFF, 0.4, 0.25);
      const dot = new THREE.Mesh(hbGeo, m);
      const a = (k / 4) * Math.PI * 2;
      dot.position.set(Math.cos(a) * 1.18, 0, Math.sin(a) * 1.18);
      this.hbGroup.add(dot);
      this.hbMats.push(m);
    }
    this.root.add(this.rig.group);

    // Direction chevrons (hint)
    this.chevMat = neonMaterial(PINK, 1.6, 0.2);
    const chevGeo = new THREE.ConeGeometry(0.022, 0.05, 14);
    for (let k = 0; k < 4; k++) {
      const m = new THREE.Mesh(chevGeo, this.chevMat);
      m.visible = false;
      this.chevrons.push(m);
      this.root.add(m);
    }

    // Gas sparks
    const nSp = lowPower ? 28 : 44;
    this.o2Geo = this.makeSparkPool(this.o2, nSp, CYAN, 0.055, true);
    this.co2Geo = this.makeSparkPool(this.co2, Math.round(nSp * 0.7), AMBER, 0.05, false);
  }

  private makeSparkPool(list: Spark[], n: number, color: number, size: number, inward: boolean): THREE.BufferGeometry {
    for (let i = 0; i < n; i++) {
      list.push({
        alive: false,
        inward,
        p: 0,
        dur: 0.5,
        from: new THREE.Vector3(),
        ctrl: new THREE.Vector3(),
        to: new THREE.Vector3(),
      });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const pts = new THREE.Points(g, glowPointsMaterial(color, size, 1, true));
    pts.frustumCulled = false;
    pts.renderOrder = 9;
    this.root.add(pts);
    return g;
  }

  /** A point on the alveolar wall facing the cell, with some scatter. */
  private wallPoint(out: THREE.Vector3): THREE.Vector3 {
    _d.subVectors(this.cellPos, ALV_C).normalize();
    _d.x += (Math.random() - 0.5) * 0.9;
    _d.y += (Math.random() - 0.5) * 0.9;
    _d.z += (Math.random() - 0.5) * 0.5;
    _d.normalize();
    return out.copy(ALV_C).addScaledVector(_d, ALV_R * 0.97);
  }

  private spawnO2(): void {
    const s = this.o2.find((x) => !x.alive);
    if (!s) return;
    this.wallPoint(s.from);
    s.to.copy(this.cellPos);
    s.ctrl.copy(s.from).lerp(s.to, 0.5).addScaledVector(_d, 0.05 + Math.random() * 0.08);
    s.p = 0;
    s.dur = 0.35 + Math.random() * 0.3;
    s.alive = true;
  }

  private spawnCO2(): void {
    const s = this.co2.find((x) => !x.alive);
    if (!s) return;
    s.from.copy(this.cellPos);
    this.wallPoint(s.to);
    s.ctrl.copy(s.from).lerp(s.to, 0.5).addScaledVector(_d, 0.06 + Math.random() * 0.08);
    s.p = 0;
    s.dur = 0.5 + Math.random() * 0.35;
    s.alive = true;
  }

  private updateSparks(list: Spark[], geo: THREE.BufferGeometry, dt: number): void {
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const col = geo.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (s.alive) {
        s.p += dt / s.dur;
        if (s.inward) s.to.copy(this.cellPos);
        if (s.p >= 1) {
          s.alive = false;
          if (s.inward) this.flash = Math.min(1, this.flash + 0.22);
        }
      }
      if (!s.alive) {
        pos.setXYZ(i, this.cellPos.x, this.cellPos.y, this.cellPos.z);
        col.setXYZ(i, 0, 0, 0);
        continue;
      }
      const u = s.inward ? s.p * s.p * (1.6 - 0.6 * s.p) : s.p;
      quadBezier(_a, s.from, s.ctrl, s.to, clamp01(u));
      pos.setXYZ(i, _a.x, _a.y, _a.z);
      const b = s.inward
        ? smoothstep(0, 0.15, s.p) * (1 - 0.7 * smoothstep(0.82, 1, s.p))
        : smoothstep(0, 0.1, s.p) * (1 - smoothstep(0.7, 1, s.p));
      col.setXYZ(i, b, b, b);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  /** Convert a screen drag (CSS px) into progress along the capillary. */
  private dragToDs(dx: number, dy: number): number {
    const w = this.vw || window.innerWidth;
    const h = this.vh || window.innerHeight;
    const eps = 0.02;
    const t0 = Math.min(this.t, 1 - eps);
    this.lut.at(t0, _a).project(this.camera);
    this.lut.at(t0 + eps, _b).project(this.camera);
    const sx = (_b.x - _a.x) * w * 0.5;
    const sy = -(_b.y - _a.y) * h * 0.5;
    const len = Math.hypot(sx, sy);
    if (len < 0.5) return 0;
    const along = (dx * sx + dy * sy) / len;
    return (along / len) * eps;
  }

  private placeCell(dt: number, snap: boolean): void {
    this.lut.at(this.t, this.cellPos);
    this.lut.tangent(this.t, _tan);
    this.rig.group.position.copy(this.cellPos);
    _q.setFromUnitVectors(_Y, _tan);
    if (snap) this.rig.group.quaternion.copy(_q);
    else this.rig.group.quaternion.slerp(_q, 1 - Math.exp(-dt * 12));
    // Squeezed single-file: the cell narrows and lengthens into a bullet as it is pushed.
    const stretch = clamp01(this.speed * 3);
    const s = CELL_R * Math.max(0.001, this.fade);
    this.rig.group.scale.set(s * (1 - 0.1 * stretch), s * (1 + 0.45 * stretch), s * (1 - 0.1 * stretch));
  }

  private valueNow(): number {
    const s = this.def.readout;
    const v0 = s.min + (s.target - s.min) * 0.79;
    const vFull = Math.min(s.max, s.target + (s.max - s.target) * 0.6);
    return lerp(v0, vFull, this.load);
  }

  /* ----------------------------------------------------------------- tick */

  protected override tick(dt: number, time: number, input: ControlInput): void {
    const live = this.phase === 'handsOn';
    const step = Math.min(dt, 0.05);

    let dx = Number.isFinite(input.dragDX) ? input.dragDX : 0;
    let dy = Number.isFinite(input.dragDY) ? input.dragDY : 0;
    if (dx === 0 && dy === 0) {
      dx = this.evDX;
      dy = this.evDY;
    }
    this.evDX = 0;
    this.evDY = 0;

    const prevT = this.t;
    let moved = 0;
    if (live) {
      if (dx !== 0 || dy !== 0) {
        const ds = Math.max(-0.08, Math.min(0.08, this.dragToDs(dx, dy) * DRAG_GAIN));
        this.t = Math.min(1, Math.max(T_START, this.t + ds));
      }
      moved = this.t - prevT;
      this.fade = damp(this.fade, 1, 6, dt);
    } else {
      // Tour / check: the cell rides on its own, reloading each lap.
      this.tourClock += dt;
      const ph = (this.tourClock % TOUR_PERIOD) / TOUR_PERIOD;
      const nt = lerp(T_START, 0.985, smoothstep(0.05, 0.9, ph));
      if (nt < prevT - 0.2) {
        this.zoneTravel = 0;
        this.load = 0;
        this.loadVis = 0;
        this.killSparks();
      } else {
        moved = nt - prevT;
      }
      this.t = nt;
      this.fade = smoothstep(0, 0.05, ph) * (1 - smoothstep(0.93, 0.995, ph));
    }

    const zw = zoneWeight(this.t);
    this.zoneTravel += Math.abs(moved) * zw;
    this.load = 1 - Math.exp(-LOAD_K * this.zoneTravel);
    const inst = Math.abs(moved) / Math.max(1e-3, dt);
    this.speed = damp(this.speed, Math.min(inst, 2), 10, dt);
    this.moveAmt = damp(this.moveAmt, clamp01(this.speed * 6), 5, dt);

    if (live && !this.reached) {
      const s = this.def.readout;
      if (Number(this.valueNow().toFixed(s.decimals)) >= s.target) this.reached = true;
    }
    this.doneFx = damp(this.doneFx, this.reached ? 1 : 0, 3, dt);

    // Gas exchange: driven by movement through the contact zone, slowing as Hb saturates.
    this.accO2 += Math.min(70, zw * (1 - this.load) * 180 * this.speed) * dt;
    while (this.accO2 >= 1) {
      this.accO2 -= 1;
      this.spawnO2();
    }
    const co2Left = Math.exp(-LOAD_K * 0.7 * this.zoneTravel);
    this.accCO2 += Math.min(45, zw * co2Left * 100 * this.speed) * dt;
    while (this.accCO2 >= 1) {
      this.accCO2 -= 1;
      this.spawnCO2();
    }

    this.placeCell(dt, false);
    this.updateSparks(this.o2, this.o2Geo, step);
    this.updateSparks(this.co2, this.co2Geo, step);

    // Cell colour: violet → scarlet as haemoglobin loads.
    this.loadVis = damp(this.loadVis, this.load, 5, dt);
    _c.copy(DEOXY).lerp(OXY, this.loadVis);
    tintRbc(this.rig, _c, this.flash);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    this.rig.spin.rotation.x = Math.sin(time * 2.3) * 0.12;
    this.hbGroup.rotation.y += dt * (0.8 + this.speed * 6);
    for (let k = 0; k < 4; k++) {
      const th = ((k + 1) / 4) * 0.92;
      const on = smoothstep(th - 0.12, th, this.loadVis);
      const m = this.hbMats[k];
      m.emissive.copy(C_HB_OFF).lerp(C_HB_ON, on);
      m.emissiveIntensity = 0.35 + 2.2 * on;
    }

    // Vessel
    this.tubeU.time.value = time;
    this.tubeU.focus.value = this.t;
    this.tubeU.zoneAmt.value = 0.45 + 0.9 * zw * (0.3 + this.moveAmt);
    this.tubeU.done.value = this.doneFx * 0.8;

    // Alveolus breathes gently and brightens while exchanging
    const ex = zw * this.moveAmt;
    this.alvMat.emissiveIntensity = 0.12 + 0.25 * ex;
    setFresnel(this.alvRim, 0.8 + 0.9 * ex);
    this.air.rotation.y += dt * 0.08;
    this.air.scale.setScalar(1 + 0.03 * Math.sin(time * 1.2));

    // Plasma motes
    const pp = this.plasmaGeo.getAttribute('position') as THREE.BufferAttribute;
    const pc = this.plasmaGeo.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < this.plasmaT.length; i++) {
      let tt = this.plasmaT[i] + dt * 0.035;
      if (tt > 1) tt -= 1;
      this.plasmaT[i] = tt;
      this.lut.at(tt, _a).add(this.plasmaOff[i]);
      pp.setXYZ(i, _a.x, _a.y, _a.z);
      _c.copy(C_VIOLET).lerp(C_CRIMSON, smoothstep(ZONE0, ZONE1, tt));
      const b = 0.55 * smoothstep(0, 0.04, tt) * (1 - smoothstep(0.96, 1, tt));
      pc.setXYZ(i, _c.r * b, _c.g * b, _c.b * b);
    }
    pp.needsUpdate = true;
    pc.needsUpdate = true;

    // Hint chevrons ahead of the cell while idle
    this.hint = damp(this.hint, live && !this.reached && this.moveAmt < 0.15 ? 1 : 0, 4, dt);
    for (let k = 0; k < this.chevrons.length; k++) {
      const m = this.chevrons[k];
      const tt = this.t + 0.05 * (k + 1);
      if (tt > 0.99 || this.hint < 0.01) {
        m.visible = false;
        continue;
      }
      m.visible = true;
      this.lut.at(tt, m.position);
      m.quaternion.setFromUnitVectors(_Y, this.lut.tangent(tt, _tan));
      const w = 0.5 + 0.5 * Math.sin(time * 5 - k * 1.1);
      m.scale.setScalar(Math.max(0.001, this.hint * (0.55 + 0.45 * w)));
    }
    this.chevMat.emissiveIntensity = 1.2 + 1.2 * this.hint;

    // Rings
    this.startMat.emissiveIntensity = 0.9 + 0.5 * Math.sin(time * 2);
    this.endMat.emissiveIntensity = 0.8 + 2.4 * this.doneFx * (0.6 + 0.4 * Math.sin(time * 6));

    // Gentle camera follow
    this.framing.target.x = damp(this.framing.target.x, this.cellPos.x * 0.18, 2, dt);
  }

  /* -------------------------------------------------------------- readout */

  override getReadout(): Readout {
    const s = this.def.readout;
    const value = this.valueNow();
    const live = this.phase === 'handsOn';
    const v0 = s.min + (s.target - s.min) * 0.79;
    const past = this.t > ZONE1 + 0.03;
    const zw = zoneWeight(this.t);
    let status: ReadoutStatus = 'idle';
    let note: string | undefined;
    if (this.reached) {
      status = 'done';
    } else if (live) {
      if (past) {
        status = 'warn';
        note = 'PAST THE AIR SAC · DRAG BACK';
      } else if (this.moveAmt > 0.08) {
        status = 'active';
        if (zw > 0.5) note = 'LOADING O₂';
      } else if (this.load < 0.01) {
        note = 'DRAG ALONG THE VESSEL';
      }
    }
    const span = Math.max(1e-6, s.target - v0);
    return this.makeReadout(value, {
      status,
      note,
      progress: this.reached ? 1 : clamp01((value - v0) / span),
    });
  }
}