> **Merged (2026-10-10):** these requirements are now part of ATLAS_DEV_NOTES.md (Phase 11); current status is in docs/IMPLEMENTATION_STATUS.md. This file is kept as the original source.

# Atlas --- Developer Notes Addendum: Living Map, Interactive Places & Discovery

This addendum extends the existing `ATLAS_DEV_NOTES.md`. Preserve its
requirements, current implementation, tests, and security rules. Inspect
the repository before coding; implement incrementally and do not rewrite
working systems without a demonstrated reason.

## 1. Audit and baseline

-   [ ] Read `ATLAS_CONTEXT.md`, `ATLAS_DEV_NOTES.md`,
    `docs/IMPLEMENTATION_STATUS.md`, and `README.md`.
-   [ ] Inspect current map library/style, event markers, venue/place
    data sources, search, filters, details, save flow, guest workspace,
    and tests.
-   [ ] Record existing behavior, failures, available provider data, API
    limits/licensing, and performance baseline.
-   [ ] Separate features possible with existing data from features
    needing another provider or map-style capability.
-   [ ] Inspect environment configuration without exposing secrets.
-   [ ] Track each requirement as complete/verified,
    implemented/unverified, partial, externally blocked, or not
    implemented.

## 2. Interactive markers

### Hover/focus preview

-   [ ] Make all supported public Discover markers interactive, not only
    Ticketmaster events.
-   [ ] On hover or keyboard focus, smoothly show name, category,
    thumbnail when available, and distance when accurately calculable.
-   [ ] Prevent preview clipping and hover flicker; keep the preview
    usable where appropriate.
-   [ ] Support click and keyboard activation; hover must not be
    required.
-   [ ] Respect reduced-motion settings and handle missing images,
    coordinates, or user location gracefully.
-   [ ] Avoid repeated provider requests on pointer movement.

### Click details

-   [ ] Open a rich detail panel with trustworthy available fields:
    description, category, address, venue, images, coordinates,
    distance, event start/end, timezone, price range/currency, official
    ticket URL, and source attribution.
-   [ ] Keep unknown fields unknown; do not conflate event time with
    venue opening hours.
-   [ ] Validate external URLs and use safe link behavior.
-   [ ] Preserve selection/map viewport when practical.
-   [ ] Ensure keyboard and assistive-technology access.

### Save flow

-   [ ] Offer only personal maps and collaboration maps where the user
    is authorized to edit.
-   [ ] After destination selection, open the pin-save flow.
-   [ ] Enforce existing group-selection requirements.
-   [ ] Let users specify going/attending where applicable.
-   [ ] Prevent duplicate submissions and report success only after
    persistence succeeds.
-   [ ] Guests save to local guest data only; never silently write guest
    content to Supabase.
-   [ ] Explain account requirements without losing the current context.

## 3. Selected-place emphasis

-   [ ] Emphasize the selected marker and nearby area.
-   [ ] Inspect whether the current style provides building footprints,
    heights, 3D extrusions, park geometry, or other relevant features.
-   [ ] Where verified geometry exists, add a restrained temporary lift,
    scale, glow, or extrusion effect.
-   [ ] Keep labels, routes, markers, and controls readable.
-   [ ] Do not invent footprints. If unsupported, implement a tasteful
    marker/area highlight and document the limitation.

## 4. Optional ambient animation

-   [ ] Evaluate sparse cars following real road geometry, occasional
    trains following mapped rail geometry, and a few people on suitable
    mapped paths.
-   [ ] Evaluate contextual park ambience (trees, walking figures,
    picnic scenes) and subtle lighting for suitable night-time styles.
-   [ ] Use only geographically defensible data or clearly stylized
    decoration that cannot be mistaken for verified geography.
-   [ ] Keep effects sparse and secondary to map interaction.
-   [ ] Add a setting to disable ambience; respect
    `prefers-reduced-motion`.
-   [ ] Pause/reduce animation when the tab is hidden, the map is not
    visible, or performance is poor.
-   [ ] Verify effects do not interfere with panning, zooming, marker
    selection, labels, routes, or controls.
-   [ ] Measure performance and remove effects that cause responsiveness
    problems.
-   [ ] Document data, style, licensing, or provider dependencies.

## 5. Category-based Discover

-   [ ] Add clear category navigation/dropdowns for supported categories
    such as Food & Drink, Events, Things to Do/Pastimes, Parks &
    Outdoors, Scenic Views, Tourist Attractions, Arts & Culture, and
    Sports.
-   [ ] Provide useful subcategories and a structured result list/cards.
-   [ ] Keep the map visible or easy to return to.
-   [ ] Keep category results and map markers synchronized.
-   [ ] Distinguish unsupported categories from categories with no
    results.
-   [ ] Preserve viewport and avoid unnecessary refetching.
-   [ ] Use real provider data; do not fabricate places.
-   [ ] Keep Discover state isolated from Personal and Collaboration map
    state.

## 6. Hide All and category visibility

-   [ ] Add a visible Hide All control in Discover.
-   [ ] Hide All changes visible Discover overlays only; it does not
    delete data or unintentionally hide unrelated personal/collaboration
    pins.
-   [ ] Provide an easy restore-all control.
-   [ ] Allow multiple selected categories.
-   [ ] Make state obvious and accessible using icons/labels as well as
    color.
-   [ ] Define/test interactions with search, price, and time filters.
-   [ ] Ensure map-context switches do not leak filter state.

## 7. Visual design

