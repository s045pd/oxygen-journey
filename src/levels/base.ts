import * as THREE from 'three';

export abstract class LevelScene {
  protected levelScene: THREE.Scene;
  protected camera: THREE.PerspectiveCamera;
  protected levelGroup: THREE.Group;

  constructor() {
    this.levelScene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    this.levelGroup = new THREE.Group();
  }

  /** Get the level's camera for rendering */
  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  /** Called when entering this level. Add objects to root scene. */
  abstract enter(root: THREE.Scene): void;

  /** Called when leaving this level. Clean up. */
  abstract exit(): void;

  /** Called every frame with delta time. */
  abstract update(dt: number): void;

  /** Called when user starts holding (for 'hold' control) */
  onHoldStart(): void {}

  /** Called when user releases hold */
  onHoldEnd(): void {}

  /** Called on tap (for 'tap' control) */
  onTap(): void {}

  /** Called on slider change (for 'slider' control), v is 0-1 */
  onSlider(v: number): void {}

  /** Called on extra slider change, v is 0-1 */
  onExtraSlider(v: number): void {}

  /** Called on drag (for 'drag' control), dx/dy in pixels */
  onDrag(dx: number, dy: number): void {}

  /** Return HTML string for the readout panel */
  getReadout(): string {
    return '—';
  }

  /** Clean up resources */
  dispose(): void {
    this.levelGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose());
        } else {
          obj.material?.dispose();
        }
      }
    });
  }
}