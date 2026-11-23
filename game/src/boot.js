// MareaRojaGame: system wiring, main loop, day/night clock, district events and the inspector snapshot.

import { Engine } from './core/engine.js';
import { Input } from './core/input.js';
import { AudioSystem } from './core/audio.js';
import { CityBuilder } from './world/cityBuilder.js';
import { SPAWN_POINTS, MARKERS, CRAB_SPOTS, districtAt } from './world/cityLayout.js';
import { TrafficSystem } from './world/traffic.js';
import { PedestrianSystem } from './world/pedestrians.js';
import { Player } from './entities/player.js';
import { Vehicle } from './entities/vehicle.js';
import { Hud } from './ui/hud.js';
import { Minimap } from './ui/minimap.js';
import { Menus } from './ui/menus.js';
import { JOBS } from './story/campaign.js';
import { CombatSystem, createLoadout } from './systems/combat.js';
import { WantedSystem } from './systems/wanted.js';
import { PoliceSystem } from './systems/police.js';
import { Economy } from './systems/economy.js';
import { MissionSystem } from './systems/missions.js';
import { SaveGame } from './systems/saveGame.js';
import * as THREE from 'three';

const WEAPON_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'];

export class MareaRojaGame {
  constructor() {
    const params = new URLSearchParams(window.location.search);
    this.seed = Number(params.get('seed')) || 1;
    this.shotName = params.get('shot') ?? '';
    this.isShot = Boolean(this.shotName);
    this.canvas = document.getElementById('game');
    this.engine = new Engine(this.canvas);
    this.input = new Input(this.canvas);
    this.city = new CityBuilder(this.engine).build();

    this.hud = new Hud();
    this.minimap = new Minimap(document.getElementById('minimap'));
    this.audio = new AudioSystem();
    this.saveGame = new SaveGame();
    this.player = new Player(SPAWN_POINTS.onFoot);
    this.engine.scene.add(this.player.mesh);

    this.state = {
      player: this.player,
      vehicles: [],
      traffic: [],
      pedestrians: [],
      police: [],
      missions: null,
      economy: null,
      wanted: { stars: 0 },
      hud: this.hud,
      radio: { station: 'Radio Marea 92.7', track: 'Son Caribe' },
    };

    this.stats = {
      completion: 0,
      carsStolen: 0,
      copsEscaped: 0,
      highestWanted: 0,
      distanceDriven: 0,
      takenOut: 0,
      longestJump: 0,
    };
    this.jumpStart = null;

    this.traffic = new TrafficSystem(this.engine.scene, {
      seed: this.seed,
      onScreech: (position) => {
        this.audio.screech();
        this.pedestrians?.panicAt(position, 27, 'screech');
      },
      onHorn: (position) => this.pedestrians?.panicAt(position, 9, 'horn'),
    });
    this.traffic.populate(46);
    this.state.vehicles = this.traffic.vehicles;
    this.state.traffic = this.traffic.moving;

    this.pedestrians = new PedestrianSystem(this.engine.scene, {
      seed: this.seed,
      onScream: () => this.audio.scream(),
    });
    this.pedestrians.populate(82, SPAWN_POINTS.onFoot);
    this.state.pedestrians = this.pedestrians.peds;
    this.heroVehicle = this.traffic.parked.find((vehicle) => vehicle.hero)
      ?? this.traffic.parked.find((vehicle) => vehicle.type === 'sprint')
      ?? this.traffic.parked[0];

    this.lastWantedStars = 0;
    this.wanted = new WantedSystem({
      onChange: (s) => {
        this.state.wanted.stars = s.stars;
        this.hud.setWanted(s.stars);
        this.stats.highestWanted = Math.max(this.stats.highestWanted ?? 0, s.stars);
        if (this.lastWantedStars > 0 && s.stars === 0) {
          this.stats.copsEscaped = (this.stats.copsEscaped ?? 0) + 1;
        }
        this.lastWantedStars = s.stars;
        if (s.lastCrime) this.hud.say('PMPD SCANNER', s.lastCrime);
        this.updateRadioForWanted();
      },
      onDispatch: (stars, pos) => this.police?.dispatch(stars, pos ?? this.player.position),
    });

    this.police = new PoliceSystem(this.engine.scene, this.traffic, {
      onArrest: () => this.handleBusted(),
      onDispatchChange: (units) => {
        this.state.police = units;
        this.hud.setDispatch(this.police.getHudUnits(), this.wanted.stars);
      },
    });

    this.combat = new CombatSystem(this.engine.scene, {
      onHit: (hit) => {
        this.hud.flashHitMarker();
        if (hit.kind === 'vehicle' && hit.target?.spec?.police) this.wanted.reportCrime('ram_cruiser', hit.point);
      },
      onKill: (kill) => {
        this.stats.takenOut = (this.stats.takenOut ?? 0) + 1;
        this.missions?.onEvent('kill', kill.target);
        if (kill.kind === 'pedestrian') this.wanted.reportCrime('pedestrian_kill', kill.target?.position);
        if (kill.kind === 'police') this.wanted.reportCrime('officer_kill', kill.target?.position);
      },
      onCrime: (kind, pos) => {
        if (kind === 'gunfire') {
          const nearPolice = this.police.units.some((u) => !u.dead && u.distance < 40);
          this.wanted.reportCrime(nearPolice ? 'gunfire_near_police' : 'gunfire', pos);
        } else if (kind === 'explosion') {
          this.wanted.reportCrime('explosion', pos);
        }
      },
    });

    this.economy = new Economy(this.engine.scene, {
      hud: this.hud,
      audio: this.audio,
      wanted: this.wanted,
      player: this.player,
      getVehicle: () => this.player.inVehicle ?? this.heroVehicle ?? null,
      onChange: () => {},
    });
    this.state.economy = this.economy;

    this.missions = new MissionSystem(this.engine.scene, {
      hud: this.hud,
      audio: this.audio,
      player: this.player,
      economy: this.economy,
      wanted: this.wanted,
      police: this.police,
      traffic: this.traffic,
      pedestrians: this.pedestrians,
      onComplete: () => this.handleJobComplete(),
    });
    this.state.missions = this.missions;
    if (this.isShot) this.missions.marker.group.visible = false;

    this.menus = new Menus(this);

    this.muzzle = null;

    this.elapsed = 0;
    this.lastFrame = performance.now();
    this.lastDistrict = '';
    this.timeOfDay = 17 + 20 / 60;
    this.dayRate = 24 / 1200;
    this.fireCooldown = 0;
    this.screechCooldown = 0;
    this.footstepTimer = 0;
    this.effects = [];
    this.ready = false;
    this.gameOver = null;
    this.playerShooting = false;

    this.hud.setMission(this.missions.getCard());
    this.hud.setMoney(this.economy.cash);
    this.hud.setCrabs(this.economy.crabCount, this.economy.crabs.length);
    this.hud.setRep(this.economy.rank, this.economy.reputation, Math.max(1, this.economy.nextRank));
    this.hud.setHealth(this.player.health, this.player.armour);
    this.hud.setWeapons(this.player.weapons, this.player.activeWeapon);
    this.hud.setRadio(this.audio.station.name, this.audio.station.track);
    this.hud.setWanted(0);
    this.hud.setDispatch([], 0);
    this.hud.setSpeed(0, 'N');
    this.hud.setVehicle(null);
    this.hud.setClock(this.timeOfDay);
    this.showCurrentDistrict();
    this.hud.say('MIRA KESANG', 'Rafa, the coral Sprint is outside. Take it and disappear.');
    this.hud.onRetry = () => this.retry();

    this.player.onImpact = (amount) => {
      this.engine.addShake(Math.min(1, 0.25 + amount / 45));
      this.hud.flashDamage();
      this.audio.crash(Math.min(2, amount / 20));
      if (this.player.health <= 0) this.handleWasted();
    };

    window.__marea = {
      game: this,
      ready: false,
      snapshot: () => this.snapshot(),
      explodeAt: (x, z) => this.explodeAt({ x, z }),
      panicAt: (x, z, radius) => this.pedestrians.panicAt({ x, z }, radius),
      setWanted: (n) => this.wanted.setStars(n, this.player.position),
      spawnPolice: (n) => this.wanted.setStars(n, this.player.position),
      giveWeapon: (id) => { this.player.giveWeapon(id); this.hud.setWeapons(this.player.weapons, this.player.activeWeapon); },
      teleport: (x, z) => {
        const y = 0;
        if (this.player.inVehicle) { this.player.inVehicle.position.set(x, y, z); }
        this.player.position.set(x, y, z);
        this.player.mesh.position.set(x, y, z);
      },
      startJob: (id) => this.missions.start(id),
      completeStage: () => this.missions.forceCompleteStage(),
      finishJob: () => this.missions.complete(),
      saveGame: (slot = 1) => this.saveGame.save(slot, this.captureSave()),
      loadGame: (slot = 1) => {
        const data = this.saveGame.load(slot);
        if (data) this.restoreSave(data);
        return Boolean(data);
      },
      openMenu: (tab = 'MAP') => this.menus.openPause(tab),
      closeMenu: () => this.menus.close(),
      newGame: () => this.startNewGame(),
      retry: () => this.retry(),
      stats: () => ({ ...this.stats }),
      shadowReport: () => this.engine.shadowReport(),
      cameraReport: () => this.engine.cameraReport(this.player),
      probePixels: (points) => this.engine.probePixels(points),
      propReport: () => this.city.diagnoseProps(),
      visualReport: () => ({
        lighting: this.engine.shadowReport(),
        camera: this.engine.cameraReport(this.player),
        props: this.city.diagnoseProps(),
        timeOfDay: Number(this.timeOfDay.toFixed(3)),
        exposure: this.engine.renderer.toneMappingExposure,
      }),
    };
  }

