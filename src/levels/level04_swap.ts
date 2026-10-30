/**
 * Level IV — THE SWAP.
 * Cross-section diorama: alveolar air | two-cell membrane | capillary blood.
 * HOLD: O₂ (cyan) diffuses air → blood, CO₂ (amber) blood → air.
 * EXTRA SLIDER: membrane thickness — a thicker wall slows every crossing.
 */
import * as THREE from 'three';
import { LevelScene } from './base';
import type { LevelContext } from './base';
import type { ControlInput, LevelPhase, Readout, ReadoutStatus } from '../types';
import { clamp01, damp, glassMaterial, glowPointsMaterial, lerp, lineMaterial, neonMaterial, smoothstep } from './neon';

const X_EDGE = 0.8;
const Y_H = 0.4;
const Z_H = 0.24;
const CYAN = 0x3cf0ff;
const AMBER = 0xffae2e;
const CRIMSON = 0xff2d55;
const PINK = 0xff5ad1;
const ROSE = 0xff4f7a;
const BASEMENT = 0xb18cff;
const DEOXY = new THREE.Color(0x5b1a6e);
const OXY = new THREE.Color(0xff2b3a);

interface Mol {
  p: THREE.Vector3;
  v: THREE.Vector3;
  /** 0 = home side, 1 = crossing, 2 = arrived on far side. */
  state: number;
  vis: number;
  age: number;
  axis: THREE.Vector3;
  angle: number;
  spin: number;
}

interface Cell {
  x01: number;
  z: number;
  y0: number;
  axis: THREE.Vector3;
  phase: number;
}

const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _c = new THREE.Color();

function rbcGeometry(): THREE.LatheGeometry {
  // Biconcave disc profile (thin centre, thick rim), unit radius.
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

function keepYZ(m: Mol): void {
  const yl = Y_H - 0.025;
  const zl = Z_H - 0.025;
  if (m.p.y > yl) {
    m.p.y = yl;
    m.v.y = -Math.abs(m.v.y);
  } else if (m.p.y < -yl) {
    m.p.y = -yl;
    m.v.y = Math.abs(m.v.y);
  }
  if (m.p.z > zl) {
    m.p.z = zl;
    m.v.z = -Math.abs(m.v.z);
  } else if (m.p.z < -zl) {
    m.p.z = -zl;
    m.v.z = Math.abs(m.v.z);
  }
}

function jitter(m: Mol, dt: number, amp: number, max: number): void {
  m.v.x += (Math.random() - 0.5) * amp * dt;
  m.v.y += (Math.random() - 0.5) * amp * dt;
  m.v.z += (Math.random() - 0.5) * amp * dt;
  const l = m.v.length();
  if (l > max) m.v.multiplyScalar(max / l);
}

function makeArrow(mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.34, 8), mat);
  shaft.rotation.z = Math.PI / 2;
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.065, 14), mat);
  head.rotation.z = -Math.PI / 2;
  head.position.x = 0.2;
  g.add(shaft, head);
  return g;
}

export class Level04Swap extends LevelScene {
  private built = false;
  private readonly lab = new THREE.Group();
  private readonly membrane = new THREE.Group();
  private airBox!: THREE.Mesh;
  private bloodBox!: THREE.Mesh;
  private bloodMat!: THREE.MeshPhysicalMaterial;
  private epiMat!: THREE.MeshPhysicalMaterial;
  private endoMat!: THREE.MeshPhysicalMaterial;
  private baseMat!: THREE.MeshBasicMaterial;

  private o2: Mol[] = [];
  private co2: Mol[] = [];
  private o2Mesh!: THREE.InstancedMesh;
  private co2Mesh!: THREE.InstancedMesh;
  private o2Halo!: THREE.BufferGeometry;
  private co2Halo!: THREE.BufferGeometry;

  private cells: Cell[] = [];
  private rbcMesh!: THREE.InstancedMesh;
  private rbcMat!: THREE.MeshStandardMaterial;

