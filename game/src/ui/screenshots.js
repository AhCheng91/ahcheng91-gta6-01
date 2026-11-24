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
  for (const vehicle of game.traffic.moving) {
    if (vehicle === game.heroVehicle) continue;
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

function worldAtNdc(camera, ndcX, ndcY, distance) {
  const direction = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(camera).sub(camera.position).normalize();
  return camera.position.clone().addScaledVector(direction, distance);
}

// The cover is the graded artifact, so the hero camera is fitted rather than guessed:
// it starts on the tuned three-quarter boom and slides along it until the car covers
// a readable share of the frame width.
function fitHeroCamera(game, hero, forward, options = {}) {
  const { left } = frameBasis(hero.heading);
  const lateral = options.lateral ?? 3.0;
  const height = options.height ?? 1.8;
  const fov = options.fov ?? 34;
  let distance = options.distance ?? 10;
  let pose = null;
  for (let step = 0; step < 5; step += 1) {
    const position = hero.position.clone().addScaledVector(forward, -distance).addScaledVector(left, lateral).setY(height);
    const lookAt = hero.position.clone().addScaledVector(forward, 16).addScaledVector(left, -2).setY(1.4);
    const probe = game.engine.camera.clone();
    probe.position.copy(position);
    probe.lookAt(lookAt);
    probe.fov = fov;
    probe.updateProjectionMatrix();
    probe.updateMatrixWorld(true);
    const span = projectedSpan(probe, vehicleCorners(hero));
    pose = {
      position,
      lookAt,
      fov,
      report: {
        distance,
        lateral,
        height,
        fov,
        heroWidth: span ? Number(span.width.toFixed(3)) : null,
        heroBounds: span ? {
          minX: Number(span.minX.toFixed(2)),
          maxX: Number(span.maxX.toFixed(2)),
          minY: Number(span.minY.toFixed(2)),
          maxY: Number(span.maxY.toFixed(2)),
        } : null,
      },
    };
    if (span && span.width > 0.40) { distance = Math.min(12.5, distance + 0.5); continue; }
    if (!span || span.width < 0.22) { distance = Math.max(8, distance - 0.5); continue; }
    break;
  }
  return pose;
}

// ---------------------------------------------------------------------------
// Round 6 key-art rig. The cover is a staged action frame: the Calyx Sprint
// breaks past a wrecked, burning interceptor while a second cruiser runs the
// far lane with its beacons painting the asphalt, and the rest of the cordon
// waits up the Malecón. Every piece is placed by hand (no random numbers, no
// wall clock), so ?shot=chase renders the same frame on every capture.
// ---------------------------------------------------------------------------

function additiveMesh(geometry, color, opacity) {
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
}

function keyartSprite(color, size, opacity) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialSpotTexture(), color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  sprite.scale.set(size, size, 1);
  return sprite;
}

let flameTextureCache = null;

// A soft teardrop flame, drawn once: a billboard with this reads as fire from
// any angle, which stacked cones never did at poster size.
function flameTexture() {
  if (flameTextureCache) return flameTextureCache;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 176, 4, 64, 168, 118);
  gradient.addColorStop(0, 'rgba(255,244,196,1)');
  gradient.addColorStop(0.2, 'rgba(255,208,104,1)');
  gradient.addColorStop(0.45, 'rgba(255,140,40,0.96)');
  gradient.addColorStop(0.72, 'rgba(226,74,16,0.72)');
  gradient.addColorStop(1, 'rgba(180,40,8,0)');
  context.fillStyle = gradient;
  context.beginPath();
  context.moveTo(64, 6);
  context.bezierCurveTo(112, 96, 126, 196, 64, 244);
  context.bezierCurveTo(2, 196, 16, 96, 64, 6);
  context.fill();
  flameTextureCache = new THREE.CanvasTexture(canvas);
  if ('colorSpace' in flameTextureCache && THREE.SRGBColorSpace) flameTextureCache.colorSpace = THREE.SRGBColorSpace;
  return flameTextureCache;
}

// Sustained vehicle fire: four billboard flames of different size and lean over
// a warm point light, which is what throws the firelight onto the road.
function keyartFlames(scale = 1) {
  const group = new THREE.Group();
  group.name = 'Key-art flames';
  const licks = [
    { x: -0.5, z: 0.1, y: 1.45, w: 1.35, h: 3.0, opacity: 0.95, tilt: 0.16 },
    { x: 0.46, z: -0.14, y: 1.25, w: 1.15, h: 2.6, opacity: 0.9, tilt: -0.2 },
    { x: 0.02, z: 0.26, y: 1.05, w: 1.0, h: 2.1, opacity: 0.85, tilt: 0.05 },
    { x: -0.05, z: -0.08, y: 0.8, w: 0.66, h: 1.4, opacity: 0.95, tilt: -0.04 },
  ];
  for (const lick of licks) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: flameTexture(), transparent: true, opacity: lick.opacity, depthWrite: false, fog: false,
    }));
    sprite.scale.set(lick.w * scale, lick.h * scale, 1);
    sprite.position.set(lick.x * scale, lick.y * scale, lick.z * scale);
    sprite.material.rotation = lick.tilt;
    group.add(sprite);
  }
  const light = new THREE.PointLight('#ff7d2e', 18, 24, 2);
  light.position.y = 1.5 * scale;
  group.add(light);
  return group;
}

