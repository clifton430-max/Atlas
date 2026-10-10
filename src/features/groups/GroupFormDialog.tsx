import { useState } from 'react';
import type { Group } from '@/lib/types';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { ColorPicker, PALETTE } from '@/components/ui/ColorPicker';
import { ErrorMessage } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { useGroupMutations } from './api';
import { GroupIconPicker } from './GroupIcon';

/** Create or edit a group (name + color). */
export function GroupFormDialog({ group, onClose }: { group?: Group; onClose: () => void }) {
  const toast = useToast();
  const { create, update } = useGroupMutations();
  const [name, setName] = useState(group?.name ?? '');
  const [color, setColor] = useState(group?.color ?? PALETTE[2]);
  const [icon, setIcon] = useState<string | null>(group?.icon ?? null);
  const [touched, setTouched] = useState(false);
  const mutation = group ? update : create;

  const submit = () => {
    setTouched(true);
    if (!name.trim()) return;
    const onSuccess = () => { toast.success(group ? 'Group updated.' : 'Group created.'); onClose(); };
    if (group) update.mutate({ id: group.id, name, color, icon }, { onSuccess });
    else create.mutate({ name, color, icon }, { onSuccess });
  };

  return (
    <Dialog open onClose={onClose} size="sm" title={group ? 'Edit group' : 'New group'} dismissible={!mutation.isPending}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={mutation.isPending} onClick={submit}>{group ? 'Save' : 'Create'}</Button></>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <TextField label="Name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} error={touched && !name.trim() ? 'Enter a name.' : null} />
        <ColorPicker label="Color" value={color} onChange={setColor} />
        <GroupIconPicker value={icon} onChange={setIcon} color={color} />
        <p className="text-xs text-neutral-500">Group colors appear as small badges on pins and never replace a pin’s own color or image.</p>
        <ErrorMessage error={mutation.error} />
      </form>
    </Dialog>
  );
}
