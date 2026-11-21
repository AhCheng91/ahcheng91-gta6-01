// AI traffic: lane routes, legal speeds, spacing, signal stops, parking and driver silhouettes.

import * as THREE from 'three';
import { Vehicle } from '../entities/vehicle.js';
import { PARKING_LOTS, SPAWN_POINTS, isBuildingFootprint, coastalLimit } from './cityLayout.js';
import { randomRoute, junctionSignal, nearestRoadPoint } from './roadNetwork.js';

function seededRandom(seed) {
  let value = seed >>> 0;
  return function next() {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

const TRAFFIC_TYPES = ['sedan', 'van', 'pickup', 'lowrider', 'sedan', 'scooter', 'van', 'sedan'];
const SHIRTS = ['#2c4650', '#6d4b45', '#4b6554', '#8a6a43', '#3b3f59', '#75515c', '#3d716c'];
const SKINS = ['#c98c62', '#8f5f45', '#e0b18a', '#6e4936', '#d89c72'];

function addPart(group, geometry, material, x, y, z) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

// A tiny occupied silhouette, visible through the cabin glass of every AI car.
function buildDriver(rand) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: SHIRTS[Math.floor(rand() * SHIRTS.length)], roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: SKINS[Math.floor(rand() * SKINS.length)], roughness: 0.9 });
  const hair = new THREE.MeshStandardMaterial({ color: '#241d1c', roughness: 1 });
  const body = new THREE.BoxGeometry(0.48, 0.62, 0.36);
  const head = new THREE.BoxGeometry(0.3, 0.32, 0.3);
  const arm = new THREE.BoxGeometry(0.15, 0.46, 0.16);
  addPart(group, body, shirt, -0.42, 1.38, -0.12);
  addPart(group, head, skin, -0.42, 1.84, -0.1);
  addPart(group, new THREE.BoxGeometry(0.34, 0.12, 0.34), hair, -0.42, 2.01, -0.1);
  addPart(group, arm, skin, -0.64, 1.37, 0.16).rotation.x = -0.9;
  addPart(group, arm, skin, -0.2, 1.37, 0.16).rotation.x = -0.9;
  group.name = 'Driver';
  return group;
}

function wrapAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

