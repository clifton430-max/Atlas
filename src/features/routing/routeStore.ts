/** The route currently drawn on the map (one at a time). */
import { useSyncExternalStore } from 'react';
import type { RouteResult } from './route';

let current: RouteResult | null = null;
const listeners = new Set<() => void>();
export function setDrawnRoute(r: RouteResult | null) { current = r; listeners.forEach((l) => l()); }
export function useDrawnRoute() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => current, () => null);
}
