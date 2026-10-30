import * as THREE from 'three';
import { LevelScene } from './base';

export class Level10Out extends LevelScene {
  private leftFlask!: THREE.Mesh;
  private rightFlask!: THREE.Mesh;
  private leftLiquid!: THREE.Mesh;
  private rightLiquid!: THREE.Mesh;
  private bubbles: THREE.Mesh[] = [];
  private isHolding = false;
  private bubbleCount = 0;
  private turbidity = 0;
  private leftBubbleSpawn = 0;
  private rightBubbleSpawn = 0;

  constructor() {
    super();
  }

  enter(root: THREE.Scene): void {
    this.levelGroup = new THREE.Group();

    // Create two conical flasks
    const flaskShape = new THREE.Shape();
    flaskShape.moveTo(0, 0);
    flaskShape.lineTo(0.8, 0);
    flaskShape.lineTo(0.3, 2);
    flaskShape.lineTo(0.25, 2.3);
    flaskShape.lineTo(0.25, 2.5);
    flaskShape.lineTo(0, 2.5);

    const flaskGeo = new THREE.LatheGeometry(
      flaskShape.getPoints(20).map((p) => new THREE.Vector2(p.x, p.y)),
      32
    );
    const flaskMat = new THREE.MeshBasicMaterial({
      color: 0x446688,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });

    // Left flask (control - normal air)
    this.leftFlask = new THREE.Mesh(flaskGeo, flaskMat);
    this.leftFlask.position.set(-1.5, -1.5, 0);
    this.levelGroup.add(this.leftFlask);

    // Right flask (expired air)
    this.rightFlask = new THREE.Mesh(flaskGeo.clone(), flaskMat.clone());
    this.rightFlask.position.set(1.5, -1.5, 0);
    this.levelGroup.add(this.rightFlask);

    // Liquid in left flask (limewater - stays clear)
    const liquidGeo = new THREE.CylinderGeometry(0.75, 0.75, 0.8, 32);
    const leftLiquidMat = new THREE.MeshBasicMaterial({
      color: 0xaaddff,
      transparent: true,
      opacity: 0.4,
    });
    this.leftLiquid = new THREE.Mesh(liquidGeo, leftLiquidMat);
    this.leftLiquid.position.set(-1.5, -1.1, 0);
    this.levelGroup.add(this.leftLiquid);

    // Liquid in right flask (turns milky)
    const rightLiquidMat = new THREE.MeshBasicMaterial({
      color: 0xaaddff,
      transparent: true,
      opacity: 0.4,
    });
    this.rightLiquid = new THREE.Mesh(liquidGeo.clone(), rightLiquidMat);
    this.rightLiquid.position.set(1.5, -1.1, 0);
    this.levelGroup.add(this.rightLiquid);

    // Flask labels
    this.createLabel('AIR', -1.5, -2.3);
    this.createLabel('EXPIRED', 1.5, -2.3);

    // Mouth/source indicator
    const mouthGeo = new THREE.TorusGeometry(0.3, 0.1, 8, 16);
    const mouthMat = new THREE.MeshBasicMaterial({ color: 0xff6688 });
    const mouth = new THREE.Mesh(mouthGeo, mouthMat);
    mouth.position.set(0, 1.5, 0);
    mouth.rotation.x = Math.PI / 2;
    this.levelGroup.add(mouth);

    // Tubes from mouth to flasks
    const tubeCurveLeft = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 1.5, 0),
      new THREE.Vector3(-1, 1.5, 0),
      new THREE.Vector3(-1.5, 1, 0)
    );
    const tubeGeoLeft = new THREE.TubeGeometry(tubeCurveLeft, 20, 0.05, 8, false);
    const tubeMat = new THREE.MeshBasicMaterial({
      color: 0x888888,
      transparent: true,
      opacity: 0.6,
    });
    const tubeLeft = new THREE.Mesh(tubeGeoLeft, tubeMat);
    this.levelGroup.add(tubeLeft);

    const tubeCurveRight = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 1.5, 0),
      new THREE.Vector3(1, 1.5, 0),
      new THREE.Vector3(1.5, 1, 0)
    );
    const tubeGeoRight = new THREE.TubeGeometry(tubeCurveRight, 20, 0.05, 8, false);
    const tubeRight = new THREE.Mesh(tubeGeoRight, tubeMat.clone());
    this.levelGroup.add(tubeRight);

    // CO2 indicator for right flask
    const co2Geo = new THREE.RingGeometry(0.85, 0.9, 32);
    const co2Mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    const co2Ring = new THREE.Mesh(co2Geo, co2Mat);
    co2Ring.position.set(1.5, -1.1, 0.01);
    co2Ring.userData.isCO2 = true;
    this.levelGroup.add(co2Ring);

    // Bubble pool
    for (let i = 0; i < 40; i++) {
      const bubbleGeo = new THREE.SphereGeometry(0.05, 8, 8);
      const bubbleMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
      });
      const bubble = new THREE.Mesh(bubbleGeo, bubbleMat);
      bubble.userData.active = false;
      bubble.userData.flask = 'none';
      bubble.userData.velocity = 0;
      this.bubbles.push(bubble);
      this.levelGroup.add(bubble);
    }

    root.add(this.levelGroup);
  }

  private createLabel(text: string, x: number, y: number): void {
    // Simple text representation using small boxes
    const labelGroup = new THREE.Group();
    const charWidth = 0.15;
    const startX = -(text.length * charWidth) / 2;

    for (let i = 0; i < text.length; i++) {
      const charGeo = new THREE.PlaneGeometry(0.12, 0.15);
      const charMat = new THREE.MeshBasicMaterial({
        color: 0x00ffaa,
        transparent: true,
        opacity: 0.7,
      });
      const charMesh = new THREE.Mesh(charGeo, charMat);
      charMesh.position.x = startX + i * charWidth;
      labelGroup.add(charMesh);
    }
    labelGroup.position.set(x, y, 0);
    this.levelGroup.add(labelGroup);
  }

  private spawnBubble(flask: 'left' | 'right'): void {
    const inactive = this.bubbles.find((b) => !b.userData.active);
    if (inactive) {
      inactive.userData.active = true;
      inactive.userData.flask = flask;
      inactive.userData.velocity = 0.5 + Math.random() * 0.5;

      const x = flask === 'left' ? -1.5 : 1.5;
      inactive.position.set(
        x + (Math.random() - 0.5) * 0.4,
        -1.4,
        (Math.random() - 0.5) * 0.2
      );
      (inactive.material as THREE.MeshBasicMaterial).opacity = 0.7;
      inactive.scale.setScalar(0.8 + Math.random() * 0.4);
    }
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

  update(dt: number): void {
    const time = performance.now() * 0.001;

    // Exhale bubbles when holding
    if (this.isHolding) {
      this.leftBubbleSpawn += dt;
      this.rightBubbleSpawn += dt;

      if (this.leftBubbleSpawn > 0.15) {
        this.spawnBubble('left');
        this.leftBubbleSpawn = 0;
      }
      if (this.rightBubbleSpawn > 0.12) {
        this.spawnBubble('right');
        this.rightBubbleSpawn = 0;
        this.bubbleCount++;

        // Increase turbidity for right flask (CO2 indicator)
        this.turbidity = Math.min(1, this.turbidity + 0.02);
      }
    }

    // Update bubbles
    this.bubbles.forEach((bubble) => {
      if (bubble.userData.active) {
        bubble.position.y += bubble.userData.velocity * dt;
        bubble.position.x += Math.sin(time * 10 + bubble.position.y * 5) * dt * 0.1;

        const mat = bubble.material as THREE.MeshBasicMaterial;

        // Pop at surface
        if (bubble.position.y > -0.7) {
          mat.opacity -= dt * 3;
          if (mat.opacity <= 0) {
            bubble.userData.active = false;
          }
        }

        // Wobble
        const wobble = 1 + Math.sin(time * 8 + bubble.position.y * 3) * 0.1;
        bubble.scale.setScalar(wobble * (0.8 + Math.random() * 0.2));
      }
    });

    // Update right liquid (milky from CO2)
    const rightMat = this.rightLiquid.material as THREE.MeshBasicMaterial;
    const targetColor = new THREE.Color().lerpColors(
      new THREE.Color(0xaaddff),
      new THREE.Color(0xeeeeee),
      this.turbidity
    );
    rightMat.color.copy(targetColor);
    rightMat.opacity = 0.4 + this.turbidity * 0.5;

    // Update CO2 ring indicator
    this.levelGroup.traverse((obj) => {
      if (obj.userData.isCO2) {
        (obj as THREE.Mesh).material &&
          ((obj as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity === undefined ||
          (((obj as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity =
            this.turbidity * 0.5);
      }
    });

    // Gentle liquid surface animation
    const leftSurface = 1 + Math.sin(time * 2) * 0.02;
    const rightSurface = 1 + Math.sin(time * 2.5) * 0.03 * (1 + this.turbidity);
    this.leftLiquid.scale.y = leftSurface;
    this.rightLiquid.scale.y = rightSurface;

    // Slowly decrease turbidity when not exhaling (would take a while in real life)
    if (!this.isHolding) {
      // this.turbidity = Math.max(0, this.turbidity - dt * 0.01);
    }
  }

  getReadout(): string {
    const turbidityColor = this.turbidity > 0.5 ? '#ffffff' : this.turbidity > 0.2 ? '#cccccc' : '#888888';
    return `<strong>Bubbles:</strong> ${this.bubbleCount} | <strong>Turbidity:</strong> <span style="color:${turbidityColor}">${Math.round(this.turbidity * 100)}%</span>`;
  }
}