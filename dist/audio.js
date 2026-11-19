// The station chooses the movement vocabulary. Measured sound supplies its timing.
const motionScores = {
  default: {
    shape: [0, 0, 0],
    damping: 6.7,
    impulse: 1,
    spacing: 0.165,
    rise: 0.6,
    release: 0.36,
  },
  electronic: {
    shape: [1, 0, 0],
    damping: 17,
    impulse: 2.7,
    spacing: 0.115,
    rise: 0.22,
    release: 0.19,
  },
  jazz: {
    shape: [0, 1, 0],
    damping: 4.7,
    impulse: 0.68,
    spacing: 0.155,
    rise: 0.48,
    release: 0.72,
  },
  classical: {
    shape: [0, 0, 1],
    damping: 2.8,
    impulse: 0.22,
    spacing: 0.26,
    rise: 1.05,
    release: 1.55,
  },
};
function scoreForStation(station) {
  const families = {
    Electronic: "electronic",
    "Jazz & soul": "jazz",
    Classical: "classical",
  };
  if (families[station.family]) return motionScores[families[station.family]];
  const tags = [station.genre, ...(station.genres || [])].join(" ");
  if (/\b(classical|opera|baroque|orchestral|symphonic)\b/i.test(tags))
    return motionScores.classical;
  if (/\b(jazz|bebop|swing)\b/i.test(tags)) return motionScores.jazz;
  if (/\b(electronic|techno|house|trance|dubstep|edm)\b/i.test(tags))
    return motionScores.electronic;
  return motionScores.default;
}
/* One live media graph per station. Direct playback remains available if a host declines CORS. */
class LiveSignal {
  constructor() {
    this.bands = new Float32Array(3);
    this.bins = new Uint8Array(512);
    this.previous = new Uint8Array(512);
    this.wave = new Float32Array(1024);
    this.resetEnvelope();
  }
  async attach(element) {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) throw Error("Audio analysis unavailable");
    this.context ||= new Context();
    await this.context.resume();
    if (this.target !== element) return;
    this.source = this.context.createMediaElementSource(element);
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.25;
    this.source.connect(this.analyser);
    this.analyser.connect(this.context.destination);
  }
  resetEnvelope() {
    this.level = 0;
    this.attack = 0;
    this.sustain = 0;
    this.fluxFloor = 0;
    this.sampled = false;
    this.lowFloor = 0;
    this.refractory = 0;
    this.displacement = 0;
    this.velocity = 0;
    this.previous.fill(0);
  }
  detach() {
    this.target = null;
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.source = null;
    this.analyser = null;
    this.bands.fill(0);
    this.resetEnvelope();
  }
  sample(seconds = 1 / 30, score = motionScores.default) {
    if (!this.analyser) return this.bands;
    this.analyser.getByteFrequencyData(this.bins);
    this.analyser.getFloatTimeDomainData(this.wave);
    const dt = Math.max(0.012, Math.min(0.15, seconds));
    let power = 0,
      flux = 0;
    for (const v of this.wave) power += v * v;
    // Positive spectral change measures fast attacks independently of held loudness.
    const end = Math.min(160, this.bins.length);
    for (let i = 1; i < end; i++)
      flux += Math.max(0, this.bins[i] - this.previous[i]);
    flux /= 255 * (end - 1);
    const rms = Math.sqrt(power / this.wave.length);
    const level = Math.min(1, Math.max(0, (rms - 0.002) * 4.8));
    this.level +=
      (level - this.level) *
      (1 - Math.exp(-dt / (level > this.level ? 0.045 : 0.17)));
    const onset =
      this.sampled && level > 0.018
        ? Math.min(1, Math.max(0, (flux - this.fluxFloor * 1.5 - 0.007) * 14))
        : 0;
    // A kick often changes only three or four FFT bins. Compare their attack
    // with the recent bass floor before combining it with broadband flux.
    const hz = this.context.sampleRate / this.analyser.fftSize;
    const lowEnd = Math.min(this.bins.length, Math.max(2, Math.ceil(185 / hz)));
    let lowFlux = 0;
    for (let i = 1; i < lowEnd; i++)
      lowFlux += Math.max(0, this.bins[i] - this.previous[i]);
    lowFlux /= 255 * (lowEnd - 1);
    const bassOnset =
      this.sampled && rms > 0.004
        ? Math.max(0, (lowFlux - this.lowFloor * 1.55 - 0.012) * 5.6)
        : 0;
    const accent = Math.min(1, Math.max(onset, bassOnset));
    this.lowFloor += (lowFlux - this.lowFloor) * (1 - Math.exp(-dt / 0.65));
    this.refractory = Math.max(0, this.refractory - dt);
    if (accent > 0.105 && this.refractory === 0) {
      this.velocity = Math.min(
        15 * score.impulse,
        this.velocity + (4.2 + accent * 10.2) * score.impulse,
      );
      this.refractory = score.spacing;
    }
    // Exact critically damped spring: a fast push followed by a smooth release.
    const damping = score.damping,
      slope = this.velocity + damping * this.displacement;
    const decay = Math.exp(-damping * dt);
    this.displacement = (this.displacement + slope * dt) * decay;
    this.velocity = (this.velocity - damping * slope * dt) * decay;
    this.attack = Math.max(accent, this.attack * Math.exp(-dt / 0.15));
    this.fluxFloor += (flux - this.fluxFloor) * (1 - Math.exp(-dt / 0.55));
    this.sustain +=
      (this.level - this.sustain) *
      (1 -
        Math.exp(
          -dt / (this.level > this.sustain ? score.rise : score.release),
        ));
    this.previous.set(this.bins);
    this.sampled = true;
    const ranges = [
      [45, 240],
      [240, 2500],
      [2500, 9500],
    ];
    ranges.forEach(([lo, hi], i) => {
      const a = Math.max(1, Math.floor(lo / hz)),
        b = Math.min(this.bins.length, Math.ceil(hi / hz));
      let sum = 0;
      for (let j = a; j < b; j++) sum += (this.bins[j] / 255) ** 2;
      const v = Math.sqrt(sum / Math.max(1, b - a));
      this.bands[i] += (v - this.bands[i]) * (v > this.bands[i] ? 0.46 : 0.12);
    });
    return this.bands;
  }
}
