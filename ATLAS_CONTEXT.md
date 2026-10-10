# Atlas --- Project Context

## Product summary

Atlas is a premium, desktop-first full-stack web application for
discovering public events on an interactive map, saving events and
custom locations to private personal maps, organizing pins into groups,
and intentionally sharing selected pins through permission-based
collaboration.

The map is the primary interface. The product should feel modern,
minimal, polished, and map-first---not like a static dashboard mockup.

## Core user experiences

-   **Discover:** Browse authorized public events on an interactive map.
-   **My Map:** Create and manage multiple private maps containing saved
    events and custom location pins.
-   **Groups:** Organize pins into user-defined, color-coded
    collections; filter pins by one or more groups.
-   **Search:** Find events, venues, artists, categories, cities,
    addresses, and locations.
-   **Collaboration:** Create shared maps, invite specific users, and
    share selected pin representations.
-   **Profile and Settings:** Manage account, privacy, friends, map
    appearance, groups, pins, and collaboration permissions.

## Required technology

-   Frontend: React, TypeScript, Vite, Tailwind CSS, Lucide React, React
    Router (or equivalent), Mapbox GL JS or MapLibre GL JS, Framer
    Motion or CSS animation.
-   Backend: Supabase Auth, PostgreSQL, Row Level Security (RLS),
    Storage, and TypeScript Edge Functions where protected server-side
    processing is needed.
-   Event data: Ticketmaster Discovery API behind a modular provider
    interface.
-   Secrets and service credentials belong in environment variables;
    never expose secret keys in browser code.

Use the required stack unless a genuine technical limitation demands a
substitution. Explain any substitution before proceeding.

## Product and architecture invariants

1.  Keep public event records, user-owned saved event pins, private
    custom pins, personal maps, groups, collaboration maps, and shared
    pin representations distinct.
2.  Do not duplicate an event record just because multiple users save
    the same public event.
3.  A pin can belong to multiple groups without creating duplicate pins.
4.  Discover must never expose private pins, private notes, personal
    maps, group memberships, or nonpublic collaboration content.
5.  Personal maps and custom pins are private by default.
6.  Friendship, saving an event, group membership, and collaboration
    membership do not automatically grant unrelated access.
7.  Sharing a pin creates an authorized shared representation; it does
    not make the private original public.
8.  Removing a shared representation must not delete the private
    original or an image still in use.
9.  Enforce ownership and authorization in database policies, storage
    policies, and server-side operations---not only in the UI.
10. Never fabricate event listings, prices, hours, availability,
    coordinates, successful operations, or test results.
11. If API credentials are unavailable, clearly label sample data as
    development data.
12. The uploaded image in pin customization must become the actual
    interactive map marker, anchored to the pin's coordinates; it must
    not merely appear in a popup or alongside a default marker.
13. Build a desktop web application only. Adapt gracefully to desktop
    and laptop viewport sizes; do not build native mobile apps or
    mobile-only navigation.
14. All visible controls must perform their advertised actions.

## Map contexts

-   **Discover:** Public events authorized for discovery.
-   **Personal Map:** Pins in the authenticated user's selected personal
    map; all pins are shown by default.
-   **Collaboration Map:** Only content explicitly shared with the
    collaboration and authorized for the current member.

Keep these contexts isolated in UI state, queries, filtering, and
authorization.

## Group-filter behavior

-   "All Groups" is selected by default and shows every pin in the
    current personal map.
-   Selecting one group deselects "All Groups" and shows pins assigned
    to that group.
-   Selecting multiple groups uses **OR** semantics: show pins assigned
    to any selected group.
-   Selecting another group preserves other selected groups.
-   Deselecting a group removes only that group from the filter.
-   If the last selected group is deselected, return to "All Groups."
-   Group filters affect only the current personal-map view; they do not
    alter memberships or delete/move pins.
-   Preserve per-map filter preferences where practical.
-   Use checkboxes, not radio buttons, and provide a textual
    active-filter label.

## Save-to-map behavior

Saving an event or custom pin requires explicit group assignment. The
confirmation dialog should allow one or more existing groups, group
creation with a name and color, confirm, and cancel. Do not persist the
save before confirmation. If the event is already saved, update
memberships without creating a duplicate pin.

## Pin customization and image markers

Support color, shape (circle, square, rounded square, diamond, star),
icon, size, border/outline, and reset-to-default, with a live preview.
Preserve pin identity, coordinates, owner, event association,
memberships, and permissions when appearance changes.

