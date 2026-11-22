// Every HUD panel, constructed in DOM and refreshed from game state each frame.

import { drawPortrait, portraitForSpeaker } from '../story/characters.js';

const MARKUP = `
<style>
#mission-reward { margin: -1px 0 7px; padding-top: 5px; border-top: 1px solid rgba(255,204,121,0.2); font-size: 10px; font-weight: 700; letter-spacing: 0.12em; color: var(--gold); }
#mission-reward span { color: var(--coral); }
.money-respect { margin-top: 5px; padding-top: 5px; border-top: 1px solid rgba(255,227,187,0.16); }
.money-respect-head { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; }
.money-respect-head .eyebrow { color: var(--teal); }
#money-panel #rep-rank { color: var(--text); }
#money-panel #rep-value { font-size: 9px; color: var(--gold); font-variant-numeric: tabular-nums; }
#money-panel .rep-track { height: 4px; margin-top: 4px; background: rgba(255,255,255,0.12); border-radius: 3px; overflow: hidden; }
#money-panel #rep-fill { height: 100%; width: 0; background: linear-gradient(90deg, var(--teal), var(--gold)); transition: width 0.35s ease; }
.weapon-slot span.weapon-name { display: block; margin-top: 1px; font-size: 6.5px; font-weight: 700; letter-spacing: 0.04em; color: var(--gold); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.weapon-slot small.weapon-ammo { display: block; margin: 2px 1px 0; padding: 1px 0; background: rgba(255,122,92,0.14); border: 1px solid rgba(255,122,92,0.26); border-radius: 2px; color: var(--text); font-size: 8px; line-height: 1.15; }
.weapon-slot.active small.weapon-ammo { background: rgba(255,122,92,0.3); border-color: var(--coral); color: #fff3dc; }
.weapon-slot.locked small.weapon-ammo { color: var(--muted); border-color: rgba(255,255,255,0.12); background: rgba(255,255,255,0.05); }
#radio-panel { left: 50%; right: auto; bottom: 126px; transform: translateX(-50%); width: min(360px, 44vw); justify-content: center; padding: 6px 13px; border: 1px solid rgba(255,204,121,0.32); border-radius: 999px; background: linear-gradient(90deg, rgba(8,21,29,0.9), rgba(12,32,39,0.9), rgba(8,21,29,0.9)); box-shadow: 0 4px 16px rgba(0,0,0,0.35); }
#radio-panel .radio-key { margin-left: 8px; }
#radio-station { color: var(--gold); }
#radio-track { color: var(--teal); }
#prompt { bottom: 160px; }
</style>
<div id="hud" aria-hidden="true">
  <div class="hud-top-center">
    <div id="clock" class="clock"><b id="clock-time">17:20</b><span id="clock-phase">GOLDEN HOUR</span></div>
    <div id="district-panel" class="district-panel">
      <div class="eyebrow">NOW ENTERING</div>
      <div id="district-name">Malecón Viejo</div>
      <div id="district-sub">OLD WATERFRONT</div>
    </div>
  </div>

  <div class="hud-corner hud-top-left">
    <section id="mission-card" class="panel mission-card">
      <div class="mission-head"><span id="mission-job">FREE ROAM</span><span id="mission-stage">STAGE 1 / 3</span></div>
      <div id="mission-pips" class="mission-pips"></div>
      <div id="mission-objective" class="mission-objective">Explore Puerto Marea</div>
      <div id="mission-reward">$1,200 <span>·</span> +80 RESPECT</div>
      <div id="mission-next" class="eyebrow">NEXT · FIND A CAR ON THE MALECÓN</div>
      <div id="mission-timer" class="mission-timer hidden">TIME 00:00</div>
    </section>
    <section id="dispatch-panel" class="panel">
      <div class="dispatch-head"><span class="eyebrow">PMPD DISPATCH</span><span id="dispatch-count" class="dispatch-count">0 UNITS</span></div>
      <div id="dispatch-list"></div>
    </section>
  </div>

  <div class="hud-corner hud-top-right">
    <section id="money-panel" class="panel stat-panel">
      <span class="eyebrow">CASH · KESANG CREW</span><span id="money" class="stat-value">$ 2,450</span>
      <span id="crab-counter" class="crab-counter">◆ GOLDEN CRABS 0 / 12</span>
      <div class="money-respect">
        <div class="money-respect-head"><span class="eyebrow">RESPECT · <span id="rep-rank">DOCK HAND</span></span><span id="rep-value">120</span></div>
        <div class="rep-track"><div id="rep-fill"></div></div>
      </div>
    </section>
    <section id="wanted-panel" class="panel">
      <div class="dispatch-head"><span class="eyebrow">PMPD WANTED</span><span id="wanted-count">CLEAN</span></div>
      <div id="wanted-stars">☆☆☆☆☆</div>
    </section>
  </div>

  <section id="minimap-frame" class="panel">
    <div class="map-top"><span>PUERTO MAREA</span><span id="map-district">MALECÓN VIEJO</span></div>
    <canvas id="minimap" width="212" height="212"></canvas>
    <div id="minimap-caption"><span class="caption-key">◆</span> MISSION <span class="caption-key key-gold">G</span> GARAGE <span class="caption-key key-red">●</span> PMPD</div>
  </section>

  <section id="health-panel" class="panel">
    <div class="meter-row"><span class="eyebrow">HEALTH</span><span id="health-value">100</span></div>
    <div class="meter"><div id="health-fill" class="meter-fill health-fill"></div></div>
    <div class="meter-row"><span class="eyebrow">ARMOUR</span><span id="armour-value">0</span></div>
    <div class="meter"><div id="armour-fill" class="meter-fill armour-fill"></div></div>
  </section>

  <section id="weapon-wheel" aria-label="Weapon wheel">
    <div class="weapon-slot active"><b>1</b><canvas class="weapon-icon" width="22" height="22"></canvas><span class="weapon-name">FISTS</span><small class="weapon-ammo">—</small></div>
    <div class="weapon-slot"><b>2</b><canvas class="weapon-icon" width="22" height="22"></canvas><span class="weapon-name">PISTOL</span><small class="weapon-ammo">12</small></div>
    <div class="weapon-slot"><b>3</b><canvas class="weapon-icon" width="22" height="22"></canvas><span class="weapon-name">SMG</span><small class="weapon-ammo">—</small></div>
    <div class="weapon-slot"><b>4</b><canvas class="weapon-icon" width="22" height="22"></canvas><span class="weapon-name">SHOTGUN</span><small class="weapon-ammo">—</small></div>
    <div class="weapon-slot"><b>5</b><canvas class="weapon-icon" width="22" height="22"></canvas><span class="weapon-name">RIFLE</span><small class="weapon-ammo">—</small></div>
    <div class="weapon-slot"><b>6</b><canvas class="weapon-icon" width="22" height="22"></canvas><span class="weapon-name">GRENADE</span><small class="weapon-ammo">—</small></div>
    <div class="wheel-hub"><span>WEAPONS</span><b>RAFA</b></div>
  </section>

  <div id="radio-panel"><span class="radio-bars"><i></i><i></i><i></i></span><span id="radio-station">LAGOON FM 98.1</span><span class="radio-divider">·</span><span id="radio-track">SYNTHWAVE</span><span class="radio-key">B · NEXT</span></div>

  <section id="vehicle-panel" class="panel">
    <div class="vehicle-head"><span id="vehicle-name">ON FOOT</span><span id="vehicle-class">NO VEHICLE</span></div>
    <div class="meter-row compact"><span class="eyebrow">CONDITION</span><span id="vehicle-condition">—</span></div>
    <div class="meter slim"><div id="vehicle-condition-fill" class="meter-fill condition-fill"></div></div>
    <div class="speed-row"><div id="speed-value">000</div><div class="speed-side"><span>KM/H</span><b id="gear-value">N</b></div></div>
  </section>

  <div id="reticle" class="hidden"><i></i><i></i><i></i><i></i></div>
  <div id="hit-marker" class="hidden"><span></span><span></span><span></span><span></span></div>
  <div id="cover-badge" class="hidden">C · LEAVE COVER</div>
  <div id="prompt" class="hidden"></div>
  <section id="subtitle" class="hidden">
    <canvas id="subtitle-portrait" width="56" height="56"></canvas>
    <div class="subtitle-copy"><b id="subtitle-speaker"></b><p id="subtitle-line"></p></div>
  </section>
  <div id="damage-flash"></div>
  <div id="black-fade"></div>
  <div id="screen-message" class="hidden"><div id="screen-message-title"></div><div id="screen-message-sub"></div><button id="screen-retry" type="button">RETRY</button></div>
  <section id="mission-overlay" class="hidden">
    <div id="mission-overlay-kicker"></div>
    <div id="mission-overlay-title"></div>
    <div id="mission-overlay-copy"></div>
    <div id="mission-overlay-reward"></div>
    <button id="mission-overlay-retry" type="button">RETRY JOB</button>
  </section>
  <div id="debug-line">WASD MOVE · SHIFT RUN · RMB AIM · LMB FIRE · F CAR · E JOB · ESC MENU · 1-6 WEAPONS</div>
</div>`;

