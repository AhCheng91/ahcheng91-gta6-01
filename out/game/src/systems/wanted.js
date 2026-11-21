// Wanted level: crime reporting, escalation, decay, and dispatch requests for PMPD response.

const CRIMES = {
  theft_noticed: { heat: 0.55, label: 'VEHICLE THEFT REPORTED' },
  gunfire: { heat: 0.8, label: 'SHOTS FIRED IN PUBLIC' },
  gunfire_near_police: { heat: 1.1, label: 'OFFICER UNDER FIRE' },
  pedestrian_kill: { heat: 1.35, label: 'CIVILIAN DOWN' },
  ram_cruiser: { heat: 0.95, label: 'POLICE VEHICLE RAMMED' },
  officer_kill: { heat: 2.2, label: 'OFFICER DOWN' },
  explosion: { heat: 1.7, label: 'EXPLOSION REPORTED' },
};

export class WantedSystem {
  constructor(options = {}) {
    this.stars = 0;
    this.heat = 0;
    this.lastCrime = '';
    this.lastCrimeAt = -99;
    this.hiddenTimer = 0;
    this.seenRecently = 0;
    this.decayDelay = 14;
    this.onChange = options.onChange ?? (() => {});
    this.onDispatch = options.onDispatch ?? (() => {});
  }

  reportCrime(kind, pos = null) {
    const crime = CRIMES[kind] ?? { heat: 0.5, label: String(kind).toUpperCase() };
    const damp = this.stars === 0 ? 0.95 : this.stars < 2 ? 0.75 : 0.55;
    this.heat = Math.min(5.95, this.heat + crime.heat * damp);
    this.lastCrime = crime.label;
    this.lastCrimeAt = this.time ?? 0;
    this.hiddenTimer = 0;
    const next = Math.max(this.stars, Math.min(5, Math.floor(this.heat)));
    if (next !== this.stars) {
      this.stars = next;
      this.onDispatch(this.stars, pos);
    }
    this.onChange(this.snapshot());
  }

  update(dt, context = {}) {
    this.time = (this.time ?? 0) + dt;
    const seen = Boolean(context.seenByPolice);
    const hidden = Boolean(context.hidden);
    this.seenRecently = Math.max(0, this.seenRecently - dt + (seen ? dt * 2.5 : 0));
    if (seen) {
      this.hiddenTimer = 0;
    } else {
      this.hiddenTimer += dt;
    }
    const canDecay = this.stars > 0 && this.hiddenTimer > this.decayDelay + this.stars * 2.5;
    if (canDecay) {
      const rate = hidden ? 0.22 : 0.11;
      this.heat = Math.max(0, this.heat - rate * dt);
      const next = Math.min(this.stars, Math.floor(this.heat + 0.001));
      if (next !== this.stars) {
        this.stars = next;
        if (this.stars === 0) this.lastCrime = '';
        this.onChange(this.snapshot());
        if (this.stars > 0) this.onDispatch(this.stars, context.playerPos ?? null);
      }
    }
    if (this.stars > 0 && this.heat < this.stars) this.heat = this.stars;
  }

  setStars(n, pos = null) {
    const next = Math.max(0, Math.min(5, Math.round(n)));
    this.stars = next;
    this.heat = next;
    this.hiddenTimer = 0;
    if (next === 0) this.lastCrime = '';
    this.onChange(this.snapshot());
    this.onDispatch(this.stars, pos);
  }

  snapshot() {
    return {
      stars: this.stars,
      heat: this.heat,
      lastCrime: this.lastCrime,
      lastCrimeAt: this.lastCrimeAt,
    };
  }
}
