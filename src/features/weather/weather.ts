/**
 * Weather for the map's atmosphere.
 *
 * Modes (Settings → Map animations & weather, saved on this device):
 *   auto    — follows REAL current conditions at the map centre from
 *             Open-Meteo (https://open-meteo.com, CC BY 4.0, no API key).
 *             Coordinates are rounded to 0.25° (~25 km) before they leave
 *             the device, cached for 15 minutes, and re-fetched only when the
 *             map moves to another 0.25° cell. When live data isn't available
 *             NO weather is drawn and the map says so — nothing is invented.
 *   manual  — the person picks the effect; automatic data never overrides it.
 *   off     — no weather effects.
 *
 * The engine is a set of independent effects (SkyLayer.tsx) driven by a
 * WeatherState, so new conditions only need a new entry here and a target
 * mix in SkyLayer — not a rewrite.
 */
import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUi } from '@/app/store';

export type WeatherKind = 'clear' | 'partly-cloudy' | 'cloudy' | 'rain' | 'storm' | 'fog' | 'snow';
export type WeatherMode = 'auto' | 'manual' | 'off';

export interface WeatherState {
  kind: WeatherKind;
  /** 0..1 — light rain vs heavy rain, a few clouds vs overcast. */
  intensity: number;
  isDay: boolean;
}

export const WEATHER_KINDS: { id: WeatherKind; label: string }[] = [
  { id: 'clear', label: 'Clear / sunny' },
  { id: 'partly-cloudy', label: 'Partly cloudy' },
  { id: 'cloudy', label: 'Cloudy' },
  { id: 'rain', label: 'Rainy' },
  { id: 'storm', label: 'Thunderstorm' },
  { id: 'fog', label: 'Fog' },
  { id: 'snow', label: 'Snow' },
];
export const WEATHER_LABEL = Object.fromEntries(WEATHER_KINDS.map((k) => [k.id, k.label])) as Record<WeatherKind, string>;

/** WMO weather interpretation code (Open-Meteo `weather_code`) -> effect. */
export function fromWmo(code: number, cloudCover: number | null, isDay: boolean): WeatherState {
  const cc = cloudCover == null ? null : Math.max(0, Math.min(1, cloudCover / 100));
  const s = (kind: WeatherKind, intensity: number): WeatherState => ({ kind, intensity, isDay });
  if (code === 0) return s('clear', 0);
  if (code === 1) return s('partly-cloudy', cc ?? 0.25);
  if (code === 2) return s('partly-cloudy', cc ?? 0.5);
  if (code === 3) return s('cloudy', cc ?? 0.95);
  if (code === 45 || code === 48) return s('fog', 0.8);
  if (code >= 51 && code <= 57) return s('rain', code >= 55 ? 0.35 : 0.2); // drizzle
  if (code === 61 || code === 80) return s('rain', 0.35);
  if (code === 63 || code === 81 || code === 66) return s('rain', 0.6);
  if (code === 65 || code === 82 || code === 67) return s('rain', 0.95);
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return s('snow', code === 75 || code === 86 ? 0.9 : code === 73 ? 0.6 : 0.35);
  if (code >= 95) return s('storm', code >= 96 ? 1 : 0.8);
  return s('cloudy', cc ?? 0.7);
}

// ---- Preferences (device-local) ------------------------------------------------
export interface WeatherPrefs { mode: WeatherMode; manual: WeatherKind; intensity: number }
const KEY = 'atlas.weather.v1';
const DEFAULT_PREFS: WeatherPrefs = { mode: 'auto', manual: 'rain', intensity: 0.6 };
const listeners = new Set<() => void>();
function read(): WeatherPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (v && ['auto', 'manual', 'off'].includes(v.mode) && WEATHER_KINDS.some((k) => k.id === v.manual) && typeof v.intensity === 'number') {
      return { mode: v.mode, manual: v.manual, intensity: Math.max(0.1, Math.min(1, v.intensity)) };
    }
  } catch { /* defaults */ }
  return DEFAULT_PREFS;
}
let prefs = read();
export const getWeatherPrefs = () => prefs;
export function setWeatherPrefs(patch: Partial<WeatherPrefs>) {
  prefs = { ...prefs, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* not persisted */ }
  listeners.forEach((l) => l());
}
export function useWeatherPrefs(): WeatherPrefs {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => prefs, () => DEFAULT_PREFS);
}

