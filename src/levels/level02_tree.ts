/**
 * Level II — THE TREE.
 * A neon trachea that splits again and again. Each TAP grows one more generation
 * of bronchi; a pulse of light runs from the trachea to the newest tips.
 */
import * as THREE from 'three';
import { LevelScene } from './base';
import type { LevelContext } from './base';
import type { ControlInput, LevelPhase, Readout } from '../types';
import { damp, fresnelMaterial, glowPointsMaterial, neonMaterial, rng, setFresnel, smoothstep } from './neon';

const MAX_GEN = 7;
const TRACHEA = 0xd4c6ff;
const VIOLET = 0x8a5cff;
const MAGENTA = 0xff4fd8;

interface Branch {
  start: THREE.Vector3;
  dir: THREE.Vector3;
  len: number;
  radius: number;
}

const _Y = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _m = new THREE.Matrix4();

export class Level02Tree extends LevelScene {
  private built = false;
  private readonly tree = new THREE.Group();
  private gens: Branch[][] = [];
  private tubes: THREE.InstancedMesh[] = [];
  private caps: THREE.InstancedMesh[] = [];
  private mats: THREE.MeshStandardMaterial[] = [];
  private grow: number[] = [];
  private drawn: number[] = [];

  private taps = 0;
  private localTaps = 0;
  private count = 0;
  private lastTarget = 0;
  private wave = 10;
  private fill = 0;
  private reached = false;

  private ringMat!: THREE.MeshStandardMaterial;
  private ghostMat!: THREE.ShaderMaterial;
  private tipGeo!: THREE.BufferGeometry;

  protected override onEnter(_ctx: LevelContext): void {
    const f = this.framing;
    f.target.set(0, 0.08, 0);
    f.radius = 0.78;
    f.dir.set(0, 0.18, 1);
    f.drift = 0.1;
    f.ease = 2.2;
    if (!this.built) {
      this.build();
      this.built = true;
    }
    this.taps = 0;
    this.localTaps = 0;
    this.count = 0;
    this.lastTarget = 0;
    this.wave = 10;
    this.reached = false;
    this.snapCamera();
  }

  protected override onPhase(phase: LevelPhase): void {
    if (phase === 'handsOn') {
      this.taps = 0;
      this.localTaps = 0;
      this.reached = false;
    }
  }

  override onTap(): void {
    this.localTaps++;
    this.wave = 0;
  }

  /* ------------------------------------------------------------------ build */

