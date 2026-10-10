/**
 * Interactive tutorial content. Each step points at a REAL control (via its
 * `data-tour` attribute) and, for "Try it yourself" steps, checks real app
 * state to confirm the action happened before Next unlocks (users can always
 * skip a step).
 *
 * The tour runs in the disposable tutorial sandbox workspace, so practice
 * actions never touch account data or the guest workspace, and nothing is
 * ever sent to other people.
 */
import { EMPTY_FILTERS } from '@/features/discover/filters';
import { uiStore, type AtlasUiState } from '@/app/store';
import { loadGroupFilter } from '@/features/groups/groupFilter';
import type { LocalState, LocalWorkspace } from '@/features/workspace/localWorkspace';

export interface TourCtx {
  ws: LocalWorkspace;
  snap: Readonly<LocalState>;
  ui: AtlasUiState;
  path: string;
  q: (selector: string) => HTMLElement | null;
}

export interface Baseline {
  ui: AtlasUiState;
  snap: Readonly<LocalState>;
}

export interface TourStep {
  id: string;
  chapter: number;
  title: string;
  body: string;
  /** data-tour id of the control to highlight. */
  target?: string;
  /** Route to show for this step (null = stay). */
  route?: (ctx: TourCtx) => string | null;
  /** Make the target reachable: open panels, select a pin, open a popover… */
  prepare?: (ctx: TourCtx) => void;
  /** "Try it yourself" instruction. */
  task?: string;
  /** Verifies the task was really performed. */
  done?: (ctx: TourCtx, base: Baseline) => boolean;
  /** 'corner' docks the card bottom-right, keeping the map centre free for map-click tasks. */
  placement?: 'auto' | 'corner';
}

export const CHAPTERS = [
  'Getting around Atlas',
  'Discovering public events',
  'Personal maps',
  'Groups and filtering',
  'Pin customization and images',
  'Friends and collaboration',
  'Settings, privacy and data',
];

// ---- helpers -----------------------------------------------------------------
const panels = () => uiStore.set({ leftPanelOpen: true, rightPanelOpen: true });
const click = (ctx: TourCtx, selector: string) => ctx.q(selector)?.click();

/** The practice map: the one with the most pins, else the newest. */
export function practiceMap(snap: Readonly<LocalState>) {
  if (!snap.maps.length) return null;
  const count = (id: string) => snap.pins.filter((p) => p.mapId === id).length;
  return [...snap.maps].sort((a, b) => count(b.id) - count(a.id) || b.createdAt.localeCompare(a.createdAt))[0];
}
const practicePath = (ctx: TourCtx) => {
  const m = practiceMap(ctx.snap);
  return m ? `/maps/${m.id}` : null;
};
const customPin = (snap: Readonly<LocalState>) => {
  const m = practiceMap(snap);
  return snap.pins.find((p) => p.mapId === m?.id && p.kind === 'custom') ?? snap.pins.find((p) => p.mapId === m?.id) ?? null;
};
/** Select a pin on the practice map so its card (and buttons) are visible. */
const selectPin = (ctx: TourCtx, pick: (s: Readonly<LocalState>) => { id: string } | null | undefined = customPin) => {
  const p = pick(ctx.snap);
  if (p && ctx.ui.selectedPinId !== p.id) uiStore.set({ selectedPinId: p.id, placingPin: false, movingPinId: null });
};
const selectFirstEvent = (ctx: TourCtx) => {
  if (!ctx.ui.selectedEventId) click(ctx, '[data-tour="events-in-view"] li button');
};
const openFilters = (ctx: TourCtx) => {
  if (!ctx.q('[data-tour="filter-price"]')) click(ctx, '[data-tour="filters-button"]');
};
const groupFilterOf = (ctx: TourCtx) => {
  const id = ctx.path.startsWith('/maps/') ? ctx.path.split('/')[2] : '';
  return ctx.ui.groupFilters[id] ?? loadGroupFilter(id);
};