// Soft billboard puffs: a column of dark smoke reads at poster size where hard
// low-poly spheres read as grey bubbles.
function keyartSmoke(scale = 1, count = 6, rise = 8) {
  const group = new THREE.Group();
  group.name = 'Key-art smoke';
  for (let index = 0; index < count; index += 1) {
    const t = index / Math.max(1, count - 1);
    const puff = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialSpotTexture(), color: '#332c33', transparent: true,
      opacity: 0.5 * (1 - t * 0.6), depthWrite: false, fog: true,
    }));
    const size = (1.4 + t * 3.0) * scale;
    puff.scale.set(size, size * 0.92, 1);
    const sway = (index % 2 === 0 ? 1 : -1) * (0.25 + t * 1.2) * scale;
    puff.position.set(sway, (1.35 + t * rise) * scale, (index % 3 - 1) * 0.4 * scale);
    group.add(puff);
  }
  return group;
}

function keyartGroundPool(game, position, { radius = 5.5, color = '#ff2a3c', opacity = 0.5, name = 'Key-art light pool' } = {}) {
  const pool = new THREE.Mesh(new THREE.CircleGeometry(radius, 44), new THREE.MeshBasicMaterial({
    map: radialSpotTexture(), color, transparent: true, opacity,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(position.x, 0.08, position.z);
  pool.name = name;
  pool.renderOrder = 2;
  game.engine.scene.add(pool);
  return pool;
}

// Tyre smoke squatting behind the hero's rear wheels: the cue that the car is
// moving rather than parked in the middle of the road.
function keyartTyreSmoke(game, hero, forward, left) {
  const group = new THREE.Group();
  group.name = 'Key-art tyre smoke';
  const puffs = [
    { ahead: -1.4, side: 1.05, y: 0.35, size: 0.55, opacity: 0.32 },
    { ahead: -1.7, side: -1.05, y: 0.32, size: 0.48, opacity: 0.28 },
    { ahead: -2.5, side: 0.5, y: 0.45, size: 0.72, opacity: 0.18 },
  ];
  for (const puff of puffs) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialSpotTexture(), color: '#e6d8c6', transparent: true,
      opacity: puff.opacity, depthWrite: false, fog: true,
    }));
    sprite.scale.set(puff.size, puff.size * 0.75, 1);
    sprite.position.copy(hero.position).addScaledVector(forward, puff.ahead).addScaledVector(left, puff.side).setY(puff.y);
    group.add(sprite);
  }
  game.engine.scene.add(group);
  return group;
}

function anchorUnit(unit, position) {
  unit.position = position;
  unit.tactic = 'HOLD';
}