// ---- Live data -----------------------------------------------------------------
export interface LiveWeather {
  state: WeatherState;
  code: number;
  temperatureC: number | null;
  /** Rounded point the data is for. */
  latitude: number;
  longitude: number;
  observedAt: string | null;
}

export class WeatherError extends Error {
  constructor(public code: 'rate_limited' | 'unavailable', message: string) { super(message); }
}

const round = (v: number) => Math.round(v * 4) / 4;
export const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';

export async function fetchLiveWeather(lat: number, lng: number, signal?: AbortSignal): Promise<LiveWeather> {
  const q = new URLSearchParams({
    latitude: String(lat), longitude: String(lng),
    current: 'weather_code,cloud_cover,is_day,temperature_2m', timezone: 'auto',
  });
  let res: Response;
  try {
    res = await fetch(`${WEATHER_URL}?${q}`, { signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new WeatherError('unavailable', 'The weather service couldn’t be reached.');
  }
  if (res.status === 429) throw new WeatherError('rate_limited', 'The weather service is busy (rate limit). Atlas will try again later.');
  if (!res.ok) throw new WeatherError('unavailable', 'The weather service didn’t return current conditions.');
  const body = await res.json() as { current?: Record<string, unknown> };
  const c = body.current;
  const code = Number(c?.weather_code);
  if (!c || !Number.isInteger(code)) throw new WeatherError('unavailable', 'The weather service didn’t return current conditions.');
  const cloud = typeof c.cloud_cover === 'number' ? c.cloud_cover : null;
  return {
    state: fromWmo(code, cloud, c.is_day !== 0),
    code,
    temperatureC: typeof c.temperature_2m === 'number' ? c.temperature_2m : null,
    latitude: lat, longitude: lng,
    observedAt: typeof c.time === 'string' ? c.time : null,
  };
}

/** Real current weather at the map centre (auto mode only). */
export function useLiveWeather(enabled: boolean) {
  const bbox = useUi((s) => s.bbox);
  const lat = bbox ? round((bbox.north + bbox.south) / 2) : null;
  const lng = bbox ? round((((bbox.east + bbox.west) / 2 + 540) % 360) - 180) : null;
  return useQuery({
    queryKey: ['weather', lat, lng],
    enabled: enabled && lat != null && lng != null,
    queryFn: ({ signal }) => fetchLiveWeather(lat!, lng!, signal),
    staleTime: 15 * 60_000,
    gcTime: 60 * 60_000,
    refetchInterval: 15 * 60_000,
    refetchOnWindowFocus: false,
    retry: (n, e) => n < 1 && !(e instanceof WeatherError && e.code === 'rate_limited'),
    placeholderData: (prev) => prev,
  });
}

/** What the map should draw now (null = nothing), plus the live-data status. */
export function useWeather() {
  const p = useWeatherPrefs();
  const live = useLiveWeather(p.mode === 'auto');
  const state: WeatherState | null = p.mode === 'off' ? null
    : p.mode === 'manual' ? { kind: p.manual, intensity: p.intensity, isDay: true }
      : live.data && !live.isError ? live.data.state : null;
  return { prefs: p, state, live };
}

/**
 * IANA time zone at a point (for "open now"), from the same Open-Meteo
 * service with coordinates rounded to 0.25°. Cached for the session; null
 * when unknown — callers then show hours without an open/closed status.
 */
export function useTimeZoneAt(lat: number | null | undefined, lng: number | null | undefined) {
  const rl = lat == null ? null : round(lat);
  const rg = lng == null ? null : round(lng);
  return useQuery({
    queryKey: ['timezone', rl, rg],
    enabled: rl != null && rg != null,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
    queryFn: async ({ signal }) => {
      const q = new URLSearchParams({ latitude: String(rl), longitude: String(rg), timezone: 'auto', current: 'is_day' });
      const res = await fetch(`${WEATHER_URL}?${q}`, { signal });
      if (!res.ok) throw new WeatherError(res.status === 429 ? 'rate_limited' : 'unavailable', 'Time zone unavailable');
      const tz = ((await res.json()) as { timezone?: unknown }).timezone;
      if (typeof tz !== 'string' || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(tz)) return null;
      try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return null; }
    },
  });
}
