"""Build dist/stations.js: small, independent and culturally specific music stations,
each checked to answer with audio at build time.

Usage:
  python3 scripts/build-stations.py            # fetch Radio Browser, verify, write
  python3 scripts/build-stations.py --offline  # reuse the cached fetch and checks

Requires geonamescache (pip install geonamescache) and curl with HTTP/2. Network access is
needed for the Radio Browser catalogue and for checking each stream. Results are cached in .cache/.
"""
import collections
import concurrent.futures
import json
import math
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
import unicodedata
import urllib.parse
import urllib.request

import geonamescache

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.cache'
API = 'https://de1.api.radio-browser.info/json'
CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
# Some Icecast servers redirect Safari to a plain-http URL, which a secure page cannot play.
SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
ORIGIN = 'https://strayhum.com'
OFFLINE = '--offline' in sys.argv

# Stations a listener would be glad to stumble on. Matched by name in Radio Browser,
# then checked like every other stream. City is used when the entry has no location.
ANCHORS = [
    ('WFMU', 'US', 'Jersey City'), ('dublab', 'US', 'Los Angeles'), ('The Lot Radio', 'US', 'New York City'),
    ('WWOZ', 'US', 'New Orleans'), ('KCRW Eclectic24', 'US', 'Santa Monica'), ('Radio Paradise Main Mix', 'US', 'Chico'),
    ('KUTX', 'US', 'Austin'), ('WBGO', 'US', 'Newark'), ('KCSM', 'US', 'San Mateo'), ('Jazz24', 'US', 'Seattle'),
    ('KALX', 'US', 'Berkeley'), ('KXLU', 'US', 'Los Angeles'), ('WMBR', 'US', 'Cambridge'), ('KDVS', 'US', 'Davis'),
    ('Newtown Radio', 'US', 'New York City'), ('WXPN', 'US', 'Philadelphia'), ('WMSE', 'US', 'Milwaukee'),
    ('Classical KING', 'US', 'Seattle'), ('WCPE', 'US', 'Raleigh'), ('KUSC', 'US', 'Los Angeles'),
    ('Worldwide FM', 'GB', 'London'), ('Rinse FM', 'GB', 'London'), ('Soho Radio', 'GB', 'London'),
    ('Resonance FM', 'GB', 'London'), ('Noods Radio', 'GB', 'Bristol'), ('Netil Radio', 'GB', 'London'),
    ('Balamii', 'GB', 'London'), ('Kiosk Radio', 'BE', 'Brussels'), ('Radio Panik', 'BE', 'Brussels'),
    ('Radio Centraal', 'BE', 'Antwerpen'), ('Cashmere Radio', 'DE', 'Berlin'), ('Refuge Worldwide', 'DE', 'Berlin'),
    ('ByteFM', 'DE', 'Hamburg'), ('FSK Hamburg', 'DE', 'Hamburg'), ('Radio Corax', 'DE', 'Halle (Saale)'),
    ('Radio 80000', 'DE', 'Munich'), ('BR-Klassik', 'DE', 'Munich'), ('Radio X', 'DE', 'Frankfurt am Main'),
    ('Radio Raheem', 'IT', 'Milan'), ('Radio Popolare', 'IT', 'Milan'), ('Venice Classic Radio', 'IT', 'Venice'),
    ('Rai Radio 5 Classica', 'IT', 'Rome'), ('Radio Quantica', 'PT', 'Lisbon'), ('Radio Zero', 'PT', 'Lisbon'),
    ('Antena 2', 'PT', 'Lisbon'), ('Radio Nopal', 'MX', 'Mexico City'), ('Radio Educación', 'MX', 'Mexico City'),
    ('Opus 94', 'MX', 'Mexico City'), ('Radio UNAM', 'MX', 'Mexico City'), ('Radio Alhara', 'PS', 'Bethlehem'),
    ('LYL Radio', 'FR', 'Lyon'), ('Le Mellotron', 'FR', 'Paris'), ('Radio Meuh', 'FR', 'La Clusaz'),
    ('Radio Nova', 'FR', 'Paris'), ('TSF Jazz', 'FR', 'Paris'), ('FIP Jazz', 'FR', 'Paris'), ('FIP Groove', 'FR', 'Paris'),
    ('FIP Monde', 'FR', 'Paris'), ('FIP Reggae', 'FR', 'Paris'), ('Radio Grenouille', 'FR', 'Marseille'),
    ('Radio Campus Paris', 'FR', 'Paris'), ('Radio Primitive', 'FR', 'Reims'), ('Ö1', 'AT', 'Vienna'), ('FM4', 'AT', 'Vienna'),
    ('Radio Helsinki', 'AT', 'Graz'), ('Radio Swiss Classic', 'CH', 'Bern'), ('Couleur 3', 'CH', 'Lausanne'),
    ('Radio Kapitał', 'PL', 'Warsaw'), ('Mutant Radio', 'GE', 'Tbilisi'), ('Operator Radio', 'NL', 'Rotterdam'),
    ('Intergalactic FM', 'NL', 'The Hague'), ('Echobox Radio', 'NL', 'Amsterdam'), ('Concertzender', 'NL', 'Utrecht'),
    ('NRK Klassisk', 'NO', 'Oslo'), ('NRK Jazz', 'NO', 'Oslo'), ('Radio Nova', 'NO', 'Oslo'), ('P2', 'SE', 'Stockholm'),
    ('The Lake Radio', 'DK', 'Copenhagen'), ('Yle Klassinen', 'FI', 'Helsinki'), ('Radio Helsinki', 'FI', 'Helsinki'),
    ('Rás 1', 'IS', 'Reykjavik'), ('RTÉ Lyric FM', 'IE', 'Limerick'), ('Dublin Digital Radio', 'IE', 'Dublin'),
    ('Radio 3', 'ES', 'Madrid'), ('Radio Clásica', 'ES', 'Madrid'), ('Ràdio Web MACBA', 'ES', 'Barcelona'),
    ('Rádio Batuta', 'BR', 'Rio de Janeiro'), ('Cultura FM', 'BR', 'Brasília'), ('Rádio UFMG Educativa', 'BR', 'Belo Horizonte'),
    ('Radio Nacional Folklórica', 'AR', 'Buenos Aires'), ('Radio Nacional Clásica', 'AR', 'Buenos Aires'),
    ('Radio Beethoven', 'CL', 'Santiago'), ('Radio Universidad de Chile', 'CL', 'Santiago'),
    ('Radio Nacional de Colombia', 'CO', 'Bogotá'), ('Radio Filarmonía', 'PE', 'Lima'), ('Radio Uruguay', 'UY', 'Montevideo'),
    ('Fine Music Radio', 'ZA', 'Cape Town'), ('Bush Radio', 'ZA', 'Cape Town'), ('Ghetto Radio', 'KE', 'Nairobi'),
    ('Radio Karantina', 'LB', 'Beirut'), ('Shonan Beach FM', 'JP', 'Zushi'), ('InterFM', 'JP', 'Tokyo'),
    ('RNZ Concert', 'NZ', 'Wellington'), ('95bFM', 'NZ', 'Auckland'), ('Radio Active', 'NZ', 'Wellington'),
    ('Triple R', 'AU', 'Melbourne'), ('PBS 106.7', 'AU', 'Melbourne'), ('FBi Radio', 'AU', 'Sydney'), ('RTRFM', 'AU', 'Perth'),
    ('Double J', 'AU', 'Sydney'), ('ABC Jazz', 'AU', 'Sydney'), ('ABC Classic', 'AU', 'Sydney'), ('CKUT', 'CA', 'Montreal'),
    ('CIUT', 'CA', 'Toronto'), ('CJSW', 'CA', 'Calgary'), ('RTHK Radio 4', 'HK', 'Hong Kong'), ('Raagam', 'IN', 'Bengaluru'),
    ('TRT Türkü', 'TR', 'Ankara'), ('TRT Nağme', 'TR', 'Ankara'), ('Açık Radyo', 'TR', 'Istanbul'), ('ERT Kosmos', 'GR', 'Athens'),
    ('Kol HaMusica', 'IL', 'Jerusalem'), ('Radio Student', 'HR', 'Zagreb'), ('Radio Študent', 'SI', 'Ljubljana'),
    ('Radio Wave', 'CZ', 'Prague'), ('ČRo Jazz', 'CZ', 'Prague'), ('ČRo D-dur', 'CZ', 'Prague'), ('Tilos', 'HU', 'Budapest'),
    ('Bartók', 'HU', 'Budapest'), ('Radio România Cultural', 'RO', 'Bucharest'), ('LRT Klasika', 'LT', 'Vilnius'),
    ('Klassikaraadio', 'EE', 'Tallinn'), ('Radio Naba', 'LV', 'Riga'), ('Radio Kultura', 'UA', 'Kyiv'),
    ('Radio Swiss Jazz', 'CH', 'Basel'), ('SomaFM Groove Salad', 'US', 'San Francisco'), ('SomaFM Drone Zone', 'US', 'San Francisco'),
    ('SomaFM Secret Agent', 'US', 'San Francisco'), ('SomaFM Lush', 'US', 'San Francisco'), ('SomaFM Sonic Universe', 'US', 'San Francisco'),
]