  private build(): void {
    this.root.add(this.tree);
    const r = rng(23);

    const trachea: Branch = {
      start: new THREE.Vector3(0, 0.64, 0),
      dir: new THREE.Vector3(0, -1, 0),
      len: 0.34,
      radius: 0.03,
    };
    this.gens = [[trachea]];
    let axes: THREE.Vector3[] = [new THREE.Vector3(0, 0, 1)];
    for (let g = 1; g <= MAX_GEN; g++) {
      const prev = this.gens[g - 1];
      const list: Branch[] = [];
      const nextAxes: THREE.Vector3[] = [];
      prev.forEach((p, i) => {
        const axis = axes[i];
        const end = p.start.clone().addScaledVector(p.dir, p.len);
        for (const sign of [-1, 1]) {
          const ang = (g === 1 ? 0.7 : 0.52) + (r() - 0.5) * 0.18;
          const dir = p.dir.clone().applyAxisAngle(axis, sign * ang);
          dir.y -= g === 1 ? 0.08 : 0.14;
          dir.normalize();
          const len = g === 1 ? p.len * 0.68 : p.len * (0.78 + (r() - 0.5) * 0.08);
          const radius = p.radius * (g === 1 ? 0.78 : 0.73);
          // Each generation branches in a plane rotated ~90° from its parent's.
          const na = new THREE.Vector3().crossVectors(dir, axis);
          if (na.lengthSq() < 1e-6) na.set(1, 0, 0);
          na.normalize().applyAxisAngle(dir, (r() - 0.5) * 0.6);
          list.push({ start: end.clone(), dir, len, radius });
          nextAxes.push(na);
        }
      });
      this.gens.push(list);
      axes = nextAxes;
    }

    const tubeGeo = new THREE.CylinderGeometry(0.8, 1, 1, 14, 1, true);
    tubeGeo.translate(0, 0.5, 0);
    const capGeo = new THREE.SphereGeometry(1, 16, 12);
    const cA = new THREE.Color(VIOLET);
    const cB = new THREE.Color(MAGENTA);
    for (let g = 0; g <= MAX_GEN; g++) {
      const col = g === 0 ? new THREE.Color(TRACHEA) : cA.clone().lerp(cB, Math.pow(g / MAX_GEN, 1.3));
      const mat = neonMaterial(col, 0.85, 0.22);
      const n = this.gens[g].length;
      const tube = new THREE.InstancedMesh(tubeGeo, mat, n);
      const cap = new THREE.InstancedMesh(capGeo, mat, n);
      for (const m of [tube, cap]) {
        m.frustumCulled = false;
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.visible = false;
      }
      this.tree.add(tube, cap);
      this.tubes.push(tube);
      this.caps.push(cap);
      this.mats.push(mat);
      this.grow.push(g === 0 ? 1 : 0);
      this.drawn.push(-1);
    }

    // C-shaped cartilage rings on the trachea.
    this.ringMat = neonMaterial(TRACHEA, 0.55, 0.25);
    const ringGeo = new THREE.TorusGeometry(0.0315, 0.0052, 6, 24, Math.PI * 1.6);
    ringGeo.rotateZ(-Math.PI * 0.3);
    ringGeo.rotateX(Math.PI / 2);
    for (let k = 0; k < 8; k++) {
      const ring = new THREE.Mesh(ringGeo, this.ringMat);
      ring.position.y = 0.61 - k * 0.038;
      this.tree.add(ring);
    }

    // Ghost lung outlines that "fill" as the tree reaches into them.
    this.ghostMat = fresnelMaterial(VIOLET, { power: 2.6, intensity: 0.9, opacity: 0.1 });
    const ghostGeo = new THREE.SphereGeometry(1, 40, 28);
    for (const side of [1, -1]) {
      const ghost = new THREE.Mesh(ghostGeo, this.ghostMat);
      ghost.scale.set(0.32, 0.46, 0.26);
      ghost.position.set(side * 0.3, -0.05, 0);
      ghost.renderOrder = 3;
      this.tree.add(ghost);
    }

    // Glowing tips on the newest generation.
    let tips = 0;
    for (let g = 1; g <= MAX_GEN; g++) tips += this.gens[g].length;
    this.tipGeo = new THREE.BufferGeometry();
    this.tipGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tips * 3), 3));
    this.tipGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(tips * 3), 3));
    const tipPts = new THREE.Points(this.tipGeo, glowPointsMaterial(0xffa6f2, 0.05, 1, true));
    tipPts.frustumCulled = false;
    tipPts.renderOrder = 5;
    this.tree.add(tipPts);
  }

  private updateGen(g: number): void {
    const p = this.grow[g];
    const tube = this.tubes[g];
    const cap = this.caps[g];
    const vis = p > 0.002;
    tube.visible = vis;
    cap.visible = vis;
    if (!vis) return;
    const e = smoothstep(0, 1, p);
    const w = 0.35 + 0.65 * e;
    const list = this.gens[g];
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      _q.setFromUnitVectors(_Y, b.dir);
      _s.set(b.radius * w, b.len * e, b.radius * w);
      _m.compose(b.start, _q, _s);
      tube.setMatrixAt(i, _m);
      _p.copy(b.start).addScaledVector(b.dir, b.len * e);
      const cr = b.radius * w * 0.82;
      _s.set(cr, cr, cr);
      _m.compose(_p, _q, _s);
      cap.setMatrixAt(i, _m);
    }
    tube.instanceMatrix.needsUpdate = true;
    cap.instanceMatrix.needsUpdate = true;
  }

  /* ------------------------------------------------------------------- tick */

  protected override tick(dt: number, time: number, input: ControlInput): void {
    let target: number;
    if (this.phase === 'tour') {
      target = Math.min(MAX_GEN, Math.floor((time * 0.9) % 11));
    } else {
      this.taps = Math.max(this.taps, input.tapCount, this.localTaps);
      if (input.tapsThisFrame > 0) this.wave = 0;
      target = Math.min(MAX_GEN, this.taps);
    }
    if (target > this.lastTarget) this.wave = 0;
    this.lastTarget = target;
    this.count = target;

    // Grow one generation at a time; retract deepest-first.
    const speed = 3.4;
    for (let g = 1; g <= MAX_GEN; g++) {
      if (g <= target && (g === 1 || this.grow[g - 1] >= 1)) this.grow[g] = Math.min(1, this.grow[g] + dt * speed);
    }
    for (let g = MAX_GEN; g >= 1; g--) {
      if (g > target && (g === MAX_GEN || this.grow[g + 1] <= 0)) {
        this.grow[g] = Math.max(0, this.grow[g] - dt * speed * 1.6);
      }
    }
    for (let g = 0; g <= MAX_GEN; g++) {
      if (this.grow[g] !== this.drawn[g]) {
        this.updateGen(g);
        this.drawn[g] = this.grow[g];
      }
    }

    // Light pulse travelling down the generations.
    this.wave += dt;
    const front = this.wave * 9;
    const waveOn = this.wave < 2;
    const boost = (g: number): number => {
      if (!waveOn) return 0;
      const d = front - g;
      return Math.exp(-d * d * 0.6) * (1 - this.wave / 2);
    };
    for (let g = 0; g <= MAX_GEN; g++) this.mats[g].emissiveIntensity = 0.8 + 2.4 * boost(g);
    this.ringMat.emissiveIntensity = 0.55 + 1.6 * boost(0);

    let frontier = 0;
    for (let g = 1; g <= MAX_GEN; g++) if (this.grow[g] > 0.001) frontier = g;
    this.fill = damp(this.fill, frontier / MAX_GEN, 3, dt);
    setFresnel(this.ghostMat, 0.9, 0.08 + 0.5 * this.fill);

    const pos = this.tipGeo.getAttribute('position') as THREE.BufferAttribute;
    const col = this.tipGeo.getAttribute('color') as THREE.BufferAttribute;
    let k = 0;
    for (let g = 1; g <= MAX_GEN; g++) {
      const e = smoothstep(0, 1, this.grow[g]);
      const bright = (g === frontier ? e : 0) + boost(g) * 0.6 * e;
      for (const b of this.gens[g]) {
        _p.copy(b.start).addScaledVector(b.dir, b.len * e);
        pos.setXYZ(k, _p.x, _p.y, _p.z);
        const tw = bright * (0.75 + 0.25 * Math.sin(time * 3 + k * 1.7));
        col.setXYZ(k, tw, tw, tw);
        k++;
      }
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;

    this.tree.rotation.y = Math.sin(time * 0.22) * 0.5;

    if (this.phase === 'handsOn' && !this.reached) {
      const s = this.def.readout;
      if (Number(this.genValue(target).toFixed(s.decimals)) >= s.target) this.reached = true;
    }
  }

  /** Map visual generations (≤7) onto the readout scale so the target is reachable. */
  private genValue(count: number): number {
    const s = this.def.readout;
    const per = Math.max(1, s.target / MAX_GEN);
    return Math.min(s.max, Math.max(s.min, count * per));
  }

  /* ---------------------------------------------------------------- readout */

  override getReadout(): Readout {
    const value = this.genValue(this.count);
    const active = this.phase === 'handsOn' && this.taps > 0;
    return this.makeReadout(value, { status: this.reached ? 'done' : active ? 'active' : 'idle' });
  }
}