const WEAPON_IDS = ['fists', 'pistol', 'smg', 'shotgun', 'rifle', 'grenade'];

function drawWeaponIcon(canvas, weaponId) {
  if (!canvas?.getContext) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, 22, 22);
  ctx.fillStyle = '#ffd08a';
  ctx.strokeStyle = '#ffd08a';
  ctx.lineWidth = 1.5;
  if (weaponId === 'fists') {
    ctx.fillRect(3, 7, 7, 8);
    ctx.fillRect(12, 7, 7, 8);
    ctx.fillStyle = '#2e8b85';
    ctx.fillRect(3, 13, 7, 3);
    ctx.fillRect(12, 13, 7, 3);
  } else if (weaponId === 'grenade') {
    ctx.beginPath();
    ctx.ellipse(11, 13, 6, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(14, 4, 2.5, 0, Math.PI * 2);
    ctx.stroke();
  } else if (weaponId === 'shotgun') {
    ctx.fillRect(2, 8, 18, 3);
    ctx.fillRect(7, 11, 5, 6);
    ctx.fillStyle = '#2e8b85';
    ctx.fillRect(12, 8, 4, 4);
  } else if (weaponId === 'rifle') {
    ctx.fillRect(2, 9, 18, 2.5);
    ctx.fillRect(8, 11, 5, 6);
    ctx.fillRect(9, 5, 7, 2);
    ctx.fillStyle = '#2e8b85';
    ctx.fillRect(15, 8, 4, 4);
  } else if (weaponId === 'smg') {
    ctx.fillRect(4, 8, 14, 3.5);
    ctx.fillRect(9, 11, 4, 7);
    ctx.fillRect(5, 11, 3, 5);
  } else {
    ctx.fillRect(5, 7, 14, 3.5);
    ctx.fillRect(8, 10.5, 4, 8);
  }
}

