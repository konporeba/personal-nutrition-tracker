# Meal Detail View — Plan Brief

> Full plan: `context/changes/meal-detail-view/plan.md`

## What & Why

Right now the owner can't inspect or correct a logged meal beyond deleting and re-logging it. This adds a detail screen (US-09 / FR-062 / FR-063): tap an entry in today's list to see its full macro breakdown, icon, and source (how it was estimated), then edit it, move it to a different section, or delete it — with subtotals and the day total recalculating.

## Starting Point

Today's list (`src/app/(today)/index.tsx`) already renders five sections with subtotals. Tapping an entry currently opens a re-section sheet; long-pressing instantly soft-deletes with **no confirmation** — a stopgap the codebase's own comments say was waiting on this exact slice. No entry has ever shown its macro breakdown or source, and no edit screen for a committed entry exists. The data layer (`updateMealEntry`, `softDeleteMealEntry`) already supports every field this needs — only a general-edit hook is missing.

## Desired End State

Tapping any entry opens `/(today)/meal-detail?id=<id>`: icon, name, macros, and a labeled source row, with edit fields for name/macros/category (icon preview updates live as category is typed), a "Change section" button reusing the existing move sheet, and an immediate-action Delete button. Long-press on the list no longer does anything — the detail screen is the one place edit/re-section/delete happen.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Gesture remap | Detail screen owns edit/re-section/delete; long-press delete removed from the list | One consistent path, matching FR-063's framing of the detail view as *the* place these actions happen |
| Delete confirmation | Immediate on tap, no dialog | Matches the app's existing convention — `SavedMealActionsSheet` already treats tapping Delete as the confirm step, and `Alert.alert` is never used for confirms elsewhere |
| Re-sectioning UX | Reuse the existing `MoveSectionSheet` via a button | Zero new UI code, proven component |
| Editable fields | Name + macros + food category | Owner wants to be able to correct a wrong icon/category, not just the numbers |
| Category control | Free-text field with live icon preview, not a fixed picker | `food_category` has no canonical taxonomy in this codebase — it's matched against an ordered keyword table, so there's no fixed list to pick from |
| Time/day edit | Out of scope | Keeps this slice tight to FR-063 (values/re-section/delete); avoids cross-day cache-invalidation risk the project's own lessons flag as sensitive |
| Source label prominence | Dedicated labeled row | FR-062 calls the source marker out as a first-class thing to show |
| Source on edit | Never changes | Matches the PRD's "estimation with correction" logic — a correction refines the number, it doesn't erase how it was originally captured |

## Scope

**In scope:** detail screen, general edit hook, source-label display, category free-text + live icon preview, re-section via existing sheet, immediate delete, day-list gesture rewiring.

**Out of scope:** per-component macro breakdown (OQ-6 deferred), editing `logged_at`/day, browsing past days, a fixed category taxonomy/picker, any delete confirmation dialog, changing `source` on edit.

## Architecture / Approach

Two phases: (1) build the detail screen and its one new data hook (`useUpdateMealEntry`, mirroring `useUpdateMealEntrySection`) as a standalone, directly-navigable route, reusing `saved-meal-edit.tsx`'s form pattern and `MoveSectionSheet` as-is; (2) re-point the day list's tap gesture at it and strip the now-redundant re-section/delete state out of `index.tsx` and `meal-entry-row.tsx`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Meal detail screen | New hook + full detail/edit screen, reachable by direct navigation | None significant — almost entirely reuse of existing patterns |
| 2. Wire the day list into it | Tap opens the screen; old gestures/state removed from `index.tsx` | Must not silently drop the "Couldn't move/delete" error paths without confirming they're truly dead |

**Prerequisites:** none beyond what's already shipped (S-05 icons, S-06 structured day view — both done).
**Estimated effort:** ~1 session across 2 phases; almost all supporting patterns already exist.

## Open Risks & Assumptions

- The detail screen resolves entries from `useDayEntries()` (today only) — opening it for a past day's entry isn't possible until S-11 (browsing past days) exists; not a regression, just a current scope boundary.
- Removing the long-press instant-delete shortcut is a deliberate UX change (confirmed with the owner) — if it's missed later, note that it was intentional, not an oversight.

## Success Criteria (Summary)

- Tapping a logged entry shows its full macro breakdown, icon, and source, and lets the owner edit/re-section/delete it from one screen.
- Editing an entry never changes its recorded source, and never fabricates a value (empty stays empty, not zero).
- The day list's subtotals and total stay correct immediately after any edit, move, or delete.
