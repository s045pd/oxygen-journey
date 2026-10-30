/**
 * Oxygen Journey — procedural glass torso.
 *
 * Built entirely in code:
 *  - Torso: ring-swept superellipse cross-sections along a smooth profile, with
 *    chest, sternum, abdomen, scapula, spine-groove and shoulder shaping.
 *  - Neck + head hint: lathe profiles, gently tilted.
 *  - Glass: MeshPhysicalMaterial transmission + clearcoat + faint iridescence.
 *  - Neon fresnel shell: additive rim glow, faint contour lines, optional scan band.
 *  - Spine: instanced vertebrae with a travelling HDR pulse (bloom-ready),
 *    a glowing cord, and a faint neon ribcage/clavicles/sternum.
 *
 * Units are metres. Group-local origin sits at mid-chest; pelvis ≈ -0.5, crown ≈ +0.75.
 * Body faces +Z (toward the default camera). Body's LEFT side is +X.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* -------------------------------------------------------------------------- */
/* Maths helpers                                                              */
/* -------------------------------------------------------------------------- */

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const gauss = (v: number, m: number, w: number): number => Math.exp(-(((v - m) / w) ** 2));
const ss = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const spow = (v: number, p: number): number => Math.sign(v) * Math.pow(Math.abs(v), p);
const lerp = THREE.MathUtils.lerp;

/* -------------------------------------------------------------------------- */
/* Torso profile                                                              */
/* -------------------------------------------------------------------------- */

/** [halfWidth, y, halfDepth] control points, pelvis → neck base. */
const TORSO_PROFILE: [number, number, number][] = [
  [0.02, -0.505, 0.02],
  [0.105, -0.495, 0.08],
  [0.155, -0.465, 0.105],
  [0.172, -0.42, 0.115],
  [0.166, -0.35, 0.108],
  [0.145, -0.27, 0.098],
  [0.138, -0.2, 0.097],
  [0.144, -0.12, 0.103],
  [0.156, -0.04, 0.112],
  [0.166, 0.04, 0.118],
  [0.174, 0.12, 0.12],
  [0.186, 0.19, 0.112],
  [0.196, 0.24, 0.098],
  [0.186, 0.275, 0.084],
  [0.15, 0.3, 0.072],
  [0.098, 0.318, 0.062],
  [0.066, 0.33, 0.056],
];

interface Ring {
  y: number;
  hw: number;
  hd: number;
}

function sampleProfile(count: number): Ring[] {
  const curve = new THREE.CatmullRomCurve3(
    TORSO_PROFILE.map(([w, y, d]) => new THREE.Vector3(w, y, d)),
    false,
    'centripetal',
  );
  return curve.getSpacedPoints(count - 1).map((p) => ({ hw: p.x, y: p.y, hd: p.z }));
}

function profileAt(rings: Ring[], y: number): Ring {
  if (y <= rings[0].y) return rings[0];
  for (let i = 1; i < rings.length; i++) {
    const a = rings[i - 1];
    const b = rings[i];
    if (y <= b.y) {
      const t = (y - a.y) / Math.max(1e-6, b.y - a.y);
      return { y, hw: lerp(a.hw, b.hw, t), hd: lerp(a.hd, b.hd, t) };
    }
  }
  return rings[rings.length - 1];
}