const byId = (id) => document.getElementById(id);
function setText(element, value) {
  if (element && element.textContent !== String(value)) element.textContent = String(value);
}

export class Hud {
  constructor() {
    const mount = document.getElementById('hud-root') ?? document.body;
    mount.insertAdjacentHTML('afterbegin', MARKUP);
    this.elements = {
      hud: byId('hud'),
      clockTime: byId('clock-time'),
      clockPhase: byId('clock-phase'),
      districtName: byId('district-name'),
      districtSub: byId('district-sub'),
      districtPanel: byId('district-panel'),
      mapDistrict: byId('map-district'),
      missionCard: byId('mission-card'),
      missionJob: byId('mission-job'),
      missionStage: byId('mission-stage'),
      missionPips: byId('mission-pips'),
      missionObjective: byId('mission-objective'),
      missionReward: byId('mission-reward'),
      missionNext: byId('mission-next'),
      missionTimer: byId('mission-timer'),
      money: byId('money'),
      crabCounter: byId('crab-counter'),
      repRank: byId('rep-rank'),
      repFill: byId('rep-fill'),
      repValue: byId('rep-value'),
      wantedPanel: byId('wanted-panel'),
      wantedStars: byId('wanted-stars'),
      wantedCount: byId('wanted-count'),
      dispatchPanel: byId('dispatch-panel'),
      dispatchCount: byId('dispatch-count'),
      dispatchList: byId('dispatch-list'),
      healthValue: byId('health-value'),
      healthFill: byId('health-fill'),
      armourValue: byId('armour-value'),
      armourFill: byId('armour-fill'),
      speedPanel: byId('vehicle-panel'),
      speedValue: byId('speed-value'),
      gearValue: byId('gear-value'),
      vehicleName: byId('vehicle-name'),
      vehicleClass: byId('vehicle-class'),
      vehicleCondition: byId('vehicle-condition'),
      vehicleConditionFill: byId('vehicle-condition-fill'),
      radioStation: byId('radio-station'),
      radioTrack: byId('radio-track'),
      prompt: byId('prompt'),
      subtitle: byId('subtitle'),
      subtitleSpeaker: byId('subtitle-speaker'),
      subtitleLine: byId('subtitle-line'),
      portrait: byId('subtitle-portrait'),
      reticle: byId('reticle'),
      hitMarker: byId('hit-marker'),
      coverBadge: byId('coverBadge') ?? byId('cover-badge'),
      damageFlash: byId('damage-flash'),
      screenMessage: byId('screen-message'),
      screenMessageTitle: byId('screen-message-title'),
      screenMessageSub: byId('screen-message-sub'),
      screenRetry: byId('screen-retry'),
      blackFade: byId('black-fade'),
      missionOverlay: byId('mission-overlay'),
      missionOverlayKicker: byId('mission-overlay-kicker'),
      missionOverlayTitle: byId('mission-overlay-title'),
      missionOverlayCopy: byId('mission-overlay-copy'),
      missionOverlayReward: byId('mission-overlay-reward'),
      missionOverlayRetry: byId('mission-overlay-retry'),
    };
    this.slots = Array.from(document.querySelectorAll('#weapon-wheel .weapon-slot'));
    this.slots.forEach((slot, index) => drawWeaponIcon(slot.querySelector('canvas'), WEAPON_IDS[index]));
    this.elapsed = 0;
    this.hintsUntil = performance.now() + 8000;
    this.elements.hud.querySelector('#debug-line')?.classList.remove('faded');
    this.subtitleUntil = 0;
    this.districtUntil = 0;
    this.damageUntil = 0;
    this.hitMarkerUntil = 0;
    this.dispatchSignature = null;
    this.pipSignature = '';
    this.lastWanted = 0;
    this.onRetry = null;
    this.moneyShown = 2450;
    this.moneyTarget = 2450;
    this.moneyBumpUntil = 0;
    this.failTimer = null;
    this.completeTimer = null;
    this.rankUntil = 0;
    this.repPanel = byId('money-panel');
    this.elements.screenRetry?.addEventListener('click', () => this.onRetry?.());
    this.elements.missionOverlayRetry?.addEventListener('click', () => this.onRetry?.());
  }

