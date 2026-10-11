# Atlas — Implementation Status & Acceptance Checklist

_Last updated: 2026-10-10 (master implementation session). Earlier sections below are kept for history._

## Master implementation (data integrity, collaboration, chess, collectibles, worlds) — 2026-10-10

| Area | Status | Verified by |
|---|---|---|
| Part 2 bug fixes: sorting, details, routing, compass, links, Discover tab, panels, pin metadata | ✅ | unit, PGlite DB, fixture E2E (`fixes.spec.ts`), live `route` function |
| Part 3 meetups, attribution, avatars, realtime, notifications, permissions | ✅ | 5 DB tests, unit, **live two-browser E2E** (`collab.live.spec.ts`) |
| Part 4 chess: local (all rules) and online (server authority) | ✅ | rule unit tests, 4 DB tests, 4 fixture E2E, live API test (checkmate via the authority), **live two-browser E2E** |
| Part 5 crates: server-authoritative, published odds, idempotency, duplicates | ✅ | 11 DB tests (incl. 40k-draw uniformity), live API tests |
| Parts 6–7 colour 3D monuments; persistent placement on personal maps | ✅ | GLB validity tests, anchoring math tests, all 18 render in-browser, **live UI journey** (roll → place → reload → select → rotate → remove) |
| Parts 8–9 skins and Discover ↔ My Maps worlds | ✅ | applier restore test, fixture E2E (preview, restore, sweep, reduced motion, indicator), **live equip → reload** |

### Final test results (this session)

| Command | Result |
|---|---|
| `npm run typecheck` / `npm run lint` / `npm run build` | ✅. three.js is a lazy 611 KB chunk and chess.js lives in the ChessRoom chunk. The main app chunk is 479 KB. |
| `npm test` (unit + PGlite DB/RLS) | ✅ **172 / 172** across 25 files |
| `npm run test:e2e` (no backend, real tiles) | ✅ **70 / 70** |
| `npm run test:live` (real Supabase project) | ✅ **40 / 40** (+1 opt-in skipped) |
| `npm run test:e2e:live` (real Supabase, two-account tests) | ✅ **17 / 17** |
| Supabase security advisors | No errors. Warnings are the intended signed-in SECURITY DEFINER RPCs (each re-checks permissions) plus leaked-password protection (an Auth setting). |
| Bundle | The only JWT is the anon key. |

### Labelled honestly

- **Mocked vs. real:**
  - The fixture E2E suite runs without a backend, using labelled sample events.
  - The live suites run against the linked Supabase project with dedicated test accounts.
  - Before each run, the live collectible tests clear those accounts' crate rolls; this is test data only.
- **External setup:**
  - Production routing volume needs `ROUTING_BASE_URL` (your own OSRM server).
  - `OVERPASS_URL` is still needed for "Inside this place".
  - SMTP is still unverified.
- **Not built:**
  - Paid economy, by design.
  - Meetups on the guest demo map.
  - Profile photos (avatars are initials).
  - Real 3D tree models.
  - Monuments on shared maps (placements are personal-map only, by the permission model).

## Map & interface redesign — this session

Reference: editor-style UI over an isometric city. Implemented on the
real MapLibre map; nothing is an illustration laid over the map.

| Phase | Status | Verified by |
|---|---|---|
| 1. Design system and shell | ✅ Complete | typecheck, lint, 105 unit/DB, 41 fixture E2E, 14 live E2E; screenshots at 1440 / 820 / 390 px |
| 2. Markers and details | ✅ Complete | 105 unit/DB, 48 fixture E2E (7 new in `redesign.spec.ts`) |
| 3. Discovery and filtering | ✅ Complete | 113 unit/DB (8 new: Nightlife mapping, uniqueness, sort), 50 fixture E2E (2 new: Nightlife from real tiles, dropdown filters + sort) |
| 4. Add to Map workflow | ✅ Complete | 50 fixture E2E, **14 live E2E** (inline flow on the real backend: no duplicate, viewer maps excluded, collaboration add with attendance), 33 live API tests |
| 5. Geographic visual upgrade | ✅ Complete | 120 unit/DB (7 new transform tests), 51 fixture E2E (new: buildings and trees only from real tile features) ; screenshots of Midtown, Central Park and the Battery |
| 6. Ambient animations | ✅ Complete | 122 unit/DB (2 new pose/box tests), 53 fixture E2E (2 new: vehicles in a personal-map context, pause/resume, night/day tint; reduced motion) |

