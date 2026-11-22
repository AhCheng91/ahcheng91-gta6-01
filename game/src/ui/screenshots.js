// Screenshot presets: stage cinematic scenes for capture, reachable by ?shot=name.

import * as THREE from 'three';
import { MARKERS, isBuildingFootprint } from '../world/cityLayout.js';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

const defaultFollowCamera = new WeakMap();

function restoreFollowCamera(game) {
  const original = defaultFollowCamera.get(game.engine);
  if (original) game.engine.followCamera = original;
}

function pinCamera(game, desired, lookAt) {
  if (!defaultFollowCamera.has(game.engine)) defaultFollowCamera.set(game.engine, game.engine.followCamera.bind(game.engine));
  game.engine.followCamera = function pinnedFollowCamera() {
    this.camera.position.copy(desired);
    this.camera.lookAt(lookAt);
    this.camera.updateProjectionMatrix();
    this.sun.target.position.set(game.player.position.x, 0, game.player.position.z);
    this.sun.target.updateMatrixWorld();
    this.sun.position.copy(this.sun.target.position).addScaledVector(this.sunDirection, 220);
  };
  game.engine.camera.position.copy(desired);
  game.engine.camera.lookAt(lookAt);
  game.engine.camera.updateProjectionMatrix();
}

export async function applyScreenshotPreset(game, name) {
  if (!name) return false;
  const shot = String(name).toLowerCase();
  if (shot === 'chase') return stageChase(game);
  if (shot === 'shootout') return stageShootout(game);
  if (shot === 'drive') return stageDrive(game);
  if (shot === 'menu') return stageMenu(game);
  return false;
}

async function settle(game, frames = 90) {
  for (let i = 0; i < frames; i += 1) {
    await new Promise((r) => requestAnimationFrame(r));
  }
}

// Shots must not depend on how many rAF ticks the capture browser managed: lock the
// vehicle transition/camera blend and snap the boom before the first rendered frame.
function lockCamera(game, blended, shotSpeed = null, cameraOpts = null) {
  game.player.transition = null;
  game.player.cameraBlend = blended ? 1 : 0;
  game.player.cameraBlendTarget = blended ? 1 : 0;
  game.shotSpeed = shotSpeed;
  game.shotCamera = cameraOpts;
  game.engine.snapCamera(game.player, cameraOpts ?? {});
}

async function stageChase(game) {
  game.timeOfDay = 17.8;
  game.engine.setTimeOfDay(game.timeOfDay);
  const hero = game.heroVehicle;
  if (hero) {
    hero.position.set(-40, 0, -22);
    hero.heading = Math.PI / 2;
    hero.speed = 22;
    hero.mesh.position.copy(hero.position);
    hero.mesh.rotation.y = hero.heading;
    game.player.enterVehicle(hero);
    game.player.mesh.visible = false;
    game.player.position.copy(hero.position);
  }
  game.player.giveWeapon('pistol');
  game.player.giveWeapon('smg');
  game.player.giveWeapon('shotgun');
  game.hud.setWeapons(game.player.weapons, 'smg');
  game.player.activeWeapon = 'smg';
  game.wanted.setStars(3, game.player.position);
  game.police.dispatch(3, game.player.position);
  // place police behind and ahead
  const units = game.police.units.filter((u) => u.kind === 'CRUISER');
  if (units[0]?.vehicle) { units[0].vehicle.position.set(-70, 0, -22); units[0].vehicle.heading = Math.PI / 2; units[0].vehicle.speed = 24; }
  if (units[1]?.vehicle) { units[1].vehicle.position.set(-85, 0, -19); units[1].vehicle.heading = Math.PI / 2; units[1].vehicle.speed = 23; }
  if (units[2]?.vehicle) { units[2].vehicle.position.set(20, 0, -22); units[2].vehicle.heading = -Math.PI / 2; units[2].vehicle.speed = 5; units[2].tactic = 'ROADBLOCK'; }
  if (units[3]?.vehicle) { units[3].vehicle.position.set(-60, 0, -25); units[3].vehicle.heading = Math.PI / 2; units[3].vehicle.speed = 24; }
  game.police.ensureHelicopter(game.player.position);
  game.hud.setMission({ job: 'JOB 06 · CORONA TOWER JOB', stage: 'STAGE 3 / 4', stageIndex: 3, stageCount: 4, objective: 'Escape the Corona cordon', nextHint: 'REACH THE CAUSEWAY' });
  game.hud.say('LT. BRUNA OCHOA', 'All units, box him in on the Malecón!');
  game.hud.setRadio('PMPD SCANNER', 'DISPATCH 10-42');
  await settle(game, 60);
  lockCamera(game, true, 22);
  return true;
}