  setMission(mission) {
    if (!mission) {
      this.elements.missionCard.classList.add('hidden');
      return;
    }
    this.elements.missionCard.classList.remove('hidden');
    setText(this.elements.missionJob, mission.job ?? 'FREE ROAM');
    setText(this.elements.missionStage, mission.stage ?? '—');
    setText(this.elements.missionObjective, mission.objective ?? '');
    setText(this.elements.missionReward, mission.reward ?? '$1,200 · +80 RESPECT');
    setText(this.elements.missionNext, mission.nextHint ? `NEXT · ${mission.nextHint}` : '');
    const timer = String(mission.timer ?? '');
    this.elements.missionTimer.classList.toggle('hidden', !timer);
    if (timer) {
      setText(this.elements.missionTimer, `TIME ${timer}`);
      this.elements.missionTimer.classList.toggle('urgent', timer.startsWith('00:') && Number(timer.slice(3)) <= 10);
    } else {
      this.elements.missionTimer.classList.remove('urgent');
    }
    const total = mission.stageCount ?? 0;
    const signature = `${total}/${mission.stageIndex ?? 0}`;
    if (signature !== this.pipSignature) {
      this.pipSignature = signature;
      this.elements.missionPips.replaceChildren();
      for (let i = 0; i < total; i += 1) {
        const pip = document.createElement('i');
        pip.className = i < (mission.stageIndex ?? 0) - 1 ? 'done' : i === (mission.stageIndex ?? 0) - 1 ? 'current' : '';
        this.elements.missionPips.append(pip);
      }
    }
  }

