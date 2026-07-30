# PIN Access Gate Implementation Plan

## Overview

Add a device-local 6-digit PIN gate (FR-042) that sits between an authenticated Supabase owner session and the app's tab UI. Each device sets and stores its own PIN independently; once unlocked, a device stays unlocked indefinitely (even across restarts) until the owner explicitly locks it or forgets the PIN and recovers via Supabase re-authentication.

## Current State Analysis

The app currently gates only on Supabase auth: `src/app/_layout.tsx:20,32` calls `useOwnerSession()` and renders `session ? <AppTabs /> : <OwnerSignIn />` once `!loading`. `src/lib/session.ts:4` already anticipates this feature — *"Daily access is gated by the S-12 PIN, which will sit on top of this seam."* There is no routing-based gate anywhere (`Stack.Protected` is unused repo-wide); every gate in this codebase is a plain conditional swap of one top-level component for another. There is no PIN/local-secret storage, no shared cross-component state mechanism (no Context anywhere in `src/`), and no sign-out capability (`session.ts` only exports `signInOwner`).

### Key Discoveries:
- `src/app/_layout.tsx:26-34` — `PersistQueryClientProvider` and `ThemeProvider` wrap the whole tree unconditionally; the gate only needs to be inserted into the existing `session ? ... : ...` conditional, not to reorganize these providers.
- `src/lib/supabase.ts:19-24` vs `src/lib/supabase.web.ts` — the established precedent for "native needs an explicit storage adapter, web relies on browser defaults," but `@react-native-async-storage/async-storage` (already a dependency, used at `src/lib/supabase.ts:6` and `src/data/query-client.ts:4`) is itself cross-platform (shims to `localStorage` on web) and needs no `.web.ts` split.
- `expo-crypto` (`package.json`, already a native dependency per `src/lib/new-id.ts:4`) has a `digestStringAsync` (SHA-256) API that also works on web (confirmed against the SDK 57 docs), gated only by requiring a secure/HTTPS origin — so hashing needs no platform split either.
- No Context exists anywhere in this codebase — `useOwnerSession()` is called exactly once, at the root, and its result is thread down by conditional render, not shared. The PIN gate breaks that pattern out of necessity: `lock()` and `changePin()` must be callable from deep inside the Profile tab, which plain prop-threading from `_layout.tsx` can't reach.
- `src/app/(profile)/_layout.tsx:19` + `src/app/(profile)/weight.tsx` — the established pattern for a pushed settings-style screen within the Profile tab's own `Stack` (no `_layout.tsx` changes needed to add another sibling route).
- No sign-out capability exists anywhere (`src/lib/session.ts` only exports `signInOwner`). OQ-8's recovery promise ("recovered via the underlying owner Supabase credentials") is unreachable without adding one, since once `session` is truthy the app never renders `<OwnerSignIn />` again today.

## Desired End State

Opening the app on either client (mobile or desktop web), once a Supabase session exists, requires a correct local PIN before `<AppTabs />` renders. A device with no PIN yet is taken straight into PIN setup (choose + confirm) instead of the app. The Profile tab has a "Security" section to change the PIN or lock the device immediately. Forgetting the PIN is recovered by signing out of Supabase from the gate screen and re-authenticating, which lands back on PIN setup.

Verification: on a fresh device (no local PIN storage), sign in with owner credentials → land on PIN setup, not the tabs. Set a PIN → app unlocks into `<AppTabs />`. Force-quit and relaunch → still unlocked, no PIN prompt. From Profile → Security → "Lock now" → immediately back at PIN entry. Enter the PIN → unlocked again. From Profile → Security → "Change PIN" → wrong current PIN rejected, correct current PIN + matching new PIN succeeds. From the PIN entry screen, "Forgot PIN?" → returns to owner sign-in; signing back in returns to PIN setup (old PIN no longer valid).

## What We're NOT Doing

- No PIN sync across devices — each device's PIN is local and independent (per the per-device decision).
- No automatic re-lock on a timer/background/tab-visibility — unlock is indefinite until an explicit "Lock now" or a forgotten-PIN recovery.
- No lockout, rate-limiting, or escalating delay after wrong PIN attempts — unlimited retries.
- No biometric unlock (Face ID/Touch ID/fingerprint) — not requested, out of scope for this slice.
- No general-purpose "Sign out" settings action — the only sign-out entry point is the "Forgot PIN?" recovery link on the gate screen.
- No changes to `owner-sign-in.tsx`'s own UI or flow beyond it becoming reachable again after a forgot-PIN sign-out.

