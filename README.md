# Atlas

Atlas is a desktop-first, map-first web app. You can discover public events on an interactive map, save events and custom places to **private** personal maps, organize pins into color-coded groups, and share selected pins on purpose through permission-based collaboration maps.

- **Product spec:** [ATLAS_CONTEXT.md](ATLAS_CONTEXT.md)
- **Engineering notes:** [ATLAS_DEV_NOTES.md](ATLAS_DEV_NOTES.md)
- **Status:** the implementation checklist and verification status are in [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md)

> **Current state:** the full stack is implemented. The database security model is verified with automated tests against real PostgreSQL (PGlite). The UI is verified in a real browser in "no backend" mode. Signed-in flows against a live Supabase project, and live Ticketmaster data, have **not** been exercised yet because no credentials were available during development. See the status document for exact details.

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
    auth/              Sign in / sign up / password reset
  lib/                 Env, Supabase client, domain types, validation, formatting, timezone helpers
  services/events/     EventProvider interface, Supabase/Edge provider, fixture provider, geocoder
  dev/                 Dev-only verification harness (excluded from production builds)
supabase/
  migrations/          Schema, RLS, RPCs, storage policies, provider cache table
  functions/           discover-events Edge Function plus shared Ticketmaster normalizer
  seed.sql             Development sample events (generated; clearly flagged)
tests/
  unit/                Pure-logic tests (filters, group filter, Ticketmaster, validation, crop math)
  components/          React component tests (jsdom)
  db/                  Migrations, RLS, RPC and storage-policy tests on PGlite (real Postgres)
  e2e/                 Playwright browser tests and axe accessibility audit
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
cp .env.example .env
```

### 2. Environment variables

| Variable | Where | Browser-safe? | Purpose |
|---|---|---|---|
| `VITE_SUPABASE_URL` | `.env` / hosting env | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | `.env` / hosting env | Yes (RLS protects data) | Public anon or publishable key |
| `VITE_MAP_STYLE_URL` | `.env` (optional) | Yes | MapLibre style URL. Defaults to OpenFreeMap Positron. A non-OpenFreeMap URL (for example MapTiler with a domain-restricted key) disables the in-app style picker. |
| `VITE_GEOCODER_URL` | `.env` (optional) | Yes | Photon-compatible geocoder. Defaults to `https://photon.komoot.io/api/` |
| `TICKETMASTER_API_KEY` | **Supabase Edge Function secret** | **No, server only** | Ticketmaster consumer key |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Injected into Edge Functions by Supabase | **No** | Used by `discover-events` to upsert events |

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

### 4. Edge Function (live Ticketmaster data)

```bash
supabase secrets set TICKETMASTER_API_KEY=<your key>
supabase functions deploy discover-events
```

`supabase/config.toml` sets `verify_jwt = false` for this function. It serves only public Discover data, so it works signed-out and with non-JWT publishable keys.

The function caches each viewport and filter combination for 15 minutes in `event_fetch_log`, which keeps usage within Ticketmaster's rate limits (5 requests per second, 5,000 per day on the default tier).

If the function or key is missing, the app falls back to events already in the database and labels them as "previously fetched" or "development samples". It never presents them as live.

### 5. Supabase Auth settings

In **Authentication → URL Configuration**:
- Set **Site URL** to your app origin (for example `http://localhost:5173` in development).
- Add your origins to **Redirect URLs**. Email confirmation and password-reset links return to `/auth` or the `next` path.

Email confirmation can stay on. After sign-up, the app tells users to check their email.

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
npm run test:e2e       # Playwright (uses installed Google Chrome; starts its own dev server)
npm run build          # typecheck + production build
```

- **Database tests** (`tests/db`) apply the real migrations to PGlite, which is PostgreSQL compiled to WASM. A small stub stands in for Supabase's `auth.uid()`, roles, and `storage` schema. The tests then issue SQL directly as anon, owner, stranger, friend, viewer, and editor identities, with the same power a client holding a valid JWT would have.
- **E2E tests** run with Supabase variables blanked. They cover Discover, filters, search, map clicks, the welcome animation, panel and viewport behavior, and accessibility (axe, WCAG 2.1 A/AA). A dev-only harness at `/__dev/marker-check` checks that an image marker is the real, anchored, clickable map marker.
- If Google Chrome isn't installed, run `npx playwright install chromium` and remove `channel: 'chrome'` from `playwright.config.ts`.

## Deployment

The frontend is a static SPA. Run `npm run build` and serve `dist/` from any static host (Vercel, Netlify, Cloudflare Pages, S3 with a CDN). **Configure an SPA fallback** so deep links like `/invite/<token>` and `/maps/<id>` serve `index.html`.

Set the `VITE_*` variables in the host's build environment.

Backend: run `supabase db push` and `supabase functions deploy discover-events`, then set the secrets described above.

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

See [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) for the full list. The main ones:

- Not yet exercised against a live Supabase project or the live Ticketmaster API, because no credentials were available. The Edge Function has not been executed, because Deno is not installed in the development environment.
- Supabase client types are not generated (`supabase gen types`). API modules map untyped rows into explicit domain types.
- If a file deletion fails after its metadata row is deleted, an orphaned Storage object can remain. It is never referenced or exposed, but it is not cleaned up automatically yet.
- The JS bundle is about 1.9 MB before compression, mostly MapLibre. Route-level code-splitting is not done yet.
- `Atlas.py` (an empty file that existed before this work) is unused.
