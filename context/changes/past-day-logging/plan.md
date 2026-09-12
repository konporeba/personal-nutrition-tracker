# Past-Day Logging Implementation Plan

## Overview

Let the owner add meals and training sessions to a **past** day, and move an already-logged record from one day to another. The driving case is midnight rollover — a supper eaten at 23:50 and logged at 00:05 currently lands on the wrong day with no way to correct it.

The approach is deliberately *not* a "backdate mode". It makes **"which day am I writing into" an explicit parameter that defaults to now**, threaded through every commit path the app already has. One code path, one set of behaviors, nothing that can silently rot beside the normal flow.

## Current State Analysis

Nothing in the data layer blocks this. The gate is entirely UI-level, plus three hardcoded `new Date()` commit sites.

**Already in place:**

- `MealEntryPatch` carries `logged_at` (`src/data/types.ts:70`); `TrainingSessionPatch` carries it too (`src/data/types.ts:255`). Moving a record between days is a legal patch today — only the UI never offers it.
- `src/app/(today)/library.tsx:97-118` (`logToDay`) already writes a meal into a chosen day, driven by `LogToDaySheet`'s day stepper, which already caps at today.
- `ensureDailyTarget` is keyed off the entry's own `logged_at` (`src/data/use-meal-entries.ts:81`, `src/data/use-training-sessions.ts:71`), not off "today" — the forward-path snapshot is already backdate-correct.
- `localDayKey()` (`src/data/query-keys.ts:11`) is the app's established local-calendar-day convention, used by query keys, `daily_targets`, and the week rail.

**What blocks it:**

| Location | What it does |
| --- | --- |
| `src/app/(today)/index.tsx:84` | `onAddToSection={viewingToday ? … : undefined}` — no per-section add tiles on a past day |
| `src/app/(today)/index.tsx:127` | header "Log a meal" button `disabled={!viewingToday}` |
| `src/app/(today)/index.tsx:142` | native FAB hidden when `!viewingToday` |
| `src/app/analytics/day.tsx:33` | `<DayView date={parsedDate} />` passed no `onAddToSection` at all |
| `src/app/(today)/review.tsx:168` | `const loggedAt = new Date()` — the only place a meal entry is written |
| `src/app/(today)/library.tsx:63` | `const loggedAt = new Date()` in `relog()` |
| `src/components/training-session-sheet.tsx:136` | `logged_at: new Date().toISOString()` — the training sheet has no day concept |
| `src/components/add-meal-provider.tsx` | `open(section?)` — the popup's whole API has no day slot |

This was a deliberate scope cut, not an oversight: `src/components/day-view.tsx` and `src/app/analytics/day.tsx` both cite the S-11 plan's "What We're NOT Doing". FR-031 ("User can browse and edit any past day, including its meals and its sessions") points the other way, and this change un-cuts it.

**One latent correctness bug in the way:** `useUpdateMealEntry` (`src/data/use-meal-entries.ts:120`) invalidates only the day derived from the mutation's **response** row. Today that is always the same day it started on, so nothing is wrong. The moment an entry can change days, the *old* day's cache key goes stale and the entry appears to exist on both days until a refocus.

## Desired End State

- From Today's week rail, selecting a past day and tapping ＋ (or an empty section's add tile, or the header button) composes a new meal into **that** day, through every capture path: describe it, plate photo, label scan, saved meal.
- The same is true from the Analytics day screen reached by tapping the Net-vs-Budget chart.
- The training sheet can log a session into a past day.
- Tapping any logged meal or session opens its sheet with a day stepper, so a record that landed on the wrong day can be moved.
- Every surface that is about to write into a day other than today **says so in words** before the write.
- No path can create a record in the future.

**Verification:** log a meal into yesterday from Today's rail; confirm it appears in yesterday's ledger, that yesterday's week-rail ring repaints, that the Analytics day screen for yesterday shows it, and that today's totals are unchanged. Then move it back to today from its entry sheet and confirm both days repaint.

### Key Discoveries:

