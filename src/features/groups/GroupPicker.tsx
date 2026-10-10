/**
 * Group assignment control used by every save flow. Checkboxes (multiple
 * groups allowed) plus inline creation of new groups. New groups are kept as
 * PENDING drafts and only created when the surrounding dialog is confirmed,
 * so cancelling leaves no trace.
 */
import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { Group } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Checkbox, TextField } from '@/components/ui/Field';
import { ColorPicker, PALETTE } from '@/components/ui/ColorPicker';

export interface PendingGroup { tempId: string; name: string; color: string }

export interface GroupSelection {
  selectedIds: string[];
  pending: PendingGroup[];
}

export const emptySelection = (ids: string[] = []): GroupSelection => ({ selectedIds: ids, pending: [] });
export const selectionCount = (s: GroupSelection) => s.selectedIds.length + s.pending.length;

export function GroupPicker({ groups, value, onChange, error }: {
  groups: Group[];
  value: GroupSelection;
  onChange: (v: GroupSelection) => void;
  error?: string | null;
}) {
  const [adding, setAdding] = useState(groups.length === 0);
  const [name, setName] = useState('');
  const [color, setColor] = useState(PALETTE[groups.length % PALETTE.length]);
  const [nameError, setNameError] = useState<string | null>(null);

  const toggle = (id: string, on: boolean) =>
    onChange({ ...value, selectedIds: on ? [...value.selectedIds, id] : value.selectedIds.filter((x) => x !== id) });

  const addPending = () => {
    const trimmed = name.trim();
    if (!trimmed) return setNameError('Enter a group name.');
    if (trimmed.length > 40) return setNameError('Keep group names to 40 characters.');
    const lower = trimmed.toLowerCase();
    if (groups.some((g) => g.name.toLowerCase() === lower) || value.pending.some((p) => p.name.toLowerCase() === lower)) {
      return setNameError('You already have a group with that name.');
    }
    onChange({ ...value, pending: [...value.pending, { tempId: crypto.randomUUID(), name: trimmed, color }] });
    setName('');
    setNameError(null);
    setColor(PALETTE[(groups.length + value.pending.length + 1) % PALETTE.length]);
    setAdding(false);
  };

  return (
    <fieldset className="space-y-2" aria-describedby={error ? 'group-picker-error' : undefined}>
      <legend className="text-[13px] font-medium text-neutral-700">Groups <span className="font-normal text-neutral-500">(choose at least one)</span></legend>
      <div className="max-h-52 space-y-0.5 overflow-y-auto rounded-lg border border-neutral-200 p-1">
        {groups.length === 0 && value.pending.length === 0 && (
          <p className="px-2 py-2 text-xs text-neutral-500">You don’t have any groups yet. Create one below.</p>
        )}
        {groups.map((g) => (
          <Checkbox
            key={g.id}
            label={g.name}
            swatch={g.color}
            checked={value.selectedIds.includes(g.id)}
            onChange={(on) => toggle(g.id, on)}
          />
        ))}
        {value.pending.map((p) => (
          <Checkbox
            key={p.tempId}
            label={p.name}
            description="New group — created when you confirm"
            swatch={p.color}
            checked
            onChange={(on) => !on && onChange({ ...value, pending: value.pending.filter((x) => x.tempId !== p.tempId) })}
          />
        ))}
      </div>
      {error && <p id="group-picker-error" role="alert" className="text-xs text-danger">{error}</p>}

      {adding ? (
        <div className="space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <TextField
            label="New group name"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addPending();
              }
            }}
            error={nameError}
          />
          <ColorPicker label="Group color" value={color} onChange={setColor} />
          <div className="flex justify-end gap-2">
            {(groups.length > 0 || value.pending.length > 0) && (
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            )}
            <Button size="sm" variant="primary" onClick={addPending}>Add group</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="ghost" icon={<Plus className="size-4" aria-hidden />} onClick={() => setAdding(true)}>
          New group
        </Button>
      )}
    </fieldset>
  );
}
