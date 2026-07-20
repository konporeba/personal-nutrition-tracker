---
bootstrapped_at: 2026-07-19T17:22:05Z
starter_id: expo
starter_name: Expo (React Native)
project_name: personal-nutrition-tracker
language_family: js
package_manager: npm
cwd_strategy: subdir-then-move
bootstrapper_confidence: verified
phase_3_status: ok
audit_command: npm audit --json
---

## Hand-off

Verbatim copy of the frontmatter and rationale from `context/foundation/tech-stack.md`:

```yaml
starter_id: expo
package_manager: npm
project_name: personal-nutrition-tracker
hints:
  language_family: js
  team_size: solo
  deployment_target: expo-go
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: verified
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: false
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
```

> **Why this stack** — A solo owner building a single-user nutrition tracker that must capture on the phone (camera, gallery) yet stay reviewable on a desktop browser against the same data (FR-040/FR-041) needs one codebase that compiles to iOS, Android, and web. Expo (React Native) is the recommended default for `(mobile, js)`, clears all four agent-friendly gates, and is bootstrapper-verified, so scaffolding is smooth. The AI flag is set — vision + free-text estimation is the core loop (FR-002/003/080) — and the standard-path Expo starter deliberately scaffolds the client only, leaving the backend (cross-client sync FR-043, private photo/data storage FR-007, and a server-side proxy that keeps the AI key off the device) as the immediate next decision; Expo + Supabase + a thin serverless function is the conventional, agent-friendly pairing. Auth is marked false: access is a deliberate single-owner PIN gate with no account system (per Access Control), not an auth stack to scaffold. Realtime is false — sync is required but eventual, with up-to-one-hour outages tolerated. Deployment runs through Expo Go / a personal dev build; CI on GitHub Actions with auto-deploy-on-merge, the starter's default shape.

## Pre-scaffold verification

| Signal      | Value                                             | Severity | Notes                                             |
| ----------- | ------------------------------------------------- | -------- | ------------------------------------------------- |
| npm package | create-expo-app v4.0.0 published 2026-05-15       | fresh    | resolved from cmd_template (`npx create-expo-app`) |
| GitHub repo | not run                                           | —        | card docs_url (https://docs.expo.dev) is not a GitHub repo — no push signal available |

## Scaffold log

**Resolved invocation**: `npx create-expo-app .bootstrap-scaffold --yes --template default`
**Strategy**: subdir-then-move
**Exit code**: 0
**Files moved**: 14 top-level entries (`.claude`, `.gitignore`, `.vscode`, `AGENTS.md`, `app.json`, `assets`, `CLAUDE.md`, `LICENSE`, `node_modules`, `package.json`, `package-lock.json`, `README.md`, `scripts`, `src`, `tsconfig.json`)
**Conflicts (.scaffold siblings)**: none — cwd root held only `context/`, so no path clashed
**.gitignore handling**: moved silently (no `.gitignore` existed in cwd)
**.bootstrap-scaffold cleanup**: deleted
**Note**: `create-expo-app` auto-initialized a fresh `.git/` repo inside the scaffold. Per this skill's principle that git management is the user's own (bootstrapper does not initialize git history), `.bootstrap-scaffold/.git/` was removed before the move-up. `context/foundation/10x-build-playbook.md` was verified intact (9114 bytes) — it lives under `context/`, which the conflict policy never overwrites.
**Note**: the Expo default template ships its own `AGENTS.md` and `CLAUDE.md`. These are starter-authored files moved as-is; bootstrapper v1 did not generate or modify them.

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 0 HIGH, 11 MODERATE, 0 LOW
**Direct vs transitive**: 0/0/0/0 direct of total 0/0/11/0 — all 11 moderate findings are transitive.

#### CRITICAL findings

None.

#### HIGH findings

None.

#### MODERATE findings

All 11 moderate findings stem from a single transitive advisory cluster:

- **uuid** (`<11.1.1`) — advisory GHSA-class issue (npm severity: moderate; CVSS 7.5). Pulled in transitively; not a direct dependency. Effects propagate through `xcode` → `@expo/config-plugins` and related Expo build tooling, which accounts for the multiple counted entries.
- **Fix available**: `expo` major-version bump (`fixAvailable.isSemVerMajor: true`). Not applied — bootstrapper does not auto-patch. This is a routine advisory state for a fresh Expo tree; address at your own risk tolerance (e.g., `npm audit` for the full report, or defer until an Expo upgrade).

#### LOW / INFO findings

None.

## Hints recorded but not acted on

| Hint                    | Value              |
| ----------------------- | ------------------ |
| bootstrapper_confidence | verified           |
| quality_override        | false              |
| path_taken              | standard           |
| self_check_answers      | null               |
| team_size               | solo               |
| deployment_target       | expo-go            |
| ci_provider             | github-actions     |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | false              |
| has_payments            | false              |
| has_realtime            | false              |
| has_ai                  | true               |
| has_background_jobs     | false              |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history. The Expo-authored `.git/` was intentionally removed during scaffolding.
- Review the starter-shipped `AGENTS.md` and `CLAUDE.md` and decide whether to keep, edit, or replace them.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log (all transitive, no critical/high).
- The core backend (cross-client sync, private photo/data storage, and a server-side AI proxy) is not part of the client-only Expo scaffold. Expo + Supabase + a thin serverless function is the recommended next build — see the `## Why this stack` note above.