- `sectionForTime()` (`src/lib/section-for-time.ts:26`) maps an instant onto a section; its boundaries (10:30 / 12:00 / 15:00 / 18:00) give a clean inverse with a round-trip guarantee.
- `AddMealProvider` wraps `AppTabs` at `src/app/_layout.tsx:151`, so `useAddMeal()` is in scope for `analytics/day.tsx` with no re-parenting.
- `open()` is called with no arguments at `src/components/app-tabs.web.tsx:286` and by `CaptureFab` — adding `day` as an optional second parameter leaves both untouched, and "the app-level ＋ means today" stays correct.
- `useUpdateTrainingSession` broad-invalidates the `trainingSessions.all()` prefix, which covers every nested `.day(...)` key — so training's cross-day move needs no key-pairing fix, unlike meals.
- `context/foundation/lessons.md` — "Re-derive 'now' per render; own it at the data seam." `viewedDay` in `(today)/index.tsx` already honors this (`pastDay ?? day`, where `null` means "follow the clock"). Preserve that.
- The repo has no test runner. Its automated-verification convention is a per-slice smoke script: `scripts/<slice>-smoke.ts` + an esbuild runner `scripts/run-<slice>-smoke.mjs` + an `npm run smoke:<slice>` script (see `scripts/run-meal-detail-smoke.mjs`).

## What We're NOT Doing

- **No editable time-of-day field.** Sheets get a day stepper, not a clock. A record moved between days keeps its original time-of-day component.
- **No future-day logging.** Blocked at both the stepper and the param parser.
- **No training deep-link from a day surface.** Training was deliberately moved off the day view; a `?day=` hand-off back into it risks re-creating the crowding that move fixed. The sheet's own stepper is the only entry point.
- **No lower bound on how far back you can go.** Matching `LogToDaySheet`'s existing unbounded-backwards stepper.
- **No `daily_targets` history reconstruction.** A backdated day with no snapshot gets today's targets, exactly as `useAnalyticsRange`'s lazy backfill already does.
- **No retiring of `LogToDaySheet`.** It keeps its job and consumes the extracted stepper.
- **No schema or migration work.** Every column this needs already exists.

## Implementation Approach

Five phases, ordered **repair before compose** so the smallest, highest-relief change ships first.

Phase 1 builds a pure seam with no user-visible change. Phase 2 uses it to make an already-logged record movable — that alone closes the midnight case and is shippable on its own. Phases 3 and 4 thread the day parameter through the composing paths for meals and training. Phase 5 makes every surface state the target day out loud.

The parameter travels as a `YYYY-MM-DD` local day key — the app's existing `localDayKey` convention — never as an ISO instant. It rides the exact same route-param rails `section` already rides (`review.tsx`, `library.tsx`), so there is one hand-off pattern to understand rather than two.

## Critical Implementation Details

**Day-key parsing must be local, not UTC.** `new Date('2026-09-10')` parses as UTC midnight and resolves to the *previous* local day in any negative-offset timezone. `parseLocalDayKey` must split the string and construct with `new Date(y, m - 1, d)`. It must also reject structurally-valid-but-impossible dates (`2026-02-31`) by round-tripping the constructed date back through `localDayKey` and comparing.

**Section must resolve before the timestamp.** In `review.tsx` the backdated time is derived *from* the section, inverting today's dependency (`section ?? sectionForTime(loggedAt)`). Resolve the section first — from the route param, falling back to `sectionForTime(new Date())` — then compute `logged_at` from it.

**`TrainingSessionSheet`'s `'new'` key is stable across opens.** `src/app/training/index.tsx:100` keys the sheet `editing?.id ?? 'new'`, and the sheet seeds every field in `useState` initializers. Opening "log a new session" twice therefore reuses one mount, so a day picked in the first session would linger into the second — the same class of bug `add-meal-provider.tsx` already documents ("it seeded its picker once from the clock at app start and then never moved"). Fix it the way that file did: mount the sheet only while open, or fold an open-counter into the key.

**Do not capture the target day in a `useMemo(…, [])`.** Per `context/foundation/lessons.md`. `viewedDay = pastDay ?? day` must stay re-derived per render, with `null` meaning "follow the clock", or the screen freezes on the instant of the tap and stops rolling over at midnight.

---

## Phase 1: The Day Seam

### Overview

Pure helpers plus one extracted component. No user-visible behavior changes in this phase — `LogToDaySheet` must look and behave exactly as it does today when it lands.

### Changes Required:

#### 1. Local-day helpers

**File**: `src/lib/local-day.ts` (new)

**Intent**: Give `lib/` a self-contained home for local-calendar-day arithmetic, so the pure timestamp helpers below don't have to reach up into `src/data/`. Houses the existing `localDayKey` plus two new siblings.

**Contract**: Exports `localDayKey(date: Date): string` (moved verbatim from `src/data/query-keys.ts:11`), `isSameLocalDay(a: Date, b: Date): boolean`, and `parseLocalDayKey(key: string | undefined, now?: Date): Date | undefined`. The parser returns a local-midnight `Date`, `undefined` for anything malformed or impossible, and **clamps any future day back to today** — this is the single choke point where a hand-edited URL cannot create a future record.

