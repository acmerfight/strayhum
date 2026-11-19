/* The camera and hands of the globe: turning, zooming, flights between stations, the line
   of tonight's journey, and the small map labels beside the playing and pointed-at stations. */
const DEG = Math.PI / 180;

class Globe {
  constructor({ stations, onChoose, onPreview, onInteract }) {
    this.stations = stations;
    this.vectors = stations.map((s) => unitVector(s.lat, s.lon));
    this.onChoose = onChoose;
    this.onPreview = onPreview;
    this.onInteract = onInteract;
    this.sky = new Sky(document.getElementById('sky'), stations);
    this.ink = document.getElementById('ink');
    this.pen = this.ink.getContext('2d');
    this.here = document.getElementById('here');
    this.near = document.getElementById('near');
    this.lon = 0;
    this.lat = 20;
    this.zoom = 1;
    this.flightScale = 1;
    this.current = null;
    this.hovered = null;
    this.previewed = null;
    this.legs = [];
    this.rings = [];
    this.glow = 0;
    this.level = 0;
    this.reveal = 0;
    this.lastTouch = performance.now();
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resize();
    new ResizeObserver(() => this.resize()).observe(document.documentElement);
    this.input();
  }

  get ok() {
    return Boolean(this.sky.gl);
  }

  /** Renders at a lower pixel density when frames come slowly. Lines stay sharp at 1.5. */
  degrade() {
    if (this.dprCap <= 1) return;
    this.dprCap = this.dprCap > 1.5 ? 1.5 : 1;
    this.resize();
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.w = w;
    this.h = h;
    this.dprCap ??= 2;
    this.dpr = Math.min(devicePixelRatio || 1, this.dprCap);
    for (const canvas of [this.sky.canvas, this.ink]) {
      canvas.width = Math.round(w * this.dpr);
      canvas.height = Math.round(h * this.dpr);
    }
    this.portrait = w < 720 || w / h < 0.8;
    if (document.body.classList.contains('poster')) {
      this.cx = w * 0.7;
      this.cy = h * 0.5;
      this.baseRadius = h * 0.56;
    } else if (this.portrait) {
      // On a phone the globe may run past the sides of the screen; its top half is what matters.
      this.cx = w / 2;
      this.cy = h * 0.385;
      this.baseRadius = Math.min(w * 0.56, h * 0.27);
    } else if (h < 560) {
      this.cx = w * 0.64;
      this.cy = h * 0.46;
      this.baseRadius = Math.min(w * 0.26, h * 0.4);
    } else {
      this.cx = w * 0.555;
      this.cy = h * 0.47;
      this.baseRadius = Math.min(w * 0.3, h * 0.37);
    }
  }

  get radius() {
    return this.baseRadius * this.zoom * this.flightScale;
  }

  /** World-to-view rotation for the current camera, column-major for WebGL. */
  view() {
    const l = this.lon * DEG;
    const p = this.lat * DEG;
    const [sl, cl, sp, cp] = [Math.sin(l), Math.cos(l), Math.sin(p), Math.cos(p)];
    this.rows = [
      [cl, 0, -sl],
      [-sp * sl, cp, -sp * cl],
      [cp * sl, sp, cp * cl],
    ];
    const r = this.rows;
    return new Float32Array([r[0][0], r[1][0], r[2][0], r[0][1], r[1][1], r[2][1], r[0][2], r[1][2], r[2][2]]);
  }

  /** Screen position and facing (z > 0 is visible) of a unit vector. */
  project([x, y, z]) {
    const r = this.rows;
    const vx = r[0][0] * x + r[0][1] * y + r[0][2] * z;
    const vy = r[1][0] * x + r[1][1] * y + r[1][2] * z;
    const vz = r[2][0] * x + r[2][1] * y + r[2][2] * z;
    return [this.cx + vx * this.radius, this.cy - vy * this.radius, vz];
  }

