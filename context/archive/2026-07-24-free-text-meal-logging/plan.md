# Free-Text Meal Logging (S-01) Implementation Plan

## Overview

Wire the product's core loop end-to-end for the first time: the owner types a meal
description on the Today screen, the server-side proxy returns an AI estimate, the owner
reviews and edits it, and it commits to today's log — or, when the input isn't recognized,
the same screen becomes a manual-entry form so nothing is ever logged with a fabricated
value.

This is the roadmap's **north star** (S-01). Both prerequisites shipped (F-01 store, F-02
estimation proxy), so no backend work is required: the entire slice is the first feature UI
in the repo plus the client-side wiring between two existing seams. It replaces the Expo
starter scaffold with the actual product.

## Current State Analysis

**The seams are ready and were designed for this slice.**

- `estimateMeal(input)` (`src/data/estimation.ts:69`) returns
  `{ ok: true; runId; estimate } | { ok: false; error: 'network'|'quota'|'server' }`. It
  never throws. Critically, `recognized: false` is a **success** carrying null macros — the
  FR-008 manual-entry cue — deliberately not folded into the error union
  (`src/data/estimation.ts:5-9`).
- `createMealEntry` / `listMealEntriesForDay` / `softDeleteMealEntry`
  (`src/data/meal-entries.repo.ts`) cover every write and read this slice needs.
- `Estimate` field names were aligned to `MealEntry` on purpose "so a reviewed estimate maps
  onto a `NewMealEntry` without renaming (S-01)" (`src/data/estimation-types.ts:15`) —
  `name`, `calories`, `protein_g`, `carbs_g`, `fat_g` line up exactly.

**Everything above the seams is missing.**

- `src/app/` is still the starter scaffold: `index.tsx` is "Welcome to Expo", `explore.tsx`
  is the demo. No feature UI exists anywhere.
- **Zero `useQuery`/`useMutation` calls exist in `src/`** — verified by grep. The
  `PersistQueryClientProvider` is wired (`src/app/_layout.tsx:26`) with a 5-minute
  `staleTime` and 24-hour `gcTime` (`src/data/query-client.ts`), and fetch-on-focus is
  configured, but nothing consumes it. This slice writes the first hooks and therefore sets
  the query-key convention every later slice inherits.
- **There is no Stack navigator anywhere.** `_layout.tsx` renders `<AppTabs/>` directly, and
  `AppTabs` renders `NativeTabs` (native) / `expo-router/ui` `Tabs` (web). With no Stack,
  there is no way to push the review screen. Expo's SDK 57 native-tabs guide is explicit:
  *"nest a native `<Stack />` layout inside the native tabs to support both headers and
  pushing screens."*
- Navigation is platform-split across `app-tabs.tsx` / `app-tabs.web.tsx`; both must be
  updated together.
- **No test runner exists.** The two shipped slices verify via esbuild-bundled smoke scripts
  (`npm run smoke`, `npm run smoke:estimate`) plus `expo lint` and `tsc --noEmit`.

### Key Discoveries:

- `meal_entries.section` is `NOT NULL` on a five-value enum
  (`supabase/migrations/20260720120000_core_log_schema.sql`), but the sectioned day view is
  S-06 — so S-01 must supply a section it never displays.
- F-02 records an `EstimationRun` **even when `recognized: false`** (verification.md:56), so
  the manual-entry path still has a real `runId` to link — the audit trail survives.
- PostgREST returns `numeric` columns as JSON numbers, not strings: F-01's smoke asserts
  `updated.calories === 650` with strict equality and passes (`scripts/smoke-store.ts:88`).
  Summing calories needs no coercion.
- `listMealEntriesForDay` already converts a local calendar date to a `[start, end)` UTC
  range in the device timezone (`meal-entries.repo.ts:47`) — day bucketing is solved.
- The esbuild shim in `scripts/run-estimate-smoke.mjs` remaps `@/lib/supabase` and
  `@/lib/new-id` to their web variants so `src/data/*` loads under Node. A new smoke script
  reuses it verbatim.
- F-02 carried forward a known gap: **native-context invocation of `estimateMeal` is
  unverified** (only the web/Node path is proven). Its plan step 3.4 is still open. This
  slice's device run closes it.

## Desired End State