#### 2. Query-key re-export

**File**: `src/data/query-keys.ts`

**Intent**: Keep every existing `localDayKey` import working unchanged after the move.

**Contract**: Re-export `localDayKey` from `@/lib/local-day`. Call sites in `src/components/week-rail.tsx`, `src/data/daily-targets.repo.ts` and `src/data/use-analytics.ts` stay as they are.

#### 3. Section → time-of-day

**File**: `src/lib/time-for-section.ts` (new)

**Intent**: The inverse of `sectionForTime()` — a representative clock time for each section, so a backdated meal gets a plausible timestamp instead of whatever the clock said when it was typed.

**Contract**: Exports `type TimeOfDay = { hours: number; minutes: number }` and `timeForSection(section: Section): TimeOfDay`, mapping breakfast→08:00, snack→11:00, lunch→13:00, bite→16:30, supper→19:30. **Invariant the implementer must preserve:** every value round-trips — `sectionForTime(<that day at that time>) === section` for all five — against the boundaries in `src/lib/section-for-time.ts:14-17`.

#### 4. Timestamp construction

**File**: `src/lib/logged-at-for-day.ts` (new)

**Intent**: One place that answers "what `logged_at` does a record aimed at this day get", replacing three hardcoded `new Date()` sites and `library.tsx`'s ad-hoc construction.

**Contract**: Exports `loggedAtForDay(day: Date, timeOfDay: TimeOfDay, now?: Date): string` — when `day` is today, returns `now.toISOString()` verbatim so today's records keep their exact real timestamps; otherwise returns that calendar day at `timeOfDay`. Also exports `moveToDay(loggedAt: string, day: Date): string`, which changes the calendar day while preserving the original time-of-day component — the Phase 2 primitive.

#### 5. Shared day stepper

**File**: `src/components/ui/day-stepper.tsx` (new)

**Intent**: Extract the ‹/› stepper currently inline in `LogToDaySheet` so the four callers about to need it share one control.

**Contract**: Props `{ day: Date; today: Date; onChange: (next: Date) => void }`. Renders the previous/next buttons with the day label and the "Today" marker, next disabled once the selection reaches `today`. Lifts `StepButton` and the `styles.stepper` / `styles.dayLabel` / `styles.stepButton` rules from `src/components/log-to-day-sheet.tsx:71-88,128-148` unchanged.

#### 6. `LogToDaySheet` consumes it

**File**: `src/components/log-to-day-sheet.tsx`

**Intent**: Replace the inline stepper with the shared component, keeping every existing behavior — including the reset-on-close that stops a prior pick from lingering.

**Contract**: Same props, same `onLog(day, section)` callback. Local `startOfDay`/`addDays` helpers move into `day-stepper.tsx` or `local-day.ts` as appropriate.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`

#### Manual Verification:

- Saved meals → long-press → "Log to another day…" looks and behaves exactly as before: stepper moves back, next-day disables on today, "Today" marker shows, closing and reopening resets the pick.
- Logging a saved meal to a past day through that sheet still lands on the right day.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Move What's Already Logged

### Overview

The midnight fix, and shippable on its own. A logged meal or session gains a day stepper in its detail sheet, so a record that landed on the wrong day can be dragged back. Includes the cache-invalidation fix that a cross-day move requires.

### Changes Required:

#### 1. Two-key invalidation for a moved entry

**File**: `src/data/use-meal-entries.ts`

**Intent**: `useUpdateMealEntry` currently invalidates only the day derived from the mutation response. Once an entry can change days, the day it *left* must be invalidated too, or it lingers in the old day's cached list.

**Contract**: In `onSuccess`, invalidate `queryKeys.mealEntries.day(new Date(input.logged_at))` (the pre-move day, available as a mutation variable) **and** `queryKeys.mealEntries.day(new Date(entry.logged_at))` (the post-move day). Also add `queryKeys.streak()` to this hook's invalidations — moving the only record off a day can shorten the streak, and moving one into a gap can lengthen it. `analytics.all()` stays as-is.

#### 2. Streak invalidation on a moved session

**File**: `src/data/use-training-sessions.ts`

**Intent**: Same streak reasoning for training. Day-key pairing is not needed — `useUpdateTrainingSession` already invalidates the `trainingSessions.all()` prefix, which covers every nested `.day(...)` key.

**Contract**: Add `queryKeys.streak()` to `useUpdateTrainingSession`'s `onSuccess` invalidations.

#### 3. Day stepper on the meal entry sheet

**File**: `src/components/meal-entry-sheet.tsx`

**Intent**: Let a logged meal be moved to a different day, alongside the section/name/macro edits it already saves in one patch.

**Contract**: A `DayStepper` seeded from `entry.logged_at`, placed above the existing section picker (day is the coarser choice; it reads top-down). When the picked day differs from the entry's original, the save patch includes `logged_at: moveToDay(entry.logged_at, pickedDay)`; when it matches, `logged_at` is omitted from the patch entirely. `source` stays absent from the patch, as today.

#### 4. Day stepper on the training sheet's edit branch

**File**: `src/components/training-session-sheet.tsx`

**Intent**: The same move for a logged session.

**Contract**: In the `session !== null` branch, a `DayStepper` seeded from `session.logged_at`; the update patch includes `logged_at: moveToDay(session.logged_at, pickedDay)` only when the day changed. The sheet's subtitle already renders `dateFormat.format(new Date(session.logged_at))` — it must follow the stepper live rather than the stored value.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`
- Existing data paths still green: `npm run smoke:meal-detail` and `npm run smoke:training`

