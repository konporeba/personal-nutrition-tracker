# CLAUDE.md

## Critical: Expo version

This project is on **Expo SDK 57** (React Native 0.86, React 19.2). Expo's APIs and router changed significantly in recent SDKs. **Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any Expo/router/native code** — do not rely on memory of older releases.

## What this is

A cross-platform (iOS / Android / web) **Personal Nutrition Tracker** — a single-user calorie/macro logger whose core loop is *minimal manual input*: capture a meal by photo, free text, or a saved meal, get an AI estimate, review, and log it. The full product intent lives in `context/foundation/prd.md` (vision, user stories, FR-### requirements) and `context/foundation/tech-stack.md`. The code currently in `src/` is still the **Expo starter scaffold** (Home/Explore demo screens) — the tracker features are not built yet.

Key product constraints from the PRD worth knowing before building features:
- Single owner, no accounts/multi-tenancy. Access is a PIN gate, not an auth stack.
- Never log a fabricated value — offer manual entry on unrecognized input.
- Calorie budget uses the **sedentary-baseline model**: profile activity is fixed at BMR/sedentary and every logged training session adds its burn explicitly (avoids double-counting).
- Planned backend (not yet scaffolded): Supabase + a thin serverless proxy that keeps the AI key off-device. Sync is required but eventual (up to ~1h staleness tolerated).

## Commands

- `npx expo start` — dev server; then `i` / `a` / `w` opens iOS / Android / web.
- `npm run lint` — `expo lint` (ESLint); run before pushing.
- `npm run reset-project` — moves the starter scaffold to `app-example/` and creates a blank `app` dir.

The `android` / `ios` / `web` scripts are thin `expo start --<platform>` aliases; see `@package.json` for the full list.

There is **no test runner configured** — the scaffold ships without Jest. Add one per https://docs.expo.dev/develop/unit-testing/ before writing tests.

## Architecture

**Routing** is file-based via `expo-router` with **typed routes** enabled (`app.json` → `experiments.typedRoutes`). Routes live in `src/app/`:
- `_layout.tsx` — root layout, wraps everything in `ThemeProvider` + `AppTabs`, controls the animated splash.
- `index.tsx` (Home), `explore.tsx` (Explore) — the two tab screens.

**Path aliases** (`tsconfig.json`): `@/*` → `src/*`, `@/assets/*` → `assets/*`. Always import with `@/`.

**Platform-specific files** are the central pattern here. Metro resolves `*.web.tsx` on web and the plain `*.tsx` elsewhere. Notable divergences:
- `app-tabs.tsx` uses native `NativeTabs` (`expo-router/unstable-native-tabs`); `app-tabs.web.tsx` builds a custom top tab bar with `expo-router/ui`. When touching navigation, update **both**.
- `use-color-scheme.ts` / `.web.ts`, `animated-icon.tsx` / `.web.tsx` follow the same split.

**Theming** is home-grown (no NativeWind/Tamagui despite comments mentioning them):
- `src/constants/theme.ts` is the single source of truth — `Colors` (light/dark), `Fonts` (per-platform), `Spacing` scale (`half`…`six`), `MaxContentWidth`, `BottomTabInset`.
- `useTheme()` resolves the active color set from the OS color scheme.
- Build UI from `ThemedText` (typographic `type` variants) and `ThemedView` (`type` = a background `ThemeColor`) rather than raw `Text`/`View`, and use the `Spacing` scale instead of magic numbers. React Compiler is enabled (`app.json` → `experiments.reactCompiler`).

**`context/`** is a `10x`-workflow project-management tree (`foundation/` docs + `changes/`), not application code. Treat it as the product spec / planning source, and note the many `/10x-*` skills available for that workflow.

TypeScript is `strict` — see `@tsconfig.json`.

## Data layer (Supabase backbone, F-01)

The app reads/writes a single-owner Supabase Postgres store. How to use and extend it:

- **Never touch `supabase` directly from UI.** Go through the repository seam in `src/data/*.repo.ts` (e.g. `meal-entries.repo.ts`). That's the one place query logic lives — screens, scripts, and later slices all reuse it.
- **The client** is platform-split: `src/lib/supabase.ts` (native, AsyncStorage + `AppState` auto-refresh) / `src/lib/supabase.web.ts` (browser storage). Always import as `@/lib/supabase`.
- **Every table carries** `owner_id` + sync fields (`created_at`, `updated_at`, `deleted_at`) and has RLS scoping all rows to `owner_id = auth.uid()`. `updated_at` is set by a server `BEFORE UPDATE` trigger (last-write-wins), never by the client.
- **Always filter `deleted_at IS NULL` on reads.** Deletes are soft (set `deleted_at`), never hard — this is what lets a delete propagate across clients without resurrecting from stale cache.
- **Day bucketing:** `logged_at` is an absolute `timestamptz`; "the day" is computed client-side in the owner's local tz (`listMealEntriesForDay` converts a local date to a `[start, end)` UTC range). The DB stays tz-agnostic.
- **Client-generated ids:** use `@/lib/new-id` (`newId()`), platform-split so native uses `expo-crypto` and web/Node use the global `crypto.randomUUID()`.
- **Reads use TanStack Query** with AsyncStorage persistence + fetch-on-focus (`src/data/query-client.ts`, `query-runtime[.web].ts`), wired in `src/app/_layout.tsx`. Cross-client freshness is fetch-on-focus (no Realtime).
- **Add a new table** via a new `supabase/migrations/*.sql` file (schema + RLS + the sync fields + trigger), then a matching `src/data/<name>.repo.ts`. The owner session is bootstrapped once via `src/lib/session.ts` + `src/components/owner-sign-in.tsx`.
- **Verify** the store with `npm run smoke` (see `context/changes/synced-data-backbone/verification.md`). Owner credentials for the script live in git-ignored `.env.local`; public `EXPO_PUBLIC_*` values live in `.env`.
