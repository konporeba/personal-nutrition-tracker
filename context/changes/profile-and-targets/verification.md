# Verification — Profile & Derived Targets (S-02)

The owner's stats become daily calorie and macro targets the app derives rather
than asks for (FR-020/021), every target is overridable without the override ever
being clobbered by re-derivation (FR-022, the roadmap's named risk), body weight
is its own logged series (FR-023), and Today shows consumed-vs-target with a
progress bar for calories and each macro (FR-030). Two layers of proof — an
automated smoke that drives the real seams against the deployed backend, and the
manual checks from Phases 1–4.

## Automated — profile smoke

**Command:** `npm run smoke:profile`
(bundles `scripts/profile-smoke.ts` via `scripts/run-profile-smoke.mjs` and runs
it under Node with `--env-file=.env --env-file-if-exists=.env.local`.)

The runner reuses the esbuild `nodeShim` from `scripts/run-estimate-smoke.mjs`
verbatim — remapping `@/lib/supabase` and `@/lib/new-id` to their web variants and
no-oping the RN URL polyfill — so `src/data/*` loads under plain Node.

The script signs in as the owner and asserts, against the **deployed** backend:

1. `deriveTargets` matches three hand-computed cases across all goals — the worked
   example (male/180/80kg/30/maintain → 2136/144/244/65), female/165/60kg/40/lose,
   and male/175/90kg/25/gain — checked first, before touching the network
2. `upsertProfile` → `getProfile` round-trips the stats, and `effectiveTargets`
   from the read-back row equals the derived numbers (no overrides)
3. a calorie override persists; `effectiveTargets` returns the override for
   calories while the three macros stay equal to derived; `overriddenTargetFields`
   reports exactly `{calories}`
4. **the named risk** — a stat-only save (age → 40, *omitting* the override
   columns) leaves the override intact while the other three re-derive to the new
   age; derived values are never written, so re-derivation cannot clobber
5. reset to derived (a save with the override nulled) returns the computed 2076
6. the latest live `body_weights` reading drives derivation (85kg), and a
   soft-deleted reading drops from the list while `latestBodyWeight` falls back to
   the prior 80kg reading
7. an anonymous client sees zero rows from `profile` and `body_weights` (RLS)
8. cleanup — hard-deletes every test weight and restores the owner's real profile
   (or clears the test row if none existed before)

Exits non-zero on any failed assertion.

### Recorded run — 2026-07-25

```
✓ deriveTargets: 3 hand-computed cases, all correct
✓ signed in as owner c46272e0-d17d-436e-9f74-28207dc993fc
✓ upsertProfile -> getProfile round-trips stats; effective == derived
✓ override persists; effective calories == 2000, macros == derived
✓ override intact after a stat-only save; the other three re-derived
✓ reset to derived: effective calories back to the computed 2076
✓ latest weight (85kg) drives derivation
✓ soft-deleted reading drops from the list; latest falls back to 80kg
✓ RLS: anonymous client sees 0 rows from profile and body_weights

PROFILE SMOKE PASSED ✅
(cleanup) removed 2 test weight(s); cleared the test profile (none existed before)
```

Exit code 0. Proves the derivation, the override contract, the weight-series
sourcing with soft-delete fallback, and RLS end to end.

## Automated — static and prior smokes

| Check | Command | Result |
|---|---|---|
| Type checking | `npx tsc --noEmit` | clean (every phase) |
| Linting | `npm run lint` | clean (every phase) |
| Web bundle | `npx expo export --platform web` | bundles; routes incl. `/(today)`, `/(profile)`, `/(profile)/weight` |
| F-01 store smoke | `npm run smoke` | PASSED, exit 0 |
| F-02 estimate smoke | `npm run smoke:estimate` | PASSED, exit 0 |
| S-01 log smoke | `npm run smoke:log` | PASSED, exit 0 |

**Both estimate/log smokes were briefly red on an environmental AI-proxy outage,
now resolved.** During verification they returned `real-meal estimate failed:
server`. Root cause: the deployed `estimate` Edge Function's `ANTHROPIC_API_KEY`
function secret was stale (last set 2026-07-22) — the same key tested `200`
directly against the Anthropic API, and the Supabase-stored digest did not match
it. Re-setting the secret (`supabase secrets set ANTHROPIC_API_KEY=…` on project
`hkelauazmbqnyohjbjtw`) fixed both smokes on the next cold start. This was never a
code issue: S-02 touches neither `src/data/estimation.ts`, the Edge Function, nor
the estimate/log path, and the data-backbone smoke stayed green throughout.

## Manual — data layer (Phase 1)

| # | Check | Result |
|---|-------|--------|
| 1.4 | The two tables exist with RLS enabled and the sync-field triggers active | pass |
| 1.5 | An anonymous client sees zero rows from each (RLS holds) | pass |

## Manual — derivation core (Phase 2)

| # | Check | Result |
|---|-------|--------|
| 2.4 | Spot-check one worked example by hand → the function agrees | pass |

## Manual — profile & weight UI (Phase 3)

| # | Check | Result |
|---|-------|--------|
| 3.4 | Entering stats + a weight shows four derived targets | pass |
| 3.5 | Overriding one target persists it; editing an unrelated stat re-derives the other three but leaves the override intact | pass |
| 3.6 | "Reset to derived" clears an override back to the computed number | pass |
| 3.7 | Logging a weight updates current weight and re-derives; the reading appears in history | pass |
| 3.8 | Long-press deletes a weight reading; it stays gone after reload | pass |
| 3.9 | Profile and Today both reachable via tabs on native and web; light and dark legible | pass |

## Manual — Today integration (Phase 4)

| # | Check | Result |
|---|-------|--------|
| 4.4 | Today shows calories and all three macros as consumed vs target with progress bars | pass |
| 4.5 | Committing a meal advances the bars without a manual refresh | pass |
| 4.6 | An overridden target is the denominator the bar fills against | pass |
| 4.7 | With no profile weight yet, Today degrades to the bare total with a setup hint | pass |
| 4.8 | Light and dark both legible | pass |

## Deviations from the plan

- **The override-survival smoke drives a stat-only save, not a partial `{ age }`
  patch.** `upsertProfile` builds an `INSERT … ON CONFLICT DO UPDATE` tuple, so
  Postgres checks the NOT NULL stat columns before the conflict resolves — a
  partial patch that omits them errors. The smoke therefore resends the five stats
  while *omitting* the override columns, which is a faithful model of a "save your
  stats" action: only the columns present are written, so the override column is
  left untouched and survives. The structural claim (derived values are never
  written) is unchanged and is exactly what the test proves.

## Known gaps

- **Metric only** (kg, cm). Imperial units are out of scope for the single known
  owner.
- **Today shows the *resting* target only.** The dynamic training budget (S-09 /
  FR-073/075) is not built; the "consumed vs target" wording and the
  `effectiveTargets` seam leave room for S-09 to add today's logged burns without
  any caller changing.
- **Weight is logged and listed, not charted** against the goal — trends/analytics
  are S-11 / FR-033.
- **No component-level tests.** There is still no test runner (this slice
  deliberately did not add Jest); UI regressions are caught only by the manual
  checks above, and the smoke covers the data + derivation path, not rendering.
- **`.expo/types/router.d.ts` only regenerates under `expo start`**, not
  `expo export`. A stale copy makes `tsc` reject a newly added route's pathname;
  run the dev server once after adding routes.
