/**
 * "Add to map" — inline in the inspector for a selected event or place.
 *
 *   [ Personal Map | Collaboration Map ]
 *   Select map ▾
 *   Personal: Select group(s) (required; create new groups inline)
 *   Events:   attendance (optional)
 *   Collab:   exactly what members will see
 *   [ Add to map ]   + inline success/failure feedback
 *
 * Rules (unchanged from the dialog this replaces, and enforced server-side):
 *   - Personal maps need at least one group; saving again updates the pin
 *     instead of duplicating it.
 *   - Collaboration maps: owner/editor maps only — viewer maps are never
 *     offered — and add_to_collab re-checks the role. Guests and the tutorial
 *     sandbox have no real collaboration maps; the toggle explains why.
 * Nothing is written until the button is pressed; success is reported only
 * after it persists.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { CheckCircle2, Lock, MapPin, Users } from 'lucide-react';
import type { AtlasEvent, Attendance } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { ErrorMessage, Spinner } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/components/ui/cn';
import { useMaps } from '@/features/maps/api';
import { useActiveMapId } from '@/features/maps/activeMap';
import { useGroups } from '@/features/groups/api';
import { emptySelection, GroupPicker, selectionCount, type GroupSelection } from '@/features/groups/GroupPicker';
import { commitGroupSelection } from '@/features/groups/commitSelection';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { useCollabMaps, useCollabMutations } from '@/features/collaboration/api';
import type { Place } from '@/features/places/types';
import { usePinMutations, useSavedEvents } from './api';

export type SaveItem = { kind: 'event'; event: AtlasEvent } | { kind: 'place'; place: Place; address: string | null };
type Target = 'personal' | 'collab';

const ATTENDANCE: { value: Attendance | null; label: string }[] = [
  { value: null, label: 'Not set' },
  { value: 'interested', label: 'Interested' },
  { value: 'going', label: 'Going' },
];

export const ADD_TO_MAP_ID = 'add-to-map';

/** Bring the inline form into view (used by the bookmark buttons). */
export function revealAddToMap() {
  const el = document.getElementById(ADD_TO_MAP_ID);
  if (!el) return;
  el.scrollIntoView({ block: 'start', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  (el.querySelector<HTMLElement>('select') ?? el.querySelector<HTMLElement>('button'))?.focus({ preventScroll: true });
}

export function AddToMap({ item }: { item: SaveItem }) {
  const qc = useQueryClient();
  const ws = useWorkspace();
  const toast = useToast();
  const loc = useLocation();
  const maps = useMaps();
  const groups = useGroups();
  const saved = useSavedEvents();
  const collab = useCollabMaps();
  const activeMapId = useActiveMapId(ws.scope);
  const { saveEvent, savePlace } = usePinMutations();
  const { addToCollab } = useCollabMutations();

  const isEvent = item.kind === 'event';
  const itemKey = isEvent ? item.event.id : item.place.ref;
  const itemName = isEvent ? item.event.name : item.place.name;
  const noun = isEvent ? 'event' : 'place';
  // Only maps the user may edit: never viewer collaboration maps; none for local workspaces.
  const editableCollab = useMemo(
    () => (ws.isLocal ? [] : (collab.data ?? []).filter((m) => m.myRole === 'owner' || m.myRole === 'editor')),
    [collab.data, ws.isLocal],
  );

  const [target, setTarget] = useState<Target>('personal');
  const [mapId, setMapId] = useState('');
  const [collabId, setCollabId] = useState('');
  const [selection, setSelection] = useState<GroupSelection>(emptySelection());
  const [attendance, setAttendance] = useState<Attendance | null>(null);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState<string | null>(null);

  // Default destination: the map you're working in (map switcher), else the first one.
  useEffect(() => {
    if (mapId && maps.data?.some((m) => m.id === mapId)) return;
    const pick = maps.data?.find((m) => m.id === activeMapId) ?? maps.data?.[0];
    if (pick) setMapId(pick.id);
  }, [maps.data, activeMapId, mapId]);
  useEffect(() => {
    if (!collabId && editableCollab.length) setCollabId(editableCollab[0].id);
  }, [editableCollab, collabId]);

  const isCollab = target === 'collab';
  const destId = isCollab ? collabId : mapId;
  const existing = useMemo(
    () => (isCollab ? null : saved.data?.get(itemKey)?.find((p) => p.mapId === mapId) ?? null),
    [saved.data, itemKey, mapId, isCollab],
  );

  // Pre-fill current groups/attendance when it's already on the chosen map; reset feedback on change.
  useEffect(() => {
    setSelection(emptySelection(existing?.groupIds ?? []));
    setAttendance(existing?.attendance ?? null);
    setTouched(false);
    setError(null);
  }, [existing, destId, target]);
  useEffect(() => setDone(null), [itemKey, destId, target]);

  const count = selectionCount(selection);
  const groupError = !isCollab && touched && count === 0 ? 'Choose at least one group.' : null;
  const destName = isCollab ? editableCollab.find((m) => m.id === collabId)?.name : maps.data?.find((m) => m.id === mapId)?.name;

  const confirm = async () => {
    setTouched(true);
    if (!destId || busy) return;
    if (!isCollab && count === 0) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      if (isCollab) {
        await addToCollab.mutateAsync(isEvent
          ? { collabMapId: destId, eventId: item.event.id, attendance }
          : { collabMapId: destId, place: { ...item.place, address: item.address } });
      } else {
        const groupIds = await commitGroupSelection(selection, qc, ws);
        if (isEvent) await saveEvent.mutateAsync({ mapId: destId, eventId: item.event.id, groupIds, event: item.event, attendance });
        else await savePlace.mutateAsync({ mapId: destId, place: item.place, address: item.address, groupIds });
      }
      const msg = existing ? `Updated on ${destName ?? 'your map'}.` : `Added to ${destName ?? 'your map'}.`;
      setDone(msg);
      toast.success(msg);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const loading = maps.isLoading || groups.isLoading;
  const collabUnavailable = ws.isLocal
    ? (ws.mode === 'sandbox' ? 'Practice data stays in the tour sandbox.' : 'Collaboration maps need an account.')
    : collab.isLoading ? 'Loading your collaboration maps…'
      : editableCollab.length === 0 ? 'You aren’t an owner or editor of any collaboration map.' : null;

  return (
    <section id={ADD_TO_MAP_ID} aria-labelledby="add-to-map-heading" data-tour={isEvent ? 'save-to-map' : 'save-place'}
      className="scroll-mt-4 space-y-3 border-t border-line pt-4">
      <h4 id="add-to-map-heading" className="text-[15px] font-semibold">Add to map</h4>
      {loading ? <Spinner /> : maps.error || groups.error ? <ErrorMessage error={maps.error ?? groups.error} /> : (
        <>
          <div role="radiogroup" aria-label="Map type" className="grid grid-cols-2 rounded-xl bg-canvas p-1 ring-1 ring-line">
            {([['personal', 'Personal Map', <MapPin key="i" className="size-3.5" aria-hidden />], ['collab', 'Collaboration Map', <Users key="i" className="size-3.5" aria-hidden />]] as const).map(([t, label, icon]) => (
              <button key={t} type="button" role="radio" aria-checked={target === t} onClick={() => setTarget(t)}
                className={cn('flex h-8 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors',
                  target === t ? 'bg-white text-brand shadow-chip ring-1 ring-brand/40' : 'text-neutral-600 hover:text-neutral-900')}>
                {icon}{label}
              </button>
            ))}
          </div>

          {isCollab && collabUnavailable ? (
            <p className="flex items-start gap-2 rounded-xl bg-canvas p-3 text-xs text-neutral-600" role="status">
              <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                {collabUnavailable}
                {ws.mode === 'guest' && <> <Link to={`/auth?next=${encodeURIComponent(loc.pathname)}`} className="underline">Sign in</Link> to add things to shared maps.</>}
              </span>
            </p>
          ) : (
            <>
              <label className="block text-[13px] font-medium text-neutral-700">
                Select map
                <select value={destId} onChange={(e) => (isCollab ? setCollabId(e.target.value) : setMapId(e.target.value))}
                  className="mt-1 h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-neutral-900">
                  {isCollab
                    ? editableCollab.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.myRole})</option>)
                    : maps.data?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </label>
              {!isCollab && maps.data?.length === 0 && <p className="text-xs text-neutral-600">You don’t have a map yet — create one under My Maps.</p>}
              {!isCollab && ws.isLocal && <p className="text-xs text-neutral-500">Saved only in this browser on this device.</p>}
              {existing && <p className="text-xs text-neutral-500">This {noun} is already on this map. Saving updates it; it won’t create a duplicate.</p>}

              {isEvent && (
                <fieldset>
                  <legend className="mb-1.5 text-[13px] font-medium text-neutral-700">Are you going? <span className="font-normal text-neutral-500">(optional)</span></legend>
                  <div className="flex gap-1" role="radiogroup" aria-label="Attendance">
                    {ATTENDANCE.map((a) => (
                      <button key={a.label} type="button" role="radio" aria-checked={attendance === a.value} onClick={() => setAttendance(a.value)}
                        className={cn('h-8 flex-1 rounded-lg text-xs font-medium ring-1', attendance === a.value ? 'bg-neutral-900 text-white ring-neutral-900' : 'bg-white ring-line hover:bg-neutral-50')}>
                        {a.label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}

              {isCollab ? (
                <div className="rounded-xl bg-canvas p-3 text-[13px]" data-testid="collab-review">
                  <p className="font-medium">Members of “{destName}” will see:</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-neutral-700">
                    <li>{itemName} at its {isEvent ? 'event' : 'mapped'} location</li>
                    {attendance && <li>That you’re {attendance === 'going' ? 'going' : 'interested'}</li>}
                    <li>Your username as the person who added it</li>
                  </ul>
                  <p className="mt-2 text-xs text-neutral-500">None of your private maps, notes or groups are shared.</p>
                </div>
              ) : (
                <GroupPicker legend="Select group(s)" groups={groups.data ?? []} value={selection} onChange={setSelection} error={groupError} />
              )}

              <ErrorMessage error={error} />
              <Button variant="cta" className="w-full" icon={<MapPin className="size-4" aria-hidden />} onClick={confirm} loading={busy} disabled={!destId}>
                {isCollab ? 'Add to collaboration map' : existing ? 'Update on map' : 'Add to map'}
              </Button>
              {done && (
                <p role="status" className="flex items-center gap-1.5 text-xs font-medium text-brand">
                  <CheckCircle2 className="size-4" aria-hidden />{done}
                </p>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