#### Manual Verification:

- A meal logged just after midnight can be moved to the previous day from its entry sheet; it disappears from today's ledger and appears in yesterday's **without a refresh** — this is the invalidation fix working.
- Both affected days' week-rail rings repaint after the move.
- The moved entry keeps its original time-of-day in the sheet subtitle.
- Moving the only record off a day shortens the streak pill; moving one into a gap lengthens it.
- A training session can be moved the same way, and the sheet's date subtitle tracks the stepper as it moves.
- Editing a meal *without* touching the day still behaves exactly as before.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Compose Meals Into a Past Day

### Overview

Thread the target day through the add-meal popup and all four capture paths, then remove the three gates that turn off composing on a past day.

### Changes Required:

#### 1. The popup carries a day

**File**: `src/components/add-meal-provider.tsx`

**Intent**: Extend the popup's one-function API from "which section" to "which section, which day", without disturbing the callers that legitimately mean today.

**Contract**: `open(section?: Section, day?: Date)`; the open session holds `{ section?, day? }` and passes `day` to `AddMealSheet`. `open()` with no arguments keeps meaning "today, let the clock pick the section" — `src/components/app-tabs.web.tsx:286` and `CaptureFab` stay untouched, and the app-level ＋ continues to mean today.

#### 2. The sheet routes the day onward

**File**: `src/components/add-meal-sheet.tsx`

**Intent**: Hand the day to whichever of the four paths the owner picks, exactly as `section` is already handed over.

**Contract**: New optional `day?: Date` prop. The text path adds `day: localDayKey(targetDay)` to its `/review` push params; `openLibrary()` adds the same to its `/(today)/library` push; both capture rows pass the day into `capture(...)`. The subtitle's trailing `today` becomes the formatted day name when the target is not today (full treatment in Phase 5).

#### 3. The capture flow holds the day

**File**: `src/hooks/use-capture-flow.ts`

**Intent**: A staged photo must remember which day it was started for, for exactly the reason it already remembers its section — so a capture cannot be finished into a different day than it began in.

**Contract**: `capture(kind, section?, day?, onSuccess?)`; `StagedCapture` gains `day?: Date`; `confirm()` adds `day: localDayKey(day)` to the `/review` push params when present. `retake()` replays the held day unchanged. Only `add-meal-sheet.tsx` calls `capture` (two sites), so the signature change is contained.

#### 4. The commit site honors the day

**File**: `src/app/(today)/review.tsx`

**Intent**: Replace the hardcoded `new Date()` with the day seam. This is the only place a meal entry is written, so it is the load-bearing change of the phase.

**Contract**: Parse the `day` param with `parseLocalDayKey`, defaulting to today when absent or rejected. Resolve the section **first** (route param, else `sectionForTime(new Date())`), then `logged_at = loggedAtForDay(targetDay, timeForSection(resolvedSection))`. `parseSection`'s existing validate-don't-trust posture is the model for the new parser's use.

#### 5. The library honors the day

**File**: `src/app/(today)/library.tsx`

**Intent**: A saved meal re-logged while a past day is on screen belongs to that day, not to today.

**Contract**: Parse the `day` param alongside the existing `section` param. `relog()` uses `loggedAtForDay(targetDay, timeForSection(resolvedSection))`. `logToDay()` switches from its ad-hoc "picked day at the current clock time" construction (`src/app/(today)/library.tsx:104-110`) to the same helper — a deliberate behavior change that makes the two write paths agree. The `Stack.Screen` title names the target day when it is not today.

#### 6. Un-gate Today's past day

**File**: `src/app/(today)/index.tsx`

**Intent**: Remove the three affordance gates and pass the viewed day into the popup.

