// Screenshot presets: stage cinematic scenes for capture, reachable by ?shot=name.

import * as THREE from 'three';
import { BLOCKS, MARKERS, ROADS, isBuildingFootprint } from '../world/cityLayout.js';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function pinCamera(game, desired, lookAt, fov = game.engine.camera.fov) {
  game.shotCamera = { position: desired.clone(), lookAt: lookAt.clone(), fov };
  game.engine.camera.position.copy(desired);
  game.engine.camera.lookAt(lookAt);
  game.engine.camera.fov = fov;
  game.engine.camera.updateProjectionMatrix();
  game.engine.camera.updateMatrixWorld(true);
  game.engine.sun.target.position.set(game.player.position.x, 0, game.player.position.z);
  game.engine.sun.target.updateMatrixWorld();
  game.engine.sun.position.copy(game.engine.sun.target.position).addScaledVector(game.engine.sunDirection, 220);
}

let spotPoolTexture = null;

function radialSpotTexture() {
  if (spotPoolTexture) return spotPoolTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.45, 'rgba(255, 255, 255, 0.55)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  spotPoolTexture = new THREE.CanvasTexture(canvas);
  spotPoolTexture.colorSpace = THREE.SRGBColorSpace;
  return spotPoolTexture;
}

function ensureGroundSpotlightPool(game, target) {
  const existing = game.engine.scene.getObjectByName('heli-spotlight-pool');
  if (existing) {
    existing.position.set(target.x, 0.03, target.z);
    return existing;
  }
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(4.5, 48),
    new THREE.MeshBasicMaterial({
      map: radialSpotTexture(),
      color: '#dfe9ff',
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );
  pool.name = 'heli-spotlight-pool';
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(target.x, 0.03, target.z);
  game.engine.scene.add(pool);
  return pool;
}

function verifyShotCamera(game, intended, points, label) {
  const camera = game.engine.camera;
  const actual = camera.position.clone();
  const error = actual.distanceTo(intended);
  const span = projectedSpan(camera, points);
  console.info(`[shot:${label}:camera]`, JSON.stringify({
    intended: intended.toArray().map((v) => Number(v.toFixed(3))),
    actual: actual.toArray().map((v) => Number(v.toFixed(3))),
    errorMetres: Number(error.toFixed(3)),
    heroBounds: span ? {
      minX: Number(span.minX.toFixed(3)),
      maxX: Number(span.maxX.toFixed(3)),
      minY: Number(span.minY.toFixed(3)),
      maxY: Number(span.maxY.toFixed(3)),
    } : null,
  }));
  console.assert(error <= 0.05, `${label} camera must be within 0.05m of the pinned position`);
  console.assert(span && span.minX >= -1 && span.maxX <= 1 && span.minY >= -1 && span.maxY <= 1, `${label} hero car must sit fully inside the frame`);
  console.assert(span && span.minY > -0.75, `${label} hero car bottom edge must stay above -0.75 NDC`);
}

// Screen-space helpers: every key-art frame is checked before the capture runs.
function frameBasis(heading) {
  const forward = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
  const left = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));
  const right = left.clone().negate();
  return { forward, left, right };
}

function projectPoint(camera, point) {
  return point.clone().project(camera);
}

function pointInFrame(camera, point, margin = 1) {
  const view = point.clone().applyMatrix4(camera.matrixWorldInverse);
  if (view.z > -camera.near) return false;
  const ndc = projectPoint(camera, point);
  return Math.abs(ndc.x) <= margin && Math.abs(ndc.y) <= margin;
}

function projectedSpan(camera, points) {
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity; let visible = false;
  for (const point of points) {
    const view = point.clone().applyMatrix4(camera.matrixWorldInverse);
    if (view.z > -camera.near) continue;
    const ndc = projectPoint(camera, point);
    visible = true;
    minX = Math.min(minX, ndc.x); maxX = Math.max(maxX, ndc.x);
    minY = Math.min(minY, ndc.y); maxY = Math.max(maxY, ndc.y);
  }
  return visible ? { minX, maxX, minY, maxY, width: (maxX - minX) / 2, height: (maxY - minY) / 2 } : null;
}

