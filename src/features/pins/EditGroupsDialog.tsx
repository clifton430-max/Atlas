/** Edit which groups a pin belongs to (membership only; the pin is untouched). */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Pin } from '@/lib/types';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { ErrorMessage } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { useGroups } from '@/features/groups/api';
import { emptySelection, GroupPicker, type GroupSelection } from '@/features/groups/GroupPicker';
import { commitGroupSelection } from '@/features/groups/commitSelection';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { pinTitle, usePinMutations } from './api';

export function EditGroupsDialog({ pin, onClose }: { pin: Pin; onClose: () => void }) {
  const qc = useQueryClient();
  const ws = useWorkspace();
  const toast = useToast();
  const groups = useGroups();
  const { setGroups } = usePinMutations();
  const [selection, setSelection] = useState<GroupSelection>(emptySelection(pin.groupIds));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const ids = await commitGroupSelection(selection, qc, ws);
      await setGroups.mutateAsync({ pinId: pin.id, groupIds: ids });
      toast.success('Groups updated.');
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
      title="Edit groups"
      description={pinTitle(pin)}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={busy}>Save groups</Button>
        </>
      }
    >
      <GroupPicker groups={groups.data ?? []} value={selection} onChange={setSelection} />
      <p className="mt-3 text-xs text-neutral-500">Changing groups never moves or duplicates the pin. A pin with no groups still appears under “All Groups”.</p>
      <ErrorMessage error={error} className="mt-3" />
    </Dialog>
  );
}