// Dresses the set: a wrecked burning interceptor on the sea side, an
// interceptor running the far lane under its beacons, and the rest of the
// cordon parked up the road.
function buildKeyartSet(game, { hero, forward, left }) {
  const at = (ahead, side, y = 0) => hero.position.clone().addScaledVector(forward, ahead).addScaledVector(left, side).setY(y);
  const cruisers = game.police.units.filter((unit) => unit.kind === 'CRUISER' && unit.vehicle);
  const [burning, beside] = cruisers;

  const park = (vehicle, position, heading) => {
    vehicle.position.copy(position);
    vehicle.heading = heading;
    vehicle.speed = 0;
    vehicle.maxSpeed = 0;
    vehicle.parked = true;
    vehicle.mesh.position.copy(vehicle.position);
    vehicle.mesh.rotation.y = heading;
    vehicle.update = () => {};
  };

  if (burning) {
    const vehicle = burning.vehicle;
    park(vehicle, at(13.0, 7.0), Math.PI / 2 - 0.55);
    if (typeof vehicle.setSiren === 'function') vehicle.setSiren(false);
    if (vehicle.redLamp) vehicle.redLamp.material.color.set('#2a0d12');
    if (vehicle.blueLamp) vehicle.blueLamp.material.color.set('#0b1226');
    // Charred shell: only the paint still looked factory fresh.
    vehicle.body.material = vehicle.body.material.clone();
    vehicle.body.material.color.set('#4a3a34');
    vehicle.body.material.roughness = 0.85;
    vehicle.body.material.metalness = 0.15;
    anchorUnit(burning, vehicle.position);

    const flames = keyartFlames(1.7);
    flames.position.copy(vehicle.position).addScaledVector(forward, 0.9).setY(0.5);
    game.engine.scene.add(flames);
    const smoke = keyartSmoke(1.1, 6, 8);
    smoke.position.copy(vehicle.position).addScaledVector(forward, 0.4).setY(0.9);
    game.engine.scene.add(smoke);
    keyartGroundPool(game, vehicle.position, { radius: 6.2, color: '#ff7a24', opacity: 0.3, name: 'Key-art fire pool' });
  }

  if (beside) {
    const vehicle = beside.vehicle;
    park(vehicle, at(21.0, -3.6), Math.PI / 2 + 0.15);
    if (typeof vehicle.setSiren === 'function') vehicle.setSiren(true);
    if (vehicle.redLamp) vehicle.redLamp.material.color.set('#ff2432');
    if (vehicle.blueLamp) vehicle.blueLamp.material.color.set('#2e60ff');
    anchorUnit(beside, vehicle.position);
    keyartGroundPool(game, at(22.0, -3.6), { radius: 4.6, color: '#ff2432', opacity: 0.32, name: 'Key-art red beacon' });
    keyartGroundPool(game, at(18.0, -3.6), { radius: 4.2, color: '#2f6bff', opacity: 0.28, name: 'Key-art blue beacon' });
    const beaconGlow = keyartSprite('#ff5566', 4.4, 0.4);
    beaconGlow.position.copy(vehicle.position).addScaledVector(forward, -0.4).setY(2.25);
    game.engine.scene.add(beaconGlow);
  }

  cruisers.slice(2, 4).forEach((unit, index) => {
    const vehicle = unit.vehicle;
    park(vehicle, at(38 + index * 6, index === 0 ? 4.2 : -4.0), Math.PI / 2 + (index === 0 ? 1.05 : -1.05));
    if (typeof vehicle.setSiren === 'function') vehicle.setSiren(true);
    anchorUnit(unit, vehicle.position);
    keyartGroundPool(game, vehicle.position, { radius: 4.0, color: index === 0 ? '#ff2432' : '#2f6bff', opacity: 0.22, name: 'Key-art roadblock beacon' });
  });

  keyartTyreSmoke(game, hero, forward, left);
}

