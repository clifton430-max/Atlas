# Atlas — Implementation Status & Acceptance Checklist

_Last updated: 2026-10-10 (Guest Mode + interactive tutorial session)._

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
| Every major feature has an interactive chapter | ✅ | 7 chapters, 44 steps; the walkthrough test reaches every step of all 7 chapters and finishes |
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
