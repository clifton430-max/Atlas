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
import { CATEGORIES, sanitizeSubFilters, type CategoryId } from '@/features/places/categories';
import type { Place } from '@/features/places/types';
import type { DiscoverSort } from '@/features/discover/sort';
import type { PinSource } from '@/features/pins/pinSource';

/** Hovered/focused Discover item for the preview (events by id, places by value). */
export type HoverItem = { kind: 'event'; id: string } | { kind: 'place'; place: Place };

const CATEGORY_KEY = 'atlas.discover.categories.v2';
const LEGACY_CATEGORY_KEY = 'atlas.discover.categories.v1';
/** Categories added with v2: shown by default for people upgrading from v1 (they were basemap icons before). */
const ADDED_IN_V2: CategoryId[] = ['shopping', 'services', 'stays'];
/** Discovery markers are small icons, so every category can be on by default. */
const DEFAULT_CATEGORIES: CategoryId[] = CATEGORIES.map((c) => c.id);
function loadCategories(): { visible: CategoryId[]; subs: Partial<Record<CategoryId, string[]>> } {
  try {
    const v2 = localStorage.getItem(CATEGORY_KEY);
    const raw = JSON.parse(v2 ?? localStorage.getItem(LEGACY_CATEGORY_KEY) ?? 'null');
    if (raw && Array.isArray(raw.visible)) {
      const known = new Set<string>(CATEGORIES.map((c) => c.id));
      const visible: CategoryId[] = raw.visible.filter((v: string) => known.has(v));
      // Upgrading from v1: keep the person's choices and add the new categories.
      if (!v2 && visible.length) for (const c of ADDED_IN_V2) if (!visible.includes(c)) visible.push(c);
      return { visible, subs: sanitizeSubFilters(raw.subs ?? {}) };
    }
  } catch { /* defaults */ }
  return { visible: DEFAULT_CATEGORIES, subs: {} };
}
export function saveCategories(visible: CategoryId[], subs: Partial<Record<CategoryId, string[]>>) {
  try { localStorage.setItem(CATEGORY_KEY, JSON.stringify({ visible, subs })); } catch { /* not persisted */ }
}

export interface PlacementRequest {
  latitude: number;
  longitude: number;
  title?: string;
  address?: string | null;
  /** When placed from a search result: its OSM element and source snapshot. */
  placeRef?: string | null;
  source?: PinSource | null;
}

export interface AtlasUiState {
  /** Current visible bounds (debounced), drives Discover queries. */
  bbox: BBox | null;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  /** Unified map side panel: things near me, or my maps/pins/groups. */
  panelTab: 'nearby' | 'pins';

  // Discover context
  discoverFilters: DiscoverFilters;
  discoverKeyword: string;
  /** Order of the Discover lists (does not change what the map shows). */
  discoverSort: DiscoverSort;
  selectedEventId: string | null;
  /** Discover overlays: visible categories (empty = Hide All) and subcategory picks. */
  discoverCategories: CategoryId[];
  discoverSubcategories: Partial<Record<CategoryId, string[]>>;
  /** Hover/keyboard-focus preview target (Discover only). */
  hoverItem: HoverItem | null;
  /** Selected OSM place (Discover only; events use selectedEventId). */
  selectedPlace: Place | null;
  /** Events chosen from global search that may lie outside the loaded viewport. */
  pinnedSearchEventId: string | null;

  // Personal map context
  selectedPinId: string | null;
  /** When true, the next map click picks a location for a new custom pin. */
  placingPin: boolean;
  /** Pending custom-pin location awaiting the create dialog. */
  newPinAt: PlacementRequest | null;
  /** Custom pin being relocated, and the location picked for it (not yet saved). */
  movingPinId: string | null;
  moveTarget: { latitude: number; longitude: number } | null;

  /** Interaction counters used by the interactive tutorial to verify practice tasks. */
  mapMoves: number;
  panelToggles: number;

  /** Group filter per personal map id (persisted per map in localStorage). */
  groupFilters: Record<string, GroupFilter>;

  // Collaboration context
  selectedSharedPinId: string | null;

  /** Placing (or editing) a 3D monument on the open personal map. */
  placingMonument: MonumentDraft | null;
  selectedPlacementId: string | null;
  /** Temporary skin preview on one personal map (never saved, never on shared maps). */
  skinPreview: { mapId: string; defId: string } | null;
}

export interface MonumentDraft {
  defId: string;
  /** Existing placement being edited (null = new placement). */
  editingId: string | null;
  latitude: number | null;
  longitude: number | null;
  /** True once the user clicked a position (the ghost stops following the pointer). */
  fixed: boolean;
  rotationDeg: number;
  scale: number;
}

const PANEL_TAB_KEY = 'atlas.panelTab.v1';

// Panels start open on wide screens; on narrow screens they overlay the map, so start closed.
const width = typeof window === 'undefined' ? 1440 : window.innerWidth;
const initial: AtlasUiState = {
  bbox: null,
  leftPanelOpen: width >= 1024,
  rightPanelOpen: width >= 1280,
  panelTab: (() => { try { return localStorage.getItem(PANEL_TAB_KEY) === 'pins' ? 'pins' : 'nearby'; } catch { return 'nearby'; } })(),
  discoverFilters: EMPTY_FILTERS,
  discoverKeyword: '',
  discoverSort: 'nearest',
  discoverCategories: typeof window === 'undefined' ? DEFAULT_CATEGORIES : loadCategories().visible,
  discoverSubcategories: typeof window === 'undefined' ? {} : loadCategories().subs,
  hoverItem: null,
  selectedPlace: null,
  selectedEventId: null,
  pinnedSearchEventId: null,
  selectedPinId: null,
  placingPin: false,
  newPinAt: null,
  movingPinId: null,
  moveTarget: null,
  mapMoves: 0,
  panelToggles: 0,
  groupFilters: {},
  selectedSharedPinId: null,
  placingMonument: null,
  selectedPlacementId: null,
  skinPreview: null,
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

// The side panel tab survives a refresh (device-local preference).
let lastPanelTab = state.panelTab;
uiStore.subscribe(() => {
  if (state.panelTab === lastPanelTab) return;
  lastPanelTab = state.panelTab;
  try { localStorage.setItem(PANEL_TAB_KEY, state.panelTab); } catch { /* not persisted */ }
});

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

// Dev-only handle for debugging and browser-driven verification (stripped from production builds).
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __atlasUi?: typeof uiStore }).__atlasUi = uiStore;