async function stageShootout(game) {
  game.timeOfDay = 22.3;
  game.engine.setTimeOfDay(game.timeOfDay);
  restoreFollowCamera(game);

  const playerPos = new THREE.Vector3(-190, 0, 52);
  const facing = -Math.PI / 2;
  game.player.aimingOverride = true;
  game.player.position.copy(playerPos);
  game.player.mesh.position.copy(playerPos);
  game.player.viewYaw = facing;
  game.player.facing = facing;
  game.player.mesh.rotation.y = facing;
  game.player.aiming = true;
  game.player.giveWeapon('pistol');
  game.player.activeWeapon = 'pistol';
  game.hud.setWeapons(game.player.weapons, 'pistol');
  game.wanted.setStars(2, playerPos);
  game.police.dispatch(2, playerPos);
  game.hud.setMission({ job: 'JOB 05 · THE INFORMANT', stage: 'STAGE 2 / 3', stageIndex: 2, stageCount: 3, objective: 'Hold off the Cangrejo gunmen', nextHint: 'GET KIKI TO THE VAN' });
  game.hud.say('KIKI SOL', 'They are coming through the stalls!');
  game.hud.setRadio('PMPD SCANNER', 'SHOOTS FIRED · CALLE SAL');
  game.hud.setAiming(true, false);
  await settle(game, 45);

  const forward = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
  const right = new THREE.Vector3(Math.cos(facing), 0, -Math.sin(facing));
  const cameraPos = playerPos.clone().addScaledVector(forward, -3.4).addScaledVector(right, 0.9);
  cameraPos.y = 1.85;
  const lookAt = playerPos.clone().addScaledVector(forward, 8).setY(1.45);

  const cameraDistance = cameraPos.distanceTo(playerPos);
  const buildingNearby = isBuildingFootprint(cameraPos.x, cameraPos.z, 2);
  console.info('[shot:shootout]', { cameraDistance, buildingNearby, cameraPos: cameraPos.toArray(), playerPos: playerPos.toArray() });
  console.assert(cameraDistance >= 3, 'shootout camera must be >= 3m from player');
  console.assert(!buildingNearby, 'shootout camera must be >= 2m from building colliders');

  const cruisers = game.police.units.filter((unit) => unit.kind === 'CRUISER' && unit.vehicle).slice(0, 2);
  const cruiserSpots = [
    { x: playerPos.x - 10, z: 55.5, heading: Math.PI / 2 },
    { x: playerPos.x - 14, z: 48.5, heading: Math.PI / 2 },
  ];
  cruisers.forEach((unit, index) => {
    const vehicle = unit.vehicle;
    const spot = cruiserSpots[index];
    if (!spot) return;
    vehicle.position.set(spot.x, 0, spot.z);
    vehicle.heading = spot.heading;
    vehicle.speed = 0;
    vehicle.maxSpeed = 0;
    vehicle.mesh.position.copy(vehicle.position);
    vehicle.mesh.rotation.y = vehicle.heading;
    if (typeof vehicle.setSiren === 'function') vehicle.setSiren(true);
    unit.position = vehicle.position;
    unit.tactic = 'HOLD';
  });

  game.pedestrians.peds.slice(0, 4).forEach((ped, index) => {
    const laneZ = 52 + (index % 2 ? 2.8 : -2.8);
    ped.position.set(playerPos.x - 6 - index * 3.5, 0, laneZ);
    ped.panicDirection = { x: right.x, z: right.z };
    ped.mode = 'panic';
    ped.timer = 9;
    ped.target = null;
    ped.group.position.copy(ped.position);
    ped.heading = Math.atan2(ped.panicDirection.x, ped.panicDirection.z);
    ped.group.rotation.y = ped.heading;
  });

  game.player.aiming = true;
  game.player.showMuzzleFlash(3);
  game.shotSpeed = null;
  game.shotCamera = null;
  lockCamera(game, false, null, {});
  pinCamera(game, cameraPos, lookAt);
  return true;
}

async function stageDrive(game) {
  game.timeOfDay = 16.5;
  game.engine.setTimeOfDay(game.timeOfDay);
  const hero = game.heroVehicle;
  if (hero) {
    hero.position.set(-250, 0, -22);
    hero.heading = Math.PI / 2;
    hero.speed = 16;
    hero.mesh.position.copy(hero.position);
    hero.mesh.rotation.y = hero.heading;
    game.player.enterVehicle(hero);
    game.player.mesh.visible = false;
    game.player.position.copy(hero.position);
  }
  game.wanted.setStars(0, game.player.position);
  game.police.clear();
  game.hud.setMission({ job: 'FREE ROAM', stage: 'CRUISING', stageIndex: 1, stageCount: 1, objective: 'Drive the Playa Ceniza coast', nextHint: 'CHECK THE MAP FOR JOBS' });
  game.hud.say('MIRA KESANG', 'Keep it smooth, Rafa. Puerto Marea is watching.');
  game.hud.setRadio('LAGOON FM 98.1', 'SYNTHWAVE');
  await settle(game, 60);
  lockCamera(game, true, 16);
  return true;
}

async function stageMenu(game) {
  game.timeOfDay = 18.0;
  game.engine.setTimeOfDay(game.timeOfDay);
  game.wanted.setStars(0, game.player.position);
  game.police.clear();
  game.hud.setMission({ job: 'JOB 03 · DOCK HEIST', stage: 'STAGE 2 / 3', stageIndex: 2, stageCount: 3, objective: 'Steal the manifest van at Puerto Nuevo', nextHint: 'LOSE THE TWO-STAR RESPONSE' });
  game.menus.openPause('MAP');
  await settle(game, 40);
  lockCamera(game, false);
  return true;
}
