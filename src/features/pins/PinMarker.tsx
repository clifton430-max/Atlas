/**
 * Interactive map marker for a pin-like item (private pin or shared pin).
 * Combines MapMarker (geographic anchoring) + PinMarkerVisual (look) inside
 * an accessible button. Image markers resolve a signed URL first; Storage
 * policies decide whether the viewer may load it.
 */
import type { PinAppearance, PinImage } from '@/lib/types';
import { MapMarker } from '@/features/map/MapMarker';
import { useMap, zoomScale } from '@/features/map/MapContext';
import { PinMarkerVisual, type PinMarkerVisualProps } from './PinMarkerVisual';
import { useSignedImageUrl } from './images';

export interface PinMarkerProps {
  latitude: number;
  longitude: number;
  label: string;
  appearance: PinAppearance;
  image: PinImage | null;
  fallbackIcon: 'map-pin' | 'ticket';
  groupColors?: string[];
  selected?: boolean;
  onSelect: () => void;
}

export function PinMarker({ latitude, longitude, label, appearance, image, fallbackIcon, groupColors, selected, onSelect }: PinMarkerProps) {
  const signed = useSignedImageUrl(appearance.imageId ? image?.storagePath : null);
  return (
    <MapMarker latitude={latitude} longitude={longitude} zIndex={selected ? 10 : undefined}>
      <PinMarkerButton
        label={label}
        onSelect={onSelect}
        appearance={appearance}
        imageUrl={signed.data ?? null}
        imageLoading={!!appearance.imageId && signed.isLoading}
        fallbackIcon={fallbackIcon}
        groupColors={groupColors}
        selected={selected}
      />
    </MapMarker>
  );
}

/**
 * The clickable marker element placed inside a MapMarker. Its box is exactly
 * the visual's box, so the marker's center sits on the coordinate.
 */
export function PinMarkerButton({ label, onSelect, ...visual }: Omit<PinMarkerVisualProps, 'scale'> & { label: string; onSelect: () => void }) {
  const { zoom } = useMap();
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={visual.selected}
      title={label}
      data-testid="pin-marker"
      data-image-marker={visual.appearance.imageId && visual.imageUrl ? 'true' : undefined}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      className="block rounded-full leading-none focus-visible:outline-offset-4"
    >
      <PinMarkerVisual {...visual} scale={zoomScale(zoom)} />
    </button>
  );
}
