/* strayhum: one small station at a time. Listen; when you want somewhere else, drift.
   This file conducts: it starts tuning, flies the globe, holds the sound until the flight
   lands, and remembers the night. */
const $ = (id) => document.getElementById(id);
// A few servers send Safari to a plain-http address it cannot play; Safari never meets those stations.
const safari = /^((?!chrome|chromium|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);
const stations = window.STATIONS.filter((s) => !(safari && s.safari === false));
const memory = new Encounters(stations);
const receiver = new Receiver();
const credit = new TrackCredit($('credit'));
const plate = ['place', 'clock', 'name', 'genres', 'eyebrow'].map($);
const statusText = { idle: '', tuning: 'Tuning', onair: 'On air', paused: 'Paused', faded: 'The signal faded · drifting on' };

let current = memory.first(new URL(location.href).searchParams.get('station'));
let state = 'idle';
let token = 0;
let started = false;
let beaconTarget = 0.55;
let driftTimer = 0;
let preview = { i: null, touch: false };
let onPlate = null;

const globe = new Globe({
  stations,
  onChoose: (i) => go(i),
  onPreview: showPreview,
  onInteract: () => hint.after('globe'),
});
globe.reduced ||= localStorage.getItem('strayhum.motion') === 'off';

function setState(next) {
  state = next;
  document.body.dataset.state = next;
  $('status').textContent = statusText[next];
  const running = next === 'onair' || next === 'tuning';
  $('play').setAttribute('aria-label', running ? 'Pause' : 'Listen');
  globe.playing = running;
}

/** Tunes to a station: the globe flies there while the static plays, and the sound is let
    through only when the flight lands, so image and music arrive together. */
function go(i, { from = started ? current : null } = {}) {
  receiver.start();
  started = true;
  clearTimeout(driftTimer);
  closePreview();
  credit.clear();
  const t = ++token;
  const landing = globe.fly(i, { from });
  current = i;
  globe.focus(i);
  beaconTarget = 0.35;
  if (onPlate !== i) {
    leavePlate();
    // Filled by station rather than by tuning, so a pause mid-flight still leaves a caption.
    setTimeout(() => current === i && onPlate !== i && fillPlate(i, true), Math.max(0, (landing - performance.now()) * 0.42));
  }
  setState('tuning');
  history.replaceState(null, '', '?station=' + encodeURIComponent(stations[i].id));
  receiver.tune(stations[i], {
    onAir: () => {
      if (t !== token) return;
      setTimeout(() => t === token && arrive(i), Math.max(0, landing - performance.now()));
    },
    onFade: () => t === token && fade(i),
  });
}

function arrive(i) {
  if (state === 'onair') return;
  receiver.arrive();
  setState('onair');
  beaconTarget = 1;
  // The first sound leaves the station as one wide ring.
  globe.ring(1, 0.55);
  memory.arrive(i);
  refreshMemory();
  credit.follow(stations[i].id);
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
  beaconTarget = 0.55;
  setState('paused');
}

function toggle() {
  if (state === 'onair' || state === 'tuning') pause();
  else go(current, { from: current });
}

function drift() {
  go(memory.next(current));
  hint.after('drift');
}

function keep() {
  const kept = memory.toggleKeep(current);
  $('keep').setAttribute('aria-pressed', String(kept));
  $('keep').setAttribute('aria-label', kept ? 'Kept. Select to let go' : 'Keep this station');
  refreshMemory();
}

/* Plate ------------------------------------------------------------------ */

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
  document.querySelector('#here .city').textContent = s.city;
  document.title = `${s.name} — ${s.city} · strayhum`;
  if (animate && !globe.reduced) enterPlate();
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
  if (globe.reduced) return;
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
  const [place, clock, name, genres] = plate;
  for (const el of plate) el.getAnimations().forEach((a) => a.cancel());
  // The place resolves as if read off a map: letters close up as they appear.
  place.animate([{ opacity: 0, letterSpacing: '.5em' }, { opacity: 1, letterSpacing: '.22em' }], { duration: 1100, easing: ease, fill: 'backwards' });
  clock.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, delay: 380, easing: ease, fill: 'backwards' });
  name.animate([{ opacity: 0, transform: 'translateY(16px)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], {
    duration: 1150,
    delay: 140,
    easing: ease,
    fill: 'backwards',
  });
  genres.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 900, delay: 320, easing: ease, fill: 'backwards' });
}

/* Globe labels ------------------------------------------------------------ */