-   [ ] Improve Discover hierarchy, spacing, typography, markers,
    previews, and result cards without obscuring the map.
-   [ ] Assign consistent restrained colors to categories/event types.
-   [ ] Pair colors with icons or symbols; never rely on color alone.
-   [ ] Add hover, focus, selected, loading, missing-image, and error
    states.
-   [ ] Do not let category styling override user-customized pin colors
    or image markers.
-   [ ] Maintain contrast, visible focus, and the map-first desktop
    layout.

## 8. Images and points of interest

-   [ ] Show trustworthy image thumbnails on hover/focus and richer
    images/galleries in details when available.
-   [ ] Respect attribution, usage rights, caching, rate limits, and
    provider terms.
-   [ ] Add tourist attractions and scenic viewpoints as POI markers
    only when reliable data and coordinates exist.
-   [ ] Show known POIs within parks, stadiums, museums, restaurants,
    and other venues when a trustworthy source supports the
    relationship.
-   [ ] POIs should have a name, description, image when available, and
    distance when calculable.
-   [ ] Clicking a POI opens its details and can highlight its verified
    map location.
-   [ ] Avoid duplicate/confusing parent and child markers.
-   [ ] If a new photo/POI provider is needed, document its API, key
    placement, cost, terms, rate limits, and fallback before
    integration.
-   [ ] Never invent photos, attractions, coordinates, or distances.

## 9. Distance behavior

-   [ ] Show distance only when user location permission is granted or a
    valid reference location is selected.
-   [ ] State whether distance is straight-line or route distance.
-   [ ] Never label straight-line distance as walking/driving distance.
-   [ ] Handle denied, unavailable, or stale location gracefully.
-   [ ] Avoid requesting geolocation repeatedly on hover.
-   [ ] Keep precise location local unless the user explicitly chooses a
    feature that requires sending it to a service.

## 10. Performance and data architecture

-   [ ] Keep event, venue/place, POI, and user-owned pin models
    distinct.
-   [ ] Use typed provider adapters rather than provider-specific UI
    coupling.
-   [ ] Fetch by visible bounds and relevant filters where supported.
-   [ ] Debounce search and cache responsibly.
-   [ ] Avoid fetching images/details repeatedly on hover.
-   [ ] Cancel/ignore stale requests and avoid excessive rerenders.
-   [ ] Use clustering at appropriate zoom levels.
-   [ ] Validate coordinates before marker rendering.
-   [ ] Measure bundle size, map responsiveness, and request volume.
-   [ ] Keep secret API keys out of browser code and logs.

## 11. Preserve security and existing features

-   [ ] Discover never exposes private pins, notes, group memberships,
    personal maps, or unauthorized collaboration data.
-   [ ] Personal maps and custom pins remain private by default.
-   [ ] Friendship does not grant map access.
-   [ ] Collaboration destinations are writable only by authorized
    roles.
-   [ ] Shared representations do not bypass access control.
-   [ ] Image markers continue to use secure Storage.
-   [ ] Guest data remains local and separate from Supabase data.
-   [ ] Do not weaken RLS, Storage, invitation validation, or role
    enforcement.
-   [ ] Preserve group-filter semantics and pin-save requirements.
-   [ ] Ensure all controls work as advertised.

## 12. Required tests

-   [ ] Hover/focus preview and click details for supported marker
    types.
-   [ ] Missing images, missing coordinates, and unavailable location.
-   [ ] Accurate distance calculation and honest labeling.
-   [ ] Save to personal map and authorized collaboration map.
-   [ ] Role checks, group selection, and attendance state.
-   [ ] Guest saves remain local.
-   [ ] Category/subcategory selection and map/list synchronization.
-   [ ] Hide All, restore all, and multi-category filtering.
-   [ ] Category icons/colors do not override custom pins.
-   [ ] Parent venue and child POI navigation.
-   [ ] Selected-place emphasis and graceful style fallback.
-   [ ] Reduced motion and ambient animation setting.
-   [ ] Map remains usable with effects running.
-   [ ] No filter leakage between map contexts.
-   [ ] Existing privacy/security tests continue passing.

Keep live-provider tests separate when credentials are needed. A written
test is not proof it passed.

## 13. Implementation order

1.  Audit current implementation and provider capabilities.
2.  Improve shared marker interactions and preview/details.
3.  Complete save-to-map/group/attendance flow.
4.  Build category browsing, subcategories, Hide All, and category
    filters.
5.  Add trustworthy images and POI support through suitable providers.
6.  Add selected-place emphasis.
7.  Prototype ambient animation behind a setting and retain only
    performant, defensible effects.
8.  Finish accessibility, performance, and security review.
9.  Run regression and new tests.
10. Update docs and report external dependencies.

Prioritize features possible with existing reliable data before adding
paid or credentialed providers. Do not stop at a plan---implement as
much as can be completed safely.

## 14. Documentation and handoff

Update `ATLAS_CONTEXT.md`, `ATLAS_DEV_NOTES.md`,
`docs/IMPLEMENTATION_STATUS.md`, and `README.md` as appropriate.

For each requirement, label it Complete and verified, Implemented but
not fully verified, Partially implemented, Blocked by external
data/provider/configuration, or Not implemented.

The final report must state what changed and where, which provider
powers each feature, which effects use real geometry versus stylized
decoration, actual test commands/results, performance impact,
accessibility/security checks, external dependencies, and exact
remaining steps.

Never claim a photo, attraction, coordinate, distance, API result, or
test result is verified unless it actually is.
