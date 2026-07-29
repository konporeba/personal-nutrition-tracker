# Training and Dynamic Budget Implementation Plan

## Overview

Let the owner log a training session (type, intensity, duration, and an owner-entered calorie burn) and see the day as a two-sided ledger — calories in, calories out, and net against an adjusted budget. The burn is purely additive on top of the existing resting target (Model A / sedentary baseline): it is never baked into `deriveTargets`, matching the forward-reference already left in `src/lib/derive-targets.ts:5-9`. Roadmap slice S-09 (`training-and-dynamic-budget`), PRD US-14 / US-15, FR-070/071/072/073/075 (FR-074 saved sessions deferred — see What We're NOT Doing).

## Current State Analysis

- `src/lib/derive-targets.ts:5-9` already documents that training is added by S-09 "never baked into the resting target" — this plan must not touch `deriveTargets`/`effectiveTargets`.
- `src/components/day-total.tsx` (the Today header) computes `sumCalories(entries)` vs `targets.calories` only — there is no burn/expenditure/net concept anywhere in the codebase yet. `context/foundation/roadmap.md:163` names this gap explicitly: *"FR-030's 'against the adjusted budget' is only fully realised once S-02 (target) and S-09 (burn adjustment) land."*
- No `training_sessions` table, repo, or hook exists. The closest structural siblings are `meal_entries` (a day-bucketed log with soft delete — the shape to mirror for a session, since a session is a log entry, not a singleton like `profile`) and `body_weights` (a simpler log with no `section`, closer in spirit since a session also has no section).
- `src/data/types.ts:16`'s `EntrySource` union already contains an `'exercise_estimate'` literal. This is an unused, unrelated leftover on `meal_entries` (a hypothetical AI-estimated exercise-adjustment entry) that predates this slice — it is not the training ledger and this plan does not touch it.
- `src/app/(today)/index.tsx:79-88` has a composer row with a "Saved meals" button (`Pressable` → `router.push('/(today)/library')`) — the pattern a new "Log training" entry point mirrors.
- `src/app/(today)/meal-detail.tsx` is the exact template for a session's edit/delete screen: `seedField`/`toNumberOrNull`/`onlyNumeric` numeric-field helpers, an `anyPending` guard combining in-flight mutations, and "tapping Delete IS the confirmation" (no `Alert.alert`).
- `src/components/macro-progress.tsx` (`MacroProgress`) is a generic, reusable labeled progress bar (consumed/target, null-safe, clamps at 100%) — directly reusable for a "Net calories vs target" bar without writing a new bar component.

## Desired End State

The owner taps "Log training" next to "Saved meals" on Today, fills in a type (free text), an intensity (low/moderate/high), a duration in minutes, and a burn in kcal, and submits. The session appears in a "Training" list on Today; tapping it opens an edit/delete screen mirroring meal-detail. A new `DayLedger` component, rendered in Today's header alongside the existing `DayTotal`, shows calories in (consumed), out (burned), and net (in − out) — with net shown as a progress bar against the resting target when one exists (reusing `MacroProgress`), or as a plain number when it doesn't (profile/weight not set up yet). Editing or deleting a session recalculates the ledger immediately via the existing query-invalidation pattern.

Verification: `npx tsc --noEmit`, `npm run lint`, and a new `npm run smoke:training` all pass; manual pass per phase below confirms the UI end to end.

### Key Discoveries:

- `src/data/meal-entries.repo.ts` (whole file) and `src/data/use-meal-entries.ts` (whole file) are the exact repo/hook shape to mirror: `requireOwnerId()`, day-bucketed `list*ForDay(date)` using a local-tz `[start, end)` range, `create*`/`update*`/`softDelete*`, and mutations that invalidate by the entry's own `logged_at` (not "today") — see `use-meal-entries.ts:39-54`'s comment on why.
- `supabase/migrations/20260720120000_core_log_schema.sql:63-94` (`meal_entries`) and `supabase/migrations/20260727120000_saved_meals.sql` (RLS four-policy shape, `set_updated_at` trigger reuse) are the migration templates.
- `supabase/migrations/20260725120000_profile_weight_positivity_checks.sql` shows the project's convention for `check` constraints on positive numeric inputs — for a brand-new table these go directly in the creating migration (no follow-up needed, unlike that file's case where the base migration had already shipped).
- `src/lib/sum-calories.ts` / `src/lib/sum-macros.ts` / `src/lib/derive-targets.ts` are all dependency-free (`src/lib`, no `react-native` import) specifically so the esbuild-bundled Node smoke scripts can import them directly — any new ledger math must follow this same placement.
- `scripts/day-view-smoke.ts` + `scripts/run-day-view-smoke.mjs` is the smoke-script template: pure-function assertions first, then a live round trip against the deployed backend (sign in as owner, create/update, assert, hard-delete in a `finally`).
- `src/app/(today)/index.tsx:108`'s `ListHeaderComponent={<DayTotal .../>}` is a single element today; it becomes a short fragment once `DayLedger` and the Training list are added.

