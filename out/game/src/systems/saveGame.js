const STORAGE_KEY = 'marea-roja-save-slots';
const SAVE_VERSION = 1;
const SLOT_COUNT = 3;

function emptySlots() {
  const slots = {};
  for (let slot = 1; slot <= SLOT_COUNT; slot += 1) slots[slot] = null;
  return slots;
}

function blankEntry() {
  return { version: SAVE_VERSION, savedAt: null, cash: 0, rank: 'DOCK HAND', xp: 0, data: null };
}

export class SaveGame {
  constructor(options = {}) {
    this.key = options.key ?? STORAGE_KEY;
    this.memory = null;
    this.slots = this.read();
  }

  read() {
    const slots = emptySlots();
    let raw = null;
    try {
      raw = window.localStorage?.getItem(this.key) ?? null;
    } catch {
      raw = this.memory;
    }
    if (!raw) return slots;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== SAVE_VERSION || typeof parsed.slots !== 'object' || !parsed.slots) return slots;
      for (let slot = 1; slot <= SLOT_COUNT; slot += 1) {
        const entry = parsed.slots[slot];
        if (!entry || typeof entry !== 'object' || entry.version !== SAVE_VERSION) continue;
        slots[slot] = {
          version: SAVE_VERSION,
          savedAt: typeof entry.savedAt === 'string' ? entry.savedAt : null,
          cash: Number(entry.cash) || 0,
          rank: typeof entry.rank === 'string' ? entry.rank : 'DOCK HAND',
          xp: Number(entry.xp) || 0,
          data: entry.data && typeof entry.data === 'object' ? entry.data : null,
        };
      }
    } catch {
      return emptySlots();
    }
    return slots;
  }

  persist() {
    const payload = JSON.stringify({ version: SAVE_VERSION, slots: this.slots });
    this.memory = payload;
    try {
      window.localStorage?.setItem(this.key, payload);
    } catch {
      // The in-memory copy keeps the session functional when storage is blocked.
    }
  }

  save(slot, data = {}) {
    const index = Math.max(1, Math.min(SLOT_COUNT, Math.round(Number(slot) || 1)));
    const entry = {
      version: SAVE_VERSION,
      savedAt: new Date().toISOString(),
      cash: Number(data.cash) || 0,
      rank: typeof data.rank === 'string' ? data.rank : 'DOCK HAND',
      xp: Number(data.xp) || 0,
      data,
    };
    this.slots[index] = entry;
    this.persist();
    return entry;
  }

  autosave(data = {}) {
    return this.save(1, data);
  }

  load(slot) {
    const index = Math.max(1, Math.min(SLOT_COUNT, Math.round(Number(slot) || 1)));
    const entry = this.slots[index];
    if (!entry?.data) return null;
    try {
      return JSON.parse(JSON.stringify(entry.data));
    } catch {
      return null;
    }
  }

  remove(slot) {
    const index = Math.max(1, Math.min(SLOT_COUNT, Math.round(Number(slot) || 1)));
    this.slots[index] = null;
    this.persist();
  }

  entry(slot) {
    return this.slots[slot] ?? null;
  }

  list() {
    return Array.from({ length: SLOT_COUNT }, (_, index) => {
      const slot = index + 1;
      const entry = this.slots[slot];
      return {
        slot,
        ...blankEntry(),
        filled: Boolean(entry?.data),
        savedAt: entry?.savedAt ?? null,
        cash: entry?.cash ?? 0,
        rank: entry?.rank ?? 'DOCK HAND',
        xp: entry?.xp ?? 0,
      };
    });
  }

  hasAny() {
    return this.list().some((slot) => slot.filled);
  }

  latest() {
    const filled = this.list().filter((slot) => slot.filled);
    if (!filled.length) return null;
    filled.sort((a, b) => String(b.savedAt ?? '').localeCompare(String(a.savedAt ?? '')));
    return filled[0];
  }

  dateLabel(slot) {
    const entry = this.slots[slot];
    if (!entry?.savedAt) return 'EMPTY';
    const date = new Date(entry.savedAt);
    if (Number.isNaN(date.getTime())) return 'UNKNOWN DATE';
    return date.toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
}
