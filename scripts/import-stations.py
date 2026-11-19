"""Build the music directory from a Radio Browser JSON export with geolocations.
Usage: python3 scripts/import-stations.py export.json (requires geonamescache).
City labels are the nearest populated place in the station's reported country.
"""
import collections
import ipaddress
import json
import math
from pathlib import Path
import re
import subprocess
import sys
import unicodedata
from urllib.parse import urlsplit

import geonamescache

ROOT = Path(__file__).resolve().parents[1]
# Each expression maps common broadcaster tags to an English discovery term.
GENRES = {
    'African music': {'Afrobeats': r'afrobeat|afropop|afro pop', 'Amapiano': 'amapiano', 'Highlife': 'highlife|hiplife', 'African music': r'african music|makossa|mbalax|soukous|benga|kwaito'},
    'Latin & Brazilian': {'Samba': 'samba|pagode', 'Brazilian music': 'bossa nova|sertanej|forro|mpb|musica brasileira', 'Salsa': 'salsa', 'Cumbia': 'cumbia', 'Regional Mexican': r'regional mexican|ranchera|norteno|gruper|mariachi', 'Latin music': 'bachata|merengue|tango|bolero|reggaeton|latin(o|a)?( music)?'},
    'Reggae & Caribbean': {'Reggae': r'reggae(?!ton)|dub reggae|roots reggae', 'Dancehall': 'dancehall', 'Caribbean music': 'soca|calypso|zouk|caribbean music|kompa'},
    'South Asian': {'Bollywood': 'bollywood|filmi', 'South Asian music': 'bhangra|carnatic|hindustani|kollywood|tamil music|desi music|indian classical|mollywood'},
    'Middle Eastern': {'Arabic music': 'arab(ic)? (music|pop)|tarab|shilat|طرب|الموسيقى العربية', 'Middle Eastern music': 'turkish (pop|music)|persian (pop|music)|kurdish music'},
    'Jazz & soul': {'Jazz': 'jazz|bebop|big band|swing jazz', 'Blues': 'blues', 'Soul': 'soul|motown|neo soul', 'Funk': r'funk( music)?'},
    'Hip-hop & R&B': {'Hip-hop': r'hip[ -]?hop|rap( music)?|trap music', 'R&B': r'r&b|rnb|rhythm and blues'},
    'Classical': {'Classical': 'classical|baroque|chamber music|symphonic|musica clasica', 'Opera': 'opera'},
    'Electronic': {'House': 'house', 'Techno': 'techno', 'Trance': 'trance', 'Drum & bass': r'drum (and|&) bass|dnb|jungle', 'Electronic': 'electro(nic|nica)?|edm|dance|hardstyle|synthwave|dubstep|disco'},
    'Ambient & chill': {'Ambient': 'ambient|drone', 'Downtempo': 'downtempo|chill(out)?|lounge|easy listening', 'Lo-fi': r'lo[ -]?fi'},
    'Folk & country': {'Country': 'country( music)?|americana|bluegrass', 'Folk': 'folk|celtic|acoustic|traditional music'},
    'Rock & indie': {'Metal': 'metal', 'Punk': 'punk', 'Indie': 'indie|alternative|shoegaze|grunge', 'Rock': r'rock|rockabilly|progressive rock'},
    'Soundtracks': {'Soundtracks': 'soundtrack|film (music|score)|video game music|game music|anime music'},
    'Gospel': {'Gospel': 'gospel|southern gospel'},
    'Pop': {'K-pop': r'k[ -]?pop|korean pop', 'J-pop': r'j[ -]?pop|japanese pop', 'Mandopop': 'mandopop|chinese pop|c-pop', 'Pop': r'pop|top ?40|adult contemporary|top hits|charts|hit music'},
    'Oldies & decades': {'Oldies': r'oldies|classic hits|golden oldies|retro|nostalgia', 'Decades': r"(19)?(50|60|70|80|90)'?s|2000s"},
    'Eclectic': {'Eclectic': 'eclectic|experimental|freeform|music variety|world music|global music'},
}
rules = [(family, label, re.compile(r'(?<!\w)(?:' + pattern + r')(?!\w)'))
         for family, labels in GENRES.items() for label, pattern in labels.items()]
