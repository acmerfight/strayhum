/* The view from the station: the real land around it under the real sky right now, and, on long
   drifts, the Earth turning below as the camera crosses to the next place.

   On the ground: terrain from elevation tiles (Mapzen terrarium, AWS open data) within ~400 km,
   bent with the Earth's curvature; the sea only where the sea is; the sky from the Preetham model
   for the sun's true position, with the moon in its phase, stars and the station's weather; at
   night the towns' lights from NASA's Black Marble. From orbit: the whole Earth with its true
   terminator and city lights.

   Built with three.js into dist/landscape.js (npm run build). Uses the globals of daylight.js and
   weather.js; exposes window.Outlook to app.js. */
import * as THREE from 'three';

const EARTH = 6371000;
const SEA = -6; // A little below zero, so polders stay land.
const EYE = 180; // Metres above the ground: a rooftop on the edge of town.
const TERRAIN = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const LIGHTS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png';
// The colour of the ground in this month: Blue Marble Next Generation, cloud-free monthly composites.
const GROUND = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/2004-{month}-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg';

/* Shared GLSL: the sky's radiance in any direction. Preetham daylight (after three.js Sky, MIT),
   a night sky lit by the moon and by the town, and the haze that distance adds. */
const SKY_GLSL = /* glsl */ `
uniform vec3 sunDir;
uniform vec3 moonDir;
uniform vec3 betaR;
uniform vec3 betaM;
uniform float sunE;
uniform float mieG;
uniform float night;
uniform float moonLight;
uniform float townGlow;
uniform float blueHour;

const float PI = 3.141592653589793;

float rayleighPhase(float c) { return 0.05968310365946075 * (1.0 + c * c); }
float hgPhase(float c, float g) {
  float g2 = g * g;
  return 0.07957747154594767 * (1.0 - g2) / pow(1.0 - 2.0 * g * c + g2, 1.5);
}

vec3 extinction(vec3 dir) {
  float zen = acos(max(0.0, dir.y));
  float inv = 1.0 / (cos(zen) + 0.15 * pow(93.885 - zen * 180.0 / PI, -1.253));
  return exp(-(betaR * 8.4e3 * inv + betaM * 1.25e3 * inv));
}

// Radiance of the sky without the discs of the sun and moon, in scene units.
vec3 skyRadiance(vec3 dir) {
  vec3 fex = extinction(dir);
  float c = dot(dir, sunDir);
  vec3 scatter = (betaR * rayleighPhase(c * 0.5 + 0.5) + betaM * hgPhase(c, mieG)) / (betaR + betaM);
  vec3 lin = pow(sunE * scatter * (1.0 - fex), vec3(1.5));
  lin *= mix(vec3(1.0), pow(sunE * scatter * fex, vec3(0.5)), clamp(pow(1.0 - sunDir.y, 5.0), 0.0, 1.0));
  vec3 col = (lin + vec3(0.1) * fex) * 0.04 + vec3(0.0, 0.0003, 0.00075);
  // Night: a deep blue that the moon brightens and the town warms near the horizon.
  float up = max(dir.y, 0.0);
  vec3 dark = mix(vec3(0.0022, 0.003, 0.0068), vec3(0.0011, 0.0016, 0.0042), sqrt(up));
  float mc = max(dot(dir, moonDir), 0.0);
  dark += moonLight * (vec3(0.004, 0.0062, 0.012) + vec3(0.006, 0.007, 0.009) * pow(mc, 24.0));
  dark += townGlow * vec3(0.009, 0.005, 0.0022) * exp(-up * 16.0);
  // The blue hour: after sunset the whole sky holds a deep blue, warmer toward where the sun went.
  float towardSun = max(dot(normalize(vec3(dir.x, 0.0, dir.z) + 1e-4), normalize(vec3(sunDir.x, 0.0, sunDir.z) + 1e-4)), 0.0);
  vec3 blue = mix(vec3(0.012, 0.02, 0.05), vec3(0.03, 0.026, 0.04), pow(towardSun, 3.0) * exp(-up * 5.0)) * mix(1.0, 0.55, sqrt(up));
  return col + dark * night + blue * blueHour;
}
`;

