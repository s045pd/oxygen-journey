/**
 * Level I — BREATHE.
 * Glass lungs inside a neon rib cage, sitting on a diaphragm dome.
 * HOLD = inhale: diaphragm contracts (flattens + drops), ribs swing up/out, lungs inflate.
 * RELEASE = exhale: everything eases back; exhaled air glows amber (more CO₂).
 */
import * as THREE from 'three';
import { LevelScene } from './base';
import type { LevelContext } from './base';
import type { ControlInput, LevelPhase, Readout } from '../types';
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

const CYAN = 0x38e8ff;
const ICE = 0xcdeeff;
const ROSE = 0xff4f8b;
const AIRWAY = 0xb9a8ff;
const AMBER = 0xffb347;

const LUNG_W = 0.15;
const LUNG_HALF = 0.34;
const LUNG_D = 0.15;
const LUNG_X = 0.155;
const APEX_Y = 0.36;
const DOME_CAP = Math.PI * 0.38;
const DOME_Y = -0.31;
const DOME_REST_H = 0.15;
const STERNUM_Z = 0.2;

interface AirSeed {
  u: number;
  lut: number;
  jx: number;
  jy: number;
  jz: number;
}

/** Shape a unit-sphere point into a lung (tapered apex, flat medial face, concave base). */
function deformLung(v: THREE.Vector3, side: number): void {
  const t = clamp01((v.y + 1) * 0.5);
  const taper = 1 - 0.45 * Math.pow(t, 1.6);
  v.x *= taper;
  v.z *= taper * (1 - 0.1 * t);
  if (v.x * side < 0) {
    let flat = 0.55;
    if (side > 0) {
      // Cardiac notch: the left lung leaves room for the heart.
      const notch = smoothstep(0, 0.55, v.z) * (1 - smoothstep(0, 0.4, Math.abs(v.y + 0.3)));
      flat *= 1 - 0.55 * notch;
    }
    v.x *= flat;
  }
  const r2 = v.x * v.x + v.z * v.z;
  const base = smoothstep(-0.35, -1, v.y);
  v.y += base * Math.max(0, 0.6 - r2) * 0.9;
}

/** Unit point → lung-local space (origin at the apex). */
function lungPoint(v: THREE.Vector3, side: number): void {
  deformLung(v, side);
  v.set(v.x * LUNG_W, v.y * LUNG_HALF - LUNG_HALF, v.z * LUNG_D);
}

function lungGeometry(side: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 48, 36);
  g.rotateY(Math.PI / 2); // push the UV seam to the back
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    lungPoint(v, side);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function sampleLut(lut: THREE.Vector3[], u: number, out: THREE.Vector3): THREE.Vector3 {
  const f = clamp01(u) * (lut.length - 1);
  const i = Math.min(lut.length - 2, Math.floor(f));
  return out.lerpVectors(lut[i], lut[i + 1], f - i);
}

const _v = new THREE.Vector3();
const _cA = new THREE.Color(CYAN);
const _cB = new THREE.Color(AMBER);

export class Level01Breathe extends LevelScene {
  override showsBody = true;

  private built = false;
  private breath = 0;
  private flow = 0;
  private cue = 0;
  private reached = false;
  private airPhase = 0;

  private readonly chest = new THREE.Group();
  private readonly ribs = new THREE.Group();
  private readonly dome = new THREE.Group();
  private readonly lungs: THREE.Group[] = [];

  private lungGlass!: THREE.MeshPhysicalMaterial;
  private lungRim!: THREE.ShaderMaterial;
  private sparkMat!: THREE.PointsMaterial;
  private domeMat!: THREE.MeshPhysicalMaterial;
  private fiberMat!: THREE.LineBasicMaterial;
  private airMat!: THREE.PointsMaterial;
  private airGeo!: THREE.BufferGeometry;
  private airSeeds: AirSeed[] = [];
  private airLut: THREE.Vector3[][] = [];
  private glow!: THREE.PointLight;

  protected override onEnter(ctx: LevelContext): void {
    const f = this.framing;
    // Fit pelvis→crown (~−0.5…+0.75) without cropping the skull on default framing.
    f.target.set(0, 0.02, 0);
    f.radius = 0.92;
    f.dir.set(0.18, 0.02, 1);
    f.drift = 0.08;
    f.ease = 2.2;
    f.minDistance = 0.55;
    if (!this.built) {
      this.build(ctx.lowPower);
      this.built = true;
    }
    this.breath = 0;
    this.flow = 0;
    this.cue = 0;
    this.reached = false;
    this.airPhase = 0;
    this.snapCamera();
  }

  protected override onPhase(phase: LevelPhase): void {
    if (phase === 'handsOn') this.reached = false;
  }

