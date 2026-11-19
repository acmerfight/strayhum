/* The weather where the station is, so the window shows their clouds and their rain.
   From Open-Meteo (open-meteo.com): no key, open to browsers. Kept for twenty minutes per place. */
const CLEAR = { cloud: 0, rain: 0, snow: 0, fog: 0, words: '', temperature: null };
const weatherCache = new Map();

/** Weather now at a station, or clear skies if it cannot be had. */
async function weatherAt(station) {
  const cached = weatherCache.get(station.id);
  if (cached && Date.now() - cached.at < 20 * 60000) return cached.weather;
  const url =
    'https://api.open-meteo.com/v1/forecast?' +
    new URLSearchParams({
      latitude: String(station.lat),
      longitude: String(station.lon),
      current: 'temperature_2m,cloud_cover,precipitation,weather_code',
    });
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const now = (await response.json()).current;
    const weather = describe(now);
    weatherCache.set(station.id, { at: Date.now(), weather });
    return weather;
  } catch {
    return CLEAR;
  }
}

/** WMO weather codes to what the window paints, and a few words for the caption. */
function describe({ weather_code: code, cloud_cover: cover, precipitation, temperature_2m: temperature }) {
  const wet = clamp((precipitation ?? 0) / 3, 0.25, 1);
  const cloud = clamp((cover ?? 0) / 100, 0, 1);
  const base = { ...CLEAR, cloud, temperature };
  if (code === 45 || code === 48) return { ...base, fog: 0.85, cloud: Math.max(cloud, 0.6), words: 'fog' };
  if (code >= 95) return { ...base, rain: 1, cloud: 1, words: 'thunderstorm' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { ...base, snow: wet, cloud: Math.max(cloud, 0.8), words: 'snow' };
  if (code >= 51 && code <= 57) return { ...base, rain: 0.3, cloud: Math.max(cloud, 0.7), words: 'drizzle' };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { ...base, rain: wet, cloud: Math.max(cloud, 0.75), words: code >= 80 ? 'showers' : 'rain' };
  if (cloud > 0.85) return { ...base, words: 'overcast' };
  if (cloud > 0.4) return { ...base, words: 'cloudy' };
  return { ...base, words: 'clear' };
}

/** Temperature in the reader's customary unit. */
function temperatureText(celsius) {
  if (celsius === null || celsius === undefined) return '';
  const fahrenheit = /^en-(US|LR)|^my\b/.test(navigator.language);
  return fahrenheit ? `${Math.round((celsius * 9) / 5 + 32)}°F` : `${Math.round(celsius)}°`;
}
