import {
  DISTRICTS, ROADS, BLOCKS, SPAWN_POINTS, MARKERS, CRAB_SPOTS, districtAt,
} from '../world/cityLayout.js';
import { minimapPolylines, nearestRoadPoint } from '../world/roadNetwork.js';
import { JOBS, SIDE_JOBS } from '../story/campaign.js';
import { GARAGE_UPGRADES, RESPRAY_PRICE } from '../systems/economy.js';
import { CHARACTERS, CREW_ABILITIES, drawPortrait } from '../story/characters.js';

const TABS = ['MAP', 'STORY', 'STATS', 'CREW', 'CONTROLS', 'SAVE'];

const MARKUP = `
<div id="menu-root" class="hidden">
  <section id="title-screen">
    <div class="title-haze"></div>
    <div class="title-frame">
      <p class="title-kicker">PUERTO MAREA · A CITY THAT KEEPS SCORE</p>
      <h1 class="title-logo">MAREA<span>ROJA</span></h1>
      <p class="title-tagline">Eight jobs. One crew. No clean exits.</p>
      <nav class="title-actions">
        <button type="button" data-action="new">NEW GAME</button>
        <button type="button" data-action="continue">CONTINUE</button>
        <button type="button" data-action="gallery">CINEMATIC GALLERY</button>
        <button type="button" data-action="controls">CONTROLS</button>
      </nav>
      <p class="title-foot">ARROWS SELECT · ENTER CONFIRM · ESC PAUSES IN GAME</p>
    </div>
  </section>

  <section id="pause-menu" class="menu-window hidden">
    <header class="menu-header">
      <div><span class="eyebrow">PUERTO MAREA</span><h2>PAUSED</h2></div>
      <nav id="menu-tabs"></nav>
    </header>
    <div id="menu-body"></div>
    <footer class="menu-footer">ESC CLOSE · ARROWS SWITCH TABS · ENTER SELECT</footer>
  </section>

  <section id="garage-menu" class="menu-window small hidden">
    <header class="menu-header">
      <div><span class="eyebrow">TAVO'S SHOP · CALLE MAREA</span><h2>GARAGE</h2></div>
    </header>
    <div id="garage-body"></div>
    <footer class="menu-footer">UP / DOWN SELECT · ENTER BUY · ESC LEAVE</footer>
  </section>

  <section id="gallery-menu" class="menu-window small hidden">
    <header class="menu-header"><div><span class="eyebrow">ARCHIVE FOOTAGE</span><h2>CINEMATIC GALLERY</h2></div></header>
    <div class="gallery-grid">
      <button type="button" data-shot="chase">THE CHASE</button>
      <button type="button" data-shot="shootout">THE SHOOTOUT</button>
      <button type="button" data-shot="drive">THE COAST ROAD</button>
      <button type="button" data-shot="menu">THE BRIEFING</button>
    </div>
    <footer class="menu-footer">ENTER PLAY · ESC BACK</footer>
  </section>

  <section id="controls-menu" class="menu-window small hidden">
    <header class="menu-header"><div><span class="eyebrow">FIELD MANUAL</span><h2>CONTROLS</h2></div></header>
    <div class="controls-grid">
      <div><b>WASD</b><span>MOVE / DRIVE</span></div>
      <div><b>SHIFT</b><span>RUN</span></div>
      <div><b>MOUSE</b><span>LOOK / AIM</span></div>
      <div><b>LMB / RMB</b><span>FIRE / AIM</span></div>
      <div><b>F</b><span>ENTER / EXIT CAR</span></div>
      <div><b>E</b><span>START JOB / GARAGE</span></div>
      <div><b>H</b><span>HORN</span></div>
      <div><b>B / M</b><span>RADIO / MUTE</span></div>
      <div><b>R</b><span>RELOAD</span></div>
      <div><b>1-6</b><span>WEAPONS</span></div>
      <div><b>C</b><span>COVER</span></div>
      <div><b>ESC</b><span>PAUSE MENU</span></div>
    </div>
    <footer class="menu-footer">ESC BACK</footer>
  </section>
</div>`;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function pad(value) {
  return String(value).padStart(2, '0');
}

