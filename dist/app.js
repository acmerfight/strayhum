const $=id=>document.getElementById(id);
const paths={play:'<path d="M8 5.8a.8.8 0 0 1 1.2-.7l9.1 6.2a.8.8 0 0 1 0 1.4l-9.1 6.2a.8.8 0 0 1-1.2-.7z" fill="currentColor" stroke="none"/>',pause:'<path d="M7 5h3.5v14H7zm6.5 0H17v14h-3.5z" fill="currentColor" stroke="none"/>',next:'<path d="m7 6 9 6-9 6z" fill="currentColor" stroke="none"/><path d="M18 6v12"/>',search:'<circle cx="10" cy="10" r="6.5"/><path d="m15 15 5 5"/>'};
function icon(key){return '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">'+paths[key]+'</svg>';}
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
let index=STATIONS.findIndex(s=>s.id==='beijing'),state='idle',audio=null,timeout=0;
const states={idle:'',connecting:'正在调频…',playing:'直播中',paused:'已暂停',failed:'连接失败，点此重试'};
function setState(s){state=s;document.body.classList.toggle('playing',s==='playing');$('status').textContent=states[s];
 const running=s==='playing'||s==='connecting';$('play').innerHTML=icon(running?'pause':'play');$('play').setAttribute('aria-label',running?'暂停':'播放');}
function stop(){clearTimeout(timeout);if(audio){const old=audio;audio=null;old.pause();old.removeAttribute('src');old.load();}}
function tune(source=0){
 stop();setState('connecting');const s=STATIONS[index],a=new Audio();audio=a;a.volume=.7;
 const fail=()=>{if(audio!==a)return;stop();if(source+1<s.urls.length){tune(source+1);}else setState('failed');};
 const watch=()=>{clearTimeout(timeout);timeout=setTimeout(fail,18000);};
 a.addEventListener('playing',()=>{if(audio===a){clearTimeout(timeout);setState('playing');}});
 a.addEventListener('waiting',()=>{if(audio===a){setState('connecting');watch();}});
 a.addEventListener('error',fail);a.addEventListener('ended',fail);
 a.src=s.urls[source];watch();a.play().catch(fail);
}
function display(){const s=STATIONS[index];$('name').textContent=s.name;$('meta').textContent=s.city+' · '+s.frequency;document.querySelectorAll('.row').forEach(el=>el.classList.toggle('active',Number(el.dataset.index)===index));}
function select(i){index=i;globe.focus(i);display();tune();}
const globe=new RadioGlobe(STATIONS,select);
function toggle(){if(state==='playing'||state==='connecting'){stop();setState('paused');}else tune();}
$('play').onclick=toggle;$('next').onclick=()=>select((index+1)%STATIONS.length);
const picker=$('picker');
$('browse').onclick=()=>{drawList();picker.showModal();$('search').focus();};
$('close').onclick=()=>picker.close();
picker.onclick=e=>{if(e.target===picker){const r=picker.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)picker.close();}};
function drawList(){
 const q=$('search').value.trim().toLowerCase();$('list').replaceChildren();
 STATIONS.forEach((s,i)=>{if(![s.name,s.city,s.cityEn,s.country,s.genre,s.frequency].join(' ').toLowerCase().includes(q))return;
 const row=document.createElement('button');row.className='row';row.dataset.index=i;
 row.innerHTML='<span class="sname"></span><span class="smeta"></span>';
 row.querySelector('.sname').textContent=s.name;row.querySelector('.smeta').textContent=s.city+' · '+s.genre;
 row.onclick=()=>{select(i);picker.close();};row.classList.toggle('active',i===index);$('list').append(row);
 });if(!$('list').children.length){const msg=document.createElement('p');msg.className='empty';msg.textContent='没有匹配的电台，试试其他城市或台名。';$('list').append(msg);}
}
$('search').oninput=drawList;
display();drawList();setState('idle');
