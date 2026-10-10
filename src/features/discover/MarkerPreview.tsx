/**
 * Compact hover/keyboard-focus preview for a Discover marker: name, category
 * (icon + label + color), date for events, a trustworthy thumbnail when one is
 * available, and straight-line distance when the user has shared location.
 *
 * - Anchored to the item's real coordinates via a MapLibre marker.
 * - pointer-events: none -> no hover flicker and never blocks the map.
 * - Thumbnails: event images come with the Ticketmaster listing; place images
 *   come from cached place details, requested once after a short dwell (never
 *   per pointer movement).
 * - Purely supplementary (aria-hidden): the same information is available in
 *   the keyboard-accessible results list and the details card.
 */
import { useEffect, useState } from 'react';
import { MapMarker } from '@/features/map/MapMarker';
import { useMapInstance } from '@/features/map/MapContext';
import { CATEGORY_BY_ID, eventVisual } from '@/features/places/categories';
import { CategoryDot } from '@/features/places/CategoryIcon';
import { distanceLabel } from '@/features/places/geo';
import { usePlaceDetails } from '@/features/places/placeDetails';
import { useUserLocation } from '@/features/places/userLocation';
import type { Place } from '@/features/places/types';
import { formatEventStart } from '@/lib/format';
import { safeExternalUrl } from '@/lib/validation';
import type { AtlasEvent } from '@/lib/types';

const DWELL_MS = 350;

export function MarkerPreview({ event, place }: { event?: AtlasEvent | null; place?: Place | null }) {
  const { location } = useUserLocation();
  const { map } = useMapInstance();
  const [dwelled, setDwelled] = useState(false);
  const key = event?.id ?? place?.ref ?? '';
  useEffect(() => {
    setDwelled(false);
    const t = setTimeout(() => setDwelled(true), DWELL_MS);
    return () => clearTimeout(t);
  }, [key]);
  const details = usePlaceDetails(place ?? null, !!place && dwelled);
  const [imgOk, setImgOk] = useState(true);
  useEffect(() => setImgOk(true), [key]);

  if (!event && !place) return null;
  const lat = event ? event.latitude : place!.latitude;
  const lng = event ? event.longitude : place!.longitude;
  if (lat == null || lng == null) return null;

  const visual = event
    ? { ...eventVisual(event.category), label: event.isDevFixture ? 'Development sample' : eventVisual(event.category).label }
    : { color: CATEGORY_BY_ID[place!.categoryId].color, icon: CATEGORY_BY_ID[place!.categoryId].icon, label: place!.subcategoryLabel };
  const thumb = event ? safeExternalUrl(event.imageUrl) : details.data?.image?.thumbUrl ?? null;
  const dist = distanceLabel(location, { latitude: lat, longitude: lng });

  // Keep the callout inside the map: open below the pin near the top edge, and
  // shift sideways near the left/right edges.
  const pt = map?.project([lng, lat]);
  const { clientWidth: w = 0 } = map?.getContainer() ?? {};
  const below = !!pt && pt.y < 150;
  const side = !pt ? '' : pt.x < 160 ? '-left' : pt.x > w - 160 ? '-right' : '';
  const anchor = `${below ? 'top' : 'bottom'}${side}` as 'bottom';

  return (
    <MapMarker latitude={lat} longitude={lng} anchor={anchor} zIndex={20} interactive={false}>
      {/* The margin clears the pin (≈ 46 px tall) so the card reads as a callout. */}
      <div aria-hidden data-testid="marker-preview" className={`pointer-events-none relative ${below ? 'mt-3' : 'mb-14'} flex w-72 gap-3 rounded-2xl bg-white p-2.5 shadow-float ring-1 ring-black/5 animate-rise-in`}>
        {thumb && imgOk
          ? <img src={thumb} alt="" onError={() => setImgOk(false)} className="size-16 shrink-0 rounded-xl object-cover" />
          : <span className="grid size-16 shrink-0 place-items-center rounded-xl" style={{ background: `${visual.color}1a` }}><CategoryDot color={visual.color} icon={visual.icon} size="md" /></span>}
        <div className="min-w-0 flex-1 space-y-0.5 py-0.5">
          <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-neutral-900">{event?.name ?? place!.name}</p>
          <div className="flex items-center gap-1.5 text-[11px] text-neutral-600">
            <CategoryDot color={visual.color} icon={visual.icon} />
            <span className="truncate">{visual.label}</span>
          </div>
          {event && <p className="truncate text-[11px] text-neutral-600">{formatEventStart(event)}</p>}
          {event?.venueName && <p className="truncate text-[11px] text-neutral-500">{event.venueName}</p>}
          {dist && <p className="text-[11px] font-medium text-accent">{dist}</p>}
          <p className="text-[10px] text-neutral-400">{event ? `Source: ${event.sourceName ?? event.provider}` : 'Source: OpenStreetMap'} · click for details</p>
        </div>
        {!below && !side && <span aria-hidden className="absolute -bottom-1.5 left-1/2 size-3 -translate-x-1/2 rotate-45 bg-white" />}
      </div>
    </MapMarker>
  );
}
