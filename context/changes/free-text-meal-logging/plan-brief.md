# Free-Text Meal Logging (S-01) — Plan Brief

> Full plan: `context/changes/free-text-meal-logging/plan.md`

## What & Why

Wire the product's core loop end-to-end for the first time: the owner types a meal
description, gets an AI estimate, reviews and edits it, and commits it to today. This is the
roadmap's **north star** — the smallest slice that proves the product's central bet (that AI
estimation is low-friction and accurate enough to sustain daily logging) with the least
scaffolding of any capture path. Every other slice only matters if this one works.

## Starting Point

Both prerequisites shipped, and they were built for this moment: `estimateMeal` returns a
structured estimate with the `recognized: false` manual-entry cue deliberately kept out of
the error union, and `Estimate`'s field names were aligned to `MealEntry` "so a reviewed
estimate maps onto a `NewMealEntry` without renaming (S-01)". Everything above those seams is
missing — `src/app/` is still the Expo starter ("Welcome to Expo" + an Explore demo), there
are **zero `useQuery`/`useMutation` calls in the repo** despite the provider being wired, and
there is **no Stack navigator anywhere**, so nothing can currently be pushed.

## Desired End State

The app opens onto **Today**: a running calorie total, the day's entries, and a text field
ready for input. Typing a meal shows a spinner, then a review screen with editable name and
macros plus the model's assumptions; saving commits it and the list and total update
immediately. Gibberish lands on the same screen with blank macros and a "couldn't identify
this" message — nothing is ever logged with a fabricated value. A network failure keeps the
typed text with a Retry button. Long-press deletes an entry.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Capture entry point | Inline composer on Today + pushed review screen | Zero taps to start typing (the NFR wants text at least as fast as photo), and the review route is what S-03/S-04 later push into with a photo-derived estimate |
| Review editability | Name + all four macros editable | Satisfies FR-005's "any value" literally, and the same form doubles as the manual-entry fallback — one component, two modes |
| Unrecognized input | Same review form with blank macros, committed as `source: 'manual'` | One code path, no dead end, and it structurally guarantees FR-008 rather than relying on a separate branch to be correct |
| Section (NOT NULL, but S-06 owns the view) | Inferred from time of day, never shown | Entries carry real sections from day one so S-06 lights up over history instead of one repeated default; the function is the seam S-06 extends with an override |
| Day surface | Flat list + running calorie total | Exactly what the roadmap prescribes; a target to compare against needs S-02, and sections need S-06 |
| Estimate in flight | Blocking spinner, error preserves the typed text, manual Retry | Never lose the owner's input, exactly one AI call per attempt, and no offline queue (a PRD Non-Goal) |
| Optimistic insert | Rejected | FR-005 forbids anything appearing in the day before the owner confirms it |
| Scaffold | Replace Home, delete Explore, single tab for now | The app becomes the product; keeping the platform-split tab files means S-02 adds a tab in two lines |
| Query layer | Hooks module + typed key factory | First hooks in the repo set the convention for five downstream slices; drifting key strings are the classic cause of stale totals |
| Post-commit correction | Delete only (edit waits for S-07) | Covers the realistic failure with an existing repo call and no new screen; editing belongs with the detail view, blocked on OQ-6 |
| Testing | Extend the smoke-script pattern, no Jest | Matches both shipped slices and proves the live round trip — which is the risk that actually matters here |

## Scope

**In scope:** navigation restructure (first Stack in the repo); Today screen with day list
and running total; free-text composer; estimate call with in-flight/error/retry; review
screen with full editing and surfaced assumptions; manual-entry fallback; section inference;
commit + soft delete; `npm run smoke:log` and verification docs.

**Out of scope:** five-section day view (S-06); budget/targets (S-02); food icons (S-05);
editing a committed entry (S-07); past-day browsing (S-11); photo capture (S-03/S-04);
multi-item decomposition (FR-083, gated on OQ-6); saved meals (S-08); offline queueing; any
schema change; adding Jest.

## Architecture / Approach

```
Today  (src/app/(today)/index.tsx)
  ├─ MealComposer ──▶ estimateMeal({kind:'text'}) ──▶ Edge Function (F-02)
  │                     └─ ok ──▶ setQueryData(estimate(runId)) ─┐
  │                     └─ !ok ─▶ inline error, text preserved   │
  ├─ DayTotal                                     push /review?runId=…
  └─ MealEntryRow[] ◀── useDayEntries ── listMealEntriesForDay    │
                                    ▲                            ▼
                          invalidate │      Review (review.tsx): edit name+macros,
                                     └──────  show assumptions, createMealEntry
                                              with sectionForTime(now) + runId
```

The estimate travels through the **query cache** (`setQueryData` + a `runId` route param),
not route params — keeping a large object out of the URL and making review reachable only
with a real recorded run.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Today surface | Nav restructure + first query hooks; Today lists real entries with a total | No Stack exists yet — both platform-split tab files must change together or one platform breaks silently |
| 2. Capture & estimate | Composer, AI round-trip, error/retry, review screen displays the estimate | `estimateMeal` resolves `{ok:false}` rather than throwing — treating that as success is the trap |
| 3. Commit & delete | Editable review, section inference, manual mode, write + soft delete | Empty macro fields must store `null`, not `0`; the manual path must still link its run |
| 4. Verification | `npm run smoke:log` end-to-end + docs + device run | Device availability — the run also closes F-02's open native-invocation gap |

**Prerequisites:** F-01 and F-02 (both archived); deployed Supabase project with the
`estimate` function and its secret; owner credentials in `.env.local`; a device or simulator
for Phase 4.
**Estimated effort:** ~3–4 sessions across 4 phases.

## Open Risks & Assumptions

- **Section boundaries are provisional** (OQ-10) — `<10:30` breakfast, `10:30–12:00` snack,
  `12:00–15:00` lunch, `15:00–18:00` bite, `≥18:00` supper, following the PRD's own example.
  Wrong guesses stay invisible until S-06 ships, and only affect entries logged before then.
- **OQ-11 defaults to assume-and-surface** — no ambiguity floor; vague input gets a typical
  portion with the assumption displayed, and the review step is the safety net.
- **Native invocation of the estimate function has never been run** (F-02's carried gap).
  The platform split affects only the storage adapter, not the invoke path, so risk is low —
  but Phase 4's device run is the first real proof.
- **No component-level tests.** UI regressions are caught only by manual verification; the
  smoke script covers the data path, not the rendering.
- A single-item tab bar will look unfinished until S-02 adds the second tab.

## Success Criteria (Summary)

- The owner types a meal, reviews the estimate, and commits it — appearing in today's list
  with the total updated, with no manual refresh and no typed numbers in the common case.
- Unrecognized input never produces a fabricated value; it offers manual entry instead, and
  nothing commits without confirmation.
- `npm run smoke:log` proves the full estimate → commit → read-back → delete loop against the
  deployed backend and exits 0.
