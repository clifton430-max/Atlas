# Atlas — Implementation Status and Checklist

_Last updated: 2026-10-10 (initial build session)._

## Status legend

| Status | Meaning |
|---|---|
| ✅ **Verified** | Implemented and checked by automated tests, or observed in a real browser |
| 🟡 **Implemented, unverified end-to-end** | Code is complete, and its database/server rules are tested. The browser↔Supabase path has not run, because no Supabase project or credentials were available. |
| 🔴 **Not implemented** | Not built yet |

## Starting state

The repository contained only `ATLAS_CONTEXT.md`, `ATLAS_DEV_NOTES.md`, and an empty `Atlas.py`. There was no existing code to preserve.

The environment had Node 20.20 and npm, plus Google Chrome for browser tests. It did **not** have the Supabase CLI, Docker, or Deno.

## Test results from the last run

| Command | Result |
|---|---|
| `npm run typecheck` | ✅ Passes |
| `npm run lint` | ✅ Passes, with no warnings |
| `npm run build` | ✅ Passes (warns about chunk size: MapLibre is ~1 MB) |
| `npm test` (Vitest) | ✅ **69 tests** across 10 files: unit, component, and database (PGlite) |
| `npm run test:e2e` (Playwright + axe) | ✅ **12 tests** in Chrome, in fixture mode |

## Phase checklist

### Phase 1 — Foundation
- ✅ Inspected the repo and recorded its state (above).
- ✅ Set up React, TypeScript, Vite, Tailwind 4, React Router, Lucide, Framer Motion, MapLibre with OpenFreeMap, and TanStack Query.
- ✅ Design primitives: Button, IconButton, Dialog (native `<dialog>`), Field, Checkbox, Switch, Popover, Toast, ColorPicker, Badge.
- ✅ Welcome overlay: about 1.3 s, initial load only, non-blocking, reduced-motion aware. Verified by E2E test.
- ✅ Environment setup (`.env.example`) and architecture docs (README).

### Phase 2 — Authentication and database
- 🟡 Supabase Auth: sign in, sign up with username, password reset, session provider, protected routes, and safe `next` redirects. `safeNext` is unit-tested; the "not configured" path is checked in E2E.
- ✅ Migrations: schema, constraints, indexes, triggers, RLS, RPCs, and storage bucket and policies. All five apply cleanly to Postgres (PGlite).
- ✅ Core types and services: events, maps, pins, groups, images, friends, and collaboration API modules.
- ✅ Security tests on private-data boundaries, run as unauthorized identities. See `tests/db/security.test.ts`: 23 tests covering anon, stranger, friend, viewer, editor, removed member, and storage cases.

### Phase 3 — Discover and search
- ✅ Provider interface and normalized event type.
- ✅ Ticketmaster adapter (normalizer and query builder), unit-tested against sample payloads.
- 🟡 The `discover-events` Edge Function (server-side key, cache, and upsert) is written but **not executed**: no Deno or Supabase available, and no Ticketmaster key.
- ✅ Clustered event markers, click to open details, details card with source attribution and last-checked time, and validated ticket links. E2E clicks a real map marker.
- ✅ Context-aware search with debouncing and an ARIA combobox: events, places via Photon, pins, and shared pins. Event search is checked in E2E. Place search uses the live Photon API, which was reachable but has no automated test.
- ✅ Category, price, and time filters with unknown-value handling, crossing midnight, evaluated in the event's local timezone. Covered by unit tests and E2E.
- ✅ Events without coordinates are listed but never mapped. Covered by unit tests and the fixture data.

### Phase 4 — Personal maps and groups
- 🟡 Multiple private maps with create, rename, and delete. The DB rules are tested; the UI is written.
- 🟡 Group create, edit, delete, and colors; memberships through a join table. DB tested, including the rule that deleting a group keeps its pins; UI written.
- ✅ / 🟡 Mandatory group assignment on save. The RPC rejects saves without a group (DB-tested), and the dialog persists nothing before confirmation, including drafts of new groups. The dialog itself is not E2E-tested.
- ✅ Exact checkbox and OR filter behavior with per-map persistence. Covered by unit tests and a component test of the real widget.
- ✅ No duplicate saved pins; saving again updates memberships (DB-tested).

