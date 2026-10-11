/**
 * Last viewport per personal map (device-local). When you open a map, its
 * saved view is restored ONLY if none of that map's content is currently in
 * view — so switching from Discover never jumps you away when your pins are
 * already on screen, but an empty screen takes you to where your map is.
 */
const KEY = 'atlas.mapViews.v1';
export interface SavedView { center: [number, number]; zoom: number; pitch: number; bearing: number }

function all(): Record<string, SavedView> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}; } catch { return {}; }
}
export function saveMapView(mapId: string, v: SavedView) {
  const a = all();
  a[mapId] = v;
  const ids = Object.keys(a);
  if (ids.length > 50) delete a[ids[0]];
  try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* not persisted */ }
}
export const loadMapView = (mapId: string): SavedView | null => all()[mapId] ?? null;