# Words in a station's tags that suggest music made by people with a particular point of view.
NICHE = {
    3: r'freeform|free form|eclectic|experimental|avant[- ]?garde|underground|community radio|college radio|campus radio|'
       r'radio art|sound art|field recordings?|world music|traditional|free jazz|bebop|contemporary classical|early music|'
       r'baroque|drone|afrobeat|highlife|cumbia|tango|fado|samba|bossa nova|mpb|chanson|raga|carnatic|hindustani|qawwali|'
       r'gamelan|enka|city pop|kayokyoku|rebetiko|flamenco|klezmer|exotica|library music|rare groove|krautrock|post[- ]rock|'
       r'idm|dub techno|son cubano|rumba|calypso|kompa|zouk|gnawa|rai|balkan|celtic|bluegrass|ethio|tropical|psych',
    2: r'jazz|classical|folk|ambient|soul|funk|blues|reggae|dub|afro|americana|downtempo|dj|mixes|electronica|minimal|'
       r'shoegaze|post[- ]punk|punk|garage|surf|latin jazz|salsa|world|independent|public radio|culture|cultural|non[- ]commercial|'
       r'vinyl|opera|chamber|lo[- ]?fi|beats|breakbeat|drum (and|&) bass|jungle|disco|boogie|soundtrack',
    1: r'techno|house|lounge|chill(out)?|indie|alternative|psychedelic|instrumental|piano|guitar',
}
MAINSTREAM = (r'top ?40|top hits|hits|charts?|contemporary hits|chr|adult contemporary|classic hits|hot ac|'
              r'entretenimiento|variety|juvenil|grupera|grupero|banda|norteño|regional mexican|reggaeton|schlager|'
              r'80s|90s|2000s|oldies|retro|classic rock')