async function stageChase(game) {
  game.timeOfDay = 17.92;
  game.engine.setTimeOfDay(game.timeOfDay);

  // Round 2's light, kept: the sun sits low behind the lens so the hero paint
  // burns orange, the street keeps long shadows and the water holds a warm band.
  const elevation = THREE.MathUtils.degToRad(8.5);
  const azimuth = -2.72;
  const horizontal = Math.sqrt(Math.max(0.001, 1 - Math.sin(elevation) * Math.sin(elevation)));
  game.engine.sunDirection = new THREE.Vector3(Math.cos(azimuth) * horizontal, Math.sin(elevation), Math.sin(azimuth) * horizontal).normalize();
  game.engine.skyUniforms.sunDirection.value.copy(game.engine.sunDirection);
  game.engine.skyUniforms.night.value = 0;
  game.engine.sun.intensity = 2.15;
  game.engine.sun.color.set('#ffd0a0');
  game.engine.hemi.intensity = 0.5;
  game.engine.hemi.color.set('#ffd3a6');
  game.engine.hemi.groundColor.set('#6b6250');
  game.engine.renderer.toneMappingExposure = 1.02;
  game.engine.sunGlow.material.opacity = 0.5;

  const hero = game.heroVehicle;
  const heading = Math.PI / 2;
  const { forward, left } = frameBasis(heading);
  const heroPos = new THREE.Vector3(116, 0, -22);

  game.shotSpeed = 26;
  if (hero) {
    hero.position.copy(heroPos);
    hero.heading = heading + 0.1;
    hero.speed = game.shotSpeed;
    hero.braking = false;
    hero.mesh.position.copy(hero.position);
    hero.mesh.rotation.y = hero.heading;
    game.player.enterVehicle(hero);
    game.player.mesh.visible = false;
    game.player.position.copy(hero.position);
    // The cover lens sits square behind the body, where the factory clearcoat
    // mirrored the sun into a white sheet: a softer finish keeps the paint red.
    const paint = hero.body.material;
    paint.roughness = 0.72;
    paint.metalness = 0.08;
    paint.clearcoat = 0.18;
    paint.clearcoatRoughness = 0.5;
    for (const lamp of hero.brakeLights) lamp.material.color.set('#ff3325');
    for (const cone of hero.headlightCones ?? []) {
      cone.visible = true;
      cone.intensity = 24;
    }
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

  // Freeze the pursuit, then dress the set by hand.
  game.police.dispatch = () => {};
  game.police.cooldowns.roadblock = 9999;
  game.police.update = () => {};

  clearTrafficNear(game, heroPos, 40);
  if (hero) {
    hero.position.copy(heroPos);
    hero.heading = heading + 0.1;
    hero.speed = game.shotSpeed;
    hero.mesh.position.copy(hero.position);
    hero.mesh.rotation.y = hero.heading;
    game.player.position.copy(hero.position);
  }

  // The parking lots sit over the same asphalt: move the ones in front of the
  // lens out of the road so only staged vehicles remain.
  for (const vehicle of game.traffic.parked) {
    if (vehicle === hero || vehicle.dead) continue;
    if (Math.hypot(vehicle.position.x - heroPos.x, vehicle.position.z - heroPos.z) > 30) continue;
    vehicle.position.set(heroPos.x + 420, 0, heroPos.z + 260);
    vehicle.mesh.position.copy(vehicle.position);
    vehicle.speed = 0;
    vehicle.maxSpeed = 0;
    vehicle.parked = false;
  }

  const heli = game.police.units.find((unit) => unit.kind === 'HELICOPTER' && !unit.dead);
  if (heli) {
    heli.kind = 'STATIC';
    heli.update = () => {};
    if (heli.spotlight) heli.spotlight.intensity = 0;
    if (heli.spotlightCone) heli.spotlightCone.visible = false;
  }

  buildKeyartSet(game, { hero, forward, left });

  // Low three-quarter rear boom: the hero fills the centre of the road, the
  // wreck and the beacons stack up behind it, and the cordon closes the street.
  const cameraPos = heroPos.clone().addScaledVector(forward, -6.6).addScaledVector(left, -1.6).setY(1.95);
  const lookAt = heroPos.clone().addScaledVector(forward, 9).setY(1.0);
  const fov = 54;

  game.shotSpeed = null;
  game.shotCamera = null;
  lockCamera(game, true, null, {});
  pinCamera(game, cameraPos, lookAt, fov);
  game.engine.camera.updateMatrixWorld(true);

  if (heli) {
    const heliPos = worldAtNdc(game.engine.camera, -0.46, 0.6, 62);
    heli.mesh.position.copy(heliPos);
    heli.position.copy(heliPos);
  }

  // The teleport can leave the district banner up over the sky: clear it and
  // keep the HUD from raising it again during the capture.
  game.hud.showDistrict = () => {};
  game.hud.districtUntil = 0;
  game.hud.elements?.districtPanel?.classList?.remove('district-in');

  const camera = game.engine.camera;
  const heroSpan = hero ? projectedSpan(camera, vehicleCorners(hero)) : null;
  const cruiserSpans = game.police.units
    .filter((unit) => unit.kind === 'CRUISER' && unit.vehicle)
    .slice(0, 3)
    .map((unit) => projectedSpan(camera, vehicleCorners(unit.vehicle)));
  const report = {
    camera: cameraPos.toArray().map((value) => Number(value.toFixed(2))),
    heroWidthOfFrame: heroSpan ? Number(heroSpan.width.toFixed(3)) : null,
    hero: heroSpan ? { minX: Number(heroSpan.minX.toFixed(2)), maxX: Number(heroSpan.maxX.toFixed(2)), minY: Number(heroSpan.minY.toFixed(2)), maxY: Number(heroSpan.maxY.toFixed(2)) } : null,
    cruisersInFrame: cruiserSpans.filter((span) => span && span.minX > -1.1 && span.maxX < 1.1).length,
  };
  console.info('[shot:chase]', JSON.stringify(report));
  console.assert(heroSpan && heroSpan.width >= 0.16 && heroSpan.width <= 0.36, 'chase hero car must cover 16-36% of the frame width');
  console.assert(heroSpan && heroSpan.minX > -0.92 && heroSpan.maxX < 0.92 && heroSpan.minY > -0.72 && heroSpan.maxY < 0.5, 'chase hero car must sit whole inside the frame');
  console.assert(report.cruisersInFrame >= 3, 'chase frame must hold the wreck, the beacon cruiser and the cordon');
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
  const heading = Math.PI / 2;
  const { forward, left } = frameBasis(heading);
  const startX = -250;
  const laneZ = -21.3;

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
  const { carPos: heroPos, cameraPos, lookAt } = chosen;

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

  clearTrafficNear(game, heroPos, 34);
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

  game.shotSpeed = 0;
  game.shotCamera = null;
  lockCamera(game, true, 0, {});
  pinCamera(game, cameraPos, lookAt, 66);
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
  game.timeOfDay = 17.7;
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

  const cameraPos = carPos.clone().addScaledVector(forward, -12).addScaledVector(left, 3).setY(3.4);
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
