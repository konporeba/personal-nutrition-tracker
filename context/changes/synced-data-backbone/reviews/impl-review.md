<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Synced Data Backbone (F-01)

- **Plan**: context/changes/synced-data-backbone/plan.md
- **Scope**: Phases 1–4 of 4 (full plan; manual items 3.5/4.4/4.5 pending)
- **Date**: 2026-07-21
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS (with warnings) |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Automated success criteria re-verified this session: `tsc --noEmit` clean, `npm run lint` clean, `npm run smoke` exits 0 (create/list/RLS/update/soft-delete). Manual 3.5/4.4/4.5 honestly unchecked (two-client walkthrough pending).

## Findings

### F1 — Storage bucket policy not owner-scoped

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality / Plan Adherence
- **Location**: supabase/migrations/20260720120200_storage.sql:22-25
- **Detail**: The `meal_photos_owner_all` policy grants `for all to authenticated` gated only on `bucket_id = 'meal-photos'` — no `owner_id`/`auth.uid()` predicate. Plan §4 specified "restricting all operations for that bucket to `owner_id = auth.uid()`". The table RLS correctly keys on `auth.uid() = owner_id`; the storage policy does not follow that same principle. Safe **only** while exactly one identity can authenticate. Supabase enables email signups by default, so unless project-level signups are disabled, a second account could read/overwrite every evidence photo. Mitigations already in place: the bucket is private (anon rejected), no upload/download code ships this slice (S-03), and there are no photos yet.
- **Fix A ⭐ Recommended**: Disable email/public signups at the Supabase project level (Auth settings) and add a one-line note in `supabase/OWNER_SETUP.md` recording that "authenticated == owner" depends on it. Matches the app's single-owner/no-accounts design (PRD, CLAUDE.md); zero code churn; closes the unstated assumption.
  - Strength: Aligns with the product's actual identity model; no migration or path-convention change.
  - Tradeoff: Enforcement lives in project config, not the migration — someone re-reading the SQL won't see it.
  - Confidence: HIGH — single-owner is a hard product constraint.
  - Blind spot: I haven't queried the project's current signup setting; needs confirming in the dashboard.
- **Fix B**: Owner-scope the policy by path prefix — change the object convention to `meal-photos/<owner_id>/<meal_entry_id>.jpg` and gate with `(storage.foldername(name))[1] = (select auth.uid())::text`. Requires updating the S-03 path convention comment (line 8) too.
  - Strength: Enforces owner isolation in the DB layer itself; robust even if signups are later enabled.
  - Tradeoff: Changes the documented path convention before S-03 exists; slightly more complex policy.
  - Confidence: MED — folder-prefix pattern is standard Supabase, but S-03 hasn't been designed against it yet.
  - Blind spot: S-03's upload code must adopt the owner-prefixed path.
- **Decision**: FIXED via Fix A — documented the "authenticated == owner" assumption and the required "disable public signups" step in supabase/OWNER_SETUP.md (with the Fix-B owner-scoping path recorded for if signups are ever re-enabled). ACTION FOR OWNER: disable email signups in the Supabase dashboard.

### F2 — `esbuild` used by smoke runner but not a declared dependency

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability) / Success Criteria
- **Location**: scripts/run-smoke.mjs:9, package.json
- **Detail**: `run-smoke.mjs` imports `esbuild`, but `esbuild` is not in `package.json` — it only resolves transitively (v0.28.1, hoisted via `tsx`). On a pruned/clean/pnpm-style install `npm run smoke` (success criterion 4.1) would break with a module-not-found. Compounding: `tsx` (package.json:41) is now unused — the smoke path moved from tsx to the esbuild runner — yet dropping `tsx` would also remove the transitive `esbuild`.
- **Fix**: Add `esbuild` to `devDependencies` explicitly, and remove the now-unused `tsx`.
- **Decision**: FIXED — added `esbuild@^0.28.1` to devDependencies, removed `tsx`; re-ran `npm run smoke` → still exits 0.

### F3 — `getSession()` bootstrap has no error handling

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/lib/session.ts:24-28
- **Detail**: `supabase.auth.getSession().then(...)` has no `.catch`. If it rejects, `loading` stays `true` and the app is stuck on the splash with no path forward. Low likelihood (getSession reads local storage), but it's the launch gate.
- **Fix**: Add `.catch(() => { if (mounted) setLoading(false); })` so a failure falls through to the sign-in screen.
- **Decision**: FIXED — added a `.catch` that clears `loading` so a getSession failure falls through to the sign-in screen.

### F4 — Update/soft-delete don't guard against tombstoned rows

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Data safety)
- **Location**: src/data/meal-entries.repo.ts:62-84
- **Detail**: `updateMealEntry` / `softDeleteMealEntry` filter only by `id`, not `deleted_at IS NULL`, so an already-soft-deleted row can be re-updated or re-deleted. Harmless today (UI never surfaces deleted rows) but a defensive filter would prevent editing tombstones.
- **Fix**: Add `.is('deleted_at', null)` to both `.eq('id', id)` chains.
- **Decision**: FIXED — added `.is('deleted_at', null)` guard to both `updateMealEntry` and `softDeleteMealEntry`.

### F5 — Owner-setup doc placed outside the change folder

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: supabase/OWNER_SETUP.md
- **Detail**: Plan §5 said document the owner-creation step "in the change folder"; it lives in `supabase/OWNER_SETUP.md` instead. Content is correct and thorough — only the location differs. Arguably `supabase/` is the more discoverable home.
- **Fix**: Leave as-is (accept) or add a one-line pointer from the change folder / verification.md. No code impact.
- **Decision**: FIXED — added a pointer to supabase/OWNER_SETUP.md from verification.md's precondition.

### F6 — Sign-in error text uses a muted color

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/owner-sign-in.tsx:64
- **Detail**: Sign-in error renders with `themeColor="textSecondary"` (muted), not a danger color. The theme has no error token yet, so this is acceptable infra-UI, but a dedicated error color would read better. Follow-up when a danger token is added to the theme.
- **Fix**: Defer to a future theme-token addition, or inline a red for now.
- **Decision**: SKIPPED — deferred until a danger/error color token is added to the theme (infra UI, not feature UI).
