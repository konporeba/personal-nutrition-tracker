# Analytics and Trends (S-11) — Plan Brief

> Full plan: `context/changes/analytics-and-trends/plan.md`

## What & Why

Build the roadmap's last MVP slice: a third "Analytics" tab showing intake/expenditure/net trends with moving averages, a day-level adherence signal, and body weight plotted against a goal — the payoff for weeks of logging, and the slice PRD success criteria (US-06) and the roadmap explicitly sequence last, since it needs accumulated days to show anything meaningful.

## Starting Point

All the underlying domain math already exists and works for a single day: `effectiveTargets`/`useTargets` derives the resting target, `computeDayLedger` computes a day's consumed/burned/net, and `body_weights` holds the logged weight series. Nothing multi-day exists yet — every read is day-scoped or unbounded-all, there's no chart library, only two tabs exist, and Today's screen is hardcoded to the current day (by explicit design, deferring to this slice).

## Desired End State

The owner opens Analytics, sees four panels (Intake, Expenditure, Net-vs-Budget, Weight-vs-Goal) over a 7-day or 30-day rolling window, each day in the Net panel colored by whether it was on/over/under budget, and can tap any day to open and edit its full entry/session list — the same view Today already renders, just for a different date.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Historical target basis | New `daily_targets` table, immutable per-day snapshot, backfilled lazily | Profile has no version history, so this is the only way past days can be judged against something other than "today's target retroactively" |
| Chart library | Hand-rolled `react-native-svg` components | victory-native XL (the initial pick) has no official web support — a hard conflict with FR-041's desktop-browser requirement, caught during research |
| Range query shape | One ranged query per table + client-side day-grouping | A month view stays one round-trip per table instead of ~30 |
| Adherence tolerance | ±5% band around target → on/over/under | Literally matches FR-034's three-state wording; absorbs normal AI-estimate noise without hiding real overages |
| Selectable ranges | Rolling trailing windows (last 7 / last 30 days) | Always a full window, no partial-period edge case |
| Moving average window | Fixed 7-day trailing, both ranges | One consistent, well-understood smoothing window |
| Past-day browse/edit | Tap a chart day → reuse Today's UI, parameterized by date | Fully satisfies FR-031 by reusing already-built, already-tested day UI instead of a second parallel screen |
| Tab placement | New third top-level "Analytics" tab | A primary PRD use case (US-06) deserves top-level discoverability, not a screen buried in Profile |
| Source-mix flagging | Skipped | Mentioned only in PRD narrative, not in any FR — avoids scope creep on an already-large slice |
| Weight goal | New `target_weight_kg` field on profile; plain plot only | No numeric goal existed anywhere (only a directional lose/maintain/gain enum) — FR-033 needs a number to plot against |
| Adherence presentation | Color-coded directly in the Net-vs-Budget chart + a summary count | One visual surface serves both the trend and the adherence signal |

## Scope

**In scope:** intake/expenditure/net trend charts with 7-day moving averages, 7d/30d rolling-window toggle, day-level adherence classification and its in-chart presentation, weight-vs-goal plot, a new Analytics tab, browsing and editing any past day from a chart tap, the new `daily_targets` table and `target_weight_kg` profile field.

**Out of scope:** source-mix/confidence flagging, weight rate-of-change or goal-ETA projection, custom/arbitrary date ranges, adding new entries to a past day (only edit/re-section/delete of what's already logged), retroactively reconstructing pre-existing days' true historical targets, chart pan/zoom/tooltip interactions.

## Architecture / Approach

Bottom-up: a new `daily_targets` table + repo (Phase 1) → ranged repo queries and a day-grouping helper mirroring `group-by-section.ts`'s "always every bucket" pattern (Phase 2) → pure trend math reusing `computeDayLedger` (Phase 3) → `react-native-svg`-based chart primitives (Phase 4) → the Analytics screen, tab wiring, and profile field (Phase 5) → extracting a shared `DayView` component out of Today so past days reuse the exact same editable UI (Phase 6) → smoke-script verification (Phase 7).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data model | `daily_targets` table + `target_weight_kg` column + repos | Snapshot immutability semantics must be right from the start — it's the thing every trend panel judges past days against |
| 2. Range queries & grouping | Multi-day repo queries + day-grouping helper + `useAnalyticsRange` | Must re-derive "today" per render (existing lesson), not freeze it |
| 3. Trend math | `movingAverage`, `classifyDayAdherence` | Pure functions, low risk, fully smoke-testable |
| 4. Chart components | `react-native-svg`-based line/reference chart | Must actually render on web — the reason victory-native XL was ruled out |
| 5. Analytics screen & nav | New tab, route group, screen, profile field | Both `app-tabs.tsx`/`.web.tsx` must be updated together |
| 6. Past-day browse & edit | Shared `DayView`, new route, chart-tap wiring | Extracting from Today without changing Today's own behavior |
| 7. Verification | Smoke script + manual walkthrough | Needs several real days of data to look meaningful |

**Prerequisites:** S-02 (targets + weight series), S-06 (day structure), S-09 (expenditure/ledger) — all already shipped and archived.
**Estimated effort:** ~7 phases; largest single-slice scope in the roadmap so far (new table, new dependency, new tab, screen refactor).

## Open Risks & Assumptions

- Backfilled `daily_targets` snapshots for pre-existing days are only as accurate as "today's target applied retroactively" — there's no way to do better without profile version history, which is explicitly out of scope.
- `react-native-svg` on web (react-native-web) needs to be confirmed to render acceptably during Phase 4 — it's the standard, well-supported choice, but hasn't been exercised in this codebase yet.
- The ±5% adherence tolerance and the 7-day moving-average window are both defaults chosen for this plan; they may need tuning once the owner sees them against real data (no FR pins an exact number).

## Success Criteria (Summary)

- Analytics tab shows correct intake/expenditure/net/weight trends over both rolling windows, matching what Today and Profile already compute for any single day.
- Every day's adherence classification is visible at a glance, color- and shape-coded, with a running summary count.
- Any past day is reachable from the chart and fully editable, with changes reflected back in the chart on return.
