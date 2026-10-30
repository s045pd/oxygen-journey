import * as THREE from 'three';
import { LevelScene } from './base';

export class Level07Loops extends LevelScene {
  private currentPath: 'pulmonary' | 'systemic' = 'pulmonary';
  private pulmonaryPath!: THREE.CatmullRomCurve3;
  private systemicPath!: THREE.CatmullRomCurve3;
  private pulmonaryLine!: THREE.Line;
  private systemicLine!: THREE.Line;
  private cell!: THREE.Mesh;
  private cellProgress = 0;
  private cellMoving = false;
  private heart!: THREE.Mesh;
  private body!: THREE.Mesh;
  private lungs: THREE.Mesh[] = [];

  constructor() {
    super();
  }

  enter(root: THREE.Scene): void {
    this.levelGroup = new THREE.Group();

    // Body silhouette
    const bodyGeo = new THREE.CapsuleGeometry(1.2, 2.5, 8, 16);
    const bodyMat = new THREE.MeshBasicMaterial({
      color: 0x220044,
      transparent: true,
      opacity: 0.3,
    });
    this.body = new THREE.Mesh(bodyGeo, bodyMat);
    this.body.position.y = -0.5;
    this.levelGroup.add(this.body);

    // Heart (center)
    const heartGeo = new THREE.SphereGeometry(0.4, 16, 16);
    heartGeo.scale(1, 1.2, 0.8);
    const heartMat = new THREE.MeshBasicMaterial({ color: 0xff0066 });
    this.heart = new THREE.Mesh(heartGeo, heartMat);
    this.heart.position.set(0, 0.8, 0);
    this.levelGroup.add(this.heart);

    // Lungs
    const lungGeo = new THREE.SphereGeometry(0.5, 12, 12);
    lungGeo.scale(0.8, 1.2, 0.6);
    const lungMat = new THREE.MeshBasicMaterial({
      color: 0x4488ff,
      transparent: true,
      opacity: 0.5,
    });
    const leftLung = new THREE.Mesh(lungGeo, lungMat);
    leftLung.position.set(-0.8, 1.2, 0);
    this.lungs.push(leftLung);
    this.levelGroup.add(leftLung);

    const rightLung = new THREE.Mesh(lungGeo.clone(), lungMat.clone());
    rightLung.position.set(0.8, 1.2, 0);
    this.lungs.push(rightLung);
    this.levelGroup.add(rightLung);

    // Pulmonary loop (heart -> lungs -> heart) - bluish
    const pulmonaryPoints = [
      new THREE.Vector3(0, 0.8, 0),      // Heart
      new THREE.Vector3(0.3, 1.5, 0.2),  // Up
      new THREE.Vector3(0.8, 1.8, 0),    // Right lung
      new THREE.Vector3(0.8, 1.2, 0),    // Right lung center
      new THREE.Vector3(0.3, 0.9, -0.2), // Back to heart
      new THREE.Vector3(-0.3, 0.9, 0.2), // Through heart
      new THREE.Vector3(-0.8, 1.2, 0),   // Left lung center
      new THREE.Vector3(-0.8, 1.8, 0),   // Left lung top
      new THREE.Vector3(-0.3, 1.5, -0.2),// Down
      new THREE.Vector3(0, 0.8, 0),      // Heart
    ];
    this.pulmonaryPath = new THREE.CatmullRomCurve3(pulmonaryPoints, true);

    const pulmonaryGeo = new THREE.BufferGeometry().setFromPoints(
      this.pulmonaryPath.getPoints(64)
    );
    const pulmonaryMat = new THREE.LineBasicMaterial({
      color: 0x4488ff,
      transparent: true,
      opacity: 0.8,
    });
    this.pulmonaryLine = new THREE.Line(pulmonaryGeo, pulmonaryMat);
    this.levelGroup.add(this.pulmonaryLine);

    // Systemic loop (heart -> body -> heart) - reddish
    const systemicPoints = [
      new THREE.Vector3(0, 0.8, 0),       // Heart
      new THREE.Vector3(-0.2, 0.3, 0.3),  // Down left
      new THREE.Vector3(-0.5, -0.5, 0),   // Body left
      new THREE.Vector3(-0.3, -1.5, 0.2), // Lower body
      new THREE.Vector3(0, -2.2, 0),      // Bottom
      new THREE.Vector3(0.3, -1.5, -0.2), // Up right
      new THREE.Vector3(0.5, -0.5, 0),    // Body right
      new THREE.Vector3(0.2, 0.3, -0.3),  // Up to heart
      new THREE.Vector3(0, 0.8, 0),       // Heart
    ];
    this.systemicPath = new THREE.CatmullRomCurve3(systemicPoints, true);

    const systemicGeo = new THREE.BufferGeometry().setFromPoints(
      this.systemicPath.getPoints(64)
    );
    const systemicMat = new THREE.LineBasicMaterial({
      color: 0xff4466,
      transparent: true,
      opacity: 0.4,
    });
    this.systemicLine = new THREE.Line(systemicGeo, systemicMat);
    this.levelGroup.add(this.systemicLine);

    // Glowing cell
    const cellGeo = new THREE.SphereGeometry(0.12, 12, 12);
    const cellMat = new THREE.MeshBasicMaterial({
      color: 0x00ffaa,
      transparent: true,
      opacity: 0.9,
    });
    this.cell = new THREE.Mesh(cellGeo, cellMat);
    this.levelGroup.add(this.cell);

    // Cell glow
    const glowGeo = new THREE.SphereGeometry(0.18, 12, 12);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x00ffaa,
      transparent: true,
      opacity: 0.3,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    this.cell.add(glow);

    this.updatePathHighlight();
    this.updateCellPosition();

    root.add(this.levelGroup);
  }

