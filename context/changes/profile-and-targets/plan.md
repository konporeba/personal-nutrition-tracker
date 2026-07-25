# Profile & Derived Targets (S-02) Implementation Plan

## Overview

Give the owner a profile — height, weight, age, sex, activity level, goal — and turn
it into daily calorie and macro targets the app derives rather than asks the owner to
type (FR-020/021). Every target is overridable (FR-022), and body weight becomes its
own logged series (FR-023). The payoff lands on Today: the bare running total from
S-01 becomes *consumed vs target*, shown as a progress bar for calories and each of
the three macros (FR-030).

This is the roadmap's **S-02**, parallel to the shipped north star. Its one hard
correctness requirement — an override must never be clobbered when targets re-derive
after a stat change — is solved structurally rather than by careful update logic.

## Current State Analysis

**The data-layer pattern is fixed, proven, and the only way in.** F-01 established it
and CLAUDE.md codifies it: a new table means a new `supabase/migrations/*.sql` (schema
+ RLS scoped to `owner_id = auth.uid()` + the `created_at/updated_at/deleted_at` sync
fields + the `set_updated_at` trigger), then a matching `src/data/<name>.repo.ts`, then
`use-*.ts` hooks. UI never touches `@/lib/supabase` — verified: the only importers are
`session.ts`, `estimation.ts`, and the two `*.repo.ts` files.

- **RLS shape to copy verbatim**: `supabase/migrations/20260720120100_rls.sql` — four
  policies per table (`select/insert/update/delete`), each `to authenticated` with
  `(select auth.uid()) = owner_id`. The `(select …)` wrapper is deliberate (evaluates
  once per query, not per row).
- **The `set_updated_at` trigger and `owner_id` FK-to-`auth.users` on-delete-cascade**
  are in `20260720120000_core_log_schema.sql` — the template for both new tables.
- **`newId()`** (`@/lib/new-id`, platform-split) generates client-side UUIDs; repos pass
  `owner_id` from the session via the `requireOwnerId()` helper both existing repos share.
- **Reads go through TanStack Query hooks** with the `queryKeys` factory
  (`src/data/query-keys.ts`) and per-write invalidation (`src/data/use-meal-entries.ts`
  is the reference). The provider, persistence, and fetch-on-focus are already wired.
- **Pure, dependency-free logic lives in `src/lib`** so the esbuild-bundled Node smoke
  can import it (`section-for-time.ts`, `sum-calories.ts` are precedent). `deriveTargets`
  follows them.
- **The tab bar is platform-split and currently single-tab** — `app-tabs.tsx` (native
  `NativeTabs`) and `app-tabs.web.tsx` (`expo-router/ui`). S-01 kept both files split
  precisely so S-02 adds the second tab; both must change together or one platform
  breaks silently.
- **Today's read side** is `src/app/(today)/index.tsx` + `DayTotal`
  (`src/components/day-total.tsx`), which already sums calories via
  `sumCalories` (`src/lib/sum-calories.ts`) skipping nulls.

### Key Discoveries:

- **Model A is resolved (OQ-1, PRD:309/334).** The profile activity multiplier is fixed
  at sedentary; the derived target is a resting baseline; training is added to the day's
  budget by S-09 (FR-073), never here. Activity level is still stored (FR-020) but does
  not feed derivation.
- **The lesson from S-01 applies** (`context/foundation/lessons.md`): Today reads
  day-scoped data, so the day must re-derive per render, not freeze in `useMemo`. The
  new consumed-vs-target read inherits `useDayEntries`, which already returns `{ query, day }`.
- **PostgREST returns `numeric` as JSON numbers** (F-01 smoke asserts strict equality) —
  no coercion needed for stored stats or weights.
- **The override risk has a structural fix**: persist profile inputs + a *nullable*
  override per target, compute derived at read time, and expose `effective = override ?? derived`.
  Derived is never stored, so re-derivation cannot overwrite an override.

## Desired End State

Opening the new **Profile** tab shows the owner's stats (height, age, sex, activity
level, goal) and their current weight, with the four derived daily targets — calories,
protein, carbs, fat — displayed and each individually overridable. Editing a stat
re-derives the targets immediately; a target the owner has overridden keeps its
override and is visibly marked, with a way to clear it back to derived. Logging a body
weight adds to a history series and, because the series is the source of truth for
"current weight", re-derives the targets on the next read. Back on **Today**, the header
now shows calories and each macro as *consumed of target* with a progress bar.

