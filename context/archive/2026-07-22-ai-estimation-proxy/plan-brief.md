# Server-side AI Estimation Proxy (F-02) — Plan Brief

> Full plan: `context/changes/ai-estimation-proxy/plan.md`

## What & Why

Build a thin **Supabase Edge Function** that is the single server-side entry point for AI
meal estimation: it holds the AI provider key off-device, turns a text meal description
into a structured calorie/macro estimate via Claude Opus 4.8, records an immutable
`EstimationRun`, and returns a review-ready result. It exists because the product's core
bet — low-friction, consistent AI estimation — cannot be proven until the estimate-and-log
loop has a real, key-safe estimator behind it. F-02 is the **last prerequisite for the
S-01 north star**.

## Starting Point

F-01 (archived) already stands up the synced Supabase store — including the
`estimation_runs` table (with RLS + sync fields) and a `createEstimationRun` repo seam
written expressly "so F-02 can write into it without a schema change." The platform-split
Supabase client persists an owner JWT. There is **no `supabase/functions/` directory yet**
and **no AI provider wired anywhere** — this slice adds the first Edge Function and the
first model integration. No migration is needed.

## Desired End State

A deployed `estimate` function that rejects unauthenticated calls, accepts a text input,
and returns `{ runId, estimate }` where the estimate carries macros, a food category,
surfaced portion assumptions, and an explicit `recognized`/`confidence` signal — recording
an `EstimationRun` every time. On unrecognizable input it returns `recognized: false` with
**no fabricated numbers**, so the S-01 UI can offer manual entry. The AI key never reaches
any client or bundle. Proven end-to-end by `npm run smoke:estimate`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Serverless mechanism | Supabase Edge Function (Deno) | Same project as F-01, secrets off-device, owner JWT auto-forwarded, matches tech-stack.md's stated pairing | Plan |
| AI model | Claude Opus 4.8 | Best estimate quality; one small call per entry keeps absolute cost low; review step catches errors | Plan |
| EstimationRun locus | Recorded inside the function (server-side, RLS) | Every AI call is recorded atomically — an estimate is never lost to a client crash | Plan |
| Structured output | `output_config.format` JSON schema | Guaranteed-parseable macros; no brittle prompt-parsing; upholds FR-008 "never fabricate" | Plan |
| Failure signal | Explicit `recognized` + `confidence` in the response | One uniform contract; review step owns the manual-entry UX; assumptions always surfaced (FR-082) | Plan |
| Request contract | Discriminated union input (`text` now, `image` reserved) | S-03/S-04 add a variant with no breaking change — de-risks the roadmap's stated F-02 risk | Plan |
| Multi-item (FR-083) | Out — aggregate estimate only | Nice-to-have, gated by the still-open OQ-6; avoids committing to a component model prematurely | Plan |

## Scope

**In scope:** the `estimate` Edge Function (text → structured estimate via Opus 4.8);
owner-JWT auth; server-side `EstimationRun` recording; the AI secret; a typed client
invocation seam + shared contract types; an esbuild-bundled smoke script + docs.

**Out of scope:** feature UI (S-01); image/photo estimation (S-03/S-04); multi-item
decomposition (FR-083 / OQ-6); ambiguity-floor policy (OQ-11); retry/queue/offline;
`meal_entries` writes; any schema change.

## Architecture / Approach

```
client (native/web)                Supabase Edge Function `estimate` (Deno)
  estimateMeal(input)  ──invoke──▶  verify owner JWT
   [src/data/estimation.ts]          ├─ estimateFromText() → Claude Opus 4.8
                                     │    (output_config.format = estimate JSON schema)
                                     ├─ record EstimationRun (RLS, source='free_text')
   { runId, estimate }  ◀───────────┴─ return { runId, estimate }
                                          ANTHROPIC_API_KEY: Supabase secret (off-device)
```

The client never touches `functions.invoke` directly (it goes through the
`src/data/estimation.ts` seam, mirroring the repo pattern) and never sees the key.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Edge function + AI core | Deno function: text → validated structured estimate via Opus 4.8, behind the secret | First Edge Function in the repo; Deno (not Node) runtime for the AI call |
| 2. Auth + run recording | Owner-JWT enforcement + server-side `EstimationRun` insert under RLS | Correct JWT forwarding so inserts run as the owner, not service-role |
| 3. Client seam + types | Typed `estimateMeal` wrapper + shared contract; error mapping | Keeping the Deno and `src/` contract copies in sync (smoke test guards this) |
| 4. Verification + docs | `npm run smoke:estimate` end-to-end + secret/setup docs | Reusing the esbuild shim so the platform-split client loads under Node |

**Prerequisites:** F-01 (done/archived); an Anthropic API key to set as the function
secret; the deployed Supabase project.
**Estimated effort:** ~2–3 sessions across 4 phases.

## Open Risks & Assumptions

- The `recognized`/`confidence` signal relies on the model's self-assessment — mitigated
  because every estimate routes through the S-01 review step before commit.
- The request/response contract is intentionally frozen now to serve S-01/S-03/S-04; the
  discriminated-union input is the hedge against a later breaking change.
- Deno/Node duplication of the contract types is hand-kept; the Phase-4 smoke test is what
  proves the two agree on the wire.

## Success Criteria (Summary)

- A text meal description returns a review-ready estimate (macros + surfaced assumptions +
  category) with a recorded `EstimationRun`; unrecognizable input returns `recognized:
  false` with no fabricated numbers.
- The AI key is present only as a Supabase function secret — absent from every committed
  file and the exported bundle.
- `npm run smoke:estimate` proves the full path end-to-end and exits 0, unblocking S-01.
