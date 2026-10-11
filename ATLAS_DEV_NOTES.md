# Atlas --- Developer Notes

## 1. Start here

**Before changing code** - \[ \] Inspect the repository structure,
package manager, scripts, current routes, components, styles, and
existing tests. - \[ \] Identify existing working behavior and preserve
it. - \[ \] Inspect environment/configuration files without exposing
secret values. - \[ \] Record the current state and any known
failures. - \[ \] Create/update the architecture overview and
implementation checklist. - \[ \] Make a phase plan that matches the
sequence below.

Do not assume the repository is empty. Do not replace working code
without a clear reason.

## 2. Suggested architecture boundaries

Adapt names to the repository's conventions; do not force a rewrite
merely to match these examples.

-   `src/app/`: app shell, route configuration, providers, session
    boundaries.
-   `src/components/ui/`: reusable buttons, inputs, dialogs, popovers,
    cards, menus, notifications.
-   `src/features/discover/`: map landing view, event markers, event
    preview/details, Discover filters.
-   `src/features/maps/`: personal maps, collaboration maps, map state
    and viewport preservation.
-   `src/features/pins/`: saved-event pins, custom pins, appearance
    editor, image marker component.
-   `src/features/groups/`: group CRUD, membership, group-filter widget.
-   `src/features/search/`: debounced search, suggestions, context-aware
    results.
-   `src/features/friends/`: friend search, requests, friend QR/link.
-   `src/features/collaboration/`: members, roles, invitations, shared
    pin representations.
-   `src/features/settings/`: account, privacy, appearance, group, pin,
    and collaboration settings.
-   `src/lib/`: Supabase client, validation, shared types, utilities.
-   `src/services/`: typed event-provider interface and Ticketmaster
    adapter.
-   `supabase/migrations/`: schema, indexes, constraints, RLS and
    storage policies.
-   `supabase/functions/`: privileged workflows that should not trust
    client claims.
-   `tests/`: unit, integration, and end-to-end coverage.

Keep components small enough to reason about. Do not put the entire
application in one React component. Keep rendering, provider access,
database access, and authorization concerns separated.

## 3. Data model guidance

Use normalized tables or equivalent structures for: - Profiles. -
Normalized public events and provider/external event references. -
Personal maps. - Saved event pins. - Custom pins and private notes. -
Pin appearance and image references. - Groups and pin/group membership
joins. - Friend relationships and friend requests. - Collaboration maps
and members/roles. - Collaboration invitations. - Shared pin
representations. - Collaboration-specific permissions. - Notifications
if needed.

Use UUIDs where appropriate, timestamps, foreign keys, uniqueness
constraints, and indexes. Use explicit safe deletion behavior. Consider
geospatial indexes where supported.

Important invariants: - A saved event references the normalized public
event; it does not clone it. - A uniqueness constraint should prevent
duplicate saved-event pins for the same owner/map/event where the
product model requires uniqueness. - Group membership is a join
relationship; one pin may have several groups. - Collaboration pins are
shared representations, not pointers that bypass authorization. - Image
files live in Storage; PostgreSQL stores references and metadata, not
image bytes. - Do not trust client-provided owner IDs, roles, or
permission flags.

## 4. Security notes --- treat as release blockers

-   Enable RLS for private tables and write policies for
    owner/member/role boundaries.
-   Test direct database access as a user who should not have access,
    not only through the UI.
-   Keep private storage objects inaccessible to unauthorized users;
    verify download and replacement policies.
-   Validate invitation acceptance and membership changes server-side.
-   Store only hashes of invitation tokens where practical; enforce
    expiration, revocation, intended-recipient restrictions, and
    one-time/usage policy as designed.
-   A friend relationship must never grant map or pin access.
-   An authenticated user must not be able to add another user's private
    pin to their group.
-   Removed collaboration members must lose access promptly.
-   An editor/viewer must not gain owner-only permissions by
    manipulating requests.
-   Validate external ticket URLs before rendering/opening them.
-   Validate uploaded file type and size; handle failed upload/cleanup
    without deleting a file still referenced elsewhere.
-   Do not put secret API keys in client bundles. Use server-side
    secrets for privileged credentials.
-   Avoid unrestricted policies such as allowing all authenticated users
    to read/write every row.
-   Do not rely on hiding a UI control as an authorization mechanism.

## 5. Event provider and honest data

Define a provider interface before binding UI code directly to
Ticketmaster. Normalize provider responses into a stable internal event
type. Account for pagination, rate limits, incomplete fields, stale
data, duplicate records, missing images, and provider errors.