## Implementation Approach

Introduce a `PinGateProvider`/`usePinGate()` context (the codebase's first Context) that owns all PIN state and storage, mirroring `useOwnerSession()`'s shape (`loading` flag gating render, resolved once from storage on mount). Persist the salted PIN hash *and* the unlocked flag itself in AsyncStorage under one key, since "unlocked" must survive app restarts per the chosen UX — an in-memory-only flag would silently re-lock on every force-quit, contradicting the desired behavior. Wire the provider around the existing root conditional in `_layout.tsx`, add a `PinGateScreen` component that branches internally between setup and entry modes, and add a small Security section to the existing Profile screen for changing the PIN or locking on demand.

## Critical Implementation Details

### State sequencing

The `unlocked` flag must be persisted in the same AsyncStorage record as the PIN hash/salt, not held only in React state. The chosen UX is "stays unlocked indefinitely, even across restarts, until manually locked" — if `unlocked` lived only in memory, a force-quit would reset it to `false` on next launch and silently contradict that decision. `setPin`, `unlock` (on success), and `changePin` (on success) all write `unlocked: true`; `lock` and the forgot-PIN recovery path write/clear back to a locked state.

### Forgot-PIN recovery

There is no existing sign-out capability in the codebase (`session.ts` only exports `signInOwner`). The "Forgot PIN?" action on the entry-mode gate screen must both (a) clear the local PIN record (so the device returns to setup mode, not entry mode, once a session exists again) and (b) sign out of the Supabase session (so `src/app/_layout.tsx`'s outer conditional falls back to `<OwnerSignIn />`, which is otherwise unreachable once a session is live). Doing only one of the two leaves the owner stuck: clearing the PIN alone still shows `<AppTabs/>` immediately (no PIN to check against) which defeats the gate; signing out alone re-prompts sign-in but then re-enters entry mode with the same forgotten PIN still stored.

## Phase 1: PIN gate state layer

### Overview

Add the storage, hashing, and shared state (`PinGateProvider`/`usePinGate()`) that the rest of the feature builds on. No UI in this phase.

### Changes Required:

#### 1. PIN hashing helper

**File**: `src/lib/pin-crypto.ts`

**Intent**: Provide a salted SHA-256 hash for a PIN and a random salt generator, so no PIN is ever stored in plaintext. Cross-platform (native + web) with no `.web.ts` split needed, per the confirmed `expo-crypto` `digestStringAsync` web support.

**Contract**: Exports `generateSalt(): Promise<string>` and `hashPin(pin: string, salt: string): Promise<string>`, both built on `expo-crypto`'s `Crypto.getRandomBytesAsync` and `Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, ...)`.

#### 2. Sign-out capability

**File**: `src/lib/session.ts`

**Intent**: Add the missing sign-out primitive the forgot-PIN recovery path needs, mirroring the existing `signInOwner` wrapper.

**Contract**: New export `signOutOwner(): Promise<void>`, a thin wrapper over `supabase.auth.signOut()`, placed alongside `signInOwner` (`src/lib/session.ts:52-55`).

#### 3. PIN gate provider and hook

**File**: `src/lib/pin-gate.tsx`

**Intent**: Own the device-local PIN record (hash, salt, unlocked flag) in AsyncStorage, exposing it as shared state reachable from anywhere in the tree — the first Context in this codebase, needed because `lock()`/`changePin()` must be callable from the Profile tab, well below where `_layout.tsx` resolves session state today.

**Contract**: A single AsyncStorage key stores `{ hash: string; salt: string; unlocked: boolean } | null`. `PinGateProvider` reads it once on mount (mirroring `useOwnerSession`'s `loading` pattern at `src/lib/session.ts:18-30`) and exposes `usePinGate()` returning:
- `loading: boolean`, `hasPinSet: boolean`, `unlocked: boolean`
- `setPin(pin: string): Promise<void>` — first-run creation; hashes, persists with `unlocked: true`.
- `unlock(pin: string): Promise<boolean>` — compares hash; on match persists `unlocked: true` and returns `true`, otherwise leaves state untouched and returns `false`.
- `lock(): Promise<void>` — persists `unlocked: false`.
- `changePin(currentPin: string, nextPin: string): Promise<boolean>` — verifies `currentPin` against the stored hash; on match, hashes and persists `nextPin` with `unlocked: true`, returns `true`; on mismatch, returns `false` without changing anything.
- `clearPin(): Promise<void>` — wipes the stored record entirely (`hasPinSet` becomes `false`); used only by the forgot-PIN recovery path.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`

#### Manual Verification:

- N/A for this phase — no UI yet; verified indirectly through Phase 2's manual checks.

---

## Phase 2: Gate UI wired into root layout

### Overview

Build the PIN entry/setup screen and insert the gate into `_layout.tsx`'s existing conditional, so the app is unusable without a correct PIN once a Supabase session exists.

### Changes Required:

#### 1. Gate screen component

**File**: `src/components/pin-gate-screen.tsx`

**Intent**: A single component that branches on `hasPinSet` from `usePinGate()`: setup mode (no PIN yet) asks for a new 6-digit PIN plus a confirmation before calling `setPin`; entry mode asks for the existing PIN, calls `unlock`, and shows an inline error (clearing the input) on mismatch — no lockout, matching the earlier unlimited-retries decision. Entry mode also carries a "Forgot PIN?" link. Styled consistently with `src/components/owner-sign-in.tsx` (same `ThemedView`/`ThemedText`/`TextInput` primitives, no new component library).

**Contract**: Default-exported component, no props (reads everything from `usePinGate()`). The PIN input is numeric, exactly 6 digits, `secureTextEntry`. "Forgot PIN?" (entry mode only) calls `clearPin()` then `signOutOwner()` from `@/lib/session` — both must run so the device falls back to `<OwnerSignIn />` (session cleared) *and* comes back into setup mode rather than entry mode next time a session exists (per the Critical Implementation Details note above).

#### 2. Wire the gate into the root layout

**File**: `src/app/_layout.tsx`

**Intent**: Wrap the tree in `PinGateProvider` and extend the existing `session ? <AppTabs /> : <OwnerSignIn />` conditional (`src/app/_layout.tsx:32`) with the PIN-unlocked check, following the same "wait for loading, then swap one top-level component" idiom already used for the session gate.

**Contract**: `PinGateProvider` wraps at least everything currently inside `<ThemeProvider>` (so both `<AppTabs />` and the new gate screen can call `usePinGate()`). The render becomes `session ? (pinGated component) : <OwnerSignIn />`, where the pin-gated component waits on `usePinGate().loading` the same way the outer conditional waits on session `loading`, then renders `<PinGateScreen />` or `<AppTabs />` based on `unlocked`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`

#### Manual Verification:

- Fresh device (cleared app storage/localStorage), valid Supabase session: signing in lands on PIN setup, not the tabs.
- Setting a 6-digit PIN (with matching confirmation) unlocks into `<AppTabs />`.
- Setting a PIN with a non-matching confirmation shows an error and does not unlock.
- Force-quitting and relaunching the app after unlock stays unlocked (no PIN prompt), on both native and web.
- Entering the wrong PIN on a device with an existing PIN shows an inline error, clears the input, and allows unlimited retries.
- "Forgot PIN?" from the entry screen returns to the owner sign-in screen; signing back in with owner credentials lands on PIN setup again (not entry with the old PIN).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Profile Security section

### Overview

Give the owner an in-app way to change their PIN or lock the device immediately, without needing to force-quit or sign out.

### Changes Required:

#### 1. Security section on the Profile screen

**File**: `src/app/(profile)/index.tsx`

**Intent**: Add a "Security" section below the existing weight row (`src/app/(profile)/index.tsx:123-141`), following that same row/button visual pattern, with two actions: "Change PIN" (pushes the new route) and "Lock now" (calls `lock()` directly — no navigation, since the root layout's conditional reacting to `unlocked` becoming `false` is what shows the gate screen again).

**Contract**: Two `Pressable` rows styled like the existing `weightRow`/`smallButton` pattern (`src/app/(profile)/index.tsx:429-433`). "Lock now" calls `usePinGate().lock()` with no confirmation dialog (immediately reversible by re-entering the PIN).

#### 2. Change-PIN screen

**File**: `src/app/(profile)/pin-security.tsx`

**Intent**: A pushed screen (mirroring `src/app/(profile)/weight.tsx`'s `Stack.Screen` pattern) asking for the current PIN plus a new PIN and its confirmation, calling `changePin` from `usePinGate()`.

**Contract**: `Stack.Screen options={{ title: 'Change PIN' }}`. On `changePin` returning `false` (wrong current PIN), show an inline error and keep the form. On success, navigate back (`router.back()`) to Profile. The submit button enables once all three fields are the right length; new-PIN/confirmation equality is checked on submit, showing an inline error on mismatch — same validate-on-submit shape as the setup flow in Phase 2.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`

#### Manual Verification:

- Profile → Security → "Lock now" immediately shows the PIN entry screen; re-entering the correct PIN returns to the app.
- Profile → Security → "Change PIN" with the wrong current PIN shows an inline error and does not change anything.
- Profile → Security → "Change PIN" with the correct current PIN and a matching new PIN + confirmation succeeds, returns to Profile, and the new PIN (not the old one) is required on the next lock/unlock cycle.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

There is no test runner configured in this repo (`CLAUDE.md`: "no test runner configured"). Verification for all three phases relies on `npx tsc --noEmit`, `npm run lint`, and the manual steps listed per phase.

### Manual Testing Steps:

1. Clear local app storage (or use a fresh simulator/browser profile) with a valid Supabase session already configured.
2. Sign in with owner credentials → confirm PIN setup appears, not the tabs.
3. Set a PIN, confirm it unlocks into the app.
4. Force-quit/reload; confirm it stays unlocked.
5. Lock via Profile → Security, confirm the gate reappears; unlock again with the correct PIN.
6. Attempt an incorrect PIN a few times in a row; confirm no lockout, just an inline error each time.
7. Change the PIN via Profile → Security; confirm the old PIN no longer works and the new one does.
8. Use "Forgot PIN?" from the entry screen; confirm it returns to owner sign-in and, after re-authenticating, lands on PIN setup again.
9. Repeat steps 2–8 on both a native build and web to confirm parity (OQ-8: PIN gates both clients).

## Performance Considerations

Negligible — one AsyncStorage read on mount and one SHA-256 hash per PIN attempt, well within the app's existing "~3–8 entries/day, low volume" performance envelope (per the PRD's Non-Functional Requirements).

## Migration Notes

None — no schema or Supabase changes; this is entirely device-local state under a new AsyncStorage key.

## References

- PRD: `context/foundation/prd.md` (FR-042, Access Control section, OQ-8)
- Roadmap: `context/foundation/roadmap.md` (S-12)
- Existing session seam: `src/lib/session.ts:1-4`
- Existing sign-in UI pattern: `src/components/owner-sign-in.tsx`
- Existing root gate: `src/app/_layout.tsx:32`
- Existing pushed-settings-screen pattern: `src/app/(profile)/weight.tsx`, `src/app/(profile)/_layout.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: PIN gate state layer

#### Automated

- [x] 1.1 Type checking passes: `npx tsc --noEmit` — 08c3e09
- [x] 1.2 Linting passes: `npm run lint` — 08c3e09

### Phase 2: Gate UI wired into root layout

#### Automated

- [x] 2.1 Type checking passes: `npx tsc --noEmit` — 47bcb53
- [x] 2.2 Linting passes: `npm run lint` — 47bcb53

#### Manual

- [x] 2.3 Fresh device with valid Supabase session lands on PIN setup, not the tabs — 47bcb53
- [x] 2.4 Setting a matching 6-digit PIN + confirmation unlocks into the app — 47bcb53
- [x] 2.5 Non-matching confirmation shows an error and does not unlock — 47bcb53
- [x] 2.6 Unlock persists across force-quit/relaunch, on native and web — 47bcb53
- [x] 2.7 Wrong PIN shows an inline error, clears input, allows unlimited retries — 47bcb53
- [x] 2.8 "Forgot PIN?" returns to sign-in; re-authenticating lands on PIN setup again — 47bcb53

### Phase 3: Profile Security section

#### Automated

- [x] 3.1 Type checking passes: `npx tsc --noEmit` — cdc16f4
- [x] 3.2 Linting passes: `npm run lint` — cdc16f4

#### Manual

- [x] 3.3 "Lock now" immediately shows the PIN entry screen; correct PIN re-enters — cdc16f4
- [x] 3.4 "Change PIN" with wrong current PIN shows an inline error, changes nothing — cdc16f4
- [x] 3.5 "Change PIN" with correct current PIN + matching new PIN succeeds and takes effect — cdc16f4
