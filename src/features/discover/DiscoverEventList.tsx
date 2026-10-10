/**
 * Keyboard/screen-reader accessible list of events in the current viewport
 * (mirrors the WebGL markers, which are not focusable). Events without
 * verified coordinates are listed but flagged as not mappable.
 */
import { CalendarClock } from 'lucide-react';
import { uiStore, useUi } from '@/app/store';
import { useMapInstance } from '@/features/map/MapContext';
import { formatEventStart, formatPriceRange } from '@/lib/format';
import { EmptyState, Spinner } from '@/components/ui/Feedback';
import { cn } from '@/components/ui/cn';
import { activeFilterCount } from './filters';
import { useDiscoverEvents } from './useDiscoverEvents';

export function DiscoverEventList() {
  const { map } = useMapInstance();
  const { filtered, all, isLoading } = useDiscoverEvents();
  const selectedId = useUi((s) => s.selectedEventId);
  const filters = useUi((s) => s.discoverFilters);
  const n = activeFilterCount(filters);

  return (
    <section aria-labelledby="in-view-heading" data-tour="events-in-view">
      <h2 id="in-view-heading" className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Events in view
      </h2>
      <p className="px-2 pb-2 text-xs text-neutral-500" aria-live="polite">
        {isLoading ? 'Loading…' : `${filtered.length} of ${all.length} shown${n ? ` · ${n} filter${n > 1 ? 's' : ''} active` : ''}`}
      </p>
      {isLoading ? <Spinner className="px-2" /> : filtered.length === 0 ? (
        <EmptyState icon={<CalendarClock className="size-6" aria-hidden />} title="No events here">
          {all.length ? 'Try loosening your filters.' : 'Pan or zoom the map, or search for a place.'}
        </EmptyState>
      ) : (
        <ul className="space-y-0.5">
          {filtered.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                aria-current={selectedId === e.id || undefined}
                onClick={() => {
                  uiStore.set({ selectedEventId: e.id });
                  if (e.latitude != null && e.longitude != null) map?.easeTo({ center: [e.longitude, e.latitude] });
                }}
                className={cn('w-full rounded-lg px-2 py-1.5 text-left hover:bg-neutral-100', selectedId === e.id && 'bg-neutral-100 ring-1 ring-neutral-300')}
              >
                <span className="block truncate text-sm font-medium text-neutral-800">{e.name}</span>
                <span className="block truncate text-xs text-neutral-500">
                  {formatEventStart(e)} · {formatPriceRange(e)}
                </span>
                {e.latitude == null && <span className="block text-[11px] text-amber-700">No verified location — not on map</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
