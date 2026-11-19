"""Build the whole-Earth images seen from orbit during long drifts.

  dist/earth-day.jpg     NASA Blue Marble, shaded relief and bathymetry
  dist/earth-lights.png  NASA VIIRS Black Marble, only the artificial light, as one grey channel

Both from NASA GIBS (gibs.earthdata.nasa.gov), public domain.
Usage: python3 scripts/build-earth.py   (requires numpy and pillow)
"""
from pathlib import Path
import io
import urllib.parse
import urllib.request

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
WMS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?'


def world(layer, image_format, width):
    query = urllib.parse.urlencode(dict(SERVICE='WMS', REQUEST='GetMap', VERSION='1.3.0', CRS='EPSG:4326', BBOX='-90,-180,90,180',
                                        WIDTH=width, HEIGHT=width // 2, STYLES='', LAYERS=layer, FORMAT=image_format))
    return Image.open(io.BytesIO(urllib.request.urlopen(WMS + query, timeout=300).read()))


def main():
    day = world('BlueMarble_ShadedRelief_Bathymetry', 'image/jpeg', 2048).convert('RGB')
    day.save(ROOT / 'dist/earth-day.jpg', quality=84, optimize=True, progressive=True)

    night = np.asarray(world('VIIRS_Black_Marble', 'image/png', 4096).convert('RGB')).astype(np.float32)
    r, g, b = night[..., 0], night[..., 1], night[..., 2]
    # The base image shows land under moonlight in blue; lights are the warm excess over it.
    lights = np.clip((r * 0.6 + g * 0.4) - b * 0.92, 0, 255)
    lights = 255 * np.clip(lights / 150, 0, 1) ** 0.8
    Image.fromarray(lights.astype(np.uint8), 'L').save(ROOT / 'dist/earth-lights.png', optimize=True)
    for name in ('earth-day.jpg', 'earth-lights.png'):
        print(name, (ROOT / 'dist' / name).stat().st_size // 1024, 'kB')


if __name__ == '__main__':
    main()
