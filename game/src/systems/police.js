// PMPD response: cruiser pursuit, roadblocks, helicopter spotlight, foot officers, arrests.

import * as THREE from 'three';
import { Vehicle } from '../entities/vehicle.js';
import { buildVehicleMesh } from '../world/vehicleFleet.js';
import { nearestRoadPoint, randomRoute } from '../world/roadNetwork.js';

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function angleDiff(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }

function makeTorsoGeometry(width = 0.42, height = 0.55, depth = 0.26) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const t = (position.getY(i) + height / 2) / height;
    const taper = 0.86 + 0.14 * t;
    position.setX(i, position.getX(i) * taper);
    position.setZ(i, position.getZ(i) * taper);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function makeOfficerEyes(material, y, z) {
  const geometry = new THREE.PlaneGeometry(0.044, 0.032);
  const positions = [];
  const indices = [];
  for (const side of [-1, 1]) {
    const eye = geometry.clone();
    eye.translate(side * 0.062, y, z);
    const eyePosition = eye.attributes.position;
    const offset = positions.length / 3;
    for (let i = 0; i < eyePosition.count; i += 1) positions.push(eyePosition.getX(i), eyePosition.getY(i), eyePosition.getZ(i));
    for (let i = 0; i < eye.index.count; i += 1) indices.push(eye.index.getX(i) + offset);
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setIndex(indices);
  return new THREE.Mesh(merged, material);
}

function makeOfficerMesh() {
  const g = new THREE.Group();
  const navy = new THREE.MeshStandardMaterial({ color: '#2c4160', roughness: 0.86 });
  const navyDark = new THREE.MeshStandardMaterial({ color: '#1d2b3d', roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: '#c58d68', roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: '#161d26', roughness: 0.9 });
  const white = new THREE.MeshStandardMaterial({ color: '#eceade', roughness: 0.8 });
  const hiVis = new THREE.MeshStandardMaterial({ color: '#d7e24a', roughness: 0.7 });
  const steel = new THREE.MeshStandardMaterial({ color: '#3a4448', metalness: 0.5, roughness: 0.4 });
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: '#15100f' });

  const addPart = (parent, geometry, material, x, y, z) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  addPart(g, makeTorsoGeometry(), navy, 0, 1.23, 0);
  addPart(g, new THREE.BoxGeometry(0.35, 0.1, 0.27), navyDark, 0, 0.99, 0);
  addPart(g, new THREE.BoxGeometry(0.43, 0.08, 0.28), dark, 0, 1.48, 0);
  addPart(g, new THREE.BoxGeometry(0.44, 0.075, 0.285), hiVis, 0, 1.16, 0);
  addPart(g, new THREE.BoxGeometry(0.44, 0.075, 0.285), hiVis, 0, 1.31, 0);
  addPart(g, new THREE.BoxGeometry(0.36, 0.18, 0.24), navyDark, 0, 0.86, 0);
  addPart(g, new THREE.BoxGeometry(0.09, 0.06, 0.09), skin, 0, 1.54, 0);
  addPart(g, new THREE.BoxGeometry(0.28, 0.3, 0.28), skin, 0, 1.71, 0);
  addPart(g, new THREE.BoxGeometry(0.3, 0.09, 0.3), dark, 0, 1.89, -0.005);
  addPart(g, new THREE.BoxGeometry(0.31, 0.045, 0.31), white, 0, 1.855, -0.005);
  addPart(g, new THREE.BoxGeometry(0.31, 0.03, 0.15), dark, 0, 1.845, 0.15);
  g.add(makeOfficerEyes(eyeMaterial, 1.72, 0.141));

  const legs = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.11, 0.85, 0);
    addPart(pivot, new THREE.BoxGeometry(0.13, 0.78, 0.15), navyDark, 0, -0.39, 0);
    addPart(pivot, new THREE.BoxGeometry(0.13, 0.1, 0.24), dark, 0, -0.76, 0.04);
    g.add(pivot);
    legs.push(pivot);
  }
  const arms = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.255, 1.44, 0);
    addPart(pivot, new THREE.BoxGeometry(0.1, 0.3, 0.11), navy, 0, -0.15, 0);
    addPart(pivot, new THREE.BoxGeometry(0.085, 0.28, 0.095), skin, 0, -0.44, 0);
    addPart(pivot, new THREE.BoxGeometry(0.09, 0.09, 0.09), skin, 0, -0.6, 0);
    g.add(pivot);
    arms.push(pivot);
  }

  const gun = new THREE.Group();
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.34), steel);
  gun.add(slide);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.1), steel);
  grip.position.set(0, -0.13, -0.1);
  gun.add(grip);
  gun.position.set(0, -0.58, 0.08);
  gun.rotation.x = 1.5;
  arms[1].add(gun);

  g.userData.legs = legs;
  g.userData.arms = arms;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

function makeHelicopterMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 5.2), new THREE.MeshStandardMaterial({ color: '#3b5160', roughness: 0.6, metalness: 0.2 }));
  body.position.y = 0; g.add(body);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 3.2), new THREE.MeshStandardMaterial({ color: '#344652', roughness: 0.65 }));
  tail.position.set(0, 0.1, -3.6); g.add(tail);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.06, 0.5), new THREE.MeshStandardMaterial({ color: '#222a30', roughness: 0.8 }));
  rotor.position.y = 0.9; g.add(rotor);
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.6, 0.15), new THREE.MeshStandardMaterial({ color: '#222a30', roughness: 0.8 }));
  tailRotor.position.set(0.35, 0.2, -5.1); g.add(tailRotor);
  const skidMat = new THREE.MeshStandardMaterial({ color: '#20282e', roughness: 0.9 });
  for (const s of [-1, 1]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 4.2), skidMat);
    skid.position.set(s * 0.9, -0.9, 0); g.add(skid);
  }
  const red = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: '#ff2e2e' }));
  red.position.set(0, -0.2, 2.5); g.add(red);
  g.userData.rotor = rotor;
  g.userData.tailRotor = tailRotor;
  g.userData.red = red;
  return g;
}

export class PoliceSystem {
  constructor(scene, traffic, options = {}) {
    this.scene = scene;
    this.traffic = traffic;
    this.rand = options.rand ?? Math.random;
    this.onArrest = options.onArrest ?? (() => {});
    this.onDispatchChange = options.onDispatchChange ?? (() => {});
    this.units = [];
    this.cooldowns = { cruiser: 0, roadblock: 0, heli: 0, foot: 0 };
    this.time = 0;
    this.callsignCounter = 14;
  }

  nextCallsign(prefix = 'PMPD') {
    const n = this.callsignCounter++;
    return `${prefix}-${n}`;
  }

  clear() {
    for (const u of [...this.units]) this.removeUnit(u);
    this.onDispatchChange(this.units);
  }

  removeUnit(unit) {
    this.units = this.units.filter((u) => u !== unit);
    if (unit.vehicle) {
      unit.vehicle.setSiren(false);
      this.traffic?.release?.(unit.vehicle, unit.vehicle.position);
      if (unit.vehicle.mesh?.parent) unit.vehicle.mesh.parent.remove(unit.vehicle.mesh);
      if (this.traffic) this.traffic.vehicles = this.traffic.vehicles.filter((v) => v !== unit.vehicle);
      if (this.traffic) this.traffic.moving = this.traffic.moving.filter((v) => v !== unit.vehicle);
    }
    if (unit.mesh?.parent) unit.mesh.parent.remove(unit.mesh);
    if (unit.spotlight) { this.scene.remove(unit.spotlight); this.scene.remove(unit.spotlight.target); }
    if (unit.spotlightCone?.parent) unit.spotlightCone.parent.remove(unit.spotlightCone);
  }

  dispatch(stars, playerPos) {
    if (stars <= 0) { this.clear(); return; }
    const desiredCruisers = clamp(1 + stars, 1, 5);
    const cruisers = this.units.filter((u) => u.kind === 'CRUISER' && !u.dead);
    for (let i = cruisers.length; i < desiredCruisers; i += 1) this.spawnCruiser(playerPos, stars);
    if (stars >= 3) this.ensureRoadblock(playerPos, stars);
    if (stars >= 3) this.ensureHelicopter(playerPos);
    this.onDispatchChange(this.units);
  }

  spawnCruiser(playerPos, stars) {
    if (this.units.filter((u) => u.kind === 'CRUISER' && !u.dead).length >= 6) return null;
    const anchor = this.spawnAnchor(playerPos, 90, 150);
    const route = randomRoute(this.rand, anchor, { minDistance: 8, legs: 3 });
    const type = this.rand() < 0.65 ? 'interceptor' : 'tarpon';
    const vehicle = new Vehicle({ type, x: route.start.x, z: route.start.z, heading: route.heading, colour: '#e8e9e4' });
    vehicle.aiControlled = false;
    vehicle.setSiren(true);
    vehicle.speed = 12;
    vehicle.mesh.traverse((o) => { if (o.isMesh) { o.castShadow = false; } });
    this.scene.add(vehicle.mesh);
    this.traffic.vehicles.push(vehicle);
    this.traffic.moving.push(vehicle);
    const unit = {
      callsign: this.nextCallsign(),
      kind: 'CRUISER',
      type,
      vehicle,
      position: vehicle.position,
      distance: 0,
      tactic: 'PURSUIT',
      health: 90,
      dead: false,
      siren: true,
      targetOffset: (this.rand() - 0.5) * 8,
      stuck: 0,
      route,
      routeIndex: 1,
    };
    this.units.push(unit);
    return unit;
  }