Keep these fields distinct when available: - Event start time. - Event
end time. - Venue opening time. - Venue closing time. - Venue/event
timezone. - Price minimum and maximum. - Currency. - Ticket URL and
source attribution.

Unknown data stays unknown. Never fabricate events, prices, hours,
coordinates, availability, or API results. If credentials are missing,
use conspicuously labeled development fixtures and ensure they cannot be
mistaken for live data. Document caching behavior and provider limits.

## 6. Map behavior and state

-   Use Mapbox GL JS or MapLibre GL JS, with a legitimate style/tile
    provider and environment-based tokens.
-   Preserve the viewport when opening/closing panels or applying
    filters where practical.
-   Query by visible geographic bounds and relevant filters; do not
    fetch the entire database on each map movement.
-   Cluster event markers when useful and ensure selection remains
    clear.
-   Keep Discover, Personal Map, and Collaboration Map query/state
    boundaries separate.
-   Debounce search and avoid unnecessary provider requests.
-   Ensure markers are placed at verified coordinates and remain
    anchored while panning/zooming.
-   Keep unknown or unavailable location data out of map markers rather
    than inventing coordinates.

### Group filtering contract

Implement as a derived view, not a mutation of data: - All Groups =
every pin in the current personal map. - One or more selected groups =
pins whose memberships overlap the selected group set (OR logic). -
Selecting any group clears All Groups. - Selecting another group
preserves prior selections. - Deselecting one group leaves other
selections active. - Deselecting the last selected group restores All
Groups. - Group filters never affect Discover or collaboration maps and
never alter membership. - On map switch, load the map's own groups and
pins; preserve per-map filter preferences where practical.

### Price/time filter contract

-   Price bands are \$0--\$5, \>\$5--\$10, \>\$10--\$30, and \>\$30.
-   Unknown is not free. If "include unknown prices" exists, make it
    explicit.
-   Use minimum verified price for filtering price ranges while
    retaining the full range in details.
-   Event start/end and venue opening/closing must remain separate
    fields and controls.
-   Support time intervals crossing midnight and evaluate in the
    event/venue local timezone.
-   Explicitly document unknown-value handling; do not imply missing
    data matches a filter.

## 7. Image-as-marker implementation

This is a critical acceptance requirement, not a cosmetic enhancement.

-   Build a reusable, typed custom-marker component compatible with the
    chosen map library.
-   The uploaded image itself must replace the visible default marker at
    the exact coordinates.
-   Do not render a default marker underneath the image marker.
-   The image marker must be clickable and open the same authorized
    details/actions as other markers.
-   Preserve aspect ratio, support mask/crop/fit/reposition, and scale
    sensibly with zoom.
-   Provide a restrained selection outline and accessible
    label/interaction behavior.
-   Keep image rendering separate from pin data and permission logic.
-   Store the file in Supabase Storage and metadata/reference in
    PostgreSQL.
-   Enforce private storage access. Validate MIME/type and size.
-   Handle loading, upload failure, replacement, missing file, and
    deletion.
-   Do not remove a stored image while any pin/shared representation
    still references it.
-   Group color updates must not flatten/replace uploaded images or
    override explicit custom colors. Use a subtle outline/badge for
    group identity.
-   A shared representation may preserve the image appearance only for
    authorized users; removing the representation must not delete the
    original.

## 8. UX and accessibility

-   Desktop-first, responsive down to phone width (panels become
    overlays; see ATLAS_CONTEXT.md → Map and interface redesign).
-   Top navigation: map switcher and Discover / My Maps / Shared tabs.
-   Left side panel (collapsible) follows the tab: discovery tools, your
    maps and groups, or collaboration maps, members and invitations.
-   Center: dominant interactive map with a bottom map toolbar.
-   Right inspector (collapsible): details of the selected event, place
    or pin, with its actions; the map legend when nothing is selected.
-   Settings access (rail, account menu) is distinct from map filters
    (side panel).
-   Avoid redundant navigation.
-   Provide loading, empty, and error states for asynchronous actions.
-   Prevent duplicate submissions and show success only after the
    operation succeeds.
-   Use keyboard-accessible controls, visible focus, proper labels,
    adequate contrast, dialog focus management, Escape handling,
    screen-reader announcements, and reduced-motion support.
-   Do not use color as the only signal for group selection or
    permissions.
-   Welcome animation appears on initial load/refresh only, lasts
    roughly 1--1.5 seconds, and must not block app initialization.

## 9. Recommended implementation sequence

