# Personal Nutrition Tracker

A cross-platform (iOS / Android / web) **personal nutrition tracker** built around one
principle: **minimal manual input**. Capture a meal by photo, free-text description, or a
saved meal; a multimodal AI produces a rough-but-consistent calorie/macro estimate you
review and commit. It's a single-owner tool — no accounts, PIN-gated — whose success is
measured by *continuity* (logging every day) rather than lab-grade accuracy.

> Status: **early development.** The current app is still close to the Expo starter
> scaffold; product features are being built slice by slice from the roadmap. See
> `context/foundation/roadmap.md` for the sequence.

## What it does

- **Three capture paths into one estimate-and-log flow** — photograph a plate or a
  nutrition label, type a free-text description, or tap a saved meal.
- **Review before commit** — every AI estimate is shown with its assumptions and is
  editable; nothing is ever logged with a fabricated value.
- **Structured day** — five fixed sections (breakfast, snack, lunch, bite, supper) with
  per-section subtotals and a running daily total.
- **Dynamic calorie budget** — a sedentary-baseline target plus calories earned back from
  logged training, shown as a two-sided ledger (in / out / net).
- **Cross-device sync** — capture on the phone, review and edit on a desktop browser
  against the same private, single-owner data.
- **Trends** — intake vs. target and body-weight vs. goal over time.

The full product intent (vision, user stories, `FR-###` requirements) lives in
`context/foundation/prd.md`.

## Tech stack

- **App:** Expo SDK 57 (React Native 0.86, React 19.2) with `expo-router` typed routes;
  home-grown theming (`src/constants/theme.ts`, `ThemedText` / `ThemedView`).
- **Backend:** Supabase (Postgres + Storage) as a private, single-owner store, with a
  thin serverless proxy (planned) that keeps the AI key off-device.
- **Data layer:** a typed repository over `supabase-js` with TanStack Query
  (fetch-on-focus, cache persistence).

See `context/foundation/tech-stack.md` for the rationale.

## Getting started

```bash
npm install
npx expo start   # then press i / a / w for iOS / Android / web
npm run lint     # expo lint — run before pushing
```

Environment variables (Supabase URL + anon key) go in `.env` as `EXPO_PUBLIC_*` values;
secrets (never `EXPO_PUBLIC_`) go in the git-ignored `.env.local`.

## Project structure

```
src/
  app/            expo-router routes (file-based, typed)
  components/     UI + platform-specific files (*.web.tsx / *.tsx)
  constants/      theme (single source of truth)
  hooks/          color-scheme / theme hooks
supabase/         Supabase project (migrations, config) — added by the data backbone
context/          10x workflow: foundation docs (prd, tech-stack, roadmap) + changes/
```

`context/` is a project-management tree (product spec + per-change plans), not
application code.

## Access & privacy

Single owner, no multi-tenancy. Access is a PIN gate, not an auth stack. Food photos and
body-weight history stay private and under the owner's control; photos are retained as
evidence for estimates only and are never surfaced as an entry's displayed representation.
