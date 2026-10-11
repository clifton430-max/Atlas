# Atlas

Atlas is a desktop-first, map-first web app. You can discover public events on an interactive map, save events and custom places to **private** personal maps, organize pins into color-coded groups, and share selected pins on purpose through permission-based collaboration maps.

- **Product spec:** [ATLAS_CONTEXT.md](ATLAS_CONTEXT.md)
- **Engineering notes:** [ATLAS_DEV_NOTES.md](ATLAS_DEV_NOTES.md)
- **Status:** the implementation checklist and verification status are in [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md)

> **Current state (2026-10-10):** Atlas works without an account (**Guest Mode**, data stored on this device) and includes an **interactive tutorial**. Signed in, it runs against the linked Supabase project. Ticketmaster live data is verified through the deployed Edge Function. The one remaining external blocker is public email delivery, which needs custom SMTP. See [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md).

## Collaboration, chess and collectibles (2026-10-10)

- **Meetups and live collaboration:**
  - Members of a collaboration map can plan meetups at any shared pin. Meetups have a time window and time zone, an optional description, optional capacity, and a choice of who sees the guest list. Members join or leave; the organiser or map owner can edit, reschedule or cancel.
  - Map labels show times ("Tonight 7:30 PM") with attendee avatars.
  - Pins, meetups and attendance sync live between members over Supabase Realtime. Each member's camera stays their own.
  - Notifications are in-app and server-generated, with duplicates suppressed.
- **Chess at the World Chess Hall of Fame:**
  - The room is matched by OSM id `node/9209122821`, not by name.
  - Local two-player games are stored in the browser and work offline.
  - Online games are between friends or collaborators. The server is the authority on every move.
- **Treasure:** free daily Monument Crates and Map Skin Crates, with no purchases and no currency.
  - The server decides every reward using a cryptographically secure random number generator. Odds are published and versioned: Common 30%, Uncommon 25%, Rare 20%, Epic 14%, Legendary 10%, Mythic 1%.
  - Rolls are idempotent and duplicates are counted.
  - **18 original, coloured 3D monument miniatures** (binary glTF, built by `node scripts/models/build.mjs`) can be placed on personal maps. They are rendered with three.js inside the map, anchored to their coordinates, and occluded by real buildings.
  - **18 map skins** really re-theme a personal map's style.
- **Worlds:**
  - Discover is the warm city.
  - My Maps is the personal world: its own palette, or the equipped skin.
  - Switching between them cross-fades the live style, with a short cartographic sweep (a simpler fade on low-power devices, none under reduced motion).

## Interface and 3D city (redesign, 2026-10-10)

- **Editor-style layout.**
  - Top navigation: map switcher, the **Discover / My Maps / Shared** tabs, search, notifications, help, account and a lime **Share** button.
  - A left icon rail and a collapsible side panel that follows the tab.
  - The map, with a bottom toolbar: locate, 2D/3D, zoom, reset orientation, map animations, and Layers.
  - A collapsible right **inspector** for whatever is selected, including an inline **Add to map** form.
  - Panels become overlays on narrow screens.
- **3D city from real data.**
  - OpenStreetMap building footprints are extruded to their mapped heights.
  - Parks, water and streets get a warm, illustrated palette.
  - **Decorative** touches are labelled as such in the legend: building colours, tree canopies (only inside mapped parks and woods), and moving vehicles (not live traffic).
  - The Layers panel has toggles for 3D, trees, and lighting (Auto / Day / Night).
- **Device-local view preferences:** `atlas.view.v1` (2D/3D), `atlas.trees.v1`, `atlas.lighting.v1`, `atlas.ambient.v1` (animations), `atlas.activeMap.v1` (the last map opened under My Maps).
- **No new dependencies.** Everything uses MapLibre features that were already in use (fill-extrusion, light, pitch, symbol and pattern layers).

## Living map & Discover categories

