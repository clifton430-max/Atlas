/**
 * The user's location for distance sorting and display. Requested ONLY when
 * the user asks (Distance / Nearest / Go to my location / Directions), or read
 * silently when the browser reports the permission was ALREADY granted for
 * this site. Kept in memory on this device and marked stale after 15 min.
 * It leaves the device only when the user explicitly requests directions
 * (sent once to the routing service to compute that route; never stored).
 */
import { useSyncExternalStore } from 'react';
import { isValidLatLng } from '@/lib/validation';

export interface UserLocation { latitude: number; longitude: number; accuracy: number; at: number }
export type LocationStatus = 'idle' | 'locating' | 'granted' | 'denied' | 'unavailable';

interface State { location: UserLocation | null; status: LocationStatus }
let state: State = { location: null, status: 'idle' };
const listeners = new Set<() => void>();
const set = (s: Partial<State>) => { state = { ...state, ...s }; listeners.forEach((l) => l()); };

export const STALE_MS = 15 * 60 * 1000;

export function requestUserLocation(): Promise<UserLocation | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    set({ status: 'unavailable' });
    return Promise.resolve(null);
  }
  set({ status: 'locating' });
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!isValidLatLng(pos.coords.latitude, pos.coords.longitude)) { set({ status: 'unavailable' }); resolve(null); return; }
        const loc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy, at: Date.now() };
        set({ location: loc, status: 'granted' });
        resolve(loc);
      },
      (err) => {
        set({ status: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable' });
        resolve(null);
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}

/**
 * If (and only if) the browser says location permission is already granted,
 * fetch it without prompting. Never triggers a permission prompt.
 */
export async function restoreLocationIfPermitted(): Promise<void> {
  if (state.location || state.status === 'locating' || typeof navigator === 'undefined' || !navigator.permissions?.query) return;
  try {
    const p = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    if (p.state === 'granted') await requestUserLocation();
  } catch { /* Permissions API unavailable: wait for an explicit request */ }
}

export function clearUserLocation() { set({ location: null, status: 'idle' }); }

export function useUserLocation(): State & { stale: boolean } {
  const s = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state, () => state);
  return { ...s, stale: !!s.location && Date.now() - s.location.at > STALE_MS };
}

/** Test helper */
export function __setUserLocationForTests(loc: UserLocation | null, status: LocationStatus = loc ? 'granted' : 'idle') { set({ location: loc, status }); }
