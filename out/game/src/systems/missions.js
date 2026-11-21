import * as THREE from 'three';
import { JOBS, SIDE_JOBS, jobById, jobTitle } from '../story/campaign.js';
import { Vehicle } from '../entities/vehicle.js';

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function speak(hud, line, fallback = 'MIRA KESANG') {
  if (!line || !hud) return;
  const split = String(line).indexOf(':');
  if (split > 0 && split < 24) hud.say(line.slice(0, split).trim(), line.slice(split + 1).trim());
  else hud.say(fallback, line);
}

function formatTimer(seconds) {
  const value = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

export class MissionSystem {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.hud = options.hud ?? null;
    this.audio = options.audio ?? null;
    this.player = options.player ?? null;
    this.economy = options.economy ?? null;
    this.wanted = options.wanted ?? null;
    this.police = options.police ?? null;
    this.traffic = options.traffic ?? null;
    this.pedestrians = options.pedestrians ?? null;
    this.onComplete = options.onComplete ?? (() => {});
    this.onFailed = options.onFailed ?? (() => {});
    this.onStart = options.onStart ?? (() => {});

    this.job = null;
    this.active = false;
    this.failed = false;
    this.stageIndex = 0;
    this.stageCount = 0;
    this.timeLeft = 0;
    this.escapeArmed = false;
    this.kills = 0;
    this.targetVehicle = null;
    this.targetPeds = [];
    this.spawnedVehicle = null;
    this.completed = new Set();
    this.sideCompleted = new Set();
    this.availableJob = null;
    this.markerPrompt = '';
    this.pendingLines = [];
    this.lineTimer = 0;
    this.rings = [];
    this.elapsed = 0;

    this.marker = this.buildMarker();
    scene.add(this.marker.group);
    this.refreshAvailableJob();
  }

  buildMarker() {
    const group = new THREE.Group();
    group.name = 'Mission marker';
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.62, 13, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: '#ff8b62', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    beam.position.y = 6.5;
    group.add(beam);
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.18, 13, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: '#ffd79a', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    core.position.y = 6.5;
    group.add(core);
    const chevron = new THREE.Mesh(
      new THREE.ConeGeometry(1.15, 1.8, 4),
      new THREE.MeshBasicMaterial({ color: '#ffd08a', transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    chevron.position.y = 14.2;
    chevron.rotation.x = Math.PI;
    chevron.rotation.y = Math.PI / 4;
    group.add(chevron);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.1, 2.7, 32),
      new THREE.MeshBasicMaterial({ color: '#ff7a5c', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.12;
    group.add(ring);
    group.visible = false;
    return { group, beam, chevron, ring, core };
  }

  refreshAvailableJob() {
    this.availableJob = JOBS.find((job) => !this.completed.has(job.id)) ?? null;
    if (this.availableJob) {
      const first = this.availableJob.stages[0];
      this.markerPrompt = `E · START JOB ${String(this.availableJob.number).padStart(2, '0')} · ${this.availableJob.title}`;
    } else {
      this.markerPrompt = '';
    }
    this.syncMarker();
  }

  get stage() {
    return this.active ? this.stageIndex + 1 : 0;
  }

  get objective() {
    const current = this.active ? this.job?.stages[this.stageIndex] : null;
    return current?.objective ?? (this.availableJob ? `Job available: ${this.availableJob.title}` : 'Free roam · explore Puerto Marea');
  }

  get nextHint() {
    const current = this.active ? this.job?.stages[this.stageIndex] : null;
    return current?.nextHint ?? (this.availableJob ? 'FOLLOW THE MARKER · PRESS E TO START' : 'FIND KIKI’S SIDE JOBS');
  }

  get markerPosition() {
    if (this.active) {
      const current = this.job?.stages[this.stageIndex];
      if (this.targetVehicle?.position) return this.targetVehicle.position;
      if (current?.target && Number.isFinite(current.target.x)) return current.target;
      return this.player?.position ?? null;
    }
    const first = this.availableJob?.stages[0];
    if (first && Number.isFinite(first.target.x)) return first.target;
    return null;
  }

  getCard() {
    if (!this.active || !this.job) {
      return {
        job: 'FREE ROAM',
        stage: this.availableJob ? 'JOB AVAILABLE' : 'CITY OPEN',
        stageIndex: 1,
        stageCount: 1,
        objective: this.objective,
        nextHint: this.nextHint,
        timer: '',
      };
    }
    const current = this.job.stages[this.stageIndex] ?? {};
    return {
      job: jobTitle(this.job),
      stage: `STAGE ${this.stage} / ${this.stageCount}`,
      stageIndex: this.stage,
      stageCount: this.stageCount,
      objective: current.objective ?? this.objective,
      nextHint: current.nextHint ?? '',
      timer: current.timer > 0 && !this.failed ? formatTimer(this.timeLeft) : '',
    };
  }

  syncMarker() {
    const position = this.markerPosition;
    this.marker.group.visible = Boolean(position) && !this.failed;
    if (position) this.marker.group.position.set(position.x, 0, position.z);
  }

  start(jobId) {
    const job = jobById(jobId);
    if (!job) return false;
    this.clearTargets();
    this.clearRings();
    this.job = job;
    this.active = true;
    this.failed = false;
    this.stageIndex = 0;
    this.stageCount = job.stages.length;
    this.completed.delete(job.id);
    this.timeLeft = 0;
    this.escapeArmed = false;
    this.pendingLines = [...job.briefing];
    this.lineTimer = 0.1;
    this.enterStage();
    this.onStart(job);
    speak(this.hud, job.barks.start, job.giver);
    this.audio?.uiClick();
    return true;
  }

  enterStage() {
    const stage = this.job?.stages[this.stageIndex];
    if (!stage) return;
    this.timeLeft = stage.timer ?? 0;
    this.escapeArmed = false;
    this.kills = 0;
    this.targetVehicle = null;
    this.targetPeds = [];
    if (stage.type === 'steal' || stage.type === 'deliver') this.prepareVehicle(stage);
    if (stage.type === 'kill' || (stage.type === 'survive' && stage.target?.count)) this.spawnTargets(stage);
    if (stage.forceWanted && this.wanted) this.wanted.setStars(stage.forceWanted, this.player?.position);
    if (this.hud) this.hud.setMission(this.getCard());
    this.syncMarker();
  }

  prepareVehicle(stage) {
    const target = stage.target ?? {};
    const near = { x: target.x ?? this.player?.position.x ?? 0, z: target.z ?? this.player?.position.z ?? 0 };
    const searchRadius = Math.max(stage.radius ?? 10, 16) * 2;
    const wantedType = target.vehicleType;
    let found = null;
    for (const vehicle of this.traffic?.vehicles ?? []) {
      if (vehicle.dead) continue;
      if (wantedType && vehicle.type !== wantedType && vehicle.spec?.className !== wantedType) continue;
      if (distance(vehicle.position, near) < searchRadius) { found = vehicle; break; }
    }
    if (found) { this.targetVehicle = found; return; }
    if (!wantedType && stage.allowAny) return;
    const type = wantedType ?? 'sedan';
    const vehicle = new Vehicle({ type, x: near.x, z: near.z, heading: Math.PI / 2, colour: target.colour });
    vehicle.aiControlled = false;
    this.scene.add(vehicle.mesh);
    this.traffic?.vehicles?.push(vehicle);
    this.traffic?.parked?.push(vehicle);
    this.spawnedVehicle = vehicle;
    this.targetVehicle = vehicle;
  }

  spawnTargets(stage) {
    const spec = stage.target ?? {};
    const count = Math.max(1, spec.count ?? 1);
    if (!this.pedestrians?.createPed) return;
    for (let i = 0; i < count; i += 1) {
      const ped = this.pedestrians.createPed('none');
      const angle = (i / count) * Math.PI * 2 + 0.6;
      const spread = spec.spread ?? 6;
      const x = (spec.x ?? this.player?.position.x ?? 0) + Math.cos(angle) * spread;
      const z = (spec.z ?? this.player?.position.z ?? 0) + Math.sin(angle) * spread;
      ped.position.set(x, 0, z);
      ped.group.position.copy(ped.position);
      ped.group.rotation.y = angle + Math.PI;
      ped.mode = 'idle';
      ped.idleCenter = { x, z };
      ped.speed = 0;
      ped.health = spec.label === 'rival boss' ? 130 : 75;
      ped.missionTarget = spec.label ?? 'mission target';
      this.pedestrians.peds.push(ped);
      this.targetPeds.push(ped);
    }
  }

  clearTargets() {
    for (const ped of this.targetPeds) {
      const peds = this.pedestrians?.peds;
      if (peds) {
        const index = peds.indexOf(ped);
        if (index >= 0) peds.splice(index, 1);
      }
      if (ped.mesh?.parent) ped.mesh.parent.remove(ped.mesh);
      if (ped.group?.parent) ped.group.parent.remove(ped.group);
    }
    this.targetPeds = [];
  }

  clearSpawnedVehicle() {
    if (!this.spawnedVehicle) return;
    const vehicle = this.spawnedVehicle;
    if (vehicle.mesh?.parent) vehicle.mesh.parent.remove(vehicle.mesh);
    for (const list of [this.traffic?.vehicles, this.traffic?.parked, this.traffic?.moving]) {
      const index = list?.indexOf(vehicle) ?? -1;
      if (index >= 0) list.splice(index, 1);
    }
    this.spawnedVehicle = null;
  }

  addCheckpointRing(position = this.player?.position) {
    if (!position) return;
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(1.6, 2.2, 32),
      new THREE.MeshBasicMaterial({ color: '#69d3c1', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(position.x, 0.2, position.z);
    this.scene.add(mesh);
    this.rings.push({ mesh, age: 0, life: 1.1 });
  }

  clearRings() {
    for (const ring of this.rings) {
      if (ring.mesh.parent) ring.mesh.parent.remove(ring.mesh);
    }
    this.rings = [];
  }

  processBriefing(dt) {
    if (!this.pendingLines.length) return;
    this.lineTimer -= dt;
    if (this.lineTimer > 0) return;
    speak(this.hud, this.pendingLines.shift(), this.job?.giver);
    this.lineTimer = 4.2;
  }

  update(dt, context = {}) {
    this.elapsed += dt;
    if (this.player) this.syncMarker();
    this.updateMarker(dt);
    this.updateRings(dt);
    if (!this.active || this.failed) return;
    this.processBriefing(dt);
    const stage = this.job?.stages[this.stageIndex];
    if (!stage) return;
    const player = this.player;
    const pos = player?.position;
    if (!pos) return;

    if (stage.timer > 0) {
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      if (stage.type === 'survive' && this.timeLeft <= 0) { this.passStage(); return; }
      if (stage.type !== 'survive' && this.timeLeft <= 0) { this.fail('TIME EXPIRED'); return; }
    }

    if (stage.type === 'reach' || stage.type === 'deliver') {
      const target = stage.target ?? {};
      const close = Number.isFinite(target.x) && distance(pos, target) <= (stage.radius ?? 10);
      const rightCar = Boolean(player.inVehicle) && (!target.vehicleType || player.inVehicle.type === target.vehicleType || player.inVehicle === this.targetVehicle);
      if (close && rightCar) this.passStage();
    } else if (stage.type === 'escape') {
      const needed = stage.target?.minStars ?? 2;
      if ((this.wanted?.stars ?? 0) >= needed) this.escapeArmed = true;
      if (this.escapeArmed && (this.wanted?.stars ?? 0) === 0) this.passStage();
    } else if (stage.type === 'steal') {
      const vehicle = player.inVehicle;
      if (vehicle && this.vehicleMatches(vehicle, stage)) this.passStage();
    }
    if (this.hud && stage.timer > 0) this.hud.setMission(this.getCard());
  }

  vehicleMatches(vehicle, stage) {
    if (!vehicle) return false;
    const target = stage.target ?? {};
    if (this.targetVehicle && vehicle === this.targetVehicle) return true;
    if (target.vehicleType && vehicle.type !== target.vehicleType && vehicle.spec?.className !== target.vehicleType) return false;
    if (Number.isFinite(target.x) && distance(vehicle.position, target) > Math.max(stage.radius ?? 10, 16) * 2) return false;
    return true;
  }

  updateMarker(dt) {
    if (!this.marker.group.visible) return;
    this.marker.chevron.position.y = 14.1 + Math.sin(this.elapsed * 3.1) * 0.5;
    this.marker.chevron.rotation.y += dt * 1.6;
    const pulse = 0.4 + Math.sin(this.elapsed * 4) * 0.14;
    this.marker.beam.material.opacity = pulse * 0.5;
    this.marker.ring.material.opacity = 0.4 + Math.sin(this.elapsed * 4) * 0.18;
    this.marker.ring.scale.setScalar(1 + Math.sin(this.elapsed * 3) * 0.08);
  }

  updateRings(dt) {
    for (const ring of [...this.rings]) {
      ring.age += dt;
      const progress = ring.age / ring.life;
      ring.mesh.scale.setScalar(1 + progress * 7);
      ring.mesh.material.opacity = Math.max(0, 0.85 * (1 - progress));
      if (progress >= 1) {
        if (ring.mesh.parent) ring.mesh.parent.remove(ring.mesh);
        this.rings = this.rings.filter((item) => item !== ring);
      }
    }
  }

  onEvent(type, payload = null) {
    if (!this.active || this.failed) return false;
    if (type === 'wasted' || type === 'busted') { this.fail(type); return true; }
    const stage = this.job?.stages[this.stageIndex];
    if (!stage) return false;
    if (type === 'enterVehicle' && stage.type === 'steal') {
      if (this.vehicleMatches(payload, stage)) { this.passStage(); return true; }
    }
    if (type === 'kill' && (stage.type === 'kill' || stage.type === 'survive')) {
      if (this.targetPeds.length && !this.targetPeds.includes(payload)) return false;
      this.kills += 1;
      const needed = stage.target?.count ?? 1;
      if (stage.type === 'kill' && this.kills >= needed) { this.passStage(); return true; }
    }
    return false;
  }

  passStage() {
    const position = this.markerPosition ?? this.player?.position;
    this.addCheckpointRing(position);
    this.clearTargets();
    speak(this.hud, this.job.barks.stagePass, this.job.giver);
    this.audio?.uiClick();
    this.stageIndex += 1;
    if (this.stageIndex >= this.stageCount) { this.complete(); return; }
    this.enterStage();
  }

  complete() {
    if (!this.job) return;
    const job = this.job;
    this.completed.add(job.id);
    this.active = false;
    this.failed = false;
    this.clearTargets();
    this.clearSpawnedVehicle();
    this.clearRings();
    this.marker.group.visible = false;
    const reward = job.reward ?? {};
    this.economy?.addCash(reward.cash ?? 0);
    this.economy?.addReputation(reward.rep ?? 0);
    if (reward.unlockWeapon) this.economy?.unlockWeapon(reward.unlockWeapon);
    this.audio?.missionPassed();
    this.hud?.showMissionComplete(job, reward);
    speak(this.hud, job.barks.complete, job.giver);
    this.onComplete(job);
    this.job = null;
    this.stageIndex = 0;
    this.refreshAvailableJob();
  }

  fail(reason = 'MISSION FAILED') {
    if (!this.active || this.failed) return;
    this.failed = true;
    this.active = false;
    const job = this.job;
    this.clearTargets();
    this.clearRings();
    this.marker.group.visible = false;
    this.hud?.showMissionFailed(reason, job ? jobTitle(job) : '');
    speak(this.hud, job?.barks.fail, job?.giver);
    this.onFailed(reason);
  }

  retry() {
    const job = this.job;
    if (!job) return false;
    this.clearTargets();
    this.clearSpawnedVehicle();
    this.clearRings();
    this.failed = false;
    this.hud?.hideMissionCardEffects();
    return this.start(job.id);
  }

  abandon() {
    this.active = false;
    this.failed = false;
    this.clearTargets();
    this.clearSpawnedVehicle();
    this.clearRings();
    this.job = null;
    this.stageIndex = 0;
    this.refreshAvailableJob();
  }

  forceCompleteStage() {
    if (this.active && !this.failed) this.passStage();
  }

  snapshot() {
    return {
      completed: [...this.completed],
      sideCompleted: [...this.sideCompleted],
    };
  }

  restore(data = {}) {
    this.completed = new Set(Array.isArray(data.completed) ? data.completed : []);
    this.sideCompleted = new Set(Array.isArray(data.sideCompleted) ? data.sideCompleted : []);
    this.abandon();
  }

  startSideJob(id) {
    const side = SIDE_JOBS.find((request) => request.id === id);
    if (!side || this.sideCompleted.has(id)) return false;
    this.sideCompleted.add(id);
    this.economy?.completeTheft(id);
    speak(this.hud, `Kiki: ${side.title}. That is one less favor I owe.`, 'KIKI SOL');
    return true;
  }
}