### Final test results (this session)

| Command | Result |
|---|---|
| `npm run typecheck` / `npm run lint` / `npm run build` | ✅ pass. The app chunk is 405 KB (it was 352 KB). MapLibre is unchanged. **No new dependencies.** |
| `npm test` (unit + PGlite DB/RLS) | ✅ **122 / 122** (+17 this session) |
| `npm run test:e2e` (no backend, real OpenFreeMap tiles) | ✅ **53 / 53**, including 12 in the new `tests/e2e/redesign.spec.ts` |
| `npm run test:e2e:live` (real Supabase + Ticketmaster) | ✅ **14 / 14** (save, collaboration, guest and tutorial flows updated for the new layout and the inline Add to map) |
| `npm run test:live` (backend API) | ✅ **33 / 33** (+1 opt-in skipped). No backend or migration changes were made in this session. |
| Bundle secret scan | ✅ The only JWT in the bundle has role `anon` (the public key). `sb_secret_` appears only as a string literal inside supabase-js. |

### Verified vs. decorative vs. not done

- **Verified real data:**
  - Building footprints and heights, roads, rail, paths, water, parks, gardens, woods and places all come from OpenStreetMap tiles.
  - Events come from Ticketmaster.
  - Place details come from the OSM API, and photos from Wikimedia Commons.
- **Decorative (labelled in the legend and Layers):**
  - building facade colours
  - tree canopies, drawn only inside mapped parks and woods
  - vehicle and walker motion and size, which are not live
  - day/night tint, which uses approximate solar time
- **Intentionally not reproduced from the reference** (no trustworthy data source, so nothing is fabricated):
  - "Popular times", "price range" and "Open now"
  - per-row place photos in lists (quota)
  - 3D tree models (a 3D engine dependency)
- **Still externally blocked (unchanged):**
  - "Inside this place": Overpass is blocked from Supabase egress. Set the `OVERPASS_URL` secret to fix it.
  - SMTP email delivery has not been verified.

Phase 1 notes:
-   No features were removed. Old locations moved: the collaboration panel is now the Shared tab's side panel, and selection cards now open in the right inspector. Group filters moved into the My Maps panel and Discover filters into the Discover panel.
-   Notifications are real data only (pending invitations, incoming friend requests). Guests see an explanation instead.
-   Share is context-aware and never offers a link that wouldn't work. Personal maps have no public link, by design.


## Living map & rich discovery — this session

### Test results (final run)

| Command | Result |
|---|---|
| `npm run typecheck` / `npm run lint` / `npm run build` | ✅ pass. App chunk 352 KB (109 KB gzip), up from 301 KB; MapLibre chunk unchanged. |
| `npm test` | ✅ **105 / 105**, including new places, categories, distance and OSM/Wikimedia parsing tests and DB tests for migration 0012 |
| `npm run test:e2e` (no backend, real OpenFreeMap tiles) | ✅ **41 / 41**, including 9 new living-map tests and 1 new axe audit |
| `npm run test:live` | ✅ **33 / 33** (+1 opt-in skipped), including 4 new tests: place-details, `save_place_pin`, attendance, `add_to_collab` roles |
| `npm run test:e2e:live` | ✅ **14 / 14**, including 2 new: live place card with Commons photo; save to an editable collaboration map, with viewer maps excluded |
| `deno check` (both Edge Functions) | ✅ pass |
| Supabase advisors | Anon can execute 0 functions. The new `add_to_collab` is listed among the intended signed-in RPCs; it re-checks the role server-side. |
| Secret scan (committable files + bundle) | ✅ 0 matches |

### What powers each feature

| Feature | Source | Notes |
|---|---|---|
| Event markers, previews, details | Ticketmaster via `discover-events` (verified live) | Icon and color by Ticketmaster segment; "type unknown" when the segment is missing |
| Place markers, categories, results list | **OpenStreetMap POIs in the OpenFreeMap vector tiles** (`poi` layer, injected into the style) | No extra network requests (measured: 0 when toggling categories); ODbL attribution shown |
| Place details (address, hours as listed, website, phone, cuisine, links) | OSM API via the new `place-details` Edge Function | Cached 7 days, rate-limited, sends an identifying User-Agent |
| Place photos | **Wikimedia Commons only** (explicit `wikimedia_commons`/`image` tag or Wikidata P18) | Shown with license, author and file link. Verified live: ESB (Public domain), Central Park (CC BY-SA 2.0). |
| Points of interest inside a place | Overpass area containment (`place-details`) | ⚠️ Currently blocked externally (see below) |
| Distance | Browser geolocation on explicit click, great-circle formula | Labelled "straight line"; never sent anywhere |
| Selected-place emphasis | **Real OSM building footprint** under the selected point (tiles) plus a halo | Nothing is drawn when no footprint contains the point |
| Ambient life | **Real road, rail and path geometry** from the tiles; **stylized motion** (not real-time traffic); real POIs for the night glow | Optional; off under reduced motion |

