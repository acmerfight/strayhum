/* The window: the sky over the station right now, a horizon, and the sea below it, where the
   music lands. One full-screen WebGL2 pass; the colours, clouds and sun come from daylight.js
   and weather.js, the swells and the glitter from the measured sound. */
const VERTEX = `#version 300 es
in vec2 corner;
void main() { gl_Position = vec4(corner, 0., 1.); }`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 res;
uniform float dpr;
uniform float horizon;
uniform vec3 zenith;
uniform vec3 low;
uniform vec3 glow;
uniform vec2 sun;
uniform vec2 moon;
uniform float moonLight;
uniform float elongation;
uniform float day;
uniform float night;
uniform float cloud;
uniform float rain;
uniform float snow;
uniform float fog;
uniform float time;
uniform float level;
uniform float seed;
uniform float reveal;
uniform float calm;
uniform vec2 swells[6];
out vec4 color;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0., a = .5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.03 + 17.1;
    a *= .5;
  }
  return v;
}

// The clear sky at a screen point: the gradient from horizon to zenith, light gathered around
// the sun, and haze lying on the horizon.
vec3 clearSky(vec2 uv, float aspect) {
  float t = clamp((uv.y - horizon) / (1. - horizon), 0., 1.);
  vec3 c = mix(low, zenith, pow(t, .5));
  vec2 d = (uv - vec2(sun.x, horizon + sun.y)) * vec2(aspect, 1.);
  float r = length(d);
  c += glow * (exp(-r * 3.4) * .42 + exp(-r * r * 70.) * .5);
  vec2 dm = (uv - vec2(moon.x, horizon + moon.y)) * vec2(aspect, 1.);
  float rm = length(dm);
  c += vec3(.5, .58, .72) * moonLight * night * (exp(-rm * 5.) * .1 + exp(-rm * rm * 260.) * .16);
  c *= 1. + vec3(.35, .45, .7) * moonLight * night * .8;
  // At night the horizon keeps a little light: the glow of towns and the air itself.
  c += vec3(.03, .036, .055) * night * exp(-t * 7.);
  // By day the air softens every colour a little.
  c = mix(c, vec3(dot(c, vec3(.3, .59, .11))), .12 * day);
  return mix(c, low * 1.05 + glow * .06, exp(-t * 10.) * .45);
}

// The moon's disc, lit on the side that faces the sun. Elongation is the sun-moon angle: 0 is new, pi is full.
vec3 moonDisc(vec3 c, vec2 uv, float aspect, float hidden) {
  float radius = .017;
  vec2 d = (uv - vec2(moon.x, horizon + moon.y)) * vec2(aspect, 1.) / radius;
  float r = length(d);
  if (r > 1.2) return c;
  // The lit limb faces the sun's side of the window.
  float side = sun.x >= moon.x ? 1. : -1.;
  vec3 n = vec3(d.x * side, d.y, sqrt(max(0., 1. - r * r)));
  vec3 light = vec3(sin(elongation), .15 * sign(sun.y - moon.y), -cos(elongation));
  float lit = smoothstep(-.06, .08, dot(n, normalize(light)));
  float mottled = .86 + .14 * noise(d * 2.4 + 9.);
  float edge = smoothstep(1., .9, r);
  vec3 surface = vec3(.94, .92, .86) * lit * mottled + vec3(.03, .035, .05);
  float shown = edge * step(0., moon.y + .004) * (1. - hidden) * smoothstep(0., .03, moonLight + .02);
  return mix(c, surface, shown);
}

// Clouds, from scattered to overcast. By day they take the light of the sky; at night they are
// dark, faintly lit from below by the town.
vec3 clouds(vec3 c, vec2 uv, float aspect, out float cover) {
  float t = clamp((uv.y - horizon) / (1. - horizon), 0., 1.);
  vec2 p = vec2((uv.x - .5) * aspect / (t * .9 + .12), 1. / (t + .16));
  p = p * vec2(.9, 1.4) + vec2(time * .012 + seed * 13., seed * 7.);
  float shape = fbm(p);
  cover = smoothstep(1.02 - cloud * .9, 1.3 - cloud * .9, shape + cloud * .35) * smoothstep(0., .05, t);
  float lum = dot(zenith, vec3(.3, .59, .11));
  vec3 lit = mix(vec3(lum * 1.35 + .05), low * 1.1 + glow * .25, .35);
  vec3 under = vec3(.036, .042, .058) + vec3(.07, .042, .02) * exp(-t * 5.) + vec3(.1, .11, .13) * moonLight;
  vec3 tone = mix(lit, under, night * .85);
  tone *= .82 + .3 * fbm(p * 2.3 + 4.);
  c = mix(c, tone, cover * .92);
  // A sky entirely covered goes to one soft grey.
  return mix(c, mix(tone, low, .25), smoothstep(.75, 1., cloud) * .7);
}