  private arrowO2!: THREE.Group;
  private arrowCO2!: THREE.Group;
  private arrowO2Mat!: THREE.MeshStandardMaterial;
  private arrowCO2Mat!: THREE.MeshStandardMaterial;

  private thickN = 0.5;
  private extraTarget = 0.5;
  private half = 0.08;
  private sat = 0;
  private satVis = 0.5;
  private activity = 0;
  private flash = 0;
  private pulse = 0;
  private accO2 = 0;
  private accCO2 = 0;
  private flowPos = 0;
  private reached = false;

  protected override onEnter(ctx: LevelContext): void {
    const f = this.framing;
    f.target.set(0, 0, 0);
    f.radius = 0.9;
    f.dir.set(0.42, 0.34, 1);
    f.drift = 0.08;
    f.ease = 2.2;
    const init = clamp01(ctx.def.extraSlider?.initial ?? 0.5);
    this.extraTarget = init;
    this.thickN = init;
    this.half = lerp(0.045, 0.26, init) / 2;
    if (!this.built) {
      this.build(ctx.lowPower);
      this.built = true;
    }
    this.sat = 0;
    this.satVis = 0.5;
    this.activity = 0;
    this.reached = false;
    this.snapCamera();
  }

  protected override onPhase(phase: LevelPhase): void {
    if (phase === 'handsOn') {
      this.sat = 0;
      this.reached = false;
    }
  }

  override onHoldStart(): void {
    this.pulse = 1;
  }

  override onExtraSlider(v: number): void {
    this.extraTarget = clamp01(v);
  }

  /* ------------------------------------------------------------------ build */

  private build(lowPower: boolean): void {
    this.root.add(this.lab);
    const box = new THREE.BoxGeometry(1, 1, 1);
    const edges = new THREE.EdgesGeometry(box);

    // Alveolar air space
    this.airBox = new THREE.Mesh(box, glassMaterial(CYAN, { opacity: 0.1, emissive: 0.12 }));
    this.airBox.add(new THREE.LineSegments(edges, lineMaterial(CYAN, 0.55)));
    this.airBox.renderOrder = 1;

    // Capillary blood
    this.bloodMat = glassMaterial(CRIMSON, { opacity: 0.14, emissive: 0.15 });
    this.bloodBox = new THREE.Mesh(box, this.bloodMat);
    this.bloodBox.add(new THREE.LineSegments(edges, lineMaterial(CRIMSON, 0.55)));
    this.bloodBox.renderOrder = 1;

    // Membrane: alveolar epithelium | basement membrane | capillary endothelium
    this.epiMat = glassMaterial(PINK, { opacity: 0.42, emissive: 0.32 });
    this.endoMat = glassMaterial(ROSE, { opacity: 0.42, emissive: 0.3 });
    const epi = new THREE.Mesh(new THREE.BoxGeometry(0.44, 1, 1), this.epiMat);
    epi.position.x = -0.27;
    const endo = new THREE.Mesh(new THREE.BoxGeometry(0.44, 1, 1), this.endoMat);
    endo.position.x = 0.27;
    epi.renderOrder = endo.renderOrder = 2;
    this.baseMat = new THREE.MeshBasicMaterial({
      color: BASEMENT,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const basement = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.baseMat);
    basement.rotation.y = Math.PI / 2;
    this.membrane.add(epi, endo, basement, new THREE.LineSegments(edges, lineMaterial(PINK, 0.6)));
    const nucMat = neonMaterial(0xc05cff, 0.7, 0.3);
    const nucGeo = new THREE.SphereGeometry(1, 16, 12);
    const nucSpots: [number, number, number][] = [
      [-0.27, 0.28, -0.2],
      [-0.27, -0.18, 0.22],
      [-0.27, 0.02, -0.05],
      [0.27, 0.12, 0.25],
      [0.27, -0.3, -0.15],
      [0.27, 0.36, 0.1],
    ];
    for (const n of nucSpots) {
      const nuc = new THREE.Mesh(nucGeo, nucMat);
      nuc.position.set(n[0], n[1], n[2]);
      nuc.scale.set(0.3, 0.07 / (2 * Y_H), 0.09 / (2 * Z_H));
      this.membrane.add(nuc);
    }
    this.lab.add(this.airBox, this.membrane, this.bloodBox);

    // Molecules
    const nO2 = lowPower ? 40 : 64;
    const nCO2 = lowPower ? 26 : 40;
    this.o2Mesh = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.011, 0.018, 4, 8), neonMaterial(CYAN, 2.2, 0.2), nO2);
    this.co2Mesh = new THREE.InstancedMesh(
      new THREE.CapsuleGeometry(0.0105, 0.034, 4, 8),
      neonMaterial(AMBER, 2.0, 0.2),
      nCO2,
    );
    for (const m of [this.o2Mesh, this.co2Mesh]) {
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.renderOrder = 4;
      this.lab.add(m);
    }
    for (let i = 0; i < nO2; i++) {
      const m = this.makeMol();
      this.spawnAir(m);
      m.vis = 1;
      this.o2.push(m);
    }
    for (let i = 0; i < nCO2; i++) {
      const m = this.makeMol();
      this.spawnBlood(m);
      m.vis = 1;
      this.co2.push(m);
    }
    this.o2Halo = this.makeHalo(nO2, CYAN);
    this.co2Halo = this.makeHalo(nCO2, AMBER);