## What We're NOT Doing

- **FR-074 saved training sessions** (one-tap re-log) — the roadmap itself marks this nice-to-have/optional, and it depends on real repeat-session data existing first. Deferred to a follow-up change.
- **Browsing or editing training sessions on past days** — `useDayEntries`-equivalent stays today-only, matching the existing meal-entries scope (browsing past days is S-11).
- **Any icon/category system for training sessions** — not required by FR-070–075; sessions render with a text label, not an icon.
- **Computing burn from a MET table or AI estimate** — OQ-9 is resolved: burn is owner-entered directly (FR-071), typically copied from a third-party tracker. No estimation call is ever made for a session.
- **Any change to `deriveTargets`/`effectiveTargets`** — the resting target stays sedentary-fixed; burn is applied only in the new ledger math, never folded into the stored/derived target.
- **A fixed enum taxonomy for session type** — type is free text (see Key Decisions); only `intensity` is an enum.

## Implementation Approach

Four vertical slices, each independently verifiable: (1) the data layer, so a session can be created/read/updated/deleted against the real backend before any UI exists; (2) the pure ledger math plus its smoke coverage, so the arithmetic is proven correct in isolation; (3) the logging UI (composer, detail, list), so a session can be logged and managed end-to-end; (4) the ledger display, wiring the proven math into Today's header. This mirrors the "data model → business logic → UI" ordering already used by prior slices in this codebase.

## Critical Implementation Details

**Net-ledger math and `MacroProgress` reuse.** `computeDayLedger` returns `net = consumed - burned`, which can be negative on a day where logged burn exceeds logged intake. `MacroProgress`'s `fraction` calculation (`macro-progress.tsx:31`) clamps to `[0, 1]`, so a negative `consumed` value renders a 0%-filled bar — but the numeric label above it must still show the true (possibly negative) net number, not a clamped one. `DayLedger` passes `ledger.net` straight through to `MacroProgress`'s `consumed` prop; no clamping happens before that call, only inside the bar-width calculation, so this falls out correctly with no special-casing needed — worth knowing so the implementer doesn't add a redundant `Math.max(0, net)` guard that would silently hide a real over-budget day.

## Phase 1: Training-sessions data layer

### Overview

A new `training_sessions` table and its full repo/hook seam, mirroring `meal_entries`, so a session can be created, listed for a day, updated, and soft-deleted against the real backend before any UI exists.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20260729140000_training_sessions.sql` (new)

**Intent**: Create the `training_sessions` table and its supporting enum, index, trigger, and RLS — the log-entry shape (surrogate `uuid` PK + `owner_id` FK, not the `profile` singleton shape), mirroring `meal_entries`/`saved_meals` exactly.

**Contract**:
```sql
create type public.training_intensity as enum ('low', 'moderate', 'high');