  /** The visible station nearest to a screen point, within reach of a finger or pointer. */
  pick(x, y, reach) {
    let best = null;
    let bestDistance = reach;
    this.vectors.forEach((v, i) => {
      const [sx, sy, sz] = this.project(v);
      if (sz < 0.05) return;
      const distance = Math.hypot(sx - x, sy - y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    });
    return best;
  }

  setCamera(vector) {
    this.lat = Math.asin(Math.max(-1, Math.min(1, vector[1]))) / DEG;
    this.lon = Math.atan2(vector[0], vector[2]) / DEG;
  }

  center() {
    return unitVector(this.lat, this.lon);
  }

  /** Turn the camera to a station along the great circle. Returns when the flight lands. */
  fly(i, { from = this.current, softly = false } = {}) {
    const start = performance.now();
    const origin = this.center();
    const target = this.vectors[i];
    const angle = Math.acos(clamp(dot(origin, target), -1, 1));
    const duration = this.reduced ? 0 : softly ? 1400 : 950 + 1550 * Math.pow(angle / Math.PI, 0.8);
    if (from !== null && from !== i && !softly) {
      this.legs.push({ from, to: i, start, duration, at: Date.now() });
      this.legs = this.legs.slice(-40);
    }
    this.flight = { origin, target, angle, start, duration, dip: softly ? 0 : 0.16 * Math.min(1, angle / 1.6) };
    this.inertia = null;
    this.flightEnd = start + duration;
    return this.flightEnd;
  }

  /** Turns the earth under a fixed needle, like a dial, along a heading chosen by chance. */
  startWander() {
    const c = this.center();
    const east = normalize([c[2], 0, -c[0]]);
    const north = cross(c, east);
    const a = Math.random() * Math.PI * 2;
    const heading = [east[0] * Math.cos(a) + north[0] * Math.sin(a), east[1] * Math.cos(a) + north[1] * Math.sin(a), east[2] * Math.cos(a) + north[2] * Math.sin(a)];
    this.wander = { axis: normalize(cross(c, heading)), start: performance.now(), speed: 0 };
    this.flight = null;
    this.inertia = null;
    this.needle = 1;
  }

  stopWander() {
    this.wander = null;
  }

  /** The station under the needle: the nearest light to the centre of the globe. */
  underNeedle(reach = Infinity) {
    let best = null;
    let bestAngle = Infinity;
    const c = this.center();
    this.vectors.forEach((v, i) => {
      const angle = Math.acos(clamp(dot(c, v), -1, 1));
      if (angle < bestAngle) {
        bestAngle = angle;
        best = i;
      }
    });
    return bestAngle * this.radius <= reach ? best : null;
  }

  /** Draws the journey already travelled tonight, without animation. */
  remember(path) {
    this.legs = [];
    for (let k = 1; k < path.length; k++) this.legs.push({ from: path[k - 1].i, to: path[k].i, start: 0, duration: 0, at: path[k].at });
  }

  focus(i) {
    const previous = this.current;
    this.current = i;
    if (previous !== null && previous !== i) this.sky.mark(previous, this.markOf(previous));
    this.sky.mark(i, 'current');
    this.rings = [];
  }

  markOf(i) {
    if (i === this.current) return 'current';
    if (this.kept?.has(i)) return 'kept';
    if (this.heard?.has(i)) return 'heard';
    return 'plain';
  }

  refreshMarks(kept, heard) {
    this.kept = kept;
    this.heard = heard;
    this.stations.forEach((_, i) => this.sky.mark(i, i === this.hovered && i !== this.current ? 'hovered' : this.markOf(i)));
  }

  /** A ring of sound leaving the station. */
  ring(strength, speed) {
    if (this.reduced) return;
    this.rings.push({ r: 0, s: strength, speed });
    if (this.rings.length > 8) this.rings.shift();
  }

  hover(i) {
    if (this.hovered === i) return;
    if (this.hovered !== null) this.sky.mark(this.hovered, this.markOf(this.hovered));
    this.hovered = i;
    if (i !== null && i !== this.current) this.sky.mark(i, 'hovered');
  }

  step(now, dt) {
    const f = this.flight;
    const wander = this.wander;
    this.needle = wander ? 1 : Math.max(0, (this.needle || 0) - dt * 2.2);
    if (wander) {
      const t = (now - wander.start) / 1000;
      // The dial gathers speed for a moment, as a heavy knob would.
      wander.speed = (12 + 40 * smoothstep(0.1, 1.8, t)) * DEG;
      const c = this.center();
      const k = wander.axis;
      const turn = wander.speed * dt;
      const kc = cross(k, c);
      this.setCamera(normalize([c[0] * Math.cos(turn) + kc[0] * Math.sin(turn), c[1] * Math.cos(turn) + kc[1] * Math.sin(turn), c[2] * Math.cos(turn) + kc[2] * Math.sin(turn)]));
      this.flightScale += (0.9 - this.flightScale) * Math.min(1, dt * 3);
      const passing = this.underNeedle(26);
      if (passing !== this.passing) {
        this.passing = passing;
        this.hover(passing);
        if (passing !== null) this.onPass?.(passing, wander.speed / (52 * DEG));
      }
    } else if (f) {
      const t = f.duration ? Math.min(1, (now - f.start) / f.duration) : 1;
      const e = t * t * t * (t * (t * 6 - 15) + 10);
      this.setCamera(slerp(f.origin, f.target, f.angle, e));
      this.flightScale = 1 - f.dip * Math.sin(Math.PI * t) ** 2;
      if (t >= 1) {
        this.flight = null;
        this.flightScale = 1;
      }
    } else if (this.inertia) {
      const decay = Math.exp(-dt / 0.32);
      this.lon += this.inertia[0] * dt;
      this.lat = clamp(this.lat + this.inertia[1] * dt, -80, 80);
      this.inertia = [this.inertia[0] * decay, this.inertia[1] * decay];
      if (Math.hypot(...this.inertia) < 0.5) this.inertia = null;
    } else if (!this.dragging && !this.reduced) {
      const idle = now - this.lastTouch;
      if (this.current !== null && this.playing && idle > 11000) {
        // Like a compass needle, the view settles back on the station that is playing.
        const away = Math.acos(clamp(dot(this.center(), this.vectors[this.current]), -1, 1)) / DEG;
        if (away > 7) this.fly(this.current, { softly: true });
      } else if (!this.playing && idle > 3500) {
        this.lon += 2.2 * dt;
      }
    }
    for (const ring of this.rings) {
      ring.r += ring.speed * dt;
      ring.s *= Math.exp(-dt / 1.6);
    }
    this.rings = this.rings.filter((ring) => ring.r < 1.9 && ring.s > 0.02);
  }

  frame(now, dt, sound) {
    this.step(now, dt);
    this.level += ((sound?.level ?? 0) - this.level) * Math.min(1, dt * 12);
    this.glow += ((sound?.sustain ?? 0) - this.glow) * Math.min(1, dt * 2);
    const view = this.view();
    const rings = new Float32Array(16);
    this.rings.forEach((ring, k) => {
      rings[2 * k] = ring.r;
      rings[2 * k + 1] = ring.s;
    });
    this.sky.render({
      width: this.sky.canvas.width,
      height: this.sky.canvas.height,
      dpr: this.dpr,
      cx: this.cx,
      cy: this.cy,
      radius: this.radius,
      view,
      sun: this.sun || (this.sun = sunDirection(new Date())),
      beacon: this.current === null ? [0, 0, 1] : this.vectors[this.current],
      beaconOn: this.current === null ? 0 : this.beaconOn ?? 0,
      rings,
      ringWidth: 0.016,
      glow: this.glow,
      reveal: this.reveal,
      time: now / 1000,
      twinkle: this.reduced ? 0 : 1,
      level: this.level,
    });
    this.drawInk(now);
    this.placeLabels();
  }

  /** The needle at the centre of the globe, shown while the dial turns and for a moment after. */
  drawNeedle(c) {
    if (!this.needle) return;
    const a = this.needle;
    c.strokeStyle = `rgba(255,169,77,${0.9 * a})`;
    c.lineWidth = 1;
    c.beginPath();
    c.arc(this.cx, this.cy, 15, 0, Math.PI * 2);
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      c.moveTo(this.cx + dx * 20, this.cy + dy * 20);
      c.lineTo(this.cx + dx * 27, this.cy + dy * 27);
    }
    c.stroke();
  }

