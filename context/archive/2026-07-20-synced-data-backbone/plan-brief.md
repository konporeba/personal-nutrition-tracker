# Synced Data Backbone (F-01) — Plan Brief

> Full plan: `context/changes/synced-data-backbone/plan.md`

## What & Why

Every logging slice needs somewhere private to write, and both the phone and the desktop web build must see the same data (US-07, FR-043/FR-041). This foundation stands up a single-owner Supabase store, seeds the minimal core entity model, lays private photo-storage groundwork (FR-007), and gives the client a reusable data-access layer — so the north star (S-01) and everything after it have a backbone to build on. It ships **no feature UI**; its deliverable is the store, its access contract, and a verification path.

## Starting Point

An Expo SDK 57 client-only scaffold: `expo-router` typed routes, home-grown theming, demo screens only. Backend, database, data layer, and auth are all absent, and there's no git repo yet. `tech-stack.md` names the intended pairing (Supabase, `has_realtime: false` — eventual sync, up-to-1h outages tolerated).

## Desired End State

A single-owner Supabase project with versioned schema, RLS, and a private photo bucket. The app (native + web) boots into an authenticated owner session; a typed repository backed by TanStack Query lets any screen create, list-by-day, update, and soft-delete meal entries. A write on the web build appears on the native build on next focus (and vice versa), proven by a runnable smoke script and a two-client manual walkthrough.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Owner identity across 2 clients | One pre-provisioned Supabase user both clients sign in as | Gives RLS + private Storage a real uid while the owner still only ever sees the S-12 PIN | Plan |
| Credential delivery | Minimal one-time sign-in input; token persisted; password never in an `EXPO_PUBLIC_` var | `EXPO_PUBLIC_*` is baked into the static web bundle and is the only env the client reads at runtime, so the session must come from a one-time input, not a bundled/`.env` password | Plan |
| Schema scope | Core log only (`meal_entries` + `estimation_runs`) | Matches roadmap's "keep entities minimal"; other tables arrive with their own slices | Plan |
| OQ-6 future-proofing | Flat meal now; add `meal_component` later via additive migration | No speculative structure before OQ-6 resolves; non-breaking to extend | Plan |
| Sync metadata | UUID PK + `created_at`/`updated_at`/`deleted_at` on every row | Enables last-write-wins, propagating deletes, and optimistic inserts | Plan |
| Cross-client freshness | Fetch-on-focus + last-write-wins (no Realtime) | Matches `has_realtime: false` and the eventual-sync NFR | Plan |
| Data-access layer | Repository seam + TanStack Query (persisted cache) | One reusable seam; caching, refetch-on-focus, optimistic writes come nearly free | Plan |
| Photo storage | Provision private bucket + owner policy, no upload code | FR-007 groundwork proven private without shipping dead capture code before S-03 | Plan |
| Local cache | Persist query cache to AsyncStorage; no offline write queue | Read resilience for the 1h-outage NFR; offline capture is a Non-Goal | Plan |
| Schema management | Supabase CLI migrations (versioned SQL) | Reviewable, replayable, in-repo; every later slice extends it the same way | Plan |
| Verification | Manual two-client check + a seed/smoke script | Proves US-07's real outcome without standing up a test runner the scaffold lacks | Plan |

## Scope

**In scope:** Supabase CLI project; core schema (2 tables, section/source enums, sync fields, `updated_at` trigger); owner-scoped RLS; private Storage bucket + policy; single owner user; cross-platform Supabase client + session bootstrap; repository + TanStack Query with persisted cache and fetch-on-focus; smoke script + US-07 walkthrough + contract docs.

**Out of scope:** the AI proxy (F-02); the PIN gate (S-12); any feature UI; profile/exercise/saved-meal tables; a `meal_component` table; photo upload/download code; an offline write queue; Supabase Realtime.

## Architecture / Approach

Backend-first. Define the whole store as versioned Supabase migrations (schema + RLS + storage policy + owner seed). Wire a cross-platform `src/lib/supabase.ts` / `.web.ts` client and establish the owner session (password kept out of the bundle). Layer a typed repository (`src/data/*.repo.ts`) over the client as the single seam, with a `QueryClient` (persisted to AsyncStorage, refetch-on-focus via `AppState`) in the root layout. Verify with a smoke script and a two-client walkthrough.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Backend scaffold | Supabase CLI project, core schema, RLS, private bucket, owner user (all migrations) | Getting the entity/sync-field shape right — it ripples into every later slice |
| 2. Client integration + session | Cross-platform client, env wiring, one-time persisted owner sign-in | Keeping the owner password out of the shipped web bundle |
| 3. Repo + query layer | Typed repo seam, TanStack Query with persisted cache + fetch-on-focus | Cache/soft-delete correctness (always filter `deleted_at IS NULL`) |
| 4. Parity verification | Smoke script (RLS + LWW round-trip), US-07 two-client walkthrough, contract docs | Confirming real cross-client parity, not just a green script |

**Prerequisites:** frontend scaffold (present); a Supabase account/project and the Supabase CLI (+ Docker for the local stack) available in the dev environment.
**Estimated effort:** ~2–3 focused sessions across the four phases.

## Open Risks & Assumptions

- The owner user is created out-of-band (dashboard/admin API for cloud, seed for local); its uid anchors every `owner_id`. Script credentials live only in a git-ignored `.env.local` (the bare `.env` holds public `EXPO_PUBLIC_` values only).
- OQ-6 (per-component plates) stays open; the flat schema assumes resolving it later is an additive, non-breaking migration.
- The "day" an entry belongs to is defined in the owner's local timezone, computed client-side into UTC bounds — fixed here because it underpins every later day/subtotal/budget/trend view.
- No git repo exists yet — confirm `.env.local` is ignored (existing `.env*.local` pattern) before the first `git init` + commit so credentials never land in history.
- No test runner: correctness rests on the smoke script + manual walkthrough, not automated regression.

## Success Criteria (Summary)

- `supabase db reset` applies all migrations cleanly; the app (native + web) boots into an authenticated owner session that persists across relaunch.
- The smoke script round-trips a row (create → list → update → soft-delete) and proves RLS blocks non-owner reads.
- US-07 holds: an entry created on one client appears on the other on next focus, with no manual reconciliation.
