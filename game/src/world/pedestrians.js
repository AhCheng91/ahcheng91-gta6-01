// Sidewalk crowds: walking loops, idle clusters, umbrellas, shopping bags and panic flight.

import * as THREE from 'three';
import { ROADS, isBuildingFootprint, coastalLimit, MARKERS } from './cityLayout.js';

function seededRandom(seed) {
  let value = seed >>> 0;
  return function next() {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

const SKIN_COLORS = ['#c98c62', '#8f5f45', '#e0b18a', '#6e4936', '#d89c72', '#a86b50'];
const SHIRT_COLORS = ['#d96c54', '#3d9b91', '#e7bd72', '#486b8d', '#b45c7d', '#e7dcc0', '#5c8b61', '#73588c'];
const TROUSER_COLORS = ['#2f3d47', '#4c4a55', '#6c5847', '#374f50', '#5b4853'];
const HAIR_COLORS = ['#241d1c', '#3d2b22', '#111820', '#7a4c2e', '#b08a55'];
const UMBRELLA_COLORS = ['#e8664f', '#4fb7aa', '#ebc76a', '#e4ded0', '#9b78ad'];

const BODY_GEOMETRY = new THREE.BoxGeometry(0.52, 0.74, 0.34);
const HEAD_GEOMETRY = new THREE.BoxGeometry(0.32, 0.36, 0.32);
const HAIR_GEOMETRY = new THREE.BoxGeometry(0.36, 0.14, 0.36);
const LIMB_GEOMETRY = new THREE.BoxGeometry(0.16, 0.72, 0.19);
const BAG_GEOMETRY = new THREE.BoxGeometry(0.34, 0.4, 0.14);
const CANOPY_GEOMETRY = new THREE.ConeGeometry(0.85, 0.42, 8);
const POLE_GEOMETRY = new THREE.CylinderGeometry(0.03, 0.03, 1.75, 5);

function materialCache(colors) {
  return colors.map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.88, flatShading: true }));
}

const SKINS = materialCache(SKIN_COLORS);
const SHIRTS = materialCache(SHIRT_COLORS);
const TROUSERS = materialCache(TROUSER_COLORS);
const HAIRS = materialCache(HAIR_COLORS);
const UMBRELLAS = materialCache(UMBRELLA_COLORS);
const POLE_MATERIAL = new THREE.MeshStandardMaterial({ color: '#4d4b48', roughness: 0.6 });