const COMMON_VERTEX = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
`;

/* The dome: the sky, the sun's disc, the moon in its phase, the stars, the clouds. ------------- */

const DOME_VERTEX = /* glsl */ `
varying vec3 vDir;
${COMMON_VERTEX}
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}`;

const NOISE_GLSL = /* glsl */ `
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float hash3(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
`;

const DOME_FRAGMENT = /* glsl */ `
varying vec3 vDir;
uniform float elongation;
uniform float cloud;
uniform float time;
uniform float seed;
uniform float starScale;
${SKY_GLSL}
${NOISE_GLSL}
#include <logdepthbuf_pars_fragment>

void main() {
  #include <logdepthbuf_fragment>
  vec3 dir = normalize(vDir);
  vec3 col = skyRadiance(dir);
  float up = max(dir.y, 0.0);

  // Stars, where it is dark; the moon washes out the faint ones.
  vec3 cell = floor(dir * starScale);
  float h = hash3(cell + seed);
  if (h > 0.9965 && dir.y > -0.02) {
    vec3 centre = (cell + 0.5 + (vec3(hash3(cell + 3.1), hash3(cell + 7.3), hash3(cell + 1.7)) - 0.5) * 0.6) / starScale;
    float d = length(normalize(centre) - dir) * starScale;
    float bright = pow((h - 0.9965) / 0.0035, 2.0) * 0.06 + 0.006;
    float twinkle = 0.75 + 0.25 * sin(time * (1.3 + 3.0 * hash3(cell + 9.0)) + h * 80.0);
    col += vec3(0.82, 0.86, 1.0) * exp(-d * d * 9.0) * bright * twinkle * night * (1.0 - 0.6 * moonLight) * smoothstep(0.0, 0.08, dir.y);
  }

  // The sun's disc, a little larger than life, and its glow.
  float cs = dot(dir, sunDir);
  vec3 sunCol = sunE * extinction(sunDir) * 0.04;
  col += sunCol * (smoothstep(0.99996, 0.99999, cs) * 30.0 + pow(max(cs, 0.0), 900.0) * 0.6);

  // The moon in its true phase: the lit limb faces the sun.
  float cm = dot(dir, moonDir);
  float radius = 0.0105;
  if (cm > cos(radius * 1.3) && moonDir.y > -0.02) {
    vec3 right = normalize(cross(moonDir, vec3(0.0, 1.0, 0.0)));
    vec3 upv = cross(right, moonDir);
    vec2 q = vec2(dot(dir - moonDir, right), dot(dir - moonDir, upv)) / radius;
    float r = length(q);
    vec3 n = vec3(q, sqrt(max(0.0, 1.0 - r * r)));
    vec3 toSun = normalize(vec3(dot(sunDir, right), dot(sunDir, upv), -cos(elongation)));
    float lit = smoothstep(-0.05, 0.08, dot(n, toSun));
    float mottled = 0.82 + 0.18 * noise(q * 2.6 + 4.0);
    vec3 surface = vec3(0.09, 0.088, 0.082) * lit * mottled * mix(1.0, 0.5, 1.0 - night) + vec3(0.0006, 0.0008, 0.0014);
    col = mix(col, surface, smoothstep(1.0, 0.94, r));
  }

  // Clouds on a plane two kilometres up: lit by the sky, slate at night, warm underneath near town.
  if (dir.y > 0.0 && cloud > 0.01) {
    vec2 p = dir.xz / (dir.y + 0.06) * 0.9 + vec2(time * 0.006 + seed * 7.0, seed * 3.0);
    float shape = fbm(p * 1.6);
    float cover = smoothstep(1.02 - cloud * 0.95, 1.28 - cloud * 0.95, shape + cloud * 0.32) * smoothstep(0.0, 0.06, dir.y);
    vec3 lit = sunCol * (0.25 + 0.35 * pow(max(cs, 0.0), 6.0)) + skyRadiance(vec3(0.0, 1.0, 0.0)) * 1.4;
    lit *= 0.75 + 0.35 * fbm(p * 4.0 + 3.0);
    vec3 under = vec3(0.0024, 0.0028, 0.0038) + townGlow * vec3(0.006, 0.0036, 0.0016) * exp(-up * 6.0) + moonLight * vec3(0.003, 0.0034, 0.0042);
    vec3 tone = mix(lit, under, night);
    col = mix(col, mix(col, tone, extinction(dir).g * 0.6 + 0.4), cover * 0.94);
    col = mix(col, tone * 0.9 + skyRadiance(dir) * 0.15, smoothstep(0.8, 1.0, cloud) * 0.75);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/* The land: albedo by height, slope and latitude; lit by the sun, sky and moon; the towns' lights
   at night; distance fades it into the sky behind. ---------------------------------------------- */

const LAND_VERTEX = /* glsl */ `
attribute vec2 lightUv;
attribute float height;
varying vec2 vLightUv;
varying float vHeight;
varying vec3 vNormal;
varying vec3 vWorld;
${COMMON_VERTEX}
void main() {
  vLightUv = lightUv;
  vHeight = height;
  vNormal = normal;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
  #include <logdepthbuf_vertex>
}`;

const HAZE_GLSL = /* glsl */ `
uniform float haze;
uniform float level;
uniform float rings[6];
// Distance fades into the sky as seen just above that direction.
vec3 aerial(vec3 col, vec3 world, out float through) {
  vec3 v = world - cameraPosition;
  float d = length(v);
  vec3 dir = v / d;
  through = exp(-d * haze);
  vec3 behind = skyRadiance(normalize(vec3(dir.x, max(dir.y, 0.012), dir.z)));
  return mix(behind, col, through);
}
// Music spreads out from where you stand in rings.
float ringAt(float d) {
  float s = 0.0;
  for (int i = 0; i < 6; i++) {
    float r = rings[i];
    if (r <= 0.0) continue;
    s += exp(-pow((d - r) / (60.0 + r * 0.06), 2.0)) * (1.0 - r / 14000.0);
  }
  return clamp(s, 0.0, 1.0);
}
`;

const LAND_FRAGMENT = /* glsl */ `
varying vec2 vLightUv;
varying float vHeight;
varying vec3 vNormal;
varying vec3 vWorld;
uniform sampler2D lights;
uniform sampler2D groundColour;
uniform vec4 hole;
uniform float latitude;
uniform float time;
uniform float pixelAngle;
${SKY_GLSL}
${NOISE_GLSL}
${HAZE_GLSL}
#include <logdepthbuf_pars_fragment>

void main() {
  #include <logdepthbuf_fragment>
  // A finer mesh covers this square: leave it to that one.
  if (vWorld.x > hole.x && vWorld.x < hole.z && vWorld.z > hole.y && vWorld.z < hole.w) discard;
  vec3 n = normalize(vNormal);
  float slope = 1.0 - n.y;
  float fine = noise(vWorld.xz / 900.0) * 0.6 + noise(vWorld.xz / 140.0) * 0.4;
  // The ground's own colour this month, as seen from space, quietened a little; rock shows on steep ground.
  bool inside = vLightUv.x > 0.0 && vLightUv.x < 1.0 && vLightUv.y > 0.0 && vLightUv.y < 1.0;
  // Beyond the imagery, far out in the haze, a neutral ground.
  vec3 satellite = inside ? texture2D(groundColour, vLightUv).rgb : vec3(0.1, 0.1, 0.09);
  vec3 albedo = mix(vec3(dot(satellite, vec3(0.3, 0.59, 0.11))), satellite, 0.78) * 1.15;
  albedo *= 0.86 + 0.28 * fine;
  albedo = mix(albedo, vec3(0.16, 0.155, 0.15) * (0.85 + 0.3 * fine), smoothstep(0.35, 0.7, slope) * 0.5 * (1.0 - smoothstep(0.35, 0.6, albedo.b)));

  vec3 sunLight = sunE * extinction(sunDir) * 0.04 * 0.32 * max(dot(n, sunDir), 0.0);
  vec3 ambient = skyRadiance(vec3(0.0, 1.0, 0.0)) * 2.4 * (0.6 + 0.4 * n.y);
  vec3 moon = vec3(0.0018, 0.0022, 0.003) * moonLight * max(dot(n, moonDir), 0.0) * night;
  vec3 col = albedo * (sunLight + ambient + moon);

  // The towns: light the satellites see, broken into points on the ground, breathing with the music.
  float glow = 0.0;
  if (vLightUv.x > 0.0 && vLightUv.x < 1.0 && vLightUv.y > 0.0 && vLightUv.y < 1.0) {
    vec3 t = texture2D(lights, vLightUv).rgb;
    glow = clamp(((t.r * 0.6 + t.g * 0.4) - t.b * 0.92) * 255.0 / 150.0, 0.0, 1.0);
  }
  float d = distance(vWorld, cameraPosition);
  // Each lamp is a point a pixel or two across; where points would crowd under a pixel, their
  // light is drawn as the glow the satellite saw.
  float cellSize = 42.0;
  vec2 cell = floor(vWorld.xz / cellSize);
  vec2 centre = (cell + 0.2 + 0.6 * vec2(hash(cell + 1.3), hash(cell + 3.7))) * cellSize;
  float px = d * pixelAngle;
  float lamp = smoothstep(px * 1.4, px * 0.35, length(vWorld.xz - centre)) * step(1.0 - glow * 0.9, hash(cell));
  lamp *= 0.7 + 0.3 * sin(time * (0.6 + hash(cell + 2.0)) + hash(cell) * 40.0);
  float spread = mix(lamp * 3.0, glow * 0.5, smoothstep(0.12, 0.45, px / cellSize));
  float pulse = 1.0 + level * 0.7 + ringAt(d) * 2.5;
  vec3 lamps = mix(vec3(1.0, 0.56, 0.24), vec3(1.0, 0.86, 0.66), hash(cell + 5.0)) * spread * 0.08 * pulse * smoothstep(0.05, 0.6, night);

  float through;
  col = aerial(col, vWorld, through);
  col += lamps * mix(through, 1.0, 0.55);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/* The sea: the sky reflected, the sun's and moon's paths broken into glints by the swell. ------ */

const SEA_VERTEX = /* glsl */ `
varying vec3 vWorld;
${COMMON_VERTEX}
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
  #include <logdepthbuf_vertex>
}`;

const SEA_FRAGMENT = /* glsl */ `
varying vec3 vWorld;
uniform float time;
uniform float elongation;
${SKY_GLSL}
${NOISE_GLSL}
${HAZE_GLSL}
#include <logdepthbuf_pars_fragment>

vec2 waves(vec2 p) {
  vec2 g = vec2(0.0);
  g += (vec2(noise(p * 0.11 + vec2(time * 0.05, 0.0)), noise(p * 0.11 + vec2(9.0, time * 0.04))) - 0.5) * 0.5;
  g += (vec2(noise(p * 0.5 - vec2(0.0, time * 0.3)), noise(p * 0.5 + vec2(4.0, time * 0.25))) - 0.5) * 0.35;
  g += (vec2(noise(p * 2.1 + vec2(time * 0.9, 1.0)), noise(p * 2.1 - vec2(2.0, time * 0.8))) - 0.5) * 0.18;
  return g;
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 v = normalize(vWorld - cameraPosition);
  float d = distance(vWorld, cameraPosition);
  // Ripples fade with distance so the far sea lies flat and quiet.
  vec2 g = waves(vWorld.xz / 6.0) * (0.12 + 0.3 * exp(-d / 3000.0));
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 r = reflect(v, n);
  r.y = abs(r.y);
  float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(-v, n), 0.0), 5.0);
  vec3 deep = vec3(0.004, 0.009, 0.013) * (skyRadiance(vec3(0.0, 1.0, 0.0)).b * 60.0 + 0.05);
  vec3 col = mix(deep, skyRadiance(r), fresnel);
  float glint = pow(max(dot(r, sunDir), 0.0), 600.0) * (1.0 + 2.5 * level);
  col += sunE * extinction(sunDir) * 0.04 * glint * 1.6;
  float moonGlint = pow(max(dot(r, moonDir), 0.0), 500.0) * moonLight * night;
  col += vec3(0.05, 0.055, 0.065) * moonGlint * (1.0 + 2.0 * level);
  col += mix(vec3(0.004), vec3(0.03, 0.024, 0.016), 1.0 - night) * ringAt(d) * 0.6;
  float through;
  col = aerial(col, vWorld, through);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/* Overlay: the veil you pass through between places, rain and snow, grain and vignette. ------ */

const OVERLAY_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const OVERLAY_FRAGMENT = /* glsl */ `
varying vec2 vUv;
uniform vec2 res;
uniform float time;
uniform float veil;
uniform vec3 veilColour;
uniform float rain;
uniform float snow;
${NOISE_GLSL}
void main() {
  float aspect = res.x / res.y;
  vec3 add = vec3(0.0);
  if (rain > 0.0) {
    vec2 q = vec2(vUv.x * aspect * 90.0 + vUv.y * 18.0, vUv.y * 2.2 + time * 2.6);
    float column = floor(q.x);
    float y = fract(q.y + hash(vec2(column, 1.0)) * 9.0);
    float drop = step(0.9, hash(vec2(column, floor(q.y + hash(vec2(column, 1.0)) * 9.0)))) * smoothstep(0.0, 0.3, y) * smoothstep(1.0, 0.55, y);
    add += vec3(0.7, 0.75, 0.82) * drop * smoothstep(0.5, 0.0, abs(fract(q.x) - 0.5) * 2.0) * rain * 0.07;
  }
  if (snow > 0.0) {
    vec2 q = vec2(vUv.x * aspect * 26.0 + sin(time * 0.3 + vUv.y * 6.0) * 0.4, vUv.y * 26.0 + time * 1.2);
    vec2 cell = floor(q);
    vec2 f = fract(q) - 0.5 - (vec2(hash(cell), hash(cell + 2.0)) - 0.5) * 0.6;
    add += vec3(0.9) * smoothstep(0.09, 0.03, length(f)) * step(0.6, hash(cell + 5.0)) * snow * 0.3;
  }
  // Grain, so the image reads as a print rather than a render.
  add += (hash(gl_FragCoord.xy + fract(time) * 100.0) - 0.5) * 0.018;
  vec2 c = vUv - 0.5;
  float vignette = dot(c, c) * 0.42;
  // Premultiplied: rain and grain add light, the veil and the vignette cover what is behind.
  gl_FragColor = vec4(veil * veilColour + (1.0 - veil) * add, clamp(veil + vignette * (1.0 - veil), 0.0, 1.0));
}`;

/* The Earth from orbit: the day side in its colours, the night side in its lights, the air. --- */

const EARTH_VERTEX = /* glsl */ `
varying vec3 vNormal;
varying vec3 vWorld;
${COMMON_VERTEX}
void main() {
  vNormal = normalize(position);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
  #include <logdepthbuf_vertex>
}`;

const EARTH_FRAGMENT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vWorld;
uniform sampler2D day;
uniform sampler2D lightsMap;
uniform vec3 sun;
uniform float level;
#include <logdepthbuf_pars_fragment>
const float PI = 3.141592653589793;
void main() {
  #include <logdepthbuf_fragment>
  vec3 n = normalize(vNormal);
  vec2 uv = vec2(atan(n.x, n.z) / (2.0 * PI) + 0.5, asin(clamp(n.y, -1.0, 1.0)) / PI + 0.5);
  vec3 albedo = texture2D(day, uv).rgb;
  // Quieter than the satellite image: colour drawn down toward its grey.
  albedo = mix(vec3(dot(albedo, vec3(0.3, 0.59, 0.11))), albedo, 0.62) * 0.9;
  float lit = dot(n, sun);
  float dayside = smoothstep(-0.08, 0.18, lit);
  vec3 v = normalize(vWorld - cameraPosition);
  float rim = pow(1.0 - max(dot(-v, n), 0.0), 3.0);
  vec3 col = albedo * max(lit, 0.0) * 1.15 * dayside;
  col += vec3(0.25, 0.42, 0.75) * rim * 0.35 * smoothstep(-0.2, 0.4, lit);
  // Dusk along the terminator.
  col += vec3(0.6, 0.28, 0.1) * exp(-pow(lit / 0.07, 2.0)) * 0.12;
  float lights = texture2D(lightsMap, uv).r;
  col += vec3(1.0, 0.62, 0.3) * pow(lights, 1.3) * (1.0 - smoothstep(-0.12, 0.08, lit)) * (0.55 + 0.25 * level);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const AIR_FRAGMENT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vWorld;
uniform vec3 sun;
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  vec3 n = normalize(vNormal);
  vec3 v = normalize(vWorld - cameraPosition);
  float edge = pow(1.0 - abs(dot(v, n)), 6.0);
  float lit = smoothstep(-0.25, 0.4, dot(n, sun));
  gl_FragColor = vec4(vec3(0.32, 0.55, 1.0) * edge * lit * 1.4, edge * lit);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/* Geography ---------------------------------------------------------------------------------- */

function mercator(lat, lon, z) {
  const s = 2 ** z;
  const r = (lat * Math.PI) / 180;
  return [((lon + 180) / 360) * s, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * s];
}

function unmercator(x, y, z) {
  const s = 2 ** z;
  return [(Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / s))) * 180) / Math.PI, (x / s) * 360 - 180];
}

