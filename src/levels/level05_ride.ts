import * as THREE from 'three';
import { LevelScene } from './base';

export class Level05Ride extends LevelScene {
  private rbc!: THREE.Mesh;
  private tube!: THREE.Mesh;
  private bindingSites: THREE.Mesh[] = [];
  private sparks: THREE.Mesh[] = [];
  private o2Bound = 0;
  private rbcPosition = 0;
  private tubePath!: THREE.CatmullRomCurve3;
  private sitePositions: number[] = [0.1, 0.2, 0.35, 0.45, 0.55, 0.65, 0.8, 0.9];

  constructor() {
    super();
  }

  enter(root: THREE.Scene): void {
    this.levelGroup = new THREE.Group();

    // Create capillary tube path
    const points = [
      new THREE.Vector3(-4, 0, 0),
      new THREE.Vector3(-2, 0.5, 0),
      new THREE.Vector3(0, -0.3, 0),
      new THREE.Vector3(2, 0.4, 0),
      new THREE.Vector3(4, 0, 0),
    ];
    this.tubePath = new THREE.CatmullRomCurve3(points);

    // Tube geometry
    const tubeGeo = new THREE.TubeGeometry(this.tubePath, 64, 0.4, 16, false);
    const tubeMat = new THREE.MeshBasicMaterial({
      color: 0x330066,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    });
    this.tube = new THREE.Mesh(tubeGeo, tubeMat);
    this.levelGroup.add(this.tube);

    // Inner tube wall glow
    const innerTubeGeo = new THREE.TubeGeometry(this.tubePath, 64, 0.38, 16, false);
    const innerTubeMat = new THREE.MeshBasicMaterial({
      color: 0x6600aa,
      transparent: true,
      opacity: 0.2,
      side: THREE.BackSide,
    });
    const innerTube = new THREE.Mesh(innerTubeGeo, innerTubeMat);
    this.levelGroup.add(innerTube);

    // Create RBC (red blood cell) - biconcave disc approximation
    const rbcGeo = new THREE.SphereGeometry(0.25, 16, 16);
    rbcGeo.scale(1, 0.4, 1);
    const rbcMat = new THREE.MeshBasicMaterial({ color: 0xff3366 });
    this.rbc = new THREE.Mesh(rbcGeo, rbcMat);
    this.levelGroup.add(this.rbc);

    // Create 8 hemoglobin binding sites along the tube
    this.bindingSites = [];
    this.sparks = [];
    const siteMat = new THREE.MeshBasicMaterial({ color: 0x00ffaa });
    const boundMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });

    for (let i = 0; i < 8; i++) {
      const t = this.sitePositions[i];
      const pos = this.tubePath.getPoint(t);
      const siteGeo = new THREE.OctahedronGeometry(0.12);
      const site = new THREE.Mesh(siteGeo, siteMat.clone());
      site.position.copy(pos);
      site.position.y += 0.15;
      site.userData.bound = false;
      site.userData.t = t;
      this.bindingSites.push(site);
      this.levelGroup.add(site);

      // Spark effect (hidden initially)
      const sparkGeo = new THREE.IcosahedronGeometry(0.08);
      const sparkMat = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0,
      });
      const spark = new THREE.Mesh(sparkGeo, sparkMat);
      spark.position.copy(pos);
      this.sparks.push(spark);
      this.levelGroup.add(spark);
    }

    // Position RBC at start
    this.rbcPosition = 0;
    this.updateRBCPosition();

    // Lighting hint rings
    const ringGeo = new THREE.RingGeometry(0.42, 0.45, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x6600ff,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < 5; i++) {
      const ring = new THREE.Mesh(ringGeo, ringMat);
      const pos = this.tubePath.getPoint(i * 0.25);
      ring.position.copy(pos);
      ring.rotation.y = Math.PI / 2;
      this.levelGroup.add(ring);
    }

    root.add(this.levelGroup);
  }

  private updateRBCPosition(): void {
    const pos = this.tubePath.getPoint(this.rbcPosition);
    const tangent = this.tubePath.getTangent(this.rbcPosition);
    this.rbc.position.copy(pos);
    this.rbc.lookAt(pos.clone().add(tangent));
  }

  exit(): void {
    this.levelGroup.parent?.remove(this.levelGroup);
    this.dispose();
  }

  onDrag(dx: number, dy: number): void {
    // Horizontal drag moves RBC along tube
    this.rbcPosition += dx * 0.002;
    this.rbcPosition = Math.max(0, Math.min(1, this.rbcPosition));
    this.updateRBCPosition();

    // Check proximity to binding sites
    for (let i = 0; i < this.bindingSites.length; i++) {
      const site = this.bindingSites[i];
      if (!site.userData.bound) {
        const dist = Math.abs(this.rbcPosition - site.userData.t);
        if (dist < 0.03) {
          // Bind O2
          site.userData.bound = true;
          (site.material as THREE.MeshBasicMaterial).color.setHex(0x00ffff);
          this.o2Bound++;

          // Trigger spark
          const spark = this.sparks[i];
          (spark.material as THREE.MeshBasicMaterial).opacity = 1;
          spark.scale.setScalar(2);
        }
      }
    }
  }

  update(dt: number): void {
    // Animate binding sites
    const time = performance.now() * 0.001;
    this.bindingSites.forEach((site, i) => {
      if (!site.userData.bound) {
        site.rotation.y += dt * 2;
        site.scale.setScalar(1 + Math.sin(time * 3 + i) * 0.1);
      }
    });

    // Fade sparks
    this.sparks.forEach((spark) => {
      const mat = spark.material as THREE.MeshBasicMaterial;
      if (mat.opacity > 0) {
        mat.opacity -= dt * 2;
        spark.scale.multiplyScalar(0.95);
        spark.rotation.x += dt * 5;
        spark.rotation.y += dt * 7;
      }
    });

    // Pulse RBC
    const pulse = 1 + Math.sin(time * 4) * 0.05;
    this.rbc.scale.set(pulse, 0.4 * pulse, pulse);
  }

  getReadout(): string {
    return `<strong>O₂ Bound:</strong> ${this.o2Bound}/8`;
  }
}