/* The engraved globe, drawn with WebGL2 from one distance-to-coast texture.
   Coast, water lines and hatching are hairlines shaded by the real sun; stations are points
   of light; the playing station's sound travels across the surface as rings. */
const SURFACE_VERTEX = `#version 300 es
in vec2 corner;
void main() { gl_Position = vec4(corner, 0., 1.); }`;

const SURFACE_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D coast;
uniform vec2 center;
uniform float radius;
uniform mat3 view;
uniform vec3 sun;
uniform vec3 beacon;
uniform float beaconOn;
uniform vec2 rings[8];
uniform float ringWidth;
uniform float glow;
uniform float reveal;
uniform float dpr;
out vec4 color;

const float PI = 3.14159265;
const float MAX_DEGREES = 6.;
const vec3 OCEAN = vec3(.043, .047, .058);
const vec3 BONE = vec3(.914, .89, .839);
const vec3 AMBER = vec3(1., .66, .3);

// Coverage of a line of the given half width. Lines thinner than a pixel get dimmer, not jagged.
float line(float dist, float aa, float halfWidth) {
  float w = max(halfWidth, .5 * aa);
  return clamp((w - dist) / aa + .5, 0., 1.) * min(1., halfWidth / (.5 * aa));
}

void main() {
  vec2 p = (gl_FragCoord.xy - center) / radius;
  float px = 1. / radius;
  float d = length(p);
  float limb = line(abs(d - 1.), px, .5 * px);
  if (d > 1. + 2. * px) { color = vec4(0.); return; }
  float inside = clamp((1. - d) / px + .5, 0., 1.) * smoothstep(0., .25, reveal);
  float z = sqrt(max(0., 1. - d * d));
  vec3 w = transpose(view) * vec3(p, z);
  float lat = asin(clamp(w.y, -1., 1.));
  float lon = atan(w.x, w.z);
  float latDeg = degrees(lat);

  float sdf = (texture(coast, vec2(lon / (2. * PI) + .5, .5 - lat / PI)).r - .5) * 2. * MAX_DEGREES;
  float aaS = max(fwidth(sdf), 1e-4);
  float day = smoothstep(-.1, .3, dot(w, sun));
  float rim = mix(.45, 1., sqrt(z));

  // The coast, one pixel wide at any zoom.
  float coastA = line(abs(sdf), aaS, .55 * aaS) * mix(.42, .86, day) * smoothstep(0., .3, reveal);

  // Line spacing on screen: a little wider on dense displays, so lines stay distinct.
  float pxPerDegree = radius * PI / 180.;
  float spacing = 7. * pow(dpr, .55);

  // Water lines, cut farther apart the farther they are from the shore.
  float sea = max(-sdf, 0.);
  float unit = max(.28, spacing / pxPerDegree);
  float t = (sqrt(1. + 1.2 * sea / unit) - 1.) / .6;
  float aaT = max(fwidth(t), 1e-4);
  float k = floor(t + .5);
  float waterA = line(abs(t - k), aaT, .45 * aaT) * step(.5, k) * pow(clamp(1. - k / 5.5, 0., 1.), 1.4);
  waterA *= (1. - smoothstep(.3, .5, aaT)) * clamp((reveal - .12) * 10. - k, 0., 1.) * mix(.22, .46, day);

  // Hatching along the parallels. Lines are thin at night and broad in daylight, as an engraver
  // shades with line weight. Spacing follows the zoom in powers of two, so lines never slide.
  float level = log2(spacing / pxPerDegree);
  float step1 = exp2(floor(level));
  float minor = 1. - fract(level);
  float aaL = max(fwidth(latDeg), 1e-5);
  float halfWidth = mix(.05, .19, day) * step1;
  float major = line(abs(fract(latDeg / (2. * step1) + .5) - .5) * 2. * step1, aaL, halfWidth);
  float every = line(abs(fract(latDeg / step1 + .5) - .5) * step1, aaL, halfWidth);
  float hatch = mix(major, every, minor);
  hatch = mix(hatch, 2. * halfWidth / step1, smoothstep(.25 * step1, .5 * step1, aaL));
  float land = clamp(sdf / aaS + .5, 0., 1.);
  float hatchA = hatch * land * mix(.16, .55, day) * smoothstep(.4, 1., reveal);

  // A faint graticule every thirty degrees.
  float gLat = abs(fract(latDeg / 30. + .5) - .5) * 30.;
  float gLon = abs(fract(degrees(lon) / 30. + .5) - .5) * 30. * cos(lat);
  float gratA = max(line(gLat, aaL, .45 * aaL), line(gLon, aaL, .45 * aaL)) * .05 * smoothstep(.5, 1., reveal);

  // Sound from the playing station: rings that pass over the surface, and a warmth that
  // gathers around the station while the music sustains.
  float ang = acos(clamp(dot(w, beacon), -1., 1.));
  float aaA = max(fwidth(ang), 1e-5);
  float ringLine = 0., ringBand = 0.;
  for (int i = 0; i < 8; i++) {
    float s = rings[i].y;
    if (s <= 0.) continue;
    float dd = abs(ang - rings[i].x);
    ringLine += s * line(dd, aaA, .55 * aaA);
    ringBand += s * exp(-dd * dd / (ringWidth * ringWidth));
  }
  ringLine = min(ringLine, 1.) * beaconOn;
  float halo = exp(-ang * ang / (.008 + .032 * glow)) * beaconOn;
  float warm = clamp(min(ringBand, 1.) * .75 * beaconOn + halo * (.4 + .6 * glow), 0., 1.);

  // Coordinates of the station: its parallel and meridian, close to it only.
  vec3 meridian = normalize(cross(vec3(0., 1., 0.), beacon) + vec3(1e-5, 0., 0.));
  float near = exp(-ang / .16) * beaconOn;
  float crossA = max(line(abs(latDeg - degrees(asin(beacon.y))), aaL, .45 * aaL),
                     line(abs(degrees(asin(clamp(dot(w, meridian), -1., 1.)))), aaL, .45 * aaL)) * near * .2;

  float lineA = clamp((hatchA + coastA + waterA + gratA) * rim * (1. + .9 * warm), 0., 1.);
  vec3 col = OCEAN * (1. + .35 * day) * mix(.7, 1., rim);
  col = mix(col, mix(BONE, AMBER, warm), lineA);
  col += AMBER * (ringLine * .42 + crossA + halo * .06 * glow);

  float limbA = limb * .3 * smoothstep(0., .3, reveal);
  color = vec4(col * inside + BONE * limbA * (1. - inside), inside + limbA * (1. - inside));
}`;

const POINT_VERTEX = `#version 300 es
in vec3 position;
in vec2 info;
uniform mat3 view;
uniform vec2 center;
uniform float radius;
uniform vec2 viewport;
uniform float dpr;
uniform float time;
uniform float twinkle;
uniform vec3 sun;
uniform float reveal;
uniform float level;
out vec4 tint;
out float edge;
const vec3 BONE = vec3(.914, .89, .839);
const vec3 AMBER = vec3(1., .66, .3);
void main() {
  vec3 v = view * position;
  float facing = smoothstep(0., .14, v.z);
  vec2 px = center + v.xy * radius;
  gl_Position = vec4(px / viewport * 2. - 1., 0., 1.);
  // Stations on the night side shine brighter, like city lights.
  float night = 1. - smoothstep(-.15, .25, dot(position, sun));
  float shimmer = 1. + .28 * twinkle * sin(time * (.5 + info.x * 1.3) + info.x * 47.);
  float size = 2.1;
  vec3 c = BONE;
  float a = mix(.38, .82, night) * shimmer;
  if (info.y == 1.) { c = mix(BONE, AMBER, .45); a = .9; }
  else if (info.y == 2.) { c = AMBER; size = 3.4; a = 1.; }
  else if (info.y == 3.) { c = AMBER; size = 4.6 + 4. * level; a = 1.; }
  else if (info.y == 4.) { size = 4.2; a = 1.; }
  float shown = smoothstep(.5 + .4 * info.x, .62 + .4 * info.x, reveal);
  tint = vec4(c, clamp(a, 0., 1.) * facing * shown);
  gl_PointSize = facing > 0. ? (size * (.75 + .25 * facing) + 2.) * dpr : 0.;
  edge = 2. * dpr / gl_PointSize;
}`;

const POINT_FRAGMENT = `#version 300 es
precision mediump float;
in vec4 tint;
in float edge;
out vec4 color;
void main() {
  float r = length(gl_PointCoord - .5) * 2.;
  float a = tint.a * (1. - smoothstep(1. - edge * 1.2, 1., r));
  color = vec4(tint.rgb * a, a);
}`;

const STATE = { plain: 0, heard: 1, kept: 2, current: 3, hovered: 4 };

class Sky {
  constructor(canvas, stations) {
    this.canvas = canvas;
    this.stations = stations;
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false });
    this.gl = gl;
    if (!gl) return;
    this.surface = this.program(SURFACE_VERTEX, SURFACE_FRAGMENT);
    this.points = this.program(POINT_VERTEX, POINT_FRAGMENT);

    this.quad = gl.createVertexArray();
    gl.bindVertexArray(this.quad);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.attribute(this.surface, 'corner', 2);

    this.cloud = gl.createVertexArray();
    gl.bindVertexArray(this.cloud);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(stations.flatMap((s) => unitVector(s.lat, s.lon))), gl.STATIC_DRAW);
    this.attribute(this.points, 'position', 3);
    this.info = new Float32Array(stations.length * 2);
    stations.forEach((s, i) => (this.info[2 * i] = fract(Math.sin(i * 12.9898) * 43758.5453)));
    this.infoBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.infoBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.info, gl.DYNAMIC_DRAW);
    this.attribute(this.points, 'info', 2);
    gl.bindVertexArray(null);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.ready = this.loadCoast();
  }

  program(vertexSource, fragmentSource) {
    const gl = this.gl;
    const program = gl.createProgram();
    for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]]) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
    const uniforms = {};
    for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i++) {
      const name = gl.getActiveUniform(program, i).name.replace('[0]', '');
      uniforms[name] = gl.getUniformLocation(program, name);
    }
    return { program, uniforms };
  }

  attribute({ program }, name, size) {
    const gl = this.gl;
    const location = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
  }

  async loadCoast() {
    const image = new Image();
    image.src = 'coast.png';
    await image.decode();
    const gl = this.gl;
    let source = image;
    // Some older phones cap textures at 2048 pixels.
    if (gl.getParameter(gl.MAX_TEXTURE_SIZE) < image.width) {
      source = document.createElement('canvas');
      source.width = 2048;
      source.height = 1024;
      source.getContext('2d').drawImage(image, 0, 0, 2048, 1024);
    }
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.loaded = true;
  }

  /** Marks one station's role: heard tonight, kept, playing or under the pointer. */
  mark(i, state) {
    if (!this.gl || this.info[2 * i + 1] === STATE[state]) return;
    this.info[2 * i + 1] = STATE[state];
    this.dirtyInfo = true;
  }

  render(frame) {
    const gl = this.gl;
    if (!gl || !this.loaded) return;
    const { width, height, dpr, cx, cy, radius, view } = frame;
    gl.viewport(0, 0, width, height);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const center = [cx * dpr, height - cy * dpr];
    const r = radius * dpr;
    // The surface shader only runs over the globe's square.
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(Math.floor(center[0] - r - 3), Math.floor(center[1] - r - 3), Math.ceil(2 * r + 6), Math.ceil(2 * r + 6));

    const s = this.surface;
    gl.useProgram(s.program);
    gl.uniform2f(s.uniforms.center, center[0], center[1]);
    gl.uniform1f(s.uniforms.radius, r);
    gl.uniformMatrix3fv(s.uniforms.view, false, view);
    gl.uniform3fv(s.uniforms.sun, frame.sun);
    gl.uniform3fv(s.uniforms.beacon, frame.beacon);
    gl.uniform1f(s.uniforms.beaconOn, frame.beaconOn);
    gl.uniform2fv(s.uniforms.rings, frame.rings);
    gl.uniform1f(s.uniforms.ringWidth, frame.ringWidth);
    gl.uniform1f(s.uniforms.glow, frame.glow);
    gl.uniform1f(s.uniforms.reveal, frame.reveal);
    gl.uniform1f(s.uniforms.dpr, dpr);
    gl.bindVertexArray(this.quad);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.disable(gl.SCISSOR_TEST);
    const p = this.points;
    gl.useProgram(p.program);
    gl.bindVertexArray(this.cloud);
    if (this.dirtyInfo) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.infoBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.info);
      this.dirtyInfo = false;
    }
    gl.uniformMatrix3fv(p.uniforms.view, false, view);
    gl.uniform2f(p.uniforms.center, center[0], center[1]);
    gl.uniform1f(p.uniforms.radius, r);
    gl.uniform2f(p.uniforms.viewport, width, height);
    gl.uniform1f(p.uniforms.dpr, dpr);
    gl.uniform1f(p.uniforms.time, frame.time);
    gl.uniform1f(p.uniforms.twinkle, frame.twinkle);
    gl.uniform3fv(p.uniforms.sun, frame.sun);
    gl.uniform1f(p.uniforms.reveal, frame.reveal);
    gl.uniform1f(p.uniforms.level, frame.level);
    gl.drawArrays(gl.POINTS, 0, this.stations.length);
    gl.bindVertexArray(null);
  }
}

function unitVector(lat, lon) {
  const a = (lat * Math.PI) / 180;
  const b = (lon * Math.PI) / 180;
  return [Math.cos(a) * Math.sin(b), Math.sin(a), Math.cos(a) * Math.cos(b)];
}

function fract(x) {
  return x - Math.floor(x);
}

/** The point on Earth where the sun is overhead now, as a unit vector. */
function sunDirection(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = (date - start) / 86400000;
  const declination = -23.44 * Math.cos(((2 * Math.PI) / 365) * (day + 10));
  const b = ((2 * Math.PI) / 364) * (day - 81);
  const equationOfTime = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const longitude = -15 * (hours - 12 + equationOfTime / 60);
  return unitVector(declination, longitude);
}