Opening the app lands on **Today**: a running calorie total, the day's entries, and a text
field ready for input. Typing "3 slices of pepperoni pizza" and submitting shows a spinner,
then a review screen with the estimated name, calories, and macros in editable fields plus
the assumptions the model made. Saving commits the entry — it appears in the day list and
the total updates immediately. Typing gibberish lands on the same screen with blank macros
and a "couldn't identify this" message, so the owner either fills the numbers in or backs
out; nothing is logged silently. A network failure keeps the typed text on screen with a
Retry button. Long-pressing an entry deletes it.

Verified by `npm run smoke:log` exiting 0 against the deployed backend, plus a device run
proving the native path.

## What We're NOT Doing

- **The five-section day view** (S-06). Entries get an inferred section written to the DB,
  but Today renders one flat chronological list.
- **Any budget or target** (S-02). The header shows a running total, not "X of Y remaining"
  — there is no target to divide by yet, and FR-030's "adjusted budget" also needs S-09.
- **Food icons** (S-05). The estimate's `food_category` is stored via the estimation run but
  not rendered.
- **Editing a committed entry** (S-07/FR-063). Delete-and-relog is the correction path for
  now. Delete is in; edit is not.
- **Browsing past days** (FR-031 / S-11). Today only.
- **Photo capture** (S-03/S-04), **multi-item decomposition** (FR-083, gated on OQ-6),
  **voice input** (FR-085), **saved-meal matching** (FR-086), **saved meals** (S-08).
- **Offline queueing** — a PRD Non-Goal; the app is online-only.
- **Any schema change or migration.** The existing tables cover this slice completely.
- **Adding Jest.** Verification follows the repo's established smoke-script pattern.

## Implementation Approach

Four phases, each independently verifiable:

1. **Today surface** — restructure navigation to allow pushing, delete the scaffold, and
   build the read side (query hooks + day list + total). Deliverable: Today shows real
   entries from the store.
2. **Capture & estimate** — the composer and the AI round-trip, ending on a review screen
   that displays the estimate. Deliverable: type → see a reviewable estimate.
3. **Commit & delete** — editable fields, section inference, the manual-entry mode, the
   write, and soft-delete. Deliverable: the loop closes.
4. **Verification** — end-to-end smoke script, docs, and the device run.

The estimate travels from composer to review through the **query cache**, not route params:
after `estimateMeal` succeeds, the composer calls
`queryClient.setQueryData(estimateKey(runId), estimate)` and pushes `/review?runId=…`. The
review screen reads the estimate by `runId`. This keeps a large object out of the URL,
survives remount, and makes the review route reachable only with a real recorded run.

## Critical Implementation Details

**Navigation restructure is a prerequisite, not a detail.** The review screen cannot exist
until a Stack does. The target structure — root layout untouched, so the provider stack and
session gate are not disturbed:

```
src/app/
  _layout.tsx        providers + session gate + <AppTabs/>     (unchanged)
  (today)/
    _layout.tsx      <Stack>                                   (new)
    index.tsx        Today                                     (replaces scaffold home)
    review.tsx       Review & commit                           (new)
  explore.tsx        DELETED
```

`AppTabs`'s trigger name changes from `index` to `(today)` in **both** `app-tabs.tsx` and
`app-tabs.web.tsx`; the web variant's `href="/"` still resolves correctly because a group
segment contributes nothing to the URL.

**Section boundaries are provisional (OQ-10).** `<10:30` breakfast · `10:30–12:00` snack ·
`12:00–15:00` lunch · `15:00–18:00` bite · `≥18:00` supper. This follows the PRD's own
worked example ("anything before 10:30 is breakfast"); S-06 tunes them and adds the
override.

**`estimation_run_id` is linked on every committed entry, including manual ones.** A
`recognized: false` result still produced a real run, and keeping the link preserves the
audit trail of what the model was asked and what it said.

## Phase 1: Today surface

### Overview

Replace the starter scaffold with a Today screen backed by the store, and introduce the
navigation structure that later phases push through. No AI, no writes — the read side only.

### Changes Required:

#### 1. Navigation restructure

**File**: `src/app/(today)/_layout.tsx` (new)

**Intent**: Give the tab a Stack so the review screen can be pushed over it, per Expo's
native-tabs guidance.

