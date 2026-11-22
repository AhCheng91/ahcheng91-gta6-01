// The vehicle catalogue and the box-built low-poly car models used across Puerto Marea.

import * as THREE from 'three';
import { makeContactShadow } from '../core/engine.js';

export const VEHICLE_TYPES = {
  sprint: { name: 'Calyx Sprint GT', className: 'SPORTS', length: 4.5, width: 2.05, accel: 15, brake: 26, maxSpeed: 48, handling: 2.2, colour: '#ff6d55', cabin: 0.6 },
  sedan: { name: 'Dorado 88', className: 'SEDAN', length: 4.4, width: 1.95, accel: 10, brake: 22, maxSpeed: 34, handling: 1.8, colour: '#dcd8cc', cabin: 0.72 },
  van: { name: 'Marisma Van', className: 'VAN', length: 5.2, width: 2.15, accel: 8, brake: 19, maxSpeed: 29, handling: 1.5, colour: '#c6cbc4', cabin: 0.95 },
  pickup: { name: 'Punta Pickup', className: 'PICKUP', length: 5, width: 2.1, accel: 10, brake: 21, maxSpeed: 33, handling: 1.6, colour: '#b96b4d', cabin: 0.74 },
  lowrider: { name: 'Cangrejo Lowrider', className: 'LOW RIDER', length: 4.7, width: 2, accel: 11, brake: 22, maxSpeed: 31, handling: 2, colour: '#8e5f88', cabin: 0.68 },
  scooter: { name: 'Avispa Scooter', className: 'SCOOTER', length: 2.3, width: 0.95, accel: 9, brake: 18, maxSpeed: 26, handling: 2.6, colour: '#e6d16b', cabin: 0.45 },
  interceptor: { name: 'PMPD Interceptor', className: 'POLICE', length: 4.8, width: 2.05, accel: 14, brake: 25, maxSpeed: 44, handling: 2.1, colour: '#e8e9e4', cabin: 0.68, police: true },
  tarpon: { name: 'PMPD Tarpón', className: 'POLICE', length: 5.1, width: 2.15, accel: 11, brake: 23, maxSpeed: 36, handling: 1.8, colour: '#dfe3df', cabin: 0.82, police: true },
};

export function vehicleSpec(typeId) {
  return VEHICLE_TYPES[typeId] ?? VEHICLE_TYPES.sedan;
}

function addBox(group, width, height, depth, x, y, z, material, castShadow = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addWheel(group, x, y, z, radius) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  const rubber = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.28, 12), new THREE.MeshStandardMaterial({ color: '#1b2024', roughness: 0.95 }));
  rubber.rotation.z = Math.PI / 2;
  rubber.castShadow = true;
  rubber.receiveShadow = true;
  pivot.add(rubber);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.5, radius * 0.5, 0.3, 10), new THREE.MeshStandardMaterial({ color: '#9aa5a4', metalness: 0.6, roughness: 0.4 }));
  hub.rotation.z = Math.PI / 2;
  hub.castShadow = true;
  hub.receiveShadow = true;
  pivot.add(hub);
  group.add(pivot);
  return pivot;
}