create table public.training_sessions (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users (id) on delete cascade,
  logged_at        timestamptz not null,
  session_type     text not null,
  intensity        public.training_intensity not null,
  duration_minutes int not null,
  burn_kcal        numeric not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  constraint training_sessions_duration_minutes_positive check (duration_minutes > 0),
  constraint training_sessions_burn_kcal_positive check (burn_kcal > 0)
);
```
Plus: a partial index `training_sessions_owner_logged_at_idx on (owner_id, logged_at) where deleted_at is null` (mirroring `meal_entries_owner_logged_at_idx`); a `training_sessions_set_updated_at` trigger reusing the existing `public.set_updated_at()` function; and the standard four owner-scoped RLS policies (select/insert/update/delete, each `to authenticated` with `(select auth.uid()) = owner_id`), copied verbatim in shape from `20260727120000_saved_meals.sql`'s policies.

#### 2. Types

**File**: `src/data/types.ts`

**Intent**: Typed representations of the new table and its enum, following the existing `MealEntry`/`NewMealEntry`/`MealEntryPatch` triad exactly.

**Contract**: New exports `TrainingIntensity` (`'low' | 'moderate' | 'high'`), `TrainingSession`, `NewTrainingSession` (all fields required except optional client-supplied `id`), and `TrainingSessionPatch` (`Partial<Pick<TrainingSession, 'logged_at' | 'session_type' | 'intensity' | 'duration_minutes' | 'burn_kcal'>>`).

#### 3. Repo

**File**: `src/data/training-sessions.repo.ts` (new)

**Intent**: The data seam over `supabase` for training sessions — same four functions as `meal-entries.repo.ts`, same day-bucketing convention.

**Contract**: `createTrainingSession(input: NewTrainingSession): Promise<TrainingSession>`, `listTrainingSessionsForDay(date: Date): Promise<TrainingSession[]>` (identical `[start, end)` local-tz range logic to `listMealEntriesForDay`), `updateTrainingSession(id: string, patch: TrainingSessionPatch): Promise<TrainingSession>`, `softDeleteTrainingSession(id: string): Promise<void>`. Same `requireOwnerId()` helper, same client-generated `id` via `newId()` on create.

#### 4. Query keys

**File**: `src/data/query-keys.ts`

**Intent**: A day-bucketed key group for training sessions, following the `mealEntries` group's shape exactly.

**Contract**: Add `trainingSessions: { all: () => ['training-sessions'] as const, day: (date: Date) => ['training-sessions', 'day', localDayKey(date)] as const }` to the `queryKeys` object.

#### 5. Query hooks

**File**: `src/data/use-training-sessions.ts` (new)

**Intent**: The React-facing seam over the repo, mirroring `use-meal-entries.ts` — screens never import the repo directly.

**Contract**: `useDaySessions(date?: Date)` returning `{ query, day }` (same re-derive-per-render rationale as `useDayEntries`); `useCreateTrainingSession()`, `useUpdateTrainingSession()`, `useDeleteTrainingSession()` — each invalidating `queryKeys.trainingSessions.day(new Date(session.logged_at))` on success, matching `use-meal-entries.ts`'s invalidate-by-the-entry's-own-day pattern (not "today").

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`

#### Manual Verification:

- Applying the migration against the linked Supabase project succeeds with no errors (`training_sessions` table, `training_intensity` enum, index, trigger, and four RLS policies all present).
- From a scratch script or the Supabase dashboard, inserting a row with `duration_minutes <= 0` or `burn_kcal <= 0` is rejected by the check constraints.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Day-ledger math and smoke coverage

### Overview

The pure arithmetic for the day's ledger, dependency-free so the Node smoke script can assert against the same code the UI runs — then a smoke script proving it end to end against the deployed backend.

### Changes Required:

#### 1. Burn summation

**File**: `src/lib/sum-training-burn.ts` (new)