RELIGIOUS = (r'christian|catholic|orthodox|islam|quran|coran|sonnah|sunnah|sermon|preaching|bible|church|evangel|religio|'
             r'gospel|worship|christmas|xmas|navidad|weihnacht')
SPOKEN = r'news|noticias|talk|sports?|deportes|football|soccer|scanner|police|traffic|podcast|politic|education'
EXCLUDE = RELIGIOUS + '|' + SPOKEN
NAME_EXCLUDE = (r'^\W|nicht einschalten|christmas|xmas|navidad|weihnacht|top ?\d+|hits?\b|\bhit\b|хит|хіт|100%|'
                r'\btest\b|^radio$|kiss|energy|nrj|bigfm|big fm|i ?love ?radio|rautemusik|0nline|laut\.fm|'
                r'bob!?$|antenne|regenbogen|rpr1|radio saw|iheart|cumulus|los 40|40 principales|evropa 2')
NETWORK_HOSTS = ('playerservices.streamtheworld.com', 'stream.revma.ihrhls.com', 'stream.rpr1.de', 'stream.bigfm.de',
                 'stream.regenbogen.de', 'stream.radiosaw.de', 'stream.0nlineradio.com', 'live.radioclasic.com',
                 'streamingcwsradio30.com', 'ss1.audiorama.com.mx', 'streaming.servicioswebmx.com', 'stream.laut.fm',
                 'fluxmusic.api.radiosphere.io', 'mdstrm.com', 'vistaradio.streamb.live')
SHARED_HOSTS = ('stream.zeno.fm', 'streaming.live365.com', 'listen.radioking.com', 'stream.radiojar.com',
                'stream.radio.co', 's4.radio.co', 's2.radio.co', 's3.radio.co', 's5.radio.co', 'radio.co')