**Contract**: Default-exports a component returning `<Stack>` from `expo-router` with headers
configured to match the themed background. Screens resolve from sibling route files.

**File**: `src/app/(today)/index.tsx` (new — replaces `src/app/index.tsx`)

**Intent**: The Today screen. This phase renders the header total and the day's entry list.

**Contract**: Default-exported route component. Consumes `useDayEntries()`; renders inside
`ThemedView` + `SafeAreaView` following the layout idiom in the current `index.tsx`
(`MaxContentWidth`, `Spacing` scale, `BottomTabInset`).

**File**: `src/app/index.tsx`, `src/app/explore.tsx` (delete)

**Intent**: Remove the starter scaffold — the app becomes the product.

**Contract**: Both route files removed. Before deleting, confirm no surviving module imports
`Collapsible`, `HintRow`, `WebBadge`, or the tutorial images; delete the ones that become
unreferenced and keep the rest. `AnimatedIcon` is still used by `_layout.tsx`'s splash
overlay — keep it.

**File**: `src/components/app-tabs.tsx`, `src/components/app-tabs.web.tsx`

**Intent**: Reduce to a single tab pointing at the new group. Both platform variants must
change together or one platform breaks silently.

**Contract**: Native: one `NativeTabs.Trigger name="(today)"` labelled "Today"; the
`explore` trigger and its icon require are removed. Web: one `TabTrigger name="today"
href="/"`; the Explore trigger goes, and the "Expo Starter" brand text becomes the product
name.

#### 2. Query layer

**File**: `src/data/query-keys.ts` (new)

**Intent**: One typed place where cache keys are constructed, so keys can't drift across
slices — the usual cause of stale totals after a write.

**Contract**: Exports a `queryKeys` factory with at least `mealEntries.day(date)` and
`estimate(runId)`. Day keys must be derived from a **local** `YYYY-MM-DD` string, not an ISO
timestamp, so every render of the same calendar day hits one cache entry.

**File**: `src/data/use-meal-entries.ts` (new)

**Intent**: The React-facing seam over `meal-entries.repo.ts`, keeping the "UI never touches
supabase" rule intact one layer up and centralising invalidation.

**Contract**: Exports `useDayEntries(date?)` wrapping `listMealEntriesForDay`, and mutation
hooks used by later phases (`useCreateMealEntry`, `useDeleteMealEntry`) that invalidate the
day key on success. Screens import only from here.

#### 3. Day list UI

**File**: `src/components/day-total.tsx`, `src/components/meal-entry-row.tsx` (new)

**Intent**: The two presentational pieces of Today: the running calorie header and one entry
row (name + calories).

**Contract**: Built from `ThemedText`/`ThemedView` and the `Spacing` scale, not raw
`Text`/`View` or magic numbers. The total sums `calories`, skipping nulls; entries with a
null calorie value render without a number rather than as `0`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`
- Web bundle builds: `npx expo export --platform web`
- No dangling imports of the deleted scaffold routes or components

#### Manual Verification:

- The app opens directly onto Today; no Explore tab exists on native or web
- Entries created by `npm run smoke` appear in the list with a correct running total
- Light and dark mode both render legibly

**Implementation Note**: After completing this phase and all automated verification passes,
pause for manual confirmation before proceeding.

---

## Phase 2: Capture & estimate

### Overview

Add the composer, call the proxy, handle the wait and the failure modes, and land on a
review screen that lays the estimate out. No commit yet.

### Changes Required:

#### 1. Composer

**File**: `src/components/meal-composer.tsx` (new)

**Intent**: The always-visible text input at the top of Today — the product's front door.
Owns the estimate call and its in-flight and error states.

**Contract**: A multiline `TextInput` styled after the pattern in
`src/components/owner-sign-in.tsx:33` (`theme.text` on `theme.backgroundElement`,
`Spacing`-based radius/padding) plus a submit control. While estimating: input disabled,
`ActivityIndicator` shown. On `{ ok: false }`: **the typed text is preserved**, an error line
appropriate to the `EstimateErrorKind` is shown, and a Retry re-issues exactly one call. On
`{ ok: true }`: seeds the estimate into the cache and navigates. Empty/whitespace-only input
never calls the proxy.

**File**: `src/app/(today)/index.tsx`

**Intent**: Mount the composer above the day list.

**Contract**: Composer renders above `DayTotal` and the list; keyboard avoidance keeps the
input visible on native.

#### 2. Estimate handoff

**File**: `src/data/use-estimate.ts` (new)

**Intent**: The mutation seam over `estimateMeal`, and the one place that stages the result
for the review screen.

**Contract**: Exports `useEstimateMeal()` returning a mutation over
`estimateMeal({ kind: 'text', text })`. Because `estimateMeal` resolves `{ ok: false }`
rather than throwing, the hook must translate that into a mutation error (or expose the
result union directly) — silently treating a failure as success is the trap here. On
success it calls `queryClient.setQueryData(queryKeys.estimate(runId), estimate)` before the
caller navigates.

#### 3. Review screen (display)

**File**: `src/app/(today)/review.tsx` (new)

**Intent**: Show the estimate for review. This phase renders it; Phase 3 makes it commit.

**Contract**: Reads `runId` via `useLocalSearchParams`, then the estimate from
`queryClient.getQueryData(queryKeys.estimate(runId))`. Renders name, calories, and the three
macros, plus `assumptions[]` as a visible list (FR-082). If the estimate is absent from cache
(direct navigation, cold start), the screen must show a recoverable state and route back
rather than crash on undefined.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`
- Web bundle builds: `npx expo export --platform web`

