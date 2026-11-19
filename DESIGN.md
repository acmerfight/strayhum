# Stray Hum — chance encounters with music from all over the world

Stray Hum plays one small radio station at a time, from anywhere on earth. You listen; when you want somewhere else, you drift. It is not a directory: there is no search and no filter, because the point is the station you would not have chosen.

## The Earth, as it is now

The whole screen is the Earth in space, set right of centre with the caption beside it. Everything on it is real:

- **The sun where it is.** Day and night fall where they fall at this moment; the terminator is narrow, with sunlight reddening just before it, and the air at the edge of the Earth turns from blue to red where the sun is setting.
- **The ground and its relief.** NASA Blue Marble Next Generation for colour; the world's elevation (Mapzen terrain) as a normal map, so mountain ranges stand out in low sun.
- **The sea** dark, with the sun's glint broken by the swell, and the sky's light at grazing angles.
- **Real clouds.** One recent day's clouds from NASA's VIIRS and MODIS satellites, kept only where two satellites agree, with their shadows on the ground.
- **The night side** in its own lights (NASA Black Marble), dimmed under cloud, with a trace of earthshine so the whole ball reads; a thin line of airglow along its edge.
- **The sun** itself when it is in view, and its light coming round the edge of the Earth.
- **Stations** as small bone-white points, a little brighter on the night side. The one playing is amber and breathes; kept ones are amber. Each beat of the music leaves the station as a fine amber ring across the face of the Earth.

**Development.** Rendered in linear light, then printed: ACES, cool colour held back while warm light keeps its colour, split toning, lifted blacks, halation in two widths, a trace of lens fringing toward the edges, grain, vignette.

## Motion in time with the music

The music moves the Earth at three speeds, each following a layer of the music's own time:

| Layer | Length | Follows | On the Earth |
| --- | --- | --- | --- |
| Beat | about half a second | the tempo and phase found by the pulse tracker | the playing station's point lifts and a hairline leaves it; a small ring; the ring around Listen gives a little |
| Bar | about two seconds | the first beat of each four, found from the bass | a wider ring that lives exactly one bar; towns brighten as it crosses them |
| Phrase | eight to thirty seconds | a slow envelope of loudness | the warmth around the station and the brightness of the night side's lights |

Music without a steady pulse (classical, ambient, speech) gets only the phrase, and a slow, wide ring when a strong accent stands out. The less certain the beat, the less is drawn: the bar ring first, every beat only when the pulse is clear. A station whose samples cannot be read gets only a slow breath; no beat is invented for it.

**How the beat is found.** An AudioWorklet measures onsets on the audio thread every 512 samples, broadband and in the bass, as rises in decibels against what is usual in that music, so detection does not depend on the frame rate (`dist/onset-worklet.js`). `dist/pulse.js` looks back over eight seconds every half second: the tempo is the period at which onsets best repeat, weighted toward moderate tempos and checked against twice its length; the beat is the grid at that period carrying the most onset energy, bass counting more, so off-beat hats and swing do not pull it; the bar's first beat is the one carrying the most bass, confirmed twice before it moves. Beats are stamped with the moment they come out of the speakers and drawn then. Without AudioWorklet, the analyser feeds the same tracker once a frame.

