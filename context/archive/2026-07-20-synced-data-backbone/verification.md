# Verification — Synced Data Backbone (F-01, US-07)

Two layers of proof: an automated smoke script (schema + RLS + last-write-wins),
and a manual two-client walkthrough (real cross-client parity that automation
can't cover).

## Automated — smoke script

**Command:** `npm run smoke`
(bundles `scripts/smoke-store.ts` via `scripts/run-smoke.mjs` and runs it under
Node with `--env-file=.env --env-file-if-exists=.env.local`.)

The script signs in as the owner and drives the real repo against the real
Supabase project:

1. create a `meal_entries` row
2. list it for its day (`listMealEntriesForDay`) — asserts it appears
3. RLS proof — an anonymous client selects and sees **0 rows**
4. update a macro — asserts `updated_at` advanced (last-write-wins ordering)
5. soft-delete — asserts it drops from the list but the row persists with
   `deleted_at` set
6. cleanup — hard-deletes the test row

Exits non-zero on any failed assertion.

### Recorded run — 2026-07-21

```
✓ signed in as owner c46272e0-d17d-436e-9f74-28207dc993fc
✓ created meal_entry 913e246e-784e-4805-9a7f-af3ae07eb0fc
✓ listed day (1 row(s)); created row present
✓ RLS: anonymous client sees 0 rows
✓ updated; updated_at advanced 2026-07-21T17:43:49.034846+00:00 -> 2026-07-21T17:43:49.374084+00:00
✓ soft-delete: dropped from list; row retained with deleted_at
SMOKE PASSED ✅
```

Exit code 0. Proves: schema round-trips, RLS scopes the store to the owner,
`updated_at` is server-authoritative, soft-delete keeps the row while removing it
from reads.

## Automated — two-session parity check (US-07 core)

**Command:** `npm run parity` (`scripts/parity-check.mjs`, pure supabase-js, runs
directly under Node).

Spins up **two independent authenticated owner sessions** (separate token storage
= two clients sharing one backend) and proves the store is a single synced
backbone: a write via client A is visible to client B, a write via B is visible to
A, and a soft-delete on one propagates to the other. This is the executable core
of US-07. It does **not** exercise the RN app's fetch-on-focus UI or a physical
device — F-01 ships no feature UI, so that remains a real-device pass for a later
slice with a logging/day screen.

### Recorded run — 2026-07-21

```
✓ two independent sessions signed in as owner c46272e0-d17d-436e-9f74-28207dc993fc
✓ client A created 5eff803c-5df2-4219-bbc0-a67547ea3678
✓ client B sees A's write (parity A→B); fetch latency ~309ms
✓ client A sees B's edit (parity B→A); fetch latency ~134ms
✓ client B no longer sees the row after A's soft-delete (delete propagates)
PARITY PASSED ✅
```

Exit code 0. Proves cross-client parity both directions with ~0.1–0.3 s fetch
latency (far inside the up-to-1h eventual-sync tolerance).

## Manual — two-client parity walkthrough (US-07)

**Precondition:** owner is signed in on both the web build and a native build
(same owner identity, uid `c46272e0…`). Owner provisioning + the required
"disable public signups" step are documented in
[`supabase/OWNER_SETUP.md`](../../../supabase/OWNER_SETUP.md).

| # | Step | Expected |
|---|------|----------|
| 1 | Start the web build (`npm run web`) and a native build (`npm run ios` / `android`), sign in as the owner on each. | Both reach the tabbed app (no re-sign-in on relaunch). |
| 2 | On **web**, create a meal entry (via a dev harness / repo call). | Row persists. |
| 3 | Foreground/refocus the **native** app. | The web-created entry appears (fetch-on-focus). |
| 4 | On **native**, edit the entry (change a macro). | Edit persists. |
| 5 | Refocus the **web** app. | The native edit appears. |

Record: pass/fail per step, and the observed refresh latency (expected on focus,
not instant — within the eventual-sync tolerance, no manual reconciliation).

### Cache persistence (Phase 3 §5 / 3.5)

With the last-seen day loaded, cold-restart a client while the backend is briefly
unreachable. Expected: the last-seen day still renders from the persisted query
cache (read resilience).

### Recorded run — 2026-07-21

Physical web+native device walkthrough is **not** yet performed — F-01 ships no
feature UI to create/view an entry, and there is no native simulator available to
this environment. US-07's data-layer claim is proven by the automated two-session
parity check above (both directions, ~0.1–0.3 s latency). Public signups have been
disabled on the project (F1 assumption satisfied).

- Client A → Client B parity: **PASS** (automated, `npm run parity`)
- Client B → Client A parity: **PASS** (automated, `npm run parity`)
- Observed latency: **~134–309 ms** (well within tolerance)
- Cross-session soft-delete propagation: **PASS**
- Physical web+native focus-refetch UI: **DEFERRED** — needs a logging/day screen (later slice) + a device.
- Cache-persistence cold restart (3.5): **DEFERRED** — needs feature UI to render a cached day; persistence is wired (`PersistQueryClientProvider` + AsyncStorage persister) but not observable in F-01.
