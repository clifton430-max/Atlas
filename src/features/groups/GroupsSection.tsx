/**
 * Left-panel groups for the current personal map: each group is a
 * collapsible row with its pin count (derived from the live pin query, so it
 * updates when pins are added, removed, moved or shared). Expanding a group
 * lists its pins; choosing a pin flies the map there and opens its details.
 * Pins in no group are listed under "Not in a group". Expansion state is
 * remembered per map by stable group id. Deleting a group never deletes pins.
 */
import { useMemo, useState } from 'react';
import { ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Group, Pin } from '@/lib/types';
import { uiStore, useUi } from '@/app/store';
import { useMapInstance } from '@/features/map/MapContext';
import { pinTitle } from '@/features/pins/api';
import { cn } from '@/components/ui/cn';
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

  const byGroup = useMemo(() => {
    const m = new Map<string, Pin[]>();
    for (const p of pins.data ?? []) for (const g of p.groupIds) m.set(g, [...(m.get(g) ?? []), p]);
    return m;
  }, [pins.data]);
  const ungrouped = useMemo(() => (pins.data ?? []).filter((p) => p.groupIds.length === 0), [pins.data]);
  const [open, setOpen] = useState<Set<string>>(() => loadOpen(mapId));
  const toggle = (id: string) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    saveOpen(mapId, next);
    return next;
  });

  return (
    <section aria-labelledby="groups-heading" data-tour="groups-section">
      <div className="flex items-center justify-between px-2 pb-1">
        <h2 id="groups-heading" className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Groups</h2>
        <IconButton label="New group" size="sm" onClick={() => setEditing('new')}><Plus className="size-4" aria-hidden /></IconButton>
      </div>
      {groups.isLoading ? <Spinner className="px-2" /> : groups.error ? <ErrorMessage error={groups.error} /> : groups.data?.length ? (
        <ul className="space-y-0.5">
          {groups.data.map((g) => {
            const items = byGroup.get(g.id) ?? [];
            const expanded = open.has(g.id);
            return (
              <li key={g.id}>
                <div className="group flex items-center gap-1 rounded-lg pr-1 text-sm hover:bg-neutral-100">
                  <button type="button" aria-expanded={expanded} aria-controls={`group-pins-${g.id}`} onClick={() => toggle(g.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left">
                    <ChevronRight className={cn('size-3.5 shrink-0 text-neutral-400 transition-transform', expanded && 'rotate-90')} aria-hidden />
                    <GroupIcon group={g} />
                    <span className="min-w-0 flex-1 truncate">{g.name}</span>
                    {isGroupSelected(filter, g.id) && <span className="text-[10px] font-medium uppercase text-accent-strong">filtered</span>}
                    <span data-testid="group-count" className="rounded-full bg-canvas px-1.5 text-xs tabular-nums text-neutral-600 ring-1 ring-line" aria-label={`${items.length} pins on this map`}>{items.length}</span>
                  </button>
                  <span className="flex opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                    <IconButton label={`Edit group ${g.name}`} size="sm" onClick={() => setEditing(g)}><Pencil className="size-3.5" aria-hidden /></IconButton>
                    <IconButton label={`Delete group ${g.name}`} size="sm" onClick={() => setDeleting(g)}><Trash2 className="size-3.5" aria-hidden /></IconButton>
                  </span>
                </div>
                {expanded && <PinList id={`group-pins-${g.id}`} pins={items} empty="No pins from this map in this group yet." />}
              </li>
            );
          })}
          {ungrouped.length > 0 && (
            <li>
              <button type="button" aria-expanded={open.has(UNGROUPED)} aria-controls="group-pins-none" onClick={() => toggle(UNGROUPED)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-neutral-600 hover:bg-neutral-100">
                <ChevronRight className={cn('size-3.5 shrink-0 text-neutral-400 transition-transform', open.has(UNGROUPED) && 'rotate-90')} aria-hidden />
                <span className="min-w-0 flex-1 truncate italic">Not in a group</span>
                <span className="rounded-full bg-canvas px-1.5 text-xs tabular-nums ring-1 ring-line">{ungrouped.length}</span>
              </button>
              {open.has(UNGROUPED) && <PinList id="group-pins-none" pins={ungrouped} empty="" />}
            </li>
          )}
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

const UNGROUPED = '__ungrouped__';
const openKey = (mapId: string) => `atlas.groupsOpen.${mapId}`;
function loadOpen(mapId: string): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(openKey(mapId)) ?? '[]');
    return new Set(Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
  } catch { return new Set(); }
}
function saveOpen(mapId: string, ids: Set<string>) {
  try { localStorage.setItem(openKey(mapId), JSON.stringify([...ids])); } catch { /* not persisted */ }
}

/** Pins of one group; choosing one focuses the map on it and opens its details. */
function PinList({ id, pins, empty }: { id: string; pins: Pin[]; empty: string }) {
  const { map } = useMapInstance();
  const selected = useUi((s) => s.selectedPinId);
  if (!pins.length) return <p id={id} className="py-1 pl-9 text-xs text-neutral-500">{empty}</p>;
  return (
    <ul id={id} className="mb-1 ml-5 space-y-0.5 border-l border-line pl-2">
      {pins.map((p) => (
        <li key={p.id}>
          <button type="button" aria-current={selected === p.id || undefined} data-testid="group-pin"
            onClick={() => {
              uiStore.set({ selectedPinId: p.id, selectedPlace: null, selectedEventId: null });
              if (p.latitude != null && p.longitude != null) map?.easeTo({ center: [p.longitude, p.latitude], zoom: Math.max(map.getZoom(), 15.5) });
            }}
            className={cn('block w-full truncate rounded-md px-2 py-1 text-left text-[13px] hover:bg-neutral-100', selected === p.id && 'bg-accent-soft/60 font-medium')}>
            {pinTitle(p)}
            {p.latitude == null && <span className="ml-1 text-[11px] text-neutral-400">(no location)</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}
