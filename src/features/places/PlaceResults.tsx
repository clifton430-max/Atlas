/**
 * "Things near me": the places in view for the visible categories, read from
 * the same tile features as the map icons (so list and map always agree,
 * including category filters and the search keyword).
 *
 * One list, ordered by the chosen sort — "Nearest" (default) is a true
 * closest-to-farthest order across ALL categories (not per category). With a
 * shared location it measures from you and each row says e.g. "0.4 mi away";
 * without one it orders from the map centre and shows no distance (a
 * distance from the map centre would be misleading). Distinguishes "not
 * supported by this map style", "zoom in", and "no results".
 */
import { useMemo } from 'react';
import { uiStore, useUi } from '@/app/store';
import { useMapInstance } from '@/features/map/MapContext';
import { EmptyState } from '@/components/ui/Feedback';
import { cn } from '@/components/ui/cn';
import { CATEGORY_BY_ID, PLACE_CATEGORIES, placeVisual, subclassesFor } from './categories';
import { CategoryDot } from './CategoryIcon';
import { distanceLabel } from './geo';
import { usePlacesInView } from './usePlacesInView';
import { sortPlaces, useSortOrigin } from '@/features/discover/sort';
import { requestUserLocation, useUserLocation } from './userLocation';

const SHOWN = 120;

export function PlaceResults({ savedRefs }: { savedRefs?: Set<string> }) {
  const { map } = useMapInstance();
  const visible = useUi((s) => s.discoverCategories);
  const subs = useUi((s) => s.discoverSubcategories);
  const selected = useUi((s) => s.selectedPlace);
  const { location, status } = useUserLocation();
  const sort = useUi((s) => s.discoverSort);
  const { origin, from } = useSortOrigin();
  const placeCats = PLACE_CATEGORIES.filter((c) => visible.includes(c.id));
  const { places, supported, tooFarOut, truncated } = usePlacesInView(subclassesFor(visible, subs), sort === 'nearest' ? origin : null);
  const items = useMemo(() => sortPlaces(places, sort, origin), [places, sort, origin]);
  if (placeCats.length === 0) return null;

  return (
    <section aria-labelledby="places-heading" data-tour="places-in-view">
      <div className="flex items-baseline justify-between">
        <h2 id="places-heading" className="text-[15px] font-semibold">Things near {from === 'you' ? 'me' : 'here'}</h2>
        {supported && !tooFarOut && <span className="text-[13px] font-semibold text-accent" aria-hidden>{places.length}{truncated ? '+' : ''}</span>}
      </div>
      <p className="pb-2 text-xs text-neutral-500" aria-live="polite">
        {!supported ? 'Places aren’t available with this map style.'
          : tooFarOut ? 'Zoom in to see places.'
            : `${places.length}${truncated ? '+' : ''} places · ${sort === 'nearest' ? (from === 'you' ? 'closest to you first' : 'closest to the map centre first') : sort === 'name' ? 'A–Z' : 'most prominent first'}`}
      </p>
      {!location && supported && !tooFarOut && places.length > 0 && (
        <p className="mb-2 rounded-lg bg-canvas px-2.5 py-1.5 text-[11px] text-neutral-600">
          {status === 'denied' ? 'Location is blocked in your browser, so distances aren’t shown.' : <>
            <button type="button" className="font-medium text-brand underline" onClick={() => void requestUserLocation()}>Use my location</button> to see how far away each place is.
          </>}
        </p>
      )}
      {supported && !tooFarOut && places.length === 0 && (
        <EmptyState title="No places here">None of the selected categories are mapped in this area.</EmptyState>
      )}
      <ul className="space-y-0.5" data-testid="near-me-list">
        {items.slice(0, SHOWN).map((p) => {
          const c = CATEGORY_BY_ID[p.categoryId];
          const dist = distanceLabel(location, p);
          return (
            <li key={p.ref}>
              <button type="button"
                aria-current={selected?.ref === p.ref || undefined}
                onMouseEnter={() => uiStore.set({ hoverItem: { kind: 'place', place: p } })}
                onMouseLeave={() => uiStore.set({ hoverItem: null })}
                onFocus={() => uiStore.set({ hoverItem: { kind: 'place', place: p } })}
                onBlur={() => uiStore.set({ hoverItem: null })}
                onClick={() => {
                  uiStore.set({ selectedPlace: p, selectedEventId: null, selectedPinId: null, hoverItem: null });
                  map?.easeTo({ center: [p.longitude, p.latitude], zoom: Math.max(map.getZoom(), 16) });
                }}
                className={cn('flex w-full items-center gap-3 rounded-xl p-1.5 text-left hover:bg-neutral-50', selected?.ref === p.ref && 'bg-accent-soft/60 ring-1 ring-accent/40')}>
                <span className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ background: `${c.color}1a` }}>
                  <CategoryDot color={c.color} icon={placeVisual(p.subclass)?.icon ?? c.icon} size="md" />
                </span>
                <span className="min-w-0 flex-1">
                  <span data-testid="result-name" className="block truncate text-[13px] font-semibold text-neutral-900">{p.name}</span>
                  <span className="block truncate text-xs text-neutral-500">{p.subcategoryLabel} · {c.label}{savedRefs?.has(p.ref) ? ' · Saved' : ''}</span>
                </span>
                {dist && <span data-testid="result-distance" className="shrink-0 rounded-full bg-lime-soft px-2 py-px text-[11px] font-medium text-lime-ink ring-1 ring-lime-strong/50">{dist}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {(truncated || items.length > SHOWN) && <p className="pt-1 text-[11px] text-neutral-500">Showing {Math.min(SHOWN, items.length)} places — zoom in for more.</p>}
      <p className="pt-2 text-[10px] text-neutral-400">Places © OpenStreetMap contributors</p>
    </section>
  );
}
