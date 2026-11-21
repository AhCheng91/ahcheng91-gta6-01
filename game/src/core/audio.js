// WebAudio synthesis: engine, sirens, impacts, weapons, footsteps and sequenced radio beds.

export const RADIO_STATIONS = [
  {
    id: 'marea', name: 'RADIO MAREA 92.7', track: 'SON CARIBE', bpm: 104, root: 45,
    kind: 'latin', bass: [0, 0, 5, 0, 7, 5, 3, 0],
  },
  {
    id: 'lagoon', name: 'LAGOON FM 98.1', track: 'SYNTHWAVE', bpm: 96, root: 41,
    kind: 'synth', bass: [0, 0, 7, 7, 5, 5, 3, 10],
  },
  {
    id: 'underground', name: 'PUERTO UNDERGROUND 101.3', track: 'REGGAETON', bpm: 98, root: 43,
    kind: 'urban', bass: [0, 5, 0, 3, 7, 3, 0, 5],
  },
  { id: 'scanner', name: 'PMPD SCANNER', track: 'DISPATCH 10-42', bpm: 0, root: 45, kind: 'scanner', bass: [] },
];

const GUNSHOTS = {
  fists: { noise: 0.1, duration: 0.07, filter: 900, tone: 110, gain: 0.06 },
  pistol: { noise: 0.34, duration: 0.14, filter: 1900, tone: 180, gain: 0.16 },
  smg: { noise: 0.28, duration: 0.09, filter: 2500, tone: 210, gain: 0.13 },
  shotgun: { noise: 0.5, duration: 0.28, filter: 1300, tone: 130, gain: 0.22 },
  rifle: { noise: 0.42, duration: 0.17, filter: 2300, tone: 190, gain: 0.18 },
  grenade: { noise: 0.6, duration: 0.4, filter: 800, tone: 90, gain: 0.2 },
};

