# Aether FM — World Music Radio

The most revealing test is a journey from FIP in Paris to Beijing Music Radio. Before touching anything, watch one bright filament slip behind the horizon. Drag the globe until the same filament crosses the front of the sphere. Then tune to Beijing. A moving point traces the distance you travelled, the globe briefly recedes, and light spreads outward from the new station. These are three different ways of reading depth, place and time.

## Research and design decisions

**How does a collection of lines become a single moving object?** In *Manta Rhei*, ART+COM and Selux coordinated light with the motion of fourteen flexible metal lamellae. My reading is that the coherence comes from the shared movement underneath the individual elements. Aether uses two groups of strands, each bent around a common curve. Neighbouring strands separate at a fold and meet again at its narrow edge. Hiding their rear sections behind the planet gives a viewer a way to read their shape from one still frame. [ART+COM — Manta Rhei](https://artcom.de/?project=manta-rhei)

**What deserves to move with the sound?** Semiconductor's *Brilliant Noise* turns variations in the brightness of solar imagery into variations in its soundtrack. I reversed that direction. The incoming broadcast changes the material of the image. Low-frequency energy opens the spacing of the outer strands, midrange energy lifts highlights on the land, and upper frequencies bring out fine ridges and brighten the outer veil. Each band has a quick attack and slower release so a plucked string can register without making the entire globe jump. [Semiconductor — Brilliant Noise](https://semiconductorfilms.com/art/brilliant-noise/)

**How much information does a viewer need at once?** Ryoji Ikeda's *datamatics* works move between graphic patterns and spatial views of data. My application is a change of scale. From a distance, the city and its surrounding continent are legible. At a closer zoom, coloured lines resolve into a woven surface. The station frequency and coordinates remain in the player, where they can be read independently of the artwork. [Ryoji Ikeda — datamatics](https://www.ryojiikeda.com/project/datamatics/)

**What role does the listener play?** In FIELD and thatgamecompany's *Together*, participants shape an audiovisual composition through movement and proximity. In Aether, dragging changes the geographic view and the angle of the outer veil. A quick release carries the globe a little farther. Selecting a city interrupts that movement immediately and gives the next scene a destination. [FIELD — Together: the distance between (us)](https://field.io/work/together-the-distance-between-us)

## Motion score

| Moment | Visible action | What it communicates |
| --- | --- | --- |
| Waiting | The outer strands slowly fold over one another. The sound meter stays hidden. | The sculpture is available to explore. |
| Drag and release | The geography follows the pointer. A short, decelerating coast follows a flick. | The listener controls an object with a little weight. |
| Departure | The city name resolves into focus. A fine trace advances along a great-circle route. | The station has changed and the new destination is identifiable. |
| Passage | The view eases outward, turns and settles over approximately one to two seconds. Longer east–west turns have more clearance. | Distance has a visible duration. |
| Arrival | Once the camera settles, the first measured sound sends a light front out from the station. | Attention returns to the point that was selected. |
| Listening | The station name takes the headline. Fast attacks tighten the strands, sustained sound opens them, and silence lets the surface settle. FIP and KEXP can supply an artist and title during playback. | The broadcaster supplies part of the composition. |

## Signal and accessibility

The audio plays directly from each broadcaster. A Web Audio analyser measures approximately 45–240 Hz, 240–2,500 Hz and 2,500–9,500 Hz. The sculpture also has a slow underlying motion, so it can be explored before pressing Play. If a server declines cross-origin analysis, the player retries the stream directly and hides the live meter. A station can still be unavailable because of its server or the listener's network. [MDN — reading live frequency data](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getByteFrequencyData)

The wave button beside Music stations holds the visual motion while audio continues. The initial setting respects the browser's reduced-motion preference. Keyboard users can turn the globe with the arrow keys, zoom with plus and minus, and use the searchable station index. All controls, locations, playback states and accessible names are in English.

## Music directory

The searchable directory ships with the site. Its Radio Browser snapshot includes geolocated HTTPS streams tagged with recognized music genres and marked healthy at export. GeoNames supplies nearby place names and time zones. Stream availability can change. The original stations and manually placed Chinese music stations are in `dist/stations.js`. To rebuild the extended catalog, export Radio Browser stations with `has_geo_info=true`, `hidebroken=true` and an explicit limit, then run `python3 scripts/import-stations.py export.json` with geonamescache installed. The directory credits both sources.
