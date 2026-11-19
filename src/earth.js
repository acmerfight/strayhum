/* The Earth, as it is right now: lit by the real sun, its night side in its own lights, a day's
   clouds over it, the air at its edge. Every station is a light on it. Drifting turns the Earth
   to the next one; you can also turn it yourself.

   Built with three.js into dist/earth.js (npm run build). Uses the globals of daylight.js;
   exposes window.Outlook to app.js. */
import * as THREE from 'three';

// The ground at twice the bundled detail, fetched once the page is up.
const FINE_GROUND = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=8192&HEIGHT=4096&STYLES=&LAYERS=BlueMarble_NextGeneration&FORMAT=image/jpeg';
// How large the Earth is: its radius as a share of the window's height.
const REST = 0.4;
const FAR = 0.29;
const NEAREST = 1.7;
const FARTHEST = 0.2;
const CLOUD = 1.0035;
const AIR = 1.028;

const NOISE_GLSL = /* glsl */ `
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
`;

const COMMON_VERTEX = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
`;

const SPHERE_VERTEX = /* glsl */ `
varying vec3 vObject;
${COMMON_VERTEX}
void main() {
  vObject = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}`;

/* Shared: longitude and latitude to texture, the local frame on the sphere, the air's colour. */
const GEO_GLSL = /* glsl */ `
const float PI = 3.141592653589793;
uniform vec3 sun;
uniform vec3 eye;
vec2 lonlat(vec3 n) { return vec2(atan(n.x, n.z) / (2.0 * PI) + 0.5, asin(clamp(n.y, -1.0, 1.0)) / PI + 0.5); }
// The colour of sunlight that has come through the air: white overhead, amber then red low down.
vec3 sunlight(float mu) {
  return mix(vec3(1.0, 0.42, 0.18), mix(vec3(1.0, 0.8, 0.6), vec3(1.0, 0.97, 0.93), smoothstep(0.05, 0.25, mu)), smoothstep(0.0, 0.06, mu));
}
// Rayleigh blue lit by the sun, reddening at the terminator.
vec3 airColour(float mu) {
  return mix(vec3(0.95, 0.38, 0.14), vec3(0.32, 0.55, 1.0), smoothstep(-0.04, 0.22, mu)) * smoothstep(-0.18, 0.05, mu);
}
`;

const EARTH_FRAGMENT = /* glsl */ `
varying vec3 vObject;
uniform sampler2D day;
uniform sampler2D relief;
uniform sampler2D lights;
uniform sampler2D clouds;
uniform float cloudShift;
uniform vec3 playing;
uniform float rings[6];
uniform float level;
${GEO_GLSL}
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  vec3 n = normalize(vObject);
  vec2 uv = lonlat(n);
  vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), n) + vec3(1e-6, 0.0, 0.0));
  vec3 north = cross(n, east);
  vec3 rel = texture2D(relief, uv).rgb;
  vec2 slope = rel.rg * 2.0 - 1.0;
  vec3 ground = normalize(east * slope.x + north * slope.y + n * sqrt(max(0.0, 1.0 - dot(slope, slope))));
  float sea = smoothstep(0.35, 0.65, rel.b);
  vec3 v = normalize(eye - vObject);
  float mu = dot(n, sun);
  float muEye = max(dot(n, v), 0.0);

  // Clouds and the shadows they cast a little away from the sun.
  vec2 cuv = uv + vec2(cloudShift, 0.0);
  float cloud = texture2D(clouds, cuv).r;
  vec2 toSun = vec2(dot(sun, east), dot(sun, north));
  float shadow = texture2D(clouds, cuv - toSun * 0.0018 / max(mu, 0.15)).r;

  vec3 albedo = texture2D(day, uv).rgb;
  vec3 light = sunlight(mu);
  float diffuse = max(dot(ground, sun), 0.0) * smoothstep(-0.02, 0.05, mu);
  vec3 col = albedo * light * diffuse * (1.0 - 0.55 * shadow) * 1.45;
  // Earthshine and starlight: the night side keeps the faintest trace of its ground, so the whole ball reads.
  col += albedo * vec3(0.55, 0.65, 0.9) * 0.028 * (1.0 - smoothstep(-0.1, 0.1, mu));
  // The sea: dark, with the sun's glint broken by the swell and the sky's light at grazing angles.
  vec3 h = normalize(sun + v);
  float glint = pow(max(dot(n, h), 0.0), 380.0) * 2.2 + pow(max(dot(n, h), 0.0), 40.0) * 0.06;
  float fresnel = 0.02 + 0.98 * pow(1.0 - muEye, 5.0);
  col = mix(col, col * 0.7 + airColour(mu) * 0.06 * fresnel + light * glint * smoothstep(0.0, 0.1, mu) * (1.0 - cloud), sea);
  // Cloud tops, white by day, rose at dusk, faintly lit by towns at night.
  vec3 cloudLit = vec3(0.92, 0.93, 0.95) * light * max(mu * 0.9 + 0.1, 0.0) * smoothstep(-0.03, 0.05, mu) * 1.35;
  col = mix(col, cloudLit, cloud * 0.92);

  // Night: the lights of towns, dimmed where cloud lies over them, which they glow into.
  float town = texture2D(lights, uv).r;
  float dark = 1.0 - smoothstep(-0.12, 0.05, mu);
  col += vec3(1.0, 0.58, 0.26) * pow(town, 1.3) * dark * (1.0 - cloud * 0.65) * (1.7 + 0.9 * level);
  col += vec3(0.5, 0.3, 0.16) * town * cloud * dark * 0.35;

  // The air between you and the ground: thickest toward the edge, blue by day, red at dusk.
  float haze = pow(1.0 - muEye, 2.6);
  col = mix(col, airColour(mu) * 0.55, haze * 0.75 * smoothstep(-0.05, 0.12, mu));
  col += airColour(mu) * 0.04 * smoothstep(-0.1, 0.4, mu);

  // Sound leaves the station playing as fine rings on the face of the Earth.
  float a = acos(clamp(dot(n, playing), -1.0, 1.0));
  float aa = fwidth(a);
  float ring = 0.0;
  for (int i = 0; i < 6; i++) {
    float r = rings[i];
    if (r <= 0.0) continue;
    ring += smoothstep(aa * 1.5, 0.0, abs(a - r)) * (1.0 - r / 0.55);
  }
  col += vec3(1.0, 0.62, 0.3) * clamp(ring, 0.0, 1.0) * 0.9;
  gl_FragColor = vec4(col, 1.0);
}`;

/* The air seen beyond the edge: light scattered along the line of sight, by how close it
   passes to the ground. Drawn on the inside of a shell, so the Earth hides the far half. */
const AIR_FRAGMENT = /* glsl */ `
varying vec3 vObject;
${GEO_GLSL}
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  vec3 d = normalize(vObject - eye);
  float t = -dot(eye, d);
  vec3 closest = eye + d * t;
  float height = length(closest) - 1.0;
  if (height < 0.0) discard;
  float density = exp(-height / 0.0075) * 1.1 + exp(-height / 0.022) * 0.25;
  float mu = dot(normalize(closest), sun);
  // Forward scattering brightens the air when the sun is behind the Earth.
  float forward = pow(max(dot(d, sun), 0.0), 8.0) * 2.5;
  vec3 col = airColour(mu) * density * (1.0 + forward);
  // Airglow: the night side's edge keeps a thin, faint line of its own.
  col += vec3(0.05, 0.11, 0.2) * exp(-height / 0.004) * 0.35 * (1.0 - smoothstep(-0.2, 0.05, mu));
  gl_FragColor = vec4(col, 1.0);
}`;

/* Stations, the route's ends and the needle. */
const MARK_VERTEX = /* glsl */ `
attribute float size;
attribute float kind;
varying float vKind;
varying float vLit;
uniform float dpr;
uniform float zoom;
uniform vec3 sunWorld;
${COMMON_VERTEX}
void main() {
  vKind = kind;
  vec4 world = modelMatrix * vec4(position, 1.0);
  float facing = dot(normalize(world.xyz), normalize(cameraPosition - world.xyz));
  vLit = dot(normalize(world.xyz), sunWorld);
  gl_Position = projectionMatrix * viewMatrix * world;
  gl_PointSize = facing > 0.05 ? size * dpr * (kind > 2.5 ? zoom : 1.0) * smoothstep(0.05, 0.25, facing) : 0.0;
  #include <logdepthbuf_vertex>
}`;

const MARK_FRAGMENT = /* glsl */ `
varying float vKind;
varying float vLit;
uniform float time;
uniform float stations;
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  float r = length(gl_PointCoord - 0.5) * 2.0;
  vec3 amber = vec3(1.0, 0.6, 0.27);
  vec3 col;
  if (vKind > 5.5) col = vec3(1.0, 0.97, 0.9) * 1.6 * (smoothstep(0.42, 0.25, r) + smoothstep(0.09, 0.0, abs(r - 0.85)));
  else if (vKind > 4.5) {
    float beat = fract(time * 0.45);
    col = amber * 2.6 * (smoothstep(0.34, 0.18, r) + smoothstep(0.08, 0.0, abs(r - 0.3 - 0.62 * beat)) * (1.0 - beat) * 0.8);
  } else if (vKind > 3.5) col = amber * 1.6 * smoothstep(0.5, 0.2, r);
  // A station: a small point, a little brighter on the night side, quieter in daylight.
  else if (vKind > 2.5) col = vec3(1.0, 0.96, 0.88) * smoothstep(0.55, 0.1, r) * mix(0.55, 1.0, smoothstep(0.1, -0.15, vLit)) * stations;
  else if (vKind > 1.5) col = amber * 1.8 * smoothstep(0.07, 0.0, abs(r - 0.84));
  else if (vKind > 0.5) col = amber * 2.2 * smoothstep(0.4, 0.2, r);
  else col = amber * 1.2 * smoothstep(0.4, 0.2, r);
  gl_FragColor = vec4(col, 1.0);
}`;

const STAR_VERTEX = /* glsl */ `
attribute float brightness;
varying float vBrightness;
uniform float dpr;
${COMMON_VERTEX}
void main() {
  vBrightness = brightness;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = (1.0 + 1.6 * brightness) * dpr;
  #include <logdepthbuf_vertex>
}`;

const STAR_FRAGMENT = /* glsl */ `
varying float vBrightness;
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  float r = length(gl_PointCoord - 0.5) * 2.0;
  gl_FragColor = vec4(mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.9, 0.78), fract(vBrightness * 13.7)) * (0.08 + 1.4 * vBrightness * vBrightness) * smoothstep(1.0, 0.0, r), 1.0);
}`;

const SUN_FRAGMENT = /* glsl */ `
varying vec3 vObject;
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  gl_FragColor = vec4(vec3(1.0, 0.95, 0.86) * 18.0, 1.0);
}`;

/* Development: rendered in linear light, then printed. -------------------------------------- */

const SCREEN_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BRIGHT_FRAGMENT = /* glsl */ `
varying vec2 vUv;
uniform sampler2D source;
uniform float exposure;
void main() {
  vec3 c = texture2D(source, vUv).rgb * exposure;
  float l = max(c.r, max(c.g, c.b));
  gl_FragColor = vec4(c * smoothstep(0.45, 1.4, l), 1.0);
}`;

const DOWN_FRAGMENT = /* glsl */ `
varying vec2 vUv;
uniform sampler2D source;
uniform vec2 texel;
void main() {
  vec3 c = texture2D(source, vUv + texel * vec2(-1.0, -1.0)).rgb + texture2D(source, vUv + texel * vec2(1.0, -1.0)).rgb
         + texture2D(source, vUv + texel * vec2(-1.0, 1.0)).rgb + texture2D(source, vUv + texel * vec2(1.0, 1.0)).rgb;
  gl_FragColor = vec4(c * 0.25, 1.0);
}`;

const BLUR_FRAGMENT = /* glsl */ `
varying vec2 vUv;
uniform sampler2D source;
uniform vec2 step;
void main() {
  vec3 c = texture2D(source, vUv).rgb * 0.227;
  c += (texture2D(source, vUv + step * 1.385).rgb + texture2D(source, vUv - step * 1.385).rgb) * 0.316;
  c += (texture2D(source, vUv + step * 3.231).rgb + texture2D(source, vUv - step * 3.231).rgb) * 0.07;
  gl_FragColor = vec4(c, 1.0);
}`;

// The print: ACES, cool colour held back and warm light kept, split toning, lifted blacks,
// halation in two widths, a touch of lens fringing at the edges, grain, vignette.
const GRADE_FRAGMENT = /* glsl */ `
varying vec2 vUv;
uniform sampler2D source;
uniform sampler2D glowNear;
uniform sampler2D glowFar;
uniform vec2 res;
uniform float exposure;
uniform float time;
uniform float veil;
${NOISE_GLSL}
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
vec3 toSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec2 off = (vUv - 0.5) * 0.0016;
  vec3 hdr = vec3(texture2D(source, vUv + off).r, texture2D(source, vUv).g, texture2D(source, vUv - off).b) * exposure;
  hdr += texture2D(glowNear, vUv).rgb * vec3(1.0, 0.78, 0.6) * 0.45;
  hdr += texture2D(glowFar, vUv).rgb * vec3(0.9, 0.6, 0.42) * 0.35;
  vec3 c = aces(hdr);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float warm = smoothstep(0.0, 0.16, c.r - c.b);
  c = mix(vec3(l), c, mix(0.62, 0.95, warm));
  c *= mix(vec3(0.92, 0.97, 1.06), vec3(1.04, 1.0, 0.94), smoothstep(0.04, 0.6, l));
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.28);
  c = mix(vec3(0.008, 0.01, 0.016), vec3(0.985, 0.975, 0.955), c);
  vec2 v = vUv - 0.5;
  c *= 1.0 - dot(v * vec2(res.x / res.y, 1.0), v * vec2(res.x / res.y, 1.0)) * 0.32;
  c *= 1.0 - veil;
  c = toSrgb(clamp(c, 0.0, 1.0));
  c += (hash(gl_FragCoord.xy + fract(time * 7.0) * 113.0) - 0.5) * 0.022;
  gl_FragColor = vec4(c, 1.0);
}`;

/* The view ---------------------------------------------------------------------------------- */

class Outlook {
  constructor(stations) {
    this.stations = stations;
    this.vectors = stations.map((s) => unitVector(s.lat, s.lon));
    this.canvas = document.getElementById('sky');
    this.place = [0, 0, 1];
    this.view = { sub: [0, 0, 1], zoom: REST };
    this.weatherTarget = { ...CLEAR };
    this.rings = [];
    this.level = 0;
    this.reveal = 0;
    this.tone = 'dark';
    this.passing = null;
    this.hovered = null;
    this.kept = new Set();
    this.spin = { vx: 0, vy: 0 };
    this.lastTouch = performance.now();
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
    } catch {
      this.renderer = null;
      return;
    }
    this.renderer.autoClear = false;
    this.build();
    this.resize();
    new ResizeObserver(() => this.resize()).observe(document.documentElement);
    this.input();
  }

  get ok() {
    return Boolean(this.renderer);
  }

  build() {
    const loader = new THREE.TextureLoader();
    const texture = (url, colour) => {
      const t = loader.load(url);
      t.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      t.wrapS = THREE.RepeatWrapping;
      return t;
    };
    this.uniforms = {
      day: { value: texture('earth/day.jpg', true) },
      relief: { value: texture('earth/relief.jpg', false) },
      lights: { value: texture('earth/lights.png', false) },
      clouds: { value: texture('earth/clouds.jpg', false) },
      cloudShift: { value: 0 },
      sun: { value: new THREE.Vector3(1, 0, 0) },
      eye: { value: new THREE.Vector3(0, 0, 3) },
      playing: { value: new THREE.Vector3(0, 0, 1) },
      rings: { value: new Array(6).fill(0) },
      level: { value: 0 },
    };
    // The ground at twice the detail, from NASA, once the page is up; the bundled one stays if it cannot be had.
    setTimeout(() => {
      const fine = new THREE.TextureLoader();
      fine.setCrossOrigin('anonymous');
      fine.load(FINE_GROUND, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        t.wrapS = THREE.RepeatWrapping;
        this.uniforms.day.value = t;
      });
    }, 2500);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 1e-4, 400);
    this.globe = new THREE.Group();
    const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 320, 160), new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: SPHERE_VERTEX, fragmentShader: EARTH_FRAGMENT }));
    const air = new THREE.Mesh(
      new THREE.SphereGeometry(AIR, 192, 96),
      new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: SPHERE_VERTEX, fragmentShader: AIR_FRAGMENT, side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );

    this.markUniforms = { dpr: { value: 1 }, zoom: { value: 1 }, time: { value: 0 }, stations: { value: 1 }, sunWorld: { value: new THREE.Vector3() } };
    const markMaterial = new THREE.ShaderMaterial({ uniforms: this.markUniforms, vertexShader: MARK_VERTEX, fragmentShader: MARK_FRAGMENT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const lights = new THREE.BufferGeometry();
    lights.setAttribute('position', new THREE.Float32BufferAttribute(this.vectors.flatMap((v) => v.map((x) => x * 1.002)), 3));
    lights.setAttribute('size', new THREE.Float32BufferAttribute(this.vectors.map(() => 4.5), 1));
    this.lightKinds = new Float32Array(this.vectors.length).fill(3);
    lights.setAttribute('kind', new THREE.BufferAttribute(this.lightKinds, 1));
    this.stationLights = new THREE.Points(lights, markMaterial);
    this.marks = new THREE.Points(new THREE.BufferGeometry(), markMaterial);
    this.route = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: new THREE.Color(1.8, 1.05, 0.5), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    for (const o of [this.stationLights, this.marks, this.route]) o.frustumCulled = false;
    this.globe.add(earth, air, this.route, this.stationLights, this.marks);

    // The needle stays at the centre of the Earth's face while the dial turns.
    const needle = new THREE.BufferGeometry();
    needle.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 1.003], 3));
    needle.setAttribute('size', new THREE.Float32BufferAttribute([30], 1));
    needle.setAttribute('kind', new THREE.Float32BufferAttribute([2], 1));
    this.needle = new THREE.Points(needle, markMaterial);
    this.needle.frustumCulled = false;

    // Stars: many faint, a few bright, warm and cool.
    const stars = new THREE.BufferGeometry();
    const positions = [];
    const brightness = [];
    for (let i = 0; i < 5200; i++) {
      const v = normalize([Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1]);
      positions.push(v[0] * 300, v[1] * 300, v[2] * 300);
      brightness.push(Math.pow(Math.random(), 5));
    }
    stars.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    stars.setAttribute('brightness', new THREE.Float32BufferAttribute(brightness, 1));
    this.starUniforms = { dpr: this.markUniforms.dpr };
    const sky = new THREE.Points(stars, new THREE.ShaderMaterial({ uniforms: this.starUniforms, vertexShader: STAR_VERTEX, fragmentShader: STAR_FRAGMENT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));

    // The sun, far off; when it passes behind the Earth its light comes round the edge.
    this.sun = new THREE.Mesh(new THREE.SphereGeometry(1.6, 32, 16), new THREE.ShaderMaterial({ vertexShader: SPHERE_VERTEX, fragmentShader: SUN_FRAGMENT }));
    this.scene.add(sky, this.sun, this.globe, this.needle);

    // Development.
    const target = (depth) => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: depth, samples: depth ? 4 : 0 });
    this.hdr = target(true);
    this.glow = [target(false), target(false), target(false), target(false), target(false)];
    this.post = new THREE.Scene();
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.screen = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)));
    this.screen.frustumCulled = false;
    this.post.add(this.screen);
    const pass = (fragmentShader, uniforms) => new THREE.ShaderMaterial({ uniforms, vertexShader: SCREEN_VERTEX, fragmentShader, depthTest: false, depthWrite: false, toneMapped: false });
    this.bright = pass(BRIGHT_FRAGMENT, { source: { value: this.hdr.texture }, exposure: { value: 1 } });
    this.blur = pass(BLUR_FRAGMENT, { source: { value: null }, step: { value: new THREE.Vector2() } });
    this.down = pass(DOWN_FRAGMENT, { source: { value: null }, texel: { value: new THREE.Vector2() } });
    this.gradeUniforms = {
      source: { value: this.hdr.texture },
      glowNear: { value: this.glow[0].texture },
      glowFar: { value: this.glow[2].texture },
      res: { value: new THREE.Vector2(1, 1) },
      exposure: { value: 1.1 },
      time: { value: 0 },
      veil: { value: 1 },
    };
    this.grade = pass(GRADE_FRAGMENT, this.gradeUniforms);
  }

  resize() {
    if (!this.ok) return;
    const w = innerWidth;
    const h = innerHeight;
    this.portrait = w < 720 || w / h < 0.8;
    this.dprCap ??= 1.75;
    const dpr = Math.min(devicePixelRatio || 1, this.dprCap);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    const pw = Math.round(w * dpr);
    const ph = Math.round(h * dpr);
    this.hdr.setSize(pw, ph);
    this.glow[0].setSize(Math.ceil(pw / 2), Math.ceil(ph / 2));
    this.glow[1].setSize(Math.ceil(pw / 2), Math.ceil(ph / 2));
    this.glow[4].setSize(Math.ceil(pw / 4), Math.ceil(ph / 4));
    this.glow[2].setSize(Math.ceil(pw / 8), Math.ceil(ph / 8));
    this.glow[3].setSize(Math.ceil(pw / 8), Math.ceil(ph / 8));
    this.gradeUniforms.res.value.set(w, h);
    this.markUniforms.dpr.value = dpr;
    // A long lens: the Earth is not stretched toward the edges.
    this.camera.aspect = w / h;
    this.camera.fov = this.portrait ? 34 : 28;
    this.camera.updateProjectionMatrix();
    // The Earth sits right of centre, clear of the caption; on a phone, in the upper part.
    this.camera.setViewOffset(w, h, this.portrait ? 0 : -w * 0.11, this.portrait ? h * 0.13 : h * 0.02, w, h);
    this.rest = this.portrait ? REST * (w / h) * 1.15 : REST;
    document.documentElement.style.setProperty('--horizon', '100%');
  }

  degrade() {
    if (!this.ok || this.dprCap <= 1) return;
    this.dprCap = this.dprCap > 1.3 ? 1.25 : 1;
    this.resize();
  }

  markKept(kept) {
    this.kept = kept;
    this.paintLights();
  }

  paintLights() {
    if (!this.ok) return;
    this.lightKinds.forEach((_, i) => (this.lightKinds[i] = i === this.hovered ? 6 : i === this.current ? 5 : this.kept.has(i) ? 4 : 3));
    this.stationLights.geometry.attributes.kind.needsUpdate = true;
  }

  /* Journeys -------------------------------------------------------------------------------- */

  /** The first view: from far off, the Earth turns to the station and comes closer. */
  stand(i) {
    this.current = i;
    this.paintLights();
    const to = this.vectors[i];
    const from = this.reduced ? to : normalize(rotateAbout([0, 1, 0], to, -1.25));
    this.view = { sub: from, zoom: this.reduced ? this.rest : FARTHEST };
    this.place = from;
    this.journey = this.makeJourney(i, from, to, { span: this.reduced ? 0 : 5200, startZoom: this.view.zoom, endZoom: this.rest, pull: 0 });
    return { estimate: performance.now() + this.journey.span, landed: this.journey.landed };
  }

  makeJourney(i, from, to, { span, startZoom, endZoom, pull }) {
    let resolve;
    const landed = new Promise((r) => (resolve = r));
    return { start: performance.now(), to: i, from, toVector: to, angle: angleBetween(from, to), span, startZoom, endZoom, pull, landed, resolve };
  }

  /** Turns the Earth to a station, drawing the way. */
  fly(i) {
    const from = this.view.sub;
    const to = this.vectors[i];
    const angle = angleBetween(from, to);
    this.current = i;
    this.wander = null;
    this.hover(null);
    this.paintLights();
    this.spin.vx = this.spin.vy = 0;
    const span = this.reduced ? 0 : 1800 + 2600 * Math.sqrt(angle / Math.PI);
    this.journey = this.makeJourney(i, from, to, { span, startZoom: this.view.zoom, endZoom: this.rest, pull: 0.5 * Math.min(1, angle / 1.8) });
    return { estimate: performance.now() + span, landed: this.journey.landed };
  }

  get progress() {
    const j = this.journey;
    if (!j || !j.span) return 1;
    return smoothstep(0, 1, clamp((performance.now() - j.start) / j.span, 0, 1));
  }

  get flight() {
    return this.journey;
  }

  get exploring() {
    return false;
  }

  /** Holding Drift: the Earth turns by itself along a heading chosen by chance, gathering speed. */
  startWander() {
    const p = this.view.sub;
    const east = normalize(cross([0, 1, 0], p));
    const north = cross(p, east);
    const a = Math.random() * Math.PI * 2;
    const heading = east.map((x, k) => x * Math.cos(a) + north[k] * Math.sin(a));
    this.wander = { axis: normalize(cross(p, heading)), start: performance.now(), zoom: this.view.zoom };
    this.journey = null;
    this.passing = null;
    this.hover(null);
  }

  stopWander() {
    this.wander = null;
    this.passing = null;
  }

  /** The station nearest the centre of the Earth's face, within reach in kilometres. */
  nearest(reach = Infinity) {
    let best = null;
    let bestAngle = reach / 6371;
    this.vectors.forEach((v, i) => {
      const a = angleBetween(this.view.sub, v);
      if (a < bestAngle) {
        bestAngle = a;
        best = i;
      }
    });
    return best;
  }

  swell(strength) {
    if (this.reduced) return;
    this.rings.push({ r: 0.002, s: strength });
    if (this.rings.length > 6) this.rings.shift();
  }

  /* Turning it by hand ------------------------------------------------------------------- */

  turnBy(across, up) {
    const s = this.view.sub;
    const east = normalize(cross([0, 1, 0], s));
    const north = cross(s, east);
    let next = normalize(s.map((x, k) => x - east[k] * across + north[k] * up));
    const [lat, lon] = latLon(next);
    if (Math.abs(lat) > 80) next = unitVector(Math.sign(lat) * 80, lon);
    this.view.sub = next;
    this.place = next;
  }

  zoomBy(factor) {
    this.view.zoomTarget = clamp((this.view.zoomTarget ?? this.view.zoom) / factor, FARTHEST, NEAREST);
  }

  globeRadius() {
    return this.view.zoom * innerHeight;
  }

  screenOf(i) {
    if (!this.ok) return null;
    const v = new THREE.Vector3(...this.vectors[i]).multiplyScalar(1.002).applyMatrix4(this.globe.matrixWorld);
    if (v.dot(this.camera.position.clone().sub(v)) <= 0.02) return null;
    v.project(this.camera);
    return [((v.x + 1) / 2) * innerWidth, ((1 - v.y) / 2) * innerHeight];
  }

  pickAt(x, y, reach) {
    let best = null;
    let bestDistance = reach;
    for (let i = 0; i < this.vectors.length; i++) {
      const s = this.screenOf(i);
      if (!s) continue;
      const d = Math.hypot(s[0] - x, s[1] - y);
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    }
    return best;
  }

  hover(i) {
    if (this.hovered === i) return;
    this.hovered = i;
    this.paintLights();
    this.onHover?.(i);
  }

  input() {
    const canvas = this.canvas;
    const pointers = new Map();
    let last = null;
    let tap = null;
    let span = 0;
    const free = () => !this.journey && !this.wander;
    canvas.style.cursor = 'grab';
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      tap = pointers.size === 1 ? { x: e.clientX, y: e.clientY } : null;
      last = { x: e.clientX, y: e.clientY, at: performance.now() };
      if (pointers.size === 2) span = pairDistance(pointers);
      this.spin.vx = this.spin.vy = 0;
      this.lastTouch = performance.now();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) {
        if (e.pointerType === 'mouse' && free()) {
          const i = this.pickAt(e.clientX, e.clientY, 12);
          this.hover(i);
          canvas.style.cursor = i === null ? 'grab' : 'pointer';
        }
        return;
      }
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      this.lastTouch = performance.now();
      if (pointers.size === 2) {
        const d = pairDistance(pointers);
        if (span) this.zoomBy(span / d);
        span = d;
        return;
      }
      if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 6) return;
      tap = null;
      if (!free()) return;
      this.dragging = true;
      this.hover(null);
      canvas.style.cursor = 'grabbing';
      const k = 1 / this.globeRadius();
      const now = performance.now();
      const dt = Math.max(8, now - last.at) / 1000;
      const across = (e.clientX - last.x) * k;
      const up = (e.clientY - last.y) * k;
      this.turnBy(across, up);
      this.spin.vx = 0.5 * this.spin.vx + (0.5 * across) / dt;
      this.spin.vy = 0.5 * this.spin.vy + (0.5 * up) / dt;
      last = { x: e.clientX, y: e.clientY, at: now };
    });
    const release = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      span = pointers.size === 2 ? pairDistance(pointers) : 0;
      this.dragging = false;
      canvas.style.cursor = 'grab';
      if (pointers.size) return;
      if (performance.now() - (last?.at ?? 0) > 90) this.spin.vx = this.spin.vy = 0;
      if (tap && e.type === 'pointerup' && free()) {
        const i = this.pickAt(e.clientX, e.clientY, e.pointerType === 'mouse' ? 12 : 24);
        if (i !== null) this.onPick?.(i, e.pointerType !== 'mouse');
        else if (e.pointerType !== 'mouse') this.hover(null);
      }
      tap = null;
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && !pointers.size && this.hover(null));
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.lastTouch = performance.now();
        this.zoomBy(Math.exp(clamp(e.deltaY, -80, 80) * 0.004));
      },
      { passive: false },
    );
    canvas.addEventListener('keydown', (e) => {
      const step = { ArrowLeft: [0.08, 0], ArrowRight: [-0.08, 0], ArrowUp: [0, 0.07], ArrowDown: [0, -0.07] }[e.key];
      if (!step || !free()) return;
      e.preventDefault();
      e.stopPropagation();
      this.lastTouch = performance.now();
      this.turnBy(...step);
    });
  }

  /* Each frame ------------------------------------------------------------------------------ */

  frame(now, dt, sound) {
    const light = lightAt(this.place);
    if (!this.ok) return light;
    this.level += ((sound?.level ?? 0) - this.level) * Math.min(1, dt * 10);
    for (const ring of this.rings) ring.r += dt * (0.09 + ring.r * 0.4);
    this.rings = this.rings.filter((ring) => ring.r < 0.55);
    this.step(now, dt);
    this.render(now);
    return light;
  }

  step(now, dt) {
    const v = this.view;
    const j = this.journey;
    let needle = 0;
    let route = null;
    if (j) {
      const u = j.span ? clamp((now - j.start) / j.span, 0, 1) : 1;
      const turn = u * u * u * (u * (u * 6 - 15) + 10);
      v.sub = slerp(j.from, j.toVector, turn);
      // Out a little for long journeys, then back in as the destination comes round.
      v.zoom = j.startZoom + (j.endZoom - j.startZoom) * smoothstep(0, 1, u);
      v.zoom *= 1 - j.pull * Math.sin(Math.PI * u) ** 1.4 * 0.45;
      v.zoomTarget = v.zoom;
      route = { from: j.from, to: j.toVector, u: turn, fade: 1 - smoothstep(0.85, 1, u) };
      if (u >= 1) {
        this.journey = null;
        j.resolve();
      }
    } else if (this.wander) {
      const w = this.wander;
      const s = (now - w.start) / 1000;
      const speed = (5 + 32 * smoothstep(0.4, 2.4, s)) * DEG;
      v.sub = normalize(rotateAbout(w.axis, v.sub, speed * dt));
      v.zoom = w.zoom + (FAR + 0.04 - w.zoom) * smoothstep(0, 1.2, s);
      v.zoomTarget = v.zoom;
      needle = smoothstep(0.3, 1, s);
      const passing = this.nearest(260);
      if (passing !== this.passing) {
        this.passing = passing;
        if (passing !== null) this.onPass?.(passing, speed / (37 * DEG));
      }
    } else {
      if (!this.dragging && (this.spin.vx || this.spin.vy)) {
        this.turnBy(this.spin.vx * dt, this.spin.vy * dt);
        const decay = Math.exp(-dt * 2.2);
        this.spin.vx *= decay;
        this.spin.vy *= decay;
        if (Math.hypot(this.spin.vx, this.spin.vy) < 0.002) this.spin.vx = this.spin.vy = 0;
      }
      if (v.zoomTarget !== undefined) v.zoom += (v.zoomTarget - v.zoom) * Math.min(1, dt * 4);
      // Left alone for a while, the Earth turns back to the station that is playing.
      if (this.current !== undefined && this.playing && now - this.lastTouch > 14000 && !this.reduced) {
        const target = this.vectors[this.current];
        if (angleBetween(v.sub, target) > 0.01) v.sub = slerp(v.sub, target, Math.min(1, dt * 0.6));
        v.zoomTarget = v.zoom + (this.rest - v.zoom) * Math.min(1, dt * 0.6);
      }
    }
    this.place = v.sub;
    this.needleShown = needle;
    this.routeShown = route;
  }

  render(now) {
    const v = this.view;
    const r = this.renderer;
    // Turn the Earth so the point of interest faces the camera, north up.
    const east = normalize(cross([0, 1, 0], v.sub));
    const north = cross(v.sub, east);
    const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(...east), new THREE.Vector3(...north), new THREE.Vector3(...v.sub));
    this.globe.quaternion.setFromRotationMatrix(basis.transpose());
    this.globe.updateMatrixWorld();
    // The camera sits where the Earth fills the asked share of the window.
    const half = Math.tan((this.camera.fov * Math.PI) / 360);
    const angular = Math.atan(2 * v.zoom * half);
    const distance = 1 / Math.sin(Math.min(angular, 1.45));
    this.camera.position.set(0, 0, distance);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();

    const sun = sunDirection(new Date());
    const u = this.uniforms;
    u.sun.value.set(...sun);
    u.eye.value.copy(this.globe.worldToLocal(this.camera.position.clone()));
    u.level.value = this.level;
    u.cloudShift.value = (now / 1000) * 0.000004;
    if (this.current !== undefined) u.playing.value.set(...this.vectors[this.current]);
    u.rings.value = Array.from({ length: 6 }, (_, k) => this.rings[k]?.r ?? 0);
    const sunWorld = new THREE.Vector3(...sun).applyQuaternion(this.globe.quaternion);
    this.sun.position.copy(sunWorld).multiplyScalar(180);
    this.markUniforms.sunWorld.value.copy(sunWorld);
    this.markUniforms.time.value = now / 1000;
    this.markUniforms.zoom.value = clamp(Math.sqrt(v.zoom / REST), 0.8, 1.9);
    this.markUniforms.stations.value = this.wander || this.journey ? 0.55 : 1;
    this.needle.visible = this.needleShown > 0.01;

    // The way: from where you were, a fine arc lifted off the ground, and its two ends.
    const route = this.routeShown;
    const marks = [];
    const sizes = [];
    const kinds = [];
    if (route) {
      const points = [];
      const lift = 0.003 + 0.02 * Math.min(1, angleBetween(route.from, route.to) / 1.6);
      for (let k = 0; k <= 160; k++) {
        const f = (k / 160) * Math.max(route.u, 0.0005);
        const q = slerp(route.from, route.to, f);
        const h = 1.002 + lift * Math.sin(Math.PI * (k / 160));
        points.push(new THREE.Vector3(q[0] * h, q[1] * h, q[2] * h));
      }
      this.route.geometry.setFromPoints(points);
      this.route.material.opacity = 0.85 * route.fade;
      this.route.visible = true;
      marks.push(...route.from.map((x) => x * 1.002));
      sizes.push(8);
      kinds.push(0);
    } else {
      this.route.visible = false;
    }
    const geometry = this.marks.geometry;
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(marks, 3));
    geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
    geometry.setAttribute('kind', new THREE.Float32BufferAttribute(kinds, 1));

    r.setRenderTarget(this.hdr);
    r.setClearColor(0x000000, 1);
    r.clear();
    r.render(this.scene, this.camera);
    this.develop(now);
  }

  develop(now) {
    const r = this.renderer;
    const draw = (material, target) => {
      this.screen.material = material;
      r.setRenderTarget(target);
      r.render(this.post, this.postCamera);
    };
    // Halation in two widths: a close glow on every light, a wide one on the brightest.
    this.bright.uniforms.exposure.value = this.gradeUniforms.exposure.value;
    draw(this.bright, this.glow[0]);
    const blur = (a, b, radius) => {
      this.blur.uniforms.source.value = a.texture;
      this.blur.uniforms.step.value.set(radius / a.width, 0);
      draw(this.blur, b);
      this.blur.uniforms.source.value = b.texture;
      this.blur.uniforms.step.value.set(0, radius / b.height);
      draw(this.blur, a);
    };
    // The wide glow from the bright pass, halved twice with a box filter before it is blurred.
    const down = (a, b) => {
      this.down.uniforms.source.value = a.texture;
      this.down.uniforms.texel.value.set(0.5 / a.width, 0.5 / a.height);
      draw(this.down, b);
    };
    down(this.glow[0], this.glow[4]);
    down(this.glow[4], this.glow[2]);
    blur(this.glow[0], this.glow[1], 1);
    blur(this.glow[2], this.glow[3], 1.2);
    blur(this.glow[2], this.glow[3], 2.4);
    const g = this.gradeUniforms;
    g.time.value = now / 1000;
    g.veil.value = 1 - this.reveal;
    draw(this.grade, null);
  }
}

/** A vector turned by an angle about an axis through the centre of the Earth. */
function rotateAbout(axis, v, angle) {
  const k = normalize(axis);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const kv = cross(k, v);
  const d = dot(k, v) * (1 - c);
  return v.map((x, i) => x * c + kv[i] * s + k[i] * d);
}

function pairDistance(pointers) {
  const [a, b] = [...pointers.values()];
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

window.Outlook = Outlook;
