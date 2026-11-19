# strayhum — World Music Radio

The globe carries one city caption. A tap finds music at the closest visible location. During playback, the station supplies the energy that changes the colour around its city.

## Research and design decisions

ART+COM's *Manta Rhei* coordinates light with the movement of a physical object. strayhum carries its pigment field in geographical coordinates, so it turns with the globe and the coastline stays legible. [ART+COM — Manta Rhei](https://artcom.de/?project=manta-rhei)

Semiconductor's *Brilliant Noise* maps changes in image brightness to sound. strayhum takes the reverse path. A measured rise in bass or broadband energy pushes the edge of a translucent sheet across the station. A damped spring shapes its release. The catalog’s primary family and descriptive tags select the movement. Electronic stations use a narrow, fast pleat. Jazz uses a delayed lateral return. Classical uses a broad arc driven by the sustained envelope. Other formats keep the baseline response. Sustained energy shifts the surrounding colour, and a quiet passage lets it settle. [Semiconductor — Brilliant Noise](https://semiconductorfilms.com/art/brilliant-noise/)

The listener can explore freely while a station plays. One city name appears under the pointer. The local time, frequency and playback controls belong to the player, leaving the globe free of persistent station markers. [Ryoji Ikeda — datamatics](https://www.ryojiikeda.com/project/datamatics/)

## Motion score

| Moment | Visible action | What it communicates |
| --- | --- | --- |
| Waiting | Broad pools of colour drift across the land. The sound meter stays hidden. | The sculpture is available to explore. |
| Drag and release | The geography follows the pointer. A short, decelerating coast follows a flick. | The listener controls an object with a little weight. |
| Departure | The city name resolves into focus. A fine trace advances along a great-circle route. | The station has changed and the new destination is identifiable. |
| Passage | The view eases outward, turns and settles over approximately one to two seconds. Longer east–west turns have more clearance. | Distance has a visible duration. |
| Arrival | Once the camera settles, the first measured sound sends a light front out from the station. | Attention returns to the point that was selected. |
| Listening | The station name takes the headline. Fast attacks bend the foreground sheet. Sustained sound carries the underlying pigment forward, and silence lets the surface settle. FIP and KEXP can supply an artist and title during playback. | The broadcaster supplies part of the composition. |

The reach of the same sheet follows the arrangement throughout a station’s continuous stream. An envelope compares recent loudness with a slower baseline and also measures occupied octaves and the density of attacks. A separate spectral balance gently steers the sheet. Sparse passages stay near the city. A sustained build opens toward the horizon. The animation uses the broadcaster’s audio directly and needs no song-boundary or chorus metadata.

## Signal and accessibility

The audio plays directly from each broadcaster. A Web Audio analyser measures approximately 45–240 Hz, 240–2,500 Hz and 2,500–9,500 Hz. The sculpture also has a slow underlying motion, so it can be explored before pressing Play. If a server declines cross-origin analysis, the player retries the stream directly and hides the live meter. A station can still be unavailable because of its server or the listener's network. [MDN — reading live frequency data](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getByteFrequencyData)

The wave button beside Music stations holds the visual motion while audio continues. The initial setting respects the browser's reduced-motion preference. Keyboard users can turn the globe with the arrow keys, zoom with plus and minus, and use the searchable station index. On touch screens a tap previews a city, and activating the caption opens its stations or starts the single station. Exploring during playback keeps the station headline in place. The inverse projection finds the nearest visible station, groups stations in the same city, and reveals one city caption. Arrow keys explore cities and Enter selects one.

## Music directory

Selecting a directory result commits the full matching list as the Next station queue. Browsing or dismissing a new search leaves that queue intact. The searchable directory ships with the site. Its Radio Browser snapshot includes geolocated HTTPS streams tagged with recognized music genres and marked healthy at export. GeoNames supplies nearby place names and time zones. Stream availability can change. The original stations and manually placed Chinese music stations are in `dist/stations.js`. To rebuild the extended catalog, export Radio Browser stations with `has_geo_info=true`, `hidebroken=true` and an explicit limit, then run `python3 scripts/import-stations.py export.json` with geonamescache installed. The directory credits both sources.
