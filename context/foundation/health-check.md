---
project: personal-nutrition-tracker
checked_at: 2026-07-19T17:25:00Z
health_status: needs-attention
context_type: brownfield
language_family: js
stack_assessment_available: false
checks_run:
  - lockfile
  - dependency_audit
  - outdated_deps
  - test_runner
  - ci_cd
  - configuration
audit_findings:
  critical: 0
  high: 0
  moderate: 11
  low: 0
test_runner_detected: false
ci_provider: null
recommended_fixes: 7
---

# Health Check — personal-nutrition-tracker

Freshly bootstrapped Expo (React Native) project. This check runs against the scaffold as it stands right after `/10x-bootstrapper`, before any feature work.

## Dependency Health

### Lockfile

```
Status: present (package-lock.json)
Package manager: npm
```

Dependency versions are pinned — builds are reproducible and an agent can reason about exact dependency state.

### Security Audit

```
Tool: npm audit --json
Summary: 0 CRITICAL, 0 HIGH, 11 MODERATE, 0 LOW
Direct vs transitive: 0 direct / 11 transitive
```

MODERATE findings (all transitive, one advisory cluster):

- **uuid** (`<11.1.1`) — pulled in transitively via Expo build tooling (`uuid → xcode → @expo/config-plugins`), which accounts for all 11 counted entries. npm severity: moderate (CVSS 7.5). The offered fix is a **major Expo version bump** (`fixAvailable.isSemVerMajor: true`). Not actionable in isolation — this is a routine advisory state for a current Expo SDK tree and resolves when Expo upstream updates the dependency. No direct dependency is affected.

### Outdated Dependencies

```
Packages with major version gaps: 2 (both Expo-SDK-managed — do not bump manually)
```