> **Living-map addendum merged (Phase 11, 2026-10-10):** see Phase 11 below for per-item status; external blockers are Overpass availability from Supabase egress (contained POIs) and SMTP (email).
>
> **Status (2026-10-10, guest mode + tutorial session):** every item below was re-audited against
> the code and re-verified by automated tests (see docs/IMPLEMENTATION_STATUS.md for exact commands
> and counts).
>
> - **Ticketmaster:** live data is now verified through the deployed function. The earlier 401 was a
>   credential issue, resolved when the secret was replaced.
> - **Email:** delivery is still unverified, because no real mailbox was available and the project
>   still uses the rate-limited built-in mailer.
> - **New this session:** Guest Mode (Phase 9) and the interactive tutorial (Phase 10).
> - **Corrected this session:**
>   - Group icons were previously marked done without a UI; they are now implemented and verified live.
>   - Provider pagination was previously missing; it is now implemented and verified live.

### Phase 1 --- Foundation

-   [x] Inspect repo and record current state.
-   [x] Configure/confirm React, TypeScript, Vite, Tailwind, routing,
    design system, and map provider.
-   [x] Add welcome animation and environment setup.
-   [x] Document architecture and implementation plan.

### Phase 2 --- Authentication and database

-   [x] Supabase Auth, profiles, protected routes, session/error
    handling. _(verified live)_
-   [x] SQL migrations, constraints, indexes, RLS, and storage policies.
-   [x] Core event/map/pin/group types and services.
-   [x] Security tests for private data boundaries.

### Phase 3 --- Discover and search

-   [x] Ticketmaster adapter and normalized event format. _(verified live: real events via deployed function; up to 3 pages per viewport with honest "showing N of M")_
-   [x] Map markers/clustering, preview, detail view, source
    attribution.
-   [x] Context-aware search and suggestions.
-   [x] Category/price/time filters and unknown-data handling.

### Phase 4 --- Personal maps and groups

-   [x] Multiple private maps and CRUD. _(verified live)_
-   [x] Group CRUD, colors/icons, pin memberships. _(icons added this session; verified live and in guest mode)_
-   [x] Mandatory group assignment during save flow.
-   [x] Exact checkbox/OR filter behavior and per-map state.
-   [x] Persistence and safe group deletion.

### Phase 5 --- Pin customization

-   [x] Color, shape, icon, size, border, reset, live preview.
-   [x] Secure upload and image management. _(verified live)_
-   [x] Actual image markers with geographic anchoring and click
    behavior.
-   [x] Preserve group identity, custom styles, and shared image
    references.

### Phase 6 --- Friends and collaboration

-   [x] Friend requests and permitted profiles. _(verified live)_
-   [x] Collaboration maps, roles, and membership controls. _(verified live)_
-   [x] Explicit sharing and independent shared pin representations.
-   [x] Secure, revocable invitation links and functional QR codes.
-   [x] Native share where supported and Copy Link fallback.

### Phase 7 --- Settings and polish

-   [x] Account and privacy settings.
-   [x] Map/group/pin settings.
-   [x] Accessibility and responsive desktop layout.
-   [x] Loading/error/empty states and design refinement.

### Phase 8 --- Verification and delivery

-   [ ] Check all acceptance criteria. _(all verified, including live Ticketmaster data, except public email delivery — needs custom SMTP and a real mailbox; see docs/IMPLEMENTATION_STATUS.md)_
-   [x] Run tests and fix regressions caused by implementation.
-   [x] Verify RLS and private Storage access using unauthorized
    identities. _(PGlite and live project)_
-   [x] Verify image markers are actual interactive map markers.
-   [x] Verify group filter semantics exactly.
-   [x] Update README with setup, env, migrations, services, tests, and
    deployment.
-   [x] Report completed/partial/unimplemented features honestly.

### Phase 9 --- Guest Mode (added 2026-10-10)

-   [x] Atlas opens and is usable without signing in (no auth wall). _(fixture E2E)_
-   [x] Versioned, validated local workspace with atomic commits, corrupt-data backup, full-storage and no-storage handling. _(unit + E2E)_
-   [x] Guest maps, groups (colors and icons), pins, saving events, edit, move, customization, image markers, OR group filter, persistence, reset. _(E2E)_
-   [x] Account-required features explain the need for an account; local, clearly labelled demo collaboration; no faked success. _(E2E)_
-   [x] Guest data never reaches Supabase; signing in uploads nothing; sign-out returns to the guest workspace. _(live E2E with request auditing)_
-   [x] Explicit, insert-only import of guest data into an account. _(live E2E)_

### Phase 10 --- Interactive tutorial (added 2026-10-10)

