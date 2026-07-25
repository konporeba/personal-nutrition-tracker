<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Profile & Derived Targets (S-02)

- **Plan**: context/changes/profile-and-targets/plan.md
- **Scope**: All 5 phases (full plan)
- **Date**: 2026-07-25
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — `upsertProfile` partial patches throw on the NOT NULL stats

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency / Reliability
- **Location**: src/data/profile.repo.ts:39-48
- **Detail**: `ProfilePatch = Partial<…>` and the repo comment ("Only the fields present in `patch` are written") imply a partial update is safe, but `.upsert({ owner_id, ...patch }, { onConflict: 'owner_id' })` builds an INSERT tuple first, so Postgres checks the NOT NULL stat columns (height_cm/age/sex/activity_level/goal) *before* the conflict resolves. Any patch omitting one of them throws at runtime even when the row already exists — the profile smoke hit exactly this and had to resend the full stats. The UI is safe today (`buildPatch()` always sends all five stats), so this is latent, not live: a future caller that saves only `{ calorie_target_override: null }` would fail.
- **Fix A ⭐ Recommended**: Tighten the contract — change the repo doc to state that every write must carry the five stats (overrides may be added/omitted freely), and consider narrowing the input type so a stats-less patch isn't type-legal.
  - Strength: Matches the single-owner reality and the form's actual behaviour; zero runtime cost; documents the trap the smoke already discovered.
  - Tradeoff: Relies on callers honouring the contract rather than the DB enforcing it.
  - Confidence: HIGH — the only caller today already sends full stats.
  - Blind spot: A future partial-override save still needs the stats fetched first.
- **Fix B**: Make `upsertProfile` read-modify-write — fetch the existing row, merge, then upsert — so partial patches are genuinely safe.
  - Strength: The `Partial` type becomes honest; override-only saves just work.
  - Tradeoff: Adds a round-trip and a race window not needed for one owner.
  - Confidence: MEDIUM — more moving parts for a case nothing exercises yet.
  - Blind spot: Interaction with last-write-wins `updated_at` on the merge path.
- **Decision**: FIXED via Fix A — `ProfilePatch` now requires the five stats (types.ts); repo doc corrected to state the NOT NULL constraint. tsc clean.

### F2 — No CHECK constraints on stat/weight positivity

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (data safety)
- **Location**: supabase/migrations/20260724120000_profile_and_weights.sql:43-69
- **Detail**: `height_cm`, `age`, `weight_kg` are `numeric/int not null` with no CHECK for `> 0`. The UI rejects non-positive values, but a non-UI client (or a future capture path) could persist a zero/negative weight, which would then drive derivation. Single-owner + UI-guarded, so low risk.
- **Fix**: Add `check (weight_kg > 0)`, `check (height_cm > 0)`, `check (age > 0)` in a follow-up migration if defence-in-depth is wanted.
- **Decision**: FIXED — new migration `20260725120000_profile_weight_positivity_checks.sql` adds the three CHECKs; applied to the deployed project (no existing rows violated).

### F3 — `latestBodyWeight` tie-break is nondeterministic

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (reliability)
- **Location**: src/data/body-weights.repo.ts:54-63
- **Detail**: `order('measured_at', desc).limit(1)` — two readings sharing an identical `measured_at` resolve in undefined order, so "current weight" could flip between them. Practically impossible for a human logging weights (minute-resolution UI), but the ordering isn't total.
- **Fix**: Add a secondary sort (`created_at` desc, or `id`) so the latest reading is deterministic.
- **Decision**: FIXED — added `.order('created_at', desc)` as a secondary sort to both `latestBodyWeight` and `listBodyWeights` (body-weights.repo.ts); doc note added.

### F4 — Profile native tab reuses the scaffold `explore.png` icon

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/app-tabs.tsx:29
- **Detail**: The Profile trigger's icon is `@/assets/images/tabIcons/explore.png` — a leftover starter-scaffold asset. The plan explicitly allowed reusing a bundled `tabIcons` asset, so this is intended, but a person/profile glyph would read better than the compass.
- **Fix**: Swap in a profile/person icon asset when one is added to `tabIcons/`.
- **Decision**: FIXED — generated a person-glyph template icon `tabIcons/profile.png` (+@2x/@3x, 24/48/72) and pointed the Profile trigger at it (app-tabs.tsx:29).