export function buildVehicleMesh(typeId, colour) {
  const spec = vehicleSpec(typeId);
  const group = new THREE.Group();
  group.name = spec.name;
  const paint = new THREE.MeshPhysicalMaterial({
    color: colour ?? spec.colour, roughness: 0.26, metalness: 0.34,
    clearcoat: 0.8, clearcoatRoughness: 0.16,
  });
  const trim = new THREE.MeshStandardMaterial({ color: spec.police ? '#263946' : '#313a3e', roughness: 0.7 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#193341', roughness: 0.1, metalness: 0.22,
    clearcoat: 1, clearcoatRoughness: 0.06,
  });
  const length = spec.length;
  const width = spec.width;
  const wheelRadius = typeId === 'scooter' ? 0.32 : 0.42;

  addBox(group, width, 0.62, length, 0, 0.68, 0, paint);
  addBox(group, width * 0.96, 0.28, length * 0.32, 0, 1.03, length * 0.31, paint);
  addBox(group, width * 0.86, 0.72 * spec.cabin, length * 0.46, 0, 1.08 + 0.36 * spec.cabin, -length * 0.06, paint);
  addBox(group, width * 0.87, 0.48 * spec.cabin, length * 0.44, 0, 1.12 + 0.36 * spec.cabin, -length * 0.06, glass, false);
  addBox(group, width * 0.84, 0.12, length * 0.42, 0, 1.5 + 0.6 * spec.cabin, -length * 0.06, paint);
  addBox(group, width * 1.03, 0.2, 0.22, 0, 0.48, length / 2, trim);
  addBox(group, width * 1.03, 0.2, 0.22, 0, 0.48, -length / 2, trim);

  const headlights = [];
  const brakeLights = [];
  const headlightCones = [];
  for (const side of [-1, 1]) {
    headlights.push(addBox(group, 0.42, 0.2, 0.1, side * width * 0.32, 0.88, length / 2 + 0.04,
      new THREE.MeshBasicMaterial({ color: '#fff1c9' }), false));
    brakeLights.push(addBox(group, 0.4, 0.18, 0.1, side * width * 0.32, 0.9, -length / 2 - 0.04,
      new THREE.MeshBasicMaterial({ color: '#8c2c24' }), false));
    const cone = new THREE.SpotLight('#fff4d0', 0, 24, Math.PI / 6, 0.45, 1.8);
    cone.position.set(side * width * 0.3, 0.88, length / 2 + 0.1);
    cone.target.position.set(side * width * 0.3, 0.2, length / 2 + 12);
    cone.visible = false;
    group.add(cone);
    group.add(cone.target);
    headlightCones.push(cone);
  }

  const wheelbase = typeId === 'scooter' ? length * 0.36 : length * 0.32;
  const wheels = [
    addWheel(group, -width / 2 - 0.02, wheelRadius, wheelbase, wheelRadius),
    addWheel(group, width / 2 + 0.02, wheelRadius, wheelbase, wheelRadius),
    addWheel(group, -width / 2 - 0.02, wheelRadius, -wheelbase, wheelRadius),
    addWheel(group, width / 2 + 0.02, wheelRadius, -wheelbase, wheelRadius),
  ];
  if (typeId === 'scooter') {
    wheels[0].visible = false;
    wheels[1].visible = false;
  }

  let redLamp = null;
  let blueLamp = null;
  if (spec.police) {
    addBox(group, width * 0.7, 0.16, 0.5, 0, 2.05, -0.1, trim);
    redLamp = addBox(group, 0.65, 0.16, 0.42, -0.4, 2.17, -0.1, new THREE.MeshBasicMaterial({ color: '#ff3540' }), false);
    blueLamp = addBox(group, 0.65, 0.16, 0.42, 0.4, 2.17, -0.1, new THREE.MeshBasicMaterial({ color: '#2e60ff' }), false);
    addBox(group, width * 0.95, 0.25, 0.12, 0, 1.1, length / 2 + 0.12, new THREE.MeshStandardMaterial({ color: '#f0f2e8' }), false);
  }

  const doors = [];
  for (const side of [-1, 1]) {
    const door = addBox(group, 0.08, 0.55, length * 0.28, side * (width / 2 + 0.02), 0.95, 0.05, paint);
    door.userData.flung = false;
    doors.push(door);
  }

  const body = group.children.find((c) => c.isMesh && c.geometry?.parameters?.height === 0.62) ?? group.children[0];
  const shadow = makeContactShadow(width * 0.78);
  shadow.scale.set(1, length / width, 1);
  group.add(shadow);
  return { group, body, headlights, headlightCones, brakeLights, redLamp, blueLamp, wheels, doors };
}

export function colourForTraffic(index) {
  const colours = ['#e6e1d3', '#547d8b', '#bd5341', '#d6a44c', '#3f7469', '#e9cf9c', '#8c5d73', '#c9d3cf'];
  return colours[index % colours.length];
}
