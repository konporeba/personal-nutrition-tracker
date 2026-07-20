# Synced Data Backbone (F-01) Implementation Plan

## Overview

Stand up the private, single-owner data backbone every logging slice writes into. This foundation delivers a Supabase Postgres store keyed to one owner identity, the minimal core schema (`meal_entries` + `estimation_runs`, with a `section` and a `source` marker), private photo-storage groundwork, and a client-side repository + query layer that both the phone build and the desktop web build use to read and write the same data. Success is proven by US-07 cross-client parity: a write on one client appears on the other.

This is a **foundation** — it ships no feature UI. Its deliverable is the store, its access contract, and a verification path.

## Current State Analysis

- **Frontend:** Expo SDK 57 / RN 0.86 client-only scaffold. Routing is `expo-router` typed routes under `src/app/` (`_layout.tsx` root layout wrapping `ThemeProvider` + `AppTabs`; `index.tsx`/`explore.tsx` demo screens). Theming is home-grown (`src/constants/theme.ts`, `ThemedText`/`ThemedView`). Path aliases `@/*` → `src/*`. React Compiler and typed routes are on (`app.json` → `experiments`).
- **Backend / Data / Auth:** **absent.** No server, no Supabase, no DB driver, no ORM, no migrations, no local persistence, no auth. No git repo yet (per `context/foundation/health-check.md`).
- **No test runner** is configured (scaffold ships without Jest); `npm run lint` (`expo lint`) and `tsc` are the only gates available.
- **Intended stack** (`context/foundation/tech-stack.md`): Expo + Supabase + a thin serverless proxy. `has_realtime: false` — sync is required but **eventual**, with up-to-1h backend outages tolerated and no data loss on recovery (PRD NFRs).
- **Roadmap risk note (F-01):** "keep entities minimal (Meal + EstimationRun + section) so per-component (OQ-6) can be added without a rewrite." The entity shape chosen here ripples into every later slice.

### Key Discoveries

- Root layout to wrap providers into: `src/app/_layout.tsx`. Existing pattern already nests providers (`ThemeProvider` + `AppTabs`), so adding a query/persistence provider follows the established shape.
- The codebase already uses **platform-specific files** (`*.web.tsx` / `*.tsx`, `use-color-scheme.ts` / `.web.ts`). The Supabase client's storage adapter differs by platform (AsyncStorage on native, browser storage on web), so `src/lib/supabase.ts` should follow this same split rather than branching on `Platform.OS` inline where a file split is cleaner.
- Supabase React Native integration (verified against current Supabase docs): `@supabase/supabase-js` + `@react-native-async-storage/async-storage` + `react-native-url-polyfill`; `createClient(url, anonKey, { auth: { storage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } })`; an `AppState` listener drives `supabase.auth.startAutoRefresh()` / `stopAutoRefresh()` on native.
- `EXPO_PUBLIC_`-prefixed env vars are **embedded into the built bundle** (including the static web build). The Supabase URL and **anon key are designed to be public** and shipped this way safely — privacy is enforced by RLS, not by hiding the anon key.
- CLAUDE.md mandate: read the **Expo SDK 57** docs (`https://docs.expo.dev/versions/v57.0.0/`) before writing any Expo/router/native code, and prefer official CLIs over generated boilerplate.

## Desired End State

A single-owner Supabase project exists with versioned schema, RLS, and a private Storage bucket. The Expo app (native and web) boots into an authenticated owner session, and a typed repository backed by TanStack Query lets any screen create, list-by-day, update, and soft-delete `meal_entries` (each carrying macros, a `section`, a `source` marker, and an optional link to an `estimation_run`). A write on the web build appears on the native build on next focus, and vice versa. A runnable smoke script demonstrates the full round-trip (create → read → update → soft-delete) against the real store, proving RLS and last-write-wins ordering.

**Verification of end state:** `supabase db reset` applies all migrations cleanly; `tsc` and `expo lint` pass; the smoke script exits 0 after round-tripping a row; the manual two-client walkthrough shows parity.

## What We're NOT Doing

