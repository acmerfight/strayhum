/* The receiver. One station plays at a time; between stations there is static, and the sound
   that arrives is measured so the sea can answer it. Streams that allow cross-origin reading
   go through an analyser; the others play directly and the sea breathes on its own. */
const SCORES = {
  // Ring speed in radians per second, how long a ring waits before the next, and how the glow follows.
  electronic: { speed: 0.62, spacing: 0.2, rise: 0.25, release: 0.3 },
  jazz: { speed: 0.42, spacing: 0.24, rise: 0.5, release: 0.8 },
  classical: { speed: 0.26, spacing: 0.5, rise: 1.1, release: 1.6 },
  plain: { speed: 0.45, spacing: 0.26, rise: 0.6, release: 0.5 },
};

/** The movement vocabulary a station's genres suggest. */
function scoreFor(station) {
  const g = station.genres.join(' ');
  if (/Classical|Opera|Early music|Ambient/.test(g)) return SCORES.classical;
  if (/Jazz|Soul|Blues|Bossa|Folk|Tango|Fado/.test(g)) return SCORES.jazz;
  if (/Techno|House|Electronic|Drum|Disco|Afrobeat|Amapiano/.test(g)) return SCORES.electronic;
  return SCORES.plain;
}

// A very short silent WAV: playing it during the first tap lets later playback start without one.
const SILENCE = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAAAA';

class Receiver {
  constructor() {
    this.volume = clamp(Number(localStorage.getItem('strayhum.volume') ?? 0.8), 0, 1);
    this.staticOn = localStorage.getItem('strayhum.static') !== 'off';
    this.token = 0;
    this.bins = new Uint8Array(512);
    this.previous = new Uint8Array(512);
    this.wave = new Float32Array(1024);
    this.resetEnvelope();
  }

  /** Must run inside a user gesture: opens audio output and unlocks both players. */
  start() {
    if (this.context) {
      this.context.resume();
      return;
    }
    const Context = window.AudioContext || window.webkitAudioContext;
    this.context = new Context();
    this.master = this.context.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.context.destination);