Checked offline against synthetic house, techno, hip-hop, swung afrobeat, drum & bass and a ballad (tempo within 2%, beats within 25 ms, bar's first beat right, no lock on beatless input), and live: techno and house locked with beats spaced within 6 ms; classical not locked.

## Motion score

| Moment | What happens | Why |
| --- | --- | --- |
| Opening | From far off, the Earth turns a quarter of the way round to the first station and comes closer. | Somewhere on this Earth, now. |
| Drift | The Earth itself turns to the next station along the great circle, the camera easing back a little for long journeys and in again; an amber arc draws the way from where you were. "Seattle — Kathmandu", the distance counting up and the hours between stand above the Earth. The sound is let through as the station comes to face you. | You see the Earth turn and how far you were taken. |
| Hold Drift | The Earth turns by itself along a heading chosen by chance, gathering speed, an amber ring at the centre of its face; each city passed comes up with its time, with a carrier tone through the static. Letting go settles on the station under the ring. | Chance you can steer by feel. |
| By hand | Drag to turn the Earth, with inertia; scroll or pinch to come closer, down to the lights of single towns. Hovering a light names its city, time, station and sound; selecting it listens. On touch a first tap names it and offers Listen. Left alone while something plays, the Earth turns back to it. | The whole map when you want it, chance when you do not. |
| A signal fades | "The signal faded · drifting on", then Stray Hum drifts by itself. | A dead stream is part of the radio. |

Reduced motion (the system setting or the Motion switch) turns the Earth instantly.

## Sound

Every stream plays directly from its broadcaster. Streams that allow cross-origin reading go through an analyser; for the others, the station breathes at a slow even pace instead. The static between stations is synthesised: band-limited noise whose centre wanders like a dial, sparse clicks, and a heterodyne whistle that glides past other carriers. It can be switched off.

## Where a drift goes

A drift chooses a region of the world first (Europe, North America, Latin America, Africa, West Asia, South Asia, East Asia, Oceania), weighted by the square root of the stations there and away from the last two regions; then a station in that region, far enough from the last one, not in a recent country, with a different sound. The directory is dense in Europe; choosing by region keeps encounters spread across the whole map. The first encounter of a visit prefers a place where it is evening or night.

## What is playing

Where a broadcaster says so, the caption shows the song on air with links to find it on Spotify, Apple Music and YouTube: FIP, KEXP and Radio Swiss Jazz through their own playlists, other stations through their stream server's public status (Icecast or AzuraCast), found at build time. Only "artist – title" pairs are shown; station IDs, adverts and programme names are left out, and titles mis-decoded as Windows-1252 or -1251 are repaired. Keeping a station keeps the song that was playing.

## Sharing

The share button opens the system share sheet on phones and copies a link elsewhere: `https://strayhum.com/?station=<id>&sent`. The link opens on that station with "Someone sent you this" in place of "Somewhere, right now". The link preview image is `dist/og.png`, rendered from the page itself with `?poster` at a station at dusk.

## The stations

`dist/stations.js` is generated by `scripts/build-stations.py` from the Radio Browser catalogue:

1. Candidates are scored for music made with a point of view (freeform, community, college, jazz, traditional and regional forms, experimental and electronic subgenres) and against chart and network formats. Outside Europe and North America the bar is lower and countries with few stations get a lift: a local station in Lagos or Dhaka is an encounter for most listeners, even when it plays the hits. European countries are capped lower.
2. About ninety hand-picked independent and cultural stations are added by name, plus the hand-placed stations in `data/curated-stations.js`.
3. Every stream is fetched as Chrome and as Safari would fetch it. Only streams that answer with audio are kept; those that send Safari to a plain-http address are marked and never offered to Safari.
4. Stations are placed on the most populous place within 30 km (Mitte belongs to Berlin), deduplicated by stream and by name, and capped per country, city and host.

```
npm install --ignore-scripts                   # three.js and esbuild, pinned
npm run build                                  # src/earth.js -> dist/earth.js
python3 -m venv .venv && .venv/bin/pip install geonamescache numpy pillow
.venv/bin/python scripts/build-stations.py     # stations: fetches and checks, cached in .cache/
.venv/bin/python scripts/build-earth.py        # dist/earth/: ground, relief, lights, a day's clouds; rerun to refresh the clouds
```

Stream availability changes; rebuild the stations every few weeks.

## Files

| File | Role |
| --- | --- |
| `src/earth.js` | The Earth with three.js: ground, relief, sea, clouds, lights, air, stations, journeys, turning by hand, and the print. Built to `dist/earth.js` with `npm run build`. |
| `dist/daylight.js` | The sun and moon for a place and moment, time differences. |
| `dist/weather.js` | The weather at a station, from Open-Meteo. |
| `dist/signal.js` | The receiver: playback, static, the level and phrase of the sound. |
| `dist/onset-worklet.js` | Onsets on the audio thread. |
| `dist/pulse.js` | Tempo, beat and bar from the onsets. |
| `dist/encounter.js` | Where to drift next, and what to remember (kept, tonight, faded). |
| `dist/app.js` | Conducts the above; the caption, the deck, the log. |
| `dist/nowplaying.js` | The song on air, from broadcaster playlists or stream-server status, cleaned. |

Kept stations, tonight's route and faded signals stay in the browser's localStorage. Sources: stations from [Radio Browser](https://www.radio-browser.info/), places from [GeoNames](https://www.geonames.org/) (CC BY 4.0), weather from [Open-Meteo](https://open-meteo.com/) (CC BY 4.0), relief from [Mapzen terrain tiles](https://registry.opendata.aws/terrain-tiles/) on AWS, the ground's colour, the city lights and the clouds from NASA (Blue Marble, Black Marble, VIIRS and MODIS; public domain).