export class Menus {
  constructor(game) {
    this.game = game;
    const mount = document.getElementById('hud-root') ?? document.body;
    mount.insertAdjacentHTML('beforeend', MARKUP);
    this.root = document.getElementById('menu-root');
    this.sections = {
      title: document.getElementById('title-screen'),
      pause: document.getElementById('pause-menu'),
      garage: document.getElementById('garage-menu'),
      gallery: document.getElementById('gallery-menu'),
      controls: document.getElementById('controls-menu'),
    };
    this.tabs = document.getElementById('menu-tabs');
    this.body = document.getElementById('menu-body');
    this.garageBody = document.getElementById('garage-body');
    this.mode = 'closed';
    this.tab = 'MAP';
    this.selected = 0;
    this.garageSelection = 0;
    this.elapsed = 0;
    this.mapContext = null;

    this.root.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.dataset.action) this.activate(button.dataset.action);
      else if (button.dataset.tab) this.openTab(button.dataset.tab);
      else if (button.dataset.slot) this.saveTo(Number(button.dataset.slot));
      else if (button.dataset.load) this.loadFrom(Number(button.dataset.load));
      else if (button.dataset.upgrade) this.buyUpgrade(button.dataset.upgrade);
      else if (button.dataset.respray !== undefined) this.respray();
      else if (button.dataset.shot) this.playShot(button.dataset.shot);
      else if (button.dataset.ability) this.useAbility(button.dataset.ability);
    });
  }

  get isOpen() {
    return this.mode !== 'closed';
  }

  show(section) {
    for (const [name, element] of Object.entries(this.sections)) element.classList.toggle('hidden', name !== section);
    this.root.classList.remove('hidden');
    this.root.classList.toggle('paused', section === 'pause');
    this.mode = section;
    this.game.hud.setDimmed(true);
    this.game.hud.setHidden(true);
  }

  close() {
    this.root.classList.add('hidden');
    this.root.classList.remove('paused');
    for (const element of Object.values(this.sections)) element.classList.add('hidden');
    this.mode = 'closed';
    this.game.hud.setDimmed(false);
    this.game.hud.setHidden(false);
    this.game.input.locked = false;
    if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock();
  }

  openTitle() {
    this.show('title');
    this.selected = this.game.saveGame?.hasAny() ? 1 : 0;
    this.syncTitleSelection();
    this.syncContinueButton();
  }

  openPause(tab = 'MAP') {
    this.show('pause');
    this.openTab(tab);
  }

  toggle(tab = 'MAP') {
    if (this.mode === 'pause') this.close();
    else if (this.mode === 'closed') this.openPause(tab);
  }

  openGarage() {
    this.show('garage');
    this.renderGarage();
  }

  openGallery() {
    this.show('gallery');
  }

  openControls() {
    this.show('controls');
  }

  openTab(tab) {
    if (!TABS.includes(tab)) tab = 'MAP';
    this.tab = tab;
    this.tabs.innerHTML = TABS.map((name) => `<button type="button" data-tab="${name}" class="${name === tab ? 'active' : ''}">${name}</button>`).join('');
    this.renderBody();
  }

  syncContinueButton() {
    const button = this.sections.title.querySelector('[data-action="continue"]');
    if (button) button.classList.toggle('disabled', !this.game.saveGame?.hasAny());
  }

  syncTitleSelection() {
    const buttons = [...this.sections.title.querySelectorAll('button[data-action]')];
    buttons.forEach((button, index) => button.classList.toggle('selected', index === this.selected));
  }

  activate(action) {
    this.game.audio.uiClick();
    if (action === 'new') this.game.startNewGame();
    else if (action === 'continue') {
      if (this.game.saveGame?.hasAny()) this.game.continueGame();
    } else if (action === 'gallery') this.openGallery();
    else if (action === 'controls') this.openControls();
  }

  handleInput() {
    if (!this.isOpen) return false;
    const input = this.game.input;
    if (input.wasPressed('Escape')) {
      if (this.mode !== 'title') {
        if (this.mode === 'pause' || this.mode === 'garage') this.close();
        else this.openTitle();
      }
      return true;
    }
    if (this.mode === 'title') {
      const actions = ['new', 'continue', 'gallery', 'controls'];
      if (input.wasPressed('ArrowUp') || input.wasPressed('KeyW')) this.selected = (this.selected + actions.length - 1) % actions.length;
      if (input.wasPressed('ArrowDown') || input.wasPressed('KeyS')) this.selected = (this.selected + 1) % actions.length;
      this.syncTitleSelection();
      if (input.wasPressed('Enter') || input.wasPressed('Space') || input.wasPressed('NumpadEnter')) this.activate(actions[this.selected]);
      return true;
    }
    if (this.mode === 'pause') {
      const index = TABS.indexOf(this.tab);
      if (input.wasPressed('ArrowLeft') || input.wasPressed('KeyA')) this.openTab(TABS[(index + TABS.length - 1) % TABS.length]);
      if (input.wasPressed('ArrowRight') || input.wasPressed('KeyD')) this.openTab(TABS[(index + 1) % TABS.length]);
      if (input.wasPressed('Digit1')) this.openTab('MAP');
      if (input.wasPressed('Digit2')) this.openTab('STORY');
      if (input.wasPressed('Digit3')) this.openTab('STATS');
      if (input.wasPressed('Digit4')) this.openTab('CREW');
      if (input.wasPressed('Digit5')) this.openTab('CONTROLS');
      if (input.wasPressed('Digit6')) this.openTab('SAVE');
      return true;
    }
    if (this.mode === 'garage') {
      const count = GARAGE_UPGRADES.length + 1;
      if (input.wasPressed('ArrowUp') || input.wasPressed('KeyW')) this.garageSelection = (this.garageSelection + count - 1) % count;
      if (input.wasPressed('ArrowDown') || input.wasPressed('KeyS')) this.garageSelection = (this.garageSelection + 1) % count;
      if (input.wasPressed('Enter') || input.wasPressed('NumpadEnter')) {
        if (this.garageSelection < GARAGE_UPGRADES.length) this.buyUpgrade(GARAGE_UPGRADES[this.garageSelection].id);
        else this.respray();
      }
      this.syncGarageSelection();
      return true;
    }
    return true;
  }

  update(dt) {
    if (!this.isOpen) return;
    this.elapsed += dt;
    if (this.mode === 'title') {
      const camera = this.game.engine.camera;
      const t = this.elapsed * 0.075;
      camera.position.set(
        Math.sin(t) * 310 - 30,
        72 + Math.sin(t * 0.8) * 22,
        Math.cos(t) * 245 + 125,
      );
      camera.lookAt(Math.sin(t + 1.4) * 70, 10, Math.cos(t + 1.4) * 60 + 120);
      this.game.engine.sun.target.position.set(0, 0, 40);
      this.game.engine.sun.position.copy(this.game.engine.sun.target.position).addScaledVector(this.game.engine.sunDirection, 220);
      this.game.engine.sun.target.updateMatrixWorld();
    }
    if (this.mode === 'pause' && this.tab === 'MAP' && this.mapContext) this.drawMap();
  }

  renderBody() {
    if (this.tab === 'MAP') this.renderMap();
    else if (this.tab === 'STORY') this.renderStory();
    else if (this.tab === 'STATS') this.renderStats();
    else if (this.tab === 'CREW') this.renderCrew();
    else if (this.tab === 'CONTROLS') this.renderControlsTab();
    else if (this.tab === 'SAVE') this.renderSaves();
  }

  renderMap() {
    const mission = this.game.missions;
    const target = mission?.markerPosition;
    const district = districtAt(this.game.player.position.x, this.game.player.position.z);
    this.body.innerHTML = `
      <div class="map-layout">
        <canvas id="menu-map" width="620" height="380"></canvas>
        <aside class="map-side">
          <span class="eyebrow">CURRENT DISTRICT</span>
          <h3>${escapeHtml(district.name)}</h3>
          <p>${escapeHtml(district.sub)}</p>
          <div class="map-divider"></div>
          <span class="eyebrow">ACTIVE OBJECTIVE</span>
          <p>${escapeHtml(mission?.objective ?? 'Free roam')}</p>
          <div class="map-divider"></div>
          <span class="eyebrow">LEGEND</span>
          <p><i class="dot coral"></i> JOB MARKER<br><i class="dot teal"></i> GARAGE<br><i class="dot gold"></i> GOLDEN CRAB<br><i class="dot blue"></i> PMPD UNIT</p>
          ${target ? `<p class="map-coords">TARGET ${Math.round(target.x)} / ${Math.round(target.z)}</p>` : ''}
        </aside>
      </div>`;
    this.mapContext = this.body.querySelector('#menu-map')?.getContext('2d') ?? null;
  }

  drawMap() {
    const ctx = this.mapContext;
    if (!ctx) return;
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    const centerX = 0;
    const centerZ = 150;
    const scale = Math.min((width - 36) / 740, (height - 36) / 440);
    const toX = (x) => width / 2 + (x - centerX) * scale;
    const toY = (z) => height / 2 + (z - centerZ) * scale;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0a1b24';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(42, 105, 118, 0.3)';
    ctx.fillRect(0, 0, width, toY(-52));

    for (const district of DISTRICTS) {
      ctx.fillStyle = `${district.tint}16`;
      ctx.fillRect(toX(district.minX), toY(district.minZ), (district.maxX - district.minX) * scale, (district.maxZ - district.minZ) * scale);
      ctx.strokeStyle = `${district.tint}55`;
      ctx.lineWidth = 1;
      ctx.strokeRect(toX(district.minX), toY(district.minZ), (district.maxX - district.minX) * scale, (district.maxZ - district.minZ) * scale);
      ctx.fillStyle = `${district.tint}bb`;
      ctx.font = '9px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(district.name.toUpperCase(), toX((district.minX + district.maxX) / 2), toY((district.minZ + district.maxZ) / 2));
    }

    ctx.fillStyle = 'rgba(231, 214, 176, 0.08)';
    for (const block of BLOCKS) ctx.fillRect(toX(block.x - block.width / 2), toY(block.z - block.depth / 2), block.width * scale, block.depth * scale);

    const lines = minimapPolylines();
    lines.forEach((line, index) => {
      ctx.strokeStyle = '#5d7a7d';
      ctx.lineWidth = Math.max(2, ROADS[index].width * scale);
      ctx.beginPath();
      ctx.moveTo(toX(line[0].x), toY(line[0].z));
      ctx.lineTo(toX(line[1].x), toY(line[1].z));
      ctx.stroke();
    });

    const player = this.game.player.position;
    const target = this.game.missions?.markerPosition;
    if (target) {
      const startRoad = nearestRoadPoint(player.x, player.z);
      const endRoad = nearestRoadPoint(target.x, target.z);
      ctx.strokeStyle = 'rgba(255, 122, 92, 0.9)';
      ctx.lineWidth = 2.4;
      ctx.setLineDash([9, 6]);
      ctx.beginPath();
      ctx.moveTo(toX(player.x), toY(player.z));
      if (startRoad) ctx.lineTo(toX(startRoad.x), toY(startRoad.z));
      if (endRoad) ctx.lineTo(toX(endRoad.x), toY(endRoad.z));
      ctx.lineTo(toX(target.x), toY(target.z));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (const marker of MARKERS) {
      const x = toX(marker.x);
      const y = toY(marker.z);
      ctx.fillStyle = '#ff7a5c';
      ctx.beginPath();
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x + 6, y);
      ctx.lineTo(x, y + 6);
      ctx.lineTo(x - 6, y);
      ctx.closePath();
      ctx.fill();
      ctx.font = '7px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#f7ead3';
      ctx.fillText(marker.label, x + 9, y + 3);
    }

    const garage = SPAWN_POINTS.garage;
    ctx.fillStyle = '#69d3c1';
    ctx.fillRect(toX(garage.x) - 6, toY(garage.z) - 6, 12, 12);
    ctx.fillStyle = '#082028';
    ctx.font = 'bold 9px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('G', toX(garage.x), toY(garage.z) + 3);

    for (const crab of this.game.economy?.crabs ?? CRAB_SPOTS) {
      if (crab.collected) continue;
      ctx.fillStyle = '#ffcc79';
      ctx.beginPath();
      ctx.arc(toX(crab.x), toY(crab.z), 2.6, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const unit of this.game.police?.units ?? []) {
      if (unit.dead || !unit.position) continue;
      ctx.fillStyle = '#ff4d52';
      ctx.beginPath();
      ctx.arc(toX(unit.position.x), toY(unit.position.z), 3.8, 0, Math.PI * 2);
      ctx.fill();
    }

    const px = toX(player.x);
    const py = toY(player.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-(player.viewYaw ?? 0));
    ctx.fillStyle = '#9ff5e3';
    ctx.strokeStyle = '#072029';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, 10);
    ctx.lineTo(-7, -8);
    ctx.lineTo(0, -4);
    ctx.lineTo(7, -8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  renderStory() {
    const completed = this.game.missions?.completed ?? new Set();
    const cards = JOBS.map((job) => {
      const cleared = completed.has(job.id);
      return `<article class="story-card ${cleared ? 'done' : ''}">
        <div class="story-num">${pad(job.number)}</div>
        <div class="story-copy"><h3>${escapeHtml(job.title)}</h3><span>${escapeHtml(job.giver)}</span><p>${escapeHtml(job.briefing[0] ?? '')}</p></div>
        <div class="story-state">${cleared ? 'CLEARED' : 'OPEN'}</div>
      </article>`;
    }).join('');
    const side = SIDE_JOBS.map((request) => {
      const done = this.game.economy?.thefts[request.id];
      return `<article class="side-card ${done ? 'done' : ''}"><b>${escapeHtml(request.title)}</b><span>${escapeHtml(request.giver ?? 'Kiki Sol')}</span><small>${done ? 'DELIVERED' : 'OPEN'}</small></article>`;
    }).join('');
    this.body.innerHTML = `<div class="story-list">${cards}</div><div class="side-list"><span class="eyebrow">KIKI'S FAVORS</span>${side}</div>`;
  }

  renderStats() {
    const stats = this.game.stats ?? {};
    const percent = Math.max(0, Math.min(100, Number(stats.completion) || 0));
    const rows = [
      ['CARS TAKEN', stats.carsStolen ?? 0],
      ['COPS LOST', stats.copsEscaped ?? 0],
      ['HIGHEST WANTED', `${stats.highestWanted ?? 0} / 5`],
      ['DISTANCE DRIVEN', `${Math.round(stats.distanceDriven ?? 0)} M`],
      ['PEOPLE TAKEN OUT', stats.takenOut ?? 0],
      ['LONGEST JUMP', `${Math.round(stats.longestJump ?? 0)} M`],
      ['GOLDEN CRABS', `${this.game.economy?.crabCount ?? 0} / ${this.game.economy?.crabs.length ?? 12}`],
      ['CURRENT RANK', this.game.economy?.rank ?? 'DOCK HAND'],
    ];
    this.body.innerHTML = `<div class="stats-layout">
      <div class="stats-ring" style="background:conic-gradient(var(--coral) ${percent}%, rgba(255,255,255,0.1) ${percent}%)">
        <div><b>${Math.round(percent)}%</b><span>STORY CLEARED</span></div>
      </div>
      <div class="stats-grid">${rows.map(([label, value]) => `<div><span>${label}</span><b>${escapeHtml(value)}</b></div>`).join('')}</div>
    </div>`;
  }

  renderCrew() {
    const cards = Object.values(CHARACTERS).map((profile) => `<article class="crew-card">
      <canvas data-portrait="${profile.id}" width="76" height="76"></canvas>
      <div><h3>${escapeHtml(profile.name)}</h3><span>${escapeHtml(profile.role)}</span><p>${escapeHtml(profile.voice)}</p></div>
    </article>`).join('');
    const abilities = CREW_ABILITIES.map((ability) => {
      const state = this.game.economy?.abilityState(ability.id);
      return `<article class="ability-card ${state?.unlocked ? 'unlocked' : 'locked'}">
        <b>${escapeHtml(ability.name)}</b><span>${state?.unlocked ? 'READY' : 'LOCKED'}</span><p>${escapeHtml(ability.description)}</p>
      </article>`;
    }).join('');
    this.body.innerHTML = `<div class="crew-grid">${cards}</div><div class="ability-grid">${abilities}</div>`;
    for (const canvas of this.body.querySelectorAll('canvas[data-portrait]')) drawPortrait(canvas, canvas.dataset.portrait);
  }

  renderControlsTab() {
    this.body.innerHTML = `<div class="controls-grid wide">
      <div><b>WASD</b><span>MOVE / DRIVE</span></div>
      <div><b>SHIFT</b><span>RUN</span></div>
      <div><b>MOUSE</b><span>LOOK / AIM</span></div>
      <div><b>LMB / RMB</b><span>FIRE / AIM</span></div>
      <div><b>F</b><span>ENTER / EXIT CAR</span></div>
      <div><b>E</b><span>START JOB / GARAGE</span></div>
      <div><b>R</b><span>RELOAD</span></div>
      <div><b>C</b><span>COVER</span></div>
      <div><b>B / M</b><span>RADIO / MUTE</span></div>
      <div><b>1-6</b><span>WEAPONS</span></div>
      <div><b>SCROLL</b><span>CYCLE WEAPONS</span></div>
      <div><b>ESC</b><span>PAUSE MENU</span></div>
    </div>`;
  }

  renderSaves() {
    const slots = (this.game.saveGame?.list() ?? []).map((slot) => `<article class="save-card ${slot.filled ? 'filled' : ''}">
      <div><span class="eyebrow">SLOT ${pad(slot.slot)}</span><h3>${escapeHtml(slot.filled ? slot.rank : 'EMPTY')}</h3>
      <p>${slot.filled ? `${escapeHtml(this.game.saveGame.dateLabel(slot.slot))} · $ ${slot.cash.toLocaleString('en-US')} · ${slot.xp} REP` : 'NO SAVED CREW'}</p></div>
      <div class="save-actions"><button type="button" data-slot="${slot.slot}">SAVE HERE</button>${slot.filled ? `<button type="button" data-load="${slot.slot}">LOAD</button>` : ''}</div>
    </article>`).join('');
    this.body.innerHTML = `<div class="save-list">${slots}</div>`;
  }

  renderGarage() {
    const economy = this.game.economy;
    const upgrades = GARAGE_UPGRADES.map((upgrade, index) => {
      const level = economy?.garage[upgrade.id] ?? 0;
      const price = economy?.upgradePrice(upgrade.id);
      const pips = Array.from({ length: 3 }, (_, i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('');
      return `<article class="garage-item" data-index="${index}"><div><b>${upgrade.name}</b><span>${upgrade.description}</span><div class="garage-pips">${pips}</div></div>
        <button type="button" data-upgrade="${upgrade.id}" ${price === null ? 'disabled' : ''}>${price === null ? 'MAXED' : `$ ${price.toLocaleString('en-US')}`}</button></article>`;
    }).join('');
    const resprayIndex = GARAGE_UPGRADES.length;
    this.garageBody.innerHTML = `${upgrades}
      <article class="garage-item" data-index="${resprayIndex}"><div><b>RESPRAY</b><span>New paint clears one wanted star.</span></div>
        <button type="button" data-respray="$ ${RESPRAY_PRICE.toLocaleString('en-US')}">$ ${RESPRAY_PRICE.toLocaleString('en-US')}</button></article>
      <p class="garage-cash">ON HAND: $ ${(economy?.cash ?? 0).toLocaleString('en-US')}</p>`;
    this.syncGarageSelection();
  }

  syncGarageSelection() {
    for (const item of this.garageBody.querySelectorAll('.garage-item')) {
      item.classList.toggle('selected', Number(item.dataset.index) === this.garageSelection);
    }
  }

  buyUpgrade(kind) {
    if (this.game.economy?.buyUpgrade(kind)) this.game.hud.say('TAVO “DIESEL” REYES', 'Installed. Feel the difference.');
    else this.game.hud.say('TAVO “DIESEL” REYES', 'Not enough cash, or it is already maxed.');
    this.game.audio.uiClick();
    this.renderGarage();
  }

  respray() {
    if (this.game.economy?.respray()) this.game.hud.say('TAVO “DIESEL” REYES', 'Fresh coat. Keep it clean.');
    else this.game.hud.say('TAVO “DIESEL” REYES', 'Nothing to hide, or no cash in the pocket.');
    this.renderGarage();
  }

  useAbility(id) {
    this.game.economy?.useAbility(id);
  }

  playShot(name) {
    this.close();
    const search = new URLSearchParams(window.location.search);
    search.set('shot', name);
    window.location.search = search.toString();
  }

  saveTo(slot) {
    const data = this.game.captureSave();
    const entry = this.game.saveGame.save(slot, data);
    this.game.audio.uiClick();
    this.game.hud.say('PMPD ARCHIVE', `Crew record written to slot ${pad(slot)} on ${this.game.saveGame.dateLabel(slot)}.`);
    if (entry && this.tab === 'SAVE') this.renderBody();
  }

  loadFrom(slot) {
    const data = this.game.saveGame.load(slot);
    if (!data) {
      this.game.audio.uiClick();
      return;
    }
    this.game.audio.uiClick();
    this.game.restoreSave(data);
    this.close();
  }
}