    this.tapped = new Audio();
    this.tapped.crossOrigin = 'anonymous';
    this.plain = new Audio();
    for (const el of [this.tapped, this.plain]) {
      el.preload = 'none';
      el.src = SILENCE;
      el.play().catch(() => {});
    }
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.2;
    this.streamGain = this.context.createGain();
    this.streamGain.gain.value = 0;
    this.context.createMediaElementSource(this.tapped).connect(this.analyser);
    this.analyser.connect(this.streamGain);
    this.streamGain.connect(this.master);
    this.static = new Static(this.context, this.master);
  }

  /** Begins tuning to a station. The sound stays under the static until arrive() is called. */
  tune(station, { onAir, onFade }) {
    const token = ++this.token;
    this.silence(0.25);
    if (this.staticOn) this.static.up();
    this.arrived = false;
    this.analysed = false;
    this.score = scoreFor(station);
    this.resetEnvelope();
    const attempt = (direct) => {
      const el = direct ? this.plain : this.tapped;
      this.element = el;
      el.src = station.url;
      el.volume = direct ? 0 : 1;
      let timer = 0;
      const fail = () => {
        if (token !== this.token || this.element !== el) return;
        clearTimeout(timer);
        el.removeAttribute('src');
        el.load();
        // A server can stop allowing analysis after the directory was built: play it directly once.
        if (!direct && station.cors) return attempt(true);
        this.static.down(1.2);
        onFade();
      };
      const watch = (ms) => {
        clearTimeout(timer);
        timer = setTimeout(fail, ms);
      };
      el.onplaying = () => {
        if (token !== this.token || this.element !== el) return;
        clearTimeout(timer);
        this.analysed = !direct;
        onAir();
      };
      el.onwaiting = () => token === this.token && watch(12000);
      el.onerror = el.onended = fail;
      watch(9000);
      el.play().catch(fail);
    };
    attempt(!station.cors);
    return token;
  }

  /** Lets the station through: the static recedes as the stream comes up. */
  arrive() {
    if (this.arrived) return;
    this.arrived = true;
    const now = this.context.currentTime;
    this.static.down(1.1);
    if (this.element === this.tapped) {
      this.streamGain.gain.cancelScheduledValues(now);
      this.streamGain.gain.setTargetAtTime(1, now, 0.25);
    } else {
      fadeElement(this.plain, this.volume, 700);
    }
  }

  /** Fades the stream out and stops it. */
  silence(seconds = 0.4) {
    const el = this.element;
    if (!el) return;
    this.element = null;
    if (el === this.tapped) {
      const now = this.context.currentTime;
      this.streamGain.gain.cancelScheduledValues(now);
      this.streamGain.gain.setTargetAtTime(0, now, seconds / 3);
    } else {
      fadeElement(el, 0, seconds * 1000);
    }
    const old = el.src;
    setTimeout(() => {
      if (el.src === old && this.element !== el) {
        el.pause();
        el.removeAttribute('src');
        el.load();
      }
    }, seconds * 1000 + 60);
  }

  /** The dial is turning: the station slides away under the static. */
  wander() {
    this.token++;
    this.silence(0.5);
    this.resetEnvelope();
    if (this.staticOn) this.static.up();
  }

  pass(speed) {
    if (!this.staticOn) return;
    this.static.sweep(speed);
    this.static.blip();
  }

  stop() {
    this.token++;
    this.static?.down(0.3);
    this.silence(0.35);
    this.resetEnvelope();
  }

  setVolume(volume) {
    this.volume = volume;
    localStorage.setItem('strayhum.volume', String(volume));
    if (this.master) this.master.gain.setTargetAtTime(volume, this.context.currentTime, 0.03);
    if (this.element === this.plain && this.arrived) this.plain.volume = volume;
  }

  setStatic(on) {
    this.staticOn = on;
    localStorage.setItem('strayhum.static', on ? 'on' : 'off');
    if (!on) this.static?.down(0.2);
  }

  resetEnvelope() {
    this.level = 0;
    this.sustain = 0;
    this.fluxFloor = 0;
    this.lowFloor = 0;
    this.refractory = 0;
    this.sampled = false;
    this.breath = 0;
    this.previous.fill(0);
  }

  /** Measures the last moment of sound. A hit is a fresh attack: a kick, a chord, a voice. */
  sample(seconds) {
    const dt = clamp(seconds, 0.012, 0.15);
    if (!this.arrived) return { level: 0, sustain: 0, hit: 0 };
    const score = this.score;
    if (!this.analysed) {
      // Without access to the samples, the station breathes at a slow, even pace.
      this.breath += dt;
      const hit = this.breath > 2.6 ? ((this.breath = 0), 0.35) : 0;
      this.level += (0.25 - this.level) * dt;
      this.sustain += (0.3 - this.sustain) * dt * 0.5;
      return { level: this.level, sustain: this.sustain, hit, score };
    }
    this.analyser.getByteFrequencyData(this.bins);
    this.analyser.getFloatTimeDomainData(this.wave);
    let power = 0;
    for (const v of this.wave) power += v * v;
    const rms = Math.sqrt(power / this.wave.length);
    const level = clamp((rms - 0.002) * 4.8, 0, 1);
    this.level += (level - this.level) * (1 - Math.exp(-dt / (level > this.level ? 0.045 : 0.17)));

    // Positive spectral change marks attacks independently of how loud the music is held.
    const end = 160;
    let flux = 0;
    for (let i = 1; i < end; i++) flux += Math.max(0, this.bins[i] - this.previous[i]);
    flux /= 255 * (end - 1);
    const hz = this.context.sampleRate / this.analyser.fftSize;
    const lowEnd = Math.max(2, Math.ceil(185 / hz));
    let lowFlux = 0;
    for (let i = 1; i < lowEnd; i++) lowFlux += Math.max(0, this.bins[i] - this.previous[i]);
    lowFlux /= 255 * (lowEnd - 1);
    const onset = this.sampled && level > 0.018 ? clamp((flux - this.fluxFloor * 1.5 - 0.007) * 14, 0, 1) : 0;
    const bass = this.sampled && rms > 0.004 ? Math.max(0, (lowFlux - this.lowFloor * 1.55 - 0.012) * 5.6) : 0;
    const accent = Math.min(1, Math.max(onset, bass));
    this.fluxFloor += (flux - this.fluxFloor) * (1 - Math.exp(-dt / 0.55));
    this.lowFloor += (lowFlux - this.lowFloor) * (1 - Math.exp(-dt / 0.65));
    this.refractory = Math.max(0, this.refractory - dt);
    let hit = 0;
    if (accent > 0.12 && this.refractory === 0) {
      hit = 0.3 + 0.7 * accent;
      this.refractory = score.spacing;
    }
    this.sustain += (this.level - this.sustain) * (1 - Math.exp(-dt / (this.level > this.sustain ? score.rise : score.release)));
    this.previous.set(this.bins);
    this.sampled = true;
    return { level: this.level, sustain: this.sustain, hit, score };
  }
}

