import * as THREE from 'three';
import { RANKS, SIDE_JOBS } from '../story/campaign.js';
import { CRAB_SPOTS } from '../world/cityLayout.js';
import { CREW_ABILITIES } from '../story/characters.js';

export const GARAGE_UPGRADES = [
  { id: 'engine', name: 'ENGINE TUNE', description: 'More top speed and stronger acceleration.', prices: [900, 1800, 3200] },
  { id: 'tyres', name: 'SPORT TYRES', description: 'Sharper handling and shorter stopping distances.', prices: [700, 1500, 2800] },
  { id: 'armour', name: 'PLATING', description: 'Reinforced panels soak up impact damage.', prices: [1100, 2200, 3900] },
];

export const RESPRAY_PRICE = 600;

const ABILITY_RANKS = {
  'swap-plates': 1,
  'quick-fix': 2,
  'eyes-out': 3,
};

function money(n) {
  return `$ ${Math.max(0, Math.round(n)).toLocaleString('en-US')}`;
}

function buildCrabMesh(spot, index) {
  const group = new THREE.Group();
  group.name = `Golden crab ${index + 1}`;
  const gold = new THREE.MeshStandardMaterial({ color: '#ffd166', emissive: '#a65c10', emissiveIntensity: 0.75, metalness: 0.55, roughness: 0.28 });
  const bright = new THREE.MeshBasicMaterial({ color: '#ffe9a3', transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.48, 10, 7), gold);
  shell.scale.set(1.25, 0.62, 0.9);
  shell.position.y = 0.78;
  group.add(shell);
  for (const side of [-1, 1]) {
    const claw = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.28, 0.48), gold);
    claw.position.set(side * 0.7, 0.72, 0.28);
    claw.rotation.y = side * 0.5;
    group.add(claw);
    for (let leg = 0; leg < 3; leg += 1) {
      const limb = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.07, 0.07), gold);
      limb.position.set(side * 0.72, 0.45, -0.25 + leg * 0.27);
      limb.rotation.y = side * 0.5;
      group.add(limb);
    }
  }
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.15, 20), bright);
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.08;
  group.add(halo);
  group.position.set(spot.x, 0, spot.z);
  return { group, halo, baseY: 0 };
}

export class Economy {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.hud = options.hud ?? null;
    this.audio = options.audio ?? null;
    this.wanted = options.wanted ?? null;
    this.player = options.player ?? null;
    this.getVehicle = options.getVehicle ?? (() => null);
    this.onChange = options.onChange ?? (() => {});