- **No AI estimation proxy (F-02).** We create the `estimation_runs` table this slice's sibling foundation will later write into, but no serverless endpoint, no AI key handling, no estimation logic.
- **No PIN access gate (S-12).** The identity here is the under-the-hood Supabase owner user. The owner-facing PIN lock is a separate, blocked slice.
- **No feature UI.** No meal-logging screen, no day view, no profile screen. The repo is exercised by the smoke script and, at most, a throwaway dev harness — not real screens.
- **No profile / body-weight / exercise / saved-meal tables.** Per the "core log only" decision, those tables are created by their own slices (S-02 / S-08 / S-09) via their own migrations.
- **No `meal_component` table.** The meal schema is flat now; per-component structure (OQ-6) is added later by an additive migration.
- **No photo upload/download code.** The private bucket and its policy are provisioned, but capture/upload wiring belongs to S-03.
- **No offline write queue.** Offline capture is a PRD Non-Goal. Reads get cache persistence for resilience; writes require connectivity.
- **No Supabase Realtime.** Cross-client freshness is fetch-on-focus, matching `has_realtime: false`.

## Implementation Approach

Build backend-first, then the client, then the access layer, then verify:

1. Define the whole store as versioned Supabase CLI migrations (schema + RLS + storage policy + owner seed), so the schema is reviewable, replayable, and lives in the repo — every later slice extends it the same way.
2. Wire the cross-platform Supabase client and establish the single owner session, keeping the owner's password out of the shipped bundle.
3. Layer a typed repository + TanStack Query cache (with AsyncStorage persistence and focus-driven refetch) as the single seam later slices reuse.
4. Prove US-07 with a runnable smoke script plus a documented two-client manual check.

## Critical Implementation Details

