/**
 * Details and actions for one of MY pins (personal map context only).
 * Shows the private note (owner-only data), group memberships, linked event,
 * where it is shared, and actions: edit, groups, customize, share, delete.
 */
import { lazy, Suspense, useState } from 'react';
import { Brush, Move, Pencil, Share2, Tags, Trash2, Users, X } from 'lucide-react';
import { uiStore } from '@/app/store';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { useMaps } from '@/features/maps/api';
import type { Group, Pin } from '@/lib/types';
import { Button, IconButton } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { SelectField, TextArea, TextField } from '@/components/ui/Field';
import { Badge, ErrorMessage } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { EventCard } from '@/features/discover/EventCard';
import { useCollabMutations, usePinShares } from '@/features/collaboration/api';
import { pinTitle, usePinMutations } from './api';
import { EditGroupsDialog } from './EditGroupsDialog';

// Heavy, infrequently opened dialogs are loaded on demand.
const PinAppearanceDialog = lazy(() => import('./PinAppearanceDialog').then((m) => ({ default: m.PinAppearanceDialog })));
const LocalShareDialog = lazy(() => import('@/features/collaboration/LocalShareDialog').then((m) => ({ default: m.LocalShareDialog })));
const SharePinDialog = lazy(() => import('@/features/collaboration/SharePinDialog').then((m) => ({ default: m.SharePinDialog })));

