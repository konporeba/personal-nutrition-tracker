# Verification — Server-side AI Estimation Proxy (F-02)

Three layers of proof: an automated smoke script against the deployed function,
the manual auth/RLS checks from Phase 2, and the bundle-secret scan that backs
the "key never reaches the client" claim.

## Secret handling

`ANTHROPIC_API_KEY` is a **Supabase Edge Function secret**, never a build-time
env var:

```
npx supabase secrets set ANTHROPIC_API_KEY=<key>
```

It is absent from `.env`, `.env.local`, the repo tree, and the exported client
bundle. `.env.example` documents this so it is not re-added as an env var by
mistake. The client reaches the model only through the `estimate` function.

**Deploy:** `npx supabase functions deploy estimate`
(`supabase/functions/estimate/`, type-checked with `npx deno@2 check index.ts`).

## Automated — estimate smoke

**Command:** `npm run smoke:estimate`
(bundles `scripts/estimate-smoke.ts` via `scripts/run-estimate-smoke.mjs` and
runs it under Node with `--env-file=.env --env-file-if-exists=.env.local`.)

The script signs in as the owner and drives the real client seam `estimateMeal`
against the **deployed** function:

1. a real meal text → asserts `ok: true`, `recognized: true`, positive calories,
   non-null macros, ≥1 assumption (FR-082), a non-empty `runId`
2. the recorded `estimation_runs` row exists, is owner-scoped, carries
   `source = free_text` and a non-null `raw_result` (audit trail)
3. RLS proof — an anonymous client sees **0** `estimation_runs`
4. gibberish → asserts `ok: true` with `recognized: false` and **null** macros —
   a successful call that fabricates nothing (FR-008), the cue to offer manual
   entry rather than an error
5. the reserved image variant (S-03/S-04) → `{ ok: false, error: 'server' }`,
   surfaced rather than thrown
6. cleanup — hard-deletes the runs it created

Exits non-zero on any failed assertion. It doubles as the contract check that
keeps the two copies of the wire shape in sync (the Deno one in
`supabase/functions/estimate/types.ts`, the client one in
`src/data/estimation-types.ts`).

### Recorded run — 2026-07-24

```
✓ signed in as owner c46272e0-d17d-436e-9f74-28207dc993fc
✓ estimated "Scrambled eggs with buttered toast": 330 kcal (16p/16c/23f), 3 assumption(s), confidence=high
✓ EstimationRun a7bd10d1-652b-4a99-844a-d58e54c44024 recorded, owner-scoped, source=free_text
✓ RLS: anonymous client sees 0 estimation_runs
✓ unrecognized input: recognized=false, null macros, run 2996a130-0210-4d12-bc02-40b0a77d5f3d still recorded
✓ reserved image variant rejected as { ok: false, error: "server" }

ESTIMATE SMOKE PASSED ✅
(cleanup) hard-deleted 2 smoke run(s)
```

Exit code 0. Proves: the key stays server-side, one AI call yields a reviewable
structured estimate, every call is recorded as an EstimationRun under RLS, and
the never-fabricate invariant holds on unrecognized input.

## Manual — auth and RLS (Phase 2)

| # | Check | Result |
|---|-------|--------|
| 1 | Unauthenticated invocation | **401** — no-auth rejected by platform `verify_jwt`; anon-key-only rejected by the function's own `getUser()` gate |
| 2 | Authenticated text invocation | exactly one owner-scoped `estimation_runs` row, `runId` returned |
| 3 | Non-owner read of the owner's run | **0 rows** (RLS holds) |
| 4 | `recognized: false` path | run still recorded; the AI call is never lost |

## Manual — client bundle secret scan (Phase 3)

After `npx expo export --platform web`, all 36 exported files (≈4.0 MB) were
scanned:

- `sk-ant` — **absent**
- `ANTHROPIC_API_KEY` — **absent**
- `anthropic` (any case) — **absent**
- `OWNER_EMAIL` / `OWNER_PASSWORD` values from `.env.local` — **absent**
  (only `EXPO_PUBLIC_*` is inlined, even though `expo export` loads that file)

## Manual — transport error mapping (Phase 3)

With the client pointed at an unroutable host, `estimateMeal` returned
`{"ok":false,"error":"network"}` — no throw, no unhandled rejection.

## Known gaps

- ~~**Native-context invocation is unverified.**~~ **Closed 2026-07-24 by S-01
  (`free-text-meal-logging`).** That slice's Phase 4 device/simulator run
  (`npx expo start` → `i`/`a`) drove the full capture loop through `estimateMeal`
  from a native context — the first real native invocation of the deployed
  function — and the owner confirmed it working. Plan step 3.4 is closed. See
  `context/changes/free-text-meal-logging/verification.md`.
- **`quota` is currently unreachable.** A provider-side 429 is swallowed by the
  function's own `502 estimation_failed`, so it classifies as `server`. The
  `quota` branch fires only on a platform 429 in front of the function.
  Surfacing real provider rate limits would need the function to pass the
  upstream status through — a small follow-up, not a blocker for S-01.
