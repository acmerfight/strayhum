/* One live media graph per station. Direct playback remains available if a host declines CORS. */
class LiveSignal {
  constructor() {
    this.bands = new Float32Array(3);
    this.bins = new Uint8Array(512);
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
    this.analyser.smoothingTimeConstant = 0.72;
    this.source.connect(this.analyser);
    this.analyser.connect(this.context.destination);
  }
  detach() {
    this.target = null;
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.source = null;
    this.analyser = null;
    this.bands.fill(0);
  }
  sample() {
    if (!this.analyser) return this.bands;
    this.analyser.getByteFrequencyData(this.bins);
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