    this.cash = 2450;
    this.reputation = 120;
    this.rankIndex = 0;
    this.garage = { engine: 0, tyres: 0, armour: 0 };
    this.thefts = Object.fromEntries(SIDE_JOBS.map((request) => [request.id, false]));
    this.abilities = Object.fromEntries(CREW_ABILITIES.map((ability) => [ability.id, {
      id: ability.id, unlocked: false, cooldown: 0, cooldownTotal: ability.cooldown,
    }]));
    this.crabs = CRAB_SPOTS.map((spot, index) => ({ ...spot, id: `crab-${index + 1}`, collected: false }));
    this.crabMeshes = this.crabs.map((spot, index) => {
      const model = buildCrabMesh(spot, index);
      scene.add(model.group);
      return model;
    });
    this.elapsed = 0;
    this.syncAll();
  }

  get rank() {
    return RANKS[this.rankIndex]?.name ?? RANKS[0].name;
  }

  get nextRank() {
    return RANKS[this.rankIndex + 1]?.xp ?? RANKS[this.rankIndex].xp;
  }

  get crabCount() {
    return this.crabs.filter((crab) => crab.collected).length;
  }

  syncAll() {
    this.hud?.setMoney(this.cash);
    this.hud?.setRep(this.rank, this.reputation, Math.max(1, this.nextRank));
    this.hud?.setCrabs(this.crabCount, this.crabs.length);
    this.updateRank();
    this.onChange(this.snapshot());
  }

  updateRank() {
    let nextIndex = 0;
    for (let i = 0; i < RANKS.length; i += 1) {
      if (this.reputation >= RANKS[i].xp) nextIndex = i;
    }
    if (nextIndex !== this.rankIndex) {
      this.rankIndex = nextIndex;
      this.hud?.rankFlash(this.rank);
    }
    for (const [id, needed] of Object.entries(ABILITY_RANKS)) {
      if (this.abilities[id] && this.rankIndex >= needed) this.abilities[id].unlocked = true;
    }
  }

  addCash(amount) {
    const value = Math.round(amount);
    if (!value) return this.cash;
    this.cash = Math.max(0, this.cash + value);
    this.hud?.setMoney(this.cash, true);
    this.onChange(this.snapshot());
    return this.cash;
  }

  spend(amount) {
    if (amount <= 0 || this.cash < amount) return false;
    this.addCash(-amount);
    return true;
  }

  addReputation(amount) {
    this.reputation = Math.max(0, this.reputation + Math.round(amount));
    this.updateRank();
    this.hud?.setRep(this.rank, this.reputation, Math.max(1, this.nextRank));
    this.onChange(this.snapshot());
  }

  unlockWeapon(id) {
    if (!id || !this.player?.giveWeapon) return false;
    this.player.giveWeapon(id);
    return true;
  }

  upgradePrice(kind) {
    const spec = GARAGE_UPGRADES.find((upgrade) => upgrade.id === kind);
    if (!spec) return null;
    return spec.prices[this.garage[kind]] ?? null;
  }

  buyUpgrade(kind) {
    const price = this.upgradePrice(kind);
    if (price === null || this.garage[kind] >= 3 || !this.spend(price)) return false;
    this.garage[kind] += 1;
    const vehicle = this.getVehicle();
    if (vehicle) this.applyUpgrades(vehicle);
    this.audio?.uiClick();
    this.onChange(this.snapshot());
    return true;
  }

  applyUpgrades(vehicle) {
    if (!vehicle?.spec) return vehicle;
    if (vehicle.spec.__tuned !== true) {
      vehicle.spec = {
        ...vehicle.spec,
        __tuned: true,
        __base: {
          maxSpeed: vehicle.spec.maxSpeed,
          accel: vehicle.spec.accel,
          handling: vehicle.spec.handling,
          brake: vehicle.spec.brake,
        },
      };
    }
    const engine = this.garage.engine;
    const tyres = this.garage.tyres;
    const armour = this.garage.armour;
    const base = vehicle.spec.__base;
    vehicle.spec.maxSpeed = base.maxSpeed * (1 + engine * 0.12);
    vehicle.spec.accel = base.accel * (1 + engine * 0.1);
    vehicle.spec.handling = base.handling * (1 + tyres * 0.12);
    vehicle.spec.brake = base.brake * (1 + tyres * 0.08);
    vehicle.spec.armour = armour;
    vehicle.maxSpeed = vehicle.spec.maxSpeed;
    if (armour > 0 && !vehicle.__armoured) {
      vehicle.__armoured = true;
      const original = vehicle.applyDamage.bind(vehicle);
      vehicle.applyDamage = (amount, source) => original(amount * (1 - armour * 0.16), source);
    }
    if (armour > 0) vehicle.health = Math.max(vehicle.health, 70 + armour * 10);
    if (vehicle.health > 0) vehicle.dead = false;
    return vehicle;
  }

  completeTheft(id) {
    if (this.thefts[id]) return false;
    this.thefts[id] = true;
    const request = SIDE_JOBS.find((item) => item.id === id);
    if (request) {
      this.addCash(request.reward.cash);
      this.addReputation(request.reward.rep);
    }
    return true;
  }

  registerTheft(vehicle) {
    if (!vehicle) return null;
    const request = SIDE_JOBS.find((item) => !this.thefts[item.id]
      && vehicle.type === item.vehicleType
      && Math.hypot(vehicle.position.x - item.near.x, vehicle.position.z - item.near.z) < 70);
    if (!request) return null;
    this.completeTheft(request.id);
    return request;
  }

  collectCrab(crab) {
    if (!crab || crab.collected) return false;
    crab.collected = true;
    const model = this.crabMeshes[this.crabs.indexOf(crab)];
    if (model) model.group.visible = false;
    this.addCash(350);
    this.audio?.tone(880, 0.12, 'sine', 0.08);
    this.audio?.tone(1320, 0.2, 'triangle', 0.06, this.audio.usable ? this.audio.ctx.currentTime + 0.08 : 0);
    this.hud?.setCrabs(this.crabCount, this.crabs.length);
    this.hud?.say('PMPD SCANNER', `Golden crab ${this.crabCount} of ${this.crabs.length} recovered. Paid $350.`);
    return true;
  }

  respray() {
    const stars = this.wanted?.stars ?? 0;
    if (stars <= 0 || !this.spend(RESPRAY_PRICE)) {
      this.audio?.uiClick();
      return false;
    }
    this.wanted.setStars(stars - 1, this.player?.position);
    this.audio?.uiClick();
    this.hud?.say('TAVO “DIESEL” REYES', `Fresh paint. One star off. That will be ${money(RESPRAY_PRICE)}.`);
    return true;
  }

  abilityState(id) {
    return this.abilities[id] ?? null;
  }

  useAbility(id, context = {}) {
    const state = this.abilities[id];
    if (!state?.unlocked || state.cooldown > 0) {
      this.audio?.uiClick();
      return false;
    }
    if (id === 'swap-plates') {
      const stars = this.wanted?.stars ?? 0;
      if (stars <= 0) return false;
      this.wanted.setStars(stars - 1, this.player?.position);
      this.hud?.say('KIKI SOL', 'Plates swapped. One less star on your tail.');
    } else if (id === 'quick-fix') {
      const vehicle = context.vehicle ?? this.getVehicle();
      if (!vehicle) return false;
      vehicle.health = 100;
      vehicle.dead = false;
      vehicle.maxSpeed = vehicle.spec.maxSpeed;
      vehicle.smoking = false;
      vehicle.onFire = false;
      this.hud?.say('TAVO “DIESEL” REYES', 'Patched up. Try not to scratch it again.');
    } else if (id === 'eyes-out') {
      this.hud?.say('KIKI SOL', 'Every cruiser is painted on your map for a minute.');
    } else {
      return false;
    }
    state.cooldown = state.cooldownTotal;
    this.audio?.uiClick();
    this.onChange(this.snapshot());
    return true;
  }

  update(dt, context = {}) {
    this.elapsed += dt;
    for (const state of Object.values(this.abilities)) {
      state.cooldown = Math.max(0, state.cooldown - dt);
    }
    const position = context.playerPos ?? this.player?.position;
    if (!position) return;
    this.crabs.forEach((crab, index) => {
      if (crab.collected) return;
      const model = this.crabMeshes[index];
      if (!model) return;
      model.group.position.y = 0.15 + Math.sin(this.elapsed * 2.2 + index) * 0.22;
      model.group.rotation.y += dt * 0.9;
      model.halo.scale.setScalar(1 + Math.sin(this.elapsed * 3.4 + index) * 0.18);
      model.group.visible = Math.hypot(crab.x - position.x, crab.z - position.z) < 210;
      if (Math.hypot(crab.x - position.x, crab.z - position.z) < 3.6) this.collectCrab(crab);
    });
  }

  snapshot() {
    return {
      cash: this.cash,
      reputation: this.reputation,
      rank: this.rank,
      rankIndex: this.rankIndex,
      garage: { ...this.garage },
      thefts: { ...this.thefts },
      crabs: this.crabs.map((crab) => ({ id: crab.id, collected: crab.collected })),
      abilities: Object.fromEntries(Object.entries(this.abilities).map(([id, state]) => [id, { unlocked: state.unlocked }])),
    };
  }

  restore(data = {}) {
    this.cash = Math.max(0, Number(data.cash) || 0);
    this.reputation = Math.max(0, Number(data.reputation) || 0);
    if (data.garage) {
      for (const kind of Object.keys(this.garage)) this.garage[kind] = Math.max(0, Math.min(3, Number(data.garage[kind]) || 0));
    }
    if (data.thefts) {
      for (const id of Object.keys(this.thefts)) this.thefts[id] = Boolean(data.thefts[id]);
    }
    if (Array.isArray(data.crabs)) {
      const flags = new Map(data.crabs.map((crab) => [crab.id, Boolean(crab.collected)]));
      this.crabs.forEach((crab) => {
        crab.collected = flags.get(crab.id) ?? false;
        const model = this.crabMeshes[this.crabs.indexOf(crab)];
        if (model) model.group.visible = !crab.collected;
      });
    }
    if (data.abilities) {
      for (const [id, state] of Object.entries(this.abilities)) state.unlocked = Boolean(data.abilities[id]?.unlocked) || state.unlocked;
    }
    this.updateRank();
    this.syncAll();
  }
}
