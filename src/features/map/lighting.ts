/**
 * Day / night lighting. "Auto" uses the APPROXIMATE local solar time at the
 * map centre (UTC + longitude / 15 — no time zones, no sunrise tables); the
 * Layers panel says so and lets people force Day or Night. Lighting is a
 * colour change only (no motion), so it also applies under reduced motion.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { isNightAt } from '@/features/places/ambient';
import { useMapInstance } from './MapContext';

export type LightingMode = 'auto' | 'day' | 'night';
export const LIGHTING_OPTIONS: { id: LightingMode; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'day', label: 'Day' },
  { id: 'night', label: 'Night' },
];

const KEY = 'atlas.lighting.v1';
const listeners = new Set<() => void>();
let mode: LightingMode = (() => {
  try {
    const v = typeof window === 'undefined' ? null : localStorage.getItem(KEY);
    return v === 'day' || v === 'night' ? v : 'auto';
  } catch { return 'auto'; }
})();

export function setLightingMode(v: LightingMode) {
  mode = v;
  try { localStorage.setItem(KEY, v); } catch { /* not persisted */ }
  listeners.forEach((l) => l());
}
export function useLightingMode(): LightingMode {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => mode, () => 'auto');
}

/** Whether the map should currently be drawn at night. */
export function useIsNight(): boolean {
  const lighting = useLightingMode();
  const { map } = useMapInstance();
  const [autoNight, setAutoNight] = useState(() => (map ? isNightAt(map.getCenter().lng) : false));
  useEffect(() => {
    if (!map || lighting !== 'auto') return;
    const update = () => setAutoNight(isNightAt(map.getCenter().lng));
    update();
    map.on('moveend', update);
    const t = setInterval(update, 5 * 60_000);
    return () => { map.off('moveend', update); clearInterval(t); };
  }, [map, lighting]);
  return lighting === 'night' || (lighting === 'auto' && autoNight);
}
