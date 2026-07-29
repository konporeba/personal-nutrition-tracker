# Meal Detail View Implementation Plan

## Overview

Add a screen that lets the owner tap a logged meal entry in today's list and see its full macro breakdown, icon, and source marker, then edit its name/macros/category, change its section, or delete it — all from one place. This replaces the current split where tapping an entry opens a re-section sheet and long-pressing instantly (and unconfirmedly) deletes it. Roadmap slice S-07 (`meal-detail-view`), PRD US-09 / FR-062 / FR-063.

## Current State Analysis

- `src/app/(today)/index.tsx:116-121` wires `MealEntryRow`'s `onPress` to open `MoveSectionSheet` (re-section) and `onLongPress` to call `deleteEntry.mutate(item)` directly, with no confirmation.
- `src/components/meal-entry-row.tsx:5-9` documents that split explicitly as a stopgap: *"Deleting is a long-press, not a tap. There is deliberately no confirm step (editing a committed entry is S-07, so delete-and-relog is the whole correction path for now)."* This slice is what that comment was waiting on.
- No detail/edit screen for a meal entry exists yet, and no `EntrySource` value has ever been rendered to the user anywhere in the app.
- The data layer already supports every field this needs: `updateMealEntry(id, patch: MealEntryPatch)` and `softDeleteMealEntry(id)` (`src/data/meal-entries.repo.ts:63-87`) accept `name`, `calories`, `protein_g`, `carbs_g`, `fat_g`, `food_category`, and `section`. Only a general-purpose edit *hook* is missing — `src/data/use-meal-entries.ts` currently only exposes `useUpdateMealEntrySection` (section-only) alongside `useCreateMealEntry`/`useDeleteMealEntry`.
- `food_category` has no fixed taxonomy — `src/lib/food-emoji.ts` resolves an icon by matching free text against an ordered keyword table (`emojiForFood`/`iconForEntry`). There are no canonical category names to build a picker from.

## Desired End State

Tapping any entry in today's list opens `/(today)/meal-detail?id=<id>`, a screen showing the entry's icon, name, calories/protein/carbs/fat, and a labeled "Source" row. From there the owner can edit name/macros/category (with the icon preview updating live as the category text changes), tap "Change section" to reuse the existing `MoveSectionSheet`, or tap Delete to remove the entry immediately. Any of these return to the day list, where the section subtotal and day total have already recalculated via the existing query-invalidation plumbing. Long-pressing an entry in the list no longer does anything — the detail screen is the one path for edit, re-section, and delete.

Verification: `npx tsc --noEmit`, `npm run lint`, and a new `npm run smoke:meal-detail` all pass; manual pass per phase below confirms the UI end to end.

### Key Discoveries:

- `src/data/use-meal-entries.ts:82-94` (`useUpdateMealEntrySection`) is the exact hook shape to mirror for a general `useUpdateMealEntry` — same invalidation-by-`logged_at` pattern.
- `src/app/(today)/saved-meal-edit.tsx` is a directly reusable template: resolve-from-cached-list, `Field`/`NumericField` components, `seedField`/`toNumberOrNull` null-vs-empty convention, `canSave` guard, and a `MissingSavedMeal`-style fallback for a stale id.
- `src/components/move-section-sheet.tsx` is reused as-is, just lifted from `index.tsx` into the new screen.
- `src/lib/food-emoji.ts:156-160` (`iconForEntry`) is reused both for the header icon and for the live preview as the category field is edited.
- `scripts/day-view-smoke.ts` / `scripts/saved-meals-smoke.ts` plus their `scripts/run-*-smoke.mjs` wrappers are the pattern for a new `scripts/meal-detail-smoke.ts` (esbuild Node shim, authenticate as owner, round-trip against the deployed backend, hard-delete fixtures in a `finally`).
- `src/data/types.ts:10-16` (`EntrySource`) has no display-label map yet — `SECTION_LABELS` in `src/components/section-subtotal.tsx:13-19` is the precedent to follow, but since `SOURCE_LABELS` has only one consumer today it's defined locally in the new screen rather than extracted.

## What We're NOT Doing

- No per-component macro breakdown — OQ-6 resolved aggregate-only for v1; this ships against `MealEntry`'s flat macro fields.
- No editing of `logged_at` (the day/time an entry was logged) — out of scope; an entry's day never changes here.
- No browsing of past days from this screen — `useDayEntries()` is today-only (S-11 browsing-past-days is a separate, later slice), so the detail screen only resolves entries from today's cached list.
- No fixed/canonical food-category picker — `food_category` stays a free-text field matched against the existing keyword table; no new taxonomy is introduced.
- No delete confirmation dialog, and no OS `Alert.alert` — tapping Delete acts immediately, matching `SavedMealActionsSheet`'s established convention.
- No change to `source` when macros/name/category are edited — the recorded capture method (label scan, plate photo, free text, saved meal, manual) is preserved regardless of manual correction.
- No quick-delete shortcut retained on the day list — long-press is fully retired, not kept alongside the new screen.