export function PinDetailsCard({ pin, groups, onClose }: { pin: Pin; groups: Group[]; onClose: () => void }) {
  const toast = useToast();
  const ws = useWorkspace();
  const { updateDetails, remove, setAttendance } = usePinMutations();
  const shares = usePinShares(pin.id);
  const { removeSharedPin } = useCollabMutations();
  const [dialog, setDialog] = useState<'groups' | 'appearance' | 'share' | 'delete' | 'event' | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(pin.title ?? '');
  const [note, setNote] = useState(pin.note ?? '');
  const [address, setAddress] = useState(pin.address ?? '');
  const [mapId, setMapId] = useState(pin.mapId);
  const maps = useMaps();

  const pinGroups = groups.filter((g) => pin.groupIds.includes(g.id));

  const saveDetails = async () => {
    try {
      await updateDetails.mutateAsync({
        pinId: pin.id,
        // Event pins may override the display title; empty -> use event name.
        title: pin.kind === 'custom' ? title.trim() || pin.title : title.trim() || null,
        note,
        address: pin.kind === 'custom' ? address : undefined,
        mapId: mapId !== pin.mapId ? mapId : undefined,
      });
      setEditing(false);
      if (mapId !== pin.mapId) {
        toast.success(`Moved to ${maps.data?.find((m) => m.id === mapId)?.name ?? 'another map'}.`);
        onClose();
      } else toast.success('Pin updated.');
    } catch {
      /* shown inline */
    }
  };

  return (
    <article data-tour="pin-card" aria-label={`Pin: ${pinTitle(pin)}`} className="w-full animate-rise-in">
      <header className="flex items-start gap-2 border-b border-neutral-100 p-4 pb-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex gap-1.5">
            <Badge>{pin.kind === 'event' ? 'Saved event' : 'Custom pin'}</Badge>
            <Badge>Private</Badge>
          </div>
          <h2 className="truncate text-[15px] font-semibold">{pinTitle(pin)}</h2>
          {(pin.address || pin.event?.venueName) && (
            <p className="truncate text-xs text-neutral-500">{pin.address ?? [pin.event?.venueName, pin.event?.city].filter(Boolean).join(', ')}</p>
          )}
        </div>
        <IconButton label="Close pin details" size="sm" onClick={onClose}><X className="size-4" aria-hidden /></IconButton>
      </header>

      <div className="max-h-[52vh] space-y-4 overflow-y-auto p-4">
        {pin.kind === 'event' && pin.latitude == null && (
          <ErrorMessage error="This event has no verified location, so it isn’t shown on the map." />
        )}

        {editing ? (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void saveDetails(); }}>
            <TextField
              label={pin.kind === 'event' ? 'Display title (optional)' : 'Title'}
              value={title}
              placeholder={pin.event?.name}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
            />
            {pin.kind === 'custom' && <TextField label="Address" value={address} maxLength={300} onChange={(e) => setAddress(e.target.value)} />}
            <TextArea label="Private note" value={note} maxLength={5000} onChange={(e) => setNote(e.target.value)} />
            {(maps.data?.length ?? 0) > 1 && (
              <SelectField label="Map" value={mapId} onChange={(e) => setMapId(e.target.value)} hint="Moving keeps the pin’s groups, appearance and shares.">
                {maps.data!.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </SelectField>
            )}
            <ErrorMessage error={updateDetails.error} />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              <Button size="sm" variant="primary" type="submit" loading={updateDetails.isPending}>Save</Button>
            </div>
          </form>
        ) : (
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Private note</h3>
            {pin.note ? <p className="whitespace-pre-wrap text-sm text-neutral-700">{pin.note}</p> : <p className="text-sm text-neutral-400">No note</p>}
          </section>
        )}

        {pin.kind === 'event' && (
          <section>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">Are you going?</h3>
            <div className="flex gap-1" role="radiogroup" aria-label="Attendance">
              {([[null, 'Not set'], ['interested', 'Interested'], ['going', 'Going']] as const).map(([v, label]) => (
                <button key={label} type="button" role="radio" aria-checked={pin.attendance === v} disabled={setAttendance.isPending}
                  onClick={() => setAttendance.mutate({ pinId: pin.id, attendance: v }, { onError: (e) => toast.error(e) })}
                  className={pin.attendance === v ? 'h-7 rounded-lg bg-neutral-900 px-2.5 text-xs font-medium text-white' : 'h-7 rounded-lg px-2.5 text-xs font-medium ring-1 ring-neutral-300 hover:bg-neutral-50'}>
                  {label}
                </button>
              ))}
            </div>
          </section>
        )}
        {pin.placeRef && (
          <p className="text-xs text-neutral-500">
            Saved from an OpenStreetMap place ·{' '}
            <a className="underline" target="_blank" rel="noopener noreferrer" href={`https://www.openstreetmap.org/${pin.placeRef.slice(4)}`}>view on OSM</a>
          </p>
        )}

        <section>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">Groups</h3>
          {pinGroups.length ? (
            <ul className="flex flex-wrap gap-1.5">
              {pinGroups.map((g) => (
                <li key={g.id} className="flex items-center gap-1.5 rounded-full bg-neutral-100 px-2 py-0.5 text-xs">
                  <span className="size-2 rounded-full" style={{ background: g.color }} aria-hidden />{g.name}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-neutral-400">Not in any group</p>}
        </section>

        <section>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">Shared to</h3>
          {shares.data?.length ? (
            <ul className="space-y-1">
              {shares.data.map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-sm">
                  <Users className="size-3.5 text-neutral-400" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{s.mapName}</span>
                  {s.includesNote && <Badge>note</Badge>}
                  <Button size="sm" variant="ghost" loading={removeSharedPin.isPending && removeSharedPin.variables?.id === s.id}
                    onClick={() => removeSharedPin.mutate({ id: s.id, collabMapId: s.collabMapId }, {
                      onSuccess: () => toast.success(`Removed from ${s.mapName}. Your pin is unchanged.`),
                      onError: (e) => toast.error(e),
                    })}>
                    Unshare
                  </Button>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-neutral-400">Not shared</p>}
        </section>
      </div>

      <footer className="flex flex-wrap gap-1.5 border-t border-neutral-100 p-3">
        {!editing && <Button size="sm" icon={<Pencil className="size-3.5" aria-hidden />} onClick={() => setEditing(true)} data-tour="pin-edit">Edit</Button>}
        {pin.kind === 'custom' && (
          <Button size="sm" icon={<Move className="size-3.5" aria-hidden />}
            data-tour="pin-move"
            onClick={() => uiStore.set({ movingPinId: pin.id, moveTarget: null, placingPin: false })}>
            Move
          </Button>
        )}
        <Button size="sm" icon={<Tags className="size-3.5" aria-hidden />} onClick={() => setDialog('groups')} data-tour="pin-groups">Groups</Button>
        <Button size="sm" icon={<Brush className="size-3.5" aria-hidden />} onClick={() => setDialog('appearance')} data-tour="pin-customize">Customize</Button>
        <Button size="sm" icon={<Share2 className="size-3.5" aria-hidden />} onClick={() => setDialog('share')} data-tour="pin-share">Share</Button>
        {pin.event && <Button size="sm" variant="ghost" onClick={() => setDialog('event')}>Event details</Button>}
        <IconButton label="Delete pin" data-tour="pin-delete" size="md" className="ml-auto text-danger hover:bg-danger-soft hover:text-danger" onClick={() => setDialog('delete')}>
          <Trash2 className="size-4" aria-hidden />
        </IconButton>
      </footer>

      {dialog === 'groups' && <EditGroupsDialog pin={pin} onClose={() => setDialog(null)} />}
      <Suspense fallback={null}>
        {dialog === 'appearance' && <PinAppearanceDialog pin={pin} groups={groups} onClose={() => setDialog(null)} />}
        {dialog === 'share' && (ws.local
          ? <LocalShareDialog pin={pin} onClose={() => setDialog(null)} />
          : <SharePinDialog pin={pin} onClose={() => setDialog(null)} />)}
      </Suspense>
      {dialog === 'event' && pin.event && (
        <div className="absolute left-[372px] top-0">
          <EventCard event={pin.event} canSave={false} onClose={() => setDialog(null)} />
        </div>
      )}
      <ConfirmDialog
        open={dialog === 'delete'}
        title="Delete pin?"
        danger
        busy={remove.isPending}
        confirmLabel="Delete pin"
        message={
          <>
            <p>“{pinTitle(pin)}” will be removed from this map{pin.kind === 'event' ? '. The public event itself is not affected' : ''}.</p>
            {!!shares.data?.length && <p className="mt-2">Shared copies in collaboration maps will remain until you unshare them.</p>}
          </>
        }
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          try {
            await remove.mutateAsync(pin);
            toast.success('Pin deleted.');
            setDialog(null);
            onClose();
          } catch (e) {
            toast.error(e);
          }
        }}
      />
    </article>
  );
}
