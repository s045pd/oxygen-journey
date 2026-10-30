/**
 * Oxygen Journey — Level 09 "RUN".
 * Effort slider → heart rate (60..190 bpm). Past the aerobic threshold the leg muscles
 * switch to anaerobic respiration: lactic acid builds (amber particles, burning muscle glow),
 * and afterwards the runner keeps panting to repay the oxygen debt.
 * Fully procedural: glass runner, neon heart/lungs/muscles, ECG ribbon, scrolling track.
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

const C_O2 = 0x2fe6ff;
const C_LACTIC = 0xffa22e;
const C_HEART = 0xff2d55;
const C_BREATH = 0xa77bff;
const C_GLASS = 0x9fd6ff;

const HR_MIN = 60;
const HR_MAX = 190;
/** Effort at which aerobic oxygen supply maxes out (≈148 bpm). */
const THRESHOLD = 0.68;
/** Demo effort per tour beat: rest → jog → sprint → recovery (oxygen debt). */
const TOUR_EFFORT = [0.05, 0.45, 0.95, 0.15];

const HIP_Y = 0.91;
const THIGH = 0.43;
const SHIN = 0.42;
const UPPER_ARM = 0.28;
const FOREARM = 0.27;

const ECG_N = 200;
const ECG_RATE = 80;
const ECG_X0 = -1.1;
const ECG_X1 = 0.95;
const ECG_Y = 1.74;
const ECG_Z = -0.8;
const ECG_AMP = 0.19;
const CORE_W = 0.006;
const GLOW_W = 0.04;

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _c1 = new THREE.Color();
const _c2 = new THREE.Color();
const _zone = new THREE.Color();
const _shake = new THREE.Vector3();

interface Limb {
  pivot: THREE.Group;
  lower: THREE.Group;
}

interface LegFx {
  o2Attr: THREE.BufferAttribute;
  o2ColAttr: THREE.BufferAttribute;
  o2Base: Float32Array;
  lacGeo: THREE.BufferGeometry;
  lacAttr: THREE.BufferAttribute;
  lacBase: Float32Array;
  lacSeed: Float32Array;
  lacCount: number;
}

function gauss(x: number, mu: number, s: number): number {
  const d = (x - mu) / s;
  return Math.exp(-d * d);
}

/** ECG trace for time `tb` (s) since beat start; QRS fixed in time, T wave shifts with period. */
function ecgWave(tb: number, period: number): number {
  const tMu = 0.175 + 0.3 * Math.sqrt(period);
  return (
    0.1 * gauss(tb, 0.08, 0.025) -
    0.12 * gauss(tb, 0.155, 0.008) +
    1.0 * gauss(tb, 0.175, 0.011) -
    0.24 * gauss(tb, 0.195, 0.01) +
    0.22 * gauss(tb, tMu, 0.045)
  );
}

function beatPulse(tb: number): number {
  return gauss(tb, 0.2, 0.06);
}

function heartGeometry(): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0.25);
  s.bezierCurveTo(0, 0.3, -0.05, 0.5, -0.25, 0.5);
  s.bezierCurveTo(-0.55, 0.5, -0.55, 0.15, -0.55, 0.15);
  s.bezierCurveTo(-0.55, -0.05, -0.35, -0.27, 0, -0.45);
  s.bezierCurveTo(0.35, -0.27, 0.55, -0.05, 0.55, 0.15);
  s.bezierCurveTo(0.55, 0.15, 0.55, 0.5, 0.25, 0.5);
  s.bezierCurveTo(0.1, 0.5, 0, 0.3, 0, 0.25);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: 0.22,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.07,
    bevelSegments: 3,
    curveSegments: 16,
  });
  g.center();
  g.scale(0.11, 0.11, 0.11);
  return g;
}

function radialMask(size = 128): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#000';
    g.fillRect(0, 0, size, size);
    const r = size / 2;
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.45, '#8a8a8a');
    grad.addColorStop(1, '#000000');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

export class Level09Run extends LevelScene {
  private built = false;

  /* materials */
  private glassMat!: THREE.MeshPhysicalMaterial;
  private rimMat!: THREE.ShaderMaterial;
  private muscleMat!: THREE.MeshStandardMaterial;
  private heartMat!: THREE.MeshStandardMaterial;
  private arteryMat!: THREE.MeshStandardMaterial;
  private dashMat!: THREE.MeshStandardMaterial;
  private o2Mat!: THREE.PointsMaterial;
  private lacMat!: THREE.PointsMaterial;
  private puffMat!: THREE.PointsMaterial;
  private streakMat!: THREE.LineBasicMaterial;
  private gridMat!: THREE.LineBasicMaterial;
  private contactMat!: THREE.MeshBasicMaterial;
  private rippleMat!: THREE.MeshBasicMaterial;
  private heartGlowMat!: THREE.SpriteMaterial;
  private ecgDotMat!: THREE.SpriteMaterial;

  /* rig */
  private readonly hips = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly mouth = new THREE.Object3D();
  private head!: THREE.Mesh;
  private armN!: Limb;
  private armF!: Limb;
  private legN!: Limb;
  private legF!: Limb;
  private heart!: THREE.Mesh;
  private heartGlow!: THREE.Sprite;
  private lungs: THREE.Mesh[] = [];
  private heartLight!: THREE.PointLight;
  private legLight!: THREE.PointLight;

  /* fx */
  private legFx: LegFx[] = [];
  private dashes!: THREE.InstancedMesh;
  private dashPerRow = 16;
  private contact!: THREE.Mesh;
  private ripple!: THREE.Mesh;
  private streakAttr!: THREE.BufferAttribute;
  private streakData!: Float32Array;
  private puffPosAttr!: THREE.BufferAttribute;
  private puffColAttr!: THREE.BufferAttribute;
  private puffVel!: Float32Array;
  private puffLife!: Float32Array;
  private puffCursor = 0;
  private puffAcc = 0;