**Intent**: Sum a day's logged burn, mirroring `sum-calories.ts`'s shape. Unlike `sumCalories`, `burn_kcal` is a required non-null column (Phase 1's `not null` constraint), so no null-skipping is needed.

**Contract**: `export function sumTrainingBurn(sessions: { burn_kcal: number }[]): number` — a plain reduce-sum, no null handling.

#### 2. Day ledger

**File**: `src/lib/day-ledger.ts` (new)

**Intent**: The additive Model-A ledger computation — consumed, burned, and net — kept separate from `derive-targets.ts`/`effective-targets.ts` (which must stay untouched, per Current State Analysis) so the "budget" concept lives in exactly one new place.

**Contract**:
```ts
export type DayLedger = {
  consumed: number;
  burned: number;
  /** consumed − burned; compare against the plain resting target, not an adjusted one. */
  net: number;
  target: number | null;
};

export function computeDayLedger(
  entries: { calories: number | null }[],
  sessions: { burn_kcal: number }[],
  target: number | null,
): DayLedger {
  const consumed = sumCalories(entries);
  const burned = sumTrainingBurn(sessions);
  return { consumed, burned, net: consumed - burned, target };
}
```

#### 3. Smoke script

**File**: `scripts/training-smoke.ts` (new) + `scripts/run-training-smoke.mjs` (new) + `package.json`

**Intent**: Prove `computeDayLedger`/`sumTrainingBurn` are correct in isolation, then round-trip a real `training_sessions` row against the deployed backend (create, list-for-day, update `burn_kcal`, confirm the ledger recomputes, soft-delete, confirm it drops from the day read), hard-deleting fixtures in a `finally` — mirroring `day-view-smoke.ts` and its `run-day-view-smoke.mjs` wrapper exactly (same esbuild Node-shim, same owner sign-in via `.env.local`).

**Contract**: `scripts/run-training-smoke.mjs` is a copy of `run-day-view-smoke.mjs` with the entry point and outfile prefix changed to `scripts/training-smoke.ts` / `training-smoke-`. Add `"smoke:training": "node --env-file=.env --env-file-if-exists=.env.local scripts/run-training-smoke.mjs"` to `package.json`'s `scripts`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`
- New smoke passes: `npm run smoke:training`

#### Manual Verification:

- Reading `scripts/training-smoke.ts`'s console output confirms both the pure-math assertions and the live round trip printed a pass, with no leftover fixture rows in the `training_sessions` table afterward.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Log and manage a training session

### Overview

The UI to create, view, edit, and delete a training session, plus a "Training" list on Today — no ledger math wired in yet (that's Phase 4).

### Changes Required:

#### 1. Session row

**File**: `src/components/training-session-row.tsx` (new)

**Intent**: One row in the Training list — session type, intensity, duration, and burn — following `MealEntryRow`'s layout convention (left-aligned label, right-aligned value, tap navigates to detail, no long-press).

**Contract**: `TrainingSessionRow({ session, onPress }: { session: TrainingSession; onPress?: () => void })`. Shows `session.session_type` on the left (with intensity as a small secondary label beneath or beside it, e.g. "Moderate"), and `${session.burn_kcal} kcal` right-aligned, matching `MealEntryRow`'s `styles.row`/`styles.left` shape.

#### 2. Session composer

**File**: `src/app/(today)/session-composer.tsx` (new)

**Intent**: A form to log a new session — type (free text), intensity (one of three inline selectable options, styled like `MoveSectionSheet`'s selected/unselected `ThemedView type="backgroundSelected"` vs `"backgroundElement"` convention but rendered inline rather than in a modal, since there are only three fixed options), duration in minutes, and burn in kcal. `logged_at` defaults to the submission instant (`new Date().toISOString()`) — no manual time picker, matching the rest of the app's "log now" convention.

**Contract**: Default export `SessionComposerScreen`. Duration and burn fields reuse `onlyNumeric`/`toNumberOrNull`-equivalent numeric handling (duration parses to an integer, burn to a decimal) copied from `meal-detail.tsx`'s pattern. Submit calls `useCreateTrainingSession().mutate({ logged_at, session_type, intensity, duration_minutes, burn_kcal })` and navigates back on success; disabled while `session_type` is empty, duration/burn are unset, or the mutation is pending.

#### 3. Session detail

**File**: `src/app/(today)/session-detail.tsx` (new)

**Intent**: Edit or delete an already-logged session, mirroring `meal-detail.tsx`'s `DetailForm` structure exactly: resolve the entry from `useDaySessions()`'s cached list by `id` query param, a `MissingTrainingSession` fallback for a stale id, an `anyPending` guard combining save/delete, and "tapping Delete IS the confirmation" (no `Alert.alert`).

**Contract**: Default export `SessionDetailScreen`. Save calls `useUpdateTrainingSession()` with a patch of the four editable fields; Delete calls `useDeleteTrainingSession()`; both navigate back on success.

#### 4. Today screen wiring

**File**: `src/app/(today)/index.tsx`

**Intent**: Add a "Log training" entry point next to the existing "Saved meals" button, and render today's sessions as a list.

**Contract**: In the composer row (`index.tsx:79-88`), add a second `Pressable` mirroring the "Saved meals" button, navigating to `router.push('/(today)/session-composer')`, labeled "Log training". Add `const { query: sessionsQuery } = useDaySessions(day)` (same `day` the meal query already resolves, so both lists observe the same instant) and render the resolved sessions as a `TrainingSessionRow` list — a small `ThemedView` block with a "Training" label, each session's row (`onPress` → `/(today)/session-detail?id=`), and a running "Burned: `${sumTrainingBurn(sessions)}` kcal" line — inserted into `ListHeaderComponent` after the existing `<DayTotal>` element.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`
- Regression check passes: `npm run smoke:day-view` (confirms the meal-entries seam this phase's UI wiring sits beside is untouched)

#### Manual Verification:

- Tapping "Log training" opens the composer; submitting a type/intensity/duration/burn creates a session and returns to Today.
- The new session appears in the Training list on Today with the correct type, intensity, and burn.
- Tapping a session opens the detail screen showing its current values.
- Editing a value and saving persists it and returns to Today, with the list showing the updated value.
- Deleting a session from the detail screen removes it immediately (no confirmation) and returns to Today.
- Submitting the composer with an empty type, or with duration/burn left blank, is prevented (submit stays disabled).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Day ledger display

### Overview

Wire the Phase 2 ledger math into Today's header as a new `DayLedger` component, showing calories in/out/net, degrading gracefully when no profile/target exists yet.

### Changes Required:

#### 1. Day ledger component

**File**: `src/components/day-ledger.tsx` (new)

**Intent**: A sibling to `DayTotal` (not a modification of it, per the confirmed design decision) showing calories in (consumed), out (burned), and net (in − out) for the day. When a resting target exists, net is shown as a `MacroProgress` bar (label "Net calories", `consumed={ledger.net}`, `target={ledger.target}`) so a training day visibly earns back budget; when no target exists yet (no profile or no weight logged), the burned/net numbers still render as plain values — training logging must never be gated behind profile setup, matching Q7's resolution.

**Contract**: `DayLedger({ entries, sessions, target }: { entries: MealEntry[]; sessions: TrainingSession[]; target: number | null })`, computing `computeDayLedger(entries, sessions, target)` internally (mirroring `DayTotal`'s own convention of computing sums internally from raw entries/targets props, rather than receiving a pre-computed ledger).

#### 2. Today screen wiring

**File**: `src/app/(today)/index.tsx`

**Intent**: Render `DayLedger` in the header, between the existing `DayTotal` and the Training list added in Phase 3.

**Contract**: `ListHeaderComponent` becomes a short fragment: `<DayTotal .../>`, then `<DayLedger entries={entries} sessions={sessions} target={targets?.calories ?? null} />`, then the Phase 3 Training list block.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`
- Regression check passes: `npm run smoke:training` (ledger math unchanged by this phase's UI-only wiring)

#### Manual Verification:

- With a profile and weight set up, logging a training session increases the visible net-calories headroom on Today (the net bar reflects `consumed - burned` against the resting target).
- Deleting or editing a session's burn recalculates the ledger immediately after returning to Today.
- On a fresh profile-less state (or by clearing the profile), logging a session still shows the burned/net numbers on Today rather than hiding the ledger entirely.
- A day where burned exceeds consumed shows a negative net number (not clamped to zero) with the bar visually empty.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None — no unit-test runner is configured in this project (per `CLAUDE.md`); correctness is covered by `tsc`, `lint`, and the smoke scripts below.

### Integration Tests:

- `npm run smoke:training` (new): pure-math assertions for `computeDayLedger`/`sumTrainingBurn`, plus a live round trip — create a session, confirm it appears in `listTrainingSessionsForDay`, update its `burn_kcal`, confirm the ledger recomputes, soft-delete, confirm it drops from the day read.
- `npm run smoke:day-view` (regression): confirms the meal-entries seam is unaffected by this slice's additions.

### Manual Testing Steps:

1. Log a training session via "Log training" (type, intensity, duration, burn).
2. Confirm it appears in Today's Training list with the entered values.
3. Confirm the day ledger shows in/out/net, and that net reflects the burn.
4. Tap the session, edit its burn value, save, and confirm the ledger updates.
5. Delete the session and confirm the ledger returns to its pre-session state.
6. Repeat steps 1–3 on a profile-less test account (or after clearing the profile) and confirm the ledger still shows burned/net without requiring a target.

## Performance Considerations

None beyond what's already handled — a day's session count is on the order of 0–2 (single owner), and the list/ledger read from the same cached per-day queries the rest of Today already holds.

## Migration Notes

None — this is a net-new table with no existing data to migrate.

## References

- Roadmap slice: `context/foundation/roadmap.md` — S-09 `training-and-dynamic-budget`
- PRD: `context/foundation/prd.md` — US-14, US-15, FR-070–075, Business Logic ("Dynamic daily budget"), OQ-1 (Model A), OQ-9 (owner-entered burn)
- Template for the data layer: `src/data/meal-entries.repo.ts`, `src/data/use-meal-entries.ts`
- Template for the detail/edit screen: `src/app/(today)/meal-detail.tsx`
- Template for the smoke script: `scripts/day-view-smoke.ts`, `scripts/run-day-view-smoke.mjs`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Training-sessions data layer

#### Automated

- [x] 1.1 Type checking passes: `npx tsc --noEmit`
- [x] 1.2 Linting passes: `npm run lint`

#### Manual

- [x] 1.3 Migration applies cleanly with table, enum, index, trigger, and RLS all present
- [x] 1.4 Check constraints reject non-positive `duration_minutes`/`burn_kcal`

### Phase 2: Day-ledger math and smoke coverage

#### Automated

- [ ] 2.1 Type checking passes: `npx tsc --noEmit`
- [ ] 2.2 Linting passes: `npm run lint`
- [ ] 2.3 New smoke passes: `npm run smoke:training`

#### Manual

- [ ] 2.4 Smoke output confirms pure-math and live round-trip assertions pass, no leftover fixtures

### Phase 3: Log and manage a training session

#### Automated

- [ ] 3.1 Type checking passes: `npx tsc --noEmit`
- [ ] 3.2 Linting passes: `npm run lint`
- [ ] 3.3 Regression check passes: `npm run smoke:day-view`

#### Manual

- [ ] 3.4 "Log training" opens the composer; submitting creates a session and returns to Today
- [ ] 3.5 New session appears in the Training list with correct values
- [ ] 3.6 Tapping a session opens its detail screen with current values
- [ ] 3.7 Editing and saving persists the change and updates the list
- [ ] 3.8 Deleting removes the session immediately with no confirmation
- [ ] 3.9 Composer submit is disabled with an empty type or missing duration/burn

### Phase 4: Day ledger display

#### Automated

- [ ] 4.1 Type checking passes: `npx tsc --noEmit`
- [ ] 4.2 Linting passes: `npm run lint`
- [ ] 4.3 Regression check passes: `npm run smoke:training`

#### Manual

- [ ] 4.4 Logging a session increases visible net-calories headroom vs the resting target
- [ ] 4.5 Editing/deleting a session's burn recalculates the ledger after returning to Today
- [ ] 4.6 Profile-less state still shows burned/net numbers rather than hiding the ledger
- [ ] 4.7 A day with burned > consumed shows a negative net number, bar visually empty