### Status per requirement

See ATLAS_DEV_NOTES.md → Phase 11 for the full checklist. Summary:

- **Complete and verified:**
  - interactive markers with hover and keyboard previews
  - rich details
  - save to personal or collaboration maps, with group and attendance rules
  - guest local saves
  - category Discover with subcategories
  - Hide all / Show all
  - list/map sync
  - category colors with icons
  - distance
  - building-footprint emphasis
  - ambient life with setting, reduced motion and performance guard
  - security preservation
- **Implemented, partially verified:**
  - place thumbnails in hover previews (dwell-then-cache by design; no live UI test)
  - night glow (approximate solar time; unit-tested only)
  - places-plus-keyword interaction (defined, not separately tested)
- **Externally blocked:** "Inside this place" lists.
  - Public Overpass instances return 406/504 for requests from Supabase's egress. It worked live once (ESB, 6 POIs). The UI says it couldn't be loaded.
  - **Fix:** `supabase secrets set OVERPASS_URL=https://<your overpass instance>/api/interpreter`. It's tried first, and no redeploy is needed.
- **Not implemented, by design:**
  - 3D extrusion lift (the map is top-down with pitch disabled, so it would be invisible)
  - trees and picnic scenes (no geographically defensible data; would be invented decoration)

### Performance (headless Chrome, Midtown NYC, z15.5, 217 place markers)

| | Avg frame | p95 frame |
|---|---|---|
| Ambient off | 16.6 ms | 16.7 ms |
| Ambient on (16 moving dots) | 16.6 ms | 16.8 ms |

Toggling 4 place categories made **0 provider requests**.

### Deployment changes this session

- **Migrations 0012 and 0013 applied** (dry-run first). Both are additive. `save_event_pin` was re-created with an optional `p_attendance`; no data changed.
- **Edge Function `place-details` deployed** with `verify_jwt=false`. It is public read-only and rate-limited.
- **Optional new secret: `OVERPASS_URL`.**

---

**Legend:** ✅ verified by a passing automated test or a live check · 🟡 implemented, not fully verifiable here (reason given) · 🔴 blocked

## Test results (final run of this session)

| Command | Covers | Result |
|---|---|---|
| `npm run typecheck` / `npm run lint` / `npm run build` | TypeScript, ESLint, production build | ✅ pass |
| `npm test` | Unit, component, and DB/RLS (PGlite) tests | ✅ **90 / 90** (11 files) |
| `npm run test:e2e` | Browser, no backend: Discover, **Guest Mode (9)**, **tutorial (9)**, axe (3), image marker | ✅ **31 / 31** |
| `npm run test:live` | Live API: Auth, RLS, RPCs, Storage, Edge Function, as users A, B, and C | ✅ **29 / 29** (+1 opt-in rate-limit test skipped) |
| `npm run test:e2e:live` | Live UI flows, **live guest-mode security (3)**, live Ticketmaster UI, signed-in axe audit | ✅ **12 / 12** |
| `npx deno check supabase/functions/discover-events/index.ts` | Edge Function types | ✅ pass |
| `supabase migration list --linked` | Remote schema | ✅ migrations 0001–0011 applied; local matches remote |

## Final acceptance checklist

