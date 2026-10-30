/**
 * Level VI — THE PUMP.
 * Glass four-chamber heart: neon blood volumes, great vessels with flowing cells,
 * valve rings and a live ECG sweep.
 * TAP = one heartbeat (atria squeeze, then ventricles). Settle into a steady resting rhythm.
 * Tap too fast and the ventricles have no time to refill, so each beat pushes out less blood.
 */
import * as THREE from 'three';
import { LevelScene } from './base';
import type { LevelContext } from './base';
import type { ControlInput, LevelPhase, Readout, ReadoutStatus } from '../types';
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
import { PathLUT, flowTubeMaterial, flowTubeUniforms } from './level05_ride';
import type { FlowTubeUniforms } from './level05_ride';

const VIOLET = 0x7d5cff;
const CRIMSON = 0xff2d55;
const PINK = 0xff5ad1;
const AMBER = 0xffae2e;
const MINT = 0x41ffc0;
const C_MINT = new THREE.Color(MINT);
const C_AMBER = new THREE.Color(AMBER);

/** Ventricle volume left after a beat (end-systolic), as a fraction of full. */
const RESID = 0.22;
const SYS_END = 0.42;
const GAP_RESET = 2.6;
const NEED = 4;
const TOUR_BPM = 72;
const ECG_N = 220;
const ECG_SWEEP = 3.2;
const ECG_SDT = ECG_SWEEP / ECG_N;
const ECG_W = 0.74;
const ECG_AMP = 0.15;
const ECG_GAP = 10;
const ECG_Y = -0.84;

type V3 = [number, number, number];

const RA_P: V3 = [-0.2, 0.24, 0.06];
const LA_P: V3 = [0.18, 0.27, -0.08];
const RV_P: V3 = [-0.13, -0.15, 0.1];
const LV_P: V3 = [0.1, -0.2, -0.03];
const RV_S: V3 = [0.16, 0.28, 0.14];
const LV_S: V3 = [0.18, 0.34, 0.16];

const AORTA: V3[] = [
  [0.08, 0.04, 0.02],
  [0.05, 0.4, 0.07],
  [0.07, 0.7, 0.03],
  [0.24, 0.82, -0.08],
  [0.36, 0.64, -0.2],
  [0.34, 0.2, -0.3],
  [0.3, -0.45, -0.32],
];
const PA_TRUNK: V3[] = [
  [-0.1, -0.02, 0.18],
  [-0.06, 0.28, 0.24],
  [0.0, 0.5, 0.17],
];
const PA_L: V3[] = [
  [0.0, 0.5, 0.17],
  [0.25, 0.58, 0.06],
  [0.52, 0.56, -0.02],
  [0.74, 0.5, -0.06],
];
const PA_R: V3[] = [
  [0.0, 0.5, 0.17],
  [-0.24, 0.6, 0.08],
  [-0.52, 0.6, 0.0],
  [-0.76, 0.52, -0.04],
];
const SVC: V3[] = [
  [-0.3, 0.88, -0.02],
  [-0.3, 0.6, 0.0],
  [-0.24, 0.34, 0.05],
];
const IVC: V3[] = [
  [-0.34, -0.62, -0.1],
  [-0.33, -0.3, -0.04],
  [-0.26, 0.1, 0.04],
];
const PV_R: V3[] = [
  [-0.72, 0.32, -0.2],
  [-0.4, 0.3, -0.2],
  [-0.02, 0.27, -0.14],
  [0.12, 0.26, -0.09],
];
const PV_L: V3[] = [
  [0.74, 0.36, -0.16],
  [0.46, 0.3, -0.13],
  [0.24, 0.27, -0.09],
];

const vec = (p: V3): THREE.Vector3 => new THREE.Vector3(p[0], p[1], p[2]);
const vecs = (p: V3[]): THREE.Vector3[] => p.map(vec);

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _Z = new THREE.Vector3(0, 0, 1);

/** Teardrop lathe (apex at y = -1, rounded top at y = +1, max radius ≈ 0.82). */
export function teardropGeometry(segments = 32): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = [];
  const N = 24;
  for (let i = 0; i <= N; i++) {
    const a = i / N;
    const r = Math.sin(Math.PI * a) * (0.35 + 0.65 * Math.sqrt(a));
    pts.push(new THREE.Vector2(Math.max(1e-4, r), -1 + 2 * a));
  }
  return new THREE.LatheGeometry(pts, segments);
}