## Implementation Approach

Two vertical slices: first build the detail screen and its one new data hook as a fully working, independently-reachable screen; then re-point the day list's tap gesture at it and strip the now-redundant re-section/delete state out of `index.tsx`. This lets phase 1 be manually verified via a direct route navigation before the list is touched, and keeps the "remove old gestures" diff isolated and easy to review on its own.

## Critical Implementation Details

**Source is immutable from this screen.** The edit form's save call must never include `source` in its patch — `MealEntryPatch` allows it (it's used at write time in `review.tsx`/`library.tsx`), but this screen must not touch it, since the whole point of Q7's resolution is that a hand-corrected calorie figure doesn't erase the fact that it started as, say, a label scan.

## Phase 1: Meal detail screen

### Overview

Add the one missing data hook and build the full detail/edit screen as a standalone, directly-navigable route.

### Changes Required:

#### 1. Data hook

**File**: `src/data/use-meal-entries.ts`

**Intent**: Add a general-purpose edit mutation for a meal entry's editable fields (name, macros, food_category — anything in `MealEntryPatch` except `source`), mirroring the existing `useUpdateMealEntrySection`.

**Contract**: New export `useUpdateMealEntry()`, same invalidate-by-`logged_at` pattern as its siblings:

```ts
export function useUpdateMealEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Pick<MealEntry, 'id' | 'logged_at'> & { patch: MealEntryPatch }) =>
      updateMealEntry(input.id, input.patch),
    onSuccess: (entry) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.mealEntries.day(new Date(entry.logged_at)),
      });
    },
  });
}
```

No repo change needed — `updateMealEntry`/`MealEntryPatch` already accept every field this hook needs.

#### 2. Detail screen

**File**: `src/app/(today)/meal-detail.tsx` (new)

**Intent**: A query-param route (`?id=`) resolving the entry from `useDayEntries()`'s cached list, the same way `saved-meal-edit.tsx` resolves from `useSavedMeals()`. Renders the icon (`iconForEntry`), name, calorie/macro figures, and a dedicated "Source: <label>" row using a locally-defined `SOURCE_LABELS: Record<EntrySource, string>` map. Below that, an edit form cloning `saved-meal-edit.tsx`'s `Field`/`NumericField`/`seedField`/`toNumberOrNull` pattern for name, calories, protein, carbs, fat, and a `food_category` `Field` whose current (uncommitted) value drives a live icon preview via `iconForEntry({ food_category: value, name })` next to the label, so the owner sees the icon change as they type. A "Change section" button opens `MoveSectionSheet` (state lifted into this screen, identical to how `index.tsx` currently owns `movingEntry`), calling `useUpdateMealEntrySection` on select. A Delete button calls `useDeleteMealEntry().mutate(entry)` immediately on tap (no confirmation step) and navigates back on success, matching `SavedMealActionsSheet`'s "tap Delete = confirm" convention. Save calls `useUpdateMealEntry()` with a patch built from the form fields only — never `source` — and navigates back on success. A `MissingMealEntry` fallback (mirroring `MissingSavedMeal`) renders when the id doesn't resolve (stale/deleted from another client).