function buildTorsoGeometry(rings: Ring[], segs: number): THREE.BufferGeometry {
  const R = rings.length;
  const pos = new Float32Array((R * segs + 1) * 3);
  let k = 0;

  for (let i = 0; i < R; i++) {
    const { y, hw, hd } = rings[i];
    // Rounder at waist, boxier at the shoulders, round again at the neck base.
    const n = Math.max(2, 2.25 + 0.75 * ss(0.06, 0.24, y) - 0.5 * ss(0.27, 0.33, y));
    const e = 2 / n;

    for (let j = 0; j < segs; j++) {
      const th = (j / segs) * Math.PI * 2;
      const c = Math.cos(th);
      const s = Math.sin(th);
      let x = hw * spow(c, e);
      let z = hd * spow(s, e);

      const front = Math.max(0, s);
      const back = Math.max(0, -s);
      const side = Math.abs(c) ** 4;
      const ax = Math.abs(x);

      // Front: pectorals, sternum groove, soft abdomen.
      z += 0.013 * gauss(y, 0.135, 0.055) * gauss(ax, 0.072, 0.045) * front;
      z -= 0.004 * gauss(y, 0.11, 0.09) * gauss(x, 0, 0.014) * front;
      z += 0.007 * gauss(y, -0.25, 0.08) * gauss(x, 0, 0.09) * front;

      // Back: spine groove (inward), shoulder blades + glutes (outward).
      z += 0.006 * gauss(x, 0, 0.016) * back * ss(-0.42, -0.3, y) * (1 - ss(0.24, 0.31, y));
      z -= 0.009 * gauss(y, 0.15, 0.06) * gauss(ax, 0.085, 0.045) * back;
      z -= 0.012 * gauss(y, -0.445, 0.045) * gauss(ax, 0.075, 0.055) * back;

      // Shoulder caps (arm sockets hint).
      x += Math.sign(x) * 0.012 * gauss(y, 0.225, 0.035) * side;

      pos[k++] = x;
      pos[k++] = y;
      pos[k++] = z;
    }
  }

  // Bottom pole.
  const pole = R * segs;
  pos[k++] = 0;
  pos[k++] = rings[0].y - 0.004;
  pos[k++] = 0;

  const idx: number[] = [];
  for (let i = 0; i < R - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * segs + j;
      const b = i * segs + ((j + 1) % segs);
      const c = (i + 1) * segs + j;
      const d = (i + 1) * segs + ((j + 1) % segs);
      idx.push(a, c, b, b, c, d);
    }
  }
  for (let j = 0; j < segs; j++) {
    idx.push(pole, j, (j + 1) % segs);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function buildNeckGeometry(): THREE.BufferGeometry {
  const pts = [
    new THREE.Vector2(0.078, 0.27),
    new THREE.Vector2(0.066, 0.31),
    new THREE.Vector2(0.057, 0.36),
    new THREE.Vector2(0.054, 0.41),
    new THREE.Vector2(0.056, 0.46),
    new THREE.Vector2(0.06, 0.505),
  ];
  const geo = new THREE.LatheGeometry(pts, 48);
  geo.deleteAttribute('uv');
  geo.scale(1, 1, 0.9);
  // Gentle forward tilt about the neck base.
  geo.translate(0, -0.3, 0);
  geo.rotateX(0.1);
  geo.translate(0, 0.3, -0.008);
  geo.computeVertexNormals();
  return geo;
}

function buildHeadGeometry(): THREE.BufferGeometry {
  const pts = [
    new THREE.Vector2(0.001, -0.118),
    new THREE.Vector2(0.03, -0.115),
    new THREE.Vector2(0.052, -0.1),
    new THREE.Vector2(0.066, -0.075),
    new THREE.Vector2(0.075, -0.045),
    new THREE.Vector2(0.084, -0.01),
    new THREE.Vector2(0.092, 0.025),
    new THREE.Vector2(0.093, 0.055),
    new THREE.Vector2(0.086, 0.085),
    new THREE.Vector2(0.07, 0.11),
    new THREE.Vector2(0.045, 0.127),
    new THREE.Vector2(0.001, 0.134),
  ];
  const geo = new THREE.LatheGeometry(pts, 56);
  geo.deleteAttribute('uv');

  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    let z = p.getZ(i) * 1.13;
    const r = Math.hypot(x, z) || 1;
    const front = Math.max(0, z / r);
    const back = Math.max(0, -z / r);
    // Flatter face plane, slight jaw/chin push, rounder occiput.
    z -= 0.008 * front * ss(-0.02, 0.09, y);
    z += 0.01 * front * gauss(y, -0.085, 0.03);
    z -= 0.012 * back * gauss(y, 0.035, 0.06);
    p.setZ(i, z);
  }
  geo.rotateX(0.06);
  geo.translate(0, 0.615, 0.012);
  geo.computeVertexNormals();
  return geo;
}

/* -------------------------------------------------------------------------- */
/* Skeleton accents                                                           */
/* -------------------------------------------------------------------------- */

