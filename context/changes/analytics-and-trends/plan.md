# Analytics and Trends (S-11) Implementation Plan

## Overview

The owner gets a third "Analytics" tab showing intake, expenditure, and net trends over rolling 7-day/30-day windows (each with a 7-day moving average), a day-level adherence signal (on/over/under budget, ±5% tolerance) color-coded directly into the net-trend chart, and body weight plotted against a new numeric goal. Tapping any day in the net-trend chart opens a generalized version of Today's day view for that date, satisfying FR-031's browse-and-edit requirement.

## Current State Analysis

Everything this slice needs to read is already in place and working: `profile.repo.ts` + `derive-targets.ts` + `effective-targets.ts` compute the resting daily target; `day-ledger.ts` (`computeDayLedger`) computes a day's consumed/burned/net from that day's meal entries and training sessions; `body-weights.repo.ts` holds the logged weight series. All three domains are exposed through hooks (`useTargets`, `useDayEntries`, `useDaySessions`, `useBodyWeights`) that follow one shared convention: a `queryKeys` factory keyed on `localDayKey` (device-tz `YYYY-MM-DD`), and — critically — every day-scoped hook re-derives "now" per render rather than freezing it, per the one existing lesson in `context/foundation/lessons.md`.

What's missing, verified by direct inspection:
- **No multi-day query exists anywhere.** `listMealEntriesForDay`/`listTrainingSessionsForDay` (`src/data/meal-entries.repo.ts:48`, `src/data/training-sessions.repo.ts:51`) are day-only; `listBodyWeights` (`src/data/body-weights.repo.ts:40`) is unbounded-all with no range filter.
- **No historical target storage.** `effectiveTargets` (`src/lib/effective-targets.ts:27`) is always computed from the *current* profile row and *latest* weight reading — there is no per-day snapshot, and the profile row itself carries no version history.
- **No numeric weight goal.** `Profile` (`src/data/types.ts:155`) has a directional `goal: BodyGoal` enum (`lose`/`maintain`/`gain`) but no target-weight number to plot a reference line against.
- **No charting library.** `package.json` has no svg/chart dependency of any kind.
- **Only two tabs exist**, with an explicit comment in both `src/components/app-tabs.tsx` and `app-tabs.web.tsx` that the two files must be kept in sync when a tab is added.
- **`(today)/index.tsx` is hardcoded to the current day** — its own header comment says so, naming this slice as the one that changes it. Its underlying hooks (`useDayEntries(date?)`, `useDaySessions(date?)`) already accept an optional `date`, so the generalization needed is in the *screen*, not the data layer.

## Desired End State

