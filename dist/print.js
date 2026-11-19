/* An equirectangular print plate. Red holds land cuts, green ocean cuts, blue the coast mask. */
class SignalSphere {
  constructor(canvas, ready) {
    this.canvas = canvas;
    const image = new Image();
    image.onload = () => {
      const gl = canvas.getContext("webgl", {
        alpha: true,
        premultipliedAlpha: false,
        antialias: false,
      });
      if (gl) this.initializeGL(gl, image);
      else this.initializeRaster(image);
      ready();
    };
    image.src = "plate.webp";
  }
  initializeGL(gl, image) {
    const vertex =
      "attribute vec2 corner;void main(){gl_Position=vec4(corner,0.,1.);}";
    const fragment = `precision highp float;
      uniform sampler2D plate;
      uniform vec2 center; uniform float height, radius, lat, lon;
      uniform vec3 energy, beacon, phrase;uniform float firstLight;uniform float phase, arrival, tint;
      void main(){
        vec2 p=(vec2(gl_FragCoord.x,height-gl_FragCoord.y)-center)/radius;p.y=-p.y;
        float d=length(p);
        if(d>=1.){gl_FragColor=vec4(0.);return;}
        float z=sqrt(1.-d*d);
        float phi=asin(clamp(p.y*cos(lat)+z*sin(lat),-1.,1.));
        float lambda=atan(p.x,z*cos(lat)-p.y*sin(lat))+lon;
        vec3 cut=texture2D(plate,vec2(fract(lambda/6.2831853+.5),.5-phi/3.14159265)).rgb;
        // Translucent carrier, dark etching, and two families of folded luminous filaments.
        vec3 n=vec3(p,z);
        float edge=pow(1.-z,2.4);
        float light=clamp(.45+dot(n,normalize(vec3(-.68,.65,.31)))*.5,0.,1.);
        vec3 cold=mix(vec3(.28,.54,.94),vec3(.32,.84,.74),tint*.48);
        vec3 warm=mix(vec3(1.,.57,.31),vec3(.94,.40,.64),tint*.65);
        vec3 pearl=vec3(.97,.92,.81);
        float t=phase*.22;
        float drift=.13*sin(t*.8+lambda*1.3)+.06*sin(t*1.13-phi*3.);
        float fold=phi+.27*sin(lambda*2.+phi*3.+drift)+.105*sin(lambda*4.-phi*5.+t*.4)+.11*sin(lambda-phi*4.);
        float ridges=pow(.5+.5*cos(fold*157.+sin(lambda*7.+t)*1.6),5.);
        float fine=pow(.5+.5*cos(fold*328.-3.*t),9.);
        float lateral=p.x*.72+p.y*.36;
        float sheen=.5+.5*cos(fold*6.1-lambda*1.8+t*.36+energy.x*.24);
        vec3 alloy=mix(cold,warm,smoothstep(.23,.79,sheen));
        alloy=mix(alloy,pearl,.46*pow(sheen,4.));
        float flare=pow(max(0.,sin(lambda*2.7+phi*3.2+t*.41)),5.);
        vec3 surface=mix(vec3(.014,.020,.042),vec3(.07,.075,.115),light);
        surface+=cut.b*(vec3(.045,.055,.085)+alloy*(.065+.16*light));
        surface+=cut.b*alloy*(ridges*(.33+.58*light)+fine*(.12+.22*energy.z));
        surface+=cut.r*alloy*.17;
        surface+=(1.-cut.b)*cut.g*cold*.21;
        // A slower inner caustic gives the luminous surface a second depth plane.
        float sheet=p.y+.53*sin(p.x*2.9-z*1.8+t*.45)+.19*p.x;
        float veil=exp(-abs(sheet)*7.);
        float furrow=pow(.5+.5*cos(sheet*174.+p.x*4.+t*1.2),7.);
        surface+=veil*(.08+.38*furrow)*mix(cold,pearl,.3)*(.6+.4*light);
        surface+=cut.b*flare*alloy*(.10+.38*energy.y);
        float rimLight=.32+.68*abs(dot(normalize(p+vec2(.001)),vec2(-.84,.54)));
        surface+=edge*rimLight*mix(cold,warm,.5+.5*lateral)*.76;
        surface+=pow(1.-z,11.)*pearl*.77;
        vec3 world=vec3(cos(phi)*sin(lambda),sin(phi),cos(phi)*cos(lambda));
        float separation=acos(clamp(dot(world,beacon),-1.,1.));
        float distanceToFront=separation-arrival*2.45;
        float front=exp(-abs(distanceToFront)*8.)*pow(.5+.5*cos(distanceToFront*123.),4.);
        float gate=smoothstep(0.,.11,arrival)*(1.-smoothstep(.66,1.,arrival));
        surface+=mix(warm,pearl,.48)*front*gate*(.25+.54*cut.b);
        float first=separation-firstLight*2.6;
        float bloom=exp(-abs(first)*11.)*(1.-smoothstep(.52,1.,firstLight));
        surface+=mix(warm,pearl,.48)*bloom*phrase.z*(.4+.6*cut.b);
        surface+=alloy*(ridges*.35*phrase.x+veil*.46*phrase.y)*cut.b;

        gl_FragColor=vec4(surface,clamp((1.-d)*radius,0.,1.));
      }`;
    function compile(type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw Error(gl.getShaderInfoLog(shader));
      return shader;
    }
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(program);
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const pos = gl.getAttribLocation(program, "corner");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.gl = gl;
    this.uniform = {};
    for (const key of [
      "center",
      "height",
      "radius",
      "lat",
      "lon",
      "phase",
      "arrival",
      "firstLight",
      "phrase",
      "tint",
      "energy",
      "beacon",
    ])
      this.uniform[key] = gl.getUniformLocation(program, key);
  }
  initializeRaster(image) {
    const buffer = document.createElement("canvas");
    buffer.width = 2048;
    buffer.height = 1024;
    const ctx = buffer.getContext("2d");
    ctx.drawImage(image, 0, 0, 2048, 1024);
    this.data = ctx.getImageData(0, 0, 2048, 1024).data;
    this.ctx = this.canvas.getContext("2d");
    this.raster = document.createElement("canvas");
  }
  draw(view) {
    const { cx, cy, radius: r, renderDpr: k, rad } = view,
      lat = view.lat * rad,
      lon = view.lon * rad;
    if (this.gl) {
      const g = this.gl,
        u = this.uniform;
      g.viewport(0, 0, this.canvas.width, this.canvas.height);
      g.uniform2f(u.center, cx * k, cy * k);
      g.uniform1f(u.height, this.canvas.height);
      g.uniform1f(u.radius, r * k);
      g.uniform1f(u.lat, lat);
      g.uniform1f(u.lon, lon);
      const station = view.stations[view.selected],
        slat = station.lat * rad,
        slon = station.lon * rad;
      g.uniform3f(
        u.beacon,
        Math.cos(slat) * Math.sin(slon),
        Math.sin(slat),
        Math.cos(slat) * Math.cos(slon),
      );
      const arrival =
        view.reduced || !view.arrivalAt
          ? 1
          : Math.max(
              0,
              Math.min(1, (performance.now() - view.arrivalAt) / 1750),
            );
      const first =
        view.firstLight && !view.reduced
          ? Math.min(1, (performance.now() - view.firstLight) / 1900)
          : 1;
      g.uniform1f(u.firstLight, first);
      g.uniform3f(
        u.phrase,
        view.strike || 0,
        view.hold || 0,
        Math.min(1, (view.loudness || 0) * 4),
      );
      g.uniform1f(u.arrival, arrival);
      g.uniform1f(u.phase, view.time || 0);
      g.uniform1f(u.tint, view.tint || 0);
      g.uniform3fv(u.energy, view.energy);
      g.drawArrays(g.TRIANGLES, 0, 6);
      return;
    }
    if (!this.ctx) return;
    const size = Math.min(600, Math.ceil(r * 2 * k)),
      half = size / 2;
    this.raster.width = this.raster.height = size;
    const ctx = this.raster.getContext("2d"),
      frame = ctx.createImageData(size, size),
      dst = frame.data,
      src = this.data;
    const cl = Math.cos(lat),
      sl = Math.sin(lat);
    for (let y = 0; y < size; y++) {
      const py = (half - y) / half;
      for (let x = 0; x < size; x++) {
        const px = (x - half) / half,
          z2 = 1 - px * px - py * py;
        if (z2 <= 0) continue;
        const z = Math.sqrt(z2);
        const a = Math.asin(py * cl + z * sl),
          b = Math.atan2(px, z * cl - py * sl) + lon;
        const u = (Math.floor((b / (2 * Math.PI) + 0.5) * 2048) + 4096) % 2048,
          v = Math.min(
            1023,
            Math.max(0, Math.floor((0.5 - a / Math.PI) * 1024)),
          );
        const i = 4 * (v * 2048 + u),
          o = 4 * (y * size + x);
        const light = Math.min(
          1,
          Math.max(0, (-px * 0.67 + py * 0.71 + z * 0.56 + 0.73) / 1.65),
        );
        const shimmer = 0.5 + 0.5 * Math.sin(a * 6 + b * 2.5),
          rim = (1 - z) ** 3;
        const e =
          (src[i] * 0.63 + src[i + 2] * 0.22 + src[i + 1] * 0.1) *
          (light * 0.6 + 0.4);
        dst[o] = 8 + e * (0.4 + 0.88 * shimmer) + rim * 115;
        dst[o + 1] = 10 + e * 0.82 + rim * 141;
        dst[o + 2] = 19 + e * (1.25 - 0.67 * shimmer) + rim * 170;
        dst[o + 3] = 255;
      }
    }
    ctx.putImageData(frame, 0, 0);
    this.ctx.setTransform(k, 0, 0, k, 0, 0);
    this.ctx.clearRect(0, 0, view.w, view.h);
    this.ctx.drawImage(this.raster, cx - r, cy - r, 2 * r, 2 * r);
  }
}