void main() {
  vec2 uv = gl_FragCoord.xy / res;
  float aspect = res.x / res.y;
  float px = dpr / res.y;
  vec3 c;
  float sunUp = smoothstep(-.06, .01, sun.y);

  if (uv.y >= horizon) {
    c = clearSky(uv, aspect);
    float cover = 0.;
    // Stars, only where it is dark and the sky is clear.
    vec2 cell = floor(gl_FragCoord.xy / (9. * dpr));
    float h = hash(cell + seed);
    if (h > .978) {
      vec2 at = (cell + .5 + (vec2(hash(cell + 3.), hash(cell + 7.)) - .5) * .7) * 9. * dpr;
      float twinkle = .65 + .35 * sin(time * (1. + 2. * hash(cell + 11.)) + h * 60.);
      float star = exp(-dot(gl_FragCoord.xy - at, gl_FragCoord.xy - at) / (dpr * dpr * .9));
      float bright = pow((h - .978) / .022, 2.) * 1.6 + .25;
      c += vec3(.85, .88, 1.) * star * twinkle * night * bright * (1. - moonLight * .55) * smoothstep(horizon, horizon + .12, uv.y);
    }
    if (cloud > .02) c = clouds(c, uv, aspect, cover);
    // The sun's disc, when it is above the horizon and not behind cloud.
    vec2 d = (uv - vec2(sun.x, horizon + sun.y)) * vec2(aspect, 1.);
    float disc = smoothstep(.0105, .0085, length(d)) * sunUp * (1. - cover) * (1. - smoothstep(.6, .95, cloud));
    c = mix(c, glow * 1.15 + .1, disc);
    c = moonDisc(c, uv, aspect, cover * .8);
  } else {
    // The sea: the sky mirrored and darkened, long swell, a glitter path under the sun.
    float depth = (horizon - uv.y) / horizon;
    float z = 1. / (depth + .04);
    vec2 sp = vec2((uv.x - .5) * aspect * z * .35, z);
    float swell = sin(sp.y * 1.6 - time * .7 + sin(sp.x * .8 + time * .1) * .7);
    float chop = noise(sp * vec2(4.5, 1.6) - vec2(0., time * 1.1));
    vec2 mirror = vec2(uv.x + (chop - .5) * .012 * depth, horizon + (horizon - uv.y) * .55 + swell * .004);
    vec3 sky = clearSky(mirror, aspect);
    float lum = dot(zenith, vec3(.3, .59, .11));
    vec3 deep = vec3(.008, .011, .018) + zenith * .1;
    c = mix(sky * mix(.36, .6, day), deep, smoothstep(0., .9, depth) * mix(.6, .35, day));
    c *= mix(1., .55, cloud * .6);
    c += sky * .08 * swell * (1. - depth);
    // The glitter path widens toward you and sparkles harder when the music is loud.
    float dx = (uv.x - sun.x) * aspect;
    float width = .012 + .17 * depth;
    float path = exp(-dx * dx / (width * width)) * mix(.12, 1., sunUp) * (1. - cloud * .85);
    float sparkle = pow(noise(vec2(sp.x * 10. + chop * 2., sp.y * 2.6 - time * 1.8)), 7.) * (1. + 5. * level);
    // Near the viewer the light breaks into many small glints: short horizontal flecks, as on real water.
    float fleck = pow(noise(vec2(uv.x * aspect * 140. + chop * 3., uv.y * 520. - time * 4.)), 9.) * 4.;
    sparkle = mix(sparkle, fleck * (1. + 3. * level), smoothstep(.04, .32, depth));
    // The water nearest you, where the caption stands, stays calm enough to read over.
    sparkle *= 1. - calm * smoothstep(.3, .75, depth);
    c += glow * path * (.12 + sparkle * 2.2) * (1. - night * .7);
    // At night the moon lays its own path, silver, at its own bearing.
    float mdx = (uv.x - moon.x) * aspect;
    float moonPath = exp(-mdx * mdx / (width * width)) * moonLight * night * (1. - cloud * .8) * step(0., moon.y);
    c += vec3(.62, .68, .8) * moonPath * (.06 + sparkle * 1.4);
    // Each beat sends a swell from the horizon toward you.
    for (int i = 0; i < 6; i++) {
      float s = swells[i].y;
      if (s <= 0.) continue;
      float band = exp(-pow((sp.y - swells[i].x) * (1.3 + 3. / swells[i].x), 2.));
      c += mix(low, glow, .5) * band * s * (.06 + .1 * (1. - night)) * (.6 + .4 * chop);
    }
  }

  // The horizon itself: a seam of light no wider than a pixel or two.
  c += mix(low, glow, .4) * exp(-abs(uv.y - horizon) / (1.2 * px)) * .18 * (1. - fog);

  // Fog lowers everything toward one pale, near tone.
  vec3 haze = mix(low * 1.05, vec3(dot(low, vec3(.33))), .5);
  c = mix(c, haze, fog * (.75 - .35 * abs(uv.y - horizon)));

  // Rain falls as fine slanted strokes, snow as slow points, over the whole window.
  if (rain > 0.) {
    vec2 q = vec2(uv.x * aspect * 90. + uv.y * 18., uv.y * 2.2 + time * 2.6);
    float column = floor(q.x);
    float y = fract(q.y + hash(vec2(column, 1.)) * 9.);
    float drop = step(.9, hash(vec2(column, floor(q.y + hash(vec2(column, 1.)) * 9.)))) * smoothstep(0., .3, y) * smoothstep(1., .55, y);
    float stroke = smoothstep(.5, .0, abs(fract(q.x) - .5) * 2.);
    c += vec3(.7, .75, .82) * drop * stroke * rain * .09;
  }
  if (snow > 0.) {
    vec2 q = vec2(uv.x * aspect * 26. + sin(time * .3 + uv.y * 6.) * .4, uv.y * 26. + time * 1.2);
    vec2 cell = floor(q);
    vec2 f = fract(q) - .5 - (vec2(hash(cell), hash(cell + 2.)) - .5) * .6;
    c += vec3(.9) * smoothstep(.09, .03, length(f)) * step(.6, hash(cell + 5.)) * snow * .35;
  }

  // Film grain and a soft vignette: a print, not a screen.
  c += (hash(gl_FragCoord.xy + fract(time) * 100.) - .5) * .022;
  vec2 v = uv - .5;
  c *= 1. - dot(v, v) * .35;
  color = vec4(c * reveal, 1.);
}`;

class Sky {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: false });
    this.gl = gl;
    if (!gl) return;
    const program = gl.createProgram();
    for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]]) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    gl.useProgram(program);
    this.uniforms = {};
    for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i++) {
      const name = gl.getActiveUniform(program, i).name.replace('[0]', '');
      this.uniforms[name] = gl.getUniformLocation(program, name);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const corner = gl.getAttribLocation(program, 'corner');
    gl.enableVertexAttribArray(corner);
    gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
  }

  render(view) {
    const gl = this.gl;
    if (!gl) return;
    const u = this.uniforms;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.uniform2f(u.res, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.dpr, view.dpr);
    gl.uniform1f(u.horizon, view.horizon);
    gl.uniform3fv(u.zenith, view.zenith);
    gl.uniform3fv(u.low, view.horizonColour);
    gl.uniform3fv(u.glow, view.glow);
    gl.uniform2f(u.sun, view.sunX, view.sunY);
    gl.uniform2f(u.moon, view.moonX, view.moonY);
    for (const key of ['night', 'day', 'moonLight', 'elongation', 'cloud', 'rain', 'snow', 'fog', 'time', 'level', 'seed', 'reveal', 'calm']) gl.uniform1f(u[key], view[key]);
    gl.uniform2fv(u.swells, view.swells);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
