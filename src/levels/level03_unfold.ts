/**
 * Level III — UNFOLD.
 * A packed bunch of alveoli on a terminal bronchiole. The SLIDER (0..1) blooms
 * them out into a hexagonal sheet and inflates them, so the surface available for
 * gas exchange (and the readout) grows toward the target.
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

const MAGENTA = 0xff3fd0;
const CRIMSON = 0xff2d55;
const CYAN = 0x3cf0ff;
const DUCT = 0xb07cff;

const N_ALV = 19;
const HEX_S = 0.27;
const PACK_Y = 0.02;
const SHEET_Y = -0.06;
const HUB = new THREE.Vector3(0, 0.22, -0.08);

interface Alv {
  packed: THREE.Vector3;
  spread: THREE.Vector3;
  ring: number;
  phase: number;
}

interface Dot {
  a: number;
  u: THREE.Vector3;
  w: THREE.Vector3;
  ang: number;
  speed: number;
}

const _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _Y = new THREE.Vector3(0, 1, 0);

export class Level03Unfold extends LevelScene {
  private built = false;
  private readonly cluster = new THREE.Group();
  private readonly sheet = new THREE.Group();
  private alv: Alv[] = [];
  private centers: THREE.Vector3[] = [];
  private radii: number[] = [];

  private glass!: THREE.InstancedMesh;
  private rim!: THREE.InstancedMesh;
  private wire!: THREE.InstancedMesh;
  private glassMat!: THREE.MeshPhysicalMaterial;
  private rimMat!: THREE.ShaderMaterial;
  private wireMat!: THREE.MeshBasicMaterial;
  private stalkGeo!: THREE.BufferGeometry;
  private stalkMat!: THREE.LineBasicMaterial;
  private sheetLineMat!: THREE.LineBasicMaterial;
  private sheetFillMat!: THREE.MeshBasicMaterial;
  private dots: Dot[] = [];
  private dotGeo!: THREE.BufferGeometry;

  private unfold = 0;
  private sliderValue = 0;
  private reached = false;

  protected override onEnter(ctx: LevelContext): void {
    const f = this.framing;
    f.target.set(0, 0.04, 0);
    f.radius = 0.74;
    f.dir.set(0.15, 0.2, 1);
    f.drift = 0.1;
    f.ease = 2.2;
    if (!this.built) {
      this.build(ctx.lowPower);
      this.built = true;
    }
    this.unfold = 0;
    this.sliderValue = 0;
    this.reached = false;
    this.snapCamera();
  }

  protected override onPhase(phase: LevelPhase): void {
    if (phase === 'handsOn') this.reached = false;
  }

  override onSlider(v: number): void {
    this.sliderValue = clamp01(v);
  }

  /* ------------------------------------------------------------------ build */

  private build(lowPower: boolean): void {
    const r = rng(31);
    this.root.add(this.sheet, this.cluster);

    /* Terminal bronchiole feeding the cluster */
    const ductMat = neonMaterial(DUCT, 0.9, 0.25);
    const duct = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.02, 0.9, -0.18),
      new THREE.Vector3(0, 0.62, -0.13),
      new THREE.Vector3(0, 0.38, -0.1),
      HUB.clone(),
    ]);
    this.cluster.add(new THREE.Mesh(new THREE.TubeGeometry(duct, 40, 0.03, 14), ductMat));
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.036, 18, 14), ductMat);
    hub.position.copy(HUB);
    this.cluster.add(hub);

    /* Layouts: packed grape bunch → hexagonal sheet (19 = hex of radius 2) */
    const cells: { x: number; y: number; ring: number; ang: number }[] = [];
    for (let q = -2; q <= 2; q++) {
      for (let rr = -2; rr <= 2; rr++) {
        if (Math.abs(q + rr) > 2) continue;
        const x = HEX_S * (q + rr / 2);
        const y = HEX_S * (Math.sqrt(3) / 2) * rr;
        cells.push({ x, y, ring: (Math.abs(q) + Math.abs(rr) + Math.abs(q + rr)) / 2, ang: Math.atan2(y, x) });
      }
    }
    cells.forEach((c, i) => {
      const d = Math.hypot(c.x, c.y);
      const spread = new THREE.Vector3(c.x, c.y + SHEET_Y, -0.14 * Math.pow(d / 0.54, 2));
      const rr = c.ring === 0 ? 0 : c.ring === 1 ? 0.1 : 0.172;
      const z = c.ring === 0 ? 0.04 : c.ring === 1 ? (i % 2 ? 0.05 : -0.01) : i % 2 ? 0.02 : -0.08;
      const packed = new THREE.Vector3(Math.cos(c.ang) * rr, PACK_Y + Math.sin(c.ang) * rr * 0.88, z);
      this.alv.push({ packed, spread, ring: c.ring, phase: r() * Math.PI * 2 });
      this.centers.push(packed.clone());
      this.radii.push(0.066);
    });

    /* Alveoli: glass + fresnel rim + capillary net */
    const alvGeo = new THREE.IcosahedronGeometry(1, 3);
    this.glassMat = glassMaterial(MAGENTA, { opacity: 0.4, emissive: 0.28 });
    this.glass = new THREE.InstancedMesh(alvGeo, this.glassMat, N_ALV);
    this.glass.renderOrder = 2;
    this.rimMat = fresnelMaterial(MAGENTA, { power: 2.0, intensity: 1.1 });
    this.rim = new THREE.InstancedMesh(alvGeo, this.rimMat, N_ALV);
    this.rim.renderOrder = 3;
    this.wireMat = new THREE.MeshBasicMaterial({
      color: CRIMSON,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.wire = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), this.wireMat, N_ALV);
    this.wire.renderOrder = 4;
    for (const m of [this.glass, this.rim, this.wire]) {
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.cluster.add(m);
    }

    /* Stalks from the hub to each alveolus */
    this.stalkGeo = new THREE.BufferGeometry();
    this.stalkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N_ALV * 6), 3));
    this.stalkMat = lineMaterial(DUCT, 0.3);
    const stalks = new THREE.LineSegments(this.stalkGeo, this.stalkMat);
    stalks.frustumCulled = false;
    this.cluster.add(stalks);

    /* O₂ dots hugging the alveolar surfaces (count scales with area) */
    const nDots = lowPower ? 80 : 150;
    for (let i = 0; i < nDots; i++) {
      const n = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
      const u = new THREE.Vector3().crossVectors(n, Math.abs(n.y) < 0.9 ? _Y : new THREE.Vector3(1, 0, 0)).normalize();
      const w = new THREE.Vector3().crossVectors(n, u).normalize();
      this.dots.push({ a: Math.floor(r() * N_ALV), u, w, ang: r() * Math.PI * 2, speed: 0.4 + r() * 0.9 });
    }
    this.dotGeo = new THREE.BufferGeometry();
    this.dotGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nDots * 3), 3));
    const dotPts = new THREE.Points(this.dotGeo, glowPointsMaterial(CYAN, 0.026, 0.9));
    dotPts.frustumCulled = false;
    dotPts.renderOrder = 5;
    this.cluster.add(dotPts);

    /* Unfolded-area sheet: faint hex grid that grows behind the bloom */
    const SP = 0.2;
    const size = SP / Math.sqrt(3);
    const seg: number[] = [];
    for (let q = -3; q <= 3; q++) {
      for (let rr = -3; rr <= 3; rr++) {
        if (Math.abs(q + rr) > 3) continue;
        const cx = SP * (q + rr / 2);
        const cy = SP * (Math.sqrt(3) / 2) * rr;
        for (let k = 0; k < 6; k++) {
          const a0 = Math.PI / 6 + (k * Math.PI) / 3;
          const a1 = a0 + Math.PI / 3;
          seg.push(cx + Math.cos(a0) * size, cy + Math.sin(a0) * size, 0);
          seg.push(cx + Math.cos(a1) * size, cy + Math.sin(a1) * size, 0);
        }
      }
    }
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
    this.sheetLineMat = lineMaterial(MAGENTA, 0.1);
    this.sheet.add(new THREE.LineSegments(gridGeo, this.sheetLineMat));
    this.sheetFillMat = new THREE.MeshBasicMaterial({
      color: MAGENTA,
      transparent: true,
      opacity: 0.03,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const fill = new THREE.Mesh(new THREE.CircleGeometry(SP * 3.7, 6), this.sheetFillMat);
    fill.rotation.z = Math.PI / 6;
    fill.position.z = -0.005;
    this.sheet.add(fill);
    this.sheet.position.set(0, SHEET_Y, -0.32);
  }

  /* ------------------------------------------------------------------- tick */

  protected override tick(dt: number, time: number, input: ControlInput): void {
    let target: number;
    if (this.phase === 'tour') {
      target = 0.32 + 0.3 * Math.sin(time * 0.45);
    } else {
      target = clamp01(Number.isFinite(input.slider) ? input.slider : this.sliderValue);
    }
    this.unfold = damp(this.unfold, target, 4.5, dt);
    if (Math.abs(this.unfold - target) < 5e-4) this.unfold = target;
    const e = smoothstep(0, 1, this.unfold);

    for (let i = 0; i < N_ALV; i++) {
      const a = this.alv[i];
      const c = this.centers[i];
      c.lerpVectors(a.packed, a.spread, e);
      c.z += Math.sin(Math.PI * e) * 0.07 * a.ring;
      const rad = lerp(0.066, 0.118, e) * (1 + 0.035 * Math.sin(time * 2.1 + a.phase));
      this.radii[i] = rad;
      _s.set(rad, rad, rad);
      _m.compose(c, _qi, _s);
      this.glass.setMatrixAt(i, _m);
      this.rim.setMatrixAt(i, _m);
      _q.setFromAxisAngle(_Y, time * 0.15 + a.phase);
      _s.setScalar(rad * 1.035);
      _m.compose(c, _q, _s);
      this.wire.setMatrixAt(i, _m);
    }
    this.glass.instanceMatrix.needsUpdate = true;
    this.rim.instanceMatrix.needsUpdate = true;
    this.wire.instanceMatrix.needsUpdate = true;

    const sp = this.stalkGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < N_ALV; i++) {
      const c = this.centers[i];
      _d.copy(c).sub(HUB);
      const len = _d.length();
      if (len > 1e-4) _d.multiplyScalar(Math.max(0, len - this.radii[i] * 0.9) / len);
      sp.setXYZ(i * 2, HUB.x, HUB.y, HUB.z);
      sp.setXYZ(i * 2 + 1, HUB.x + _d.x, HUB.y + _d.y, HUB.z + _d.z);
    }
    sp.needsUpdate = true;

    const dp = this.dotGeo.getAttribute('position') as THREE.BufferAttribute;
    const nDots = this.dots.length;
    this.dotGeo.setDrawRange(0, Math.round(nDots * (0.1 + 0.9 * e)));
    for (let i = 0; i < nDots; i++) {
      const d = this.dots[i];
      const c = this.centers[d.a];
      const rr = this.radii[d.a] * 1.22;
      const th = d.ang + time * d.speed;
      _c.copy(c).addScaledVector(d.u, Math.cos(th) * rr).addScaledVector(d.w, Math.sin(th) * rr);
      dp.setXYZ(i, _c.x, _c.y, _c.z);
    }
    dp.needsUpdate = true;

    this.glassMat.emissiveIntensity = 0.24 + 0.3 * e;
    setFresnel(this.rimMat, 1.0 + 0.7 * e);
    this.wireMat.opacity = 0.3 + 0.3 * e;
    this.stalkMat.opacity = 0.15 + 0.5 * e;
    const ss = lerp(0.3, 1.0, e);
    this.sheet.scale.set(ss, ss, 1);
    this.sheetLineMat.opacity = 0.04 + 0.36 * e;
    this.sheetFillMat.opacity = 0.015 + 0.06 * e;

    this.cluster.rotation.y = Math.sin(time * 0.18) * 0.25;
    this.cluster.rotation.x = Math.sin(time * 0.13) * 0.05;

    if (this.phase === 'handsOn' && !this.reached) {
      const s = this.def.readout;
      if (Number(this.areaValue().toFixed(s.decimals)) >= s.target) this.reached = true;
    }
  }

  private areaValue(): number {
    const s = this.def.readout;
    return s.min + (s.max - s.min) * this.unfold;
  }

  /* ---------------------------------------------------------------- readout */

  override getReadout(): Readout {
    const active = this.phase === 'handsOn' && this.unfold > 0.02;
    return this.makeReadout(this.areaValue(), { status: this.reached ? 'done' : active ? 'active' : 'idle' });
  }
}