#### Manual Verification:

- Typing a real meal and submitting reaches the review screen showing macros and ≥1 assumption
- The spinner appears during the call and the input is disabled for its duration
- With the network disabled, an error appears, **the typed text is still there**, and Retry issues one new call
- Gibberish input reaches the review screen with no fabricated numbers
- Navigating directly to `/review` without a valid `runId` degrades gracefully

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 3: Commit & delete

### Overview

Make the review screen editable, infer the section, write the entry, refresh the day, and
allow deleting an entry. This is where the loop closes.

### Changes Required:

#### 1. Section inference

**File**: `src/lib/section-for-time.ts` (new)

**Intent**: Map a log instant to one of the five sections so the `NOT NULL` column carries a
meaningful value from day one — and so S-06 lights up over real historical data instead of a
wall of one default. This is the seam S-06 extends with a user override.

**Contract**: `sectionForTime(date: Date): Section`, a pure function using local-time hours.
Boundaries: `<10:30` breakfast · `10:30–12:00` snack · `12:00–15:00` lunch · `15:00–18:00`
bite · `≥18:00` supper. Must be total — every instant maps, including exact boundary values.

#### 2. Editable review + commit

**File**: `src/app/(today)/review.tsx`

**Intent**: Turn the display into a form that satisfies FR-005 ("allows manual editing of any
value") and doubles as the manual-entry fallback for FR-008, then commit.

**Contract**: Name plus all four macros become controlled inputs seeded from the estimate.
Numeric fields use a numeric keyboard, accept empty (→ `null`, never `0`), and reject
non-numeric text. When `estimate.recognized === false`: macro fields start blank, a
"couldn't identify this — enter the values yourself" message shows, the typed text seeds the
name, and the committed `source` is `'manual'` rather than `'free_text'`. Saving builds a
`NewMealEntry` with `logged_at` = now, `section` = `sectionForTime(now)`, `estimation_run_id`
= the `runId` (linked in both the recognized and unrecognized cases), calls
`useCreateMealEntry`, invalidates the day key, and navigates back to Today.

#### 3. Delete

**File**: `src/components/meal-entry-row.tsx`, `src/data/use-meal-entries.ts`

**Intent**: Let the owner remove a wrong entry without waiting for S-07's detail view.

**Contract**: A long-press on a row triggers `useDeleteMealEntry` over `softDeleteMealEntry`,
invalidating the day key so the row and the total update together. Because the delete is
soft and the confirm step is deliberately omitted, the interaction must be hard to trigger
accidentally — long-press, not tap.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`
- Web bundle builds: `npx expo export --platform web`

#### Manual Verification:

- A typed meal commits and appears in the day list with the total updated, no manual refresh
- Editing a macro before saving persists the edited value, not the estimated one
- Clearing a macro field stores `null`, not `0`
- A gibberish input commits as a manual entry with the values typed in, `source = 'manual'`
- An entry logged at a mid-morning time lands in the expected section (checked in the DB)
- Long-press deletes an entry; the row disappears and the total drops accordingly
- The deleted row stays gone after a reload (soft delete persisted, not just cache)

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 4: Verification

### Overview

Prove the whole loop automatically and on a real device, and document it — matching the
verification pattern the two shipped slices established.

### Changes Required:

#### 1. End-to-end smoke script

**File**: `scripts/log-smoke.ts`, `scripts/run-log-smoke.mjs` (new), `package.json`

**Intent**: One command that drives the real seams against the deployed backend, so the north
star's core claim is machine-checked rather than only clicked through.

**Contract**: `run-log-smoke.mjs` reuses the esbuild `nodeShim` from
`scripts/run-estimate-smoke.mjs` verbatim (remapping `@/lib/supabase` and `@/lib/new-id` to
their web variants, stubbing the RN URL polyfill). `log-smoke.ts` signs in as the owner, then
asserts: a real meal text estimates and commits, appears in `listMealEntriesForDay` for
today, carries the expected `source`/`section`/`estimation_run_id`, and counts toward the
calorie total; an unrecognized input yields `recognized: false` and commits as `manual` with
the caller's own numbers and no fabricated values; a soft-deleted entry drops out of the day
read. It exercises `sectionForTime` across every boundary, and hard-deletes what it created.
New script: `"smoke:log"`, following the existing `--env-file` invocation.

#### 2. Verification doc

**File**: `context/changes/free-text-meal-logging/verification.md` (new)

**Intent**: The durable record of how this slice was proven, in the shape the two archived
slices use.

**Contract**: Sections for the automated smoke (with a recorded run and exit code), the
manual checks from Phases 1–3, and a Known Gaps list.

#### 3. Close F-02's native gap

**File**: `context/archive/2026-07-22-ai-estimation-proxy/verification.md` (annotate)

**Intent**: This slice's device run is the first native invocation of `estimateMeal`, which is
exactly the open item F-02 carried forward.

**Contract**: Once a device/simulator run succeeds, record it under the "Known gaps" entry
(and against that plan's step 3.4). If no device is available, say so explicitly and leave
the gap open rather than marking it closed.

### Success Criteria:

#### Automated Verification:

- Smoke passes end-to-end: `npm run smoke:log` exits 0
- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`
- Prior smokes still pass: `npm run smoke`, `npm run smoke:estimate`

#### Manual Verification:

- The full loop works on a real device or simulator (`npx expo start` → `i`/`a`) — closing F-02's native-invocation gap
- Cross-client parity: a meal logged on one client appears on the other after a focus refetch (US-07)
- `verification.md` records a real run with its output

---

## Testing Strategy

No test runner exists and this slice does not add one — verification follows the repo's
established pattern.

### Automated (smoke + static):

- `npm run smoke:log` — the full estimate → review → commit → read-back → delete loop against
  the deployed backend, plus boundary assertions on `sectionForTime`
- `npx tsc --noEmit` and `npm run lint` on every phase
- `npx expo export --platform web` as the bundler-level check

### Manual Testing Steps:

1. Type "3 slices of pepperoni pizza", confirm the estimate, save — verify it appears with the total updated
2. Type "200 g penne, 100 g tomato sauce, 30 g parmesan" — confirm the stated quantities are reflected rather than overridden (FR-081)
3. Type something with no quantity ("some pasta") — confirm an assumption about portion is displayed (FR-082)
4. Type gibberish — confirm blank macros, the manual-entry message, and that nothing commits until values are entered
5. Disable the network mid-flow — confirm the error, the preserved text, and that Retry works
6. Edit every macro before saving — confirm edited values persist
7. Clear a macro field entirely — confirm `null`, not `0`
8. Long-press an entry — confirm it deletes and stays deleted after reload
9. Log on the phone, open the web build — confirm the entry appears (US-07)
10. Log entries at different times of day — confirm sections in the DB match the boundaries

## Performance Considerations

The estimate round-trip is the only slow operation (seconds — an AI call). It is handled with
a blocking spinner rather than an optimistic insert, deliberately: FR-005 forbids anything
appearing in the day before the owner confirms it. Day reads are a handful of rows behind a
5-minute `staleTime`, so no pagination or virtualization is warranted at this scale
(~3–8 entries/day per the PRD).

## Migration Notes

No schema change and no migration. Existing `meal_entries` rows created by `npm run smoke`
remain valid and will render in the day list when their `logged_at` falls on the current day.

## References

- Roadmap slice S-01: `context/foundation/roadmap.md` (north star)
- PRD user stories US-11, US-12, US-08; FR-080/081/082/084, FR-005/006/008, FR-030
- Estimation seam: `src/data/estimation.ts:69`, contract `src/data/estimation-types.ts`
- Store seam: `src/data/meal-entries.repo.ts`, schema `supabase/migrations/20260720120000_core_log_schema.sql`
- Prior slice verification pattern: `context/archive/2026-07-22-ai-estimation-proxy/verification.md`
- Smoke-runner shim to reuse: `scripts/run-estimate-smoke.mjs`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Today surface

#### Automated

- [x] 1.1 Type checking passes: `npx tsc --noEmit` — 70bdd47
- [x] 1.2 Linting passes: `npm run lint` — 70bdd47
- [x] 1.3 Web bundle builds: `npx expo export --platform web` — 70bdd47
- [x] 1.4 No dangling imports of the deleted scaffold routes or components — 70bdd47

#### Manual

- [x] 1.5 The app opens directly onto Today; no Explore tab exists on native or web — 70bdd47
- [x] 1.6 Entries created by `npm run smoke` appear in the list with a correct running total — 70bdd47
- [x] 1.7 Light and dark mode both render legibly — 70bdd47

### Phase 2: Capture & estimate

#### Automated

- [x] 2.1 Type checking passes: `npx tsc --noEmit` — efe3b74
- [x] 2.2 Linting passes: `npm run lint` — efe3b74
- [x] 2.3 Web bundle builds: `npx expo export --platform web` — efe3b74

#### Manual

- [x] 2.4 Typing a real meal and submitting reaches the review screen showing macros and ≥1 assumption — efe3b74
- [x] 2.5 The spinner appears during the call and the input is disabled for its duration — efe3b74
- [x] 2.6 With the network disabled, an error appears, the typed text is still there, and Retry issues one new call — efe3b74
- [x] 2.7 Gibberish input reaches the review screen with no fabricated numbers — efe3b74
- [x] 2.8 Navigating directly to `/review` without a valid `runId` degrades gracefully — efe3b74

### Phase 3: Commit & delete

#### Automated

- [x] 3.1 Type checking passes: `npx tsc --noEmit` — a1a9c76
- [x] 3.2 Linting passes: `npm run lint` — a1a9c76
- [x] 3.3 Web bundle builds: `npx expo export --platform web` — a1a9c76

#### Manual

- [x] 3.4 A typed meal commits and appears in the day list with the total updated, no manual refresh — a1a9c76
- [x] 3.5 Editing a macro before saving persists the edited value, not the estimated one — a1a9c76
- [x] 3.6 Clearing a macro field stores `null`, not `0` — a1a9c76
- [x] 3.7 A gibberish input commits as a manual entry with the values typed in, `source = 'manual'` — a1a9c76
- [x] 3.8 An entry logged at a mid-morning time lands in the expected section (checked in the DB) — a1a9c76
- [x] 3.9 Long-press deletes an entry; the row disappears and the total drops accordingly — a1a9c76
- [x] 3.10 The deleted row stays gone after a reload (soft delete persisted, not just cache) — a1a9c76

### Phase 4: Verification

#### Automated

- [x] 4.1 Smoke passes end-to-end: `npm run smoke:log` exits 0 — 34a2080
- [x] 4.2 Type checking passes: `npx tsc --noEmit` — 34a2080
- [x] 4.3 Linting passes: `npm run lint` — 34a2080
- [x] 4.4 Prior smokes still pass: `npm run smoke`, `npm run smoke:estimate` — 34a2080

#### Manual

- [x] 4.5 The full loop works on a real device or simulator — closing F-02's native-invocation gap — 34a2080
- [x] 4.6 Cross-client parity: a meal logged on one client appears on the other after a focus refetch (US-07) — 34a2080
- [x] 4.7 `verification.md` records a real run with its output — 34a2080
