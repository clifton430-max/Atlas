/**
 * Group filter contract (pure, unit-tested in tests/unit/groupFilter.test.ts).
 *
 * This is a DERIVED VIEW over the current personal map's pins. It never
 * mutates pins or memberships and never applies to Discover or collaboration
 * maps.
 *
 *   - "All Groups" (default) shows every pin in the current personal map,
 *     including pins that belong to no group.
 *   - Selecting a group while "All Groups" is active switches to that group only.
 *   - Selecting further groups preserves earlier selections (checkbox semantics).
 *   - Multiple selected groups use OR: a pin shows if it is in ANY selected group.
 *   - Deselecting a group removes only that group.
 *   - Deselecting the last selected group returns to "All Groups".
 *   - Choosing "All Groups" clears the selection.
 */

export type GroupFilter = { mode: 'all' } | { mode: 'groups'; groupIds: string[] };

export const ALL_GROUPS: GroupFilter = { mode: 'all' };

export function toggleGroup(filter: GroupFilter, groupId: string): GroupFilter {
  if (filter.mode === 'all') return { mode: 'groups', groupIds: [groupId] };
  if (filter.groupIds.includes(groupId)) {
    const remaining = filter.groupIds.filter((id) => id !== groupId);
    return remaining.length === 0 ? ALL_GROUPS : { mode: 'groups', groupIds: remaining };
  }
  return { mode: 'groups', groupIds: [...filter.groupIds, groupId] };
}

export function isGroupSelected(filter: GroupFilter, groupId: string): boolean {
  return filter.mode === 'groups' && filter.groupIds.includes(groupId);
}

/**
 * Drop selections for groups that no longer exist (e.g. deleted elsewhere).
 * Falls back to All Groups when nothing valid remains.
 */
export function pruneGroupFilter(filter: GroupFilter, existingGroupIds: Iterable<string>): GroupFilter {
  if (filter.mode === 'all') return filter;
  const existing = new Set(existingGroupIds);
  const kept = filter.groupIds.filter((id) => existing.has(id));
  if (kept.length === filter.groupIds.length) return filter;
  return kept.length === 0 ? ALL_GROUPS : { mode: 'groups', groupIds: kept };
}

export function applyGroupFilter<T extends { groupIds: string[] }>(pins: T[], filter: GroupFilter): T[] {
  if (filter.mode === 'all') return pins;
  const selected = new Set(filter.groupIds);
  return pins.filter((p) => p.groupIds.some((g) => selected.has(g)));
}

/** Human-readable active-filter label, e.g. "All Groups" or "Groups: Food, Music". */
export function groupFilterLabel(filter: GroupFilter, groups: { id: string; name: string }[]): string {
  if (filter.mode === 'all') return 'All Groups';
  const names = filter.groupIds
    .map((id) => groups.find((g) => g.id === id)?.name)
    .filter((n): n is string => !!n);
  if (names.length === 0) return 'All Groups';
  return `${names.length === 1 ? 'Group' : 'Groups'}: ${names.join(', ')}`;
}

// ---------------------------------------------------------------------------
// Per-map persistence (browser-local preference; not security-relevant)
// ---------------------------------------------------------------------------
const key = (mapId: string) => `atlas.groupFilter.${mapId}`;

export function loadGroupFilter(mapId: string): GroupFilter {
  try {
    const raw = localStorage.getItem(key(mapId));
    if (!raw) return ALL_GROUPS;
    const parsed = JSON.parse(raw) as GroupFilter;
    if (parsed?.mode === 'groups' && Array.isArray(parsed.groupIds) && parsed.groupIds.every((g) => typeof g === 'string')) {
      return parsed.groupIds.length ? parsed : ALL_GROUPS;
    }
    return ALL_GROUPS;
  } catch {
    return ALL_GROUPS;
  }
}

export function saveGroupFilter(mapId: string, filter: GroupFilter): void {
  try {
    if (filter.mode === 'all') localStorage.removeItem(key(mapId));
    else localStorage.setItem(key(mapId), JSON.stringify(filter));
  } catch {
    /* storage unavailable: preference simply isn't persisted */
  }
}
