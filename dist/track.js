// Only publish a track whose broadcaster identifies it as current.
const trackFeeds = {
  fip: {
    url: "https://api.radiofrance.fr/livemeta/pull/7",
    read(data, now) {
      const song = Object.values(data.steps || {})
        .filter(
          (s) =>
            s.embedType === "song" &&
            s.start * 1000 <= now &&
            now < s.end * 1000,
        )
        .sort((a, b) => b.start - a.start)[0];
      if (song)
        return {
          title: song.title,
          artist:
            song.highlightedArtists?.join(", ") ||
            song.performers ||
            song.authors,
          expires: song.end * 1000,
        };
    },
  },
  kexp: {
    url: "https://api.kexp.org/v2/plays/?limit=1&ordering=-airdate",
    read(data, now) {
      const play = data.results?.[0];
      const start = Date.parse(play?.airdate),
        expires = start + 12 * 60000;
      if (play?.play_type === "trackplay" && start <= now && now < expires)
        return { title: play.song, artist: play.artist, expires };
    },
  },
  swissjazz: {
    url: "https://ssatr.playlist-api.deliver.media/graphql?" + new URLSearchParams({
      query: `{ channel(id: "0191e9e4-db19-77eb-8bf1-92d9f3c9e4c5") {
        playingnow { current { start_time duration_ms metadata { title artist } } }
      } }`,
    }),
    read(data, now) {
      const song = data.data?.channel?.playingnow?.current;
      const start = Date.parse(song?.start_time);
      const expires = start + song?.duration_ms;
      if (Number.isFinite(expires) && start <= now && now < expires)
        return { title: song.metadata?.title, artist: song.metadata?.artist, expires };
    },
  },
};
class TrackCredit {
  constructor(element) {
    this.element = element;
  }
  clear() {
    this.controller?.abort();
    this.controller = null;
    clearTimeout(this.poll);
    clearTimeout(this.expiry);
    this.element.hidden = true;
    this.element.textContent = "";
  }
  follow(id) {
    this.clear();
    const feed = trackFeeds[id];
    if (!feed) return;
    const controller = (this.controller = new AbortController());
    const refresh = async () => {
      let nextPoll = 20000;
      try {
        const response = await fetch(feed.url, {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(8000),
          ]),
          cache: "no-store",
          credentials: "omit",
        });
        if (!response.ok) throw Error("Track feed unavailable");
        const track = feed.read(await response.json(), Date.now());
        if (controller.signal.aborted) return;
        clearTimeout(this.expiry);
        const valid = Boolean(track?.title?.trim() && track?.artist?.trim());
        this.element.hidden = !valid;
        this.element.textContent = valid
          ? track.title + " — " + track.artist
          : "";
        if (valid) {
          const remaining = Math.max(0, track.expires - Date.now());
          this.expiry = setTimeout(
            () => {
              this.element.hidden = true;
            },
            remaining,
          );
          nextPoll = Math.min(nextPoll, remaining + 500);
        }
      } catch {
        if (!controller.signal.aborted) this.element.hidden = true;
      }
      if (!controller.signal.aborted) this.poll = setTimeout(refresh, nextPoll);
    };
    refresh();
  }
}
