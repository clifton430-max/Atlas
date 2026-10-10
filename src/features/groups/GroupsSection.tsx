/**
 * Left-panel group management for the current personal map: list with
 * per-map pin counts, create/edit/delete. (Filtering lives in the top-right
 * filter control.) Deleting a group never deletes pins.
 */
import { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { Group } from '@/lib/types';
import { IconButton } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { EmptyState, ErrorMessage, Spinner } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { usePins } from '@/features/pins/api';
import { useGroupFilter } from '@/app/store';
import { isGroupSelected } from './groupFilter';
import { useGroupMutations, useGroups } from './api';
import { GroupFormDialog } from './GroupFormDialog';
import { GroupIcon } from './GroupIcon';

export function GroupsSection({ mapId }: { mapId: string }) {
  const toast = useToast();
  const groups = useGroups();
  const pins = usePins(mapId);
  const [filter] = useGroupFilter(mapId);
  const { remove } = useGroupMutations();
  const [editing, setEditing] = useState<Group | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Group | null>(null);

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const p of pins.data ?? []) for (const g of p.groupIds) c.set(g, (c.get(g) ?? 0) + 1);
    return c;
  }, [pins.data]);

  return (
    <section aria-labelledby="groups-heading" data-tour="groups-section">
      <div className="flex items-center justify-between px-2 pb-1">
        <h2 id="groups-heading" className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Groups</h2>
        <IconButton label="New group" size="sm" onClick={() => setEditing('new')}><Plus className="size-4" aria-hidden /></IconButton>
      </div>
      {groups.isLoading ? <Spinner className="px-2" /> : groups.error ? <ErrorMessage error={groups.error} /> : groups.data?.length ? (
        <ul className="space-y-0.5">
          {groups.data.map((g) => (
            <li key={g.id} className="group flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-neutral-100">
              <GroupIcon group={g} />
              <span className="min-w-0 flex-1 truncate">{g.name}</span>
              {isGroupSelected(filter, g.id) && <span className="text-[10px] font-medium uppercase text-accent-strong">filtered</span>}
              <span className="text-xs tabular-nums text-neutral-500" aria-label={`${counts.get(g.id) ?? 0} pins on this map`}>{counts.get(g.id) ?? 0}</span>
              <span className="flex opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                <IconButton label={`Edit group ${g.name}`} size="sm" onClick={() => setEditing(g)}><Pencil className="size-3.5" aria-hidden /></IconButton>
                <IconButton label={`Delete group ${g.name}`} size="sm" onClick={() => setDeleting(g)}><Trash2 className="size-3.5" aria-hidden /></IconButton>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No groups yet">Groups are created when you save pins, or here.</EmptyState>
      )}
      {editing && <GroupFormDialog group={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        danger
        busy={remove.isPending}
        title={`Delete “${deleting?.name}”?`}
        confirmLabel="Delete group"
        message="Pins in this group are NOT deleted — they just stop belonging to it. This applies to all your maps."
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id, {
          onSuccess: () => { toast.success('Group deleted. Pins were kept.'); setDeleting(null); },
          onError: (e) => toast.error(e),
        })}
      />
    </section>
  );
}