    // Red blood cells drifting up the capillary
    const nCells = lowPower ? 6 : 9;
    for (let i = 0; i < nCells; i++) {
      this.cells.push({
        x01: Math.random(),
        z: (Math.random() - 0.5) * 2 * (Z_H - 0.08),
        y0: (i / nCells) * 2 * (Y_H - 0.06) + Math.random() * 0.05,
        axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
        phase: Math.random() * Math.PI * 2,
      });
    }
    this.rbcMat = new THREE.MeshStandardMaterial({
      color: 0x7a1a2a,
      emissive: OXY,
      emissiveIntensity: 0.5,
      roughness: 0.45,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    this.rbcMesh = new THREE.InstancedMesh(rbcGeometry(), this.rbcMat, nCells);
    this.rbcMesh.frustumCulled = false;
    this.rbcMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rbcMesh.renderOrder = 3;
    this.lab.add(this.rbcMesh);

    // Direction-of-diffusion arrows
    this.arrowO2Mat = neonMaterial(CYAN, 0.3, 0.2);
    this.arrowCO2Mat = neonMaterial(AMBER, 0.3, 0.2);
    this.arrowO2 = makeArrow(this.arrowO2Mat);
    this.arrowO2.position.set(0, Y_H + 0.11, 0);
    this.arrowCO2 = makeArrow(this.arrowCO2Mat);
    this.arrowCO2.position.set(0, -Y_H - 0.11, 0);
    this.arrowCO2.rotation.y = Math.PI;
    this.lab.add(this.arrowO2, this.arrowCO2);

    this.layout(this.half * 2);
  }

  private makeMol(): Mol {
    return {
      p: new THREE.Vector3(),
      v: new THREE.Vector3(),
      state: 0,
      vis: 0,
      age: 0,
      axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 4,
    };
  }

  private makeHalo(n: number, color: number): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const pts = new THREE.Points(g, glowPointsMaterial(color, 0.075, 0.85, true));
    pts.frustumCulled = false;
    pts.renderOrder = 5;
    this.lab.add(pts);
    return g;
  }

