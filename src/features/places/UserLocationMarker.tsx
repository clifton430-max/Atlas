/**
 * "You are here": a blue dot with an accuracy halo at the shared location
 * (only after the person shares it — never requested by this component),
 * plus a heading cone when the device's compass is active.
 */
import { MapMarker } from '@/features/map/MapMarker';
import { useMap } from '@/features/map/MapContext';
import { useDeviceHeading } from '@/features/map/deviceHeading';
import { useUserLocation } from './userLocation';

export function UserLocationMarker() {
  const { location } = useUserLocation();
  const { heading } = useDeviceHeading();
  const { map, zoom } = useMap();
  if (!location || !map) return null;
  const mpp = (40_075_016.686 * Math.cos((location.latitude * Math.PI) / 180)) / (512 * 2 ** zoom);
  const halo = Math.min(220, Math.max(18, (location.accuracy / mpp) * 2));
  const bearing = map.getBearing();
  return (
    <MapMarker latitude={location.latitude} longitude={location.longitude} interactive={false} zIndex={4}>
      <span className="relative grid place-items-center" style={{ width: halo, height: halo }} data-testid="user-location" aria-hidden>
        <span className="absolute inset-0 rounded-full bg-[#2f5bea]/12 ring-1 ring-[#2f5bea]/25" />
        {heading != null && (
          <svg viewBox="0 0 60 60" className="absolute size-16" style={{ transform: `rotate(${heading - bearing}deg)` }}>
            <defs><linearGradient id="atlas-heading" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#2f5bea" stopOpacity="0.45" /><stop offset="1" stopColor="#2f5bea" stopOpacity="0" /></linearGradient></defs>
            <path d="M30 30 L18 2 A30 30 0 0 1 42 2 Z" fill="url(#atlas-heading)" />
          </svg>
        )}
        <span className="relative size-4 rounded-full bg-[#2f5bea] shadow-[0_0_0_3px_#fff,0_2px_6px_rgba(0,0,0,0.35)] motion-safe:animate-pulse" />
      </span>
    </MapMarker>
  );
}
