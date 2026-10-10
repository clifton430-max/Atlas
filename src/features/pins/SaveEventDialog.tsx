/**
 * Save-to-map confirmation for a public event. Requires choosing a personal
 * map and at least one group. Nothing is written until "Save" is pressed.
 * If the event is already on the chosen map, memberships are updated instead
 * of creating a duplicate pin (enforced by save_event_pin + unique index).
 */
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AtlasEvent } from '@/lib/types';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { SelectField } from '@/components/ui/Field';
import { ErrorMessage, Spinner } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { useMaps } from '@/features/maps/api';
import { useGroups } from '@/features/groups/api';
import { emptySelection, GroupPicker, selectionCount, type GroupSelection } from '@/features/groups/GroupPicker';
import { commitGroupSelection } from '@/features/groups/commitSelection';
import { usePinMutations, useSavedEvents } from './api';

export function SaveEventDialog({ event, open, onClose, defaultMapId }: {
  event: AtlasEvent; open: boolean; onClose: () => void; defaultMapId?: string;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const maps = useMaps();
  const groups = useGroups();
  const saved = useSavedEvents();
  const { saveEvent } = usePinMutations();
  const [mapId, setMapId] = useState<string>('');
  const [selection, setSelection] = useState<GroupSelection>(emptySelection());
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!mapId && maps.data?.length) setMapId(defaultMapId ?? maps.data[0].id);
  }, [maps.data, mapId, defaultMapId]);

  const existing = useMemo(
    () => saved.data?.get(event.id)?.find((p) => p.mapId === mapId) ?? null,
    [saved.data, event.id, mapId],
  );

  // Pre-select current memberships when the event is already on this map.
  useEffect(() => {
    setSelection(emptySelection(existing?.groupIds ?? []));
    setTouched(false);
  }, [existing, mapId]);

  const count = selectionCount(selection);
  const groupError = touched && count === 0 ? 'Choose at least one group.' : null;

  const confirm = async () => {
    setTouched(true);
    if (!mapId || count === 0) return;
    setBusy(true);
    setError(null);
    try {
      const groupIds = await commitGroupSelection(selection, qc);
      await saveEvent.mutateAsync({ mapId, eventId: event.id, groupIds });
      toast.success(existing ? 'Groups updated.' : `Saved to ${maps.data?.find((m) => m.id === mapId)?.name ?? 'your map'}.`);
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const loading = maps.isLoading || groups.isLoading;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!busy}
      title={existing ? 'Update saved event' : 'Save event to a map'}
      description={event.name}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={confirm} loading={busy} disabled={loading || !mapId}>
            {existing ? 'Update groups' : 'Save'}
          </Button>
        </>
      }
    >
      {loading ? (
        <Spinner />
      ) : maps.error || groups.error ? (
        <ErrorMessage error={maps.error ?? groups.error} />
      ) : (
        <div className="space-y-4">
          <SelectField label="Map" value={mapId} onChange={(e) => setMapId(e.target.value)}>
            {maps.data?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </SelectField>
          {existing && (
            <p className="text-xs text-neutral-500">
              This event is already on this map. Saving updates its groups; it won’t create a duplicate.
            </p>
          )}
          <GroupPicker groups={groups.data ?? []} value={selection} onChange={setSelection} error={groupError} />
          <p className="text-xs text-neutral-500">Saved pins are private to you.</p>
          <ErrorMessage error={error} />
        </div>
      )}
    </Dialog>
  );
}
