<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Synced Data Backbone (F-01)

- **Plan**: context/changes/synced-data-backbone/plan.md
- **Mode**: Deep
- **Date**: 2026-07-20
- **Verdict**: REVISE → SOUND (all findings fixed in triage)
- **Findings**: 1 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | WARNING (via F1) → PASS after fix |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | FAIL (F1, F3) → PASS after fixes |
| Plan Completeness | WARNING (F4) → PASS after fix |

## Grounding
7/7 existing paths ✓ (src/app/_layout.tsx, package.json, CLAUDE.md, use-color-scheme.ts/.web.ts, theme.ts, .gitignore); _layout provider-nesting confirmed (ThemeProvider → AnimatedSplashOverlay + AppTabs) ✓; brief↔plan consistent ✓; Progress↔Phase 4/4 matched, no stray checkboxes ✓. Two issues surfaced during grounding (F2 .gitignore pattern, F1 env-runtime semantics).

## Findings

### F1 — Client can't obtain the owner session as described

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 §4 + Critical Implementation Details
- **Detail**: The plan required (a) password not in `EXPO_PUBLIC_`, (b) no login input, and (c) client reads credentials from `.env` — but the Expo client only inlines `EXPO_PUBLIC_` vars at runtime, so a non-public `.env` password is undefined on device/web, and with no input UI the app cannot sign in. Blocks the Phase 4 US-07 two-client walkthrough.
- **Fix A ⭐ Recommended**: Add a minimal one-time credential input to the bootstrap; reserve the non-public secret file for the Node smoke script.
  - Strength: Only runtime-viable sign-in path; doubles as the seam S-12's PIN sits on.
  - Tradeoff: Adds tiny infra UI to a "no feature UI" foundation.
  - Confidence: HIGH — matches Expo's EXPO_PUBLIC_ runtime rule.
  - Blind spot: None significant.
- **Fix B**: Dev-only `EXPO_PUBLIC_OWNER_*` auto-sign-in + hardening TODO.
  - Strength: Zero UI; immediate US-07 verification.
  - Tradeoff: Reintroduces the password into the shipped bundle until removed.
  - Confidence: HIGH — works but weakens the privacy stance.
  - Blind spot: Needs a tracked follow-up so the shortcut doesn't reach a hosted build.
- **Decision**: FIXED via Fix A — Phase 2 §4 now specifies a minimal one-time email/password input calling `signInWithPassword`, persisted thereafter; Critical Implementation Details clarifies the client only reads `EXPO_PUBLIC_` vars and the secret file is Node-script-only.

### F2 — .gitignore `.env*.local` does not ignore a bare `.env`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots (security)
- **Location**: Phase 2 §2
- **Detail**: Existing `.gitignore` (line 34) ignores `.env*.local` only; a bare `.env` is committable. The plan placed owner credentials in `.env`, risking a credential leak on first commit. Expo convention: `.env` is committed (public `EXPO_PUBLIC_`), `.env.local` is not.
- **Fix**: Put non-public owner credentials in `.env.local` (already ignored); keep only public `EXPO_PUBLIC_` values in `.env`.
- **Decision**: FIXED — Phase 2 §2 and Phase 4 §1 updated to use `.env.local` for secrets; `.env` holds public values only.

### F3 — Day-boundary timezone undefined for day queries

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 3 §3 (repo) + Phase 1 §2 (`logged_at`)
- **Detail**: `listMealEntriesForDay(date)` filters a `logged_at` (timestamptz) day range without defining the timezone of "the day"; UTC vs local changes which day a near-midnight entry lands in, and day-bucketing underpins sections, subtotals, budget, and trends.
- **Fix**: Define the day boundary as the owner's local timezone; client derives `[start, end)` UTC bounds, DB stays tz-agnostic.
- **Decision**: FIXED — Phase 1 §2 adds a day-boundary convention; Phase 3 §3's `listMealEntriesForDay` contract now converts a local date to UTC bounds per that convention.

### F4 — Client UUID generation dependency unlisted

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §2 + Phase 3 §3
- **Detail**: Schema allows a client-supplied UUID for optimistic insert, but RN has no global `crypto.randomUUID()` and no UUID source is in the dependency list (only `react-native-url-polyfill`).
- **Fix**: Add `expo-crypto` and use `Crypto.randomUUID()` in `createMealEntry`, or drop the client-UUID clause.
- **Decision**: FIXED via "Add expo-crypto" — Phase 3 §1 installs `expo-crypto`; §3 `createMealEntry` generates the id via `Crypto.randomUUID()` with the server default as fallback.