def norm(s):
    return ''.join(c for c in unicodedata.normalize('NFKD', s.casefold()) if not unicodedata.combining(c))
def safe_url(url):
    try:
        p = urlsplit(url)
        h = (p.hostname or '').rstrip('.').lower()
        if p.scheme != 'https' or p.username or p.password or '.' not in h or h.endswith(('.local','.internal','.localhost','.test','.invalid')): return False
        try: return ipaddress.ip_address(h).is_global
        except ValueError: return bool(re.fullmatch(r'(?=.*[a-z])[a-z0-9.-]+', h))
    except ValueError: return False

gc = geonamescache.GeonamesCache()
cities = collections.defaultdict(list)
for city in gc.get_cities().values():
    cities[city['countrycode']].append(city)
countries = gc.get_countries()
curated = json.loads(subprocess.check_output([
    'node','-e',"global.window=global;require('./dist/stations.js');process.stdout.write(JSON.stringify(STATIONS))"
],cwd=ROOT))
def stream_key(url):
    p = urlsplit(url)
    if p.hostname in ('lhttp.qtfm.cn','lhttp-hw.qtfm.cn','lhttp.qingting.fm'):
        return 'qingting:' + p.path.split('/')[2]
    return url.rstrip('/')
seen_urls = {stream_key(url) for station in curated for url in station['urls']}
curated_names = {norm(s['name']) for s in curated}
seen = set()
rows = []
for r in json.loads(Path(sys.argv[1]).read_text()):
    cc, url = r['countrycode'], r['url_resolved']
    if cc not in countries or not cities[cc] or not r['lastcheckok'] or r['hls'] or r['codec'] not in ('MP3','AAC','AAC+','OGG','OPUS','VORBIS','FLAC') or not safe_url(url) or stream_key(url) in seen_urls: continue
    lat, lon = r['geo_lat'], r['geo_long']
    if lat is None or lon is None or abs(lat)>90 or abs(lon)>180 or (lat,lon)==(0,0): continue
    name = ' '.join(r['name'].split())
    tags = norm(r['tags'])
    if not name or re.search(r'\b(news|noticias|talks?|sports?|preaching|teaching|politics|sermons?|podcasts?|scanner)\b', tags): continue
    tagged = [(f,t) for f,t,pat in rules if pat.search(tags)]
    if not tagged: continue
    # Some entries put the entire legal ID and address after the display name.
    if len(name)>55: name = re.split(r'\s[-|–]\s|: ',name)[0].strip() or name
    if len(name)>65 or norm(name) in curated_names: continue
    longitude_scale = math.cos(math.radians(lat))
    def distance(c):
        dx = ((c['longitude']-lon+180)%360-180)*longitude_scale
        return (c['latitude']-lat)**2 + dx**2
    city = min(cities[cc],key=distance)
    if distance(city) > 0.8**2: continue
    key = (cc, re.sub(r'\W+', '', norm(name)), city['geonameid'])
    if key in seen: continue
    seen.add(key)
    seen_urls.add(stream_key(url))
    families = list(dict.fromkeys(f for f,t in tagged))
    labels = [t for f,t in tagged]
    urls = [url]
    original = r.get('url', '')
    if (original != url and safe_url(original)
            and not urlsplit(original).path.lower().endswith(('.pls','.m3u','.m3u8','.asx','.xspf'))):
        urls = [original, url]
    rows.append(dict(id=r['stationuuid'],name=name,city=city['name'],country=countries[cc]['name'],genre=' · '.join(labels[:3]),family=families[0],families=families,genres=labels,lat=round(lat,4),lon=round(lon,4),zone=city['timezone'],frequency='WEB RADIO',urls=urls))
out = ROOT/'dist/world-stations.js'
out.write_text('// Music directory from Radio Browser. Nearby place names from GeoNames (CC BY 4.0).\nSTATIONS.push(...[\n' + ',\n'.join(json.dumps(row,ensure_ascii=False,separators=(',',':')) for row in rows) + '\n]);\n')
print(len(rows), 'directory stations in',len({r['country'] for r in rows}), 'countries and territories')