function teardropRadius(a: number): number {
  return Math.sin(Math.PI * a) * (0.35 + 0.65 * Math.sqrt(Math.max(0, a)));
}

/** Synthetic ECG: P, QRS, T relative to the moment of the beat. */
function ecgAt(tau: number): number {
  if (tau < 0 || tau > 0.7) return 0;
  const g = (c: number, w: number): number => {
    const d = (tau - c) / w;
    return Math.exp(-d * d);
  };
  return (
    0.12 * g(0.045, 0.022) - 0.1 * g(0.108, 0.009) + g(0.126, 0.011) - 0.24 * g(0.146, 0.01) + 0.26 * g(0.37, 0.05)
  );
}

/** Particles that ride a vessel from t = 0 to t = 1. */
class Stream {
  readonly points: THREE.Points;
  private readonly lut: PathLUT;
  private readonly geo: THREE.BufferGeometry;
  private readonly t: Float32Array;
  private readonly live: Uint8Array;
  private readonly off: Float32Array;
  private readonly rate: number;
  private acc = 0;
  private cursor = 0;

  constructor(
    lut: PathLUT,
    n: number,
    color: THREE.ColorRepresentation,
    size: number,
    seconds: number,
    spread: number,
    seed: number,
  ) {
    this.lut = lut;
    this.t = new Float32Array(n);
    this.live = new Uint8Array(n);
    this.off = new Float32Array(n * 3);
    const R = rng(seed);
    for (let i = 0; i < n * 3; i++) this.off[i] = (R() - 0.5) * 2 * spread;
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.points = new THREE.Points(this.geo, glowPointsMaterial(color, size, 1, true));
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    this.rate = 1 / seconds;
  }

  emit(perSecond: number, dt: number): void {
    this.acc += Math.max(0, perSecond) * dt;
    let guard = 0;
    const n = this.t.length;
    while (this.acc >= 1 && guard < 32) {
      guard++;
      this.acc -= 1;
      for (let k = 0; k < n; k++) {
        const i = (this.cursor + k) % n;
        if (!this.live[i]) {
          this.live[i] = 1;
          this.t[i] = 0;
          this.cursor = (i + 1) % n;
          break;
        }
      }
    }
    if (this.acc >= 1) this.acc = 0;
  }

  update(dt: number, gain: number, speedMul: number): void {
    const pos = this.geo.getAttribute('position') as THREE.BufferAttribute;
    const col = this.geo.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < this.t.length; i++) {
      if (this.live[i]) {
        this.t[i] += dt * this.rate * speedMul;
        if (this.t[i] >= 1) this.live[i] = 0;
      }
      const tt = this.t[i];
      this.lut.at(tt, _v);
      pos.setXYZ(i, _v.x + this.off[i * 3], _v.y + this.off[i * 3 + 1], _v.z + this.off[i * 3 + 2]);
      const b = this.live[i] ? gain * smoothstep(0, 0.08, tt) * (1 - smoothstep(0.82, 1, tt)) : 0;
      col.setXYZ(i, b, b, b);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }
}

interface Chamber {
  glass: THREE.Mesh;
  blood: THREE.Mesh;
  bloodMat: THREE.MeshStandardMaterial;
  glassMat: THREE.MeshPhysicalMaterial;
  size: THREE.Vector3;
}

export class Level06Pump extends LevelScene {
  private built = false;
  private readonly heart = new THREE.Group();
  private shellMat!: THREE.MeshPhysicalMaterial;
  private shellRim!: THREE.ShaderMaterial;
  private coronaryMat!: THREE.MeshStandardMaterial;
  private ra!: Chamber;
  private la!: Chamber;
  private rv!: Chamber;
  private lv!: Chamber;
  private outTubes: FlowTubeUniforms[] = [];
  private inTubes: FlowTubeUniforms[] = [];
  private aortaS!: Stream;
  private paLS!: Stream;
  private paRS!: Stream;
  private inStreams: Stream[] = [];
  private avMat!: THREE.MeshStandardMaterial;
  private slMat!: THREE.MeshStandardMaterial;