- **Owner-credential delivery (security).** `EXPO_PUBLIC_*` vars are baked into the static web bundle. The Supabase URL and anon key go there safely (public by design; RLS enforces privacy). The **owner user's password must never** be an `EXPO_PUBLIC_` var, or anyone who loads the web bundle could extract it and sign in. Critically, the Expo client **only** reads `EXPO_PUBLIC_`-prefixed vars at runtime — a non-public `.env` key is invisible to the app runtime (it reaches only Node: Metro config and the smoke script). So the app cannot auto-read the password from `.env`; the session must come from a **minimal one-time credential input** (Phase 2 §4) whose token is then persisted (AsyncStorage on native, browser storage on web) — the owner enters credentials once per client at setup, never during daily use (daily access is the S-12 PIN). The **git-ignored** secret file (`.env.local`, see F2 fix) holds the owner credentials for the **Node smoke/seed script only** — never for any `EXPO_PUBLIC_` value or the app runtime.
- **Cross-platform session storage.** On native, `createClient` must use the AsyncStorage adapter and an `AppState` listener toggling `startAutoRefresh`/`stopAutoRefresh`; on web the default browser storage is correct and no `AppState` wiring applies. Use a `src/lib/supabase.ts` / `src/lib/supabase.web.ts` split (matching the repo's existing platform-file convention) rather than inline `Platform.OS` branches.
- **Soft-delete invariant.** Every read path (repo queries, RLS-visible selects the app relies on) must filter `deleted_at IS NULL`. A row is never hard-deleted by the client; deletes set `deleted_at = now()`. This is what lets a delete on one client propagate without the row resurrecting from the other client's stale cache.
- **updated_at ordering.** Last-write-wins depends on `updated_at` being authoritative. Set it via a Postgres `BEFORE UPDATE` trigger (server clock), not the client, so clock skew between two devices can't corrupt conflict ordering.

---

## Phase 1: Backend scaffold — Supabase CLI, schema, RLS, storage

### Overview

Create the Supabase project scaffolding and define the entire store as versioned migrations: the two core tables with their sync metadata and enums, the `updated_at` trigger, owner-scoped RLS, a private Storage bucket with an owner policy, and the single pre-provisioned owner user. No client code in this phase.

### Changes Required

#### 1. Supabase CLI project scaffold

**File**: `supabase/config.toml` (+ `supabase/` tree), created by `supabase init`

**Intent**: Introduce the Supabase CLI project so schema, policies, and seeds live in the repo as replayable migrations rather than dashboard clicks. Establish a local dev stack for iteration and a linked cloud project for the real single-owner store.

**Contract**: A `supabase/` directory with `config.toml` and a `migrations/` folder. Document (in the change folder or CLAUDE.md) the two Supabase surfaces: the linked cloud project (owner's real data) and the local stack (`supabase start` / `supabase db reset`) for development. `supabase/.temp` and any secrets stay git-ignored.

#### 2. Core schema migration

**File**: `supabase/migrations/<ts>_core_log_schema.sql`

**Intent**: Create the minimal core log the north star writes into, shaped to survive OQ-6 (flat meal now; a component table can be added later additively) and to support two-client sync (UUID PKs, timestamps, soft-delete).

**Contract**: Two tables plus supporting enums/trigger.
- Enum `entry_section`: `breakfast | snack | lunch | bite | supper` (fixed order per FR-056).
- Enum `entry_source`: `label_scan | plate_photo | free_text | saved_meal | manual | exercise_estimate` (FR-006 — full set defined now even though only some paths exist yet).
- Table `estimation_runs`: `id uuid pk default gen_random_uuid()`, `owner_id uuid not null` (FK to `auth.users`), `source entry_source not null`, `input_summary text`, `raw_result jsonb`, `created_at timestamptz not null default now()`. (No `updated_at`/soft-delete — a run is an immutable record of one estimation.)
- Table `meal_entries`: `id uuid pk` (client may supply a UUID for optimistic insert; default `gen_random_uuid()`), `owner_id uuid not null` (FK `auth.users`), `logged_at timestamptz not null` (the day/time the entry counts toward), `section entry_section not null`, `source entry_source not null`, `name text not null`, `calories numeric`, `protein_g numeric`, `carbs_g numeric`, `fat_g numeric`, `estimation_run_id uuid null` (FK `estimation_runs`), `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`, `deleted_at timestamptz null`.
- Indexes: `meal_entries (owner_id, logged_at)` for day queries; partial index or query convention on `deleted_at IS NULL`.
- **Day-boundary convention:** `logged_at` is stored as `timestamptz` (an absolute instant); "the day" an entry belongs to is defined in the **owner's local timezone**. The DB stays timezone-agnostic — day bucketing is computed by the client (see the repo contract in Phase 3 §3), which converts a local calendar date into `[start, end)` UTC instants for the query. This convention is the spine of every later day view / subtotal / budget / trend, so it is fixed here.
- A `BEFORE UPDATE` trigger on `meal_entries` setting `updated_at = now()`.

#### 3. RLS policies migration

**File**: `supabase/migrations/<ts>_rls.sql`

**Intent**: Make the store private — all rows are readable/writable only by the authenticated owner, enforcing FR-007 privacy at the database layer (not by hiding the anon key).

**Contract**: `ENABLE ROW LEVEL SECURITY` on both tables. Policies for `select/insert/update/delete` gated on `owner_id = auth.uid()`, with `insert` also `WITH CHECK (owner_id = auth.uid())`. Because there is exactly one owner, these policies effectively scope the whole store to that single identity while still being correct RLS.

#### 4. Private Storage bucket + policy migration

**File**: `supabase/migrations/<ts>_storage.sql`

**Intent**: Lay FR-007 groundwork — a private bucket for evidence photos exists and is proven owner-only — without shipping any upload code (that's S-03).

**Contract**: Create a **private** (non-public) Storage bucket (e.g. `meal-photos`) and RLS policies on `storage.objects` restricting all operations for that bucket to `owner_id = auth.uid()`. Document the intended object path convention (e.g. `meal-photos/<meal_entry_id>.jpg`) in a comment for S-03 to follow. No client helpers.

#### 5. Owner user provisioning

**File**: `supabase/migrations/<ts>_owner_seed.sql` or a documented one-time CLI/dashboard step

**Intent**: Create the single pre-provisioned Supabase auth user that is the store's identity, so both clients authenticate as the same uid.

**Contract**: Exactly one `auth.users` row for the owner. Because seeding auth users in a migration is environment-sensitive, the plan's contract is: the owner user is created once (via `supabase` admin API / dashboard for the cloud project, and via a seed for the local stack), and its uid is what every `owner_id` references. Credentials are recorded only in the git-ignored `.env` (never an `EXPO_PUBLIC_` var). Document the exact creation step in the change folder.

### Success Criteria

#### Automated Verification

- Local stack starts: `supabase start`
- Migrations apply cleanly from scratch: `supabase db reset`
- Schema lint / diff shows no drift: `supabase db lint` (or `supabase db diff` reports empty after reset)

#### Manual Verification

- In the local Studio, both tables exist with the expected columns, enums, indexes, and the `updated_at` trigger.
- RLS is enabled on both tables and the storage bucket is private with an owner-only policy.
- A SQL check confirms an anonymous/other-identity session cannot select rows, and the owner identity can.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Client Supabase integration + session bootstrap

### Overview

Wire the cross-platform Supabase client into the Expo app, configure env-based project credentials, and establish the single owner session so the app boots authenticated — keeping the owner password out of the shipped bundle.

### Changes Required

#### 1. Client dependencies

**File**: `package.json`

**Intent**: Add the Supabase client and its React Native runtime dependencies.

**Contract**: Install via `npx expo install @supabase/supabase-js @react-native-async-storage/async-storage react-native-url-polyfill` so versions match the Expo SDK 57 matrix. `react-native-url-polyfill/auto` is imported at the app entry.

#### 2. Environment configuration

**File**: `.env` (public build values), `.env.local` (secrets, git-ignored), `.env.example`, and app config as needed

**Intent**: Provide the Supabase URL and anon key to the client as public-safe build-time values, and keep owner credentials in a file that is actually git-ignored.

**Contract**: Public build values `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` live in `.env` (documented in `.env.example`). The owner sign-in credentials used by the Node smoke/seed script (Phase 4) live in **`.env.local`** as **non-`EXPO_PUBLIC_`** keys — `.env.local` is already covered by the existing `.gitignore` pattern `.env*.local` (line 34), whereas a **bare `.env` is NOT ignored** and is committed by Expo convention. Do not place any secret in `.env`. No git repo exists yet; confirm `.env.local` is ignored before the first `git init` + commit so credentials never enter history.

#### 3. Cross-platform Supabase client

**File**: `src/lib/supabase.ts` (native) + `src/lib/supabase.web.ts` (web)

**Intent**: Export a configured `supabase` client per platform, following the repo's platform-file convention.

**Contract**: Native file: `createClient(EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, { auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } })`, plus an `AppState` listener calling `supabase.auth.startAutoRefresh()` on `active` and `stopAutoRefresh()` otherwise. Web file: same call without the AsyncStorage adapter (default browser storage) and without the `AppState` wiring. Both import `react-native-url-polyfill/auto`. Imported everywhere as `@/lib/supabase`.

#### 4. Owner session bootstrap

**File**: `src/lib/session.ts` + a minimal one-time credential input (`src/components/owner-sign-in.tsx`), integrated into `src/app/_layout.tsx`

**Intent**: Ensure the app runs inside an authenticated owner session, obtained by a one-time sign-in whose token is then persisted, so the password never ships in the bundle.

**Contract**: A bootstrap that, on launch, checks `supabase.auth.getSession()`; if a session exists, it renders the app. If none exists, it shows a **minimal one-time credential input** (a bare email/password `TextInput` + submit — unstyled is fine; this is infra UI, not feature UI) that calls `supabase.auth.signInWithPassword`; the resulting session is persisted by the client (Phase 2 §3) so credentials are entered once per client at setup and never again. Expose the session/loading state to the root layout so it gates rendering on "session ready." **The credentials cannot come from a non-public `.env` at runtime** — the Expo client only inlines `EXPO_PUBLIC_`-prefixed vars, and the owner password must not be one of those (it would ship in the static web bundle). The git-ignored secret file is for the Node smoke script only (Phase 4), not the app runtime. This minimal input is also the seam the S-12 PIN gate later sits on top of.

### Success Criteria

#### Automated Verification

- Type checking passes: `tsc --noEmit` (or the project's `tsc` invocation)
- Linting passes: `npm run lint`
- App bundles for web without error: `npx expo export --platform web` (or dev server boots)

#### Manual Verification

- Launching the app on native and on web both reach an authenticated state; `supabase.auth.getUser()` returns the owner uid on both.
- No owner password is present in the exported web bundle (grep the export output for the password string — absent).
- Killing and relaunching the app restores the session without re-entering credentials (persistence works).

**Implementation Note**: Pause for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Repository + TanStack Query + cache persistence

### Overview

Add the typed data-access seam every later slice reuses: domain models, a repository wrapping Supabase CRUD, and a TanStack Query cache with AsyncStorage persistence and focus-driven refetch implementing fetch-on-focus + last-write-wins.

### Changes Required

#### 1. Query/persistence dependencies

**File**: `package.json`

**Intent**: Add TanStack Query and its persistence adapters.

**Contract**: Install `@tanstack/react-query`, `@tanstack/react-query-persist-client`, and `@tanstack/query-async-storage-persister` (versions compatible with React 19.2 / RN 0.86). Also `npx expo install expo-crypto` to provide `Crypto.randomUUID()` for client-generated meal-entry ids (React Native has no global `crypto.randomUUID()`).

#### 2. Domain models

**File**: `src/data/types.ts`

**Intent**: Typed representations of the store rows the app manipulates, shared by the repo and later UI.

**Contract**: A `MealEntry` type mirroring the table columns (with `Section` and `EntrySource` string-literal unions matching the DB enums), an `EstimationRun` type, and insert/update input types (e.g. `NewMealEntry`, `MealEntryPatch`). No component type yet (OQ-6 deferred).

#### 3. Repository

**File**: `src/data/meal-entries.repo.ts`

**Intent**: The single reusable seam over `supabase` for the core log — the one place query logic lives, so later slices and the smoke script share it.

**Contract**: Functions — `createMealEntry(input): Promise<MealEntry>` (generates the UUID client-side via `expo-crypto`'s `Crypto.randomUUID()` for optimistic insert; the column still defaults to `gen_random_uuid()` server-side if omitted), `listMealEntriesForDay(date): Promise<MealEntry[]>` (takes a local calendar date, converts it to a `[start, end)` UTC instant range in the **owner's local timezone** per the Phase 1 §2 day-boundary convention, then filters `owner_id`, that `logged_at` range, and `deleted_at IS NULL`, ordered by `logged_at`), `updateMealEntry(id, patch): Promise<MealEntry>`, `softDeleteMealEntry(id): Promise<void>` (sets `deleted_at`). All calls go through `@/lib/supabase`; none bypass the repo. Optionally a matching `estimation-runs.repo.ts` insert used later by F-02.

#### 4. Query client + persistence provider

**File**: `src/data/query-client.ts` + edit `src/app/_layout.tsx`

**Intent**: Provide a shared `QueryClient` with cache persisted to storage (read resilience across restarts/outages) and wire it into the root layout above the existing providers.

**Contract**: A `QueryClient` and an AsyncStorage-backed persister; wrap the app in `PersistQueryClientProvider` inside `_layout.tsx` (outermost of the app providers, so `ThemeProvider`/`AppTabs` sit within it). Reasonable `staleTime`/`gcTime` defaults for a low-write single-user app.

#### 5. Focus & online managers (fetch-on-focus)

**File**: `src/data/query-runtime.ts` (or inline in `query-client.ts`), native only where applicable

**Intent**: Make TanStack Query refetch when a screen/app regains focus, realizing fetch-on-focus cross-client freshness without Realtime.

**Contract**: Wire `focusManager` to `AppState` `change` events (native) so foregrounding triggers refetch; `onlineManager` reflects connectivity. Web relies on the library's default window-focus behavior. Last-write-wins needs no extra code beyond the server `updated_at` ordering established in Phase 1.

### Success Criteria

#### Automated Verification

- Type checking passes: `tsc --noEmit`
- Linting passes: `npm run lint`
- The repo round-trips against the local stack: a small script/call creates, lists, updates, and soft-deletes a `meal_entries` row and observes each effect (may be folded into the Phase 4 smoke script).

#### Manual Verification

- With the local stack running, a created entry appears in `listMealEntriesForDay`, an update changes `updated_at`, and a soft-delete removes it from the list while the row remains in the table with `deleted_at` set.
- Cache persistence: after a cold restart with the backend briefly unreachable, the last-seen day still renders from persisted cache.

**Implementation Note**: Pause for manual confirmation before proceeding to Phase 4.

---

## Phase 4: Cross-client parity verification (US-07)

### Overview

Prove the foundation actually delivers a single synced store: a runnable smoke script exercises the repo end-to-end against the real project, and a documented manual walkthrough confirms a write on one client shows on the other. Record the store contract for later slices.

### Changes Required

#### 1. Seed / smoke script

**File**: `scripts/smoke-store.ts` (run via `npx tsx` or an added npm script)

**Intent**: A repeatable proof that schema, RLS, and last-write-wins all work against the real store — doubling as living documentation of the repo contract.

**Contract**: A Node script that authenticates as the owner (credentials from the git-ignored `.env.local`), then via the repo: creates a `meal_entries` row, lists it for its day, updates a macro (asserts `updated_at` advanced → LWW ordering), soft-deletes it (asserts it drops from the list but the row persists with `deleted_at`), and exits non-zero on any failed assertion. Optionally attempts a read under a non-owner/anon session and asserts it returns nothing (RLS proof).

#### 2. Two-client manual walkthrough doc

**File**: `context/changes/synced-data-backbone/verification.md`

**Intent**: Define the US-07 acceptance procedure that automation can't cover (two real clients).

**Contract**: Step list — run web build and native build signed in as the owner; create an entry on web; foreground/refocus native; confirm the entry appears; edit on native; refocus web; confirm the edit appears. Record pass/fail and the observed refresh latency (expected on focus, not instant).

#### 3. Store-contract documentation

**File**: `CLAUDE.md` (append a short "Data layer" note) and/or `context/changes/synced-data-backbone/verification.md`

**Intent**: Tell later slices how to use the backbone (repo seam, enums, sync fields, soft-delete/`deleted_at` filtering, how to add a table via migration) so they extend it consistently.

**Contract**: A concise note covering: import `@/lib/supabase`; go through `src/data/*.repo.ts`; always filter `deleted_at IS NULL`; every table carries `owner_id` + sync fields + RLS; add new tables via a new `supabase/migrations/*` file.

### Success Criteria

#### Automated Verification

- Smoke script passes end-to-end: `npx tsx scripts/smoke-store.ts` exits 0
- RLS assertion in the script passes (non-owner read returns nothing)
- Type checking and lint still pass: `tsc --noEmit` && `npm run lint`

#### Manual Verification

- US-07 walkthrough passes: an entry created on web appears on native after focus, and an edit on native appears on web after focus.
- The observed cross-client latency is within the eventual-sync tolerance (appears on next focus, no manual reconciliation needed).
- `verification.md` records the run and result.

**Implementation Note**: This phase closes the slice. After US-07 passes and docs are updated, the foundation is done and unblocks S-01 / S-02 / F-02 integration.

---

## Testing Strategy

### Unit Tests

- No test runner is configured and standing one up is explicitly out of scope for this foundation. The repo seam is verified functionally by the smoke script rather than by unit tests. (A later slice may introduce Jest per `https://docs.expo.dev/develop/unit-testing/`; when it does, the repo's pure input/output shape is the natural first target.)

### Integration Tests

- The `scripts/smoke-store.ts` script is the integration check: it drives the real repo against a real Supabase project through the full create/list/update/soft-delete lifecycle and asserts RLS.

### Manual Testing Steps

1. `supabase db reset` on the local stack; confirm schema, enums, trigger, RLS, and private bucket exist.
2. Launch native and web; confirm both reach the authenticated owner session and survive relaunch.
3. Run `scripts/smoke-store.ts`; confirm exit 0 and RLS assertion.
4. Perform the two-client US-07 walkthrough in `verification.md`; confirm parity on focus.
5. Confirm no owner password appears in the exported web bundle.

## Performance Considerations

Single user, ~3–8 writes/day — throughput is a non-concern (PRD NFR). The only performance-relevant choices are the `(owner_id, logged_at)` index for day queries and the persisted query cache for read resilience during a brief outage; both are already in the plan. Avoid Realtime subscriptions (unneeded cost/complexity given `has_realtime: false`).

## Migration Notes

This is greenfield — no existing data to migrate. The forward-looking migration concern is OQ-6: when per-component plates are chosen, add a `meal_component` table (FK to `meal_entries`) via a new migration; because `meal_entries` is flat and additive, this is non-breaking. The `entry_source` enum already includes all six source markers, so no enum migration is needed as capture paths land. New per-slice tables (profile, body-weight, exercise, saved meals) each arrive as their own `supabase/migrations/*` files.

## References

- Roadmap: `context/foundation/roadmap.md` (F-01)
- PRD: `context/foundation/prd.md` (FR-043, FR-041, FR-007, FR-006, US-07; NFRs on eventual sync)
- Tech stack: `context/foundation/tech-stack.md` (`has_realtime: false`, Supabase pairing)
- Expo SDK 57 docs: `https://docs.expo.dev/versions/v57.0.0/`
- Supabase + Expo integration: `https://supabase.com/docs/guides/getting-started/tutorials/with-expo-react-native`
- Root layout to extend: `src/app/_layout.tsx`; platform-file convention: `src/hooks/use-color-scheme.ts` / `.web.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Backend scaffold — Supabase CLI, schema, RLS, storage

#### Automated

- [ ] 1.1 Local stack starts: `supabase start`
- [ ] 1.2 Migrations apply cleanly from scratch: `supabase db reset`
- [ ] 1.3 Schema lint/diff shows no drift: `supabase db lint` (or empty `db diff` after reset)

#### Manual

- [ ] 1.4 Both tables exist with expected columns, enums, indexes, and the `updated_at` trigger
- [ ] 1.5 RLS enabled on both tables; storage bucket is private with owner-only policy
- [ ] 1.6 SQL check confirms non-owner cannot select rows and owner can

### Phase 2: Client Supabase integration + session bootstrap

#### Automated

- [ ] 2.1 Type checking passes: `tsc --noEmit`
- [ ] 2.2 Linting passes: `npm run lint`
- [ ] 2.3 App bundles for web without error: `npx expo export --platform web`

#### Manual

- [ ] 2.4 Native and web both reach an authenticated owner session (`getUser()` returns owner uid)
- [ ] 2.5 No owner password present in the exported web bundle
- [ ] 2.6 Session persists across a kill/relaunch without re-entering credentials

### Phase 3: Repository + TanStack Query + cache persistence

#### Automated

- [ ] 3.1 Type checking passes: `tsc --noEmit`
- [ ] 3.2 Linting passes: `npm run lint`
- [ ] 3.3 Repo round-trips against the local stack (create/list/update/soft-delete observed)

#### Manual

- [ ] 3.4 Create/update/soft-delete behave correctly (update advances `updated_at`; soft-delete drops from list, row retained with `deleted_at`)
- [ ] 3.5 Persisted cache renders the last-seen day after a cold restart with backend briefly unreachable

### Phase 4: Cross-client parity verification (US-07)

#### Automated

- [ ] 4.1 Smoke script passes end-to-end: `npx tsx scripts/smoke-store.ts` exits 0
- [ ] 4.2 RLS assertion passes (non-owner read returns nothing)
- [ ] 4.3 Type checking and lint still pass

#### Manual

- [ ] 4.4 US-07 walkthrough passes: web-created entry appears on native after focus; native edit appears on web after focus
- [ ] 4.5 Observed cross-client latency within eventual-sync tolerance (on focus, no manual reconciliation)
- [ ] 4.6 `verification.md` records the run and result
