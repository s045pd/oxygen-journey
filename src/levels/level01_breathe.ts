import * as THREE from 'three';
import { LevelScene } from './base';

export class Level01Breathe extends LevelScene {
  private ribs: THREE.Mesh[] = [];
  private diaphragm!: THREE.Mesh;
  private leftLung!: THREE.Mesh;
  private rightLung!: THREE.Mesh;
  private torso!: THREE.Mesh;
  
  private inhaling = false;
  private breathProgress = 0; // 0 = exhaled, 1 = inhaled
  private breathSpeed = 1.2;
  
  private volume = 0.5; // Liters
  private minVolume = 0.5;
  private maxVolume = 4.5;
  
  private rootScene: THREE.Scene | null = null;
  private time = 0;

  constructor() {
    super();
    this.camera.position.set(0, 0, 5);
    this.camera.lookAt(0, 0, 0);
  }

  enter(root: THREE.Scene): void {
    this.rootScene = root;
    this.buildTorso();
    this.buildRibs();
    this.buildDiaphragm();
    this.buildLungs();
    this.addLights();
    root.add(this.levelGroup);
  }

  private buildTorso(): void {
    // Glass torso - ellipsoid shape
    const torsoGeo = new THREE.SphereGeometry(1.2, 32, 32);
    torsoGeo.scale(0.8, 1.3, 0.5);
    
    const torsoMat = new THREE.MeshPhysicalMaterial({
      color: 0x88ccff,
      transparent: true,
      opacity: 0.15,
      transmission: 0.9,
      roughness: 0.1,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    
    this.torso = new THREE.Mesh(torsoGeo, torsoMat);
    this.torso.position.y = 0.2;
    this.levelGroup.add(this.torso);
  }

  private buildRibs(): void {
    const ribMat = new THREE.MeshStandardMaterial({
      color: 0xeeeedd,
      emissive: 0x222211,
      emissiveIntensity: 0.3,
      roughness: 0.6,
    });

    // Create 6 pairs of ribs as curved tubes
    for (let i = 0; i < 6; i++) {
      const y = 0.8 - i * 0.25;
      const ribScale = 1 - Math.abs(i - 2.5) * 0.08;
      
      // Left rib
      const leftRib = this.createRib(ribScale, y, 1);
      this.ribs.push(leftRib);
      this.levelGroup.add(leftRib);
      
      // Right rib
      const rightRib = this.createRib(ribScale, y, -1);
      this.ribs.push(rightRib);
      this.levelGroup.add(rightRib);
    }
  }

  private createRib(scale: number, y: number, side: number): THREE.Mesh {
    const curve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(0, 0, 0.3),
      new THREE.Vector3(side * 0.4 * scale, 0, 0.35),
      new THREE.Vector3(side * 0.7 * scale, 0, 0.15),
      new THREE.Vector3(side * 0.75 * scale, 0, -0.1)
    );
    
    const tubeGeo = new THREE.TubeGeometry(curve, 16, 0.03, 8, false);
    const ribMat = new THREE.MeshStandardMaterial({
      color: 0xeeeedd,
      emissive: 0x332211,
      emissiveIntensity: 0.2,
      roughness: 0.5,
    });
    
    const rib = new THREE.Mesh(tubeGeo, ribMat);
    rib.position.y = y;
    rib.userData.baseScale = scale;
    rib.userData.side = side;
    rib.userData.baseY = y;
    
    return rib;
  }

  private buildDiaphragm(): void {
    // Dome-shaped diaphragm
    const diaGeo = new THREE.SphereGeometry(0.6, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.4);
    diaGeo.rotateX(Math.PI);
    
    const diaMat = new THREE.MeshStandardMaterial({
      color: 0xff6688,
      emissive: 0x441122,
      emissiveIntensity: 0.3,
      roughness: 0.7,
      side: THREE.DoubleSide,
    });
    
    this.diaphragm = new THREE.Mesh(diaGeo, diaMat);
    this.diaphragm.position.y = -0.8;
    this.levelGroup.add(this.diaphragm);
  }

  private buildLungs(): void {
    const lungGeo = new THREE.SphereGeometry(0.35, 24, 24);
    lungGeo.scale(0.8, 1.2, 0.6);
    
    const lungMat = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x004444,
      emissiveIntensity: 0.4,
      transparent: true,
      opacity: 0.85,
      roughness: 0.4,
    });
    
