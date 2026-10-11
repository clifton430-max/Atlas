/**
 * Collaboration Map context (/collab/:mapId). Shows ONLY shared pin
 * representations of this collaboration map (membership-scoped by RLS);
 * private pins, groups and personal maps never appear here.
 */
import { Link } from 'react-router-dom';
import { isChessVenue, chessRoomPath } from '@/features/chess/venues';
import { useProfile } from '@/features/settings/profileApi';
import { MapMarker } from '@/features/map/MapMarker';
import { Avatar, AvatarStack } from '@/components/ui/Avatar';
import { MeetupsSection } from './MeetupsSection';
import { meetupShortLabel, meetupStatus, useMeetups, type Meetup } from './meetups';
import { useCollabRealtime } from './realtime';
import { Directions } from '@/features/routing/Directions';
import { usePinDeepLink } from '@/features/pins/usePinDeepLink';
import { SourceDetails } from '@/features/pins/SourceDetails';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MapMouseEvent } from 'maplibre-gl';
import { CalendarPlus, MapPinPlus, MousePointerClick, Pencil } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { TextArea, TextField } from '@/components/ui/Field';
import { useMapInstance } from '@/features/map/MapContext';
import { pinGlyph } from '@/features/pins/pinVisual';
import { MeetupForm } from './MeetupsSection';
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
  usePinDeepLink(shared.data, (id) => uiStore.set({ selectedSharedPinId: id }));
  const selectedId = useUi((s) => s.selectedSharedPinId);
  const current = maps.data?.find((m) => m.id === mapId);
  const selected = shared.data?.find((p) => p.id === selectedId) ?? null;
  const live = useCollabRealtime(mapId, !!current);
  const meetups = useMeetups(current ? mapId : undefined);
  // Next relevant meetup per pin (happening now first, then soonest upcoming).
  const nextByPin = useMemo(() => {
    const out = new Map<string, Meetup>();
    for (const m of meetups.data ?? []) {
      const st = meetupStatus(m);
      if (st !== 'live' && st !== 'upcoming') continue;
      const cur = out.get(m.sharedPinId);
      if (!cur || (meetupStatus(cur) !== 'live' && (st === 'live' || m.startsAt < cur.startsAt))) out.set(m.sharedPinId, m);
    }
    return out;
  }, [meetups.data]);

  useEffect(() => () => uiStore.set({ selectedSharedPinId: null }), [mapId]);

  // Editors/owners can drop a pin or plan a meetup at ANY point: choose a mode, then click the map.
  const { map } = useMapInstance();
  const canEdit = current?.myRole === 'owner' || current?.myRole === 'editor';
  const [placing, setPlacing] = useState<'pin' | 'meetup' | null>(null);
  const [newAt, setNewAt] = useState<{ mode: 'pin' | 'meetup'; latitude: number; longitude: number } | null>(null);
  const onMapClick = useCallback((e: MapMouseEvent) => {
    setPlacing((mode) => {
      if (mode) setNewAt({ mode, latitude: e.lngLat.lat, longitude: e.lngLat.lng });
      return null;
    });
  }, []);
  useEffect(() => {
    if (!map || !placing) return;
    map.on('click', onMapClick);
    map.getCanvas().style.cursor = 'crosshair';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPlacing(null);
    window.addEventListener('keydown', onKey);
    return () => { map.off('click', onMapClick); map.getCanvas().style.cursor = ''; window.removeEventListener('keydown', onKey); };
  }, [map, placing, onMapClick]);
  useEffect(() => { setPlacing(null); setNewAt(null); }, [mapId]);
  const profile = useProfile();
  const { user } = useAuth();
  const me = user ? { id: user.id, name: profile.data?.displayName || profile.data?.username || 'You' } : null;

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
          glyph={pinGlyph(p)}
          caption={p.title}
          hover={{ title: p.title, meta: p.sharedByName ? `Added by ${p.sharedByName}` : null, description: p.note ?? p.address }}
        />
      ))}
      {canEdit && !placing && !newAt && (
        <div className="absolute left-1/2 top-4 z-10 flex -translate-x-1/2 gap-2" data-testid="collab-add-bar">
          <Button size="sm" variant="secondary" className="shadow-panel" icon={<MapPinPlus className="size-4" aria-hidden />} onClick={() => setPlacing('pin')}>Add pin</Button>
          <Button size="sm" variant="secondary" className="shadow-panel" icon={<CalendarPlus className="size-4" aria-hidden />} onClick={() => setPlacing('meetup')}>Plan meetup here</Button>
        </div>
      )}
      {placing && (
        <div className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-neutral-900 px-4 py-2 text-sm text-white shadow-float" role="status">
          <MousePointerClick className="size-4" aria-hidden />
          {placing === 'pin' ? 'Click the map where the pin should go.' : 'Click the map where you’ll meet.'}
          <Button size="sm" variant="ghost" className="text-white hover:bg-white/10" onClick={() => setPlacing(null)}>Cancel (Esc)</Button>
        </div>
      )}
      {newAt && current && (
        <Dialog open onClose={() => setNewAt(null)} size="sm" title={newAt.mode === 'pin' ? 'New pin on this map' : 'Plan a meetup here'}>
          <p className="mb-2 text-xs text-neutral-500">At {newAt.latitude.toFixed(5)}, {newAt.longitude.toFixed(5)} · visible to every member of “{current.name}”.</p>
          {newAt.mode === 'pin'
            ? <SharedPinForm mapId={current.id} at={newAt} onDone={(id) => { setNewAt(null); if (id) uiStore.set({ selectedSharedPinId: id }); }} />
            : <MeetupForm mapId={current.id} at={newAt} me={me} onDone={() => setNewAt(null)} />}
        </Dialog>
      )}
      {shared.data?.map((p) => {
        const m = nextByPin.get(p.id);
        return m ? <MeetupBadge key={`m${m.id}`} pin={p} meetup={m} onSelect={() => uiStore.set({ selectedSharedPinId: p.id })} /> : null;
      })}
      {current && live !== 'off' && (
        <div className="pointer-events-none absolute left-4 top-4 z-10 flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-medium text-neutral-700 shadow-panel" role="status">
          <span className={live === 'live' ? 'size-2 rounded-full bg-emerald-500' : 'size-2 animate-pulse rounded-full bg-amber-400'} aria-hidden />
          {live === 'live' ? 'Live — changes appear instantly' : live === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}
        </div>
      )}
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
  const profile = useProfile();
  const me = user ? { id: user.id, name: profile.data?.displayName || profile.data?.username || 'You' } : null;
  const subtitle = useMemo(() => pin.address ?? `${pin.latitude.toFixed(4)}, ${pin.longitude.toFixed(4)}`, [pin]);
  const [editing, setEditing] = useState(false);

  return (
    <div className="flex flex-col">
      <article aria-label={`Shared pin: ${pin.title}`} className="w-full p-4 animate-rise-in">
        <header className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex gap-1.5"><Badge tone="accent">Shared</Badge>{pin.eventId && <Badge>Event</Badge>}</div>
            <h2 className="truncate text-[15px] font-semibold">{pin.title}</h2>
            <p className="truncate text-xs text-neutral-500">{subtitle}</p>
          </div>
          <IconButton label="Close shared pin" size="sm" onClick={onClose}><X className="size-4" aria-hidden /></IconButton>
        </header>
        <div className="mt-3 flex items-center gap-2 text-xs text-neutral-600" data-testid="pin-attribution">
          <Avatar userId={pin.sharedBy} name={pin.sharedByName ?? 'Former member'} size="sm" />
          <span>Added by <span className="font-medium text-neutral-900">{isMine ? 'you' : pin.sharedByName ?? 'a former member'}</span> · {new Date(pin.createdAt).toLocaleDateString()}</span>
        </div>
        {pin.attendance && (
          <p className="mt-1 text-xs font-medium text-neutral-700">{isMine ? 'You’re' : `${pin.sharedByName ?? 'This member'} is`} {pin.attendance === 'going' ? 'going' : 'interested'}</p>
        )}
        {editing
          ? <div className="mt-3"><SharedPinForm mapId={pin.collabMapId} existing={pin} onDone={() => setEditing(false)} /></div>
          : pin.note && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-neutral-50 p-2 text-sm text-neutral-700">{pin.note}</p>}
        {isChessVenue(pin.placeRef) && <Link to={chessRoomPath(pin.placeRef!)} className="mt-3 block rounded-xl bg-[#5b4632] px-3 py-2 text-center text-sm font-semibold text-white">Enter Chess Room</Link>}
        <div className="mt-3"><MeetupsSection pinId={pin.id} map={map} me={me} /></div>
        <div className="mt-3"><Directions latitude={pin.latitude} longitude={pin.longitude} name={pin.title} /></div>
        {pin.source && <div className="mt-3 rounded-xl bg-canvas p-3"><SourceDetails source={pin.source} at={pin} /></div>}
        {canRemove && (
          <div className="mt-3 flex justify-end gap-2">
            {!editing && <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" aria-hidden />} onClick={() => setEditing(true)}>Edit</Button>}
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

/** Compact meetup time label + attendee avatars floating above a shared pin. */
function MeetupBadge({ pin, meetup, onSelect }: { pin: SharedPin; meetup: Meetup; onSelect: () => void }) {
  const live = meetupStatus(meetup) === 'live';
  return (
    <MapMarker latitude={pin.latitude} longitude={pin.longitude} anchor="bottom" zIndex={5}>
      <button type="button" onClick={onSelect} data-testid="meetup-badge"
        aria-label={`Meetup at ${pin.title}: ${meetupShortLabel(meetup)}, ${meetup.count} going`}
        className={`mb-11 flex items-center gap-1.5 rounded-full py-0.5 pl-2 pr-1 text-[11px] font-semibold shadow-panel ring-1 motion-safe:animate-rise-in ${live ? 'bg-lime text-lime-ink ring-lime-strong' : 'bg-white text-neutral-800 ring-black/5'}`}>
        {meetupShortLabel(meetup)}
        {meetup.count > 0 ? <AvatarStack people={meetup.attendees} total={meetup.count} max={3} /> : <span className="pr-1 font-normal text-neutral-500">0 going</span>}
      </button>
    </MapMarker>
  );
}

/** Create (at a point) or edit a shared pin's title and description. */
function SharedPinForm({ mapId, at, existing, onDone }: {
  mapId: string; at?: { latitude: number; longitude: number }; existing?: SharedPin; onDone: (id?: string) => void;
}) {
  const toast = useToast();
  const { addCustomPin, updateSharedPin } = useCollabMutations();
  const [title, setTitle] = useState(existing?.title ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [touched, setTouched] = useState(false);
  const busy = addCustomPin.isPending || updateSharedPin.isPending;
  const submit = () => {
    setTouched(true);
    if (!title.trim() || busy) return;
    if (existing) {
      updateSharedPin.mutate({ id: existing.id, collabMapId: mapId, title: title.trim(), note: note.trim() ? note.trim() : null }, {
        onSuccess: () => { toast.success('Pin updated for everyone on this map.'); onDone(); }, onError: (e) => toast.error(e),
      });
    } else if (at) {
      addCustomPin.mutate({ collabMapId: mapId, title: title.trim(), note: note.trim() || null, ...at }, {
        onSuccess: (id) => { toast.success('Pin added. Members see it right away.'); onDone(id); }, onError: (e) => toast.error(e),
      });
    }
  };
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); submit(); }} aria-label={existing ? 'Edit shared pin' : 'New shared pin'}>
      <TextField label="Title" value={title} maxLength={300} autoFocus onChange={(e) => setTitle(e.target.value)} error={touched && !title.trim() ? 'Enter a title.' : null} />
      <TextArea label="Description (optional)" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => onDone()} disabled={busy}>Cancel</Button>
        <Button size="sm" variant="cta" type="submit" loading={busy}>{existing ? 'Save' : 'Add pin'}</Button>
      </div>
    </form>
  );
}