| Item | Status | Evidence |
|---|---|---|
| Every `ATLAS_DEV_NOTES.md` requirement audited and addressed | ✅ | Audit table below; two items that had been marked done were found incomplete and are now fixed |
| Existing functionality preserved | ✅ | All earlier suites still pass. Two live tests were updated on purpose: guests now get an explanation instead of an auth redirect. |
| Atlas opens and is useful without signing in | ✅ | `guest.spec.ts`: no auth wall, a ready-made map, the full feature set |
| Guest maps, groups, pins, customization, and filters work | ✅ | `guest.spec.ts`: CRUD, group icons, required groups, edit, move, OR filter, delete |
| Guest data persists and stays local | ✅ | Reload persistence (E2E). `guest.live.spec.ts` audits every network request: zero requests to private tables or Storage. |
| Guest image pins are real, anchored, interactive markers | ✅ | `guest.spec.ts`: data-URL image marker, position checked after panning, click opens details, persists across reload |
| Account-required features explain the need for an account | ✅ | `guest.spec.ts` covers 5 account-only routes, the demo invite prompt, and demo-only sharing |
| Private data and Storage stay protected | ✅ | Live API suite (29) and the advisor/privilege checks from the previous session. RLS was never weakened, and anon can still execute 0 functions. |
| Guest data never migrates silently | ✅ | `guest.live.spec.ts`: account row counts are unchanged after sign-in; import happens only on explicit request and inserts only |
| Tutorial works without signing in | ✅ | `tutorial.spec.ts` runs in no-backend mode |
| Every major feature has an interactive chapter | ✅ | 7 chapters, 47 steps; the walkthrough test reaches every step of all 7 chapters and finishes |
| Tutorial controls, progress, restart, accessibility, and safe demo behaviour | ✅ | `tutorial.spec.ts` (9) and axe. Sandbox isolation is checked both locally and live. |
| Ticketmaster verified with real live data | ✅ | Deployed function: `source: ticketmaster, fetched: true`. 276 real NYC events across 3 days in one viewport. Live UI shows "Live from Ticketmaster". |
| Email flows verified end to end | 🔴 **External blocker** | Supabase rejects reserved test domains before sending, no real mailbox was available, and the project uses the rate-limited built-in mailer. The code paths are implemented, and their failures are explained to users. |
| Unit, integration, and browser tests run and recorded | ✅ | Table above |
| Build, typecheck, and lint documented | ✅ | Table above |
| Documentation reflects actual behaviour | ✅ | README, ATLAS_CONTEXT (new Guest Mode section), ATLAS_DEV_NOTES (Phases 9 and 10), this file |
| No secrets exposed or committed | ✅ | `.env` and `.env.live.local` are gitignored. The bundle and committable files were scanned for service keys and test passwords: 0 matches. |

## Developer-notes audit (this session)

| Area | Before this session | Now |
|---|---|---|
| Group CRUD with **icons** (Phase 4) | ❌ Marked done, but there was no icon UI | ✅ Icon picker in group forms and the save/new-pin pickers; icons shown in lists, filters, and pickers next to the name text. Verified live (an icon picked in the UI is stored) and in guest mode. |
| Provider **pagination** (§5) | ❌ First page only: 100 events, mostly today's earliest | ✅ Up to 3 pages per viewport within the rate budget, plus the total Ticketmaster reports (migration 0011). The UI says "showing N of M — zoom in or choose dates". Verified live. |
| Offline / unavailable states (§8) | Partial | ✅ Browser-offline banner; provider states as before |
| Email failure explanations | Raw server messages | ✅ `friendlyAuthError`: rate limit, SMTP failure, and invalid address each explained without claiming success (unit-tested; live sign-up test) |
| Everything else in §1–§11 | Implemented | ✅ Re-verified by the suites above |

## Guest Mode — how it works

- **Workspaces** (`src/features/workspace/`):
  - `account` (Supabase) when signed in.
  - `guest` (`localStorage['atlas.guest.v1']`) when signed out.
  - `sandbox` (`localStorage['atlas.sandbox.v1']`) while the tour runs.
- **Data hooks:** every hook (maps, groups, pins, saved events, images, shares) branches on the workspace, and the workspace scope is part of every query key, so cached data from one workspace can never appear in another.
- **Local workspace rules** mirror the database:
  - at least one group when saving; no duplicate saved event per map
  - unique group names, ignoring case
  - deleting a group keeps its pins; deleting a map deletes its pins
  - images are not deleted while referenced
- **Local workspace safety:**
  - Commits are atomic: a change becomes current only after it is persisted.
  - Stored data is validated record by record on load. Unreadable data is backed up to `….corrupt-backup` and a fresh workspace is started.
  - If storage is full, the change is rejected and nothing is half-saved.
  - If storage is unavailable, data is kept in memory with a warning.
  - Other tabs stay in sync.
