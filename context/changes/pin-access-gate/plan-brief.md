# PIN Access Gate — Plan Brief

> Full plan: `context/changes/pin-access-gate/plan.md`

## What & Why

FR-042: gate the app behind a user-set PIN so the owner's food photos and body-weight history stay private if a device is picked up by someone else. It's a deliberately weak, single-owner gate layered on top of the existing Supabase auth — not an auth stack — per the PRD's Access Control section.

## Starting Point

Today the app gates only on Supabase session: `src/app/_layout.tsx` renders `session ? <AppTabs/> : <OwnerSignIn/>`. `session.ts` already has a comment anticipating this feature ("Daily access is gated by the S-12 PIN, which will sit on top of this seam"). There's no PIN storage, no shared cross-component state (no Context anywhere in the repo), and no sign-out capability yet.

## Desired End State

Opening either client with a live Supabase session always requires a correct local PIN before the tabs render. A device with no PIN set is taken straight into PIN setup instead. The owner can change their PIN or lock the device on demand from Profile → Security, and a forgotten PIN is recovered by signing out and re-authenticating with Supabase, which returns to PIN setup.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| PIN storage | AsyncStorage, salted SHA-256 hash | Zero new dependencies, cross-platform with no `.web.ts` split; PIN is a convenience gate, not the root secret. |
| PIN scope | Per-device, set independently | Simplest — no schema change, no sync logic; fits the "convenience gate" framing. |
| PIN format | 6-digit numeric | User's explicit choice over 4-digit. |
| First-run setup | Forced immediately after first Supabase sign-in | FR-042 is must-have with no exception; guarantees the gate is never silently bypassed on a new device. |
| Unlock persistence | Indefinite, until manual lock | Matches the low actual stakes (single owner, convenience gate) — no timeout logic anywhere. |
| Failed attempts | Unlimited retries, no lockout | This gates convenience, not a real security boundary; the real secret is the Supabase credential behind it. |
| Change PIN | Settings action in Profile tab | Owner shouldn't need to sign out of Supabase just to rotate a PIN they still remember. |
| Native/web re-lock | Same rule everywhere: explicit "Lock now" only | No AppState/visibility-API wiring needed; fully consistent behavior across platforms. |
| Forgot-PIN recovery | "Forgot PIN?" link on the entry screen, signs out + clears local PIN | The only way to reach the recovery story OQ-8 already promised, since no other sign-out path exists in the app. |

## Scope

**In scope:**
- Device-local PIN storage (hash + salt + unlocked flag) via AsyncStorage
- PIN setup (first run) and entry (subsequent opens) screens
- Change-PIN and Lock-now actions in Profile
- Forgot-PIN recovery via Supabase sign-out + re-auth

**Out of scope:**
- Cross-device PIN sync
- Automatic re-lock timers or tab-visibility-based locking
- Lockout/backoff after failed attempts
- Biometric unlock
- A general-purpose "Sign out" settings action beyond the forgot-PIN path

## Architecture / Approach

A new `PinGateProvider`/`usePinGate()` React Context (the codebase's first Context — needed because `lock()`/`changePin()` must be reachable from the Profile tab, not just the root) owns a single AsyncStorage record `{ hash, salt, unlocked }`. `unlocked` is persisted, not just held in memory, since it must survive app restarts per the "indefinite until manual lock" decision. The gate slots into the existing root conditional in `_layout.tsx` (`session ? ... : <OwnerSignIn/>`), following the same "wait for loading, then swap one component" idiom already used for the session gate — no `expo-router` route-guard machinery needed.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. PIN gate state layer | Hashing, AsyncStorage record, `PinGateProvider`/`usePinGate()`, `signOutOwner()` | Forgetting to persist `unlocked` itself (not just in memory) — would silently break the "survives restart" requirement |
| 2. Gate UI wired into root layout | Setup/entry screen, wired into `_layout.tsx`, "Forgot PIN?" recovery | Forgot-PIN must both clear the local PIN *and* sign out of Supabase — doing only one leaves the owner stuck |
| 3. Profile Security section | Change-PIN screen, Lock-now action | Low risk — additive UI on an existing screen, reuses the established pushed-screen pattern |

**Prerequisites:** F-01 (synced data backbone) — already shipped/archived. No other blockers.
**Estimated effort:** ~1 session across 3 phases; no schema or backend changes.

## Open Risks & Assumptions

- Assumes `expo-crypto`'s `digestStringAsync` works on web only over a secure (HTTPS) origin — confirmed against the SDK 57 docs; local dev over `localhost` is treated as secure by browsers, so this shouldn't block development.
- No lockout means a found/unlocked device (or one where the 6-digit PIN is guessed) has no delay-based deterrent — accepted given the PIN is explicitly a convenience layer, not the real security boundary.

## Success Criteria (Summary)

- A live Supabase session never reaches `<AppTabs/>` without a correct local PIN having been entered (or set, on first run).
- The owner can lock the device on demand and change their PIN without leaving the app.
- A forgotten PIN is always recoverable via Supabase re-authentication, on both mobile and desktop web.
