import * as THREE from 'three';
import { LevelScene } from './base';

export class Level08Burn extends LevelScene {
  private cell!: THREE.Mesh;
  private mitochondria: THREE.Mesh[] = [];
  private o2Level = 0;
  private glucoseLevel = 0.5;
  private atpLevel = 0;
  private isHolding = false;
  private o2Particles: THREE.Mesh[] = [];
  private atpParticles: THREE.Mesh[] = [];
  private glowIntensity = 0;

  constructor() {
    super();
  }

  enter(root: THREE.Scene): void {
    this.levelGroup = new THREE.Group();

    // Cell membrane
    const cellGeo = new THREE.SphereGeometry(2, 32, 32);
    const cellMat = new THREE.MeshBasicMaterial({
      color: 0x331155,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });
    this.cell = new THREE.Mesh(cellGeo, cellMat);
    this.levelGroup.add(this.cell);

    // Nucleus
    const nucleusGeo = new THREE.SphereGeometry(0.5, 16, 16);
    const nucleusMat = new THREE.MeshBasicMaterial({
      color: 0x6600aa,
      transparent: true,
      opacity: 0.6,
    });
    const nucleus = new THREE.Mesh(nucleusGeo, nucleusMat);
    nucleus.position.set(0, 0, 0);
    this.levelGroup.add(nucleus);

    // Mitochondria (elongated ellipsoids, amber)
    this.mitochondria = [];
    const mitoPositions = [
      new THREE.Vector3(0.8, 0.5, 0.3),
      new THREE.Vector3(-0.7, 0.6, -0.2),
      new THREE.Vector3(0.5, -0.6, 0.4),
      new THREE.Vector3(-0.6, -0.4, -0.3),
      new THREE.Vector3(0.2, 0.8, -0.5),
    ];

    mitoPositions.forEach((pos) => {
      const mitoGeo = new THREE.SphereGeometry(0.25, 12, 8);
      mitoGeo.scale(1.8, 0.8, 0.8);
      const mitoMat = new THREE.MeshBasicMaterial({
        color: 0xffaa00,
        transparent: true,
        opacity: 0.7,
      });
      const mito = new THREE.Mesh(mitoGeo, mitoMat);
      mito.position.copy(pos);
      mito.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );
      this.mitochondria.push(mito);
      this.levelGroup.add(mito);

      // Inner membrane folds (cristae hint)
      const cristaeGeo = new THREE.TorusGeometry(0.12, 0.02, 4, 8);
      const cristaeMat = new THREE.MeshBasicMaterial({
        color: 0xffcc44,
        transparent: true,
        opacity: 0.5,
      });
      const cristae = new THREE.Mesh(cristaeGeo, cristaeMat);
      mito.add(cristae);
    });

    // O2 particles pool
    for (let i = 0; i < 20; i++) {
      const o2Geo = new THREE.SphereGeometry(0.06, 8, 8);
      const o2Mat = new THREE.MeshBasicMaterial({
        color: 0x00aaff,
        transparent: true,
        opacity: 0,
      });
      const o2 = new THREE.Mesh(o2Geo, o2Mat);
      o2.userData.active = false;
      o2.userData.velocity = new THREE.Vector3();
      this.o2Particles.push(o2);
      this.levelGroup.add(o2);
    }

