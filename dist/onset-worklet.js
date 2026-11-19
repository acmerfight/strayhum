/* Runs on the audio thread: turns the stream into onset strength, broadband and bass, every 512
   samples, stamped with audio time. The beat is then found in the music's own time, whatever the
   screen is doing, and drawn when it is heard. */
const BLOCK = 512;

class Onsets extends AudioWorkletProcessor {
  constructor() {
    super();
    this.low1 = 0;
    this.low2 = 0;
    this.previous = 0;
    this.all = 0;
    this.low = 0;
    this.count = 0;
    this.historyAll = [-90, -90, -90];
    this.historyLow = [-90, -90, -90];
    this.floorAll = 1;
    this.floorLow = 1;
    // Two one-pole low-passes near 150 Hz: the kick and the bass line.
    this.k = 1 - Math.exp((-2 * Math.PI * 150) / sampleRate);
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input.length) return true;
    const left = input[0];
    const right = input[1] || left;
    for (let i = 0; i < left.length; i++) {
      const x = (left[i] + right[i]) * 0.5;
      this.low1 += this.k * (x - this.low1);
      this.low2 += this.k * (this.low1 - this.low2);
      // A first difference leans toward the highs: attacks of every kind.
      const edge = x - this.previous;
      this.previous = x;
      this.all += edge * edge;
      this.low += this.low2 * this.low2;
    }
    this.count += left.length;
    if (this.count >= BLOCK) this.emit(currentTime + left.length / sampleRate);
    return true;
  }

  emit(time) {
    const db = (energy) => 10 * Math.log10(1e-10 + energy / this.count);
    const all = db(this.all);
    const low = db(this.low);
    // The rise in level over the recent past, in decibels: an onset.
    const riseAll = Math.max(0, all - Math.max(...this.historyAll));
    const riseLow = Math.max(0, low - Math.max(...this.historyLow));
    this.historyAll = [this.historyAll[1], this.historyAll[2], all];
    this.historyLow = [this.historyLow[1], this.historyLow[2], low];
    // Measured against what is usual in this music, so a quiet record and a loud one read alike.
    this.floorAll += (riseAll - this.floorAll) * 0.02;
    this.floorLow += (riseLow - this.floorLow) * 0.02;
    const onset = Math.min(1, Math.max(0, (riseAll - this.floorAll * 1.5) / 9));
    const bass = Math.min(1, Math.max(0, (riseLow - this.floorLow * 1.5) / 9));
    this.port.postMessage({ time, onset, bass, seconds: this.count / sampleRate, silent: all < -70 });
    this.all = this.low = 0;
    this.count = 0;
  }
}

registerProcessor('onsets', Onsets);
