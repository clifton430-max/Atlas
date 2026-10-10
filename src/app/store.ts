/**
 * Tiny global UI store (no external dependency) built on useSyncExternalStore.
 *
 * Holds view state that several distant components share. State is grouped
 * per map context so Discover, Personal Map and Collaboration Map selections
 * never leak into each other: switching context clears the selections of the
 * others (see AppShell).
 */
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { EMPTY_FILTERS, type DiscoverFilters } from '@/features/discover/filters';
import type { BBox } from '@/services/events/types';
import { loadGroupFilter, saveGroupFilter, type GroupFilter } from '@/features/groups/groupFilter';

export interface PlacementRequest {
  latitude: number;
  longitude: number;
  title?: string;
  address?: string | null;
}

export interface AtlasUiState {
  /** Current visible bounds (debounced), drives Discover queries. */
  bbox: BBox | null;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;

  // Discover context
  discoverFilters: DiscoverFilters;
  discoverKeyword: string;
  selectedEventId: string | null;
  /** Events chosen from global search that may lie outside the loaded viewport. */
  pinnedSearchEventId: string | null;

  // Personal map context
  selectedPinId: string | null;
  /** When true, the next map click picks a location for a new custom pin. */
  placingPin: boolean;
  /** Pending custom-pin location awaiting the create dialog. */
  newPinAt: PlacementRequest | null;

  /** Group filter per personal map id (persisted per map in localStorage). */
  groupFilters: Record<string, GroupFilter>;

  // Collaboration context
  selectedSharedPinId: string | null;
}

const initial: AtlasUiState = {
  bbox: null,
  leftPanelOpen: true,
  rightPanelOpen: true,
  discoverFilters: EMPTY_FILTERS,
  discoverKeyword: '',
  selectedEventId: null,
  pinnedSearchEventId: null,
  selectedPinId: null,
  placingPin: false,
  newPinAt: null,
  groupFilters: {},
  selectedSharedPinId: null,
};

let state: AtlasUiState = initial;
const listeners = new Set<() => void>();

export const uiStore = {
  get: () => state,
  set(patch: Partial<AtlasUiState> | ((s: AtlasUiState) => Partial<AtlasUiState>)) {
    const next = typeof patch === 'function' ? patch(state) : patch;
    state = { ...state, ...next };
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  /** Test helper. */
  reset() {
    state = initial;
    listeners.forEach((l) => l());
  },
};

export function useUi<T>(selector: (s: AtlasUiState) => T): T {
  return useSyncExternalStore(uiStore.subscribe, () => selector(uiStore.get()), () => selector(initial));
}

/** Per-map group filter (personal maps only). */
export function useGroupFilter(mapId: string): [GroupFilter, (f: GroupFilter) => void] {
  const stored = useUi((s) => s.groupFilters[mapId]);
  const resolved = useMemo(() => stored ?? loadGroupFilter(mapId), [stored, mapId]);
  const set = useCallback((f: GroupFilter) => {
    saveGroupFilter(mapId, f);
    uiStore.set((s) => ({ groupFilters: { ...s.groupFilters, [mapId]: f } }));
  }, [mapId]);
  return [resolved, set];
}
