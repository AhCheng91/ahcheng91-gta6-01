// Rafa on foot: aim, cover, run, jump, vehicle transitions, damage and camera blend state.

import * as THREE from 'three';
import { isBuildingFootprint, coastalLimit } from '../world/cityLayout.js';
import { makeContactShadow } from '../core/engine.js';

function makeMuzzleFlash() {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(16, 16, 1, 16, 16, 15);
  gradient.addColorStop(0, 'rgba(255,255,240,1)');
  gradient.addColorStop(0.35, 'rgba(255,214,130,0.9)');
  gradient.addColorStop(1, 'rgba(255,140,60,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 32, 32);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas), color: '#fff0c8', transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  sprite.scale.set(0.62, 0.62, 1);
  sprite.visible = false;
  return sprite;
}

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

function makeEyes(material, y, z) {
  const geometry = new THREE.PlaneGeometry(0.044, 0.032);
  const merged = new THREE.BufferGeometry();
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
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setIndex(indices);
  return new THREE.Mesh(merged, material);
}

function buildPedestrianMesh() {
  const group = new THREE.Group();
  group.name = 'Rafa Quintero';
  const skin = new THREE.MeshStandardMaterial({ color: '#c98761', roughness: 0.85 });
  const shirt = new THREE.MeshStandardMaterial({ color: '#2f8f8a', roughness: 0.9 });
  const collar = new THREE.MeshStandardMaterial({ color: '#e9d5ae', roughness: 0.9 });
  const trousers = new THREE.MeshStandardMaterial({ color: '#33404f', roughness: 0.95 });
  const hair = new THREE.MeshStandardMaterial({ color: '#2b2424', roughness: 0.95 });
  const steel = new THREE.MeshStandardMaterial({ color: '#38434a', metalness: 0.5, roughness: 0.5 });
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: '#15100f' });

  const addPart = (parent, geometry, material, x, y, z) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const torso = addPart(group, makeTorsoGeometry(), shirt, 0, 1.23, 0);
  const torsoBand = addPart(group, new THREE.BoxGeometry(0.34, 0.1, 0.27), collar, 0, 0.99, 0);
  const collarBand = addPart(group, new THREE.BoxGeometry(0.43, 0.08, 0.28), collar, 0, 1.48, 0);
  addPart(group, new THREE.BoxGeometry(0.36, 0.18, 0.24), trousers, 0, 0.86, 0);
  addPart(group, new THREE.BoxGeometry(0.09, 0.06, 0.09), skin, 0, 1.54, 0);
  const head = addPart(group, new THREE.BoxGeometry(0.28, 0.3, 0.28), skin, 0, 1.71, 0);
  addPart(group, new THREE.BoxGeometry(0.3, 0.1, 0.3), hair, 0, 1.88, -0.005);
  addPart(group, new THREE.BoxGeometry(0.3, 0.16, 0.08), hair, 0, 1.8, -0.12);
  const eyes = makeEyes(eyeMaterial, 1.72, 0.141);
  group.add(eyes);

  const makeLeg = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.11, 0.85, 0);
    addPart(pivot, new THREE.BoxGeometry(0.13, 0.78, 0.15), trousers, 0, -0.39, 0);
    addPart(pivot, new THREE.BoxGeometry(0.13, 0.1, 0.24), hair, 0, -0.76, 0.04);
    group.add(pivot);
    return pivot;
  };
  const makeArm = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.255, 1.44, 0);
    addPart(pivot, new THREE.BoxGeometry(0.1, 0.3, 0.11), shirt, 0, -0.15, 0);
    addPart(pivot, new THREE.BoxGeometry(0.085, 0.28, 0.095), skin, 0, -0.44, 0);
    addPart(pivot, new THREE.BoxGeometry(0.09, 0.09, 0.09), skin, 0, -0.6, 0);
    group.add(pivot);
    return pivot;
  };

  const legs = [makeLeg(-1), makeLeg(1)];
  const arms = [makeArm(-1), makeArm(1)];

  const pistol = new THREE.Group();
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.48), steel);
  pistol.add(slide);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 0.14), steel);
  grip.position.set(0, -0.19, -0.16);
  pistol.add(grip);
  pistol.position.set(0, -0.6, 0.08);
  pistol.rotation.x = 1.5;
  pistol.visible = false;
  const muzzleFlash = makeMuzzleFlash();
  muzzleFlash.position.set(0, 0, 0.34);
  pistol.add(muzzleFlash);
  arms[1].add(pistol);

  return { group, legs, arms, torso, head, pistol, muzzleFlash, torsoBand, collarBand, eyes };
}

function shortestAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

export class Player {
  constructor({ x = -30, z = -22, yaw = Math.PI / 2 } = {}) {
    this.position = new THREE.Vector3(x, 0, z);
    this.viewYaw = yaw;
    this.viewPitch = 0.14;
    this.facing = yaw;
    this.health = 100;
    this.armour = 0;
    this.arrested = false;
    this.inVehicle = null;
    this.speed = 0;
    this.verticalSpeed = 0;
    this.grounded = true;
    this.stride = 0;
    this.aiming = false;
    this.aimingOverride = false;
    this.crouching = false;
    this.runToggled = false;
    this.cameraBlend = 0;
    this.cameraBlendTarget = 0;
    this.transition = null;
    this.recoil = 0;
    this.onImpact = null;
    this.activeWeapon = 'fists';
    this.weapons = [
      { id: 'fists', slot: 1, name: 'FISTS', ammo: 0, reserve: 0, unlocked: true, fireRate: 2.4, spread: 0, damage: 18, range: 2.2, reload: 0, automatic: false, kind: 'melee', mag: 0, maxAmmo: 0, maxReserve: 0, reloading: 0 },
      { id: 'pistol', slot: 2, name: 'PISTOL', ammo: 12, reserve: 48, unlocked: true, fireRate: 4.2, spread: 0.012, damage: 28, range: 90, reload: 1.2, automatic: false, kind: 'hitscan', tracer: true, mag: 12, maxAmmo: 12, maxReserve: 48, reloading: 0 },
      { id: 'smg', slot: 3, name: 'SMG', ammo: 30, reserve: 120, unlocked: false, fireRate: 11, spread: 0.022, damage: 14, range: 80, reload: 1.6, automatic: true, kind: 'hitscan', tracer: true, mag: 30, maxAmmo: 30, maxReserve: 120, reloading: 0 },
      { id: 'shotgun', slot: 4, name: 'SHOTGUN', ammo: 8, reserve: 24, unlocked: false, fireRate: 1.2, spread: 0.055, damage: 12, pellets: 7, range: 45, reload: 1.9, automatic: false, kind: 'hitscan', tracer: true, mag: 8, maxAmmo: 8, maxReserve: 24, reloading: 0 },
      { id: 'rifle', slot: 5, name: 'RIFLE', ammo: 30, reserve: 90, unlocked: false, fireRate: 8, spread: 0.01, damage: 24, range: 140, reload: 1.8, automatic: true, kind: 'hitscan', tracer: true, mag: 30, maxAmmo: 30, maxReserve: 90, reloading: 0 },
      { id: 'grenade', slot: 6, name: 'GRENADE', ammo: 2, reserve: 0, unlocked: false, fireRate: 0.8, spread: 0, damage: 120, range: 35, reload: 0, automatic: false, kind: 'grenade', mag: 2, maxAmmo: 2, maxReserve: 0, reloading: 0 },
    ];

    const model = buildPedestrianMesh();
    this.mesh = model.group;
    this.legs = model.legs;
    this.arms = model.arms;
    this.torso = model.torso;
    this.head = model.head;
    this.torsoBaseY = model.torso.position.y;
    this.pistol = model.pistol;
    this.muzzleFlash = model.muzzleFlash;
    this.muzzleTimer = 0;
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.facing;
    this.contactShadow = makeContactShadow(0.85);
    this.mesh.add(this.contactShadow);
  }

  get busy() {
    return Boolean(this.transition);
  }

  updateLook(input) {
    const delta = input.consumeLook();
    this.viewYaw += delta.x;
    this.viewPitch = Math.max(-0.16, Math.min(0.6, this.viewPitch + delta.y));
    this.recoil = Math.max(0, this.recoil - Math.abs(delta.y) * 0.15);
  }

