import * as THREE from 'three';
import { LevelScene } from './base';

export class Level09Run extends LevelScene {
  private effort = 0;
  private o2Debt = 0;
  private lactate = 0;
  private bodyParts: THREE.Mesh[] = [];
  private heartMesh!: THREE.Mesh;
  private lungMeshes: THREE.Mesh[] = [];
  private muscleGlow = 0;
  private runPhase = 0;

  constructor() {
    super();
  }

  enter(root: THREE.Scene): void {
    this.levelGroup = new THREE.Group();

    // Stick figure body
    const bodyMat = new THREE.MeshBasicMaterial({ color: 0x00ffaa });
    const limbMat = new THREE.MeshBasicMaterial({ color: 0x00dd88 });

    // Torso
    const torsoGeo = new THREE.CapsuleGeometry(0.3, 1.2, 8, 16);
    const torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.y = 0.5;
    this.bodyParts.push(torso);
    this.levelGroup.add(torso);

    // Head
    const headGeo = new THREE.SphereGeometry(0.35, 16, 16);
    const head = new THREE.Mesh(headGeo, bodyMat);
    head.position.y = 1.5;
    this.bodyParts.push(head);
    this.levelGroup.add(head);

    // Arms
    const armGeo = new THREE.CapsuleGeometry(0.1, 0.8, 4, 8);
    const leftArm = new THREE.Mesh(armGeo, limbMat);
    leftArm.position.set(-0.5, 0.7, 0);
    leftArm.rotation.z = 0.3;
    this.bodyParts.push(leftArm);
    this.levelGroup.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo.clone(), limbMat);
    rightArm.position.set(0.5, 0.7, 0);
    rightArm.rotation.z = -0.3;
    this.bodyParts.push(rightArm);
    this.levelGroup.add(rightArm);

