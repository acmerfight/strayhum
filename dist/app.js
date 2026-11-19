/* Stray Hum: one small station at a time, from anywhere on earth. Listen; when you want somewhere
   else, drift, and the Earth turns to it; or turn the Earth yourself. This file conducts: it
   starts tuning, turns the Earth, holds the sound until the station faces you, and remembers the
   night. The Earth itself is earth.js. */
const $ = (id) => document.getElementById(id);
// A few servers send Safari to a plain-http address it cannot play; Safari never meets those stations.
const safari = /^((?!chrome|chromium|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);
const stations = window.STATIONS.filter((s) => !(safari && s.safari === false));
const memory = new Encounters(stations);
const receiver = new Receiver();
const credit = new NowPlaying($('credit'));
const outlook = new Outlook(stations);
const plate = ['clock', 'place', 'name', 'genres', 'conditions'].map($);
const statusText = {
  idle: '',
  tuning: 'Tuning',
  onair: 'On air',
  paused: 'Paused',
  faded: 'The signal faded · drifting on',
  wandering: 'Let go to land',
};
const params = new URL(location.href).searchParams;

let current = memory.first(params.get('station'));
const sent = params.has('sent') && stations[current].id === params.get('station');
let state = 'idle';
let token = 0;
let driftTimer = 0;
let onPlate = null;
let wandering = false;
let voyage = null;

outlook.reduced ||= localStorage.getItem('strayhum.motion') === 'off';
outlook.onPass = (i, speed) => {
  receiver.pass(speed);
  showPassing(i);
};
outlook.onHover = (i) => showFinder(i, false);
outlook.onPick = (i, touch) => {
  // A tap first names the light; selecting it again, or Listen, goes there.
  if (touch && finder.i !== i) showFinder(i, true);
  else go(i);
};


function setState(next) {
  state = next;
  document.body.dataset.state = next;
  $('status').textContent = statusText[next];
  const running = next === 'onair' || next === 'tuning' || next === 'wandering';
  $('play').setAttribute('aria-label', running ? 'Pause' : 'Listen');
  // While something plays, the Earth turns back to it when left alone.
  outlook.playing = running;
}

/** Tunes to a station: the window travels there while the static plays, and the sound is let
    through only when it lands, so the sky and the music arrive together. */
function go(i) {
  showFinder(null);
  receiver.start();
  clearTimeout(driftTimer);
  credit.clear();
  const t = ++token;
  const from = current;
  const { estimate, landed } = outlook.fly(i);
  current = i;
  setVoyage(from, i, estimate);
  if (onPlate !== i) {
    leavePlate();
    // Filled by station rather than by tuning, so a pause mid-flight still leaves a caption.
    setTimeout(() => current === i && onPlate !== i && fillPlate(i, true), Math.max(0, (estimate - performance.now()) * 0.7));
  }
  // The weather is asked for at once, and settles in when the view lands.
  weatherAt(stations[i]).then((w) => landed.then(() => current === i && settleWeather(i, w)));
  setState('tuning');
  history.replaceState(null, '', '?station=' + encodeURIComponent(stations[i].id));
  receiver.tune(stations[i], {
    onAir: () => t === token && landed.then(() => t === token && arrive(i)),
    onFade: () => t === token && fade(i),
  });
}

function arrive(i) {
  if (state === 'onair') return;
  receiver.arrive();
  setState('onair');
  // The first sound leaves the station as one wide, slow ring.
  outlook.arrival();
  memory.arrive(i);
  refreshMemory();
  credit.follow(stations[i]);
  hint.after('arrive');
}

function fade(i) {
  memory.fade(i);
  setState('faded');
  driftTimer = setTimeout(() => go(memory.next(i)), 1700);
}

function pause() {
  token++;
  clearTimeout(driftTimer);
  receiver.stop();
  credit.clear();
  setState('paused');
}

function toggle() {
  if (state === 'onair' || state === 'tuning') pause();
  else go(current);
}

function drift() {
  go(memory.next(current));
  hint.after('drift');
}

/** Holding Drift turns the world past the window; letting go lands on the station nearest. */
function startWander() {
  receiver.start();
  token++;
  clearTimeout(driftTimer);
  credit.clear();
  receiver.wander();
  wandering = true;
  outlook.startWander();
  leavePlate();
  onPlate = null;
  setState('wandering');
  hint.after('wander');
}

function land() {
  wandering = false;
  outlook.stopWander();
  hidePassing();
  go(outlook.nearest());
}

/** Sends this station: the system share sheet on phones, a copied link elsewhere. */
async function share() {
  const s = stations[current];
  const url = `https://strayhum.com/?station=${encodeURIComponent(s.id)}&sent`;
  try {
    if (matchMedia('(pointer: coarse)').matches && navigator.share) {
      await navigator.share({ title: `${s.name} — ${s.city}`, text: `Something I found on Stray Hum: ${s.name}, ${s.city}.`, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    flash('Link copied');
  } catch {
    // The share sheet was dismissed.
  }
}

/** A word in the status line for a moment, then back to the state. */
function flash(text) {
  $('status').textContent = text;
  clearTimeout(flash.timer);
  flash.timer = setTimeout(() => ($('status').textContent = statusText[state]), 1800);
}

function keep() {
  const kept = memory.toggleKeep(current, credit.line);
  $('keep').setAttribute('aria-pressed', String(kept));
  $('keep').setAttribute('aria-label', kept ? 'Kept. Select to let go' : 'Keep this station');
  refreshMemory();
}

/* The caption ---------------------------------------------------------------- */

const clocks = new Map();

function clockAt(station) {
  if (!clocks.has(station.zone)) {
    clocks.set(station.zone, new Intl.DateTimeFormat('en-GB', { timeZone: station.zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }));
  }
  return clocks.get(station.zone).format(new Date());
}

function fillPlate(i, animate) {
  const s = stations[i];
  onPlate = i;
  $('place').textContent = s.city === s.country ? s.city : `${s.city}, ${s.country}`;
  $('clock').textContent = clockAt(s);
  // Didone dashes are hairlines at display sizes; a middle dot keeps the separation visible.
  $('name').textContent = s.name.replace(/\s[–—-]\s/g, ' · ');
  $('genres').textContent = [s.alias, ...s.genres, s.freq].filter(Boolean).join(' · ');
  $('name').style.setProperty('--name-size', nameSize(s.name) + 'px');
  $('keep').setAttribute('aria-pressed', String(memory.isKept(i)));
  writeConditions(i, weatherCache.get(s.id)?.weather);
  document.title = `${s.name} — ${s.city} · Stray Hum`;
  if (animate && !outlook.reduced) enterPlate();
}

/** "Light rain · 14° · 9 hours ahead of you": the place, felt from where you are. */
function writeConditions(i, weather) {
  const s = stations[i];
  const parts = [];
  if (weather?.words) parts.push(weather.words[0].toUpperCase() + weather.words.slice(1));
  if (weather?.temperature !== null && weather?.temperature !== undefined) parts.push(temperatureText(weather.temperature));
  parts.push(timeFromYou(s.zone));
  $('conditions').textContent = parts.join(' · ');
}

function settleWeather(i, weather) {
  outlook.weatherTarget = { ...weather };
  writeConditions(i, weather);
}

/** Display size for a station name: long names step down so the caption keeps two lines at most. */
function nameSize(name) {
  const w = innerWidth;
  const portrait = w < 720 || w / innerHeight < 0.8;
  const short = !portrait && innerHeight < 560;
  const base = portrait ? clamp(w * 0.105, 36, 56) : short ? clamp(w * 0.054, 34, 60) : clamp(w * 0.058, 52, 100);
  const n = [...name].length;
  return Math.round(base * (n <= 10 ? 1 : n <= 16 ? 0.84 : n <= 24 ? 0.7 : 0.58));
}

function leavePlate() {
  if (outlook.reduced) return;
  plate.forEach((el, k) =>
    el.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(-8px)' }], {
      duration: 260,
      delay: k * 25,
      easing: 'cubic-bezier(.5,0,.75,0)',
      fill: 'forwards',
    }),
  );
}

function enterPlate() {
  const ease = 'cubic-bezier(.16,.84,.24,1)';
  const [clock, place, name, genres, conditions] = plate;
  for (const el of plate) el.getAnimations().forEach((a) => a.cancel());
  // The place resolves as if read off a map: letters close up as they appear.
  place.animate([{ opacity: 0, letterSpacing: '.5em' }, { opacity: 1, letterSpacing: '.22em' }], { duration: 1100, easing: ease, fill: 'backwards' });
  clock.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, delay: 380, easing: ease, fill: 'backwards' });
  name.animate([{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: 1150, delay: 140, easing: ease, fill: 'backwards' });
  genres.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 900, delay: 320, easing: ease, fill: 'backwards' });
  conditions.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 900, delay: 520, easing: ease, fill: 'backwards' });
}