function meshSilhouettePoints(root) {
  root.updateMatrixWorld(true);
  const points = [];
  root.traverse((object) => {
    if (!object.isMesh || !object.visible) return;
    if (String(object.name).toLowerCase().includes('contact shadow')) return;
    const geometry = object.geometry;
    if (!geometry) return;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) points.push(new THREE.Vector3(x, y, z).applyMatrix4(object.matrixWorld));
      }
    }
  });
  return points;
}

function vehicleCorners(vehicle) {
  const spec = vehicle.spec ?? {};
  const halfLength = (spec.length ?? 4.4) / 2;
  const halfWidth = (spec.width ?? 1.95) / 2;
  const roof = 1.5 + 0.6 * (spec.cabin ?? 0.7);
  const { forward, left } = frameBasis(vehicle.heading ?? 0);
  const points = [];
  for (const lx of [-halfWidth, halfWidth]) {
    for (const lz of [-halfLength, halfLength]) {
      for (const y of [0, roof]) {
        points.push(vehicle.position.clone().addScaledVector(left, lx).addScaledVector(forward, lz).setY(y));
      }
    }
  }
  return points;
}

function fitHeroCamera(game, car, forward, options = {}) {
  const distances = options.distances ?? [9, 11, 13, 15];
  const offsets = options.offsets ?? [-2.4, -1.2, 0, 1.2, 2.4];
  const heights = options.heights ?? [2.0, 2.4];
  const fov = options.fov ?? 62;
  const minWidth = options.minWidth ?? 0.22;
  const maxWidth = options.maxWidth ?? 0.5;
  const camera = game.engine.camera;
  const right = new THREE.Vector3(-forward.z, 0, forward.x);
  const points = car ? vehicleCorners(car) : [];
  const lookAt = car
    ? car.position.clone().addScaledVector(forward, 12).add(new THREE.Vector3(0, 1.2, 0))
    : new THREE.Vector3();

  const tryCandidate = (distance, offset, height) => {
    const position = car.position.clone().addScaledVector(forward, -distance).addScaledVector(right, offset).setY(height);
    camera.position.copy(position);
    camera.fov = fov;
    camera.updateProjectionMatrix();
    camera.lookAt(lookAt);
    camera.updateMatrixWorld(true);
    const span = projectedSpan(camera, points);
    return { position, span };
  };

  let chosen = null;
  for (const distance of distances) {
    for (const offset of offsets) {
      for (const height of heights) {
        const { position, span } = tryCandidate(distance, offset, height);
        if (!span) continue;
        const inside = span.minX > -0.85 && span.maxX < 0.85 && span.minY > -0.9 && span.maxY < 0.75;
        const sized = span.width >= minWidth && span.width <= maxWidth;
        if (!inside || !sized) continue;
        chosen = { distance, offset, height, position, span };
        break;
      }
      if (chosen) break;
    }
    if (chosen) break;
  }

  if (!chosen) {
    const distance = 13;
    const offset = 0;
    const height = 2.4;
    const { position, span } = tryCandidate(distance, offset, height);
    chosen = { distance, offset, height, position, span };
  }

  const ndc = chosen.span ? {
    minX: Number(chosen.span.minX.toFixed(3)),
    maxX: Number(chosen.span.maxX.toFixed(3)),
    minY: Number(chosen.span.minY.toFixed(3)),
    maxY: Number(chosen.span.maxY.toFixed(3)),
  } : null;
  const report = {
    distance: chosen.distance,
    offset: chosen.offset,
    height: chosen.height,
    ndc,
  };
  console.info('[shot:fit]', JSON.stringify(report));
  return { position: chosen.position, lookAt, fov, report };
}

function largestBuildingFaceFraction(camera) {
  let largest = 0;
  for (const block of BLOCKS) {
    const faces = [
      { x1: block.x - block.width / 2, x2: block.x + block.width / 2, z1: block.z - block.depth / 2, z2: block.z - block.depth / 2 },
      { x1: block.x - block.width / 2, x2: block.x + block.width / 2, z1: block.z + block.depth / 2, z2: block.z + block.depth / 2 },
      { x1: block.x - block.width / 2, x2: block.x - block.width / 2, z1: block.z - block.depth / 2, z2: block.z + block.depth / 2 },
      { x1: block.x + block.width / 2, x2: block.x + block.width / 2, z1: block.z - block.depth / 2, z2: block.z + block.depth / 2 },
    ];
    for (const face of faces) {
      const points = [];
      for (const x of [face.x1, face.x2]) {
        for (const z of [face.z1, face.z2]) {
          points.push(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, block.height, z));
        }
      }
      const span = projectedSpan(camera, points);
      if (span) {
        const clipped = Math.max(0, (Math.min(1, span.maxX) - Math.max(-1, span.minX)) / 2);
        largest = Math.max(largest, clipped);
      }
    }
  }
  return largest;
}

