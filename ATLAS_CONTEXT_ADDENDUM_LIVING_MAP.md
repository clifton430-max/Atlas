> **Merged (2026-10-10):** these requirements are now part of ATLAS_CONTEXT.md (section "Living map and rich discovery"); current status is in docs/IMPLEMENTATION_STATUS.md. This file is kept as the original source.

# Atlas --- Project Context Addendum: Living Map & Rich Discovery

This document supplements `ATLAS_CONTEXT.md`; it does not replace
existing architecture or security requirements.

## Product vision

Atlas should feel like a lively, interactive map of the real world
rather than a static map with ordinary markers. The map remains the
primary interface. Places, venues, events, parks, attractions, and saved
pins should be discoverable through expressive markers, rich previews,
smooth transitions, and optional ambient animation without making the
interface cluttered, slow, inaccurate, or difficult to use.

## Interactive markers and place previews

-   Make all supported Discover markers interactive, not only
    Ticketmaster event markers.
-   On hover or keyboard focus, smoothly reveal a compact preview with
    name, category, thumbnail when available, and distance from the user
    when accurately calculable.
-   Clicking opens a richer detail view with all relevant verified data
    available: description, address, image(s), event/venue information,
    start/end times, timezone, price range/currency, official
    ticket/source link, and attribution.
-   Never fabricate missing fields. Unknown information remains unknown.
-   At the bottom of details, provide an action to save/pin the item to
    an authorized personal or collaboration map.
-   After selecting a destination, open the save flow. Require group
    selection when required by the existing product rules, and let users
    specify whether they are going/attending when applicable.
-   Guest users save to a clearly labeled local workspace.
    Account-backed maps and collaboration require appropriate
    authorization.
-   Hover must not be the only interaction; support click, keyboard
    focus, and accessible controls.

## A more alive map

-   When a place is selected, visually emphasize its marker and
    surrounding area.
-   Where the map style provides verified building footprints/heights,
    consider a restrained animated extrusion, lift, glow, or scale
    effect.
-   Explore contextual ambience: subtle trees/people/picnic effects in
    parks, tasteful lighting at suitable night-time locations, sparse
    cars following road geometry, occasional trains following rail
    geometry, and a few walking figures along suitable paths.
-   Do not invent geography or imply stylized decoration is accurate
    real-world data.
-   Inspect map style, data availability, licensing, and rendering
    capabilities before implementation. If reliable geometry is
    unavailable, use a restrained marker/area highlight or document the
    dependency.
-   Ambient effects must be subtle, optional, and performance-aware.
    Provide a way to disable them, respect `prefers-reduced-motion`, and
    pause/reduce them when the tab is hidden or the map is not visible.
-   Never let effects block panning, zooming, selection, labels, pins,
    or controls.

## More useful Discover

-   Add category navigation/dropdowns for available categories such as
    Food & Drink, Events, Things to Do/Pastimes, Parks & Outdoors,
    Scenic Views, Tourist Attractions, Arts & Culture, and Sports.
-   Selecting a category should show meaningful subcategories and a
    structured results view/list while keeping the map context
    accessible.
-   Add a prominent Hide All control and a simple way to restore all
    categories or show only selected categories.
-   Hide All affects Discover overlays only; it must not delete data or
    unintentionally affect private/collaboration pins.
-   Visually distinguish categories and event types using consistent
    colors plus recognizable icons/symbols. Color must never be the only
    identifier.
-   Keep Discover, Personal Map, and Collaboration Map query/filter
    state separate.
-   Preserve map viewport and avoid unnecessary provider requests when
    categories change.

## Images and points of interest

-   Show a thumbnail on hover/focus and richer images in details when
    trustworthy images are available.
-   Use images from legitimate sources that explicitly associate them
    with the selected place/event. Respect attribution, licensing,
    terms, rate limits, and caching requirements.
-   Support popular tourist attractions and scenic viewpoints as
    dedicated POI markers when reliable coordinates exist.
-   For parks, stadiums, restaurants, museums, and other larger venues,
    show known internal points of interest in the parent detail view
    when trustworthy data supports the relationship.
-   POI entries should include name, short description, image when
    available, and distance when calculable. A POI with verified
    coordinates can have its own selectable marker.
-   Avoid duplicate/confusing parent and child markers. If no
    trustworthy image/POI data exists, show an honest unavailable state
    instead of inventing content.

## Existing Atlas invariants

-   Preserve React, TypeScript, Vite, Tailwind, the current map library,
    Supabase Auth/Postgres/RLS/Storage/Edge Functions, and the modular
    Ticketmaster provider unless a concrete reason requires a change.
-   Never expose secret API keys in client bundles.
-   Never fabricate events, photos, prices, hours, coordinates,
    distances, API results, or successful operations.
-   Display distance only when geolocation permission is granted or a
    valid reference location is selected. State whether distance is
    straight-line or route distance; do not mislabel it.
-   Private maps, notes, group memberships, private images, and
    collaboration content remain protected by backend authorization.
-   Friendship does not grant map access. Collaboration uses explicit
    authorized shared representations.
-   Guest data stays separate from account-backed data.
-   Uploaded pin images remain actual interactive markers, anchored to
    their coordinates, using existing secure Storage rules.
-   Preserve existing group-filter semantics, mandatory group selection
    where specified, and all working features.
-   Every visible control must work as advertised.
-   Keep Atlas desktop-first and accessible: keyboard navigation,
    visible focus, screen-reader labels, contrast, reduced motion, and
    loading/error/empty states.

## Implementation priorities

1.  Correctness and real data.
2.  Privacy and security.
3.  Useful discovery and responsive marker interactions.
4.  Readability and accessibility.
5.  Tasteful visual richness.
6.  Performance and graceful fallback.

Keep event, venue/place, point-of-interest, and user-owned pin models
distinct. Use typed provider adapters and responsible caching. Inspect
the actual map style/data before attempting 3D buildings, road/rail
animation, or venue imagery.

## Known external dependencies

Earlier project notes reported Ticketmaster requests returning HTTP 401
due to a rejected key and public email flows requiring SMTP setup.
Recheck current status before claiming these are resolved. Never print
or request secret values in chat.

## Acceptance definition

The map feels more alive because interaction, previews, categories,
imagery, selected-place emphasis, and optional ambience make exploration
clearer and more rewarding---not because it is overloaded with
animation. Information remains accurate, private data stays protected,
and the app remains responsive and accessible.