- **Stored locally:** maps, groups, pins (with a snapshot of each saved public event), images (data URLs, at most 2 MB each), the demo collaboration state, and the map-style preference. Settings → Guest data offers a JSON download and a reset.
- **Account-only features** (friends, real collaboration, invitations, account and privacy settings) show `AccountRequiredCard` / `SignInPromptDialog`. The **demo collaboration map** (`/collab/demo`) is local and labelled "Demo" everywhere. Its invite button explains that a real invitation needs an account, and nothing is sent.
- **Import** (Settings → Guest data, signed in only, explicit) only inserts data:
  - Maps are created as "… (from guest)".
  - Groups are reused by name without changes.
  - Event pins are imported only when the event exists on the server.
  - Images are re-uploaded to private Storage.
  - Guest data is kept on the device until the user clears it.

## Tutorial — how it works

- **Entry points:**
  - A first-visit offer: *Start the tour* or *Skip for now*. The answer is remembered.
  - **Help** in the top bar: take, restart, or jump to any of the 7 chapters.
- **Engine** (`src/features/tutorial/`):
  - **Spotlight and card.** A spotlight ring with dimming highlights the real control (via its `data-tour` target). Dimming never blocks interaction. The card shows the chapter, step counter, a progress bar, and Back / Next / Skip step / Exit.
  - **Verified tasks.** "Try it yourself" tasks are checked against real app state before Next unlocks; *Skip step* always works.
  - **Step preparation.** Steps navigate to their route and `prepare()` opens panels or popovers, or selects a pin.
  - **Robustness.**
    - Map-click tasks dock the card in a corner, away from the map centre.
    - A missing target falls back to a centred card with an explanation after 2.5 s.
  - **Accessibility.**
    - Focus moves to each step's heading.
    - Escape exits when focus is in the card.
    - Changes are announced in a live region.
    - Animations respect reduced motion.
  - **Persistence.** Progress survives a refresh.
- **Safety:**
  - The tour always runs in the **sandbox** workspace, for guests and for signed-in users, and it is discarded when the tour ends.
  - The live test proves a signed-in tour makes no account writes and leaves account row counts unchanged.
  - The fixture test proves the guest workspace is byte-for-byte unchanged afterwards.
  - Starting at a later chapter seeds the practice data that chapter needs.
- **Chapters:**
  1. Getting around
  2. Discovering events
  3. Personal maps
  4. Groups and filtering
  5. Pin customization and images (including a built-in *sample image*)
  6. Friends and collaboration (demo)
  7. Settings, privacy and data

## Ticketmaster investigation

- **Previous session:** HTTP 401 from Ticketmaster. That was a credential problem, not a code problem.
- **Secret replaced:** the secret was replaced at 09:50 UTC. The next real request returned 99 live events. The function code, key handling (never logged or returned), and request construction were unchanged.
- **Improved this session:** multi-page fetching, an honest truncation notice, and a key-fingerprinted auth backoff, so a corrected key works on the next request.
- **Confirmed again:** development fixtures are never labelled live (live UI test).

## Remaining blockers and limitations

1. 🔴 **Public email delivery is not verified.**
   - **What to configure:**
     - Custom SMTP in Supabase Dashboard → Authentication → Emails → SMTP Settings, using any SMTP provider.
     - Raise the email rate limit under Authentication → Rate Limits.
   - **How to check delivery:**
     - Sign up with a real mailbox you control and confirm the email arrives.
     - Use "Forgot password" from `/auth` and confirm the recovery email arrives and its link opens "Choose a new password". The in-app flow is already verified live with an admin-generated link.
2. 🟡 **Ticketmaster limits:** its search caps out at around 10,000 matches, and each viewport loads up to 300 events. The UI says so and suggests zooming or choosing dates.
3. 🟡 **Shared-browser exposure:** guest data is visible to anyone using the same browser profile. This is stated in the badge and in Settings → Guest data.
4. 🟡 **Production setup:**
   - Set the production Site URL and Redirect URLs.
   - Optionally set `ATLAS_ALLOWED_ORIGINS`.
   - Consider leaked-password protection.
5. 🟡 **`.env` resets:** it was found reset to `.env.example` at the start of this session (most likely by `cp .env.example .env`). The README now warns against re-running that step.
6. 🟡 **Unused dependency:** `@supabase/ssr` is unused. It's safe to remove, but was left in place because it was user-added.
