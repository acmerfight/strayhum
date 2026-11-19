/* What is on air, where the broadcaster says so: FIP, KEXP and Radio Swiss Jazz publish their
   own playlists; other stations expose their stream server's status. Only songs are shown:
   station IDs, adverts and programme names are left out, and mis-decoded titles are repaired. */
const FEEDS = {
  fip: {
    url: 'https://api.radiofrance.fr/livemeta/pull/7',
    read(data, now) {
      const song = Object.values(data.steps || {})
        .filter((s) => s.embedType === 'song' && s.start * 1000 <= now && now < s.end * 1000)
        .sort((a, b) => b.start - a.start)[0];
      if (song) return { title: song.title, artist: song.highlightedArtists?.join(', ') || song.performers || song.authors, expires: song.end * 1000 };
    },
  },
  kexp: {
    url: 'https://api.kexp.org/v2/plays/?limit=1&ordering=-airdate',
    read(data, now) {
      const play = data.results?.[0];
      const start = Date.parse(play?.airdate);
      if (play?.play_type === 'trackplay' && start <= now && now < start + 12 * 60000) return { title: play.song, artist: play.artist, expires: start + 12 * 60000 };
    },
  },
  swissjazz: {
    url:
      'https://ssatr.playlist-api.deliver.media/graphql?' +
      new URLSearchParams({ query: '{ channel(id: "0191e9e4-db19-77eb-8bf1-92d9f3c9e4c5") { playingnow { current { start_time duration_ms metadata { title artist } } } } }' }),
    read(data, now) {
      const song = data.data?.channel?.playingnow?.current;
      const start = Date.parse(song?.start_time);
      const expires = start + song?.duration_ms;
      if (Number.isFinite(expires) && start <= now && now < expires) return { title: song.metadata?.title, artist: song.metadata?.artist, expires };
    },
  },
};

const SERVERS = {
  icecast(data, station) {
    const list = [data.icestats?.source ?? []].flat();
    const source = list.length === 1 ? list[0] : list.find((s) => new URL(s.listenurl || 'https://x/').pathname.replace(/\/$/, '') === station.np.mount);
    if (source?.artist && source?.title) return { artist: source.artist, title: source.title };
    return source?.title ? splitSong(source.title) : null;
  },
  azuracast(data) {
    const song = data.now_playing?.song;
    if (!song) return null;
    const expires = Date.now() + Math.max(5, data.now_playing.remaining ?? 20) * 1000;
    return song.artist && song.title ? { artist: song.artist, title: song.title, expires } : splitSong(song.text || '');
  },
};

const NOT_A_SONG = /\b(advert|commercial|comercial|publicidad|werbung|jingle|station id|stationid|unknown|untitled|break|news|nachrichten|noticias|on air|live show|sounds like|playlist|podcast)\b|https?:|www\.|\.(com|fm|net|org|de|at|uk|io)\b/i;

/** "Artist - Title" as most stream servers write it; anything else is not treated as a song. */
function splitSong(text) {
  const clean = text.replace(/^(now on air|now playing|on air|jetzt läuft|en direct|ahora suena)\s*:\s*/i, '').trim();
  const match = clean.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  return match ? { artist: match[1], title: match[2] } : null;
}

// Stream servers often send UTF-8 text that was decoded as Windows-1252 or -1251 on the way.
const reverseMaps = ['windows-1252', 'windows-1251'].map((encoding) => {
  const decoder = new TextDecoder(encoding);
  const map = new Map();
  for (let b = 0; b < 256; b++) map.set(decoder.decode(new Uint8Array([b])), b);
  return map;
});

function repair(text) {
  if (!/[ÃÂÐÑÄÅØ][\u0080-ÿ]|[ÐÑЕД][Ѐ-џ‘-›]/.test(text)) return text;
  for (const map of reverseMaps) {
    const bytes = [...text].map((c) => map.get(c));
    if (bytes.some((b) => b === undefined)) continue;
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
    } catch {
      // Not this encoding; try the next.
    }
  }
  return text;
}

function acceptable(song, station) {
  if (!song?.artist || !song?.title) return null;
  const artist = repair(String(song.artist)).trim();
  const title = repair(String(song.title)).replace(/\s*\((cd|explicit|clean)\)\s*$/i, '').trim();
  const whole = `${artist} ${title}`;
  const fold = (s) => s.toLowerCase().replace(/\W+/g, '');
  if (artist.length < 2 || title.length < 2 || NOT_A_SONG.test(whole) || fold(whole).includes(fold(station.name))) return null;
  return { artist, title, expires: song.expires };
}

class NowPlaying {
  constructor(element) {
    this.element = element;
    this.song = null;
  }

  /** The song on air now, as one line for a list of kept stations. */
  get line() {
    return this.song ? `${this.song.title} — ${this.song.artist}` : '';
  }

  clear() {
    this.controller?.abort();
    this.controller = null;
    clearTimeout(this.poll);
    this.show(null);
  }

  follow(station) {
    this.clear();
    const feed = FEEDS[station.id];
    const server = station.np && SERVERS[station.np.kind];
    if (!feed && !server) return;
    const controller = (this.controller = new AbortController());
    const refresh = async () => {
      let next = 20000;
      try {
        const response = await fetch(feed ? feed.url : station.np.url, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
          cache: 'no-store',
          credentials: 'omit',
        });
        const data = await response.json();
        if (controller.signal.aborted) return;
        const song = acceptable(feed ? feed.read(data, Date.now()) : server(data, station), station);
        this.show(song);
        if (song?.expires) next = Math.min(next, Math.max(4000, song.expires - Date.now() + 1500));
      } catch {
        if (controller.signal.aborted) return;
        this.show(null);
      }
      if (!controller.signal.aborted) this.poll = setTimeout(refresh, next);
    };
    refresh();
  }

  show(song) {
    const changed = this.song?.title !== song?.title || this.song?.artist !== song?.artist;
    this.song = song;
    if (!changed) return;
    const el = this.element;
    el.hidden = !song;
    el.replaceChildren();
    if (!song) return;
    const line = document.createElement('span');
    line.className = 'song';
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = song.title;
    line.append(title, ` — ${song.artist}`);
    const find = document.createElement('span');
    find.className = 'find';
    const query = encodeURIComponent(`${song.artist} ${song.title}`);
    for (const [label, href] of [
      ['Spotify', `https://open.spotify.com/search/${query}`],
      ['Apple Music', `https://music.apple.com/search?term=${query}`],
      ['YouTube', `https://www.youtube.com/results?search_query=${query}`],
    ]) {
      const a = document.createElement('a');
      a.href = href;
      a.target = '_blank';
      a.rel = 'noreferrer';
      a.textContent = label;
      find.append(a);
    }
    el.append(line, find);
    el.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 700, easing: 'cubic-bezier(.16,.84,.24,1)' });
  }
}