**Contract**: `onAddToSection` becomes unconditional, calling `addMeal.open(section, viewedDay)`; the header button drops `disabled={!viewingToday}` and calls `addMeal.open(undefined, viewedDay)`; the FAB's `!viewingToday` condition is removed, leaving only the `Platform.OS === 'web'` check. `viewedDay` stays `pastDay ?? day`, re-derived per render — do not memoize it (see Critical Implementation Details). The three comments that explain the gates are replaced, not left describing behavior that no longer exists.

#### 7. Un-gate the analytics day screen

**File**: `src/app/analytics/day.tsx`

**Intent**: The second past-day surface gets the same capability, closing FR-031 properly.

**Contract**: `useAddMeal()` (already in scope via `_layout.tsx:151`) and `onAddToSection={(section) => addMeal.open(section, parsedDate)}` on the `DayView`. The header comment asserting that composing into a past day is out of scope is removed.

#### 8. Correct the day-surface doc comment

**File**: `src/components/day-view.tsx`

**Intent**: The file header and the `onAddToSection` prop doc both state that a past day supports editing but not composing. That stops being true in this phase.

**Contract**: Comment-only change. The `section.data.length === 0 && onAddToSection` growth rule now fires on past days too, which is the intended behavior — the empty-section tiles should fill the pane there exactly as they do on today.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`
- Log path still green: `npm run smoke:log` and `npm run smoke:saved-meals`

#### Manual Verification:

- From Today's rail, select yesterday, tap an empty section's add tile, describe a meal, and log it — it lands in yesterday, in the tapped section.
- The same via plate photo and via label scan; the staged-photo step still shows the right section and day after a retake.
- The same via "From saved meals" — the row tap logs into yesterday, not today.
- Repeat all four from the Analytics day screen reached by tapping the Net-vs-Budget chart.
- The web bottom bar's ＋ and the native FAB still log to **today** when Today is showing today.
- Yesterday's week-rail ring and the Analytics charts repaint after a backdated log.
- Hand-editing the review route's `day` param to a future date falls back to today rather than creating a future entry.
- The backdated entry's time-of-day matches its section (a supper logged into yesterday reads ~19:30, not 00:05) and sorts correctly in the ledger.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Log Training Into a Past Day

### Overview

The training sheet's create branch gets the same day stepper. Training has no section, so its backdated timestamp rule differs from a meal's — and the sheet's mount lifecycle needs a fix before a day picker can live in it.

### Changes Required:

#### 1. Day stepper on the create branch

**File**: `src/components/training-session-sheet.tsx`

**Intent**: Let a session be logged for a day other than today, from the only surface training has.

**Contract**: A `DayStepper` defaulting to today in the `session === null` branch, placed above the type picker. `logged_at = loggedAtForDay(pickedDay, { hours: now.getHours(), minutes: now.getMinutes() })` — training carries the current wall-clock time onto the chosen day rather than a section-derived time, because it has no section and nothing downstream infers anything from a session's time-of-day. `useCreateTrainingSession` needs no change: it already invalidates the streak and snapshots `daily_targets` from the session's own `logged_at`.

#### 2. Fix the sheet's stale-mount lifecycle

**File**: `src/app/training/index.tsx`

**Intent**: `key={editing?.id ?? 'new'}` is stable across repeated "log a new session" opens, so the sheet's `useState` initializers run once and a day picked in one session would linger into the next.

**Contract**: Mount `TrainingSessionSheet` only while open — the pattern `add-meal-provider.tsx` already uses and documents — or fold an incrementing open counter into the key. Either way, every open of the create branch must start on today.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`
- Training path still green: `npm run smoke:training`

#### Manual Verification:

- A session logged for yesterday appears in yesterday's ledger and adds its burn to **yesterday's** budget, leaving today's untouched.
- Yesterday's week-rail ring and the Analytics net line both move.
- Opening "Log training" twice in a row starts on today both times — the lifecycle fix.
- Editing an existing session still opens on that session's own day (Phase 2 behavior, unbroken).
- Logging a session with the stepper left on today behaves exactly as before.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Say Which Day, Loudly

### Overview

The one real risk this feature introduces is writing into a past day without noticing. Every surface that is about to commit to a day other than today states it in words.

### Changes Required:

#### 1. Add-meal popup subtitle

**File**: `src/components/add-meal-sheet.tsx`

**Intent**: The subtitle already ends in `today` on both the chooser and staged-photo steps. Make it name the actual target day.

**Contract**: `To supper, today` becomes `To supper, Wed 10 Sep` when the target day is not today; the `today` wording is kept when it is. Applies to both subtitle branches (staged capture and not).

