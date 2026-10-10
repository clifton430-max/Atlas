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

const round = (n: number) => Math.round(n * 1000) / 1000;

export function useDiscoverEvents() {
  const bbox = useUi((s) => s.bbox);
  const keyword = useUi((s) => s.discoverKeyword);
  const filters = useUi((s) => s.discoverFilters);

  const key = bbox && {
    w: round(bbox.west), s: round(bbox.south), e: round(bbox.east), n: round(bbox.north),
    keyword: keyword.trim(), from: filters.dateFrom, to: filters.dateTo,
  };

  const query = useQuery({
    queryKey: qk.discover(key),
    enabled: !!bbox,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    queryFn: ({ signal }) => eventProvider.search({
      bbox: bbox!, keyword: keyword.trim() || undefined, startDate: filters.dateFrom, endDate: filters.dateTo,
    }, signal),
  });

  const all = useMemo(() => query.data?.events ?? [], [query.data]);
  const filtered = useMemo(() => applyDiscoverFilters(all, filters), [all, filters]);

  return {
    ...query,
    all,
    filtered,
    source: query.data?.source,
    notice: query.data?.notice,
  };
}
