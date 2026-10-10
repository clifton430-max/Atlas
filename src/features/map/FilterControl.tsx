/**
 * Top-right map filter control. Context-aware and isolated:
 *   Discover     -> Discover filters (category/price/time)
 *   Personal map -> group filter for THIS map (checkboxes, OR semantics)
 *   Collaboration-> no filters (control hidden)
 * Distinct from Settings, which lives in the account menu.
 */
import { useMatch } from 'react-router-dom';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { useGroupFilter, useUi } from '@/app/store';
import { Popover } from '@/components/ui/Popover';
import { Checkbox } from '@/components/ui/Field';
import { Spinner } from '@/components/ui/Feedback';
import { cn } from '@/components/ui/cn';
import { DiscoverFilterPanel } from '@/features/discover/DiscoverFilterPanel';
import { activeFilterCount, categoriesOf } from '@/features/discover/filters';
import { useDiscoverEvents } from '@/features/discover/useDiscoverEvents';
import { useGroups } from '@/features/groups/api';
import { ALL_GROUPS, groupFilterLabel, isGroupSelected, toggleGroup } from '@/features/groups/groupFilter';

const triggerCls = (active: boolean) => cn(
  'flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium shadow-panel ring-1 ring-black/5',
  active ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-800 hover:bg-neutral-50',
);

export function FilterControl() {
  const discover = useMatch('/');
  const personal = useMatch('/maps/:mapId');
  if (discover) return <DiscoverFilterControl />;
  if (personal) return <GroupFilterControl mapId={personal.params.mapId!} />;
  return null;
}

function DiscoverFilterControl() {
  const filters = useUi((s) => s.discoverFilters);
  const { all } = useDiscoverEvents();
  const n = activeFilterCount(filters);
  return (
    <Popover label="Event filters" trigger={({ open, toggle, id }) => (
      <button type="button" aria-expanded={open} aria-controls={id} onClick={toggle} className={triggerCls(n > 0)}>
        <SlidersHorizontal className="size-4" aria-hidden />
        Filters{n > 0 && <span className="rounded-md bg-white/20 px-1.5 text-xs">{n} active</span>}
        <ChevronDown className="size-3.5 opacity-60" aria-hidden />
      </button>
    )}>
      <DiscoverFilterPanel availableCategories={categoriesOf(all)} />
    </Popover>
  );
}

/**
 * Group filter widget implementing the exact contract in groupFilter.ts:
 * "All Groups" default; selecting a group clears it; OR across groups;
 * deselecting the last group restores "All Groups".
 */
export function GroupFilterControl({ mapId }: { mapId: string }) {
  const groups = useGroups();
  const [filter, setFilter] = useGroupFilter(mapId);
  const label = groupFilterLabel(filter, groups.data ?? []);
  return (
    <Popover label="Group filter" trigger={({ open, toggle, id }) => (
      <button type="button" aria-expanded={open} aria-controls={id} onClick={toggle} className={cn(triggerCls(filter.mode === 'groups'), 'max-w-[320px]')}
        aria-label={`Group filter: ${label}`}>
        <SlidersHorizontal className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
        <ChevronDown className="size-3.5 shrink-0 opacity-60" aria-hidden />
      </button>
    )}>
      <fieldset className="w-[280px] p-3">
        <legend className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Show pins in</legend>
        <Checkbox label="All Groups" checked={filter.mode === 'all'} onChange={() => setFilter(ALL_GROUPS)} />
        <div className="my-1 border-t border-neutral-100" />
        {groups.isLoading ? <Spinner /> : groups.data?.length ? groups.data.map((g) => (
          <Checkbox key={g.id} label={g.name} swatch={g.color} checked={isGroupSelected(filter, g.id)} onChange={() => setFilter(toggleGroup(filter, g.id))} />
        )) : <p className="px-2 py-1 text-xs text-neutral-500">No groups yet.</p>}
        <p className="mt-2 px-2 text-[11px] text-neutral-500" aria-live="polite">
          {filter.mode === 'all' ? 'Showing every pin on this map.' : 'Showing pins in any selected group.'} Filters only change what’s visible.
        </p>
      </fieldset>
    </Popover>
  );
}
