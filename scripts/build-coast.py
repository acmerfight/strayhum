"""Build dist/coast.png: a signed distance to the nearest coastline, in degrees of arc.

The globe shader draws the coast, the engraved water lines and the land hatching from this
one channel, so lines stay one device pixel wide at any zoom.

Usage: python3 scripts/build-coast.py   (requires numpy, scipy and pillow)
Source: Natural Earth 1:50m land and lakes (public domain), downloaded into .cache/.
"""
import json
from pathlib import Path
import urllib.request

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.cache'
SOURCE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_{}.geojson'
WIDTH, HEIGHT = 4096, 2048
SUPERSAMPLE = 2
# Distances saturate here. The shader's farthest water line sits inside this range.
MAX_DEGREES = 3.0


def geometry(name):
    path = CACHE / f'ne_50m_{name}.geojson'
    if not path.exists():
        CACHE.mkdir(exist_ok=True)
        path.write_bytes(urllib.request.urlopen(SOURCE.format(name), timeout=120).read())
    for feature in json.loads(path.read_text())['features']:
        geom = feature['geometry']
        yield from (geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']])


LAKE_MIN_SQUARE_DEGREES = 0.3


def ring_area(ring):
    """Area in square degrees of longitude-scaled-to-latitude, enough to rank lakes by size."""
    total = 0.0
    for (x0, y0, *_), (x1, y1, *_) in zip(ring, ring[1:] + ring[:1]):
        total += (x0 * y1 - x1 * y0) * np.cos(np.radians((y0 + y1) / 2))
    return abs(total) / 2


def rasterize():
    w, h = WIDTH * SUPERSAMPLE, HEIGHT * SUPERSAMPLE
    image = Image.new('L', (w, h), 0)
    draw = ImageDraw.Draw(image)
    to_pixels = lambda ring: [((lon + 180) / 360 * w, (90 - lat) / 180 * h) for lon, lat, *_ in ring]
    for polygon in geometry('land'):
        draw.polygon(to_pixels(polygon[0]), fill=255)
        for hole in polygon[1:]:
            draw.polygon(to_pixels(hole), fill=0)
    for polygon in geometry('lakes'):
        # Only lakes a reader of a world map would expect, roughly Lake Tana and larger.
        if ring_area(polygon[0]) >= LAKE_MIN_SQUARE_DEGREES:
            draw.polygon(to_pixels(polygon[0]), fill=0)
    coverage = np.asarray(image, dtype=np.float32).reshape(HEIGHT, SUPERSAMPLE, WIDTH, SUPERSAMPLE).mean(axis=(1, 3)) / 255
    return coverage >= 0.5


def squared_distance(target):
    """Squared great-circle-ish distance in degrees to the nearest True cell.
    Rows are measured at their own latitude, columns wrap around the date line."""
    step = 180 / HEIGHT
    latitudes = 90 - (np.arange(HEIGHT) + 0.5) * step
    rows = np.full((HEIGHT, WIDTH), np.inf, dtype=np.float32)
    for y in range(HEIGHT):
        line = np.tile(target[y], 3)
        if not line.any():
            continue
        scale = max(np.cos(np.radians(latitudes[y])), 1e-3) * step
        rows[y] = (ndimage.distance_transform_edt(~line, sampling=scale)[WIDTH:2 * WIDTH] ** 2)
    reach = int(np.ceil(MAX_DEGREES / step)) + 1
    best = rows.copy()
    for dy in range(1, reach + 1):
        cost = np.float32((dy * step) ** 2)
        best[dy:] = np.minimum(best[dy:], rows[:-dy] + cost)
        best[:-dy] = np.minimum(best[:-dy], rows[dy:] + cost)
    return best


def main():
    land = rasterize()
    half = 90 / HEIGHT
    signed = np.sqrt(squared_distance(~land)) - np.sqrt(squared_distance(land))
    # Each cell centre sits half a cell from the boundary between two cells.
    signed = np.where(signed > 0, signed - half, signed + half)
    signed = ndimage.gaussian_filter(np.clip(signed, -MAX_DEGREES, MAX_DEGREES), sigma=0.8, mode=('nearest', 'wrap'))
    encoded = np.clip(np.round(127.5 + signed / MAX_DEGREES * 127.5), 0, 255).astype(np.uint8)
    out = ROOT / 'dist/coast.png'
    Image.fromarray(encoded, 'L').save(out, optimize=True)
    print(out, f'{out.stat().st_size / 1024:.0f} kB', f'land {land.mean():.1%}')


if __name__ == '__main__':
    main()
