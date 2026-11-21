// Combat system: weapons, hitscan, melee, grenades, tracers, impacts and hit feedback.

import * as THREE from 'three';

export const WEAPON_DEFS = [
  { id: 'fists', slot: 1, name: 'FISTS', ammo: 0, reserve: 0, unlocked: true, fireRate: 2.4, spread: 0, damage: 18, range: 2.2, reload: 0, automatic: false, kind: 'melee' },
  { id: 'pistol', slot: 2, name: 'PISTOL', ammo: 12, reserve: 48, unlocked: true, fireRate: 4.2, spread: 0.012, damage: 28, range: 90, reload: 1.2, automatic: false, kind: 'hitscan', tracer: true },
  { id: 'smg', slot: 3, name: 'SMG', ammo: 30, reserve: 120, unlocked: false, fireRate: 11, spread: 0.022, damage: 14, range: 80, reload: 1.6, automatic: true, kind: 'hitscan', tracer: true },
  { id: 'shotgun', slot: 4, name: 'SHOTGUN', ammo: 8, reserve: 24, unlocked: false, fireRate: 1.2, spread: 0.055, damage: 12, pellets: 7, range: 45, reload: 1.9, automatic: false, kind: 'hitscan', tracer: true },
  { id: 'rifle', slot: 5, name: 'RIFLE', ammo: 30, reserve: 90, unlocked: false, fireRate: 8, spread: 0.01, damage: 24, range: 140, reload: 1.8, automatic: true, kind: 'hitscan', tracer: true },
  { id: 'grenade', slot: 6, name: 'GRENADE', ammo: 2, reserve: 0, unlocked: false, fireRate: 0.8, spread: 0, damage: 120, range: 35, reload: 0, automatic: false, kind: 'grenade' },
];

function cloneWeapon(def) {
  return { ...def, mag: def.ammo, maxAmmo: def.ammo, maxReserve: def.reserve, reloading: 0 };
}

export function createLoadout() {
  return WEAPON_DEFS.map(cloneWeapon);
}

function distPointSegmentSq(px, py, pz, ax, ay, az, bx, by, bz) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const ab2 = abx * abx + aby * aby + abz * abz || 1;
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / ab2));
  const cx = ax + abx * t, cy = ay + aby * t, cz = az + abz * t;
  const dx = px - cx, dy = py - cy, dz = pz - cz;
  return dx * dx + dy * dy + dz * dz;
}

