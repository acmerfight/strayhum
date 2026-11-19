/* Orthographic globe. The texture, graticule and station buttons share one rotation. */
class RadioGlobe {
  constructor(stations, onSelect) {
    this.canvas = document.querySelector('#globe');
    this.sky = document.querySelector('#sky');
    this.stations = stations;
    this.lon = 101; this.lat = 30; this.zoom = 1; this.selected = stations.findIndex(s => s.id === "beijing");
    this.rad = Math.PI / 180;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.pins = stations.map((s, i) => {
      const pin = document.createElement('button');
      pin.className = 'pin'; pin.setAttribute('aria-label', '收听' + s.name + '，' + s.city);
      const label = document.createElement('span'); label.textContent = s.city; pin.append(label, document.createElement("i"));
      pin.addEventListener('click', () => onSelect(i));
      document.querySelector('#pins').append(pin); return pin;
    });
    this.texture = new Image();
    this.lights = new Image();
    let loaded=0;
    this.texture.onload = this.lights.onload = () => { if(++loaded===2){this.prepareRenderer();this.draw();} };
    this.texture.src = 'earth.jpg'; this.lights.src = 'lights.jpg';
    this.input();
    new ResizeObserver(() => this.resize()).observe(this.sky);
    this.resize();
  }
  resize() {
    this.w = this.sky.clientWidth; this.h = this.sky.clientHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.7);
    this.canvas.width=Math.round(this.w*this.dpr); this.canvas.height=Math.round(this.h*this.dpr);
    this.cx = this.w * .5; this.cy = this.h * .445;
    this.radius = Math.min(this.w*.456, this.h*.345)*this.zoom;
    this.draw();
  }
  prepareRenderer() {
    this.gl = this.canvas.getContext('webgl',{alpha:true,antialias:false,premultipliedAlpha:false});
    if (!this.gl) { this.prepareFallback(); return; }
    const gl=this.gl;
    const vertex='attribute vec2 pos;void main(){gl_Position=vec4(pos,0.,1.);}';
    const fragment=`precision highp float;
      uniform sampler2D atlas, lights; uniform vec2 res, center; uniform float radius, lat, lon;
      void main(){
        vec2 p=(vec2(gl_FragCoord.x,res.y-gl_FragCoord.y)-center)/radius; p.y=-p.y;
        float d=length(p); float rimLight=.49+.48*dot(normalize(p+vec2(.00001)),vec2(-.85,.52));
        if(d>1.){float halo=exp(-(d-1.)*60.)*.55*rimLight; gl_FragColor=vec4(.48,.72,.96,halo);return;}
        float z=sqrt(max(0.,1.-dot(p,p)));
        float latitude=asin(clamp(p.y*cos(lat)+z*sin(lat),-1.,1.));
        float longitude=atan(p.x,z*cos(lat)-p.y*sin(lat))+lon;
        vec2 uv=vec2(fract(longitude/6.2831853+.5),.5-latitude/3.14159265);
        vec3 surface=texture2D(atlas,uv).rgb;
        float incidence=dot(vec3(p,z),normalize(vec3(-.94,.38,.23)));
        float sun=smoothstep(-.29,.74,incidence);
        vec3 day=mix(vec3(dot(surface,vec3(.24,.59,.17))),surface,.79);
        vec3 color=day*(.087+sun*.96)+vec3(.003,.009,.015)*(1.-sun);
        float urban=texture2D(lights,uv).r;
        color+=vec3(1.,.75,.43)*pow(urban,1.15)*(1.-smoothstep(-.20,.43,incidence))*.96;
        color+=vec3(.13,.29,.49)*pow(1.-z,3.5)*rimLight;
        color=mix(color,vec3(.71,.85,.99),smoothstep(.990,1.,d)*rimLight*.82);
        gl_FragColor=vec4(color,1.);
      }`;
    function compile(type,src){const shader=gl.createShader(type);gl.shaderSource(shader,src);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader;}
    const prog=gl.createProgram();gl.attachShader(prog,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(prog,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(prog);gl.useProgram(prog);
    const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    const pos=gl.getAttribLocation(prog,'pos');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
    const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,this.texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE1);
    const night=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,night);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,this.lights);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.uniform1i(gl.getUniformLocation(prog,'lights'),1);
    this.uniform={};for(const key of ['lat','lon','radius','center','res'])this.uniform[key]=gl.getUniformLocation(prog,key);
  }
  prepareFallback(){
    const src=document.createElement('canvas');src.width=1024;src.height=512;const c=src.getContext('2d');c.drawImage(this.texture,0,0,1024,512);
    this.pixels=c.getImageData(0,0,1024,512).data;
    c.drawImage(this.lights,0,0,1024,512);this.nightPixels=c.getImageData(0,0,1024,512).data;this.raster=document.createElement('canvas');this.ctx=this.canvas.getContext('2d');
  }
  rasterize(){
    const size=Math.min(540,Math.ceil(this.radius*2*this.dpr)),half=size/2,c=this.raster.getContext('2d');
    this.raster.width=this.raster.height=size;const data=c.createImageData(size,size),dst=data.data,src=this.pixels;
    const sl=Math.sin(this.lat*this.rad),cl=Math.cos(this.lat*this.rad);
    for(let y=0;y<size;y++){const py=(half-y)/half;for(let x=0;x<size;x++){const px=(x-half)/half,z2=1-px*px-py*py;if(z2<=0)continue;
      const z=Math.sqrt(z2),lat=Math.asin(py*cl+z*sl),lon=Math.atan2(px,z*cl-py*sl)+this.lon*this.rad;
      const i=4*((((lon/(2*Math.PI)+.5)*1024|0)+2048)%1024+1024*Math.min(511,Math.max(0,(.5-lat/Math.PI)*512|0))),o=(y*size+x)*4;
      const incidence=(-.94*px+.38*py+.23*z)/1.039, sun=Math.max(0,Math.min(1,(incidence+.29)/1.03)), light=.087+.96*sun*sun*(3-2*sun);
      const lights=this.nightPixels[i]*Math.max(0,Math.min(1, (.43-incidence)/.63)),rim=(1-z)**4*(.49+.48*(-.85*px+.52*py));
      dst[o]=src[i]*light+lights+33*rim;dst[o+1]=src[i+1]*light+lights*.75+74*rim;dst[o+2]=src[i+2]*light+lights*.43+125*rim;dst[o+3]=255;
    }}c.putImageData(data,0,0);const ctx=this.ctx;ctx.setTransform(this.dpr,0,0,this.dpr,0,0);ctx.clearRect(0,0,this.w,this.h);ctx.drawImage(this.raster,this.cx-this.radius,this.cy-this.radius,this.radius*2,this.radius*2);
  }
  project(lat,lon){
    const a=lat*this.rad,b=(lon-this.lon)*this.rad,p=this.lat*this.rad,c=Math.cos(a);
    return [this.cx+this.radius*c*Math.sin(b),this.cy-this.radius*(Math.sin(a)*Math.cos(p)-c*Math.cos(b)*Math.sin(p)),Math.sin(a)*Math.sin(p)+c*Math.cos(b)*Math.cos(p)];
  }
  draw(){
    const {gl,uniform:u,dpr:k,radius:r,cx,cy}=this;
    if(gl&&u){gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.uniform2f(u.res,this.canvas.width,this.canvas.height);gl.uniform2f(u.center,cx*k,cy*k);gl.uniform1f(u.radius,r*k);gl.uniform1f(u.lon,this.lon*this.rad);gl.uniform1f(u.lat,this.lat*this.rad);gl.drawArrays(gl.TRIANGLES,0,6);}
    else if(this.ctx)this.rasterize();
    // Separate nearby city hit targets on small globes, keeping the selected city anchored.
    const occupied=[];
    const points=this.stations.map((s,i)=>({i,point:this.project(s.lat,s.lon)}));
    points.sort((a,b)=>(b.i===this.selected)-(a.i===this.selected));
    for(const {i,point:[px,py,z]} of points){
      const pin=this.pins[i];pin.hidden=z<.09;if(pin.hidden)continue;
      let x=px,y=py;
      for(let j=0;j<24&&occupied.some(p=>Math.hypot(x-p[0],y-p[1])<26);j++){const angle=j*2.4,offset=17+2*j;x=px+Math.cos(angle)*offset;y=py+Math.sin(angle)*offset;}
      occupied.push([x,y]);pin.style.left=x+'px';pin.style.top=y+'px';pin.classList.toggle('active',i===this.selected);pin.classList.toggle('left',x>this.w-95);
    }
  }
  rotate(lon,lat){this.lon=((lon+540)%360+360)%360-180;this.lat=Math.max(-84,Math.min(84,lat));this.draw();}
  focus(i){cancelAnimationFrame(this.frame);this.selected=i;const s=this.stations[i],start=performance.now(),lon=this.lon,lat=this.lat,delta=((s.lon-lon+540)%360)-180;
    const step=now=>{const t=this.reduced?1:Math.min(1,(now-start)/850),e=1-(1-t)**3;this.rotate(lon+delta*e,lat+(s.lat-lat)*e);if(t<1)this.frame=requestAnimationFrame(step);};step(start);}
  scale(factor){this.zoom=Math.max(.72,Math.min(1.65,this.zoom*factor));this.resize();}
  input(){
    const canvas=this.canvas;const pointers=new Map();let anchor,span=0;
    const pairDistance=()=>{const p=[...pointers.values()];return Math.hypot(p[0][0]-p[1][0],p[0][1]-p[1][1]);};
    function reset(){anchor=pointers.size===1?[...pointers.values()][0]:null;span=pointers.size===2?pairDistance():0;}
    canvas.onpointerdown=e=>{if(e.button!==0)return;cancelAnimationFrame(this.frame);pointers.set(e.pointerId,[e.clientX,e.clientY]);canvas.setPointerCapture(e.pointerId);reset();};
    canvas.onpointermove=e=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,[e.clientX,e.clientY]);
      if(pointers.size===2){const distance=pairDistance();if(distance&&span)this.scale(distance/span);span=distance;}
      else if(anchor){const f=68/this.radius;this.rotate(this.lon-(e.clientX-anchor[0])*f,this.lat+(e.clientY-anchor[1])*f);anchor=[e.clientX,e.clientY];}};
    canvas.onpointerup=canvas.onpointercancel=canvas.onlostpointercapture=e=>{pointers.delete(e.pointerId);reset();};
    canvas.onwheel=e=>{e.preventDefault();this.scale(Math.exp(-Math.sign(e.deltaY)*.055));};
    canvas.onkeydown=e=>{const keys={ArrowLeft:[-9,0],ArrowRight:[9,0],ArrowUp:[0,8],ArrowDown:[0,-8]};if(keys[e.key]){e.preventDefault();cancelAnimationFrame(this.frame);this.rotate(this.lon+keys[e.key][0],this.lat+keys[e.key][1]);}else if(['+','=','-'].includes(e.key)){e.preventDefault();this.scale(e.key==='-'?.9:1.1);}};

  }
}
