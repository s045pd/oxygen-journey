import * as THREE from 'three';

export interface RendererContext {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  clock: THREE.Clock;
  onResize: () => void;
  dispose: () => void;
}

export function createRenderer(container: HTMLElement): RendererContext {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0c12);

  const camera = new THREE.PerspectiveCamera(
    60,
    container.clientWidth / container.clientHeight,
    0.1,
    1000
  );
  camera.position.set(0, 0, 5);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance'
  });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  container.appendChild(renderer.domElement);

  // Ambient light
  const ambient = new THREE.AmbientLight(0x404060, 0.5);
  scene.add(ambient);

  // Main directional light
  const directional = new THREE.DirectionalLight(0xffffff, 1);
  directional.position.set(5, 5, 5);
  scene.add(directional);

  // Accent lights
  const cyanLight = new THREE.PointLight(0x00e5ff, 0.5, 20);
  cyanLight.position.set(-3, 2, 3);
  scene.add(cyanLight);

  const magentaLight = new THREE.PointLight(0xff00e5, 0.3, 20);
  magentaLight.position.set(3, -2, 2);
  scene.add(magentaLight);

  const clock = new THREE.Clock();

  const onResize = () => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  };

  window.addEventListener('resize', onResize);

  const dispose = () => {
    window.removeEventListener('resize', onResize);
    renderer.dispose();
    container.removeChild(renderer.domElement);
  };

  return {
    renderer,
    camera,
    scene,
    clock,
    onResize,
    dispose
  };
}