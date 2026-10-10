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

Use a grayscale foundation with restrained accents. Keep the map
dominant. Use reusable UI primitives, consistent spacing, subtle
borders/shadows, restrained animation, visible focus, keyboard access,
labels for icon-only controls, adequate contrast, correct dialog focus
handling, Escape support where appropriate, screen-reader-friendly
status/errors, and reduced-motion support.

The "Welcome to Atlas" fade-in/fade-out lasts approximately 1--1.5
seconds on initial load/refresh only. It must not block auth, data
fetching, or map initialization, and should respect reduced-motion
preferences.

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
