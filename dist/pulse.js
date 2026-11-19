/* The pulse of the music: its tempo, where the beat falls, and which beat starts the bar.
   Fed the onset strength of each animation frame; answers with a beat when one falls.

   Every half second it looks back over the last eight seconds of onsets:
   - the tempo is the period at which the onsets best repeat, weighted toward moderate tempos as
     listeners hear them, and checked against twice its length so hi-hats on the off-beats do
     not double it;
   - the beat is the grid at that period which lines up with the most onset energy, bass
     counting more, so off-beat hats and swing do not pull it away;
   - the bar is four beats, and its first is the beat that carries the most bass.
   Between looks, the beat runs on by itself. When the music has no steady pulse, confidence
   falls and `locked` goes false: the caller should follow the phrase instead. */
const PULSE_RATE = 50; // Onset samples per second.
const PULSE_SPAN = 400; // Eight seconds of them.

class Pulse {
  constructor() {
    this.onsets = new Float32Array(PULSE_SPAN);
    this.basses = new Float32Array(PULSE_SPAN);
    this.reset();
  }

  reset() {
    this.onsets.fill(0);
    this.basses.fill(0);
    this.write = 0;
    this.filled = 0;
    this.carry = 0;
    this.peak = 0;
    this.peakBass = 0;
    this.period = 0.5;
    this.confidence = 0;
    this.locked = false;
    this.phase = 0;
    this.count = 0;
    this.sinceEstimate = 0;
    this.agreed = 0;
    this.lastBass = 0;
    this.barVote = null;
  }

  /** Adds dt seconds of music with this onset strength (and its bass part). Returns the beat
      that fell in it, if one did: { index in the bar, downbeat, strength, period }. */
  step(onset, bass, dt) {
    // Onsets shorter than a sample are kept: each sample holds the strongest since the last.
    this.peak = Math.max(this.peak, onset);
    this.peakBass = Math.max(this.peakBass, bass);
    this.carry += dt * PULSE_RATE;
    while (this.carry >= 1) {
      this.onsets[this.write] = this.peak;
      this.basses[this.write] = this.peakBass;
      this.write = (this.write + 1) % PULSE_SPAN;
      this.filled = Math.min(this.filled + 1, PULSE_SPAN);
      this.carry -= 1;
      this.peak = this.peakBass = 0;
    }
    this.lastBass = Math.max(this.lastBass * Math.exp(-dt / 0.08), bass);
    this.sinceEstimate += dt;
    if (this.sinceEstimate > 0.5 && this.filled > PULSE_RATE * 4) {
      this.sinceEstimate = 0;
      this.estimate();
    }
    this.phase += dt / this.period;
    if (this.phase < 1) return null;
    this.phase -= 1;
    this.count = (this.count + 1) % 4;
    return { index: this.count, downbeat: this.count === 0, strength: Math.min(1, 0.4 + this.lastBass + onset * 0.5), period: this.period };
  }

  /** The last n samples, oldest first: onsets with bass weighted in, less their mean. */
  series() {
    const n = this.filled;
    const out = new Float32Array(n);
    const bass = new Float32Array(n);
    let mean = 0;
    for (let k = 0; k < n; k++) {
      const at = (this.write - n + k + PULSE_SPAN) % PULSE_SPAN;
      out[k] = this.onsets[at] + 1.5 * this.basses[at];
      bass[k] = this.basses[at];
      mean += out[k];
    }
    mean /= n;
    for (let k = 0; k < n; k++) out[k] = Math.max(0, out[k] - mean);
    return { onsets: out, bass };
  }