export class TrafficSystem {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.rand = seededRandom((options.seed ?? 1) * 7919 + 4831);
    this.onScreech = options.onScreech ?? (() => {});
    this.onHorn = options.onHorn ?? (() => {});
    this.vehicles = [];
    this.moving = [];
    this.parked = [];
    this.time = 0;
  }

  populate(movingCount = 44) {
    for (const lot of PARKING_LOTS) {
      const vehicle = this.createCar({
        type: lot.type,
        x: lot.x,
        z: lot.z,
        heading: lot.heading,
        colour: lot.colour,
        parked: true,
        hero: lot.hero,
      });
      vehicle.aiControlled = false;
      this.parked.push(vehicle);
    }
    const center = SPAWN_POINTS.onFoot;
    for (let i = 0; i < movingCount; i += 1) {
      const type = TRAFFIC_TYPES[Math.floor(this.rand() * TRAFFIC_TYPES.length)];
      const vehicle = this.createCar({ type, x: center.x, z: center.z });
      this.resetMoving(vehicle, center, 25 + i * 3.2, 165);
      this.moving.push(vehicle);
    }
    return this;
  }

  createCar(spec) {
    const vehicle = new Vehicle(spec);
    vehicle.driver = buildDriver(this.rand);
    vehicle.mesh.add(vehicle.driver);
    vehicle.mesh.traverse((object) => {
      if (!object.isMesh || object.name === 'Contact shadow') return;
      object.castShadow = false;
      object.receiveShadow = false;
    });
    vehicle.body.castShadow = true;
    for (const wheel of vehicle.wheels) wheel.traverse((part) => { if (part.isMesh) part.castShadow = true; });
    vehicle.aiControlled = Boolean(spec.parked) === false;
    vehicle.aiSeed = this.rand() * 10;
    this.scene.add(vehicle.mesh);
    this.vehicles.push(vehicle);
    return vehicle;
  }

  resetMoving(vehicle, near, minDistance = 70, maxDistance = 170) {
    const distance = minDistance + this.rand() * Math.max(1, maxDistance - minDistance);
    const angle = this.rand() * Math.PI * 2;
    const anchor = { x: near.x + Math.cos(angle) * distance, z: near.z + Math.sin(angle) * distance };
    const route = randomRoute(this.rand, anchor, { minDistance: 6, legs: 4 + Math.floor(this.rand() * 3) });
    vehicle.position.set(route.start.x, 0, route.start.z);
    vehicle.heading = route.heading;
    vehicle.speed = 7 + this.rand() * 8;
    vehicle.health = 100;
    vehicle.ai = {
      route,
      index: Math.min(1, route.points.length - 1),
      junctionIndex: 0,
      cruise: (vehicle.type === 'scooter' ? 9 : 12) + this.rand() * 7,
      stopUntil: 0,
    };
    vehicle.aiControlled = true;
    vehicle.mesh.position.copy(vehicle.position);
    vehicle.mesh.rotation.y = vehicle.heading;
    if (vehicle.driver) vehicle.driver.visible = true;
  }

  routeFromCurrentPosition(vehicle, near) {
    const route = randomRoute(this.rand, near, { minDistance: 14, legs: 4 });
    route.points.unshift({ x: vehicle.position.x, z: vehicle.position.z });
    const first = route.points[0];
    const second = route.points[1];
    route.heading = Math.atan2(second.x - first.x, second.z - first.z);
    vehicle.ai = {
      route,
      index: 1,
      junctionIndex: 0,
      cruise: 10 + this.rand() * 7,
      stopUntil: 0,
    };
    vehicle.heading = route.heading;
    vehicle.aiControlled = true;
    vehicle.parked = false;
    if (vehicle.driver) vehicle.driver.visible = true;
  }

  gapAhead(vehicle) {
    const forwardX = Math.sin(vehicle.heading);
    const forwardZ = Math.cos(vehicle.heading);
    let nearest = 90;
    for (const other of this.moving) {
      if (other === vehicle || !other.aiControlled) continue;
      const dx = other.position.x - vehicle.position.x;
      const dz = other.position.z - vehicle.position.z;
      const along = dx * forwardX + dz * forwardZ;
      if (along <= 0 || along >= nearest) continue;
      const lateral = Math.abs(dx * forwardZ - dz * forwardX);
      if (lateral < 2.5) nearest = Math.min(nearest, along - (other.spec.length + vehicle.spec.length) * 0.5);
    }
    return nearest;
  }

  update(dt, playerPosition, options = {}) {
    this.time += dt;
    const playerVehicle = options.playerVehicle ?? null;
    for (const vehicle of this.parked) {
      vehicle.update(dt);
      const fromPlayer = Math.hypot(vehicle.position.x - playerPosition.x, vehicle.position.z - playerPosition.z);
      vehicle.mesh.visible = fromPlayer < 205;
    }

    for (const vehicle of this.moving) {
      const distanceFromPlayer = Math.hypot(vehicle.position.x - playerPosition.x, vehicle.position.z - playerPosition.z);
      vehicle.mesh.visible = distanceFromPlayer < 225;
      if (!vehicle.aiControlled || vehicle === playerVehicle) {
        vehicle.update(dt);
        continue;
      }
      const ai = vehicle.ai;
      if (!ai || !ai.route.points[ai.index]) {
        this.resetMoving(vehicle, playerPosition, 75, 165);
        continue;
      }
      const target = ai.route.points[ai.index];
      const dx = target.x - vehicle.position.x;
      const dz = target.z - vehicle.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 5.5) {
        ai.index += 1;
        if (ai.index >= ai.route.points.length) {
          this.resetMoving(vehicle, playerPosition, 80, 170);
          continue;
        }
      }

      const desiredHeading = Math.atan2(dx, dz);
      const difference = wrapAngle(desiredHeading - vehicle.heading);
      vehicle.heading += Math.max(-dt * 1.9, Math.min(dt * 1.9, difference));

      let desiredSpeed = ai.cruise;
      const gap = this.gapAhead(vehicle);
      if (gap < 18) desiredSpeed = Math.min(desiredSpeed, Math.max(0, (gap - 3.5) * 2.4));
      if (Math.abs(difference) > 0.6) desiredSpeed = Math.min(desiredSpeed, 8);

      const junction = ai.route.junctions[ai.junctionIndex];
      if (junction) {
        const toJunctionX = junction.x - vehicle.position.x;
        const toJunctionZ = junction.z - vehicle.position.z;
        const along = toJunctionX * Math.sin(vehicle.heading) + toJunctionZ * Math.cos(vehicle.heading);
        if (along > -3 && along < 18 && junctionSignal(junction.id, this.time)) {
          desiredSpeed = Math.min(desiredSpeed, along < 8 ? 0 : 4);
        }
        if (along < -4) ai.junctionIndex += 1;
      }
      if (this.time < ai.stopUntil) desiredSpeed = 0;

      const previousSpeed = vehicle.speed;
      const rate = (desiredSpeed > vehicle.speed ? vehicle.spec.accel : vehicle.spec.brake) * 0.75;
      vehicle.speed += Math.max(-rate * dt, Math.min(rate * dt, desiredSpeed - vehicle.speed));
      if (previousSpeed - vehicle.speed > 8 * dt && vehicle.speed < 9 && previousSpeed > 12) {
        this.onScreech(vehicle.position, vehicle);
        ai.stopUntil = this.time + 0.35;
      }

      const travel = Math.max(0, vehicle.speed) * dt;
      const nextX = vehicle.position.x + Math.sin(vehicle.heading) * travel;
      const nextZ = vehicle.position.z + Math.cos(vehicle.heading) * travel;
      const coast = coastalLimit(nextX);
      if (nextZ < coast || Math.abs(nextX) > 356 || nextZ > 348 || isBuildingFootprint(nextX, nextZ, 0.5)) {
        vehicle.speed *= 0.2;
        this.resetMoving(vehicle, playerPosition, 70, 160);
        continue;
      }
      vehicle.position.set(nextX, 0, nextZ);
      vehicle.braking = desiredSpeed < previousSpeed - 1;
      if (vehicle.driver) vehicle.driver.rotation.y = Math.sin(this.time * 0.7 + vehicle.aiSeed) * 0.12;
      vehicle.update(dt);

      const fromPlayer = Math.hypot(vehicle.position.x - playerPosition.x, vehicle.position.z - playerPosition.z);
      if (fromPlayer > 240 || vehicle.health <= 0) this.resetMoving(vehicle, playerPosition, 80, 170);
    }
  }

  steal(vehicle) {
    if (!vehicle) return;
    vehicle.aiControlled = false;
    vehicle.parked = false;
    vehicle.speed = 0;
    if (vehicle.driver) vehicle.driver.visible = false;
    if (this.moving.includes(vehicle)) vehicle.ai.stopUntil = this.time + 0.01;
  }

  release(vehicle, playerPosition) {
    if (!vehicle) return;
    if (this.moving.includes(vehicle)) {
      this.routeFromCurrentPosition(vehicle, playerPosition);
    } else {
      this.moving.push(vehicle);
      this.parked = this.parked.filter((item) => item !== vehicle);
      this.routeFromCurrentPosition(vehicle, playerPosition);
    }
  }

  hornNear(position, radius = 16) {
    for (const vehicle of this.moving) {
      if (Math.hypot(vehicle.position.x - position.x, vehicle.position.z - position.z) < radius) vehicle.horn();
    }
    this.onHorn(position);
  }

  countNearby(position, radius) {
    let count = 0;
    for (const vehicle of this.vehicles) {
      if (Math.hypot(vehicle.position.x - position.x, vehicle.position.z - position.z) <= radius) count += 1;
    }
    return count;
  }

  nearestRoadHeading(vehicle) {
    return nearestRoadPoint(vehicle.position.x, vehicle.position.z).heading;
  }
}