  spawnAnchor(playerPos, minD, maxD) {
    const angle = this.rand() * Math.PI * 2;
    const d = minD + this.rand() * (maxD - minD);
    return { x: playerPos.x + Math.cos(angle) * d, z: playerPos.z + Math.sin(angle) * d };
  }

  ensureHelicopter(playerPos) {
    if (this.units.some((u) => u.kind === 'HELICOPTER' && !u.dead)) return;
    const mesh = makeHelicopterMesh();
    mesh.position.set(playerPos.x + 40, 28, playerPos.z - 40);
    this.scene.add(mesh);
    const spotlight = new THREE.SpotLight('#fff0cc', 0, 120, Math.PI / 7, 0.35, 1.2);
    spotlight.position.copy(mesh.position);
    spotlight.target.position.set(playerPos.x, 0, playerPos.z);
    this.scene.add(spotlight);
    this.scene.add(spotlight.target);
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(8, 28, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: '#fff4cf', transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    cone.position.copy(mesh.position);
    this.scene.add(cone);
    const unit = {
      callsign: 'GAVIOTA-1',
      kind: 'HELICOPTER',
      vehicle: null,
      mesh,
      position: mesh.position,
      distance: 0,
      tactic: 'SPOTLIGHT',
      health: 200,
      dead: false,
      spotlight,
      spotlightCone: cone,
      angle: 0,
      radius: 45,
    };
    this.units.push(unit);
  }

  ensureRoadblock(playerPos, stars) {
    if (this.cooldowns.roadblock > 0) return;
    const blocks = this.units.filter((u) => u.kind === 'ROADBLOCK' && !u.dead);
    if (blocks.length >= 2) return;
    this.cooldowns.roadblock = 18 - stars;
    const road = nearestRoadPoint(playerPos.x, playerPos.z).road;
    if (!road) return;
    const axisIsX = road.axis === 'x';
    const forward = this.lastPlayerDir ?? { x: 1, z: 0 };
    const along = axisIsX ? playerPos.x : playerPos.z;
    const dirSign = (axisIsX ? forward.x : forward.z) >= 0 ? 1 : -1;
    const center = along + dirSign * (55 + this.rand() * 25);
    const baseX = axisIsX ? center : road.at;
    const baseZ = axisIsX ? road.at : center;
    const perpX = axisIsX ? 0 : 1;
    const perpZ = axisIsX ? 1 : 0;
    for (let i = -1; i <= 1; i += 1) {
      if (this.units.filter((u) => !u.dead).length >= 7) break;
      const offset = i * 4.2;
      const x = baseX + perpX * offset;
      const z = baseZ + perpZ * offset;
      const heading = axisIsX ? (dirSign > 0 ? -Math.PI / 2 : Math.PI / 2) : (dirSign > 0 ? Math.PI : 0);
      const vehicle = new Vehicle({ type: 'interceptor', x, z, heading, colour: '#e8e9e4' });
      vehicle.aiControlled = false;
      vehicle.setSiren(true);
      vehicle.speed = 0;
      this.scene.add(vehicle.mesh);
      this.traffic.vehicles.push(vehicle);
      this.traffic.moving.push(vehicle);
      const unit = {
        callsign: this.nextCallsign('BLOCK'),
        kind: 'ROADBLOCK',
        vehicle,
        position: vehicle.position,
        distance: 0,
        tactic: 'ROADBLOCK',
        health: 100,
        dead: false,
        ttl: 30,
      };
      this.units.push(unit);
      // foot officers behind doors
      for (const side of [-1, 1]) {
        this.spawnFootOfficer({ x: x + perpX * side * 3.2 - (axisIsX ? 0 : dirSign * 2), z: z + perpZ * side * 3.2 - (axisIsX ? dirSign * 2 : 0) }, true);
      }
    }
  }

  spawnFootOfficer(pos, staticGuard = false) {
    if (this.units.filter((u) => u.kind === 'FOOT' && !u.dead).length >= 4) return null;
    const mesh = makeOfficerMesh();
    mesh.position.set(pos.x, 0, pos.z);
    this.scene.add(mesh);
    const unit = {
      callsign: this.nextCallsign('UNIT'),
      kind: 'FOOT',
      mesh,
      position: mesh.position,
      distance: 0,
      tactic: staticGuard ? 'ROADBLOCK' : 'FOOT CHASE',
      health: 55,
      dead: false,
      speed: 0,
      fireCooldown: 1 + this.rand() * 1.5,
      staticGuard,
      guardTimer: staticGuard ? 12 : 0,
    };
    this.units.push(unit);
    return unit;
  }

  update(dt, context) {
    this.time += dt;
    this.cooldowns.cruiser = Math.max(0, this.cooldowns.cruiser - dt);
    this.cooldowns.roadblock = Math.max(0, this.cooldowns.roadblock - dt);
    const { player, playerPos, wantedStars, playerOnFoot, playerInVehicle } = context;
    if (playerPos && this.prevPlayerPos) {
      const dx = playerPos.x - this.prevPlayerPos.x;
      const dz = playerPos.z - this.prevPlayerPos.z;
      const len = Math.hypot(dx, dz);
      if (len > 0.01) this.lastPlayerDir = { x: dx / len, z: dz / len };
    }
    this.prevPlayerPos = playerPos ? { x: playerPos.x, z: playerPos.z } : this.prevPlayerPos;

    if (wantedStars > 0) this.dispatch(wantedStars, playerPos);

    for (let i = this.units.length - 1; i >= 0; i -= 1) {
      const unit = this.units[i];
      if (unit.dead) {
        unit.deathTimer = (unit.deathTimer ?? 8) - dt;
        if (unit.deathTimer <= 0) this.removeUnit(unit);
        continue;
      }
      const p = unit.position ?? unit.vehicle?.position ?? unit.mesh?.position;
      unit.distance = p && playerPos ? Math.hypot(p.x - playerPos.x, p.z - playerPos.z) : 9999;

      if (unit.kind === 'CRUISER') this.updateCruiser(unit, dt, context);
      else if (unit.kind === 'ROADBLOCK') this.updateRoadblock(unit, dt, context);
      else if (unit.kind === 'HELICOPTER') this.updateHelicopter(unit, dt, context);
      else if (unit.kind === 'FOOT') this.updateFoot(unit, dt, context);

      if (unit.distance > 320 && unit.kind !== 'HELICOPTER') {
        this.removeUnit(unit);
      }
    }

    // bust check
    if (wantedStars > 0 && playerOnFoot && player && !context.playerShooting) {
      for (const unit of this.units) {
        if (unit.dead) continue;
        if ((unit.kind === 'FOOT' || unit.kind === 'CRUISER' || unit.kind === 'ROADBLOCK') && unit.distance < 2.4) {
          this.onArrest(unit);
          break;
        }
      }
    }

    this.onDispatchChange(this.units.filter((u) => !u.dead));
  }

  updateCruiser(unit, dt, context) {
    const vehicle = unit.vehicle;
    const playerPos = context.playerPos;
    if (!vehicle || !playerPos) return;
    const toPlayerX = playerPos.x - vehicle.position.x;
    const toPlayerZ = playerPos.z - vehicle.position.z;
    const dist = Math.hypot(toPlayerX, toPlayerZ);
    const desiredHeading = Math.atan2(toPlayerX, toPlayerZ);
    const diff = angleDiff(desiredHeading, vehicle.heading);
    const steer = clamp(diff * 1.8, -1, 1);
    let throttle = 0.75;
    let tactic = 'PURSUIT';

    if (dist < 16 && Math.abs(diff) < 0.35) { throttle = 1; tactic = 'RAMMING'; }
    if (dist < 8 && Math.abs(diff) > 0.7 && Math.abs(diff) < 1.8) { tactic = 'PIT'; throttle = 0.95; steer = clamp(diff * 2.4, -1, 1); }
    if (dist < 5 && context.playerSpeed < 3) { throttle = 0.2; tactic = 'IN PURSUIT'; }
    if (context.playerOnFoot && dist < 10) { throttle = 0.1; tactic = 'FOOT CHASE'; this.maybeDisgorge(unit, context); }

    unit.tactic = tactic;
    vehicle.drive({ throttle, steer, handbrake: dist < 4 && context.playerSpeed < 1 }, dt);
    vehicle.setSiren(true);
    vehicle.update(dt);
    unit.position = vehicle.position;

    // stuck detection
    if (vehicle.speed < 1) unit.stuck += dt; else unit.stuck = 0;
    if (unit.stuck > 4) {
      vehicle.heading += Math.PI * 0.5;
      vehicle.speed = 4;
      unit.stuck = 0;
    }
  }

  maybeDisgorge(unit, context) {
    if (unit.dismounted) return;
    if (this.units.filter((u) => u.kind === 'FOOT' && !u.dead).length >= 4) return;
    unit.dismounted = true;
    for (const side of [-1, 1]) {
      this.spawnFootOfficer({ x: unit.vehicle.position.x + side * 2.2, z: unit.vehicle.position.z + 2.2 }, false);
    }
  }

  updateRoadblock(unit, dt, context) {
    unit.ttl -= dt;
    const vehicle = unit.vehicle;
    vehicle.speed *= Math.exp(-4 * dt);
    vehicle.update(dt);
    unit.position = vehicle.position;
    if (unit.ttl <= 0 && unit.distance > 80) this.removeUnit(unit);
  }

  updateHelicopter(unit, dt, context) {
    const playerPos = context.playerPos;
    if (!playerPos) return;
    unit.angle += dt * 0.45;
    const r = unit.radius;
    const tx = playerPos.x + Math.cos(unit.angle) * r;
    const tz = playerPos.z + Math.sin(unit.angle) * r;
    const ty = 26 + Math.sin(this.time * 0.7) * 2;
    unit.mesh.position.x += (tx - unit.mesh.position.x) * Math.min(1, dt * 1.5);
    unit.mesh.position.z += (tz - unit.mesh.position.z) * Math.min(1, dt * 1.5);
    unit.mesh.position.y += (ty - unit.mesh.position.y) * Math.min(1, dt * 1.5);
    const lookAngle = Math.atan2(playerPos.x - unit.mesh.position.x, playerPos.z - unit.mesh.position.z);
    unit.mesh.rotation.y = lookAngle;
    unit.mesh.userData.rotor.rotation.y += dt * 18;
    unit.mesh.userData.tailRotor.rotation.x += dt * 22;
    unit.mesh.userData.red.visible = Math.floor(this.time * 4) % 2 === 0;
    unit.position = unit.mesh.position;
    unit.distance = Math.hypot(playerPos.x - unit.mesh.position.x, playerPos.z - unit.mesh.position.z);
    unit.tactic = 'SPOTLIGHT';

    unit.spotlight.position.copy(unit.mesh.position);
    unit.spotlight.target.position.set(playerPos.x, 0.5, playerPos.z);
    unit.spotlight.intensity = 18;
    unit.spotlightCone.position.copy(unit.mesh.position);
    unit.spotlightCone.lookAt(playerPos.x, 0, playerPos.z);
    unit.spotlightCone.rotateX(-Math.PI / 2);
    unit.spotlightCone.material.opacity = 0.07 + Math.sin(this.time * 2) * 0.015;
  }

  updateFoot(unit, dt, context) {
    const playerPos = context.playerPos;
    if (!playerPos) return;
    unit.guardTimer = Math.max(0, (unit.guardTimer ?? 0) - dt);
    const toX = playerPos.x - unit.position.x;
    const toZ = playerPos.z - unit.position.z;
    const dist = Math.hypot(toX, toZ) || 1;
    if (!unit.staticGuard || unit.guardTimer <= 0) {
      const speed = context.playerOnFoot ? 4.8 : 3.6;
      unit.position.x += (toX / dist) * speed * dt;
      unit.position.z += (toZ / dist) * speed * dt;
      unit.mesh.rotation.y = Math.atan2(toX, toZ);
      const legs = unit.mesh.userData.legs ?? [];
      const swing = Math.sin(this.time * 8 + unit.position.x) * 0.6;
      if (legs[0]) legs[0].rotation.x = swing;
      if (legs[1]) legs[1].rotation.x = -swing;
      unit.tactic = 'FOOT CHASE';
    } else {
      unit.mesh.rotation.y = Math.atan2(toX, toZ);
      unit.tactic = 'ROADBLOCK';
    }

    // simple firing
    unit.fireCooldown -= dt;
    if (dist < 35 && dist > 4 && unit.fireCooldown <= 0 && context.wantedStars >= 2) {
      unit.fireCooldown = 1.3 + this.rand() * 1.1;
      if (context.onPoliceShot) context.onPoliceShot(unit, playerPos);
    }
  }

  getHudUnits() {
    return this.units.filter((u) => !u.dead).map((u) => ({
      callsign: u.callsign,
      kind: u.kind,
      distance: Math.round(u.distance),
      tactic: u.tactic,
    }));
  }
}