function showPreview(i, touch) {
  const near = $('near');
  if (i === null) return closePreview();
  if (preview.i !== i) {
    near.querySelector('.city').textContent = stations[i].city;
    near.querySelector('.station').textContent = stations[i].name;
  }
  preview = { i, touch };
  near.classList.toggle('preview', touch);
}

function closePreview() {
  preview = { i: null, touch: false };
  globe.previewed = null;
  $('near').classList.remove('preview');
}

$('near').querySelector('.go').addEventListener('click', () => preview.i !== null && go(preview.i));

/* Memory: kept stations and tonight's route ----------------------------------- */

function refreshMemory() {
  const kept = new Set(memory.keptIndices().map((k) => k.i));
  globe.refreshMarks(kept, memory.heardSet());
  const n = kept.size;
  $('kept-count').textContent = n ? String(n) : '';
}

function renderLog() {
  const list = $('kept-list');
  list.replaceChildren();
  for (const { i } of memory.keptIndices()) {
    const s = stations[i];
    const li = document.createElement('li');
    const open = document.createElement('button');
    open.className = 'open';
    open.innerHTML = '<strong></strong><span></span>';
    open.querySelector('strong').textContent = s.name;
    open.querySelector('span').textContent = `${s.city}, ${s.country} · ${clockAt(s)}`;
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
  if (!path.length) route.innerHTML = '<li class="empty">Where you listen tonight is drawn on the globe.</li>';
}

/* First-visit hints: one sentence at a time, then never again. --------------- */

const hint = {
  seen: localStorage.getItem('strayhum.seen') === '1',
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
    if (this.seen) return;
    if (moment === 'arrive' && !this.dragged) this.show('Every light is a station. Drag the earth, or drift.', 9000);
    if (moment === 'globe') this.dragged = true;
    if (moment === 'drift') {
      this.seen = true;
      localStorage.setItem('strayhum.seen', '1');
      this.hide();
    }
  },
};

/* Controls ------------------------------------------------------------------ */

$('play').onclick = toggle;
$('drift').onclick = drift;
$('keep').onclick = keep;
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
$('motion-toggle').checked = !globe.reduced;
$('motion-toggle').onchange = (e) => {
  globe.reduced = !e.target.checked;
  localStorage.setItem('strayhum.motion', e.target.checked ? 'on' : 'off');
};

addEventListener('keydown', (e) => {
  if ($('log').open || e.metaKey || e.ctrlKey || e.altKey) return;
  const onControl = e.target.closest?.('button, input');
  if (e.key === ' ' && !onControl) {
    e.preventDefault();
    toggle();
  } else if (e.key === 'd' || e.key === 'D' || (e.key === 'ArrowRight' && e.target !== $('ink') && !onControl)) {
    drift();
  } else if (e.key === 'k' || e.key === 'K') {
    keep();
  } else if (e.key === 'Escape') {
    closePreview();
  }
});

/* Frame loop ---------------------------------------------------------------- */

let last = performance.now();
let revealStart = null;

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const sound = state === 'onair' ? receiver.sample(dt) : null;
  if (sound?.hit) globe.ring(sound.hit * 0.85, sound.score.speed);
  globe.beaconOn = (globe.beaconOn ?? 0) + (beaconTarget - (globe.beaconOn ?? 0)) * Math.min(1, dt * 2.5);
  if (revealStart !== null) globe.reveal = globe.reduced ? 1 : Math.min(1, (now - revealStart) / 2800);
  globe.frame(now, dt, sound);
  document.body.style.setProperty('--level', (sound?.level ?? 0).toFixed(3));
  if (!document.hidden) requestAnimationFrame(frame);
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    last = performance.now();
    requestAnimationFrame(frame);
  }
});

setInterval(() => {
  $('clock').textContent = clockAt(stations[current]);
  globe.sun = sunDirection(new Date());
}, 15000);

/* Start --------------------------------------------------------------------- */

{
  const s = stations[current];
  // Begin a little to the west of the first encounter, so the earth turns it into view.
  globe.lon = s.lon - 34;
  globe.lat = clamp(s.lat * 0.7, -50, 55);
  globe.focus(current);
  globe.remember(memory.path());
  refreshMemory();
  fillPlate(current, false);
  setState('idle');
  if (!hint.seen) hint.show('Listen. When you want somewhere else, drift.');
  (globe.ok ? globe.sky.ready : Promise.resolve()).then(() => (revealStart = performance.now()));
  requestAnimationFrame(frame);
}
