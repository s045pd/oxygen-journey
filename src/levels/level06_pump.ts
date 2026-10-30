import * as THREE from 'three';
import { LevelScene } from './base';

export class Level06Pump extends LevelScene {
  private chambers: THREE.Mesh[] = [];
  private chamberScales: number[] = [1, 1, 1, 1];
  private chamberTargets: number[] = [1, 1, 1, 1];
  private lastTapTime = 0;
  private tapIntervals: number[] = [];
  private bpm = 0;
  private fillFraction = 1;
  private beatPhase = 0;
  private arteries: THREE.Mesh[] = [];

  constructor() {
    super();
  }

  enter(root: THREE.Scene): void {
    this.levelGroup = new THREE.Group();

    // Chamber positions (simplified 4-chamber layout)
    // Top: LA, RA | Bottom: LV, RV
    const positions = [
      new THREE.Vector3(-0.8, 0.8, 0),  // Left Atrium
      new THREE.Vector3(0.8, 0.8, 0),   // Right Atrium
      new THREE.Vector3(-0.8, -0.8, 0), // Left Ventricle
      new THREE.Vector3(0.8, -0.8, 0),  // Right Ventricle
    ];
    const colors = [0xff3366, 0x3366ff, 0xff0044, 0x0044ff];
    const labels = ['LA', 'RA', 'LV', 'RV'];

    this.chambers = [];
    positions.forEach((pos, i) => {
      // Chamber body
      const geo = i < 2
        ? new THREE.SphereGeometry(0.5, 16, 16)
        : new THREE.SphereGeometry(0.6, 16, 16);
      const mat = new THREE.MeshBasicMaterial({
        color: colors[i],
        transparent: true,
        opacity: 0.7,
      });
      const chamber = new THREE.Mesh(geo, mat);
      chamber.position.copy(pos);
      this.chambers.push(chamber);
      this.levelGroup.add(chamber);

      // Chamber glow ring
      const ringGeo = new THREE.RingGeometry(0.55, 0.6, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: colors[i],
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.copy(pos);
      ring.position.z = 0.1;
      this.levelGroup.add(ring);
    });

    // Connecting vessels
    const vesselMat = new THREE.MeshBasicMaterial({
      color: 0xaa00ff,
      transparent: true,
      opacity: 0.5,
    });

    // Atria to ventricles (valves)
    const valve1Geo = new THREE.CylinderGeometry(0.15, 0.15, 0.8, 8);
    const valve1 = new THREE.Mesh(valve1Geo, vesselMat);
    valve1.position.set(-0.8, 0, 0);
    this.levelGroup.add(valve1);

    const valve2 = new THREE.Mesh(valve1Geo.clone(), vesselMat);
    valve2.position.set(0.8, 0, 0);
    this.levelGroup.add(valve2);

    // Great vessels (aorta, pulmonary)
    const aortaGeo = new THREE.TorusGeometry(0.4, 0.1, 8, 16, Math.PI);
    const aorta = new THREE.Mesh(aortaGeo, new THREE.MeshBasicMaterial({ color: 0xff0066 }));
    aorta.position.set(-0.8, -1.6, 0);
    aorta.rotation.x = Math.PI / 2;
    this.arteries.push(aorta);
    this.levelGroup.add(aorta);

    const pulmonary = new THREE.Mesh(aortaGeo.clone(), new THREE.MeshBasicMaterial({ color: 0x0066ff }));
    pulmonary.position.set(0.8, -1.6, 0);
    pulmonary.rotation.x = Math.PI / 2;
    this.arteries.push(pulmonary);
    this.levelGroup.add(pulmonary);

    // Heart outline
    const outlinePoints = [];
    for (let i = 0; i <= 32; i++) {
      const t = (i / 32) * Math.PI * 2;
      const r = 2 + Math.sin(t * 2) * 0.3;
      outlinePoints.push(new THREE.Vector3(Math.cos(t) * r * 0.8, Math.sin(t) * r * 0.6, 0));
    }
    const outlineGeo = new THREE.BufferGeometry().setFromPoints(outlinePoints);
    const outlineMat = new THREE.LineBasicMaterial({ color: 0xff00ff, transparent: true, opacity: 0.4 });
    const outline = new THREE.Line(outlineGeo, outlineMat);
    this.levelGroup.add(outline);

    root.add(this.levelGroup);
  }

  exit(): void {
    this.levelGroup.parent?.remove(this.levelGroup);
    this.dispose();
  }

  onTap(): void {
    const now = performance.now();
    if (this.lastTapTime > 0) {
      const interval = now - this.lastTapTime;
      this.tapIntervals.push(interval);
      if (this.tapIntervals.length > 5) {
        this.tapIntervals.shift();
      }
      // Calculate BPM from average interval
      const avgInterval = this.tapIntervals.reduce((a, b) => a + b, 0) / this.tapIntervals.length;
      this.bpm = Math.round(60000 / avgInterval);
    }
    this.lastTapTime = now;

    // Trigger beat animation
    this.beatPhase = 1;

    // High BPM reduces fill fraction
    if (this.bpm > 140) {
      this.fillFraction = Math.max(0.4, this.fillFraction - 0.05);
    } else if (this.bpm > 0 && this.bpm <= 100) {
      this.fillFraction = Math.min(1, this.fillFraction + 0.02);
    }

    // Set chamber targets for beat
    this.chamberTargets = [0.7, 0.7, 1.3, 1.3]; // Atria contract, ventricles expand
  }

  update(dt: number): void {
    // Beat animation
    if (this.beatPhase > 0) {
      this.beatPhase -= dt * 3;
      if (this.beatPhase < 0.5 && this.chamberTargets[0] < 1) {
        // Second phase: ventricles contract
        this.chamberTargets = [1.2, 1.2, 0.7, 0.7];
      }
    } else {
      this.chamberTargets = [1, 1, 1, 1];
    }

    // Animate chamber scales
    this.chambers.forEach((chamber, i) => {
      const target = this.chamberTargets[i] * this.fillFraction;
      this.chamberScales[i] += (target - this.chamberScales[i]) * dt * 8;
      chamber.scale.setScalar(this.chamberScales[i]);

      // Color intensity based on fill
      const mat = chamber.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.5 + this.fillFraction * 0.4;
    });

    // Pulse arteries during beat
    const arteryScale = 1 + this.beatPhase * 0.3;
    this.arteries.forEach((artery) => {
      artery.scale.setScalar(arteryScale);
    });

    // Idle animation
    const time = performance.now() * 0.001;
    this.levelGroup.rotation.y = Math.sin(time * 0.5) * 0.05;
  }

  getReadout(): string {
    const bpmColor = this.bpm > 140 ? '#ff4444' : this.bpm > 100 ? '#ffaa00' : '#00ff88';
    const fillColor = this.fillFraction < 0.7 ? '#ff4444' : '#00ff88';
    return `<strong>BPM:</strong> <span style="color:${bpmColor}">${this.bpm || '—'}</span> | <strong>Fill:</strong> <span style="color:${fillColor}">${Math.round(this.fillFraction * 100)}%</span>`;
  }
}