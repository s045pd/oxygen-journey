import * as THREE from 'three';

export function createGlassTorso(): THREE.Group {
  const group = new THREE.Group();

  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x88ccff,
    metalness: 0.0,
    roughness: 0.1,
    transmission: 0.9,
    transparent: true,
    opacity: 0.3,
    thickness: 0.5,
    envMapIntensity: 1,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    side: THREE.DoubleSide
  });

  // Torso - ellipsoid shape
  const torsoGeometry = new THREE.SphereGeometry(1, 32, 32);
  torsoGeometry.scale(0.8, 1.2, 0.5);
  const torso = new THREE.Mesh(torsoGeometry, glassMaterial);
  torso.position.y = 0;
  group.add(torso);

  // Neck
  const neckGeometry = new THREE.CylinderGeometry(0.15, 0.2, 0.4, 16);
  const neck = new THREE.Mesh(neckGeometry, glassMaterial);
  neck.position.y = 1.4;
  group.add(neck);

  // Head hint - smaller sphere
  const headGeometry = new THREE.SphereGeometry(0.35, 24, 24);
  headGeometry.scale(1, 1.1, 0.9);
  const head = new THREE.Mesh(headGeometry, glassMaterial);
  head.position.y = 1.95;
  group.add(head);

  // Shoulders hint
  const shoulderGeometry = new THREE.CapsuleGeometry(0.12, 0.8, 8, 16);
  const leftShoulder = new THREE.Mesh(shoulderGeometry, glassMaterial);
  leftShoulder.rotation.z = Math.PI / 2;
  leftShoulder.position.set(-0.7, 1.0, 0);
  group.add(leftShoulder);

  const rightShoulder = new THREE.Mesh(shoulderGeometry, glassMaterial.clone());
  rightShoulder.rotation.z = Math.PI / 2;
  rightShoulder.position.set(0.7, 1.0, 0);
  group.add(rightShoulder);

  // Inner glow effect using emissive sphere
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0x00e5ff,
    transparent: true,
    opacity: 0.05
  });
  const innerGlow = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 16, 16),
    glowMaterial
  );
  innerGlow.scale.set(0.8, 1.1, 0.5);
  group.add(innerGlow);

  // Add subtle wireframe overlay
  const wireframeMaterial = new THREE.MeshBasicMaterial({
    color: 0x00e5ff,
    wireframe: true,
    transparent: true,
    opacity: 0.1
  });
  const wireframeTorso = new THREE.Mesh(
    torsoGeometry.clone(),
    wireframeMaterial
  );
  wireframeTorso.scale.set(1.01, 1.01, 1.01);
  group.add(wireframeTorso);

  // Position the whole group
  group.position.y = -0.5;

  return group;
}