function choose(list, rand) {
  return list[Math.floor(rand() * list.length)];
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function sidewalkPoint(road, along, side) {
  const offset = side * (road.width / 2 + 1.5);
  return road.axis === 'x'
    ? { x: along, z: road.at + offset }
    : { x: road.at + offset, z: along };
}

function roadAlong(road, x, z) {
  return clamp(road.axis === 'x' ? x : z, road.from + 8, road.to - 8);
}

function nearestRoad(rand, near) {
  const choices = ROADS
    .map((road) => ({ road, distance: Math.abs((road.axis === 'x' ? near.z - road.at : near.x - road.at)) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 4);
  return choose(choices, rand).road;
}

function addPart(group, geometry, material, x, y, z) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function buildPedestrianMesh(rand, accessory) {
  const group = new THREE.Group();
  const skin = choose(SKINS, rand);
  const shirt = choose(SHIRTS, rand);
  const trousers = choose(TROUSERS, rand);
  const hair = choose(HAIRS, rand);
  const torso = addPart(group, BODY_GEOMETRY, shirt, 0, 1.32, 0);
  const head = addPart(group, HEAD_GEOMETRY, skin, 0, 1.9, 0);
  addPart(group, HAIR_GEOMETRY, hair, 0, 2.09, -0.01);
  const legs = [
    addPart(group, LIMB_GEOMETRY, trousers, -0.15, 0.4, 0),
    addPart(group, LIMB_GEOMETRY, trousers, 0.15, 0.4, 0),
  ];
  const arms = [
    addPart(group, LIMB_GEOMETRY, skin, -0.37, 1.32, 0),
    addPart(group, LIMB_GEOMETRY, skin, 0.37, 1.32, 0),
  ];
  for (const part of [torso, head, ...legs, ...arms]) part.castShadow = true;

  let canopy = null;
  if (accessory === 'umbrella') {
    canopy = new THREE.Group();
    addPart(canopy, POLE_GEOMETRY, POLE_MATERIAL, 0.4, 2.05, 0.1);
    const cloth = addPart(canopy, CANOPY_GEOMETRY, choose(UMBRELLAS, rand), 0.4, 2.9, 0.1);
    cloth.scale.set(1.1, 1, 1.1);
    group.add(canopy);
  } else if (accessory === 'bags') {
    addPart(group, BAG_GEOMETRY, choose(SHIRTS, rand), -0.5, 0.84, 0.06);
    addPart(group, BAG_GEOMETRY, choose(SHIRTS, rand), 0.5, 0.84, 0.06);
  } else if (accessory === 'hat') {
    addPart(group, new THREE.CylinderGeometry(0.34, 0.34, 0.08, 8), choose(SHIRTS, rand), 0, 2.12, 0);
  }
  group.name = 'Pedestrian';
  return { group, torso, head, legs, arms, canopy };
}

export class PedestrianSystem {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.rand = seededRandom((options.seed ?? 1) * 3121 + 97);
    this.onScream = options.onScream ?? (() => {});
    this.peds = [];
    this.time = 0;
  }

  populate(count = 78, center = { x: -30, z: -22 }) {
    for (let i = 0; i < count; i += 1) {
      const accessory = i % 11 === 0 ? 'umbrella' : i % 7 === 0 ? 'bags' : i % 13 === 0 ? 'hat' : 'none';
      const ped = this.createPed(accessory);
      this.placePed(ped, center, 15 + this.rand() * 92);
      if (i % 9 === 0) this.assignIdleGroup(ped, center);
      this.peds.push(ped);
    }
    return this;
  }

  createPed(accessory) {
    const model = buildPedestrianMesh(this.rand, accessory);
    this.scene.add(model.group);
    return {
      ...model,
      position: new THREE.Vector3(),
      heading: 0,
      speed: 1.1 + this.rand() * 1.3,
      stride: this.rand() * 6,
      mode: 'walk',
      timer: 0,
      accessory,
      road: null,
      along: 0,
      side: 1,
      direction: 1,
      target: null,
      idleCenter: null,
      panicDirection: { x: 0, z: 0 },
      screamDelay: this.rand() * 0.5,
    };
  }

  placePed(ped, near, distance) {
    const angle = this.rand() * Math.PI * 2;
    const anchor = { x: near.x + Math.cos(angle) * distance, z: near.z + Math.sin(angle) * distance };
    const road = nearestRoad(this.rand, anchor);
    const side = this.rand() < 0.5 ? -1 : 1;
    let along = roadAlong(road, anchor.x, anchor.z);
    let point = sidewalkPoint(road, along, side);
    if (point.z < coastalLimit(point.x) || isBuildingFootprint(point.x, point.z, 0.3)) {
      along = clamp(along + (this.rand() - 0.5) * 40, road.from + 8, road.to - 8);
      point = sidewalkPoint(road, along, side);
    }
    ped.road = road;
    ped.along = along;
    ped.side = side;
    ped.direction = this.rand() < 0.5 ? -1 : 1;
    ped.position.set(point.x, 0, point.z);
    ped.mode = 'walk';
    ped.target = null;
    ped.heading = road.axis === 'x'
      ? (ped.direction > 0 ? Math.PI / 2 : -Math.PI / 2)
      : (ped.direction > 0 ? 0 : Math.PI);
    ped.group.position.copy(ped.position);
    ped.group.rotation.y = ped.heading;
    ped.group.visible = true;
  }

  assignIdleGroup(ped, center) {
    const marker = choose(MARKERS, this.rand);
    const useMarker = Math.abs(marker.x - center.x) < 180 && Math.abs(marker.z - center.z) < 140;
    const cx = useMarker ? marker.x + (this.rand() - 0.5) * 12 : center.x + (this.rand() - 0.5) * 50;
    const cz = useMarker ? marker.z + (this.rand() - 0.5) * 10 : center.z + (this.rand() - 0.5) * 50;
    const angle = this.rand() * Math.PI * 2;
    const radius = 1 + this.rand() * 2.8;
    ped.position.set(cx + Math.cos(angle) * radius, 0, cz + Math.sin(angle) * radius);
    ped.mode = 'idle';
    ped.idleCenter = { x: cx, z: cz };
    ped.heading = Math.atan2(cx - ped.position.x, cz - ped.position.z);
    ped.group.position.copy(ped.position);
    ped.group.rotation.y = ped.heading;
    const others = this.peds.filter((other) => other.mode === 'idle' && other.idleCenter
      && Math.hypot(other.idleCenter.x - cx, other.idleCenter.z - cz) < 9).length;
    if (others < 3 && this.rand() < 0.7) {
      const companion = this.createPed('none');
      const companionAngle = angle + 1.8;
      companion.position.set(cx + Math.cos(companionAngle) * radius, 0, cz + Math.sin(companionAngle) * radius);
      companion.mode = 'idle';
      companion.idleCenter = { x: cx, z: cz };
      companion.heading = Math.atan2(cx - companion.position.x, cz - companion.position.z);
      companion.group.position.copy(companion.position);
      companion.group.rotation.y = companion.heading;
      this.peds.push(companion);
    }
  }

  chooseNextTarget(ped) {
    const road = ped.road;
    let along = ped.along + ped.direction * (18 + this.rand() * 30);
    if (along > road.to - 8 || along < road.from + 8) {
      const crossings = ROADS.filter((other) => other.axis !== road.axis
        && Math.abs(other.at - ped.along) < 16
        && other.at > other.from + 10 && other.at < other.to - 10);
      if (crossings.length) {
        const crossing = choose(crossings, this.rand);
        ped.road = crossing;
        ped.along = road.at;
        ped.side = this.rand() < 0.5 ? -1 : 1;
        ped.direction = this.rand() < 0.5 ? -1 : 1;
        along = ped.along + ped.direction * (14 + this.rand() * 24);
      } else {
        ped.direction *= -1;
        along = ped.along + ped.direction * (18 + this.rand() * 26);
      }
    }
    ped.along = clamp(along, ped.road.from + 8, ped.road.to - 8);
    ped.target = sidewalkPoint(ped.road, ped.along, ped.side);
  }

  panicAt(position, radius = 24, kind = 'gunfire') {
    let screams = 0;
    for (const ped of this.peds) {
      const dx = ped.position.x - position.x;
      const dz = ped.position.z - position.z;
      const distance = Math.hypot(dx, dz);
      if (distance > radius || ped.mode === 'panic') continue;
      const inverse = 1 / Math.max(0.5, distance);
      ped.panicDirection = {
        x: dx * inverse + (this.rand() - 0.5) * 0.7,
        z: dz * inverse + (this.rand() - 0.5) * 0.7,
      };
      const length = Math.hypot(ped.panicDirection.x, ped.panicDirection.z) || 1;
      ped.panicDirection.x /= length;
      ped.panicDirection.z /= length;
      ped.mode = 'panic';
      ped.timer = 3.5 + this.rand() * 4;
      ped.target = null;
      if (screams < 3 && this.rand() < 0.75) {
        this.onScream(ped.position, kind);
        screams += 1;
      }
    }
  }

  calmAll() {
    for (const ped of this.peds) {
      if (ped.mode !== 'panic') continue;
      ped.mode = 'walk';
      ped.target = null;
    }
  }

  update(dt, playerPosition) {
    this.time += dt;
    for (const ped of this.peds) {
      const fromPlayer = Math.hypot(ped.position.x - playerPosition.x, ped.position.z - playerPosition.z);
      if (fromPlayer > 205) {
        this.placePed(ped, playerPosition, 35 + this.rand() * 85);
        continue;
      }
      ped.group.visible = true;

      if (ped.mode === 'panic') {
        ped.timer -= dt;
        const speed = 6.2 + this.rand() * 1.6;
        const nextX = ped.position.x + ped.panicDirection.x * speed * dt;
        const nextZ = ped.position.z + ped.panicDirection.z * speed * dt;
        if (isBuildingFootprint(nextX, nextZ, 0.4) || nextZ < coastalLimit(nextX)) {
          ped.panicDirection.x *= -1;
          ped.panicDirection.z *= -1;
        } else {
          ped.position.set(nextX, 0, nextZ);
        }
        ped.heading = Math.atan2(ped.panicDirection.x, ped.panicDirection.z);
        ped.speed = speed;
        if (ped.timer <= 0) {
          ped.mode = 'walk';
          ped.target = null;
          const road = ped.road;
          ped.along = roadAlong(road, ped.position.x, ped.position.z);
        }
      } else if (ped.mode === 'idle') {
        ped.speed = 0;
        ped.heading += Math.sin(this.time * 0.9 + ped.stride) * dt * 0.12;
        if (ped.idleCenter && this.rand() < dt * 0.006) {
          ped.mode = 'walk';
          ped.target = null;
        }
      } else {
        if (!ped.target) this.chooseNextTarget(ped);
        const dx = ped.target.x - ped.position.x;
        const dz = ped.target.z - ped.position.z;
        const distance = Math.hypot(dx, dz);
        if (distance < 1.3) {
          this.chooseNextTarget(ped);
        } else {
          const step = Math.min(distance, ped.speed * dt);
          const nextX = ped.position.x + dx / distance * step;
          const nextZ = ped.position.z + dz / distance * step;
          if (!isBuildingFootprint(nextX, nextZ, 0.3) && nextZ >= coastalLimit(nextX)) ped.position.set(nextX, 0, nextZ);
          else ped.target = null;
          const wanted = Math.atan2(dx, dz);
          let difference = wanted - ped.heading;
          while (difference > Math.PI) difference -= Math.PI * 2;
          while (difference < -Math.PI) difference += Math.PI * 2;
          ped.heading += difference * Math.min(1, dt * 6);
        }
      }

      ped.group.position.copy(ped.position);
      ped.group.rotation.y = ped.heading;
      ped.stride += ped.speed * dt * 3.1;
      const swing = Math.sin(ped.stride) * Math.min(0.72, ped.speed * 0.28);
      ped.legs[0].rotation.x = swing;
      ped.legs[1].rotation.x = -swing;
      if (ped.mode === 'panic') {
        ped.arms[0].rotation.x = -2.2 + Math.sin(ped.stride * 1.5) * 0.2;
        ped.arms[1].rotation.x = -2.2 - Math.sin(ped.stride * 1.5) * 0.2;
      } else {
        ped.arms[0].rotation.x = -swing * 0.8;
        ped.arms[1].rotation.x = swing * 0.8;
      }
      ped.torso.rotation.z = Math.sin(ped.stride) * 0.04;
      if (ped.canopy) ped.canopy.rotation.z = Math.sin(this.time * 1.4 + ped.stride) * 0.06;
      ped.screamDelay = Math.max(0, ped.screamDelay - dt);
    }
  }

  countNearby(position, radius) {
    let count = 0;
    for (const ped of this.peds) {
      if (Math.hypot(ped.position.x - position.x, ped.position.z - position.z) <= radius) count += 1;
    }
    return count;
  }
}