GENRES = {
    'Afrobeat': r'afrobeat|afropop|afro pop', 'Highlife': r'highlife|hiplife', 'Amapiano': 'amapiano',
    'Ethiopian music': r'ethio|amharic music|tizita', 'Taarab': 'taarab|bongo flava', 'Soukous': r'soukous|rumba congo|ndombolo',
    'Mbalax': 'mbalax', 'Coupé-décalé': r'coupe.decale|zouglou', 'Kwaito': r'kwaito|gqom', 'African music': r'african|afrika|afro\b',
    'Samba': 'samba|pagode', 'Bossa nova': 'bossa nova', 'MPB': r'\bmpb\b|musica brasileira', 'Forró': r'forro',
    'Cumbia': 'cumbia', 'Tango': 'tango', 'Salsa': 'salsa', 'Son': r'son cubano|\bson\b', 'Bolero': 'bolero',
    'Fado': 'fado', 'Flamenco': 'flamenco', 'Chanson': 'chanson', 'Rebetiko': 'rebetiko|rembetiko',
    'Reggae': r'reggae(?!ton)|roots', 'Dub': r'\bdub\b', 'Dancehall': 'dancehall', 'Calypso': 'calypso|soca',
    'Kompa': 'kompa|konpa', 'Zouk': 'zouk', 'Raï': r'\brai\b', 'Gnawa': 'gnawa', 'Arabic music': r'arab|tarab',
    'Turkish music': r'turk|türkü', 'Persian music': 'persian|iran', 'Raga': r'raga|hindustani|carnatic',
    'Qawwali': 'qawwali', 'Bollywood': 'bollywood|filmi', 'Gamelan': 'gamelan', 'Enka': 'enka', 'City pop': 'city pop',
    'K-indie': r'k[- ]?indie', 'Celtic': 'celtic|irish trad', 'Bluegrass': 'bluegrass', 'Americana': 'americana',
    'Free jazz': 'free jazz', 'Jazz': r'jazz|bebop|swing', 'Blues': 'blues', 'Soul': r'\bsoul|motown', 'Funk': r'\bfunk',
    'Rare groove': 'rare groove', 'Disco': 'disco|boogie', 'Early music': r'early music|baroque|renaissance',
    'Contemporary classical': 'contemporary classical|new music|modern classical', 'Opera': r'opera(?!\w)',
    'Classical': r'classical|klassik|clasica|chamber|symphon', 'Ambient': r'ambient|drone', 'Downtempo': r'downtempo|chill',
    'Lounge': 'lounge', 'Lo-fi': r'lo[- ]?fi', 'Techno': 'techno', 'House': r'\bhouse', 'Drum & bass': r'drum (and|&) bass|dnb|jungle',
    'Electronic': r'electronic|electronica|idm|electro', 'Krautrock': 'krautrock', 'Post-rock': r'post[- ]rock',
    'Psychedelic': 'psych', 'Shoegaze': 'shoegaze', 'Post-punk': r'post[- ]punk', 'Punk': r'\bpunk', 'Indie': r'\bindie',
    'Folk': r'folk|traditional|folklor', 'World': r'world music|\bworld\b|global', 'Experimental': r'experimental|avant|sound art|radio art',
    'Freeform': r'freeform|free form|eclectic', 'Soundtracks': 'soundtrack|film music|library music|exotica',
    'Hip-hop': r'hip[- ]?hop|\brap\b|beats', 'R&B': r'r&b|rnb', 'Rock': r'\brock', 'Pop': r'\bpop',
}
GENRE_RULES = [(label, re.compile(r'(?<!\w)(?:' + pattern + r')', re.I)) for label, pattern in GENRES.items()]
COMPOSITE = {'Jazz': 'Free jazz', 'Classical': 'Contemporary classical'}
# Drifting chooses a region of the world before a station, so encounters reach everywhere,
# not only where the directory is dense.
WEST_ASIA = {'TR', 'IL', 'PS', 'LB', 'JO', 'SY', 'IQ', 'IR', 'SA', 'AE', 'QA', 'KW', 'BH', 'OM', 'YE', 'GE', 'AM', 'AZ', 'CY',
             'KZ', 'KG', 'UZ', 'TJ', 'TM', 'AF'}
SOUTH_ASIA = {'IN', 'PK', 'BD', 'NP', 'LK', 'BT', 'MV'}


def region(cc, continent):
    if continent == 'EU':
        return 'Europe'
    if cc in ('US', 'CA', 'GL', 'PM', 'BM'):
        return 'North America'
    if continent in ('NA', 'SA'):
        return 'Latin America'
    if continent == 'AF':
        return 'Africa'
    if continent == 'OC':
        return 'Oceania'
    return 'West Asia' if cc in WEST_ASIA else 'South Asia' if cc in SOUTH_ASIA else 'East Asia'


COUNTRY_ALIASES = {('US', 'United States'), ('GB', 'United Kingdom'), ('KR', 'South Korea'), ('RU', 'Russia')}


def norm(text):
    return ''.join(c for c in unicodedata.normalize('NFKD', text.casefold()) if not unicodedata.combining(c))


