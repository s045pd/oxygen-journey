import * as THREE from 'three';
import { LevelScene } from './base';

interface Alveolus {
  mesh: THREE.Mesh;
  packedPosition: THREE.Vector3;
  unfoldedPosition: THREE.Vector3;
  packedScale: number;
  unfoldedScale: number;
}

export class Level03Unfold extends LevelScene {
  private alveoli: Alveolus[] = [];
  private unfoldAmount = 0; // 0 to 1
  private rootScene: THREE.Scene | null = null;
  private time = 0;
  private dragAccumulator = 0;
  
  private alveolusMaterial!: THREE.MeshStandardMaterial;
  private numAlveoli = 18;

  constructor() {
    super();
    this.camera.position.set(0, 0, 5);
    this.camera.lookAt(0, 0, 0);
  }

  enter(root: THREE.Scene): void {
    this.rootScene = root;
    
    this.alveolusMaterial = new THREE.MeshStandardMaterial({
      color: 0xff44aa,
      emissive: 0x881155,
      emissiveIntensity: 0.5,
      roughness: 0.3,
      metalness: 0.1,
      transparent: true,
      opacity: 0.9,
    });
    
    this.addLights();
    this.buildAlveoli();
    root.add(this.levelGroup);
  }

  private addLights(): void {
    const ambient = new THREE.AmbientLight(0x403040, 0.5);
    this.levelGroup.add(ambient);
    
    const keyLight = new THREE.DirectionalLight(0xffffff, 1);
    keyLight.position.set(3, 4, 5);
    this.levelGroup.add(keyLight);
    
    const fillLight = new THREE.DirectionalLight(0xff66aa, 0.4);
    fillLight.position.set(-3, 1, 3);
    this.levelGroup.add(fillLight);
    
    const rimLight = new THREE.PointLight(0xff88cc, 0.6, 10);
    rimLight.position.set(0, 2, -3);
    this.levelGroup.add(rimLight);
  }

  private buildAlveoli(): void {
    const geo = new THREE.SphereGeometry(0.2, 24, 24);
    
    for (let i = 0; i < this.numAlveoli; i++) {
      const mesh = new THREE.Mesh(geo, this.alveolusMaterial.clone());
      
      // Packed position - tight cluster
      const phi = Math.acos(-1 + (2 * i) / this.numAlveoli);
      const theta = Math.sqrt(this.numAlveoli * Math.PI) * phi;
      const packedRadius = 0.5;
      
      const packedPosition = new THREE.Vector3(
        packedRadius * Math.cos(theta) * Math.sin(phi),
        packedRadius * Math.sin(theta) * Math.sin(phi),
        packedRadius * Math.cos(phi)
      );
      
      // Unfolded position - spread on a curved surface
      const gridSize = Math.ceil(Math.sqrt(this.numAlveoli));
      const row = Math.floor(i / gridSize);
      const col = i % gridSize;
      const spacing = 0.55;
      
      const unfoldedPosition = new THREE.Vector3(
        (col - gridSize / 2) * spacing,
        (row - gridSize / 2) * spacing * 0.8,
        -0.3 + Math.sin(col * 0.5) * 0.2 + Math.cos(row * 0.5) * 0.2
      );
      
      mesh.position.copy(packedPosition);
      
      this.alveoli.push({
        mesh,
        packedPosition,
        unfoldedPosition,
        packedScale: 0.6,
        unfoldedScale: 1.2,
      });
      
      this.levelGroup.add(mesh);
    }
  }

  onDrag(dx: number, dy: number): void {
    // Accumulate drag distance
    const dragDist = Math.sqrt(dx * dx + dy * dy);
    this.dragAccumulator += dragDist * 0.003;
    this.unfoldAmount = Math.min(1, Math.max(0, this.dragAccumulator));
  }

  exit(): void {
    if (this.rootScene) {
      this.rootScene.remove(this.levelGroup);
    }
    this.dispose();
  }

  update(dt: number): void {
    this.time += dt;
    
    // Update each alveolus position and scale
    this.alveoli.forEach((alv, index) => {
      // Smooth interpolation with slight delay per alveolus
      const delay = index * 0.02;
      const effectiveUnfold = Math.max(0, Math.min(1, this.unfoldAmount - delay));
      const eased = this.easeOutCubic(effectiveUnfold);
      
      // Lerp position
      alv.mesh.position.lerpVectors(alv.packedPosition, alv.unfoldedPosition, eased);
      
      // Lerp scale
      const scale = alv.packedScale + (alv.unfoldedScale - alv.packedScale) * eased;
      alv.mesh.scale.setScalar(scale);
      
      // Breathing animation
      const breathe = 1 + Math.sin(this.time * 2 + index * 0.3) * 0.05 * eased;
      alv.mesh.scale.multiplyScalar(breathe);
      
      // Update material emissive
      const mat = alv.mesh.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.4 + eased * 0.3 + Math.sin(this.time * 3 + index) * 0.1;
    });
    
    // Gentle camera movement
    this.camera.position.x = Math.sin(this.time * 0.2) * 0.3;
    this.camera.position.y = Math.cos(this.time * 0.15) * 0.2;
    this.camera.lookAt(0, 0, 0);
  }

  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  getReadout(): string {
    // Surface area: 0 to ~70 m² based on unfold
    const area = (this.unfoldAmount * 70).toFixed(0);
    return `<strong>Surface Area</strong> ~${area} m²`;
  }
}