/** Radio static: band-limited noise whose centre wanders like a dial being turned, with a faint whistle. */
class Static {
  constructor(context, out) {
    this.context = context;
    const length = context.sampleRate * 2;
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      // Sparse clicks over the hiss, as on a real band.
      data[i] = (Math.random() * 2 - 1) * 0.6 + (Math.random() < 0.0004 ? (Math.random() * 2 - 1) * 2.4 : 0);
    }
    const noise = context.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    this.band = context.createBiquadFilter();
    this.band.type = 'bandpass';
    this.band.frequency.value = 1500;
    this.band.Q.value = 0.55;
    const wander = context.createOscillator();
    wander.frequency.value = 0.23;
    const wanderDepth = context.createGain();
    wanderDepth.gain.value = 650;
    wander.connect(wanderDepth).connect(this.band.frequency);
    this.whistle = context.createOscillator();
    this.whistle.frequency.value = 1200;
    const whistleLevel = context.createGain();
    whistleLevel.gain.value = 0.018;
    this.gain = context.createGain();
    this.gain.gain.value = 0;
    noise.connect(this.band).connect(this.gain);
    this.whistle.connect(whistleLevel).connect(this.gain);
    this.gain.connect(out);
    this.out = out;
    noise.start();
    wander.start();
    this.whistle.start();
  }

  up() {
    const now = this.context.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setTargetAtTime(0.055, now, 0.08);
    // The heterodyne whistle glides as if passing other carriers on the way.
    const f = this.whistle.frequency;
    f.cancelScheduledValues(now);
    f.setValueAtTime(400 + Math.random() * 600, now);
    f.exponentialRampToValueAtTime(1800 + Math.random() * 1800, now + 1.6);
    f.exponentialRampToValueAtTime(700 + Math.random() * 500, now + 3.2);
  }

  down(seconds) {
    const now = this.context.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setTargetAtTime(0, now, seconds / 3);
  }

  /** While the dial turns: the whistle rises with speed. */
  sweep(speed) {
    const now = this.context.currentTime;
    this.whistle.frequency.cancelScheduledValues(now);
    this.whistle.frequency.setTargetAtTime(500 + 2300 * speed + Math.random() * 120, now, 0.08);
    this.band.Q.setTargetAtTime(0.55 + 1.6 * speed, now, 0.1);
  }

  /** Passing a station on the dial: a short carrier tone through the hiss. */
  blip() {
    const now = this.context.currentTime;
    if (now - (this.lastBlip || 0) < 0.07) return;
    this.lastBlip = now;
    const tone = this.context.createOscillator();
    tone.frequency.value = 650 + Math.random() * 1100;
    tone.frequency.exponentialRampToValueAtTime(tone.frequency.value * 0.82, now + 0.16);
    const level = this.context.createGain();
    level.gain.setValueAtTime(0, now);
    level.gain.linearRampToValueAtTime(0.05, now + 0.012);
    level.gain.exponentialRampToValueAtTime(0.0005, now + 0.16);
    tone.connect(level).connect(this.out);
    tone.start(now);
    tone.stop(now + 0.18);
  }
}

const fades = new WeakMap();

function fadeElement(el, to, ms) {
  const from = el.volume;
  const start = performance.now();
  const token = {};
  fades.set(el, token);
  const step = () => {
    if (fades.get(el) !== token) return;
    const t = Math.min(1, (performance.now() - start) / ms);
    try {
      el.volume = from + (to - from) * t;
    } catch {
      return;
    }
    if (t < 1) requestAnimationFrame(step);
  };
  step();
}