  setWanted(stars) {
    const count = Math.max(0, Math.min(5, Math.round(stars)));
    const starText = [];
    for (let i = 0; i < 5; i += 1) starText.push(i < count ? '★' : '☆');
    setText(this.elements.wantedStars, starText.join(''));
    setText(this.elements.wantedCount, count ? `${count} / 5` : 'CLEAN');
    this.elements.wantedPanel.classList.toggle('hot', count > 0);
    if (count !== this.lastWanted) {
      this.elements.wantedPanel.classList.remove('wanted-flash');
      void this.elements.wantedPanel.offsetWidth;
      if (count > 0) this.elements.wantedPanel.classList.add('wanted-flash');
      this.lastWanted = count;
    }
  }

  setDispatch(units, wanted = 0) {
    const roster = units ?? [];
    const header = wanted > 0 ? `${roster.length} UNIT${roster.length === 1 ? '' : 'S'} RESPONDING` : `${roster.length} UNIT${roster.length === 1 ? '' : 'S'}`;
    setText(this.elements.dispatchCount, header);
    const signature = roster.map((unit) => `${unit.callsign}${unit.tactic}${Math.round(unit.distance ?? 0)}`).join('|');
    if (signature === this.dispatchSignature) return;
    this.dispatchSignature = signature;
    const list = this.elements.dispatchList;
    list.replaceChildren();
    if (!roster.length) {
      const row = document.createElement('div');
      row.className = 'dispatch-row idle';
      const label = document.createElement('span');
      label.textContent = 'NO ACTIVE UNITS';
      const tactic = document.createElement('span');
      tactic.className = 'dispatch-tactic idle';
      tactic.textContent = wanted > 0 ? 'STANDBY' : 'PATROL';
      row.append(label, tactic);
      list.append(row);
      return;
    }
    for (const unit of roster.slice(0, 6)) {
      const row = document.createElement('div');
      row.className = 'dispatch-row';
      const label = document.createElement('span');
      label.textContent = `${unit.callsign} · ${unit.kind ?? 'UNIT'}`;
      const tactic = document.createElement('span');
      const tac = String(unit.tactic ?? 'PATROL').toUpperCase();
      tactic.className = `dispatch-tactic ${tac.toLowerCase().replace(/\s+/g, '-')}`;
      tactic.textContent = `${tac} ${Math.round(unit.distance ?? 0)}M`;
      row.append(label, tactic);
      list.append(row);
    }
  }

  setWeapons(weapons, activeId) {
    this.slots.forEach((slot, index) => {
      const weapon = weapons[index];
      const active = Boolean(weapon) && weapon.id === activeId;
      slot.classList.toggle('active', active);
      slot.classList.toggle('locked', !weapon || !weapon.unlocked);
      slot.classList.toggle('reloading', Boolean(weapon?.reloading > 0));
      setText(slot.querySelector('b'), index + 1);
      setText(slot.querySelector('span'), weapon ? weapon.name : '—');
      let ammoText = '—';
      if (!weapon || !weapon.unlocked) ammoText = 'LOCK';
      else if (weapon.kind === 'melee') ammoText = '∞';
      else if (weapon.reloading > 0) ammoText = 'RLD';
      else ammoText = `${weapon.ammo}/${weapon.reserve ?? 0}`;
      setText(slot.querySelector('small'), ammoText);
    });
  }

  flashHitMarker() {
    this.hitMarkerUntil = performance.now() + 120;
    this.elements.hitMarker?.classList.remove('hidden');
  }

  showMessage(title, sub = '', showRetry = false) {
    setText(this.elements.screenMessageTitle, title);
    setText(this.elements.screenMessageSub, sub);
    this.elements.screenRetry.style.display = showRetry ? 'inline-block' : 'none';
    this.elements.screenMessage.classList.remove('hidden');
  }

  hideMessage() {
    this.elements.screenMessage?.classList.add('hidden');
  }

  setSpeed(kmh, gear) {
    setText(this.elements.speedValue, String(Math.round(kmh)).padStart(3, '0'));
    setText(this.elements.gearValue, gear ?? 'N');
    this.elements.speedPanel.classList.toggle('on-foot', kmh < 1);
  }

  setRadio(station, track) {
    setText(this.elements.radioStation, (station ?? 'RADIO MAREA 92.7').toUpperCase());
    setText(this.elements.radioTrack, (track ?? 'SON CARIBE').toUpperCase());
  }