Verified by `npm run smoke:profile` exiting 0 — derivation boundaries, override
survival across a stat change, latest-weight sourcing, and RLS — plus the manual UI
checks.

## What We're NOT Doing

- **The dynamic training budget** (S-09 / FR-073/075). Today shows consumed vs the
  *resting* target. The UI wording and the target seam leave room for S-09 to add
  "+ today's logged burns", but no exercise, burn, or two-sided ledger ships here.
- **Trends / analytics / weight-vs-goal plotting** (S-11 / FR-033). Weight is *logged*
  and its history is *listed*; it is not charted against the goal.
- **The five-section day view** (S-06) and **food icons** (S-05) — untouched.
- **Imperial units.** Metric only (kg, cm); the owner is a single known user.
- **A PIN gate** (S-12) — unrelated.
- **Editing history rows' timestamps** — a weight reading can be logged and soft-deleted,
  not back-dated or edited.
- **Any change to the estimate/log loop.** S-01's composer, review, and commit are
  untouched.
- **Adding Jest.** Verification follows the established smoke-script pattern.

## Implementation Approach

Five phases, each independently verifiable, mirroring the slice shape S-01 established:

1. **Data layer** — one migration adding `profile` (single row, PK = `owner_id`) and
   `body_weights` (a series), both with RLS + sync fields + trigger; the types; the two
   repos. Deliverable: the store round-trips profile and weights under RLS.
2. **Derivation core** — a pure `deriveTargets` + `effectiveTargets` in `src/lib`,
   dependency-free so the smoke imports it. Deliverable: stats + weight → four targets,
   overrides layered on top.
3. **Profile & weight UI** — the Profile tab (both platform-split files + a Stack), the
   stats/goal form with per-target override fields, and weight logging + history.
   Deliverable: the owner sets stats, sees derived targets, overrides one, logs a weight.
4. **Today integration** — `DayTotal` becomes consumed-vs-target with a progress bar for
   calories and each macro. Deliverable: FR-030 on the primary screen.
5. **Verification** — `npm run smoke:profile` + a verification doc.

The **effective target** is the seam everything shares: the Profile UI, Today, and the
smoke all read `effectiveTargets(profile, latestWeightKg)`; S-09 later wraps it with the
day's burns without any of these callers changing.

## Critical Implementation Details

