/* The light at a place: where the sun stands for someone there right now, the colours of their
   sky, and how far their clock is from yours. Pure functions, shared by every other file. */
const DEG = Math.PI / 180;

function unitVector(lat, lon) {
  const a = lat * DEG;
  const b = lon * DEG;
  return [Math.cos(a) * Math.sin(b), Math.sin(a), Math.cos(a) * Math.cos(b)];
}

function latLon(v) {
  return [Math.asin(clamp(v[1], -1, 1)) / DEG, Math.atan2(v[0], v[2]) / DEG];
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

function mix(a, b, t) {
  return a.map((x, k) => x + (b[k] - x) * t);
}

function angleBetween(a, b) {
  return Math.acos(clamp(dot(a, b), -1, 1));
}

/** The point a fraction t of the way along the great circle from a to b. */
function slerp(a, b, t) {
  const angle = angleBetween(a, b);
  if (angle < 1e-6) return b;
  const s = Math.sin(angle);
  const u = Math.sin((1 - t) * angle) / s;
  const v = Math.sin(t * angle) / s;
  return [a[0] * u + b[0] * v, a[1] * u + b[1] * v, a[2] * u + b[2] * v];
}

/** The point on Earth where the sun is overhead at this moment, as a unit vector. */
function sunDirection(date) {
  const day = (date - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86400000;
  const declination = -23.44 * Math.cos(((2 * Math.PI) / 365) * (day + 10));
  const b = ((2 * Math.PI) / 364) * (day - 81);
  const equationOfTime = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  return unitVector(declination, -15 * (hours - 12 + equationOfTime / 60));
}

/** The point on Earth where the moon is overhead, as a unit vector (good to about a degree). */
function moonDirection(date) {
  const d = date / 86400000 - 10957.5;
  const L = (218.316 + 13.176396 * d) * DEG;
  const M = (134.963 + 13.064993 * d) * DEG;
  const F = (93.272 + 13.22935 * d) * DEG;
  const lambda = L + 6.289 * DEG * Math.sin(M);
  const beta = 5.128 * DEG * Math.sin(F);
  const e = 23.4397 * DEG;
  const ra = Math.atan2(Math.sin(lambda) * Math.cos(e) - Math.tan(beta) * Math.sin(e), Math.cos(lambda));
  const dec = Math.asin(Math.sin(beta) * Math.cos(e) + Math.cos(beta) * Math.sin(e) * Math.sin(lambda));
  const sidereal = (280.16 + 360.9856235 * d) * DEG;
  return unitVector(dec / DEG, (ra - sidereal) / DEG);
}

/** Height above the horizon and compass bearing, in degrees, of a body overhead at `body`. */
function altAz(place, body) {
  const east = normalize([place[2], 0, -place[0]]);
  const north = cross(place, east);
  return [Math.asin(clamp(dot(body, place), -1, 1)) / DEG, Math.atan2(dot(body, east), dot(body, north)) / DEG];
}

/** Height of the sun above the horizon, in degrees, for someone standing at a point. */
function sunElevation(place, date) {
  return Math.asin(clamp(dot(sunDirection(date), place), -1, 1)) / DEG;
}

// The sky by the sun's height, from deep night through the blue hour and dusk to full day.
// Each stop: elevation, zenith colour, horizon colour, light around the sun.
const SKY = [
  [-90, [0.012, 0.017, 0.036], [0.034, 0.044, 0.075], [0, 0, 0]],
  [-18, [0.016, 0.023, 0.048], [0.048, 0.06, 0.098], [0.0, 0.0, 0.0]],
  [-11, [0.022, 0.034, 0.078], [0.08, 0.094, 0.165], [0.06, 0.05, 0.1]],
  [-6, [0.04, 0.06, 0.15], [0.2, 0.17, 0.3], [0.28, 0.16, 0.22]],
  [-2.5, [0.08, 0.12, 0.27], [0.62, 0.34, 0.3], [0.62, 0.3, 0.18]],
  [0.5, [0.16, 0.25, 0.45], [0.92, 0.55, 0.32], [0.95, 0.6, 0.3]],
  [5, [0.27, 0.4, 0.58], [0.93, 0.76, 0.56], [1.0, 0.86, 0.6]],
  // Day is pale and full of air, never the saturated blue of a screen.
  [14, [0.38, 0.52, 0.68], [0.84, 0.85, 0.84], [1.0, 0.95, 0.86]],
  [40, [0.4, 0.55, 0.71], [0.82, 0.86, 0.88], [1.0, 0.97, 0.92]],
  [90, [0.38, 0.54, 0.72], [0.8, 0.85, 0.88], [1.0, 0.98, 0.94]],
];

/** The colours of the sky for a sun at this elevation. */
function skyColours(elevation) {
  for (let k = 1; k < SKY.length; k++) {
    const [e1, z1, h1, g1] = SKY[k];
    if (elevation <= e1) {
      const [e0, z0, h0, g0] = SKY[k - 1];
      const t = (elevation - e0) / (e1 - e0);
      const s = t * t * (3 - 2 * t);
      return { zenith: mix(z0, z1, s), horizon: mix(h0, h1, s), glow: mix(g0, g1, s) };
    }
  }
  const [, z, h, g] = SKY.at(-1);
  return { zenith: z, horizon: h, glow: g };
}

/** Everything the window needs to paint the sky over a point on Earth right now: the sun, and
    the moon with how much of it is lit. */
function lightAt(place, date = new Date()) {
  const sun = sunDirection(date);
  const moon = moonDirection(date);
  const [elevation, azimuth] = altAz(place, sun);
  const [moonElevation, moonAzimuth] = altAz(place, moon);
  const elongation = angleBetween(sun, moon);
  return {
    elevation,
    azimuth,
    moonElevation,
    moonAzimuth,
    elongation,
    moonLit: (1 - Math.cos(elongation)) / 2,
    ...skyColours(elevation),
    night: clamp((-elevation - 5) / 9, 0, 1),
    day: clamp(elevation / 20, 0, 1),
  };
}

const offsetFormats = new Map();

/** Minutes the zone is ahead of UTC at this moment. */
function zoneOffset(zone, date = new Date()) {
  if (!offsetFormats.has(zone)) offsetFormats.set(zone, new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' }));
  const name = offsetFormats.get(zone).formatToParts(date).find((p) => p.type === 'timeZoneName')?.value || 'GMT';
  const m = name.match(/GMT([+-])(\d{2}):(\d{2})/);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

/** "9 hours ahead of you", "3½ hours behind you", "the same time as you". */
function timeFromYou(zone, date = new Date()) {
  const minutes = zoneOffset(zone, date) + date.getTimezoneOffset();
  if (Math.abs(minutes) < 15) return 'the same time as you';
  const hours = Math.abs(minutes) / 60;
  const whole = Math.floor(hours);
  const half = hours - whole >= 0.5 ? '½' : '';
  const amount = whole === 1 && !half ? 'an hour' : whole === 0 ? 'half an hour' : `${whole}${half} hours`;
  return `${amount} ${minutes > 0 ? 'ahead of' : 'behind'} you`;
}

/** Great-circle distance in kilometres. */
function kilometres(a, b) {
  return angleBetween(a, b) * 6371;
}