/* The Earth by hand: turn it, find a light, listen ----------------------------------- */

const finder = { i: null, touch: false };

function showFinder(i, touch) {
  finder.i = i;
  finder.touch = touch;
  const el = $('finder');
  el.classList.toggle('touch', Boolean(touch));
  if (i === null) {
    el.classList.remove('shown');
    return;
  }
  const s = stations[i];
  el.querySelector('.city').textContent = `${s.city} · ${clockAt(s)}`;
  el.querySelector('.station').textContent = s.name.replace(/\s[–—-]\s/g, ' · ');
  el.querySelector('.sound').textContent = s.genres.join(' · ');
  placeFinder();
  el.classList.add('shown');
}

function placeFinder() {
  if (finder.i === null) return;
  const at = outlook.screenOf(finder.i);
  const el = $('finder');
  if (!at) {
    el.classList.remove('shown');
    return;
  }
  el.style.transform = `translate(${Math.round(at[0])}px, ${Math.round(at[1])}px)`;
  el.classList.toggle('left', at[0] > innerWidth - 300);
}

$('finder').querySelector('.go').addEventListener('click', () => finder.i !== null && go(finder.i));

/* In the sky: the voyage, and the cities the dial passes ---------------------------- */

/** "Accra → Tokyo", with the distance counting up as the window travels. */
function setVoyage(from, to, landing) {
  const a = stations[from];
  const b = stations[to];
  const km = kilometres(unitVector(a.lat, a.lon), unitVector(b.lat, b.lon));
  if (from === to || km < 50 || outlook.reduced) {
    voyage = null;
    $('voyage').classList.remove('shown');
    return;
  }
  voyage = { km, landing };
  $('route-from').textContent = a.city;
  $('route-to').textContent = b.city;
  const hours = Math.round((zoneOffset(b.zone) - zoneOffset(a.zone)) / 30) / 2;
  $('route-time').textContent = hours ? `${hours > 0 ? '+' : '−'}${Math.abs(hours)} h` : 'same hour';
  $('voyage').classList.add('shown');
}

