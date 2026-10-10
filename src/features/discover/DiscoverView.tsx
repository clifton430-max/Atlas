/**
 * Discover context (/). Public events only: the clustered event layer, the
 * selected event card, and an honest data-source banner whenever results are
 * not live (development samples or previously fetched data).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { uiStore, useUi } from '@/app/store';

import { qk } from '@/lib/queryClient';
import { eventProvider } from '@/services/events';
import { Notice, Spinner, ErrorMessage } from '@/components/ui/Feedback';
import { useSavedEvents } from '@/features/pins/api';
import { SaveEventDialog } from '@/features/pins/SaveEventDialog';
import { DiscoverLayer } from './DiscoverLayer';
import { EventCard } from './EventCard';
import { useDiscoverEvents } from './useDiscoverEvents';

export function DiscoverView() {

  const discover = useDiscoverEvents();
  const saved = useSavedEvents();
  const selectedId = useUi((s) => s.selectedEventId);
  const [saving, setSaving] = useState(false);

  const savedIds = useMemo(() => new Set(saved.data?.keys() ?? []), [saved.data]);
  const fromList = discover.all.find((e) => e.id === selectedId);
  // A search result may be outside the loaded viewport: fetch it directly.
  const single = useQuery({
    queryKey: qk.event(selectedId ?? ''),
    enabled: !!selectedId && !fromList,
    queryFn: () => eventProvider.getById(selectedId!),
  });
  const selected = fromList ?? single.data ?? null;

  const onSelect = useCallback((id: string) => uiStore.set({ selectedEventId: id }), []);

  // Leaving Discover clears its selection so it can't leak into other contexts.
  useEffect(() => () => uiStore.set({ selectedEventId: null }), []);

  return (
    <>
      <DiscoverLayer events={discover.filtered} savedIds={savedIds} selectedId={selectedId} onSelect={onSelect} />

      {/* Status stack sits at the bottom so it never collides with cards. */}
      <div data-tour="discover-status" className="pointer-events-none absolute bottom-10 left-1/2 z-10 flex w-[min(560px,calc(100%-32px))] -translate-x-1/2 flex-col-reverse items-center gap-2">
        {discover.notice && (
          <Notice tone="warning" className="pointer-events-auto shadow-panel">{discover.notice}</Notice>
        )}
        {discover.detail && !discover.notice && !discover.isFetching && (
          <div className="pointer-events-auto rounded-full bg-white/90 px-3 py-1 text-xs text-neutral-600 shadow-panel" role="status">
            {discover.detail}
          </div>
        )}
        {discover.isFetching && <div className="pointer-events-auto rounded-full bg-white px-3 py-1 shadow-panel"><Spinner label="Loading events" /></div>}
        {discover.error && <div className="pointer-events-auto"><ErrorMessage error={discover.error} className="shadow-panel" /></div>}
      </div>

      {selected && (
        <div className="absolute left-4 top-[68px] z-10">
          <EventCard
            event={selected}
            onClose={() => uiStore.set({ selectedEventId: null })}
            canSave
            signInHint={false}
            saved={savedIds.has(selected.id)}
            onSave={() => setSaving(true)}
          />
        </div>
      )}

      {saving && selected && (
        <SaveEventDialog event={selected} open onClose={() => setSaving(false)} />
      )}
    </>
  );
}
