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
  sample(seconds = 1 / 30) {
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
    this.attack = Math.max(onset, this.attack * Math.exp(-dt / 0.15));
    this.fluxFloor += (flux - this.fluxFloor) * (1 - Math.exp(-dt / 0.55));
    this.sustain +=
      (this.level - this.sustain) *
      (1 - Math.exp(-dt / (this.level > this.sustain ? 0.6 : 0.36)));
    this.previous.set(this.bins);
    this.sampled = true;
    const hz = this.context.sampleRate / this.analyser.fftSize;
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