export const STEPS: TourStep[] = [
  // ---------------------------------------------------------------- Chapter 1
  {
    id: 'welcome', chapter: 0, title: 'Welcome to the Atlas tour',
    body: 'This tour uses the real Atlas interface. Everything you create here lives in a temporary practice sandbox that is discarded when the tour ends — your own maps aren’t changed, and nothing is sent to anyone. Use Next and Back to move around, or Exit at any time.',
    route: () => '/', prepare: panels,
  },
  {
    id: 'contexts', chapter: 0, title: 'Three kinds of map', target: 'nav-contexts',
    body: 'Atlas has three views of the same map, switched with these tabs. Discover shows public events and places. My Maps holds your own pins and is private. Shared holds collaboration maps, which contain only pins people deliberately share.',
    route: () => '/', prepare: panels,
  },
  {
    id: 'pan', placement: 'corner', chapter: 0, title: 'Move around the map', target: 'map-area',
    body: 'Drag to pan, scroll or use the + / − buttons to zoom. Atlas remembers where you were.',
    task: 'Pan or zoom the map.',
    done: (c, b) => c.ui.mapMoves > b.ui.mapMoves,
  },
  {
    id: 'select-marker', chapter: 0, title: 'Select an event', target: 'events-in-view',
    body: 'Event markers show the event type; dark circles with numbers are clusters (click to zoom in). This list in the side panel mirrors the events in view and works with the keyboard. Details open in the panel on the right.',
    task: 'Select an event from the list or click a marker on the map.',
    route: () => '/', prepare: (c) => { panels(); uiStore.set({ selectedEventId: null }); void c; },
    done: (c) => !!c.ui.selectedEventId,
  },
  {
    id: 'panels', chapter: 0, title: 'Panels open and close', target: 'toggle-left',
    body: 'Collapse the side panel to give the map more room. Your view stays exactly where it is.',
    task: 'Collapse the side panel, then open it again.',
    prepare: () => uiStore.set({ selectedEventId: null }),
    done: (c, b) => c.ui.panelToggles >= b.ui.panelToggles + 2 && c.ui.leftPanelOpen,
  },
  {
    id: 'right-panel', chapter: 0, title: 'Details panel', target: 'toggle-right',
    body: 'The right panel shows details of whatever you select — an event, place or pin — and lets you add it to a map. With nothing selected it shows the map legend. Use this button to show or hide it.',
    prepare: panels,
  },
  {
    id: 'help', chapter: 0, title: 'Help and settings', target: 'help-button',
    body: 'Help is here: restart this tour or jump to any chapter whenever you like. Settings (account, privacy, groups, pins, guest data) are in the account menu next to it.',
  },
  {
    id: 'workspace', chapter: 0, title: 'Where your data lives', target: 'workspace-badge',
    body: 'Without an account you use Atlas as a guest: maps are saved only in this browser on this device. Signed in, maps are private to your account. During the tour this badge reads “Tutorial sandbox” — practice data that is thrown away afterwards.',
  },

  // ---------------------------------------------------------------- Chapter 2
  {
    id: 'search', chapter: 1, title: 'Search', target: 'search',
    body: 'Search finds events, venues, artists, categories and cities, plus places and addresses. Suggestions appear as you type.',
    task: 'Type something (for example “music” or a city) and choose a suggestion or press Enter.',
    route: () => '/', prepare: () => uiStore.set({ selectedEventId: null }),
    done: (c, b) => !!c.ui.discoverKeyword || (!!c.ui.selectedEventId && c.ui.selectedEventId !== b.ui.selectedEventId) || c.ui.mapMoves > b.ui.mapMoves,
  },
  {
    id: 'event-details', chapter: 1, title: 'Event details', target: 'event-card',
    body: 'Details show start and end times in the event’s own timezone, venue hours (kept separate from event times), price and the data source. Anything unknown says “Unknown” — Atlas never guesses. Ticket links open the official seller in a new tab, and only secure https links are shown.',
    route: () => '/', prepare: (c) => { uiStore.set({ discoverKeyword: '' }); selectFirstEvent(c); },
  },
  {
    id: 'sources', chapter: 1, title: 'Live or sample data?', target: 'discover-status',
    body: 'Atlas tells you where events come from: “Live from Ticketmaster”, how long ago results were fetched, or a clear notice when live data is unavailable. Development sample events are always labelled “Sample” and are never presented as real listings.',
  },
  {
    id: 'categories', chapter: 1, title: 'Discover by category', target: 'category-bar',
    body: 'Show events and real places from OpenStreetMap: Food & Drink, Parks, Scenic Views, Attractions and more. Each category has its own icon and color, and the arrow next to it picks subcategories. Hover a marker (or focus a result) for a preview; click for details and “Add to map”.',
    task: 'Turn on another category (for example Food & Drink).',
    route: () => '/',
    done: (c, b) => c.ui.discoverCategories.some((id) => !b.ui.discoverCategories.includes(id)),
  },
  {
    id: 'hide-all', chapter: 1, title: 'Hide all, show all', target: 'hide-all',
    body: '“Hide all” clears every Discover overlay so you can read the map; “Show all” brings everything back. It only affects Discover — your own pins are never hidden or deleted.',
  },
  {
    id: 'distance', chapter: 1, title: 'How far is it?', target: 'use-location',
    body: 'Click Distance to share your location with Atlas on this device only. Previews, lists and details then show straight-line distance (never walking or driving time).',
  },
  {
    id: 'filters-open', chapter: 1, title: 'Filters', target: 'filters-button',
    body: 'Filters combine: category AND price AND time. Within one filter, choices combine with OR.',
    task: 'Open Filters and tick a category.',
    prepare: (c) => { uiStore.set({ selectedEventId: null }); void c; },
    done: (c) => c.ui.discoverFilters.categories.length > 0,
  },
  {
    id: 'filters-price', chapter: 1, title: 'Price bands', target: 'filter-price',
    body: 'Bands don’t overlap and use the lowest ticket price. Events with an unknown price are hidden while a price filter is on — unknown is never treated as free — unless you turn on “Include unknown prices”.',
    task: 'Select a price band.',
    prepare: openFilters,
    done: (c) => c.ui.discoverFilters.priceBands.length > 0,
  },
  {
    id: 'filters-time', chapter: 1, title: 'Time windows', target: 'filter-event-time',
    body: 'Event start times are matched in each event’s own local time. Windows can cross midnight, e.g. 22:00 → 02:00. “Venue open during” is a separate filter for venue hours.',
    task: 'Turn on an event start-time window.',
    prepare: openFilters,
    done: (c) => !!c.ui.discoverFilters.eventTime,
  },
  {
    id: 'filters-clear', chapter: 1, title: 'Clearing filters', target: 'filters-button',
    body: 'The button shows how many filters are active. “Clear all filters” at the bottom of the panel resets them. We’ll clear them for you now.',
    prepare: () => uiStore.set({ discoverFilters: EMPTY_FILTERS, discoverKeyword: '' }),
  },

  // ---------------------------------------------------------------- Chapter 3
  {
    id: 'new-map', chapter: 2, title: 'Create a map', target: 'new-map',
    body: 'Keep separate maps for trips, cities or projects. Maps are private: in the tour they’re practice maps.',
    task: 'Click + and create a map.',
    route: (c) => practicePath(c) ?? '/maps', prepare: panels,
    done: (c, b) => c.snap.maps.length > b.snap.maps.length,
  },
  {
    id: 'open-map', chapter: 2, title: 'Your maps', target: 'my-maps',
    body: 'The highlighted map is the one you’re viewing. Hover a map to rename or delete it. The My Maps tab always brings you back to the map you used last.',
    task: 'Open your map from the list.',
    done: (c) => c.path.startsWith('/maps/'),
  },
  {
    id: 'save-event', chapter: 2, title: 'Save an event', target: 'save-to-map',
    body: 'The details panel has an “Add to map” section: pick Personal or Collaboration map, choose the map, and choose at least one group — you can create one right there. Adding the same event again only updates it; it never makes a duplicate.',
    task: 'Select an event, choose or create a group under “Add to map”, and press Add to map.',
    route: () => '/', prepare: selectFirstEvent,
    done: (c) => c.snap.pins.some((p) => p.kind === 'event'),
  },
  {
    id: 'custom-pin', placement: 'corner', chapter: 2, title: 'Add a custom pin', target: 'add-custom-pin',
    body: 'Custom pins mark any place — a café, a viewpoint, a hotel. Click the button, then click the map where the pin should go.',
    task: 'Add a custom pin (a group is required).',
    route: practicePath, prepare: panels,
    done: (c, b) => c.snap.pins.filter((p) => p.kind === 'custom').length > b.snap.pins.filter((p) => p.kind === 'custom').length,
  },
  {
    id: 'edit-pin', chapter: 2, title: 'Edit a pin', target: 'pin-edit',
    body: 'Open a pin to see its details. Edit changes the title, address and your private note. You can also move a pin to another map here.',
    task: 'Click Edit, add a note and save.',
    route: practicePath, prepare: (c) => selectPin(c),
    done: (c) => c.snap.pins.some((p) => !!p.note),
  },
  {
    id: 'move-pin', placement: 'corner', chapter: 2, title: 'Move a pin', target: 'pin-move',
    body: 'Custom pins can be moved: press Move, click the new spot, then Save location. (Saved events always use the event’s official location.)',
    task: 'Move your custom pin.',
    route: practicePath, prepare: (c) => selectPin(c),
    done: (c, b) => c.snap.pins.some((p) => {
      const before = b.snap.pins.find((x) => x.id === p.id);
      return p.kind === 'custom' && !!before && (before.latitude !== p.latitude || before.longitude !== p.longitude);
    }),
  },
  {
    id: 'delete-pin', chapter: 2, title: 'Deleting', target: 'pin-delete',
    body: 'The trash button deletes a pin after you confirm. Deleting a saved event only removes it from your map — the public event isn’t affected. Deleting a map deletes its pins.',
    route: practicePath, prepare: (c) => selectPin(c),
  },

  // ---------------------------------------------------------------- Chapter 4
  {
    id: 'create-group', chapter: 3, title: 'Groups', target: 'groups-section',
    body: 'Groups are color-coded collections like “Food” or “Music”, with an optional icon. One pin can be in several groups without being duplicated. Deleting a group never deletes pins.',
    task: 'Use + to create a group with a color and an icon.',
    route: practicePath, prepare: () => uiStore.set({ selectedPinId: null }),
    done: (c) => c.snap.groups.some((g) => !!g.icon),
  },
  {
    id: 'multi-group', chapter: 3, title: 'One pin, many groups', target: 'pin-groups',
    body: 'Groups shows checkboxes for every group. Ticking more than one puts the same pin in all of them.',
    task: 'Put one pin into two groups.',
    route: practicePath, prepare: (c) => selectPin(c),
    done: (c) => c.snap.pins.some((p) => p.groupIds.length >= 2),
  },
  {
    id: 'filter-one', chapter: 3, title: 'Filter by group', target: 'group-filter',
    body: '“All Groups” is the default and shows every pin. Selecting a group switches to just that group.',
    task: 'Open the group filter and tick one group.',
    route: practicePath, prepare: () => uiStore.set({ selectedPinId: null }),
    done: (c) => groupFilterOf(c).mode === 'groups',
  },
  {
    id: 'filter-or', chapter: 3, title: 'Several groups = OR', target: 'group-filter',
    body: 'Selecting another group keeps the first one: pins in ANY selected group are shown. The button always spells out the active filter in words.',
    task: 'Tick a second group.',
    done: (c) => { const f = groupFilterOf(c); return f.mode === 'groups' && f.groupIds.length >= 2; },
  },
  {
    id: 'filter-all', chapter: 3, title: 'Back to All Groups', target: 'group-filter',
    body: 'Untick groups one at a time, or choose All Groups. When the last group is unticked, Atlas returns to All Groups automatically.',
    task: 'Return to All Groups.',
    done: (c) => groupFilterOf(c).mode === 'all',
  },
  {
    id: 'filter-meaning', chapter: 3, title: 'Filters only change visibility', target: 'group-filter',
    body: 'Group filters hide and show pins; they never change which groups a pin belongs to. Each map remembers its own filter, and filters never affect Discover or collaboration maps.',
  },

  // ---------------------------------------------------------------- Chapter 5
  {
    id: 'appearance', chapter: 4, title: 'Customize a pin', target: 'pin-customize',
    body: 'Change a pin’s color, shape, icon, size and border, with a live preview. “Reset to default” undoes it. The pin keeps its place, groups and sharing.',
    task: 'Open Customize, change the color or shape, and save.',
    route: practicePath, prepare: (c) => selectPin(c),
    done: (c) => c.snap.pins.some((p) => !!p.appearance.color || p.appearance.shape !== 'circle' || !!p.appearance.icon),
  },
  {
    id: 'image', chapter: 4, title: 'Use an image as the marker', target: 'pin-customize',
    body: 'Upload a PNG, JPEG or WebP (or use the sample image), then crop, reposition, fit and mask it. The image itself becomes the marker on the map.',
    task: 'Customize again → Upload image → choose a file or “Use a sample image” → Use this image → Save.',
    route: practicePath, prepare: (c) => selectPin(c),
    done: (c) => c.snap.pins.some((p) => !!p.appearance.imageId),
  },
  {
    id: 'image-marker', placement: 'corner', chapter: 4, title: 'The image is the marker', target: 'image-marker',
    body: 'There’s no ordinary marker underneath — the image sits exactly on the pin’s location, follows the map as you pan and zoom, and works like any other marker.',
    task: 'Click the image marker to open the pin.',
    route: practicePath, prepare: () => uiStore.set({ selectedPinId: null }),
    done: (c) => !!c.snap.pins.find((p) => p.id === c.ui.selectedPinId && p.appearance.imageId),
  },
  {
    id: 'image-manage', chapter: 4, title: 'Replace or remove images', target: 'pin-customize',
    body: 'In Customize you can replace or remove the image at any time. An image is only deleted when nothing (including shared copies) still uses it.',
  },
  {
    id: 'group-colors', chapter: 4, title: 'Group colors and your style', target: 'map-area',
    body: 'Group colors appear as small badges at the edge of a marker. They never override your custom color or replace an image.',
  },

  // ---------------------------------------------------------------- Chapter 6
  {
    id: 'friends', chapter: 5, title: 'Friends', target: 'account-menu',
    body: 'With an account you can find people by username, or share a friend link / QR code, and accept or decline requests (Settings → Friends). Being friends never gives anyone access to your maps — only an accepted collaboration invitation does. The tour never sends real requests.',
  },
  {
    id: 'open-demo', chapter: 5, title: 'Collaboration maps', target: 'open-demo-collab',
    body: 'Collaboration maps live under the Shared tab and are shared with people the owner invites. Here you can explore a local demo — sample members, nothing is sent anywhere.',
    task: 'Open the demo collaboration map.',
    route: () => '/collab', prepare: panels,
    done: (c) => c.path === '/collab/demo',
  },
  {
    id: 'roles', chapter: 5, title: 'Owner, editor, viewer', target: 'demo-roles',
    body: 'Owners manage members and invitations; editors can share their own pins; viewers can only look. These rules are enforced by the server, not just the buttons.',
    task: 'Preview what a Viewer can do.',
    route: () => '/collab/demo', prepare: panels,
    done: (c) => !!c.q('[data-tour="demo-roles"] button[aria-pressed="true"]')?.textContent?.toLowerCase().includes('viewer'),
  },
  {
    id: 'share', chapter: 5, title: 'Share a copy, not the original', target: 'pin-share',
    body: 'Sharing picks a destination, shows exactly what will be shared (your note is off by default), then adds an independent copy. Your original pin, its groups and its map stay private.',
    task: 'Share one of your pins to the demo map.',
    route: practicePath, prepare: (c) => selectPin(c),
    done: (c) => c.snap.demo.shares.length > 0,
  },
  {
    id: 'revoke', chapter: 5, title: 'Removing collaborators', target: 'demo-members',
    body: 'Owners can change roles and remove members. A removed member loses access immediately — including to shared images.',
    task: 'Remove one of the sample members.',
    route: () => '/collab/demo', prepare: panels,
    done: (c) => c.snap.demo.members.length < 3,
  },
  {
    id: 'invite', chapter: 5, title: 'Invitations', target: 'demo-invite',
    body: 'With an account, owners create secure, expiring, revocable invitation links or QR codes, optionally for one specific friend. The recipient must sign in and explicitly accept. The demo never creates an invitation.',
  },

  // ---------------------------------------------------------------- Chapter 7
  {
    id: 'settings', chapter: 6, title: 'Settings', target: 'settings-nav',
    body: 'Settings has account and privacy controls (for signed-in users), map appearance, and lists of all your groups and pins.',
    route: () => '/settings/groups',
  },
  {
    id: 'map-style', chapter: 6, title: 'Map appearance', target: 'settings-nav',
    body: 'Choose the basemap style that suits you.',
    task: 'Pick a different map style.',
    route: () => '/settings/appearance',
    done: (c, b) => c.snap.prefs.mapStyle !== b.snap.prefs.mapStyle,
  },
  {
    id: 'guest-data', chapter: 6, title: 'Guest data', target: 'settings-nav',
    body: 'As a guest, your data stays in this browser. Guest data lets you download a copy or reset everything. After signing in you can choose to import guest maps into your account — that never happens automatically and never overwrites account data.',
    route: () => '/settings/guest',
  },
  {
    id: 'account', chapter: 6, title: 'Signing in and out', target: 'account-menu',
    body: 'Sign in for friends, real collaboration and maps that follow you across devices. Signing out returns you to the guest workspace on this device; your account data isn’t shown.',
    route: () => '/',
  },
  {
    id: 'finish', chapter: 6, title: 'You’re ready', target: 'help-button',
    body: 'That’s the tour. Restart it or jump to any chapter from Help at any time. When you finish, the practice sandbox is cleared and you’re back in your own workspace.',
  },
];

export function firstStepOfChapter(chapter: number): number {
  const i = STEPS.findIndex((s) => s.chapter === chapter);
  return i < 0 ? 0 : i;
}