  /* ECG */
  private readonly ecgSamples = new Float32Array(ECG_N);
  private readonly ecgX = new Float32Array(ECG_N);
  private readonly ecgY = new Float32Array(ECG_N);
  private ecgWrite = 0;
  private ecgAcc = 0;
  private ecgCoreAttr!: THREE.BufferAttribute;
  private ecgCoreColAttr!: THREE.BufferAttribute;
  private ecgGlowAttr!: THREE.BufferAttribute;
  private ecgGlowColAttr!: THREE.BufferAttribute;
  private ecgDot!: THREE.Sprite;

  /* state */
  private effort = 0.05;
  private hr = 62;
  private lactate = 0;
  private deficit = 0;
  private strain = 0;
  private beat = 0;
  private breathPhase = 0;
  private stridePhase = 0;
  private trackScroll = 0;
  private reached = false;
  private readonly shake = new THREE.Vector3();

  constructor() {
    super();
  }

  /* ------------------------------------------------------------------ lifecycle */

  protected onEnter(ctx: LevelContext): void {
    if (!this.built) {
      this.build(ctx);
      this.built = true;
    }
    this.resetState();
    const f = this.framing;
    f.target.set(0.0, 1.0, -0.25);
    f.radius = 1.18;
    f.dir.set(0.3, 0.16, 1);
    f.drift = 0.07;
    f.ease = 2.0;
    f.minDistance = 1.2;
    this.snapCamera();
  }

  protected onPhase(phase: LevelPhase): void {
    if (phase === 'handsOn') this.reached = false;
  }

  override update(dt: number, time: number, input: ControlInput): void {
    this.camera.position.sub(this.shake);
    super.update(dt, time, input);
    const amp = 0.0035 * this.effort * smoothstep(0.03, 0.4, this.effort) + 0.007 * this.strain;
    _shake.set(
      (Math.sin(time * 31.7) * 0.6 + Math.sin(time * 17.3 + 0.4) * 0.4) * amp,
      (Math.sin(time * 27.1 + 1.3) * 0.6 + Math.sin(time * 13.9) * 0.4) * amp,
      0,
    );
    this.shake.copy(_shake);
    this.camera.position.add(this.shake);
  }

  override dispose(): void {
    super.dispose();
    this.hips.clear();
    this.torso.clear();
    this.legFx = [];
    this.lungs = [];
    this.built = false;
  }

  private resetState(): void {
    this.effort = 0.05;
    this.hr = 62;
    this.lactate = 0;
    this.deficit = 0;
    this.strain = 0;
    this.beat = 0;
    this.breathPhase = 0;
    this.stridePhase = 0;
    this.trackScroll = 0;
    this.reached = false;
    this.ecgAcc = 0;
    this.ecgWrite = 0;
    this.puffAcc = 0;
    this.shake.set(0, 0, 0);
    const period = 60 / this.hr;
    for (let i = 0; i < ECG_N; i++) {
      const t = (i / ECG_RATE) % period;
      this.ecgSamples[i] = ecgWave(t, period) + ecgWave(t + period, period);
    }
    this.beat = ECG_N / ECG_RATE / period;
    if (this.puffLife) this.puffLife.fill(0);
  }

  /* ------------------------------------------------------------------ build */

  private build(ctx: LevelContext): void {
    const low = ctx.lowPower;
    this.glassMat = glassMaterial(C_GLASS, { opacity: 0.2, emissive: 0.08, roughness: 0.12 });
    this.rimMat = fresnelMaterial(0x8fdcff, { power: 2.6, intensity: 0.9, opacity: 0.85 });
    this.muscleMat = neonMaterial(C_O2, 0.8, 0.12);
    this.heartMat = neonMaterial(C_HEART, 1.4, 0.15);
    this.arteryMat = neonMaterial(C_HEART, 0.9, 0.1);
    this.dashMat = neonMaterial(C_O2, 1.1, 0.1);
    this.o2Mat = glowPointsMaterial(0xffffff, 0.036, 1, true);
    this.lacMat = glowPointsMaterial(C_LACTIC, 0.046, 0.95);
    this.puffMat = glowPointsMaterial(0xffffff, 0.07, 0.9, true);

    this.buildFloor(low);
    this.buildRunner(low);
    this.buildEcg();
    this.buildStreaks(low);
    this.buildPuffs(low);
  }

  private part(parent: THREE.Object3D, geo: THREE.BufferGeometry, x: number, y: number, z: number): THREE.Mesh {
    const mesh = new THREE.Mesh(geo, this.glassMat);
    mesh.position.set(x, y, z);
    mesh.renderOrder = 3;
    const rim = new THREE.Mesh(geo, this.rimMat);
    rim.scale.setScalar(1.035);
    rim.renderOrder = 4;
    mesh.add(rim);
    parent.add(mesh);
    return mesh;
  }

  private buildLimb(
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    upperLen: number,
    upperR: number,
    lowerLen: number,
    lowerR: number,
  ): Limb {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    parent.add(pivot);
    this.part(pivot, new THREE.CapsuleGeometry(upperR, upperLen - upperR * 2, 4, 12), 0, -upperLen / 2, 0);
    const lower = new THREE.Group();
    lower.position.y = -upperLen;
    pivot.add(lower);
    this.part(lower, new THREE.CapsuleGeometry(lowerR, lowerLen - lowerR * 2, 4, 12), 0, -lowerLen / 2, 0);
    return { pivot, lower };
  }