const SPINE_POINTS: [number, number, number][] = [
  [0, -0.43, -0.055],
  [0, -0.33, -0.05],
  [0, -0.22, -0.04],
  [0, -0.1, -0.055],
  [0, 0.02, -0.072],
  [0, 0.14, -0.075],
  [0, 0.24, -0.06],
  [0, 0.33, -0.035],
  [0, 0.42, -0.022],
  [0, 0.5, -0.012],
];

function buildVertebraGeometry(): THREE.BufferGeometry {
  const body = new THREE.CylinderGeometry(1, 1, 1, 16, 1);
  const spinous = new THREE.BoxGeometry(0.32, 0.55, 1.5);
  spinous.translate(0, -0.1, -1.55);
  const transverse = new THREE.BoxGeometry(3.0, 0.38, 0.45);
  transverse.translate(0, 0, -0.75);
  const merged = mergeGeometries([body, spinous, transverse], false);
  body.dispose();
  spinous.dispose();
  transverse.dispose();
  if (!merged) throw new Error('vertebra merge failed');
  merged.deleteAttribute('uv');
  return merged;
}

function buildRibGeometry(rings: Ring[]): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const ribCount = 12;

  for (let k = 0; k < ribCount; k++) {
    const f = k / (ribCount - 1);
    const y0 = lerp(0.255, -0.075, f);
    const reach = k >= 10 ? 0.55 : k >= 7 ? lerp(0.95, 0.8, (k - 7) / 3) : 1;
    const drop = lerp(0.035, 0.085, f);

    for (const sideSign of [-1, 1]) {
      const pts: THREE.Vector3[] = [];
      const steps = 14;
      for (let s = 0; s <= steps; s++) {
        const u = (s / steps) * reach;
        const th = lerp(-Math.PI / 2 + 0.28, Math.PI / 2 - 0.3, u);
        const y = y0 - drop * Math.pow(u, 1.2) + 0.012 * Math.sin(u * Math.PI);
        const pr = profileAt(rings, y);
        const sc = 0.84;
        pts.push(new THREE.Vector3(sideSign * pr.hw * sc * Math.cos(th), y, pr.hd * sc * Math.sin(th) - 0.004));
      }
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.0026, 5, false);
      tube.deleteAttribute('uv');
      parts.push(tube);
    }
  }

  // Sternum.
  const sternumPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 6; i++) {
    const y = lerp(0.27, 0.0, i / 6);
    sternumPts.push(new THREE.Vector3(0, y, profileAt(rings, y).hd * 0.86 + 0.003));
  }
  const sternum = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sternumPts), 20, 0.0048, 6, false);
  sternum.deleteAttribute('uv');
  parts.push(sternum);

  // Clavicles.
  for (const s of [-1, 1]) {
    const clav = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(s * 0.02, 0.287, 0.074),
        new THREE.Vector3(s * 0.07, 0.297, 0.07),
        new THREE.Vector3(s * 0.115, 0.293, 0.042),
        new THREE.Vector3(s * 0.148, 0.282, 0.004),
      ]),
      20,
      0.0034,
      5,
      false,
    );
    clav.deleteAttribute('uv');
    parts.push(clav);
  }

  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  if (!merged) throw new Error('rib merge failed');
  return merged;
}

/* -------------------------------------------------------------------------- */
/* Shaders                                                                    */
/* -------------------------------------------------------------------------- */

const BREATH_GLSL = /* glsl */ `
  float oj_chest = smoothstep(-0.26, -0.02, P.y) * (1.0 - smoothstep(0.2, 0.33, P.y));
  float oj_front = 0.55 + 0.45 * clamp(N.z, 0.0, 1.0);
  P += N * uBreath * 0.016 * oj_chest * oj_front;
`;

