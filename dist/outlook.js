/* Where the window looks out, and how that place moves: a flight along the great circle when you
   drift, the dial when you hold Drift, the weather settling in on arrival, and the swells the
   music sends across the sea. Each frame it works out the light at that place and paints it. */
class Outlook {
  constructor(stations) {
    this.stations = stations;
    this.vectors = stations.map((s) => unitVector(s.lat, s.lon));
    this.sky = new Sky(document.getElementById('sky'));
    this.place = [0, 0, 1];
    this.weather = { ...CLEAR };
    this.weatherTarget = { ...CLEAR };
    this.swells = [];
    this.level = 0;
    this.reveal = 0;
    this.tone = 'dark';
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resize();
    new ResizeObserver(() => this.resize()).observe(document.documentElement);
  }

  get ok() {
    return Boolean(this.sky.gl);
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.portrait = w < 720 || w / h < 0.8;
    // The image is soft; one and a half pixels per point is enough, and spares phones.
    this.dprCap ??= 1.5;
    this.dpr = Math.min(devicePixelRatio || 1, this.dprCap);
    this.sky.canvas.width = Math.round(w * this.dpr);
    this.sky.canvas.height = Math.round(h * this.dpr);
    // The horizon, as a fraction of the height from the bottom: two parts sky to one part sea.
    this.horizon = document.body.classList.contains('poster') ? 0.36 : this.portrait ? 0.47 : h < 560 ? 0.42 : 0.44;
    document.documentElement.style.setProperty('--horizon', `${(1 - this.horizon) * 100}%`);
  }

  /** Renders fewer pixels when frames come slowly. */
  degrade() {
    if (this.dprCap <= 1) return;
    this.dprCap = 1;
    this.resize();
  }

  stand(i) {
    this.place = this.vectors[i];
    this.flight = null;
  }

  /** Flies to a station along the great circle; the sky on the way is the sky of each place passed.
      Returns the moment of landing. */
  fly(i) {
    const start = performance.now();
    const origin = this.place;
    const target = this.vectors[i];
    const angle = angleBetween(origin, target);
    const duration = this.reduced || angle < 0.001 ? 0 : 1500 + 2000 * Math.pow(angle / Math.PI, 0.7);
    this.flight = { origin, target, start, duration };
    this.wander = null;
    this.weatherTarget = { ...CLEAR };
    return start + duration;
  }

