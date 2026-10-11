/**
 * Directions for the selected place / event / pin: real route distance and
 * travel time (OSRM via the `route` Edge Function) for walking or driving,
 * drawn on the map. Location is used only after the user asks; it is sent
 * once to the routing service to compute the route. If routing fails, the
 * straight-line distance is shown, clearly labelled as such. No accessibility
 * or arrival-time guarantees are made.
 */
import { useEffect, useState } from 'react';
import { Car, Footprints, LocateFixed, Navigation, Route as RouteIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Feedback';
import { cn } from '@/components/ui/cn';
import { useMapInstance } from '@/features/map/MapContext';
import { distanceLabel, formatDistance } from '@/features/places/geo';
import { requestUserLocation, useUserLocation } from '@/features/places/userLocation';
import { formatDuration, RouteFailure, useRoute, type TravelMode } from './route';
import { setDrawnRoute } from './routeStore';

const ERRORS: Record<string, string> = {
  no_route: 'No route was found to this destination for this travel mode.',
  too_far: 'This destination is too far away for a route here.',
  rate_limited: 'Too many route requests — try again in a minute.',
  not_configured: 'Routing needs the Atlas server, which isn’t configured here.',
  unavailable: 'The routing service isn’t available right now.',
};

export function Directions({ latitude, longitude, name }: { latitude: number | null; longitude: number | null; name: string }) {
  const { map } = useMapInstance();
  const { location, status } = useUserLocation();
  const [mode, setMode] = useState<TravelMode>('walking');
  const [wanted, setWanted] = useState(false);
  const route = useRoute(location, { latitude, longitude }, mode, wanted);

  // Draw the route while this panel shows it; clear when it closes or changes.
  useEffect(() => {
    setDrawnRoute(wanted && route.data ? route.data : null);
    return () => setDrawnRoute(null);
  }, [wanted, route.data]);

  if (latitude == null || longitude == null) return null;
  const straight = distanceLabel(location, { latitude, longitude });
  const err = route.error instanceof RouteFailure ? route.error.code : route.error ? 'unavailable' : null;

  const start = async () => {
    setWanted(true);
    if (!location) await requestUserLocation();
  };
  const fit = () => {
    if (!map || !route.data) return;
    const xs = route.data.geometry.map((c) => c[0]);
    const ys = route.data.geometry.map((c) => c[1]);
    map.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 80, maxZoom: 16 });
  };

  return (
    <section aria-labelledby="directions-heading" className="space-y-2 border-t border-line pt-3">
      <div className="flex items-center justify-between gap-2">
        <h4 id="directions-heading" className="flex items-center gap-1.5 text-[13px] font-semibold"><RouteIcon className="size-4" aria-hidden />Directions</h4>
        <div role="radiogroup" aria-label="Travel mode" className="flex rounded-lg bg-canvas p-0.5 ring-1 ring-line">
          {([['walking', 'Walk', Footprints], ['driving', 'Drive', Car]] as const).map(([m, label, Icon]) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
              className={cn('flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium', mode === m ? 'bg-white shadow-chip ring-1 ring-line' : 'text-neutral-600')}>
              <Icon className="size-3.5" aria-hidden />{label}
            </button>
          ))}
        </div>
      </div>

      {!wanted ? (
        <Button size="sm" variant="secondary" className="w-full" icon={<Navigation className="size-4" aria-hidden />} onClick={start}>
          Get route from my location
        </Button>
      ) : !location ? (
        <p className="text-xs text-neutral-600" role="status">
          {status === 'locating' ? 'Finding your location…'
            : status === 'denied' ? 'Location permission is denied, so a route can’t be calculated. You can allow it in your browser’s site settings.'
              : <>Your location isn’t available. <button type="button" className="underline" onClick={() => void requestUserLocation()}><LocateFixed className="inline size-3" aria-hidden /> Try again</button></>}
        </p>
      ) : route.isLoading ? (
        <Spinner label={`Calculating ${mode} route`} />
      ) : route.data ? (
        <div className="rounded-xl bg-canvas p-3" role="status">
          <p className="text-[15px] font-semibold">
            {formatDistance(route.data.distanceMeters)} · {formatDuration(route.data.durationSeconds)} <span className="text-xs font-normal text-neutral-500">{mode === 'walking' ? 'walking' : 'driving'}</span>
          </p>
          <p className="text-[11px] text-neutral-500">Estimated by the route service for the mapped network to {name}. Actual time varies; accessibility isn’t guaranteed.</p>
          <div className="mt-1 flex items-center justify-between text-[11px] text-neutral-500">
            <span>{route.data.attribution}</span>
            <button type="button" className="underline" onClick={fit}>Show whole route</button>
          </div>
        </div>
      ) : (
        <div className="space-y-1 text-xs text-neutral-600" role="status">
          <p>{ERRORS[err ?? 'unavailable']}</p>
          {straight && <p className="font-medium text-neutral-800">{straight}</p>}
        </div>
      )}
      {wanted && location && <p className="text-[10px] text-neutral-400">Your location was sent once to the routing service to calculate this route.</p>}
    </section>
  );
}