function midiToFrequency(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

function makeNoiseBuffer(context, seconds) {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.unavailable = false;
    this.muted = false;
    this.masterVolume = 0.72;
    this.stationIndex = 0;
    this.radioClock = 0;
    this.radioStep = 0;
    this.sirenOn = false;
    this.engineActive = false;
    this.footstepCooldown = 0;

    // Every AudioContext must be created inside a user gesture; the first key press is ours.
    window.addEventListener('keydown', () => this.start(), { passive: true });
  }

  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    if (this.unavailable) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      this.unavailable = true;
      return;
    }
    try {
      const context = new AudioContextClass();
      this.ctx = context;
      this.master = context.createGain();
      this.master.gain.value = this.muted ? 0 : this.masterVolume;
      this.master.connect(context.destination);
      this.sfxBus = context.createGain();
      this.sfxBus.gain.value = 0.9;
      this.sfxBus.connect(this.master);
      this.musicBus = context.createGain();
      this.musicBus.gain.value = 0.5;
      this.musicBus.connect(this.master);
      this.noiseBuffer = makeNoiseBuffer(context, 2);
      this.buildEngineVoice();
      this.buildSirenVoice();
      this.ready = true;
      if (context.state === 'suspended') context.resume().catch(() => {});
    } catch {
      this.ctx = null;
      this.ready = false;
      this.unavailable = true;
    }
  }

  buildEngineVoice() {
    const context = this.ctx;
    this.engineFilter = context.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 500;
    this.engineGain = context.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc = context.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineHarmonic = context.createOscillator();
    this.engineHarmonic.type = 'square';
    this.engineHarmonic.frequency.value = 83;
    this.engineOsc.connect(this.engineFilter);
    this.engineHarmonic.connect(this.engineFilter);
    this.engineOsc.start();
    this.engineHarmonic.start();
  }

  buildSirenVoice() {
    const context = this.ctx;
    this.sirenGain = context.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenGain.connect(this.master);
    this.sirenOsc = context.createOscillator();
    this.sirenOsc.type = 'sawtooth';
    this.sirenOsc.frequency.value = 640;
    this.sirenFilter = context.createBiquadFilter();
    this.sirenFilter.type = 'bandpass';
    this.sirenFilter.frequency.value = 850;
    this.sirenFilter.Q.value = 1.4;
    this.sirenOsc.connect(this.sirenFilter);
    this.sirenFilter.connect(this.sirenGain);
    this.sirenLfo = context.createOscillator();
    this.sirenLfo.frequency.value = 0.62;
    this.sirenLfoDepth = context.createGain();
    this.sirenLfoDepth.gain.value = 210;
    this.sirenLfo.connect(this.sirenLfoDepth);
    this.sirenLfoDepth.connect(this.sirenOsc.frequency);
    this.sirenOsc.start();
    this.sirenLfo.start();
  }

  get usable() {
    return this.ready && this.ctx && this.ctx.state !== 'closed';
  }

  tone(frequency, duration, type, gain, when = 0, destination = null, endFrequency = null) {
    if (!this.usable) return;
    const context = this.ctx;
    const start = when || context.currentTime;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.linearRampToValueAtTime(gain, start + Math.min(0.02, duration * 0.2));
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope);
    envelope.connect(destination ?? this.sfxBus);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  noise(duration, filterType, frequency, gain, when = 0, destination = null, q = 0.7) {
    if (!this.usable) return;
    const context = this.ctx;
    const start = when || context.currentTime;
    const source = context.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.linearRampToValueAtTime(gain, start + Math.min(0.012, duration * 0.3));
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(destination ?? this.sfxBus);
    source.start(start, Math.random() * 1.2);
    source.stop(start + duration + 0.02);
  }

  setEngine(rpm, active = true) {
    this.engineActive = active;
    if (!this.usable) return;
    const time = this.ctx.currentTime;
    const speed = Math.max(0, Math.min(1, rpm));
    this.engineOsc.frequency.setTargetAtTime(48 + speed * 165, time, 0.06);
    this.engineHarmonic.frequency.setTargetAtTime(73 + speed * 248, time, 0.06);
    this.engineFilter.frequency.setTargetAtTime(300 + speed * 1800, time, 0.08);
    this.engineGain.gain.setTargetAtTime(active ? 0.02 + speed * 0.085 : 0, time, 0.12);
  }

  setSiren(on) {
    this.sirenOn = Boolean(on);
    if (!this.usable) return;
    this.sirenGain.gain.setTargetAtTime(this.sirenOn ? 0.045 : 0, this.ctx.currentTime, 0.3);
  }

  horn() {
    if (!this.usable) return;
    const now = this.ctx.currentTime;
    this.tone(345, 0.42, 'square', 0.055, now);
    this.tone(428, 0.42, 'sawtooth', 0.035, now);
  }

  screech(intensity = 1) {
    this.noise(0.55, 'bandpass', 2300, Math.min(0.16, 0.07 * intensity), 0, this.sfxBus, 2.4);
  }

  crash(strength = 1) {
    const now = this.usable ? this.ctx.currentTime : 0;
    this.noise(0.36, 'lowpass', 520, Math.min(0.28, 0.13 * strength), now);
    this.tone(96, 0.42, 'sine', Math.min(0.24, 0.12 * strength), now, this.sfxBus, 34);
  }

  gunshot(weaponId = 'pistol') {
    const shot = GUNSHOTS[weaponId] ?? GUNSHOTS.pistol;
    if (weaponId === 'grenade') {
      this.explosion();
      return;
    }
    const now = this.usable ? this.ctx.currentTime : 0;
    this.noise(shot.duration, 'highpass', shot.filter, shot.gain, now);
    this.tone(shot.tone, shot.duration * 0.75, 'triangle', shot.gain * 0.55, now, this.sfxBus, 55);
    if (weaponId === 'shotgun' || weaponId === 'rifle') this.noise(0.5, 'lowpass', 700, 0.07, now + 0.02);
  }

  explosion() {
    const now = this.usable ? this.ctx.currentTime : 0;
    this.noise(1.25, 'lowpass', 900, 0.32, now);
    this.noise(0.32, 'highpass', 1500, 0.14, now);
    this.tone(112, 0.9, 'sine', 0.26, now, this.sfxBus, 28);
  }

  scream() {
    const now = this.usable ? this.ctx.currentTime : 0;
    this.tone(690, 0.34, 'triangle', 0.045, now, this.sfxBus, 1180);
    this.noise(0.24, 'bandpass', 1500, 0.022, now, this.sfxBus, 3);
  }

  footstep() {
    if (!this.usable || this.footstepCooldown > 0) return;
    this.footstepCooldown = 0.18;
    this.noise(0.075, 'lowpass', 520 + Math.random() * 350, 0.045);
  }

  uiClick() {
    this.tone(880, 0.07, 'sine', 0.045);
  }

  missionPassed() {
    if (!this.usable) return;
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((note, index) => {
      this.tone(note, 0.55 - index * 0.05, 'triangle', 0.085, now + index * 0.11);
      this.tone(note / 2, 0.6, 'sine', 0.04, now + index * 0.11);
    });
  }

  get station() {
    return RADIO_STATIONS[this.stationIndex];
  }

  cycleStation() {
    this.stationIndex = (this.stationIndex + 1) % RADIO_STATIONS.length;
    this.radioStep = 0;
    this.radioClock = 0;
    this.uiClick();
    return this.station;
  }

  setStation(id) {
    const index = RADIO_STATIONS.findIndex((station) => station.id === id);
    if (index >= 0) {
      this.stationIndex = index;
      this.radioStep = 0;
    }
    return this.station;
  }

  scheduleRadioStep(time, step) {
    const station = this.station;
    if (station.kind === 'scanner') {
      if (step % 16 === 0) {
        this.noise(0.35, 'bandpass', 1100, 0.035, time, this.musicBus, 4);
        this.tone(940, 0.1, 'square', 0.02, time + 0.3, this.musicBus);
        this.tone(720, 0.1, 'square', 0.02, time + 0.46, this.musicBus);
      }
      return;
    }
    const bassPattern = station.bass;
    if (step % 2 === 0) {
      const note = station.root - 12 + bassPattern[(step / 2) % bassPattern.length];
      this.tone(midiToFrequency(note), 0.26, station.kind === 'synth' ? 'sawtooth' : 'triangle', 0.075, time, this.musicBus);
    }
    if (station.kind !== 'latin' && step % 4 === 2) {
      this.tone(midiToFrequency(station.root + 24 + bassPattern[(step / 2) % bassPattern.length]), 0.12,
        'square', 0.018, time, this.musicBus);
    }
    if (step % 4 === 1) this.noise(0.06, 'highpass', 6500, 0.016, time, this.musicBus);
    if (step % 8 === 0) {
      const chord = station.kind === 'synth' ? [0, 3, 7, 10] : [0, 4, 7];
      for (const interval of chord) {
        this.tone(midiToFrequency(station.root + 12 + interval), 1.45, 'sine', 0.018, time, this.musicBus);
      }
    }
    if (station.kind === 'urban' && step % 4 === 0) {
      this.tone(90, 0.22, 'sine', 0.1, time, this.musicBus, 42);
    }
  }

  update(dt, state = {}) {
    this.footstepCooldown = Math.max(0, this.footstepCooldown - dt);
    if (!this.usable) return;
    this.setEngine(state.rpm ?? 0, Boolean(state.driving));
    this.setSiren(Boolean(state.siren));
    const station = this.station;
    if (!station.bpm) return;
    const stepDuration = 30 / station.bpm;
    this.radioClock += dt;
    let scheduled = 0;
    while (this.radioClock >= stepDuration && scheduled < 4) {
      this.radioClock -= stepDuration;
      this.scheduleRadioStep(this.ctx.currentTime + 0.03, this.radioStep);
      this.radioStep = (this.radioStep + 1) % 64;
      scheduled += 1;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.usable) this.master.gain.setTargetAtTime(this.muted ? 0 : this.masterVolume, this.ctx.currentTime, 0.05);
    return this.muted;
  }
}