const SHELL_VERT = /* glsl */ `
  uniform float uBreath;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vObj;
  void main() {
    vec3 P = position;
    vec3 N = normal;
    ${BREATH_GLSL}
    P += N * 0.0012;
    vObj = P;
    vec4 mv = modelViewMatrix * vec4(P, 1.0);
    vN = normalize(normalMatrix * N);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const SHELL_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uColor2;
  uniform float uIntensity;
  uniform float uPower;
  uniform float uLines;
  uniform float uScan;
  uniform float uScanY;
  uniform float uOpacity;
  uniform float uTime;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vObj;
  void main() {
    vec3 n = normalize(vN);
    vec3 v = normalize(vV);
    float ndv = clamp(abs(dot(n, v)), 0.0, 1.0);
    float fres = pow(1.0 - ndv, uPower);

    // Faint horizontal contour lines (scanner look), stronger toward silhouette.
    float d = abs(fract(vObj.y * 46.0 + uTime * 0.05) - 0.5);
    float line = smoothstep(0.455, 0.5, d) * uLines * (0.25 + fres);

    // Sweeping scan band.
    float band = exp(-pow((vObj.y - uScanY) / 0.022, 2.0)) * uScan;

    vec3 tint = mix(uColor, uColor2, smoothstep(-0.45, 0.75, vObj.y) * 0.55);
    vec3 col = tint * (fres * uIntensity + line * 0.22 + band * (0.6 + fres) * 1.8);
    gl_FragColor = vec4(col * uOpacity, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

export interface GlassTorsoOptions {
  /** Skip transmission (cheaper) — uses a transparent glass approximation. */
  lowPower?: boolean;
  accent?: THREE.ColorRepresentation;
  /** Secondary tint blended toward the head in the rim shell. */
  accent2?: THREE.ColorRepresentation;
}

export interface GlassTorsoAnchors {
  head: THREE.Vector3;
  throat: THREE.Vector3;
  chest: THREE.Vector3;
  lungLeft: THREE.Vector3;
  lungRight: THREE.Vector3;
  heart: THREE.Vector3;
  abdomen: THREE.Vector3;
  pelvis: THREE.Vector3;
}

export interface GlassTorso {
  group: THREE.Group;
  glass: THREE.Mesh;
  shell: THREE.Mesh;
  spine: THREE.InstancedMesh;
  cord: THREE.Mesh;
  ribs: THREE.Mesh;
  /** Group-local anchor points for placing organs. */
  anchors: GlassTorsoAnchors;
  setAccent(color: THREE.ColorRepresentation, color2?: THREE.ColorRepresentation): void;
  /** 0 = exhaled, 1 = full inhale. Eased internally. */
  setBreath(v: number): void;
  /** Multiplier on spine glow (0..2, default 1). */
  setSpineGlow(v: number): void;
  /** Rib/sternum/clavicle neon opacity (default 0.16). */
  setRibs(opacity: number): void;
  /** Scanner band strength (0 = off). */
  setScan(strength: number): void;
  /** Rim glow intensity (default 1.55). */
  setRim(intensity: number): void;
  /** Fade the whole body (0..1). Hides the group at 0. */
  setOpacity(v: number): void;
  update(time: number, dt?: number): void;
  dispose(): void;
}

export function createGlassTorso(options: GlassTorsoOptions = {}): GlassTorso {
  const accent = new THREE.Color(options.accent ?? 0x38f0ff);
  const accent2 = new THREE.Color(options.accent2 ?? 0x9b6dff);
  const lowPower = options.lowPower ?? false;

  const group = new THREE.Group();
  group.name = 'GlassTorso';
  group.position.y = -0.06;

  /* ---- Geometry ---- */
  const rings = sampleProfile(84);
  const torsoGeo = buildTorsoGeometry(rings, 72);
  const neckGeo = buildNeckGeometry();
  const headGeo = buildHeadGeometry();
  const bodyGeo = mergeGeometries([torsoGeo, neckGeo, headGeo], false);
  torsoGeo.dispose();
  neckGeo.dispose();
  headGeo.dispose();
  if (!bodyGeo) throw new Error('glass torso merge failed');
  bodyGeo.computeBoundingSphere();

  /* ---- Shared breath uniform ---- */
  const breathU = { value: 0 };

  /* ---- Glass ---- */
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: lowPower ? 0x8fb8ff : 0xc4dcff,
    metalness: 0,
    roughness: lowPower ? 0.2 : 0.09,
    transmission: lowPower ? 0 : 1,
    thickness: 0.26,
    ior: 1.4,
    attenuationColor: new THREE.Color(0x2b6fd6),
    attenuationDistance: 0.9,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    specularIntensity: 1,
    envMapIntensity: 1.15,
    iridescence: 0.22,
    iridescenceIOR: 1.3,
    transparent: true,
    opacity: lowPower ? 0.16 : 1,
    depthWrite: false,
    side: THREE.FrontSide,
  });
  const glassBaseOpacity = glassMat.opacity;
  glassMat.onBeforeCompile = (shader) => {
    shader.uniforms.uBreath = breathU;
    shader.vertexShader =
      'uniform float uBreath;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec3 P = transformed;
          vec3 N = objectNormal;
          ${BREATH_GLSL}
          transformed = P;
        }`,
      );
  };
  glassMat.customProgramCacheKey = () => `oj-glass-torso-${lowPower ? 'lp' : 'hq'}`;

  const glass = new THREE.Mesh(bodyGeo, glassMat);
  glass.name = 'GlassSkin';
  glass.renderOrder = 1;
  group.add(glass);

  /* ---- Neon fresnel shell ---- */
  const shellUniforms = {
    uBreath: breathU,
    uColor: { value: accent.clone() },
    uColor2: { value: accent2.clone() },
    uIntensity: { value: 1.55 },
    uPower: { value: 2.6 },
    uLines: { value: 0.55 },
    uScan: { value: 0 },
    uScanY: { value: 0 },
    uOpacity: { value: 1 },
    uTime: { value: 0 },
  };
  const shellMat = new THREE.ShaderMaterial({
    uniforms: shellUniforms,
    vertexShader: SHELL_VERT,
    fragmentShader: SHELL_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
  });
  const shell = new THREE.Mesh(bodyGeo, shellMat);
  shell.name = 'GlassRim';
  shell.renderOrder = 3;
  group.add(shell);

  /* ---- Spine ---- */
  const spineCurve = new THREE.CatmullRomCurve3(
    SPINE_POINTS.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    false,
    'centripetal',
  );
  const vertebraGeo = buildVertebraGeometry();
  const spineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: true });
  const VCOUNT = 24;
  const spine = new THREE.InstancedMesh(vertebraGeo, spineMat, VCOUNT);
  spine.name = 'Spine';
  spine.frustumCulled = false;

  const UP = new THREE.Vector3(0, 1, 0);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const tmpColor = new THREE.Color();
  const phases = new Float32Array(VCOUNT);
  for (let i = 0; i < VCOUNT; i++) {
    const t = 0.03 + (i / (VCOUNT - 1)) * 0.93;
    phases[i] = i / (VCOUNT - 1);
    const p = spineCurve.getPointAt(t);
    const tan = spineCurve.getTangentAt(t).normalize();
    q.setFromUnitVectors(UP, tan);
    const r = lerp(0.0165, 0.0085, ss(0, 1, t));
    const h = lerp(0.026, 0.017, t);
    scl.set(r, h, r);
    m4.compose(p, q, scl);
    spine.setMatrixAt(i, m4);
    spine.setColorAt(i, tmpColor.copy(accent).multiplyScalar(0.3));
  }
  spine.instanceMatrix.needsUpdate = true;
  group.add(spine);

  const cordMat = new THREE.MeshBasicMaterial({
    color: accent.clone().multiplyScalar(1.4),
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const cord = new THREE.Mesh(new THREE.TubeGeometry(spineCurve, 160, 0.0034, 8, false), cordMat);
  cord.name = 'SpinalCord';
  cord.renderOrder = 2;
  group.add(cord);

  /* ---- Ribs / sternum / clavicles ---- */
  const ribMat = new THREE.MeshBasicMaterial({
    color: accent.clone(),
    transparent: true,
    opacity: 0.16,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  let ribBaseOpacity = 0.16;
  const ribs = new THREE.Mesh(buildRibGeometry(rings), ribMat);
  ribs.name = 'Ribcage';
  ribs.renderOrder = 2;
  group.add(ribs);

  /* ---- Anchors ---- */
  const anchors: GlassTorsoAnchors = {
    head: new THREE.Vector3(0, 0.62, 0.02),
    throat: new THREE.Vector3(0, 0.4, 0.008),
    chest: new THREE.Vector3(0, 0.12, 0),
    lungLeft: new THREE.Vector3(0.075, 0.12, -0.005),
    lungRight: new THREE.Vector3(-0.075, 0.12, -0.005),
    heart: new THREE.Vector3(0.025, 0.07, 0.035),
    abdomen: new THREE.Vector3(0, -0.18, 0.02),
    pelvis: new THREE.Vector3(0, -0.42, 0),
  };

  /* ---- State ---- */
  let breathTarget = 0;
  let breathCur = 0;
  let spineGlow = 1;
  let fade = 1;
  let rimIntensity = 1.55;

  const applyFade = (): void => {
    const v = fade;
    group.visible = v > 0.002;
    glassMat.opacity = glassBaseOpacity * v;
    shellUniforms.uOpacity.value = v;
    cordMat.opacity = 0.55 * v;
    ribMat.opacity = ribBaseOpacity * v;
    const wantTransparent = v < 0.999;
    if (spineMat.transparent !== wantTransparent) {
      spineMat.transparent = wantTransparent;
      spineMat.needsUpdate = true;
    }
    spineMat.opacity = v;
  };

  const api: GlassTorso = {
    group,
    glass,
    shell,
    spine,
    cord,
    ribs,
    anchors,

    setAccent(color, color2) {
      accent.set(color);
      if (color2 !== undefined) accent2.set(color2);
      shellUniforms.uColor.value.copy(accent);
      shellUniforms.uColor2.value.copy(accent2);
      cordMat.color.copy(accent).multiplyScalar(1.4);
      ribMat.color.copy(accent);
    },

    setBreath(v) {
      breathTarget = clamp01(v);
    },

    setSpineGlow(v) {
      spineGlow = Math.max(0, v);
    },

    setRibs(opacity) {
      ribBaseOpacity = Math.max(0, opacity);
      ribMat.opacity = ribBaseOpacity * fade;
      ribs.visible = ribBaseOpacity > 0.001;
    },

    setScan(strength) {
      shellUniforms.uScan.value = Math.max(0, strength);
    },

    setRim(intensity) {
      rimIntensity = Math.max(0, intensity);
      shellUniforms.uIntensity.value = rimIntensity;
    },

    setOpacity(v) {
      fade = clamp01(v);
      applyFade();
    },

    update(time, dt = 1 / 60) {
      const step = Math.min(0.1, Math.max(0, dt));
      breathCur += (breathTarget - breathCur) * (1 - Math.exp(-step * 7));
      breathU.value = breathCur;
      const b = breathCur;

      ribs.scale.set(1 + 0.04 * b, 1 + 0.012 * b, 1 + 0.06 * b);

      shellUniforms.uTime.value = time;
      shellUniforms.uScanY.value = -0.52 + ((time * 0.38) % 1) * 1.3;
      shellUniforms.uIntensity.value = rimIntensity * (1 + 0.12 * b);

      // Travelling pulse up the spine (HDR peak → bloom).
      const head = (time * 0.42) % 1;
      for (let i = 0; i < VCOUNT; i++) {
        let d = phases[i] - head;
        d -= Math.round(d);
        const pulse = Math.exp(-((d / 0.07) ** 2));
        const g = (0.26 + 1.45 * pulse + 0.06 * Math.sin(time * 1.7 + i * 0.6)) * spineGlow;
        spine.setColorAt(i, tmpColor.copy(accent).multiplyScalar(g));
      }
      if (spine.instanceColor) spine.instanceColor.needsUpdate = true;

      cordMat.opacity = (0.42 + 0.18 * Math.sin(time * 2.1)) * fade * Math.min(1.4, spineGlow);
    },

    dispose() {
      bodyGeo.dispose();
      vertebraGeo.dispose();
      cord.geometry.dispose();
      ribs.geometry.dispose();
      glassMat.dispose();
      shellMat.dispose();
      spineMat.dispose();
      cordMat.dispose();
      ribMat.dispose();
      spine.dispose();
      group.removeFromParent();
    },
  };

  api.update(0, 0);
  return api;
}