-   [x] Reusable tour engine: spotlight on real controls, step counter and progress, Back/Next/Skip/Exit/Restart, verified "Try it yourself" tasks, panel preparation, missing-target fallback, focus management, Escape, live announcements, reduced motion, persisted progress. _(E2E)_
-   [x] 7 chapters / 47 steps covering every major feature, all reachable; runs in a disposable sandbox for guests and signed-in users. _(E2E + live E2E)_
-   [x] Entry points: first-visit offer and Help menu (start, restart, jump to chapter). _(E2E)_

### Phase 11 --- Living map, interactive places and discovery (merged from `ATLAS_DEV_NOTES_ADDENDUM_LIVING_MAP.md`, 2026-10-10)

Legend: [x] complete and verified · [~] implemented or partial (see note) · [ ] not implemented / blocked

**Audit and data sources**
-   [x] Inspected the map style and data:
    -   The OpenFreeMap vector tiles carry real OSM `poi`, `building` (with `render_height`), `transportation` (road/rail/path) and `park`/`landcover` layers.
    -   POI feature ids encode OSM ids (verified against the OSM API).
-   [x] Places come from basemap tiles (no extra requests). Details come from the OSM API; images from Wikimedia Commons (via Wikidata P18 / `wikimedia_commons`); contained POIs from Overpass.

**Interactive markers and details**
-   [x] Event and place markers are interactive. Hover and keyboard focus (results list) show a preview with name, category icon/label/color, event date, and distance when available. _(fixture E2E)_
-   [~] Preview thumbnails:
    -   Ticketmaster event images are shown when the listing has one.
    -   Place thumbnails are fetched once after a 350 ms dwell and then cached (react-query plus a server cache).
    -   Verified by design; the hover-thumbnail path is not covered by a live UI test.
-   [x] Rich details are built from verified fields only. "Not listed" and "Unavailable" are distinguished; hours are shown as listed and never conflated with event times; links are validated https. _(fixture + live E2E; ESB live data)_
-   [x] Save flow:
    -   Destination: personal maps plus owner/editor collaboration maps only (viewer maps are not offered).
    -   A group is required for personal maps; attendance (going/interested) for events.
    -   Duplicates are prevented, and success is reported only after the save persists.
    -   _(PGlite RLS tests, live API, live and fixture E2E)_
-   [x] Guests save locally only. Collaboration requires an account, and the explanation keeps the user's context. _(fixture E2E)_

**Selected-place emphasis**
-   [x] Halo on the selection (static under reduced motion). When the point lies in a real OSM building footprint, that footprint is highlighted. Nothing is drawn otherwise. _(fixture E2E with real tiles, ESB)_
-   [ ] 3D extrusion "lift" not implemented: the map is top-down with pitch disabled, so an extrusion would be invisible. Documented as a limitation.

**Ambient animation (optional)**
-   [x] Up to 8 cars on real major roads, 2 trains on real rail lines, and 6 walkers on mapped paths, using tile geometry. The motion is labelled decorative.
-   [x] A setting turns it off (Settings → Map appearance). It respects `prefers-reduced-motion`, pauses while the map moves, the tab is hidden, or below zoom 14, and switches itself off if frames are slow. _(fixture E2E)_
-   [x] Measured impact: average frame 16.6 ms either way; p95 frame 16.8 ms with ambience vs 16.7 ms without.
-   [~] Night-time warm glow at real nightlife and dining POIs. Darkness is approximated from longitude (UTC offset) and unit-tested; not E2E-verified at night.
-   [ ] Trees and picnic scenes not implemented: there is no geographically defensible data for them (would be invented decoration).

**Category Discover and Hide All**
-   [x] Category bar with 8 categories, subcategory dropdowns, "Show only", multi-select, and color plus icon plus label. _(fixture E2E, axe)_
-   [x] Structured results list synced with the map from the same features. Distinguishes "not supported by this style", "zoom in", and "no results".
-   [x] Hide all / Show all affect Discover overlays only. Personal pins are unaffected, and switching map contexts doesn't leak filters. _(fixture E2E)_
-   [x] Hiding Events disables the events request. Toggling place categories makes 0 provider requests (measured).
-   [~] Filter interactions:
    -   Defined: search keyword filters events and places; price and time filters apply to events only (places have no verified prices or event times).
    -   Places-plus-keyword is not separately E2E-tested.

