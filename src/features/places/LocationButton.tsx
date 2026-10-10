/**
 * Explicit "Use my location" control for distance display. Location is
 * requested only on click, stays on this device, and is never sent to Atlas
 * or providers. Shows denied/unavailable/stale states honestly.
 */
import { LocateFixed, LocateOff, Loader2 } from 'lucide-react';
import { clearUserLocation, requestUserLocation, useUserLocation } from './userLocation';

export function LocationButton() {
  const { status, stale } = useUserLocation();
  const label = status === 'granted'
    ? (stale ? 'Location may be out of date — refresh' : 'Distances shown from your location (tap to turn off)')
    : status === 'denied' ? 'Location permission denied — distances unavailable'
      : status === 'unavailable' ? 'Location unavailable — try again'
        : 'Use my location to show distances';
  return (
    <button
      type="button"
      data-tour="use-location"
      aria-pressed={status === 'granted'}
      title={label}
      aria-label={label}
      onClick={() => (status === 'granted' && !stale ? clearUserLocation() : void requestUserLocation())}
      className="flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-[13px] font-medium text-neutral-800 ring-1 ring-line hover:bg-neutral-50 aria-pressed:bg-lime-soft aria-pressed:ring-lime-strong"
    >
      {status === 'locating' ? <Loader2 className="size-4 animate-spin" aria-hidden />
        : status === 'denied' || status === 'unavailable' ? <LocateOff className="size-4" aria-hidden />
          : <LocateFixed className="size-4" aria-hidden />}
      <span>{status === 'granted' ? (stale ? 'Refresh location' : 'Showing distances from you') : 'Distance'}</span>
    </button>
  );
}