- **Interactive markers.** Teardrop pins, with the tip on the real coordinate. Hover a pin, or focus a result with the keyboard, for a preview. Click for rich details in the inspector, then **Add to map**: personal maps (a group is required) or collaboration maps you can edit, with *going* / *interested* for events.
- **Categories.** Events, Food & Drink, Parks & Outdoors, Arts & Culture, Scenic Views, Nightlife, Tourist Attractions, Things to Do and Sports. Each has subcategories and a results list. **Hide all / Show all** affects Discover only.
- **Filters and sort.** Date, Price, Category and More filters (for events), plus sorting by Soonest, Nearest, Lowest price or Name. Sorting reorders the lists only.
- **Real places.**
  - Points of interest come from the OpenStreetMap data already in the map tiles, so there are no extra requests.
  - Details come from the OSM API, and photos only from Wikimedia Commons, with author and license, via the `place-details` Edge Function.
- **Distance.** Shown only after you click **Distance** (your location stays on the device), always labelled straight-line.
- **Alive map.**
  - The selected place is highlighted using its real building footprint.
  - Optional ambient life: small 3D vehicles and walkers moving on real roads, rail and paths, with pause and 0.5×/1×/2× speed, plus a night glow at real venues. It can be turned off from the toolbar or Settings → Map appearance, and is off under reduced motion.

## Guest Mode

You can open Atlas and use it straight away, without an account:

| Works for guests | Needs an account |
|---|---|
| Discover, live events, search, filters | Friends and friend requests |
| Maps, groups (colors and icons), pins, saving events, edit, move, delete | Real collaboration maps, invitations, roles |
| Pin customization and **image markers** | Account and privacy settings |
| Group filtering, map style, export, reset | Maps that follow you across devices |
| A local, labelled **demo** collaboration map | |

**Where guest data lives:**
- It is stored only in this browser (`localStorage['atlas.guest.v1']`). Records are versioned and validated, and every change is saved atomically.
- If storage is full, Atlas tells you and saves nothing.
- If stored data is corrupt, Atlas backs it up and starts fresh.

**Signing in:**
- Signing in never uploads guest data.
- **Settings → Guest data → Import guest data** copies it into your account, but only when you choose to. Import only inserts data: maps are named "… (from guest)" and same-named groups are reused unchanged.
- Signing out returns you to the guest workspace.

**Security:**
- Guest data never touches Supabase. A live test audits every network request.
- RLS, Storage policies and anon privileges are unchanged.

## Interactive tutorial

- **Starting it:** first-time visitors are offered a tour (start or skip). It is always available from **Help** in the top bar, where you can take it, restart it, or jump to a chapter.
- **Content:** 7 chapters and 47 steps covering every feature. They highlight the real controls and include "Try it yourself" tasks that are checked before you continue.
- **Safety:** the tour runs in a **disposable sandbox** (`atlas.sandbox.v1`), for guests and signed-in users alike, so it never changes your maps and never sends anything. The sandbox is discarded when the tour ends, and progress survives a refresh.
- **Accessibility:** keyboard operable, focus-managed, Escape to exit, live announcements, and reduced-motion support.

---

## Tech stack

| Layer | Choice |
|---|---|
| UI | React 19, TypeScript, Vite 8, Tailwind CSS 4, Lucide icons, Framer Motion (welcome animation) |
| Routing / data | React Router 7, TanStack Query 5 |
| Map | MapLibre GL JS 6 with OpenFreeMap vector styles (no key needed) |
| Backend | Supabase Auth, PostgreSQL with RLS, Storage, Postgres RPC functions, one Deno Edge Function |
| Events | Ticketmaster Discovery API v2, behind a provider interface and a server-side proxy |
| Geocoding | Photon (OpenStreetMap), configurable |
| Tests | Vitest (unit, component, database via PGlite), Playwright plus axe-core (browser E2E and accessibility) |

## Architecture