  private ecgGeo!: THREE.BufferGeometry;
  private ecgLineMat!: THREE.LineBasicMaterial;
  private ecgDotMat!: THREE.PointsMaterial;
  private ecgHeadMat!: THREE.PointsMaterial;
  private ecgHeadGeo!: THREE.BufferGeometry;
  private readonly ecgVals = new Float32Array(ECG_N);
  private ecgIdx = 0;
  private ecgAcc = 0;
  private ecgT = 0;
  private ecgWarn = 0;

  private clock = 0;
  private lastBeat = -10;
  private lastTap = -10;
  private beats: number[] = [];
  private taps: number[] = [];
  private fill = 1;
  private fillAtBeat = 1;
  private stroke = 0.9;
  private bpm = 0;
  private bpmVis = 0;
  private streak = 0;
  private reached = false;
  private activity = 0.2;
  private winFx = 0;
  private vw = 0;
  private vh = 0;

  protected override onEnter(ctx: LevelContext): void {
    if (!this.built) {
      this.build(ctx.lowPower);
      this.built = true;
    }
    const f = this.framing;
    f.target.set(0, 0.03, 0);
    f.dir.set(0.05, 0.12, 1);
    f.drift = 0.08;
    f.ease = 2.4;
    this.applyRadius();
    this.clock = 0;
    this.lastBeat = -10;
    this.lastTap = -10;
    this.beats = [];
    this.taps = [];
    this.fill = 1;
    this.fillAtBeat = 1;
    this.stroke = 0.9;
    this.bpm = 0;
    this.bpmVis = 0;
    this.streak = 0;
    this.reached = false;
    this.ecgVals.fill(0);
    this.ecgT = 0;
    this.ecgAcc = 0;
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
    this.framing.radius = h > w ? 0.95 : 1.02;
  }

  protected override onPhase(phase: LevelPhase): void {
    if (phase === 'handsOn') {
      this.taps = [];
      this.bpm = 0;
      this.streak = 0;
      this.reached = false;
      this.lastTap = -10;
    }
  }

  override onTap(): void {
    this.beat();
    if (this.phase !== 'handsOn') return;
    const now = this.clock;
    const prev = this.taps.length ? this.taps[this.taps.length - 1] : -1e9;
    if (now - prev > GAP_RESET) {
      this.taps = [];
      this.streak = 0;
    }
    this.taps.push(now);
    if (this.taps.length > 5) this.taps.shift();
    if (this.taps.length >= 2) {
      const inst = 60 / Math.max(0.05, now - prev);
      let sum = 0;
      for (let i = 1; i < this.taps.length; i++) sum += this.taps[i] - this.taps[i - 1];
      this.bpm = 60 / Math.max(0.05, sum / (this.taps.length - 1));
      const [lo, hi] = this.window();
      if (inst >= lo && inst <= hi) this.streak++;
      else this.streak = 0;
      if (this.streak >= NEED && !this.reached) {
        this.reached = true;
        this.winFx = 1;
      }
    }
    this.lastTap = now;
  }

  private restBpm(): number {
    return Math.max(40, Math.min(90, this.def.readout.target));
  }

  private window(): [number, number] {
    const t = this.restBpm();
    return [t - 10, t + 18];
  }

  private beat(): void {
    this.fillAtBeat = this.fill;
    this.stroke = clamp01((this.fill - RESID) / (1 - RESID));
    this.lastBeat = this.clock;
    this.beats.push(this.clock);
    if (this.beats.length > 6) this.beats.shift();
  }

  /* ---------------------------------------------------------------- build */

