/**
 * Browser-safe configuration. Everything here is compiled into the client
 * bundle, so only PUBLIC values may be read (VITE_* variables). Secrets such
 * as the Ticketmaster key live in Supabase Edge Function secrets instead.
 */
const read = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

export const env = {
  supabaseUrl: read(import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: read(import.meta.env.VITE_SUPABASE_ANON_KEY),
  mapStyleUrl: read(import.meta.env.VITE_MAP_STYLE_URL),
  geocoderUrl: read(import.meta.env.VITE_GEOCODER_URL) ?? 'https://photon.komoot.io/api/',
};

/** True when Supabase is configured; auth & persistence require it. */
export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);

export type MapStyleName = 'positron' | 'bright' | 'liberty';

export const MAP_STYLES: { id: MapStyleName; label: string }[] = [
  { id: 'positron', label: 'Light (Positron)' },
  { id: 'bright', label: 'Bright' },
  { id: 'liberty', label: 'Liberty' },
];

/**
 * Resolve the MapLibre style URL. A custom VITE_MAP_STYLE_URL pointing at a
 * non-OpenFreeMap provider wins and disables the in-app style choice.
 */
export function resolveMapStyleUrl(pref: MapStyleName = 'positron'): string {
  const custom = env.mapStyleUrl;
  if (custom && !custom.startsWith('https://tiles.openfreemap.org/styles/')) return custom;
  return `https://tiles.openfreemap.org/styles/${pref}`;
}

export const isMapStyleCustomizable = !(
  env.mapStyleUrl && !env.mapStyleUrl.startsWith('https://tiles.openfreemap.org/styles/')
);