**Contract**: Default export `MealDetailScreen`; reads `useLocalSearchParams<{ id?: string }>()`; resolves via `const entry = data?.find((e) => e.id === id) ?? null` against `useDayEntries().query.data`. Route: `/(today)/meal-detail`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`
- New smoke passes: `npm run smoke:meal-detail` — a new `scripts/meal-detail-smoke.ts` + `scripts/run-meal-detail-smoke.mjs` (mirroring `day-view-smoke.ts`'s esbuild-shim pattern) proving against the deployed backend that (a) `updateMealEntry` with a `{ name, calories, protein_g, carbs_g, fat_g, food_category }` patch leaves the entry's `source` unchanged from whatever it was created with, and (b) `softDeleteMealEntry` removes the entry from `listMealEntriesForDay`'s result.

#### Manual Verification:

- Navigating directly to `/(today)/meal-detail?id=<id>` for an existing entry (e.g. via the web build's address bar, since the list isn't wired to it yet) shows its icon, name, macros, and correct source label.
- Editing the food-category field updates the shown icon live as text is typed.
- Editing name/macros and tapping Save updates the entry and returns to the previous screen.
- Tapping "Change section" opens `MoveSectionSheet`; picking a different section updates the entry.
- Tapping Delete removes the entry immediately, with no confirmation prompt, and navigates back.
- Navigating to `/(today)/meal-detail?id=<deleted-or-unknown-id>` shows the "not found" fallback with a working way back.
- Editing macros on an entry originally logged via `label_scan` (or any non-manual source) and saving leaves its displayed source unchanged afterward — it must not read "Manual".

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Wire the day list into the detail screen

### Overview

Re-point the day list's tap gesture at the new screen and remove the re-section/delete state and gestures it replaces.

### Changes Required:

#### 1. Today screen

**File**: `src/app/(today)/index.tsx`

**Intent**: The day list becomes a pure list-and-navigate surface; every mutation (edit, re-section, delete) now happens from the detail screen instead.

**Contract**: `MealEntryRow`'s `onPress` becomes `() => router.push({ pathname: '/(today)/meal-detail', params: { id: item.id } })`; the `onLongPress` prop is no longer passed. Remove: the `movingEntry` state and `moveTo` function, the `<MoveSectionSheet>` element, the `useUpdateMealEntrySection`/`useDeleteMealEntry` imports and their call sites, and the inline "Couldn't move"/"Couldn't delete" error banners in `ListHeaderComponent` (neither action originates from this screen anymore).

#### 2. Entry row component

**File**: `src/components/meal-entry-row.tsx`

**Intent**: Keep the component's contract and comment truthful now that `onLongPress` has no caller and the gesture split it documented no longer exists.

**Contract**: `MealEntryRow({ entry, onPress }: { entry: MealEntry; onPress?: () => void })` — drop the `onLongPress` prop from the signature and the `Pressable` JSX; rewrite the header comment to describe tap opening the detail screen, with no long-press behavior.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`
- Regression check passes: `npm run smoke:day-view` (confirms the shared repo/hook layer this phase's UI wiring depends on is untouched)

#### Manual Verification:

- Tapping an entry in today's list opens the meal-detail screen for that entry.
- Long-pressing an entry no longer deletes it or does anything else.
- After editing, re-sectioning, or deleting from the detail screen and returning to the list, the section subtotal(s) and day total reflect the change immediately.
- No leftover "Couldn't move"/"Couldn't delete" banners appear on the Today screen.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None — no unit-test runner is configured in this project (per `CLAUDE.md`); correctness is covered by `tsc`, `lint`, and the smoke scripts below.

### Integration Tests:

- `npm run smoke:meal-detail` (new): `updateMealEntry` patch preserves `source`; `softDeleteMealEntry` removes the entry from the day read.
- `npm run smoke:day-view` (regression): confirms `updateMealEntry`'s section-move path and `groupEntriesBySection` subtotals are unaffected by phase 2's UI-only changes.

### Manual Testing Steps:

1. Log a meal via any capture path (free text is fastest) so there's an entry to inspect.
2. Tap it in today's list; confirm the detail screen shows icon, name, macros, and source.
3. Edit a macro value and the category text; confirm the icon preview updates live and Save persists both.
4. Use "Change section" to move it; confirm the day list reflects the new section and subtotal after returning.
5. Delete it from the detail screen; confirm it disappears from the list with no confirmation prompt.
6. Confirm long-pressing a remaining entry does nothing.

## Performance Considerations

None beyond what's already handled — the detail screen reads from the same cached `useDayEntries()` query the list already holds, so opening it triggers no extra network round trip.

## Migration Notes

None — no schema change; `updateMealEntry`/`softDeleteMealEntry` and their underlying table are unchanged.

## References

- Roadmap slice: `context/foundation/roadmap.md` — S-07 `meal-detail-view`
- PRD: `context/foundation/prd.md` — US-09, FR-062, FR-063
- Prior slice this replaces gestures from: `context/archive/2026-07-27-structured-day-view/`
- Reusable edit-form template: `src/app/(today)/saved-meal-edit.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Meal detail screen

#### Automated

- [x] 1.1 Type checking passes: `npx tsc --noEmit`
- [x] 1.2 Linting passes: `npm run lint`
- [x] 1.3 New smoke passes: `npm run smoke:meal-detail`

#### Manual

- [x] 1.4 Direct navigation to `/(today)/meal-detail?id=<id>` shows icon, name, macros, source label
- [x] 1.5 Editing the category field updates the icon preview live
- [x] 1.6 Editing name/macros and Save persists and returns
- [x] 1.7 "Change section" opens MoveSectionSheet and updates the section
- [x] 1.8 Delete removes the entry immediately with no confirmation
- [x] 1.9 Unknown/deleted id shows the "not found" fallback
- [x] 1.10 Editing macros on a non-manual-source entry leaves its source unchanged

### Phase 2: Wire the day list into the detail screen

#### Automated

- [ ] 2.1 Type checking passes: `npx tsc --noEmit`
- [ ] 2.2 Linting passes: `npm run lint`
- [ ] 2.3 Regression check passes: `npm run smoke:day-view`

#### Manual

- [ ] 2.4 Tapping an entry opens the meal-detail screen
- [ ] 2.5 Long-pressing an entry does nothing
- [ ] 2.6 Subtotals and day total reflect edits/re-sections/deletes after returning to the list
- [ ] 2.7 No leftover "Couldn't move"/"Couldn't delete" banners remain