Image upload must support file selection, preview, crop/reposition/fit,
mask, size, confirm/cancel, validation, loading/error states,
replacement, and safe deletion. Store image files in Supabase Storage
and references/metadata in PostgreSQL. Private image delivery must
respect permissions. Reuse images safely when multiple pin
representations reference them.

## Event data and filtering

Support event provider/external ID, name, description, image, category,
venue, address, coordinates, event start/end, venue opening/closing
hours, timezone, price/range and currency, ticket/source URLs, and
last-checked time when available.

Keep event start, event end, venue opening, and venue closing distinct.
Do not infer one from another. Unknown prices must not be treated as
free. Use nonoverlapping price bands: - \$0--\$5 - Greater than \$5
through \$10 - Greater than \$10 through \$30 - Greater than \$30

Category, price, and time filters must compose. Time ranges may cross
midnight and must use the event or venue's local timezone. Define how
missing values are handled; do not falsely claim an event matches a
filter when required data is unknown.

## Collaboration and friendship

-   Friendship supports requests and accepted/declined/revoked states;
    friendship grants no map access by itself.
-   Collaboration roles: Owner, Editor, Viewer, with owner-only controls
    enforced server-side.
-   Sharing a pin requires choosing a destination, reviewing what will
    be shared, and confirming.
-   Invitation URLs and QR codes must resolve to real flows, use secure
    revocable tokens, support expiration and recipient restrictions
    where practical, and require explicit acceptance.
-   Use native sharing where supported and provide a working Copy Link
    fallback.

## Design and accessibility

Use a light, warm-neutral editor-style interface (white panels on a
warm canvas) with restrained accents: lime for primary calls to action
(Share, Add to map), green for brand/active navigation, blue for
selection. Keep the map dominant. Use reusable UI primitives, consistent spacing, subtle
borders/shadows, restrained animation, visible focus, keyboard access,
labels for icon-only controls, adequate contrast, correct dialog focus
handling, Escape support where appropriate, screen-reader-friendly
status/errors, and reduced-motion support.

The "Welcome to Atlas" fade-in/fade-out lasts approximately 1--1.5
seconds on initial load/refresh only. It must not block auth, data
fetching, or map initialization, and should respect reduced-motion
preferences.

## Guest Mode and the interactive tutorial

Atlas is usable without an account. Personal data lives in one of three
workspaces, selected automatically and shown by a badge in the left panel:

| Workspace | When | Where data lives |
|---|---|---|
| Account | Signed in | Supabase (RLS-protected), private to the account |
| Guest | Not signed in | This browser only (`localStorage`, versioned and validated) |
| Tutorial sandbox | While the interactive tour runs | This browser, discarded when the tour ends |

-   **Fully functional for guests (local):** maps, groups (colors and
    icons), pins, saving events, editing, moving, customization, image
    markers, group filtering, map style, export and reset.
-   **Public features (no account, when the service is available):**
    Discover, live events, search, filters and place search.
-   **Account-required:** friends, real collaboration maps and
    invitations, and account/privacy settings. Guests get a clear
    explanation and a local, clearly labelled **demo** collaboration map.
    Nothing is sent, and no success is faked.
-   Guest data never reaches Supabase. After signing in, it can be copied
    into the account only through the explicit **Import guest data**
    action. Import only inserts data and never overwrites account data.
-   **The interactive tour** has 7 chapters that run in the real UI. Its
    "Try it yourself" tasks are verified against real app state. It is
    offered on the first visit and can be started, resumed or restarted
    from **Help**. It runs in the disposable sandbox, so it never changes
    account or guest data.

## Living map and rich discovery (merged from `ATLAS_CONTEXT_ADDENDUM_LIVING_MAP.md`)

Atlas should feel like a lively, interactive map of the real world without
becoming cluttered, slow or inaccurate. Every invariant above still applies.
In particular, nothing is fabricated: events, places, photos, coordinates,
distances, attendance and provider results are all real or explicitly unknown.

**Interactive markers and details.**
-   Every supported Discover marker (events and places) shows a compact
    preview on hover *or* keyboard focus: name, category (icon, label and
    color), a trustworthy thumbnail when one exists, and distance when it can
    be calculated.
