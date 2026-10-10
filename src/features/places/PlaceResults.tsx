/**
 * Structured results for visible place categories, grouped by category, read
 * from the same tile features as the markers (always in sync). Distinguishes
 * "not supported by this map style", "zoom in", and "no results".
 */
import { Fragment } from 'react';
import { uiStore, useUi } from '@/app/store';
import { useMapInstance } from '@/features/map/MapContext';
import { EmptyState } from '@/components/ui/Feedback';
import { cn } from '@/components/ui/cn';
import { PLACE_CATEGORIES, placeVisual, subclassesFor } from './categories';
import { CategoryDot } from './CategoryIcon';
import { distanceLabel } from './geo';
import { usePlacesInView } from './usePlacesInView';
import { sortPlaces } from '@/features/discover/sort';
import { useUserLocation } from './userLocation';

export function PlaceResults() {
  const { map } = useMapInstance();
  const visible = useUi((s) => s.discoverCategories);
  const subs = useUi((s) => s.discoverSubcategories);
  const selected = useUi((s) => s.selectedPlace);
  const { location } = useUserLocation();
  const sort = useUi((s) => s.discoverSort);
  const placeCats = PLACE_CATEGORIES.filter((c) => visible.includes(c.id));
  const { places, supported, tooFarOut, truncated } = usePlacesInView(subclassesFor(visible, subs));
  if (placeCats.length === 0) return null;

  return (
    <section aria-labelledby="places-heading" data-tour="places-in-view">
      <div className="flex items-baseline justify-between">
        <h2 id="places-heading" className="text-[15px] font-semibold">Places in view</h2>
        {supported && !tooFarOut && <span className="text-[13px] font-semibold text-accent" aria-hidden>{places.length}{truncated ? '+' : ''}</span>}
      </div>
      <p className="pb-2 text-xs text-neutral-500" aria-live="polite">
        {!supported ? 'Places aren’t available with this map style.'
          : tooFarOut ? 'Zoom in to see places.'
            : `${places.length}${truncated ? '+' : ''} places · ${placeCats.map((c) => c.label).join(', ')}`}
      </p>
      {supported && !tooFarOut && places.length === 0 && (
        <EmptyState title="No places here">None of the selected categories are mapped in this area.</EmptyState>
      )}
      {placeCats.map((c) => {
        const items = sortPlaces(places.filter((p) => p.categoryId === c.id), sort, location);
        if (!items.length) return null;
        return (
          <Fragment key={c.id}>
            <h3 className="mt-3 flex items-center gap-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              <CategoryDot color={c.color} icon={c.icon} />{c.label} <span className="font-normal text-neutral-400">({items.length})</span>
            </h3>
            <ul className="space-y-0.5">
              {items.map((p) => {
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
                        uiStore.set({ selectedPlace: p, selectedEventId: null });
                        map?.easeTo({ center: [p.longitude, p.latitude], zoom: Math.max(map.getZoom(), 15) });
                      }}
                      className={cn('flex w-full items-center gap-3 rounded-xl p-1.5 text-left hover:bg-neutral-50', selected?.ref === p.ref && 'bg-accent-soft/60 ring-1 ring-accent/40')}>
                      <span className="grid size-11 shrink-0 place-items-center rounded-xl" style={{ background: `${c.color}1a` }}>
                        <CategoryDot color={c.color} icon={placeVisual(p.subclass)?.icon ?? c.icon} size="md" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span data-testid="result-name" className="block truncate text-[13px] font-semibold text-neutral-900">{p.name}</span>
                        <span className="block truncate text-xs text-neutral-500">{p.subcategoryLabel} · {c.label}</span>
                        {dist && <span data-testid="result-distance" className="mt-1 inline-block rounded-full bg-lime-soft px-2 py-px text-[11px] font-medium text-lime-ink ring-1 ring-lime-strong/50">{dist}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Fragment>
        );
      })}
      {truncated && <p className="pt-1 text-[11px] text-neutral-500">Showing the most prominent places — zoom in for more.</p>}
      <p className="pt-2 text-[10px] text-neutral-400">Places © OpenStreetMap contributors</p>
    </section>
  );
}
