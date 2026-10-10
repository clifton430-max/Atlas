/**
 * Collaboration Map context (/collab/:mapId). Shows ONLY shared pin
 * representations of this collaboration map (membership-scoped by RLS);
 * private pins, groups and personal maps never appear here.
 */
import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { uiStore, useUi } from '@/app/store';
import { useAuth } from '@/app/AuthProvider';
import { qk } from '@/lib/queryClient';
import type { CollabMap, SharedPin } from '@/lib/types';
import { eventProvider } from '@/services/events';
import { PinMarker } from '@/features/pins/PinMarker';
import { EventCard } from '@/features/discover/EventCard';
import { Badge, ErrorMessage, Spinner } from '@/components/ui/Feedback';
import { Button, IconButton } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useCollabMaps, useCollabMutations, useSharedPins } from './api';
import { InspectorPortal } from '@/app/Inspector';

export function CollabMapView() {
  const { mapId = '' } = useParams();
  const maps = useCollabMaps();
  const shared = useSharedPins(mapId);
  const selectedId = useUi((s) => s.selectedSharedPinId);
  const current = maps.data?.find((m) => m.id === mapId);
  const selected = shared.data?.find((p) => p.id === selectedId) ?? null;

  useEffect(() => () => uiStore.set({ selectedSharedPinId: null }), [mapId]);

  if (maps.isSuccess && !current) {
    return (
      <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2">
        <ErrorMessage error="This collaboration map doesn’t exist or you’re no longer a member." className="shadow-panel" />
      </div>
    );
  }

  return (
    <>
      {shared.data?.map((p) => (
        <PinMarker
          key={p.id}
          latitude={p.latitude}
          longitude={p.longitude}
          label={`${p.title}${p.sharedByName ? `, shared by ${p.sharedByName}` : ''}`}
          appearance={p.appearance}
          image={p.image}
          fallbackIcon={p.eventId ? 'ticket' : 'map-pin'}
          selected={p.id === selectedId}
          onSelect={() => uiStore.set({ selectedSharedPinId: p.id })}
        />
      ))}
      {(shared.isLoading || maps.isLoading) && (
        <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-xl bg-white px-4 py-2 shadow-panel"><Spinner label="Loading shared pins" /></div>
      )}
      {shared.error && <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2"><ErrorMessage error={shared.error} /></div>}
      {selected && current && (
        <InspectorPortal title="Shared pin" openKey={`shared:${selected.id}`}>
          <SharedPinCard key={selected.id} pin={selected} map={current} onClose={() => uiStore.set({ selectedSharedPinId: null })} />
        </InspectorPortal>
      )}
    </>
  );
}

function SharedPinCard({ pin, map, onClose }: { pin: SharedPin; map: CollabMap; onClose: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const { removeSharedPin } = useCollabMutations();
  const event = useQuery({
    queryKey: qk.event(pin.eventId ?? ''),
    enabled: !!pin.eventId,
    queryFn: () => eventProvider.getById(pin.eventId!),
  });
  // Server rule mirrored for display only: sharer or owner may remove.
  const canRemove = pin.sharedBy === user?.id || map.myRole === 'owner';
  const isMine = pin.sharedBy === user?.id;
  const subtitle = useMemo(() => pin.address ?? `${pin.latitude.toFixed(4)}, ${pin.longitude.toFixed(4)}`, [pin]);

  return (
    <div className="flex items-start gap-3">
      <article aria-label={`Shared pin: ${pin.title}`} className="w-full p-4 animate-rise-in">
        <header className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex gap-1.5"><Badge tone="accent">Shared</Badge>{pin.eventId && <Badge>Event</Badge>}</div>
            <h2 className="truncate text-[15px] font-semibold">{pin.title}</h2>
            <p className="truncate text-xs text-neutral-500">{subtitle}</p>
          </div>
          <IconButton label="Close shared pin" size="sm" onClick={onClose}><X className="size-4" aria-hidden /></IconButton>
        </header>
        <p className="mt-3 text-xs text-neutral-500">Shared by {isMine ? 'you' : pin.sharedByName ?? 'a former member'} · {new Date(pin.createdAt).toLocaleDateString()}</p>
        {pin.attendance && (
          <p className="mt-1 text-xs font-medium text-neutral-700">{isMine ? 'You’re' : `${pin.sharedByName ?? 'This member'} is`} {pin.attendance === 'going' ? 'going' : 'interested'}</p>
        )}
        {pin.note && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-neutral-50 p-2 text-sm text-neutral-700">{pin.note}</p>}
        {canRemove && (
          <div className="mt-3 flex justify-end">
            <Button size="sm" variant="secondary" loading={removeSharedPin.isPending}
              onClick={() => removeSharedPin.mutate({ id: pin.id, collabMapId: pin.collabMapId }, {
                onSuccess: () => { toast.success('Removed from this map. The original pin is unaffected.'); onClose(); },
                onError: (e) => toast.error(e),
              })}>
              Remove from map
            </Button>
          </div>
        )}
      </article>
      {event.data && <EventCard event={event.data} canSave={false} />}
    </div>
  );
}
