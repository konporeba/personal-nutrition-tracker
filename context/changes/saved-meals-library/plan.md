# Saved Meals Library Implementation Plan

## Overview

Build the saved-meals library (roadmap S-08): save any newly-committed meal to a reusable, owner-scoped library; re-log a saved meal to today in one tap with no AI call; manage saved meals (edit, delete, or log to a different day) from a long-press sheet. Copy-on-log is structural, not enforced by validation — a re-log copies scalar values into a new `meal_entries` row, with no FK back to the saved meal, matching how every other table in this schema avoids referencing mutable data.

## Current State Analysis

The schema, data-access, and UI layers already anticipate this slice without building it:

- `meal_entries.source` already includes the `'saved_meal'` enum literal (`src/data/types.ts:14`, Postgres `entry_source` enum), unused until now.
- Icons are never stored as a literal — `food_category` (free text) resolves to an emoji at render time via `iconForEntry()` (`src/lib/food-emoji.ts:156-160`), called from `MealEntryRow` (`src/components/meal-entry-row.tsx:34`).
- Every table in this app stores denormalized copies of its data; the one FK in the schema (`meal_entries.estimation_run_id`) is immutable/audit-only and never read back for values. No table shares mutable fields by reference.
- `review.tsx` is the only place a `meal_entries` row is written today (`src/app/(today)/review.tsx:1-3`); its form already has every field a saved meal needs (`name`, `calories`, `protein_g`, `carbs_g`, `fat_g`, `food_category`) in scope at commit time.
- The app has exactly two tabs (`(today)`, `(profile)`), each with its own nested `Stack` for pushed routes (`src/app/(today)/_layout.tsx`, `src/app/(profile)/_layout.tsx`). `weight.tsx` (`src/app/(profile)/weight.tsx`) is the precedent for "a list + create form + long-press-delete, pushed over a tab's index."
- Gesture convention is consistent everywhere it's used: long-press deletes with no confirmation (`meal-entry-row.tsx:5-9`, mirrored for body weights). S-06 established the alternative — tap opens a `Modal`-based sheet (`src/components/move-section-sheet.tsx`) — for actions that need more than a single irreversible gesture.
- There is no day-browsing UI anywhere in the app yet (Today is always the current day, `src/app/(today)/index.tsx:1-4`; browsing other days is roadmap slice S-11). A day picker for "log to another day" is genuinely new UI.

### Key Discoveries:

