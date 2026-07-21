---
change_id: synced-data-backbone
roadmap_id: F-01
title: Synced single-owner data backbone (Supabase)
status: implementing
created: 2026-07-20
updated: 2026-07-21

prd_refs: [FR-043, FR-041, FR-007, FR-006, US-07]
---

# Synced data backbone

Foundation slice F-01. Stands up a private, single-owner Supabase store that both
the phone build and the desktop web build read and write, seeds the minimal core
entity model (`meal_entries` + `estimation_runs` + `section`), lays private
photo-storage groundwork (FR-007), and proves US-07 cross-client parity.

See `plan-brief.md` (start here) and `plan.md` (full plan).