```
src/
  app/                 App shell, routes, auth session boundary, UI store, welcome overlay
  components/ui/       Reusable primitives: Button, Dialog (native <dialog>), Field, Popover, Toast, ColorPicker…
  features/
    map/               Persistent MapLibre canvas, MapContext, generic HTML MapMarker, filter control
    discover/          Event layer (clustered GeoJSON), event card, filters (pure logic), events-in-view list
    maps/              Personal maps panel and view
    pins/              Pin API, marker visual and button, appearance editor, image cropper, upload/storage
    groups/            Group API, group filter contract (pure), picker, management
    search/            Context-aware search combobox
    friends/           Friend requests, friend links and QR codes
    collaboration/     Collaboration maps, members/roles, invitations, sharing, invite page
    settings/          Account, privacy, friends, appearance, groups, pins, collaboration
    auth/              Sign in / sign up / password reset (friendly email-error messages)
    workspace/         Account / guest / tutorial-sandbox workspaces, local store, import, account-required prompts
    tutorial/          Interactive tour engine, steps (7 chapters), Help menu, first-visit offer
    places/            Categories, OSM places layer, place details, previews, distance, emphasis, ambient life
  lib/                 Env, Supabase client, domain types, validation, formatting, timezone helpers
  services/events/     EventProvider interface, Supabase/Edge provider, fixture provider, geocoder
  dev/                 Dev-only verification harness (excluded from production builds)
  lib/database.types.ts  Generated from the live schema (`npm run types:generate`)
supabase/
  migrations/          Schema, RLS, RPCs, storage policies, provider cache, rate limits, privilege/perf hardening
  functions/           discover-events Edge Function plus shared Ticketmaster normalizer
  seed.sql             Development sample events (generated; clearly flagged)
tests/
  unit/                Pure-logic tests (filters, group filter, Ticketmaster, validation, crop math)
  components/          React component tests (jsdom)
  db/                  Migrations, RLS, RPC and storage-policy tests on PGlite (real Postgres)
  e2e/                 Playwright browser tests and axe accessibility audit (fixture mode)
  live/                LIVE API integration/security tests (real Supabase; opt-in)
  e2e-live/            LIVE browser tests and signed-in axe audit (real Supabase; opt-in)
scripts/
  live/provision-test-users.mjs   Creates/refreshes the dedicated live test accounts
  storage-orphans-report.sh       Read-only report of unreferenced uploads
```

**Three isolated map contexts share one persistent map:**

| Route | Context | Shows |
|---|---|---|
| `/` | Discover | Public `events` only |
| `/maps/:mapId` | Personal map | Your own pins on that map (group-filterable) |
| `/collab/:mapId` | Collaboration | Shared pin representations in that collaboration map only |

The `MapCanvas` lives in the app shell, so switching contexts or collapsing panels keeps the viewport. Each view attaches its own layers and markers and clears its selection on exit.

### Data model

```
auth.users 1─1 profiles ─┬─< maps ─< pins >─ events            (saved event references the public event; never cloned)
                         ├─< groups >─< pin_groups >─ pins      (one pin, many groups; no duplicates)
                         ├─< pin_images                         (metadata; bytes in Storage bucket pin-images)
                         ├─< friendships >─ profiles            (pending/accepted/declined/revoked)
                         └─< collab_members >─ collab_maps ─┬─< collab_invitations  (hashed, expiring, revocable)
                                                            └─< shared_pins         (independent snapshots)
```

Key constraints:
- `events (provider, external_id)` is unique.
- `pins (map_id, event_id)` is unique for event pins, so saving again updates group memberships.
- `pin_groups` has a composite primary key, plus a trigger requiring the pin, the group, and the membership row to share one owner.
- `pin_images` are referenced with `NO ACTION` foreign keys, so an image that is still in use cannot be deleted.

### Privacy and authorization model

The database enforces all authorization. The UI only mirrors it for clarity.

- RLS is enabled on every table. Broad default grants are revoked, then re-granted narrowly. Anonymous users can read only `events`.
- Maps, pins, notes, groups, and memberships are owner-only.
- Friendship grants no map or pin access.
- `profiles.friend_code` is hidden through column privileges.
- Multi-step changes have no direct write policies. They go through `SECURITY DEFINER` RPCs that re-derive the caller from `auth.uid()`. This covers friend requests, invitations, membership and role changes, and sharing.
- Invitation tokens: only the SHA-256 hash is stored. Invitations support expiry, use limits, revocation, and restriction to one friend, and accepting always requires an explicit action.
- Sharing (`share_pin`) copies a snapshot into `shared_pins`. The note is opt-in, and the custom image is opt-in. Deleting the shared copy never touches the original pin or its image.
- Storage (`pin-images`, private): uploads only into your own folder; no overwrites. Reads are allowed for the owner, or for members of a collaboration map that contains a shared pin using the image. A file can be deleted only after its metadata row is gone, which foreign keys block while anything still references it.

## Setup

