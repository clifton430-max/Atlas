/**
 * Interactive map marker for a pin-like item (private pin or shared pin).
 * Combines MapMarker (geographic anchoring) + PinMarkerVisual (look) inside
 * an accessible button. Image markers resolve a signed URL first; Storage
 * policies decide whether the viewer may load it.
 *
 * Droplet pins are anchored at their tip. Hovering (or keyboard focus) shows
 * a short card — title and the start of the description — and clicking or
 * tapping opens the full details panel. Touch devices have no hover, so a
 * tap goes straight to the details (the equivalent interaction).
 */
import { useState } from 'react';
import type { PinAppearance, PinImage } from '@/lib/types';
import { MapMarker } from '@/features/map/MapMarker';
import { useMap, zoomScale } from '@/features/map/MapContext';
import { isDroplet, PinMarkerVisual, type PinMarkerVisualProps } from './PinMarkerVisual';
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
  /** Staggered entrance (ms) when a personal world appears; none under reduced motion. */
  revealDelay?: number;
  /** Category look for pins without a custom colour/icon. */
  glyph?: PinMarkerVisualProps['glyph'];
  /** Short name drawn under the pin when zoomed in (like the map's own labels). */
  caption?: string;
  /** Hover card text: title and a short description. */
  hover?: { title: string; description?: string | null; meta?: string | null };
}

export function PinMarker({ latitude, longitude, label, appearance, image, fallbackIcon, groupColors, selected, onSelect, revealDelay, glyph, caption, hover }: PinMarkerProps) {
  const signed = useSignedImageUrl(appearance.imageId ? image?.storagePath : null);
  const [hovered, setHovered] = useState(false);
  return (
    <MapMarker latitude={latitude} longitude={longitude} anchor={isDroplet(appearance) ? 'bottom' : 'center'} zIndex={selected ? 12 : hovered ? 11 : undefined}>
      <PinMarkerButton
        label={label}
        onSelect={onSelect}
        appearance={appearance}
        imageUrl={signed.data ?? null}
        imageLoading={!!appearance.imageId && signed.isLoading}
        fallbackIcon={fallbackIcon}
        groupColors={groupColors}
        selected={selected}
        revealDelay={revealDelay}
        glyph={glyph}
        caption={caption}
        hover={hover}
        onHoverChange={setHovered}
      />
    </MapMarker>
  );
}

/**
 * The clickable marker element placed inside a MapMarker. Its box is exactly
 * the visual's box, so the marker's anchor sits on the coordinate.
 */
export function PinMarkerButton({ label, onSelect, revealDelay, caption, hover, onHoverChange, ...visual }: Omit<PinMarkerVisualProps, 'scale'> & {
  label: string; onSelect: () => void; revealDelay?: number; caption?: string;
  hover?: PinMarkerProps['hover']; onHoverChange?: (v: boolean) => void;
}) {
  const { zoom } = useMap();
  const [showCard, setShowCard] = useState(false);
  const set = (v: boolean) => { setShowCard(v); onHoverChange?.(v); };
  const desc = hover?.description?.trim();
  return (
    <span className="relative block">
      <button
        type="button"
        aria-label={label}
        aria-pressed={visual.selected}
        data-testid="pin-marker"
        data-image-marker={visual.appearance.imageId && visual.imageUrl ? 'true' : undefined}
        data-tour={visual.appearance.imageId && visual.imageUrl ? 'image-marker' : undefined}
        onClick={(e) => {
          e.stopPropagation();
          set(false);
          onSelect();
        }}
        onPointerEnter={(e) => e.pointerType === 'mouse' && set(true)}
        onPointerLeave={() => set(false)}
        onFocus={() => set(true)}
        onBlur={() => set(false)}
        className={`block leading-none transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-offset-4 motion-reduce:hover:translate-y-0 ${revealDelay != null ? 'atlas-pin-in' : ''}`}
        style={revealDelay != null ? { animationDelay: `${revealDelay}ms` } : undefined}
      >
        <PinMarkerVisual {...visual} scale={zoomScale(zoom)} />
      </button>
      {caption && zoom >= 15 && !showCard && (
        <span aria-hidden className="atlas-pin-caption pointer-events-none absolute left-1/2 top-full mt-1 max-w-[140px] -translate-x-1/2 truncate whitespace-nowrap text-center text-[11px] font-semibold text-neutral-800">
          {caption}
        </span>
      )}
      {showCard && hover && !visual.selected && (
        <span role="tooltip" data-testid="pin-hover-card"
          className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 block w-56 -translate-x-1/2 rounded-xl bg-white p-2.5 text-left shadow-float ring-1 ring-black/5 animate-rise-in">
          <span className="block truncate text-[13px] font-semibold text-neutral-900">{hover.title}</span>
          {hover.meta && <span className="block truncate text-[11px] text-neutral-500">{hover.meta}</span>}
          {desc && <span className="mt-0.5 line-clamp-2 block text-[12px] leading-snug text-neutral-700">{desc.length > 140 ? `${desc.slice(0, 140)}…` : desc}</span>}
          <span className="mt-1 block text-[10px] text-neutral-400">Click for details</span>
        </span>
      )}
    </span>
  );
}