  override onHoldStart(): void {
    this.cue = 1;
  }

  /* ------------------------------------------------------------------ build */

  private build(lowPower: boolean): void {
    const r = rng(11);
    this.root.add(this.chest);
    this.chest.add(this.ribs, this.dome);

    /* Lungs */
    this.lungGlass = glassMaterial(CYAN, { opacity: 0.28, emissive: 0.12 });
    this.lungRim = fresnelMaterial(CYAN, { power: 2.3, intensity: 1 });
    this.sparkMat = glowPointsMaterial(0xa8f7ff, 0.024, 0.3);
    const lobeMat = neonMaterial(AIRWAY, 0.45, 0.18);

    for (const side of [1, -1]) {
      const g = new THREE.Group();
      g.position.set(side * LUNG_X, APEX_Y, 0);
      const geo = lungGeometry(side);
      const glass = new THREE.Mesh(geo, this.lungGlass);
      glass.renderOrder = 2;
      const rim = new THREE.Mesh(geo, this.lungRim);
      rim.renderOrder = 3;
      g.add(glass, rim);

      // Alveolar sparkle inside the lung volume.
      const n = lowPower ? 70 : 150;
      const arr = new Float32Array(n * 3);
      const v = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        do {
          v.set(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1);
        } while (v.lengthSq() > 1);
        v.multiplyScalar(0.86);
        lungPoint(v, side);
        arr[i * 3] = v.x;
        arr[i * 3 + 1] = v.y;
        arr[i * 3 + 2] = v.z;
      }
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      const sparks = new THREE.Points(sg, this.sparkMat);
      sparks.renderOrder = 4;
      sparks.frustumCulled = false;
      g.add(sparks);

      // Lobar bronchi live inside the lung group so they stretch with it.
      const hil = new THREE.Vector3(side * 0.13, 0.14, 0).sub(g.position);
      const targets: [number, number, number][] = [
        [0.165, 0.27, 0.02],
        [0.225, 0.06, 0.05],
        [0.19, -0.07, -0.03],
        [0.12, -0.02, 0.06],
      ];
      for (const t of targets) {
        const end = new THREE.Vector3(side * t[0], t[1], t[2]).sub(g.position);
        const mid = hil.clone().lerp(end, 0.5).add(new THREE.Vector3(side * 0.015, 0.01, 0));
        const c = new THREE.CatmullRomCurve3([hil.clone(), mid, end]);
        g.add(new THREE.Mesh(new THREE.TubeGeometry(c, 14, 0.0055, 5), lobeMat));
      }
      this.lungs.push(g);
      this.chest.add(g);
    }