Opening the new Analytics tab shows, for a rolling 7-day or 30-day window (owner-toggleable):
- an Intake trend panel (daily consumed calories + 7-day moving average),
- an Expenditure trend panel (daily burned calories + 7-day moving average),
- a Net-vs-Budget panel (daily net calories against the resting target, each day colored by on/over/under classification with a non-color shape cue, a 7-day moving average line, and a summary count e.g. "5 on · 1 over · 1 under"),
- a Weight-vs-Goal panel (logged weight line + a flat reference line at the owner's `target_weight_kg`, once set).

Tapping any day in the Net-vs-Budget panel opens that day's full section view — the same UI Today renders, parameterized by date — where entries and sessions can be edited, re-sectioned, or deleted exactly as they can today. Every metric a chart reads (target, consumed, burned, net) comes from the exact same functions Today and Profile already use (`effectiveTargets`, `computeDayLedger`) — this slice adds range plumbing and presentation, not new domain math.

Verify via: `npm run smoke:analytics` (new script, see Phase 7) plus manual walkthrough of the Analytics tab against real logged data spanning at least 8 days (per the PRD's own 8-week continuity criterion, a shorter window is fine for verification).

### Key Discoveries:

- `computeDayLedger(entries, sessions, target)` (`src/lib/day-ledger.ts:30`) already returns exactly `{ consumed, burned, net, target }` per day — the adherence classifier and every trend panel is a thin wrapper over calling this once per day in the range, not new arithmetic.
- `groupEntriesBySection` (`src/lib/group-by-section.ts:27`) sets the precedent to follow for the new day-grouping helper: always emit every bucket (there, all 5 sections; here, every day in the range), even when a bucket has zero rows — so a moving average and an adherence count never have to special-case a gap.
- The day-boundary math itself (`new Date(y, m, d)` in device-local tz, converted via `.toISOString()` for the Postgres range) is identical in `listMealEntriesForDay` and `listTrainingSessionsForDay` — a ranged variant just applies that same construction once to the range's two edges instead of once per day.
- `useTargets()` (`src/data/use-profile.ts:42`) already composes `useProfile()` + `useLatestBodyWeight()` — the hook layer, not the repo layer, is where multi-table composition happens in this codebase, which is the template for the daily-targets snapshot orchestration below.

## What We're NOT Doing

- Source-mix / confidence flagging (mentioned only in the PRD's Business Logic narrative, not in any FR-03x) — out of scope.
- A weight rate-of-change or goal-ETA projection — FR-033 gets a plain plot plus a flat goal reference line, nothing computed beyond that.
- A custom/arbitrary date-range picker — only the two rolling windows (7-day, 30-day) FR-032 names.
- Composing new entries into a past day from the analytics day-view — that view supports edit/re-section/delete of what's already logged (FR-031's literal ask); adding new meals to a past day is a distinct, unrequested capability.
- Retroactively correcting historical days' targets from before this feature ships beyond a one-time backfill with today's effective target — there is no profile version history to reconstruct true historical accuracy from, and no FR asks for it.
- Any chart interaction beyond tap-to-open-day (no pinch-zoom, no pan, no tooltips-on-hover) — this is a personal app on a phone-first product; keep the chart surface minimal.

## Implementation Approach

Work bottom-up: land the data model and range-query plumbing first (Phases 1–2), then the pure trend math (Phase 3, fully unit-testable via the smoke convention with zero UI), then the chart components (Phase 4) and the screen that assembles them (Phase 5), then the past-day edit path (Phase 6), then verification (Phase 7). Each phase after the third can be manually checked incrementally against real data, since Phases 1–3 alone are enough to smoke-test the entire range/target/adherence logic before any pixel is drawn.

## Critical Implementation Details

**Daily-target snapshot capture and immutability.** A `daily_targets` row, once it exists for a given `(owner_id, day)`, is never overwritten — it is the answer to "what was the target in effect the first time this day was touched," not a live-updating cache. Two distinct write paths both use the same insert-if-absent primitive (`ensureDailyTarget`, Phase 1): (1) going forward, the *screens* that call `useCreateMealEntry`/`useCreateTrainingSession` (both already render inside a component and already have `useTargets()` in scope for other reasons) pass the current `Targets` value into the mutation call as part of its input variables — `useCreateMealEntry`/`useCreateTrainingSession`'s own `onSuccess` then calls `ensureDailyTarget(day, targets)` using that passed-in value, since a mutation's `onSuccess` is a plain callback, not a render context, and cannot call `useTargets()` (a hook) itself; (2) for days that already have entries from before this feature shipped, the analytics range hook calls it lazily for any day in its fetched range that has no snapshot yet, using the *current* effective target as a best-effort stand-in (this is the only data available — there is no profile history to do better). Both paths converge on the same "insert if absent, never update" write, so which path fires first for a given day doesn't matter.

**Re-derive the rolling window's end date per render.** Per the existing lesson in `context/foundation/lessons.md`, the range hooks (Phase 2) must resolve "today" (the trailing window's end) the same way `useDayEntries` does — recomputed on every render and returned alongside the query result, never captured once in a `useMemo(() => new Date(), [])`. A session held open across midnight must see the window's end date roll forward exactly like Today already does.

## Phase 1: Data model

### Overview

Adds the one new table (`daily_targets`) and the one new column (`profile.target_weight_kg`) this slice needs, plus the repo functions over them.

### Changes Required:

#### 1. `daily_targets` migration

**File**: `supabase/migrations/<timestamp>_daily_targets.sql`

**Intent**: Persist an immutable per-day snapshot of the effective target, so past days in the trend chart can be judged against the target that was captured for that day rather than whatever the profile says today.

**Contract**: New table `daily_targets` following the exact `training_sessions` migration shape (`supabase/migrations/20260729140000_training_sessions.sql`) for the shared parts: `id uuid pk`, `owner_id uuid references auth.users`, `created_at`/`updated_at`/`deleted_at`, the shared `set_updated_at` trigger, and the same four-policy owner-scoped RLS set. Table-specific columns: `day date not null` (the pre-computed local calendar day — this table intentionally stores a plain `date`, not a `timestamptz`, since the value written is already the resolved local-day key, unlike every other table's `logged_at`/`measured_at` instant), `calories numeric not null`, `protein_g numeric not null`, `carbs_g numeric not null`, `fat_g numeric not null`. Unique index on `(owner_id, day)` — **not partial** (no `WHERE deleted_at IS NULL`), matching the plain-unique-constraint shape `profile.repo.ts:45`'s `onConflict: 'owner_id'` already relies on. A row here is never soft-deleted by any phase, so a partial predicate would only break `ON CONFLICT` arbiter inference (Postgres requires an exact non-partial match, and supabase-js's `onConflict` option has no way to repeat a `WHERE` predicate) for no benefit.

#### 2. `profile.target_weight_kg` migration

**File**: `supabase/migrations/<timestamp>_profile_target_weight.sql`

**Intent**: Give FR-033's "against the goal" a concrete number to plot, mirroring how the existing `*_target_override` columns are optional owner-set values layered onto derivation.

**Contract**: `alter table public.profile add column target_weight_kg numeric;` with a `check (target_weight_kg is null or target_weight_kg > 0)` constraint, following the same positivity-check pattern as `20260725120000_profile_weight_positivity_checks.sql`.

#### 3. `daily-targets.repo.ts`

**File**: `src/data/daily-targets.repo.ts`

**Intent**: The one place `daily_targets` query logic lives, mirroring every other repo's shape (`requireOwnerId` + soft-delete-filtered reads).

**Contract**: `getDailyTargetsForRange(startDay: Date, endDay: Date): Promise<DailyTarget[]>` — same local-tz range construction as `listMealEntriesForDay`, applied once to the range's two edges. `ensureDailyTarget(day: Date, targets: Targets): Promise<DailyTarget>` — insert with `onConflict: 'owner_id,day', ignoreDuplicates: true`, then re-select the row for that day so the return value is always the *stored* (possibly pre-existing) snapshot, never silently the caller's input when a row already existed.

#### 4. `Profile`/`ProfilePatch` types and `profile.repo.ts`

**File**: `src/data/types.ts`, `src/data/profile.repo.ts`

**Intent**: Thread `target_weight_kg` through the existing profile read/write path.

**Contract**: Add `target_weight_kg: number | null` to `Profile` and to `ProfilePatch` (nullable, following the same `null` = "clear it" convention the four target overrides already use). No repo function signature changes — `upsertProfile`'s existing `patch` spread already forwards any field present on the type.

### Success Criteria:

#### Automated Verification:

- Migrations apply cleanly against the local/dev Supabase project
- `npx tsc --noEmit` passes with the new types wired through
- `npm run lint` passes

#### Manual Verification:

- Inserting the same `(owner_id, day)` twice via `ensureDailyTarget` (e.g. from a scratch script) returns the first snapshot both times, unchanged by the second call's input

---

## Phase 2: Range queries & grouping

### Overview

The multi-day read path: one ranged repo query per table, plus a client-side grouping helper that buckets rows (and daily-target snapshots) into every day of the range, including days with no rows at all.

### Changes Required:

#### 1. Ranged repo queries

**File**: `src/data/meal-entries.repo.ts`, `src/data/training-sessions.repo.ts`

**Intent**: A single query per table covering a whole date range, rather than one query per day.

**Contract**: `listMealEntriesForRange(startDate: Date, endDate: Date): Promise<MealEntry[]>` and `listTrainingSessionsForRange(startDate: Date, endDate: Date): Promise<TrainingSession[]>` — local-day start of `startDate` to local-day start of the day *after* `endDate` (mirroring the existing `[start, end)` half-open convention), `deleted_at IS NULL`, ordered ascending by `logged_at`. Body weight needs no new repo function: `listBodyWeights()` already returns the full (small) series, and the analytics hook filters it client-side to the selected range — adding a ranged variant here would duplicate an unbounded read that's already cheap at this app's scale.

#### 2. Day-grouping helper

**File**: `src/lib/group-by-local-day.ts`

**Intent**: Bucket a range's rows into one array per calendar day, so every downstream consumer (moving average, adherence classifier) can assume a fixed-length, gap-free day list — the same "always every bucket" guarantee `group-by-section.ts` gives the day view.

**Contract**: `groupByLocalDay<T>(rows: T[], getDate: (row: T) => Date, days: Date[]): T[][]` — returns one array per entry in `days` (in the same order), with rows filtered by `localDayKey` match; a day with no matching rows gets `[]`, not an omitted slot.

#### 3. Range hooks

**File**: `src/data/use-analytics.ts`

**Intent**: The React-facing seam composing the ranged repo reads, the daily-targets backfill, and the day-grouping into one hook per rolling window.

**Contract**: `useAnalyticsRange(windowDays: 7 | 30)` — resolves `endDay` the same re-derive-per-render way `useDayEntries` does (see Critical Implementation Details), computes `startDay = endDay - (windowDays - 1)`, queries meal entries, training sessions, and daily targets for `[startDay, endDay]` (query key includes `localDayKey(startDay)`/`localDayKey(endDay)` and `windowDays`, following the `queryKeys` factory convention), backfills any day in range missing a `daily_targets` row via `ensureDailyTarget` (fire-and-forget mutation, using the current `useTargets()` value), and returns `{ days, endDay, isPending, isError }` where `days` is one entry per day in the range: `{ day: Date, consumed, burned, net, target }`.

### Success Criteria:

#### Automated Verification:

- `npm run smoke:analytics` (stubbed in this phase, filled in fully by Phase 7) can call `listMealEntriesForRange`/`listTrainingSessionsForRange` against fixture data and get back exactly the rows within the range boundary, none outside it
- `npx tsc --noEmit` passes

#### Manual Verification:

- With real logged data spanning several days, `useAnalyticsRange(7)` returns exactly 7 day-buckets in order, including any day that has zero entries

---

## Phase 3: Trend math

### Overview

Pure, dependency-free helpers — moving average and adherence classification — following the project's established `src/lib` pattern (same shape as `day-ledger.ts`, `sum-training-burn.ts`) so the smoke script asserts against the same code the UI runs.

### Changes Required:

#### 1. Moving average

**File**: `src/lib/moving-average.ts`

**Intent**: Smooth a day-by-day series for the trend panels.

**Contract**: `movingAverage(values: number[], windowSize: number): number[]` — trailing window; for index `i`, averages over `values[max(0, i - windowSize + 1) .. i]` (a partial window at the start of the series rather than `null` or omission, so the earliest days of a new range still show a smoothed line — consistent with not gating the whole screen on a minimum-data threshold).

#### 2. Adherence classification

**File**: `src/lib/adherence.ts`

**Intent**: Turn a day's net-vs-target into the on/over/under signal FR-034 asks for.

**Contract**: `classifyDayAdherence(net: number, target: number | null, tolerance = 0.05): 'on' | 'over' | 'under' | null` — `null` when `target` is `null` (no profile/weight yet, mirroring `DayLedger.target`'s own nullability); otherwise `'on'` when `Math.abs(net - target) <= tolerance * target`, `'over'` when `net > target`, `'under'` when `net < target`, band-checked before the over/under comparison so the ±5% window wins first.

### Success Criteria:

#### Automated Verification:

- Smoke coverage (Phase 7) asserts exact `movingAverage` output against a hand-computed small series, and `classifyDayAdherence` boundary cases at exactly the ±5% edges
- `npx tsc --noEmit` passes

---

## Phase 4: Chart components

### Overview

Adds `react-native-svg` (not currently a dependency) and a small set of hand-rolled, theme-aware chart primitives — no charting library, per the resolved chart-library decision (victory-native XL has no official web support, which conflicts with this app's desktop-browser requirement).

### Changes Required:

#### 1. Dependency

**File**: `package.json`

**Intent**: The one new dependency this slice needs.

**Contract**: Add `react-native-svg` at the version Expo SDK 57 recommends (`npx expo install react-native-svg` resolves the compatible version).

#### 2. Line/reference chart primitive

**File**: `src/components/charts/trend-line-chart.tsx`

**Intent**: One reusable chart used by all four panels — a daily series rendered as points/line, an optional overlaid moving-average line (dashed), an optional flat reference line (target or goal), and an optional per-point color+shape override for the adherence-coded panel.

**Contract**: Props: `data: { x: Date; y: number }[]`, `movingAverage?: number[]`, `referenceValue?: number`, `pointStyle?: (point, index) => { color: ThemeColor; shape: 'circle' | 'diamond' | 'triangle' }`. Renders via `react-native-svg` primitives (`Svg`, `Path`/`Line`, `Circle`), reading colors from `Colors`/`useTheme()` per `CLAUDE.md`'s theming rule rather than hardcoded hex. The non-color shape distinction (`pointStyle`'s `shape`) exists so the adherence coding in Phase 5 stays legible without relying on color alone.

### Success Criteria:

#### Manual Verification:

- The chart renders correctly in both light and dark theme
- The chart renders on web (react-native-web) as well as iOS/Android — the whole reason victory-native XL was ruled out

---

## Phase 5: Analytics screen & navigation

### Overview

Wires everything above into a third tab: the route group, the tab-bar entries in both platform-split files, the screen itself, and the one new profile field.

### Changes Required:

#### 1. Tab bar entries

**File**: `src/components/app-tabs.tsx`, `src/components/app-tabs.web.tsx`

**Intent**: A third, equally-discoverable tab — the resolved decision was a top-level tab, not a screen nested under Profile.

**Contract**: Add a third `NativeTabs.Trigger name="(analytics)"` (native) and `TabTrigger name="analytics" href="/(analytics)"` (web), following the exact pattern the existing two triggers use in each file — both files updated together, per their own in-file warning comments.

#### 2. Route group

**File**: `src/app/(analytics)/_layout.tsx`, `src/app/(analytics)/index.tsx`

**Intent**: The Analytics screen itself.

**Contract**: `_layout.tsx` mirrors `(profile)/_layout.tsx`'s bare Stack shape. `index.tsx` renders a 7d/30d toggle, calls `useAnalyticsRange(windowDays)`, and assembles four `TrendLineChart` instances: Intake (raw `consumed` + its moving average), Expenditure (raw `burned` + its moving average), Net-vs-Budget (raw `net` + its moving average, `referenceValue = target`, `pointStyle` driven by `classifyDayAdherence`, plus a summary count line above the chart), and Weight-vs-Goal (from `useBodyWeights()` filtered to the range, `referenceValue = profile.target_weight_kg`).

#### 3. Profile form field

**File**: `src/app/(profile)/index.tsx`

**Intent**: Let the owner set the number the Weight-vs-Goal panel needs.

**Contract**: One new numeric input for `target_weight_kg`, alongside the existing target-override inputs, wired through the same `useUpsertProfile()` mutation already used there.

### Success Criteria:

#### Automated Verification:

- `npx tsc --noEmit` passes
- `npm run lint` passes

#### Manual Verification:

- The Analytics tab appears identically positioned on native and web builds
- Toggling 7d/30d updates all four panels
- Setting a `target_weight_kg` in Profile makes the goal reference line appear on the Weight panel

---

## Phase 6: Past-day browse & edit

### Overview

Satisfies FR-031: tapping a day in the Net-vs-Budget chart opens that day's full section view, editable exactly like Today.

### Changes Required:

#### 1. Extract the shared day view

**File**: `src/components/day-view.tsx` (new), `src/app/(today)/index.tsx` (refactored to use it)

**Intent**: Today's screen already renders exactly what a past day needs (grouped sections, subtotals, `DayLedger`, training list, navigation to entry/session detail) — pull that rendering out into a component parameterized by `date`, so Today becomes a thin wrapper that also renders the composer, and the new past-day route is an equally thin wrapper that doesn't.

**Contract**: `DayView({ date, showComposer }: { date: Date; showComposer: boolean })` — the existing `SectionList` + `ListHeaderComponent` (`DayTotal`, `DayLedger`, `TrainingSection`) block from `(today)/index.tsx`, unchanged in behavior, now driven by the `date` prop instead of an internal `useDayEntries()` call with no argument. `(today)/index.tsx` keeps its own `useDayEntries()`/`useDaySessions()` calls (still defaulting to today) and renders `<DayView date={day} showComposer />` plus the composer/quick-action row above it.

#### 2. Past-day route

**File**: `src/app/(analytics)/day.tsx`, `src/app/(today)/meal-detail.tsx`, `src/app/(today)/session-detail.tsx`

**Intent**: The destination of a chart tap.

**Contract**: Reads a `date` route param, renders `<DayView date={parsedDate} showComposer={false} />` under its own header (e.g. a formatted date + back navigation). Entry/session taps navigate to `/(today)/meal-detail` and `/(today)/session-detail` by absolute path, **now also passing `date` as a route param** — verified both screens (`meal-detail.tsx:34`, `session-detail.tsx:27`) currently call `useDayEntries()`/`useDaySessions()` with no argument (defaulting to today) and find the tapped entry by filtering *that* day's list for a matching `id`, so a past-day id would silently 404 into `MissingMealEntry` without this. Both hooks already accept an optional `date` (confirmed), so `meal-detail.tsx`/`session-detail.tsx` need only read the new `date` param and pass it through — `useDayEntries(date)` / `useDaySessions(date)` — instead of calling them bare; when navigated from Today, `date` is simply omitted/undefined and the existing today-default behavior is unchanged.

#### 3. Chart-tap wiring

**File**: `src/app/(analytics)/index.tsx`

**Intent**: Connect the Net-vs-Budget panel to the new route.

**Contract**: `TrendLineChart`'s point-tap handler (new `onPointPress?: (point) => void` prop on the Phase 4 component) calls `router.push({ pathname: '/(analytics)/day', params: { date: point.x.toISOString() } })` for the Net-vs-Budget panel only.

### Success Criteria:

#### Automated Verification:

- `npx tsc --noEmit` passes

#### Manual Verification:

- Tapping a past day in the chart opens that day's entries and sessions, editable
- Editing/deleting/re-sectioning an entry on a past day updates that day's subtotal and, on returning to Analytics, the corresponding chart point
- Cross-group navigation to `/(today)/meal-detail` and `/(today)/session-detail` from within `(analytics)/day.tsx` resolves correctly

---

## Phase 7: Verification

### Overview

Smoke coverage for the new pure logic and range queries, following the project's no-Jest, script-based convention.

### Changes Required:

#### 1. Analytics smoke script

**File**: `scripts/analytics-smoke.ts`, `scripts/run-analytics-smoke.mjs`, `package.json` (`smoke:analytics` script entry)

**Intent**: Assert the range queries, the snapshot immutability, the grouping helper, and the trend math against real (or fixture) data, mirroring `scripts/training-smoke.ts`'s structure.

**Contract**: Covers: `listMealEntriesForRange`/`listTrainingSessionsForRange` return exactly the rows within range boundaries; `ensureDailyTarget` called twice for the same day with different `Targets` returns the *first* snapshot both times; `groupByLocalDay` produces one bucket per requested day including empty ones; `movingAverage` matches a hand-computed series; `classifyDayAdherence` is correct at the exact ±5% boundary.

### Success Criteria:

#### Automated Verification:

- `npm run smoke:analytics` passes
- `npm run smoke` (full suite) still passes
- `npm run lint` passes
- `npx tsc --noEmit` passes

#### Manual Verification:

- Full walkthrough: log meals/sessions across several real days, open Analytics, confirm all four panels populate correctly, toggle 7d/30d, tap into a past day and edit it, confirm the chart reflects the edit
- Cross-client parity: an edit made to a past day on one client is visible on the other after a refetch-on-focus (no Realtime, per the project's eventual-sync model)

---

## Testing Strategy

### Unit Tests:

- (No Jest configured project-wide; covered by the smoke script instead.) `movingAverage`, `classifyDayAdherence`, `groupByLocalDay` are pure functions asserted directly in `analytics-smoke.ts`.

### Integration Tests:

- `listMealEntriesForRange`/`listTrainingSessionsForRange`/`ensureDailyTarget` against a real Supabase project via the smoke script (per project convention, no mocking of the database).

### Manual Testing Steps:

1. Log meals and training sessions across at least 8 real (or fixture-seeded) days.
2. Open the new Analytics tab; confirm Intake, Expenditure, Net-vs-Budget, and Weight-vs-Goal panels all render.
3. Toggle between 7d and 30d; confirm all panels update to the new window.
4. Set a `target_weight_kg` in Profile; confirm the goal reference line appears on the Weight panel.
5. Tap a day in the Net-vs-Budget chart; confirm it opens that day's entries/sessions, editable.
6. Edit an entry on that past day; return to Analytics; confirm the chart point updated.
7. Repeat step 5–6 from a second client (or the web build) to confirm cross-client parity.

## Performance Considerations

None beyond what's already noted: the single-ranged-query-plus-client-grouping design (Phase 2) keeps a 30-day view at one query per table rather than ~30, which matters more for perceived latency than for server load at this app's scale (a few entries/day, single owner). This doesn't cover the one-time `daily_targets` backfill: the first time a range with no existing snapshots is opened, `useAnalyticsRange` can fire up to `windowDays` individual fire-and-forget `ensureDailyTarget` inserts. Harmless at this app's single-owner scale — noted here only so it isn't mistaken for a case the "one query per table" framing above already covers.

## Migration Notes

Both migrations in Phase 1 are additive (new table, new nullable column) — no backfill migration is needed for `target_weight_kg` (defaults to `null`, treated as "no goal set yet" in the UI). `daily_targets` needs no bulk backfill either; it fills in lazily per Phase 2's `ensureDailyTarget` calls the first time each day is touched by a write or an analytics read.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-11, lines 226–236)
- PRD requirements: FR-031, FR-032, FR-033, FR-034 (`context/foundation/prd.md`)
- Prior slice handoffs: `context/archive/2026-07-24-profile-and-targets/plan.md` (explicit "not doing analytics" callout), `context/archive/2026-07-29-training-and-dynamic-budget/plan.md` (explicit "browsing past days is S-11" callout)
- Pattern precedents: `src/lib/group-by-section.ts`, `src/lib/day-ledger.ts`, `src/data/use-profile.ts` (`useTargets`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data model

#### Automated

- [x] 1.1 Migrations apply cleanly against the local/dev Supabase project — 790fb5e
- [x] 1.2 `npx tsc --noEmit` passes with the new types wired through — 790fb5e
- [x] 1.3 `npm run lint` passes — 790fb5e

#### Manual

- [x] 1.4 `ensureDailyTarget` called twice for the same day returns the first snapshot both times — 790fb5e

### Phase 2: Range queries & grouping

#### Automated

- [x] 2.1 Ranged repo queries return exactly the rows within range boundaries (stubbed smoke) — 48bca40
- [x] 2.2 `npx tsc --noEmit` passes — 48bca40

#### Manual

- [x] 2.3 `useAnalyticsRange(7)` returns exactly 7 day-buckets in order, including empty days — 2b51dec

### Phase 3: Trend math

#### Automated

- [x] 3.1 `movingAverage` matches a hand-computed series — 10b248a
- [x] 3.2 `classifyDayAdherence` boundary cases at exactly the ±5% edges are correct — 10b248a
- [x] 3.3 `npx tsc --noEmit` passes — 10b248a

### Phase 4: Chart components

#### Manual

- [x] 4.1 Chart renders correctly in both light and dark theme — 2b51dec
- [x] 4.2 Chart renders on web as well as iOS/Android — 2b51dec

### Phase 5: Analytics screen & navigation

#### Automated

- [x] 5.1 `npx tsc --noEmit` passes — 2b51dec
- [x] 5.2 `npm run lint` passes — 2b51dec

#### Manual

- [x] 5.3 Analytics tab appears identically positioned on native and web builds — 2b51dec
- [x] 5.4 Toggling 7d/30d updates all four panels — 2b51dec
- [x] 5.5 Setting `target_weight_kg` in Profile shows the goal reference line — 2b51dec

### Phase 6: Past-day browse & edit

#### Automated

- [x] 6.1 `npx tsc --noEmit` passes — 5627e2a

#### Manual

- [x] 6.2 Tapping a past day opens its entries/sessions, editable — 5627e2a
- [x] 6.3 Editing/deleting/re-sectioning on a past day updates its subtotal and the chart on return — 5627e2a
- [x] 6.4 Cross-group navigation to meal-detail/session-detail resolves correctly from the past-day route — 5627e2a

### Phase 7: Verification

#### Automated

- [x] 7.1 `npm run smoke:analytics` passes
- [x] 7.2 `npm run smoke` (full suite) still passes
- [x] 7.3 `npm run lint` passes
- [x] 7.4 `npx tsc --noEmit` passes

#### Manual

- [x] 7.5 Full walkthrough across real days: all four panels populate, range toggle works, past-day edit reflected in chart
- [x] 7.6 Cross-client parity confirmed after refetch-on-focus
