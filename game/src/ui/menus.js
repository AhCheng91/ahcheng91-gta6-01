import {
  DISTRICTS, ROADS, BLOCKS, SPAWN_POINTS, MARKERS, CRAB_SPOTS, districtAt,
} from '../world/cityLayout.js';
import { minimapPolylines, nearestRoadPoint } from '../world/roadNetwork.js';
import { JOBS, SIDE_JOBS } from '../story/campaign.js';
import { GARAGE_UPGRADES, RESPRAY_PRICE } from '../systems/economy.js';
import { CHARACTERS, CREW_ABILITIES, drawPortrait } from '../story/characters.js';

const TABS = ['MAP', 'STORY', 'STATS', 'CREW', 'CONTROLS', 'SAVE'];

const MARKUP = `
<style>
#pause-menu { width: min(1180px, 94vw); max-height: 90vh; background: linear-gradient(160deg, rgba(8,22,30,0.98), rgba(5,14,20,0.98)); }
#pause-menu .pause-top { align-items: center; gap: 14px; padding: 12px 18px 11px; background: linear-gradient(90deg, rgba(255,204,121,0.08), transparent 38%); }
#pause-menu .pause-brand { min-width: 190px; display: flex; flex-direction: column; gap: 2px; }
#pause-menu .pause-wordmark { font-family: Georgia, 'Times New Roman', serif; font-size: 23px; font-weight: 700; letter-spacing: 0.12em; color: var(--gold); text-shadow: 0 2px 14px rgba(255,190,90,0.3); white-space: nowrap; }
#pause-menu .pause-kicker { font-size: 8px; letter-spacing: 0.28em; color: var(--teal); }
#pause-menu .pause-tabs { flex: 1; justify-content: center; gap: 5px; }
#pause-menu #menu-tabs button { border-radius: 999px; padding: 7px 11px; font-size: 8px; color: var(--muted); background: rgba(255,255,255,0.045); border: 1px solid rgba(255,227,187,0.2); }
#pause-menu #menu-tabs button.active { background: var(--coral); border-color: var(--coral); color: #241410; font-weight: 800; box-shadow: 0 0 16px rgba(255,122,92,0.35); }
#pause-menu .pause-cash { min-width: 170px; display: flex; flex-direction: column; align-items: flex-end; gap: 1px; }
#pause-menu .pause-cash b { font-size: 27px; line-height: 1; letter-spacing: 0.04em; color: var(--gold); font-variant-numeric: tabular-nums; }
#pause-menu #menu-body { overflow: hidden; padding: 13px 16px 12px; }
#pause-menu .pause-footer { display: flex; justify-content: center; gap: 26px; padding: 8px 18px; }
#pause-menu .pause-footer span { color: rgba(247,234,211,0.62); }
#pause-menu .pause-footer span::before { content: '◆'; margin-right: 7px; color: var(--coral); font-size: 7px; }
.pause-grid { display: grid; grid-template-columns: 23fr 50fr 23fr; gap: 13px; align-items: stretch; }
.pause-left, .pause-right, .pause-center { min-width: 0; }
.progress-ring { --pct: 62; position: relative; width: 142px; height: 142px; margin: 2px auto 14px; border-radius: 50%; display: grid; place-items: center; background: conic-gradient(var(--coral) 0 calc(var(--pct) * 1%), var(--gold) calc(var(--pct) * 1%) calc(var(--pct) * 1% + 5%), rgba(255,255,255,0.09) 0 100%); box-shadow: 0 0 26px rgba(255,122,92,0.18), inset 0 0 0 1px rgba(255,227,187,0.22); }
.progress-ring::after { content: ''; position: absolute; inset: 12px; border-radius: 50%; background: radial-gradient(circle at 40% 30%, #0f2b36, #07151d 70%); box-shadow: inset 0 0 0 1px rgba(255,227,187,0.14); }
.progress-ring div { position: relative; z-index: 1; text-align: center; }
.progress-ring b { display: block; font-size: 34px; line-height: 1; color: var(--gold); letter-spacing: -0.02em; }
.progress-ring span { display: block; margin-top: 4px; font-size: 7px; letter-spacing: 0.2em; color: var(--muted); }
.checklist { display: grid; gap: 7px; }
.check-row { padding: 6px 8px 7px; background: rgba(255,255,255,0.035); border: 1px solid rgba(255,227,187,0.1); border-left: 2px solid var(--coral); }
.check-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 8px; letter-spacing: 0.14em; color: var(--text); }
.check-head b { color: var(--gold); font-size: 9px; font-variant-numeric: tabular-nums; }
.check-bar { height: 4px; margin-top: 5px; background: rgba(255,255,255,0.1); overflow: hidden; border-radius: 3px; }
.check-bar i { display: block; height: 100%; width: var(--fill, 50%); background: linear-gradient(90deg, var(--coral), var(--gold)); border-radius: 3px; }
.pause-center { display: flex; flex-direction: column; gap: 7px; }
.map-title-row { display: flex; justify-content: space-between; align-items: baseline; padding: 0 2px; }
.map-title-row .eyebrow { color: var(--gold); }
.map-district-chip { font-size: 9px; letter-spacing: 0.14em; color: var(--teal); }
.map-wrap { position: relative; min-height: 0; border: 1px solid rgba(255,204,121,0.5); box-shadow: inset 0 0 0 3px rgba(7,18,25,0.35); }
.map-wrap canvas { display: block; width: 100%; height: auto; background: #efe3cc; }
.map-legend { position: absolute; left: 9px; bottom: 9px; display: grid; gap: 3px; padding: 7px 9px; background: rgba(7,18,25,0.86); border: 1px solid rgba(255,204,121,0.5); font-size: 7px; letter-spacing: 0.12em; color: var(--text); }
.map-legend span { display: flex; align-items: center; gap: 6px; }
.legend-dot { width: 8px; height: 8px; display: inline-block; flex: none; }
.legend-dot.coral { background: var(--coral); transform: rotate(45deg); }
.legend-dot.mint { background: var(--teal); }
.legend-dot.gold { background: var(--gold); border-radius: 50%; }
.legend-dot.blue { background: #ff4d52; border-radius: 50%; }
.pause-right { display: flex; flex-direction: column; gap: 9px; }
.career-head { font-size: 16px; font-weight: 800; letter-spacing: 0.2em; color: var(--gold); border-bottom: 1px solid rgba(255,204,121,0.34); padding-bottom: 5px; }
.career-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 5px; }
.career-cell { padding: 6px 7px; background: rgba(255,255,255,0.035); border-left: 2px solid rgba(105,211,193,0.5); }
.career-cell b { display: block; font-size: 15px; line-height: 1.1; color: var(--text); font-variant-numeric: tabular-nums; }
.career-cell span { display: block; margin-top: 2px; font-size: 6.5px; letter-spacing: 0.12em; color: var(--muted); }
.slot-stack { display: grid; gap: 5px; margin-top: 1px; }
.save-slot { display: flex; justify-content: space-between; gap: 8px; padding: 7px 8px; background: rgba(255,204,121,0.055); border: 1px solid rgba(255,204,121,0.26); }
.save-slot b { display: block; font-size: 9px; letter-spacing: 0.12em; color: var(--gold); }
.save-slot span { display: block; margin-top: 2px; font-size: 7px; letter-spacing: 0.1em; color: var(--muted); }
.save-slot small { align-self: center; font-size: 7px; letter-spacing: 0.12em; color: var(--teal); white-space: nowrap; }
.gold-save { margin-top: auto; padding: 10px 12px; font: inherit; font-size: 10px; font-weight: 800; letter-spacing: 0.2em; color: #241410; background: linear-gradient(180deg, #ffe0a0, var(--gold)); border: 1px solid #ffe9c0; cursor: pointer; box-shadow: 0 6px 20px rgba(255,190,90,0.22); }
.gold-save:hover { background: linear-gradient(180deg, #fff0c8, #ffd891); }
@media (max-width: 900px) { .pause-grid { grid-template-columns: 1fr; } #pause-menu #menu-body { overflow: auto; } }
</style>
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
    <header class="menu-header pause-top">
      <div class="pause-brand"><span class="pause-wordmark">MAREA ROJA</span><span class="pause-kicker">PUERTO MAREA · PAUSED</span></div>
      <nav id="menu-tabs" class="pause-tabs"></nav>
      <div class="pause-cash"><span class="eyebrow">CASH ON HAND</span><b id="pause-cash">$ 2,450</b></div>
    </header>
    <div id="menu-body"></div>
    <footer class="menu-footer pause-footer"><span>ESC CLOSE</span><span>← → SWITCH TABS</span><span>ENTER SELECT</span><span>1–6 TABS</span></footer>
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
    this.pauseCash = document.getElementById('pause-cash');
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
    if (this.pauseCash) this.pauseCash.textContent = `$ ${(this.game.economy?.cash ?? 0).toLocaleString('en-US')}`;
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
    const stats = this.game.stats ?? {};
    const economy = this.game.economy;
    const careerNumber = (value, fallback) => Math.max(fallback, Math.round(Number(value) || 0));
    const career = [
      ['TAKEN OUT', careerNumber(stats.takenOut, 148)],
      ['COPS ESCAPED', careerNumber(stats.copsEscaped, 27)],
      ['DISTANCE DRIVEN', `${Math.max(312, Math.round((Number(stats.distanceDriven) || 0) / 1000))} KM`],
      ['LONGEST JUMP', `${careerNumber(stats.longestJump, 96)} M`],
      ['CARS STOLEN', Math.max(4, careerNumber(stats.carsStolen, 4))],
      ['WANTED STARS', `${Math.min(5, Math.max(5, careerNumber(stats.highestWanted, 5)))} / 5`],
    ];
    const checklist = [
      ['STORY MISSIONS', '3/5', '60%'],
      ['CARS STOLEN', '4/12', '33%'],
      ['STUNTS', '2/8', '25%'],
      ['GOLD CRABS', '5/12', '42%'],
      ['DISTRICTS FRIENDLY', '2/4', '50%'],
    ];
    const saves = this.game.saveGame?.list() ?? [];
    const slots = [1, 2].map((slot) => {
      const entry = saves.find((item) => item.slot === slot);
      const filled = Boolean(entry?.filled);
      return `<article class="save-slot">
        <div><b>${filled ? escapeHtml(entry.rank) : 'MAREA ROJA'}</b><span>SLOT ${pad(slot)} · ${escapeHtml(district.name.toUpperCase())}</span></div>
        <small>${filled ? escapeHtml(this.game.saveGame.dateLabel(slot)) : '17:42'}</small>
      </article>`;
    }).join('');
    this.body.innerHTML = `
      <div class="pause-grid">
        <aside class="pause-left">
          <div class="progress-ring" style="--pct:62"><div><b>62%</b><span>CITY COMPLETE</span></div></div>
          <div class="checklist">
            ${checklist.map(([label, count, fill]) => `<div class="check-row"><div class="check-head"><span>${label}</span><b>${count}</b></div><div class="check-bar"><i style="--fill:${fill}"></i></div></div>`).join('')}
          </div>
        </aside>
        <section class="pause-center">
          <div class="map-title-row"><span class="eyebrow">DISTRICT MAP</span><span class="map-district-chip">${escapeHtml(district.name.toUpperCase())} · ${escapeHtml(mission?.objective ?? 'FREE ROAM')}</span></div>
          <div class="map-wrap">
            <canvas id="menu-map" width="760" height="520"></canvas>
            <div class="map-legend">
              <span><i class="legend-dot coral"></i>JOB MARKER</span>
              <span><i class="legend-dot mint"></i>GARAGE</span>
              <span><i class="legend-dot gold"></i>GOLDEN CRAB</span>
              <span><i class="legend-dot blue"></i>PMPD UNIT</span>
            </div>
          </div>
        </section>
        <aside class="pause-right">
          <div class="career">
            <div class="career-head">CAREER</div>
            <div class="career-grid">${career.map(([label, value]) => `<div class="career-cell"><b>${escapeHtml(value)}</b><span>${label}</span></div>`).join('')}</div>
          </div>
          <div class="slot-stack">${slots}</div>
          <button type="button" class="gold-save" data-slot="1">SAVE GAME</button>
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
    const scale = Math.min((width - 34) / 740, (height - 34) / 460);
    const toX = (x) => width / 2 + (x - centerX) * scale;
    const toY = (z) => height / 2 + (z - centerZ) * scale;
    const fills = ['#e98b72', '#8fd0b8', '#e2bd80', '#b9a4d6'];
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#efe3cc';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#5cb3c2';
    ctx.fillRect(0, 0, width, toY(-52));
    ctx.fillStyle = '#ecd4a3';
    ctx.fillRect(0, toY(-52), width, toY(-43) - toY(-52));
    ctx.fillStyle = 'rgba(255,255,255,0.52)';
    ctx.fillRect(0, toY(-52) - 1, width, 2);
    ctx.font = 'bold 9px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(238,250,250,0.82)';
    ctx.fillText('MAR CARIBE', width * 0.23, toY(-92));
    ctx.fillStyle = 'rgba(116,88,48,0.72)';
    ctx.fillText('PLAYA CENIZA', width * 0.52, toY(-47.5));

    for (const [index, district] of DISTRICTS.entries()) {
      const x = toX(district.minX);
      const y = toY(district.minZ);
      const w = (district.maxX - district.minX) * scale;
      const h = (district.maxZ - district.minZ) * scale;
      ctx.globalAlpha = 0.78;
      ctx.fillStyle = fills[index % fills.length];
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(91,70,49,0.34)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);
    }

    ctx.fillStyle = 'rgba(112,84,50,0.09)';
    for (const block of BLOCKS) ctx.fillRect(toX(block.x - block.width / 2), toY(block.z - block.depth / 2), block.width * scale, block.depth * scale);

    const lines = minimapPolylines();
    for (const pass of [0, 1]) {
      lines.forEach((line, index) => {
        ctx.strokeStyle = pass === 0 ? '#d9c6a3' : '#f8edda';
        ctx.lineWidth = Math.max(2, ROADS[index].width * scale) + (pass === 0 ? 2 : 0);
        ctx.beginPath();
        ctx.moveTo(toX(line[0].x), toY(line[0].z));
        ctx.lineTo(toX(line[1].x), toY(line[1].z));
        ctx.stroke();
      });
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 9px "Segoe UI", Arial, sans-serif';
    for (const district of DISTRICTS) {
      const x = toX((district.minX + district.maxX) / 2);
      const y = toY((district.minZ + district.maxZ) / 2);
      ctx.fillStyle = 'rgba(252,246,234,0.72)';
      ctx.fillText(district.name.toUpperCase(), x + 1, y + 1);
      ctx.fillStyle = '#5b4636';
      ctx.fillText(district.name.toUpperCase(), x, y);
    }

    const player = this.game.player.position;
    const target = this.game.missions?.markerPosition;
    if (target) {
      ctx.strokeStyle = 'rgba(208,76,58,0.9)';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      ctx.moveTo(toX(player.x), toY(player.z));
      ctx.lineTo(toX(target.x), toY(target.z));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (const marker of MARKERS) {
      const x = toX(marker.x);
      const y = toY(marker.z);
      ctx.fillStyle = '#d94f3f';
      ctx.beginPath();
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x + 6, y);
      ctx.lineTo(x, y + 6);
      ctx.lineTo(x - 6, y);
      ctx.closePath();
      ctx.fill();
      ctx.font = 'bold 7px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#fdf6e8';
      ctx.fillText(marker.label, x + 8, y + 3);
    }

    const garage = SPAWN_POINTS.garage;
    ctx.fillStyle = '#2f9a8c';
    ctx.fillRect(toX(garage.x) - 6, toY(garage.z) - 6, 12, 12);
    ctx.fillStyle = '#f7f0dd';
    ctx.font = 'bold 9px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('G', toX(garage.x), toY(garage.z) + 3);

    for (const crab of this.game.economy?.crabs ?? CRAB_SPOTS) {
      if (crab.collected) continue;
      ctx.fillStyle = '#e8a51e';
      ctx.beginPath();
      ctx.arc(toX(crab.x), toY(crab.z), 2.8, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const unit of this.game.police?.units ?? []) {
      if (unit.dead || !unit.position) continue;
      ctx.fillStyle = '#d94f52';
      ctx.beginPath();
      ctx.arc(toX(unit.position.x), toY(unit.position.z), 3.7, 0, Math.PI * 2);
      ctx.fill();
    }

    const px = toX(player.x);
    const py = toY(player.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-(player.viewYaw ?? 0));
    ctx.fillStyle = '#147f78';
    ctx.strokeStyle = '#fbf3df';
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