  estimate() {
    const { onsets, bass } = this.series();
    const n = onsets.length;
    let energy = 0;
    for (const v of onsets) energy += v * v;
    if (energy < 1e-4) {
      this.confidence *= 0.6;
      this.locked = this.locked && this.confidence > 0.2;
      return;
    }
    const raw = [];
    const correlation = (lag) => {
      if (raw[lag] !== undefined) return raw[lag];
      let sum = 0;
      for (let k = lag; k < n; k++) sum += onsets[k] * onsets[k - lag];
      return (raw[lag] = sum / energy);
    };
    const minLag = Math.floor((PULSE_RATE * 60) / 185);
    const maxLag = Math.ceil((PULSE_RATE * 60) / 58);
    let best = minLag;
    let bestScore = -Infinity;
    for (let lag = minLag; lag <= maxLag; lag++) {
      const bpm = (60 * PULSE_RATE) / lag;
      const prior = Math.exp(-0.5 * (Math.log2(bpm / 112) / 0.8) ** 2);
      const score = (correlation(lag) + 0.5 * correlation(Math.min(2 * lag, n - 1))) * prior;
      if (score > bestScore) {
        bestScore = score;
        best = lag;
      }
    }
    // Hats on every off-beat make half the beat repeat almost as well as the beat itself; the
    // bass decides between them.
    const double = best * 2;
    if (double <= maxLag * 1.6 && (60 * PULSE_RATE) / best > 125 && this.combStrength(bass, double / PULSE_RATE) > 1.35 * this.combStrength(bass, best / PULSE_RATE)) {
      best = double;
    }
    const a = correlation(best - 1);
    const b = correlation(best);
    const c = correlation(Math.min(best + 1, n - 1));
    const curvature = a - 2 * b + c;
    const shift = curvature !== 0 ? clamp((0.5 * (a - c)) / curvature, -0.5, 0.5) : 0;
    const period = (best + shift) / PULSE_RATE;
    this.confidence += (clamp(b, 0, 1) - this.confidence) * 0.35;
    const ratio = period / this.period;
    if (Math.abs(ratio - 1) < 0.06) {
      this.period += (period - this.period) * 0.25;
      this.agreed = 0;
    } else if (++this.agreed >= 2 || !this.locked) {
      this.period = period;
      this.agreed = 0;
    }
    // Real music is noisier than a click track: a pulse must be clear to start, and may then waver.
    this.locked = this.locked ? this.confidence > 0.2 : this.confidence > 0.3;
    this.align(onsets, bass);
  }

  /** Mean bass on a grid of this period, at its best offset: how strongly the bass keeps it. */
  combStrength(bass, period) {
    const p = period * PULSE_RATE;
    let best = 0;
    for (let offset = 0; offset < p; offset += 1) {
      let sum = 0;
      let count = 0;
      for (let at = bass.length - 1 - offset; at >= 0; at -= p) {
        sum += peakNear(bass, at);
        count++;
      }
      best = Math.max(best, sum / Math.max(1, count));
    }
    return best;
  }

  /** Places the beat on the grid that carries the most onset energy, and the bar's first beat
      on the beat that carries the most bass. */
  align(onsets, bass) {
    const n = onsets.length;
    const p = this.period * PULSE_RATE;
    let bestOffset = 0;
    let bestSum = -Infinity;
    for (let offset = 0; offset < p; offset += 0.5) {
      let sum = 0;
      let m = 0;
      // Recent beats count more: the music may have shifted.
      for (let at = n - 1 - offset; at >= 0; at -= p, m++) sum += sample(onsets, at) * Math.exp(-m / 10);
      if (sum > bestSum) {
        bestSum = sum;
        bestOffset = offset;
      }
    }
    // offset samples ago was a beat; the phase now is how far we are past it.
    const target = bestOffset / p;
    let difference = target - this.phase;
    difference -= Math.round(difference);
    // Small differences are eased in, so beats stay evenly spaced; a large one is taken at once.
    // Moving the phase across a beat means that beat was counted early or not at all: keep the count true.
    let phase = this.phase + (this.locked && Math.abs(difference) < 0.25 ? difference * 0.35 : difference);
    if (phase >= 1) {
      phase -= 1;
      this.count = (this.count + 1) % 4;
    } else if (phase < 0) {
      phase += 1;
      this.count = (this.count + 3) % 4;
    }
    this.phase = phase;

    const bar = [0, 0, 0, 0];
    let m = 0;
    for (let at = n - 1 - bestOffset; at >= 0; at -= p, m++) bar[m % 4] += peakNear(bass, at);
    let first = 0;
    for (let k = 1; k < 4; k++) if (bar[k] > bar[first]) first = k;
    // Only a clear bass accent, heard the same way twice, moves the bar; otherwise the count runs on.
    const sorted = [...bar].sort((x, y) => y - x);
    if (sorted[0] <= sorted[1] * 1.12) return;
    // Express the decision as which beat of the running count is first, so it survives the count advancing.
    const proposal = (((this.count - first) % 4) + 4) % 4;
    if (proposal === 0) {
      this.barVote = null;
    } else if (this.barVote?.shift === proposal) {
      this.count = first;
      this.barVote = null;
    } else {
      this.barVote = { shift: proposal };
    }
  }

  get bpm() {
    return 60 / this.period;
  }
}

/** The strongest value within a sample and a half of a point: onsets are a single sample wide. */
function peakNear(series, at) {
  let best = 0;
  for (let j = Math.round(at - 1.5); j <= Math.round(at + 1.5); j++) if (j >= 0 && j < series.length) best = Math.max(best, series[j]);
  return best;
}

function sample(series, at) {
  if (at < 0 || at > series.length - 1) return 0;
  const i = Math.floor(at);
  const f = at - i;
  return series[i] * (1 - f) + (series[i + 1] ?? series[i]) * f;
}
