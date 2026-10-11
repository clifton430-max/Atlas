/**
 * Keyboard/screen-reader accessible list of events in the current viewport
 * (mirrors the WebGL markers, which are not focusable). Events without
 * verified coordinates are listed but flagged as not mappable.
 */
import { useMemo, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { uiStore, useUi } from '@/app/store';
import { useMapInstance } from '@/features/map/MapContext';
import { formatEventStart, formatPriceRange } from '@/lib/format';
import { safeExternalUrl } from '@/lib/validation';
import type { AtlasEvent } from '@/lib/types';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { cn } from '@/components/ui/cn';
import { activeFilterCount } from './filters';
import { eventVisual } from '@/features/places/categories';
import { CategoryDot } from '@/features/places/CategoryIcon';
import { distanceLabel } from '@/features/places/geo';
import { useUserLocation } from '@/features/places/userLocation';
import { useDiscoverEvents } from './useDiscoverEvents';
import { sortEvents, useSortOrigin } from './sort';

export function DiscoverEventList() {
  const { map } = useMapInstance();
  const { filtered, all, isLoading, eventsVisible } = useDiscoverEvents();
  const { location } = useUserLocation();
  const selectedId = useUi((s) => s.selectedEventId);
  const filters = useUi((s) => s.discoverFilters);
  const sort = useUi((s) => s.discoverSort);
  const n = activeFilterCount(filters);
  const { origin, from } = useSortOrigin();
  const items = useMemo(() => sortEvents(filtered, sort, origin), [filtered, sort, origin]);

  if (!eventsVisible) return null;
  return (
    <section aria-labelledby="in-view-heading" data-tour="events-in-view">
      <div className="flex items-baseline justify-between">
        <h2 id="in-view-heading" className="text-[15px] font-semibold">{location ? 'Events near you' : 'Events in view'}</h2>
        {!isLoading && <span className="text-[13px] font-semibold text-accent" aria-hidden>{filtered.length}</span>}
      </div>
      <p className="pb-2 text-xs text-neutral-500" aria-live="polite">
        {isLoading ? 'Loading…' : `${filtered.length} of ${all.length} shown${n ? ` · ${n} filter${n > 1 ? 's' : ''} active` : ''}`}
        {sort === 'nearest' && from && <span className="block">{from === 'you' ? 'Closest to you first.' : 'Closest to the map centre first — use “Distance” to sort from where you are.'}</span>}
      </p>
      {isLoading ? <Spinner /> : filtered.length === 0 ? (
        <EmptyState icon={<CalendarClock className="size-6" aria-hidden />} title="No events here">
          {all.length ? 'Try loosening your filters.' : 'Pan or zoom the map, or search for a place.'}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((e) => <EventRow key={e.id} e={e} selected={selectedId === e.id} dist={distanceLabel(location, e)} onOpen={() => {
            uiStore.set({ selectedEventId: e.id, selectedPlace: null });
            if (e.latitude != null && e.longitude != null) map?.easeTo({ center: [e.longitude, e.latitude] });
          }} />)}
        </ul>
      )}
    </section>
  );
}

function EventRow({ e, selected, dist, onOpen }: { e: AtlasEvent; selected: boolean; dist: string | null; onOpen: () => void }) {
  const [imgOk, setImgOk] = useState(true);
  const visual = eventVisual(e.category);
  const color = e.isDevFixture ? '#a3a3a3' : visual.color;
  const thumb = imgOk ? safeExternalUrl(e.imageUrl) : null;
  return (
    <li className="py-1">
      <button
        type="button"
        aria-current={selected || undefined}
        // Hover and keyboard focus show the same preview as hovering the map marker.
        onMouseEnter={() => uiStore.set({ hoverItem: { kind: 'event', id: e.id } })}
        onMouseLeave={() => uiStore.set({ hoverItem: null })}
        onFocus={() => uiStore.set({ hoverItem: { kind: 'event', id: e.id } })}
        onBlur={() => uiStore.set({ hoverItem: null })}
        onClick={onOpen}
        className={cn('flex w-full gap-3 rounded-xl p-1.5 text-left hover:bg-neutral-50', selected && 'bg-accent-soft/60 ring-1 ring-accent/40')}
      >
        {thumb
          ? <img src={thumb} alt="" onError={() => setImgOk(false)} className="size-16 shrink-0 rounded-xl object-cover" />
          : <span className="grid size-16 shrink-0 place-items-center rounded-xl" style={{ background: `${color}1a` }}><CategoryDot color={color} icon={visual.icon} size="md" /></span>}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <CategoryDot color={color} icon={visual.icon} />
            <span data-testid="result-name" className="block min-w-0 truncate text-[13px] font-semibold text-neutral-900">{e.name}</span>
          </span>
          <span className="block truncate text-xs text-neutral-500">{[e.venueName, e.isDevFixture ? 'Sample' : visual.label].filter(Boolean).join(' · ')}</span>
          <span className="block truncate text-xs text-neutral-500">{formatEventStart(e)} · {formatPriceRange(e)}</span>
          <span className="mt-1 flex flex-wrap gap-1">
            {dist && <span data-testid="result-distance" className="rounded-full bg-lime-soft px-2 py-px text-[11px] font-medium text-lime-ink ring-1 ring-lime-strong/50">{dist}</span>}
            {e.latitude == null && <span className="rounded-full bg-amber-50 px-2 py-px text-[11px] text-amber-800">No verified location — not on map</span>}
          </span>
        </span>
      </button>
    </li>
  );
}