  private buildFloor(low: boolean): void {
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x070a10,
      roughness: 0.38,
      metalness: 0.6,
      alphaMap: radialMask(),
      transparent: true,
      depthWrite: false,
    });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(3.2, low ? 40 : 72), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.renderOrder = 0;
    this.root.add(floor);

    // static lane rails
    const laneMat = neonMaterial(C_O2, 0.3, 0.08);
    const laneGeo = new THREE.BoxGeometry(5, 0.002, 0.006);
    for (const z of [-0.34, 0.34]) {
      const lane = new THREE.Mesh(laneGeo, laneMat);
      lane.position.set(0, 0.001, z);
      this.root.add(lane);
    }

    // scrolling dashes (treadmill speed)
    this.dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.003, 0.016), this.dashMat, this.dashPerRow * 2);
    this.dashes.frustumCulled = false;
    this.root.add(this.dashes);

    // contact glow + heartbeat ripple
    this.contactMat = new THREE.MeshBasicMaterial({
      map: glowTexture(),
      color: C_O2,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.contact = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.55), this.contactMat);
    this.contact.rotation.x = -Math.PI / 2;
    this.contact.position.y = 0.003;
    this.root.add(this.contact);

    this.rippleMat = new THREE.MeshBasicMaterial({
      color: C_HEART,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.ripple = new THREE.Mesh(new THREE.RingGeometry(0.96, 1.0, low ? 48 : 96), this.rippleMat);
    this.ripple.rotation.x = -Math.PI / 2;
    this.ripple.position.y = 0.004;
    this.root.add(this.ripple);
  }

  private buildRunner(low: boolean): void {
    this.root.add(this.hips);
    this.hips.position.set(0, HIP_Y, 0);
    this.hips.add(this.torso);

    const sphere = new THREE.SphereGeometry(1, 20, 14);

    // pelvis, torso, neck, head
    this.part(this.hips, sphere, 0, 0, 0).scale.set(0.11, 0.085, 0.15);
    this.part(this.torso, new THREE.CapsuleGeometry(0.13, 0.3, 6, 16), 0, 0.3, 0).scale.set(0.82, 1, 1.12);
    this.part(this.torso, new THREE.CapsuleGeometry(0.035, 0.06, 4, 10), 0.01, 0.62, 0);
    this.head = this.part(this.torso, sphere, 0.01, 0.75, 0);
    this.head.scale.set(0.105, 0.115, 0.098);
    // visor stripe gives the runner a facing direction
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.8), neonMaterial(C_O2, 1.0, 0.1));
    visor.position.set(0.86, 0.08, 0);
    this.head.add(visor);
    this.mouth.position.set(0.95, -0.3, 0);
    this.head.add(this.mouth);

    // lungs
    const lungMat = glassMaterial(C_BREATH, { opacity: 0.32, emissive: 0.45, tint: 0.5 });
    const lungRim = fresnelMaterial(C_BREATH, { power: 2.0, intensity: 0.8, opacity: 0.8 });
    for (const z of [-0.068, 0.068]) {
      const lung = new THREE.Mesh(sphere, lungMat);
      lung.position.set(-0.012, 0.4, z);
      lung.scale.set(0.055, 0.11, 0.05);
      lung.renderOrder = 2;
      const rim = new THREE.Mesh(sphere, lungRim);
      rim.scale.setScalar(1.04);
      rim.renderOrder = 2;
      lung.add(rim);
      this.torso.add(lung);
      this.lungs.push(lung);
    }

    // heart
    const heartPos = new THREE.Vector3(0.05, 0.4, -0.035);
    this.heart = new THREE.Mesh(heartGeometry(), this.heartMat);
    this.heart.position.copy(heartPos);
    this.heart.rotation.set(0, 0.5, -0.35);
    this.torso.add(this.heart);
    this.heartGlowMat = new THREE.SpriteMaterial({
      map: glowTexture(),
      color: C_HEART,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.heartGlow = new THREE.Sprite(this.heartGlowMat);
    this.heartGlow.position.copy(heartPos);
    this.heartGlow.scale.setScalar(0.3);
    this.heartGlow.renderOrder = 6;
    this.torso.add(this.heartGlow);
    this.heartLight = new THREE.PointLight(C_HEART, 0.4, 1.4, 2);
    this.heartLight.position.copy(heartPos).add(_v.set(0.12, 0, 0.1));
    this.torso.add(this.heartLight);

    // aorta: heart → hips
    const aorta = new THREE.CatmullRomCurve3([
      heartPos.clone(),
      new THREE.Vector3(0.03, 0.3, -0.02),
      new THREE.Vector3(0.0, 0.15, 0),
      new THREE.Vector3(0.0, 0.02, 0),
    ]);
    this.torso.add(new THREE.Mesh(new THREE.TubeGeometry(aorta, 24, 0.009, 6, false), this.arteryMat));

    // limbs (near = +z, camera side)
    this.armN = this.buildLimb(this.torso, 0, 0.52, 0.17, UPPER_ARM, 0.04, FOREARM, 0.035);
    this.armF = this.buildLimb(this.torso, 0, 0.52, -0.17, UPPER_ARM, 0.04, FOREARM, 0.035);
    for (const arm of [this.armN, this.armF]) {
      this.part(arm.lower, sphere, 0, -FOREARM, 0).scale.setScalar(0.035);
    }
    this.legN = this.buildLimb(this.hips, 0, -0.02, 0.085, THIGH, 0.06, SHIN, 0.045);
    this.legF = this.buildLimb(this.hips, 0, -0.02, -0.085, THIGH, 0.06, SHIN, 0.045);

    const footGeo = new THREE.BoxGeometry(0.16, 0.045, 0.075);
    const thighArtery = new THREE.CylinderGeometry(0.007, 0.006, THIGH - 0.04, 6);
    const shinArtery = new THREE.CylinderGeometry(0.006, 0.005, SHIN - 0.06, 6);
    const nO2 = low ? 24 : 40;
    const nLac = low ? 40 : 72;
    let seed = 9091;
    for (const leg of [this.legN, this.legF]) {
      this.part(leg.lower, footGeo, 0.035, -SHIN - 0.025, 0);
      // muscles: quadriceps + calf
      const quad = new THREE.Mesh(sphere, this.muscleMat);
      quad.position.set(0.012, -0.21, 0);
      quad.scale.set(0.045, 0.165, 0.04);
      leg.pivot.add(quad);
      const calf = new THREE.Mesh(sphere, this.muscleMat);
      calf.position.set(-0.012, -0.15, 0);
      calf.scale.set(0.032, 0.12, 0.03);
      leg.lower.add(calf);
      // arteries
      const a1 = new THREE.Mesh(thighArtery, this.arteryMat);
      a1.position.set(0.028, -THIGH / 2, 0.02);
      leg.pivot.add(a1);
      const a2 = new THREE.Mesh(shinArtery, this.arteryMat);
      a2.position.set(0.02, -SHIN / 2, 0.012);
      leg.lower.add(a2);
      this.legFx.push(this.buildLegFx(leg.pivot, seed++, nO2, nLac));
    }

    this.legLight = new THREE.PointLight(C_LACTIC, 0, 1.6, 2);
    this.legLight.position.set(0.12, -0.32, 0.3);
    this.hips.add(this.legLight);
  }

  private buildLegFx(pivot: THREE.Group, seed: number, nO2: number, nLac: number): LegFx {
    const r = rng(seed);
    const o2Base = new Float32Array(nO2 * 3);
    for (let i = 0; i < nO2; i++) {
      const a = r() * Math.PI * 2;
      const rad = 0.032 * Math.sqrt(r());
      o2Base[i * 3] = 0.012 + Math.cos(a) * rad;
      o2Base[i * 3 + 1] = Math.sin(a) * rad;
      o2Base[i * 3 + 2] = r();
    }
    const o2Geo = new THREE.BufferGeometry();
    const o2Attr = new THREE.BufferAttribute(new Float32Array(nO2 * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const o2ColAttr = new THREE.BufferAttribute(new Float32Array(nO2 * 3), 3).setUsage(THREE.DynamicDrawUsage);
    o2Geo.setAttribute('position', o2Attr);
    o2Geo.setAttribute('color', o2ColAttr);
    const o2 = new THREE.Points(o2Geo, this.o2Mat);
    o2.frustumCulled = false;
    o2.renderOrder = 5;
    pivot.add(o2);

    const lacBase = new Float32Array(nLac * 3);
    const lacSeed = new Float32Array(nLac);
    for (let i = 0; i < nLac; i++) {
      let x = 0;
      let y = 0;
      let z = 0;
      for (let k = 0; k < 12; k++) {
        x = r() * 2 - 1;
        y = r() * 2 - 1;
        z = r() * 2 - 1;
        if (x * x + y * y + z * z <= 1) break;
      }
      lacBase[i * 3] = 0.008 + x * 0.05;
      lacBase[i * 3 + 1] = -0.21 + y * 0.17;
      lacBase[i * 3 + 2] = z * 0.046;
      lacSeed[i] = r();
    }
    const lacGeo = new THREE.BufferGeometry();
    const lacAttr = new THREE.BufferAttribute(lacBase.slice(), 3).setUsage(THREE.DynamicDrawUsage);
    lacGeo.setAttribute('position', lacAttr);
    lacGeo.setDrawRange(0, 0);
    const lac = new THREE.Points(lacGeo, this.lacMat);
    lac.frustumCulled = false;
    lac.renderOrder = 5;
    pivot.add(lac);

    return { o2Attr, o2ColAttr, o2Base, lacGeo, lacAttr, lacBase, lacSeed, lacCount: nLac };
  }

  private buildEcg(): void {
    const N = ECG_N;
    // faint grid behind the trace
    const z = ECG_Z - 0.012;
    const lo = ECG_Y - 0.09;
    const hi = ECG_Y + 0.25;
    const pts: number[] = [ECG_X0, ECG_Y, z, ECG_X1, ECG_Y, z, ECG_X0, lo, z, ECG_X1, lo, z, ECG_X0, hi, z, ECG_X1, hi, z];
    for (let i = 0; i <= 10; i++) {
      const x = lerp(ECG_X0, ECG_X1, i / 10);
      pts.push(x, lo, z, x, hi, z);
    }
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.gridMat = lineMaterial(0x3aa8c8, 0.16);
    this.root.add(new THREE.LineSegments(gridGeo, this.gridMat));

    const ribbonMat = (opacity: number): THREE.MeshBasicMaterial =>
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });

    // core ribbon (2 verts / sample)
    const coreGeo = new THREE.BufferGeometry();
    this.ecgCoreAttr = new THREE.BufferAttribute(new Float32Array(N * 6), 3).setUsage(THREE.DynamicDrawUsage);
    this.ecgCoreColAttr = new THREE.BufferAttribute(new Float32Array(N * 6), 3).setUsage(THREE.DynamicDrawUsage);
    coreGeo.setAttribute('position', this.ecgCoreAttr);
    coreGeo.setAttribute('color', this.ecgCoreColAttr);
    const coreIdx: number[] = [];
    for (let i = 0; i < N - 1; i++) {
      const a = i * 2;
      coreIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    coreGeo.setIndex(coreIdx);
    const core = new THREE.Mesh(coreGeo, ribbonMat(1));
    core.frustumCulled = false;
    core.renderOrder = 7;
    this.root.add(core);

    // soft glow ribbon (3 verts / sample, dark edges)
    const glowGeo = new THREE.BufferGeometry();
    this.ecgGlowAttr = new THREE.BufferAttribute(new Float32Array(N * 9), 3).setUsage(THREE.DynamicDrawUsage);
    this.ecgGlowColAttr = new THREE.BufferAttribute(new Float32Array(N * 9), 3).setUsage(THREE.DynamicDrawUsage);
    glowGeo.setAttribute('position', this.ecgGlowAttr);
    glowGeo.setAttribute('color', this.ecgGlowColAttr);
    const glowIdx: number[] = [];
    for (let i = 0; i < N - 1; i++) {
      for (let s = 0; s < 2; s++) {
        const a = i * 3 + s;
        const c = (i + 1) * 3 + s;
        glowIdx.push(a, c, a + 1, a + 1, c, c + 1);
      }
    }
    glowGeo.setIndex(glowIdx);
    const glow = new THREE.Mesh(glowGeo, ribbonMat(0.45));
    glow.frustumCulled = false;
    glow.renderOrder = 6;
    this.root.add(glow);

    this.ecgDotMat = new THREE.SpriteMaterial({
      map: glowTexture(),
      color: C_O2,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.ecgDot = new THREE.Sprite(this.ecgDotMat);
    this.ecgDot.scale.setScalar(0.11);
    this.ecgDot.renderOrder = 8;
    this.root.add(this.ecgDot);
  }

  private buildStreaks(low: boolean): void {
    const n = low ? 18 : 34;
    const r = rng(4242);
    this.streakData = new Float32Array(n * 5);
    for (let i = 0; i < n; i++) {
      const k = i * 5;
      this.streakData[k] = lerp(-2.8, 2.8, r());
      this.streakData[k + 1] = lerp(0.1, 2.3, r());
      this.streakData[k + 2] = lerp(-2.4, -1.05, r());
      this.streakData[k + 3] = lerp(0.6, 1.4, r());
      this.streakData[k + 4] = lerp(0.5, 1.5, r());
    }
    const geo = new THREE.BufferGeometry();
    this.streakAttr = new THREE.BufferAttribute(new Float32Array(n * 6), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.streakAttr);
    this.streakMat = lineMaterial(C_O2, 0);
    const lines = new THREE.LineSegments(geo, this.streakMat);
    lines.frustumCulled = false;
    this.root.add(lines);
  }

  private buildPuffs(low: boolean): void {
    const n = low ? 40 : 80;
    const geo = new THREE.BufferGeometry();
    this.puffPosAttr = new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.puffColAttr = new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.puffPosAttr);
    geo.setAttribute('color', this.puffColAttr);
    this.puffVel = new Float32Array(n * 3);
    this.puffLife = new Float32Array(n);
    const pts = new THREE.Points(geo, this.puffMat);
    pts.frustumCulled = false;
    pts.renderOrder = 6;
    this.root.add(pts);
  }

  /* ------------------------------------------------------------------ per frame */

  protected tick(dt: number, time: number, input: ControlInput): void {
    if (!this.built) return;
    const d = Math.min(Math.max(dt, 0), 0.05);

    // 1. effort goal per phase
    let goal: number;
    if (this.phase === 'handsOn') {
      goal = clamp01(input.slider);
    } else if (this.phase === 'tour') {
      const idx = Math.min(Math.max(this.tourBeat, 0), TOUR_EFFORT.length - 1);
      goal = (TOUR_EFFORT[idx] ?? 0.3) + Math.sin(time * 0.5) * 0.025;
    } else {
      goal = 0.5 + Math.sin(time * 0.3) * 0.05;
    }
    this.effort = damp(this.effort, clamp01(goal), 2.4, d);
    const eff = this.effort;

    // 2. physiology: aerobic supply caps at THRESHOLD; beyond it, lactic acid accumulates
    const deficit = clamp01((eff - THRESHOLD) / (1 - THRESHOLD));
    if (deficit > 0) this.lactate += deficit * 0.4 * d;
    else this.lactate -= (0.045 + 0.09 * (1 - eff)) * d;
    this.lactate = clamp01(this.lactate);
    this.deficit = deficit;
    const lac = this.lactate;

    const hrGoal = Math.min(HR_MAX, HR_MIN + (HR_MAX - HR_MIN) * eff + 6 * lac);
    this.hr = damp(this.hr, hrGoal, 1.15, d);
    const hr = this.hr;
    const breathsPerMin = Math.min(58, 12 + 30 * eff + 16 * lac);
    this.breathPhase += (d * breathsPerMin) / 60;

    const run = smoothstep(0.03, 0.4, eff);
    this.stridePhase += d * Math.PI * 2 * lerp(0.45, 1.55, eff);
    const strain = clamp01(deficit * 0.45 + lac * 0.75);
    this.strain = strain;
    const trackSpeed = run * lerp(0.5, 5.2, eff);

    if (this.phase === 'handsOn') {
      const spec = this.def.readout;
      const need = (spec.target - HR_MIN) / (HR_MAX - HR_MIN) - 0.03;
      if (Math.round(hr) >= spec.target && input.slider >= need) this.reached = true;
    }

    // 3. ECG sampling (fixed rate) — also the master heartbeat clock
    this.ecgAcc += d;
    const step = 1 / ECG_RATE;
    let guard = 0;
    while (this.ecgAcc >= step && guard < ECG_N) {
      this.ecgAcc -= step;
      guard++;
      this.beat += (step * hr) / 60;
      const p = 60 / hr;
      const tb = frac(this.beat) * p;
      let v = ecgWave(tb, p) + ecgWave(tb + p, p);
      v += (Math.random() - 0.5) * 0.06 * strain;
      this.ecgSamples[this.ecgWrite] = v;
      this.ecgWrite = (this.ecgWrite + 1) % ECG_N;
    }
    if (guard >= ECG_N) this.ecgAcc = 0;
    const period = 60 / hr;
    const beatNow = this.beat + (this.ecgAcc * hr) / 60;
    const tbNow = frac(beatNow) * period;
    const pulse = Math.min(1, beatPulse(tbNow) + beatPulse(tbNow + period));

    // 4. zone colour: aerobic cyan → anaerobic amber → crimson burn
    _zone.set(C_O2).lerp(_c2.set(C_LACTIC), smoothstep(0.5, 0.78, eff));
    _zone.lerp(_c2.set(C_HEART), smoothstep(0.45, 1, lac) * 0.75);
    const flicker = 0.5 + 0.5 * Math.sin(time * 22 + Math.sin(time * 7) * 3);

    // 5. runner pose + organs
    const bp = this.breathPhase * Math.PI * 2;
    const inflate = 0.5 - 0.5 * Math.cos(bp);
    this.poseRunner(time, run, strain, inflate, Math.max(eff, lac));
    this.updateOrgans(pulse, inflate, eff, lac, flicker, strain);

    // 6. effects
    this.updateLegFx(d, time, hr, lac, strain);
    this.updateTrack(d, trackSpeed, eff, pulse, beatNow, hr);
    this.updateStreaks(d, trackSpeed, eff);
    this.updatePuffs(d, bp, trackSpeed, eff, lac);
    this.updateEcg(pulse);
  }

  private kneeFlex(phi: number, run: number): number {
    const k = Math.pow(0.5 + 0.5 * Math.cos(phi + 0.9), 1.5);
    return 0.06 + run * (0.25 + 1.15 * k);
  }

  private poseRunner(time: number, run: number, strain: number, inflate: number, puff: number): void {
    const phi = this.stridePhase;
    const s = Math.sin(phi);
    const ragged = strain * 0.08 * Math.sin(time * 5.3);
    const hipSw = lerp(0.05, 0.72, run) * (1 - strain * 0.12);
    const armSw = lerp(0.04, 0.62, run) + ragged;

    this.legN.pivot.rotation.z = hipSw * s;
    this.legF.pivot.rotation.z = -hipSw * s;
    this.legN.lower.rotation.z = -this.kneeFlex(phi, run);
    this.legF.lower.rotation.z = -this.kneeFlex(phi + Math.PI, run);

    this.armN.pivot.rotation.z = -armSw * s;
    this.armF.pivot.rotation.z = armSw * s;
    const elbow = lerp(0.18, 1.35, run);
    this.armN.lower.rotation.z = elbow + 0.15 * run * s;
    this.armF.lower.rotation.z = elbow - 0.15 * run * s;
    this.armN.pivot.rotation.x = -0.06 - 0.04 * run;
    this.armF.pivot.rotation.x = 0.06 + 0.04 * run;

    const bob = run * (0.04 * Math.abs(s) - 0.05);
    this.hips.position.y = HIP_Y + bob;
    this.hips.rotation.y = 0.1 * run * s;
    this.torso.rotation.y = -0.17 * run * s;
    this.torso.rotation.z = -lerp(0.03, 0.2, run) - 0.05 * strain * (0.5 + 0.5 * Math.sin(time * 9));
    this.torso.position.y = 0.008 * inflate * puff;
    this.head.rotation.z = 0.12 * run + strain * 0.05 * Math.sin(time * 11);
  }

  private updateOrgans(pulse: number, inflate: number, eff: number, lac: number, flicker: number, strain: number): void {
    // heart beats at the live heart rate
    this.heart.scale.setScalar(1 + 0.22 * pulse);
    this.heartMat.emissiveIntensity = 1.0 + 2.4 * pulse;
    this.heartGlow.scale.setScalar(0.24 + 0.22 * pulse + 0.06 * eff);
    this.heartGlowMat.opacity = 0.45 + 0.5 * pulse;
    this.heartLight.intensity = 0.2 + 1.4 * pulse;
    this.arteryMat.emissiveIntensity = 0.6 + 1.8 * pulse;

    // lungs: deeper and faster with effort and oxygen debt
    const depth = 0.06 + 0.28 * Math.max(eff, lac);
    for (const lung of this.lungs) {
      const k = 1 + depth * inflate;
      lung.scale.set(0.055 * k, 0.11 * (1 + depth * 0.6 * inflate), 0.05 * k);
    }

    // muscles: oxygen-rich cyan → lactic amber → burning crimson
    _c1.set(C_O2).lerp(_c2.set(C_LACTIC), smoothstep(0.05, 0.55, lac + this.deficit * 0.3));
    _c1.lerp(_c2.set(C_HEART), smoothstep(0.55, 1, lac));
    this.muscleMat.emissive.copy(_c1);
    this.muscleMat.color.copy(_c1).multiplyScalar(0.12);
    this.muscleMat.emissiveIntensity = 0.55 + 0.9 * eff + 1.0 * lac * flicker;

    this.lacMat.color.set(C_LACTIC).lerp(_c2.set(C_HEART), smoothstep(0.5, 1, lac));
    this.lacMat.size = 0.04 + 0.02 * lac;
    this.legLight.color.copy(this.lacMat.color);
    this.legLight.intensity = 2.2 * lac * (0.7 + 0.3 * flicker);

    // glass rim warms up under strain
    setFresnel(this.rimMat, 0.8 + 0.5 * strain);
    const u = this.rimMat.uniforms['uColor'];
    if (u) (u.value as THREE.Color).set(0x8fdcff).lerp(_c2.set(C_LACTIC), strain * 0.45);
  }

  private updateLegFx(d: number, time: number, hr: number, lac: number, strain: number): void {
    const flow = lerp(0.35, 1.9, clamp01((hr - HR_MIN) / (HR_MAX - HR_MIN)));
    const bright = 1 - this.deficit * 0.35;
    _c1.set(C_O2);
    for (const fx of this.legFx) {
      const pos = fx.o2Attr.array as Float32Array;
      const col = fx.o2ColAttr.array as Float32Array;
      const base = fx.o2Base;
      const n = base.length / 3;
      for (let i = 0; i < n; i++) {
        const j = i * 3;
        let t = (base[j + 2] ?? 0) + d * flow;
        t -= Math.floor(t);
        base[j + 2] = t;
        pos[j] = base[j] ?? 0;
        pos[j + 1] = -0.035 - t * (THIGH - 0.07);
        pos[j + 2] = base[j + 1] ?? 0;
        const f = Math.sin(t * Math.PI) * bright;
        col[j] = _c1.r * f;
        col[j + 1] = _c1.g * f;
        col[j + 2] = _c1.b * f;
      }
      fx.o2Attr.needsUpdate = true;
      fx.o2ColAttr.needsUpdate = true;

      const visible = Math.round(lac * fx.lacCount);
      fx.lacGeo.setDrawRange(0, visible);
      if (visible > 0) {
        const lp = fx.lacAttr.array as Float32Array;
        const lb = fx.lacBase;
        const ls = fx.lacSeed;
        const amp = 0.003 + 0.011 * strain;
        for (let i = 0; i < visible; i++) {
          const j = i * 3;
          const sd = ls[i] ?? 0;
          lp[j] = (lb[j] ?? 0) + Math.sin(time * (3 + sd * 4) + sd * 20) * amp;
          lp[j + 1] = (lb[j + 1] ?? 0) + Math.sin(time * (2.3 + sd * 3) + sd * 11) * amp;
          lp[j + 2] = (lb[j + 2] ?? 0) + Math.cos(time * (2.9 + sd * 5) + sd * 7) * amp;
        }
        fx.lacAttr.needsUpdate = true;
      }
    }
  }

  private updateTrack(d: number, speed: number, eff: number, pulse: number, beatNow: number, hr: number): void {
    this.trackScroll += d * speed;
    const span = 5.0;
    const spacing = span / this.dashPerRow;
    let k = 0;
    for (const z of [-0.34, 0.34]) {
      for (let i = 0; i < this.dashPerRow; i++) {
        let x = (i * spacing - this.trackScroll) % span;
        if (x < 0) x += span;
        _m.makeTranslation(x - span / 2, 0.003, z);
        this.dashes.setMatrixAt(k++, _m);
      }
    }
    this.dashes.instanceMatrix.needsUpdate = true;
    this.dashMat.emissive.copy(_zone);
    this.dashMat.emissiveIntensity = 0.6 + 1.2 * eff;

    this.contactMat.color.copy(_zone);
    this.contactMat.opacity = 0.22 + 0.25 * eff + 0.12 * pulse;

    // floor ripple launched on each R-wave
    const rp = frac(beatNow - (0.175 * hr) / 60);
    this.ripple.scale.setScalar(0.3 + 0.95 * rp);
    this.rippleMat.color.copy(_zone).lerp(_c2.set(C_HEART), 0.4);
    this.rippleMat.opacity = Math.pow(1 - rp, 2) * 0.55;
  }

  private updateStreaks(d: number, speed: number, eff: number): void {
    const data = this.streakData;
    const pos = this.streakAttr.array as Float32Array;
    const n = data.length / 5;
    const baseLen = 0.04 + 0.5 * eff;
    for (let i = 0; i < n; i++) {
      const k = i * 5;
      let x = (data[k] ?? 0) - d * speed * 1.4 * (data[k + 3] ?? 1);
      if (x < -2.8) x += 5.6;
      data[k] = x;
      const y = data[k + 1] ?? 0;
      const z = data[k + 2] ?? 0;
      const len = baseLen * (data[k + 4] ?? 1);
      const j = i * 6;
      pos[j] = x;
      pos[j + 1] = y;
      pos[j + 2] = z;
      pos[j + 3] = x + len;
      pos[j + 4] = y;
      pos[j + 5] = z;
    }
    this.streakAttr.needsUpdate = true;
    this.streakMat.color.copy(_zone);
    this.streakMat.opacity = 0.55 * smoothstep(0.3, 1, eff);
  }

  private updatePuffs(d: number, bp: number, speed: number, eff: number, lac: number): void {
    const n = this.puffLife.length;
    const pos = this.puffPosAttr.array as Float32Array;
    const col = this.puffColAttr.array as Float32Array;
    const vel = this.puffVel;
    const life = this.puffLife;

    const exhale = Math.max(0, -Math.sin(bp));
    this.puffAcc += d * exhale * lerp(8, 90, Math.max(eff, lac));
    if (this.puffAcc >= 1) {
      this.mouth.getWorldPosition(_v);
      this.root.worldToLocal(_v);
    }
    let spawned = 0;
    while (this.puffAcc >= 1 && spawned < 12) {
      this.puffAcc -= 1;
      spawned++;
      const i = this.puffCursor;
      this.puffCursor = (this.puffCursor + 1) % n;
      const j = i * 3;
      pos[j] = _v.x + (Math.random() - 0.5) * 0.02;
      pos[j + 1] = _v.y + (Math.random() - 0.5) * 0.02;
      pos[j + 2] = _v.z + (Math.random() - 0.5) * 0.02;
      vel[j] = 0.18 - speed * 0.32 + (Math.random() - 0.5) * 0.06;
      vel[j + 1] = 0.04 + Math.random() * 0.07;
      vel[j + 2] = (Math.random() - 0.5) * 0.14;
      life[i] = 1;
    }
    if (this.puffAcc > 1) this.puffAcc = 1;

    _c1.set(C_BREATH);
    const fade = 1 - Math.exp(-0.7 * d);
    for (let i = 0; i < n; i++) {
      const j = i * 3;
      let l = life[i] ?? 0;
      if (l > 0) {
        l = Math.max(0, l - d / 1.3);
        life[i] = l;
        const vx = (vel[j] ?? 0) * (1 - fade);
        const vy = (vel[j + 1] ?? 0) * (1 - fade);
        const vz = (vel[j + 2] ?? 0) * (1 - fade);
        vel[j] = vx;
        vel[j + 1] = vy;
        vel[j + 2] = vz;
        pos[j] = (pos[j] ?? 0) + vx * d;
        pos[j + 1] = (pos[j + 1] ?? 0) + vy * d;
        pos[j + 2] = (pos[j + 2] ?? 0) + vz * d;
      }
      const b = Math.pow(l, 1.5) * 0.85;
      col[j] = _c1.r * b;
      col[j + 1] = _c1.g * b;
      col[j + 2] = _c1.b * b;
    }
    this.puffPosAttr.needsUpdate = true;
    this.puffColAttr.needsUpdate = true;
  }

  private updateEcg(pulse: number): void {
    const N = ECG_N;
    const xs = this.ecgX;
    const ys = this.ecgY;
    for (let i = 0; i < N; i++) {
      const idx = (this.ecgWrite + i) % N;
      xs[i] = ECG_X0 + (ECG_X1 - ECG_X0) * (i / (N - 1));
      ys[i] = ECG_Y + ECG_AMP * (this.ecgSamples[idx] ?? 0);
    }
    const core = this.ecgCoreAttr.array as Float32Array;
    const coreCol = this.ecgCoreColAttr.array as Float32Array;
    const glow = this.ecgGlowAttr.array as Float32Array;
    const glowCol = this.ecgGlowColAttr.array as Float32Array;
    const zg = ECG_Z - 0.003;
    const boost = 0.85 + 0.35 * pulse;
    for (let i = 0; i < N; i++) {
      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(N - 1, i + 1);
      let tx = (xs[i1] ?? 0) - (xs[i0] ?? 0);
      let ty = (ys[i1] ?? 0) - (ys[i0] ?? 0);
      const len = Math.hypot(tx, ty) || 1;
      tx /= len;
      ty /= len;
      const nx = -ty;
      const ny = tx;
      const x = xs[i] ?? 0;
      const y = ys[i] ?? 0;

      const k = i * 6;
      core[k] = x - nx * CORE_W;
      core[k + 1] = y - ny * CORE_W;
      core[k + 2] = ECG_Z;
      core[k + 3] = x + nx * CORE_W;
      core[k + 4] = y + ny * CORE_W;
      core[k + 5] = ECG_Z;

      const g = i * 9;
      glow[g] = x - nx * GLOW_W;
      glow[g + 1] = y - ny * GLOW_W;
      glow[g + 2] = zg;
      glow[g + 3] = x;
      glow[g + 4] = y;
      glow[g + 5] = zg;
      glow[g + 6] = x + nx * GLOW_W;
      glow[g + 7] = y + ny * GLOW_W;
      glow[g + 8] = zg;

      const f = (0.06 + 0.94 * Math.pow(i / (N - 1), 1.6)) * boost;
      const r = _zone.r * f;
      const gg = _zone.g * f;
      const b = _zone.b * f;
      coreCol[k] = r;
      coreCol[k + 1] = gg;
      coreCol[k + 2] = b;
      coreCol[k + 3] = r;
      coreCol[k + 4] = gg;
      coreCol[k + 5] = b;
      glowCol[g] = 0;
      glowCol[g + 1] = 0;
      glowCol[g + 2] = 0;
      glowCol[g + 3] = r;
      glowCol[g + 4] = gg;
      glowCol[g + 5] = b;
      glowCol[g + 6] = 0;
      glowCol[g + 7] = 0;
      glowCol[g + 8] = 0;
    }
    this.ecgCoreAttr.needsUpdate = true;
    this.ecgCoreColAttr.needsUpdate = true;
    this.ecgGlowAttr.needsUpdate = true;
    this.ecgGlowColAttr.needsUpdate = true;

    this.ecgDot.position.set(xs[N - 1] ?? ECG_X1, ys[N - 1] ?? ECG_Y, ECG_Z + 0.002);
    this.ecgDotMat.color.copy(_zone);
    this.ecgDot.scale.setScalar(0.09 + 0.06 * pulse);
    this.gridMat.color.set(0x3aa8c8).lerp(_c2.set(C_LACTIC), this.deficit * 0.6);
  }

  /* ------------------------------------------------------------------ readout */

  getReadout(): Readout {
    const hr = this.hr;
    const anaerobic = this.deficit > 0.02 || hr >= 150;
    const debt = !anaerobic && this.lactate > 0.12;
    const note = debt
      ? 'OXYGEN DEBT · PANTING'
      : anaerobic
        ? 'ANAEROBIC · LACTIC ACID'
        : hr < 92
          ? 'RESTING · AEROBIC'
          : 'AEROBIC · O₂ KEEPING UP';
    if (!this.ctx) {
      return {
        label: 'Heart rate',
        value: hr,
        unit: 'bpm',
        progress: clamp01((hr - HR_MIN) / (HR_MAX - HR_MIN)),
        status: 'idle',
        note,
      };
    }
    let status: ReadoutStatus;
    if (this.phase === 'handsOn' && this.reached) status = 'done';
    else if (anaerobic || debt) status = 'warn';
    else status = this.phase === 'handsOn' && this.effort > 0.04 ? 'active' : 'idle';
    return this.makeReadout(hr, { status, note });
  }
}