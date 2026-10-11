/**
 * DEV-ONLY verification harness (route /__dev/marker-check, never included
 * in production builds — see App.tsx). Renders the real MapMarker +
 * PinMarkerVisual components with a generated image so Playwright can verify
 * that an image marker is the actual interactive map marker: anchored at its
 * coordinate, following pans/zooms, with no default marker underneath, and
 * clickable. (The Supabase signed-URL step is exercised separately.)
 */
import { useMemo, useState } from 'react';
import { MapCanvas } from '@/features/map/MapCanvas';
import { MapMarker } from '@/features/map/MapMarker';
import { MapProvider } from '@/features/map/MapContext';
import { PinMarkerButton } from '@/features/pins/PinMarker';
import { DEFAULT_APPEARANCE } from '@/lib/types';
import { resolveMapStyleUrl } from '@/lib/env';

export const CHECK_COORD = { latitude: 40.7484, longitude: -73.9857 };

function makeImage(): string {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#e11d48';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#fde047';
  ctx.fillRect(16, 16, 32, 32);
  return c.toDataURL('image/png');
}

function Markers({ onClick }: { onClick: () => void }) {
  const url = useMemo(makeImage, []);
  return (
    <MapMarker {...CHECK_COORD}>
      <PinMarkerButton
        label="Image marker"
        onSelect={onClick}
        appearance={{ ...DEFAULT_APPEARANCE, shape: 'rounded', imageId: 'x', size: 48, imageMask: 'rounded' }}
        imageUrl={url}
        fallbackIcon="map-pin"
        groupColors={['#2f5bea']}
      />
    </MapMarker>
  );
}

/** The standard droplet pin, anchored by its tip. */
export const DROPLET_COORD = { latitude: 40.7527, longitude: -73.9772 };
function Droplet({ onClick }: { onClick: () => void }) {
  return (
    <MapMarker {...DROPLET_COORD} anchor="bottom">
      <PinMarkerButton label="Droplet marker" onSelect={onClick} appearance={DEFAULT_APPEARANCE} fallbackIcon="map-pin" hover={{ title: 'Droplet marker', description: 'A short description shown on hover.' }} />
    </MapMarker>
  );
}

export function MarkerCheck() {
  const [clicks, setClicks] = useState(0);
  return (
    <MapProvider>
      <div className="relative h-full">
        <MapCanvas styleUrl={resolveMapStyleUrl('positron')}>
          <Markers onClick={() => setClicks((c) => c + 1)} />
          <Droplet onClick={() => setClicks((c) => c + 1)} />
        </MapCanvas>
        <output data-testid="clicks" className="absolute left-2 top-2 rounded bg-white px-2 py-1 text-sm shadow">clicks: {clicks}</output>
      </div>
    </MapProvider>
  );
}