  setMoney(amount, animate = false) {
    this.moneyTarget = Math.max(0, Math.round(amount));
    if (animate) this.moneyBumpUntil = performance.now() + 1100;
    if (!animate) {
      this.moneyShown = this.moneyTarget;
      setText(this.elements.money, `$ ${this.moneyTarget.toLocaleString('en-US')}`);
    }
  }

  setCrabs(count, total = 12) {
    setText(this.elements.crabCounter, `◆ GOLDEN CRABS ${count} / ${total}`);
  }

  rankFlash(rank) {
    setText(this.elements.repRank, rank ?? 'DOCK HAND');
    this.rankUntil = performance.now() + 2200;
    this.repPanel?.classList.add('rank-up');
    this.say('PMPD SCANNER', `Reputation rank reached: ${rank}. New crew muscle unlocked.`);
  }

  showMissionFailed(reason = 'MISSION FAILED', job = '') {
    setText(this.elements.missionOverlayKicker, job ?? '');
    setText(this.elements.missionOverlayTitle, 'MISSION FAILED');
    setText(this.elements.missionOverlayCopy, reason ?? 'The crew scattered. Regroup and try again.');
    setText(this.elements.missionOverlayReward, '');
    this.elements.missionOverlayRetry.style.display = 'inline-block';
    this.elements.missionOverlay.classList.add('hidden');
    this.elements.blackFade.classList.add('visible');
    this.failTimer = performance.now() + 460;
    this.completeTimer = 0;
  }

  showMissionComplete(job, reward = {}) {
    const name = job?.title ? `JOB ${String(job.number).padStart(2, '0')} · ${job.title}` : 'JOB COMPLETE';
    setText(this.elements.missionOverlayKicker, name);
    setText(this.elements.missionOverlayTitle, 'MISSION PASSED');
    setText(this.elements.missionOverlayCopy, job?.barks?.complete ?? 'Contract closed. The city moves on.');
    const cash = Math.max(0, Math.round(reward.cash ?? 0));
    const rep = Math.max(0, Math.round(reward.rep ?? 0));
    setText(this.elements.missionOverlayReward, `PAID $ ${cash.toLocaleString('en-US')}    ·    REPUTATION +${rep}`);
    this.elements.missionOverlayRetry.style.display = 'none';
    this.elements.blackFade.classList.remove('visible');
    this.elements.missionOverlay.classList.remove('hidden');
    this.elements.missionOverlay.classList.remove('overlay-in');
    void this.elements.missionOverlay.offsetWidth;
    this.elements.missionOverlay.classList.add('overlay-in');
    this.failTimer = 0;
    this.completeTimer = performance.now() + 4200;
  }

  hideMissionCardEffects() {
    this.failTimer = null;
    this.completeTimer = null;
    this.elements.blackFade.classList.remove('visible');
    this.elements.missionOverlay.classList.add('hidden');
  }

  setDimmed(dimmed = false) {
    this.elements.hud.classList.toggle('dimmed', Boolean(dimmed));
  }

  setHidden(hidden = false) {
    this.elements.hud.classList.toggle('hidden', Boolean(hidden));
  }

  setRep(rank, xp, next) {
    setText(this.elements.repRank, rank ?? 'DOCK HAND');
    setText(this.elements.repValue, Math.round(xp ?? 0));
    this.elements.repFill.style.width = `${Math.max(0, Math.min(100, ((xp ?? 0) / Math.max(1, next ?? 1)) * 100))}%`;
  }

  setHealth(health, armour) {
    setText(this.elements.healthValue, Math.round(health));
    setText(this.elements.armourValue, Math.round(armour));
    this.elements.healthFill.style.width = `${Math.max(0, Math.min(100, health))}%`;
    this.elements.armourFill.style.width = `${Math.max(0, Math.min(100, armour))}%`;
  }

  setVehicle(name, condition, className) {
    const onFoot = !name;
    setText(this.elements.vehicleName, onFoot ? 'ON FOOT' : String(name).toUpperCase());
    setText(this.elements.vehicleClass, onFoot ? 'NO VEHICLE' : className ?? 'ROAD VEHICLE');
    setText(this.elements.vehicleCondition, onFoot ? '—' : `${Math.round(condition ?? 100)}%`);
    this.elements.vehicleConditionFill.style.width = `${onFoot ? 0 : Math.max(0, Math.min(100, condition ?? 100))}%`;
  }