function drawVoyage() {
  if (!voyage) return;
  $('route-km').textContent = `${Math.round(voyage.km * outlook.progress).toLocaleString('en-US')} km`;
  if (performance.now() > voyage.landing + 900) {
    voyage = null;
    $('voyage').classList.remove('shown');
  }
}

function showPassing(i) {
  const el = $('passing');
  el.querySelector('.city').textContent = stations[i].city;
  el.querySelector('time').textContent = clockAt(stations[i]);
  el.classList.remove('shown');
  void el.offsetWidth;
  el.classList.add('shown');
}

function hidePassing() {
  $('passing').classList.remove('shown');
}

/* Memory: kept stations and tonight's route ----------------------------------- */

function refreshMemory() {
  const kept = memory.keptIndices();
  $('kept-count').textContent = kept.length ? String(kept.length) : '';
  outlook.markKept(new Set(kept.map((k) => k.i)));
}

function renderLog() {
  const list = $('kept-list');
  list.replaceChildren();
  for (const { i, song } of memory.keptIndices()) {
    const s = stations[i];
    const li = document.createElement('li');
    const open = document.createElement('button');
    open.className = 'open';
    open.innerHTML = '<strong></strong><span></span><em></em>';
    open.querySelector('strong').textContent = s.name;
    open.querySelector('span').textContent = `${s.city}, ${s.country} · ${clockAt(s)}`;
    // The song that was playing when it was kept, if the station said.
    open.querySelector('em').textContent = song || '';
    open.onclick = () => {
      $('log').close();
      go(i);
    };
    const remove = document.createElement('button');
    remove.className = 'remove';
    remove.setAttribute('aria-label', `Let go of ${s.name}`);
    remove.textContent = '×';
    remove.onclick = () => {
      memory.toggleKeep(i);
      if (i === current) $('keep').setAttribute('aria-pressed', 'false');
      refreshMemory();
      renderLog();
    };
    li.append(open, remove);
    list.append(li);
  }
  $('kept-empty').hidden = list.children.length > 0;

  const route = $('night-list');
  route.replaceChildren();
  const format = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const path = memory.path();
  path.forEach(({ i, at }, k) => {
    const li = document.createElement('li');
    li.classList.toggle('now', k === path.length - 1 && i === current && state === 'onair');
    li.innerHTML = '<time></time><span></span>';
    li.querySelector('time').textContent = format.format(at);
    li.querySelector('span').textContent = `${stations[i].city} · ${stations[i].name}`;
    route.append(li);
  });
  if (!path.length) route.innerHTML = '<li class="empty">The places you listen tonight will be here.</li>';
}

/* First-visit hints: one sentence at a time, then never again. --------------- */

const hint = {
  seen: localStorage.getItem('strayhum.seen') === '1',
  dial: localStorage.getItem('strayhum.dial') === '1',
  show(text, ms) {
    const el = $('hint');
    el.textContent = text;
    el.hidden = false;
    el.style.opacity = '1';
    clearTimeout(this.timer);
    if (ms) this.timer = setTimeout(() => this.hide(), ms);
  },
  hide() {
    $('hint').style.opacity = '0';
    this.timer = setTimeout(() => ($('hint').hidden = true), 800);
  },
  after(moment) {
    if (moment === 'wander' && !this.dial) {
      this.dial = true;
      localStorage.setItem('strayhum.dial', '1');
      this.hide();
    }
    if (moment === 'arrive' && this.seen && !this.dial) this.show('Hold Drift to turn the world past the window.', 7000);
    if (this.seen) return;
    if (moment === 'arrive') this.show('Every light is a station. Turn the Earth, or drift.', 8000);
    if (moment === 'drift') {
      this.seen = true;
      localStorage.setItem('strayhum.seen', '1');
    }
  },
};

