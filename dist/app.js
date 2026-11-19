const $ = (id) => document.getElementById(id);
const paths = {
  play: '<path d="M8 5.8a.8.8 0 0 1 1.2-.7l9.1 6.2a.8.8 0 0 1 0 1.4l-9.1 6.2a.8.8 0 0 1-1.2-.7z" fill="currentColor" stroke="none"/>',
  pause:
    '<path d="M7 5h3.5v14H7zm6.5 0H17v14h-3.5z" fill="currentColor" stroke="none"/>',
  next: '<path d="m7 6 9 6-9 6z" fill="currentColor" stroke="none"/><path d="M18 6v12"/>',
  search: '<circle cx="10" cy="10" r="6.5"/><path d="m15 15 5 5"/>',
};
function icon(key) {
  return (
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">' +
    paths[key] +
    "</svg>"
  );
}
document
  .querySelectorAll("[data-icon]")
  .forEach((el) => (el.innerHTML = icon(el.dataset.icon)));
let index = Math.max(
    0,
    STATIONS.findIndex((s) => s.id === "fip"),
  ),
  state = "idle",
  audio = null,
  timeout = 0;
const live = new LiveSignal();
const credit = new TrackCredit($("credit"));
let sceneTimer;
const states = {
  idle: "Listen live",
  connecting: "Tuning…",
  playing: "On air",
  paused: "Paused",
  failed: "Signal lost · retry",
};
function setState(s) {
  const changed = state !== s;
  state = s;
  document.body.dataset.playback = s;
  globe.broadcast(s === "playing");
  document.body.classList.toggle("playing", s === "playing");
  $("status").textContent = states[s];
  if (s === "playing" && changed) {
    clearTimeout(sceneTimer);
    const remaining = globe.reduced
      ? 0
      : Math.max(0, (globe.flightEnd || 0) - performance.now());
    sceneTimer = setTimeout(() => {
      if (state === "playing" && !globe.exploring) showIdentity(true);
    }, remaining);
    credit.follow(STATIONS[index].id);
  } else if (s !== "playing") {
    clearTimeout(sceneTimer);
    credit.clear();
    // A short rebuffer keeps the listening layout. A new selection explicitly resets it.
    if (s !== "connecting") showIdentity(false);
  }
  const running = s === "playing" || s === "connecting";
  $("play").innerHTML = icon(running ? "pause" : "play");
  $("play").setAttribute("aria-label", running ? "Pause" : "Play");
}
function stop() {
  clearTimeout(timeout);
  live.detach();
  $("spectrum").hidden = true;
  if (audio) {
    const old = audio;
    audio = null;
    old.pause();
    old.removeAttribute("src");
    old.load();
  }
}
function tune(source = 0, analyse = true) {
  stop();
  setState("connecting");
  const s = STATIONS[index],
    a = new Audio();
  audio = a;
  a.volume = 0.7;
  const fail = () => {
    if (audio !== a) return;
    stop();
    if (analyse) {
      tune(source, false);
      return;
    }
    if (source + 1 < s.urls.length) tune(source + 1);
    else setState("failed");
  };
  const watch = () => {
    clearTimeout(timeout);
    timeout = setTimeout(fail, 12000);
  };
  a.addEventListener("playing", () => {
    if (audio === a) {
      clearTimeout(timeout);
      setState("playing");
      $("spectrum").hidden = !live.analyser;
    }
  });
  a.addEventListener("waiting", () => {
    if (audio === a) {
      setState("connecting");
      watch();
    }
  });
  a.addEventListener("error", fail);
  a.addEventListener("ended", fail);
  if (analyse) {
    a.crossOrigin = "anonymous";
    live.target = a;
    live
      .attach(a)
      .then(() => {
        if (audio === a && state === "playing")
          $("spectrum").hidden = !live.analyser;
      })
      .catch(fail);
  }
  a.src = s.urls[source];
  watch();
  a.play().catch(fail);
}
let cityClock;
function updateClock() {
  if (cityClock) $("clock").textContent = cityClock.format(new Date());
}
function showIdentity(listening, stationChanged = false) {
  const mode = listening ? "listening" : "exploring";
  if (document.body.dataset.scene === mode && !stationChanged) return;
  const s = STATIONS[index],
    head = $("headline"),
    sub = $("subhead");
  const swap = document.body.dataset.scene && !stationChanged && !globe.reduced;
  document.querySelector(".title-echo")?.remove();
  for (const el of [head, sub]) el.getAnimations().forEach((a) => a.cancel());
  if (swap) {
    const echo = document.createElement("span");
    const box = head.getBoundingClientRect();
    const style = getComputedStyle(head);
    echo.className = "title-echo";
    echo.setAttribute("aria-hidden", "true");
    echo.textContent = head.textContent;
    for (const key of [
      "fontFamily",
      "fontSize",
      "fontStyle",
      "fontWeight",
      "lineHeight",
      "letterSpacing",
      "color",
      "overflowWrap",
    ]) {
      echo.style[key] = style[key];
    }
    Object.assign(echo.style, {
      left: box.left + "px",
      top: box.top + "px",
      width: box.width + "px",
    });
    document.body.append(echo);
    const outgoing = echo.animate(
      [
        { opacity: 1 },
        { opacity: 0, transform: "translateY(-7px) scale(.98)" },
      ],
      { duration: 190, easing: "ease-in", fill: "forwards" },
    );
    outgoing.onfinish = () => echo.remove();
  }
  document.body.dataset.scene = mode;
  head.textContent = listening ? s.name : s.city;
  sub.textContent = listening ? s.city : s.name;
  head.classList.toggle("long", head.textContent.length > (listening ? 14 : 9));
  head.classList.toggle(
    "medium",
    listening && head.textContent.length >= 8 && head.textContent.length <= 14,
  );
  if (!swap) return;
  for (const el of [head, sub]) {
    el.animate(
      [
        { opacity: 0, transform: "translateY(8px)" },
        { opacity: 1, transform: "none" },
      ],
      {
        delay: el === head ? 185 : 270,
        duration: listening ? 520 : 280,
        easing: "cubic-bezier(.18,.72,.25,1)",
        fill: "backwards",
      },
    );
  }
}
function display() {
  const s = STATIONS[index];
  showIdentity(false, true);
  $("place").textContent = s.country;
  $("genre").textContent = s.genre;
  $("freq").textContent = s.frequency;
  $("clock-place").textContent = s.city;
  const coord = (n, plus, minus) =>
    Math.abs(n).toFixed(1) + "°" + (n < 0 ? minus : plus);
  $("coordinates").textContent =
    coord(s.lat, "N", "S") + "  " + coord(s.lon, "E", "W");
  const value = parseFloat(s.frequency),
    fm = Number.isFinite(value);
  document.querySelector(".dial-line").hidden = !fm;
  if (fm)
    $("needle").style.left =
      Math.min(100, Math.max(0, ((value - 87.5) / 20.5) * 100)) + "%";
  cityClock = new Intl.DateTimeFormat("en-GB", {
    timeZone: s.zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  updateClock();
  document
    .querySelectorAll(".row")
    .forEach((el) =>
      el.classList.toggle("active", Number(el.dataset.index) === index),
    );
}
setInterval(updateClock, 15000);
function select(i) {
  index = i;
  globe.focus(i);
  display();
  tune();
}
const globe = new RadioGlobe(STATIONS, select);
globe.signal = live;
globe.onExplore = () => {
  if (state !== "playing") return;
  clearTimeout(sceneTimer);
  showIdentity(false);
  if (!globe.exploring) {
    sceneTimer = setTimeout(() => {
      if (state === "playing") showIdentity(true);
    }, 1000);
  }
};
function motionUI() {
  const label = globe.reduced ? "Resume visual motion" : "Pause visual motion";
  $("motion").setAttribute("aria-label", label);
  $("motion").title = label;
  $("motion").innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M2 12c3-10 4 11 7 0s4 11 7 0 4 3 6 0"/>' +
    (globe.reduced ? '<path d="M3 21 21 3"/>' : "") +
    "</svg>";
}
$("motion").onclick = () => {
  globe.setReduced(!globe.reduced);
  motionUI();
};
motionUI();
function toggle() {
  if (state === "playing" || state === "connecting") {
    stop();
    setState("paused");
  } else tune();
}
const family = $("family");
for (const value of [
  ...new Set(STATIONS.map((s) => s.family || s.genre)),
].sort()) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = value;
  family.append(option);
}
$("play").onclick = toggle;
$("next").onclick = () => {
  const picks = STATIONS.map((s, i) => ({ s, i })).filter(
    ({ s }) => !family.value || (s.family || s.genre) === family.value,
  );
  const current = picks.findIndex((p) => p.i === index);
  if (picks.length) select(picks[(current + 1) % picks.length].i);
};
const picker = $("picker");
$("browse").onclick = () => {
  drawList();
  picker.showModal();
  $("search").focus();
};
$("close").onclick = () => picker.close();
picker.onclick = (e) => {
  if (e.target === picker) {
    const r = picker.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      picker.close();
  }
};
function drawList() {
  const q = $("search").value.trim().toLowerCase();
  $("list").replaceChildren();
  STATIONS.forEach((s, i) => {
    if (family.value && (s.family || s.genre) !== family.value) return;
    if (
      ![s.name, s.city, s.country, s.genre, s.family, s.frequency]
        .join(" ")
        .toLowerCase()
        .includes(q)
    )
      return;
    const row = document.createElement("button");
    row.className = "row";
    row.dataset.index = i;
    row.innerHTML =
      '<span class="station-id"><span class="sname"></span><small></small></span><span class="smeta"></span>';
    row.querySelector(".sname").textContent = s.name;
    row.querySelector("small").textContent = s.city + ", " + s.country;
    row.querySelector(".smeta").textContent = s.genre;
    row.onclick = () => {
      select(i);
      picker.close();
    };
    row.classList.toggle("active", i === index);
    $("list").append(row);
  });
  const count = $("list").children.length;
  $("count").textContent = count + " " + (count === 1 ? "station" : "stations");
  if (!count) {
    const msg = document.createElement("p");
    msg.className = "empty";
    msg.textContent = "No stations found. Try a city, country or genre.";
    $("list").append(msg);
  }
}
$("search").oninput = drawList;
family.onchange = drawList;
display();
drawList();
setState("idle");
