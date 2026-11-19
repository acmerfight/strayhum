/* Where to go next, and what to remember: the stations heard tonight, the ones kept,
   and the signals that faded. Kept in localStorage; nothing leaves the browser. */
const NIGHT_HOURS = 12;
const FADE_DAYS = 3;

class Encounters {
  constructor(stations) {
    this.stations = stations;
    this.byId = new Map(stations.map((s, i) => [s.id, i]));
    this.vectors = stations.map((s) => unitVector(s.lat, s.lon));
    const saved = readJson('strayhum.memory');
    const now = Date.now();
    this.kept = (saved.kept || []).filter((k) => this.byId.has(k.id));
    this.faded = Object.fromEntries(Object.entries(saved.faded || {}).filter(([, at]) => now - at < FADE_DAYS * 864e5));
    this.heard = (saved.heard || []).filter((id) => this.byId.has(id)).slice(-160);
    this.night = (saved.night || []).filter((n) => this.byId.has(n.id) && now - n.at < NIGHT_HOURS * 36e5);
  }

  save() {
    localStorage.setItem('strayhum.memory', JSON.stringify({ kept: this.kept, faded: this.faded, heard: this.heard, night: this.night }));
  }

  /** The station a link asks for, or a first encounter somewhere it is evening or night. */
  first(id) {
    if (this.byId.has(id)) return this.byId.get(id);
    return this.pick(null, (s) => (isNightAt(s) ? 1.8 : 1));
  }

  /** Somewhere else: far enough to feel like travel, a different country and sound if possible. */
  next(from) {
    return this.pick(from, () => 1);
  }

  pick(from, bias) {
    const recentIds = new Set(this.heard.slice(-120));
    const recentCountries = this.night.slice(-3).map((n) => this.stations[this.byId.get(n.id)].country);
    const origin = from === null ? null : this.stations[from];
    const weights = this.stations.map((s, i) => {
      if (i === from || this.faded[s.id] || recentIds.has(s.id)) return 0;
      let w = (s.tier === 1 ? 2.4 : 1) * bias(s);
      if (origin) {
        const angle = Math.acos(clamp(dot(this.vectors[from], this.vectors[i]), -1, 1)) / DEG;
        w *= 0.15 + smoothstep(6, 45, angle) - 0.35 * smoothstep(140, 180, angle);
        if (s.genres[0] === origin.genres[0]) w *= 0.45;
      }
      if (recentCountries.includes(s.country)) w *= 0.2;
      return w;
    });
    const total = weights.reduce((a, b) => a + b, 0);
    if (!total) {
      // Everything has been heard: start the circle again.
      this.heard = [];
      return this.pick(from, bias);
    }
    let r = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return weights.length - 1;
  }

  arrive(i) {
    const id = this.stations[i].id;
    this.heard = [...this.heard.filter((h) => h !== id), id];
    if (this.night.at(-1)?.id !== id) this.night.push({ id, at: Date.now() });
    delete this.faded[id];
    this.save();
  }

  fade(i) {
    this.faded[this.stations[i].id] = Date.now();
    this.save();
  }

  isKept(i) {
    return this.kept.some((k) => k.id === this.stations[i].id);
  }

  toggleKeep(i) {
    const id = this.stations[i].id;
    if (this.isKept(i)) this.kept = this.kept.filter((k) => k.id !== id);
    else this.kept.unshift({ id, at: Date.now() });
    this.save();
    return this.isKept(i);
  }

  keptIndices() {
    return this.kept.map((k) => ({ i: this.byId.get(k.id), at: k.at }));
  }

  /** Tonight's route, oldest first. */
  path() {
    return this.night.map((n) => ({ i: this.byId.get(n.id), at: n.at }));
  }

  heardSet() {
    return new Set(this.night.map((n) => this.byId.get(n.id)));
  }
}

const hourFormats = new Map();

/** Hour of the day at the station, from its time zone. */
function localHour(station, date = new Date()) {
  if (!hourFormats.has(station.zone)) {
    hourFormats.set(station.zone, new Intl.DateTimeFormat('en-GB', { timeZone: station.zone, hour: 'numeric', hourCycle: 'h23' }));
  }
  return Number(hourFormats.get(station.zone).format(date));
}

function isNightAt(station) {
  const h = localHour(station);
  return h >= 20 || h < 5;
}

function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || {};
  } catch {
    return {};
  }
}