/** A local frame at a station: east, up and north, with three.js's z pointing south. */
function frameAt(lat, lon) {
  const up = unitVector(lat, lon);
  const east = normalize([Math.cos((lon * Math.PI) / 180), 0, -Math.sin((lon * Math.PI) / 180)]);
  const north = cross(up, east);
  return { up, east, north };
}

function toLocal(frame, lat, lon, height) {
  const p = unitVector(lat, lon).map((x) => x * (EARTH + height));
  const d = [p[0] - frame.up[0] * EARTH, p[1] - frame.up[1] * EARTH, p[2] - frame.up[2] * EARTH];
  return [dot(d, frame.east), dot(d, frame.up), -dot(d, frame.north)];
}

/** A compass bearing and height as a direction in the local frame. */
function bearing(azimuth, elevation) {
  const a = (azimuth * Math.PI) / 180;
  const e = (elevation * Math.PI) / 180;
  return new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), -Math.cos(e) * Math.cos(a));
}

async function image(url) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  await img.decode();
  return img;
}

/** A square of tiles stitched into one canvas, or null for tiles that failed. */
async function mosaic(template, z, x0, y0, n) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = n * 256;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const max = 2 ** z;
  await Promise.all(
    Array.from({ length: n * n }, async (_, k) => {
      const tx = (((x0 + (k % n)) % max) + max) % max;
      const ty = Math.min(max - 1, Math.max(0, y0 + Math.floor(k / n)));
      try {
        ctx.drawImage(await image(template.replace('{z}', z).replace('{x}', tx).replace('{y}', ty)), (k % n) * 256, Math.floor(k / n) * 256, 256, 256);
      } catch {
        // A missing tile stays empty: flat land, or no lights.
      }
    }),
  );
  return canvas;
}