**Images and POIs**
-   [x] Commons images are shown with author, license and file-page link; only Wikimedia-hosted files are accepted. _(unit + live: ESB public domain, Central Park CC BY-SA 2.0)_
-   [x] Attractions and viewpoints are individual POI markers with verified coordinates.
-   [~] "Inside this place" (Overpass containment):
    -   Worked live once (ESB, 6 POIs).
    -   Public Overpass instances now reject (406) or time out (504) requests from Supabase's egress, so it currently returns "couldn't be loaded".
    -   **External blocker**; fix by setting the `OVERPASS_URL` secret to a dedicated instance.

**Distance**
-   [x] Shown only after an explicit "Use my location", labelled straight-line, kept on the device. Denied, unavailable and stale states are handled. _(unit + fixture E2E)_

**Security and preservation**
-   [x] Migrations 0012 (attendance, `place_ref`, `save_place_pin`, `add_to_collab`) and 0013 (place-details cache):
    -   RLS untouched.
    -   The new RPCs are not executable by anon.
    -   `add_to_collab` re-checks the role on the server and takes event coordinates from `public.events`.
    -   _(PGlite + live API)_
-   [x] All prior suites still pass. Category styling never overrides custom pins or image markers.

### Phase 12 --- Map and interface redesign (added 2026-10-10)

Visual reference: editor-style UI over an isometric city (see
ATLAS_CONTEXT.md → Map and interface redesign). Rendering stays on
MapLibre (fill-extrusion, light, pitch, symbol layers) — **no new
rendering or animation dependency**.

