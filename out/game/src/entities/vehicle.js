// Arcade car physics, collision response, damage model, lights and effects.

import * as THREE from 'three';
import { buildVehicleMesh, vehicleSpec } from '../world/vehicleFleet.js';
import { isBuildingFootprint, coastalLimit } from '../world/cityLayout.js';

export class Vehicle {
  constructor({ type = 'sedan', x = 0, z = 0, heading = 0, colour, parked = false } = {}) {
    this.type = type;
    this.spec = vehicleSpec(type);
    this.name = this.spec.name;
    this.position = new THREE.Vector3(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.steerAngle = 0;
    this.health = 100;
    this.occupants = [];
    this.parked = parked;
    this.sirenOn = false;
    this.braking = false;
    this.hornUntil = 0;
    this.maxSpeed = this.spec.maxSpeed;
    this.smoking = false;
    this.onFire = false;
    this.dead = false;
    this.doorFlung = false;
    this.damageVisual = 0;
    this.fireTimer = 0;

    const model = buildVehicleMesh(type, colour ?? this.spec.colour);
    this.mesh = model.group;
    this.body = model.body;
    this.headlights = model.headlights;
    this.headlightCones = model.headlightCones;
    this.brakeLights = model.brakeLights;
    this.redLamp = model.redLamp;
    this.blueLamp = model.blueLamp;
    this.wheels = model.wheels;
    this.doors = model.doors ?? [];
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = heading;

    this.smokePuffs = [];
    this.fireParticles = [];
    this.smokeGroup = new THREE.Group();
    this.fireGroup = new THREE.Group();
    this.mesh.add(this.smokeGroup);
    this.mesh.add(this.fireGroup);
  }

  get kmh() {
    return Math.abs(this.speed) * 3.6;
  }

  get gear() {
    if (this.speed < -0.2) return 'R';
    if (Math.abs(this.speed) < 0.4) return 'N';
    return String(Math.min(5, 1 + Math.floor(this.kmh / 26)));
  }

  drive(input, dt) {
    const throttle = this.dead ? 0 : (input.throttle ?? 0);
    const steer = input.steer ?? 0;
    const handbrake = Boolean(input.handbrake);
    const wear = 0.45 + 0.55 * (this.health / 100);
    this.braking = throttle < -0.05 && this.speed > 0.3;

    if (throttle > 0) this.speed += this.spec.accel * wear * throttle * dt;
    else if (throttle < 0) this.speed -= (this.speed > 0 ? this.spec.brake : this.spec.accel * 0.65) * Math.abs(throttle) * dt;
    else this.speed *= Math.exp(-1.25 * dt);
    if (handbrake) this.speed *= Math.exp(-2.8 * dt);

    const limit = this.dead ? 0 : this.maxSpeed * wear;
    this.speed = Math.max(-limit * 0.35, Math.min(limit, this.speed));
    const grip = Math.min(1, Math.abs(this.speed) / 5) * this.spec.handling * (handbrake ? 1.45 : 1);
    this.steerAngle += (steer - this.steerAngle) * Math.min(1, dt * 9);
    this.heading += this.steerAngle * grip * dt * (this.speed < 0 ? -1 : 1);

    const nextX = this.position.x + Math.sin(this.heading) * this.speed * dt;
    const nextZ = this.position.z + Math.cos(this.heading) * this.speed * dt;
    const coast = coastalLimit(nextX);
    if (nextZ < coast || Math.abs(nextX) > 356 || nextZ > 348) {
      this.speed *= -0.18;
      this.applyDamage(3, 'wall');
    } else {
      if (!isBuildingFootprint(nextX, this.position.z, 0.9)) this.position.x = nextX;
      else { this.speed *= 0.22; this.applyDamage(2, 'wall'); }
      if (!isBuildingFootprint(this.position.x, nextZ, 0.9)) this.position.z = nextZ;
      else { this.speed *= 0.22; this.applyDamage(2, 'wall'); }
    }
    this.parked = false;
  }

  applyDamage(amount, source = 'impact') {
    this.health = Math.max(0, this.health - amount);
    this.maxSpeed = this.spec.maxSpeed * (0.35 + 0.65 * this.health / 100);
    this.lastDamageSource = source;
    const dmg = 1 - this.health / 100;
    this.damageVisual = Math.max(this.damageVisual, dmg);
    this.smoking = this.health < 60;
    this.onFire = this.health < 15;
    this.dead = this.health <= 0;
    if (amount > 28 && !this.doorFlung && this.doors.length) this.flingDoor();
    this.updateDamageLook();
    return this.dead;
  }

  flingDoor() {
    this.doorFlung = true;
    for (const door of this.doors) {
      door.userData.flung = true;
      door.userData.vel = new THREE.Vector3((Math.random() - 0.5) * 6, 4 + Math.random() * 3, (Math.random() - 0.5) * 6);
      door.userData.spin = (Math.random() - 0.5) * 8;
      const worldPos = new THREE.Vector3();
      door.getWorldPosition(worldPos);
      this.mesh.remove(door);
      door.position.copy(this.mesh.worldToLocal(worldPos.clone()));
      this.mesh.parent?.add(door);
      door.position.copy(worldPos);
    }
  }

  updateDamageLook() {
    if (this.body?.material?.color) {
      const base = new THREE.Color(this.spec.colour);
      base.lerp(new THREE.Color('#1a1410'), Math.min(0.55, this.damageVisual * 0.65));
      this.body.material.color.copy(base);
    }
  }

  horn() {
    this.hornUntil = performance.now() + 350;
  }

  setSiren(on) {
    this.sirenOn = Boolean(on);
  }

  update(dt) {
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.heading;
    for (const wheel of this.wheels) wheel.rotation.x += this.speed * dt * 2.4;
    const brakeColor = this.braking ? '#ff3325' : '#8c2c24';
    for (const lamp of this.brakeLights) lamp.material.color.set(brakeColor);
    if (this.redLamp && this.blueLamp) {
      const flash = Math.floor(performance.now() / 160) % 2 === 0;
      this.redLamp.material.color.set(this.sirenOn && flash ? '#ff2030' : '#3a1118');
      this.blueLamp.material.color.set(this.sirenOn && !flash ? '#3a7bff' : '#101a38');
    }

    const night = (window.__marea?.game?.timeOfDay ?? 18);
    const headlightsOn = night < 6.5 || night > 19.2;
    for (const cone of this.headlightCones ?? []) cone.visible = headlightsOn;

    this.updateDamageEffects(dt);

    for (const door of this.doors) {
      if (!door.userData.flung || !door.parent) continue;
      door.userData.vel.y -= 9 * dt;
      door.position.addScaledVector(door.userData.vel, dt);
      door.rotation.x += door.userData.spin * dt;
      if (door.position.y < 0.1) { door.position.y = 0.1; door.userData.vel.y *= -0.25; door.userData.vel.x *= 0.7; door.userData.vel.z *= 0.7; door.userData.spin *= 0.6; }
      door.userData.life = (door.userData.life ?? 6) - dt;
      if (door.userData.life <= 0) door.parent.remove(door);
    }
  }

  updateDamageEffects(dt) {
    if (this.smoking && Math.random() < dt * 4) {
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(0.25 + Math.random() * 0.2, 6, 6),
        new THREE.MeshBasicMaterial({ color: this.onFire ? '#5a5550' : '#888888', transparent: true, opacity: 0.35 }),
      );
      puff.position.set((Math.random() - 0.5) * 0.8, 0.9, this.spec.length * 0.25);
      this.smokeGroup.add(puff);
      this.smokePuffs.push({ mesh: puff, age: 0, life: 1.6 + Math.random() * 0.8, vy: 0.8 + Math.random() * 0.6 });
    }
    if (this.onFire && Math.random() < dt * 8) {
      const flame = new THREE.Mesh(
        new THREE.SphereGeometry(0.18 + Math.random() * 0.15, 6, 6),
        new THREE.MeshBasicMaterial({ color: Math.random() < 0.5 ? '#ff7a2a' : '#ffbf4d', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending }),
      );
      flame.position.set((Math.random() - 0.5) * 1.0, 0.8, this.spec.length * 0.2 + (Math.random() - 0.5) * 0.6);
      this.fireGroup.add(flame);
      this.fireParticles.push({ mesh: flame, age: 0, life: 0.35 + Math.random() * 0.3, vy: 1.5 + Math.random() * 1.5 });
    }
    for (let i = this.smokePuffs.length - 1; i >= 0; i -= 1) {
      const p = this.smokePuffs[i];
      p.age += dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.scale.multiplyScalar(1 + dt * 0.8);
      p.mesh.material.opacity = Math.max(0, 0.35 * (1 - p.age / p.life));
      if (p.age >= p.life) { this.smokeGroup.remove(p.mesh); this.smokePuffs.splice(i, 1); }
    }
    for (let i = this.fireParticles.length - 1; i >= 0; i -= 1) {
      const p = this.fireParticles[i];
      p.age += dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.scale.multiplyScalar(1 - dt * 0.8);
      p.mesh.material.opacity = Math.max(0, 0.85 * (1 - p.age / p.life));
      if (p.age >= p.life) { this.fireGroup.remove(p.mesh); this.fireParticles.splice(i, 1); }
    }
  }
}
