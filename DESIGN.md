# Stray Hum — chance encounters with music from all over the world

Stray Hum plays one small radio station at a time, from anywhere on earth. You listen; when you want somewhere else, you drift. It is not a directory: there is no search and no filter, because the point is the station you would not have chosen.

## One picture, made of the data

The globe is drawn like a plate from an engraved atlas, from a single distance-to-coast texture:

- **Coast**: one hairline, one device pixel wide at any zoom.
- **Water lines**: parallel lines echo each coast out to sea, spaced wider the farther they are from shore, as engravers cut them.
- **Land**: hatched along the parallels. Line weight follows the real sun at this moment: broad lines where it is day, fine lines where it is night. The terminator is drawn with line weight, not with a shadow.
- **Stations**: every light is a station. Lights on the night side shine brighter, like cities.
- **Sound**: the playing station's attacks leave it as rings that travel across the surface. Where a ring passes, the engraving turns amber. Sustained music gathers a warmth around the station.
- **Journey**: tonight's route stays drawn as great-circle arcs between the places you heard.

Colour is one ink, one bone white and one amber. Amber means only "signal": the playing station, its rings, the current leg of the journey, On air, and the dot in the wordmark while something plays.

Type is Bodoni Moda for names (a didone, like map lettering; its hairlines echo the engraving) and Geist for everything else. Places are set in spaced capitals, as on a map. The wordmark is roman, the station names italic. Bodoni's hairlines vanish on screens at its display optical size, so every use of it sets a smaller optical size (11 for the wordmark, 28 for station names); dashes in names are shown as middle dots for the same reason.

## Motion score

| Moment | What happens | Why |
| --- | --- | --- |
| Arrival on the page | The coast is drawn first, then the water lines spread outward, then the hatching, then the lights come on. | The plate is engraved in front of you. |
| Idle | The earth turns slowly. The first encounter is a place where it is evening or night, labelled "Somewhere, right now". | An invitation, not a menu. |
| Drift | Static rises as the old station fades. The camera flies along the great circle while an amber pen draws the leg. The caption leaves, and the new place resolves as its letters close up. | Distance has a duration. |
| Hold Drift | The earth turns under a fixed amber needle like a dial, gathering speed. Each light that passes under it reads out its city and sounds a short carrier tone through the static; the whistle rises with speed. Letting go lands on the light under the needle. | Chance you can steer by feel, as on a shortwave set. |
| Landing | The stream is held under the static until the flight lands, then crossfades in. The first sound leaves the station as one wide ring. | Image and music arrive together. |
| Listening | Rings on each attack; the ring around Listen breathes with loudness. If the view is turned away, it settles back on the station after a while. | The station answers the music. |
| A signal fades | "The signal faded · drifting on", then Stray Hum drifts by itself. | A dead stream becomes part of the radio, not an error. |

Reduced motion (the system setting or the Motion switch) removes flights, rings and the reveal; listening is unchanged.

## Sound

Every stream plays directly from its broadcaster. Streams that allow cross-origin reading go through an analyser; for the others, the station breathes at a slow even pace instead. The static between stations is synthesised: band-limited noise whose centre wanders like a dial, sparse clicks, and a heterodyne whistle that glides past other carriers. It can be switched off.

## Where a drift goes

A drift chooses a region of the world first (Europe, North America, Latin America, Africa, West Asia, South Asia, East Asia, Oceania), weighted by the square root of the stations there and away from the last two regions; then a station in that region, far enough from the last one, not in a recent country, with a different sound. The directory is dense in Europe; choosing by region keeps encounters spread across the whole map. The first encounter of a visit prefers a place where it is evening or night.

## What is playing

Where a broadcaster says so, the caption shows the song on air with links to find it on Spotify, Apple Music and YouTube: FIP, KEXP and Radio Swiss Jazz through their own playlists, other stations through their stream server's public status (Icecast or AzuraCast), found at build time. Only "artist – title" pairs are shown; station IDs, adverts and programme names are left out, and titles mis-decoded as Windows-1252 or -1251 are repaired. Keeping a station keeps the song that was playing.

## Sharing

The share button opens the system share sheet on phones and copies a link elsewhere: `https://strayhum.com/?station=<id>&sent`. The link opens on that station with "Someone sent you this" in place of "Somewhere, right now". The link preview image is `dist/og.png`, rendered from the page itself with `?poster`.

## The stations

`dist/stations.js` is generated by `scripts/build-stations.py` from the Radio Browser catalogue:

1. Candidates are scored for music made with a point of view (freeform, community, college, jazz, traditional and regional forms, experimental and electronic subgenres) and against chart and network formats. Outside Europe and North America the bar is lower and countries with few stations get a lift: a local station in Lagos or Dhaka is an encounter for most listeners, even when it plays the hits. European countries are capped lower.
2. About ninety hand-picked independent and cultural stations are added by name, plus the hand-placed stations in `data/curated-stations.js`.
3. Every stream is fetched as Chrome and as Safari would fetch it. Only streams that answer with audio are kept; those that send Safari to a plain-http address are marked and never offered to Safari.
4. Stations are placed on the most populous place within 30 km (Mitte belongs to Berlin), deduplicated by stream and by name, and capped per country, city and host.

```
python3 -m venv .venv && .venv/bin/pip install geonamescache numpy scipy pillow
.venv/bin/python scripts/build-stations.py     # stations: fetches and checks, cached in .cache/
.venv/bin/python scripts/build-coast.py        # dist/coast.png from Natural Earth 1:50m
```

Stream availability changes; rebuild the stations every few weeks.

## Files

| File | Role |
| --- | --- |
| `dist/sky.js` | WebGL2 renderer: the engraved surface, the station lights, the rings. |
| `dist/globe.js` | Camera, input, flights, the journey lines and the map labels. |
| `dist/signal.js` | The receiver: playback, static, and onset detection for the rings. |
| `dist/encounter.js` | Where to drift next, and what to remember (kept, tonight, faded). |
| `dist/app.js` | Conducts the above; the caption, the deck, the log. |
| `dist/nowplaying.js` | The song on air, from broadcaster playlists or stream-server status, cleaned. |

Kept stations, tonight's route and faded signals stay in the browser's localStorage. Sources: stations from [Radio Browser](https://www.radio-browser.info/), places from [GeoNames](https://www.geonames.org/) (CC BY 4.0), coastlines from [Natural Earth](https://www.naturalearthdata.com/) (public domain).
