/**
 * Discover data hook. Queries the event provider by the visible map bounds
 * (debounced in MapCanvas) plus keyword/date filters, then applies the
 * client-side category/price/time filters. Discover only ever touches the
 * public events table — never private pins, maps or groups.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useUi } from '@/app/store';
import { qk } from '@/lib/queryClient';
import { eventProvider } from '@/services/events';
import { applyDiscoverFilters } from './filters';
import { eventSubcategory } from '@/features/places/categories';

const round = (n: number) => Math.round(n * 1000) / 1000;

export function useDiscoverEvents() {
  const bbox = useUi((s) => s.bbox);
  const keyword = useUi((s) => s.discoverKeyword);
  const filters = useUi((s) => s.discoverFilters);
  // Hidden "Events" category: no provider request at all (Hide All must not cost requests).
  const eventsVisible = useUi((s) => s.discoverCategories.includes('events'));
  const eventTypes = useUi((s) => s.discoverSubcategories.events);

  const key = bbox && {
    w: round(bbox.west), s: round(bbox.south), e: round(bbox.east), n: round(bbox.north),
    keyword: keyword.trim(), from: filters.dateFrom, to: filters.dateTo,
  };

  const query = useQuery({
    queryKey: qk.discover(key),
    enabled: !!bbox && eventsVisible,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    queryFn: ({ signal }) => eventProvider.search({
      bbox: bbox!, keyword: keyword.trim() || undefined, startDate: filters.dateFrom, endDate: filters.dateTo,
    }, signal),
  });

  const all = useMemo(() => (eventsVisible ? query.data?.events ?? [] : []), [query.data, eventsVisible]);
  const filtered = useMemo(() => {
    const base = applyDiscoverFilters(all, filters);
    // Event-type picks: events whose Ticketmaster segment is unknown are excluded while a pick is active.
    if (!eventTypes?.length) return base;
    return base.filter((e) => {
      const sub = eventSubcategory(e.category);
      return !!sub && eventTypes.includes(sub.id);
    });
  }, [all, filters, eventTypes]);

  return {
    ...query,
    eventsVisible,
    all,
    filtered,
    source: query.data?.source,
    notice: query.data?.notice,
    detail: query.data?.detail,
  };
}