  private spawnAir(m: Mol): void {
    const h = this.half;
    m.p.set(
      lerp(-X_EDGE + 0.04, -h - 0.03, Math.random()),
      lerp(-Y_H + 0.03, Y_H - 0.03, Math.random()),
      lerp(-Z_H + 0.03, Z_H - 0.03, Math.random()),
    );
    m.v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.12);
    m.state = 0;
    m.vis = 0;
    m.age = 0;
  }

  private spawnBlood(m: Mol): void {
    const h = this.half;
    m.p.set(
      lerp(h + 0.03, X_EDGE - 0.04, Math.random()),
      lerp(-Y_H + 0.03, Y_H - 0.03, Math.random()),
      lerp(-Z_H + 0.03, Z_H - 0.03, Math.random()),
    );
    m.v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.04);
    m.state = 0;
    m.vis = 0;
    m.age = 0;
  }

  private layout(t: number): void {
    const half = t / 2;
    this.half = half;
    const w = X_EDGE - half;
    this.airBox.scale.set(w, 2 * Y_H, 2 * Z_H);
    this.airBox.position.x = -(X_EDGE + half) / 2;
    this.bloodBox.scale.set(w, 2 * Y_H, 2 * Z_H);
    this.bloodBox.position.x = (X_EDGE + half) / 2;
    this.membrane.scale.set(Math.max(0.001, t), 2 * Y_H, 2 * Z_H);
  }

  /** Pick a resting molecule nearest the membrane and send it across. */
  private launch(list: Mol[], towardPositiveX: boolean): void {
    let best: Mol | null = null;
    for (let k = 0; k < 8; k++) {
      const m = list[Math.floor(Math.random() * list.length)];
      if (m.state !== 0 || m.vis < 0.6) continue;
      if (!best || (towardPositiveX ? m.p.x > best.p.x : m.p.x < best.p.x)) best = m;
    }
    if (best) {
      best.state = 1;
      best.age = 0;
    }
  }

  private stepO2(m: Mol, dt: number, vm: number): void {
    const h = this.half;
    const ax0 = -X_EDGE + 0.03;
    const ax1 = -h - 0.025;
    const bx0 = h + 0.025;
    const bx1 = X_EDGE - 0.03;
    m.age += dt;
    m.angle += m.spin * dt;
    if (m.state === 0) {
      jitter(m, dt, 1.2, 0.1);
      m.p.addScaledVector(m.v, dt);
      if (m.p.x < ax0) {
        m.p.x = ax0;
        m.v.x = Math.abs(m.v.x);
      } else if (m.p.x > ax1) {
        m.p.x = ax1;
        m.v.x = -Math.abs(m.v.x);
      }
      keepYZ(m);
      m.vis = Math.min(1, m.vis + dt * 1.6);
    } else if (m.state === 1) {
      const inMem = m.p.x > -h && m.p.x < h;
      const vx = m.p.x <= -h ? 0.55 : inMem ? vm : 0.35;
      m.p.x += vx * dt;
      if (inMem) {
        m.p.y += Math.sin(m.age * 13 + m.spin * 3) * 0.03 * dt;
        m.p.z += Math.cos(m.age * 11) * 0.03 * dt;
      }
      keepYZ(m);
      if (m.p.x >= bx0) {
        m.state = 2;
        m.age = 0;
        m.v.set(0.05 + Math.random() * 0.1, 0.1 + Math.random() * 0.06, (Math.random() - 0.5) * 0.06);
        this.flash = 1;
      }
    } else {
      m.v.x *= Math.max(0, 1 - dt * 1.2);
      m.p.addScaledVector(m.v, dt);
      if (m.p.x > bx1) m.p.x = bx1;
      keepYZ(m);
      m.vis -= dt * 0.75; // binding to haemoglobin
      if (m.vis <= 0) this.spawnAir(m);
    }
  }

  private stepCO2(m: Mol, dt: number, vm: number): void {
    const h = this.half;
    const ax0 = -X_EDGE + 0.03;
    const ax1 = -h - 0.025;
    const bx0 = h + 0.025;
    const bx1 = X_EDGE - 0.03;
    m.age += dt;
    m.angle += m.spin * dt;
    if (m.state === 0) {
      jitter(m, dt, 0.8, 0.05);
      m.p.addScaledVector(m.v, dt);
      m.p.y += 0.14 * dt; // carried by the blood flow
      if (m.p.x < bx0) {
        m.p.x = bx0;
        m.v.x = Math.abs(m.v.x);
      } else if (m.p.x > bx1) {
        m.p.x = bx1;
        m.v.x = -Math.abs(m.v.x);
      }
      if (m.p.z > Z_H - 0.025 || m.p.z < -Z_H + 0.025) {
        m.p.z = Math.max(-Z_H + 0.025, Math.min(Z_H - 0.025, m.p.z));
        m.v.z = -m.v.z;
      }
      if (m.p.y > Y_H - 0.03) {
        m.p.y = -Y_H + 0.03;
        m.vis = 0;
      } else if (m.p.y < -Y_H + 0.03) {
        m.p.y = -Y_H + 0.03;
      }
      m.vis = Math.min(1, m.vis + dt * 1.6);
    } else if (m.state === 1) {
      const inMem = m.p.x > -h && m.p.x < h;
      const vx = m.p.x >= h ? -0.45 : inMem ? -vm : -0.4;
      m.p.x += vx * dt;
      if (inMem) {
        m.p.y += Math.sin(m.age * 12 + m.spin * 3) * 0.03 * dt;
        m.p.z += Math.cos(m.age * 10) * 0.03 * dt;
      }
      keepYZ(m);
      if (m.p.x <= ax1) {
        m.state = 2;
        m.age = 0;
        m.v.set(-0.16 - Math.random() * 0.1, (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08);
      }
    } else {
      m.p.addScaledVector(m.v, dt);
      keepYZ(m);
      if (m.p.x < -X_EDGE + 0.22) m.vis -= dt * 1.4; // breathed out
      if (m.vis <= 0 || m.p.x < ax0) this.spawnBlood(m);
    }
  }

  private syncMols(list: Mol[], mesh: THREE.InstancedMesh, halo: THREE.BufferGeometry): void {
    const pos = halo.getAttribute('position') as THREE.BufferAttribute;
    const col = halo.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      const s = Math.max(1e-4, m.vis);
      _q.setFromAxisAngle(m.axis, m.angle);
      _s.set(s, s, s);
      _m.compose(m.p, _q, _s);
      mesh.setMatrixAt(i, _m);
      pos.setXYZ(i, m.p.x, m.p.y, m.p.z);
      const b = Math.max(0, m.vis) * (m.state === 1 ? 1 : 0.5);
      col.setXYZ(i, b, b, b);
    }
    mesh.instanceMatrix.needsUpdate = true;
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  /* ------------------------------------------------------------------- tick */

  protected override tick(dt: number, time: number, input: ControlInput): void {
    const live = this.phase === 'handsOn';
    const ex = clamp01(Number.isFinite(input.extra) ? input.extra : this.extraTarget);
    this.thickN = damp(this.thickN, ex, 6, dt);
    this.layout(lerp(0.045, 0.26, this.thickN));

    // Fick: rate ∝ 1 / thickness.
    const thickF = lerp(0.6, 3.0, this.thickN);
    const R = 0.42 / thickF;
    const holding = live && input.holding;
    if (live) {
      if (holding) this.sat = Math.min(1, this.sat + dt * R * (1 - 0.45 * this.sat));
      else this.sat = Math.max(0, this.sat - dt * 0.01);
      if (!this.reached) {
        const s = this.def.readout;
        const value = s.min + (s.max - s.min) * this.sat;
        if (Number(value.toFixed(s.decimals)) >= s.target) this.reached = true;
      }
    }
    this.activity = damp(this.activity, holding ? 1 : live ? 0 : 0.35, 4, dt);

    const rateO2 = holding ? R * 40 : live ? 0 : 5;
    const rateCO2 = holding ? R * 30 : live ? 0 : 3.5;
    this.accO2 += rateO2 * dt;
    while (this.accO2 >= 1) {
      this.accO2 -= 1;
      this.launch(this.o2, true);
    }
    this.accCO2 += rateCO2 * dt;
    while (this.accCO2 >= 1) {
      this.accCO2 -= 1;
      this.launch(this.co2, false);
    }

    const vm = lerp(0.2, 0.045, this.thickN);
    const step = Math.min(dt, 0.05);
    for (const m of this.o2) this.stepO2(m, step, vm);
    for (const m of this.co2) this.stepCO2(m, step, vm);
    this.syncMols(this.o2, this.o2Mesh, this.o2Halo);
    this.syncMols(this.co2, this.co2Mesh, this.co2Halo);

    // Red blood cells
    this.flowPos += dt * 0.11;
    const span = 2 * (Y_H - 0.06);
    const bx0 = this.half + 0.025;
    const bx1 = X_EDGE - 0.03;
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      const yy = (((c.y0 + this.flowPos) % span) + span) % span;
      const fade = smoothstep(0, 0.08, yy) * (1 - smoothstep(span - 0.08, span, yy));
      _p.set(lerp(bx0 + 0.07, bx1 - 0.07, c.x01), -Y_H + 0.06 + yy, c.z);
      _q.setFromAxisAngle(c.axis, c.phase + this.flowPos * 3);
      const s = Math.max(1e-4, 0.062 * fade);
      _s.set(s, s, s);
      _m.compose(_p, _q, _s);
      this.rbcMesh.setMatrixAt(i, _m);
    }
    this.rbcMesh.instanceMatrix.needsUpdate = true;

    // Colour story: blood brightens from purple-red to scarlet as it loads O₂.
    this.satVis = damp(this.satVis, this.phase === 'tour' ? 0.55 : this.sat, 3, dt);
    _c.copy(DEOXY).lerp(OXY, this.satVis);
    this.rbcMat.color.copy(_c).multiplyScalar(0.55);
    this.rbcMat.emissive.copy(_c);
    this.rbcMat.emissiveIntensity = 0.45 + 0.6 * this.flash;
    this.bloodMat.emissive.copy(_c);
    this.bloodMat.emissiveIntensity = 0.12 + 0.2 * this.satVis;
    this.flash = Math.max(0, this.flash - dt * 3);
    this.pulse = Math.max(0, this.pulse - dt * 2);

    this.epiMat.emissiveIntensity = 0.3 + 0.35 * this.activity + 0.5 * this.pulse;
    this.endoMat.emissiveIntensity = 0.28 + 0.35 * this.activity + 0.5 * this.pulse;
    this.baseMat.opacity = 0.3 + 0.45 * this.activity;

    const throb = 0.8 + 0.2 * Math.sin(time * 6);
    this.arrowO2Mat.emissiveIntensity = 0.25 + 2.0 * this.activity * throb;
    this.arrowCO2Mat.emissiveIntensity = 0.25 + 2.0 * this.activity * throb;
    const slide = (((time * 0.35) % 1) - 0.5) * 0.08 * this.activity;
    this.arrowO2.position.x = slide;
    this.arrowCO2.position.x = -slide;

    this.lab.rotation.y = Math.sin(time * 0.15) * 0.06;
  }

  /* ---------------------------------------------------------------- readout */

  override getReadout(): Readout {
    const s = this.def.readout;
    const value = s.min + (s.max - s.min) * this.sat;
    const live = this.phase === 'handsOn';
    const thick = this.thickN > 0.7;
    const status: ReadoutStatus = this.reached
      ? 'done'
      : live && this.input.holding
        ? thick
          ? 'warn'
          : 'active'
        : 'idle';
    return this.makeReadout(value, {
      status,
      note: !this.reached && live && thick ? 'THICK WALL · SLOW' : undefined,
    });
  }
}