- **typescript**: 6.0.3 → 7.0.2 (1 major behind; pinned by Expo's `~6` range)
- **react-native-gesture-handler**: 2.32.0 → 3.1.0 (1 major behind; pinned by the Expo SDK)

The remaining gaps (react 19.2.3→19.2.7, react-native-screens, safe-area-context, reanimated, worklets) are patch/minor. **Important:** every dependency here is version-locked to the installed Expo SDK. Do not `npm update` these individually — that breaks SDK compatibility. Use `npx expo install --check` and `npx expo-doctor` to align versions the Expo-supported way.

## Test Suite

```
Test runner: not detected
Tests found: not applicable
Test execution: not attempted
```

⚠ **No test runner detected.** The Expo default template ships no test setup — there is no test script in `package.json`, no test framework in devDependencies, and no `vitest`/`jest`/`playwright` config. This is the single most important gap for agent-assisted development: **without a test harness, the agent cannot verify its own changes.**

Recommended: add `jest-expo` (the Expo-native Jest preset, best-supported for React Native), then a `test` script. See Category A fix #1.

## CI/CD

```
Provider: not detected
Configuration: not found
```

ℹ No CI/CD configuration detected. You'll set this up in the infrastructure and deployment lesson. For now, a local test runner is sufficient for agent collaboration. (The Expo-authored `.git/` was removed during bootstrap, so there is no repo yet either — `git init` is your first step.)

## Configuration

### High severity

None. `tsconfig.json` has `strict: true` (extends `expo/tsconfig.base`), and `.gitignore` is present — the two high-impact items are both in good shape.

### Medium severity

- **No code formatter configured** — no `.prettierrc`, `biome.json`, or equivalent. `expo lint` (present as a script) covers lint rules but not formatting. Without a formatter, an agent's output style drifts across edits. Fix: add Prettier (see Category A #3).
- **ESLint config not materialized** — the `lint` script runs `expo lint` (eslint-config-expo), but no `eslint.config.js` is committed yet; it's generated on first run. Fix: run `npx expo lint` once to write the config (Category A #4).

### Low severity

- **`.editorconfig` missing** — cross-editor formatting consistency. Fix: add a minimal `.editorconfig`.
- **`.env.example` missing** — no documented environment variables yet. Will matter soon: the planned backend (Supabase URL/key, the AI provider key behind a server proxy) needs documented env vars. Fix: add `.env.example` when those land.

### Note — package identity

`package.json` still carries `"name": "bootstrap-scaffold"` — a leftover from the temp scaffold directory. Tooling and the agent read this name. Rename it to `personal-nutrition-tracker` (Category A #2).

## Stack Assessment Cross-Reference

No stack-assessment.md found. Run /10x-stack-assess for quality-gate analysis. (Note: Expo/TypeScript already clears the four agent-friendly gates — typed, convention-based, popular, well-documented — per the tech-stack selection, so a formal stack-assess is optional here.)

## Recommended Fixes

### Fix before agent work (Category A)

### 1. No test runner

**Impact**: The agent cannot verify its own changes without a way to run tests — the single biggest reliability lever for agent-assisted work.
**Severity**: high
**Effort**: moderate (15–30 min)
**Fix**:

```bash
npx expo install jest-expo jest react-test-renderer --dev
```

Then add to `package.json` scripts: `"test": "jest"`, and create a `jest.config.js` with `{ preset: 'jest-expo' }`. Write one smoke test (render `src/app/index.tsx`) to confirm the harness runs.

### 2. Stale package name

**Impact**: `package.json` name is `bootstrap-scaffold`; agents and tooling key off this identity.
**Severity**: low
**Effort**: quick (< 5 min)
**Fix**: change `"name": "bootstrap-scaffold"` to `"name": "personal-nutrition-tracker"` in `package.json`.

### 3. No code formatter

**Impact**: Inconsistent formatting across agent edits creates noisy diffs and review friction.
**Severity**: medium
**Effort**: moderate (15–30 min)
**Fix**:

```bash
npx expo install prettier eslint-config-prettier --dev
```

Add a `.prettierrc` and a `"format": "prettier --write ."` script; wire `eslint-config-prettier` into the ESLint config so lint and format don't conflict.

### 4. ESLint config not committed

**Impact**: Lint rules aren't materialized to a file, so the agent can't see or extend them.
**Severity**: low
**Effort**: quick (< 5 min)
**Fix**: run `npx expo lint` once — it generates `eslint.config.js` using `eslint-config-expo`. Commit the result.

### 5. Missing `.env.example`

**Impact**: Undocumented environment configuration; the coming backend (Supabase + AI proxy) needs documented keys, and agents shouldn't guess variable names.
**Severity**: low
**Effort**: quick (< 5 min)
**Fix**: add a `.env.example` with placeholder keys as they're introduced (e.g. `EXPO_PUBLIC_SUPABASE_URL=`, `EXPO_PUBLIC_SUPABASE_ANON_KEY=`). Keep real secrets out of the client bundle — the AI provider key belongs on the server proxy, not in any `EXPO_PUBLIC_*` var.

### 6. Missing `.editorconfig`

**Impact**: Minor consistency across editors.
**Severity**: low
**Effort**: quick (< 5 min)
**Fix**: add a minimal `.editorconfig` (indent style/size, final newline, charset).

### 7. Align dependencies the Expo way (do not manual-bump)

**Impact**: Outdated pins exist, but manual `npm update` breaks Expo SDK compatibility; the moderate audit findings also resolve through Expo, not npm.
**Severity**: low
**Effort**: quick (< 5 min)
**Fix**: run `npx expo install --check` and `npx expo-doctor` to see and apply SDK-aligned versions. Do not bump `typescript`, `react`, or `react-native-*` outside these tools.

### Addressed in upcoming lessons (Category B)

### CI/CD pipeline

**Lesson**: [Sprint Zero z Agentem: infrastruktura, walking skeleton i pierwszy deploy (M1L5)](https://platforma.przeprogramowani.pl/external/10xdevs-3/m1-l5)
**What you'll do there**: stand up a GitHub Actions pipeline (lint, type-check, test, build) and your first deploy — matching the `github-actions` + auto-deploy-on-merge choices recorded in the tech-stack hand-off.

### Agent instruction files (AGENTS.md / CLAUDE.md)

**Lesson**: [Agent Onboarding: Agents.md, AI Rules i feedback loops (M1L4)](https://platforma.przeprogramowani.pl/external/10xdevs-3/m1-l4)
**What you'll do there**: author real agent context. The Expo template shipped stub `AGENTS.md` and `CLAUDE.md` files — leave them for now; the onboarding lesson builds them with the right content rather than a premature stub.

## Summary

Health status: **needs-attention**

The project has a genuinely clean foundation: pinned lockfile, zero critical/high security advisories (the 11 moderate findings are all transitive and Expo-managed), strict TypeScript, and a `.gitignore` in place. The one Category A gap that matters is the **absence of a test runner** — until that's fixed, the agent has no automated way to verify its work — alongside a few quick hygiene fixes (a formatter, the stale package name, environment-variable documentation). Nothing here is alarming for a day-one Expo scaffold.

Next step: knock out the quick fixes and set up `jest-expo`, then proceed to agent onboarding. CI/CD and real agent-instruction files come in the next lessons — they're expected gaps at this stage, not problems.