  async start() {
    this.engine.snapCamera(this.player);
    if (!this.shotName) this.menus.openTitle();
    if (this.shotName) {
      try {
        const { applyScreenshotPreset } = await import('./ui/screenshots.js');
        await applyScreenshotPreset(this, this.shotName);
      } catch (err) {
        console.error('[marea] screenshot preset failed', err);
      }
    }
    this.ready = true;
    window.__marea.ready = true;
    const frame = (now) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrame) / 1000));
      this.lastFrame = now;
      this.update(dt);
      this.render();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    return this;
  }

  update(dt) {
    this.elapsed += dt;

    if (this.menus?.isOpen) {
      this.menus.handleInput();
      this.menus.update(dt);
      this.audio.update(dt, { rpm: 0, driving: false, siren: false });
      this.hud.tick(dt);
      this.input.endFrame();
      return;
    }

    if (!this.isShot && this.input.wasPressed('Escape')) {
      this.menus.openPause('MAP');
      this.input.endFrame();
      return;
    }

    if (this.gameOver) {
      this.engine.followCamera(this.player, { dt });
      this.hud.tick(dt);
      this.input.endFrame();
      return;
    }

    this.timeOfDay = (this.timeOfDay + dt * this.dayRate) % 24;
    this.engine.setTimeOfDay(this.timeOfDay);
    this.hud.setClock(this.timeOfDay);
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.screechCooldown = Math.max(0, this.screechCooldown - dt);

    this.handleInput(dt);
    let engineRpm = 0;
    let driving = false;
    if (this.player.busy) {
      this.player.updateTransition(dt);
      if (this.player.inVehicle) { driving = true; engineRpm = 0.35; }
    } else if (this.player.inVehicle) {
      const vehicle = this.player.inVehicle;
      const axis = this.input.movementAxis();
      this.player.updateDriving(this.input, dt);
      vehicle.drive({ throttle: axis.forward, steer: axis.strafe, handbrake: this.input.isDown('Space') }, dt);
      if (this.isShot && this.shotSpeed != null && !axis.forward && !axis.strafe) vehicle.speed = this.shotSpeed;
      this.player.position.copy(vehicle.position);
      vehicle.update(dt);
      driving = true;
      engineRpm = 0.16 + Math.min(1, vehicle.kmh / Math.max(1, vehicle.maxSpeed * 3.6)) * 0.84;
      this.stats.distanceDriven = (this.stats.distanceDriven ?? 0) + (Math.max(0, vehicle.kmh) / 3.6) * dt;
      this.hud.setSpeed(vehicle.kmh, vehicle.gear);
      this.hud.setVehicle(vehicle.name, vehicle.health, vehicle.spec.className);
      if (this.input.isDown('Space') && vehicle.kmh > 42 && this.screechCooldown <= 0) {
        this.screechCooldown = 0.55;
        this.audio.screech(1);
        this.pedestrians.panicAt(vehicle.position, 22, 'screech');
      }
      if (vehicle.dead) {
        this.player.exitVehicle();
        this.handleWasted();
      }
    } else {
      this.player.updateOnFoot(this.input, dt);
      if (!this.player.grounded && !this.jumpStart) this.jumpStart = { x: this.player.position.x, z: this.player.position.z };
      if (this.player.grounded && this.jumpStart) {
        const jump = Math.hypot(this.player.position.x - this.jumpStart.x, this.player.position.z - this.jumpStart.z);
        this.stats.longestJump = Math.max(this.stats.longestJump ?? 0, jump);
        this.jumpStart = null;
      }
      this.hud.setSpeed(0, 'N');
      this.hud.setVehicle(null);
      if (this.player.speed > 1.5 && this.player.grounded) {
        this.footstepTimer -= dt;
        if (this.footstepTimer <= 0) {
          this.audio.footstep();
          this.footstepTimer = this.player.speed > 5.5 ? 0.28 : 0.42;
        }
      }
    }

    this.combat.updateReloads(dt, this.player.weapons);
    this.combat.update(dt, this.combatContext());
    this.hud.setAiming(this.player.aiming, this.player.crouching);
    this.hud.setWeapons(this.player.weapons, this.player.activeWeapon);
    this.hud.setHealth(this.player.health, this.player.armour);
    this.traffic.update(dt, this.player.position, { playerVehicle: this.player.inVehicle });
    this.pedestrians.update(dt, this.player.position);

    const seenByPolice = this.police.units.some((u) => !u.dead && u.distance < 55);
    this.wanted.update(dt, { seenByPolice, hidden: false, playerPos: this.player.position });
    this.police.update(dt, {
      player: this.player,
      playerPos: this.player.position,
      wantedStars: this.wanted.stars,
      playerOnFoot: !this.player.inVehicle,
      playerInVehicle: Boolean(this.player.inVehicle),
      playerSpeed: this.player.inVehicle ? this.player.inVehicle.kmh : this.player.speed * 3.6,
      playerShooting: this.playerShooting,
      onPoliceShot: (unit, targetPos) => this.handlePoliceShot(unit, targetPos),
    });

    if (!this.isShot) {
      this.economy.update(dt, { playerPos: this.player.position });
      this.missions.update(dt, { player: this.player, police: this.police });
      this.hud.setMission(this.missions.getCard());
    }
    this.hud.setDispatch(this.police.getHudUnits(), this.wanted.stars);
    this.updateEffects(dt);
    if (this.muzzle) this.muzzle.intensity = Math.max(0, this.muzzle.intensity - dt * 26);
    this.audio.update(dt, {
      rpm: engineRpm,
      driving,
      siren: this.police.units.some((unit) => unit.vehicle?.sirenOn),
    });
    this.updatePrompt();
    this.showCurrentDistrict();
    this.city.update(dt);
    if (this.shotCamera?.position && this.shotCamera?.lookAt) {
      this.engine.camera.position.copy(this.shotCamera.position);
      this.engine.camera.lookAt(this.shotCamera.lookAt);
      if (typeof this.shotCamera.fov === 'number') this.engine.camera.fov = this.shotCamera.fov;
      this.engine.camera.updateProjectionMatrix();
    } else {
      this.engine.followCamera(this.player, { dt });
    }
    this.hud.tick(dt);
    this.minimap.draw({
      player: this.player,
      vehicles: this.state.vehicles,
      police: this.police.units.filter((u) => !u.dead).map((u) => ({ ...u, position: u.position ?? u.vehicle?.position ?? u.mesh?.position })),
      mission: { marker: this.missions?.markerPosition ?? MARKERS[0] },
      collectibles: this.economy?.crabs ?? CRAB_SPOTS,
      district: districtAt(this.player.position.x, this.player.position.z),
    });
    this.playerShooting = false;
    this.input.endFrame();
  }

  render() {
    this.engine.render();
  }

  handleInput() {
    const input = this.input;
    for (let index = 0; index < WEAPON_KEYS.length; index += 1) {
      if (!input.wasPressed(WEAPON_KEYS[index])) continue;
      const weapon = this.player.weapons[index];
      if (!weapon?.unlocked) { this.audio.uiClick(); continue; }
      this.player.activeWeapon = weapon.id;
      this.audio.uiClick();
      this.hud.setWeapons(this.player.weapons, weapon.id);
    }
    if (input.wasPressed('KeyR') && !this.player.inVehicle) {
      const weapon = this.player.activeWeaponDef;
      if (this.combat.reload(weapon)) this.audio.uiClick();
    }
    if (input.wasPressed('KeyM')) {
      const muted = this.audio.toggleMute();
      this.hud.say('RADIO', muted ? 'Audio muted. Press M to bring the city back.' : 'Audio on.');
    }
    if (input.wasPressed('KeyB')) {
      const station = this.audio.cycleStation();
      this.state.radio.station = station.name;
      this.state.radio.track = station.track;
      this.hud.setRadio(station.name, station.track);
    }
    if (input.wasPressed('KeyH')) {
      const vehicle = this.player.inVehicle;
      if (vehicle) vehicle.horn();
      this.traffic.hornNear(this.player.position, 18);
      this.audio.horn();
      this.pedestrians.panicAt(this.player.position, 10, 'horn');
    }
    if (input.wasPressed('KeyE') && !this.player.inVehicle) this.handleInteract();

    if (input.wasPressed('KeyF')) {
      if (this.player.inVehicle) {
        const vehicle = this.player.inVehicle;
        if (this.player.exitVehicle()) {
          this.traffic.release(vehicle, this.player.position);
          if (vehicle.spec.police) this.audio.setSiren(false);
          this.hud.say('RAFA', 'Out of the car. Keep moving.');
        }
      } else {
        const nearby = this.findNearbyVehicle(5);
        if (nearby && this.player.enterVehicle(nearby)) {
          this.traffic.steal(nearby);
          if (nearby.parked) this.stats.carsStolen = (this.stats.carsStolen ?? 0) + 1;
          this.economy?.registerTheft(nearby);
          this.missions?.onEvent('enterVehicle', nearby);
          if (nearby.spec.police) this.wanted.reportCrime('theft_noticed', nearby.position);
          this.hud.say('RAFA', `Taking the ${nearby.name}.`);
        }
      }
    }

    const wheel = input.consumeWheel();
    if (wheel !== 0 && !this.player.inVehicle) {
      const unlocked = this.player.weapons.filter((w) => w.unlocked);
      const idx = unlocked.findIndex((w) => w.id === this.player.activeWeapon);
      const next = unlocked[(idx + (wheel > 0 ? 1 : -1) + unlocked.length) % unlocked.length];
      if (next) { this.player.activeWeapon = next.id; this.hud.setWeapons(this.player.weapons, next.id); }
    }

    const weapon = this.player.activeWeaponDef;
    const wantsFire = weapon?.automatic ? input.mouseDown(0) : input.wasPressed('Mouse0') || (input.mouseDown(0) && (weapon?.id === 'fists'));
    // fallback: mouseDown(0) always works for now
    const firePressed = input.mouseDown(0);
    if (firePressed && this.player.aiming && !this.player.busy && !this.player.inVehicle) {
      if (weapon?.automatic || input.wasPressed('Mouse0') || this.fireCooldown <= 0) this.fireShot();
    } else if (firePressed && !this.player.aiming && !this.player.busy && !this.player.inVehicle && weapon?.kind === 'melee') {
      this.fireShot();
    }
  }

  fireShot() {
    const weapon = this.player.activeWeaponDef;
    if (!weapon) return;
    const now = this.elapsed;
    if (!this.combat.canFire(weapon, now)) return;
    if (weapon.kind !== 'melee' && weapon.kind !== 'grenade' && weapon.ammo <= 0) {
      this.combat.reload(weapon);
      this.audio.uiClick();
      return;
    }
    const forwardX = Math.sin(this.player.viewYaw);
    const forwardZ = Math.cos(this.player.viewYaw);
    const dir = new THREE.Vector3(forwardX, -this.player.viewPitch * 0.5, forwardZ).normalize();
    const origin = new THREE.Vector3(this.player.position.x + forwardX * 0.7, 1.35, this.player.position.z + forwardZ * 0.7);
    const result = this.combat.tryFire(weapon, origin, dir, now, this.combatContext());
    if (!result?.fired) return;
    this.playerShooting = true;
    this.audio.gunshot(weapon.id);
    this.player.recoil = weapon.id === 'shotgun' ? 0.55 : weapon.id === 'rifle' ? 0.28 : 0.2;
    this.player.showMuzzleFlash(weapon.id === 'shotgun' ? 0.16 : 0.1);
    this.engine.addShake(weapon.id === 'shotgun' ? 0.3 : weapon.kind === 'grenade' ? 0.1 : 0.12);
    this.hud.setWeapons(this.player.weapons, weapon.id);
  }

  combatContext() {
    return {
      player: this.player,
      playerPos: this.player.position,
      playerVehicle: this.player.inVehicle,
      vehicles: this.state.vehicles,
      pedestrians: this.state.pedestrians,
      policeUnits: this.police.units,
      aiming: this.player.aiming,
    };
  }

  explodeAt(position, radius = 48) {
    this.audio.explosion();
    this.engine.addShake(0.9);
    this.pedestrians.panicAt(position, radius, 'explosion');
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(1, 12, 8),
      new THREE.MeshBasicMaterial({ color: '#ff9b4c', transparent: true, opacity: 1, depthWrite: false }),
    );
    sphere.position.set(position.x, 3, position.z);
    sphere.scale.setScalar(3);
    this.engine.scene.add(sphere);
    this.effects.push({ mesh: sphere, t: 0, duration: 1.1 });
  }

  updateEffects(dt) {
    for (const effect of [...this.effects]) {
      effect.t += dt;
      const progress = effect.t / effect.duration;
      effect.mesh.scale.setScalar(3 + progress * 22);
      effect.mesh.material.opacity = Math.max(0, 1 - progress);
      if (progress >= 1) {
        this.engine.scene.remove(effect.mesh);
        this.effects = this.effects.filter((item) => item !== effect);
      }
    }
  }

  findNearbyVehicle(range) {
    let closest = null;
    let closestDistance = range;
    for (const vehicle of this.state.vehicles) {
      const distance = Math.hypot(vehicle.position.x - this.player.position.x, vehicle.position.z - this.player.position.z);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = vehicle;
      }
    }
    return closest;
  }

  nearMissionMarker() {
    const position = this.missions?.markerPosition;
    if (!position || this.missions.active || this.missions.failed) return false;
    return Math.hypot(this.player.position.x - position.x, this.player.position.z - position.z) < 7;
  }

  nearGarage() {
    return Math.hypot(this.player.position.x - SPAWN_POINTS.garage.x, this.player.position.z - SPAWN_POINTS.garage.z) < 11;
  }

  handleInteract() {
    if (this.nearMissionMarker() && this.missions.availableJob) {
      this.missions.start(this.missions.availableJob.id);
      this.audio.uiClick();
      return;
    }
    if (this.nearGarage()) {
      this.menus.openGarage();
      this.audio.uiClick();
      return;
    }
    if (this.missions?.active && this.missions.failed) this.missions.retry();
  }

  updatePrompt() {
    if (this.player.busy) {
      this.hud.setPrompt('');
      return;
    }
    if (this.player.inVehicle) {
      this.hud.setPrompt('F · EXIT VEHICLE');
      return;
    }
    if (this.nearMissionMarker()) {
      this.hud.setPrompt(this.missions.markerPrompt);
      return;
    }
    if (this.nearGarage()) {
      this.hud.setPrompt('E · TAVO’S GARAGE · TUNE / RESPRAY');
      return;
    }
    const nearby = this.findNearbyVehicle(5);
    if (!nearby) {
      this.hud.setPrompt('');
      return;
    }
    this.hud.setPrompt(`F · ${nearby.parked ? 'STEAL' : 'DRIVE'} ${nearby.name.toUpperCase()}`);
  }

  updateRadioForWanted() {
    if (this.wanted.stars > 0) {
      if (this.audio.station.id !== 'scanner') {
        this._savedStation = this.audio.station.id;
        this.audio.setStation('scanner');
        this.hud.setRadio(this.audio.station.name, this.audio.station.track);
      }
    } else if (this._savedStation) {
      this.audio.setStation(this._savedStation);
      this._savedStation = null;
      this.hud.setRadio(this.audio.station.name, this.audio.station.track);
    }
  }

  handlePoliceShot(unit, targetPos) {
    const origin = new THREE.Vector3(unit.position.x, 1.3, unit.position.z);
    const dir = new THREE.Vector3(targetPos.x - origin.x, 0.2, targetPos.z - origin.z).normalize();
    dir.x += (Math.random() - 0.5) * 0.08;
    dir.z += (Math.random() - 0.5) * 0.08;
    dir.normalize();
    this.combat.spawnTracer(origin.clone().addScaledVector(dir, 0.8), origin.clone().addScaledVector(dir, 30), 0.8);
    this.audio.gunshot('pistol');
    const dist = Math.hypot(this.player.position.x - origin.x, this.player.position.z - origin.z);
    if (dist < 35) {
      const hitChance = Math.max(0.08, 0.32 - dist * 0.006);
      if (Math.random() < hitChance) {
        this.player.takeDamage(8);
        this.hud.flashDamage();
        if (this.player.health <= 0) this.handleWasted();
      }
    }
  }

  handleBusted() {
    if (this.gameOver) return;
    const missionHandled = this.missions?.onEvent('busted');
    if (missionHandled) {
      this.audio.setSiren(false);
      return;
    }
    this.gameOver = 'busted';
    this.audio.setSiren(false);
    this.hud.showMessage('BUSTED', 'PMPD TOOK YOU IN', true);
    this.hud.say('LT. BRUNA OCHOA', 'End of the road, Rafa.');
  }

  handleWasted() {
    if (this.gameOver) return;
    const missionHandled = this.missions?.onEvent('wasted');
    if (missionHandled) {
      this.audio.setSiren(false);
      return;
    }
    this.gameOver = 'wasted';
    this.audio.setSiren(false);
    this.hud.showMessage('WASTED', 'YOU DID NOT MAKE IT OUT OF PUERTO MAREA', true);
  }

  retry() {
    const retryMission = Boolean(this.missions?.failed && this.missions.job);
    this.gameOver = null;
    this.hud.hideMessage();
    this.hud.hideMissionCardEffects();
    this.player.health = 100;
    this.player.armour = 0;
    this.player.arrested = false;
    this.wanted.setStars(0, this.player.position);
    this.lastWantedStars = 0;
    this.police.clear();
    this.player.position.set(SPAWN_POINTS.onFoot.x, 0, SPAWN_POINTS.onFoot.z);
    this.player.mesh.position.copy(this.player.position);
    this.player.mesh.visible = true;
    if (this.player.inVehicle) {
      this.player.inVehicle.occupants = [];
      this.player.inVehicle = null;
    }
    this.hud.setHealth(100, 0);
    if (retryMission) {
      this.missions.retry();
      this.hud.say('MIRA KESANG', 'Reset. Same job, cleaner this time.');
    } else {
      this.missions.abandon();
      this.hud.setMission(this.missions.getCard());
      this.hud.say('MIRA KESANG', 'Shake it off, Rafa. Back on the street.');
    }
    this.engine.snapCamera(this.player);
  }

  captureSave() {
    return {
      cash: this.economy.cash,
      reputation: this.economy.reputation,
      xp: this.economy.reputation,
      rank: this.economy.rank,
      garage: this.economy.snapshot().garage,
      thefts: this.economy.snapshot().thefts,
      crabs: this.economy.snapshot().crabs,
      abilities: this.economy.snapshot().abilities,
      missions: this.missions.snapshot(),
      player: {
        x: this.player.position.x,
        z: this.player.position.z,
        health: this.player.health,
        armour: this.player.armour,
        weapons: this.player.weapons.filter((weapon) => weapon.unlocked).map((weapon) => weapon.id),
        activeWeapon: this.player.activeWeapon,
      },
      vehicle: this.player.inVehicle ? {
        type: this.player.inVehicle.type,
        x: this.player.inVehicle.position.x,
        z: this.player.inVehicle.position.z,
        heading: this.player.inVehicle.heading,
        colour: this.player.inVehicle.colour,
      } : null,
      timeOfDay: this.timeOfDay,
      wanted: this.wanted.stars,
      stats: { ...this.stats },
    };
  }

  defaultSaveData() {
    return {
      cash: 2450,
      reputation: 120,
      xp: 120,
      rank: 'DOCK HAND',
      garage: { engine: 0, tyres: 0, armour: 0 },
      thefts: {},
      crabs: [],
      abilities: {},
      missions: { completed: [], sideCompleted: [] },
      player: {
        x: SPAWN_POINTS.onFoot.x,
        z: SPAWN_POINTS.onFoot.z,
        health: 100,
        armour: 0,
        weapons: ['fists', 'pistol'],
        activeWeapon: 'pistol',
      },
      vehicle: null,
      timeOfDay: 17 + 20 / 60,
      wanted: 0,
      stats: {
        completion: 0,
        carsStolen: 0,
        copsEscaped: 0,
        highestWanted: 0,
        distanceDriven: 0,
        takenOut: 0,
        longestJump: 0,
      },
    };
  }

  restoreSave(data) {
    if (!data) return false;
    this.gameOver = null;
    this.jumpStart = null;
    this.hud.hideMessage();
    this.hud.hideMissionCardEffects();
    this.wanted.setStars(0, this.player.position);
    this.lastWantedStars = 0;
    this.police.clear();
    if (this.player.inVehicle) {
      const vehicle = this.player.inVehicle;
      this.player.exitVehicle();
      this.traffic.release(vehicle, this.player.position);
      this.player.inVehicle = null;
      this.player.transition = null;
    }
    const savedPlayer = data.player ?? {};
    const health = Math.max(1, Math.min(100, Number(savedPlayer.health) || 100));
    this.player.health = health;
    this.player.armour = Math.max(0, Math.min(100, Number(savedPlayer.armour) || 0));
    this.player.position.set(Number(savedPlayer.x) || SPAWN_POINTS.onFoot.x, 0, Number(savedPlayer.z) || SPAWN_POINTS.onFoot.z);
    this.player.mesh.position.copy(this.player.position);
    this.player.mesh.visible = true;
    this.player.transition = null;
    this.player.weapons = createLoadout();
    for (const id of savedPlayer.weapons ?? ['fists', 'pistol']) this.player.giveWeapon(id);
    this.player.activeWeapon = savedPlayer.activeWeapon ?? 'pistol';

    this.economy.restore(data);
    this.missions.restore(data.missions ?? {});
    this.stats = { ...this.defaultSaveData().stats, ...(data.stats ?? {}) };

    this.timeOfDay = Number(data.timeOfDay) || 17 + 20 / 60;
    this.engine.setTimeOfDay(this.timeOfDay);
    this.hud.setClock(this.timeOfDay);
    const stars = Math.max(0, Math.min(5, Number(data.wanted) || 0));
    this.wanted.setStars(stars, this.player.position);
    this.lastWantedStars = stars;

    if (data.vehicle?.type) {
      const spec = data.vehicle;
      const vehicle = new Vehicle({
        type: spec.type,
        x: Number(spec.x) || this.player.position.x,
        z: Number(spec.z) || this.player.position.z,
        heading: Number(spec.heading) || 0,
        colour: spec.colour,
      });
      vehicle.aiControlled = false;
      this.engine.scene.add(vehicle.mesh);
      this.traffic.vehicles.push(vehicle);
      this.traffic.parked.push(vehicle);
      this.economy.applyUpgrades(vehicle);
      this.player.enterVehicle(vehicle);
      this.traffic.steal(vehicle);
    }

    this.hud.setMoney(this.economy.cash);
    this.hud.setCrabs(this.economy.crabCount, this.economy.crabs.length);
    this.hud.setRep(this.economy.rank, this.economy.reputation, Math.max(1, this.economy.nextRank));
    this.hud.setHealth(this.player.health, this.player.armour);
    this.hud.setWeapons(this.player.weapons, this.player.activeWeapon);
    this.hud.setMission(this.missions.getCard());
    this.hud.setWanted(stars);
    this.hud.setSpeed(0, 'N');
    this.hud.setVehicle(null);
    this.lastDistrict = '';
    this.showCurrentDistrict();
    this.engine.snapCamera(this.player);
    this.menus.close();
    return true;
  }

  startNewGame() {
    this.restoreSave(this.defaultSaveData());
    this.hud.say('MIRA KESANG', 'Rafa, the coral Sprint is outside. Take it and disappear.');
  }

  continueGame() {
    const latest = this.saveGame.latest();
    const data = latest ? this.saveGame.load(latest.slot) : null;
    if (data) this.restoreSave(data);
    else this.startNewGame();
  }

  handleJobComplete(job) {
    this.stats.completion = Math.round((this.missions.completed.size / JOBS.length) * 100);
    this.saveGame.autosave(this.captureSave());
    this.hud.say('MIRA KESANG', `${job.title} is done. Keep moving, Rafa.`);
  }

  showCurrentDistrict() {
    const district = districtAt(this.player.position.x, this.player.position.z);
    if (district.id === this.lastDistrict) return;
    this.lastDistrict = district.id;
    this.hud.showDistrict(district.name, district.sub);
  }

  snapshot() {
    const player = this.player;
    return {
      ready: this.ready,
      time: Number(this.elapsed.toFixed(2)),
      timeOfDay: Number(this.timeOfDay.toFixed(3)),
      district: districtAt(player.position.x, player.position.z).name,
      player: {
        x: Number(player.position.x.toFixed(2)),
        y: Number(player.position.y.toFixed(2)),
        z: Number(player.position.z.toFixed(2)),
        health: player.health,
        aiming: player.aiming,
        crouching: player.crouching,
        inVehicle: player.inVehicle?.name ?? null,
      },
      vehicles: this.state.vehicles.length,
      traffic: this.traffic.countNearby(player.position, 150),
      police: this.state.police.length,
      pedestrians: this.pedestrians.countNearby(player.position, 120),
      radio: this.audio.station.name,
      wanted: this.state.wanted.stars,
      hud: document.getElementById('district-name')?.textContent ?? '',
      mission: this.missions.getCard(),
      cash: this.economy.cash,
      rank: this.economy.rank,
      crabs: this.economy.crabCount,
      stats: { ...this.stats },
      menu: this.menus.mode,
    };
  }
}

const game = new MareaRojaGame();
game.start();

export default game;
