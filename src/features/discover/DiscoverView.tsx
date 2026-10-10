/**
 * Discover context (/). Public data only:
 *   - events (Ticketmaster, clustered layer with event-type icons),
 *   - places (OpenStreetMap POIs from the basemap tiles, by category),
 *   - hover/keyboard-focus previews, rich details in the inspector with an
 *     inline "Add to map" form,
 *   - an honest data-source banner whenever event results are not live.
 * All Discover state (selection, hover, categories) stays in Discover and is
 * cleared on exit so it never leaks into personal or collaboration maps.
 */
import { useCallback, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { uiStore, useUi } from '@/app/store';
import { qk } from '@/lib/queryClient';
import { eventProvider } from '@/services/events';
import { Notice, Spinner, ErrorMessage } from '@/components/ui/Feedback';
import { useMapInstance } from '@/features/map/MapContext';
import { useSavedEvents } from '@/features/pins/api';
import { AddToMap, revealAddToMap } from '@/features/pins/AddToMap';
import { PlacesLayer } from '@/features/places/PlacesLayer';
import { PlaceCard } from '@/features/places/PlaceCard';
import { usePlaceDetails, type PlaceChild } from '@/features/places/placeDetails';
import { categorizeSubclass, subclassesFor } from '@/features/places/categories';
import { parsePlaceRef, type Place } from '@/features/places/types';
import { SelectionEmphasis } from '@/features/places/SelectionEmphasis';
import { InspectorPortal } from '@/app/Inspector';
import { DiscoverLayer } from './DiscoverLayer';
import { EventCard } from './EventCard';
import { MarkerPreview } from './MarkerPreview';
import { useDiscoverEvents } from './useDiscoverEvents';

export function DiscoverView() {
  const { map } = useMapInstance();
  const discover = useDiscoverEvents();
  const saved = useSavedEvents();
  const selectedId = useUi((s) => s.selectedEventId);
  const selectedPlace = useUi((s) => s.selectedPlace);
  const hoverItem = useUi((s) => s.hoverItem);
  const categories = useUi((s) => s.discoverCategories);
  const subcats = useUi((s) => s.discoverSubcategories);
  const placeDetails = usePlaceDetails(selectedPlace);

  const subclasses = useMemo(() => subclassesFor(categories, subcats), [categories, subcats]);
  const savedIds = useMemo(() => new Set(saved.data?.keys() ?? []), [saved.data]);
  const fromList = discover.all.find((e) => e.id === selectedId);
  // A search result may be outside the loaded viewport: fetch it directly.
  const single = useQuery({
    queryKey: qk.event(selectedId ?? ''),
    enabled: !!selectedId && !fromList,
    queryFn: () => eventProvider.getById(selectedId!),
  });
  const selected = fromList ?? single.data ?? null;

  const onSelect = useCallback((id: string) => uiStore.set({ selectedEventId: id, selectedPlace: null, hoverItem: null }), []);
  const onHoverEvent = useCallback((id: string | null) => uiStore.set({ hoverItem: id ? { kind: 'event', id } : null }), []);
  const onSelectPlace = useCallback((p: Place) => uiStore.set({ selectedPlace: p, selectedEventId: null, hoverItem: null }), []);
  const onHoverPlace = useCallback((p: Place | null) => uiStore.set({ hoverItem: p ? { kind: 'place', place: p } : null }), []);

  const selectChild = (c: PlaceChild) => {
    map?.easeTo({ center: [c.longitude, c.latitude], zoom: Math.max(map.getZoom(), 16) });
    const parsed = parsePlaceRef(c.ref);
    const cat = categorizeSubclass(c.subclass);
    // Children of a supported type become the selected place; others are just shown on the map.
    if (parsed && cat) {
      onSelectPlace({ ref: c.ref, ...parsed, name: c.name, subclass: c.subclass, categoryId: cat.category.id,
        subcategoryLabel: cat.sub.label, latitude: c.latitude, longitude: c.longitude });
    }
  };

  // Leaving Discover clears its transient state so it can't leak into other contexts.
  useEffect(() => () => uiStore.set({ selectedEventId: null, selectedPlace: null, hoverItem: null }), []);

  const hoveredEvent = hoverItem?.kind === 'event' ? discover.all.find((e) => e.id === hoverItem.id) ?? null : null;
  const hoveredPlace = hoverItem?.kind === 'place' ? hoverItem.place : null;
  const showPreview = (hoveredEvent && hoveredEvent.id !== selectedId) || (hoveredPlace && hoveredPlace.ref !== selectedPlace?.ref);

  return (
    <>
      <DiscoverLayer events={discover.filtered} savedIds={savedIds} selectedId={selectedId} onSelect={onSelect} onHover={onHoverEvent} />
      <PlacesLayer subclasses={subclasses} selected={selectedPlace} onSelect={onSelectPlace} onHover={onHoverPlace} />
      <SelectionEmphasis event={selected} place={selectedPlace} />
      {showPreview && <MarkerPreview event={hoveredEvent} place={hoveredPlace} />}

      {/* Status stack sits at the bottom so it never collides with cards. */}
      <div data-tour="discover-status" className="pointer-events-none absolute bottom-36 left-1/2 sm:bottom-24 z-10 flex w-[min(560px,calc(100%-32px))] -translate-x-1/2 flex-col-reverse items-center gap-2">
        {categories.length === 0 && (
          <div className="pointer-events-auto rounded-full bg-white px-3 py-1 text-xs text-neutral-700 shadow-panel" role="status">All Discover categories are hidden.</div>
        )}
        {discover.eventsVisible && discover.notice && (
          <Notice tone="warning" className="pointer-events-auto shadow-panel">{discover.notice}</Notice>
        )}
        {discover.eventsVisible && discover.detail && !discover.notice && !discover.isFetching && (
          <div className="pointer-events-auto rounded-full bg-white/90 px-3 py-1 text-xs text-neutral-600 shadow-panel" role="status">
            {discover.detail}
          </div>
        )}
        {discover.isFetching && <div className="pointer-events-auto rounded-full bg-white px-3 py-1 shadow-panel"><Spinner label="Loading events" /></div>}
        {discover.error && <div className="pointer-events-auto"><ErrorMessage error={discover.error} className="shadow-panel" /></div>}
      </div>

      {selected && (
        <InspectorPortal title="Selected event" openKey={`event:${selected.id}`} closeLabel="Close event details" onClose={() => uiStore.set({ selectedEventId: null })}>
          <EventCard
            event={selected}
            canSave
            signInHint={false}
            saved={savedIds.has(selected.id)}
            onSave={revealAddToMap}
            footer={<AddToMap key={selected.id} item={{ kind: 'event', event: selected }} />}
          />
        </InspectorPortal>
      )}
      {selectedPlace && !selected && (
        <InspectorPortal title="Selected place" openKey={`place:${selectedPlace.ref}`} closeLabel="Close place details" onClose={() => uiStore.set({ selectedPlace: null })}>
          <PlaceCard
            place={selectedPlace}
            saved={savedIds.has(selectedPlace.ref)}
            onSave={revealAddToMap}
            footer={<AddToMap key={selectedPlace.ref} item={{ kind: 'place', place: selectedPlace, address: placeDetails.data?.address ?? null }} />}
            onSelectChild={selectChild}
          />
        </InspectorPortal>
      )}

    </>
  );
}
