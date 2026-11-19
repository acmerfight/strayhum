/* Orthographic globe. The luminous surface, surface picking and great-circle routes share one rotation. */
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
    this.score = scoreForStation(station);
    this.shape = new Float32Array(this.score.shape);
    this.trail = 0;
    this.lon = station.lon + 16;
    this.lat = station.lat - 19;
    this.zoom = 1;
    this.rad = Math.PI / 180;
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.onSelect = onSelect;
    this.caption = document.querySelector("#surface-caption");
    this.caption.onclick = () => this.choose(this.hovered ?? this.selected);
    this.hovered = null;
    this.cityMembers = new Map();
    for (const [i, s] of stations.entries()) {
      const key = this.cityKey(s);
      if (!this.cityMembers.has(key)) this.cityMembers.set(key, []);
      this.cityMembers.get(key).push(i);
    }
    this.positions = stations.map((s) => {
      const lat = s.lat * this.rad,
        lon = s.lon * this.rad;
      return [
        Math.cos(lat) * Math.sin(lon),
        Math.sin(lat),
        Math.cos(lat) * Math.cos(lon),
      ];
    });
    this.overlay = document.querySelector("#waves");
    this.ctx = this.overlay.getContext("2d");
    this.energy = new Float32Array(3);
    this.time = 0;
    this.flowPush = 0;
    this.openness = 0.42;
    this.timbre = 0.5;
    this.flowTravel = 0;
    this.tint = 0;
    this.sphere = new SignalSphere(this.canvas, () => this.draw());
    this.flightScale = 1;
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
    this.drawCaption();
  }
  cityKey(s) {
    return s.country + "|" + s.city;
  }
  // Invert the orthographic projection. The nearest place is measured on
  // the sphere, so a click near the limb never picks a hidden station.
  nearest(x, y) {
    const px = (x - this.cx) / this.radius,
      py = (this.cy - y) / this.radius;
    const z2 = 1 - px * px - py * py;
    if (z2 < 0) return null;
    const z = Math.sqrt(z2),
      l = this.lon * this.rad,
      p = this.lat * this.rad;
    const sl = Math.sin(l),
      cl = Math.cos(l),
      sp = Math.sin(p),
      cp = Math.cos(p);
    const depth = z * cp - py * sp;
    const wx = px * cl + depth * sl,
      wy = py * cp + z * sp,
      wz = depth * cl - px * sl;
    let best = -Infinity,
      chosen = null;
    for (let i = 0; i < this.positions.length; i++) {
      const [a, b, c] = this.positions[i];
      const score = a * wx + b * wy + c * wz;
      if (score > best && (a * sl + c * cl) * cp + b * sp > 0.015) {
        best = score;
        chosen = i;
      }
    }
    return chosen;
  }
  hover(i) {
    if (this.hovered === i) return;
    this.hovered = i;
    this.drawCaption();
  }
  drawCaption() {
    const i = this.hovered ?? this.selected,
      s = this.stations[i];
    const [x, y, z] = this.project(s.lat, s.lon);
    const el = this.caption;
    el.hidden = z < 0.015;
    if (el.hidden) return;
    const discovering = this.hovered !== null;
    const count = this.cityMembers.get(this.cityKey(s)).length;
    const label = s.city + (discovering && count > 1 ? " · " + count : "");
    if (el.textContent !== label) el.textContent = label;
    const description =
      count > 1
        ? "Browse " + count + " stations in " + s.city
        : "Play " + s.name + " in " + s.city;
    if (el.getAttribute("aria-label") !== description)
      el.setAttribute("aria-label", description);
    el.classList.toggle("discovering", discovering);
    el.classList.toggle("inward", x > this.w - Math.min(170, this.w * 0.3));
    el.style.left = x + "px";
    el.style.top = y + "px";
  }
  choose(i) {
    if (i === null) return;
    const members = this.cityMembers.get(this.cityKey(this.stations[i]));
    this.hover(null);
    if (members.length === 1) this.onSelect(i);
    else this.onCluster(members);
  }
  rotate(lon, lat) {
    this.lon = ((((lon + 540) % 360) + 360) % 360) - 180;
    this.lat = Math.max(-84, Math.min(84, lat));
    this.draw();
  }
  drawWaves(now) {
    const c = this.ctx;
    if (!this.radius) return;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.w, this.h);
    this.drawJourney(now);
    // Without WebGL, one curved wash follows the same audio spring.
    if (
      !this.sphere.gl &&
      this.listening &&
      this.loudness > 0.015 &&
      !this.reduced
    ) {
      const s = this.stations[this.selected],
        [x, y, z] = this.project(s.lat, s.lon);
      if (z <= 0) return;
      const push = this.flowPush,
        travel = this.flowTravel;
      const extent =
        this.radius * (0.12 + 0.38 * this.openness + 0.11 * this.hold);
      const [snap, swing, sweep] = this.shape;
      const offset =
        this.radius *
        ((0.26 + 0.1 * snap - 0.17 * sweep) * push +
          (0.065 + 0.06 * swing) * Math.sin(travel) +
          0.24 * sweep * this.hold);
      const side = this.radius * swing * (this.trail - push) * 0.32;
      c.save();
      c.beginPath();
      c.arc(this.cx, this.cy, this.radius, 0, Math.PI * 2);
      c.clip();
      c.translate(x + offset * 0.85 + side, y - offset * 0.5 + side * 0.45);
      c.rotate(
        -0.51 +
          (0.14 + 0.25 * swing) * Math.sin(travel) +
          0.3 * sweep * this.hold +
          (this.timbre - 0.5) * 0.75,
      );
      c.scale(1.5 + 0.48 * sweep, 0.82 - 0.32 * snap + 0.17 * sweep);
      const halo = c.createRadialGradient(0, 0, 0, 0, 0, extent);
      halo.addColorStop(0, "rgba(110,184,178,.08)");
      halo.addColorStop(0.58, "rgba(197,218,196," + (0.12 + 0.26 * push) + ")");
      halo.addColorStop(1, "rgba(197,218,196,0)");
      c.fillStyle = halo;
      c.beginPath();
      c.moveTo(-extent, 0);
      c.bezierCurveTo(
        -0.4 * extent,
        -extent,
        extent,
        -0.75 * extent,
        0.92 * extent,
        0,
      );
      c.bezierCurveTo(
        0.58 * extent,
        0.6 * extent,
        -0.65 * extent,
        0.9 * extent,
        -extent,
        0,
      );
      c.fill();
      c.restore();
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
        const measured = responsive
          ? this.signal.sample(delta, this.score)
          : null;
        // Crossfade from the resting sculpture when audio becomes available.
        const opening = responsive ? this.signal.openness : 0.42;
        this.openness +=
          (opening - this.openness) * (1 - Math.exp(-delta / 0.48));
        this.timbre +=
          ((responsive ? this.signal.timbre : 0.5) - this.timbre) *
          (1 - Math.exp(-delta / 0.65));
        this.flowPush = responsive
          ? this.signal.displacement
          : this.flowPush * Math.exp(-delta * 5);
        for (let i = 0; i < 3; i++)
          this.shape[i] +=
            (this.score.shape[i] - this.shape[i]) *
            (1 - Math.exp(-delta / 0.38));
        this.trail +=
          (this.flowPush - this.trail) * (1 - Math.exp(-delta / 0.31));
        const [snap, swing, sweep] = this.shape;
        this.flowTravel +=
          delta *
          ((2.85 - 1.85 * snap - 2.1 * sweep) * this.flowPush +
            (responsive
              ? this.signal.level * (0.4 + 0.27 * swing) +
                this.signal.sustain * 0.72 * sweep
              : 0));
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
    this.listening = active;
    this.refreshWaves();
  }
  focus(i) {
    this.cancelFlight();
    this.journey = this.reduced
      ? null
      : this.stationRoute(this.stations[this.selected], this.stations[i]);
    this.hover(null);
    this.selected = i;
    this.score = scoreForStation(this.stations[i]);
    if (this.reduced) this.shape.set(this.score.shape);
    this.refreshWaves();
    const target = this.stations[i],
      start = performance.now(),
      lon = this.lon,
      lat = this.lat;
    const delta = ((target.lon - lon + 540) % 360) - 180,
      travel = Math.min(1, Math.abs(delta) / 90);
    const duration = 970 + 1050 * travel;
    this.flightEnd = this.reduced ? 0 : start + duration;
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
    let tapOrigin = null;
    const pick = (e) => {
      const bounds = canvas.getBoundingClientRect();
      const x = e.clientX - bounds.left,
        y = e.clientY - bounds.top;
      const station = this.stations[this.selected],
        [sx, sy, z] = this.project(station.lat, station.lon);
      if (z > 0.015 && Math.hypot(x - sx, y - sy) < (this.mobile ? 14 : 9))
        return this.selected;
      return this.nearest(x, y);
    };
    canvas.onpointerleave = (e) => {
      if (e.relatedTarget !== this.caption) this.hover(null);
    };
    this.caption.onpointerleave = (e) => {
      if (e.relatedTarget !== canvas) this.hover(null);
    };
    canvas.onblur = (e) => {
      if (e.relatedTarget !== this.caption) this.hover(null);
    };
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
      tapOrigin = pointers.size === 1 ? [e.clientX, e.clientY] : null;
      canvas.setPointerCapture(e.pointerId);
      reset();
    };
    canvas.onpointermove = (e) => {
      if (!pointers.has(e.pointerId)) {
        if (e.pointerType === "mouse") this.hover(pick(e));
        return;
      }
      if (
        tapOrigin &&
        Math.hypot(e.clientX - tapOrigin[0], e.clientY - tapOrigin[1]) < 6
      )
        return;
      tapOrigin = null;
      this.hover(null);
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
      if (!pointers.has(e.pointerId)) return;
      const tapped =
        tapOrigin &&
        Math.hypot(e.clientX - tapOrigin[0], e.clientY - tapOrigin[1]) < 6;
      tapOrigin = null;
      pointers.delete(e.pointerId);
      if (!pointers.size && this.exploring) {
        this.exploring = false;
        this.onExplore?.();
      }
      reset();
      if (tapped) {
        this.choose(pick(e));
        return;
      }
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
      tapOrigin = null;
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
      this.hover(null);
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
        this.hover(this.nearest(this.cx, this.cy));
        document.getElementById("keyboard-city").textContent =
          this.caption.getAttribute("aria-label");
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this.choose(this.hovered ?? this.nearest(this.cx, this.cy));
      } else if (["+", "=", "-"].includes(e.key)) {
        e.preventDefault();
        this.onExplore?.();
        this.scale(e.key === "-" ? 0.9 : 1.1);
      }
    };
  }
}