function canvasTexture(canvas, colour) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;
  texture.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = 8;
  return texture;
}

/** The square a mesh covers, in local metres, a little inset so meshes overlap at the seam. */
function footprint(mesh) {
  const box = new THREE.Box3().setFromBufferAttribute(mesh.geometry.attributes.position);
  const inset = (box.max.x - box.min.x) * 0.03;
  return new THREE.Vector4(box.min.x + inset, box.min.z + inset, box.max.x - inset, box.max.z - inset);
}

async function heights(z, x0, y0, n) {
  const canvas = await mosaic(TERRAIN, z, x0, y0, n);
  const px = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  const out = new Float32Array(canvas.width * canvas.height);
  for (let i = 0; i < out.length; i++) {
    const a = px[4 * i + 3];
    const h = a ? px[4 * i] * 256 + px[4 * i + 1] + px[4 * i + 2] / 256 - 32768 : 0;
    // At fine zooms the tiles give the open sea as exactly zero; it belongs under the water.
    out[i] = h === 0 ? -40 : h;
  }
  despike(out, canvas.width);
  return { data: out, size: canvas.width, z, x0, y0 };
}

/** Elevation data has the odd void filled with a wild value; a point far above or below all
    its neighbours is replaced by their mean. */
function despike(d, s) {
  for (let y = 1; y < s - 1; y++) {
    for (let x = 1; x < s - 1; x++) {
      const i = y * s + x;
      let lo = Infinity;
      let hi = -Infinity;
      let sum = 0;
      for (const j of [i - 1, i + 1, i - s, i + s, i - s - 1, i - s + 1, i + s - 1, i + s + 1]) {
        lo = Math.min(lo, d[j]);
        hi = Math.max(hi, d[j]);
        sum += d[j];
      }
      if (d[i] > hi + 120 || d[i] < lo - 120) d[i] = sum / 8;
    }
  }
}

function sampleHeight(map, x, y) {
  const fx = Math.min(map.size - 1.001, Math.max(0, (x - map.x0) * 256 - 0.5));
  const fy = Math.min(map.size - 1.001, Math.max(0, (y - map.y0) * 256 - 0.5));
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = fx - ix;
  const ty = fy - iy;
  const d = map.data;
  const s = map.size;
  const a = d[iy * s + ix] * (1 - tx) + d[iy * s + ix + 1] * tx;
  const b = d[(iy + 1) * s + ix] * (1 - tx) + d[(iy + 1) * s + ix + 1] * tx;
  return a * (1 - ty) + b * ty;
}