    // Legs
    const legGeo = new THREE.CapsuleGeometry(0.12, 1, 4, 8);
    const leftLeg = new THREE.Mesh(legGeo, limbMat);
    leftLeg.position.set(-0.2, -0.8, 0);
    this.bodyParts.push(leftLeg);
    this.levelGroup.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo.clone(), limbMat);
    rightLeg.position.set(0.2, -0.8, 0);
    this.bodyParts.push(rightLeg);
    this.levelGroup.add(rightLeg);

    // Heart indicator
    const heartGeo = new THREE.SphereGeometry(0.15, 12, 12);
    const heartMat = new THREE.MeshBasicMaterial({
      color: 0xff0066,
      transparent: true,
      opacity: 0.8,
    });
    this.heartMesh = new THREE.Mesh(heartGeo, heartMat);
    this.heartMesh.position.set(-0.15, 0.7, 0.3);
    this.levelGroup.add(this.heartMesh);

    // Lung indicators
    const lungGeo = new THREE.SphereGeometry(0.12, 8, 8);
    const lungMat = new THREE.MeshBasicMaterial({
      color: 0x4488ff,
      transparent: true,
      opacity: 0.6,
    });
    const leftLung = new THREE.Mesh(lungGeo, lungMat);
    leftLung.position.set(-0.25, 0.9, 0.2);
    this.lungMeshes.push(leftLung);
    this.levelGroup.add(leftLung);

    const rightLungMesh = new THREE.Mesh(lungGeo.clone(), lungMat.clone());
    rightLungMesh.position.set(0.1, 0.9, 0.2);
    this.lungMeshes.push(rightLungMesh);
    this.levelGroup.add(rightLungMesh);

    // Muscle glow overlay
    const glowGeo = new THREE.CapsuleGeometry(0.35, 1.3, 8, 16);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xff4400,
      transparent: true,
      opacity: 0,
    });
    const muscleGlowMesh = new THREE.Mesh(glowGeo, glowMat);
    muscleGlowMesh.position.y = 0.5;
    muscleGlowMesh.userData.isGlow = true;
    this.bodyParts.push(muscleGlowMesh);
    this.levelGroup.add(muscleGlowMesh);

    // Effort meter background
    const meterBgGeo = new THREE.PlaneGeometry(0.2, 2.5);
    const meterBgMat = new THREE.MeshBasicMaterial({
      color: 0x222222,
      transparent: true,
      opacity: 0.5,
    });
    const meterBg = new THREE.Mesh(meterBgGeo, meterBgMat);
    meterBg.position.set(2, 0.25, 0);
    this.levelGroup.add(meterBg);

    // Effort meter fill
    const meterGeo = new THREE.PlaneGeometry(0.15, 0.1);
    const meterMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
    const meter = new THREE.Mesh(meterGeo, meterMat);
    meter.position.set(2, -1, 0.01);
    meter.userData.isMeter = true;
    this.bodyParts.push(meter);
    this.levelGroup.add(meter);

    // Lactate indicator
    const lactateGeo = new THREE.RingGeometry(0.3, 0.4, 16);
    const lactateMat = new THREE.MeshBasicMaterial({
      color: 0xff8800,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    const lactateRing = new THREE.Mesh(lactateGeo, lactateMat);
    lactateRing.position.set(-2, 0, 0);
    lactateRing.userData.isLactate = true;
    this.bodyParts.push(lactateRing);
    this.levelGroup.add(lactateRing);

    root.add(this.levelGroup);
  }

  exit(): void {
    this.levelGroup.parent?.remove(this.levelGroup);
    this.dispose();
  }

  onDrag(dx: number, dy: number): void {
    // Vertical drag sets effort
    this.effort = Math.max(0, Math.min(1, this.effort - dy * 0.005));
  }

  update(dt: number): void {
    const time = performance.now() * 0.001;

    // High effort increases O2 debt and lactate
    if (this.effort > 0.5) {
      const excess = (this.effort - 0.5) * 2; // 0-1 for high effort range
      this.o2Debt = Math.min(1, this.o2Debt + excess * dt * 0.3);
      this.lactate = Math.min(1, this.lactate + excess * dt * 0.2);
      this.muscleGlow = Math.min(1, this.muscleGlow + dt * 2);
    } else {
      // Low effort repays debt
      this.o2Debt = Math.max(0, this.o2Debt - dt * 0.15);
      this.lactate = Math.max(0, this.lactate - dt * 0.1);
      this.muscleGlow = Math.max(0, this.muscleGlow - dt);
    }

    // Running animation
    this.runPhase += dt * (2 + this.effort * 8);
    const arms = [this.bodyParts[2], this.bodyParts[3]];
    const legs = [this.bodyParts[4], this.bodyParts[5]];

    arms[0].rotation.x = Math.sin(this.runPhase) * this.effort * 0.8;
    arms[1].rotation.x = -Math.sin(this.runPhase) * this.effort * 0.8;
    legs[0].rotation.x = -Math.sin(this.runPhase) * this.effort * 0.6;
    legs[1].rotation.x = Math.sin(this.runPhase) * this.effort * 0.6;

    // Torso bob
    this.bodyParts[0].position.y = 0.5 + Math.abs(Math.sin(this.runPhase * 2)) * this.effort * 0.1;
    this.bodyParts[1].position.y = 1.5 + Math.abs(Math.sin(this.runPhase * 2)) * this.effort * 0.1;

    // Heart rate based on effort and debt
    const heartRate = 1 + this.effort * 4 + this.o2Debt * 2;
    const heartPulse = 1 + Math.sin(time * heartRate * 3) * 0.3;
    this.heartMesh.scale.setScalar(heartPulse);

    // Lung breathing
    const breathRate = 1 + this.effort * 2;
    const lungScale = 1 + Math.sin(time * breathRate) * 0.2;
    this.lungMeshes.forEach((lung) => {
      lung.scale.setScalar(lungScale);
    });

    // Update glow mesh
    const glowMesh = this.bodyParts.find((p) => p.userData.isGlow);
    if (glowMesh) {
      (glowMesh.material as THREE.MeshBasicMaterial).opacity = this.muscleGlow * 0.4;
    }

    // Update effort meter
    const meter = this.bodyParts.find((p) => p.userData.isMeter);
    if (meter) {
      meter.scale.y = Math.max(0.1, this.effort * 25);
      meter.position.y = -1 + this.effort * 1.25;
      const meterMat = meter.material as THREE.MeshBasicMaterial;
      if (this.effort > 0.7) {
        meterMat.color.setHex(0xff4400);
      } else if (this.effort > 0.4) {
        meterMat.color.setHex(0xffaa00);
      } else {
        meterMat.color.setHex(0x00ff88);
      }
    }

    // Update lactate ring
    const lactateRing = this.bodyParts.find((p) => p.userData.isLactate);
    if (lactateRing) {
      (lactateRing.material as THREE.MeshBasicMaterial).opacity = this.lactate * 0.8;
      lactateRing.scale.setScalar(1 + this.lactate * 0.5);
      lactateRing.rotation.z += dt * this.lactate * 2;
    }
  }

  getReadout(): string {
    const effortColor = this.effort > 0.7 ? '#ff4400' : this.effort > 0.4 ? '#ffaa00' : '#00ff88';
    const debtColor = this.o2Debt > 0.5 ? '#ff4400' : '#00aaff';
    const lactColor = this.lactate > 0.5 ? '#ff8800' : '#888888';
    return `<strong>Effort:</strong> <span style="color:${effortColor}">${Math.round(this.effort * 100)}%</span> | <strong>O₂ Debt:</strong> <span style="color:${debtColor}">${Math.round(this.o2Debt * 100)}%</span> | <strong>Lactate:</strong> <span style="color:${lactColor}">${Math.round(this.lactate * 100)}%</span>`;
  }
}