/* Controls ------------------------------------------------------------------ */

$('play').onclick = toggle;
$('keep').onclick = keep;
$('share').onclick = share;

// Drift: a press drifts by chance; a hold turns the world.
{
  const button = $('drift');
  let hold = 0;
  let held = false;
  button.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    button.setPointerCapture(e.pointerId);
    held = false;
    hold = setTimeout(() => {
      held = true;
      startWander();
    }, 280);
  });
  const release = () => {
    clearTimeout(hold);
    if (wandering) land();
  };
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('contextmenu', (e) => e.preventDefault());
  button.addEventListener('click', () => {
    if (held) held = false;
    else drift();
  });
}
$('log-open').onclick = () => {
  renderLog();
  $('log').showModal();
};
$('log-close').onclick = () => $('log').close();
$('log').addEventListener('click', (e) => e.target === $('log') && $('log').close());
$('volume').value = String(receiver.volume);
$('volume').oninput = (e) => receiver.setVolume(Number(e.target.value));
$('static-toggle').checked = receiver.staticOn;
$('static-toggle').onchange = (e) => receiver.setStatic(e.target.checked);
$('motion-toggle').checked = !outlook.reduced;
$('motion-toggle').onchange = (e) => {
  outlook.reduced = !e.target.checked;
  localStorage.setItem('strayhum.motion', e.target.checked ? 'on' : 'off');
};

let keyHold = 0;
addEventListener('keydown', (e) => {
  if ($('log').open || e.metaKey || e.ctrlKey || e.altKey) return;
  const onControl = e.target.closest?.('button, input');
  if (e.key === ' ' && !onControl) {
    e.preventDefault();
    toggle();
  } else if ((e.key === 'd' || e.key === 'D') && !e.repeat) {
    // As with the button: tap to drift, hold to turn the world.
    keyHold = setTimeout(startWander, 280);
  } else if (e.key === 'ArrowRight' && !onControl) {
    drift();
  } else if (e.key === 'k' || e.key === 'K') {
    keep();
  } else if (e.key === 'Escape') {
    showFinder(null);
  }
});
addEventListener('keyup', (e) => {
  if (e.key !== 'd' && e.key !== 'D') return;
  clearTimeout(keyHold);
  if (wandering) land();
  else if (!$('log').open && !e.metaKey && !e.ctrlKey && !e.altKey) drift();
});

/* Frame loop ---------------------------------------------------------------- */

let last = performance.now();
let revealStart = performance.now();
let slow = 0;

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  // Two seconds of slow frames: render fewer pixels.
  slow = dt > 0.024 ? slow + dt : Math.max(0, slow - dt);
  if (slow > 2) {
    slow = 0;
    outlook.degrade();
  }
  const sound = state === 'onair' ? receiver.sample(dt) : null;
  outlook.reveal = outlook.reduced ? 1 : Math.min(1, (now - revealStart) / 2200);
  const light = outlook.frame(now, dt, sound);
  document.body.dataset.tone = outlook.tone;
  // Fallback without WebGL2: the page itself carries the sky's colours.
  if (!outlook.ok) paintFallback(light);
  drawVoyage();
  placeFinder();
  document.body.style.setProperty('--pulse', outlook.pulse.toFixed(3));
  if (!document.hidden) requestAnimationFrame(frame);
}

function paintFallback(light) {
  const css = (c) => `rgb(${c.map((x) => Math.round(clamp(x, 0, 1) * 255)).join(',')})`;
  document.body.style.background = `linear-gradient(${css(light.zenith)}, ${css(light.horizon)} var(--horizon), #05070c var(--horizon))`;
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    last = performance.now();
    requestAnimationFrame(frame);
  }
});

setInterval(() => {
  $('clock').textContent = clockAt(stations[current]);
}, 15000);

/* Start --------------------------------------------------------------------- */

{
  const s = stations[current];
  outlook.stand(current);
  refreshMemory();
  fillPlate(current, false);
  const first = current;
  weatherAt(s).then((w) => current === first && settleWeather(first, w));
  if (sent) $('eyebrow').textContent = 'Someone sent you this';
  setState('idle');
  // A still for link previews: no controls, the name set over the sea.
  if (params.has('poster')) {
    document.body.classList.add('poster');
    outlook.resize();
  }
  if (!hint.seen) hint.show('Listen. When you want somewhere else, drift.');
  requestAnimationFrame(frame);
}