- `createMealEntry` builds its insert row from an explicit field list, not a spread of `input` (`src/data/meal-entries.repo.ts:23-36`) — S-05's plan flagged this as the exact mechanism by which a field silently gets dropped if it's added to a type but not to this whitelist. The new `saved-meals.repo.ts` must follow the same explicit-list pattern.
- `queryKeys` (`src/data/query-keys.ts`) is the single source of truth for cache keys; every `use-*.ts` hook invalidates through it, never an ad-hoc key.
- The smoke-test convention is a real integration test against the deployed backend, not a mock: `scripts/<slice>-smoke.ts` + `scripts/run-<slice>-smoke.mjs` (an esbuild shim that remaps `@/lib/supabase` / `@/lib/new-id` to their web variants since native modules don't load under Node) + a `"smoke:<slice>"` npm script (`scripts/day-view-smoke.ts`, `scripts/run-day-view-smoke.mjs`, `package.json:57`).
- No `Alert.alert` confirm dialog exists anywhere in this codebase for a destructive action — delete is either an unconfirmed long-press, or (new to this slice) one explicit tap inside a sheet.

## Desired End State

The owner can: (1) check "Save to library" while committing a meal on the review screen, (2) reach a saved-meals library from Today, (3) tap a saved meal to log it to today instantly (no AI call, no form), (4) long-press a saved meal to edit its fields, delete it, or log it to a different day/section. Editing or deleting a saved meal never changes any `meal_entries` row created from it before the edit.

Verify via: `npm run smoke:saved-meals` (asserts the copy-on-log claim against the live backend) plus the manual walkthrough in Phase 5.

## What We're NOT Doing

- **FR-013 (scale multiplier)** — nice-to-have, not in S-08's roadmap PRD refs (only FR-010/011/012/055 are). Re-logging always uses the saved meal's stored quantity as-is.
- **Duplicate-name prevention** — saving a meal with a name that already exists in the library is allowed freely; no uniqueness check.
- **An audit-only `saved_meal_id` FK on `meal_entries`** — omitted; re-logged entries are fully independent copies with nothing pointing back to their saved meal.
- **A general icon picker** — a saved meal's icon is `food_category` text, resolved via the existing `iconForEntry()`, same as `meal_entries`. No new emoji-picker UI (FR-053, the general icon-override affordance, is already deferred elsewhere as nice-to-have).
- **Saving a meal from an already-logged entry on Today** (e.g. from `MealEntryRow`) — save-to-library only happens at commit time on `review.tsx`. Saving a historical entry is not built in this slice.
- **A full calendar UI for day selection** — "log to another day" uses a minimal day stepper (previous/next day, capped at today), not a calendar picker.

## Implementation Approach

Five phases, each independently shippable: (1) the data layer (migration, types, repo, hooks) with no UI; (2) wire "save to library" into the existing commit flow; (3) the library screen with the fast tap-to-relog path, which alone satisfies FR-011's ≤2-interaction requirement; (4) the long-press management sheet (edit, delete, log-to-another-day) layered on top; (5) smoke coverage proving the copy-on-log invariant against the real backend.

## Critical Implementation Details

- **Insert whitelist gotcha**: `createSavedMeal` must build its insert row from an explicit field list, exactly like `createMealEntry` (`meal-entries.repo.ts:23-36`) — not a spread of `input`. This is the specific way S-05 flagged a field getting silently dropped: adding it to `NewSavedMeal`/`SavedMealPatch` alone is not enough.
- **Copy-on-log is enforced by the write path, not a constraint**: there is deliberately no `saved_meal_id` column on `meal_entries`, so the only thing making an edit-after-the-fact safe is that the re-log write in Phase 3 reads the `SavedMeal` object's current scalar values and passes them into `NewMealEntry` once, at tap time. Nothing must ever join back to `saved_meals` for a value after the entry is created.
- **"Log to another day" must preserve today's clock time, not reset to midnight**: build the target `logged_at` as the picked calendar day combined with the *current* time-of-day (`new Date(pickedYear, pickedMonth, pickedDate, now.getHours(), now.getMinutes())`), so `sectionForTime()` still infers a sensible section and the entry lands in the picked day's local `[start, end)` bucket rather than a midnight artifact.
- **Best-effort save-to-library must never block the commit**: mirror `review.tsx`'s existing evidence-photo-upload pattern (`review.tsx:144-148`) — trigger the saved-meal create only inside `createMealEntry`'s own `onSuccess`, swallow/log its error, and never delay or block `backToToday()`.

## Phase 1: Data layer — saved meals schema, repo, and hooks

### Overview

Add the `saved_meals` table, its RLS policies, TypeScript types, a repo file, and TanStack Query hooks — no UI yet.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20260727120000_saved_meals.sql` (new)

**Intent**: Create `public.saved_meals`, following the `meal_entries` schema and RLS pattern exactly (same sync-field shape, same trigger, same four-policy RLS block) so it needs no new conventions.

**Contract**: Columns: `id uuid pk default gen_random_uuid()`, `owner_id uuid not null references auth.users(id) on delete cascade`, `name text not null`, `calories numeric`, `protein_g numeric`, `carbs_g numeric`, `fat_g numeric`, `food_category text`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`, `deleted_at timestamptz`. A partial index `saved_meals_owner_id_idx on (owner_id) where deleted_at is null` (the library read has no date range, so it indexes only owner scoping). Attach the existing shared `set_updated_at()` trigger (defined in `20260720120000_core_log_schema.sql:36-45` — do not redefine it). RLS: enable row level security and add the same four `select`/`insert`/`update`/`delete` policies as `meal_entries` (`20260720120100_rls.sql:39-54`), scoped to `(select auth.uid()) = owner_id`.

#### 2. Types

**File**: `src/data/types.ts`

**Intent**: Add `SavedMeal`, `NewSavedMeal`, `SavedMealPatch`, mirroring the `MealEntry`/`NewMealEntry`/`MealEntryPatch` shapes minus the log-specific fields (`logged_at`, `section`, `source`, `estimation_run_id`).

**Contract**: `SavedMeal` carries `id`, `owner_id`, `name`, `calories`/`protein_g`/`carbs_g`/`fat_g` (all `number | null`), `food_category: string | null`, `created_at`, `updated_at`, `deleted_at: string | null`. `NewSavedMeal` makes `id` optional and the four macro fields plus `food_category` optional (same optionality as `NewMealEntry`). `SavedMealPatch` is `Partial<Pick<SavedMeal, 'name' | 'calories' | 'protein_g' | 'carbs_g' | 'fat_g' | 'food_category'>>`.

#### 3. Repo

**File**: `src/data/saved-meals.repo.ts` (new)

**Intent**: The data-access seam for `saved_meals`, following `meal-entries.repo.ts`'s conventions exactly: its own `requireOwnerId()`, `newId()` for optimistic client-side insert, an explicit insert-row whitelist, soft delete, and every read filtering `deleted_at IS NULL`.

**Contract**: `createSavedMeal(input: NewSavedMeal): Promise<SavedMeal>` — explicit row builder (see Critical Implementation Details), `.insert(row).select().single()`. `listSavedMeals(): Promise<SavedMeal[]>` — `.select('*').is('deleted_at', null).order('name', { ascending: true })` (alphabetical, since this is a browsed/scanned library, not a chronological log). `updateSavedMeal(id: string, patch: SavedMealPatch): Promise<SavedMeal>` — same shape as `updateMealEntry`. `softDeleteSavedMeal(id: string): Promise<void>` — same shape as `softDeleteMealEntry`.

#### 4. Query keys

**File**: `src/data/query-keys.ts`

**Intent**: Register the one new cache-key prefix this slice needs.

**Contract**: Add `savedMeals: { all: () => ['saved-meals'] as const }` to the `queryKeys` object, following the `bodyWeights.all()` shape (a flat, non-day-bucketed list).

#### 5. Hooks

**File**: `src/data/use-saved-meals.ts` (new)

**Intent**: The React-facing seam over the repo, one hook per operation, each mutation invalidating `queryKeys.savedMeals.all()` on success — following `use-body-weights.ts`'s shape (a single flat list, no per-entity key needed since there's no day bucketing).