export class CombatSystem {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.effects = [];
    this.grenades = [];
    this.tracers = [];
    this.impactCooldown = 0;
    this.onHit = options.onHit ?? (() => {});
    this.onKill = options.onKill ?? (() => {});
    this.onCrime = options.onCrime ?? (() => {});
  }

  update(dt, context = {}) {
    this.impactCooldown = Math.max(0, this.impactCooldown - dt);
    this.updateEffects(dt);
    this.updateGrenades(dt, context);
    this.updateTracers(dt);
  }

  canFire(weapon, now) {
    if (!weapon || weapon.reloading > 0) return false;
    const gap = 1 / (weapon.fireRate || 1);
    return (now - (weapon.lastFireAt ?? -99)) >= gap;
  }

  tryFire(weapon, origin, dir, now, context = {}) {
    if (!weapon || !this.canFire(weapon, now)) return null;
    if (weapon.kind !== 'melee' && weapon.kind !== 'grenade' && weapon.ammo <= 0) {
      this.reload(weapon);
      return { empty: true };
    }
    weapon.lastFireAt = now;
    if (weapon.kind === 'melee') return this.melee(origin, dir, context);
    if (weapon.kind === 'grenade') {
      if (weapon.ammo <= 0) return { empty: true };
      weapon.ammo -= 1;
      this.throwGrenade(origin, dir, context);
      this.onCrime('gunfire', origin);
      return { fired: true, weapon };
    }
    weapon.ammo -= 1;
    const pellets = weapon.pellets ?? 1;
    let anyHit = false;
    for (let i = 0; i < pellets; i += 1) {
      const spread = weapon.spread * (context.aiming ? 0.55 : 1.4);
      const shotDir = this.applySpread(dir, spread);
      anyHit = this.fireHitscan(weapon, origin, shotDir, context) || anyHit;
    }
    this.spawnMuzzle(origin, dir);
    this.onCrime('gunfire', origin);
    return { fired: true, weapon, hit: anyHit };
  }

  reload(weapon) {
    if (!weapon || weapon.kind === 'melee' || weapon.kind === 'grenade') return false;
    if (weapon.reloading > 0 || weapon.ammo >= weapon.maxAmmo || weapon.reserve <= 0) return false;
    weapon.reloading = weapon.reload;
    return true;
  }

  updateReloads(dt, weapons) {
    for (const weapon of weapons) {
      if (weapon.reloading <= 0) continue;
      weapon.reloading = Math.max(0, weapon.reloading - dt);
      if (weapon.reloading === 0) {
        const need = weapon.maxAmmo - weapon.ammo;
        const take = Math.min(need, weapon.reserve);
        weapon.ammo += take;
        weapon.reserve -= take;
      }
    }
  }

  applySpread(dir, amount) {
    const v = dir.clone().normalize();
    if (!amount) return v;
    v.x += (Math.random() - 0.5) * amount;
    v.y += (Math.random() - 0.5) * amount * 0.6;
    v.z += (Math.random() - 0.5) * amount;
    return v.normalize();
  }

  fireHitscan(weapon, origin, dir, context) {
    const end = origin.clone().addScaledVector(dir, weapon.range);
    let closest = { t: weapon.range, kind: 'world', point: end.clone() };

    const tryHit = (t, kind, target, point) => {
      if (t < closest.t && t > 0.5) closest = { t, kind, target, point };
    };

    for (const ped of context.pedestrians ?? []) {
      if (!ped.alive && ped.alive !== undefined) continue;
      const p = ped.position;
      const r = 0.7;
      const t = this.raySphere(origin, dir, p.x, 1.0, p.z, r, weapon.range);
      if (t) tryHit(t, 'pedestrian', ped, origin.clone().addScaledVector(dir, t));
    }
    for (const unit of context.policeUnits ?? []) {
      if (unit.dead) continue;
      const p = unit.position ?? unit.vehicle?.position;
      if (!p) continue;
      const r = unit.kind === 'HELICOPTER' ? 3.2 : 0.85;
      const y = unit.kind === 'HELICOPTER' ? (p.y ?? 18) : 1.0;
      const t = this.raySphere(origin, dir, p.x, y, p.z, r, weapon.range);
      if (t) tryHit(t, 'police', unit, origin.clone().addScaledVector(dir, t));
    }
    for (const vehicle of context.vehicles ?? []) {
      if (vehicle === context.playerVehicle) continue;
      const p = vehicle.position;
      const r = Math.max(vehicle.spec.width, vehicle.spec.length) * 0.45;
      const t = this.raySphere(origin, dir, p.x, 0.8, p.z, r, weapon.range);
      if (t) tryHit(t, 'vehicle', vehicle, origin.clone().addScaledVector(dir, t));
    }

    const hitPoint = closest.point;
    this.spawnTracer(origin, hitPoint, weapon.id === 'shotgun' ? 0.7 : 1);
    if (closest.kind === 'pedestrian') {
      this.spawnBlood(hitPoint);
      const dead = this.damagePedestrian(closest.target, weapon.damage, context);
      this.onHit({ kind: 'pedestrian', target: closest.target, dead, point: hitPoint });
      if (dead) this.onKill({ kind: 'pedestrian', target: closest.target });
      return true;
    }
    if (closest.kind === 'police') {
      this.spawnBlood(hitPoint);
      const dead = this.damagePolice(closest.target, weapon.damage, context);
      this.onHit({ kind: 'police', target: closest.target, dead, point: hitPoint });
      if (dead) this.onKill({ kind: 'police', target: closest.target });
      return true;
    }
    if (closest.kind === 'vehicle') {
      this.spawnSparks(hitPoint);
      closest.target.applyDamage(weapon.damage * 0.7, 'bullet');
      this.onHit({ kind: 'vehicle', target: closest.target, point: hitPoint });
      return true;
    }
    this.spawnSparks(hitPoint, 0.5);
    return false;
  }

  raySphere(origin, dir, cx, cy, cz, r, maxT) {
    const ox = origin.x - cx, oy = origin.y - cy, oz = origin.z - cz;
    const b = ox * dir.x + oy * dir.y + oz * dir.z;
    const c = ox * ox + oy * oy + oz * oz - r * r;
    if (c > 0 && b > 0) return null;
    const disc = b * b - c;
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    if (t > 0 && t < maxT) return t;
    const t2 = -b + Math.sqrt(disc);
    if (t2 > 0 && t2 < maxT) return t2;
    return null;
  }

  melee(origin, dir, context) {
    const reach = 2.2;
    let hit = false;
    for (const ped of context.pedestrians ?? []) {
      if (ped.dead) continue;
      const d = Math.hypot(ped.position.x - origin.x, ped.position.z - origin.z);
      if (d > reach) continue;
      const dot = ((ped.position.x - origin.x) * dir.x + (ped.position.z - origin.z) * dir.z) / Math.max(0.001, d);
      if (dot < 0.4) continue;
      const dead = this.damagePedestrian(ped, 26, context);
      this.spawnBlood({ x: ped.position.x, y: 1.2, z: ped.position.z });
      this.onHit({ kind: 'pedestrian', target: ped, dead, point: ped.position });
      if (dead) this.onKill({ kind: 'pedestrian', target: ped });
      hit = true;
    }
    for (const unit of context.policeUnits ?? []) {
      if (unit.dead) continue;
      const p = unit.position ?? unit.vehicle?.position;
      if (!p) continue;
      const d = Math.hypot(p.x - origin.x, p.z - origin.z);
      if (d > reach) continue;
      const dead = this.damagePolice(unit, 20, context);
      this.spawnBlood({ x: p.x, y: 1.2, z: p.z });
      this.onHit({ kind: 'police', target: unit, dead, point: p });
      if (dead) this.onKill({ kind: 'police', target: unit });
      hit = true;
    }
    return { fired: true, hit };
  }

  damagePedestrian(ped, amount, context) {
    ped.health = (ped.health ?? 40) - amount;
    ped.panic = 1;
    ped.fleeFrom = context.playerPos ? { ...context.playerPos } : null;
    if (ped.health <= 0 && !ped.dead) {
      ped.dead = true;
      ped.deathTimer = 8;
      if (ped.mesh) ped.mesh.rotation.x = -Math.PI / 2.2;
      return true;
    }
    return false;
  }

  damagePolice(unit, amount) {
    unit.health = (unit.health ?? 60) - amount;
    if (unit.health <= 0 && !unit.dead) {
      unit.dead = true;
      unit.deathTimer = 10;
      if (unit.mesh) unit.mesh.rotation.x = -Math.PI / 2.2;
      if (unit.vehicle) unit.vehicle.speed *= 0.2;
      return true;
    }
    return false;
  }

  throwGrenade(origin, dir, context) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 6),
      new THREE.MeshStandardMaterial({ color: '#445044', roughness: 0.7, metalness: 0.3 }),
    );
    mesh.position.copy(origin);
    this.scene.add(mesh);
    const vel = dir.clone().multiplyScalar(18);
    vel.y += 6;
    this.grenades.push({ mesh, vel, age: 0, fuse: 1.6 });
  }

  updateGrenades(dt, context) {
    for (let i = this.grenades.length - 1; i >= 0; i -= 1) {
      const g = this.grenades[i];
      g.age += dt;
      g.vel.y -= 14 * dt;
      g.mesh.position.addScaledVector(g.vel, dt);
      if (g.mesh.position.y < 0.18) {
        g.mesh.position.y = 0.18;
        g.vel.y *= -0.35;
        g.vel.x *= 0.7;
        g.vel.z *= 0.7;
      }
      if (g.age >= g.fuse) {
        this.explode(g.mesh.position.clone(), 10, context);
        this.scene.remove(g.mesh);
        this.grenades.splice(i, 1);
      }
    }
  }

  explode(pos, radius, context) {
    this.spawnExplosion(pos);
    this.onCrime('explosion', pos);
    for (const ped of context.pedestrians ?? []) {
      if (ped.dead) continue;
      const d = Math.hypot(ped.position.x - pos.x, ped.position.z - pos.z);
      if (d < radius) {
        const dead = this.damagePedestrian(ped, Math.max(20, 120 - d * 10), context);
        if (dead) this.onKill({ kind: 'pedestrian', target: ped });
      }
    }
    for (const unit of context.policeUnits ?? []) {
      if (unit.dead) continue;
      const p = unit.position ?? unit.vehicle?.position;
      if (!p) continue;
      const d = Math.hypot(p.x - pos.x, p.z - pos.z);
      if (d < radius) {
        const dead = this.damagePolice(unit, Math.max(20, 110 - d * 9));
        if (dead) this.onKill({ kind: 'police', target: unit });
      }
    }
    for (const vehicle of context.vehicles ?? []) {
      const d = Math.hypot(vehicle.position.x - pos.x, vehicle.position.z - pos.z);
      if (d < radius + 2) vehicle.applyDamage(Math.max(10, 90 - d * 8), 'explosion');
    }
    const player = context.player;
    if (player) {
      const d = Math.hypot(player.position.x - pos.x, player.position.z - pos.z);
      if (d < radius) player.takeDamage(Math.max(10, 80 - d * 7));
    }
  }

  spawnMuzzle(origin, dir) {
    const light = new THREE.PointLight('#ffcc7a', 4.5, 8, 2);
    light.position.copy(origin).addScaledVector(dir, 0.8);
    light.position.y = Math.max(0.8, light.position.y);
    this.scene.add(light);
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.5, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: '#ffe0a0', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    cone.position.copy(light.position);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    this.scene.add(cone);
    this.effects.push({ kind: 'flash', light, mesh: cone, age: 0, life: 0.05 });
  }

  spawnTracer(from, to, scale = 1) {
    const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const mat = new THREE.LineBasicMaterial({ color: '#fff0b0', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, age: 0, life: 0.08 * scale });
  }

  spawnSparks(pos, scale = 1) {
    for (let i = 0; i < 6; i += 1) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: i % 2 ? '#ffd27a' : '#ff8a4a' }));
      mesh.position.set(pos.x, pos.y || 0.8, pos.z);
      this.scene.add(mesh);
      const vel = new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3 + 1, (Math.random() - 0.5) * 4).multiplyScalar(scale);
      this.effects.push({ kind: 'spark', mesh, vel, age: 0, life: 0.35 + Math.random() * 0.25 });
    }
  }

  spawnBlood(pos) {
    for (let i = 0; i < 5; i += 1) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.06 + Math.random() * 0.04, 6, 6), new THREE.MeshBasicMaterial({ color: '#a2161d' }));
      mesh.position.set(pos.x, (pos.y || 1) + Math.random() * 0.4, pos.z);
      this.scene.add(mesh);
      const vel = new THREE.Vector3((Math.random() - 0.5) * 2.2, Math.random() * 2.5, (Math.random() - 0.5) * 2.2);
      this.effects.push({ kind: 'blood', mesh, vel, age: 0, life: 0.5 + Math.random() * 0.3 });
    }
  }

  spawnExplosion(pos) {
    const fire = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 12), new THREE.MeshBasicMaterial({ color: '#ff9b3d', transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending }));
    fire.position.set(pos.x, 1.2, pos.z);
    this.scene.add(fire);
    const smoke = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 10), new THREE.MeshStandardMaterial({ color: '#3f3a35', transparent: true, opacity: 0.7, depthWrite: false }));
    smoke.position.set(pos.x, 1.6, pos.z);
    this.scene.add(smoke);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.8, 24), new THREE.MeshBasicMaterial({ color: '#ffd28f', transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    ring.position.set(pos.x, 0.2, pos.z);
    ring.rotation.x = -Math.PI / 2;
    this.scene.add(ring);
    const light = new THREE.PointLight('#ff923f', 12, 30, 2);
    light.position.set(pos.x, 2.5, pos.z);
    this.scene.add(light);
    this.effects.push({ kind: 'explosion', fire, smoke, ring, light, age: 0, life: 1.2 });
  }

  updateEffects(dt) {
    for (let i = this.effects.length - 1; i >= 0; i -= 1) {
      const e = this.effects[i];
      e.age += dt;
      const t = e.age / e.life;
      if (e.kind === 'flash') {
        e.light.intensity = 4.5 * (1 - t);
        e.mesh.material.opacity = 0.8 * (1 - t);
        e.mesh.scale.multiplyScalar(1 + dt * 8);
      } else if (e.kind === 'spark' || e.kind === 'blood') {
        e.vel.y -= 9 * dt;
        e.mesh.position.addScaledVector(e.vel, dt);
        if (e.mesh.position.y < 0.03) { e.mesh.position.y = 0.03; e.vel.y *= -0.2; e.vel.x *= 0.6; e.vel.z *= 0.6; }
        e.mesh.material.opacity = Math.max(0, 1 - t);
        e.mesh.material.transparent = true;
      } else if (e.kind === 'explosion') {
        e.fire.scale.setScalar(1 + t * 8);
        e.fire.material.opacity = Math.max(0, 0.95 - t);
        e.smoke.scale.setScalar(1.2 + t * 10);
        e.smoke.position.y += dt * 2.4;
        e.smoke.material.opacity = Math.max(0, 0.7 - t * 0.7);
        e.ring.scale.setScalar(1 + t * 20);
        e.ring.material.opacity = Math.max(0, 0.8 - t);
        e.light.intensity = Math.max(0, 12 * (1 - t * 1.5));
      }
      if (e.age >= e.life) {
        if (e.mesh) this.scene.remove(e.mesh);
        if (e.light) this.scene.remove(e.light);
        if (e.fire) this.scene.remove(e.fire);
        if (e.smoke) this.scene.remove(e.smoke);
        if (e.ring) this.scene.remove(e.ring);
        this.effects.splice(i, 1);
      }
    }
  }

  updateTracers(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i -= 1) {
      const t = this.tracers[i];
      t.age += dt;
      t.line.material.opacity = Math.max(0, 0.9 * (1 - t.age / t.life));
      if (t.age >= t.life) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
  }
}
