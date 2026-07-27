---
change_id: structured-day-view
title: Structured day view
status: implemented
created: 2026-07-27
updated: 2026-07-27
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

Roadmap slice S-06. Planned directly from the PRD + roadmap (no separate frame/research doc) — `/10x-plan` did its own codebase research inline since `section` (FR-056/058) and `updateMealEntry` (FR-064's write path) already existed from S-01, leaving this slice as pure view-layer work.

Key decisions from planning questions (see plan-brief.md "Key Decisions Made" for the full table): all 5 sections always render even when empty; subtotals show calories + macro chips; re-sectioning is a tap-to-open "Move to…" sheet (long-press stays bound to delete); headers scroll inline (not sticky); no current-time-of-day highlight; entries stay chronological within a section; the section picker is move-after only (review.tsx is untouched, deferring commit-time correction).