  drawInk(now) {
    const c = this.pen;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.w, this.h);
    if (!this.ok) this.drawFallback(c);
    this.drawNeedle(c);
    const latest = this.legs.length - 1;
    this.legs.forEach((leg, k) => {
      const t = leg.duration ? clamp((now - leg.start) / leg.duration, 0, 1) : 1;
      if (t <= 0) return;
      const e = t * t * t * (t * (t * 6 - 15) + 10);
      const fresh = k === latest;
      const age = latest - k;
      c.strokeStyle = fresh ? 'rgba(255,169,77,.78)' : `rgba(233,227,214,${Math.max(0.1, 0.36 - age * 0.03)})`;
      c.lineWidth = fresh ? 1.1 : 0.8;
      this.arc(c, this.vectors[leg.from], this.vectors[leg.to], e);
      if (fresh && t < 1) {
        const a = this.vectors[leg.from];
        const b = this.vectors[leg.to];
        const head = slerp(a, b, Math.acos(clamp(dot(a, b), -1, 1)), e);
        const [x, y, z] = this.project(head);
        if (z > 0) {
          c.fillStyle = '#ffe2bd';
          c.shadowColor = '#ffa94d';
          c.shadowBlur = 12;
          c.beginPath();
          c.arc(x, y, 1.8, 0, Math.PI * 2);
          c.fill();
          c.shadowBlur = 0;
        }
      }
    });
  }

  /** A great-circle arc between two stations, drawn only where it faces the viewer. */
  arc(c, a, b, until) {
    const angle = Math.acos(clamp(dot(a, b), -1, 1));
    if (angle < 1e-4) return;
    const steps = Math.max(8, Math.ceil(angle * 48));
    // Long legs rise a little off the surface, like a flight path.
    const lift = 0.035 * Math.min(1, angle / 1.2);
    c.beginPath();
    let down = false;
    for (let k = 0; k <= steps * until; k++) {
      const t = k / steps;
      const p = slerp(a, b, angle, t);
      const h = 1 + lift * Math.sin(Math.PI * t);
      const [x, y, z] = this.project([p[0] * h, p[1] * h, p[2] * h]);
      const visible = z > -0.02;
      if (visible && down) c.lineTo(x, y);
      else if (visible) c.moveTo(x, y);
      down = visible;
    }
    c.stroke();
  }

  drawFallback(c) {
    c.strokeStyle = 'rgba(233,227,214,.35)';
    c.lineWidth = 1;
    c.beginPath();
    c.arc(this.cx, this.cy, this.radius, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = 'rgba(233,227,214,.6)';
    for (const v of this.vectors) {
      const [x, y, z] = this.project(v);
      if (z > 0) c.fillRect(x - 0.8, y - 0.8, 1.6, 1.6);
    }
  }

  placeLabels() {
    const pointed = this.previewed ?? this.hovered;
    const pointing = pointed !== null && pointed !== this.current;
    // One label at a time near the pointer, so two names never print over each other.
    this.label(this.here, this.current, this.current !== null && !this.flight && !pointing);
    this.label(this.near, pointed, pointing);
  }

  label(el, i, show) {
    let visible = false;
    if (show && i !== null) {
      const [x, y, z] = this.project(this.vectors[i]);
      visible = z > 0.08;
      if (visible) {
        // Labels sit to the right of their light, else to the left; if neither fits, centred below it.
        const box = el.firstElementChild;
        const width = box.offsetWidth;
        const right = x + 22 + width <= this.w;
        const left = !right && x - 22 - width >= 0;
        const below = !right && !left;
        el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
        el.classList.toggle('left', left);
        el.classList.toggle('below', below);
        box.style.left = below ? `${Math.round(clamp(x - width / 2, 10, this.w - 10 - width) - x)}px` : '';
      }
    }
    el.classList.toggle('shown', visible);
  }

  input() {
    const canvas = this.ink;
    const pointers = new Map();
    let last = null;
    let tap = null;
    let span = 0;
    const touchReach = () => (matchMedia('(pointer: coarse)').matches ? 30 : 16);
    const local = (e) => [e.clientX, e.clientY];

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, local(e));
      this.flight = null;
      this.flightScale = 1;
      this.inertia = null;
      this.touch();
      tap = pointers.size === 1 ? { x: e.clientX, y: e.clientY, at: performance.now() } : null;
      last = { x: e.clientX, y: e.clientY, at: performance.now(), vx: 0, vy: 0 };
      if (pointers.size === 2) span = pairDistance(pointers);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) {
        if (e.pointerType === 'mouse') {
          const i = this.pick(e.clientX, e.clientY, touchReach());
          this.hover(i);
          canvas.style.cursor = i === null ? 'grab' : 'pointer';
          if (i !== null) this.onPreview(i, false);
        }
        return;
      }
      pointers.set(e.pointerId, local(e));
      if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 6) return;
      tap = null;
      this.dragging = true;
      this.hover(null);
      this.touch();
      if (pointers.size === 2) {
        const distance = pairDistance(pointers);
        if (span) this.scale(distance / span);
        span = distance;
        return;
      }
      const now = performance.now();
      const dt = Math.max(8, now - last.at) / 1000;
      const k = 57 / this.radius;
      const dLon = -(e.clientX - last.x) * k;
      const dLat = (e.clientY - last.y) * k;
      this.lon += dLon;
      this.lat = clamp(this.lat + dLat, -80, 80);
      last = { x: e.clientX, y: e.clientY, at: now, vx: 0.6 * last.vx + (0.4 * dLon) / dt, vy: 0.6 * last.vy + (0.4 * dLat) / dt };
      canvas.style.cursor = 'grabbing';
    });

    const release = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      span = pointers.size === 2 ? pairDistance(pointers) : 0;
      if (pointers.size) return;
      this.dragging = false;
      canvas.style.cursor = 'grab';
      if (tap && e.type === 'pointerup') {
        const i = this.pick(e.clientX, e.clientY, touchReach() + 8);
        if (e.pointerType === 'mouse') {
          if (i !== null) this.onChoose(i);
        } else if (i !== null) {
          this.previewed = i;
          this.onPreview(i, true);
        } else {
          this.previewed = null;
          this.onPreview(null, true);
        }
      } else if (last && performance.now() - last.at < 80 && !this.reduced) {
        this.inertia = [clamp(last.vx, -240, 240), clamp(last.vy, -180, 180)];
      }
      tap = null;
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && !pointers.size) {
        this.hover(null);
        this.onPreview(null, false);
      }
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.touch();
        this.scale(Math.exp(-clamp(e.deltaY, -60, 60) * 0.0025));
      },
      { passive: false },
    );
    canvas.addEventListener('keydown', (e) => {
      const turn = { ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, 6], ArrowDown: [0, -6] }[e.key];
      if (!turn) return;
      e.preventDefault();
      e.stopPropagation();
      this.touch();
      this.flight = null;
      this.lon += turn[0];
      this.lat = clamp(this.lat + turn[1], -80, 80);
    });
  }

  touch() {
    this.lastTouch = performance.now();
    this.onInteract?.();
  }

  scale(factor) {
    this.zoom = clamp(this.zoom * factor, 0.8, 3.4);
  }
}

function slerp(a, b, angle, t) {
  if (angle < 1e-5) return b;
  const s = Math.sin(angle);
  const u = Math.sin((1 - t) * angle) / s;
  const v = Math.sin(t * angle) / s;
  return [a[0] * u + b[0] * v, a[1] * u + b[1] * v, a[2] * u + b[2] * v];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(v) {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

function pairDistance(pointers) {
  const [a, b] = [...pointers.values()];
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
