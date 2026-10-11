/**
 * Device compass heading (degrees clockwise from true/magnetic north) from
 * orientation sensors, where the browser provides them:
 *   - iOS Safari: `webkitCompassHeading` (needs a permission tap first);
 *   - Android Chrome: `deviceorientationabsolute` (alpha relative to north).
 * Desktop browsers usually have no sensor — `supported` is then false and
 * the compass simply resets the map to north (the reliable fallback).
 */
import { useSyncExternalStore } from 'react';

type State = { heading: number | null; active: boolean; error: string | null };
let state: State = { heading: null, active: false, error: null };
const listeners = new Set<() => void>();
const set = (p: Partial<State>) => { state = { ...state, ...p }; listeners.forEach((l) => l()); };

type IOSOrientation = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };

export function headingSupported(): boolean {
  if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return false;
  // Phones and tablets: coarse pointer. Laptops expose the API without a sensor.
  return !!window.matchMedia?.('(pointer: coarse)').matches;
}

function onOrientation(e: DeviceOrientationEvent & { webkitCompassHeading?: number }) {
  let h: number | null = null;
  if (typeof e.webkitCompassHeading === 'number' && !Number.isNaN(e.webkitCompassHeading)) h = e.webkitCompassHeading;
  else if (e.absolute && typeof e.alpha === 'number') h = (360 - e.alpha) % 360;
  if (h == null) return;
  // Account for screen rotation (landscape).
  const angle = (screen.orientation?.angle ?? 0) as number;
  set({ heading: (h + angle + 360) % 360 });
}

export async function startHeading(): Promise<boolean> {
  if (!headingSupported()) { set({ error: 'This device doesn’t report a compass heading.' }); return false; }
  const D = DeviceOrientationEvent as IOSOrientation;
  try {
    if (typeof D.requestPermission === 'function' && (await D.requestPermission()) !== 'granted') {
      set({ error: 'Motion & orientation access was not allowed.' });
      return false;
    }
  } catch {
    set({ error: 'Motion & orientation access was not allowed.' });
    return false;
  }
  window.addEventListener('deviceorientationabsolute', onOrientation as EventListener, true);
  window.addEventListener('deviceorientation', onOrientation as EventListener, true);
  set({ active: true, error: null });
  return true;
}

export function stopHeading() {
  window.removeEventListener('deviceorientationabsolute', onOrientation as EventListener, true);
  window.removeEventListener('deviceorientation', onOrientation as EventListener, true);
  set({ active: false, heading: null });
}

export function useDeviceHeading(): State {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state, () => state);
}