    // ATP particles pool
    for (let i = 0; i < 30; i++) {
      const atpGeo = new THREE.OctahedronGeometry(0.08);
      const atpMat = new THREE.MeshBasicMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0,
      });
      const atp = new THREE.Mesh(atpGeo, atpMat);
      atp.userData.active = false;
      atp.userData.life = 0;
      this.atpParticles.push(atp);
      this.levelGroup.add(atp);
    }

    // Glucose indicator ring
    const glucoseRingGeo = new THREE.RingGeometry(1.9, 2.0, 32);
    const glucoseRingMat = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });
    const glucoseRing = new THREE.Mesh(glucoseRingGeo, glucoseRingMat);
    this.levelGroup.add(glucoseRing);

    root.add(this.levelGroup);
  }

  exit(): void {
    this.levelGroup.parent?.remove(this.levelGroup);
    this.dispose();
  }

  onHoldStart(): void {
    this.isHolding = true;
  }

  onHoldEnd(): void {
    this.isHolding = false;
  }

  onSlider(v: number): void {
    this.glucoseLevel = v;
  }

  private spawnO2(): void {
    const inactive = this.o2Particles.find((p) => !p.userData.active);
    if (inactive) {
      inactive.userData.active = true;
      const angle = Math.random() * Math.PI * 2;
      inactive.position.set(
        Math.cos(angle) * 2.5,
        (Math.random() - 0.5) * 2,
        Math.sin(angle) * 2.5
      );
      inactive.userData.velocity = new THREE.Vector3(
        -Math.cos(angle) * 0.8,
        (Math.random() - 0.5) * 0.3,
        -Math.sin(angle) * 0.8
      );
      (inactive.material as THREE.MeshBasicMaterial).opacity = 0.8;
    }
  }

  private spawnATP(pos: THREE.Vector3): void {
    const inactive = this.atpParticles.find((p) => !p.userData.active);
    if (inactive) {
      inactive.userData.active = true;
      inactive.userData.life = 1;
      inactive.position.copy(pos);
      inactive.scale.setScalar(0.5);
      (inactive.material as THREE.MeshBasicMaterial).opacity = 1;
    }
  }

  update(dt: number): void {
    const time = performance.now() * 0.001;

    // Supply O2 when holding
    if (this.isHolding) {
      this.o2Level = Math.min(1, this.o2Level + dt * 0.5);
      if (Math.random() < dt * 10) {
        this.spawnO2();
      }
    } else {
      this.o2Level = Math.max(0, this.o2Level - dt * 0.3);
    }

    // ATP production when both O2 and glucose present
    if (this.o2Level > 0.2 && this.glucoseLevel > 0.2) {
      const production = Math.min(this.o2Level, this.glucoseLevel) * dt * 0.3;
      this.atpLevel = Math.min(1, this.atpLevel + production);
      this.glowIntensity = Math.min(1, this.glowIntensity + dt * 2);

      // Spawn ATP particles
      if (Math.random() < production * 5) {
        const mito = this.mitochondria[Math.floor(Math.random() * this.mitochondria.length)];
        this.spawnATP(mito.position.clone());
      }
    } else {
      this.atpLevel = Math.max(0, this.atpLevel - dt * 0.1);
      this.glowIntensity = Math.max(0, this.glowIntensity - dt);
    }

    // Update O2 particles
    this.o2Particles.forEach((p) => {
      if (p.userData.active) {
        p.position.add(p.userData.velocity.clone().multiplyScalar(dt));
        const mat = p.material as THREE.MeshBasicMaterial;

        // Check if reached center
        if (p.position.length() < 0.8) {
          p.userData.active = false;
          mat.opacity = 0;
        }
      }
    });

    // Update ATP particles
    this.atpParticles.forEach((p) => {
      if (p.userData.active) {
        p.userData.life -= dt * 0.5;
        p.position.y += dt * 0.5;
        p.rotation.x += dt * 3;
        p.rotation.y += dt * 4;
        p.scale.addScalar(dt * 0.5);
        const mat = p.material as THREE.MeshBasicMaterial;
        mat.opacity = p.userData.life;

        if (p.userData.life <= 0) {
          p.userData.active = false;
        }
      }
    });

    // Animate mitochondria
    this.mitochondria.forEach((mito, i) => {
      const mat = mito.material as THREE.MeshBasicMaterial;
      const glow = 0.7 + this.glowIntensity * 0.3;
      mat.opacity = glow;

      // Subtle movement
      mito.rotation.z += dt * 0.2;
      mito.position.y += Math.sin(time * 2 + i) * dt * 0.02;
    });

    // Cell membrane pulse
    const cellPulse = 1 + Math.sin(time) * 0.02;
    this.cell.scale.setScalar(cellPulse);
  }

  getReadout(): string {
    const o2Color = this.o2Level > 0.5 ? '#00aaff' : '#666666';
    const glucColor = this.glucoseLevel > 0.5 ? '#00ff88' : '#666666';
    const atpColor = this.atpLevel > 0.5 ? '#ffff00' : '#888800';
    return `<strong>O₂:</strong> <span style="color:${o2Color}">${Math.round(this.o2Level * 100)}%</span> | <strong>Glucose:</strong> <span style="color:${glucColor}">${Math.round(this.glucoseLevel * 100)}%</span> | <strong>ATP:</strong> <span style="color:${atpColor}">${Math.round(this.atpLevel * 100)}%</span>`;
  }
}