def fetch_json(path, cache_name):
    target = CACHE / cache_name
    if OFFLINE or (target.exists() and time.time() - target.stat().st_mtime < 86400):
        return json.loads(target.read_text())
    request = urllib.request.Request(API + path, headers={'User-Agent': 'strayhum-build/1.0'})
    data = urllib.request.urlopen(request, timeout=120).read()
    target.write_text(data.decode())
    return json.loads(data)


def niche_score(tags, name):
    score = 0.0
    for weight, pattern in NICHE.items():
        hits = len(set(m.group(0) for m in re.finditer(r'(?<!\w)(?:' + pattern + r')', tags)))
        score += weight * min(hits, 2)
    if re.search(r'(?<!\w)(?:' + MAINSTREAM + r')', tags):
        score -= 2.5
    if re.search(r'(?<!\w)(?:' + MAINSTREAM + r')', norm(name)):
        score -= 2
    return score


def clean_name(raw):
    name = ' '.join(raw.split())
    # Emoji and decorations, and bracketed country codes like ( AR ), are not part of a name.
    name = re.sub(r'[\U0001F000-\U0001FAFF\u2600-\u27BF\u2B00-\u2BFF\uFE0F]', '', name)
    name = re.sub(r'\s*[\(\[]\s*[A-Z]{2,3}\s*[\)\]]', '', name)
    name = ' '.join(name.split())
    name = re.sub(r'\s*(hi-?fi\s*)?(flac\s*)?[\(\[]?\b\d{2,4}\s?k(bps)?\b[^\)\]]*[\)\]]?', '', name, flags=re.I)
    name = re.sub(r'\s*[\(\[](mp3|aac\+?|ogg|opus|flac|hq|hd|lq|low|high|stereo|web|live)[\)\]]', '', name, flags=re.I)
    name = re.sub(r'\s*[|/–-]\s*(livestream|live stream|stream|webradio|web radio|online|listen live)$', '', name, flags=re.I)
    name = re.sub(r'\s+(mp3|aac\+?|ogg|opus|flac)$', '', name, flags=re.I)
    name = re.sub(r'([!?.\-*#~=_])\1+', r'\1', name).strip(' -|·:')
    # Frequencies, call-sign suffixes and provinces belong to the dial, not the name.
    name = re.sub(r'\s*\b\d{2,3}[.,]\d\s?(fm|mhz)?\b', '', name, flags=re.I)
    name = re.sub(r'^(fm|mhz)\s+|\s+(fm|mhz)$', '', name, flags=re.I) if len(name.split()) > 1 else name
    name = re.sub(r',\s*[A-Z]{2}$', '', name)
    name = re.sub(r'\s*\((hifi|midfi|lofi)[^)]*\)', '', name, flags=re.I).strip(' -|·:,"')
    if len(name) > 34:
        name = re.split(r'\s[-|–·:]\s|\s\(', name)[0].strip()
    if name.isupper() and len(name) > 14:
        name = name.title()
    return name


def label_genres(tags):
    found = []
    for label, rule in GENRE_RULES:
        if rule.search(tags) and label not in found:
            found.append(label)
    for broad, fine in COMPOSITE.items():
        if fine in found and broad in found:
            found.remove(broad)
    # Broad labels say little when a specific one is present.
    specific = [g for g in found if g not in ('Pop', 'Rock', 'World', 'Electronic', 'Folk')]
    return (specific + [g for g in found if g not in specific])[:3]


def sniff_audio(content_type, head):
    if content_type.startswith(('audio/', 'application/ogg')):
        return True
    if content_type.startswith(('application/octet-stream', 'binary/')) or not content_type:
        return head[:3] == b'ID3' or head[:4] == b'OggS' or (len(head) > 1 and head[0] == 0xFF and head[1] & 0xE0 == 0xE0)
    return False