  private build(lowPower: boolean): void {
    this.heart.position.set(0.06, 0.1, 0);
    this.heart.rotation.z = 0.26;
    this.root.add(this.heart);

    const tear = teardropGeometry(lowPower ? 24 : 36);
    const sphere = new THREE.SphereGeometry(1, lowPower ? 24 : 36, lowPower ? 16 : 24);

    // Myocardium shell
    const shellPos = new THREE.Vector3(0, -0.06, 0);
    const shellSize = new THREE.Vector3(0.52, 0.6, 0.44);
    this.shellMat = glassMaterial(PINK, { opacity: 0.08, emissive: 0.12 });
    const shell = new THREE.Mesh(tear, this.shellMat);
    shell.position.copy(shellPos);
    shell.scale.copy(shellSize);
    shell.renderOrder = 5;
    this.shellRim = fresnelMaterial(PINK, { power: 2.4, intensity: 0.9 });
    const rim = new THREE.Mesh(tear, this.shellRim);
    rim.position.copy(shellPos);
    rim.scale.copy(shellSize).multiplyScalar(1.01);
    rim.renderOrder = 6;
    this.heart.add(shell, rim);

    // Coronary arteries tracing the surface
    this.coronaryMat = neonMaterial(CRIMSON, 1.1, 0.2);
    const coronaries: [number, number, number, number][] = [
      [0.86, 0.12, 1.95, 1.45],
      [0.8, 0.3, 0.75, 0.25],
      [0.84, 0.2, 2.55, 3.05],
    ];
    for (const [a0, a1, p0, p1] of coronaries) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 7; i++) {
        const k = i / 7;
        const a = lerp(a0, a1, k);
        const phi = lerp(p0, p1, k) + Math.sin(k * 6) * 0.06;
        const r = teardropRadius(a) * 1.025;
        pts.push(
          new THREE.Vector3(
            r * Math.cos(phi) * shellSize.x,
            (-1 + 2 * a) * shellSize.y * 1.01,
            r * Math.sin(phi) * shellSize.z,
          ).add(shellPos),
        );
      }
      const c = new THREE.CatmullRomCurve3(pts);
      this.heart.add(new THREE.Mesh(new THREE.TubeGeometry(c, 40, 0.007, 6, false), this.coronaryMat));
    }

    // Chambers: right side violet (from the body), left side crimson (from the lungs)
    this.ra = this.chamber(sphere, RA_P, new THREE.Vector3(0.15, 0.15, 0.15), VIOLET);
    this.la = this.chamber(sphere, LA_P, new THREE.Vector3(0.14, 0.14, 0.14), CRIMSON);
    this.rv = this.chamber(tear, RV_P, vec(RV_S), VIOLET);
    this.lv = this.chamber(tear, LV_P, vec(LV_S), CRIMSON);

    // Great vessels
    const aorta = this.vessel(AORTA, 0.06, CRIMSON, this.outTubes, 0.9);
    const trunk = this.vessel(PA_TRUNK, 0.055, VIOLET, this.outTubes, 0.9);
    this.vessel(PA_L, 0.045, VIOLET, this.outTubes, 0.9);
    this.vessel(PA_R, 0.045, VIOLET, this.outTubes, 0.9);
    const svc = this.vessel(SVC, 0.05, VIOLET, this.inTubes, 0.25);
    const ivc = this.vessel(IVC, 0.05, VIOLET, this.inTubes, 0.25);
    const pvr = this.vessel(PV_R, 0.034, CRIMSON, this.inTubes, 0.25);
    const pvl = this.vessel(PV_L, 0.034, CRIMSON, this.inTubes, 0.25);

    const lutOf = (p: V3[]): PathLUT => new PathLUT(new THREE.CatmullRomCurve3(vecs(p), false, 'centripetal'), 160);
    const nOut = lowPower ? 40 : 60;
    const nBr = lowPower ? 24 : 36;
    const nIn = lowPower ? 16 : 24;
    this.aortaS = new Stream(aorta, nOut, 0xff5a6e, 0.05, 0.9, 0.022, 61);
    this.paLS = new Stream(lutOf([...PA_TRUNK, ...PA_L.slice(1)]), nBr, 0xa58bff, 0.045, 0.85, 0.018, 62);
    this.paRS = new Stream(lutOf([...PA_TRUNK, ...PA_R.slice(1)]), nBr, 0xa58bff, 0.045, 0.85, 0.018, 63);
    this.inStreams = [
      new Stream(svc, nIn, 0xa58bff, 0.04, 1.4, 0.016, 64),
      new Stream(ivc, nIn, 0xa58bff, 0.04, 1.4, 0.016, 65),
      new Stream(pvr, nIn, 0xff5a6e, 0.036, 1.4, 0.012, 66),
      new Stream(pvl, nIn, 0xff5a6e, 0.036, 1.4, 0.012, 67),
    ];
    for (const s of [this.aortaS, this.paLS, this.paRS, ...this.inStreams]) this.heart.add(s.points);

    // Valves: AV (atria → ventricles) and semilunar (ventricles → arteries)
    this.avMat = neonMaterial(PINK, 0.5, 0.2);
    this.slMat = neonMaterial(AMBER, 0.5, 0.2);
    const ringGeo = new THREE.TorusGeometry(1, 0.12, 8, 40);
    const addRing = (pos: THREE.Vector3, axis: THREE.Vector3, r: number, mat: THREE.Material): void => {
      const ring = new THREE.Mesh(ringGeo, mat);
      ring.position.copy(pos);
      ring.quaternion.setFromUnitVectors(_Z, axis.normalize());
      ring.scale.setScalar(r);
      this.heart.add(ring);
    };
    const rvTop = vec(RV_P).add(new THREE.Vector3(0, RV_S[1] * 0.92, 0));
    const lvTop = vec(LV_P).add(new THREE.Vector3(0, LV_S[1] * 0.92, 0));
    addRing(vec(RA_P).lerp(rvTop, 0.5), rvTop.clone().sub(vec(RA_P)), 0.065, this.avMat);
    addRing(vec(LA_P).lerp(lvTop, 0.5), lvTop.clone().sub(vec(LA_P)), 0.062, this.avMat);
    addRing(aorta.at(0.06, new THREE.Vector3()), aorta.tangent(0.06, new THREE.Vector3()), 0.072, this.slMat);
    addRing(trunk.at(0.1, new THREE.Vector3()), trunk.tangent(0.1, new THREE.Vector3()), 0.066, this.slMat);

    this.buildEcg();

    // Background dust
    const R = rng(606);
    const nDust = lowPower ? 60 : 120;
    const dp = new Float32Array(nDust * 3);
    for (let i = 0; i < nDust; i++) {
      dp[i * 3] = (R() - 0.5) * 4;
      dp[i * 3 + 1] = (R() - 0.5) * 2.8;
      dp[i * 3 + 2] = -1.8 + R() * 1.6;
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    this.root.add(new THREE.Points(dg, glowPointsMaterial(PINK, 0.018, 0.3)));
  }

  private chamber(geo: THREE.BufferGeometry, p: V3, size: THREE.Vector3, color: number): Chamber {
    const glassMat = glassMaterial(color, { opacity: 0.2, emissive: 0.25 });
    const glass = new THREE.Mesh(geo, glassMat);
    glass.position.set(p[0], p[1], p[2]);
    glass.scale.copy(size);
    glass.renderOrder = 3;
    const bloodMat = neonMaterial(color, 0.9, 0.3);
    const blood = new THREE.Mesh(geo, bloodMat);
    blood.position.set(p[0], p[1], p[2]);
    blood.scale.copy(size).multiplyScalar(0.8);
    this.heart.add(blood, glass);
    return { glass, blood, bloodMat, glassMat, size: size.clone() };
  }

  private vessel(pts: V3[], radius: number, color: number, list: FlowTubeUniforms[], speed: number): PathLUT {
    const curve = new THREE.CatmullRomCurve3(vecs(pts), false, 'centripetal');
    const mat = flowTubeMaterial({
      a: color,
      b: color,
      bands: Math.max(3, curve.getLength() * 7),
      speed,
      opacity: 0.95,
    });
    list.push(flowTubeUniforms(mat));
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, radius, 14, false), mat);
    mesh.renderOrder = 4;
    this.heart.add(mesh);
    return new PathLUT(curve, 160);
  }

  private buildEcg(): void {
    const g = new THREE.Group();
    g.position.set(0, ECG_Y, 0.12);
    this.root.add(g);

    const pos = new Float32Array(ECG_N * 3);
    for (let i = 0; i < ECG_N; i++) pos[i * 3] = lerp(-ECG_W, ECG_W, i / (ECG_N - 1));
    this.ecgGeo = new THREE.BufferGeometry();
    this.ecgGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.ecgGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(ECG_N * 3), 3));
    this.ecgLineMat = lineMaterial(MINT, 0.95);
    this.ecgLineMat.vertexColors = true;
    const line = new THREE.Line(this.ecgGeo, this.ecgLineMat);
    line.frustumCulled = false;
    this.ecgDotMat = glowPointsMaterial(MINT, 0.028, 0.5, true);
    const dots = new THREE.Points(this.ecgGeo, this.ecgDotMat);
    dots.frustumCulled = false;
    this.ecgHeadGeo = new THREE.BufferGeometry();
    this.ecgHeadGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    this.ecgHeadMat = glowPointsMaterial(MINT, 0.12, 1);
    const head = new THREE.Points(this.ecgHeadGeo, this.ecgHeadMat);
    head.frustumCulled = false;

    // Monitor frame + baseline
    const W = ECG_W + 0.05;
    const H0 = -0.07;
    const H1 = 0.2;
    const frame = new Float32Array([
      -W, H0, 0, W, H0, 0,
      W, H0, 0, W, H1, 0,
      W, H1, 0, -W, H1, 0,
      -W, H1, 0, -W, H0, 0,
      -ECG_W, 0, 0, ECG_W, 0, 0,
    ]);
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(frame, 3));
    g.add(new THREE.LineSegments(fg, lineMaterial(MINT, 0.12)), line, dots, head);
  }

  private updateEcg(dt: number): void {
    this.ecgAcc += Math.min(dt, 0.25);
    let guard = 0;
    while (this.ecgAcc >= ECG_SDT && guard < 90) {
      guard++;
      this.ecgAcc -= ECG_SDT;
      this.ecgT += ECG_SDT;
      this.ecgIdx = (this.ecgIdx + 1) % ECG_N;
      let v = (Math.random() - 0.5) * 0.015;
      for (const b of this.beats) v += ecgAt(this.ecgT - b);
      this.ecgVals[this.ecgIdx] = v;
    }
    if (guard >= 90) {
      this.ecgAcc = 0;
      this.ecgT = this.clock;
    }
    const pos = this.ecgGeo.getAttribute('position') as THREE.BufferAttribute;
    const col = this.ecgGeo.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < ECG_N; i++) {
      const age = (this.ecgIdx - i + ECG_N) % ECG_N;
      const b = age > ECG_N - ECG_GAP ? 0 : Math.pow(1 - age / ECG_N, 0.7);
      pos.setY(i, this.ecgVals[i] * ECG_AMP);
      col.setXYZ(i, b, b, b);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    const hp = this.ecgHeadGeo.getAttribute('position') as THREE.BufferAttribute;
    hp.setXYZ(0, lerp(-ECG_W, ECG_W, this.ecgIdx / (ECG_N - 1)), this.ecgVals[this.ecgIdx] * ECG_AMP, 0);
    hp.needsUpdate = true;
  }

  private shapeChamber(c: Chamber, glassK: number, bloodK: number, glow: number): void {
    c.glass.scale.copy(c.size).multiplyScalar(glassK);
    c.blood.scale.copy(c.size).multiplyScalar(glassK * bloodK);
    c.bloodMat.emissiveIntensity = glow;
    c.glassMat.emissiveIntensity = 0.2 + 0.18 * Math.max(0, glow - 0.6);
  }

  /* ----------------------------------------------------------------- tick */

  protected override tick(dt: number, time: number, _input: ControlInput): void {
    this.clock += dt;
    const live = this.phase === 'handsOn';

    // Pacing: auto in tour/check; the SA node "takes over" once the rhythm is locked.
    if (!live) {
      this.bpm = TOUR_BPM;
      if (this.clock - this.lastBeat >= 60 / TOUR_BPM) this.beat();
    } else if (this.reached) {
      const rest = this.restBpm();
      this.bpm = rest;
      if (this.clock - this.lastBeat >= 60 / rest) this.beat();
    } else if (this.clock - this.lastTap > GAP_RESET) {
      this.bpm = 0;
      this.streak = 0;
    }
    this.bpmVis = damp(this.bpmVis, this.bpm, 5, dt);

    const tau = this.clock - this.lastBeat;
    const atr = smoothstep(0, 0.04, tau) * (1 - smoothstep(0.08, 0.16, tau));
    const vent = smoothstep(0.1, 0.17, tau) * (1 - smoothstep(0.3, 0.46, tau));

    // Ventricle volume: ejection in systole, refilling during diastole.
    if (tau < SYS_END) this.fill = lerp(this.fillAtBeat, RESID, smoothstep(0.12, 0.38, tau));
    else this.fill = damp(this.fill, 1, 4.2, dt);
    this.fill = Math.max(RESID, Math.min(1, this.fill));

    const beating = tau < GAP_RESET;
    this.activity = damp(this.activity, beating ? 1 : 0.15, 2, dt);

    // Blood flow
    const ejecting = tau > 0.12 && tau < 0.4 ? 1 : 0;
    this.aortaS.emit(ejecting * this.stroke * 150, dt);
    this.paLS.emit(ejecting * this.stroke * 75, dt);
    this.paRS.emit(ejecting * this.stroke * 75, dt);
    const surge = 0.7 + 1.4 * vent;
    const step = Math.min(dt, 0.05);
    this.aortaS.update(step, 1.2, surge);
    this.paLS.update(step, 1.1, surge);
    this.paRS.update(step, 1.1, surge);
    for (const s of this.inStreams) {
      s.emit(9 * this.activity, dt);
      s.update(step, 0.9 * (0.4 + 0.6 * this.activity), 1);
    }

    // Chambers
    const vS = 0.8 + 0.2 * this.fill;
    const vB = 0.35 + 0.55 * this.fill;
    const vGlow = 0.7 + 1.8 * vent * this.stroke + 0.3 * this.fill;
    this.shapeChamber(this.rv, vS, vB, vGlow);
    this.shapeChamber(this.lv, vS, vB, vGlow);
    const aS = 1 + 0.08 * vent - 0.14 * atr;
    const aGlow = 0.6 + 1.6 * atr;
    this.shapeChamber(this.ra, aS, 0.8, aGlow);
    this.shapeChamber(this.la, aS, 0.8, aGlow);

    const squeeze = vent * (0.35 + 0.65 * this.stroke);
    this.heart.scale.setScalar(1 - 0.035 * squeeze);
    this.heart.rotation.y = Math.sin(time * 0.3) * 0.22;
    this.winFx = Math.max(0, this.winFx - dt * 0.8);
    this.shellMat.emissiveIntensity = 0.1 + 0.25 * squeeze + 0.3 * this.winFx;
    setFresnel(this.shellRim, 0.75 + 1.1 * squeeze + 0.8 * this.winFx);
    this.coronaryMat.emissiveIntensity = 0.9 + 1.2 * squeeze;

    // Vessels: a pressure wave runs down the arteries each beat
    const wave = tau > 0.12 && tau < 1.0 ? (tau - 0.12) / 0.6 : -10;
    for (const u of this.outTubes) {
      u.time.value = time;
      u.focus.value = wave;
      u.glow.value = 0.85 + 0.5 * squeeze;
    }
    for (const u of this.inTubes) {
      u.time.value = time;
      u.glow.value = 0.7 + 0.3 * this.activity;
    }

    // Valves snap with each phase
    this.avMat.emissiveIntensity = 0.4 + 2.4 * atr;
    this.slMat.emissiveIntensity = 0.4 + 2.4 * vent;

    // ECG
    const [lo, hi] = this.window();
    const warn = live && !this.reached && (this.bpm > hi || (this.bpm > 0 && this.bpm < lo));
    this.ecgWarn = damp(this.ecgWarn, warn ? 1 : 0, 4, dt);
    this.ecgLineMat.color.copy(C_MINT).lerp(C_AMBER, this.ecgWarn);
    this.ecgDotMat.color.copy(this.ecgLineMat.color);
    this.ecgHeadMat.color.copy(this.ecgLineMat.color);
    this.ecgHeadMat.opacity = 0.6 + 0.4 * vent;
    this.updateEcg(dt);
  }

  /* -------------------------------------------------------------- readout */

  override getReadout(): Readout {
    const s = this.def.readout;
    const live = this.phase === 'handsOn';
    const [lo, hi] = this.window();
    const beating = this.taps.length >= 2 && this.clock - this.lastTap < GAP_RESET;
    let status: ReadoutStatus = 'idle';
    let note: string | undefined;
    if (this.reached) {
      status = 'done';
    } else if (live) {
      if (beating) {
        if (this.bpm > hi) {
          status = 'warn';
          note = "TOO FAST · CAN'T FILL";
        } else if (this.bpm < lo) {
          status = 'warn';
          note = 'TOO SLOW';
        } else {
          status = 'active';
          note = `STEADY ${this.streak}/${NEED}`;
        }
      } else {
        note = this.taps.length ? 'KEEP TAPPING' : 'TAP TO BEAT';
      }
    }
    const span = Math.max(1e-6, s.max - s.min);
    const progress = this.reached ? 1 : live ? this.streak / NEED : clamp01((this.bpmVis - s.min) / span);
    return this.makeReadout(this.bpmVis, { status, note, progress });
  }
}