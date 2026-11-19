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
      uniform vec3 energy, beacon, phrase;uniform float firstLight;uniform float phase, tint;
      uniform vec2 current; uniform vec3 style; uniform float trail;
      // A continuous three-dimensional pigment field stays attached to the globe.
      float hash(vec3 p) { p=fract(p*.3183099+vec3(.17,.29,.43)); p*=17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      float noise3(vec3 p) {
        vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),
                       mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
                       mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
      void main(){
        vec2 p=(vec2(gl_FragCoord.x,height-gl_FragCoord.y)-center)/radius; p.y=-p.y;
        float d=length(p);
        if(d>=1.){gl_FragColor=vec4(0.);return;}
        float z=sqrt(1.-d*d);
        float phi=asin(clamp(p.y*cos(lat)+z*sin(lat),-1.,1.));
        float lambda=atan(p.x,z*cos(lat)-p.y*sin(lat))+lon;
        vec3 world=vec3(cos(phi)*sin(lambda),sin(phi),cos(phi)*cos(lambda));
        float land=texture2D(plate,vec2(fract(lambda/6.2831853+.5),.5-phi/3.14159265)).b;
        float distance=acos(clamp(dot(world,beacon),-1.,1.));
        float t=phase*.22;

        vec3 east=normalize(cross(vec3(0.,1.,.005),beacon));
        vec3 north=cross(beacon,east);
        vec3 tangent=normalize(.84*east+.54*north);
        vec3 normal=cross(beacon,tangent);
        float u=dot(world,tangent), v=dot(world,normal);
        float local=smoothstep(-.4,.85,dot(world,beacon));
        float push=current.x, travel=current.y;
        // Move pigment through a curved channel in the station's tangent plane.
        // The foreground moves farther than the layer beneath it.
        float axis=u+.16*sin(2.7*v+.5*travel);
        float bend=.34*sin(2.9*axis+.42*sin(travel))+.26*axis*axis;
        float influence=local*exp(-1.8*axis*axis);
        float stroke=influence*(.49*push+.095*phrase.y);
        // The same sheet gathers into a tight pleat, swings sideways, or opens
        // along a long arc. Only the station score changes the proportions.
        float snap=style.x, swing=style.y, sweep=style.z;
        float recoil=(trail-push)*swing;
        bend=mix(bend,.10*sin(3.2*axis)+.18*axis,snap);
        bend=mix(bend,.48*sin(3.15*axis+.78*sin(.78*travel)+1.15*recoil),swing);
        bend=mix(bend,.52*axis*axis-.24*axis+.16*sin(.54*travel+axis),sweep);
        stroke+=influence*(snap*.16*push+swing*.20*trail+sweep*(.47*phrase.y-.29*push));
        float fold=v-bend+.09-stroke;
        vec3 q=world*1.47+vec3(.85,-.27,.4);
        q-=influence*(normal*(.54*push+.11*phrase.y)+tangent*.18*sin(travel));
        q+=local*(tangent*(.54*recoil-.24*sweep*phrase.y)+normal*.15*sweep*axis*phrase.y);
        vec3 flow=vec3(noise3(q+vec3(.17*t,2.,0.)),
                       noise3(q+vec3(4.,.12*t,1.7)),
                       noise3(q+vec3(2.3,5.,.11*t)))-.5;
        q+=flow*1.32+vec3(.05*sin(t),.07*cos(t*.8),.04*sin(t*.7));
        float pool=noise3(q*1.68+.8*flow);
        float mist=noise3(q*3.8+pool*1.6);
        float glaze=.68*pool+.32*mist;
        vec3 n=vec3(p,z);
        float daylight=smoothstep(-.65,.96,dot(n,normalize(vec3(-.58,.76,.48))));
        float edge=pow(1.-z,2.55);
        vec3 deep=vec3(.037,.048,.113), indigo=vec3(.22,.20,.41);
        vec3 jade=vec3(.31,.69,.67), opal=vec3(.75,.86,.79);
        vec3 rose=vec3(.81,.45,.48), amber=vec3(.98,.73,.53);
        // Overlapping pools have different soft edges, like pigment suspended
        // beneath glass. No repeating pattern is used on land or sea.
        float warmth=smoothstep(.39,.69,noise3(q*.92+vec3(4.2,1.4,2.)));
        vec3 mineral=mix(jade,rose,warmth);
        vec3 pale=mix(opal,amber,warmth);
        vec3 pigment=mix(indigo,mineral,smoothstep(.27,.58,glaze));
        pigment=mix(pigment,pale,smoothstep(.49,.72,glaze)*.88);
        float wake=exp(-pow(abs(distance-firstLight*1.52)/.31,2.))*(1.-firstLight)*phrase.z;
        vec3 sea=mix(deep,indigo,.12+.21*pool);
        sea+=mineral*(.042+.12*smoothstep(.43,.80,glaze));
        vec3 surface=mix(sea,pigment*(.44+.47*daylight),land);
        // A broad translucent sheet and its folded lip give the beat a visible
        // edge. The coast mask stays fixed while the sheet slips over it.
        float width=1.-.46*snap+.27*swing+.85*sweep;
        float edgeField=fold/width+(.12-.07*snap)*(mist-.5);
        float body=smoothstep(-.49,-.11,edgeField)*(1.-smoothstep(-.025,.055,edgeField));
        float lip=exp(-abs(edgeField+.025)*(19.+10.*snap-4.*sweep));
        float veil=local*(.70+.30*daylight)*(.80+.20*mist);
        vec3 silk=mix(vec3(.28,.55,.57),mix(opal,amber,.34),.33+.44*lip);
        surface=mix(surface,silk,body*veil*(.38+.28*land));
        surface+=veil*lip*(.16+.24*push+.09*energy.z)*mix(opal,amber,.52);
        surface*=1.-.19*veil*exp(-abs(edgeField-.07)*13.);
        surface+=pale*wake*.13;
        // One asymmetrical reflection grazes the dark side and clarifies the silhouette.
        float grazing=pow(max(0.,dot(n,normalize(vec3(-.73,.60,.32)))),7.);
        surface+=mix(jade,opal,.54)*grazing*(.09+.17*mist);
        surface+=mix(indigo,opal,daylight)*edge*(.30+.24*daylight);
        surface+=pow(1.-z,13.)*mix(rose,opal,daylight)*.54;

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
      "firstLight",
      "current",
      "style",
      "trail",
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
      const first =
        view.firstLight && !view.reduced
          ? Math.min(1, (performance.now() - view.firstLight) / 1900)
          : 1;
      g.uniform1f(u.firstLight, first);
      g.uniform2f(u.current, view.flowPush, view.flowTravel);
      g.uniform3fv(u.style, view.shape);
      g.uniform1f(u.trail, view.trail);
      g.uniform3f(
        u.phrase,
        view.strike || 0,
        view.hold || 0,
        Math.min(1, (view.loudness || 0) * 4),
      );
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
        const wx = Math.cos(a) * Math.sin(b),
          wz = Math.cos(a) * Math.cos(b);
        const wash =
          0.5 +
          0.5 *
            Math.sin(2.9 * wx + 1.25 * Math.sin(3.1 * wz + Math.sin(a) * 2.2));
        const warmth = 0.5 + 0.5 * Math.sin(2.2 * wz - wx * 1.4);
        const land = src[i + 2] / 255,
          rim = (1 - z) ** 3;
        const value = land * (0.49 + 0.51 * light);
        dst[o] =
          14 + wash * 9 + value * (52 + wash * (66 + 85 * warmth)) + rim * 76;
        dst[o + 1] =
          17 + wash * 13 + value * (60 + wash * (85 - 27 * warmth)) + rim * 87;
        dst[o + 2] =
          34 + wash * 19 + value * (82 + wash * (74 - 43 * warmth)) + rim * 99;
        dst[o + 3] = 255;
      }
    }
    ctx.putImageData(frame, 0, 0);
    this.ctx.setTransform(k, 0, 0, k, 0, 0);
    this.ctx.clearRect(0, 0, view.w, view.h);
    this.ctx.drawImage(this.raster, cx - r, cy - r, 2 * r, 2 * r);
  }
}