### Prerequisites
- Node 20.19+ (tested on 20.20) and npm
- A Supabase project (free tier works) and the [Supabase CLI](https://supabase.com/docs/guides/cli), or the dashboard SQL editor
- Optional: a [Ticketmaster Developer](https://developer.ticketmaster.com/) API key, for live events

### 1. Install

```bash
npm install
cp .env.example .env   # first-time setup only — re-running this erases your configured values
```

### 2. Environment variables

| Variable | Where | Browser-safe? | Purpose |
|---|---|---|---|
| `VITE_SUPABASE_URL` | `.env` / hosting env | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | `.env` / hosting env | Yes (RLS protects data) | Public anon or publishable key |
| `VITE_MAP_STYLE_URL` | `.env` (optional) | Yes | MapLibre style URL. Defaults to OpenFreeMap Positron. A non-OpenFreeMap URL (for example MapTiler with a domain-restricted key) disables the in-app style picker. |
| `VITE_GEOCODER_URL` | `.env` (optional) | Yes | Photon-compatible geocoder. Defaults to `https://photon.komoot.io/api/` |
| `TICKETMASTER_API_KEY` | **Supabase Edge Function secret** | **No, server only** | Ticketmaster consumer key |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Injected into Edge Functions by Supabase | **No** | Used by `discover-events` to upsert events and apply rate limits |
| `ATLAS_ALLOWED_ORIGINS` | Edge Function secret (optional) | n/a | Comma-separated CORS origins for `discover-events` / `place-details`. Defaults to `*`. |
| `OVERPASS_URL` | Edge Function secret (optional) | n/a | Dedicated Overpass API endpoint for "Inside this place" lists (tried before public instances) |
| `ATLAS_LIVE_*` | `.env.live.local` (generated, gitignored) | Test accounts only | Live test accounts, written by `npm run test:live:provision` |

Never prefix server secrets with `VITE_`, because every `VITE_` variable is compiled into the browser bundle.

**Without any Supabase variables**, the app still runs. Discover shows clearly labeled **development sample events** (the "Sample: …" names and a warning banner). Sign-in, private maps, and collaboration show a "not configured" notice.

### 3. Database migrations

With the CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push                       # applies supabase/migrations/*.sql in order
```

Alternatively, without the CLI, run each file in `supabase/migrations/` in filename order in the dashboard's SQL editor.

The migrations create every table, index, trigger, RLS policy, and RPC. They also create the **private `pin-images` Storage bucket** (2 MB limit; PNG, JPEG, and WebP) and its policies, so no manual bucket setup is needed.

**Development sample events** are optional and should never be loaded in production:

```bash
npm run seed:generate                  # regenerates supabase/seed.sql from the fixture JSON
psql "$SUPABASE_DB_URL" -f supabase/seed.sql   # or paste it into the SQL editor
```

### 4. Edge Functions (live events, place details, routing, online chess)

```bash
supabase secrets set TICKETMASTER_API_KEY=<your key>
supabase functions deploy discover-events
supabase functions deploy place-details          # OSM + Wikimedia details for places (no key needed)
supabase functions deploy route                  # walking/driving distance + time (OSRM, no key needed)
supabase functions deploy chess-move             # server authority for online chess moves
# optional: a dedicated Overpass instance for "Inside this place" lists
supabase secrets set OVERPASS_URL=https://<your overpass>/api/interpreter
# optional (recommended for production volume): your own OSRM server
supabase secrets set ROUTING_BASE_URL=https://<your osrm host>
```

- **`route`** proxies OSRM. By default it uses FOSSGIS's public `routing.openstreetmap.de`, which permits only light use and requires attribution.
  - It rate-limits each client to 20 requests per minute and applies a global budget of 60 per minute. It fails closed and sends an identifying User-Agent.
  - It never logs or stores coordinates.
  - Set `ROUTING_BASE_URL` for heavier use.
- **`chess-move`** verifies the caller's session and replays the game with chess.js, the same engine the app uses. Moves are applied through a service-role-only SQL function with optimistic concurrency.

`place-details` is public and read-only.
- It caches results in `public.place_details` (service-role only) and rate-limits each client to 120 requests per minute.
- It sends an identifying User-Agent, as the OSM and Wikimedia API policies require.
- Public Overpass instances often reject or time out requests from cloud egress. Without `OVERPASS_URL`, "Inside this place" may show "couldn't be loaded".

`supabase/config.toml` sets `verify_jwt = false` for this function. It serves only public Discover data, so it works signed-out and with non-JWT publishable keys.

Abuse control and reliability in `discover-events`:
- **Input validation:** bbox checks, a Ticketmaster segment whitelist, date sanity checks, a 4 KB body limit, and control-character stripping.
- **Per-client rate limit:** 60 requests per minute. The key is a salted hash of the client IP, so raw IPs are never stored. Over the limit, the function returns 429 with `Retry-After`.
- **Global Ticketmaster budget:** 4 requests per second and 4,500 per day.
- **Cache:** each viewport and filter combination is cached for 15 minutes in `event_fetch_log`.
- **Failure backoff:**
  - 5 minutes after an authentication failure. This is tied to a fingerprint of the key, so replacing the secret takes effect immediately.
  - 60 seconds after a 429.
  - 60 seconds per viewport after a timeout or 5xx.
- **Upstream timeout:** 8 seconds.
- **Logs** never include the key or the upstream URL.

Every response states where its data came from: `source` (`ticketmaster` or `cache`), `fetched`, `stale`, `cachedAt`, and an optional `warning`. The UI shows "Live from Ticketmaster", "fetched N min ago", or a clear "previously fetched" or "unavailable" notice. Development fixtures are always labelled and never counted as live.

### 5. Supabase Auth settings

In **Authentication → URL Configuration**:
- Set **Site URL** to your app origin (for example `http://localhost:5173` in development).
- Add your origins to **Redirect URLs**. Email confirmation and password-reset links return to `/auth` or the `next` path.

Email confirmation can stay on. After sign-up, the app tells users to check their email.

**Before a public launch, configure custom SMTP** (Authentication → Emails → SMTP Settings). Supabase's built-in mailer is heavily rate-limited and, by default, only delivers to project team members. In this project it already returned "email rate limit exceeded".

Also consider enabling leaked-password protection and a minimum password length of 8.

### 6. Run

```bash
npm run dev            # http://localhost:5173
```

## Testing

```bash
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm test               # Vitest: unit + component + database (PGlite) suites
npm run test:db        # database/RLS suite only
npm run test:e2e       # Playwright, no backend: Discover, Guest Mode, tutorial, accessibility
npm run build          # typecheck + production build
npm run types:generate # regenerate src/lib/database.types.ts from the linked project
```

**Live integration tests.** These run against the *linked Supabase project* and are never part of `npm test`.

```bash
npm run test:live:provision   # once: create/refresh 3 dedicated test users (no emails sent) + 1 labelled sample event
npm run test:live             # API-level: Auth, RLS, RPCs, Storage, Edge Function as users A/B/C
npm run test:e2e:live         # real UI flows, guest-mode security (no leaks, no silent upload, explicit import), live Ticketmaster, signed-in axe
ATLAS_LIVE_RATE_LIMIT=1 npm run test:live   # opt-in: verifies 429 throttling (rate-limits this machine ~60 s)
node scripts/live/provision-test-users.mjs --delete   # remove the test users and all their data
```

- Provisioning fetches the project's service key from the logged-in Supabase CLI and keeps it **in memory only**.
- The generated test passwords go to `.env.live.local`, which is gitignored and created with mode 600.
- Every test removes the data it creates.

- **Database tests** (`tests/db`) apply the real migrations to PGlite, which is PostgreSQL compiled to WASM. A small stub stands in for Supabase's `auth.uid()`, roles, and `storage` schema. The tests then issue SQL directly as anon, owner, stranger, friend, viewer, and editor identities, with the same power a client holding a valid JWT would have.
- **E2E tests** run with Supabase variables blanked. They cover Discover, filters, search, map clicks, the welcome animation, panel and viewport behavior, and accessibility (axe, WCAG 2.1 A/AA). A dev-only harness at `/__dev/marker-check` checks that an image marker is the real, anchored, clickable map marker.
- If Google Chrome isn't installed, run `npx playwright install chromium` and remove `channel: 'chrome'` from `playwright.config.ts`.

## Deployment

The frontend is a static SPA. Run `npm run build` and serve `dist/` from any static host (Vercel, Netlify, Cloudflare Pages, S3 with a CDN). **Configure an SPA fallback** so deep links like `/invite/<token>` and `/maps/<id>` serve `index.html`.

Set the `VITE_*` variables in the host's build environment.

Backend: run `supabase db push` and `supabase functions deploy discover-events`, then set the secrets described above.

Production checklist:
- Set the production **Site URL** and **Redirect URLs** in Supabase Auth.
- Configure custom SMTP.
- Store a valid Ticketmaster consumer key.
- Optionally run `supabase secrets set ATLAS_ALLOWED_ORIGINS=https://your.domain`.

**Maintenance:**
- `npm run storage:orphans:report` gives a read-only count of uploads that nothing references.
- Users can remove their own unused uploads in Settings → Pins → Unused uploads. Nothing is deleted automatically.

## Behavior details

**Group filter (personal maps only).** "All Groups" is the default and shows every pin, including ungrouped ones. Selecting a group clears "All Groups". Multiple groups combine with OR. Deselecting removes only that group, and deselecting the last one returns to "All Groups". Filters are checkboxes with a text label, and they are saved per map in `localStorage`. They never change memberships.

**Discover filters.** Category, price, date, event start time, and venue hours combine with AND. Choices within one dimension combine with OR.
- Price bands are non-overlapping and use the **minimum verified price**: $0–$5, >$5–$10, >$10–$30, >$30. Currency is not converted.
- Times are evaluated in each event's own timezone. Windows may cross midnight. Event-start windows include both endpoints. Venue hours match when the venue's `[open, close)` interval overlaps the window.

**Unknown values.**
- With no filter active in a dimension, events with unknown values are shown.
- With a filter active, an event whose value is unknown is **excluded**, unless "Include unknown prices" or "Include unknown dates and times" is explicitly on.
- An unknown price is never treated as free.
- An instant without a timezone counts as an unknown local time.
- Events without verified coordinates are never put on the map.

**Ticketmaster data.**
- Venue opening and closing hours are left **unknown**: Ticketmaster only provides free text, which is not parsed.
- An event end time is stored only when Ticketmaster provides one.
- Ticket links are rendered only if they are valid `https` URLs.

**Image markers.**
- The editor crops, repositions, fits, and masks the image locally, then uploads a 256×256 WebP (PNG fallback) only when you press Save.
- On the map, the image itself is the clickable marker, centered on the pin's coordinate, with no default marker drawn underneath.
- Group identity appears as small badge dots, which never replace the image or a custom color.

## Known limitations

See [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) for the full acceptance checklist. The main limitations:

- **Email sign-up and reset delivery** depend on configuring custom SMTP and have not been verified with a real mailbox. The in-app password-reset flow is verified with an admin-generated recovery link, and email failures are explained to users.
- Each viewport loads up to 300 Ticketmaster events (3 pages); the UI says "showing N of M" and suggests zooming or choosing dates.
- Guest data is visible to anyone using the same browser profile (stated in the app).
- The Edge Function is covered by shared-module unit tests and live HTTP tests, but has no Deno-native tests.
- `@supabase/ssr` is listed as a dependency but unused by this SPA. It's safe to remove; it was left because it was added in the initial backup.
- `Atlas.py` (an empty file that existed before this work) is unused.
- **Routing:** the default OSRM server is a shared public service for light use. Production traffic needs `ROUTING_BASE_URL` pointed at your own instance. Routes are estimates for the mapped network, and accessibility is not guaranteed.
- **Collectibles:**
  - Crates need an account, so rewards can't be forged.
  - Monument models are original, simplified miniatures, not survey-accurate replicas. Sydney Opera House and Christ the Redeemer were left out because their designs may still be under copyright.
  - Placements and skins apply to personal maps only.
- **Meetups and notifications** exist for collaboration maps only. The guest demo collaboration map has no meetups.
- **Redesign vs. the reference image:**
  - Trees are a flat canopy pattern, not 3D models; real 3D trees would need a 3D engine dependency.
  - Building heights are OpenMapTiles' mapped or estimated heights.
  - Vehicle sizes are exaggerated so they stay visible.
  - "Popular times", "price range" and "open now" from the reference are **not shown**: there is no reliable data source for them, and hours are shown exactly as listed.
  - List rows show Ticketmaster images for events but not per-place photos, which would cost one Commons lookup per row. Place photos appear in the inspector.