#### 2. Review screen day chip

**File**: `src/app/(today)/review.tsx`

**Intent**: The review screen is the last gate before the write (FR-005). A backdated commit must be visible here, on both the recognized and unrecognized paths.

**Contract**: A `Chip` naming the target day, shown only when it is not today. On the recognized path it joins the existing chip row beside "Estimated"; the unrecognized path has no chip row, so it needs the day stated in `UnrecognizedNotice` or in a chip row above it. Both paths must carry it — an unrecognized input is still a real write.

#### 3. Training sheet subtitle

**File**: `src/components/training-session-sheet.tsx`

**Intent**: The create branch's subtitle is the literal string `'Add to today'`, which becomes false the moment the stepper moves.

**Contract**: Track the stepper — the day's formatted name when it is not today, `'Add to today'` when it is. The edit branch's existing `dateFormat` subtitle already names the day.

#### 4. Meal entry sheet subtitle

**File**: `src/components/meal-entry-sheet.tsx`

**Intent**: The subtitle reads `19:30 · Free text` with no date, which is ambiguous once entries can be moved between days and inspected from the Analytics day screen.

**Contract**: Include the date when the entry's day is not today. Tracks the Phase 2 stepper live, the way the training sheet's does.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`
- Full smoke suite green: `npm run smoke`, plus the per-slice scripts touched by this change
- New slice smoke passes: `npm run smoke:past-day`

#### Manual Verification:

- Selecting yesterday on Today's rail and opening the ＋ shows the day named in the popup subtitle — before any method is chosen.
- The name survives the whole flow: subtitle → staged photo step → review chip.
- Both the recognized and the unrecognized review paths show the day.
- Nothing in the wording changes when the target is today — no new noise on the common path.
- At phone width (~400px) the longer subtitles and the added chip do not overflow or push the popup past the viewport.

**Implementation Note**: This is the final phase. After automated verification passes, walk the full manual testing checklist below before considering the change complete.

---

## Testing Strategy

There is no test runner configured (`CLAUDE.md`), so "automated" here means type checking, linting, and the repo's per-slice smoke scripts.

### Smoke script (new):

**Files**: `scripts/past-day-smoke.ts`, `scripts/run-past-day-smoke.mjs`, plus a `smoke:past-day` entry in `package.json`. Follows the existing esbuild-shim pattern in `scripts/run-meal-detail-smoke.mjs` (forcing the `.web` variants of `@/lib/supabase` and `@/lib/new-id`).

Covers, against the live owner store:

- `parseLocalDayKey` rejects malformed and impossible keys, and clamps a future key to today.
- `timeForSection` round-trips through `sectionForTime` for all five sections.
- `loggedAtForDay` returns the exact `now` for today and the section time for any other day.
- `moveToDay` preserves the time-of-day component across a day change, including across a DST boundary.
- A meal created into a past day is returned by `listMealEntriesForDay` for **that** day and not for today.
- An entry moved across days leaves the source day and appears in the target day.
- A training session created into a past day lands in that day's `listTrainingSessionsForDay`.
- Every record the script creates is soft-deleted on the way out.

### Manual Testing Steps:

1. Just after midnight (or with the device clock moved), log a meal — confirm it lands on the new day, then move it back to the previous day from its entry sheet and confirm both days repaint without a refresh.
2. From Today's rail, select a day 3–4 back and log a meal through each of the four paths: describe, plate photo, label scan, saved meal.
3. Confirm each lands in the correct day **and** the correct section, with a section-appropriate time.
4. Tap the Net-vs-Budget chart in Analytics, open that day, and log a meal into it from there.
5. Log a training session for a past day; confirm the burn moves that day's budget and not today's.
6. Confirm the week rail's rings and the Analytics charts repaint after each backdated write.
7. Confirm the streak pill responds correctly to a backdated log that fills a gap.
8. Try to reach a future day: the stepper's next button must disable on today, and a hand-edited `?day=` param must fall back to today.
9. Confirm the app-level ＋ (web bottom bar, native FAB) still logs to today.
10. Repeat the core path on web and on native — `app-tabs` and the capture flow are platform-split.
11. Check phone width (~400px) for the longer subtitles and the new stepper rows.

Record the results in `context/changes/past-day-logging/verification.md`, matching the convention in `context/changes/bootstrap-verification/verification.md`.

## Performance Considerations

Negligible. No new queries, no new tables, no new network calls. The day parameter is a string in route params and a `Date` in component state. Phase 2's added `streak()` invalidation makes an existing full-history read fire on entry edits where it previously did not — acceptable, since `listMealEntryTimestamps` selects a single column and the streak is already invalidated on every create and delete.

## Migration Notes

No schema change and no data migration. Every column this needs (`logged_at` on both tables, both patch types) already exists and is already writable.

The one behavior change to existing data paths is `library.tsx:logToDay()`, which stops stamping the current clock time onto a backdated saved meal and starts using the section-derived time. Records written before this change keep their original timestamps; nothing is rewritten.

Rollback is per-phase: each phase is an independent commit, and Phases 1 and 2 have no dependency on 3–5.

## References

- Change identity: `context/changes/past-day-logging/change.md`
- Recurring rules: `context/foundation/lessons.md` — "Re-derive 'now' per render; own it at the data seam"
- Product requirements: `context/foundation/prd.md` — FR-011 (saved meal into any day), FR-031 (browse and edit any past day)
- The scope cut this change reverses: `context/archive/2026-07-30-analytics-and-trends/plan.md` ("What We're NOT Doing")
- Existing day-picker precedent: `src/components/log-to-day-sheet.tsx`
- Route-param hand-off pattern to mirror: `src/app/(today)/review.tsx:48-50` (`parseSection`)
- Smoke-script pattern: `scripts/run-meal-detail-smoke.mjs`

## Addendum — what actually shipped (2026-09-12)

Added after implementation, following the review in `reviews/impl-review.md`. The
Phase blocks above are left as written: they record what was agreed *before*
implementation, and this section records where the shipped code deliberately
diverges. Where the two disagree, this section is correct.

### The day control is a pill, not a stepper row

Contracts **2.3**, **2.4** and **4.1** each specify "a `DayStepper` … placed
above the section/type picker" — a labelled, full-width stepper row inside the
form. That is what was built first, and it was rejected in review as taking too
much vertical space in sheets that are already dense (~80pt in a six-field form
on a phone viewport).

What shipped is **`DayPill`** (`src/components/ui/day-stepper.tsx`): the day's
own *value*, rendered as a small outlined pill on the sheet's subtitle line,
which grows `‹ ›` arrows **inside itself** when tapped. Zero added height in
either state, and nothing on the page moves when it opens. It replaced the
stepper in `meal-entry-sheet.tsx` and `training-session-sheet.tsx` (both
branches). `DayStepper` itself survives unchanged and is still the control in
`log-to-day-sheet.tsx`, which is *about* picking a day and has the room.

Two follow-on design decisions, both made in review:

- The pill **always shows a date**, never the word "Today". "Today" is four
  characters where a date is eleven, so the pill visibly shrank on its most
  common value and read as a different, half-empty control.
- The label has a `minWidth` and the arrows fixed-width boxes, so the date stays
  centered and the pill does not resize while stepping.

### Consequences for the Phase 5 contracts

- **5.3** says the training subtitle must read `'Add to today'` when the target
  is today. That literal no longer exists; the subtitle is the pill in both
  branches, showing today's date for a new session.
- **5.4** says the meal sheet should carry the date "when the entry's day is not
  today". The pill renders unconditionally, so today's entries carry it too.
- **Success criterion 5.8** — "Nothing in the wording changes when the target is
  today" — therefore **does not hold for the two detail sheets**, by design. It
  does still hold for the compose path (5.1, 5.2): the add-meal popup says
  "today" when it means today, and the review screen's day chip appears only on
  a backdated write.

### `Sheet.subtitle` accepts a `ReactNode`

`src/components/ui/sheet.tsx` is not named anywhere in the plan. Hosting the pill
on the subtitle line required widening `subtitle` from `string` to `ReactNode`.
Strings still get the muted-caption treatment, so the four other callers are
untouched. An empty string still renders nothing.

### Fixes applied after the implementation review

See `reviews/impl-review.md` for the findings in full.

- **F1 (critical)** `analytics/day.tsx` parsed its route param with raw
  `new Date()` while being a write surface. Now `parseLocalDayKey`, with
  `analytics/index.tsx` pushing a `localDayKey` rather than an ISO instant.
- **F2** `LogToDaySheet` is mounted only while open, so its day picker re-seeds
  per open rather than per screen mount.
- **F3** The training sheet's submit guard now includes `create.isSuccess`,
  matching the other two write paths.
- **F4** Today passes `pastDay ?? undefined` to the add-meal popup rather than a
  resolved `viewedDay`, so viewing today keeps following the clock.
- **F7** `Sheet`'s subtitle guard preserves the old empty-string behavior.
- **F8** The four duplicate day-helper sets (`date-strip.tsx`, `streak.ts`,
  `use-analytics.ts`, `analytics/index.tsx`) were deleted in favour of
  `@/lib/local-day`, and `group-by-local-day.ts` now imports it from `lib/`
  rather than up through `data/query-keys.ts`.
- **F9** The smoke script's DST assertion was vacuous — it compared against a
  wall-clock-preserving shift, which agrees with `addLocalDays` on a
  midnight-anchored input. It now pins `TZ`, compares against *epoch*
  arithmetic (the form that actually breaks), and self-checks that the fixture
  still bites.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: The Day Seam

#### Automated

- [x] 1.1 Type checking passes: `npx tsc --noEmit` — df631c5
- [x] 1.2 Linting passes: `npm run lint` — df631c5

#### Manual

- [x] 1.3 "Log to another day…" sheet looks and behaves exactly as before — df631c5
- [x] 1.4 Logging a saved meal to a past day through that sheet still lands on the right day — df631c5

### Phase 2: Move What's Already Logged

#### Automated

- [x] 2.1 Type checking passes: `npx tsc --noEmit` — 8dc56ef
- [x] 2.2 Linting passes: `npm run lint` — 8dc56ef
- [x] 2.3 Existing data paths still green: `npm run smoke:meal-detail` and `npm run smoke:training` — 8dc56ef

#### Manual

- [x] 2.4 A post-midnight meal moves to the previous day and both days update without a refresh — 8dc56ef
- [x] 2.5 Both affected days' week-rail rings repaint after the move — 8dc56ef
- [x] 2.6 The moved entry keeps its original time-of-day — 8dc56ef
- [x] 2.7 Streak responds correctly to a move off a day and into a gap — 8dc56ef
- [x] 2.8 A training session can be moved, and its date subtitle tracks the stepper — 8dc56ef
- [x] 2.9 Editing a meal without touching the day behaves exactly as before — 8dc56ef

### Phase 3: Compose Meals Into a Past Day

#### Automated

- [x] 3.1 Type checking passes: `npx tsc --noEmit` — cc0be8d
- [x] 3.2 Linting passes: `npm run lint` — cc0be8d
- [x] 3.3 Log path still green: `npm run smoke:log` and `npm run smoke:saved-meals` — cc0be8d

#### Manual

- [x] 3.4 Describe-it path logs into a past day, in the tapped section — cc0be8d
- [x] 3.5 Plate photo and label scan paths do the same, surviving a retake — cc0be8d
- [x] 3.6 Saved-meal path logs into the past day, not today — cc0be8d
- [x] 3.7 All four paths work from the Analytics day screen — cc0be8d
- [x] 3.8 Web ＋ and native FAB still log to today when Today shows today — cc0be8d
- [x] 3.9 Week rail and Analytics charts repaint after a backdated log — cc0be8d
- [x] 3.10 A future `day` param falls back to today — cc0be8d
- [x] 3.11 Backdated entry's time matches its section and sorts correctly — cc0be8d

### Phase 4: Log Training Into a Past Day

#### Automated

- [x] 4.1 Type checking passes: `npx tsc --noEmit` — 8ca8b44
- [x] 4.2 Linting passes: `npm run lint` — 8ca8b44
- [x] 4.3 Training path still green: `npm run smoke:training` — 8ca8b44

#### Manual

- [x] 4.4 A session logged for yesterday adds its burn to yesterday's budget only — 8ca8b44
- [x] 4.5 Yesterday's rail ring and the Analytics net line both move — 8ca8b44
- [x] 4.6 "Log training" starts on today every time it is opened — 8ca8b44
- [x] 4.7 Editing an existing session still opens on that session's own day — 8ca8b44
- [x] 4.8 Logging with the stepper left on today behaves exactly as before — 8ca8b44

### Phase 5: Say Which Day, Loudly

#### Automated

- [x] 5.1 Type checking passes: `npx tsc --noEmit` — 59055bb
- [x] 5.2 Linting passes: `npm run lint` — 59055bb
- [x] 5.3 Full smoke suite green: `npm run smoke` plus the per-slice scripts touched — 59055bb
- [x] 5.4 New slice smoke passes: `npm run smoke:past-day` — 59055bb

#### Manual

- [x] 5.5 The target day is named in the popup subtitle before any method is chosen — 59055bb
- [x] 5.6 The day name survives subtitle → staged photo step → review chip — 59055bb
- [x] 5.7 Both recognized and unrecognized review paths show the day — 59055bb
- [x] 5.8 Wording is unchanged when the target is today — 59055bb
- [x] 5.9 No overflow at ~400px with the longer subtitles and added chip — 59055bb
