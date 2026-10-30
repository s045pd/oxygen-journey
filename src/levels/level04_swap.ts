import * as THREE from 'three';
import { LevelScene } from './base';

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  type: 'O2' | 'CO2';
  side: 'air' | 'blood' | 'membrane';
  progress: number; // 0-1 for crossing membrane
}

export class Level04Swap extends LevelScene {
  private particles: Particle[] = [];
  private airWall!: THREE.Mesh;
  private membrane!: THREE.Mesh;
  private bloodWall!: THREE.Mesh;
  
  private membraneThickness = 0.5; // 0-1 mapped to visual and rate
  private diffusing = false;
  private rootScene: THREE.Scene | null = null;
  private time = 0;
  
  private o2Material!: THREE.MeshStandardMaterial;
  private co2Material!: THREE.MeshStandardMaterial;
  
  private exchangeRate = 0;
  private smoothedRate = 0;
  
  // Bounds
  private airBounds = { minX: -2.5, maxX: -0.6, minY: -1.5, maxY: 1.5 };
  private bloodBounds = { minX: 0.6, maxX: 2.5, minY: -1.5, maxY: 1.5 };

  constructor() {
    super();
    this.camera.position.set(0, 0, 6);
    this.camera.lookAt(0, 0, 0);
  }

  enter(root: THREE.Scene): void {
    this.rootScene = root;
    
    this.o2Material = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x008888,
      emissiveIntensity: 0.7,
      roughness: 0.3,
    });
    
    this.co2Material = new THREE.MeshStandardMaterial({
      color: 0xffaa00,
      emissive: 0x885500,
      emissiveIntensity: 0.7,
      roughness: 0.3,
    });
    
    this.addLights();
    this.buildCrossSection();
    this.spawnInitialParticles();
    root.add(this.levelGroup);
  }

  private addLights(): void {
    const ambient = new THREE.AmbientLight(0x404050, 0.6);
    this.levelGroup.add(ambient);
    
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
    keyLight.position.set(2, 4, 5);
    this.levelGroup.add(keyLight);
    
    const cyanLight = new THREE.PointLight(0x00ffff, 0.5, 8);
    cyanLight.position.set(-2, 0, 2);
    this.levelGroup.add(cyanLight);
    
    const amberLight = new THREE.PointLight(0xffaa00, 0.5, 8);
    amberLight.position.set(2, 0, 2);
    this.levelGroup.add(amberLight);
  }

  private buildCrossSection(): void {
    // Air side (left) - alveolar air space
    const airGeo = new THREE.BoxGeometry(2, 3.5, 0.3);
    const airMat = new THREE.MeshPhysicalMaterial({
      color: 0x4488ff,
      transparent: true,
      opacity: 0.15,
      transmission: 0.8,
      roughness: 0.1,
      side: THREE.DoubleSide,
    });
    this.airWall = new THREE.Mesh(airGeo, airMat);
    this.airWall.position.set(-1.5, 0, -0.3);
    this.levelGroup.add(this.airWall);
    
    // Membrane (center)
    this.buildMembrane();
    
    // Blood side (right) - capillary
    const bloodGeo = new THREE.BoxGeometry(2, 3.5, 0.3);
    const bloodMat = new THREE.MeshPhysicalMaterial({
      color: 0xff4466,
      transparent: true,
      opacity: 0.2,
      transmission: 0.7,
      roughness: 0.1,
      side: THREE.DoubleSide,
    });
    this.bloodWall = new THREE.Mesh(bloodGeo, bloodMat);
    this.bloodWall.position.set(1.5, 0, -0.3);
    this.levelGroup.add(this.bloodWall);
    
    // Labels
    this.addLabel('ALVEOLAR AIR', -1.5, 2);
    this.addLabel('CAPILLARY BLOOD', 1.5, 2);
  }

  private buildMembrane(): void {
    const thickness = 0.1 + this.membraneThickness * 0.4;
    const memGeo = new THREE.BoxGeometry(thickness, 3.5, 0.5);
    const memMat = new THREE.MeshStandardMaterial({
      color: 0xaa88cc,
      emissive: 0x442255,
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.7,
      roughness: 0.5,
    });
    
    if (this.membrane) {
      this.levelGroup.remove(this.membrane);
      this.membrane.geometry.dispose();
    }
    
    this.membrane = new THREE.Mesh(memGeo, memMat);
    this.membrane.position.set(0, 0, 0);
    this.levelGroup.add(this.membrane);
  }

  private addLabel(text: string, x: number, y: number): void {
    // Simple label using sprite (in real app would use CSS2DRenderer)
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'white';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, 128, 40);
    
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ 
      map: texture, 
      transparent: true,
      opacity: 0.8,
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.set(x, y, 0.5);
    sprite.scale.set(2, 0.5, 1);
    this.levelGroup.add(sprite);
  }

  private spawnInitialParticles(): void {
    const particleGeo = new THREE.SphereGeometry(0.08, 12, 12);
    
    // O2 particles in air side
    for (let i = 0; i < 15; i++) {
      const mesh = new THREE.Mesh(particleGeo, this.o2Material.clone());
      mesh.position.set(
        -1.5 + (Math.random() - 0.5) * 1.5,
        (Math.random() - 0.5) * 2.5,
        (Math.random() - 0.5) * 0.3
      );
      
      this.particles.push({
        mesh,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.5,
          (Math.random() - 0.5) * 0.5,
          0
        ),
        type: 'O2',
        side: 'air',
        progress: 0,
      });
      
      this.levelGroup.add(mesh);
    }
    
    // CO2 particles in blood side
    for (let i = 0; i < 12; i++) {
      const mesh = new THREE.Mesh(particleGeo, this.co2Material.clone());
      mesh.position.set(
        1.5 + (Math.random() - 0.5) * 1.5,
        (Math.random() - 0.5) * 2.5,
        (Math.random() - 0.5) * 0.3
      );
      
      this.particles.push({
        mesh,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.5,
          (Math.random() - 0.5) * 0.5,
          0
        ),
        type: 'CO2',
        side: 'blood',
        progress: 0,
      });
      
      this.levelGroup.add(mesh);
    }
  }

  onHoldStart(): void {
    this.diffusing = true;
  }

  onHoldEnd(): void {
    this.diffusing = false;
  }

  onSlider(v: number): void {
    this.membraneThickness = v;
    this.buildMembrane();
  }

  exit(): void {
    if (this.rootScene) {
      this.rootScene.remove(this.levelGroup);
    }
    this.dispose();
  }

  update(dt: number): void {
    this.time += dt;
    
    let exchanges = 0;
    const diffusionRate = 1 - this.membraneThickness * 0.8; // Thicker = slower
    
    this.particles.forEach(particle => {
      if (particle.side === 'membrane') {
        // Particle is crossing membrane
        particle.progress += dt * diffusionRate * 0.8;
        
        if (particle.progress >= 1) {
          // Crossed!
          exchanges++;
          if (particle.type === 'O2') {
            particle.side = 'blood';
            particle.mesh.position.x = 0.6;
          } else {
            particle.side = 'air';
            particle.mesh.position.x = -0.6;
          }
          particle.progress = 0;
          particle.velocity.set(
            (Math.random() - 0.5) * 0.5,
            (Math.random() - 0.5) * 0.5,
            0
          );
        } else {
          // Lerp across membrane
          if (particle.type === 'O2') {
            particle.mesh.position.x = -0.5 + particle.progress * 1;
          } else {
            particle.mesh.position.x = 0.5 - particle.progress * 1;
          }
          // Wiggle
          particle.mesh.position.y += Math.sin(this.time * 10 + particle.progress * 5) * 0.002;
        }
      } else {
        // Normal movement in air or blood side
        particle.mesh.position.add(particle.velocity.clone().multiplyScalar(dt));
        
        // Bounce off bounds
        const bounds = particle.side === 'air' ? this.airBounds : this.bloodBounds;
        
        if (particle.mesh.position.x < bounds.minX || particle.mesh.position.x > bounds.maxX) {
          particle.velocity.x *= -1;
          particle.mesh.position.x = Math.max(bounds.minX, Math.min(bounds.maxX, particle.mesh.position.x));
        }
        if (particle.mesh.position.y < bounds.minY || particle.mesh.position.y > bounds.maxY) {
          particle.velocity.y *= -1;
          particle.mesh.position.y = Math.max(bounds.minY, Math.min(bounds.maxY, particle.mesh.position.y));
        }
        
        // Check if should start diffusing
        if (this.diffusing) {
          const nearMembrane = (particle.type === 'O2' && particle.mesh.position.x > -0.7) ||
                              (particle.type === 'CO2' && particle.mesh.position.x < 0.7);
          
          if (nearMembrane && Math.random() < dt * diffusionRate * 2) {
            particle.side = 'membrane';
            particle.progress = 0;
          }
        }
        
        // Random velocity changes
        particle.velocity.x += (Math.random() - 0.5) * dt * 2;
        particle.velocity.y += (Math.random() - 0.5) * dt * 2;
        particle.velocity.clampLength(0, 1);
      }
      
      // Pulse effect
      const pulse = 1 + Math.sin(this.time * 4 + particle.mesh.position.x * 2) * 0.1;
      particle.mesh.scale.setScalar(pulse);
    });
    
    this.exchangeRate = exchanges / dt;
    this.smoothedRate = this.smoothedRate * 0.95 + this.exchangeRate * 0.05;
    
    // Camera subtle movement
    this.camera.position.x = Math.sin(this.time * 0.3) * 0.2;
    this.camera.lookAt(0, 0, 0);
  }

  getReadout(): string {
    const thicknessNm = Math.round(200 + this.membraneThickness * 800);
    const rate = this.diffusing ? Math.round(this.smoothedRate * 100) / 100 : 0;
    return `<strong>Thickness</strong> ${thicknessNm} nm<br><strong>Exchange</strong> ${rate.toFixed(1)}/s`;
  }
}