  updateOnFoot(input, dt) {
    this.updateLook(input);
    if (input.wasPressed('KeyX')) this.runToggled = !this.runToggled;
    if (input.wasPressed('KeyC')) this.crouching = !this.crouching;
    this.aiming = this.aimingOverride || input.mouseDown(2) || input.isDown('KeyQ');
    const axis = input.movementAxis();
    const forwardX = Math.sin(this.viewYaw);
    const forwardZ = Math.cos(this.viewYaw);
    const rightX = Math.cos(this.viewYaw);
    const rightZ = -Math.sin(this.viewYaw);
    let moveX = forwardX * axis.forward + rightX * axis.strafe;
    let moveZ = forwardZ * axis.forward + rightZ * axis.strafe;
    const magnitude = Math.hypot(moveX, moveZ);
    if (magnitude > 0) {
      moveX /= magnitude;
      moveZ /= magnitude;
    }
    const running = this.runToggled || input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    let targetSpeed = magnitude > 0 ? (running ? 7.4 : 4.3) : 0;
    if (this.crouching) targetSpeed *= 0.45;
    if (this.aiming) targetSpeed *= 0.62;
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 11);

    if (input.wasPressed('Space') && this.grounded && !this.crouching && !this.aiming) {
      this.verticalSpeed = 6.3;
      this.grounded = false;
    }
    this.verticalSpeed -= 18 * dt;
    this.position.y = Math.max(0, this.position.y + this.verticalSpeed * dt);
    if (this.position.y === 0) {
      this.verticalSpeed = 0;
      this.grounded = true;
    }

    const nextX = this.position.x + moveX * this.speed * dt;
    const nextZ = this.position.z + moveZ * this.speed * dt;
    const coast = coastalLimit(nextX);
    if (nextZ >= coast && Math.abs(nextX) < 358 && nextZ < 350) {
      if (!isBuildingFootprint(nextX, this.position.z, 0.45)) this.position.x = nextX;
      if (!isBuildingFootprint(this.position.x, nextZ, 0.45)) this.position.z = nextZ;
    }