/** A grid mesh over a square of tiles, its vertices placed on the curved Earth. */
function landGrid(map, frame, region, segments, material) {
  const n = segments + 1;
  const span = map.size / 256;
  const positions = new Float32Array(n * n * 3);
  const heightAttr = new Float32Array(n * n);
  const lightUv = new Float32Array(n * n * 2);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = map.x0 + (i / segments) * span;
      const y = map.y0 + (j / segments) * span;
      const [lat, lon] = unmercator(x, y, map.z);
      const h = sampleHeight(map, x, y);
      const k = j * n + i;
      positions.set(toLocal(frame, lat, lon, h), 3 * k);
      heightAttr[k] = h;
      const scale = 2 ** (region.z - map.z);
      lightUv[2 * k] = (x * scale - region.x0) / region.n;
      lightUv[2 * k + 1] = (y * scale - region.y0) / region.n;
    }
  }
  const index = [];
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * n + i;
      index.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('height', new THREE.BufferAttribute(heightAttr, 1));
  geometry.setAttribute('lightUv', new THREE.BufferAttribute(lightUv, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

/** The sea around a station, out to beyond the horizon, on the curve of the Earth. */
function seaDisc(frame, lat, lon, material) {
  const rings = 90;
  const sectors = 160;
  const positions = [];
  const index = [];
  const centre = unitVector(lat, lon);
  const east = frame.east;
  const north = frame.north;
  for (let r = 0; r <= rings; r++) {
    const distance = r === 0 ? 0 : 20 * Math.pow(1.105, r);
    const angle = distance / EARTH;
    for (let s = 0; s < sectors; s++) {
      const a = (s / sectors) * Math.PI * 2;
      const dir = east.map((e, k) => e * Math.sin(a) + north[k] * Math.cos(a));
      const p = centre.map((c, k) => c * Math.cos(angle) + dir[k] * Math.sin(angle));
      const [plat, plon] = latLon(p);
      positions.push(...toLocal(frame, plat, plon, SEA));
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < sectors; s++) {
      const a = r * sectors + s;
      const b = r * sectors + ((s + 1) % sectors);
      index.push(a, a + sectors, b, b, a + sectors, b + sectors);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  return new THREE.Mesh(geometry, material);
}

/** Everything that belongs to one station's view, loaded once and kept for a while. */
class Place {
  constructor(station, materials) {
    this.station = station;
    this.frame = frameAt(station.lat, station.lon);
    this.group = new THREE.Group();
    this.ready = this.load(materials);
  }

  async load(materials) {
    const s = this.station;
    const at = (z) => mercator(s.lat, s.lon, z);
    const square = (z, n) => [Math.round(at(z)[0]) - n / 2, Math.round(at(z)[1]) - n / 2];
    const [lx, ly] = at(8);
    const region = { z: 8, x0: Math.floor(lx) - 1, y0: Math.floor(ly) - 1, n: 3 };
    const month = String(new Date().getUTCMonth() + 1).padStart(2, '0');
    // Three rings of land: fine near the eye, coarser out to the mountains on the horizon.
    const [close, near, mid, far, lightsCanvas, groundCanvas] = await Promise.all([
      heights(13, ...square(13, 4), 4),
      heights(11, ...square(11, 6), 6),
      heights(9, ...square(9, 4), 4),
      heights(7, ...square(7, 4), 4),
      mosaic(LIGHTS, 8, region.x0, region.y0, 3),
      mosaic(GROUND.replace('{month}', month), 8, region.x0, region.y0, 3),
    ]);
    this.textures = [canvasTexture(lightsCanvas, false), canvasTexture(groundCanvas, true)];
    // The ground under the station, so the eye stands above whatever is there.
    const [cx, cy] = at(13);
    this.ground = Math.max(SEA, sampleHeight(close, cx, cy));
    this.townLight = clamp(sampleLights(lightsCanvas, lx - region.x0, ly - region.y0), 0, 1);
    this.materials = [];
    const material = (hole) => {
      const m = materials.land.clone();
      this.materials.push(m);
      m.uniforms = { ...materials.shared, lights: { value: this.textures[0] }, groundColour: { value: this.textures[1] }, latitude: { value: s.lat }, hole: { value: hole } };
      return m;
    };
    const none = new THREE.Vector4(1, 1, -1, -1);
    const closeMesh = landGrid(close, this.frame, region, 384, material(none));
    const nearMesh = landGrid(near, this.frame, region, 512, material(footprint(closeMesh)));
    const midMesh = landGrid(mid, this.frame, region, 448, material(footprint(nearMesh)));
    const farMesh = landGrid(far, this.frame, region, 256, material(footprint(midMesh)));
    const sea = seaDisc(this.frame, s.lat, s.lon, materials.sea);
    this.group.add(sea, farMesh, midMesh, nearMesh, closeMesh);
  }

  dispose() {
    this.group.traverse((o) => o.geometry?.dispose());
    this.materials?.forEach((m) => m.dispose());
    this.textures?.forEach((t) => t.dispose());
  }
}

/** Mean artificial light in a small area of a lights mosaic, 0 to 1. */
function sampleLights(canvas, tx, ty) {
  const px = canvas.getContext('2d').getImageData(Math.max(0, Math.round(tx * 256) - 6), Math.max(0, Math.round(ty * 256) - 6), 12, 12).data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) sum += Math.max(0, px[i] * 0.6 + px[i + 1] * 0.4 - px[i + 2] * 0.92) / 150;
  return sum / (px.length / 4);
}

/* The window ---------------------------------------------------------------------------------- */

class Outlook {
  constructor(stations) {
    this.stations = stations;
    this.vectors = stations.map((s) => unitVector(s.lat, s.lon));
    this.canvas = document.getElementById('sky');
    this.place = [0, 0, 1];
    this.weather = { ...CLEAR };
    this.weatherTarget = { ...CLEAR };
    this.rings = [];
    this.level = 0;
    this.reveal = 0;
    this.veil = 1;
    this.tone = 'dark';
    this.passing = null;
    this.places = new Map();
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
    } catch {
      this.renderer = null;
      return;
    }
    const r = this.renderer;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.6;
    r.autoClear = false;
    this.build();
    this.resize();
    new ResizeObserver(() => this.resize()).observe(document.documentElement);
  }

  get ok() {
    return Boolean(this.renderer);
  }

  build() {
    const shared = {
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      moonDir: { value: new THREE.Vector3(0, 1, 0) },
      betaR: { value: new THREE.Vector3() },
      betaM: { value: new THREE.Vector3() },
      sunE: { value: 0 },
      mieG: { value: 0.8 },
      night: { value: 0 },
      moonLight: { value: 0 },
      townGlow: { value: 0 },
      blueHour: { value: 0 },
      elongation: { value: 0 },
      cloud: { value: 0 },
      time: { value: 0 },
      seed: { value: 0 },
      starScale: { value: 160 },
      haze: { value: 1 / 60000 },
      pixelAngle: { value: 0.001 },
      level: { value: 0 },
      rings: { value: new Array(6).fill(0) },
    };
    this.shared = shared;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 4, 3e6);
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(1e6, 64, 32),
      new THREE.ShaderMaterial({ uniforms: shared, vertexShader: DOME_VERTEX, fragmentShader: DOME_FRAGMENT, side: THREE.BackSide, depthWrite: false, depthTest: false }),
    );
    this.dome.renderOrder = -1;
    this.dome.frustumCulled = false;
    this.scene.add(this.dome);
    this.materials = {
      shared,
      land: new THREE.ShaderMaterial({ uniforms: shared, vertexShader: LAND_VERTEX, fragmentShader: LAND_FRAGMENT }),
      sea: new THREE.ShaderMaterial({ uniforms: shared, vertexShader: SEA_VERTEX, fragmentShader: SEA_FRAGMENT }),
    };

    // From orbit.
    this.orbitScene = new THREE.Scene();
    this.orbitCamera = new THREE.PerspectiveCamera(42, 1, 1e-5, 100);
    const loader = new THREE.TextureLoader();
    const day = loader.load('earth-day.jpg');
    day.colorSpace = THREE.SRGBColorSpace;
    day.anisotropy = 8;
    const lightsMap = loader.load('earth-lights.png');
    lightsMap.anisotropy = 8;
    this.orbitUniforms = { day: { value: day }, lightsMap: { value: lightsMap }, sun: { value: new THREE.Vector3() }, level: shared.level };
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(1, 192, 96), new THREE.ShaderMaterial({ uniforms: this.orbitUniforms, vertexShader: EARTH_VERTEX, fragmentShader: EARTH_FRAGMENT }));
    const air = new THREE.Mesh(
      new THREE.SphereGeometry(1.022, 128, 64),
      new THREE.ShaderMaterial({ uniforms: this.orbitUniforms, vertexShader: EARTH_VERTEX, fragmentShader: AIR_FRAGMENT, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide }),
    );
    const stars = new THREE.BufferGeometry();
    const sp = [];
    for (let i = 0; i < 2600; i++) {
      const v = normalize([Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1]);
      sp.push(v[0] * 40, v[1] * 40, v[2] * 40);
    }
    stars.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.orbitStars = new THREE.Points(stars, new THREE.PointsMaterial({ color: 0x9aa3b8, size: 1.1, sizeAttenuation: false, transparent: true, opacity: 0.8 }));
    this.route = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffa94d, transparent: true, opacity: 0.85 }));
    this.orbitScene.add(this.earth, air, this.orbitStars, this.route);

    // The overlay, drawn last over either scene.
    this.overlayUniforms = {
      res: { value: new THREE.Vector2(1, 1) },
      time: shared.time,
      veil: { value: 1 },
      veilColour: { value: new THREE.Color(0, 0, 0) },
      rain: { value: 0 },
      snow: { value: 0 },
    };
    this.overlay = new THREE.Scene();
    const quad = new THREE.Mesh(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)),
      new THREE.ShaderMaterial({
        uniforms: this.overlayUniforms,
        vertexShader: OVERLAY_VERTEX,
        fragmentShader: OVERLAY_FRAGMENT,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
      }),
    );
    quad.frustumCulled = false;
    this.overlay.add(quad);
    this.overlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  resize() {
    if (!this.ok) return;
    const w = innerWidth;
    const h = innerHeight;
    this.portrait = w < 720 || w / h < 0.8;
    this.dprCap ??= 1.75;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.dprCap));
    this.renderer.setSize(w, h, false);
    // A lens of about 70 degrees across, whatever the shape of the window.
    const vertical = (2 * Math.atan(Math.tan((70 * Math.PI) / 360) / (w / h)) * 180) / Math.PI;
    for (const c of [this.camera, this.orbitCamera]) {
      c.aspect = w / h;
      c.fov = clamp(vertical, 32, 78);
      c.updateProjectionMatrix();
    }
    this.overlayUniforms.res.value.set(w, h);
    this.horizon = document.body.classList.contains('poster') ? 0.36 : this.portrait ? 0.47 : h < 560 ? 0.42 : 0.44;
    document.documentElement.style.setProperty('--horizon', `${(1 - this.horizon) * 100}%`);
  }

  degrade() {
    if (!this.ok || this.dprCap <= 1) return;
    this.dprCap = this.dprCap > 1.3 ? 1.25 : 1;
    this.resize();
  }

  /** The view of a station, loaded once; the last few are kept. */
  placeFor(i) {
    let p = this.places.get(i);
    if (!p) {
      p = new Place(this.stations[i], this.materials);
      this.places.set(i, p);
      if (this.places.size > 4) {
        const [oldest, old] = this.places.entries().next().value;
        if (old !== this.shown) {
          this.places.delete(oldest);
          old.dispose();
        }
      }
    }
    return p;
  }

  /** Stands at a station without travelling, once its land has loaded. */
  stand(i) {
    this.place = this.vectors[i];
    this.current = i;
    const p = this.placeFor(i);
    this.journey = { kind: 'arrive', start: performance.now(), to: i };
    this.awaitLand(this.journey, p);
  }

  awaitLand(j, place) {
    let resolve;
    j.landed = new Promise((r) => (resolve = r));
    j.resolve = resolve;
    place.ready.then(() => (j.loaded = true), () => (j.loaded = true));
  }

  /** Travels to a station: up through the cloud, across the Earth if it is far, and down. */
  fly(i) {
    const now = performance.now();
    const from = this.place;
    const to = this.vectors[i];
    const angle = angleBetween(from, to);
    const dest = this.placeFor(i);
    this.current = i;
    this.wander = null;
    this.weatherTarget = { ...CLEAR };
    const inOrbit = this.mode === 'orbit';
    let estimate;
    if (this.reduced) {
      this.journey = { kind: 'cut', start: now, to: i, fromPlace: from };
      estimate = now + 900;
    } else if (inOrbit || angle > 0.16) {
      const span = 1600 + 2400 * Math.pow(angle / Math.PI, 0.75);
      this.journey = { kind: 'orbit', start: now, to: i, from, angle, rise: inOrbit ? 0 : 1300, span, fall: 1800, startAltitude: inOrbit ? this.orbitAltitude : 0.006 };
      estimate = now + this.journey.rise + span + 1800;
    } else {
      this.journey = { kind: 'hop', start: now, to: i, from, rise: 1100, fall: 1500 };
      estimate = now + 2600;
    }
    this.awaitLand(this.journey, dest);
    return { estimate, landed: this.journey.landed };
  }

  /** Share of the current journey travelled, eased, for the distance counter. */
  get progress() {
    const j = this.journey;
    if (!j || j.kind === 'arrive') return 1;
    const t = (performance.now() - j.start) / ((j.rise || 0) + (j.span || 0) + (j.fall || 0) || 1);
    return smoothstep(0, 1, clamp(t, 0, 1));
  }

  get flight() {
    return this.journey && this.journey.kind !== 'arrive' ? this.journey : null;
  }

  /** Holding Drift: up into orbit, and the Earth turns below along a heading chosen by chance. */
  startWander() {
    const p = this.place;
    const frame = frameAt(...latLon(p));
    const a = Math.random() * Math.PI * 2;
    const heading = frame.east.map((x, k) => x * Math.cos(a) + frame.north[k] * Math.sin(a));
    this.wander = { axis: normalize(cross(p, heading)), start: performance.now(), speed: 0, sub: p, rise: this.mode === 'orbit' ? 0 : 1300 };
    this.journey = null;
    this.passing = null;
    this.weatherTarget = { ...CLEAR };
  }

  stopWander() {
    this.wander = null;
    this.passing = null;
  }

  /** The station nearest the point below, within reach in kilometres. */
  nearest(reach = Infinity) {
    let best = null;
    let bestAngle = reach / 6371;
    this.vectors.forEach((v, i) => {
      const a = angleBetween(this.place, v);
      if (a < bestAngle) {
        bestAngle = a;
        best = i;
      }
    });
    return best;
  }

  swell(strength) {
    if (this.reduced) return;
    this.rings.push({ r: 30, s: strength });
    if (this.rings.length > 6) this.rings.shift();
  }

  /* Each frame: where the camera is, then the light there, then paint. ----------------------- */

  frame(now, dt, sound) {
    const light = lightAt(this.place);
    if (!this.ok) return light;
    this.level += ((sound?.level ?? 0) - this.level) * Math.min(1, dt * 10);
    const ease = Math.min(1, dt / 1.4);
    for (const key of ['cloud', 'rain', 'snow', 'fog']) this.weather[key] += (this.weatherTarget[key] - this.weather[key]) * ease;
    for (const ring of this.rings) ring.r += dt * (900 + ring.r * 0.6);
    this.rings = this.rings.filter((ring) => ring.r < 14000);

    const view = this.wander ? this.wanderView(now, dt) : this.journeyView(now);
    this.mode = view.mode;
    const seen = lightAt(view.mode === 'ground' ? this.vectors[view.station] : this.place);
    const target = view.mode === 'orbit' ? 1.1 : 0.4 + 1.5 * smoothstep(4, -12, seen.elevation);
    this.exposure = (this.exposure ?? target) + (target - (this.exposure ?? target)) * Math.min(1, dt * 1.5);
    this.renderer.toneMappingExposure = this.exposure;
    if (view.mode === 'orbit') this.renderOrbit(view, light);
    else this.renderGround(view, light, now);
    this.renderer.setRenderTarget(null);
    this.overlayUniforms.veil.value = clamp(Math.max(view.veil, 1 - this.reveal), 0, 1);
    this.overlayUniforms.veilColour.value.copy(this.veilColour(light));
    this.overlayUniforms.rain.value = view.mode === 'ground' ? this.weather.rain : 0;
    this.overlayUniforms.snow.value = view.mode === 'ground' ? this.weather.snow : 0;
    this.renderer.render(this.overlay, this.overlayCamera);

    const top = mix(light.zenith, [0.55, 0.57, 0.6], this.weather.cloud * 0.6 * (1 - light.night));
    const lum = 0.2126 * top[0] + 0.7152 * top[1] + 0.0722 * top[2];
    this.tone = view.mode === 'orbit' || view.veil > 0.5 ? 'dark' : lum > 0.36 ? 'light' : lum < 0.3 ? 'dark' : this.tone;
    return light;
  }

  /** Cloud you pass through: white by day, grey at dusk, near black at night. */
  veilColour(light) {
    const v = 0.04 + 0.78 * light.day + 0.12 * (1 - light.night) * (1 - light.day);
    return new THREE.Color(v * 0.97, v * 0.98, v);
  }

  /** The camera along the current journey, as a mode and a pose. */
  journeyView(now) {
    const j = this.journey;
    const station = this.current ?? 0;
    if (!j) return { mode: 'ground', station, altitude: 0, pitch: 0, veil: 0 };
    const t = now - j.start;
    if (j.kind === 'arrive' || j.kind === 'cut') {
      if (!j.loaded) {
        if (j.kind === 'cut' && j.fromPlace) return { mode: 'ground', station: this.shownStation ?? station, altitude: 0, pitch: 0, veil: clamp(t / 400, 0, 1) };
        return { mode: 'ground', station, altitude: 0, pitch: 0, veil: 1 };
      }
      j.loadedAt ??= now;
      const a = clamp((now - j.loadedAt) / (j.kind === 'cut' ? 500 : 1400), 0, 1);
      if (a >= 1) this.finish(j);
      this.place = this.vectors[j.to];
      return { mode: 'ground', station: j.to, altitude: 0, pitch: 0, veil: 1 - smoothstep(0, 1, a) };
    }
    const rise = j.rise;
    const span = j.span || 0;
    const top = j.kind === 'hop' ? 9000 : 26000;
    if (t < rise) {
      // Up from where you were, looking down as the land falls away.
      const u = smoothstep(0, 1, t / rise);
      return { mode: 'ground', station: this.shownStation ?? station, altitude: top * Math.pow(u, 2.2), pitch: -38 * u, veil: smoothstep(0.55, 1, t / rise) };
    }
    if (j.kind === 'orbit' && t < rise + span) {
      const u = (t - rise) / span;
      const e = u * u * u * (u * (u * 6 - 15) + 10);
      this.place = slerp(j.from, this.vectors[j.to], e);
      // From where it started, up to a height that grows with the distance, and down to the cloud.
      const peak = 0.28 + 1.1 * Math.pow(j.angle / Math.PI, 0.9);
      const base = j.startAltitude + (0.006 - j.startAltitude) * u;
      const altitude = base + (peak - base) * Math.sin(Math.PI * u) ** 0.8;
      this.orbitAltitude = altitude;
      const veil = Math.max(1 - smoothstep(0, 0.12, u), smoothstep(0.88, 1, u));
      return { mode: 'orbit', sub: this.place, heading: normalize(cross3(this.place, j.from, this.vectors[j.to])), altitude, veil, route: { from: j.from, to: this.vectors[j.to], u: e } };
    }
    // Hold in the cloud until the land below has loaded.
    if (!j.loaded) {
      j.held = (j.held ?? 0) + 1;
      this.place = this.vectors[j.to];
      return { mode: 'ground', station: this.shownStation ?? station, altitude: top, pitch: -38, veil: 1 };
    }
    j.fallStart ??= now;
    const u = clamp((now - j.fallStart) / j.fall, 0, 1);
    const e = smoothstep(0, 1, u);
    this.place = this.vectors[j.to];
    if (u >= 1) this.finish(j);
    return { mode: 'ground', station: j.to, altitude: top * Math.pow(1 - e, 2.4), pitch: -38 * (1 - e), veil: 1 - smoothstep(0, 0.45, u) };
  }

  finish(j) {
    if (this.journey !== j) return;
    this.journey = null;
    j.resolve?.();
  }

  /** Holding Drift: rise, then the Earth turns below at a steady height. */
  wanderView(now, dt) {
    const w = this.wander;
    const t = now - w.start;
    if (t < w.rise) {
      const u = smoothstep(0, 1, t / w.rise);
      return { mode: 'ground', station: this.shownStation ?? this.current ?? 0, altitude: 26000 * Math.pow(u, 2.2), pitch: -38 * u, veil: smoothstep(0.55, 1, t / w.rise) };
    }
    const s = (t - w.rise) / 1000;
    w.speed = (8 + 26 * smoothstep(0.2, 2, s)) * DEG;
    const turn = w.speed * dt;
    const p = w.sub;
    const kp = cross(w.axis, p);
    w.sub = normalize(p.map((x, i) => x * Math.cos(turn) + kp[i] * Math.sin(turn)));
    this.place = w.sub;
    const altitude = 0.006 + 0.5 * smoothstep(0, 1.6, s);
    this.orbitAltitude = altitude;
    const passing = this.nearest(240);
    if (passing !== this.passing) {
      this.passing = passing;
      if (passing !== null) this.onPass?.(passing, w.speed / (34 * DEG));
    }
    return { mode: 'orbit', sub: w.sub, heading: normalize(cross(w.axis, w.sub)), altitude, veil: 1 - smoothstep(0, 0.35, s) };
  }

  setSky(light, frame) {
    const u = this.shared;
    // The analytic sky goes black the moment the sun is two degrees down. Real twilight fades
    // over the next ten: hold the sun's direction just under the horizon and let its light decay.
    const held = Math.max(light.elevation, -1.8);
    const twilight = light.elevation < -1.8 ? Math.exp((light.elevation + 1.8) / 4.5) : 1;
    const sun = lightDirection(held, light.azimuth);
    u.sunDir.value.copy(sun);
    u.moonDir.value.copy(lightDirection(light.moonElevation, light.moonAzimuth));
    u.elongation.value = light.elongation;
    u.night.value = smoothstep(-3, -13, light.elevation);
    u.blueHour.value = smoothstep(1, -3, light.elevation) * smoothstep(-15, -6, light.elevation);
    u.moonLight.value = smoothstep(-3, 3, light.moonElevation) * light.moonLit;
    // Preetham: clearer air is bluer; weather thickens it.
    const turbidity = 2.2 + 2.6 * this.weather.cloud + 8 * this.weather.fog;
    const zenith = Math.acos(clamp(sun.y, -1, 1));
    u.sunE.value = 1000 * Math.max(0, 1 - Math.exp(-(1.6110731556870734 - zenith) / 1.5)) * twilight;
    const rayleigh = 1.6;
    u.betaR.value.set(5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5).multiplyScalar(rayleigh);
    const c = 0.2 * turbidity * 10e-18 * 0.434 * 0.005;
    u.betaM.value.set(1.8399918514433978e14 * c, 2.7798023919660528e14 * c, 4.0790479543861094e14 * c);
    u.cloud.value = this.weather.cloud;
    u.haze.value = 1 / ((220000 / (1 + turbidity * 0.3)) * (1 - 0.94 * this.weather.fog));
    u.townGlow.value = frame?.townLight ?? 0;
    u.level.value = this.level;
    u.rings.value = Array.from({ length: 6 }, (_, k) => this.rings[k]?.r ?? 0);
  }

  renderGround(view, light, now) {
    const i = view.station;
    const place = this.places.get(i);
    if (place && this.shown !== place) {
      if (this.shown) this.scene.remove(this.shown.group);
      this.scene.add(place.group);
      this.shown = place;
      this.shownStation = i;
    }
    const s = this.stations[i];
    const here = unitVector(s.lat, s.lon);
    const local = lightAt(here);
    this.setSky(local, place);
    this.shared.time.value = now / 1000;
    this.shared.seed.value = (s.lat * 0.37 + s.lon * 0.11) % 13;
    // Face the sun by day and at dusk; at night, the moon if it is up; a little to the right of it.
    const moonUp = smoothstep(-3, 2, local.moonElevation);
    const toMoon = smoothstep(-6, -11, local.elevation) * moonUp;
    const facing = turnToward(local.azimuth - 13, local.moonAzimuth - 13, toMoon);
    this.facing = facing;
    const eye = (place?.ground ?? 0) + EYE + view.altitude;
    const c = this.camera;
    c.position.set(0, eye, 0);
    // The horizon sits a little below the middle of the window.
    const lift = (0.5 - this.horizon) * c.fov;
    this.shared.pixelAngle.value = (c.fov * Math.PI) / 180 / (innerHeight * this.renderer.getPixelRatio());
    const look = bearing(facing, lift + view.pitch);
    c.up.set(0, 1, 0);
    c.lookAt(c.position.clone().add(look));
    this.dome.position.copy(c.position);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.clear();
    this.renderer.render(this.scene, c);
  }

  renderOrbit(view, light) {
    const p = view.sub;
    const sun = sunDirection(new Date());
    this.orbitUniforms.sun.value.set(...sun);
    const c = this.orbitCamera;
    const h = view.altitude;
    // Above the point below, looking ahead along the way so the curve of the Earth is in view.
    const ahead = view.heading;
    const pos = p.map((x, k) => x * (1 + h) - ahead[k] * h * 0.55);
    c.position.set(...pos);
    const target = p.map((x, k) => x + ahead[k] * Math.min(0.5, h * 0.9));
    c.up.set(...p);
    c.lookAt(...target);
    if (view.route) {
      const points = [];
      const n = 96;
      const u = view.route.u;
      for (let k = 0; k <= n; k++) {
        const q = slerp(view.route.from, view.route.to, (k / n) * Math.max(u, 0.001));
        points.push(new THREE.Vector3(q[0] * 1.002, q[1] * 1.002, q[2] * 1.002));
      }
      this.route.geometry.setFromPoints(points);
      this.route.visible = true;
    } else {
      this.route.visible = false;
    }
    this.orbitStars.position.copy(c.position);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.clear();
    this.renderer.render(this.orbitScene, c);
  }
}

/** A direction across the travel: the heading at the point below, toward the destination. */
function cross3(p, from, to) {
  const axis = cross(from, to);
  const heading = cross(axis, p);
  return Math.hypot(...heading) > 1e-6 ? heading : [0, 1, 0];
}

function lightDirection(elevation, azimuth) {
  return bearing(azimuth, elevation);
}

function turnToward(a, b, t) {
  return a + ((((b - a + 540) % 360) - 180) * t);
}

window.Outlook = Outlook;
