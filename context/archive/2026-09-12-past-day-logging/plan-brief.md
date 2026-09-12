# Past-Day Logging — Plan Brief

> Full plan: `context/changes/past-day-logging/plan.md`

## What & Why

The app can only log into today. If you miss midnight by a few minutes, the meal lands on the wrong day and there is no way to correct it — and a day you forgot to fill in stays empty forever. This change lets meals and training sessions be composed into a past day, and lets an already-logged record be moved from one day to another.

## Starting Point

Nothing in the data layer blocks this: both patch types already carry `logged_at`, `ensureDailyTarget` already keys off the entry's own day, and `LogToDaySheet` already picks a day for saved meals. The block is UI-level — three affordance gates on Today's past day, a missing `onAddToSection` on the Analytics day screen, and three hardcoded `new Date()` commit sites. It was a deliberate scope cut in the S-11 analytics slice, which FR-031 ("browse and edit any past day, including its meals and its sessions") argues against.

## Desired End State

Selecting a past day on Today's week rail — or opening one from the Analytics chart — and tapping ＋ composes a new meal into *that* day, through all four capture paths (describe, plate photo, label scan, saved meal). Training sessions can be logged for a past day from their sheet. Any logged meal or session can be moved between days from its detail sheet. Every surface about to write into a day other than today names that day in words first, and nothing can be written into the future.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Feature shape | One `day` parameter defaulting to now | A separate "backdate mode" would be a second code path beside the normal one that could silently rot. |
| Backdated timestamp | Section midpoint via a `timeForSection()` inverse | Keeps ledger ordering sane and the displayed time plausible; carrying the current clock would put a supper at 00:05 and infer "breakfast". |
| Editing scope | Day stepper only, no time field | Solves the stated pain with the smallest surface and keeps two already-dense sheets from growing another control. |
| Surfaces | Today's rail, Analytics day screen, Training sheet | The two past-day surfaces plus the only place training can be logged; a training deep-link from a day view was excluded to avoid re-crowding it. |
| `daily_targets` on a backdated day | Accept today's targets, document, verify | Identical to what `useAnalyticsRange`'s lazy backfill already does, so one rule answers "what was my target that day". |
| Sequencing | Repair before compose | Moving a record between days is cheap and fixes the midnight case on its own, so relief ships before the larger threading work. |
| `LogToDaySheet` | Keep it, share the extracted stepper | Four callers need that stepper anyway, and FR-011's two-interaction saved-meal path stays intact. |

## Scope

**In scope:** day parameter threaded through the add-meal popup, capture flow, review and library routes; day steppers on the meal-entry and training sheets; un-gating Today's past day and the Analytics day screen; a cache-invalidation fix for cross-day moves; day-naming on every write surface; a new slice smoke script.

**Out of scope:** editable time-of-day fields; future-day logging; a training deep-link from a day surface; a lower bound on how far back you can go; reconstructing `daily_targets` history; retiring `LogToDaySheet`; any schema or migration work.

## Architecture / Approach

A pure `lib/` seam answers "what timestamp does a record aimed at this day get" (`local-day.ts`, `time-for-section.ts`, `logged-at-for-day.ts`), and one extracted `ui/day-stepper.tsx` is the control. The day then travels as a `YYYY-MM-DD` local key on the exact same route-param rails `section` already rides — `AddMealProvider.open(section?, day?)` → `AddMealSheet` → `/review` (text), `useCaptureFlow` → `/review` (photo), or `/(today)/library` (saved meal) — with `review.tsx` remaining the single place a meal entry is written. `parseLocalDayKey` is the one choke point that rejects malformed keys and clamps the future.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. The day seam | Pure helpers + shared `DayStepper`; no visible change | `localDayKey` move must not break its three existing importers |
| 2. Move what's logged | Day stepper on both detail sheets — the midnight fix | Cross-day moves need two-key invalidation or the entry shows on both days |
| 3. Compose meals into a past day | Day threaded through all four capture paths; gates removed | Four hand-offs; a dropped `day` silently logs to today |
| 4. Training into a past day | Day stepper on the training create branch | The sheet's stable `'new'` key makes a picked day linger between opens |
| 5. Say which day, loudly | Day named in every subtitle and on the review screen | Longer strings overflowing the popup at ~400px |

**Prerequisites:** none — no schema work, no new dependencies, and every seam this builds on already ships.
**Estimated effort:** ~3–4 sessions across 5 phases. Phases 1+2 are one sitting and shippable alone; Phase 3 is the bulk of the work.

## Open Risks & Assumptions

- **Silent backdating is the main UX risk.** Phase 5 is the mitigation, and it lands *last* — Phases 3 and 4 briefly ship with weaker day signals. Pull Phase 5 forward if that feels wrong in use.
- **The section-midpoint timestamp is a fiction.** Harmless today, since nothing but ordering, section inference and display reads a meal's time — but it forecloses any later analysis of real eating times.
- **No test runner.** Verification rests on `tsc`, lint, and smoke scripts against the live owner store; the UI-level criteria are all manual.
- **A day backdated into after a goal change** gets judged against the new target, which can reshape an old adherence ring. Accepted, consistent with the existing lazy backfill.
- **Platform split.** `app-tabs`, the capture flow and `new-id` are all `.web`-split; every phase needs checking on both web and native.

## Success Criteria (Summary)

- A meal logged just after midnight can be moved to the previous day, and both days update without a refresh.
- A past day selected on the week rail or opened from Analytics accepts new meals through all four capture paths, and new training sessions, each landing in the right day and section.
- Nothing changes on the common path: logging to today looks, reads and behaves exactly as it does now, and no path can write into the future.