**Override semantics are the crux (the roadmap's named risk).** The `profile` row stores
the five stats plus four *nullable* override columns (`calorie_target_override`,
`protein_target_override`, `carb_target_override`, `fat_target_override`). Nothing ever
writes a *derived* value to the database. `deriveTargets` computes the four numbers from
stats + weight on demand; `effectiveTargets` returns `override ?? derived` per field.
"Override a target" = write the column; "reset to derived" = set it back to `null`.
Re-derivation is therefore incapable of clobbering an override, because it never writes
targets at all.

**Current weight comes from the series, not the profile.** `profile` has no weight
column. `deriveTargets` needs a weight, so callers pass the latest `body_weights`
reading. Before any weight is logged the profile is incomplete — derivation returns a
recoverable "needs weight" state rather than a number, and the Profile UI prompts for a
first weight. Logging a weight naturally re-derives on the next read via query
invalidation.

**Derivation formula (all overridable, all in `src/lib/derive-targets.ts`):**
Mifflin-St Jeor BMR — `10·kg + 6.25·cm − 5·age + (sex === 'male' ? 5 : −161)`;
maintenance = `BMR × 1.2` (sedentary, Model A); calorie target = maintenance × the goal
factor (`lose 0.85 · maintain 1.0 · gain 1.10`). Macros: protein grams = `g/kg × weight`
with a goal-aware `g/kg` (`lose 2.0 · maintain 1.8 · gain 1.6`); fat grams = `0.275 ×
calories ÷ 9`; carbs grams = the remaining calories `÷ 4`, floored at 0. These constants
are named defaults, not tuning knobs the owner sees — the owner tunes via overrides.

## Phase 1: Data layer

### Overview

Add the two tables and their seams. No UI, no derivation — the store round-trips a
profile and a weight series under RLS.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<timestamp>_profile_and_weights.sql` (new)

**Intent**: Create the `profile` and `body_weights` tables so S-02 has somewhere to
persist stats, overrides, and the weight series — following the F-01 schema template
exactly (sync fields, trigger, RLS).

**Contract**: Two `create table` statements plus their enums, indexes, `set_updated_at`
triggers, `enable row level security`, and four owner-scoped policies each (copied from
`20260720120100_rls.sql`).
- `public.activity_level` enum: `sedentary, light, moderate, active, very_active`.
- `public.body_goal` enum: `lose, maintain, gain`. (`sex` uses a `male`/`female` enum or
  a checked text column — pick one and keep it; the BMR term needs exactly these two.)
- `public.profile`: `owner_id uuid primary key references auth.users(id) on delete
  cascade` (the PK enforces the single row), `height_cm numeric not null`, `age int not
  null`, `sex …`, `activity_level public.activity_level not null`, `goal public.body_goal
  not null`, the four nullable `*_target_override numeric` columns, then `created_at /
  updated_at / deleted_at`. No weight column.
- `public.body_weights`: `id uuid primary key default gen_random_uuid()`, `owner_id …`,
  `weight_kg numeric not null`, `measured_at timestamptz not null`, then the sync fields.
  Index `(owner_id, measured_at)` where `deleted_at is null` for the latest-reading read.

#### 2. Types

**File**: `src/data/types.ts`

**Intent**: Add the typed row shapes and insert/patch types, mirroring the existing
`MealEntry` conventions (string-literal unions for the enums, ISO strings for timestamps).

**Contract**: `ActivityLevel`, `BodyGoal`, `Sex` unions; `Profile`, `NewProfile` /
`ProfilePatch` (patch covers the five stats + four overrides); `BodyWeight`,
`NewBodyWeight`. Override fields are `number | null`.

#### 3. Repos

**File**: `src/data/profile.repo.ts`, `src/data/body-weights.repo.ts` (new)

**Intent**: The single data seam over each table, reusing the `requireOwnerId()` pattern.

**Contract**:
- `profile.repo.ts`: `getProfile(): Promise<Profile | null>` (single row, `deleted_at is
  null`), `upsertProfile(patch): Promise<Profile>` (insert-or-update on the `owner_id`
  PK). No hard delete.
- `body-weights.repo.ts`: `createBodyWeight`, `listBodyWeights` (descending
  `measured_at`, live rows), `latestBodyWeight(): Promise<BodyWeight | null>`,
  `softDeleteBodyWeight` — matching the `meal-entries.repo.ts` shapes.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`
- Migration applies cleanly to the deployed project (or local shadow) without error

#### Manual Verification:

- The two tables exist with RLS enabled and the sync-field triggers active
- An anonymous client sees zero rows from each (RLS holds)

**Implementation Note**: After completing this phase and all automated verification
passes, pause for manual confirmation before proceeding.

---

## Phase 2: Derivation core

### Overview

The pure functions that turn stats + weight into four targets, and layer overrides on
top. Dependency-free, so the smoke exercises them directly.

### Changes Required:

#### 1. Target derivation

**File**: `src/lib/derive-targets.ts` (new)

**Intent**: Encode the Mifflin-St Jeor → sedentary → goal → macro pipeline as a pure
function, kept out of any `react-native`-importing module so the Node smoke can call it
(the `sum-calories.ts` / `section-for-time.ts` pattern).

**Contract**: A `Targets = { calories, protein_g, carbs_g, fat_g }` type.
`deriveTargets(input: { height_cm; age; sex; goal; weight_kg }): Targets` — the formula
in "Critical Implementation Details". Rounds to whole numbers, floors carbs at 0. Does
**not** take `activity_level` (sedentary is fixed). Total over every valid input.

**File**: `src/lib/effective-targets.ts` (new)

**Intent**: The one place `override ?? derived` is resolved, so every caller (Profile UI,
Today, smoke) agrees on the effective number.

**Contract**: `effectiveTargets(profile: Profile, weightKg: number): Targets` — computes
`deriveTargets` from the profile's stats + `weightKg`, then returns each field as
`profile.<field>_target_override ?? derived`. A companion that reports which fields are
overridden (for the UI's marker) may live here or in the hook.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`
- Web bundle builds: `npx expo export --platform web`

#### Manual Verification:

- Spot-check one worked example by hand (a known height/weight/age/sex/goal → expected
  calories and macros) and confirm the function agrees

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 3: Profile & weight UI

### Overview

The Profile tab: stats and goal form with per-target overrides, plus weight logging and
history. This is the first form-heavy surface and the second tab in the app.

### Changes Required:

#### 1. Navigation — second tab

**File**: `src/components/app-tabs.tsx`, `src/components/app-tabs.web.tsx`

**Intent**: Add the Profile tab beside Today. Both platform variants change together or
one platform breaks silently.

**Contract**: Native: a second `NativeTabs.Trigger name="(profile)"` labelled "Profile"
with an icon (reuse a bundled `tabIcons` asset). Web: a second `TabTrigger name="profile"
href="/profile"`. The existing Today trigger is unchanged.

**File**: `src/app/(profile)/_layout.tsx` (new)

**Intent**: A Stack for the Profile tab so weight history can be pushed over the form,
mirroring `(today)/_layout.tsx`.

**Contract**: Default-exports `<Stack>` with the themed header options from the Today
layout; the index screen sets its own header.

#### 2. Profile screen

**File**: `src/app/(profile)/index.tsx` (new)

**Intent**: Show and edit the stats, show the four derived/effective targets, allow
overriding each, and surface current weight with a way into weight logging.

**Contract**: Consumes `useProfile()` and `useTargets()` (new hooks over the repos +
`effectiveTargets`). Stats are controlled inputs (numeric where numeric — reuse the
`review.tsx` numeric-field discipline: empty → unset, non-numeric rejected); sex,
activity level, and goal are pickers over their unions. Each target shows its effective
value, whether it's overridden, an override input, and a "reset to derived" control that
writes `null`. Saving calls `upsertProfile`; the targets re-render from the new stats.
Before any weight exists, the target area shows a "log your weight to see targets" prompt
rather than numbers. Built from `ThemedText`/`ThemedView` + the `Spacing` scale.

#### 3. Weight logging & history

**File**: `src/app/(profile)/weight.tsx` (new), `src/data/use-body-weights.ts` (new)

**Intent**: Log a new body weight and list the history; long-press to delete a reading,
consistent with the meal-row delete.

**Contract**: `use-body-weights.ts` exports `useBodyWeights()` (list), `useLatestBodyWeight()`,
`useCreateBodyWeight()`, `useDeleteBodyWeight()` — mutations invalidate both the
weight-list key and the targets/profile key (a new weight changes the derived targets).
`weight.tsx` is a numeric entry + a descending list of readings; long-press soft-deletes.
Reachable from the profile screen via the Stack.

#### 4. Query keys & profile hook

**File**: `src/data/query-keys.ts`, `src/data/use-profile.ts` (new)

**Intent**: Extend the key factory for the new reads and add the profile/targets hooks.

**Contract**: `queryKeys` gains `profile()` and `bodyWeights.all()` / `bodyWeights.latest()`.
`use-profile.ts` exports `useProfile()` (the row) and `useTargets()` (composes `useProfile`
+ `useLatestBodyWeight` through `effectiveTargets`, returning the four numbers, the
overridden-field set, and a "needs weight" flag) and `useUpsertProfile()` (invalidates
the profile + targets keys).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`
- Web bundle builds: `npx expo export --platform web`

#### Manual Verification:

- Entering stats + a weight shows four derived targets
- Overriding one target persists it; editing an unrelated stat re-derives the other three
  but leaves the override intact
- "Reset to derived" clears an override back to the computed number
- Logging a weight updates current weight and re-derives; the reading appears in history
- Long-press deletes a weight reading; it stays gone after reload
- Profile and Today both reachable via tabs on native and web; light and dark legible

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 4: Today integration

### Overview

Turn the S-01 running total into consumed-vs-target: a progress bar for calories and
each of the three macros, against the effective (resting) targets.

### Changes Required:

#### 1. Consumed macros

**File**: `src/lib/sum-macros.ts` (new)

**Intent**: Sum the day's protein/carbs/fat the way `sumCalories` sums calories —
null-skipping — so Today can show consumed grams per macro.

**Contract**: `sumMacros(entries): { protein_g; carbs_g; fat_g }`, each a null-skipping
sum. Dependency-free (smoke-importable). `sumCalories` stays as is.

#### 2. Progress display

**File**: `src/components/day-total.tsx`, `src/components/macro-progress.tsx` (new)

**Intent**: Replace the bare total with four consumed-vs-target rows (calories + macros),
each a labelled progress bar; wire Today's effective targets in.

**Contract**: `macro-progress.tsx` renders one row — label, `consumed / target unit`, and
a bar filled to `clamp(consumed / target, 0, 1)` (over-target renders full, not
overflowing; a null/absent target renders consumed with no bar rather than dividing by
zero or fabricating a denominator). `DayTotal` takes the day's entries + the `Targets`
and renders the four rows via `sumCalories` / `sumMacros`. When the profile has no weight
yet (no targets), it falls back to the S-01 bare-total presentation with a hint to set up
the profile.

**File**: `src/app/(today)/index.tsx`

**Intent**: Feed Today's `useTargets()` into `DayTotal`.

**Contract**: Today reads `useTargets()` and passes the result to `DayTotal` alongside the
day entries. The `{ query, day }` day-scoping from S-01 is unchanged (per the re-derive
lesson).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`
- Web bundle builds: `npx expo export --platform web`

#### Manual Verification:

- Today shows calories and all three macros as consumed vs target with progress bars
- Committing a meal advances the bars without a manual refresh
- An overridden target is the denominator the bar fills against
- With no profile weight yet, Today degrades to the bare total with a setup hint
- Light and dark both legible

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 5: Verification

### Overview

Prove the data path and the derivation automatically, matching the smoke pattern of the
two shipped slices.

### Changes Required:

#### 1. Smoke script

**File**: `scripts/profile-smoke.ts`, `scripts/run-profile-smoke.mjs` (new), `package.json`

**Intent**: One command driving the real seams against the deployed backend, so S-02's
core claims are machine-checked.

**Contract**: `run-profile-smoke.mjs` reuses the esbuild `nodeShim` from
`run-estimate-smoke.mjs` verbatim. `profile-smoke.ts` signs in as the owner, then asserts:
`deriveTargets` matches hand-computed values at several stat sets (including the worked
example); `upsertProfile` then `getProfile` round-trips the stats; setting an override and
changing an unrelated stat leaves the override intact while the others re-derive
(`effectiveTargets`); a logged `body_weights` reading is returned by `latestBodyWeight` and
drives derivation; a soft-deleted reading drops from the list and the latest falls back to
the prior reading; an anonymous client sees zero rows from both tables (RLS). Cleans up
what it created (weights first is moot — no FK between the two — but delete test weights
and reset/soft-delete the profile row). New script `"smoke:profile"`, same `--env-file`
invocation.

#### 2. Verification doc

**File**: `context/changes/profile-and-targets/verification.md` (new)

**Intent**: The durable record of how the slice was proven, in the shape the archived
slices use.

**Contract**: Sections for the automated smoke (recorded run + exit code), the manual
checks from Phases 1–4, any deviations, and a Known Gaps list (e.g. metric-only; the
resting-budget-only Today pending S-09).

### Success Criteria:

#### Automated Verification:

- Smoke passes end-to-end: `npm run smoke:profile` exits 0
- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`
- Prior smokes still pass: `npm run smoke`, `npm run smoke:estimate`, `npm run smoke:log`

#### Manual Verification:

- The full profile → targets → override → weight → Today loop works on a device or
  simulator
- Cross-client parity: a profile/target change on one client appears on the other after a
  focus refetch (US-07)
- `verification.md` records a real run with its output

---

## Testing Strategy

No test runner exists and this slice does not add one — verification follows the repo's
established smoke pattern.

### Automated (smoke + static):

- `npm run smoke:profile` — derivation boundaries, profile round-trip, override survival
  across a stat change, latest-weight sourcing + fallback, and RLS, against the deployed
  backend
- `npx tsc --noEmit` and `npm run lint` on every phase
- `npx expo export --platform web` as the bundler-level check

### Manual Testing Steps:

1. Enter stats + a first weight — confirm four derived targets appear
2. Override the calorie target, then change age — confirm calories keeps the override and
   protein/carbs/fat re-derive
3. Reset the override — confirm the derived number returns
4. Log a new, different weight — confirm current weight updates and targets re-derive
5. Long-press a weight reading — confirm it deletes and stays deleted after reload
6. On Today, commit a meal — confirm the calorie and macro bars advance
7. Before setting up the profile, open Today — confirm the bare-total fallback with a hint
8. Log a profile change on the phone, open web — confirm it appears (US-07)

## Performance Considerations

Derivation is arithmetic on one row and one weight read — negligible; running it per
render is fine (the S-01 lesson: re-derive, don't freeze). Both new tables hold a single
row and a short series for one owner, so no pagination or indexing beyond the
latest-weight index is warranted.

## Migration Notes

Additive only — two new tables, no change to `meal_entries` or `estimation_runs`. Existing
data is untouched. Today degrades gracefully to the S-01 bare total until a profile and a
first weight exist, so the app is usable between deploying this migration and the owner
filling in the profile.

## References

- Roadmap slice S-02: `context/foundation/roadmap.md`
- PRD: US-05; FR-020/021/022/023; FR-030; Business Logic + OQ-1 (Model A), `context/foundation/prd.md`
- Data-layer pattern: `CLAUDE.md` (Data layer section), F-01 migrations
  `supabase/migrations/20260720120000_core_log_schema.sql` + `20260720120100_rls.sql`
- Repo/hook reference: `src/data/meal-entries.repo.ts`, `src/data/use-meal-entries.ts`
- Pure-lib pattern the smoke imports: `src/lib/sum-calories.ts`, `src/lib/section-for-time.ts`
- Re-derive lesson: `context/foundation/lessons.md`
- Smoke-runner shim to reuse: `scripts/run-estimate-smoke.mjs`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data layer

#### Automated

- [x] 1.1 Type checking passes: `npx tsc --noEmit` — 732684f
- [x] 1.2 Linting passes: `npm run lint` — 732684f
- [x] 1.3 Migration applies cleanly to the deployed project (or local shadow) without error — 732684f

#### Manual

- [x] 1.4 The two tables exist with RLS enabled and the sync-field triggers active — 732684f
- [x] 1.5 An anonymous client sees zero rows from each (RLS holds) — 732684f

### Phase 2: Derivation core

#### Automated

- [x] 2.1 Type checking passes: `npx tsc --noEmit` — d41ce90
- [x] 2.2 Linting passes: `npm run lint` — d41ce90
- [x] 2.3 Web bundle builds: `npx expo export --platform web` — d41ce90

#### Manual

- [x] 2.4 Spot-check one worked example by hand and confirm the function agrees — d41ce90

### Phase 3: Profile & weight UI

#### Automated

- [x] 3.1 Type checking passes: `npx tsc --noEmit` — 3d990c1
- [x] 3.2 Linting passes: `npm run lint` — 3d990c1
- [x] 3.3 Web bundle builds: `npx expo export --platform web` — 3d990c1

#### Manual

- [x] 3.4 Entering stats + a weight shows four derived targets — 3d990c1
- [x] 3.5 Overriding one target persists it; editing an unrelated stat re-derives the other three but leaves the override intact — 3d990c1
- [x] 3.6 "Reset to derived" clears an override back to the computed number — 3d990c1
- [x] 3.7 Logging a weight updates current weight and re-derives; the reading appears in history — 3d990c1
- [x] 3.8 Long-press deletes a weight reading; it stays gone after reload — 3d990c1
- [x] 3.9 Profile and Today both reachable via tabs on native and web; light and dark legible — 3d990c1

### Phase 4: Today integration

#### Automated

- [x] 4.1 Type checking passes: `npx tsc --noEmit` — 4e1248e
- [x] 4.2 Linting passes: `npm run lint` — 4e1248e
- [x] 4.3 Web bundle builds: `npx expo export --platform web` — 4e1248e

#### Manual

- [x] 4.4 Today shows calories and all three macros as consumed vs target with progress bars — 4e1248e
- [x] 4.5 Committing a meal advances the bars without a manual refresh — 4e1248e
- [x] 4.6 An overridden target is the denominator the bar fills against — 4e1248e
- [x] 4.7 With no profile weight yet, Today degrades to the bare total with a setup hint — 4e1248e
- [x] 4.8 Light and dark both legible — 4e1248e

### Phase 5: Verification

#### Automated

- [x] 5.1 Smoke passes end-to-end: `npm run smoke:profile` exits 0
- [x] 5.2 Type checking passes: `npx tsc --noEmit`
- [x] 5.3 Linting passes: `npm run lint`
- [ ] 5.4 Prior smokes still pass: `npm run smoke`, `npm run smoke:estimate`, `npm run smoke:log`

#### Manual

- [ ] 5.5 The full profile → targets → override → weight → Today loop works on a device or simulator
- [ ] 5.6 Cross-client parity: a profile/target change on one client appears on the other after a focus refetch (US-07)
- [ ] 5.7 `verification.md` records a real run with its output