def fetch_head(url, agent):
    """The first bytes and final response headers of a stream, fetched with curl over HTTP/2 like a browser.
    Some Icecast hosts answer HTTP/1.1 clients with a redirect to plain http, but browsers with the stream."""
    with tempfile.NamedTemporaryFile() as headers:
        process = subprocess.Popen(
            ['curl', '-sS', '-L', '--http2', '--proto-redir', '=https', '--max-redirs', '5', '-m', '9',
             '-A', agent, '-H', 'Origin: ' + ORIGIN, '-H', 'Icy-MetaData: 0', '-D', headers.name, url],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        started = time.time()
        head = b''
        while len(head) < 12000:
            chunk = process.stdout.read1(12000 - len(head))
            if not chunk:
                break
            head += chunk
        elapsed = time.time() - started
        process.kill()
        process.wait()
        blocks = [b for b in re.split(r'\r?\n\r?\n', open(headers.name, encoding='latin-1').read()) if b.strip()]
    final = {}
    for line in (blocks[-1].splitlines()[1:] if blocks else []):
        name, _, value = line.partition(':')
        final[name.strip().lower()] = value.strip()
    return head, final, elapsed


def check_stream(url):
    """GET the first bytes of a stream as Chrome and as Safari would: whether it plays in each, and allows analysis."""
    last = 'no answer'
    for candidate in (url, url.rstrip('/') + '/;') if urllib.parse.urlsplit(url).path in ('', '/') else (url,):
        head, headers, elapsed = fetch_head(candidate, CHROME)
        content_type = headers.get('content-type', '').lower()
        if sniff_audio(content_type, head) and len(head) >= 4000:
            allow = headers.get('access-control-allow-origin', '')
            safari_head, safari_headers, _ = fetch_head(candidate, SAFARI)
            safari = sniff_audio(safari_headers.get('content-type', '').lower(), safari_head) and len(safari_head) >= 4000
            return {'ok': True, 'url': candidate, 'cors': allow in ('*', ORIGIN), 'safari': safari,
                    'type': content_type.split(';')[0], 'seconds': round(elapsed, 2)}
        last = 'not audio: ' + content_type if headers else 'no answer'
    return {'ok': False, 'reason': last}


def check_all(urls):
    target = CACHE / 'checks.json'
    checks = json.loads(target.read_text()) if target.exists() else {}
    todo = [u for u in dict.fromkeys(urls) if u not in checks]
    if OFFLINE:
        todo = []
    print('checking', len(todo), 'streams,', len(checks), 'cached', flush=True)
    with concurrent.futures.ThreadPoolExecutor(48) as pool:
        for n, (url, result) in enumerate(zip(todo, pool.map(check_stream, todo)), 1):
            checks[url] = result
            if n % 200 == 0:
                print(' ', n, 'checked', flush=True)
                target.write_text(json.dumps(checks))
    target.write_text(json.dumps(checks))
    return checks


gc = geonamescache.GeonamesCache()
countries = gc.get_countries()
cities_by_country = collections.defaultdict(list)
for city in gc.get_cities().values():
    cities_by_country[city['countrycode']].append(city)


def place(lat, lon, cc):
    """The most populous place within 30 km, so a station in Mitte belongs to Berlin; else the nearest within 70 km."""
    scale = math.cos(math.radians(lat))

    def km(city):
        dx = ((city['longitude'] - lon + 180) % 360 - 180) * scale
        return 111.2 * math.hypot(city['latitude'] - lat, dx)

    near = [(km(c), c) for c in cities_by_country[cc]]
    close = [c for d, c in near if d <= 30]
    if close:
        return max(close, key=lambda c: c['population'])
    d, nearest = min(near, key=lambda pair: pair[0], default=(None, None))
    return nearest if d is not None and d <= 70 else None


def city_named(name, cc):
    matches = [c for c in cities_by_country[cc] if norm(c['name']) == norm(name) or norm(name) in map(norm, c.get('alternatenames', []))]
    return max(matches, key=lambda c: c['population'], default=None)


def main():
    CACHE.mkdir(exist_ok=True)
    rows = fetch_json('/stations/search?has_geo_info=true&hidebroken=true&limit=200000&order=votes&reverse=true', 'radio-browser.json')
    candidates = []
    for r in rows:
        url, cc = r['url_resolved'], r['countrycode']
        if not url.startswith('https://') or r['hls'] or not r['lastcheckok'] or cc not in countries or not cities_by_country[cc]:
            continue
        if r['codec'] not in ('MP3', 'AAC', 'AAC+', 'OGG'):
            continue
        tags = norm(r['tags'] + ' ')
        name = clean_name(r['name'])
        if len(name) < 3 or not re.search(r'[^\W\d_]{2}', name) or len(name) > 40 or re.search(NAME_EXCLUDE, norm(r['name'])):
            continue
        genres = label_genres(tags + ' ' + norm(r['name']))
        # Outside Europe and North America a station that mixes news and music is still an encounter,
        # and one without genre tags is described by its language.
        regional = countries[cc]['continentcode'] != 'EU' and cc not in ('US', 'CA')
        if re.search(RELIGIOUS, tags) or (re.search(SPOKEN, tags) and not (regional and genres)):
            continue
        language = r['language'].split(',')[0].strip()
        if not genres and regional and language and language not in ('english', 'spanish', 'french', 'portuguese'):
            genres = [language.title()]
        if not genres:
            continue
        score = niche_score(tags, name) + 0.9 * math.log10(1 + r['votes']) + 0.35 * math.log10(1 + r['clickcount'])
        if score < -0.5:
            continue
        candidates.append(dict(r=r, name=name, genres=genres, score=score, tier=2))
    # Outside Europe and North America the bar is lower, and countries with few stations get a lift:
    # a local station in Lagos or Dhaka is an encounter for most listeners, even when it plays the hits.
    strong = collections.Counter(c['r']['countrycode'] for c in candidates if c['score'] >= 2.2)
    for c in candidates:
        cc = c['r']['countrycode']
        c['region'] = region(cc, countries[cc]['continentcode'])
        c['score'] += 1.6 if strong[cc] < 12 else 0
        c['score'] += 1.4 if c['region'] not in ('Europe', 'North America') else 0
    candidates = [c for c in candidates if c['score'] >= 2.2]

    # Anchors: found by name, placed by the given city when Radio Browser has no location.
    anchor_rows = []
    for query, cc, city_name in ANCHORS:
        path = '/stations/search?' + urllib.parse.urlencode(dict(name=query, countrycode=cc, hidebroken='true', order='votes', reverse='true', limit=6))
        found = fetch_json(path, 'anchor-' + re.sub(r'\W+', '-', norm(query + '-' + cc)) + '.json')
        for r in found:
            if (r['url_resolved'].startswith('https://') and not r['hls'] and r['codec'] in ('MP3', 'AAC', 'AAC+', 'OGG')
                    and norm(query) in norm(r['name'])):
                anchor_rows.append(dict(r=r, name=query, genres=label_genres(norm(r['tags'] + ' ' + r['name'])) or ['Freeform'],
                                        score=20.0, tier=1, city=city_name))
                break
        else:
            print('  anchor not found:', query, cc)

    # Hand-placed stations keep their ids, so links shared from the first version still resolve.
    curated_rows = []
    for s in json.loads(subprocess.check_output(
            ['node', '-e', "global.window=global;require('./data/curated-stations.js');process.stdout.write(JSON.stringify(STATIONS))"], cwd=ROOT)):
        cc = next(code for code, c in countries.items() if c['name'] == s['country'] or (code, s['country']) in COUNTRY_ALIASES)
        freq = s['frequency'] if re.match(r'^\d', s['frequency']) else None
        for url in s['urls']:
            curated_rows.append(dict(
                r=dict(stationuuid=s['id'], url_resolved=url, countrycode=cc, geo_lat=s['lat'], geo_long=s['lon']),
                name=s['name'], genres=label_genres(norm(s['genre'])) or [s['genre']], score=30.0,
                # A hand-placed station is an anchor unless it is a hits format.
                tier=2 if re.search(r'hits', s['genre'], re.I) else 1, city=s['city'], freq=freq, alias=s.get('alias')))

    pool = curated_rows + anchor_rows + sorted(candidates, key=lambda c: -c['score'])[:4200]
    checks = check_all(c['r']['url_resolved'] for c in pool)

    chosen, seen_streams, seen_names = [], set(), set()
    per_country, per_city, per_host, per_family = (collections.Counter() for _ in range(4))
    for c in pool:
        r = c['r']
        check = checks.get(r['url_resolved'], {})
        if not check.get('ok'):
            continue
        cc = r['countrycode']
        lat, lon, city = r['geo_lat'], r['geo_long'], None
        if lat is not None and lon is not None and (lat, lon) != (0, 0):
            city = place(lat, lon, cc)
        if 'city' in c and 'freq' not in c:
            # Anchors sit on their named city: Radio Browser often places them at a server or a suburb.
            named = city_named(c['city'], cc)
            if named:
                city, lat, lon = named, named['latitude'], named['longitude']
        if not city:
            continue
        host = urllib.parse.urlsplit(check['url']).hostname
        stream_key = host + urllib.parse.urlsplit(check['url']).path.rstrip('/;')
        name_key = (cc, re.sub(r'\W+', '', norm(c['name'])))
        family = (cc, ' '.join(norm(c['name']).split()[:2]))
        if stream_key in seen_streams or name_key in seen_names:
            continue
        if c['tier'] == 2:
            europe = countries[cc]['continentcode'] == 'EU'
            if per_country[cc] >= (24 if cc in ('US', 'DE', 'FR', 'GB') else 14 if europe else 20):
                continue
            if per_city[city['geonameid']] >= 4 or per_family[family] >= 2:
                continue
            if host in NETWORK_HOSTS and per_host[host] >= 2 or host not in SHARED_HOSTS and per_host[host] >= 6:
                continue
        seen_streams.add(stream_key)
        seen_names.add(name_key)
        per_country[cc] += 1
        per_city[city['geonameid']] += 1
        per_host[host] += 1
        per_family[family] += 1
        station = dict(
            id=r['stationuuid'], name=c['name'], city=city['name'], country=countries[cc]['name'],
            region=region(cc, countries[cc]['continentcode']),
            lat=round(lat, 3), lon=round(lon, 3), zone=city['timezone'], genres=c['genres'],
            url=check['url'], cors=check['cors'], tier=c['tier'],
        )
        for key in ('freq', 'alias'):
            if c.get(key):
                station[key] = c[key]
        if check.get('safari') is False:
            station['safari'] = False
        chosen.append(station)

    sources = find_all_now_playing(chosen)
    for station in chosen:
        if sources.get(station['url']):
            station['np'] = sources[station['url']]

    chosen.sort(key=lambda s: (s['tier'], s['country'], s['city'], s['name']))
    out = ROOT / 'dist/stations.js'
    out.write_text(
        '// Generated by scripts/build-stations.py. Directory: Radio Browser (radio-browser.info). Places: GeoNames (CC BY 4.0).\n'
        '// Every stream answered with audio when this file was built.\n'
        'window.STATIONS = [\n' + ',\n'.join(json.dumps(s, ensure_ascii=False, separators=(',', ':')) for s in chosen) + '\n];\n')
    print(len(chosen), 'stations,', sum(s['tier'] == 1 for s in chosen), 'anchors,', len({s['country'] for s in chosen}), 'countries,',
          sum(s['cors'] for s in chosen), 'allow analysis,', sum('np' in s for s in chosen), 'say what is playing')


def read_cors_json(url):
    request = urllib.request.Request(url, headers={'Origin': ORIGIN, 'User-Agent': CHROME})
    with urllib.request.urlopen(request, timeout=6) as response:
        if (response.headers.get('Access-Control-Allow-Origin') or '') not in ('*', ORIGIN):
            return None
        return json.loads(response.read(600000).decode('utf-8', 'replace'))


def find_now_playing(stream):
    """A public, browser-readable source for the title on air: Icecast's status page or AzuraCast's API."""
    parts = urllib.parse.urlsplit(stream)
    base = f'{parts.scheme}://{parts.netloc}'
    mount = parts.path.rstrip(';').rstrip('/')
    try:
        data = read_cors_json(base + '/status-json.xsl')
        sources = (data or {}).get('icestats', {}).get('source', [])
        sources = sources if isinstance(sources, list) else [sources]
        for source in sources:
            if urllib.parse.urlsplit(source.get('listenurl', '')).path.rstrip('/') == mount or len(sources) == 1:
                return {'kind': 'icecast', 'url': base + '/status-json.xsl', 'mount': mount}
    except Exception:  # noqa: BLE001 - no status page is the common case
        pass
    try:
        data = read_cors_json(base + '/api/nowplaying')
        data = data if isinstance(data, list) else [data] if data else []
        for entry in data:
            station = entry.get('station', {})
            paths = [urllib.parse.urlsplit(m.get('url', '')).path.rstrip('/') for m in station.get('mounts', [])]
            paths.append(urllib.parse.urlsplit(station.get('listen_url', '')).path.rstrip('/'))
            if mount in paths or len(data) == 1:
                return {'kind': 'azuracast', 'url': base + '/api/nowplaying/' + str(station.get('shortcode') or station.get('id'))}
    except Exception:  # noqa: BLE001
        pass
    return None


def find_all_now_playing(stations):
    target = CACHE / 'now-playing.json'
    found = json.loads(target.read_text()) if target.exists() else {}
    todo = [] if OFFLINE else [s['url'] for s in stations if s['url'] not in found and s['id'] not in TRACK_FEEDS]
    with concurrent.futures.ThreadPoolExecutor(48) as pool:
        for url, source in zip(todo, pool.map(find_now_playing, todo)):
            found[url] = source
    target.write_text(json.dumps(found))
    return found


# Stations whose broadcaster publishes its own playlist feed, read by dist/track.js.
TRACK_FEEDS = ('fip', 'kexp', 'swissjazz')


if __name__ == '__main__':
    main()