**Contract**: `useSavedMeals()` — `useQuery({ queryKey: queryKeys.savedMeals.all(), queryFn: listSavedMeals })`. `useCreateSavedMeal()`, `useUpdateSavedMeal()` (mutation input `{ id, patch }`), `useDeleteSavedMeal()` (mutation input the saved meal, matching `useDeleteMealEntry`'s "take the whole entity" convention) — each a `useMutation` invalidating `queryKeys.savedMeals.all()` in `onSuccess`.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly to the deployed project (or local shadow) without error
- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`

#### Manual Verification:

- The `saved_meals` table exists with the expected columns; a manual update advances `updated_at` via the trigger
- RLS blocks access to `saved_meals` without the owner's session (spot-check via the Supabase dashboard or an unauthenticated client)

---

## Phase 2: Save to library at commit time

### Overview

Add a "Save to library" checkbox to the review screen's commit form. Checking it creates a matching `saved_meals` row alongside the `meal_entries` row, as a best-effort side effect that never blocks the commit.

### Changes Required:

#### 1. Review form

**File**: `src/app/(today)/review.tsx`

**Intent**: Let the owner opt into saving the meal they're about to log, without adding any new required step to the existing commit flow.

**Contract**: Add local state `const [saveToLibrary, setSaveToLibrary] = useState(false)` and a checkbox-style `Pressable` row (following the existing `Field`/segmented-option visual language, not a new component) placed near the "Log it" button. Wire `useCreateSavedMeal()` from the new hooks file. In `create.mutate`'s existing `onSuccess` (`review.tsx:140-155`), after the existing evidence-photo best-effort call, add: if `saveToLibrary` is checked, call `createSavedMeal.mutate({ name: name.trim(), calories: total(calories), protein_g: total(protein), carbs_g: total(carbs), fat_g: total(fat), food_category: recognized ? estimate.food_category || null : null })` with no `onError` handler that blocks navigation — same best-effort posture as the photo upload immediately above it. `backToToday(router)` still fires unconditionally.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`

#### Manual Verification:

- Logging a meal with "Save to library" checked creates both the `meal_entries` row and a matching `saved_meals` row with the same name/macros/food_category
- Logging with the checkbox unchecked creates only the `meal_entries` row
- A failed saved-meal creation (e.g. simulated network drop) still lets the meal log successfully and still navigates back to Today

---

## Phase 3: Library screen and fast re-log

### Overview

A pushed screen listing saved meals, reachable from Today, where tapping a row logs it to today instantly — the path that satisfies FR-011's ≤2-interaction requirement.

### Changes Required:

#### 1. Row component

**File**: `src/components/saved-meal-row.tsx` (new)

**Intent**: Render one saved meal — icon, name, calories — following `MealEntryRow`'s exact visual layout and `onPress`/`onLongPress` split.

**Contract**: `SavedMealRow({ savedMeal, onPress, onLongPress })`, icon via `iconForEntry({ food_category: savedMeal.food_category, name: savedMeal.name })` (the same function `MealEntryRow` uses — `SavedMeal` and `MealEntry` both satisfy `iconForEntry`'s `{ food_category, name }` parameter shape without any adapter).

#### 2. Library screen

**File**: `src/app/(today)/library.tsx` (new)

**Intent**: List every saved meal; tapping one creates today's entry immediately, no confirmation screen, no AI call.

**Contract**: `useSavedMeals()` feeds a `FlatList` (flat, not day-bucketed — following `weight.tsx`'s list shape, not Today's `SectionList`). `onPress` on a row calls `useCreateMealEntry().mutate({ logged_at: new Date().toISOString(), section: sectionForTime(new Date()), source: 'saved_meal', name: savedMeal.name, calories: savedMeal.calories, protein_g: savedMeal.protein_g, carbs_g: savedMeal.carbs_g, fat_g: savedMeal.fat_g, food_category: savedMeal.food_category, estimation_run_id: null })`, and on success navigates back to Today (`router.back()`), matching `backToToday`'s pattern in `review.tsx`. `onLongPress` is wired in Phase 4.

#### 3. Route registration

**File**: `src/app/(today)/_layout.tsx`

**Intent**: Register the new route in the Today tab's `Stack` so it gets the shared header styling.

**Contract**: Add `<Stack.Screen name="library" options={{ title: 'Saved meals' }} />` alongside the existing `index` screen entry.

#### 4. Navigation entry point

**File**: `src/app/(today)/index.tsx`

**Intent**: Give the owner a visible way to reach the library from Today.

**Contract**: A small `Pressable` (styled like the existing `Log weight` button in `(profile)/index.tsx:134-140`) near the composer, calling `router.push('/(today)/library')`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`

#### Manual Verification:

- Today has a visible way to reach the saved-meals library
- The library lists every saved meal with its icon, name, and calories
- Tapping a saved-meal row creates a new entry on today's day view in the section implied by the current time, with no loading/estimate screen and no AI call
- The day's running total updates immediately to reflect the re-logged entry
- Re-logging the same saved meal twice creates two independent entries

---

## Phase 4: Manage saved meals — edit, delete, and log to another day

### Overview

Long-pressing a saved-meal row opens a sheet offering Edit, Delete, and "Log to another day…" — the management surface that doesn't fit into the fast tap path.

### Changes Required:

#### 1. Actions sheet

**File**: `src/components/saved-meal-actions-sheet.tsx` (new)

**Intent**: The long-press destination, built on RN's `Modal` exactly like `MoveSectionSheet` (no new dependency).

**Contract**: `SavedMealActionsSheet({ visible, savedMeal, onEdit, onLogToAnotherDay, onDelete, onRequestClose })` — three option rows ("Log to another day…", "Edit", "Delete") plus a "Cancel" row, following `move-section-sheet.tsx`'s backdrop/inner-`Pressable`/`SafeAreaView` structure. Tapping "Delete" calls `onDelete` directly (this in-sheet tap is itself the confirmation step this slice adds — a deliberate, scoped exception to the app's usual "long-press = instant delete" convention, since long-press here opens the sheet instead).

#### 2. Wire the sheet into the library screen

**File**: `src/app/(today)/library.tsx`

**Intent**: Connect the row's `onLongPress` to the new sheet and its three actions to the corresponding hooks/navigation.

**Contract**: `onLongPress` sets a `targetedSavedMeal` state, opening the sheet. "Edit" navigates to `saved-meal-edit.tsx` with the id as a route param. "Delete" calls `useDeleteSavedMeal().mutate(savedMeal)` and closes the sheet. "Log to another day…" opens the day+section picker (below).

#### 3. Day+section picker

**File**: `src/components/log-to-day-sheet.tsx` (new)

**Intent**: A minimal day stepper (not a calendar) plus a section picker, for the one flow that genuinely needs "any day" (FR-011).

**Contract**: `LogToDaySheet({ visible, savedMeal, onLog, onRequestClose })`. State: a selected `Date` (calendar day only), defaulting to today, adjustable via previous/next-day `Pressable`s, capped so the next-day control disables once the selection reaches today (no future days). Below the stepper, a section list reusing `SECTION_ORDER`/`SECTION_LABELS` exactly like `MoveSectionSheet`, defaulting to `sectionForTime(new Date())`. A "Log" button calls `onLog(pickedDate, pickedSection)`; the caller builds `logged_at` per the Critical Implementation Details note (picked day + current clock time) and calls `useCreateMealEntry()`.

#### 4. Edit screen

**File**: `src/app/(today)/saved-meal-edit.tsx` (new)

**Intent**: A trimmed `review.tsx`-style form (no assumptions, no AI) for editing a saved meal's name/macros/category.

**Contract**: Reads the target saved meal via a route param id and `useSavedMeals()` (find by id — the list is already cached, so no second fetch). Reuses the `Field`/`NumericField` pattern from `review.tsx`, seeded from the saved meal's current values. A "Save changes" button calls `useUpdateSavedMeal().mutate({ id, patch: { name, calories, protein_g, carbs_g, fat_g, food_category } })` and navigates back on success.

#### 5. Route registration

**File**: `src/app/(today)/_layout.tsx`

**Intent**: Register the edit screen in the same `Stack` as `library`.

**Contract**: Add `<Stack.Screen name="saved-meal-edit" options={{ title: 'Edit saved meal' }} />`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`

#### Manual Verification:

- Long-pressing a saved-meal row opens a sheet with "Log to another day…", "Edit", and "Delete"
- Edit opens a form pre-filled with the saved meal's current values; saving updates the library entry and the library list reflects the change immediately
- Editing a saved meal that was already re-logged earlier does NOT change the previously-logged entry's values on Today or any prior day
- Delete removes the saved meal from the library immediately and does not affect any previously-logged entries
- "Log to another day…" lets the owner pick a day other than today and a section, then creates the entry on that day; the day+section picker cannot select a future day

---

## Phase 5: Smoke coverage

### Overview

A live-backend smoke test proving the slice's core claim — that editing or deleting a saved meal never retroactively changes an entry already logged from it.

### Changes Required:

#### 1. Smoke script

**File**: `scripts/saved-meals-smoke.ts` (new)

**Intent**: Follow `day-view-smoke.ts`'s exact structure — sign in as the real owner, exercise the real repo functions against the deployed backend, assert, hard-delete everything created in a `finally`.

**Contract**: Assertions: (a) `createSavedMeal` round-trips through `listSavedMeals`; (b) re-logging (calling `createMealEntry` with `source: 'saved_meal'` and the saved meal's copied fields) creates a `meal_entries` row with `estimation_run_id: null` and matching macros; (c) **the copy-on-log claim** — after re-logging, call `updateSavedMeal` to change the saved meal's `calories`, then re-fetch the earlier-created `meal_entries` row via `listMealEntriesForDay` and assert its `calories` is still the *original* value; (d) `softDeleteSavedMeal` removes the saved meal from `listSavedMeals` and does not affect the previously-logged entry.

#### 2. Runner shim

**File**: `scripts/run-saved-meals-smoke.mjs` (new)

**Intent**: The esbuild bundler shim, copied from `run-day-view-smoke.mjs` with the entry point retargeted.

**Contract**: Same `nodeShim` remapping (`@/lib/supabase` → `.web.ts`, `@/lib/new-id` → `.web.ts`, RN URL polyfill stub), `entryPoints: ['scripts/saved-meals-smoke.ts']`.

#### 3. npm script

**File**: `package.json`

**Intent**: Register the new smoke command alongside the existing `smoke:*` scripts.

**Contract**: Add `"smoke:saved-meals": "node --env-file=.env --env-file-if-exists=.env.local scripts/run-saved-meals-smoke.mjs"`.

### Success Criteria:

#### Automated Verification:

- Saved-meals smoke passes: `npm run smoke:saved-meals`
- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`
- Prior smokes still pass: `npm run smoke`, `npm run smoke:estimate`, `npm run smoke:log`, `npm run smoke:profile`, `npm run smoke:icon`, `npm run smoke:day-view`

#### Manual Verification:

- Full walkthrough: log a meal and save it to the library, re-log it from the library to today, edit the saved meal and confirm the earlier-logged entry is unchanged, log it to a past day via "Log to another day…", then delete the saved meal and confirm all previously-logged entries remain untouched

---

## Testing Strategy

### Unit Tests:

- None — this codebase has no configured test runner (per `CLAUDE.md`); correctness is covered by type checking, linting, and the smoke script.

### Integration Tests:

- `scripts/saved-meals-smoke.ts` (Phase 5) is the integration coverage, run against the deployed backend.

### Manual Testing Steps:

1. Log a meal via free text with "Save to library" checked; confirm it appears in the library.
2. From the library, tap the saved meal; confirm it logs to today instantly with no AI call.
3. Long-press the saved meal, edit its calories, save; confirm the library shows the new value but the entry logged in step 2 still shows the old value.
4. Long-press again, choose "Log to another day…", pick a past day; confirm the entry lands on that day, not today.
5. Delete the saved meal; confirm it disappears from the library and every previously-logged entry from it remains on its day.

## Performance Considerations

None beyond what the existing query-client defaults already provide (`src/data/query-client.ts`'s 5-minute `staleTime`, AsyncStorage persistence, focus-refetch) — `useSavedMeals()` is a single flat list with no pagination need at single-owner scale.

## Migration Notes

Purely additive: one new table, no changes to `meal_entries` or any existing table. No backfill needed — the library starts empty and only grows from explicit owner action.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-08: "Save and reuse meals")
- PRD: `context/foundation/prd.md` (US-04, FR-010, FR-011, FR-012, FR-055)
- Precedent for the Modal-based sheet: `src/components/move-section-sheet.tsx`
- Precedent for a list + create form + long-press delete pushed over a tab: `src/app/(profile)/weight.tsx`
- Precedent for the commit-time write path: `src/app/(today)/review.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data layer — saved meals schema, repo, and hooks

#### Automated

- [x] 1.1 Migration applies cleanly to the deployed project (or local shadow) without error — e8b1fc5
- [x] 1.2 Type checking passes: `npx tsc --noEmit` — e8b1fc5
- [x] 1.3 Linting passes: `npm run lint` — e8b1fc5

#### Manual

- [x] 1.4 The `saved_meals` table exists with the expected columns; a manual update advances `updated_at` via the trigger — e8b1fc5
- [x] 1.5 RLS blocks access to `saved_meals` without the owner's session — e8b1fc5

### Phase 2: Save to library at commit time

#### Automated

- [x] 2.1 Type checking passes: `npx tsc --noEmit` — a5c10d5
- [x] 2.2 Linting passes: `npm run lint` — a5c10d5

#### Manual

- [x] 2.3 Logging a meal with "Save to library" checked creates both the `meal_entries` row and a matching `saved_meals` row with the same name/macros/food_category — a5c10d5
- [x] 2.4 Logging with the checkbox unchecked creates only the `meal_entries` row — a5c10d5
- [x] 2.5 A failed saved-meal creation still lets the meal log successfully and still navigates back to Today — a5c10d5

### Phase 3: Library screen and fast re-log

#### Automated

- [x] 3.1 Type checking passes: `npx tsc --noEmit` — a794942
- [x] 3.2 Linting passes: `npm run lint` — a794942

#### Manual

- [x] 3.3 Today has a visible way to reach the saved-meals library — a794942
- [x] 3.4 The library lists every saved meal with its icon, name, and calories — a794942
- [x] 3.5 Tapping a saved-meal row creates a new entry on today's day view in the section implied by the current time, with no loading/estimate screen and no AI call — a794942
- [x] 3.6 The day's running total updates immediately to reflect the re-logged entry — a794942
- [x] 3.7 Re-logging the same saved meal twice creates two independent entries — a794942

### Phase 4: Manage saved meals — edit, delete, and log to another day

#### Automated

- [x] 4.1 Type checking passes: `npx tsc --noEmit` — b5a4e8c
- [x] 4.2 Linting passes: `npm run lint` — b5a4e8c

#### Manual

- [x] 4.3 Long-pressing a saved-meal row opens a sheet with "Log to another day…", "Edit", and "Delete" — b5a4e8c
- [x] 4.4 Edit opens a form pre-filled with the saved meal's current values; saving updates the library entry and the library list reflects the change immediately — b5a4e8c
- [x] 4.5 Editing a saved meal that was already re-logged earlier does NOT change the previously-logged entry's values on Today or any prior day — b5a4e8c
- [x] 4.6 Delete removes the saved meal from the library immediately and does not affect any previously-logged entries — b5a4e8c
- [x] 4.7 "Log to another day…" lets the owner pick a day other than today and a section, then creates the entry on that day; the day+section picker cannot select a future day — b5a4e8c

### Phase 5: Smoke coverage

#### Automated

- [x] 5.1 Saved-meals smoke passes: `npm run smoke:saved-meals`
- [x] 5.2 Type checking passes: `npx tsc --noEmit`
- [x] 5.3 Linting passes: `npm run lint`
- [x] 5.4 Prior smokes still pass: `npm run smoke`, `npm run smoke:estimate`, `npm run smoke:log`, `npm run smoke:profile`, `npm run smoke:icon`, `npm run smoke:day-view`

#### Manual

- [x] 5.5 Full walkthrough: log a meal and save it to the library, re-log it from the library to today, edit the saved meal and confirm the earlier-logged entry is unchanged, log it to a past day via "Log to another day…", then delete the saved meal and confirm all previously-logged entries remain untouched