  /** How far through the current flight, 0 to 1, eased. */
  get progress() {
    const f = this.flight;
    if (!f) return 1;
    const t = f.duration ? clamp((performance.now() - f.start) / f.duration, 0, 1) : 1;
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  /** Turns the world past the window like a dial, along a heading chosen by chance. */
  startWander() {
    const p = this.place;
    const east = normalize([p[2], 0, -p[0]]);
    const north = cross(p, east);
    const a = Math.random() * Math.PI * 2;
    const heading = east.map((x, k) => x * Math.cos(a) + north[k] * Math.sin(a));
    this.wander = { axis: normalize(cross(p, heading)), start: performance.now(), speed: 0 };
    this.flight = null;
    this.weatherTarget = { ...CLEAR };
    this.passing = null;
  }

  stopWander() {
    this.wander = null;
    this.passing = null;
  }

  /** The station nearest the window's place, within reach in kilometres. */
  nearest(reach = Infinity) {
    let best = null;
    let bestAngle = reach / 6371;
    this.vectors.forEach((v, i) => {
      const angle = angleBetween(this.place, v);
      if (angle < bestAngle) {
        bestAngle = angle;
        best = i;
      }
    });
    return best;
  }

  /** A swell leaves the horizon and rolls toward you. */
  swell(strength) {
    if (this.reduced) return;
    this.swells.push({ z: 26, s: strength });
    if (this.swells.length > 6) this.swells.shift();
  }

  step(now, dt) {
    const f = this.flight;
    if (f) {
      this.place = slerp(f.origin, f.target, this.progress);
      if (now >= f.start + f.duration) this.flight = null;
    } else if (this.wander) {
      const w = this.wander;
      // The dial gathers speed for a moment, as a heavy knob would.
      const t = (now - w.start) / 1000;
      w.speed = (10 + 34 * smoothstep(0.1, 1.8, t)) * DEG;
      const turn = w.speed * dt;
      const k = w.axis;
      const p = this.place;
      const kp = cross(k, p);
      this.place = normalize(p.map((x, i) => x * Math.cos(turn) + kp[i] * Math.sin(turn)));
      const passing = this.nearest(260);
      if (passing !== this.passing) {
        this.passing = passing;
        if (passing !== null) this.onPass?.(passing, w.speed / (44 * DEG));
      }
    }
    // Weather settles in slowly, as it would through a window.
    const ease = Math.min(1, dt / 1.4);
    for (const key of ['cloud', 'rain', 'snow', 'fog']) this.weather[key] += (this.weatherTarget[key] - this.weather[key]) * ease;
    for (const swell of this.swells) {
      swell.z -= dt * (2.2 + swell.z * 0.55);
      swell.s *= Math.exp(-dt / 3);
    }
    this.swells = this.swells.filter((s) => s.z > 0.9 && s.s > 0.02);
  }

  frame(now, dt, sound) {
    this.step(now, dt);
    this.level += ((sound?.level ?? 0) - this.level) * Math.min(1, dt * 10);
    const light = lightAt(this.place);
    const [lat, lon] = latLon(this.place);
    // The window faces the sun by day and at dusk; at night, the moon if it is up. Bodies stand
    // at their true height and bearing, eighty degrees of horizon across the window.
    const moonUp = smoothstep(-3, 2, light.moonElevation);
    const toMoon = smoothstep(-6, -11, light.elevation) * moonUp;
    // Both stand a little right of centre, away from the caption.
    const facing = turnToward(light.azimuth - 13, light.moonAzimuth - 13, toMoon);
    const across = (azimuth) => 0.5 + (((azimuth - facing + 540) % 360) - 180) / 80;
    const height = (elevation) => (elevation / 50) * (1 - this.horizon);
    const sunY = height(light.elevation);
    const swells = new Float32Array(12);
    this.swells.forEach((s, k) => {
      swells[2 * k] = s.z;
      swells[2 * k + 1] = s.s;
    });
    // Whether the top of the window is light enough to need dark lettering.
    const top = mix(light.zenith, [0.55, 0.57, 0.6], this.weather.cloud * 0.6 * (1 - light.night));
    const luminance = 0.2126 * top[0] + 0.7152 * top[1] + 0.0722 * top[2];
    this.tone = luminance > 0.36 ? 'light' : luminance < 0.3 ? 'dark' : this.tone;
    this.sky.render({
      dpr: this.dpr,
      horizon: this.horizon,
      zenith: light.zenith,
      horizonColour: light.horizon,
      glow: light.glow,
      sunX: across(light.azimuth),
      sunY,
      moonX: across(light.moonAzimuth),
      moonY: height(light.moonElevation),
      // How much moonlight there is: the lit share of the disc, while it is above the horizon.
      moonLight: moonUp * light.moonLit,
      elongation: light.elongation,
      day: light.day,
      night: light.night,
      ...this.weather,
      time: now / 1000,
      level: this.level,
      // Clouds and stars belong to the place: they slide past as the window travels.
      seed: (lon / 360 + lat / 180 + 1) * 3.1,
      reveal: this.reveal,
      // On a phone the caption covers most of the sea, so more of it is kept calm.
      calm: this.portrait ? 0.8 : 0.55,
      swells,
    });
    return light;
  }
}

/** A compass bearing a share t of the way from a to b, turning the short way round. */
function turnToward(a, b, t) {
  const delta = ((b - a + 540) % 360) - 180;
  return a + delta * t;
}
