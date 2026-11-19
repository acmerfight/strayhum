/* Orthographic globe. The luminous surface, station buttons and great-circle routes share one rotation. */
class RadioGlobe {
  constructor(stations, onSelect) {
    this.canvas = document.querySelector("#globe");
    this.sky = document.querySelector("#sky");
    this.stations = stations;
    this.selected = Math.max(
      0,
      stations.findIndex((s) => s.id === "fip"),
    );
    const station = stations[this.selected];
    this.lon = station.lon + 16;
    this.lat = station.lat - 19;
    this.zoom = 1;
    this.rad = Math.PI / 180;
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.pins = stations.map((s, i) => {
      const pin = document.createElement("button");
      pin.className = "pin";
      pin.setAttribute("aria-label", "Tune to " + s.name + " in " + s.city);
      const label = document.createElement("span");
      label.textContent = s.city;
      pin.append(label, document.createElement("i"));
      pin.addEventListener("click", () => onSelect(i));
      document.querySelector("#pins").append(pin);
      return pin;
    });
    this.overlay = document.querySelector("#waves");
    this.ctx = this.overlay.getContext("2d");
    this.energy = new Float32Array(3);
    this.time = 0;
    this.tint = 0;
    this.sphere = new SignalSphere(this.canvas, () => this.draw());
    this.flightScale = 1;
    this.waveStart = performance.now();
    this.listening = false;
    this.hold = 0;
    this.strike = 0;
    this.loudness = 0;
    this.firstLight = 0;
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) this.refreshWaves();
    });
    this.input();
    new ResizeObserver(() => this.resize()).observe(this.sky);
    this.resize();
    this.refreshWaves();
  }
  resize() {
    this.w = this.sky.clientWidth;
    this.h = this.sky.clientHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.7);
    this.renderDpr = Math.min(this.dpr, 1.25, 1650 / this.w);
    this.canvas.width = Math.round(this.w * this.renderDpr);
    this.canvas.height = Math.round(this.h * this.renderDpr);
    this.overlay.width = Math.round(this.w * this.dpr);
    this.overlay.height = Math.round(this.h * this.dpr);
    this.mobile = matchMedia(
      "(max-width:700px),(max-aspect-ratio:4/5)",
    ).matches;
    this.cx = this.w * (this.mobile ? 0.5 : 0.655);
    this.cy = this.h * (this.mobile ? 0.37 : 0.495);
    this.baseRadius = this.mobile
      ? Math.min(this.w * 0.378, this.h * 0.216)
      : Math.min(this.w * 0.24, this.h * 0.348);
    this.draw();
  }

  project(lat, lon) {
    const a = lat * this.rad,
      b = (lon - this.lon) * this.rad,
      p = this.lat * this.rad,
      c = Math.cos(a);
    return [
      this.cx + this.radius * c * Math.sin(b),
      this.cy -
        this.radius *
          (Math.sin(a) * Math.cos(p) - c * Math.cos(b) * Math.sin(p)),
      Math.sin(a) * Math.sin(p) + c * Math.cos(b) * Math.cos(p),
    ];
  }
  draw() {
    this.radius = this.baseRadius * this.zoom * this.flightScale;
    if (!this.radius) return;
    this.sphere.draw(this);
    this.drawWaves(performance.now());
    // Separate nearby city hit targets on small globes, keeping the selected city anchored.
    const occupied = [];
    const points = this.stations.map((s, i) => ({
      i,
      point: this.project(s.lat, s.lon),
    }));
    points.sort((a, b) => (b.i === this.selected) - (a.i === this.selected));
    for (const {
      i,
      point: [px, py, z],
    } of points) {
      const pin = this.pins[i];
      pin.hidden = z < 0.09;
      if (pin.hidden) continue;
      let x = px,
        y = py;
      for (
        let j = 0;
        j < 24 && occupied.some((p) => Math.hypot(x - p[0], y - p[1]) < 26);
        j++
      ) {
        const angle = j * 2.4,
          offset = 17 + 2 * j;
        x = px + Math.cos(angle) * offset;
        y = py + Math.sin(angle) * offset;
      }
      occupied.push([x, y]);
      pin.style.left = x + "px";
      pin.style.top = y + "px";
      pin.classList.toggle("active", i === this.selected);
      pin.classList.toggle("left", x > this.w - 95);
    }
  }
  rotate(lon, lat) {
    this.lon = ((((lon + 540) % 360) + 360) % 360) - 180;
    this.lat = Math.max(-84, Math.min(84, lat));
    this.draw();
  }
  ring(center, angle, color, width) {
    const [ax, ay, az] = center,
      flat = Math.hypot(ax, az) || 1,
      ux = az / flat,
      uz = -ax / flat;
    const vx = ay * uz,
      vy = az * ux - ax * uz,
      vz = -ay * ux;
    const ca = Math.cos(angle),
      sa = Math.sin(angle),
      p = this.lat * this.rad,
      l = this.lon * this.rad;
    const cp = Math.cos(p),
      sp = Math.sin(p),
      cl = Math.cos(l),
      sl = Math.sin(l);
    const c = this.ctx;
    let visible = false;
    c.beginPath();
    for (let j = 0; j <= 156; j++) {
      const t = (j * 2 * Math.PI) / 156,
        u = sa * Math.cos(t),
        v = sa * Math.sin(t);
      const x = ax * ca + ux * u + vx * v,
        y = ay * ca + vy * v,
        z = az * ca + uz * u + vz * v;
      const depth = x * sl + z * cl,
        front = y * sp + depth * cp;
      const dx = this.cx + this.radius * (x * cl - z * sl),
        dy = this.cy - this.radius * (y * cp - depth * sp);
      if (front > 0) {
        if (visible) c.lineTo(dx, dy);
        else c.moveTo(dx, dy);
      }
      visible = front > 0;
    }
    c.strokeStyle = color;
    c.lineWidth = width;
    c.stroke();
  }
  drawWaves(now) {
    const c = this.ctx,
      r = this.radius;
    if (!r) return;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.w, this.h);
    drawMantle(this);
    this.drawJourney(now);
    const station = this.stations[this.selected],
      lat = station.lat * this.rad,
      lon = station.lon * this.rad;
    const center = [
      Math.cos(lat) * Math.sin(lon),
      Math.sin(lat),
      Math.cos(lat) * Math.cos(lon),
    ];
    for (const angle of [0.115, 0.153])
      this.ring(center, angle, "rgba(255,210,163,.39)", 0.85);
    const elapsed = now - this.waveStart,
      cycle = 4200;
    if (!this.reduced && !this.listening && elapsed < cycle) {
      const phase = (elapsed % cycle) / cycle;
      for (const delay of [0, 0.047, 0.1]) {
        const t = phase - delay;
        if (t < 0) continue;
        const alpha = 0.52 * (1 - t) ** 1.8 * Math.min(1, t * 18);
        this.ring(
          center,
          0.13 + 1.25 * t,
          "rgba(255,211,161," + alpha + ")",
          delay === 0 ? 1.35 : 0.85,
        );
      }
    }
  }
  drawJourney(now) {
    if (!this.journey || this.reduced) return;
    const t = (now - this.journey.start) / 1950;
    if (t >= 1) {
      this.journey = null;
      return;
    }
    const c = this.ctx;
    let penDown = false;
    c.beginPath();
    for (let k = 0; k <= 90; k++) {
      const f = k / 90;
      if (f > Math.min(1, t * 1.65)) break;
      const [lat, lon] = this.journey.path[k],
        [x, y, z] = this.project(lat, lon);
      if (z > 0) {
        if (penDown) c.lineTo(x, y);
        else c.moveTo(x, y);
      }
      penDown = z > 0;
    }
    if (penDown) {
      const head =
        this.journey.path[Math.min(90, Math.floor(Math.min(1, t * 1.65) * 90))];
      const [x, y, z] = this.project(...head);
      if (z > 0) {
        c.save();
        c.fillStyle = "#fff0ce";
        c.shadowColor = "#ffd99f";
        c.shadowBlur = 10;
        c.fillRect(x - 1.6, y - 1.6, 3.2, 3.2);
        c.restore();
      }
    }
    c.strokeStyle = "rgba(253,211,161," + 0.63 * Math.min(1, (1 - t) * 3) + ")";
    c.lineWidth = 1.2;
    c.stroke();
  }
  stationRoute(from, to) {
    const vector = (s) => {
      const a = s.lat * this.rad,
        b = s.lon * this.rad;
      return [
        Math.cos(a) * Math.sin(b),
        Math.sin(a),
        Math.cos(a) * Math.cos(b),
      ];
    };
    const a = vector(from),
      b = vector(to),
      angle = Math.acos(
        Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])),
      ),
      sinAngle = Math.sin(angle);
    if (Math.abs(sinAngle) < 0.001) return null;
    const path = Array.from({ length: 91 }, (_, i) => {
      const left = Math.sin((1 - i / 90) * angle) / sinAngle,
        right = Math.sin((i / 90) * angle) / sinAngle;
      return [
        Math.asin(Math.max(-1, Math.min(1, a[1] * left + b[1] * right))) /
          this.rad,
        Math.atan2(a[0] * left + b[0] * right, a[2] * left + b[2] * right) /
          this.rad,
      ];
    });
    return { start: performance.now(), path };
  }
  refreshWaves() {
    cancelAnimationFrame(this.waveFrame);
    if (document.hidden || this.reduced) return;
    let last = 0;
    const step = (now) => {
      if (document.hidden || this.reduced) return;
      const interval = this.sphere.gl ? 33 : 66;
      if (!last || now - last >= interval) {
        const delta = last ? Math.min(80, now - last) / 1000 : 0;
        last = now;
        const responsive = this.listening && this.signal?.analyser;
        const measured = responsive ? this.signal.sample(delta) : null;
        this.strike = responsive ? this.signal.attack : 0;
        this.hold = responsive ? this.signal.sustain : 0;
        this.loudness = responsive ? this.signal.level : 0;
        if (
          this.awaitingSound &&
          responsive &&
          now >= (this.flightEnd || 0) &&
          this.loudness > 0.015
        ) {
          this.firstLight = now;
          this.awaitingSound = false;
        }
        if (measured) this.energy.set(measured);
        else this.energy.fill(0);
        this.time +=
          delta *
          (responsive
            ? Math.min(1, this.loudness * 7) * (0.27 + this.hold * 1.7)
            : this.listening
              ? 0.22
              : 0.54);
        this.tint +=
          (((this.selected * 0.618) % 1) - this.tint) *
          Math.min(1, delta * 1.5);
        if (this.sphere.gl) this.sphere.draw(this);
        this.drawWaves(now);
        this.drawSpectrum();
      }
      this.waveFrame = requestAnimationFrame(step);
    };
    this.waveFrame = requestAnimationFrame(step);
  }
  drawSpectrum() {
    const signal = this.signal;
    if (!this.listening || !signal?.analyser) return;
    const canvas = document.querySelector("#spectrum"),
      c = canvas.getContext("2d");
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.fillStyle = "#cdb497";
    for (let i = 0; i < 16; i++) {
      const bin = Math.min(511, Math.floor(1.47 ** i)),
        v = signal.bins[bin] / 255;
      c.fillRect(i * 4.7, 29 - v * 25, 2, 2 + v * 25);
    }
  }
  setReduced(reduced) {
    this.reduced = reduced;
    this.cancelFlight();
    this.journey = null;
    if (reduced) this.rotate(this.lon, this.lat);
    this.refreshWaves();
  }
  broadcast(active) {
    if (active !== this.listening) {
      this.awaitingSound = active;
      this.firstLight = 0;
    }
    if (active && !this.listening) this.waveStart = performance.now();
    this.listening = active;
    this.refreshWaves();
  }
  focus(i) {
    this.cancelFlight();
    this.journey = this.reduced
      ? null
      : this.stationRoute(this.stations[this.selected], this.stations[i]);
    this.selected = i;
    this.waveStart = performance.now();
    this.refreshWaves();
    const target = this.stations[i],
      start = this.waveStart,
      lon = this.lon,
      lat = this.lat;
    const delta = ((target.lon - lon + 540) % 360) - 180,
      travel = Math.min(1, Math.abs(delta) / 90);
    const duration = 970 + 1050 * travel;
    this.flightEnd = this.reduced ? 0 : start + duration;
    this.arrivalAt = this.journey ? start + duration * 0.59 : 0;
    const step = (now) => {
      const t = this.reduced ? 1 : Math.min(1, (now - start) / duration);
      const e = t * t * t * (t * (t * 6 - 15) + 10);
      this.flightScale = 1 - 0.17 * travel * Math.sin(t * Math.PI) ** 2;
      this.rotate(lon + delta * e, lat + (target.lat - lat) * e);
      if (t < 1) this.frame = requestAnimationFrame(step);
    };
    step(start);
  }
  cancelFlight() {
    cancelAnimationFrame(this.frame);
    this.flightEnd = 0;
    this.flightScale = 1;
  }
  scale(factor) {
    this.zoom = Math.max(0.72, Math.min(1.65, this.zoom * factor));
    this.resize();
  }
  input() {
    const canvas = this.canvas;
    const pointers = new Map();
    let anchor,
      span = 0,
      vx = 0,
      vy = 0,
      lastMove = 0;
    const pairDistance = () => {
      const p = [...pointers.values()];
      return Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]);
    };
    function reset() {
      anchor = pointers.size === 1 ? [...pointers.values()][0] : null;
      span = pointers.size === 2 ? pairDistance() : 0;
    }
    canvas.onpointerdown = (e) => {
      if (e.button !== 0) return;
      this.cancelFlight();
      vx = vy = 0;
      lastMove = performance.now();
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      canvas.setPointerCapture(e.pointerId);
      reset();
    };
    canvas.onpointermove = (e) => {
      if (!pointers.has(e.pointerId)) return;
      this.exploring = true;
      this.onExplore?.();
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pointers.size === 2) {
        const distance = pairDistance();
        if (distance && span) this.scale(distance / span);
        span = distance;
      } else if (anchor) {
        const f = 68 / this.radius,
          dx = -(e.clientX - anchor[0]) * f,
          dy = (e.clientY - anchor[1]) * f,
          now = performance.now(),
          dt = Math.max(8, now - lastMove);
        vx = 0.55 * vx + (0.45 * dx) / dt;
        vy = 0.55 * vy + (0.45 * dy) / dt;
        lastMove = now;
        this.rotate(this.lon + dx, this.lat + dy);
        anchor = [e.clientX, e.clientY];
      }
    };
    canvas.onpointerup = (e) => {
      pointers.delete(e.pointerId);
      if (!pointers.size && this.exploring) {
        this.exploring = false;
        this.onExplore?.();
      }
      reset();
      if (pointers.size || this.reduced || performance.now() - lastMove > 75)
        return;
      const start = performance.now(),
        lon = this.lon,
        lat = this.lat,
        dx = Math.max(-22, Math.min(22, 180 * vx)),
        dy = Math.max(-18, Math.min(18, 180 * vy));
      if (Math.hypot(dx, dy) < 0.4) return;
      const coast = (now) => {
        const t = (now - start) / 160,
          e = 1 - Math.exp(-t);
        this.rotate(lon + dx * e, lat + dy * e);
        if (t < 4) this.frame = requestAnimationFrame(coast);
      };
      this.frame = requestAnimationFrame(coast);
    };
    canvas.onpointercancel = canvas.onlostpointercapture = (e) => {
      pointers.delete(e.pointerId);
      if (!pointers.size && this.exploring) {
        this.exploring = false;
        this.onExplore?.();
      }
      reset();
    };
    canvas.onwheel = (e) => {
      e.preventDefault();
      this.onExplore?.();
      this.scale(Math.exp(-Math.sign(e.deltaY) * 0.055));
    };
    canvas.onkeydown = (e) => {
      const keys = {
        ArrowLeft: [-9, 0],
        ArrowRight: [9, 0],
        ArrowUp: [0, 8],
        ArrowDown: [0, -8],
      };
      if (keys[e.key]) {
        e.preventDefault();
        this.cancelFlight();
        this.onExplore?.();
        this.rotate(this.lon + keys[e.key][0], this.lat + keys[e.key][1]);
      } else if (["+", "=", "-"].includes(e.key)) {
        e.preventDefault();
        this.onExplore?.();
        this.scale(e.key === "-" ? 0.9 : 1.1);
      }
    };
  }
}