    /* Airway: trachea, cartilage rings, main bronchi */
    const airwayMat = neonMaterial(AIRWAY, 0.55, 0.22);
    const trachea = new THREE.TubeGeometry(
      new THREE.LineCurve3(new THREE.Vector3(0, 0.68, 0), new THREE.Vector3(0, 0.29, 0)),
      6,
      0.02,
      14,
      false,
    );
    this.chest.add(new THREE.Mesh(trachea, airwayMat));
    const ringGeo = new THREE.TorusGeometry(0.0215, 0.0042, 6, 20, Math.PI * 1.6);
    ringGeo.rotateZ(-Math.PI * 0.3);
    ringGeo.rotateX(Math.PI / 2);
    for (let k = 0; k < 8; k++) {
      const ring = new THREE.Mesh(ringGeo, airwayMat);
      ring.position.y = 0.65 - k * 0.045;
      this.chest.add(ring);
    }
    const carina = new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 12), airwayMat);
    carina.position.y = 0.29;
    this.chest.add(carina);
    for (const side of [1, -1]) {
      const c = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.3, 0),
        new THREE.Vector3(side * 0.045, 0.27, 0),
        new THREE.Vector3(side * 0.095, 0.21, 0),
        new THREE.Vector3(side * 0.13, 0.14, 0),
      ]);
      this.chest.add(new THREE.Mesh(new THREE.TubeGeometry(c, 20, 0.0125, 10), airwayMat));
    }

    /* Rib cage, sternum, spine */
    const ribMat = neonMaterial(ICE, 0.55, 0.25);
    const cartMat = neonMaterial(CYAN, 0.35, 0.12);
    const ribCount = 10;
    let rib6End = new THREE.Vector3(0, -0.07, 0.19);
    for (let i = 0; i < ribCount; i++) {
      const y0 = 0.45 - i * 0.068;
      const rx = 0.22 + 0.12 * smoothstep(0, 5, i) - 0.025 * smoothstep(6, 9, i);
      const rz = rx * 0.7;
      const phiEnd = i < 7 ? Math.PI * 0.4 : i < 9 ? Math.PI * 0.24 : Math.PI * 0.02;
      for (const side of [1, -1]) {
        const pts: THREE.Vector3[] = [];
        const N = 22;
        for (let k = 0; k < N; k++) {
          const phi = -Math.PI / 2 + ((phiEnd + Math.PI / 2) * k) / (N - 1);
          const a = (phi + Math.PI / 2) / Math.PI;
          pts.push(
            new THREE.Vector3(
              side * (0.025 + rx * Math.cos(phi)),
              y0 - 0.11 * a - 0.03 * Math.cos(phi),
              rz * Math.sin(phi) - 0.03,
            ),
          );
        }
        this.ribs.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.0085, 6), ribMat));
        const end = pts[N - 1];
        if (i === 6 && side === 1) rib6End = end.clone();
        if (i < 7) {
          const st = new THREE.Vector3(side * 0.02, end.y + 0.03, STERNUM_Z);
          const mid = end.clone().lerp(st, 0.5).add(new THREE.Vector3(side * 0.012, 0.004, 0.012));
          this.ribs.add(
            new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([end, mid, st]), 10, 0.006, 5), cartMat),
          );
        } else if (i < 9) {
          const join = new THREE.Vector3(side * Math.abs(rib6End.x) * 0.7, rib6End.y - 0.01, rib6End.z + 0.01);
          const mid = end.clone().lerp(join, 0.5).add(new THREE.Vector3(0, -0.01, 0.015));
          this.ribs.add(
            new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([end, mid, join]), 10, 0.005, 5), cartMat),
          );
        }
      }
    }
    const sternum = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.44, 0.016), ribMat);
    sternum.position.set(0, 0.17, STERNUM_Z);
    this.ribs.add(sternum);

    const vertMat = neonMaterial(ICE, 0.35, 0.3);
    const vertGeo = new THREE.CylinderGeometry(0.026, 0.028, 0.044, 10);
    for (let k = 0; k < 15; k++) {
      const vert = new THREE.Mesh(vertGeo, vertMat);
      vert.position.set(0, 0.55 - k * 0.064, -0.3);
      this.chest.add(vert);
    }

    /* Diaphragm dome (geometry height normalised to 1; group.scale.y = height) */
    const c = Math.cos(DOME_CAP);
    const s = Math.sin(DOME_CAP);
    const sx = 0.33 / s;
    const sy = 1 / (1 - c);
    const sz = 0.25 / s;
    const domeGeo = new THREE.SphereGeometry(1, 48, 16, 0, Math.PI * 2, 0, DOME_CAP);
    domeGeo.translate(0, -c, 0);
    domeGeo.scale(sx, sy, sz);
    this.domeMat = glassMaterial(ROSE, { opacity: 0.26, emissive: 0.25, side: THREE.DoubleSide });
    const domeMesh = new THREE.Mesh(domeGeo, this.domeMat);
    domeMesh.renderOrder = 1;
    this.dome.add(domeMesh);

    const fib: number[] = [];
    const pt = (th: number, ph: number): number[] => [
      Math.sin(th) * Math.cos(ph) * sx,
      (Math.cos(th) - c) * sy,
      Math.sin(th) * Math.sin(ph) * sz,
    ];
    const M = 36;
    const S = 10;
    for (let k = 0; k < M; k++) {
      const ph = (k / M) * Math.PI * 2;
      for (let j = 0; j < S; j++) {
        fib.push(...pt((j / S) * DOME_CAP, ph), ...pt(((j + 1) / S) * DOME_CAP, ph));
      }
      const ph2 = ((k + 1) / M) * Math.PI * 2;
      fib.push(...pt(DOME_CAP, ph), ...pt(DOME_CAP, ph2));
      fib.push(...pt(DOME_CAP * 0.35, ph), ...pt(DOME_CAP * 0.35, ph2));
    }
    const fibGeo = new THREE.BufferGeometry();
    fibGeo.setAttribute('position', new THREE.Float32BufferAttribute(fib, 3));
    this.fiberMat = lineMaterial(ROSE, 0.3);
    this.dome.add(new THREE.LineSegments(fibGeo, this.fiberMat));
    this.dome.position.y = DOME_Y;
    this.dome.scale.y = DOME_REST_H;

    /* Airflow particles along trachea → bronchus → deep lung */
    for (const side of [1, -1]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.74, 0),
        new THREE.Vector3(0, 0.5, 0),
        new THREE.Vector3(0, 0.31, 0),
        new THREE.Vector3(side * 0.05, 0.265, 0),
        new THREE.Vector3(side * 0.1, 0.2, 0),
        new THREE.Vector3(side * 0.135, 0.13, 0),
        new THREE.Vector3(side * 0.18, 0.02, 0.01),
        new THREE.Vector3(side * 0.2, -0.08, 0.02),
      ]);
      this.airLut.push(curve.getSpacedPoints(90));
    }
    const nAir = lowPower ? 60 : 120;
    for (let i = 0; i < nAir; i++) {
      this.airSeeds.push({
        u: r(),
        lut: i % 2,
        jx: (r() - 0.5) * 0.024,
        jy: (r() - 0.5) * 0.02,
        jz: (r() - 0.5) * 0.024,
      });
    }
    this.airGeo = new THREE.BufferGeometry();
    this.airGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nAir * 3), 3));
    this.airGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nAir * 3), 3));
    this.airMat = glowPointsMaterial(0xffffff, 0.034, 0, true);
    const air = new THREE.Points(this.airGeo, this.airMat);
    air.frustumCulled = false;
    air.renderOrder = 5;
    this.chest.add(air);

    /* Motivated inner glow */
    this.glow = new THREE.PointLight(CYAN, 0.5, 1.6, 2);
    this.glow.position.set(0, 0.06, 0.3);
    this.chest.add(this.glow);
  }

  /* ------------------------------------------------------------------- tick */

  protected override tick(dt: number, time: number, input: ControlInput): void {
    const prev = this.breath;
    const live = this.phase === 'handsOn';
    if (live) {
      if (input.holding) this.breath = Math.min(1, this.breath + dt * 0.95 * (1.12 - this.breath));
      else this.breath = Math.max(0, this.breath - dt * 0.8 * (this.breath + 0.12));
    } else {
      const auto = 0.1 + 0.55 * (0.5 - 0.5 * Math.cos(time * 1.2));
      this.breath = damp(this.breath, auto, 4, dt);
    }
    const raw = dt > 1e-5 ? (this.breath - prev) / dt : 0;
    this.flow = damp(this.flow, raw, 12, dt);

    if (live && !this.reached) {
      const s = this.def.readout;
      const value = s.min + (s.max - s.min) * this.breath;
      if (Number(value.toFixed(s.decimals)) >= s.target) this.reached = true;
    }
    this.apply(dt, time);
  }

  private apply(dt: number, time: number): void {
    const e = smoothstep(0, 1, this.breath);
    const drive = clamp01(this.flow * 1.6);
    this.cue = Math.max(0, this.cue - dt * 2.5);

    for (const g of this.lungs) g.scale.set(1 + 0.09 * e, 1 + 0.17 * e, 1 + 0.1 * e);
    this.ribs.scale.set(1 + 0.07 * e, 1 + 0.015 * e, 1 + 0.09 * e);
    this.ribs.rotation.x = -0.035 * e;
    this.dome.scale.y = lerp(DOME_REST_H, 0.06, e);
    this.dome.position.y = lerp(DOME_Y, DOME_Y - 0.06, e);

    this.lungGlass.emissiveIntensity = 0.1 + 0.28 * e;
    this.lungGlass.opacity = 0.26 + 0.12 * e;
    setFresnel(this.lungRim, 0.85 + 1.1 * e + 0.8 * this.cue);
    this.sparkMat.opacity = 0.15 + 0.75 * e;
    this.domeMat.emissiveIntensity = 0.2 + 0.7 * drive;
    this.fiberMat.opacity = 0.22 + 0.6 * drive;
    this.glow.intensity = 0.3 + 1.0 * e;

    // Airflow: direction and brightness follow the rate of breathing.
    const f = this.flow;
    this.airPhase += f * dt * 1.25;
    this.airMat.opacity = clamp01(Math.abs(f) * 1.8);
    this.airMat.color.copy(_cA).lerp(_cB, clamp01(-f * 4));
    const pos = this.airGeo.getAttribute('position') as THREE.BufferAttribute;
    const col = this.airGeo.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < this.airSeeds.length; i++) {
      const s = this.airSeeds[i];
      let u = s.u + this.airPhase;
      u -= Math.floor(u);
      sampleLut(this.airLut[s.lut], u, _v);
      const spread = 1 + u * 1.5;
      pos.setXYZ(i, _v.x + s.jx * spread, _v.y + s.jy, _v.z + s.jz * spread);
      const fade = smoothstep(0, 0.08, u) * (1 - smoothstep(0.82, 1, u));
      col.setXYZ(i, fade, fade, fade);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;

    this.chest.position.y = Math.sin(time * 0.6) * 0.004;
  }

  /* ---------------------------------------------------------------- readout */

  override getReadout(): Readout {
    const s = this.def.readout;
    const value = s.min + (s.max - s.min) * this.breath;
    const active = this.phase === 'handsOn' && this.input.holding;
    return this.makeReadout(value, { status: this.reached ? 'done' : active ? 'active' : 'idle' });
  }
}