  private updatePathHighlight(): void {
    if (this.currentPath === 'pulmonary') {
      (this.pulmonaryLine.material as THREE.LineBasicMaterial).opacity = 0.9;
      (this.systemicLine.material as THREE.LineBasicMaterial).opacity = 0.3;
      (this.cell.material as THREE.MeshBasicMaterial).color.setHex(0x44aaff);
    } else {
      (this.pulmonaryLine.material as THREE.LineBasicMaterial).opacity = 0.3;
      (this.systemicLine.material as THREE.LineBasicMaterial).opacity = 0.9;
      (this.cell.material as THREE.MeshBasicMaterial).color.setHex(0xff6644);
    }
  }

  private updateCellPosition(): void {
    const path = this.currentPath === 'pulmonary' ? this.pulmonaryPath : this.systemicPath;
    const pos = path.getPoint(this.cellProgress);
    this.cell.position.copy(pos);
  }

  exit(): void {
    this.levelGroup.parent?.remove(this.levelGroup);
    this.dispose();
  }

  onTap(): void {
    if (!this.cellMoving) {
      // Start cell moving
      this.cellMoving = true;
      this.cellProgress = 0;
    } else {
      // Toggle path
      this.currentPath = this.currentPath === 'pulmonary' ? 'systemic' : 'pulmonary';
      this.cellProgress = 0;
      this.updatePathHighlight();
    }
  }

  update(dt: number): void {
    // Move cell along path
    if (this.cellMoving) {
      this.cellProgress += dt * 0.3;
      if (this.cellProgress >= 1) {
        this.cellProgress = 0;
      }
      this.updateCellPosition();
    }

    // Pulse heart
    const time = performance.now() * 0.001;
    const heartPulse = 1 + Math.sin(time * 3) * 0.1;
    this.heart.scale.setScalar(heartPulse);

    // Breathe lungs
    const lungPulse = 1 + Math.sin(time * 1.5) * 0.08;
    this.lungs.forEach((lung) => {
      lung.scale.y = 1.2 * lungPulse;
    });

    // Cell glow pulse
    const cellPulse = 1 + Math.sin(time * 5) * 0.2;
    this.cell.scale.setScalar(cellPulse);
  }

  getReadout(): string {
    const pathName = this.currentPath === 'pulmonary' ? 'Pulmonary (Lungs)' : 'Systemic (Body)';
    const color = this.currentPath === 'pulmonary' ? '#4488ff' : '#ff4466';
    return `<strong>Current Loop:</strong> <span style="color:${color}">${pathName}</span>`;
  }
}