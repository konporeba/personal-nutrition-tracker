---
change_id: ai-estimation-proxy
roadmap_id: F-02
title: Server-side AI estimation proxy (text-first)
status: implementing
created: 2026-07-22
updated: 2026-07-22

prd_refs: [FR-080, FR-081, FR-082, FR-084, FR-005, FR-006, FR-008, US-11, US-12, US-08]
---

# Server-side AI estimation proxy

Foundation slice F-02. Stands up a thin Supabase Edge Function that holds the AI
provider key off-device, accepts a text-first (image-extensible) estimation input,
calls Claude Opus 4.8 with structured outputs, records an `EstimationRun`, and
returns a parsed, review-ready estimate. The client never sees the key.

Last remaining prerequisite for the S-01 north star (free-text meal logging).

See `plan-brief.md` (start here) and `plan.md` (full plan).
