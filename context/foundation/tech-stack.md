---
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
---

## Why this stack

A solo owner building a single-user nutrition tracker that must capture on the
phone (camera, gallery) yet stay reviewable on a desktop browser against the
same data (FR-040/FR-041) needs one codebase that compiles to iOS, Android, and
web. Expo (React Native) is the recommended default for `(mobile, js)`, clears
all four agent-friendly gates, and is bootstrapper-verified, so scaffolding is
smooth. The AI flag is set — vision + free-text estimation is the core loop
(FR-002/003/080) — and the standard-path Expo starter deliberately scaffolds the
client only, leaving the backend (cross-client sync FR-043, private photo/data
storage FR-007, and a server-side proxy that keeps the AI key off the device) as
the immediate next decision; Expo + Supabase + a thin serverless function is the
conventional, agent-friendly pairing. Auth is marked false: access is a
deliberate single-owner PIN gate with no account system (per Access Control), not
an auth stack to scaffold. Realtime is false — sync is required but eventual, with
up-to-one-hour outages tolerated. Deployment runs through Expo Go / a personal dev
build; CI on GitHub Actions with auto-deploy-on-merge, the starter's default shape.