  setClock(hours) {
    const wrapped = ((hours % 24) + 24) % 24;
    const hour = Math.floor(wrapped);
    const minute = Math.floor((wrapped - hour) * 60);
    setText(this.elements.clockTime, `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
    const phase = wrapped < 5 ? 'NIGHT' : wrapped < 8 ? 'DAWN' : wrapped < 16.8 ? 'DAY' : wrapped < 20 ? 'GOLDEN HOUR' : 'NIGHT';
    setText(this.elements.clockPhase, phase);
  }

  say(speaker, line) {
    setText(this.elements.subtitleSpeaker, `${speaker} ·`);
    setText(this.elements.subtitleLine, line);
    const character = portraitForSpeaker(speaker);
    this.elements.portrait.classList.toggle('hidden', !character);
    if (character) drawPortrait(this.elements.portrait, character);
    this.elements.subtitle.classList.remove('hidden');
    this.elements.subtitle.classList.remove('subtitle-in');
    void this.elements.subtitle.offsetWidth;
    this.elements.subtitle.classList.add('subtitle-in');
    this.subtitleUntil = performance.now() + 5200;
  }

  showDistrict(name, sub) {
    setText(this.elements.districtName, name);
    setText(this.elements.districtSub, sub);
    setText(this.elements.mapDistrict, (name ?? '').toUpperCase());
    this.elements.districtPanel.classList.remove('district-in');
    void this.elements.districtPanel.offsetWidth;
    this.elements.districtPanel.classList.add('district-in');
    this.districtUntil = performance.now() + 2600;
  }

  setPrompt(text) {
    this.elements.prompt.classList.toggle('hidden', !text);
    if (text) setText(this.elements.prompt, text);
  }

  setAiming(aiming, crouching) {
    this.elements.reticle.classList.toggle('hidden', !aiming);
    this.elements.coverBadge.classList.toggle('hidden', !crouching);
    this.elements.hud.classList.toggle('aiming', Boolean(aiming));
  }

  flashDamage() {
    this.damageUntil = performance.now() + 240;
    this.elements.damageFlash.classList.add('visible');
  }

  tick(dt) {
    this.elapsed += dt;
    const now = performance.now();
    if (this.hintsUntil && now > this.hintsUntil) {
      this.elements.hud.querySelector('#debug-line')?.classList.add('faded');
      this.hintsUntil = 0;
    }
    if (this.subtitleUntil && now > this.subtitleUntil) {
      this.elements.subtitle.classList.add('hidden');
      this.subtitleUntil = 0;
    }
    if (this.districtUntil && now > this.districtUntil) {
      this.elements.districtPanel.classList.remove('district-in');
      this.districtUntil = 0;
    }
    if (this.damageUntil && now > this.damageUntil) {
      this.elements.damageFlash.classList.remove('visible');
      this.damageUntil = 0;
    }
    if (this.hitMarkerUntil && now > this.hitMarkerUntil) {
      this.elements.hitMarker?.classList.add('hidden');
      this.hitMarkerUntil = 0;
    }
    if (this.rankUntil && now > this.rankUntil) {
      this.repPanel?.classList.remove('rank-up');
      this.rankUntil = 0;
    }
    if (this.failTimer && now > this.failTimer) {
      this.elements.missionOverlay.classList.remove('hidden');
      this.elements.missionOverlay.classList.remove('overlay-in');
      void this.elements.missionOverlay.offsetWidth;
      this.elements.missionOverlay.classList.add('overlay-in');
      this.failTimer = 0;
    }
    if (this.completeTimer && now > this.completeTimer) {
      this.elements.missionOverlay.classList.add('hidden');
      this.completeTimer = 0;
    }
    if (this.moneyShown !== this.moneyTarget) {
      const delta = this.moneyTarget - this.moneyShown;
      this.moneyShown = Math.abs(delta) < 1 ? this.moneyTarget : this.moneyShown + delta * Math.min(1, dt * 9);
      setText(this.elements.money, `$ ${Math.round(this.moneyShown).toLocaleString('en-US')}`);
    }
    this.elements.money.classList.toggle('cash-bump', now < this.moneyBumpUntil);
    document.documentElement.style.setProperty('--radio-pulse', String(0.5 + Math.sin(this.elapsed * 5) * 0.5));
  }
}
