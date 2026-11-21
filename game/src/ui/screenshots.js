// Screenshot presets: stage cinematic scenes for capture, reachable by ?shot=name.

import { MARKERS } from '../world/cityLayout.js';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

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
function lockCamera(game, blended, shotSpeed = null) {
  game.player.transition = null;
  game.player.cameraBlend = blended ? 1 : 0;
  game.player.cameraBlendTarget = blended ? 1 : 0;
  game.shotSpeed = shotSpeed;
  game.engine.snapCamera(game.player);
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
  game.player.position.set(-190, 0, 60.5);
  game.player.mesh.position.copy(game.player.position);
  game.player.viewYaw = 0.2;
  game.player.aiming = true;
  game.player.giveWeapon('pistol');
  game.player.activeWeapon = 'pistol';
  game.wanted.setStars(2, game.player.position);
  game.police.dispatch(2, game.player.position);
  game.hud.setMission({ job: 'JOB 05 · THE INFORMANT', stage: 'STAGE 2 / 3', stageIndex: 2, stageCount: 3, objective: 'Hold off the Cangrejo gunmen', nextHint: 'GET KIKI TO THE VAN' });
  game.hud.say('KIKI SOL', 'They are coming through the stalls!');
  await settle(game, 60);
  lockCamera(game, false);
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