    if (this.aiming) {
      this.facing = this.viewYaw;
    } else if (magnitude > 0.05) {
      this.facing += shortestAngle(Math.atan2(moveX, moveZ) - this.facing) * Math.min(1, dt * 12);
    }
    this.cameraBlendTarget = 0;
    this.updateCameraBlend(dt);
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.facing;
    this.animateStride(dt);
  }

  updateDriving(input, dt) {
    this.updateLook(input);
    const vehicle = this.inVehicle;
    if (!vehicle) return;
    this.viewYaw += shortestAngle(vehicle.heading - this.viewYaw) * Math.min(1, dt * 2.4);
    this.viewPitch = Math.max(-0.08, Math.min(0.32, this.viewPitch - dt * 0.12));
    this.position.copy(vehicle.position);
    this.speed = Math.abs(vehicle.speed);
    this.cameraBlendTarget = 1;
    this.updateCameraBlend(dt);
  }

  updateCameraBlend(dt) {
    this.cameraBlend += (this.cameraBlendTarget - this.cameraBlend) * Math.min(1, dt * 5.5);
  }

  showMuzzleFlash(seconds = 0.1) {
    this.muzzleTimer = Math.max(this.muzzleTimer, seconds);
    this.muzzleFlash.visible = true;
  }

  animateStride(dt) {
    this.muzzleTimer = Math.max(0, this.muzzleTimer - dt);
    this.muzzleFlash.visible = this.muzzleTimer > 0;
    this.contactShadow.position.y = 0.035 - this.position.y;
    this.contactShadow.material.opacity = 0.75 * Math.max(0.15, 1 - this.position.y * 0.3);
    this.stride += this.speed * dt * 2.3;
    const phase = Math.sin(this.stride);
    const legSwing = phase * Math.min(0.52, this.speed * 0.09);
    const armSwing = phase * Math.min(0.436, this.speed * 0.075);
    if (this.aiming) {
      this.legs[0].rotation.x = legSwing * 0.55;
      this.legs[1].rotation.x = -legSwing * 0.55;
      this.arms[0].rotation.x = -1.05;
      this.arms[0].rotation.z = 0.42;
      this.arms[1].rotation.x = -1.5 - this.recoil;
      this.arms[1].rotation.z = -0.12;
      this.torso.rotation.x = -0.07;
      this.pistol.visible = this.activeWeapon !== 'fists';
    } else {
      this.legs[0].rotation.x = legSwing;
      this.legs[1].rotation.x = -legSwing;
      this.arms[0].rotation.x = -armSwing;
      this.arms[0].rotation.z = 0;
      this.arms[1].rotation.x = armSwing;
      this.arms[1].rotation.z = 0;
      this.torso.rotation.x = 0;
      this.pistol.visible = false;
    }
    const breathe = Math.sin(performance.now() * 0.0018) * 0.012;
    this.torso.position.y = this.torsoBaseY + breathe + Math.abs(phase) * Math.min(0.04, this.speed * 0.006);
    const crouchScale = this.crouching ? 0.74 : 1;
    this.mesh.scale.y += (crouchScale - this.mesh.scale.y) * Math.min(1, dt * 9);
  }

  updateTransition(dt) {
    const transition = this.transition;
    if (!transition) return;
    transition.t = Math.min(1, transition.t + dt / transition.duration);
    const progress = transition.t;
    const eased = progress * progress * (3 - 2 * progress);
    if (transition.type === 'enter') {
      this.cameraBlendTarget = 1;
      this.mesh.visible = progress < 0.62;
      this.mesh.position.set(
        transition.from.x + (transition.to.x - transition.from.x) * eased,
        0,
        transition.from.z + (transition.to.z - transition.from.z) * eased,
      );
      this.mesh.rotation.y = transition.yaw;
    } else {
      this.cameraBlendTarget = 0;
      this.mesh.visible = progress > 0.26;
      this.mesh.position.set(
        transition.from.x + (transition.to.x - transition.from.x) * eased,
        0,
        transition.from.z + (transition.to.z - transition.from.z) * eased,
      );
      this.mesh.rotation.y = transition.yaw;
    }
    this.updateCameraBlend(dt);
    if (progress >= 1) {
      this.transition = null;
      if (transition.type === 'exit') this.mesh.position.copy(this.position);
      this.speed = 0;
    }
  }

  enterVehicle(vehicle) {
    if (this.inVehicle || !vehicle || this.transition) return false;
    this.inVehicle = vehicle;
    vehicle.occupants.push(this);
    this.transition = {
      type: 'enter',
      t: 0,
      duration: 0.52,
      from: { x: this.position.x, z: this.position.z },
      to: { x: vehicle.position.x, z: vehicle.position.z },
      yaw: vehicle.heading,
    };
    this.viewYaw = vehicle.heading;
    this.viewPitch = 0.1;
    this.speed = 0;
    this.cameraBlendTarget = 1;
    return true;
  }

  exitVehicle() {
    const vehicle = this.inVehicle;
    if (!vehicle || this.transition) return false;
    const sideX = Math.cos(vehicle.heading) * 3.1;
    const sideZ = -Math.sin(vehicle.heading) * 3.1;
    const candidates = [
      { x: vehicle.position.x + sideX, z: vehicle.position.z + sideZ },
      { x: vehicle.position.x - sideX, z: vehicle.position.z - sideZ },
    ];
    const clear = candidates.find((spot) => !isBuildingFootprint(spot.x, spot.z, 0.4) && spot.z >= coastalLimit(spot.x));
    const spot = clear ?? { x: vehicle.position.x, z: vehicle.position.z + 3.5 };
    this.transition = {
      type: 'exit',
      t: 0,
      duration: 0.52,
      from: { x: vehicle.position.x, z: vehicle.position.z },
      to: spot,
      yaw: vehicle.heading,
    };
    this.position.set(spot.x, 0, spot.z);
    this.mesh.position.set(vehicle.position.x, 0, vehicle.position.z);
    this.mesh.visible = true;
    this.mesh.scale.y = 0.74;
    this.facing = vehicle.heading;
    this.viewYaw = vehicle.heading;
    this.inVehicle = null;
    this.cameraBlendTarget = 0;
    vehicle.occupants = vehicle.occupants.filter((person) => person !== this);
    return true;
  }

  takeDamage(amount) {
    const absorbed = Math.min(this.armour, amount);
    this.armour -= absorbed;
    this.health = Math.max(0, this.health - (amount - absorbed));
    if (this.onImpact) this.onImpact(amount);
    return this.health <= 0;
  }

  arrest() {
    this.arrested = true;
    this.health = Math.max(this.health, 1);
    if (this.inVehicle) this.exitVehicle();
  }

  giveWeapon(id) {
    const weapon = this.weapons.find((item) => item.id === id);
    if (weapon) {
      weapon.unlocked = true;
      if (weapon.ammo <= 0 && weapon.kind !== 'melee') {
        weapon.ammo = weapon.maxAmmo ?? weapon.mag ?? 0;
        weapon.reserve = weapon.maxReserve ?? weapon.reserve;
      }
      this.activeWeapon = weapon.id;
    }
  }

  get activeWeaponDef() {
    return this.weapons.find((item) => item.id === this.activeWeapon) ?? this.weapons[0];
  }
}