-   Click or press Enter to open rich details with verified fields only.
-   Details end with **Save to a map…**. The destination is one of your
    personal maps, or a collaboration map where you are owner or editor. A
    group is required for personal maps, and events can record attendance
    (*going* / *interested*). Guests save to their local workspace.

**Categories.**
-   Discover has category navigation: Events, Food & Drink, Things to Do,
    Parks & Outdoors, Scenic Views, Tourist Attractions, Arts & Culture and
    Sports. Each category has subcategories and a structured results list kept
    in sync with the map.
-   Several categories can be shown at once.
-   **Hide all / Show all** affects Discover overlays only. It never deletes
    data or touches personal or collaboration pins.
-   Event types are color-coded only where Ticketmaster supplies a segment.
    Color is always paired with an icon and a label.

**Places and imagery.**
-   Points of interest are real OpenStreetMap features from the basemap's
    vector tiles.
-   Extra details come from the OSM API, and photos come only from Wikimedia
    Commons files explicitly linked to the place, shown with author and
    license.
-   Points of interest inside a parent place (parks, stadiums, museums…) come
    from OSM area containment.
-   When any of these are unavailable, the UI says so.

**Distance.**
-   Distance appears only after the user clicks "Use my location".
-   It is always labelled **straight line**, never as walking or driving.
-   The location stays on the device.

**A more alive map.**
-   The selected item gets a halo. When it sits inside a real OSM building
    footprint, that footprint is highlighted. Footprints are never invented.
-   Optional ambient life (Settings → Map appearance) moves a few dots along
    real road, rail and path geometry, and adds a warm glow at real nightlife
    venues after dark. It is explicitly decorative, not real-time traffic.
-   Ambient life is off under reduced motion, pauses when the tab is hidden or
    the map moves, and switches itself off if performance drops.
-   Model separation is preserved: events, places/POIs, user-owned pins and
    shared representations remain distinct.

## Map and interface redesign (2026-10-10)

The visual reference is an editor-style ("Rive-like") layout over an
illustrated isometric city. Atlas implements that layout around the
real, interactive map — the illustration is a style target, never an
image overlaid as a fake map.

-   **Shell:** top navigation (logo, map switcher, Discover / My Maps /
    Shared tabs, global search, notifications, help, account, lime
    Share) · left icon rail · collapsible side panel whose content
    follows the tab · central map with a bottom toolbar (locate, 2D/3D,
    zoom, reset orientation, map animations, layers) · collapsible right
    inspector that shows whatever is selected, or the map legend.
-   **Tabs = map contexts.** Discover (`/`), My Maps (`/maps` → last
    used map), Shared (`/collab`). The isolation rules in "Map
    contexts" are unchanged.
-   **Real vs decorative must stay distinguishable.** Roads, water,
    parks, building footprints/heights and places come from
    OpenStreetMap; events from Ticketmaster. Building colours, tree
    symbols inside mapped parks/woods, vehicles and walkers are
    decorative and are labelled as such in the legend. Nothing is ever
    placed where the data doesn't put it.
-   **Notifications** show only real items (pending collaboration
    invitations, incoming friend requests). **Share** offers only what
    works in the current context: public source links on Discover; an
    explanation that personal maps are private; invitations for
    collaboration-map owners (re-checked by the database).
-   **Lighting and motion:** day/night lighting (Auto by approximate
    local time, or forced) is a colour change; ambient vehicles/walkers
    are decorative motion on real geometry, pausable, speed-adjustable,
    and off under reduced motion.
-   **Responsive:** below 1280 px the inspector overlays the map; below
    1024 px the side panel does too; below 768 px the icon rail is
    replaced by a floating toggle and the tabs wrap to a second row.

## Development process

Inspect the repository and available tools before editing. Preserve
working code and conventions. Write useful comments for major files,
types, business logic, database relationships, API integrations, map
behavior, filters, uploads, authentication, authorization, privacy, and
collaboration. Avoid comments that merely restate obvious code.

Implement incrementally in dependency order. Keep a checklist in project
documentation. After each phase, record status, run relevant checks, fix
regressions, and document remaining work. Maintain a README with
architecture, setup, environment variables, migrations, service
configuration, testing, and deployment.

## Acceptance baseline

The application is not complete until the key Discover, search/filter,
personal maps, group semantics, image-as-marker,
friendship/collaboration, persistence, RLS/storage security,
accessibility, and desktop-layout criteria have been checked. Report
each feature as completed, partial, or unimplemented based on actual
verification.
