import * as THREE from 'three';
import { LevelScene } from './base';

interface Branch {
  mesh: THREE.Mesh;
  generation: number;
  endPoint: THREE.Vector3;
  direction: THREE.Vector3;
  radius: number;
}

export class Level02Tree extends LevelScene {
  private branches: Branch[] = [];
  private currentGeneration = 0;
  private maxVisualGeneration = 7;
  private rootScene: THREE.Scene | null = null;
  private time = 0;
  private orbitAngle = 0;
  
  // Material for all branches
  private branchMaterial!: THREE.MeshStandardMaterial;

  constructor() {
    super();
    this.camera.position.set(0, 0, 6);
    this.camera.lookAt(0, -0.5, 0);
  }

  enter(root: THREE.Scene): void {
    this.rootScene = root;
    
    this.branchMaterial = new THREE.MeshStandardMaterial({
      color: 0xaa44ff,
      emissive: 0x6622aa,
      emissiveIntensity: 0.5,
      roughness: 0.4,
      metalness: 0.1,
    });
    
    this.addLights();
    this.buildTrachea();
    root.add(this.levelGroup);
  }

  private addLights(): void {
    const ambient = new THREE.AmbientLight(0x303040, 0.6);
    this.levelGroup.add(ambient);
    
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
    keyLight.position.set(3, 4, 5);
    this.levelGroup.add(keyLight);
    
    const fillLight = new THREE.DirectionalLight(0x8844ff, 0.5);
    fillLight.position.set(-3, 2, 3);
    this.levelGroup.add(fillLight);
    
    const backLight = new THREE.DirectionalLight(0xff44aa, 0.3);
    backLight.position.set(0, -2, -4);
    this.levelGroup.add(backLight);
  }

  private buildTrachea(): void {
    const height = 1.2;
    const radius = 0.15;
    
    const geo = new THREE.CylinderGeometry(radius, radius * 1.1, height, 16);
    const mesh = new THREE.Mesh(geo, this.branchMaterial);
    mesh.position.y = 1.5;
    
    this.levelGroup.add(mesh);
    
    this.branches.push({
      mesh,
      generation: 0,
      endPoint: new THREE.Vector3(0, 1.5 - height / 2, 0),
      direction: new THREE.Vector3(0, -1, 0),
      radius: radius,
    });
    
    this.currentGeneration = 1;
  }

  private addBifurcation(): void {
    if (this.currentGeneration > this.maxVisualGeneration) return;
    
    const parentBranches = this.branches.filter(b => b.generation === this.currentGeneration - 1);
    const newBranches: Branch[] = [];
    
    parentBranches.forEach(parent => {
      // Create two child branches
      const childRadius = parent.radius * 0.72;
      const childLength = Math.max(0.15, 0.8 * Math.pow(0.75, this.currentGeneration));
      
      // Bifurcation angles
      const spreadAngle = 0.4 + this.currentGeneration * 0.05;
      
      for (let side = -1; side <= 1; side += 2) {
        // Calculate branch direction with some randomness
        const angle = spreadAngle * side + (Math.random() - 0.5) * 0.2;
        const tiltAngle = (Math.random() - 0.5) * 0.3;
        
        const dir = parent.direction.clone();
        
        // Rotate around Z axis for left/right spread
        const rotZ = new THREE.Matrix4().makeRotationZ(angle);
        dir.applyMatrix4(rotZ);
        
        // Small forward/back tilt
        const rotX = new THREE.Matrix4().makeRotationX(tiltAngle);
        dir.applyMatrix4(rotX);
        dir.normalize();
        
        const endPoint = parent.endPoint.clone().add(dir.clone().multiplyScalar(childLength));
        
        // Create tube along direction
        const midPoint = parent.endPoint.clone().add(endPoint).multiplyScalar(0.5);
        
        const geo = new THREE.CylinderGeometry(childRadius * 0.9, childRadius, childLength, 8);
        const mesh = new THREE.Mesh(geo, this.branchMaterial);
        
        // Position and orient
        mesh.position.copy(midPoint);
        
        // Align cylinder to direction
        const up = new THREE.Vector3(0, 1, 0);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(up, dir);
        mesh.quaternion.copy(quaternion);
        
        this.levelGroup.add(mesh);
        
        newBranches.push({
          mesh,
          generation: this.currentGeneration,
          endPoint,
          direction: dir,
          radius: childRadius,
        });
      }
    });
    
    this.branches.push(...newBranches);
    this.currentGeneration++;
  }

  onTap(): void {
    if (this.currentGeneration <= this.maxVisualGeneration) {
      this.addBifurcation();
    }
  }

  exit(): void {
    if (this.rootScene) {
      this.rootScene.remove(this.levelGroup);
    }
    this.dispose();
  }

  update(dt: number): void {
    this.time += dt;
    
    // Slow orbit
    this.orbitAngle += dt * 0.15;
    const orbitRadius = 5;
    this.camera.position.x = Math.sin(this.orbitAngle) * orbitRadius;
    this.camera.position.z = Math.cos(this.orbitAngle) * orbitRadius;
    this.camera.position.y = 0.5 + Math.sin(this.time * 0.2) * 0.3;
    this.camera.lookAt(0, 0, 0);
    
    // Pulse emissive
    const pulse = 0.4 + Math.sin(this.time * 2) * 0.15;
    this.branchMaterial.emissiveIntensity = pulse;
  }

  getReadout(): string {
    // Map visual generations (1-7) to conceptual generations
    const visualGen = Math.max(1, this.currentGeneration - 1);
    const conceptualGen = Math.round((visualGen / this.maxVisualGeneration) * 23);
    return `<strong>Generation</strong> ${visualGen} / 23`;
  }
}