### Phase 5 — Pin customization
- 🟡 Color, shape (5 options), icon, size, border, reset to default, and live preview (UI written). The visual output is component-tested.
- 🟡 Secure upload: validation, crop, reposition, fit, and mask. The 256 px WebP render, the upload, and cleanup on failure are written. The storage policies behind them are DB-tested (own folder only, private reads, no deleting files still in use). The real Storage API (bucket MIME and size enforcement, signed URLs) has not been exercised.
- ✅ The image is the actual map marker: anchored, follows panning and zooming, clickable, with no default marker underneath. Verified in E2E using the dev harness, which reuses the production `PinMarkerButton`.
- ✅ Group identity shows as badges and never overrides a custom color or image (component test).
- ✅ Shared image references cannot be deleted while still in use (DB test).

### Phase 6 — Friends and collaboration
- 🟡 Friend requests (send, accept, decline, cancel, remove), search for discoverable users, and friend links with QR codes. The state machine and privacy rules are DB-tested; the UI is written.
- 🟡 Collaboration maps with owner, editor, and viewer roles, plus owner-only controls. Escalation attempts are DB-tested; the UI is written.
- 🟡 Explicit sharing in steps (destination → review → confirm) producing independent shared representations. Sharing is DB-tested: the note is opt-in, viewers and non-owners are blocked, and the original survives removal of the shared copy. The UI is written.
- 🟡 Revocable, expiring, use-limited, and recipient-restricted invitation tokens, stored hashed. The DB tests cover all of these properties. The `/invite/:token` page, which previews and requires explicit acceptance, is written. QR codes are generated from the exact invite URL.
- 🟡 Native share where supported, with a Copy Link fallback (written, not E2E-tested).

### Phase 7 — Settings and polish
- 🟡 Settings sections: account, password, privacy (discoverability, friend-link reset), friends, map style, groups, pins, and collaboration roles.
- ✅ Accessibility: axe audit with no WCAG 2.1 A/AA violations on Discover (with card and filters open) and Auth. Also covered: keyboard-operable controls, labels on icon-only buttons, dialog focus and Escape, live regions, reduced motion, and an accessible event list mirroring the WebGL markers.
- ✅ Desktop layout with collapsible panels; the viewport is preserved (E2E). The minimum width is 960 px, and no mobile UI was built, as specified.
- ✅ Loading, empty, and error states, and success toasts only after an operation succeeds (by design in every mutation path).

### Phase 8 — Verification and delivery
- ✅ RLS and private Storage access verified with unauthorized identities, on PGlite with stubbed `auth` and `storage`.
- ✅ Image markers verified as actual interactive map markers.
- ✅ Group filter semantics verified exactly (unit and component tests).
- ✅ README covers setup, environment, migrations, services, tests, and deployment.
- 🔴 **Live-backend acceptance pass not done.** It needs a Supabase project, plus optionally a Ticketmaster key.

## Next steps

1. **Provision Supabase:** create a project, run `supabase link` and `supabase db push`, and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env`.
2. **Manual acceptance pass** with two browser profiles, users A and B:
   - Sign up both users and confirm each gets a profile and a "My Map".
   - **A:** save a seeded sample event. The save dialog must require a group. Save it again and check that groups update and no duplicate appears. Create a custom pin by clicking the map.
   - **A:** apply group filters, covering all the semantics.
   - **A:** customize a pin with an uploaded image and confirm the marker is the image. Replace the image, then remove it.
   - **A ↔ B:** send a friend request by username and by friend link, and accept it. Confirm B still cannot see A's maps.
   - **A:** create a collaboration map and invite B as viewer, both by link and as a direct invite. **B:** accept.
   - Confirm that B, as a viewer, cannot share.
   - **A:** promote B to editor. **B:** share a pin with an image. **A:** view the image marker.
   - **A:** remove B and confirm B loses access immediately.
3. **Live events:** run `supabase secrets set TICKETMASTER_API_KEY=…` and `supabase functions deploy discover-events`, then verify Discover shows live data without a dev banner.
4. Add Playwright E2E tests against a local Supabase (`supabase start` needs Docker) for the flows in step 2.
5. Generate DB types (`supabase gen types typescript`) and adopt them in the API modules.
6. Code-split heavy routes (Settings, dialogs) and put MapLibre in its own chunk.
7. Add a periodic cleanup for orphaned Storage objects (files without a `pin_images` row).
