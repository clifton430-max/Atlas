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

-   Desktop-first only; adapt to laptop/desktop browser widths.
-   Left panel: private maps and account-specific groups; collapsible.
-   Center: dominant interactive map.
-   Right panel: collaboration maps, members, invitations, shared pins
    and permitted controls; collapsible.
-   Settings access is distinct from the top-right map-filter control.
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

> **Status (2026-10-10):** see [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md)
> for per-feature verification status, test results and next steps. Items
> marked _pending_ are implemented but not yet exercised against a live
> Supabase project.

### Phase 1 --- Foundation

-   [x] Inspect repo and record current state.
-   [x] Configure/confirm React, TypeScript, Vite, Tailwind, routing,
    design system, and map provider.
-   [x] Add welcome animation and environment setup.
-   [x] Document architecture and implementation plan.

### Phase 2 --- Authentication and database

-   [x] Supabase Auth, profiles, protected routes, session/error
    handling. _(live-project verification pending)_
-   [x] SQL migrations, constraints, indexes, RLS, and storage policies.
-   [x] Core event/map/pin/group types and services.
-   [x] Security tests for private data boundaries.

### Phase 3 --- Discover and search

-   [x] Ticketmaster adapter and normalized event format. _(live API not yet called — no key)_
-   [x] Map markers/clustering, preview, detail view, source
    attribution.
-   [x] Context-aware search and suggestions.
-   [x] Category/price/time filters and unknown-data handling.

### Phase 4 --- Personal maps and groups

-   [x] Multiple private maps and CRUD. _(live-project verification pending)_
-   [x] Group CRUD, colors/icons, pin memberships. _(live-project verification pending)_
-   [x] Mandatory group assignment during save flow.
-   [x] Exact checkbox/OR filter behavior and per-map state.
-   [x] Persistence and safe group deletion.

### Phase 5 --- Pin customization

-   [x] Color, shape, icon, size, border, reset, live preview.
-   [x] Secure upload and image management. _(Storage API path pending live verification)_
-   [x] Actual image markers with geographic anchoring and click
    behavior.
-   [x] Preserve group identity, custom styles, and shared image
    references.

### Phase 6 --- Friends and collaboration

-   [x] Friend requests and permitted profiles. _(live-project verification pending)_
-   [x] Collaboration maps, roles, and membership controls. _(live-project verification pending)_
-   [x] Explicit sharing and independent shared pin representations.
-   [x] Secure, revocable invitation links and functional QR codes.
-   [x] Native share where supported and Copy Link fallback.

### Phase 7 --- Settings and polish

-   [x] Account and privacy settings.
-   [x] Map/group/pin settings.
-   [x] Accessibility and responsive desktop layout.
-   [x] Loading/error/empty states and design refinement.

### Phase 8 --- Verification and delivery

-   [ ] Check all acceptance criteria. _(blocked on a live Supabase project — see docs/IMPLEMENTATION_STATUS.md)_
-   [x] Run tests and fix regressions caused by implementation.
-   [x] Verify RLS and private Storage access using unauthorized
    identities. _(PGlite with stubbed auth/storage)_
-   [x] Verify image markers are actual interactive map markers.
-   [x] Verify group filter semantics exactly.
-   [x] Update README with setup, env, migrations, services, tests, and
    deployment.
-   [x] Report completed/partial/unimplemented features honestly.

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
