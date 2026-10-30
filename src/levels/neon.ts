/**
 * Oxygen Journey — shared neon / glass material + maths helpers for level scenes.
 * Procedural only (canvas-generated glow sprite, no external assets).
 */
import * as THREE from 'three';

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const frac = (v: number): number => v - Math.floor(v);

export function smoothstep(edge0: number, edge1: number, v: number): number {
  const d = edge1 - edge0;
  const t = clamp01((v - edge0) / (Math.abs(d) < 1e-6 ? 1e-6 : d));
  return t * t * (3 - 2 * t);
}

/** Frame-rate independent exponential approach. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * Math.max(0, dt)));
}

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Dark base + strong emissive: reads as a neon tube under a dim studio. */
export function neonMaterial(
  color: THREE.ColorRepresentation,
  intensity = 0.95,
  base = 0.14,
): THREE.MeshStandardMaterial {
  const c = new THREE.Color(color);
  return new THREE.MeshStandardMaterial({
    color: c.clone().multiplyScalar(base),
    emissive: c,
    emissiveIntensity: intensity,
    roughness: 0.32,
    metalness: 0.05,
  });
}

export interface GlassOptions {
  opacity?: number;
  emissive?: number;
  roughness?: number;
  side?: THREE.Side;
  tint?: number;
}

/** Tinted clear-coated glass (no transmission pass — cheap on phones). */
export function glassMaterial(color: THREE.ColorRepresentation, o: GlassOptions = {}): THREE.MeshPhysicalMaterial {
  const c = new THREE.Color(color);
  return new THREE.MeshPhysicalMaterial({
    color: c.clone().multiplyScalar(o.tint ?? 0.55),
    emissive: c,
    emissiveIntensity: o.emissive ?? 0.15,
    roughness: o.roughness ?? 0.16,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    transparent: true,
    opacity: o.opacity ?? 0.3,
    depthWrite: false,
    side: o.side ?? THREE.FrontSide,
  });
}

const FRESNEL_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
void main() {
  vec4 p = vec4(position, 1.0);
  vec3 n = normal;
  #ifdef USE_INSTANCING
    p = instanceMatrix * p;
    n = mat3(instanceMatrix) * n;
  #endif
  vec4 mv = modelViewMatrix * p;
  vN = normalize(normalMatrix * n);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const FRESNEL_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uPower;
uniform float uIntensity;
uniform float uOpacity;
varying vec3 vN;
varying vec3 vV;
void main() {
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPower);
  float a = clamp(f * uOpacity, 0.0, 1.0);
  gl_FragColor = vec4(uColor * uIntensity, a);
}
`;

export interface FresnelOptions {
  power?: number;
  intensity?: number;
  opacity?: number;
  side?: THREE.Side;
}

/** Additive rim-light shell. Works on Mesh and InstancedMesh. */
export function fresnelMaterial(color: THREE.ColorRepresentation, o: FresnelOptions = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uPower: { value: o.power ?? 2.4 },
      uIntensity: { value: o.intensity ?? 0.9 },
      uOpacity: { value: o.opacity ?? 1 },
    },
    vertexShader: FRESNEL_VERT,
    fragmentShader: FRESNEL_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: o.side ?? THREE.FrontSide,
  });
}

export function setFresnel(mat: THREE.ShaderMaterial, intensity: number, opacity?: number): void {
  const u = mat.uniforms;
  const i = u['uIntensity'];
  if (i) i.value = intensity;
  if (opacity !== undefined) {
    const op = u['uOpacity'];
    if (op) op.value = opacity;
  }
}

/** Soft radial glow sprite drawn on a canvas. */
export function glowTexture(size = 64): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  if (g) {
    const r = size / 2;
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.2, 'rgba(255,255,255,0.8)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.18)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export function glowPointsMaterial(
  color: THREE.ColorRepresentation,
  size: number,
  opacity = 1,
  vertexColors = false,
): THREE.PointsMaterial {
  return new THREE.PointsMaterial({
    color,
    size,
    map: glowTexture(),
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    vertexColors,
  });
}

export function lineMaterial(color: THREE.ColorRepresentation, opacity = 0.6): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}