function aabbDistance(point, prop) {
  const dx = Math.max(prop.minX - point.x, 0, point.x - prop.maxX);
  const dz = Math.max(prop.minZ - point.z, 0, point.z - prop.maxZ);
  return Math.hypot(dx, dz);
}

function countNearbyObjects(game, point, radius = 6) {
  const hero = game.heroVehicle;
  const policeVehicles = new Set(game.police.units.map((unit) => unit.vehicle).filter(Boolean));
  const report = { parked: 0, moving: 0, police: 0, props: 0 };
  for (const vehicle of game.traffic.vehicles) {
    if (vehicle === hero) continue;
    const distance = Math.hypot(vehicle.position.x - point.x, vehicle.position.z - point.z);
    if (distance > radius) continue;
    if (policeVehicles.has(vehicle)) report.police += 1;
    else if (vehicle.parked) report.parked += 1;
    else report.moving += 1;
  }
  for (const prop of game.city.props) if (aabbDistance(point, prop) <= radius) report.props += 1;
  return report;
}

function clearTrafficNear(game, point, radius = 30) {
  const policeVehicles = new Set(game.police.units.map((unit) => unit.vehicle).filter(Boolean));
  for (const vehicle of game.traffic.vehicles) {
    if (vehicle === game.heroVehicle || policeVehicles.has(vehicle)) continue;
    if (Math.hypot(vehicle.position.x - point.x, vehicle.position.z - point.z) > radius) continue;
    vehicle.position.set(point.x - 160, 0, point.z + 120);
    vehicle.mesh.position.copy(vehicle.position);
    vehicle.speed = 0;
    vehicle.maxSpeed = 0;
    vehicle.aiControlled = false;
  }
}

function hideCrosswalkPaint(game, centre, range = 100) {
  const dummy = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  game.engine.scene.traverse((object) => {
    if (!object.isInstancedMesh || object.name !== 'Road markings') return;
    for (let index = 0; index < object.count; index += 1) {
      object.getMatrixAt(index, dummy);
      dummy.decompose(position, quaternion, scale);
      const crosswalkPaint = position.y > 0.0565 && position.z > -31 && position.z < -13;
      const nearHero = Math.abs(position.x - centre.x) < range;
      if (crosswalkPaint && nearHero) {
        scale.set(0.0001, 0.0001, 0.0001);
        dummy.compose(position, quaternion, scale);
        object.setMatrixAt(index, dummy);
      }
    }
    object.instanceMatrix.needsUpdate = true;
  });
}

function crosswalkCentres() {
  const road = ROADS.find((item) => item.id === 'malecon');
  const centres = [];
  for (const other of ROADS) {
    if (other.axis === road.axis || other.at < road.from || other.at > road.to) continue;
    for (const approach of [-1, 1]) {
      centres.push({ x: other.at + approach * (other.width / 2 + 3.4), z: road.at });
    }
  }
  return centres;
}

function visibleCrosswalks(camera, hero) {
  const carSpan = projectedSpan(camera, vehicleCorners(hero));
  return crosswalkCentres().filter((centre) => {
    if (Math.hypot(centre.x - hero.position.x, centre.z - hero.position.z) > 26) return false;
    const point = new THREE.Vector3(centre.x, 0.06, centre.z);
    if (!pointInFrame(camera, point)) return false;
    if (!carSpan) return true;
    const ndc = projectPoint(camera, point);
    const hiddenByCar = ndc.x > carSpan.minX - 0.04 && ndc.x < carSpan.maxX + 0.04
      && ndc.y > carSpan.minY - 0.04 && ndc.y < carSpan.maxY + 0.04;
    return !hiddenByCar;
  }).length;
}

