"""Build the images of the Earth in dist/earth/.

  day.jpg                        the ground, cloud-free (NASA Blue Marble Next Generation)
  lights.png                     only the artificial light at night, one grey channel (NASA Black Marble)
  relief.jpg                     the slope of the land as a normal map in red and green, and the sea in blue,
                                 from Mapzen terrain tiles (AWS open data)
  clouds.jpg                     one day's clouds, from NASA's VIIRS and MODIS true-colour imagery

All equirectangular, longitude -180 at the left, north at the top. NASA imagery is public domain.
Usage: python3 scripts/build-earth.py   (requires numpy and pillow)
"""
from concurrent.futures import ThreadPoolExecutor
import io
import time
from pathlib import Path
import urllib.parse
import urllib.request

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist/earth'
CACHE = ROOT / '.cache/earth'
WMS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?'
TERRAIN = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'


def fetch(url, name):
    path = CACHE / name
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        for attempt in range(4):
            try:
                path.write_bytes(urllib.request.urlopen(url, timeout=300).read())
                break
            except OSError:
                if attempt == 3:
                    raise
                time.sleep(2 * (attempt + 1))
    return Image.open(io.BytesIO(path.read_bytes()))


def world(layer, image_format, width, time=None, name=None):
    query = dict(SERVICE='WMS', REQUEST='GetMap', VERSION='1.3.0', CRS='EPSG:4326', BBOX='-90,-180,90,180',
                 WIDTH=width, HEIGHT=width // 2, STYLES='', LAYERS=layer, FORMAT=image_format)
    if time:
        query['TIME'] = time
    return fetch(WMS + urllib.parse.urlencode(query), name)


def ground():
    # A single composite: the service does not keep the monthly versions apart.
    image = world('BlueMarble_NextGeneration', 'image/jpeg', 4096, name='day.jpg').convert('RGB')
    image.save(OUT / 'day.jpg', quality=86, optimize=True, progressive=True)


def lights():
    night = np.asarray(world('VIIRS_Black_Marble', 'image/png', 8192, name='night.png').convert('RGB')).astype(np.float32)
    r, g, b = night[..., 0], night[..., 1], night[..., 2]
    # The base image shows land under moonlight in blue; lights are the warm excess over it.
    glow = np.clip((r * 0.6 + g * 0.4) - b * 0.92, 0, 255)
    glow = 255 * np.clip(glow / 150, 0, 1) ** 0.8
    Image.fromarray(glow.astype(np.uint8), 'L').save(OUT / 'lights.png', optimize=True)


def elevation(z=5):
    """The world's elevation in metres, as a Web Mercator square of 2^z tiles."""
    n = 2 ** z
    tiles = [(x, y) for y in range(n) for x in range(n)]
    with ThreadPoolExecutor(24) as pool:
        images = list(pool.map(lambda t: fetch(TERRAIN.format(z=z, x=t[0], y=t[1]), f'terrain/{z}-{t[0]}-{t[1]}.png'), tiles))
    out = np.zeros((n * 256, n * 256), np.float32)
    for (x, y), image in zip(tiles, images):
        px = np.asarray(image.convert('RGB')).astype(np.float32)
        out[y * 256:(y + 1) * 256, x * 256:(x + 1) * 256] = px[..., 0] * 256 + px[..., 1] + px[..., 2] / 256 - 32768
    return out


def relief(width=4096, exaggeration=14.0):
    merc = elevation()
    size = merc.shape[0]
    height = width // 2
    lat = np.radians(90 - (np.arange(height) + 0.5) * 180 / height)
    lon = (np.arange(width) + 0.5) / width * 360 - 180
    # Mercator rows for each latitude; beyond 85 degrees the poles take the last row.
    y = (1 - np.log(np.tan(np.clip(lat, -1.4844, 1.4844)) + 1 / np.cos(np.clip(lat, -1.4844, 1.4844))) / np.pi) / 2 * size
    x = (lon + 180) / 360 * size
    yi = np.clip(y.astype(int), 0, size - 1)
    xi = np.clip(x.astype(int), 0, size - 1)
    h = merc[yi[:, None], xi[None, :]]
    # Antarctica's ice and the Arctic beyond the tiles: hold the edge values.
    sea = h < -15
    land = np.maximum(h, 0)
    # Slope in metres per metre, east and north, on the sphere.
    cell = 2 * np.pi * 6371000 / width
    dx = (np.roll(land, -1, axis=1) - np.roll(land, 1, axis=1)) / (2 * cell * np.maximum(np.cos(lat)[:, None], 0.05))
    dy = (np.vstack([land[:1], land[:-1]]) - np.vstack([land[1:], land[-1:]])) / (2 * cell)
    nx, ny = -dx * exaggeration, -dy * exaggeration
    norm = np.sqrt(nx * nx + ny * ny + 1)
    rgb = np.stack([(nx / norm) * 0.5 + 0.5, (ny / norm) * 0.5 + 0.5, sea.astype(np.float32)], axis=-1)
    Image.fromarray((rgb * 255).clip(0, 255).astype(np.uint8), 'RGB').save(OUT / 'relief.jpg', quality=90, subsampling=0, optimize=True)


def clouds(day='2026-11-18'):
    """One day's clouds: what the satellites saw, less the cloud-free ground of that month."""
    ground = np.asarray(Image.open(OUT / 'day.jpg').convert('L').resize((4096, 2048))).astype(np.float32)
    layers = []
    for layer in ('VIIRS_SNPP_CorrectedReflectance_TrueColor', 'VIIRS_NOAA20_CorrectedReflectance_TrueColor', 'MODIS_Terra_CorrectedReflectance_TrueColor'):
        image = np.asarray(world(layer, 'image/jpeg', 4096, day, f'{layer}-{day}.jpg').convert('RGB')).astype(np.float32)
        grey = image.min(axis=-1)
        spread = image.max(axis=-1) - grey
        # Cloud is bright and colourless, and brighter than the ground beneath.
        white = np.clip((grey - ground * 0.85 - 35) / 140, 0, 1) * np.clip(1 - spread / 55, 0, 1)
        valid = image.max(axis=-1) > 10
        layers.append(np.where(valid, white, np.nan))
    stack = np.stack(layers)
    # Sun glint and the gaps between swaths fall in different places for each satellite, at a
    # different hour: keep only what at least two of them saw, where two saw that place at all.
    count = np.sum(~np.isnan(stack), axis=0)
    ordered = np.sort(np.nan_to_num(stack, nan=2.0), axis=0)
    seen = np.where(count >= 2, ordered[1] * (ordered[1] <= 1) + ordered[0] * (ordered[1] > 1), np.nan_to_num(np.nanmax(np.where(count[None] >= 1, stack, 0), axis=0)))
    seen = np.where(count >= 2, np.minimum(ordered[0] * 0.4 + ordered[1] * 0.6, 1), seen)
    seen = np.clip(seen, 0, 1) ** 1.15
    # Where no satellite saw (the polar night), the edge of the data is a zigzag of swaths; feather it.
    covered = Image.fromarray(((count > 0) * 255).astype(np.uint8), 'L').filter(ImageFilter.GaussianBlur(28))
    seen *= np.clip((np.asarray(covered).astype(np.float32) / 255 - 0.5) * 2.2, 0, 1)
    Image.fromarray((seen * 255).astype(np.uint8), 'L').save(OUT / 'clouds.jpg', quality=88, optimize=True)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    ground()
    lights()
    relief()
    clouds()
    for path in sorted(OUT.iterdir()):
        print(path.name, path.stat().st_size // 1024, 'kB')


if __name__ == '__main__':
    main()
