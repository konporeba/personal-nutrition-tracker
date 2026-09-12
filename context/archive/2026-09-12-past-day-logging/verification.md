# Verification — Past-Day Logging (FR-011, FR-031)

Two layers of proof: an automated slice smoke script (the pure day seam plus the
compose/move paths against the real store), and a manual walkthrough of the four
capture paths and the two day surfaces, which automation can't reach.

## Automated — slice smoke script

**Command:** `npm run smoke:past-day`
(bundles `scripts/past-day-smoke.ts` via `scripts/run-past-day-smoke.mjs` and
runs it under Node with `--env-file=.env --env-file-if-exists=.env.local`.)

Two halves. The first needs no network and pins `TZ=Europe/Warsaw` for the
length of its assertions:

1. every section's representative time re-infers as that same section through
   `sectionForTime` — the round-trip invariant a backdated meal depends on
2. `parseLocalDayKey` rejects `undefined`, malformed keys and impossible dates
   (`2026-02-31`), clamps a future key to today, and parses to **local**
   midnight — the UTC-parse trap
3. `loggedAtForDay` keeps today's instant exact and gives a past day its
   section's time
4. `moveToDay` preserves hours/minutes/seconds/milliseconds; `addLocalDays`
   beats epoch arithmetic across the 2026-10-25 fall-back boundary, where a
   naive `+86400000` lands at 23:00 on the *same* day

The second half signs in as the owner and drives the real repo:

5. a meal composed into a past day appears in that day's read, at its section's
   time, and is **absent** from today's
6. an entry moved across days keeps its time of day, leaves the day it came
   from, and arrives in the target — the stale-day read the two-key
   invalidation exists to prevent
7. a training session composes into a past day and moves back out of it
8. soft delete drops a backdated record from its day read
9. cleanup — hard-deletes everything the script created

Exits non-zero on any failed assertion.

### Recorded run — 2026-09-12

```
✓ timeForSection round-trips through sectionForTime for all 5 sections
✓ parseLocalDayKey rejects malformed/impossible keys, clamps the future, parses locally
✓ loggedAtForDay keeps today exact and gives a past day its section time
✓ moveToDay preserves h/m/s/ms; addLocalDays beats a naive shift across a DST boundary
✓ signed in as owner c46272e0-d17d-436e-9f74-28207dc993fc
✓ a meal composed into a past day lands there, at its section's time, and not in today
✓ an entry moved across days keeps its time, leaves the source day, and arrives in the target
✓ a training session composes into a past day and moves back out of it
✓ soft delete drops a backdated record from its day read

PAST-DAY SMOKE PASSED ✅
(cleanup) hard-deleted 2 entry(ies), 1 session(s)
```

Exit code 0.

## Automated — no regressions elsewhere

Every existing check, re-run after the implementation review's fixes:

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | pass |
| `npm run lint` | pass |
| `npm run smoke` | pass |
| `npm run smoke:day-view` | pass |
| `npm run smoke:meal-detail` | pass |
| `npm run smoke:training` | pass |
| `npm run smoke:log` | pass |
| `npm run smoke:saved-meals` | pass |
| `npm run smoke:analytics` | pass |

## Manual — the walkthrough

Confirmed by the owner across the phase gates (Progress rows 1.3–1.4, 2.4–2.9,
3.4–3.11, 4.4–4.8, 5.5–5.9). Steps, per the plan's Testing Strategy:

1. Just after midnight, log a meal; move it back to the previous day from its
   entry sheet — both days repaint without a refresh.
2. From Today's rail, select a day 3–4 back and log a meal through each of the
   four paths: describe, plate photo, label scan, saved meal.
3. Each lands in the correct day **and** section, with a section-appropriate
   time.
4. Tap the Net-vs-Budget chart in Analytics, open that day, log a meal into it
   from there.
5. Log a training session for a past day; the burn moves that day's budget and
   not today's.
6. The week rail's rings and the Analytics charts repaint after each backdated
   write.
7. The streak pill responds correctly to a backdated log that fills a gap.
8. Future days are unreachable: the stepper's next control disables on today,
   and a hand-edited `?day=` falls back to today.
9. The app-level ＋ (web bottom bar, native FAB) still logs to today.
10. Core path checked on web and native — `app-tabs` and the capture flow are
    platform-split.
11. Phone width (~400px) checked for the longer subtitles and the day pill.

### Design iterations during the manual pass

The day control was reworked three times against real use, which the Progress
rows don't capture:

1. A labelled full-width `DayStepper` row inside the form — rejected, ~80pt of
   vertical space in an already-dense sheet.
2. A collapsed chip that revealed a compact stepper in the body — rejected, it
   still added a row and shifted the layout on open.
3. **Shipped:** `DayPill` — the date itself, growing arrows inside the same pill
   when tapped. Then two follow-ups: always show a date rather than "Today"
   (the word made the pill shrink on its most common value), and a row wrapper
   so the pill hugs its content instead of stretching to fill the sheet
   header's column.

See the plan's Addendum for the contracts this supersedes.

## Review

`reviews/impl-review.md` — 1 critical, 6 warnings, 3 observations, all fixed.
The critical one (`analytics/day.tsx` parsing its route param with raw
`new Date()` while being a write surface) was a real defect that the manual pass
did not surface, because it only bites on a malformed param, across a DST
boundary, or on a hand-edited future day.