**12.1 Design system and shell** — ✅ done
-   [x] Tokens: warm canvas, line, lime (CTA), brand green, selection blue; `Button variant="cta"`.
-   [x] Top nav: logo, map switcher (personal + collaboration maps, "New map…"), Discover / My Maps / Shared tabs, search, real notifications, icon help, avatar, lime Share (context-aware, honest).
-   [x] Icon rail (Explore, Your maps, Collaboration maps, Jump to filters, Friends, Settings, side-panel toggle).
-   [x] Side panel by context: `DiscoverPanel` (categories, filters, events and places in view), `MapsPanel` (maps, add pin, group filter, groups), `CollabPanel`.
-   [x] Inspector: views portal their selection card into it (`InspectorPortal`); empty state with a legend that separates real from decorative.
-   [x] Map toolbar: locate, 2D/3D, zoom out/in, reset orientation, map animations (on/off, pause, 0.5×/1×/2×), Layers popover. MapLibre's navigation buttons were removed in favour of it.
-   [x] Routes `/maps` (last-used map, remembered per workspace) and `/collab`.
-   [x] Popovers are portalled and viewport-clamped (they can't be clipped by scrolling panels); Tab order is preserved.
-   [x] Responsive overlays and wrapping (verified at 1440, 820 and 390 px wide).
-   [x] Tutorial targets and copy updated; all fixture and live E2E suites updated and passing.

**12.2 Markers and details** — ✅ done
-   [x] Teardrop category pins (rasterized once per style, color + glyph), tip exactly on the real coordinate (`icon-anchor: bottom` + `MARKER_TIP_PAD` offset), events and places alike. User-customized personal pins keep their own shapes/images.
-   [x] Selected state: selected event/place pin drawn larger and on top; blue ground ring + halo at the tip; real building footprint emphasis unchanged.
-   [x] Hover/focus preview restyled as a callout (thumbnail, name, category, distance, source) that flips/shifts near map edges and never intercepts clicks (`MapMarker interactive={false}`; also fixed for the selection halo).
-   [x] Inspector cards: inset photo, large title with bookmark, category, description, icon rows (address, distance, hours as listed, website), collapsible "More about this place", "Inside this place", OSM attribution. Close lives in the inspector header.
-   [x] Bug fixed during verification: toolbar zoom produced NaN when `duration: undefined` was passed to MapLibre.
-   [x] New `tests/e2e/redesign.spec.ts` (7 tests): shell/tabs/remembered map, inspector empty → selected → closed, pin tip/body hit-testing and selected size, place-card layout, toolbar, honest Share/Notifications, responsive overlays at 820/390 px.
**12.3 Discovery and filtering** — ✅ done
-   [x] Category pills (tinted icon, outline + tint + check badge when on; subcategory dropdown per pill; Hide all / Show all pill). Order follows the reference: Events, Food & Drink, Parks & Outdoors, Arts & Culture, Scenic Views, **Nightlife (new)**, Tourist Attractions, Things to Do, Sports.
-   [x] Nightlife = OSM `bar`, `pub`, `biergarten`, `nightclub`, `music_venue` (moved out of Food & Drink / Things to Do). Every OSM subclass now maps to exactly one category (unit-tested; fixed a pre-existing `water_park` duplicate). Saved subcategory picks that no longer exist are dropped on load.
-   [x] Filters: "Filters" (all event filters, active count) + Date / Price / Category / More filters dropdowns, each with an active badge and Clear. Filter semantics unchanged (`filters.ts`).
-   [x] Sort: Soonest / Nearest (only with a shared location) / Lowest price (unknown last, never free) / Name — reorders the lists only (`discover/sort.ts`, unit-tested).
-   [x] Lists: "Events near you" (with location) / "Events in view" with Ticketmaster thumbnails (category tile when there's no image), venue · type, date · price, lime distance chips; places with category tiles and distance chips. **Place thumbnails are not fetched per row** (that would mean one Commons lookup per result); the photo appears in the inspector.
-   [x] Map ↔ list sync unchanged: the same data drives both; hover/focus previews and selected highlight in both directions.
**12.4 Add to Map workflow** — ✅ done
-   [x] Inline "Add to map" section in the inspector for events and places (`pins/AddToMap.tsx`), replacing the save dialog: Personal Map / Collaboration Map toggle, Select map (defaults to the map chosen in the map switcher), Select group(s) with "Create new group", attendance for events, collaboration review, lime "Add to map", inline success status + toast, inline errors.
-   [x] The bookmark icon next to the title scrolls to the form and focuses the map selector; it shows a filled/"Saved" state once the item is on a map.
-   [x] Rules unchanged and still enforced server-side: group required for personal maps; re-adding updates (button reads "Update on map") and never duplicates (live test asserts exactly one pin row); only owner/editor collaboration maps are offered (live test: a viewer-only map is absent) and `add_to_collab` re-checks the role; guests and the tutorial sandbox see why collaboration is unavailable (no fake success).
-   [x] Pending new groups are only created when Add to map is pressed (unchanged `GroupPicker` behaviour).
**12.5 Geographic visual upgrade** — ✅ done (`map/cityStyle.ts`, applied in the style transform)
-   [x] 3D city by default: tilted (pitch 50°, bearing −20°) view with OSM building footprints extruded to `render_height` / `render_min_height` (OpenMapTiles estimates from levels or a default when no height is mapped). 2D toggle in the toolbar/Layers, persisted (`atlas.view.v1`). Right-drag/Ctrl-drag rotates and tilts.
-   [x] Warm illustrated palette for the default Light (Positron) style: warm ground, green parks, blue water, white streets, warm casings. Bright/Liberty keep their own colours but get the same 3D buildings (Liberty's own extrusion is replaced, never doubled) and trees.
-   [x] Real green areas: Positron doesn't draw OpenMapTiles `landcover` grass (city parks such as Central Park) — they're now drawn green.
-   [x] Decorative facade colours (height band × feature id; glass blues for towers) and decorative tree canopies (fill pattern) **only inside mapped parks, gardens, nature reserves and woods**, under water and roads. Both are labelled "Decorative" in the legend and Layers panel; trees can be turned off (`atlas.trees.v1`).
-   [x] Selected building: in 3D the real extrusion of the footprint under the selected place is tinted (feature-id match, no extra geometry); 2D keeps the outline glow.
-   [x] Markers and labels stay above extrusions (extrusions are inserted below the first symbol layer; our marker layers come later).
-   [x] Tests: 7 unit tests for the transform (layer order, real-height expressions, tree filters, 2D/trees-off, Liberty de-duplication, warm palette only on Positron, selected highlight) and an E2E test asserting every rendered extrusion is a `building` tile feature with a numeric height, every tree polygon is a park/garden/wood, and the 2D/trees toggles work.
**12.6 Ambient animations** — ✅ done
-   [x] Ambient life now runs in every map context (mounted in the shell), not just Discover.
-   [x] Vehicles are low 3D boxes (fill-extrusion), oriented along their real road/rail/path segment (`poseAt`, `boxAround`, unit-tested), so buildings hide them correctly. They are exaggerated to about 14 px so they stay visible. Cars are on roads, trains on surface rail, walkers on footpaths (including park paths: the "park activity").
-   [x] "Map animations" pill: on/off (the same preference as Settings), pause/resume, and 0.5×/1×/2× speed (a simulated clock, so pausing freezes positions).
-   [x] Day/night lighting: Auto (approximate local solar time at the map centre, stated in the UI), Day, or Night (`atlas.lighting.v1`).
    -   Night adds a dusk tint over ground and buildings, a cool building light, and a static warm glow at real night-time venues from the tiles.
    -   Lighting is a colour change, so it also applies under reduced motion.
-   [x] Reduced motion: no moving vehicles. The pill explains why and its controls are disabled; lighting still works.
-   [x] Honesty: tooltip, legend and Settings say the motion is decorative and is not real-time traffic, transit or crowds. No live data source is implied.
-   [x] Performance guard and pause-while-moving/hidden behaviour unchanged. At most 16 agents in one source at about 15 fps.

### Phase 13 --- Master implementation: data integrity, collaboration, chess, collectibles, worlds (2026-10-10)

New migrations, all additive and all applied to the linked project:
`0014` pin source metadata · `0015` meetups, attendees, notifications, realtime ·
`0016` online chess · `0017` collectibles (catalog, versioned odds, inventory,
rolls, placements, map skins) · `0018` `crate_status` signed-in only.

New Edge Functions: `route` (OSRM proxy) and `chess-move` (move authority).
`place-details` now also extracts `email` and `wheelchair`, with a cache
version bump.

New dependencies (both lazy-loaded):
-   `chess.js@1.4.0` (BSD-2), a tested rules engine shared by client and server;
-   `three@0.186.1` (MIT), for 3D monuments in the map (custom layer) and in
    previews. The asset build script also uses its GLTFExporter.

**13.1 Bug fixes (Part 2)** — ✅
-   [x] **Nearest-first sorting.** It is now the default. It measures from your
    location (restored silently if permission was already granted, never
    prompted) or from the map centre, which is labelled. Denied, timeout and
    invalid coordinates are handled.
-   [x] **Details.** Phone, email and wheelchair access (as mapped on OSM) are
    shown in the main rows. "Official event schedule" is labelled. Meetups
    are separate.
-   [x] **Routing.** Walk and drive routes with real distance and ETA from OSRM,
    drawn on the map (dotted for walking). A labelled straight-line fallback
    is used when routing fails. Verified live.
-   [x] **Compass.**
    -   *Root cause:* the button reset to the 3D default bearing (−20°), not
        north, and its icon never reflected the bearing.
    -   *Fix:* the needle now rotates with the map and clicking turns the map
        to face north (tilt kept). Tested at −20°, 90° and 200°.
-   [x] **Copy URL.**
    -   *Root cause:* the Share menu copied the OSM URL as the place's link.
    -   *Fix:* Atlas link, official website and OpenStreetMap page are now
        separate, labelled actions; there is no substitution when a website is
        missing. Deep links open the same place, event or pin by stable id.
-   [x] **Discover tab.**
    -   A routing failure could not be reproduced: the tabs navigated correctly
        in no-backend mode, signed in, and at 1440, 820 and 390 px.
    -   *Root cause of "does nothing":* with the side panel collapsed (the
        default below 1024 px) only the map changed.
    -   *Fix:* every context tab and rail link now opens its panel.
-   [x] **Marker panels.**
    -   EventCard and PlaceCard were not keyed by selection, so internal state
        (failed image, expanded sections) leaked between selections. Fixed.
    -   Overlapping event and place pins both fired their click handlers;
        places now yield to the event drawn above.
-   [x] **Pin metadata.** A single normalizer covers Discover places, search
    hits (Photon OSM ids, enriched with place details), shared copies
    (`share_pin` copies `place_ref` and `source`) and guest pins. Edits never
    touch `source`.

**13.2 Collaboration (Part 3)** — ✅
-   [x] Creator attribution (initials avatar, a colour derived from the user id,
    since no profile photos exist), meetups, join/leave, capacity, schedule
    validation, upcoming/live/finished/cancelled states, guest-list privacy.
-   [x] Map labels with compact time and an avatar stack with "+N".
-   [x] Realtime: INSERT/UPDATE are filtered by map. DELETE events can't be
    filtered and carry only primary keys under RLS, so the client refetches
    only when the id belongs to its cache. The app resyncs after reconnecting.
-   [x] Notifications from triggers and RPCs, deduplicated by key and hidden
    after you lose access. Clicking one opens the pin, meetup or game.
-   [x] Live two-browser test: pin, meetup and attendance sync; delete sync;
    notifications; cameras stay independent.

**13.3 Chess (Part 4)** — ✅ local and online
-   [x] The Hall of Fame is matched by `osm:node/9209122821`. A separate,
    older Miami building with the same name exists, which is why name
    matching would be wrong.
-   [x] Full rules via chess.js: legal moves only, castling, en passant,
    promotion picker, check, mate, stalemate, insufficient material,
    threefold and fifty-move claims, resignation, draw agreement, SAN history.
    The board has keyboard play and is axe-clean.
-   [x] Local mode: board flip, persisted in the browser, works offline after
    load.
-   [x] Online mode: challenges between friends or collaborators, and the
    accept, decline, cancel, resign and draw-offer RPCs.
    -   Moves go only through `chess-move`, which replays the game server-side.
    -   `apply_chess_move` is service-role only and enforces turn order and
        `expectedPly`.
    -   Realtime sync; refresh resumes the game.
    -   Live tests cover the API and two browsers.

**13.4 Collectibles (Parts 5–7)** — ✅
-   [x] `open_crate()`, server-authoritative, in this order:
    1.  Per-user advisory lock.
    2.  Idempotency key.
    3.  Daily free rolls (3 per crate per UTC day).
    4.  CSPRNG draw (`gen_random_uuid` → `pg_strong_random`, rejection-sampled).
    5.  Rarity from the active versioned weights (basis points, validated to
        total exactly 10000).
    6.  A uniform pick within that rarity.
    7.  An empty pool blocks the roll.
    8.  The inventory is incremented and duplicates are flagged.
    -   Tests include exact rarity boundaries and a 40,000-draw uniformity
        check.
-   [x] Catalog: 18 monuments and 18 skins (3 per rarity). Monument coordinates
    and Q-ids were verified on Wikidata; 5 remembered ids were wrong and
    corrected. A test asserts the database catalog equals
    `catalog.data.json`.
-   [x] 3D pipeline: `scripts/models/*.mjs` builds original procedural
    miniatures with three.js and exports binary glTF to
    `public/models/monuments`.
    -   Meshes are merged per material (about one draw call per colour).
    -   The manifest records bytes, triangles, size and a hash for cache
        busting.
    -   Public-domain designs only.
-   [x] Reveal: the reward is decided before the animation. While slowing,
    the previews show only the awarded rarity, so there are no near misses.
    Skip, reduced motion and optional synthesized sound are supported.
    Effects are per rarity, with a stronger Mythic reveal.
-   [x] Collection: undiscovered silhouettes, rarity and region filters,
    completion and copies, an interactive viewer, "locate the real landmark".
    Thumbnails use one shared renderer (browsers cap WebGL contexts).
-   [x] Placement: choose or create a map, ghost preview, rotate, resize,
    confirm or cancel, reposition, remove (stays in the collection).
    -   Rendered by a MapLibre custom layer, with the transform folded into
        the projection on the CPU in double precision.
    -   The depth buffer is shared with the 3D buildings.
    -   Hit-testing for selection; context-loss and failed-load handling.
    -   Owner-only RLS, owned monuments only, 100 per map.

**13.5 Skins and worlds (Parts 8–9)** — ✅
-   [x] 18 skin themes change land, water, parks, woods, flat and 3D
    buildings, the road hierarchy, rail, boundaries, label colour, halo and
    font.
    -   Effects, all really rendered: generated textures, a graticule,
        a vignette.
    -   The theme applier records and restores exact originals.
-   [x] Preview (temporary, any map), equip (owned only, stored in
    `map_skins`), restore the default. Skins apply only to personal maps.
-   [x] World transition:
    -   The live style cross-fades (paint transitions, 650 ms) with a
        cartographic sweep.
    -   Low-power devices get a fade only; reduced motion gets no animation.
    -   The tab indicator glides, and pins reveal with a stagger.
    -   Personal maps remember their viewport, restored only when none of the
        map's content is on screen.
    -   An empty personal world shows actions.

## 10. Environment and setup documentation

Document required variables in `.env.example` without real secrets.
Exact variable names should match the chosen libraries/configuration.
Expect configuration for: - Supabase project URL. - Supabase public/anon
key. - Ticketmaster API key, ideally consumed through a protected
server-side layer if needed. - Map style/provider token when required. -
Any server-side-only credentials used by Edge Functions.

Explain which values are safe for the browser and which must remain
server-side. Document migration application, Supabase Storage
bucket/policies, local development, test commands, and deployment.

## 11. Verification and handoff

For every major phase: 1. Update the checklist and note what changed. 2.
Run relevant lint/typecheck/unit/integration/E2E commands available in
the repo. 3. Record actual command results, including failures or tests
not run. 4. Fix regressions and rerun checks. 5. Record unresolved risks
and next steps.

Before handoff, provide: - Concise implementation summary. - Exact run
commands. - Required environment variables and where they belong. -
Database migration/setup steps. - Actual test results. - Deployment
instructions. - Remaining work, clearly categorized as completed,
partial, or unimplemented.

Never claim that an external service is configured without credentials,
that a migration was applied unless verified, or that tests passed
unless they were run.