function logShotStats(game) {
  const renderer = game.engine.renderer;
  const shadow = game.engine.shadowReport();
  console.info('[shot:render]', JSON.stringify({
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    shadowMapEnabled: renderer.shadowMap.enabled,
    sunCastShadow: game.engine.sun.castShadow,
    shadowMapSize: [game.engine.sun.shadow.mapSize.x, game.engine.sun.shadow.mapSize.y],
    shadowCameraBounds: shadow.bounds,
    shadowBias: game.engine.sun.shadow.bias,
    shadowNormalBias: game.engine.sun.shadow.normalBias,
  }));
}

export async function applyScreenshotPreset(game, name) {
  if (!name) return false;
  const shot = String(name).toLowerCase();
  async function run(stage) {
    const result = await stage(game);
    logShotStats(game);
    return result;
  }
  if (shot === 'chase') return run(stageChase);
  if (shot === 'shootout') return run(stageShootout);
  if (shot === 'drive') return run(stageDrive);
  if (shot === 'menu') return run(stageMenu);
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
  game.shotCamera = cameraOpts?.position && cameraOpts?.lookAt
    ? { position: cameraOpts.position.clone(), lookAt: cameraOpts.lookAt.clone(), fov: cameraOpts.fov ?? game.engine.camera.fov }
    : null;
  game.engine.snapCamera(game.player, cameraOpts ?? {});
}

function coastHeroPlacement(game) {
  const heading = Math.PI / 2;
  const { forward, left } = frameBasis(heading);
  const startX = -250;
  const laneZ = -21.3;
  const hero = game.heroVehicle;

  const makeFrame = (x) => {
    const carPos = new THREE.Vector3(x, 0, laneZ);
    const cameraPos = carPos.clone().addScaledVector(forward, -6.8).addScaledVector(left, 3.5).setY(2.3);
    const lookAt = carPos.clone().addScaledVector(forward, 20).setY(1.2);
    return { carPos, cameraPos, lookAt };
  };

  let chosen = null;
  let chosenVisible = Infinity;
  for (const offset of [20, 19, 18, 17, 16, 15, 14, 13, 12, -12, -13, -14, -15, -16, -17, -18, -19, -20]) {
    const frame = makeFrame(startX + offset);
    const probe = game.engine.camera.clone();
    probe.position.copy(frame.cameraPos);
    probe.lookAt(frame.lookAt);
    probe.fov = 66;
    probe.updateProjectionMatrix();
    probe.updateMatrixWorld(true);
    const testHero = { position: frame.carPos, heading, spec: hero?.spec };
    const visible = visibleCrosswalks(probe, testHero);
    if (visible < chosenVisible) { chosen = frame; chosenVisible = visible; }
    if (visible === 0) break;
  }
  return { heroPos: chosen.carPos, heading, forward, left };
}

