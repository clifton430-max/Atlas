/**
 * Create a private custom pin at a chosen location (map click or place
 * search). Requires a title and at least one group; nothing is written until
 * "Create pin" is pressed. Coordinates come from the user's explicit choice.
 */
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { uiStore, type PlacementRequest } from '@/app/store';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { TextArea, TextField } from '@/components/ui/Field';
import { ErrorMessage } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { useGroups } from '@/features/groups/api';
import { emptySelection, GroupPicker, selectionCount, type GroupSelection } from '@/features/groups/GroupPicker';
import { commitGroupSelection } from '@/features/groups/commitSelection';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { reverseGeocode } from '@/services/events/geocoder';
import { usePinMutations } from './api';
import { searchResultToPinSource, type PinSource } from './pinSource';
import { fetchPlaceDetails } from '@/features/places/placeDetails';
import { SourceDetails } from './SourceDetails';

export function CustomPinDialog({ mapId, at, onClose }: { mapId: string; at: PlacementRequest; onClose: () => void }) {
  const qc = useQueryClient();
  const ws = useWorkspace();
  const toast = useToast();
  const groups = useGroups();
  const { createCustom } = usePinMutations();
  const [title, setTitle] = useState(at.title ?? '');
  const [note, setNote] = useState('');
  const [address, setAddress] = useState(at.address ?? '');
  const [addressSuggested, setAddressSuggested] = useState(false);
  const [selection, setSelection] = useState<GroupSelection>(emptySelection());
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [source, setSource] = useState<PinSource | null>(at.source ?? null);

  // A search hit identifies an OSM element: enrich its snapshot with verified details (best effort).
  useEffect(() => {
    if (!at.placeRef || !at.source) return;
    const ctrl = new AbortController();
    fetchPlaceDetails(at.placeRef, ctrl.signal)
      .then((d) => !ctrl.signal.aborted && setSource(searchResultToPinSource({ osmRef: at.placeRef!, name: at.source!.name ?? at.title ?? '', detail: at.source!.address ?? '', kind: at.source!.subcategory ?? null }, d) ?? at.source!))
      .catch(() => { /* keep the basic snapshot; details are optional */ });
    return () => ctrl.abort();
  }, [at]);

  // Suggest an address for clicked points (best effort; user can edit/clear).
  useEffect(() => {
    if (at.address) return;
    const ctrl = new AbortController();
    reverseGeocode(at.latitude, at.longitude, ctrl.signal).then((a) => {
      if (a && !ctrl.signal.aborted) {
        setAddress((cur) => cur || a);
        setAddressSuggested(true);
      }
    });
    return () => ctrl.abort();
  }, [at]);

  const titleError = touched && !title.trim() ? 'Give the pin a title.' : null;
  const groupError = touched && selectionCount(selection) === 0 ? 'Choose at least one group.' : null;

  const submit = async () => {
    setTouched(true);
    if (!title.trim() || selectionCount(selection) === 0) return;
    setBusy(true);
    setError(null);
    try {
      const groupIds = await commitGroupSelection(selection, qc, ws);
      const pinId = await createCustom.mutateAsync({
        mapId, title: title.trim(), note, latitude: at.latitude, longitude: at.longitude,
        address: address.trim() || null, groupIds, placeRef: at.placeRef ?? null, source,
      });
      uiStore.set({ selectedPinId: pinId });
      toast.success('Pin created.');
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      dismissible={!busy}
      title="New custom pin"
      description={`${at.latitude.toFixed(5)}, ${at.longitude.toFixed(5)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy}>Create pin</Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <TextField label="Title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} error={titleError} required />
        <TextField
          label="Address (optional)"
          value={address}
          maxLength={300}
          onChange={(e) => { setAddress(e.target.value); setAddressSuggested(false); }}
          hint={addressSuggested ? 'Suggested from map data — please check it.' : undefined}
        />
        <TextArea label="Private note (optional)" value={note} maxLength={5000} onChange={(e) => setNote(e.target.value)} hint="Only you can see notes unless you explicitly choose to share one." />
        <GroupPicker groups={groups.data ?? []} value={selection} onChange={setSelection} error={groupError} />
        {source && (
          <div className="rounded-xl bg-canvas p-3">
            <SourceDetails source={source} compact />
            <p className="mt-2 text-[11px] text-neutral-500">These details are saved with the pin, separately from your title and note.</p>
          </div>
        )}
        <ErrorMessage error={error ?? groups.error} />
      </form>
    </Dialog>
  );
}