    this.leftLung = new THREE.Mesh(lungGeo.clone(), lungMat.clone());
    this.leftLung.position.set(-0.35, 0.15, 0);
    this.levelGroup.add(this.leftLung);
    
    this.rightLung = new THREE.Mesh(lungGeo.clone(), lungMat.clone());
    this.rightLung.position.set(0.35, 0.15, 0);
    this.levelGroup.add(this.rightLung);
  }

  private addLights(): void {
    const ambientLight = new THREE.AmbientLight(0x404050, 0.5);
    this.levelGroup.add(ambientLight);
    
    const keyLight = new THREE.DirectionalLight(0xffffff, 1);
    keyLight.position.set(2, 3, 4);
    this.levelGroup.add(keyLight);
    
    const fillLight = new THREE.DirectionalLight(0x4488ff, 0.4);
    fillLight.position.set(-2, 1, 2);
    this.levelGroup.add(fillLight);
    
    const rimLight = new THREE.DirectionalLight(0xff88ff, 0.3);
    rimLight.position.set(0, -2, -3);
    this.levelGroup.add(rimLight);
  }

  exit(): void {
    if (this.rootScene) {
      this.rootScene.remove(this.levelGroup);
    }
    this.dispose();
  }

  onHoldStart(): void {
    this.inhaling = true;
  }

  onHoldEnd(): void {
    this.inhaling = false;
  }

  update(dt: number): void {
    this.time += dt;
    
    // Update breath progress with easing
    const targetProgress = this.inhaling ? 1 : 0;
    const diff = targetProgress - this.breathProgress;
    const easing = this.inhaling ? 2.5 : 1.8; // Inhale faster, exhale slower
    this.breathProgress += diff * dt * easing;
    this.breathProgress = Math.max(0, Math.min(1, this.breathProgress));
    
    // Calculate current volume
    this.volume = this.minVolume + (this.maxVolume - this.minVolume) * this.breathProgress;
    
    // Animate lungs
    const lungScale = 0.7 + this.breathProgress * 0.5;
    this.leftLung.scale.setScalar(lungScale);
    this.rightLung.scale.setScalar(lungScale);
    
    // Lung emissive pulse while inhaling
    const lungMats = [this.leftLung.material, this.rightLung.material] as THREE.MeshStandardMaterial[];
    lungMats.forEach(mat => {
      const pulseIntensity = this.inhaling ? 0.6 + Math.sin(this.time * 8) * 0.2 : 0.3;
      mat.emissiveIntensity = pulseIntensity;
      mat.emissive.setHex(this.inhaling ? 0x00aaaa : 0x004444);
    });
    
    // Animate ribs - expand outward and slightly upward
    this.ribs.forEach((rib, index) => {
      const baseScale = rib.userData.baseScale as number;
      const side = rib.userData.side as number;
      const expansion = this.breathProgress * 0.15;
      
      rib.scale.x = 1 + expansion;
      rib.scale.z = 1 + expansion * 0.5;
      rib.position.x = side * expansion * 0.1;
      rib.position.y = (rib.userData.baseY as number) + this.breathProgress * 0.05;
    });
    
    // Animate diaphragm - flatten (descend) on inhale
    const diaY = -0.8 - this.breathProgress * 0.3;
    this.diaphragm.position.y = diaY;
    this.diaphragm.scale.y = 1 - this.breathProgress * 0.5; // Flatten
    this.diaphragm.scale.x = 1 + this.breathProgress * 0.15;
    this.diaphragm.scale.z = 1 + this.breathProgress * 0.15;
    
    // Gentle camera bob
    this.camera.position.x = Math.sin(this.time * 0.3) * 0.1;
    this.camera.position.y = Math.cos(this.time * 0.2) * 0.05;
    this.camera.lookAt(0, 0, 0);
  }

  getReadout(): string {
    return `<strong>Volume</strong> ${this.volume.toFixed(1)} L`;
  }
}