async function stageChase(game) {
  game.timeOfDay = 17.6;
  game.engine.setTimeOfDay(game.timeOfDay);

  const hero = game.heroVehicle;
  const { heroPos, heading, forward } = coastHeroPlacement(game);
  const { right } = frameBasis(heading);
  const wheelbase = (hero?.spec?.length ?? 4.5) * 0.32;
  const rearAxle = heroPos.clone().addScaledVector(forward, -wheelbase);

  game.shotSpeed = 0;
  if (hero) {
    hero.position.copy(heroPos);
    hero.heading = heading;
    hero.speed = 0;
    hero.braking = true;
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
  game.police.ensureHelicopter(game.player.position);

  game.hud.setMission({ job: 'JOB 06 · CORONA TOWER JOB', stage: 'STAGE 3 / 4', stageIndex: 3, stageCount: 4, objective: 'Escape the Corona cordon', nextHint: 'REACH THE CAUSEWAY' });
  game.hud.say('LT. BRUNA OCHOA', 'All units, box him in on the Malecón!');
  game.hud.setRadio('PMPD SCANNER', 'DISPATCH 10-42');
  await settle(game, 60);

  game.police.dispatch = () => {};
  game.police.cooldowns.roadblock = 9999;
  clearTrafficNear(game, heroPos, 20);

  const extras = game.police.units.filter((unit) => unit.kind === 'CRUISER' && unit.vehicle);
  while (extras.length > 3) game.police.removeUnit(extras.pop());
  for (const unit of [...game.police.units]) {
    if (unit.kind === 'ROADBLOCK' || unit.kind === 'FOOT') game.police.removeUnit(unit);
  }

  if (hero) {
    hero.position.copy(heroPos);
    hero.heading = heading;
    hero.speed = 0;
    hero.braking = true;
    hero.mesh.position.copy(hero.position);
    hero.mesh.rotation.y = hero.heading;
    game.player.position.copy(hero.position);
  }

  if (hero) {
    const baseUpdate = hero.update.bind(hero);
    hero.update = (dt) => {
      baseUpdate(dt);
      for (const lamp of hero.brakeLights) lamp.material.color.set('#ff2a20');
    };
  }

  const cruisers = game.police.units.filter((u) => u.kind === 'CRUISER' && u.vehicle);
  cruisers.forEach((unit, index) => {
    const vehicle = unit.vehicle;
    if (!vehicle) return;
    if (index < 2) {
      const behind = 8 + index * 2;
      const lateral = index === 0 ? 2.5 : -2.5;
      vehicle.position.copy(heroPos).addScaledVector(forward, -behind).addScaledVector(right, lateral);
      vehicle.heading = Math.atan2(heroPos.x - vehicle.position.x, heroPos.z - vehicle.position.z);
      vehicle.speed = 0;
      vehicle.maxSpeed = 0;
      vehicle.parked = false;
      vehicle.mesh.position.copy(vehicle.position);
      vehicle.mesh.rotation.y = vehicle.heading;
      if (typeof vehicle.setSiren === 'function') vehicle.setSiren(true);
      unit.position = vehicle.position;
      unit.tactic = 'PURSUIT';
    } else {
      vehicle.position.set(heroPos.x - 210 - index * 12, 0, heroPos.z + 8);
      vehicle.speed = 0;
      vehicle.maxSpeed = 0;
      vehicle.mesh.position.copy(vehicle.position);
      unit.position = vehicle.position;
      unit.tactic = 'STANDBY';
    }
  });

  const heli = game.police.units.find((u) => u.kind === 'HELICOPTER' && !u.dead);
  if (heli) {
    heli.kind = 'STATIC';
    heli.mesh.position.copy(heroPos).addScaledVector(forward, 10).setY(20);
    heli.position = heli.mesh.position;
    if (heli.spotlight) {
      heli.spotlight.position.copy(heli.mesh.position);
      heli.spotlight.target.position.copy(heroPos).addScaledVector(forward, 25).setY(0.5);
      heli.spotlight.intensity = 42;
    }
    if (heli.spotlightCone) heli.spotlightCone.visible = false;
    ensureGroundSpotlightPool(game, heroPos.clone().addScaledVector(forward, 25).setY(0.03));
    game.police.units = game.police.units.filter((unit) => unit !== heli);
    game.police.onDispatchChange(game.police.getHudUnits());
  }

  const fit = fitHeroCamera(game, hero, forward);
  const cameraPos = fit.position;
  const lookAt = fit.lookAt;
  game.shotSpeed = 0;
  game.shotCamera = null;
  lockCamera(game, true, 0, {});
  pinCamera(game, cameraPos, lookAt, fit.fov);
  verifyShotCamera(game, cameraPos, hero ? vehicleCorners(hero) : [], 'chase');

  const carSpan = projectedSpan(game.engine.camera, hero ? vehicleCorners(hero) : []);
  const nearby = countNearbyObjects(game, cameraPos, 6);
  const wallFraction = largestBuildingFaceFraction(game.engine.camera);
  const report = {
    cameraToCar: Number(cameraPos.distanceTo(heroPos).toFixed(2)),
    cameraToRearAxle: Number(cameraPos.distanceTo(rearAxle).toFixed(2)),
    nearby,
    largestBuildingFaceOfFrame: Number(wallFraction.toFixed(3)),
    carFrameBounds: carSpan ? { minX: Number(carSpan.minX.toFixed(2)), maxX: Number(carSpan.maxX.toFixed(2)), minY: Number(carSpan.minY.toFixed(2)), maxY: Number(carSpan.maxY.toFixed(2)) } : null,
  };
  console.info('[shot:chase]', JSON.stringify(report));
  console.assert(nearby.parked === 0 && nearby.props === 0 && nearby.moving === 0, 'chase camera must be clear of parked vehicles and props within 6m');
  console.assert(wallFraction < 0.45, 'chase largest building face must stay under 45% of frame width');
  console.assert(carSpan && carSpan.minX > -1 && carSpan.maxX < 1 && carSpan.minY > -1 && carSpan.maxY < 1, 'chase hero car must sit fully inside the frame');
  return true;
}

async function stageShootout(game) {
  game.timeOfDay = 22.1;
  game.engine.setTimeOfDay(game.timeOfDay);

  const playerPos = new THREE.Vector3(-190, 0, 52);
  const facing = -Math.PI / 2;
  const { forward, right } = frameBasis(facing);
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

  game.police.dispatch = () => {};

  const cruisers = game.police.units.filter((unit) => unit.kind === 'CRUISER' && unit.vehicle);
  cruisers.forEach((unit, index) => {
    const vehicle = unit.vehicle;
    if (index < 2) {
      const ahead = 11.2 + index * 2.4;
      const side = index === 0 ? 2.2 : -2.2;
      vehicle.position.copy(playerPos).addScaledVector(forward, ahead).addScaledVector(right, side);
      vehicle.heading = Math.PI / 2;
      vehicle.speed = 0;
      vehicle.maxSpeed = 0;
      vehicle.parked = false;
      vehicle.mesh.position.copy(vehicle.position);
      vehicle.mesh.rotation.y = vehicle.heading;
      if (typeof vehicle.setSiren === 'function') vehicle.setSiren(true);
      unit.position = vehicle.position;
      unit.tactic = 'HOLD';
    } else {
      vehicle.position.set(playerPos.x - 190 - index * 15, 0, playerPos.z + 30);
      vehicle.speed = 0;
      vehicle.maxSpeed = 0;
      vehicle.mesh.position.copy(vehicle.position);
      unit.position = vehicle.position;
    }
  });

  game.pedestrians.peds.slice(0, 3).forEach((ped, index) => {
    ped.position.copy(playerPos)
      .addScaledVector(forward, 4.5 + index * 3.4)
      .addScaledVector(right, 2.6 + index * 1.8);
    ped.position.y = 0;
    ped.panicDirection = { x: right.x, z: right.z };
    ped.mode = 'panic';
    ped.timer = 12;
    ped.target = null;
    ped.group.position.copy(ped.position);
    ped.heading = Math.atan2(ped.panicDirection.x, ped.panicDirection.z);
    ped.group.rotation.y = ped.heading;
  });

  const cameraPos = playerPos.clone().addScaledVector(forward, -3.6).addScaledVector(right, 0.5);
  cameraPos.y = 1.9;
  const lookAt = playerPos.clone().addScaledVector(forward, 12).addScaledVector(right, 5.2).setY(1.35);

  game.player.aiming = true;
  game.player.showMuzzleFlash(20);
  game.player.muzzleFlash.material.depthTest = false;
  game.player.muzzleFlash.scale.set(1.15, 1.15, 1);
  game.shotSpeed = null;
  game.shotCamera = null;
  lockCamera(game, false, null, {});
  pinCamera(game, cameraPos, lookAt);
  game.engine.camera.updateMatrixWorld(true);

  const silhouette = projectedSpan(game.engine.camera, meshSilhouettePoints(game.player.mesh));
  const fraction = silhouette ? silhouette.width : 0;
  const cameraDistance = cameraPos.distanceTo(playerPos);
  const buildingNearby = isBuildingFootprint(cameraPos.x, cameraPos.z, 2);
  console.info('[shot:shootout]', JSON.stringify({
    cameraDistance: Number(cameraDistance.toFixed(2)),
    buildingNearby,
    playerSilhouetteWidthOfFrame: Number(fraction.toFixed(3)),
    cameraPos: cameraPos.toArray(),
    playerPos: playerPos.toArray(),
  }));
  console.assert(cameraDistance >= 3, 'shootout camera must be >= 3m from player');
  console.assert(!buildingNearby, 'shootout camera must be >= 2m from building colliders');
  console.assert(fraction <= 0.22, 'shootout player silhouette must stay at or under 22% of frame width');
  return true;
}

async function stageDrive(game) {
  game.timeOfDay = 16.5;
  game.engine.setTimeOfDay(game.timeOfDay);

  const hero = game.heroVehicle;
  const { heroPos, heading, forward } = coastHeroPlacement(game);

  if (hero) {
    hero.position.copy(heroPos);
    hero.heading = heading;
    hero.speed = 0;
    hero.braking = false;
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

  clearTrafficNear(game, heroPos, 14);
  hideCrosswalkPaint(game, heroPos, 100);
  if (hero) {
    hero.position.copy(heroPos);
    hero.heading = heading;
    hero.speed = 0;
    hero.mesh.position.copy(hero.position);
    hero.mesh.rotation.y = hero.heading;
    game.player.position.copy(hero.position);
  }

  for (const ped of game.pedestrians.peds) {
    const dx = ped.position.x - heroPos.x;
    const dz = ped.position.z - heroPos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 12) {
      const push = dist > 0.001 ? (13 - dist) / dist : 13;
      ped.position.x += dx * push;
      ped.position.z += dz * push;
      ped.group.position.copy(ped.position);
      ped.target = null;
    }
  }

  const fit = fitHeroCamera(game, hero, forward);
  const cameraPos = fit.position;
  const lookAt = fit.lookAt;
  game.shotSpeed = 0;
  game.shotCamera = null;
  lockCamera(game, true, 0, {});
  pinCamera(game, cameraPos, lookAt, fit.fov);
  verifyShotCamera(game, cameraPos, hero ? vehicleCorners(hero) : [], 'drive');
  game.engine.camera.updateMatrixWorld(true);

  const crosswalksInFrame = visibleCrosswalks(game.engine.camera, hero ?? { position: heroPos, heading, spec: { length: 4.5, width: 2, cabin: 0.6 } });
  const nearestPed = Math.min(...game.pedestrians.peds.map((ped) => Math.hypot(ped.position.x - heroPos.x, ped.position.z - heroPos.z)));
  console.info('[shot:drive]', JSON.stringify({
    carPosition: heroPos.toArray(),
    crosswalksInFrame,
    nearestPedestrian: Number(nearestPed.toFixed(2)),
    cameraOnCoastSide: cameraPos.z < heroPos.z,
  }));
  console.assert(crosswalksInFrame === 0, 'drive frame must not contain a crosswalk');
  console.assert(nearestPed >= 9, 'drive pedestrians must be at least 9m away');
  return true;
}

async function stageMenu(game) {
  game.timeOfDay = 17.5;
  game.engine.setTimeOfDay(game.timeOfDay);
  game.wanted.setStars(0, game.player.position);
  game.police.clear();
  game.hud.setMission({ job: 'JOB 03 · DOCK HEIST', stage: 'STAGE 2 / 3', stageIndex: 2, stageCount: 3, objective: 'Steal the manifest van at Puerto Nuevo', nextHint: 'LOSE THE TWO-STAR RESPONSE' });

  const heading = Math.PI / 2;
  const { forward, left } = frameBasis(heading);
  const carPos = new THREE.Vector3(-180, 0, -22);
  const hero = game.heroVehicle;
  if (hero) {
    hero.position.copy(carPos);
    hero.heading = heading;
    hero.speed = 0;
    hero.mesh.position.copy(hero.position);
    hero.mesh.rotation.y = hero.heading;
    hero.occupants = hero.occupants.filter((p) => p !== game.player);
  }
  game.player.transition = null;
  game.player.inVehicle = null;
  game.player.cameraBlend = 0;
  game.player.cameraBlendTarget = 0;
  game.player.mesh.visible = false;
  game.player.mesh.scale.y = 1;
  game.player.position.set(carPos.x - 2, 0, carPos.z - 3);
  game.player.mesh.position.copy(game.player.position);
  game.player.viewYaw = heading;
  game.player.facing = heading;
  game.player.mesh.rotation.y = heading;

  const cameraPos = carPos.clone().addScaledVector(forward, -12).addScaledVector(left, 3).setY(4);
  const lookAt = carPos.clone().addScaledVector(forward, 30).addScaledVector(left, 3).setY(1.2);

  for (const ped of game.pedestrians.peds) {
    const dx = ped.position.x - cameraPos.x;
    const dz = ped.position.z - cameraPos.z;
    if (Math.hypot(dx, dz) < 10) {
      ped.position.set(cameraPos.x + 14, 0, cameraPos.z - 14);
      ped.group.position.copy(ped.position);
      ped.target = null;
    }
  }

  game.menus.openPause('MAP');
  game.traffic.update(0, game.player.position, { playerVehicle: null });
  game.pedestrians.update(0, game.player.position);
  await settle(game, 40);
  game.shotSpeed = null;
  game.shotCamera = null;
  lockCamera(game, false, null, {});
  pinCamera(game, cameraPos, lookAt);
  return true;
}
