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
    this.ctx=this.canvas.getContext('2d');
    this.land=new Float32Array(LAND_SAMPLES.length*3);
    LAND_SAMPLES.forEach(([a,b],i)=>{
      const lat=a*this.rad/100,lon=b*this.rad/100,c=Math.cos(lat);
      this.land.set([c*Math.sin(lon),Math.sin(lat),c*Math.cos(lon)],i*3);
    });
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
  project(lat,lon){
    const a=lat*this.rad,b=(lon-this.lon)*this.rad,p=this.lat*this.rad,c=Math.cos(a);
    return [this.cx+this.radius*c*Math.sin(b),this.cy-this.radius*(Math.sin(a)*Math.cos(p)-c*Math.cos(b)*Math.sin(p)),Math.sin(a)*Math.sin(p)+c*Math.cos(b)*Math.cos(p)];
  }
  draw(){
    const {ctx:c,radius:r,cx,cy,dpr}=this;
    c.setTransform(dpr,0,0,dpr,0,0); c.clearRect(0,0,this.w,this.h);
    if(!r)return;
    const circle=()=>{c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);};
    const wash=c.createRadialGradient(cx-r*.32,cy-r*.48,0,cx,cy,r*1.18);
    wash.addColorStop(0,'#1b2a2b');wash.addColorStop(.7,'#101b1e');wash.addColorStop(1,'#0a1115');
    circle();c.fillStyle=wash;c.fill();
    // Curves are clipped at the horizon in geographic space.
    c.lineWidth=.65;c.strokeStyle='rgba(157,188,182,.16)';
    const trace=(count,coord)=>{let visible=false;for(let i=0;i<=count;i++){
      const [lat,lon]=coord(i),[x,y,z]=this.project(lat,lon);
      if(z>0){if(visible)c.lineTo(x,y);else c.moveTo(x,y);}visible=z>0;
    }};
    c.beginPath();for(let lat=-60;lat<=60;lat+=30)trace(144,i=>[lat,i*2.5-180]);
    for(let lon=-180;lon<180;lon+=30)trace(80,i=>[i*2.25-90,lon]);c.stroke();

    const a=this.lon*this.rad,b=this.lat*this.rad,sa=Math.sin(a),ca=Math.cos(a),sb=Math.sin(b),cb=Math.cos(b);
    const colors=['#344849','#475b5b','#596f6b','#71847c','#8b9b8e','#a7b1a0','#c4c9b4','#dce0c9'];
    const buckets=colors.map(()=>new Path2D()),v=this.land;
    const size=Math.max(.62,r*.0043);
    for(let i=0;i<v.length;i+=3){
      const x=v[i]*ca-v[i+2]*sa,zz=v[i]*sa+v[i+2]*ca;
      const y=v[i+1]*cb-zz*sb,z=v[i+1]*sb+zz*cb;
      if(z<=.015)continue;
      const light=.54-.38*x+.24*y+.13*z+Math.sin(i*2.7)*.042;
      const bucket=buckets[Math.max(0,Math.min(7,light*8|0))];
      const dx=cx+r*x,dy=cy-r*y,sz=size*(.50+.50*Math.sqrt(z));
      bucket.moveTo(dx+sz,dy);bucket.arc(dx,dy,sz,0,Math.PI*2);
    }
    buckets.forEach((path,i)=>{c.fillStyle=colors[i];c.fill(path);});
    const rim=c.createLinearGradient(cx-r,cy-r,cx+r,cy+r);
    rim.addColorStop(0,'rgba(201,219,202,.67)');rim.addColorStop(.48,'rgba(137,161,152,.21)');rim.addColorStop(1,'rgba(119,148,143,.07)');
    circle();c.strokeStyle=rim;c.lineWidth=.9;c.stroke();
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
