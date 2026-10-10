/**
 * The user's location for distance display. Requested ONLY when the user
 * clicks "Use my location" (never on hover), kept in memory on this device,
 * never sent to Atlas servers or providers, and marked stale after 15 min.
 */
import { useSyncExternalStore } from 'react';

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

export function clearUserLocation() { set({ location: null, status: 'idle' }); }

export function useUserLocation(): State & { stale: boolean } {
  const s = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state, () => state);
  return { ...s, stale: !!s.location && Date.now() - s.location.at > STALE_MS };
}

/** Test helper */
export function __setUserLocationForTests(loc: UserLocation | null, status: LocationStatus = loc ? 'granted' : 'idle') { set({ location: loc, status }); }
